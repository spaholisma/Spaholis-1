import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRoomAvailability, type TimeSlot } from "@/hooks/useRoomAvailability";
import { formatCRC } from "@/lib/currency";
import { Plus, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ServiceRow } from "@/hooks/useServices";

/** One extra treatment added to the same-day order (Phase 1). */
export type AddonItem = {
  localId: string;
  serviceId: string;
  /** true = same guest as the primary booking; false = another person. */
  forSamePerson: boolean;
  /** Who the treatment is for (the primary name when forSamePerson). */
  recipientName: string;
  slot: TimeSlot | null;
  notes: string;
};

interface Props {
  /** The order's shared day — every add-on is booked on this date. */
  date: Date | undefined;
  services: ServiceRow[];
  primaryName: string;
  addons: AddonItem[];
  setAddons: React.Dispatch<React.SetStateAction<AddonItem[]>>;
}

export function AddOnTreatments({ date, services, primaryName, addons, setAddons }: Props) {
  const [composing, setComposing] = useState(false);
  const [svcId, setSvcId] = useState("");
  const [forSame, setForSame] = useState(true);
  const [name, setName] = useState("");
  const [slot, setSlot] = useState<TimeSlot | null>(null);

  const svc = services.find((s) => s.id === svcId);
  // Only treatments can be added on (same card-on-file flow).
  const options = services.filter((s) => s.type === "treatment");

  const { data: slots, isLoading } = useRoomAvailability(
    date,
    svc?.category,
    svc?.duration_minutes,
    svc?.title,
  );

  const reset = () => { setSvcId(""); setForSame(true); setName(""); setSlot(null); setComposing(false); };

  const canAdd = !!svcId && !!slot && (forSame || name.trim().length >= 2);

  const add = () => {
    if (!canAdd || !slot) return;
    setAddons((a) => [
      ...a,
      {
        localId: crypto.randomUUID(),
        serviceId: svcId,
        forSamePerson: forSame,
        recipientName: forSame ? primaryName : name.trim(),
        slot,
        notes: "",
      },
    ]);
    reset();
  };

  const svcById = (id: string) => services.find((s) => s.id === id);

  return (
    <div className="rounded-2xl border border-dashed border-border p-5 space-y-3">
      <div>
        <p className="font-heading text-base font-medium text-foreground">Add another treatment (same day)</p>
        <p className="font-body text-xs text-muted-foreground">For you (back-to-back) or for someone else — added to this order.</p>
      </div>

      {/* Already-added treatments */}
      {addons.length > 0 && (
        <div className="space-y-2">
          {addons.map((a) => {
            const s = svcById(a.serviceId);
            return (
              <div key={a.localId} className="flex items-start justify-between gap-3 rounded-xl bg-muted/40 border border-border px-3 py-2">
                <div className="min-w-0">
                  <p className="font-body text-sm font-medium text-foreground truncate">{s?.title ?? "Treatment"}</p>
                  <p className="font-body text-xs text-muted-foreground">
                    {a.slot?.label ?? ""} · {a.forSamePerson ? "For you" : `For ${a.recipientName}`} · {formatCRC(Number(s?.price ?? 0))}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Remove"
                  className="text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => setAddons((prev) => prev.filter((x) => x.localId !== a.localId))}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {!composing ? (
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setComposing(true)}>
          <Plus className="h-4 w-4" /> Add a treatment
        </Button>
      ) : (
        <div className="space-y-3 rounded-xl border border-border p-3">
          <div className="space-y-1.5">
            <label className="font-body text-xs font-medium text-foreground">Treatment</label>
            <select
              value={svcId}
              onChange={(e) => { setSvcId(e.target.value); setSlot(null); }}
              className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm font-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Select a treatment…</option>
              {options.map((s) => (
                <option key={s.id} value={s.id}>{s.title} — {formatCRC(Number(s.price ?? 0))}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="font-body text-xs font-medium text-foreground">Who is it for?</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setForSame(true)}
                className={cn("rounded-lg border px-3 py-2 text-sm font-body transition-colors", forSame ? "border-spa-sage bg-spa-sage/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted/50")}
              >
                For me (back-to-back)
              </button>
              <button
                type="button"
                onClick={() => setForSame(false)}
                className={cn("rounded-lg border px-3 py-2 text-sm font-body transition-colors", !forSame ? "border-spa-sage bg-spa-sage/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted/50")}
              >
                For someone else
              </button>
            </div>
          </div>

          {!forSame && (
            <div className="space-y-1.5">
              <label className="font-body text-xs font-medium text-foreground">Their name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Guest name" className="h-9 text-sm" />
            </div>
          )}

          {svcId && (
            <div className="space-y-1.5">
              <label className="font-body text-xs font-medium text-foreground">Time (same day)</label>
              {isLoading ? (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking availability…</p>
              ) : (slots && slots.length > 0) ? (
                <div className="grid grid-cols-3 gap-1.5 max-h-40 overflow-y-auto">
                  {slots.map((s, i) => (
                    <button
                      key={`${s.time.toISOString()}-${i}`}
                      type="button"
                      onClick={() => setSlot(s)}
                      className={cn(
                        "rounded-lg border px-2 py-1.5 text-xs font-body transition-colors",
                        slot?.time.getTime() === s.time.getTime() && slot?.room.id === s.room.id
                          ? "border-spa-sage bg-spa-sage/10 text-foreground"
                          : "border-border text-muted-foreground hover:bg-muted/50",
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No times available for this treatment on this day.</p>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button type="button" size="sm" onClick={add} disabled={!canAdd}>Add to order</Button>
            <Button type="button" size="sm" variant="ghost" onClick={reset}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
