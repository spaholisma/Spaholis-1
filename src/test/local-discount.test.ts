import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  cedulaForPricing, clampPct, idDocumentBody, idDocumentProblem, isIdDocumentValid, localApplies,
  localDiscountAmount, localPctFor, normalizeCrCedula, idDocumentOk, missingId,
} from "@/lib/localDiscount";

const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8").replace(/\r\n/g, "\n");
const sql = read("supabase/migrations/20261012120000_local_discount_cedula.sql");

describe("the cédula", () => {
  it("reads a Costa Rican cédula the same way the database does", () => {
    // Every case checked against normalize_cr_cedula() in Postgres.
    const cases: [string, string | null][] = [
      ["1-0234-0567", "102340567"], ["1 0234 0567", "102340567"], ["102340567", "102340567"],
      ["1-234-567", "102340567"], ["0102340567", "102340567"], ["01-0234-0567", "102340567"],
      ["  7-0123-0456 ", "701230456"], ["1.0234.0567", "102340567"],
      ["012345678", null], ["1234567890", null], ["155812345678", null], ["A1234567", null],
      ["X12345678", null], ["", null], ["10234056", null], ["9-12345-1", null],
    ];
    for (const [raw, want] of cases) expect(normalizeCrCedula(raw), raw).toBe(want);
  });

  it("the student says which ID it is — a passport number is never a cédula", () => {
    // A US passport has 9 digits too.
    expect(cedulaForPricing({ type: "other", number: "123456789" })).toBeNull();
    expect(cedulaForPricing({ type: "cr_cedula", number: "1-0234-0567" })).toBe("102340567");
    expect(localApplies({ type: "other", number: "123456789" }, 40)).toBe(false);
    expect(localApplies({ type: "cr_cedula", number: "123456789" }, 40)).toBe(true);
    // A teacher without a local discount: nothing changes.
    expect(localApplies({ type: "cr_cedula", number: "123456789" }, 0)).toBe(false);
  });

  it("is required: a type and a number that looks right", () => {
    expect(isIdDocumentValid({ type: null, number: "123456789" })).toBe(false);
    expect(isIdDocumentValid({ type: "cr_cedula", number: "1234" })).toBe(false);
    expect(isIdDocumentValid({ type: "cr_cedula", number: "1-0234-0567" })).toBe(true);
    expect(isIdDocumentValid({ type: "other", number: "X1" })).toBe(false);
    expect(isIdDocumentValid({ type: "other", number: "X1234567" })).toBe(true);
    expect(idDocumentProblem({ type: "cr_cedula", number: "1234" })).toBe("cedula");
    expect(idDocumentProblem({ type: "cr_cedula", number: "" })).toBe("");
    expect(idDocumentBody({ type: "other", number: " X1234567 " })).toEqual({ id_document: "X1234567", id_document_type: "other" });
  });
});

describe("the price", () => {
  it("40% off, rounded like the database: $23 → $13.80, $101 → $60.60, $70 → $42", () => {
    expect(localDiscountAmount(23, 40)).toBe(9.2);
    expect(localDiscountAmount(101, 40)).toBe(40.4);
    expect(localDiscountAmount(70, 40)).toBe(28);
    expect(localDiscountAmount(23, 0)).toBe(0);
  });

  it("each teacher's own percentage, by name", () => {
    const rows = [{ display_name: "Evelina", local_discount_pct: 40 }];
    expect(localPctFor(rows, " evelina ")).toBe(40);
    expect(localPctFor(rows, "Ashley")).toBe(0);
    expect(localPctFor(rows, null)).toBe(0);
    expect(clampPct("150")).toBe(100);
    expect(clampPct("-5")).toBe(0);
    expect(clampPct("abc")).toBe(0);
  });
});

