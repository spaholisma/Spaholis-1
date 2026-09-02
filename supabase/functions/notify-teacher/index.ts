// deno-lint-ignore-file no-explicit-any
// Edge function: notify-teacher
//
// Under the studio-rental model a teacher runs her own class, so SHE is the one
// who needs to know what happens to it — not Holis. This function emails her
// when someone signs up or cancels, and confirms the changes she makes herself.
//
// It also handles the one message that goes OUTWARD: when a class is cancelled,
// every student who had signed up (and left an email) is told. If nobody signed
// up, nobody is emailed.
//
// Called only by the database triggers in `notify_teacher_event()`, so every
// path reaches the teacher: the website, PayPal, the admin calendar, her panel.
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-notify-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: any, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const FROM_ADDRESS = "Holis Wellness <info@spaholis.com>";
const SITE = "https://www.spaholis.com";
const SPA_TZ = "America/Costa_Rica";

const fmtDate = new Intl.DateTimeFormat("en-US", {
  timeZone: SPA_TZ, weekday: "long", month: "long", day: "numeric",
});
const fmtTime = new Intl.DateTimeFormat("en-US", {
  timeZone: SPA_TZ, hour: "numeric", minute: "2-digit", hour12: true,
});
const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

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

function shell(title: string, intro: string, rows: string[], footer = ""): string {
  return `
  <div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#2e2e2e">
    <h2 style="font-weight:600;color:#2e2e2e;margin:0 0 8px">${esc(title)}</h2>
    <p style="color:#6b6b6b;margin:0 0 18px;line-height:1.5">${intro}</p>
    <table style="width:100%;border-collapse:collapse;background:#faf7f4;border-radius:10px;overflow:hidden">
      ${rows.join("")}
    </table>
    ${footer}
    <p style="color:#9a9a9a;font-size:12px;margin-top:22px">
      Holis Wellness Center · Manuel Antonio, Costa Rica<br>
      <a href="${SITE}/teacher" style="color:#7b9d87">Open your Teacher Panel</a>
    </p>
  </div>`;
}
const row = (k: string, v: string) => `
  <tr>
    <td style="padding:9px 14px;color:#6b6b6b;font-size:13px;width:38%">${esc(k)}</td>
    <td style="padding:9px 14px;color:#2e2e2e;font-size:13px;font-weight:500">${esc(v)}</td>
  </tr>`;

type Event =
  | "student_added" | "student_updated" | "student_removed"
  | "booking_created" | "booking_cancelled"
  | "class_cancelled" | "class_reactivated";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, reason: "method_not_allowed" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, reason: "invalid_json" }, 400); }

  const event: Event = body?.event;
  const scheduleId: string = body?.scheduleId;
  const studentName: string = (body?.studentName ?? "").toString().slice(0, 120);
  if (!event || !scheduleId) return json({ ok: false, reason: "missing_fields" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Only our own database triggers may send mail. Class session ids are
  // readable with the public key, so without this anyone could spam a teacher.
  // The secret lives in a table the anon key cannot read.
  const { data: sec } = await admin
    .from("internal_secrets").select("value").eq("name", "notify_teacher").maybeSingle();
  if (!(sec as any)?.value || req.headers.get("x-notify-secret") !== (sec as any).value) {
    return json({ ok: false, reason: "unauthorized" }, 401);
  }

  try {
    const { data: sched } = await admin
      .from("class_schedule")
      .select("id, start_time, is_cancelled, instructor, classes(title, instructor, location)")
      .eq("id", scheduleId).maybeSingle();
    if (!sched) return json({ ok: false, reason: "session_not_found" }, 404);

    const cls: any = (sched as any).classes ?? {};
    const title = cls.title ?? "Class";
    const when = `${fmtDate.format(new Date((sched as any).start_time))} at ${fmtTime.format(new Date((sched as any).start_time))}`;

    // Who teaches it → who gets told.
    const who = ((sched as any).instructor || cls.instructor || "").trim();
    let teacherEmail: string | null = null;
    if (who) {
      const { data: t } = await admin.from("teachers")
        .select("email").ilike("display_name", who).maybeSingle();
      teacherEmail = (t as any)?.email || null;
    }

    const results: Record<string, unknown> = { event, teacherEmailed: false, studentsEmailed: 0 };

    // ── 1. Tell the teacher what happened to her class ──
    if (teacherEmail) {
      const copy: Record<Event, { subject: string; intro: string }> = {
        student_added:     { subject: `New student in ${title}`,        intro: `A student was added to your class.` },
        student_updated:   { subject: `Student updated — ${title}`,     intro: `A student's details were updated.` },
        student_removed:   { subject: `Student removed — ${title}`,     intro: `A student was removed from your class.` },
        booking_created:   { subject: `New signup for ${title}`,        intro: `Someone just booked a spot in your class on spaholis.com.` },
        booking_cancelled: { subject: `Cancellation — ${title}`,        intro: `A student cancelled their spot in your class.` },
        class_cancelled:   { subject: `Class cancelled — ${title}`,     intro: `Your class was cancelled. Anyone who had signed up has been notified.` },
        class_reactivated: { subject: `Class reactivated — ${title}`,   intro: `Your class is back on the schedule.` },
      };
      const c = copy[event] ?? { subject: `Update — ${title}`, intro: "Your class was updated." };

      // How many are still coming, so she sees the class at a glance.
      const { data: rows } = await admin.from("class_bookings")
        .select("id, status").eq("schedule_id", scheduleId);
      const active = ((rows as any[]) ?? []).filter((r) => r.status !== "cancelled").length;

      const rowsHtml = [
        row("Class", title),
        row("When", when),
        ...(studentName ? [row("Student", studentName)] : []),
        row("Students signed up", String(active)),
        ...(cls.location ? [row("Location", cls.location)] : []),
      ];
      const res = await sendEmail(teacherEmail, c.subject, shell(c.subject, c.intro, rowsHtml));
      results.teacherEmailed = res.ok;
      if (!res.ok) console.error("[notify-teacher] teacher email failed", res.error);
    } else {
      console.warn("[notify-teacher] no teacher email for session", scheduleId, "instructor:", who);
    }

    // ── 2. A cancelled class must reach the students who signed up ──
    if (event === "class_cancelled") {
      const { data: students } = await admin.from("class_bookings")
        .select("guest_name, guest_email, status").eq("schedule_id", scheduleId);
      const recipients = ((students as any[]) ?? [])
        .filter((s) => s.status !== "cancelled" && s.guest_email);

      for (const s of recipients) {
        const html = shell(
          "Your class has been cancelled",
          `We are sorry — <strong>${esc(title)}</strong> on ${esc(when)} has been cancelled.`,
          [row("Class", title), row("When", when)],
          `<p style="color:#6b6b6b;font-size:13px;line-height:1.5;margin-top:16px">
             If you already paid, please contact your teacher directly. You can see other
             classes on the <a href="${SITE}/classes/schedule" style="color:#7b9d87">class schedule</a>.
           </p>`,
        );
        const r = await sendEmail(s.guest_email, `Cancelled: ${title} — ${when}`, html);
        if (r.ok) results.studentsEmailed = (results.studentsEmailed as number) + 1;
        else console.error("[notify-teacher] student email failed", r.error);
      }
      // No signups → nobody is emailed, which is the desired behaviour.
    }

    return json({ ok: true, ...results });
  } catch (err) {
    console.error("[notify-teacher] failed", { message: (err as Error).message });
    // Never fail the caller's action because of email.
    return json({ ok: false, reason: "notify_failed", message: (err as Error).message }, 200);
  }
});
