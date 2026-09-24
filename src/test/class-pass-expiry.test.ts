import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Class passes expire as their welcome emails say (27 Sep 2026).
const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
const strip = (sql: string) => sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const sql = strip(read("supabase/migrations/20260927120000_class_pass_expiry.sql"));
const admin = read("src/components/admin/AdminOfferingsManager.tsx");

describe("class passes expire", () => {
  it("the 5-Class Pass lasts 30 days and the 10-Class Pass 60, as their emails say", () => {
    expect(sql).toMatch(/set duration_days = 30\s+where id = '61cb7970-a41f-4f75-ae76-a4eabf138c6f'/);
    expect(sql).toMatch(/set duration_days = 60\s+where id = '36a8b555-b849-405b-9851-469cc6c151b9'/);
  });

  it("never overwrites a validity someone already set", () => {
    expect((sql.match(/and duration_days is null;/g) ?? []).length).toBe(2);
  });

  it("every new pass gets its date when it is created, whichever screen creates it", () => {
    expect(sql).toMatch(/before insert on public\.user_offerings/);
    expect(sql).toMatch(/if new\.expires_at is null and new\.offering_id is not null then/);
  });

  it("counts whole months as calendar months, like memberships", () => {
    expect(sql).toMatch(/when _days % 30 = 0 then _from \+ make_interval\(months => _days \/ 30\)/);
  });

  it("dates the passes already sold, but leaves cancelled ones and drop-ins alone", () => {
    expect(sql).toMatch(/uo\.status in \('active', 'depleted', 'frozen'\)/);
    expect(sql).toMatch(/o\.type = 'class_pass'/);
  });

  it("does not email about a used-up pass that is already past its date", () => {
    expect(sql).toMatch(/when uo\.status = 'depleted' and d\.expiry < now\(\) then coalesce\(uo\.expiry_notified_at, now\(\)\)/);
  });
});

describe("the Admin keeps a pass's validity", () => {
  it("saves it for class passes — it used to be wiped on every save", () => {
    expect(admin).toMatch(/duration_days: editing\.type === "membership" \|\| editing\.type === "class_pass"/);
  });

  it("lets the team see and change it", () => {
    expect(admin).toMatch(/Valid for \(days\)/);
    expect(admin).toMatch(/credits\$\{o\.duration_days \? ` · \$\{o\.duration_days\} days` : ""\}/);
  });
});
