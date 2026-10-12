import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import "@/i18n";
import { PassRequestDialog, type PassPick } from "@/components/PassRequestDialog";

// The PayPal button is replaced by a stand-in that remembers what it would send.
const paypal: { body: (() => any) | null; onSuccess: ((r: any) => void) | null; disabled?: boolean } = { body: null, onSuccess: null };
vi.mock("@/components/payments/PayPalCheckout", () => ({
  PayPalCheckout: (props: any) => {
    paypal.body = props.createOrderBody;
    paypal.onSuccess = props.onSuccess;
    paypal.disabled = props.disabled;
    return <div data-testid="paypal">PayPal</div>;
  },
}));
// A plain input for the phone (the real one is a country picker).
vi.mock("@/components/booking/PhoneField", () => ({
  PhoneField: (props: any) => (
    <input placeholder={props.placeholder} value={props.value} onChange={(e) => props.onChange(e.target.value)} />
  ),
  isValidPhoneNumber: (v: string) => /^\+\d{8,15}$/.test(v),
}));
const db = vi.hoisted(() => ({
  rpc: vi.fn(async () => ({ data: { id: "uo-free", code: "AF2270" }, error: null })),
  invoke: vi.fn(async () => ({ data: { ok: true }, error: null })),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn(), rpc: db.rpc, functions: { invoke: db.invoke } },
}));
const account: { current: any } = { current: null };
vi.mock("@/hooks/useAccountDetails", () => ({ useAccountDetails: () => account.current }));
// Her local discount (40%) and her coupons, as the database would answer.
const quote = vi.fn();
vi.mock("@/lib/localDiscount", async (orig) => ({
  ...(await orig<typeof import("@/lib/localDiscount")>()),
  useLocalDiscounts: () => ({ data: [{ display_name: "Zhijian Chen", local_discount_pct: 40 }] }),
  quoteTeacherPrice: (...a: any[]) => quote(...a),
  rememberIdDocument: vi.fn(),
}));

const pick: PassPick = {
  teacherId: "t1", teacherName: "Zhijian Chen", membershipId: "11111111-1111-4111-8111-111111111111",
  membershipName: "5-Class Pass", price: 101, paymentNote: "SINPE 8888-8888", acceptsPaypal: true,
};

function mount(p: PassPick) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  act(() => createRoot(el).render(<PassRequestDialog pick={p} onOpenChange={() => {}} />));
  return document.body;
}
function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => { setter.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
}
const byPlaceholder = (body: HTMLElement, p: string) =>
  body.querySelector(`input[placeholder^="${p}"]`) as HTMLInputElement;
const click = (el: Element) => act(() => { (el as HTMLElement).click(); });
const radio = (body: HTMLElement, label: string) =>
  Array.from(body.querySelectorAll('[role="radio"]')).find((b) => b.textContent === label)!;

function fillContact(body: HTMLElement) {
  type(byPlaceholder(body, "Your name"), "  Ana Pérez ");
  type(byPlaceholder(body, "Email"), "ana@example.com");
  type(byPlaceholder(body, "Phone"), "+50688887777");
}
function giveId(body: HTMLElement, kind: "Costa Rican cédula" | "Passport or other ID", number: string) {
  click(radio(body, kind));
  type(byPlaceholder(body, kind === "Costa Rican cédula" ? "Cédula number" : "Passport or ID number"), number);
}

