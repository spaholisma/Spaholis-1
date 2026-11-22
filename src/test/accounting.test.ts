import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  type AccountingEntry, entriesToCsv, hotelCommission, hwcAmount, money, parseNumber, therapistCommission, totalsOf,
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
