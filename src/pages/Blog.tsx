import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { useLanguage } from "@/i18n/LanguageProvider";
import { localizeRows } from "@/lib/localizeRow";
import { HERO_IMAGE_FIRST } from "@/lib/heroImage";

const fadeIn = {
  initial: { opacity: 0, y: 24 } as const,
  whileInView: { opacity: 1, y: 0 } as const,
  viewport: { once: true },
  transition: { duration: 0.6 },
};

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  cover_image: string | null;
  author: string | null;
  publish_date: string | null;
  featured: boolean;
}

function formatDate(d: string | null, locale: string = "en-US") {
  if (!d) return "";
  const date = new Date(d);
  return date.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
}

export default function BlogPage() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    supabase
      .from("blog_posts")
      .select("id,title,title_es,slug,excerpt,excerpt_es,cover_image,author,publish_date,featured")
      .eq("status", "published")
      .order("featured", { ascending: false })
      .order("publish_date", { ascending: false, nullsFirst: false })
      .order("sort_order", { ascending: true })
      .then(({ data }) => {
        const localized = localizeRows((data ?? []) as any[], language, ["title", "excerpt"]);
        setPosts(localized as any);
        setLoading(false);
      });
  }, [language]);

  const heroPost = posts[0];
  const dateLocale = language === "es" ? "es-ES" : "en-US";

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title={t("blog.metaTitle")}
        description={t("blog.metaDescription")}
        canonical="/blog"
      />
      <Navbar />

      <div className="relative pt-16">
        <div className="aspect-[21/9] min-h-[260px] max-h-[420px] w-full overflow-hidden">
          {heroPost?.cover_image && (
            <img {...HERO_IMAGE_FIRST}
              src={heroPost.cover_image}
              alt={heroPost.title}
              className="h-full w-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent opacity-50" />
        </div>
        <div className="absolute bottom-8 left-0 right-0 mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <motion.div {...fadeIn}>
            <p className="mb-2 font-body text-xs font-semibold uppercase tracking-[0.2em] text-spa-cream/80">
              {t("blog.brand")}
            </p>
            <h1 className="spa-heading-xl text-spa-cream drop-shadow-lg">{t("blog.title")}</h1>
          </motion.div>
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        <motion.div {...fadeIn} className="mb-10 max-w-3xl">
          <p className="spa-body text-lg leading-relaxed">
            {t("blog.intro")}
          </p>
        </motion.div>

        {loading ? (
          <p className="text-center font-body text-muted-foreground py-12">{t("blog.loading")}</p>
        ) : posts.length === 0 ? (
          <p className="text-center font-body text-muted-foreground py-12">{t("blog.empty")}</p>
        ) : (
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            {posts.map((post) => (
              <motion.article key={post.id} {...fadeIn}>
                <Link
                  to={`/blog/${post.slug}`}
                  className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card transition-shadow hover:shadow-lg"
                >
                  {post.cover_image && (
                    <div className="aspect-[16/10] overflow-hidden">
                      <img
                        src={post.cover_image}
                        alt={post.title}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                      />
                    </div>
                  )}
                  <div className="flex flex-1 flex-col space-y-3 p-6">
                    <div className="flex flex-wrap items-center gap-3 font-body text-xs text-muted-foreground">
                      {post.author && <span>{post.author}</span>}
                      {post.publish_date && (
                        <span className="flex items-center gap-1">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {formatDate(post.publish_date, dateLocale)}
                        </span>
                      )}
                    </div>
                    <h2 className="font-heading text-xl font-medium text-foreground transition-colors group-hover:text-primary">
                      {post.title}
                    </h2>
                    {post.excerpt && (
                      <p className="spa-body-sm line-clamp-4 flex-1">{post.excerpt}</p>
                    )}
                    <div className="pt-2">
                      <Button variant="default" size="sm" asChild>
                        <span>
                          {t("blog.readMore")}
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </span>
                      </Button>
                    </div>
                  </div>
                </Link>
              </motion.article>
            ))}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
