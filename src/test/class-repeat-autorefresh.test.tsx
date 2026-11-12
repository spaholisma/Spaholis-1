import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MAX_REPEAT_SESSIONS, planRepeat, repeatDates, weekdayOf } from "@/lib/classRepeat";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";

// 2026-11: a class session can repeat every week on chosen weekdays until a
// last date, and the admin calendars refresh themselves every few seconds so
// several people working at once see each other's changes.

const read = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8").replace(/\r\n/g, "\n");

describe("repeating a class session", () => {
  it("every Monday from the first date to the last, both included", () => {
    // 2026-11-16 is a Monday.
    expect(weekdayOf("2026-11-16")).toBe(1);
    expect(repeatDates("2026-11-16", [1], "2026-12-14")).toEqual([
      "2026-11-16", "2026-11-23", "2026-11-30", "2026-12-07", "2026-12-14",
    ]);
  });

  it("several weekdays, across a month and a year end", () => {
    expect(repeatDates("2026-12-28", [1, 3], "2027-01-06")).toEqual([
      "2026-12-28", "2026-12-30", "2027-01-04", "2027-01-06",
    ]);
  });

  it("the first date counts only when it is one of the weekdays", () => {
    // Tuesday first date, Mondays only.
    expect(repeatDates("2026-11-17", [1], "2026-11-30")).toEqual(["2026-11-23", "2026-11-30"]);
  });

  it("nothing when the last date is before the first, or no weekday is chosen", () => {
    expect(repeatDates("2026-11-16", [1], "2026-11-01")).toEqual([]);
    expect(repeatDates("2026-11-16", [], "2026-12-31")).toEqual([]);
  });

  it("skips closed days and the dates that already have this class at that time", () => {
    const plan = planRepeat(
      ["2026-11-16", "2026-11-23", "2026-11-30"], "08:00",
      new Set(["2026-11-23"]), new Set(["2026-11-30 08:00", "2026-11-16 09:00"]),
    );
    expect(plan).toEqual({ create: ["2026-11-16"], closed: ["2026-11-23"], existing: ["2026-11-30"], tooMany: false });
  });

  it("refuses more than a year of sessions in one go", () => {
    const daily = repeatDates("2026-01-01", [0, 1, 2, 3, 4, 5, 6], "2027-12-31");
    expect(planRepeat(daily, "08:00", new Set()).tooMany).toBe(true);
    expect(planRepeat(daily, "08:00", new Set()).create).toHaveLength(MAX_REPEAT_SESSIONS);
  });

  it("is offered only when creating, and inserts every session at once", () => {
    const cal = read("src/components/admin/AdminClassCalendarWithAttendees.tsx");
    expect(cal).toMatch(/\{!editingId && \(\(\) => \{/);
    expect(cal).toMatch(/Repeat every week/);
    expect(cal).toMatch(/const plan = planRepeat\(dates, form\.time, closedDays, existingStarts\);/);
    expect(cal).toMatch(/await supabase\.from\("class_schedule"\)\.insert\(rows as any\);/);
    // A new session starts without repeating.
    expect(cal).toMatch(/setRepeat\(\{ on: false, days: \[\], until: "" \}\);\n\s+setEditorOpen\(true\);/);
  });
});

describe("the calendars refresh themselves", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("asks again every 15 seconds while the page is in view, not while it is hidden", async () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    function Probe() { useAutoRefresh(refresh); return null; }
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => { root.render(<Probe />); });
    expect(refresh).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(15_000); });
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(refresh).toHaveBeenCalledTimes(3);

    const vis = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(refresh).toHaveBeenCalledTimes(3);
    // Coming back to the tab refreshes at once.
    vis.mockReturnValue("visible");
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(refresh).toHaveBeenCalledTimes(4);

    await act(async () => { root.unmount(); });
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(refresh).toHaveBeenCalledTimes(4);
  });

  it("is on in the Internal Calendars and in the Classes calendar", () => {
    expect(read("src/components/admin/AdminInternalCalendars.tsx"))
      .toMatch(/useAutoRefresh\(\(\) => \{ loadEntries\(\); loadBookings\(\); loadGroups\(\); \}\);/);
    expect(read("src/components/admin/AdminClassCalendarWithAttendees.tsx"))
      .toMatch(/useAutoRefresh\(\(\) => \{ loadScheduled\(\); refetchClosures\(\); \}\);/);
  });
});

describe("the calendars change the moment anyone changes them (2026-11)", () => {
  it("listen to the database (Supabase Realtime) and keep the 15 s poll", () => {
    const cal = read("src/components/admin/AdminInternalCalendars.tsx");
    expect(cal).toMatch(/useRealtimeRefresh\(\["admin_calendar_entries", "bookings", "calendar_groups"\]/);
    expect(cal).toMatch(/Live · updated \{format\(lastSync, "h:mm:ss a"\)\}/);
    const classes = read("src/components/admin/AdminClassCalendarWithAttendees.tsx");
    expect(classes).toMatch(/useRealtimeRefresh\(\["class_schedule", "class_bookings", "class_closures"\]/);
    const hook = read("src/hooks/useRealtimeRefresh.ts");
    expect(hook).toMatch(/channel\.on\("postgres_changes" as any, \{ event: "\*", schema: "public", table \}, kick\)/);
    expect(hook).toMatch(/supabase\.removeChannel\(channel\)/);
    const sql = read("supabase/migrations/20261112120000_calendar_realtime.sql");
    for (const t of ["admin_calendar_entries", "bookings", "calendar_groups", "class_schedule", "class_bookings", "class_closures"]) {
      expect(sql).toContain(`'${t}'`);
    }
    expect(sql).toMatch(/alter publication supabase_realtime add table public\.%I/);
  });

  it("an Admin tab left open moves onto a newly published version — never mid-dialog or mid-typing", async () => {
    const { buildIn, busy, currentBuild } = await import("@/hooks/useNewVersionReload");
    expect(buildIn('<script type="module" crossorigin src="/assets/index-CoQLEVha.js"></script>')).toBe("index-CoQLEVha.js");
    const doc = document.implementation.createHTMLDocument("x");
    const s = doc.createElement("script"); s.src = "https://www.spaholis.com/assets/index-AbC_12.js"; doc.head.appendChild(s);
    expect(currentBuild(doc)).toBe("index-AbC_12.js");
    expect(busy(doc)).toBe(false);
    const dlg = doc.createElement("div"); dlg.setAttribute("role", "dialog"); doc.body.appendChild(dlg);
    expect(busy(doc)).toBe(true);
    expect(read("src/pages/AdminDashboard.tsx")).toMatch(/useNewVersionReload\(\);/);
  });
});
