import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  type AccountingEntry, entriesToCsv, hotelCommission, hotelReport, hwcAmount, isPayroll, money, normName, parseNumber,
  therapistCommission, therapistReport, totalsOf, treatmentReport,
} from "@/lib/accounting";

// 2026-11-22: Admin → Contabilidad replaces the monthly Excel sheets. The sums
// must match the Excel (rows taken from the March 2026 sheet).

const row = (p: Partial<AccountingEntry>): AccountingEntry => ({
  id: "x", year: 2027, month: 3, client: null, tl: null, treatment: null, location: "HWC", entry_date: null,
  cost: 0, therapist: null, therapist_pct: 0, therapist_amount: null, therapist_paid: false,
  hotel: null, hotel_pct: 0, hotel_amount: null, notes: null, ...p,
});

const read = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8").replace(/\r\n/g, "\n");

describe("Contabilidad sums, as in the Excel", () => {
  it("Couples 60 min, $83, Recepción 10% → hotel $8.30, HWC $74.70", () => {
    const e = row({ cost: 83, hotel: "Recepcion", hotel_pct: 10 });
    expect(hotelCommission(e)).toBe(8.3);
    expect(therapistCommission(e)).toBe(0);
    expect(hwcAmount(e)).toBe(74.7);
  });

  it("Holisynergie 60 min, $95, Wai 20%, therapist 45% → therapist on cost minus hotel", () => {
    const e = row({ cost: 95, hotel_pct: 20, therapist_pct: 45 });
    expect(hotelCommission(e)).toBe(19);
    expect(therapistCommission(e)).toBe(34.2);
    expect(hwcAmount(e)).toBe(41.8);
  });

  it("Couples 90 min, $110, Recepción 10%, therapist 40% → $39.60 / HWC $59.40", () => {
    const e = row({ cost: 110, hotel_pct: 10, therapist_pct: 40 });
    expect(therapistCommission(e)).toBe(39.6);
    expect(hwcAmount(e)).toBe(59.4);
  });

  it("a salary typed by hand: cost $0, $411 → HWC −$411", () => {
    const e = row({ treatment: "Salary", therapist_amount: 411 });
    expect(therapistCommission(e)).toBe(411);
    expect(hwcAmount(e)).toBe(-411);
    expect(money(hwcAmount(e))).toBe("−$411");
  });

  it("a hotel amount typed by hand wins over the %", () => {
    const e = row({ cost: 100, hotel_pct: 20, hotel_amount: 15, therapist_pct: 50 });
    expect(hotelCommission(e)).toBe(15);
    expect(therapistCommission(e)).toBe(42.5);
    expect(hwcAmount(e)).toBe(42.5);
  });

  it("totals and CSV", () => {
    const rows = [row({ cost: 83, hotel_pct: 10 }), row({ treatment: "Salary", therapist_amount: 411 })];
    expect(totalsOf(rows)).toEqual({ rows: 2, cost: 83, therapist: 411, hotel: 8.3, hwc: -336.3 });
    const csv = entriesToCsv(rows);
    expect(csv.startsWith("﻿Cliente,T/L,Tratamiento")).toBe(true);
    expect(csv.split("\r\n").pop()).toBe("TOTAL,,,,,83,,,411,,-336.3,,,8.3,");
  });

  it("reads typed numbers", () => {
    expect(parseNumber("$1,234.50")).toBe(1234.5);
    expect(parseNumber("45%")).toBe(45);
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("abc")).toBeNull();
  });
});

describe("Contabilidad in the Admin", () => {
  it("is a sidebar link on its own, for full admins only", () => {
    const dash = read("src/pages/AdminDashboard.tsx");
    expect(dash).toContain('{ label: "Contabilidad", icon: Calculator, id: "accounting" },');
    expect(dash).toContain('{activeTab === "accounting" && canRender("accounting") && <AdminAccounting />}');
    expect(dash).toContain('const COORDINATOR_TABS = ["calendars", "appointments", "trash"];');
    expect(read("src/components/admin/adminSidebarGroups.ts")).toContain('export const TOP_LEVEL = ["overview", "accounting"];');
  });

  it("the tables are closed to everyone but full admins", () => {
    const sql = read("supabase/migrations/20261122120000_accounting.sql");
    expect(sql).toMatch(/revoke all on public\.accounting_entries from anon, authenticated;/);
    expect(sql.match(/using \(public\.has_role\(auth\.uid\(\), 'super_admin'\) or public\.has_role\(auth\.uid\(\), 'manager'\)\)/g)?.length).toBe(2);
    expect(sql).not.toMatch(/to anon/);
  });
});

