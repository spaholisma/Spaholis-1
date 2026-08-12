import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronLeft, Check, Sparkles, Heart, CalendarDays, Pen } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useSiteContent, useSiteSeo } from "@/hooks/useSiteContent";
import { content as defaults, seo as seoDefaults } from "@/data/content";

const stepIcons = [Heart, Sparkles, CalendarDays, Pen];
type Option = { value: string; label: string };

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
    full_name: "",
    email: "",
    phone: "",
    retreat_vision: [] as string[],
    preferred_activities: [] as string[],
    group_type: "solo",
    preferred_dates: "",
    flexible_dates: true,
    length_of_stay: "",
    budget_range: "",
    special_requests: "",
  });

  const update = (key: string, value: any) => setForm((f) => ({ ...f, [key]: value }));

  const toggleArray = (key: "retreat_vision" | "preferred_activities", val: string) => {
    setForm((f) => ({
      ...f,
      [key]: f[key].includes(val) ? f[key].filter((v) => v !== val) : [...f[key], val],
    }));
  };

  const canProceed = () => {
    if (step === 0) return form.full_name.trim() && form.email.trim();
    if (step === 1) return form.retreat_vision.length > 0;
    return true;
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    const { error } = await supabase.from("custom_retreat_inquiries").insert({
      full_name: form.full_name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || null,
      retreat_vision: form.retreat_vision,
      preferred_activities: form.preferred_activities,
      group_type: form.group_type,
      preferred_dates: form.preferred_dates.trim() || null,
      flexible_dates: form.flexible_dates,
      length_of_stay: form.length_of_stay.trim() || null,
      budget_range: form.budget_range || null,
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
          guest_name: form.full_name.trim(),
          guest_email: form.email.trim(),
          guest_phone: form.phone.trim() || "Not provided",
          booking_date: form.preferred_dates.trim() || "Flexible",
          booking_time: `Duration: ${form.length_of_stay.trim() || "Not specified"}`,
          is_retreat: true,
          notes: [
            `Vision: ${form.retreat_vision.join(", ") || "Not specified"}`,
            `Activities: ${form.preferred_activities.join(", ") || "Not specified"}`,
            `Group: ${form.group_type}`,
            `Flexible dates: ${form.flexible_dates ? "Yes" : "No"}`,
            form.budget_range ? `Budget: ${form.budget_range}` : null,
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
            {step === 1 && <StepVision form={form} toggleArray={toggleArray} update={update} c={c} />}
            {step === 2 && <StepDates form={form} update={update} c={c} />}
            {step === 3 && <StepPersonalize form={form} update={update} c={c} />}
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
          <label className="font-body text-sm font-medium text-foreground mb-1.5 block">{s.fullNameLabel}</label>
          <Input
            value={form.full_name}
            onChange={(e) => update("full_name", e.target.value)}
            placeholder={s.fullNamePlaceholder}
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

function StepVision({
  form,
  toggleArray,
  update,
  c,
}: {
  form: any;
  toggleArray: (key: "retreat_vision" | "preferred_activities", val: string) => void;
  update: (k: string, v: any) => void;
  c: any;
}) {
  const s = c.step1;
  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-heading text-xl font-medium text-foreground mb-1">{s.title}</h2>
        <p className="font-body text-sm text-muted-foreground">{s.subtitle}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(c.visionOptions as Option[]).map((opt) => (
          <button
            key={opt.value}
            onClick={() => toggleArray("retreat_vision", opt.value)}
            className={cn(
              "px-4 py-3 rounded-xl text-sm font-body font-medium border transition-all duration-200",
              form.retreat_vision.includes(opt.value)
                ? "bg-primary/10 border-primary text-primary"
                : "bg-card border-border text-muted-foreground hover:border-primary/50"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div>
        <label className="font-body text-sm font-medium text-foreground mb-2 block">{s.activitiesLabel}</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {(c.activityOptions as Option[]).map((opt) => (
            <button
              key={opt.value}
              onClick={() => toggleArray("preferred_activities", opt.value)}
              className={cn(
                "px-4 py-3 rounded-xl text-sm font-body font-medium border transition-all duration-200 text-left",
                form.preferred_activities.includes(opt.value)
                  ? "bg-primary/10 border-primary text-primary"
                  : "bg-card border-border text-muted-foreground hover:border-primary/50"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="font-body text-sm font-medium text-foreground mb-2 block">{s.whoLabel}</label>
        <div className="flex gap-3">
          {(c.groupOptions as Option[]).map((opt) => (
            <button
              key={opt.value}
              onClick={() => update("group_type", opt.value)}
              className={cn(
                "flex-1 px-4 py-3 rounded-xl text-sm font-body font-medium border transition-all duration-200",
                form.group_type === opt.value
                  ? "bg-primary/10 border-primary text-primary"
                  : "bg-card border-border text-muted-foreground hover:border-primary/50"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function StepDates({ form, update, c }: { form: any; update: (k: string, v: any) => void; c: any }) {
  const s = c.step2;
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-xl font-medium text-foreground mb-1">{s.title}</h2>
        <p className="font-body text-sm text-muted-foreground">{s.subtitle}</p>
      </div>

      <div>
        <label className="font-body text-sm font-medium text-foreground mb-1.5 block">{s.datesLabel}</label>
        <Input
          value={form.preferred_dates}
          onChange={(e) => update("preferred_dates", e.target.value)}
          placeholder={s.datesPlaceholder}
          className="h-12 rounded-xl"
        />
      </div>

      <div className="flex items-center gap-3">
        <Checkbox
          id="flexible"
          checked={form.flexible_dates}
          onCheckedChange={(v) => update("flexible_dates", !!v)}
        />
        <label htmlFor="flexible" className="font-body text-sm text-foreground cursor-pointer">
          {s.flexibleLabel}
        </label>
      </div>

      <div>
        <label className="font-body text-sm font-medium text-foreground mb-1.5 block">{s.lengthLabel}</label>
        <Input
          value={form.length_of_stay}
          onChange={(e) => update("length_of_stay", e.target.value)}
          placeholder={s.lengthPlaceholder}
          className="h-12 rounded-xl"
        />
      </div>
    </div>
  );
}

function StepPersonalize({ form, update, c }: { form: any; update: (k: string, v: any) => void; c: any }) {
  const s = c.step3;
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-xl font-medium text-foreground mb-1">{s.title}</h2>
        <p className="font-body text-sm text-muted-foreground">{s.subtitle}</p>
      </div>

      <div>
        <label className="font-body text-sm font-medium text-foreground mb-2 block">{s.budgetLabel}</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {(c.budgetOptions as Option[]).map((opt) => (
            <button
              key={opt.value}
              onClick={() => update("budget_range", form.budget_range === opt.value ? "" : opt.value)}
              className={cn(
                "px-4 py-3 rounded-xl text-sm font-body font-medium border transition-all duration-200",
                form.budget_range === opt.value
                  ? "bg-primary/10 border-primary text-primary"
                  : "bg-card border-border text-muted-foreground hover:border-primary/50"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="font-body text-sm font-medium text-foreground mb-1.5 block">{s.requestsLabel}</label>
        <Textarea
          value={form.special_requests}
          onChange={(e) => update("special_requests", e.target.value)}
          placeholder={s.requestsPlaceholder}
          className="min-h-[120px] rounded-xl resize-none"
        />
      </div>
    </div>
  );
}
