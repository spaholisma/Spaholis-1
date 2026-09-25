import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Minus, Plus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCRCWithUsd, USD_RATE } from "@/lib/currency";
import { privatePriceUsd, privatePricing } from "@/lib/otherOfferings";
import { useSiteContent } from "@/hooks/useSiteContent";
import { content as defaults } from "@/data/content";
import { clampPeople, privateRequestPath, type PrivateKind } from "@/lib/privateClassRequest";

export interface PrivatePick {
  classId: string;
  classTitle: string;
  teacherName: string;
}

const KINDS: { kind: PrivateKind; fallback: string; people: string }[] = [
  { kind: "oneOnOne", fallback: "One-on-One Private Class", people: "Just you" },
  { kind: "couples", fallback: "Couple's Private Class", people: "2 people" },
  { kind: "group", fallback: "Private Group Class", people: "4 to 20 people" },
];

/**
 * A private class with this teacher, in this class. The prices are the
 * studio's private-class prices (Admin → Services → Private Classes), the same
 * ones the Private Sessions page shows. Choosing one opens the request page
 * with her class already picked; nothing is paid here — the request goes to
 * her and to the Holis team, who arrange the day and time by email.
 */
export function PrivateClassDialog({ pick, onOpenChange }: { pick: PrivatePick | null; onOpenChange: (open: boolean) => void }) {
  const { data: siteContent } = useSiteContent();
  const ps: any = (siteContent as any)?.privateSessions || defaults.privateSessions;
  const pricing = privatePricing(ps);
  const [kind, setKind] = useState<PrivateKind>("oneOnOne");
  const [group, setGroup] = useState(4);

  useEffect(() => { if (pick) { setKind("oneOnOne"); setGroup(4); } }, [pick]);
  if (!pick) return null;

  const first = pick.teacherName.split(/\s+/)[0];
  const people = kind === "group" ? clampPeople(group, "group") : clampPeople(null, kind);
  const titleOf = (k: PrivateKind, fallback: string) => ps.classes?.[k]?.title || fallback;
  const price = (n: number) => formatCRCWithUsd(privatePriceUsd(n, pricing) * USD_RATE);
  const kindTitle = titleOf(kind, KINDS.find((k) => k.kind === kind)!.fallback);

  return (
    <Dialog open={!!pick} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">Private {pick.classTitle} with {first}</DialogTitle>
          <DialogDescription>
            A class just for you — or for you and your people — at a time that suits you.
          </DialogDescription>
        </DialogHeader>

        <div role="radiogroup" aria-label="Who is it for" className="space-y-2">
          {KINDS.map((k) => {
            const n = k.kind === "group" ? clampPeople(group, "group") : clampPeople(null, k.kind);
            const selected = kind === k.kind;
            return (
              <button
                key={k.kind}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setKind(k.kind)}
                className={cn(
                  "w-full rounded-xl border p-3 text-left transition-colors",
                  selected ? "border-foreground bg-muted/40" : "border-border hover:bg-muted/20",
                )}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block font-body text-sm font-medium text-foreground">{titleOf(k.kind, k.fallback)}</span>
                    <span className="block font-body text-xs text-muted-foreground">{k.people}</span>
                  </span>
                  <span className="shrink-0 font-heading text-base font-semibold text-foreground">{price(n)}</span>
                </span>
              </button>
            );
          })}
        </div>

        {kind === "group" && (
          <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
            <span className="flex items-center gap-1.5 font-body text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" /> How many people?
            </span>
            <span className="flex items-center gap-3">
              <button type="button" aria-label="One person fewer" disabled={people <= 4}
                onClick={() => setGroup((g) => Math.max(4, g - 1))}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border hover:bg-accent disabled:opacity-40">
                <Minus className="h-3 w-3" />
              </button>
              <span className="w-6 text-center font-heading text-sm font-semibold" aria-live="polite">{people}</span>
              <button type="button" aria-label="One person more" disabled={people >= 20}
                onClick={() => setGroup((g) => Math.min(20, g + 1))}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border hover:bg-accent disabled:opacity-40">
                <Plus className="h-3 w-3" />
              </button>
            </span>
          </div>
        )}

        <p className="font-body text-xs text-muted-foreground">
          Nothing is paid now. Your request goes straight to {first} and the Holis team, and you arrange the day and
          time together by email.
        </p>

        <Button asChild className="w-full">
          <Link
            to={privateRequestPath({ kind, kindTitle, people, classId: pick.classId, teacherName: pick.teacherName })}
            onClick={() => onOpenChange(false)}
          >
            Request a private class · {price(people)}
          </Link>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
