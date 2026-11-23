import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { accountingMissing, mergeOptions } from "@/components/admin/calendar/AccountingFields";
import { bookingDetailsLine } from "@/components/admin/AdminInternalCalendars";

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const sql = read("supabase/migrations/20261124120000_calendar_accounting_sync.sql");

describe("Agenda → Contabilidad: what is still missing", () => {
  it("needs Cliente, Tratamiento, the amount and Terapeuta", () => {
    expect(accountingMissing({ client: "Peter", treatment: "Couples 90 min", cost: 262, therapist: "Jenny" })).toEqual([]);
    expect(accountingMissing({ client: " ", treatment: "", cost: null, therapist: "" })).toEqual(["Cliente", "Tratamiento", "Cobrar", "Terapeuta"]);
    expect(accountingMissing({ client: "Ana", treatment: "x", cost: 0, therapist: "Jenny" })).toEqual([]);
    expect(accountingMissing({ client: "Ana", treatment: "x", cost: null, therapist: "Jenny" }, "Price")).toEqual(["Price"]);
  });

  it("merges dropdown lists without repeats, first spelling wins", () => {
    expect(mergeOptions(["Mav Rental", "HWC"], ["mav rental", " Casa X ", ""], undefined)).toEqual(["Mav Rental", "HWC", "Casa X"]);
  });

  it("the one-line summary names the therapists", () => {
    expect(bookingDetailsLine({ client_name: "Peter", treatment_label: "Couples 90 min", therapist: "Jenny", therapist2: "Susana", charge_amount: 262 }))
      .toBe("Peter · Couples 90 min · Jenny y Susana · Cobrar $262");
  });
});

describe("Agenda → Contabilidad: the database side", () => {
  it("only adds nullable columns and a new table — nothing existing is changed or removed", () => {
    for (const c of ["therapist text", "therapist2 text", "call_type text", "call_place text", "treatment_label text"]) {
      expect(sql).toContain(`add column if not exists ${c}`);
    }
    expect(sql).toContain("add column if not exists source_entry_id uuid references public.admin_calendar_entries(id) on delete cascade");
    expect(sql).toContain("add column if not exists source_booking_id uuid references public.bookings(id) on delete cascade");
    expect(sql).not.toMatch(/drop column|drop table|truncate|update public\.(bookings|admin_calendar_entries)\b/i);
    // The only rows deleted are the ones that came from the agenda.
    for (const m of sql.matchAll(/delete from public\.accounting_entries([\s\S]*?);/g)) {
      expect(m[1]).toMatch(/source_entry_id|source_booking_id/);
    }
  });

  it("maps each field as agreed", () => {
    expect(sql).toContain("when 'on' then coalesce(public.acc_list_label('location', 'HWC'), 'HWC')");
    expect(sql).toContain("when 'out' then public.acc_list_label('location', v_place)");
    expect(sql).toContain("v_hotel  := public.acc_list_label('hotel', v_hotel);");
    expect(sql).toMatch(/e\.client_name, e\.treatment_label, e\.entry_date, e\.charge_amount,\s+e\.therapist, e\.therapist2, e\.call_type, e\.call_place, e\.commission_to/);
    expect(sql).toMatch(/b\.guest_name, coalesce\(nullif\(btrim\(b\.treatment_label\), ''\), m\.treatment\), b\.booking_date, b\.total_price/);
    // A couple: two rows, the amount split.
    expect(sql).toContain("v_names := case when v_t2 is not null then array[v_t1, v_t2] else array[v_t1] end;");
    expect(sql).toContain("v_slot_cost := case when v_i < v_n then v_each else v_cost - v_each * (v_n - 1) end;");
  });

  it("keeps what was edited by hand in Contabilidad (only changed agenda fields are written)", () => {
    expect(sql).toContain("if (v_want -> v_key) is distinct from (coalesce(v_row.source_snapshot, '{}'::jsonb) -> v_key) then");
  });

  it("never blocks saving an entry or booking, and only runs when a Terapeuta is involved", () => {
    expect(sql.match(/exception when others then\s+raise warning/g)).toHaveLength(2);
    expect(sql.match(/for each row when \(new\.therapist is not null\)/g)).toHaveLength(2);
    expect(sql.match(/for each row when \(new\.therapist is not null or old\.therapist is not null\)/g)).toHaveLength(2);
  });

  it("keeps the new booking fields away from guests, and Duplicate copies them", () => {
    for (const c of ["treatment_label", "therapist", "therapist2", "call_type", "call_place"]) {
      expect(sql).toContain(`new.${c} := null;`);
      expect(sql).toContain(`v_src.${c}`);
    }
    expect(sql).toContain("revoke all on function public.accounting_suggestions() from public, anon;");
    expect(sql).toContain("revoke all on function public.accounting_sync_source(uuid, uuid) from public, anon, authenticated;");
    expect(sql).toMatch(/accounting_suggestions\(\)[\s\S]*?has_role\(auth\.uid\(\), 'coordinator'\)\) then\s+raise exception 'Not authorized'/);
  });
});

describe("Agenda → Contabilidad: the screens", () => {
  it("the agenda form saves Terapeuta and On/Out call", () => {
    const ui = read("src/components/admin/AdminInternalCalendars.tsx");
    expect(ui).toContain("therapist: form.therapist.trim() || null,");
    expect(ui).toContain('call_type: form.call_type === "on" || form.call_type === "out" ? form.call_type : null,');
    expect(ui).toContain('call_place: form.call_type === "out" ? (form.call_place.trim() || null) : null,');
    expect(ui).toContain('list="cal-clients"');
    expect(ui).toContain("<AccountingFields");
  });

  it("Edit Booking reads and saves the same fields", () => {
    const m = read("src/components/admin/calendar/BookingEditModal.tsx");
    expect(m).toContain("charge_amount, treatment_label, therapist, therapist2, call_type, call_place\" as any)");
    expect(m).toContain("therapist: details.therapist.trim() || null,");
    expect(m).toContain("<AccountingFields");
  });

  it("Contabilidad marks rows from the agenda, and a copy of one is the team's own", () => {
    const a = read("src/components/admin/AdminAccounting.tsx");
    expect(a).toContain("source_entry_id, source_booking_id\";");
    expect(a).toContain("source_entry_id: _se, source_booking_id: _sb, ...rest");
    expect(a).toContain('txt("client", "acc-clients", firstRef)');
  });
});
