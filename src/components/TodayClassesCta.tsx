import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ScheduleRow } from "@/hooks/useClasses";
import { spaDateKey } from "@/lib/classClosures";
import { SPA_TIMEZONE, formatSpaTime } from "@/lib/businessHours";
import { useLanguage } from "@/i18n/LanguageProvider";
import { cn } from "@/lib/utils";

/** What the button says about today: how many classes are left, and the next one. */
export function todaySummary(events: ScheduleRow[], now = new Date()) {
  const today = spaDateKey(now);
  const upcoming = events
    .filter((e) => new Date(e.start_time).getTime() > now.getTime())
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  const todays = upcoming.filter((e) => spaDateKey(e.start_time) === today);
  const next = todays[0] ?? upcoming[0] ?? null;
  return {
    today,
    count: todays.length,
    next,
    /** The day the schedule should open on: today, or the next day with a class. */
    openDay: todays.length ? today : next ? spaDateKey(next.start_time) : today,
  };
}

/**
 * The way into the class calendar, first on the Classes page: a live line
 * about today ("2 classes today · next at 5:00 PM") so it reads as "come and
 * see", not as one more link. It opens the calendar on today — or on the next
 * day with a class when today has none left.
 */
export function TodayClassesCta({ events, loading }: { events: ScheduleRow[]; loading?: boolean }) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const s = todaySummary(events);
  const locale = language === "es" ? "es-CR" : "en-US";
  const todayLabel = new Intl.DateTimeFormat(locale, {
    timeZone: SPA_TIMEZONE, weekday: "long", month: "long", day: "numeric",
  }).format(new Date());
  const nextDay = s.next
    ? new Intl.DateTimeFormat(locale, { timeZone: SPA_TIMEZONE, weekday: "short", month: "short", day: "numeric" })
      .format(new Date(s.next.start_time))
    : "";

  const line = loading
    ? t("classes.todayCta.loading", { defaultValue: "Checking today's schedule…" })
    : s.count > 0 && s.next
      ? t("classes.todayCta.today", {
        count: s.count, title: s.next.classes.title, time: formatSpaTime(s.next.start_time),
        defaultValue: s.count === 1 ? "1 class left today · {{title}} at {{time}}" : "{{count}} classes left today · next: {{title}} at {{time}}",
      })
      : s.next
        ? t("classes.todayCta.next", {
          day: nextDay, title: s.next.classes.title, time: formatSpaTime(s.next.start_time),
          defaultValue: "No more classes today · next: {{title}}, {{day}} at {{time}}",
        })
        : t("classes.todayCta.none", { defaultValue: "See the week's classes and book your spot" });

  return (
    <Link
      to={s.openDay === s.today ? "/classes/schedule" : `/classes/schedule?day=${s.openDay}`}
      aria-label={t("classes.todayCta.title", { defaultValue: "See today's classes" })}
      className={cn(
        "group relative mx-auto flex w-full max-w-xl items-center gap-4 overflow-hidden rounded-3xl",
        "bg-spa-charcoal px-5 py-4 text-left text-spa-cream shadow-lg shadow-spa-charcoal/20",
        "transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-spa-charcoal/25 active:scale-[0.99]",
        "sm:px-6 sm:py-5",
      )}
    >
      {/* A soft glow that drifts across on hover. */}
      <span aria-hidden className="pointer-events-none absolute -left-1/3 top-0 h-full w-1/3 -skew-x-12 bg-white/10 blur-xl transition-transform duration-1000 group-hover:translate-x-[420%]" />
      <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-spa-sage text-spa-cream sm:h-14 sm:w-14">
        <CalendarDays className="h-6 w-6 sm:h-7 sm:w-7" />
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="flex items-center gap-2 font-body text-[11px] font-semibold uppercase tracking-[0.18em] text-spa-cream/70">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          {t("classes.todayCta.eyebrow", { day: todayLabel, defaultValue: "Today · {{day}}" })}
        </span>
        <span className="mt-0.5 block font-heading text-xl leading-tight sm:text-2xl">
          {t("classes.todayCta.title", { defaultValue: "See today's classes" })}
        </span>
        <span className="mt-1 block font-body text-xs leading-snug text-spa-cream/80 sm:text-sm">{line}</span>
      </span>
      <ArrowRight className="relative h-5 w-5 shrink-0 text-spa-cream/80 transition-transform duration-300 group-hover:translate-x-1" />
    </Link>
  );
}
