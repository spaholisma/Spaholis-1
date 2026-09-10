import { describe, it, expect } from "vitest";
import {
  cancellationOutcome,
  cancellationFee,
  FREE_CANCELLATION_HOURS,
  LATE_CANCELLATION_PERCENT,
  POLICY_LINES,
  CANCELLATION_POLICY,
} from "@/lib/cancellationPolicy";

// This decides whether a real card gets charged, so the boundary is pinned
// down rather than left to a hand-wave. The window is measured against the
// APPOINTMENT — a guest who books months ahead keeps the right to cancel free
// until the day before, which is what the card authorization they sign says.
describe("cancellation window", () => {
  const now = new Date("2026-09-13T14:00:00-06:00");
  const hoursOut = (h: number) => new Date(now.getTime() + h * 3_600_000);

  it("is free with more than 24 hours to go", () => {
    const out = cancellationOutcome(hoursOut(25), now);
    expect(out.isLate).toBe(false);
    expect(out.feePercent).toBe(0);
  });

  it("charges 50% inside the window", () => {
    const out = cancellationOutcome(hoursOut(23), now);
    expect(out.isLate).toBe(true);
    expect(out.feePercent).toBe(LATE_CANCELLATION_PERCENT);
  });

  it("treats exactly 24 hours as still free", () => {
    expect(cancellationOutcome(hoursOut(FREE_CANCELLATION_HOURS), now).feePercent).toBe(0);
  });

  it("charges an appointment a minute inside the window", () => {
    const out = cancellationOutcome(new Date(hoursOut(24).getTime() - 60_000), now);
    expect(out.feePercent).toBe(50);
  });

  // Booking three months ahead must not shorten the window: the clock runs to
  // the appointment, never from the moment the booking was made.
  it("keeps a far-future appointment free to cancel", () => {
    expect(cancellationOutcome(hoursOut(24 * 90), now).feePercent).toBe(0);
  });
});

describe("cancellation fee", () => {
  it("is half of the total", () => {
    expect(cancellationFee(131, 50)).toBe(65.5);
    expect(cancellationFee(173, 50)).toBe(86.5);
  });

  it("rounds to cents", () => {
    expect(cancellationFee(111.35, 50)).toBe(55.68);
  });

  it("is nothing when the cancellation is free or the total is unknown", () => {
    expect(cancellationFee(131, 0)).toBe(0);
    expect(cancellationFee(null, 50)).toBe(0);
    expect(cancellationFee(0, 50)).toBe(0);
  });
});

describe("policy wording", () => {
  // The bullets in the emails and the paragraph on the card form describe the
  // same rules; if one is edited without the other, guests get two answers.
  it("agrees with the paragraph the guest signs", () => {
    expect(CANCELLATION_POLICY).toContain("24 hours before the appointment");
    expect(CANCELLATION_POLICY).toContain("50%");
    expect(CANCELLATION_POLICY).toContain("100%");
    expect(POLICY_LINES.join(" ")).toContain("24 hours");
    expect(POLICY_LINES.join(" ")).toContain("50%");
    expect(POLICY_LINES.join(" ")).toContain("100%");
  });

  it("tells the guest that changes are not made online", () => {
    expect(POLICY_LINES.join(" ")).toMatch(/WhatsApp/);
    expect(POLICY_LINES.join(" ")).toMatch(/not made online/);
  });
});
