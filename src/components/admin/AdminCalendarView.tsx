import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CalendarHeader, type CalendarViewType } from "./calendar/CalendarHeader";
import { DayView } from "./calendar/DayView";
import { WeekView } from "./calendar/WeekView";
import { MonthView } from "./calendar/MonthView";
import { BookingEditModal } from "./calendar/BookingEditModal";
import { NewBookingModal } from "./calendar/NewBookingModal";
import type { CalendarBooking } from "./calendar/calendarUtils";

export function AdminCalendarView() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalendarViewType>("week");
  const [bookings, setBookings] = useState<CalendarBooking[]>([]);
  const [services, setServices] = useState<{ id: string; title: string; category: string; type: string | null; duration_minutes: number; price: number }[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<CalendarBooking | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newDefaults, setNewDefaults] = useState({ date: "", time: "" });
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const loadBookings = useCallback(async () => {
    const { data } = await supabase
      .from("bookings")
      .select("*, services(title, duration_minutes, category, type)")
      .order("booking_date", { ascending: true });
    if (!data) return;
    setBookings(
      data.map((b: any) => ({
        id: b.id,
        title: b.title ?? null,
        guest_name: b.guest_name,
        guest_email: b.guest_email,
        guest_phone: b.guest_phone,
        booking_date: b.booking_date,
        booking_time: b.booking_time,
        status: b.status,
        total_price: b.total_price,
        notes: b.notes,
        service_id: b.service_id,
        service_title: b.services?.title || null,
        service_category: b.services?.category || null,
        service_type: b.services?.type || null,
        duration_minutes: b.services?.duration_minutes ?? 60,
        intake_form: b.intake_form,
        card_authorization: b.card_authorization,
        staff_id: b.staff_id,
        room_id: b.room_id,
        payment_id: b.payment_id,
        offsite_location: b.offsite_location ?? null,
        blocks_availability: b.blocks_availability ?? false,
      }))
    );
  }, []);

  const loadServices = useCallback(async () => {
    const { data } = await supabase.from("services").select("id, title, category, type, duration_minutes, price").eq("is_active", true).order("sort_order");
    setServices(data ?? []);
  }, []);

  useEffect(() => { loadBookings(); loadServices(); }, [loadBookings, loadServices]);

  const filtered = bookings.filter((b) => {
    if (statusFilter !== "all" && b.status !== statusFilter) return false;
    if (typeFilter !== "all" && b.service_type !== typeFilter) return false;
    return true;
  });

  const handleBookingClick = (b: CalendarBooking) => {
    setSelectedBooking(b);
    setEditOpen(true);
  };

  const handleSlotClick = (date: string, time: string) => {
    setNewDefaults({ date, time });
    setNewOpen(true);
  };

  const handleDayClick = (date: Date) => {
    setCurrentDate(date);
    setView("day");
  };

  return (
    <div className="space-y-4">
      <CalendarHeader
        currentDate={currentDate}
        view={view}
        onDateChange={setCurrentDate}
        onViewChange={setView}
        onNewBooking={() => { setNewDefaults({ date: "", time: "" }); setNewOpen(true); }}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
      />

      <div className="overflow-auto">
        {view === "day" && (
          <DayView date={currentDate} bookings={filtered} onBookingClick={handleBookingClick} onSlotClick={handleSlotClick} />
        )}
        {view === "week" && (
          <WeekView date={currentDate} bookings={filtered} onBookingClick={handleBookingClick} onSlotClick={handleSlotClick} />
        )}
        {view === "month" && (
          <MonthView date={currentDate} bookings={filtered} onBookingClick={handleBookingClick} onSlotClick={handleSlotClick} onDayClick={handleDayClick} />
        )}
      </div>

      <BookingEditModal
        booking={selectedBooking}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={loadBookings}
        services={services}
        onDuplicated={async (newId) => {
          const { data } = await supabase
            .from("bookings")
            .select("*, services(title, duration_minutes, category, type)")
            .eq("id", newId)
            .maybeSingle();
          if (!data) return;
          const b: any = data;
          setSelectedBooking({
            id: b.id, title: b.title ?? null, guest_name: b.guest_name, guest_email: b.guest_email, guest_phone: b.guest_phone,
            booking_date: b.booking_date, booking_time: b.booking_time, status: b.status, total_price: b.total_price,
            notes: b.notes, service_id: b.service_id, service_title: b.services?.title ?? null,
            service_category: b.services?.category ?? null, service_type: b.services?.type ?? null,
            duration_minutes: b.services?.duration_minutes ?? 60, intake_form: b.intake_form,
            card_authorization: b.card_authorization, staff_id: b.staff_id, room_id: b.room_id, payment_id: b.payment_id,
            offsite_location: b.offsite_location ?? null, blocks_availability: b.blocks_availability ?? false,
          });
          setEditOpen(true);
        }}
      />

      <NewBookingModal
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={loadBookings}
        defaultDate={newDefaults.date}
        defaultTime={newDefaults.time}
        services={services}
      />
    </div>
  );
}
