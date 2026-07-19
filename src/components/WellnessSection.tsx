import { useState, useMemo } from "react";
import { formatCRCWithUsd } from "@/lib/currency";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowRight, Sparkles, Heart, Activity, BookOpen, X, Filter } from "lucide-react";
import { useCollections, type ResolvedCollection } from "@/hooks/useCollections";
import { useSiteContent } from "@/hooks/useSiteContent";
import { content as defaults } from "@/data/content";
import { RichText } from "@/components/ui/rich-text";

const fadeIn = {
  initial: { opacity: 0, y: 24 } as const,
  whileInView: { opacity: 1, y: 0 } as const,
  viewport: { once: true },
  transition: { duration: 0.6 },
};

const categoryIcons: Record<string, React.ReactNode> = {
  "Unwind & Relax": <Sparkles className="h-6 w-6" />,
  "Activate & Uplift": <Activity className="h-6 w-6" />,
  "Recover & Restore": <Heart className="h-6 w-6" />,
  "Learn & Transform": <BookOpen className="h-6 w-6" />,
};

const bookingTypeLabels: Record<string, string> = {
  treatment: "Treatment",
  class: "Class",
  retreat: "Retreat",
  experience: "Experience",
  program: "Program",
};

const tagColors: Record<string, string> = {
  relax: "bg-primary/20 text-primary-foreground",
  energy: "bg-accent/20 text-accent-foreground",
  recovery: "bg-destructive/10 text-destructive",
  detox: "bg-secondary/20 text-secondary-foreground",
  transform: "bg-secondary/20 text-secondary-foreground",
  glow: "bg-accent/20 text-accent-foreground",
  strength: "bg-destructive/10 text-destructive",
  flexibility: "bg-primary/20 text-primary-foreground",
  mindfulness: "bg-primary/20 text-primary-foreground",
};

