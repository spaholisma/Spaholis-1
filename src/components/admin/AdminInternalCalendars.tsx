import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, Copy, Link2 as LinkIcon } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, addDays, startOfWeek, endOfWeek, isSameMonth, isSameDay, parseISO, differenceInCalendarDays } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { AdminClassCalendarWithAttendees } from "./AdminClassCalendarWithAttendees";
import { CalendarGroupsBar, type CalendarGroup } from "./CalendarGroupsBar";
import { readableOn, PALETTE } from "./AttendeeLabelPicker";
import { BookingEditModal } from "./calendar/BookingEditModal";
import type { CalendarBooking } from "./calendar/calendarUtils";
import { LinkifiedText, extractLinks, renameLinkInText, prettyUrl, normalizeLinkInput, sanitizeLinkLabel, type ParsedLink } from "./LinkifiedText";
import { Checkbox } from "@/components/ui/checkbox";

type CalendarType = "treatment" | "retreat" | "class";

export interface CalendarEntry {
  id: string;
  calendar_type: string;
  title: string;
  entry_date: string;
  /** Last day the entry covers. Null means it's a single-day entry. */
  end_date: string | null;
  start_time: string;
  end_time: string | null;
  duration_minutes: number;
  notes: string | null;
  color: string | null;
  /** When set, this entry occupies that room and blocks it on the website. */
  room_id: string | null;
  /** Happening away from the spa — reserves no room, so the spa stays bookable. */
  is_offsite: boolean;
  /** Free-text place for an off-site entry (hotel, villa, client's address). */
  offsite_location: string | null;
  /** Sub-calendar this entry belongs to — drives its color. */
  group_id: string | null;
  /** Spans the whole day; shown in a band above the timeline, not on it. */
  is_all_day: boolean;
  /** When true, hides ALL website availability during this window (lunch, off-site with no coverage). */
  blocks_availability: boolean;
  /** Shared by every occurrence of a repeating entry. Null when standalone. */
  series_id: string | null;
  recurrence: string;
  recurrence_until: string | null;
  /** Present only on rows derived from a real website booking (read-only). */
  booking?: BookingRef;
}

/** The real appointment behind a booking-derived calendar row. */
interface BookingRef {
  id: string;
  status: string;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  service_title: string | null;
  total_price: number | null;
}

interface Room {
  id: string;
  name: string;
}

/** Form value for the location select: "" = unset, "offsite", or a room id. */
const OFFSITE = "offsite";

/** Website bookings are colored by status so their state reads at a glance. */
const BOOKING_STATUS_COLOR: Record<string, string> = {
  paid: "#10b981",
  confirmed: "#0ea5e9",
  completed: "#15803d",
  pending: "#f59e0b",
  pending_payment: "#f59e0b",
};
const bookingColor = (status: string) => BOOKING_STATUS_COLOR[status] ?? "#f59e0b";
/** Real appointments to surface on the treatments calendar (skip dead ones). */
const BOOKING_HIDDEN_STATUSES = new Set(["cancelled", "payment_failed"]);

/**
 * Day view. The default window is the spa's working day (9–7); entries outside
 * it stretch the timeline. Hour height is computed per screen (see hourPx) so
 * the window fits in one view, between these bounds — below MIN a row can't
 * hold its two lines of text, above MAX it just wastes space.
 */
const DEFAULT_DAY_START_H = 8;
const DEFAULT_DAY_END_H = 20;
const MIN_HOUR_PX = 54;
const MAX_HOUR_PX = 76;
/** Header + toolbar + dialog padding sitting above the timeline. */
const DAY_VIEW_CHROME_PX = 200;
/** Day-view horizontal layout: the time-label gutter, the smallest a column
 *  may shrink to before the timeline scrolls sideways, and the gap between
 *  columns. Keeps busy days (many overlapping bookings) readable on a phone —
 *  columns stay legible and you pan across them instead of them being clipped. */
const DAY_TIME_GUTTER_PX = 60;
const DAY_LANE_MIN_PX = 140;
const DAY_LANE_GAP_PX = 4;

export type Recurrence = "none" | "daily" | "weekly" | "biweekly" | "monthly";

export const RECURRENCE_LABELS: Record<Recurrence, string> = {
  none: "Does not repeat",
  daily: "Daily",
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
};

/** Hard stop so a typo in the end date can't generate thousands of rows. */
export const MAX_OCCURRENCES = 400;

/**
 * The dates a series lands on, inclusive of both ends. Monthly keeps the day of
 * the month and simply skips months that don't have it (a 31st series has no
 * February date) rather than silently sliding to the 28th.
 */
export function expandRecurrence(
  startISO: string,
  untilISO: string,
  rule: Recurrence,
  cap: number = MAX_OCCURRENCES,
): string[] {
  if (rule === "none" || !startISO) return startISO ? [startISO] : [];
  const start = parseISO(startISO);
  const until = untilISO ? parseISO(untilISO) : start;
  if (until < start) return [startISO];

  const out: string[] = [];
  if (rule === "monthly") {
    const dayOfMonth = start.getDate();
    for (let i = 0; out.length < cap; i++) {
      const cursor = addMonths(start, i);
      if (cursor > until) break;
      // addMonths clamps (Jan 31 -> Feb 28); a clamped date isn't this series'.
      if (cursor.getDate() === dayOfMonth) out.push(format(cursor, "yyyy-MM-dd"));
      if (i > cap) break;
    }
    return out;
  }

  const step = rule === "daily" ? 1 : rule === "weekly" ? 7 : 14;
  let cursor = start;
  while (cursor <= until && out.length < cap) {
    out.push(format(cursor, "yyyy-MM-dd"));
    cursor = addDays(cursor, step);
  }
  return out;
}

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export const minutesLabel = (mins: number): string => {
  // Wrap past midnight: an entry can end at or beyond 24:00, and 25:00 must
  // read as 1 AM rather than "13 PM".
  const h24 = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 > 12 ? h24 - 12 : h24 === 0 ? 12 : h24;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
};

/**
 * "9 – 10 AM" when both ends share a meridiem, "11 AM – 1:30 PM" when they
 * don't — the repeated AM/PM is noise in a block that's already tight.
 */
