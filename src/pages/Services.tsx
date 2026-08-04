import { useEffect, useMemo, useState } from "react";
import { formatCRCWithUsd } from "@/lib/currency";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useLanguage, withLangPrefix } from "@/i18n/LanguageProvider";
import { pickLocalized } from "@/lib/i18n-field";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SEO } from "@/components/SEO";
import { useSiteContent, useSiteSeo } from "@/hooks/useSiteContent";
import { content as defaults, seo as seoDefaults } from "@/data/content";
import { cmsEditProps } from "@/lib/cmsEdit";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useServicesByCategory, type ServiceRow } from "@/hooks/useServices";
import { useSpaPackages, type SpaPackage } from "@/hooks/useSpaPackages";
import { Link } from "react-router-dom";
import { CheckCircle2, Clock } from "lucide-react";
import { ServiceDetailModal } from "@/components/ServiceDetailModal";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { PackageDetailView } from "@/components/booking/PackageDetailView";
import { cn } from "@/lib/utils";
// Real photography sourced from spaholis.com (replaces previous AI-generated assets)
const heroSpaHolis = "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/1710017291666-GUTIMLDB1FIWKSMM99RF/spa-home.jpg?format=2500w";
const imgMassage = "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/558db4e1-a1f4-4c5a-be26-b98512dd6ddf/massage_page.jpg?format=1500w";
const imgFacial = "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/13188b0e-e90f-482b-b100-8e6df443a342/IMG_3394-e1402951220128.jpg?format=1500w";
const imgBody = "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/582db92a-49bb-45fd-bf95-c433ebc08e8e/Copy+of+Copy+of+IMG_7020.jpg?format=1500w";
const imgHolistic = "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/1c00f13e-5e03-4d0b-b9ee-99a32d61eaca/045A5420.jpg?format=1500w";
const imgWellness = "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/d89fc404-0b7a-42f9-bd05-21136e5dafd6/045A5408.jpg?format=1500w";
const imgExperiences = "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/6327cb9b-8f05-4e8c-9685-59fbc0fc0544/IMG_9427.jpg?format=1500w";
const imgPackages = "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/ec8f6825-a81e-491f-bb40-3a2f33d47455/spa_packages.jpg?format=1500w";

const fadeIn = {
  initial: { opacity: 0, y: 24 } as const,
  whileInView: { opacity: 1, y: 0 } as const,
  viewport: { once: true },
  transition: { duration: 0.6 },
};

const spaCategories = [
  "Massage Therapy",
  "Organic Facials",
  "Body Treatments",
  "Holistic Therapy",
  "Wellness Programs",
  "Manuel Antonio Experiences",
];

// Unified item type
type UnifiedItem =
  | { kind: "service"; data: ServiceRow }
  | { kind: "package"; data: SpaPackage };

function durationLabel(s: ServiceRow) {
  if (s.duration_minutes >= 60) {
    const h = Math.floor(s.duration_minutes / 60);
    const m = s.duration_minutes % 60;
    return `${h}h${m ? ` ${m}min` : ""}`;
  }
  return `${s.duration_minutes} min`;
}

const SPA_PACKAGES_CATEGORY = "Spa Packages";

const categoryImages: Record<string, string> = {
  "Massage Therapy": imgMassage,
  "Organic Facials": imgFacial,
  "Body Treatments": imgBody,
  "Holistic Therapy": imgHolistic,
  "Wellness Programs": imgWellness,
  "Manuel Antonio Experiences": imgExperiences,
  [SPA_PACKAGES_CATEGORY]: imgPackages,
};

