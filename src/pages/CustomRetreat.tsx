import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, Check, Sparkles, Heart, CalendarDays, Pen } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useSiteContent, useSiteSeo } from "@/hooks/useSiteContent";
import { content as defaults, seo as seoDefaults } from "@/data/content";

const stepIcons = [Heart, CalendarDays, Sparkles, Pen];
type Option = { value: string; label: string };
type ServiceCategory = { title: string; subtitle: string; options: Option[] };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function CustomRetreat() {
  const { data: siteContent } = useSiteContent();
  const { data: seoData } = useSiteSeo();
  const c = (siteContent as any)?.customRetreat || (defaults as any).customRetreat;
  const seo = (seoData as any)?.customRetreat || (seoDefaults as any).customRetreat;
  const stepNames: string[] = c.stepNames;

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [form, setForm] = useState({
    contact_name: "",
    email: "",
    phone: "",
    arrival_date: "",
    departure_date: "",
    num_participants: "",
    retreat_intention: [] as string[],
    selected_services: [] as string[],
    special_requests: "",
  });

  const update = (key: string, value: any) => setForm((f) => ({ ...f, [key]: value }));

  const toggleArray = (key: "retreat_intention" | "selected_services", val: string) => {
    setForm((f) => ({
      ...f,
      [key]: f[key].includes(val) ? f[key].filter((v) => v !== val) : [...f[key], val],
    }));
  };

  const canProceed = () => {
    if (step === 0) return EMAIL_RE.test(form.email.trim());
    if (step === 1) return !!form.arrival_date && !!form.departure_date;
    if (step === 2) return form.retreat_intention.length > 0;
    return true;
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    const { error } = await supabase.from("custom_retreat_inquiries").insert({
      full_name: form.contact_name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || null,
      retreat_vision: form.retreat_intention,
      preferred_activities: form.selected_services,
      arrival_date: form.arrival_date || null,
      departure_date: form.departure_date || null,
      num_participants: form.num_participants.trim() || null,
      special_requests: form.special_requests.trim() || null,
    } as any);
    setSubmitting(false);
    if (error) {
      toast.error(c.errorMessage);
      return;
    }

    // Send email notification
    try {
      await supabase.functions.invoke("send-booking-notification", {
        body: {
          service_name: "Custom Retreat Inquiry",
          guest_name: form.contact_name.trim() || form.email.trim(),
          guest_email: form.email.trim(),
          guest_phone: form.phone.trim() || "Not provided",
          booking_date: [form.arrival_date, form.departure_date].filter(Boolean).join(" → ") || "Flexible",
          booking_time: `Participants: ${form.num_participants.trim() || "Not specified"}`,
          is_retreat: true,
          notes: [
            `Intention: ${form.retreat_intention.join(", ") || "Not specified"}`,
            `Services & activities: ${form.selected_services.join(", ") || "Not specified"}`,
            `Arrival: ${form.arrival_date || "—"}  ·  Departure: ${form.departure_date || "—"}`,
            `Participants: ${form.num_participants.trim() || "Not specified"}`,
            form.special_requests ? `Special requests: ${form.special_requests.trim()}` : null,
          ].filter(Boolean).join("\n"),
        },
      });
    } catch {
      // notification failure is non-critical
    }

    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-28 pb-20 px-4 max-w-2xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="space-y-6"
          >
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Check className="h-10 w-10 text-primary" />
            </div>
            <h1 className="font-heading text-3xl font-semibold text-foreground">
              {c.thankYouTitle}
            </h1>
            <p className="font-body text-lg text-muted-foreground leading-relaxed max-w-md mx-auto">
              {c.thankYouText}
            </p>
            <Button variant="default" size="lg" asChild className="mt-4">
              <a href="/retreats">{c.backToRetreatsLabel}</a>
            </Button>
          </motion.div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SEO title={seo.title} description={seo.description} canonical={seo.canonical} />
      <Navbar />

      <div className="pt-28 pb-20 px-4 sm:px-6 lg:px-8 max-w-2xl mx-auto overflow-x-clip">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-3">
            {c.eyebrow}
          </p>
          <h1 className="font-heading text-3xl sm:text-4xl font-semibold text-foreground">
            {c.title}
          </h1>
          <p className="font-body text-base text-muted-foreground mt-3 max-w-md mx-auto">
            {c.subtitle}
          </p>
        </motion.div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-12">
          {stepNames.map((s, i) => {
            const Icon = stepIcons[i];
            return (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300",
                    i < step
                      ? "bg-primary text-primary-foreground"
                      : i === step
                      ? "bg-primary/10 text-primary ring-2 ring-primary"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {i < step ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                {i < stepNames.length - 1 && (
                  <div
                    className={cn(
                      "w-8 sm:w-12 h-px transition-colors duration-300",
                      i < step ? "bg-primary" : "bg-border"
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Steps */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.3 }}
            className="space-y-8"
          >
            {step === 0 && <StepBasicInfo form={form} update={update} c={c} />}
            {step === 1 && <StepDates form={form} update={update} c={c} />}
            {step === 2 && <StepIntention form={form} toggleArray={toggleArray} c={c} />}
            {step === 3 && <StepServices form={form} toggleArray={toggleArray} update={update} c={c} />}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-12 pt-6 border-t border-border">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 0}
            className="gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            {c.backLabel}
          </Button>
          {step < stepNames.length - 1 ? (
            <Button
              variant="default"
              size="lg"
              onClick={() => setStep((s) => s + 1)}
              disabled={!canProceed()}
            >
              {c.continueLabel}
            </Button>
          ) : (
            <Button
              variant="default"
              size="lg"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? c.submittingLabel : c.submitLabel}
            </Button>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
}

/* ── Step Components ── */

function StepBasicInfo({ form, update, c }: { form: any; update: (k: string, v: any) => void; c: any }) {
  const s = c.step0;
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-xl font-medium text-foreground mb-1">{s.title}</h2>
        <p className="font-body text-sm text-muted-foreground">{s.subtitle}</p>
      </div>
      <div className="space-y-4">
        <div>
          <label className="font-body text-sm font-medium text-foreground mb-1.5 block">{s.contactNameLabel}</label>
          <Input
            value={form.contact_name}
            onChange={(e) => update("contact_name", e.target.value)}
            placeholder={s.contactNamePlaceholder}
            className="h-12 rounded-xl"
          />
        </div>
        <div>
          <label className="font-body text-sm font-medium text-foreground mb-1.5 block">{s.emailLabel}</label>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            placeholder={s.emailPlaceholder}
            className="h-12 rounded-xl"
          />
        </div>
        <div>
          <label className="font-body text-sm font-medium text-foreground mb-1.5 block">{s.phoneLabel}</label>
          <Input
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            placeholder={s.phonePlaceholder}
            className="h-12 rounded-xl"
          />
        </div>
      </div>
    </div>
  );
}

function StepDates({ form, update, c }: { form: any; update: (k: string, v: any) => void; c: any }) {
  const s = c.step1;
  const today = new Date().toISOString().split("T")[0];
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-xl font-medium text-foreground mb-1">{s.title}</h2>
        <p className="font-body text-sm text-muted-foreground">{s.subtitle}</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="font-body text-sm font-medium text-foreground mb-1.5 block">{s.arrivalLabel}</label>
          <Input
            type="date"
            value={form.arrival_date}
            min={today}
            onChange={(e) => update("arrival_date", e.target.value)}
            className="h-12 rounded-xl"
          />
        </div>
        <div>
          <label className="font-body text-sm font-medium text-foreground mb-1.5 block">{s.departureLabel}</label>
          <Input
            type="date"
            value={form.departure_date}
            min={form.arrival_date || today}
            onChange={(e) => update("departure_date", e.target.value)}
            className="h-12 rounded-xl"
          />
        </div>
      </div>

      <div>
        <label className="font-body text-sm font-medium text-foreground mb-1.5 block">{s.participantsLabel}</label>
        <Input
          type="number"
          min="1"
          inputMode="numeric"
          value={form.num_participants}
          onChange={(e) => update("num_participants", e.target.value)}
          placeholder={s.participantsPlaceholder}
          className="h-12 rounded-xl max-w-[160px]"
        />
      </div>
    </div>
  );
}

function StepIntention({
  form,
  toggleArray,
  c,
}: {
  form: any;
  toggleArray: (key: "retreat_intention" | "selected_services", val: string) => void;
  c: any;
}) {
  const s = c.step2;
  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-heading text-xl font-medium text-foreground mb-1">{s.title}</h2>
        <p className="font-body text-sm text-muted-foreground">{s.subtitle}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {(c.intentionOptions as Option[]).map((opt) => (
          <button
            key={opt.value}
            onClick={() => toggleArray("retreat_intention", opt.value)}
            className={cn(
              "px-4 py-3 rounded-xl text-sm font-body font-medium border transition-all duration-200",
              form.retreat_intention.includes(opt.value)
                ? "bg-primary/10 border-primary text-primary"
                : "bg-card border-border text-muted-foreground hover:border-primary/50"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function StepServices({
  form,
  toggleArray,
  update,
  c,
}: {
  form: any;
  toggleArray: (key: "retreat_intention" | "selected_services", val: string) => void;
  update: (k: string, v: any) => void;
  c: any;
}) {
  const s = c.step3;
  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-heading text-xl font-medium text-foreground mb-1">{s.title}</h2>
        <p className="font-body text-sm text-muted-foreground">{s.subtitle}</p>
      </div>

      {(c.serviceCategories as ServiceCategory[]).map((cat) => (
        <div key={cat.title}>
          <h3 className="font-heading text-sm font-semibold uppercase tracking-wider text-foreground">{cat.title}</h3>
          {cat.subtitle && (
            <p className="font-body text-xs text-muted-foreground mt-0.5 mb-3">{cat.subtitle}</p>
          )}
          <div className={cn("grid grid-cols-2 sm:grid-cols-3 gap-2.5", !cat.subtitle && "mt-3")}>
            {cat.options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => toggleArray("selected_services", opt.value)}
                className={cn(
                  "px-3 py-2.5 rounded-xl text-xs sm:text-sm font-body font-medium border transition-all duration-200 text-left",
                  form.selected_services.includes(opt.value)
                    ? "bg-primary/10 border-primary text-primary"
                    : "bg-card border-border text-muted-foreground hover:border-primary/50"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div>
        <label className="font-body text-sm font-medium text-foreground mb-1.5 block">{s.requestsLabel}</label>
        <Textarea
          value={form.special_requests}
          onChange={(e) => update("special_requests", e.target.value)}
          placeholder={s.requestsPlaceholder}
          className="min-h-[110px] rounded-xl resize-none"
        />
      </div>
    </div>
  );
}
