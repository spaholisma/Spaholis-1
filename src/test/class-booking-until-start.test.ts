import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { classCheckoutReasonMessage, isClassOpenForBooking } from "@/lib/classBookingWindow";

// Classes can be booked online right up to the moment they start (25 Sep 2026;
// it used to close 15 minutes before).
const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8").replace(/\r\n/g, "\n");

describe("when a class can be booked", () => {
  const start = new Date("2026-10-01T14:00:00Z").getTime();

  it("is open one minute — and one second — before it starts", () => {
    expect(isClassOpenForBooking(new Date(start), start - 60_000)).toBe(true);
    expect(isClassOpenForBooking(new Date(start), start - 1_000)).toBe(true);
  });

  it("closes at the exact start, and stays closed", () => {
    expect(isClassOpenForBooking(new Date(start), start)).toBe(false);
    expect(isClassOpenForBooking(new Date(start), start + 60_000)).toBe(false);
  });

  it("tells the guest why a checkout was refused", () => {
    expect(classCheckoutReasonMessage("class_started")).toMatch(/already started/);
    expect(classCheckoutReasonMessage("class_full")).toMatch(/filled up/);
    expect(classCheckoutReasonMessage("something_else")).toBeNull();
  });
});

describe("every place holds to it", () => {
  it("the schedule and the booking page no longer use the 15-minute cutoff", () => {
    const cal = read("src/components/WeeklyClassCalendar.tsx");
    const page = read("src/pages/ClassBooking.tsx");
    expect(cal).not.toMatch(/15 \* 60 \* 1000/);
    expect(page).not.toMatch(/15 \* 60 \* 1000/);
    expect(cal).toMatch(/isClassOpenForBooking\(eventDate, now\)/);
    expect(page).toMatch(/if \(!isClassOpenForBooking\(event\.start_time\)\)/);
  });

  it("the database closes it at the start — for everyone but the team and the payment server", () => {
    const sql = read("supabase/migrations/20260929120000_class_booking_until_start.sql");
    expect(sql).toMatch(/st <= now\(\) AND NOT is_staff\s+AND coalesce\(auth\.role\(\), ''\) <> 'service_role'/);
    expect(sql).not.toMatch(/interval '15 minutes'/);
  });

  it("a payment is refused before any money moves if the class has started", () => {
    for (const fn of ["paypal-create-order", "create-class-booking"]) {
      const src = read(`supabase/functions/${fn}/index.ts`);
      expect(src).toMatch(/getTime\(\) <= Date\.now\(\)\) \{\s+return json\(\{ ok: false, reason: "class_started"/);
    }
  });

  it("a payment begun in time is honoured at capture — capture does not re-check the clock", () => {
    const capture = read("supabase/functions/paypal-capture-order/index.ts");
    expect(capture).not.toMatch(/class_started/);
  });

  it("PayPal shows the real reason instead of a generic error", () => {
    const pp = read("src/components/payments/PayPalCheckout.tsx");
    expect(pp).toMatch(/refusal = classCheckoutReasonMessage\(res\.data\?\.reason\)/);
    expect(pp).toMatch(/toast\.error\(refusal \|\| "PayPal ran into a problem\. Please try again\."\)/);
  });
});
