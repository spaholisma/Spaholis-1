import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import "@/i18n";

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
vi.mock("@/components/booking/PhoneField", () => ({
  PhoneField: (props: any) => (
    <input placeholder={props.placeholder} value={props.value} onChange={(e) => props.onChange(e.target.value)} />
  ),
  isValidPhoneNumber: (v: string) => /^\+\d{8,15}$/.test(v),
}));
vi.mock("@/hooks/useAccountDetails", () => ({ useAccountDetails: () => null }));
vi.mock("@/lib/localDiscount", async (orig) => ({
  ...(await orig<typeof import("@/lib/localDiscount")>()),
  useLocalDiscounts: () => ({ data: [{ display_name: "Evelina", local_discount_pct: 40 }] }),
  quoteTeacherPrice: vi.fn(),
  rememberIdDocument: vi.fn(),
}));
vi.mock("@/lib/classClosures", async (orig) => ({
  ...(await orig<typeof import("@/lib/classClosures")>()),
  fetchClosedClassDays: async () => new Set<string>(),
}));

// Two weeks of the schedule, as the database would return it (hoisted: the
// mocked client needs it before the component is imported).
const { rows, query } = vi.hoisted(() => {
  const future = (days: number, hourUtc: number) => {
    const d = new Date(Date.now() + days * 86_400_000);
    d.setUTCHours(hourUtc, 0, 0, 0);
    return d.toISOString();
  };
  const cls = (id: string, title: string, instructor: string | null, category = "Studio Classes", price = 23) =>
    ({ id, title, instructor, price, category, is_active: true, requires_payment: true });
  const rows = [
    { id: "s1", start_time: future(2, 23), spots_remaining: 8, instructor: "Evelina", classes: cls("c1", "Cardio Vascular Breathwork", "Evelina") },
    { id: "s2", start_time: future(3, 14), spots_remaining: 0, instructor: "Kerri", classes: cls("c2", "Kundaluna + Gong", null) },
    { id: "s3", start_time: future(4, 14), spots_remaining: 5, instructor: null, classes: cls("c3", "Power Flow Yoga", "Melanie") },
    { id: "s4", start_time: future(5, 15), spots_remaining: 9, instructor: "Evelina", classes: cls("c4", "Wellness Sunday", "Evelina", "Special Event", 70) },
  ];
  const query: any = {};
  for (const m of ["select", "eq", "gte", "lte", "order"]) query[m] = () => query;
  query.limit = async () => ({ data: rows });
  return { rows, query };
});
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => query, rpc: vi.fn() } }));

import { DropInDialog, bookableDropIns, dropInDate } from "@/components/DropInDialog";

function mount() {
  const el = document.createElement("div");
  document.body.appendChild(el);
  act(() => createRoot(el).render(
    <MemoryRouter><DropInDialog open onOpenChange={() => {}} /></MemoryRouter>,
  ));
  return document.body;
}
function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => { setter.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
}
const byPlaceholder = (body: HTMLElement, p: string) =>
  body.querySelector(`input[placeholder^="${p}"]`) as HTMLInputElement;

describe("drop-in: which dates", () => {
  it("weekly classes still to come, with a spot left — not events, full classes or closed days", () => {
    const list = bookableDropIns(rows as any, new Set());
    expect(list.map((s) => s.id)).toEqual(["s1", "s3"]);
    const closedDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica" }).format(new Date(rows[0].start_time));
    expect(bookableDropIns(rows as any, new Set([closedDay])).map((s) => s.id)).toEqual(["s3"]);
    expect(bookableDropIns(rows as any, new Set(), new Date(), "c3").map((s) => s.id)).toEqual(["s3"]);
  });

  it("shows the day number of the date, in studio time", () => {
    // 2026-10-15 14:00 UTC = Thu 15 Oct, 8:00 AM in Costa Rica.
    expect(dropInDate("2026-10-15T14:00:00Z")).toEqual({ weekday: "Thu", day: 15, month: "Oct" });
    // 2026-10-14 03:00 UTC is still Tue 13 Oct in Costa Rica.
    expect(dropInDate("2026-10-14T03:00:00Z")).toEqual({ weekday: "Tue", day: 13, month: "Oct" });
  });
});

describe("drop-in: book and pay online", () => {
  beforeEach(() => { document.body.innerHTML = ""; paypal.body = null; paypal.onSuccess = null; });

  it("lists the dates, then opens the payment for that session — paid to Holis", async () => {
    const body = mount();
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(body.textContent).toMatch(/Cardio Vascular Breathwork/);
    expect(body.textContent).toMatch(/Power Flow Yoga/);
    expect(body.textContent).toMatch(/with Melanie/); // the class's usual teacher
    expect(body.textContent).not.toMatch(/Kundaluna/); // full
    expect(body.textContent).not.toMatch(/Wellness Sunday/); // an event
    expect(body.textContent).not.toMatch(/Tell /);

    const pick = Array.from(body.querySelectorAll("button")).find((b) => b.textContent?.includes("Cardio Vascular Breathwork"))!;
    act(() => { pick.click(); });
    expect(body.querySelector("[data-testid=paypal]")).not.toBeNull();
    expect(body.textContent).toMatch(/processed by Holis Wellness Center/);

    type(byPlaceholder(body, "Your name"), "Ana Pérez");
    type(byPlaceholder(body, "Email"), "ana@example.com");
    type(byPlaceholder(body, "Phone"), "+50688887777");
    const cedula = Array.from(body.querySelectorAll('[role="radio"]')).find((b) => b.textContent === "Costa Rican cédula")!;
    act(() => { (cedula as HTMLElement).click(); });
    type(byPlaceholder(body, "Cédula number"), "1-0234-0567");
    // Evelina's local discount on the screen; the server prices it again.
    expect(body.textContent).toMatch(/Local discount applied — 40% off/);
    expect(body.textContent).toMatch(/Total\$13\.8/);
    expect(paypal.body!()).toEqual({
      kind: "class", schedule_id: "s1",
      guest_name: "Ana Pérez", guest_email: "ana@example.com", guest_phone: "+50688887777",
      coupon_code: null, id_document: "1-0234-0567", id_document_type: "cr_cedula",
      quantity: 1, participant_names: ["Ana Pérez"], pay_teacher: false,
    });

    act(() => paypal.onSuccess!({ ok: true, kind: "class" }));
    expect(body.textContent).toMatch(/You're booked/);
    expect(body.textContent).toMatch(/sent the confirmation to ana@example\.com/);
  });
});
