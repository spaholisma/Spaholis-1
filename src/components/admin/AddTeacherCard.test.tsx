import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Admin → Teachers → Add a teacher, clicked through as the Admin would.
const db = vi.hoisted(() => ({
  rpc: vi.fn(),
  invoke: vi.fn(),
  sessions: [] as any[],
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ gte: async () => ({ data: db.sessions }) }) }),
    rpc: (...a: any[]) => db.rpc(...a),
    functions: { invoke: (...a: any[]) => db.invoke(...a) },
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

import { toast } from "sonner";
import { AddTeacherCard } from "./AddTeacherCard";

const soon = new Date(Date.now() + 3 * 86400000).toISOString();

beforeEach(() => {
  db.rpc.mockReset();
  db.invoke.mockReset();
  vi.mocked(toast.success).mockReset();
  vi.mocked(toast.warning).mockReset();
  db.sessions = [
    { instructor: "Evelina", start_time: soon, is_cancelled: false, classes: { instructor: null } },
    { instructor: "Melanie", start_time: soon, is_cancelled: false, classes: { instructor: null } },
    { instructor: "Melanie Moss", start_time: soon, is_cancelled: false, classes: { instructor: null } },
  ];
});

const fill = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("adding a teacher", () => {
  it("offers the names already on the schedule, and picking one fills it in", async () => {
    const onAdded = vi.fn();
    render(<AddTeacherCard teacherNames={[]} onAdded={onAdded} />);
    const chip = await screen.findByRole("button", { name: /Evelina · 1 upcoming/ });
    fireEvent.click(chip);
    expect((screen.getByLabelText(/Her name, as on the class schedule/) as HTMLInputElement).value).toBe("Evelina");
    expect(screen.getByText(/they count as hers/)).toBeTruthy();
  });

  it("warns when the name is on no class, or spelled another way elsewhere", async () => {
    render(<AddTeacherCard teacherNames={[]} onAdded={vi.fn()} />);
    await screen.findByRole("button", { name: /Evelina/ });
    fill(/Her name/, "Nadia");
    expect(screen.getByText(/No class uses this name yet/)).toBeTruthy();
    fill(/Her name/, "Melanie Moss");
    expect(screen.getByText(/Also on the schedule as “Melanie”/)).toBeTruthy();
  });

  it("needs a real email before it can add", async () => {
    render(<AddTeacherCard teacherNames={[]} onAdded={vi.fn()} />);
    fill(/Her name/, "Evelina");
    fill(/Her email/, "evelina@");
    expect((screen.getByRole("button", { name: /Add teacher/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("adds her, then makes her login without sending the client welcome", async () => {
    db.rpc.mockResolvedValue({ data: { teacher_id: "t1", linked: false }, error: null });
    db.invoke.mockResolvedValue({ data: { ok: true, user_id: "u1" }, error: null });
    const onAdded = vi.fn();
    render(<AddTeacherCard teacherNames={[]} onAdded={onAdded} />);
    fill(/Her name/, "Evelina");
    fill(/Her email/, "evelina@example.com");
    fireEvent.click(screen.getByRole("button", { name: /Add teacher/ }));

    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    expect(db.rpc).toHaveBeenCalledWith("admin_add_teacher", { _name: "Evelina", _email: "evelina@example.com", _rate: 35 });
    // The teacher welcome comes from the database once she is linked.
    expect(db.invoke).toHaveBeenCalledWith("admin-clients", {
      body: { action: "create", full_name: "Evelina", email: "evelina@example.com", send_email: false },
    });
    expect(vi.mocked(toast.success).mock.calls[0][0]).toMatch(/invitation to choose her password/);
  });

  it("links an existing account and makes no second one", async () => {
    db.rpc.mockResolvedValue({ data: { teacher_id: "t1", linked: true }, error: null });
    render(<AddTeacherCard teacherNames={[]} onAdded={vi.fn()} />);
    fill(/Her name/, "Anja Diggelmann");
    fill(/Her email/, "anja@example.com");
    fireEvent.click(screen.getByRole("button", { name: /Add teacher/ }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(db.invoke).not.toHaveBeenCalled();
    expect(vi.mocked(toast.success).mock.calls[0][0]).toMatch(/linked to her account/);
  });

  it("without the invitation, only saves her until she signs up", async () => {
    db.rpc.mockResolvedValue({ data: { teacher_id: "t1", linked: false }, error: null });
    render(<AddTeacherCard teacherNames={[]} onAdded={vi.fn()} />);
    fill(/Her name/, "Evelina");
    fill(/Her email/, "evelina@example.com");
    fireEvent.click(screen.getByRole("checkbox", { name: "Invite her" }));
    fireEvent.click(screen.getByRole("button", { name: /Add teacher/ }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(db.invoke).not.toHaveBeenCalled();
    expect(vi.mocked(toast.success).mock.calls[0][0]).toMatch(/linked as soon as she signs up/);
  });

  it("does not list someone who is already a teacher", async () => {
    render(<AddTeacherCard teacherNames={["evelina"]} onAdded={vi.fn()} />);
    await screen.findByRole("button", { name: /Melanie Moss/ });
    expect(screen.queryByRole("button", { name: /Evelina/ })).toBeNull();
  });
});
