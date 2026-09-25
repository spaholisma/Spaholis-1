// deno-lint-ignore-file no-explicit-any
// Edge function: send-due-reminders
//
// Every 5 minutes (pg_cron) this handles three time-based sends for treatment
// calendar entries. Costa Rica is a fixed UTC-6 offset.
//   1. Staff push reminder   (reminder_minutes)          -> notify-staff-push
//   2. Client reminder email (client_email + client_reminder_hours, before start)
//   3. Client review email   (client_email + client_review, ~5 min after it ends)
// The client emails render from the editable Client Emails templates
// (appointment_reminder / appointment_review). Each send is claimed via its
// *_sent_at column so it fires exactly once.

import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { emailShell } from "../_shared/email-layout.ts";

const FROM_ADDRESS = "Holis Wellness <info@spaholis.com>";
// CTA target for the review button. Paste your Google review link here (or edit
// the template body directly) when ready.
const REVIEW_URL = "https://www.spaholis.com";
// Send the review this long after the appointment ends.
const REVIEW_DELAY_MS = 5 * 60_000;

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const hm = (t: string | null) => String(t ?? "").slice(0, 5);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const escHtml = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function interpolate(str: string, vars: Record<string, string>): string {
  return String(str ?? "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => (k in vars ? String(vars[k] ?? "") : ""));
}

function renderShell(heading: string, inner: string): string {
  return emailShell(heading, inner);
}

// Render an editable template row against scalar + prebuilt-HTML vars.
function renderTemplate(tpl: any, raw: Record<string, string>, htmlKeys: string[]): { subject: string; html: string } {
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) vars[k] = htmlKeys.includes(k) ? v : escHtml(v);
  const subject = interpolate(tpl.subject, vars);
  const html = renderShell(interpolate(tpl.heading, vars), interpolate(tpl.body_html, vars));
  return { subject, html };
}

Deno.serve(async (req) => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: sec } = await admin.from("app_secrets").select("value").eq("key", "cron_secret").maybeSingle();
  if (!sec?.value || req.headers.get("x-cron-secret") !== sec.value) {
    return json({ ok: false, reason: "forbidden" }, 403);
  }

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
  const send = (to: string, subject: string, html: string) => fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({ from: FROM_ADDRESS, to, subject, html }),
  });

  // Load the two editable client templates once.
  const { data: tpls } = await admin
    .from("email_templates").select("template_key, subject, heading, body_html, enabled")
    .in("template_key", ["appointment_reminder", "appointment_review"]);
  const tplReminder = (tpls ?? []).find((t: any) => t.template_key === "appointment_reminder");
  const tplReview = (tpls ?? []).find((t: any) => t.template_key === "appointment_review");

  const nowMs = Date.now();
  const dayCr = (offset: number) => new Date(nowMs - 6 * 3600_000 + offset * 24 * 3600_000).toISOString().slice(0, 10);
  const days = [dayCr(-1), dayCr(0), dayCr(1)];

  const { data: candidates, error } = await admin
    .from("admin_calendar_entries")
    .select("id, title, entry_date, start_time, duration_minutes, is_offsite, offsite_location, reminder_minutes, reminder_sent_at, client_name, client_email, client_reminder_hours, client_reminder_sent_at, client_review, client_review_sent_at")
    .in("entry_date", days);
  if (error) return json({ ok: false, reason: "query_failed", message: error.message }, 500);

  let staffFired = 0, clientReminders = 0, reviews = 0;

  for (const e of candidates ?? []) {
    const startMs = new Date(`${e.entry_date}T${e.start_time || "00:00:00"}-06:00`).getTime();
    if (!Number.isFinite(startMs)) continue;
    const endMs = startMs + Number(e.duration_minutes || 0) * 60_000;
    const clientName = (e.client_name && String(e.client_name).trim()) || "there";
    const whereLabel = e.is_offsite ? (e.offsite_location || "your location") : "Holis Wellness Center";
    const prettyDate = new Date(`${e.entry_date}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    const validEmail = e.client_email && EMAIL_RE.test(e.client_email);

    // 1. Staff push reminder ------------------------------------------------
    if (e.reminder_minutes != null && e.reminder_sent_at == null) {
      const dueMs = startMs - Number(e.reminder_minutes) * 60_000;
      if (nowMs >= dueMs && nowMs <= startMs + 30 * 60_000) {
        const { data: claimed } = await admin
          .from("admin_calendar_entries").update({ reminder_sent_at: new Date().toISOString() })
          .eq("id", e.id).is("reminder_sent_at", null).select("id").maybeSingle();
        if (claimed) {
          const mins = Number(e.reminder_minutes);
          const whenLabel = mins <= 0 ? "ahora" : mins >= 60 ? `en ${Math.round(mins / 60)}h` : `en ${mins} min`;
          try {
            await admin.functions.invoke("notify-staff-push", {
              body: { title: "⏰ Recordatorio", body: `${e.title} — ${whenLabel} (${hm(e.start_time)})`, url: "/admin" },
            });
            staffFired++;
          } catch (err) { console.error("[reminders] staff push failed", e.id, err); }
        }
      }
    }

    // 2. Client reminder email (before start) -------------------------------
    if (RESEND_API_KEY && validEmail && tplReminder?.enabled &&
        e.client_reminder_hours != null && e.client_reminder_sent_at == null) {
      const dueMs = startMs - Number(e.client_reminder_hours) * 3600_000;
      if (nowMs >= dueMs && nowMs <= startMs + 30 * 60_000) {
        const { data: claimed } = await admin
          .from("admin_calendar_entries").update({ client_reminder_sent_at: new Date().toISOString() })
          .eq("id", e.id).is("client_reminder_sent_at", null).select("id").maybeSingle();
        if (claimed) {
          const { subject, html } = renderTemplate(tplReminder,
            { guest_name: clientName, date: prettyDate, time: hm(e.start_time), location: whereLabel, button: "", review_link: "" }, ["button"]);
          try {
            const r = await send(e.client_email, subject, html);
            if (r.ok) clientReminders++;
          } catch (err) { console.error("[reminders] client email failed", e.id, err); }
        }
      }
    }

    // 3. Client review email (~5 min after it ends) -------------------------
    if (RESEND_API_KEY && validEmail && tplReview?.enabled &&
        e.client_review === true && e.client_review_sent_at == null) {
      if (nowMs >= endMs + REVIEW_DELAY_MS) {
        const { data: claimed } = await admin
          .from("admin_calendar_entries").update({ client_review_sent_at: new Date().toISOString() })
          .eq("id", e.id).is("client_review_sent_at", null).select("id").maybeSingle();
        if (claimed) {
          // `btn` makes it a full-width, thumb-sized button on a phone.
          const button = `<p style="text-align:center;margin:24px 0;"><a class="btn" href="${REVIEW_URL}" style="background:#2F2F2F;color:#F5F1EC;text-decoration:none;padding:14px 28px;border-radius:9999px;font-size:15px;display:inline-block;">Leave a review</a></p>`;
          const { subject, html } = renderTemplate(tplReview,
            { guest_name: clientName, date: prettyDate, time: hm(e.start_time), location: whereLabel, button, review_link: REVIEW_URL }, ["button"]);
          try {
            const r = await send(e.client_email, subject, html);
            if (r.ok) reviews++;
          } catch (err) { console.error("[reminders] review email failed", e.id, err); }
        }
      }
    }
  }

  return json({ ok: true, scanned: (candidates ?? []).length, staffFired, clientReminders, reviews });
});
