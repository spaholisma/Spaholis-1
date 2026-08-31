import { useEffect } from "react";
import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SEO } from "@/components/SEO";
import { useSiteContent, useSiteSeo } from "@/hooks/useSiteContent";
import { content as defaults, seo as seoDefaults } from "@/data/content";
import { cmsEditProps } from "@/lib/cmsEdit";
import { useUpcomingEvents } from "@/hooks/useClasses";
import { EventCard } from "@/components/EventCard";
import { ClassTypeCard } from "@/components/ClassTypeCard";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, ShoppingBag , Ticket } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { OfferingsPurchaseSection } from "@/components/OfferingsPurchaseSection";
import { FeaturedWorkshop, useFeaturedEvent } from "@/components/FeaturedWorkshop";
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
  const { hash } = useLocation();

  // Scroll to the memberships & passes section when arriving with #buy (the
  // "Passes & Memberships" menu item, or the "Renew now" email button).
  //
  // Keyed off the ROUTER hash, not window.location: clicking the menu item
  // while already on /classes changes the hash without remounting the page, so
  // an effect that only depended on isLoading never re-ran and the link
  // appeared to do nothing. Retries because the list renders asynchronously.
  useEffect(() => {
    if (isLoading) return;
    if (hash !== "#buy") return;
    let tries = 0;
    const timers: number[] = [];
    const go = () => {
      const el = document.getElementById("buy");
      if (el) {
        if (Math.abs(el.getBoundingClientRect().top) < 80) return;
        el.scrollIntoView({ behavior: "smooth" });
      }
      if (tries++ < 8) timers.push(window.setTimeout(go, 250));
    };
    timers.push(window.setTimeout(go, 120));
    return () => timers.forEach(clearTimeout);
  }, [isLoading, hash]);

  // One-off events (workshops, special events, etc.) vs regular weekly classes.
  const EVENT_CATEGORIES = new Set(["Workshop", "Special Event", "Sound Bath", "Breathwork", "Meditation", "Retreat"]);
  const specialEvents = events?.filter((e) => EVENT_CATEGORIES.has(e.classes.category)) ?? [];
  const regularEvents = events?.filter((e) => !EVENT_CATEGORIES.has(e.classes.category)) ?? [];

  // Weekly Classes lists one card per CLASS TYPE, not per session: the same
  // class runs several times a week, so rendering every session repeated the
  // same card with a different date. Exact dates stay in the Class Schedule.
  const regularClassTypes = Object.values(
    regularEvents.reduce<Record<string, typeof regularEvents>>((acc, e) => {
      (acc[e.class_id] ??= []).push(e);
      return acc;
    }, {}),
  ).sort((a, b) => a[0].classes.title.localeCompare(b[0].classes.title));

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
              {tokenOffering.guest_name ? <>Welcome, <span className="font-semibold">{tokenOffering.guest_name}</span>! </> : null}
              <span className="font-semibold">{tokenOffering.name_snapshot}</span>
              {tokenOffering.code ? <> (code {tokenOffering.code})</> : null} is active
              {tokenOffering.is_unlimited ? "" : ` · ${tokenOffering.credits_remaining} credits left`}. Pick any class below to book it free.
            </p>
          </div>
        </div>
      )}

      {/* Banner */}
      <div className="bg-spa-sage/10 border-b border-spa-sage/20">
        <div className={`${tokenOffering?.valid ? "pt-6" : "pt-24"} pb-6 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto text-center`}>
          <p {...cmsEditProps("classes.banner")} className="font-body text-sm italic text-muted-foreground">
            {cls.banner}
          </p>
        </div>
      </div>

      <div className="pb-16 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
        <motion.div {...fadeIn} className="mt-10 rounded-2xl overflow-hidden aspect-[16/9] sm:aspect-[21/9]">
          <img
            {...cmsEditProps("classes.heroImage", "image")}
            src={cls.heroImage || classesHero}
            alt="Aerial yoga class at Holis Wellness Center"
            className="w-full h-full object-cover"
            loading="eager"
          />
        </motion.div>
        {/* Upcoming Events Heading */}
        <motion.div {...fadeIn} className="text-center mt-14 mb-4">
          <h1 {...cmsEditProps("classes.title")} className="spa-heading-xl text-foreground">{cls.title}</h1>
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
          <div className="mt-6 flex justify-center px-4">
            <Button asChild variant="spa" size="lg" className="h-auto min-h-12 w-full sm:w-auto max-w-full whitespace-normal text-center py-3 leading-tight">
              <Link to="/private-gyrotonic-manuel-antonio">
                {(cls as any).gyrotonicLink || "Discover GYROTONIC® Expansion System"}
              </Link>
            </Button>
          </div>
        </motion.div>

        {/* Featured one-off workshop (auto-hides after its date) — shown below the Upcoming Events heading */}
        {useFeaturedEvent() && (
          <div className="mt-8">
            <FeaturedWorkshop />
          </div>
        )}

        {/* Passes & memberships live near the bottom of this page (~74% down),
            so surface them here as a compact banner. Uses <Link> rather than a
            bare #buy anchor so the router hash updates and the scroll effect
            above runs, giving a smooth jump instead of an instant one. */}
        <motion.div {...fadeIn} className="mt-6">
          <Link
            to="#buy"
            className="group flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-4 rounded-2xl border border-spa-sage/30 bg-spa-sage/10 px-4 py-3 sm:px-5 sm:py-4 hover:bg-spa-sage/20 transition-colors"
          >
            <span className="flex items-start sm:items-center gap-3 min-w-0">
              <Ticket className="h-5 w-5 text-spa-sage shrink-0 mt-0.5 sm:mt-0" />
              <span className="min-w-0 text-left">
                <span className="block font-heading text-sm font-semibold text-foreground">
                  {(cls as any).passesBannerTitle || "Coming more than once?"}
                </span>
                <span className="block font-body text-xs text-muted-foreground line-clamp-2">
                  {(cls as any).passesBannerText}
                </span>
              </span>
            </span>
            <span className="shrink-0 self-start sm:self-auto pl-8 sm:pl-0 font-body text-xs font-semibold uppercase tracking-wider text-spa-sage group-hover:underline whitespace-nowrap">
              {(cls as any).passesBannerCta || cls.buyMemberships} →
            </span>
          </Link>
        </motion.div>

        {/* Always-visible link to the Education page (courses, workshops, SAS
            training) — independent of whether workshop events are scheduled. */}
        <motion.div {...fadeIn} className="mt-3 text-center">
          <Link
            to="/education"
            className="font-body text-sm text-spa-sage underline underline-offset-4 hover:text-spa-sage/80 transition-colors"
          >
            {cls.coursesLink}
          </Link>
        </motion.div>

        {isLoading ? (
          <div className="space-y-8 mt-10">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-64 rounded-2xl" />
            ))}
          </div>
        ) : specialEvents.length === 0 && regularEvents.length === 0 ? (
          <motion.div {...fadeIn} className="text-center py-20">
            <CalendarDays className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 {...cmsEditProps("classes.emptyTitle")} className="spa-heading-md text-foreground mb-2">{cls.emptyTitle}</h2>
            <p {...cmsEditProps("classes.emptyDescription")} className="spa-body max-w-md mx-auto">
              {cls.emptyDescription}
            </p>
          </motion.div>
        ) : (
          <>
            {/* Workshops & Special Events (one-off) */}
            {specialEvents.length > 0 && (
              <motion.div {...fadeIn} className="mt-10">
                <p className="text-center font-body text-xs font-semibold uppercase tracking-[0.2em] text-spa-sage mb-6">
                  {(cls as any).eventsEyebrow || "Workshops & Special Events"}
                </p>
                <div className="space-y-8">
                  {specialEvents.map((event) => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </div>
              </motion.div>
            )}

            {/* Regular weekly classes */}
            {regularEvents.length > 0 && (
              <motion.div {...fadeIn} className="mt-20">
                <div className="text-center mb-8">
                  <h2 className="spa-heading-lg text-foreground">{(cls as any).weeklyClassesTitle || "Weekly Classes"}</h2>
                  <p className="spa-body mt-3 max-w-xl mx-auto">{(cls as any).weeklyClassesSubtitle}</p>
                  <Link
                    to="/classes/schedule"
                    className="inline-flex items-center gap-1 mt-3 font-body text-sm font-semibold text-spa-sage hover:underline"
                  >
                    {cls.calendarLink}
                  </Link>
                </div>
                <div className="space-y-8">
                  {regularClassTypes.map((sessions) => (
                    <ClassTypeCard key={sessions[0].class_id} sessions={sessions} />
                  ))}
                </div>
              </motion.div>
            )}
          </>
        )}

        {/* Buy Memberships, Class Passes & Drop-ins */}
        <motion.section {...fadeIn} id="buy" className="mt-24 scroll-mt-24">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 mb-3 text-spa-sage">
              <ShoppingBag className="h-4 w-4" />
              <p {...cmsEditProps("classes.purchaseEyebrow")} className="font-body text-xs font-semibold uppercase tracking-[0.2em]">{cls.purchaseEyebrow}</p>
            </div>
            <h2 {...cmsEditProps("classes.membershipsTitle")} className="spa-heading-lg text-foreground">{cls.membershipsTitle}</h2>
            <p {...cmsEditProps("classes.membershipsSubtitle")} className="spa-body mt-3 max-w-xl mx-auto">
              {cls.membershipsSubtitle}
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
