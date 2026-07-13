import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { Pencil, Trash2, Plus, Upload, X, CalendarPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";

interface ClassRow {
  id: string;
  title: string;
  title_es: string | null;
  description: string | null;
  description_es: string | null;
  category: string;
  duration_minutes: number;
  price: number;
  image_url: string | null;
  location: string | null;
  location_es: string | null;
  instructor: string | null;
  instructor_es: string | null;
  is_active: boolean;
  is_recurring: boolean;
  recurrence_rule: string | null;
  requires_payment: boolean;
  max_capacity: number;
  payment_link: string | null;
}

interface ScheduleRow {
  id: string;
  class_id: string;
  start_time: string;
  end_time: string;
  spots_remaining: number;
  is_cancelled: boolean;
}

const emptyClass: Omit<ClassRow, "id"> = {
  title: "",
  title_es: "",
  description: "",
  description_es: "",
  category: "Studio Classes",
  duration_minutes: 60,
  price: 0,
  image_url: null,
  location: "Holis Studio",
  location_es: "",
  instructor: "",
  instructor_es: "",
  is_active: true,
  is_recurring: false,
  recurrence_rule: "",
  requires_payment: false,
  max_capacity: 15,
  payment_link: null,
};

const eventCategories = ["Studio Classes", "Yoga", "Workshop", "Sound Bath", "Breathwork", "Meditation", "Fitness", "Retreat", "Special Event"];

export function AdminEventsManager() {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [editing, setEditing] = useState<ClassRow | (Omit<ClassRow, "id"> & { id?: string }) | null>(null);
  const [scheduling, setScheduling] = useState<ClassRow | null>(null);
  const [scheduleForm, setScheduleForm] = useState({ date: "", startTime: "09:00", endTime: "10:00" });
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("classes").select("*").order("title");
    setClasses((data as unknown as ClassRow[]) ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadSchedules = async (classId: string) => {
    const { data } = await supabase
      .from("class_schedule")
      .select("*")
      .eq("class_id", classId)
      .gte("start_time", new Date().toISOString())
      .order("start_time");
    setSchedules((data as ScheduleRow[]) ?? []);
  };

  const handleSave = async () => {
    if (!editing?.title) { toast.error("Title is required"); return; }
    const payload = {
      title: editing.title,
      title_es: editing.title_es || null,
      description: editing.description,
      description_es: editing.description_es || null,
      category: editing.category,
      duration_minutes: editing.duration_minutes,
      price: editing.price,
      image_url: editing.image_url,
      location: editing.location,
      location_es: editing.location_es || null,
      instructor: editing.instructor,
      instructor_es: editing.instructor_es || null,
      is_active: editing.is_active,
      is_recurring: editing.is_recurring,
      recurrence_rule: editing.recurrence_rule || null,
      requires_payment: editing.requires_payment,
      max_capacity: editing.max_capacity,
      payment_link: (editing.payment_link || "").trim() || null,
    };

    if ("id" in editing && editing.id) {
      const { error } = await supabase.from("classes").update(payload as any).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Event updated");
    } else {
      const { error } = await supabase.from("classes").insert(payload as any);
      if (error) { toast.error(error.message); return; }
      toast.success("Event created");
    }
    setEditing(null);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this event and all its scheduled sessions?")) return;
    await supabase.from("class_schedule").delete().eq("class_id", id);
    const { error } = await supabase.from("classes").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    load();
  };

  const handleAddSchedule = async () => {
    if (!scheduling || !scheduleForm.date) { toast.error("Pick a date"); return; }
    const startTime = `${scheduleForm.date}T${scheduleForm.startTime}:00`;
    const endTime = `${scheduleForm.date}T${scheduleForm.endTime}:00`;
    const { error } = await supabase.from("class_schedule").insert({
      class_id: scheduling.id,
      start_time: startTime,
      end_time: endTime,
      spots_remaining: scheduling.max_capacity,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Session scheduled");
    loadSchedules(scheduling.id);
  };

  const handleCancelSchedule = async (id: string) => {
    await supabase.from("class_schedule").update({ is_cancelled: true }).eq("id", id);
    if (scheduling) loadSchedules(scheduling.id);
    toast.success("Session cancelled");
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editing) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("class-images").upload(path, file);
    if (error) { toast.error(error.message); setUploading(false); return; }
    const { data: urlData } = supabase.storage.from("class-images").getPublicUrl(path);
    setEditing({ ...editing, image_url: urlData.publicUrl });
    setUploading(false);
  };

  if (scheduling) {
    return (
      <div className="bg-card rounded-2xl border border-border p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-lg font-medium text-foreground">
            Schedule: {scheduling.title}
          </h3>
          <button onClick={() => setScheduling(null)}><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>

        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Date</label>
            <Input type="date" value={scheduleForm.date} onChange={(e) => setScheduleForm({ ...scheduleForm, date: e.target.value })} />
          </div>
          <div>
            <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Start</label>
            <Input type="time" value={scheduleForm.startTime} onChange={(e) => setScheduleForm({ ...scheduleForm, startTime: e.target.value })} />
          </div>
          <div>
            <label className="font-body text-sm font-medium text-foreground mb-1.5 block">End</label>
            <Input type="time" value={scheduleForm.endTime} onChange={(e) => setScheduleForm({ ...scheduleForm, endTime: e.target.value })} />
          </div>
          <Button onClick={handleAddSchedule}><Plus className="h-4 w-4 mr-1" /> Add Session</Button>
        </div>

        <div className="divide-y divide-border">
          {schedules.map((s) => (
            <div key={s.id} className="flex items-center justify-between py-3">
              <div className="font-body text-sm">
                <span className="font-medium text-foreground">{format(new Date(s.start_time), "EEE, MMM d")}</span>
                <span className="text-muted-foreground"> · {format(new Date(s.start_time), "h:mm a")} – {format(new Date(s.end_time), "h:mm a")}</span>
                <span className="text-muted-foreground"> · {s.spots_remaining} spots</span>
              </div>
              <div className="flex items-center gap-2">
                {s.is_cancelled ? (
                  <span className="text-xs font-body font-semibold text-destructive">Cancelled</span>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => handleCancelSchedule(s.id)}>Cancel</Button>
                )}
              </div>
            </div>
          ))}
          {schedules.length === 0 && <p className="py-4 spa-body-sm text-center">No upcoming sessions scheduled.</p>}
        </div>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-heading text-lg font-medium text-foreground">
            {editing && "id" in editing && editing.id ? "Edit Event" : "New Event"}
          </h3>
          <button onClick={() => setEditing(null)}><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>

        <div>
          <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Featured Image</label>
          {editing.image_url && (
            <img src={editing.image_url} alt="" className="w-40 h-28 object-cover rounded-xl mb-2" />
          )}
          <div className="flex flex-wrap gap-2 items-center">
            <label className="inline-flex items-center gap-2 px-4 py-2 bg-muted rounded-lg cursor-pointer text-sm font-body font-medium text-foreground hover:bg-muted/70 transition-colors">
              <Upload className="h-4 w-4" />
              {uploading ? "Uploading..." : "Upload Image"}
              <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
            </label>
            <Input
              placeholder="…or paste image URL (e.g. /images/yoga.jpg)"
              value={editing.image_url || ""}
              onChange={(e) => setEditing({ ...editing, image_url: e.target.value || null })}
              className="flex-1 min-w-[240px]"
            />
          </div>
        </div>

        {/* Title EN | ES */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Title (EN) *</label>
            <Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
          </div>
          <div>
            <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Title (ES)</label>
            <Input value={editing.title_es || ""} onChange={(e) => setEditing({ ...editing, title_es: e.target.value })} />
          </div>
        </div>

        {/* Category, Instructor EN/ES, Location EN/ES */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Category</label>
            <select
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-body"
              value={editing.category}
              onChange={(e) => setEditing({ ...editing, category: e.target.value })}
            >
              {eventCategories.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Instructor (EN)</label>
            <Input value={editing.instructor || ""} onChange={(e) => setEditing({ ...editing, instructor: e.target.value })} />
          </div>
          <div>
            <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Instructor (ES)</label>
            <Input value={editing.instructor_es || ""} onChange={(e) => setEditing({ ...editing, instructor_es: e.target.value })} />
          </div>
          <div>
            <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Location (EN)</label>
            <Input value={editing.location || ""} onChange={(e) => setEditing({ ...editing, location: e.target.value })} />
          </div>
          <div>
            <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Location (ES)</label>
            <Input value={editing.location_es || ""} onChange={(e) => setEditing({ ...editing, location_es: e.target.value })} />
          </div>
        </div>

        {/* Numerics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Price (₡)</label>
            <Input type="number" value={editing.price} onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })} />
          </div>
          <div>
            <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Duration (min)</label>
            <Input type="number" value={editing.duration_minutes} onChange={(e) => setEditing({ ...editing, duration_minutes: Number(e.target.value) })} />
          </div>
          <div>
            <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Max Capacity</label>
            <Input type="number" value={editing.max_capacity} onChange={(e) => setEditing({ ...editing, max_capacity: Number(e.target.value) })} />
          </div>
          <div>
            <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Recurrence Rule</label>
            <Input
              placeholder="e.g. Mon/Wed/Fri 7am"
              value={editing.recurrence_rule || ""}
              onChange={(e) => setEditing({ ...editing, recurrence_rule: e.target.value })}
            />
          </div>
        </div>

        {/* Descriptions EN | ES */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Description (EN)</label>
            <Textarea
              value={editing.description || ""}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              className="min-h-[120px]"
            />
          </div>
          <div>
            <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Description (ES)</label>
            <Textarea
              value={editing.description_es || ""}
              onChange={(e) => setEditing({ ...editing, description_es: e.target.value })}
              className="min-h-[120px]"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-2 text-sm font-body">
            <input type="checkbox" checked={editing.is_active} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} />
            Active
          </label>
          <label className="flex items-center gap-2 text-sm font-body">
            <input type="checkbox" checked={editing.is_recurring} onChange={(e) => setEditing({ ...editing, is_recurring: e.target.checked })} />
            Recurring
          </label>
          <label className="flex items-center gap-2 text-sm font-body">
            <input type="checkbox" checked={editing.requires_payment} onChange={(e) => setEditing({ ...editing, requires_payment: e.target.checked })} />
            Requires Payment
          </label>
        </div>

        {editing.requires_payment && (
          <div>
            <label className="font-body text-sm font-medium text-foreground mb-1.5 block">CompraClick payment link</label>
            <Input
              type="url"
              placeholder="https://checkout.baccredomatic.com/..."
              value={editing.payment_link || ""}
              onChange={(e) => setEditing({ ...editing, payment_link: e.target.value || null })}
            />
            <p className="text-xs text-muted-foreground mt-1 font-body">
              BAC link that charges this class's price. Used when a customer pays by card. If left blank, the Drop-in link is used as a fallback. Change the price? Generate a matching link.
            </p>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button onClick={handleSave}>Save</Button>
          <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl border border-border">
      <div className="p-5 border-b border-border flex items-center justify-between">
        <h3 className="font-heading text-lg font-medium text-foreground">Manage Events & Classes</h3>
        <Button variant="default" size="sm" onClick={() => setEditing({ ...emptyClass })}>
          <Plus className="h-4 w-4 mr-1" /> Add Event
        </Button>
      </div>
      <div className="divide-y divide-border">
        {classes.map((c) => (
          <div key={c.id} className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors">
            {c.image_url ? (
              <img src={c.image_url} alt="" className="w-16 h-12 rounded-lg object-cover shrink-0" />
            ) : (
              <div className="w-16 h-12 rounded-lg bg-muted shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-body text-sm font-medium text-foreground truncate">{c.title}</p>
              <p className="font-body text-xs text-muted-foreground">
                {c.category} · {c.duration_minutes}min · {c.max_capacity} max
                {c.instructor && ` · ${c.instructor}`}
              </p>
            </div>
            <span className={cn(
              "text-xs font-body font-semibold px-2.5 py-0.5 rounded-full",
              c.is_active ? "bg-spa-sage/15 text-spa-sage" : "bg-muted text-muted-foreground"
            )}>
              {c.is_active ? "Active" : "Inactive"}
            </span>
            <button
              onClick={() => { setScheduling(c); loadSchedules(c.id); }}
              className="p-2 hover:bg-muted rounded-lg"
              title="Manage schedule"
            >
              <CalendarPlus className="h-4 w-4 text-muted-foreground" />
            </button>
            <button onClick={() => setEditing(c)} className="p-2 hover:bg-muted rounded-lg" title="Edit">
              <Pencil className="h-4 w-4 text-muted-foreground" />
            </button>
            <button onClick={() => handleDelete(c.id)} className="p-2 hover:bg-destructive/10 rounded-lg" title="Delete">
              <Trash2 className="h-4 w-4 text-destructive" />
            </button>
          </div>
        ))}
        {classes.length === 0 && (
          <p className="p-8 text-center spa-body-sm">No events yet. Create your first event above.</p>
        )}
      </div>
    </div>
  );
}
