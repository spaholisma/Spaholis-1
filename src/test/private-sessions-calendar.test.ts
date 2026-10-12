import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sessionLocation, sessionTitle } from "@/components/teacher/TeacherPrivateClasses";

const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8").replace(/\r\n/g, "\n");
const sql = read("supabase/migrations/20261013120000_private_sessions_calendar.sql");

describe("private classes on the teachers' calendar", () => {
  it("their own table — never the public schedule (class_schedule)", () => {
    expect(sql).toMatch(/create table if not exists public\.teacher_private_sessions/);
    const fn = sql.slice(sql.indexOf("function public.teacher_schedule_private_class"), sql.indexOf("function public.teacher_remove_private_session"));
    expect(fn).not.toMatch(/class_schedule/);
    expect(fn).toMatch(/insert into public\.teacher_private_sessions/);
  });

  it("only from one of her own requests, and it marks the request scheduled", () => {
    const fn = sql.slice(sql.indexOf("function public.teacher_schedule_private_class"), sql.indexOf("function public.teacher_remove_private_session"));
    expect(fn).toMatch(/v_teacher uuid := public\.current_teacher_id\(\)/);
    expect(fn).toMatch(/norm_name\(b\.intake_form->'private_class'->>'teacher_name'\) = public\.norm_name\(t\.display_name\)/);
    expect(fn).toMatch(/raise exception 'Not your request'/);
    expect(fn).toMatch(/set status = 'scheduled'/);
  });

  it("teachers only; a colleague's private class shows as a busy slot, without the guest", () => {
    const fn = sql.slice(sql.indexOf("function public.teacher_calendar_private_sessions"));
    expect(fn).toMatch(/where public\.current_teacher_id\(\) is not null/);
    expect(fn).toMatch(/case when s\.teacher_id = public\.current_teacher_id\(\) then s\.guest_name end/);
    expect(fn).toMatch(/else 'Private class' end/);
    expect(sql).toMatch(/revoke all on function public\.teacher_calendar_private_sessions\(timestamptz, timestamptz\) from public, anon;/);
    // The table itself is not readable from the website (RLS: the team only).
    expect(sql).toMatch(/alter table public\.teacher_private_sessions enable row level security;/);
    expect(sql).toMatch(/create policy tps_admin_read on public\.teacher_private_sessions\s+for select using \(public\.has_role\(auth\.uid\(\), 'super_admin'\)/);
  });

  it("the email function may now read her price (it always said 'to be confirmed')", () => {
    expect(sql).toMatch(/grant execute on function public\.private_offering_price\(uuid, text, integer\) to service_role;/);
  });

  it("the requests show her price after the local discount or coupon, the ID and the calendar date", () => {
    const fn = sql.slice(sql.indexOf("create function public.teacher_private_class_requests"));
    expect(fn).toMatch(/public\.teacher_price\(/);
    expect(fn).toMatch(/left join public\.teacher_private_sessions ps on ps\.booking_id = q\.id/);
    expect(fn).toMatch(/session_starts_at timestamptz/);
  });

  it("the calendar shows them; the panel puts them there", () => {
    const cal = read("src/components/teacher/TeacherSchedule.tsx");
    expect(cal).toMatch(/sb\.rpc\("teacher_calendar_private_sessions"/);
    expect(cal).toMatch(/<PrivateSlotCard key=\{p\.id\} slot=\{p\} \/>/);
    const panel = read("src/components/teacher/TeacherPrivateClasses.tsx");
    expect(panel).toMatch(/sb\.rpc\("teacher_schedule_private_class"/);
    expect(panel).toMatch(/"Add to my calendar"/);
    // The "when you're free" note is gone from her panel.
    expect(panel).not.toMatch(/When you're free/);
    expect(panel).not.toMatch(/private_class_note/);
    expect(sessionTitle({ class_title: "Cardio Vascular Breathwork", kind_title: "Couple's Private Class", guest_name: "Ana" }))
      .toBe("Cardio Vascular Breathwork · Ana");
    expect(sessionLocation({ location_label: "Client's location", location_address: "Villa Sol" })).toBe("Client's location: Villa Sol");
  });
});

describe("the private-class email to the teacher", () => {
  const fn = read("supabase/functions/send-private-class-request/index.ts");
  it("tells her what to check about the place the guest chose", () => {
    expect(fn).toMatch(/please contact Holis Wellness Center \(\$\{HOLIS_CONTACT\}\) to check that the studio is available/);
    expect(fn).toMatch(/confirm the details directly with the guest — exact address, access, parking and the space available/);
    expect(fn).toMatch(/detailRows \+ guestRows,\n\s+placeBox \+/);
  });
});

describe("the private-class dropdown", () => {
  it("one teacher per class (see private-class-request.test.ts)", () => {
    expect(read("src/lib/privateClassRequest.ts")).toMatch(/const name = e\.next \|\| e\.own \|\| e\.last;/);
  });
});
