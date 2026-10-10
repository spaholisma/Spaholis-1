import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { teacherCompraClick } from "@/lib/classCheckout";
import { draftFromRow, validatePayMethods, TeacherPaymentMethods } from "@/components/teacher/TeacherPaymentMethods";

// Each teacher switches on how her students can pay her online: PayPal and/or
// CompraClick. Cash at the class is always on, so it is not a setting.
const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8").replace(/\r\n/g, "\n");

const row = {
  id: "t1", paypal_enabled: true, paypal_email: "eve@example.com",
  compraclick_enabled: false, compraclick_url: null, payment_instructions: "SINPE 8888-8888",
};

describe("her payment settings", () => {
  it("a method can only be switched on with what it needs", () => {
    expect(validatePayMethods({ ...draftFromRow(row), paypalOn: true, paypalEmail: "" }))
      .toEqual({ ok: false, error: "Add your PayPal email to switch PayPal on" });
    expect(validatePayMethods({ ...draftFromRow(row), compraclickOn: true, compraclickUrl: "" }))
      .toEqual({ ok: false, error: "Add your CompraClick link to switch CompraClick on" });
    expect(validatePayMethods({ ...draftFromRow(row), compraclickOn: true, compraclickUrl: "http://bac.example/x" }))
      .toEqual({ ok: false, error: "Your CompraClick link must start with https://" });
    expect(validatePayMethods({ ...draftFromRow(row), paypalEmail: "not an email" }).ok).toBe(false);
  });

  it("saves the switches and keeps what she typed when one is off", () => {
    const res = validatePayMethods({
      paypalOn: false, paypalEmail: " Eve@Example.com ", compraclickOn: true,
      compraclickUrl: " https://bac.example/pay/eve ", other: "SINPE", cashOn: true,
    });
    expect(res).toEqual({
      ok: true,
      values: {
        paypal_enabled: false, paypal_email: "eve@example.com",
        compraclick_enabled: true, compraclick_url: "https://bac.example/pay/eve",
        payment_instructions: "SINPE", cash_enabled: true,
      },
    });
  });

  it("shows her cash switch, then PayPal and CompraClick — editable when she manages her payments", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    act(() => createRoot(el).render(<TeacherPaymentMethods teacher={{ ...row, manages_payments: true }} onSaved={() => {}} />));
    const switches = Array.from(el.querySelectorAll("[role=switch]")).map((s) => s.getAttribute("aria-label"));
    expect(switches).toEqual(["Pay cash in person", "PayPal", "CompraClick"]);
    expect(el.textContent).toMatch(/Holis Wellness Center takes every online payment/);
    // PayPal is on, so its email box shows; CompraClick is off, so its link box doesn't.
    expect(el.querySelector('input[type="email"]')).not.toBeNull();
    expect(el.querySelector('input[type="url"]')).toBeNull();
    act(() => (el.querySelector('[aria-label="CompraClick"]') as HTMLElement).click());
    expect(el.querySelector('input[type="url"]')).not.toBeNull();
  });
});

describe("who can be paid with CompraClick", () => {
  const teachers = [
    { display_name: "Evelina", compraclick_url: "https://bac.example/eve" },
    { display_name: "Petra", compraclick_url: null },
  ];
  it("only a teacher with CompraClick switched on", () => {
    expect(teacherCompraClick("evelina ", teachers)).toBe("https://bac.example/eve");
    expect(teacherCompraClick("Petra", teachers)).toBeNull();
    expect(teacherCompraClick("Nobody", teachers)).toBeNull();
    expect(teacherCompraClick(null, teachers)).toBeNull();
    expect(teacherCompraClick("Evelina", undefined)).toBeNull();
  });
});

