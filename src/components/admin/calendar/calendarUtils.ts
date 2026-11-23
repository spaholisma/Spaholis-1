export interface CalendarBooking {
  id: string;
  /** Optional custom calendar label; null falls back to "guest — service". */
  title: string | null;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  booking_date: string;
  booking_time: string;
  status: string;
  total_price: number | null;
  notes: string | null;
  service_id: string | null;
  service_title: string | null;
  service_category: string | null;
  service_type: string | null;
  duration_minutes: number;
  intake_form: any;
  card_authorization: any;
  staff_id: string | null;
  room_id: string | null;
  payment_id: string | null;
  /** Free-text off-site place (hotel, villa, address); shown when no room. */
  offsite_location: string | null;
  /** When true, this booking hides ALL website availability during its time. */
  blocks_availability: boolean;
  /** Internal sub-calendar (calendar_groups id) that colors this booking. */
  group_id: string | null;
}

export function getStatusColor(status: string): string {
  switch (status) {
    case "paid": return "bg-emerald-500";
    case "confirmed": return "bg-sky-500";
    case "completed": return "bg-green-700";
    case "cancelled": return "bg-rose-400";
    default: return "bg-amber-500";
  }
}

export function getStatusBorder(status: string): string {
  switch (status) {
    case "paid": return "border-l-emerald-500";
    case "confirmed": return "border-l-sky-500";
    case "completed": return "border-l-green-700";
    case "cancelled": return "border-l-rose-400";
    default: return "border-l-amber-500";
  }
}

export function bookingToPosition(booking: CalendarBooking, hourStart: number) {
  const [h, m] = booking.booking_time.split(":").map(Number);
  const topMinutes = (h - hourStart) * 60 + m;
  const heightMinutes = booking.duration_minutes || 60;
  return { top: topMinutes, height: heightMinutes };
}

/**
 * "Cobrar" as typed: "262", "$262", "1,262.50". Empty → null; anything that
 * isn't an amount → undefined (so the form can say so instead of guessing).
 */
export function parseCharge(raw: string): number | null | undefined {
  const t = String(raw ?? "").replace(/[$\s,]/g, "");
  if (!t) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return undefined;
  return Number(t);
}