describe("Contabilidad reports (from every row, unlike the Excel's summaries)", () => {
  const rows: AccountingEntry[] = [
    row({ treatment: "Salary", therapist: "Susana ", therapist_amount: 411 }),
    row({ treatment: "Therapist Treatments Commission", therapist: "Susana", therapist_amount: 120 }),
    row({ treatment: "Couples 60 min", therapist: "Susana", cost: 83, hotel: "Escape Villas", hotel_pct: 20 }),
    row({ treatment: "Holisynergie 60 min", therapist: "Thiara", cost: 95, therapist_pct: 45, hotel: "Wai (Kindra)", hotel_pct: 20 }),
    row({ treatment: "couples 60 min", therapist: "Thiara", cost: 83, therapist_pct: 45, hotel: "escape villas ", hotel_pct: 20 }),
    row({ treatment: "Pure Bliss 60 min", therapist: "Jenny", cost: 77, hotel: "N/A" }),
    row({ treatment: "Something new", therapist: "Jenny", cost: 10 }),
  ];

  it("hotels: one line per hotel (spelling differences joined), N/A left out", () => {
    const r = hotelReport(rows);
    expect(r.map((x) => [x.name, x.services, x.commission])).toEqual([
      ["Escape Villas", 2, 33.2],
      ["Wai (Kindra)", 1, 19],
    ]);
    expect(r[0].pcts).toEqual([20]);
  });

  it("therapists: salary, quincena commission and treatment commission apart; points from the list", () => {
    const points = (t: string | null) => ({ "couples 60 min": 1, "holisynergie 60 min": 1, "pure bliss 60 min": 1 } as Record<string, number>)[normName(t)];
    const r = therapistReport(rows, points);
    const susana = r.find((x) => x.name.startsWith("Susana"))!;
    expect(susana).toMatchObject({ services: 1, points: 1, sales: 83, treatmentCommission: 0, salary: 411, payrollCommission: 120, total: 531 });
    const thiara = r.find((x) => x.name === "Thiara")!;
    expect(thiara).toMatchObject({ services: 2, points: 2, sales: 178, treatmentCommission: 64.08, total: 64.08 });
    const jenny = r.find((x) => x.name === "Jenny")!;
    expect(jenny.missingPoints).toBe(1);
  });

  it("treatments: by category, payroll last, and the total equals the month's HWC", () => {
    const cat = (t: string | null) => ({ "couples 60 min": "MASSAGE + HOLISTIC", "holisynergie 60 min": "MASSAGE + HOLISTIC", "pure bliss 60 min": "MASSAGE + HOLISTIC" } as Record<string, string>)[normName(t)];
    const r = treatmentReport(rows, cat);
    expect(r.map((c) => c.category)).toEqual(["MASSAGE + HOLISTIC", "Sin categoría", "Planilla (salarios y comisiones)"]);
    const couples = r[0].rows.find((x) => x.name === "Couples 60 min")!;
    expect(couples.services).toBe(2);
    const sum = Math.round(r.reduce((s, c) => s + c.hwc, 0) * 100) / 100;
    expect(sum).toBe(totalsOf(rows).hwc);
  });

  it("names compare without capitals, accents or extra spaces", () => {
    expect(normName("  Let´s  Party ")).toBe(normName("let's party"));
    expect(isPayroll("SALARY")).toBe(true);
    expect(isPayroll("Couples 60 min")).toBe(false);
  });
});

describe("Contabilidad lists (the Excel's dropdowns)", () => {
  it("are in their own admin-only table, filled from the Excel's lists", () => {
    const sql = read("supabase/migrations/20261122140000_accounting_lists.sql");
    expect(sql).toMatch(/create table if not exists public\.accounting_lists/);
    expect(sql).toMatch(/revoke all on public\.accounting_lists from anon, authenticated;/);
    expect(sql).not.toMatch(/to anon/);
    expect(sql).toContain("('treatment', 'Couples 60 min', 'MASSAGE + HOLISTIC', 1.0,");
    expect(sql).toContain("('therapist', 'Susana',");
    expect(sql).toContain("('hotel', 'Escape Villas',");
    expect(sql).toContain("('pct', '45',");
    expect(sql).toContain("('tl', 'Tourist',");
  });

  it("the sheet shows the lists as dropdowns and marks names that are not on them", () => {
    const ui = read("src/components/admin/AdminAccounting.tsx");
    expect(ui).toContain('<datalist id="acc-treatments">{options.treatment.map(');
    expect(ui).toContain('list="acc-pct"');
    expect(ui).toContain("const offList = (k: \"treatment\" | \"therapist\" | \"hotel\") =>");
  });
});
