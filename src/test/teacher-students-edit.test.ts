import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// A teacher can edit every student on her list. For one who came from a
// booking, her edit is her own record tied to them (source_key) — the booking
// itself is never changed.
const read = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8").replace(/\r\n/g, "\n");

describe("editing a teacher's students", () => {
  const ui = read("src/components/teacher/TeacherStudents.tsx");
  const sql = read("supabase/migrations/20261004120000_teacher_students_source_key.sql");

  it("the database keeps one edit per booked student, per teacher", () => {
    expect(sql).toMatch(/add column if not exists source_key text/);
    expect(sql).toMatch(/on public\.teacher_students \(teacher_id, source_key\)\s+where source_key is not null/);
  });

  it("every student has an Edit button — not only the ones she added", () => {
    expect(ui).not.toMatch(/\{s\.bookId && \(\s*<span className="mt-1 flex items-center gap-2">/);
    expect(ui).toMatch(/\{s\.edited \? "Undo changes" : "Remove"\}/);
  });

  it("editing a booked student saves her own record, never the booking", () => {
    expect(ui).toMatch(/teacher_id: teacherId, source_key: editing\.key, name,/);
    expect(ui).not.toMatch(/from\("class_bookings"\)\s*\.update/);
  });

  it("her edit wins over the booking's details in her list", () => {
    expect(ui).toMatch(/const cur = map\.get\(b\.source_key\);/);
    expect(ui).toMatch(/cur\.name = b\.name\.trim\(\) \|\| cur\.name;/);
  });
});
