import { useMemo } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { RichText } from "@/components/ui/rich-text";
import { spaLocalParts, formatSpaTime } from "@/lib/businessHours";
import { cn } from "@/lib/utils";
import type { ScheduleRow } from "@/hooks/useClasses";
import { fromPrice, offeringsOf, usePrivateOfferings, type PrivateOffering } from "@/lib/privateOfferings";
import { formatCRCWithUsd, USD_RATE } from "@/lib/currency";

const sb = supabase as any;
const DAY_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const fallbackImg = "/class-placeholder.jpg";

export interface Pass {
  membership_id: string; teacher_name: string; membership_name: string; price: number | null;
  classes_included: number | null; valid_days: number | null; description: string | null;
  payment_link: string | null; payment_note: string | null;
  teacher_payment_instructions: string | null;
  teacher_accepts_paypal?: boolean | null;
  teacher_compraclick_url?: string | null;
}
interface TeacherRow { id: string; display_name: string; photo_url: string | null; bio: string | null }
export interface ClassBlock {
  cls: ScheduleRow["classes"];
  bookable?: ScheduleRow;
  when: string;
}
export interface Portfolio {
  key: string;
  /** A teacher's name, or "" for classes nobody is named on yet. */
  teacher: string;
  /** Her page: /teachers/<slug>. Empty for a class nobody is named on. */
  slug: string;
  title: string;
  subtitle: string;
  image: string | null;
  /** True when the image is the teacher herself, not one of her classes. */
  portrait: boolean;
  bio: string | null;
  teacherId: string | null;
  classes: ClassBlock[];
  passes: Pass[];
  /** Her private classes, at her own prices. */
  privates: PrivateOffering[];
}

/** "Evelina Bolognini" → "evelina-bolognini": the address of her page. */
export const teacherSlug = (name: string) =>
  name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export const teacherPath = (name: string, section?: "classes" | "private" | "passes") =>
  `/teachers/${teacherSlug(name)}${section ? `#${section}` : ""}`;

/** Every active teacher, for the portfolios — also the ones with no class this week. */
export function usePublicTeachers() {
  return useQuery({
    queryKey: ["public-teachers"],
    queryFn: async () => {
      const { data, error } = await sb.rpc("public_teachers");
      if (error) throw error;
      return (data ?? []) as TeacherRow[];
    },
    staleTime: 60_000,
  });
}

/** The passes each teacher sells — hers, not the studio's. */
function useTeacherPasses() {
  return useQuery({
    queryKey: ["public-teacher-portfolios"],
    queryFn: async () => {
      const { data, error } = await sb.rpc("public_teacher_portfolios");
      if (error) throw error;
      return (data ?? []) as Pass[];
    },
    staleTime: 60_000,
  });
}

/** A teacher's name for a session: the per-session one wins, else the class's. */
const instructorOf = (s: ScheduleRow) =>
  ((s as any).instructor?.trim() || s.classes.instructor?.trim() || "");

/** Initials for the monogram — two letters at most. */
export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");

/** Collapse a class's sessions into "Mon · Wed | 8:00 AM" and the next free spot. */
function toBlock(group: ScheduleRow[]): ClassBlock {
  const sorted = [...group].sort((a, b) => a.start_time.localeCompare(b.start_time));
  const days = [...new Set(sorted.map((s) => spaLocalParts(new Date(s.start_time)).weekday))]
    .sort((a, b) => a - b).map((d) => DAY_LABEL[d]);
  const times = [...new Set(sorted.map((s) => formatSpaTime(s.start_time)))];
  return {
    cls: sorted[0].classes,
    bookable: sorted.find((s) => s.spots_remaining > 0),
    when: [days.join(" · "), times.length === 1 ? times[0] : null].filter(Boolean).join("  |  "),
  };
}