describe("buying a teacher's pass online", () => {
  beforeEach(() => {
    document.body.innerHTML = ""; paypal.body = null; paypal.onSuccess = null;
    account.current = null; quote.mockReset();
  });

  it("offers PayPal — and no other way to pay her any more", () => {
    const body = mount(pick);
    expect(body.textContent).toMatch(/Pay Zhijian online/);
    expect(body.querySelector("[data-testid=paypal]")).not.toBeNull();
    expect(body.textContent).toMatch(/straight to Zhijian's PayPal/);
    expect(body.textContent).not.toMatch(/another way/);
    expect(body.textContent).not.toMatch(/Tell Zhijian/);
    expect(body.textContent).not.toMatch(/SINPE 8888-8888/);
  });

  it("every field is required but the coupon: name, email, phone and ID", () => {
    const body = mount(pick);
    expect(paypal.disabled).toBe(true);
    expect(paypal.body!()).toBeNull();
    fillContact(body);
    expect(paypal.disabled).toBe(true); // no ID yet
    giveId(body, "Passport or other ID", "X1234567");
    expect(paypal.disabled).toBe(false);
  });

  it("sends her pass and the ID, not a price — the server sets the amount", () => {
    const body = mount(pick);
    fillContact(body);
    giveId(body, "Passport or other ID", "X1234567");
    expect(paypal.body!()).toEqual({
      kind: "teacher_pass", membership_id: pick.membershipId,
      guest_name: "Ana Pérez", guest_email: "ana@example.com", guest_phone: "+50688887777",
      id_document: "X1234567", id_document_type: "other", coupon_code: null,
    });
    expect(JSON.stringify(paypal.body!())).not.toMatch(/price|amount/);
  });

  it("a Costa Rican cédula: 'Local discount applied' and the price changes at once", () => {
    const body = mount(pick);
    fillContact(body);
    giveId(body, "Costa Rican cédula", "1-0234-0567");
    expect(body.textContent).toMatch(/Local discount applied — 40% off/);
    expect(body.textContent).toMatch(/Zhijian may ask to see it in class/);
    expect(body.textContent).toMatch(/Total\$60\.6/);
    // A coupon does not add to it: the coupon field is gone.
    expect(byPlaceholder(body, "Coupon code")).toBeNull();
    expect(paypal.body!()).toMatchObject({ id_document: "1-0234-0567", id_document_type: "cr_cedula", coupon_code: null });
  });

  it("anything that is not a cédula shows nothing and keeps the price", () => {
    const body = mount(pick);
    fillContact(body);
    giveId(body, "Passport or other ID", "123456789"); // a US passport has 9 digits too
    expect(body.textContent).not.toMatch(/Local discount/);
    expect(body.textContent).toMatch(/Total\$101/);
    // A cédula that is not 9 digits is not accepted either.
    giveId(body, "Costa Rican cédula", "1234");
    expect(body.textContent).toMatch(/A Costa Rican cédula has 9 digits/);
    expect(body.textContent).not.toMatch(/Local discount applied/);
    expect(paypal.disabled).toBe(true);
  });

  it("her coupon comes off when there is no local discount", async () => {
    quote.mockResolvedValue({
      price: 90.9, base: 101, discount: 10.1, local: false, local_pct: 40,
      coupon: "FRIEND10", coupon_status: "applied", coupon_type: "percentage", coupon_value: 10,
    });
    const body = mount(pick);
    fillContact(body);
    giveId(body, "Passport or other ID", "X1234567");
    type(byPlaceholder(body, "Coupon code"), "friend10");
    const apply = Array.from(body.querySelectorAll("button")).find((b) => b.textContent === "Apply")!;
    await act(async () => { apply.click(); });
    expect(quote).toHaveBeenCalledWith("Zhijian Chen", 101, expect.objectContaining({ type: "other" }), "FRIEND10");
    expect(body.textContent).toMatch(/FRIEND10 applied — 10% off/);
    expect(body.textContent).toMatch(/Total\$90\.9/);
    expect(paypal.body!()).toMatchObject({ coupon_code: "FRIEND10" });
  });

  it("a 100% coupon typed without pressing Apply: applied on leaving the field, then free — no ID needed with a coupon", async () => {
    quote.mockResolvedValue({
      price: 0, base: 101, discount: 101, local: false, local_pct: 40,
      coupon: "PRUEBAEVE", coupon_status: "applied", coupon_type: "percentage", coupon_value: 100,
    });
    db.rpc.mockClear(); db.invoke.mockClear();
    const body = mount(pick);
    fillContact(body);
    const field = byPlaceholder(body, "Coupon code");
    type(field, "pruebaeve");
    // Leaving the field applies it — "Apply" was never pressed.
    await act(async () => { field.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    expect(body.textContent).toMatch(/PRUEBAEVE applied — 100% off/);
    expect(body.textContent).toMatch(/Total\$0/);
    // With the coupon the ID is optional: nothing is missing, it goes straight through.
    expect(body.textContent).not.toMatch(/To continue, please add/);
    expect(body.textContent).toMatch(/Your ID \(optional with your coupon\)/);
    const confirm = () => Array.from(body.querySelectorAll("button")).find((b) => b.textContent?.startsWith("Confirm — free with coupon"))!;
    expect(confirm().disabled).toBe(false);
    await act(async () => { confirm().click(); });
    expect(db.rpc).toHaveBeenCalledWith("claim_teacher_pass_with_coupon", expect.objectContaining({
      _membership_id: pick.membershipId, _coupon: "PRUEBAEVE", _id_document: null, _id_document_type: null,
    }));
    expect(db.invoke).toHaveBeenCalledWith("send-membership-order-email", { body: { userOfferingId: "uo-free" } });
    expect(body.textContent).toMatch(/Your pass is ready/);
  });

  it("Enter in the coupon field applies it too", async () => {
    quote.mockResolvedValue({
      price: 90.9, base: 101, discount: 10.1, local: false, local_pct: 40,
      coupon: "FRIEND10", coupon_status: "applied", coupon_type: "percentage", coupon_value: 10,
    });
    const body = mount(pick);
    const field = byPlaceholder(body, "Coupon code");
    type(field, "friend10");
    await act(async () => { field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    expect(body.textContent).toMatch(/FRIEND10 applied — 10% off/);
  });

  it("signed in: the form is filled in from the account", () => {
    account.current = {
      userId: "u1", name: "Ana Pérez", email: "ana@example.com", phone: "+50688887777",
      idDocument: "1-0234-0567", idDocumentType: "cr_cedula",
    };
    const body = mount(pick);
    expect(byPlaceholder(body, "Your name").value).toBe("Ana Pérez");
    expect(byPlaceholder(body, "Email").value).toBe("ana@example.com");
    expect(body.textContent).toMatch(/Local discount applied/);
    expect(paypal.disabled).toBe(false);
  });

  it("after paying: the pass is ready and the code is on its way by email", () => {
    const body = mount(pick);
    fillContact(body);
    giveId(body, "Passport or other ID", "X1234567");
    act(() => paypal.onSuccess!({ ok: true, kind: "teacher_pass" }));
    expect(body.textContent).toMatch(/Your pass is ready/);
    expect(body.textContent).toMatch(/emailed your pass code and booking link to ana@example\.com/);
  });

  it("no PayPal of her own (as for now, for every teacher): bought online, paid to Holis", () => {
    const body = mount({ ...pick, acceptsPaypal: false });
    expect(body.querySelector("[data-testid=paypal]")).not.toBeNull();
    expect(body.textContent).toMatch(/Pay online/);
    expect(body.textContent).toMatch(/paid to Holis Wellness Center/);
    expect(body.textContent).not.toMatch(/Pay Zhijian online/);
    expect(body.textContent).not.toMatch(/straight to Zhijian's PayPal/);
    expect(body.textContent).not.toMatch(/another way/);
  });

  it("a pass with no price is never bought online — then how to pay her, and let her know", () => {
    const body = mount({ ...pick, acceptsPaypal: false, price: null });
    expect(body.querySelector("[data-testid=paypal]")).toBeNull();
    expect(body.textContent).toMatch(/How to pay Zhijian/);
    expect(body.textContent).toMatch(/Tell Zhijian/);
  });
});