export const rangeLabel = (startMin: number, endMin: number): string => {
  const from = minutesLabel(startMin);
  const to = minutesLabel(endMin);
  return from.slice(-2) === to.slice(-2)
    ? `${from.slice(0, -3)} – ${to}`
    : `${from} – ${to}`;
};

export interface LaidOutEntry {
  entry: CalendarEntry;
  startMin: number;
  endMin: number;
  /** Column index among entries it overlaps, and how many columns that group needs. */
  lane: number;
  lanes: number;
}

/**
 * Position a day's entries like a calendar: stacked vertically by time, and
 * split into side-by-side columns wherever they overlap.
 */
export function layoutDay(dayEntries: CalendarEntry[]): LaidOutEntry[] {
  const items = dayEntries
    .map((entry) => {
      const startMin = toMinutes(entry.start_time);
      // Keep very short entries clickable.
      return { entry, startMin, endMin: startMin + Math.max(entry.duration_minutes || 0, 15) };
    })
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  const out: LaidOutEntry[] = [];
  let cluster: typeof items = [];
  let clusterEnd = -1;

  const flush = () => {
    if (!cluster.length) return;
    const laneEnds: number[] = [];
    const withLane = cluster.map((it) => {
      let lane = laneEnds.findIndex((end) => end <= it.startMin);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(it.endMin);
      } else {
        laneEnds[lane] = it.endMin;
      }
      return { ...it, lane };
    });
    withLane.forEach((it) => out.push({ ...it, lanes: laneEnds.length }));
    cluster = [];
    clusterEnd = -1;
  };

  for (const it of items) {
    // A gap with no overlap starts a fresh group, so unrelated entries stay full width.
    if (cluster.length && it.startMin >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.endMin);
  }
  flush();
  return out;
}

const TYPE_COLORS: Record<CalendarType, string> = {
  treatment: "#8B5CF6",
  retreat: "#F59E0B",
  class: "#10B981",
};

const TYPE_LABELS: Record<CalendarType, string> = {
  treatment: "Treatments",
  retreat: "Retreats",
  class: "Classes",
};

const emptyForm = {
  title: "",
  entry_date: format(new Date(), "yyyy-MM-dd"),
  end_date: format(new Date(), "yyyy-MM-dd"),
  start_time: "09:00",
  duration_minutes: 60,
  notes: "",
  location: "",
  offsite_location: "",
  group_id: "",
  is_all_day: false,
  blocks_availability: false,
  recurrence: "none" as Recurrence,
  recurrence_until: "",
};

