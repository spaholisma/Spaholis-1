import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The first two guests who bought a pass on the website (19 Sep 2026) were left
// with no code and no link to book with: only memberships made from the Admin
// ever got them. An online purchase must come out exactly as usable.
const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

describe("a pass bought online", () => {
  const capture = read("supabase/functions/paypal-capture-order/index.ts");
  const insert = capture.slice(capture.indexOf('from("user_offerings").insert('));

  it("gets a code and a no-login link like an Admin order", () => {
    expect(insert.slice(0, 900)).toMatch(/code: await uniqueCode\(admin\)/);
    expect(insert.slice(0, 900)).toMatch(/access_token: randomToken\(\)/);
  });

  it("uses the same code shape as the Admin: two letters and four digits", () => {
    expect(capture).toMatch(/String\.fromCharCode\(65 \+ Math\.floor\(Math\.random\(\) \* 26\)/);
    expect(capture).toMatch(/padStart\(4, "0"\)/);
  });

  it("carries the buyer's name and email, so the mail and the Admin show who it is", () => {
    expect(capture).toMatch(/from\("profiles"\)\.select\("full_name, email"\)/);
    expect(insert.slice(0, 900)).toMatch(/guest_name: buyerName, guest_email: buyerEmail/);
  });

  it("still sends the email right after", () => {
    expect(capture).toMatch(/functions\.invoke\("send-membership-order-email", \{ body: \{ userOfferingId: uo\.id \} \}\)/);
  });
});

describe("the email for it", () => {
  const mail = read("supabase/functions/send-membership-order-email/index.ts");

  it("sends the code + schedule email whenever there is a link", () => {
    expect(mail).toMatch(/const isOrder = !!o\.access_token;/);
  });

  it("tells the team it was paid online, not ordered from the Admin", () => {
    expect(mail).toMatch(/isOnlinePurchase = \(o as any\)\.source === "purchase"/);
    expect(mail).toMatch(/\[Purchase\]/);
  });
});
