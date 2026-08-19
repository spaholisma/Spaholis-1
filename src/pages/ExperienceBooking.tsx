import { useState, useMemo, useEffect } from "react";
import { formatCRC, formatUsdRef } from "@/lib/currency";
import { useSearchParams, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneField, isValidPhoneNumber } from "@/components/booking/PhoneField";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { useServicesByType } from "@/hooks/useServices";
import { useBookExperience } from "@/hooks/useExperienceAvailability";
import { useExperienceDynamicSlots, ensureAvailabilityRecord, type DynamicExpSlot } from "@/hooks/useExperienceDynamicSlots";
import { supabase } from "@/integrations/supabase/client";
import { CalendarDays, Clock, Users, MapPin, CheckCircle2, ArrowLeft, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

const steps = ["Select Date", "Choose Time", "Your Details", "Confirmation"];

// Minimum party size per experience. Enforced client-side; the "Guests"
// stepper cannot go below this value and totals multiply accordingly.
const MIN_GUESTS_BY_SERVICE_ID: Record<string, number> = {
  "fcc474e2-d2bf-468d-8b59-3101cf26506b": 4, // Friends & Family Experience — min 4 people
  "d7146894-6875-4193-a1c0-d17f020b2279": 2, // Share the Moment — min 2 (couples)
};

// Optional label appended after guest count, e.g. "2 guests (couples)".
const GUEST_LABEL_SUFFIX: Record<string, string> = {
  "d7146894-6875-4193-a1c0-d17f020b2279": "couples booking",
};

export default function ExperienceBooking() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const experienceId = searchParams.get("experience");
  const { data: experiences, isLoading: loadingExp } = useServicesByType("experience");
  const experience = experiences.find((e) => e.id === experienceId);
  const bookMutation = useBookExperience();

  const minGuests = experienceId ? MIN_GUESTS_BY_SERVICE_ID[experienceId] ?? 1 : 1;
  const guestSuffix = experienceId ? GUEST_LABEL_SUFFIX[experienceId] : undefined;

  const [step, setStep] = useState(0);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedSlot, setSelectedSlot] = useState<DynamicExpSlot | null>(null);
  const [guests, setGuests] = useState(minGuests);
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Keep guests in sync when the experience (and its minimum) changes.
  useEffect(() => {
    setGuests((g) => Math.max(g, minGuests));
  }, [minGuests]);

  const defaultCapacity = experience?.capacity || experience?.max_participants || 10;

  const { data: dynamicSlots, isLoading: loadingSlots } = useExperienceDynamicSlots(
    experienceId ?? undefined,
    selectedDate,
    experience?.duration_minutes,
    defaultCapacity
  );

  // Disable past dates
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const canProceed = () => {
    if (step === 0) return !!selectedDate;
    if (step === 1) return !!selectedSlot && !selectedSlot.full && guests >= minGuests && guests <= selectedSlot.spotsLeft;
    if (step === 2) return !!form.name.trim() && !!form.email.trim() && (!form.phone || isValidPhoneNumber(form.phone));
    return false;
  };

  const handleSubmit = async () => {
    if (!selectedSlot || !experience || !selectedDate) return;
    setSubmitting(true);
    try {
      // Ensure availability record exists
      const startTime = format(selectedSlot.time, "HH:mm");
      const availId = await ensureAvailabilityRecord(
        experience.id,
        selectedDate,
        startTime,
        experience.duration_minutes,
        defaultCapacity
      );

      await bookMutation.mutateAsync({
        availability_id: availId,
        guest_name: form.name,
        guest_email: form.email,
        guest_phone: form.phone || undefined,
        number_of_guests: guests,
        total_price: experience.price * guests,
      });

      // Send notification email
      try {
        const endTime = new Date(selectedSlot.time.getTime() + experience.duration_minutes * 60000);
        await supabase.functions.invoke("send-booking-notification", {
          body: {
            service_name: experience.title,
            guest_name: form.name,
            guest_email: form.email,
            guest_phone: form.phone,
            booking_date: format(selectedDate, "yyyy-MM-dd"),
            booking_time: selectedSlot.label,
            is_retreat: false,
            notes: `Experience booking: ${guests} guest(s)\nDate: ${format(selectedDate, "MMMM d, yyyy")}\nTime: ${selectedSlot.label} – ${format(endTime, "h:mm a")}`,
          },
        });
      } catch {}

      setSubmitted(true);
    } catch (err: any) {
      toast.error(err.message || t("booking.experienceBookFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingExp) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-24 px-4 max-w-3xl mx-auto">
          <Skeleton className="h-64 rounded-2xl" />
        </div>
        <Footer />
      </div>
    );
  }

  if (!experience) {
    return (
      <div className="min-h-screen bg-background">
        <SEO title="Experience not found" description="" noindex />
        <Navbar />
        <div className="pt-24 px-4 max-w-3xl mx-auto text-center py-20">
          <h1 className="font-heading text-2xl mb-4">Experience not found</h1>
          <Button asChild><Link to="/retreats?tab=experiences">Browse Experiences</Link></Button>
        </div>
        <Footer />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-24 px-4 max-w-2xl mx-auto py-16">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-card rounded-2xl border border-border p-8 sm:p-12 text-center space-y-6"
          >
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-8 w-8 text-primary" />
            </div>
            <h1 className="font-heading text-2xl font-medium text-foreground">Booking Confirmed!</h1>
            <p className="spa-body max-w-md mx-auto">
              Thank you, {form.name}! Your spot for <strong>{experience.title}</strong> on{" "}
              <strong>{selectedDate && format(selectedDate, "MMMM d, yyyy")}</strong>{" "}
              at <strong>{selectedSlot?.label}</strong> has been reserved
              for {guests} guest{guests > 1 ? "s" : ""}.
            </p>
            <p className="text-sm font-body text-muted-foreground">
              A confirmation will be sent to {form.email}. We'll reach out with any additional details.
            </p>
            <div className="bg-muted/50 rounded-xl p-5 max-w-sm mx-auto text-left space-y-1.5">
              <div className="flex justify-between text-sm font-body">
                <span className="text-muted-foreground">Guests</span>
                <span className="font-medium text-foreground">{guests}</span>
              </div>
              <div className="flex justify-between text-sm font-body border-t border-border pt-2 mt-2">
                <span className="font-semibold text-foreground">Total</span>
                <span className="font-semibold text-foreground">{formatCRC(experience.price * guests)}</span>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
              <Button asChild variant="default"><Link to="/retreats?tab=experiences">Browse More</Link></Button>
              <Button asChild variant="outline"><Link to="/">Return Home</Link></Button>
            </div>
          </motion.div>
        </div>
        <Footer />
      </div>
    );
  }

  const durationLabel = experience.duration_minutes >= 60
    ? `${Math.floor(experience.duration_minutes / 60)}h${experience.duration_minutes % 60 ? ` ${experience.duration_minutes % 60}min` : ""}`
    : `${experience.duration_minutes} min`;

  return (
    <div className="min-h-screen bg-background">
      <SEO title={`Book ${experience.title} | Holis Wellness`} description={experience.description || ""} />
      <Navbar />

      <div className="pt-20 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto pb-16">
        {/* Back */}
        <Button variant="ghost" size="sm" asChild className="mb-6">
          <Link to="/retreats?tab=experiences" className="flex items-center gap-1.5 text-muted-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to Experiences
          </Link>
        </Button>

        {/* Experience header */}
        <div className="bg-card rounded-2xl border border-border overflow-hidden mb-8">
          {experience.image_url && (
            <div className="aspect-[21/9] overflow-hidden">
              <img src={experience.image_url} alt={experience.title} className="w-full h-full object-cover" />
            </div>
          )}
          <div className="p-6 space-y-3">
            <h1 className="font-heading text-2xl sm:text-3xl font-medium text-foreground">{experience.title}</h1>
            <div className="flex flex-wrap items-center gap-3 text-sm font-body text-muted-foreground">
              <span className="flex items-center gap-1"><CalendarDays className="h-4 w-4" />{durationLabel}</span>
              <span className="flex items-center gap-1"><MapPin className="h-4 w-4" />Manuel Antonio</span>
              <span className="flex items-center gap-1"><Users className="h-4 w-4" />{experience.capacity ? `Up to ${experience.capacity}` : "Groups welcome"}</span>
            </div>
            <p className="spa-body text-sm leading-relaxed">{experience.description}</p>
            <p className="font-heading text-xl font-semibold text-foreground">
              {formatCRC(experience.price)} <span className="text-xs font-body font-normal text-muted-foreground">per person · tax included</span>
            </p>
          </div>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-1 mb-8">
          {steps.map((label, i) => (
            <div key={label} className="flex-1 flex flex-col items-center gap-1.5">
              <div className={cn(
                "h-1.5 w-full rounded-full transition-colors",
                i <= step ? "bg-primary" : "bg-muted"
              )} />
              <span className={cn(
                "text-[10px] sm:text-xs font-body transition-colors",
                i <= step ? "text-foreground" : "text-muted-foreground"
              )}>{label}</span>
            </div>
          ))}
        </div>

        {/* Steps */}
        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div key="date" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <h2 className="font-heading text-xl font-medium">Select a Date</h2>
              <div className="flex justify-center">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => { setSelectedDate(d); setSelectedSlot(null); }}
                  disabled={(d) => d < today}
                  fromDate={today}
                  className="rounded-xl border border-border p-4"
                />
              </div>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div key="time" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <h2 className="font-heading text-xl font-medium">
                Choose a Time — {selectedDate && format(selectedDate, "MMMM d, yyyy")}
              </h2>

              {loadingSlots ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
                </div>
              ) : !dynamicSlots || dynamicSlots.length === 0 ? (
                <div className="bg-muted/50 rounded-xl p-8 text-center">
                  <p className="spa-body text-muted-foreground">No available time slots for this date.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {dynamicSlots.map((slot) => (
                    <button
                      key={slot.label}
                      disabled={slot.full}
                      onClick={() => { setSelectedSlot(slot); setGuests(Math.min(Math.max(guests, minGuests), slot.spotsLeft)); }}
                      className={cn(
                        "rounded-xl border p-4 text-left transition-all",
                        slot.full
                          ? "border-border bg-muted/50 opacity-40 cursor-not-allowed"
                          : selectedSlot?.label === slot.label
                          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                          : "border-border bg-card hover:border-primary/40 cursor-pointer"
                      )}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-heading text-sm font-medium text-foreground">{slot.label}</span>
                      </div>
                      <div className="text-xs font-body">
                        {slot.full ? (
                          <span className="text-destructive font-medium">Full</span>
                        ) : (
                          <span className="text-muted-foreground">{slot.spotsLeft} spot{slot.spotsLeft !== 1 ? "s" : ""}</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {selectedSlot && !selectedSlot.full && (
                <div className="bg-muted/50 rounded-xl p-5 space-y-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <label className="font-heading text-sm font-medium text-foreground">
                      Number of Guests
                      {guestSuffix && <span className="ml-1 font-body text-xs text-muted-foreground">({guestSuffix})</span>}
                    </label>
                    {minGuests > 1 && (
                      <span className="font-body text-xs text-muted-foreground">Minimum {minGuests}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setGuests(Math.max(minGuests, guests - 1))}
                      disabled={guests <= minGuests}
                      className="w-9 h-9 rounded-full border border-border flex items-center justify-center hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="font-heading text-xl font-semibold w-8 text-center">{guests}</span>
                    <button
                      onClick={() => setGuests(Math.min(selectedSlot.spotsLeft, guests + 1))}
                      disabled={guests >= selectedSlot.spotsLeft}
                      className="w-9 h-9 rounded-full border border-border flex items-center justify-center hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-sm font-body text-muted-foreground">
                      {formatCRC(experience.price)} × {guests} {guests === 1 ? "person" : "people"}
                    </p>
                    <p className="text-sm font-body">
                      Total: <strong className="text-foreground">{formatCRC(experience.price * guests)}</strong>
                    </p>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="details" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <h2 className="font-heading text-xl font-medium">Your Details</h2>
              <div className="space-y-4 max-w-md">
                <div>
                  <label className="font-body text-sm text-foreground mb-1 block">Full Name *</label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your full name" />
                </div>
                <div>
                  <label className="font-body text-sm text-foreground mb-1 block">Email *</label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="your@email.com" />
                </div>
                <div>
                  <label className="font-body text-sm text-foreground mb-1 block">Phone / WhatsApp</label>
                  <PhoneField
                    value={form.phone}
                    onChange={(v) => setForm({ ...form, phone: v })}
                    placeholder="8888 8888"
                    invalid={!!form.phone && !isValidPhoneNumber(form.phone)}
                  />
                  {!!form.phone && !isValidPhoneNumber(form.phone) && (
                    <p className="text-xs text-destructive mt-1 font-body">Enter a valid phone number for the selected country.</p>
                  )}
                </div>
              </div>

              {/* Summary */}
              <div className="bg-muted/50 rounded-xl p-5 space-y-2 max-w-md">
                <h3 className="font-heading text-sm font-medium text-foreground">Booking Summary</h3>
                <p className="text-sm font-body text-foreground">{experience.title}</p>
                <p className="text-sm font-body text-muted-foreground">
                  {selectedDate && format(selectedDate, "MMMM d, yyyy")} · {selectedSlot?.label}
                </p>
                <p className="text-sm font-body text-muted-foreground">
                  {guests} guest{guests > 1 ? "s" : ""}
                  {guestSuffix ? ` (${guestSuffix})` : ""} · {durationLabel}
                </p>
                <p className="text-sm font-body text-muted-foreground">
                  {formatCRC(experience.price)} per person × {guests}
                </p>
                <p className="font-heading text-lg font-semibold text-foreground pt-1">
                  Total: {formatCRC(experience.price * guests)}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Nav buttons */}
        <div className="flex items-center justify-between mt-10 pt-6 border-t border-border">
          <Button
            variant="outline"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
          >
            Back
          </Button>
          {step < 2 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canProceed()}>
              Continue
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={!canProceed() || submitting}>
              {submitting ? "Booking…" : "Confirm Booking"}
            </Button>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
}
