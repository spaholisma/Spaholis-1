import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  buildBookingFilter, buildEntryFilter, dedupe, describeMatch, isSearchable,
  rankByCloseness, resultDateLabel, sanitizeTerm, type SearchHit,
} from "./searchCalendar";

// Search across the whole internal calendar, the way Google Calendar does it.
// The grid only ever holds one month, so search has to ask the database — and
// it has to ask it safely, because what a person types is not a query language.

// ── the mocked database ────────────────────────────────────────────────────
const captured: { table: string; or?: string; eq?: [string, unknown] }[] = [];
let entryRows: any[] = [];
let bookingRows: any[] = [];

vi.mock("@/integrations/supabase/client", () => {
  const makeQuery = (table: string) => {
    const call: any = { table };
    captured.push(call);
    const rows = () => (table === "bookings" ? bookingRows : entryRows);
    const chain: any = {
      select: () => chain,
      eq: (col: string, val: unknown) => { call.eq = [col, val]; return chain; },
      or: (filter: string) => { call.or = filter; return chain; },
      order: () => chain,
      limit: () => Promise.resolve({ data: rows(), error: null }),
    };
    return chain;
  };
  return { supabase: { from: (table: string) => makeQuery(table) } };
});

import { CalendarSearch } from "./CalendarSearch";

const entry = (over: Partial<any> = {}) => ({
  id: over.id ?? "e1",
  calendar_type: "treatment",
  title: "Susana 9-7/ Jenny 9-5",
  entry_date: "2026-09-24",
  end_date: null,
  start_time: "09:00",
  end_time: null,
  duration_minutes: 60,
  notes: null,
  color: null,
  room_id: null,
  is_offsite: false,
  offsite_location: null,
  group_id: null,
  is_all_day: false,
  blocks_availability: false,
  ...over,
});

beforeEach(() => {
  captured.length = 0;
  entryRows = [];
  bookingRows = [];
});

describe("what gets sent to the database", () => {
  it("strips the characters that would break the filter or match everything", () => {
    expect(sanitizeTerm("susana, jenny")).toBe("susana jenny");
    expect(sanitizeTerm("100% off (deal)")).toBe("100 off deal");
    expect(sanitizeTerm("  spaced   out  ")).toBe("spaced out");
    expect(sanitizeTerm("o'brien")).toBe("o brien");
  });

  it("searches the fields a person would expect", () => {
    expect(buildEntryFilter("gyro")).toBe(
      "title.ilike.%gyro%,notes.ilike.%gyro%,client_name.ilike.%gyro%,offsite_location.ilike.%gyro%",
    );
    expect(buildBookingFilter("ana")).toContain("guest_name.ilike.%ana%");
  });

  it("waits for a real word before searching", () => {
    expect(isSearchable("a")).toBe(false);
    expect(isSearchable(" , ")).toBe(false);
    expect(isSearchable("ev")).toBe(true);
  });
});

describe("which result comes first", () => {
  const hit = (date: string, id = date): SearchHit =>
    ({ entry: entry({ id, entry_date: date }) as any, field: "Title", snippet: "x" });

  it("puts what is closest to today at the top, both ways", () => {
    const today = new Date(2026, 8, 20);           // 20 Sep 2026
    const order = rankByCloseness(
      [hit("2026-12-01"), hit("2026-09-22"), hit("2026-01-05"), hit("2026-09-18")],
      today,
    ).map((h) => h.entry.entry_date);
    expect(order).toEqual(["2026-09-22", "2026-09-18", "2026-12-01", "2026-01-05"]);
  });

  it("breaks a tie in favour of the one still ahead", () => {
    const today = new Date(2026, 8, 20);
    const order = rankByCloseness([hit("2026-09-17"), hit("2026-09-23")], today)
      .map((h) => h.entry.entry_date);
    expect(order).toEqual(["2026-09-23", "2026-09-17"]);
  });

  it("shows an entry once, even when it matches twice", () => {
    expect(dedupe([hit("2026-09-22", "same"), hit("2026-09-22", "same")])).toHaveLength(1);
  });
});

