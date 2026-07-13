import { useState } from "react";
import { CalendarDays, Clock, MapPin, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import type { ScheduleRow } from "@/hooks/useClasses";
import { ClassEligibilityBadge } from "@/components/ClassEligibilityBadge";
import { formatCRC } from "@/lib/currency";
import { formatSpaDate } from "@/lib/businessHours";

// Branded default shown whenever a class has no image (or a broken one).
const fallbackImg = "/class-placeholder.jpg";

export function EventCard({ event }: { event: ScheduleRow }) {
  const cls = event.classes;
  const soldOut = event.spots_remaining <= 0;
  const [expanded, setExpanded] = useState(false);
  const isLong = (cls.description?.length ?? 0) > 180;

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
        {/* Recurring badge + eligibility */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {cls.is_recurring && (
            <span className="inline-block text-xs font-body font-semibold uppercase tracking-wider text-muted-foreground border border-border rounded-full px-3 py-1">
              Multiple Dates
            </span>
          )}
          <ClassEligibilityBadge classId={cls.id} />
        </div>

        {/* Title */}
        <h3 className="font-heading text-xl md:text-2xl font-medium text-foreground">
          {cls.title}
        </h3>

        {/* Date & Location */}
        <p className="font-body text-sm text-muted-foreground">
          {formatSpaDate(event.start_time)}
          {cls.location && <> &nbsp;|&nbsp; {cls.location}</>}
        </p>

        {/* Description */}
        {cls.description && (
          <div className="max-w-md mx-auto">
            <p className={`spa-body-sm whitespace-pre-line ${expanded ? "" : "line-clamp-3"}`}>
              {cls.description}
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

        {/* Instructor */}
        {cls.instructor && (
          <p className="font-body text-xs text-muted-foreground">
            with <span className="font-medium text-foreground">{cls.instructor}</span>
          </p>
        )}

        {/* Price */}
        {Number(cls.price) > 0 && (
          <p className="font-heading text-base font-semibold text-foreground">
            {formatCRC(cls.price)}
          </p>
        )}

        {/* RSVP Button */}
        <div className="mt-2">
          {soldOut ? (
            <span className="font-body text-sm font-semibold text-destructive">Sold Out</span>
          ) : (
            <Button variant="outline" size="default" className="min-w-[140px] rounded-full" asChild>
              <Link to={`/class-booking?class=${event.id}`}>RSVP</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
