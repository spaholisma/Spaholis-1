import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CalendarDays, Check, Clock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OnlinePayForm } from "@/components/payments/TeacherPassCheckout";
import { EVENT_CATEGORIES } from "@/hooks/useClasses";
import { fetchClosedClassDays, spaDateKey } from "@/lib/classClosures";
import { formatSpaTime, spaLocalParts } from "@/lib/businessHours";
import { idDocumentBody } from "@/lib/localDiscount";
import { cn } from "@/lib/utils";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { classCheckoutReasonMessage } from "@/lib/classBookingWindow";

const sb = supabase as any;
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const usd = (n: number) =>
  `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
/** How far ahead the drop-in list looks. */
const DAYS_AHEAD = 21;

export interface DropInSession {
  id: string;
  start_time: string;
  spots_remaining: number | null;
  instructor: string | null;
  classes: {
    id: string; title: string; instructor: string | null; price: number | null;
    category: string | null; is_active: boolean | null; requires_payment: boolean | null;
  } | null;
}

/** Who teaches a session: the name on it, else the class's usual teacher. */
export const sessionTeacher = (s: DropInSession) => (s.instructor?.trim() || s.classes?.instructor?.trim() || "");

/** "Tue 13 Oct" in studio time. */
export function dropInDate(iso: string): { weekday: string; day: number; month: string } {
  const p = spaLocalParts(new Date(iso));
  return { weekday: WEEKDAY[p.weekday], day: p.day, month: MONTH[p.month0] };
}

/**
 * The sessions a drop-in can be used for: weekly classes (not one-off events),
 * still to come, with a spot left, paid, and not on a day the studio is closed.
 */
export function bookableDropIns(rows: DropInSession[], closed: Set<string>, now = new Date(), classId?: string): DropInSession[] {
  return rows.filter((s) => {
    const c = s.classes;
    if (!c?.is_active) return false;
    if (classId && c.id !== classId) return false;
    if (EVENT_CATEGORIES.has(String(c.category ?? ""))) return false;
    if (!(Number(c.price) > 0) || c.requires_payment === false) return false;
    if (new Date(s.start_time).getTime() <= now.getTime()) return false;
    if (s.spots_remaining != null && Number(s.spots_remaining) <= 0) return false;
    return !closed.has(spaDateKey(s.start_time));
  });
}

/**
 * A drop-in class: choose the class and the date, pay online (to Holis
 * Wellness Center, with PayPal or a card), and the spot is booked. The local
 * discount and coupons work here as on the class page — the server prices it.
 */
export function DropInDialog({ open, onOpenChange, title = "Drop-in Class", classId }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  /** On a class page: only that class's dates. */
  classId?: string;
}) {
  const [rows, setRows] = useState<DropInSession[] | null>(null);
  const [chosen, setChosen] = useState<DropInSession | null>(null);
  const [paidEmail, setPaidEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setChosen(null);
    setPaidEmail(null);
    let alive = true;
    (async () => {
      const now = new Date();
      const until = new Date(now.getTime() + DAYS_AHEAD * 86_400_000);
      const [{ data }, closed] = await Promise.all([
        sb.from("class_schedule")
          .select("id, start_time, spots_remaining, instructor, classes(id, title, instructor, price, category, is_active, requires_payment)")
          .eq("is_cancelled", false)
          .gte("start_time", now.toISOString()).lte("start_time", until.toISOString())
          .order("start_time").limit(200),
        fetchClosedClassDays(),
      ]);
      if (!alive) return;
      setRows(bookableDropIns((data ?? []) as DropInSession[], closed, now, classId));
    })();
    return () => { alive = false; };
  }, [open, classId]);

  const teacher = chosen ? sessionTeacher(chosen) : "";
  const price = Number(chosen?.classes?.price ?? 0);
  const when = useMemo(() => {
    if (!chosen) return "";
    const d = dropInDate(chosen.start_time);
    return `${d.weekday} ${d.day} ${d.month} · ${formatSpaTime(chosen.start_time)}`;
  }, [chosen]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {paidEmail ? "You're booked" : title}
          </DialogTitle>
        </DialogHeader>

        {/* 1. The class and the date. */}
        {!chosen && !paidEmail && (
          <div className="space-y-3">
            <p className="spa-body-sm">
              Choose the class and date you would like to attend. You pay online and receive your
              confirmation by email straight away.
            </p>
            {rows === null ? (
              <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
            ) : rows.length === 0 ? (
              <p className="spa-body-sm rounded-xl border border-border p-4">
                There are no classes open for booking in the next three weeks.{" "}
                <Link to="/classes/schedule" className="text-primary hover:underline">See the full schedule</Link>.
              </p>
            ) : (
              <ul className="space-y-2">
                {rows.map((s) => {
                  const d = dropInDate(s.start_time);
                  const who = sessionTeacher(s);
                  return (
                    <li key={s.id}>
                      <button
                        onClick={() => setChosen(s)}
                        className={cn(
                          "w-full flex items-center gap-3 rounded-xl border border-border p-3 text-left transition-colors",
                          "hover:border-spa-sage/60 hover:bg-spa-sage/5",
                        )}
                      >
                        <span className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-muted/60 leading-none">
                          <span className="font-body text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{d.weekday}</span>
                          <span className="font-heading text-xl font-semibold text-foreground">{d.day}</span>
                          <span className="font-body text-[11px] uppercase text-muted-foreground">{d.month}</span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-body text-sm font-medium text-foreground">{s.classes?.title}</span>
                          <span className="block font-body text-xs text-muted-foreground">
                            <Clock className="h-3 w-3 inline mr-1" />{formatSpaTime(s.start_time)}
                            {who ? <> · with <span className="font-medium text-foreground">{who}</span></> : null}
                          </span>
                        </span>
                        <span className="shrink-0 font-heading text-base font-semibold text-foreground">
                          {usd(Number(s.classes?.price ?? 0))}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {/* 2. Pay online — to Holis Wellness Center. */}
        {chosen && !paidEmail && (
          <div className="space-y-4">
            <button
              onClick={() => setChosen(null)}
              className="font-body text-xs font-semibold uppercase tracking-wider text-primary hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5 inline mr-1" />Choose another class
            </button>

            <div className="rounded-xl border border-spa-sage/40 bg-spa-sage/5 p-4">
              <p className="font-body text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Drop-in class</p>
              <p className="font-heading text-lg font-medium text-foreground">{chosen.classes?.title}</p>
              <p className="font-body text-xs text-muted-foreground">
                <CalendarDays className="h-3 w-3 inline mr-1" />{when}{teacher ? ` · with ${teacher}` : ""}
              </p>
              <p className="font-heading text-2xl font-semibold text-foreground mt-2">{usd(price)}</p>
            </div>

            <OnlinePayForm
              teacherName={teacher}
              price={price}
              priceLabel="Class price"
              holisCouponClassId={chosen.classes?.id}
              idPrefix="drop-in"
              onPaid={(email) => setPaidEmail(email)}
              onFree={async (f) => {
                if (f.couponSource === "holis") {
                  // A Holis coupon: the class-booking function books it at $0 and emails.
                  const res = await invokeEdgeFunction<{ ok?: boolean; reason?: string; message?: string; needsPayment?: boolean }>(
                    "create-class-booking",
                    { body: { schedule_id: chosen.id, guest_name: f.name, guest_email: f.email, guest_phone: f.phone, coupon_code: f.couponCode } },
                  );
                  if (!res.ok || !res.data || res.data.ok === false || res.data.needsPayment) {
                    throw new Error(classCheckoutReasonMessage(res.data?.reason) ?? res.data?.message ?? "We couldn't book it — please try again.");
                  }
                  return;
                }
                // The teacher's coupon covers the class: booked on the server, which checks it again.
                const { data, error } = await sb.rpc("book_class_free_with_teacher_coupon", {
                  _schedule_id: chosen.id, _guest_name: f.name, _guest_email: f.email, _guest_phone: f.phone,
                  _coupon: f.couponCode, _id_document: f.doc.number.trim() || null, _id_document_type: f.doc.number.trim() ? f.doc.type : null,
                });
                if (error) throw new Error(error.message);
                try {
                  await supabase.functions.invoke("send-booking-notification", { body: { classBookingId: data } });
                } catch { /* booked; the confirmation can be resent */ }
              }}
              buildBody={(f) => ({
                kind: "class", schedule_id: chosen.id,
                guest_name: f.name, guest_email: f.email, guest_phone: f.phone,
                coupon_code: f.couponCode,
                ...idDocumentBody(f.doc),
                quantity: 1, participant_names: [f.name], pay_teacher: false,
              })}
              footer={(
                <p className="font-body text-[11px] text-muted-foreground">
                  Secure payment with PayPal or a card, processed by Holis Wellness Center.
                  Your booking confirmation arrives by email right away.
                </p>
              )}
            />
          </div>
        )}

        {/* 3. Booked. */}
        {paidEmail && chosen && (
          <div className="space-y-4 text-center py-2">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-spa-sage/20">
              <Check className="h-6 w-6 text-spa-sage" />
            </div>
            <p className="spa-body">
              Payment received — your place in <strong>{chosen.classes?.title}</strong> on <strong>{when}</strong> is confirmed.
            </p>
            <p className="spa-body-sm">We have sent the confirmation to <strong>{paidEmail}</strong>.</p>
            <Button className="rounded-full" onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
