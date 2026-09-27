import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { useLanguage } from "@/i18n/LanguageProvider";
import { localizeRow } from "@/lib/localizeRow";
import { HERO_IMAGE_FIRST } from "@/lib/heroImage";

const fadeIn = {
  initial: { opacity: 0, y: 24 } as const,
  animate: { opacity: 1, y: 0 } as const,
  transition: { duration: 0.6 },
};

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: { html?: string } | any;
  cover_image: string | null;
  gallery_images: string[];
  author: string | null;
  publish_date: string | null;
  seo_title: string | null;
  seo_description: string | null;
  status: string;
}

function formatDate(d: string | null, locale: string) {
  if (!d) return "";
  return new Date(d).toLocaleDateString(locale, { month: "long", day: "numeric", year: "numeric" });
}

const POST_I18N_FIELDS = ["title", "excerpt", "content", "seo_title", "seo_description"];

export default function BlogPostPage() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { slug } = useParams();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    supabase
      .from("blog_posts")
      .select("*")
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle()
      .then(({ data }) => {
        if (!data) setNotFound(true);
        else setPost(localizeRow(data as any, language, POST_I18N_FIELDS) as any);
        setLoading(false);
      });
  }, [slug, language]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="font-body text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }

  if (notFound || !post) return <Navigate to="/blog" replace />;

  const html = (post.content as any)?.html ?? "";

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.seo_description || post.excerpt || "",
    image: post.cover_image || undefined,
    author: post.author ? { "@type": "Person", name: post.author } : undefined,
    datePublished: post.publish_date || undefined,
    url: `https://spaholis.com/blog/${post.slug}`,
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title={`${post.seo_title || post.title} | Holis Wellness Center`}
        description={(post.seo_description || post.excerpt || "").slice(0, 155)}
        canonical={`/blog/${post.slug}`}
        type="article"
        image={post.cover_image || undefined}
        jsonLd={articleJsonLd}
      />
      <Navbar />

      <main>
        <section className="relative pt-16">
          <div className="aspect-[16/10] max-h-[560px] w-full overflow-hidden md:aspect-[21/9]">
            {post.cover_image && (
              <img {...HERO_IMAGE_FIRST} src={post.cover_image} alt={post.title} className="h-full w-full object-cover" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
          </div>
          <div className="absolute bottom-8 left-0 right-0 mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <motion.div {...fadeIn}>
              <Button variant="secondary" size="sm" asChild className="mb-5">
                <Link to="/blog">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {t("blog.backToBlog")}
                </Link>
              </Button>
              <div className="mb-3 flex flex-wrap items-center gap-3 font-body text-sm text-spa-cream/85">
                {post.author && <span>{post.author}</span>}
                {post.publish_date && (
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-4 w-4" />
                    {formatDate(post.publish_date, language === "es" ? "es-ES" : "en-US")}
                  </span>
                )}
              </div>
              <h1 className="spa-heading-xl max-w-4xl text-spa-cream drop-shadow-lg">{post.title}</h1>
            </motion.div>
          </div>
        </section>

        <motion.article
          {...fadeIn}
          className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8"
        >
          {post.excerpt && (
            <p className="spa-body text-xl leading-relaxed mb-8 text-foreground/90 italic">
              {post.excerpt}
            </p>
          )}
          <div
            className="prose prose-lg max-w-none font-body
              prose-headings:font-heading prose-headings:text-foreground
              prose-p:text-foreground/85 prose-p:leading-relaxed
              prose-a:text-primary prose-a:underline
              prose-strong:text-foreground
              prose-img:rounded-xl prose-img:my-6
              prose-blockquote:border-l-primary prose-blockquote:italic"
            dangerouslySetInnerHTML={{ __html: html }}
          />

          {post.gallery_images && post.gallery_images.length > 0 && (
            <div className="mt-12">
              <h2 className="font-heading text-2xl mb-6">{t("blog.gallery")}</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {post.gallery_images.map((img, i) => (
                  <img key={i} src={img} alt={`${post.title} ${i + 1}`} className="w-full aspect-square object-cover rounded-xl" loading="lazy" />
                ))}
              </div>
            </div>
          )}
        </motion.article>
      </main>

      <Footer />
    </div>
  );
}
