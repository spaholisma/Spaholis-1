import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SEO } from "@/components/SEO";
import { useSiteContent, useSiteSeo } from "@/hooks/useSiteContent";
import { content as defaults, seo as seoDefaults } from "@/data/content";
import { useUpcomingEvents } from "@/hooks/useClasses";
import { EventCard } from "@/components/EventCard";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, ShoppingBag } from "lucide-react";
import { Link } from "react-router-dom";
import { OfferingsPurchaseSection } from "@/components/OfferingsPurchaseSection";
import { useTranslation } from "react-i18next";
import { useTokenOffering } from "@/hooks/useMembershipToken";
import { Check } from "lucide-react";
import classesHero from "@/assets/classes-hero.jpg";

const fadeIn = {
  initial: { opacity: 0, y: 24 } as const,
  whileInView: { opacity: 1, y: 0 } as const,
  viewport: { once: true },
  transition: { duration: 0.6 },
};

const ClassesPage = () => {
  const { t } = useTranslation();
  const { data: events, isLoading } = useUpcomingEvents();
  const { data: siteContent } = useSiteContent();
  const { data: seoData } = useSiteSeo();
  const { data: tokenOffering } = useTokenOffering();
  const cls = siteContent?.classes || defaults.classes;
  const seo = seoData || seoDefaults;

  // Separate workshops from regular events
  const workshops = events?.filter((e) => e.classes.category === "Workshop") ?? [];
  const regularEvents = events?.filter((e) => e.classes.category !== "Workshop") ?? [];

  return (
    <div className="min-h-screen bg-background">
      <SEO title={seo.classes.title} description={seo.classes.description} canonical={seo.classes.canonical} />
      <Navbar />

      {/* Membership recognized from the emailed link */}
      {tokenOffering?.valid && (
        <div className="bg-spa-sage text-spa-cream">
          <div className="pt-24 pb-4 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto flex items-center justify-center gap-2 text-center">
            <Check className="h-4 w-4 shrink-0" />
            <p className="font-body text-sm">
              <span className="font-semibold">{tokenOffering.name_snapshot}</span> is active
              {tokenOffering.is_unlimited ? "" : ` · ${tokenOffering.credits_remaining} credits left`}. Pick any class below to book it free.
            </p>
          </div>
        </div>
      )}

      {/* Banner */}
      <div className="bg-spa-sage/10 border-b border-spa-sage/20">
        <div className={`${tokenOffering?.valid ? "pt-6" : "pt-24"} pb-6 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto text-center`}>
          <p className="font-body text-sm italic text-muted-foreground">
            {cls.banner}
          </p>
        </div>
      </div>

      <div className="pb-16 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
        <motion.div {...fadeIn} className="mt-10 rounded-2xl overflow-hidden aspect-[16/9] sm:aspect-[21/9]">
          <img
            src={classesHero}
            alt="Aerial yoga class at Holis Wellness Center"
            className="w-full h-full object-cover"
            loading="eager"
          />
        </motion.div>
        {/* Upcoming Events Heading */}
        <motion.div {...fadeIn} className="text-center mt-14 mb-4">
          <h1 className="spa-heading-xl text-foreground">{cls.title}</h1>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-3">
            <Link
              to="/classes/schedule"
              className="font-body text-sm text-spa-sage underline underline-offset-4 hover:text-spa-sage/80 transition-colors"
            >
              {cls.calendarLink}
            </Link>
            <span className="hidden sm:inline text-muted-foreground">·</span>
            <Link
              to="/private-sessions"
              className="font-body text-sm text-spa-sage underline underline-offset-4 hover:text-spa-sage/80 transition-colors"
            >
              {cls.privateLink}
            </Link>
          </div>
        </motion.div>

        <motion.div {...fadeIn} className="mt-6 text-center">
          <a
            href="#buy"
            className="font-body text-sm text-spa-sage underline underline-offset-4 hover:text-spa-sage/80 transition-colors"
          >
            {t("classes.buyMemberships")}
          </a>
        </motion.div>

        {isLoading ? (
          <div className="space-y-8 mt-10">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-64 rounded-2xl" />
            ))}
          </div>
        ) : !events?.length ? (
          <motion.div {...fadeIn} className="text-center py-20">
            <CalendarDays className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="spa-heading-md text-foreground mb-2">{cls.emptyTitle}</h2>
            <p className="spa-body max-w-md mx-auto">
              {cls.emptyDescription}
            </p>
          </motion.div>
        ) : (
          <motion.div {...fadeIn} className="space-y-8 mt-10">
            {regularEvents.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </motion.div>
        )}

        {/* Workshops Section */}
        {workshops.length > 0 && (
          <motion.div {...fadeIn} className="mt-20">
            <div className="text-center mb-10">
              <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-spa-sage mb-3">
                {cls.workshopsEyebrow}
              </p>
              <h2 className="spa-heading-lg text-foreground">{cls.workshopsTitle}</h2>
              <p className="spa-body mt-3 max-w-xl mx-auto">
                {cls.workshopsSubtitle}
              </p>
            </div>
            <div className="space-y-8">
              {workshops.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          </motion.div>
        )}

        {/* Buy Memberships, Class Passes & Drop-ins */}
        <motion.section {...fadeIn} id="buy" className="mt-24 scroll-mt-24">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 mb-3 text-spa-sage">
              <ShoppingBag className="h-4 w-4" />
              <p className="font-body text-xs font-semibold uppercase tracking-[0.2em]">{t("classes.purchaseEyebrow")}</p>
            </div>
            <h2 className="spa-heading-lg text-foreground">{t("classes.membershipsTitle")}</h2>
            <p className="spa-body mt-3 max-w-xl mx-auto">
              {t("classes.membershipsSubtitle")}
            </p>
          </div>
          <OfferingsPurchaseSection redirectAfterPurchase="/dashboard" />
        </motion.section>
      </div>
      <Footer />
    </div>
  );
};

export default ClassesPage;
