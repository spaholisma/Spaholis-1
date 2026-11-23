import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { type AccountingListItem, normName } from "@/lib/accounting";
import { resetAccountingSuggestions } from "@/components/admin/calendar/AccountingFields";

// Listas → Tratamientos: each website treatment and its name in Contabilidad.
// One list for both: a website booking passes to Contabilidad with the name
// chosen here (and so do agenda entries where the website name was typed).

const sb = supabase as any;

interface Service { id: string; title: string; price: number | null; category: string | null; is_active: boolean }

export function AccountingServiceMap({ lists }: { lists: AccountingListItem[] }) {
  const [services, setServices] = useState<Service[]>([]);
  const [map, setMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all([
      sb.from("services").select("id, title, price, category, is_active").eq("type", "treatment").order("category").order("title"),
      sb.from("accounting_service_map").select("service_id, treatment"),
    ]).then(([sv, mp]: any[]) => {
      if (!alive) return;
      if (sv.error) toast.error(sv.error.message);
      if (mp.error) toast.error(mp.error.message);
      setServices((sv.data ?? []) as Service[]);
      setMap(Object.fromEntries(((mp.data ?? []) as { service_id: string; treatment: string }[]).map((r) => [r.service_id, r.treatment])));
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const treatments = useMemo(
    () => lists.filter((l) => l.kind === "treatment" && l.active).sort((a, b) => a.label.localeCompare(b.label)).map((l) => l.label),
    [lists],
  );
  const known = useMemo(() => new Set(treatments.map(normName)), [treatments]);

  const save = async (serviceId: string, raw: string) => {
    const typed = raw.replace(/\s+/g, " ").trim();
    // The list's spelling when it is on the list.
    const value = treatments.find((t) => normName(t) === normName(typed)) ?? typed;
    const before = map[serviceId] ?? "";
    if (value === before) return;
    setMap((m) => { const n = { ...m }; if (value) n[serviceId] = value; else delete n[serviceId]; return n; });
    const { error } = value
      ? await sb.from("accounting_service_map").upsert({ service_id: serviceId, treatment: value, updated_at: new Date().toISOString() })
      : await sb.from("accounting_service_map").delete().eq("service_id", serviceId);
    if (error) {
      toast.error(`No se guardó: ${error.message}`);
      setMap((m) => { const n = { ...m }; if (before) n[serviceId] = before; else delete n[serviceId]; return n; });
      return;
    }
    resetAccountingSuggestions();
  };

  const missing = services.filter((s) => s.is_active && !map[s.id]).length;
  const th = "px-3 py-2 text-left font-semibold border-b border-border";
  const td = "px-3 py-1.5 border-b border-border/60 align-middle";

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div>
        <p className="font-body text-sm font-medium text-foreground">Tratamientos del website → nombre en Contabilidad</p>
        <p className="font-body text-xs text-muted-foreground">
          Una sola lista: cuando una reserva del website pasa a Contabilidad, usa el nombre que elijas aquí.
          {!loading && missing > 0 && <> Faltan <strong>{missing}</strong> por elegir.</>}
        </p>
      </div>
      {loading ? (
        <p className="font-body text-xs text-muted-foreground">Cargando…</p>
      ) : (
        <div className="overflow-auto max-h-[50vh] rounded-lg border border-border">
          <table className="w-full border-separate border-spacing-0 font-body text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className={th}>En el website</th>
                <th className={th}>En Contabilidad</th>
              </tr>
            </thead>
            <tbody>
              {services.map((s, i) => (
                <MapRow
                  key={s.id}
                  service={s}
                  value={map[s.id] ?? ""}
                  offList={!!map[s.id] && !known.has(normName(map[s.id]))}
                  zebra={i % 2 === 1}
                  td={td}
                  onSave={(v) => save(s.id, v)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <datalist id="acc-map-treatments">{treatments.map((t) => <option key={t} value={t} />)}</datalist>
    </div>
  );
}

function MapRow({
  service, value, offList, zebra, td, onSave,
}: { service: Service; value: string; offList: boolean; zebra: boolean; td: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <tr className={zebra ? "bg-muted/25" : ""}>
      <td className={cn(td, !service.is_active && "text-muted-foreground")}>
        {service.title}
        {service.price != null && <span className="text-muted-foreground"> · ${Number(service.price)}</span>}
        {!service.is_active && <span className="ml-1 text-[11px]">(no está en el website)</span>}
      </td>
      <td className={cn(td, "w-[45%]", offList && "bg-amber-500/10")} title={offList ? "No está en la lista de Tratamientos" : undefined}>
        <input
          className="w-full bg-transparent px-1 py-1 outline-none focus:bg-background focus:ring-1 focus:ring-ring rounded"
          list="acc-map-treatments"
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          onBlur={() => onSave(v)}
          placeholder="Elige de la lista…"
          aria-label={`Nombre en Contabilidad de ${service.title}`}
        />
      </td>
    </tr>
  );
}
