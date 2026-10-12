import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { useReasonPrompt, reasonReady, type ReasonAnswer } from "@/hooks/useReasonPrompt";

const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8").replace(/\r\n/g, "\n");
const sql = read("supabase/migrations/20261013150000_cancellation_emails.sql");
const fnOf = (name: string) => {
  const at = sql.indexOf(`function public.${name}`);
  return sql.slice(at, sql.indexOf("$$;", at));
};
const nt = read("supabase/functions/notify-teacher/index.ts");

describe("the database", () => {
  it("a cancelled class keeps her reason, and a class paid with a pass goes back on the pass", () => {
    expect(sql).toMatch(/alter table public\.class_schedule add column if not exists cancel_reason text;/);
    const fn = fnOf("class_schedule_cancel_refunds");
    expect(fn).toMatch(/if new\.is_cancelled and not coalesce\(old\.is_cancelled, false\) then/);
    expect(fn).toMatch(/perform public\.refund_class_credit\(b\.id, b\.user_offering_id\)/);
    expect(fn).toMatch(/b\.status <> 'cancelled'\s+and b\.user_offering_id is not null/);
    expect(sql).toMatch(/after update of is_cancelled on public\.class_schedule/);
  });

  it("removing a student: only her own class (or the team), a reason, her choice to email the student", () => {
    const fn = fnOf("teacher_remove_class_student");
    expect(fn).toMatch(/public\.is_own_class_session\(v_schedule\)/);
    expect(fn).toMatch(/raise exception 'Please write the reason'/);
    expect(fn).toMatch(/set_config\('holis\.remove_reason', v_reason, true\)/);
    expect(fn).toMatch(/set_config\('holis\.remove_notify', case when coalesce\(_notify_student, true\) then 'on' else 'off' end, true\)/);
    expect(fn).toMatch(/delete from public\.class_bookings where id = _booking_id;/);
    expect(sql).toMatch(/revoke all on function public\.teacher_remove_class_student\(uuid, text, boolean\) from public, anon;/);
  });

  it("the trigger sends the removed student's details and the reason (the row is gone by then)", () => {
    const fn = fnOf("notify_teacher_event");
    expect(fn).toMatch(/'removed', jsonb_build_object\(\n\s+'name', old\.guest_name, 'email', old\.guest_email/);
    expect(fn).toMatch(/'pass', old\.user_offering_id is not null/);
    expect(fn).toMatch(/'notifyStudent', coalesce\(current_setting\('holis\.remove_notify', true\), ''\) = 'on'/);
    expect(fn).toMatch(/'byTeacher', coalesce\(current_setting\('holis\.remove_by_teacher', true\), ''\) = 'on'/);
    expect(fn).toMatch(/v_extra := jsonb_build_object\('reason', nullif\(btrim\(coalesce\(new\.cancel_reason, ''\)\), ''\)\);/);
    expect(fn).toMatch(/'studentName', v_name, 'previousTeacher', v_prev, 'bookingId', v_booking\) \|\| v_extra/);
    // Everything it did before is still there.
    expect(fn).toMatch(/holis\.quiet_teacher_notify/);
    expect(fn).toMatch(/v_event := 'class_reassigned';/);
    expect(fn).toMatch(/v_event := 'student_updated';/);
    expect(fn).toMatch(/exception when others then/);
  });

  it("cancelling a private class: hers only, a reason, off the calendar, and the email is sent", () => {
    const fn = fnOf("teacher_cancel_private_class");
    expect(fn).toMatch(/norm_name\(b\.intake_form->'private_class'->>'teacher_name'\) = public\.norm_name\(t\.display_name\)/);
    expect(fn).toMatch(/raise exception 'Please write the reason'/);
    expect(fn).toMatch(/delete from public\.teacher_private_sessions where booking_id = _booking_id/);
    expect(fn).toMatch(/on conflict \(booking_id\) do update set status = 'cancelled'/);
    expect(fn).toMatch(/'event', 'private_class_cancelled', 'teacherId', v_teacher, 'bookingId', _booking_id/);
    // A private request is a row in bookings: its status is never touched (that
    // would send a treatment-cancellation email).
    expect(fn).not.toMatch(/update public\.bookings/);
  });

  it("six editable emails, none overwritten if they exist", () => {
    for (const k of ["class_cancelled_student", "class_student_removed", "private_class_cancelled_guest",
      "team_class_cancelled", "team_student_removed", "team_private_class_cancelled"]) {
      expect(sql).toContain(`'${k}'`);
      expect(nt).toContain(`"${k}"`);
    }
    expect(sql).toMatch(/on conflict \(template_key\) do nothing;/);
  });
});

