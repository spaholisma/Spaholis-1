import { useState } from "react";
import { formatCRCWithUsd } from "@/lib/currency";
import { useNavigate } from "react-router-dom";
import { trackBookingComplete } from "@/lib/analytics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PayPalCheckout } from "@/components/payments/PayPalCheckout";
import {
  useOfferings,
  useInvalidateOfferings,
  type Offering,
  type OfferingType,
} from "@/hooks/useOfferings";
import { useAuth } from "@/hooks/useAuth";
import { Check, Infinity as InfinityIcon, Ticket, BadgeCheck, Calendar } from "lucide-react";
import { toast } from "sonner";

const TYPE_LABEL: Record<OfferingType, string> = {
  membership: "Memberships",
  class_pass: "Class Passes",
  drop_in: "Drop-ins",
};

const TYPE_DESC: Record<OfferingType, string> = {
  membership: "Unlimited or recurring access for a set period.",
  class_pass: "Bundled credits to use across multiple classes.",
  drop_in: "Single-class access — pay as you go.",
};

const TYPE_ICON: Record<OfferingType, typeof Ticket> = {
  membership: BadgeCheck,
  class_pass: Ticket,
  drop_in: Calendar,
};

function OfferingCard({ offering, onBuy }: { offering: Offering; onBuy: (o: Offering) => void }) {
  const Icon = TYPE_ICON[offering.type];
  return (
    <Card className="flex flex-col h-full transition-shadow hover:shadow-lg">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-spa-sage" />
            <CardTitle className="text-xl font-display">{offering.name}</CardTitle>
          </div>
          {offering.is_unlimited && (
            <Badge variant="secondary" className="gap-1">
              <InfinityIcon className="h-3 w-3" /> Unlimited
            </Badge>
          )}
        </div>
        {offering.description && (
          <CardDescription className="font-body">{offering.description}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex flex-col flex-1 justify-between gap-6">
        <ul className="space-y-2 text-sm font-body text-muted-foreground">
          {offering.credits != null && !offering.is_unlimited && (
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-spa-sage" /> {offering.credits} class credits
            </li>
          )}
          {offering.is_unlimited && (
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-spa-sage" /> Unlimited classes
            </li>
          )}
          {offering.duration_days != null && (
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-spa-sage" /> Valid for {offering.duration_days} days
            </li>
          )}
          <li className="flex items-center gap-2">
            <Check className="h-4 w-4 text-spa-sage" /> Use across all eligible classes
          </li>
        </ul>
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-3xl font-display text-foreground">
              {formatCRCWithUsd(offering.price)}
            </div>
            <div className="text-xs text-muted-foreground font-body">
              {offering.currency} · tax included
            </div>
          </div>
          <Button onClick={() => onBuy(offering)} variant="spa">
            Buy now
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface Props {
  defaultTab?: "all" | OfferingType;
  redirectAfterPurchase?: string;
}

export function OfferingsPurchaseSection({ defaultTab = "all", redirectAfterPurchase = "/dashboard" }: Props) {
  const { data: offerings = [], isLoading } = useOfferings();
  const { user } = useAuth();
  const navigate = useNavigate();
  const invalidate = useInvalidateOfferings();
  const [selected, setSelected] = useState<Offering | null>(null);

  const memberships = offerings.filter((o) => o.type === "membership");
  const passes = offerings.filter((o) => o.type === "class_pass");
  const dropIns = offerings.filter((o) => o.type === "drop_in");

  const handleBuy = (o: Offering) => {
    // Offerings are granted to the buyer's account, so they must be signed in.
    if (!user) {
      toast.error("Please sign in to purchase.");
      navigate("/auth");
      return;
    }
    setSelected(o);
  };

  const sections: { key: OfferingType; items: Offering[] }[] = [
    { key: "membership", items: memberships },
    { key: "class_pass", items: passes },
    { key: "drop_in", items: dropIns },
  ];

  const total = memberships.length + passes.length + dropIns.length;

  if (isLoading) {
    return (
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-72 rounded-lg" />
        ))}
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground font-body">
        No offerings are available right now. Please check back soon.
      </div>
    );
  }

  return (
    <>
      <Tabs defaultValue={defaultTab}>
        <TabsList className="mb-8 flex-wrap h-auto">
          <TabsTrigger value="all">All ({total})</TabsTrigger>
          {memberships.length > 0 && (
            <TabsTrigger value="membership">Memberships ({memberships.length})</TabsTrigger>
          )}
          {passes.length > 0 && (
            <TabsTrigger value="class_pass">Class Passes ({passes.length})</TabsTrigger>
          )}
          {dropIns.length > 0 && (
            <TabsTrigger value="drop_in">Drop-ins ({dropIns.length})</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="all" className="space-y-12">
          {sections
            .filter((s) => s.items.length > 0)
            .map((s) => (
              <div key={s.key}>
                <div className="mb-4">
                  <h3 className="text-xl font-display text-foreground">{TYPE_LABEL[s.key]}</h3>
                  <p className="text-sm font-body text-muted-foreground">{TYPE_DESC[s.key]}</p>
                </div>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {s.items.map((o) => (
                    <OfferingCard key={o.id} offering={o} onBuy={handleBuy} />
                  ))}
                </div>
              </div>
            ))}
        </TabsContent>

        {sections.map((s) =>
          s.items.length > 0 ? (
            <TabsContent key={s.key} value={s.key}>
              <p className="text-sm font-body text-muted-foreground mb-6">{TYPE_DESC[s.key]}</p>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {s.items.map((o) => (
                  <OfferingCard key={o.id} offering={o} onBuy={handleBuy} />
                ))}
              </div>
            </TabsContent>
          ) : null,
        )}
      </Tabs>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">{selected?.name}</DialogTitle>
            <DialogDescription className="font-body">
              Complete your purchase securely. Your offering will be available
              immediately in your account.
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm font-body">
                <span className="text-muted-foreground">{selected.name}</span>
                <span className="font-semibold text-foreground">{formatCRCWithUsd(selected.price)}</span>
              </div>
              <PayPalCheckout
                createOrderBody={() => (user ? { kind: "offering", offering_id: selected.id, user_id: user.id } : null)}
                onSuccess={(res: any) => {
                  // After paypal-capture-order verified the payment on our server.
                  if (res?.userOfferingId) {
                    trackBookingComplete({
                      transaction_id: res.userOfferingId, booking_type: "membership", item_id: selected.id,
                      item_name: selected.name, item_category: selected.type, value: Number(selected.price ?? 0),
                      payment_method: "paypal", payment_status: "paid",
                    });
                  }
                  invalidate();
                  toast.success(`${selected.name} added to your account.`);
                  setSelected(null);
                  navigate(redirectAfterPurchase);
                }}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
