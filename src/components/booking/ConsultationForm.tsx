import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Navbar } from "@/components/Navbar";
import { FlowBackButton } from "@/components/FlowBackButton";
import { useLeaveFlow } from "@/hooks/useLeaveFlow";
import { Footer } from "@/components/Footer";
import { Check, Phone, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { PhoneField } from "@/components/booking/PhoneField";
import { PrivateClassPicker } from "@/components/booking/PrivateClassPicker";
import { useSiteContent } from "@/hooks/useSiteContent";
import { content as contentDefaults } from "@/data/content";
import { formatCRCWithUsd, USD_RATE } from "@/lib/currency";
import {
  clampPeople, parsePrivateKind, privateClassIntake,
} from "@/lib/privateClassRequest";
import { offeringPrice, type PrivateChoice } from "@/lib/privateOfferings";
import { Users } from "lucide-react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const ConsultationForm = () => {
  const { t } = useTranslation();
  // A `topic` param means this is a specific request (e.g. a private class), not
  // the generic free holistic consultation — the form adapts its copy + notes.
  const [searchParams] = useSearchParams();
  const topic = searchParams.get("topic")?.trim() || "";
  const isRequest = topic.length > 0;
  // kind=info → an information request (e.g. a course), not an appointment.
  const isInfo = (searchParams.get("kind")?.trim() || "") === "info";
  // A one-on-one, couple's or group private class: the guest can pick a class
  // and teacher, and the request is emailed to that teacher too.
  const privateKind = isRequest ? parsePrivateKind(searchParams.get("private")) : null;
  const people = privateKind ? clampPeople(searchParams.get("people"), privateKind) : 0;
  const [classChoice, setClassChoice] = useState<PrivateChoice | null>(null);
  // From a teacher's portfolio: her class and her name come along.
  const preselectOffering = privateKind ? searchParams.get("offering")?.trim() || "" : "";
  const preselectClass = privateKind ? searchParams.get("class")?.trim() || "" : "";
  const preselect = preselectOffering || preselectClass
    ? {
        offeringId: preselectOffering || null,
        classId: preselectClass || null,
        teacherName: searchParams.get("teacher")?.trim() || null,
      }
    : null;
  const { data: siteContent } = useSiteContent();
  const ps: any = (siteContent as any)?.privateSessions || contentDefaults.privateSessions;
  const kindTitle: string = privateKind ? (ps.classes?.[privateKind]?.title || topic) : "";
  // Each teacher sets her own prices: there is a price once her class is chosen.
  const privatePrice = privateKind && classChoice?.offering ? offeringPrice(classChoice.offering, privateKind, people) : null;
  // Back: to the page the guest came from; else a private class request to
  // Private Sessions, anything else to the treatments.
  const leaveFlow = useLeaveFlow(/private class/i.test(topic) ? "/private-sessions" : "/treatments-therapies");
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [format, setFormat] = useState<"call" | "in-person">("call");
  // Preferred date/time the client would like for the appointment (optional).
  const [pref, setPref] = useState({ date: "", time: "" });
  const [submitting, setSubmitting] = useState(false);
  // ── Two quiet traps for the bots that have been filling this form ──
  // A field no person can see: a script fills every input it finds, so
  // anything in here means the sender was not human.
  const [website, setWebsite] = useState("");
  // And the clock: nobody types a name, an email and a phone in two seconds.
  const openedAt = useRef(Date.now());
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

    // Caught by the hidden field: pretend it worked and write nothing, so the
    // script has no signal to adapt to.
    if (website.trim()) { setSubmitted(true); return; }
    if (Date.now() - openedAt.current < 2000) {
      toast.error(t("consultation.errorTooFast", {
        defaultValue: "That was quick — please take a moment and send it again.",
      }));
      return;
    }

    setSubmitting(true);
    try {
      if (privateKind) {
        // The id is made here because a guest can't read the row back; the
        // email function loads the request by this id.
        const bookingId = crypto.randomUUID();
        const classPart = classChoice
          ? ` — Class: ${classChoice.title}${classChoice.teacherName ? ` with ${classChoice.teacherName}` : ""}`
          : " — No specific class";
        const { error } = await supabase.from("bookings").insert({
          id: bookingId,
          guest_name: form.name.trim(),
          guest_email: form.email.trim(),
          guest_phone: form.phone.trim() || null,
          booking_date: new Date().toISOString().split("T")[0],
          booking_time: "00:00",
          status: "pending",
          notes: `${topic}${classPart}${prettyPref ? ` — Preferred: ${prettyPref}` : ""}`,
          intake_form: privateClassIntake({ kind: privateKind, kindTitle, people, choice: classChoice, preferred: prettyPref }) as any,
        });
        if (error) throw error;
        try {
          await supabase.functions.invoke("send-private-class-request", { body: { bookingId } });
        } catch {
          // The request is saved; an email problem must not lose it.
        }
        setSubmitted(true);
        return;
      }

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
              {privateKind
                ? classChoice?.teacherName
                  ? t("consultation.privateThankYouTeacher", { name: classChoice.teacherName, defaultValue: "Your request was sent to {{name}} and the Holis team. You'll hear back by email to arrange your private class — check your inbox for a copy." })
                  : t("consultation.privateThankYou", { defaultValue: "Your request was sent to the Holis team. We'll reply by email to arrange your private class — check your inbox for a copy." })
                : isInfo
                ? t("consultation.infoThankYou", { defaultValue: "Thank you! Our team will be in touch shortly with the course information — dates, pricing and how to register." })
                : isRequest
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
        <div className={privateKind ? "max-w-5xl mx-auto" : "max-w-md mx-auto"}>
          <div className="mb-2">
            <FlowBackButton onClick={leaveFlow} disabled={submitting} />
          </div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="spa-heading-lg text-foreground mb-2 text-center">
              {isInfo
                ? t("consultation.infoTitle", { defaultValue: "Request Course Information" })
                : isRequest ? t("consultation.requestTitle", { defaultValue: "Request an Appointment" }) : t("consultation.title")}
            </h1>
            {isRequest && !privateKind ? (
              <p className="font-body text-sm text-foreground text-center mb-2 max-w-sm mx-auto">
                <span className="font-medium">{topic}</span>
              </p>
            ) : null}
            <p className={`font-body text-sm text-muted-foreground text-center leading-relaxed max-w-sm mx-auto ${privateKind ? "mb-8" : "mb-10"}`}>
              {isInfo
                ? t("consultation.infoSubtitle", { defaultValue: "Leave your details and we'll send you the course information — dates, pricing, requirements and how to register." })
                : isRequest ? t("consultation.requestSubtitle", { defaultValue: "Leave your details and we'll contact you to arrange your appointment." }) : t("consultation.subtitle")}
            </p>

            {/* Private class: the class and teacher on the left, the details on
                the right, so the whole request fits on one screen. */}
            <div className={privateKind ? "grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start lg:gap-10" : ""}>
            {privateKind && (
              <div className="space-y-4 lg:sticky lg:top-24">
                <div className="flex items-center justify-between gap-4 rounded-3xl bg-foreground px-5 py-4 text-background shadow-md">
                  <div className="min-w-0">
                    <p className="font-body text-[11px] font-semibold uppercase tracking-[0.2em] text-background/60">
                      {t("consultation.privateLabel", { defaultValue: "Private class" })}
                    </p>
                    <p className="font-heading text-lg leading-tight truncate">{kindTitle}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 font-body text-xs text-background/70">
                      <Users className="h-3.5 w-3.5" />
                      {people === 1
                        ? t("consultation.privateOnePerson", { defaultValue: "1 person" })
                        : t("consultation.privatePeople", { count: people, defaultValue: "{{count}} people" })}
                    </p>
                  </div>
                  {privatePrice != null ? (
                    <p className="shrink-0 font-heading text-xl font-semibold">{formatCRCWithUsd(privatePrice * USD_RATE)}</p>
                  ) : (
                    <p className="shrink-0 max-w-[9rem] text-right font-body text-xs text-background/70">
                      {classChoice?.teacherName
                        ? t("consultation.privatePriceConfirmedBy", { name: classChoice.teacherName.split(" ")[0], defaultValue: "Price confirmed by {{name}}" })
                        : t("consultation.privatePriceDepends", { defaultValue: "Price depends on the class and teacher" })}
                    </p>
                  )}
                </div>
                <PrivateClassPicker kind={privateKind} people={people} value={classChoice} onChange={setClassChoice} preselect={preselect} />
              </div>
            )}

            <div className={privateKind ? "rounded-3xl border border-border bg-card p-5 sm:p-7 shadow-sm" : ""}>
            <form onSubmit={handleSubmit} className={privateKind ? "space-y-5" : "space-y-6"}>
              {/* Left in the page on purpose and put out of sight rather than
                  display:none, which the better scripts know to skip. Never
                  reached by keyboard or screen reader. */}
              <div aria-hidden="true" className="absolute left-[-9999px] top-auto h-0 w-0 overflow-hidden">
                <label htmlFor="website">Website</label>
                <input
                  id="website"
                  name="website"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </div>

              <div className={privateKind ? "grid gap-5 sm:grid-cols-2" : "space-y-6"}>
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
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone" className="font-body text-sm">
                  {t("consultation.phone")} <span className="text-muted-foreground">{t("consultation.phoneRecommended")}</span>
                </Label>
                <PhoneField
                  id="phone"
                  placeholder={t("consultation.phonePlaceholder")}
                  value={form.phone}
                  onChange={(v) => setForm({ ...form, phone: v })}
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

              {isRequest && !isInfo && (
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
                {submitting ? t("consultation.submitting") : (isInfo ? t("consultation.infoSubmit", { defaultValue: "Request Information" }) : t("consultation.submit"))}
              </Button>

              <p className="font-body text-xs text-center text-muted-foreground/60">
                {t("consultation.confirmSoon")}
              </p>
            </form>
            </div>
            </div>
          </motion.div>
        </div>
      </div>
      <Footer />
    </div>
  );
};
