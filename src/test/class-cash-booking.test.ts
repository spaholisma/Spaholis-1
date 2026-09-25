import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cashPayee, cashTotal } from "@/lib/classCheckout";
import { classCheckoutReasonMessage } from "@/lib/classBookingWindow";

// A paid class can be reserved online and paid to the teacher in cash at the
// class; the team is emailed to collect it. The phone is required on the form.
const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8").replace(/\r\n/g, "\n");

describe("paying in cash at the class", () => {
  it("is every spot at the class price — coupons are for online payment", () => {
    expect(cashTotal(23, 1)).toBe(23);
    expect(cashTotal(23, 3)).toBe(69);
    expect(cashTotal(22.5, 3)).toBe(67.5);
  });

  it("is paid to the teacher of that session, else the class's teacher", () => {
    expect(cashPayee("Evelina", "Someone")).toBe("Evelina");
    expect(cashPayee("  ", "Petra")).toBe("Petra");
    expect(cashPayee(null, "")).toBeNull();
  });

  it("explains a refusal in plain words", () => {
    expect(classCheckoutReasonMessage("phone_required")).toMatch(/phone number/);
    expect(classCheckoutReasonMessage("invalid_participants")).toMatch(/name for each spot/);
    expect(classCheckoutReasonMessage("too_many_spots")).toMatch(/pay by card/);
  });
});

describe("the booking page", () => {
  const page = read("src/pages/ClassBooking.tsx");

  it("requires a valid phone before going on", () => {
    expect(page).toMatch(/!!formData\.phone && isValidPhoneNumber\(formData\.phone\) &&/);
    expect(page).toMatch(/>Phone \*<\/label>/);
  });

  it("offers cash next to card and books it on the server", () => {
    expect(page).toMatch(/in cash at the class`/);
    expect(page).toMatch(/selected=\{payMethod === "cash"\}/);
    expect(page).toMatch(/supabase\.rpc\("book_class_pay_cash" as any/);
    expect(page).toMatch(/payMethod === "cash" \? \(\s+<Button className="w-full" onClick=\{handleCashBooking\}/);
  });

  it("tells the guest what to bring and to whom", () => {
    expect(page).toMatch(/Please bring <span className="font-medium text-foreground">\{formatPrice\(cashDue\.amount\)\}<\/span>/);
  });
});

describe("the database makes the booking", () => {
  const sql = read("supabase/migrations/20260930120000_class_cash_booking.sql");

  it("is a checked server function open to guests", () => {
    expect(sql).toMatch(/create or replace function public\.book_class_pay_cash\(/);
    expect(sql).toMatch(/security definer/);
    expect(sql).toMatch(/grant execute on function public\.book_class_pay_cash\(uuid, text, text, text, text\[\]\) to anon, authenticated;/);
    expect(sql).toMatch(/revoke all on function public\.book_class_pay_cash\(uuid, text, text, text, text\[\]\) from public;/);
  });

  it("needs the phone, and holds to the class's rules", () => {
    expect(sql).toMatch(/v_phone !~ '\^\\\+\[1-9\]\[0-9\]\{6,14\}\$'/);
    for (const reason of ["class_started", "class_day_closed", "class_is_free", "class_full", "too_many_spots"]) {
      expect(sql).toContain(`'reason', '${reason}'`);
    }
    expect(sql).toMatch(/for update of sc;/);
  });

  it("takes the price from the class and records it as cash to collect", () => {
    expect(sql).toMatch(/'confirmed', 'pending', 'cash', v_price, 0, 'online'/);
    // Nothing about money comes from the browser: these are all it takes.
    expect(sql).toMatch(/book_class_pay_cash\(\n  _schedule_id uuid,\n  _guest_name text,\n  _guest_email text,\n  _guest_phone text,\n  _participant_names text\[\] default null\n\)/);
  });

  it("tells the teacher which booking it is — and changes nothing else in her trigger", () => {
    expect(sql).toMatch(/'studentName', v_name, 'previousTeacher', v_prev, 'bookingId', v_booking\)/);
    expect(sql).toMatch(/current_setting\('holis\.quiet_teacher_notify', true\)/);
    expect(sql).toMatch(/exception when others then\s+raise warning 'notify_teacher_event failed: %', sqlerrm;/);
  });
});

describe("the emails", () => {
  it("the team is told to collect the cash, with the guest's phone", () => {
    const src = read("supabase/functions/send-booking-notification/index.ts");
    expect(src).toMatch(/const cashDue = paymentMethod === "cash" && booking\.payment_status === "pending";/);
    expect(src).toMatch(/`CASH to collect \$\{formatCRC\(totalUsd\)\} · \$\{baseSubj\}`/);
    expect(src).toMatch(/if \(ctx\.guestPhone\) rows\.push\(tableRow\("Phone", ctx\.guestPhone\)\);/);
  });

  it("the guest's copy says it is paid in cash, not already paid", () => {
    const src = read("supabase/functions/send-booking-notification/index.ts");
    expect(src).toMatch(/totalLabel: cashDue \? "To pay in cash" : "Amount Paid"/);
    expect(src).toMatch(/cashDue \? `Pay in cash at the class/);
  });

  it("the teacher's new-signup email says the student pays her in cash", () => {
    const src = read("supabase/functions/notify-teacher/index.ts");
    expect(src).toMatch(/row\("Pays", cashLine\)/);
    expect(src).toMatch(/b\?\.payment_method === "cash" && b\?\.payment_status === "pending"/);
  });
});
