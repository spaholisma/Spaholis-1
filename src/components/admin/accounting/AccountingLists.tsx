import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { type AccountingEntry, type AccountingListItem, type ListKind, normName, parseNumber } from "@/lib/accounting";

// Contabilidad → Listas: the dropdowns of the sheet (the Excel kept them in its
// "Treatments", "Staff", "Vendor Commissions", "puntos terap" and "Purchases"
// sheets). Add, rename, change and remove; the rows already written keep what
// they say.

const sb = supabase as any;

const KINDS: { id: ListKind; label: string; help: string; column?: keyof AccountingEntry }[] = [
  { id: "treatment", label: "Tratamientos", help: "Con su categoría (para el reporte de tratamientos) y los puntos del terapeuta.", column: "treatment" },
  { id: "therapist", label: "Terapeutas", help: "Los nombres del dropdown Terapeuta.", column: "therapist" },
  { id: "hotel", label: "Hoteles y villas", help: "Con el % de comisión de siempre: se pone solo al elegir el hotel en una fila.", column: "hotel" },
  { id: "pct", label: "Comisiones %", help: "Los % del dropdown de comisión (terapeuta y hotel)." },
  { id: "tl", label: "T/L", help: "Tourist / Local." },
  { id: "purchase_category", label: "Categorías de compras", help: "Para las compras del mes (gastos)." },
];

