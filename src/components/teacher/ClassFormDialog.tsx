import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Save, AlertTriangle } from "lucide-react";
import { formatSpaTime, spaLocalParts, spaLocalToInstant } from "@/lib/businessHours";
import { toast } from "sonner";
import { useConfirm } from "@/hooks/useConfirm";
import type { SchedSession } from "@/components/teacher/TeacherSchedule";

const sb = supabase as any;

interface ClassType {
  id: string; title: string | null; duration_minutes: number | null;
  max_capacity: number | null; is_active: boolean | null;
}

/** "2026-09-04" + "17:30" (studio time) -> the matching UTC instant. */
export function crToUtc(day: string, time: string): string | null {
  if (!day || !time) return null;
  const [y, m, d] = day.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  if ([y, m, d, hh, mm].some((n) => !Number.isFinite(n))) return null;
  return spaLocalToInstant(y, m - 1, d, hh, mm).toISOString();
}
/** The studio-time date and time of an instant, for filling the form back in. */
export function utcToCr(iso: string): { day: string; time: string } {
  const p = spaLocalParts(new Date(iso));
  const two = (n: number) => String(n).padStart(2, "0");
  return { day: `${p.year}-${two(p.month0 + 1)}-${two(p.day)}`, time: p.hhmm };
}

const blankForm = () => ({ class_id: "", instructor: "", day: "", start: "09:00", minutes: "60" });

/**
 * Add a class, move one, or hand it to a colleague.
 *
 * Shared by the calendar and the class list so both offer the same thing, and it
 * checks the whole studio's day for a clash itself rather than trusting whatever
 * the screen behind it happens to have loaded.
 */
export function ClassFormDialog({
  open, onOpenChange, teacherName, session, defaultDay, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  teacherName: string;
  /** null = a new class */
  session: SchedSession | null;
  /** yyyy-MM-dd to start on when adding */
  defaultDay?: string;
  onSaved: () => void;
}) {
  const [classTypes, setClassTypes] = useState<ClassType[]>([]);
  const [colleagues, setColleagues] = useState<string[]>([]);
  const [form, setForm] = useState(blankForm());
  const [daySessions, setDaySessions] = useState<SchedSession[]>([]);
  const [saving, setSaving] = useState(false);
  const { confirm, confirmDialog } = useConfirm();

  useEffect(() => {
    // Teachers see the whole catalogue, including class types Holis keeps off
    // the website — a trial class still has to be schedulable.
    sb.from("classes").select("id, title, duration_minutes, max_capacity, is_active")
      .order("title")
      .then(({ data }: any) => setClassTypes((data ?? []) as ClassType[]));
    sb.rpc("list_active_teachers").then(({ data }: any) =>
      setColleagues(((data ?? []) as any[]).map((t) => t.display_name)));
  }, []);

  // Fill the form whenever it opens.
  useEffect(() => {
    if (!open) return;
    if (session) {
      const { day, time } = utcToCr(session.start_time);
      const mins = Math.max(15, Math.round(
        (new Date(session.end_time).getTime() - new Date(session.start_time).getTime()) / 60000));
      setForm({
        class_id: session.class_id,
        instructor: session.instructor?.trim() || session.classes?.instructor?.trim() || teacherName,
        day, start: time, minutes: String(mins),
      });
    } else {
      const t = classTypes[0];
      setForm({
        class_id: t?.id ?? "",
        instructor: teacherName,
        day: defaultDay ?? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica" }).format(new Date()),
        start: "09:00",
        minutes: String(t?.duration_minutes ?? 60),
      });
    }
  }, [open, session, defaultDay, teacherName, classTypes]);

  // What else is on that day, so a clash can be pointed at by name. Asked for
  // in UTC with a day either side, then narrowed to the studio's own day —
  // an 8pm class here is already tomorrow in UTC.
  const loadDay = useCallback(async (day: string) => {
    if (!day) { setDaySessions([]); return; }
    const shift = (days: number) => {
      const d = new Date(`${day}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + days);
      return d.toISOString().slice(0, 10);
    };
    const { data } = await sb.from("class_schedule")
      .select("id, class_id, start_time, end_time, spots_remaining, is_cancelled, instructor, classes(title, instructor, max_capacity, location, duration_minutes)")
      .gte("start_time", `${shift(-1)}T00:00:00Z`).lte("start_time", `${shift(1)}T23:59:59Z`);
    setDaySessions(((data ?? []) as SchedSession[])
      .filter((x) => utcToCr(x.start_time).day === day));
  }, []);
  useEffect(() => { if (open) loadDay(form.day); }, [open, form.day, loadDay]);

  const startIso = crToUtc(form.day, form.start);
  const clash = (() => {
    if (!startIso) return null;
    const s = new Date(startIso).getTime();
    const e = s + (Number(form.minutes) || 60) * 60000;
    return daySessions.find((x) => {
      if (x.id === session?.id || x.is_cancelled) return false;
      const xs = new Date(x.start_time).getTime();
      const xe = new Date(x.end_time).getTime();
      return s < xe && xs < e;
    }) ?? null;
  })();

  const save = async () => {
    if (!form.class_id || !startIso) { toast.error("Pick a class, a day and a time"); return; }
    if (clash && !(await confirm({
      title: "That slot is taken",
      description:
        `${clash.classes?.title ?? "Another class"} is already on at ` +
        `${formatSpaTime(clash.start_time)} with ` +
        `${clash.instructor?.trim() || clash.classes?.instructor?.trim() || "no teacher"}.`,
      confirmLabel: "Add mine anyway",
    }))) return;

    const endIso = new Date(new Date(startIso).getTime() + (Number(form.minutes) || 60) * 60000).toISOString();
    setSaving(true);
    const payload = {
      class_id: form.class_id,
      start_time: startIso,
      end_time: endIso,
      instructor: form.instructor.trim(),
    };
    const { error } = session
      ? await sb.from("class_schedule").update(payload).eq("id", session.id)
      // spots_remaining comes from the class capacity, set by a database trigger.
      : await sb.from("class_schedule").insert({ ...payload, spots_remaining: 0, is_cancelled: false });
    if (error) toast.error(error.message);
    else {
      toast.success(session ? "Class updated" : "Class added");
      onOpenChange(false);
      onSaved();
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{session ? "Edit class" : "Add a class"}</DialogTitle>
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
                  minutes: session ? form.minutes : String(t?.duration_minutes ?? 60),
                });
              }}
              disabled={!!session}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-60"
            >
              {classTypes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}{c.is_active === false ? " (not on the website)" : ""}
                </option>
              ))}
            </select>
            {session && (
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
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              {session ? "Save changes" : "Add class"}
            </Button>
          </div>
        </div>
        {confirmDialog}
      </DialogContent>
    </Dialog>
  );
}
