import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// The website decides which times to offer; create-booking decides which it
// accepts. When the two disagree a guest fills in the whole form, card and
// all, and is refused at the last step — which is what happened on 11
// September: the site offered the slots either side of lunch and the server
// turned them down. These checks keep the two reading the same rules.
const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

describe("website and server agree on availability", () => {
  it("ignore the same booking statuses", () => {
    const site = read("src/hooks/useRoomAvailability.ts");
    const server = read("supabase/functions/create-booking/index.ts");
    expect(site).toContain('.not("status", "in", "(cancelled,payment_failed)")');
    expect(server).toContain('.not("status", "in", "(cancelled,payment_failed)")');
  });

  // A block from 12:00 to 13:00 must not stop a treatment that ends at 12:00
  // or starts at 13:00. The latest definition of get_availability_blocks has
  // to use a strict overlap, as the website does.
  it("treat a block that only touches a slot as no block", () => {
    const dir = resolve(root, "supabase/migrations");
    const latest = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      // Comments may quote the old condition when explaining the fix; read code only.
      .map((f) => ({ f, sql: readFileSync(resolve(dir, f), "utf8").replace(/--.*$/gm, "") }))
      .filter(({ sql }) => /create or replace function public\.get_availability_blocks/i.test(sql))
      .pop();
    expect(latest, "no migration defines get_availability_blocks").toBeDefined();
    expect(latest!.sql).toMatch(/x\.block_start\s*<\s*_to\s+and\s+x\.block_end\s*>\s*_from/);
    expect(latest!.sql).not.toMatch(/block_start\s*<=\s*_to/);

    const site = read("src/hooks/useRoomAvailability.ts");
    expect(site).toContain("blockIntervals.some((b) => start < b.end && end > b.start)");
  });
});
