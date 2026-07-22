import { useState, useEffect } from "react";
import { formatCRC } from "@/lib/currency";
import { Link, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneField, isValidPhoneNumber } from "@/components/booking/PhoneField";
import { ConsultationForm } from "@/components/booking/ConsultationForm";
import { Calendar } from "@/components/ui/calendar";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SEO } from "@/components/SEO";
import { seo } from "@/data/content";

import { useServices, type ServiceRow } from "@/hooks/useServices";
import { useSpaPackages } from "@/hooks/useSpaPackages";
import { PackageDetailView } from "@/components/booking/PackageDetailView";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { toBookingErrorState } from "@/lib/bookingErrors";
import { Check, ChevronLeft, FileText, CalendarDays, CreditCard, MapPin, Loader2, ClipboardList, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "sonner";
import { validateCoupon } from "@/lib/coupons";
import { useTranslation } from "react-i18next";
import { useRoomAvailability, type TimeSlot } from "@/hooks/useRoomAvailability";
import { AddOnTreatments, type AddonItem } from "@/components/booking/AddOnTreatments";
import { useQueryClient } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
import { BodyZoneSelector } from "@/components/booking/BodyZoneSelector";
import { spaLocalParts } from "@/lib/businessHours";

function getIntakeFormTitleKey(category?: string): string {
  if (!category) return "booking.intakeTitles.default";
  const cat = category.toLowerCase();
  if (cat.includes("massage")) return "booking.intakeTitles.massage";
  if (cat.includes("facial")) return "booking.intakeTitles.facial";
  if (cat.includes("wrap")) return "booking.intakeTitles.wrap";
  if (cat.includes("holistic")) return "booking.intakeTitles.holistic";
  return "booking.intakeTitles.default";
}

function isClassType(service?: ServiceRow): boolean {
  return !!service && (service.type === "class" || service.type === "private");
}

import { isFacialService } from "@/lib/bacLinks";

// Returns step KEYS (resolved via t() at render time)
// NOTE: "booking.steps.cardAuth" has been intentionally removed from the
// public customer flow. The card authorization UI/state remains in this file
// (currently inert because cardAuthStepIdx === -1) and is also exposed at
// /admin/card-authorization-archive for future internal use. Do not delete it.
//
// "booking.steps.checkout" is the BAC CompraClick-ready payment-first step.
// It is included only for standard paid treatments (massage, facial, body,
// holistic). Retreats / programs / experiences / classes keep their existing
// inquiry / offering-redemption flows untouched.
function getStepKeys(service?: ServiceRow): string[] {
  const S = "booking.steps.service";
  const DT = "booking.steps.dateTime";
  const IF = "booking.steps.intakeForm";
  const YD = "booking.steps.yourDetails";
  const SUM = "booking.steps.summary";
  const CHK = "booking.steps.checkout";
  const CONF = "booking.steps.confirmation";

  // Default: standard paid treatment
  // Order: Service → Date/Time → Your Details → Intake → Summary → Checkout → Confirmation
  if (!service) return [S, DT, YD, IF, SUM, CHK, CONF];

  const isClass = isClassType(service);
  if (isClass) return [S, DT, YD, CONF];

  // Retreats stay a pure inquiry — they're quoted case by case.
  if (service.category === "Wellness Retreats") return [S, IF, YD, CONF];

  // Programs and experiences take the same deposit as treatments. Programs have
  // no date step (they're scheduled with the client afterwards), which the
  // Summary and createBooking already tolerate (start_time stays null).
  if (service.type === "program") return [S, IF, YD, SUM, CHK, CONF];

  if (service.type === "experience") return [S, DT, YD, SUM, CHK, CONF];

  // Facials skip the health intake but still get the Summary confirmation.
  if (isFacialService(service)) return [S, DT, YD, SUM, CHK, CONF];

  return [S, DT, YD, IF, SUM, CHK, CONF];
}

function translateCategory(t: (k: string, opts?: any) => string, cat: string): string {
  return t(`booking.categories.${cat}`, { defaultValue: cat });
}

// Cancellation policy the customer accepts when leaving a card on file.
const CANCELLATION_POLICY = "Cancellations or changes must be made 24 hours before the appointment, or a 50% charge will apply. The no-show fee is 100% of the total amount of your appointment or class. By filling out this form, there is no charge in advance for the treatment. This form will be used for further reservations during your visit if necessary.";
const CARD_AUTHORIZATION_LABEL = "I hereby authorize Holis Wellness Center to use the information provided in accordance with the cancellation policy above. My card information is stored securely and will only be charged in accordance with these policies.";

/** Luhn check so an obviously invalid number is caught before submitting. */
function luhnValid(num: string): boolean {
  if (!/^\d{13,19}$/.test(num)) return false;
  let sum = 0, dbl = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let d = num.charCodeAt(i) - 48;
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d; dbl = !dbl;
  }
  return sum % 10 === 0;
}

