import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { formatCRCWithUsd, USD_RATE } from "@/lib/currency";
import { sameName } from "@/lib/privateOfferings";
import { useConfirm } from "@/hooks/useConfirm";

const sb = supabase as any;

interface Row {
  id: string;
  class_id: string | null;
  title: string;
  description: string | null;
  duration_minutes: number | null;
  price_one: number | null;
  price_two: number | null;
  price_group: number | null;
  price_extra: number | null;
  active: boolean;
  sort_order: number;
}

type Draft = {
  id: string | null;
  class_id: string; // "" = something else
  title: string;
  description: string;
  duration: string;
  one: string; two: string; group: string; extra: string;
};

const EMPTY: Draft = { id: null, class_id: "", title: "", description: "", duration: "60", one: "", two: "", group: "", extra: "" };
const toNum = (s: string) => (s.trim() === "" ? null : Number(s));
const money = (n: number | null) => (n == null ? "—" : formatCRCWithUsd(Number(n) * USD_RATE));

/**
 * A teacher's own private classes and her prices. Each one is usually a class
 * she teaches (picked from the schedule), or something she only teaches
 * privately. A price left empty means she does not offer that kind — no
 * groups for aerial, say. The website shows them on her class pages, and the
 * price of every request is worked out from what is saved here.
 */
