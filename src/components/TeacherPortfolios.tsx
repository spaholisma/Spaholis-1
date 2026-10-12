import { useMemo } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { richTextToPlain } from "@/components/ui/rich-text";
import { spaLocalParts, formatSpaTime } from "@/lib/businessHours";
import { cn } from "@/lib/utils";
import { EVENT_CATEGORIES, type ScheduleRow } from "@/hooks/useClasses";
import { fromPrice, offeringsOf, usePrivateOfferings, type PrivateOffering } from "@/lib/privateOfferings";
import { formatCRCWithUsd, USD_RATE } from "@/lib/currency";
import { useSiteContent } from "@/hooks/useSiteContent";
import { content as contentDefaults } from "@/data/content";
import { sizedImage } from "@/lib/sizedImage";

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
  /** What she teaches, from her About Us card (e.g. "Yoga Instructor"). */
  role?: string | null;
  teacherId: string | null;
  classes: ClassBlock[];
  passes: Pass[];
  /** Her private classes, at her own prices. */
  privates: PrivateOffering[];
}

/** A session is a one-off event (workshop, special event…), not a weekly class. */
export const isEventBlock = (b: ClassBlock) => EVENT_CATEGORIES.has(String(b.cls?.category ?? ""));

/** "1 class", "2 events", "1 class & 1 event" — what is on her schedule. */
export function scheduleLabel(blocks: ClassBlock[]): string {
  const events = blocks.filter(isEventBlock).length;
  const classes = blocks.length - events;
  return [classes ? plural(classes, "class", "classes") : "", events ? plural(events, "event") : ""]
    .filter(Boolean).join(" & ");
}

/** A small "Class" / "Event" tag, so a weekly class and a one-off event read differently. */
export function KindBadge({ event, className }: { event: boolean; className?: string }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-full px-2 py-0.5 font-body text-[11px] font-semibold uppercase tracking-wider",
      event ? "bg-amber-100 text-amber-800" : "bg-spa-sage/15 text-spa-sage",
      className,
    )}>
      {event ? "Event" : "Class"}
    </span>
  );
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
    staleTime: 0, // fresh on every page: a teacher's change shows at once
    refetchOnWindowFocus: true,
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
    staleTime: 0, // fresh on every page: a teacher's change shows at once
    refetchOnWindowFocus: true,
  });
}

/**
 * The usual teacher of each active class (classes.instructor), with a class
 * picture — so a teacher keeps her portfolio in a week with no class of hers,
 * registered or not.
 */
function useClassTeachers() {
  return useQuery({
    queryKey: ["class-usual-teachers"],
    queryFn: async () => {
      const { data, error } = await sb.from("classes").select("instructor, image_url").eq("is_active", true);
      if (error) throw error;
      return ((data ?? []) as { instructor: string | null; image_url: string | null }[])
        .map((c) => ({ name: (c.instructor ?? "").trim().replace(/\s+/g, " "), image_url: c.image_url }))
        .filter((c) => c.name);
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
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
  const { data: classTeachers = [], isLoading: l4 } = useClassTeachers();
  // The instructors on About Us (editable in the Content editor): their photo,
  // role and bio stand in for a teacher who is not registered yet.
  const { data: siteContent } = useSiteContent();
  const team = (((siteContent as any)?.about?.instructors ?? (contentDefaults as any).about?.instructors ?? []) as
    { name?: string; role?: string; bio?: string; image?: string }[]);

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
      // With no class this week, the picture of a class she usually teaches stands in.
      const usualImage = classTeachers.find((c) => c.name.toLowerCase() === key && c.image_url)?.image_url ?? null;
      // Her About Us card: the same name, or the same first name ("Melanie Moss" ↔ "Melanie").
      const firstOf = (s: string) => s.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
      const member = team.find((m) => (m.name ?? "").trim().toLowerCase() === key)
        ?? team.find((m) => firstOf(m.name ?? "") && firstOf(m.name ?? "") === firstOf(name));
      const memberPhoto = member?.image ? sizedImage(member.image, 900) : null;
      const memberBio = member?.bio ? richTextToPlain(member.bio).trim() || null : null;
      return {
        key: `teacher:${name}`,
        teacher: name,
        slug: teacherSlug(name),
        title: name,
        subtitle: classes.length
          ? scheduleLabel(classes)
          : privates.length ? plural(privates.length, "private class", "private classes")
          : member?.role?.trim() || "Holis Wellness Center",
        // Her own photo first (her panel, else her About Us card); a class
        // picture stands in until there is one.
        image: row?.photo_url || memberPhoto || classes.find((c) => c.cls.image_url)?.cls.image_url || usualImage,
        portrait: !!(row?.photo_url || memberPhoto),
        bio: row?.bio?.trim() || memberBio,
        role: member?.role?.trim() || null,
        teacherId: row?.id ?? null,
        classes,
        passes: passes.filter((p) => p.teacher_name.trim().toLowerCase() === key),
        privates,
      };
    };

    const scheduled = [...byTeacher.entries()].filter(([name]) => name).map(([name, rows]) => card(name, rows));
    // Every teacher has her card, also in a week she has no class on the
    // schedule: the registered teachers, and the usual teacher of each active
    // class (classes.instructor) — whether or not she is registered yet.
    const named = new Set(scheduled.map((c) => c.teacher.trim().toLowerCase()));
    const quietNames: string[] = [];
    for (const n of [...teachers.map((t) => t.display_name ?? ""), ...classTeachers.map((c) => c.name)]) {
      const name = n.trim().replace(/\s+/g, " ");
      if (name && !named.has(name.toLowerCase())) { named.add(name.toLowerCase()); quietNames.push(name); }
    }
    const quiet = quietNames.map((name) => card(name, []));
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
  }, [sessions, passes, teachers, allPrivate, classTeachers, team, teachersOnly]);

  return { portfolios, isLoading: l1 || l2 || l3 || l4 };
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
              p.classes.slice(0, 3).map((b) => (
                <li key={b.cls.id} className="flex flex-wrap items-center gap-x-2">
                  <span className="font-medium text-foreground">{b.cls.title}</span>
                  {isEventBlock(b) && <KindBadge event />}
                  {b.when && <span>{b.when}</span>}
                </li>
              ))
            )}
            {p.classes.length > 3 && <li>+ {p.classes.length - 3} more</li>}
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

/**
 * A class nobody is named on yet: the whole card opens the class's own page
 * (details, every date, booking). Once a teacher is put on its sessions it
 * becomes part of her portfolio instead.
 */
function ClassCard({ p }: { p: Portfolio }) {
  const block = p.classes[0];
  if (!block) return <PortfolioHeader p={p} />;
  const { cls, bookable, when } = block;
  return (
    <>
      <Link
        to={`/classes/${cls.id}`}
        aria-label={`${cls.title} — see the class and its dates`}
        className="flex flex-1 flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-spa-sage"
      >
        <PortfolioHeader p={p} />
        <div className="flex flex-1 flex-col gap-2 px-6 py-5">
          <p className="font-body text-xs text-muted-foreground">
            {when}{cls.location && <> &nbsp;|&nbsp; {cls.location}</>}
          </p>
          {cls.description && (
            // Plain words: the card is a link, and a link can't hold another.
            <p className="spa-body-sm line-clamp-3 whitespace-pre-line">{richTextToPlain(cls.description)}</p>
          )}
          <span className="mt-auto inline-flex items-center gap-1 pt-2 font-body text-xs font-semibold uppercase tracking-wider text-primary">
            See the class <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </Link>
      <div className="flex flex-wrap items-center gap-2 border-t border-border px-6 py-4">
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
