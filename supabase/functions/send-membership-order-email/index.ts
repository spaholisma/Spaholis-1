// deno-lint-ignore-file no-explicit-any
// Edge function: send-membership-order-email
//
// Sends the "your membership is ready — schedule your classes" email when an
// admin creates a membership/pass order (Acuity-style). Emails the customer AND
// a copy to the admin, via Resend (same setup as send-booking-notification).
//
// Body: { userOfferingId: "<uuid>" }
// The scheduling link carries the offering's secure access_token so the customer
// books eligible classes at $0 without logging in or typing a code.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ADMIN_EMAIL = "info@spaholis.com";
const ADMIN_BACKUP_EMAIL = "spaholisma@gmail.com";
const FROM_ADDRESS = "Holis Wellness <info@spaholis.com>";
const SITE_URL = "https://spaholis.com";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function sendEmail(to: string, subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) return { ok: false, error: "email_config_missing" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({ from: FROM_ADDRESS, to, subject, html }),
  });
  if (!res.ok) return { ok: false, error: await res.text() };
  return { ok: true };
}

const esc = (s: string) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---- Editable templates (public.email_templates) --------------------------
// Admins edit subject/heading/body in the "Client Emails" panel. We load the
// row, interpolate {{variables}}, and wrap the body in the branded shell. If a
// row is missing or disabled we fall back to the built-in copy below, so email
// delivery never depends on the table.
type Template = { subject: string; heading: string; body_html: string };

async function loadTemplate(supabase: any, key: string): Promise<Template | null> {
  try {
    const { data } = await supabase
      .from("email_templates")
      .select("subject, heading, body_html, enabled")
      .eq("template_key", key)
      .maybeSingle();
    if (!data || data.enabled === false) return null;
    return { subject: data.subject, heading: data.heading, body_html: data.body_html };
  } catch (_e) {
    return null;
  }
}

