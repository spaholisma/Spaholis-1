import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ChevronUp, ChevronDown, Trash2, Plus, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

type NavRow = {
  id: string;
  parent_id: string | null;
  label_en: string;
  label_es: string | null;
  href: string;
  sort_order: number;
  is_visible: boolean;
  is_cta: boolean;
};

const sb = supabase as any;

export function AdminNavManager() {
  const [rows, setRows] = useState<NavRow[]>([]);
  const [loading, setLoading] = useState(true);
  const draggedRef = useRef<NavRow | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null); // row being hovered as drop target

  const load = useCallback(async () => {
    const { data, error } = await sb.from("nav_items").select("*").order("sort_order");
    if (error) { toast.error(error.message); return; }
    setRows((data as NavRow[]) ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const tops = rows.filter((r) => !r.parent_id).sort((a, b) => a.sort_order - b.sort_order);
  const childrenOf = (id: string | null) => rows.filter((r) => (r.parent_id ?? null) === id).sort((a, b) => a.sort_order - b.sort_order);
  const hasChildren = (id: string) => rows.some((r) => r.parent_id === id);

  const saveField = async (id: string, patch: Partial<NavRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const { error } = await sb.from("nav_items").update(patch).eq("id", id);
    if (error) { toast.error(error.message); load(); }
  };

  const move = async (item: NavRow, dir: "up" | "down", siblings: NavRow[]) => {
    const idx = siblings.findIndex((s) => s.id === item.id);
    const j = dir === "up" ? idx - 1 : idx + 1;
    if (j < 0 || j >= siblings.length) return;
    const other = siblings[j];
    await sb.from("nav_items").update({ sort_order: other.sort_order }).eq("id", item.id);
    await sb.from("nav_items").update({ sort_order: item.sort_order }).eq("id", other.id);
    load();
  };

  const del = async (item: NavRow) => {
    const kids = childrenOf(item.id);
    const msg = kids.length
      ? `Delete “${item.label_en}” and its ${kids.length} sub-item(s)?`
      : `Delete “${item.label_en}” from the menu?`;
    if (!confirm(msg)) return;
    const { error } = await sb.from("nav_items").delete().eq("id", item.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Removed from menu");
    load();
  };

  const addTop = async () => {
    const max = Math.max(0, ...tops.map((t) => t.sort_order));
    const { error } = await sb.from("nav_items").insert({ label_en: "New item", label_es: "Nuevo", href: "/", sort_order: max + 1 });
    if (error) { toast.error(error.message); return; }
    load();
  };
  const addChild = async (parent: NavRow) => {
    const kids = childrenOf(parent.id);
    const max = Math.max(0, ...kids.map((k) => k.sort_order));
    const { error } = await sb.from("nav_items").insert({ parent_id: parent.id, label_en: "New sub-item", label_es: "Nuevo", href: "/", sort_order: max + 1 });
    if (error) { toast.error(error.message); return; }
    load();
  };

  /** Move `dragged` into `targetParentId`, positioned before `before` (or last). */
  const reorder = async (dragged: NavRow, targetParentId: string | null, before: NavRow | null) => {
    if (dragged.id === before?.id) return;
    // Can't nest a top-level item that has its own sub-items inside a dropdown.
    if (targetParentId && hasChildren(dragged.id)) {
      toast.error("Move its sub-items out first — a menu with sub-items can't go inside a dropdown.");
      return;
    }
    const sibs = childrenOf(targetParentId).filter((s) => s.id !== dragged.id);
    const idx = before ? sibs.findIndex((s) => s.id === before.id) : sibs.length;
    sibs.splice(idx < 0 ? sibs.length : idx, 0, dragged);
    await Promise.all(
      sibs.map((s, i) => sb.from("nav_items").update({ sort_order: i + 1, parent_id: targetParentId }).eq("id", s.id)),
    );
    load();
  };

  /** Re-parent via the dropdown (append to the end of the chosen list). */
  const moveTo = async (item: NavRow, newParentId: string | null) => {
    if ((item.parent_id ?? null) === newParentId) return;
    await reorder(item, newParentId, null);
    toast.success("Moved");
  };

  // ── Drag handlers ──
  const onDragStart = (r: NavRow) => { draggedRef.current = r; setDragId(r.id); };
  const onDragEnd = () => { draggedRef.current = null; setDragId(null); setOverId(null); };
  const allowDrop = (e: React.DragEvent, r: NavRow) => {
    if (!draggedRef.current || draggedRef.current.id === r.id) return;
    e.preventDefault();
    setOverId(r.id);
  };
  const onDropRow = (e: React.DragEvent, target: NavRow) => {
    e.preventDefault();
    const dragged = draggedRef.current;
    setOverId(null);
    if (!dragged || dragged.id === target.id) return;
    // Drop before `target`, into target's list (this is how you move between categories).
    reorder(dragged, target.parent_id ?? null, target);
  };
  const onDropIntoParent = (e: React.DragEvent, parentId: string | null) => {
    e.preventDefault();
    const dragged = draggedRef.current;
    setOverId(null);
    if (!dragged) return;
    reorder(dragged, parentId, null); // append at the end of this list
  };

  const Fields = ({ r }: { r: NavRow }) => (
    <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
      <Input defaultValue={r.label_en} placeholder="Label (English)" className="h-9"
        onBlur={(e) => e.target.value !== r.label_en && saveField(r.id, { label_en: e.target.value })} />
      <Input defaultValue={r.label_es ?? ""} placeholder="Etiqueta (Español)" className="h-9"
        onBlur={(e) => e.target.value !== (r.label_es ?? "") && saveField(r.id, { label_es: e.target.value })} />
      <Input defaultValue={r.href} placeholder="/link" className="h-9 font-mono text-xs"
        onBlur={(e) => e.target.value !== r.href && saveField(r.id, { href: e.target.value })} />
    </div>
  );

  const Controls = ({ r, siblings, cta }: { r: NavRow; siblings: NavRow[]; cta?: boolean }) => (
    <div className="flex items-center gap-1 shrink-0">
      <div className="flex flex-col">
        <button className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={siblings[0]?.id === r.id} onClick={() => move(r, "up", siblings)} title="Move up"><ChevronUp className="h-4 w-4" /></button>
        <button className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={siblings[siblings.length - 1]?.id === r.id} onClick={() => move(r, "down", siblings)} title="Move down"><ChevronDown className="h-4 w-4" /></button>
      </div>
      {/* Move to another dropdown / top level (reliable alternative to dragging) */}
      <select
        value={r.parent_id ?? ""}
        onChange={(e) => moveTo(r, e.target.value || null)}
        title="Move to…"
        className="h-8 rounded-md border border-border bg-background text-xs px-1.5 max-w-[130px]"
      >
        <option value="">— Top level —</option>
        {tops.filter((t) => t.id !== r.id).map((t) => (
          <option key={t.id} value={t.id}>{t.label_en}</option>
        ))}
      </select>
      <Switch checked={r.is_visible} onCheckedChange={(v) => saveField(r.id, { is_visible: v })} title="Show in menu" />
      {cta && (
        <label className="flex items-center gap-1 text-[10px] text-muted-foreground" title="Highlighted button (like Book Now)">
          <Switch checked={r.is_cta} onCheckedChange={(v) => saveField(r.id, { is_cta: v })} /> CTA
        </label>
      )}
      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => del(r)}><Trash2 className="h-3.5 w-3.5" /></Button>
    </div>
  );

  const dragProps = (r: NavRow) => ({
    draggable: true,
    onDragStart: () => onDragStart(r),
    onDragEnd,
    onDragOver: (e: React.DragEvent) => allowDrop(e, r),
    onDrop: (e: React.DragEvent) => onDropRow(e, r),
  });

  if (loading) return <p className="text-sm text-muted-foreground">Loading menu…</p>;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-heading font-bold text-foreground">Navigation menu</h2>
          <p className="text-sm text-muted-foreground">Drag the ⋮⋮ handle to reorder — or drop an item onto another dropdown to move it there. You can also use the arrows or the “Move to…” selector. Changes are live.</p>
        </div>
        <Button size="sm" onClick={addTop}><Plus className="h-4 w-4 mr-1" /> Add menu item</Button>
      </div>

      <div className="space-y-3">
        {tops.map((t) => {
          const kids = childrenOf(t.id);
          return (
            <div key={t.id} className={cn("rounded-2xl border bg-card p-4", overId === t.id ? "border-spa-sage ring-1 ring-spa-sage/40" : "border-border", dragId === t.id && "opacity-50")}>
              <div className="flex items-start gap-2">
                <span className="mt-2 cursor-grab active:cursor-grabbing text-muted-foreground" {...dragProps(t)} title="Drag to reorder / move">
                  <GripVertical className="h-4 w-4" />
                </span>
                <Fields r={t} />
                <Controls r={t} siblings={tops} cta />
              </div>

              {/* Sub-items — a drop zone that re-parents items into this dropdown */}
              <div
                className="mt-3 ml-6 pl-4 border-l border-border space-y-2 min-h-[8px]"
                onDragOver={(e) => { if (draggedRef.current) { e.preventDefault(); } }}
                onDrop={(e) => onDropIntoParent(e, t.id)}
              >
                {kids.map((k) => (
                  <div key={k.id} className={cn("flex items-start gap-2 rounded-lg", overId === k.id && "ring-1 ring-spa-sage/50", dragId === k.id && "opacity-50")}>
                    <span className="mt-2 cursor-grab active:cursor-grabbing text-muted-foreground" {...dragProps(k)} title="Drag to reorder / move">
                      <GripVertical className="h-4 w-4" />
                    </span>
                    <Fields r={k} />
                    <Controls r={k} siblings={kids} />
                  </div>
                ))}
                <Button variant="outline" size="sm" className="h-8" onClick={() => addChild(t)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add sub-item under “{t.label_en}”
                </Button>
              </div>
            </div>
          );
        })}
        {/* Drop zone to promote an item back to the top level */}
        <div
          className="rounded-xl border border-dashed border-border p-3 text-center text-xs text-muted-foreground"
          onDragOver={(e) => { if (draggedRef.current) e.preventDefault(); }}
          onDrop={(e) => onDropIntoParent(e, null)}
        >
          Drop here to make an item a top-level menu entry
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Tip: the <strong>link</strong> is a path on your site, e.g. <code>/classes</code> or a deep link like <code>/treatments-therapies?category=Holistic Therapy</code>. Turn off the switch to hide an item without deleting it. A top-level item that has sub-items can't be dropped inside another dropdown.
      </p>
    </div>
  );
}
