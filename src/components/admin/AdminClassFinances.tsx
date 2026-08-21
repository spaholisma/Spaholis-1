import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Download, Loader2, Users, CalendarDays, DollarSign, TrendingUp } from "lucide-react";
import {
  format, startOfMonth, endOfMonth, addMonths, subMonths, parseISO, isSameMonth,
} from "date-fns";
import { cn } from "@/lib/utils";

// ── Types ──
interface Sched {
  id: string;
  class_id: string;
  start_time: string;
  is_cancelled: boolean;
  instructor: string | null;
  classes: { title: string | null; instructor: string | null } | null;
}
interface Bk {
  schedule_id: string;
  status: string;
  total_price: number | null;
  payment_method: string | null;
  payment_status: string | null;
}

const usd = (n: number) => `$${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const CRC_RATE_KEY = "hwc_crc_rate";

const teacherName = (s: Sched): string => {
  const a = s.instructor?.trim();
  if (a) return a;
  const b = s.classes?.instructor?.trim();
  return b || "Unassigned";
};

export function AdminClassFinances() {
  const [month, setMonth] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [scheds, setScheds] = useState<Sched[]>([]);
  const [bookings, setBookings] = useState<Bk[]>([]);
  const [crcRate, setCrcRate] = useState<number>(() => {
    const v = Number(localStorage.getItem(CRC_RATE_KEY));
    return Number.isFinite(v) && v > 0 ? v : 505;
  });
  useEffect(() => { localStorage.setItem(CRC_RATE_KEY, String(crcRate)); }, [crcRate]);

  const load = useCallback(async () => {
    setLoading(true);
    const start = format(startOfMonth(month), "yyyy-MM-dd");
    const end = format(endOfMonth(month), "yyyy-MM-dd");
    const { data: sc } = await supabase
      .from("class_schedule")
      .select("id, class_id, start_time, is_cancelled, instructor, classes(title, instructor)")
      .gte("start_time", `${start}T00:00:00Z`)
      .lte("start_time", `${end}T23:59:59Z`)
      .order("start_time", { ascending: true });
    const list = ((sc as any) ?? []) as Sched[];
    // Only sessions that actually ran (exclude cancelled) for the finances.
    const active = list.filter((s) => !s.is_cancelled);
    setScheds(active);
    const ids = active.map((s) => s.id);
    if (ids.length) {
      const { data: bk } = await supabase
        .from("class_bookings")
        .select("schedule_id, status, total_price, payment_method, payment_status")
        .in("schedule_id", ids);
      setBookings(((bk as any) ?? []) as Bk[]);
    } else {
      setBookings([]);
    }
    setLoading(false);
  }, [month]);
  useEffect(() => { load(); }, [load]);

  // Active bookings per schedule (attendees + income).
  const perSched = useMemo(() => {
    const m = new Map<string, { pax: number; income: number; online: number; other: number }>();
    for (const b of bookings) {
      if (b.status === "cancelled") continue;
      const cur = m.get(b.schedule_id) ?? { pax: 0, income: 0, online: 0, other: 0 };
      cur.pax += 1;
      const price = Number(b.total_price) || 0;
      cur.income += price;
      if (b.payment_method === "paypal" || b.payment_method === "card") cur.online += price;
      else cur.other += price;
      m.set(b.schedule_id, cur);
    }
    return m;
  }, [bookings]);

  const totals = useMemo(() => {
    let income = 0, pax = 0, online = 0, other = 0;
    for (const s of scheds) {
      const p = perSched.get(s.id);
      if (p) { income += p.income; pax += p.pax; online += p.online; other += p.other; }
    }
    return { income, pax, online, other, sessions: scheds.length };
  }, [scheds, perSched]);

  const byTeacher = useMemo(() => {
    const m = new Map<string, { sessions: number; pax: number; income: number }>();
    for (const s of scheds) {
      const t = teacherName(s);
      const cur = m.get(t) ?? { sessions: 0, pax: 0, income: 0 };
      cur.sessions += 1;
      const p = perSched.get(s.id);
      if (p) { cur.pax += p.pax; cur.income += p.income; }
      m.set(t, cur);
    }
    return [...m.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.income - a.income || b.pax - a.pax);
  }, [scheds, perSched]);

  const byClass = useMemo(() => {
    const m = new Map<string, { sessions: number; pax: number; income: number }>();
    for (const s of scheds) {
      const t = s.classes?.title ?? "Class";
      const cur = m.get(t) ?? { sessions: 0, pax: 0, income: 0 };
      cur.sessions += 1;
      const p = perSched.get(s.id);
      if (p) { cur.pax += p.pax; cur.income += p.income; }
      m.set(t, cur);
    }
    return [...m.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.income - a.income || b.pax - a.pax);
  }, [scheds, perSched]);

  const ledger = useMemo(() =>
    scheds.map((s) => {
      const p = perSched.get(s.id) ?? { pax: 0, income: 0, online: 0, other: 0 };
      return {
        date: format(parseISO(s.start_time), "dd/MM/yyyy"),
        time: format(parseISO(s.start_time), "HH:mm"),
        class: s.classes?.title ?? "Class",
        teacher: teacherName(s),
        pax: p.pax,
        online: p.online,
        drop: p.other,
        income: p.income,
      };
    }), [scheds, perSched]);

  const exportCsv = () => {
    const header = ["Date", "Time", "Class", "Teacher", "PAX", "Online $", "Drop-in/Other $", "Total Income $"];
    const rows = ledger.map((r) => [r.date, r.time, r.class, r.teacher, r.pax, r.online.toFixed(2), r.drop.toFixed(2), r.income.toFixed(2)]);
    const csv = [header, ...rows, [], ["TOTAL", "", "", "", totals.pax, totals.online.toFixed(2), totals.other.toFixed(2), totals.income.toFixed(2)]]
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `class-finances-${format(month, "yyyy-MM")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const crc = (n: number) => `₡${Math.round(n * crcRate).toLocaleString("es-CR")}`;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-heading font-bold text-foreground">Class Finances</h2>
          <p className="text-sm text-muted-foreground">Income &amp; attendance per month, built automatically from class bookings. Grouped by teacher and by class.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="icon" onClick={() => setMonth(subMonths(month, 1))}><ChevronLeft className="h-4 w-4" /></Button>
          <h3 className="font-heading text-lg font-semibold min-w-[150px] text-center">{format(month, "MMMM yyyy")}</h3>
          <Button variant="outline" size="icon" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight className="h-4 w-4" /></Button>
          {!isSameMonth(month, new Date()) && <Button variant="ghost" size="sm" onClick={() => setMonth(new Date())}>This month</Button>}
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={loading || ledger.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Export CSV
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…</div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi icon={DollarSign} label="Gross income" value={usd(totals.income)} sub={crc(totals.income)} accent />
            <Kpi icon={CalendarDays} label="Sessions" value={String(totals.sessions)} />
            <Kpi icon={Users} label="Attendees (PAX)" value={String(totals.pax)} />
            <Kpi icon={TrendingUp} label="Avg $ / session" value={usd(totals.sessions ? totals.income / totals.sessions : 0)} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* By teacher */}
            <Card className="p-4">
              <h4 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Income by teacher</h4>
              <Table
                cols={["Teacher", "Sessions", "PAX", "Income"]}
                rows={byTeacher.map((t) => [t.name, String(t.sessions), String(t.pax), usd(t.income)])}
                empty="No sessions this month."
              />
            </Card>
            {/* By class */}
            <Card className="p-4">
              <h4 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Income by class</h4>
              <Table
                cols={["Class", "Sessions", "PAX", "Income"]}
                rows={byClass.map((t) => [t.name, String(t.sessions), String(t.pax), usd(t.income)])}
                empty="No sessions this month."
              />
            </Card>
          </div>

          {/* Session ledger */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">Session ledger ({ledger.length})</h4>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>₡ rate</span>
                <Input type="number" value={crcRate} onChange={(e) => setCrcRate(Math.max(1, Number(e.target.value) || 1))} className="h-7 w-20" />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Time</th>
                    <th className="py-2 pr-3">Class</th>
                    <th className="py-2 pr-3">Teacher</th>
                    <th className="py-2 pr-3 text-right">PAX</th>
                    <th className="py-2 pr-3 text-right">Online</th>
                    <th className="py-2 pr-3 text-right">Drop-in/Other</th>
                    <th className="py-2 text-right">Income</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.length === 0 && (
                    <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">No sessions this month.</td></tr>
                  )}
                  {ledger.map((r, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-1.5 pr-3 whitespace-nowrap">{r.date}</td>
                      <td className="py-1.5 pr-3 whitespace-nowrap">{r.time}</td>
                      <td className="py-1.5 pr-3">{r.class}</td>
                      <td className="py-1.5 pr-3">{r.teacher}</td>
                      <td className="py-1.5 pr-3 text-right">{r.pax}</td>
                      <td className="py-1.5 pr-3 text-right text-muted-foreground">{r.online ? usd(r.online) : "—"}</td>
                      <td className="py-1.5 pr-3 text-right text-muted-foreground">{r.drop ? usd(r.drop) : "—"}</td>
                      <td className="py-1.5 text-right font-medium">{r.income ? usd(r.income) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
                {ledger.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-border font-semibold">
                      <td className="py-2 pr-3" colSpan={4}>Total — {format(month, "MMMM yyyy")}</td>
                      <td className="py-2 pr-3 text-right">{totals.pax}</td>
                      <td className="py-2 pr-3 text-right">{usd(totals.online)}</td>
                      <td className="py-2 pr-3 text-right">{usd(totals.other)}</td>
                      <td className="py-2 text-right">{usd(totals.income)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </Card>

          <div className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Coming next (Phase B)</p>
            Teacher pay &amp; commission, taxi cost, concierge commission and monthly fixed/variable expenses — to compute <strong>Net Profit</strong> per month (in $ and ₡), like your spreadsheet. This panel already covers the income side automatically; the cost inputs will be added on top.
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, accent }: { icon: any; label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <Card className={cn("p-4", accent && "border-emerald-500/40 bg-emerald-500/5")}>
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        <Icon className="h-4 w-4" />
        <span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-bold text-foreground leading-tight">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </Card>
  );
}

function Table({ cols, rows, empty }: { cols: string[]; rows: string[][]; empty: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground border-b border-border">
            {cols.map((c, i) => <th key={c} className={cn("py-2 pr-3", i > 0 && "text-right")}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={cols.length} className="py-5 text-center text-muted-foreground">{empty}</td></tr>}
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-border/50 hover:bg-muted/30">
              {r.map((cell, ci) => <td key={ci} className={cn("py-1.5 pr-3", ci > 0 && "text-right", ci === 0 && "font-medium")}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
