import { Button } from "@/components/ui/button";
import { RichText } from "@/components/ui/rich-text";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Star, Quote, ArrowRight } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SEO, businessJsonLd } from "@/components/SEO";
import { WellnessSection } from "@/components/WellnessSection";
import { testimonials } from "@/data/services";
import { useSiteContent, useSiteSeo } from "@/hooks/useSiteContent";
import { content as defaultContent } from "@/data/content";
import { useTranslation } from "react-i18next";
// Real photos sourced from spaholis.com (Squarespace CDN)
const signatureImages = {
  signatureSomato: "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/558db4e1-a1f4-4c5a-be26-b98512dd6ddf/massage_page.jpg",
  signatureHolisynergie: "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/1710017291666-GUTIMLDB1FIWKSMM99RF/spa-home.jpg",
  signatureFacial: "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/13188b0e-e90f-482b-b100-8e6df443a342/IMG_3394-e1402951220128.jpg",
  signatureExpand: "https://images.squarespace-cdn.com/content/v1/65e538a41cdc651ab18c95d3/fb8bcca7-04cb-4a14-9558-ff7f38846bce/Untitled+design.png",
} as const;

const fadeIn = {
  initial: { opacity: 0, y: 24 } as const,
  whileInView: { opacity: 1, y: 0 } as const,
  viewport: { once: true },
  transition: { duration: 0.6, ease: "easeOut" as const },
};

