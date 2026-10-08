import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Teacher Panel → Private classes → Add: the "Which class" list offers the
// classes she picks by name (GYROTONIC® for everyone; Couple's & Connection
// and Kinesiology for Evelina), and picking one fills in the name.

const db = vi.hoisted(() => ({ inserted: [] as any[] }));
vi.mock("@/integrations/supabase/client", () => {
  const rows = () => {
    const q: any = {
      select: () => q, eq: () => q, gte: () => q,
      order: () => q,
      then: (ok: any) => Promise.resolve({ data: [], error: null }).then(ok),
      insert: async (row: any) => { db.inserted.push(row); return { error: null }; },
      update: () => ({ eq: async () => ({ error: null }) }),
    };
    return q;
  };
  return { supabase: { from: rows } };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { TeacherPrivateOfferingsEditor } from "@/components/teacher/TeacherPrivateOfferingsEditor";

const open = async (teacherName: string) => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TeacherPrivateOfferingsEditor teacherId="t1" teacherName={teacherName} />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: /add/i }));
  return screen.getByLabelText("Which class") as HTMLSelectElement;
};

describe("named private classes in the Teacher Panel", () => {
  it("Evelina sees GYROTONIC, Couple's & Connection and Kinesiology; picking one names it", async () => {
    const select = await open("Evelina");
    const labels = within(select).getAllByRole("option").map((o) => o.textContent);
    expect(labels).toEqual(expect.arrayContaining(["GYROTONIC® (on the tower)", "Couple's & Connection", "Kinesiology"]));
    fireEvent.change(select, { target: { value: "named:couples-connection" } });
    expect((screen.getByLabelText("Name on the website") as HTMLInputElement).value).toBe("Couple's & Connection");
    fireEvent.change(select, { target: { value: "named:kinesiology" } });
    expect((screen.getByLabelText("Name on the website") as HTMLInputElement).value).toBe("Kinesiology");
  });

  it("is saved with no schedule class, under its own name", async () => {
    db.inserted = [];
    const select = await open("Evelina");
    fireEvent.change(select, { target: { value: "named:couples-connection" } });
    fireEvent.change(screen.getByLabelText(/2 people/i), { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(db.inserted).toHaveLength(1));
    expect(db.inserted[0]).toMatchObject({ teacher_id: "t1", class_id: null, title: "Couple's & Connection", price_two: 120, price_one: null });
  });

  it("another teacher sees GYROTONIC only", async () => {
    const select = await open("Ashley");
    const labels = within(select).getAllByRole("option").map((o) => o.textContent);
    expect(labels).toContain("GYROTONIC® (on the tower)");
    expect(labels).not.toContain("Couple's & Connection");
    expect(labels).not.toContain("Kinesiology");
  });
});
