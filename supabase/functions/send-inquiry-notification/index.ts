// deno-lint-ignore-file no-explicit-any
// Edge function: send-inquiry-notification
//
// Emails the team when a guest sends a retreat inquiry (from a retreat's page)
// or a custom-retreat request. Called only by the notify_retreat_inquiry
// database trigger, which signs the call with a secret only the database
// holds. Replying to the email goes straight to the guest.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { emailHead } from "../_shared/email-layout.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-notify-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TABLES = new Set(["retreat_inquiries", "custom_retreat_inquiries"]);
const TEAM = ["info@spaholis.com", "spaholisma@gmail.com"];
const FROM_ADDRESS = "Holis Wellness <info@spaholis.com>";
const ADMIN_URL = "https://www.spaholis.com/admin";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const crTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: "America/Costa_Rica", dateStyle: "medium", timeStyle: "short" });

const niceDate = (d: string | null) =>
  d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }) : "";

/** One table row; skipped when there is nothing to show. `html` is already safe. */
function row(label: string, html: string) {
  if (!html) return "";
  return `<tr><td class="k" style="padding:8px 0;color:#7a7a72;font-size:13px;width:38%;vertical-align:top">${esc(label)}</td>` +
    `<td class="v" style="padding:8px 0;color:#2d2d2a;font-size:14px;vertical-align:top">${html}</td></tr>`;
}

/** The table of what the guest sent. */
function detailsBlock(rows: string) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="t">${rows}</table>`;
}

/** Their own words, when they wrote any. */
function messageBlock(message: string, messageLabel: string) {
  return message ? `<p style="margin:18px 0 6px;color:#7a7a72;font-size:13px">${esc(messageLabel)}</p>
          <div style="background:#f4f1ec;border-radius:12px;padding:14px 16px;color:#2d2d2a;font-size:14px;line-height:1.55;white-space:pre-line">${esc(message)}</div>` : "";
}

const FOOT = `<p class="foot" style="margin:22px 0 0;color:#7a7a72;font-size:12px;line-height:1.5">Reply to this email to answer the guest directly.
          Update the status in <a href="${ADMIN_URL}" style="color:#5e7d67">Admin</a>.</p>`;

function shell(eyebrow: string, title: string, rows: string, message: string, messageLabel: string) {
  return page(eyebrow, title, `${detailsBlock(rows)}
          ${messageBlock(message, messageLabel)}
          ${FOOT}`);
}

function page(eyebrow: string, title: string, inner: string) {
  return `<!doctype html><html lang="en">${emailHead(title)}
  <body style="margin:0;background:#f4f1ec;font-family:Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="wrap" style="background:#f4f1ec;padding:28px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden">
        <tr><td class="head" style="background:#7d9a85;padding:22px 28px">
          <p style="margin:0;color:#eef3ef;font-size:11px;letter-spacing:2px;text-transform:uppercase">${esc(eyebrow)}</p>
          <h1 class="h1" style="margin:6px 0 0;color:#ffffff;font-size:22px;font-weight:600">${esc(title)}</h1>
        </td></tr>
        <tr><td class="pad" style="padding:22px 28px">
          ${inner}
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

async function sendEmail(subject: string, html: string, replyTo?: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return { ok: false, error: "email_config_missing" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ from: FROM_ADDRESS, to: TEAM, subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
  });
  if (!res.ok) return { ok: false, error: `resend_${res.status}: ${await res.text()}` };
  return { ok: true };
}

// Editable in Admin → Client Emails → Team notifications. The layout stays
// here; subject, the small heading and the wording come from the template.
type Template = { subject: string; heading: string; body_html: string };

async function loadTemplate(supabase: any, key: string): Promise<Template | null> {
  try {
    const { data } = await supabase
      .from("email_templates").select("subject, heading, body_html, enabled")
      .eq("template_key", key).maybeSingle();
    if (!data || data.enabled === false) return null;
    return { subject: data.subject, heading: data.heading, body_html: data.body_html };
  } catch {
    return null;
  }
}

