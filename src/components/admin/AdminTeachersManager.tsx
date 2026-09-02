import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  ChevronLeft, ChevronRight, Loader2, Plus, Trash2, Link2, Users,
  Wallet, ChevronDown, ChevronUp, Download, AlertTriangle, HandCoins, Check,
} from "lucide-react";
import {
  format, startOfMonth, endOfMonth, addMonths, subMonths, addDays, subDays, parseISO, isSameMonth,
} from "date-fns";
import { formatSpaDate, formatSpaTime, spaMonthKey } from "@/lib/businessHours";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useConfirm } from "@/hooks/useConfirm";

const sb = supabase as any;
const usd = (n: number) => `$${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const norm = (s: string) => (s ?? "").trim().toLowerCase();
const todayCR = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica" }).format(new Date());

interface Teacher {
  id: string; user_id: string | null; email: string; display_name: string;
  payment_instructions: string | null; studio_rate: number; active: boolean;
}
interface Session {
  id: string; start_time: string; is_cancelled: boolean; instructor: string | null;
  classes: { title: string | null; instructor: string | null } | null;
}
interface Charge { id: string; teacher_id: string; ym: string; paid: boolean; note: string | null; }
interface Payment {
  id: string; teacher_id: string; ym: string; amount: number;
  paid_on: string; method: string | null; note: string | null;
}

/** A session's teacher: per-session name wins, else the class template's. */
const teacherOf = (s: Session) => norm(s.instructor || s.classes?.instructor || "");

export function AdminTeachersManager() {
  const [month, setMonth] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});   // students per session
  const [charges, setCharges] = useState<Charge[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [payingFor, setPayingFor] = useState<string | null>(null);
  const [payDraft, setPayDraft] = useState({ amount: "", paid_on: todayCR(), method: "cash", note: "" });
  const [savingPay, setSavingPay] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const { confirm, confirmDialog } = useConfirm();

  const ym = format(month, "yyyy-MM");

  const loadTeachers = useCallback(async () => {
    const { data } = await sb.from("teachers").select("*").order("display_name");
    setTeachers((data ?? []) as Teacher[]);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    // A day either side, because the studio is six hours behind UTC: an
    // evening class on the 31st is already the 1st in UTC.
    const from = format(subDays(startOfMonth(month), 1), "yyyy-MM-dd");
    const to = format(addDays(endOfMonth(month), 1), "yyyy-MM-dd");
    const [{ data: sc }, { data: ch }, { data: pm }] = await Promise.all([
      sb.from("class_schedule")
        .select("id, start_time, is_cancelled, instructor, classes(title, instructor)")
        .gte("start_time", `${from}T00:00:00Z`).lte("start_time", `${to}T23:59:59Z`)
        .order("start_time"),
      sb.from("studio_rent_charges").select("*").eq("ym", ym),
      sb.from("teacher_payments").select("*").eq("ym", ym).order("paid_on", { ascending: false }),
    ]);
    const list = (((sc as any) ?? []) as Session[])
      .filter((s) => spaMonthKey(s.start_time) === ym);
    setSessions(list);
    setCharges((ch ?? []) as Charge[]);
    setPayments((pm ?? []) as Payment[]);

    if (list.length) {
      const { data: bk } = await sb.from("class_bookings")
        .select("schedule_id, status").in("schedule_id", list.map((s) => s.id));
      const c: Record<string, number> = {};
      ((bk as any[]) ?? []).forEach((b) => {
        if (b.status === "cancelled") return;
        c[b.schedule_id] = (c[b.schedule_id] ?? 0) + 1;
      });
      setCounts(c);
    } else setCounts({});
    setLoading(false);
  }, [month, ym]);

  useEffect(() => { loadTeachers(); }, [loadTeachers]);
  useEffect(() => { load(); }, [load]);

  /**
   * Per teacher and month:
   *   owed      — classes she has already given x her rate (what is due now)
   *   expected  — plus the ones still to come (what the month should end at)
   *   paid      — money actually received, from teacher_payments
   *   balance   — owed minus paid; negative means she has paid ahead
   */
  const rows = useMemo(() => {
    const now = new Date();
    return teachers.map((t) => {
      const mine = sessions.filter((s) => teacherOf(s) === norm(t.display_name));
      const given = mine.filter((s) => !s.is_cancelled && parseISO(s.start_time) < now);
      const upcoming = mine.filter((s) => !s.is_cancelled && parseISO(s.start_time) >= now);
      const students = mine.reduce((n, s) => n + (counts[s.id] ?? 0), 0);
      const rate = Number(t.studio_rate || 0);
      const mypay = payments.filter((p) => p.teacher_id === t.id);
      const paid = mypay.reduce((s, p) => s + Number(p.amount || 0), 0);
      const owed = given.length * rate;
      return {
        teacher: t,
        sessions: mine,
        given: given.length,
        upcoming: upcoming.length,
        students,
        rate,
        owed,
        expected: (given.length + upcoming.length) * rate,
        paid,
        balance: owed - paid,
        payments: mypay,
        note: charges.find((c) => c.teacher_id === t.id)?.note ?? "",
      };
    });
  }, [teachers, sessions, counts, charges, payments]);

  const totals = useMemo(() => ({
    owed: rows.reduce((s, r) => s + r.owed, 0),
    expected: rows.reduce((s, r) => s + r.expected, 0),
    paid: rows.reduce((s, r) => s + r.paid, 0),
    given: rows.reduce((s, r) => s + r.given, 0),
    upcoming: rows.reduce((s, r) => s + r.upcoming, 0),
  }), [rows]);

  /** Sessions whose instructor doesn't match any teacher — they'd bill nobody. */
  const unassigned = useMemo(() => {
    const names = new Set(teachers.map((t) => norm(t.display_name)));
    return sessions.filter((s) => !s.is_cancelled && !names.has(teacherOf(s)));
  }, [sessions, teachers]);

  const openPayment = (r: (typeof rows)[number]) => {
    setPayingFor(r.teacher.id);
    setPayDraft({
      amount: r.balance > 0 ? r.balance.toFixed(2) : "",
      paid_on: todayCR(), method: "cash", note: "",
    });
  };

  const savePayment = async (teacherId: string) => {
    const amount = Number(payDraft.amount);
    if (!Number.isFinite(amount) || amount <= 0) { toast.error("Enter the amount received"); return; }
    setSavingPay(true);
    const { error } = await sb.from("teacher_payments").insert({
      teacher_id: teacherId, ym, amount,
      paid_on: payDraft.paid_on || todayCR(),
      method: payDraft.method || null,
      note: payDraft.note.trim() || null,
    });
    if (error) toast.error(error.message);
    else { toast.success(`${usd(amount)} recorded`); setPayingFor(null); load(); }
    setSavingPay(false);
  };

  const deletePayment = async (p: Payment) => {
    if (!(await confirm({
      title: `Delete this ${usd(Number(p.amount))} payment?`,
      description: "It stops counting as collected.",
      confirmLabel: "Delete", destructive: true,
    }))) return;
    const { error } = await sb.from("teacher_payments").delete().eq("id", p.id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); load(); }
  };

  const setNote = async (teacherId: string, note: string) => {
    const existing = charges.find((c) => c.teacher_id === teacherId);
    const { error } = existing
      ? await sb.from("studio_rent_charges").update({ note }).eq("id", existing.id)
      : await sb.from("studio_rent_charges").insert({ teacher_id: teacherId, ym, note });
    if (error) toast.error(error.message); else load();
  };

  const addTeacher = async () => {
    const name = newName.trim();
    if (!name) { toast.error("Name is required"); return; }
    const { data, error } = await sb.from("teachers")
      .insert({ display_name: name, email: newEmail.trim() || "", studio_rate: 35 })
      .select("id").single();
    if (error) { toast.error(error.message.includes("duplicate") ? "That teacher already exists" : error.message); return; }
    if (newEmail.trim()) await linkAccount(data.id, newEmail.trim(), true);
    setNewName(""); setNewEmail("");
    toast.success(`${name} added`);
    loadTeachers();
  };

  /** Attach a login to a teacher (and give it the teacher role). */
  const linkAccount = async (teacherId: string, email: string, quiet = false) => {
    const { data, error } = await sb.rpc("link_teacher_account", { _teacher_id: teacherId, _email: email });
    if (error) { toast.error(error.message); return; }
    if (!quiet) {
      toast[data ? "success" : "info"](
        data ? "Account linked — she can now open the Teacher Panel"
             : "No account with that email yet. Ask her to sign up, then link again.",
      );
    }
    loadTeachers();
  };

  const patchTeacher = async (id: string, patch: Partial<Teacher>) => {
    const { error } = await sb.from("teachers").update(patch).eq("id", id);
    if (error) toast.error(error.message); else loadTeachers();
  };

  const removeTeacher = async (t: Teacher) => {
    if (!(await confirm({
      title: `Remove ${t.display_name}?`,
      description: "Her classes stay on the calendar, but she loses the Teacher Panel.",
      confirmLabel: "Remove", destructive: true,
    }))) return;
    const { error } = await sb.from("teachers").delete().eq("id", t.id);
    if (error) toast.error(error.message);
    else { toast.success("Removed"); loadTeachers(); }
  };

  const exportCsv = () => {
    const header = ["Teacher", "Classes given", "Upcoming", "Rate", "To collect", "Collected", "Balance", "Note"];
    const body = rows.map((r) => [r.teacher.display_name, r.given, r.upcoming, r.rate,
      r.owed.toFixed(2), r.paid.toFixed(2), r.balance.toFixed(2), r.note]);
    const csv = [header, ...body, [],
      ["TOTAL", totals.given, totals.upcoming, "", totals.owed.toFixed(2), totals.paid.toFixed(2),
       (totals.owed - totals.paid).toFixed(2)]]
      .map((x) => x.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `studio-rent-${ym}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-heading font-bold text-foreground">Teachers</h2>
          <p className="text-sm text-muted-foreground">
            Studio rent to collect, what each teacher has paid, and who has access to the Teacher Panel.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="icon" onClick={() => setMonth(subMonths(month, 1))}><ChevronLeft className="h-4 w-4" /></Button>
          <h3 className="font-heading text-base font-semibold min-w-[150px] text-center">{format(month, "MMMM yyyy")}</h3>
          <Button variant="outline" size="icon" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight className="h-4 w-4" /></Button>
          {!isSameMonth(month, new Date()) && <Button variant="ghost" size="sm" onClick={() => setMonth(new Date())}>This month</Button>}
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}><Download className="h-4 w-4 mr-1" /> CSV</Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi icon={Wallet} label="Due now" value={usd(totals.owed)}
              sub={`${totals.given} class${totals.given === 1 ? "" : "es"} already given`} accent />
            <Kpi icon={HandCoins} label="Collected" value={usd(totals.paid)}
              sub={totals.paid > 0 ? "payments recorded" : "nothing received yet"} />
            <Kpi icon={Wallet} label="Outstanding" value={usd(totals.owed - totals.paid)} sub="due now minus collected" />
            <Kpi icon={Users} label="Month should reach" value={usd(totals.expected)}
              sub={`${totals.upcoming} class${totals.upcoming === 1 ? "" : "es"} still to come`} />
          </div>

          {/* Sessions whose instructor matches nobody — nothing would be billed. */}
          {unassigned.length > 0 && (
            <Card className="p-4 border-amber-400/50 bg-amber-50/60 dark:bg-amber-950/20">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-body text-sm font-medium text-foreground">
                    {unassigned.length} class{unassigned.length > 1 ? "es" : ""} this month with no matching teacher
                  </p>
                  <p className="font-body text-xs text-muted-foreground mt-0.5">
                    No rent is being counted for them, and no one sees them in the Teacher Panel. Set the
                    teacher on each session in Calendars → Classes, spelled exactly as here.
                  </p>
                </div>
              </div>
            </Card>
          )}

          {rows.length === 0 && (
            <Card className="p-8 text-center text-muted-foreground">No teachers yet — add one below.</Card>
          )}

          {/* One card per teacher: her numbers, her payments, her access. */}
          <div className="space-y-3">
            {rows.map((r) => {
              const open = expanded === r.teacher.id;
              const settled = r.owed > 0 && r.balance <= 0;
              return (
                <Card key={r.teacher.id} className={cn("p-4", !r.teacher.active && "opacity-60")}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-heading text-base font-semibold text-foreground">
                        {r.teacher.display_name}
                        {!r.teacher.active && <span className="ml-2 text-xs font-normal text-muted-foreground">(inactive)</span>}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {r.teacher.user_id ? r.teacher.email : <span className="text-amber-600">no account linked</span>}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={cn("font-heading text-xl font-bold leading-tight",
                        settled ? "text-emerald-600 dark:text-emerald-400"
                          : r.balance > 0 ? "text-foreground" : "text-muted-foreground")}>
                        {r.balance > 0 ? usd(r.balance) : settled ? "Settled" : usd(0)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {r.balance < 0 ? `${usd(-r.balance)} paid ahead` : "outstanding"}
                      </p>
                    </div>
                  </div>

                  {/* The month in one line */}
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2">
                    <Mini label="Given" value={String(r.given)} />
                    <Mini label="Upcoming" value={String(r.upcoming)} />
                    <Mini label="Students" value={String(r.students)} />
                    <Mini label="Due now" value={usd(r.owed)} hint={`${r.given} × ${usd(r.rate)}`} />
                    <Mini label="Collected" value={usd(r.paid)} hint={r.payments.length ? `${r.payments.length} payment${r.payments.length === 1 ? "" : "s"}` : "none"} />
                  </div>

                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <Button size="sm" onClick={() => openPayment(r)}>
                      <HandCoins className="h-4 w-4 mr-1" /> Record a payment
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setExpanded(open ? null : r.teacher.id)}>
                      Details {open ? <ChevronUp className="h-4 w-4 ml-1" /> : <ChevronDown className="h-4 w-4 ml-1" />}
                    </Button>
                    <Input defaultValue={r.note} placeholder="note for this month…"
                      className="h-8 text-xs max-w-[220px] ml-auto"
                      onBlur={(e) => e.target.value !== r.note && setNote(r.teacher.id, e.target.value)} />
                  </div>

                  {/* Record a payment */}
                  {payingFor === r.teacher.id && (
                    <div className="mt-3 rounded-lg border border-spa-sage/40 bg-spa-sage/5 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                        Payment received from {r.teacher.display_name}
                      </p>
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                        <div>
                          <label className="text-[11px] text-muted-foreground">Amount</label>
                          <Input type="number" step="0.01" autoFocus value={payDraft.amount} className="h-9"
                            onChange={(e) => setPayDraft({ ...payDraft, amount: e.target.value })} />
                        </div>
                        <div>
                          <label className="text-[11px] text-muted-foreground">Date</label>
                          <Input type="date" value={payDraft.paid_on} className="h-9"
                            onChange={(e) => setPayDraft({ ...payDraft, paid_on: e.target.value })} />
                        </div>
                        <div>
                          <label className="text-[11px] text-muted-foreground">How</label>
                          <select value={payDraft.method} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                            onChange={(e) => setPayDraft({ ...payDraft, method: e.target.value })}>
                            <option value="cash">Cash</option>
                            <option value="sinpe">SINPE</option>
                            <option value="transfer">Transfer</option>
                            <option value="other">Other</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[11px] text-muted-foreground">Note</label>
                          <Input value={payDraft.note} className="h-9" placeholder="optional"
                            onChange={(e) => setPayDraft({ ...payDraft, note: e.target.value })} />
                        </div>
                      </div>
                      <div className="mt-2 flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setPayingFor(null)} disabled={savingPay}>Cancel</Button>
                        <Button size="sm" onClick={() => savePayment(r.teacher.id)} disabled={savingPay}>
                          {savingPay ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />} Save payment
                        </Button>
                      </div>
                    </div>
                  )}

                  {open && (
                    <div className="mt-3 grid gap-4 lg:grid-cols-2 border-t border-border pt-3">
                      {/* Her classes this month */}
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                          Classes this month ({r.sessions.length})
                        </p>
                        {r.sessions.length === 0 ? (
                          <p className="text-xs text-muted-foreground">None assigned.</p>
                        ) : (
                          <div className="space-y-1">
                            {r.sessions.map((s) => (
                              <div key={s.id} className="flex items-center justify-between gap-2 text-xs">
                                <span className={cn("truncate", s.is_cancelled && "line-through opacity-60")}>
                                  {formatSpaDate(s.start_time)} · {formatSpaTime(s.start_time)} — {s.classes?.title}
                                </span>
                                <span className="text-muted-foreground whitespace-nowrap">
                                  <Users className="h-3 w-3 inline mr-0.5" />{counts[s.id] ?? 0}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mt-4 mb-2">
                          Payments ({r.payments.length})
                        </p>
                        {r.payments.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Nothing received for this month yet.</p>
                        ) : (
                          <div className="space-y-1">
                            {r.payments.map((p) => (
                              <div key={p.id} className="flex items-center justify-between gap-2 text-xs">
                                <span className="truncate">
                                  <span className="font-medium text-foreground">{usd(Number(p.amount))}</span>
                                  {" · "}{p.paid_on}{p.method ? ` · ${p.method}` : ""}
                                  {p.note ? ` · ${p.note}` : ""}
                                </span>
                                <button onClick={() => deletePayment(p)} className="text-destructive shrink-0">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Access + settings */}
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Access</p>
                        <div className="flex items-center gap-2">
                          <Input defaultValue={r.teacher.email} placeholder="her@email.com" className="h-8 text-xs"
                            id={`email-${r.teacher.id}`} />
                          <Button size="sm" variant="outline" className="h-8 whitespace-nowrap"
                            onClick={() => {
                              const el = document.getElementById(`email-${r.teacher.id}`) as HTMLInputElement;
                              if (el?.value.trim()) linkAccount(r.teacher.id, el.value.trim());
                            }}>
                            <Link2 className="h-3.5 w-3.5 mr-1" /> Link
                          </Button>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          She must have signed up on the site first. Linking also gives her the teacher role.
                        </p>

                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pt-2">
                          Studio rent per class
                        </p>
                        <Input type="number" defaultValue={r.teacher.studio_rate} className="h-8 w-28"
                          onBlur={(e) => Number(e.target.value) !== Number(r.teacher.studio_rate)
                            && patchTeacher(r.teacher.id, { studio_rate: Math.max(0, Number(e.target.value) || 0) })} />

                        <div className="flex items-center gap-2 pt-2">
                          <Switch checked={r.teacher.active}
                            onCheckedChange={(v) => patchTeacher(r.teacher.id, { active: v })} />
                          <span className="text-xs text-muted-foreground">Active</span>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive ml-auto"
                            onClick={() => removeTeacher(r.teacher)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>

                        {r.teacher.payment_instructions && (
                          <div className="pt-1">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">How her students pay her</p>
                            <p className="text-xs text-muted-foreground whitespace-pre-line">{r.teacher.payment_instructions}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          {/* Month total */}
          {rows.length > 0 && (
            <Card className="p-4 flex flex-wrap items-center justify-between gap-3">
              <p className="font-heading text-sm font-semibold text-foreground">
                Total — {format(month, "MMMM yyyy")}
              </p>
              <div className="flex flex-wrap gap-5 text-sm">
                <span className="text-muted-foreground">Given <strong className="text-foreground">{totals.given}</strong></span>
                <span className="text-muted-foreground">Due now <strong className="text-foreground">{usd(totals.owed)}</strong></span>
                <span className="text-muted-foreground">Collected <strong className="text-foreground">{usd(totals.paid)}</strong></span>
                <span className="text-muted-foreground">Outstanding <strong className="text-foreground">{usd(totals.owed - totals.paid)}</strong></span>
              </div>
            </Card>
          )}

          {/* Add a teacher */}
          <Card className="p-4">
            <p className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">Add a teacher</p>
            <div className="flex flex-wrap items-center gap-2">
              <Input value={newName} onChange={(e) => setNewName(e.target.value)}
                placeholder="Name — exactly as it appears on classes" className="h-9 max-w-xs" />
              <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
                placeholder="her@email.com (optional)" className="h-9 max-w-xs" />
              <Button size="sm" onClick={addTeacher}><Plus className="h-4 w-4 mr-1" /> Add</Button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              The name must match the teacher set on each class session, otherwise her classes won't show up.
            </p>
          </Card>
        </>
      )}
      {confirmDialog}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, accent }: { icon: any; label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <Card className={cn("p-4", accent && "border-spa-sage/40 bg-spa-sage/5")}>
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        <Icon className="h-4 w-4" /><span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-bold text-foreground leading-tight">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </Card>
  );
}

function Mini({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
