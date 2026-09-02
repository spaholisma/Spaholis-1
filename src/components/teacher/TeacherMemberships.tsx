import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Trash2, Save, BadgeCheck, Infinity as InfinityIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useConfirm } from "@/hooks/useConfirm";

const sb = supabase as any;
const usd = (n: number) => `$${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Membership {
  id: string; name: string; price: number | null; classes_included: number | null;
  valid_days: number | null; description: string | null; is_active: boolean;
}

const blank = () => ({ name: "", price: "", classes_included: "", valid_days: "", description: "" });

/**
 * Each teacher's own memberships and passes.
 *
 * Deliberately hers alone: the rows are keyed to her teacher id and the row-level
 * rules only ever show her her own, so one teacher changing a price can never
 * touch what another teacher offers. This is not the Holis catalogue.
 */
export function TeacherMemberships({ teacherId }: { teacherId: string }) {
  const [items, setItems] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(blank());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState(blank());
  const seeded = useRef(false);
  const { confirm, confirmDialog } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    let { data, error } = await sb.from("teacher_memberships").select("*")
      .eq("teacher_id", teacherId).order("created_at", { ascending: false });
    if (error) toast.error(error.message);

    // First time in, she starts with copies of the passes Holis already
    // sells, so nobody has to type them out. Once only — deleting one must
    // not bring it back on the next visit.
    if (!error && (data ?? []).length === 0 && !seeded.current) {
      seeded.current = true;
      const { data: n } = await sb.rpc("seed_teacher_memberships");
      if (Number(n) > 0) {
        ({ data } = await sb.from("teacher_memberships").select("*")
          .eq("teacher_id", teacherId).order("created_at", { ascending: false }));
      }
    }
    setItems((data ?? []) as Membership[]);
    setLoading(false);
  }, [teacherId]);
  useEffect(() => { load(); }, [load]);

  const asPayload = (d: ReturnType<typeof blank>) => ({
    name: d.name.trim(),
    price: d.price === "" ? null : Number(d.price),
    classes_included: d.classes_included === "" ? null : Number(d.classes_included),
    valid_days: d.valid_days === "" ? null : Number(d.valid_days),
    description: d.description.trim() || null,
  });

  const add = async () => {
    if (!draft.name.trim()) { toast.error("Give it a name"); return; }
    setSaving(true);
    const { error } = await sb.from("teacher_memberships")
      .insert({ teacher_id: teacherId, ...asPayload(draft), is_active: true });
    if (error) toast.error(error.message);
    else { toast.success(`${draft.name.trim()} added`); setDraft(blank()); load(); }
    setSaving(false);
  };

  const saveEdit = async (id: string) => {
    if (!editDraft.name.trim()) { toast.error("Give it a name"); return; }
    setSaving(true);
    const { error } = await sb.from("teacher_memberships").update(asPayload(editDraft)).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Saved"); setEditingId(null); load(); }
    setSaving(false);
  };

  const toggle = async (m: Membership) => {
    setItems((prev) => prev.map((x) => (x.id === m.id ? { ...x, is_active: !x.is_active } : x)));
    const { error } = await sb.from("teacher_memberships").update({ is_active: !m.is_active }).eq("id", m.id);
    if (error) {
      toast.error(error.message);
      setItems((prev) => prev.map((x) => (x.id === m.id ? { ...x, is_active: m.is_active } : x)));
    }
  };

  const remove = async (m: Membership) => {
    if (!(await confirm({
      title: `Delete "${m.name}"?`,
      description: "It disappears from your list. Students who already bought it are not affected.",
      confirmLabel: "Delete", destructive: true,
    }))) return;
    const { error } = await sb.from("teacher_memberships").delete().eq("id", m.id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); load(); }
  };

  const fields = (d: ReturnType<typeof blank>, set: (v: ReturnType<typeof blank>) => void) => (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-[1.4fr_auto_auto_auto] gap-2">
        <Input placeholder="Name — e.g. Monthly Unlimited" value={d.name} className="h-9"
          onChange={(e) => set({ ...d, name: e.target.value })} />
        <Input type="number" step="0.01" placeholder="Price" value={d.price} className="h-9 w-full sm:w-28"
          onChange={(e) => set({ ...d, price: e.target.value })} />
        <Input type="number" placeholder="Classes" value={d.classes_included} className="h-9 w-full sm:w-28"
          onChange={(e) => set({ ...d, classes_included: e.target.value })} />
        <Input type="number" placeholder="Days" value={d.valid_days} className="h-9 w-full sm:w-24"
          onChange={(e) => set({ ...d, valid_days: e.target.value })} />
      </div>
      <Input placeholder="Anything to remember about it (optional)" value={d.description} className="h-9 mt-2"
        onChange={(e) => set({ ...d, description: e.target.value })} />
    </>
  );

  return (
    <Card className="p-4">
      <h3 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-2">
        <BadgeCheck className="h-4 w-4" /> Your memberships & passes
      </h3>
      <p className="font-body text-xs text-muted-foreground mb-4">
        Yours alone — what you offer your own students and what you charge for it. It starts as a
        copy of the passes Holis sells; change the prices, add your own, remove what you do not use.
        Another teacher's list is separate from this one, even when a pass has the same name.
        Leave <strong>Classes</strong> empty for unlimited, and <strong>Days</strong> empty if it never expires.
      </p>

      <div className="rounded-lg border border-spa-sage/40 bg-spa-sage/5 p-3 mb-4">
        {fields(draft, setDraft)}
        <div className="mt-2 flex justify-end">
          <Button size="sm" onClick={add} disabled={saving || !draft.name.trim()}>
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />} Add
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="py-10 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nothing here yet. Add the passes you sell — a monthly, a 5-class pass, a drop-in price.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((m) => {
            const editing = editingId === m.id;
            return (
              <div key={m.id} className={cn("rounded-lg border border-border p-3", !m.is_active && "opacity-60")}>
                {editing ? (
                  <>
                    {fields(editDraft, setEditDraft)}
                    <div className="mt-2 flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} disabled={saving}>Cancel</Button>
                      <Button size="sm" onClick={() => saveEdit(m.id)} disabled={saving}>
                        {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Save
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-body text-sm font-semibold text-foreground">
                        {m.name}
                        {m.price != null && <span className="ml-2 font-normal text-muted-foreground">{usd(Number(m.price))}</span>}
                      </p>
                      <p className="font-body text-xs text-muted-foreground">
                        {m.classes_included == null
                          ? <><InfinityIcon className="h-3 w-3 inline mr-1" />Unlimited classes</>
                          : `${m.classes_included} class${m.classes_included === 1 ? "" : "es"}`}
                        {m.valid_days != null && ` · valid ${m.valid_days} days`}
                      </p>
                      {m.description && <p className="font-body text-xs text-muted-foreground mt-0.5">{m.description}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => toggle(m)}
                        className={cn("text-xs px-2 py-1 rounded-full font-medium",
                          m.is_active ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                                      : "bg-muted text-muted-foreground")}>
                        {m.is_active ? "Offering" : "Paused"}
                      </button>
                      <button
                        onClick={() => {
                          setEditingId(m.id);
                          setEditDraft({
                            name: m.name,
                            price: m.price == null ? "" : String(m.price),
                            classes_included: m.classes_included == null ? "" : String(m.classes_included),
                            valid_days: m.valid_days == null ? "" : String(m.valid_days),
                            description: m.description ?? "",
                          });
                        }}
                        className="font-body text-[11px] font-semibold uppercase tracking-wider text-primary hover:underline">
                        Edit
                      </button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(m)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {confirmDialog}
    </Card>
  );
}
