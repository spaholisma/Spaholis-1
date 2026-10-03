import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { onlinePayRoute } from "@/lib/classCheckout";

// Studio-rental model: Holis takes no student money. A teacher with a PayPal
// account on file is paid online straight to it; without one, cash at class.
const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8").replace(/\r\n/g, "\n");

describe("who an online class payment goes to", () => {
  const teachers = [
    { display_name: "Evelina Bolognini", accepts_paypal: true },
    { display_name: "Petra", accepts_paypal: false },
  ];

  it("a teacher with PayPal is paid directly", () => {
    expect(onlinePayRoute("Evelina Bolognini", teachers)).toBe("teacher");
    expect(onlinePayRoute("  evelina bolognini ", teachers)).toBe("teacher");
  });

  it("a teacher without PayPal yet: her students pay her in cash", () => {
    expect(onlinePayRoute("Petra", teachers)).toBe("cash_only");
  });

  it("a class with no teacher on it (e.g. a Holis event) is paid to Holis as before", () => {
    expect(onlinePayRoute(null, teachers)).toBe("holis");
    expect(onlinePayRoute("Guest facilitator", teachers)).toBe("holis");
  });

  it("offers nothing while the teachers are still loading — never a flash of Holis' PayPal", () => {
    expect(onlinePayRoute("Evelina Bolognini", undefined)).toBe("loading");
  });
});

describe("the database", () => {
  const sql = read("supabase/migrations/20261003120000_teacher_paypal.sql");

  it("keeps her PayPal email, and checks it looks like an email", () => {
    expect(sql).toMatch(/alter table public\.teachers add column if not exists paypal_email text;/);
    expect(sql).toMatch(/teachers_paypal_email_format/);
  });

  it("records who each PayPal order pays, and allows teacher passes", () => {
    expect(sql).toMatch(/paypal_orders add column if not exists payee_teacher_id uuid/);
    expect(sql).toMatch(/paypal_orders add column if not exists payee_email text/);
    expect(sql).toMatch(/array\['class'::text, 'offering'::text, 'teacher_pass'::text\]/);
  });

  it("the public only learns yes/no — never her email", () => {
    const portfolios = sql.slice(sql.indexOf("create function public.public_teacher_portfolios"), sql.indexOf("drop function if exists public.public_teachers"));
    const teachers = sql.slice(sql.indexOf("create function public.public_teachers"));
    for (const fn of [portfolios, teachers]) {
      expect(fn).toMatch(/\(t\.paypal_email is not null and btrim\(t\.paypal_email\) <> ''\)/);
      expect(fn).not.toMatch(/returns table\([^)]*paypal_email/);
    }
  });
});

describe("paypal-create-order", () => {
  const fn = read("supabase/functions/paypal-create-order/index.ts");

  it("only a class asked to pay the teacher — or a teacher's pass — names a payee", () => {
    expect(fn).toMatch(/if \(body\.pay_teacher\) \{/);
    expect(fn).toMatch(/\.\.\.\(payee \? \{ payee: \{ email_address: payee\.email \} \} : \{\}\)/);
    // Without pay_teacher a class is paid to Holis exactly as before.
    expect(fn.indexOf("payee = { teacherId: teacher.id, email };")).toBeGreaterThan(fn.indexOf("if (body.pay_teacher) {"));
  });

  it("refuses to pay a teacher who has no PayPal — cash at class instead", () => {
    expect(fn).toMatch(/reason: "teacher_no_paypal"/);
  });

  it("a Holis coupon can never discount the teacher's money", () => {
    const branch = fn.slice(fn.indexOf("if (body.pay_teacher) {"), fn.indexOf("const discount = await couponDiscount"));
    expect(branch).toMatch(/Holis coupons don't apply when you pay your teacher directly/);
  });

  it("a teacher's pass: her active pass at her price, contact required, paid to her", () => {
    const branch = fn.slice(fn.indexOf('} else if (body.kind === "teacher_pass") {'), fn.indexOf("} else {", fn.indexOf('} else if (body.kind === "teacher_pass") {')));
    expect(branch).toMatch(/from\("teacher_memberships"\)/);
    expect(branch).toMatch(/!\(m as any\)\.is_active \|\| !teacher\?\.active/);
    expect(branch).toMatch(/amount = Math\.round\(Number\(\(m as any\)\.price/);
    expect(branch).toMatch(/reason: "missing_contact"/);
  });

  it("stores the payee so the capture can check it", () => {
    expect(fn).toMatch(/payee_teacher_id: payee\?\.teacherId \?\? null, payee_email: payee\?\.email \?\? null/);
  });
});

describe("paypal-capture-order", () => {
  const fn = read("supabase/functions/paypal-capture-order/index.ts");

  it("checks the money reached HER account before giving anything", () => {
    const check = fn.indexOf("if (rec.payee_email) {");
    expect(check).toBeGreaterThan(fn.indexOf('cap?.status !== "COMPLETED"'));
    expect(check).toBeLessThan(fn.indexOf('if (rec.kind === "class") {'));
    expect(fn).toMatch(/reason: "payee_mismatch"/);
  });

  it("issues the same pass she would make by hand, with a code and a booking link", () => {
    const branch = fn.slice(fn.indexOf('if (rec.kind === "teacher_pass") {'), fn.indexOf("// offering"));
    expect(branch).toMatch(/teacher_id: \(m as any\)\.teacher_id, teacher_membership_id: \(m as any\)\.id/);
    expect(branch).toMatch(/source: "purchase", payment_id: capId/);
    expect(branch).toMatch(/code: await uniqueCode\(admin\), access_token: randomToken\(\)/);
    expect(branch).toMatch(/send-membership-order-email/);
  });
});

describe("the pass email", () => {
  const fn = read("supabase/functions/send-membership-order-email/index.ts");

  it("tells the teacher when one of her passes is sold online — and the team that it went to her", () => {
    expect(fn).toMatch(/if \(\(o as any\)\.teacher_id && isOnlinePurchase\)/);
    expect(fn).toMatch(/'s PayPal — not Holis\./);
    expect(fn).toMatch(/if \(teacher\?\.email\) \{/);
  });
});

describe("the pages", () => {
  it("class booking: pays the teacher when she takes PayPal, cash only when she doesn't", () => {
    const page = read("src/pages/ClassBooking.tsx");
    expect(page).toMatch(/const payRoute = onlinePayRoute\(payee, teacherList\);/);
    expect(page).toMatch(/\{canPayOnline && \(\s*<PayOption/);
    expect(page).toMatch(/pay_teacher: payRoute === "teacher"/);
    expect(page).toMatch(/coupon_code: payRoute === "teacher" \? null :/);
    expect(page).toMatch(/if \(payRoute === "cash_only" && payMethod === "card"\) setPayMethod\("cash"\);/);
  });

  it("a teacher's pass can be bought online from the pass chooser and the class page", () => {
    for (const f of ["src/components/PassChooser.tsx", "src/components/PassRequestDialog.tsx"]) {
      const src = read(f);
      expect(src, f).toMatch(/kind: "teacher_pass"/);
      expect(src, f).toMatch(/<PayPalCheckout/);
    }
  });

  it("the teacher sets her PayPal in her panel; the admin can see and set it too", () => {
    expect(read("src/pages/TeacherPanel.tsx")).toMatch(/paypal_email: paypal \|\| null/);
    expect(read("src/components/admin/AdminTeachersManager.tsx")).toMatch(/patchTeacher\(r\.teacher\.id, \{ paypal_email: v \|\| null \}\)/);
  });
});
