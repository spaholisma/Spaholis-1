import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import { AlertTriangle, CalendarOff, ChevronDown, Loader2, Palmtree, Pencil, Trash2, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useVacationMode } from "@/hooks/useVacationMode";
import { cn } from "@/lib/utils";
import { closureRanges, datesBetween, spaDateKey, type ClassClosure, type ClosureRange } from "@/lib/classClosures";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  closures: ClassClosure[];
  onChanged: () => void;
}

// Generated types predate the table.
const closuresTable = () => supabase.from("class_closures" as any) as any;

const dateOf = (key: string) => new Date(`${key}T12:00:00`);
const longDate = (key: string) =>
  dateOf(key).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
const shortDate = (key: string) =>
  dateOf(key).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const rangeLabel = (from: string, to: string) =>
  from === to ? longDate(from) : `${shortDate(from)} – ${longDate(to)}`;
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** What is already on the calendar in the days about to be closed. */
interface Impact { sessions: number; bookings: number }

async function impactOf(from: string, to: string): Promise<Impact> {
  const startISO = new Date(`${from}T00:00:00-06:00`).toISOString();
  const endISO = new Date(new Date(`${to}T00:00:00-06:00`).getTime() + 86_400_000).toISOString();
  const { data: sessions } = await supabase
    .from("class_schedule")
    .select("id")
    .gte("start_time", startISO)
    .lt("start_time", endISO)
    .eq("is_cancelled", false);
  const ids = ((sessions as { id: string }[]) ?? []).map((s) => s.id);
  if (!ids.length) return { sessions: 0, bookings: 0 };
  const { count } = await supabase
    .from("class_bookings")
    .select("id", { count: "exact", head: true })
    .in("schedule_id", ids)
    .not("status", "in", "(cancelled,payment_failed)");
  return { sessions: ids.length, bookings: count ?? 0 };
}

/**
 * Closed days for classes — and only classes. Treatments have their own
 * switch (Vacation Mode), shown here too so the two are never confused.
 *
 * Pick the days on the calendar (one day, or a first and a last day), write the
 * message clients see on the Class Schedule, and close them. The closed days
 * are listed as periods: change a period's message, reopen it all at once, or
 * open its list and reopen single days. Closing days that are already closed
 * gives them the new message.
 */
