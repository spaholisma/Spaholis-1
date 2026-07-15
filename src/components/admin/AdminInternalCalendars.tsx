import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2 } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, startOfWeek, endOfWeek, isSameMonth, isSameDay, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { AdminClassCalendarWithAttendees } from "./AdminClassCalendarWithAttendees";
import { CalendarGroupsBar, type CalendarGroup } from "./CalendarGroupsBar";
import { readableOn, PALETTE } from "./AttendeeLabelPicker";
import { Checkbox } from "@/components/ui/checkbox";

type CalendarType = "treatment" | "retreat" | "class";

export interface CalendarEntry {
  id: string;
  calendar_type: string;
  title: string;
  entry_date: string;
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
}

interface Room {
  id: string;
  name: string;
}

/** Form value for the location select: "" = unset, "offsite", or a room id. */
const OFFSITE = "offsite";

/** Day view: pixels per hour, and the default window before entries stretch it. */
const HOUR_PX = 76;
const DEFAULT_DAY_START_H = 8;
const DEFAULT_DAY_END_H = 20;

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

const minutesLabel = (mins: number): string => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
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
  start_time: "09:00",
  duration_minutes: 60,
  notes: "",
  location: "",
  offsite_location: "",
  group_id: "",
  is_all_day: false,
};

