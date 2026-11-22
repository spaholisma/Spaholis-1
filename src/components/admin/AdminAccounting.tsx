import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BarChart3, Copy, Download, ListChecks, Loader2, Plus, Search, ShoppingBag, Table2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  type AccountingEntry, type AccountingListItem, type Asset, type ExpenseItem, type MonthSetting, MONTHS_ES, type Purchase,
  entriesToCsv, hotelCommission, hwcAmount, incomeRow, listIndex, money, normName, parseNumber, rowPoints, therapistCommission, totalsOf,
} from "@/lib/accounting";
import { AccountingReports } from "@/components/admin/accounting/AccountingReports";
import { AccountingLists } from "@/components/admin/accounting/AccountingLists";
import { AccountingExpenses } from "@/components/admin/accounting/AccountingExpenses";
import { AccountingPurchases } from "@/components/admin/accounting/AccountingPurchases";
import { AccountingAssets } from "@/components/admin/accounting/AccountingAssets";
import { AccountingIncome } from "@/components/admin/accounting/AccountingIncome";

// Admin → Contabilidad. The monthly accounting sheets (they used to live in
// Excel on OneDrive): a year → its twelve months → each month's rows, with the
// same columns and the same sums as the Excel; the Excel's dropdowns (Listas)
// and its summary sheets (Reportes). Full admins only (the tables' RLS refuses
// anyone else).

const sb = supabase as any;
const SUMMARY = 0; // the "Resumen del año" tab; months are 1–12
const LISTS = -1;  // the "Listas" view
const EXPENSES = -2; // the year's "Gastos mensuales"
const ASSETS = -3;   // "Equipos" (depreciation)

const TEXT_FIELDS = ["client", "tl", "treatment", "location", "therapist", "hotel", "notes"] as const;
type TextField = (typeof TEXT_FIELDS)[number];

