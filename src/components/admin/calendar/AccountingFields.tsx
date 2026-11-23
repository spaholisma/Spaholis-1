import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Info } from "lucide-react";

// Agenda → Contabilidad. The database turns an entry (or a website booking)
// into a row of Contabilidad once it has Cliente, Tratamiento, Cobrar (Price
// on bookings) and Terapeuta — see accounting_sync_source. These are the
// pieces both forms share: the dropdowns (from Contabilidad's lists) and the
// Terapeuta / On-Out Call fields.

export interface AccountingSuggestions {
  treatment: string[];
  therapist: string[];
  location: string[];
  hotel: string[];
  client: string[];
  /** Website service id → its name in Contabilidad. */
  service_map: Record<string, string>;
}

export const EMPTY_SUGGESTIONS: AccountingSuggestions = {
  treatment: [], therapist: [], location: [], hotel: [], client: [], service_map: {},
};

let cache: Promise<AccountingSuggestions> | null = null;

/** Loaded once per page; a failed load is retried next time. */
export function loadAccountingSuggestions(): Promise<AccountingSuggestions> {
  if (!cache) {
    cache = Promise.resolve(supabase.rpc("accounting_suggestions" as any)).then(({ data, error }: any) => {
      if (error || !data) { cache = null; return EMPTY_SUGGESTIONS; }
      return { ...EMPTY_SUGGESTIONS, ...(data as Partial<AccountingSuggestions>) } as AccountingSuggestions;
    });
  }
  return cache;
}

/** Forget the loaded lists (after Listas changed). */
export function resetAccountingSuggestions() { cache = null; }

export function useAccountingSuggestions(enabled: boolean): AccountingSuggestions {
  const [s, setS] = useState<AccountingSuggestions>(EMPTY_SUGGESTIONS);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    loadAccountingSuggestions().then((v) => { if (alive) setS(v); });
    return () => { alive = false; };
  }, [enabled]);
  return s;
}

/** Several option lists in one, without repeats (case ignored), first spelling wins. */
export function mergeOptions(...lists: (string[] | undefined)[]): string[] {
  const seen = new Map<string, string>();
  for (const l of lists) for (const v of l ?? []) {
    const t = (v ?? "").trim();
    if (t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  }
  return Array.from(seen.values());
}

/** What is still missing for the entry to pass to Contabilidad (empty = it passes). */
export function accountingMissing(d: {
  client: string | null | undefined;
  treatment: string | null | undefined;
  cost: number | null | undefined;
  therapist: string | null | undefined;
}, costLabel = "Cobrar"): string[] {
  const out: string[] = [];
  if (!(d.client ?? "").trim()) out.push("Cliente");
  if (!(d.treatment ?? "").trim()) out.push("Tratamiento");
  if (d.cost == null || !Number.isFinite(Number(d.cost))) out.push(costLabel);
  if (!(d.therapist ?? "").trim()) out.push("Terapeuta");
  return out;
}

export type CallType = "" | "on" | "out";

export interface AccountingFieldValues {
  therapist: string;
  therapist2: string;
  call_type: CallType | string;
  call_place: string;
}

/**
 * Terapeuta, 2º terapeuta (couples), On / Out call and its place — plus a
 * line saying whether this goes to Contabilidad by itself.
 */
export function AccountingFields({
  values, onChange, suggestions, idPrefix, missing, offsitePlace, dense,
}: {
  values: AccountingFieldValues;
  onChange: (key: keyof AccountingFieldValues, value: string) => void;
  suggestions: AccountingSuggestions;
  idPrefix: string;
  missing: string[];
  /** The entry's off-site place, offered when Out call is picked. */
  offsitePlace?: string;
  dense?: boolean;
}) {
  const h = dense ? "h-9 text-sm" : "h-9";
  const sp = dense ? "space-y-1.5" : "space-y-1";
  return (
    <>
      <div className="grid grid-cols-2 gap-2 items-end">
        <div className={sp}>
          <Label className="text-xs">Terapeuta</Label>
          <Input value={values.therapist} onChange={(e) => onChange("therapist", e.target.value)} placeholder="ej. Jenny" list={`${idPrefix}-therapists`} className={h} />
        </div>
        <div className={sp}>
          <Label className="text-xs">2º terapeuta <span className="text-muted-foreground">(parejas)</span></Label>
          <Input value={values.therapist2} onChange={(e) => onChange("therapist2", e.target.value)} placeholder="solo si son 2" list={`${idPrefix}-therapists`} className={h} />
        </div>
        <div className={sp}>
          <Label className="text-xs">On / Out Call</Label>
          <select
            value={values.call_type}
            onChange={(e) => {
              const v = e.target.value;
              onChange("call_type", v);
              if (v === "out" && !values.call_place.trim() && offsitePlace?.trim()) onChange("call_place", offsitePlace.trim());
            }}
            className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
          >
            <option value="">—</option>
            <option value="on">On call (en HWC)</option>
            <option value="out">Out call (villa / hotel)</option>
          </select>
        </div>
        {values.call_type === "out" ? (
          <div className={sp}>
            <Label className="text-xs">Lugar</Label>
            <Input value={values.call_place} onChange={(e) => onChange("call_place", e.target.value)} placeholder="ej. Casa Fantastica" list={`${idPrefix}-locations`} className={h} />
          </div>
        ) : <div />}
      </div>
      <datalist id={`${idPrefix}-therapists`}>{suggestions.therapist.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id={`${idPrefix}-locations`}>{suggestions.location.map((v) => <option key={v} value={v} />)}</datalist>
      {missing.length === 0 ? (
        <p className="flex items-start gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5 mt-px shrink-0" />
          <span>Pasa sola a <strong>Contabilidad</strong>{values.therapist2.trim() ? " (2 filas, el monto dividido entre 2)" : ""}. Si cambias algo aquí, se actualiza allá.</span>
        </p>
      ) : (
        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <Info className="h-3.5 w-3.5 mt-px shrink-0" />
          <span>Para pasar sola a Contabilidad falta: {missing.join(", ")}.</span>
        </p>
      )}
    </>
  );
}
