import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseProgramDescription, programDuration } from "@/lib/wellnessPrograms";
import { seo } from "@/data/content";

// The /wellness-programs page, reachable from the Treatments and Retreats menus.
const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

const RESONATE =
  "AWAKEN your body through mindful movement and deep, intentional breathing. INTEGRATE and calm your nervous system with expert hands-on bodywork complemented by aromatherapy. MANIFEST inner vitality and renewed balance. Includes 45-min Cardiovascular Breathwork class + 45-min nervous system reset bodywork with aromatherapy.";

describe("program descriptions", () => {
  it("splits the three phases and what's included", () => {
    const p = parseProgramDescription(RESONATE);
    expect(p.phases.map((x) => x.label)).toEqual(["Awaken", "Integrate", "Manifest"]);
    expect(p.phases[0].text).toBe("Awaken your body through mindful movement and deep, intentional breathing.");
    expect(p.phases[2].text).toBe("Manifest inner vitality and renewed balance.");
    expect(p.includes).toEqual([
      "45-min Cardiovascular Breathwork class",
      "45-min nervous system reset bodywork with aromatherapy",
    ]);
    expect(p.summary).toBe("");
  });

  it("shows a description without the pattern as plain text", () => {
    expect(parseProgramDescription("A calm and simple program.")).toEqual({
      summary: "A calm and simple program.",
      phases: [],
      includes: [],
    });
    expect(parseProgramDescription(null).summary).toBe("");
  });

  it("labels the duration like the rest of the site", () => {
    expect(programDuration(90)).toBe("1h 30min");
    expect(programDuration(45)).toBe("45 min");
  });
});

describe("wellness programs page wiring", () => {
  it("is routed and prerendered for search", () => {
    expect(read("src/App.tsx")).toContain('path: "/wellness-programs"');
    expect(seo.wellnessPrograms.canonical).toBe("/wellness-programs");
  });

  it("appears in both the Treatments and Retreats menus", () => {
    expect(read("src/components/Navbar.tsx").split('to: "/wellness-programs"').length - 1).toBe(2);
  });

  it("also shows the programs on the Signature Experiences page", () => {
    expect(read("src/pages/SignatureTreatments.tsx")).toContain("<WellnessProgramsSection />");
    const section = read("src/components/WellnessProgramsSection.tsx");
    expect(section).toContain("/book?service=${program.id}");
    expect(section).toContain("WELLNESS_PROGRAMS_PATH");
  });

  it("sends Request to the program's booking flow and offers a consultation", () => {
    const page = read("src/pages/WellnessPrograms.tsx");
    expect(page).toContain("/book?service=${program.id}");
    expect(page).toContain("/book?service=consultation&topic=");
    expect(page).toContain("HOLIS_WHATSAPP_URL");
  });
});
