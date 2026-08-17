import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CalendarDays, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import { useUpcomingEvents, type ScheduleRow } from "@/hooks/useClasses";
import { useLanguage } from "@/i18n/LanguageProvider";
import { formatCRC } from "@/lib/currency";
import { RichText } from "@/components/ui/rich-text";

/**
 * A prominent, self-hiding highlight for one-off featured classes/workshops.
 * Rotates through every upcoming event whose class has `featured_until` in the
 * future (soonest first). Renders nothing when there are none, so it can be
 * dropped onto any page and simply disappears after the dates pass.
 */
export function useFeaturedEvents(): ScheduleRow[] {
  const { data: events } = useUpcomingEvents();
  const now = Date.now();
  return (events ?? [])
    .filter((e) => {
      const until = (e.classes as any)?.featured_until;
      return until && new Date(until).getTime() > now && new Date(e.start_time).getTime() > now;
    })
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
}

/** The soonest upcoming featured event (kept for callers that just need one). */
export function useFeaturedEvent(): ScheduleRow | undefined {
  return useFeaturedEvents()[0];
}

export function FeaturedWorkshop({ variant = "full" }: { variant?: "full" | "compact" }) {
  const featuredList = useFeaturedEvents();
  const { language } = useLanguage();
  const [idx, setIdx] = useState(0);
  const count = featuredList.length;

  // Auto-rotate through the featured events.
  useEffect(() => {
    if (count <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % count), 5000);
    return () => clearInterval(t);
  }, [count]);
  useEffect(() => {
    if (idx >= count && count > 0) setIdx(0);
  }, [count, idx]);

  if (count === 0) return null;

  const featured = featuredList[Math.min(idx, count - 1)];
  const locale = language === "es" ? "es-CR" : "en-US";
  const cls = featured.classes;
  const start = new Date(featured.start_time);
  const dateLabel = start.toLocaleDateString(locale, {
    weekday: "long", month: "long", day: "numeric", timeZone: "America/Costa_Rica",
  });
  const timeLabel = start.toLocaleTimeString(locale, {
    hour: "numeric", minute: "2-digit", timeZone: "America/Costa_Rica",
  });
  const priceLabel = (cls as any).price_label || (Number(cls.price) > 0 ? formatCRC(cls.price) : "");
  const bookHref = `/class-booking?class=${featured.id}`;

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-spa-sage/30 shadow-md"
      style={{ background: "linear-gradient(135deg, #1f5f6b 0%, #16424b 100%)" }}
    >
      {/* Keyed swap: changing event remounts + fades in (reliable rotation). */}
      <div>
        <motion.div
          key={featured.id}
          initial={{ opacity: 0.35 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="grid md:grid-cols-[38%_1fr] items-stretch"
        >
          {/* Image */}
          {cls.image_url && (
            <div className="relative md:h-auto md:min-h-[190px] overflow-hidden bg-[#16424b]">
              {/* Mobile: show the full flyer (no crop). Desktop: fill the side column. */}
              <img src={cls.image_url} alt={cls.title} className="w-full h-auto md:h-full object-contain md:object-cover object-center" loading="eager" />
            </div>
          )}

          {/* Content */}
          <div className="p-4 sm:p-5 md:p-6 pb-8 md:pb-6 flex flex-col justify-center text-spa-cream">
            <span className="self-start rounded-full bg-spa-cream/15 px-2.5 py-0.5 mb-2 font-body text-[10px] font-semibold uppercase tracking-[0.16em]">
              Special event
            </span>

            <h2 className="font-heading text-lg sm:text-xl md:text-2xl font-semibold leading-tight mb-1.5">
              {cls.title}
            </h2>

            {variant === "full" && cls.description && (
              <p className="hidden md:block font-body text-[13px] sm:text-sm text-spa-cream/80 leading-relaxed mb-3 line-clamp-4">
                <RichText value={cls.description} />
              </p>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-4 font-body text-xs sm:text-sm text-spa-cream/90">
              <span className="inline-flex items-center gap-1.5 capitalize">
                <CalendarDays className="h-3.5 w-3.5" /> {dateLabel}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> {timeLabel} · {cls.duration_minutes} min
              </span>
              {priceLabel && (
                <span className="font-heading text-base font-semibold text-spa-cream">{priceLabel}</span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="sm" className="bg-spa-cream text-[#16424b] hover:bg-white">
                <Link to={bookHref}>Reserve your spot</Link>
              </Button>
              {cls.instructor && (
                <span className="font-body text-xs sm:text-sm text-spa-cream/70">with {cls.instructor}</span>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Prev / next arrows */}
      {count > 1 && (
        <>
          <button
            type="button"
            onClick={() => setIdx((i) => (i - 1 + count) % count)}
            aria-label="Previous event"
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full bg-spa-charcoal/30 hover:bg-spa-charcoal/50 text-spa-cream flex items-center justify-center transition-colors backdrop-blur-sm"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setIdx((i) => (i + 1) % count)}
            aria-label="Next event"
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full bg-spa-charcoal/30 hover:bg-spa-charcoal/50 text-spa-cream flex items-center justify-center transition-colors backdrop-blur-sm"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}

      {/* Rotation dots */}
      {count > 1 && (
        <div className="absolute bottom-3 right-4 flex items-center gap-1.5 z-10">
          {featuredList.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIdx(i)}
              aria-label={`Show featured event ${i + 1}`}
              className={`h-2 rounded-full transition-all ${i === idx ? "w-5 bg-spa-cream" : "w-2 bg-spa-cream/40 hover:bg-spa-cream/70"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
