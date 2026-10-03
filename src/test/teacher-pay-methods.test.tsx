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
      compraclickUrl: " https://bac.example/pay/eve ", other: "SINPE",
    });
    expect(res).toEqual({
      ok: true,
      values: {
        paypal_enabled: false, paypal_email: "eve@example.com",
        compraclick_enabled: true, compraclick_url: "https://bac.example/pay/eve",
        payment_instructions: "SINPE",
      },
    });
  });

  it("shows PayPal and CompraClick switches — never cash", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    act(() => createRoot(el).render(<TeacherPaymentMethods teacher={row} onSaved={() => {}} />));
    const switches = Array.from(el.querySelectorAll("[role=switch]")).map((s) => s.getAttribute("aria-label"));
    expect(switches).toEqual(["PayPal", "CompraClick"]);
    expect(el.textContent).toMatch(/always pay you in cash at the class/);
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
