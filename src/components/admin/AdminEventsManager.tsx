import { ImageFrameEditor } from "@/components/admin/ImageFrameEditor";
import { framed } from "@/lib/imageFrame";
import { fetchRequestClassIds, setClassOnRequest } from "@/lib/classRequests";
import { fetchClassVideos, setClassVideo } from "@/lib/classVideos";
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownTextarea } from "./MarkdownTextarea";
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
  /** Always paid in full: no pass, no membership, no coupon. */
  full_price_only: boolean;
  max_capacity: number;
  payment_link: string | null;
  price_label: string | null;
  featured_until: string | null;
  payment_instructions: string | null;
  payment_instructions_es: string | null;
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
  full_price_only: false,
  max_capacity: 15,
  payment_link: null,
  price_label: null,
  featured_until: null,
  payment_instructions: null,
  payment_instructions_es: null,
};

const eventCategories = ["Studio Classes", "Yoga", "Workshop", "Sound Bath", "Breathwork", "Meditation", "Fitness", "Retreat", "Special Event"];

export function AdminEventsManager() {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [editing, setEditing] = useState<ClassRow | (Omit<ClassRow, "id"> & { id?: string }) | null>(null);
  const [scheduling, setScheduling] = useState<ClassRow | null>(null);
  const [scheduleForm, setScheduleForm] = useState({ date: "", startTime: "09:00", endTime: "10:00" });
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [uploading, setUploading] = useState(false);
  // Attendees per schedule id (loaded on demand from class_bookings).
  const [attendees, setAttendees] = useState<Record<string, { guest_name: string | null; guest_email: string | null; status: string }[]>>({});
  const [openAttendees, setOpenAttendees] = useState<string | null>(null);

  const loadAttendees = async (scheduleId: string) => {
    if (openAttendees === scheduleId) { setOpenAttendees(null); return; }
    const { data } = await supabase
      .from("class_bookings")
      .select("guest_name, guest_email, status")
      .eq("schedule_id", scheduleId)
      .order("created_at");
    setAttendees((prev) => ({ ...prev, [scheduleId]: (data as any[]) ?? [] }));
    setOpenAttendees(scheduleId);
  };

  const [upcoming, setUpcoming] = useState<Record<string, number>>({});
  // Special events offered "on request" (on the Classes page without a date).
  const [requestIds, setRequestIds] = useState<string[]>([]);
  const [onRequest, setOnRequest] = useState(false);
  // Event video ("Watch video" on the Classes page), kept in site_content.
  const [videoMap, setVideoMap] = useState<Record<string, string>>({});
  const [videoUrl, setVideoUrl] = useState("");
  const [videoUploading, setVideoUploading] = useState(false);

  const load = useCallback(async () => {
    // Also count the sessions ahead: an active class with none is invisible on
    // the website, because the site lists what is on the schedule.
    const [{ data }, { data: sessions }, onRequestIds, videos] = await Promise.all([
      supabase.from("classes").select("*").order("title"),
      supabase.from("class_schedule").select("class_id").eq("is_cancelled", false).gte("start_time", new Date().toISOString()),
      fetchRequestClassIds(),
      fetchClassVideos(),
    ]);
    setRequestIds(onRequestIds);
    setVideoMap(videos);
    setClasses((data as unknown as ClassRow[]) ?? []);
    const counts: Record<string, number> = {};
    for (const s of ((sessions as any[]) ?? [])) counts[s.class_id] = (counts[s.class_id] ?? 0) + 1;
    setUpcoming(counts);
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
      full_price_only: editing.full_price_only,
      max_capacity: editing.max_capacity,
      payment_link: (editing.payment_link || "").trim() || null,
      price_label: (editing.price_label || "").trim() || null,
      // Store the "featured until" date as end-of-day Costa Rica time.
      featured_until: (editing.featured_until || "").trim()
        ? `${(editing.featured_until as string).slice(0, 10)}T23:59:59-06:00`
        : null,
      payment_instructions: (editing.payment_instructions || "").trim() || null,
      payment_instructions_es: (editing.payment_instructions_es || "").trim() || null,
    };

    let savedId: string | null = null;
    if ("id" in editing && editing.id) {
      const { error } = await supabase.from("classes").update(payload as any).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
      savedId = editing.id;
      toast.success("Event updated");
    } else {
      const { data: created, error } = await supabase.from("classes").insert(payload as any).select("id").single();
      if (error) { toast.error(error.message); return; }
      savedId = (created as any)?.id ?? null;
      toast.success("Event created");
    }
    if (savedId && onRequest !== requestIds.includes(savedId)) {
      const err = await setClassOnRequest(savedId, onRequest);
      if (err) toast.error(`"On request" was not saved: ${err}`);
    }
    if (savedId && (videoMap[savedId] || "") !== videoUrl.trim()) {
      const err = await setClassVideo(savedId, videoUrl.trim() || null);
      if (err) toast.error(`The video was not saved: ${err}`);
    }
    setEditing(null);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this event and all its scheduled sessions?")) return;
    await supabase.from("class_schedule").delete().eq("class_id", id);
    const { error } = await supabase.from("classes").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    if (requestIds.includes(id)) await setClassOnRequest(id, false);
    if (videoMap[id]) await setClassVideo(id, null);
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

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      toast.error("This video is over 50 MB. Please use a shorter or smaller version (under 1 minute is ideal).");
      return;
    }
    setVideoUploading(true);
    const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
    const path = `videos/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("class-images").upload(path, file, { contentType: file.type || undefined });
    if (error) { toast.error(error.message); setVideoUploading(false); return; }
    const { data: urlData } = supabase.storage.from("class-images").getPublicUrl(path);
    setVideoUrl(urlData.publicUrl);
    setVideoUploading(false);
    toast.success("Video uploaded — click Save to publish it");
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
          {schedules.map((s) => {
            const booked = Math.max(0, (scheduling.max_capacity ?? 0) - s.spots_remaining);
            return (
            <div key={s.id} className="py-3">
              <div className="flex items-center justify-between">
                <div className="font-body text-sm">
                  <span className="font-medium text-foreground">{format(new Date(s.start_time), "EEE, MMM d")}</span>
                  <span className="text-muted-foreground"> · {format(new Date(s.start_time), "h:mm a")} – {format(new Date(s.end_time), "h:mm a")}</span>
                  <span className="text-muted-foreground"> · {booked} signed up / {scheduling.max_capacity} · {s.spots_remaining} left</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => loadAttendees(s.id)}>
                    {openAttendees === s.id ? "Hide signups" : `View signups${booked ? ` (${booked})` : ""}`}
                  </Button>
                  {s.is_cancelled ? (
                    <span className="text-xs font-body font-semibold text-destructive">Cancelled</span>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => handleCancelSchedule(s.id)}>Cancel</Button>
                  )}
                </div>
              </div>
              {openAttendees === s.id && (
                <div className="mt-2 ml-1 rounded-lg bg-muted/40 p-3">
                  {(attendees[s.id] ?? []).length === 0 ? (
                    <p className="font-body text-xs text-muted-foreground">No signups yet.</p>
                  ) : (
                    <ul className="space-y-1">
                      {(attendees[s.id] ?? []).map((a, i) => (
                        <li key={i} className="font-body text-xs text-foreground flex flex-wrap gap-x-2">
                          <span className="font-medium">{a.guest_name || "Guest"}</span>
                          <span className="text-muted-foreground">{a.guest_email}</span>
                          <span className="text-muted-foreground/70">· {a.status}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            );
          })}
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
          {/* Move and zoom the photo in its frame — every page that shows it follows. */}
          {editing.image_url && (
            <div className="mb-2">
              <ImageFrameEditor url={editing.image_url} onChange={(url) => setEditing({ ...editing, image_url: url })} />
            </div>
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

        <div>
          <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Event video (optional)</label>
          <p className="font-body text-xs text-muted-foreground mb-2">
            Adds a “Watch video” button on the Classes page; the photo stays. MP4 plays on every phone and computer (iPhone .mov may not play on Android). Under 1 minute and 50 MB.
          </p>
          {videoUrl && (
            <video src={videoUrl} controls playsInline preload="metadata" className="mb-2 w-full max-w-sm rounded-lg bg-black" />
          )}
          <div className="flex flex-wrap gap-2 items-center">
            <label className="inline-flex items-center gap-2 px-4 py-2 bg-muted rounded-lg cursor-pointer text-sm font-body font-medium text-foreground hover:bg-muted/70 transition-colors">
              <Upload className="h-4 w-4" />
              {videoUploading ? "Uploading..." : "Upload Video"}
              <input type="file" accept="video/mp4,video/quicktime,video/webm,video/*" onChange={handleVideoUpload} disabled={videoUploading} className="hidden" />
            </label>
            <Input
              placeholder="…or paste a video URL (.mp4)"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              className="flex-1 min-w-[240px]"
            />
            {videoUrl && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setVideoUrl("")}>Remove video</Button>
            )}
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
            <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Price ($ USD)</label>
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
            <MarkdownTextarea
              value={editing.description || ""}
              onChange={(v) => setEditing({ ...editing, description: v })}
              className="min-h-[120px]"
            />
          </div>
          <div>
            <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Description (ES)</label>
            <MarkdownTextarea
              value={editing.description_es || ""}
              onChange={(v) => setEditing({ ...editing, description_es: v })}
              className="min-h-[120px]"
            />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground -mt-2">
          Select a word and click <span className="font-medium">Link</span> to name it — or just paste a URL and it becomes a link.
        </p>

        {/* Featured + pay-to-teacher (for one-off special events) */}
        <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-4">
          <p className="font-heading text-sm font-medium text-foreground">Special event options</p>
          <label className="flex items-start gap-2 rounded-lg border border-border bg-background p-3 cursor-pointer">
            <input type="checkbox" className="mt-1" checked={onRequest} onChange={(e) => setOnRequest(e.target.checked)} />
            <span>
              <span className="font-body text-sm font-medium text-foreground block">On request (no date needed)</span>
              <span className="font-body text-xs text-muted-foreground block">
                Shows this event on the Classes page under Workshops &amp; Special Events with a “Request” button, also when it has no date on the schedule. Guests send a request and Holis gets it by email to arrange the date. When you add a date, it is booked as usual.
              </span>
            </span>
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Custom price label</label>
              <Input
                placeholder="e.g. Free / By donation — leave blank to show the $ price"
                value={editing.price_label || ""}
                onChange={(e) => setEditing({ ...editing, price_label: e.target.value || null })}
              />
              <p className="text-xs text-muted-foreground mt-1 font-body">Shown instead of the USD price (banner, card, booking).</p>
            </div>
            <div>
              <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Feature on the web until</label>
              <Input
                type="date"
                value={(editing.featured_until || "").slice(0, 10)}
                onChange={(e) => setEditing({ ...editing, featured_until: e.target.value || null })}
              />
              <p className="text-xs text-muted-foreground mt-1 font-body">Shows a highlight banner on Home + Classes until this date. Blank = not featured.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Pay-to-teacher instructions (EN)</label>
              <Textarea
                placeholder="e.g. Pay directly to the teacher via PayPal / SINPE. Send your receipt to confirm."
                value={editing.payment_instructions || ""}
                onChange={(e) => setEditing({ ...editing, payment_instructions: e.target.value || null })}
                className="min-h-[80px]"
              />
            </div>
            <div>
              <label className="font-body text-sm font-medium text-foreground mb-1.5 block">Pay-to-teacher instructions (ES)</label>
              <Textarea
                value={editing.payment_instructions_es || ""}
                onChange={(e) => setEditing({ ...editing, payment_instructions_es: e.target.value || null })}
                className="min-h-[80px]"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground font-body">
            If set, the event books without online payment and this appears on the booking page and in the confirmation email as a “How to pay” note. Leave “Requires Payment” unchecked for these.
          </p>
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

        {/* Wellness Sunday is sold at its own price: no pass, membership or
            coupon may be spent on it. Any class can be set the same way. */}
        <label className="flex items-start gap-2 text-sm font-body rounded-lg border border-border p-3">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={!!editing.full_price_only}
            onChange={(e) => setEditing({ ...editing, full_price_only: e.target.checked })}
          />
          <span>
            Always paid in full
            <span className="block text-xs text-muted-foreground">
              Memberships, class passes and coupons cannot be used for this class.
            </span>
          </span>
        </label>

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

  // Active but with nothing ahead on the calendar: the website only lists what
  // is scheduled, so these are switched on and still invisible.
  // On-request events show on the website without a date, so they are not missing anything.
  const unscheduled = classes.filter((c) => c.is_active && (upcoming[c.id] ?? 0) === 0 && !requestIds.includes(c.id));

  return (
    <div className="bg-card rounded-2xl border border-border">
      <div className="p-5 border-b border-border flex items-center justify-between">
        <h3 className="font-heading text-lg font-medium text-foreground">Manage Events & Classes</h3>
        <Button variant="default" size="sm" onClick={() => { setEditing({ ...emptyClass }); setOnRequest(false); setVideoUrl(""); }}>
          <Plus className="h-4 w-4 mr-1" /> Add Event
        </Button>
      </div>
      {unscheduled.length > 0 && (
        <div className="px-5 py-3 bg-amber-500/10 border-b border-amber-500/30 flex items-start gap-2 text-sm">
          <CalendarPlus className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
          <p className="font-body text-amber-800">
            <strong>{unscheduled.length} active {unscheduled.length === 1 ? "class has" : "classes have"} no dates ahead</strong>, so {unscheduled.length === 1 ? "it does" : "they do"} not appear on the website: {unscheduled.map((c) => c.title).join(", ")}. Use the calendar button to add dates.
          </p>
        </div>
      )}
      <div className="divide-y divide-border">
        {classes.map((c) => (
          <div key={c.id} className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors">
            {c.image_url ? (
              <span className="w-16 h-12 rounded-lg overflow-hidden shrink-0"><img {...framed(c.image_url)} alt="" className="w-full h-full object-cover" /></span>
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
            {c.is_active && ((upcoming[c.id] ?? 0) > 0 ? (
              <span className="text-xs font-body px-2.5 py-0.5 rounded-full bg-muted text-muted-foreground whitespace-nowrap">
                {upcoming[c.id]} on the schedule
              </span>
            ) : requestIds.includes(c.id) ? (
              <span
                title="Shown on the Classes page with a Request button"
                className="text-xs font-body font-semibold px-2.5 py-0.5 rounded-full bg-spa-sage/15 text-spa-sage whitespace-nowrap"
              >
                On request
              </span>
            ) : (
              <span
                title="Add dates with the calendar button so it shows on the website"
                className="text-xs font-body font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700 whitespace-nowrap"
              >
                Not on the schedule
              </span>
            ))}
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
            <button onClick={() => { setEditing(c); setOnRequest(requestIds.includes(c.id)); setVideoUrl(videoMap[c.id] || ""); }} className="p-2 hover:bg-muted rounded-lg" title="Edit">
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
