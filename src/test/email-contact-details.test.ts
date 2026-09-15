import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { HOLIS_PHONE_E164_DIGITS, HOLIS_EMAIL } from "@/data/contact";
import { RULE_LINES, CHANGES_LINE, CLASS_POLICY_LINES, FULL_CHARGE_WINDOW_HOURS } from "@/lib/cancellationPolicy";

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
  it("uses the same 48-hour window as the site", () => {
    const match = source.match(/FULL_CHARGE_WINDOW_HOURS\s*=\s*(\d+)/);
    expect(match, "FULL_CHARGE_WINDOW_HOURS not found in the edge function").not.toBeNull();
    expect(Number(match![1])).toBe(FULL_CHARGE_WINDOW_HOURS);
    expect(FULL_CHARGE_WINDOW_HOURS).toBe(48);
  });

  // The edge function builds its lines from template strings, so compare the
  // words after the hour count, which carry the rule.
  it("states the same treatment rule as the site", () => {
    const start = source.indexOf("const RULE_LINES");
    const block = source.slice(start, source.indexOf("];", start));
    const tail = (line: string) => line.slice(line.indexOf(" hours"));
    expect(block).toContain(tail(RULE_LINES[0]).replace(/`/g, ""));
    expect(block).toContain(tail(RULE_LINES[1]).replace(/`/g, ""));
    expect(tail(RULE_LINES[0])).toContain("hours before your appointment — 50% of the total");
    expect(tail(RULE_LINES[1])).toContain("hours before your appointment, or not show up — 100% of the total");
    expect(source).toContain(CHANGES_LINE);
  });

  it("gives classes the same rule as the site", () => {
    for (const line of CLASS_POLICY_LINES) expect(source).toContain(line);
  });
});
