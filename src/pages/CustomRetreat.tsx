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

const steps = ["About You", "Your Vision", "Dates & Duration", "Personalize"];

const visionOptions = [
  "Relaxation", "Healing", "Detox", "Adventure",
  "Mindfulness", "Fitness", "Couples Wellness", "Spiritual Growth",
];

const activityOptions = [
  "Yoga", "Massage Therapy", "Meditation", "Surf Lessons",
  "Waterfall Tours", "Organic Facials", "Breathwork", "Sound Healing",
  "Jungle Hikes", "Thai Bodywork", "Body Wraps", "Gyrokinesis®",
];

const groupOptions = [
  { value: "solo", label: "Solo" },
  { value: "couple", label: "Couple" },
  { value: "group", label: "Group (3+)" },
];

const budgetOptions = [
  "Under $1,000", "$1,000 – $2,500", "$2,500 – $5,000", "$5,000+", "Flexible",
];

const stepIcons = [Heart, Sparkles, CalendarDays, Pen];

export default function CustomRetreat() {
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
      toast.error("Something went wrong. Please try again.");
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
              Thank You
            </h1>
            <p className="font-body text-lg text-muted-foreground leading-relaxed max-w-md mx-auto">
              We'll personally design your retreat and contact you shortly.
            </p>
            <Button variant="default" size="lg" asChild className="mt-4">
              <a href="/retreats">Back to Retreats</a>
            </Button>
          </motion.div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Custom Retreat | Holis Wellness"
        description="Design your personalized wellness retreat in Manuel Antonio, Costa Rica."
      />
      <Navbar />

      <div className="pt-28 pb-20 px-4 sm:px-6 lg:px-8 max-w-2xl mx-auto overflow-x-clip">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-3">
            Concierge Experience
          </p>
          <h1 className="font-heading text-3xl sm:text-4xl font-semibold text-foreground">
            Design Your Retreat
          </h1>
          <p className="font-body text-base text-muted-foreground mt-3 max-w-md mx-auto">
            Tell us what you envision — we'll craft a bespoke wellness journey just for you.
          </p>
        </motion.div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-12">
          {steps.map((s, i) => {
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
                {i < steps.length - 1 && (
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
            {step === 0 && <StepBasicInfo form={form} update={update} />}
            {step === 1 && <StepVision form={form} toggleArray={toggleArray} update={update} />}
            {step === 2 && <StepDates form={form} update={update} />}
            {step === 3 && <StepPersonalize form={form} update={update} />}
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
            Back
          </Button>
          {step < steps.length - 1 ? (
            <Button
              variant="default"
              size="lg"
              onClick={() => setStep((s) => s + 1)}
              disabled={!canProceed()}
            >
              Continue
            </Button>
          ) : (
            <Button
              variant="default"
              size="lg"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? "Submitting…" : "Submit Your Vision"}
            </Button>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
}

/* ── Step Components ── */

function StepBasicInfo({ form, update }: { form: any; update: (k: string, v: any) => void }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-xl font-medium text-foreground mb-1">Tell Us About Yourself</h2>
        <p className="font-body text-sm text-muted-foreground">So we know who we're creating this for.</p>
      </div>
      <div className="space-y-4">
        <div>
          <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Full Name *</label>
          <Input
            value={form.full_name}
            onChange={(e) => update("full_name", e.target.value)}
            placeholder="Your full name"
            className="h-12 rounded-xl"
          />
        </div>
        <div>
          <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Email *</label>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            placeholder="your@email.com"
            className="h-12 rounded-xl"
          />
        </div>
        <div>
          <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Phone / WhatsApp</label>
          <Input
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            placeholder="+1 (555) 000-0000"
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
}: {
  form: any;
  toggleArray: (key: "retreat_vision" | "preferred_activities", val: string) => void;
  update: (k: string, v: any) => void;
}) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-heading text-xl font-medium text-foreground mb-1">Your Retreat Vision</h2>
        <p className="font-body text-sm text-muted-foreground">What are you looking for? Select all that resonate.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {visionOptions.map((opt) => (
          <button
            key={opt}
            onClick={() => toggleArray("retreat_vision", opt)}
            className={cn(
              "px-4 py-3 rounded-xl text-sm font-body font-medium border transition-all duration-200",
              form.retreat_vision.includes(opt)
                ? "bg-primary/10 border-primary text-primary"
                : "bg-card border-border text-muted-foreground hover:border-primary/50"
            )}
          >
            {opt}
          </button>
        ))}
      </div>

      <div>
        <label className="font-body text-sm font-medium text-foreground mb-2 block">Preferred Activities</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {activityOptions.map((opt) => (
            <button
              key={opt}
              onClick={() => toggleArray("preferred_activities", opt)}
              className={cn(
                "px-4 py-3 rounded-xl text-sm font-body font-medium border transition-all duration-200 text-left",
                form.preferred_activities.includes(opt)
                  ? "bg-primary/10 border-primary text-primary"
                  : "bg-card border-border text-muted-foreground hover:border-primary/50"
              )}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="font-body text-sm font-medium text-foreground mb-2 block">Who's Joining?</label>
        <div className="flex gap-3">
          {groupOptions.map((opt) => (
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

function StepDates({ form, update }: { form: any; update: (k: string, v: any) => void }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-xl font-medium text-foreground mb-1">Dates & Duration</h2>
        <p className="font-body text-sm text-muted-foreground">Don't worry if you're not sure yet — we'll work it out together.</p>
      </div>

      <div>
        <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Preferred Dates</label>
        <Input
          value={form.preferred_dates}
          onChange={(e) => update("preferred_dates", e.target.value)}
          placeholder="e.g., March 2025, or specific dates"
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
          My dates are flexible
        </label>
      </div>

      <div>
        <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Length of Stay</label>
        <Input
          value={form.length_of_stay}
          onChange={(e) => update("length_of_stay", e.target.value)}
          placeholder="e.g., 3 days, 1 week, flexible"
          className="h-12 rounded-xl"
        />
      </div>
    </div>
  );
}

function StepPersonalize({ form, update }: { form: any; update: (k: string, v: any) => void }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-xl font-medium text-foreground mb-1">Final Touches</h2>
        <p className="font-body text-sm text-muted-foreground">Anything else that would help us design your perfect experience.</p>
      </div>

      <div>
        <label className="font-body text-sm font-medium text-foreground mb-2 block">Budget Range (optional)</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {budgetOptions.map((opt) => (
            <button
              key={opt}
              onClick={() => update("budget_range", form.budget_range === opt ? "" : opt)}
              className={cn(
                "px-4 py-3 rounded-xl text-sm font-body font-medium border transition-all duration-200",
                form.budget_range === opt
                  ? "bg-primary/10 border-primary text-primary"
                  : "bg-card border-border text-muted-foreground hover:border-primary/50"
              )}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Special Requests or Notes</label>
        <Textarea
          value={form.special_requests}
          onChange={(e) => update("special_requests", e.target.value)}
          placeholder="Dietary preferences, accessibility needs, anything at all…"
          className="min-h-[120px] rounded-xl resize-none"
        />
      </div>
    </div>
  );
}
