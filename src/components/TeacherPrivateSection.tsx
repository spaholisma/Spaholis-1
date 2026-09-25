import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { formatCRCWithUsd, USD_RATE } from "@/lib/currency";
import { offeringPrice, type PrivateOffering } from "@/lib/privateOfferings";
import { PrivateClassDialog, type PrivatePick } from "@/components/PrivateClassDialog";

/**
 * "Private classes with …" inside a teacher's card: every private class she
 * offers — not only the class on this page, which comes first — with her own
 * prices, and the way to ask for one.
 */
export function TeacherPrivateSection({
  teacherName, offerings, className,
}: {
  teacherName: string;
  /** Hers, the one for the class on this page first. */
  offerings: PrivateOffering[];
  className?: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(offerings[0]?.id ?? null);
  const [pick, setPick] = useState<PrivatePick | null>(null);
  useEffect(() => { setSelectedId(offerings[0]?.id ?? null); }, [offerings[0]?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const o = offerings.find((x) => x.id === selectedId) ?? offerings[0];
  if (!o) return null;
  const first = teacherName.split(/\s+/)[0];
  const money = (n: number | null) => formatCRCWithUsd((n ?? 0) * USD_RATE);
  const prices = [
    { label: "1 person", value: offeringPrice(o, "oneOnOne", 1) },
    { label: "2 people", value: offeringPrice(o, "couples", 2) },
    { label: "Group, up to 4", value: offeringPrice(o, "group", 4) },
  ].filter((p) => p.value != null);

  return (
    <div className={className}>
      <p className="font-body text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5" />
        Private classes with {first}
      </p>

      {offerings.length > 1 && (
        <select
          aria-label={`Private classes with ${first}`}
          value={o.id}
          onChange={(e) => setSelectedId(e.target.value)}
          className="mb-2 h-10 w-full rounded-md border border-input bg-background px-3 font-body text-sm"
        >
          {offerings.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
        </select>
      )}

      <div className="rounded-xl border border-border bg-card p-3">
        <p className="font-heading text-sm font-medium text-foreground">
          {o.title}
          {o.duration_minutes ? <span className="font-body text-xs font-normal text-muted-foreground"> · {o.duration_minutes} min</span> : null}
        </p>
        {o.description && (
          <p className="mt-1 font-body text-xs text-muted-foreground line-clamp-3 whitespace-pre-line">{o.description}</p>
        )}
        <ul className="mt-2 space-y-1">
          {prices.map((p) => (
            <li key={p.label} className="flex items-center justify-between font-body text-xs">
              <span className="text-muted-foreground">{p.label}</span>
              <span className="font-heading text-sm font-semibold text-foreground">{money(p.value)}</span>
            </li>
          ))}
          {o.price_group != null && o.price_extra != null && (
            <li className="flex items-center justify-between font-body text-xs">
              <span className="text-muted-foreground">Each extra person</span>
              <span className="font-heading text-sm font-semibold text-foreground">+{money(o.price_extra)}</span>
            </li>
          )}
        </ul>
        <Button
          size="sm"
          className="mt-3 w-full rounded-full"
          onClick={() => setPick({ teacherName, offerings, initialOfferingId: o.id })}
        >
          Request a private class
        </Button>
      </div>

      <PrivateClassDialog pick={pick} onOpenChange={(open) => !open && setPick(null)} />
    </div>
  );
}
