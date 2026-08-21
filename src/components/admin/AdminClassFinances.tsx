import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  ChevronLeft, ChevronRight, Download, Loader2, DollarSign, Wallet, Receipt, TrendingUp,
  Plus, Trash2, Copy, ChevronDown, ChevronUp, Save, Sparkles,
} from "lucide-react";
import {
  format, startOfMonth, endOfMonth, addMonths, subMonths, parseISO, isSameMonth,
  startOfWeek, endOfWeek, eachWeekOfInterval, isSameDay, isSameWeek,
  startOfDay, endOfDay, addDays, subDays, addWeeks, subWeeks,
} from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const sb = supabase as any;
const CRC_RATE_KEY = "hwc_crc_rate";
const usd = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const norm = (s: string) => s.trim().toLowerCase();

interface Rec {
  id: string; entry_date: string; time_label: string | null; pax: number; yoga_class: string | null;
  location: string; client_type: string | null; paypal_deposit: number; drop_in: number; member_income: number; instructor: string | null;
  comm_teacher_pct: number; salario_teacher: number; paid: boolean; taxi: number; concierge: string | null;
  comm_concierge_pct: number; comm_concierge: number; note: string | null; sort_order: number;
}
interface FinOption { id: string; kind: string; label: string; sort_order: number; }
interface Rate { id: string; name: string; fixed_per_class: number; commission_pct: number; active: boolean; }
interface Expense { id: string; ym: string; label: string; amount: number; category: string; sort_order: number; }
interface Payout { id: string; week_start: string; teacher: string; paid: boolean; note: string | null; }

// ── Row math ──
const rIncome = (r: Rec) => (Number(r.paypal_deposit) || 0) + (Number(r.drop_in) || 0) + (Number(r.member_income) || 0);
const rCommTeacher = (r: Rec) => ((Number(r.comm_teacher_pct) || 0) / 100) * rIncome(r);
const rConc = (r: Rec) => (Number(r.comm_concierge_pct) || 0) > 0 ? ((Number(r.comm_concierge_pct) || 0) / 100) * rIncome(r) : (Number(r.comm_concierge) || 0);
const rTeacherPay = (r: Rec) => rCommTeacher(r) + (Number(r.salario_teacher) || 0);
const rHwc = (r: Rec) => rIncome(r) - rTeacherPay(r) - (Number(r.taxi) || 0) - rConc(r);

type FinView = "day" | "week" | "month";
const emptyRow = (date: string, sort: number): Rec => ({
  id: `new-${Math.random().toString(36).slice(2)}`, entry_date: date, time_label: "", pax: 0, yoga_class: "",
  location: "HWC", client_type: "", paypal_deposit: 0, drop_in: 0, member_income: 0, instructor: "", comm_teacher_pct: 0,
  salario_teacher: 0, paid: false, taxi: 0, concierge: "", comm_concierge_pct: 0, comm_concierge: 0, note: "", sort_order: sort,
});

