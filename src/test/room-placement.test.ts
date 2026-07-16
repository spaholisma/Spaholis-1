/**
 * Room assignment for couples treatments.
 *
 * A couples treatment must land in a room that fits two: Room 2 alone, or
 * Room 3A + 3B together — never Room 1, never 3A or 3B on their own. And a
 * couples booking that takes 3A+3B has to block BOTH rooms for everyone else,
 * or the paired room gets double-booked. This is on the live booking path, so
 * lock the logic here.
 */
import { describe, it, expect } from "vitest";
import {
  isRoomBusy,
  placeCouplesSlot,
  isCouplesTitle,
  type RoomInfo,
  type BusyInterval,
} from "@/lib/roomPlacement";

const R1: RoomInfo = { id: "r1", name: "Room 1", forbidden_categories: ["facial", "wrap"] };
const R2: RoomInfo = { id: "r2", name: "Room 2", forbidden_categories: [], couples_capable: true };
const R3A: RoomInfo = { id: "r3a", name: "Room 3A", forbidden_categories: [], pairs_with_room_id: "r3b" };
const R3B: RoomInfo = { id: "r3b", name: "Room 3B", forbidden_categories: ["facial"] };
const ROOMS = [R1, R2, R3A, R3B];

const at = (h: number, min = 0) => new Date(Date.UTC(2026, 6, 20, h, min, 0));
const slotStart = at(15);
const slotEnd = at(16);
/** Build an isBusy(roomId) for this slot from a set of busy intervals. */
const busyFn = (busy: BusyInterval[]) => (roomId: string) =>
  isRoomBusy(roomId, slotStart, slotEnd, busy);

describe("isCouplesTitle", () => {
  it("recognizes couples treatments by name", () => {
    expect(isCouplesTitle("Couples Massage (90min)")).toBe(true);
    expect(isCouplesTitle("SHARE THE MAGIC (COUPLES)")).toBe(true);
    expect(isCouplesTitle("Masaje en pareja")).toBe(true);
  });
  it("leaves single treatments alone", () => {
    expect(isCouplesTitle("Holisynergie Massage (60min)")).toBe(false);
    expect(isCouplesTitle(null)).toBe(false);
  });
});

describe("isRoomBusy", () => {
  it("counts a booking's primary room", () => {
    const busy: BusyInterval[] = [{ room_id: "r2", start: at(14, 30), end: at(15, 30) }];
    expect(isRoomBusy("r2", slotStart, slotEnd, busy)).toBe(true);
    expect(isRoomBusy("r1", slotStart, slotEnd, busy)).toBe(false);
  });
  it("counts a couples booking's SECONDARY room", () => {
    // A couples booking stored on 3A that also occupies 3B must make 3B busy.
    const busy: BusyInterval[] = [{ room_id: "r3a", secondary_room_id: "r3b", start: at(15), end: at(16) }];
    expect(isRoomBusy("r3a", slotStart, slotEnd, busy)).toBe(true);
    expect(isRoomBusy("r3b", slotStart, slotEnd, busy)).toBe(true);
  });
  it("ignores a booking that doesn't overlap the slot", () => {
    const busy: BusyInterval[] = [{ room_id: "r2", start: at(16), end: at(17) }];
    expect(isRoomBusy("r2", slotStart, slotEnd, busy)).toBe(false);
  });
});

describe("placeCouplesSlot", () => {
  it("prefers the solo couples room (Room 2) when it's free", () => {
    const p = placeCouplesSlot(ROOMS, busyFn([]));
    expect(p).toEqual({ roomId: "r2", roomName: "Room 2" });
  });

  it("falls back to the 3A+3B pair when Room 2 is taken", () => {
    const busy: BusyInterval[] = [{ room_id: "r2", start: at(15), end: at(16) }];
    const p = placeCouplesSlot(ROOMS, busyFn(busy));
    expect(p).toEqual({ roomId: "r3a", roomName: "Room 3A + Room 3B", secondaryRoomId: "r3b" });
  });

  it("refuses the pair if EITHER 3A or 3B is taken", () => {
    // Room 2 busy, 3B busy -> no couples room available at all.
    const busy: BusyInterval[] = [
      { room_id: "r2", start: at(15), end: at(16) },
      { room_id: "r3b", start: at(15), end: at(16) },
    ];
    expect(placeCouplesSlot(ROOMS, busyFn(busy))).toBeNull();
  });

  it("never places a couple in Room 1", () => {
    // Every couples-capable option busy; Room 1 is free but must not be used.
    const busy: BusyInterval[] = [
      { room_id: "r2", start: at(15), end: at(16) },
      { room_id: "r3a", start: at(15), end: at(16) },
    ];
    const p = placeCouplesSlot(ROOMS, busyFn(busy));
    expect(p).toBeNull();
  });

  it("a couples booking on the pair blocks a later couple needing it", () => {
    // First couple took 3A+3B (stored on 3A, secondary 3B) and Room 2 is busy.
    const busy: BusyInterval[] = [
      { room_id: "r2", start: at(15), end: at(16) },
      { room_id: "r3a", secondary_room_id: "r3b", start: at(15), end: at(16) },
    ];
    expect(placeCouplesSlot(ROOMS, busyFn(busy))).toBeNull();
  });
});
