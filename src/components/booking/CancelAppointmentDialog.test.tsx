import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CancelAppointmentDialog } from "./CancelAppointmentDialog";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// The guest side of cancelling: nothing is cancelled here, the button only
// opens an email to the studio — and tells the guest what it will cost.
const booking = (startsInHours: number) => ({
  id: "5199439a-33a2-4768-a704-7852cebab7f4",
  start_time: new Date(Date.now() + startsInHours * 3_600_000).toISOString(),
  booking_date: "2026-09-20",
  booking_time: "14:00:00",
  total_price: 131,
  guest_name: "Leena Vogt",
  services: { title: "PURE BLISS (90min)" },
});

const open = (startsInHours: number) => {
  render(<CancelAppointmentDialog booking={booking(startsInHours)} />);
  fireEvent.click(screen.getByRole("button", { name: "Cancel appointment" }));
  return document.body.textContent!;
};

describe("CancelAppointmentDialog", () => {
  it("opens an email to the studio instead of cancelling", () => {
    open(5 * 24);
    const link = screen.getByRole("link", { name: /Write cancellation email/ });
    const url = new URL(link.getAttribute("href")!);
    expect(url.protocol).toBe("mailto:");
    expect(url.pathname).toBe("spaholisma@gmail.com");
    expect(url.searchParams.get("subject")).toBe("Cancellation request — PURE BLISS (90min) — 5199439A");
    expect(url.searchParams.get("body")).toContain("Time: 14:00");
  });

  it("quotes 50% while the appointment is more than 48 hours away", () => {
    const text = open(5 * 24);
    expect(text).toContain("48 hours before your appointment");
    expect(text).toContain("$65.50");
    expect(text).toContain("After that, 100% ($131.00)");
  });

  it("quotes 100% inside the 48 hours before the appointment", () => {
    const text = open(24);
    expect(text).toContain("less than 48 hours away");
    expect(text).toContain("$131.00");
    expect(text).not.toContain("$65.50");
  });

  it("shows the address for guests with no mail app", () => {
    const text = open(5 * 24);
    expect(text).toContain("No email app? Write to spaholisma@gmail.com");
    expect(screen.getByRole("button", { name: /Copy/ })).toBeTruthy();
  });
});
