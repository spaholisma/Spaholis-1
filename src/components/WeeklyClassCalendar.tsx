import { useState } from "react";
import { format, startOfWeek, addDays, isSameDay } from "date-fns";
import { Clock, MapPin, Users, ChevronLeft, ChevronRight, CalendarOff } from "lucide-react";
import { closureRanges, type ClassClosure } from "@/lib/classClosures";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

/** The teacher on a session: the one named on the day wins over the class's. */
const teacherOf = (e: ScheduleRow) =>
  ((e as any).instructor?.trim() || e.classes.instructor?.trim() || "");
import type { ScheduleRow } from "@/hooks/useClasses";
import { ClassEligibilityBadge } from "@/components/ClassEligibilityBadge";
import { isClassOpenForBooking } from "@/lib/classBookingWindow";
import { MobileDayAgenda } from "@/components/MobileDayAgenda";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

interface WeeklyCalendarProps {
  events: ScheduleRow[];
  /** Days the studio is closed; shown as "Closed Day" with the team's message. */
  closures?: ClassClosure[];
  /** Open on this day (YYYY-MM-DD): the phone shows it, the week grid opens on its week. */
  initialDay?: string | null;
}

const dayKey = (d: Date) => format(d, "yyyy-MM-dd");
const longDay = (key: string) => format(new Date(`${key}T12:00:00`), "EEEE, MMMM d");

