/**
 * Day-view layout contract for the internal calendar.
 *
 * The day view places entries on a timeline: vertically by start time, and
 * side by side wherever they overlap (like Google Calendar). Getting the
 * overlap grouping wrong makes entries silently cover each other, which for a
 * spa schedule means a double-booked room goes unnoticed — so lock it here.
 */
import { describe, it, expect } from "vitest";
import {
  layoutDay,
  minutesLabel,
  rangeLabel,
  expandRecurrence,
  MAX_OCCURRENCES,
  type CalendarEntry,
} from "@/components/admin/AdminInternalCalendars";

let seq = 0;
const entry = (start_time: string, duration_minutes: number, title = `e${++seq}`): CalendarEntry => ({
  id: `${title}-${start_time}`,
  calendar_type: "treatment",
  title,
  entry_date: "2026-07-15",
  end_date: null,
  start_time,
  end_time: null,
  duration_minutes,
  notes: null,
  color: null,
  room_id: null,
  is_offsite: false,
  offsite_location: null,
  group_id: null,
  is_all_day: false,
  series_id: null,
  recurrence: "none",
  recurrence_until: null,
});

const byTitle = (laid: ReturnType<typeof layoutDay>, title: string) =>
  laid.find((l) => l.entry.title === title)!;

describe("internal calendar day layout", () => {
  it("converts start time + duration into minute bounds", () => {
    const [a] = layoutDay([entry("09:30", 90, "a")]);
    expect(a.startMin).toBe(9 * 60 + 30);
    expect(a.endMin).toBe(11 * 60);
  });

  it("sorts entries by start time regardless of input order", () => {
    const laid = layoutDay([entry("14:00", 60, "late"), entry("09:00", 60, "early")]);
    expect(laid.map((l) => l.entry.title)).toEqual(["early", "late"]);
  });

  it("gives non-overlapping entries the full width", () => {
    const laid = layoutDay([entry("09:00", 60, "a"), entry("14:00", 60, "b")]);
    expect(laid.every((l) => l.lanes === 1 && l.lane === 0)).toBe(true);
  });

  it("puts two overlapping entries side by side", () => {
    // The real case from the calendar: two 09:00 treatments at once.
    const laid = layoutDay([entry("09:00", 60, "jenny"), entry("09:00", 60, "susana")]);
    expect(laid.map((l) => l.lanes)).toEqual([2, 2]);
    expect(laid.map((l) => l.lane).sort()).toEqual([0, 1]);
  });

  it("treats back-to-back entries as NOT overlapping", () => {
    // 09:00–10:00 then 10:00–11:00 touch but never coexist, so each keeps the
    // full width rather than being squeezed into half.
    const laid = layoutDay([entry("09:00", 60, "a"), entry("10:00", 60, "b")]);
    expect(laid.every((l) => l.lanes === 1)).toBe(true);
  });

  it("widens a group to as many columns as concurrent entries", () => {
    const laid = layoutDay([
      entry("09:00", 180, "long"),
      entry("09:30", 60, "mid"),
      entry("09:45", 30, "short"),
    ]);
    expect(laid.every((l) => l.lanes === 3)).toBe(true);
    expect(laid.map((l) => l.lane).sort()).toEqual([0, 1, 2]);
  });

  it("reuses a lane once the earlier entry in it has ended", () => {
    // "a" 09:00–10:00 and "c" 10:00–11:00 don't overlap each other, but both
    // overlap "b" 09:30–10:30 — so the group needs 2 columns, not 3, and "c"
    // takes the lane "a" freed up.
    const laid = layoutDay([
      entry("09:00", 60, "a"),
      entry("09:30", 60, "b"),
      entry("10:00", 60, "c"),
    ]);
    expect(laid.every((l) => l.lanes === 2)).toBe(true);
    expect(byTitle(laid, "a").lane).toBe(0);
    expect(byTitle(laid, "b").lane).toBe(1);
    expect(byTitle(laid, "c").lane).toBe(0);
  });

  it("starts a fresh full-width group after a gap", () => {
    const laid = layoutDay([
      entry("09:00", 60, "a"),
      entry("09:00", 60, "b"),
      entry("15:00", 60, "solo"),
    ]);
    expect(byTitle(laid, "solo").lanes).toBe(1);
    expect(byTitle(laid, "a").lanes).toBe(2);
  });

  it("floors a zero/short duration so the block stays clickable", () => {
    const [a] = layoutDay([entry("09:00", 0, "a")]);
    expect(a.endMin - a.startMin).toBe(15);
  });

  it("handles an empty day", () => {
    expect(layoutDay([])).toEqual([]);
  });
});

