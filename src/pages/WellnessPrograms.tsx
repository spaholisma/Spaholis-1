import { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Clock,
  CreditCard,
  HandHeart,
  MessageCircle,
  Sparkles,
  Wind,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ServiceDetailModal } from "@/components/ServiceDetailModal";
import { useServicesByCategory, type ServiceRow } from "@/hooks/useServices";
import { useSiteContent, useSiteSeo } from "@/hooks/useSiteContent";
import { content as defaults, seo as seoDefaults, HOLIS_WHATSAPP_URL } from "@/data/content";
import { useLanguage, withLangPrefix } from "@/i18n/LanguageProvider";
import { formatCRCWithUsd } from "@/lib/currency";
import { cn } from "@/lib/utils";
import {
  parseProgramDescription,
  programDuration,
  WELLNESS_PROGRAMS_CATEGORY,
  type PhaseKey,
} from "@/lib/wellnessPrograms";

const fade = {
  initial: { opacity: 0, y: 24 } as const,
  whileInView: { opacity: 1, y: 0 } as const,
  viewport: { once: true },
  transition: { duration: 0.6 },
};

const PHASE_ICONS: Record<PhaseKey, typeof Wind> = { awaken: Wind, integrate: HandHeart, manifest: Sparkles };
const JOURNEY_ICONS = [Wind, HandHeart, Sparkles];
const STEP_ICONS = [ClipboardList, CreditCard, CalendarCheck];

type Copy = typeof defaults.wellnessPrograms;

