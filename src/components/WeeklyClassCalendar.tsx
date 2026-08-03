import { useState } from "react";
import { format, startOfWeek, addDays, isSameDay } from "date-fns";
import { Clock, MapPin, Users, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { ScheduleRow } from "@/hooks/useClasses";
import { ClassEligibilityBadge } from "@/components/ClassEligibilityBadge";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface WeeklyCalendarProps {
  events: ScheduleRow[];
}

export function WeeklyClassCalendar({ events }: WeeklyCalendarProps) {
  const [weekOffset, setWeekOffset] = useState(0);

  // Start of current week (Monday)
  const today = new Date();
  const weekStart = addDays(startOfWeek(today, { weekStartsOn: 1 }), weekOffset * 7);

  const weekDays = DAYS.map((_, i) => addDays(weekStart, i));

  // Group events by day of week. Past classes (booking closes 15 min before
  // start) are hidden so the schedule only shows what can still be booked.
  const bookableCutoff = Date.now() + 15 * 60 * 1000;
  const eventsByDay: Record<number, ScheduleRow[]> = {};
  weekDays.forEach((day, i) => {
    eventsByDay[i] = events.filter((e) => {
      const eventDate = new Date(e.start_time);
      return isSameDay(eventDate, day) && eventDate.getTime() >= bookableCutoff;
    }).sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  });

  const weekLabel = `${format(weekDays[0], "MMM d")} – ${format(weekDays[6], "MMM d, yyyy")}`;

  return (
    <div>
      {/* Week Navigation */}
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" size="sm" onClick={() => setWeekOffset(weekOffset - 1)}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Previous
        </Button>
        <span className="font-body text-sm font-medium text-foreground">{weekLabel}</span>
        <Button variant="ghost" size="sm" onClick={() => setWeekOffset(weekOffset + 1)}>
          Next <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>

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
                  isToday ? "bg-foreground text-background" : "bg-muted"
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
          {weekDays.map((_, dayIdx) => (
            <div key={dayIdx} className="space-y-1">
              {eventsByDay[dayIdx]?.length > 0 ? (
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

      {/* Mobile: vertical spa agenda */}
      <div className="md:hidden">
        {/* Scrollable day pills */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-6 no-scrollbar -mx-1 px-1">
          {weekDays.map((day, i) => {
            const isToday = isSameDay(day, today);
            const hasEvents = (eventsByDay[i]?.length ?? 0) > 0;
            return (
              <div
                key={i}
                className={cn(
                  "flex-shrink-0 w-12 h-16 rounded-full flex flex-col items-center justify-center gap-0.5 border transition-colors",
                  isToday
                    ? "bg-foreground text-background border-transparent shadow-sm"
                    : hasEvents
                      ? "bg-primary/20 border-primary/30 text-foreground"
                      : "bg-background border-border/60 text-muted-foreground"
                )}
              >
                <span className="font-body text-[10px] font-medium uppercase tracking-wider">
                  {DAYS_SHORT[i]}
                </span>
                <span className="font-body text-sm font-bold">{format(day, "d")}</span>
              </div>
            );
          })}
        </div>

        {/* Vertical agenda */}
        <div className="flex flex-col gap-8">
          {weekDays.map((day, dayIdx) => {
            const dayEvents = eventsByDay[dayIdx] ?? [];
            const isToday = isSameDay(day, today);
            const empty = dayEvents.length === 0;
            return (
              <section key={dayIdx} className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <h3
                    className={cn(
                      "font-heading text-xl",
                      empty ? "text-foreground/50" : "text-foreground",
                      isToday && "text-foreground"
                    )}
                  >
                    {DAYS[dayIdx]}, {format(day, "MMMM d")}
                  </h3>
                  <div className={cn("h-px flex-1", empty ? "bg-border/40" : "bg-primary/40")} />
                </div>

                {empty ? (
                  <div className="py-6 px-4 rounded-2xl border border-dashed border-border/60 text-center">
                    <p className="font-body text-sm text-muted-foreground">
                      No classes scheduled for today.
                    </p>
                  </div>
                ) : (
                  dayEvents.map((event) => <MobileClassCard key={event.id} event={event} />)
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MobileClassCard({ event }: { event: ScheduleRow }) {
  const cls = event.classes;
  const start = new Date(event.start_time);
  const spotsLow = event.spots_remaining <= 3 && event.spots_remaining > 0;
  const soldOut = event.spots_remaining <= 0;

  return (
    <Link
      to={`/class-booking?class=${event.id}`}
      className={cn(
        "group block bg-background border rounded-2xl p-4 shadow-sm transition-all active:scale-[0.98]",
        soldOut
          ? "border-border opacity-60 pointer-events-none"
          : "border-primary/20 hover:border-primary/40"
      )}
    >
      <div className="flex justify-between items-start mb-2 gap-2">
        <span className="font-body text-xs font-semibold text-spa-sage tracking-wide uppercase">
          {format(start, "h:mm a")} • {cls.duration_minutes} min
        </span>
        {soldOut ? (
          <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-bold uppercase tracking-tighter">
            Sold Out
          </span>
        ) : spotsLow ? (
          <span className="px-2 py-0.5 rounded-full bg-destructive/10 text-destructive text-[10px] font-bold uppercase tracking-tighter whitespace-nowrap">
            {event.spots_remaining} left
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded-full bg-spa-sage/10 text-spa-sage text-[10px] font-bold uppercase tracking-tighter">
            Open
          </span>
        )}
      </div>
      <h4 className="font-heading text-lg text-foreground leading-tight mb-1 group-hover:text-spa-sage transition-colors">
        {cls.title}
      </h4>
      <div className="flex items-center gap-2">
        <ClassEligibilityBadge classId={cls.id} size="sm" />
      </div>
    </Link>
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

      {/* Title */}
      <p className="font-heading text-sm font-medium text-foreground mt-1 leading-tight line-clamp-2">
        {cls.title}
      </p>


      {/* Eligibility */}
      <div className="mt-1">
        <ClassEligibilityBadge classId={cls.id} size="sm" />
      </div>

      {/* Duration */}
      <p className="font-body text-[10px] text-muted-foreground mt-0.5">
        {cls.duration_minutes}min
      </p>

      {/* Spots */}
      <div className="mt-1.5">
        {soldOut ? (
          <span className="font-body text-[9px] font-semibold uppercase text-destructive">Sold Out</span>
        ) : spotsLow ? (
          <span className="font-body text-[9px] font-semibold uppercase text-destructive/80">
            {event.spots_remaining} spots left
          </span>
        ) : (
          <span className="font-body text-[9px] font-medium text-spa-sage uppercase opacity-0 group-hover:opacity-100 transition-opacity">
            Book Now →
          </span>
        )}
      </div>
    </Link>
  );
}