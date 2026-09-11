import { describe, it, expect } from "vitest";
import {
  appointmentStart,
  cancellationWindow,
  cancellationFee,
  buildCancellationMailto,
  reservationCode,
  CANCELLATION_EMAIL,
  CANCELLATION_POLICY,
  POLICY_LINES,
  RULE_LINES,
  CLASS_POLICY_LINES,
  BEFORE_WINDOW_PERCENT,
  WITHIN_WINDOW_PERCENT,
} from "@/lib/cancellationPolicy";

// This decides whether a card is charged half or in full, so the edges are
// pinned down. The clock runs against the APPOINTMENT: more than 48 hours
// before it costs 50%, inside those 48 hours (or not coming) costs 100%, and
// it is never free.
describe("cancellation window", () => {
  // Friday 10am — the example the owner confirmed the rule with. The 48 hours
  // begin on Wednesday at 10am.
  const appointment = new Date("2026-09-18T10:00:00-06:00");
  const at = (iso: string) => new Date(iso);

  it("charges half on Tuesday", () => {
    const w = cancellationWindow(appointment, at("2026-09-15T15:00:00-06:00"));
    expect(w.withinWindow).toBe(false);
    expect(w.percent).toBe(BEFORE_WINDOW_PERCENT);
  });

  it("charges in full on Thursday", () => {
    const w = cancellationWindow(appointment, at("2026-09-17T09:00:00-06:00"));
    expect(w.withinWindow).toBe(true);
    expect(w.percent).toBe(WITHIN_WINDOW_PERCENT);
  });

  it("switches exactly 48 hours before the appointment", () => {
    const w = cancellationWindow(appointment);
    expect(w.fullChargeFrom.toISOString()).toBe(new Date("2026-09-16T10:00:00-06:00").toISOString());
    expect(cancellationWindow(appointment, at("2026-09-16T09:59:00-06:00")).percent).toBe(50);
    expect(cancellationWindow(appointment, at("2026-09-16T10:00:00-06:00")).percent).toBe(100);
  });

  it("is never free, however far ahead", () => {
    expect(cancellationWindow(appointment, at("2026-06-01T10:00:00-06:00")).percent).toBe(50);
  });

  // Booked on Thursday for Friday: already inside the 48 hours when booked.
  it("puts a booking made less than 48 hours ahead at 100% straight away", () => {
    expect(cancellationWindow(appointment, at("2026-09-17T08:00:00-06:00")).percent).toBe(100);
  });
});

describe("appointment start", () => {
  it("uses start_time when there is one", () => {
    expect(appointmentStart({ start_time: "2026-09-18T16:00:00Z", booking_date: "2026-01-01" }).toISOString())
      .toBe("2026-09-18T16:00:00.000Z");
  });

  // At-location visits have no start_time; date and time are spa-local (UTC-6).
  it("falls back to the date and wall clock in Costa Rica time", () => {
    expect(appointmentStart({ booking_date: "2026-09-18", booking_time: "10:00:00" }).toISOString())
      .toBe("2026-09-18T16:00:00.000Z");
  });
});

describe("cancellation fee", () => {
  it("is half or all of the total", () => {
    expect(cancellationFee(131, 50)).toBe(65.5);
    expect(cancellationFee(131, 100)).toBe(131);
  });

  it("rounds to cents", () => {
    expect(cancellationFee(111.35, 50)).toBe(55.68);
  });

  it("is nothing for no charge or an unknown total", () => {
    expect(cancellationFee(131, 0)).toBe(0);
    expect(cancellationFee(null, 50)).toBe(0);
  });
});

describe("the cancellation email", () => {
  const href = buildCancellationMailto({
    serviceName: "PURE BLISS (90min)",
    date: "Sunday, September 13, 2026",
    time: "14:00",
    reservationId: "5199439A",
    guestName: "Leena Vogt",
  });
  const url = new URL(href);

  it("is addressed to the studio", () => {
    expect(url.protocol).toBe("mailto:");
    expect(url.pathname).toBe(CANCELLATION_EMAIL);
    expect(CANCELLATION_EMAIL).toBe("spaholisma@gmail.com");
  });

  it("carries the reservation in the subject so reception can match it", () => {
    expect(url.searchParams.get("subject")).toBe("Cancellation request — PURE BLISS (90min) — 5199439A");
  });

  it("fills in the appointment and leaves room for the guest's message", () => {
    const body = url.searchParams.get("body")!;
    expect(body).toContain("Service: PURE BLISS (90min)");
    expect(body).toContain("Date: Sunday, September 13, 2026");
    expect(body).toContain("Time: 14:00");
    expect(body).toContain("Reservation: 5199439A");
    expect(body).toContain("Name: Leena Vogt");
    expect(body.trimEnd().endsWith("My message:")).toBe(true);
  });

  // An ampersand or a question mark in a service name must not cut the link.
  it("survives awkward characters in a service name", () => {
    const u = new URL(buildCancellationMailto({
      serviceName: "Wrap & Glow? 60min", date: "d", time: "t", reservationId: "R",
    }));
    expect(u.searchParams.get("subject")).toBe("Cancellation request — Wrap & Glow? 60min — R");
  });

  it("uses the same short reservation code as the emails", () => {
    expect(reservationCode("5199439a-33a2-4768-a704-7852cebab7f4")).toBe("5199439A");
  });
});

describe("policy wording", () => {
  // The paragraph the guest signs and the bullets in the emails must describe
  // the same rule, or a guest gets two answers.
  it("agrees with the paragraph the guest signs", () => {
    for (const text of [CANCELLATION_POLICY, POLICY_LINES.join(" ")]) {
      expect(text).toContain("48 hours before");
      expect(text).toContain("50%");
      expect(text).toContain("100%");
      expect(text).toContain(CANCELLATION_EMAIL);
    }
  });

  it("counts back from the appointment, never from the booking", () => {
    for (const text of [CANCELLATION_POLICY, POLICY_LINES.join(" ")]) {
      expect(text).not.toMatch(/24 hours/);
      expect(text).not.toMatch(/placing|making your booking/);
      expect(text).not.toMatch(/free/i);
    }
    // The card form does say there is "no charge in advance" — that is about
    // booking, not cancelling. No cancellation line may promise it.
    expect(POLICY_LINES.join(" ")).not.toMatch(/no charge/i);
    expect(RULE_LINES[0]).toMatch(/more than 48 hours before your appointment — 50%/);
    expect(RULE_LINES[1]).toMatch(/within the 48 hours before your appointment, or not show up — 100%/);
  });

  it("gives classes their own rule from the Refund page", () => {
    expect(CLASS_POLICY_LINES.join(" ")).toContain("4 hours before the class");
    expect(CLASS_POLICY_LINES.join(" ")).not.toContain("48 hours");
  });
});
