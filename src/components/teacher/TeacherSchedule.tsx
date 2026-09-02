import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Loader2, Plus, Users, Ban, Undo2 } from "lucide-react";
import {
  format, startOfWeek, endOfWeek, addDays, addWeeks, subWeeks, isSameDay,
} from "date-fns";
import { formatSpaTime } from "@/lib/businessHours";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useConfirm } from "@/hooks/useConfirm";
import { ClassFormDialog, utcToCr } from "@/components/teacher/ClassFormDialog";

const sb = supabase as any;

export interface SchedSession {
  id: string; class_id: string; start_time: string; end_time: string;
  spots_remaining: number; is_cancelled: boolean; instructor: string | null;
  classes: { title: string | null; instructor: string | null; max_capacity: number | null;
             location: string | null; duration_minutes: number | null } | null;
}

export const teacherOf = (s: SchedSession) =>
  (s.instructor?.trim() || s.classes?.instructor?.trim() || "").toLowerCase();

export const SESSION_SELECT =
  "id, class_id, start_time, end_time, spots_remaining, is_cancelled, instructor, " +
  "classes(title, instructor, max_capacity, location, duration_minutes)";

/**
 * The whole studio's week, not just hers.
 *
 * A teacher needs to see everybody's classes to pick a slot that does not clash
 * with a colleague's — that is the point of this tab. She can only act on the
 * classes she teaches; the rest are there to be looked at.
 */
export function TeacherSchedule({
  teacherName, onStudents, onChanged,
}: {
  teacherName: string;
  onStudents: (s: SchedSession) => void;
  onChanged?: () => void;
}) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [sessions, setSessions] = useState<SchedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SchedSession | null>(null);
  const [formDay, setFormDay] = useState<string | undefined>();
  const { confirm, confirmDialog } = useConfirm();

  const mine = (s: SchedSession) => teacherOf(s) === teacherName.trim().toLowerCase();

  const load = useCallback(async () => {
    setLoading(true);
    // A day either side: the studio is six hours behind UTC, so Sunday
    // evening here is already Monday in UTC.
    const from = format(addDays(weekStart, -1), "yyyy-MM-dd");
    const to = format(addDays(endOfWeek(weekStart, { weekStartsOn: 1 }), 1), "yyyy-MM-dd");
    const { data } = await sb.from("class_schedule").select(SESSION_SELECT)
      .gte("start_time", `${from}T00:00:00Z`).lte("start_time", `${to}T23:59:59Z`)
      .order("start_time");
    setSessions(((data ?? []) as SchedSession[]));
    setLoading(false);
  }, [weekStart]);
  useEffect(() => { load(); }, [load]);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const openNew = (day?: Date) => {
    setEditing(null);
    setFormDay(day ? format(day, "yyyy-MM-dd") : undefined);
    setFormOpen(true);
  };
  const openEdit = (s: SchedSession) => { setEditing(s); setFormOpen(true); };

  const setCancelled = async (s: SchedSession, cancel: boolean) => {
    if (!(await confirm({
      title: cancel ? "Cancel this class?" : "Put this class back?",
      description: cancel
        ? "Anyone signed up will be emailed."
        : "It goes back on the schedule and students can book it again.",
      confirmLabel: cancel ? "Cancel the class" : "Put it back",
      destructive: cancel,
    }))) return;
    setBusyId(s.id);
    const { error } = await sb.from("class_schedule").update({ is_cancelled: cancel }).eq("id", s.id);
    if (error) toast.error(error.message);
    else { toast.success(cancel ? "Class cancelled" : "Class is back on"); load(); onChanged?.(); }
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
            const list = sessions.filter((s) => utcToCr(s.start_time).day === format(d, "yyyy-MM-dd"));
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

      <ClassFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        teacherName={teacherName}
        session={editing}
        defaultDay={formDay}
        onSaved={() => { load(); onChanged?.(); }}
      />
      {confirmDialog}
    </Card>
  );
}
