import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// The address the visit arrived with (set per test), and a fake Supabase.
const { url, auth, roles } = vi.hoisted(() => ({
  url: { path: "/reset-password", hash: "", search: "" },
  auth: {
    onAuthStateChange: vi.fn(),
    getSession: vi.fn(),
    exchangeCodeForSession: vi.fn(),
    updateUser: vi.fn(),
    resetPasswordForEmail: vi.fn(),
  },
  roles: vi.fn(),
}));
vi.mock("@/lib/initialUrl", () => ({ initialUrl: url }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth,
    from: () => ({ select: () => ({ eq: () => roles() }) }),
  },
}));
vi.mock("@/components/Navbar", () => ({ Navbar: () => null }));
vi.mock("@/components/Footer", () => ({ Footer: () => null }));

import ResetPassword from "./ResetPassword";

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/reset-password"]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/dashboard" element={<p>Client dashboard</p>} />
        <Route path="/admin" element={<p>Admin panel</p>} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  Object.values(auth).forEach((f) => f.mockReset());
  auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  roles.mockReset();
  url.hash = "";
  url.search = "";
});

describe("the choose-your-password page", () => {
  it("shows the form when the link brought a session", async () => {
    url.hash = "#access_token=x&type=recovery";
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    renderPage();
    expect(await screen.findByLabelText("New password")).toBeTruthy();
  });

  it("says the link expired — instead of loading forever — when it was already used", async () => {
    url.hash = "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired";
    renderPage();
    expect(await screen.findByText("This link has expired")).toBeTruthy();
    expect(auth.getSession).not.toHaveBeenCalled();
  });

  it("offers a fresh link that comes back to this page", async () => {
    url.hash = "#error=access_denied&error_code=otp_expired";
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    renderPage();
    fireEvent.change(await screen.findByLabelText("Email"), { target: { value: "ana@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send me a new link" }));
    await waitFor(() => expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("ana@example.com", {
      redirectTo: `${window.location.origin}/reset-password`,
    }));
    expect(await screen.findByText("Check your inbox")).toBeTruthy();
  });

  it("with no link and nobody signed in, says so straight away", async () => {
    auth.getSession.mockResolvedValue({ data: { session: null } });
    renderPage();
    expect(await screen.findByText("This link has expired")).toBeTruthy();
  });

  it("sends a client to their own page, not to the Admin", async () => {
    url.hash = "#access_token=x&type=recovery";
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: "client-1" } } } });
    auth.updateUser.mockResolvedValue({ data: { user: { id: "client-1" } }, error: null });
    roles.mockResolvedValue({ data: [] });
    renderPage();
    fireEvent.change(await screen.findByLabelText("New password"), { target: { value: "secret123" } });
    fireEvent.change(screen.getByLabelText("Repeat the password"), { target: { value: "secret123" } });
    fireEvent.click(screen.getByRole("button", { name: "Save password" }));
    expect(await screen.findByText("Client dashboard")).toBeTruthy();
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "secret123" });
  });

  it("sends the team to the Admin", async () => {
    url.hash = "#access_token=x&type=recovery";
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: "staff-1" } } } });
    auth.updateUser.mockResolvedValue({ data: { user: { id: "staff-1" } }, error: null });
    roles.mockResolvedValue({ data: [{ role: "manager" }] });
    renderPage();
    fireEvent.change(await screen.findByLabelText("New password"), { target: { value: "secret123" } });
    fireEvent.change(screen.getByLabelText("Repeat the password"), { target: { value: "secret123" } });
    fireEvent.click(screen.getByRole("button", { name: "Save password" }));
    expect(await screen.findByText("Admin panel")).toBeTruthy();
  });

  it("catches a typo before saving", async () => {
    url.hash = "#access_token=x&type=recovery";
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    renderPage();
    fireEvent.change(await screen.findByLabelText("New password"), { target: { value: "secret123" } });
    fireEvent.change(screen.getByLabelText("Repeat the password"), { target: { value: "secret124" } });
    fireEvent.click(screen.getByRole("button", { name: "Save password" }));
    await new Promise((r) => setTimeout(r, 20));
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
});
