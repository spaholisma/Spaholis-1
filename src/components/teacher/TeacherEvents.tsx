import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  CalendarDays, Camera, Clock, ExternalLink, Loader2, MapPin, Pencil, Plus, Sparkles, Trash2, Users, X,
} from "lucide-react";
import { formatSpaDate, formatSpaTime } from "@/lib/businessHours";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useConfirm } from "@/hooks/useConfirm";

const sb = supabase as any;
const BUCKET = "class-images";
const MAX_BYTES = 5 * 1024 * 1024;

interface EventRow {
  id: string; title: string; description: string | null; image_url: string | null;
  price: number | null; price_label: string | null; max_capacity: number | null;
  duration_minutes: number | null; location: string | null; is_active: boolean | null;
}
interface DateRow {
  id: string; class_id: string; start_time: string; is_cancelled: boolean | null; booked: number;
}

type Draft = {
  id: string | null; title: string; description: string; image_url: string;
  price: string; price_label: string; max_capacity: string; duration_minutes: string;
  location: string; is_active: boolean;
  /** The first date, when creating. */
  date: string; time: string;
};

const blank = (): Draft => ({
  id: null, title: "", description: "", image_url: "", price: "", price_label: "",
  max_capacity: "12", duration_minutes: "90", location: "Holis Wellness Center", is_active: true,
  date: "", time: "",
});

/** "2027-04-01" + "09:30" in Costa Rica time (UTC-6 all year). */
export const spaInstant = (date: string, time: string) => new Date(`${date}T${time}:00-06:00`);

/** What she has to fill before the event can be saved. */
export function eventProblem(d: Draft, isNew: boolean): string | null {
  if (d.title.trim().length < 3) return "Give the event a title";
  const price = d.price.trim() === "" ? 0 : Number(d.price);
  if (!Number.isFinite(price) || price < 0) return "The price must be a number (0 if it is free)";
  const cap = Number(d.max_capacity);
  if (!Number.isInteger(cap) || cap < 1 || cap > 200) return "Spots must be between 1 and 200";
  const dur = Number(d.duration_minutes);
  if (!Number.isInteger(dur) || dur < 15 || dur > 720) return "The duration must be between 15 and 720 minutes";
  if (isNew) {
    if (!d.date || !d.time) return "Pick the date and time of the event";
    if (spaInstant(d.date, d.time).getTime() <= Date.now()) return "The date has to be in the future";
  }
  return null;
}

