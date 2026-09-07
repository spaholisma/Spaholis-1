import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Loader2, Users, Search, Download, Ticket, UserPlus, Save, Trash2, Check, Copy,
} from "lucide-react";
import { formatSpaDate } from "@/lib/businessHours";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useConfirm } from "@/hooks/useConfirm";

const sb = supabase as any;
const usd = (n: number) => `$${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface BookingRow {
  id: string; guest_name: string | null; guest_email: string | null; guest_phone: string | null;
  status: string; client_type: string | null; attended: boolean | null;
  class_schedule: { start_time: string; classes: { title: string | null } | null } | null;
}
interface BookRow {
  id: string; name: string; email: string | null; phone: string | null;
  client_type: string | null; note: string | null;
}
interface SoldPass {
  id: string; name_snapshot: string; guest_email: string | null; guest_name: string | null;
  is_unlimited: boolean; credits_remaining: number | null; expires_at: string | null; status: string;
}
interface Pass { id: string; name: string; price: number | null; classes_included: number | null }
interface Student {
  key: string; name: string; email: string; phone: string;
  classes: number; attended: number; last: string | null; type: string | null;
  /** Set when she added them herself — those can be edited or removed. */
  bookId?: string;
  note?: string | null;
}

const blank = () => ({ name: "", email: "", phone: "", client_type: "", note: "", passId: "" });

/**
 * Everyone she teaches, from wherever they came: people who booked into her
 * classes, and people she wrote down herself.
 *
 * Adding one can hand over a pass at the same time — that is the usual way a
 * student appears here before ever booking, and it mints the code and the
 * booking link exactly like the order form does.
 */
export function TeacherStudents({
  teacherId, teacherName, clientTypes,
}: {
  teacherId: string;
  teacherName: string;
  clientTypes: string[];
}) {
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [book, setBook] = useState<BookRow[]>([]);
  const [sold, setSold] = useState<SoldPass[]>([]);
  const [passes, setPasses] = useState<Pass[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(blank());
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [result, setResult] = useState<{ code: string; link: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const { confirm, confirmDialog } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data }, { data: b }, { data: s }, { data: p }] = await Promise.all([
      sb.from("class_bookings")
        .select("id, guest_name, guest_email, guest_phone, status, client_type, attended, class_schedule(start_time, classes(title))")
        .order("created_at", { ascending: false }),
      sb.from("teacher_students").select("id, name, email, phone, client_type, note")
        .eq("teacher_id", teacherId).order("created_at", { ascending: false }),
      sb.from("user_offerings")
        .select("id, name_snapshot, guest_email, guest_name, is_unlimited, credits_remaining, expires_at, status")
        .eq("teacher_id", teacherId),
      sb.from("teacher_memberships").select("id, name, price, classes_included")
        .eq("teacher_id", teacherId).eq("is_active", true).order("price"),
    ]);
    setRows(((data ?? []) as BookingRow[]));
    setBook(((b ?? []) as BookRow[]));
    setSold(((s ?? []) as SoldPass[]));
    setPasses(((p ?? []) as Pass[]));
    setLoading(false);
  }, [teacherId]);
  useEffect(() => { load(); }, [load]);

  const students = useMemo(() => {
    const map = new Map<string, Student>();
    const keyOf = (email: string, name: string) => email || name.toLowerCase();

    // People who have actually been in one of her classes.
    for (const r of rows) {
      if (r.status === "cancelled") continue;
      const email = (r.guest_email ?? "").trim().toLowerCase();
      const name = (r.guest_name ?? "Guest").trim();
      const key = keyOf(email, name);
      const when = r.class_schedule?.start_time ?? null;
      const cur = map.get(key);
      if (cur) {
        cur.classes += 1;
        if (r.attended) cur.attended += 1;
        if (when && (!cur.last || when > cur.last)) cur.last = when;
        if (!cur.type && r.client_type) cur.type = r.client_type;
        if (!cur.phone && r.guest_phone) cur.phone = r.guest_phone;
      } else {
        map.set(key, {
          key, name, email, phone: r.guest_phone ?? "",
          classes: 1, attended: r.attended ? 1 : 0, last: when, type: r.client_type,
        });
      }
    }

    // The ones she wrote down herself, merged onto the same person.
    for (const b of book) {
      const email = (b.email ?? "").trim().toLowerCase();
      const key = keyOf(email, b.name.trim());
      const cur = map.get(key);
      if (cur) {
        cur.bookId = b.id;
        cur.note = b.note;
        if (!cur.phone && b.phone) cur.phone = b.phone;
        if (!cur.type && b.client_type) cur.type = b.client_type;
      } else {
        map.set(key, {
          key, name: b.name, email, phone: b.phone ?? "",
          classes: 0, attended: 0, last: null, type: b.client_type,
          bookId: b.id, note: b.note,
        });
      }
    }

    return [...map.values()].sort((a, b) =>
      (b.last ?? "").localeCompare(a.last ?? "") || a.name.localeCompare(b.name));
  }, [rows, book]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return students;
    return students.filter((s) =>
      s.name.toLowerCase().includes(t) || s.email.includes(t) || s.phone.includes(t));
  }, [students, q]);

  /** The pass she sold this person, if any. */
  const passFor = (s: Student) =>
    sold.find((p) => (p.guest_email ?? "").trim().toLowerCase() === s.email && s.email)
    ?? sold.find((p) => (p.guest_name ?? "").trim().toLowerCase() === s.name.toLowerCase());

  const save = async () => {
    const name = draft.name.trim();
    if (!name) { toast.error("Name is required"); return; }
    if (draft.passId && !draft.email.trim()) {
      toast.error("An email is needed to send the pass");
      return;
    }
    setSaving(true);

    if (editing?.bookId) {
      const { error } = await sb.from("teacher_students").update({
        name, email: draft.email.trim() || null, phone: draft.phone.trim() || null,
        client_type: draft.client_type || null, note: draft.note.trim() || null,
      }).eq("id", editing.bookId);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success("Saved");
    } else {
      const { error } = await sb.from("teacher_students").insert({
        teacher_id: teacherId, name,
        email: draft.email.trim() || null, phone: draft.phone.trim() || null,
        client_type: draft.client_type || null, note: draft.note.trim() || null,
      });
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success(`${name} added`);
    }

    // Handing over a pass at the same time: same code and link as an order.
    if (draft.passId) {
      const { data, error } = await sb.rpc("create_teacher_membership_order", {
        _membership_id: draft.passId,
        _guest_name: name,
        _guest_email: draft.email.trim(),
        _guest_phone: draft.phone.trim() || null,
        _notes: `Sold by ${teacherName}`,
      });
      if (error) toast.error(error.message);
      else {
        const res = data as any;
        setResult({ code: res.code, link: `${window.location.origin}/classes?m=${res.access_token}` });
        toast.success(`Pass created — code ${res.code}`);
        sb.functions.invoke("send-membership-order-email", { body: { userOfferingId: res.id } })
          .then(({ error: mailErr }: any) => mailErr
            ? toast.warning("Pass created, but the email did not send — share the link yourself.")
            : toast.success("Email sent to your student."))
          .catch(() => toast.warning("Pass created, but the email did not send — share the link yourself."));
      }
    }

    if (!draft.passId) { setOpen(false); setEditing(null); }
    setDraft(blank());
    setSaving(false);
    load();
  };

  const remove = async (s: Student) => {
    if (!s.bookId) return;
    if (!(await confirm({
      title: `Remove ${s.name} from your list?`,
      description: "Their class history stays — only the entry you wrote is removed.",
      confirmLabel: "Remove", destructive: true,
    }))) return;
    const { error } = await sb.from("teacher_students").delete().eq("id", s.bookId);
    if (error) toast.error(error.message); else { toast.success("Removed"); load(); }
  };

  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [
      ["Student", "Email", "Phone", "Classes", "Attended", "Last class", "Type", "Pass"].join(","),
      ...students.map((s) => {
        const p = passFor(s);
        return [
          esc(s.name), esc(s.email), esc(s.phone), s.classes, s.attended,
          esc(s.last ? formatSpaDate(s.last) : ""), esc(s.type),
          esc(p ? `${p.name_snapshot}${p.is_unlimited ? "" : ` (${p.credits_remaining} left)`}` : ""),
        ].join(",");
      }),
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "my-students.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <h3 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
          <Users className="h-4 w-4" /> My students ({students.length})
        </h3>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => { setEditing(null); setDraft(blank()); setResult(null); setOpen(true); }}>
            <UserPlus className="h-4 w-4 mr-1" /> Add student
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!students.length}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
        </div>
      </div>
      <p className="font-body text-xs text-muted-foreground mb-3">
        Everyone who has been in one of your classes, plus anyone you add yourself — with a pass
        if you are handing one over.
      </p>

      <div className="relative mb-4">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search by name, email or phone" value={q}
          onChange={(e) => setQ(e.target.value)} className="pl-9 h-9" />
      </div>

      {loading ? (
        <div className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
      ) : shown.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {students.length ? "Nobody matches that search." : "No students yet — add the first one."}
        </p>
      ) : (
        <div className="space-y-2">
          {shown.map((s) => {
            const pass = passFor(s);
            return (
              <div key={s.key} className="rounded-lg border border-border p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-body text-sm font-medium text-foreground truncate">{s.name}</p>
                  {s.email && <p className="font-body text-xs text-muted-foreground truncate">{s.email}</p>}
                  {s.phone && <p className="font-body text-xs text-muted-foreground">{s.phone}</p>}
                  <p className="font-body text-[11px] text-muted-foreground mt-1">
                    {s.classes === 0
                      ? "Added by you · no classes yet"
                      : <>{s.classes} class{s.classes === 1 ? "" : "es"} · {s.attended} attended</>}
                    {s.last && <> · last {formatSpaDate(s.last)}</>}
                  </p>
                  {s.note && <p className="font-body text-[11px] text-muted-foreground mt-0.5">{s.note}</p>}
                  {pass && (
                    <span className={cn(
                      "mt-1.5 inline-block rounded-full px-2 py-1 text-[11px] font-medium",
                      pass.status === "active"
                        ? "bg-sky-500/15 text-sky-700 dark:text-sky-400"
                        : "bg-muted text-muted-foreground",
                    )}>
                      <Ticket className="h-3 w-3 inline mr-1" />
                      {pass.name_snapshot}
                      {pass.is_unlimited
                        ? " · unlimited"
                        : pass.credits_remaining != null ? ` · ${pass.credits_remaining} left` : ""}
                      {pass.status !== "active" && ` · ${pass.status}`}
                    </span>
                  )}
                  {s.bookId && (
                    <span className="mt-1 flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditing(s);
                          setDraft({
                            name: s.name, email: s.email, phone: s.phone,
                            client_type: s.type ?? "", note: s.note ?? "", passId: "",
                          });
                          setResult(null);
                          setOpen(true);
                        }}
                        className="font-body text-[11px] font-semibold uppercase tracking-wider text-primary hover:underline"
                      >
                        Edit
                      </button>
                      <button onClick={() => remove(s)}
                        className="font-body text-[11px] font-semibold uppercase tracking-wider text-destructive hover:underline">
                        Remove
                      </button>
                    </span>
                  )}
                </div>
                {s.type && (
                  <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
                    {s.type}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add / edit a student */}
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditing(null); setResult(null); } }}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {result ? "Pass is ready" : editing ? `Edit ${editing.name}` : "Add a student"}
            </DialogTitle>
          </DialogHeader>

          {result ? (
            <div className="space-y-3">
              <p className="spa-body-sm">
                The code and the booking link went to your student by email — here they are as well.
              </p>
              <div className="rounded-lg border border-border p-3">
                <p className="font-body text-[11px] uppercase tracking-wide text-muted-foreground">Code</p>
                <p className="font-heading text-2xl font-semibold text-foreground">{result.code}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="font-body text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Booking link</p>
                <p className="font-body text-xs text-muted-foreground break-all">{result.link}</p>
                <Button size="sm" variant="outline" className="mt-2"
                  onClick={() => {
                    navigator.clipboard?.writeText(result.link);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}>
                  {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                  {copied ? "Copied" : "Copy link"}
                </Button>
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={() => { setResult(null); setOpen(false); }}>Done</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <Input autoFocus placeholder="Name *" value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Input placeholder="Email" value={draft.email}
                  onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
                <Input placeholder="Phone" value={draft.phone}
                  onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
              </div>
              <select value={draft.client_type}
                onChange={(e) => setDraft({ ...draft, client_type: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                <option value="">Student type…</option>
                {clientTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <Input placeholder="A note about them (optional)" value={draft.note}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })} />

              {/* Handing over a pass right away */}
              <div className="rounded-lg border border-spa-sage/40 bg-spa-sage/5 p-3">
                <label className="font-body text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Give them a pass now
                </label>
                <select value={draft.passId}
                  onChange={(e) => setDraft({ ...draft, passId: e.target.value })}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm mt-1">
                  <option value="">No pass for now</option>
                  {passes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.price != null ? ` — ${usd(Number(p.price))}` : ""}
                      {p.classes_included == null ? " · unlimited" : ` · ${p.classes_included} classes`}
                    </option>
                  ))}
                </select>
                <p className="font-body text-[11px] text-muted-foreground mt-1.5">
                  Only if she has already paid you. She gets a code and a booking link by email,
                  and can book your classes with it. Needs her email.
                </p>
              </div>

              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
                <Button size="sm" onClick={save} disabled={saving || !draft.name.trim()}>
                  {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                  {editing ? "Save" : "Add"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {confirmDialog}
    </Card>
  );
}
