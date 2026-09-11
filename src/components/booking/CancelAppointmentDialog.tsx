import { useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Mail, Copy, AlertTriangle } from "lucide-react";
import { formatUsd } from "@/lib/currency";
import {
  AFTER_WINDOW_PERCENT, CANCELLATION_EMAIL, POLICY_LINES, WITHIN_WINDOW_PERCENT,
  buildCancellationMailto, cancellationFee, cancellationWindow, reservationCode,
} from "@/lib/cancellationPolicy";

interface Props {
  booking: {
    id: string;
    created_at: string;
    start_time?: string | null;
    booking_date: string;
    booking_time?: string | null;
    total_price?: number | null;
    guest_name?: string | null;
    services?: { title?: string | null } | null;
  };
}

const spaTime = (d: Date) =>
  d.toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZone: "America/Costa_Rica",
  });

/**
 * Cancelling happens by email, never online: the button opens a message
 * already addressed to the studio with the appointment filled in, so the guest
 * only adds a line. Reception reads the time it arrived against the "Booked on"
 * line of their own booking email and charges 50% or 100% from there.
 */
export function CancelAppointmentDialog({ booking }: Props) {
  const [open, setOpen] = useState(false);

  const serviceName = booking.services?.title || "Appointment";
  const charge = cancellationWindow(booking.created_at, booking.start_time);
  const feeNow = cancellationFee(booking.total_price, charge.percent);

  const mailto = buildCancellationMailto({
    serviceName,
    date: new Date(`${booking.booking_date}T00:00:00`).toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    }),
    time: (booking.booking_time || "").slice(0, 5) || "TBD",
    reservationId: reservationCode(booking.id),
    guestName: booking.guest_name,
  });

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(CANCELLATION_EMAIL);
      toast.success("Email address copied");
    } catch {
      toast.error(`Write to ${CANCELLATION_EMAIL}`);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" className="self-start sm:self-auto" onClick={() => setOpen(true)}>
        Cancel appointment
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel {serviceName}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-left">
                <p className="text-sm">
                  Cancellations are made by email. The button below opens one already addressed to us with
                  your appointment details — just add a line and send it.
                </p>

                <div className="flex gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
                  <p className="text-sm text-foreground">
                    {charge.withinWindow ? (
                      <>
                        If your email reaches us before <strong>{spaTime(charge.endsAt)}</strong> (Costa Rica
                        time), <strong>{WITHIN_WINDOW_PERCENT}%</strong>{feeNow > 0 ? ` (${formatUsd(feeNow)})` : ""} of
                        the total is charged. After that, {AFTER_WINDOW_PERCENT}%.
                      </>
                    ) : (
                      <>
                        The first 24 hours after booking have passed, so a cancellation is charged{" "}
                        <strong>{AFTER_WINDOW_PERCENT}%</strong>{feeNow > 0 ? ` (${formatUsd(feeNow)})` : ""} of
                        the total.
                      </>
                    )}
                  </p>
                </div>

                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                    Cancellation policy
                  </p>
                  <ul className="space-y-1 text-xs leading-relaxed">
                    {POLICY_LINES.map((line) => <li key={line}>· {line}</li>)}
                  </ul>
                </div>

                {/* A mailto link does nothing on a computer with no mail app set
                    up, so the address is always there to copy by hand. */}
                <p className="text-xs text-muted-foreground">
                  No email app? Write to{" "}
                  <span className="font-medium text-foreground">{CANCELLATION_EMAIL}</span>{" "}
                  <button type="button" onClick={copyAddress}
                    className="inline-flex items-center gap-1 underline underline-offset-2 text-foreground">
                    <Copy className="h-3 w-3" /> Copy
                  </button>
                  {" "}and quote reservation <span className="font-medium text-foreground">{reservationCode(booking.id)}</span>.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep appointment</AlertDialogCancel>
            <AlertDialogAction asChild>
              <a href={mailto}>
                <Mail className="h-4 w-4 mr-2" />
                Write cancellation email
              </a>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
