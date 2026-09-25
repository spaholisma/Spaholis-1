import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Teacher Panel → Private classes: her requests, her own note, and the
// studio's prices read-only.
const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

const sql = read("supabase/migrations/20260917120000_teacher_private_classes.sql").replace(/--.*$/gm, "");
const panel = read("src/pages/TeacherPanel.tsx");
const view = read("src/components/teacher/TeacherPrivateClasses.tsx");

describe("private classes in the Teacher Panel", () => {
  it("is a tab of its own", () => {
    expect(panel).toContain('{ value: "private", label: "Private classes"');
    expect(panel).toContain("<TeacherPrivateClasses");
  });

  it("shows a teacher only the requests that named her", () => {
    expect(sql).toContain("create or replace function public.teacher_private_class_requests()");
    expect(sql).toContain("public.norm_name(b.intake_form->'private_class'->>'teacher_name') = public.norm_name(t.display_name)");
    expect(sql).toContain("join public.teachers t on t.id = public.current_teacher_id()");
  });

  it("lets her write only a status and a note, on her own request", () => {
    expect(sql).toContain("_status not in ('new', 'replied', 'scheduled', 'declined')");
    expect(sql).toContain("raise exception 'Not your request'");
    expect(view).toContain('sb.rpc("teacher_set_private_class_status"');
  });

  it("keeps bookings closed to teachers — no new access to the table itself", () => {
    expect(sql).not.toMatch(/create policy[^;]*on public\.bookings/i);
    expect(sql).not.toMatch(/grant[^;]*on public\.bookings/i);
  });

  it("lets her set her own private classes and prices — never the studio's", () => {
    expect(view).toContain("<TeacherPrivateOfferingsEditor teacherId={teacherId} teacherName={teacherName} />");
    expect(view).not.toContain("Prices set by Holis");
    expect(view).not.toMatch(/from\("services"\)[^;]*update|privateSessions[^;]*update/);
  });

  it("matches the name as a person reads it, ignoring capitals and extra spaces", () => {
    // "Zhijian  Chen " and "zhijian chen" are the same teacher.
    expect(sql).toContain(String.raw`regexp_replace(btrim(coalesce(_v, '')), '\s+', ' ', 'g')`);
  });

  it("adds her own note without touching anything else", () => {
    expect(sql).toContain("alter table public.teachers add column if not exists private_class_note text");
    expect(sql).not.toMatch(/\bdrop table\b|\bdelete from\b|\btruncate\b/i);
  });
});