describe("the database", () => {
  it("a per-teacher local discount, Evelina 40%, everyone else 0 — and only the team changes it", () => {
    expect(sql).toMatch(/add column if not exists local_discount_pct numeric\(5,2\) not null default 0/);
    expect(sql).toMatch(/check \(local_discount_pct >= 0 and local_discount_pct <= 100\)/);
    expect(sql).toMatch(/update public\.teachers set local_discount_pct = 40\s+where lower\(btrim\(display_name\)\) = 'evelina'/);
    expect(sql).toMatch(/new\.local_discount_pct := old\.local_discount_pct;/);
  });

  it("the local discount first; else her coupon; never both", () => {
    const fn = sql.slice(sql.indexOf("create or replace function public.teacher_price"));
    const local = fn.indexOf("public.normalize_cr_cedula(_id_document) is not null");
    const coupon = fn.indexOf("from public.teacher_coupons tc");
    expect(local).toBeGreaterThan(0);
    expect(coupon).toBeGreaterThan(local);
    expect(fn).toMatch(/'coupon_status', case when wanted <> '' then 'ignored_local' end/);
    expect(fn).toMatch(/tc\.teacher_id = _teacher_id and tc\.is_active/);
  });

  it("only the server prices by teacher id; the page gets a quote by name", () => {
    expect(sql).toMatch(/revoke all on function public\.teacher_price\(uuid, numeric, text, text\) from public, anon, authenticated;/);
    expect(sql).toMatch(/grant execute on function public\.teacher_price\(uuid, numeric, text, text\) to service_role;/);
    expect(sql).toMatch(/grant execute on function public\.quote_teacher_price\(text, numeric, text, text\) to anon, authenticated;/);
    expect(sql).toMatch(/grant execute on function public\.public_local_discounts\(\) to anon, authenticated;/);
  });

  it("keeps the ID with the booking, the pass and the profile — additive only", () => {
    for (const t of ["class_bookings", "user_offerings"]) {
      expect(sql).toMatch(new RegExp(`alter table public\\.${t}\\s+add column if not exists id_document text,\\s+add column if not exists id_document_type text,\\s+add column if not exists local_discount boolean not null default false;`));
    }
    expect(sql).toMatch(/alter table public\.profiles\s+add column if not exists id_document text,/);
    expect(sql).not.toMatch(/drop table|drop column(?! if exists)/i);
  });
});

describe("paypal-create-order", () => {
  const fn = read("supabase/functions/paypal-create-order/index.ts");
  const cls = fn.slice(fn.indexOf('if (body.kind === "class") {'), fn.indexOf('} else if (body.kind === "teacher_pass") {'));

  it("a class or event: her local discount or her coupon on one spot, else a Holis coupon as before", () => {
    expect(cls).toMatch(/const classTeacher = await sessionTeacher\(admin, \(sched as any\)\.instructor, cls\.instructor\);/);
    expect(cls).toMatch(/teacherPrice\(admin, classTeacher\.id, base, body, cls\.full_price_only \? null : wanted\)/);
    expect(cls).toMatch(/if \(!local && !teacherCoupon\) discount = await couponDiscount\(admin, wanted, base, String\(cls\.id\)\);/);
    expect(cls).toMatch(/amount = Math\.max\(0, Math\.round\(\(base \* qty - discount\) \* 100\) \/ 100\);/);
    expect(cls).toMatch(/unit_price: base, discount, local_discount: local, \.\.\.idOf\(body\)/);
  });

  it("only a cédula the student called a cédula is priced as local", () => {
    expect(fn).toMatch(/const cedula = body\.id_document_type === "cr_cedula" \? \(body\.id_document \|\| ""\)\.trim\(\) \|\| null : null;/);
    expect(fn).toMatch(/id_document_type: z\.enum\(\["cr_cedula", "other"\]\)\.optional\(\)\.nullable\(\)/);
  });

  it("a teacher's pass: a coupon that is not hers is refused, a free one is not sold online", () => {
    expect(fn).toMatch(/reason: "invalid_coupon", message: `That is not one of \$\{teacher\.display_name\}'s coupons\.`/);
    expect(fn).toMatch(/reason: "free_with_coupon"/);
  });
});

describe("paypal-capture-order", () => {
  const fn = read("supabase/functions/paypal-capture-order/index.ts");
  it("the booker's spot carries the ID and the discount; the price per row adds up to what was paid", () => {
    expect(fn).toMatch(/Math\.abs\(unit \* qty - disc - Number\(rec\.amount\)\) <= 0\.01/);
    expect(fn).toMatch(/i === 0 && t\.id_document \? \{ id_document: t\.id_document, id_document_type: t\.id_document_type \?\? null \}/);
    expect(fn).toMatch(/i === 0 && t\.local_discount \? \{ local_discount: true \}/);
  });
  it("a teacher's pass keeps the ID too", () => {
    const branch = fn.slice(fn.indexOf('if (rec.kind === "teacher_pass") {'), fn.indexOf("// offering"));
    expect(branch).toMatch(/t\.id_document \? \{ id_document: t\.id_document, id_document_type: t\.id_document_type \?\? null \}/);
    expect(branch).toMatch(/local discount \(Costa Rican cédula\)/);
  });
});

