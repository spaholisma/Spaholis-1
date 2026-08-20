import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ChevronUp, ChevronDown, Trash2, Plus, GripVertical } from "lucide-react";

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

  const load = useCallback(async () => {
    const { data, error } = await sb.from("nav_items").select("*").order("sort_order");
    if (error) { toast.error(error.message); return; }
    setRows((data as NavRow[]) ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const tops = rows.filter((r) => !r.parent_id).sort((a, b) => a.sort_order - b.sort_order);
  const childrenOf = (id: string) => rows.filter((r) => r.parent_id === id).sort((a, b) => a.sort_order - b.sort_order);

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

  const Fields = ({ r, cta }: { r: NavRow; cta?: boolean }) => (
    <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
      <Input defaultValue={r.label_en} placeholder="Label (English)" className="h-9"
        onBlur={(e) => e.target.value !== r.label_en && saveField(r.id, { label_en: e.target.value })} />
      <Input defaultValue={r.label_es ?? ""} placeholder="Etiqueta (Español)" className="h-9"
        onBlur={(e) => e.target.value !== (r.label_es ?? "") && saveField(r.id, { label_es: e.target.value })} />
      <Input defaultValue={r.href} placeholder="/link" className="h-9 font-mono text-xs"
        onBlur={(e) => e.target.value !== r.href && saveField(r.id, { href: e.target.value })} />
    </div>
  );

  const RowControls = ({ r, siblings, cta }: { r: NavRow; siblings: NavRow[]; cta?: boolean }) => (
    <div className="flex items-center gap-1 shrink-0">
      <div className="flex flex-col">
        <button className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={siblings[0]?.id === r.id} onClick={() => move(r, "up", siblings)} title="Move up"><ChevronUp className="h-4 w-4" /></button>
        <button className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={siblings[siblings.length - 1]?.id === r.id} onClick={() => move(r, "down", siblings)} title="Move down"><ChevronDown className="h-4 w-4" /></button>
      </div>
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground" title="Show in menu">
        <Switch checked={r.is_visible} onCheckedChange={(v) => saveField(r.id, { is_visible: v })} />
      </label>
      {cta && (
        <label className="flex items-center gap-1 text-[10px] text-muted-foreground" title="Highlighted button (like Book Now)">
          <Switch checked={r.is_cta} onCheckedChange={(v) => saveField(r.id, { is_cta: v })} /> CTA
        </label>
      )}
      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => del(r)}><Trash2 className="h-3.5 w-3.5" /></Button>
    </div>
  );

  if (loading) return <p className="text-sm text-muted-foreground">Loading menu…</p>;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-heading font-bold text-foreground">Navigation menu</h2>
          <p className="text-sm text-muted-foreground">Reorder, rename, hide or add the pages that appear in the top menu. Changes are live.</p>
        </div>
        <Button size="sm" onClick={addTop}><Plus className="h-4 w-4 mr-1" /> Add menu item</Button>
      </div>

      <div className="space-y-3">
        {tops.map((t) => {
          const kids = childrenOf(t.id);
          return (
            <div key={t.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start gap-2">
                <GripVertical className="h-4 w-4 text-muted-foreground mt-2.5 shrink-0" />
                <Fields r={t} cta />
                <RowControls r={t} siblings={tops} cta />
              </div>

              {/* Sub-items */}
              <div className="mt-3 ml-6 pl-4 border-l border-border space-y-2">
                {kids.map((k) => (
                  <div key={k.id} className="flex items-start gap-2">
                    <Fields r={k} />
                    <RowControls r={k} siblings={kids} />
                  </div>
                ))}
                <Button variant="outline" size="sm" className="h-8" onClick={() => addChild(t)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add sub-item under “{t.label_en}”
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Tip: the <strong>link</strong> is a path on your site, e.g. <code>/classes</code>, <code>/integrative-kinesiology-course</code>, or a deep link like <code>/treatments-therapies?category=Holistic Therapy</code>. Turn off the switch to hide an item without deleting it.
      </p>
    </div>
  );
}
