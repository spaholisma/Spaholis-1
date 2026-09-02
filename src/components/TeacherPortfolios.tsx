import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { RichText } from "@/components/ui/rich-text";
import { spaLocalParts, formatSpaTime } from "@/lib/businessHours";
import { cn } from "@/lib/utils";
import type { ScheduleRow } from "@/hooks/useClasses";

const sb = supabase as any;
const DAY_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const fallbackImg = "/class-placeholder.jpg";
const usd = (n: number) =>
  `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

interface Pass {
  teacher_name: string; membership_name: string; price: number | null;
  classes_included: number | null; valid_days: number | null; description: string | null;
}
interface TeacherRow { display_name: string; photo_url: string | null; bio: string | null }
interface ClassBlock {
  cls: ScheduleRow["classes"];
  bookable?: ScheduleRow;
  when: string;
}
interface Portfolio {
  key: string;
  /** A teacher's name, or "" for classes nobody is named on yet. */
  teacher: string;
  title: string;
  subtitle: string;
  image: string | null;
  /** True when the image is the teacher herself, not one of her classes. */
  portrait: boolean;
  bio: string | null;
  classes: ClassBlock[];
  passes: Pass[];
}

/** A teacher's name for a session: the per-session one wins, else the class's. */
const instructorOf = (s: ScheduleRow) =>
  ((s as any).instructor?.trim() || s.classes.instructor?.trim() || "");

/** Initials for the monogram — two letters at most. */
const initials = (name: string) =>
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

/**
 * Who teaches here, and what each of them offers.
 *
 * The section used to be a stack of class cards, which said nothing about the
 * people running them. A card is now a teacher: her classes, and the passes she
 * sells — hers, not the studio's, so two teachers can list the same pass at
 * different prices.
 *
 * A class nobody is named on keeps a card of its own rather than disappearing or
 * being swept into one giant studio card, so the page reads well while teachers
 * are still being assigned to sessions.
 */
export function TeacherPortfolios({ sessions }: { sessions: ScheduleRow[] }) {
  const [passes, setPasses] = useState<Pass[]>([]);
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);

  useEffect(() => {
    sb.rpc("public_teacher_portfolios").then(({ data }: any) => setPasses((data ?? []) as Pass[]));
    sb.rpc("public_teachers").then(({ data }: any) => setTeachers((data ?? []) as TeacherRow[]));
  }, []);

  const portfolios: Portfolio[] = useMemo(() => {
    const byTeacher = new Map<string, ScheduleRow[]>();
    for (const s of sessions) {
      const key = instructorOf(s);
      if (!byTeacher.has(key)) byTeacher.set(key, []);
      byTeacher.get(key)!.push(s);
    }

    const teacherCards: Portfolio[] = [...byTeacher.entries()]
      .filter(([name]) => name)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, rows]) => {
        const key = name.trim().toLowerCase();
        const classes = byClass(rows).map(toBlock)
          .sort((a, b) => a.cls.title.localeCompare(b.cls.title));
        const row = teachers.find((t) => t.display_name.trim().toLowerCase() === key);
        return {
          key: `teacher:${name}`,
          teacher: name,
          title: name,
          subtitle: `${classes.length} class${classes.length === 1 ? "" : "es"}`,
          // Her own photo first; a class picture stands in until she sends one.
          image: row?.photo_url || classes.find((c) => c.cls.image_url)?.cls.image_url || null,
          portrait: !!row?.photo_url,
          bio: row?.bio ?? null,
          classes,
          passes: passes.filter((p) => p.teacher_name.trim().toLowerCase() === key),
        };
      });

    // One card per class for the ones with no teacher on them yet.
    const orphanCards: Portfolio[] = byClass(byTeacher.get("") ?? [])
      .map(toBlock)
      .sort((a, b) => a.cls.title.localeCompare(b.cls.title))
      .map((block) => ({
        key: `class:${block.cls.id}`,
        teacher: "",
        title: block.cls.title,
        subtitle: "Holis Wellness Center",
        image: block.cls.image_url || null,
        portrait: false,
        bio: null,
        classes: [block],
        passes: [],
      }));

    return [...teacherCards, ...orphanCards];
  }, [sessions, passes, teachers]);

  if (portfolios.length === 0) return null;

  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      {portfolios.map((p, i) => {
        const isTeacher = !!p.teacher;
        return (
          <motion.article
            key={p.key}
            // Animated on mount, not on scroll: a card that never receives its
            // reveal would sit at opacity 0 and the section would look empty.
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: Math.min(i * 0.06, 0.3), ease: "easeOut" }}
            className="group relative flex flex-col overflow-hidden rounded-3xl border border-border bg-card transition-shadow duration-300 hover:shadow-xl"
          >
            {/* Header: the class photo, dimmed, with the name over it */}
            <div className={cn("relative overflow-hidden bg-spa-sage/15", p.portrait ? "h-56" : "h-40")}>
              {p.image && (
                <img
                  src={p.image}
                  alt=""
                  aria-hidden
                  loading="lazy"
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
                p.image
                  ? "bg-gradient-to-t from-black/75 via-black/35 to-black/10"
                  : "bg-gradient-to-br from-spa-sage/25 to-transparent",
              )} />
              <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-5">
                {isTeacher && (
                  <span className={cn(
                    "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
                    "bg-spa-cream/90 font-heading text-base font-semibold text-spa-charcoal",
                    "transition-transform duration-300 group-hover:scale-105",
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
                  <h3 className={cn(
                    "font-heading text-xl font-medium truncate",
                    p.image ? "text-spa-cream" : "text-foreground",
                  )}>
                    {p.title}
                  </h3>
                  <p className={cn(
                    "font-body text-xs truncate",
                    p.image ? "text-spa-cream/75" : "text-muted-foreground",
                  )}>
                    {p.subtitle}
                  </p>
                </div>
              </div>
            </div>

            {/* Her classes */}
            <div className="flex flex-1 flex-col gap-4 px-6 py-5">
              {p.bio && (
                <p className="spa-body-sm line-clamp-3 whitespace-pre-line">{p.bio}</p>
              )}
              {p.classes.map(({ cls, bookable, when }) => (
                <div key={cls.id} className="border-b border-border/60 pb-4 last:border-0 last:pb-0">
                  {isTeacher && (
                    <h4 className="font-heading text-base font-medium text-foreground">{cls.title}</h4>
                  )}
                  <p className="font-body text-xs text-muted-foreground mt-0.5">
                    {when}{cls.location && <> &nbsp;|&nbsp; {cls.location}</>}
                  </p>
                  {cls.description && (
                    <p className="spa-body-sm mt-2 line-clamp-3 whitespace-pre-line">
                      <RichText value={cls.description} />
                    </p>
                  )}
                  <div className="mt-3">
                    {bookable ? (
                      <Button size="sm" variant="outline" className="rounded-full" asChild>
                        <Link to={`/classes/${cls.id}`}>Reserve</Link>
                      </Button>
                    ) : (
                      <Link
                        to={`/classes/${cls.id}`}
                        className="font-body text-xs font-semibold uppercase tracking-wider text-primary hover:underline"
                      >
                        Full — see other dates
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* What she sells. Prices are hers; another teacher's differ. */}
            {p.passes.length > 0 && (
              <div className="border-t border-border bg-muted/30 px-6 py-4">
                <p className="font-body text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Passes with {p.teacher.split(/\s+/)[0]}
                </p>
                <ul className="flex flex-wrap gap-1.5">
                  {p.passes.map((pass) => (
                    <li
                      key={`${pass.teacher_name}-${pass.membership_name}`}
                      className="rounded-full border border-border bg-card px-3 py-1 font-body text-xs text-foreground"
                      title={pass.description ?? undefined}
                    >
                      {pass.membership_name}
                      {pass.price != null && <span className="ml-1.5 font-semibold">{usd(pass.price)}</span>}
                      <span className="ml-1 text-muted-foreground">
                        · {pass.classes_included == null
                            ? "unlimited"
                            : `${pass.classes_included} class${pass.classes_included === 1 ? "" : "es"}`}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="font-body text-[11px] text-muted-foreground mt-2">
                  Paid directly to {p.teacher.split(/\s+/)[0]}.
                </p>
              </div>
            )}
          </motion.article>
        );
      })}
    </div>
  );
}