const ServicesPage = () => {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { grouped, isLoading: servicesLoading } = useServicesByCategory();
  const { data: packages, isLoading: packagesLoading } = useSpaPackages();
  const [selected, setSelected] = useState("");
  const [detailService, setDetailService] = useState<ServiceRow | null>(null);
  const [detailPackage, setDetailPackage] = useState<SpaPackage | null>(null);
  const { data: siteContent } = useSiteContent();
  const { data: seoData } = useSiteSeo();
  const svc = siteContent?.services || defaults.services;
  const seo = seoData || seoDefaults;
  // Category label + header image now come from the Content editor (svc.*),
  // falling back to the built-in constants.
  const catImages: Record<string, string> = { ...categoryImages, ...((svc as any).categoryImages || {}) };
  const localizeCategory = (cat: string) =>
    ((svc as any).categories?.[cat] as string) || cat;

  const isLoading = servicesLoading || packagesLoading;

  // Build unified category list: spa categories that have services + "Spa Packages" if any
  const availableCategories = spaCategories.filter((cat) => grouped[cat]?.length);
  const hasPackages = (packages ?? []).length > 0;
  const allCategories = hasPackages
    ? [...availableCategories, SPA_PACKAGES_CATEGORY]
    : availableCategories;

  useEffect(() => {
    if (!selected && allCategories.length > 0) {
      setSelected(allCategories[0]);
    }
  }, [allCategories, selected]);

  // Build unified items for the selected category
  const unifiedItems: UnifiedItem[] =
    selected === SPA_PACKAGES_CATEGORY
      ? (packages ?? []).map((p) => ({ kind: "package" as const, data: p }))
      : (grouped[selected] ?? []).map((s) => ({ kind: "service" as const, data: s }));

  const servicesJsonLd = useMemo(() => {
    const allServices = Object.values(grouped).flat();
    if (!allServices.length) return undefined;
    return {
      "@context": "https://schema.org",
      "@graph": allServices.map((s) => ({
        "@type": "Service",
        name: s.title,
        description: s.description,
        provider: {
          "@type": "HealthAndBeautyBusiness",
          name: "Holis Wellness Center",
          url: "https://spaholis.com",
        },
        areaServed: {
          "@type": "Place",
          name: "Manuel Antonio, Costa Rica",
        },
      })),
    };
  }, [grouped]);

  return (
    <div className="min-h-screen bg-background">
      <SEO title={seo.treatments.title} description={seo.treatments.description} canonical={seo.treatments.canonical} jsonLd={servicesJsonLd} />
      <Navbar />

      <div className="relative pt-16">
        <div className="aspect-[21/9] max-h-[420px] w-full overflow-hidden">
          <img
            {...cmsEditProps("services.heroImage", "image")}
            src={svc.heroImage || heroSpaHolis}
            alt="Traditional massage therapy at Holis Wellness Center"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent opacity-50" />
        </div>
        <div className="absolute bottom-8 left-0 right-0 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
          <motion.div {...fadeIn}>
            <p {...cmsEditProps("services.eyebrow")} className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-spa-cream/80 mb-2">
              {svc.eyebrow}
            </p>
            <h1 {...cmsEditProps("services.title")} className="spa-heading-xl text-spa-cream drop-shadow-lg">
              {svc.title}
            </h1>
          </motion.div>
        </div>
      </div>

      <div className="pb-16 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto py-12">
        <motion.div {...fadeIn} className="mb-10 max-w-3xl">
          <p {...cmsEditProps("services.subtitle")} className="spa-body text-lg leading-relaxed">
            {svc.subtitle}
          </p>
        </motion.div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <>
            {/* Category Tabs */}
            <motion.div {...fadeIn} className="flex flex-wrap gap-2 mb-10 border-b border-border pb-4">
              {allCategories.map((cat) => (
                <button
                  key={cat}
                  {...cmsEditProps(`services.categories.${cat}`)}
                  onClick={() => {
                    setSelected(cat);
                    window.scrollTo({ top: 320, behavior: "smooth" });
                  }}
                  className={cn(
                    "px-5 py-2.5 rounded-full font-body text-sm font-medium transition-all",
                    selected === cat
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground hover:bg-border hover:text-foreground"
                  )}
                >
                  {localizeCategory(cat)}
                </button>
              ))}
            </motion.div>

            {/* Unified List */}
            {!selected ? (
              <motion.p {...fadeIn} className="font-body text-sm text-muted-foreground text-center py-12">
                {svc.selectCategory}
              </motion.p>
            ) : (
              <motion.div
                key={selected}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
              >
                <h2 {...cmsEditProps(`services.categories.${selected}`)} className="font-heading text-xl font-medium text-foreground border-b border-border pb-3 mb-6">
                  {localizeCategory(selected)}
                </h2>
                {(selected === "Massage Therapy" ||
                  selected === "Organic Facials" ||
                  selected === "Body Treatments") ? (
                  <MassageTherapyAccordion
                    services={grouped[selected] ?? []}
                    image={catImages[selected] || imgMassage}
                  />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {unifiedItems.map((item) =>
                      item.kind === "service" ? (
                        <ServiceCardItem
                          key={item.data.id}
                          service={item.data}
                          image={catImages[selected] || imgMassage}
                          onDetail={() => setDetailService(item.data)}
                        />
                      ) : (
                        <PackageCardItem
                          key={item.data.id}
                          pkg={item.data}
                          image={catImages[selected] || imgPackages}
                          onDetail={() => setDetailPackage(item.data)}
                        />
                      )
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </>
        )}
      </div>

      {/* SEO Content Section */}
      <SeoContentSection />


      <motion.p {...fadeIn} className="text-center font-body text-xs text-muted-foreground mb-16 italic px-4">
        {svc.taxNote}
      </motion.p>

      {/* Service detail modal */}
      <ServiceDetailModal service={detailService} open={!!detailService} onOpenChange={(o) => !o && setDetailService(null)} />

      {/* Package detail modal */}
      <Dialog open={!!detailPackage} onOpenChange={(o) => !o && setDetailPackage(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-6 sm:p-8">
          {detailPackage && (
            <PackageDetailView
              pkg={detailPackage}
              onProceed={() => {
                setDetailPackage(null);
                // Navigate handled by Link in PackageDetailView — we override with direct nav
                window.location.href = `/book?package=${detailPackage.id}`;
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
};

function getBaseName(title: string): string {
  // Strip trailing "(...)" duration suffix and common keywords
  return title
    .replace(/\s*\([^)]*\)\s*$/g, "")
    .replace(/\s+Massage\s*$/i, "")
    .trim();
}

function MassageTherapyAccordion({
  services,
  image,
}: {
  services: ServiceRow[];
  image: string;
}) {
  const { language } = useLanguage();
  const { data: siteContent } = useSiteContent();
  const ui = ((siteContent?.services || defaults.services) as any).ui || (defaults.services as any).ui;

  // Group services by base name, preserving sort order
  const groups = new Map<string, ServiceRow[]>();
  for (const s of services) {
    const key = getBaseName(
      (pickLocalized(s as unknown as Record<string, unknown>, "title", language) as string) ||
        s.title
    );
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }

  // Pick a representative service for description per group (first one with description)
  const groupEntries = Array.from(groups.entries());

  // Use first group's image_url if present, else fallback
  const heroImg =
    services.find((s) => s.image_url)?.image_url || image;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
      <div className="aspect-[4/5] rounded-2xl overflow-hidden md:sticky md:top-24">
        <img
          src={heroImg}
          alt="Massage Therapy at Holis Wellness Center"
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </div>
      <Accordion
        type="single"
        collapsible
        defaultValue={groupEntries[0]?.[0]}
        className="w-full"
      >
        {groupEntries.map(([groupName, items]) => {
          const rep = items.find((i) => i.description) ?? items[0];
          const description =
            (pickLocalized(rep as unknown as Record<string, unknown>, "description", language) as string) ||
            rep.description ||
            "";
          return (
            <AccordionItem key={groupName} value={groupName} className="border-border">
              <AccordionTrigger className="font-heading text-base uppercase tracking-wider text-foreground py-5 hover:no-underline">
                {groupName}
              </AccordionTrigger>
              <AccordionContent className="pt-1 pb-6 space-y-4">
                {description && (
                  <p className="spa-body-sm text-muted-foreground leading-relaxed">
                    {description}
                  </p>
                )}
                <ul className="space-y-2">
                  {items.map((s) => {
                    const title =
                      (pickLocalized(s as unknown as Record<string, unknown>, "title", language) as string) ||
                      s.title;
                    return (
                      <li key={s.id}>
                        <Link
                          to={withLangPrefix(
                            `/book?service=${s.id}&category=${encodeURIComponent(s.category)}`,
                            language
                          )}
                          className="font-body text-sm font-semibold text-primary hover:underline inline-flex items-baseline gap-1.5"
                        >
                          <span>
                            {ui.book}{" "}
                            {durationLabel(s)} {title}:
                          </span>
                          <span className="text-foreground">{formatCRCWithUsd(s.price)}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}


function ServiceCardItem({ service, image, onDetail }: { service: ServiceRow; image: string; onDetail: () => void }) {
  const { language } = useLanguage();
  const { data: siteContent } = useSiteContent();
  const ui = ((siteContent?.services || defaults.services) as any).ui || (defaults.services as any).ui;
  const title = pickLocalized(service as unknown as Record<string, unknown>, "title", language) || service.title;
  const description =
    pickLocalized(service as unknown as Record<string, unknown>, "description", language) ||
    service.description ||
    "";
  const ctaLabel =
    service.type === "program"
      ? ui.request
      : service.type === "experience"
      ? ui.bookExperience
      : ui.book;
  return (
    <div
      onClick={onDetail}
      className="group bg-card rounded-2xl border border-border overflow-hidden hover:shadow-lg transition-shadow h-full flex flex-col cursor-pointer"
    >
      <div className="aspect-[16/10] overflow-hidden">
        <img
          src={service.image_url || image}
          alt={title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />
      </div>
      <div className="p-6 space-y-3 flex-1 flex flex-col">
        <div className="flex items-center gap-2 text-xs font-body text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          {durationLabel(service)}
        </div>
        <h3 className="font-heading text-xl font-medium text-foreground group-hover:text-primary transition-colors">
          {title}
        </h3>
        {description && (
          <p className="spa-body-sm line-clamp-3 flex-1">
            {description}
          </p>
        )}
        <div className="flex items-center justify-between gap-4 pt-2">
          <p className="font-heading text-lg font-semibold text-foreground">
            {formatCRCWithUsd(service.price)}
          </p>
          <Button variant="default" size="sm" asChild onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <Link
              to={withLangPrefix(`/book?service=${service.id}&category=${encodeURIComponent(service.category)}`, language)}
            >
              {ctaLabel}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function PackageCardItem({ pkg, image, onDetail }: { pkg: SpaPackage; image: string; onDetail: () => void }) {
  const { language } = useLanguage();
  const { data: siteContent } = useSiteContent();
  const ui = ((siteContent?.services || defaults.services) as any).ui || (defaults.services as any).ui;
  const name = pickLocalized(pkg as unknown as Record<string, unknown>, "name", language) || pkg.name;
  const durationLabel =
    pickLocalized(pkg as unknown as Record<string, unknown>, "duration_label", language) || pkg.duration_label;
  return (
    <div
      onClick={onDetail}
      className="group bg-card rounded-2xl border border-border overflow-hidden hover:shadow-lg transition-shadow h-full flex flex-col cursor-pointer"
    >
      <div className="aspect-[16/10] overflow-hidden">
        <img
          src={image}
          alt={name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />
      </div>
      <div className="p-6 space-y-3 flex-1 flex flex-col">
        <h3 className="font-heading text-xl font-medium text-foreground group-hover:text-primary transition-colors">
          {name}
        </h3>
        {pkg.items.length > 0 && (
          <div className="space-y-1 flex-1">
            {pkg.items.slice(0, 3).map((item, i) => (
              <p key={i} className="font-body text-sm text-muted-foreground flex items-center gap-1.5">
                <CheckCircle2 className="h-3 w-3 text-primary shrink-0" />
                {item.treatment_name}
              </p>
            ))}
            {pkg.items.length > 3 && (
              <p className="font-body text-xs text-muted-foreground/70 italic">
                {String(ui.moreTreatments).replace("{count}", String(pkg.items.length - 3))}
              </p>
            )}
          </div>
        )}
        {durationLabel && (
          <p className="font-body text-xs text-muted-foreground/70">
            {durationLabel}
          </p>
        )}
        <div className="flex items-center justify-between gap-4 pt-2">
          <p className="font-heading text-lg font-semibold text-foreground">
            {formatCRCWithUsd(pkg.price)}
          </p>
          <Button variant="default" size="sm" asChild onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <Link to={withLangPrefix(`/book?package=${pkg.id}`, language)}>
              {ui.bookPackage}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function SeoContentSection() {
  const { data: siteContent } = useSiteContent();
  const seo = ((siteContent?.services || defaults.services) as any).seo || (defaults.services as any).seo;
  const benefits: string[] = Array.isArray(seo?.benefits?.items) ? seo.benefits.items : [];
  const faqItems: Array<{ q: string; a: string }> = Array.isArray(seo?.faq?.items) ? seo.faq.items : [];

  return (
    <section
      aria-labelledby="treatments-seo-heading"
      className="border-t border-border bg-muted/30"
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-14">
        {/* Intro */}
        <motion.div {...fadeIn} className="max-w-3xl">
          <h2
            {...cmsEditProps("services.seo.intro.title")}
            id="treatments-seo-heading"
            className="font-heading text-3xl md:text-4xl font-medium text-foreground mb-4"
          >
            {seo?.intro?.title}
          </h2>
          <p {...cmsEditProps("services.seo.intro.body")} className="spa-body text-muted-foreground leading-relaxed">
            {seo?.intro?.body}
          </p>
        </motion.div>

        {/* Service blocks */}
        <div className="grid gap-8 md:grid-cols-2">
          {(["massage", "facials", "body", "holistic"] as const).map((key) => (
            <motion.div
              {...fadeIn}
              key={key}
              className="bg-card rounded-2xl border border-border p-6"
            >
              <h3 {...cmsEditProps(`services.seo.blocks.${key}.title`)} className="font-heading text-xl font-medium text-foreground mb-3">
                {seo?.blocks?.[key]?.title}
              </h3>
              <p {...cmsEditProps(`services.seo.blocks.${key}.body`)} className="spa-body-sm text-muted-foreground leading-relaxed">
                {seo?.blocks?.[key]?.body}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Benefits */}
        <motion.div {...fadeIn} className="max-w-3xl">
          <h3 {...cmsEditProps("services.seo.benefits.title")} className="font-heading text-2xl font-medium text-foreground mb-4">
            {seo?.benefits?.title}
          </h3>
          <ul className="space-y-2">
            {benefits.map((b, i) => (
              <li key={i} className="flex items-start gap-2 spa-body-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-1" />
                <span {...cmsEditProps(`services.seo.benefits.items.${i}`)}>{b}</span>
              </li>
            ))}
          </ul>
        </motion.div>

        {/* FAQ */}
        <motion.div {...fadeIn} className="max-w-3xl">
          <h3 {...cmsEditProps("services.seo.faq.title")} className="font-heading text-2xl font-medium text-foreground mb-4">
            {seo?.faq?.title}
          </h3>
          <div className="space-y-5">
            {faqItems.map((item, i) => (
              <div key={i}>
                <h4 {...cmsEditProps(`services.seo.faq.items.${i}.q`)} className="font-heading text-base font-medium text-foreground mb-1.5">
                  {item.q}
                </h4>
                <p {...cmsEditProps(`services.seo.faq.items.${i}.a`)} className="spa-body-sm text-muted-foreground leading-relaxed">
                  {item.a}
                </p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Local SEO */}
        <motion.div {...fadeIn} className="max-w-3xl">
          <h3 {...cmsEditProps("services.seo.local.title")} className="font-heading text-2xl font-medium text-foreground mb-3">
            {seo?.local?.title}
          </h3>
          <p {...cmsEditProps("services.seo.local.body")} className="spa-body-sm text-muted-foreground leading-relaxed">
            {seo?.local?.body}
          </p>
        </motion.div>
      </div>
    </section>
  );
}

export default ServicesPage;