const BookingPage = () => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const preselected = searchParams.get("service");
  const packageParam = searchParams.get("package");
  const categoryParam = searchParams.get("category");
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: services } = useServices();
  const { data: spaPackages } = useSpaPackages();
  const selectedPackage = spaPackages?.find((p) => p.id === packageParam);
  // Resolve initial category from URL params
  const preselectedService = services?.find((s) => s.id === preselected);
  const initialCategory = categoryParam || preselectedService?.category || null;
  const [activeCategory, setActiveCategory] = useState<string | null>(initialCategory);
  // Lock filter when arriving via URL with a specific service or category
  const isFilterLocked = !!(preselected && preselected !== "consultation") || !!categoryParam;

  const [step, setStep] = useState(preselected && preselected !== "consultation" ? 1 : 0);
  const [selectedService, setSelectedService] = useState(preselected && preselected !== "consultation" ? preselected : "");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [locationVisit, setLocationVisit] = useState(false);
  // Phase 1 add-on treatments: extra treatments booked on the SAME day, for the
  // same person (back-to-back) or someone else. Each becomes its own booking.
  const [addons, setAddons] = useState<AddonItem[]>([]);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [formData, setFormData] = useState({ name: "", email: "", phone: "", notes: "", address: "" });
  const [submitting, setSubmitting] = useState(false);
  const [bookingComplete, setBookingComplete] = useState(false);
  const [confirmationCode, setConfirmationCode] = useState<string | null>(null);
  const [paymentInfo, setPaymentInfo] = useState<{ paymentId: string; authorizationCode?: string } | null>(null);

  // Intake form state
  const emptyIntake = {
    guest_name: "",
    allergies: "",
    medications: "",
    health_conditions: "",
    recent_surgeries: "",
    pregnancy: false,
    blood_pressure_issues: false,
    skin_conditions: "",
    emergency_contact_name: "",
    emergency_contact_phone: "",
    additional_notes: "",
  };
  const [intakeForm, setIntakeForm] = useState({ ...emptyIntake });
  const [intakeForm2, setIntakeForm2] = useState({ ...emptyIntake });
  const [selectedBodyZones, setSelectedBodyZones] = useState<number[]>([]);
  const [bodyZoneExtras, setBodyZoneExtras] = useState<Record<string, boolean>>({});

  // Card authorization state
  const [cardAuth, setCardAuth] = useState({
    cardholder_name: "",
    card_number: "",
    card_expiry: "",
    card_cvv: "",
    card_type: "",
    authorized: false,
    signature_acknowledgment: false,
  });

  // Sync activeCategory when services load and we have a preselected service
  useEffect(() => {
    if (preselected && preselected !== "consultation" && services?.length) {
      const svc = services.find((s) => s.id === preselected);
      if (svc && !activeCategory) {
        setActiveCategory(svc.category);
      }
    }
  }, [preselected, services]);

  // Add-ons are tied to the chosen day/service — clear them if either changes so
  // we never carry slots from a different day into the order.
  useEffect(() => { setAddons([]); }, [selectedDate, selectedService]);

  const currentService = services?.find((s) => s.id === selectedService);
  const { data: availableSlots, isLoading: slotsLoading } = useRoomAvailability(
    selectedDate,
    currentService?.category,
    currentService?.duration_minutes,
    currentService?.title
  );

  // Intercept consultation flow (after all hooks)
  if (preselected === "consultation") {
    return <ConsultationForm />;
  }

  // Intercept spa package detail view
  if (packageParam && selectedPackage) {
    return (
      <div className="min-h-screen bg-background">
        <SEO title={`${selectedPackage.name} – Book Package`} description={selectedPackage.description || ""} />
        <Navbar />
        <div className="pt-28 pb-16 px-4 sm:px-6 lg:px-8">
          <PackageDetailView
            pkg={selectedPackage}
            onProceed={() => {
              setFormData((prev) => ({ ...prev, notes: `Spa Package: ${selectedPackage.name}` }));
              // Every package mirrors a bookable service, so go straight to
              // date & time with the package already selected — never back to
              // the treatment list.
              if (selectedPackage.service_id) {
                setSearchParams({ service: selectedPackage.service_id });
                setSelectedService(selectedPackage.service_id);
                setActiveCategory("Spa Packages");
                setStep(1);
                return;
              }
              // Fallback for a package with no mirrored service yet.
              setSearchParams({});
              setStep(0);
            }}
          />
        </div>
        <Footer />
      </div>
    );
  }

  const steps = getStepKeys(currentService);
  const isRetreat = currentService?.category === "Wellness Retreats" || currentService?.type === "program";
  const checkoutStepIdx = steps.indexOf("booking.steps.checkout");
  const needsPayment = checkoutStepIdx >= 0;
  const serviceLocked = !!selectedService;
  const isCouplesBooking = (() => {
    const t1 = (currentService?.title || "").toLowerCase();
    const notes = (formData.notes || "").toLowerCase();
    return t1.includes("couple") || notes.includes("couple");
  })();

  const durationLabel = (s: ServiceRow) =>
    s.duration_minutes >= 60
      ? `${Math.floor(s.duration_minutes / 60)}h${s.duration_minutes % 60 ? ` ${s.duration_minutes % 60}min` : ""}`
      : `${s.duration_minutes} min`;

  // Add-ons only apply to the treatment (card-on-file) flow.
  const allowAddons = currentService?.type === "treatment" && !isRetreat;
  const primaryTotal = currentService ? Math.max(0, (currentService.price ?? 0) - (appliedCoupon?.discount ?? 0)) : 0;
  const addonsTotal = addons.reduce((sum, a) => sum + Number(services?.find((s) => s.id === a.serviceId)?.price ?? 0), 0);
  const grandTotal = primaryTotal + addonsTotal;

  const intakeStepIdx = steps.indexOf("booking.steps.intakeForm");
  const cardAuthStepIdx = steps.indexOf("booking.steps.cardAuth");
  const dateStepIdx = steps.indexOf("booking.steps.dateTime");
  const detailsStepIdx = steps.indexOf("booking.steps.yourDetails");
  const summaryStepIdx = steps.indexOf("booking.steps.summary");
  const paymentStepIdx = steps.indexOf("booking.steps.payment");
  const confirmationStepIdx = steps.length - 1;
  // For paid flows the submission (create pending booking + BAC redirect)
  // now happens from the Summary step, immediately before payment. When the
  // flow has no Summary step (retreats / non-paid inquiries) we fall back to
  // the details step so those flows behave exactly as before.
  const paidSubmitStepIdx = summaryStepIdx > 0 ? summaryStepIdx : detailsStepIdx;

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const PHONE_RE = /^[+\d][\d\s\-()]{6,}$/;
  const NAME_RE = /^[\p{L}][\p{L}\s'\-.]{1,}$/u;
  const formatName = (v: string) => v.replace(/[^\p{L}\s'\-.]/gu, "").slice(0, 100);
  const formatPhone = (v: string) => v.replace(/[^+\d\s\-()]/g, "").slice(0, 25);
  const formatCardNumber = (v: string) => v.replace(/\D/g, "").slice(0, 19).replace(/(.{4})/g, "$1 ").trim();
  const cardDigits = (v: string) => v.replace(/\D/g, "");

  const canProceed = () => {
    if (step === 0) return !!selectedService;
    if (step === intakeStepIdx) {
      // Intake form has no required fields — all health/preference fields
      // are optional, so the user can proceed even when everything is blank.
      return true;
    }
    if (step === cardAuthStepIdx) {
      const digits = cardDigits(cardAuth.card_number);
      return NAME_RE.test(cardAuth.cardholder_name.trim()) && digits.length >= 13 && digits.length <= 19 && /^(0[1-9]|1[0-2])\/\d{2}$/.test(cardAuth.card_expiry) && cardAuth.card_cvv.length >= 3 && cardAuth.authorized && cardAuth.signature_acknowledgment;
    }
    if (step === dateStepIdx && dateStepIdx > 0 && !isRetreat) return locationVisit ? !!selectedDate : (!!selectedDate && !!selectedSlot);
    if (step === detailsStepIdx) {
      const baseOk = NAME_RE.test(formData.name.trim()) && EMAIL_RE.test(formData.email.trim()) && (!formData.phone || isValidPhoneNumber(formData.phone));
      return isRetreat ? baseOk : (baseOk && (!locationVisit || !!formData.address.trim()));
    }
    return true;
  };

  const sendBookingEmail = async (bookingDetails: Record<string, any>) => {
    try {
      await supabase.functions.invoke("send-booking-notification", {
        body: bookingDetails,
      });
    } catch (err) {
      console.error("Failed to send booking email:", err);
    }
  };

  const createBooking = async (paymentId?: string) => {
    const startTime = selectedSlot ? selectedSlot.time.toISOString() : null;
    const endTime = selectedSlot && currentService
      ? new Date(selectedSlot.time.getTime() + currentService.duration_minutes * 60000).toISOString()
      : null;

    const notesWithAddress = locationVisit
      ? `[AT CLIENT LOCATION: ${formData.address}] ${formData.notes}`.trim()
      : formData.notes;

    // Generate id client-side so we don't need INSERT ... RETURNING, which
    // would be blocked by the SELECT RLS policy for anonymous guest bookings
    // (user_id IS NULL never matches auth.uid() = user_id).
    const newBookingId =
      (typeof crypto !== "undefined" && "randomUUID" in crypto)
        ? crypto.randomUUID()
        : (undefined as unknown as string);

    const bookingData: Record<string, any> = {
      id: newBookingId,
      service_id: selectedService,
      booking_date: selectedDate ? format(selectedDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
      // booking_time is the SPA-local wall clock of the selected slot (the
      // instant is UTC; we render it in the spa timezone so the DB row
      // matches how staff read the schedule regardless of browser tz).
      booking_time: selectedSlot ? (() => { const p = spaLocalParts(selectedSlot.time); return `${String(p.hour).padStart(2,"0")}:${String(p.minute).padStart(2,"0")}:00`; })() : "00:00:00",
      guest_name: formData.name,
      guest_email: formData.email,
      guest_phone: formData.phone,
      notes: notesWithAddress,
      total_price: currentService ? Math.max(0, (currentService.price ?? 0) - (appliedCoupon?.discount ?? 0)) : null,
      coupon_code: appliedCoupon?.code ?? null,
      discount_amount: appliedCoupon?.discount ?? 0,
      status: paymentId ? "paid" : (needsPayment ? "pending_payment" : "pending"),
      payment_id: paymentId || null,
      room_id: locationVisit ? null : (selectedSlot?.room.id || null),
      // A couples booking on the 3A+3B pair also holds the second room.
      secondary_room_id: locationVisit ? null : (selectedSlot?.secondaryRoomId || null),
      start_time: locationVisit ? null : startTime,
      end_time: locationVisit ? null : endTime,
      // guest_name is reused from the contact step so the customer never has
      // to type their name twice. Person 2 (couples only) keeps its own name.
      intake_form: isCouplesBooking
        ? {
            is_couples: true,
            person1: { ...intakeForm, guest_name: formData.name },
            person2: intakeForm2,
            body_zones: selectedBodyZones,
            body_zone_extras: bodyZoneExtras,
          }
        : { ...intakeForm, guest_name: formData.name, body_zones: selectedBodyZones, body_zone_extras: bodyZoneExtras },
      // card_authorization intentionally omitted from public booking flow.
      // The form is preserved at /admin/card-authorization-archive for future use.
    };

    // Booking creation is server-side so guest checkout is not blocked by
    // bookings-table RLS. The function revalidates service, coupon, room, and
    // slot availability with the service role before inserting.
    const result = await invokeEdgeFunction<{
      ok?: boolean;
      reason?: string;
      message?: string;
      bookingId?: string;
    }>("create-booking", { body: bookingData });

    if (!result.ok || !result.data || result.data.ok === false) {
      const state = toBookingErrorState(result);
      console.error("[create-booking] failed", {
        status: result.status,
        kind: state.kind,
        reason: state.reason,
        data: result.data,
        raw: result.raw,
        error: result.error?.message,
      });
      const err: any = new Error(state.message);
      err.code = state.kind === "slot_taken" ? "SLOT_TAKEN" : state.kind.toUpperCase();
      err.kind = state.kind;
      err.reason = state.reason;
      err.status = state.status;
      err.action = state.action;
      err.actionLabel = state.actionLabel;
      throw err;
    }

    return result.data.bookingId as string;
  };

  /** Create ONE add-on booking on the same day (its own slot/room). Same person
   *  reuses the primary intake; another person gets a name-only intake. */
  const createAddonBooking = async (addon: AddonItem): Promise<string> => {
    const svc = services?.find((s) => s.id === addon.serviceId);
    const dur = svc?.duration_minutes ?? 60;
    const slotTime = addon.slot?.time ?? null;
    const bookingDate = selectedDate ? format(selectedDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");
    const newId = (typeof crypto !== "undefined" && "randomUUID" in crypto) ? crypto.randomUUID() : (undefined as unknown as string);
    const recipient = addon.recipientName || formData.name;
    const bookingData: Record<string, any> = {
      id: newId,
      service_id: addon.serviceId,
      booking_date: bookingDate,
      booking_time: slotTime
        ? (() => { const p = spaLocalParts(slotTime); return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}:00`; })()
        : "00:00:00",
      guest_name: recipient,
      guest_email: formData.email,
      guest_phone: formData.phone,
      notes: [addon.forSamePerson ? "[Add-on · same guest, back-to-back]" : `[Add-on · for ${recipient}]`, addon.notes]
        .filter(Boolean).join(" ").trim() || null,
      total_price: svc?.price ?? null,
      status: "pending_payment",
      room_id: addon.slot?.room.id || null,
      secondary_room_id: addon.slot?.secondaryRoomId || null,
      start_time: slotTime ? slotTime.toISOString() : null,
      end_time: slotTime ? new Date(slotTime.getTime() + dur * 60000).toISOString() : null,
      intake_form: addon.forSamePerson
        ? { ...intakeForm, guest_name: recipient }
        : { guest_name: recipient },
    };
    const result = await invokeEdgeFunction<{ ok?: boolean; reason?: string; message?: string; bookingId?: string }>(
      "create-booking", { body: bookingData },
    );
    if (!result.ok || !result.data || result.data.ok === false) {
      const state = toBookingErrorState(result);
      const err: any = new Error(state.message);
      err.code = state.kind === "slot_taken" ? "SLOT_TAKEN" : state.kind.toUpperCase();
      err.kind = state.kind;
      throw err;
    }
    return result.data.bookingId as string;
  };


  const handleNext = async () => {
    // Inquiry-only retreats submit straight from the details step. Programs are
    // also "isRetreat" but now take a deposit, so they must fall through to the
    // Summary → checkout branch below instead of submitting here.
    if (isRetreat && !needsPayment && step === detailsStepIdx && canProceed()) {
      setSubmitting(true);
      try {
        await createBooking();
        toast.success(t("booking.retreatInquirySubmitted"));
        setBookingComplete(true);
        setStep(confirmationStepIdx);
      } catch (err: any) {
        toast.error(err.message || t("booking.retreatInquiryFailed"));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Non-paid flows (classes/experiences with inquiry-only) submit at details.
    if (!needsPayment && step === detailsStepIdx && canProceed()) {
      setSubmitting(true);
      try {
        await createBooking();
        toast.success(t("booking.bookingRequestSubmitted"));
        setBookingComplete(true);
        setStep(confirmationStepIdx);
      } catch (err: any) {
        if (err?.code === "SLOT_TAKEN" || err?.code === "INVALID_SLOT") {
          toast.error(err.message);
          handleSlotTaken();
        } else {
          toast.error(err.message || t("booking.bookingRequestFailed"));
        }
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Paid spa flows now confirm with a card-on-file authorization instead of a
    // CompraClick redirect. From the Summary step just advance to the card step
    // (below) — the booking is created and confirmed there, in handleCardAuthorize.

    if (step < steps.length - 1 && canProceed()) setStep(step + 1);
  };

  const handleSlotTaken = () => {
    queryClient.invalidateQueries({ queryKey: ["room-availability"] });
    setSelectedSlot(null);
    setStep(dateStepIdx);
  };

  const cardDigitsValue = cardDigits(cardAuth.card_number);
  const cardAuthValid =
    NAME_RE.test(cardAuth.cardholder_name.trim()) &&
    luhnValid(cardDigitsValue) &&
    /^(0[1-9]|1[0-2])\/\d{2}$/.test(cardAuth.card_expiry) &&
    cardAuth.authorized;

  // Confirm the booking with a card on file (no charge now). Creates the pending
  // booking, then stores the card ENCRYPTED via save_card_authorization (which
  // also flips the booking to confirmed) and emails the confirmation.
  const handleCardAuthorize = async () => {
    if (!cardAuthValid) { toast.error(t("booking.cardAuth.fixFields", { defaultValue: "Please complete the card details and authorization." })); return; }
    setSubmitting(true);
    try {
      // Store the same card on file for a booking and confirm it (idempotent email).
      const authorizeCard = async (bookingId: string) => {
        const { error } = await supabase.rpc("save_card_authorization" as any, {
          _booking_id: bookingId,
          _cardholder: cardAuth.cardholder_name.trim(),
          _card_number: cardDigitsValue,
          _expiry: cardAuth.card_expiry,
          _authorized: true,
          _auth_text: CANCELLATION_POLICY,
        });
        if (error) throw error;
        supabase.functions.invoke("send-booking-notification", { body: { bookingId } }).catch((e) => console.error("[booking] notify failed", e));
      };

      const bookingId = await createBooking();
      await authorizeCard(bookingId);
      // Same-day add-on treatments — one booking each, same card on file.
      for (const addon of addons) {
        const addonId = await createAddonBooking(addon);
        await authorizeCard(addonId);
      }
      setConfirmationCode((bookingId || "").slice(0, 8).toUpperCase());
      setBookingComplete(true);
      setStep(confirmationStepIdx);
    } catch (err: any) {
      if (err?.code === "SLOT_TAKEN" || err?.code === "INVALID_SLOT") {
        toast.error(err.message);
        handleSlotTaken();
      } else {
        toast.error(err.message || t("booking.bookingRequestFailed"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handlePaymentSuccess = async (paymentId: string, authorizationCode?: string) => {
    try {
      const insertedId = await createBooking(paymentId);
      const code = (insertedId ? insertedId.slice(0, 8) : paymentId.slice(-8)).toUpperCase();
      setConfirmationCode(code);
      setPaymentInfo({ paymentId, authorizationCode });
      toast.success(t("booking.confirmed"));
      setBookingComplete(true);
      setStep(steps.length - 1);
    } catch (err: any) {
      // Payment already captured by BAC CompraClick — never lose the record.
      // Persist a fallback row in `payment_failed` state so staff can reconcile.
      try {
        const fallback: Record<string, any> = {
          id: (typeof crypto !== "undefined" && "randomUUID" in crypto) ? crypto.randomUUID() : undefined,
          service_id: selectedService,
          booking_date: selectedDate ? format(selectedDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
          booking_time: selectedSlot ? (() => { const p = spaLocalParts(selectedSlot.time); return `${String(p.hour).padStart(2,"0")}:${String(p.minute).padStart(2,"0")}:00`; })() : "00:00:00",
          guest_name: formData.name,
          guest_email: formData.email,
          guest_phone: formData.phone,
          notes: `[PAYMENT CAPTURED — BOOKING NOT CREATED] reason: ${err?.message || "unknown"} | auth: ${authorizationCode || "n/a"} | ${formData.notes || ""}`.trim(),
          total_price: currentService ? Math.max(0, (currentService.price ?? 0) - (appliedCoupon?.discount ?? 0)) : null,
          coupon_code: appliedCoupon?.code ?? null,
          discount_amount: appliedCoupon?.discount ?? 0,
          status: "payment_failed",
          payment_id: paymentId,
          room_id: null,
          start_time: null,
          end_time: null,
        };
        await supabase.functions.invoke("create-booking", { body: fallback });
        await sendBookingEmail({
          service_name: `[RECONCILE NEEDED] ${currentService?.title ?? ""}`,
          guest_name: formData.name,
          guest_email: formData.email,
          guest_phone: formData.phone,
          booking_date: selectedDate ? format(selectedDate, "EEEE, MMMM d, yyyy") : "TBD",
          booking_time: selectedSlot ? selectedSlot.label : "TBD",
          location: "Reconciliation required — payment captured without slot",
          total_price: currentService?.price,
          notes: `Payment captured (id ${paymentId}) but booking insert failed: ${err?.message}`,
          intake_form: { needs_reconciliation: true, payment_id: paymentId },
          is_retreat: isRetreat,
          payment_id: paymentId,
        });
      } catch (fallbackErr) {
        // eslint-disable-next-line no-console
        console.error("[Booking] fallback persistence failed:", fallbackErr, "paymentId:", paymentId);
      }

      if (err?.code === "SLOT_TAKEN") {
        toast.error(
          `${err.message} Your payment was received — our team will contact you shortly to reschedule. Reference: ${paymentId}`,
        );
        handleSlotTaken();
        return;
      }
      toast.error(
        `${err.message || t("booking.paymentBookingFailed")} — your payment was received. Reference: ${paymentId}`,
      );
    }
  };


  // Build category list and filter
  const allCategories = [...new Set((services ?? []).map((s) => s.category))];
  const filteredServices = (() => {
    let list = services ?? [];
    // If a specific service was passed via URL, show only that service
    if (preselected && preselected !== "consultation") {
      const match = list.filter((s) => s.id === preselected);
      if (match.length) return match;
    }
    // Otherwise filter by active category
    if (activeCategory) {
      list = list.filter((s) => s.category === activeCategory);
    }
    return list;
  })();
  const grouped = filteredServices.reduce<Record<string, ServiceRow[]>>((acc, s) => {
    (acc[s.category] = acc[s.category] || []).push(s);
    return acc;
  }, {});

  // Group available slots by time label
  const slotsByTime = (availableSlots ?? []).reduce<Record<string, TimeSlot[]>>((acc, slot) => {
    (acc[slot.label] = acc[slot.label] || []).push(slot);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-background">
      <SEO title={seo.booking.title} description={seo.booking.description} canonical={seo.booking.canonical} />
      <Navbar />
      <div className="pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-10">
          <h1 className="spa-heading-lg text-foreground">
            {isRetreat ? t("booking.headingRetreat") : currentService?.type === "experience" ? t("booking.headingExperience") : t("booking.heading")}
          </h1>
        </motion.div>

        {/* Steps Indicator */}
        <div className="flex items-center justify-center gap-1 sm:gap-2 mb-12 overflow-x-auto px-2">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-1 sm:gap-2 shrink-0">
              <div className={cn(
                "w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-body font-semibold transition-colors",
                i < step ? "bg-spa-sage text-spa-cream" : i === step ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
              )}>
                {i < step ? <Check className="h-3 w-3 sm:h-4 sm:w-4" /> : i + 1}
              </div>
              {i < steps.length - 1 && <div className={cn("w-4 sm:w-8 h-px", i < step ? "bg-spa-sage" : "bg-border")} />}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <AnimatePresence mode="wait">
              <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>

                {/* Step 0: Select Service */}
                {step === 0 && !serviceLocked && (
                  <div className="space-y-6">
                    <h2 className="spa-heading-md text-foreground mb-2">{t("booking.selectAService")}</h2>
                    <p className="spa-body-sm mb-4">{t("booking.selectAServiceSubtitle")}</p>
                    {/* Category filter tabs */}
                    <div className="flex flex-wrap gap-2 mb-6">
                      {!isFilterLocked && (
                        <button
                          onClick={() => setActiveCategory(null)}
                          className={cn(
                            "px-4 py-2 rounded-full font-body text-sm font-medium transition-all",
                            !activeCategory ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-border hover:text-foreground"
                          )}
                        >
                          {t("booking.all")}
                        </button>
                      )}
                      {allCategories.map((cat) => (
                        <button
                          key={cat}
                          onClick={() => {
                            if (isFilterLocked) return;
                            setActiveCategory(activeCategory === cat ? null : cat);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                          className={cn(
                            "px-4 py-2 rounded-full font-body text-sm font-medium transition-all",
                            activeCategory === cat ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-border hover:text-foreground",
                            isFilterLocked && activeCategory !== cat && "hidden"
                          )}
                        >
                          {translateCategory(t, cat)}
                        </button>
                      ))}
                    </div>
                    {Object.entries(grouped).map(([cat, items]) => (
                      <div key={cat}>
                        <h3 className="font-body text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{translateCategory(t, cat)}</h3>
                        <div className="space-y-3 mb-6">
                          {items.map((s) => (
                            <button key={s.id} onClick={() => { setSelectedService(s.id); setStep(1); window.scrollTo({ top: 0, behavior: "smooth" }); }} className={cn(
                              "w-full text-left p-5 rounded-2xl border transition-all",
                              selectedService === s.id ? "border-foreground bg-card shadow-md" : "border-border bg-card hover:border-muted-foreground/30"
                            )}>
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-heading text-lg font-medium text-foreground">{s.title}</h4>
                                    {s.type === "course" && (
                                      <span className="text-[10px] font-body font-semibold uppercase bg-primary/15 text-primary px-2 py-0.5 rounded-full">{s.sessions} sessions</span>
                                    )}
                                  </div>
                                  <p className="spa-body-sm mt-1 line-clamp-1">{s.description}</p>
                                </div>
                                <div className="text-right ml-4 shrink-0">
                                  <p className="font-heading text-lg font-semibold text-foreground">{formatCRC(s.price)}</p>
                                  <p className="text-xs text-muted-foreground font-body">{durationLabel(s)}</p>
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Intake Form */}
                {step === intakeStepIdx && (() => {
                  const renderPersonForm = (
                    form: typeof intakeForm,
                    setForm: (v: typeof intakeForm) => void,
                    idSuffix: string,
                  ) => (
                    <div className="space-y-4 max-w-lg">
                      {/* Name is intentionally NOT collected here — it is
                          reused from the Your Details step for both solo
                          and couples bookings so guests are never asked
                          for their name twice. */}
                      <div>
                        <label className="font-body text-sm font-medium text-foreground mb-1.5 block">{t("booking.intake.allergies")}</label>
                        <Input value={form.allergies} onChange={(e) => setForm({ ...form, allergies: e.target.value })} placeholder={t("booking.intake.allergiesPlaceholder")} />
                      </div>
                      <div>
                        <label className="font-body text-sm font-medium text-foreground mb-1.5 block">{t("booking.intake.medications")}</label>
                        <Input value={form.medications} onChange={(e) => setForm({ ...form, medications: e.target.value })} placeholder={t("booking.intake.medicationsPlaceholder")} />
                      </div>
                      <div>
                        <label className="font-body text-sm font-medium text-foreground mb-1.5 block">{t("booking.intake.healthConditions")}</label>
                        <textarea
                          value={form.health_conditions}
                          onChange={(e) => setForm({ ...form, health_conditions: e.target.value })}
                          className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-body ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[80px]"
                          placeholder={t("booking.intake.healthConditionsPlaceholder")}
                        />
                      </div>
                      <div>
                        <label className="font-body text-sm font-medium text-foreground mb-1.5 block">{t("booking.intake.recentSurgeries")}</label>
                        <Input value={form.recent_surgeries} onChange={(e) => setForm({ ...form, recent_surgeries: e.target.value })} placeholder={t("booking.intake.recentSurgeriesPlaceholder")} />
                      </div>
                      <div className="flex items-center space-x-3">
                        <Checkbox
                          id={`pregnancy-${idSuffix}`}
                          checked={form.pregnancy}
                          onCheckedChange={(checked) => setForm({ ...form, pregnancy: !!checked })}
                        />
                        <label htmlFor={`pregnancy-${idSuffix}`} className="font-body text-sm text-foreground">{t("booking.intake.pregnancy")}</label>
                      </div>
                      <div className="flex items-center space-x-3">
                        <Checkbox
                          id={`bp-${idSuffix}`}
                          checked={form.blood_pressure_issues}
                          onCheckedChange={(checked) => setForm({ ...form, blood_pressure_issues: !!checked })}
                        />
                        <label htmlFor={`bp-${idSuffix}`} className="font-body text-sm text-foreground">{t("booking.intake.bloodPressure")}</label>
                      </div>
                      <div>
                        <label className="font-body text-sm font-medium text-foreground mb-1.5 block">{t("booking.intake.skinConditions")}</label>
                        <Input value={form.skin_conditions} onChange={(e) => setForm({ ...form, skin_conditions: e.target.value })} placeholder={t("booking.intake.skinConditionsPlaceholder")} />
                      </div>
                      <div>
                        <label className="font-body text-sm font-medium text-foreground mb-1.5 block">{t("booking.intake.additionalNotes")}</label>
                        <textarea
                          value={form.additional_notes}
                          onChange={(e) => setForm({ ...form, additional_notes: e.target.value })}
                          className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-body ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[80px]"
                          placeholder={t("booking.intake.additionalNotesPlaceholder")}
                        />
                      </div>
                    </div>
                  );

                  return (
                    <div>
                      <div className="flex items-center gap-3 mb-6">
                        <ClipboardList className="h-6 w-6 text-spa-sage" />
                        <h2 className="spa-heading-md text-foreground">{t(getIntakeFormTitleKey(currentService?.category))}</h2>
                      </div>
                      <p className="spa-body-sm mb-6">{t("booking.intake.subtitle")}</p>

                      {isCouplesBooking && (
                        <div className="mb-6 rounded-lg border border-spa-sage/30 bg-spa-sage/5 px-4 py-3">
                          <p className="font-body text-sm text-foreground">{t("booking.intake.couplesNotice")}</p>
                        </div>
                      )}

                      {isCouplesBooking ? (
                        <>
                          <div className="mb-8">
                            <h3 className="font-heading text-lg font-semibold text-foreground mb-4">{t("booking.intake.person1")}</h3>
                            <p className="font-body text-xs text-muted-foreground mb-4">{formData.name}</p>
                            {/* Person 1's name is reused from the contact step to avoid duplicate entry. */}
                            {renderPersonForm(intakeForm, setIntakeForm, "p1")}
                          </div>
                          <div className="border-t border-border pt-8">
                            <h3 className="font-heading text-lg font-semibold text-foreground mb-4">{t("booking.intake.person2")}</h3>
                            {renderPersonForm(intakeForm2, setIntakeForm2, "p2")}
                          </div>
                          {currentService && (
                            <div className="border-t border-border pt-6 mt-6 max-w-lg">
                              <BodyZoneSelector
                                category={currentService.category}
                                serviceTitle={currentService.title}
                                selectedZones={selectedBodyZones}
                                onZonesChange={setSelectedBodyZones}
                                extraAnswers={bodyZoneExtras}
                                onExtraChange={setBodyZoneExtras}
                              />
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          {renderPersonForm(intakeForm, setIntakeForm, "p1")}
                          {currentService && (
                            <div className="border-t border-border pt-4 mt-4 max-w-lg">
                              <BodyZoneSelector
                                category={currentService.category}
                                serviceTitle={currentService.title}
                                selectedZones={selectedBodyZones}
                                onZonesChange={setSelectedBodyZones}
                                extraAnswers={bodyZoneExtras}
                                onExtraChange={setBodyZoneExtras}
                              />
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })()}

                {/* Card Authorization */}
                {step === cardAuthStepIdx && (
                  <div>
                    <div className="flex items-center gap-3 mb-6">
                      <ShieldCheck className="h-6 w-6 text-spa-sage" />
                      <h2 className="spa-heading-md text-foreground">{t("booking.cardAuth.title")}</h2>
                    </div>
                    <p className="spa-body-sm mb-6">{t("booking.cardAuth.subtitle")}</p>
                    <div className="space-y-4 max-w-lg">
                      <div>
                        <label className="font-body text-sm font-medium text-foreground mb-1.5 block">{t("booking.cardAuth.cardholder")}</label>
                        <Input value={cardAuth.cardholder_name} onChange={(e) => setCardAuth({ ...cardAuth, cardholder_name: formatName(e.target.value) })} placeholder={t("booking.cardAuth.cardholderPlaceholder")} autoComplete="cc-name" />
                      </div>
                      <div>
                        <label className="font-body text-sm font-medium text-foreground mb-1.5 block">{t("booking.cardAuth.cardNumber")}</label>
                        <Input value={cardAuth.card_number} onChange={(e) => setCardAuth({ ...cardAuth, card_number: formatCardNumber(e.target.value) })} placeholder="1234 5678 9012 3456" inputMode="numeric" autoComplete="cc-number" maxLength={23} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="font-body text-sm font-medium text-foreground mb-1.5 block">{t("booking.cardAuth.expiry")}</label>
                          <Input value={cardAuth.card_expiry} onChange={(e) => {
                            let val = e.target.value.replace(/[^\d/]/g, "");
                            if (val.length === 2 && !val.includes("/") && cardAuth.card_expiry.length < val.length) val += "/";
                            setCardAuth({ ...cardAuth, card_expiry: val.slice(0, 5) });
                          }} placeholder="MM/YY" maxLength={5} />
                        </div>
                        <div>
                          <label className="font-body text-sm font-medium text-foreground mb-1.5 block">{t("booking.cardAuth.cvv")}</label>
                          <Input value={cardAuth.card_cvv} onChange={(e) => setCardAuth({ ...cardAuth, card_cvv: e.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder="123" maxLength={4} type="password" />
                        </div>
                      </div>
                      <div>
                        <label className="font-body text-sm font-medium text-foreground mb-1.5 block">{t("booking.cardAuth.cardType")}</label>
                        <div className="flex flex-wrap gap-2">
                          {["Visa", "Mastercard", "Amex", "Other"].map((type) => (
                            <button
                              key={type}
                              onClick={() => setCardAuth({ ...cardAuth, card_type: type })}
                              className={cn(
                                "px-4 py-2 rounded-xl text-sm font-body font-medium border transition-all",
                                cardAuth.card_type === type
                                  ? "border-foreground bg-foreground text-background"
                                  : "border-border bg-card text-foreground hover:border-muted-foreground/50"
                              )}
                            >
                              {type}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="bg-card rounded-2xl border border-border p-5 mt-4 space-y-4">
                        <p className="font-body text-sm text-foreground font-medium">{t("booking.cardAuth.declaration")}</p>
                        <p className="font-body text-xs text-muted-foreground leading-relaxed">
                          {t("booking.cardAuth.declarationText")}
                        </p>
                        <div className="flex items-start space-x-3">
                          <Checkbox
                            id="authorize"
                            checked={cardAuth.authorized}
                            onCheckedChange={(checked) => setCardAuth({ ...cardAuth, authorized: !!checked })}
                          />
                          <label htmlFor="authorize" className="font-body text-sm text-foreground">{t("booking.cardAuth.authorizeLabel")}</label>
                        </div>
                        <div className="flex items-start space-x-3">
                          <Checkbox
                            id="signature"
                            checked={cardAuth.signature_acknowledgment}
                            onCheckedChange={(checked) => setCardAuth({ ...cardAuth, signature_acknowledgment: !!checked })}
                          />
                          <label htmlFor="signature" className="font-body text-sm text-foreground">{t("booking.cardAuth.signatureLabel")}</label>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Date & Time with Room Availability */}
                {step === dateStepIdx && dateStepIdx > 0 && !isRetreat && (
                  <div>
                    <h2 className="spa-heading-md text-foreground mb-6">{t("booking.dateTime.title")}</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="bg-card rounded-2xl p-4 border border-border">
                        <Calendar
                          mode="single"
                          selected={selectedDate}
                          onSelect={(d) => { setSelectedDate(d); setSelectedSlot(null); }}
                          disabled={(date) => { const t = new Date(); t.setHours(0,0,0,0); return date < t; }}
                          className="pointer-events-auto"
                        />
                      </div>
                      <div>
                        <p className="font-body text-sm font-medium text-foreground mb-4">
                          {selectedDate ? format(selectedDate, "EEEE, MMMM d") : t("booking.dateTime.selectDateFirst")}
                        </p>
                        {selectedDate && slotsLoading && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="font-body text-sm">{t("booking.dateTime.checking")}</span>
                          </div>
                        )}
                        {selectedDate && !slotsLoading && availableSlots && availableSlots.length === 0 && !locationVisit && (
                          <div className="space-y-3">
                            <p className="font-body text-sm text-muted-foreground">{t("booking.dateTime.noTimes")}</p>
                            <button
                              onClick={() => { setLocationVisit(true); setSelectedSlot(null); }}
                              className="w-full py-3 px-4 rounded-xl text-sm font-body font-medium transition-all border-2 border-spa-sage bg-spa-sage/10 text-foreground hover:bg-spa-sage/20"
                            >
                              <div className="flex items-center justify-center gap-2">
                                <MapPin className="h-4 w-4 text-spa-sage" />
                                <span>{t("booking.dateTime.requestVisit")}</span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">{t("booking.dateTime.noExtraCost")}</p>
                            </button>
                          </div>
                        )}
                        {selectedDate && !slotsLoading && availableSlots && availableSlots.length > 0 && !locationVisit && (
                          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                            {Object.entries(slotsByTime).map(([timeLabel, slots]) => {
                              const firstSlot = slots[0];
                              const isSelected = selectedSlot && slots.some(
                                (s) => s.time.getTime() === selectedSlot.time.getTime() && s.room.id === selectedSlot.room.id
                              );
                              return (
                                <button
                                  key={timeLabel}
                                  onClick={() => setSelectedSlot(firstSlot)}
                                  className={cn(
                                    "w-full py-2.5 px-4 rounded-xl text-sm font-body font-medium transition-all border mb-1.5 text-center",
                                    isSelected
                                      ? "bg-foreground text-background border-foreground"
                                      : "bg-card text-foreground border-border hover:border-foreground/30"
                                  )}
                                >
                                  {timeLabel}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {selectedDate && !slotsLoading && !locationVisit && availableSlots && availableSlots.length > 0 && (
                          <button
                            onClick={() => { setLocationVisit(true); setSelectedSlot(null); }}
                            className="w-full mt-3 py-2.5 px-4 rounded-xl text-sm font-body font-medium transition-all border border-border text-muted-foreground hover:border-spa-sage hover:text-foreground"
                          >
                            <div className="flex items-center justify-center gap-2">
                              <MapPin className="h-3.5 w-3.5" />
                              <span>{t("booking.dateTime.orRequestVisit")}</span>
                            </div>
                          </button>
                        )}
                        {locationVisit && (
                          <div className="space-y-3">
                            <div className="py-3 px-4 rounded-xl border-2 border-spa-sage bg-spa-sage/10">
                              <div className="flex items-center justify-center gap-2">
                                <MapPin className="h-4 w-4 text-spa-sage" />
                                <span className="font-body text-sm font-medium text-foreground">{t("booking.dateTime.visitSelected")}</span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1 text-center">{t("booking.dateTime.noExtraCost")}</p>
                            </div>
                            <button
                              onClick={() => setLocationVisit(false)}
                              className="font-body text-xs text-muted-foreground underline hover:text-foreground"
                            >
                              {t("booking.dateTime.switchBack")}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Your Details */}
                {step === detailsStepIdx && (
                  <div>
                    <h2 className="spa-heading-md text-foreground mb-6">
                      {isRetreat ? t("booking.details.titleRetreat") : t("booking.details.title")}
                    </h2>
                    <div className="space-y-4 max-w-md">
                      <div>
                        <label className="font-body text-sm font-medium text-foreground mb-1.5 block">{t("booking.details.fullName")}</label>
                        <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: formatName(e.target.value) })} placeholder={t("booking.details.fullNamePlaceholder")} autoComplete="name" />
                      </div>
                      <div>
                        <label className="font-body text-sm font-medium text-foreground mb-1.5 block">{t("booking.details.email")}</label>
                        <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value.trim().slice(0, 255) })} placeholder={t("booking.details.emailPlaceholder")} inputMode="email" autoComplete="email" />
                      </div>
                      <div>
                        <label className="font-body text-sm font-medium text-foreground mb-1.5 block">{t("booking.details.phone")}</label>
                        <PhoneField
                          value={formData.phone}
                          onChange={(v) => setFormData({ ...formData, phone: v })}
                          placeholder="8888 8888"
                          invalid={!!formData.phone && !isValidPhoneNumber(formData.phone)}
                        />
                        {!!formData.phone && !isValidPhoneNumber(formData.phone) && (
                          <p className="text-xs text-destructive mt-1 font-body">{t("booking.details.phoneInvalid", { defaultValue: "Enter a valid phone number for the selected country." })}</p>
                        )}
                      </div>
                      {locationVisit && (
                        <div>
                          <label className="font-body text-sm font-medium text-foreground mb-1.5 block">{t("booking.details.address")}</label>
                          <Input value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder={t("booking.details.addressPlaceholder")} />
                        </div>
                      )}
                      <div>
                        <label className="font-body text-sm font-medium text-foreground mb-1.5 block">{t("booking.details.couponCode")}</label>
                        <div className="flex gap-2">
                          <Input
                            value={couponCode}
                            onChange={(e) => { setCouponCode(e.target.value); if (appliedCoupon) setAppliedCoupon(null); }}
                            placeholder={t("booking.couponPlaceholder")}
                            disabled={!!appliedCoupon}
                          />
                          {appliedCoupon ? (
                            <Button type="button" variant="ghost" onClick={() => { setAppliedCoupon(null); setCouponCode(""); }}>
                              Remove
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              disabled={!couponCode.trim() || validatingCoupon || !currentService}
                              onClick={async () => {
                                if (!currentService) return;
                                setValidatingCoupon(true);
                                const res = await validateCoupon(couponCode, Number(currentService.price ?? 0), { serviceId: currentService.id });
                                setValidatingCoupon(false);
                                if (!res.valid) { toast.error(res.reason || "Invalid coupon"); return; }
                                setAppliedCoupon({ code: res.coupon!.code, discount: res.discountAmount ?? 0 });
                                toast.success(`Coupon applied: -${formatCRC(res.discountAmount ?? 0)}`);
                              }}
                            >
                              {validatingCoupon ? "Checking…" : "Apply"}
                            </Button>
                          )}
                        </div>
                        {appliedCoupon && (
                          <p className="text-xs text-spa-sage mt-1.5 font-body">
                            {appliedCoupon.code} applied — {formatCRC(appliedCoupon.discount)} off
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="font-body text-sm font-medium text-foreground mb-1.5 block">
                          {isRetreat ? t("booking.details.retreatGoals") : t("booking.details.specialRequests")}
                        </label>
                        <textarea
                          value={formData.notes}
                          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                          className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-body ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[100px]"
                          placeholder={isRetreat ? t("booking.details.retreatGoalsPlaceholder") : t("booking.details.specialRequestsPlaceholder")}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Summary — final review before checkout */}
                {summaryStepIdx > 0 && step === summaryStepIdx && (
                  <div>
                    <h2 className="spa-heading-md text-foreground mb-2">{t("booking.summary.title")}</h2>
                    <p className="spa-body-sm mb-6">{t("booking.summary.subtitle")}</p>
                    <div className="space-y-3 max-w-lg">
                      {currentService && (
                        <div className="bg-card rounded-2xl border border-border p-5 flex items-start justify-between gap-3">
                          <div>
                            <p className="font-body text-xs uppercase tracking-wider text-muted-foreground mb-1">{t("booking.summary.service")}</p>
                            <p className="font-heading text-base font-medium text-foreground">{currentService.title}</p>
                            <p className="font-body text-sm text-muted-foreground">{durationLabel(currentService)} · {formatCRC(Math.max(0, (currentService.price ?? 0) - (appliedCoupon?.discount ?? 0)))}</p>
                          </div>
                          <button type="button" className="font-body text-xs text-spa-sage underline hover:text-foreground shrink-0" onClick={() => setStep(0)}>{t("booking.summary.edit")}</button>
                        </div>
                      )}
                      {dateStepIdx > 0 && (selectedDate || selectedSlot || locationVisit) && (
                        <div className="bg-card rounded-2xl border border-border p-5 flex items-start justify-between gap-3">
                          <div>
                            <p className="font-body text-xs uppercase tracking-wider text-muted-foreground mb-1">{t("booking.summary.dateTime")}</p>
                            <p className="font-body text-sm text-foreground">
                              {selectedDate ? format(selectedDate, "EEEE, MMM d, yyyy") : ""}
                              {selectedSlot ? ` · ${selectedSlot.label}` : ""}
                              {locationVisit ? ` · ${t("booking.summarySidebar.yourLocation")}` : ""}
                            </p>
                          </div>
                          <button type="button" className="font-body text-xs text-spa-sage underline hover:text-foreground shrink-0" onClick={() => setStep(dateStepIdx)}>{t("booking.summary.edit")}</button>
                        </div>
                      )}
                      <div className="bg-card rounded-2xl border border-border p-5 flex items-start justify-between gap-3">
                        <div>
                          <p className="font-body text-xs uppercase tracking-wider text-muted-foreground mb-1">{t("booking.summary.contact")}</p>
                          <p className="font-body text-sm text-foreground">{formData.name}</p>
                          <p className="font-body text-sm text-muted-foreground">{formData.email}</p>
                          {formData.phone && <p className="font-body text-sm text-muted-foreground">{formData.phone}</p>}
                        </div>
                        <button type="button" className="font-body text-xs text-spa-sage underline hover:text-foreground shrink-0" onClick={() => setStep(detailsStepIdx)}>{t("booking.summary.edit")}</button>
                      </div>
                      {intakeStepIdx > 0 && (
                        <div className="bg-card rounded-2xl border border-border p-5 flex items-start justify-between gap-3">
                          <div>
                            <p className="font-body text-xs uppercase tracking-wider text-muted-foreground mb-1">{t("booking.summary.intake")}</p>
                            <p className="font-body text-sm text-foreground flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-spa-sage" /> {t("booking.summary.intakeCompleted")}</p>
                          </div>
                          <button type="button" className="font-body text-xs text-spa-sage underline hover:text-foreground shrink-0" onClick={() => setStep(intakeStepIdx)}>{t("booking.summary.edit")}</button>
                        </div>
                      )}
                      {allowAddons && selectedDate && (
                        <AddOnTreatments
                          date={selectedDate}
                          services={services ?? []}
                          primaryName={formData.name}
                          addons={addons}
                          setAddons={setAddons}
                        />
                      )}
                      {currentService && (
                        <div className="border-t border-border pt-4 flex items-center justify-between">
                          <span className="font-body text-sm font-semibold text-foreground">{t("booking.summary.total")}</span>
                          <span className="font-heading text-lg font-semibold text-foreground">{formatCRC(grandTotal)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Online card checkout removed — treatments now redirect to
                    a BAC CompraClick deposit link at the details step. This
                    step is retained as a payment marker but is not rendered. */}
                {step === checkoutStepIdx && checkoutStepIdx > 0 && (
                  <div>
                    <h2 className="spa-heading-md text-foreground mb-2">Card authorization</h2>
                    <p className="spa-body-sm mb-6">
                      No charge is made now. Your card is kept on file only to apply the cancellation policy below.
                    </p>
                    <div className="space-y-4 max-w-md">
                      <div>
                        <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Cardholder name</label>
                        <Input
                          value={cardAuth.cardholder_name}
                          onChange={(e) => setCardAuth({ ...cardAuth, cardholder_name: formatName(e.target.value) })}
                          placeholder="Name on the card"
                          autoComplete="cc-name"
                        />
                      </div>
                      <div>
                        <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Card number</label>
                        <Input
                          value={cardAuth.card_number}
                          onChange={(e) => setCardAuth({ ...cardAuth, card_number: formatCardNumber(e.target.value) })}
                          placeholder="1234 5678 9012 3456"
                          inputMode="numeric"
                          autoComplete="cc-number"
                          maxLength={23}
                        />
                      </div>
                      <div className="max-w-[160px]">
                        <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Expiration date</label>
                        <Input
                          value={cardAuth.card_expiry}
                          onChange={(e) => {
                            let val = e.target.value.replace(/[^\d/]/g, "");
                            if (val.length === 2 && !val.includes("/") && cardAuth.card_expiry.length < val.length) val += "/";
                            setCardAuth({ ...cardAuth, card_expiry: val.slice(0, 5) });
                          }}
                          placeholder="MM/YY"
                          inputMode="numeric"
                          autoComplete="cc-exp"
                          maxLength={5}
                        />
                      </div>

                      <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
                        <p className="font-body text-sm font-semibold text-foreground">Cancellation policy</p>
                        <p className="font-body text-xs text-muted-foreground leading-relaxed">{CANCELLATION_POLICY}</p>
                        <label className="flex items-start gap-2 cursor-pointer">
                          <Checkbox
                            checked={cardAuth.authorized}
                            onCheckedChange={(checked) => setCardAuth({ ...cardAuth, authorized: !!checked })}
                            className="mt-0.5"
                          />
                          <span className="font-body text-sm text-foreground">{CARD_AUTHORIZATION_LABEL}</span>
                        </label>
                      </div>

                      <p className="flex items-center gap-1.5 font-body text-xs text-muted-foreground">
                        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-spa-sage" />
                        Stored encrypted. We never store your security code (CVV).
                      </p>

                      <div className="flex items-center gap-2 pt-1">
                        <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={submitting}>
                          <ChevronLeft className="h-4 w-4 mr-1" /> {t("booking.nav.back")}
                        </Button>
                        <Button className="flex-1" onClick={handleCardAuthorize} disabled={submitting || !cardAuthValid}>
                          {submitting ? t("booking.nav.submitting") : "Confirm reservation"}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Confirmation */}
                {step === confirmationStepIdx && bookingComplete && (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 rounded-full bg-spa-sage/20 flex items-center justify-center mx-auto mb-6">
                      <Check className="h-8 w-8 text-spa-sage" />
                    </div>
                    <h2 className="spa-heading-md text-foreground mb-3">
                      {isRetreat
                        ? t("booking.confirmationScreen.inquirySubmitted")
                        : paymentInfo
                          ? t("booking.confirmationScreen.appointmentConfirmed")
                          : t("booking.confirmationScreen.requestReceived")}
                    </h2>
                    <p className="spa-body max-w-md mx-auto mb-8">
                      {isRetreat
                        ? t("booking.confirmationScreen.retreatMessage", { email: formData.email })
                        : paymentInfo
                          ? t("booking.confirmationScreen.paidMessage", { name: formData.name, email: formData.email })
                          : t("booking.confirmationScreen.bookingMessage", { email: formData.email })}
                    </p>
                    <div className="bg-card rounded-2xl p-6 border border-border max-w-sm mx-auto text-left space-y-3">
                      {confirmationCode && (
                        <div className="flex justify-between text-sm font-body">
                          <span className="text-muted-foreground">{t("booking.confirmationScreen.confirmationNumber")}</span>
                          <span className="font-mono font-semibold text-foreground">{confirmationCode}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm font-body">
                        <span className="text-muted-foreground">{t("booking.service")}</span>
                        <span className="font-medium text-foreground">{currentService?.title}</span>
                      </div>
                      {!isRetreat && selectedDate && (
                        <>
                          <div className="flex justify-between text-sm font-body">
                            <span className="text-muted-foreground">{t("booking.date")}</span>
                            <span className="font-medium text-foreground">{format(selectedDate, "MMM d, yyyy")}</span>
                          </div>
                          {selectedSlot && (
                            <div className="flex justify-between text-sm font-body">
                              <span className="text-muted-foreground">{t("booking.time")}</span>
                              <span className="font-medium text-foreground">{selectedSlot.label}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-sm font-body">
                            <span className="text-muted-foreground">{t("booking.confirmationScreen.location")}</span>
                            <span className="font-medium text-foreground">{locationVisit ? t("booking.confirmationScreen.yourLocation") : t("booking.confirmationScreen.studio")}</span>
                          </div>
                          {locationVisit && formData.address && (
                            <div className="flex justify-between text-sm font-body">
                              <span className="text-muted-foreground">{t("booking.confirmationScreen.address")}</span>
                              <span className="font-medium text-foreground text-right max-w-[200px]">{formData.address}</span>
                            </div>
                          )}
                        </>
                      )}
                      <div className="border-t border-border pt-3 flex justify-between text-sm font-body">
                        <span className="font-semibold text-foreground">{t("booking.total")}</span>
                        <span className="font-semibold text-foreground">{currentService ? formatCRC(Math.max(0, (currentService.price ?? 0) - (appliedCoupon?.discount ?? 0))) : ""}</span>
                      </div>
                      {paymentInfo && (
                        <>
                          <div className="flex justify-between text-sm font-body">
                            <span className="text-muted-foreground">{t("booking.confirmationScreen.paymentStatus")}</span>
                            <span className="font-semibold text-spa-sage">{t("booking.confirmationScreen.paymentStatusPaid")}</span>
                          </div>
                          {paymentInfo.authorizationCode && (
                            <div className="flex justify-between text-xs font-body">
                              <span className="text-muted-foreground">{t("booking.confirmationScreen.authCode")}</span>
                              <span className="font-mono text-foreground">{paymentInfo.authorizationCode}</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    {currentService?.is_online && currentService?.meeting_url && (
                      <div className="mt-6 bg-spa-sage/10 rounded-2xl p-4 max-w-sm mx-auto">
                        <p className="font-body text-sm font-medium text-foreground mb-1">{t("booking.confirmationScreen.meetingLink")}</p>
                        <a href={currentService.meeting_url} target="_blank" rel="noopener noreferrer" className="font-body text-sm text-spa-sage underline break-all">
                          {currentService.meeting_url}
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            {step < confirmationStepIdx
              && !(step === checkoutStepIdx && checkoutStepIdx > 0) && (
              <div className="flex justify-between mt-8">
                {step > (serviceLocked ? 1 : 0) ? (
                  <Button variant="ghost" onClick={() => setStep(Math.max(serviceLocked ? 1 : 0, step - 1))}>
                    <ChevronLeft className="h-4 w-4 mr-1" /> {t("booking.nav.back")}
                  </Button>
                ) : (
                  <span />
                )}
                <Button variant="default" onClick={handleNext} disabled={!canProceed() || submitting}>
                  {submitting
                    ? t("booking.nav.submitting")
                    : (isRetreat && !needsPayment && step === detailsStepIdx)
                      ? t("booking.nav.submitInquiry")
                      : step === paidSubmitStepIdx && needsPayment
                        ? t("booking.nav.continueToCheckout")
                        : step === detailsStepIdx && !needsPayment
                          ? t("booking.nav.requestBooking")
                          : t("booking.nav.continue")}
                </Button>
              </div>
            )}
          </div>

          {/* Sidebar Summary */}
          <div className="hidden lg:block">
            <div className="sticky top-24 bg-card rounded-2xl border border-border p-6 space-y-4">
              <h3 className="font-heading text-lg font-medium text-foreground">{t("booking.summarySidebar.title")}</h3>
              <div className="space-y-3">
                {currentService && (
                  <div className="flex items-start gap-3 text-sm font-body">
                    <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="font-medium text-foreground">{currentService.title}</p>
                      <p className="text-muted-foreground">{durationLabel(currentService)} · {formatCRC(currentService.price)}</p>
                      {currentService.type === "course" && (
                        <p className="text-muted-foreground">{t("booking.summarySidebar.sessionsIncluded", { count: currentService.sessions })}</p>
                      )}
                    </div>
                  </div>
                )}
                {intakeStepIdx >= 0 && step > intakeStepIdx && (
                  <div className="flex items-start gap-3 text-sm font-body">
                    <ClipboardList className="h-4 w-4 text-spa-sage mt-0.5" />
                    <p className="font-medium text-foreground">{t("booking.summarySidebar.intakeDone")}</p>
                  </div>
                )}
                {cardAuthStepIdx >= 0 && step > cardAuthStepIdx && (
                  <div className="flex items-start gap-3 text-sm font-body">
                    <ShieldCheck className="h-4 w-4 text-spa-sage mt-0.5" />
                    <p className="font-medium text-foreground">{t("booking.summarySidebar.cardDone")}</p>
                  </div>
                )}
                {selectedDate && selectedSlot && (
                  <div className="flex items-start gap-3 text-sm font-body">
                    <CalendarDays className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="font-medium text-foreground">{format(selectedDate, "EEEE, MMM d")}</p>
                      <p className="text-muted-foreground">{selectedSlot.label}</p>
                    </div>
                  </div>
                )}
                {(selectedSlot || locationVisit) && (
                  <div className="flex items-start gap-3 text-sm font-body">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="font-medium text-foreground">{locationVisit ? t("booking.summarySidebar.yourLocation") : t("booking.summarySidebar.studio")}</p>
                    </div>
                  </div>
                )}
              </div>
              {needsPayment && currentService && (
                <div className="flex justify-between text-sm font-body">
                  <span className="text-muted-foreground">Charged now</span>
                  <span className="font-semibold text-spa-sage">$0 — card on file</span>
                </div>
              )}
              {currentService && (
                <div className="border-t border-border pt-4 flex justify-between font-body">
                  <span className="text-sm font-semibold text-foreground">{t("booking.total")}</span>
                  <span className="text-sm font-semibold text-foreground">{formatCRC(currentService.price)}</span>
                </div>
              )}
              {needsPayment && (
                <p className="text-xs font-body text-muted-foreground flex items-start gap-1">
                  <ShieldCheck className="h-3 w-3 inline mt-0.5 shrink-0" />
                  <span>No charge in advance. Pay at the spa; your card is kept on file only for the cancellation policy.</span>
                </p>
              )}
            </div>
          </div>
        </div>
        <p className="text-center text-sm text-muted-foreground font-body mt-8">
          {t("booking.faqLine")}{" "}
          <Link to="/faqs" className="text-primary underline-offset-4 hover:underline">
            {t("booking.readFaqs")}
          </Link>
          .
        </p>
      </div>
      <Footer />
    </div>
  );
};

export default BookingPage;