const byClass = (rows: ScheduleRow[]) =>
  Object.values(rows.reduce<Record<string, ScheduleRow[]>>((acc, s) => {
    (acc[s.class_id] ??= []).push(s);
    return acc;
  }, {}));

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Who teaches here, and what each of them offers: one portfolio per teacher —
 * her classes, her private classes and the passes she sells (hers, not the
 * studio's, so two teachers can list the same pass at different prices).
 * Every active teacher has one, also in a week with no class of hers.
 *
 * A class nobody is named on keeps a card of its own rather than disappearing
 * (left out with `teachersOnly`), so the page reads well while teachers are
 * still being assigned to sessions.
 */
export function useTeacherPortfolios(sessions: ScheduleRow[], { teachersOnly = false } = {}) {
  const { data: allPrivate = [], isLoading: l1 } = usePrivateOfferings();
  const { data: passes = [], isLoading: l2 } = useTeacherPasses();
  const { data: teachers = [], isLoading: l3 } = usePublicTeachers();

  const portfolios = useMemo<Portfolio[]>(() => {
    const byTeacher = new Map<string, ScheduleRow[]>();
    for (const s of sessions) {
      const key = instructorOf(s);
      if (!byTeacher.has(key)) byTeacher.set(key, []);
      byTeacher.get(key)!.push(s);
    }

    const card = (name: string, rows: ScheduleRow[]): Portfolio => {
      const key = name.trim().toLowerCase();
      const classes = byClass(rows).map(toBlock).sort((a, b) => a.cls.title.localeCompare(b.cls.title));
      const row = teachers.find((t) => t.display_name.trim().toLowerCase() === key);
      const privates = offeringsOf(allPrivate, name);
      return {
        key: `teacher:${name}`,
        teacher: name,
        slug: teacherSlug(name),
        title: name,
        subtitle: classes.length
          ? plural(classes.length, "class", "classes")
          : privates.length ? plural(privates.length, "private class", "private classes") : "Holis Wellness Center",
        // Her own photo first; a class picture stands in until she sends one.
        image: row?.photo_url || classes.find((c) => c.cls.image_url)?.cls.image_url || null,
        portrait: !!row?.photo_url,
        bio: row?.bio ?? null,
        teacherId: row?.id ?? null,
        classes,
        passes: passes.filter((p) => p.teacher_name.trim().toLowerCase() === key),
        privates,
      };
    };

    const scheduled = [...byTeacher.entries()].filter(([name]) => name).map(([name, rows]) => card(name, rows));
    // Every teacher has her card, also in a week she has no class on the schedule.
    const named = new Set(scheduled.map((c) => c.teacher.trim().toLowerCase()));
    const quiet = teachers
      .filter((t) => t.display_name?.trim() && !named.has(t.display_name.trim().toLowerCase()))
      .map((t) => card(t.display_name.trim(), []));
    const allTeachers = [...scheduled, ...quiet].sort((a, b) => a.teacher.localeCompare(b.teacher));
    if (teachersOnly) return allTeachers;

    // One card per class for the ones with no teacher on them yet.
    const orphans: Portfolio[] = byClass(byTeacher.get("") ?? [])
      .map(toBlock)
      .sort((a, b) => a.cls.title.localeCompare(b.cls.title))
      .map((block) => ({
        key: `class:${block.cls.id}`,
        teacher: "",
        slug: "",
        title: block.cls.title,
        subtitle: "Holis Wellness Center",
        image: block.cls.image_url || null,
        portrait: false,
        bio: null,
        teacherId: null,
        classes: [block],
        passes: [],
        privates: [],
      }));

    return [...allTeachers, ...orphans];
  }, [sessions, passes, teachers, allPrivate, teachersOnly]);

  return { portfolios, isLoading: l1 || l2 || l3 };
}

/** The photo header shared by the cards and the teacher's page. */
export function PortfolioHeader({ p, tall = false }: { p: Portfolio; tall?: boolean }) {
  const isTeacher = !!p.teacher;
  const Title = tall ? "h1" : "h3";
  return (
    <div className={cn("relative overflow-hidden bg-spa-sage/15", tall ? "h-72 sm:h-96" : p.portrait ? "h-56" : "h-40")}>
      {p.image && (
        <img
          src={p.image}
          alt=""
          aria-hidden
          loading={tall ? "eager" : "lazy"}
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105",
            p.portrait && "object-top",
          )}
          onError={(e) => {
            const el = e.currentTarget as HTMLImageElement;
            if (!el.src.endsWith(fallbackImg)) el.src = fallbackImg;
          }}
        />
      )}
      <div className={cn(
        "absolute inset-0",
        p.image ? "bg-gradient-to-t from-black/75 via-black/35 to-black/10" : "bg-gradient-to-br from-spa-sage/25 to-transparent",
      )} />
      <div className={cn("absolute inset-x-0 bottom-0 flex items-end gap-3", tall ? "p-6 sm:p-8" : "p-5")}>
        {isTeacher && (
          <span className={cn(
            "flex shrink-0 items-center justify-center rounded-2xl bg-spa-cream/90 font-heading font-semibold text-spa-charcoal",
            "transition-transform duration-300 group-hover:scale-105",
            tall ? "h-14 w-14 text-lg" : "h-12 w-12 text-base",
          )}>
            {initials(p.teacher)}
          </span>
        )}
        <div className="min-w-0">
          {isTeacher && (
            <p className={cn(
              "font-body text-[11px] font-semibold uppercase tracking-[0.18em]",
              p.image ? "text-spa-cream/80" : "text-muted-foreground",
            )}>
              Teacher
            </p>
          )}
          <Title className={cn(
            "font-heading font-medium truncate",
            tall ? "text-3xl sm:text-4xl" : "text-xl",
            p.image ? "text-spa-cream" : "text-foreground",
          )}>
            {p.title}
          </Title>
          <p className={cn("font-body text-xs truncate", p.image ? "text-spa-cream/75" : "text-muted-foreground")}>
            {p.subtitle}
          </p>
        </div>
      </div>
    </div>
  );
}