export function AdminInternalCalendars() {
  const [calendarType, setCalendarType] = useState<CalendarType>("treatment");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<CalendarEntry | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [dayViewDate, setDayViewDate] = useState<Date | null>(null);
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
    const { data } = await supabase
      .from("admin_calendar_entries")
      .select("*")
      .eq("calendar_type", calendarType)
      .gte("entry_date", start)
      .lte("entry_date", end)
      .order("start_time", { ascending: true });
    setEntries((data as CalendarEntry[]) ?? []);
  }, [calendarType, currentDate]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

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

  /** Where the entry happens, for the list view. Null when unspecified. */
  const locationLabel = (entry: CalendarEntry): string | null => {
    if (entry.is_offsite) {
      return entry.offsite_location ? `Off-site · ${entry.offsite_location}` : "Off-site";
    }
    if (entry.room_id) return rooms.find((r) => r.id === entry.room_id)?.name ?? null;
    return null;
  };

  const openNew = (date?: Date) => {
    setEditingEntry(null);
    setForm({
      ...emptyForm,
      entry_date: format(date || new Date(), "yyyy-MM-dd"),
    });
    setCreatingGroup(false);
    setModalOpen(true);
  };

  const openEdit = (entry: CalendarEntry) => {
    setEditingEntry(entry);
    setForm({
      title: entry.title,
      entry_date: entry.entry_date,
      start_time: entry.start_time.slice(0, 5),
      duration_minutes: entry.duration_minutes,
      notes: entry.notes || "",
      location: entry.is_offsite ? OFFSITE : (entry.room_id ?? ""),
      offsite_location: entry.offsite_location || "",
      group_id: entry.group_id ?? "",
      is_all_day: entry.is_all_day,
    });
    setCreatingGroup(false);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
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
      start_time: allDay ? "00:00" : form.start_time,
      end_time: allDay ? null : end_time,
      duration_minutes: allDay ? 1440 : form.duration_minutes,
      is_all_day: allDay,
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

    let error;
    if (editingEntry) {
      ({ error } = await supabase.from("admin_calendar_entries").update(payload).eq("id", editingEntry.id));
    } else {
      ({ error } = await supabase.from("admin_calendar_entries").insert(payload));
    }

    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editingEntry ? "Entry updated" : "Entry created");
    setModalOpen(false);
    loadEntries();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("admin_calendar_entries").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Entry deleted");
    loadEntries();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-heading font-bold text-foreground">Internal Calendars</h2>
          <p className="text-sm text-muted-foreground">Private scheduling for management only</p>
        </div>
        <Button size="sm" onClick={() => openNew()}>
          <Plus className="h-4 w-4 mr-1" /> Add Entry
        </Button>
      </div>

      <Tabs value={calendarType} onValueChange={(v) => setCalendarType(v as CalendarType)}>
        <TabsList>
          {(Object.keys(TYPE_LABELS) as CalendarType[]).map((t) => (
            <TabsTrigger key={t} value={t} className="capitalize">{TYPE_LABELS[t]}</TabsTrigger>
          ))}
        </TabsList>

        {(Object.keys(TYPE_LABELS) as CalendarType[]).map((t) => (
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

            <CalendarGroupsBar
              groups={groups}
              hidden={hiddenGroups}
              onToggle={toggleGroup}
              onChanged={loadGroups}
            />

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
                  const dayEntries = visibleEntries
                    .filter((e) => e.entry_date === format(day, "yyyy-MM-dd"))
                    // All-day entries read as banners, so float them to the top.
                    .sort((a, b) => Number(b.is_all_day) - Number(a.is_all_day));
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
                              onClick={(e) => { e.stopPropagation(); openEdit(entry); }}
                              className="text-[10px] leading-tight px-1.5 py-0.5 rounded truncate font-medium cursor-pointer hover:opacity-80"
                              style={
                                entry.is_all_day
                                  ? { backgroundColor: color, color: readableOn(color) }
                                  : { backgroundColor: `${color}20`, color }
                              }
                            >
                              {entry.is_all_day ? entry.title : `${entry.start_time.slice(0, 5)} ${entry.title}`}
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
                        {entry.is_all_day
                          ? " · All day"
                          : ` · ${entry.start_time.slice(0, 5)}${entry.end_time ? ` – ${entry.end_time.slice(0, 5)}` : ""} · ${entry.duration_minutes}min`}
                        {locationLabel(entry) && ` · ${locationLabel(entry)}`}
                      </p>
                      {entry.notes && <p className="text-xs text-muted-foreground truncate mt-0.5">{entry.notes}</p>}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(entry)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(entry.id)}>
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
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{dayViewDate ? format(dayViewDate, "EEEE, MMMM d, yyyy") : ""}</DialogTitle>
          </DialogHeader>
          {dayViewDate && (() => {
            const dayEntries = visibleEntries.filter((e) => e.entry_date === format(dayViewDate, "yyyy-MM-dd"));
            // All-day entries sit in a band above the timeline, out of the way.
            const allDayEntries = dayEntries.filter((e) => e.is_all_day);
            const laid = layoutDay(dayEntries.filter((e) => !e.is_all_day));
            // Stretch the default window to fit anything outside it.
            const startH = Math.min(DEFAULT_DAY_START_H, ...laid.map((l) => Math.floor(l.startMin / 60)));
            const endH = Math.max(DEFAULT_DAY_END_H, ...laid.map((l) => Math.ceil(l.endMin / 60)));
            const dayStartMin = startH * 60;
            const hours = Array.from({ length: endH - startH + 1 }, (_, i) => startH + i);

            return (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-muted-foreground">
                    {dayEntries.length === 0
                      ? "Nothing scheduled"
                      : `${dayEntries.length} ${dayEntries.length === 1 ? "entry" : "entries"}`}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { const d = dayViewDate; setDayViewDate(null); openNew(d); }}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add entry
                  </Button>
                </div>

                {allDayEntries.length > 0 && (
                  <div className="mb-3 space-y-1 border-b border-border pb-3">
                    {allDayEntries.map((entry) => {
                      const color = entryColor(entry);
                      const loc = locationLabel(entry);
                      return (
                        <div
                          key={entry.id}
                          onClick={() => { setDayViewDate(null); openEdit(entry); }}
                          className="flex items-center gap-2 rounded-md border px-2 py-1.5 cursor-pointer hover:opacity-80 transition-opacity"
                          style={{ backgroundColor: `${color}20`, borderColor: `${color}55`, color }}
                          title={`All day · ${entry.title}${loc ? ` · ${loc}` : ""}`}
                        >
                          <span className="text-[10px] font-semibold uppercase tracking-wide opacity-70 shrink-0">All day</span>
                          <span className="text-xs font-medium truncate">{entry.title}</span>
                          {loc && <span className="ml-auto shrink-0 text-[10px] opacity-70">{loc}</span>}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="overflow-y-auto max-h-[58vh] pr-1">
                  <div className="relative" style={{ height: (endH - startH) * HOUR_PX + 8 }}>
                    {hours.map((h, i) => (
                      <div key={h} className="absolute left-0 right-0 flex items-start" style={{ top: i * HOUR_PX }}>
                        <span className="w-14 shrink-0 -translate-y-1.5 pr-2 text-right text-[10px] text-muted-foreground">
                          {minutesLabel(h * 60)}
                        </span>
                        <div className="flex-1 border-t border-border" />
                      </div>
                    ))}

                    <div className="absolute inset-y-0 left-14 right-0">
                      {laid.map(({ entry, startMin, endMin, lane, lanes }) => {
                        const color = entryColor(entry);
                        const loc = locationLabel(entry);
                        return (
                          <div
                            key={entry.id}
                            onClick={() => { setDayViewDate(null); openEdit(entry); }}
                            className="absolute rounded-md border px-2 py-1 overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                            style={{
                              top: ((startMin - dayStartMin) / 60) * HOUR_PX,
                              height: Math.max(((endMin - startMin) / 60) * HOUR_PX - 2, 22),
                              left: `calc(${(lane / lanes) * 100}% + 2px)`,
                              width: `calc(${(1 / lanes) * 100}% - 4px)`,
                              backgroundColor: `${color}20`,
                              borderColor: `${color}55`,
                              color,
                            }}
                            title={`${minutesLabel(startMin)} – ${minutesLabel(endMin)} · ${entry.title}${loc ? ` · ${loc}` : ""}`}
                          >
                            <p className="text-[11px] font-semibold leading-tight truncate">
                              {minutesLabel(startMin)} · {entry.title}
                            </p>
                            {loc && <p className="text-[10px] leading-tight truncate opacity-80">{loc}</p>}
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

      {/* Add/Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
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

            <div className={cn("grid gap-3", form.is_all_day ? "grid-cols-1" : "grid-cols-2")}>
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} />
              </div>
              {!form.is_all_day && (
                <div className="space-y-1.5">
                  <Label>Start Time</Label>
                  <Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
                </div>
              )}
            </div>
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
              <Label>Notes (optional)</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} placeholder="Internal notes..." />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : editingEntry ? "Update" : "Create"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