export function AccountingLists({
  lists, setLists, entries, year,
}: {
  lists: AccountingListItem[];
  setLists: React.Dispatch<React.SetStateAction<AccountingListItem[]>>;
  entries: AccountingEntry[];
  year: number | null;
}) {
  const [kind, setKind] = useState<ListKind>("treatment");
  const [query, setQuery] = useState("");
  const meta = KINDS.find((k) => k.id === kind)!;

  const items = useMemo(() => {
    const q = normName(query);
    return lists
      .filter((l) => l.kind === kind && (!q || normName(l.label).includes(q) || normName(l.category).includes(q)))
      .sort((a, b) => (kind === "pct" ? Number(a.label) - Number(b.label) : a.sort_order - b.sort_order || a.label.localeCompare(b.label)));
  }, [lists, kind, query]);

  // How many rows of this year use each name (to know what is safe to remove).
  const usage = useMemo(() => {
    const m = new Map<string, number>();
    if (!meta.column) return m;
    for (const e of entries) {
      const k = normName(e[meta.column] as string | null);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [entries, meta.column]);

  const categories = useMemo(
    () => Array.from(new Set(lists.filter((l) => l.kind === "treatment" && l.category).map((l) => l.category as string))).sort(),
    [lists],
  );

  // Names used in the rows that are not on the list (typos, or new ones to add).
  const notOnList = useMemo(() => {
    if (!meta.column) return [] as { name: string; count: number }[];
    const known = new Set(lists.filter((l) => l.kind === kind).map((l) => normName(l.label)));
    const counts = new Map<string, { name: string; count: number }>();
    for (const e of entries) {
      const raw = ((e[meta.column] as string | null) ?? "").trim();
      const k = normName(raw);
      if (!k || known.has(k) || (kind === "hotel" && k === "n/a")) continue;
      const c = counts.get(k) ?? { name: raw, count: 0 };
      c.count += 1;
      counts.set(k, c);
    }
    return [...counts.values()].sort((a, b) => b.count - a.count);
  }, [entries, lists, kind, meta.column]);

  const save = async (id: string, patch: Partial<AccountingListItem>) => {
    const before = lists.find((l) => l.id === id);
    setLists((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    const { error } = await sb.from("accounting_lists").update(patch).eq("id", id);
    if (error) {
      toast.error(error.code === "23505" ? "Ese nombre ya está en la lista" : error.message);
      if (before) setLists((prev) => prev.map((l) => (l.id === id ? before : l)));
    }
  };

  const add = async (label: string) => {
    const name = label.trim();
    if (!name) return;
    if (lists.some((l) => l.kind === kind && normName(l.label) === normName(name))) { toast.error("Ya está en la lista"); return; }
    const sort = Math.max(0, ...lists.filter((l) => l.kind === kind).map((l) => l.sort_order)) + 1;
    const { data, error } = await sb.from("accounting_lists").insert({ kind, label: name, sort_order: sort }).select("*").single();
    if (error) { toast.error(error.message); return; }
    setLists((prev) => [...prev, data as AccountingListItem]);
    toast.success(`“${name}” agregado`);
  };

  const remove = async (item: AccountingListItem) => {
    const used = usage.get(normName(item.label)) ?? 0;
    if (!confirm(`¿Quitar “${item.label}” de la lista?${used ? `\n\nHay ${used} fila(s) de ${year} con este nombre: se quedan como están.` : ""}`)) return;
    const { error } = await sb.from("accounting_lists").delete().eq("id", item.id);
    if (error) { toast.error(error.message); return; }
    setLists((prev) => prev.filter((l) => l.id !== item.id));
  };

  const [newLabel, setNewLabel] = useState("");
  const th = "px-3 py-2 text-left font-semibold border-b border-r border-border last:border-r-0 whitespace-nowrap";
  const td = "px-2 py-1 border-b border-r border-border/70 last:border-r-0";
  const cell = "h-8 w-full rounded-md bg-transparent px-2 text-sm border border-transparent hover:border-border focus:border-ring focus:bg-background focus:outline-none";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            onClick={() => { setKind(k.id); setQuery(""); }}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-body font-medium border transition-colors",
              kind === k.id ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {k.label} <span className="opacity-60">({lists.filter((l) => l.kind === k.id).length})</span>
          </button>
        ))}
      </div>
      <p className="font-body text-xs text-muted-foreground">
        {meta.help} Cambiar o quitar un nombre de la lista no cambia las filas ya escritas.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <form
          className="flex gap-2"
          onSubmit={(e) => { e.preventDefault(); add(newLabel); setNewLabel(""); }}
        >
          <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder={kind === "pct" ? "Nuevo %, ej. 30" : "Nuevo nombre…"} className="w-64" />
          <Button type="submit" disabled={!newLabel.trim()}><Plus className="h-4 w-4 mr-1" /> Agregar</Button>
        </form>
        <div className="relative ml-auto w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar…" className="pl-8" />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card max-h-[60vh] overflow-y-auto">
        <table className="w-full border-separate border-spacing-0 font-body text-sm">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className={th}>{kind === "pct" ? "%" : "Nombre"}</th>
              {kind === "treatment" && <th className={th}>Categoría</th>}
              {kind === "treatment" && <th className={cn(th, "text-right")}>Puntos</th>}
              {kind === "hotel" && <th className={cn(th, "text-right")}>% de siempre</th>}
              {meta.column && <th className={cn(th, "text-right")}>Filas en {year ?? ""}</th>}
              <th className={cn(th, "w-12")} />
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <ListRow
                key={it.id}
                item={it}
                zebra={i % 2 === 1}
                kind={kind}
                categories={categories}
                used={meta.column ? usage.get(normName(it.label)) ?? 0 : null}
                onSave={(patch) => save(it.id, patch)}
                onRemove={() => remove(it)}
                td={td}
                cell={cell}
              />
            ))}
            {items.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Nada en esta lista{query ? " con esa búsqueda" : ""}.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <datalist id="acc-list-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>

      {notOnList.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 space-y-2">
          <p className="font-body text-sm font-medium text-foreground">
            Escritos en las filas de {year} pero no están en la lista ({notOnList.length})
          </p>
          <p className="font-body text-xs text-muted-foreground">
            Pueden ser nombres nuevos (agrégalos) o el mismo nombre escrito distinto (corrígelo en la fila).
          </p>
          <div className="flex flex-wrap gap-2">
            {notOnList.slice(0, 60).map((n) => (
              <button
                key={n.name}
                type="button"
                onClick={() => add(n.name)}
                title="Agregar a la lista"
                className="rounded-full border border-border bg-background px-3 py-1 text-xs font-body hover:border-foreground"
              >
                + {n.name} <span className="text-muted-foreground">({n.count})</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ListRow({
  item, zebra, kind, used, onSave, onRemove, td, cell,
}: {
  item: AccountingListItem;
  zebra: boolean;
  kind: ListKind;
  categories: string[];
  used: number | null;
  onSave: (patch: Partial<AccountingListItem>) => void;
  onRemove: () => void;
  td: string;
  cell: string;
}) {
  const [label, setLabel] = useState(item.label);
  const [category, setCategory] = useState(item.category ?? "");
  const [points, setPoints] = useState(item.points == null ? "" : String(item.points));
  const [pct, setPct] = useState(item.default_pct == null ? "" : String(item.default_pct));
  const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") e.currentTarget.blur(); };

  return (
    <tr className={zebra ? "bg-muted/25" : ""}>
      <td className={td}>
        <input
          className={cell}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={blurOnEnter}
          onBlur={() => {
            const v = label.trim();
            if (!v) { setLabel(item.label); return; }
            if (v !== item.label) onSave({ label: v });
          }}
          aria-label="Nombre"
        />
      </td>
      {kind === "treatment" && (
        <td className={td}>
          <input
            className={cell}
            list="acc-list-categories"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            onKeyDown={blurOnEnter}
            onBlur={() => { const v = category.trim() || null; if (v !== (item.category ?? null)) onSave({ category: v }); }}
            aria-label="Categoría"
            placeholder="Sin categoría"
          />
        </td>
      )}
      {kind === "treatment" && (
        <td className={cn(td, "w-24")}>
          <input
            className={cn(cell, "text-right")}
            inputMode="decimal"
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            onKeyDown={blurOnEnter}
            onBlur={() => {
              const n = parseNumber(points.replace(",", "."));
              if (n !== (item.points == null ? null : Number(item.points))) onSave({ points: n });
            }}
            aria-label="Puntos"
            placeholder="—"
          />
        </td>
      )}
      {kind === "hotel" && (
        <td className={cn(td, "w-28")}>
          <input
            className={cn(cell, "text-right")}
            inputMode="decimal"
            value={pct}
            onChange={(e) => setPct(e.target.value)}
            onKeyDown={blurOnEnter}
            onBlur={() => {
              const n = parseNumber(pct);
              const v = n == null ? null : Math.min(100, Math.max(0, n));
              if (v !== (item.default_pct == null ? null : Number(item.default_pct))) onSave({ default_pct: v });
            }}
            aria-label="% de siempre"
            placeholder="—"
          />
        </td>
      )}
      {used !== null && <td className={cn(td, "text-right tabular-nums text-muted-foreground w-28")}>{used || "—"}</td>}
      <td className={cn(td, "w-12 text-center")}>
        <button type="button" onClick={onRemove} title="Quitar de la lista" className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-muted">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}