const WellnessProgramsPage = () => {
  const { language } = useLanguage();
  const lp = (path: string) => withLangPrefix(path, language);
  const { grouped, isLoading } = useServicesByCategory();
  const programs = grouped[WELLNESS_PROGRAMS_CATEGORY] ?? [];
  const [detail, setDetail] = useState<ServiceRow | null>(null);

  const { data: siteContent } = useSiteContent();
  const { data: seoData } = useSiteSeo();
  // Editable from the Content admin; anything missing falls back to the defaults.
  const c: Copy = { ...defaults.wellnessPrograms, ...((siteContent as any)?.wellnessPrograms || {}) };
  const seo = (seoData as any)?.wellnessPrograms || seoDefaults.wellnessPrograms;
  const consultHref = lp(`/book?service=consultation&topic=${encodeURIComponent(WELLNESS_PROGRAMS_CATEGORY)}`);
  const toPrograms = () => document.getElementById("programs")?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className="min-h-screen bg-background overflow-x-clip">
      <SEO title={seo.title} description={seo.description} canonical={seo.canonical} />
      <Navbar />

      {/* Hero */}
      <section className="relative h-[72vh] min-h-[480px] overflow-hidden">
        <img src={c.heroImage} alt={c.heroImageAlt} className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-black/10" />
        <div className="relative z-10 h-full flex flex-col justify-end px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto pb-14">
          <motion.p {...fade} className="font-body text-xs font-semibold uppercase tracking-[0.3em] text-white/80 mb-4">
            {c.heroEyebrow}
          </motion.p>
          <motion.h1 {...fade} className="font-heading text-4xl sm:text-6xl lg:text-7xl font-light text-white max-w-4xl leading-[1.05]">
            {c.heroTitle}
          </motion.h1>
          <motion.p
            {...fade}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="font-body text-base sm:text-lg text-white/85 mt-5 max-w-2xl leading-relaxed"
          >
            {c.heroSubtitle}
          </motion.p>
          <motion.div {...fade} transition={{ duration: 0.6, delay: 0.25 }} className="flex flex-wrap gap-3 mt-8">
            <Button size="lg" onClick={toPrograms} className="font-body bg-spa-sage hover:bg-spa-sage/90 text-white">
              {c.heroPrimary}
            </Button>
            <Button
              size="lg"
              variant="outline"
              asChild
              className="font-body bg-white/10 border-white/40 text-white hover:bg-white/20 hover:text-white backdrop-blur-sm"
            >
              <Link to={consultHref}>{c.heroSecondary}</Link>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Intro */}
      <section className="px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto py-20 text-center">
        <motion.div {...fade} className="space-y-5">
          <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-spa-sage">{c.introEyebrow}</p>
          <h2 className="font-heading text-3xl sm:text-4xl font-light text-foreground leading-tight">{c.introTitle}</h2>
          <p className="font-body text-base text-muted-foreground leading-relaxed max-w-3xl mx-auto">{c.introText}</p>
        </motion.div>
      </section>

      {/* The journey: Awaken · Integrate · Manifest */}
      <section className="bg-card border-y border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 grid gap-10 md:grid-cols-3">
          {c.phases.map((phase, i) => {
            const Icon = JOURNEY_ICONS[i] || Sparkles;
            return (
              <motion.div
                key={phase.title}
                {...fade}
                transition={{ duration: 0.6, delay: i * 0.1 }}
                className="text-center md:text-left"
              >
                <div className="flex items-center gap-3 justify-center md:justify-start mb-4">
                  <span className="font-heading text-4xl font-light text-spa-sage/60">0{i + 1}</span>
                  <span className="h-11 w-11 rounded-full bg-spa-sage/15 flex items-center justify-center">
                    <Icon className="h-5 w-5 text-spa-sage" />
                  </span>
                </div>
                <h3 className="font-heading text-2xl font-light tracking-wide text-foreground">{phase.title}</h3>
                <p className="font-body text-sm text-muted-foreground leading-relaxed mt-2">{phase.text}</p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Programs */}
      <section id="programs" className="scroll-mt-20 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto py-24">
        <motion.div {...fade} className="text-center space-y-4 max-w-2xl mx-auto">
          <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-spa-sage">{c.programsEyebrow}</p>
          <h2 className="font-heading text-3xl sm:text-4xl font-light text-foreground">{c.programsTitle}</h2>
          <p className="font-body text-base text-muted-foreground">{c.programsText}</p>
        </motion.div>

        {isLoading ? (
          <div className="grid md:grid-cols-2 gap-10 mt-16">
            <Skeleton className="aspect-[4/5] rounded-[2rem]" />
            <div className="space-y-4">
              <Skeleton className="h-12 w-2/3" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          </div>
        ) : programs.length === 0 ? (
          <div className="mt-12 text-center space-y-4">
            <p className="font-body text-muted-foreground">{c.emptyText}</p>
            <Button asChild className="font-body bg-spa-sage hover:bg-spa-sage/90 text-white">
              <Link to={consultHref}>{c.ctaPrimary}</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-28 mt-16">
            {programs.map((program, i) => (
              <ProgramFeature
                key={program.id}
                program={program}
                index={i}
                copy={c}
                requestHref={lp(`/book?service=${program.id}`)}
                onDetail={() => setDetail(program)}
              />
            ))}
          </div>
        )}
      </section>

      {/* How it works */}
      <section className="bg-card border-y border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <motion.div {...fade} className="text-center space-y-4 mb-12">
            <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-spa-sage">{c.stepsEyebrow}</p>
            <h2 className="font-heading text-3xl sm:text-4xl font-light text-foreground">{c.stepsTitle}</h2>
          </motion.div>
          <div className="grid gap-6 md:grid-cols-3">
            {c.steps.map((step, i) => {
              const Icon = STEP_ICONS[i] || CalendarCheck;
              return (
                <motion.div
                  key={step.title}
                  {...fade}
                  transition={{ duration: 0.6, delay: i * 0.1 }}
                  className="rounded-2xl border border-border bg-background p-6"
                >
                  <div className="flex items-center justify-between mb-5">
                    <span className="h-11 w-11 rounded-full bg-spa-sage/15 flex items-center justify-center">
                      <Icon className="h-5 w-5 text-spa-sage" />
                    </span>
                    <span className="font-body text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      {c.stepLabel} {i + 1}
                    </span>
                  </div>
                  <h3 className="font-heading text-lg font-medium text-foreground mb-2">{step.title}</h3>
                  <p className="font-body text-sm text-muted-foreground leading-relaxed">{step.text}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto py-24">
        <motion.div {...fade} className="relative overflow-hidden rounded-[2rem] bg-spa-sage text-white px-6 sm:px-12 py-16 text-center">
          <div aria-hidden className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-white/10" />
          <div aria-hidden className="absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-white/5" />
          <div className="relative space-y-5">
            <h2 className="font-heading text-3xl sm:text-4xl font-light">{c.ctaTitle}</h2>
            <p className="font-body text-base text-white/85 max-w-xl mx-auto">{c.ctaText}</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-3">
              <Button size="lg" asChild className="font-body bg-white text-foreground hover:bg-white/90 max-w-full whitespace-normal h-auto min-h-11 py-2.5 text-center leading-tight">
                <Link to={consultHref}>{c.ctaPrimary}</Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                asChild
                className="font-body bg-transparent border-white/50 text-white hover:bg-white/10 hover:text-white max-w-full whitespace-normal h-auto min-h-11 py-2.5 text-center leading-tight"
              >
                <a href={HOLIS_WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="h-4 w-4 mr-2" /> {c.ctaWhatsapp}
                </a>
              </Button>
            </div>
          </div>
        </motion.div>
      </section>

      <ServiceDetailModal service={detail} open={!!detail} onOpenChange={(o) => !o && setDetail(null)} />
      <Footer />
    </div>
  );
};

function ProgramFeature({
  program,
  index,
  copy,
  requestHref,
  onDetail,
}: {
  program: ServiceRow;
  index: number;
  copy: Copy;
  requestHref: string;
  onDetail: () => void;
}) {
  const { summary, phases, includes } = parseProgramDescription(program.description);
  const reverse = index % 2 === 1;

  return (
    <motion.article {...fade} className="grid md:grid-cols-2 gap-12 lg:gap-16 items-center">
      <div className={cn("relative mb-6 md:mb-0", reverse && "md:order-2")}>
        <div className="aspect-[4/5] rounded-[2rem] overflow-hidden bg-muted shadow-sm">
          {program.image_url && (
            <img
              src={program.image_url}
              alt={program.title}
              className="w-full h-full object-cover transition-transform duration-700 hover:scale-105"
              loading="lazy"
            />
          )}
        </div>
        <div className="absolute -bottom-6 left-6 flex items-center gap-4 rounded-2xl border border-border bg-background/95 backdrop-blur px-5 py-3 shadow-md">
          <span className="flex items-center gap-1.5 font-body text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {programDuration(program.duration_minutes)}
          </span>
          <span className="h-4 w-px bg-border" />
          <span className="font-heading text-lg font-semibold text-foreground">{formatCRCWithUsd(program.price)}</span>
        </div>
      </div>

      <div className={cn("space-y-6", reverse && "md:order-1")}>
        <div className="space-y-3">
          <p className="font-body text-xs font-semibold uppercase tracking-[0.25em] text-spa-sage">
            {copy.programEyebrow} {String(index + 1).padStart(2, "0")}
          </p>
          <h3 className="font-heading text-4xl sm:text-5xl font-light text-foreground">{program.title}</h3>
          {summary && <p className="font-body text-base text-muted-foreground leading-relaxed">{summary}</p>}
        </div>

        {phases.length > 0 && (
          <ol className="space-y-5 border-l border-spa-sage/30 pl-6 ml-3">
            {phases.map((phase) => {
              const Icon = PHASE_ICONS[phase.key];
              return (
                <li key={phase.key} className="relative">
                  <span className="absolute -left-[37px] top-0 h-6 w-6 rounded-full bg-background border border-spa-sage/40 flex items-center justify-center">
                    <Icon className="h-3 w-3 text-spa-sage" />
                  </span>
                  <p className="font-body text-[11px] font-semibold uppercase tracking-[0.2em] text-spa-sage">{phase.label}</p>
                  <p className="font-body text-sm text-muted-foreground leading-relaxed mt-1">{phase.text}</p>
                </li>
              );
            })}
          </ol>
        )}

        {includes.length > 0 && (
          <div className="rounded-2xl border border-spa-sage/20 bg-spa-sage/5 p-5">
            <p className="font-body text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground/70">
              {copy.includesLabel}
            </p>
            <ul className="mt-3 space-y-2">
              {includes.map((item) => (
                <li key={item} className="flex items-start gap-2.5 font-body text-sm text-foreground/85">
                  <CheckCircle2 className="h-4 w-4 text-spa-sage shrink-0 mt-0.5" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-3 pt-1">
          <Button size="lg" asChild className="font-body bg-spa-sage hover:bg-spa-sage/90 text-white">
            <Link to={requestHref}>
              {copy.requestButton} <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" className="font-body" onClick={onDetail}>
            {copy.detailsButton}
          </Button>
        </div>
      </div>
    </motion.article>
  );
}

export default WellnessProgramsPage;
