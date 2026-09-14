import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { closureRanges, datesBetween, spaDateKey } from "@/lib/classClosures";

// Closed days for classes. A class booking is created by at least seven
// paths, so the database is what refuses it; these checks keep every layer
// pointed at the same list.
const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

describe("closed-day dates", () => {
  it("expands a range, both ends included", () => {
    expect(datesBetween("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(datesBetween("2026-10-05", "2026-10-05")).toEqual(["2026-10-05"]);
  });

  it("covers all of October", () => {
    expect(datesBetween("2026-10-01", "2026-10-31")).toHaveLength(31);
  });

  // An 8 PM class on 30 September is 02:00 UTC on 1 October. Closing October
  // must not hide it; the date that counts is the Costa Rica one.
  it("dates a session by the Costa Rica calendar, not UTC", () => {
    expect(spaDateKey("2026-10-01T02:00:00Z")).toBe("2026-09-30");
    expect(spaDateKey("2026-10-01T06:00:00Z")).toBe("2026-10-01");
  });
});

describe("closed days on the public Class Schedule", () => {
  const day = (closed_date: string, reason: string | null) => ({ id: closed_date, closed_date, reason });

  it("merges consecutive days with the same message into one notice", () => {
    const msg = "We are on vacation - see you on November 1st!";
    expect(closureRanges([day("2026-10-17", msg), day("2026-10-16", msg), day("2026-10-18", msg)]))
      .toEqual([{ from: "2026-10-16", to: "2026-10-18", message: msg }]);
  });

  it("keeps a gap or a different message as separate notices", () => {
    expect(closureRanges([day("2026-10-01", "A"), day("2026-10-03", "A"), day("2026-10-04", "B")])).toHaveLength(3);
  });

  it("shows Closed Day with the message on the schedule", () => {
    expect(read("src/pages/ClassesCalendar.tsx")).toContain("closures={closures}");
    const cal = read("src/components/WeeklyClassCalendar.tsx");
    expect(cal).toContain("Closed Day");
    expect(cal).toContain("r.message");
    expect(read("src/components/admin/ClassClosuresDialog.tsx")).toContain("clients see it on the Class Schedule");
  });
});

describe("closed days are enforced everywhere", () => {
  const sql = read("supabase/migrations/20260914130000_class_closures.sql").replace(/--.*$/gm, "");

  it("refuses a class booking on a closed day, by any path", () => {
    expect(sql).toMatch(/before insert on public\.class_bookings/i);
    expect(sql).toMatch(/is_class_day_closed\(v_start\)/);
  });

  it("refuses a session scheduled on, or moved onto, a closed day", () => {
    expect(sql).toMatch(/before insert or update of start_time on public\.class_schedule/i);
  });

  it("dates closures in Costa Rica time", () => {
    expect(sql).toContain("(_at at time zone 'America/Costa_Rica')::date");
  });

  it("stops PayPal before any money is taken", () => {
    expect(read("supabase/functions/paypal-create-order/index.ts")).toContain('reason: "class_day_closed"');
    expect(read("supabase/functions/create-class-booking/index.ts")).toContain('reason: "class_day_closed"');
  });

  it("hides closed days on the website", () => {
    const hooks = read("src/hooks/useClasses.ts");
    expect(hooks.split("!closed.has(spaDateKey(s.start_time))").length - 1).toBe(2);
    expect(read("src/pages/ClassBooking.tsx")).toContain("We are closed on this day");
  });

  it("skips closed days when generating the weekly schedule", () => {
    expect(read("src/components/admin/AdminWeeklySchedule.tsx")).toContain("if (closedDays.has(spaDateKey(d)))");
  });
});
