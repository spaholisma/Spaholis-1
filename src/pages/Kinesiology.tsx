import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { RichText } from "@/components/ui/rich-text";
import { ArrowRight, ArrowDown, Award, Check } from "lucide-react";
import { useSiteContent, useSiteSeo } from "@/hooks/useSiteContent";
import { content as defaults, seo as seoDefaults } from "@/data/content";

const fadeIn = {
  initial: { opacity: 0, y: 24 } as const,
  whileInView: { opacity: 1, y: 0 } as const,
  viewport: { once: true },
  transition: { duration: 0.6 },
};

const Para = ({ items, className }: { items?: string[]; className?: string }) => (
  <>
    {(items ?? []).map((p, i) => (
      <p key={i} className={className ?? "spa-body mb-4 last:mb-0"}>
        <RichText value={p} />
      </p>
    ))}
  </>
);

const KinesiologyPage = () => {
  const { data: siteContent } = useSiteContent();
  const { data: seoData } = useSiteSeo();
  const c = (siteContent as any)?.kinesiology || (defaults as any).kinesiology;
  const seo = (seoData as any)?.kinesiology || (seoDefaults as any).kinesiology;

  const DatesBtn = ({ variant = "spa" as const }) => (
    <Button asChild variant={variant} size="xl" className="max-w-full whitespace-normal h-auto min-h-12 py-3 text-center leading-tight">
      <Link to={c.datesLink}>{c.datesCta} <ArrowRight className="ml-2 h-4 w-4" /></Link>
    </Button>
  );
  const InfoBtn = ({ dark = false }: { dark?: boolean }) => (
    <Button asChild variant="outline" size="xl" className={dark ? "max-w-full whitespace-normal h-auto min-h-12 py-3 text-center leading-tight border-spa-cream/40 text-spa-cream hover:bg-spa-cream/10 hover:text-spa-cream" : "max-w-full whitespace-normal h-auto min-h-12 py-3 text-center leading-tight"}>
      <Link to={c.infoLink}>{c.infoCta}</Link>
    </Button>
  );

  return (
    <div className="min-h-screen bg-background overflow-x-clip">
      <SEO title={seo.title} description={seo.description} canonical={seo.canonical} />
      <Navbar />

      {/* Hero */}
      <section className="relative min-h-[88vh] overflow-hidden">
        <img src={c.heroImage} alt={c.heroTitle} className="absolute inset-0 w-full h-full object-cover" fetchPriority="high" />
        <div className="absolute inset-0 bg-spa-charcoal/60" />
        <div className="relative z-10 flex items-center justify-center min-h-[88vh] px-4 sm:px-6 lg:px-8 pt-28 pb-16">
          <motion.div {...fadeIn} className="w-full max-w-3xl text-center">
            <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-spa-cream/70 mb-4">{c.eyebrow}</p>
            <h1 className="spa-heading-xl text-spa-cream mb-2">{c.heroTitle}</h1>
            <p className="font-body text-sm uppercase tracking-[0.15em] text-spa-sage mb-5">{c.heroSubtitle}</p>
            <p className="font-heading text-xl md:text-2xl text-spa-cream/90 mb-6">{c.heroTagline}</p>
            <div className="text-spa-cream/85 [&_p]:text-spa-cream/85 max-w-2xl mx-auto text-left sm:text-center">
              <Para items={c.heroText} className="font-body text-spa-cream/85 mb-3 last:mb-0 leading-relaxed" />
            </div>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <DatesBtn />
              <InfoBtn dark />
            </div>
          </motion.div>
        </div>
      </section>

      {/* From protocol to personalized treatment */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-spa-sage/8 border-y border-spa-sage/15">
        <motion.div {...fadeIn} className="max-w-3xl mx-auto">
          <h2 className="font-heading text-3xl md:text-4xl font-semibold text-foreground mb-6">{c.protocolTitle}</h2>
          <Para items={c.protocolText} />
        </motion.div>
      </section>

      {/* What you will learn */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <motion.div {...fadeIn} className="max-w-4xl mx-auto">
          <h2 className="font-heading text-3xl md:text-4xl font-semibold text-foreground mb-3">{c.learnTitle}</h2>
          <p className="spa-body text-muted-foreground mb-8">{c.learnIntro}</p>
          <div className="grid sm:grid-cols-2 gap-5">
            {(c.learnItems ?? []).map((it: { title: string; text: string }, i: number) => (
              <div key={i} className="rounded-2xl border border-border bg-card p-5">
                <p className="font-heading text-lg font-medium text-foreground mb-1.5">{it.title}</p>
                <p className="spa-body-sm text-muted-foreground leading-relaxed">{it.text}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* Assess. Treat. Reassess. */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-spa-charcoal">
        <motion.div {...fadeIn} className="max-w-2xl mx-auto text-center">
          <h2 className="font-heading text-3xl md:text-4xl font-semibold text-spa-cream mb-3">{c.flowTitle}</h2>
          <p className="font-body text-spa-cream/70 mb-10">{c.flowIntro}</p>
          <div className="space-y-3">
            {(c.steps ?? []).map((s: { label: string; text: string }, i: number) => (
              <div key={i}>
                <div className="rounded-2xl border border-spa-cream/20 bg-spa-cream/5 p-5 text-left">
                  <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-spa-sage mb-1.5">{s.label}</p>
                  <p className="font-body text-spa-cream/85 leading-relaxed">{s.text}</p>
                </div>
                {i < (c.steps?.length ?? 0) - 1 && <ArrowDown className="h-5 w-5 text-spa-cream/40 mx-auto my-1" />}
              </div>
            ))}
          </div>
          <p className="font-body text-spa-cream/75 leading-relaxed mt-8">{c.flowOutro}</p>
        </motion.div>
      </section>

      {/* Designed to integrate */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <motion.div {...fadeIn} className="max-w-3xl mx-auto">
          <h2 className="font-heading text-3xl md:text-4xl font-semibold text-foreground mb-6">{c.integrateTitle}</h2>
          <Para items={c.integrateText} />
          <div className="flex flex-wrap gap-2 my-5">
            {(c.integrateList ?? []).map((s: string, i: number) => (
              <span key={i} className="font-body text-sm px-3 py-1.5 rounded-full bg-spa-sage/12 text-foreground border border-spa-sage/20">{s}</span>
            ))}
          </div>
          <p className="spa-body">{c.integrateOutro}</p>
        </motion.div>
      </section>

      {/* Make change easier to observe */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-muted/40">
        <motion.div {...fadeIn} className="max-w-3xl mx-auto">
          <h2 className="font-heading text-3xl md:text-4xl font-semibold text-foreground mb-6">{c.observeTitle}</h2>
          <Para items={c.observeText} />
        </motion.div>
      </section>

      {/* Who is this course for */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <motion.div {...fadeIn} className="max-w-3xl mx-auto">
          <h2 className="font-heading text-3xl md:text-4xl font-semibold text-foreground mb-4">{c.forWhoTitle}</h2>
          <p className="spa-body mb-4">{c.forWhoIntro}</p>
          <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2 mb-8">
            {(c.forWhoList ?? []).map((s: string, i: number) => (
              <li key={i} className="flex items-start gap-2 spa-body">
                <Check className="h-4 w-4 text-spa-sage mt-1 shrink-0" /> <span>{s}</span>
              </li>
            ))}
          </ul>
          <p className="spa-body font-medium mb-3">{c.forWhoQuestionsIntro}</p>
          <div className="space-y-2">
            {(c.forWhoQuestions ?? []).map((q: string, i: number) => (
              <p key={i} className="font-heading text-lg text-foreground/80 italic">“{q}”</p>
            ))}
          </div>
        </motion.div>
      </section>

      {/* Created and taught by Evelina */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-spa-sage/8 border-y border-spa-sage/15">
        <motion.div {...fadeIn} className="max-w-3xl mx-auto text-center rounded-2xl border border-border bg-card p-8 sm:p-10">
          <h2 className="font-heading text-2xl md:text-3xl font-semibold text-foreground mb-4">{c.founderTitle}</h2>
          <div className="max-w-2xl mx-auto text-left">
            <Para items={c.founderText} />
          </div>
          <div className="mt-6">
            <Button asChild variant="outline" size="lg">
              <Link to={c.meetLink}>{c.meetCta}</Link>
            </Button>
          </div>
        </motion.div>
      </section>

      {/* Professional training */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <motion.div {...fadeIn} className="max-w-4xl mx-auto">
          <h2 className="font-heading text-3xl md:text-4xl font-semibold text-foreground mb-3">{c.trainingTitle}</h2>
          <p className="spa-body text-muted-foreground mb-8">{c.trainingIntro}</p>
          <div className="grid sm:grid-cols-3 gap-5">
            {(c.trainingCombines ?? []).map((it: { title: string; text: string }, i: number) => (
              <div key={i} className="rounded-2xl border border-border bg-card p-5">
                <p className="font-heading text-lg font-medium text-foreground mb-1.5">{it.title}</p>
                <p className="spa-body-sm text-muted-foreground leading-relaxed">{it.text}</p>
              </div>
            ))}
          </div>
          <p className="spa-body mt-6">{c.trainingNote}</p>
        </motion.div>
      </section>

      {/* Certificate + final CTA band */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-spa-charcoal">
        <motion.div {...fadeIn} className="max-w-3xl mx-auto text-center">
          <Award className="h-8 w-8 text-spa-sage mx-auto mb-4" />
          <h2 className="font-heading text-3xl md:text-4xl font-semibold text-spa-cream mb-4">{c.certificateTitle}</h2>
          <div className="text-spa-cream/80 [&_p]:text-spa-cream/80 max-w-xl mx-auto">
            <Para items={c.certificateText} />
          </div>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button asChild variant="spa" size="xl" className="max-w-full whitespace-normal h-auto min-h-12 py-3 text-center leading-tight">
              <Link to={c.datesLink}>{c.finalCta} <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
            <InfoBtn dark />
          </div>
        </motion.div>
      </section>

      <Footer />
    </div>
  );
};

export default KinesiologyPage;
