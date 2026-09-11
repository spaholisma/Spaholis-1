import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CancelAppointmentDialog } from "./CancelAppointmentDialog";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// The guest side of cancelling: nothing is cancelled here, the button only
// opens an email to the studio — and tells the guest what it will cost.
const booking = (createdHoursAgo: number) => ({
  id: "5199439a-33a2-4768-a704-7852cebab7f4",
  created_at: new Date(Date.now() - createdHoursAgo * 3_600_000).toISOString(),
  start_time: new Date(Date.now() + 5 * 24 * 3_600_000).toISOString(),
  booking_date: "2026-09-20",
  booking_time: "14:00:00",
  total_price: 131,
  guest_name: "Leena Vogt",
  services: { title: "PURE BLISS (90min)" },
});

describe("CancelAppointmentDialog", () => {
  it("opens an email to the studio instead of cancelling", () => {
    render(<CancelAppointmentDialog booking={booking(2)} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel appointment" }));

    const link = screen.getByRole("link", { name: /Write cancellation email/ });
    const url = new URL(link.getAttribute("href")!);
    expect(url.protocol).toBe("mailto:");
    expect(url.pathname).toBe("spaholisma@gmail.com");
    expect(url.searchParams.get("subject")).toBe("Cancellation request — PURE BLISS (90min) — 5199439A");
    expect(url.searchParams.get("body")).toContain("Time: 14:00");
  });

  it("quotes 50% inside the first 24 hours after booking", () => {
    render(<CancelAppointmentDialog booking={booking(2)} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel appointment" }));
    const text = document.body.textContent!;
    expect(text).toContain("50%");
    expect(text).toContain("$65.50");
    expect(text).toMatch(/After that, 100%/);
  });

  it("quotes 100% once those 24 hours have passed", () => {
    render(<CancelAppointmentDialog booking={booking(30)} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel appointment" }));
    const text = document.body.textContent!;
    expect(text).toContain("The first 24 hours after booking have passed");
    expect(text).toContain("$131.00");
  });

  it("shows the address for guests with no mail app", () => {
    render(<CancelAppointmentDialog booking={booking(2)} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel appointment" }));
    expect(document.body.textContent).toContain("No email app? Write to spaholisma@gmail.com");
    expect(screen.getByRole("button", { name: /Copy/ })).toBeTruthy();
  });
});
