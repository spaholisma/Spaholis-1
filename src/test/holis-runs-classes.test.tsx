import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRoot } from "react-dom/client";
import { act } from "react";
import "@/i18n";

// 2026-10: the teachers chose not to use the Teacher Admin Panel. Holis
// Wellness Center runs the classes, passes, coupons and payments; the emails
// go to the guests and to Holis only. These tests hold that.

const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8").replace(/\r\n/g, "\n");

const paypal: { body: (() => any) | null } = { body: null };
vi.mock("@/components/payments/PayPalCheckout", () => ({
  PayPalCheckout: (props: any) => { paypal.body = props.createOrderBody; return <div data-testid="paypal">PayPal</div>; },
}));
vi.mock("@/components/booking/PhoneField", () => ({
  PhoneField: (props: any) => <input placeholder={props.placeholder} value={props.value} onChange={(e) => props.onChange(e.target.value)} />,
  isValidPhoneNumber: (v: string) => /^\+\d{8,15}$/.test(v),
}));
vi.mock("@/hooks/useAccountDetails", () => ({ useAccountDetails: () => null }));
const { quote, db } = vi.hoisted(() => ({
  quote: vi.fn(async (..._a: any[]): Promise<any> => null),
  db: {
    rpc: vi.fn(async (..._a: any[]): Promise<any> => ({ data: { id: "uo-free", code: "AB1234" }, error: null })),
    invoke: vi.fn(async () => ({ data: { ok: true }, error: null })),
  },
}));
vi.mock("@/lib/localDiscount", async (orig) => ({
  ...(await orig<typeof import("@/lib/localDiscount")>()),
  useStudioLocalPct: () => ({ data: 40 }),
  quoteHolisPrice: (...a: any[]) => quote(...a),
  rememberIdDocument: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: db.rpc, functions: { invoke: db.invoke } } }));

import { HolisPassCheckout } from "@/components/payments/HolisCheckout";
import { withStudioPrices } from "@/lib/privateOfferings";
import { TEACHER_PANEL_ENABLED } from "@/lib/features";

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => { setter.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
}
const byPlaceholder = (p: string) => document.body.querySelector(`input[placeholder^="${p}"]`) as HTMLInputElement;

