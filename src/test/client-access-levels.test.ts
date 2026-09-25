import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { accessChangeWarning, accessLevelOf, ACCESS_LEVELS } from "@/components/admin/clients/accessLevels";

// Admin → Clients: an Admin sets how much of the Admin Panel someone can use.
const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8").replace(/\r\n/g, "\n");
const sql = read("supabase/migrations/20260930130000_client_access_levels.sql");

describe("the five levels", () => {
  it("are read from the roles, the highest winning", () => {
    expect(accessLevelOf([])).toBe("client");
    expect(accessLevelOf(null)).toBe("client");
    expect(accessLevelOf(["teacher"])).toBe("client");
    expect(accessLevelOf(["viewer"])).toBe("viewer");
    expect(accessLevelOf(["coordinator"])).toBe("reception");
    expect(accessLevelOf(["coordinator", "treatment_admin"])).toBe("treatments_admin");
    expect(accessLevelOf(["super_admin"])).toBe("admin");
    expect(accessLevelOf(["manager"])).toBe("admin");
    expect(accessLevelOf(["coordinator", "super_admin"])).toBe("admin");
  });

  it("are the same five the database knows", () => {
    for (const l of ACCESS_LEVELS) expect(sql).toContain(`when '${l.id}'`);
  });

  it("say what an Admin can do before anyone is made one", () => {
    expect(accessChangeWarning("Ana", "admin")).toMatch(/card details.*change other people's access/);
    expect(accessChangeWarning("Ana", "client")).toMatch(/no longer be able to open the Admin Panel/);
  });
});

describe("the database guards it", () => {
  const setter = sql.slice(sql.indexOf("create or replace function public.admin_set_access_level"), sql.indexOf("-- ── 2."));

  it("only an Admin may change access, and never their own", () => {
    expect(setter).toMatch(/if not has_role\(auth\.uid\(\), 'super_admin'\) then\s+raise exception 'Only an Admin/);
    expect(setter).toMatch(/if _user_id = auth\.uid\(\) then\s+raise exception 'You cannot change your own access/);
    expect(setter).toMatch(/revoke all on function public\.admin_set_access_level\(uuid, text\) from public, anon;/);
  });

  it("never leaves the studio without an Admin", () => {
    expect(setter).toMatch(/raise exception 'The studio must keep at least one Admin'/);
  });

  it("maps each level to its roles, and leaves a teacher's role alone", () => {
    expect(setter).toMatch(/when 'treatments_admin' then array\['coordinator', 'treatment_admin'\]/);
    expect(setter).toMatch(/when 'reception'\s+then array\['coordinator'\]/);
    expect(setter).toMatch(/and role in \('super_admin', 'manager', 'coordinator', 'viewer', 'treatment_admin'\);/);
    expect(setter).not.toMatch(/'teacher'/);
  });

  it("the list and the profile carry the roles, and nothing else changes in them", () => {
    expect(sql).toMatch(/suspended\s+boolean,\n\s+roles\s+text\[\]/);
    expect(sql).toMatch(/'can_manage_access', has_role\(auth\.uid\(\), 'super_admin'\)/);
    expect(sql).toMatch(/'is_self', coalesce\(v_user = auth\.uid\(\), false\)/);
    // Both keep their own guard.
    expect(sql.match(/if not \(has_role\(auth\.uid\(\), 'super_admin'\) or has_role\(auth\.uid\(\), 'manager'\)\) then/g)?.length).toBe(2);
  });
});
