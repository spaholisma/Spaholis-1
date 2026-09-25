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

describe("looking after a client's account", () => {
  const sql = strip(read("supabase/migrations/20260925120000_admin_client_accounts.sql"));
  const fn = read("supabase/functions/admin-clients/index.ts");
  const fnOf = (name: string) => sql.slice(sql.indexOf(`function public.${name}`)).slice(0, 4000);

  it("every database step is staff only, and closed to the public", () => {
    for (const name of ["admin_update_client_contact", "admin_link_records_to_account", "admin_detach_client_account"]) {
      expect(fnOf(name)).toMatch(/has_role\(auth\.uid\(\), 'super_admin'\) or has_role\(auth\.uid\(\), 'manager'\)/);
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon`));
    }
  });

  it("corrects a client on everything of theirs — but not on bookings an account made for someone else", () => {
    const body = fnOf("admin_update_client_contact");
    expect(body).toMatch(/where client_key = _key/);
    expect(body).toMatch(/user_id = _user_id\s+and client_key = public\.client_key\(v_email, v_phone, v_name\)/);
  });

  it("never lets staff delete their own login or another staff member's", () => {
    const body = fnOf("admin_detach_client_account");
    expect(body).toMatch(/_user_id = auth\.uid\(\)/);
    expect(body).toMatch(/from public\.user_roles where user_id = _user_id/);
  });

  it("keeps who they were on their history before the login goes", () => {
    const body = fnOf("admin_detach_client_account");
    expect(body).toMatch(/guest_email\s*=\s*coalesce\(/);
  });

  it("the function checks the caller is staff before anything else", () => {
    expect(fn.indexOf("r.role === \"super_admin\" || r.role === \"manager\"")).toBeLessThan(fn.indexOf("req.json()"));
    expect(fn).toMatch(/if \(!isAdmin\) return json\(\{ ok: false, reason: "forbidden" \}, 403\)/);
  });

  it("guards staff, teachers and the caller's own login", () => {
    expect(fn).toMatch(/userId === callerId/);
    expect(fn).toMatch(/from\("user_roles"\)\.select\("user_id"\)\.eq\("user_id", userId\)/);
    expect(fn).toMatch(/from\("teachers"\)/);
  });

  it("never sets or reveals a password — the client chooses theirs from an email", () => {
    expect(fn).not.toMatch(/password\s*:/);
    expect(fn).toMatch(/generateLink\(\{\s*type: "recovery"/);
    expect(fn).toMatch(/redirectTo: `\$\{SITE_URL\}\/reset-password`/);
  });

  it("suspends without deleting, and deletes only after the history is kept", () => {
    expect(fn).toMatch(/ban_duration: action === "suspend" \? SUSPEND_FOR : "none"/);
    expect(fn.indexOf("admin_detach_client_account")).toBeLessThan(fn.indexOf("deleteUser"));
  });
});

describe("the phone box on the Memberships edit form", () => {
  const manager = read("src/components/admin/AdminOfferingsManager.tsx");

  it("uses the country picker, and never loses an old number", () => {
    expect(manager).toMatch(/<ContactPhoneField value=\{form\.phone\}/);
    expect(manager).toMatch(/phone: initialPhone\(row\.guest_phone\)/);
    expect(manager).toMatch(/_phone: phoneToSave\(form\.phone, row\.guest_phone\)/);
  });
});

describe("deleting a client altogether", () => {
  const sql = strip(read("supabase/migrations/20260925130000_admin_delete_client.sql"));
  const body = sql.slice(sql.indexOf("function public.admin_delete_client"));

  it("is staff only and closed to the public", () => {
    expect(body).toMatch(/has_role\(auth\.uid\(\), 'super_admin'\) or has_role\(auth\.uid\(\), 'manager'\)/);
    expect(sql).toMatch(/revoke all on function public\.admin_delete_client\(text\) from public, anon/);
  });

  it("never deletes a staff member, and a website login only after it is removed", () => {
    expect(body).toMatch(/This is a staff account/);
    expect(body).toMatch(/delete the account first/);
  });

  it("sends treatments to the Trash rather than deleting them", () => {
    expect(body).toMatch(/perform public\.soft_delete_booking\(v_id\)/);
    expect(body).not.toMatch(/delete from public\.bookings/);
  });

  it("tells a teacher about a spot opening in a class to come, but not about past classes", () => {
    const upcoming = body.indexOf("cs.start_time > now()");
    const quiet = body.indexOf("set_config('holis.quiet_teacher_notify', 'on', true)");
    expect(upcoming).toBeGreaterThan(0);
    expect(upcoming).toBeLessThan(quiet);
  });

  it("the teacher trigger honours the quiet switch before anything else", () => {
    const trg = sql.slice(sql.indexOf("function public.notify_teacher_event"));
    expect(trg.indexOf("holis.quiet_teacher_notify")).toBeLessThan(trg.indexOf("tg_table_name"));
  });

  it("correcting a client's details no longer emails their teachers", () => {
    const upd = sql.slice(sql.indexOf("function public.admin_update_client_contact"), sql.indexOf("function public.admin_delete_client"));
    expect(upd.indexOf("'on', true")).toBeLessThan(upd.indexOf("update public.class_bookings"));
  });
});