export function WellnessSection() {
  const { data: siteContent } = useSiteContent();
  const { data: collections, isLoading } = useCollections();
  const wellness = siteContent?.wellness || defaults.wellness;

  const [activeCollection, setActiveCollection] = useState<string | null>(null);
  const [expandedCollection, setExpandedCollection] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterTag, setFilterTag] = useState<string>("all");
  const [filterDuration, setFilterDuration] = useState<string>("all");
  const [filterPrice, setFilterPrice] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);

  const activeCollections = useMemo(() =>
    (collections || []).filter(c => c.is_active && c.items.length > 0),
    [collections]
  );

  const allTypes = useMemo(() => {
    const types = new Set<string>();
    activeCollections.forEach(c => c.items.forEach(i => types.add(i.type)));
    return [...types];
  }, [activeCollections]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    activeCollections.forEach(c => c.items.forEach(i => i.tags.forEach(t => tags.add(t))));
    return [...tags].sort();
  }, [activeCollections]);

  const filteredCollections = useMemo(() => {
    let cols = activeCollection
      ? activeCollections.filter(c => c.id === activeCollection)
      : activeCollections;

    if (filterType !== "all" || filterTag !== "all" || filterDuration !== "all" || filterPrice !== "all") {
      cols = cols.map(c => ({
        ...c,
        items: c.items.filter(i => {
          if (filterType !== "all" && i.type !== filterType) return false;
          if (filterTag !== "all" && !i.tags.includes(filterTag)) return false;
          if (filterDuration !== "all") {
            const d = i.duration_minutes;
            if (filterDuration === "30" && d > 30) return false;
            if (filterDuration === "60" && (d < 31 || d > 60)) return false;
            if (filterDuration === "90" && (d < 61 || d > 90)) return false;
            if (filterDuration === "120" && d < 91) return false;
          }
          if (filterPrice !== "all") {
            const p = i.price;
            if (filterPrice === "50" && p > 50) return false;
            if (filterPrice === "100" && (p < 51 || p > 100)) return false;
            if (filterPrice === "200" && (p < 101 || p > 200)) return false;
            if (filterPrice === "201" && p <= 200) return false;
          }
          return true;
        }),
      })).filter(c => c.items.length > 0);
    }
    return cols;
  }, [activeCollections, activeCollection, filterType, filterTag, filterDuration, filterPrice]);

  if (isLoading) return null;
  if (activeCollections.length === 0) return null;

  const hasActiveFilters = filterType !== "all" || filterTag !== "all" || filterDuration !== "all" || filterPrice !== "all" || activeCollection !== null;

  return (
    <>
      {/* Wellness Intro & Collection Filters */}
      <section id="wellness" className="pt-20 pb-8 px-4 sm:px-6 lg:px-8">
        <motion.div {...fadeIn} className="max-w-3xl mx-auto text-center mb-10">
          <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-3">
            {wellness.eyebrow}
          </p>
          <h2 className="spa-heading-lg text-foreground mb-4">
            {wellness.title}
          </h2>
          <p className="spa-body text-muted-foreground max-w-xl mx-auto">
            <RichText value={wellness.subtitle} path="wellness.subtitle" />
          </p>
        </motion.div>

        {/* Collection filter pills */}
        <motion.div {...fadeIn} className="max-w-3xl mx-auto flex flex-wrap justify-center gap-3">
          {activeCollections.map(c => (
            <button
              key={c.id}
              onClick={() => setActiveCollection(activeCollection === c.id ? null : c.id)}
              className={`px-5 py-2.5 rounded-full font-body text-sm font-medium transition-all ${
                activeCollection === c.id
                  ? "bg-foreground text-background shadow-md"
                  : "bg-muted text-muted-foreground hover:bg-border hover:text-foreground"
              }`}
            >
              {c.title}
            </button>
          ))}

          {/* Filter toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-4 py-2.5 rounded-full font-body text-sm font-medium transition-all flex items-center gap-1.5 ${
              showFilters || filterType !== "all" || filterTag !== "all" || filterDuration !== "all" || filterPrice !== "all"
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground hover:bg-border hover:text-foreground"
            }`}
          >
            <Filter className="h-3.5 w-3.5" /> Filter
          </button>

          {hasActiveFilters && (
            <button
              onClick={() => { setActiveCollection(null); setFilterType("all"); setFilterTag("all"); setFilterDuration("all"); setFilterPrice("all"); }}
              className="px-4 py-2.5 rounded-full font-body text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              <X className="h-3.5 w-3.5" /> Clear
            </button>
          )}
        </motion.div>

        {/* Expanded filters */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="max-w-3xl mx-auto mt-4 overflow-hidden"
            >
              <div className="flex flex-wrap justify-center gap-3 p-4 bg-muted/30 rounded-2xl">
                <select
                  className="rounded-full border border-input bg-background px-4 py-2 text-sm font-body"
                  value={filterType}
                  onChange={e => setFilterType(e.target.value)}
                >
                  <option value="all">All types</option>
                  {allTypes.map(t => <option key={t} value={t}>{bookingTypeLabels[t] || t}</option>)}
                </select>
                <select
                  className="rounded-full border border-input bg-background px-4 py-2 text-sm font-body"
                  value={filterTag}
                  onChange={e => setFilterTag(e.target.value)}
                >
                  <option value="all">All tags</option>
                  {allTags.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select
                  className="rounded-full border border-input bg-background px-4 py-2 text-sm font-body"
                  value={filterDuration}
                  onChange={e => setFilterDuration(e.target.value)}
                >
                  <option value="all">Any duration</option>
                  <option value="30">Up to 30 min</option>
                  <option value="60">31–60 min</option>
                  <option value="90">61–90 min</option>
                  <option value="120">90+ min</option>
                </select>
                <select
                  className="rounded-full border border-input bg-background px-4 py-2 text-sm font-body"
                  value={filterPrice}
                  onChange={e => setFilterPrice(e.target.value)}
                >
                  <option value="all">Any price</option>
                  <option value="50">Under $50</option>
                  <option value="100">$51–$100</option>
                  <option value="200">$101–$200</option>
                  <option value="201">$200+</option>
                </select>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Collection Cards */}
      <section className="px-4 sm:px-6 lg:px-8 pb-20">
        <div className="max-w-6xl mx-auto grid gap-8 md:grid-cols-2">
          <AnimatePresence mode="popLayout">
            {filteredCollections.map((col, i) => (
              <motion.div
                key={col.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className="relative rounded-3xl overflow-hidden group cursor-pointer"
                onClick={() => setExpandedCollection(expandedCollection === col.id ? null : col.id)}
              >
                {/* Background Image */}
                <div className="aspect-[4/3] relative">
                  <img
                    src={col.image || "https://images.unsplash.com/photo-1515377905703-c4788e51af15?auto=format&fit=crop&w=1200&q=80"}
                    alt={col.title}
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-spa-charcoal/90 via-spa-charcoal/40 to-transparent" />
                  <div className="absolute inset-0 flex flex-col justify-end p-8">
                    <div className="flex items-center gap-2 text-spa-cream/70 mb-2">
                      {categoryIcons[col.title] || <Sparkles className="h-6 w-6" />}
                    </div>
                    <h3 className="font-heading text-3xl font-medium text-spa-cream mb-2">
                      {col.title}
                    </h3>
                    {col.tagline && (
                      <p className="font-body text-spa-cream/80 text-sm italic mb-1">
                        {col.tagline}
                      </p>
                    )}
                    {col.intent && (
                      <p className="font-body text-spa-cream/60 text-xs">
                        "{col.intent}"
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-4">
                      <span className="font-body text-xs text-spa-cream/50">
                        {col.items.length} {col.items.length === 1 ? "item" : "items"}
                      </span>
                      <ArrowRight className={`h-4 w-4 text-spa-cream/50 transition-transform ${expandedCollection === col.id ? "rotate-90" : ""}`} />
                    </div>
                  </div>
                </div>

                {/* Expanded Item List */}
                <AnimatePresence>
                  {expandedCollection === col.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.4 }}
                      className="overflow-hidden bg-card border-t border-border"
                      onClick={e => e.stopPropagation()}
                    >
                      <div className="p-6 space-y-3">
                        {col.items.map(item => (
                          <div
                            key={item.id}
                            className="flex items-start justify-between gap-4 py-3 border-b border-border last:border-0"
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <h4 className="font-body text-sm font-semibold text-foreground">
                                  {item.title}
                                </h4>
                                <span className="text-[10px] font-body font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/15 text-primary">
                                  {bookingTypeLabels[item.type] || item.type}
                                </span>
                                {item.tags.map(tag => (
                                  <span
                                    key={tag}
                                    className={`text-[10px] font-body font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${tagColors[tag] || "bg-muted text-muted-foreground"}`}
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                              <p className="font-body text-xs text-muted-foreground">
                                {item.description}
                              </p>
                              <p className="font-body text-xs text-muted-foreground/70 mt-1">
                                {item.duration_minutes}min · {formatCRCWithUsd(item.price)}
                                {item.instructor && ` · ${item.instructor}`}
                              </p>
                            </div>
                            <Button variant="outline" size="sm" asChild className="shrink-0">
                              <Link to={
                                item.source_table === "retreats"
                                  ? "/retreats"
                                  : item.source_table === "classes"
                                    ? "/classes"
                                    : `/book?service=${item.source_id}`
                              }>
                                {item.type === "retreat" ? "View" : "Book"}
                              </Link>
                            </Button>
                          </div>
                        ))}
                      </div>
                      <div className="px-6 pb-6">
                        <Button variant="spa" size="lg" className="w-full" asChild>
                          <Link to="/book">Build My Experience</Link>
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
    </>
  );
}