describe("telling the person why it matched", () => {
  it("names the field and quotes around the word in a long note", () => {
    const long = entry({ notes: "Bring the massage table and the blue towels for the villa in Quepos, room 3" });
    const { field, snippet } = describeMatch(long as any, "towels");
    expect(field).toBe("Notes");
    expect(snippet).toContain("towels");
    expect(snippet.length).toBeLessThan(long.notes!.length);
  });

  it("prefers the title, and shows it whole", () => {
    const { field, snippet } = describeMatch(entry({ title: "Gyrotonic Donna" }) as any, "donna");
    expect(field).toBe("Title");
    expect(snippet).toBe("Gyrotonic Donna");
  });

  it("finds a guest on a website booking", () => {
    const b = entry({ title: "Leena — Pure Bliss", booking: { guest_name: "Leena Vogt" } });
    expect(describeMatch(b as any, "vogt").field).toBe("Client");
  });

  it("writes a date a person can place", () => {
    expect(resultDateLabel("2026-09-24")).toBe("Thu, Sep 24, 2026");
  });
});

describe("the search box", () => {
  it("searches the calendar on screen, and finds what is there", async () => {
    entryRows = [entry({ title: "09:00 codigo QR", entry_date: "2026-09-15" })];
    render(<CalendarSearch calendarType="class" onPick={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Search this calendar"), { target: { value: "codigo" } });

    await waitFor(() => expect(screen.getByText("09:00 codigo QR")).toBeTruthy());
    const entryQuery = captured.find((c) => c.table === "admin_calendar_entries");
    expect(entryQuery?.eq).toEqual(["calendar_type", "class"]);
    expect(entryQuery?.or).toContain("title.ilike.%codigo%");
  });

  it("says so plainly when there is nothing", async () => {
    render(<CalendarSearch calendarType="treatment" onPick={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Search this calendar"), { target: { value: "zzzz" } });
    await waitFor(() => expect(screen.getByText(/Nothing matches/)).toBeTruthy());
  });

  it("hands the picked entry back so the calendar can jump to it", async () => {
    entryRows = [entry({ title: "Carpintero casa eve", entry_date: "2026-09-16" })];
    const onPick = vi.fn();
    render(<CalendarSearch calendarType="treatment" onPick={onPick} />);

    fireEvent.change(screen.getByLabelText("Search this calendar"), { target: { value: "carpintero" } });
    await waitFor(() => screen.getByText("Carpintero casa eve"));
    fireEvent.click(screen.getByText("Carpintero casa eve"));

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0].entry_date).toBe("2026-09-16");
  });

  it("opens the highlighted result with the keyboard", async () => {
    // Results are ordered by closeness to today, so the dates have to be taken
    // from today — fixed dates reorder themselves as the calendar moves on.
    const inDays = (n: number) => {
      const d = new Date();
      d.setDate(d.getDate() + n);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    entryRows = [
      entry({ id: "a", title: "First one", entry_date: inDays(1) }),
      entry({ id: "b", title: "Second one", entry_date: inDays(2) }),
    ];
    const onPick = vi.fn();
    render(<CalendarSearch calendarType="treatment" onPick={onPick} />);
    const box = screen.getByLabelText("Search this calendar");

    fireEvent.change(box, { target: { value: "one" } });
    await waitFor(() => screen.getByText("First one"));
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "Enter" });

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0].title).toBe("Second one");
  });

  it("searches the website bookings too, but never for a viewer", async () => {
    entryRows = [];
    bookingRows = [{
      id: "b1", title: null, guest_name: "Maria Fernanda", booking_date: "2026-09-25",
      booking_time: "14:00:00", status: "confirmed", services: { title: "Pure Bliss", type: "treatment" },
    }];

    const { unmount } = render(<CalendarSearch calendarType="treatment" onPick={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Search this calendar"), { target: { value: "maria" } });
    await waitFor(() => expect(screen.getByText("Maria Fernanda — Pure Bliss")).toBeTruthy());
    expect(captured.some((c) => c.table === "bookings")).toBe(true);
    unmount();

    captured.length = 0;
    render(<CalendarSearch calendarType="treatment" readOnly onPick={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Search this calendar"), { target: { value: "maria" } });
    await waitFor(() => expect(captured.some((c) => c.table === "admin_calendar_entries")).toBe(true));
    expect(captured.some((c) => c.table === "bookings")).toBe(false);
  });

  it("leaves out a cancelled booking, as the calendar does", async () => {
    bookingRows = [{
      id: "b2", title: "Cancelled one", guest_name: "Ghost", booking_date: "2026-09-25",
      booking_time: "14:00:00", status: "cancelled", services: { title: "Pure Bliss", type: "treatment" },
    }];
    render(<CalendarSearch calendarType="treatment" onPick={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Search this calendar"), { target: { value: "ghost" } });
    await waitFor(() => expect(screen.getByText(/Nothing matches/)).toBeTruthy());
  });
});
