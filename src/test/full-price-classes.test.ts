import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Wellness Sunday is sold at its own price: no pass, no membership, no coupon.
// It is a flag on the class, not a name in the code, so any class can be set
// the same way from the Admin — and so nothing else changes behaviour.
const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
const strip = (sql: string) => sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

const migration = strip(read("supabase/migrations/20260921140000_full_price_only_classes.sql"));

describe("the flag", () => {
  it("is a column on the class, off for everything by default", () => {
    expect(migration).toMatch(/add column if not exists full_price_only boolean not null default false/);
  });

  it("is turned on for Wellness Sunday and nothing else", () => {
    expect(migration).toMatch(/update public\.classes set full_price_only = true where title ilike '%wellness sunday%'/);
    const updates = migration.match(/update public\.classes set full_price_only/g) ?? [];
    expect(updates).toHaveLength(1);
  });
});

describe("every way a pass could be spent refuses it", () => {
  for (const fn of [
    "book_class_with_offering",          // the customer on the website
    "admin_book_class_with_offering",    // staff adding somebody
    "book_class_with_membership_token",  // the emailed no-login link
  ]) {
    it(`${fn} stops on a full-price class`, () => {
      const start = migration.indexOf(`function public.${fn}`);
      expect(start).toBeGreaterThan(-1);
      const body = migration.slice(start, migration.indexOf("$fn$;", start));
      expect(body).toMatch(/if sch\.full_price_only then/);
      expect(body).toMatch(/always paid in full/);
      // It must read the flag from the class the session belongs to.
      expect(body).toMatch(/join public\.classes c on c\.id = cs\.class_id/);
    });
  }

  it("keeps every other rule those functions already had", () => {
    expect(migration).toMatch(/This pass does not cover this class/);
    expect(migration).toMatch(/This class is full/);
    expect(migration).toMatch(/already booked into this class/);
    expect(migration).toMatch(/credits_remaining = credits_remaining - 1/);
  });

  it("leaves the emailed link returning what it always returned", () => {
    const token = migration.slice(migration.indexOf("function public.book_class_with_membership_token"));
    expect(token).toMatch(/'guest_email', uo\.guest_email/);
    expect(token).toMatch(/'credits_remaining'/);
  });
});

describe("coupons", () => {
  it("are refused on the server, where the price is decided", () => {
    const fn = read("supabase/functions/create-class-booking/index.ts");
    expect(fn).toMatch(/select\("title, full_price_only"\)/);
    expect(fn).toMatch(/always paid in full/);
    expect(fn).toMatch(/code: "INVALID_COUPON"/);
  });

  it("are refused in the browser too, so the person is told before booking", () => {
    const lib = read("src/lib/coupons.ts");
    expect(lib).toMatch(/full_price_only/);
    expect(lib).toMatch(/coupons do not apply to it/);
  });
});

describe("the booking page", () => {
  const page = read("src/pages/ClassBooking.tsx");

  it("offers no membership or credits for such a class", () => {
    expect(page).toMatch(/const fullPriceOnly = !!\(cls as any\)\?\.full_price_only/);
    expect(page).toMatch(/classId && !fullPriceOnly\s*\?\s*filterEligibleOfferings/);
    expect(page).toMatch(/const tokenEligible =\s*\n?\s*!fullPriceOnly/);
  });

  it("hides the coupon box and says why", () => {
    expect(page).toMatch(/payMethod === "card" && !fullPriceOnly/);
    expect(page).toMatch(/always paid in full — memberships, class credits and coupons do not/);
  });
});

describe("the Admin", () => {
  const manager = read("src/components/admin/AdminEventsManager.tsx");

  it("can set any class this way", () => {
    expect(manager).toMatch(/full_price_only: boolean;/);
    expect(manager).toMatch(/full_price_only: editing\.full_price_only/);
    expect(manager).toMatch(/Always paid in full/);
    expect(manager).toMatch(/Memberships, class passes and coupons cannot be used for this class/);
  });
});
