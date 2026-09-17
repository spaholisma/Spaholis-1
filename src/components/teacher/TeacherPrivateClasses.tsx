import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { CalendarClock, Loader2, Mail, Phone, Save, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatCRCWithUsd, USD_RATE } from "@/lib/currency";
import { useSiteContent } from "@/hooks/useSiteContent";
import { content as defaults } from "@/data/content";
import { privatePriceUsd, privatePricing } from "@/lib/otherOfferings";

const sb = supabase as any;

interface RequestRow {
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
};

/**
 * Private classes for a teacher: the requests that named her (she answers the
 * guest by email), her own note about what she offers, and the studio's prices
 * — read-only, because Holis sets those.
 */
export function TeacherPrivateClasses({ teacherId, note }: { teacherId: string; note: string | null }) {
  const [rows, setRows] = useState<RequestRow[] | null>(null);
  const [draftNote, setDraftNote] = useState(note ?? "");
  const [savingNote, setSavingNote] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const { data: siteContent } = useSiteContent();
  const ps: any = (siteContent as any)?.privateSessions || defaults.privateSessions;
  const pricing = privatePricing(ps);

  const load = useCallback(async () => {
    const { data, error } = await sb.rpc("teacher_private_class_requests");
    if (error) { toast.error(error.message); setRows([]); return; }
    const list = (data as RequestRow[]) ?? [];
    setRows(list);
    setNotes(Object.fromEntries(list.map((r) => [r.booking_id, r.note ?? ""])));
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveNote = async () => {
    setSavingNote(true);
    const { error } = await sb.from("teachers").update({ private_class_note: draftNote.trim() || null }).eq("id", teacherId);
    setSavingNote(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved");
  };

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

  const priceRows = [
    { label: "1 person", value: pricing.onePerson },
    { label: "2 people", value: pricing.twoPeople },
    { label: "Up to 4", value: pricing.upToFour },
    { label: "Each extra person", value: pricing.extraPerson },
  ];

  return (
    <div className="space-y-4">
      {/* What the studio charges — hers to know, not to change. */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-heading text-lg text-foreground">Private classes</h3>
            <p className="font-body text-xs text-muted-foreground">
              Guests ask for a private class on the website and can pick you. Holis sets the prices; you agree the day and time with the guest.
            </p>
          </div>
          <Badge variant="secondary" className="shrink-0">Prices set by Holis</Badge>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {priceRows.map((p) => (
            <div key={p.label} className="rounded-xl border border-border bg-background p-3 text-center">
              <p className="font-heading text-lg font-semibold text-foreground">{formatCRCWithUsd(p.value * USD_RATE)}</p>
              <p className="font-body text-[11px] text-muted-foreground">{p.label}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 font-body text-[11px] text-muted-foreground">
          A group of 6, for example, pays ${privatePriceUsd(6, pricing)} — up to 4 plus 2 extra people.
        </p>
      </Card>

      {/* Her own words: what she offers privately. */}
      <Card className="p-5 space-y-3">
        <div>
          <h4 className="font-heading text-base text-foreground">What you offer privately</h4>
          <p className="font-body text-xs text-muted-foreground">
            Your own note — what you teach one-on-one, for couples or for a group, and the days you usually have free. The Holis team reads it when a guest asks for you.
          </p>
        </div>
        <Textarea
          value={draftNote}
          onChange={(e) => setDraftNote(e.target.value)}
          rows={4}
          placeholder="e.g. One-on-one and couples Vinyasa, mornings before 10am; aerial only on Thursdays."
        />
        <Button size="sm" onClick={saveNote} disabled={savingNote}>
          {savingNote ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />} Save
        </Button>
      </Card>

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
            {rows.map((r) => (
              <div key={r.booking_id} className="rounded-xl border border-border p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-body text-sm font-medium text-foreground">{r.guest_name || "Guest"}</p>
                      <Badge className={cn("capitalize", statusColor[r.status] || "")}>
                        {STATUSES.find((s) => s.value === r.status)?.label ?? r.status}
                      </Badge>
                    </div>
                    <p className="font-body text-xs text-muted-foreground">
                      {r.kind_title || "Private class"}
                      {r.class_title ? ` · ${r.class_title}` : ""}
                      {r.people ? ` · ${r.people} ${r.people === 1 ? "person" : "people"}` : ""}
                    </p>
                  </div>
                  <p className="shrink-0 font-body text-xs text-muted-foreground">
                    {format(new Date(r.created_at), "MMM d, yyyy")}
                  </p>
                </div>

                {r.preferred && (
                  <p className="flex items-center gap-1.5 font-body text-xs text-muted-foreground">
                    <CalendarClock className="h-3.5 w-3.5" /> Prefers: {r.preferred}
                  </p>
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
                <p className="flex items-center gap-1.5 font-body text-[11px] text-muted-foreground">
                  <Users className="h-3 w-3" /> Holis got this request too — keep them in the loop on what you agree.
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
