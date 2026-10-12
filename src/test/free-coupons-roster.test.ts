import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { paymentDetails } from "@/pages/TeacherPanel";

const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8").replace(/\r\n/g, "\n");
const sql = read("supabase/migrations/20261013130000_free_coupons_roster.sql");
const fnOf = (name: string) => {
  const at = sql.indexOf(`function public.${name}`);
  const end = sql.indexOf("$$;", at);
  return sql.slice(at, end);
};

describe("a teacher's 100% coupon", () => {
  it("books the class at $0 — only her coupon, only when it really covers it all", () => {
    const fn = fnOf("book_class_free_with_teacher_coupon");
    expect(fn).toMatch(/v_quote := public\.teacher_price\(v_teacher, s\.price,/);
    expect(fn).toMatch(/coupon_status', ''\) <> 'applied' or \(v_quote->>'price'\)::numeric > 0/);
    expect(fn).toMatch(/'confirmed', 'not_required', 'free', v_quote->>'coupon'/);
    // Checks of its own: started, full, always paid in full, already booked, ID.
    expect(fn).toMatch(/s\.start_time <= now\(\)/);
    expect(fn).toMatch(/This class is full/);
    expect(fn).toMatch(/full_price_only/);
    expect(fn).toMatch(/You are already booked into this class/);
    expect(fn).toMatch(/Your ID is needed/);
  });

  it("issues her pass at $0 the same way, marked as given with a coupon", () => {
    const fn = fnOf("claim_teacher_pass_with_coupon");
    expect(fn).toMatch(/public\.teacher_price\(m\.teacher_id, coalesce\(m\.price, 0\),/);
    expect(fn).toMatch(/'active', 'coupon', v_code, v_token/);
    expect(sql).toMatch(/check \(source = any \(array\['purchase', 'admin_grant', 'order', 'teacher_order', 'coupon'\]\)\)/);
  });

  it("the pages use them instead of PayPal when the total is $0", () => {
    const form = read("src/components/payments/TeacherPassCheckout.tsx");
    expect(form).toMatch(/const free = !!coupon && total <= 0 && !!onFree;/);
    expect(form).toMatch(/Confirm — free with coupon \{coupon\?\.code\}/);
    expect(form).toMatch(/rpc\("claim_teacher_pass_with_coupon"/);
    expect(read("src/components/DropInDialog.tsx")).toMatch(/rpc\("book_class_free_with_teacher_coupon"/);
    const page = read("src/pages/ClassBooking.tsx");
    expect(page).toMatch(/if \(appliedCoupon\?\.teacher\) \{/);
    expect(page).toMatch(/rpc\("book_class_free_with_teacher_coupon" as any/);
    expect(page).not.toMatch(/That coupon makes the class free/);
  });
});

describe("never a silent grey button", () => {
  it("the class page says what is missing, and applies a typed coupon on Enter or on leaving the field", () => {
    const page = read("src/pages/ClassBooking.tsx");
    expect(page).toMatch(/onBlur=\{\(\) => \{ if \(couponCode\.trim\(\) && !appliedCoupon\) applyCouponCode\(\); \}\}/);
    expect(page).toMatch(/if \(e\.key === "Enter"\) \{ e\.preventDefault\(\); applyCouponCode\(\); \}/);
    expect(page).toMatch(/\{!idReady && <MissingIdNotice doc=\{idDoc\} couponApplied=\{couponOn\} \/>\}/);
    expect(page).toMatch(/\{!!appliedCoupon\?\.teacher && !idReady && <MissingIdNotice doc=\{idDoc\} couponApplied=\{couponOn\} \/>\}/);
    // The free button stays clickable and explains itself.
    expect(page).toMatch(/toast\.error\(`Please add \$\{missingId\(idDoc, couponOn\)\.join\(", "\)\} to confirm\.`\);/);
    // With a coupon applied the ID is optional.
    expect(page).toMatch(/const couponOn = !!appliedCoupon && !isLocal;\n\s+const idReady = idDocumentOk\(idDoc, couponOn\);/);
    expect(page).toMatch(/optional=\{couponOn\}/);
  });

  it("the server books / issues at $0 with a coupon and no ID", () => {
    const fix = read("supabase/migrations/20261013140000_coupon_id_optional.sql");
    expect(fix).not.toMatch(/raise exception 'Your ID is needed'/);
    expect(fix.match(/create or replace function public\.(book_class_free_with_teacher_coupon|claim_teacher_pass_with_coupon)\(/g)).toHaveLength(2);
    expect(fix.match(/v_doc text := nullif\(left\(btrim\(coalesce\(_id_document, ''\)\), 40\), ''\);/g)).toHaveLength(2);
    // A cédula, when given, still gets the local discount instead of the coupon.
    expect(fix.match(/case when v_type = 'cr_cedula' then v_doc end, _coupon\);/g)).toHaveLength(2);
    expect(fix).toMatch(/That coupon does not cover this class in full/);
    expect(fix).toMatch(/That coupon does not cover this pass in full/);
    expect(read("src/pages/ClassBooking.tsx")).not.toMatch(/Add your ID above to (pay|confirm)\./);
  });

  it("the payment form lists the missing fields above the button", () => {
    const form = read("src/components/payments/TeacherPassCheckout.tsx");
    expect(form).toMatch(/To continue, please add: <strong>\{missing\.join\(", "\)\}<\/strong>\./);
    expect(form).not.toMatch(/Please complete your name, email, phone and ID to continue to payment\./);
  });
});

describe("coupons in her class roster", () => {
  it("the roster shows the coupon, the local discount, the pass and the ID", () => {
    const fn = fnOf("teacher_session_roster");
    expect(fn).toMatch(/b\.coupon_code, b\.discount_amount, coalesce\(b\.local_discount, false\)/);
    expect(fn).toMatch(/left join public\.user_offerings uo on uo\.id = b\.user_offering_id/);
    expect(fn).toMatch(/public\.is_own_class_session\(_schedule_id\)/);
    expect(paymentDetails({
      id: "1", schedule_id: "s", guest_name: "Ana", guest_email: null, guest_phone: null, status: "booked",
      payment_status: "not_required", payment_method: "free", total_price: 0, user_offering_id: null,
      source: "online", attended: null, client_type: null,
      coupon_code: "PRUEBAEVE", discount_amount: 23, id_document: "1-0234-0567", id_document_type: "cr_cedula",
    })).toEqual(["Coupon PRUEBAEVE — $23.00 off", "Cédula: 1-0234-0567"]);
    expect(paymentDetails({
      id: "2", schedule_id: "s", guest_name: "Bo", guest_email: null, guest_phone: null, status: "booked",
      payment_status: "paid", payment_method: "credits", total_price: 0, user_offering_id: "uo",
      source: "online", attended: null, client_type: null, pass_name: "5-Class Pass", pass_code: "AF2270",
    })).toEqual(["Pass: 5-Class Pass (AF2270)"]);
  });

  it("she can add or change a coupon by hand — never on a pass or an online payment", () => {
    const fn = fnOf("teacher_set_student_coupon");
    expect(fn).toMatch(/not public\.is_own_class_session\(b\.schedule_id\)/);
    expect(fn).toMatch(/This student uses a pass or membership/);
    expect(fn).toMatch(/This student already paid online/);
    expect(fn).toMatch(/perform set_config\('holis\.teacher_coupon_update', 'on', true\);/);
    // The booking guard lets only that flag through, after the service role and staff.
    const guard = sql.slice(sql.indexOf("function public.class_bookings_restrict_customer_updates"));
    expect(guard.indexOf("holis.teacher_coupon_update")).toBeGreaterThan(guard.indexOf("has_role(auth.uid(), 'manager')"));
    expect(guard).toMatch(/RAISE EXCEPTION 'Cannot change coupon code';/);
    const panel = read("src/pages/TeacherPanel.tsx");
    expect(panel).toMatch(/sb\.rpc\("teacher_session_roster", \{ _schedule_id: s\.id \}\)/);
    expect(panel).toMatch(/sb\.rpc\("teacher_set_student_coupon", \{ _booking_id: newId, _coupon: coupon \}\)/);
    expect(panel).toMatch(/placeholder="Coupon \(optional\)"/);
  });
});

describe("the emails", () => {
  it("a class with the local discount says so instead of 'Coupon: None used'", () => {
    const fn = read("supabase/functions/send-booking-notification/index.ts");
    expect(fn).toMatch(/\} else if \(opts\.localDiscount && discount > 0\) \{/);
    expect(fn).toMatch(/notification_sent_at, booking_group_id, created_at, local_discount,/);
    expect(fn).toMatch(/paymentMethod === "free" && couponCode \? `Free — coupon \$\{couponCode\}`/);
    expect(fn).toMatch(/import \{ createClient \} from "npm:@supabase\/supabase-js@2\.57\.4";/);
  });

  it("a pass given with a coupon tells the teacher, not 'collect the payment'", () => {
    const fn = read("supabase/functions/send-membership-order-email/index.ts");
    expect(fn).toMatch(/const isCouponPass = \(o as any\)\.source === "coupon";/);
    expect(fn).toMatch(/match\(\/coupon\\s\+\(\\S\+\)\/i\)/);
    expect(fn).toMatch(/It was issued free of charge on the website with your coupon/);
  });
});
