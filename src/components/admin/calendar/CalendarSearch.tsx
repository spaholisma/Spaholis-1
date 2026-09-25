import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Search, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CalendarEntry } from "../AdminInternalCalendars";
import {
  buildBookingFilter, buildEntryFilter, dedupe, describeMatch, isSearchable,
  rankByCloseness, resultDateLabel, sanitizeTerm, type SearchHit,
} from "./searchCalendar";

// Cancelled and failed bookings are gone from the calendar; they should not
// come back through search either.
const HIDDEN_BOOKING_STATUSES = new Set(["cancelled", "payment_failed"]);
const MAX_RESULTS = 40;

type Props = {
  /** Which calendar to search: the tab the person is looking at. */
  calendarType: "treatment" | "retreat" | "class";
  /** A viewer sees the schedule but not the guests' contact details. */
  readOnly?: boolean;
  /** Called with the entry they picked, so the calendar can jump to it. */
  onPick: (entry: CalendarEntry) => void;
};

export const CalendarSearch = ({ calendarType, readOnly = false, onPick }: Props) => {
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Only the newest search may write its results: a slow early query must not
  // land on top of a later, faster one.
  const runId = useRef(0);

  const search = useCallback(async (raw: string) => {
    const mine = ++runId.current;
    if (!isSearchable(raw)) { setHits(null); setBusy(false); return; }
    setBusy(true);
    const term = sanitizeTerm(raw);

    const entriesQuery = supabase
      .from("admin_calendar_entries")
      .select("*")
      .eq("calendar_type", calendarType)
      .or(buildEntryFilter(term))
      .order("entry_date", { ascending: false })
      .limit(150);

    // Real website bookings live on the Treatments calendar only, and their
    // guest details are not a viewer's to search.
    const bookingsQuery = calendarType === "treatment" && !readOnly
      ? supabase
          .from("bookings")
          .select("id, title, guest_name, guest_email, guest_phone, notes, booking_date, booking_time, status, room_id, group_id, total_price, services(title, duration_minutes, type)")
          .or(buildBookingFilter(term))
          .order("booking_date", { ascending: false })
          .limit(100)
      : null;

    const [entriesRes, bookingsRes] = await Promise.all([entriesQuery, bookingsQuery]);
    if (mine !== runId.current) return;   // a newer search has taken over

    const found: SearchHit[] = ((entriesRes.data as CalendarEntry[]) ?? []).map((entry) => ({
      entry, ...describeMatch(entry, term),
    }));

    for (const b of ((bookingsRes?.data as any[]) ?? [])) {
      if (b.services?.type !== "treatment" || HIDDEN_BOOKING_STATUSES.has(b.status)) continue;
      const entry = {
        id: `booking:${b.id}`,
        calendar_type: "treatment",
        title: (b.title && String(b.title).trim())
          ? String(b.title).trim()
          : `${b.guest_name ?? "Guest"} — ${b.services?.title ?? "Treatment"}`,
        entry_date: b.booking_date,
        end_date: null,
        start_time: String(b.booking_time ?? "09:00").slice(0, 5),
        end_time: null,
        duration_minutes: b.services?.duration_minutes ?? 60,
        notes: b.notes ?? null,
        color: null,
        room_id: b.room_id,
        is_offsite: false,
        offsite_location: null,
        group_id: b.group_id ?? null,
        is_all_day: false,
        blocks_availability: false,
        series_id: null,
        recurrence: "none",
        recurrence_until: null,
        booking: {
          id: b.id,
          status: b.status,
          guest_name: b.guest_name,
          guest_email: b.guest_email,
          guest_phone: b.guest_phone,
          service_title: b.services?.title ?? null,
          total_price: b.total_price,
        },
      } as unknown as CalendarEntry;
      found.push({ entry, ...describeMatch(entry, term) });
    }

    setHits(rankByCloseness(dedupe(found)).slice(0, MAX_RESULTS));
    setActive(0);
    setBusy(false);
  }, [calendarType, readOnly]);

  // Wait for a pause in the typing — one query per word, not one per letter.
  useEffect(() => {
    if (!isSearchable(term)) { setHits(null); return; }
    const t = setTimeout(() => search(term), 250);
    return () => clearTimeout(t);
  }, [term, search]);

  // Searching again after switching tabs must search the tab now on screen.
  useEffect(() => { if (isSearchable(term)) search(term); }, [calendarType]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const pick = (hit: SearchHit) => {
    setOpen(false);
    onPick(hit.entry);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); return; }
    if (!hits?.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % hits.length); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i - 1 + hits.length) % hits.length); }
    if (e.key === "Enter") { e.preventDefault(); pick(hits[Math.min(active, hits.length - 1)]); }
  };

  const clear = () => { setTerm(""); setHits(null); setOpen(false); inputRef.current?.focus(); };

  return (
    <div ref={boxRef} className="relative w-full sm:w-72">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        ref={inputRef}
        value={term}
        onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search this calendar…"
        aria-label="Search this calendar"
        className="pl-9 pr-9 h-9"
      />
      {busy
        ? <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        : term && (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}

      {open && isSearchable(term) && (
        <div className="absolute z-50 mt-1 w-[min(28rem,90vw)] right-0 sm:left-0 sm:right-auto max-h-[60vh] overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
          {hits === null ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">Searching…</p>
          ) : hits.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              Nothing matches “{sanitizeTerm(term)}” on this calendar.
            </p>
          ) : (
            <>
              <p className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {hits.length}{hits.length === MAX_RESULTS ? "+" : ""} {hits.length === 1 ? "result" : "results"}
              </p>
              <ul className="pb-1">
                {hits.map((hit, i) => (
                  <li key={hit.entry.id}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => pick(hit)}
                      className={cn(
                        "w-full text-left px-4 py-2.5 flex flex-col gap-0.5 transition-colors",
                        i === active ? "bg-muted" : "hover:bg-muted/60",
                      )}
                    >
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">{resultDateLabel(hit.entry.entry_date)}</span>
                        {!hit.entry.is_all_day && <span>{String(hit.entry.start_time).slice(0, 5)}</span>}
                        {hit.entry.booking && (
                          <span className="px-1.5 py-0.5 rounded-full bg-spa-sage/15 text-spa-sage text-[11px] font-medium">
                            Website booking
                          </span>
                        )}
                      </span>
                      <span className="text-sm text-foreground font-medium truncate">{hit.entry.title}</span>
                      {hit.field !== "Title" && (
                        <span className="text-xs text-muted-foreground truncate">
                          <span className="font-medium">{hit.field}:</span> {hit.snippet}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
};
