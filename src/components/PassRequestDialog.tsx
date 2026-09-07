import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Ticket, Check, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const sb = supabase as any;
const usd = (n: number) =>
  `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export interface PassPick {
  teacherId: string;
  teacherName: string;
  membershipId?: string | null;
  membershipName: string;
  price?: number | null;
  paymentNote?: string | null;
  paymentLink?: string | null;
  classId?: string | null;
  classTitle?: string | null;
}

/**
 * Asking a teacher for one of her passes.
 *
 * No money changes hands here — Holis does not take it. The student sees her
 * price and how to pay her, leaves a name, and the request lands in her panel
 * so she knows who to expect and can hand over the pass when they pay.
 */
export function PassRequestDialog({
  pick, onOpenChange,
}: {
  pick: PassPick | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (pick) { setForm({ name: "", email: "", phone: "" }); setDone(false); }
  }, [pick]);

  if (!pick) return null;
  const first = pick.teacherName.split(/\s+/)[0];

  const send = async () => {
    if (!form.name.trim()) { toast.error("Please tell her your name"); return; }
    setSaving(true);
    const { error } = await sb.from("teacher_pass_requests").insert({
      teacher_id: pick.teacherId,
      membership_id: pick.membershipId ?? null,
      membership_name: pick.membershipName,
      price: pick.price ?? null,
      class_id: pick.classId ?? null,
      class_title: pick.classTitle ?? null,
      guest_name: form.name.trim(),
      guest_email: form.email.trim() || null,
      guest_phone: form.phone.trim() || null,
      status: "pending",
    });
    if (error) toast.error(error.message);
    else setDone(true);
    setSaving(false);
  };

  return (
    <Dialog open={!!pick} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {done ? `${first} knows you are coming` : pick.membershipName}
          </DialogTitle>
        </DialogHeader>

        {done ? (
          <div className="space-y-4 text-center py-2">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-spa-sage/20">
              <Check className="h-6 w-6 text-spa-sage" />
            </div>
            <p className="spa-body">
              <strong>{pick.teacherName}</strong> has your name and knows you want the{" "}
              {pick.membershipName}.
            </p>
            {(pick.paymentNote || pick.paymentLink) && (
              <p className="spa-body-sm">
                Pay her directly{pick.paymentNote ? <>: {pick.paymentNote}</> : null}
              </p>
            )}
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              {pick.paymentLink && (
                <Button variant="outline" className="rounded-full" asChild>
                  <a href={pick.paymentLink} target="_blank" rel="noopener noreferrer">
                    Pay now <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                  </a>
                </Button>
              )}
              <Button className="rounded-full" onClick={() => onOpenChange(false)}>Close</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-spa-sage/40 bg-spa-sage/5 p-4">
              <p className="font-body text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {pick.membershipName} with
              </p>
              <p className="font-heading text-lg font-medium text-foreground">{pick.teacherName}</p>
              {pick.classTitle && (
                <p className="font-body text-xs text-muted-foreground">for {pick.classTitle}</p>
              )}
              {pick.price != null && (
                <p className="font-heading text-2xl font-semibold text-foreground mt-2">{usd(pick.price)}</p>
              )}
            </div>

            <div className="rounded-xl border border-border p-4">
              <p className="font-body text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                How to pay {first}
              </p>
              {pick.paymentNote && (
                <p className="font-body text-sm text-foreground whitespace-pre-line">{pick.paymentNote}</p>
              )}
              {pick.paymentLink && (
                <Button size="sm" variant="outline" className="rounded-full mt-2" asChild>
                  <a href={pick.paymentLink} target="_blank" rel="noopener noreferrer">
                    Pay {first} <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                  </a>
                </Button>
              )}
              {!pick.paymentNote && !pick.paymentLink && (
                <p className="font-body text-sm text-muted-foreground">
                  She will tell you at the studio — cash or SINPE.
                </p>
              )}
              <p className="font-body text-[11px] text-muted-foreground mt-2">
                Holis does not take this payment. It goes to your teacher.
              </p>
            </div>

            <div className="space-y-2">
              <p className="font-body text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Let her know you are coming
              </p>
              <Input placeholder="Your name *" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Input placeholder="Email (optional)" value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })} />
                <Input placeholder="Phone (optional)" value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <Button className="w-full rounded-full" onClick={send} disabled={saving || !form.name.trim()}>
                {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Ticket className="h-4 w-4 mr-1" />}
                Tell {first}
              </Button>
              <p className="font-body text-[11px] text-muted-foreground text-center">
                Nothing is charged here. She gives you the pass when you pay her.
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