export function ClassClosuresDialog({ open, onOpenChange, closures, onChanged }: Props) {
  const [range, setRange] = useState<DateRange | undefined>();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [impact, setImpact] = useState<Impact | null>(null);
  const [checking, setChecking] = useState(false);
  const [editing, setEditing] = useState<{ key: string; text: string } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { vacation } = useVacationMode();

  const today = spaDateKey(new Date());
  // Vacation Mode pauses treatments now or later (an end date in the past means it is over).
  const vacationOn = !!vacation?.enabled && (!vacation.end_date || today <= vacation.end_date);
  const closedSet = useMemo(() => new Set(closures.map((c) => c.closed_date)), [closures]);
  const upcoming = closures.filter((c) => c.closed_date >= today);
  const past = closures.length - upcoming.length;
  const periods = closureRanges(upcoming);

  const from = range?.from ? format(range.from, "yyyy-MM-dd") : "";
  const to = range?.to ? format(range.to, "yyyy-MM-dd") : from;
  const days = from ? datesBetween(from, to) : [];
  const alreadyClosed = days.filter((d) => closedSet.has(d)).length;

  // What the chosen days already hold: shown before anything is closed.
  useEffect(() => {
    if (!from) { setImpact(null); return; }
    let alive = true;
    setChecking(true);
    impactOf(from, to)
      .then((i) => { if (alive) setImpact(i); })
      .catch(() => { if (alive) setImpact(null); })
      .finally(() => { if (alive) setChecking(false); });
    return () => { alive = false; };
  }, [from, to]);

  const reset = () => { setRange(undefined); setReason(""); setImpact(null); };

  const close = async () => {
    if (!days.length) { toast.error("Choose the days on the calendar."); return; }
    if (days.length > 366) { toast.error("Choose at most a year at a time."); return; }
    if (impact?.bookings && !confirm(
      `${plural(impact.bookings, "student")} already booked a class on these days. ` +
      "The classes will be hidden from the website and cannot be booked, but the students are not told. " +
      "Cancel those classes from the calendar if you want them emailed. Close these days anyway?",
    )) return;

    setSaving(true);
    try {
      // Already-closed days take the new message, so a period can be re-done in one go.
      const rows = days.map((d) => ({ closed_date: d, reason: reason.trim() || null }));
      const { error } = await closuresTable().upsert(rows, { onConflict: "closed_date" });
      if (error) throw error;
      const added = days.length - alreadyClosed;
      toast.success(
        added === days.length ? `Closed ${days.length === 1 ? longDate(from) : plural(days.length, "day")} for classes`
          : added === 0 ? "Those days were already closed — their message is updated"
          : `Closed ${plural(added, "more day")} — ${plural(alreadyClosed, "day")} already closed got the new message`,
      );
      reset();
      onChanged();
    } catch (e: any) {
      toast.error(e.message ?? "Could not save the closed days");
    } finally {
      setSaving(false);
    }
  };

  const periodKey = (p: ClosureRange) => `${p.from}|${p.to}`;

  const reopenPeriod = async (p: ClosureRange) => {
    const n = datesBetween(p.from, p.to).length;
    if (n > 1 && !confirm(`Open ${rangeLabel(p.from, p.to)} (${n} days) for classes again?`)) return;
    setBusy(periodKey(p));
    const { error } = await closuresTable().delete().gte("closed_date", p.from).lte("closed_date", p.to);
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(n === 1 ? `${longDate(p.from)} is open again` : `${plural(n, "day")} open again`);
    onChanged();
  };

  const reopenDay = async (c: ClassClosure) => {
    setBusy(c.id);
    const { error } = await closuresTable().delete().eq("id", c.id);
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`${longDate(c.closed_date)} is open again`);
    onChanged();
  };

  const saveMessage = async (p: ClosureRange, text: string) => {
    setBusy(periodKey(p));
    const { error } = await closuresTable()
      .update({ reason: text.trim() || null })
      .gte("closed_date", p.from).lte("closed_date", p.to);
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Message updated");
    setEditing(null);
    onChanged();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); setEditing(null); } onOpenChange(o); }}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading">
            <CalendarOff className="h-4 w-4" /> Closed days for classes
          </DialogTitle>
          <DialogDescription>
            On these days the Class Schedule shows your message, nobody can book or join a class, and no session can
            be scheduled. <strong>Treatments and massages are not affected.</strong>
          </DialogDescription>
        </DialogHeader>

        {/* Treatments have their own switch — said here so the two are never mixed up. */}
        <div className={cn(
          "flex items-start gap-2 rounded-lg border px-3 py-2 text-xs",
          vacationOn ? "border-amber-500/40 bg-amber-500/10" : "border-border bg-muted/40",
        )}>
          <Palmtree className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>
            Treatments: {vacationOn && vacation
              ? <>online bookings are <strong>paused by Vacation Mode</strong>
                  {vacation.start_date || vacation.end_date
                    ? <> ({vacation.start_date ? shortDate(vacation.start_date) : "now"} – {vacation.end_date ? longDate(vacation.end_date) : "until switched off"})</>
                    : null}. Change it in Admin → Vacation Mode.</>
              : <>open for online booking — Vacation Mode (Admin → Vacation Mode) is not pausing them.</>}
          </p>
        </div>

        {/* 1. Pick the days */}
        <div className="rounded-lg border border-border p-3 space-y-3">
          <div>
            <p className="text-sm font-medium">1. Choose the days</p>
            <p className="text-xs text-muted-foreground">Tap one day, or the first and then the last day. Days already closed are marked in red.</p>
          </div>
          <div className="flex justify-center">
            <Calendar
              mode="range"
              selected={range}
              onSelect={setRange}
              disabled={{ before: dateOf(today) }}
              modifiers={{ closed: [...closedSet].map(dateOf) }}
              modifiersClassNames={{ closed: "!text-destructive font-semibold line-through decoration-destructive/60" }}
              defaultMonth={range?.from ?? dateOf(today)}
              numberOfMonths={1}
            />
          </div>
          {from ? (
            <div className="rounded-md bg-muted/50 px-3 py-2 text-xs space-y-1">
              <p className="font-medium text-foreground">
                {rangeLabel(from, to)} · {plural(days.length, "day")}
                {alreadyClosed > 0 && <span className="text-muted-foreground"> ({alreadyClosed} already closed)</span>}
              </p>
              {checking ? (
                <p className="text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Checking the calendar…</p>
              ) : impact && impact.sessions > 0 ? (
                <p className="flex items-start gap-1 text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  {plural(impact.sessions, "class session")} already scheduled
                  {impact.bookings ? ` with ${plural(impact.bookings, "booking")}` : ""} — hidden from the website once closed.
                  Cancel them from the calendar if the students should be told.
                </p>
              ) : impact ? (
                <p className="text-muted-foreground">No classes scheduled on these days.</p>
              ) : null}
            </div>
          ) : null}

          {/* 2. The message */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">2. Message <span className="text-xs font-normal text-muted-foreground">(optional, clients see it on the Class Schedule)</span></Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. We're on vacation — see you on November 3rd!" maxLength={200} className="h-9 text-sm" />
          </div>

          <div className="flex gap-2">
            {from && <Button variant="ghost" size="sm" onClick={reset} disabled={saving}>Clear</Button>}
            <Button size="sm" onClick={close} disabled={saving || !from} className="flex-1">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {!from ? "Choose the days first" : days.length === 1 ? "Close this day for classes" : `Close ${days.length} days for classes`}
            </Button>
          </div>
        </div>

        {/* The closed periods */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Upcoming closed days ({upcoming.length})
          </p>
          {periods.length === 0 ? (
            <p className="text-sm text-muted-foreground">No closed days — every day is open for classes.</p>
          ) : (
            <ul className="space-y-2">
              {periods.map((p) => {
                const key = periodKey(p);
                const rows = upcoming.filter((c) => c.closed_date >= p.from && c.closed_date <= p.to);
                const isEditing = editing?.key === key;
                const isOpen = expanded === key;
                return (
                  <li key={key} className="rounded-lg border border-border">
                    <div className="flex items-start gap-2 px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{rangeLabel(p.from, p.to)}</p>
                        <p className="text-[11px] text-muted-foreground">{plural(rows.length, "day")} closed for classes</p>
                        {isEditing ? (
                          <div className="mt-2 flex gap-2">
                            <Input autoFocus value={editing.text} maxLength={200} className="h-8 text-xs"
                              onChange={(e) => setEditing({ key, text: e.target.value })}
                              onKeyDown={(e) => { if (e.key === "Enter") saveMessage(p, editing.text); if (e.key === "Escape") setEditing(null); }} />
                            <Button size="sm" className="h-8" disabled={busy === key} onClick={() => saveMessage(p, editing.text)}>Save</Button>
                          </div>
                        ) : (
                          <p className="mt-1 text-xs text-muted-foreground break-words">
                            {p.message ? `“${p.message}”` : <em>No message</em>}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center">
                        <Button size="icon" variant="ghost" className="h-8 w-8" title="Change the message"
                          onClick={() => setEditing(isEditing ? null : { key, text: p.message ?? "" })}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          title={rows.length > 1 ? "Open all these days again" : "Open this day again"}
                          disabled={busy === key} onClick={() => reopenPeriod(p)}>
                          {busy === key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                    {rows.length > 1 && (
                      <>
                        <button type="button" onClick={() => setExpanded(isOpen ? null : key)}
                          className="flex w-full items-center justify-between border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground hover:bg-muted/40">
                          {isOpen ? "Hide the days" : "Show the days — reopen just one"}
                          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-180")} />
                        </button>
                        {isOpen && (
                          <ul className="divide-y divide-border border-t border-border">
                            {rows.map((c) => (
                              <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                                <span className="text-xs">{longDate(c.closed_date)}</span>
                                <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" disabled={busy === c.id}
                                  onClick={() => reopenDay(c)}>
                                  {busy === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Undo2 className="h-3 w-3 mr-1" /> Reopen</>}
                                </Button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {past > 0 && <p className="text-[11px] text-muted-foreground">{plural(past, "past closed day")} not shown.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