/** A teacher's card: a summary that opens her page, with a way to each part of it. */
function TeacherCard({ p }: { p: Portfolio }) {
  const first = p.teacher.split(/\s+/)[0];
  const from = Math.min(...p.privates.map((o) => fromPrice(o) ?? Infinity));
  return (
    <>
      <Link
        to={teacherPath(p.teacher)}
        aria-label={`${p.teacher} — classes, private classes and passes`}
        className="flex flex-1 flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-spa-sage"
      >
        <PortfolioHeader p={p} />
        <div className="flex flex-1 flex-col gap-3 px-6 py-5">
          {p.bio && <p className="spa-body-sm line-clamp-3 whitespace-pre-line">{p.bio}</p>}
          <ul className="space-y-1.5 font-body text-xs text-muted-foreground">
            {p.classes.length === 0 ? (
              <li>No group classes on the schedule right now.</li>
            ) : (
              p.classes.slice(0, 3).map(({ cls, when }) => (
                <li key={cls.id} className="flex flex-wrap gap-x-2">
                  <span className="font-medium text-foreground">{cls.title}</span>
                  {when && <span>{when}</span>}
                </li>
              ))
            )}
            {p.classes.length > 3 && <li>+ {plural(p.classes.length - 3, "more class", "more classes")}</li>}
            {p.privates.length > 0 && (
              <li>
                <span className="font-medium text-foreground">{plural(p.privates.length, "private class", "private classes")}</span>
                {Number.isFinite(from) ? ` · from ${formatCRCWithUsd(from * USD_RATE)}` : ""}
              </li>
            )}
            {p.passes.length > 0 && (
              <li><span className="font-medium text-foreground">{plural(p.passes.length, "pass", "passes")}</span> with {first}</li>
            )}
          </ul>
          <span className="mt-auto inline-flex items-center gap-1 pt-1 font-body text-xs font-semibold uppercase tracking-wider text-primary">
            See {first}'s portfolio <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </Link>
      {(p.classes.length > 0 || p.privates.length > 0 || p.passes.length > 0) && (
        <div className="flex flex-wrap gap-2 border-t border-border px-6 py-4">
          {p.classes.length > 0 && (
            <Button size="sm" variant="outline" className="rounded-full" asChild>
              <Link to={teacherPath(p.teacher, "classes")}>Classes</Link>
            </Button>
          )}
          {p.privates.length > 0 && (
            <Button size="sm" variant="outline" className="rounded-full" asChild>
              <Link to={teacherPath(p.teacher, "private")}>Private classes</Link>
            </Button>
          )}
          {p.passes.length > 0 && (
            <Button size="sm" variant="outline" className="rounded-full" asChild>
              <Link to={teacherPath(p.teacher, "passes")}>Passes</Link>
            </Button>
          )}
        </div>
      )}
    </>
  );
}

/** A class nobody is named on yet: the class itself, reserved from here. */
function ClassCard({ p }: { p: Portfolio }) {
  return (
    <>
      <PortfolioHeader p={p} />
      <div className="flex flex-1 flex-col gap-4 px-6 py-5">
        {p.classes.map(({ cls, bookable, when }) => (
          <div key={cls.id}>
            <p className="font-body text-xs text-muted-foreground mt-0.5">
              {when}{cls.location && <> &nbsp;|&nbsp; {cls.location}</>}
            </p>
            {cls.description && (
              <p className="spa-body-sm mt-2 line-clamp-3 whitespace-pre-line">
                <RichText value={cls.description} />
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {bookable ? (
                <Button size="sm" variant="outline" className="rounded-full" asChild>
                  <Link to={`/classes/${cls.id}`}>Reserve</Link>
                </Button>
              ) : (
                <Link to={`/classes/${cls.id}`} className="font-body text-xs font-semibold uppercase tracking-wider text-primary hover:underline">
                  Full — see other dates
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function TeacherPortfolios({ sessions, teachersOnly = false }: {
  sessions: ScheduleRow[];
  /** Only the teachers' cards — no card for a class with nobody named on it. */
  teachersOnly?: boolean;
}) {
  const { portfolios } = useTeacherPortfolios(sessions, { teachersOnly });
  if (portfolios.length === 0) return null;

  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      {portfolios.map((p, i) => (
        <motion.article
          key={p.key}
          // Animated on mount, not on scroll: a card that never receives its
          // reveal would sit at opacity 0 and the section would look empty.
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: Math.min(i * 0.06, 0.3), ease: "easeOut" }}
          className="group relative flex flex-col overflow-hidden rounded-3xl border border-border bg-card transition-shadow duration-300 hover:shadow-xl"
        >
          {p.teacher ? <TeacherCard p={p} /> : <ClassCard p={p} />}
        </motion.article>
      ))}
    </div>
  );
}