export function AdminClassFinances() {
  const [month, setMonth] = useState(new Date());
  const [view, setView] = useState<FinView>("day");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState<Rec[]>([]);       // server copy
  const [rows, setRows] = useState<Rec[]>([]);           // editable working copy
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [rates, setRates] = useState<Rate[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [options, setOptions] = useState<FinOption[]>([]);
  const [showRates, setShowRates] = useState(false);
  const [showExpenses, setShowExpenses] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [crcRate, setCrcRate] = useState<number>(() => {
    const v = Number(localStorage.getItem(CRC_RATE_KEY));
    return Number.isFinite(v) && v > 0 ? v : 505;
  });
  useEffect(() => { localStorage.setItem(CRC_RATE_KEY, String(crcRate)); }, [crcRate]);

  const ym = format(month, "yyyy-MM");
  const rangeStart = view === "month" ? startOfMonth(month) : view === "week" ? startOfWeek(month, { weekStartsOn: 1 }) : startOfDay(month);
  const rangeEnd = view === "month" ? endOfMonth(month) : view === "week" ? endOfWeek(month, { weekStartsOn: 1 }) : endOfDay(month);
  const startStr = format(rangeStart, "yyyy-MM-dd");
  const endStr = format(rangeEnd, "yyyy-MM-dd");

  const loadRates = useCallback(async () => {
    const { data } = await sb.from("class_teacher_rates").select("*").order("name");
    setRates((data ?? []) as Rate[]);
  }, []);
  const loadOptions = useCallback(async () => {
    const { data } = await sb.from("class_finance_options").select("*").order("sort_order").order("label");
    setOptions((data ?? []) as FinOption[]);
  }, []);
  const clientTypeOptions = useMemo(() => options.filter((o) => o.kind === "client_type").map((o) => o.label), [options]);
  const salarioOptions = useMemo(() => options.filter((o) => o.kind === "salario").map((o) => o.label), [options]);
  const loadExpenses = useCallback(async () => {
    const { data } = await sb.from("monthly_expenses").select("*").eq("ym", ym).order("sort_order").order("created_at");
    setExpenses((data ?? []) as Expense[]);
  }, [ym]);
  const loadPayouts = useCallback(async () => {
    const from = format(startOfWeek(rangeStart, { weekStartsOn: 1 }), "yyyy-MM-dd");
    const { data } = await sb.from("class_teacher_payouts").select("*").gte("week_start", from).lte("week_start", endStr);
    setPayouts((data ?? []) as Payout[]);
  }, [startStr, endStr]); // eslint-disable-line react-hooks/exhaustive-deps
  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await sb.from("class_records").select("*").gte("entry_date", startStr).lte("entry_date", endStr).order("entry_date").order("sort_order");
    const recs = ((data ?? []) as Rec[]);
    setLoaded(recs);
    setRows(recs.map((r) => ({ ...r })));
    setDeletedIds([]);
    setLoading(false);
  }, [startStr, endStr]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); loadExpenses(); loadPayouts(); }, [load, loadExpenses, loadPayouts]);
  useEffect(() => { loadRates(); loadOptions(); sb.from("classes").select("title").eq("is_active", true).order("title").then(({ data }: any) => setClasses(((data ?? []) as any[]).map((c) => c.title))); }, [loadRates, loadOptions]);

  const dirty = deletedIds.length > 0 || JSON.stringify(rows) !== JSON.stringify(loaded);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const teacherOptions = useMemo(() => {
    const set = new Set<string>(rates.map((r) => r.name));
    rows.forEach((r) => { if (r.instructor) set.add(r.instructor); });
    return [...set].filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [rates, rows]);

  // ── Row ops ──
  const updateRow = (id: string, patch: Partial<Rec>) => setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRow = () => {
    const d = view === "day" ? format(month, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");
    setRows((prev) => [...prev, emptyRow(d, Math.max(0, ...prev.map((r) => r.sort_order)) + 1)]);
  };
  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    if (!id.startsWith("new-")) setDeletedIds((prev) => [...prev, id]);
  };
  const addTeacher = async () => {
    const name = window.prompt("New teacher name:")?.trim();
    if (!name) return;
    const { error } = await sb.from("class_teacher_rates").insert({ name });
    if (error && !String(error.message).toLowerCase().includes("duplicate")) { toast.error(error.message); return; }
    loadRates();
    toast.success(`Added ${name}`);
  };
  const generateFromCalendar = async () => {
    if (!confirm(`Add a draft row for each class scheduled in this ${view}? You then fill in the amounts.`)) return;
    const { data: sc } = await sb.from("class_schedule")
      .select("id, start_time, is_cancelled, instructor, classes(title, instructor)")
      .gte("start_time", `${startStr}T00:00:00Z`).lte("start_time", `${endStr}T23:59:59Z`).order("start_time");
    const active = (((sc as any) ?? []) as any[]).filter((s) => !s.is_cancelled);
    if (!active.length) { toast.info("No classes scheduled in this period."); return; }
    let sort = Math.max(0, ...rows.map((r) => r.sort_order));
    const gen: Rec[] = active.map((s) => {
      const d = parseISO(s.start_time);
      return { ...emptyRow(format(d, "yyyy-MM-dd"), ++sort), time_label: format(d, "HH:mm"),
        yoga_class: s.classes?.title ?? "", instructor: (s.instructor ?? s.classes?.instructor ?? "") || "" };
    });
    setRows((prev) => [...prev, ...gen]);
    toast.success(`Added ${gen.length} draft rows — fill in amounts, then Save.`);
  };
  const saveAll = async () => {
    setSaving(true);
    try {
      const strip = (r: Rec) => { const { id, ...rest } = r; return rest; };
      const inserts = rows.filter((r) => r.id.startsWith("new-")).map(strip);
      const loadedMap = new Map(loaded.map((r) => [r.id, JSON.stringify(r)]));
      const updates = rows.filter((r) => !r.id.startsWith("new-") && loadedMap.get(r.id) !== JSON.stringify(r));
      if (deletedIds.length) { const { error } = await sb.from("class_records").delete().in("id", deletedIds); if (error) throw error; }
      for (const u of updates) { const { id, ...rest } = u; const { error } = await sb.from("class_records").update(rest).eq("id", id); if (error) throw error; }
      if (inserts.length) { const { error } = await sb.from("class_records").insert(inserts); if (error) throw error; }
      toast.success("Saved");
      load();
    } catch (e: any) { toast.error(e.message ?? "Save failed"); } finally { setSaving(false); }
  };
  const discardAll = () => { setRows(loaded.map((r) => ({ ...r }))); setDeletedIds([]); };

  // ── Aggregations (from working rows) ──
  const totals = useMemo(() => {
    const t = { paypal: 0, drop: 0, member: 0, income: 0, teacherPay: 0, taxi: 0, conc: 0, hwc: 0, pax: 0, rows: rows.length };
    for (const r of rows) {
      t.paypal += Number(r.paypal_deposit) || 0; t.drop += Number(r.drop_in) || 0; t.member += Number(r.member_income) || 0;
      t.income += rIncome(r); t.teacherPay += rTeacherPay(r); t.taxi += Number(r.taxi) || 0; t.conc += rConc(r);
      t.hwc += rHwc(r); t.pax += Number(r.pax) || 0;
    }
    return t;
  }, [rows]);
  const expensesTotal = useMemo(() => expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0), [expenses]);
  const netProfit = totals.hwc - expensesTotal;

  const byTeacher = useMemo(() => {
    const m = new Map<string, { rows: number; income: number; pay: number }>();
    for (const r of rows) {
      const t = (r.instructor || "Unassigned").trim() || "Unassigned";
      const cur = m.get(t) ?? { rows: 0, income: 0, pay: 0 };
      cur.rows += 1; cur.income += rIncome(r); cur.pay += rTeacherPay(r); m.set(t, cur);
    }
    return [...m.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.pay - a.pay || b.income - a.income);
  }, [rows]);
  const byClientType = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) { const k = (r.client_type || "—").trim() || "—"; m.set(k, (m.get(k) ?? 0) + rIncome(r)); }
    return [...m.entries()].map(([name, income]) => ({ name, income })).sort((a, b) => b.income - a.income);
  }, [rows]);

  const rowsByDay = useMemo(() => {
    const groups: { date: string; label: string; rows: Rec[]; income: number; hwc: number }[] = [];
    const sorted = [...rows].sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.sort_order - b.sort_order);
    for (const r of sorted) {
      let g = groups.find((x) => x.date === r.entry_date);
      if (!g) { g = { date: r.entry_date, label: format(parseISO(r.entry_date), "EEE, MMM d"), rows: [], income: 0, hwc: 0 }; groups.push(g); }
      g.rows.push(r); g.income += rIncome(r); g.hwc += rHwc(r);
    }
    return groups;
  }, [rows]);

  // Weekly teacher-payment cut (Mon–Sun) from the manual rows.
  const payoutMap = useMemo(() => { const m = new Map<string, Payout>(); for (const p of payouts) m.set(`${p.week_start}|${norm(p.teacher)}`, p); return m; }, [payouts]);
  const weekly = useMemo(() => {
    const weeks = eachWeekOfInterval({ start: rangeStart, end: rangeEnd }, { weekStartsOn: 1 });
    return weeks.map((wkStart) => {
      const wkEnd = endOfWeek(wkStart, { weekStartsOn: 1 });
      const dispStart = wkStart < rangeStart ? rangeStart : wkStart;
      const dispEnd = wkEnd > rangeEnd ? rangeEnd : wkEnd;
      const m = new Map<string, number>();
      for (const r of rows) {
        const d = parseISO(r.entry_date);
        if (d < wkStart || d > wkEnd) continue;
        const t = (r.instructor || "").trim(); if (!t) continue;
        m.set(t, (m.get(t) ?? 0) + rTeacherPay(r));
      }
      const rws = [...m.entries()].map(([teacher, pay]) => ({ teacher, pay })).filter((x) => x.pay !== 0).sort((a, b) => b.pay - a.pay);
      return { weekStart: format(wkStart, "yyyy-MM-dd"), label: `${format(dispStart, "MMM d")} – ${format(dispEnd, "MMM d")}`, rows: rws, total: rws.reduce((s, r) => s + r.pay, 0) };
    }).filter((w) => w.rows.length > 0);
  }, [rows, startStr, endStr]); // eslint-disable-line react-hooks/exhaustive-deps
  const setPayout = useCallback(async (weekStart: string, teacher: string, patch: { paid?: boolean; note?: string }) => {
    const existing = payoutMap.get(`${weekStart}|${norm(teacher)}`);
    if (existing) { const { error } = await sb.from("class_teacher_payouts").update(patch).eq("id", existing.id); if (error) { toast.error(error.message); return; } }
    else { const { error } = await sb.from("class_teacher_payouts").insert({ week_start: weekStart, teacher, ...patch }); if (error) { toast.error(error.message); return; } }
    loadPayouts();
  }, [payoutMap, loadPayouts]);

  const crc = (n: number) => `${n < 0 ? "-" : ""}₡${Math.abs(Math.round(n * crcRate)).toLocaleString("es-CR")}`;

  const goPrev = () => setMonth(view === "month" ? subMonths(month, 1) : view === "week" ? subWeeks(month, 1) : subDays(month, 1));
  const goNext = () => setMonth(view === "month" ? addMonths(month, 1) : view === "week" ? addWeeks(month, 1) : addDays(month, 1));
  const periodTitle = view === "month" ? format(month, "MMMM yyyy") : view === "week" ? `${format(rangeStart, "MMM d")} – ${format(rangeEnd, "MMM d, yyyy")}` : format(month, "EEE, MMM d yyyy");
  const isCurrent = view === "month" ? isSameMonth(month, new Date()) : view === "week" ? isSameWeek(month, new Date(), { weekStartsOn: 1 }) : isSameDay(month, new Date());

  const newMembershipSale = () => {
    sessionStorage.setItem("open_new_order", "1");
    window.dispatchEvent(new CustomEvent("admin-tab", { detail: "calendars" }));
    window.dispatchEvent(new CustomEvent("admin-cal-type-class"));
  };

  const exportCsv = () => {
    const header = ["Date", "Time", "PAX", "Class", "Client type", "PayPal $", "Drop-in $", "Member $", "Instructor", "Comm %", "Comm $", "Salario $", "Paid", "Taxi $", "Concierge", "CommConc %", "CommConc $", "HWC $", "Note"];
    const body = [...rows].sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.sort_order - b.sort_order).map((r) => [
      r.entry_date, r.time_label ?? "", r.pax, r.yoga_class ?? "", r.client_type ?? "", (Number(r.paypal_deposit) || 0).toFixed(2), (Number(r.drop_in) || 0).toFixed(2), (Number(r.member_income) || 0).toFixed(2),
      r.instructor ?? "", (Number(r.comm_teacher_pct) || 0).toString(), rCommTeacher(r).toFixed(2), (Number(r.salario_teacher) || 0).toFixed(2), r.paid ? "yes" : "no",
      (Number(r.taxi) || 0).toFixed(2), r.concierge ?? "", (Number(r.comm_concierge_pct) || 0).toString(), rConc(r).toFixed(2), rHwc(r).toFixed(2), r.note ?? "",
    ]);
    const summary = [[], ["TOTAL", "", totals.pax, "", "", totals.paypal.toFixed(2), totals.drop.toFixed(2), totals.member.toFixed(2), "", "", "", totals.teacherPay.toFixed(2), "", totals.taxi.toFixed(2), "", "", totals.conc.toFixed(2), totals.hwc.toFixed(2)],
      [], ["Gross income", totals.income.toFixed(2)], ["Teacher pay", totals.teacherPay.toFixed(2)], ["Taxi", totals.taxi.toFixed(2)], ["Concierge", totals.conc.toFixed(2)], ["HWC earnings", totals.hwc.toFixed(2)],
      ...(view === "month" ? [["Monthly expenses", expensesTotal.toFixed(2)], ["NET PROFIT", netProfit.toFixed(2)]] : [])];
    const csv = [header, ...body, ...summary].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `class-records-${startStr}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const numCell = (r: Rec, key: keyof Rec, w = "w-16") => (
    <input type="number" value={(r[key] as number) || ""} placeholder="0"
      className={cn("h-7 rounded border border-input bg-background px-1 text-right text-xs", w)}
      onChange={(e) => updateRow(r.id, { [key]: Math.max(0, Number(e.target.value) || 0) } as any)} />
  );

  return (
    <div className="space-y-5">
      <datalist id="cr-teachers">{teacherOptions.map((n) => <option key={n} value={n} />)}</datalist>
      <datalist id="cr-classes">{classes.map((n) => <option key={n} value={n} />)}</datalist>
      <datalist id="cr-clients">{clientTypeOptions.map((n) => <option key={n} value={n} />)}</datalist>
      <datalist id="cr-salario">{salarioOptions.map((n) => <option key={n} value={n} />)}</datalist>

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-heading font-bold text-foreground">Class Finances</h2>
          <p className="text-sm text-muted-foreground">Manual class records — enter each line like your sheet. View by day, week or month.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-lg border border-border p-0.5">
            {(["day", "week", "month"] as FinView[]).map((v) => (
              <button key={v} onClick={() => { if (!dirty || confirm("Discard unsaved changes?")) setView(v); }}
                className={cn("px-2.5 py-1 text-xs font-medium rounded-md capitalize transition-colors", view === v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>{v}</button>
            ))}
          </div>
          <Button variant="outline" size="icon" onClick={() => { if (!dirty || confirm("Discard unsaved changes?")) goPrev(); }}><ChevronLeft className="h-4 w-4" /></Button>
          <h3 className="font-heading text-base font-semibold min-w-[170px] text-center">{periodTitle}</h3>
          <Button variant="outline" size="icon" onClick={() => { if (!dirty || confirm("Discard unsaved changes?")) goNext(); }}><ChevronRight className="h-4 w-4" /></Button>
          {!isCurrent && <Button variant="ghost" size="sm" onClick={() => setMonth(new Date())}>Today</Button>}
          <Button variant="outline" size="sm" onClick={newMembershipSale}><Plus className="h-4 w-4 mr-1" /> Membership sale</Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}><Download className="h-4 w-4 mr-1" /> CSV</Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…</div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi icon={DollarSign} label="Gross income" value={usd(totals.income)} sub={`${totals.rows} rows · ${totals.pax} PAX`} />
            <Kpi icon={Wallet} label="Teacher pay" value={usd(totals.teacherPay)} sub="commission + salary" />
            {view === "month" ? (<>
              <Kpi icon={Receipt} label="Monthly expenses" value={usd(expensesTotal)} sub={`${expenses.length} items`} />
              <Kpi icon={TrendingUp} label="Net profit" value={usd(netProfit)} sub={crc(netProfit)} accent={netProfit >= 0} danger={netProfit < 0} />
            </>) : (
              <Kpi icon={TrendingUp} label="HWC earnings" value={usd(totals.hwc)} sub={`${view === "week" ? "this week" : "this day"} · after teacher/costs`} accent={totals.hwc >= 0} danger={totals.hwc < 0} />
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-4">
              <h4 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">By teacher</h4>
              <SimpleTable cols={["Teacher", "Lines", "Income", "Pay"]} rows={byTeacher.map((t) => [t.name, String(t.rows), usd(t.income), usd(t.pay)])} empty="No rows yet." />
            </Card>
            <Card className="p-4">
              <h4 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Income by client type</h4>
              <SimpleTable cols={["Client type", "Income"]} rows={byClientType.map((t) => [t.name, usd(t.income)])} empty="No rows yet." />
            </Card>
          </div>

          {/* The editable grid */}
          <Card className="p-4">
            {dirty && (
              <div className="sticky top-0 z-20 -mx-4 -mt-4 mb-3 px-4 py-2 flex items-center justify-between gap-3 bg-amber-100 dark:bg-amber-950/50 border-b border-amber-300 rounded-t-xl">
                <span className="text-sm font-medium text-amber-900 dark:text-amber-200">Unsaved changes</span>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={discardAll} disabled={saving}>Discard</Button>
                  <Button size="sm" onClick={saveAll} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Save</Button>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              <h4 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">Class records ({rows.length})</h4>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><span>₡ rate</span>
                  <Input type="number" value={crcRate} onChange={(e) => setCrcRate(Math.max(1, Number(e.target.value) || 1))} className="h-7 w-20" /></div>
                <Button size="sm" variant="outline" onClick={generateFromCalendar}><Sparkles className="h-4 w-4 mr-1" /> Generate from calendar</Button>
                <Button size="sm" onClick={addRow}><Plus className="h-4 w-4 mr-1" /> Add row</Button>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mb-2">Each row is one line (like your sheet). Fill Client type, PayPal/Drop-in, Instructor, Salario, Taxi, Concierge — <strong>HWC earnings</strong> = PayPal + Drop-in − (comm + salario) − taxi − concierge. Nothing saves until you press <strong>Save</strong>.</p>
            <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
              <table className="text-xs" style={{ minWidth: 1400 }}>
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border">
                    {["Time", "PAX", "Class", "Client type", "PayPal", "Drop-in", "Member", "Instructor", "Comm%", "Salario", "Paid", "Taxi", "Concierge", "CC%", "CC$", "HWC", "Note", ""].map((h, i) => <th key={i} className="py-2 px-1 bg-card whitespace-nowrap" title={h === "Member" ? "Pass/membership share for this class at YOUR price (e.g. $45 5-pass = $9/class)" : undefined}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && <tr><td colSpan={18} className="py-6 text-center text-muted-foreground">No rows. Use “Add row” or “Generate from calendar”.</td></tr>}
                  {rowsByDay.map((g) => (
                    <Fragment key={g.date}>
                      <tr className="bg-muted/50"><td colSpan={15} className="py-1 px-1 font-semibold">{g.label} · income {usd(g.income)}</td><td className="py-1 px-1 text-right font-medium">{usd(g.hwc)}</td><td colSpan={2}></td></tr>
                      {g.rows.map((r) => (
                        <tr key={r.id} className={cn("border-b border-border/50", r.id.startsWith("new-") && "bg-amber-50/40 dark:bg-amber-950/10")}>
                          <td className="px-1 py-1"><input value={r.time_label ?? ""} placeholder="8:00" className="h-7 w-14 rounded border border-input bg-background px-1 text-xs" onChange={(e) => updateRow(r.id, { time_label: e.target.value })} /></td>
                          <td className="px-1 py-1"><input type="number" value={r.pax || ""} placeholder="0" className="h-7 w-10 rounded border border-input bg-background px-1 text-right text-xs" onChange={(e) => updateRow(r.id, { pax: Math.max(0, Number(e.target.value) || 0) })} /></td>
                          <td className="px-1 py-1"><input list="cr-classes" value={r.yoga_class ?? ""} placeholder="class" className="h-7 w-36 rounded border border-input bg-background px-1 text-xs" onChange={(e) => updateRow(r.id, { yoga_class: e.target.value })} /></td>
                          <td className="px-1 py-1"><input list="cr-clients" value={r.client_type ?? ""} placeholder="client type" className="h-7 w-32 rounded border border-input bg-background px-1 text-xs" onChange={(e) => updateRow(r.id, { client_type: e.target.value })} /></td>
                          <td className="px-1 py-1">{numCell(r, "paypal_deposit")}</td>
                          <td className="px-1 py-1">{numCell(r, "drop_in")}</td>
                          <td className="px-1 py-1">{numCell(r, "member_income")}</td>
                          <td className="px-1 py-1"><input list="cr-teachers" value={r.instructor ?? ""} placeholder="teacher" className="h-7 w-28 rounded border border-input bg-background px-1 text-xs" onChange={(e) => updateRow(r.id, { instructor: e.target.value })} /></td>
                          <td className="px-1 py-1">{numCell(r, "comm_teacher_pct", "w-12")}</td>
                          <td className="px-1 py-1"><input list="cr-salario" type="number" value={r.salario_teacher || ""} placeholder="0" className="h-7 w-14 rounded border border-input bg-background px-1 text-right text-xs" onChange={(e) => updateRow(r.id, { salario_teacher: Math.max(0, Number(e.target.value) || 0) })} /></td>
                          <td className="px-1 py-1 text-center"><input type="checkbox" checked={r.paid} onChange={(e) => updateRow(r.id, { paid: e.target.checked })} /></td>
                          <td className="px-1 py-1">{numCell(r, "taxi", "w-14")}</td>
                          <td className="px-1 py-1"><input value={r.concierge ?? ""} placeholder="—" className="h-7 w-24 rounded border border-input bg-background px-1 text-xs" onChange={(e) => updateRow(r.id, { concierge: e.target.value })} /></td>
                          <td className="px-1 py-1">{numCell(r, "comm_concierge_pct", "w-12")}</td>
                          <td className="px-1 py-1">{numCell(r, "comm_concierge", "w-14")}</td>
                          <td className="px-1 py-1 text-right font-medium whitespace-nowrap">{usd(rHwc(r))}</td>
                          <td className="px-1 py-1"><input value={r.note ?? ""} placeholder="note" className="h-7 w-28 rounded border border-input bg-background px-1 text-xs" onChange={(e) => updateRow(r.id, { note: e.target.value })} /></td>
                          <td className="px-1 py-1"><button onClick={() => removeRow(r.id)} className="text-destructive hover:opacity-70"><Trash2 className="h-3.5 w-3.5" /></button></td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
                {rows.length > 0 && (
                  <tfoot className="sticky bottom-0 bg-card">
                    <tr className="border-t border-border font-semibold">
                      <td className="px-1 py-2 bg-card" colSpan={4}>Total — {periodTitle}</td>
                      <td className="px-1 py-2 text-right bg-card">{usd(totals.paypal)}</td>
                      <td className="px-1 py-2 text-right bg-card">{usd(totals.drop)}</td>
                      <td className="px-1 py-2 text-right bg-card">{usd(totals.member)}</td>
                      <td colSpan={2}></td>
                      <td className="px-1 py-2 text-right bg-card">{usd(totals.teacherPay)}</td>
                      <td></td>
                      <td className="px-1 py-2 text-right bg-card">{usd(totals.taxi)}</td>
                      <td colSpan={2}></td>
                      <td className="px-1 py-2 text-right bg-card">{usd(totals.conc)}</td>
                      <td className="px-1 py-2 text-right bg-card">{usd(totals.hwc)}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </Card>

          {/* Weekly teacher-payment cut */}
          {view !== "day" && (
            <Card className="p-4">
              <h4 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Weekly teacher payments (Mon–Sun)</h4>
              {weekly.length === 0 ? <p className="text-sm text-muted-foreground py-3">No teacher pay in this period.</p> : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {weekly.map((w) => (
                    <div key={w.weekStart} className="rounded-lg border border-border overflow-hidden">
                      <div className="flex items-center justify-between bg-muted/50 px-3 py-2"><span className="text-sm font-semibold">Week {w.label}</span><span className="text-sm font-semibold">{usd(w.total)}</span></div>
                      <table className="w-full text-sm"><tbody>
                        {w.rows.map((r) => {
                          const po = payoutMap.get(`${w.weekStart}|${norm(r.teacher)}`); const paid = po?.paid ?? false;
                          return (
                            <tr key={r.teacher} className="border-t border-border/50">
                              <td className="py-1.5 px-3 font-medium">{r.teacher}</td>
                              <td className="py-1.5 px-2 text-right whitespace-nowrap">{usd(r.pay)}</td>
                              <td className="py-1.5 px-2 w-24"><button onClick={() => setPayout(w.weekStart, r.teacher, { paid: !paid })} className={cn("text-xs px-2 py-1 rounded-full font-medium w-full", paid ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground hover:bg-border")}>{paid ? "Paid ✓" : "Pending"}</button></td>
                              <td className="py-1.5 pr-3 w-40"><Input defaultValue={po?.note ?? ""} placeholder="note…" className="h-7 text-xs" onBlur={(e) => e.target.value !== (po?.note ?? "") && setPayout(w.weekStart, r.teacher, { note: e.target.value })} /></td>
                            </tr>
                          );
                        })}
                      </tbody></table>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          <TeacherRatesManager rates={rates} reload={loadRates} onAdd={addTeacher} open={showRates} setOpen={setShowRates} />
          <OptionsManager options={options} reload={loadOptions} open={showOptions} setOpen={setShowOptions} />
          {view === "month" && (
            <ExpensesManager ym={ym} monthLabel={format(month, "MMMM yyyy")} prevYm={format(subMonths(month, 1), "yyyy-MM")} expenses={expenses} total={expensesTotal} reload={loadExpenses} open={showExpenses} setOpen={setShowExpenses} />
          )}
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

function SimpleTable({ cols, rows, empty }: { cols: string[]; rows: string[][]; empty: string }) {
  return (
    <div className="overflow-x-auto"><table className="w-full text-sm">
      <thead><tr className="text-left text-xs text-muted-foreground border-b border-border">{cols.map((c, i) => <th key={c} className={cn("py-2 pr-3", i > 0 && "text-right")}>{c}</th>)}</tr></thead>
      <tbody>
        {rows.length === 0 && <tr><td colSpan={cols.length} className="py-5 text-center text-muted-foreground">{empty}</td></tr>}
        {rows.map((r, ri) => <tr key={ri} className="border-b border-border/50 hover:bg-muted/30">{r.map((cell, ci) => <td key={ci} className={cn("py-1.5 pr-3", ci > 0 && "text-right", ci === 0 && "font-medium")}>{cell}</td>)}</tr>)}
      </tbody>
    </table></div>
  );
}

function TeacherRatesManager({ rates, reload, onAdd, open, setOpen }: { rates: Rate[]; reload: () => void; onAdd: () => void; open: boolean; setOpen: (v: boolean) => void; }) {
  const patch = async (id: string, p: Partial<Rate>) => { const { error } = await sb.from("class_teacher_rates").update(p).eq("id", id); if (error) toast.error(error.message); else reload(); };
  const del = async (id: string) => { if (!confirm("Remove this teacher?")) return; const { error } = await sb.from("class_teacher_rates").delete().eq("id", id); if (error) toast.error(error.message); else reload(); };
  return (
    <Card className="p-4">
      <button className="w-full flex items-center justify-between" onClick={() => setOpen(!open)}>
        <h4 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2"><Wallet className="h-4 w-4" /> Teachers ({rates.length})</h4>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground">These names fill the Instructor dropdown in the grid. The default fixed/commission below is informational for you (pay is entered per row).</p>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground border-b border-border"><th className="py-2 pr-3">Teacher</th><th className="py-2 pr-3 w-28">Default fixed $</th><th className="py-2 pr-3 w-28">Default comm %</th><th className="py-2 pr-3 w-16">Active</th><th className="py-2 w-10"></th></tr></thead>
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
              {rates.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">No teachers yet.</td></tr>}
            </tbody>
          </table></div>
          <Button size="sm" variant="outline" onClick={onAdd}><Plus className="h-4 w-4 mr-1" /> Add teacher</Button>
        </div>
      )}
    </Card>
  );
}

function OptionsManager({ options, reload, open, setOpen }: { options: FinOption[]; reload: () => void; open: boolean; setOpen: (v: boolean) => void; }) {
  const [newVals, setNewVals] = useState<{ client_type: string; salario: string }>({ client_type: "", salario: "" });
  const add = async (kind: "client_type" | "salario") => {
    const label = newVals[kind].trim();
    if (!label) return;
    const max = Math.max(0, ...options.filter((o) => o.kind === kind).map((o) => o.sort_order));
    const { error } = await sb.from("class_finance_options").insert({ kind, label, sort_order: max + 1 });
    if (error) toast.error(error.message.toLowerCase().includes("duplicate") ? "Already exists" : error.message);
    else { setNewVals((p) => ({ ...p, [kind]: "" })); reload(); }
  };
  const del = async (id: string) => { const { error } = await sb.from("class_finance_options").delete().eq("id", id); if (error) toast.error(error.message); else reload(); };
  const list = (kind: "client_type" | "salario", label: string, placeholder: string) => (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">{label}</p>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {options.filter((o) => o.kind === kind).map((o) => (
          <span key={o.id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs">
            {o.label}
            <button onClick={() => del(o.id)} className="text-destructive hover:opacity-70"><Trash2 className="h-3 w-3" /></button>
          </span>
        ))}
        {options.filter((o) => o.kind === kind).length === 0 && <span className="text-xs text-muted-foreground">None yet.</span>}
      </div>
      <div className="flex items-center gap-2">
        <Input value={newVals[kind]} onChange={(e) => setNewVals((p) => ({ ...p, [kind]: e.target.value }))} placeholder={placeholder} className="h-8 max-w-xs" onKeyDown={(e) => e.key === "Enter" && add(kind)} />
        <Button size="sm" variant="outline" onClick={() => add(kind)}><Plus className="h-4 w-4 mr-1" /> Add</Button>
      </div>
    </div>
  );
  return (
    <Card className="p-4">
      <button className="w-full flex items-center justify-between" onClick={() => setOpen(!open)}>
        <h4 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2"><Sparkles className="h-4 w-4" /> Dropdown options (Client type &amp; Salario)</h4>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <div className="mt-3 space-y-4">
          <p className="text-xs text-muted-foreground">These fill the <strong>Client type</strong> and <strong>Salario</strong> dropdowns in the grid. Add your own (e.g. a promo type or a salary amount). You can still type any value directly in a cell.</p>
          {list("client_type", "Client types", "e.g. Low-season promo")}
          {list("salario", "Salario amounts ($)", "e.g. 25")}
        </div>
      )}
    </Card>
  );
}

function ExpensesManager({ ym, monthLabel, prevYm, expenses, total, reload, open, setOpen }: {
  ym: string; monthLabel: string; prevYm: string; expenses: Expense[]; total: number; reload: () => void; open: boolean; setOpen: (v: boolean) => void;
}) {
  const patch = async (id: string, p: Partial<Expense>) => { const { error } = await sb.from("monthly_expenses").update(p).eq("id", id); if (error) toast.error(error.message); else reload(); };
  const add = async (category: string) => { const max = Math.max(0, ...expenses.map((e) => e.sort_order)); const { error } = await sb.from("monthly_expenses").insert({ ym, label: "New expense", amount: 0, category, sort_order: max + 1 }); if (error) toast.error(error.message); else reload(); };
  const del = async (id: string) => { const { error } = await sb.from("monthly_expenses").delete().eq("id", id); if (error) toast.error(error.message); else reload(); };
  const copyPrev = async () => {
    const { data } = await sb.from("monthly_expenses").select("label, amount, category, sort_order").eq("ym", prevYm);
    const list = (data ?? []) as Expense[]; if (!list.length) { toast.info("Nothing to copy."); return; }
    if (!confirm(`Copy ${list.length} line(s) from ${prevYm}?`)) return;
    const { error } = await sb.from("monthly_expenses").insert(list.map((r) => ({ ym, label: r.label, amount: r.amount, category: r.category, sort_order: r.sort_order })));
    if (error) toast.error(error.message); else { toast.success("Copied"); reload(); }
  };
  const group = (c: string) => expenses.filter((e) => e.category === c);
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
          <div className="flex justify-end"><Button size="sm" variant="outline" onClick={copyPrev}><Copy className="h-4 w-4 mr-1" /> Copy from previous month</Button></div>
          {(["fixed", "variable"] as const).map((cat) => (
            <div key={cat}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">{cat === "fixed" ? "Fixed expenses" : "Variable expenses"}</p>
              <div className="overflow-x-auto"><table className="w-full text-sm"><tbody>{group(cat).map(row)}{group(cat).length === 0 && <tr><td className="py-3 text-muted-foreground text-sm">None yet.</td></tr>}</tbody></table></div>
              <Button size="sm" variant="outline" className="h-8 mt-1" onClick={() => add(cat)}><Plus className="h-3.5 w-3.5 mr-1" /> Add {cat} expense</Button>
            </div>
          ))}
          <div className="flex justify-between border-t border-border pt-2 text-sm font-semibold"><span>Total — {monthLabel}</span><span>{usd(total)}</span></div>
        </div>
      )}
    </Card>
  );
}
