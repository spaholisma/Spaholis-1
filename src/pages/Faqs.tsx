import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SEO } from "@/components/SEO";
import { Input } from "@/components/ui/input";
import { Search, ChevronRight, Home, Plus, X, Mail, MessageCircle, Sparkles } from "lucide-react";
import { HOLIS_EMAIL, HOLIS_WHATSAPP_NUMBER } from "@/data/contact";
import { cn } from "@/lib/utils";
import { useFaqCategories, useFaqs, type Faq } from "@/hooks/useFaqs";
import { useLanguage, withLangPrefix } from "@/i18n/LanguageProvider";
import { pickLocalized } from "@/lib/i18n-field";
import { useSiteContent } from "@/hooks/useSiteContent";
import { content as defaults } from "@/data/content";
import { cmsEditProps } from "@/lib/cmsEdit";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The question with what was searched for picked out. */
function Highlight({ text, term }: { text: string; term: string }) {
  const t = term.trim();
  if (!t) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRe(t)})`, "ig"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === t.toLowerCase()
          ? <mark key={i} className="rounded bg-spa-sage/25 px-0.5 text-foreground">{part}</mark>
          : <Fragment key={i}>{part}</Fragment>)}
    </>
  );
}

export default function Faqs() {
  const reduce = useReducedMotion();
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { data: siteContent } = useSiteContent();
  const fq = (siteContent as any)?.faqs || (defaults as any).faqs;
  const lp = (p: string) => withLangPrefix(p, language);
  // Localized field picker for FAQ rows.
  const localizedQuestion = (f: Faq) =>
    pickLocalized(f as unknown as Record<string, unknown>, "question", language) || f.question;
  const localizedAnswerHtml = (f: Faq) =>
    pickLocalized(f as unknown as Record<string, unknown>, "answer_html", language) || f.answer_html || "";
  const localizedCategoryName = (c: { id: string; name: string }) =>
    pickLocalized(c as unknown as Record<string, unknown>, "name", language) || c.name;
  const { data: categories = [] } = useFaqCategories();
  const { data: faqs = [] } = useFaqs();
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Group faqs by category, preserve order. Uncategorized FAQs appear under "General".
  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = (f: Faq) =>
      !q
        ? true
        : localizedQuestion(f).toLowerCase().includes(q) ||
          localizedAnswerHtml(f).toLowerCase().includes(q);

    const groups: { category: { id: string; name: string; slug: string }; items: Faq[] }[] =
      categories.map((c) => ({
        category: { id: c.id, name: localizedCategoryName(c), slug: c.slug },
        items: faqs.filter((f) => f.category_id === c.id).filter(matches),
      }));

    const uncategorized = faqs.filter((f) => !f.category_id).filter(matches);
    if (uncategorized.length > 0) {
      const generalIdx = groups.findIndex((g) => g.category.slug === "general");
      if (generalIdx >= 0) {
        groups[generalIdx].items = [...groups[generalIdx].items, ...uncategorized];
      } else {
        groups.push({
          category: { id: "__general__", name: language === "es" ? "General" : "General", slug: "general" },
          items: uncategorized,
        });
      }
    }

    return groups.filter((g) => g.items.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, faqs, search, language]);

  // Track which category is in view for sticky nav highlight
  useEffect(() => {
    const handler = () => {
      let current: string | null = null;
      for (const g of grouped) {
        const el = document.getElementById(`faq-cat-${g.category.slug}`);
        if (el) {
          const r = el.getBoundingClientRect();
          if (r.top < 200) current = g.category.slug;
        }
      }
      setActiveCategory(current);
    };
    handler();
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, [grouped]);

  // Visible FAQs in display order (filtered by search, grouped order preserved).
  const visibleFaqs = useMemo(
    () => grouped.flatMap((g) => g.items),
    [grouped],
  );

  // Dynamic page metadata.
  const seo = useMemo(() => {
    const total = visibleFaqs.length;
    const categoryNames = grouped.map((g) => g.category.name);
    const q = search.trim();

    let title = t("faqs.title");
    let description =
      language === "es"
        ? "Respuestas a preguntas frecuentes sobre los tratamientos, clases, retiros y visitas a Manuel Antonio en Holis Wellness Center."
        : "Answers to common questions about Holis Wellness Center treatments, classes, retreats, and visiting Manuel Antonio, Costa Rica.";

    if (q && total > 0) {
      title = `${language === "es" ? "Búsqueda" : "Search"}: "${q}" — ${t("faqs.title")}`;
      description = `${total} ${language === "es" ? "resultado" + (total === 1 ? "" : "s") : "answer" + (total === 1 ? "" : "s")} ${language === "es" ? "para" : "matching"} "${q}".`;
    } else if (q && total === 0) {
      title = `${language === "es" ? "Sin resultados" : "No results"} — ${t("faqs.title")}`;
      description = (fq.ui?.noResults);
    } else if (total > 0) {
      const sampleQuestions = visibleFaqs
        .slice(0, 3)
        .map((f) => localizedQuestion(f).replace(/\?$/, ""))
        .join(" · ");
      description = `${total} ${language === "es" ? "respuestas en" : "answers across"} ${categoryNames.length} ${
        categoryNames.length === 1 ? (language === "es" ? "tema" : "topic") : (language === "es" ? "temas" : "topics")
      } (${categoryNames.slice(0, 4).join(", ")}). ${sampleQuestions}.`.slice(0, 300);
    }

    return { title, description };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grouped, visibleFaqs, search, language]);

  // FAQPage JSON-LD + BreadcrumbList combined via @graph.
  const jsonLd = useMemo(() => {
    const homeName = language === "es" ? "Inicio" : "Home";
    const faqsName = t("faqs.title");
    const baseUrl = language === "es" ? "https://spaholis.com/es" : "https://spaholis.com";
    const breadcrumb = {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: homeName, item: `${baseUrl}/` },
        { "@type": "ListItem", position: 2, name: faqsName, item: `${baseUrl}/faqs` },
      ],
    };

    const faqPage =
      visibleFaqs.length === 0
        ? null
        : {
            "@type": "FAQPage",
            mainEntity: visibleFaqs.map((f) => ({
              "@type": "Question",
              name: localizedQuestion(f),
              acceptedAnswer: {
                "@type": "Answer",
                text: localizedAnswerHtml(f)
                  .replace(/<[^>]+>/g, "")
                  .replace(/\s+/g, " ")
                  .trim(),
              },
            })),
          };

    return {
      "@context": "https://schema.org",
      "@graph": faqPage ? [breadcrumb, faqPage] : [breadcrumb],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleFaqs, language]);

  const es = language === "es";
  const whatsapp = `https://api.whatsapp.com/send?phone=${HOLIS_WHATSAPP_NUMBER}&text=${encodeURIComponent(
    es ? "¡Hola Holis! Tengo una pregunta." : "Hi Holis! I have a question.",
  )}`;
  const total = faqs.length;
  // One running number across every group: 01, 02, 03…
  const numberOf = new Map(visibleFaqs.map((f, i) => [f.id, String(i + 1).padStart(2, "0")]));

  return (
    <div className="min-h-screen bg-background overflow-x-clip">
      <SEO
        title={seo.title}
        description={seo.description}
        canonical={lp("/faqs")}
        jsonLd={jsonLd}
      />
      <Navbar />

      <main className="relative pt-24 pb-24">
        {/* Soft sage light drifting behind the header — the calm of the spa. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] overflow-hidden">
          <motion.div
            className="absolute -top-24 left-1/2 h-[28rem] w-[28rem] -translate-x-[70%] rounded-full bg-spa-sage/15 blur-3xl"
            animate={reduce ? undefined : { x: [0, 40, 0], y: [0, 20, 0] }}
            transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute top-10 left-1/2 h-[22rem] w-[22rem] translate-x-[10%] rounded-full bg-spa-sage/10 blur-3xl"
            animate={reduce ? undefined : { x: [0, -30, 0], y: [0, 30, 0] }}
            transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Breadcrumbs */}
          <nav aria-label="Breadcrumb" className="mb-10">
            <ol className="flex items-center gap-1.5 text-sm font-body text-muted-foreground">
              <li>
                <Link to={lp("/")} className="flex items-center gap-1 hover:text-foreground transition-colors">
                  <Home className="h-3.5 w-3.5" />
                  <span className="sr-only sm:not-sr-only">{es ? "Inicio" : "Home"}</span>
                </Link>
              </li>
              <li aria-hidden="true">
                <ChevronRight className="h-3.5 w-3.5" />
              </li>
              <li aria-current="page" className="text-foreground font-medium">
                {t("faqs.title")}
              </li>
            </ol>
          </nav>

          {/* Header */}
          <motion.div
            className="text-center mb-10"
            initial={reduce ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            <p {...cmsEditProps("faqs.eyebrow")} className="inline-flex items-center gap-2 text-sm font-body uppercase tracking-widest text-spa-sage mb-4">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {fq.eyebrow}
            </p>
            <h1 className="font-heading text-4xl md:text-6xl text-foreground mb-5">
              {t("faqs.title")}
            </h1>
            <p {...cmsEditProps("faqs.intro")} className="font-body text-muted-foreground max-w-2xl mx-auto">
              {fq.intro}
            </p>
          </motion.div>

          {/* Search */}
          <motion.div
            className="relative max-w-xl mx-auto mb-4"
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
          >
            <Search className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={fq.ui?.searchPlaceholder}
              aria-label={fq.ui?.searchPlaceholder}
              className="pl-11 pr-11 h-14 rounded-full bg-card/90 backdrop-blur border-border shadow-[0_14px_40px_-24px_rgba(0,0,0,0.35)] transition-shadow focus-visible:ring-spa-sage/50 focus-visible:shadow-[0_18px_50px_-22px_hsl(var(--spa-sage)/0.7)]"
            />
            <AnimatePresence>
              {search && (
                <motion.button
                  type="button"
                  initial={{ opacity: 0, scale: 0.7, y: "-50%" }} animate={{ opacity: 1, scale: 1, y: "-50%" }} exit={{ opacity: 0, scale: 0.7, y: "-50%" }}
                  onClick={() => setSearch("")}
                  aria-label={es ? "Borrar búsqueda" : "Clear search"}
                  className="absolute right-3 top-1/2 z-10 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </motion.button>
              )}
            </AnimatePresence>
          </motion.div>
          <p className="text-center font-body text-xs text-muted-foreground mb-12" aria-live="polite">
            {search.trim()
              ? (es ? `${visibleFaqs.length} de ${total} respuestas` : `${visibleFaqs.length} of ${total} answers`)
              : (es ? `${total} respuestas` : `${total} answers`)}
          </p>

          {/* Topics, when there is more than one */}
          {grouped.length > 1 && (
            <div className="flex flex-wrap justify-center gap-2 mb-12 lg:hidden">
              {grouped.map((g) => (
                <a key={g.category.id} href={`#faq-cat-${g.category.slug}`}
                  className="rounded-full border border-border bg-card px-4 py-2 font-body text-sm text-muted-foreground hover:border-spa-sage hover:text-foreground transition-colors">
                  {g.category.name}
                </a>
              ))}
            </div>
          )}

          <div className={cn(
            "grid grid-cols-1 gap-10",
            grouped.length > 1 ? "lg:grid-cols-[220px_1fr]" : "max-w-3xl mx-auto",
          )}>
            {/* Sticky category nav — only when there are categories to move between. */}
            {grouped.length > 1 && (
              <aside className="hidden lg:block">
                <nav className="sticky top-28 space-y-1">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-body mb-3">
                    {fq.ui?.categories}
                  </p>
                  {grouped.map((g) => (
                    <a
                      key={g.category.id}
                      href={`#faq-cat-${g.category.slug}`}
                      className={cn(
                        "relative block text-sm font-body py-2 px-3 rounded-lg transition-colors",
                        activeCategory === g.category.slug ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {activeCategory === g.category.slug && (
                        <motion.span layoutId="faq-cat-pill" className="absolute inset-0 rounded-lg border border-spa-sage/40 bg-spa-sage/10"
                          transition={{ type: "spring", stiffness: 420, damping: 34 }} />
                      )}
                      <span className="relative">{g.category.name}</span>
                    </a>
                  ))}
                </nav>
              </aside>
            )}

            {/* FAQ groups */}
            <LayoutGroup>
              <div className="space-y-14 min-w-0">
                {grouped.length === 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    className="rounded-3xl border border-dashed border-border bg-card/60 py-14 text-center"
                  >
                    <p className="font-body text-muted-foreground">{fq.ui?.noResults}</p>
                  </motion.div>
                )}
                {grouped.map((g) => (
                  <section key={g.category.id} id={`faq-cat-${g.category.slug}`} className="scroll-mt-28">
                    {grouped.length > 1 && (
                      <h2 className="font-heading text-2xl text-foreground mb-6">{g.category.name}</h2>
                    )}
                    <ul className="space-y-3">
                      {g.items.map((f, i) => {
                        const open = openId === f.id;
                        const panelId = `faq-answer-${f.id}`;
                        return (
                          <motion.li
                            key={f.id}
                            layout={!reduce}
                            initial={reduce ? false : { opacity: 0, y: 18 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-40px" }}
                            transition={{ duration: 0.5, delay: Math.min(i * 0.05, 0.3), ease: [0.16, 1, 0.3, 1] }}
                            className={cn(
                              "group relative overflow-hidden rounded-2xl border bg-card transition-[border-color,box-shadow] duration-500",
                              open
                                ? "border-spa-sage/60 shadow-[0_24px_60px_-34px_hsl(var(--spa-sage)/0.9)]"
                                : "border-border hover:border-spa-sage/40 hover:shadow-[0_14px_40px_-30px_rgba(0,0,0,0.4)]",
                            )}
                          >
                            {/* A sage wash that rises into the open card. */}
                            <motion.span
                              aria-hidden="true"
                              className="pointer-events-none absolute inset-0 bg-gradient-to-br from-spa-sage/10 via-transparent to-primary/10"
                              initial={false}
                              animate={{ opacity: open ? 1 : 0 }}
                              transition={{ duration: 0.5 }}
                            />
                            <button
                              type="button"
                              onClick={() => setOpenId(open ? null : f.id)}
                              aria-expanded={open}
                              aria-controls={panelId}
                              className="relative w-full flex items-center gap-4 sm:gap-5 px-5 sm:px-7 py-5 sm:py-6 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-2xl"
                            >
                              <span className={cn(
                                "font-heading text-sm tabular-nums transition-colors duration-300 w-6 shrink-0",
                                open ? "text-spa-sage" : "text-muted-foreground/70 group-hover:text-spa-sage",
                              )}>
                                {numberOf.get(f.id)}
                              </span>
                              <span className="flex-1 font-heading text-lg sm:text-xl leading-snug text-foreground">
                                <Highlight text={localizedQuestion(f)} term={search} />
                              </span>
                              <motion.span
                                aria-hidden="true"
                                animate={{ rotate: open ? 45 : 0 }}
                                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                                className={cn(
                                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors duration-300",
                                  open
                                    ? "border-spa-sage bg-spa-sage text-white"
                                    : "border-border text-muted-foreground group-hover:border-spa-sage group-hover:text-spa-sage",
                                )}
                              >
                                <Plus className="h-4 w-4" />
                              </motion.span>
                            </button>
                            <AnimatePresence initial={false}>
                              {open && (
                                <motion.div
                                  id={panelId}
                                  key="answer"
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: reduce ? 0 : 0.45, ease: [0.16, 1, 0.3, 1] }}
                                  className="relative overflow-hidden"
                                >
                                  <motion.div
                                    initial={reduce ? false : { y: 10, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    transition={{ duration: 0.4, delay: 0.08, ease: "easeOut" }}
                                    className="pr-5 sm:pr-7 pb-7 pl-[3.75rem] sm:pl-[4.75rem]"
                                  >
                                    <div className="mb-4 h-px w-12 bg-spa-sage/50" />
                                    <div
                                      className="prose prose-sm sm:prose-base max-w-none font-body text-muted-foreground prose-a:text-primary prose-strong:text-foreground"
                                      dangerouslySetInnerHTML={{ __html: localizedAnswerHtml(f) }}
                                    />
                                  </motion.div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </motion.li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            </LayoutGroup>
          </div>

          {/* Still wondering? Talk to a person. */}
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="relative mt-20 overflow-hidden rounded-3xl bg-[#1d5b68] px-6 py-12 sm:px-12 text-center text-white"
          >
            <motion.img
              src="/class-placeholder.jpg" alt="" aria-hidden="true"
              className="pointer-events-none absolute -right-16 -bottom-16 h-72 w-72 rounded-full object-cover opacity-30"
              animate={reduce ? undefined : { rotate: 360 }}
              transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
            />
            <div className="relative">
              <h2 className="font-heading text-2xl sm:text-3xl mb-3">
                {es ? "¿Aún tienes una pregunta?" : "Still have a question?"}
              </h2>
              <p className="font-body text-white/80 max-w-md mx-auto mb-7">
                {es ? "Escríbenos — una persona de nuestro equipo te responde." : "Write to us — a real person from our team will answer."}
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <a href={whatsapp} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-6 py-3 font-body text-sm font-semibold text-white shadow-lg transition-transform hover:-translate-y-0.5 active:scale-[0.98]">
                  <MessageCircle className="h-4 w-4" /> WhatsApp
                </a>
                <a href={`mailto:${HOLIS_EMAIL}`}
                  className="inline-flex items-center gap-2 rounded-full border border-white/40 px-6 py-3 font-body text-sm font-semibold text-white transition-colors hover:bg-white/10 break-all">
                  <Mail className="h-4 w-4 shrink-0" /> {HOLIS_EMAIL}
                </a>
              </div>
            </div>
          </motion.div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