describe("day view time labels", () => {
  it("renders 12-hour clock times", () => {
    expect(minutesLabel(0)).toBe("12 AM");
    expect(minutesLabel(9 * 60)).toBe("9 AM");
    expect(minutesLabel(9 * 60 + 30)).toBe("9:30 AM");
    expect(minutesLabel(12 * 60)).toBe("12 PM");
    expect(minutesLabel(13 * 60 + 30)).toBe("1:30 PM");
    expect(minutesLabel(19 * 60)).toBe("7 PM");
  });

  it("wraps past midnight instead of reading 13 PM", () => {
    // An entry can end at or beyond 24:00 — e.g. 11 PM + 2h.
    expect(minutesLabel(24 * 60)).toBe("12 AM");
    expect(minutesLabel(25 * 60)).toBe("1 AM");
    expect(minutesLabel(25 * 60 + 30)).toBe("1:30 AM");
  });

  it("drops the repeated meridiem within one half of the day", () => {
    expect(rangeLabel(9 * 60, 10 * 60)).toBe("9 – 10 AM");
    expect(rangeLabel(15 * 60, 16 * 60 + 30)).toBe("3 – 4:30 PM");
  });

  it("keeps both meridiems when the entry crosses noon", () => {
    expect(rangeLabel(11 * 60, 13 * 60 + 30)).toBe("11 AM – 1:30 PM");
  });

  it("labels a treatment that runs past midnight", () => {
    expect(rangeLabel(23 * 60, 25 * 60)).toBe("11 PM – 1 AM");
  });
});

describe("recurrence expansion", () => {
  it("a non-repeating entry is just its own date", () => {
    expect(expandRecurrence("2026-07-15", "", "none")).toEqual(["2026-07-15"]);
    // An end date is irrelevant when it doesn't repeat.
    expect(expandRecurrence("2026-07-15", "2026-12-31", "none")).toEqual(["2026-07-15"]);
  });

  it("repeats weekly on the same weekday, inclusive of both ends", () => {
    // Jul 15 2026 is a Wednesday — the case from the calendar.
    const dates = expandRecurrence("2026-07-15", "2026-08-05", "weekly");
    expect(dates).toEqual(["2026-07-15", "2026-07-22", "2026-07-29", "2026-08-05"]);
  });

  it("repeats every 2 weeks", () => {
    expect(expandRecurrence("2026-07-15", "2026-08-15", "biweekly")).toEqual([
      "2026-07-15", "2026-07-29", "2026-08-12",
    ]);
  });

  it("repeats daily", () => {
    expect(expandRecurrence("2026-07-15", "2026-07-18", "daily")).toEqual([
      "2026-07-15", "2026-07-16", "2026-07-17", "2026-07-18",
    ]);
  });

  it("repeats monthly on the same day of the month", () => {
    expect(expandRecurrence("2026-07-15", "2026-10-15", "monthly")).toEqual([
      "2026-07-15", "2026-08-15", "2026-09-15", "2026-10-15",
    ]);
  });

  it("skips months that don't have the day rather than sliding to the 28th", () => {
    // A 31st series has no February date — and must not quietly become Feb 28,
    // which would put a treatment on a day nobody scheduled.
    const dates = expandRecurrence("2026-01-31", "2026-05-31", "monthly");
    expect(dates).toEqual(["2026-01-31", "2026-03-31", "2026-05-31"]);
    expect(dates.some((d) => d.startsWith("2026-02"))).toBe(false);
    expect(dates.some((d) => d.startsWith("2026-04"))).toBe(false);
  });

  it("never runs past the end date", () => {
    const dates = expandRecurrence("2026-07-15", "2026-07-21", "weekly");
    expect(dates).toEqual(["2026-07-15"]);
  });

  it("treats an end date before the start as a single entry", () => {
    expect(expandRecurrence("2026-07-15", "2026-07-01", "weekly")).toEqual(["2026-07-15"]);
  });

  it("caps runaway series so a typo can't insert thousands of rows", () => {
    const dates = expandRecurrence("2026-01-01", "2200-01-01", "daily");
    expect(dates).toHaveLength(MAX_OCCURRENCES);
  });
});
