import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarDays, ClipboardList, Pencil, Trash2, CreditCard, Eye, EyeOff, Copy, Ban } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { CalendarBooking } from "./calendarUtils";
import { bodyZoneNames, bodyZoneExtraLabel } from "@/components/booking/BodyZoneSelector";
import { spaLocalToInstant, spaLocalParts } from "@/lib/businessHours";
// Two decimals, like the cancellation email reception will get: $65.50, not $66.
import { formatUsd } from "@/lib/currency";
import { appointmentStart, cancellationFee, cancellationWindow } from "@/lib/cancellationPolicy";

/** A datetime-local value ("YYYY-MM-DDTHH:mm") in Costa Rica time, whatever
 *  the browser's own timezone — and back. */
const toSpaInput = (d: Date) => {
  const p = spaLocalParts(d);
  return `${p.year}-${String(p.month0 + 1).padStart(2, "0")}-${String(p.day).padStart(2, "0")}T${p.hhmm}`;
};
const fromSpaInput = (v: string): Date | null => {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m ? spaLocalToInstant(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null;
};

const spaDateTime = (iso: string | Date) =>
  new Date(iso).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZone: "America/Costa_Rica",
  });

type CardOnFile = { card_brand: string | null; card_last4: string | null; card_expiry: string | null; cardholder_name: string | null };

/** "HH:MM" + minutes → "HH:MM" (same day, clamped). */
function addMinutesHHMM(hhmm: string, mins: number): string {
  const [h, m] = (hhmm || "09:00").split(":").map(Number);
  const total = (h || 0) * 60 + (m || 0) + (mins || 0);
  const hh = Math.floor(total / 60) % 24;
  const mm = ((total % 60) + 60) % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** Minutes between two "HH:MM" (same day). */
function minutesBetween(startHHMM: string, endHHMM: string): number {
  const [sh, sm] = (startHHMM || "0:0").split(":").map(Number);
  const [eh, em] = (endHHMM || "0:0").split(":").map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

// ---- Readable intake-form rendering (named body areas, not raw ids) ----
const INTAKE_MEANINGLESS = new Set(["", "none", "nothing", "n/a", "na"]);
const isMeaningful = (v: unknown) =>
  typeof v === "string" && !INTAKE_MEANINGLESS.has(v.trim().toLowerCase());

const PERSON_FIELDS: [string, string][] = [
  ["allergies", "Allergies"],
  ["medications", "Medications"],
  ["health_conditions", "Health conditions"],
  ["recent_surgeries", "Recent surgeries"],
  ["skin_conditions", "Skin conditions"],
  ["additional_notes", "Notes"],
];

function IntakeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-xs">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-foreground text-right">{value}</span>
    </div>
  );
}

const prettifyKey = (k: string) => k.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());

function IntakePerson({ p, title }: { p: any; title?: string }) {
  if (!p || typeof p !== "object") return null;
  const rows = PERSON_FIELDS.filter(([k]) => isMeaningful(p[k]));
  const contact = [p.emergency_contact_name, p.emergency_contact_phone].filter(Boolean).join(" · ");
  // Admin-defined extra questions are stored under `custom`.
  const customRows =
    p.custom && typeof p.custom === "object"
      ? Object.entries(p.custom).filter(([, v]) => v === true || isMeaningful(v))
      : [];
  const nothing = rows.length === 0 && !p.pregnancy && !p.blood_pressure_issues && !contact && customRows.length === 0;
  return (
    <div className="space-y-1">
      {title && (
        <p className="text-xs font-semibold text-foreground">
          {title}{p.guest_name ? ` — ${p.guest_name}` : ""}
        </p>
      )}
      {p.pregnancy && <IntakeRow label="Pregnancy" value="Yes" />}
      {p.blood_pressure_issues && <IntakeRow label="Blood pressure issues" value="Yes" />}
      {rows.map(([k, l]) => <IntakeRow key={k} label={l} value={String(p[k])} />)}
      {customRows.map(([k, v]) => <IntakeRow key={k} label={prettifyKey(k)} value={v === true ? "Yes" : String(v)} />)}
      {contact && <IntakeRow label="Emergency contact" value={contact} />}
      {nothing && <p className="text-xs text-muted-foreground">No health notes provided.</p>}
    </div>
  );
}

