import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Three things the Admin could not do, fixed together on 24 Sep 2026:
// give a class back to a pass when the booking goes away, correct a customer's
// details on their membership, and see every client — not just website users.
const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
const strip = (sql: string) => sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

describe("a cancelled class gives its credit back", () => {
  const sql = strip(read("supabase/migrations/20260924120000_refund_class_credit_on_cancel.sql"));

  it("fires on every way a booking can go: deleted or cancelled", () => {
    expect(sql).toMatch(/after delete or update of status on public\.class_bookings/);
    expect(sql).toMatch(/when \(old\.user_offering_id is not null\)/);
  });

  it("refunds on the moment it becomes cancelled, not on every later edit", () => {
    expect(sql).toMatch(/if new\.status = 'cancelled' and old\.status is distinct from 'cancelled' then/);
  });

  it("does not refund a booking that was already cancelled when it is deleted", () => {
    expect(sql).toMatch(/if tg_op = 'DELETE' then\s+if old\.status <> 'cancelled' then/);
  });

  it("gives back exactly what was spent, driven by the redemption, once", () => {
    expect(sql).toMatch(/delete from public\.offering_redemptions\s+where class_booking_id = _booking_id/);
    expect(sql).toMatch(/returning credits_used/);
    expect(sql).toMatch(/if v_back > 0 then/);
  });

  it("never fills a pass above its size, and wakes a used-up pass", () => {
    expect(sql).toMatch(/least\(\s*coalesce\(credits_total/);
    expect(sql).toMatch(/case when status = 'depleted' then 'active' else status end/);
  });

  it("leaves memberships' credit counts alone", () => {
    expect(sql).toMatch(/and not coalesce\(is_unlimited, false\)/);
  });

  it("settles the passes that already lost a class this way", () => {
    expect(sql).toMatch(/left join public\.class_bookings cb on cb\.id = red\.class_booking_id/);
    expect(sql).toMatch(/cb\.id is null or cb\.status = 'cancelled'/);
  });

  it("is not something a customer or the public can call", () => {
    expect(sql).toMatch(/revoke all on function public\.refund_class_credit\(uuid, uuid\) from public, anon, authenticated/);
  });
});

describe("correcting a customer's details on a membership", () => {
  const sql = strip(read("supabase/migrations/20260924120100_admin_edit_offering_contact.sql"));
  const manager = read("src/components/admin/AdminOfferingsManager.tsx");

  it("is staff only", () => {
    expect(sql).toMatch(/has_role\(auth\.uid\(\), 'super_admin'\) or has_role\(auth\.uid\(\), 'manager'\)/);
    expect(sql).toMatch(/revoke all on function public\.admin_update_offering_contact\(uuid, text, text, text, text\) from public, anon/);
  });

  it("checks the details before saving them", () => {
    expect(sql).toMatch(/The customer''s name is required/);
    expect(sql).toMatch(/That email address does not look right/);
  });

  it("changes the contact only — never the credits, the code or the dates", () => {
    const update = sql.slice(sql.indexOf("update public.user_offerings"), sql.indexOf("return jsonb_build_object"));
    expect(update).toMatch(/guest_name\s*=/);
    expect(update).toMatch(/guest_email\s*=/);
    expect(update).toMatch(/guest_phone\s*=/);
    expect(update).not.toMatch(/credits_|expires_at|code\s*=|access_token|status\s*=/);
  });

  it("ties it to a website account only if it had none", () => {
    expect(sql).toMatch(/if uo\.user_id is null and v_email is not null then/);
    expect(sql).toMatch(/user_id\s*=\s*coalesce\(user_id, v_user\)/);
  });

  it("has an Edit button on every membership in the Admin", () => {
    expect(manager).toMatch(/onClick=\{\(\) => setEditRow\(r\)\}/);
    expect(manager).toMatch(/function EditContactDialog/);
    expect(manager).toMatch(/rpc\("admin_update_offering_contact" as any/);
  });

  it("shows what staff typed on the pass, so a correction is visible", () => {
    expect(manager).toMatch(/customerName: r\.guest_name \|\| p\?\.full_name \|\| null/);
    expect(manager).toMatch(/customerEmail: r\.guest_email \|\| p\?\.email \|\| null/);
  });
});

describe("every client, in one place", () => {
  const sql = strip(read("supabase/migrations/20260924120200_admin_client_directory.sql"));
  const dashboard = read("src/pages/AdminDashboard.tsx");

  it("reads every place a person appears", () => {
    for (const table of ["profiles", "user_offerings", "class_bookings", "bookings", "admin_calendar_entries"]) {
      expect(sql).toMatch(new RegExp(`from public\\.${table}`));
    }
  });

  it("recognises one person by email, then phone, then name", () => {
    const key = sql.slice(sql.indexOf("function public.client_key"), sql.indexOf("$fn$;"));
    expect(key.indexOf("lower(btrim(_email))")).toBeLessThan(key.indexOf("'tel:'"));
    expect(key.indexOf("'tel:'")).toBeLessThan(key.indexOf("'name:'"));
  });

  it("is staff only, both the list and the history", () => {
    for (const fn of ["admin_client_directory", "admin_client_history"]) {
      const body = sql.slice(sql.indexOf(`function public.${fn}`));
      expect(body.slice(0, 1500)).toMatch(/raise exception 'Not authorized'/);
    }
    expect(sql).toMatch(/revoke all on function public\.client_events\(\) from public, anon, authenticated/);
  });

  it("only reads — it changes nothing", () => {
    expect(sql).not.toMatch(/\b(insert into|update public\.|delete from)\b/);
  });

  it("is what Admin → Clients now shows", () => {
    expect(dashboard).toMatch(/activeTab === "clients" && <ClientsDirectory \/>/);
    expect(dashboard).not.toMatch(/from\("profiles"\)\.select\("\*"\)\.order\("created_at"/);
  });
});
