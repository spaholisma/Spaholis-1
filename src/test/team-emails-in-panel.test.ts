import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Every email the system sends — to clients and to the team — is editable in
// Admin → Client Emails (28 Sep 2026).
const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8").replace(/\r\n/g, "\n");
const sql = read("supabase/migrations/20260928120000_team_emails_in_panel.sql");
const panel = read("src/components/admin/AdminEmailTemplates.tsx");

const WIRING: Record<string, string> = {
  team_new_treatment: "supabase/functions/send-booking-notification/index.ts",
  team_new_class: "supabase/functions/send-booking-notification/index.ts",
  team_treatment_cancelled: "supabase/functions/send-booking-notification/index.ts",
  team_request_notice: "supabase/functions/send-booking-notification/index.ts",
  team_offering_order: "supabase/functions/send-membership-order-email/index.ts",
  team_offering_purchase: "supabase/functions/send-membership-order-email/index.ts",
  team_retreat_inquiry: "supabase/functions/send-inquiry-notification/index.ts",
  team_custom_retreat: "supabase/functions/send-inquiry-notification/index.ts",
  team_daily_agenda: "supabase/functions/daily-agenda-email/index.ts",
};

describe("the team's emails are in the panel", () => {
  it("each one has a template, in the team section, never overwriting one that exists", () => {
    for (const key of Object.keys(WIRING)) expect(sql).toContain(`'${key}'`);
    expect((sql.match(/, 'team',\n/g) ?? []).length).toBe(Object.keys(WIRING).length);
    expect(sql).toMatch(/on conflict \(template_key\) do nothing;/);
  });

  it("each function reads its template", () => {
    for (const [key, file] of Object.entries(WIRING)) expect(read(file)).toContain(`"${key}"`);
  });

  it("each function keeps its built-in copy for when the template is off", () => {
    const sbn = read(WIRING.team_new_treatment);
    expect(sbn).toMatch(/teamTpl\?\.html \?\? buildAdminHtml\(adminCtx\)/);
    expect(sbn).toMatch(/teamTpl\?\.html \?\? buildClassAdminHtml\(classCtx\)/);
    expect(read(WIRING.team_offering_order)).toMatch(/\} else \{\n\s+adminSubj = isOnlinePurchase/);
    expect(read(WIRING.team_retreat_inquiry)).toMatch(/html: shell\("New retreat inquiry"/);
    expect(read(WIRING.team_daily_agenda)).toMatch(/: emailShell\(`Tomorrow's Agenda — \$\{prettyDate\}`, agenda, shellOpts\)/);
  });

  it("the templates say what the emails say today", () => {
    expect(sql).toContain("'New Reservation — {{service_name}} — {{guest_name}} ({{reservation_id}})'");
    expect(sql).toContain("'Cancelled{{charge_label}} — {{service_name}} — {{guest_name}} ({{reservation_id}})'");
    expect(sql).toContain("'[New order] {{guest_name}} — {{offering_name}} ({{code}})'");
    expect(sql).toContain("'Agenda mañana — {{date}} ({{bookings_count}} reservas)'");
    expect(sql).toContain("Reply to this email to answer the guest directly.");
  });

  it("the panel shows the section, each email's own variables and a preview", () => {
    expect(panel).toMatch(/team: "Team notifications \(sent to us\)"/);
    expect(panel).toMatch(/TEMPLATE_VARS\[editing\.template_key\] \?\? CATEGORY_VARS\[editing\.category\]/);
    for (const key of Object.keys(WIRING)) expect(panel).toContain(`${key}:`);
    expect(panel).toMatch(/if \(category === "team"\)/);
  });
});
