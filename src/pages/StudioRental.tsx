import { useState } from "react";
import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useSiteContent, useSiteSeo } from "@/hooks/useSiteContent";
import { content as defaults, seo as seoDefaults } from "@/data/content";

const fadeIn = {
  initial: { opacity: 0, y: 24 } as const,
  whileInView: { opacity: 1, y: 0 } as const,
  viewport: { once: true },
  transition: { duration: 0.6 },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const StudioRentalPage = () => {
  const { data: siteContent } = useSiteContent();
  const { data: seoData } = useSiteSeo();
  const c = (siteContent as any)?.studioRental || (defaults as any).studioRental;
  const seo = (seoData as any)?.studioRental || (seoDefaults as any).studioRental;
  const f = c.form;

  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "",
    eventType: "", props: "", day: "", time: "", hours: "", details: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const set = (k: keyof typeof form, v: string) => setForm((prev) => ({ ...prev, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const req = [form.firstName, form.lastName, form.email, form.phone, form.eventType, form.props, form.day, form.time, form.hours];
    if (req.some((v) => !v.trim())) {
      toast.error(f.requiredMessage);
      return;
    }
    if (!EMAIL_RE.test(form.email.trim())) {
      toast.error(f.emailMessage);
      return;
    }
    setSubmitting(true);
    const notes = [
      `Studio Rental Inquiry`,
      `Event/class: ${form.eventType.trim()}`,
      `Props needed: ${form.props.trim()}`,
      `Preferred day/time: ${form.day} ${form.time} (Central Time)`,
      `Hours requested: ${form.hours.trim()}`,
      form.details.trim() ? `Notes: ${form.details.trim()}` : "",
    ].filter(Boolean).join(" — ");
    try {
      await supabase.from("bookings").insert({
        guest_name: `${form.firstName.trim()} ${form.lastName.trim()}`.trim(),
        guest_email: form.email.trim(),
        guest_phone: form.phone.trim() || null,
        booking_date: form.day || new Date().toISOString().split("T")[0],
        booking_time: form.time || "00:00",
        status: "pending",
        notes,
      });
      try {
        await supabase.functions.invoke("send-booking-notification", {
          body: {
            request_kind: "info",
            service_name: "Studio Rental Inquiry",
            guest_name: `${form.firstName.trim()} ${form.lastName.trim()}`.trim(),
            guest_email: form.email.trim(),
            guest_phone: form.phone.trim(),
            notes,
            booking_date: new Date().toLocaleDateString(),
          },
        });
      } catch { /* non-critical */ }
      setSubmitted(true);
    } catch {
      toast.error(f.errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO title={seo.title} description={seo.description} canonical={seo.canonical} />
      <Navbar />

      {/* Hero */}
      <div className="relative pt-16">
        <div className="aspect-[21/9] max-h-[380px] w-full overflow-hidden">
          <img src={c.heroImage} alt="Holis yoga studio" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-foreground/30" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center pt-16">
          <motion.h1 {...fadeIn} className="spa-heading-xl text-spa-cream drop-shadow-lg text-center px-4">
            {c.heroTitle}
          </motion.h1>
        </div>
      </div>

      {/* Studio + your event */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <motion.h2 {...fadeIn} className="font-heading text-3xl md:text-4xl font-semibold text-foreground text-center mb-12">
          {c.sectionTitle}
        </motion.h2>

        <div className="grid md:grid-cols-2 gap-10 items-start">
          <motion.div {...fadeIn} className="space-y-5">
            <p className="spa-body">{c.intro1}</p>
            <p className="spa-body">{c.intro2}</p>

            <div>
              <h3 className="font-heading text-xl font-semibold text-foreground mt-6 mb-3">{c.featuresTitle}</h3>
              <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
                {c.features.map((feat: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 font-body text-sm text-foreground/85">
                    <CheckCircle2 className="h-4 w-4 text-spa-sage shrink-0 mt-0.5" /> {feat}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="font-heading text-xl font-semibold text-foreground mt-6 mb-3">{c.ratesTitle}</h3>
              <ul className="space-y-1.5">
                {c.rates.map((r: { price: string; label: string }, i: number) => (
                  <li key={i} className="font-body text-sm text-foreground/85">
                    <span className="font-heading font-semibold text-foreground">{r.price}</span> · <span className="font-medium">{r.label}</span>
                  </li>
                ))}
              </ul>
              <p className="font-body text-xs text-muted-foreground mt-2">{c.ratesNote}</p>
            </div>
          </motion.div>

          <motion.div {...fadeIn} className="rounded-2xl overflow-hidden md:sticky md:top-24">
            <img src={c.studioImage} alt="Yoga studio rent Manuel Antonio" className="w-full h-full object-cover" loading="lazy" />
          </motion.div>
        </div>
      </section>

      {/* Inquiry */}
      <section className="bg-spa-sage/8 border-t border-spa-sage/20">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <motion.div {...fadeIn} className="text-center mb-10">
            <h2 className="font-heading text-2xl md:text-3xl font-semibold text-foreground leading-tight">
              {c.inquiryTitle1}<br />
              {c.inquiryTitle2}
            </h2>
            <p className="spa-body mt-3">{c.inquiryText}</p>
          </motion.div>

          {submitted ? (
            <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="text-center bg-card border border-border rounded-2xl p-10">
              <div className="w-14 h-14 rounded-full bg-spa-sage/20 flex items-center justify-center mx-auto mb-5">
                <Check className="h-7 w-7 text-spa-sage" />
              </div>
              <h3 className="spa-heading-md text-foreground mb-2">{c.thankYouTitle}</h3>
              <p className="spa-body text-muted-foreground max-w-sm mx-auto">{c.thankYouText}</p>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} className="bg-card border border-border rounded-2xl p-6 sm:p-8 space-y-5">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="font-body text-sm">{f.firstNameLabel} *</Label>
                  <Input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} maxLength={80} required />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-body text-sm">{f.lastNameLabel} *</Label>
                  <Input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} maxLength={80} required />
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="font-body text-sm">{f.emailLabel} *</Label>
                  <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} maxLength={255} required />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-body text-sm">{f.phoneLabel} *</Label>
                  <Input type="tel" inputMode="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} maxLength={40} required />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="font-body text-sm">{f.eventTypeLabel} *</Label>
                <Textarea value={form.eventType} onChange={(e) => set("eventType", e.target.value)} className="min-h-[80px]" required />
              </div>
              <div className="space-y-1.5">
                <Label className="font-body text-sm">{f.propsLabel} *</Label>
                <Input value={form.props} onChange={(e) => set("props", e.target.value)} maxLength={200} required />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="font-body text-sm">{f.dayLabel} *</Label>
                  <Input type="date" value={form.day} min={new Date().toISOString().split("T")[0]} onChange={(e) => set("day", e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-body text-sm">{f.timeLabel} *</Label>
                  <Input type="time" value={form.time} onChange={(e) => set("time", e.target.value)} required />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="font-body text-sm">{f.hoursLabel} *</Label>
                <Input type="number" min="1" step="0.5" value={form.hours} onChange={(e) => set("hours", e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label className="font-body text-sm">{f.detailsLabel}</Label>
                <Textarea value={form.details} onChange={(e) => set("details", e.target.value)} className="min-h-[80px]" />
              </div>
              <Button type="submit" variant="spa" size="lg" className="w-full" disabled={submitting}>
                {submitting ? f.sendingLabel : f.sendLabel}
              </Button>
            </form>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default StudioRentalPage;
