import { useState } from "react";
import { formatCRCWithUsd, USD_RATE } from "@/lib/currency";
import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SEO } from "@/components/SEO";
import { useSiteContent, useSiteSeo } from "@/hooks/useSiteContent";
import { content as defaults, seo as seoDefaults } from "@/data/content";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Users, Minus, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import oneOnOneImg from "@/assets/one-on-one-private.jpg";
import groupClassImg from "@/assets/group-private-class.jpg";

const fadeIn = {
  initial: { opacity: 0, y: 24 } as const,
  whileInView: { opacity: 1, y: 0 } as const,
  viewport: { once: true },
  transition: { duration: 0.6 },
};

const privateClasses = [
  { id: "one-on-one-private-class", i18nKey: "oneOnOne", fixed: 1 },
  { id: "couples-private-class", i18nKey: "couples", fixed: 2 },
  { id: "private-group-class", i18nKey: "group", fixed: null as number | null, min: 4 },
  { id: "gyrotonic-expansion-system", i18nKey: "gyrotonic", fixed: 1 },
] as const;

function calcPrice(participants: number): number {
  if (participants <= 0) return 0;
  if (participants === 1) return 85;
  if (participants === 2) return 113;
  if (participants <= 4) return 170 + (participants - 4) * 28; // 3 people = between, use linear
  // Actually: 1=$85, 2=$113, 4=$170, additional=$28
  // For 3 people: $170 is for 4, so let's interpret:
  // base for 1 = $85, 2 = $113, 4 = $170
  // additional after 4 = $28 each
  // 3 people: interpolate or just use $170 for up to 4
  return 170 + Math.max(0, participants - 4) * 28;
}

// Pricing in CRC: 1=$85, 2=$113, 3-4=$170, 5+=$170 + $28 per extra (USD ref converted to CRC)
function getPrice(participants: number): number {
  let usd: number;
  if (participants <= 1) usd = 85;
  else if (participants === 2) usd = 113;
  else if (participants <= 4) usd = 170;
  else usd = 170 + (participants - 4) * 28;
  return usd * USD_RATE;
}

const benefitKeys = ["personalized", "faster", "custom", "flexible"] as const;

