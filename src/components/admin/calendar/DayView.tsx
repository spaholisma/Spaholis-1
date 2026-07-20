import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { CalendarBooking } from "./calendarUtils";
import { getStatusColor, getStatusBorder } from "./calendarUtils";

interface DayViewProps {
  date: Date;
  bookings: CalendarBooking[];
  onBookingClick: (booking: CalendarBooking) => void;
  onSlotClick: (date: string, time: string) => void;
}

const HOUR_START = 7;
const HOUR_END = 21;
const PX_PER_MIN = 1.2;

export function DayView({ date, bookings, onBookingClick, onSlotClick }: DayViewProps) {
  const dateStr = format(date, "yyyy-MM-dd");
  const dayBookings = bookings
    .filter((b) => b.booking_date === dateStr)
    .sort((a, b) => a.booking_time.localeCompare(b.booking_time));

  const hours = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      <div className="bg-muted/50 px-4 py-2 border-b border-border">
        <p className="text-sm font-heading font-medium">{format(date, "EEEE, MMMM d")}</p>
      </div>

      {/* Desktop: Timeline grid (original) — hidden on mobile */}
      <div className="hidden md:block">
        <div className="relative" style={{ height: (HOUR_END - HOUR_START) * 60 * PX_PER_MIN }}>
          {hours.map((hour) => (
            <div
              key={hour}
              className="absolute left-0 right-0 border-b border-border/50 cursor-pointer hover:bg-muted/20 transition-colors"
              style={{ top: (hour - HOUR_START) * 60 * PX_PER_MIN, height: 60 * PX_PER_MIN }}
              onClick={() => onSlotClick(dateStr, `${String(hour).padStart(2, "0")}:00`)}
            >
              <span className="absolute left-2 top-0.5 text-[10px] text-muted-foreground font-body">
                {format(new Date(2000, 0, 1, hour), "h a")}
              </span>
            </div>
          ))}

          {dayBookings.map((b) => {
            const [h, m] = b.booking_time.split(":").map(Number);
            const topPx = ((h - HOUR_START) * 60 + m) * PX_PER_MIN;
            const heightPx = Math.max((b.duration_minutes || 60) * PX_PER_MIN, 24);
            return (
              <div
                key={b.id}
                className={cn(
                  "absolute left-16 right-4 rounded-md border-l-[3px] px-2 py-1 cursor-pointer shadow-sm hover:shadow-md transition-shadow overflow-hidden bg-card",
                  getStatusBorder(b.status)
                )}
                style={{ top: topPx, height: heightPx, zIndex: 10 }}
                onClick={(e) => { e.stopPropagation(); onBookingClick(b); }}
              >
                <p className="text-xs font-body font-medium text-foreground truncate leading-tight">
                  {b.guest_name || "Guest"}
                </p>
                {heightPx > 30 && (
                  <p className="text-[10px] text-muted-foreground truncate">
                    {b.service_title || "Service"} · {b.booking_time?.slice(0, 5)}
                  </p>
                )}
                <span className={cn("absolute top-1 right-1 w-2 h-2 rounded-full", getStatusColor(b.status))} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile: List view (like Google Calendar) */}
      <div className="md:hidden">
        {dayBookings.length === 0 ? (
          <div className="px-4 py-8 text-center text-muted-foreground">
            <p className="text-sm">No bookings this day</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {dayBookings.map((b) => (
              <div
                key={b.id}
                className={cn(
                  "p-4 cursor-pointer hover:bg-muted/50 transition-colors border-l-4",
                  getStatusBorder(b.status)
                )}
                onClick={() => onBookingClick(b)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground">
                      {b.booking_time?.slice(0, 5)} – {b.end_time ? format(new Date(`2000-01-01T${b.end_time}`), "h:mm a") : ""}
                    </p>
                    <p className="text-sm font-body font-semibold text-foreground mt-1">
                      {b.guest_name || "Guest"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {b.service_title || "Service"}
                    </p>
                  </div>
                  <span className={cn("w-3 h-3 rounded-full flex-shrink-0 mt-1", getStatusColor(b.status))} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
