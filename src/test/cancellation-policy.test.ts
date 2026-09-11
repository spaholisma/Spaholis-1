import { describe, it, expect } from "vitest";
import {
  cancellationWindow,
  cancellationFee,
  buildCancellationMailto,
  reservationCode,
  CANCELLATION_EMAIL,
  CANCELLATION_POLICY,
  POLICY_LINES,
  CLASS_POLICY_LINES,
  WITHIN_WINDOW_PERCENT,
  AFTER_WINDOW_PERCENT,
} from "@/lib/cancellationPolicy";

// This decides whether a card is charged half or in full, so the edges are
// pinned down. The clock starts when the booking is PLACED: 50% inside the
// first 24 hours, 100% after — and never a free cancellation.
describe("cancellation window", () => {
  // Booked Monday 10am (Costa Rica) for Friday 10am — the example the owner
  // used to choose this rule.
  const booked = new Date("2026-09-14T10:00:00-06:00");
  const appointment = new Date("2026-09-18T10:00:00-06:00");
  const at = (iso: string) => new Date(iso);

  it("charges half the same evening", () => {
    const w = cancellationWindow(booked, appointment, at("2026-09-14T20:00:00-06:00"));
    expect(w.withinWindow).toBe(true);
    expect(w.percent).toBe(WITHIN_WINDOW_PERCENT);
  });

  it("charges in full on Wednesday", () => {
    const w = cancellationWindow(booked, appointment, at("2026-09-16T09:00:00-06:00"));
    expect(w.withinWindow).toBe(false);
    expect(w.percent).toBe(AFTER_WINDOW_PERCENT);
  });

  it("ends exactly 24 hours after booking", () => {
    const w = cancellationWindow(booked, appointment);
    expect(w.endsAt.toISOString()).toBe(new Date("2026-09-15T10:00:00-06:00").toISOString());
    expect(cancellationWindow(booked, appointment, at("2026-09-15T09:59:00-06:00")).percent).toBe(50);
    expect(cancellationWindow(booked, appointment, at("2026-09-15T10:00:00-06:00")).percent).toBe(100);
  });

  // Booked at 9am for 2pm the same day: at 5pm the guest did not cancel "inside
  // their 24 hours", they simply did not come — a no-show, charged in full.
  it("never runs past the start of the appointment", () => {
    const b = new Date("2026-09-14T09:00:00-06:00");
    const start = new Date("2026-09-14T14:00:00-06:00");
    const w = cancellationWindow(b, start);
    expect(w.endsAt.toISOString()).toBe(start.toISOString());
    expect(cancellationWindow(b, start, at("2026-09-14T13:00:00-06:00")).percent).toBe(50);
    expect(cancellationWindow(b, start, at("2026-09-14T17:00:00-06:00")).percent).toBe(100);
  });

  it("works without an appointment time (at-location visits)", () => {
    expect(cancellationWindow(booked, null, at("2026-09-14T12:00:00-06:00")).percent).toBe(50);
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
      expect(text).toContain("24 hours");
      expect(text).toContain("50%");
      expect(text).toContain("100%");
      expect(text).toContain(CANCELLATION_EMAIL);
    }
  });

  it("counts from the booking, not the appointment", () => {
    expect(CANCELLATION_POLICY).toMatch(/within 24 hours of placing this booking/);
    expect(CANCELLATION_POLICY).not.toMatch(/before the appointment/);
    expect(POLICY_LINES.join(" ")).not.toMatch(/no charge/i);
  });

  it("gives classes their own rule from the Refund page", () => {
    expect(CLASS_POLICY_LINES.join(" ")).toContain("4 hours before the class");
    expect(CLASS_POLICY_LINES.join(" ")).not.toContain("24 hours");
  });
});
