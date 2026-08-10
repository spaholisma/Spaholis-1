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
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative overflow-hidden rounded-3xl border border-spa-sage/30 shadow-lg"
      style={{ background: "linear-gradient(135deg, #1f5f6b 0%, #16424b 100%)" }}
    >
      <div className="grid md:grid-cols-2 items-stretch">
        {/* Image */}
        {cls.image_url && (
          <div className="relative aspect-square md:aspect-auto md:min-h-[320px] overflow-hidden">
            <img src={cls.image_url} alt={cls.title} className="w-full h-full object-cover" loading="eager" />
          </div>
        )}

        {/* Content */}
        <div className="p-6 sm:p-8 lg:p-10 flex flex-col justify-center text-spa-cream">
          <div className="inline-flex items-center self-start rounded-full bg-spa-cream/15 px-3 py-1 mb-4">
            <span className="font-body text-[11px] font-semibold uppercase tracking-[0.18em]">Special event</span>
          </div>

          <h2 className="font-heading text-2xl sm:text-3xl lg:text-4xl font-semibold leading-tight mb-3">
            {cls.title}
          </h2>

          {variant === "full" && cls.description && (
            <p className="font-body text-sm sm:text-base text-spa-cream/85 leading-relaxed mb-5 whitespace-pre-line">
              {cls.description}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-6 font-body text-sm text-spa-cream/90">
            <span className="inline-flex items-center gap-1.5 capitalize">
              <CalendarDays className="h-4 w-4" /> {dateLabel}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-4 w-4" /> {timeLabel} · {cls.duration_minutes} min
            </span>
            {priceLabel && (
              <span className="font-heading text-lg font-semibold text-spa-cream">{priceLabel}</span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="bg-spa-cream text-[#16424b] hover:bg-white">
              <Link to={bookHref}>Reserve your spot</Link>
            </Button>
            {cls.instructor && (
              <span className="font-body text-sm text-spa-cream/70">with {cls.instructor}</span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
