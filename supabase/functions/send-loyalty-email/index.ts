// deno-lint-ignore-file no-explicit-any
// Edge function: send-loyalty-email
//
// Sends the loyalty email to a member after they gain an offering (a renewal):
//   - `earned` = true  → the "you earned your free reward" email
//   - otherwise        → the "progress toward your reward" email
// Content comes from the admin-editable public.email_templates rows
// (loyalty_reward_earned / loyalty_progress), with a built-in fallback.
// Counts are recomputed HERE from the database, never trusted from the caller.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: any, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const FROM_ADDRESS = "Holis Wellness <info@spaholis.com>";
const SITE_URL = "https://www.spaholis.com";

const escHtml = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const interpolate = (str: string, vars: Record<string, string>) =>
  String(str ?? "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => (k in vars ? String(vars[k] ?? "") : ""));

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

function row(label: string, value: string) {
  return `<tr><td style="padding:6px 10px;border:1px solid #ddd;font-weight:600;width:55%;">${label}</td><td style="padding:6px 10px;border:1px solid #ddd;">${value}</td></tr>`;
}

async function sendEmail(to: string, subject: string, html: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return { ok: false, error: "email_config_missing" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ from: FROM_ADDRESS, to, subject, html }),
  });
  if (!res.ok) return { ok: false, error: await res.text() };
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, reason: "method_not_allowed" }, 405);

  let body: any = {};
  try { body = await req.json(); } catch { return json({ ok: false, reason: "invalid_json" }, 400); }
  const email = String(body.email || "").trim().toLowerCase();
  const offeringId = body.offering_id as string | undefined;
  const earned = !!body.earned;
  if (!email || !offeringId) return json({ ok: false, reason: "missing_params" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const { data: cfg } = await admin.from("membership_reward_config").select("*").maybeSingle();
    if (!cfg || cfg.enabled === false) return json({ ok: true, skipped: "disabled" });

    const { data: off } = await admin.from("offerings").select("name, loyalty_threshold").eq("id", offeringId).maybeSingle();
    const threshold = Number(off?.loyalty_threshold ?? 0);
    if (!off || threshold <= 0) return json({ ok: true, skipped: "no_threshold" });

    const { count: purchases } = await admin
      .from("user_offerings")
      .select("id", { count: "exact", head: true })
      .filter("guest_email", "ilike", email)
      .eq("offering_id", offeringId);
    const total = purchases ?? 0;
    const towardNext = total % threshold;
    const remaining = towardNext === 0 ? 0 : threshold - towardNext;

    // Most recent offering for this customer — greeting name, code, benefits,
    // and a no-login booking link (matches the membership-order flow).
    const { data: last } = await admin
      .from("user_offerings")
      .select("guest_name, name_snapshot, is_unlimited, credits_remaining, code, access_token, expires_at")
      .filter("guest_email", "ilike", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const guestName = (last?.guest_name || "there").split(" ")[0];
    const membershipName = last?.name_snapshot || off.name;
    const entitlement = last?.is_unlimited ? "Unlimited classes" : `${last?.credits_remaining ?? 0} class credits`;
    const code = last?.code || "";
    const validUntil = last?.expires_at
      ? new Date(last.expires_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "America/Costa_Rica" })
      : "";
    const scheduleLink = last?.access_token ? `${SITE_URL}/classes?m=${last.access_token}` : `${SITE_URL}/classes`;

    const rewardLabel = cfg.reward_label || "a free Pure Bliss 60-min massage";
    const key = earned ? "loyalty_reward_earned" : "loyalty_progress";
    const { data: tpl } = await admin
      .from("email_templates")
      .select("subject, heading, body_html, enabled")
      .eq("template_key", key)
      .maybeSingle();
    if (tpl && tpl.enabled === false) return json({ ok: true, skipped: "template_disabled" });

    const appButton = `<p style="text-align:center;margin:20px 0 6px;">
      <a href="${scheduleLink}" style="background:#1d5b6a;color:#ffffff;text-decoration:none;padding:13px 26px;border-radius:9999px;font-weight:bold;font-size:15px;display:inline-block;">Book your classes</a></p>
      <p style="text-align:center;margin:0 0 18px;">
      <a href="${SITE_URL}" style="background:#2F2F2F;color:#F5F1EC;text-decoration:none;padding:13px 26px;border-radius:9999px;font-size:14px;display:inline-block;">Get the Holis app</a></p>
      <p style="font-size:13px;line-height:1.6;color:#555;text-align:center;margin:0 0 8px;">Tip: open <strong>spaholis.com</strong> on your phone and tap “Add to Home Screen” to install the Holis app and see your bookings anytime.</p>`;

    // Complete member box: membership, benefits, code, validity + loyalty progress.
    const details = `<div style="background:#f3f6f6;border-radius:12px;padding:18px;margin:14px 0;">
      <p style="margin:0 0 6px;font-weight:bold;font-size:16px;">${escHtml(membershipName)}</p>
      <p style="margin:4px 0;color:#334155;font-size:14px;">Your benefits: <strong>${escHtml(entitlement)}</strong></p>
      ${code ? `<p style="margin:4px 0;color:#334155;font-size:14px;">Your code: <strong style="letter-spacing:1px;">${escHtml(code)}</strong> <span style="color:#666;">— use it to book without logging in</span></p>` : ""}
      ${validUntil ? `<p style="margin:4px 0;color:#666;font-size:13px;">Valid until ${escHtml(validUntil)}</p>` : ""}
      <hr style="border:none;border-top:1px solid #dde5e5;margin:12px 0;">
      <p style="margin:4px 0;color:#334155;font-size:14px;">Renewals so far: <strong>${total}</strong> · Reward every <strong>${threshold}</strong></p>
      <p style="margin:4px 0;color:#334155;font-size:14px;">${earned ? "Free reward earned: <strong>Yes 🎁</strong>" : `Renewals to your free reward: <strong>${remaining}</strong>`}</p>
    </div>`;

    const vars: Record<string, string> = {
      guest_name: escHtml(guestName),
      offering_name: escHtml(membershipName),
      entitlement: escHtml(entitlement),
      code: escHtml(code),
      valid_until: escHtml(validUntil),
      schedule_link: scheduleLink,
      purchases: String(total),
      threshold: String(threshold),
      remaining: String(remaining),
      reward_label: escHtml(rewardLabel),
      details,
      button: appButton,
      app_button: appButton,
    };

    let subject: string;
    let html: string;
    if (tpl) {
      subject = interpolate(tpl.subject, vars);
      html = renderShell(interpolate(tpl.heading, vars), interpolate(tpl.body_html, vars));
    } else if (earned) {
      subject = `🎉 You've earned ${rewardLabel}!`;
      html = renderShell(`You earned a reward, ${escHtml(guestName)}!`,
        `<p style="font-size:15px;">Hi ${escHtml(guestName)},</p>
         <p style="font-size:14px;line-height:1.6;">By renewing your <strong>${escHtml(off.name)}</strong> ${threshold} times, you've earned <strong>${escHtml(rewardLabel)}</strong>! 🎁</p>
         ${details}
         <p style="font-size:14px;line-height:1.6;">Our team will reach out to book it, or just mention it on your next visit.</p>
         ${appButton}`);
    } else {
      subject = `You're ${remaining} renewal${remaining === 1 ? "" : "s"} from ${rewardLabel} 🎁`;
      html = renderShell(`Thanks for renewing, ${escHtml(guestName)}!`,
        `<p style="font-size:15px;">Hi ${escHtml(guestName)},</p>
         <p style="font-size:14px;line-height:1.6;">Thanks for renewing your <strong>${escHtml(off.name)}</strong>. You're building toward a treat!</p>
         ${details}
         <p style="font-size:14px;line-height:1.6;">Just <strong>${remaining}</strong> more renewal${remaining === 1 ? "" : "s"} and you'll earn <strong>${escHtml(rewardLabel)}</strong>.</p>
         ${appButton}`);
    }

    const sent = await sendEmail(email, subject, html);
    if (!sent.ok) { console.error("[send-loyalty-email] send failed", sent.error); return json({ ok: false, reason: "send_failed", error: sent.error }, 502); }
    return json({ ok: true, earned, remaining, purchases: total });
  } catch (err) {
    console.error("[send-loyalty-email] failed", (err as Error).message);
    return json({ ok: false, reason: "error", message: (err as Error).message }, 500);
  }
});
