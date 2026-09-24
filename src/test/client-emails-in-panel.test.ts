import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Every email a client receives comes from Admin → Client Emails (25 Sep 2026).
const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
const sql = read("supabase/migrations/20260925130100_client_emails_in_panel.sql");
const notify = read("supabase/functions/send-booking-notification/index.ts");
const clients = read("supabase/functions/admin-clients/index.ts");
const panel = read("src/components/admin/AdminEmailTemplates.tsx");

describe("the cancellation email moves into the panel, word for word", () => {
  const sentences = [
    "Your appointment has been cancelled. Here is what was cancelled:",
    "We would love to see you another time — reply to this email or message us on WhatsApp and we will find you a new slot.",
    "Appointment Cancelled",
  ];

  it("the template holds exactly what the function sends today", () => {
    for (const s of sentences) {
      expect(sql).toContain(s);
      expect(notify.replace(/\s+/g, " ")).toContain(s);
    }
    expect(sql).toContain("Your Holis Wellness appointment was cancelled ({{reservation_id}})");
  });

  it("the function reads it, and keeps its own copy for when it is switched off", () => {
    expect(notify).toMatch(/loadTemplate\(supabase, "treatment_cancelled"\)/);
    expect(notify).toMatch(/renderShell\("Appointment Cancelled", inner\)/);
  });

  it("still carries the policy and the fee", () => {
    expect(notify).toMatch(/cancel_note: cancelNote, policy: policyBlock\(\[\.\.\.RULE_LINES, CHANGES_LINE\]\)/);
  });
});

describe("the welcome email for a new website account", () => {
  it("the template holds exactly what the function sends today", () => {
    for (const s of [
      "Choose a password and you",
      "The link works once and expires after a while.",
      "Your Holis Wellness account is ready",
    ]) {
      expect(sql).toContain(s);
      expect(clients).toContain(s);
    }
  });

  it("the function reads it and falls back to its own copy", () => {
    expect(clients).toMatch(/eq\("template_key", "account_welcome"\)/);
    expect(clients).toMatch(/emailButton\(link, "Choose my password"\)/);
  });
});

describe("appointment requests use their panel templates again", () => {
  it("the team gets the staff template, the guest the client one", () => {
    expect(notify).toMatch(/body\.request_kind === "appointment"/);
    expect(notify).toMatch(/loadTemplate\(supabase, "appointment_request"\)/);
    expect(notify).toMatch(/loadTemplate\(supabase, "appointment_request_client"\)/);
  });

  it("only emails a guest who has just left a request — the path is public", () => {
    const fn = notify.slice(notify.indexOf("async function handleAppointmentRequest"), notify.indexOf("async function handleLegacyPayload"));
    expect(fn).toMatch(/\.eq\("status", "pending"\)/);
    expect(fn).toMatch(/\.gte\("created_at", since\)/);
    expect(fn).toMatch(/15 \* 60 \* 1000/);
  });

  it("escapes what the guest typed", () => {
    const fn = notify.slice(notify.indexOf("async function handleAppointmentRequest"), notify.indexOf("async function handleLegacyPayload"));
    expect(fn).toMatch(/tableRow\("Nombre", escHtml\(guestName\)\)/);
  });
});

describe("the treatment confirmation template is brought up to date, carefully", () => {
  it("adds the reservation, the price before the coupon, the coupon and the policy", () => {
    for (const v of ["{{reservation_id}}", "{{service_price}}", "{{coupon_code}}", "{{policy}}"]) expect(sql).toContain(v);
  });

  it("only if nobody edited it since, and never overwrites a template already there", () => {
    expect(sql).toMatch(/and md5\(body_html\) = '670062c1b34af0607a80bee10bc54289'/);
    expect((sql.match(/on conflict \(template_key\) do nothing/g) ?? []).length).toBe(2);
  });
});

describe("the panel shows the new templates", () => {
  it("has a place and a preview for each", () => {
    expect(panel).toMatch(/cancellation: "Treatment cancellations"/);
    expect(panel).toMatch(/account: "Website accounts"/);
    expect(panel).toMatch(/if \(category === "cancellation"\)/);
    expect(panel).toMatch(/if \(category === "account"\)/);
  });
});
