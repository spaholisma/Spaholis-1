import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CalendarOff, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { datesBetween, spaDateKey, type ClassClosure } from "@/lib/classClosures";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  closures: ClassClosure[];
  onChanged: () => void;
}

const longDate = (key: string) =>
  new Date(`${key}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

/**
 * Closed days for classes. Pick a single day or a range; each day becomes its
 * own row, so one can be reopened without touching the rest.
 */
export function ClassClosuresDialog({ open, onOpenChange, closures, onChanged }: Props) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const today = spaDateKey(new Date());
  const upcoming = closures.filter((c) => c.closed_date >= today);
  const past = closures.length - upcoming.length;

  const add = async () => {
    if (!from) { toast.error("Choose the first closed day."); return; }
    const last = to || from;
    if (last < from) { toast.error("The last day must be on or after the first."); return; }
    const days = datesBetween(from, last);
    if (days.length > 366) { toast.error("Choose at most a year at a time."); return; }

    setSaving(true);
    try {
      // Sessions already on those days stay in the calendar, but the website
      // hides them and nobody can book them. Say so before it surprises anyone.
      const startISO = new Date(`${from}T00:00:00-06:00`).toISOString();
      const endISO = new Date(new Date(`${last}T00:00:00-06:00`).getTime() + 86_400_000).toISOString();
      const { data: sessions } = await supabase
        .from("class_schedule")
        .select("id")
        .gte("start_time", startISO)
        .lt("start_time", endISO)
        .eq("is_cancelled", false);
      const ids = ((sessions as { id: string }[]) ?? []).map((s) => s.id);
      let booked = 0;
      if (ids.length) {
        const { count } = await supabase
          .from("class_bookings")
          .select("id", { count: "exact", head: true })
          .in("schedule_id", ids)
          .not("status", "in", "(cancelled,payment_failed)");
        booked = count ?? 0;
      }
      if (ids.length && !confirm(
        `${ids.length} class session(s) are already scheduled on these days` +
        (booked ? `, with ${booked} booking(s)` : "") +
        ". They will be hidden from the website and cannot be booked, but they stay in the calendar. " +
        "Cancel them from the calendar if you want the students told. Close these days anyway?",
      )) { setSaving(false); return; }

      const rows = days.map((d) => ({ closed_date: d, reason: reason.trim() || null }));
      const { error } = await (supabase.from("class_closures" as any) as any)
        .upsert(rows, { onConflict: "closed_date", ignoreDuplicates: true });
      if (error) throw error;
      toast.success(days.length === 1 ? `Closed ${longDate(from)}` : `Closed ${days.length} days`);
      setFrom(""); setTo(""); setReason("");
      onChanged();
    } catch (e: any) {
      toast.error(e.message ?? "Could not save the closed days");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c: ClassClosure) => {
    setRemoving(c.id);
    const { error } = await (supabase.from("class_closures" as any) as any).delete().eq("id", c.id);
    setRemoving(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`${longDate(c.closed_date)} is open again`);
    onChanged();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading">
            <CalendarOff className="h-4 w-4" /> Closed days for classes
          </DialogTitle>
          <DialogDescription>
            On these days nobody can book or join a class, and no session can be scheduled. Treatments are not affected.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border p-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">First day *</Label>
              <Input type="date" min={today} value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Last day <span className="text-muted-foreground">(optional)</span></Label>
              <Input type="date" min={from || today} value={to} onChange={(e) => setTo(e.target.value)} className="h-9 text-sm" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Reason <span className="text-muted-foreground">(optional, for the team)</span></Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Studio closed for October" className="h-9 text-sm" />
          </div>
          <Button size="sm" onClick={add} disabled={saving || !from} className="w-full">
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {to && to !== from ? "Close these days" : "Close this day"}
          </Button>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Upcoming closed days ({upcoming.length})
          </p>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">No closed days — every day is open for classes.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {upcoming.map((c) => (
                <li key={c.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{longDate(c.closed_date)}</p>
                    {c.reason && <p className="text-xs text-muted-foreground truncate">{c.reason}</p>}
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => remove(c)}
                    disabled={removing === c.id}
                    title="Open this day again"
                  >
                    {removing === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {past > 0 && <p className="text-[11px] text-muted-foreground">{past} past closed day(s) not shown.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
