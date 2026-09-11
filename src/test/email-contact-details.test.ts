import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { HOLIS_PHONE_E164_DIGITS, HOLIS_EMAIL } from "@/data/contact";
import { POLICY_LINES, CLASS_POLICY_LINES } from "@/lib/cancellationPolicy";

// The edge function cannot import from src/, so it keeps its own copies of the
// studio's contact details and of the cancellation policy. The WhatsApp copy
// already drifted once — every class guest who tapped "Message us on WhatsApp"
// was sent to a chat nobody reads — and nothing else links the two files, so
// they are compared here.
const source = readFileSync(
  resolve(__dirname, "../../supabase/functions/send-booking-notification/index.ts"),
  "utf8",
);

const constant = (name: string) => {
  const match = source.match(new RegExp(`${name}\\s*=\\s*"([^"]+)"`));
  expect(match, `${name} not found in the edge function`).not.toBeNull();
  return match![1];
};

describe("contact details in the emails", () => {
  it("use the canonical WhatsApp number", () => {
    expect(constant("HOLIS_WHATSAPP_DIGITS")).toBe(HOLIS_PHONE_E164_DIGITS);
  });

  it("send cancellations to the canonical inbox", () => {
    expect(constant("CANCELLATION_EMAIL")).toBe(HOLIS_EMAIL);
  });

  // Guards against both copies being changed to the same wrong value.
  it("are the ones the site publishes", () => {
    expect(HOLIS_PHONE_E164_DIGITS).toBe("50688146760");
    expect(HOLIS_EMAIL).toBe("spaholisma@gmail.com");
  });
});

describe("the cancellation policy in the emails", () => {
  // The emails must say what the card form says. The edge function builds its
  // lines from template strings, so compare the words that carry the rule.
  it("states the same treatment rule as the site", () => {
    const block = source.slice(source.indexOf("const POLICY_LINES"), source.indexOf("];", source.indexOf("const POLICY_LINES")));
    expect(block).toContain("hours of making your booking — 50% of the total");
    expect(block).toContain("or not show up — 100% of the total");
    expect(block).toContain("The time your email reaches us is the time of the cancellation.");
    expect(POLICY_LINES[0]).toContain("hours of making your booking — 50% of the total");
    expect(POLICY_LINES[1]).toContain("or not show up — 100% of the total");
  });

  it("gives classes the same rule as the site", () => {
    for (const line of CLASS_POLICY_LINES) expect(source).toContain(line);
  });
});
