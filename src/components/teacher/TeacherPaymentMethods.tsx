import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { CreditCard, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

const sb = supabase as any;

export interface PayMethodsRow {
  id: string;
  paypal_enabled: boolean | null;
  paypal_email: string | null;
  compraclick_enabled: boolean | null;
  compraclick_url: string | null;
  payment_instructions: string | null;
}

export interface PayMethodsDraft {
  paypalOn: boolean;
  paypalEmail: string;
  compraclickOn: boolean;
  compraclickUrl: string;
  other: string;
}

export const draftFromRow = (t: PayMethodsRow): PayMethodsDraft => ({
  paypalOn: t.paypal_enabled !== false && !!(t.paypal_email ?? "").trim(),
  paypalEmail: t.paypal_email ?? "",
  compraclickOn: !!t.compraclick_enabled,
  compraclickUrl: t.compraclick_url ?? "",
  other: t.payment_instructions ?? "",
});

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const HTTPS_RE = /^https:\/\/\S+$/i;

/**
 * What a draft saves as — or why it can't be saved. A method can only be
 * switched on with what it needs (her PayPal email, her CompraClick link).
 * Switching one off keeps what she typed, so turning it back on is one tap.
 */
export function validatePayMethods(d: PayMethodsDraft):
  | { ok: true; values: Omit<PayMethodsRow, "id"> }
  | { ok: false; error: string } {
  const email = d.paypalEmail.trim().toLowerCase();
  const url = d.compraclickUrl.trim();
  if (email && !EMAIL_RE.test(email)) return { ok: false, error: "That PayPal email doesn't look right" };
  if (d.paypalOn && !email) return { ok: false, error: "Add your PayPal email to switch PayPal on" };
  if (url && !HTTPS_RE.test(url)) return { ok: false, error: "Your CompraClick link must start with https://" };
  if (d.compraclickOn && !url) return { ok: false, error: "Add your CompraClick link to switch CompraClick on" };
  return {
    ok: true,
    values: {
      paypal_enabled: d.paypalOn,
      paypal_email: email || null,
      compraclick_enabled: d.compraclickOn,
      compraclick_url: url || null,
      payment_instructions: d.other,
    },
  };
}

/**
 * How her students can pay her online — each method switched on or off by her.
 * Cash at the class is always available, so it isn't a setting.
 * Holis never takes this money: PayPal goes straight to her account and
 * CompraClick to her own link.
 */
export function TeacherPaymentMethods({
  teacher, onSaved,
}: {
  teacher: PayMethodsRow;
  onSaved: (patch: Omit<PayMethodsRow, "id">) => void;
}) {
  const [draft, setDraft] = useState<PayMethodsDraft>(() => draftFromRow(teacher));
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDraft(draftFromRow(teacher)); }, [teacher]);

  const saved = draftFromRow(teacher);
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft);
  const set = (patch: Partial<PayMethodsDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const save = async () => {
    const res = validatePayMethods(draft);
    if ("error" in res) { toast.error(res.error); return; }
    setSaving(true);
    const { error } = await sb.from("teachers").update(res.values).eq("id", teacher.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Payment methods saved");
    onSaved(res.values);
  };

  return (
    <Card className="p-4">
      <h3 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-2">
        <CreditCard className="h-4 w-4" /> How your students pay you
      </h3>
      <p className="font-body text-xs text-muted-foreground mb-4">
        Switch on the ways your students can pay you online. Holis does not take this money — it goes straight to you.
        They can always pay you in cash at the class.
      </p>

      <div className="space-y-4">
        {/* PayPal */}
        <div className="rounded-xl border border-border p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-body text-sm font-medium text-foreground">PayPal</p>
              <p className="font-body text-[11px] text-muted-foreground">PayPal or any card — paid straight to your PayPal account. PayPal's fee comes out of it.</p>
            </div>
            <Switch
              checked={draft.paypalOn}
              onCheckedChange={(v) => set({ paypalOn: v })}
              aria-label="PayPal"
            />
          </div>
          {draft.paypalOn && (
            <Input
              type="email" inputMode="email" autoComplete="email"
              value={draft.paypalEmail}
              onChange={(e) => set({ paypalEmail: e.target.value })}
              placeholder="the email of your PayPal account"
              className="mt-2"
            />
          )}
        </div>

        {/* CompraClick */}
        <div className="rounded-xl border border-border p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-body text-sm font-medium text-foreground">CompraClick</p>
              <p className="font-body text-[11px] text-muted-foreground">Your BAC CompraClick payment link. The spot is held for them — check the payment arrived.</p>
            </div>
            <Switch
              checked={draft.compraclickOn}
              onCheckedChange={(v) => set({ compraclickOn: v })}
              aria-label="CompraClick"
            />
          </div>
          {draft.compraclickOn && (
            <Input
              type="url" inputMode="url"
              value={draft.compraclickUrl}
              onChange={(e) => set({ compraclickUrl: e.target.value })}
              placeholder="https://… your CompraClick link"
              className="mt-2"
            />
          )}
        </div>

        <div>
          <label className="font-body text-xs font-medium text-foreground">Other ways to pay you (shown with your passes)</label>
          <Textarea
            value={draft.other}
            onChange={(e) => set({ other: e.target.value })}
            rows={3}
            placeholder="e.g. SINPE Movil 8888-8888"
            className="mt-1"
          />
        </div>
      </div>

      <div className="mt-3 flex justify-end">
        <Button size="sm" onClick={save} disabled={saving || !dirty}>
          {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Save
        </Button>
      </div>
    </Card>
  );
}