const Index = () => {
  const { t } = useTranslation();
  const { data: content } = useSiteContent();
  const { data: seoData } = useSiteSeo();
  const c = content || defaultContent;
  const { hero, signatureExperiences, movement, testimonials: testimonialsContent, cta } = c;
  const seo = seoData || { home: { title: "", description: "", canonical: "/" } };

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title={seo.home.title}
        description={seo.home.description}
        canonical={seo.home.canonical}
        jsonLd={businessJsonLd}
      />
      <Navbar />

      {/* Hero */}
      <section className="relative h-[90vh] min-h-[600px] overflow-hidden">
        <img
          src={hero.backgroundImage}
          alt={hero.backgroundAlt}
          className="absolute inset-0 w-full h-full object-cover"
          fetchPriority="high"
          width={1920}
          height={1080}
        />
        <div className="absolute inset-0 bg-spa-charcoal/50" />
        <div className="relative z-10 flex items-center justify-center h-full px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="max-w-2xl text-center"
          >
            <h1 className="spa-heading-xl text-spa-cream mb-6 max-w-xl mx-auto">
              {hero.title}
            </h1>
            <p className="font-body text-spa-cream/75 text-lg mb-10 leading-relaxed max-w-xl mx-auto">
              <RichText value={hero.subtitle} />
            </p>
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-4 justify-center">
              <Button variant="spa" size="xl" asChild>
                <Link to={hero.primaryCta.link}>{hero.primaryCta.text}</Link>
              </Button>
              <Button variant="ghost" size="xl" className="text-spa-cream hover:text-spa-cream hover:bg-spa-cream/10 border border-spa-cream/30" asChild>
                <Link to={hero.secondaryCta.link}>{hero.secondaryCta.text}</Link>
              </Button>
              {hero.tertiaryCta && (
                <Button variant="ghost" size="xl" className="text-spa-cream hover:text-spa-cream hover:bg-spa-cream/10 border border-spa-cream/30" asChild>
                  <Link to={hero.tertiaryCta.link}>{hero.tertiaryCta.text}</Link>
                </Button>
              )}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══ Wellness Section ═══ */}
      <WellnessSection />

      {/* Signature Experiences */}
      <section className="bg-muted">
        <div className="spa-section">
          <motion.div {...fadeIn} className="text-center mb-12">
            <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-3">{signatureExperiences.eyebrow}</p>
            <h2 className="spa-heading-lg text-foreground">{signatureExperiences.title}</h2>
            <p className="spa-body mt-3 max-w-lg mx-auto"><RichText value={signatureExperiences.subtitle} /></p>
          </motion.div>
          <motion.div {...fadeIn} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {signatureExperiences.items.map((exp) => (
              <div key={exp.title} className="group">
                <div className="rounded-2xl overflow-hidden aspect-[4/5] mb-4 relative">
                  <img
                    src={signatureImages[exp.imageKey]}
                    alt={exp.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                    loading="lazy"
                    width={800}
                    height={1024}
                  />
                  <div className="absolute inset-0 bg-primary/10 mix-blend-multiply pointer-events-none" />
                </div>
                <h3 className="font-heading text-base font-medium text-foreground mb-1.5 leading-tight whitespace-pre-line">{exp.title}</h3>
                <p className="font-body text-xs text-muted-foreground leading-relaxed mb-3 whitespace-pre-line">{exp.benefit}</p>
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/book?category=${encodeURIComponent(exp.category)}`}>{t("indexPage.book")}</Link>
                </Button>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Movement */}
      <section className="spa-section">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <motion.div {...fadeIn}>
            <img
              src={movement.image}
              alt={movement.imageAlt}
              className="rounded-3xl w-full aspect-[4/3] object-cover"
            />
          </motion.div>
          <motion.div {...fadeIn}>
            <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-3">{movement.eyebrow}</p>
            <h2 className="spa-heading-lg text-foreground mb-6">{movement.title}</h2>
            {movement.description.map((para, i) => (
              <p key={i} className="spa-body mb-4"><RichText value={para} /></p>
            ))}
            <div className="mt-4">
              <Button variant="outline" size="lg" asChild>
                <Link to={movement.ctaLink}>{movement.ctaText}</Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="bg-muted">
        <div className="spa-section">
          <motion.div {...fadeIn} className="text-center mb-4">
            <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-3">{testimonialsContent.eyebrow}</p>
            <h2 className="spa-heading-lg text-foreground">{testimonialsContent.title}</h2>
            <div className="flex items-center justify-center gap-2 mt-4">
              <div className="flex gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-5 w-5 fill-spa-sand text-spa-sand" />
                ))}
              </div>
              <span className="font-body text-sm font-medium text-foreground">{testimonialsContent.rating} / 5</span>
              <span className="font-body text-sm text-muted-foreground">— {testimonialsContent.totalReviews} {t("indexPage.reviewsSuffix")}</span>
            </div>
          </motion.div>
          <motion.div {...fadeIn} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-10">
            {testimonials.slice(0, 6).map((t) => (
              <div key={t.id} className="bg-card rounded-2xl p-8 shadow-sm relative">
                <Quote className="absolute top-6 right-6 h-8 w-8 text-border" />
                <div className="flex gap-0.5 mb-4">
                  {Array.from({ length: t.rating }).map((_, i) => (
                    <Star key={i} className="h-3.5 w-3.5 fill-spa-sand text-spa-sand" />
                  ))}
                </div>
                <p className="font-body text-sm text-muted-foreground leading-relaxed mb-6 font-light">
                  "{t.text}"
                </p>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-body text-sm font-semibold text-foreground">{t.name}</p>
                    <p className="font-body text-xs text-muted-foreground">{t.context} · {t.date}</p>
                  </div>
                </div>
              </div>
            ))}
          </motion.div>
          <motion.div {...fadeIn} className="text-center mt-8">
            <a
              href={testimonialsContent.tripadvisorUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-body text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
            >
              {testimonialsContent.readAllText}
            </a>
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-spa-charcoal">
        <div className="spa-section text-center">
          <motion.div {...fadeIn}>
            <h2 className="spa-heading-lg text-spa-cream mb-4">{cta.title}</h2>
            <p className="font-body text-spa-cream/70 mb-8 max-w-lg mx-auto leading-relaxed">
              <RichText value={cta.subtitle} />
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button variant="spa" size="xl" asChild>
                <Link to={cta.primaryCta.link}>{cta.primaryCta.text}</Link>
              </Button>
              <Button variant="ghost" size="xl" className="text-spa-cream hover:text-spa-cream hover:bg-spa-cream/10" asChild>
                <Link to={cta.secondaryCta.link}>{cta.secondaryCta.text} <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
            </div>
            <p className="font-body text-xs text-spa-cream/50 mt-4 tracking-wide"><RichText value={cta.note} /></p>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Index;