const ENTRY_COLUMNS =
  "id, year, month, client, tl, treatment, location, entry_date, cost, therapist, therapist_pct, therapist_amount, therapist_paid, hotel, hotel_pct, hotel_amount, notes, points, created_at";

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Every row of one year (more than 1,000 come in pages). */
async function fetchYear(year: number): Promise<AccountingEntry[]> {
  const out: AccountingEntry[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("accounting_entries")
      .select(ENTRY_COLUMNS)
      .eq("year", year)
      .order("month")
      .order("entry_date", { ascending: true, nullsFirst: false })
      .order("created_at")
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as AccountingEntry[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const isNewer = (a: AccountingEntry, b: AccountingEntry) => (a.created_at ?? "") > (b.created_at ?? "");

// The column groups of the sheet, each with its own color (as in the Excel).
// Solid colors: the header stays on top while scrolling.
const GROUPS = {
  service: "bg-muted",
  therapist: "bg-sky-50",
  holis: "bg-emerald-50",
  hotel: "bg-amber-50",
  notes: "bg-muted",
};

export function AdminAccounting() {
  const [years, setYears] = useState<number[]>([]);
  const [year, setYear] = useState<number | null>(null);
  const [tab, setTab] = useState<number>(SUMMARY);
  const [view, setView] = useState<"rows" | "reports" | "purchases">("rows");
  const [entries, setEntries] = useState<AccountingEntry[]>([]);
  const [lists, setLists] = useState<AccountingListItem[]>([]);
  // The expense side (the Excel's Monthly Expenses, purchases, Initial Expenses, Income).
  const [settings, setSettings] = useState<MonthSetting[]>([]);
  const [items, setItems] = useState<ExpenseItem[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [focusId, setFocusId] = useState<string | null>(null);

  const loadYears = useCallback(async () => {
    const { data, error } = await sb.from("accounting_years").select("year").order("year");
    if (error) { toast.error(error.message); return []; }
    const list = ((data ?? []) as { year: number }[]).map((r) => r.year);
    setYears(list);
    return list;
  }, []);

  useEffect(() => {
    (async () => {
      const list = await loadYears();
      const now = new Date();
      const thisYear = now.getFullYear();
      const pick = list.includes(thisYear) ? thisYear : list[list.length - 1] ?? null;
      setYear(pick);
      setTab(pick === thisYear ? now.getMonth() + 1 : SUMMARY);
      if (pick == null) setLoading(false);
    })();
    sb.from("accounting_lists").select("*").order("kind").order("sort_order").then(({ data, error }: any) => {
      if (error) toast.error(`Listas: ${error.message}`);
      else setLists((data ?? []) as AccountingListItem[]);
    });
    sb.from("accounting_assets").select("*").order("sort_order").then(({ data, error }: any) => {
      if (error) toast.error(`Equipos: ${error.message}`);
      else setAssets((data ?? []) as Asset[]);
    });
  }, [loadYears]);

  useEffect(() => {
    if (year == null) return;
    let alive = true;
    setLoading(true);
    Promise.all([
      fetchYear(year),
      sb.from("accounting_month_settings").select("*").eq("year", year),
      sb.from("accounting_expense_items").select("*").eq("year", year).order("sort_order"),
      sb.from("accounting_purchases").select("*").eq("year", year).order("month").order("purchase_date", { ascending: true, nullsFirst: false }).order("created_at"),
    ])
      .then(([rows, st, it, pu]: any[]) => {
        if (!alive) return;
        setEntries(rows);
        for (const r of [st, it, pu]) if (r.error) toast.error(r.error.message);
        setSettings((st.data ?? []) as MonthSetting[]);
        setItems((it.data ?? []) as ExpenseItem[]);
        setPurchases((pu.data ?? []) as Purchase[]);
      })
      .catch((e) => toast.error(e.message ?? String(e)))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [year]);

  // The dropdowns: the lists (Contabilidad → Listas), like the Excel's.
  const active = useMemo(() => lists.filter((l) => l.active), [lists]);
  const options = useMemo(() => {
    const of = (k: AccountingListItem["kind"]) => active.filter((l) => l.kind === k).sort((a, b) => a.sort_order - b.sort_order).map((l) => l.label);
    return {
      treatment: of("treatment"),
      therapist: of("therapist"),
      hotel: of("hotel"),
      tl: of("tl"),
      pct: active.filter((l) => l.kind === "pct").map((l) => l.label).sort((a, b) => Number(a) - Number(b)),
      location: of("location"),
    };
  }, [active, entries]);
  const known = useMemo(() => ({
    treatment: listIndex(lists, "treatment"),
    therapist: listIndex(lists, "therapist"),
    hotel: listIndex(lists, "hotel"),
    location: listIndex(lists, "location"),
  }), [lists]);

  // A new hotel → its usual % (Listas), else the last % used with it.
  // A new treatment → its last price.
  const hotelPctFor = useCallback((hotel: string) => {
    const fromList = known.hotel(hotel)?.default_pct;
    if (fromList != null) return Number(fromList);
    let best: AccountingEntry | null = null;
    for (const e of entries) {
      if (normName(e.hotel) === normName(hotel) && Number(e.hotel_pct) > 0 && (!best || isNewer(e, best))) best = e;
    }
    return best ? Number(best.hotel_pct) : null;
  }, [entries, known]);
  const lastCost = useCallback((treatment: string) => {
    let best: AccountingEntry | null = null;
    for (const e of entries) {
      if (normName(e.treatment) === normName(treatment) && Number(e.cost) > 0 && (!best || isNewer(e, best))) best = e;
    }
    return best ? Number(best.cost) : null;
  }, [entries]);

  // The month's exchange rate / its own depreciation figure ("Income" columns I and D).
  const saveSetting = useCallback(async (month: number, patch: Partial<MonthSetting>) => {
    if (year == null) return;
    let before: MonthSetting | undefined;
    setSettings((prev) => {
      before = prev.find((s) => s.month === month);
      const next = { year, month, exchange_rate: before?.exchange_rate ?? null, depreciation: before?.depreciation ?? null, ...patch };
      return before ? prev.map((s) => (s.month === month ? next : s)) : [...prev, next];
    });
    const row = { year, month, exchange_rate: before?.exchange_rate ?? null, depreciation: before?.depreciation ?? null, ...patch };
    const { error } = await sb.from("accounting_month_settings").upsert(row, { onConflict: "year,month" });
    if (error) {
      toast.error(`No se guardó: ${error.message}`);
      const b = before;
      setSettings((prev) => (b ? prev.map((s) => (s.month === month ? b : s)) : prev.filter((s) => s.month !== month)));
    }
  }, [year]);

  const pointsOf = useCallback(
    (e: AccountingEntry) => rowPoints(e, (t) => known.treatment(t)?.points ?? null),
    [known],
  );

  const saveRow = useCallback(async (id: string, patch: Partial<AccountingEntry>) => {
    let before: AccountingEntry | undefined;
    setEntries((prev) => prev.map((e) => { if (e.id === id) { before = e; return { ...e, ...patch }; } return e; }));
    const { error } = await sb.from("accounting_entries").update(patch).eq("id", id);
    if (error) {
      toast.error(`No se guardó: ${error.message}`);
      if (before) { const b = before; setEntries((prev) => prev.map((e) => (e.id === id ? b : e))); }
    }
  }, []);

  const addRow = async (copyOf?: AccountingEntry) => {
    if (year == null || tab < 1) return;
    const today = new Date();
    const inThisMonth = today.getFullYear() === year && today.getMonth() + 1 === tab;
    const base = copyOf
      ? (({ id: _id, created_at: _c, ...rest }) => rest)(copyOf)
      : {
          year, month: tab,
          entry_date: `${year}-${pad2(tab)}-${pad2(inThisMonth ? today.getDate() : 1)}`,
          location: "HWC", cost: 0, therapist_pct: 0, hotel_pct: 0,
        };
    const { data, error } = await sb.from("accounting_entries").insert(base).select(ENTRY_COLUMNS).single();
    if (error) { toast.error(error.message); return; }
    setEntries((prev) => {
      if (!copyOf) return [...prev, data as AccountingEntry];
      const i = prev.findIndex((e) => e.id === copyOf.id);
      const next = [...prev];
      next.splice(i + 1, 0, data as AccountingEntry);
      return next;
    });
    setQuery("");
    setFocusId((data as AccountingEntry).id);
  };

  const deleteRow = async (e: AccountingEntry) => {
    const label = [e.client, e.treatment].filter(Boolean).join(" · ") || "esta fila";
    if (!confirm(`¿Eliminar ${label}?`)) return;
    const { error } = await sb.from("accounting_entries").delete().eq("id", e.id);
    if (error) { toast.error(error.message); return; }
    setEntries((prev) => prev.filter((x) => x.id !== e.id));
    toast.success("Fila eliminada");
  };

  const addYear = async () => {
    const suggestion = years.length ? Math.max(...years) + 1 : new Date().getFullYear();
    const typed = prompt("¿Qué año quieres agregar?", String(suggestion));
    if (typed == null) return;
    const y = Number(typed.trim());
    if (!Number.isInteger(y) || y < 2000 || y > 2100) { toast.error("Escribe un año, por ejemplo 2027"); return; }
    if (years.includes(y)) { setYear(y); setTab(SUMMARY); return; }
    const { error } = await sb.from("accounting_years").insert({ year: y });
    if (error) { toast.error(error.message); return; }
    await loadYears();
    setYear(y);
    setTab(SUMMARY);
    toast.success(`Año ${y} agregado`);
  };

  const deleteYear = async () => {
    if (year == null) return;
    const rows = entries.length;
    const typed = prompt(
      `Esto elimina el año ${year}${rows ? ` y sus ${rows} filas` : ""}. No se puede deshacer.\n\nPara confirmar, escribe ${year}:`,
    );
    if (typed == null) return;
    if (typed.trim() !== String(year)) { toast.error("No coincide; no se eliminó nada"); return; }
    const { error } = await sb.from("accounting_years").delete().eq("year", year);
    if (error) { toast.error(error.message); return; }
    const list = await loadYears();
    setYear(list[list.length - 1] ?? null);
    setEntries([]);
    setTab(SUMMARY);
    toast.success(`Año ${year} eliminado`);
  };

  const monthAll = useMemo(() => (tab >= 1 ? entries.filter((e) => e.month === tab) : []), [entries, tab]);
  const monthRows = useMemo(() => {
    const q = normName(query);
    if (!q) return monthAll;
    return monthAll.filter((e) =>
      [e.client, e.tl, e.treatment, e.location, e.therapist, e.hotel, e.notes, e.entry_date].some((v) => normName(v).includes(q)),
    );
  }, [monthAll, query]);
  const monthTotals = useMemo(() => totalsOf(monthRows), [monthRows]);
  const monthPoints = useMemo(() => Math.round(monthRows.reduce((s, e) => s + (pointsOf(e) ?? 0), 0) * 10) / 10, [monthRows, pointsOf]);

  const exportCsv = () => {
    if (year == null || tab < 1) return;
    const url = URL.createObjectURL(new Blob([entriesToCsv(monthRows, pointsOf)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `contabilidad-${year}-${pad2(tab)}-${MONTHS_ES[tab - 1].toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const showRowsOf = (text: string) => { setQuery(text); setView("rows"); };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-heading font-bold text-foreground">Contabilidad</h2>
          <p className="font-body text-sm text-muted-foreground">
            Cada año tiene sus 12 meses. Escribe en las celdas y se guarda solo al salir de la celda.
          </p>
        </div>
        <Button
          type="button"
          variant={tab === LISTS ? "default" : "outline"}
          onClick={() => setTab(tab === LISTS ? SUMMARY : LISTS)}
        >
          <ListChecks className="h-4 w-4 mr-1" /> Listas (dropdowns)
        </Button>
      </div>

      {/* Years */}
      <div className="flex flex-wrap items-center gap-2">
        {years.map((y) => (
          <button
            key={y}
            type="button"
            onClick={() => { if (y !== year) { setYear(y); setTab(SUMMARY); setQuery(""); } }}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-body font-semibold border transition-colors",
              y === year ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {y}
          </button>
        ))}
        <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={addYear}>
          <Plus className="h-4 w-4 mr-1" /> Año
        </Button>
      </div>

      {tab === LISTS ? (
        <AccountingLists lists={lists} setLists={setLists} entries={entries} year={year} />
      ) : year == null ? (
        <p className="font-body text-sm text-muted-foreground">Todavía no hay ningún año. Agrega uno con “+ Año”.</p>
      ) : (
        <>
          {/* Months — like the tabs at the bottom of the Excel */}
          <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
            {[SUMMARY, EXPENSES, ASSETS, ...MONTHS_ES.map((_, i) => i + 1)].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setTab(m); setQuery(""); }}
                className={cn(
                  "shrink-0 rounded-lg px-3 py-1.5 text-sm font-body font-medium transition-colors",
                  m === tab ? "bg-spa-sage/20 text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  m === ASSETS && "mr-3 relative after:absolute after:-right-2 after:top-1.5 after:bottom-1.5 after:w-px after:bg-border",
                )}
              >
                {m === SUMMARY ? `Resumen ${year}` : m === EXPENSES ? "Gastos mensuales" : m === ASSETS ? "Equipos" : MONTHS_ES[m - 1]}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center gap-2 py-10 justify-center text-muted-foreground font-body text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
            </div>
          ) : tab === SUMMARY ? (
            <YearSummary
              year={year} entries={entries} lists={lists}
              items={items} purchases={purchases} settings={settings} assets={assets} saveSetting={saveSetting}
              onOpenMonth={(m) => { setTab(m); setView("rows"); }} onDeleteYear={deleteYear}
            />
          ) : tab === EXPENSES ? (
            <AccountingExpenses year={year} items={items} setItems={setItems} settings={settings} saveSetting={saveSetting} />
          ) : tab === ASSETS ? (
            <AccountingAssets assets={assets} setAssets={setAssets} />
          ) : (
            <div className="space-y-4">
              <TotalsCards totals={totalsOf(monthAll)} />
              <MonthNet
                row={incomeRow(tab, monthAll, items, purchases.filter((p) => p.month === tab), settings.find((s) => s.month === tab), assets)}
                onOpen={(v) => { if (v === "purchases") setView("purchases"); else setTab(v === "expenses" ? EXPENSES : ASSETS); }}
              />

              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/40">
                  {([["rows", "Filas", Table2], ["reports", "Reportes", BarChart3], ["purchases", "Compras", ShoppingBag]] as const).map(([id, label, Icon]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setView(id)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-body font-medium transition-colors",
                        view === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4" /> {label}
                    </button>
                  ))}
                </div>
                {view === "rows" && (
                  <>
                    <Button type="button" onClick={() => addRow()}>
                      <Plus className="h-4 w-4 mr-1" /> Agregar fila
                    </Button>
                    <div className="relative flex-1 min-w-[200px] max-w-sm">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar cliente, terapeuta, hotel…" className="pl-8" />
                    </div>
                    <Button type="button" variant="outline" className="ml-auto" onClick={exportCsv} disabled={monthRows.length === 0}>
                      <Download className="h-4 w-4 mr-1" /> Exportar a Excel (CSV)
                    </Button>
                  </>
                )}
              </div>

              {view === "purchases" ? (
                <AccountingPurchases
                  year={year} month={tab} purchases={purchases} setPurchases={setPurchases} lists={lists}
                  monthRate={(() => { const r = settings.find((s) => s.month === tab)?.exchange_rate; return r != null ? Number(r) : null; })()}
                />
              ) : view === "reports" ? (
                <AccountingReports
                  entries={monthAll}
                  lists={lists}
                  periodLabel={`${MONTHS_ES[tab - 1]} ${year}`}
                  fileStem={`contabilidad-${year}-${pad2(tab)}`}
                  onFilter={showRowsOf}
                />
              ) : (
                <>
                  <datalist id="acc-treatments">{options.treatment.map((v) => <option key={v} value={v} />)}</datalist>
                  <datalist id="acc-therapists">{options.therapist.map((v) => <option key={v} value={v} />)}</datalist>
                  <datalist id="acc-hotels">{options.hotel.map((v) => <option key={v} value={v} />)}</datalist>
                  <datalist id="acc-locations">{options.location.map((v) => <option key={v} value={v} />)}</datalist>
                  <datalist id="acc-tl">{options.tl.map((v) => <option key={v} value={v} />)}</datalist>
                  <datalist id="acc-pct">{options.pct.map((v) => <option key={v} value={v} />)}</datalist>

                  <div className="overflow-auto max-h-[72vh] rounded-xl border border-border bg-card">
                    <table className="w-full border-separate border-spacing-0 font-body text-sm">
                      <thead className="sticky top-0 z-20">
                        <tr className="text-[11px] font-semibold uppercase tracking-wider text-foreground/80">
                          <th className={cn(GH, GROUPS.service, "sticky left-0 z-30")} />
                          <th className={cn(GH, GROUPS.service)} colSpan={6}>Servicio</th>
                          <th className={cn(GH, GROUPS.therapist)} colSpan={5}>Terapeuta</th>
                          <th className={cn(GH, GROUPS.holis)}>Holis</th>
                          <th className={cn(GH, GROUPS.hotel)} colSpan={3}>Hotel / Villa / Concierge</th>
                          <th className={cn(GH, GROUPS.notes)} colSpan={2}>Notas</th>
                        </tr>
                        <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                          <Th className={cn(GROUPS.service, "sticky left-0 z-30 w-10 text-center")}>#</Th>
                          <Th className={cn(GROUPS.service, "min-w-[230px]")}>Cliente</Th>
                          <Th className={cn(GROUPS.service, "min-w-[90px]")}>T/L</Th>
                          <Th className={cn(GROUPS.service, "min-w-[220px]")}>Tratamiento</Th>
                          <Th className={cn(GROUPS.service, "min-w-[130px]")}>Lugar</Th>
                          <Th className={cn(GROUPS.service, "min-w-[140px]")}>Fecha</Th>
                          <Th className={cn(GROUPS.service, "min-w-[95px] text-right")}>Costo</Th>
                          <Th className={cn(GROUPS.therapist, "min-w-[130px]")}>Terapeuta</Th>
                          <Th className={cn(GROUPS.therapist, "min-w-[70px] text-right")}>Puntos</Th>
                          <Th className={cn(GROUPS.therapist, "min-w-[75px] text-right")}>Com. %</Th>
                          <Th className={cn(GROUPS.therapist, "min-w-[95px] text-right")}>Com. $</Th>
                          <Th className={cn(GROUPS.therapist, "min-w-[64px] text-center")}>¿Pagado?</Th>
                          <Th className={cn(GROUPS.holis, "min-w-[100px] text-right text-foreground")}>HWC</Th>
                          <Th className={cn(GROUPS.hotel, "min-w-[220px]")}>Hotel / Villa</Th>
                          <Th className={cn(GROUPS.hotel, "min-w-[75px] text-right")}>Com. %</Th>
                          <Th className={cn(GROUPS.hotel, "min-w-[95px] text-right")}>Com. $</Th>
                          <Th className={cn(GROUPS.notes, "min-w-[200px]")}>Notas</Th>
                          <Th className={cn(GROUPS.notes, "w-[72px]")} />
                        </tr>
                      </thead>
                      <tbody>
                        {monthRows.map((e, i) => (
                          <EntryRow
                            key={e.id}
                            n={i + 1}
                            entry={e}
                            zebra={i % 2 === 1}
                            autoFocus={focusId === e.id}
                            onSave={saveRow}
                            onDuplicate={() => addRow(e)}
                            onDelete={() => deleteRow(e)}
                            hotelPctFor={hotelPctFor}
                            lastCost={lastCost}
                            known={known}
                            points={pointsOf(e)}
                          />
                        ))}
                        {monthRows.length === 0 && (
                          <tr>
                            <td colSpan={18} className="py-10 text-center text-muted-foreground">
                              {query.trim() ? "Nada coincide con la búsqueda." : `Todavía no hay filas en ${MONTHS_ES[tab - 1]} ${year}. Usa “Agregar fila”.`}
                            </td>
                          </tr>
                        )}
                      </tbody>
                      {monthRows.length > 0 && (
                        <tfoot className="sticky bottom-0 z-20">
                          <tr className="font-semibold bg-muted">
                            <td className={cn(TF, "sticky left-0 z-30 bg-muted")} />
                            <td className={TF} colSpan={5}>
                              Total ({monthTotals.rows} {monthTotals.rows === 1 ? "fila" : "filas"}){query.trim() ? " — de la búsqueda" : ""}
                            </td>
                            <td className={cn(TF, "text-right")}>{money(monthTotals.cost)}</td>
                            <td className={TF} />
                            <td className={cn(TF, "text-right tabular-nums")} title="Puntos de terapeutas del mes">{monthPoints}</td>
                            <td className={TF} />
                            <td className={cn(TF, "text-right")}>{money(monthTotals.therapist)}</td>
                            <td className={TF} />
                            <td className={cn(TF, "text-right bg-emerald-50", monthTotals.hwc < 0 && "text-destructive")}>{money(monthTotals.hwc)}</td>
                            <td className={TF} colSpan={2} />
                            <td className={cn(TF, "text-right")}>{money(monthTotals.hotel)}</td>
                            <td className={TF} colSpan={2} />
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                  <p className="font-body text-xs text-muted-foreground">
                    Como en el Excel: Com. hotel = Costo × %; Com. terapeuta = (Costo − Com. hotel) × %; HWC = Costo − Com. terapeuta − Com. hotel.
                    Si escribes un monto en $ (por ejemplo un salario), se usa ese — bórralo para volver al cálculo.
                    Las celdas en <span className="text-amber-700 font-medium">ámbar</span> tienen un nombre que no está en Listas.
                  </p>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Grid cells: every cell has its own lines, like a spreadsheet.
const GH = "px-2 h-7 text-center border-b border-r border-border";
const TF = "px-2 py-2 border-t-2 border-r border-border";

function Th({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <th className={cn("px-2 py-2 text-left font-semibold border-b-2 border-r border-border whitespace-nowrap", className)}>{children}</th>;
}

function TotalsCards({ totals }: { totals: ReturnType<typeof totalsOf> }) {
  const cards = [
    { label: "Costo total", value: totals.cost },
    { label: "Comisión terapeutas", value: totals.therapist },
    { label: "Comisión hoteles", value: totals.hotel },
    { label: "HWC (queda para Holis)", value: totals.hwc, strong: true },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((c) => (
        <div key={c.label} className={cn("rounded-xl border border-border bg-card p-4", c.strong && "bg-spa-sage/10 border-spa-sage/40")}>
          <p className="font-body text-xs text-muted-foreground">{c.label}</p>
          <p className={cn("font-heading text-xl font-semibold text-foreground", c.value < 0 && "text-destructive")}>{money(c.value)}</p>
        </div>
      ))}
    </div>
  );
}

/** HWC − gastos − depreciación − compras = ganancia neta, for one month. */
function MonthNet({ row, onOpen }: { row: ReturnType<typeof incomeRow>; onOpen: (v: "expenses" | "assets" | "purchases") => void }) {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const part = (label: string, value: number, v?: "expenses" | "assets" | "purchases") => (
    <span className="inline-flex items-baseline gap-1">
      {v ? <button type="button" onClick={() => onOpen(v)} className="text-muted-foreground hover:text-foreground hover:underline underline-offset-2">{label}</button> : <span className="text-muted-foreground">{label}</span>}
      <span className="font-medium tabular-nums text-foreground">{money(r2(value))}</span>
    </span>
  );
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-2.5 font-body text-sm">
      {part("HWC", row.hwc)}<span className="text-muted-foreground">−</span>
      {part("Gastos mensuales", row.expenses, "expenses")}<span className="text-muted-foreground">−</span>
      {part("Depreciación", row.depreciation, "assets")}<span className="text-muted-foreground">−</span>
      {part("Compras", row.purchases, "purchases")}<span className="text-muted-foreground">=</span>
      <span className="inline-flex items-baseline gap-1">
        <span className="font-semibold text-foreground">Ganancia neta</span>
        <span className={cn("font-heading text-base font-semibold tabular-nums", row.net < 0 ? "text-destructive" : "text-foreground")}>{money(r2(row.net))}</span>
      </span>
      {row.expensesCrc > 0 && !row.rate && <span className="text-xs text-amber-700">Falta el tipo de cambio de este mes (Gastos mensuales).</span>}
    </div>
  );
}

function YearSummary({
  year, entries, lists, items, purchases, settings, assets, saveSetting, onOpenMonth, onDeleteYear,
}: {
  year: number; entries: AccountingEntry[]; lists: AccountingListItem[];
  items: ExpenseItem[]; purchases: Purchase[]; settings: MonthSetting[]; assets: Asset[];
  saveSetting: (month: number, patch: Partial<MonthSetting>) => void;
  onOpenMonth: (m: number) => void; onDeleteYear: () => void;
}) {
  const perMonth = MONTHS_ES.map((name, i) => ({ name, month: i + 1, t: totalsOf(entries.filter((e) => e.month === i + 1)) }));
  const yearTotals = totalsOf(entries);
  const th = "px-3 py-2 font-semibold border-b-2 border-r border-border last:border-r-0 whitespace-nowrap";
  const td = "px-3 py-2 border-b border-r border-border/70 last:border-r-0";
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="font-heading text-lg font-medium text-foreground">Ganancia neta {year}</h3>
        <AccountingIncome
          year={year} entries={entries} items={items} purchases={purchases} settings={settings} assets={assets}
          saveSetting={saveSetting} onOpenMonth={onOpenMonth}
        />
      </div>
      <h3 className="font-heading text-lg font-medium text-foreground">Detalle del HWC {year}</h3>
      <TotalsCards totals={yearTotals} />
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full border-separate border-spacing-0 font-body text-sm">
          <thead>
            <tr className="bg-muted/60 text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className={cn(th, "text-left")}>Mes</th>
              <th className={cn(th, "text-right")}>Filas</th>
              <th className={cn(th, "text-right")}>Costo</th>
              <th className={cn(th, "text-right")}>Com. terapeutas</th>
              <th className={cn(th, "text-right")}>Com. hoteles</th>
              <th className={cn(th, "text-right bg-spa-sage/20 text-foreground")}>HWC</th>
            </tr>
          </thead>
          <tbody>
            {perMonth.map(({ name, month, t }, i) => (
              <tr key={month} className={cn("hover:bg-muted/40 cursor-pointer", i % 2 && "bg-muted/20")} onClick={() => onOpenMonth(month)}>
                <td className={cn(td, "font-medium text-foreground underline-offset-2 hover:underline")}>{name}</td>
                <td className={cn(td, "text-right tabular-nums text-muted-foreground")}>{t.rows || "—"}</td>
                <td className={cn(td, "text-right tabular-nums")}>{t.rows ? money(t.cost) : "—"}</td>
                <td className={cn(td, "text-right tabular-nums")}>{t.rows ? money(t.therapist) : "—"}</td>
                <td className={cn(td, "text-right tabular-nums")}>{t.rows ? money(t.hotel) : "—"}</td>
                <td className={cn(td, "text-right tabular-nums bg-spa-sage/10 font-medium", t.hwc < 0 && "text-destructive")}>{t.rows ? money(t.hwc) : "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted/50 font-semibold">
              <td className={td}>Total {year}</td>
              <td className={cn(td, "text-right tabular-nums")}>{yearTotals.rows}</td>
              <td className={cn(td, "text-right tabular-nums")}>{money(yearTotals.cost)}</td>
              <td className={cn(td, "text-right tabular-nums")}>{money(yearTotals.therapist)}</td>
              <td className={cn(td, "text-right tabular-nums")}>{money(yearTotals.hotel)}</td>
              <td className={cn(td, "text-right tabular-nums bg-spa-sage/20", yearTotals.hwc < 0 && "text-destructive")}>{money(yearTotals.hwc)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="space-y-3">
        <h3 className="font-heading text-lg font-medium text-foreground">Reportes de {year}</h3>
        <AccountingReports entries={entries} lists={lists} periodLabel={`Todo ${year}`} fileStem={`contabilidad-${year}`} />
      </div>

      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={onDeleteYear}>
          <Trash2 className="h-4 w-4 mr-1" /> Eliminar el año {year}
        </Button>
      </div>
    </div>
  );
}

// ── One editable row ─────────────────────────────────────────────────────────

type Draft = Record<TextField | "entry_date" | "cost" | "therapist_pct" | "therapist_amount" | "hotel_pct" | "hotel_amount" | "points", string>;

const toDraft = (e: AccountingEntry): Draft => ({
  client: e.client ?? "", tl: e.tl ?? "", treatment: e.treatment ?? "", location: e.location ?? "",
  therapist: e.therapist ?? "", hotel: e.hotel ?? "", notes: e.notes ?? "",
  entry_date: e.entry_date ?? "",
  cost: Number(e.cost) ? String(Number(e.cost)) : "",
  therapist_pct: Number(e.therapist_pct) ? String(Number(e.therapist_pct)) : "",
  hotel_pct: Number(e.hotel_pct) ? String(Number(e.hotel_pct)) : "",
  therapist_amount: e.therapist_amount == null ? "" : String(Number(e.therapist_amount)),
  hotel_amount: e.hotel_amount == null ? "" : String(Number(e.hotel_amount)),
  points: e.points == null ? "" : String(Number(e.points)),
});

const clampPct = (n: number | null) => Math.min(100, Math.max(0, n ?? 0));

type Known = Record<"treatment" | "therapist" | "hotel" | "location", (name: string | null | undefined) => AccountingListItem | undefined>;

function EntryRow({
  n, entry, zebra, autoFocus, onSave, onDuplicate, onDelete, hotelPctFor, lastCost, known, points,
}: {
  n: number;
  entry: AccountingEntry;
  zebra: boolean;
  autoFocus: boolean;
  onSave: (id: string, patch: Partial<AccountingEntry>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  hotelPctFor: (hotel: string) => number | null;
  lastCost: (treatment: string) => number | null;
  known: Known;
  /** The row's points: its own or its treatment's (shown in grey when from the list). */
  points: number | null;
}) {
  const [d, setD] = useState<Draft>(() => toDraft(entry));
  // Numbers read like the Excel ($83, 45%) and become plain while typed.
  const [focus, setFocus] = useState<keyof Draft | null>(null);
  const shown = (k: "cost" | "therapist_pct" | "hotel_pct" | "therapist_amount" | "hotel_amount" | "points") => {
    if (focus === k || d[k] === "") return d[k];
    const v = parseNumber(d[k]);
    if (v == null) return d[k];
    return k.endsWith("_pct") ? `${v}%` : k === "points" ? String(v) : money(v);
  };
  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (autoFocus) firstRef.current?.focus(); }, [autoFocus]);
  // Cells typed in and not saved yet. Only those are saved when left, so
  // stepping through a cell never writes back an old value (e.g. over a hotel %
  // that was just filled in for you).
  const dirty = useRef(new Set<keyof Draft>());
  // Another change to this row (a save, a rolled-back save) → show it, but
  // keep whatever is being typed.
  useEffect(() => {
    setD((prev) => {
      const next = toDraft(entry);
      for (const k of dirty.current) next[k] = prev[k];
      return next;
    });
  }, [entry]);

  const set = (k: keyof Draft) => (ev: React.ChangeEvent<HTMLInputElement>) => {
    dirty.current.add(k);
    setD((p) => ({ ...p, [k]: ev.target.value }));
  };
  /** True (and forgets it) when the cell was typed in. */
  const takeDirty = (k: keyof Draft) => dirty.current.delete(k);

  const commitText = (k: TextField) => () => {
    if (!takeDirty(k)) return;
    let v = d[k].replace(/\s+/g, " ").trim() || null;
    // Picked from a list → the list's spelling.
    if (v && (k === "treatment" || k === "therapist" || k === "hotel" || k === "location")) v = known[k](v)?.label ?? v;
    if (v === (entry[k] ?? null)) { setD(toDraft(entry)); return; }
    const patch: Partial<AccountingEntry> = { [k]: v };
    // A new hotel with no % yet → its usual %.
    if (k === "hotel" && v && !Number(entry.hotel_pct)) {
      const pct = hotelPctFor(v);
      if (pct) patch.hotel_pct = pct;
    }
    // A new treatment with no price yet → its last price.
    if (k === "treatment" && v && !Number(entry.cost)) {
      const c = lastCost(v);
      if (c) patch.cost = c;
    }
    onSave(entry.id, patch);
  };

  const commitDate = () => {
    if (!takeDirty("entry_date")) return;
    const v = d.entry_date || null;
    if (v !== (entry.entry_date ?? null)) onSave(entry.id, { entry_date: v });
  };

  const commitNumber = (k: "cost" | "therapist_pct" | "hotel_pct" | "therapist_amount" | "hotel_amount" | "points") => () => {
    setFocus(null);
    if (!takeDirty(k)) return;
    const v0 = parseNumber(d[k]);
    if (k === "therapist_amount" || k === "hotel_amount" || k === "points") {
      if (v0 !== (entry[k] == null ? null : Number(entry[k]))) onSave(entry.id, { [k]: v0 });
      else setD(toDraft(entry));
      return;
    }
    const v = k === "cost" ? (v0 ?? 0) : clampPct(v0);
    if (v !== Number(entry[k])) onSave(entry.id, { [k]: v });
    else setD(toDraft(entry));
  };

  const enterBlurs = (ev: React.KeyboardEvent<HTMLInputElement>) => {
    if (ev.key === "Enter") (ev.currentTarget as HTMLInputElement).blur();
    if (ev.key === "Escape") { dirty.current.clear(); setD(toDraft(entry)); (ev.currentTarget as HTMLInputElement).blur(); }
  };

  // A name typed that is not on its list (typo, or a new one to add in Listas).
  const offList = (k: "treatment" | "therapist" | "hotel" | "location") => {
    const v = (entry[k] ?? "").trim();
    if (!v || (k === "hotel" && normName(v) === "n/a")) return false;
    return !known[k](v);
  };

  const td = "px-0.5 py-0.5 border-b border-r border-border/70";
  const cell = "h-8 w-full rounded-sm bg-transparent px-2 text-sm text-foreground border border-transparent hover:border-border focus:border-ring focus:bg-background focus:outline-none";
  const numCell = cn(cell, "text-right tabular-nums");
  const warn = "bg-amber-500/15";
  const txt = (k: TextField, list?: string, ref?: React.Ref<HTMLInputElement>) => (
    <input ref={ref} className={cell} value={d[k]} onChange={set(k)} onBlur={commitText(k)} onKeyDown={enterBlurs} list={list} aria-label={k} />
  );
  const offTitle = "No está en Listas — elige uno de la lista o agrégalo en Listas";

  const therapistAuto = therapistCommission(entry);
  const hotelAuto = hotelCommission(entry);
  const hwc = hwcAmount(entry);
  const rowBg = zebra ? "bg-muted/20" : "bg-card";

  return (
    <tr className={cn("group hover:[&>td:not(:first-child)]:bg-muted/40", rowBg)}>
      <td className={cn(td, "sticky left-0 z-10 w-10 text-center text-[11px] tabular-nums text-muted-foreground", zebra ? "bg-muted" : "bg-card")}>{n}</td>
      <td className={td}>{txt("client", undefined, firstRef)}</td>
      <td className={td}>{txt("tl", "acc-tl")}</td>
      <td className={cn(td, offList("treatment") && warn)} title={offList("treatment") ? offTitle : undefined}>{txt("treatment", "acc-treatments")}</td>
      <td className={cn(td, offList("location") && warn)} title={offList("location") ? offTitle : undefined}>{txt("location", "acc-locations")}</td>
      <td className={td}>
        <input type="date" className={cell} value={d.entry_date} onChange={set("entry_date")} onBlur={commitDate} onKeyDown={enterBlurs} aria-label="Fecha" />
      </td>
      <td className={td}>
        <input className={numCell} inputMode="decimal" placeholder="$0" value={shown("cost")} onFocus={() => setFocus("cost")} onChange={set("cost")} onBlur={commitNumber("cost")} onKeyDown={enterBlurs} aria-label="Costo" />
      </td>
      <td className={cn(td, offList("therapist") && warn)} title={offList("therapist") ? offTitle : undefined}>{txt("therapist", "acc-therapists")}</td>
      <td className={td}>
        <input
          className={cn(numCell, entry.points != null ? "font-semibold" : "placeholder:text-foreground/70")}
          inputMode="decimal"
          placeholder={points == null ? "—" : String(points)}
          title={entry.points != null ? "Puntos escritos a mano (bórralos para usar los del tratamiento)" : "Puntos del tratamiento (Listas → Tratamientos)"}
          value={shown("points")} onFocus={() => setFocus("points")}
          onChange={set("points")}
          onBlur={commitNumber("points")}
          onKeyDown={enterBlurs}
          aria-label="Puntos"
        />
      </td>
      <td className={td}>
        <input className={numCell} inputMode="decimal" list="acc-pct" placeholder="0%" value={shown("therapist_pct")} onFocus={() => setFocus("therapist_pct")} onChange={set("therapist_pct")} onBlur={commitNumber("therapist_pct")} onKeyDown={enterBlurs} aria-label="Comisión terapeuta %" />
      </td>
      <td className={td}>
        <input
          className={cn(numCell, entry.therapist_amount != null ? "font-semibold" : "placeholder:text-foreground/70")}
          inputMode="decimal"
          placeholder={money(therapistAuto)}
          title={entry.therapist_amount != null ? "Monto escrito a mano (bórralo para volver al cálculo)" : "Calculado del %"}
          value={shown("therapist_amount")} onFocus={() => setFocus("therapist_amount")}
          onChange={set("therapist_amount")}
          onBlur={commitNumber("therapist_amount")}
          onKeyDown={enterBlurs}
          aria-label="Comisión terapeuta $"
        />
      </td>
      <td className={cn(td, "text-center")}>
        <input
          type="checkbox"
          className="h-4 w-4 accent-primary"
          checked={entry.therapist_paid}
          onChange={(ev) => onSave(entry.id, { therapist_paid: ev.target.checked })}
          aria-label="Pagado al terapeuta"
        />
      </td>
      <td className={cn(td, "px-2 text-right tabular-nums font-medium bg-spa-sage/10", hwc < 0 && "text-destructive")}>{money(hwc)}</td>
      <td className={cn(td, offList("hotel") && warn)} title={offList("hotel") ? offTitle : undefined}>{txt("hotel", "acc-hotels")}</td>
      <td className={td}>
        <input className={numCell} inputMode="decimal" list="acc-pct" placeholder="0%" value={shown("hotel_pct")} onFocus={() => setFocus("hotel_pct")} onChange={set("hotel_pct")} onBlur={commitNumber("hotel_pct")} onKeyDown={enterBlurs} aria-label="Comisión hotel %" />
      </td>
      <td className={td}>
        <input
          className={cn(numCell, entry.hotel_amount != null ? "font-semibold" : "placeholder:text-foreground/70")}
          inputMode="decimal"
          placeholder={money(hotelAuto)}
          title={entry.hotel_amount != null ? "Monto escrito a mano (bórralo para volver al cálculo)" : "Calculado del %"}
          value={shown("hotel_amount")} onFocus={() => setFocus("hotel_amount")}
          onChange={set("hotel_amount")}
          onBlur={commitNumber("hotel_amount")}
          onKeyDown={enterBlurs}
          aria-label="Comisión hotel $"
        />
      </td>
      <td className={td}>{txt("notes")}</td>
      <td className={cn(td, "whitespace-nowrap text-center")}>
        <button type="button" onClick={onDuplicate} title="Duplicar fila" className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted">
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={onDelete} title="Eliminar fila" className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-muted">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}
