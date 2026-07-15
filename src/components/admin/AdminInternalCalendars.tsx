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

type CalendarType = "treatment" | "retreat" | "class";

interface CalendarEntry {
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
}

interface Room {
  id: string;
  name: string;
}

/** Form value for the location select: "" = unset, "offsite", or a room id. */
const OFFSITE = "offsite";

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
    });
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

    const payload = {
      calendar_type: calendarType,
      title: form.title.trim(),
      entry_date: form.entry_date,
      start_time: form.start_time,
      end_time,
      duration_minutes: form.duration_minutes,
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
                  const dayEntries = entries.filter((e) => e.entry_date === format(day, "yyyy-MM-dd"));
                  const isToday = isSameDay(day, new Date());
                  const inMonth = isSameMonth(day, currentDate);

                  return (
                    <div
                      key={day.toISOString()}
                      className={cn(
                        "min-h-[100px] border-b border-r border-border p-1.5 cursor-pointer hover:bg-muted/30 transition-colors",
                        !inMonth && "opacity-40 bg-muted/10"
                      )}
                      onClick={() => openNew(day)}
                    >
                      <div className={cn(
                        "text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full",
                        isToday && "bg-primary text-primary-foreground"
                      )}>
                        {format(day, "d")}
                      </div>
                      <div className="space-y-0.5">
                        {dayEntries.slice(0, 3).map((entry) => (
                          <div
                            key={entry.id}
                            onClick={(e) => { e.stopPropagation(); openEdit(entry); }}
                            className="text-[10px] leading-tight px-1.5 py-0.5 rounded truncate font-medium cursor-pointer hover:opacity-80"
                            style={{ backgroundColor: `${entry.color || TYPE_COLORS[calendarType]}20`, color: entry.color || TYPE_COLORS[calendarType] }}
                          >
                            {entry.start_time.slice(0, 5)} {entry.title}
                          </div>
                        ))}
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
                Entries this month ({entries.length})
              </h4>
              {entries.length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">No entries for this month. Click a day or "Add Entry" to create one.</p>
              )}
              {entries.map((entry) => (
                <Card key={entry.id} className="p-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-2 h-8 rounded-full shrink-0" style={{ backgroundColor: entry.color || TYPE_COLORS[calendarType] }} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{entry.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(parseISO(entry.entry_date), "MMM d, yyyy")} · {entry.start_time.slice(0, 5)}
                        {entry.end_time && ` – ${entry.end_time.slice(0, 5)}`} · {entry.duration_minutes}min
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Start Time</Label>
                <Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Duration (minutes)</Label>
              <Input type="number" min={15} step={15} value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: parseInt(e.target.value) || 60 })} />
            </div>
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
