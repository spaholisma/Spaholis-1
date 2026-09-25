// deno-lint-ignore-file no-explicit-any
// Edge function: send-private-class-request
//
// A guest asked for a one-on-one, couple's or group private class on
// spaholis.com (Private Sessions → Book Now) and may have picked a class and
// its teacher. Three emails go out:
//   1. the teacher of that class (only if she is a registered teacher),
//   2. the Holis team (info@ + Gmail backup),
//   3. the guest, as a copy of what they asked for.
// Replies to the team and teacher emails go straight to the guest; replies to
// the guest's copy go to the teacher (or to Holis when there is none).
//
// Called by the request form with the new booking's id only. Nothing the
// browser sends is trusted: the booking is read from the database, it must be
// a fresh private-class request that was never emailed, the teacher must
// really teach that class, and her email comes from the teachers table.

import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { emailHead } from "../_shared/email-layout.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TEAM = ["info@spaholis.com", "spaholisma@gmail.com"];
const HOLIS_REPLY = "info@spaholis.com";
const FROM_ADDRESS = "Holis Wellness <info@spaholis.com>";
const SITE = "https://www.spaholis.com";
const MAX_AGE_MINUTES = 30;
const MAX_GUEST_COPIES_PER_HOUR = 3;

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const clean = (s: unknown) => String(s ?? "").trim().replace(/\s+/g, " ");
const norm = (s: unknown) => clean(s).toLowerCase();

const crTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: "America/Costa_Rica", dateStyle: "medium", timeStyle: "short" });

function row(label: string, value: string) {
  if (!value) return "";
  return `<tr><td style="padding:9px 0;color:#7a7a72;font-size:13px;width:38%;vertical-align:top">${esc(label)}</td>` +
    `<td style="padding:9px 0;color:#2d2d2a;font-size:14px;vertical-align:top">${value}</td></tr>`;
}

