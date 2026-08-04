import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SEO } from "@/components/SEO";
import { Input } from "@/components/ui/input";
import { Search, ChevronDown, ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFaqCategories, useFaqs, type Faq } from "@/hooks/useFaqs";
import { useLanguage, withLangPrefix } from "@/i18n/LanguageProvider";
import { pickLocalized } from "@/lib/i18n-field";
import { useSiteContent } from "@/hooks/useSiteContent";
import { content as defaults } from "@/data/content";

export default function Faqs() {
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
      description = t("faqs.noResults");
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

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title={seo.title}
        description={seo.description}
        canonical={lp("/faqs")}
        jsonLd={jsonLd}
      />
      <Navbar />

      <main className="pt-24 pb-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Breadcrumbs */}
          <nav aria-label="Breadcrumb" className="mb-8">
            <ol className="flex items-center gap-1.5 text-sm font-body text-muted-foreground">
              <li>
                <Link to={lp("/")} className="flex items-center gap-1 hover:text-foreground transition-colors">
                  <Home className="h-3.5 w-3.5" />
                  <span className="sr-only sm:not-sr-only">{language === "es" ? "Inicio" : "Home"}</span>
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
          <div className="text-center mb-12">
            <p className="text-sm font-body uppercase tracking-widest text-muted-foreground mb-3">
              {fq.eyebrow}
            </p>
            <h1 className="font-heading text-4xl md:text-5xl text-foreground mb-4">
              {t("faqs.title")}
            </h1>
            <p className="font-body text-muted-foreground max-w-2xl mx-auto">
              {fq.intro}
            </p>
          </div>

          {/* Search */}
          <div className="relative max-w-xl mx-auto mb-12">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("faqs.search")}
              className="pl-10 h-12 rounded-full bg-card"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-10">
            {/* Sticky category nav */}
            {grouped.length > 1 && (
              <aside className="hidden lg:block">
                <nav className="sticky top-24 space-y-1">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-body mb-3">
                    {language === "es" ? "Categorías" : "Categories"}
                  </p>
                  {grouped.map((g) => (
                    <a
                      key={g.category.id}
                      href={`#faq-cat-${g.category.slug}`}
                      className={cn(
                        "block text-sm font-body py-2 px-3 rounded-md transition-colors",
                        activeCategory === g.category.slug
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                      )}
                    >
                      {g.category.name}
                    </a>
                  ))}
                </nav>
              </aside>
            )}

            {/* FAQ groups */}
            <div className="space-y-12">
              {grouped.length === 0 && (
                <p className="text-center text-muted-foreground font-body py-12">
                  {t("faqs.noResults")}
                </p>
              )}
              {grouped.map((g) => (
                <section key={g.category.id} id={`faq-cat-${g.category.slug}`} className="scroll-mt-24">
                  {grouped.length > 1 && (
                    <h2 className="font-heading text-2xl text-foreground mb-6">
                      {g.category.name}
                    </h2>
                  )}
                  <div className="divide-y divide-border border-y border-border">
                    {g.items.map((f) => {
                      const open = openId === f.id;
                      return (
                        <div key={f.id}>
                          <button
                            type="button"
                            onClick={() => setOpenId(open ? null : f.id)}
                            className="w-full flex items-start justify-between gap-4 py-5 text-left hover:text-foreground transition-colors"
                            aria-expanded={open}
                          >
                            <span
                              className={cn(
                                "font-heading text-lg leading-snug transition-colors",
                                open ? "text-foreground" : "text-foreground/90",
                              )}
                            >
                              {localizedQuestion(f)}
                            </span>
                            <ChevronDown
                              className={cn(
                                "h-5 w-5 shrink-0 text-muted-foreground transition-transform mt-1",
                                open && "rotate-180 text-foreground",
                              )}
                            />
                          </button>
                          <div
                            className={cn(
                              "grid transition-all duration-300 ease-in-out",
                              open ? "grid-rows-[1fr] opacity-100 pb-6" : "grid-rows-[0fr] opacity-0",
                            )}
                          >
                            <div className="overflow-hidden">
                              <div
                                className="prose prose-sm sm:prose-base max-w-none font-body text-muted-foreground prose-a:text-primary prose-strong:text-foreground"
                                dangerouslySetInnerHTML={{ __html: localizedAnswerHtml(f) }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
