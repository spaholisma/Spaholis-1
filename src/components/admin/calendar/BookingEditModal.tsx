import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarDays, ClipboardList, Pencil, Trash2, CreditCard, Eye, EyeOff, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { CalendarBooking } from "./calendarUtils";
import { bodyZoneNames, bodyZoneExtraLabel } from "@/components/booking/BodyZoneSelector";
import { spaLocalToInstant } from "@/lib/businessHours";

type CardOnFile = { card_brand: string | null; card_last4: string | null; card_expiry: string | null; cardholder_name: string | null };

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

function IntakePerson({ p, title }: { p: any; title?: string }) {
  if (!p || typeof p !== "object") return null;
  const rows = PERSON_FIELDS.filter(([k]) => isMeaningful(p[k]));
  const contact = [p.emergency_contact_name, p.emergency_contact_phone].filter(Boolean).join(" · ");
  const nothing = rows.length === 0 && !p.pregnancy && !p.blood_pressure_issues && !contact;
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
    duration: "",
  });
  const [saving, setSaving] = useState(false);
  const [rooms, setRooms] = useState<{ id: string; name: string; forbidden_categories: string[] }[]>([]);
  useEffect(() => {
    supabase.from("rooms").select("id, name, forbidden_categories").eq("is_active", true).order("name")
      .then(({ data }) => setRooms((data as any[])?.map((r) => ({ ...r, forbidden_categories: r.forbidden_categories ?? [] })) ?? []));
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
  const [revealed, setRevealed] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);

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
        duration: String(booking.duration_minutes || 60),
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
    setSaving(true);
    const selectedService = services.find((s) => s.id === form.service_id);
    // Keep the timestamptz slot in sync with the edited date/time/duration, so
    // website availability and the calendar reflect a reschedule correctly.
    let start_time: string | null = null;
    let end_time: string | null = null;
    const dur = parseInt(form.duration) || booking.duration_minutes || 60;
    if (form.booking_date && form.booking_time) {
      const [y, m, d] = form.booking_date.split("-").map(Number);
      const [hh, mm] = form.booking_time.split(":").map(Number);
      const start = spaLocalToInstant(y, m - 1, d, hh, mm);
      start_time = start.toISOString();
      end_time = new Date(start.getTime() + dur * 60000).toISOString();
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
        start_time,
        end_time,
      })
      .eq("id", booking.id);
    setSaving(false);
    if (error) {
      toast.error(error.message || "Failed to update booking");
    } else {
      toast.success("Booking updated");
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
    if (!booking || !confirm("Delete this booking permanently?")) return;
    const { error } = await supabase.from("bookings").delete().eq("id", booking.id);
    if (error) {
      toast.error("Failed to delete");
    } else {
      toast.success("Booking deleted");
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
          <Tabs defaultValue="details" className="w-full">
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="details" className="text-xs gap-1"><CalendarDays className="h-3 w-3" /> Details</TabsTrigger>
              <TabsTrigger value="intake" className="text-xs gap-1"><ClipboardList className="h-3 w-3" /> Intake / Notes</TabsTrigger>
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
                  <Label className="text-xs">Time</Label>
                  <Input type="time" value={form.booking_time} onChange={(e) => update("booking_time", e.target.value)} className="h-9 text-sm" />
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
                  <Label className="text-xs">Duration (min)</Label>
                  <Input type="number" min={15} step={15} value={form.duration} onChange={(e) => update("duration", e.target.value)} className="h-9 text-sm" />
                </div>
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
              <div className="space-y-1.5">
                <Label className="text-xs">Internal Notes</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => update("notes", e.target.value)}
                  placeholder="Add internal notes about this booking..."
                  className="min-h-[120px] text-sm"
                />
              </div>
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
            </TabsContent>
          </Tabs>
        </ScrollArea>
        <DialogFooter className="flex items-center justify-between gap-2">
          <div className="flex gap-2">
            <Button variant="destructive" size="sm" onClick={handleDelete} className="gap-1">
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDuplicate} disabled={saving} className="gap-1" title="Create a copy for the same guest">
              <Copy className="h-3.5 w-3.5" /> Duplicate
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