function IntakeView({ intake, category, serviceTitle }: { intake: any; category: string | null; serviceTitle: string | null }) {
  if (!intake || typeof intake !== "object") return null;
  const zones = bodyZoneNames(category, serviceTitle, intake.body_zones);
  const extras: Record<string, boolean> = intake.body_zone_extras || {};
  const activeExtras = Object.entries(extras).filter(([, v]) => v);
  return (
    <div className="border border-border rounded-lg p-3 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Intake form</p>
      {zones.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-foreground mb-1">Focus areas</p>
          <div className="flex flex-wrap gap-1">
            {zones.map((z, i) => (
              <span key={i} className="rounded-full bg-spa-sage/15 text-spa-sage text-[11px] px-2 py-0.5">{z}</span>
            ))}
          </div>
        </div>
      )}
      {activeExtras.map(([k]) => (
        <IntakeRow key={k} label={bodyZoneExtraLabel(category, serviceTitle, k)} value="Yes" />
      ))}
      {intake.is_couples ? (
        <>
          <IntakePerson p={intake.person1} title="Person 1" />
          <IntakePerson p={intake.person2} title="Person 2" />
        </>
      ) : (
        <IntakePerson p={intake} />
      )}
    </div>
  );
}

interface BookingEditModalProps {
  booking: CalendarBooking | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  services: { id: string; title: string; category: string; type: string | null; duration_minutes: number; price: number }[];
  /** Called with the new booking's id after Duplicate, so the caller can open it. */
  onDuplicated?: (newBookingId: string) => void;
}

