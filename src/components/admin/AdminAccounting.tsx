import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Download, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  type AccountingEntry, MONTHS_ES, entriesToCsv, hotelCommission, hwcAmount, money, parseNumber,
  therapistCommission, totalsOf,
} from "@/lib/accounting";

// Admin → Contabilidad. The monthly accounting sheets (they used to live in
// Excel on OneDrive): a year → its twelve months → each month's rows, with the
// same columns and the same sums as the Excel. Full admins only (the tables'
// RLS refuses anyone else).

const sb = supabase as any;
const SUMMARY = 0; // the "Resumen del año" tab; months are 1–12

const TEXT_FIELDS = ["client", "tl", "treatment", "location", "therapist", "hotel", "notes"] as const;
type TextField = (typeof TEXT_FIELDS)[number];

const ENTRY_COLUMNS =
  "id, year, month, client, tl, treatment, location, entry_date, cost, therapist, therapist_pct, therapist_amount, therapist_paid, hotel, hotel_pct, hotel_amount, notes, created_at";

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
      .range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as AccountingEntry[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const isNewer = (a: AccountingEntry, b: AccountingEntry) => (a.created_at ?? "") > (b.created_at ?? "");

export function AdminAccounting() {
  const [years, setYears] = useState<number[]>([]);
  const [year, setYear] = useState<number | null>(null);
  const [tab, setTab] = useState<number>(SUMMARY);
  const [entries, setEntries] = useState<AccountingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [focusId, setFocusId] = useState<string | null>(null);

  // Years, and the treatment names of the website (for the Treatment suggestions).
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
    supabase.from("services").select("title").order("title").then(({ data }) => {
      setServices(Array.from(new Set(((data ?? []) as { title: string }[]).map((s) => s.title).filter(Boolean))));
    });
  }, [loadYears]);

  useEffect(() => {
    if (year == null) return;
    let alive = true;
    setLoading(true);
    fetchYear(year)
      .then((rows) => { if (alive) setEntries(rows); })
      .catch((e) => toast.error(e.message ?? String(e)))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [year]);

  // Suggestions for the typed columns: what the team has used before (+ the
  // website's treatments), so the same name is spelled the same way.
  const suggestions = useMemo(() => {
    const collect = (f: TextField, extra: string[] = []) =>
      Array.from(new Set([...extra, ...entries.map((e) => (e[f] ?? "").trim()).filter(Boolean)])).sort((a, b) => a.localeCompare(b));
    return {
      treatment: collect("treatment", ["Salary", "Therapist Treatments Commission", ...services]),
      therapist: collect("therapist"),
      hotel: collect("hotel", ["N/A", "Recepcion"]),
      location: collect("location", ["HWC"]),
      tl: collect("tl"),
    };
  }, [entries, services]);

  // The last % used with each hotel, and the last price of each treatment —
  // filled in when a row gets that hotel / treatment and has none yet.
  const lastHotelPct = useCallback((hotel: string) => {
    let best: AccountingEntry | null = null;
    for (const e of entries) {
      if ((e.hotel ?? "").trim().toLowerCase() === hotel.toLowerCase() && Number(e.hotel_pct) > 0 && (!best || isNewer(e, best))) best = e;
    }
    return best ? Number(best.hotel_pct) : null;
  }, [entries]);
  const lastCost = useCallback((treatment: string) => {
    let best: AccountingEntry | null = null;
    for (const e of entries) {
      if ((e.treatment ?? "").trim().toLowerCase() === treatment.toLowerCase() && Number(e.cost) > 0 && (!best || isNewer(e, best))) best = e;
    }
    return best ? Number(best.cost) : null;
  }, [entries]);

  const saveRow = useCallback(async (id: string, patch: Partial<AccountingEntry>) => {
    const before = entries.find((e) => e.id === id);
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    const { error } = await sb.from("accounting_entries").update(patch).eq("id", id);
    if (error) {
      toast.error(`No se guardó: ${error.message}`);
      if (before) setEntries((prev) => prev.map((e) => (e.id === id ? before : e)));
    }
  }, [entries]);

  const addRow = async (copyOf?: AccountingEntry) => {
    if (year == null || tab === SUMMARY) return;
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

  const monthRows = useMemo(() => {
    if (tab === SUMMARY) return [];
    const rows = entries.filter((e) => e.month === tab);
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((e) =>
      [e.client, e.tl, e.treatment, e.location, e.therapist, e.hotel, e.notes, e.entry_date]
        .some((v) => (v ?? "").toLowerCase().includes(q)),
    );
  }, [entries, tab, query]);
  const monthTotals = useMemo(() => totalsOf(monthRows), [monthRows]);

  const exportCsv = () => {
    if (year == null || tab === SUMMARY) return;
    const url = URL.createObjectURL(new Blob([entriesToCsv(monthRows)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `contabilidad-${year}-${pad2(tab)}-${MONTHS_ES[tab - 1].toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-heading font-bold text-foreground">Contabilidad</h2>
          <p className="font-body text-sm text-muted-foreground">
            Cada año tiene sus 12 meses. Escribe en las celdas y se guarda solo al salir de la celda.
          </p>
        </div>
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

      {year == null ? (
        <p className="font-body text-sm text-muted-foreground">Todavía no hay ningún año. Agrega uno con “+ Año”.</p>
      ) : (
        <>
          {/* Months — like the tabs at the bottom of the Excel */}
          <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
            {[SUMMARY, ...MONTHS_ES.map((_, i) => i + 1)].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setTab(m); setQuery(""); }}
                className={cn(
                  "shrink-0 rounded-lg px-3 py-1.5 text-sm font-body font-medium transition-colors",
                  m === tab ? "bg-spa-sage/20 text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {m === SUMMARY ? `Resumen ${year}` : MONTHS_ES[m - 1]}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center gap-2 py-10 justify-center text-muted-foreground font-body text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
            </div>
          ) : tab === SUMMARY ? (
            <YearSummary year={year} entries={entries} onOpenMonth={setTab} onDeleteYear={deleteYear} />
          ) : (
            <div className="space-y-4">
              <TotalsCards totals={monthTotals} />

              <div className="flex flex-wrap items-center gap-2">
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
              </div>

              <datalist id="acc-treatments">{suggestions.treatment.map((v) => <option key={v} value={v} />)}</datalist>
              <datalist id="acc-therapists">{suggestions.therapist.map((v) => <option key={v} value={v} />)}</datalist>
              <datalist id="acc-hotels">{suggestions.hotel.map((v) => <option key={v} value={v} />)}</datalist>
              <datalist id="acc-locations">{suggestions.location.map((v) => <option key={v} value={v} />)}</datalist>
              <datalist id="acc-tl">{suggestions.tl.map((v) => <option key={v} value={v} />)}</datalist>

              <div className="overflow-x-auto rounded-xl border border-border bg-card">
                <table className="w-full border-collapse font-body text-sm">
                  <thead>
                    <tr className="bg-muted/60 text-[11px] uppercase tracking-wider text-muted-foreground">
                      <Th className="min-w-[230px]">Cliente</Th>
                      <Th className="min-w-[70px]">T/L</Th>
                      <Th className="min-w-[210px]">Tratamiento</Th>
                      <Th className="min-w-[120px]">Lugar</Th>
                      <Th className="min-w-[140px]">Fecha</Th>
                      <Th className="min-w-[90px] text-right">Costo</Th>
                      <Th className="min-w-[120px]">Terapeuta</Th>
                      <Th className="min-w-[70px] text-right">Com. %</Th>
                      <Th className="min-w-[95px] text-right">Com. $</Th>
                      <Th className="min-w-[60px] text-center">¿Pagado?</Th>
                      <Th className="min-w-[95px] text-right bg-spa-sage/15 text-foreground">HWC</Th>
                      <Th className="min-w-[210px]">Hotel / Villa</Th>
                      <Th className="min-w-[70px] text-right">Com. %</Th>
                      <Th className="min-w-[90px] text-right">Com. $</Th>
                      <Th className="min-w-[170px]">Notas</Th>
                      <Th className="w-[72px]" />
                    </tr>
                  </thead>
                  <tbody>
                    {monthRows.map((e) => (
                      <EntryRow
                        key={e.id}
                        entry={e}
                        autoFocus={focusId === e.id}
                        onSave={saveRow}
                        onDuplicate={() => addRow(e)}
                        onDelete={() => deleteRow(e)}
                        lastHotelPct={lastHotelPct}
                        lastCost={lastCost}
                      />
                    ))}
                    {monthRows.length === 0 && (
                      <tr>
                        <td colSpan={16} className="py-10 text-center text-muted-foreground">
                          {query.trim() ? "Nada coincide con la búsqueda." : `Todavía no hay filas en ${MONTHS_ES[tab - 1]} ${year}. Usa “Agregar fila”.`}
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {monthRows.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                        <td className="px-2 py-2" colSpan={5}>Total ({monthTotals.rows} {monthTotals.rows === 1 ? "fila" : "filas"})</td>
                        <td className="px-2 py-2 text-right">{money(monthTotals.cost)}</td>
                        <td colSpan={2} />
                        <td className="px-2 py-2 text-right">{money(monthTotals.therapist)}</td>
                        <td />
                        <td className={cn("px-2 py-2 text-right bg-spa-sage/15", monthTotals.hwc < 0 && "text-destructive")}>{money(monthTotals.hwc)}</td>
                        <td colSpan={2} />
                        <td className="px-2 py-2 text-right">{money(monthTotals.hotel)}</td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              <p className="font-body text-xs text-muted-foreground">
                HWC = Costo − comisión del hotel − comisión del terapeuta. La comisión del terapeuta se calcula sobre el costo menos la del hotel.
                Las comisiones en $ se calculan solas; si escribes un monto (por ejemplo un salario), se usa ese — bórralo para volver al cálculo.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Th({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <th className={cn("px-2 py-2 text-left font-semibold border-b border-border whitespace-nowrap", className)}>{children}</th>;
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

function YearSummary({
  year, entries, onOpenMonth, onDeleteYear,
}: { year: number; entries: AccountingEntry[]; onOpenMonth: (m: number) => void; onDeleteYear: () => void }) {
  const perMonth = MONTHS_ES.map((name, i) => ({ name, month: i + 1, t: totalsOf(entries.filter((e) => e.month === i + 1)) }));
  const yearTotals = totalsOf(entries);
  return (
    <div className="space-y-4">
      <TotalsCards totals={yearTotals} />
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full border-collapse font-body text-sm">
          <thead>
            <tr className="bg-muted/60 text-[11px] uppercase tracking-wider text-muted-foreground">
              <Th>Mes</Th>
              <Th className="text-right">Filas</Th>
              <Th className="text-right">Costo</Th>
              <Th className="text-right">Com. terapeutas</Th>
              <Th className="text-right">Com. hoteles</Th>
              <Th className="text-right bg-spa-sage/15 text-foreground">HWC</Th>
            </tr>
          </thead>
          <tbody>
            {perMonth.map(({ name, month, t }) => (
              <tr key={month} className="border-b border-border/60 hover:bg-muted/30 cursor-pointer" onClick={() => onOpenMonth(month)}>
                <td className="px-2 py-2 font-medium text-foreground underline-offset-2 hover:underline">{name}</td>
                <td className="px-2 py-2 text-right text-muted-foreground">{t.rows || "—"}</td>
                <td className="px-2 py-2 text-right">{t.rows ? money(t.cost) : "—"}</td>
                <td className="px-2 py-2 text-right">{t.rows ? money(t.therapist) : "—"}</td>
                <td className="px-2 py-2 text-right">{t.rows ? money(t.hotel) : "—"}</td>
                <td className={cn("px-2 py-2 text-right bg-spa-sage/10 font-medium", t.hwc < 0 && "text-destructive")}>{t.rows ? money(t.hwc) : "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-muted/40 font-semibold">
              <td className="px-2 py-2">Total {year}</td>
              <td className="px-2 py-2 text-right">{yearTotals.rows}</td>
              <td className="px-2 py-2 text-right">{money(yearTotals.cost)}</td>
              <td className="px-2 py-2 text-right">{money(yearTotals.therapist)}</td>
              <td className="px-2 py-2 text-right">{money(yearTotals.hotel)}</td>
              <td className={cn("px-2 py-2 text-right bg-spa-sage/15", yearTotals.hwc < 0 && "text-destructive")}>{money(yearTotals.hwc)}</td>
            </tr>
          </tfoot>
        </table>
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

type Draft = Record<TextField | "entry_date" | "cost" | "therapist_pct" | "therapist_amount" | "hotel_pct" | "hotel_amount", string>;

const toDraft = (e: AccountingEntry): Draft => ({
  client: e.client ?? "", tl: e.tl ?? "", treatment: e.treatment ?? "", location: e.location ?? "",
  therapist: e.therapist ?? "", hotel: e.hotel ?? "", notes: e.notes ?? "",
  entry_date: e.entry_date ?? "",
  cost: Number(e.cost) ? String(Number(e.cost)) : "",
  therapist_pct: Number(e.therapist_pct) ? String(Number(e.therapist_pct)) : "",
  hotel_pct: Number(e.hotel_pct) ? String(Number(e.hotel_pct)) : "",
  therapist_amount: e.therapist_amount == null ? "" : String(Number(e.therapist_amount)),
  hotel_amount: e.hotel_amount == null ? "" : String(Number(e.hotel_amount)),
});

const clampPct = (n: number | null) => Math.min(100, Math.max(0, n ?? 0));

function EntryRow({
  entry, autoFocus, onSave, onDuplicate, onDelete, lastHotelPct, lastCost,
}: {
  entry: AccountingEntry;
  autoFocus: boolean;
  onSave: (id: string, patch: Partial<AccountingEntry>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  lastHotelPct: (hotel: string) => number | null;
  lastCost: (treatment: string) => number | null;
}) {
  const [d, setD] = useState<Draft>(() => toDraft(entry));
  // Numbers read like the Excel ($83, 45%) and become plain while typed.
  const [focus, setFocus] = useState<keyof Draft | null>(null);
  const shown = (k: "cost" | "therapist_pct" | "hotel_pct" | "therapist_amount" | "hotel_amount") => {
    if (focus === k || d[k] === "") return d[k];
    const n = parseNumber(d[k]);
    if (n == null) return d[k];
    return k.endsWith("_pct") ? `${n}%` : money(n);
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
    const v = d[k].trim() || null;
    if (v === (entry[k] ?? null)) return;
    const patch: Partial<AccountingEntry> = { [k]: v };
    // A new hotel with no % yet → the % last used with it.
    if (k === "hotel" && v && !Number(entry.hotel_pct)) {
      const pct = lastHotelPct(v);
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

  const commitNumber = (k: "cost" | "therapist_pct" | "hotel_pct" | "therapist_amount" | "hotel_amount") => () => {
    setFocus(null);
    if (!takeDirty(k)) return;
    const n = parseNumber(d[k]);
    if (k === "therapist_amount" || k === "hotel_amount") {
      const v = n == null ? null : n;
      if (v !== (entry[k] == null ? null : Number(entry[k]))) onSave(entry.id, { [k]: v });
      else setD(toDraft(entry));
      return;
    }
    const v = k === "cost" ? (n ?? 0) : clampPct(n);
    if (v !== Number(entry[k])) onSave(entry.id, { [k]: v });
    else setD(toDraft(entry));
  };

  const enterBlurs = (ev: React.KeyboardEvent<HTMLInputElement>) => {
    if (ev.key === "Enter") (ev.currentTarget as HTMLInputElement).blur();
    if (ev.key === "Escape") { dirty.current.clear(); setD(toDraft(entry)); (ev.currentTarget as HTMLInputElement).blur(); }
  };

  const cell = "h-8 w-full rounded-md bg-transparent px-2 text-sm text-foreground border border-transparent hover:border-border focus:border-ring focus:bg-background focus:outline-none";
  const num = cn(cell, "text-right tabular-nums");
  const txt = (k: TextField, list?: string, ref?: React.Ref<HTMLInputElement>) => (
    <input ref={ref} className={cell} value={d[k]} onChange={set(k)} onBlur={commitText(k)} onKeyDown={enterBlurs} list={list} aria-label={k} />
  );

  const therapistAuto = therapistCommission(entry);
  const hotelAuto = hotelCommission(entry);
  const hwc = hwcAmount(entry);

  return (
    <tr className="border-b border-border/60 hover:bg-muted/20 group">
      <td className="px-1 py-0.5">{txt("client", undefined, firstRef)}</td>
      <td className="px-1 py-0.5">{txt("tl", "acc-tl")}</td>
      <td className="px-1 py-0.5">{txt("treatment", "acc-treatments")}</td>
      <td className="px-1 py-0.5">{txt("location", "acc-locations")}</td>
      <td className="px-1 py-0.5">
        <input type="date" className={cell} value={d.entry_date} onChange={set("entry_date")} onBlur={commitDate} onKeyDown={enterBlurs} aria-label="Fecha" />
      </td>
      <td className="px-1 py-0.5">
        <input className={num} inputMode="decimal" placeholder="$0" value={shown("cost")} onFocus={() => setFocus("cost")} onChange={set("cost")} onBlur={commitNumber("cost")} onKeyDown={enterBlurs} aria-label="Costo" />
      </td>
      <td className="px-1 py-0.5">{txt("therapist", "acc-therapists")}</td>
      <td className="px-1 py-0.5">
        <input className={num} inputMode="decimal" placeholder="0%" value={shown("therapist_pct")} onFocus={() => setFocus("therapist_pct")} onChange={set("therapist_pct")} onBlur={commitNumber("therapist_pct")} onKeyDown={enterBlurs} aria-label="Comisión terapeuta %" />
      </td>
      <td className="px-1 py-0.5">
        <input
          className={cn(num, entry.therapist_amount != null ? "font-semibold" : "placeholder:text-foreground/70")}
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
      <td className="px-1 py-0.5 text-center">
        <input
          type="checkbox"
          className="h-4 w-4 accent-primary"
          checked={entry.therapist_paid}
          onChange={(ev) => onSave(entry.id, { therapist_paid: ev.target.checked })}
          aria-label="Pagado al terapeuta"
        />
      </td>
      <td className={cn("px-2 py-0.5 text-right tabular-nums font-medium bg-spa-sage/10", hwc < 0 && "text-destructive")}>{money(hwc)}</td>
      <td className="px-1 py-0.5">{txt("hotel", "acc-hotels")}</td>
      <td className="px-1 py-0.5">
        <input className={num} inputMode="decimal" placeholder="0%" value={shown("hotel_pct")} onFocus={() => setFocus("hotel_pct")} onChange={set("hotel_pct")} onBlur={commitNumber("hotel_pct")} onKeyDown={enterBlurs} aria-label="Comisión hotel %" />
      </td>
      <td className="px-1 py-0.5">
        <input
          className={cn(num, entry.hotel_amount != null ? "font-semibold" : "placeholder:text-foreground/70")}
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
      <td className="px-1 py-0.5">{txt("notes")}</td>
      <td className="px-1 py-0.5 whitespace-nowrap">
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
