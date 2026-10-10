import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Teacher Panel → Private classes → Add: the "Which class" list offers the
// classes the team added for her (Admin → Teachers → Details) — hers only —
// and picking one fills in the name.

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

const EVELINA = ["GYROTONIC®", "Couple's & Connection", "Kinesiology"];
const open = async (teacherName: string, choices: string[] = []) => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TeacherPrivateOfferingsEditor teacherId="t1" teacherName={teacherName} choices={choices} />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: /add/i }));
  return screen.getByLabelText("Which class") as HTMLSelectElement;
};

describe("named private classes in the Teacher Panel", () => {
  it("Evelina sees the three the team added for her; picking one names it", async () => {
    const select = await open("Evelina", EVELINA);
    const labels = within(select).getAllByRole("option").map((o) => o.textContent);
    expect(labels).toEqual(expect.arrayContaining(["GYROTONIC® (on the tower)", "Couple's & Connection", "Kinesiology"]));
    fireEvent.change(select, { target: { value: "named:Couple's & Connection" } });
    expect((screen.getByLabelText("Name on the website") as HTMLInputElement).value).toBe("Couple's & Connection");
    fireEvent.change(select, { target: { value: "named:Kinesiology" } });
    expect((screen.getByLabelText("Name on the website") as HTMLInputElement).value).toBe("Kinesiology");
  });

  it("is saved with no schedule class, under its own name", async () => {
    db.inserted = [];
    const select = await open("Evelina", EVELINA);
    fireEvent.change(select, { target: { value: "named:Couple's & Connection" } });
    fireEvent.change(screen.getByLabelText(/2 people/i), { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(db.inserted).toHaveLength(1));
    expect(db.inserted[0]).toMatchObject({ teacher_id: "t1", class_id: null, title: "Couple's & Connection", price_two: 120, price_one: null });
  });

  it("a teacher with nothing added sees only her schedule classes and \"Something else\" — not Evelina's", async () => {
    const select = await open("Ashley");
    const labels = within(select).getAllByRole("option").map((o) => o.textContent);
    expect(labels).toEqual(["Something else (not on the schedule)"]);
    expect(labels).not.toContain("GYROTONIC® (on the tower)");
    expect(labels).not.toContain("Couple's & Connection");
    expect(labels).not.toContain("Kinesiology");
  });
});

import { TeacherChoicesEditor } from "@/components/admin/TeacherChoicesEditor";

describe("Admin → Teachers → Details: the private classes she can pick", () => {
  it("adds one (Enter or Add), refuses a repeat, and removes one", () => {
    const onChange = vi.fn();
    const { rerender } = render(<TeacherChoicesEditor teacherName="Evelina" choices={["GYROTONIC®"]} onChange={onChange} />);
    const input = screen.getByLabelText("New private class for Evelina");
    fireEvent.change(input, { target: { value: "  Kinesiology " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith(["GYROTONIC®", "Kinesiology"]);

    rerender(<TeacherChoicesEditor teacherName="Evelina" choices={["GYROTONIC®", "Kinesiology"]} onChange={onChange} />);
    fireEvent.change(input, { target: { value: "kinesiology" } });
    fireEvent.click(screen.getByRole("button", { name: /Add/ }));
    expect(onChange).toHaveBeenCalledTimes(1); // the repeat was refused

    fireEvent.click(screen.getByRole("button", { name: "Remove GYROTONIC®" }));
    expect(onChange).toHaveBeenLastCalledWith(["Kinesiology"]);
  });
});
