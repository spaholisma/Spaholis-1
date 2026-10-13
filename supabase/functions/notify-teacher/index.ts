// deno-lint-ignore-file no-explicit-any
// Edge function: notify-teacher
//
// Under the studio-rental model a teacher runs her own class, so SHE is the one
// who needs to know what happens to it — not Holis. This function emails her
// when someone signs up or cancels, and confirms the changes she makes herself.
//
// It also handles the messages that go OUTWARD: a cancelled or moved class
// reaches the students who signed up, and a class that changes hands reaches the
// teacher who is no longer teaching it.
//
// When a teacher cancels a class, removes a student or cancels a private class,
// everyone hears it with her reason: the students (or the guest), she herself
// and Holis. Those emails to the students and to Holis are editable in Admin →
// Client Emails; the built-in copy below is used when a template is off.
//
// Called only by the database triggers in `notify_teacher_event()`, so every
// path reaches the teacher: the website, PayPal, the admin calendar, her panel.
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { detailsRow, detailsTable, emailButton, emailDocument, emailShell } from "../_shared/email-layout.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-notify-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: any, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const FROM_ADDRESS = "Holis Wellness <info@spaholis.com>";
// Holis hears about every cancellation by a teacher (and a backup copy).
const ADMIN_EMAIL = "info@spaholis.com";
/**
 * Emails TO the teachers. Off since 2026-10: the teachers chose not to use
 * their panel and Holis Wellness Center runs the classes — so every email goes
 * to the guests and to Holis only. The students still hear when a class is
 * cancelled or moved, and Holis gets its copies. Set to true with the Teacher
 * Admin Panel (src/lib/features.ts) to send them again.
 */
const TEACHER_EMAILS_ENABLED = false;
const ADMIN_BACKUP_EMAIL = "spaholisma@gmail.com";
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

// Poured into the shared document so a phone shows it at its own width.
function shell(title: string, intro: string, rows: string[], footer = ""): string {
  return emailDocument(`
  <div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#2e2e2e">
    <h2 style="font-weight:600;color:#2e2e2e;margin:0 0 8px">${esc(title)}</h2>
    <p style="color:#6b6b6b;margin:0 0 18px;line-height:1.5">${intro}</p>
    <table style="width:100%;border-collapse:collapse;background:#faf7f4;border-radius:10px;overflow:hidden">
      ${rows.join("")}
    </table>
    ${footer}
    <p style="color:#9a9a9a;font-size:12px;margin-top:22px">
      Holis Wellness Center · Manuel Antonio, Costa Rica<br>
      ${TEACHER_EMAILS_ENABLED
        ? `<a href="${SITE}/teacher" style="color:#7b9d87">Open your Teacher Panel</a>`
        : `<a href="${SITE}" style="color:#7b9d87">spaholis.com</a>`}
    </p>
  </div>`, title);
}
const row = (k: string, v: string) => `
  <tr>
    <td style="padding:9px 14px;color:#6b6b6b;font-size:13px;width:38%">${esc(k)}</td>
    <td style="padding:9px 14px;color:#2e2e2e;font-size:13px;font-weight:500">${esc(v)}</td>
  </tr>`;

async function sendTeam(subject: string, html: string) {
  const r = await sendEmail(ADMIN_EMAIL, subject, html);
  await sendEmail(ADMIN_BACKUP_EMAIL, `[Backup] ${subject}`, html);
  return r;
}

