import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Palmtree } from "lucide-react";
import { toast } from "sonner";

interface Form {
  enabled: boolean;
  start_date: string;
  end_date: string;
  heading: string;
  message: string;
  whatsapp_number: string;
  hide_form: boolean;
}

const empty: Form = {
  enabled: false, start_date: "", end_date: "", heading: "", message: "", whatsapp_number: "", hide_form: true,
};

const todayCR = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica" }).format(new Date());

export function AdminVacationMode() {
  const { user } = useAuth();
  const [form, setForm] = useState<Form>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase.from("vacation_mode" as any) as any).select("*").eq("id", 1).maybeSingle();
    if (error) toast.error(error.message);
    if (data) {
      setForm({
        enabled: !!data.enabled,
        start_date: data.start_date ?? "",
        end_date: data.end_date ?? "",
        heading: data.heading ?? "",
        message: data.message ?? "",
        whatsapp_number: data.whatsapp_number ?? "",
        hide_form: data.hide_form ?? true,
      });
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (form.enabled && form.start_date && form.end_date && form.end_date < form.start_date) {
      toast.error("End date must be on or after the start date.");
      return;
    }
    setSaving(true);
    const { error } = await (supabase.from("vacation_mode" as any) as any).update({
      enabled: form.enabled,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      heading: form.heading.trim(),
      message: form.message,
      whatsapp_number: form.whatsapp_number.trim() || null,
      hide_form: form.hide_form,
      updated_at: new Date().toISOString(),
      updated_by: user?.id ?? null,
    }).eq("id", 1);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Vacation Mode saved");
  };

  // Mirror of the booking page's isActive logic so the admin sees live state.
  const today = todayCR();
  const isActive = form.enabled
    && (!form.start_date || today >= form.start_date)
    && (!form.end_date || today <= form.end_date);
  const scheduledFuture = form.enabled && form.start_date && today < form.start_date;

  if (loading) return <Skeleton className="h-96 rounded-2xl" />;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
          <Palmtree className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <h3 className="font-heading text-lg font-medium text-foreground">Vacation Mode</h3>
          <p className="font-body text-sm text-muted-foreground">
            Shows a notice on the booking page and pauses online bookings. Only affects the Book page.
          </p>
        </div>
      </div>

      {/* Live status */}
      <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="font-body text-sm font-medium text-foreground">Current status:</span>
          {isActive ? <Badge className="bg-spa-sage text-white">Active now</Badge>
            : scheduledFuture ? <Badge variant="secondary">Scheduled</Badge>
            : <Badge variant="outline">Off</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <Label className="font-body text-sm">Enable Vacation Mode</Label>
          <Switch checked={form.enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="font-body">Start date</Label>
          <Input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} className="min-w-0" />
        </div>
        <div className="space-y-1.5">
          <Label className="font-body">End date</Label>
          <Input type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} className="min-w-0" />
        </div>
      </div>
      <p className="font-body text-xs text-muted-foreground -mt-2">
        The booking form reactivates automatically after the end date passes (or when you turn this off).
      </p>

      <div className="space-y-1.5">
        <Label className="font-body">Heading</Label>
        <Input value={form.heading} onChange={(e) => setForm((f) => ({ ...f, heading: e.target.value }))} placeholder="We're Currently on Vacation" />
      </div>

      <div className="space-y-1.5">
        <Label className="font-body">Message</Label>
        <Textarea value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} rows={6} className="min-h-[140px]" />
        <p className="font-body text-xs text-muted-foreground">Line breaks are preserved. Mention your dates here for the customer.</p>
      </div>

      <div className="space-y-1.5">
        <Label className="font-body">WhatsApp number</Label>
        <Input value={form.whatsapp_number} onChange={(e) => setForm((f) => ({ ...f, whatsapp_number: e.target.value }))} placeholder="e.g. 50688146760 (leave blank to use the default)" />
        <p className="font-body text-xs text-muted-foreground">Digits only, with country code. Blank uses the spa's default WhatsApp.</p>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border p-3">
        <div>
          <Label className="font-body">Hide the booking form</Label>
          <p className="text-xs text-muted-foreground">On: the form is hidden and online bookings are blocked. Off: the form stays, with the notice above it.</p>
        </div>
        <Switch checked={form.hide_form} onCheckedChange={(v) => setForm((f) => ({ ...f, hide_form: v }))} />
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Vacation Mode"}</Button>
      </div>
    </div>
  );
}
