import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
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

describe("buying a teacher's pass online", () => {
  beforeEach(() => { document.body.innerHTML = ""; paypal.body = null; paypal.onSuccess = null; });

  it("offers PayPal when she takes it — and keeps the other ways to pay her", () => {
    const body = mount(pick);
    expect(body.textContent).toMatch(/Pay Zhijian online/);
    expect(body.querySelector("[data-testid=paypal]")).not.toBeNull();
    expect(body.textContent).toMatch(/straight to Zhijian's PayPal/);
    expect(body.textContent).toMatch(/Or pay Zhijian another way/);
    expect(body.textContent).toMatch(/SINPE 8888-8888/);
  });

  it("needs a name and a valid email before PayPal can start", () => {
    mount(pick);
    expect(paypal.disabled).toBe(true);
    expect(paypal.body!()).toBeNull();
  });

  it("sends her pass, not a price — the server sets the amount", () => {
    const body = mount(pick);
    const [name, email, phone] = Array.from(body.querySelectorAll("input")) as HTMLInputElement[];
    type(name, "  Ana Pérez ");
    type(email, "ana@example.com");
    type(phone, "+50688887777");
    expect(paypal.disabled).toBe(false);
    expect(paypal.body!()).toEqual({
      kind: "teacher_pass", membership_id: pick.membershipId,
      guest_name: "Ana Pérez", guest_email: "ana@example.com", guest_phone: "+50688887777",
    });
    expect(JSON.stringify(paypal.body!())).not.toMatch(/price|amount/);
  });

  it("after paying: the pass is ready and the code is on its way by email", () => {
    const body = mount(pick);
    const [name, email] = Array.from(body.querySelectorAll("input")) as HTMLInputElement[];
    type(name, "Ana"); type(email, "ana@example.com");
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
    // Her other ways to pay are still there.
    expect(body.textContent).toMatch(/Or pay Zhijian another way/);
  });

  it("a pass with no price is never bought online", () => {
    const body = mount({ ...pick, acceptsPaypal: false, price: null });
    expect(body.querySelector("[data-testid=paypal]")).toBeNull();
    expect(body.textContent).toMatch(/How to pay Zhijian/);
  });
});
