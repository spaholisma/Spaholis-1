import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8").replace(/\r\n/g, "\n");

describe("Retreats page — interactive tabs and cards", () => {
  const page = read("src/pages/Retreats.tsx");
  const card = read("src/components/retreats/JourneyCard.tsx");

  it("all three tabs use the same card", () => {
    expect(page.match(/<JourneyCard\b/g)).toHaveLength(3);
  });

  it("tabs are real tabs, with a sliding pill and a count", () => {
    expect(page).toMatch(/role="tablist"/);
    expect(page).toMatch(/aria-selected=\{on\}/);
    expect(page).toMatch(/layoutId="retreats-tab-pill"/);
    expect(page).toMatch(/\{tab\.count\}/);
  });

  it("prices read the same in every browser ($1,030)", () => {
    expect(page).toMatch(/startPrice\.toLocaleString\("en-US"\)/);
  });

  it("the card tilts only with a mouse, never for reduced motion", () => {
    expect(card).toMatch(/const tilt = fine && !reduce;/);
    expect(card).toMatch(/\(pointer: fine\)/);
  });

  it("a card without a photo shows the Holis spiral, and opens with the keyboard", () => {
    expect(card).toMatch(/image \|\| "\/class-placeholder\.jpg"/);
    expect(card).toMatch(/if \(e\.key === "Enter" \|\| e\.key === " "\)/);
  });
});
