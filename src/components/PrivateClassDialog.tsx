import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Clock, Minus, Plus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCRCWithUsd, USD_RATE } from "@/lib/currency";
import { useSiteContent } from "@/hooks/useSiteContent";
import { content as defaults } from "@/data/content";
import { privateRequestPath, type PrivateKind } from "@/lib/privateClassRequest";
import { kindsOffered, maxGroup, offeringPrice, type PrivateOffering } from "@/lib/privateOfferings";

export interface PrivatePick {
  teacherName: string;
  /** Her private classes. */
  offerings: PrivateOffering[];
  /** The one to show first — the class whose page she was opened from. */
  initialOfferingId?: string | null;
}

const KIND_FALLBACK: Record<PrivateKind, { title: string; people: string }> = {
  oneOnOne: { title: "One-on-One Private Class", people: "Just you" },
  couples: { title: "Couple's Private Class", people: "2 people" },
  group: { title: "Private Group Class", people: "A group" },
};

/**
 * A private class with this teacher. She lists her private classes and sets
 * her own prices in her Teacher Panel; here the guest picks one of them, who
 * it is for, and sees her price. Choosing opens the request page with her class
 * already picked — nothing is paid here; the request goes to her and to the
 * Holis team, who arrange the day and time by email.
 */
export function PrivateClassDialog({ pick, onOpenChange }: { pick: PrivatePick | null; onOpenChange: (open: boolean) => void }) {
  const { data: siteContent } = useSiteContent();
  const ps: any = (siteContent as any)?.privateSessions || defaults.privateSessions;
  const [offeringId, setOfferingId] = useState<string | null>(null);
  const [kind, setKind] = useState<PrivateKind>("oneOnOne");
  const [group, setGroup] = useState(4);

  const offering = pick?.offerings.find((o) => o.id === offeringId) ?? pick?.offerings[0] ?? null;
  const kinds = offering ? kindsOffered(offering) : [];

  useEffect(() => {
    if (!pick) return;
    const first = pick.offerings.find((o) => o.id === pick.initialOfferingId) ?? pick.offerings[0];
    setOfferingId(first?.id ?? null);
    setGroup(4);
  }, [pick]);
  // Keep the chosen kind one she offers for this class.
  useEffect(() => {
    if (offering && !kinds.includes(kind)) setKind(kinds[0] ?? "oneOnOne");
  }, [offering?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!pick || !offering) return null;

  const first = pick.teacherName.split(/\s+/)[0];
  const top = maxGroup(offering);
  const peopleFor = (k: PrivateKind) => (k === "oneOnOne" ? 1 : k === "couples" ? 2 : Math.min(Math.max(4, group), top));
  const people = peopleFor(kind);
  const price = offeringPrice(offering, kind, people);
  const money = (n: number | null) => (n == null ? "—" : formatCRCWithUsd(n * USD_RATE));
  const kindTitle = ps.classes?.[kind]?.title || KIND_FALLBACK[kind].title;
  const groupLabel = top > 4 ? "4 to 20 people" : "Up to 4 people";

  return (
    <Dialog open={!!pick} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">Private classes with {first}</DialogTitle>
          <DialogDescription>
            A class just for you — or for you and your people — at a time that suits you.
          </DialogDescription>
        </DialogHeader>

        {pick.offerings.length > 1 ? (
          <div>
            <label htmlFor="private-offering" className="font-body text-xs text-muted-foreground">Which class?</label>
            <select
              id="private-offering"
              value={offering.id}
              onChange={(e) => setOfferingId(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 font-body text-sm"
            >
              {pick.offerings.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
            </select>
          </div>
        ) : (
          <p className="font-heading text-base text-foreground">{offering.title}</p>
        )}

        {(offering.description || offering.duration_minutes) && (
          <div className="space-y-1">
            {offering.duration_minutes && (
              <p className="flex items-center gap-1.5 font-body text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" /> {offering.duration_minutes} min
              </p>
            )}
            {offering.description && (
              <p className="font-body text-sm text-muted-foreground whitespace-pre-line">{offering.description}</p>
            )}
          </div>
        )}

        <div role="radiogroup" aria-label="Who is it for" className="space-y-2">
          {kinds.map((k) => {
            const selected = kind === k;
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setKind(k)}
                className={cn(
                  "w-full rounded-xl border p-3 text-left transition-colors",
                  selected ? "border-foreground bg-muted/40" : "border-border hover:bg-muted/20",
                )}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block font-body text-sm font-medium text-foreground">{ps.classes?.[k]?.title || KIND_FALLBACK[k].title}</span>
                    <span className="block font-body text-xs text-muted-foreground">{k === "group" ? groupLabel : KIND_FALLBACK[k].people}</span>
                  </span>
                  <span className="shrink-0 font-heading text-base font-semibold text-foreground">
                    {money(offeringPrice(offering, k, k === "group" ? 4 : peopleFor(k)))}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {kind === "group" && top > 4 && (
          <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
            <span className="flex items-center gap-1.5 font-body text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" /> How many people?
              {offering.price_extra != null && <span>· +{money(offering.price_extra)} each beyond 4</span>}
            </span>
            <span className="flex items-center gap-3">
              <button type="button" aria-label="One person fewer" disabled={people <= 4}
                onClick={() => setGroup((g) => Math.max(4, g - 1))}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border hover:bg-accent disabled:opacity-40">
                <Minus className="h-3 w-3" />
              </button>
              <span className="w-6 text-center font-heading text-sm font-semibold" aria-live="polite">{people}</span>
              <button type="button" aria-label="One person more" disabled={people >= top}
                onClick={() => setGroup((g) => Math.min(top, g + 1))}
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

        <Button asChild className="w-full" disabled={price == null}>
          <Link
            to={privateRequestPath({
              kind, kindTitle, people,
              offeringId: offering.id, classId: offering.class_id, teacherName: pick.teacherName,
            })}
            onClick={() => onOpenChange(false)}
          >
            Request a private class · {money(price)}
          </Link>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
