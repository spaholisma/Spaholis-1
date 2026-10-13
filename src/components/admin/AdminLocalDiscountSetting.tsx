import { useEffect, useState } from "react";
import { BadgeCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clampPct } from "@/lib/localDiscount";

const sb = supabase as any;

/**
 * The studio's local discount for a Costa Rican cédula — one setting for all
 * classes, drop-ins, passes and private classes paid online. 0 switches it off.
 * (It used to be set per teacher; Holis runs it now.)
 */
export function AdminLocalDiscountSetting() {
  const [pct, setPct] = useState<string>("");
  const [saved, setSaved] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    sb.from("studio_pricing").select("local_discount_pct").eq("id", 1).maybeSingle()
      .then(({ data }: { data: { local_discount_pct: number } | null }) => {
        const v = Number(data?.local_discount_pct ?? 0);
        setSaved(v); setPct(String(v));
      });
  }, []);

  const save = async () => {
    const v = clampPct(Number(pct));
    setSaving(true);
    const { error } = await sb.from("studio_pricing")
      .update({ local_discount_pct: v, updated_at: new Date().toISOString() }).eq("id", 1);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setSaved(v); setPct(String(v));
    toast.success(v > 0 ? `Local discount: ${v}% with a Costa Rican cédula` : "Local discount switched off");
  };

  return (
    <div className="mb-6 rounded-2xl border border-spa-sage/30 bg-spa-sage/10 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-spa-sage" />
          <div className="min-w-0">
            <h3 className="font-heading text-base font-medium text-foreground">Local discount — Costa Rican cédula</h3>
            <p className="mt-0.5 font-body text-xs text-muted-foreground">
              Taken off classes, drop-ins, passes and private classes when a guest pays online with a valid
              Costa Rican cédula. A coupon never adds to it. 0 = no local discount.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Input
              type="number" min={0} max={100} step={1} value={pct} disabled={saved === null}
              onChange={(e) => setPct(e.target.value)} className="w-24 pr-7" aria-label="Local discount (%)"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-body text-sm text-muted-foreground">%</span>
          </div>
          <Button size="sm" onClick={save} disabled={saving || saved === null || Number(pct) === saved}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