function shell(eyebrow: string, title: string, intro: string, rows: string, footer: string) {
  // The shared head carries the viewport line, so a phone shows it at its own width.
  return `<!DOCTYPE html><html lang="en">${emailHead(title)}<body style="margin:0;background:#f4f1ec;font-family:Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ec;padding:28px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden">
        <tr><td style="background:#7d9a85;padding:22px 28px">
          <p style="margin:0;color:#eef3ef;font-size:11px;letter-spacing:2px;text-transform:uppercase">${esc(eyebrow)}</p>
          <h1 style="margin:6px 0 0;color:#ffffff;font-size:22px;font-weight:600">${esc(title)}</h1>
        </td></tr>
        <tr><td style="padding:22px 28px">
          <p style="margin:0 0 14px;color:#4a4a45;font-size:14px;line-height:1.6">${intro}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
          ${footer}
          <p style="margin:22px 0 0;color:#9a9a92;font-size:12px">Holis Wellness Center · Manuel Antonio, Costa Rica · <a href="${SITE}" style="color:#5e7d67">spaholis.com</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

async function sendEmail(to: string | string[], subject: string, html: string, replyTo?: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return { ok: false, error: "email_config_missing" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ from: FROM_ADDRESS, to, subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
  });
  if (!res.ok) return { ok: false, error: `resend_${res.status}: ${await res.text()}` };
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, reason: "method_not_allowed" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, reason: "invalid_json" }, 400); }
  const bookingId = String(body?.bookingId ?? "");
  if (!UUID_RE.test(bookingId)) return json({ ok: false, reason: "invalid_body" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const { data: booking } = await admin
      .from("bookings")
      .select("id, guest_name, guest_email, guest_phone, intake_form, created_at, notification_sent_at, service_id")
      .eq("id", bookingId)
      .maybeSingle();
    const pc = (booking as any)?.intake_form?.private_class;
    if (!booking || !pc || (booking as any).service_id) return json({ ok: false, reason: "not_a_private_class_request" }, 404);
    if (Date.now() - new Date((booking as any).created_at).getTime() > MAX_AGE_MINUTES * 60_000) {
      return json({ ok: false, reason: "too_old" }, 409);
    }

    // Claim it, so a double click or a replay never sends twice.
    const { data: claimed } = await admin
      .from("bookings")
      .update({ notification_sent_at: new Date().toISOString() })
      .eq("id", bookingId)
      .is("notification_sent_at", null)
      .select("id");
    if (!claimed?.length) return json({ ok: true, alreadySent: true });

    const b: any = booking;
    const guestName = clean(b.guest_name) || "Guest";
    const guestEmail = clean(b.guest_email);
    const kindTitle = clean(pc.kind_title) || "Private class";
    const people = Math.max(1, Math.min(20, Math.round(Number(pc.people) || 1)));
    const preferred = clean(pc.preferred);

    // The class and teacher as the database knows them, not as the browser said.
    let classTitle = "";
    let teacherName = "";
    let teacherEmail = "";
    if (typeof pc.class_id === "string" && UUID_RE.test(pc.class_id)) {
      const { data: cls } = await admin.from("classes").select("id, title, instructor").eq("id", pc.class_id).maybeSingle();
      if (cls) {
        classTitle = clean((cls as any).title);
        const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
        const { data: sessions } = await admin.from("class_schedule").select("instructor").eq("class_id", pc.class_id).gte("start_time", since).limit(2000);
        const teaches = new Set([...(((sessions as any[]) ?? []).map((s) => norm(s.instructor))), norm((cls as any).instructor)].filter(Boolean));
        if (pc.teacher_name && teaches.has(norm(pc.teacher_name))) {
          teacherName = clean(pc.teacher_name);
          const { data: teachers } = await admin.from("teachers").select("display_name, email, active").eq("active", true);
          teacherEmail = clean(((teachers as any[]) ?? []).find((t) => norm(t.display_name) === norm(teacherName))?.email);
        }
      }
    }

    const peopleText = people === 1 ? "1 person" : `${people} people`;
    const mail = (e: string) => (e ? `<a href="mailto:${esc(e)}" style="color:#5e7d67">${esc(e)}</a>` : "");
    const classText = classTitle ? esc(classTitle) : "No specific class — help them choose";
    const teacherText = teacherName ? esc(teacherName) : classTitle ? "To be confirmed" : "";
    const detailRows =
      row("Private class", esc(kindTitle)) +
      row("People", esc(peopleText)) +
      row("Class", classText) +
      row("Teacher", teacherText) +
      row("Preferred date & time", esc(preferred));
    const guestRows =
      row("Name", esc(guestName)) +
      row("Email", mail(guestEmail)) +
      row("Phone", esc(clean(b.guest_phone)));
    const results: Record<string, unknown> = { teacherEmailed: false, teamEmailed: false, guestEmailed: false };

    // 1. The teacher
    if (teacherEmail) {
      const r = await sendEmail(
        teacherEmail,
        `New private class request — ${classTitle} · ${guestName}`,
        shell(
          "Private class request",
          `${guestName} wants a private class with you`,
          `${esc(guestName)} asked for a private <strong>${esc(classTitle)}</strong> class with you on spaholis.com. ` +
          `Reply to this email to reach them directly and arrange the day and time — please keep the Holis team in the loop.`,
          detailRows + guestRows,
          `<p style="margin:16px 0 0;color:#7a7a72;font-size:12px;line-height:1.5">The Holis team received a copy of this request.</p>`,
        ),
        guestEmail || undefined,
      );
      results.teacherEmailed = r.ok;
      if (!r.ok) console.error("[send-private-class-request] teacher email failed", r.error);
    }

    // 2. Holis
    const teamNote = teacherEmail
      ? `${esc(teacherName)} was emailed this request and may reply to the guest directly.`
      : teacherName
        ? `${esc(teacherName)} is not a registered teacher with an email, so she was <strong>not</strong> emailed — please forward this request to her.`
        : "No teacher was chosen — please contact the guest to arrange the class.";
    const team = await sendEmail(
      TEAM,
      `Private class request — ${kindTitle}${classTitle ? ` · ${classTitle}` : ""} · ${guestName}`,
      shell(
        "Private class request",
        `${kindTitle} — ${peopleText}`,
        `A new private class request arrived from spaholis.com. ${teamNote}`,
        detailRows + guestRows + row("Received", esc(crTime(b.created_at))),
        `<p style="margin:16px 0 0;color:#7a7a72;font-size:12px;line-height:1.5">Reply to this email to answer the guest directly.</p>`,
      ),
      guestEmail || undefined,
    );
    results.teamEmailed = team.ok;
    if (!team.ok) console.error("[send-private-class-request] team email failed", team.error);

    // 3. The guest (a few copies an hour at most per address)
    if (guestEmail) {
      const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
      const { count } = await admin
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("guest_email", b.guest_email)
        .gte("created_at", hourAgo)
        .not("notification_sent_at", "is", null);
      if ((count ?? 0) <= MAX_GUEST_COPIES_PER_HOUR) {
        const who = teacherEmail ? esc(teacherName) : "our team";
        const r = await sendEmail(
          guestEmail,
          "We received your private class request",
          shell(
            "Holis Wellness Center",
            "Your private class request is in",
            `Hi ${esc(guestName)}, thank you for your request. ${who === "our team" ? "Our team" : who} will reply by email to arrange the day and time of your private class${teacherEmail ? ", together with the Holis team" : ""}. Here is what you asked for:`,
            detailRows,
            `<p style="margin:16px 0 0;color:#4a4a45;font-size:13px;line-height:1.6">Nothing has been charged. Questions? Just reply to this email.</p>`,
          ),
          teacherEmail || HOLIS_REPLY,
        );
        results.guestEmailed = r.ok;
        if (!r.ok) console.error("[send-private-class-request] guest email failed", r.error);
      } else {
        results.guestSkipped = "rate_limited";
      }
    }

    return json({ ok: true, ...results });
  } catch (err) {
    console.error("[send-private-class-request] failed", (err as Error).message);
    return json({ ok: false, reason: "failed" }, 500);
  }
});
