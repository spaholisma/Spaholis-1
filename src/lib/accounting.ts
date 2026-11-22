/**
 * Contabilidad — the monthly accounting sheet, worked out the same way as the
 * Excel it replaces:
 *
 *   hotel commission     = cost × hotel %                     (unless typed by hand)
 *   therapist commission = (cost − hotel commission) × therapist %  (unless typed by hand)
 *   HWC (what stays with Holis) = cost − hotel commission − therapist commission
 *
 * e.g. Holisynergie 60 min, $95, Wai 20%, therapist 45% → hotel $19,
 * therapist $34.20, HWC $41.80. A salary row: cost $0, therapist $411 typed
 * by hand → HWC −$411.
 */

export interface AccountingEntry {
  id: string;
  year: number;
  month: number;
  client: string | null;
  tl: string | null;
  treatment: string | null;
  location: string | null;
  entry_date: string | null;
  cost: number;
  therapist: string | null;
  therapist_pct: number;
  therapist_amount: number | null;
  therapist_paid: boolean;
  hotel: string | null;
  hotel_pct: number;
  hotel_amount: number | null;
  notes: string | null;
  created_at?: string;
}

export const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function hotelCommission(e: Pick<AccountingEntry, "cost" | "hotel_pct" | "hotel_amount">): number {
  if (e.hotel_amount != null) return num(e.hotel_amount);
  return round2(num(e.cost) * num(e.hotel_pct) / 100);
}

export function therapistCommission(
  e: Pick<AccountingEntry, "cost" | "hotel_pct" | "hotel_amount" | "therapist_pct" | "therapist_amount">,
): number {
  if (e.therapist_amount != null) return num(e.therapist_amount);
  return round2((num(e.cost) - hotelCommission(e)) * num(e.therapist_pct) / 100);
}

/** What stays with Holis (the Excel's HWC column). */
export function hwcAmount(
  e: Pick<AccountingEntry, "cost" | "hotel_pct" | "hotel_amount" | "therapist_pct" | "therapist_amount">,
): number {
  return round2(num(e.cost) - hotelCommission(e) - therapistCommission(e));
}

export interface AccountingTotals {
  rows: number;
  cost: number;
  therapist: number;
  hotel: number;
  hwc: number;
}

export function totalsOf(entries: AccountingEntry[]): AccountingTotals {
  const t = { rows: entries.length, cost: 0, therapist: 0, hotel: 0, hwc: 0 };
  for (const e of entries) {
    t.cost += num(e.cost);
    t.therapist += therapistCommission(e);
    t.hotel += hotelCommission(e);
    t.hwc += hwcAmount(e);
  }
  return { rows: t.rows, cost: round2(t.cost), therapist: round2(t.therapist), hotel: round2(t.hotel), hwc: round2(t.hwc) };
}

/** $1,234 or $1,234.50 (negative: −$411). */
export function money(n: number): string {
  const abs = Math.abs(n);
  const s = abs.toLocaleString("en-US", { minimumFractionDigits: abs % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return `${n < 0 ? "−" : ""}$${s}`;
}

/** A typed number ("$1,234.50", "45%", "", "abc") → number or null when empty/invalid. */
export function parseNumber(input: string): number | null {
  const cleaned = String(input ?? "").replace(/[$,%\s]/g, "").replace(/[−–]/g, "-");
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const CSV_HEADERS = [
  "Cliente", "T/L", "Tratamiento", "Lugar", "Fecha", "Costo", "Terapeuta", "Com. terapeuta %", "Com. terapeuta $",
  "Pagado al terapeuta", "HWC", "Hotel / Villa", "Com. hotel %", "Com. hotel $", "Notas",
];

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The month as CSV (opens in Excel), with a totals row. */
export function entriesToCsv(entries: AccountingEntry[]): string {
  const lines = [CSV_HEADERS.join(",")];
  for (const e of entries) {
    lines.push([
      e.client, e.tl, e.treatment, e.location, e.entry_date, num(e.cost), e.therapist, num(e.therapist_pct),
      therapistCommission(e), e.therapist_paid ? "Sí" : "", hwcAmount(e), e.hotel, num(e.hotel_pct),
      hotelCommission(e), e.notes,
    ].map(csvCell).join(","));
  }
  const t = totalsOf(entries);
  lines.push(["TOTAL", "", "", "", "", t.cost, "", "", t.therapist, "", t.hwc, "", "", t.hotel, ""].map(csvCell).join(","));
  return "﻿" + lines.join("\r\n");
}
