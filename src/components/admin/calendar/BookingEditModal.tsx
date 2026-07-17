import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarDays, ClipboardList, Pencil, Trash2, CreditCard, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { CalendarBooking } from "./calendarUtils";

type CardOnFile = { card_brand: string | null; card_last4: string | null; card_expiry: string | null; cardholder_name: string | null };

interface BookingEditModalProps {
  booking: CalendarBooking | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  services: { id: string; title: string; category: string; type: string | null; duration_minutes: number; price: number }[];
}

export function BookingEditModal({ booking, open, onOpenChange, onSaved, services }: BookingEditModalProps) {
  const [form, setForm] = useState({
    guest_name: "",
    guest_email: "",
    guest_phone: "",
    booking_date: "",
    booking_time: "",
    service_id: "",
    status: "pending",
    notes: "",
    total_price: "",
  });
  const [saving, setSaving] = useState(false);
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
        guest_name: booking.guest_name || "",
        guest_email: booking.guest_email || "",
        guest_phone: booking.guest_phone || "",
        booking_date: booking.booking_date,
        booking_time: booking.booking_time?.slice(0, 5) || "",
        service_id: booking.service_id || "",
        status: booking.status,
        notes: booking.notes || "",
        total_price: booking.total_price?.toString() || "",
      });
    }
  }, [booking]);

  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function handleSave() {
    if (!booking) return;
    setSaving(true);
    const selectedService = services.find((s) => s.id === form.service_id);
    const { error } = await supabase
      .from("bookings")
      .update({
        guest_name: form.guest_name || null,
        guest_email: form.guest_email || null,
        guest_phone: form.guest_phone || null,
        booking_date: form.booking_date,
        booking_time: form.booking_time + ":00",
        service_id: form.service_id || null,
        status: form.status,
        notes: form.notes || null,
        total_price: form.total_price ? parseFloat(form.total_price) : selectedService?.price || null,
      })
      .eq("id", booking.id);
    setSaving(false);
    if (error) {
      toast.error("Failed to update booking");
    } else {
      toast.success("Booking updated");
      onOpenChange(false);
      onSaved();
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
                <div className="border border-border rounded-lg p-3 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Intake Form Data</p>
                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap">
                    {JSON.stringify(booking.intake_form, null, 2)}
                  </pre>
                </div>
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
          <Button variant="destructive" size="sm" onClick={handleDelete} className="gap-1">
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
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
