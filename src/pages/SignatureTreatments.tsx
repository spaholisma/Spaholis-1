import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SEO } from "@/components/SEO";
import { useSiteContent, useSiteSeo } from "@/hooks/useSiteContent";
import { content as defaults, seo as seoDefaults } from "@/data/content";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { WellnessProgramsSection } from "@/components/WellnessProgramsSection";

const fade = {
  initial: { opacity: 0, y: 24 } as const,
  whileInView: { opacity: 1, y: 0 } as const,
  viewport: { once: true },
  transition: { duration: 0.6 },
};

interface Treatment {
  title: string;
  description: string;
  benefits: string[];
  image: string;
  imageAlt: string;
  bookingLink: string;
  comingSoon: boolean;
}

function TreatmentCard({ treatment, index }: { treatment: Treatment; index: number }) {
  const { t } = useTranslation();
  const isEven = index % 2 === 0;

  return (
    <motion.div
      {...fade}
      className={`grid md:grid-cols-2 gap-8 lg:gap-14 items-center ${
        !isEven ? "md:[direction:rtl]" : ""
      }`}
    >
      <div className="aspect-[4/3] rounded-2xl overflow-hidden bg-muted md:[direction:ltr]">
        {treatment.image && (
          <img
            src={treatment.image}
            alt={treatment.imageAlt || treatment.title}
            className="w-full h-full object-cover transition-transform duration-700 hover:scale-105"
            loading="lazy"
          />
        )}
      </div>

      <div className="space-y-5 md:[direction:ltr]">
        <div className="flex items-center gap-3">
          {treatment.comingSoon && (
            <span className="text-[11px] font-body font-semibold uppercase tracking-widest bg-spa-sage/10 text-spa-sage px-3 py-1 rounded-full">
              {t("signatureTreatments.comingSoon")}
            </span>
          )}
        </div>

        <h3 className="font-heading text-2xl sm:text-3xl font-light text-foreground">
          {treatment.title}
        </h3>

        <p className="font-body text-sm text-muted-foreground leading-relaxed">
          {treatment.description}
        </p>

        <ul className="space-y-2">
          {treatment.benefits.map((benefit: string) => (
            <li key={benefit} className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-spa-sage shrink-0" />
              <span className="font-body text-sm text-muted-foreground">{benefit}</span>
            </li>
          ))}
        </ul>

        {treatment.comingSoon ? (
          <Button variant="outline" disabled className="mt-2 font-body">
            {t("signatureTreatments.comingSoon")}
          </Button>
        ) : (
          <Link to={treatment.bookingLink}>
            <Button className="mt-2 font-body bg-spa-sage hover:bg-spa-sage/90 text-white">
              {t("signatureTreatments.bookNow")}
            </Button>
          </Link>
        )}
      </div>
    </motion.div>
  );
}

const SignatureTreatments = () => {
  const { data: siteContent } = useSiteContent();
  const { data: seoData } = useSiteSeo();
  const seo = seoData || seoDefaults;
  const sig = (siteContent as any)?.signatureTreatments || defaults.signatureTreatments;

  return (
    <div className="min-h-screen bg-background">
      <SEO title={seo.signatureTreatments.title} description={seo.signatureTreatments.description} canonical={seo.signatureTreatments.canonical} />
      <Navbar />

      {/* Hero */}
      <section className="relative h-[50vh] min-h-[350px] overflow-hidden">
        {sig.heroImage && (
          <img
            src={sig.heroImage}
            alt={sig.heroImageAlt || "Signature Treatments"}
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
        <div className="relative z-10 h-full flex flex-col justify-end px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto pb-12">
          <motion.p {...fade} className="font-body text-xs font-semibold uppercase tracking-[0.25em] text-white/80 mb-3">
            {sig.heroEyebrow}
          </motion.p>
          <motion.h1 {...fade} className="font-heading text-4xl sm:text-5xl lg:text-6xl font-light text-white max-w-3xl">
            {sig.heroTitle}
          </motion.h1>
          <motion.p {...fade} transition={{ duration: 0.6, delay: 0.15 }} className="font-body text-base sm:text-lg text-white/80 mt-4 max-w-xl">
            {sig.heroSubtitle}
          </motion.p>
        </div>
      </section>

      {/* Intro */}
      <section className="px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto py-20">
        <motion.div {...fade} className="text-center space-y-6">
          <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {sig.introEyebrow}
          </p>
          <h2 className="font-heading text-3xl sm:text-4xl font-light text-foreground leading-tight">
            {sig.introTitle}
          </h2>
          <p className="font-body text-base text-muted-foreground leading-relaxed max-w-3xl mx-auto">
            {sig.introText}
          </p>
        </motion.div>
      </section>

      {/* Treatments */}
      <section className="px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto pb-24">
        <div className="space-y-24">
          {sig.treatments.map((treatment: Treatment, i: number) => (
            <TreatmentCard key={treatment.title} treatment={treatment} index={i} />
          ))}
        </div>
      </section>

      {/* Wellness Programs (same programs as /wellness-programs) */}
      <WellnessProgramsSection />

      {/* CTA */}
      <section className="border-b border-border">
        <div className="px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto py-20 text-center">
          <motion.div {...fade} className="space-y-6">
            <h2 className="font-heading text-3xl sm:text-4xl font-light text-foreground">
              {sig.ctaTitle}
            </h2>
            <p className="font-body text-base text-muted-foreground max-w-xl mx-auto">
              {sig.ctaText}
            </p>
            <Link to="/book">
              <Button size="lg" className="font-body bg-spa-sage hover:bg-spa-sage/90 text-white mt-4">
                {sig.ctaButtonText}
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default SignatureTreatments;
