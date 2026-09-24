import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cardTotal, isFreeWithCoupon, looksLikePassCode } from "@/lib/classCheckout";
import { readAuthLink } from "@/lib/authRedirect";

const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
const strip = (sql: string) => sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

describe("what a password link brought", () => {
  it("a fresh link carries the session", () => {
    expect(readAuthLink({ hash: "#access_token=abc&type=recovery&expires_in=3600", search: "" })).toEqual({ kind: "recovery" });
  });

  it("a used or expired link carries an error — the page used to wait forever on it", () => {
    const link = readAuthLink({
      hash: "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
      search: "",
    });
    expect(link.kind).toBe("error");
    expect((link as any).message).toBe("Email link is invalid or has expired");
  });

  it("understands the newer ?code= style too", () => {
    expect(readAuthLink({ hash: "", search: "?code=xyz" })).toEqual({ kind: "code", code: "xyz" });
  });

  it("nothing at all is nothing", () => {
    expect(readAuthLink({ hash: "", search: "" })).toEqual({ kind: "none" });
  });
});

describe("after choosing a password", () => {
  const page = read("src/pages/ResetPassword.tsx");
  const lib = read("src/lib/authRedirect.ts");

  it("no longer sends everyone to /admin", () => {
    expect(page).not.toMatch(/navigate\("\/admin"\)/);
    expect(page).toMatch(/navigate\(await homeFor\(data\.user\?\.id\)\)/);
  });

  it("only the roles the Admin lets in go to the Admin; everyone else to their page", () => {
    expect(lib).toMatch(/new Set\(\["super_admin", "manager", "coordinator", "viewer"\]\)/);
    expect(lib).toMatch(/\? "\/admin" : "\/dashboard"/);
  });

  it("never waits forever: an error or a timeout says the link expired and offers a new one", () => {
    expect(page).toMatch(/if \(link\.kind === "error"\) \{\s+invalid\(\);/);
    expect(page).toMatch(/setTimeout\(invalid, WAIT_MS\)/);
    expect(page).toMatch(/resetPasswordForEmail\(address/);
  });

  it("copies the address before the Supabase client can tidy it away", () => {
    const main = read("src/main.tsx");
    const first = main.split(/\r?\n/).find((l) => l.startsWith("import"));
    expect(first).toBe('import "./lib/initialUrl";');
    expect(read("src/lib/initialUrl.ts")).not.toMatch(/^import /m);
  });
});

describe("booking a class for $0", () => {
  it("adds up spots less the coupon, never below zero", () => {
    expect(cardTotal(23, 1, 23)).toBe(0);
    expect(cardTotal(23, 2, 5)).toBe(41);
    expect(cardTotal(23, 1, 30)).toBe(0);
  });

  it("a 100% coupon books directly — PayPal cannot take $0", () => {
    expect(isFreeWithCoupon({ payMethod: "card", multi: false, hasCoupon: true, total: 0 })).toBe(true);
  });

  it("anything left to pay, or several spots, still goes through payment", () => {
    expect(isFreeWithCoupon({ payMethod: "card", multi: false, hasCoupon: true, total: 5 })).toBe(false);
    expect(isFreeWithCoupon({ payMethod: "card", multi: true, hasCoupon: true, total: 0 })).toBe(false);
    expect(isFreeWithCoupon({ payMethod: "card", multi: false, hasCoupon: false, total: 0 })).toBe(false);
  });

  it("the page books a free coupon through the server, which checks the coupon again", () => {
    const page = read("src/pages/ClassBooking.tsx");
    expect(page).toMatch(/isFreeWithCoupon\(\{[\s\S]*?\}\) \? \([\s\S]*?onClick=\{handleCardCheckout\}/);
    const fn = read("supabase/functions/create-class-booking/index.ts");
    expect(fn).toMatch(/if \(totalPrice <= 0\) \{/);
  });

  it("recognises the studio's pass codes", () => {
    expect(looksLikePassCode("RD4424")).toBe(true);
    expect(looksLikePassCode(" rd4424 ")).toBe(true);
    expect(looksLikePassCode("STAFF")).toBe(false);
  });
});

describe("a signed-in guest and their pass", () => {
  const page = read("src/pages/ClassBooking.tsx");
  const sql = strip(read("supabase/migrations/20260926120000_membership_code_and_my_offerings.sql"));

  it("fills in the details from their account, without overwriting what is typed", () => {
    expect(page).toMatch(/from\("profiles"\)\.select\("full_name, email, phone"\)/);
    expect(page).toMatch(/setFormData\(\(f\) => \(f\.name \|\| f\.email \? f :/);
  });

  it("brings a pass sold at the desk into their account — only unowned ones, only their confirmed email", () => {
    expect(page).toMatch(/rpc\("link_my_offerings" as any\)/);
    expect(sql).toMatch(/email_confirmed_at is not null/);
    expect(sql).toMatch(/where user_id is null\s+and lower\(btrim\(guest_email\)\) = v_email/);
    expect(sql).toMatch(/revoke all on function public\.link_my_offerings\(\) from public, anon/);
  });

  it("a pass code needs the email it was sold to, and reveals nothing else", () => {
    const fn = sql.slice(sql.indexOf("function public.membership_token_for_code"));
    expect(fn).toMatch(/upper\(btrim\(uo\.code\)\) = v_code/);
    expect(fn).toMatch(/lower\(btrim\(uo\.guest_email\)\) = v_email/);
    expect(fn).toMatch(/uo\.status = 'active'/);
    expect(fn).toMatch(/returns text/);
    expect(page).toMatch(/rpc\("membership_token_for_code" as any, \{\s+_code: couponCode\.trim\(\), _email: formData\.email\.trim\(\),/);
  });
});
