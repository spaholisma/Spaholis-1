import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";

// Admin → Classes calendar → Closed days (2026-10 rework): the days are picked
// on a calendar, the closed days are listed as periods (one line for a whole
// vacation, not one per day), a period's message can be changed and the whole
// period reopened at once — and the dialog says plainly that treatments are
// not affected, and whether Vacation Mode is pausing them.

const { calls, vacation } = vi.hoisted(() => ({
  calls: [] as any[],
  vacation: { value: null as any },
}));

vi.mock("@/hooks/useVacationMode", () => ({
  useVacationMode: () => ({ vacation: vacation.value, isActive: false, isVacationDate: () => false }),
}));

vi.mock("@/integrations/supabase/client", () => {
  const chain = (table: string) => {
    const op: any = { table, filters: [] as any[] };
    const q: any = {
      select: () => q,
      gte: (c: string, v: any) => { op.filters.push(["gte", c, v]); return q; },
      lte: (c: string, v: any) => { op.filters.push(["lte", c, v]); return q; },
      lt: () => q, eq: (c: string, v: any) => { op.filters.push(["eq", c, v]); return q; },
      in: () => q, not: () => q,
      delete: () => { op.kind = "delete"; calls.push(op); return q; },
      update: (v: any) => { op.kind = "update"; op.value = v; calls.push(op); return q; },
      upsert: (rows: any, opts: any) => { op.kind = "upsert"; op.value = rows; op.opts = opts; calls.push(op); return q; },
      then: (res: any) => Promise.resolve({ data: [], error: null, count: 0 }).then(res),
    };
    return q;
  };
  return { supabase: { from: (t: string) => chain(t) } };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { ClassClosuresDialog } from "@/components/admin/ClassClosuresDialog";

const vacationDays = (from: number, to: number, reason: string) =>
  Array.from({ length: to - from + 1 }, (_, i) => {
    const d = new Date(Date.UTC(2099, 9, from + i)).toISOString().slice(0, 10);
    return { id: `id-${d}`, closed_date: d, reason };
  });

async function render(closures: any[]) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<ClassClosuresDialog open onOpenChange={() => {}} closures={closures} onChanged={() => {}} />);
  });
  return { root, text: () => document.body.textContent ?? "" };
}

const button = (title: string) =>
  [...document.querySelectorAll("button")].find((b) => b.getAttribute("title") === title || b.textContent?.trim() === title) as HTMLButtonElement;

beforeEach(() => {
  calls.length = 0;
  vacation.value = null;
  document.body.innerHTML = "";
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("Closed days for classes", () => {
  it("lists a vacation as one period with its message, not one line per day", async () => {
    const { text } = await render([
      ...vacationDays(17, 31, "See you soon!"),
      { id: "x", closed_date: "2099-11-01", reason: "See you soon!" },
      { id: "y", closed_date: "2099-11-02", reason: "See you soon!" },
    ]);
    expect(text()).toMatch(/Sat, Oct 17 – Mon, Nov 2, 2099/);
    expect(text()).toMatch(/17 days closed for classes/);
    expect(text().match(/“See you soon!”/g)).toHaveLength(1);
    expect(text()).toMatch(/Upcoming closed days \(17\)/);
  });

  it("reopens a whole period in one go, and one day from its list", async () => {
    await render(vacationDays(17, 20, "Closed"));
    await act(async () => { button("Open all these days again").click(); });
    expect(calls.at(-1)).toMatchObject({
      kind: "delete",
      filters: [["gte", "closed_date", "2099-10-17"], ["lte", "closed_date", "2099-10-20"]],
    });
    await act(async () => { button("Show the days — reopen just one")?.click(); });
    await act(async () => { [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Reopen"))!.click(); });
    expect(calls.at(-1)).toMatchObject({ kind: "delete", filters: [["eq", "id", "id-2099-10-17"]] });
  });

  it("changes the message of every day in a period", async () => {
    await render(vacationDays(17, 18, "Old"));
    await act(async () => { button("Change the message").click(); });
    const input = document.querySelector("input[maxlength='200'][value='Old']") as HTMLInputElement;
    expect(input).toBeTruthy();
    await act(async () => { button("Save").click(); });
    expect(calls.at(-1)).toMatchObject({
      kind: "update", value: { reason: "Old" },
      filters: [["gte", "closed_date", "2099-10-17"], ["lte", "closed_date", "2099-10-18"]],
    });
  });

  it("says treatments are not affected, and whether Vacation Mode pauses them", async () => {
    let r = await render([]);
    expect(r.text()).toMatch(/Treatments and massages are not affected/);
    expect(r.text()).toMatch(/Treatments: open for online booking/);
    r.root.unmount();
    document.body.innerHTML = "";
    vacation.value = { enabled: true, start_date: "2099-10-16", end_date: "2099-10-31" };
    r = await render([]);
    expect(r.text()).toMatch(/paused by Vacation Mode/);
    r.root.unmount();
    document.body.innerHTML = "";
    // Enabled but over: not pausing anything.
    vacation.value = { enabled: true, start_date: "2020-10-16", end_date: "2020-10-31" };
    r = await render([]);
    expect(r.text()).toMatch(/Treatments: open for online booking/);
  });
});

describe("closing days", () => {
  it("re-closing days gives them the new message (no ignoreDuplicates), and the days come from the calendar", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/components/admin/ClassClosuresDialog.tsx", "utf8");
    expect(src).toMatch(/upsert\(rows, \{ onConflict: "closed_date" \}\)/);
    expect(src).not.toMatch(/ignoreDuplicates/);
    expect(src).toMatch(/<Calendar\s+mode="range"/);
  });
});
