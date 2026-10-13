import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useUpcomingEvents } from "@/hooks/useClasses";
import { richTextToPlain } from "@/components/ui/rich-text";
import { sizedImage } from "@/lib/sizedImage";
import { cn } from "@/lib/utils";
import {
  plural, useTeacherPortfolios, type AboutMember, type Portfolio,
} from "@/components/TeacherPortfolios";

const firstName = (s: string) => s.trim().split(/\s+/)[0]?.toLowerCase() ?? "";

/** Her portfolio (the /teachers/<slug> page): the same name, or the same first name. */
export function portfolioFor(member: AboutMember, portfolios: Portfolio[]): Portfolio | null {
  const name = (member.name ?? "").trim().toLowerCase();
  if (!name) return null;
  return portfolios.find((p) => p.teacher.trim().toLowerCase() === name)
    ?? portfolios.find((p) => !!p.teacher && firstName(p.teacher) === firstName(name))
    ?? null;
}

/**
 * The yoga & movement instructors on About Us, as portfolios: a big photo with
 * the name over it, the role, a few words, the classes she teaches — and a way
 * into her page in Classes ("Meet Ashley"), where her schedule, private classes
 * and passes are. On a phone the cards slide sideways.
 *
 * Who is listed, and the photo, role and bio, stay in the Content editor.
 */
export function InstructorPortfolios({ instructors }: { instructors: AboutMember[] }) {
  const { t } = useTranslation();
  const { data: events = [] } = useUpcomingEvents();
  const { portfolios } = useTeacherPortfolios(events, { teachersOnly: true });
  const list = instructors.filter((m) => (m.name ?? "").trim());

  return (
    <div>
      <div className={cn(
        "no-scrollbar -mx-4 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-2",
        "sm:mx-0 sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0 sm:pb-0",
      )}>
        {list.map((m, i) => (
          <InstructorCard key={`${m.name}-${i}`} member={m} portfolio={portfolioFor(m, portfolios)} index={i} />
        ))}
      </div>
      {list.length > 1 && (
        <p className="mt-4 text-center font-body text-xs text-muted-foreground sm:hidden">
          {t("about.swipeTeam", { defaultValue: "Swipe to meet the whole team →" })}
        </p>
      )}
    </div>
  );
}

function InstructorCard({ member, portfolio, index }: { member: AboutMember; portfolio: Portfolio | null; index: number }) {
  const { t } = useTranslation();
  const name = (member.name ?? "").trim();
  const first = name.split(/\s+/)[0] || name;
  const photo = member.image ? sizedImage(member.image, 900) : portfolio?.image ?? null;
  const bio = member.bio ? richTextToPlain(member.bio).trim() : portfolio?.bio ?? "";
  const classTitles = [...new Set((portfolio?.classes ?? []).map((c) => c.cls.title))];
  const shown = classTitles.slice(0, 3);
  const href = portfolio?.slug ? `/teachers/${portfolio.slug}` : null;
  const meet = t("about.meetTeacher", { name: first, defaultValue: "Meet {{name}}" });

  const body = (
    <>
      <div className="relative aspect-[4/5] overflow-hidden rounded-[1.75rem] bg-spa-sage/15 shadow-sm transition-shadow duration-500 group-hover:shadow-xl">
        {photo ? (
          <img
            src={photo}
            alt={name}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover object-top transition-transform duration-700 ease-out group-hover:scale-[1.06]"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center font-heading text-7xl text-spa-sage/40">{name[0]}</span>
        )}
        <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
        {member.role && (
          <span className="absolute left-4 top-4 max-w-[calc(100%-2rem)] rounded-full bg-spa-cream/90 px-3 py-1 font-body text-[11px] font-semibold uppercase tracking-wider text-spa-charcoal backdrop-blur-sm">
            {member.role}
          </span>
        )}
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-5">
          <div className="min-w-0">
            <h3 className="font-heading text-3xl leading-none text-spa-cream drop-shadow">{name}</h3>
            {classTitles.length > 0 && (
              <p className="mt-1.5 font-body text-xs text-spa-cream/80">
                {t("about.teachesCount", {
                  count: classTitles.length,
                  defaultValue: plural(classTitles.length, "class", "classes") + " on the schedule",
                })}
              </p>
            )}
          </div>
          {href && (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-spa-cream text-spa-charcoal transition-all duration-300 group-hover:rotate-45 group-hover:bg-spa-sage group-hover:text-spa-cream">
              <ArrowUpRight className="h-5 w-5" />
            </span>
          )}
        </div>
      </div>

      <div className="px-1 pt-4">
        {bio && <p className="line-clamp-3 font-body text-sm leading-relaxed text-muted-foreground">{bio}</p>}
        {shown.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {shown.map((title) => (
              <span key={title} className="rounded-full border border-spa-sage/30 bg-spa-sage/10 px-2.5 py-1 font-body text-[11px] font-medium text-foreground">
                {title}
              </span>
            ))}
            {classTitles.length > shown.length && (
              <span className="rounded-full px-2 py-1 font-body text-[11px] text-muted-foreground">+{classTitles.length - shown.length}</span>
            )}
          </div>
        )}
        {href && (
          <span className="mt-4 inline-flex items-center gap-1.5 font-body text-sm font-semibold text-spa-sage">
            <span className="relative">
              {meet}
              <span className="absolute -bottom-0.5 left-0 h-px w-full origin-left scale-x-0 bg-spa-sage transition-transform duration-300 group-hover:scale-x-100" />
            </span>
            <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </span>
        )}
      </div>
    </>
  );

  const box = "group block w-[82%] max-w-[340px] shrink-0 snap-center sm:w-[calc(50%-0.625rem)] sm:max-w-none lg:w-[calc(33.333%-0.834rem)]";
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, delay: Math.min(index, 4) * 0.08 }}
      className={box}
    >
      {href ? (
        <Link to={href} aria-label={`${meet} — ${member.role ?? ""}`.trim()} className="block rounded-[1.75rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spa-sage focus-visible:ring-offset-4">
          {body}
        </Link>
      ) : body}
    </motion.div>
  );
}