const money = (e: Pick<EventRow, "price" | "price_label">) => {
  const p = Number(e.price ?? 0);
  if (p > 0) return `$${p.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  return e.price_label?.trim() || "Free";
};

/**
 * Her own events — a Wellness Sunday, a sound bath, a workshop.
 *
 * Each one shows on the Classes page under "Workshops & Special Events", and is
 * booked and paid to her like her classes. She creates, edits, switches off and
 * deletes them here; their dates are ordinary sessions on the calendar.
 */
export function TeacherEvents({ teacherId, teacherName }: { teacherId: string; teacherName: string }) {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [dates, setDates] = useState<DateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newDate, setNewDate] = useState({ date: "", time: "" });
  const fileRef = useRef<HTMLInputElement>(null);
  const { confirm, confirmDialog } = useConfirm();

  const load = useCallback(async () => {
    const { data: ev, error } = await sb.from("classes")
      .select("id, title, description, image_url, price, price_label, max_capacity, duration_minutes, location, is_active")
      .eq("teacher_id", teacherId).order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    const list = (ev ?? []) as EventRow[];
    setEvents(list);
    if (list.length) {
      const { data: s } = await sb.from("class_schedule")
        .select("id, class_id, start_time, is_cancelled")
        .in("class_id", list.map((e) => e.id)).order("start_time");
      const sessions = (s ?? []) as Omit<DateRow, "booked">[];
      let counts: Record<string, number> = {};
      if (sessions.length) {
        const { data: b } = await sb.from("class_bookings")
          .select("schedule_id, status").in("schedule_id", sessions.map((x) => x.id));
        counts = ((b ?? []) as { schedule_id: string; status: string }[])
          .filter((x) => x.status !== "cancelled")
          .reduce((m, x) => ({ ...m, [x.schedule_id]: (m[x.schedule_id] ?? 0) + 1 }), {} as Record<string, number>);
      }
      setDates(sessions.map((x) => ({ ...x, booked: counts[x.id] ?? 0 })));
    } else {
      setDates([]);
    }
    setLoading(false);
  }, [teacherId]);

  useEffect(() => { load(); }, [load]);

  const datesOf = useMemo(() => {
    const now = Date.now();
    const m = new Map<string, { upcoming: DateRow[]; past: number }>();
    for (const e of events) m.set(e.id, { upcoming: [], past: 0 });
    for (const d of dates) {
      const slot = m.get(d.class_id);
      if (!slot || d.is_cancelled) continue;
      if (new Date(d.start_time).getTime() >= now) slot.upcoming.push(d);
      else slot.past += 1;
    }
    return m;
  }, [events, dates]);

  const open = (e?: EventRow) => {
    setNewDate({ date: "", time: "" });
    setDraft(e ? {
      id: e.id, title: e.title, description: e.description ?? "", image_url: e.image_url ?? "",
      price: e.price ? String(Number(e.price)) : "", price_label: e.price_label ?? "",
      max_capacity: String(e.max_capacity ?? 12), duration_minutes: String(e.duration_minutes ?? 90),
      location: e.location ?? "Holis Wellness Center", is_active: e.is_active !== false, date: "", time: "",
    } : blank());
  };

  const addSession = async (classId: string, date: string, time: string, minutes: number) => {
    const start = spaInstant(date, time);
    const end = new Date(start.getTime() + minutes * 60000);
    const { error } = await sb.from("class_schedule").insert({
      class_id: classId, start_time: start.toISOString(), end_time: end.toISOString(), instructor: teacherName,
    });
    if (error) { toast.error(error.message); return false; }
    return true;
  };

  const save = async () => {
    if (!draft) return;
    const isNew = !draft.id;
    const problem = eventProblem(draft, isNew);
    if (problem) { toast.error(problem); return; }
    setSaving(true);
    const { data: id, error } = await sb.rpc("teacher_save_event", {
      _id: draft.id, _title: draft.title, _description: draft.description, _image_url: draft.image_url || null,
      _price: draft.price.trim() === "" ? 0 : Number(draft.price), _price_label: draft.price_label,
      _max_capacity: Number(draft.max_capacity), _duration_minutes: Number(draft.duration_minutes),
      _location: draft.location, _is_active: draft.is_active,
    });
    if (error) { toast.error(error.message); setSaving(false); return; }
    if (isNew && id) await addSession(id as string, draft.date, draft.time, Number(draft.duration_minutes));
    toast.success(isNew ? "Event created" : "Event saved");
    setSaving(false);
    setDraft(null);
    load();
  };

  const toggle = async (e: EventRow, on: boolean) => {
    setEvents((list) => list.map((x) => (x.id === e.id ? { ...x, is_active: on } : x)));
    const { error } = await sb.rpc("teacher_set_event_active", { _id: e.id, _active: on });
    if (error) { toast.error(error.message); load(); return; }
    toast.success(on ? `"${e.title}" is on the website` : `"${e.title}" is hidden from the website`);
  };

  const remove = async (e: EventRow) => {
    if (!(await confirm({
      title: `Delete "${e.title}"?`,
      description: "The event and its dates are removed. If someone already booked it, switch it off instead.",
      confirmLabel: "Delete", destructive: true,
    }))) return;
    const { error } = await sb.rpc("teacher_delete_event", { _id: e.id });
    if (error) toast.error(error.message); else { toast.success("Event deleted"); load(); }
  };

  const removeDate = async (d: DateRow) => {
    if (d.booked > 0) { toast.error("Someone booked this date — it can't be removed"); return; }
    const { error } = await sb.from("class_schedule").delete().eq("id", d.id);
    if (error) toast.error(error.message); else { toast.success("Date removed"); load(); }
  };

  const upload = async (file: File) => {
    if (!draft) return;
    if (!file.type.startsWith("image/")) { toast.error("Pick an image file"); return; }
    if (file.size > MAX_BYTES) { toast.error("That photo is over 5MB — try a smaller one"); return; }
    setUploading(true);
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `teachers/event-${teacherId}-${Date.now()}.${ext}`;
    const { error } = await sb.storage.from(BUCKET).upload(path, file, { upsert: true });
    if (error) { toast.error(error.message); setUploading(false); return; }
    const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
    setDraft({ ...draft, image_url: pub?.publicUrl as string });
    setUploading(false);
  };

  const editingDates = draft?.id ? datesOf.get(draft.id) : undefined;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <h3 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
          <Sparkles className="h-4 w-4" /> My events ({events.length})
        </h3>
        <Button size="sm" onClick={() => open()}>
          <Plus className="h-4 w-4 mr-1" /> New event
        </Button>
      </div>
      <p className="font-body text-xs text-muted-foreground mb-4">
        Workshops, sound baths, a Wellness Sunday… They show on the Classes page under
        "Workshops & Special Events", and your students book and pay you like for your classes.
      </p>

      {loading ? (
        <div className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
      ) : events.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-12 text-center">
          <Sparkles className="h-6 w-6 mx-auto text-spa-sage mb-2" />
          <p className="font-body text-sm text-muted-foreground mb-4">No events yet — create your first one.</p>
          <Button size="sm" onClick={() => open()}><Plus className="h-4 w-4 mr-1" /> New event</Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {events.map((e) => {
            const d = datesOf.get(e.id) ?? { upcoming: [], past: 0 };
            const next = d.upcoming[0];
            const on = e.is_active !== false;
            return (
              <div key={e.id} className={cn("overflow-hidden rounded-2xl border border-border bg-card transition-opacity", !on && "opacity-70")}>
                <div className="relative aspect-[16/9] overflow-hidden">
                  <img src={e.image_url || "/class-placeholder.jpg"} alt="" className="h-full w-full object-cover" />
                  <span className={cn(
                    "absolute left-3 top-3 rounded-full px-2.5 py-1 font-body text-[11px] font-semibold",
                    on ? "bg-white/90 text-foreground" : "bg-black/60 text-white",
                  )}>
                    {on ? "On the website" : "Hidden"}
                  </span>
                  <span className="absolute right-3 top-3 rounded-full bg-white/90 px-2.5 py-1 font-heading text-sm font-semibold text-foreground">
                    {money(e)}
                  </span>
                </div>
                <div className="p-4 space-y-2">
                  <p className="font-heading text-base font-medium text-foreground">{e.title}</p>
                  <p className="font-body text-xs text-muted-foreground flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {next
                      ? <>Next: {formatSpaDate(next.start_time)} · {formatSpaTime(next.start_time)}{d.upcoming.length > 1 ? ` · +${d.upcoming.length - 1} more` : ""}</>
                      : "No upcoming date — add one"}
                  </p>
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <label className="flex items-center gap-2 font-body text-xs text-muted-foreground">
                      <Switch checked={on} onCheckedChange={(v) => toggle(e, v)} aria-label={`Show ${e.title} on the website`} />
                      {on ? "On" : "Off"}
                    </label>
                    <div className="flex items-center gap-1.5">
                      {on && next && (
                        <a href={`/classes/${e.id}`} target="_blank" rel="noopener noreferrer"
                          className="rounded-lg p-2 hover:bg-muted" title="View on website">
                          <ExternalLink className="h-4 w-4 text-muted-foreground" />
                        </a>
                      )}
                      <button onClick={() => open(e)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-spa-sage/50 bg-spa-sage/15 px-3 py-1.5 font-body text-xs font-semibold text-foreground hover:bg-spa-sage hover:text-white transition-colors">
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                      <button onClick={() => remove(e)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 px-3 py-1.5 font-body text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / edit */}
      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft?.id ? `Edit: ${draft.title || "event"}` : "New event"}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-3">
              {/* Photo */}
              <div className="relative overflow-hidden rounded-xl border border-border">
                <img src={draft.image_url || "/class-placeholder.jpg"} alt="" className="aspect-[16/9] w-full object-cover" />
                <div className="absolute bottom-2 right-2 flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>
                    {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Camera className="h-4 w-4 mr-1" />}
                    {draft.image_url ? "Change photo" : "Add a photo"}
                  </Button>
                  {draft.image_url && (
                    <Button size="sm" variant="secondary" onClick={() => setDraft({ ...draft, image_url: "" })} aria-label="Remove photo">
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden"
                  onChange={(ev) => { const f = ev.target.files?.[0]; if (f) upload(f); ev.target.value = ""; }} />
              </div>

              <Input placeholder="Event name *" value={draft.title}
                onChange={(ev) => setDraft({ ...draft, title: ev.target.value })} />
              <Textarea rows={5} placeholder="What happens, what to bring, who it's for…" value={draft.description}
                onChange={(ev) => setDraft({ ...draft, description: ev.target.value })} />

              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="font-body text-xs text-muted-foreground">Price (USD, 0 = free)</span>
                  <Input type="number" min="0" step="1" placeholder="0" value={draft.price}
                    onChange={(ev) => setDraft({ ...draft, price: ev.target.value })} />
                </label>
                <label className="space-y-1">
                  <span className="font-body text-xs text-muted-foreground">If free, show as</span>
                  <Input placeholder="Donation-based" value={draft.price_label}
                    onChange={(ev) => setDraft({ ...draft, price_label: ev.target.value })} />
                </label>
                <label className="space-y-1">
                  <span className="font-body text-xs text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" /> Spots</span>
                  <Input type="number" min="1" max="200" value={draft.max_capacity}
                    onChange={(ev) => setDraft({ ...draft, max_capacity: ev.target.value })} />
                </label>
                <label className="space-y-1">
                  <span className="font-body text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Minutes</span>
                  <Input type="number" min="15" max="720" step="15" value={draft.duration_minutes}
                    onChange={(ev) => setDraft({ ...draft, duration_minutes: ev.target.value })} />
                </label>
              </div>
              <label className="space-y-1 block">
                <span className="font-body text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" /> Where</span>
                <Input value={draft.location} onChange={(ev) => setDraft({ ...draft, location: ev.target.value })} />
              </label>

              {/* Dates */}
              {!draft.id ? (
                <div className="rounded-xl border border-spa-sage/40 bg-spa-sage/5 p-3">
                  <p className="font-body text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">When (Costa Rica time) *</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Input type="date" value={draft.date} onChange={(ev) => setDraft({ ...draft, date: ev.target.value })} />
                    <Input type="time" value={draft.time} onChange={(ev) => setDraft({ ...draft, time: ev.target.value })} />
                  </div>
                  <p className="font-body text-[11px] text-muted-foreground mt-1.5">You can add more dates after saving.</p>
                </div>
              ) : (
                <div className="rounded-xl border border-spa-sage/40 bg-spa-sage/5 p-3 space-y-2">
                  <p className="font-body text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dates</p>
                  {(editingDates?.upcoming ?? []).length === 0 && (
                    <p className="font-body text-xs text-muted-foreground">No upcoming dates.</p>
                  )}
                  {(editingDates?.upcoming ?? []).map((d) => (
                    <div key={d.id} className="flex items-center justify-between gap-2 rounded-lg bg-background px-3 py-2">
                      <span className="font-body text-sm text-foreground">
                        {formatSpaDate(d.start_time)} · {formatSpaTime(d.start_time)}
                        {d.booked > 0 && <span className="ml-2 text-xs text-muted-foreground">{d.booked} booked</span>}
                      </span>
                      <button onClick={() => removeDate(d)} disabled={d.booked > 0}
                        className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-40"
                        aria-label="Remove this date">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  {!!editingDates?.past && (
                    <p className="font-body text-[11px] text-muted-foreground">{editingDates.past} past date{editingDates.past === 1 ? "" : "s"}.</p>
                  )}
                  <div className="grid grid-cols-[1fr_1fr_auto] gap-2 pt-1">
                    <Input type="date" value={newDate.date} onChange={(ev) => setNewDate({ ...newDate, date: ev.target.value })} />
                    <Input type="time" value={newDate.time} onChange={(ev) => setNewDate({ ...newDate, time: ev.target.value })} />
                    <Button size="sm" variant="outline"
                      onClick={async () => {
                        if (!newDate.date || !newDate.time) { toast.error("Pick a date and time"); return; }
                        if (spaInstant(newDate.date, newDate.time).getTime() <= Date.now()) { toast.error("The date has to be in the future"); return; }
                        if (await addSession(draft.id!, newDate.date, newDate.time, Number(draft.duration_minutes) || 60)) {
                          toast.success("Date added"); setNewDate({ date: "", time: "" }); load();
                        }
                      }}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              <label className="flex items-center gap-2 font-body text-sm text-foreground">
                <Switch checked={draft.is_active} onCheckedChange={(v) => setDraft({ ...draft, is_active: v })} />
                Show it on the website
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setDraft(null)} disabled={saving}>Cancel</Button>
                <Button onClick={save} disabled={saving || uploading}>
                  {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  {draft.id ? "Save" : "Create event"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {confirmDialog}
    </Card>
  );
}
