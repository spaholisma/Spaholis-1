import { useState } from "react";
import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SEO } from "@/components/SEO";
import { useSiteContent, useSiteSeo } from "@/hooks/useSiteContent";
import { content as defaults, seo as seoDefaults } from "@/data/content";
import { cmsEditProps } from "@/lib/cmsEdit";
import { ContactToPayNotice } from "@/components/booking/ContactToPayNotice";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Check, Gift } from "lucide-react";
import { formatCRCWithUsd } from "@/lib/currency";
import { useTranslation } from "react-i18next";

// Preset USD amounts — matches provider (PayPal/Stripe) price options.
const GIFT_AMOUNTS = [25, 60, 80, 110, 200, 250];

const GiftCardsPage = () => {
  const { t } = useTranslation();
  const { data: siteContent } = useSiteContent();
  const { data: seoData } = useSiteSeo();
  const gc = siteContent?.giftCards || defaults.giftCards;
  const seo = seoData || seoDefaults;
  const [amount, setAmount] = useState<number>(60);
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [purchaserEmail, setPurchaserEmail] = useState("");
  const [message, setMessage] = useState("");
  const [purchased, setPurchased] = useState<{ code: string; amount: number } | null>(null);

  const finalAmount = amount;

  if (purchased) {
    return (
      <div className="min-h-screen bg-background">
       <SEO title={seo.giftCards.title} description={seo.giftCards.description} canonical={seo.giftCards.canonical} />
        <Navbar />
        <div className="pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-2xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}>
            <div className="w-16 h-16 rounded-full bg-spa-sage/20 flex items-center justify-center mx-auto mb-6">
              <Check className="h-8 w-8 text-spa-sage" />
            </div>
            <h1 className="spa-heading-lg text-foreground mb-4">{gc.successTitle}</h1>
            <div className="bg-card rounded-2xl border border-border p-8 mb-8">
              <Gift className="h-10 w-10 text-primary mx-auto mb-4" />
              <p className="font-body text-sm text-muted-foreground mb-2">{gc.ui?.code}</p>
              <p className="font-heading text-2xl font-semibold text-foreground tracking-widest mb-4">{purchased.code}</p>
              <p className="font-heading text-3xl font-semibold text-foreground">{formatCRCWithUsd(purchased.amount)}</p>
              {recipientEmail && (
                <p className="font-body text-sm text-muted-foreground mt-4">
                  {String(gc.ui?.copySent||"").replace("{email}", recipientEmail)}
                </p>
              )}
            </div>
            <Button variant="outline" onClick={() => setPurchased(null)}>{gc.successButtonText}</Button>
          </motion.div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SEO title={seo.giftCards.title} description={seo.giftCards.description} canonical={seo.giftCards.canonical} />
      <Navbar />
      <div className="pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto overflow-x-clip">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
          <p {...cmsEditProps("giftCards.eyebrow")} className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-3">{gc.eyebrow}</p>
          <h1 {...cmsEditProps("giftCards.title")} className="spa-heading-xl text-foreground">{gc.title}</h1>
          <p {...cmsEditProps("giftCards.subtitle")} className="spa-body mt-4 max-w-xl mx-auto">
            {gc.subtitle}
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
            <div className="bg-card rounded-2xl border border-border p-8">
              <h2 {...cmsEditProps("giftCards.chooseAmountTitle")} className="font-heading text-xl font-medium text-foreground mb-6">{gc.chooseAmountTitle}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {GIFT_AMOUNTS.map((a) => {
                  const selected = amount === a;
                  return (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setAmount(a)}
                      aria-pressed={selected}
                      className={`py-4 rounded-xl font-heading text-lg font-semibold transition-all border-2 ${
                        selected
                          ? "bg-foreground text-background border-foreground shadow-sm"
                          : "bg-background text-foreground border-border hover:border-foreground/40"
                      }`}
                    >
                      ${a}
                    </button>
                  );
                })}
              </div>

              <div className="space-y-4 mt-6">
                <div>
                  <label className="font-body text-sm font-medium text-foreground mb-1.5 block"><span {...cmsEditProps("giftCards.ui.yourEmail")}>{gc.ui?.yourEmail} *</span></label>
                  <Input value={purchaserEmail} onChange={(e) => setPurchaserEmail(e.target.value)} placeholder={gc.ui?.yourEmailPlaceholder} />
                </div>
                <div>
                  <label className="font-body text-sm font-medium text-foreground mb-1.5 block"><span {...cmsEditProps("giftCards.ui.recipientName")}>{gc.ui?.recipientName}</span></label>
                  <Input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder={gc.ui?.recipientNamePlaceholder} />
                </div>
                <div>
                  <label className="font-body text-sm font-medium text-foreground mb-1.5 block"><span {...cmsEditProps("giftCards.ui.recipientEmail")}>{gc.ui?.recipientEmail}</span></label>
                  <Input value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} placeholder={gc.ui?.recipientEmailPlaceholder} />
                </div>
                <div>
                  <label className="font-body text-sm font-medium text-foreground mb-1.5 block"><span {...cmsEditProps("giftCards.ui.personalMessage")}>{gc.ui?.personalMessage}</span></label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-body ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[80px]"
                    placeholder={gc.ui?.personalMessagePlaceholder}
                  />
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
            <div className="sticky top-24 space-y-6">
              {/* Preview */}
              <div className="bg-gradient-to-br from-primary/20 to-spa-sage/20 rounded-2xl p-8 border border-border text-center">
                <Gift className="h-12 w-12 text-primary mx-auto mb-4" />
                <p className="font-heading text-sm uppercase tracking-widest text-muted-foreground mb-2">Holis Wellness Center</p>
                <p className="font-heading text-4xl font-semibold text-foreground mb-2">{formatCRCWithUsd(finalAmount || 0)}</p>
                <p className="font-body text-sm text-muted-foreground"><span {...cmsEditProps("giftCards.ui.label")}>{gc.ui?.label}</span></p>
                {recipientName && (
                  <p className="font-body text-sm text-foreground mt-4">{gc.ui?.forLabel}: {recipientName}</p>
                )}
                {message && (
                  <p className="font-body text-sm text-muted-foreground mt-2 italic">"{message}"</p>
                )}
              </div>

              {/* Payment */}
              <div className="bg-card rounded-2xl border border-border p-6">
                <div className="flex justify-between mb-4 text-sm font-body">
                  <span className="text-muted-foreground"><span {...cmsEditProps("giftCards.ui.amount")}>{gc.ui?.amount}</span></span>
                  <span className="font-semibold text-foreground">{formatCRCWithUsd(finalAmount || 0)}</span>
                </div>
                {finalAmount > 0 && purchaserEmail && (
                  <ContactToPayNotice
                    serviceTitle={`Holis Gift Card – ${formatCRCWithUsd(finalAmount)}`}
                    amount={finalAmount}
                  />
                )}
                {(!finalAmount || !purchaserEmail) && (
                  <p className="text-xs font-body text-muted-foreground text-center">
                    {gc.ui?.selectPrompt}
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default GiftCardsPage;
