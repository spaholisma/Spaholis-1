import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Check, Infinity as InfinityIcon } from "lucide-react";
import { HolisPassCheckout } from "@/components/payments/HolisCheckout";
import { cn } from "@/lib/utils";
import { DropInDialog } from "@/components/DropInDialog";

const sb = supabase as any;
const usd = (n: number) =>
  `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

interface Offering {
  id: string; name: string; description: string | null; type: string;
  price: number; credits: number | null; duration_days: number | null; is_unlimited: boolean;
}
export interface ClassOption {
  class_id: string; title: string; teacher: string; when: string;
}

/**
 * The studio's passes and memberships, and the way to buy one.
 *
 * Every pass is Holis Wellness Center's (2026-10: the teachers chose not to
 * run their own): pick it and pay online — PayPal or a card, to Holis — with
 * the studio's local discount or a Holis coupon. The pass code and booking
 * link arrive by email; the pass works on every weekly class. A Drop-in is
 * one class on one date, so it opens the dates instead.
 */
export function PassChooser({
  compact = false, forClass, only,
}: {
  compact?: boolean;
  /** Show only these kinds of pass (offerings.type), e.g. ["drop_in"]. */
  only?: string[];
  /** Set when the chooser sits on a class page: the Drop-in opens on that class. */
  forClass?: ClassOption;
}) {
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<Offering | null>(null);
  const [paidEmail, setPaidEmail] = useState<string | null>(null);
  // A drop-in is one class on one date: it has its own window.
  const [dropIn, setDropIn] = useState<Offering | null>(null);

  useEffect(() => {
    (async () => {
      const { data: off } = await sb.from("offerings")
        .select("id, name, description, type, price, credits, duration_days, is_unlimited")
        .eq("status", "active").order("sort_order");
      setOfferings(((off ?? []) as Offering[]).filter((o) => !only || only.includes(o.type)));
      setLoading(false);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (o: Offering) => {
    if (o.type === "drop_in") { setDropIn(o); return; }
    setPaidEmail(null);
    setPicked(o);
  };

  if (loading) {
    return (
      <div className="py-16 text-center">
        <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <div className={cn("grid gap-5", !compact && "md:grid-cols-2 lg:grid-cols-4")}>
        {offerings.map((o, i) => (
          <motion.div
            key={o.id}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: Math.min(i * 0.06, 0.3), ease: "easeOut" }}
          >
            <Card className={cn("flex h-full flex-col", compact ? "p-4" : "p-5")}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-heading text-lg font-medium text-foreground">{o.name}</h3>
                {o.is_unlimited && (
                  <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground whitespace-nowrap">
                    <InfinityIcon className="h-3 w-3 inline mr-1" />Unlimited
                  </span>
                )}
              </div>
              {o.description && <p className="spa-body-sm mt-2">{o.description}</p>}
              <ul className="mt-3 space-y-1 font-body text-sm text-muted-foreground">
                <li><Check className="h-3.5 w-3.5 inline mr-1.5 text-spa-sage" />
                  {o.is_unlimited ? "Unlimited classes" : `${o.credits ?? 1} class${(o.credits ?? 1) === 1 ? "" : "es"}`}
                </li>
                {o.duration_days && (
                  <li><Check className="h-3.5 w-3.5 inline mr-1.5 text-spa-sage" />Valid for {o.duration_days} days</li>
                )}
              </ul>
              <div className="mt-auto pt-4 flex items-end justify-between gap-3">
                <p className="font-heading text-2xl font-semibold text-foreground leading-none">{usd(o.price)}</p>
                <Button size="sm" className="rounded-full" onClick={() => open(o)}>Get this pass</Button>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      <Dialog open={!!picked} onOpenChange={(o) => !o && setPicked(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {paidEmail ? "Your pass is ready" : picked?.name}
            </DialogTitle>
          </DialogHeader>

          {picked && !paidEmail && (
            <div className="space-y-4">
              <div className="rounded-xl border border-spa-sage/40 bg-spa-sage/5 p-4">
                <p className="font-body text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Holis Wellness Center
                </p>
                <p className="font-heading text-lg font-medium text-foreground">{picked.name}</p>
                <p className="font-body text-xs text-muted-foreground">
                  {picked.is_unlimited ? "Unlimited classes" : `${picked.credits ?? 1} class${(picked.credits ?? 1) === 1 ? "" : "es"}`}
                  {picked.duration_days ? ` · valid for ${picked.duration_days} days` : ""} · any weekly class
                </p>
                <p className="font-heading text-2xl font-semibold text-foreground mt-2">{usd(picked.price)}</p>
              </div>
              <div className="rounded-xl border border-spa-sage/40 p-4 space-y-2">
                <p className="font-body text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Pay online</p>
                <HolisPassCheckout
                  offeringId={picked.id}
                  price={Number(picked.price)}
                  idPrefix="chooser"
                  onPaid={(email) => setPaidEmail(email)}
                />
              </div>
            </div>
          )}

          {picked && paidEmail && (
            <div className="space-y-4 text-center py-2">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-spa-sage/20">
                <Check className="h-6 w-6 text-spa-sage" />
              </div>
              <p className="spa-body">Your <strong>{picked.name}</strong> is ready.</p>
              <p className="spa-body-sm">
                We emailed your pass code and booking link to <strong>{paidEmail}</strong>.
              </p>
              <Button className="rounded-full" asChild>
                <Link to="/classes/schedule">Book a class</Link>
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <DropInDialog
        open={!!dropIn}
        onOpenChange={(o) => !o && setDropIn(null)}
        title={dropIn?.name}
        classId={forClass?.class_id}
      />
    </>
  );
}
