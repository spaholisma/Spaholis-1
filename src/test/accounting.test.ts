import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  type AccountingEntry, type Asset, rowPoints, type ExpenseItem, type Purchase, assetMonthly, assetYearly, colones, equipmentMonthly,
  evalAmount, incomeRow, purchaseUsd, entriesToCsv, hotelCommission, hotelReport, hwcAmount, isPayroll, money, normName, parseNumber,
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
    expect(csv.split("\r\n").pop()).toBe("TOTAL,,,,,83,,0,,411,,-336.3,,,8.3,");
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
    const points = (e: AccountingEntry) => ({ "couples 60 min": 1, "holisynergie 60 min": 1, "pure bliss 60 min": 1 } as Record<string, number>)[normName(e.treatment)];
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
    expect(ui).toContain("const offList = (k: \"treatment\" | \"therapist\" | \"hotel\" | \"location\") =>");
  });
});

describe("Contabilidad net profit, as the Excel's Income sheet", () => {
  const asset = (p: Partial<Asset>): Asset => ({
    id: "a", name: "x", purchased: null, amount_crc: null, exchange_rate: null, amount_usd: null, salvage: 0, life_years: 1,
    provider: null, active: true, sort_order: 0, ...p,
  });

  it("equipment: (dollars − salvage) ÷ years ÷ 12 ('Initial Expenses'!G/H)", () => {
    const hydrogen = asset({ amount_crc: 210000, amount_usd: 3500, life_years: 5 });
    expect(assetYearly(hydrogen)).toBe(700);
    expect(Math.round(assetMonthly(hydrogen) * 100) / 100).toBe(58.33);
    const furniture = asset({ amount_crc: 686000, exchange_rate: 555, life_years: 3 });
    expect(Math.round(assetMonthly(furniture) * 100) / 100).toBe(34.33);
    expect(equipmentMonthly([hydrogen, { ...furniture, active: false }])).toBeCloseTo(58.3333, 3);
  });

  it("January 2026: HWC − expenses − depreciation − purchases = net, and 4%", () => {
    // Expenses ₡5,765,352.15 ÷ 500 = $11,530.70; depreciation $479.06; purchases $1,799.05 (Income row 2).
    const items: ExpenseItem[] = [{ id: "i", year: 2026, section: null, label: "Total", provider: null, sort_order: 0, amounts: [5765352.15, ...Array(11).fill(null)] }];
    const purchases: Purchase[] = [{ id: "p", year: 2026, month: 1, purchase_date: null, category: null, product: null, amount_crc: 899523, exchange_rate: 500, amount_usd: null, quantity: null, provider: null }];
    const entries = [row({ month: 1, cost: 20704.21 })];
    const r = incomeRow(1, entries, items, purchases, { year: 2026, month: 1, exchange_rate: 500, depreciation: 479.06 }, []);
    expect(Math.round(r.expenses * 100) / 100).toBe(11530.7);
    expect(r.depreciation).toBe(479.06);
    expect(Math.round(r.purchases * 100) / 100).toBe(1799.05);
    expect(Math.round(r.net * 100) / 100).toBe(6895.4);
    expect(Math.round(r.pct4 * 100) / 100).toBe(275.82);
  });

  it("depreciation: the month's own figure, else the equipment total", () => {
    const eq = [asset({ amount_usd: 1200, life_years: 1 })]; // $100 a month
    expect(incomeRow(10, [], [], [], { year: 2026, month: 10, exchange_rate: 440, depreciation: 399 }, eq).depreciation).toBe(399);
    const auto = incomeRow(9, [], [], [], { year: 2026, month: 9, exchange_rate: 450, depreciation: null }, eq);
    expect(auto.depreciation).toBe(100);
    expect(auto.depreciationIsAuto).toBe(true);
  });

  it("purchases in dollars: colones ÷ the purchase's rate, or the dollars typed", () => {
    expect(purchaseUsd({ amount_crc: 3350, exchange_rate: 500, amount_usd: null })).toBe(6.7);
    expect(purchaseUsd({ amount_crc: 210000, exchange_rate: 440, amount_usd: 500 })).toBe(500);
    expect(purchaseUsd({ amount_crc: 1000, exchange_rate: null, amount_usd: null })).toBe(0);
  });

  it("cells take sums like the Excel (=263953+56808, =9.99*525)", () => {
    expect(evalAmount("263953+56808")).toBe(320761);
    expect(evalAmount("9.99*525")).toBe(5244.75);
    expect(evalAmount("₡1,008,645")).toBe(1008645);
    expect(evalAmount("(100-20)/4")).toBe(20);
    expect(evalAmount("o")).toBeNull();
    expect(evalAmount("2+")).toBeNull();
    expect(colones(5765352.15)).toBe("₡5,765,352.15");
  });

  it("the expense tables are admin-only and hold no data in the repository", () => {
    const sql = read("supabase/migrations/20261122160000_accounting_expenses.sql");
    for (const t of ["accounting_month_settings", "accounting_expense_items", "accounting_purchases", "accounting_assets"]) {
      expect(sql).toContain(`'${t}'`);
    }
    expect(sql).toMatch(/revoke all on public\.%I from anon, authenticated/);
    expect(sql).not.toMatch(/insert into/i);
  });
});

describe("Contabilidad points and places, as the Excel rows", () => {
  const list = (t: string | null) => ({ "couples 60 min": 1, "share the magic": 3, "pura vida love couples": 2.5 } as Record<string, number>)[normName(t)] ?? null;

  it("a row has the points of its treatment (puntos terap), unless it has its own", () => {
    expect(rowPoints(row({ treatment: "Couples 60 min" }), list)).toBe(1);
    expect(rowPoints(row({ treatment: "Share the Magic" }), list)).toBe(3);
    expect(rowPoints(row({ treatment: "Pura Vida Love Couples" }), list)).toBe(2.5);
    expect(rowPoints(row({ treatment: "Couples 60 min", points: 2 }), list)).toBe(2);
    expect(rowPoints(row({ treatment: "Something new" }), list)).toBeNull();
    expect(rowPoints(row({ treatment: "Salary" }), list)).toBeNull();
  });

  it("the CSV has the points", () => {
    const csv = entriesToCsv([row({ treatment: "Share the Magic", cost: 260 })], (e) => rowPoints(e, list));
    expect(csv.split("\r\n")[0]).toContain("Terapeuta,Puntos,");
    expect(csv.split("\r\n").pop()).toBe("TOTAL,,,,,260,,3,,0,,260,,,0,");
  });

  it("the migration adds the row points, the places list and the VLOOKUP points", () => {
    const sql = read("supabase/migrations/20261122180000_accounting_points_locations.sql");
    expect(sql).toMatch(/add column if not exists points numeric\(4, 1\)/);
    expect(sql).toContain("('location', 'HWC', 1)");
    expect(sql).toMatch(/set points = 1\s+where kind = 'treatment' and lower\(btrim\(label\)\) = 'toning and sliming treatment'/);
  });

  it("the sheet shows Puntos next to the therapist and Lugar as a dropdown", () => {
    const ui = read("src/components/admin/AdminAccounting.tsx");
    expect(ui).toContain(">Puntos</Th>");
    expect(ui).toContain('location: of("location")');
    expect(ui).toContain("points={pointsOf(e)}");
  });
});