describe("the emails (notify-teacher)", () => {
  it("Holis gets a copy of every cancellation and removal by a teacher", () => {
    expect(nt).toMatch(/const ADMIN_EMAIL = "info@spaholis\.com";/);
    expect(nt).toMatch(/const ADMIN_BACKUP_EMAIL = "spaholisma@gmail\.com";/);
    expect(nt.match(/await sendTeam\(team\.subject, team\.html\)/g)).toHaveLength(3);
  });

  it("each student of a cancelled class: the reason and what happens to their payment", () => {
    const block = nt.slice(nt.indexOf('if (event === "class_cancelled") {'), nt.indexOf("// ── 2b."));
    expect(block).toMatch(/fromTemplate\(admin, "class_cancelled_student"/);
    expect(block).toMatch(/reason: reasonText, payment_note: note\.student/);
    expect(block).toMatch(/fromTemplate\(admin, "team_class_cancelled"/);
    expect(nt).toMatch(/You paid \$\{amt\} online — Holis Wellness Center will contact you about your refund\./);
    expect(nt).toMatch(/The class has been returned to your pass, so you can use it for another class\./);
    expect(nt).toMatch(/You had not paid yet, so there is nothing to pay\./);
    expect(nt).toMatch(/Paid online to Holis \$\{amt\} — refund needed/);
    expect(nt).toMatch(/const money = \(n: number\) => `\$\$\{n\.toFixed\(2\)\}`;/);
    // The old line that sent people to the teacher for their money is gone.
    expect(nt).not.toMatch(/If you already paid, please contact your teacher directly\./);
  });

  it("a removed student is emailed only when she chose so, and only if the booking was still on", () => {
    const block = nt.slice(nt.indexOf("// ── 2b."), nt.indexOf("// ── 2c."));
    expect(block).toMatch(/if \(body\?\.notifyStudent && studentEmail && wasActive\)/);
    expect(block).toMatch(/fromTemplate\(admin, "class_student_removed"/);
    expect(block).toMatch(/if \(body\?\.byTeacher\) \{/);
    expect(block).toMatch(/"The teacher chose not to email the student\."/);
  });

  it("a private class cancelled: the guest, the teacher and Holis", () => {
    const block = nt.slice(nt.indexOf('if (event === "private_class_cancelled") {'), nt.indexOf('.from("class_schedule")'));
    expect(block).toMatch(/fromTemplate\(admin, "private_class_cancelled_guest"/);
    expect(block).toMatch(/sendEmail\(\(t as any\)\.email, `You cancelled a private class — \$\{guestName\}`/);
    expect(block).toMatch(/fromTemplate\(admin, "team_private_class_cancelled"/);
  });

  it("what the teacher writes is escaped in every email", () => {
    expect(nt).toMatch(/for \(const \[k, v\] of Object\.entries\(text\)\) vars\[k\] = esc\(v\);/);
    expect(nt).toMatch(/detailsRow\("Reason", esc\(reasonText\)\)/);
  });
});

describe("the Teacher Panel", () => {
  it("cancelling a class asks for the reason and saves it with the cancellation", () => {
    for (const f of ["src/pages/TeacherPanel.tsx", "src/components/teacher/TeacherSchedule.tsx"]) {
      const page = read(f);
      expect(page).toMatch(/const a = await askReason\(\{\n\s+title: "Cancel this class\?"/);
      expect(page).toMatch(/\.update\(\{ is_cancelled: cancel, cancel_reason: reason \}\)/);
      expect(page).toMatch(/\{reasonDialog\}/);
    }
  });

  it("removing a student goes through the server function, with the reason and the email choice", () => {
    const page = read("src/pages/TeacherPanel.tsx");
    expect(page).toMatch(/sb\.rpc\("teacher_remove_class_student", \{\n\s+_booking_id: a\.id, _reason: answer\.reason, _notify_student: !!a\.guest_email && answer\.notify,/);
    expect(page).not.toMatch(/from\("class_bookings"\)\.delete\(\)/);
  });

  it("private classes can be cancelled from the requests and from the calendar", () => {
    const panel = read("src/components/teacher/TeacherPrivateClasses.tsx");
    expect(panel).toMatch(/sb\.rpc\("teacher_cancel_private_class", \{ _booking_id: bookingId, _reason: a\.reason \}\)/);
    expect(panel.match(/Cancel this private class/g)!.length).toBeGreaterThanOrEqual(3);
    expect(panel).toMatch(/export const privateClassOpen = \(status: string\) => status !== "declined" && status !== "cancelled";/);
  });

  it("Admin → Client Emails lists the new emails with their variables", () => {
    const admin = read("src/components/admin/AdminEmailTemplates.tsx");
    expect(admin).toMatch(/class_changes: "Class changes by teachers \(cancellations & removals\)"/);
    expect(admin).toMatch(/"class", "class_changes", "treatment"/);
    expect(admin).toMatch(/team_class_cancelled: \["class_title", "when", "teacher_name", "reason", "details", "students"\]/);
  });
});

describe("the reason window", () => {
  function Harness({ onAnswer, notify }: { onAnswer: (a: ReasonAnswer | null) => void; notify?: boolean }) {
    const { askReason, reasonDialog } = useReasonPrompt();
    return (
      <>
        <button id="go" onClick={async () => onAnswer(await askReason({
          title: "Cancel this class?", confirmLabel: "Cancel the class",
          notifyLabel: notify ? "Email Ana too" : undefined,
        }))}>go</button>
        {reasonDialog}
      </>
    );
  }
  const type = (el: HTMLTextAreaElement, v: string) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    act(() => { setter.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); });
  };
  const button = (label: string) =>
    Array.from(document.querySelectorAll("button")).find((b) => b.textContent === label) as HTMLButtonElement;

  it("will not go on without a reason, then answers with it", async () => {
    document.body.innerHTML = "";
    let answer: ReasonAnswer | null | undefined;
    const el = document.createElement("div"); document.body.appendChild(el);
    act(() => createRoot(el).render(<Harness onAnswer={(a) => { answer = a; }} />));
    act(() => { (document.getElementById("go") as HTMLButtonElement).click(); });
    act(() => { button("Cancel the class").click(); });
    expect(document.body.textContent).toMatch(/Please write the reason — it goes in the emails\./);
    expect(answer).toBeUndefined();
    type(document.querySelector("textarea")!, "  I am unwell  ");
    await act(async () => { button("Cancel the class").click(); });
    expect(answer).toEqual({ reason: "I am unwell", notify: true });
  });

  it("the student email can be unticked", async () => {
    document.body.innerHTML = "";
    let answer: ReasonAnswer | null | undefined;
    const el = document.createElement("div"); document.body.appendChild(el);
    act(() => createRoot(el).render(<Harness notify onAnswer={(a) => { answer = a; }} />));
    act(() => { (document.getElementById("go") as HTMLButtonElement).click(); });
    expect(document.body.textContent).toMatch(/Email Ana too/);
    act(() => { (document.querySelector('[role="checkbox"]') as HTMLButtonElement).click(); });
    type(document.querySelector("textarea")!, "Added by mistake");
    await act(async () => { button("Cancel the class").click(); });
    expect(answer).toEqual({ reason: "Added by mistake", notify: false });
  });

  it("a reason is a few letters at least", () => {
    expect(reasonReady("")).toBe(false);
    expect(reasonReady("  no ")).toBe(false);
    expect(reasonReady("sick")).toBe(true);
  });
});
