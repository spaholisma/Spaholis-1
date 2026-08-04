import { useState } from "react";
import { formatCRCWithUsd } from "@/lib/currency";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SEO } from "@/components/SEO";
import { seo, content as defaults } from "@/data/content";
import { useSiteContent } from "@/hooks/useSiteContent";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useRetreats } from "@/hooks/useRetreats";
import { useServicesByType, type ServiceRow } from "@/hooks/useServices";
import { ServiceDetailModal } from "@/components/ServiceDetailModal";
import { CalendarDays, Users, MapPin, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const tabs: { key: TabKey; label: string }[] = [
    { key: "retreats", label: rt.tabRetreats },
    { key: "packages", label: rt.tabPackages },
    { key: "experiences", label: rt.tabExperiences },
  ];

  const { data: retreats, isLoading: retreatsLoading } = useRetreats();
  const { data: programs, isLoading: programsLoading } = useServicesByType("program");
  const { data: experiences, isLoading: experiencesLoading } = useServicesByType("experience");

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
        <div className="aspect-[21/9] max-h-[420px] w-full overflow-hidden">
          <img
            src={rt.heroImage}
            alt="Retreat at Holis Wellness Center"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        </div>
        <div className="absolute bottom-8 left-0 right-0 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
          <motion.div {...fadeIn}>
            <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-spa-cream/80 mb-2">
              {rt.heroEyebrow}
            </p>
            <h1 className="spa-heading-xl text-spa-cream drop-shadow-lg">
              {rt.heroTitle}
            </h1>
          </motion.div>
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto py-12">
        {/* Intro */}
        <motion.div {...fadeIn} className="mb-10 max-w-3xl">
          <p className="spa-body text-lg leading-relaxed">
            {rt.intro}
          </p>
          <div className="flex items-center gap-2 mt-4 text-sm font-body text-muted-foreground">
            <MapPin className="h-4 w-4" />
            {rt.location}
          </div>
        </motion.div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-10 border-b border-border pb-4">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                window.scrollTo({ top: 400, behavior: "smooth" });
              }}
              className={cn(
                "px-5 py-2.5 rounded-full font-body text-sm font-medium transition-all",
                activeTab === tab.key
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:bg-border hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-[420px] rounded-2xl" />
            ))}
          </div>
        ) : (
          <>
            {/* Wellness Retreats Tab */}
            {activeTab === "retreats" && (
              <motion.div
                key="retreats"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {retreats?.map((retreat) => {
                    const startPrice = getStartingPrice(retreat);
                    return (
                      <motion.div key={retreat.id} {...fadeIn}>
                        <Link
                          to={`/retreats/${retreat.slug}`}
                          className="group block bg-card rounded-2xl border border-border overflow-hidden hover:shadow-lg transition-shadow"
                        >
                          <div className="aspect-[16/10] overflow-hidden">
                            <img
                              src={retreat.image_url || ""}
                              alt={retreat.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                              loading="lazy"
                            />
                          </div>
                          <div className="p-6 space-y-3">
                            <div className="flex items-center gap-3 text-xs font-body text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <CalendarDays className="h-3.5 w-3.5" />
                                {retreat.duration_days} Days
                              </span>
                              <span className="flex items-center gap-1">
                                <Users className="h-3.5 w-3.5" />
                                Solo, Couples & Groups
                              </span>
                            </div>
                            <h2 className="font-heading text-xl font-medium text-foreground group-hover:text-primary transition-colors">
                              {retreat.title}
                            </h2>
                            <p className="spa-body-sm line-clamp-2">
                              {retreat.short_description}
                            </p>
                            <div className="flex items-center justify-between pt-2">
                              {startPrice && (
                                <p className="font-heading text-lg font-semibold text-foreground">
                                  From ${startPrice.toLocaleString()}{" "}
                                  <span className="text-xs font-body font-normal text-muted-foreground">USD</span>
                                </p>
                              )}
                              <Button variant="default" size="sm">
                                View Retreat
                              </Button>
                            </div>
                          </div>
                        </Link>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* Wellness Packages Tab */}
            {activeTab === "packages" && (
              <motion.div
                key="packages"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
              >
                <div className="mb-6 max-w-3xl">
                  <p className="spa-body leading-relaxed">
                    {rt.packagesIntro}
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {programs.map((program) => (
                    <motion.div key={program.id} {...fadeIn}>
                      <div
                        onClick={() => setDetailService(program)}
                        className="bg-card rounded-2xl border border-border overflow-hidden hover:shadow-lg transition-shadow h-full flex flex-col cursor-pointer"
                      >
                        {program.image_url && (
                          <div className="aspect-[16/10] overflow-hidden">
                            <img
                              src={program.image_url}
                              alt={program.title}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          </div>
                        )}
                        <div className="p-6 space-y-3 flex-1 flex flex-col">
                          <div className="flex items-center gap-2 text-xs font-body text-muted-foreground">
                            <Clock className="h-3.5 w-3.5" />
                            {durationLabel(program.duration_minutes)}
                          </div>
                          <h2 className="font-heading text-xl font-medium text-foreground">
                            {program.title}
                          </h2>
                          <p className="spa-body-sm line-clamp-3 flex-1">
                            {program.description}
                          </p>
                          <div className="flex items-center justify-between pt-2">
                            <p className="font-heading text-lg font-semibold text-foreground">
                              {formatCRCWithUsd(program.price)}
                            </p>
                            <Button variant="default" size="sm" asChild onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                              <Link to={`/book?service=${program.id}`}>Request Program</Link>
                            </Button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Manuel Antonio Experiences Tab */}
            {activeTab === "experiences" && (
              <motion.div
                key="experiences"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
              >
                <div className="mb-6 max-w-3xl">
                  <p className="spa-body leading-relaxed">
                    {rt.experiencesIntro}
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {experiences.map((exp) => (
                    <motion.div key={exp.id} {...fadeIn}>
                      <div
                        onClick={() => setDetailService(exp)}
                        className="bg-card rounded-2xl border border-border overflow-hidden hover:shadow-lg transition-shadow h-full flex flex-col cursor-pointer"
                      >
                        {exp.image_url && (
                          <div className="aspect-[16/10] overflow-hidden">
                            <img
                              src={exp.image_url}
                              alt={exp.title}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          </div>
                        )}
                        <div className="p-6 space-y-3 flex-1 flex flex-col">
                          <div className="flex items-center gap-3 text-xs font-body text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <CalendarDays className="h-3.5 w-3.5" />
                              Full Day
                            </span>
                            <span className="flex items-center gap-1">
                              <Users className="h-3.5 w-3.5" />
                              {exp.capacity ? `Up to ${exp.capacity}` : "Solo & Groups"}
                            </span>
                          </div>
                          <h2 className="font-heading text-xl font-medium text-foreground">
                            {exp.title}
                          </h2>
                          <p className="spa-body-sm line-clamp-3 flex-1">
                            {exp.description}
                          </p>
                          <div className="flex items-center justify-between pt-2">
                            <p className="font-heading text-lg font-semibold text-foreground">
                              {formatCRCWithUsd(exp.price)} <span className="text-xs font-body font-normal text-muted-foreground">per person</span>
                            </p>
                            <Button variant="default" size="sm" asChild onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                              <Link to={`/experience-booking?experience=${exp.id}`}>Book Experience</Link>
                            </Button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </>
        )}

        {/* Custom retreat CTA */}
        <motion.div {...fadeIn} className="mt-16 bg-card rounded-2xl border border-border p-8 text-center">
          <h2 className="font-heading text-2xl font-medium text-foreground mb-3">
            {rt.customTitle}
          </h2>
          <p className="spa-body max-w-lg mx-auto mb-6">
            {rt.customBody}
          </p>
          <Button variant="default" size="lg" asChild>
            <Link to="/custom-retreat">{rt.customButton}</Link>
          </Button>
        </motion.div>
      </div>

      <ServiceDetailModal service={detailService} open={!!detailService} onOpenChange={(o) => !o && setDetailService(null)} />
      <Footer />
    </div>
  );
}
