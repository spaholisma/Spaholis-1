// Room assignment for the booking availability engine.
//
// Most treatments take any free, category-allowed room. A COUPLES treatment
// needs a room that fits two people: a couples-capable room on its own
// (Room 2), or a paired room booked together with its partner (Room 3A + 3B).
// Room 1 can never host a couple.
//
// These are pure so the tricky parts — "a couples booking in 3A+3B blocks both
// rooms" and "prefer the solo couples room" — can be unit tested without the UI
// or the database.

export interface RoomInfo {
  id: string;
  name: string;
  forbidden_categories: string[];
  couples_capable?: boolean | null;
  /** When set, this room only forms a couples space paired with that room. */
  pairs_with_room_id?: string | null;
}

export interface BusyInterval {
  room_id: string | null;
  /** A couples booking on the 3A+3B combo occupies this room too. */
  secondary_room_id?: string | null;
  start: Date;
  end: Date;
}

export interface Placement {
  /** The primary room the booking is stored against. */
  roomId: string;
  /** Display name — "Room 3A + 3B" for a paired placement. */
  roomName: string;
  /** The second room a couples booking also occupies, if any. */
  secondaryRoomId?: string;
}

/** A room is busy if a booking's primary OR secondary room overlaps the slot. */
export function isRoomBusy(
  roomId: string,
  slotStart: Date,
  slotEnd: Date,
  busy: BusyInterval[],
): boolean {
  return busy.some(
    (b) =>
      (b.room_id === roomId || b.secondary_room_id === roomId) &&
      slotStart < b.end &&
      slotEnd > b.start,
  );
}

/**
 * Where a COUPLES treatment can go at a given slot, or null if nowhere.
 * Prefers a couples-capable room on its own; otherwise a free pair. `isBusy`
 * already encodes this slot's occupancy (see isRoomBusy).
 */
export function placeCouplesSlot(
  rooms: RoomInfo[],
  isBusy: (roomId: string) => boolean,
): Placement | null {
  // 1. A single couples-capable room (e.g. Room 2).
  const solo = rooms.find((r) => r.couples_capable && !isBusy(r.id));
  if (solo) return { roomId: solo.id, roomName: solo.name };

  // 2. A pair where BOTH rooms are free (e.g. Room 3A + 3B).
  for (const r of rooms) {
    if (!r.pairs_with_room_id) continue;
    const partner = rooms.find((p) => p.id === r.pairs_with_room_id);
    if (partner && !isBusy(r.id) && !isBusy(partner.id)) {
      return { roomId: r.id, roomName: `${r.name} + ${partner.name}`, secondaryRoomId: partner.id };
    }
  }
  return null;
}

/** A title-based couples check — the services carry no explicit flag. */
export function isCouplesTitle(title: string | null | undefined): boolean {
  const t = (title ?? "").toLowerCase();
  return t.includes("couple") || t.includes("pareja");
}
