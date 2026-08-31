import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import type { ScheduleRow } from "@/hooks/useClasses";
import { ClassEligibilityBadge } from "@/components/ClassEligibilityBadge";
import { formatCRC } from "@/lib/currency";
import { spaLocalParts, formatSpaTime } from "@/lib/businessHours";
import { RichText } from "@/components/ui/rich-text";

// Branded default shown whenever a class has no image (or a broken one).
const fallbackImg = "/class-placeholder.jpg";
const DAY_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * One card per CLASS TYPE (not per session).
 *
 * The Weekly Classes list used to render a card for every scheduled session, so
 * the same class appeared over and over with a different date each time. Here we
 * collapse a class's upcoming sessions into a single card that shows which days
 * it runs, and books the next available session directly. Exact dates live in
 * the Class Schedule.
 */
export function ClassTypeCard({ sessions }: { sessions: ScheduleRow[] }) {
  const [expanded, setExpanded] = useState(false);

  // Sessions arrive sorted by start_time; the first with room is what we book.
  const upcoming = [...sessions].sort((a, b) => a.start_time.localeCompare(b.start_time));
  const bookable = upcoming.find((s) => s.spots_remaining > 0);
  const cls = upcoming[0].classes;
  const isLong = (cls.description?.length ?? 0) > 180;

  // Weekdays this class runs on, in week order.
  const weekdays = [...new Set(upcoming.map((s) => spaLocalParts(new Date(s.start_time)).weekday))]
    .sort((a, b) => a - b)
    .map((d) => DAY_LABEL[d]);

  // Show the time only when every session shares it, otherwise it would be a
  // list of times per day — exactly the repetition we're removing.
  const times = [...new Set(upcoming.map((s) => formatSpaTime(s.start_time)))];
  const scheduleLine = [weekdays.join(" · "), times.length === 1 ? times[0] : null]
    .filter(Boolean)
    .join("  |  ");

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden flex flex-col md:flex-row group hover:shadow-lg transition-shadow">
      {/* Image */}
      <div className="md:w-[320px] shrink-0 aspect-[4/3] md:aspect-auto overflow-hidden">
        <img
          src={cls.image_url || fallbackImg}
          alt={cls.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
          onError={(e) => { const el = e.currentTarget as HTMLImageElement; if (el.src !== window.location.origin + fallbackImg) el.src = fallbackImg; }}
        />
      </div>

      {/* Content */}
      <div className="flex-1 p-6 flex flex-col justify-center text-center gap-3">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <ClassEligibilityBadge classId={cls.id} />
        </div>

        <h3 className="font-heading text-xl md:text-2xl font-medium text-foreground">
          {cls.title}
        </h3>

        {/* Which days it runs — no individual dates (those live in the Schedule) */}
        <p className="font-body text-sm text-muted-foreground">
          {scheduleLine}
          {cls.location && <> &nbsp;|&nbsp; {cls.location}</>}
        </p>

        {cls.description && (
          <div className="max-w-md mx-auto">
            <p className={`spa-body-sm whitespace-pre-line ${expanded ? "" : "line-clamp-3"}`}>
              <RichText value={cls.description} />
            </p>
            {isLong && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-1 text-xs font-body font-semibold uppercase tracking-wider text-primary hover:underline"
              >
                {expanded ? "Read less" : "Read more"}
              </button>
            )}
          </div>
        )}

        {cls.instructor && (
          <p className="font-body text-xs text-muted-foreground">
            with <span className="font-medium text-foreground">{cls.instructor}</span>
          </p>
        )}

        {((cls as any).price_label || Number(cls.price) > 0) && (
          <p className="font-heading text-base font-semibold text-foreground">
            {(cls as any).price_label || formatCRC(cls.price)}
          </p>
        )}

        {/* Books the next session that still has room. */}
        <div className="mt-2">
          {bookable ? (
            <Button variant="outline" size="default" className="min-w-[160px] rounded-full" asChild>
              <Link to={`/class-booking?class=${bookable.id}`}>Book next class</Link>
            </Button>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <span className="font-body text-sm font-semibold text-destructive">Sold Out</span>
              <Link to="/classes/schedule" className="font-body text-xs font-semibold uppercase tracking-wider text-primary hover:underline">
                See other dates
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
