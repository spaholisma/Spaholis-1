import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { lockedDetails } from "@/lib/classCheckout";

// A membership books its owner into class — nobody else (27 Sep 2026).
const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
const strip = (sql: string) => sql.split(/\r?\n/).filter((l) => !l.trim().startsWith("--")).join("\n");

describe("which details are locked on the booking page", () => {
  it("signed in: name and email from the account", () => {
    expect(lockedDetails({ signedIn: true, account: { name: "Spa Holis", email: "spaholisma@gmail.com" } }))
      .toEqual({ name: "Spa Holis", email: "spaholisma@gmail.com" });
  });

  it("an account with no name on file leaves the name open to type", () => {
    expect(lockedDetails({ signedIn: true, account: { name: "  ", email: null }, authEmail: "ana@example.com" }))
      .toEqual({ name: null, email: "ana@example.com" });
  });

  it("through a pass's own link: the pass holder's details", () => {
    expect(lockedDetails({ signedIn: false, pass: { guest_name: "Ana", guest_email: "ana@example.com" } }))
      .toEqual({ name: "Ana", email: "ana@example.com" });
  });

  it("a guest we know nothing about types everything, as before", () => {
    expect(lockedDetails({ signedIn: false })).toEqual({ name: null, email: null });
  });
});

describe("the server holds to the owner's name too", () => {
  const sql = strip(read("supabase/migrations/20260927120100_offering_booking_uses_owner_details.sql"));

  it("for a member, the account's name and email win over anything typed", () => {
    expect(sql).toMatch(/v_name  := coalesce\(nullif\(btrim\(prof\.full_name\), ''\), nullif\(btrim\(uo\.guest_name\), ''\),  nullif\(btrim\(_guest_name\), ''\)\)/);
    expect(sql).toMatch(/v_email := coalesce\(nullif\(btrim\(prof\.email\), ''\),     nullif\(btrim\(uo\.guest_email\), ''\), nullif\(btrim\(_guest_email\), ''\)\)/);
  });

  it("only the team may book a pass holder under another name", () => {
    expect(sql).toMatch(/v_staff      boolean := has_role\(auth\.uid\(\), 'super_admin'\) or has_role\(auth\.uid\(\), 'manager'\)/);
    expect(sql).toMatch(/if v_staff then\s+v_name  := coalesce\(nullif\(btrim\(_guest_name\)/);
  });

  it("keeps every existing check", () => {
    for (const check of [
      "This pass belongs to someone else", "This pass has expired", "This pass has no classes left on it",
      "passes and memberships cannot be used for it", "This pass does not cover this class",
      "This pass is already booked into this class", "This class is full",
    ]) expect(sql).toContain(check);
  });

  it("books with the resolved details, not the typed ones", () => {
    expect(sql).toMatch(/v_booking_id, sch\.id, uo\.user_id,\s+v_name, v_email, v_phone,/);
  });
});
