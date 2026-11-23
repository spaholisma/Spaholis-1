import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { bookingDetailsLine, parseCharge } from "@/components/admin/AdminInternalCalendars";
import { describeMatch } from "@/components/admin/calendar/searchCalendar";

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

describe("Calendar entry: booking details in their own fields", () => {
  it("reads Cobrar as typed, and refuses what isn't an amount", () => {
    expect(parseCharge("")).toBeNull();
    expect(parseCharge("  ")).toBeNull();
    expect(parseCharge("262")).toBe(262);
    expect(parseCharge("$262")).toBe(262);
    expect(parseCharge("$ 1,262.50")).toBe(1262.5);
    expect(parseCharge("262 cada uno")).toBeUndefined();
    expect(parseCharge("-5")).toBeUndefined();
    expect(parseCharge("1.234")).toBeUndefined();
  });

  it("sums the details up in one line", () => {
    expect(bookingDetailsLine({
      client_name: "Peter", treatment_label: "HS Couple Massage 90 mins", charge_amount: 262,
      booked_by: "WhatsApp Peter", confirmed_by: "Mario/Maryeling", commission_to: "Recepción",
    })).toBe("Peter · HS Couple Massage 90 mins · Cobrar $262 · Reservó: WhatsApp Peter · Confirmó: Mario/Maryeling · Comisiona: Recepción");
    expect(bookingDetailsLine({})).toBe("");
    expect(bookingDetailsLine({ charge_amount: 0 })).toBe("Cobrar $0");
  });

  it("search says which detail matched", () => {
    const hit = describeMatch({ title: "Susana: HS 60 mins", confirmed_by: "Maryeling" } as any, "maryel");
    expect(hit.field).toBe("Confirmó");
    expect(hit.snippet).toBe("Maryeling");
  });

  it("the migration only adds nullable columns, with safe checks", () => {
    const sql = read("supabase/migrations/20261123120000_calendar_entry_booking_details.sql");
    for (const c of ["charge_amount numeric(10, 2)", "booked_by text", "confirmed_by text", "commission_to text", "treatment_label text", "link_url text", "link_label text"]) {
      expect(sql).toContain(`add column if not exists ${c}`);
    }
    expect(sql).not.toMatch(/not null|drop column|delete from|update public/i);
    expect(sql).toContain("check (link_url is null or link_url ~* '^https?://')");
  });

  it("the form has the fields, saves them, and the client name lives with them", () => {
    const ui = read("src/components/admin/AdminInternalCalendars.tsx");
    expect(ui).toContain("Detalles de la reserva");
    for (const k of ["charge_amount: charge", "booked_by: form.booked_by.trim() || null", "confirmed_by: form.confirmed_by.trim() || null",
      "commission_to: form.commission_to.trim() || null", "treatment_label: form.treatment_label.trim() || null", "link_url: detailLink"]) {
      expect(ui).toContain(k);
    }
    // The name is asked once (in the details), not again in Client notifications.
    expect(ui.match(/onChange=\{\(e\) => setForm\(\{ \.\.\.form, client_name: e\.target\.value \}\)\}/g)).toHaveLength(1);
    expect(ui.indexOf("Detalles de la reserva")).toBeLessThan(ui.indexOf("Client notifications</p>"));
  });

  it("closing a website booking opened from the day pop-up goes back to that day", () => {
    const ui = read("src/components/admin/AdminInternalCalendars.tsx");
    expect(ui).toContain("setBookingReturnDay(dayViewDate);");
    expect(ui).toMatch(/if \(!o && bookingReturnDay\) \{ setDayViewDate\(bookingReturnDay\); setBookingReturnDay\(null\); \}/);
  });
});
