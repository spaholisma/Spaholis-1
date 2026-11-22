import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { type Asset, assetMonthly, assetUsd, assetYearly, equipmentMonthly, money } from "@/lib/accounting";
import { NumberCell, TD, TH, TextCell } from "./Cells";

// Contabilidad → Equipos: the Excel's "Initial Expenses" sheet. Each piece of
// equipment is depreciated: (dollars − salvage value) ÷ years = per year,
// ÷ 12 = per month. The monthly total ('Initial Expenses'!H33) is what each
// month takes off the profit, unless the month has its own figure (Resumen).
// Not tied to a year: equipment lasts several.

const sb = supabase as any;
const r2 = (n: number) => Math.round(n * 100) / 100;

export function AccountingAssets({ assets, setAssets }: { assets: Asset[]; setAssets: React.Dispatch<React.SetStateAction<Asset[]>> }) {
  const sorted = [...assets].sort((a, b) => a.sort_order - b.sort_order);

  const save = async (id: string, patch: Partial<Asset>) => {
    let before: Asset | undefined;
    setAssets((prev) => prev.map((a) => { if (a.id === id) { before = a; return { ...a, ...patch }; } return a; }));
    const { error } = await sb.from("accounting_assets").update(patch).eq("id", id);
    if (error) {
      toast.error(`No se guardó: ${error.message}`);
      if (before) { const b = before; setAssets((prev) => prev.map((a) => (a.id === id ? b : a))); }
    }
  };
  const add = async () => {
    const name = prompt("¿Qué equipo o compra grande quieres agregar?");
    if (!name?.trim()) return;
    const { data, error } = await sb.from("accounting_assets")
      .insert({ name: name.trim(), sort_order: Math.max(0, ...assets.map((a) => a.sort_order)) + 1, life_years: 1 })
      .select("*").single();
    if (error) { toast.error(error.message); return; }
    setAssets((prev) => [...prev, data as Asset]);
  };
  const remove = async (a: Asset) => {
    if (!confirm(`¿Eliminar “${a.name}”? Deja de contar en la depreciación de todos los meses.`)) return;
    const { error } = await sb.from("accounting_assets").delete().eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    setAssets((prev) => prev.filter((x) => x.id !== a.id));
  };

  const active = sorted.filter((a) => a.active);
  const tUsd = r2(active.reduce((s, a) => s + assetUsd(a), 0));
  const tYear = r2(active.reduce((s, a) => s + assetYearly(a), 0));
  const tMonth = r2(equipmentMonthly(sorted));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={add}><Plus className="h-4 w-4 mr-1" /> Agregar equipo</Button>
        <p className="font-body text-xs text-muted-foreground">
          Como “Initial Expenses”: (dólares − valor residual) ÷ años = depreciación anual; ÷ 12 = mensual. El total mensual
          (<span className="font-semibold text-foreground">{money(tMonth)}</span>) se resta cada mes, salvo que el mes tenga su propia cifra en el Resumen.
          Quita la marca de “Cuenta” a lo que ya terminó de depreciarse.
        </p>
      </div>
      <div className="overflow-auto max-h-[70vh] rounded-xl border border-border bg-card">
        <table className="w-full border-separate border-spacing-0 font-body text-sm">
          <thead className="sticky top-0 z-20">
            <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {[
                ["Equipo", "min-w-[230px]"], ["Compra", "min-w-[130px]"], ["Colones", "min-w-[130px] text-right"], ["T. cambio", "min-w-[90px] text-right"],
                ["Dólares", "min-w-[110px] text-right"], ["Valor residual", "min-w-[110px] text-right"], ["Vida (años)", "min-w-[90px] text-right"],
                ["Dep. anual", "min-w-[110px] text-right"], ["Dep. mensual", "min-w-[110px] text-right"], ["Proveedor", "min-w-[170px]"],
                ["Cuenta", "w-16 text-center"], ["", "w-10"],
              ].map(([h, c], i) => <th key={i} className={cn(TH, "bg-violet-50", c)}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {sorted.map((a, i) => (
              <tr key={a.id} className={cn(i % 2 ? "bg-muted/20" : "bg-card", !a.active && "opacity-50")}>
                <td className={TD}><TextCell value={a.name} onCommit={(v) => v && save(a.id, { name: v })} ariaLabel="Equipo" /></td>
                <td className={TD}><TextCell value={a.purchased} onCommit={(v) => save(a.id, { purchased: v })} placeholder="Ej. Julio 2026" ariaLabel="Compra" /></td>
                <td className={TD}><NumberCell kind="crc" value={a.amount_crc} onCommit={(v) => save(a.id, { amount_crc: v })} placeholder="₡0" ariaLabel="Colones" /></td>
                <td className={TD}><NumberCell kind="plain" value={a.exchange_rate} onCommit={(v) => save(a.id, { exchange_rate: v })} placeholder="—" ariaLabel="Tipo de cambio" /></td>
                <td className={TD}>
                  <NumberCell
                    kind="usd"
                    value={a.amount_usd}
                    onCommit={(v) => save(a.id, { amount_usd: v })}
                    placeholder={money(r2(assetUsd({ ...a, amount_usd: null })))}
                    className={a.amount_usd != null ? "font-semibold" : "placeholder:text-foreground/70"}
                    title={a.amount_usd != null ? "Dólares escritos a mano" : "Colones ÷ tipo de cambio"}
                    ariaLabel="Dólares"
                  />
                </td>
                <td className={TD}><NumberCell kind="usd" value={a.salvage} onCommit={(v) => save(a.id, { salvage: v ?? 0 })} ariaLabel="Valor residual" /></td>
                <td className={TD}><NumberCell kind="plain" value={a.life_years} onCommit={(v) => save(a.id, { life_years: v && v > 0 ? v : null })} placeholder="—" ariaLabel="Vida en años" /></td>
                <td className={cn(TD, "px-2 text-right tabular-nums")}>{money(r2(assetYearly(a)))}</td>
                <td className={cn(TD, "px-2 text-right tabular-nums font-medium bg-violet-50/50")}>{money(r2(assetMonthly(a)))}</td>
                <td className={TD}><TextCell value={a.provider} onCommit={(v) => save(a.id, { provider: v })} ariaLabel="Proveedor" /></td>
                <td className={cn(TD, "text-center")}>
                  <input type="checkbox" className="h-4 w-4 accent-primary" checked={a.active} onChange={(e) => save(a.id, { active: e.target.checked })} aria-label="Cuenta en la depreciación" />
                </td>
                <td className={cn(TD, "text-center")}>
                  <button type="button" onClick={() => remove(a)} title="Eliminar" className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-muted"><Trash2 className="h-3.5 w-3.5" /></button>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && <tr><td colSpan={12} className="py-8 text-center text-muted-foreground">No hay equipos todavía.</td></tr>}
          </tbody>
          {sorted.length > 0 && (
            <tfoot className="sticky bottom-0 z-20">
              <tr className="bg-muted font-semibold">
                <td className={cn(TD, "px-2 py-2")} colSpan={4}>Total (los que cuentan: {active.length})</td>
                <td className={cn(TD, "px-2 text-right tabular-nums")}>{money(tUsd)}</td>
                <td className={TD} colSpan={2} />
                <td className={cn(TD, "px-2 text-right tabular-nums")}>{money(tYear)}</td>
                <td className={cn(TD, "px-2 text-right tabular-nums bg-violet-50")}>{money(tMonth)}</td>
                <td className={TD} colSpan={3} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
