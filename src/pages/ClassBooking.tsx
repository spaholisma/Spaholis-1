import { useState } from "react";
import { formatCRC } from "@/lib/currency";
import { useSearchParams, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { Check, ChevronLeft, CreditCard, CalendarDays, Clock, MapPin, Users, Ticket, Infinity as InfinityIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatSpaDateLong, formatSpaTime } from "@/lib/businessHours";
import { toast } from "sonner";
import { validateCoupon } from "@/lib/coupons";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import type { ScheduleRow } from "@/hooks/useClasses";
import { Skeleton } from "@/components/ui/skeleton";
import { useMyOfferings, redeemOffering, type UserOffering } from "@/hooks/useOfferings";
import { useOfferingEligibilityMap, filterEligibleOfferings } from "@/hooks/useOfferingEligibility";

function useScheduleEvent(scheduleId: string | null) {
  return useQuery({
    queryKey: ["schedule-event", scheduleId],
    queryFn: async () => {
      if (!scheduleId) return null;
      const { data, error } = await supabase
        .from("class_schedule")
        .select("*, classes(*)")
        .eq("id", scheduleId)
        .single();
      if (error) throw error;
      return data as ScheduleRow;
    },
    enabled: !!scheduleId,
  });
}

type PayMethod = "card" | "membership" | "credits";

const ClassBookingPage = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const scheduleId = searchParams.get("class");
  const { user } = useAuth();
  const { data: event, isLoading } = useScheduleEvent(scheduleId);
  const { data: myOfferings = [] } = useMyOfferings();
  const { data: eligibilityMap = {} } = useOfferingEligibilityMap();

  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState({ name: "", email: "", phone: "" });
  const [submitting, setSubmitting] = useState(false);
  const [bookingComplete, setBookingComplete] = useState(false);
  const [payMethod, setPayMethod] = useState<PayMethod>("card");
  const [selectedOfferingId, setSelectedOfferingId] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);

  const cls = event?.classes;
  const needsPayment = cls?.requires_payment && cls.price > 0;
  const classId = cls?.id ?? "";

  // Only offerings that are valid for THIS class
  const eligibleOfferings = classId
    ? filterEligibleOfferings(myOfferings, classId, eligibilityMap)
    : [];
  const memberships = eligibleOfferings.filter((o) => o.type === "membership");
  const passes = eligibleOfferings.filter(
    (o) => o.type === "class_pass" && (o.credits_remaining ?? 0) > 0,
  );
  const hasRedeemable = memberships.length > 0 || passes.length > 0;

  // For the entitlements panel: what the user owns but can't use here
  const ineligibleOwned = myOfferings.filter(
    (o) => !eligibleOfferings.some((eo) => eo.id === o.id),
  );

  const steps = needsPayment
    ? ["Your Details", "Payment", "Confirmation"]
    : ["Your Details", "Confirmation"];

  const canProceed = !!formData.name && !!formData.email;

  const createClassBooking = async (opts: {
    paymentStatus: string;
    paymentMethod: PayMethod | "free";
    userOfferingId?: string;
  }) => {
    const basePrice = Number(cls?.price ?? 0);
    const discount = appliedCoupon?.discount ?? 0;
    // Generate id client-side to avoid INSERT ... RETURNING being blocked by
    // the SELECT RLS policy for anonymous guest bookings.
    const newId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : undefined;
    const bookingData: Record<string, any> = {
      id: newId,
      schedule_id: scheduleId,
      guest_name: formData.name,
      guest_email: formData.email,
      status: "booked",
      payment_status: opts.paymentStatus,
      payment_method: opts.paymentMethod,
      user_offering_id: opts.userOfferingId ?? null,
      coupon_code: appliedCoupon?.code ?? null,
      discount_amount: discount,
      total_price: opts.paymentMethod === "card" ? Math.max(0, basePrice - discount) : basePrice,
    };
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    if (currentSession?.user?.id) bookingData.user_id = currentSession.user.id;

    const { error } = await supabase.from("class_bookings").insert(bookingData as any);
    if (error) throw error;
    return newId as string;
  };

  const handleNext = async () => {
    if (step === 0 && canProceed) {
      if (!needsPayment) {
        setSubmitting(true);
        try {
          const bookingId = await createClassBooking({ paymentStatus: "not_required", paymentMethod: "free" });
          // Fire-and-forget: send USD-formatted class confirmation email.
          supabase.functions
            .invoke("send-booking-notification", { body: { classBookingId: bookingId } })
            .catch((e) => console.error("[class-booking] notify failed", e));
          toast.success(t("booking.classBookedSuccess"));
          setBookingComplete(true);
          setStep(steps.length - 1);
        } catch (err: any) {
          toast.error(err.message || t("booking.classBookFailed"));
        } finally {
          setSubmitting(false);
        }
        return;
      }
      // Default to membership if available
      if (memberships.length > 0) {
        setPayMethod("membership");
        setSelectedOfferingId(memberships[0].id);
      } else if (passes.length > 0) {
        setPayMethod("credits");
        setSelectedOfferingId(passes[0].id);
      }
      setStep(1);
    }
  };

  // Card checkout: create the booking SERVER-SIDE (price recomputed there), then
  // either confirm immediately (100% coupon) or redirect to BAC CompraClick.
  // Confirmation of a real payment happens back on /booking/return via the
  // finalize-booking edge function — never trust the browser to mark it paid.
  const handleCardCheckout = async () => {
    if (!scheduleId || !cls) return;
    setSubmitting(true);
    try {
      const result = await invokeEdgeFunction<{
        ok?: boolean;
        reason?: string;
        message?: string;
        bookingId?: string;
        needsPayment?: boolean;
        bacLink?: string;
        amount?: number;
      }>("create-class-booking", {
        body: {
          schedule_id: scheduleId,
          guest_name: formData.name,
          guest_email: formData.email,
          coupon_code: appliedCoupon?.code ?? null,
        },
      });

      if (!result.ok || !result.data || result.data.ok === false) {
        const reason = result.data?.reason;
        const msg =
          reason === "class_full" ? "This class just filled up."
          : reason === "invalid_coupon" ? (result.data?.message || "That coupon is not valid for this class.")
          : reason === "no_payment_link" ? "Card payment is temporarily unavailable. Please contact us."
          : (result.data?.message || t("booking.classBookFailed"));
        toast.error(msg);
        return;
      }

      const data = result.data;
      if (data.needsPayment && data.bacLink && data.bookingId) {
        // Persist context so /booking/return can validate this class payment.
        try {
          sessionStorage.setItem(
            "holis:pending_booking",
            JSON.stringify({
              bookingId: data.bookingId,
              type: "class",
              serviceTitle: cls.title,
              guestName: formData.name,
              guestEmail: formData.email,
              amount: data.amount,
              returnedAt: null,
            }),
          );
        } catch { /* sessionStorage unavailable — return page will show "no_session" */ }
        toast.success(`Redirecting to secure payment ($${data.amount})…`);
        window.location.href = data.bacLink;
        return;
      }

      // total was $0 (100% coupon): server already confirmed + emailed.
      toast.success(t("booking.classBookedSuccess"));
      setBookingComplete(true);
      setStep(steps.length - 1);
    } catch (err: any) {
      toast.error(err.message || t("booking.classBookFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRedeem = async () => {
    if (!selectedOfferingId) return toast.error(t("booking.selectOfferingError"));
    if (!user) return toast.error(t("booking.signInForOfferingError"));
    setSubmitting(true);
    try {
      const bookingId = await createClassBooking({
        paymentStatus: "paid",
        paymentMethod: payMethod,
        userOfferingId: selectedOfferingId,
      });
      await redeemOffering(selectedOfferingId, bookingId);
      // Fire-and-forget: send USD-formatted class confirmation email.
      supabase.functions
        .invoke("send-booking-notification", { body: { classBookingId: bookingId } })
        .catch((e) => console.error("[class-booking] notify failed", e));
      toast.success(payMethod === "membership" ? t("booking.bookedWithMembership") : t("booking.bookedWithCredit"));
      setBookingComplete(true);
      setStep(steps.length - 1);
    } catch (err: any) {
      toast.error(err.message || t("booking.redeemFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-24 pb-16 px-4 max-w-3xl mx-auto">
          <Skeleton className="h-8 w-64 mx-auto mb-6" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
        <Footer />
      </div>
    );
  }

  if (!event || !cls) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-24 pb-16 px-4 max-w-3xl mx-auto text-center">
          <h1 className="spa-heading-lg text-foreground mb-4">Class Not Found</h1>
          <p className="spa-body mb-8">This class may no longer be available.</p>
          <Button asChild><Link to="/classes">Back to Classes</Link></Button>
        </div>
        <Footer />
      </div>
    );
  }

  const start = new Date(event.start_time);
  const end = new Date(event.end_time);
  const confirmationIdx = steps.length - 1;
  const paymentIdx = steps.indexOf("Payment");

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-10">
          <h1 className="spa-heading-lg text-foreground">Book Your Spot</h1>
        </motion.div>

        {/* Steps Indicator */}
        <div className="flex items-center justify-center gap-2 mb-12">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-xs font-body font-semibold transition-colors",
                i < step ? "bg-spa-sage text-spa-cream" : i === step ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
              )}>
                {i < step ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              {i < steps.length - 1 && <div className={cn("w-8 sm:w-12 h-px", i < step ? "bg-spa-sage" : "bg-border")} />}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <AnimatePresence mode="wait">
              <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>

                {step === 0 && (
                  <div>
                    <h2 className="spa-heading-md text-foreground mb-6">Your Details</h2>

                    {/* Entitlements summary — what you can use for THIS class */}
                    {user && needsPayment && (myOfferings.length > 0) && (
                      <div className="max-w-md mb-6 rounded-2xl border border-border bg-muted/30 p-4">
                        <p className="font-body text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                          Your entitlements for this class
                        </p>
                        {hasRedeemable ? (
                          <ul className="space-y-1.5">
                            {memberships.map((o) => (
                              <li key={o.id} className="flex items-center gap-2 text-sm font-body text-foreground">
                                <InfinityIcon className="h-3.5 w-3.5 text-spa-sage" />
                                <span className="font-medium">{o.name_snapshot}</span>
                                <span className="text-muted-foreground">
                                  · {o.is_unlimited ? "Unlimited" : `${o.credits_remaining} credits left`}
                                </span>
                              </li>
                            ))}
                            {passes.map((o) => (
                              <li key={o.id} className="flex items-center gap-2 text-sm font-body text-foreground">
                                <Ticket className="h-3.5 w-3.5 text-spa-sage" />
                                <span className="font-medium">{o.name_snapshot}</span>
                                <span className="text-muted-foreground">
                                  · {o.credits_remaining} of {o.credits_total} left
                                </span>
                              </li>
                            ))}
                            <li className="text-xs text-muted-foreground pt-1.5 border-t border-border mt-2">
                              You can redeem one of these on the next step, or pay by card.
                            </li>
                          </ul>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-sm font-body text-foreground">
                              None of your current memberships or class passes are valid for{" "}
                              <span className="font-medium">{cls.title}</span>.
                            </p>
                            {ineligibleOwned.length > 0 && (
                              <p className="text-xs text-muted-foreground">
                                You own {ineligibleOwned.length} other offering
                                {ineligibleOwned.length > 1 ? "s" : ""} that {ineligibleOwned.length > 1 ? "don't" : "doesn't"} cover this class.
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              You can still pay {formatCRC(cls.price)} by card on the next step, or{" "}
                              <Link to="/classes#buy" className="underline">buy a pass</Link>.
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="space-y-4 max-w-md">
                      <div>
                        <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Full Name *</label>
                        <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Jane Doe" />
                      </div>
                      <div>
                        <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Email *</label>
                        <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="jane@example.com" />
                      </div>
                      <div>
                        <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Phone</label>
                        <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="+506 8888-8888" />
                      </div>
                    </div>
                  </div>
                )}


                {step === paymentIdx && paymentIdx > 0 && (
                  <div>
                    <h2 className="spa-heading-md text-foreground mb-6">Choose Payment</h2>
                    <div className="max-w-md space-y-3">

                      {/* Membership option */}
                      {user && memberships.length > 0 && (
                        <PayOption
                          icon={<InfinityIcon className="h-4 w-4" />}
                          title="Use my membership"
                          selected={payMethod === "membership"}
                          onClick={() => { setPayMethod("membership"); setSelectedOfferingId(memberships[0].id); }}
                        >
                          <OfferingPicker
                            options={memberships}
                            value={selectedOfferingId}
                            onChange={setSelectedOfferingId}
                            renderMeta={(o) => o.is_unlimited ? "Unlimited" : `${o.credits_remaining} credits left`}
                          />
                        </PayOption>
                      )}

                      {/* Credits option */}
                      {user && passes.length > 0 && (
                        <PayOption
                          icon={<Ticket className="h-4 w-4" />}
                          title="Use class credits"
                          selected={payMethod === "credits"}
                          onClick={() => { setPayMethod("credits"); setSelectedOfferingId(passes[0].id); }}
                        >
                          <OfferingPicker
                            options={passes}
                            value={selectedOfferingId}
                            onChange={setSelectedOfferingId}
                            renderMeta={(o) => `${o.credits_remaining} of ${o.credits_total} left`}
                          />
                        </PayOption>
                      )}

                      {user && !hasRedeemable && ineligibleOwned.length > 0 && (
                        <div className="rounded-xl border border-border bg-muted/30 p-3">
                          <p className="text-xs font-body text-muted-foreground">
                            Your existing memberships and passes don't cover{" "}
                            <span className="font-medium text-foreground">{cls.title}</span>.
                            Pay by card below or{" "}
                            <Link to="/classes#buy" className="underline">view eligible passes</Link>.
                          </p>
                        </div>
                      )}

                      {/* Card */}
                      <PayOption
                        icon={<CreditCard className="h-4 w-4" />}
                        title={`Pay ${formatCRC(cls.price)} by card`}
                        selected={payMethod === "card"}
                        onClick={() => setPayMethod("card")}
                      />

                      {!user && (
                        <p className="text-xs font-body text-muted-foreground px-1">
                          <Link to="/auth" className="underline">Sign in</Link> to use a membership or class credits.
                        </p>
                      )}

                      {payMethod === "card" && (
                        <div className="bg-card rounded-2xl border border-border p-4 mt-2 space-y-2">
                          <label className="font-body text-xs font-medium text-muted-foreground">Have a coupon?</label>
                          <div className="flex gap-2">
                            <Input
                              value={couponCode}
                              onChange={(e) => { setCouponCode(e.target.value); if (appliedCoupon) setAppliedCoupon(null); }}
                              placeholder="Enter code"
                              disabled={!!appliedCoupon}
                            />
                            {appliedCoupon ? (
                              <Button type="button" variant="ghost" onClick={() => { setAppliedCoupon(null); setCouponCode(""); }}>Remove</Button>
                            ) : (
                              <Button
                                type="button"
                                variant="outline"
                                disabled={!couponCode.trim() || validatingCoupon}
                                onClick={async () => {
                                  setValidatingCoupon(true);
                                  const res = await validateCoupon(couponCode, Number(cls.price ?? 0), { classId: cls.id });
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
                            <p className="text-xs text-spa-sage font-body">{appliedCoupon.code} applied — {formatCRC(appliedCoupon.discount)} off</p>
                          )}
                        </div>
                      )}

                      <div className="bg-card rounded-2xl border border-border p-5 mt-6">
                        <div className="flex justify-between mb-3">
                          <span className="font-body text-sm text-muted-foreground">Class</span>
                          <span className="font-body text-sm font-medium text-foreground">{cls.title}</span>
                        </div>
                        {payMethod === "card" && appliedCoupon && (
                          <div className="flex justify-between text-sm font-body text-spa-sage mb-2">
                            <span>Coupon ({appliedCoupon.code})</span>
                            <span>-{formatCRC(appliedCoupon.discount)}</span>
                          </div>
                        )}
                        <div className="flex justify-between border-t border-border pt-3">
                          <span className="font-body text-sm font-semibold text-foreground">Total</span>
                          <span className="font-heading text-xl font-semibold text-foreground">
                            {payMethod === "card"
                              ? formatCRC(Math.max(0, Number(cls.price) - (appliedCoupon?.discount ?? 0)))
                              : payMethod === "membership" ? "Membership" : "1 credit"}
                          </span>
                        </div>
                      </div>

                      {payMethod === "card" ? (
                        <Button className="w-full" onClick={handleCardCheckout} disabled={submitting}>
                          {submitting ? t("booking.booking") : "Book"}
                        </Button>
                      ) : (
                        <Button className="w-full" onClick={handleRedeem} disabled={submitting || !selectedOfferingId}>
                          {submitting ? t("booking.booking") : t("booking.confirmBooking")}
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {step === confirmationIdx && bookingComplete && (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 rounded-full bg-spa-sage/20 flex items-center justify-center mx-auto mb-6">
                      <Check className="h-8 w-8 text-spa-sage" />
                    </div>
                    <h2 className="spa-heading-md text-foreground mb-3">You're Booked!</h2>
                    <p className="spa-body max-w-sm mx-auto mb-8">
                      We'll send a confirmation to {formData.email}. See you there!
                    </p>
                    <div className="bg-card rounded-2xl p-6 border border-border max-w-sm mx-auto text-left space-y-3">
                      <div className="flex justify-between text-sm font-body">
                        <span className="text-muted-foreground">Class</span>
                        <span className="font-medium text-foreground">{cls.title}</span>
                      </div>
                      <div className="flex justify-between text-sm font-body">
                        <span className="text-muted-foreground">Date</span>
                        <span className="font-medium text-foreground">{formatSpaDateLong(start)}</span>
                      </div>
                      <div className="flex justify-between text-sm font-body">
                        <span className="text-muted-foreground">Time</span>
                        <span className="font-medium text-foreground">{formatSpaTime(start)} – {formatSpaTime(end)}</span>
                      </div>
                      {cls.location && (
                        <div className="flex justify-between text-sm font-body">
                          <span className="text-muted-foreground">Location</span>
                          <span className="font-medium text-foreground">{cls.location}</span>
                        </div>
                      )}
                    </div>
                    <div className="mt-8">
                      <Button asChild variant="default"><Link to="/classes">Back to Classes</Link></Button>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            {step === 0 && (
              <div className="flex justify-between mt-8">
                <Button variant="ghost" asChild>
                  <Link to="/classes"><ChevronLeft className="h-4 w-4 mr-1" /> Back</Link>
                </Button>
                <Button variant="default" onClick={handleNext} disabled={!canProceed || submitting}>
                  {submitting ? "Booking..." : needsPayment ? "Continue to Payment" : "Book Now"}
                </Button>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="hidden lg:block">
            <div className="sticky top-24 bg-card rounded-2xl border border-border p-6 space-y-4">
              <h3 className="font-heading text-lg font-medium text-foreground">Class Details</h3>
              <img
                src={cls.image_url || "/class-placeholder.svg"}
                alt={cls.title}
                className="w-full h-32 object-cover rounded-xl"
                onError={(e) => { const el = e.currentTarget as HTMLImageElement; if (!el.src.endsWith("/class-placeholder.svg")) el.src = "/class-placeholder.svg"; }}
              />
              <div className="space-y-3">
                <p className="font-heading text-base font-medium text-foreground">{cls.title}</p>
                <div className="flex items-center gap-2 text-sm font-body text-muted-foreground">
                  <CalendarDays className="h-4 w-4" />
                  <span>{formatSpaDateLong(start)}</span>
                </div>
                <div className="flex items-center gap-2 text-sm font-body text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>{formatSpaTime(start)} – {formatSpaTime(end)}</span>
                </div>
                {cls.location && (
                  <div className="flex items-center gap-2 text-sm font-body text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    <span>{cls.location}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm font-body text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span>{event.spots_remaining} spots remaining</span>
                </div>
              </div>
              {cls.price > 0 && (
                <div className="border-t border-border pt-4 flex justify-between font-body">
                  <span className="text-sm font-semibold text-foreground">Price</span>
                  <span className="text-sm font-semibold text-foreground">{formatCRC(cls.price)}</span>
                </div>
              )}
              {user && hasRedeemable && needsPayment && (
                <p className="text-xs font-body text-spa-sage">
                  ✓ You have a membership or credits available
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

function PayOption({
  icon, title, selected, onClick, children,
}: { icon: React.ReactNode; title: string; selected: boolean; onClick: () => void; children?: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-xl border p-4 transition-colors",
        selected ? "border-foreground bg-muted/30" : "border-border hover:bg-muted/20"
      )}
    >
      <div className="flex items-center gap-2 font-body text-sm font-medium text-foreground">
        {icon} {title}
      </div>
      {selected && children && <div className="mt-3">{children}</div>}
    </button>
  );
}

function OfferingPicker({
  options, value, onChange, renderMeta,
}: {
  options: UserOffering[];
  value: string | null;
  onChange: (id: string) => void;
  renderMeta: (o: UserOffering) => string;
}) {
  if (options.length === 1) {
    const o = options[0];
    return <p className="text-xs font-body text-muted-foreground">{o.name_snapshot} — {renderMeta(o)}</p>;
  }
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm font-body"
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>{o.name_snapshot} — {renderMeta(o)}</option>
      ))}
    </select>
  );
}

export default ClassBookingPage;
