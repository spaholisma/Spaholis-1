import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { RichText } from "@/components/ui/rich-text";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { MapPin, ArrowRight } from "lucide-react";
import { useSiteContent, useSiteSeo } from "@/hooks/useSiteContent";
import { content as defaults, seo as seoDefaults } from "@/data/content";

const fadeIn = {
  initial: { opacity: 0, y: 24 } as const,
  whileInView: { opacity: 1, y: 0 } as const,
  viewport: { once: true },
  transition: { duration: 0.6 },
};

const Para = ({ items }: { items: string[] }) => (
  <>
    {(items ?? []).map((p, i) => (
      <p key={i} className="spa-body mb-4 last:mb-0">
        <RichText value={p} />
      </p>
    ))}
  </>
);

const GyrotonicPage = () => {
  const { data: siteContent } = useSiteContent();
  const { data: seoData } = useSiteSeo();
  const c = (siteContent as any)?.gyrotonic || (defaults as any).gyrotonic;
  const seo = (seoData as any)?.gyrotonic || (seoDefaults as any).gyrotonic;

  return (
    <div className="min-h-screen bg-background overflow-x-clip">
      <SEO title={seo.title} description={seo.description} canonical={seo.canonical} />
      <Navbar />

      {/* Hero — text + short GYROTONIC® video */}
      <section className="pt-28 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
          <motion.div {...fadeIn}>
            <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-spa-sage mb-3">
              {c.eyebrow}
            </p>
            <h1 className="spa-heading-xl text-foreground mb-6">{c.heroTitle}</h1>
            <Para items={c.heroText} />
            <div className="mt-8">
              <Button asChild variant="spa" size="xl">
                <Link to={c.bookLink}>{c.bookCta}</Link>
              </Button>
            </div>
          </motion.div>
          {c.heroVideoId && (
            <motion.div {...fadeIn} className="rounded-2xl overflow-hidden shadow-lg aspect-video bg-spa-charcoal">
              <iframe
                className="w-full h-full"
                src={`https://www.youtube-nocookie.com/embed/${c.heroVideoId}?rel=0&modestbranding=1&playsinline=1`}
                title={c.heroTitle}
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </motion.div>
          )}
        </div>
      </section>

      {/* Movement should feel alive */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-spa-sage/8 border-y border-spa-sage/15">
        <motion.div {...fadeIn} className="max-w-3xl mx-auto">
          <h2 className="font-heading text-3xl md:text-4xl font-semibold text-foreground mb-6">{c.aliveTitle}</h2>
          <Para items={c.aliveText} />
        </motion.div>
      </section>

      {/* Never tried GYROTONIC before? */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <motion.div {...fadeIn} className="max-w-3xl mx-auto">
          <h2 className="font-heading text-3xl md:text-4xl font-semibold text-foreground mb-6">{c.newTitle}</h2>
          <Para items={c.newText} />
        </motion.div>
      </section>

      {/* More than a workout */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-muted/40">
        <motion.div {...fadeIn} className="max-w-3xl mx-auto">
          <h2 className="font-heading text-3xl md:text-4xl font-semibold text-foreground mb-6">{c.moreTitle}</h2>
          <Para items={c.moreText} />
        </motion.div>
      </section>

      {/* Instructor — Evelina */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <motion.div {...fadeIn} className="max-w-3xl mx-auto text-center rounded-2xl border border-border bg-card p-8 sm:p-10">
          <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-spa-sage mb-2">{c.practitionerEyebrow}</p>
          <h2 className="font-heading text-2xl md:text-3xl font-semibold text-foreground mb-4">{c.practitionerName}</h2>
          <div className="max-w-xl mx-auto">
            <Para items={c.practitionerText} />
          </div>
          <div className="mt-6">
            <Button asChild variant="outline" size="lg">
              <Link to={c.meetLink}>{c.meetCta}</Link>
            </Button>
          </div>
        </motion.div>
      </section>

      {/* CTA band */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-spa-charcoal">
        <motion.div {...fadeIn} className="max-w-3xl mx-auto text-center">
          <h2 className="font-heading text-3xl md:text-4xl font-semibold text-spa-cream mb-4">{c.experienceTitle}</h2>
          <div className="text-spa-cream/80 [&_p]:text-spa-cream/80">
            <Para items={c.experienceText} />
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 mt-5 font-body text-sm text-spa-cream/70">
            <MapPin className="h-4 w-4 text-spa-cream/70" />
            {(c.experienceMeta ?? []).map((m: string, i: number) => (
              <span key={i}>{m}{i < (c.experienceMeta?.length ?? 0) - 1 ? " ·" : ""}</span>
            ))}
          </div>
          <div className="mt-8">
            <Button asChild variant="spa" size="xl">
              <Link to={c.bookLink}>{c.bookCta2} <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          </div>
        </motion.div>
      </section>

      {/* FAQ */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <motion.div {...fadeIn} className="max-w-2xl mx-auto">
          <h2 className="font-heading text-3xl md:text-4xl font-semibold text-foreground text-center mb-8">{c.faqTitle}</h2>
          <Accordion type="single" collapsible className="space-y-3">
            {(c.faqs ?? []).map((f: { question: string; answer: string }, i: number) => (
              <AccordionItem key={i} value={`faq${i}`} className="border border-border rounded-2xl overflow-hidden px-0">
                <AccordionTrigger className="px-5 py-4 hover:no-underline text-left font-heading text-base md:text-lg font-medium text-foreground">
                  {f.question}
                </AccordionTrigger>
                <AccordionContent className="px-5 pb-5 spa-body">
                  <RichText value={f.answer} />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </section>

      <Footer />
    </div>
  );
};

export default GyrotonicPage;