function interpolate(str: string, vars: Record<string, string>): string {
  return String(str ?? "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => (k in vars ? String(vars[k] ?? "") : ""));
}

function renderShell(heading: string, inner: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
  <body style="font-family:Arial,sans-serif;background:#f5f1ec;padding:20px;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">
      <div style="background:#2F2F2F;padding:28px;text-align:center;">
        <h1 style="color:#F5F1EC;font-size:22px;margin:0;">${heading}</h1>
      </div>
      <div style="padding:28px;color:#2F2F2F;">${inner}</div>
      <div style="background:#f5f1ec;padding:16px;text-align:center;font-size:12px;color:#666;">
        Holis Wellness Center · spaholis.com
      </div>
    </div>
  </body></html>`;
}

// textVars are HTML-escaped; rawVars ({{details}}, {{button}}, {{schedule_link}})
// are trusted HTML/URLs we build ourselves.
function buildFromTemplate(
  tpl: Template,
  textVars: Record<string, string>,
  rawVars: Record<string, string>,
): { subject: string; html: string } {
  const vars: Record<string, string> = { ...rawVars };
  for (const [k, v] of Object.entries(textVars)) vars[k] = esc(v);
  return {
    subject: interpolate(tpl.subject, vars),
    html: renderShell(interpolate(tpl.heading, vars), interpolate(tpl.body_html, vars)),
  };
}

function offeringDetailsHtml(o: any): string {
  const entitlement = o.is_unlimited
    ? "Unlimited classes"
    : `${o.credits_remaining ?? 0} class credit${(o.credits_remaining ?? 0) === 1 ? "" : "s"}`;
  const validity = o.expires_at
    ? `<p style="margin:4px 0;color:#666;font-size:14px;">Valid until ${new Date(o.expires_at).toLocaleDateString()}</p>`
    : "";
  const codeLine = o.access_token
    ? `<p style="margin:8px 0 0;color:#666;font-size:13px;">Reference code: <strong style="letter-spacing:1px;">${esc(o.code)}</strong></p>`
    : "";
  return `<div style="background:#f3f6f6;border-radius:12px;padding:16px;margin:16px 0;">
    <p style="margin:0 0 4px;font-weight:bold;">${esc(o.name_snapshot)}</p>
    <p style="margin:4px 0;color:#334155;font-size:14px;">${entitlement}</p>
    ${validity}${codeLine}
  </div>`;
}

function ctaButton(label: string, url: string): string {
  return `<p style="text-align:center;margin:24px 0;"><a href="${url}" style="background:#1d5b6a;color:#fff;text-decoration:none;padding:14px 28px;border-radius:9999px;font-weight:bold;font-size:16px;display:inline-block;">${label}</a></p>`;
}

function customerHtml(o: any, link: string): string {
  const firstName = String(o.guest_name || "").trim().split(/\s+/)[0] || "there";
  const entitlement = o.is_unlimited
    ? "Unlimited classes"
    : `${o.credits_remaining ?? 0} class credit${(o.credits_remaining ?? 0) === 1 ? "" : "s"}`;
  const validity = o.expires_at
    ? `<p style="margin:4px 0;color:#666;font-size:14px;">Valid until ${new Date(o.expires_at).toLocaleDateString()}</p>`
    : "";
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2937;">
    <h1 style="font-size:22px;margin:0 0 8px;">Hi ${esc(firstName)}, your membership is ready 🌿</h1>
    <p style="font-size:15px;line-height:1.5;">Thank you! Your <strong>${esc(o.name_snapshot)}</strong> is active.</p>
    <div style="background:#f3f6f6;border-radius:12px;padding:16px;margin:16px 0;">
      <p style="margin:0 0 4px;font-weight:bold;">${esc(o.name_snapshot)}</p>
      <p style="margin:4px 0;color:#334155;font-size:14px;">${entitlement}</p>
      ${validity}
      <p style="margin:8px 0 0;color:#666;font-size:13px;">Reference code: <strong style="letter-spacing:1px;">${esc(o.code)}</strong></p>
    </div>
    <p style="font-size:15px;line-height:1.5;">Click below to book any eligible class — the credit is applied automatically, so your total is <strong>$0</strong>. No login or code needed.</p>
    <p style="text-align:center;margin:24px 0;">
      <a href="${link}" style="background:#1d5b6a;color:#fff;text-decoration:none;padding:14px 28px;border-radius:9999px;font-weight:bold;font-size:16px;display:inline-block;">Schedule your classes</a>
    </p>
    <p style="font-size:13px;color:#666;line-height:1.5;">Or paste this link into your browser:<br><span style="word-break:break-all;">${link}</span></p>
    <p style="font-size:13px;color:#999;margin-top:24px;">Holis Wellness Center · Manuel Antonio, Costa Rica</p>
  </div>`;
}

// Confirmation for a self-service purchase (no token — the buyer has an account).
function purchaseHtml(o: any): string {
  const firstName = String(o.guest_name || "").trim().split(/\s+/)[0] || "there";
  const entitlement = o.is_unlimited
    ? "Unlimited classes"
    : `${o.credits_remaining ?? 0} class credit${(o.credits_remaining ?? 0) === 1 ? "" : "s"}`;
  const validity = o.expires_at
    ? `<p style="margin:4px 0;color:#666;font-size:14px;">Valid until ${new Date(o.expires_at).toLocaleDateString()}</p>`
    : "";
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2937;">
    <h1 style="font-size:22px;margin:0 0 8px;">Thank you, ${esc(firstName)}! 🌿</h1>
    <p style="font-size:15px;line-height:1.5;">Your purchase is complete and <strong>${esc(o.name_snapshot)}</strong> is now active in your account.</p>
    <div style="background:#f3f6f6;border-radius:12px;padding:16px;margin:16px 0;">
      <p style="margin:0 0 4px;font-weight:bold;">${esc(o.name_snapshot)}</p>
      <p style="margin:4px 0;color:#334155;font-size:14px;">${entitlement}</p>
      ${validity}
    </div>
    <p style="font-size:15px;line-height:1.5;">Log in and head to Classes to book — your credit is applied automatically at checkout.</p>
    <p style="text-align:center;margin:24px 0;">
      <a href="${SITE_URL}/classes" style="background:#1d5b6a;color:#fff;text-decoration:none;padding:14px 28px;border-radius:9999px;font-weight:bold;font-size:16px;display:inline-block;">Browse classes</a>
    </p>
    <p style="font-size:13px;color:#999;margin-top:24px;">Holis Wellness Center · Manuel Antonio, Costa Rica</p>
  </div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, reason: "method_not_allowed" }, 405);

  let body: any = {};
  try { body = await req.json(); } catch { return json({ ok: false, reason: "invalid_json" }, 400); }

  const userOfferingId: string | undefined = body.userOfferingId;
  if (!userOfferingId || !UUID_RE.test(userOfferingId)) {
    return json({ ok: false, reason: "invalid_user_offering_id" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: o, error } = await supabase
    .from("user_offerings")
    .select("id, offering_id, type, name_snapshot, code, access_token, is_unlimited, credits_remaining, expires_at, guest_name, guest_email, user_id")
    .eq("id", userOfferingId)
    .maybeSingle();

  if (error) return json({ ok: false, reason: "fetch_failed" }, 500);
  if (!o) return json({ ok: false, reason: "not_found" }, 404);

  // Recipient: the guest email (admin order) or the buyer's account email (self
  // purchase, where user_id is set).
  let to = String(o.guest_email || "").trim();
  if (!to && o.user_id) {
    const { data: prof } = await supabase.from("profiles").select("email, full_name").eq("user_id", o.user_id).maybeSingle();
    to = String(prof?.email || "").trim();
    if (!o.guest_name && prof?.full_name) (o as any).guest_name = prof.full_name;
  }
  if (!to) return json({ ok: false, reason: "no_recipient" }, 409);

  const isOrder = !!o.access_token; // admin order → schedule link; else a purchase
  const link = isOrder ? `${SITE_URL}/classes?m=${o.access_token}` : `${SITE_URL}/classes`;

  // Prefer the admin-editable template; fall back to the built-in copy.
  const type = ["membership", "class_pass", "drop_in"].includes(String(o.type)) ? String(o.type) : "membership";
  const tpl = await loadTemplate(supabase, `offering_${isOrder ? "order" : "purchase"}_${type}`);
  let custRes: { ok: boolean; error?: string };
  if (tpl) {
    const firstName = String(o.guest_name || "").trim().split(/\s+/)[0] || "there";
    const entitlement = o.is_unlimited
      ? "Unlimited classes"
      : `${o.credits_remaining ?? 0} class credit${(o.credits_remaining ?? 0) === 1 ? "" : "s"}`;
    const button = isOrder
      ? ctaButton("Schedule your classes", link)
      : ctaButton("Browse classes", `${SITE_URL}/classes`);
    // Loyalty reward highlight — renew N times to earn a free treatment. A bonus,
    // so any lookup failure must never block the welcome email.
    let loyaltyHtml = "";
    try {
      const { data: cfg } = await supabase.from("membership_reward_config").select("enabled, reward_label").maybeSingle();
      if (cfg && cfg.enabled !== false) {
        const { data: offRow } = await supabase.from("offerings").select("loyalty_threshold").eq("id", (o as any).offering_id).maybeSingle();
        const th = Number(offRow?.loyalty_threshold ?? 0);
        if (th > 0) {
          loyaltyHtml = `<div style="background:#eef5f0;border:1px solid #cfe3d6;border-radius:12px;padding:16px;margin:18px 0;">
            <p style="margin:0 0 4px;font-weight:bold;font-size:15px;">🎁 Loyalty reward</p>
            <p style="margin:0;font-size:14px;line-height:1.6;color:#334155;">Renew your <strong>${esc(o.name_snapshot)}</strong> <strong>${th}</strong> times and you'll earn <strong>${esc(cfg.reward_label || "a free Pure Bliss 60-min massage")}</strong>. We'll keep you posted as you get closer!</p>
          </div>`;
        }
      }
    } catch { /* loyalty is a bonus; never block the welcome email */ }
    const built = buildFromTemplate(
      tpl,
      { first_name: firstName, guest_name: o.guest_name || firstName, offering_name: o.name_snapshot, entitlement, code: o.code || "" },
      { details: offeringDetailsHtml(o), button, schedule_link: link, loyalty: loyaltyHtml },
    );
    custRes = await sendEmail(to, built.subject, built.html);
  } else {
    custRes = isOrder
      ? await sendEmail(to, `Your Holis membership is ready — ${o.name_snapshot}`, customerHtml(o, link))
      : await sendEmail(to, `Your Holis purchase — ${o.name_snapshot}`, purchaseHtml(o));
  }

  // Admin copy (+ backup)
  const adminSubj = isOrder
    ? `[New order] ${o.guest_name || to} — ${o.name_snapshot} (${o.code})`
    : `[Purchase] ${o.guest_name || to} — ${o.name_snapshot}`;
  const adminHtml = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:16px;color:#1f2937;">
      <h2 style="font-size:18px;">${isOrder ? "New membership order" : "New membership/pass purchase"}</h2>
      <p><strong>Customer:</strong> ${esc(o.guest_name || "")} &lt;${esc(to)}&gt;</p>
      <p><strong>Offering:</strong> ${esc(o.name_snapshot)}</p>
      ${isOrder ? `<p><strong>Code:</strong> ${esc(o.code)}</p><p><strong>Scheduling link:</strong><br><span style="word-break:break-all;">${link}</span></p>` : ""}
    </div>`;
  await sendEmail(ADMIN_EMAIL, adminSubj, adminHtml);
  if (ADMIN_BACKUP_EMAIL && ADMIN_BACKUP_EMAIL !== ADMIN_EMAIL) {
    await sendEmail(ADMIN_BACKUP_EMAIL, `[Backup] ${adminSubj}`, adminHtml);
  }

  if (!custRes.ok) {
    console.error("[send-membership-order-email] customer send failed", custRes.error);
    return json({ ok: false, reason: "customer_send_failed", detail: custRes.error }, 502);
  }
  return json({ ok: true });
});