describe("the database", () => {
  const sql = read("supabase/migrations/20261003150000_teacher_pay_methods.sql");

  it("her switches, and a link that must be https", () => {
    expect(sql).toMatch(/add column if not exists paypal_enabled boolean not null default true/);
    expect(sql).toMatch(/add column if not exists compraclick_enabled boolean not null default false/);
    expect(sql).toMatch(/compraclick_url ~\* '\^https:\/\/\[\^\[:space:\]\]\+\$'/);
    expect(sql).toMatch(/'compraclick'::text\]\)\)/);
  });

  it("pages only learn what she has switched on — PayPal yes/no, her CompraClick link", () => {
    expect(sql.match(/\(t\.paypal_enabled and t\.paypal_email is not null and btrim\(t\.paypal_email\) <> ''\)/g)).toHaveLength(2);
    expect(sql.match(/case when t\.compraclick_enabled then nullif\(btrim\(t\.compraclick_url\), ''\) end/g)).toHaveLength(2);
  });

  it("a CompraClick reservation needs the session's teacher to have it on, and is held as pending", () => {
    const fn = sql.slice(sql.indexOf("create or replace function public.book_class_pay_compraclick"));
    expect(fn).toMatch(/where t\.active and t\.compraclick_enabled/);
    expect(fn).toMatch(/'reason', 'teacher_no_compraclick'/);
    expect(fn).toMatch(/'confirmed', 'pending', 'compraclick', v_price, 0, 'online'/);
    expect(fn).toMatch(/payment_method in \('cash', 'compraclick'\) and payment_status = 'pending'/);
    expect(fn).toMatch(/'compraclick_url', v_link/);
  });
});

