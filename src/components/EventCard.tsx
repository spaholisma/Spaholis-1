import { useState } from "react";
import { CalendarDays, Clock, MapPin, Play, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import type { ClassRow, ScheduleRow } from "@/hooks/useClasses";
import { ClassEligibilityBadge } from "@/components/ClassEligibilityBadge";
import { formatCRC } from "@/lib/currency";
import { formatSpaDate, formatSpaTime } from "@/lib/businessHours";
import { RichText } from "@/components/ui/rich-text";
import { framed } from "@/lib/imageFrame";
import { classRequestHref } from "@/lib/classRequests";
import { useClassVideo } from "@/lib/classVideos";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useTranslation } from "react-i18next";

// Branded default shown whenever a class has no image (or a broken one).
const fallbackImg = "/class-placeholder.jpg";

/**
 * "Watch video" for a class or event that has one (Admin → Edit Event → Event
 * video): the card keeps its photo; the button opens the video large, with sound.
 */
export function WatchVideoButton({ classId, title }: { classId: string; title: string }) {
  const { t } = useTranslation();
  const url = useClassVideo(classId);
  const [open, setOpen] = useState(false);
  if (!url) return null;
  return (
    <>
      <Button variant="ghost" size="default" className="min-w-[140px] rounded-full gap-2" onClick={() => setOpen(true)}>
        <Play className="h-4 w-4" />
        {t("classes.watchVideo", { defaultValue: "Watch video" })}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl p-3 pt-12 sm:p-4 sm:pt-12">
          <DialogTitle className="sr-only">{title}</DialogTitle>
          {/* Mounted only while open, so it starts when opened and stops when closed. */}
          {open && (
            <video
              src={url}
              controls
              autoPlay
              playsInline
              preload="metadata"
              className="w-full max-h-[75dvh] rounded-lg bg-black"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

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
          {...framed(cls.image_url || fallbackImg)}
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
          {formatSpaDate(event.start_time)} · {formatSpaTime(event.start_time)}
          {cls.location && <> &nbsp;|&nbsp; {cls.location}</>}
        </p>

        {/* Description */}
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

        {/* Instructor */}
        {((event as any).instructor?.trim() || cls.instructor) && (
          <p className="font-body text-xs text-muted-foreground">
            with <span className="font-medium text-foreground">{(event as any).instructor?.trim() || cls.instructor}</span>
          </p>
        )}

        {/* Price */}
        {((cls as any).price_label || Number(cls.price) > 0) && (
          <p className="font-heading text-base font-semibold text-foreground">
            {(cls as any).price_label || formatCRC(cls.price)}
          </p>
        )}

        {/* RSVP Button */}
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {soldOut ? (
            <span className="font-body text-sm font-semibold text-destructive">Sold Out</span>
          ) : (
            <Button variant="outline" size="default" className="min-w-[140px] rounded-full" asChild>
              <Link to={`/class-booking?class=${event.id}`}>RSVP</Link>
            </Button>
          )}
          <WatchVideoButton classId={cls.id} title={cls.title} />
        </div>
      </div>
    </div>
  );
}

/**
 * A special event offered on request: no date on the schedule yet, so instead
 * of RSVP it opens the request form with the event named (see classRequests.ts).
 */
export function RequestEventCard({ cls }: { cls: ClassRow }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const isLong = (cls.description?.length ?? 0) > 180;

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden flex flex-col md:flex-row group hover:shadow-lg transition-shadow">
      <div className="md:w-[320px] shrink-0 aspect-[4/3] md:aspect-auto overflow-hidden">
        <img
          {...framed(cls.image_url || fallbackImg)}
          alt={cls.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
          onError={(e) => { const el = e.currentTarget as HTMLImageElement; if (el.src !== window.location.origin + fallbackImg) el.src = fallbackImg; }}
        />
      </div>

      <div className="flex-1 p-6 flex flex-col justify-center text-center gap-3">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="inline-block text-xs font-body font-semibold uppercase tracking-wider text-spa-sage border border-spa-sage/40 rounded-full px-3 py-1">
            {t("classes.onRequest", { defaultValue: "On request" })}
          </span>
        </div>

        <h3 className="font-heading text-xl md:text-2xl font-medium text-foreground">
          {cls.title}
        </h3>

        <p className="font-body text-sm text-muted-foreground">
          {t("classes.dateOnRequest", { defaultValue: "Date on request" })}
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

        {(cls.price_label || Number(cls.price) > 0) && (
          <p className="font-heading text-base font-semibold text-foreground">
            {cls.price_label || formatCRC(cls.price)}
          </p>
        )}

        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <Button variant="outline" size="default" className="min-w-[140px] rounded-full" asChild>
            <Link to={classRequestHref(cls.title)}>{t("classes.requestEvent", { defaultValue: "Request" })}</Link>
          </Button>
          <WatchVideoButton classId={cls.id} title={cls.title} />
        </div>
      </div>
    </div>
  );
}