const PrivateClassesPage = () => {
  const { t } = useTranslation();
  const [participants, setParticipants] = useState<Record<string, number>>({});
  const { data: siteContent } = useSiteContent();
  const { data: seoData } = useSiteSeo();
  const ps = siteContent?.privateSessions || defaults.privateSessions;
  const seo = seoData || seoDefaults;

  const getCount = (cls: typeof privateClasses[number]) => {
    if (cls.fixed !== null && cls.fixed !== undefined) return cls.fixed;
    return participants[cls.id] || ('min' in cls ? (cls as any).min ?? 4 : 4);
  };
  const setCount = (id: string, n: number) =>
    setParticipants((prev) => ({ ...prev, [id]: Math.max(4, Math.min(n, 20)) }));

  return (
    <div className="min-h-screen bg-background">
      <SEO title={seo.privateSessions.title} description={seo.privateSessions.description} canonical={seo.privateSessions.canonical} />
      <Navbar />

      {/* Hero */}
      <section className="pt-28 pb-16 px-4 sm:px-6 lg:px-8 bg-spa-sage/10 border-b border-spa-sage/20">
        <motion.div {...fadeIn} className="max-w-3xl mx-auto text-center">
          <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-spa-sage mb-3">
            {ps.eyebrow}
          </p>
          <h1 className="spa-heading-xl text-foreground mb-4">{ps.title}</h1>
          <p className="spa-body text-muted-foreground max-w-xl mx-auto">
            {ps.subtitle}
          </p>
        </motion.div>
      </section>

      {/* Pricing Guide */}
      <section className="py-10 px-4 sm:px-6 lg:px-8 border-b border-border">
        <div className="max-w-2xl mx-auto">
          <motion.div {...fadeIn} className="text-center mb-6">
            <h2 className="font-heading text-lg font-medium text-foreground">{ps.pricingTitle}</h2>
          </motion.div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            {[
              { label: (ps as any).pricingLabels?.onePerson, price: formatCRCWithUsd(85 * USD_RATE) },
              { label: (ps as any).pricingLabels?.twoPeople, price: formatCRCWithUsd(113 * USD_RATE) },
              { label: (ps as any).pricingLabels?.upToFour, price: formatCRCWithUsd(170 * USD_RATE) },
              { label: (ps as any).pricingLabels?.extraPerson, price: `+${formatCRCWithUsd(28 * USD_RATE)}` },
            ].map((p) => (
              <div key={p.label} className="bg-card border border-border rounded-xl p-4">
                <p className="font-heading text-xl font-semibold text-foreground">{p.price}</p>
                <p className="font-body text-xs text-muted-foreground mt-1">{p.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Class Options */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <motion.div {...fadeIn} className="text-center mb-10">
            <h2 className="spa-heading-lg text-foreground">{ps.offeringsTitle}</h2>
          </motion.div>

          <div className="grid gap-6 sm:grid-cols-2">
            {privateClasses.map((cls, i) => {
              const isFixed = cls.fixed !== null && cls.fixed !== undefined;
              const count = getCount(cls);
              const price = getPrice(count);
              return (
                <motion.div
                  key={cls.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                >
                  <Card className="h-full flex flex-col border-border hover:shadow-lg transition-shadow overflow-hidden">
                    {(() => {
                      const fallbacks: Record<string, string> = {
                        "one-on-one-private-class": oneOnOneImg,
                        "private-group-class": groupClassImg,
                        "gyrotonic-expansion-system": "/images/gyrotonic.jpg",
                      };
                      const img = (ps as any).images?.[cls.id] || fallbacks[cls.id];
                      if (!img) return null;
                      return (
                        <div className="aspect-[16/9] overflow-hidden">
                          <img
                            src={img}
                            alt={((ps as any).classes?.[cls.i18nKey]?.title || cls.id)}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </div>
                      );
                    })()}
                    <CardContent className="p-6 flex flex-col flex-1 gap-4">
                      <h3 className="font-heading text-xl font-medium text-foreground">
                        {((ps as any).classes?.[cls.i18nKey]?.title || cls.id)}
                      </h3>
                      <p className="spa-body-sm text-muted-foreground flex-1">
                        {((ps as any).classes?.[cls.i18nKey]?.description || "")}
                      </p>

                      {/* Participant selector or fixed note */}
                      <div className="flex items-center justify-between bg-muted/50 rounded-lg px-4 py-3">
                        <div className="flex items-center gap-2 text-sm font-body text-muted-foreground">
                          <Users className="h-4 w-4" />
                          <span>{t("privateSessions.participants")}</span>
                        </div>
                        {isFixed ? (
                          <span className="font-body text-sm text-muted-foreground">
                            {count === 1 ? t("privateSessions.personOnly", { count }) : t("privateSessions.peopleOnly", { count })}
                          </span>
                        ) : (
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => setCount(cls.id, count - 1)}
                              className="w-7 h-7 rounded-full border border-border flex items-center justify-center hover:bg-accent transition-colors"
                              aria-label={t("privateSessions.decrease")}
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="font-heading text-base font-semibold text-foreground w-6 text-center">
                              {count}
                            </span>
                            <button
                              onClick={() => setCount(cls.id, count + 1)}
                              className="w-7 h-7 rounded-full border border-border flex items-center justify-center hover:bg-accent transition-colors"
                              aria-label={t("privateSessions.increase")}
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="font-heading text-lg font-semibold text-foreground">
                          {formatCRCWithUsd(price)}
                        </span>
                        <Button asChild variant="spa" size="sm">
                          <Link to={`/book?service=consultation&topic=${encodeURIComponent(`Private Class: ${((ps as any).classes?.[cls.i18nKey]?.title || cls.id)} – ${count} ${count === 1 ? "person" : "people"}`)}`}>
                            {t("common.bookNow")}
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-spa-sage/5">
        <motion.div {...fadeIn} className="max-w-2xl mx-auto text-center">
          <h2 className="spa-heading-lg text-foreground mb-8">{(ps as any).whyChoose}</h2>
          <ul className="space-y-4 text-left max-w-md mx-auto">
            {((ps as any).benefits ?? []).map((benefit: string, idx: number) => (
              <li key={idx} className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-spa-sage shrink-0" />
                <span className="font-body text-foreground">{benefit}</span>
              </li>
            ))}
          </ul>
        </motion.div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <motion.div {...fadeIn} className="max-w-xl mx-auto text-center">
          <h2 className="spa-heading-md text-foreground mb-4">
            {(ps as any).ctaTitle}
          </h2>
          <Button asChild variant="spa" size="xl">
            <Link to="/book">{(ps as any).ctaButton}</Link>
          </Button>
        </motion.div>
      </section>

      <Footer />
    </div>
  );
};

export default PrivateClassesPage;