describe("the emails", () => {
  it("the teacher sees the student's ID — on a pass, a class and a private class", () => {
    expect(read("supabase/functions/send-membership-order-email/index.ts")).toMatch(/<strong>ID:<\/strong>/);
    expect(read("supabase/functions/notify-teacher/index.ts")).toMatch(/row\("ID", student\.id\)/);
    const priv = read("supabase/functions/send-private-class-request/index.ts");
    expect(priv).toMatch(/row\("ID", idNumber \?/);
    expect(priv).toMatch(/admin\.rpc\("teacher_price"/);
    expect(priv).toMatch(/local price \(\$\{Number\(quote\.local_pct\)\}% off/);
    // Every price in the emails keeps its dollar sign.
    expect(priv).toContain("`$${price.toFixed(2)} — ${esc(teacherName)}'s price`");
    expect(priv).toContain("quote?.local ? `$${Number(quote.price).toFixed(2)}");
    expect(priv).toContain("% off $${Number(quote.base).toFixed(2)}");
    expect(read("supabase/functions/send-membership-order-email/index.ts")).toContain("paid $${Number((o as any).price_paid ?? 0).toFixed(2)}");
  });
});

describe("the pages", () => {
  it("class booking: the ID is asked when paying online, and the PayPal button waits for it", () => {
    const page = read("src/pages/ClassBooking.tsx");
    expect(page).toMatch(/\{payMethod === "card" && canPayOnline && \(\s*<div[^>]*>\s*<IdDocumentField/);
    expect(page).toMatch(/disabled=\{!formData\.name \|\| !formData\.email \|\| !idReady\}/);
    expect(page).toMatch(/coupon_code: isLocal \? null/);
    // Cash at the class is the normal price.
    expect(page).toMatch(/formatPrice\(cashTotal\(Number\(cls\.price\), quantity\)\)/);
  });

  it("the drop-in opens its own window: a date, then PayPal to Holis", () => {
    const chooser = read("src/components/PassChooser.tsx");
    expect(chooser).toMatch(/if \(o\.type === "drop_in"\) \{ setDropIn\(o\); return; \}/);
    expect(chooser).toMatch(/<DropInDialog/);
  });

  it("'Or pay her another way' is gone from every pass", () => {
    for (const f of ["src/components/PassChooser.tsx", "src/components/PassRequestDialog.tsx", "src/components/TeacherPassStudio.tsx"]) {
      // (A pass with no price yet still says how to pay her and lets her know.)
      expect(read(f), f).not.toMatch(/another way/);
    }
  });

  it("a private class: phone and ID required, her coupon optional — and with it the ID too", () => {
    const form = read("src/components/booking/ConsultationForm.tsx");
    expect(form).toMatch(/if \(privateKind && \(!form\.phone \|\| !isValidPhoneNumber\(form\.phone\) \|\| !idDocumentOk\(idDoc, !!coupon && !isLocal\)\)\)/);
    expect(form).toMatch(/optional=\{!!coupon && !isLocal\}/);
  });

  it("the ID: required, optional once a coupon is applied — but typed, it must be right", () => {
    const empty = { type: null, number: "" } as any;
    expect(idDocumentOk(empty)).toBe(false);
    expect(idDocumentOk(empty, true)).toBe(true);
    expect(idDocumentOk({ type: "cr_cedula", number: "" }, true)).toBe(true);
    expect(idDocumentOk({ type: "cr_cedula", number: "12" }, true)).toBe(false);
    expect(idDocumentOk({ type: "cr_cedula", number: "1-0234-0567" })).toBe(true);
    expect(missingId(empty, true)).toEqual([]);
    expect(missingId(empty)).toEqual(["your ID (Costa Rican cédula, or passport / other ID)"]);
    expect(read("src/components/booking/ConsultationForm.tsx")).toMatch(/coupon: isLocal \? null : couponCode,/);
  });

  it("the team sets each teacher's percentage in Admin", () => {
    expect(read("src/components/admin/AdminTeachersManager.tsx")).toMatch(/patchTeacher\(r\.teacher\.id, \{ local_discount_pct: v \}\)/);
  });
});
