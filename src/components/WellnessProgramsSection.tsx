import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useServicesByCategory } from "@/hooks/useServices";
import { useLanguage, withLangPrefix } from "@/i18n/LanguageProvider";
import { formatCRCWithUsd } from "@/lib/currency";
import {
  parseProgramDescription,
  programDuration,
  WELLNESS_PROGRAMS_CATEGORY,
  WELLNESS_PROGRAMS_PATH,
} from "@/lib/wellnessPrograms";

const fade = {
  initial: { opacity: 0, y: 24 } as const,
  whileInView: { opacity: 1, y: 0 } as const,
  viewport: { once: true },
  transition: { duration: 0.6 },
};

/**
 * The Wellness Programs as cards, for pages other than /wellness-programs
 * (e.g. Signature Experiences). Same data as the full page: the services in
 * the "Wellness Programs" category. Renders nothing when there are none.
 */
export function WellnessProgramsSection() {
  const { language } = useLanguage();
  const lp = (path: string) => withLangPrefix(path, language);
  const { grouped, isLoading } = useServicesByCategory();
  const programs = grouped[WELLNESS_PROGRAMS_CATEGORY] ?? [];

  if (!isLoading && programs.length === 0) return null;

  return (
    <section id="wellness-programs" className="scroll-mt-20 bg-card border-y border-border">
      <div className="px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto py-20">
        <motion.div {...fade} className="text-center space-y-4 max-w-2xl mx-auto mb-12">
          <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-spa-sage">Wellness Programs</p>
          <h2 className="font-heading text-3xl sm:text-4xl font-light text-foreground">Awaken. Integrate. Manifest.</h2>
          <p className="font-body text-base text-muted-foreground leading-relaxed">
            90-minute programs that pair a movement class with hands-on bodywork — a complete reset for body and mind.
          </p>
        </motion.div>

        {isLoading ? (
          <div className="grid gap-6 md:grid-cols-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[520px] rounded-2xl" />)}
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-3">
            {programs.map((program, i) => {
              const { phases, summary, includes } = parseProgramDescription(program.description);
              const lead = phases[0]?.text || summary;
              return (
                <motion.article
                  key={program.id}
                  {...fade}
                  transition={{ duration: 0.6, delay: i * 0.1 }}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-background"
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                    {program.image_url && (
                      <img
                        src={program.image_url}
                        alt={program.title}
                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                        loading="lazy"
                      />
                    )}
                    <span className="absolute top-4 left-4 rounded-full bg-background/90 backdrop-blur px-3 py-1 font-body text-[11px] font-semibold uppercase tracking-[0.2em] text-spa-sage">
                      Program {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col gap-4 p-6">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-heading text-2xl font-light text-foreground">{program.title}</h3>
                      <span className="font-heading text-lg font-semibold text-foreground">{formatCRCWithUsd(program.price)}</span>
                    </div>
                    <p className="flex items-center gap-1.5 font-body text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" /> {programDuration(program.duration_minutes)}
                    </p>
                    {lead && <p className="font-body text-sm text-muted-foreground leading-relaxed">{lead}</p>}
                    {includes.length > 0 && (
                      <ul className="space-y-1.5">
                        {includes.map((item) => (
                          <li key={item} className="flex items-start gap-2 font-body text-sm text-foreground/85">
                            <CheckCircle2 className="h-4 w-4 text-spa-sage shrink-0 mt-0.5" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-auto flex flex-col gap-2 pt-2">
                      <Button asChild className="font-body bg-spa-sage hover:bg-spa-sage/90 text-white">
                        <Link to={lp(`/book?service=${program.id}`)}>Request this program</Link>
                      </Button>
                      <Button asChild variant="outline" className="font-body">
                        <Link to={lp(WELLNESS_PROGRAMS_PATH)}>Learn more</Link>
                      </Button>
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </div>
        )}

        <motion.div {...fade} className="mt-10 text-center">
          <Link
            to={lp(WELLNESS_PROGRAMS_PATH)}
            className="inline-flex items-center gap-1.5 font-body text-sm font-semibold text-primary hover:underline"
          >
            Discover all Wellness Programs <ArrowRight className="h-4 w-4" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