describe("the server", () => {
  it("PayPal switched off: no online payment to her, even with her email saved", () => {
    const fn = read("supabase/functions/paypal-create-order/index.ts");
    expect(fn).toMatch(/if \(!t \|\| t\.paypal_enabled === false\) return null;/);
  });

  it("the booking email says CompraClick (with her link), not cash", () => {
    const fn = read("supabase/functions/send-booking-notification/index.ts");
    expect(fn).toMatch(/const linkDue = paymentMethod === "compraclick" && booking\.payment_status === "pending";/);
    expect(fn).toMatch(/linkDue \? `Pay with CompraClick/);
    expect(fn).toMatch(/COMPRACLICK \$\{formatCRC\(totalUsd\)\} · \$\{baseSubj\}/);
    expect(fn).toMatch(/tableRow\("Pay here"/);
  });

  it("notify-teacher is left alone (its live version predates the welcome email)", () => {
    const diff = execSync("git diff feature/teachers -- supabase/functions/notify-teacher", { cwd: root }).toString();
    expect(diff).toBe("");
  });
});

describe("the pages", () => {
  it("class booking: a CompraClick option only when she has it on; reserve, then her link", () => {
    const page = read("src/pages/ClassBooking.tsx");
    expect(page).toMatch(/const compraclickUrl = teacherCompraClick\(payee, teacherList\);/);
    expect(page).toMatch(/\{compraclickUrl && \(\s*<PayOption/);
    expect(page).toMatch(/rpc\("book_class_pay_compraclick" as any/);
    expect(page).toMatch(/<CompraClickButton href=\{linkDue\.url\}/);
  });

  it("class booking: reserving takes the guest straight to her CompraClick page", () => {
    const page = read("src/pages/ClassBooking.tsx");
    const fn = page.slice(page.indexOf("const handleCompraClickBooking"), page.indexOf("const handleRedeem"));
    // Opened during the click (before any await), so no pop-up blocker stops it.
    expect(fn.indexOf('window.open("", "_blank")')).toBeGreaterThan(-1);
    expect(fn.indexOf('window.open("", "_blank")')).toBeLessThan(fn.indexOf("await supabase.rpc"));
    expect(fn).toMatch(/payTab\.opener = null;\s*payTab\.location\.href = res\.compraclick_url;/);
    // A failed reservation closes the empty tab.
    expect(fn.match(/payTab\?\.close\(\);/g)).toHaveLength(2);
  });

  it("class booking: a switch she just changed shows at once — no reload", () => {
    const page = read("src/pages/ClassBooking.tsx");
    const q = page.slice(page.indexOf('queryKey: ["public-teachers"]'), page.indexOf("const payRoute"));
    expect(q).toMatch(/staleTime: 0,/);
    expect(q).toMatch(/refetchOnMount: "always",/);
    expect(q).toMatch(/refetchOnWindowFocus: "always",/);
  });

  it("passes: the CompraClick button sits with the other ways to pay her", () => {
    expect(read("src/components/PassRequestDialog.tsx")).toMatch(/<CompraClickButton href=\{pick\.compraclickUrl\}/);
    expect(read("src/components/PassChooser.tsx")).toMatch(/<CompraClickButton href=\{compraclickLink\}/);
  });

  it("her panel marks a CompraClick student to check; the admin sees and sets both switches", () => {
    expect(read("src/pages/TeacherPanel.tsx")).toMatch(/a\.payment_method === "compraclick"/);
    const admin = read("src/components/admin/AdminTeachersManager.tsx");
    expect(admin).toMatch(/patchTeacher\(r\.teacher\.id, \{ paypal_enabled: v \}\)/);
    expect(admin).toMatch(/patchTeacher\(r\.teacher\.id, \{ compraclick_enabled: v \}\)/);
  });
});

// ── For now: every online payment to Holis; cash in person is her switch;
//    only the teachers the team allows (Evelina) change the rest. ──
import { cashAccepted } from "@/lib/classCheckout";

describe("payments to Holis for now — cash is her switch", () => {
  const sql = read("supabase/migrations/20261010120000_teacher_payments_holis.sql");

  it("a teacher who doesn't manage her payments sees them locked, but can switch cash", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    act(() => createRoot(el).render(<TeacherPaymentMethods teacher={{ ...row, manages_payments: false }} onSaved={() => {}} />));
    expect(el.textContent).toMatch(/managed by Holis for now/);
    const cash = el.querySelector('[aria-label="Pay cash in person"]') as HTMLButtonElement;
    const paypal = el.querySelector('[aria-label="PayPal"]') as HTMLButtonElement;
    expect(cash.disabled).toBe(false);
    expect(paypal.disabled).toBe(true);
    expect((el.querySelector("fieldset") as HTMLFieldSetElement).disabled).toBe(true);
    // What she saves is her cash switch only.
    expect(validatePayMethods({ ...draftFromRow(row), cashOn: false }, false)).toEqual({ ok: true, values: { cash_enabled: false } });
  });

  it("cash is offered unless her teacher switched it off; classes with no registered teacher keep it", () => {
    const list = [{ display_name: "Evelina", accepts_cash: false }, { display_name: "Kerri", accepts_cash: true }];
    expect(cashAccepted("Evelina", list)).toBe(false);
    expect(cashAccepted("evelina ", list)).toBe(false);
    expect(cashAccepted("Kerri", list)).toBe(true);
    expect(cashAccepted("Victoria", list)).toBe(true);
    expect(cashAccepted(null, list)).toBe(true);
  });

  it("the database: payouts off, cash and 'manages payments' per teacher, locked for the others", () => {
    expect(sql).toMatch(/create or replace function public\.teacher_payouts_enabled\(\)\s+returns boolean language sql immutable as \$\$ select false \$\$;/);
    expect(sql).toMatch(/add column if not exists cash_enabled boolean not null default true/);
    expect(sql).toMatch(/add column if not exists manages_payments boolean not null default false/);
    expect(sql).toMatch(/update public\.teachers set manages_payments = true\s+where id = '0839ddb9-ebec-4917-bc7e-570fe0ed9594';  -- Evelina/);
    expect(sql).toMatch(/new\.manages_payments := old\.manages_payments;/);
    expect(sql).toMatch(/if not coalesce\(old\.manages_payments, false\) then[\s\S]{0,400}new\.payment_instructions := old\.payment_instructions;/);
    // The public lists only show her PayPal / CompraClick while payouts are on.
    expect(sql.match(/public\.teacher_payouts_enabled\(\)\s+and \(t\.paypal_enabled/g)).toHaveLength(2);
    expect(sql).toMatch(/t\.cash_enabled\n  from public\.teachers t/);
    // The booking functions refuse cash when she switched it off, and her own CompraClick while payouts are off.
    expect(sql).toContain(String.raw`\'reason\', \'cash_not_accepted\'`);
    expect(sql).toMatch(/if not public\.teacher_payouts_enabled\(\) then v_link := null; end if;/);
    expect(sql).toMatch(/raise exception 'book_class_pay_cash: place for the cash check not found'/);
    expect(sql).toMatch(/grant execute on function public\.public_teachers\(\) to public, anon, authenticated;/);
  });

  it("the private class request is titled as one", () => {
    const form = read("src/components/booking/ConsultationForm.tsx");
    expect(form).toContain(String.raw`const isPrivateRequest = !!privateKind || /^private\b/i.test(topic);`);
    expect(form).toMatch(/t\("consultation\.privateRequestTitle", \{ defaultValue: "Request a Private Class" \}\)/);
    expect(read("src/i18n/locales/es.json")).toContain('"privateRequestTitle": "Solicitar una clase privada"');
  });
});