export function BookingEditModal({ booking, open, onOpenChange, onSaved, services, onDuplicated }: BookingEditModalProps) {
  const [form, setForm] = useState({
    title: "",
    guest_name: "",
    guest_email: "",
    guest_phone: "",
    booking_date: "",
    booking_time: "",
    service_id: "",
    status: "pending",
    notes: "",
    total_price: "",
    room_id: "",
    end_time: "",
    offsite_location: "",
    blocks_availability: false,
    group_id: "",
  });
  const [saving, setSaving] = useState(false);
  const [rooms, setRooms] = useState<{ id: string; name: string; forbidden_categories: string[] }[]>([]);
  // Internal sub-calendars (groups) — assigning one colors the booking.
  const [groups, setGroups] = useState<{ id: string; name: string; color: string }[]>([]);
  useEffect(() => {
    supabase.from("rooms").select("id, name, forbidden_categories").eq("is_active", true).order("name")
      .then(({ data }) => setRooms((data as any[])?.map((r) => ({ ...r, forbidden_categories: r.forbidden_categories ?? [] })) ?? []));
    supabase.from("calendar_groups").select("id, name, color").order("sort_order")
      .then(({ data }) => setGroups((data as any[]) ?? []));
  }, []);
  // A room can't host some service categories (e.g. Room 1 has no shower, so no
  // body wraps/facials). Match the availability + create-booking rule: compare
  // the selected service's category (lowercased) against the room's list.
  const selectedCategory = (services.find((s) => s.id === form.service_id)?.category ?? "").toLowerCase();
  const roomForbidden = (r: { forbidden_categories: string[] }) =>
    !!selectedCategory && r.forbidden_categories.map((c) => c.toLowerCase()).includes(selectedCategory);
  // Card on file — masked by default; the full number is fetched on demand
  // through an admin-only, audited RPC.
  const [card, setCard] = useState<CardOnFile | null>(null);
  // The fee depends on when the guest's cancellation request arrived, measured
  // against the appointment: more than 48 hours before it is 50%, inside those
  // 48 hours 100%. Reception may process a request later than it came in, so
  // they give the time it arrived and the fee is computed from that — then
  // they can still change it (a cancellation on our side, say).
  const [timing, setTiming] = useState<{
    created_at: string;
    start_time: string | null;
    notification_sent_at: string | null;
    cancelled_at: string | null;
    cancellation_fee_percent: number | null;
    cancellation_requested_at: string | null;
  } | null>(null);
  const [feePercent, setFeePercent] = useState<string>("");
  // Set once reception picks a fee by hand; until then it follows the policy.
  const [feeTouched, setFeeTouched] = useState(false);
  const [requestedAt, setRequestedAt] = useState<string>("");
  const [tab, setTab] = useState("details");
  const cancelPanelRef = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);

  useEffect(() => {
    setTiming(null);
    setFeePercent("");
    setFeeTouched(false);
    setRequestedAt("");
    setTab("details");
    if (!booking) return;
    // The calendar loads bookings through several different queries; asking
    // for these few columns here keeps every one of them working unchanged.
    supabase
      .from("bookings")
      .select("created_at, start_time, notification_sent_at, cancelled_at, cancellation_fee_percent, cancellation_requested_at" as any)
      .eq("id", booking.id)
      .maybeSingle()
      .then(({ data }) => {
        const t = (data as any) ?? null;
        setTiming(t);
        if (t?.cancellation_fee_percent != null) {
          setFeePercent(String(t.cancellation_fee_percent));
          setFeeTouched(true);
        }
        if (t?.cancellation_requested_at) setRequestedAt(toSpaInput(new Date(t.cancellation_requested_at)));
      });
  }, [booking]);

  // What the policy says for a request received at `requestedAt`.
  const startsAt = booking
    ? appointmentStart({ start_time: timing?.start_time ?? null, booking_date: booking.booking_date, booking_time: booking.booking_time })
    : null;
  const policy = startsAt ? cancellationWindow(startsAt, fromSpaInput(requestedAt) ?? new Date()) : null;
  const cancellingNow = !!booking && form.status === "cancelled" && booking.status !== "cancelled";

  // Opening a cancellation: the request time starts at now, and the fee
  // follows the policy for that time until reception picks one by hand.
  useEffect(() => {
    if (!cancellingNow) return;
    if (!requestedAt) { setRequestedAt(toSpaInput(new Date())); return; }
    if (!feeTouched && policy) setFeePercent(String(policy.percent));
  }, [cancellingNow, requestedAt, feeTouched, policy?.percent]);

  const startCancellation = () => {
    setForm((f) => ({ ...f, status: "cancelled" }));
    setTab("details");
    requestAnimationFrame(() => cancelPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  useEffect(() => {
    setCard(null);
    setRevealed(null);
    if (!booking) return;
    supabase
      .from("booking_card_authorizations")
      .select("card_brand, card_last4, card_expiry, cardholder_name")
      .eq("booking_id", booking.id)
      .maybeSingle()
      .then(({ data }) => setCard((data as CardOnFile) ?? null));
  }, [booking]);

  const revealCard = async () => {
    if (!booking) return;
    setRevealing(true);
    try {
      const { data, error } = await supabase.rpc("reveal_card_authorization", { _booking_id: booking.id });
      if (error) throw error;
      const num = (data as any)?.card_number as string | undefined;
      if (!num) { toast.error("No card on file"); return; }
      setRevealed(num);
    } catch (e: any) {
      toast.error(e.message ?? "Could not reveal card");
    } finally {
      setRevealing(false);
    }
  };

  useEffect(() => {
    if (booking) {
      setForm({
        title: booking.title || "",
        guest_name: booking.guest_name || "",
        guest_email: booking.guest_email || "",
        guest_phone: booking.guest_phone || "",
        booking_date: booking.booking_date,
        booking_time: booking.booking_time?.slice(0, 5) || "",
        service_id: booking.service_id || "",
        status: booking.status,
        notes: booking.notes || "",
        total_price: booking.total_price?.toString() || "",
        room_id: booking.room_id || "",
        // Shown as an end-time picker; derived from start + the service length.
        end_time: addMinutesHHMM(booking.booking_time?.slice(0, 5) || "09:00", booking.duration_minutes || 60),
        offsite_location: booking.offsite_location || "",
        blocks_availability: booking.blocks_availability ?? false,
        group_id: booking.group_id || "",
      });
    }
  }, [booking]);

  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function handleSave() {
    if (!booking) return;
    // Guard: never save a booking into a room that can't host its service
    // category (e.g. a body wrap in a room with no shower).
    const chosenRoom = rooms.find((r) => r.id === form.room_id);
    if (chosenRoom && roomForbidden(chosenRoom)) {
      toast.error(`${chosenRoom.name} can't host this service. Please pick another room.`);
      return;
    }
    if (form.booking_time && form.end_time && minutesBetween(form.booking_time, form.end_time) <= 0) {
      toast.error("End time must be after the start time.");
      return;
    }
    const cancelling = form.status === "cancelled" && booking.status !== "cancelled";
    if (cancelling && feePercent === "") {
      toast.error("Choose the cancellation fee: 50%, 100% or no charge.");
      return;
    }
    const requestInstant = fromSpaInput(requestedAt);
    if (cancelling && (!requestInstant || requestInstant.getTime() > Date.now() + 5 * 60_000)) {
      toast.error("Enter when the cancellation request was received — it cannot be in the future.");
      return;
    }
    setSaving(true);
    const selectedService = services.find((s) => s.id === form.service_id);
    // Keep the timestamptz slot in sync with the edited start/end times, so
    // website availability and the calendar reflect a reschedule correctly.
    let start_time: string | null = null;
    let end_time: string | null = null;
    if (form.booking_date && form.booking_time && form.end_time) {
      const [y, m, d] = form.booking_date.split("-").map(Number);
      const [sh, sm] = form.booking_time.split(":").map(Number);
      const [eh, em] = form.end_time.split(":").map(Number);
      start_time = spaLocalToInstant(y, m - 1, d, sh, sm).toISOString();
      end_time = spaLocalToInstant(y, m - 1, d, eh, em).toISOString();
    }
    const { error } = await supabase
      .from("bookings")
      .update({
        title: form.title.trim() || null,
        guest_name: form.guest_name || null,
        guest_email: form.guest_email || null,
        guest_phone: form.guest_phone || null,
        booking_date: form.booking_date,
        booking_time: form.booking_time + ":00",
        service_id: form.service_id || null,
        status: form.status,
        notes: form.notes || null,
        total_price: form.total_price ? parseFloat(form.total_price) : selectedService?.price || null,
        room_id: form.room_id || null,
        // Off-site place only applies when there's no room; block flag lets a
        // booking hide all website availability during its time.
        offsite_location: form.room_id ? null : (form.offsite_location.trim() || null),
        blocks_availability: form.blocks_availability,
        group_id: form.group_id || null,
        start_time,
        end_time,
        // Saved with the status change, so the cancellation email the database
        // sends on that change already knows what to tell the guest. (Cast: the
        // generated types predate the column.)
        ...(form.status === "cancelled" && feePercent !== ""
          ? ({
              cancellation_fee_percent: Number(feePercent),
              ...(requestInstant ? { cancellation_requested_at: requestInstant.toISOString() } : {}),
            } as any)
          : {}),
      })
      .eq("id", booking.id);
    setSaving(false);
    if (error) {
      toast.error(error.message || "Failed to update booking");
    } else {
      toast.success(cancelling ? "Appointment cancelled — the cancellation emails are on their way." : "Booking updated");
      onOpenChange(false);
      onSaved();
    }
  }

  async function handleDuplicate() {
    if (!booking) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("duplicate_booking", { _booking_id: booking.id });
      if (error) throw error;
      const newId = data as string;
      toast.success("Booking duplicated — set the new date, time and room.");
      onOpenChange(false);
      onSaved();
      if (newId && onDuplicated) onDuplicated(newId);
    } catch (e: any) {
      toast.error(e.message ?? "Could not duplicate booking");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!booking || !confirm("Move this booking to the trash? You can restore it within 30 days.")) return;
    // Soft delete: snapshots the booking (and its card) into the 30-day trash,
    // then removes it — so it can be restored from the Trash tab.
    const { error } = await supabase.rpc("soft_delete_booking" as any, { _booking_id: booking.id });
    if (error) {
      toast.error(error.message || "Failed to delete");
    } else {
      toast.success("Moved to trash — restorable for 30 days");
      onOpenChange(false);
      onSaved();
    }
  }

  if (!booking) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <Pencil className="h-4 w-4" /> Edit Booking
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-3">
          <Tabs value={tab} onValueChange={setTab} className="w-full">
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="details" className="text-xs gap-1"><CalendarDays className="h-3 w-3" /> Details</TabsTrigger>
              <TabsTrigger value="intake" className="text-xs gap-1"><ClipboardList className="h-3 w-3" /> Intake form</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-3 mt-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Title <span className="text-muted-foreground">(optional — shown on the calendar)</span></Label>
                <Input
                  value={form.title}
                  onChange={(e) => update("title", e.target.value)}
                  placeholder={booking?.guest_name && booking?.service_title ? `${booking.guest_name} — ${booking.service_title}` : "Custom calendar label"}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Description / Notes <span className="text-muted-foreground">(internal)</span></Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => update("notes", e.target.value)}
                  placeholder="Add descriptive text about this booking…"
                  className="min-h-[64px] text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Client Name</Label>
                  <Input value={form.guest_name} onChange={(e) => update("guest_name", e.target.value)} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Email</Label>
                  <Input value={form.guest_email} onChange={(e) => update("guest_email", e.target.value)} className="h-9 text-sm" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Phone</Label>
                <Input value={form.guest_phone} onChange={(e) => update("guest_phone", e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Service</Label>
                <Select value={form.service_id} onValueChange={(v) => update("service_id", v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select service" /></SelectTrigger>
                  <SelectContent>
                    {services.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Date</Label>
                  <Input type="date" value={form.booking_date} onChange={(e) => update("booking_date", e.target.value)} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Start time</Label>
                  <Input
                    type="time"
                    value={form.booking_time}
                    onChange={(e) => {
                      const newStart = e.target.value;
                      // Drag the end along so the appointment keeps its length.
                      setForm((f) => {
                        const dur = minutesBetween(f.booking_time, f.end_time);
                        return { ...f, booking_time: newStart, end_time: dur > 0 ? addMinutesHHMM(newStart, dur) : f.end_time };
                      });
                    }}
                    className="h-9 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Status</Label>
                  <Select value={form.status} onValueChange={(v) => update("status", v)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["pending", "confirmed", "paid", "completed", "cancelled"].map((s) => (
                        <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Price ($)</Label>
                  <Input type="number" value={form.total_price} onChange={(e) => update("total_price", e.target.value)} className="h-9 text-sm" />
                </div>
              </div>
              {form.status === "cancelled" && booking && (() => {
                const total = form.total_price ? parseFloat(form.total_price) : booking.total_price;
                const already = booking.status === "cancelled";
                // Mirrors the database trigger: the team hears about every real
                // booking; the guest only if they were emailed a confirmation.
                const emailsTeam = ["confirmed", "paid"].includes(booking.status) || !!timing?.notification_sent_at;
                const emailsGuest = !!timing?.notification_sent_at && !!form.guest_email;
                const overridden = !!policy && feePercent !== "" && Number(feePercent) !== policy.percent;
                return (
                  <div ref={cancelPanelRef} className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2.5">
                    <p className="text-xs font-semibold text-foreground">{already ? "Cancelled" : "Cancel this appointment"}</p>
                    {timing && startsAt && policy ? (
                      <div className="text-xs text-muted-foreground leading-relaxed space-y-0.5">
                        <p>Booked on <strong className="text-foreground">{spaDateTime(timing.created_at)}</strong></p>
                        <p>Appointment <strong className="text-foreground">{spaDateTime(startsAt)}</strong></p>
                        <p>
                          48-hour mark <strong className="text-foreground">{spaDateTime(policy.fullChargeFrom)}</strong>
                          {" "}— a request received before it is 50%, from it on 100%.
                        </p>
                        {already && timing.cancellation_requested_at && (
                          <p>Request received {spaDateTime(timing.cancellation_requested_at)}</p>
                        )}
                        {already && timing.cancelled_at && <p>Cancelled on {spaDateTime(timing.cancelled_at)}</p>}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Loading booking times…</p>
                    )}
                    {!already && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">Cancellation request received (Costa Rica time) *</Label>
                        <Input
                          type="datetime-local"
                          value={requestedAt}
                          onChange={(e) => setRequestedAt(e.target.value)}
                          className="h-9 text-sm"
                        />
                        <p className="text-[11px] text-muted-foreground">
                          When the guest's email or message reached you. Leave it as now if they are cancelling right now.
                        </p>
                      </div>
                    )}
                    {!already && policy && (
                      <p className="text-xs text-foreground">
                        {policy.withinWindow
                          ? <>Received within the 48 hours before the appointment → policy: <strong>100% ({formatUsd(cancellationFee(total, 100))})</strong></>
                          : <>Received more than 48 hours before the appointment → policy: <strong>50% ({formatUsd(cancellationFee(total, 50))})</strong></>}
                      </p>
                    )}
                    <div className="space-y-1.5">
                      <Label className="text-xs">Cancellation fee {already ? "" : "*"}</Label>
                      <Select value={feePercent} onValueChange={(v) => { setFeePercent(v); setFeeTouched(true); }}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Choose the fee" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="50">50% — {formatUsd(cancellationFee(total, 50))}</SelectItem>
                          <SelectItem value="100">100% — {formatUsd(cancellationFee(total, 100))}</SelectItem>
                          <SelectItem value="0">No charge</SelectItem>
                        </SelectContent>
                      </Select>
                      {!already && overridden && (
                        <p className="text-[11px] text-amber-700 leading-relaxed">
                          This is not what the policy gives ({policy!.percent}%). Fine if the cancellation is on our side
                          or you agreed otherwise with the guest.{" "}
                          <button type="button" className="underline underline-offset-2" onClick={() => setFeeTouched(false)}>
                            Use the policy
                          </button>
                        </p>
                      )}
                      {already && (
                        <p className="text-[11px] text-muted-foreground">Changing the fee now does not send a new email.</p>
                      )}
                    </div>
                    {!already && (
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        {emailsTeam
                          ? <>Confirming emails the cancellation {emailsGuest ? "to the guest and " : ""}to the team{!emailsGuest && " (the guest never received a confirmation email, so they are not emailed)"}.</>
                          : <>No email is sent for this booking — it was never confirmed.</>}
                        {" "}To remove a duplicate or test booking without emailing anyone, use Delete instead.
                      </p>
                    )}
                  </div>
                );
              })()}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Room</Label>
                  <Select value={form.room_id || "none"} onValueChange={(v) => update("room_id", v === "none" ? "" : v)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="No room" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No room / off-site</SelectItem>
                      {rooms.map((r) => {
                        const forbidden = roomForbidden(r);
                        return (
                          <SelectItem key={r.id} value={r.id} disabled={forbidden}>
                            {r.name}{forbidden ? " — not suitable for this service" : ""}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {form.room_id && roomForbidden(rooms.find((r) => r.id === form.room_id) ?? { forbidden_categories: [] }) && (
                    <p className="text-[11px] text-destructive">This room can't host this service (e.g. no shower). Pick another room.</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">End time</Label>
                  <Input type="time" value={form.end_time} onChange={(e) => update("end_time", e.target.value)} className="h-9 text-sm" />
                  {form.booking_time && form.end_time && (
                    minutesBetween(form.booking_time, form.end_time) > 0
                      ? <p className="text-[11px] text-muted-foreground">{minutesBetween(form.booking_time, form.end_time)} min</p>
                      : <p className="text-[11px] text-destructive">End must be after start</p>
                  )}
                </div>
              </div>

              {/* Off-site place only makes sense with no room (at-your-location visits). */}
              {!form.room_id && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Off-site location <span className="text-muted-foreground">(where — hotel, villa, address)</span></Label>
                  <Input value={form.offsite_location} onChange={(e) => update("offsite_location", e.target.value)} placeholder="e.g. Tree House · Villa Grace, La Reserva…" className="h-9 text-sm" />
                </div>
              )}

              <label className="flex items-start gap-2 cursor-pointer rounded-md border border-amber-300/60 bg-amber-50/60 px-3 py-2">
                <Checkbox
                  className="mt-0.5"
                  checked={form.blocks_availability}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, blocks_availability: v === true }))}
                />
                <span className="text-xs">
                  Block website availability during this booking
                  <span className="block text-[11px] text-muted-foreground">
                    No online slots offered while this runs (e.g. an off-site event tying up the team). WhatsApp &amp; at-your-location requests stay open.
                  </span>
                </span>
              </label>

              <div className="space-y-1.5">
                <Label className="text-xs">Sub-calendar <span className="text-muted-foreground">(sets the color on the calendar)</span></Label>
                <Select value={form.group_id || "none"} onValueChange={(v) => update("group_id", v === "none" ? "" : v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Color by status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Default (color by status)</SelectItem>
                    {groups.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        <span className="inline-flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                          {g.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {card && (
                <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                    <CreditCard className="h-3.5 w-3.5" /> Card on file
                  </div>
                  <p className="text-sm font-mono text-foreground">
                    {revealed
                      ? revealed.replace(/(.{4})/g, "$1 ").trim()
                      : `${card.card_brand ?? "Card"} •••• ${card.card_last4 ?? "----"}`}
                    <span className="ml-2 text-xs font-body text-muted-foreground">exp {card.card_expiry}</span>
                  </p>
                  {card.cardholder_name && (
                    <p className="text-xs text-muted-foreground">{card.cardholder_name}</p>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => (revealed ? setRevealed(null) : revealCard())}
                    disabled={revealing}
                  >
                    {revealed ? (<><EyeOff className="h-3 w-3 mr-1" /> Hide</>) : (<><Eye className="h-3 w-3 mr-1" /> {revealing ? "Revealing…" : "Reveal card"}</>)}
                  </Button>
                  <p className="text-[10px] text-muted-foreground">Charge via your terminal per the cancellation policy. Revealing is logged. CVV is never stored.</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="intake" className="space-y-3 mt-4">
              {/* Editable notes now live on the Details tab (Description / Notes). */}
              {booking.intake_form && (
                <IntakeView
                  intake={booking.intake_form}
                  category={booking.service_category}
                  serviceTitle={booking.service_title}
                />
              )}
              {booking.payment_id && (
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium">Payment ID:</span> <code>{booking.payment_id}</code>
                </div>
              )}
              {!booking.intake_form && !booking.payment_id && (
                <p className="text-xs text-muted-foreground py-2">No intake form on file. (Notes are on the Details tab.)</p>
              )}
            </TabsContent>
          </Tabs>
        </ScrollArea>
        <DialogFooter className="flex-row sm:flex-row flex-wrap items-center justify-between gap-2 sm:space-x-0 border-t border-border pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="destructive" size="sm" onClick={handleDelete} className="gap-1">
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDuplicate} disabled={saving} className="gap-1" title="Create a copy for the same guest">
              <Copy className="h-3.5 w-3.5" /> Duplicate
            </Button>
            {booking && booking.status !== "cancelled" && form.status !== "cancelled" && (
              <Button variant="outline" size="sm" onClick={startCancellation} disabled={saving}
                className="gap-1 border-destructive/40 text-destructive hover:bg-destructive/5 hover:text-destructive">
                <Ban className="h-3.5 w-3.5" /> Cancel appointment
              </Button>
            )}
          </div>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}
              className={cancellingNow ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}>
              {saving ? "Saving..." : cancellingNow ? "Confirm cancellation" : "Save Changes"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
