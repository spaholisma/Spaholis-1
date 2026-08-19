import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Gift, Sparkles } from "lucide-react";

type Progress = {
  offering_id: string;
  offering_name: string;
  threshold: number;
  purchases: number;
  toward_next: number;
  remaining: number;
  pending_rewards: number;
  reward_label: string;
};

/**
 * Member-facing loyalty message: shows progress toward — and celebration of —
 * the free reward earned by renewing a membership/pass N times. Keyed by the
 * customer's email (matches how offerings are recorded). Renders nothing when
 * the customer has no qualifying purchases.
 */
export function LoyaltyRewardCard({ email, className }: { email?: string | null; className?: string }) {
  const { data } = useQuery({
    queryKey: ["loyalty-progress", (email || "").toLowerCase()],
    queryFn: async () => {
      if (!email) return [] as Progress[];
      const { data, error } = await supabase.rpc("get_loyalty_progress" as any, { _email: email });
      if (error) throw error;
      return (data ?? []) as Progress[];
    },
    enabled: !!email,
  });

  const rows = data ?? [];
  if (rows.length === 0) return null;

  const earned = rows.filter((r) => r.pending_rewards > 0);
  const inProgress = rows.filter((r) => r.pending_rewards === 0);

  return (
    <div className={className}>
      {earned.length > 0 && (
        <div className="rounded-2xl border border-spa-sage/40 bg-spa-sage/10 p-4 mb-3">
          <p className="font-heading text-base font-semibold text-foreground flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-spa-sage" /> You've earned {earned[0].reward_label}!
          </p>
          <p className="font-body text-sm text-muted-foreground mt-1">
            Thank you for being a loyal member{earned.reduce((n, r) => n + r.pending_rewards, 0) > 1 ? ` — you have ${earned.reduce((n, r) => n + r.pending_rewards, 0)} rewards waiting` : ""}. Our team will reach out to book your treatment, or just mention it on your next visit.
          </p>
        </div>
      )}
      {inProgress.map((r) => {
        const pct = Math.round((r.toward_next / r.threshold) * 100);
        return (
          <div key={r.offering_id} className="rounded-2xl border border-border bg-card p-4 mb-3 last:mb-0">
            <p className="font-body text-sm font-medium text-foreground flex items-center gap-2">
              <Gift className="h-4 w-4 text-spa-sage" />
              Renew {r.remaining} more time{r.remaining === 1 ? "" : "s"} to earn {r.reward_label}
            </p>
            <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-spa-sage rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="font-body text-xs text-muted-foreground mt-1.5">
              {r.offering_name}: {r.toward_next} of {r.threshold} renewals
            </p>
          </div>
        );
      })}
    </div>
  );
}
