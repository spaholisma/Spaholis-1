import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 2026-11-20: online couples bookings failed. create-booking saves a couples
// treatment as two rows (one per person); the enforce_couples_room guard took
// the second row for a clash (23505), nothing was saved, create-booking still
// answered "ok", and the card step failed with
// booking_card_authorizations_booking_id_fkey.

const read = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8").replace(/\r\n/g, "\n");

describe("couples bookings online", () => {
  it("the room guard lets the other person of the same couples booking share the room(s)", () => {
    const sql = read("supabase/migrations/20261120120000_couples_two_rows.sql");
    expect(sql).toMatch(/create or replace function public\.enforce_couples_room\(\)/);
    // The companion: same treatment, same times, same email — and only one of them.
    expect(sql).toMatch(/and lower\(b\.guest_email\) = lower\(new\.guest_email\)/);
    expect(sql).toMatch(/if v_others > 0 or v_companions > 1 then/);
    // The second person's row in 3B needs the first person's row in 3A.
    expect(sql).toMatch(/where r\.pairs_with_room_id = new\.room_id/);
  });

  it("create-booking never reports a booking that was not saved", () => {
    const fn = read("supabase/functions/create-booking/index.ts");
    expect(fn).toMatch(/const \{ data: saved \} = await admin\.from\("bookings"\)\.select\("id"\)\.eq\("id", bookingId\)\.maybeSingle\(\);\n\s*if \(saved\) \{/);
    expect(fn).toMatch(/reason: "slot_taken",[\s\S]{0,140}\}, 409\);/);
  });
});
