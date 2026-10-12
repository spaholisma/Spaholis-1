import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  BadgeCheck, CalendarClock, CalendarPlus, CalendarX, IdCard, Loader2, Mail, MapPin, Phone, Ticket, Trash2, Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatCRCWithUsd, USD_RATE } from "@/lib/currency";
import { formatSpaDate, formatSpaTime } from "@/lib/businessHours";
import { crToUtc, utcToCr } from "@/components/teacher/ClassFormDialog";
import { TeacherPrivateOfferingsEditor } from "@/components/teacher/TeacherPrivateOfferingsEditor";
import { useConfirm } from "@/hooks/useConfirm";
import { useReasonPrompt } from "@/hooks/useReasonPrompt";

const sb = supabase as any;

export interface RequestRow {
  booking_id: string;
  created_at: string;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  kind_title: string | null;
  people: number | null;
  class_title: string | null;
  preferred: string | null;
  status: string;
  note: string | null;
  /** Her price for what they asked — after her local discount or coupon — worked out on the server. */
  quoted_price: number | null;
  /** Where they would like it: studio, their place (with the address) or the beach. */
  location_label?: string | null;
  location_address?: string | null;
  /** Her price before the discount, and which discount it was. */
  list_price?: number | null;
  local_discount?: boolean | null;
  coupon_code?: string | null;
  /** The guest's ID (a Costa Rican cédula she may check). */
  id_document?: string | null;
  id_document_type?: string | null;
  /** On her calendar, when she has put it there. */
  session_id?: string | null;
  session_starts_at?: string | null;
  session_minutes?: number | null;
}

const STATUSES = [
  { value: "new", label: "New" },
  { value: "replied", label: "I replied" },
  { value: "scheduled", label: "Scheduled" },
  { value: "declined", label: "Can't take it" },
] as const;

const statusColor: Record<string, string> = {
  new: "bg-blue-100 text-blue-800",
  replied: "bg-yellow-100 text-yellow-800",
  scheduled: "bg-green-100 text-green-800",
  declined: "bg-muted text-muted-foreground",
  cancelled: "bg-red-100 text-red-800",
};
/** Every status a request can show — "Cancelled" is set only by cancelling it. */
export const statusLabel = (status: string) =>
  status === "cancelled" ? "Cancelled" : STATUSES.find((s) => s.value === status)?.label ?? status;
/** Still on: it can be put on the calendar, moved or cancelled. */
export const privateClassOpen = (status: string) => status !== "declined" && status !== "cancelled";

/**
 * Cancel one of her private classes with a reason: off her calendar, and the
 * guest, she and Holis are emailed (teacher_cancel_private_class).
 */
async function cancelPrivateClass(
  askReason: ReturnType<typeof useReasonPrompt>["askReason"],
  bookingId: string, guestName: string | null,
): Promise<boolean> {
  const a = await askReason({
    title: "Cancel this private class?",
    description: `${guestName || "The guest"}, you and Holis will be emailed with your reason. It comes off your calendar.`,
    confirmLabel: "Cancel the private class",
    placeholder: "e.g. I am unwell / the guest asked to cancel / the place is not available",
  });
  if (!a) return false;
  const { error } = await sb.rpc("teacher_cancel_private_class", { _booking_id: bookingId, _reason: a.reason });
  if (error) { toast.error(error.message); return false; }
  toast.success("Private class cancelled — the guest and Holis have been emailed");
  return true;
}

const usd = (n: number) => formatCRCWithUsd(Number(n) * USD_RATE);

/** What goes on the calendar for a request: the class (or the kind) and the guest. */
export const sessionTitle = (r: Pick<RequestRow, "class_title" | "kind_title" | "guest_name">) =>
  [r.class_title || r.kind_title || "Private class", r.guest_name].filter(Boolean).join(" · ");

/** Where it happens, as one line for the calendar. */
export const sessionLocation = (r: Pick<RequestRow, "location_label" | "location_address">) =>
  [r.location_label, r.location_address].filter(Boolean).join(": ");

/**
 * Private classes for a teacher: her own private classes and prices, and the
 * requests that named her. She answers the guest by email or WhatsApp and,
 * once they have agreed a day, puts it on her calendar from the request.
 */
