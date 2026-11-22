import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Copy, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { type AccountingListItem, MONTHS_ES, type Purchase, colones, money, normName, purchaseUsd } from "@/lib/accounting";
import { DateCell, NumberCell, TD, TH, TextCell } from "./Cells";

// Contabilidad → a month → Compras: the purchases table the Excel kept under
// each month's totals (Fecha, Item Code, Product, Cost Colones, Dollars,
// Quantity, Provider). Dollars = colones ÷ the exchange rate written on the
// purchase (or the dollars typed); their total goes into the month's net profit.

const sb = supabase as any;
const pad2 = (n: number) => String(n).padStart(2, "0");
const COLS = "id, year, month, purchase_date, category, product, amount_crc, exchange_rate, amount_usd, quantity, provider, created_at";

export function AccountingPurchases({
  year, month, purchases, setPurchases, monthRate, lists,
}: {
  year: number;
  month: number;
  purchases: Purchase[];
  setPurchases: React.Dispatch<React.SetStateAction<Purchase[]>>;
  monthRate: number | null;
  lists: AccountingListItem[];
}) {
  const rows = useMemo(() => purchases.filter((p) => p.year === year && p.month === month), [purchases, year, month]);
  const categories = useMemo(
    () => lists.filter((l) => l.kind === "purchase_category" && l.active).sort((a, b) => a.sort_order - b.sort_order).map((l) => l.label),
    [lists],
  );
  const knownCategory = (c: string | null) => !c || categories.some((x) => normName(x) === normName(c));

  const save = async (id: string, patch: Partial<Purchase>) => {
    let before: Purchase | undefined;
    setPurchases((prev) => prev.map((p) => { if (p.id === id) { before = p; return { ...p, ...patch }; } return p; }));
    const { error } = await sb.from("accounting_purchases").update(patch).eq("id", id);
    if (error) {
      toast.error(`No se guardó: ${error.message}`);
      if (before) { const b = before; setPurchases((prev) => prev.map((p) => (p.id === id ? b : p))); }
    }
  };

  const add = async (copyOf?: Purchase) => {
    const today = new Date();
    const inMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
    const base = copyOf
      ? (({ id: _i, created_at: _c, ...rest }) => rest)(copyOf)
      : { year, month, purchase_date: `${year}-${pad2(month)}-${pad2(inMonth ? today.getDate() : 1)}`, exchange_rate: monthRate };
    const { data, error } = await sb.from("accounting_purchases").insert(base).select(COLS).single();
    if (error) { toast.error(error.message); return; }
    setPurchases((prev) => [...prev, data as Purchase]);
  };

  const remove = async (p: Purchase) => {
    if (!confirm(`¿Eliminar la compra “${p.product || p.category || "sin nombre"}”?`)) return;
    const { error } = await sb.from("accounting_purchases").delete().eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    setPurchases((prev) => prev.filter((x) => x.id !== p.id));
  };

  const totalCrc = rows.reduce((s, p) => s + Number(p.amount_crc ?? 0), 0);
  const totalUsd = rows.reduce((s, p) => s + purchaseUsd(p), 0);
  // By category, like the "Purchases" block of the Excel's Calculations.
  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of rows) {
      const k = p.category?.trim() || "Sin categoría";
      m.set(k, (m.get(k) ?? 0) + purchaseUsd(p));
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => add()}><Plus className="h-4 w-4 mr-1" /> Agregar compra</Button>
        <p className="font-body text-xs text-muted-foreground">
          Dólares = colones ÷ tipo de cambio de la compra{monthRate ? ` (este mes: ₡${monthRate})` : ""}. Si pagaste en dólares, escríbelos en “Dólares”.
        </p>
      </div>
      <datalist id="acc-purchase-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>

      <div className="overflow-auto max-h-[60vh] rounded-xl border border-border bg-card">
        <table className="w-full border-separate border-spacing-0 font-body text-sm">
          <thead className="sticky top-0 z-20">
            <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {[
                ["#", "w-10 text-center"], ["Fecha", "min-w-[140px]"], ["Categoría", "min-w-[170px]"], ["Producto", "min-w-[220px]"],
                ["Colones", "min-w-[130px] text-right"], ["T. cambio", "min-w-[90px] text-right"], ["Dólares", "min-w-[110px] text-right"],
                ["Cantidad", "min-w-[80px] text-right"], ["Proveedor", "min-w-[170px]"], ["", "w-[72px]"],
              ].map(([h, c], i) => <th key={i} className={cn(TH, "bg-orange-50", c)}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => {
              const auto = purchaseUsd({ ...p, amount_usd: null });
              return (
                <tr key={p.id} className={i % 2 ? "bg-muted/20" : "bg-card"}>
                  <td className={cn(TD, "text-center text-[11px] text-muted-foreground tabular-nums")}>{i + 1}</td>
                  <td className={TD}><DateCell value={p.purchase_date} onCommit={(v) => save(p.id, { purchase_date: v })} ariaLabel="Fecha" /></td>
                  <td className={cn(TD, !knownCategory(p.category) && "bg-amber-500/15")} title={!knownCategory(p.category) ? "No está en Listas → Categorías de compras" : undefined}>
                    <TextCell value={p.category} list="acc-purchase-categories" onCommit={(v) => save(p.id, { category: categories.find((c) => normName(c) === normName(v)) ?? v })} ariaLabel="Categoría" />
                  </td>
                  <td className={TD}><TextCell value={p.product} onCommit={(v) => save(p.id, { product: v })} ariaLabel="Producto" /></td>
                  <td className={TD}><NumberCell kind="crc" value={p.amount_crc} onCommit={(v) => save(p.id, { amount_crc: v })} placeholder="₡0" ariaLabel="Colones" /></td>
                  <td className={TD}><NumberCell kind="plain" value={p.exchange_rate} onCommit={(v) => save(p.id, { exchange_rate: v })} placeholder={monthRate ? String(monthRate) : "—"} ariaLabel="Tipo de cambio" /></td>
                  <td className={TD}>
                    <NumberCell
                      kind="usd"
                      value={p.amount_usd}
                      onCommit={(v) => save(p.id, { amount_usd: v })}
                      placeholder={money(Math.round(auto * 100) / 100)}
                      className={p.amount_usd != null ? "font-semibold" : "placeholder:text-foreground/70"}
                      title={p.amount_usd != null ? "Dólares escritos a mano (bórralos para calcular desde colones)" : "Colones ÷ tipo de cambio"}
                      ariaLabel="Dólares"
                    />
                  </td>
                  <td className={TD}><NumberCell kind="plain" value={p.quantity} onCommit={(v) => save(p.id, { quantity: v })} placeholder="—" ariaLabel="Cantidad" /></td>
                  <td className={TD}><TextCell value={p.provider} onCommit={(v) => save(p.id, { provider: v })} ariaLabel="Proveedor" /></td>
                  <td className={cn(TD, "whitespace-nowrap text-center")}>
                    <button type="button" onClick={() => add(p)} title="Duplicar compra" className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"><Copy className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => remove(p)} title="Eliminar compra" className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-muted"><Trash2 className="h-3.5 w-3.5" /></button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={10} className="py-8 text-center text-muted-foreground">No hay compras en {MONTHS_ES[month - 1]} {year}. Usa “Agregar compra”.</td></tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="sticky bottom-0 z-20">
              <tr className="bg-muted font-semibold">
                <td className={TD} />
                <td className={cn(TD, "px-2 py-2")} colSpan={3}>Total compras ({rows.length})</td>
                <td className={cn(TD, "px-2 text-right tabular-nums whitespace-nowrap")}>{colones(Math.round(totalCrc * 100) / 100)}</td>
                <td className={TD} />
                <td className={cn(TD, "px-2 text-right tabular-nums whitespace-nowrap bg-emerald-50")}>{money(Math.round(totalUsd * 100) / 100)}</td>
                <td className={TD} colSpan={3} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {byCategory.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden max-w-md">
          <table className="w-full border-separate border-spacing-0 font-body text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-muted-foreground bg-orange-50">
                <th className={TH}>Por categoría</th>
                <th className={cn(TH, "text-right")}>Dólares</th>
              </tr>
            </thead>
            <tbody>
              {byCategory.map(([c, v]) => (
                <tr key={c}>
                  <td className={cn(TD, "px-3 py-1.5")}>{c}</td>
                  <td className={cn(TD, "px-3 py-1.5 text-right tabular-nums")}>{money(Math.round(v * 100) / 100)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
