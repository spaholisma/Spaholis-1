import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { extrasOfferedWith } from "@/hooks/useServices";

// A treatment that already includes an extra does not offer it again — the
// Somato Awareness System Massage comes with the Aromatherapy with
// Kinesiology Test.
const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8").replace(/\r\n/g, "\n");

const extras = [
  { id: "aroma", title: "Aromatherapy with Kinesiology Test" },
  { id: "touch", title: "AromaTouch Technique" },
  { id: "cup", title: "Cupping" },
];

describe("the extras offered with a treatment", () => {
  it("leaves out only the ones it already includes", () => {
    const somato = { id: "s", included_addon_ids: ["aroma"] };
    expect(extrasOfferedWith(extras, somato).map((e) => e.id)).toEqual(["touch", "cup"]);
  });

  it("offers them all with any other treatment", () => {
    expect(extrasOfferedWith(extras, { id: "x", included_addon_ids: [] })).toHaveLength(3);
    expect(extrasOfferedWith(extras, { id: "x" })).toHaveLength(3);
    expect(extrasOfferedWith(extras, undefined)).toHaveLength(3);
    expect(extrasOfferedWith(null, { id: "x" })).toEqual([]);
  });
});

describe("where it holds", () => {
  it("the booking page lists only the offered extras", () => {
    const page = read("src/pages/Booking.tsx");
    expect(page).toMatch(/const offeredExtras = extrasOfferedWith\(addonServices, currentService\);/);
    expect(page).toMatch(/\{offeredExtras\.map\(\(a\) => \{/);
    expect(page).not.toMatch(/\{addonServices!\.map\(/);
  });

  it("the Admin sets it on the treatment, and an extra never includes extras", () => {
    const admin = read("src/components/admin/AdminServicesManager.tsx");
    expect(admin).toMatch(/Extras already included/);
    expect(admin).toMatch(/included_addon_ids: editing\.is_addon \? \[\] : \(editing\.included_addon_ids \?\? \[\]\)/);
  });

  it("the database starts with the Somato massages including the Aromatherapy with Kinesiology Test", () => {
    const sql = read("supabase/migrations/20260930160000_service_included_extras.sql");
    expect(sql).toMatch(/add column if not exists included_addon_ids uuid\[\] not null default '\{\}'/);
    expect(sql).toMatch(/where a\.is_addon and a\.title = 'Aromatherapy with Kinesiology Test'/);
    expect(sql).toMatch(/where s\.title like 'Somato Awareness System Massage%'\s+and not s\.is_addon;/);
  });
});
