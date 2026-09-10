import { useState } from "react";
import { formatCRCWithUsd } from "@/lib/currency";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneField } from "@/components/booking/PhoneField";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useRetreatBySlug, type PricingTier } from "@/hooks/useRetreats";
import { supabase } from "@/integrations/supabase/client";
import { CalendarDays, Check, ChevronDown, MapPin, Users, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

const fadeIn = {
  initial: { opacity: 0, y: 24 } as const,
  whileInView: { opacity: 1, y: 0 } as const,
  viewport: { once: true },
  transition: { duration: 0.6 },
};

function PricingTable({ tiers }: { tiers: PricingTier[] }) {
  const { t } = useTranslation();
  const [showAccommodation, setShowAccommodation] = useState(true);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => setShowAccommodation(true)}
          className={cn(
            "px-4 py-2 rounded-full font-body text-sm font-medium transition-all",
            showAccommodation ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-border"
          )}
        >
          {t("retreats.withAccommodation")}
        </button>
        <button
          onClick={() => setShowAccommodation(false)}
          className={cn(
            "px-4 py-2 rounded-full font-body text-sm font-medium transition-all",
            !showAccommodation ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-border"
          )}
        >
          {t("retreats.withoutAccommodation")}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {tiers.map((tier) => (
          <div key={tier.season} className="bg-card rounded-xl border border-border p-5">
            <h4 className="font-heading text-sm font-semibold text-foreground mb-1">{tier.label}</h4>
            <div className="space-y-2 mt-3">
              {(showAccommodation ? tier.with_accommodation : tier.without_accommodation).map((p) => (
                <div key={p.occupancy} className="flex items-center justify-between">
                  <span className="font-body text-sm text-muted-foreground capitalize">{p.occupancy}</span>
                  <span className="font-heading text-base font-semibold text-foreground">
                    {formatCRCWithUsd(p.price)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {!showAccommodation && (
        <p className="font-body text-xs text-muted-foreground italic">
          {t("retreats.noAccomNote")}
        </p>
      )}
    </div>
  );
}

function InquiryForm({ retreatId, retreatTitle }: { retreatId: string; retreatTitle: string }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    number_of_guests: 1,
    occupancy_type: "single",
    with_accommodation: true,
    message: "",
  });
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.first_name || !form.last_name || !form.email) {
      toast.error(t("retreats.fillRequired"));
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from("retreat_inquiries" as any).insert({
        retreat_id: retreatId,
        retreat_title: retreatTitle,
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        phone: form.phone,
        preferred_start_date: startDate ? format(startDate, "yyyy-MM-dd") : null,
        number_of_guests: form.number_of_guests,
        occupancy_type: form.occupancy_type,
        with_accommodation: form.with_accommodation,
        message: form.message,
      } as any);
      if (error) throw error;
      toast.success(t("retreats.inquirySubmitted"));
      setSubmitted(true);
    } catch (err: any) {
      toast.error(err.message || t("retreats.inquiryFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="bg-spa-sage/10 rounded-2xl p-8 text-center">
        <Check className="h-12 w-12 text-spa-sage mx-auto mb-4" />
        <h3 className="font-heading text-xl font-medium text-foreground mb-2">{t("retreats.inquiryReceived")}</h3>
        <p className="spa-body-sm">
          {t("retreats.conciergeFollowup")}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-card rounded-2xl border border-border p-6 space-y-4">
      <h3 className="font-heading text-lg font-medium text-foreground">{t("retreats.bookThisRetreat")}</h3>
      <p className="spa-body-sm">{t("retreats.concierge")}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="font-body text-sm font-medium text-foreground mb-1.5 block">{t("form.firstName")} *</label>
          <Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
        </div>
        <div>
          <label className="font-body text-sm font-medium text-foreground mb-1.5 block">{t("form.lastName")} *</label>
          <Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
        </div>
      </div>

      <div>
        <label className="font-body text-sm font-medium text-foreground mb-1.5 block">{t("form.email")} *</label>
        <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </div>

      <div>
        <label className="font-body text-sm font-medium text-foreground mb-1.5 block">{t("form.phone")}</label>
        <PhoneField value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
      </div>

      {/* Date picker */}
      <div>
        <label className="font-body text-sm font-medium text-foreground mb-1.5 block">{t("retreats.preferredStartDate")}</label>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !startDate && "text-muted-foreground")}>
              <CalendarDays className="mr-2 h-4 w-4" />
              {startDate ? format(startDate, "PPP") : t("common.selectDate")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={startDate}
              onSelect={setStartDate}
              disabled={(date) => { const t = new Date(); t.setHours(0,0,0,0); return date < t; }}
              initialFocus
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="font-body text-sm font-medium text-foreground mb-1.5 block">{t("retreats.numberOfGuests")}</label>
          <select
            className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-body"
            value={form.number_of_guests}
            onChange={(e) => setForm({ ...form, number_of_guests: Number(e.target.value) })}
          >
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>{n} {n === 1 ? t("common.person") : t("common.people")}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="font-body text-sm font-medium text-foreground mb-1.5 block">{t("retreats.occupancyType")}</label>
          <select
            className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-body"
            value={form.occupancy_type}
            onChange={(e) => setForm({ ...form, occupancy_type: e.target.value })}
          >
            <option value="single">{t("retreats.single")}</option>
            <option value="double">{t("retreats.double")}</option>
            <option value="triple">{t("retreats.triple")}</option>
          </select>
        </div>
      </div>

      <div>
        <label className="flex items-center gap-2 font-body text-sm text-foreground">
          <input
            type="checkbox"
            checked={form.with_accommodation}
            onChange={(e) => setForm({ ...form, with_accommodation: e.target.checked })}
          />
          {t("retreats.includeAccommodation")}
        </label>
      </div>

      <div>
        <label className="font-body text-sm font-medium text-foreground mb-1.5 block">
          {t("retreats.preferences")}
        </label>
        <textarea
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
          className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-body min-h-[80px]"
          placeholder={t("retreats.preferencesPlaceholder")}
        />
      </div>

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? t("common.submitting") : t("retreats.submitInquiry")}
      </Button>

      <p className="font-body text-xs text-muted-foreground text-center">
        {t("retreats.depositNote")}
      </p>
    </form>
  );
}

export default function RetreatDetailPage() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const { data: retreat, isLoading } = useRetreatBySlug(slug);
  const [activeTab, setActiveTab] = useState<"overview" | "itinerary" | "pricing">("overview");

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-24 pb-16 px-4 max-w-5xl mx-auto">
          <Skeleton className="h-[300px] w-full rounded-2xl mb-8" />
          <Skeleton className="h-8 w-2/3 mb-4" />
          <Skeleton className="h-20 w-full" />
        </div>
        <Footer />
      </div>
    );
  }

  if (!retreat) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-24 pb-16 px-4 max-w-5xl mx-auto text-center">
          <h1 className="spa-heading-lg text-foreground mb-4">{t("retreats.notFound")}</h1>
          <Button asChild><Link to="/retreats">{t("retreats.viewAll")}</Link></Button>
        </div>
        <Footer />
      </div>
    );
  }

  const tabs = [
    { key: "overview" as const, label: t("retreats.tabs.overview") },
    { key: "itinerary" as const, label: t("retreats.tabs.itinerary") },
    { key: "pricing" as const, label: t("retreats.tabs.pricing") },
  ];

  const eventJsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: retreat.title,
    description: retreat.short_description || retreat.description || "",
    image: retreat.image_url || undefined,
    duration: `P${retreat.duration_days}D`,
    location: {
      "@type": "Place",
      name: "Holis Wellness Center",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Manuel Antonio",
        addressRegion: "Quepos",
        addressCountry: "CR",
      },
    },
    url: `https://spaholis.com/retreats/${retreat.slug}`,
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title={`${retreat.title} | Holis Wellness Center`}
        description={retreat.short_description || retreat.description?.slice(0, 155) || ""}
        canonical={`/retreats/${retreat.slug}`}
        type="article"
        image={retreat.image_url || undefined}
        jsonLd={eventJsonLd}
      />
      <Navbar />

      {/* Hero Image */}
      <div className="relative pt-16">
        <div className="aspect-[21/9] max-h-[400px] w-full overflow-hidden">
          <img src={retreat.image_url || ""} alt={retreat.title} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
        </div>
        <div className="absolute bottom-6 left-0 right-0 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
          <motion.div {...fadeIn}>
            <Link to="/retreats" className="font-body text-xs text-spa-cream/70 hover:text-spa-cream mb-2 block">
              {t("retreats.back")}
            </Link>
            <h1 className="spa-heading-xl text-spa-cream drop-shadow-lg">{retreat.title}</h1>
            <div className="flex items-center gap-4 mt-2 text-sm font-body text-spa-cream/80">
              <span className="flex items-center gap-1"><CalendarDays className="h-4 w-4" />{retreat.duration_days} {t("retreats.days")}</span>
              <span className="flex items-center gap-1"><MapPin className="h-4 w-4" />Manuel Antonio, CR</span>
            </div>
          </motion.div>
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto py-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Tabs */}
            <div className="flex gap-1 bg-muted rounded-xl p-1">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={cn(
                    "flex-1 py-2.5 rounded-lg font-body text-sm font-medium transition-all",
                    activeTab === t.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Overview */}
            {activeTab === "overview" && (
              <motion.div {...fadeIn} className="space-y-8">
                <div>
                  <p className="spa-body text-base leading-relaxed">{retreat.description}</p>
                </div>

                {/* What's Included */}
                {retreat.inclusions?.length > 0 && (
                  <div>
                    <h3 className="font-heading text-lg font-medium text-foreground mb-4">{t("retreats.whatsIncluded")}</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {retreat.inclusions.map((item, i) => (
                        <div key={i} className="flex items-start gap-3">
                          <Check className="h-4 w-4 text-spa-sage mt-0.5 shrink-0" />
                          <span className="font-body text-sm text-foreground">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Gallery */}
                {retreat.gallery_images?.length > 0 && (
                  <div>
                    <h3 className="font-heading text-lg font-medium text-foreground mb-4">{t("blog.gallery")}</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {retreat.gallery_images.map((img, i) => (
                        <div key={i} className="aspect-square rounded-xl overflow-hidden">
                          <img src={img} alt={`${retreat.title} gallery ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* Itinerary */}
            {activeTab === "itinerary" && (
              <motion.div {...fadeIn} className="space-y-6">
                <h3 className="font-heading text-lg font-medium text-foreground">{t("retreats.sampleItinerary")}</h3>
                {retreat.itinerary?.map((day) => (
                  <div key={day.day} className="bg-card rounded-xl border border-border p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="w-8 h-8 rounded-full bg-foreground text-background flex items-center justify-center text-xs font-body font-semibold">
                        {day.day}
                      </span>
                      <h4 className="font-heading text-base font-medium text-foreground">{day.title}</h4>
                    </div>
                    <ul className="space-y-2 ml-11">
                      {day.activities.map((a, i) => (
                        <li key={i} className="font-body text-sm text-muted-foreground flex items-start gap-2">
                          <span className="text-spa-sage mt-1">•</span>
                          {a}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </motion.div>
            )}

            {/* Pricing */}
            {activeTab === "pricing" && (
              <motion.div {...fadeIn} className="space-y-6">
                <h3 className="font-heading text-lg font-medium text-foreground">{t("retreats.pricing")}</h3>
                <PricingTable tiers={retreat.pricing_tiers} />
                {retreat.booking_policies && (
                  <div className="bg-muted rounded-xl p-5">
                    <h4 className="font-heading text-sm font-semibold text-foreground mb-2">{t("retreats.bookingPolicies")}</h4>
                    <p className="font-body text-sm text-muted-foreground whitespace-pre-line">{retreat.booking_policies}</p>
                  </div>
                )}
              </motion.div>
            )}
          </div>

          {/* Sidebar: Inquiry Form */}
          <div className="space-y-6">
            <InquiryForm retreatId={retreat.id} retreatTitle={retreat.title} />
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
