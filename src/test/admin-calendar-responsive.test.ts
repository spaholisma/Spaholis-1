import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Admin → Calendars → Classes, on a narrower window.
//
// The toolbar above the calendar holds five buttons (show cancelled, closed
// days, finances, new order, new session) in a row that could not wrap, so
// below about 1000px they pushed the page sideways: at 375px the page was
// 968px wide and everything looked shrunk and cut. Measured before the fix.
const root = resolve(__dirname, "../..");
const calendar = readFileSync(resolve(root, "src/components/admin/AdminClassCalendarWithAttendees.tsx"), "utf8");
const toolbar = calendar.slice(calendar.indexOf("const cancelledCount"), calendar.indexOf("<ClassClosuresDialog"));

describe("the toolbar above the class calendar", () => {
  it("wraps instead of pushing the page sideways", () => {
    expect(toolbar).toMatch(/className="flex flex-wrap items-center justify-between mb-4 gap-2"/);
    // Both groups wrap: the left one always did, the right one is the one that
    // overflowed.
    expect(toolbar).toMatch(/className="flex flex-wrap items-center gap-2"/);
  });

  it("keeps the month title from reserving desktop width on a phone", () => {
    expect(toolbar).toMatch(/min-w-\[120px\] sm:min-w-\[160px\]/);
  });
});

describe("the month grid", () => {
  it("scrolls sideways rather than squeezing seven columns into a phone", () => {
    const month = calendar.slice(calendar.indexOf('{viewMode === "month" ? ('));
    expect(month).toMatch(/border border-border rounded-xl overflow-x-auto/);
    // Both rows — the weekday header and the days — keep the same floor width,
    // or they would drift apart as it scrolls.
    const mins = month.slice(0, 1500).match(/grid grid-cols-7[^"]*min-w-\[640px\]/g) ?? [];
    expect(mins).toHaveLength(2);
  });

  it("is the same width the week view already uses, so they scroll alike", () => {
    expect(calendar).toMatch(/flex min-w-\[640px\]/);
  });
});
