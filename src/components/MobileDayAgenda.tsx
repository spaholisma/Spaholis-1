import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { CalendarOff, ChevronLeft, ChevronRight, Clock, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ScheduleRow } from "@/hooks/useClasses";
import { spaDateKey, type ClassClosure } from "@/lib/classClosures";
import { formatSpaTime } from "@/lib/businessHours";
import { isClassOpenForBooking } from "@/lib/classBookingWindow";
import { ClassEligibilityBadge } from "@/components/ClassEligibilityBadge";
import { useLanguage } from "@/i18n/LanguageProvider";
import { cn } from "@/lib/utils";

/** How many days ahead the strip reaches (the schedule loads five weeks). */
export const AGENDA_DAYS = 28;

/** "2026-10-13" + n days, on the studio's calendar. */
export const addDayKey = (key: string, n: number) =>
  new Date(Date.parse(`${key}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** The days on the strip: today (studio time) and the next ones. */
export function agendaDays(now = new Date(), count = AGENDA_DAYS): string[] {
  const today = spaDateKey(now);
  return Array.from({ length: count }, (_, i) => addDayKey(today, i));
}

/** Classes still bookable, by studio day, in time order. */
export function classesByDay(events: ScheduleRow[], now = Date.now()): Map<string, ScheduleRow[]> {
  const map = new Map<string, ScheduleRow[]>();
  for (const e of [...events].sort((a, b) => a.start_time.localeCompare(b.start_time))) {
    if (!isClassOpenForBooking(new Date(e.start_time), now)) continue;
    const k = spaDateKey(e.start_time);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(e);
  }
  return map;
}

const teacherOf = (e: ScheduleRow) => ((e as any).instructor?.trim() || e.classes.instructor?.trim() || "");

/**
 * The class schedule on a phone: one day at a time. A strip of dates to tap or
 * slide (dots show how many classes a day has), today first; swipe the list
 * left or right for the next or previous day. A day with nothing on it points
 * to the next class instead of leaving the guest at a dead end.
 */
export function MobileDayAgenda({ events, closures = [], initialDay }: {
  events: ScheduleRow[];
  closures?: ClassClosure[];
  initialDay?: string | null;
}) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const locale = language === "es" ? "es-CR" : "en-US";
  const days = useMemo(() => agendaDays(), []);
  const today = days[0];
  const byDay = useMemo(() => classesByDay(events), [events]);
  const closedOn = useMemo(() => new Map(closures.map((c) => [c.closed_date, c])), [closures]);

  const [selected, setSelected] = useState(() => (initialDay && days.includes(initialDay) ? initialDay : today));
  const [dir, setDir] = useState(0);
  const go = (key: string) => {
    if (!days.includes(key) || key === selected) return;
    setDir(key > selected ? 1 : -1);
    setSelected(key);
  };
  const step = (n: number) => go(addDayKey(selected, n));

  // Keep the chosen date in the middle of the strip.
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = strip.current;
    const pill = box?.querySelector<HTMLElement>(`[data-day="${selected}"]`);
    if (!box || !pill) return;
    const left = pill.offsetLeft - box.clientWidth / 2 + pill.clientWidth / 2;
    if (typeof box.scrollTo === "function") box.scrollTo({ left, behavior: "smooth" });
    else box.scrollLeft = left;
  }, [selected]);

  // Swipe the list to change day.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touch.current; touch.current = null;
    if (!s) return;
    const dx = e.changedTouches[0].clientX - s.x;
    const dy = e.changedTouches[0].clientY - s.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
  };

  const fmt = (key: string, o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...o }).format(new Date(`${key}T12:00:00Z`));
  const dayName = (key: string) =>
    key === today ? t("classes.agenda.today", { defaultValue: "Today" })
    : key === addDayKey(today, 1) ? t("classes.agenda.tomorrow", { defaultValue: "Tomorrow" })
    : fmt(key, { weekday: "long" });

  const list = byDay.get(selected) ?? [];
  const closed = closedOn.get(selected);
  const nextKey = days.find((k) => k > selected && (byDay.get(k)?.length ?? 0) > 0) ?? null;
  const next = nextKey ? byDay.get(nextKey)![0] : null;

  return (
    <div className="overflow-x-clip">
      {/* Month, and a way back to today */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="font-heading text-lg capitalize text-foreground">{fmt(selected, { month: "long", year: "numeric" })}</p>
        <div className="flex items-center gap-1">
          {selected !== today && (
            <button
              type="button"
              onClick={() => go(today)}
              className="rounded-full border border-spa-sage/40 px-3 py-1 font-body text-xs font-semibold text-spa-sage transition-colors active:bg-spa-sage/10"
            >
              {t("classes.agenda.today", { defaultValue: "Today" })}
            </button>
          )}
          <button type="button" aria-label={t("classes.agenda.prev", { defaultValue: "Previous day" })}
            onClick={() => step(-1)} disabled={selected === today}
            className="flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-colors active:bg-muted disabled:opacity-30">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button type="button" aria-label={t("classes.agenda.next", { defaultValue: "Next day" })}
            onClick={() => step(1)} disabled={selected === days[days.length - 1]}
            className="flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-colors active:bg-muted disabled:opacity-30">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* The strip of dates */}
      <div
        ref={strip}
        role="tablist"
        aria-label={t("classes.agenda.pickDay", { defaultValue: "Choose a day" })}
        className="no-scrollbar -mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-3 pt-1"
      >
        {days.map((key) => {
          const n = byDay.get(key)?.length ?? 0;
          const isSel = key === selected;
          const isClosed = closedOn.has(key);
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={isSel}
              data-day={key}
              onClick={() => go(key)}
              className={cn(
                "relative flex h-[76px] w-14 shrink-0 snap-center flex-col items-center justify-center rounded-2xl border transition-all duration-300",
                isSel
                  ? "scale-105 border-transparent bg-spa-charcoal text-spa-cream shadow-lg shadow-spa-charcoal/25"
                  : isClosed
                    ? "border-dashed border-border bg-muted/40 text-muted-foreground/60"
                    : n > 0
                      ? "border-spa-sage/30 bg-spa-sage/10 text-foreground"
                      : "border-border/60 bg-background text-muted-foreground",
                key === today && !isSel && "ring-2 ring-spa-sage/60 ring-offset-1 ring-offset-background",
              )}
            >
              <span className="font-body text-[11px] font-semibold uppercase tracking-wider">{fmt(key, { weekday: "short" }).replace(".", "")}</span>
              <span className={cn("font-heading text-xl leading-none mt-1", isClosed && !isSel && "line-through")}>{fmt(key, { day: "numeric" })}</span>
              <span className="mt-1.5 flex h-1.5 items-center gap-0.5">
                {Array.from({ length: Math.min(n, 3) }, (_, i) => (
                  <span key={i} className={cn("h-1.5 w-1.5 rounded-full", isSel ? "bg-spa-cream" : "bg-spa-sage")} />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      {/* The chosen day — swipe for the next one */}
      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} className="min-h-[320px] pt-3">
        {/* The new day slides in at once — it never waits on the old one to leave. */}
          <motion.div
            key={selected}
            initial={dir ? { opacity: 0, x: dir * 40 } : false}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <h2 className="font-heading text-2xl capitalize text-foreground">
                {dayName(selected)}
                <span className="ml-2 font-body text-sm font-normal normal-case text-muted-foreground">
                  {fmt(selected, { month: "long", day: "numeric" })}
                </span>
              </h2>
              {list.length > 0 && (
                <span className="shrink-0 rounded-full bg-spa-sage/15 px-2.5 py-1 font-body text-[11px] font-semibold uppercase tracking-wider text-spa-sage">
                  {t("classes.agenda.count", { count: list.length, defaultValue: list.length === 1 ? "1 class" : "{{count}} classes" })}
                </span>
              )}
            </div>

            {closed ? (
              <EmptyDay
                icon={<CalendarOff className="h-6 w-6 text-spa-sage" />}
                title={t("classes.agenda.closed", { defaultValue: "The studio is closed" })}
                text={closed.reason || undefined}
                next={next} nextKey={nextKey} onNext={go} fmt={fmt} t={t}
              />
            ) : list.length === 0 ? (
              <EmptyDay
                icon={<Sparkles className="h-6 w-6 text-spa-sage" />}
                title={selected === today
                  ? t("classes.agenda.noneToday", { defaultValue: "No more classes today" })
                  : t("classes.agenda.none", { defaultValue: "No classes on this day" })}
                next={next} nextKey={nextKey} onNext={go} fmt={fmt} t={t}
              />
            ) : (
              <ol className="relative space-y-3 before:absolute before:bottom-3 before:left-[4.25rem] before:top-3 before:w-px before:bg-spa-sage/25">
                {list.map((e) => <AgendaClass key={e.id} event={e} />)}
              </ol>
            )}

            <p className="mt-6 text-center font-body text-[11px] text-muted-foreground">
              {t("classes.agenda.swipeHint", { defaultValue: "Swipe left or right to see another day" })}
            </p>
          </motion.div>
      </div>
    </div>
  );
}

function EmptyDay({ icon, title, text, next, nextKey, onNext, fmt, t }: {
  icon: React.ReactNode; title: string; text?: string;
  next: ScheduleRow | null; nextKey: string | null; onNext: (k: string) => void;
  fmt: (key: string, o: Intl.DateTimeFormatOptions) => string;
  t: (k: string, o?: any) => string;
}) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-spa-sage/40 bg-spa-sage/5 px-5 py-8 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-spa-sage/15">{icon}</span>
      <p className="mt-3 font-heading text-lg text-foreground">{title}</p>
      {text && <p className="mt-1 font-body text-sm text-muted-foreground">{text}</p>}
      {next && nextKey && (
        <button
          type="button"
          onClick={() => onNext(nextKey)}
          className="mt-5 w-full rounded-2xl bg-spa-charcoal px-4 py-3 text-left text-spa-cream shadow-md transition-transform active:scale-[0.98]"
        >
          <span className="block font-body text-[11px] font-semibold uppercase tracking-[0.16em] text-spa-cream/70">
            {t("classes.agenda.nextClass", { defaultValue: "Next class" })} · {fmt(nextKey, { weekday: "short", month: "short", day: "numeric" })}
          </span>
          <span className="mt-0.5 flex items-center justify-between gap-2">
            <span className="font-heading text-base leading-tight">{next.classes.title} · {formatSpaTime(next.start_time)}</span>
            <ChevronRight className="h-4 w-4 shrink-0" />
          </span>
        </button>
      )}
    </div>
  );
}

function AgendaClass({ event }: { event: ScheduleRow }) {
  const { t } = useTranslation();
  const cls = event.classes;
  const time = formatSpaTime(event.start_time);
  // "8:00 AM" — browsers may put a narrow no-break space before AM.
  const [clock, ampm = ""] = time.split(/\s+/);
  const soldOut = event.spots_remaining <= 0;
  const low = !soldOut && event.spots_remaining <= 3;
  const teacher = teacherOf(event);
  return (
    <li className="relative flex items-stretch gap-3">
      <div className="w-14 shrink-0 pt-3 text-right">
        <p className="font-heading text-lg leading-none text-foreground">{clock}</p>
        <p className="mt-0.5 font-body text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{ampm}</p>
      </div>
      <span aria-hidden className="relative z-10 mt-4 h-3 w-3 shrink-0 rounded-full border-2 border-background bg-spa-sage shadow" />
      <Link
        to={`/class-booking?class=${event.id}`}
        aria-disabled={soldOut}
        className={cn(
          "group min-w-0 flex-1 rounded-2xl border bg-card p-4 shadow-sm transition-all active:scale-[0.98]",
          soldOut ? "pointer-events-none border-border opacity-60" : "border-spa-sage/25 hover:border-spa-sage/50 hover:shadow-md",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-heading text-lg leading-tight text-foreground">{cls.title}</h3>
          <span className={cn(
            "shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 font-body text-[11px] font-bold uppercase tracking-wide",
            soldOut ? "bg-muted text-muted-foreground" : low ? "bg-destructive/10 text-destructive" : "bg-spa-sage/15 text-spa-sage",
          )}>
            {soldOut ? t("classes.agenda.soldOut", { defaultValue: "Sold out" })
              : low ? t("classes.agenda.left", { count: event.spots_remaining, defaultValue: "{{count}} left" })
              : t("classes.agenda.open", { defaultValue: "Open" })}
          </span>
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-body text-xs text-muted-foreground">
          {teacher && <span>{t("classes.agenda.with", { name: teacher, defaultValue: "with {{name}}" })}</span>}
          {cls.duration_minutes > 0 && (
            <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{cls.duration_minutes} min</span>
          )}
        </p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <ClassEligibilityBadge classId={cls.id} size="sm" />
          {!soldOut && (
            <span className="ml-auto inline-flex items-center gap-1 font-body text-xs font-semibold text-spa-sage">
              {t("classes.agenda.book", { defaultValue: "Book" })}
              <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          )}
        </div>
      </Link>
    </li>
  );
}
