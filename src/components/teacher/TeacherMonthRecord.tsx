import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ChevronLeft, ChevronRight, Loader2, Download, Wallet, HandCoins,
  CalendarDays, Users, UserCheck, NotebookPen,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, addMonths, subMonths, addDays, subDays, parseISO, isSameMonth } from "date-fns";
import { formatSpaDate, formatSpaTime, spaMonthKey } from "@/lib/businessHours";
import { cn } from "@/lib/utils";
import type { SchedSession } from "@/components/teacher/TeacherSchedule";
import { teacherOf, SESSION_SELECT } from "@/components/teacher/TeacherSchedule";

const sb = supabase as any;
const usd = (n: number) => `$${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Payment { id: string; amount: number; paid_on: string; method: string | null; note: string | null }
interface Booking { schedule_id: string; status: string; attended: boolean | null; client_type: string | null }
interface NoteRow { amount: number | null; paid: boolean; entry_date: string }
interface MonthRow { ym: string; given: number; due: number; paid: number }

/**
 * Her month on one page.
 *
 * Everything that was scattered across the other tabs — classes given, who came,
 * what the studio rent adds up to, what she has paid and what her own notebook
 * still has outstanding — gathered so she does not have to keep her own tally on
 * paper. Nothing here is a new number: it is the same data, added up.
 */
export function TeacherMonthRecord({
  teacher, month, onMonthChange, sessions, counts, payments,
}: {
  teacher: { id: string; display_name: string; studio_rate: number };
  month: Date;
  onMonthChange: (d: Date) => void;
  sessions: SchedSession[];
  counts: Record<string, number>;
  payments: Payment[];
}) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [history, setHistory] = useState<MonthRow[]>([]);
  const [loading, setLoading] = useState(true);

  const ym = format(month, "yyyy-MM");
  const rate = Number(teacher.studio_rate || 0);

  // Attendance and student types for the month's classes, plus her notebook.
  useEffect(() => {
    let alive = true;
    (async () => {
      const ids = sessions.map((s) => s.id);
      const [{ data: bk }, { data: nt }] = await Promise.all([
        ids.length
          ? sb.from("class_bookings").select("schedule_id, status, attended, client_type").in("schedule_id", ids)
          : Promise.resolve({ data: [] }),
        sb.from("teacher_notes").select("amount, paid, entry_date")
          .eq("teacher_id", teacher.id)
          .gte("entry_date", format(startOfMonth(month), "yyyy-MM-dd"))
          .lte("entry_date", format(endOfMonth(month), "yyyy-MM-dd")),
      ]);
      if (!alive) return;
      setBookings(((bk ?? []) as Booking[]));
      setNotes(((nt ?? []) as NoteRow[]));
    })();
    return () => { alive = false; };
  }, [sessions, teacher.id, month]);

  /** The last six months, so she can see her record rather than one snapshot. */
  const loadHistory = useCallback(async () => {
    setLoading(true);
    const first = startOfMonth(subMonths(month, 5));
    const [{ data: sc }, { data: pm }] = await Promise.all([
      sb.from("class_schedule").select(SESSION_SELECT)
        .gte("start_time", `${format(subDays(first, 1), "yyyy-MM-dd")}T00:00:00Z`)
        .lte("start_time", `${format(addDays(endOfMonth(month), 1), "yyyy-MM-dd")}T23:59:59Z`)
        .order("start_time"),
      sb.from("teacher_payments").select("ym, amount").eq("teacher_id", teacher.id),
    ]);
    const now = new Date();
    const mine = (((sc ?? []) as SchedSession[]))
      .filter((s) => teacherOf(s) === teacher.display_name.trim().toLowerCase())
      .filter((s) => !s.is_cancelled && parseISO(s.start_time) < now);

    const rows: MonthRow[] = [];
    for (let i = 5; i >= 0; i--) {
      const key = format(subMonths(month, i), "yyyy-MM");
      const given = mine.filter((s) => spaMonthKey(s.start_time) === key).length;
      const paid = (((pm ?? []) as { ym: string; amount: number }[]))
        .filter((p) => p.ym === key)
        .reduce((n, p) => n + Number(p.amount || 0), 0);
      rows.push({ ym: key, given, due: given * rate, paid });
    }
    setHistory(rows);
    setLoading(false);
  }, [month, teacher.display_name, teacher.id, rate]);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  const stats = useMemo(() => {
    const now = new Date();
    const live = sessions.filter((s) => !s.is_cancelled);
    const given = live.filter((s) => parseISO(s.start_time) < now);
    const active = bookings.filter((b) => b.status !== "cancelled");
    const came = active.filter((b) => b.attended === true).length;
    const noShow = active.filter((b) => b.attended === false).length;
    const paid = payments.reduce((n, p) => n + Number(p.amount || 0), 0);
    const due = given.length * rate;

    const byType = new Map<string, number>();
    active.forEach((b) => {
      const k = b.client_type || "Not set";
      byType.set(k, (byType.get(k) ?? 0) + 1);
    });

    const owedToHer = notes.filter((n) => !n.paid).reduce((n, x) => n + Number(x.amount ?? 0), 0);
    const collectedByHer = notes.filter((n) => n.paid).reduce((n, x) => n + Number(x.amount ?? 0), 0);

    return {
      given: given.length,
      upcoming: live.length - given.length,
      cancelled: sessions.length - live.length,
      students: active.length,
      came, noShow,
      due, paid, balance: due - paid,
      expected: live.length * rate,
      byType: [...byType.entries()].sort((a, b) => b[1] - a[1]),
      owedToHer, collectedByHer,
    };
  }, [sessions, bookings, payments, notes, rate]);

  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [
      [`Month`, ym].map(esc).join(","),
      [`Teacher`, teacher.display_name].map(esc).join(","),
      "",
      ["Date", "Time", "Class", "Students", "Studio rent"].map(esc).join(","),
      ...sessions
        .filter((s) => !s.is_cancelled && parseISO(s.start_time) < new Date())
        .map((s) => [
          formatSpaDate(s.start_time), formatSpaTime(s.start_time),
          s.classes?.title ?? "Class", counts[s.id] ?? 0, rate.toFixed(2),
        ].map(esc).join(",")),
      "",
      ["Classes given", stats.given].map(esc).join(","),
      ["Studio rent due", stats.due.toFixed(2)].map(esc).join(","),
      ["Paid", stats.paid.toFixed(2)].map(esc).join(","),
      ["Balance", stats.balance.toFixed(2)].map(esc).join(","),
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob([lines], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `my-month-${ym}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const givenSessions = sessions
    .filter((s) => !s.is_cancelled && parseISO(s.start_time) < new Date());

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="icon" onClick={() => onMonthChange(subMonths(month, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="font-heading text-lg font-semibold min-w-[160px] text-center">
          {format(month, "MMMM yyyy")}
        </h2>
        <Button variant="outline" size="icon" onClick={() => onMonthChange(addMonths(month, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        {!isSameMonth(month, new Date()) && (
          <Button variant="ghost" size="sm" onClick={() => onMonthChange(new Date())}>This month</Button>
        )}
        <Button variant="outline" size="sm" className="ml-auto" onClick={exportCsv} disabled={!sessions.length}>
          <Download className="h-4 w-4 mr-1" /> CSV
        </Button>
      </div>

      {/* The month in four numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Box icon={CalendarDays} label="Classes given" value={String(stats.given)}
          sub={`${stats.upcoming} to come${stats.cancelled ? ` · ${stats.cancelled} cancelled` : ""}`} />
        <Box icon={Users} label="Students" value={String(stats.students)} sub="signed up" />
        <Box icon={UserCheck} label="Came" value={String(stats.came)}
          sub={stats.noShow ? `${stats.noShow} no-show` : "marked as attended"} />
        <Box icon={Wallet} label="Studio rent" value={usd(stats.due)}
          sub={`${stats.given} × ${usd(rate)}`} accent />
      </div>

      {/* What she owes the studio */}
      <Card className="p-4">
        <h3 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
          <HandCoins className="h-4 w-4" /> Studio rent — {format(month, "MMMM")}
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Line label="Due now" value={usd(stats.due)} />
          <Line label="You paid" value={usd(stats.paid)} />
          <Line
            label={stats.balance > 0 ? "You still owe" : stats.balance < 0 ? "Paid ahead" : "Balance"}
            value={usd(Math.abs(stats.balance))}
            tone={stats.balance > 0 ? "warn" : "good"}
          />
          <Line label="By month end" value={usd(stats.expected)} />
        </div>
        <div className="mt-3 border-t border-border pt-3">
          <p className="font-body text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Payments recorded by Holis ({payments.length})
          </p>
          {payments.length === 0 ? (
            <p className="font-body text-xs text-muted-foreground">Nothing recorded for this month yet.</p>
          ) : (
            <div className="space-y-1">
              {payments.map((p) => (
                <p key={p.id} className="font-body text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{usd(Number(p.amount))}</span>
                  {" · "}{p.paid_on}{p.method ? ` · ${p.method}` : ""}{p.note ? ` · ${p.note}` : ""}
                </p>
              ))}
            </div>
          )}
          <p className="font-body text-[11px] text-muted-foreground mt-2">
            Rent counts only classes already given, so this grows through the month.
          </p>
        </div>
      </Card>

      {/* Class by class */}
      <Card className="p-4">
        <h3 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Classes you gave ({givenSessions.length})
        </h3>
        {givenSessions.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nothing given yet this month.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  {["Date", "Class", "Students", "Rent"].map((h) => (
                    <th key={h} className="py-2 pr-3 font-body text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {givenSessions.map((s) => (
                  <tr key={s.id} className="border-b border-border/60">
                    <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                      {formatSpaDate(s.start_time)} · {formatSpaTime(s.start_time)}
                    </td>
                    <td className="py-2 pr-3 text-foreground">{s.classes?.title ?? "Class"}</td>
                    <td className="py-2 pr-3">{counts[s.id] ?? 0}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{usd(rate)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-2 pr-3">Total</td>
                  <td className="py-2 pr-3"></td>
                  <td className="py-2 pr-3">{stats.students}</td>
                  <td className="py-2 pr-3">{usd(stats.due)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {stats.byType.length > 0 && (
          <div className="mt-4 border-t border-border pt-3">
            <p className="font-body text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              How your students came in
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {stats.byType.map(([type, n]) => (
                <li key={type} className="rounded-full border border-border bg-muted/40 px-3 py-1 font-body text-xs">
                  {type} <span className="font-semibold">{n}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {/* Her own notebook, summed */}
      <Card className="p-4">
        <h3 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
          <NotebookPen className="h-4 w-4" /> From your notebook
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <Line label="Students paid you" value={usd(stats.collectedByHer)} tone="good" />
          <Line label="Still owed to you" value={usd(stats.owedToHer)} tone={stats.owedToHer > 0 ? "warn" : undefined} />
        </div>
        <p className="font-body text-[11px] text-muted-foreground mt-2">
          Only counts the lines you wrote with an amount, dated in this month.
        </p>
      </Card>

      {/* The last six months */}
      <Card className="p-4">
        <h3 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Last six months
        </h3>
        {loading ? (
          <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  {["Month", "Classes given", "Rent due", "Paid", "Balance"].map((h) => (
                    <th key={h} className="py-2 pr-3 font-body text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((r) => {
                  const bal = r.due - r.paid;
                  return (
                    <tr key={r.ym} className={cn("border-b border-border/60", r.ym === ym && "bg-spa-sage/5")}>
                      <td className="py-2 pr-3 whitespace-nowrap font-medium text-foreground">
                        {format(new Date(`${r.ym}-01T12:00:00Z`), "MMMM yyyy")}
                      </td>
                      <td className="py-2 pr-3">{r.given}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{usd(r.due)}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{usd(r.paid)}</td>
                      <td className={cn("py-2 pr-3 whitespace-nowrap",
                        bal > 0 ? "text-foreground" : "text-emerald-600 dark:text-emerald-400")}>
                        {bal > 0 ? usd(bal) : bal < 0 ? `${usd(-bal)} ahead` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Box({ icon: Icon, label, value, sub, accent }: {
  icon: any; label: string; value: string; sub?: string; accent?: boolean;
}) {
  return (
    <Card className={cn("p-4", accent && "border-spa-sage/40 bg-spa-sage/5")}>
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        <Icon className="h-4 w-4" />
        <span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-bold text-foreground leading-tight">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </Card>
  );
}

function Line({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("font-heading text-lg font-semibold",
        tone === "good" ? "text-emerald-600 dark:text-emerald-400" : "text-foreground")}>
        {value}
      </p>
    </div>
  );
}
