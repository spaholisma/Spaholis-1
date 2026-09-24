import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  byLastActivity, countBy, displayName, fold, matchesFilter, matchesSearch, visibleClients,
  type ClientRow,
} from "./clientDirectory";

// Admin → Clients used to list website accounts only. Most regulars never
// make one — they are entered by hand at the desk — so they were missing.
// The directory now reads every place a person appears.

const row = (over: Partial<ClientRow> = {}): ClientRow => ({
  client_key: over.client_key ?? "ana@example.com",
  name: "Ana Pérez",
  email: "ana@example.com",
  phone: "+506 8888-1234",
  has_account: false,
  first_seen: "2026-07-01T10:00:00Z",
  last_activity: "2026-09-20T14:00:00Z",
  classes: 4,
  treatments: 1,
  memberships: 2,
  memberships_active: 1,
  total_value: 250,
  ...over,
});

describe("finding a client", () => {
  it("ignores accents and case", () => {
    expect(fold("Briceño")).toBe("briceno");
    expect(matchesSearch(row({ name: "Laura Briceño" }), "briceno")).toBe(true);
    expect(matchesSearch(row({ name: "Laura Briceño" }), "LAURA")).toBe(true);
  });

  it("finds by email", () => {
    expect(matchesSearch(row(), "ana@exa")).toBe(true);
  });

  it("finds a phone however it was typed", () => {
    expect(matchesSearch(row({ phone: "+506 8888-1234" }), "88881234")).toBe(true);
    expect(matchesSearch(row({ phone: "8888 1234" }), "8888-12")).toBe(true);
  });

  it("does not match everything on a stray digit or two", () => {
    expect(matchesSearch(row({ name: "Zed", email: "z@z.com", phone: "123456" }), "9")).toBe(false);
  });
});

describe("the filters", () => {
  it("separates website accounts from people registered by staff", () => {
    expect(matchesFilter(row({ has_account: true }), "account")).toBe(true);
    expect(matchesFilter(row({ has_account: true }), "staff")).toBe(false);
    expect(matchesFilter(row({ has_account: false }), "staff")).toBe(true);
  });

  it("finds who holds an active membership right now", () => {
    expect(matchesFilter(row({ memberships_active: 1 }), "active")).toBe(true);
    expect(matchesFilter(row({ memberships_active: 0 }), "active")).toBe(false);
  });

  it("counts every group for the chips", () => {
    const counts = countBy([row({ has_account: true }), row(), row({ memberships_active: 0 })]);
    expect(counts).toEqual({ all: 3, account: 1, staff: 2, active: 2 });
  });
});

describe("the order", () => {
  it("puts the most recently seen first, and the never-seen last", () => {
    const list = [
      row({ client_key: "old", last_activity: "2026-01-01T00:00:00Z" }),
      row({ client_key: "never", last_activity: null }),
      row({ client_key: "new", last_activity: "2026-09-23T00:00:00Z" }),
    ].sort(byLastActivity);
    expect(list.map((r) => r.client_key)).toEqual(["new", "old", "never"]);
  });

  it("filters and orders together", () => {
    const out = visibleClients(
      [row({ client_key: "a", has_account: true }), row({ client_key: "b", name: "Bea" })],
      "", "staff",
    );
    expect(out.map((r) => r.client_key)).toEqual(["b"]);
  });

  it("always has something to call a person", () => {
    expect(displayName({ name: "  ", email: "x@y.com", phone: null })).toBe("x@y.com");
    expect(displayName({ name: null, email: null, phone: "8888" })).toBe("8888");
    expect(displayName({ name: null, email: null, phone: null })).toBe("Unnamed client");
  });
});

// ── the screen ─────────────────────────────────────────────────────────────
const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: any[]) => rpc(...a) } }));

import { ClientsDirectory } from "./ClientsDirectory";

beforeEach(() => rpc.mockReset());

describe("the Clients screen", () => {
  it("lists people with no website account, marked as registered by staff", async () => {
    rpc.mockResolvedValueOnce({
      data: [
        row({ client_key: "k1", name: "Maryeling Urbina", email: "maryeling8@outlook.com", has_account: false }),
        row({ client_key: "k2", name: "Sophia Wisdom", email: "sophy@example.com", has_account: true }),
      ],
      error: null,
    });
    render(<ClientsDirectory />);

    await waitFor(() => expect(screen.getByText("Maryeling Urbina")).toBeTruthy());
    expect(rpc).toHaveBeenCalledWith("admin_client_directory");
    expect(screen.getByText("Sophia Wisdom")).toBeTruthy();
    expect(screen.getByText(/2 clients · 1 with a website account · 1 registered by staff/)).toBeTruthy();
    expect(screen.getAllByText("By staff").length).toBe(1);
  });

  it("filters to the people entered by hand", async () => {
    rpc.mockResolvedValueOnce({
      data: [row({ client_key: "k1", name: "Walk In" }), row({ client_key: "k2", name: "Web User", has_account: true })],
      error: null,
    });
    render(<ClientsDirectory />);
    await waitFor(() => screen.getByText("Walk In"));

    fireEvent.click(screen.getByText(/Registered by staff/, { selector: "button" }));
    expect(screen.getByText("Walk In")).toBeTruthy();
    expect(screen.queryByText("Web User")).toBeNull();
  });

  it("opens a client's full history", async () => {
    rpc
      .mockResolvedValueOnce({ data: [row({ client_key: "maryeling8@outlook.com", name: "Maryeling Urbina" })], error: null })
      .mockResolvedValueOnce({
        data: {
          person: { name: "Maryeling Urbina", email: "maryeling8@outlook.com", phone: null, has_account: false, account_since: null, first_seen: "2026-09-24T10:00:00Z" },
          memberships: [{ id: "m1", name: "5-Class Pass", status: "active", price_paid: 101, is_unlimited: false, credits_total: 5, credits_remaining: 5, classes_used: 0, code: "AB1234", created_at: "2026-09-24T10:00:00Z" }],
          classes: [],
          treatments: [],
          calendar: [],
        },
        error: null,
      });
    render(<ClientsDirectory />);
    await waitFor(() => screen.getByText("Maryeling Urbina"));

    fireEvent.click(screen.getByText("Maryeling Urbina"));

    await waitFor(() => expect(screen.getByText("5-Class Pass")).toBeTruthy());
    expect(rpc).toHaveBeenLastCalledWith("admin_client_history", { _key: "maryeling8@outlook.com" });
    expect(screen.getByText("Registered by staff")).toBeTruthy();
    expect(screen.getByText("5 / 5")).toBeTruthy();
    expect(screen.getByText("AB1234")).toBeTruthy();
    expect(screen.getByText("No classes booked.")).toBeTruthy();
  });

  it("says so plainly when the list cannot be read", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "Not authorized" } });
    render(<ClientsDirectory />);
    await waitFor(() => expect(screen.getByText("Not authorized")).toBeTruthy());
  });
});
