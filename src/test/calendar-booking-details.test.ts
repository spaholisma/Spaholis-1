import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { bookingDetailsLine, notificationsLine, parseCharge } from "@/components/admin/AdminInternalCalendars";
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
    expect(ui.indexOf('title="Detalles de la reserva"')).toBeLessThan(ui.indexOf('title="Client notifications"'));
  });

  it("both boxes open and close, start closed, and show a summary while closed", () => {
    const ui = read("src/components/admin/AdminInternalCalendars.tsx");
    expect(ui).toMatch(/<FoldSection\s+title="Detalles de la reserva"[\s\S]*?open=\{detailsOpen\}/);
    expect(ui).toMatch(/<FoldSection\s+title="Client notifications"[\s\S]*?open=\{notifyOpen\}/);
    // Every way the form opens (new / edit) starts them closed.
    expect(ui.match(/setDetailsOpen\(false\);\n\s*setNotifyOpen\(false\);/g)).toHaveLength(2);
    // A wrong Cobrar or link opens the box, so the field is in sight.
    expect(ui).toContain('setDetailsOpen(true); toast.error("Cobrar:');
    expect(ui).toContain('setDetailsOpen(true); toast.error("Link:');
    expect(notificationsLine({ client_email: " ana@x.com ", client_reminder_hours: "24", client_review: true }))
      .toBe("ana@x.com · Recordatorio 1 día antes · Pide reseña");
    expect(notificationsLine({ client_email: "", client_reminder_hours: "48", client_review: false })).toBe("Recordatorio 2 días antes");
    expect(notificationsLine({ client_email: "", client_reminder_hours: "2", client_review: false })).toBe("Recordatorio 2 h antes");
    expect(notificationsLine({ client_email: "", client_reminder_hours: "", client_review: false })).toBe("");
  });

  it("closing a website booking opened from the day pop-up goes back to that day", () => {
    const ui = read("src/components/admin/AdminInternalCalendars.tsx");
    expect(ui).toContain("setBookingReturnDay(dayViewDate);");
    expect(ui).toMatch(/if \(!o && bookingReturnDay\) \{ setDayViewDate\(bookingReturnDay\); setBookingReturnDay\(null\); \}/);
  });
});

describe("Edit Booking: the same booking details", () => {
  const modal = read("src/components/admin/calendar/BookingEditModal.tsx");
  const sql = read("supabase/migrations/20261123140000_booking_staff_details.sql");

  it("shows Reservó, Confirmó, Comisiona and the link under the notes", () => {
    expect(modal).toContain("Detalles de la reserva");
    for (const k of ["booked_by", "confirmed_by", "commission_to", "link_label", "link_url"]) {
      expect(modal).toContain(`setDetail("${k}")`);
    }
    expect(modal.indexOf("Description / Notes")).toBeLessThan(modal.indexOf("Detalles de la reserva"));
  });

  it("reads them from the booking itself, and never blanks them before they are read", () => {
    expect(modal).toContain("cancellation_requested_at, booked_by, confirmed_by, commission_to, link_url, link_label");
    expect(modal).toContain("charge_amount: row?.charge_amount != null ? String(row.charge_amount) : \"\"");
    expect(modal).toMatch(/\.\.\.\(detailsLoaded\s*\? \(\{\s*(charge_amount: charge,\s*)?booked_by:/);
  });

  it("the migration adds nullable columns, keeps guests out of them, and duplicate copies them", () => {
    for (const c of ["booked_by", "confirmed_by", "commission_to", "link_url", "link_label"]) {
      expect(sql).toContain(`add column if not exists ${c} text`);
      expect(sql).toContain(`new.${c} := null;`);
      expect(sql).toContain(`v_src.${c}`);
    }
    expect(sql).toContain("before insert on public.bookings");
    expect(sql).toContain("check (link_url is null or link_url ~* '^https?://')");
    expect(sql).not.toMatch(/not null|drop column|delete from|update public/i);
  });

  it("has Cobrar too: read, checked and saved like the entry form's", () => {
    expect(modal).toContain(`setDetail("charge_amount")`);
    expect(modal).toContain("link_url, link_label, charge_amount\" as any)");
    expect(modal).toContain("const charge = parseCharge(details.charge_amount);");
    expect(modal).toMatch(/\.\.\.\(detailsLoaded\s*\? \(\{\s*charge_amount: charge,/);
    const charge = read("supabase/migrations/20261123160000_booking_charge_amount.sql");
    expect(charge).toContain("add column if not exists charge_amount numeric(10, 2)");
    expect(charge).toContain("check (charge_amount is null or charge_amount >= 0)");
    expect(charge).toContain("new.charge_amount := null;");
    expect(charge).toContain("v_src.charge_amount");
    // The guard still drops every other team field as before.
    for (const c of ["booked_by", "confirmed_by", "commission_to", "link_url", "link_label"]) {
      expect(charge).toContain(`new.${c} := null;`);
      expect(charge).toContain(`v_src.${c}`);
    }
    expect(charge).not.toMatch(/not null|drop column|delete from|update public/i);
  });
});
