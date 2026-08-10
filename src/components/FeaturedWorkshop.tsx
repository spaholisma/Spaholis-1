import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CalendarDays, Clock } from "lucide-react";
import { useUpcomingEvents, type ScheduleRow } from "@/hooks/useClasses";
import { useLanguage } from "@/i18n/LanguageProvider";
import { formatCRC } from "@/lib/currency";

/**
 * A prominent, self-hiding highlight for a one-off featured class/workshop.
 * Shows the soonest upcoming event whose class has `featured_until` in the
 * future. Renders nothing when there is no active featured event, so it can be
 * dropped onto any page and simply disappears after the date passes.
 */
/** The soonest upcoming event whose class is featured and still active. */
export function useFeaturedEvent(): ScheduleRow | undefined {
  const { data: events } = useUpcomingEvents();
  const now = Date.now();
  return (events ?? [])
    .filter((e) => {
      const until = (e.classes as any)?.featured_until;
      return until && new Date(until).getTime() > now && new Date(e.start_time).getTime() > now;
    })
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())[0];
}

export function FeaturedWorkshop({ variant = "full" }: { variant?: "full" | "compact" }) {
  const featured = useFeaturedEvent();
  const { language } = useLanguage();

  if (!featured) return null;

  // Format in the site's language (default English), not the browser locale.
  const locale = language === "es" ? "es-CR" : "en-US";
  const cls = featured.classes;
  const start = new Date(featured.start_time);
  const dateLabel = start.toLocaleDateString(locale, {
    weekday: "long", month: "long", day: "numeric", timeZone: "America/Costa_Rica",
  });
  const timeLabel = start.toLocaleTimeString(locale, {
    hour: "numeric", minute: "2-digit", timeZone: "America/Costa_Rica",
  });
  const priceLabel = (cls as any).price_label
    || (Number(cls.price) > 0 ? formatCRC(cls.price) : "");
  const bookHref = `/class-booking?class=${featured.id}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative overflow-hidden rounded-2xl border border-spa-sage/30 shadow-md"
      style={{ background: "linear-gradient(135deg, #1f5f6b 0%, #16424b 100%)" }}
    >
      <div className="grid md:grid-cols-[38%_1fr] items-stretch">
        {/* Image */}
        {cls.image_url && (
          <div className="relative h-36 sm:h-44 md:h-auto md:min-h-[200px] overflow-hidden bg-[#16424b]">
            <img src={cls.image_url} alt={cls.title} className="w-full h-full object-cover object-center" loading="eager" />
          </div>
        )}

        {/* Content */}
        <div className="p-4 sm:p-5 md:p-6 flex flex-col justify-center text-spa-cream">
          <span className="self-start rounded-full bg-spa-cream/15 px-2.5 py-0.5 mb-2 font-body text-[10px] font-semibold uppercase tracking-[0.16em]">
            Special event
          </span>

          <h2 className="font-heading text-lg sm:text-xl md:text-2xl font-semibold leading-tight mb-1.5">
            {cls.title}
          </h2>

          {variant === "full" && cls.description && (
            <p className="font-body text-[13px] sm:text-sm text-spa-cream/80 leading-relaxed mb-3 line-clamp-3 md:line-clamp-4">
              {cls.description}
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
      </div>
    </motion.div>
  );
}