export function TeacherPrivateOfferingsEditor({ teacherId, teacherName }: { teacherId: string; teacherName: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [myClasses, setMyClasses] = useState<{ id: string; title: string }[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const { confirm, confirmDialog } = useConfirm();

  const load = useCallback(async () => {
    const { data, error } = await sb.from("teacher_private_offerings")
      .select("*").eq("teacher_id", teacherId).order("sort_order").order("created_at");
    if (error) { toast.error(error.message); setRows([]); return; }
    setRows((data ?? []) as Row[]);
  }, [teacherId]);

  useEffect(() => { load(); }, [load]);

  // The classes she teaches — the last three months and what is coming.
  useEffect(() => {
    const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
    sb.from("class_schedule")
      .select("class_id, instructor, classes(id, title, instructor)")
      .gte("start_time", since)
      .then(({ data }: any) => {
        const seen = new Map<string, string>();
        for (const s of (data ?? []) as any[]) {
          const who = (s.instructor || s.classes?.instructor || "").trim();
          if (s.classes?.id && sameName(who, teacherName)) seen.set(s.classes.id, s.classes.title);
        }
        setMyClasses([...seen.entries()].map(([id, title]) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title)));
      });
  }, [teacherName]);

  const edit = (r: Row) => setDraft({
    id: r.id, class_id: r.class_id ?? "", title: r.title, description: r.description ?? "",
    duration: r.duration_minutes ? String(r.duration_minutes) : "",
    one: r.price_one == null ? "" : String(r.price_one),
    two: r.price_two == null ? "" : String(r.price_two),
    group: r.price_group == null ? "" : String(r.price_group),
    extra: r.price_extra == null ? "" : String(r.price_extra),
  });

  const pickClass = (id: string) => {
    if (!draft) return;
    const cls = myClasses.find((c) => c.id === id);
    setDraft({ ...draft, class_id: id, title: cls && (!draft.title.trim() || myClasses.some((c) => c.title === draft.title)) ? cls.title : draft.title });
  };

  const save = async () => {
    if (!draft) return;
    const title = draft.title.trim();
    const prices = [toNum(draft.one), toNum(draft.two), toNum(draft.group), toNum(draft.extra)];
    if (title.length < 2) { toast.error("Give it a name"); return; }
    if (prices.some((p) => p != null && (!Number.isFinite(p) || p < 0))) { toast.error("Prices must be numbers of 0 or more"); return; }
    if (prices[0] == null && prices[1] == null && prices[2] == null) {
      toast.error("Set at least one price — for one person, two people or a group"); return;
    }
    const duration = toNum(draft.duration);
    if (duration != null && (!Number.isInteger(duration) || duration < 15 || duration > 480)) {
      toast.error("The length is in minutes, between 15 and 480"); return;
    }
    const payload = {
      teacher_id: teacherId,
      class_id: draft.class_id || null,
      title,
      description: draft.description.trim() || null,
      duration_minutes: duration,
      price_one: prices[0], price_two: prices[1], price_group: prices[2],
      // Extra people only mean something with a group price.
      price_extra: prices[2] == null ? null : prices[3],
    };
    setSaving(true);
    const { error } = draft.id
      ? await sb.from("teacher_private_offerings").update(payload).eq("id", draft.id)
      : await sb.from("teacher_private_offerings").insert({ ...payload, sort_order: rows?.length ?? 0 });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(draft.id ? "Saved" : "Private class added — it shows on your class pages now");
    setDraft(null);
    load();
  };

  const setActive = async (r: Row, active: boolean) => {
    const { error } = await sb.from("teacher_private_offerings").update({ active }).eq("id", r.id);
    if (error) toast.error(error.message); else load();
  };

  const remove = async (r: Row) => {
    if (!(await confirm({
      title: `Delete “${r.title}”?`,
      description: "It stops showing on the website. Requests you already received stay in your list.",
      confirmLabel: "Delete", destructive: true,
    }))) return;
    const { error } = await sb.from("teacher_private_offerings").delete().eq("id", r.id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); load(); }
  };

  const priceField = (key: "one" | "two" | "group" | "extra", label: string, disabled = false) => (
    <div>
      <label htmlFor={`price-${key}`} className="font-body text-[11px] text-muted-foreground">{label}</label>
      <Input id={`price-${key}`} type="number" min={0} step="1" inputMode="decimal" placeholder="—"
        value={draft?.[key] ?? ""} disabled={disabled}
        onChange={(e) => draft && setDraft({ ...draft, [key]: e.target.value })} className="h-9" />
    </div>
  );

  return (
    <Card className="p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-heading text-lg text-foreground">Your private classes</h3>
          <p className="font-body text-xs text-muted-foreground">
            What you teach privately and your prices. They show on the website with your classes, and guests pick
            one when they ask for a private class — you agree the day and time with them.
          </p>
        </div>
        {!draft && (
          <Button size="sm" onClick={() => setDraft({ ...EMPTY })}>
            <Plus className="h-4 w-4 mr-1" /> Add a private class
          </Button>
        )}
      </div>

      {rows === null ? (
        <p className="py-4 text-center font-body text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 mr-2 animate-spin" /> Loading…</p>
      ) : rows.length === 0 && !draft ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-center font-body text-sm text-muted-foreground">
          None yet. Add the classes you teach privately and your prices — until then guests can still ask for you, and Holis helps them.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-body text-sm font-medium text-foreground">
                    {r.title}
                    {r.duration_minutes ? <span className="font-normal text-muted-foreground"> · {r.duration_minutes} min</span> : null}
                    {!r.active && <span className="ml-2 text-xs font-normal text-muted-foreground">(hidden)</span>}
                  </p>
                  <p className="font-body text-xs text-muted-foreground">
                    1 person {money(r.price_one)} · 2 people {money(r.price_two)} · group up to 4 {money(r.price_group)}
                    {r.price_group != null && ` · ${r.price_extra != null ? `+${money(r.price_extra)} each extra` : "groups of 4 at most"}`}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Switch checked={r.active} onCheckedChange={(v) => setActive(r, v)} aria-label={`Show ${r.title} on the website`} />
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => edit(r)} aria-label={`Edit ${r.title}`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(r)} aria-label={`Delete ${r.title}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {draft && (
        <div className="rounded-xl border border-spa-sage/40 bg-spa-sage/5 p-4 space-y-3">
          <p className="font-body text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {draft.id ? "Edit private class" : "New private class"}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="private-class" className="font-body text-[11px] text-muted-foreground">Which class</label>
              <select id="private-class" value={draft.class_id} onChange={(e) => pickClass(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 font-body text-sm">
                <option value="">Something else (not on the schedule)</option>
                {myClasses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="private-title" className="font-body text-[11px] text-muted-foreground">Name on the website</label>
              <Input id="private-title" value={draft.title} maxLength={120}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="e.g. Private Aerial Yoga" className="h-9" />
            </div>
          </div>
          <div>
            <label htmlFor="private-description" className="font-body text-[11px] text-muted-foreground">What it is (optional)</label>
            <Textarea id="private-description" rows={2} maxLength={1000} value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder="What you work on, who it suits, what to bring…" />
          </div>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-5">
            <div>
              <label htmlFor="private-duration" className="font-body text-[11px] text-muted-foreground">Length (min)</label>
              <Input id="private-duration" type="number" min={15} max={480} step="5" value={draft.duration}
                onChange={(e) => setDraft({ ...draft, duration: e.target.value })} className="h-9" />
            </div>
            {priceField("one", "1 person ($)")}
            {priceField("two", "2 people ($)")}
            {priceField("group", "Group up to 4 ($)")}
            {priceField("extra", "Each extra ($)", draft.group.trim() === "")}
          </div>
          <p className="font-body text-[11px] text-muted-foreground">
            Leave a price empty if you don't offer it. With no price for extra people, your groups stop at four.
          </p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Save
            </Button>
          </div>
        </div>
      )}
      {confirmDialog}
    </Card>
  );
}
