import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Ticket, Check, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useConfirm } from "@/hooks/useConfirm";

const sb = supabase as any;
const usd = (n: number) => `$${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Request {
  id: string; membership_name: string; price: number | null;
  class_title: string | null; guest_name: string; guest_email: string | null;
  guest_phone: string | null; status: string; created_at: string;
}

/**
 * People who picked her on the website and want a pass with her.
 *
 * Nothing has been charged — Holis does not take this money. This is the list of
 * who to expect and what they owe her, so a name asked for on the site does not
 * live only in an email she may miss.
 */
export function TeacherPassRequests({ teacherId }: { teacherId: string }) {
  const [items, setItems] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const { confirm, confirmDialog } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await sb.from("teacher_pass_requests").select("*")
      .eq("teacher_id", teacherId).order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setItems(((data ?? []) as Request[]));
    setLoading(false);
  }, [teacherId]);
  useEffect(() => { load(); }, [load]);

  const setStatus = async (r: Request, status: string) => {
    setItems((prev) => prev.map((x) => (x.id === r.id ? { ...x, status } : x)));
    const { error } = await sb.from("teacher_pass_requests").update({ status }).eq("id", r.id);
    if (error) {
      toast.error(error.message);
      setItems((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: r.status } : x)));
    }
  };

  const remove = async (r: Request) => {
    if (!(await confirm({
      title: `Remove ${r.guest_name} from the list?`,
      confirmLabel: "Remove", destructive: true,
    }))) return;
    const { error } = await sb.from("teacher_pass_requests").delete().eq("id", r.id);
    if (error) toast.error(error.message); else load();
  };

  const pending = useMemo(() => items.filter((i) => i.status === "pending"), [items]);

  if (loading) {
    return (
      <Card className="p-4 mb-4">
        <div className="py-6 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
      </Card>
    );
  }
  if (items.length === 0) return null;

  return (
    <Card className="p-4 mb-4">
      <h3 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-2">
        <Ticket className="h-4 w-4" /> Pass requests
        {pending.length > 0 && (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-500">
            {pending.length} waiting
          </span>
        )}
      </h3>
      <p className="font-body text-xs text-muted-foreground mb-3">
        People who picked you on the website. Nothing was charged — they pay you directly.
        Mark it done once they have.
      </p>

      <div className="space-y-2">
        {items.map((r) => (
          <div key={r.id} className={cn(
            "rounded-lg border border-border p-3 flex items-start justify-between gap-3",
            r.status !== "pending" && "opacity-60",
          )}>
            <div className="min-w-0">
              <p className="font-body text-sm font-medium text-foreground truncate">
                {r.guest_name}
                {r.status === "confirmed" && <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400">paid</span>}
                {r.status === "cancelled" && <span className="ml-2 text-xs text-muted-foreground">cancelled</span>}
              </p>
              <p className="font-body text-xs text-muted-foreground">
                {r.membership_name}
                {r.price != null && <> · {usd(Number(r.price))}</>}
                {r.class_title && <> · for {r.class_title}</>}
              </p>
              {r.guest_email && <p className="font-body text-xs text-muted-foreground truncate">{r.guest_email}</p>}
              {r.guest_phone && <p className="font-body text-xs text-muted-foreground">{r.guest_phone}</p>}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {r.status === "pending" && (
                <>
                  <Button size="sm" variant="outline" className="h-8" onClick={() => setStatus(r, "confirmed")}>
                    <Check className="h-3.5 w-3.5 mr-1" /> Paid
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" title="Not coming"
                    onClick={() => setStatus(r, "cancelled")}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove(r)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
      {confirmDialog}
    </Card>
  );
}
