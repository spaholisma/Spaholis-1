import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Check, Phone, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const ConsultationForm = () => {
  const { t } = useTranslation();
  // A `topic` param means this is a specific request (e.g. a private class), not
  // the generic free holistic consultation — the form adapts its copy + notes.
  const [searchParams] = useSearchParams();
  const topic = searchParams.get("topic")?.trim() || "";
  const isRequest = topic.length > 0;
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [format, setFormat] = useState<"call" | "in-person">("call");
  // Preferred date/time the client would like for the appointment (optional).
  const [pref, setPref] = useState({ date: "", time: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Human-friendly preferred date/time for notes + the staff email.
  const prettyPref = (() => {
    if (!isRequest || (!pref.date && !pref.time)) return "";
    let out = "";
    if (pref.date) {
      const d = new Date(`${pref.date}T00:00:00`);
      out += Number.isNaN(d.getTime())
        ? pref.date
        : d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    }
    if (pref.time) out += `${out ? " · " : ""}${pref.time}`;
    return out;
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      toast.error(t("consultation.errorMissingFields"));
      return;
    }
    if (!EMAIL_RE.test(form.email.trim())) {
      toast.error(t("consultation.errorInvalidEmail"));
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from("bookings").insert({
        guest_name: form.name.trim(),
        guest_email: form.email.trim(),
        guest_phone: form.phone.trim() || null,
        booking_date: new Date().toISOString().split("T")[0],
        booking_time: "00:00",
        status: "pending",
        notes: isRequest
          ? `${topic}${prettyPref ? ` — Preferred: ${prettyPref}` : ""}`
          : `Free Holistic Consultation — Format: ${format}`,
      });
      if (error) throw error;

      // Send notification (admin email to info@ + backup) via the legacy path.
      try {
        await supabase.functions.invoke("send-booking-notification", {
          body: {
            request_kind: isRequest ? "appointment" : undefined,
            guest_name: form.name.trim(),
            guest_email: form.email.trim(),
            guest_phone: form.phone.trim(),
            service_name: isRequest ? topic : t("consultation.serviceName"),
            preferred_datetime: prettyPref || undefined,
            notes: isRequest
              ? undefined
              : `Formato preferido: ${format === "call" ? t("consultation.formatPhoneCall") : t("consultation.formatInPerson")}`,
            booking_date: new Date().toLocaleDateString(),
          },
        });
      } catch {
        // notification failure is non-critical
      }

      setSubmitted(true);
    } catch {
      toast.error(t("consultation.errorGeneric"));
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="spa-section flex items-center justify-center min-h-[60vh]">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center max-w-md mx-auto"
          >
            <div className="w-16 h-16 rounded-full bg-spa-sage/20 flex items-center justify-center mx-auto mb-6">
              <Check className="h-8 w-8 text-spa-sage" />
            </div>
            <h2 className="spa-heading-lg text-foreground mb-4">{t("consultation.thankYou")}</h2>
            <p className="font-body text-muted-foreground leading-relaxed">
              {isRequest
                ? t("consultation.appointmentThankYou", { defaultValue: "Holis Wellness Center will reach out to you shortly to confirm your appointment — or suggest another time based on our therapists' availability." })
                : t("consultation.thankYouMessage")}
            </p>
            <p className="font-body text-xs text-muted-foreground/60 mt-6">
              {t("consultation.confirmSoon")}
            </p>
          </motion.div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="spa-section">
        <div className="max-w-md mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="spa-heading-lg text-foreground mb-2 text-center">
              {isRequest ? t("consultation.requestTitle", { defaultValue: "Request an Appointment" }) : t("consultation.title")}
            </h1>
            {isRequest ? (
              <p className="font-body text-sm text-foreground text-center mb-2 max-w-sm mx-auto">
                <span className="font-medium">{topic}</span>
              </p>
            ) : null}
            <p className="font-body text-sm text-muted-foreground text-center mb-10 leading-relaxed max-w-sm mx-auto">
              {isRequest ? t("consultation.requestSubtitle", { defaultValue: "Leave your details and we'll contact you to arrange your appointment." }) : t("consultation.subtitle")}
            </p>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name" className="font-body text-sm">{t("consultation.name")} *</Label>
                <Input
                  id="name"
                  placeholder={t("consultation.namePlaceholder")}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  maxLength={100}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="font-body text-sm">{t("consultation.email")} *</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder={t("consultation.emailPlaceholder")}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                  maxLength={255}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone" className="font-body text-sm">
                  {t("consultation.phone")} <span className="text-muted-foreground">{t("consultation.phoneRecommended")}</span>
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder={t("consultation.phonePlaceholder")}
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  maxLength={30}
                />
              </div>

              {!isRequest && (
              <div className="space-y-3">
                <Label className="font-body text-sm">{t("consultation.preferredFormat")}</Label>
                <RadioGroup
                  value={format}
                  onValueChange={(v) => setFormat(v as "call" | "in-person")}
                  className="flex gap-4"
                >
                  <label
                    className={`flex-1 flex items-center gap-3 rounded-xl border p-4 cursor-pointer transition-colors ${
                      format === "call" ? "border-spa-sage bg-spa-sage/5" : "border-border"
                    }`}
                  >
                    <RadioGroupItem value="call" id="call" />
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span className="font-body text-sm">{t("consultation.formatCall")}</span>
                    </div>
                  </label>
                  <label
                    className={`flex-1 flex items-center gap-3 rounded-xl border p-4 cursor-pointer transition-colors ${
                      format === "in-person" ? "border-spa-sage bg-spa-sage/5" : "border-border"
                    }`}
                  >
                    <RadioGroupItem value="in-person" id="in-person" />
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span className="font-body text-sm">{t("consultation.formatInPerson")}</span>
                    </div>
                  </label>
                </RadioGroup>
              </div>
              )}

              {isRequest && (
                <div className="space-y-3">
                  <Label className="font-body text-sm">
                    {t("consultation.preferredDateTime", { defaultValue: "Preferred date & time" })}{" "}
                    <span className="text-muted-foreground">{t("consultation.optional", { defaultValue: "(optional)" })}</span>
                  </Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input
                      type="date"
                      aria-label={t("consultation.preferredDate", { defaultValue: "Preferred date" })}
                      value={pref.date}
                      min={new Date().toISOString().split("T")[0]}
                      onChange={(e) => setPref({ ...pref, date: e.target.value })}
                    />
                    <Input
                      type="time"
                      aria-label={t("consultation.preferredTime", { defaultValue: "Preferred time" })}
                      value={pref.time}
                      onChange={(e) => setPref({ ...pref, time: e.target.value })}
                    />
                  </div>
                  <p className="font-body text-xs text-muted-foreground">
                    {t("consultation.preferredNote", { defaultValue: "We'll confirm the final time based on therapist availability." })}
                  </p>
                </div>
              )}

              <Button
                type="submit"
                variant="spa"
                size="xl"
                className="w-full"
                disabled={submitting}
              >
                {submitting ? t("consultation.submitting") : t("consultation.submit")}
              </Button>

              <p className="font-body text-xs text-center text-muted-foreground/60">
                {t("consultation.confirmSoon")}
              </p>
            </form>
          </motion.div>
        </div>
      </div>
      <Footer />
    </div>
  );
};
