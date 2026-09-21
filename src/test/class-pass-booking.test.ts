import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Booking a class with a pass, after 19 Sep 2026.
//
// The website did it in two steps from the browser: insert the booking, then
// call redeem_offering() for the credit. The second step was never granted to
// logged-in customers, so it failed every time — leaving the booking behind
// with no credit taken, and a retry that booked the person a second time.
// One pass ended up with three bookings, five credits and no redemptions.
const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
const strip = (sql: string) => sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

const migration = strip(read("supabase/migrations/20260921120000_class_pass_booking_atomic.sql"));
const indexMigration = strip(read("supabase/migrations/20260921120100_one_seat_per_pass.sql"));
const page = read("src/pages/ClassBooking.tsx");

describe("booking with a pass happens in one transaction", () => {
  it("is a single function the browser calls", () => {
    expect(migration).toMatch(/create or replace function public\.book_class_with_offering/);
  });

  it("takes the credit and records the redemption alongside the booking", () => {
    const body = migration.slice(migration.indexOf("book_class_with_offering"));
    expect(body).toMatch(/insert into public\.class_bookings/);
    expect(body).toMatch(/set credits_remaining = credits_remaining - 1/);
    expect(body).toMatch(/insert into public\.offering_redemptions/);
    // The booking must come before the credit and the redemption, so a failure
    // anywhere takes the whole thing down together.
    expect(body.indexOf("insert into public.class_bookings"))
      .toBeLessThan(body.indexOf("insert into public.offering_redemptions"));
  });

  it("locks the pass, so two taps cannot both spend the last credit", () => {
    expect(migration).toMatch(/from public\.user_offerings where id = _user_offering_id for update/);
  });

  it("refuses a pass that is not yours", () => {
    expect(migration).toMatch(/uo\.user_id is distinct from auth\.uid\(\)/);
    expect(migration).toMatch(/This pass belongs to someone else/);
  });

  it("keeps the checks the other booking paths already make", () => {
    expect(migration).toMatch(/This pass has expired/);
    expect(migration).toMatch(/no classes left on it/);
    expect(migration).toMatch(/This pass does not cover this class/);
    expect(migration).toMatch(/This class is full/);
  });

  it("refuses a second seat for the same pass in the same class", () => {
    expect(migration).toMatch(/already booked into this class/);
  });

  it("is for signed-in customers, never for the anonymous public", () => {
    expect(migration).toMatch(/grant execute on function public\.book_class_with_offering\(uuid, uuid, text, text, text\) to authenticated/);
    expect(migration).toMatch(/revoke all on function public\.book_class_with_offering\(uuid, uuid, text, text, text\) from public, anon/);
  });
});

describe("the database itself refuses the duplicate", () => {
  it("allows one seat per pass per session", () => {
    expect(indexMigration).toMatch(/create unique index if not exists class_bookings_one_seat_per_pass/);
    expect(indexMigration).toMatch(/on public\.class_bookings \(schedule_id, user_offering_id\)/);
  });

  it("leaves cancelled bookings out, so rebooking still works", () => {
    expect(indexMigration).toMatch(/where user_offering_id is not null and status <> 'cancelled'/);
  });

  it("clears the duplicates already stored, keeping the first of each", () => {
    expect(indexMigration).toMatch(/delete from public\.class_bookings/);
    expect(indexMigration).toMatch(/keep\.created_at < cb\.created_at/);
    expect(indexMigration.indexOf("delete from public.class_bookings"))
      .toBeLessThan(indexMigration.indexOf("create unique index"));
  });
});

describe("the website", () => {
  it("books through the one function", () => {
    expect(page).toMatch(/supabase\.rpc\("book_class_with_offering" as any/);
    expect(page).toMatch(/_user_offering_id: selectedOfferingId/);
    expect(page).toMatch(/_schedule_id: scheduleId/);
  });

  it("no longer writes the booking itself and then asks for the credit", () => {
    expect(page).not.toMatch(/redeemOffering\(/);
    // createClassBooking() stays for the paths that have no pass (free, card),
    // but nothing may hand it a pass any more.
    expect(page).not.toMatch(/userOfferingId: selectedOfferingId/);
  });

  it("still guards the button against a double tap", () => {
    const handler = page.slice(page.indexOf("const handleRedeem"), page.indexOf("const handleTokenRedeem"));
    expect(handler).toMatch(/if \(submitting\) return;/);
  });
});

describe("the classes a pass covers, in the Admin", () => {
  const manager = read("src/components/admin/AdminOfferingsManager.tsx");

  it("fills the ticks in once per offering, not on every render", () => {
    // The old code re-applied the saved list during render whenever the
    // selection was empty, so unticking the last class put it straight back.
    expect(manager).not.toMatch(/if \(editing\?\.id && existingEligible\.length > 0 && eligibleClassIds\.length === 0\)/);
    expect(manager).toMatch(/hydratedFor\.current === editing\.id/);
    expect(manager).toMatch(/useEffect\(\(\) => \{[\s\S]{0,400}setEligibleClassIds\(existingEligible\)/);
  });

  it("warns that ticking classes shuts every other one out", () => {
    // Somebody ticked "Wellness Sunday" meaning to include it, and every
    // member lost yoga. The screen has to say what ticking actually does.
    expect(manager).toMatch(/Only the ticked classes can be booked with this pass/);
    expect(manager).toMatch(/Cover every class/);
    expect(manager).toMatch(/Covers every class\. Tick classes only if/);
  });

  it("treats an empty list as covering every class", () => {
    const save = manager.slice(manager.indexOf("const save = async"));
    expect(save).toMatch(/from\("offering_eligible_classes"\)\s*\.delete\(\)/);
    expect(save).toMatch(/if \(eligibleClassIds\.length > 0\)/);
  });
});
