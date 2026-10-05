import { useState } from "react";
import { formatCRCWithUsd } from "@/lib/currency";
import { useSearchParams } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SEO } from "@/components/SEO";
import { seo, content as defaults } from "@/data/content";
import { useSiteContent } from "@/hooks/useSiteContent";
import { cmsEditProps } from "@/lib/cmsEdit";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useRetreats } from "@/hooks/useRetreats";
import { useServicesByType, type ServiceRow } from "@/hooks/useServices";
import { ServiceDetailModal } from "@/components/ServiceDetailModal";
import { CalendarDays, Users, MapPin, Clock, Tent, Leaf, Waves } from "lucide-react";
import { JourneyCard } from "@/components/retreats/JourneyCard";
import { cn } from "@/lib/utils";
import { HERO_IMAGE_FIRST } from "@/lib/heroImage";

const fadeIn = {
  initial: { opacity: 0, y: 24 } as const,
  whileInView: { opacity: 1, y: 0 } as const,
  viewport: { once: true },
  transition: { duration: 0.6 },
};

const tabKeys = ["retreats", "packages", "experiences"] as const;

type TabKey = (typeof tabKeys)[number];

export default function RetreatsPage() {
  const [searchParams] = useSearchParams();
  const initialTab = (searchParams.get("tab") as TabKey) || "retreats";
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const { data: siteContent } = useSiteContent();
  const rt = (siteContent as any)?.retreats || (defaults as any).retreats;
  const { data: retreats, isLoading: retreatsLoading } = useRetreats();
  const { data: programs, isLoading: programsLoading } = useServicesByType("program");
  const { data: experiences, isLoading: experiencesLoading } = useServicesByType("experience");

  const tabs: { key: TabKey; label: string; path: string; icon: typeof Tent; count: number }[] = [
    { key: "retreats", label: rt.tabRetreats, path: "retreats.tabRetreats", icon: Tent, count: retreats?.length ?? 0 },
    { key: "packages", label: rt.tabPackages, path: "retreats.tabPackages", icon: Leaf, count: programs?.length ?? 0 },
    { key: "experiences", label: rt.tabExperiences, path: "retreats.tabExperiences", icon: Waves, count: experiences?.length ?? 0 },
  ];
  const reduce = useReducedMotion();
  // Which way the content slides: toward the tab you picked.
  const [direction, setDirection] = useState(1);
  const pick = (key: TabKey) => {
    if (key === activeTab) return;
    setDirection(tabKeys.indexOf(key) > tabKeys.indexOf(activeTab) ? 1 : -1);
    setActiveTab(key);
  };

  const isLoading = retreatsLoading || programsLoading || experiencesLoading;
  const [detailService, setDetailService] = useState<ServiceRow | null>(null);

  const getStartingPrice = (retreat: NonNullable<typeof retreats>[number]) => {
    if (!retreat?.pricing_tiers?.length) return null;
    const prices = retreat.pricing_tiers.flatMap((t) => [
      ...t.with_accommodation.map((p) => p.price),
      ...t.without_accommodation.map((p) => p.price),
    ]);
    return Math.min(...prices);
  };

  const durationLabel = (mins: number) =>
    mins >= 60
      ? `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}min` : ""}`
      : `${mins} min`;

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title={seo.retreats.title}
        description={seo.retreats.description}
        canonical={seo.retreats.canonical}
      />
      <Navbar />

      {/* Hero */}
      <div className="relative pt-16">
        <div className="aspect-[21/9] min-h-[260px] max-h-[420px] w-full overflow-hidden">
          <img {...HERO_IMAGE_FIRST}
            {...cmsEditProps("retreats.heroImage", "image")}
            src={rt.heroImage}
            alt="Retreat at Holis Wellness Center"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        </div>
        <div className="absolute bottom-8 left-0 right-0 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
          <motion.div {...fadeIn}>
            <p {...cmsEditProps("retreats.heroEyebrow")} className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-spa-cream/80 mb-2">
              {rt.heroEyebrow}
            </p>
            <h1 {...cmsEditProps("retreats.heroTitle")} className="spa-heading-xl text-spa-cream drop-shadow-lg">
              {rt.heroTitle}
            </h1>
          </motion.div>
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto py-12">
        {/* Intro */}
        <motion.div {...fadeIn} className="mb-10 max-w-3xl">
          <p {...cmsEditProps("retreats.intro")} className="spa-body text-lg leading-relaxed">
            {rt.intro}
          </p>
          <div className="flex items-center gap-2 mt-4 text-sm font-body text-muted-foreground">
            <MapPin className="h-4 w-4" />
            <span {...cmsEditProps("retreats.location")}>{rt.location}</span>
          </div>
        </motion.div>

        {/* Tabs — a pill that slides to the one you pick */}
        <div className="mb-10">
          <div role="tablist" aria-label={rt.heroTitle} className="flex w-full flex-col gap-1 rounded-3xl border border-border bg-muted/50 p-1.5 sm:inline-flex sm:w-auto sm:max-w-full sm:flex-row sm:flex-wrap sm:rounded-full">
            {tabs.map((tab) => {
              const on = activeTab === tab.key;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  role="tab"
                  aria-selected={on}
                  {...cmsEditProps(tab.path)}
                  onClick={() => pick(tab.key)}
                  className={cn(
                    "relative inline-flex items-center gap-2 rounded-full px-4 sm:px-5 py-2.5 font-body text-sm font-medium transition-colors text-left",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    on ? "text-background" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {on && (
                    <motion.span
                      layoutId="retreats-tab-pill"
                      className="absolute inset-0 rounded-full bg-foreground shadow-sm"
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    />
                  )}
                  <Icon className="relative h-4 w-4" aria-hidden="true" />
                  <span className="relative">{tab.label}</span>
                  {!isLoading && (
                    <span className={cn(
                      "relative rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
                      on ? "bg-background/20 text-background" : "bg-background text-muted-foreground",
                    )}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-[420px] rounded-3xl" />
            ))}
          </div>
        ) : (
          <AnimatePresence mode="wait" custom={direction} initial={false}>
            <motion.div
              key={activeTab}
              custom={direction}
              initial={reduce ? false : { opacity: 0, x: direction * 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: direction * -40 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              {/* Wellness Retreats */}
              {activeTab === "retreats" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {retreats?.map((retreat, i) => {
                    const startPrice = getStartingPrice(retreat);
                    return (
                      <JourneyCard
                        key={retreat.id}
                        index={i}
                        wide
                        href={`/retreats/${retreat.slug}`}
                        image={retreat.image_url}
                        title={retreat.title}
                        description={retreat.short_description}
                        chips={[
                          { icon: CalendarDays, text: `${retreat.duration_days} ${rt.ui?.days}` },
                          { icon: Users, text: rt.ui?.audience },
                        ]}
                        price={startPrice ? `${rt.ui?.from} $${startPrice.toLocaleString("en-US")}` : null}
                        priceNote={startPrice ? rt.ui?.usd : undefined}
                        cta={{ label: rt.ui?.viewRetreat, to: `/retreats/${retreat.slug}` }}
                      />
                    );
                  })}
                </div>
              )}

              {/* Wellness Packages */}
              {activeTab === "packages" && (
                <>
                  <div className="mb-6 max-w-3xl">
                    <p {...cmsEditProps("retreats.packagesIntro")} className="spa-body leading-relaxed">
                      {rt.packagesIntro}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {programs.map((program, i) => (
                      <JourneyCard
                        key={program.id}
                        index={i}
                        onOpen={() => setDetailService(program)}
                        image={program.image_url}
                        title={program.title}
                        description={program.description}
                        chips={[{ icon: Clock, text: durationLabel(program.duration_minutes) }]}
                        price={formatCRCWithUsd(program.price)}
                        cta={{ label: rt.ui?.requestProgram, to: `/book?service=${program.id}` }}
                      />
                    ))}
                  </div>
                </>
              )}

              {/* Manuel Antonio Experiences */}
              {activeTab === "experiences" && (
                <>
                  <div className="mb-6 max-w-3xl">
                    <p {...cmsEditProps("retreats.experiencesIntro")} className="spa-body leading-relaxed">
                      {rt.experiencesIntro}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {experiences.map((exp, i) => (
                      <JourneyCard
                        key={exp.id}
                        index={i}
                        onOpen={() => setDetailService(exp)}
                        image={exp.image_url}
                        title={exp.title}
                        description={exp.description}
                        chips={[
                          { icon: CalendarDays, text: rt.ui?.fullDay },
                          { icon: Users, text: exp.capacity ? `${rt.ui?.upTo} ${exp.capacity}` : rt.ui?.soloGroups },
                        ]}
                        price={formatCRCWithUsd(exp.price)}
                        priceNote={rt.ui?.perPerson}
                        cta={{ label: rt.ui?.bookExperience, to: `/experience-booking?experience=${exp.id}` }}
                      />
                    ))}
                  </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        )}

        {/* Custom retreat CTA */}
        <motion.div {...fadeIn} className="mt-16 bg-card rounded-2xl border border-border p-6 sm:p-8 text-center">
          <h2 {...cmsEditProps("retreats.customTitle")} className="font-heading text-2xl font-medium text-foreground mb-3">
            {rt.customTitle}
          </h2>
          <p {...cmsEditProps("retreats.customBody")} className="spa-body max-w-lg mx-auto mb-6">
            {rt.customBody}
          </p>
          {/* On the narrowest phones the label may take two lines rather than
              push the page sideways. */}
          <Button variant="default" size="lg" asChild className="max-w-full h-auto min-h-11 whitespace-normal py-3">
            <Link to="/custom-retreat">{rt.customButton}</Link>
          </Button>
        </motion.div>
      </div>

      <ServiceDetailModal service={detailService} open={!!detailService} onOpenChange={(o) => !o && setDetailService(null)} />
      <Footer />
    </div>
  );
}
