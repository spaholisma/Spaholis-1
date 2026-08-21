import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  ChevronLeft, ChevronRight, Download, Loader2, Users, CalendarDays, DollarSign,
  TrendingUp, Plus, Trash2, Wallet, Receipt, Copy, ChevronDown, ChevronUp,
} from "lucide-react";
import {
  format, startOfMonth, endOfMonth, addMonths, subMonths, parseISO, isSameMonth,
  startOfWeek, endOfWeek, eachWeekOfInterval, isSameDay,
} from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const sb = supabase as any;

// ── Types ──
interface Sched {
  id: string; class_id: string; start_time: string; is_cancelled: boolean;
  instructor: string | null; taxi_cost: number | null; concierge_commission: number | null;
  pay_override: number | null;
  classes: { title: string | null; instructor: string | null } | null;
}
interface Bk { schedule_id: string; status: string; total_price: number | null; payment_method: string | null; payment_status: string | null; }
interface Rate { id: string; name: string; fixed_per_class: number; commission_pct: number; active: boolean; }
interface Expense { id: string; ym: string; label: string; amount: number; category: string; sort_order: number; }
interface Payout { id: string; week_start: string; teacher: string; paid: boolean; note: string | null; }

const usd = (n: number) => `$${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const CRC_RATE_KEY = "hwc_crc_rate";
const norm = (s: string) => s.trim().toLowerCase();

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
  const [rates, setRates] = useState<Rate[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [showRates, setShowRates] = useState(false);
  const [showExpenses, setShowExpenses] = useState(false);
  const [crcRate, setCrcRate] = useState<number>(() => {
    const v = Number(localStorage.getItem(CRC_RATE_KEY));
    return Number.isFinite(v) && v > 0 ? v : 505;
  });
  useEffect(() => { localStorage.setItem(CRC_RATE_KEY, String(crcRate)); }, [crcRate]);

  const ym = format(month, "yyyy-MM");

  const loadRates = useCallback(async () => {
    const { data } = await sb.from("class_teacher_rates").select("*").order("name");
    setRates((data ?? []) as Rate[]);
  }, []);

  const loadExpenses = useCallback(async () => {
    const { data } = await sb.from("monthly_expenses").select("*").eq("ym", ym).order("sort_order").order("created_at");
    setExpenses((data ?? []) as Expense[]);
  }, [ym]);

  const loadPayouts = useCallback(async () => {
    const from = format(startOfWeek(startOfMonth(month), { weekStartsOn: 1 }), "yyyy-MM-dd");
    const to = format(endOfMonth(month), "yyyy-MM-dd");
    const { data } = await sb.from("class_teacher_payouts").select("*").gte("week_start", from).lte("week_start", to);
    setPayouts((data ?? []) as Payout[]);
  }, [month]);

  const load = useCallback(async () => {
    setLoading(true);
    const start = format(startOfMonth(month), "yyyy-MM-dd");
    const end = format(endOfMonth(month), "yyyy-MM-dd");
    const { data: sc } = await sb
      .from("class_schedule")
      .select("id, class_id, start_time, is_cancelled, instructor, taxi_cost, concierge_commission, pay_override, classes(title, instructor)")
      .gte("start_time", `${start}T00:00:00Z`).lte("start_time", `${end}T23:59:59Z`)
      .order("start_time", { ascending: true });
    const active = (((sc as any) ?? []) as Sched[]).filter((s) => !s.is_cancelled);
    setScheds(active);
    const ids = active.map((s) => s.id);
    if (ids.length) {
      const { data: bk } = await sb.from("class_bookings")
        .select("schedule_id, status, total_price, payment_method, payment_status").in("schedule_id", ids);
      setBookings(((bk as any) ?? []) as Bk[]);
    } else setBookings([]);
    setLoading(false);
  }, [month]);

  useEffect(() => { load(); loadExpenses(); loadPayouts(); }, [load, loadExpenses, loadPayouts]);
  useEffect(() => { loadRates(); }, [loadRates]);

  // Rate lookup (matched by teacher name, case-insensitive).
  const rateMap = useMemo(() => {
    const m = new Map<string, { fixed: number; pct: number }>();
    for (const r of rates) if (r.active) m.set(norm(r.name), { fixed: Number(r.fixed_per_class) || 0, pct: Number(r.commission_pct) || 0 });
    return m;
  }, [rates]);
  const payFor = useCallback((teacher: string, income: number) => {
    const r = rateMap.get(norm(teacher));
    if (!r) return 0;
    return r.fixed + (r.pct / 100) * income;
  }, [rateMap]);
  // Effective pay for a session: a manual per-session override wins, else the rate.
  const payForSched = useCallback((s: Sched, income: number) =>
    s.pay_override != null ? (Number(s.pay_override) || 0) : payFor(teacherName(s), income),
  [payFor]);

  const perSched = useMemo(() => {
    const m = new Map<string, { pax: number; income: number; paypal: number; cc: number; cash: number; other: number }>();
    for (const b of bookings) {
      if (b.status === "cancelled") continue;
      const cur = m.get(b.schedule_id) ?? { pax: 0, income: 0, paypal: 0, cc: 0, cash: 0, other: 0 };
      cur.pax += 1;
      const price = Number(b.total_price) || 0;
      cur.income += price;
      // Split by payment source (prices differ by tax handling).
      if (b.payment_method === "paypal") cur.paypal += price;
      else if (b.payment_method === "card") cur.cc += price;
      else if (b.payment_method === "cash") cur.cash += price;
      else cur.other += price;
      m.set(b.schedule_id, cur);
    }
    return m;
  }, [bookings]);

  const expensesTotal = useMemo(() => expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0), [expenses]);

  const totals = useMemo(() => {
    let income = 0, pax = 0, paypal = 0, cc = 0, cash = 0, other = 0, teacherPay = 0, taxi = 0, concierge = 0;
    for (const s of scheds) {
      const p = perSched.get(s.id);
      const inc = p?.income ?? 0;
      income += inc; pax += p?.pax ?? 0;
      paypal += p?.paypal ?? 0; cc += p?.cc ?? 0; cash += p?.cash ?? 0; other += p?.other ?? 0;
      teacherPay += payForSched(s, inc);
      taxi += Number(s.taxi_cost) || 0;
      concierge += Number(s.concierge_commission) || 0;
    }
    const netIncome = income - teacherPay - taxi - concierge;
    return { income, pax, paypal, cc, cash, other, sessions: scheds.length, teacherPay, taxi, concierge, netIncome, netProfit: netIncome - expensesTotal };
  }, [scheds, perSched, payForSched, expensesTotal]);
  const hasOther = totals.other > 0;

  const byTeacher = useMemo(() => {
    const m = new Map<string, { sessions: number; pax: number; income: number; pay: number }>();
    for (const s of scheds) {
      const t = teacherName(s);
      const cur = m.get(t) ?? { sessions: 0, pax: 0, income: 0, pay: 0 };
      cur.sessions += 1;
      const p = perSched.get(s.id);
      const inc = p?.income ?? 0;
      cur.pax += p?.pax ?? 0; cur.income += inc; cur.pay += payForSched(s, inc);
      m.set(t, cur);
    }
    return [...m.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.income - a.income || b.pax - a.pax);
  }, [scheds, perSched, payForSched]);

  const byClass = useMemo(() => {
    const m = new Map<string, { sessions: number; pax: number; income: number }>();
    for (const s of scheds) {
      const t = s.classes?.title ?? "Class";
      const cur = m.get(t) ?? { sessions: 0, pax: 0, income: 0 };
      cur.sessions += 1;
      const p = perSched.get(s.id);
      cur.pax += p?.pax ?? 0; cur.income += p?.income ?? 0;
      m.set(t, cur);
    }
    return [...m.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.income - a.income || b.pax - a.pax);
  }, [scheds, perSched]);

  const ledger = useMemo(() =>
    scheds.map((s) => {
      const p = perSched.get(s.id) ?? { pax: 0, income: 0, paypal: 0, cc: 0, cash: 0, other: 0 };
      const teacher = teacherName(s);
      return {
        id: s.id, date: format(parseISO(s.start_time), "dd/MM/yyyy"), time: format(parseISO(s.start_time), "HH:mm"),
        class: s.classes?.title ?? "Class", teacher, pax: p.pax,
        paypal: p.paypal, cc: p.cc, cash: p.cash, other: p.other,
        income: p.income, pay: payForSched(s, p.income),
        payAuto: payFor(teacher, p.income), payOverride: s.pay_override,
        taxi: Number(s.taxi_cost) || 0, concierge: Number(s.concierge_commission) || 0,
      };
    }), [scheds, perSched, payForSched, payFor]);

  const teacherOptions = useMemo(() => rates.map((r) => r.name).sort((a, b) => a.localeCompare(b)), [rates]);

  // Persist per-session finance fields (teacher, pay override, taxi, concierge).
  const patchSession = useCallback(async (id: string, p: { taxi_cost?: number; concierge_commission?: number; instructor?: string | null; pay_override?: number | null }) => {
    const { error } = await sb.from("class_schedule").update(p).eq("id", id);
    if (error) toast.error(error.message); else load();
  }, [load]);

  // Group the ledger by day (each day lists its class sessions) — mirrors the sheet.
  const ledgerByDay = useMemo(() => {
    const groups: { date: string; label: string; rows: typeof ledger; income: number; pay: number; net: number }[] = [];
    for (const r of ledger) {
      let g = groups.find((x) => x.date === r.date);
      if (!g) { g = { date: r.date, label: "", rows: [], income: 0, pay: 0, net: 0 }; groups.push(g); }
      g.rows.push(r); g.income += r.income; g.pay += r.pay; g.net += r.income - r.pay - r.taxi - r.concierge;
    }
    // Label with weekday from the first session of the day.
    for (const g of groups) {
      const first = scheds.find((s) => format(parseISO(s.start_time), "dd/MM/yyyy") === g.date);
      g.label = first ? format(parseISO(first.start_time), "EEE, MMM d") : g.date;
    }
    return groups;
  }, [ledger, scheds]);

  // Weekly (Mon–Sun) teacher-payment cut, clipped to the month.
  const payoutMap = useMemo(() => {
    const m = new Map<string, Payout>();
    for (const p of payouts) m.set(`${p.week_start}|${norm(p.teacher)}`, p);
    return m;
  }, [payouts]);
  const weekly = useMemo(() => {
    const mStart = startOfMonth(month), mEnd = endOfMonth(month);
    const weeks = eachWeekOfInterval({ start: mStart, end: mEnd }, { weekStartsOn: 1 });
    return weeks.map((wkStart) => {
      const wkEnd = endOfWeek(wkStart, { weekStartsOn: 1 });
      const dispStart = wkStart < mStart ? mStart : wkStart;
      const dispEnd = wkEnd > mEnd ? mEnd : wkEnd;
      const m = new Map<string, { pay: number; sessions: number }>();
      for (const s of scheds) {
        const d = parseISO(s.start_time);
        if (d < wkStart || d > wkEnd) continue;
        const t = teacherName(s);
        const inc = perSched.get(s.id)?.income ?? 0;
        const cur = m.get(t) ?? { pay: 0, sessions: 0 };
        cur.pay += payForSched(s, inc); cur.sessions += 1;
        m.set(t, cur);
      }
      const rows = [...m.entries()].map(([teacher, v]) => ({ teacher, ...v }))
        .sort((a, b) => b.pay - a.pay || a.teacher.localeCompare(b.teacher));
      return {
        weekStart: format(wkStart, "yyyy-MM-dd"),
        label: `${format(dispStart, "MMM d")} – ${format(dispEnd, "MMM d")}`,
        rows, total: rows.reduce((s, r) => s + r.pay, 0),
      };
    }).filter((w) => w.rows.length > 0);
  }, [scheds, perSched, payForSched, month]);

  const setPayout = useCallback(async (weekStart: string, teacher: string, patch: { paid?: boolean; note?: string }) => {
    const existing = payoutMap.get(`${weekStart}|${norm(teacher)}`);
    if (existing) {
      const { error } = await sb.from("class_teacher_payouts").update(patch).eq("id", existing.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await sb.from("class_teacher_payouts").insert({ week_start: weekStart, teacher, ...patch });
      if (error) { toast.error(error.message); return; }
    }
    loadPayouts();
  }, [payoutMap, loadPayouts]);

  const crc = (n: number) => `${n < 0 ? "-" : ""}₡${Math.abs(Math.round(n * crcRate)).toLocaleString("es-CR")}`;

  const exportCsv = () => {
    const header = ["Date", "Time", "Class", "Teacher", "PAX", "PayPal $", "CC $", "Cash $", "Other $", "Income $", "Teacher pay $", "Taxi $", "Concierge $", "HWC earnings $"];
    const rows = ledger.map((r) => [r.date, r.time, r.class, r.teacher, r.pax, r.paypal.toFixed(2), r.cc.toFixed(2), r.cash.toFixed(2), r.other.toFixed(2), r.income.toFixed(2), r.pay.toFixed(2), r.taxi.toFixed(2), r.concierge.toFixed(2), (r.income - r.pay - r.taxi - r.concierge).toFixed(2)]);
    const summary = [
      [], ["TOTAL", "", "", "", totals.pax, totals.paypal.toFixed(2), totals.cc.toFixed(2), totals.cash.toFixed(2), totals.other.toFixed(2), totals.income.toFixed(2), totals.teacherPay.toFixed(2), totals.taxi.toFixed(2), totals.concierge.toFixed(2), totals.netIncome.toFixed(2)],
      [], ["Income — PayPal", totals.paypal.toFixed(2)], ["Income — CC (card)", totals.cc.toFixed(2)], ["Income — Cash", totals.cash.toFixed(2)], ["Income — Other", totals.other.toFixed(2)],
      ["Gross income", totals.income.toFixed(2)], ["Teacher pay", totals.teacherPay.toFixed(2)],
      ["Taxi", totals.taxi.toFixed(2)], ["Concierge", totals.concierge.toFixed(2)],
      ["Net income (after teachers, taxi, concierge)", totals.netIncome.toFixed(2)], ["Monthly expenses", expensesTotal.toFixed(2)],
      ["NET PROFIT", totals.netProfit.toFixed(2)],
    ];
    const csv = [header, ...rows, ...summary].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `class-finances-${ym}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-heading font-bold text-foreground">Class Finances</h2>
          <p className="text-sm text-muted-foreground">Monthly income, teacher pay and net profit — income &amp; attendance are built automatically from class bookings.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="icon" onClick={() => setMonth(subMonths(month, 1))}><ChevronLeft className="h-4 w-4" /></Button>
          <h3 className="font-heading text-lg font-semibold min-w-[150px] text-center">{format(month, "MMMM yyyy")}</h3>
          <Button variant="outline" size="icon" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight className="h-4 w-4" /></Button>
          {!isSameMonth(month, new Date()) && <Button variant="ghost" size="sm" onClick={() => setMonth(new Date())}>This month</Button>}
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={loading || ledger.length === 0}><Download className="h-4 w-4 mr-1" /> CSV</Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…</div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi icon={DollarSign} label="Gross income" value={usd(totals.income)} sub={`${totals.sessions} sessions · ${totals.pax} PAX`} />
            <Kpi icon={Wallet} label="Teacher pay" value={usd(totals.teacherPay)} sub="fixed + commission" />
            <Kpi icon={Receipt} label="Monthly expenses" value={usd(expensesTotal)} sub={`${expenses.length} items`} />
            <Kpi icon={TrendingUp} label="Net profit" value={usd(totals.netProfit)} sub={crc(totals.netProfit)} accent={totals.netProfit >= 0} danger={totals.netProfit < 0} />
          </div>

          {/* Income split by payment source (prices differ by tax handling). */}
          <Card className="p-4">
            <h4 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Income by payment method</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MethodTile label="PayPal" value={usd(totals.paypal)} pct={totals.income ? (totals.paypal / totals.income) * 100 : 0} />
              <MethodTile label="Card (CC)" value={usd(totals.cc)} pct={totals.income ? (totals.cc / totals.income) * 100 : 0} />
              <MethodTile label="Cash" value={usd(totals.cash)} pct={totals.income ? (totals.cash / totals.income) * 100 : 0} />
              <MethodTile label="Other" value={usd(totals.other)} pct={totals.income ? (totals.other / totals.income) * 100 : 0} muted />
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">PayPal = online PayPal · CC = card in person · Cash = cash · Other = transfer / SINPE / gift card / package redemption / complimentary.</p>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-4">
              <h4 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">By teacher</h4>
              <SimpleTable
                cols={["Teacher", "Sessions", "PAX", "Income", "Pay"]}
                rows={byTeacher.map((t) => [t.name, String(t.sessions), String(t.pax), usd(t.income), usd(t.pay)])}
                empty="No sessions this month."
              />
            </Card>
            <Card className="p-4">
              <h4 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">By class</h4>
              <SimpleTable
                cols={["Class", "Sessions", "PAX", "Income"]}
                rows={byClass.map((t) => [t.name, String(t.sessions), String(t.pax), usd(t.income)])}
                empty="No sessions this month."
              />
            </Card>
          </div>

          {/* Session ledger */}
          <Card className="p-4">
            <datalist id="fin-teachers">
              {teacherOptions.map((n) => <option key={n} value={n} />)}
            </datalist>
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
              <h4 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">Session ledger ({ledger.length})</h4>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>₡ rate</span>
                <Input type="number" value={crcRate} onChange={(e) => setCrcRate(Math.max(1, Number(e.target.value) || 1))} className="h-7 w-20" />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mb-2">Pick the <strong>teacher</strong> from the list (or type a new one). The <strong>pay</strong> box shows the rate automatically — type a number to override it for that session (e.g. <strong>0</strong> = free, <strong>10</strong> = no-show); clear it to go back to the rate. Overridden pays are highlighted.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="py-2 pr-3">Date</th><th className="py-2 pr-3">Time</th><th className="py-2 pr-3">Class</th>
                    <th className="py-2 pr-3">Teacher</th><th className="py-2 pr-3 text-right">PAX</th>
                    <th className="py-2 pr-3 text-right">PayPal</th><th className="py-2 pr-3 text-right">CC</th><th className="py-2 pr-3 text-right">Cash</th>
                    {hasOther && <th className="py-2 pr-3 text-right">Other</th>}
                    <th className="py-2 pr-3 text-right">Income</th><th className="py-2 pr-3 text-right">Teacher pay</th>
                    <th className="py-2 pr-3 text-right w-24">Taxi</th><th className="py-2 pr-3 text-right w-24">Concierge</th>
                    <th className="py-2 text-right">HWC earns</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.length === 0 && <tr><td colSpan={hasOther ? 14 : 13} className="py-6 text-center text-muted-foreground">No sessions this month.</td></tr>}
                  {ledgerByDay.map((g) => (
                    <Fragment key={g.date}>
                      <tr className="bg-muted/50">
                        <td colSpan={hasOther ? 9 : 8} className="py-1.5 pr-3 font-semibold text-foreground">{g.label}</td>
                        <td className="py-1.5 pr-3 text-right font-medium">{usd(g.income)}</td>
                        <td className="py-1.5 pr-3 text-right text-muted-foreground">{usd(g.pay)}</td>
                        <td colSpan={2}></td>
                        <td className="py-1.5 text-right font-medium">{usd(g.net)}</td>
                      </tr>
                      {g.rows.map((r) => (
                        <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="py-1.5 pr-3 whitespace-nowrap"></td>
                          <td className="py-1.5 pr-3 whitespace-nowrap">{r.time}</td>
                          <td className="py-1.5 pr-3">{r.class}</td>
                          <td className="py-1.5 pr-3">
                            <input list="fin-teachers" defaultValue={r.teacher === "Unassigned" ? "" : r.teacher} placeholder="teacher…"
                              className="h-7 w-32 rounded-md border border-input bg-background px-2 text-sm"
                              onBlur={(e) => { const v = e.target.value.trim(); if (v !== (r.teacher === "Unassigned" ? "" : r.teacher)) patchSession(r.id, { instructor: v || null }); }} />
                          </td>
                          <td className="py-1.5 pr-3 text-right">{r.pax}</td>
                          <td className="py-1.5 pr-3 text-right text-muted-foreground">{r.paypal ? usd(r.paypal) : "—"}</td>
                          <td className="py-1.5 pr-3 text-right text-muted-foreground">{r.cc ? usd(r.cc) : "—"}</td>
                          <td className="py-1.5 pr-3 text-right text-muted-foreground">{r.cash ? usd(r.cash) : "—"}</td>
                          {hasOther && <td className="py-1.5 pr-3 text-right text-muted-foreground">{r.other ? usd(r.other) : "—"}</td>}
                          <td className="py-1.5 pr-3 text-right font-medium">{r.income ? usd(r.income) : "—"}</td>
                          <td className="py-1.5 pr-3 text-right">
                            <input type="number" defaultValue={r.payOverride != null ? r.payOverride : ""} placeholder={r.payAuto ? r.payAuto.toFixed(0) : "0"}
                              title={r.payOverride != null ? "Manual pay (overrides the rate). Clear to use the rate." : `Auto from rate${r.payAuto ? ` ($${r.payAuto.toFixed(2)})` : ""}. Type to override.`}
                              className={cn("h-7 w-16 rounded-md border px-1.5 text-right text-sm ml-auto", r.payOverride != null ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30" : "border-input bg-background")}
                              onBlur={(e) => {
                                const raw = e.target.value.trim();
                                const next = raw === "" ? null : Math.max(0, Number(raw) || 0);
                                if (next !== (r.payOverride ?? null)) patchSession(r.id, { pay_override: next });
                              }} /></td>
                          <td className="py-1.5 pr-3 text-right">
                            <Input type="number" defaultValue={r.taxi || ""} placeholder="0" className="h-7 w-20 text-right ml-auto"
                              onBlur={(e) => (Number(e.target.value) || 0) !== r.taxi && patchSession(r.id, { taxi_cost: Math.max(0, Number(e.target.value) || 0) })} />
                          </td>
                          <td className="py-1.5 pr-3 text-right">
                            <Input type="number" defaultValue={r.concierge || ""} placeholder="0" className="h-7 w-20 text-right ml-auto"
                              onBlur={(e) => (Number(e.target.value) || 0) !== r.concierge && patchSession(r.id, { concierge_commission: Math.max(0, Number(e.target.value) || 0) })} />
                          </td>
                          <td className="py-1.5 text-right font-medium">{usd(r.income - r.pay - r.taxi - r.concierge)}</td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
                {ledger.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-border font-semibold">
                      <td className="py-2 pr-3" colSpan={4}>Total — {format(month, "MMMM yyyy")}</td>
                      <td className="py-2 pr-3 text-right">{totals.pax}</td>
                      <td className="py-2 pr-3 text-right">{usd(totals.paypal)}</td>
                      <td className="py-2 pr-3 text-right">{usd(totals.cc)}</td>
                      <td className="py-2 pr-3 text-right">{usd(totals.cash)}</td>
                      {hasOther && <td className="py-2 pr-3 text-right">{usd(totals.other)}</td>}
                      <td className="py-2 pr-3 text-right">{usd(totals.income)}</td>
                      <td className="py-2 pr-3 text-right">{usd(totals.teacherPay)}</td>
                      <td className="py-2 pr-3 text-right">{usd(totals.taxi)}</td>
                      <td className="py-2 pr-3 text-right">{usd(totals.concierge)}</td>
                      <td className="py-2 text-right">{usd(totals.netIncome)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </Card>

          {/* Weekly teacher-payment cut (Mon–Sun) */}
          <Card className="p-4">
            <h4 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Weekly teacher payments (Mon–Sun)</h4>
            {weekly.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3">No teacher pay this month (set rates under "Teacher pay rates").</p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {weekly.map((w) => (
                  <div key={w.weekStart} className="rounded-lg border border-border overflow-hidden">
                    <div className="flex items-center justify-between bg-muted/50 px-3 py-2">
                      <span className="text-sm font-semibold">Week {w.label}</span>
                      <span className="text-sm font-semibold">{usd(w.total)}</span>
                    </div>
                    <table className="w-full text-sm">
                      <tbody>
                        {w.rows.map((r) => {
                          const po = payoutMap.get(`${w.weekStart}|${norm(r.teacher)}`);
                          const paid = po?.paid ?? false;
                          return (
                            <tr key={r.teacher} className="border-t border-border/50">
                              <td className="py-1.5 px-3 font-medium">{r.teacher}<span className="text-xs text-muted-foreground ml-1">· {r.sessions}</span></td>
                              <td className="py-1.5 px-2 text-right whitespace-nowrap">{usd(r.pay)}</td>
                              <td className="py-1.5 px-2 w-24">
                                <button
                                  onClick={() => setPayout(w.weekStart, r.teacher, { paid: !paid })}
                                  className={cn("text-xs px-2 py-1 rounded-full font-medium w-full", paid ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground hover:bg-border")}
                                >
                                  {paid ? "Paid ✓" : "Pending"}
                                </button>
                              </td>
                              <td className="py-1.5 pr-3 w-40">
                                <Input defaultValue={po?.note ?? ""} placeholder="note…" className="h-7 text-xs"
                                  onBlur={(e) => e.target.value !== (po?.note ?? "") && setPayout(w.weekStart, r.teacher, { note: e.target.value })} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Managers */}
          <TeacherRatesManager rates={rates} reload={loadRates} open={showRates} setOpen={setShowRates} />
          <ExpensesManager ym={ym} monthLabel={format(month, "MMMM yyyy")} prevYm={format(subMonths(month, 1), "yyyy-MM")}
            expenses={expenses} total={expensesTotal} reload={loadExpenses} open={showExpenses} setOpen={setShowExpenses} />
        </>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, accent, danger }: { icon: any; label: string; value: string; sub?: string; accent?: boolean; danger?: boolean }) {
  return (
    <Card className={cn("p-4", accent && "border-emerald-500/40 bg-emerald-500/5", danger && "border-destructive/40 bg-destructive/5")}>
      <div className="flex items-center gap-2 text-muted-foreground mb-1"><Icon className="h-4 w-4" /><span className="text-xs uppercase tracking-wide">{label}</span></div>
      <p className={cn("text-2xl font-bold leading-tight", danger ? "text-destructive" : "text-foreground")}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </Card>
  );
}

function MethodTile({ label, value, pct, muted }: { label: string; value: string; pct: number; muted?: boolean }) {
  return (
    <div className={cn("rounded-lg border border-border p-3", muted && "opacity-80")}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-xl font-bold text-foreground leading-tight">{value}</p>
      <p className="text-xs text-muted-foreground">{pct.toFixed(0)}% of income</p>
    </div>
  );
}

function SimpleTable({ cols, rows, empty }: { cols: string[]; rows: string[][]; empty: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-left text-xs text-muted-foreground border-b border-border">{cols.map((c, i) => <th key={c} className={cn("py-2 pr-3", i > 0 && "text-right")}>{c}</th>)}</tr></thead>
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

// ── Teacher rates manager ──
function TeacherRatesManager({ rates, reload, open, setOpen }: { rates: Rate[]; reload: () => void; open: boolean; setOpen: (v: boolean) => void; }) {
  const [newName, setNewName] = useState("");
  const patch = async (id: string, p: Partial<Rate>) => {
    const { error } = await sb.from("class_teacher_rates").update(p).eq("id", id);
    if (error) toast.error(error.message); else reload();
  };
  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    const { error } = await sb.from("class_teacher_rates").insert({ name });
    if (error) toast.error(error.message.includes("duplicate") ? "That teacher already exists" : error.message);
    else { setNewName(""); reload(); }
  };
  const del = async (id: string) => {
    if (!confirm("Remove this teacher rate?")) return;
    const { error } = await sb.from("class_teacher_rates").delete().eq("id", id);
    if (error) toast.error(error.message); else reload();
  };
  return (
    <Card className="p-4">
      <button className="w-full flex items-center justify-between" onClick={() => setOpen(!open)}>
        <h4 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2"><Wallet className="h-4 w-4" /> Teacher pay rates ({rates.length})</h4>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground">Pay per session = <strong>fixed</strong> + <strong>commission %</strong> of that session's income. Leave both at 0 for volunteer/unpaid. Matched to the teacher name on each session.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground border-b border-border"><th className="py-2 pr-3">Teacher</th><th className="py-2 pr-3 w-28">Fixed / class $</th><th className="py-2 pr-3 w-28">Commission %</th><th className="py-2 pr-3 w-16">Active</th><th className="py-2 w-10"></th></tr></thead>
              <tbody>
                {rates.map((r) => (
                  <tr key={r.id} className="border-b border-border/50">
                    <td className="py-1.5 pr-3 font-medium">{r.name}</td>
                    <td className="py-1.5 pr-3"><Input type="number" defaultValue={r.fixed_per_class} className="h-8 w-24" onBlur={(e) => Number(e.target.value) !== Number(r.fixed_per_class) && patch(r.id, { fixed_per_class: Math.max(0, Number(e.target.value) || 0) })} /></td>
                    <td className="py-1.5 pr-3"><Input type="number" defaultValue={r.commission_pct} className="h-8 w-24" onBlur={(e) => Number(e.target.value) !== Number(r.commission_pct) && patch(r.id, { commission_pct: Math.max(0, Number(e.target.value) || 0) })} /></td>
                    <td className="py-1.5 pr-3"><Switch checked={r.active} onCheckedChange={(v) => patch(r.id, { active: v })} /></td>
                    <td className="py-1.5"><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => del(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button></td>
                  </tr>
                ))}
                {rates.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">No teachers yet — add one below.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New teacher name" className="h-8 max-w-xs" onKeyDown={(e) => e.key === "Enter" && add()} />
            <Button size="sm" variant="outline" onClick={add}><Plus className="h-4 w-4 mr-1" /> Add teacher</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Monthly expenses manager ──
function ExpensesManager({ ym, monthLabel, prevYm, expenses, total, reload, open, setOpen }: {
  ym: string; monthLabel: string; prevYm: string; expenses: Expense[]; total: number; reload: () => void; open: boolean; setOpen: (v: boolean) => void;
}) {
  const patch = async (id: string, p: Partial<Expense>) => {
    const { error } = await sb.from("monthly_expenses").update(p).eq("id", id);
    if (error) toast.error(error.message); else reload();
  };
  const add = async (category: string) => {
    const max = Math.max(0, ...expenses.map((e) => e.sort_order));
    const { error } = await sb.from("monthly_expenses").insert({ ym, label: "New expense", amount: 0, category, sort_order: max + 1 });
    if (error) toast.error(error.message); else reload();
  };
  const del = async (id: string) => {
    const { error } = await sb.from("monthly_expenses").delete().eq("id", id);
    if (error) toast.error(error.message); else reload();
  };
  const copyPrev = async () => {
    const { data } = await sb.from("monthly_expenses").select("label, amount, category, sort_order").eq("ym", prevYm);
    const rows = (data ?? []) as Expense[];
    if (!rows.length) { toast.info("No expenses in the previous month to copy."); return; }
    if (!confirm(`Copy ${rows.length} expense line(s) from ${prevYm} into ${ym}?`)) return;
    const { error } = await sb.from("monthly_expenses").insert(rows.map((r) => ({ ym, label: r.label, amount: r.amount, category: r.category, sort_order: r.sort_order })));
    if (error) toast.error(error.message); else { toast.success("Copied"); reload(); }
  };
  const group = (cat: string) => expenses.filter((e) => e.category === cat);
  const row = (e: Expense) => (
    <tr key={e.id} className="border-b border-border/50">
      <td className="py-1.5 pr-3"><Input defaultValue={e.label} className="h-8" onBlur={(ev) => ev.target.value !== e.label && patch(e.id, { label: ev.target.value })} /></td>
      <td className="py-1.5 pr-3 w-32"><Input type="number" defaultValue={e.amount} className="h-8 w-28 text-right" onBlur={(ev) => Number(ev.target.value) !== Number(e.amount) && patch(e.id, { amount: Math.max(0, Number(ev.target.value) || 0) })} /></td>
      <td className="py-1.5 w-10"><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => del(e.id)}><Trash2 className="h-3.5 w-3.5" /></Button></td>
    </tr>
  );
  return (
    <Card className="p-4">
      <button className="w-full flex items-center justify-between" onClick={() => setOpen(!open)}>
        <h4 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2"><Receipt className="h-4 w-4" /> Monthly expenses — {monthLabel} ({usd(total)})</h4>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <div className="mt-3 space-y-4">
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={copyPrev}><Copy className="h-4 w-4 mr-1" /> Copy from previous month</Button>
          </div>
          {(["fixed", "variable"] as const).map((cat) => (
            <div key={cat}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">{cat === "fixed" ? "Fixed expenses" : "Variable expenses"}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {group(cat).map(row)}
                    {group(cat).length === 0 && <tr><td className="py-3 text-muted-foreground text-sm">None yet.</td></tr>}
                  </tbody>
                </table>
              </div>
              <Button size="sm" variant="outline" className="h-8 mt-1" onClick={() => add(cat)}><Plus className="h-3.5 w-3.5 mr-1" /> Add {cat} expense</Button>
            </div>
          ))}
          <div className="flex justify-between border-t border-border pt-2 text-sm font-semibold">
            <span>Total expenses — {monthLabel}</span><span>{usd(total)}</span>
          </div>
        </div>
      )}
    </Card>
  );
}
