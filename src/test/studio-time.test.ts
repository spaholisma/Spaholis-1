import { describe, it, expect } from "vitest";
import { spaMonthKey, spaLocalParts } from "@/lib/businessHours";
import { crToUtc, utcToCr } from "@/components/teacher/ClassFormDialog";

/**
 * The studio is six hours behind UTC, and studio rent is counted per month, so
 * the month a class belongs to has to be its month HERE, not in UTC. An evening
 * class on the last day of a month is the case that used to slip into the next.
 */
describe("studio time", () => {
  it("bills an evening class to the month it happens in", () => {
    // 30 Sep 2026, 8pm in Manuel Antonio = 1 Oct 02:00 UTC.
    const evening = "2026-10-01T02:00:00.000Z";
    expect(spaMonthKey(evening)).toBe("2026-09");
  });

  it("bills a morning class to the same month either way", () => {
    expect(spaMonthKey("2026-09-15T14:00:00.000Z")).toBe("2026-09");
  });

  it("puts a very early UTC instant in the previous studio day", () => {
    const parts = spaLocalParts(new Date("2026-09-09T02:00:00.000Z"));
    expect(parts.day).toBe(8);
    expect(parts.hhmm).toBe("20:00");
  });

  it("round-trips a form value through UTC and back", () => {
    const iso = crToUtc("2026-09-08", "20:00");
    expect(iso).toBe("2026-09-09T02:00:00.000Z");
    expect(utcToCr(iso!)).toEqual({ day: "2026-09-08", time: "20:00" });
  });

  it("keeps a class where it was when it is opened and saved unchanged", () => {
    const original = "2026-09-15T14:00:00.000Z";
    const { day, time } = utcToCr(original);
    expect(crToUtc(day, time)).toBe(original);
  });

  it("refuses an incomplete form value", () => {
    expect(crToUtc("", "09:00")).toBeNull();
    expect(crToUtc("2026-09-08", "")).toBeNull();
  });
});
