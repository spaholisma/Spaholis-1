import { Fragment, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Copy, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { type ExpenseItem, type MonthSetting, MONTHS_ES, colones, expensesCrc, money } from "@/lib/accounting";
import { NumberCell, TD, TH, TextCell } from "./Cells";

// Contabilidad → Gastos mensuales: the Excel's "Monthly Expenses" sheet. One
// line per concept, the 12 months in colones; each month's total ÷ that
// month's exchange rate = the dollars that go into the net profit.

const sb = supabase as any;
const SHORT = MONTHS_ES.map((m) => m.slice(0, 3));
const DEFAULT_SECTIONS = ["Gastos Fijos", "Gastos Variables"];

export function AccountingExpenses({
  year, items, setItems, settings, saveSetting,
}: {
  year: number;
  items: ExpenseItem[];
  setItems: React.Dispatch<React.SetStateAction<ExpenseItem[]>>;
  settings: MonthSetting[];
  saveSetting: (month: number, patch: Partial<MonthSetting>) => void;
}) {
  const [busy, setBusy] = useState(false);
  const sorted = useMemo(() => [...items].sort((a, b) => a.sort_order - b.sort_order), [items]);
  const sections = useMemo(() => {
    const names: string[] = [];
    for (const it of sorted) { const s = it.section || "Otros gastos"; if (!names.includes(s)) names.push(s); }
    for (const s of DEFAULT_SECTIONS) if (!names.includes(s)) names.push(s);
    return names;
  }, [sorted]);
  const rateOf = (m: number) => {
    const r = settings.find((s) => s.month === m)?.exchange_rate;
    return r != null ? Number(r) : null;
  };

  const save = async (id: string, patch: Partial<ExpenseItem>) => {
    let before: ExpenseItem | undefined;
    setItems((prev) => prev.map((it) => { if (it.id === id) { before = it; return { ...it, ...patch }; } return it; }));
    const { error } = await sb.from("accounting_expense_items").update(patch).eq("id", id);
    if (error) {
      toast.error(`No se guardó: ${error.message}`);
      if (before) { const b = before; setItems((prev) => prev.map((it) => (it.id === id ? b : it))); }
    }
  };
  const setAmount = (it: ExpenseItem, month: number, v: number | null) => {
    const amounts = [...(it.amounts ?? Array(12).fill(null))];
    amounts[month - 1] = v;
    save(it.id, { amounts });
  };

  const add = async (section: string) => {
    const label = prompt(`Nuevo gasto en “${section}”:`);
    if (!label?.trim()) return;
    const inSection = sorted.filter((it) => (it.section || "Otros gastos") === section);
    const after = inSection.length ? inSection[inSection.length - 1].sort_order : Math.max(0, ...sorted.map((i) => i.sort_order));
    // Make room right after the section's last line.
    const { data, error } = await sb.from("accounting_expense_items")
      .insert({ year, section, label: label.trim(), sort_order: after + 1, amounts: Array(12).fill(null) })
      .select("*").single();
    if (error) { toast.error(error.message); return; }
    const later = sorted.filter((it) => it.sort_order > after);
    if (later.length) {
      await Promise.all(later.map((it) => sb.from("accounting_expense_items").update({ sort_order: it.sort_order + 1 }).eq("id", it.id)));
      setItems((prev) => [...prev.map((it) => (it.sort_order > after ? { ...it, sort_order: it.sort_order + 1 } : it)), data as ExpenseItem]);
    } else {
      setItems((prev) => [...prev, data as ExpenseItem]);
    }
  };

  const remove = async (it: ExpenseItem) => {
    if (!confirm(`¿Eliminar “${it.label}” de los gastos de ${year}?`)) return;
    const { error } = await sb.from("accounting_expense_items").delete().eq("id", it.id);
    if (error) { toast.error(error.message); return; }
    setItems((prev) => prev.filter((x) => x.id !== it.id));
  };

  // The same concepts as the year before (amounts empty), like starting a new Excel.
  const copyFromPrevious = async () => {
    setBusy(true);
    const { data, error } = await sb.from("accounting_expense_items").select("section, label, provider, sort_order, amounts").eq("year", year - 1).order("sort_order");
    if (error || !data?.length) { toast.error(error?.message ?? `No hay gastos en ${year - 1}`); setBusy(false); return; }
    const withAmounts = confirm(`¿Copiar también los montos de diciembre ${year - 1} a cada mes de ${year}?\n\nAceptar = sí, con montos · Cancelar = solo los conceptos`);
    const rows = (data as any[]).map((r) => ({
      year, section: r.section, label: r.label, provider: r.provider, sort_order: r.sort_order,
      amounts: withAmounts ? Array(12).fill(r.amounts?.[11] ?? null) : Array(12).fill(null),
    }));
    const { data: ins, error: e2 } = await sb.from("accounting_expense_items").insert(rows).select("*");
    setBusy(false);
    if (e2) { toast.error(e2.message); return; }
    setItems(ins as ExpenseItem[]);
    toast.success(`${rows.length} gastos copiados de ${year - 1}`);
  };

  // Fill a month with the month before (only the empty cells).
  const copyMonth = async (month: number) => {
    if (month < 2) return;
    const targets = sorted.filter((it) => it.amounts?.[month - 1] == null && it.amounts?.[month - 2] != null);
    if (!targets.length) { toast(`Nada que copiar: ${MONTHS_ES[month - 1]} ya tiene montos donde ${MONTHS_ES[month - 2]} los tiene.`); return; }
    if (!confirm(`¿Copiar los montos de ${MONTHS_ES[month - 2]} a ${MONTHS_ES[month - 1]} en las ${targets.length} celdas vacías?`)) return;
    for (const it of targets) setAmount(it, month, it.amounts[month - 2]);
  };

  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const totals = months.map((m) => expensesCrc(items, m));
  const yearTotal = totals.reduce((a, b) => a + b, 0);
  const usd = months.map((m) => { const r = rateOf(m); return r ? totals[m - 1] / r : null; });
  const usdYear = usd.reduce<number>((a, b) => a + (b ?? 0), 0);

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 space-y-3">
        <p className="font-body text-sm text-foreground">Todavía no hay gastos mensuales en {year}.</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={copyFromPrevious} disabled={busy}><Copy className="h-4 w-4 mr-1" /> Copiar los gastos de {year - 1}</Button>
          <Button type="button" variant="outline" onClick={() => add("Gastos Fijos")}><Plus className="h-4 w-4 mr-1" /> Agregar un gasto</Button>
        </div>
      </div>
    );
  }

  const stickyName = "sticky left-0 z-10";
  return (
    <div className="space-y-3">
      <p className="font-body text-xs text-muted-foreground">
        Como “Monthly Expenses”: montos en colones; el total de cada mes ÷ el tipo de cambio de ese mes = dólares (van a la ganancia neta).
        Puedes escribir sumas como 263953+56808 o 9.99*525.
      </p>
      <div className="overflow-auto max-h-[72vh] rounded-xl border border-border bg-card">
        <table className="w-full border-separate border-spacing-0 font-body text-sm">
          <thead className="sticky top-0 z-20">
            <tr className="text-[11px] uppercase tracking-wider text-muted-foreground bg-muted">
              <th className={cn(TH, stickyName, "z-30 bg-muted min-w-[260px]")}>Concepto</th>
              <th className={cn(TH, "bg-muted min-w-[140px]")}>Proveedor</th>
              {months.map((m) => (
                <th key={m} className={cn(TH, "bg-muted min-w-[120px] text-right")}>
                  <span className="inline-flex items-center gap-1">
                    {m > 1 && (
                      <button type="button" title={`Copiar ${MONTHS_ES[m - 2]} → ${MONTHS_ES[m - 1]} (celdas vacías)`} onClick={() => copyMonth(m)} className="text-muted-foreground/70 hover:text-foreground">
                        <Copy className="h-3 w-3" />
                      </button>
                    )}
                    {SHORT[m - 1]}
                  </span>
                </th>
              ))}
              <th className={cn(TH, "bg-muted min-w-[130px] text-right")}>Total</th>
              <th className={cn(TH, "bg-muted w-10")} />
            </tr>
          </thead>
          <tbody>
            {sections.map((section) => {
              const rows = sorted.filter((it) => (it.section || "Otros gastos") === section);
              return (
                <Fragment key={section}>
                  <tr className="bg-muted/60">
                    <td className={cn("px-3 py-1.5 border-b border-r border-border text-xs font-semibold uppercase tracking-wider text-foreground", stickyName, "bg-muted")}>
                      {section}
                    </td>
                    <td colSpan={15} className="px-2 py-1 border-b border-border">
                      <button type="button" onClick={() => add(section)} className="inline-flex items-center gap-1 text-xs font-body font-medium text-primary hover:underline">
                        <Plus className="h-3 w-3" /> Agregar gasto
                      </button>
                    </td>
                  </tr>
                  {rows.map((it, i) => {
                    const rowTotal = (it.amounts ?? []).reduce<number>((a, b) => a + (b == null ? 0 : Number(b)), 0);
                    return (
                      <tr key={it.id} className={i % 2 ? "bg-muted/20" : "bg-card"}>
                        <td className={cn(TD, stickyName, i % 2 ? "bg-muted" : "bg-card")}>
                          <TextCell value={it.label} onCommit={(v) => v && save(it.id, { label: v })} ariaLabel="Concepto" />
                        </td>
                        <td className={TD}><TextCell value={it.provider} onCommit={(v) => save(it.id, { provider: v })} ariaLabel="Proveedor" /></td>
                        {months.map((m) => (
                          <td key={m} className={TD}>
                            <NumberCell kind="crc" value={it.amounts?.[m - 1] ?? null} onCommit={(v) => setAmount(it, m, v)} ariaLabel={`${it.label} ${MONTHS_ES[m - 1]}`} />
                          </td>
                        ))}
                        <td className={cn(TD, "px-2 text-right tabular-nums font-medium whitespace-nowrap")}>{rowTotal ? colones(rowTotal) : "—"}</td>
                        <td className={cn(TD, "text-center")}>
                          <button type="button" onClick={() => remove(it)} title="Eliminar gasto" className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-muted">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot className="sticky bottom-0 z-20">
            <tr className="bg-muted font-semibold">
              <td className={cn(TD, stickyName, "bg-muted px-3 py-2")}>Total colones</td>
              <td className={TD} />
              {totals.map((t, i) => <td key={i} className={cn(TD, "px-2 text-right tabular-nums whitespace-nowrap")}>{colones(t)}</td>)}
              <td className={cn(TD, "px-2 text-right tabular-nums whitespace-nowrap")}>{colones(yearTotal)}</td>
              <td className={TD} />
            </tr>
            <tr className="bg-muted">
              <td className={cn(TD, stickyName, "bg-muted px-3 py-1 text-xs")}>Tipo de cambio (₡ por $)</td>
              <td className={TD} />
              {months.map((m) => (
                <td key={m} className={TD}>
                  <NumberCell kind="plain" value={rateOf(m)} onCommit={(v) => saveSetting(m, { exchange_rate: v })} placeholder="—" ariaLabel={`Tipo de cambio ${MONTHS_ES[m - 1]}`} className="font-medium" />
                </td>
              ))}
              <td className={TD} />
              <td className={TD} />
            </tr>
            <tr className="bg-emerald-50 font-semibold">
              <td className={cn(TD, stickyName, "bg-emerald-50 px-3 py-2")}>Total dólares</td>
              <td className={TD} />
              {usd.map((u, i) => (
                <td key={i} className={cn(TD, "px-2 text-right tabular-nums whitespace-nowrap")} title={u == null ? "Falta el tipo de cambio del mes" : undefined}>
                  {u == null ? <span className="text-amber-700">falta T.C.</span> : money(Math.round(u * 100) / 100)}
                </td>
              ))}
              <td className={cn(TD, "px-2 text-right tabular-nums whitespace-nowrap")}>{money(Math.round(usdYear * 100) / 100)}</td>
              <td className={TD} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
