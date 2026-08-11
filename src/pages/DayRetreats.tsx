import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Sun, Leaf, HandHeart, UtensilsCrossed } from "lucide-react";
import { useSiteContent, useSiteSeo } from "@/hooks/useSiteContent";
import { content as defaults, seo as seoDefaults } from "@/data/content";

const fadeIn = {
  initial: { opacity: 0, y: 24 } as const,
  whileInView: { opacity: 1, y: 0 } as const,
  viewport: { once: true },
  transition: { duration: 0.6 },
};

const STEP_ICONS = [Leaf, Sun, HandHeart, UtensilsCrossed];

const DayRetreatsPage = () => {
  const { data: siteContent } = useSiteContent();
  const { data: seoData } = useSiteSeo();
  const c = (siteContent as any)?.dayRetreats || (defaults as any).dayRetreats;
  const seo = (seoData as any)?.dayRetreats || (seoDefaults as any).dayRetreats;

  return (
    <div className="min-h-screen bg-background">
      <SEO title={seo.title} description={seo.description} canonical={seo.canonical} />
      <Navbar />

      {/* Hero */}
      <div className="relative pt-16">
        <div className="aspect-[21/9] max-h-[380px] w-full overflow-hidden">
          <img src={c.heroImage} alt="Day retreat at Holis" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        </div>
        <div className="absolute bottom-8 left-0 right-0 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
          <motion.div {...fadeIn}>
            <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-spa-cream/80 mb-2">
              {c.heroEyebrow}
            </p>
            <h1 className="spa-heading-xl text-spa-cream drop-shadow-lg">
              {c.heroTitle}
            </h1>
          </motion.div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <motion.p {...fadeIn} className="spa-body text-lg leading-relaxed max-w-3xl">
          {c.introText}
        </motion.p>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 mt-12">
          {c.steps.map((step: { title: string; text: string }, i: number) => {
            const Icon = STEP_ICONS[i] || Leaf;
            return (
              <motion.div {...fadeIn} key={i} className="bg-card border border-border rounded-2xl p-6">
                <div className="w-11 h-11 rounded-full bg-spa-sage/15 flex items-center justify-center mb-4">
                  <Icon className="h-5 w-5 text-spa-sage" />
                </div>
                <h2 className="font-heading text-lg font-medium text-foreground mb-1.5">{step.title}</h2>
                <p className="font-body text-sm text-muted-foreground leading-relaxed">{step.text}</p>
              </motion.div>
            );
          })}
        </div>

        <motion.div {...fadeIn} className="mt-12 rounded-2xl border border-border bg-spa-sage/5 p-8 text-center">
          <h2 className="font-heading text-2xl font-medium text-foreground mb-2">
            {c.ctaTitle}
          </h2>
          <p className="spa-body max-w-lg mx-auto mb-6">{c.ctaText}</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button asChild variant="spa" size="lg">
              <Link to="/custom-retreat">{c.ctaPrimary}</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/retreats?tab=experiences">{c.ctaSecondary}</Link>
            </Button>
          </div>
        </motion.div>
      </div>

      <Footer />
    </div>
  );
};

export default DayRetreatsPage;
