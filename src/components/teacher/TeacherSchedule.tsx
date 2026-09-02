import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ChevronLeft, ChevronRight, Loader2, Plus, Users, Ban, Undo2, Save, AlertTriangle,
} from "lucide-react";
import {
  format, startOfWeek, endOfWeek, addDays, addWeeks, subWeeks, isSameDay, parseISO,
} from "date-fns";
import { formatSpaTime } from "@/lib/businessHours";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const sb = supabase as any;

export interface SchedSession {
  id: string; class_id: string; start_time: string; end_time: string;
  spots_remaining: number; is_cancelled: boolean; instructor: string | null;
  classes: { title: string | null; instructor: string | null; max_capacity: number | null;
             location: string | null; duration_minutes: number | null } | null;
}
interface ClassType {
  id: string; title: string | null; duration_minutes: number | null; max_capacity: number | null;
}

export const teacherOf = (s: SchedSession) =>
  (s.instructor?.trim() || s.classes?.instructor?.trim() || "").toLowerCase();

/** Costa Rica is UTC-6 all year, so local wall-clock maths needs no DST care. */
const CR_OFFSET_MIN = -360;
/** "2026-09-04" + "17:30" (studio time) -> the matching UTC instant. */
function crToUtc(day: string, time: string): string | null {
  if (!day || !time) return null;
  const [y, m, d] = day.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  if ([y, m, d, hh, mm].some((n) => !Number.isFinite(n))) return null;
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - CR_OFFSET_MIN * 60000).toISOString();
}
/** The studio-time date and time of an instant, for filling the form back in. */
function utcToCr(iso: string): { day: string; time: string } {
  const d = new Date(new Date(iso).getTime() + CR_OFFSET_MIN * 60000);
  return { day: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) };
}

const blankForm = () => ({ id: "", class_id: "", instructor: "", day: "", start: "", minutes: "60" });

/**
 * The whole studio's week, not just hers.
 *
 * A teacher needs to see everybody's classes to pick a slot that does not clash
 * with a colleague's — that is the point of this tab. She can only act on the
 * classes she teaches; the rest are there to be looked at.
 */