const interpolate = (str: string, vars: Record<string, string>) =>
  String(str ?? "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => (k in vars ? String(vars[k] ?? "") : ""));

function fromTemplate(
  tpl: Template, title: string, text: Record<string, string>, raw: Record<string, string>,
) {
  const vars: Record<string, string> = { ...raw };
  for (const [k, v] of Object.entries(text)) vars[k] = esc(v);
  return {
    subject: interpolate(tpl.subject, { ...raw, ...text }),
    html: page(interpolate(tpl.heading, vars), title, interpolate(tpl.body_html, vars)),
  };
}

const mail = (email: string) => (email ? `<a href="mailto:${esc(email)}" style="color:#5e7d67">${esc(email)}</a>` : "");

function retreatEmail(r: any, tpl: Template | null) {
  const name = `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim();
  const rows =
    row("Retreat", esc(r.retreat_title)) +
    row("Name", esc(name)) +
    row("Email", mail(r.email)) +
    row("Phone", esc(r.phone)) +
    row("Preferred start", esc(niceDate(r.preferred_start_date))) +
    row("Guests", esc(r.number_of_guests)) +
    row("Room", esc(r.occupancy_type)) +
    row("Accommodation", r.with_accommodation === false ? "Without accommodation" : "With accommodation") +
    row("Received", esc(crTime(r.created_at)));
  if (tpl) {
    return fromTemplate(tpl, r.retreat_title || "Retreat inquiry",
      { retreat_title: r.retreat_title || "Retreat", guest_name: name },
      { details: detailsBlock(rows), message: messageBlock(r.message ?? "", "Message") });
  }
  return {
    subject: `New retreat inquiry — ${r.retreat_title || "Retreat"} · ${name}`,
    html: shell("New retreat inquiry", r.retreat_title || "Retreat inquiry", rows, r.message ?? "", "Message"),
  };
}

function customEmail(r: any, tpl: Template | null) {
  const list = (v: unknown) => (Array.isArray(v) && v.length ? esc(v.join(", ")) : "");
  const rows =
    row("Name", esc(r.full_name)) +
    row("Email", mail(r.email)) +
    row("Phone", esc(r.phone)) +
    row("Group", esc(r.group_type)) +
    row("Participants", esc(r.num_participants)) +
    row("Arrival", esc(niceDate(r.arrival_date))) +
    row("Departure", esc(niceDate(r.departure_date))) +
    row("Preferred dates", esc(r.preferred_dates)) +
    row("Flexible dates", r.flexible_dates ? "Yes" : "No") +
    row("Length of stay", esc(r.length_of_stay)) +
    row("Budget", esc(r.budget_range)) +
    row("Intention", list(r.retreat_vision)) +
    row("Activities", list(r.preferred_activities)) +
    row("Received", esc(crTime(r.created_at)));
  if (tpl) {
    return fromTemplate(tpl, r.full_name || "Custom retreat",
      { guest_name: r.full_name || "Guest" },
      { details: detailsBlock(rows), message: messageBlock(r.special_requests ?? "", "Special requests") });
  }
  return {
    subject: `New custom retreat request — ${r.full_name || "Guest"}`,
    html: shell("Custom retreat request", r.full_name || "Custom retreat", rows, r.special_requests ?? "", "Special requests"),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, reason: "method_not_allowed" }, 405);

  let body: any = {};
  try { body = await req.json(); } catch { return json({ ok: false, reason: "invalid_json" }, 400); }
  if (!TABLES.has(body?.table) || typeof body?.id !== "string" || !UUID_RE.test(body.id)) {
    return json({ ok: false, reason: "invalid_body" }, 400);
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: secret } = await supabase.from("internal_secrets").select("value").eq("name", "booking_notify").maybeSingle();
  if (!secret?.value || req.headers.get("x-notify-secret") !== secret.value) {
    return json({ ok: false, reason: "forbidden" }, 403);
  }

  try {
    const { data: inquiry, error } = await supabase.from(body.table).select("*").eq("id", body.id).maybeSingle();
    if (error) throw error;
    if (!inquiry) return json({ ok: false, reason: "not_found" }, 404);

    const isRetreat = body.table === "retreat_inquiries";
    const tpl = await loadTemplate(supabase, isRetreat ? "team_retreat_inquiry" : "team_custom_retreat");
    const { subject, html } = isRetreat ? retreatEmail(inquiry, tpl) : customEmail(inquiry, tpl);
    const sent = await sendEmail(subject, html, inquiry.email || undefined);
    if (!sent.ok) console.error("[send-inquiry-notification] email failed", sent.error);
    return json({ ok: sent.ok, warning: sent.ok ? undefined : sent.error });
  } catch (err) {
    console.error("[send-inquiry-notification] failed", (err as Error).message);
    return json({ ok: false, reason: "failed" }, 500);
  }
});
