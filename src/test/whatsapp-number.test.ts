import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { HOLIS_PHONE_E164_DIGITS } from "@/data/contact";

// The edge function cannot import from src/, so it keeps its own copy of the
// WhatsApp number. That copy drifted to an old line and went unnoticed: every
// class guest who tapped "Message us on WhatsApp" in their confirmation was
// sent to a chat nobody reads. Comparing the files here is the only thing that
// catches it, since nothing else links the two.
describe("the WhatsApp number in the emails", () => {
  const source = readFileSync(
    resolve(__dirname, "../../supabase/functions/send-booking-notification/index.ts"),
    "utf8",
  );

  it("matches the canonical number in src/data/contact.ts", () => {
    const match = source.match(/HOLIS_WHATSAPP_DIGITS\s*=\s*"(\d+)"/);
    expect(match, "HOLIS_WHATSAPP_DIGITS not found in the edge function").not.toBeNull();
    expect(match![1]).toBe(HOLIS_PHONE_E164_DIGITS);
  });

  it("is the Costa Rica number the site publishes", () => {
    // Guards against both copies being changed to the same wrong value.
    expect(HOLIS_PHONE_E164_DIGITS).toBe("50688146760");
  });
});
