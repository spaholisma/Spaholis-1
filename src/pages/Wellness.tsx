import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SEO } from "@/components/SEO";
import { seo } from "@/data/content";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowRight, Sparkles, Heart, Activity, BookOpen, X } from "lucide-react";
import { wellnessCategories, feelingFilters, type WellnessCategory } from "@/data/wellnessCategories";
import { useTranslation } from "react-i18next";

const fadeIn = {
  initial: { opacity: 0, y: 24 } as const,
  whileInView: { opacity: 1, y: 0 } as const,
  viewport: { once: true },
  transition: { duration: 0.6 },
};

const categoryIcons: Record<string, React.ReactNode> = {
  unwind_relax: <Sparkles className="h-6 w-6" />,
  activate_uplift: <Activity className="h-6 w-6" />,
  recover_restore: <Heart className="h-6 w-6" />,
  learn_transform: <BookOpen className="h-6 w-6" />,
};

const tagColors: Record<string, string> = {
  Relax: "bg-primary/20 text-primary-foreground",
  Energy: "bg-accent/20 text-accent-foreground",
  Recovery: "bg-destructive/10 text-destructive",
  Transform: "bg-secondary/20 text-secondary-foreground",
};

const WellnessPage = () => {
  const { t: tr } = useTranslation();
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const filteredCategories = activeFilter
    ? wellnessCategories.filter((c) => c.id === activeFilter)
    : wellnessCategories;

  return (
    <div className="min-h-screen bg-background">
      <SEO title={seo.wellness.title} description={seo.wellness.description} canonical={seo.wellness.canonical} />
      <Navbar />

      {/* Hero */}
      <section className="pt-28 pb-16 px-4 sm:px-6 lg:px-8">
        <motion.div {...fadeIn} className="max-w-3xl mx-auto text-center">
          <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-3">
            Your Wellness Journey
          </p>
          <h1 className="spa-heading-xl text-foreground mb-4">
            How Do You Want to Feel Today?
          </h1>
          <p className="spa-body text-muted-foreground max-w-xl mx-auto">
            Choose the experience that speaks to you. Every treatment is designed around how you want to feel — not just what we offer.
          </p>
        </motion.div>
      </section>

      {/* Feeling Filters */}
      <section className="px-4 sm:px-6 lg:px-8 pb-8">
        <motion.div {...fadeIn} className="max-w-3xl mx-auto flex flex-wrap justify-center gap-3">
          {feelingFilters.map((f) => (
            <button
              key={f.categoryId}
              onClick={() => setActiveFilter(activeFilter === f.categoryId ? null : f.categoryId)}
              className={`px-5 py-2.5 rounded-full font-body text-sm font-medium transition-all ${
                activeFilter === f.categoryId
                  ? "bg-foreground text-background shadow-md"
                  : "bg-muted text-muted-foreground hover:bg-border hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
          {activeFilter && (
            <button
              onClick={() => setActiveFilter(null)}
              className="px-4 py-2.5 rounded-full font-body text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              <X className="h-3.5 w-3.5" /> Clear
            </button>
          )}
        </motion.div>
      </section>

      {/* Category Cards */}
      <section className="px-4 sm:px-6 lg:px-8 pb-20">
        <div className="max-w-6xl mx-auto grid gap-8 md:grid-cols-2">
          <AnimatePresence mode="popLayout">
            {filteredCategories.map((cat, i) => (
              <motion.div
                key={cat.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className="relative rounded-3xl overflow-hidden group cursor-pointer"
                onClick={() => setExpandedCategory(expandedCategory === cat.id ? null : cat.id)}
              >
                {/* Background Image */}
                <div className="aspect-[4/3] relative">
                  <img
                    src={cat.image}
                    alt={cat.title}
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-spa-charcoal/90 via-spa-charcoal/40 to-transparent" />
                  <div className="absolute inset-0 flex flex-col justify-end p-8">
                    <div className="flex items-center gap-2 text-spa-cream/70 mb-2">
                      {categoryIcons[cat.id]}
                    </div>
                    <h2 className="font-heading text-3xl font-medium text-spa-cream mb-2">
                      {cat.title}
                    </h2>
                    <p className="font-body text-spa-cream/80 text-sm italic mb-1">
                      {cat.tagline}
                    </p>
                    <p className="font-body text-spa-cream/60 text-xs">
                      "{cat.intent}"
                    </p>
                    <div className="flex items-center gap-2 mt-4">
                      <span className="font-body text-xs text-spa-cream/50">
                        {cat.treatments.length} treatments
                      </span>
                      <ArrowRight className={`h-4 w-4 text-spa-cream/50 transition-transform ${expandedCategory === cat.id ? "rotate-90" : ""}`} />
                    </div>
                  </div>
                </div>

                {/* Expanded Treatment List */}
                <AnimatePresence>
                  {expandedCategory === cat.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.4 }}
                      className="overflow-hidden bg-card border-t border-border"
                    >
                      <div className="p-6 space-y-3">
                        {cat.treatments.map((t) => (
                          <div
                            key={t.name}
                            className="flex items-start justify-between gap-4 py-3 border-b border-border last:border-0"
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-body text-sm font-semibold text-foreground whitespace-pre-line">
                                  {t.name}
                                </h4>
                                <span className={`text-[11px] font-body font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${tagColors[t.tag]}`}>
                                  {t.tag}
                                </span>
                              </div>
                              <p className="font-body text-xs text-muted-foreground">
                                {t.description}
                              </p>
                            </div>
                            <Button variant="outline" size="sm" asChild className="shrink-0">
                              <Link to={`/book?category=${encodeURIComponent(t.tag === "Relax" ? "Massage Therapy" : t.tag === "Energy" ? "Massage Therapy" : t.tag === "Recovery" ? "Holistic Therapy" : "Wellness Programs")}`}>{tr("services.book")}</Link>
                            </Button>
                          </div>
                        ))}
                      </div>
                      <div className="px-6 pb-6">
                        <Button variant="spa" size="lg" className="w-full" asChild>
                          <Link to="/book">{tr("wellness.buildExperience")}</Link>
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-spa-charcoal">
        <div className="spa-section text-center">
          <motion.div {...fadeIn}>
            <h2 className="spa-heading-lg text-spa-cream mb-4">{tr("wellness.notSureWhereToStart")}</h2>
            <p className="font-body text-spa-cream/70 mb-8 max-w-md mx-auto">
              Let us help you create a personalized wellness experience tailored to your needs.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button variant="spa" size="xl" asChild>
                <Link to="/book">{tr("nav.book")}</Link>
              </Button>
              <Button variant="ghost" size="xl" className="text-spa-cream hover:text-spa-cream hover:bg-spa-cream/10" asChild>
                <Link to="/treatments-therapies">{tr("wellness.browseAllServices")} <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default WellnessPage;
