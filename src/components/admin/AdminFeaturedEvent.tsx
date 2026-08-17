import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, CalendarPlus } from "lucide-react";
import { ImageUploadField } from "./ImageUploadField";
import { MarkdownTextarea } from "./MarkdownTextarea";
import { toast } from "sonner";

const CATEGORIES = ["Special Event", "Workshop", "Sound Bath", "Breathwork", "Meditation", "Yoga", "Fitness"];
const todayISO = () => new Date().toISOString().split("T")[0];

/**
 * One-shot creator for a featured one-off event (like the Chakradance banner):
 * makes a `classes` row (featured_until = event day) + one `class_schedule`
 * session, so it shows on the homepage banner and the Classes page and
 * auto-hides after the date.
 */
export function AdminFeaturedEvent() {
  const [form, setForm] = useState({
    title: "",
    instructor: "",
    description: "",
    image: "",
    date: todayISO(),
    startTime: "16:30",
    duration: 90,
    pricing: "fixed" as "fixed" | "free" | "donation",
    price: 0,
    priceLabel: "",
    info: "",
    category: "Special Event",
    capacity: 20,
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const create = async () => {
    if (!form.title.trim()) { toast.error("Give the event a title"); return; }
    if (!form.date || !form.startTime) { toast.error("Pick a date and start time"); return; }
    setSaving(true);
    try {
      const start = new Date(`${form.date}T${form.startTime}:00`);
      const end = new Date(start.getTime() + (Number(form.duration) || 60) * 60000);
      const pad = (n: number) => String(n).padStart(2, "0");
      const local = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;

      // 1) Create the featured class (featured until end of the event day, CR time).
      const priceValue = form.pricing === "fixed" ? (Number(form.price) || 0) : 0;
      const priceLabel =
        form.pricing === "free" ? "Free"
        : form.pricing === "donation" ? (form.priceLabel.trim() || "By donation")
        : (form.priceLabel.trim() || null);

      const { data: cls, error: clsErr } = await supabase
        .from("classes")
        .insert({
          title: form.title.trim(),
          description: form.description.trim() || null,
          category: form.category,
          duration_minutes: Number(form.duration) || 60,
          price: priceValue,
          price_label: priceLabel,
          image_url: form.image || null,
          location: "Holis Studio",
          instructor: form.instructor.trim() || null,
          is_active: true,
          is_recurring: false,
          requires_payment: false,
          max_capacity: Number(form.capacity) || 20,
          featured_until: `${form.date}T23:59:59-06:00`,
          payment_instructions: form.info.trim() || null,
        } as any)
        .select("id")
        .single();
      if (clsErr) throw clsErr;

      // 2) Schedule the single session.
      const { error: schErr } = await supabase.from("class_schedule").insert({
        class_id: (cls as any).id,
        start_time: local(start),
        end_time: local(end),
        spots_remaining: Number(form.capacity) || 20,
      } as any);
      if (schErr) throw schErr;

      toast.success("Featured event created — it now shows on the homepage and Classes page.");
      setForm((f) => ({ ...f, title: "", instructor: "", description: "", image: "", priceLabel: "", price: 0 }));
    } catch (e: any) {
      toast.error(e?.message || "Could not create the event");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="h-5 w-5 text-spa-sage" />
          <h3 className="font-heading text-xl text-foreground">Add a featured event</h3>
        </div>
        <p className="font-body text-sm text-muted-foreground">
          Create a one-off highlighted event (like Chakradance). It appears as the banner on the homepage and at the top
          of the Classes page, and hides automatically after its date. Manage or reschedule it later under <span className="font-medium">Classes</span>.
        </p>
      </div>

      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="font-body text-sm">Event title *</Label>
            <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Chakradance™ with Petra Era" maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label className="font-body text-sm">Instructor / host</Label>
            <Input value={form.instructor} onChange={(e) => set("instructor", e.target.value)} placeholder="Petra Era" maxLength={120} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="font-body text-sm">Description</Label>
          <MarkdownTextarea value={form.description} onChange={(v) => set("description", v)} placeholder="What the event is about…" className="min-h-[90px]" />
          <p className="text-[11px] text-muted-foreground">
            Select a word and click <span className="font-medium">Link</span> to name it — or just paste a URL and it becomes a link.
          </p>
        </div>

        <ImageUploadField fieldId="featured-event-image" label="Flyer / image" value={form.image} onChange={(v) => set("image", v)} />

        <div className="grid sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="font-body text-sm">Date *</Label>
            <Input type="date" value={form.date} min={todayISO()} onChange={(e) => set("date", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="font-body text-sm">Start time *</Label>
            <Input type="time" value={form.startTime} onChange={(e) => set("startTime", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="font-body text-sm">Duration (min)</Label>
            <Input type="number" min={15} step={15} value={form.duration} onChange={(e) => set("duration", parseInt(e.target.value) || 0)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="font-body text-sm">Pricing</Label>
          <div className="flex flex-wrap gap-2">
            {([["fixed", "Fixed price"], ["free", "Free"], ["donation", "Donation based"]] as const).map(([v, l]) => (
              <button
                key={v}
                type="button"
                onClick={() => set("pricing", v)}
                className={`px-3.5 py-1.5 rounded-full text-sm font-body border transition-colors ${form.pricing === v ? "bg-foreground text-background border-foreground" : "bg-muted text-muted-foreground border-border hover:border-foreground/40"}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          {form.pricing === "fixed" && (
            <div className="space-y-1.5">
              <Label className="font-body text-sm">Price ($ USD)</Label>
              <Input type="number" min={0} value={form.price} onChange={(e) => set("price", parseFloat(e.target.value) || 0)} />
            </div>
          )}
          {form.pricing !== "free" && (
            <div className="space-y-1.5">
              <Label className="font-body text-sm">Price label <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                value={form.priceLabel}
                onChange={(e) => set("priceLabel", e.target.value)}
                placeholder={form.pricing === "donation" ? "By donation" : "$25"}
                maxLength={40}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="font-body text-sm">Capacity</Label>
            <Input type="number" min={1} value={form.capacity} onChange={(e) => set("capacity", parseInt(e.target.value) || 0)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="font-body text-sm">
            Info note <span className="text-muted-foreground">(optional — how to pay or contribute; great for donation-based events)</span>
          </Label>
          <MarkdownTextarea
            value={form.info}
            onChange={(v) => set("info", v)}
            placeholder={form.pricing === "donation"
              ? "This is a donation-based event — contribute what feels right. Cash at the studio or SINPE to 8814 6760. All are welcome."
              : "Any extra details guests should know…"}
            className="min-h-[80px]"
          />
          <p className="text-[11px] text-muted-foreground">
            Links supported (shown on the booking page). Select text + <span className="font-medium">Link</span>, or paste a URL.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="font-body text-sm">Category</Label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => set("category", c)}
                className={`px-3 py-1.5 rounded-full text-sm font-body border transition-colors ${form.category === c ? "bg-foreground text-background border-foreground" : "bg-muted text-muted-foreground border-border hover:border-foreground/40"}`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <Button variant="spa" size="lg" className="w-full" disabled={saving} onClick={create}>
          <CalendarPlus className="h-4 w-4 mr-2" />
          {saving ? "Creating…" : "Create featured event"}
        </Button>
      </div>
    </div>
  );
}