export function TeacherPrivateClasses({ teacherId, teacherName, choices = [] }: {
  teacherId: string; teacherName: string;
  /** The private classes the team added for her to pick by name. */
  choices?: string[] | null;
}) {
  const [rows, setRows] = useState<RequestRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [scheduling, setScheduling] = useState<RequestRow | null>(null);
  const { confirm, confirmDialog } = useConfirm();
  const { askReason, reasonDialog } = useReasonPrompt();

  const load = useCallback(async () => {
    const { data, error } = await sb.rpc("teacher_private_class_requests");
    if (error) { toast.error(error.message); setRows([]); return; }
    const list = (data as RequestRow[]) ?? [];
    setRows(list);
    setNotes(Object.fromEntries(list.map((r) => [r.booking_id, r.note ?? ""])));
  }, []);

  useEffect(() => { load(); }, [load]);

  const setStatus = async (row: RequestRow, status: string) => {
    setBusy(row.booking_id);
    const { error } = await sb.rpc("teacher_set_private_class_status", {
      _booking_id: row.booking_id,
      _status: status,
      _note: notes[row.booking_id] ?? "",
    });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(status === "declined" ? "Marked — please tell Holis too" : "Saved");
    load();
  };

  const removeFromCalendar = async (row: RequestRow) => {
    if (!row.session_id) return;
    if (!(await confirm({
      title: "Take it off your calendar?",
      description: "The request stays here; only the date on your calendar is removed.",
      confirmLabel: "Remove it",
      destructive: true,
    }))) return;
    setBusy(row.booking_id);
    const { error } = await sb.rpc("teacher_remove_private_session", { _id: row.session_id });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Removed from your calendar");
    load();
  };

  return (
    <div className="space-y-4">
      {/* Her private classes and her prices. */}
      <TeacherPrivateOfferingsEditor teacherId={teacherId} teacherName={teacherName} choices={choices} />

      {/* The requests that named her. */}
      <Card className="p-5">
        <h4 className="font-heading text-base text-foreground">Requests for you</h4>
        {rows === null ? (
          <p className="py-6 text-center font-body text-sm text-muted-foreground">
            <Loader2 className="inline h-4 w-4 mr-2 animate-spin" /> Loading…
          </p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center font-body text-sm text-muted-foreground">
            No private class requests yet. When a guest picks you on the website, it lands here and in your email.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {rows.map((r) => {
              const discounted = r.list_price != null && r.quoted_price != null
                && Number(r.quoted_price) < Number(r.list_price);
              return (
                <div key={r.booking_id} className="rounded-xl border border-border p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-body text-sm font-medium text-foreground">{r.guest_name || "Guest"}</p>
                        <Badge className={cn("capitalize", statusColor[r.status] || "")}>
                          {statusLabel(r.status)}
                        </Badge>
                      </div>
                      <p className="font-body text-xs text-muted-foreground">
                        {r.kind_title || "Private class"}
                        {r.class_title ? ` · ${r.class_title}` : ""}
                        {r.people ? ` · ${r.people} ${r.people === 1 ? "person" : "people"}` : ""}
                        {r.quoted_price != null ? ` · ${usd(Number(r.quoted_price))}` : ""}
                        {discounted ? ` (instead of ${usd(Number(r.list_price))})` : ""}
                      </p>
                    </div>
                    <p className="shrink-0 font-body text-xs text-muted-foreground">
                      {format(new Date(r.created_at), "MMM d, yyyy")}
                    </p>
                  </div>

                  {r.local_discount && (
                    <p className="flex items-center gap-1.5 font-body text-xs text-spa-sage">
                      <BadgeCheck className="h-3.5 w-3.5 shrink-0" />
                      Local discount — Costa Rican cédula. Please check it in class.
                    </p>
                  )}
                  {r.coupon_code && (
                    <p className="flex items-center gap-1.5 font-body text-xs text-spa-sage">
                      <Ticket className="h-3.5 w-3.5 shrink-0" /> Your coupon {r.coupon_code}
                    </p>
                  )}
                  {r.id_document && (
                    <p className="flex items-center gap-1.5 font-body text-xs text-muted-foreground">
                      <IdCard className="h-3.5 w-3.5 shrink-0" />
                      {r.id_document_type === "cr_cedula" ? "Costa Rican cédula" : "Passport / other ID"} {r.id_document}
                    </p>
                  )}

                  {r.location_label && (
                    <p className="flex items-center gap-1.5 font-body text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      {r.location_label}{r.location_address ? `: ${r.location_address}` : ""}
                    </p>
                  )}

                  {r.preferred && (
                    <p className="flex items-center gap-1.5 font-body text-xs text-muted-foreground">
                      <CalendarClock className="h-3.5 w-3.5" /> Prefers: {r.preferred}
                    </p>
                  )}

                  {r.session_starts_at && (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-spa-sage/10 px-3 py-2">
                      <CalendarPlus className="h-4 w-4 text-spa-sage" />
                      <p className="font-body text-xs text-foreground">
                        <strong>On your calendar:</strong> {formatSpaDate(r.session_starts_at)} · {formatSpaTime(r.session_starts_at)}
                        {r.session_minutes ? ` · ${r.session_minutes} min` : ""}
                      </p>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {r.guest_email && (
                      <Button asChild size="sm" variant="outline">
                        <a href={`mailto:${r.guest_email}?subject=${encodeURIComponent(`Your private class at Holis`)}`}>
                          <Mail className="h-4 w-4 mr-1.5" /> {r.guest_email}
                        </a>
                      </Button>
                    )}
                    {r.guest_phone && (
                      <Button asChild size="sm" variant="outline">
                        <a href={`https://wa.me/${r.guest_phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">
                          <Phone className="h-4 w-4 mr-1.5" /> {r.guest_phone}
                        </a>
                      </Button>
                    )}
                  </div>

                  <Textarea
                    value={notes[r.booking_id] ?? ""}
                    onChange={(e) => setNotes({ ...notes, [r.booking_id]: e.target.value })}
                    rows={2}
                    placeholder="Your note — what you agreed, or why you can't take it"
                  />
                  <div className="flex flex-wrap gap-2">
                    {STATUSES.map((s) => (
                      <Button
                        key={s.value}
                        size="sm"
                        variant={r.status === s.value ? "default" : "outline"}
                        disabled={busy === r.booking_id}
                        onClick={() => setStatus(r, s.value)}
                        className="text-xs"
                      >
                        {busy === r.booking_id && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                        {s.label}
                      </Button>
                    ))}
                  </div>

                  {/* Agreed with the guest: put it on her calendar — or cancel it. */}
                  {privateClassOpen(r.status) && (
                    <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                      <Button size="sm" className="text-xs" disabled={busy === r.booking_id} onClick={() => setScheduling(r)}>
                        <CalendarPlus className="h-3.5 w-3.5 mr-1.5" />
                        {r.session_id ? "Change the date" : "Add to my calendar"}
                      </Button>
                      {r.session_id && (
                        <Button size="sm" variant="ghost" className="text-xs text-destructive hover:bg-destructive/10"
                          disabled={busy === r.booking_id} onClick={() => removeFromCalendar(r)}>
                          <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Remove from calendar
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="text-xs text-destructive hover:bg-destructive/10"
                        disabled={busy === r.booking_id}
                        onClick={async () => {
                          setBusy(r.booking_id);
                          if (await cancelPrivateClass(askReason, r.booking_id, r.guest_name)) await load();
                          setBusy(null);
                        }}>
                        <CalendarX className="h-3.5 w-3.5 mr-1.5" /> Cancel this private class
                      </Button>
                    </div>
                  )}
                  <p className="flex items-center gap-1.5 font-body text-[11px] text-muted-foreground">
                    <Users className="h-3 w-3" /> Holis got this request too — keep them in the loop on what you agree.
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <SchedulePrivateClassDialog
        row={scheduling}
        onOpenChange={(o) => !o && setScheduling(null)}
        onSaved={() => { setScheduling(null); load(); }}
      />
      {confirmDialog}
      {reasonDialog}
    </div>
  );
}

/**
 * Put an agreed private class on her calendar: the day, the time and how long.
 * It shows only on the teachers' calendar — never on the public schedule.
 */
export function SchedulePrivateClassDialog({ row, onOpenChange, onSaved }: {
  row: RequestRow | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({ day: "", time: "", minutes: "60", title: "", location: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!row) return;
    const at = row.session_starts_at ? utcToCr(row.session_starts_at) : null;
    setForm({
      day: at?.day ?? "",
      time: at?.time ?? "",
      minutes: String(row.session_minutes ?? 60),
      title: sessionTitle(row),
      location: sessionLocation(row),
    });
  }, [row]);

  if (!row) return null;
  const startsAt = crToUtc(form.day, form.time);
  const minutes = Number(form.minutes);
  const ready = !!startsAt && Number.isFinite(minutes) && minutes >= 15 && minutes <= 480;

  const save = async () => {
    if (!ready) return;
    setSaving(true);
    const { error } = await sb.rpc("teacher_schedule_private_class", {
      _booking_id: row.booking_id,
      _starts_at: startsAt,
      _duration_minutes: minutes,
      _title: form.title.trim(),
      _location: form.location.trim(),
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("On your calendar");
    onSaved();
  };

  return (
    <Dialog open={!!row} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {row.session_id ? "Change the date" : "Add to my calendar"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="font-body text-xs text-muted-foreground">
            The day and time you agreed with {row.guest_name || "the guest"}. It appears only on the
            teachers' calendar in this panel — never on the public class schedule.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="font-body text-xs font-medium text-muted-foreground">Day *</span>
              <Input type="date" value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} />
            </label>
            <label className="space-y-1">
              <span className="font-body text-xs font-medium text-muted-foreground">Time *</span>
              <Input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="font-body text-xs font-medium text-muted-foreground">Length (minutes) *</span>
            <Input type="number" min={15} max={480} step={15} value={form.minutes}
              onChange={(e) => setForm({ ...form, minutes: e.target.value })} />
          </label>
          <label className="block space-y-1">
            <span className="font-body text-xs font-medium text-muted-foreground">What it says on the calendar</span>
            <Input value={form.title} maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </label>
          <label className="block space-y-1">
            <span className="font-body text-xs font-medium text-muted-foreground">Where</span>
            <Input value={form.location} maxLength={300} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </label>
          {/^holis wellness studio/i.test(form.location) && (
            <p className="font-body text-[11px] text-muted-foreground">
              At the studio: please confirm with Holis Wellness Center that the studio is free at this time.
            </p>
          )}
          <Button className="w-full" onClick={save} disabled={!ready || saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CalendarPlus className="h-4 w-4 mr-1.5" />}
            {row.session_id ? "Save the new date" : "Add to my calendar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** What the calendar knows about one of her private classes. */
export interface PrivateSessionRef {
  id: string; booking_id: string | null; starts_at: string; duration_minutes: number;
  title: string; location: string | null; guest_name: string | null; people: number | null;
}

/**
 * One of her private classes, opened from the teachers' calendar: when and
 * where, the guest and how to reach them, the price and the ID — everything
 * from the request — plus changing the date or taking it off the calendar.
 */
export function PrivateSessionDialog({ slot, onOpenChange, onChanged }: {
  slot: PrivateSessionRef | null;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const [row, setRow] = useState<RequestRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [scheduling, setScheduling] = useState<RequestRow | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const { confirm, confirmDialog } = useConfirm();
  const { askReason, reasonDialog } = useReasonPrompt();

  useEffect(() => {
    setRow(null);
    if (!slot?.booking_id) return;
    let live = true;
    setLoading(true);
    sb.rpc("teacher_private_class_requests").then(({ data, error }: { data: RequestRow[] | null; error: any }) => {
      if (!live) return;
      setLoading(false);
      if (error) { toast.error(error.message); return; }
      setRow((data ?? []).find((r) => r.booking_id === slot.booking_id) ?? null);
    });
    return () => { live = false; };
  }, [slot]);

  if (!slot) return null;
  const end = new Date(new Date(slot.starts_at).getTime() + (slot.duration_minutes || 60) * 60000).toISOString();
  const discounted = !!row && row.list_price != null && row.quoted_price != null
    && Number(row.quoted_price) < Number(row.list_price);
  const people = row?.people ?? slot.people;

  const remove = async () => {
    if (!(await confirm({
      title: "Take it off your calendar?",
      description: "The request stays in Private classes; only the date on your calendar is removed.",
      confirmLabel: "Remove it",
      destructive: true,
    }))) return;
    setRemoving(true);
    const { error } = await sb.rpc("teacher_remove_private_session", { _id: slot.id });
    setRemoving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Removed from your calendar");
    onOpenChange(false);
    onChanged();
  };

  const line = "flex items-start gap-2 font-body text-sm text-foreground";
  const icon = "h-4 w-4 mt-0.5 shrink-0 text-violet-600";

  return (
    <Dialog open={!!slot} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <p className="font-body text-[11px] font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">
            Your private class
          </p>
          <DialogTitle className="font-heading leading-snug">{slot.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2.5">
          <p className={line}>
            <CalendarClock className={icon} />
            <span>
              {formatSpaDate(slot.starts_at)} · {formatSpaTime(slot.starts_at)} – {formatSpaTime(end)}
              <span className="text-muted-foreground"> ({slot.duration_minutes || 60} min)</span>
            </span>
          </p>
          {slot.location && (
            <p className={line}><MapPin className={icon} /><span>{slot.location}</span></p>
          )}
          {/^holis wellness studio/i.test(slot.location ?? "") && (
            <p className="pl-6 font-body text-[11px] text-muted-foreground">
              At the studio: please confirm with Holis Wellness Center that the studio is free at this time.
            </p>
          )}
          <p className={line}>
            <Users className={icon} />
            <span>
              {row?.guest_name || slot.guest_name || "Guest"}
              {people ? <span className="text-muted-foreground"> · {people} {people === 1 ? "person" : "people"}</span> : null}
            </span>
          </p>

          {loading && (
            <p className="py-2 font-body text-xs text-muted-foreground">
              <Loader2 className="inline h-3.5 w-3.5 mr-1.5 animate-spin" /> Loading the request…
            </p>
          )}

          {row && (
            <>
              {(row.kind_title || row.class_title) && (
                <p className="pl-6 font-body text-xs text-muted-foreground">
                  {[row.kind_title, row.class_title].filter(Boolean).join(" · ")}
                </p>
              )}
              {row.quoted_price != null && (
                <p className="pl-6 font-body text-sm text-foreground">
                  <strong>{usd(Number(row.quoted_price))}</strong>
                  {discounted && <span className="text-muted-foreground"> (instead of {usd(Number(row.list_price))})</span>}
                </p>
              )}
              {row.local_discount && (
                <p className="flex items-center gap-1.5 pl-6 font-body text-xs text-spa-sage">
                  <BadgeCheck className="h-3.5 w-3.5 shrink-0" />
                  Local discount — Costa Rican cédula. Please check it in class.
                </p>
              )}
              {row.coupon_code && (
                <p className="flex items-center gap-1.5 pl-6 font-body text-xs text-spa-sage">
                  <Ticket className="h-3.5 w-3.5 shrink-0" /> Your coupon {row.coupon_code}
                </p>
              )}
              {row.id_document && (
                <p className={line}>
                  <IdCard className={icon} />
                  <span>
                    {row.id_document_type === "cr_cedula" ? "Costa Rican cédula" : "Passport / other ID"} {row.id_document}
                  </span>
                </p>
              )}
              {row.preferred && (
                <p className="pl-6 font-body text-xs text-muted-foreground">They first asked for: {row.preferred}</p>
              )}
              {row.note && (
                <div className="rounded-lg bg-muted/60 px-3 py-2 font-body text-xs text-foreground">
                  <strong>Your note:</strong> {row.note}
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                {row.guest_email && (
                  <Button asChild size="sm" variant="outline" className="max-w-full">
                    <a href={`mailto:${row.guest_email}?subject=${encodeURIComponent("Your private class at Holis")}`}>
                      <Mail className="h-4 w-4 mr-1.5 shrink-0" /><span className="truncate">{row.guest_email}</span>
                    </a>
                  </Button>
                )}
                {row.guest_phone && (
                  <Button asChild size="sm" variant="outline">
                    <a href={`https://wa.me/${row.guest_phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">
                      <Phone className="h-4 w-4 mr-1.5" /> {row.guest_phone}
                    </a>
                  </Button>
                )}
              </div>
              <p className="font-body text-[11px] text-muted-foreground">
                Request received {format(new Date(row.created_at), "MMM d, yyyy")} · also in <strong>Private classes</strong>.
              </p>
            </>
          )}

          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            {row && (
              <Button size="sm" className="text-xs" onClick={() => setScheduling(row)}>
                <CalendarPlus className="h-3.5 w-3.5 mr-1.5" /> Change the date
              </Button>
            )}
            <Button size="sm" variant="ghost" className="text-xs text-destructive hover:bg-destructive/10"
              disabled={removing} onClick={remove}>
              {removing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 mr-1.5" />}
              Remove from calendar
            </Button>
            {slot.booking_id && (
              <Button size="sm" variant="ghost" className="text-xs text-destructive hover:bg-destructive/10"
                disabled={cancelling}
                onClick={async () => {
                  setCancelling(true);
                  const done = await cancelPrivateClass(askReason, slot.booking_id!, row?.guest_name ?? slot.guest_name);
                  setCancelling(false);
                  if (done) { onOpenChange(false); onChanged(); }
                }}>
                {cancelling ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <CalendarX className="h-3.5 w-3.5 mr-1.5" />}
                Cancel this private class
              </Button>
            )}
          </div>
          <p className="font-body text-[11px] text-muted-foreground">
            Remove from calendar only takes the date off your calendar. Cancel tells the guest and Holis, with your reason.
          </p>
        </div>

        <SchedulePrivateClassDialog
          row={scheduling}
          onOpenChange={(o) => !o && setScheduling(null)}
          onSaved={() => { setScheduling(null); onOpenChange(false); onChanged(); }}
        />
        {confirmDialog}
        {reasonDialog}
      </DialogContent>
    </Dialog>
  );
}
