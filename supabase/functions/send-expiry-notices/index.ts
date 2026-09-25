// deno-lint-ignore-file no-explicit-any
// Edge function: send-expiry-notices
//
// Runs on a schedule (pg_cron, x-cron-secret). Finds memberships/passes whose
// expires_at has passed and that haven't been notified yet, emails the customer
// a friendly 'expired' notice (from the editable offering_expired template),
// marks them expired, and stamps expiry_notified_at so it fires exactly once.

import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { emailShell } from "../_shared/email-layout.ts";

const FROM_ADDRESS = "Holis Wellness <info@spaholis.com>";
const SITE_URL = "https://spaholis.com";

const json = (b: Record<string, unknown>, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function interpolate(str: string, vars: Record<string, string>): string {
  return String(str ?? "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => (k in vars ? String(vars[k] ?? "") : ""));
}
function renderShell(heading: string, inner: string): string {
  return emailShell(heading, inner);
}

Deno.serve(async (req) => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: sec } = await admin.from("app_secrets").select("value").eq("key", "cron_secret").maybeSingle();
  if (!sec?.value || req.headers.get("x-cron-secret") !== sec.value) {
    return json({ ok: false, reason: "forbidden" }, 403);
  }

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";

  const { data: tpl } = await admin.from("email_templates")
    .select("subject, heading, body_html, enabled").eq("template_key", "offering_expired").maybeSingle();

  // Expired, not yet notified, not cancelled, has an expiry date.
  const { data: rows, error } = await admin
    .from("user_offerings")
    .select("id, type, name_snapshot, status, expires_at, guest_name, guest_email, user_id")
    .lt("expires_at", new Date().toISOString())
    .is("expiry_notified_at", null)
    .neq("status", "cancelled")
    .not("expires_at", "is", null)
    .limit(200);
  if (error) return json({ ok: false, reason: "query_failed", message: error.message }, 500);

  let sent = 0;
  for (const o of rows ?? []) {
    // Claim first so overlapping runs can't double-send.
    const { data: claimed } = await admin
      .from("user_offerings")
      .update({ expiry_notified_at: new Date().toISOString(), status: o.status === "frozen" ? o.status : "expired" })
      .eq("id", o.id)
      .is("expiry_notified_at", null)
      .select("id").maybeSingle();
    if (!claimed) continue;

    // Recipient: guest email, else the buyer's profile email.
    let to = String(o.guest_email || "").trim();
    let name = o.guest_name || "";
    if (!to && o.user_id) {
      const { data: prof } = await admin.from("profiles").select("email, full_name").eq("user_id", o.user_id).maybeSingle();
      to = String(prof?.email || "").trim();
      if (!name) name = prof?.full_name || "";
    }
    if (!to || !EMAIL_RE.test(to) || !RESEND_API_KEY || !tpl || tpl.enabled === false) continue;

    // `btn` makes it a full-width, thumb-sized button on a phone.
    const button = `<p style="text-align:center;margin:24px 0;"><a class="btn" href="${SITE_URL}/classes#buy" style="background:#1d5b6a;color:#fff;text-decoration:none;padding:14px 28px;border-radius:9999px;font-weight:bold;font-size:16px;display:inline-block;">Renew now</a></p>`;
    const vars: Record<string, string> = {
      guest_name: esc(String(name).trim().split(/\s+/)[0] || "there"),
      first_name: esc(String(name).trim().split(/\s+/)[0] || "there"),
      offering_name: esc(o.name_snapshot || "membership"),
      button,
    };
    const subject = interpolate(tpl.subject, vars);
    const html = renderShell(interpolate(tpl.heading, vars), interpolate(tpl.body_html, vars));

    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({ from: FROM_ADDRESS, to, subject, html }),
      });
      if (r.ok) sent++;
    } catch (e) {
      console.error("[send-expiry-notices] send failed", o.id, e);
    }
  }

  return json({ ok: true, scanned: (rows ?? []).length, sent });
});
