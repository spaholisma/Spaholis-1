import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { MapPin, Phone, Mail, MessageCircle, Star, Clock } from "lucide-react";
import { HOLIS_WHATSAPP_URL, formatWhatsAppDisplay } from "@/lib/whatsapp";
import { HOLIS_PHONE_DISPLAY, HOLIS_PHONE_TEL_URL } from "@/data/contact";
import { useSiteContent, useSiteSeo } from "@/hooks/useSiteContent";
import { content as defaults, seo as seoDefaults } from "@/data/content";

const fadeIn = {
  initial: { opacity: 0, y: 24 } as const,
  whileInView: { opacity: 1, y: 0 } as const,
  viewport: { once: true },
  transition: { duration: 0.6 },
};

const EMAIL = "spaholisma@gmail.com";
const MAPS_QUERY = "Holis Wellness Center, Manuel Antonio, Quepos, Costa Rica";
const MAPS_LINK = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(MAPS_QUERY)}`;
const MAPS_EMBED = `https://www.google.com/maps?q=${encodeURIComponent(MAPS_QUERY)}&output=embed`;

const ContactPage = () => {
  const { data: siteContent } = useSiteContent();
  const { data: seoData } = useSiteSeo();
  const c = (siteContent as any)?.contact || (defaults as any).contact;
  const seo = (seoData as any)?.contact || (seoDefaults as any).contact;
  const cd = c.cards;

  const cards = [
    {
      icon: MapPin,
      title: cd.locationTitle,
      lines: [cd.locationText1, cd.locationText2],
      action: { label: cd.locationCta, href: MAPS_LINK, external: true },
    },
    {
      icon: MessageCircle,
      title: cd.whatsappTitle,
      lines: [formatWhatsAppDisplay()],
      action: { label: cd.whatsappCta, href: HOLIS_WHATSAPP_URL, external: true },
    },
    {
      icon: Phone,
      title: cd.phoneTitle,
      lines: [HOLIS_PHONE_DISPLAY],
      action: { label: cd.phoneCta, href: HOLIS_PHONE_TEL_URL, external: false },
    },
    {
      icon: Mail,
      title: cd.emailTitle,
      lines: [EMAIL],
      action: { label: cd.emailCta, href: `mailto:${EMAIL}`, external: false },
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <SEO title={seo.title} description={seo.description} canonical={seo.canonical} />
      <Navbar />

      <section className="pt-28 pb-12 px-4 sm:px-6 lg:px-8 bg-spa-sage/10 border-b border-spa-sage/20">
        <motion.div {...fadeIn} className="max-w-3xl mx-auto text-center">
          <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-spa-sage mb-3">
            {c.heroEyebrow}
          </p>
          <h1 className="spa-heading-xl text-foreground mb-4">
            {c.heroTitle}
          </h1>
          <p className="spa-body text-muted-foreground max-w-xl mx-auto">
            {c.introText}
          </p>
          <div className="flex items-center justify-center gap-1.5 mt-4 text-sm font-body text-muted-foreground">
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
            <span>{c.reviewText}</span>
          </div>
        </motion.div>
      </section>

      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => (
            <motion.div {...fadeIn} key={card.title} className="bg-card border border-border rounded-2xl p-6 flex flex-col">
              <div className="w-11 h-11 rounded-full bg-spa-sage/15 flex items-center justify-center mb-4">
                <card.icon className="h-5 w-5 text-spa-sage" />
              </div>
              <h2 className="font-heading text-lg font-medium text-foreground mb-1">{card.title}</h2>
              <div className="font-body text-sm text-muted-foreground flex-1 space-y-0.5">
                {card.lines.map((l, i) => <p key={i}>{l}</p>)}
              </div>
              <a
                href={card.action.href}
                {...(card.action.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="mt-4 inline-flex items-center gap-1 font-body text-sm font-semibold text-spa-sage hover:underline"
              >
                {card.action.label} →
              </a>
            </motion.div>
          ))}
        </div>

        {/* Hours + booking */}
        <motion.div {...fadeIn} className="max-w-5xl mx-auto mt-10 rounded-2xl border border-border bg-muted/30 p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-start gap-3">
            <Clock className="h-5 w-5 text-spa-sage mt-0.5 shrink-0" />
            <div>
              <h3 className="font-heading text-lg font-medium text-foreground">
                {c.hoursTitle}
              </h3>
              <p className="font-body text-sm text-muted-foreground mt-1 max-w-md">
                {c.hoursText}
              </p>
            </div>
          </div>
          <Button asChild variant="spa" size="lg" className="shrink-0">
            <Link to="/book">{c.bookLabel}</Link>
          </Button>
        </motion.div>

        {/* Map */}
        <motion.div {...fadeIn} className="max-w-5xl mx-auto mt-8 rounded-2xl overflow-hidden border border-border">
          <iframe
            title="Holis Wellness Center map"
            src={MAPS_EMBED}
            className="w-full h-[360px] border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </motion.div>
      </section>

      <Footer />
    </div>
  );
};

export default ContactPage;