export function AdminInternalCalendars({ restrictToTreatment = false, readOnly = false }: { restrictToTreatment?: boolean; readOnly?: boolean } = {}) {
  const [calendarType, setCalendarType] = useState<CalendarType>("treatment");
  // A coordinator only ever sees the treatments calendar.
  const visibleTypes = (Object.keys(TYPE_LABELS) as CalendarType[]).filter(
    (t) => !restrictToTreatment || t === "treatment",
  );
  const [currentDate, setCurrentDate] = useState(new Date());
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<CalendarEntry | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [dayViewDate, setDayViewDate] = useState<Date | null>(null);
  /** The day to reopen once the entry form closes, so adding or editing from
   *  the day view doesn't kick you back out to the month. */
  const [returnToDay, setReturnToDay] = useState<Date | null>(null);
  /** When editing an occurrence: change just it, or the whole series. */
  const [editScope, setEditScope] = useState<"one" | "series">("one");
  /** Naming a link in the notes, keyed by its href. */
  const [renamingLink, setRenamingLink] = useState<string | null>(null);
  const [linkNameDraft, setLinkNameDraft] = useState("");

  /** Write the name into the note itself, so notes stay plain text. */
  const applyLinkName = (link: ParsedLink) => {
    setForm((f) => ({ ...f, notes: renameLinkInText(f.notes, link, linkNameDraft) }));
    setRenamingLink(null);
    setLinkNameDraft("");
  };

  /** "Insert link" — two fields (display text + address), like Google's. */
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkText, setLinkText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

  const openInsertLink = () => {
    setLinkText("");
    setLinkUrl("");
    setLinkDialogOpen(true);
  };

  const insertLink = () => {
    const href = normalizeLinkInput(linkUrl);
    if (!href) { toast.error("Enter a valid web address (starting with http:// or https://)"); return; }
    const label = sanitizeLinkLabel(linkText);
    // Store as [Text](url) when named, or the bare url — the same plain-text
    // form pasted links already use, so nothing downstream changes.
    const snippet = label ? `[${label}](${href})` : href;
    setForm((f) => ({ ...f, notes: f.notes ? `${f.notes.replace(/\s*$/, "")}\n${snippet}` : snippet }));
    setLinkDialogOpen(false);
  };
  const [groups, setGroups] = useState<CalendarGroup[]>([]);
  const [hiddenGroups, setHiddenGroups] = useState<Set<string>>(new Set());

  const loadGroups = useCallback(async () => {
    const { data } = await supabase
      .from("calendar_groups")
      .select("id, name, color, sort_order")
      .order("sort_order")
      .order("created_at");
    setGroups((data as CalendarGroup[]) ?? []);
  }, []);
  useEffect(() => { loadGroups(); }, [loadGroups]);

  const toggleGroup = (id: string) =>
    setHiddenGroups((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Create a sub-calendar without leaving the entry form — the moment you need
  // one is the moment you're filling this in.
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupDraft, setGroupDraft] = useState({ name: "", color: PALETTE[0] });
  const [savingGroup, setSavingGroup] = useState(false);

  const startNewGroup = () => {
    setGroupDraft({ name: "", color: PALETTE[groups.length % PALETTE.length] });
    setCreatingGroup(true);
  };

  const saveNewGroup = async () => {
    const name = groupDraft.name.trim();
    if (!name) { toast.error("Calendar name is required"); return; }
    setSavingGroup(true);
    try {
      const { data, error } = await supabase
        .from("calendar_groups")
        .insert({ name, color: groupDraft.color, sort_order: groups.length })
        .select("id, name, color, sort_order")
        .single();
      if (error) throw error;
      await loadGroups();
      // Select it straight away, so creating it is part of one flow.
      setForm((f) => ({ ...f, group_id: (data as CalendarGroup).id }));
      setCreatingGroup(false);
      toast.success(`Calendar "${name}" created`);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to create calendar");
    } finally {
      setSavingGroup(false);
    }
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("rooms")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      setRooms((data as Room[]) ?? []);
    })();
  }, []);

  const loadEntries = useCallback(async () => {
    const start = format(startOfWeek(startOfMonth(currentDate)), "yyyy-MM-dd");
    const end = format(endOfWeek(endOfMonth(currentDate)), "yyyy-MM-dd");
    // Overlap, not containment: an entry that started before this month but
    // runs into it still belongs on the grid.
    const { data } = await supabase
      .from("admin_calendar_entries")
      .select("*")
      .eq("calendar_type", calendarType)
      .lte("entry_date", end)
      .or(`end_date.gte.${start},and(end_date.is.null,entry_date.gte.${start})`)
      .order("start_time", { ascending: true });
    setEntries((data as CalendarEntry[]) ?? []);
  }, [calendarType, currentDate]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  // Real website bookings, shown read-only alongside the manual entries — only
  // on the Treatments calendar (the day-to-day one), never Retreats/Classes.
  const [bookingEntries, setBookingEntries] = useState<CalendarEntry[]>([]);
  const loadBookings = useCallback(async () => {
    if (calendarType !== "treatment") { setBookingEntries([]); return; }
    const start = format(startOfWeek(startOfMonth(currentDate)), "yyyy-MM-dd");
    const end = format(endOfWeek(endOfMonth(currentDate)), "yyyy-MM-dd");

    let rows: any[];
    if (readOnly) {
      // Viewer: pull only operational fields via the safe RPC. Never touches
      // email/phone/price/card/intake — those columns aren't even returned.
      const { data } = await supabase.rpc("get_treatment_bookings", { _from: start, _to: end });
      rows = ((data as any[]) ?? []).map((b) => ({
        id: b.id,
        title: b.title,
        guest_name: b.guest_name,
        booking_date: b.booking_date,
        booking_time: b.booking_time,
        status: b.status,
        room_id: b.room_id,
        guest_email: null,
        guest_phone: null,
        total_price: null,
        services: { title: b.service_title, duration_minutes: b.duration_minutes, type: b.service_type },
      }));
    } else {
      const { data } = await supabase
        .from("bookings")
        .select("id, title, guest_name, guest_email, guest_phone, booking_date, booking_time, status, room_id, total_price, services(title, duration_minutes, type)")
        .gte("booking_date", start)
        .lte("booking_date", end);
      rows = (data as any[]) ?? [];
    }

    const mapped: CalendarEntry[] = rows
      // Treatment-type services only (packages included); skip dead bookings.
      .filter((b) => b.services?.type === "treatment" && !BOOKING_HIDDEN_STATUSES.has(b.status))
      .map((b) => {
        // "Visit at your location" bookings pick no room and no time slot
        // (booking_time stays 00:00). They can't sit on the hour timeline, so
        // show them as an all-day banner on their date, flagged as at-location.
        const isLocationVisit = !b.room_id && String(b.booking_time ?? "").startsWith("00:00");
        return {
          id: `booking:${b.id}`,
          calendar_type: "treatment",
          // A custom title (set in the booking edit modal) wins; otherwise fall
          // back to the auto "Guest — Service" label.
          title: (b.title && String(b.title).trim())
            ? String(b.title).trim()
            : `${b.guest_name ?? "Guest"} — ${b.services?.title ?? "Treatment"}`,
          entry_date: b.booking_date,
          end_date: null,
          start_time: String(b.booking_time ?? "09:00").slice(0, 5),
          end_time: null,
          duration_minutes: b.services?.duration_minutes ?? 60,
          notes: null,
          color: bookingColor(b.status),
          room_id: b.room_id,
          is_offsite: isLocationVisit,
          offsite_location: isLocationVisit ? "At client location" : null,
          group_id: null,
          is_all_day: isLocationVisit,
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
        };
      });
    setBookingEntries(mapped);
  }, [calendarType, currentDate, readOnly]);
  useEffect(() => { loadBookings(); }, [loadBookings]);

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentDate)),
    end: endOfWeek(endOfMonth(currentDate)),
  });

  /** An entry wears its sub-calendar's color, else the calendar-type default. */
  const entryColor = (entry: CalendarEntry): string =>
    groups.find((g) => g.id === entry.group_id)?.color
      ?? entry.color
      ?? TYPE_COLORS[calendarType];

  /** Entries on hidden sub-calendars drop out; ungrouped ones always show. */
  const visibleEntries = entries.filter((e) => !e.group_id || !hiddenGroups.has(e.group_id));

  /** What the calendar grid + day view render: manual entries AND website
   *  bookings. The management list below stays manual-only. */
  const calendarItems = [...visibleEntries, ...bookingEntries];

  /** yyyy-MM-dd strings compare correctly, so a plain range check is enough. */
  const coversDay = (e: CalendarEntry, dayKey: string) =>
    e.entry_date <= dayKey && (e.end_date ?? e.entry_date) >= dayKey;

  /** Multi-day entries read as banners, like all-day ones — not as a block
   *  pinned to one hour of one day. */
  const isBanner = (e: CalendarEntry) =>
    e.is_all_day || !!(e.end_date && e.end_date > e.entry_date);

  /** Where the entry happens, for the list view. Null when unspecified. */
  const locationLabel = (entry: CalendarEntry): string | null => {
    if (entry.is_offsite) {
      return entry.offsite_location ? `Off-site · ${entry.offsite_location}` : "Off-site";
    }
    if (entry.room_id) return rooms.find((r) => r.id === entry.room_id)?.name ?? null;
    return null;
  };

  // A website booking opens the full (editable) booking modal; a manual entry
  // opens the calendar-entry form.
  const [editBooking, setEditBooking] = useState<CalendarBooking | null>(null);
  const [bookingEditOpen, setBookingEditOpen] = useState(false);
  const [servicesForEdit, setServicesForEdit] = useState<any[]>([]);
  useEffect(() => {
    supabase.from("services").select("id, title, category, type, duration_minutes, price")
      .then(({ data }) => setServicesForEdit(data ?? []));
  }, []);

  const openBookingForEdit = async (bookingId: string) => {
    if (readOnly) return; // Viewers never load the full (sensitive) booking.
    const { data } = await supabase
      .from("bookings")
      .select("*, services(title, duration_minutes, category, type)")
      .eq("id", bookingId)
      .maybeSingle();
    if (!data) { toast.error("Booking not found"); return; }
    const b: any = data;
    setEditBooking({
      id: b.id, title: b.title ?? null, guest_name: b.guest_name, guest_email: b.guest_email, guest_phone: b.guest_phone,
      booking_date: b.booking_date, booking_time: b.booking_time, status: b.status,
      total_price: b.total_price, notes: b.notes, service_id: b.service_id,
      service_title: b.services?.title ?? null, service_category: b.services?.category ?? null,
      service_type: b.services?.type ?? null, duration_minutes: b.services?.duration_minutes ?? 60,
      intake_form: b.intake_form, card_authorization: b.card_authorization,
      staff_id: b.staff_id, room_id: b.room_id, payment_id: b.payment_id,
    });
    setBookingEditOpen(true);
  };

  const openItem = (entry: CalendarEntry, fromDay?: Date | null) => {
    if (readOnly) return; // Viewers can't open the edit modals.
    if (entry.booking) { setDayViewDate(null); openBookingForEdit(entry.booking.id); return; }
    if (fromDay !== undefined) setReturnToDay(fromDay);
    setDayViewDate(null);
    openEdit(entry);
  };

  /** Close the entry form and drop back into the day it was opened from. */
  const closeEntryModal = () => {
    setModalOpen(false);
    if (returnToDay) {
      setDayViewDate(returnToDay);
      setReturnToDay(null);
    }
  };

  const openNew = (date?: Date) => {
    if (readOnly) return;
    setEditingEntry(null);
    const day = format(date || new Date(), "yyyy-MM-dd");
    setForm({
      ...emptyForm,
      entry_date: day,
      end_date: day,
    });
    setCreatingGroup(false);
    setModalOpen(true);
  };

  const openEdit = (entry: CalendarEntry) => {
    if (readOnly) return;
    setEditingEntry(entry);
    setForm({
      title: entry.title,
      entry_date: entry.entry_date,
      end_date: entry.end_date ?? entry.entry_date,
      start_time: entry.start_time.slice(0, 5),
      duration_minutes: entry.duration_minutes,
      notes: entry.notes || "",
      location: entry.is_offsite ? OFFSITE : (entry.room_id ?? ""),
      offsite_location: entry.offsite_location || "",
      group_id: entry.group_id ?? "",
      is_all_day: entry.is_all_day,
      blocks_availability: entry.blocks_availability ?? false,
      recurrence: (entry.recurrence as Recurrence) ?? "none",
      recurrence_until: entry.recurrence_until ?? "",
    });
    setEditScope("one");
    setCreatingGroup(false);
    setModalOpen(true);
  };

  /**
   * Turn the open entry into a new one carrying the same details. Nothing is
   * written until Create, so the original is never touched.
   */
  const duplicateEntry = () => {
    if (readOnly) return;
    setEditingEntry(null);
    setForm((f) => ({ ...f, title: `${f.title} (copy)` }));
    toast.info("Duplicated — change the title, then press Create");
  };

  const handleSave = async () => {
    if (readOnly) return;
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    if (form.end_date && form.end_date < form.entry_date) {
      toast.error("The end date can't be before the start date");
      return;
    }
    setSaving(true);

    const hours = Math.floor(form.duration_minutes / 60);
    const mins = form.duration_minutes % 60;
    const [sh, sm] = form.start_time.split(":").map(Number);
    const endH = sh + hours + Math.floor((sm + mins) / 60);
    const endM = (sm + mins) % 60;
    const end_time = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;

    // An all-day entry is stored as midnight + a full day, so that if it holds a
    // room, the room reads as busy for the whole day on the website.
    const allDay = form.is_all_day;

    const payload = {
      calendar_type: calendarType,
      title: form.title.trim(),
      entry_date: form.entry_date,
      // Store a same-day range as null, so single-day entries stay simple.
      end_date: form.end_date && form.end_date > form.entry_date ? form.end_date : null,
      start_time: allDay ? "00:00" : form.start_time,
      end_time: allDay ? null : end_time,
      duration_minutes: allDay ? 1440 : form.duration_minutes,
      is_all_day: allDay,
      blocks_availability: form.blocks_availability,
      group_id: form.group_id || null,
      notes: form.notes || null,
      color: TYPE_COLORS[calendarType],
      // Only a room pins the entry to the spa; off-site leaves every room free.
      room_id: form.location && form.location !== OFFSITE ? form.location : null,
      is_offsite: form.location === OFFSITE,
      // Drop the place if the entry is no longer off-site, so a stale address
      // can't linger on a room booking.
      offsite_location: form.location === OFFSITE ? (form.offsite_location.trim() || null) : null,
    };

    const repeats = form.recurrence !== "none";
    const spanDays = payload.end_date
      ? differenceInCalendarDays(parseISO(payload.end_date), parseISO(payload.entry_date))
      : 0;

    let error;
    let created = 1;

    if (editingEntry && editScope === "series" && editingEntry.series_id) {
      // Change the whole series but leave each occurrence on its own date —
      // rescheduling the series' dates is what deleting and recreating is for.
      const { entry_date: _d, end_date: _e, ...seriesFields } = payload;
      ({ error } = await supabase
        .from("admin_calendar_entries")
        .update(seriesFields)
        .eq("series_id", editingEntry.series_id));
    } else if (editingEntry) {
      // Editing one occurrence detaches it from nothing — it keeps its
      // series_id so the series can still be managed as a whole.
      ({ error } = await supabase.from("admin_calendar_entries").update(payload).eq("id", editingEntry.id));
    } else if (repeats) {
      const dates = expandRecurrence(form.entry_date, form.recurrence_until, form.recurrence);
      const seriesId = crypto.randomUUID();
      const rows = dates.map((d) => ({
        ...payload,
        entry_date: d,
        end_date: spanDays > 0 ? format(addDays(parseISO(d), spanDays), "yyyy-MM-dd") : null,
        series_id: seriesId,
        recurrence: form.recurrence,
        recurrence_until: form.recurrence_until || null,
      }));
      created = rows.length;
      ({ error } = await supabase.from("admin_calendar_entries").insert(rows));
    } else {
      ({ error } = await supabase.from("admin_calendar_entries").insert(payload));
    }

    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(
      editingEntry
        ? (editScope === "series" && editingEntry.series_id ? "Series updated" : "Entry updated")
        : created > 1 ? `Created ${created} entries` : "Entry created",
    );
    closeEntryModal();
    loadEntries();
  };

  const handleDelete = async (entry: CalendarEntry) => {
    if (readOnly) return;
    let query = supabase.from("admin_calendar_entries").delete();
    let message = "Entry deleted";

    if (entry.series_id) {
      const wholeSeries = confirm(
        `"${entry.title}" repeats.\n\nOK = delete EVERY occurrence in the series.\nCancel = delete only this one.`,
      );
      if (wholeSeries) {
        query = query.eq("series_id", entry.series_id);
        message = "Series deleted";
      } else {
        query = query.eq("id", entry.id);
      }
    } else {
      query = query.eq("id", entry.id);
    }

    const { error } = await query;
    if (error) { toast.error(error.message); return; }
    toast.success(message);
    loadEntries();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-heading font-bold text-foreground">
            {readOnly ? "Treatments Calendar" : "Internal Calendars"}
            {readOnly && (
              <span className="ml-2 align-middle text-xs font-body font-medium uppercase tracking-wide text-muted-foreground border border-border rounded-full px-2 py-0.5">
                View only
              </span>
            )}
          </h2>
          <p className="text-sm text-muted-foreground">
            {readOnly ? "Schedule overview — read only" : "Private scheduling for management only"}
          </p>
        </div>
        {!readOnly && (
          <Button size="sm" onClick={() => openNew()}>
            <Plus className="h-4 w-4 mr-1" /> Add Entry
          </Button>
        )}
      </div>

      <Tabs value={calendarType} onValueChange={(v) => setCalendarType(v as CalendarType)}>
        {/* One calendar type = no tab strip needed (coordinator view). */}
        {visibleTypes.length > 1 && (
          <TabsList>
            {visibleTypes.map((t) => (
              <TabsTrigger key={t} value={t} className="capitalize">{TYPE_LABELS[t]}</TabsTrigger>
            ))}
          </TabsList>
        )}

        {visibleTypes.map((t) => (
          <TabsContent key={t} value={t} className="mt-4">
            {t === "class" ? (
              <AdminClassCalendarWithAttendees />
            ) : (
              <>

            {/* Calendar Navigation */}
            <div className="flex items-center justify-between mb-4">
              <Button variant="outline" size="icon" onClick={() => setCurrentDate(subMonths(currentDate, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <h3 className="font-heading text-lg font-semibold">{format(currentDate, "MMMM yyyy")}</h3>
              <Button variant="outline" size="icon" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {!readOnly && (
              <CalendarGroupsBar
                groups={groups}
                hidden={hiddenGroups}
                onToggle={toggleGroup}
                onChanged={loadGroups}
              />
            )}

            {/* Calendar Grid */}
            <div className="border border-border rounded-xl overflow-hidden">
              {/* Weekday headers */}
              <div className="grid grid-cols-7 bg-muted">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div key={d} className="p-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border">
                    {d}
                  </div>
                ))}
              </div>
              {/* Day cells */}
              <div className="grid grid-cols-7">
                {days.map((day) => {
                  const dayKey = format(day, "yyyy-MM-dd");
                  const dayEntries = calendarItems
                    .filter((e) => coversDay(e, dayKey))
                    // Banners read as headers for the day, so float them up.
                    .sort((a, b) => Number(isBanner(b)) - Number(isBanner(a)));
                  const isToday = isSameDay(day, new Date());
                  const inMonth = isSameMonth(day, currentDate);

                  return (
                    <div
                      key={day.toISOString()}
                      className={cn(
                        "min-h-[100px] border-b border-r border-border p-1.5 cursor-pointer hover:bg-muted/30 transition-colors",
                        !inMonth && "opacity-40 bg-muted/10"
                      )}
                      onClick={() => setDayViewDate(day)}
                      title="Open day view"
                    >
                      <div className={cn(
                        "text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full",
                        isToday && "bg-primary text-primary-foreground"
                      )}>
                        {format(day, "d")}
                      </div>
                      <div className="space-y-0.5">
                        {dayEntries.slice(0, 3).map((entry) => {
                          const color = entryColor(entry);
                          return (
                            <div
                              key={entry.id}
                              onClick={(e) => { e.stopPropagation(); openItem(entry); }}
                              className={cn(
                                "text-[10px] leading-tight px-1.5 py-0.5 rounded truncate font-medium cursor-pointer hover:opacity-80",
                                entry.booking && "ring-1 ring-inset",
                              )}
                              style={
                                isBanner(entry)
                                  ? { backgroundColor: color, color: readableOn(color) }
                                  : { backgroundColor: `${color}20`, color }
                              }
                              title={entry.booking ? "Website booking" : undefined}
                            >
                              {entry.booking ? "🌐 " : ""}{isBanner(entry) ? entry.title : `${entry.start_time.slice(0, 5)} ${entry.title}`}
                            </div>
                          );
                        })}
                        {dayEntries.length > 3 && (
                          <div className="text-[10px] text-muted-foreground px-1.5">+{dayEntries.length - 3} more</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* List view below calendar */}
            <div className="mt-6 space-y-2">
              <h4 className="font-heading text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Entries this month ({visibleEntries.length})
              </h4>
              {visibleEntries.length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">No entries for this month. Click a day or "Add Entry" to create one.</p>
              )}
              {visibleEntries.map((entry) => (
                <Card key={entry.id} className="p-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-2 h-8 rounded-full shrink-0" style={{ backgroundColor: entryColor(entry) }} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{entry.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(parseISO(entry.entry_date), "MMM d, yyyy")}
                        {entry.end_date && entry.end_date > entry.entry_date
                          && ` – ${format(parseISO(entry.end_date), "MMM d, yyyy")}`}
                        {entry.is_all_day
                          ? " · All day"
                          : ` · ${entry.start_time.slice(0, 5)}${entry.end_time ? ` – ${entry.end_time.slice(0, 5)}` : ""} · ${entry.duration_minutes}min`}
                        {locationLabel(entry) && ` · ${locationLabel(entry)}`}
                      </p>
                      {entry.notes && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 break-words">
                          <LinkifiedText text={entry.notes} linkClassName="text-spa-sage" />
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Duplicate"
                      onClick={() => { openEdit(entry); duplicateEntry(); }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit" onClick={() => openEdit(entry)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Delete" onClick={() => handleDelete(entry)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
              </>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* Day view — a single day laid out on a timeline */}
      <Dialog open={!!dayViewDate} onOpenChange={(o) => { if (!o) setDayViewDate(null); }}>
        <DialogContent className="max-w-[1320px] w-[96vw] max-h-[95vh]">
          <DialogHeader>
            <DialogTitle>{dayViewDate ? format(dayViewDate, "EEEE, MMMM d, yyyy") : ""}</DialogTitle>
          </DialogHeader>
          {dayViewDate && (() => {
            const dayKey = format(dayViewDate, "yyyy-MM-dd");
            const dayEntries = calendarItems.filter((e) => coversDay(e, dayKey));
            // All-day and multi-day entries sit in a band above the timeline,
            // out of the way of the hour-by-hour schedule.
            const allDayEntries = dayEntries.filter(isBanner);
            const laid = layoutDay(dayEntries.filter((e) => !isBanner(e)));
            // Stretch the default window to fit anything outside it.
            const startH = Math.min(DEFAULT_DAY_START_H, ...laid.map((l) => Math.floor(l.startMin / 60)));
            const endH = Math.max(DEFAULT_DAY_END_H, ...laid.map((l) => Math.ceil(l.endMin / 60)));
            const dayStartMin = startH * 60;
            const hours = Array.from({ length: endH - startH + 1 }, (_, i) => startH + i);
            // Size the hours to the screen so the whole window lands in one view
            // rather than assuming a laptop height. Clamped so rows stay
            // readable on a short screen and don't balloon on a tall one.
            const availPx = (typeof window !== "undefined" ? window.innerHeight : 900) - DAY_VIEW_CHROME_PX;
            const hourPx = Math.max(
              MIN_HOUR_PX,
              Math.min(MAX_HOUR_PX, Math.floor((availPx - 8) / Math.max(endH - startH, 1))),
            );

            // Horizontal sizing: give each overlapping column a readable width.
            // When they'd get too narrow to read (busy day), the timeline scrolls
            // sideways instead of squishing/clipping the columns.
            const maxLanes = Math.max(1, ...laid.map((l) => l.lanes));
            const availW = (typeof window !== "undefined" ? Math.min(window.innerWidth * 0.96, 1320) : 900)
              - DAY_TIME_GUTTER_PX - 48; // dialog padding + scrollbar allowance
            const laneW = Math.max(DAY_LANE_MIN_PX, Math.floor(availW / maxLanes));
            const canvasW = DAY_TIME_GUTTER_PX + maxLanes * laneW;

            return (
              <div className="min-w-0">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <p className="text-sm text-muted-foreground min-w-0 truncate">
                    {dayEntries.length === 0
                      ? "Nothing scheduled"
                      : `${dayEntries.length} ${dayEntries.length === 1 ? "entry" : "entries"}`}
                  </p>
                  {!readOnly && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      onClick={() => { const d = dayViewDate; setReturnToDay(d); setDayViewDate(null); openNew(d); }}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add entry
                    </Button>
                  )}
                </div>

                {allDayEntries.length > 0 && (
                  <div className="mb-3 space-y-1 border-b border-border pb-3">
                    {allDayEntries.map((entry) => {
                      const color = entryColor(entry);
                      const loc = locationLabel(entry);
                      return (
                        <div
                          key={entry.id}
                          onClick={() => openItem(entry, dayViewDate)}
                          className="flex items-start md:items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer hover:opacity-80 transition-opacity"
                          style={{ backgroundColor: `${color}20`, borderColor: `${color}55`, color }}
                          title={`All day · ${entry.title}${loc ? ` · ${loc}` : ""}`}
                        >
                          <span className="text-xs font-bold uppercase tracking-wide opacity-70 shrink-0 mt-0.5 md:mt-0">
                            {entry.end_date && entry.end_date > entry.entry_date
                              ? `${format(parseISO(entry.entry_date), "MMM d")} – ${format(parseISO(entry.end_date), "MMM d")}`
                              : "All day"}
                          </span>
                          {/* Wrap fully on mobile (see everything); truncate on desktop to keep the band a single line. */}
                          <span className="text-sm font-semibold min-w-0 break-words md:truncate">{entry.title}</span>
                          {loc && <span className="ml-auto shrink-0 text-xs font-medium opacity-70">{loc}</span>}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Mobile: a plain vertical list of the timed entries. The
                    desktop timeline below packs overlapping bookings into side
                    columns, which get clipped on a phone — coordinators need to
                    read the whole day, so on <md we list them top-to-bottom. */}
                <div className="md:hidden space-y-2 overflow-y-auto max-h-[calc(100vh-11rem)] pr-0.5">
                  {laid.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">Nothing scheduled at a set time.</p>
                  ) : (
                    [...laid]
                      .sort((a, b) => a.startMin - b.startMin)
                      .map(({ entry, startMin, endMin }) => {
                        const color = entryColor(entry);
                        const loc = locationLabel(entry);
                        return (
                          <div
                            key={entry.id}
                            onClick={() => openItem(entry, dayViewDate)}
                            className="rounded-lg border px-3 py-2.5 cursor-pointer active:opacity-80 transition-opacity"
                            style={{ backgroundColor: `${color}18`, borderColor: `${color}44`, borderLeftColor: color, borderLeftWidth: 4 }}
                          >
                            <p className="text-xs font-semibold" style={{ color }}>{rangeLabel(startMin, endMin)}</p>
                            <p className="text-sm font-medium text-foreground leading-snug mt-0.5">
                              {entry.booking ? "🌐 " : ""}{entry.title}
                            </p>
                            {loc && <p className="text-xs text-muted-foreground mt-0.5">{loc}</p>}
                          </div>
                        );
                      })
                  )}
                </div>

                {/* pt-2 gives the first hour label room — it sits half a line
                    above its own gridline and would otherwise clip at the top. */}
                <div className="hidden md:block overflow-auto max-h-[calc(100vh-11rem)] pr-1 pt-2">
                  <div className="relative" style={{ height: (endH - startH) * hourPx + 8, width: canvasW, minWidth: "100%" }}>
                    {hours.map((h, i) => (
                      <div key={h} className="absolute left-0 right-0 flex items-start" style={{ top: i * hourPx }}>
                        <span className="w-[60px] shrink-0 -translate-y-2 pr-2 text-right text-sm font-semibold text-muted-foreground">
                          {minutesLabel(h * 60)}
                        </span>
                        <div className="flex-1 border-t border-border" />
                      </div>
                    ))}

                    <div className="absolute inset-y-0 right-0" style={{ left: DAY_TIME_GUTTER_PX }}>
                      {laid.map(({ entry, startMin, endMin, lane }) => {
                        const color = entryColor(entry);
                        const loc = locationLabel(entry);
                        return (
                          <div
                            key={entry.id}
                            onClick={() => openItem(entry, dayViewDate)}
                            className={cn(
                              "absolute rounded-lg border px-2.5 py-1.5 overflow-hidden cursor-pointer hover:opacity-80 hover:shadow-sm transition-all",
                              entry.booking && "ring-1 ring-inset",
                            )}
                            style={{
                              top: ((startMin - dayStartMin) / 60) * hourPx,
                              height: Math.max(((endMin - startMin) / 60) * hourPx - 2, 30),
                              left: lane * laneW + 2,
                              width: laneW - DAY_LANE_GAP_PX,
                              backgroundColor: `${color}20`,
                              borderColor: `${color}55`,
                              color,
                            }}
                            title={`${entry.booking ? "Website booking · " : ""}${rangeLabel(startMin, endMin)} · ${entry.title}${loc ? ` · ${loc}` : ""}`}
                          >
                            <p className="text-sm font-bold leading-snug truncate">
                              {entry.booking ? "🌐 " : ""}{rangeLabel(startMin, endMin)} · {entry.title}
                            </p>
                            {loc && <p className="text-xs font-medium leading-snug truncate opacity-80">{loc}</p>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Website booking — full editable modal (with card-on-file reveal) */}
      <BookingEditModal
        booking={editBooking}
        open={bookingEditOpen}
        onOpenChange={setBookingEditOpen}
        onSaved={() => { loadBookings(); loadEntries(); }}
        services={servicesForEdit}
        onDuplicated={(newId) => openBookingForEdit(newId)}
      />

      {/* Add/Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={(o) => { if (o) setModalOpen(true); else closeEntryModal(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingEntry ? "Edit Entry" : "New Entry"} — {TYPE_LABELS[calendarType]}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Deep Tissue Massage" />
            </div>
            <div className="space-y-1.5">
              <Label>Calendar</Label>
              <div className="flex items-center gap-2">
                <span
                  className="h-3.5 w-3.5 rounded-full shrink-0 border border-border"
                  style={{ backgroundColor: groups.find((g) => g.id === form.group_id)?.color ?? TYPE_COLORS[calendarType] }}
                />
                <select
                  value={form.group_id}
                  onChange={(e) => setForm({ ...form, group_id: e.target.value })}
                  className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="">Default — {TYPE_LABELS[calendarType]}</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
                {!creatingGroup && (
                  <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" onClick={startNewGroup}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> New
                  </Button>
                )}
              </div>

              {creatingGroup && (
                <div className="rounded-md border border-border p-2 space-y-2">
                  <Input
                    autoFocus
                    value={groupDraft.name}
                    onChange={(e) => setGroupDraft({ ...groupDraft, name: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); saveNewGroup(); }
                      if (e.key === "Escape") { e.preventDefault(); setCreatingGroup(false); }
                    }}
                    placeholder="Calendar name — e.g. Ashley, No show, On call"
                    className="h-8 text-sm"
                  />
                  <div className="flex flex-wrap gap-1">
                    {PALETTE.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setGroupDraft({ ...groupDraft, color: c })}
                        className={cn(
                          "h-6 w-6 rounded-full border-2 transition-transform",
                          groupDraft.color === c ? "border-foreground scale-110" : "border-transparent",
                        )}
                        style={{ backgroundColor: c }}
                        title={c}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" className="h-7 text-xs" onClick={saveNewGroup} disabled={savingGroup}>
                      {savingGroup ? "Creating..." : "Create calendar"}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setCreatingGroup(false)} disabled={savingGroup}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <label className="flex items-center gap-2 cursor-pointer w-fit">
              <Checkbox
                checked={form.is_all_day}
                onCheckedChange={(v) => setForm({ ...form, is_all_day: v === true })}
              />
              <span className="text-sm">All day</span>
            </label>

            {/* Only on the Treatments calendar: hide website availability during
                this window (lunch, off-site with no coverage). */}
            {calendarType === "treatment" && (
              <label className="flex items-start gap-2 cursor-pointer w-fit rounded-md border border-amber-300/60 bg-amber-50/60 px-3 py-2">
                <Checkbox
                  className="mt-0.5"
                  checked={form.blocks_availability}
                  onCheckedChange={(v) => setForm({ ...form, blocks_availability: v === true })}
                />
                <span className="text-sm">
                  Block website availability
                  <span className="block text-xs text-muted-foreground">
                    No online slots during this time (e.g. lunch, or off-site with no therapist free). WhatsApp &amp; at-your-location requests stay open.
                  </span>
                </span>
              </label>
            )}

            <div className="space-y-1.5">
              <Label>Dates</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={form.entry_date}
                  onChange={(e) => {
                    const start = e.target.value;
                    // Drag the end along so the range can never go backwards.
                    setForm({ ...form, entry_date: start, end_date: form.end_date < start ? start : form.end_date });
                  }}
                />
                <span className="text-sm text-muted-foreground shrink-0">to</span>
                <Input
                  type="date"
                  min={form.entry_date}
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                />
              </div>
              {form.end_date > form.entry_date && (
                <p className="text-xs text-muted-foreground">
                  Spans {differenceInCalendarDays(parseISO(form.end_date), parseISO(form.entry_date)) + 1} days — it shows on every day in the range.
                </p>
              )}
            </div>
            {!form.is_all_day && (
              <div className="space-y-1.5">
                <Label>Start Time</Label>
                <Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
              </div>
            )}

            {/* Repeat rules only apply when creating — an existing series is
                changed through the scope control below instead. */}
            {!editingEntry && (
              <div className="space-y-1.5">
                <Label>Repeats</Label>
                <div className="flex items-center gap-2">
                  <select
                    value={form.recurrence}
                    onChange={(e) => {
                      const recurrence = e.target.value as Recurrence;
                      setForm({
                        ...form,
                        recurrence,
                        // Default the series to ~3 months so it's never unbounded.
                        recurrence_until:
                          recurrence !== "none" && !form.recurrence_until
                            ? format(addMonths(parseISO(form.entry_date), 3), "yyyy-MM-dd")
                            : form.recurrence_until,
                      });
                    }}
                    className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                  >
                    {(Object.keys(RECURRENCE_LABELS) as Recurrence[]).map((r) => (
                      <option key={r} value={r}>
                        {r === "weekly" || r === "biweekly"
                          ? `${RECURRENCE_LABELS[r]} on ${format(parseISO(form.entry_date), "EEEE")}`
                          : r === "monthly"
                            ? `${RECURRENCE_LABELS[r]} on day ${format(parseISO(form.entry_date), "d")}`
                            : RECURRENCE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                  {form.recurrence !== "none" && (
                    <>
                      <span className="text-sm text-muted-foreground shrink-0">until</span>
                      <Input
                        type="date"
                        min={form.entry_date}
                        value={form.recurrence_until}
                        onChange={(e) => setForm({ ...form, recurrence_until: e.target.value })}
                      />
                    </>
                  )}
                </div>
                {form.recurrence !== "none" && (
                  <p className="text-xs text-muted-foreground">
                    Creates {expandRecurrence(form.entry_date, form.recurrence_until, form.recurrence).length} entries — each one can be edited or deleted on its own afterwards.
                  </p>
                )}
              </div>
            )}

            {editingEntry?.series_id && (
              <div className="space-y-1.5 rounded-md border border-border bg-muted/30 p-2">
                <Label>This entry repeats — apply changes to</Label>
                <select
                  value={editScope}
                  onChange={(e) => setEditScope(e.target.value as "one" | "series")}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="one">This entry only</option>
                  <option value="series">Every entry in the series</option>
                </select>
                {editScope === "series" && (
                  <p className="text-xs text-muted-foreground">
                    Dates stay as they are — everything else (title, time, room, calendar, notes) is applied to the whole series.
                  </p>
                )}
              </div>
            )}
            {!form.is_all_day && (
              <div className="space-y-1.5">
                <Label>Duration (minutes)</Label>
                <Input type="number" min={15} step={15} value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: parseInt(e.target.value) || 60 })} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Location</Label>
              <select
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">Not specified</option>
                <option value={OFFSITE}>Off-site (client's location)</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>Holis Wellness Center — {r.name}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                {form.location === OFFSITE
                  ? "No room is held — the spa stays fully bookable online."
                  : form.location
                    ? "This room shows as unavailable on the website for this time."
                    : "Pick a room to hold it, or Off-site to leave the spa free."}
              </p>
            </div>
            {form.location === OFFSITE && (
              <div className="space-y-1.5">
                <Label>Place (optional)</Label>
                <Input
                  value={form.offsite_location}
                  onChange={(e) => setForm({ ...form, offsite_location: e.target.value })}
                  placeholder="e.g. Hotel Costa Verde, Villa 4"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Notes (optional)</Label>
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={openInsertLink}>
                  <LinkIcon className="h-3.5 w-3.5 mr-1" /> Insert link
                </Button>
              </div>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
                placeholder="Internal notes — use Insert link, or paste a link and it becomes clickable"
              />
              {/* The textarea can't be clicked through, so surface the note's
                  links here — where they can be opened and renamed. */}
              {extractLinks(form.notes).length > 0 && (
                <div className="space-y-1.5 rounded-md border border-border bg-muted/30 p-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Links in this note
                  </p>
                  {extractLinks(form.notes).map((link) =>
                    renamingLink === link.href ? (
                      <div key={link.href} className="space-y-1.5 rounded border border-border bg-background p-2">
                        <Input
                          autoFocus
                          value={linkNameDraft}
                          onChange={(e) => setLinkNameDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); applyLinkName(link); }
                            if (e.key === "Escape") { e.preventDefault(); setRenamingLink(null); }
                          }}
                          placeholder="e.g. Ficha del cliente"
                          className="h-7 text-xs"
                        />
                        <div className="flex items-center gap-1">
                          <Button size="sm" className="h-6 text-[11px]" onClick={() => applyLinkName(link)}>Save</Button>
                          <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => setRenamingLink(null)}>Cancel</Button>
                          <span className="ml-auto truncate text-[10px] text-muted-foreground" title={link.href}>
                            {prettyUrl(link.href)}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div
                        key={link.href}
                        className="flex items-center gap-2 rounded border border-border bg-background px-2 py-1.5"
                      >
                        <LinkIcon className="h-3.5 w-3.5 shrink-0 text-spa-sage" />
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-w-0 flex-1"
                          title={link.href}
                        >
                          <span className="block truncate text-xs font-medium text-spa-sage hover:underline">
                            {link.named ? link.label : prettyUrl(link.href)}
                          </span>
                          {link.named && (
                            <span className="block truncate text-[10px] text-muted-foreground">
                              {prettyUrl(link.href)}
                            </span>
                          )}
                        </a>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 shrink-0 px-2 text-[11px]"
                          onClick={() => { setRenamingLink(link.href); setLinkNameDraft(link.named ? link.label : ""); }}
                        >
                          {link.named ? "Rename" : "Name it"}
                        </Button>
                      </div>
                    ),
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 pt-2">
              {editingEntry && (
                <Button variant="ghost" onClick={duplicateEntry} disabled={saving} title="Copy this entry into a new one">
                  <Copy className="h-4 w-4 mr-1.5" /> Duplicate
                </Button>
              )}
              <Button variant="outline" className="ml-auto" onClick={closeEntryModal}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : editingEntry ? "Update" : "Create"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Insert link — display text + address, like Google Calendar's */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Insert link</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Text to display</Label>
              <Input
                autoFocus
                value={linkText}
                onChange={(e) => setLinkText(e.target.value)}
                placeholder="e.g. Ficha del cliente"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Link to web address</Label>
              <Input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); insertLink(); } }}
                placeholder="https://docs.google.com/…"
              />
              <p className="text-xs text-muted-foreground">
                Leave the text blank to show the address itself.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>Cancel</Button>
              <Button onClick={insertLink} disabled={!linkUrl.trim()}>Insert</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
