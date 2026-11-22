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
  /** The row's own therapist points; null = the treatment's points (Listas). */
  points?: number | null;
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
  "Cliente", "T/L", "Tratamiento", "Lugar", "Fecha", "Costo", "Terapeuta", "Puntos", "Com. terapeuta %", "Com. terapeuta $",
  "Pagado al terapeuta", "HWC", "Hotel / Villa", "Com. hotel %", "Com. hotel $", "Notas",
];

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The month as CSV (opens in Excel), with a totals row. */
export function entriesToCsv(entries: AccountingEntry[], pointsOf?: (e: AccountingEntry) => number | null): string {
  const lines = [CSV_HEADERS.join(",")];
  let pts = 0;
  for (const e of entries) {
    const p = pointsOf ? pointsOf(e) : e.points ?? null;
    if (p != null) pts += num(p);
    lines.push([
      e.client, e.tl, e.treatment, e.location, e.entry_date, num(e.cost), e.therapist, p ?? "", num(e.therapist_pct),
      therapistCommission(e), e.therapist_paid ? "Sí" : "", hwcAmount(e), e.hotel, num(e.hotel_pct),
      hotelCommission(e), e.notes,
    ].map(csvCell).join(","));
  }
  const t = totalsOf(entries);
  lines.push(["TOTAL", "", "", "", "", t.cost, "", Math.round(pts * 10) / 10, "", t.therapist, "", t.hwc, "", "", t.hotel, ""].map(csvCell).join(","));
  return "﻿" + lines.join("\r\n");
}

// ── Lists (the Excel's dropdowns) ────────────────────────────────────────────

export type ListKind = "treatment" | "therapist" | "hotel" | "pct" | "tl" | "purchase_category" | "location";

export interface AccountingListItem {
  id: string;
  kind: ListKind;
  label: string;
  category: string | null;
  points: number | null;
  default_pct: number | null;
  sort_order: number;
  active: boolean;
}

