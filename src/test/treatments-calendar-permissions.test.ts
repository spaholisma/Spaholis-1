import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// Who can do what on the Treatments calendar. The database decides; these
// checks keep the rules and the screens from drifting apart.
const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
const migrations = readdirSync(resolve(root, "supabase/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => read(`supabase/migrations/${f}`).replace(/--.*$/gm, ""));
const latestDefinition = (fn: string) =>
  migrations.filter((sql) => new RegExp(`create or replace function public\\.${fn}\\b`, "i").test(sql)).pop() ?? "";

describe("treatment admin (Susana)", () => {
  it("may change every field of a booking", () => {
    const sql = latestDefinition("bookings_restrict_customer_updates");
    expect(sql).toMatch(/has_role\(auth\.uid\(\), 'treatment_admin'\)\s*then\s*return new/);
  });

  it("may reveal the card and duplicate a booking, as an admin does", () => {
    expect(latestDefinition("reveal_card_authorization")).toContain("'treatment_admin'");
    expect(latestDefinition("duplicate_booking")).toContain("'treatment_admin'");
  });

  it("is granted to Susana only", () => {
    const grant = migrations.find((sql) => /insert into public\.user_roles/i.test(sql) && /treatment_admin/.test(sql)) ?? "";
    expect(grant).toContain("susanalifehope21@icloud.com");
    expect(grant).not.toContain("anjamengler@gmail.com");
  });

  it("gets service, room and price in the form; a plain coordinator does not", () => {
    const modal = read("src/components/admin/calendar/BookingEditModal.tsx");
    expect(modal).toContain('onValueChange={(v) => update("service_id", v)} disabled={!canEditAll}');
    expect(modal).toContain('onValueChange={(v) => update("room_id", v === "none" ? "" : v)} disabled={!canEditAll}');
    expect(modal).toMatch(/update\("total_price", e\.target\.value\)\} disabled=\{!canEditAll\}/);
    expect(modal).toMatch(/const canEditAll = !readOnly && \(myRoles === null \|\| fullAdmin \|\| treatmentAdmin\)/);
  });
});

describe("viewer (holisdevices)", () => {
  it("reads the whole booking, never the legacy card column or the full card", () => {
    // The migration also redefines duplicate_booking, which copies the encrypted
    // card; check this function's body alone.
    const file = latestDefinition("get_treatment_booking_detail");
    const from = file.search(/create or replace function public.get_treatment_booking_detail/i);
    const sql = file.slice(from, file.indexOf("$$;", file.indexOf("as $$", from)));
    expect(sql).toContain("- 'card_authorization'");
    expect(sql).not.toContain("card_encrypted");
    expect(sql).toMatch(/has_role\(auth\.uid\(\), 'viewer'\)/);
    const revealFile = latestDefinition("reveal_card_authorization");
    const at = revealFile.search(/create or replace function public.reveal_card_authorization/i);
    const reveal = revealFile.slice(at, revealFile.indexOf("end $function$;", at));
    expect(reveal).toContain("pgp_sym_decrypt");
    expect(reveal).not.toContain("'viewer'");
  });

  it("opens a booking in the full modal, locked", () => {
    const calendar = read("src/components/admin/AdminInternalCalendars.tsx");
    expect(calendar).toContain('supabase.rpc("get_treatment_booking_detail" as any');
    expect(calendar).toContain("readOnly={readOnly}");
    const modal = read("src/components/admin/calendar/BookingEditModal.tsx");
    expect(modal).toContain("<fieldset disabled={readOnly}");
  });
});
