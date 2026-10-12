import { useEffect, useState, type ReactNode } from "react";
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
import { validateCoupon, describeCouponDiscount } from "@/lib/coupons";
import {
  EMPTY_ID_DOCUMENT, couponLabel, idDocumentBody, isIdDocumentValid, localApplies,
  localDiscountAmount, localPctFor, quoteTeacherPrice, rememberIdDocument, useLocalDiscounts,
  type IdDocument,
} from "@/lib/localDiscount";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const money = (n: number) =>
  `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/** What the form hands over to build the order — the server prices it again. */
export interface OnlinePayFields {
  name: string;
  email: string;
  phone: string;
  doc: IdDocument;
  /** The coupon to send (null when the local discount applies or none was applied). */
  couponCode: string | null;
  /** Whose coupon it is: the teacher's own, or a Holis coupon (classes only). */
  couponSource: "teacher" | "holis" | null;
}

/**
 * Paying online: who you are (filled in from the account when signed in), your
 * ID, an optional coupon, the price — and PayPal. Every field is required
 * except the coupon.
 *
 * A Costa Rican cédula takes the teacher's local discount off at once; then a
 * coupon does not add to it. Coupons are the teacher's own; for a class a Holis
 * coupon works too (`holisCouponClassId`). The server prices it again before
 * PayPal is opened.
 */
export function OnlinePayForm({
  teacherName, price, buildBody, onPaid, onFree, footer, priceLabel, holisCouponClassId, idPrefix = "pay", className,
}: {
  /** Whose local discount and coupons apply ("" when the class has no teacher yet). */
  teacherName: string;
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
  /** The line above the discount, e.g. "Evelina's price". */
  priceLabel?: string;
  /** A class: Holis coupons are accepted as well as the teacher's. */
  holisCouponClassId?: string;
  idPrefix?: string;
  className?: string;
}) {
  const first = teacherName.split(/\s+/)[0] || "";
  const account = useAccountDetails();
  const { data: discounts } = useLocalDiscounts();
  const pct = localPctFor(discounts, teacherName);

  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [doc, setDoc] = useState<IdDocument>(EMPTY_ID_DOCUMENT);
  const [couponCode, setCouponCode] = useState("");
  const [coupon, setCoupon] = useState<{ code: string; discount: number; label: string; source: "teacher" | "holis" } | null>(null);
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

  const detailsReady =
    !!form.name.trim() && EMAIL_RE.test(form.email.trim())
    && !!form.phone && isValidPhoneNumber(form.phone)
    && isIdDocumentValid(doc);
  const ready = detailsReady && total > 0;
  // A coupon that covers it all: no PayPal, confirm it here.
  const free = !!coupon && total <= 0 && !!onFree;
  const fields = (): OnlinePayFields => ({
    name: form.name.trim(), email: form.email.trim(), phone: form.phone, doc,
    couponCode: local ? null : coupon?.code ?? null,
    couponSource: local || !coupon ? null : coupon.source,
  });

  const confirmFree = async () => {
    if (!free || !detailsReady || !onFree) return;
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

  const applyCoupon = async () => {
    const code = couponCode.trim();
    if (!code) return;
    setChecking(true);
    try {
      // First the teacher's own coupons.
      if (teacherName) {
        const q = await quoteTeacherPrice(teacherName, price, doc, code);
        if (q?.coupon_status === "ignored_local") {
          toast.info("Your local discount already applies — coupons can't be combined with it.");
          return;
        }
        if (q?.coupon_status === "applied" && q.coupon) {
          if (q.price <= 0 && !onFree) {
            toast.error(`This coupon covers the full price — please contact ${first || "your teacher"} to arrange it directly.`);
            return;
          }
          const label = couponLabel(q);
          setCoupon({ code: q.coupon, discount: q.discount, label, source: "teacher" });
          toast.success(`Coupon applied: ${label}`);
          return;
        }
        if (!q && !holisCouponClassId) {
          toast.error("We couldn't check the coupon — please try again.");
          return;
        }
      }
      // Then, for a class, a Holis coupon.
      if (holisCouponClassId) {
        const res = await validateCoupon(code, price, { classId: holisCouponClassId });
        if (res.valid && res.coupon) {
          const amount = res.discountAmount ?? 0;
          if (price - amount <= 0 && !onFree) {
            toast.error("This coupon covers the full price — please book it from the class page.");
            return;
          }
          const label = describeCouponDiscount(res.coupon, amount);
          setCoupon({ code: res.coupon.code, discount: amount, label, source: "holis" });
          toast.success(`Coupon applied: ${label}`);
          return;
        }
      }
      toast.error(first ? `That code isn't a valid coupon for ${first}.` : "That code isn't a valid coupon.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      <Input placeholder="Your name *" value={form.name} autoComplete="name"
        onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Input type="email" placeholder="Email *" value={form.email} autoComplete="email"
          onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <PhoneField
          id={`${idPrefix}-phone`}
          placeholder="Phone *"
          value={form.phone}
          onChange={(v) => setForm({ ...form, phone: v })}
          invalid={!!form.phone && !isValidPhoneNumber(form.phone)}
        />
      </div>

      <IdDocumentField value={doc} onChange={setDoc} localPct={pct} teacherFirst={first || null} idPrefix={`${idPrefix}-id`} />

      {!local && (
        <div className="space-y-1">
          <label htmlFor={`${idPrefix}-coupon`} className="font-body text-xs font-medium text-muted-foreground">
            {first ? `Have a coupon from ${first}? (optional)` : "Have a coupon? (optional)"}
          </label>
          <div className="flex gap-2">
            <Input
              id={`${idPrefix}-coupon`}
              placeholder="Coupon code"
              value={couponCode}
              disabled={!!coupon}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
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
              <span>{priceLabel ?? (first ? `${first}'s price` : "Price")}</span><span>{money(price)}</span>
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

      {free ? (
        <Button className="w-full rounded-full" disabled={!detailsReady || confirmingFree} onClick={confirmFree}>
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
      {!detailsReady && (
        <p className="font-body text-[11px] text-muted-foreground">
          Please complete your name, email, phone and ID to continue to payment.
        </p>
      )}
      {footer}
    </div>
  );
}

/** Buying one of a teacher's passes online. */
export function TeacherPassCheckout({
  teacherName, membershipId, price, paysTeacher = false, onPaid, idPrefix = "pass", className,
}: {
  teacherName: string;
  membershipId: string;
  /** Her price for the pass. */
  price: number;
  paysTeacher?: boolean;
  onPaid: (email: string) => void;
  idPrefix?: string;
  className?: string;
}) {
  const first = teacherName.split(/\s+/)[0];
  return (
    <OnlinePayForm
      teacherName={teacherName}
      price={price}
      idPrefix={idPrefix}
      className={className}
      onPaid={onPaid}
      onFree={async (f) => {
        // Her coupon covers the whole pass: issued on the server, which checks it again.
        const { data, error } = await (supabase as any).rpc("claim_teacher_pass_with_coupon", {
          _membership_id: membershipId, _guest_name: f.name, _guest_email: f.email, _guest_phone: f.phone,
          _coupon: f.couponCode, _id_document: f.doc.number.trim(), _id_document_type: f.doc.type,
        });
        if (error) throw new Error(error.message);
        // The pass code and booking link, to the student and to her.
        try {
          await supabase.functions.invoke("send-membership-order-email", { body: { userOfferingId: (data as any)?.id } });
        } catch { /* the pass exists; the email can be resent from Admin */ }
      }}
      buildBody={(f) => ({
        kind: "teacher_pass", membership_id: membershipId,
        guest_name: f.name, guest_email: f.email, guest_phone: f.phone,
        ...idDocumentBody(f.doc),
        coupon_code: f.couponCode,
      })}
      footer={(
        <p className="font-body text-[11px] text-muted-foreground">
          {paysTeacher
            ? <>With PayPal or a card. The payment goes straight to {first}'s PayPal — Holis does not take it. </>
            : <>With PayPal or a card, paid to Holis Wellness Center. </>}
          Your pass code and booking link arrive by email right away.
        </p>
      )}
    />
  );
}
