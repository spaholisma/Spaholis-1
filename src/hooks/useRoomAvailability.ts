import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  generateSpaSlotsForCalendarDate,
  getBusinessHours,
  spaLocalParts,
  spaLocalToInstant,
} from "@/lib/businessHours";
import { useBusinessHours } from "@/hooks/useBusinessHours";
import {
  isRoomBusy,
  placeCouplesSlot,
  isCouplesTitle,
  type RoomInfo,
  type BusyInterval,
} from "@/lib/roomPlacement";

export interface TimeSlot {
  time: Date;
  label: string;
  room: { id: string; name: string };
  /** For a couples booking that occupies a paired room (3A+3B) too. */
  secondaryRoomId?: string;
}

function formatSlotLabel(d: Date): string {
  // Slot instants are UTC times whose local wall clock IS the spa wall
  // clock — render in the spa timezone so the label matches what the
  // backend will validate against, regardless of the browser's tz.
  const { hour, minute } = spaLocalParts(d);
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${hour12}:${minute.toString().padStart(2, "0")} ${suffix}`;
}

export function useRoomAvailability(
  date: Date | undefined,
  serviceCategory: string | undefined,
  durationMinutes: number | undefined,
  serviceTitle?: string,
) {
  const { data: weeklyHours } = useBusinessHours();
  return useQuery({
    queryKey: ["room-availability", date?.toISOString(), serviceCategory, durationMinutes, serviceTitle, weeklyHours],
    enabled: !!date && !!serviceCategory && !!durationMinutes && !!weeklyHours,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!date || !serviceCategory || !durationMinutes) return [];

      // 1. Get rooms
      const { data: rooms, error: roomErr } = await supabase
        .from("rooms")
        .select("*")
        .eq("is_active", true);
      if (roomErr) throw roomErr;

      // 2. Filter rooms by category rules
      const validRooms = (rooms as RoomInfo[]).filter(
        (r) => !r.forbidden_categories.includes(serviceCategory.toLowerCase())
      );

      if (validRooms.length === 0) return [];

      // 3. Get bookings for this date, using SPA-local open/close instants
      //    so we don't miss late bookings that live "on the next day" in UTC.
      const y = date.getFullYear();
      const m0 = date.getMonth();
      const d = date.getDate();
      const weekday = new Date(Date.UTC(y, m0, d)).getUTCDay();
      const bh = getBusinessHours(weekday, weeklyHours);
      if (bh.isClosed) return [];
      const dayStart = spaLocalToInstant(y, m0, d, bh.startHour, bh.startMinute);
      const dayEnd = spaLocalToInstant(y, m0, d, bh.endHour, bh.endMinute);

      const { data: bookings, error: bookErr } = await supabase
        .from("bookings")
        .select("room_id, secondary_room_id, start_time, end_time")
        .not("status", "eq", "cancelled")
        .gte("start_time", dayStart.toISOString())
        .lte("start_time", dayEnd.toISOString());
      if (bookErr) throw bookErr;

      // Internal calendar entries pinned to a room also occupy it. The RPC
      // returns only room_id + interval, never the internal title/notes.
      // Off-site entries carry no room, so they never block the spa.
      const { data: internal, error: internalErr } = await supabase.rpc(
        "get_internal_busy_intervals",
        { _from: dayStart.toISOString(), _to: dayEnd.toISOString() },
      );
      if (internalErr) throw internalErr;

      const busy: BusyInterval[] = [
        ...(bookings ?? []).map((b: any) => ({
          room_id: b.room_id,
          // A couples booking on the 3A+3B combo occupies its paired room too.
          secondary_room_id: b.secondary_room_id ?? null,
          start: new Date(b.start_time),
          end: new Date(b.end_time),
        })),
        ...(internal ?? []).map((i: any) => ({
          room_id: i.room_id,
          secondary_room_id: null,
          start: new Date(i.busy_start),
          end: new Date(i.busy_end),
        })),
      ].filter((x) => x.room_id && !isNaN(x.start.getTime()) && !isNaN(x.end.getTime()));

      // 4. Generate slots, filtering conflicts. The shared spa slot generator
      //    produces the EXACT same list the backend will accept — same tz,
      //    window, 30-min interval and same-day 15-min lead time.
      const slots = generateSpaSlotsForCalendarDate(date, durationMinutes, new Date(), weeklyHours);
      const results: TimeSlot[] = [];
      const couples = isCouplesTitle(serviceTitle);

      for (const slot of slots) {
        const slotEnd = new Date(slot.getTime() + durationMinutes * 60000);
        if (couples) {
          // Couples need Room 2, or the 3A+3B pair — one slot per time, room
          // chosen by placeCouplesSlot (prefers the solo couples room).
          const placement = placeCouplesSlot(validRooms, (roomId) => isRoomBusy(roomId, slot, slotEnd, busy));
          if (placement) {
            results.push({
              time: slot,
              label: formatSlotLabel(slot),
              room: { id: placement.roomId, name: placement.roomName },
              secondaryRoomId: placement.secondaryRoomId,
            });
          }
        } else {
          for (const room of validRooms) {
            if (!isRoomBusy(room.id, slot, slotEnd, busy)) {
              results.push({
                time: slot,
                label: formatSlotLabel(slot),
                room: { id: room.id, name: room.name },
              });
            }
          }
        }
      }

      // Sort by time, then room name
      results.sort((a, b) => a.time.getTime() - b.time.getTime() || a.room.name.localeCompare(b.room.name));
      return results;
    },
  });
}
