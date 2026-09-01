import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  ChevronLeft, ChevronRight, Loader2, Plus, Trash2, Link2, Users,
  Wallet, ChevronDown, ChevronUp, Download, AlertTriangle,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, addMonths, subMonths, parseISO, isSameMonth } from "date-fns";
import { formatSpaDate, formatSpaTime } from "@/lib/businessHours";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const sb = supabase as any;
const usd = (n: number) => `$${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const norm = (s: string) => (s ?? "").trim().toLowerCase();

interface Teacher {
  id: string; user_id: string | null; email: string; display_name: string;
  payment_instructions: string | null; studio_rate: number; active: boolean;
}
interface Session {
  id: string; start_time: string; is_cancelled: boolean; instructor: string | null;
  classes: { title: string | null; instructor: string | null } | null;
}
interface Charge { id: string; teacher_id: string; ym: string; paid: boolean; note: string | null; }

/** A session's teacher: per-session name wins, else the class template's. */
const teacherOf = (s: Session) => norm(s.instructor || s.classes?.instructor || "");

export function AdminTeachersManager() {
  const [month, setMonth] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});   // students per session
  const [charges, setCharges] = useState<Charge[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");

  const ym = format(month, "yyyy-MM");

  const loadTeachers = useCallback(async () => {
    const { data } = await sb.from("teachers").select("*").order("display_name");
    setTeachers((data ?? []) as Teacher[]);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const from = format(startOfMonth(month), "yyyy-MM-dd");
    const to = format(endOfMonth(month), "yyyy-MM-dd");
    const [{ data: sc }, { data: ch }] = await Promise.all([
      sb.from("class_schedule")
        .select("id, start_time, is_cancelled, instructor, classes(title, instructor)")
        .gte("start_time", `${from}T00:00:00Z`).lte("start_time", `${to}T23:59:59Z`)
        .order("start_time"),
      sb.from("studio_rent_charges").select("*").eq("ym", ym),
    ]);
    const list = ((sc as any) ?? []) as Session[];
    setSessions(list);
    setCharges((ch ?? []) as Charge[]);

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

  /** Per teacher: classes given (past, not cancelled) x her rate. */
  const rows = useMemo(() => {
    const now = new Date();
    return teachers.map((t) => {
      const mine = sessions.filter((s) => teacherOf(s) === norm(t.display_name));
      const given = mine.filter((s) => !s.is_cancelled && parseISO(s.start_time) < now);
      const upcoming = mine.filter((s) => !s.is_cancelled && parseISO(s.start_time) >= now);
      const students = mine.reduce((n, s) => n + (counts[s.id] ?? 0), 0);
      const charge = charges.find((c) => c.teacher_id === t.id);
      return {
        teacher: t,
        sessions: mine,
        given: given.length,
        upcoming: upcoming.length,
        students,
        owed: given.length * Number(t.studio_rate || 0),
        paid: charge?.paid ?? false,
        note: charge?.note ?? "",
      };
    });
  }, [teachers, sessions, counts, charges]);

  const totals = useMemo(() => ({
    owed: rows.reduce((s, r) => s + r.owed, 0),
    collected: rows.filter((r) => r.paid).reduce((s, r) => s + r.owed, 0),
    given: rows.reduce((s, r) => s + r.given, 0),
  }), [rows]);

  /** Sessions whose instructor doesn't match any teacher — they'd bill nobody. */
  const unassigned = useMemo(() => {
    const names = new Set(teachers.map((t) => norm(t.display_name)));
    return sessions.filter((s) => !s.is_cancelled && !names.has(teacherOf(s)));
  }, [sessions, teachers]);

  const setCharge = async (teacherId: string, patch: { paid?: boolean; note?: string }) => {
    const existing = charges.find((c) => c.teacher_id === teacherId);
    const body = { ...patch, ...(patch.paid !== undefined ? { paid_at: patch.paid ? new Date().toISOString() : null } : {}) };
    if (existing) {
      const { error } = await sb.from("studio_rent_charges").update(body).eq("id", existing.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await sb.from("studio_rent_charges").insert({ teacher_id: teacherId, ym, ...body });
      if (error) { toast.error(error.message); return; }
    }
    load();
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
    if (!confirm(`Remove ${t.display_name}? Her classes stay, but she loses panel access.`)) return;
    const { error } = await sb.from("teachers").delete().eq("id", t.id);
    if (error) toast.error(error.message);
    else { toast.success("Removed"); loadTeachers(); }
  };

  const exportCsv = () => {
    const header = ["Teacher", "Classes given", "Rate", "To collect", "Collected?", "Note"];
    const body = rows.map((r) => [r.teacher.display_name, r.given, r.teacher.studio_rate,
      r.owed.toFixed(2), r.paid ? "yes" : "no", r.note]);
    const csv = [header, ...body, [], ["TOTAL", totals.given, "", totals.owed.toFixed(2)]]
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
            Studio rent to collect, and who has access to the Teacher Panel.
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
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <Kpi icon={Wallet} label="To collect" value={usd(totals.owed)} sub={`${totals.given} classes given`} accent />
            <Kpi icon={Wallet} label="Already collected" value={usd(totals.collected)} sub="marked as paid" />
            <Kpi icon={Users} label="Teachers" value={String(teachers.filter((t) => t.active).length)} sub="active" />
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

          {/* Rent table */}
          <Card className="p-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="py-2 pr-3">Teacher</th>
                    <th className="py-2 pr-3 text-right">Given</th>
                    <th className="py-2 pr-3 text-right">Upcoming</th>
                    <th className="py-2 pr-3 text-right">Students</th>
                    <th className="py-2 pr-3 text-right">Rate</th>
                    <th className="py-2 pr-3 text-right">To collect</th>
                    <th className="py-2 pr-3 w-28">Collected</th>
                    <th className="py-2 pr-3 w-40">Note</th>
                    <th className="py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr><td colSpan={9} className="py-6 text-center text-muted-foreground">No teachers yet — add one below.</td></tr>
                  )}
                  {rows.map((r) => (
                    <Fragment key={r.teacher.id}>
                      <tr className={cn("border-b border-border/50", !r.teacher.active && "opacity-50")}>
                        <td className="py-2 pr-3">
                          <button
                            onClick={() => setExpanded(expanded === r.teacher.id ? null : r.teacher.id)}
                            className="font-medium text-foreground hover:underline text-left"
                          >
                            {r.teacher.display_name}
                          </button>
                          <span className="block text-[11px] text-muted-foreground">
                            {r.teacher.user_id
                              ? r.teacher.email
                              : <span className="text-amber-600">no account linked</span>}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-right">{r.given}</td>
                        <td className="py-2 pr-3 text-right text-muted-foreground">{r.upcoming}</td>
                        <td className="py-2 pr-3 text-right text-muted-foreground">{r.students}</td>
                        <td className="py-2 pr-3 text-right">
                          <Input type="number" defaultValue={r.teacher.studio_rate} className="h-8 w-20 text-right ml-auto"
                            onBlur={(e) => Number(e.target.value) !== Number(r.teacher.studio_rate)
                              && patchTeacher(r.teacher.id, { studio_rate: Math.max(0, Number(e.target.value) || 0) })} />
                        </td>
                        <td className="py-2 pr-3 text-right font-semibold">{usd(r.owed)}</td>
                        <td className="py-2 pr-3">
                          <button
                            onClick={() => setCharge(r.teacher.id, { paid: !r.paid })}
                            className={cn("text-xs px-2 py-1 rounded-full font-medium w-full",
                              r.paid ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                                     : "bg-muted text-muted-foreground hover:bg-border")}
                          >
                            {r.paid ? "Paid ✓" : "Pending"}
                          </button>
                        </td>
                        <td className="py-2 pr-3">
                          <Input defaultValue={r.note} placeholder="note…" className="h-8 text-xs"
                            onBlur={(e) => e.target.value !== r.note && setCharge(r.teacher.id, { note: e.target.value })} />
                        </td>
                        <td className="py-2">
                          {expanded === r.teacher.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        </td>
                      </tr>

                      {expanded === r.teacher.id && (
                        <tr>
                          <td colSpan={9} className="bg-muted/30 px-3 py-3">
                            <div className="grid gap-3 lg:grid-cols-2">
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
                                <div className="flex items-center gap-2 pt-1">
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
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
                {rows.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-border font-semibold">
                      <td className="py-2 pr-3">Total — {format(month, "MMMM yyyy")}</td>
                      <td className="py-2 pr-3 text-right">{totals.given}</td>
                      <td colSpan={3}></td>
                      <td className="py-2 pr-3 text-right">{usd(totals.owed)}</td>
                      <td colSpan={3}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </Card>

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
