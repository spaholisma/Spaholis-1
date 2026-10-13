import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneField, isValidPhoneNumber } from "@/components/booking/PhoneField";
import { PayPalCheckout } from "@/components/payments/PayPalCheckout";
import { IdDocumentField } from "@/components/payments/IdDocumentField";
import { useAccountDetails } from "@/hooks/useAccountDetails";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  EMPTY_ID_DOCUMENT, couponLabel, holisCouponProblem, idDocumentBody, idDocumentOk, localApplies,
  localDiscountAmount, missingId, quoteHolisPrice, rememberIdDocument, useStudioLocalPct,
  type IdDocument,
} from "@/lib/localDiscount";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const money = (n: number) =>
  `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/**
 * What is still missing before the guest can pay, in plain words ([] = nothing).
 * With a coupon applied the ID is optional.
 */
export function missingDetails(
  form: { name: string; email: string; phone: string }, doc: IdDocument, couponApplied = false,
): string[] {
  const out: string[] = [];
  if (!form.name.trim()) out.push("your name");
  if (!EMAIL_RE.test(form.email.trim())) out.push("a valid email");
  if (!form.phone || !isValidPhoneNumber(form.phone)) out.push("a valid phone number");
  out.push(...missingId(doc, couponApplied));
  return out;
}

/** What the form hands over to build the order — the server prices it again. */
export interface OnlinePayFields {
  name: string;
  email: string;
  phone: string;
  doc: IdDocument;
  /** The Holis coupon to send (null when the local discount applies or none was applied). */
  couponCode: string | null;
}

/**
 * Paying Holis Wellness Center online: who you are (filled in from the account
 * when signed in), your ID, an optional Holis coupon, the price — and PayPal.
 * Every field is required except the coupon (and the ID, once a coupon is on).
 *
 * A valid Costa Rican cédula takes the studio's local discount off at once
 * (Admin → Coupons); then a coupon does not add to it. The server prices it
 * again (holis_price) before PayPal is opened.
 */
export function OnlinePayForm({
  price, buildBody, onPaid, onFree, footer, priceLabel, classId, offeringId, idPrefix = "pay", className,
}: {
  price: number;
  buildBody: (f: OnlinePayFields) => Record<string, unknown>;
  onPaid: (email: string) => void;
  /**
   * A coupon that covers the whole price: PayPal cannot take $0, so this books
   * it instead (on the server, which checks the coupon again). Without it, such
   * a coupon is refused.
   */
  onFree?: (f: OnlinePayFields) => Promise<void>;
  footer?: ReactNode;
  /** The line above the discount, e.g. "Class price". */
  priceLabel?: string;
  /** What is being paid for: a class (its coupons), or a pass (the coupons ticked for it). */
  classId?: string | null;
  offeringId?: string | null;
  idPrefix?: string;
  className?: string;
}) {
  const account = useAccountDetails();
  const { data: pct = 0 } = useStudioLocalPct();
  const what = offeringId ? "pass" : "class";

  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [doc, setDoc] = useState<IdDocument>(EMPTY_ID_DOCUMENT);
  const [couponCode, setCouponCode] = useState("");
  const [coupon, setCoupon] = useState<{ code: string; discount: number; label: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [confirmingFree, setConfirmingFree] = useState(false);

  // Signed in: fill in what the account knows, without overwriting anything typed.
  useEffect(() => {
    if (!account) return;
    setForm((f) => ({
      name: f.name || account.name,
      email: f.email || account.email,
      phone: f.phone || account.phone,
    }));
    setDoc((d) => (d.type || d.number ? d
      : { type: account.idDocumentType, number: account.idDocument }));
  }, [account]);

  const local = localApplies(doc, pct);
  // The local discount wins; a coupon never adds to it.
  useEffect(() => { if (local && coupon) setCoupon(null); }, [local, coupon]);
  const discount = local ? localDiscountAmount(price, pct) : coupon?.discount ?? 0;
  const total = Math.max(0, Math.round((price - discount) * 100) / 100);
  // A coupon is applied (and not replaced by the local discount): the ID is optional.
  const couponOn = !!coupon && !local;

  const detailsReady =
    !!form.name.trim() && EMAIL_RE.test(form.email.trim())
    && !!form.phone && isValidPhoneNumber(form.phone)
    && idDocumentOk(doc, couponOn);
  const ready = detailsReady && total > 0;
  // A coupon that covers it all: no PayPal, confirm it here.
  const free = !!coupon && total <= 0 && !!onFree;
  // What is still missing, said plainly — a greyed-out button alone reads like a bug.
  const missing = missingDetails(form, doc, couponOn);
  // Tried to continue with something missing: the fields in question turn red.
  const [attempted, setAttempted] = useState(false);
  const fields = (): OnlinePayFields => ({
    name: form.name.trim(), email: form.email.trim(), phone: form.phone, doc,
    couponCode: local ? null : coupon?.code ?? null,
  });

  const confirmFree = async () => {
    if (!free || !onFree) return;
    if (!detailsReady) {
      setAttempted(true);
      toast.error(`Please add ${missing.join(", ")} to confirm.`);
      return;
    }
    setConfirmingFree(true);
    try {
      await onFree(fields());
      rememberIdDocument(account?.userId, doc);
      onPaid(form.email.trim());
    } catch (e: any) {
      toast.error(e?.message || "We couldn't confirm it — please try again.");
    } finally {
      setConfirmingFree(false);
    }
  };

  // One check at a time: leaving the field and pressing Apply must not run it twice.
  const applying = useRef(false);
  const applyCoupon = async () => {
    const code = couponCode.trim();
    if (!code || coupon || applying.current) return;
    applying.current = true;
    setChecking(true);
    try {
      const q = await quoteHolisPrice(price, doc, code, { classId, offeringId });
      if (!q) { toast.error("We couldn't check the coupon — please try again."); return; }
      if (q.coupon_status === "applied" && q.coupon) {
        if (q.price <= 0 && !onFree) {
          toast.error("This coupon covers the full price — please write to us on WhatsApp and we will arrange it.");
          return;
        }
        const label = couponLabel(q);
        setCoupon({ code: q.coupon, discount: q.discount, label });
        toast.success(`Coupon applied: ${label}`);
        return;
      }
      const why = holisCouponProblem(q.coupon_status, what);
      if (q.coupon_status === "ignored_local") toast.info(why!);
      else toast.error(why ?? "That code isn't a valid coupon.");
    } finally {
      applying.current = false;
      setChecking(false);
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      <Input placeholder="Your name *" value={form.name} autoComplete="name"
        aria-invalid={attempted && !form.name.trim()}
        className={cn(attempted && !form.name.trim() && "border-destructive")}
        onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Input type="email" placeholder="Email *" value={form.email} autoComplete="email"
          aria-invalid={attempted && !EMAIL_RE.test(form.email.trim())}
          className={cn(attempted && !EMAIL_RE.test(form.email.trim()) && "border-destructive")}
          onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <PhoneField
          id={`${idPrefix}-phone`}
          placeholder="Phone *"
          value={form.phone}
          onChange={(v) => setForm({ ...form, phone: v })}
          invalid={(!!form.phone || attempted) && !(form.phone && isValidPhoneNumber(form.phone))}
        />
      </div>

      <IdDocumentField value={doc} onChange={setDoc} localPct={pct} teacherFirst="the studio"
        idPrefix={`${idPrefix}-id`} showMissing={attempted} optional={couponOn} />

      {!local && (
        <div className="space-y-1">
          <label htmlFor={`${idPrefix}-coupon`} className="font-body text-xs font-medium text-muted-foreground">
            Have a coupon? (optional)
          </label>
          <div className="flex gap-2">
            <Input
              id={`${idPrefix}-coupon`}
              placeholder="Coupon code"
              value={couponCode}
              disabled={!!coupon}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              // Typed but "Apply" not pressed: apply it on Enter or on leaving the field.
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyCoupon(); } }}
              onBlur={() => { if (couponCode.trim() && !coupon) applyCoupon(); }}
            />
            {coupon ? (
              <Button type="button" variant="ghost" onClick={() => { setCoupon(null); setCouponCode(""); }}>Remove</Button>
            ) : (
              <Button type="button" variant="outline" disabled={!couponCode.trim() || checking} onClick={applyCoupon}>
                {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
              </Button>
            )}
          </div>
          {coupon && <p className="font-body text-xs text-spa-sage">{coupon.code} applied — {coupon.label}</p>}
        </div>
      )}

      <div className="rounded-xl bg-muted/50 p-3 font-body text-sm space-y-1">
        {discount > 0 && (
          <>
            <div className="flex justify-between text-muted-foreground">
              <span>{priceLabel ?? "Price"}</span><span>{money(price)}</span>
            </div>
            <div className="flex justify-between text-spa-sage">
              <span>{local ? `Local discount (${pct}%)` : `Coupon (${coupon?.code})`}</span>
              <span>−{money(discount)}</span>
            </div>
          </>
        )}
        <div className="flex justify-between font-semibold text-foreground">
          <span>Total</span><span>{money(total)}</span>
        </div>
      </div>

      {missing.length > 0 && (
        <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 font-body text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          To continue, please add: <strong>{missing.join(", ")}</strong>.
        </div>
      )}

      {free ? (
        <Button className="w-full rounded-full" disabled={confirmingFree} onClick={confirmFree}>
          {confirmingFree ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
          Confirm — free with coupon {coupon?.code}
        </Button>
      ) : (
        <PayPalCheckout
          disabled={!ready}
          createOrderBody={() => ready ? buildBody(fields()) : null}
          onSuccess={() => {
            rememberIdDocument(account?.userId, doc);
            onPaid(form.email.trim());
          }}
        />
      )}
      {footer}
    </div>
  );
}

/** Buying one of Holis' passes or memberships online — paid to Holis Wellness Center. */
export function HolisPassCheckout({
  offeringId, price, onPaid, idPrefix = "pass", className,
}: {
  offeringId: string;
  price: number;
  onPaid: (email: string) => void;
  idPrefix?: string;
  className?: string;
}) {
  const account = useAccountDetails();
  return (
    <OnlinePayForm
      price={price}
      offeringId={offeringId}
      priceLabel="Pass price"
      idPrefix={idPrefix}
      className={className}
      onPaid={onPaid}
      onFree={async (f) => {
        // A coupon covers the whole pass: issued on the server, which checks it again.
        const { data, error } = await (supabase as any).rpc("claim_offering_with_coupon", {
          _offering_id: offeringId, _guest_name: f.name, _guest_email: f.email, _guest_phone: f.phone,
          _coupon: f.couponCode, _id_document: f.doc.number.trim() || null, _id_document_type: f.doc.number.trim() ? f.doc.type : null,
        });
        if (error) throw new Error(error.message);
        // The pass code and booking link, to the guest (and a copy to Holis).
        try {
          await supabase.functions.invoke("send-membership-order-email", { body: { userOfferingId: (data as any)?.id } });
        } catch { /* the pass exists; the email can be resent from Admin */ }
      }}
      buildBody={(f) => ({
        kind: "offering", offering_id: offeringId, user_id: account?.userId ?? null,
        guest_name: f.name, guest_email: f.email, guest_phone: f.phone,
        ...idDocumentBody(f.doc),
        coupon_code: f.couponCode,
      })}
      footer={(
        <p className="font-body text-[11px] text-muted-foreground">
          With PayPal or a card, paid to Holis Wellness Center. Your pass code and booking link arrive by email right away.
        </p>
      )}
    />
  );
}
