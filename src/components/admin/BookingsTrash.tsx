import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { RotateCcw, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface TrashRow {
  id: string;
  booking: any;
  deleted_at: string;
}

export function BookingsTrash() {
  const [rows, setRows] = useState<TrashRow[]>([]);
  const [services, setServices] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    // Drop anything past 30 days, then read what's left.
    await supabase.rpc("purge_deleted_bookings" as any).then(() => {}, () => {});
    const [{ data: trash }, { data: svc }] = await Promise.all([
      supabase.from("deleted_bookings" as any).select("id, booking, deleted_at").order("deleted_at", { ascending: false }),
      supabase.from("services").select("id, title"),
    ]);
    setServices(Object.fromEntries(((svc as any[]) ?? []).map((s) => [s.id, s.title])));
    setRows(((trash as any[]) ?? []) as TrashRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const restore = async (id: string) => {
    setRestoring(id);
    const { error } = await supabase.rpc("restore_booking" as any, { _id: id });
    setRestoring(null);
    if (error) { toast.error(error.message || "Could not restore"); return; }
    toast.success("Booking restored");
    load();
  };

  const daysLeft = (deletedAt: string) => {
    const ms = new Date(deletedAt).getTime() + 30 * 24 * 60 * 60 * 1000 - Date.now();
    return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-heading font-bold text-foreground flex items-center gap-2">
          <Trash2 className="h-5 w-5" /> Trash
        </h2>
        <p className="text-sm text-muted-foreground">Deleted bookings are kept for 30 days, then permanently removed. Restore one anytime before that.</p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : rows.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-8 text-center text-muted-foreground">
          <p className="text-sm">Trash is empty.</p>
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  {["Guest", "Service", "Date", "Deleted", "Expires in", ""].map((h) => (
                    <th key={h} className="text-left px-5 py-3 font-body text-xs font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => {
                  const b = r.booking || {};
                  return (
                    <tr key={r.id} className="hover:bg-muted/30">
                      <td className="px-5 py-4 font-body text-sm font-medium text-foreground">{b.guest_name || "—"}</td>
                      <td className="px-5 py-4 font-body text-sm text-muted-foreground">{b.title || services[b.service_id] || "—"}</td>
                      <td className="px-5 py-4 font-body text-sm text-muted-foreground">{b.booking_date}{b.booking_time ? ` · ${String(b.booking_time).slice(0, 5)}` : ""}</td>
                      <td className="px-5 py-4 font-body text-xs text-muted-foreground">{format(new Date(r.deleted_at), "MMM d, h:mm a")}</td>
                      <td className="px-5 py-4 font-body text-xs">
                        <span className={daysLeft(r.deleted_at) <= 3 ? "text-destructive font-semibold" : "text-muted-foreground"}>{daysLeft(r.deleted_at)} days</span>
                      </td>
                      <td className="px-5 py-4">
                        <Button variant="outline" size="sm" className="gap-1.5 h-8" disabled={restoring === r.id} onClick={() => restore(r.id)}>
                          {restoring === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Restore
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