// ---- Editable templates (public.email_templates, Admin → Client Emails) ----
type Template = { subject: string; heading: string; body_html: string };
async function loadTemplate(admin: any, key: string): Promise<Template | null> {
  try {
    const { data } = await admin.from("email_templates")
      .select("subject, heading, body_html, enabled").eq("template_key", key).maybeSingle();
    if (!data || data.enabled === false) return null;
    return { subject: data.subject, heading: data.heading, body_html: data.body_html };
  } catch (_e) {
    return null;
  }
}
const interpolate = (str: string, vars: Record<string, string>) =>
  String(str ?? "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => (k in vars ? String(vars[k] ?? "") : ""));

/**
 * The template if it is on, else the built-in copy (the same words the
 * template starts with). Text values are escaped; `raw` holds HTML we build.
 */
async function fromTemplate(
  admin: any, key: string, fallback: Template,
  text: Record<string, string>, raw: Record<string, string> = {},
): Promise<{ subject: string; html: string }> {
  const tpl = (await loadTemplate(admin, key)) ?? fallback;
  const vars: Record<string, string> = { ...raw };
  for (const [k, v] of Object.entries(text)) vars[k] = esc(v);
  // The subject is plain text: unescaped values, no HTML blocks.
  const subject = interpolate(tpl.subject, { ...text });
  const heading = interpolate(tpl.heading, vars);
  return { subject, html: emailShell(heading, interpolate(tpl.body_html, vars), { title: subject }) };
}

const DEFAULTS: Record<string, Template> = {
  class_cancelled_student: {
    subject: "Cancelled: {{class_title}} — {{when}}",
    heading: "Your class has been cancelled",
    body_html: `<p>Hi {{first_name}},</p>
<p>We are sorry — <strong>{{class_title}}</strong> on {{when}} with {{teacher_name}} has been cancelled.</p>
<p><strong>Reason:</strong> {{reason}}</p>
{{details}}
<p>{{payment_note}}</p>
<p>You are welcome to choose another class on our schedule.</p>
{{button}}
<p class="fine" style="font-size:13px;color:#666;">Questions? Reply to this email or write to us on WhatsApp: +506 8814 6760.</p>`,
  },
  class_student_removed: {
    subject: "Your spot in {{class_title}} — {{when}}",
    heading: "Your booking has been cancelled",
    body_html: `<p>Hi {{first_name}},</p>
<p>Your spot in <strong>{{class_title}}</strong> on {{when}} with {{teacher_name}} has been cancelled.</p>
<p><strong>Reason:</strong> {{reason}}</p>
{{details}}
<p>{{payment_note}}</p>
{{button}}
<p class="fine" style="font-size:13px;color:#666;">If you think this is a mistake, reply to this email or write to us on WhatsApp: +506 8814 6760.</p>`,
  },
  private_class_cancelled_guest: {
    subject: "Your private class with {{teacher_name}} has been cancelled",
    heading: "Your private class has been cancelled",
    body_html: `<p>Hi {{first_name}},</p>
<p>We are sorry — your private class <strong>{{class_title}}</strong> with {{teacher_name}} has been cancelled.</p>
<p><strong>Reason:</strong> {{reason}}</p>
{{details}}
<p>If you had already paid for it, Holis Wellness Center will contact you about your refund.</p>
<p>We would love to find you another date or another teacher — just reply to this email.</p>
<p class="fine" style="font-size:13px;color:#666;">WhatsApp: +506 8814 6760</p>`,
  },
  team_class_cancelled: {
    subject: "[Class cancelled] {{class_title}} — {{when}} ({{teacher_name}})",
    heading: "Class cancelled",
    body_html: `{{details}}
<h3 style="font-size:15px;margin:20px 0 8px;">Students who were signed up</h3>
{{students}}
<p class="fine" style="margin:14px 0 0;font-size:13px;color:#555;">Each student has been emailed. Online payments to Holis need a refund; classes paid with a pass are already back on the pass.</p>`,
  },
  team_student_removed: {
    subject: "[Student removed] {{guest_name}} — {{class_title}} — {{when}}",
    heading: "Student removed from a class",
    body_html: `{{details}}
<p class="fine" style="margin:14px 0 0;font-size:13px;color:#555;">{{student_notice}}</p>`,
  },
  team_private_class_cancelled: {
    subject: "[Private class cancelled] {{guest_name}} — {{teacher_name}}",
    heading: "Private class cancelled",
    body_html: `{{details}}
<p class="fine" style="margin:14px 0 0;font-size:13px;color:#555;">The guest has been emailed. If they paid anything, please arrange the refund.</p>`,
  },
};

/** No reason given (a cancellation from the Admin calendar): a plain line instead. */
const NO_REASON = "The class could not go ahead as planned.";

type PayInfo = {
  method: string; status: string; total: number; pass: boolean; coupon: string;
};
const money = (n: number) => `$${n.toFixed(2)}`;

/**
 * What happens to a booking's payment when the class is off: what the student
 * reads, and what the team has to do.
 */
function paymentNote(p: PayInfo, teacher: string): { student: string; team: string } {
  const amt = p.total > 0 ? money(p.total) : "";
  const m = p.method;
  if (m === "credits" || (p.pass && m !== "membership")) {
    return { student: "The class has been returned to your pass, so you can use it for another class.", team: "Pass — the class is already back on the pass" };
  }
  if (m === "membership") {
    return { student: "Your membership is not affected — you can book another class with it.", team: "Membership — nothing to do" };
  }
  if ((m === "paypal" || m === "card") && p.status === "paid" && p.total > 0) {
    return { student: `You paid ${amt} online — Holis Wellness Center will contact you about your refund.`, team: `Paid online to Holis ${amt} — refund needed` };
  }
  if (m === "cash" && p.status !== "paid") {
    return { student: "You had not paid yet, so there is nothing to pay.", team: "Cash at the class — nothing paid yet" };
  }
  if (m === "cash") {
    return { student: `If you already paid ${teacher} in cash, ${teacher} will return your payment.`, team: `Paid ${amt || "in cash"} to the teacher — the teacher returns it` };
  }
  if (m === "compraclick") {
    return { student: "If you already paid with CompraClick, Holis Wellness Center will contact you about your refund.", team: `CompraClick ${amt} — check whether it was paid; refund if so`.replace("  ", " ") };
  }
  if (m === "free" || m === "complimentary") {
    return { student: "There was nothing to pay for this booking.", team: p.coupon ? `Free — coupon ${p.coupon}` : "Free" };
  }
  return { student: "If you already paid, Holis Wellness Center will contact you about your refund.", team: m ? `${m} ${amt}`.trim() : "—" };
}

type Event =
  | "student_added" | "student_updated" | "student_removed"
  | "booking_created" | "booking_cancelled"
  | "class_cancelled" | "class_reactivated"
  | "class_rescheduled" | "class_reassigned"
  | "pass_requested"
  | "teacher_welcome"
  | "private_class_cancelled";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, reason: "method_not_allowed" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, reason: "invalid_json" }, 400); }

  const event: Event = body?.event;
  const scheduleId: string = body?.scheduleId;
  const teacherId: string = body?.teacherId;
  const studentName: string = (body?.studentName ?? "").toString().slice(0, 120);
  // The booking the event is about (sent by the trigger for student events).
  const bookingId: string | null = typeof body?.bookingId === "string" ? body.bookingId : null;
  // What the teacher wrote when she cancelled or removed someone.
  const reasonGiven = String(body?.reason ?? "").trim().slice(0, 500);
  // A pass request belongs to a teacher, not to a class on the calendar.
  if (!event || (!scheduleId && !teacherId)) return json({ ok: false, reason: "missing_fields" }, 400);

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
    // ── Someone asked a teacher for a pass ──
    if (event === "pass_requested") {
      if (!TEACHER_EMAILS_ENABLED) return json({ ok: true, event, teacherEmailed: false, reason: "teacher_emails_off" });
      const { data: t } = await admin.from("teachers")
        .select("display_name, email").eq("id", teacherId).maybeSingle();
      if (!(t as any)?.email) return json({ ok: true, teacherEmailed: false, reason: "no_teacher_email" });

      const rows = [
        row("Pass", body?.passName ?? "Pass"),
        ...(body?.price ? [row("Price", "$" + body.price)] : []),
        ...(body?.className ? [row("For the class", body.className)] : []),
        row("Student", studentName || "Someone"),
        ...(body?.studentEmail ? [row("Email", body.studentEmail)] : []),
        ...(body?.studentPhone ? [row("Phone", body.studentPhone)] : []),
      ];
      const res = await sendEmail(
        (t as any).email,
        `${studentName || "Someone"} wants a pass with you`,
        shell(
          "Someone wants a pass with you",
          "They picked you on spaholis.com. Nothing has been paid — they pay you directly. " +
          "The request is waiting in your Teacher Panel under Students.",
          rows,
        ),
      );
      if (!res.ok) console.error("[notify-teacher] pass request email failed", res.error);
      return json({ ok: true, event, teacherEmailed: res.ok });
    }

    // ── A new teacher: how to open her panel ──
    // Sent by the database the moment her website account is linked to her —
    // whether the Admin invited her or she signed up herself.
    if (event === "teacher_welcome") {
      if (!TEACHER_EMAILS_ENABLED) return json({ ok: true, event, teacherEmailed: false, reason: "teacher_emails_off" });
      const { data: t } = await admin.from("teachers")
        .select("display_name, email, user_id").eq("id", teacherId).maybeSingle();
      const teacher: any = t;
      if (!teacher?.user_id) return json({ ok: true, teacherEmailed: false, reason: "not_linked" });
      const { data: u } = await admin.auth.admin.getUserById(teacher.user_id);
      const to = u?.user?.email || teacher.email;
      if (!to) return json({ ok: true, teacherEmailed: false, reason: "no_email" });

      // Never signed in (the Admin made her account): she chooses her password
      // first. Nobody on the team ever knows it.
      const firstTime = !u?.user?.last_sign_in_at;
      let passwordLink: string | null = null;
      if (firstTime) {
        const { data: link, error: lErr } = await admin.auth.admin.generateLink({
          type: "recovery", email: to, options: { redirectTo: `${SITE}/reset-password` },
        });
        passwordLink = (link as any)?.properties?.action_link ?? null;
        if (lErr || !passwordLink) console.error("[notify-teacher] could not make the password link", lErr?.message);
      }

      const first = String(teacher.display_name || "").trim().split(/\s+/)[0] || "there";
      const next = passwordLink
        ? `<p style="margin:20px 0 0;">${emailButton(passwordLink, "Choose my password")}</p>
           <p style="color:#6b6b6b;font-size:13px;line-height:1.5;margin:14px 0 0">
             Choose a password and you go straight to your Teacher Panel. The link works once and
             expires after a while — if it has, go to spaholis.com, press Sign in, then
             "Forgot password" with this email address.
           </p>`
        : `<p style="margin:20px 0 0;">${emailButton(`${SITE}/teacher`, "Open my Teacher Panel")}</p>
           <p style="color:#6b6b6b;font-size:13px;line-height:1.5;margin:14px 0 0">
             Sign in with this email address and your usual password. You also find it under
             My Account → Teacher Admin Panel.
           </p>`;
      const res = await sendEmail(
        to,
        "Welcome to the Holis teaching team",
        shell(
          "Welcome to the Holis teaching team",
          `Hi ${esc(first)} — you have been added as a teacher at Holis Wellness Center. In your ` +
          "Teacher Panel you see the studio's week and your classes, who signed up, your students " +
          "and notes, and the studio rent for the month.",
          [row("Your name on the schedule", teacher.display_name || ""), row("Sign in with", to)],
          next,
        ),
      );
      if (!res.ok) console.error("[notify-teacher] welcome email failed", res.error);
      return json({ ok: true, event, teacherEmailed: res.ok, firstTime });
    }

    // ── A teacher cancelled a private class: the guest, she and Holis ──
    if (event === "private_class_cancelled") {
      const { data: t } = await admin.from("teachers")
        .select("display_name, email").eq("id", teacherId).maybeSingle();
      const { data: bk } = await admin.from("bookings")
        .select("guest_name, guest_email, guest_phone, intake_form").eq("id", bookingId).maybeSingle();
      if (!bk) return json({ ok: false, reason: "booking_not_found" }, 404);
      const pc: any = (bk as any).intake_form?.private_class ?? {};
      const teacherName = String((t as any)?.display_name || pc.teacher_name || "your teacher").trim();
      const session: any = body?.session ?? null;
      const classTitle = String(session?.title || pc.class_title || pc.kind_title || "Private class").split(" · ")[0];
      const whenLine = session?.starts_at
        ? `${fmtDate.format(new Date(session.starts_at))} at ${fmtTime.format(new Date(session.starts_at))}`
        : pc.preferred ? `Not fixed yet (asked for: ${String(pc.preferred).slice(0, 200)})` : "Not fixed yet";
      const place = String(session?.location || [pc.location_label, pc.location_address].filter(Boolean).join(": ") || "");
      const people = Number(pc.people) || 0;
      const guestName = String((bk as any).guest_name || "Guest").trim();
      const firstName = guestName.split(/\s+/)[0] || "there";
      const reason = reasonGiven || NO_REASON;
      const rowsBasic = [
        detailsRow("Private class", esc(classTitle)),
        detailsRow("Teacher", esc(teacherName)),
        detailsRow("When", esc(whenLine)),
        ...(place ? [detailsRow("Where", esc(place))] : []),
        ...(people ? [detailsRow("People", String(people))] : []),
      ];
      const results: Record<string, unknown> = { event, guestEmailed: false, teacherEmailed: false };

      const guestEmail = String((bk as any).guest_email || "").trim();
      if (guestEmail) {
        const m = await fromTemplate(admin, "private_class_cancelled_guest", DEFAULTS.private_class_cancelled_guest,
          { first_name: firstName, guest_name: guestName, class_title: classTitle, teacher_name: teacherName, when: whenLine, reason },
          { details: detailsTable(rowsBasic) });
        const r = await sendEmail(guestEmail, m.subject, m.html);
        results.guestEmailed = r.ok;
        if (!r.ok) console.error("[notify-teacher] private guest email failed", r.error);
      }
      if (TEACHER_EMAILS_ENABLED && (t as any)?.email) {
        const r = await sendEmail((t as any).email, `You cancelled a private class — ${guestName}`, shell(
          "You cancelled a private class",
          `${esc(guestName)} and Holis have been emailed, with your reason.`,
          [row("Guest", guestName), ...(guestEmail ? [row("Email", guestEmail)] : []),
           ...((bk as any).guest_phone ? [row("Phone", String((bk as any).guest_phone))] : []),
           row("Private class", classTitle), row("When", whenLine), ...(place ? [row("Where", place)] : []),
           row("Reason", reason)],
        ));
        results.teacherEmailed = r.ok;
        if (!r.ok) console.error("[notify-teacher] private teacher email failed", r.error);
      }
      const team = await fromTemplate(admin, "team_private_class_cancelled", DEFAULTS.team_private_class_cancelled,
        { guest_name: guestName, teacher_name: teacherName, class_title: classTitle, when: whenLine, reason },
        { details: detailsTable([
          detailsRow("Guest", esc(guestName)),
          ...(guestEmail ? [detailsRow("Email", esc(guestEmail))] : []),
          ...((bk as any).guest_phone ? [detailsRow("Phone", esc((bk as any).guest_phone))] : []),
          ...rowsBasic,
          detailsRow("Reason", esc(reason)),
          detailsRow("Guest emailed", results.guestEmailed ? "Yes" : "No — no email address"),
        ]) });
      const tr = await sendTeam(team.subject, team.html);
      results.teamEmailed = tr.ok;
      return json({ ok: true, ...results });
    }

    const { data: sched } = await admin
      .from("class_schedule")
      .select("id, start_time, is_cancelled, cancel_reason, instructor, classes(title, instructor, location)")
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
    const teacherLabel = who || "your teacher";
    // Her reason, for a cancellation or a removal.
    const reason = reasonGiven || String((sched as any).cancel_reason ?? "").trim();
    // A removed student: the booking is gone, so the trigger sent its details.
    const removed: any = event === "student_removed" && body?.removed && typeof body.removed === "object" ? body.removed : null;
    const removedPay: PayInfo | null = removed ? {
      method: String(removed.payment_method ?? ""), status: String(removed.payment_status ?? ""),
      total: Number(removed.total_price) || 0, pass: !!removed.pass, coupon: String(removed.coupon_code ?? ""),
    } : null;

    // ── 1. Tell the teacher what happened to her class (off while Holis runs them) ──
    if (teacherEmail && TEACHER_EMAILS_ENABLED) {
      const copy: Record<string, { subject: string; intro: string }> = {
        student_added:     { subject: `New student in ${title}`,        intro: `A student was added to your class.` },
        student_updated:   { subject: `Student updated — ${title}`,     intro: `A student's details were updated.` },
        student_removed:   { subject: `Student removed — ${title}`,     intro: `A student was removed from your class.` },
        booking_created:   { subject: `New signup for ${title}`,        intro: `Someone just booked a spot in your class on spaholis.com.` },
        booking_cancelled: { subject: `Cancellation — ${title}`,        intro: `A student cancelled their spot in your class.` },
        class_cancelled:   { subject: `Class cancelled — ${title}`,     intro: `Your class was cancelled. Anyone who had signed up has been notified.` },
        class_reactivated: { subject: `Class reactivated — ${title}`,   intro: `Your class is back on the schedule.` },
        class_rescheduled: { subject: `New time — ${title}`,            intro: `Your class moved. Anyone who had signed up has been told the new time.` },
        class_reassigned:  { subject: `You have a class — ${title}`,    intro: `This class is now yours to teach.` },
      };
      const c = copy[event] ?? { subject: `Update — ${title}`, intro: "Your class was updated." };

      // How many are still coming, so she sees the class at a glance.
      const { data: rows } = await admin.from("class_bookings")
        .select("id, status").eq("schedule_id", scheduleId);
      const active = ((rows as any[]) ?? []).filter((r) => r.status !== "cancelled").length;

      // The student's details — who is coming, how to reach them, how they pay —
      // read from the booking itself, never from what the trigger was sent.
      let student: { name: string; email: string; phone: string; type: string; pays: string; id: string } | null = null;
      if (bookingId && ["booking_created", "booking_cancelled", "student_added", "student_updated"].includes(event)) {
        const { data: bk } = await admin.from("class_bookings")
          .select("guest_name, guest_email, guest_phone, client_type, payment_method, payment_status, total_price, coupon_code, id_document, id_document_type, local_discount")
          .eq("id", bookingId).maybeSingle();
        const b: any = bk;
        if (b) {
          const amount = Number(b.total_price) > 0 ? ` — $${Number(b.total_price).toFixed(2)}` : "";
          const method = String(b.payment_method ?? "");
          const status = String(b.payment_status ?? "");
          const pays =
            method === "cash" && status === "pending" ? `In cash, to you at the class${amount}${b.coupon_code ? ` — coupon ${b.coupon_code}` : ""}`
            : method === "cash" ? `Cash${amount}${status && status !== "paid" ? ` (${status})` : ""}`
            : method === "paypal" || method === "card"
              ? `Paid online to Holis${amount}${b.local_discount ? " — local discount (Costa Rican cédula)" : b.coupon_code ? ` — coupon ${b.coupon_code}` : ""}`
            : method === "compraclick" ? `CompraClick${amount}${status === "pending" ? " — not confirmed yet" : ""}`
            : method === "membership" || method === "credits" || method === "offering" ? "With a pass or membership"
            : method === "free" || method === "complimentary" ? (b.coupon_code ? `Free — coupon ${b.coupon_code}` : "Free")
            : method ? `${method}${amount}` : "";
          student = {
            name: String(b.guest_name ?? "").trim() || studentName,
            email: String(b.guest_email ?? "").trim(),
            phone: String(b.guest_phone ?? "").trim(),
            type: String(b.client_type ?? "").trim(),
            pays,
            // Their ID — a Costa Rican cédula she may check in class.
            id: String(b.id_document ?? "").trim()
              ? `${b.id_document_type === "cr_cedula" ? "Costa Rican cédula" : "Passport / other ID"} ${String(b.id_document).trim()}`
              : "",
          };
        }
      }

      if (removed && !student) {
        student = {
          name: String(removed.name ?? "").trim() || studentName,
          email: String(removed.email ?? "").trim(),
          phone: String(removed.phone ?? "").trim(),
          type: "",
          pays: removedPay ? paymentNote(removedPay, teacherLabel).team : "",
          id: "",
        };
      }
      const showReason = (event === "class_cancelled" || (event === "student_removed" && !!reason));
      const rowsHtml = [
        row("Class", title),
        row("When", when),
        ...(showReason ? [row("Reason", reason || NO_REASON)] : []),
        ...((student?.name || studentName) ? [row("Student", student?.name || studentName)] : []),
        ...(student?.email ? [row("Email", student.email)] : []),
        ...(student?.phone ? [row("Phone", student.phone)] : []),
        ...(student?.type ? [row("Client type", student.type)] : []),
        ...(student?.pays ? [row("Payment", student.pays)] : []),
        ...(student?.id ? [row("ID", student.id)] : []),
        row("Students signed up", String(active)),
        ...(cls.location ? [row("Location", cls.location)] : []),
      ];
      const res = await sendEmail(teacherEmail, c.subject, shell(c.subject, c.intro, rowsHtml));
      results.teacherEmailed = res.ok;
      if (!res.ok) console.error("[notify-teacher] teacher email failed", res.error);
    } else if (TEACHER_EMAILS_ENABLED) {
      console.warn("[notify-teacher] no teacher email for session", scheduleId, "instructor:", who);
    }

    // ── 2a. A cancelled class: every student (reason + their payment), then Holis ──
    if (event === "class_cancelled") {
      const { data: students } = await admin.from("class_bookings")
        .select("guest_name, guest_email, guest_phone, status, payment_method, payment_status, total_price, coupon_code, user_offering_id")
        .eq("schedule_id", scheduleId);
      const list = ((students as any[]) ?? []).filter((s) => s.status !== "cancelled");
      const reasonText = reason || NO_REASON;
      const classRows = detailsTable([
        detailsRow("Class", esc(title)), detailsRow("When", esc(when)), detailsRow("Teacher", esc(teacherLabel)),
        ...(cls.location ? [detailsRow("Location", esc(cls.location))] : []),
      ]);
      const teamRows: string[] = [];
      for (const s of list) {
        const pay: PayInfo = {
          method: String(s.payment_method ?? ""), status: String(s.payment_status ?? ""),
          total: Number(s.total_price) || 0, pass: !!s.user_offering_id, coupon: String(s.coupon_code ?? ""),
        };
        const note = paymentNote(pay, teacherLabel);
        let emailed = false;
        if (s.guest_email) {
          const name = String(s.guest_name || "").trim();
          const m = await fromTemplate(admin, "class_cancelled_student", DEFAULTS.class_cancelled_student,
            { first_name: name.split(/\s+/)[0] || "there", guest_name: name, class_title: title, when,
              teacher_name: teacherLabel, reason: reasonText, payment_note: note.student },
            { details: classRows, button: `<p style="margin:18px 0;">${emailButton(`${SITE}/classes/schedule`, "See the class schedule")}</p>` });
          const r = await sendEmail(s.guest_email, m.subject, m.html);
          emailed = r.ok;
          if (r.ok) results.studentsEmailed = (results.studentsEmailed as number) + 1;
          else console.error("[notify-teacher] student email failed", r.error);
        }
        teamRows.push(detailsRow(
          esc(s.guest_name || "Guest"),
          [s.guest_email ? esc(s.guest_email) : "", s.guest_phone ? esc(s.guest_phone) : "", `<strong>${esc(note.team)}</strong>`,
           emailed ? "Emailed" : "Not emailed (no email address)"].filter(Boolean).join("<br>"),
        ));
      }
      const team = await fromTemplate(admin, "team_class_cancelled", DEFAULTS.team_class_cancelled,
        { class_title: title, when, teacher_name: teacherLabel, reason: reasonText },
        {
          details: detailsTable([
            detailsRow("Class", esc(title)), detailsRow("When", esc(when)), detailsRow("Teacher", esc(teacherLabel)),
            detailsRow("Reason", esc(reasonText)), detailsRow("Students signed up", String(list.length)),
          ]),
          students: teamRows.length ? detailsTable(teamRows) : `<p style="font-size:13px;color:#666;margin:0;">Nobody had signed up.</p>`,
        });
      const tr = await sendTeam(team.subject, team.html);
      results.teamEmailed = tr.ok;
    }

    // ── 2b. A student she removed: the student (if she chose so) and Holis ──
    if (event === "student_removed" && removed) {
      const name = String(removed.name || studentName || "").trim();
      const note = removedPay ? paymentNote(removedPay, teacherLabel) : { student: "", team: "" };
      const reasonText = reason || "Your booking could not be kept.";
      const studentEmail = String(removed.email ?? "").trim();
      // Only a booking that was still on: a cancelled one has had its email.
      const wasActive = String(removed.status ?? "") !== "cancelled";
      let studentEmailed = false;
      if (body?.notifyStudent && studentEmail && wasActive) {
        const m = await fromTemplate(admin, "class_student_removed", DEFAULTS.class_student_removed,
          { first_name: name.split(/\s+/)[0] || "there", guest_name: name, class_title: title, when,
            teacher_name: teacherLabel, reason: reasonText, payment_note: note.student },
          {
            details: detailsTable([detailsRow("Class", esc(title)), detailsRow("When", esc(when)), detailsRow("Teacher", esc(teacherLabel))]),
            button: `<p style="margin:18px 0;">${emailButton(`${SITE}/classes/schedule`, "See the class schedule")}</p>`,
          });
        const r = await sendEmail(studentEmail, m.subject, m.html);
        studentEmailed = r.ok;
        if (!r.ok) console.error("[notify-teacher] removed student email failed", r.error);
      }
      results.studentEmailed = studentEmailed;
      if (body?.byTeacher) {
        const team = await fromTemplate(admin, "team_student_removed", DEFAULTS.team_student_removed,
          { guest_name: name || "A student", class_title: title, when, teacher_name: teacherLabel, reason: reasonText,
            student_notice: studentEmailed ? "The student has been emailed."
              : body?.notifyStudent ? "The student could not be emailed (no email address)."
              : "The teacher chose not to email the student." },
          { details: detailsTable([
            detailsRow("Class", esc(title)), detailsRow("When", esc(when)), detailsRow("Teacher", esc(teacherLabel)),
            detailsRow("Student", esc(name || "—")),
            ...(studentEmail ? [detailsRow("Email", esc(studentEmail))] : []),
            ...(removed.phone ? [detailsRow("Phone", esc(removed.phone))] : []),
            ...(note.team ? [detailsRow("Payment", `<strong>${esc(note.team)}</strong>`)] : []),
            detailsRow("Reason", esc(reasonText)),
          ]) });
        const tr = await sendTeam(team.subject, team.html);
        results.teamEmailed = tr.ok;
      }
    }

    // ── 2c. A moved class must reach the students who signed up ──
    if (event === "class_rescheduled") {
      const { data: students } = await admin.from("class_bookings")
        .select("guest_name, guest_email, status").eq("schedule_id", scheduleId);
      const recipients = ((students as any[]) ?? [])
        .filter((s) => s.status !== "cancelled" && s.guest_email);

      for (const s of recipients) {
        const html = shell(
          "Your class has a new time",
          `<strong>${esc(title)}</strong> has moved. The new time is ${esc(when)}.`,
          [row("Class", title), row("New time", when)],
          `<p style="color:#6b6b6b;font-size:13px;line-height:1.5;margin-top:16px">
             If the new time does not work for you, just reply to this email and the Holis team will help you.
             You can see every class on the
             <a href="${SITE}/classes/schedule" style="color:#7b9d87">class schedule</a>.
           </p>`,
        );
        const r = await sendEmail(s.guest_email, `New time: ${title} — ${when}`, html);
        if (r.ok) results.studentsEmailed = (results.studentsEmailed as number) + 1;
        else console.error("[notify-teacher] student email failed", r.error);
      }
      // No signups → nobody is emailed, which is the desired behaviour.
    }

    // ── A class that changed hands: the teacher losing it has to know ──
    if (TEACHER_EMAILS_ENABLED && event === "class_reassigned" && body?.previousTeacher) {
      const prev = String(body.previousTeacher).trim();
      if (prev && prev.toLowerCase() !== who.toLowerCase()) {
        const { data: p } = await admin.from("teachers")
          .select("email").ilike("display_name", prev).maybeSingle();
        if ((p as any)?.email) {
          const r = await sendEmail(
            (p as any).email,
            `${who || "Another teacher"} is taking ${title}`,
            shell(
              "Your class changed hands",
              `<strong>${esc(who || "Another teacher")}</strong> put their name on this class, so you are ` +
              "not expected to teach it. If that is wrong, put your name back on it in your panel.",
              [row("Class", title), row("When", when), row("Now taught by", who || "—")],
            ),
          );
          results.previousTeacherEmailed = r.ok;
          if (!r.ok) console.error("[notify-teacher] previous teacher email failed", r.error);
        }
      }
    }

    return json({ ok: true, ...results });
  } catch (err) {
    console.error("[notify-teacher] failed", { message: (err as Error).message });
    // Never fail the caller's action because of email.
    return json({ ok: false, reason: "notify_failed", message: (err as Error).message }, 200);
  }
});