/** Names compared the way people type them: case, accents and spaces ignored. */
export const normName = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[´`']/g, "'").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * A row's therapist points, like the Excel's column P: its own figure if one
 * was typed, else the points of its treatment in "puntos terap" (Listas →
 * Tratamientos). Salaries and commission payouts have none.
 */
export function rowPoints(e: Pick<AccountingEntry, "points" | "treatment">, treatmentPoints: (t: string | null) => number | null | undefined): number | null {
  if (e.points != null) return num(e.points);
  if (isPayroll(e.treatment) || !normName(e.treatment)) return null;
  const p = treatmentPoints(e.treatment);
  return p == null ? null : num(p);
}

/** Lookups by name for one kind of list. */
export function listIndex(items: AccountingListItem[], kind: ListKind) {
  const map = new Map<string, AccountingListItem>();
  for (const it of items) if (it.kind === kind) map.set(normName(it.label), it);
  return (name: string | null | undefined) => map.get(normName(name));
}

// ── Reports (what the Excel's summary sheets do, from every row) ─────────────

/** Rows that are payroll, not a treatment: salaries and commission payouts. */
const PAYROLL_SALARY = ["salary", "aguinaldo", "vacaciones"];
const PAYROLL_COMMISSION = ["therapist treatments commission"];
export const isPayroll = (treatment: string | null | undefined) =>
  [...PAYROLL_SALARY, ...PAYROLL_COMMISSION].includes(normName(treatment));

const label = (s: string | null | undefined, empty: string) => (s ?? "").replace(/\s+/g, " ").trim() || empty;

/** Group by a name typed in different ways (spaces / capitals): the most used spelling wins. */
function groupBy<T>(entries: AccountingEntry[], keyOf: (e: AccountingEntry) => string | null | undefined, empty: string, init: () => T, add: (acc: T, e: AccountingEntry) => void) {
  const groups = new Map<string, { names: Map<string, number>; acc: T }>();
  for (const e of entries) {
    const raw = label(keyOf(e), empty);
    const k = normName(raw);
    let g = groups.get(k);
    if (!g) { g = { names: new Map(), acc: init() }; groups.set(k, g); }
    g.names.set(raw, (g.names.get(raw) ?? 0) + 1);
    add(g.acc, e);
  }
  return [...groups.values()].map((g) => ({
    name: [...g.names.entries()].sort((a, b) => b[1] - a[1])[0][0],
    ...g.acc,
  }));
}

export interface HotelReportRow { name: string; services: number; sales: number; commission: number; pcts: number[] }

/** What is owed to each hotel / villa / concierge (the Excel's "Vendor Commissions"). */
export function hotelReport(entries: AccountingEntry[]): HotelReportRow[] {
  const rows = entries.filter((e) => !isPayroll(e.treatment) && normName(e.hotel) !== "" && normName(e.hotel) !== "n/a");
  return groupBy(rows, (e) => e.hotel, "—", () => ({ services: 0, sales: 0, commission: 0, pcts: [] as number[] }), (a, e) => {
    a.services += 1;
    a.sales = round2(a.sales + num(e.cost));
    a.commission = round2(a.commission + hotelCommission(e));
    const p = num(e.hotel_pct);
    if (!a.pcts.includes(p)) a.pcts.push(p);
  })
    .map((r) => ({ ...r, pcts: [...r.pcts].sort((a, b) => a - b) }))
    .sort((a, b) => b.commission - a.commission || b.sales - a.sales);
}

export interface TherapistReportRow {
  name: string;
  services: number;
  points: number;
  sales: number;
  treatmentCommission: number; // from the % on each treatment
  salary: number;              // Salary / Aguinaldo / Vacaciones rows
  payrollCommission: number;   // "Therapist Treatments Commission" rows (the quincena payout)
  total: number;
  missingPoints: number;       // treatments with no points on the list
}

/** Each therapist's month (the Excel's "Staff" + "puntos terap"). */
export function therapistReport(entries: AccountingEntry[], pointsOf: (e: AccountingEntry) => number | null | undefined): TherapistReportRow[] {
  const rows = entries.filter((e) => normName(e.therapist) !== "");
  return groupBy(rows, (e) => e.therapist, "—",
    () => ({ services: 0, points: 0, sales: 0, treatmentCommission: 0, salary: 0, payrollCommission: 0, total: 0, missingPoints: 0 }),
    (a, e) => {
      const amount = therapistCommission(e);
      const t = normName(e.treatment);
      if (PAYROLL_SALARY.includes(t)) a.salary = round2(a.salary + amount);
      else if (PAYROLL_COMMISSION.includes(t)) a.payrollCommission = round2(a.payrollCommission + amount);
      else {
        a.services += 1;
        a.sales = round2(a.sales + num(e.cost));
        a.treatmentCommission = round2(a.treatmentCommission + amount);
        const p = pointsOf(e);
        if (p == null) a.missingPoints += 1;
        else a.points = Math.round((a.points + num(p)) * 10) / 10;
      }
      a.total = round2(a.salary + a.payrollCommission + a.treatmentCommission);
    })
    .sort((a, b) => b.total - a.total || b.sales - a.sales);
}

export interface TreatmentReportRow { name: string; services: number; sales: number; hwc: number }
export interface TreatmentCategory { category: string; rows: TreatmentReportRow[]; services: number; sales: number; hwc: number }

/** What each treatment brings in, by category (the Excel's "Treatments"). Payroll comes last, on its own. */
export function treatmentReport(entries: AccountingEntry[], categoryOf: (treatment: string | null) => string | null | undefined): TreatmentCategory[] {
  const PAYROLL = "Planilla (salarios y comisiones)";
  const NONE = "Sin categoría";
  const byCat = new Map<string, AccountingEntry[]>();
  for (const e of entries) {
    const cat = isPayroll(e.treatment) ? PAYROLL : (categoryOf(e.treatment) || NONE);
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat)!.push(e);
  }
  const cats = [...byCat.entries()].map(([category, list]) => {
    const rows = groupBy(list, (e) => e.treatment, "(sin tratamiento)", () => ({ services: 0, sales: 0, hwc: 0 }), (a, e) => {
      a.services += 1;
      a.sales = round2(a.sales + num(e.cost));
      a.hwc = round2(a.hwc + hwcAmount(e));
    }).sort((a, b) => b.hwc - a.hwc);
    const sum = (k: "services" | "sales" | "hwc") => round2(rows.reduce((s, r) => s + r[k], 0));
    return { category, rows, services: sum("services"), sales: sum("sales"), hwc: sum("hwc") };
  });
  const rank = (c: string) => (c === PAYROLL ? 2 : c === NONE ? 1 : 0);
  return cats.sort((a, b) => rank(a.category) - rank(b.category) || b.hwc - a.hwc);
}

// ── Expenses and net profit (the Excel's "Income" sheet) ─────────────────────
//
//   Ganancia neta = HWC − Gastos mensuales − Depreciación − Compras   ('Income'!F = B − SUM(C:E))
//   4%            = Ganancia neta × 4%                               ('Income'!H = F × 0.04)
//
//   Gastos mensuales = total colones of the month ÷ that month's exchange rate ('Monthly Expenses'!54)
//   Depreciación     = the month's own figure, else the equipment total ('Initial Expenses'!H33)
//   Compras          = Σ purchase dollars (colones ÷ the rate on each purchase)

export interface MonthSetting { year: number; month: number; exchange_rate: number | null; depreciation: number | null }

export interface ExpenseItem {
  id: string;
  year: number;
  section: string | null;
  label: string;
  provider: string | null;
  amounts: (number | null)[];
  sort_order: number;
}

export interface Purchase {
  id: string;
  year: number;
  month: number;
  purchase_date: string | null;
  category: string | null;
  product: string | null;
  amount_crc: number | null;
  exchange_rate: number | null;
  amount_usd: number | null;
  quantity: number | null;
  provider: string | null;
  created_at?: string;
}

export interface Asset {
  id: string;
  name: string;
  purchased: string | null;
  amount_crc: number | null;
  exchange_rate: number | null;
  amount_usd: number | null;
  salvage: number;
  life_years: number | null;
  provider: string | null;
  active: boolean;
  sort_order: number;
}

/** ₡5,765,352.15 */
export function colones(n: number): string {
  const abs = Math.abs(n);
  const s = abs.toLocaleString("en-US", { minimumFractionDigits: abs % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return `${n < 0 ? "−" : ""}₡${s}`;
}

/** Dollars of something bought in colones (or the dollars typed). */
export function purchaseUsd(p: Pick<Purchase, "amount_crc" | "exchange_rate" | "amount_usd">): number {
  if (p.amount_usd != null) return num(p.amount_usd);
  const rate = num(p.exchange_rate);
  return rate > 0 ? num(p.amount_crc) / rate : 0;
}

export function assetUsd(a: Pick<Asset, "amount_crc" | "exchange_rate" | "amount_usd">): number {
  return purchaseUsd(a);
}
/** ('Initial Expenses'!G) = (dollars − salvage) ÷ years. */
export function assetYearly(a: Asset): number {
  const life = num(a.life_years);
  return life > 0 ? (assetUsd(a) - num(a.salvage)) / life : 0;
}
/** ('Initial Expenses'!H) = yearly ÷ 12. */
export function assetMonthly(a: Asset): number {
  return assetYearly(a) / 12;
}
/** ('Initial Expenses'!H33) = the monthly depreciation of all the equipment that counts. */
export function equipmentMonthly(assets: Asset[]): number {
  return assets.filter((a) => a.active).reduce((s, a) => s + assetMonthly(a), 0);
}

export function expensesCrc(items: ExpenseItem[], month: number): number {
  return items.reduce((s, it) => s + num(it.amounts?.[month - 1]), 0);
}

export interface IncomeRow {
  month: number;
  hwc: number;
  expensesCrc: number;
  expenses: number;
  depreciation: number;
  depreciationIsAuto: boolean;
  purchases: number;
  net: number;
  pct4: number;
  rate: number | null;
}

/** One line of the "Income" sheet. */
export function incomeRow(
  month: number,
  monthEntries: AccountingEntry[],
  items: ExpenseItem[],
  monthPurchases: Purchase[],
  setting: MonthSetting | undefined,
  assets: Asset[],
): IncomeRow {
  const hwc = totalsOf(monthEntries).hwc;
  const rate = setting?.exchange_rate != null ? num(setting.exchange_rate) : null;
  const crc = expensesCrc(items, month);
  const expenses = rate && rate > 0 ? crc / rate : 0;
  const depreciationIsAuto = setting?.depreciation == null;
  const depreciation = depreciationIsAuto ? equipmentMonthly(assets) : num(setting!.depreciation);
  const purchases = monthPurchases.reduce((s, p) => s + purchaseUsd(p), 0);
  const net = hwc - (expenses + depreciation + purchases);
  return { month, hwc, expensesCrc: crc, expenses, depreciation, depreciationIsAuto, purchases, net, pct4: net * 0.04, rate };
}

/**
 * A number typed in a cell: "263953+56808", "9.99*525", "₡1,008,645", "$45".
 * Only numbers and + − × ÷ ( ) — anything else gives null.
 */
export function evalAmount(input: string): number | null {
  const s = String(input ?? "").replace(/[₡$,\s]/g, "").replace(/[−–]/g, "-").replace(/[×x]/gi, "*").replace(/÷/g, "/");
  if (s === "") return null;
  if (!/^[\d.+\-*/()]+$/.test(s)) return null;
  let i = 0;
  const peek = () => s[i];
  const parseExpr = (): number => {
    let v = parseTerm();
    while (peek() === "+" || peek() === "-") { const op = s[i++]; const r = parseTerm(); v = op === "+" ? v + r : v - r; }
    return v;
  };
  const parseTerm = (): number => {
    let v = parseFactor();
    while (peek() === "*" || peek() === "/") { const op = s[i++]; const r = parseFactor(); v = op === "*" ? v * r : v / r; }
    return v;
  };
  const parseFactor = (): number => {
    if (peek() === "-") { i++; return -parseFactor(); }
    if (peek() === "+") { i++; return parseFactor(); }
    if (peek() === "(") { i++; const v = parseExpr(); if (s[i++] !== ")") throw new Error("paren"); return v; }
    const m = /^\d*\.?\d+|^\d+\.?/.exec(s.slice(i));
    if (!m) throw new Error("number");
    i += m[0].length;
    return Number(m[0]);
  };
  try {
    const v = parseExpr();
    if (i !== s.length || !Number.isFinite(v)) return null;
    return Math.round(v * 100) / 100;
  } catch {
    return null;
  }
}
