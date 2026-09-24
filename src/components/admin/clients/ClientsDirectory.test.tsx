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
const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: any[]) => rpc(...a),
    functions: { invoke: (...a: any[]) => invoke(...a) },
  },
}));

import { ClientsDirectory } from "./ClientsDirectory";

beforeEach(() => { rpc.mockReset(); invoke.mockReset(); });

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

// ── looking after a client ─────────────────────────────────────────────────
const history = (person: Record<string, unknown>) => ({
  data: {
    person: {
      name: "Sophia Wisdom", email: "sophy@example.com", phone: null, has_account: true,
      account_since: "2026-08-01T10:00:00Z", first_seen: "2026-08-01T10:00:00Z",
      user_id: "3ce38398-7e2a-4412-bdfc-87e59d4b1662", suspended: false, last_sign_in: null, is_staff: false,
      ...person,
    },
    memberships: [], classes: [], treatments: [], calendar: [],
  },
  error: null,
});

// Answers each database call by name, as often as the screen asks.
function database(person: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  rpc.mockImplementation(async (fn: string) => {
    if (fn === "admin_client_directory") {
      return { data: [row({ client_key: "sophy@example.com", name: "Sophia Wisdom", has_account: !!person.has_account })], error: null };
    }
    if (fn === "admin_client_history") return history(person);
    return { data: extra[fn] ?? null, error: null };
  });
}

async function openProfile(person: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  database(person, extra);
  render(<ClientsDirectory />);
  await waitFor(() => screen.getByText("Sophia Wisdom"));
  fireEvent.click(screen.getByText("Sophia Wisdom"));
  await waitFor(() => screen.getByText("No classes booked."));
}

describe("managing a client's account", () => {
  it("marks a suspended login in the list", async () => {
    rpc.mockResolvedValueOnce({ data: [row({ client_key: "k", name: "Blocked Person", has_account: true, suspended: true })], error: null });
    render(<ClientsDirectory />);
    await waitFor(() => screen.getByText("Blocked Person"));
    expect(screen.getByText("Suspended")).toBeTruthy();
  });

  it("can open a new client account from the list", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    render(<ClientsDirectory />);
    await waitFor(() => screen.getByText("No clients match."));
    fireEvent.click(screen.getByRole("button", { name: "New client account" }));
    await waitFor(() => expect(screen.getByText(/choose their own password/)).toBeTruthy());
    expect(screen.getByText("Email them a link to choose their password")).toBeTruthy();
  });

  it("offers edit, suspend and delete on a website account", async () => {
    await openProfile({ has_account: true });
    expect(screen.getByRole("button", { name: /Edit/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Suspend account/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Delete$/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Create website account/ })).toBeNull();
    // One Delete button — not one for the login and another for the client.
    expect(screen.queryByRole("button", { name: /Delete account|Delete client/ })).toBeNull();
  });

  it("offers to create an account for someone registered by staff", async () => {
    await openProfile({ has_account: false, user_id: null });
    expect(screen.getByRole("button", { name: /Create website account/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Suspend account/ })).toBeNull();
    expect(screen.getByRole("button", { name: /^Delete$/ })).toBeTruthy();
  });

  it("offers to reactivate a suspended account", async () => {
    await openProfile({ has_account: true, suspended: true });
    expect(screen.getByRole("button", { name: /Reactivate account/ })).toBeTruthy();
  });

  it("never lets a staff login be changed from here", async () => {
    await openProfile({ has_account: true, is_staff: true });
    expect(screen.queryByRole("button", { name: /Edit/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Delete$/ })).toBeNull();
    expect(screen.getByText(/staff login/)).toBeTruthy();
  });

  it("asks before suspending, then asks the server to do it", async () => {
    await openProfile({ has_account: true });
    invoke.mockResolvedValueOnce({ data: { ok: true, suspended: true }, error: null });

    fireEvent.click(screen.getByRole("button", { name: /Suspend account/ }));
    await waitFor(() => screen.getByText("Suspend Sophia's account?"));
    expect(invoke).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Suspend" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("admin-clients", {
      body: { action: "suspend", user_id: "3ce38398-7e2a-4412-bdfc-87e59d4b1662" },
    }));
  });

  it("edits the details through the database, and the login too for an account", async () => {
    await openProfile({ has_account: true }, { admin_update_client_contact: { client_key: "sophy@example.com" } });
    invoke.mockResolvedValueOnce({ data: { ok: true }, error: null });

    fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
    const name = await screen.findByLabelText("Name");
    fireEvent.change(name, { target: { value: "Sophia W." } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(rpc).toHaveBeenCalledWith("admin_update_client_contact", {
      _key: "sophy@example.com", _name: "Sophia W.", _email: "sophy@example.com", _phone: "",
      _user_id: "3ce38398-7e2a-4412-bdfc-87e59d4b1662",
    }));
    // The login is updated first, so a taken email stops everything.
    expect(invoke.mock.invocationCallOrder[0]).toBeLessThan(
      rpc.mock.invocationCallOrder[rpc.mock.calls.findIndex((c) => c[0] === "admin_update_client_contact")],
    );
    expect(invoke.mock.calls[0][1].body).toMatchObject({ action: "update", full_name: "Sophia W." });
  });
});

