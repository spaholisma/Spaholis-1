import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { HOLIS_WHATSAPP_URL } from "@/lib/whatsapp";
import { trackBookingComplete } from "@/lib/analytics";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { toBookingErrorState, bookingErrorMessage } from "@/lib/bookingErrors";
import { Check, AlertTriangle, Loader2, Clock, CreditCard } from "lucide-react";
import { toast } from "sonner";

type PendingContext = {
  bookingId?: string;
  // "class" routes finalization at class_bookings; absent/other = treatment.
  type?: "treatment" | "class";
  serviceTitle?: string;
  guestName?: string;
  guestEmail?: string;
  amount?: number;
  returnedAt?: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type FinalStatus = "paid" | "failed" | "pending" | "invalid";

/**
 * Landing page for the BAC CompraClick "Return URL".
 * Delegates validation to the `finalize-booking` edge function, then renders
 * a status timeline (pending_payment -> paid|payment_failed) and a customer
 * retry CTA when payment failed.
 */
const BookingReturn = () => {
  const [params] = useSearchParams();

  const rawStatus = (params.get("status") || params.get("result") || params.get("RESPONSE") || "")
    .toLowerCase();
  const claimedStatus: "approved" | "declined" | "cancelled" | "unknown" =
    rawStatus.includes("approve") || rawStatus === "success" || rawStatus === "ok" || rawStatus === "00"
      ? "approved"
      : rawStatus.includes("declin") || rawStatus === "failed"
        ? "declined"
        : rawStatus.includes("cancel")
          ? "cancelled"
          : "unknown";

  const pending = useMemo<PendingContext>(() => {
    try {
      return JSON.parse(sessionStorage.getItem("holis:pending_booking") || "{}");
    } catch {
      return {};
    }
  }, []);

  const [processing, setProcessing] = useState(true);
  const [finalStatus, setFinalStatus] = useState<FinalStatus>("pending");
  const [invalidReason, setInvalidReason] = useState<string | null>(null);
  const [invalidMessage, setInvalidMessage] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const run = async () => {
      try {
        if (!pending.bookingId || !UUID_RE.test(pending.bookingId)) {
          setInvalidReason("no_session");
          setInvalidMessage(bookingErrorMessage("no_session"));
          setFinalStatus("invalid");
          return;
        }

        const rawParams: Record<string, string> = {};
        params.forEach((v, k) => {
          if (v) rawParams[k] = v;
        });

        // Route to the class-specific finalizer for class bookings; treatments
        // keep using the untouched finalize-booking function.
        const finalizeFn = pending.type === "class" ? "finalize-class-booking" : "finalize-booking";
        const result = await invokeEdgeFunction<{
          ok?: boolean;
          reason?: string;
          status?: "paid" | "failed" | "already_paid" | "already_failed";
        }>(finalizeFn, {
          body: {
            bookingId: pending.bookingId,
            guestEmail: pending.guestEmail,
            expectedAmount: pending.amount,
            claimedStatus,
            params: rawParams,
          },
        });

        if (!result.ok || !result.data || result.data.ok === false) {
          const state = toBookingErrorState(result);
          console.error("[finalize-booking] failed", {
            status: result.status,
            kind: state.kind,
            reason: state.reason,
            raw: result.raw,
            error: result.error?.message,
          });
          setInvalidReason(state.kind);
          setInvalidMessage(state.message);
          setFinalStatus(state.kind === "already_paid" ? "paid" : "invalid");
          return;
        }

        const serverStatus = result.data?.status;
        if (serverStatus === "paid" || serverStatus === "already_paid") {
          setFinalStatus("paid");
        } else {
          setFinalStatus("failed");
        }
      } finally {
        setProcessing(false);
      }
    };
    run();
    // Only run once on mount — inputs are captured from URL/sessionStorage snapshots.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear the pending-booking session ONLY when we reach a terminal success,
  // so a failed customer can still trigger the retry CTA below.
  useEffect(() => {
    if (finalStatus === "paid") {
      // "paid" comes from finalize-booking / finalize-class-booking checking the
      // payment on our server — coming back to this page alone proves nothing.
      if (pending.bookingId) {
        trackBookingComplete({
          transaction_id: pending.bookingId, booking_type: pending.type === "class" ? "class" : "treatment",
          item_name: pending.serviceTitle, value: Number(pending.amount ?? 0),
          payment_method: "bac_compraclick", payment_status: "paid",
        });
      }
      try { sessionStorage.removeItem("holis:pending_booking"); } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalStatus]);

  const handleRetry = async () => {
    if (!pending.bookingId || !pending.guestEmail) {
      toast.error("Missing session details — please start a new booking.");
      return;
    }
    setRetrying(true);
    try {
      const result = await invokeEdgeFunction<{ ok?: boolean; reason?: string; bacLink?: string; amount?: number }>(
        "retry-booking-payment",
        { body: { bookingId: pending.bookingId, guestEmail: pending.guestEmail } },
      );
      if (!result.ok || !result.data || result.data.ok === false) {
        const state = toBookingErrorState(result);
        console.error("[retry-booking-payment] failed", {
          status: result.status,
          kind: state.kind,
          reason: state.reason,
          data: result.data,
          raw: result.raw,
        });
        toast.error(state.message);
        return;
      }
      const bacLink = result.data.bacLink as string;
      const amount = result.data.amount as number;
      // Refresh session so /booking/return can validate the new attempt.
      try {
        sessionStorage.setItem(
          "holis:pending_booking",
          JSON.stringify({ ...pending, amount, returnedAt: null }),
        );
      } catch {}
      toast.success(`Redirecting to secure payment ($${amount})…`);
      window.location.href = bacLink;
    } finally {
      setRetrying(false);
    }
  };

  // ---- Timeline pieces ----
  type TimelineState = "done" | "active" | "failed" | "upcoming";
  const timeline: Array<{ key: string; label: string; hint: string; state: TimelineState; icon: React.ReactNode }> = [
    {
      key: "pending",
      label: "Payment pending",
      hint: "You were redirected to BAC CompraClick to complete the deposit.",
      state: "done",
      icon: <Clock className="h-4 w-4" />,
    },
    {
      key: "processing",
      label: "Awaiting BAC response",
      hint: "We validate the payment on our servers as soon as BAC confirms.",
      state: processing ? "active" : finalStatus === "invalid" ? "failed" : "done",
      icon: <CreditCard className="h-4 w-4" />,
    },
    {
      key: "final",
      label:
        finalStatus === "paid"
          ? "Booking confirmed"
          : finalStatus === "failed"
            ? "Payment not completed"
            : finalStatus === "invalid"
              ? "Could not verify"
              : "Awaiting confirmation",
      hint:
        finalStatus === "paid"
          ? "Your appointment is on our calendar and staff have been notified."
          : finalStatus === "failed"
            ? "No charge was applied. You can retry with the same booking below."
            : finalStatus === "invalid"
              ? "We couldn't match this callback to a pending booking in this browser."
              : "Please wait — we're still receiving updates.",
      state:
        finalStatus === "paid"
          ? "done"
          : finalStatus === "failed" || finalStatus === "invalid"
            ? "failed"
            : processing
              ? "upcoming"
              : "active",
      icon:
        finalStatus === "paid" ? (
          <Check className="h-4 w-4" />
        ) : finalStatus === "failed" || finalStatus === "invalid" ? (
          <AlertTriangle className="h-4 w-4" />
        ) : (
          <Loader2 className="h-4 w-4 animate-spin" />
        ),
    },
  ];

  const stateStyles: Record<TimelineState, string> = {
    done: "bg-spa-sage text-white border-spa-sage",
    active: "bg-primary text-primary-foreground border-primary",
    failed: "bg-destructive text-destructive-foreground border-destructive",
    upcoming: "bg-muted text-muted-foreground border-border",
  };

  const canRetry =
    !processing &&
    (finalStatus === "failed" || finalStatus === "invalid") &&
    !!pending.bookingId &&
    !!pending.guestEmail &&
    // retry-booking-payment only knows about treatment bookings; class card
    // payments just start a fresh booking instead.
    pending.type !== "class";

  const badge: { label: string; className: string } =
    processing
      ? { label: "Verifying…", className: "bg-muted text-muted-foreground border-border" }
      : finalStatus === "paid"
        ? { label: "Paid", className: "bg-spa-sage/15 text-spa-sage border-spa-sage/30" }
        : finalStatus === "failed"
          ? { label: "Payment failed", className: "bg-destructive/10 text-destructive border-destructive/30" }
          : finalStatus === "invalid"
            ? { label: "Unverified", className: "bg-amber-500/15 text-amber-700 border-amber-500/30" }
            : { label: "Awaiting confirmation", className: "bg-muted text-muted-foreground border-border" };

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Booking Confirmation" description="Your Holis Wellness booking status." />
      <Navbar />
      <div className="pt-28 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto">
          {/* Prominent status badge — reflects the finalize-booking verification
              result. `role="status"` + `aria-live="polite"` announces the final
              outcome to screen readers once verification finishes, without
              interrupting whatever the user is doing. `aria-busy` while the
              request is in flight tells assistive tech the value is not final. */}
          <div className="flex justify-center mb-6">
            <span
              role="status"
              aria-live="polite"
              aria-atomic="true"
              aria-busy={processing}
              aria-label={`Booking status: ${badge.label}`}
              className={`inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider px-3 py-1 rounded-full border ${badge.className}`}
            >
              {badge.label}
            </span>
          </div>


          {/* Header block */}
          <div className="text-center mb-10">
            {processing ? (
              <div className="py-8 flex flex-col items-center gap-3 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p>Confirming your payment…</p>
              </div>
            ) : finalStatus === "paid" ? (
              <>
                <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-spa-sage/20 flex items-center justify-center">
                  <Check className="h-8 w-8 text-spa-sage" />
                </div>
                <h1 className="font-serif text-3xl md:text-4xl mb-2">Appointment Confirmed</h1>
                <p className="text-muted-foreground">
                  Thank you{pending.guestName ? `, ${pending.guestName}` : ""}. Your deposit
                  {pending.amount ? ` of $${pending.amount}` : ""} has been received
                  {pending.serviceTitle ? ` for ${pending.serviceTitle}` : ""}.
                </p>
                {pending.bookingId && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Reference:{" "}
                    <span className="font-mono">{pending.bookingId.slice(0, 8).toUpperCase()}</span>
                  </p>
                )}
              </>
            ) : finalStatus === "failed" ? (
              <>
                <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle className="h-8 w-8 text-destructive" />
                </div>
                <h1 className="font-serif text-3xl md:text-4xl mb-2">Payment Not Completed</h1>
                <p className="text-muted-foreground">
                  Your payment was declined or cancelled, so your appointment was not confirmed.
                </p>
              </>
            ) : finalStatus === "invalid" ? (
              <>
                <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle className="h-8 w-8 text-destructive" />
                </div>
                <h1 className="font-serif text-3xl md:text-4xl mb-2">
                  We couldn't verify this confirmation
                </h1>
                <p className="text-muted-foreground">
                  {invalidMessage
                    || "The confirmation link couldn't be validated against a pending booking."}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Reason code:{" "}
                  <span className="font-mono">{invalidReason || "unknown"}</span>. No changes were made to any booking.
                </p>
              </>
            ) : (
              <>
                <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                  <AlertTriangle className="h-8 w-8 text-muted-foreground" />
                </div>
                <h1 className="font-serif text-3xl md:text-4xl mb-2">Awaiting Payment Confirmation</h1>
                <p className="text-muted-foreground">
                  We haven't received a payment status yet. Our team will confirm your booking shortly.
                </p>
              </>
            )}
          </div>

          {/* Status timeline */}
          <div className="rounded-lg border bg-card p-6 mb-8">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground mb-4">
              Booking status
            </h2>
            <ol className="space-y-4">
              {timeline.map((step, idx) => (
                <li key={step.key} className="flex gap-3">
                  <div
                    className={`h-8 w-8 shrink-0 rounded-full border flex items-center justify-center ${stateStyles[step.state]}`}
                    aria-hidden="true"
                  >
                    {step.icon}
                  </div>
                  <div className="flex-1 pt-1">
                    <p className="font-medium">
                      {idx + 1}. {step.label}
                    </p>
                    <p className="text-sm text-muted-foreground">{step.hint}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Next steps / actions */}
          <div className="flex flex-wrap gap-3 justify-center">
            {finalStatus === "paid" && (
              <Button asChild>
                <Link to="/">Return home</Link>
              </Button>
            )}

            {canRetry && (
              <Button onClick={handleRetry} disabled={retrying}>
                {retrying ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Redirecting…
                  </>
                ) : (
                  <>Retry payment{pending.amount ? ` ($${pending.amount})` : ""}</>
                )}
              </Button>
            )}

            {(finalStatus === "failed" || finalStatus === "invalid" || finalStatus === "pending") && (
              <>
                <Button asChild variant="outline">
                  <Link to="/book">Start a new booking</Link>
                </Button>
                <Button asChild variant="outline">
                  <a href={HOLIS_WHATSAPP_URL} target="_blank" rel="noreferrer">
                    Contact us
                  </a>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default BookingReturn;
