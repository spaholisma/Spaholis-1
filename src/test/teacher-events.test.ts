import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eventProblem, spaInstant } from "@/components/teacher/TeacherEvents";

// Teachers make their own events: a "Special Event" class that belongs to her.
const read = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8").replace(/\r\n/g, "\n");
const sql = read("supabase/migrations/20261007120000_teacher_events.sql");

const draft = (over: Record<string, unknown> = {}) => ({
  id: null, title: "Wellness Sunday", description: "", image_url: "", price: "45", price_label: "",
  max_capacity: "12", duration_minutes: "180", location: "Holis Wellness Center", is_active: true,
  date: "2099-01-04", time: "08:00", ...over,
}) as any;

describe("the event form", () => {
  it("accepts a complete event", () => {
    expect(eventProblem(draft(), true)).toBeNull();
  });
  it("asks for what is missing", () => {
    expect(eventProblem(draft({ title: "x" }), true)).toMatch(/title/);
    expect(eventProblem(draft({ price: "-3" }), true)).toMatch(/price/);
    expect(eventProblem(draft({ max_capacity: "0" }), true)).toMatch(/Spots/);
    expect(eventProblem(draft({ duration_minutes: "5" }), true)).toMatch(/duration/);
    expect(eventProblem(draft({ date: "" }), true)).toMatch(/date/);
    expect(eventProblem(draft({ date: "2000-01-01" }), true)).toMatch(/future/);
  });
  it("a free event is fine (price left empty)", () => {
    expect(eventProblem(draft({ price: "" }), true)).toBeNull();
  });
  it("editing does not ask for a first date again", () => {
    expect(eventProblem(draft({ id: "x", date: "", time: "" }), false)).toBeNull();
  });
  it("times are Costa Rica time (UTC-6)", () => {
    expect(spaInstant("2027-04-01", "09:30").toISOString()).toBe("2027-04-01T15:30:00.000Z");
  });
});

describe("the database", () => {
  it("an event belongs to its teacher", () => {
    expect(sql).toMatch(/add column if not exists teacher_id uuid references public\.teachers\(id\)/);
  });
  it("is a Special Event in her name, paid when it has a price", () => {
    expect(sql).toMatch(/v_title, v_desc, 'Special Event', v_name,/);
    expect(sql).toMatch(/requires_payment = v_price > 0/);
  });
  it("she can only edit, switch off or delete her own", () => {
    expect(sql).toMatch(/where id = _id and teacher_id = v_teacher\s+returning id into v_id;/);
    expect(sql.match(/raise exception 'That event is not yours'/g)?.length).toBe(3);
  });
  it("a booked event cannot be deleted — only switched off", () => {
    expect(sql).toMatch(/Someone has booked this event, so it cannot be deleted/);
  });
  it("only signed-in people can call the functions", () => {
    expect(sql).toMatch(/revoke all on function public\.teacher_delete_event\(uuid\) from public;/);
    expect(sql).toMatch(/grant execute on function public\.teacher_delete_event\(uuid\) to authenticated;/);
  });
});

describe("the panel", () => {
  it("has an Events tab", () => {
    const panel = read("src/pages/TeacherPanel.tsx");
    expect(panel).toMatch(/\{ value: "events", label: "Events", icon: Sparkles \}/);
    expect(panel).toMatch(/<TeacherEvents teacherId=\{teacher\.id\} teacherName=\{teacher\.display_name\} \/>/);
  });
  it("events land where the Classes page shows them", () => {
    expect(read("src/pages/Classes.tsx")).toMatch(/"Special Event"/);
  });
});