describe("deleting a client", () => {
  it("is offered for someone registered by staff, and needs the word DELETE", async () => {
    await openProfile({ has_account: false, user_id: null }, { admin_delete_client: { memberships: 1, classes: 0, treatments: 3, calendar: 0 } });

    fireEvent.click(screen.getByRole("button", { name: /^Delete$/ }));
    await waitFor(() => screen.getByText("Delete Sophia Wisdom?"));
    // Nothing to choose without a website account.
    expect(screen.queryByRole("radiogroup")).toBeNull();
    const confirm = screen.getAllByRole("button", { name: "Delete client" }).at(-1)!;
    expect((confirm as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Type DELETE to confirm"), { target: { value: "delete" } });
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(confirm);

    await waitFor(() => expect(rpc).toHaveBeenCalledWith("admin_delete_client", { _key: "sophy@example.com" }));
    expect(invoke).not.toHaveBeenCalled();
  });

  it("with a website account, deletes only the login by default — history stays", async () => {
    await openProfile({ has_account: true });
    invoke.mockResolvedValueOnce({ data: { ok: true, deleted: true }, error: null });

    fireEvent.click(screen.getByRole("button", { name: /^Delete$/ }));
    await waitFor(() => screen.getByText("Delete Sophia Wisdom?"));
    expect((screen.getByLabelText("Only the website account") as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByLabelText("Type DELETE to confirm")).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Delete account" }).at(-1)!);

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("admin-clients", {
      body: { action: "delete", user_id: "3ce38398-7e2a-4412-bdfc-87e59d4b1662" },
    }));
    expect(rpc).not.toHaveBeenCalledWith("admin_delete_client", expect.anything());
  });

  it("can delete everything instead: the login first, then the records", async () => {
    await openProfile({ has_account: true }, { admin_delete_client: { memberships: 0, classes: 0, treatments: 0, calendar: 0 } });
    invoke.mockResolvedValueOnce({ data: { ok: true, deleted: true }, error: null });

    fireEvent.click(screen.getByRole("button", { name: /^Delete$/ }));
    fireEvent.click(await screen.findByLabelText("The client and everything that is theirs"));
    fireEvent.change(await screen.findByLabelText("Type DELETE to confirm"), { target: { value: "DELETE" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Delete client" }).at(-1)!);

    await waitFor(() => expect(rpc).toHaveBeenCalledWith("admin_delete_client", { _key: "sophy@example.com" }));
    expect(invoke.mock.calls[0][1].body).toEqual({ action: "delete", user_id: "3ce38398-7e2a-4412-bdfc-87e59d4b1662" });
    expect(invoke.mock.invocationCallOrder[0]).toBeLessThan(
      rpc.mock.invocationCallOrder[rpc.mock.calls.findIndex((c) => c[0] === "admin_delete_client")],
    );
  });

  it("is never offered for a staff login", async () => {
    await openProfile({ has_account: true, is_staff: true });
    expect(screen.queryByRole("button", { name: /^Delete$/ })).toBeNull();
  });
});
