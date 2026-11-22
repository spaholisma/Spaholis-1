import { Fragment, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  type AccountingEntry, type AccountingListItem, hotelReport, listIndex, money, rowPoints, therapistReport, totalsOf, treatmentReport,
} from "@/lib/accounting";

// The reports the Excel kept in its summary sheets ("Vendor Commissions",
// "Staff" + "puntos terap", "Treatments") — here worked out from EVERY row of
// the period, so nothing is left out.

type Kind = "hotels" | "therapists" | "treatments";

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
function download(name: string, rows: unknown[][]) {
  const csv = "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const pctLabel = (pcts: number[]) =>
  pcts.length === 0 ? "—" : pcts.length === 1 ? `${pcts[0]}%` : `${pcts[0]}–${pcts[pcts.length - 1]}%`;

export function AccountingReports({
  entries, lists, periodLabel, fileStem, onFilter,
}: {
  entries: AccountingEntry[];
  lists: AccountingListItem[];
  periodLabel: string;
  fileStem: string;
  /** Show the rows of one name (hotel / therapist / treatment), when the period is a month. */
  onFilter?: (text: string) => void;
}) {
  const [kind, setKind] = useState<Kind>("hotels");
  const treatmentOf = useMemo(() => listIndex(lists, "treatment"), [lists]);
  const hotels = useMemo(() => hotelReport(entries), [entries]);
  const therapists = useMemo(() => therapistReport(entries, (e) => rowPoints(e, (t) => treatmentOf(t)?.points ?? null)), [entries, treatmentOf]);
  const treatments = useMemo(() => treatmentReport(entries, (t) => treatmentOf(t)?.category ?? null), [entries, treatmentOf]);
  const totals = useMemo(() => totalsOf(entries), [entries]);

  const tabs: { id: Kind; label: string; hint: string }[] = [
    { id: "hotels", label: "Hoteles y villas", hint: "Comisión que se le debe a cada hotel, villa o concierge." },
    { id: "therapists", label: "Terapeutas", hint: "Servicios, puntos, comisiones y salarios de cada terapeuta." },
    { id: "treatments", label: "Tratamientos", hint: "Lo que deja cada tratamiento (HWC), por categoría." },
  ];
  const sum = <T,>(rows: T[], f: (r: T) => number) => Math.round(rows.reduce((s, r) => s + f(r), 0) * 100) / 100;

  const exportCurrent = () => {
    if (kind === "hotels") {
      download(`${fileStem}-hoteles.csv`, [
        ["Hotel / Villa", "Servicios", "Ventas", "Comisión %", "Comisión a pagar"],
        ...hotels.map((r) => [r.name, r.services, r.sales, pctLabel(r.pcts), r.commission]),
        ["TOTAL", sum(hotels, (r) => r.services), sum(hotels, (r) => r.sales), "", sum(hotels, (r) => r.commission)],
      ]);
    } else if (kind === "therapists") {
      download(`${fileStem}-terapeutas.csv`, [
        ["Terapeuta", "Servicios", "Puntos", "Ventas", "Comisión por tratamientos", "Salario", "Comisión quincena", "Total"],
        ...therapists.map((r) => [r.name, r.services, r.points, r.sales, r.treatmentCommission, r.salary, r.payrollCommission, r.total]),
        ["TOTAL", sum(therapists, (r) => r.services), sum(therapists, (r) => r.points), sum(therapists, (r) => r.sales),
          sum(therapists, (r) => r.treatmentCommission), sum(therapists, (r) => r.salary), sum(therapists, (r) => r.payrollCommission), sum(therapists, (r) => r.total)],
      ]);
    } else {
      download(`${fileStem}-tratamientos.csv`, [
        ["Categoría", "Tratamiento", "Cantidad", "Ventas", "HWC"],
        ...treatments.flatMap((c) => [
          ...c.rows.map((r) => [c.category, r.name, r.services, r.sales, r.hwc]),
          [c.category, "Subtotal", c.services, c.sales, c.hwc],
        ]),
        ["TOTAL", "", sum(treatments, (c) => c.services), sum(treatments, (c) => c.sales), sum(treatments, (c) => c.hwc)],
      ]);
    }
  };

  const th = "px-3 py-2 text-left font-semibold border-b border-r border-border last:border-r-0 whitespace-nowrap";
  const td = "px-3 py-1.5 border-b border-r border-border/70 last:border-r-0";
  const tdNum = cn(td, "text-right tabular-nums whitespace-nowrap");
  const nameCell = (name: string) =>
    onFilter ? (
      <button type="button" className="text-left font-medium text-foreground hover:underline underline-offset-2" onClick={() => onFilter(name)} title="Ver sus filas">
        {name}
      </button>
    ) : <span className="font-medium text-foreground">{name}</span>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setKind(t.id)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-body font-medium border transition-colors",
              kind === t.id ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
        <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={exportCurrent}>
          <Download className="h-4 w-4 mr-1" /> Exportar (CSV)
        </Button>
      </div>
      <p className="font-body text-xs text-muted-foreground">
        {tabs.find((t) => t.id === kind)?.hint} {periodLabel} · se calcula con todas las filas.
        {onFilter && " Toca un nombre para ver sus filas."}
      </p>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        {kind === "hotels" && (
          <table className="w-full border-separate border-spacing-0 font-body text-sm">
            <thead>
              <tr className="bg-amber-500/10 text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className={th}>Hotel / Villa / Concierge</th>
                <th className={cn(th, "text-right")}>Servicios</th>
                <th className={cn(th, "text-right")}>Ventas</th>
                <th className={cn(th, "text-right")}>Comisión %</th>
                <th className={cn(th, "text-right text-foreground")}>Comisión a pagar</th>
              </tr>
            </thead>
            <tbody>
              {hotels.map((r, i) => (
                <tr key={r.name} className={i % 2 ? "bg-muted/25" : ""}>
                  <td className={td}>{nameCell(r.name)}</td>
                  <td className={tdNum}>{r.services}</td>
                  <td className={tdNum}>{money(r.sales)}</td>
                  <td className={tdNum}>{pctLabel(r.pcts)}</td>
                  <td className={cn(tdNum, "font-semibold")}>{money(r.commission)}</td>
                </tr>
              ))}
              {hotels.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">No hay servicios con hotel o villa en este periodo.</td></tr>}
            </tbody>
            {hotels.length > 0 && (
              <tfoot>
                <tr className="bg-muted/50 font-semibold">
                  <td className={td}>Total</td>
                  <td className={tdNum}>{sum(hotels, (r) => r.services)}</td>
                  <td className={tdNum}>{money(sum(hotels, (r) => r.sales))}</td>
                  <td className={tdNum} />
                  <td className={tdNum}>{money(sum(hotels, (r) => r.commission))}</td>
                </tr>
              </tfoot>
            )}
          </table>
        )}

        {kind === "therapists" && (
          <table className="w-full border-separate border-spacing-0 font-body text-sm">
            <thead>
              <tr className="bg-sky-500/10 text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className={th}>Terapeuta</th>
                <th className={cn(th, "text-right")}>Servicios</th>
                <th className={cn(th, "text-right")}>Puntos</th>
                <th className={cn(th, "text-right")}>Ventas</th>
                <th className={cn(th, "text-right")}>Com. por tratamientos</th>
                <th className={cn(th, "text-right")}>Salario</th>
                <th className={cn(th, "text-right")}>Com. quincena</th>
                <th className={cn(th, "text-right text-foreground")}>Total</th>
              </tr>
            </thead>
            <tbody>
              {therapists.map((r, i) => (
                <tr key={r.name} className={i % 2 ? "bg-muted/25" : ""}>
                  <td className={td}>{nameCell(r.name)}</td>
                  <td className={tdNum}>{r.services}</td>
                  <td className={tdNum} title={r.missingPoints ? `${r.missingPoints} tratamiento(s) sin puntos en la lista` : undefined}>
                    {r.points}{r.missingPoints ? <span className="text-amber-600"> *</span> : null}
                  </td>
                  <td className={tdNum}>{money(r.sales)}</td>
                  <td className={tdNum}>{money(r.treatmentCommission)}</td>
                  <td className={tdNum}>{money(r.salary)}</td>
                  <td className={tdNum}>{money(r.payrollCommission)}</td>
                  <td className={cn(tdNum, "font-semibold")}>{money(r.total)}</td>
                </tr>
              ))}
              {therapists.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">No hay filas con terapeuta en este periodo.</td></tr>}
            </tbody>
            {therapists.length > 0 && (
              <tfoot>
                <tr className="bg-muted/50 font-semibold">
                  <td className={td}>Total</td>
                  <td className={tdNum}>{sum(therapists, (r) => r.services)}</td>
                  <td className={tdNum}>{sum(therapists, (r) => r.points)}</td>
                  <td className={tdNum}>{money(sum(therapists, (r) => r.sales))}</td>
                  <td className={tdNum}>{money(sum(therapists, (r) => r.treatmentCommission))}</td>
                  <td className={tdNum}>{money(sum(therapists, (r) => r.salary))}</td>
                  <td className={tdNum}>{money(sum(therapists, (r) => r.payrollCommission))}</td>
                  <td className={tdNum}>{money(sum(therapists, (r) => r.total))}</td>
                </tr>
              </tfoot>
            )}
          </table>
        )}

        {kind === "treatments" && (
          <table className="w-full border-separate border-spacing-0 font-body text-sm">
            <thead>
              <tr className="bg-spa-sage/15 text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className={th}>Tratamiento</th>
                <th className={cn(th, "text-right")}>Cantidad</th>
                <th className={cn(th, "text-right")}>Ventas</th>
                <th className={cn(th, "text-right text-foreground")}>HWC</th>
              </tr>
            </thead>
            <tbody>
              {treatments.map((c) => (
                <Fragment key={c.category}>
                  <tr className="bg-muted/60">
                    <td colSpan={4} className="px-3 py-1.5 border-b border-border text-xs font-semibold uppercase tracking-wider text-foreground">{c.category}</td>
                  </tr>
                  {c.rows.map((r) => (
                    <tr key={c.category + r.name}>
                      <td className={cn(td, "pl-6")}>{nameCell(r.name)}</td>
                      <td className={tdNum}>{r.services}</td>
                      <td className={tdNum}>{money(r.sales)}</td>
                      <td className={cn(tdNum, r.hwc < 0 && "text-destructive")}>{money(r.hwc)}</td>
                    </tr>
                  ))}
                  <tr className="font-medium">
                    <td className={cn(td, "pl-6 text-muted-foreground")}>Subtotal {c.category.toLowerCase()}</td>
                    <td className={tdNum}>{c.services}</td>
                    <td className={tdNum}>{money(c.sales)}</td>
                    <td className={cn(tdNum, c.hwc < 0 && "text-destructive")}>{money(c.hwc)}</td>
                  </tr>
                </Fragment>
              ))}
              {treatments.length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">No hay filas en este periodo.</td></tr>}
            </tbody>
            {treatments.length > 0 && (
              <tfoot>
                <tr className="bg-muted/50 font-semibold">
                  <td className={td}>Total (= HWC del periodo)</td>
                  <td className={tdNum}>{sum(treatments, (c) => c.services)}</td>
                  <td className={tdNum}>{money(sum(treatments, (c) => c.sales))}</td>
                  <td className={cn(tdNum, totals.hwc < 0 && "text-destructive")}>{money(totals.hwc)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>
      {kind === "treatments" && treatments.some((c) => c.category === "Sin categoría") && (
        <p className="font-body text-xs text-amber-700">
          “Sin categoría”: tratamientos escritos con un nombre que no está en Listas → Tratamientos. Agrégalos allí con su categoría (o corrige el nombre en la fila) y pasan a su categoría.
        </p>
      )}
    </div>
  );
}