export function WeeklyClassCalendar({ events, closures = [], initialDay }: WeeklyCalendarProps) {
  const today = new Date();
  const [weekOffset, setWeekOffset] = useState(() => {
    if (!initialDay || !/^\d{4}-\d{2}-\d{2}$/.test(initialDay)) return 0;
    const first = startOfWeek(today, { weekStartsOn: 1 });
    const target = startOfWeek(new Date(`${initialDay}T12:00:00`), { weekStartsOn: 1 });
    return Math.max(0, Math.round((target.getTime() - first.getTime()) / (7 * 86_400_000)));
  });

  // Start of current week (Monday)
  const weekStart = addDays(startOfWeek(today, { weekStartsOn: 1 }), weekOffset * 7);

  const weekDays = DAYS.map((_, i) => addDays(weekStart, i));

  // Group events by day of week. Classes that have started are hidden, so the
  // schedule only shows what can still be booked (open until the class starts).
  const now = Date.now();
  const eventsByDay: Record<number, ScheduleRow[]> = {};
  weekDays.forEach((day, i) => {
    eventsByDay[i] = events.filter((e) => {
      const eventDate = new Date(e.start_time);
      return isSameDay(eventDate, day) && isClassOpenForBooking(eventDate, now);
    }).sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  });

  const weekLabel = `${format(weekDays[0], "MMM d")} – ${format(weekDays[6], "MMM d, yyyy")}`;

  const closureByDay = new Map(closures.map((c) => [c.closed_date, c]));
  const weekFrom = dayKey(weekDays[0]);
  const weekTo = dayKey(weekDays[6]);
  const weekClosures = closureRanges(closures).filter((r) => r.from <= weekTo && r.to >= weekFrom);

  return (
    <div>
      {/* Week Navigation (the week grid; a phone has its own day strip) */}
      <div className="hidden md:flex items-center justify-between mb-6">
        <Button variant="ghost" size="sm" onClick={() => setWeekOffset(weekOffset - 1)}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Previous
        </Button>
        <span className="font-body text-sm font-medium text-foreground">{weekLabel}</span>
        <Button variant="ghost" size="sm" onClick={() => setWeekOffset(weekOffset + 1)}>
          Next <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>

      {/* Closed days in this week, with the team's message */}
      {weekClosures.length > 0 && (
        <div className="hidden md:block mb-6 space-y-3">
          {weekClosures.map((r) => (
            <div key={r.from} className="flex items-start gap-4 rounded-2xl border border-spa-sage/30 bg-spa-sage/10 px-5 py-4">
              <div className="h-10 w-10 rounded-full bg-spa-sage/20 flex items-center justify-center shrink-0">
                <CalendarOff className="h-5 w-5 text-spa-sage" />
              </div>
              <div className="min-w-0">
                <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-spa-sage">
                  {r.from === r.to ? "Closed Day" : "Closed Days"}
                </p>
                <p className="font-heading text-lg text-foreground mt-0.5">
                  {r.from === r.to ? longDay(r.from) : `${longDay(r.from)} – ${longDay(r.to)}`}
                </p>
                {r.message && <p className="font-body text-sm text-muted-foreground mt-1">{r.message}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Desktop: 7-column week grid */}
      <div className="hidden md:block">
        {/* Day Headers */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {weekDays.map((day, i) => {
            const isToday = isSameDay(day, today);
            return (
              <div
                key={i}
                className={cn(
                  "text-center py-2 rounded-xl",
                  isToday ? "bg-foreground text-background" : closureByDay.has(dayKey(day)) ? "bg-spa-sage/15" : "bg-muted"
                )}
              >
                <p className="font-body text-xs font-semibold uppercase tracking-wider">
                  {DAYS[i]}
                </p>
                <p className={cn(
                  "font-body text-lg font-medium mt-0.5",
                  isToday ? "text-background" : "text-foreground"
                )}>
                  {format(day, "d")}
                </p>
              </div>
            );
          })}
        </div>

        {/* Events Grid */}
        <div className="grid grid-cols-7 gap-1 min-h-[300px]">
          {weekDays.map((day, dayIdx) => (
            <div key={dayIdx} className="space-y-1">
              {closureByDay.has(dayKey(day)) ? (
                <div className="min-h-[120px] rounded-xl border border-spa-sage/30 bg-spa-sage/10 p-2.5 flex flex-col items-center text-center gap-1.5">
                  <CalendarOff className="h-4 w-4 text-spa-sage" />
                  <span className="font-body text-[11px] font-semibold uppercase tracking-wider text-spa-sage">Closed Day</span>
                  {closureByDay.get(dayKey(day))?.reason && (
                    <p className="font-body text-[11px] text-muted-foreground leading-snug line-clamp-5">
                      {closureByDay.get(dayKey(day))?.reason}
                    </p>
                  )}
                </div>
              ) : eventsByDay[dayIdx]?.length > 0 ? (
                eventsByDay[dayIdx].map((event) => (
                  <ClassSlot key={event.id} event={event} />
                ))
              ) : (
                <div className="h-16 rounded-xl border border-dashed border-border flex items-center justify-center">
                  <span className="text-xs text-muted-foreground font-body">—</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Phone: one day at a time — today first, a strip of dates to slide */}
      <div className="md:hidden">
        <MobileDayAgenda events={events} closures={closures} initialDay={initialDay} />
      </div>
    </div>
  );
}

function ClassSlot({ event }: { event: ScheduleRow }) {
  const cls = event.classes;
  const start = new Date(event.start_time);
  const spotsLow = event.spots_remaining <= 3 && event.spots_remaining > 0;
  const soldOut = event.spots_remaining <= 0;

  return (
    <Link
      to={`/class-booking?class=${event.id}`}
      className={cn(
        "block rounded-xl p-2.5 transition-all group cursor-pointer border",
        soldOut
          ? "bg-muted/50 border-border opacity-60 pointer-events-none"
          : "bg-spa-sage/10 border-spa-sage/20 hover:bg-spa-sage/20 hover:border-spa-sage/40 hover:shadow-sm"
      )}
    >
      {/* Time */}
      <p className="font-body text-[11px] font-semibold text-spa-sage uppercase tracking-wide">
        {format(start, "h:mm a")}
      </p>

      {/* Title — three lines, so "Aerial Yoga + Floating Gong Bath" is not cut in a narrow column */}
      <p className="font-heading text-sm font-medium text-foreground mt-1 leading-tight line-clamp-3" title={cls.title ?? undefined}>
        {cls.title}
      </p>

      {/* Who teaches it */}
      {teacherOf(event) && (
        <p className="font-body text-[11px] text-muted-foreground leading-tight truncate">
          with {teacherOf(event)}
        </p>
      )}

      {/* Eligibility */}
      <div className="mt-1">
        <ClassEligibilityBadge classId={cls.id} size="sm" />
      </div>

      {/* Duration */}
      <p className="font-body text-[11px] text-muted-foreground mt-0.5">
        {cls.duration_minutes}min
      </p>

      {/* Spots */}
      <div className="mt-1.5">
        {soldOut ? (
          <span className="font-body text-[11px] font-semibold uppercase text-destructive">Sold Out</span>
        ) : spotsLow ? (
          <span className="font-body text-[11px] font-semibold uppercase text-destructive/80">
            {event.spots_remaining} spots left
          </span>
        ) : (
          <span className="font-body text-[11px] font-medium text-spa-sage uppercase opacity-0 group-hover:opacity-100 transition-opacity">
            Book Now →
          </span>
        )}
      </div>
    </Link>
  );
}