describe("the Teacher Admin Panel is paused, not deleted", () => {
  it("one switch, off: no My Account card, no menu link, /teacher goes to My Account", () => {
    expect(TEACHER_PANEL_ENABLED).toBe(false);
    expect(read("src/pages/ClientDashboard.tsx")).toMatch(/\{isTeacher && TEACHER_PANEL_ENABLED && \(\n\s+<Link\n\s+to="\/teacher"/);
    expect(read("src/components/ProfileMenu.tsx")).toMatch(/\{isTeacher && TEACHER_PANEL_ENABLED && \(/);
    expect(read("src/App.tsx")).toMatch(/\{ path: "\/teacher", element: TEACHER_PANEL_ENABLED \? <TeacherPanel \/> : <Navigate to="\/dashboard" replace \/> \}/);
    // The panel itself is all still there.
    expect(read("src/pages/TeacherPanel.tsx").length).toBeGreaterThan(10_000);
  });
});

describe("one price rule: Holis' (holis_price)", () => {
  const sql = read("supabase/migrations/20261014120000_holis_pricing.sql");
  it("the local discount is one studio setting, starting from the 40% Evelina had", () => {
    expect(sql).toMatch(/create table if not exists public\.studio_pricing/);
    expect(sql).toMatch(/select 1, coalesce\(\(select max\(t\.local_discount_pct\) from public\.teachers t where t\.active\), 0\)/);
    expect(sql).toMatch(/create policy studio_pricing_staff_update on public\.studio_pricing for update/);
    expect(read("src/components/admin/AdminCouponsManager.tsx")).toMatch(/<AdminLocalDiscountSetting \/>/);
  });

  it("local discount first, else a Holis coupon — with its limits and what it is for", () => {
    const fn = sql.slice(sql.indexOf("function public.holis_price"), sql.indexOf("function public.claim_offering_with_coupon"));
    expect(fn).toMatch(/if pct > 0 and public\.normalize_cr_cedula\(_id_document\) is not null then/);
    expect(fn).toMatch(/'coupon_status', case when wanted <> '' then 'ignored_local' end/);
    expect(fn).toMatch(/or \(c\.expires_at is not null and c\.expires_at < now\(\)\)/);
    expect(fn).toMatch(/or \(c\.max_uses is not null and c\.current_uses >= c\.max_uses\)/);
    expect(fn).toMatch(/'coupon_status', 'full_price_only'/);
    // A pass takes a coupon only when the team ticked it for that pass.
    expect(sql).toMatch(/alter table public\.coupons add column if not exists restricted_offering_ids uuid\[\];/);
    expect(fn).toMatch(/or \(_offering_id is not null and _offering_id = any\(c\.ro\)\)\) then/);
    expect(read("src/components/admin/AdminCouponsManager.tsx")).toMatch(/key: "restricted_offering_ids", label: "Passes & memberships"/);
  });

  it("a pass at $0 with a coupon is issued on the server and the use is counted", () => {
    const fn = sql.slice(sql.indexOf("function public.claim_offering_with_coupon"));
    expect(fn).toMatch(/v_quote := public\.holis_price\(coalesce\(o\.price, 0\),/);
    expect(fn).toMatch(/raise exception 'That coupon does not cover this pass in full';/);
    expect(fn).toMatch(/'active', 'coupon', v_code, v_token/);
    expect(fn).toMatch(/perform public\.increment_coupon_usage\(\(v_quote->>'coupon_id'\)::uuid\);/);
  });

  it("PayPal charges what holis_price says — a class, and a pass bought with or without an account", () => {
    const fn = read("supabase/functions/paypal-create-order/index.ts");
    expect(fn).toMatch(/admin\.rpc\("holis_price", \{/);
    expect(fn).toMatch(/const q = await holisPrice\(admin, listPrice, body, wanted, \{ offeringId: String\(\(off as any\)\.id\) \}\);/);
    expect(fn).toMatch(/reason: "missing_contact", message: "Your name and email are needed to send you the pass\."/);
    expect(fn).toMatch(/reason: "free_with_coupon"/);
    const cap = read("supabase/functions/paypal-capture-order/index.ts");
    expect(cap).toMatch(/guest_name: buyerName, guest_email: buyerEmail, guest_phone:/);
    expect(cap).toMatch(/const paid = Number\.isFinite\(Number\(rec\.amount\)\) \? Number\(rec\.amount\) : Number\(\(off as any\)\.price\);/);
    expect(cap.match(/admin\.rpc\("increment_coupon_usage", \{ _coupon_id: t\.coupon_id \}\)/g)).toHaveLength(2);
  });
});

describe("buying a Holis pass online", () => {
  beforeEach(() => { document.body.innerHTML = ""; paypal.body = null; quote.mockReset(); db.rpc.mockClear(); db.invoke.mockClear(); });
  const mount = (onPaid = vi.fn()) => {
    const el = document.createElement("div"); document.body.appendChild(el);
    act(() => createRoot(el).render(<HolisPassCheckout offeringId="off-5" price={101} onPaid={onPaid} />));
    return onPaid;
  };

  it("PayPal gets the pass, the guest and the Holis coupon — paid to Holis", async () => {
    quote.mockResolvedValue({ price: 85.85, base: 101, discount: 15.15, local: false, local_pct: 40, coupon: "MAXWELLNESS",
      coupon_status: "applied", coupon_type: "percentage", coupon_value: 15 });
    mount();
    expect(document.body.textContent).toMatch(/paid to Holis Wellness Center/);
    expect(document.body.textContent).not.toMatch(/teacher/i);
    type(byPlaceholder("Your name"), "Ana Pérez");
    type(byPlaceholder("Email"), "ana@example.com");
    type(byPlaceholder("Phone"), "+50688887777");
    const field = byPlaceholder("Coupon code");
    type(field, "maxwellness");
    await act(async () => { field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    expect(quote).toHaveBeenCalledWith(101, expect.anything(), "MAXWELLNESS", { classId: undefined, offeringId: "off-5" });
    expect(document.body.textContent).toMatch(/Total\$85\.85/);
    expect(paypal.body!()).toEqual({
      kind: "offering", offering_id: "off-5", user_id: null,
      guest_name: "Ana Pérez", guest_email: "ana@example.com", guest_phone: "+50688887777",
      id_document: null, id_document_type: null, coupon_code: "MAXWELLNESS",
    });
  });

  it("a coupon not ticked for passes is refused with a clear reason", async () => {
    quote.mockResolvedValue({ price: 101, base: 101, discount: 0, local: false, local_pct: 40, coupon: null, coupon_status: "not_for_this" });
    mount();
    const field = byPlaceholder("Coupon code");
    type(field, "STAFF");
    await act(async () => { field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    expect(document.body.textContent).not.toMatch(/STAFF applied/);
    expect(document.body.textContent).toMatch(/Total\$101/);
  });

  it("a coupon that covers it all: issued on the server, no PayPal", async () => {
    quote.mockResolvedValue({ price: 0, base: 101, discount: 101, local: false, local_pct: 40, coupon: "BUDDYPASS",
      coupon_status: "applied", coupon_type: "percentage", coupon_value: 100 });
    const onPaid = mount();
    type(byPlaceholder("Your name"), "Ana Pérez");
    type(byPlaceholder("Email"), "ana@example.com");
    type(byPlaceholder("Phone"), "+50688887777");
    const field = byPlaceholder("Coupon code");
    type(field, "BUDDYPASS");
    await act(async () => { field.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    expect(document.body.querySelector("[data-testid=paypal]")).toBeNull();
    const confirm = Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent?.startsWith("Confirm — free with coupon"))!;
    await act(async () => { confirm.click(); });
    expect(db.rpc).toHaveBeenCalledWith("claim_offering_with_coupon", expect.objectContaining({
      _offering_id: "off-5", _guest_email: "ana@example.com", _coupon: "BUDDYPASS",
    }));
    expect(db.invoke).toHaveBeenCalledWith("send-membership-order-email", { body: { userOfferingId: "uo-free" } });
    expect(onPaid).toHaveBeenCalledWith("ana@example.com");
  });
});

describe("private classes: Holis' prices, the same whoever teaches", () => {
  it("a teacher's own prices are replaced by the studio's on the website", () => {
    const o = { id: "o1", teacher_id: "t", teacher_name: "Evelina", teacher_photo: null, class_id: null, title: "GYROTONIC®",
      description: null, duration_minutes: 60, price_one: 120, price_two: null, price_group: null, price_extra: null };
    expect(withStudioPrices(o, { onePerson: 85, twoPeople: 113, upToFour: 170, extraPerson: 28 })).toMatchObject({
      price_one: 85, price_two: 113, price_group: 170, price_extra: 28, title: "GYROTONIC®", teacher_name: "Evelina",
    });
    expect(read("src/lib/privateOfferings.ts")).toMatch(/TEACHER_PANEL_ENABLED \|\| !query\.data \? query\.data : query\.data\.map\(\(o\) => withStudioPrices\(o, pricing\)\)/);
  });
});

describe("every email goes to the guests and to Holis — none to the teachers", () => {
  it("notify-teacher, the pass email and the private-class request keep their teacher copies switched off", () => {
    const nt = read("supabase/functions/notify-teacher/index.ts");
    expect(nt).toMatch(/const TEACHER_EMAILS_ENABLED = false;/);
    expect(nt).toMatch(/if \(teacherEmail && TEACHER_EMAILS_ENABLED\) \{/);
    expect(nt).toMatch(/if \(!TEACHER_EMAILS_ENABLED\) return json\(\{ ok: true, event, teacherEmailed: false, reason: "teacher_emails_off" \}\);/);
    // The students still hear about a cancelled or moved class, and Holis gets its copy.
    expect(nt).toMatch(/fromTemplate\(admin, "class_cancelled_student"/);
    expect(nt).toMatch(/await sendTeam\(team\.subject, team\.html\)/);
    const smo = read("supabase/functions/send-membership-order-email/index.ts");
    expect(smo).toMatch(/if \(TEACHER_EMAILS_ENABLED && teacher\?\.email\) \{/);
    const priv = read("supabase/functions/send-private-class-request/index.ts");
    expect(priv).toMatch(/if \(!TEACHER_EMAILS_ENABLED\) teacherEmail = "";/);
    expect(priv).toMatch(/The guest would like it with <strong>\$\{esc\(teacherName\)\}<\/strong>/);
  });
});

describe("private classes: Holis' list, Holis' prices (2026-10)", () => {
  it("shows the kinds of class without the teacher — Evelina keeps her name — one line each", async () => {
    const { holisPrivateChoices, keepsTeacherName } = await import("@/lib/privateOfferings");
    const offering = (id: string, teacher: string, title: string, classId: string | null) => ({
      id, teacher_id: teacher, teacher_name: teacher, teacher_photo: null, class_id: classId, title,
      description: null, duration_minutes: null, price_one: 85, price_two: 113, price_group: 170, price_extra: 28,
    });
    const list = holisPrivateChoices([
      { key: "o:1", title: "Aerial Yoga", classId: "c1", teacherName: "Kerri", teacherPhoto: "k.jpg", offering: offering("1", "Kerri", "Aerial Yoga", "c1") },
      { key: "c:2", title: "Aerial Yoga", classId: "c1", teacherName: "Ashley", teacherPhoto: null, offering: null },
      { key: "o:3", title: "GYROTONIC®", classId: null, teacherName: "Evelina", teacherPhoto: "e.jpg", offering: offering("3", "Evelina", "GYROTONIC®", null) },
      { key: "c:4", title: "Gyrokinesis®", classId: "c4", teacherName: "Evelina", teacherPhoto: "e.jpg", offering: null },
    ]);
    expect(list.map((c) => [c.title, c.teacherName])).toEqual([
      ["Aerial Yoga", null], ["Gyrokinesis®", "Evelina"], ["GYROTONIC®", "Evelina"],
    ]);
    // A class with no teacher shown names nobody in the request, and is not her private class.
    expect(list[0]).toMatchObject({ teacherPhoto: null, offering: null, classId: "c1" });
    expect(keepsTeacherName("Evelina Bolognini")).toBe(true);
    expect(keepsTeacherName("Kerri")).toBe(false);
  });

  it("the picker says Holis' fixed price, never 'price confirmed by her'", () => {
    const picker = read("src/components/booking/PrivateClassPicker.tsx");
    expect(picker).toMatch(/if \(!TEACHER_PANEL_ENABLED\) \{\n\s+\/\/ Holis' fixed price/);
    expect(picker).toMatch(/consultation\.privateGoesToHolis"/);
    const dialog = read("src/components/PrivateClassDialog.tsx");
    expect(dialog).toMatch(/Your request goes to the Holis team, who will arrange the day and time with you by/);
  });

  it("a Holis coupon is checked on Apply and the price shown is the price with it", () => {
    const form = read("src/components/booking/ConsultationForm.tsx");
    expect(form).toMatch(/quoteHolisPrice\(privatePrice, idDoc, code, \{ classId: classChoice\?\.classId \?\? null \}\)/);
    expect(form).toMatch(/: couponOn \? couponAmount\(privatePrice\) : 0;/);
    expect(form).toMatch(/useEffect\(\(\) => \{ setAppliedCoupon\(null\); \}, \[classChoice\?\.key\]\);/);
    const fn = read("supabase/functions/send-private-class-request/index.ts");
    expect(fn).toMatch(/_coupon: couponTyped \|\| null, _class_id: couponClassId,/);
    expect(fn).toMatch(/with coupon \$\{esc\(quote\.coupon\)\}/);
    // Her name only when the guest chose her.
    expect(fn).toMatch(/if \(TEACHER_EMAILS_ENABLED \|\| norm\(pc\.teacher_name\) === norm\(t\.display_name\)\) \{/);
  });

  it("the emails the students get do not point to the Teacher Panel", () => {
    const nt = read("supabase/functions/notify-teacher/index.ts");
    expect(nt).toMatch(/\$\{TEACHER_EMAILS_ENABLED\n\s+\? `<a href="\$\{SITE\}\/teacher"/);
  });
});