export function TeacherSchedule({
  teacherName, onStudents, refreshKey,
}: {
  teacherName: string;
  onStudents: (s: SchedSession) => void;
  refreshKey?: number;
}) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [sessions, setSessions] = useState<SchedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [classTypes, setClassTypes] = useState<ClassType[]>([]);
  const [colleagues, setColleagues] = useState<string[]>([]);
  const [form, setForm] = useState(blankForm());
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const mine = (s: SchedSession) => teacherOf(s) === teacherName.trim().toLowerCase();

  const load = useCallback(async () => {
    setLoading(true);
    const from = format(weekStart, "yyyy-MM-dd");
    const to = format(endOfWeek(weekStart, { weekStartsOn: 1 }), "yyyy-MM-dd");
    const { data } = await sb.from("class_schedule")
      .select("id, class_id, start_time, end_time, spots_remaining, is_cancelled, instructor, classes(title, instructor, max_capacity, location, duration_minutes)")
      .gte("start_time", `${from}T00:00:00Z`).lte("start_time", `${to}T23:59:59Z`)
      .order("start_time");
    setSessions(((data ?? []) as SchedSession[]));
    setLoading(false);
  }, [weekStart]);
  useEffect(() => { load(); }, [load, refreshKey]);

  useEffect(() => {
    sb.from("classes").select("id, title, duration_minutes, max_capacity")
      .eq("is_active", true).order("title")
      .then(({ data }: any) => setClassTypes((data ?? []) as ClassType[]));
    sb.rpc("list_active_teachers").then(({ data }: any) =>
      setColleagues(((data ?? []) as any[]).map((t) => t.display_name)));
  }, []);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  /** Anything already booked into the same hour, so she does not double-book the studio. */
  const clash = useMemo(() => {
    const startIso = crToUtc(form.day, form.start);
    if (!startIso) return null;
    const s = new Date(startIso).getTime();
    const e = s + (Number(form.minutes) || 60) * 60000;
    return sessions.find((x) => {
      if (x.id === form.id || x.is_cancelled) return false;
      const xs = new Date(x.start_time).getTime();
      const xe = new Date(x.end_time).getTime();
      return s < xe && xs < e;
    }) ?? null;
  }, [sessions, form]);

  const openNew = (day?: Date) => {
    const t = classTypes[0];
    setForm({
      id: "",
      class_id: t?.id ?? "",
      instructor: teacherName,
      day: format(day ?? new Date(), "yyyy-MM-dd"),
      start: "09:00",
      minutes: String(t?.duration_minutes ?? 60),
    });
    setFormOpen(true);
  };

  const openEdit = (s: SchedSession) => {
    const { day, time } = utcToCr(s.start_time);
    const mins = Math.max(15, Math.round(
      (new Date(s.end_time).getTime() - new Date(s.start_time).getTime()) / 60000));
    setForm({
      id: s.id, class_id: s.class_id, instructor: s.instructor?.trim() || s.classes?.instructor?.trim() || teacherName,
      day, start: time, minutes: String(mins),
    });
    setFormOpen(true);
  };

  const save = async () => {
    const startIso = crToUtc(form.day, form.start);
    if (!form.class_id || !startIso) { toast.error("Pick a class, a day and a time"); return; }
    if (clash && !confirm(
      `${clash.classes?.title ?? "Another class"} is already on at that time ` +
      `(${formatSpaTime(clash.start_time)}). Add yours anyway?`)) return;

    const endIso = new Date(new Date(startIso).getTime() + (Number(form.minutes) || 60) * 60000).toISOString();
    setSaving(true);
    const payload = {
      class_id: form.class_id,
      start_time: startIso,
      end_time: endIso,
      instructor: form.instructor.trim(),
    };
    const { error } = form.id
      ? await sb.from("class_schedule").update(payload).eq("id", form.id)
      // spots_remaining is set from the class capacity by a database trigger.
      : await sb.from("class_schedule").insert({ ...payload, spots_remaining: 0, is_cancelled: false });
    if (error) toast.error(error.message);
    else {
      toast.success(form.id ? "Class updated" : "Class added");
      setFormOpen(false);
      load();
    }
    setSaving(false);
  };

  const setCancelled = async (s: SchedSession, cancel: boolean) => {
    if (!confirm(cancel
      ? "Cancel this class? Anyone signed up will be emailed."
      : "Put this class back on the schedule?")) return;
    setBusyId(s.id);
    const { error } = await sb.from("class_schedule").update({ is_cancelled: cancel }).eq("id", s.id);
    if (error) toast.error(error.message);
    else { toast.success(cancel ? "Class cancelled" : "Class is back on"); load(); }
    setBusyId(null);
  };

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Button variant="outline" size="icon" onClick={() => setWeekStart(subWeeks(weekStart, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h3 className="font-heading text-base font-semibold min-w-[190px] text-center">
          {format(weekStart, "MMM d")} – {format(endOfWeek(weekStart, { weekStartsOn: 1 }), "MMM d, yyyy")}
        </h3>
        <Button variant="outline" size="icon" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
          This week
        </Button>
        <Button size="sm" className="ml-auto" onClick={() => openNew()}>
          <Plus className="h-4 w-4 mr-1" /> Add a class
        </Button>
      </div>

      <p className="font-body text-xs text-muted-foreground mb-3">
        Every class in the studio this week. Yours are in green — the others are here so you can
        find a free slot without landing on a colleague.
      </p>

      {loading ? (
        <div className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2">
          {days.map((d) => {
            const list = sessions.filter((s) => isSameDay(parseISO(s.start_time), d));
            const today = isSameDay(d, new Date());
            return (
              <div key={d.toISOString()} className={cn(
                "rounded-xl border border-border p-2 min-h-[120px]",
                today && "border-spa-sage/60 bg-spa-sage/5",
              )}>
                <button
                  onClick={() => openNew(d)}
                  className="w-full text-left mb-2 group"
                  title="Add a class on this day"
                >
                  <span className="font-body text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {format(d, "EEE d")}
                  </span>
                  <Plus className="h-3 w-3 inline ml-1 opacity-0 group-hover:opacity-60" />
                </button>
                <div className="space-y-1.5">
                  {list.length === 0 && (
                    <p className="font-body text-[11px] text-muted-foreground/60">—</p>
                  )}
                  {list.map((s) => {
                    const isMine = mine(s);
                    return (
                      <div key={s.id} className={cn(
                        "rounded-lg border p-2",
                        isMine ? "border-spa-sage/50 bg-spa-sage/10" : "border-border bg-muted/40",
                        s.is_cancelled && "opacity-50",
                      )}>
                        <p className={cn(
                          "font-body text-[11px] font-semibold",
                          s.is_cancelled && "line-through",
                        )}>
                          {formatSpaTime(s.start_time)}
                        </p>
                        <p className="font-body text-xs text-foreground leading-tight">
                          {s.classes?.title ?? "Class"}
                        </p>
                        <p className="font-body text-[11px] text-muted-foreground truncate">
                          {s.instructor?.trim() || s.classes?.instructor?.trim() || "No teacher"}
                        </p>
                        {isMine && !s.is_cancelled && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1">
                            <button onClick={() => onStudents(s)}
                              className="font-body text-[10px] font-semibold uppercase tracking-wider text-primary hover:underline">
                              <Users className="h-3 w-3 inline mr-0.5" />Students
                            </button>
                            <button onClick={() => openEdit(s)}
                              className="font-body text-[10px] font-semibold uppercase tracking-wider text-primary hover:underline">
                              Edit
                            </button>
                            <button onClick={() => setCancelled(s, true)} disabled={busyId === s.id}
                              className="font-body text-[10px] font-semibold uppercase tracking-wider text-destructive hover:underline">
                              {busyId === s.id ? "…" : <><Ban className="h-3 w-3 inline mr-0.5" />Cancel</>}
                            </button>
                          </div>
                        )}
                        {isMine && s.is_cancelled && (
                          <button onClick={() => setCancelled(s, false)} disabled={busyId === s.id}
                            className="mt-1.5 font-body text-[10px] font-semibold uppercase tracking-wider text-primary hover:underline">
                            <Undo2 className="h-3 w-3 inline mr-0.5" />Put back
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / edit a class */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit class" : "Add a class"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="font-body text-xs text-muted-foreground">Class</label>
              <select
                value={form.class_id}
                onChange={(e) => {
                  const t = classTypes.find((c) => c.id === e.target.value);
                  setForm({
                    ...form, class_id: e.target.value,
                    minutes: form.id ? form.minutes : String(t?.duration_minutes ?? 60),
                  });
                }}
                disabled={!!form.id}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-60"
              >
                {classTypes.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
              {form.id && (
                <p className="font-body text-[11px] text-muted-foreground mt-1">
                  To run a different class, cancel this one and add it. Ask Holis for a brand new class type.
                </p>
              )}
            </div>

            <div>
              <label className="font-body text-xs text-muted-foreground">Teacher</label>
              <select value={form.instructor}
                onChange={(e) => setForm({ ...form, instructor: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                {(colleagues.length ? colleagues : [teacherName]).map((t) => (
                  <option key={t} value={t}>{t}{t === teacherName ? " (you)" : ""}</option>
                ))}
              </select>
              <p className="font-body text-[11px] text-muted-foreground mt-1">
                Whoever is named here teaches the class — and is the one Holis charges the studio rent to.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="font-body text-xs text-muted-foreground">Day</label>
                <Input type="date" value={form.day} className="h-9"
                  onChange={(e) => setForm({ ...form, day: e.target.value })} />
              </div>
              <div>
                <label className="font-body text-xs text-muted-foreground">Time</label>
                <Input type="time" value={form.start} className="h-9"
                  onChange={(e) => setForm({ ...form, start: e.target.value })} />
              </div>
            </div>

            <div>
              <label className="font-body text-xs text-muted-foreground">Length (minutes)</label>
              <Input type="number" min={15} step={15} value={form.minutes} className="h-9"
                onChange={(e) => setForm({ ...form, minutes: e.target.value })} />
            </div>

            {clash && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                <p className="font-body text-xs text-amber-800 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5 inline mr-1" />
                  <strong>{clash.classes?.title ?? "Another class"}</strong> is already on at{" "}
                  {formatSpaTime(clash.start_time)} with{" "}
                  {clash.instructor?.trim() || clash.classes?.instructor?.trim() || "no teacher"}.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button>
              <Button size="sm" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                {form.id ? "Save changes" : "Add class"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
