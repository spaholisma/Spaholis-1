import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  type AccountingEntry, type Asset, type ExpenseItem, type MonthSetting, MONTHS_ES, type Purchase, equipmentMonthly, incomeRow, money,
} from "@/lib/accounting";
import { NumberCell, TD, TH } from "./Cells";

// The year's net profit, line by line like the Excel's "Income" sheet:
//   Ganancia neta = HWC − (Gastos mensuales + Depreciación + Compras); 4% = neta × 4%.

const r2 = (n: number) => Math.round(n * 100) / 100;

export function AccountingIncome({
  year, entries, items, purchases, settings, assets, saveSetting, onOpenMonth,
}: {
  year: number;
  entries: AccountingEntry[];
  items: ExpenseItem[];
  purchases: Purchase[];
  settings: MonthSetting[];
  assets: Asset[];
  saveSetting: (month: number, patch: Partial<MonthSetting>) => void;
  onOpenMonth: (m: number) => void;
}) {
  const rows = useMemo(
    () => Array.from({ length: 12 }, (_, i) => i + 1).map((m) =>
      incomeRow(m, entries.filter((e) => e.month === m), items, purchases.filter((p) => p.month === m), settings.find((s) => s.month === m), assets),
    ),
    [entries, items, purchases, settings, assets],
  );
  const sum = (k: "hwc" | "expenses" | "depreciation" | "purchases" | "net" | "pct4") => r2(rows.reduce((s, r) => s + r[k], 0));
  const auto = r2(equipmentMonthly(assets));
  const neg = (n: number) => n < 0 && "text-destructive";

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full border-separate border-spacing-0 font-body text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-muted-foreground bg-muted">
              <th className={TH}>Mes</th>
              <th className={cn(TH, "text-right bg-emerald-50")} title="Gross Profit: HWC del mes">HWC (Gross)</th>
              <th className={cn(TH, "text-right")} title="Gastos mensuales en colones ÷ tipo de cambio">Gastos mensuales</th>
              <th className={cn(TH, "text-right")} title="Depreciación de equipos">Depreciación</th>
              <th className={cn(TH, "text-right")} title="Compras del mes">Compras</th>
              <th className={cn(TH, "text-right bg-emerald-100 text-foreground")}>Ganancia neta</th>
              <th className={cn(TH, "text-right")} title="Ganancia neta × 4% (como la columna del Excel)">4%</th>
              <th className={cn(TH, "text-right")} title="Colones por dólar de ese mes">Tipo de cambio</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.month} className={i % 2 ? "bg-muted/20" : "bg-card"}>
                <td className={cn(TD, "px-3 py-1.5")}>
                  <button type="button" onClick={() => onOpenMonth(r.month)} className="font-medium text-foreground hover:underline underline-offset-2">{MONTHS_ES[r.month - 1]}</button>
                </td>
                <td className={cn(TD, "px-3 text-right tabular-nums bg-emerald-50/40", neg(r.hwc))}>{money(r2(r.hwc))}</td>
                <td className={cn(TD, "px-3 text-right tabular-nums")} title={r.rate ? undefined : "Falta el tipo de cambio del mes"}>
                  {r.expensesCrc && !r.rate ? <span className="text-amber-700">falta T.C.</span> : money(r2(r.expenses))}
                </td>
                <td className={TD}>
                  <NumberCell
                    kind="usd"
                    value={r.depreciationIsAuto ? null : r2(r.depreciation)}
                    onCommit={(v) => saveSetting(r.month, { depreciation: v })}
                    placeholder={money(auto)}
                    className={r.depreciationIsAuto ? "placeholder:text-foreground/70" : "font-semibold"}
                    title={r.depreciationIsAuto ? "Total de Equipos (bórralo o escribe otra cifra para este mes)" : "Cifra propia de este mes (bórrala para usar el total de Equipos)"}
                    ariaLabel={`Depreciación ${MONTHS_ES[r.month - 1]}`}
                  />
                </td>
                <td className={cn(TD, "px-3 text-right tabular-nums")}>{money(r2(r.purchases))}</td>
                <td className={cn(TD, "px-3 text-right tabular-nums font-semibold bg-emerald-100/50", neg(r.net))}>{money(r2(r.net))}</td>
                <td className={cn(TD, "px-3 text-right tabular-nums", neg(r.pct4))}>{money(r2(r.pct4))}</td>
                <td className={TD}>
                  <NumberCell kind="plain" value={r.rate} onCommit={(v) => saveSetting(r.month, { exchange_rate: v })} placeholder="—" ariaLabel={`Tipo de cambio ${MONTHS_ES[r.month - 1]}`} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted font-semibold">
              <td className={cn(TD, "px-3 py-2")}>Total {year}</td>
              <td className={cn(TD, "px-3 text-right tabular-nums", neg(sum("hwc")))}>{money(sum("hwc"))}</td>
              <td className={cn(TD, "px-3 text-right tabular-nums")}>{money(sum("expenses"))}</td>
              <td className={cn(TD, "px-3 text-right tabular-nums")}>{money(sum("depreciation"))}</td>
              <td className={cn(TD, "px-3 text-right tabular-nums")}>{money(sum("purchases"))}</td>
              <td className={cn(TD, "px-3 text-right tabular-nums bg-emerald-100", neg(sum("net")))}>{money(sum("net"))}</td>
              <td className={cn(TD, "px-3 text-right tabular-nums", neg(sum("pct4")))}>{money(sum("pct4"))}</td>
              <td className={TD} />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="font-body text-xs text-muted-foreground">
        Como la hoja “Income”: Ganancia neta = HWC − (Gastos mensuales + Depreciación + Compras); 4% = Ganancia neta × 4%.
        Gastos mensuales = total en colones ÷ tipo de cambio del mes. Depreciación: el total de Equipos ({money(auto)}), o la cifra que escribas para ese mes.
      </p>
    </div>
  );
}
