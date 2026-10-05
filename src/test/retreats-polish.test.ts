import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { descriptionBlocks, isStructured } from "@/lib/descriptionBlocks";

const read = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8").replace(/\r\n/g, "\n");

const ocean = `A private day of adventure, flavor & relaxation 🌊🌿

Create a memorable experience together with a day designed exclusively for your group.

⛵ Private Boat Tour
Cruise along the beautiful Pacific coastline. Fruits and water included.

💆‍♀️ Massage for Every Guest
Complete the experience with a relaxing massage.

ADVENTURE • CONNECTION • WELLNESS

Perfect for groups of friends, celebrations & special occasions.

Private experience · Designed for your group · Minimum 4 guests ($1,280)`;

describe("laying out a description", () => {
  it("reads the parts of a structured description", () => {
    const b = descriptionBlocks(ocean);
    expect(b.map((x) => x.kind)).toEqual(["lead", "para", "feature", "feature", "tagline", "para", "facts"]);
    expect(b[2]).toEqual({ kind: "feature", icon: "⛵", title: "Private Boat Tour", text: "Cruise along the beautiful Pacific coastline. Fruits and water included." });
    expect(b[3]).toMatchObject({ kind: "feature", icon: "💆‍♀️", title: "Massage for Every Guest" });
    expect(b[4]).toEqual({ kind: "tagline", words: ["ADVENTURE", "CONNECTION", "WELLNESS"] });
    expect(b[6]).toEqual({ kind: "facts", items: ["Private experience", "Designed for your group", "Minimum 4 guests ($1,280)"] });
    expect(isStructured(b)).toBe(true);
  });

  it("leaves an ordinary description as it was", () => {
    const plain = "A Day of Adventure and Relaxation. Share an unforgettable day designed to celebrate connection.";
    const b = descriptionBlocks(plain);
    expect(b).toEqual([{ kind: "para", text: plain }]);
    expect(isStructured(b)).toBe(false);
  });

  it("an emoji in the middle of a sentence is not a highlight", () => {
    expect(isStructured(descriptionBlocks("Relax 🌿 and breathe\nwith us"))).toBe(false);
  });
});

describe("admin Retreats panel", () => {
  const panel = read("src/components/admin/AdminRetreatsManager.tsx");

  it("lists the packages and the experiences of the Retreats page too", () => {
    expect(panel).toMatch(/\.in\("type", \["program", "experience"\]\)/);
    expect(panel).toMatch(/title: "Wellness Packages"/);
    expect(panel).toMatch(/title: "Manuel Antonio Experiences"/);
  });

  it("edits them with the same Services editor, and can switch them on and off", () => {
    expect(panel).toMatch(/<AdminServicesManager editServiceId=\{serviceEdit\}/);
    expect(panel).toMatch(/from\("services"\)\.update\(\{ is_active: active \}\)/);
    expect(read("src/components/admin/AdminServicesManager.tsx")).toMatch(/if \(onEditorClose\) \{ onEditorClose\(\); return; \}/);
  });
});
