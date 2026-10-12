import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";

const { db } = vi.hoisted(() => ({
  db: { rpc: vi.fn() },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: db.rpc } }));
vi.mock("@/components/teacher/TeacherPrivateOfferingsEditor", () => ({ TeacherPrivateOfferingsEditor: () => null }));
vi.mock("@/hooks/useConfirm", () => ({
  useConfirm: () => ({ confirm: async () => true, confirmDialog: null }),
}));
vi.mock("@/hooks/useReasonPrompt", () => ({
  useReasonPrompt: () => ({ askReason: async () => ({ reason: "I am unwell", notify: true }), reasonDialog: null }),
}));

import { PrivateSessionDialog } from "@/components/teacher/TeacherPrivateClasses";

const request = {
  booking_id: "b1", created_at: "2026-10-11T15:00:00Z",
  guest_name: "eveprueba", guest_email: "guest@example.com", guest_phone: "+50688146760",
  kind_title: "Private Class", people: 1, class_title: "Cardio Vascular Breathwork",
  preferred: "Wednesday morning", status: "scheduled", note: "Bring a mat",
  quoted_price: 36, list_price: 60, local_discount: true, coupon_code: null,
  id_document: "1-0234-0567", id_document_type: "cr_cedula",
  location_label: "Holis Wellness Studio", location_address: null,
  session_id: "ps1", session_starts_at: "2026-10-14T16:30:00Z", session_minutes: 60,
};
const slot = {
  id: "ps1", booking_id: "b1", starts_at: "2026-10-14T16:30:00Z", duration_minutes: 60,
  title: "Cardio Vascular Breathwork · eveprueba", location: "Holis Wellness Studio",
  guest_name: "eveprueba", people: 1,
};

function mount(onChanged = vi.fn(), onOpenChange = vi.fn()) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  act(() => createRoot(el).render(
    <PrivateSessionDialog slot={slot} onOpenChange={onOpenChange} onChanged={onChanged} />,
  ));
  return { body: document.body, onChanged, onOpenChange };
}
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

describe("her private class, opened from the calendar", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    db.rpc.mockReset();
    db.rpc.mockImplementation(async (name: string) =>
      name === "teacher_private_class_requests" ? { data: [request], error: null } : { data: null, error: null });
  });

  it("shows everything from the request: when, where, guest, price, ID, note and contacts", async () => {
    const { body } = mount();
    await flush();
    const text = body.textContent!;
    expect(db.rpc).toHaveBeenCalledWith("teacher_private_class_requests");
    expect(text).toMatch(/Your private class/);
    expect(text).toMatch(/Cardio Vascular Breathwork · eveprueba/);
    expect(text).toMatch(/10:30 AM – 11:30 AM/); // 16:30 UTC = 10:30 in Costa Rica
    expect(text).toMatch(/\(60 min\)/);
    expect(text).toMatch(/Holis Wellness Studio/);
    expect(text).toMatch(/confirm with Holis Wellness Center that the studio is free/);
    expect(text).toMatch(/eveprueba · 1 person/);
    expect(text).toMatch(/Private Class · Cardio Vascular Breathwork/);
    expect(text).toMatch(/\$36/);
    expect(text).toMatch(/instead of/);
    expect(text).toMatch(/Local discount — Costa Rican cédula/);
    expect(text).toMatch(/Costa Rican cédula 1-0234-0567/);
    expect(text).toMatch(/They first asked for: Wednesday morning/);
    expect(text).toMatch(/Your note: Bring a mat/);
    expect((body.querySelector('a[href^="mailto:"]') as HTMLAnchorElement).href).toMatch(/^mailto:guest@example\.com/);
    expect((body.querySelector('a[href^="https://wa.me/"]') as HTMLAnchorElement).href).toBe("https://wa.me/50688146760");
    expect(text).toMatch(/Change the date/);
  });

  it("takes it off her calendar", async () => {
    const { body, onChanged, onOpenChange } = mount();
    await flush();
    const remove = Array.from(body.querySelectorAll("button")).find((b) => b.textContent?.includes("Remove from calendar"))!;
    await act(async () => { remove.click(); });
    await flush();
    expect(db.rpc).toHaveBeenCalledWith("teacher_remove_private_session", { _id: "ps1" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onChanged).toHaveBeenCalled();
  });

  it("cancels it with her reason — the guest and Holis are emailed by the server", async () => {
    const { body, onChanged, onOpenChange } = mount();
    await flush();
    const cancel = Array.from(body.querySelectorAll("button")).find((b) => b.textContent?.includes("Cancel this private class"))!;
    await act(async () => { cancel.click(); });
    await flush();
    expect(db.rpc).toHaveBeenCalledWith("teacher_cancel_private_class", { _booking_id: "b1", _reason: "I am unwell" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onChanged).toHaveBeenCalled();
  });
});
