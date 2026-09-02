import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  CalendarDays, Users, Wallet, Loader2, ChevronLeft, ChevronRight,
  Save, CreditCard, ShieldAlert, UserPlus, Ticket, Plus, Trash2, Ban, Undo2,
  NotebookPen, Settings as SettingsIcon, CalendarRange, ListChecks, BadgeCheck, HandCoins,
} from "lucide-react";
import {
  format, startOfMonth, endOfMonth, addMonths, subMonths, addDays, subDays, parseISO, isSameMonth,
} from "date-fns";
import { formatSpaDate, formatSpaTime, spaMonthKey } from "@/lib/businessHours";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  TeacherSchedule, teacherOf, SESSION_SELECT, type SchedSession,
} from "@/components/teacher/TeacherSchedule";
import { TeacherStudents } from "@/components/teacher/TeacherStudents";
import { TeacherNotes } from "@/components/teacher/TeacherNotes";
import { TeacherMemberships } from "@/components/teacher/TeacherMemberships";
import { ClassFormDialog } from "@/components/teacher/ClassFormDialog";
import { useConfirm } from "@/hooks/useConfirm";

const sb = supabase as any;
const usd = (n: number) => `$${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface TeacherRow {
  id: string; display_name: string; email: string;
  payment_instructions: string | null; studio_rate: number; active: boolean;
}
type Session = SchedSession;
interface Coupon {
  id: string; code: string; description: string | null;
  discount_type: string; discount_value: number; is_active: boolean;
}
interface Payment {
  id: string; amount: number; paid_on: string; method: string | null; note: string | null;
}
interface Attendee {
  id: string; schedule_id: string; guest_name: string | null; guest_email: string | null;
  guest_phone: string | null; status: string; payment_status: string | null;
  payment_method: string | null; total_price: number | null; user_offering_id: string | null;
  source: string | null; attended: boolean | null; client_type: string | null;
}

const TABS = [
  { value: "calendar", label: "Calendar", icon: CalendarRange },
  { value: "classes", label: "My classes", icon: ListChecks },
  { value: "students", label: "Students", icon: Users },
  { value: "notes", label: "Notebook", icon: NotebookPen },
  { value: "memberships", label: "Memberships", icon: BadgeCheck },
  { value: "coupons", label: "Coupons", icon: Ticket },
  { value: "settings", label: "Settings", icon: SettingsIcon },
];

/**
 * Derive a payment method from the student category, so the teacher only has to
 * pick one thing. Passes/memberships are prepaid, staff and buddy passes are
 * free, everything else is collected by her.
 */
function payMethodFor(clientType: string): string {
  const t = (clientType || "").toLowerCase();
  if (!t) return "cash";
  if (t.includes("pass") && !t.includes("buddy")) return "membership";
  if (t.includes("membership") || t.includes("unlimited")) return "membership";
  if (t.includes("free") || t.includes("staff") || t.includes("buddy")) return "free";
  return "cash";
}

/** How this student is paying — drives the badge the teacher sees. */
function payLabel(a: Attendee): { text: string; tone: string } {
  // A category chosen by the teacher/Holis is the most specific thing we know.
  if (a.client_type) {
    const m = payMethodFor(a.client_type);
    return {
      text: a.client_type,
      tone: m === "membership" ? "bg-sky-500/15 text-sky-700 dark:text-sky-400"
        : m === "free" ? "bg-muted text-muted-foreground"
        : "bg-amber-500/15 text-amber-700 dark:text-amber-500",
    };
  }
  if (a.user_offering_id) return { text: "Membership / pass", tone: "bg-sky-500/15 text-sky-700 dark:text-sky-400" };
  if (a.payment_method === "free" || a.payment_status === "not_required")
    return { text: "Free", tone: "bg-muted text-muted-foreground" };
  if (a.payment_status === "paid") return { text: "Paid online", tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" };
  return { text: "Pays you", tone: "bg-amber-500/15 text-amber-700 dark:text-amber-500" };
}

export default function TeacherPanel() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { confirm, confirmDialog } = useConfirm();
  const reduceMotion = useReducedMotion();

  const [teacher, setTeacher] = useState<TeacherRow | null>(null);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(new Date());
  const [sessions, setSessions] = useState<Session[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [payments, setPayments] = useState<Payment[]>([]);
  const [openSession, setOpenSession] = useState<Session | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [loadingAttendees, setLoadingAttendees] = useState(false);
  const [payDraft, setPayDraft] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [savingPay, setSavingPay] = useState(false);
  const [savingName, setSavingName] = useState(false);
  // Adding / editing one of her classes from the list.
  const [classFormOpen, setClassFormOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  // Manually adding a walk-in student (vs. those who booked on the site).
  const [showAddForm, setShowAddForm] = useState(false);
  const [addingStudent, setAddingStudent] = useState(false);
  const [newStudent, setNewStudent] = useState({ name: "", email: "", phone: "", client_type: "" });
  // Inline editing of an existing student.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ name: "", email: "", phone: "", client_type: "" });
  const [savingStudent, setSavingStudent] = useState(false);
  // Student categories, shared with Class Finances so Holis edits them once.
  const [clientTypes, setClientTypes] = useState<string[]>([]);
  // Her own coupons — a record of the price she agreed with a student.
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [savingCoupon, setSavingCoupon] = useState(false);
  const [newCoupon, setNewCoupon] = useState({ code: "", description: "", type: "percentage", value: "" });

  const tabParam = params.get("tab");
  const tab = TABS.some((t) => t.value === tabParam) ? (tabParam as string) : "calendar";
  const setTab = (v: string) => setParams(v === "calendar" ? {} : { tab: v }, { replace: true });

  useEffect(() => { if (!authLoading && !user) navigate("/auth"); }, [user, authLoading, navigate]);

  useEffect(() => {
    sb.from("class_finance_options").select("label").eq("kind", "client_type")
      .order("sort_order")
      .then(({ data }: any) => setClientTypes(((data ?? []) as any[]).map((o) => o.label)));
  }, []);

  // Who am I? The row also carries the studio rate and the payment instructions.
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await sb.from("teachers").select("*").eq("user_id", user.id).maybeSingle();
      if (!data) { setDenied(true); setLoading(false); return; }
      setTeacher(data as TeacherRow);
      setPayDraft((data as TeacherRow).payment_instructions ?? "");
      setNameDraft((data as TeacherRow).display_name);
    })();
  }, [user]);

  const load = useCallback(async () => {
    if (!teacher) return;
    setLoading(true);
    // A day either side, because the studio is six hours behind UTC: an
    // evening class on the 31st is already the 1st in UTC.
    const ym = format(month, "yyyy-MM");
    const from = format(subDays(startOfMonth(month), 1), "yyyy-MM-dd");
    const to = format(addDays(endOfMonth(month), 1), "yyyy-MM-dd");
    const [{ data }, { data: pay }] = await Promise.all([
      sb.from("class_schedule").select(SESSION_SELECT)
        .gte("start_time", `${from}T00:00:00Z`).lte("start_time", `${to}T23:59:59Z`)
        .order("start_time"),
      // What Holis has recorded as received from her this month.
      sb.from("teacher_payments").select("id, amount, paid_on, method, note")
        .eq("teacher_id", teacher.id).eq("ym", ym)
        .order("paid_on", { ascending: false }),
    ]);
    const mine = (((data as any) ?? []) as Session[])
      .filter((s) => spaMonthKey(s.start_time) === ym)
      .filter((s) => teacherOf(s) === teacher.display_name.trim().toLowerCase());
    setSessions(mine);
    setPayments((pay ?? []) as Payment[]);

    // Attendee counts. RLS only returns bookings belonging to her own classes.
    if (mine.length) {
      const { data: bk } = await sb.from("class_bookings")
        .select("schedule_id, status").in("schedule_id", mine.map((s) => s.id));
      const c: Record<string, number> = {};
      ((bk as any[]) ?? []).forEach((b) => {
        if (b.status === "cancelled") return;
        c[b.schedule_id] = (c[b.schedule_id] ?? 0) + 1;
      });
      setCounts(c);
    } else setCounts({});
    setLoading(false);
  }, [teacher, month]);
  useEffect(() => { load(); }, [load]);

  const openAttendees = async (s: Session) => {
    setOpenSession(s); setLoadingAttendees(true);
    const { data } = await sb.from("class_bookings")
      .select("id, schedule_id, guest_name, guest_email, guest_phone, status, payment_status, payment_method, total_price, user_offering_id, source, attended, client_type")
      .eq("schedule_id", s.id).order("created_at");
    setAttendees(((data as any) ?? []) as Attendee[]);
    setLoadingAttendees(false);
  };

  /**
   * Call off a class, or put it back. Only `is_cancelled` changes here — a
   * database trigger keeps the class type, the spot count and the money as they
   * were, and another one emails the students.
   */
  const setCancelled = async (s: Session, cancel: boolean) => {
    const n = counts[s.id] ?? 0;
    const msg = cancel
      ? n > 0
        ? `The ${n} student${n === 1 ? "" : "s"} signed up will be emailed.`
        : "Nobody has signed up, so no one will be emailed."
      : "It goes back on the schedule and students can book it again.";
    if (!(await confirm({
      title: cancel ? "Cancel this class?" : "Put this class back?",
      description: msg,
      confirmLabel: cancel ? "Cancel the class" : "Put it back",
      destructive: cancel,
    }))) return;
    setCancelling(s.id);
    const { error } = await sb.from("class_schedule").update({ is_cancelled: cancel }).eq("id", s.id);
    if (error) { toast.error(error.message); setCancelling(null); return; }
    setSessions((prev) => prev.map((x) => (x.id === s.id ? { ...x, is_cancelled: cancel } : x)));
    toast.success(cancel
      ? n > 0 ? `Class cancelled — ${n} student${n === 1 ? "" : "s"} notified` : "Class cancelled"
      : "Class is back on the schedule");
    setCancelling(null);
  };

  /** Save edits to an existing student (name/contact/type). */
  const saveStudent = async (a: Attendee) => {
    const name = editDraft.name.trim();
    if (!name) { toast.error("Name is required"); return; }
    setSavingStudent(true);
    const { error } = await sb.from("class_bookings").update({
      guest_name: name,
      guest_email: editDraft.email.trim() || null,
      guest_phone: editDraft.phone.trim() || null,
      client_type: editDraft.client_type || null,
    }).eq("id", a.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Student updated");
      setEditingId(null);
      if (openSession) await openAttendees(openSession);
    }
    setSavingStudent(false);
  };

  /** Remove a student from the class entirely. */
  const removeStudent = async (a: Attendee) => {
    if (!(await confirm({
      title: `Remove ${a.guest_name || "this student"}?`,
      description: "They come off this class's list. This cannot be undone.",
      confirmLabel: "Remove",
      destructive: true,
    }))) return;
    const { error } = await sb.from("class_bookings").delete().eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Student removed");
    if (openSession) await openAttendees(openSession);
    load();
  };

  /** Walk-in: the teacher adds someone who turned up without booking online. */
  const addStudent = async () => {
    if (!openSession) return;
    const name = newStudent.name.trim();
    if (!name) { toast.error("Name is required"); return; }
    setAddingStudent(true);
    const { error } = await sb.from("class_bookings").insert({
      schedule_id: openSession.id,
      guest_name: name,
      guest_email: newStudent.email.trim() || null,
      guest_phone: newStudent.phone.trim() || null,
      status: "booked",
      // She collects the money herself, so nothing here is a Holis payment.
      client_type: newStudent.client_type || null,
      payment_method: payMethodFor(newStudent.client_type),
      payment_status: payMethodFor(newStudent.client_type) === "free" ? "not_required" : "pending",
      source: "teacher",
    });
    if (error) { toast.error(error.message); setAddingStudent(false); return; }
    toast.success(`${name} added`);
    setNewStudent({ name: "", email: "", phone: "", client_type: "" });
    setShowAddForm(false);
    setAddingStudent(false);
    await openAttendees(openSession);   // refresh the list
    load();                             // refresh the per-class counter
  };

  const loadCoupons = useCallback(async () => {
    if (!teacher) return;
    const { data } = await sb.from("teacher_coupons").select("*")
      .eq("teacher_id", teacher.id).order("created_at", { ascending: false });
    setCoupons((data ?? []) as Coupon[]);
  }, [teacher]);
  // Declared after loadCoupons on purpose: a dependency array is evaluated
  // during render, so referencing it earlier threw "cannot access before
  // initialization" and blanked the whole page.
  useEffect(() => { loadCoupons(); }, [loadCoupons]);

  const addCoupon = async () => {
    if (!teacher) return;
    const code = newCoupon.code.trim().toUpperCase();
    if (!code) { toast.error("Code is required"); return; }
    const value = Number(newCoupon.value);
    if (!Number.isFinite(value) || value <= 0) { toast.error("Enter a discount amount"); return; }
    setSavingCoupon(true);
    const { error } = await sb.from("teacher_coupons").insert({
      teacher_id: teacher.id,
      code,
      description: newCoupon.description.trim() || null,
      discount_type: newCoupon.type,
      discount_value: value,
      is_active: true,
    });
    if (error) {
      toast.error(error.message.toLowerCase().includes("duplicate") ? "That code already exists" : error.message);
    } else {
      toast.success(`Coupon ${code} created`);
      setNewCoupon({ code: "", description: "", type: "percentage", value: "" });
      loadCoupons();
    }
    setSavingCoupon(false);
  };

  const toggleCoupon = async (c: Coupon) => {
    const { error } = await sb.from("teacher_coupons").update({ is_active: !c.is_active }).eq("id", c.id);
    if (error) toast.error(error.message); else loadCoupons();
  };

  const deleteCoupon = async (c: Coupon) => {
    if (!(await confirm({
      title: `Delete coupon ${c.code}?`,
      confirmLabel: "Delete",
      destructive: true,
    }))) return;
    const { error } = await sb.from("teacher_coupons").delete().eq("id", c.id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); loadCoupons(); }
  };

  /** Attendance toggle: null -> attended -> no-show -> null. */
  const cycleAttendance = async (a: Attendee) => {
    const next = a.attended === null || a.attended === undefined ? true : a.attended ? false : null;
    setAttendees((prev) => prev.map((x) => (x.id === a.id ? { ...x, attended: next } : x)));
    const { error } = await sb.from("class_bookings").update({ attended: next }).eq("id", a.id);
    if (error) {
      toast.error(error.message);
      setAttendees((prev) => prev.map((x) => (x.id === a.id ? { ...x, attended: a.attended } : x)));
    }
  };

  const savePayment = async () => {
    if (!teacher) return;
    setSavingPay(true);
    const { error } = await sb.from("teachers").update({ payment_instructions: payDraft }).eq("id", teacher.id);
    if (error) toast.error(error.message);
    else { toast.success("Payment details saved"); setTeacher({ ...teacher, payment_instructions: payDraft }); }
    setSavingPay(false);
  };

  /** Renaming carries her classes with her — a database trigger moves them. */
  const saveName = async () => {
    if (!teacher) return;
    const name = nameDraft.trim();
    if (!name) { toast.error("Your name cannot be empty"); return; }
    setSavingName(true);
    const { error } = await sb.from("teachers").update({ display_name: name }).eq("id", teacher.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Name saved — your classes moved with it");
      setTeacher({ ...teacher, display_name: name });
    }
    setSavingName(false);
  };

  /**
   * The month's money. Rent is only counted for classes that actually happened,
   * so early in the month "due now" is small on purpose — "by month end" is what
   * it grows to if every class on the calendar goes ahead.
   */
  const stats = useMemo(() => {
    const now = new Date();
    const given = sessions.filter((s) => !s.is_cancelled && parseISO(s.start_time) < now);
    const upcoming = sessions.filter((s) => !s.is_cancelled && parseISO(s.start_time) >= now);
    const students = sessions.reduce((n, s) => n + (counts[s.id] ?? 0), 0);
    const rate = Number(teacher?.studio_rate ?? 35);
    const paid = payments.reduce((n, p) => n + Number(p.amount || 0), 0);
    const owed = given.length * rate;
    return {
      given: given.length, upcoming: upcoming.length, students, rate,
      owed, paid, balance: owed - paid,
      expected: (given.length + upcoming.length) * rate,
    };
  }, [sessions, counts, teacher, payments]);

  if (authLoading || (loading && !teacher && !denied)) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center py-32 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading...
        </div>
      </div>
    );
  }

  if (denied) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-md mx-auto text-center py-32 px-4">
          <ShieldAlert className="h-14 w-14 text-destructive/60 mx-auto mb-4" />
          <h1 className="font-heading text-2xl text-foreground mb-2">Not a teacher account</h1>
          <p className="font-body text-muted-foreground mb-6">
            This area is for studio teachers. If you should have access, ask Holis to set up your teacher profile.
          </p>
          <Button onClick={() => navigate("/dashboard")}>Back to My Account</Button>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-20">
        <div className="mb-6">
          <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-2">Teacher Panel</p>
          <h1 className="spa-heading-lg text-foreground">{teacher?.display_name}</h1>
          <p className="spa-body mt-2">Your classes, who is coming, and what you owe for the studio.</p>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Side rail. On a phone it lies down and scrolls sideways instead. */}
          <nav className="lg:w-52 shrink-0">
            <div className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible -mx-4 px-4 lg:mx-0 lg:px-0 pb-1 lg:pb-0">
              {TABS.map(({ value, label, icon: Icon }) => {
                const active = tab === value;
                return (
                  <button
                    key={value}
                    onClick={() => setTab(value)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm whitespace-nowrap",
                      "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="teacher-tab-pill"
                        className="absolute inset-0 rounded-xl border border-spa-sage/40 bg-spa-sage/10"
                        transition={reduceMotion
                          ? { duration: 0 }
                          : { type: "spring", stiffness: 420, damping: 34 }}
                      />
                    )}
                    <Icon className={cn("relative h-4 w-4 shrink-0", active && "text-spa-sage")} />
                    <span className="relative font-medium">{label}</span>
                  </button>
                );
              })}
            </div>
          </nav>

          <div className="flex-1 min-w-0">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={tab}
                initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -6 }}
                transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}
              >
                {/* ── Calendar: the whole studio, and where she adds classes ── */}
                {tab === "calendar" && teacher && (
                  <TeacherSchedule
                    teacherName={teacher.display_name}
                    onStudents={(s) => openAttendees(s)}
                    onChanged={load}
                  />
                )}

                {/* ── My classes: her month, what it costs her, and editing ── */}
                {tab === "classes" && (
                  <>
                    <div className="flex items-center gap-2 mb-6 flex-wrap">
                      <Button variant="outline" size="icon" onClick={() => setMonth(subMonths(month, 1))}><ChevronLeft className="h-4 w-4" /></Button>
                      <h2 className="font-heading text-lg font-semibold min-w-[160px] text-center">{format(month, "MMMM yyyy")}</h2>
                      <Button variant="outline" size="icon" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight className="h-4 w-4" /></Button>
                      {!isSameMonth(month, new Date()) && <Button variant="ghost" size="sm" onClick={() => setMonth(new Date())}>This month</Button>}
                      <Button size="sm" className="ml-auto"
                        onClick={() => { setEditingSession(null); setClassFormOpen(true); }}>
                        <Plus className="h-4 w-4 mr-1" /> Add a class
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                      <Stat icon={CalendarDays} label="Classes given" value={String(stats.given)} sub="this month" />
                      <Stat icon={CalendarDays} label="Upcoming" value={String(stats.upcoming)} sub="still to come" />
                      <Stat icon={Users} label="Students" value={String(stats.students)} sub="signed up" />
                      <Stat icon={Wallet} label="Studio rent due" value={usd(stats.owed)}
                        sub={`${stats.given} × ${usd(stats.rate)}`} accent />
                    </div>

                    {/* What she owes vs. what Holis has recorded receiving. */}
                    <Card className="p-4 mb-6">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <HandCoins className="h-4 w-4 text-muted-foreground" />
                          <p className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                            Studio rent — {format(month, "MMMM")}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-5 text-sm">
                          <span className="text-muted-foreground">Due now <strong className="text-foreground">{usd(stats.owed)}</strong></span>
                          <span className="text-muted-foreground">Paid <strong className="text-foreground">{usd(stats.paid)}</strong></span>
                          <span className="text-muted-foreground">
                            {stats.balance > 0 ? "You still owe" : stats.balance < 0 ? "Paid ahead" : "Balance"}{" "}
                            <strong className={cn(stats.balance > 0 ? "text-foreground" : "text-emerald-600 dark:text-emerald-400")}>
                              {usd(Math.abs(stats.balance))}
                            </strong>
                          </span>
                          <span className="text-muted-foreground">By month end <strong className="text-foreground">{usd(stats.expected)}</strong></span>
                        </div>
                      </div>
                      {payments.length > 0 && (
                        <div className="mt-3 border-t border-border pt-2 space-y-1">
                          {payments.map((p) => (
                            <p key={p.id} className="font-body text-xs text-muted-foreground">
                              <span className="font-medium text-foreground">{usd(Number(p.amount))}</span>
                              {" · "}{p.paid_on}{p.method ? ` · ${p.method}` : ""}{p.note ? ` · ${p.note}` : ""}
                            </p>
                          ))}
                        </div>
                      )}
                      <p className="font-body text-[11px] text-muted-foreground mt-2">
                        Rent counts only classes already given, so this grows through the month. Payments are
                        recorded by Holis when you settle up.
                      </p>
                    </Card>

                    <Card className="p-4">
                      <h3 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                        Your classes ({sessions.length})
                      </h3>
                      {loading ? (
                        <div className="py-10 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
                      ) : sessions.length === 0 ? (
                        <p className="py-8 text-center text-sm text-muted-foreground">No classes assigned to you this month.</p>
                      ) : (
                        <div className="space-y-2">
                          {sessions.map((s) => {
                            const past = parseISO(s.start_time) < new Date();
                            const n = counts[s.id] ?? 0;
                            return (
                              <div key={s.id} className={cn(
                                "flex items-center justify-between gap-3 rounded-xl border border-border p-3",
                                s.is_cancelled && "opacity-60",
                              )}>
                                <div className="min-w-0">
                                  <p className="font-body text-sm font-medium text-foreground truncate">
                                    {s.classes?.title ?? "Class"}
                                    {s.is_cancelled && <span className="ml-2 text-xs text-destructive">(Cancelled)</span>}
                                  </p>
                                  <p className="font-body text-xs text-muted-foreground">
                                    {formatSpaDate(s.start_time)} · {formatSpaTime(s.start_time)}
                                    {past && !s.is_cancelled && <span className="ml-2 text-spa-sage">· given</span>}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <span className="font-body text-xs text-muted-foreground whitespace-nowrap mr-1">
                                    <Users className="h-3 w-3 inline mr-1" />{n}
                                  </span>
                                  <Button variant="outline" size="sm" onClick={() => openAttendees(s)}>Students</Button>
                                  <Button variant="ghost" size="sm"
                                    onClick={() => { setEditingSession(s); setClassFormOpen(true); }}>
                                    Edit
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className={cn("h-8 w-8", !s.is_cancelled && "text-destructive")}
                                    title={s.is_cancelled ? "Put this class back on the schedule" : "Cancel this class"}
                                    disabled={cancelling === s.id}
                                    onClick={() => setCancelled(s, !s.is_cancelled)}
                                  >
                                    {cancelling === s.id ? <Loader2 className="h-4 w-4 animate-spin" />
                                      : s.is_cancelled ? <Undo2 className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </Card>
                  </>
                )}

                {tab === "students" && <TeacherStudents />}

                {tab === "notes" && teacher && <TeacherNotes teacherId={teacher.id} />}

                {tab === "memberships" && teacher && <TeacherMemberships teacherId={teacher.id} />}

                {/* ── Coupons ── */}
                {tab === "coupons" && (
                  <Card className="p-4">
                    <h3 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-2">
                      <Ticket className="h-4 w-4" /> Your coupons
                    </h3>
                    <p className="font-body text-xs text-muted-foreground mb-3">
                      A record of a price you agreed with a student — you apply it when they pay you.
                      These never change what Holis charges, and they are yours alone.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-2 mb-3">
                      <Input placeholder="CODE (e.g. LOCAL20)" value={newCoupon.code}
                        onChange={(e) => setNewCoupon({ ...newCoupon, code: e.target.value.toUpperCase() })} className="h-9" />
                      <select value={newCoupon.type}
                        onChange={(e) => setNewCoupon({ ...newCoupon, type: e.target.value })}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                        <option value="percentage">% off</option>
                        <option value="fixed">$ off</option>
                      </select>
                      <Input type="number" placeholder={newCoupon.type === "percentage" ? "20" : "5"}
                        value={newCoupon.value}
                        onChange={(e) => setNewCoupon({ ...newCoupon, value: e.target.value })} className="h-9 w-24" />
                      <Button size="sm" className="h-9" onClick={addCoupon} disabled={savingCoupon}>
                        {savingCoupon ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />} Add
                      </Button>
                    </div>
                    <Input placeholder="What it is for (optional)" value={newCoupon.description}
                      onChange={(e) => setNewCoupon({ ...newCoupon, description: e.target.value })} className="h-9 mb-4" />

                    {coupons.length === 0 ? (
                      <p className="py-4 text-center text-sm text-muted-foreground">No coupons yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {coupons.map((c) => (
                          <div key={c.id} className={cn("flex items-center justify-between gap-3 rounded-lg border border-border p-3", !c.is_active && "opacity-60")}>
                            <div className="min-w-0">
                              <p className="font-body text-sm font-semibold text-foreground">
                                {c.code}
                                <span className="ml-2 font-normal text-muted-foreground">
                                  {c.discount_type === "percentage" ? `${c.discount_value}% off` : `${usd(Number(c.discount_value))} off`}
                                </span>
                              </p>
                              {c.description && <p className="font-body text-xs text-muted-foreground truncate">{c.description}</p>}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button onClick={() => toggleCoupon(c)}
                                className={cn("text-xs px-2 py-1 rounded-full font-medium",
                                  c.is_active ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground")}>
                                {c.is_active ? "Active" : "Off"}
                              </button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteCoupon(c)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                )}

                {/* ── Settings ── */}
                {tab === "settings" && (
                  <div className="space-y-4">
                    <Card className="p-4">
                      <h3 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-2">
                        <SettingsIcon className="h-4 w-4" /> Your details
                      </h3>
                      <p className="font-body text-xs text-muted-foreground mb-3">
                        Your name is what students see on the schedule. Changing it moves your classes with it.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                        <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} placeholder="Your name" />
                        <Button size="sm" onClick={saveName}
                          disabled={savingName || !nameDraft.trim() || nameDraft.trim() === teacher?.display_name}>
                          {savingName ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Save
                        </Button>
                      </div>
                      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <ReadOnly label="Email" value={teacher?.email ?? "—"} note="Ask Holis to change this" />
                        <ReadOnly label="Studio rent per class" value={usd(Number(teacher?.studio_rate ?? 35))} note="Set by Holis" />
                      </div>
                    </Card>

                    <Card className="p-4">
                      <h3 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-2">
                        <CreditCard className="h-4 w-4" /> How your students pay you
                      </h3>
                      <p className="font-body text-xs text-muted-foreground mb-3">
                        Shown to students when they reserve a spot. Holis does not process this money — they pay you directly.
                      </p>
                      <Textarea
                        value={payDraft}
                        onChange={(e) => setPayDraft(e.target.value)}
                        rows={3}
                        placeholder="e.g. SINPE Movil 8888-8888 · or cash at the studio"
                      />
                      <div className="mt-3 flex justify-end">
                        <Button size="sm" onClick={savePayment} disabled={savingPay || payDraft === (teacher?.payment_instructions ?? "")}>
                          {savingPay ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Save
                        </Button>
                      </div>
                    </Card>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Add / edit one of her classes, from the list */}
      {teacher && (
        <ClassFormDialog
          open={classFormOpen}
          onOpenChange={setClassFormOpen}
          teacherName={teacher.display_name}
          session={editingSession}
          onSaved={load}
        />
      )}

      {/* Attendees */}
      <Dialog open={!!openSession} onOpenChange={(o) => { if (!o) { setOpenSession(null); setAttendees([]); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {openSession?.classes?.title ?? "Class"}
              <span className="block font-body text-sm font-normal text-muted-foreground mt-1">
                {openSession && `${formatSpaDate(openSession.start_time)} · ${formatSpaTime(openSession.start_time)}`}
              </span>
            </DialogTitle>
          </DialogHeader>
          {/* Add a walk-in. Students who booked on the site appear on their own. */}
          <div className="mb-3">
            {showAddForm ? (
              <div className="rounded-lg border border-spa-sage/40 bg-spa-sage/5 p-3 space-y-2">
                <p className="font-body text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add a student</p>
                <Input autoFocus placeholder="Name *" value={newStudent.name}
                  onChange={(e) => setNewStudent({ ...newStudent, name: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && addStudent()} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Input placeholder="Email (optional)" value={newStudent.email}
                    onChange={(e) => setNewStudent({ ...newStudent, email: e.target.value })} />
                  <Input placeholder="Phone (optional)" value={newStudent.phone}
                    onChange={(e) => setNewStudent({ ...newStudent, phone: e.target.value })} />
                </div>
                <select
                  value={newStudent.client_type}
                  onChange={(e) => setNewStudent({ ...newStudent, client_type: e.target.value })}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">Student type…</option>
                  {clientTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <div className="flex justify-end gap-2 pt-1">
                  <Button size="sm" variant="ghost" onClick={() => setShowAddForm(false)} disabled={addingStudent}>Cancel</Button>
                  <Button size="sm" onClick={addStudent} disabled={addingStudent || !newStudent.name.trim()}>
                    {addingStudent ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <UserPlus className="h-4 w-4 mr-1" />} Add
                  </Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="outline" className="w-full" onClick={() => setShowAddForm(true)}>
                <UserPlus className="h-4 w-4 mr-1" /> Add a student manually
              </Button>
            )}
          </div>

          {loadingAttendees ? (
            <div className="py-10 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
          ) : attendees.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nobody signed up yet. Students who book on spaholis.com show up here automatically.
            </p>
          ) : (
            <div className="space-y-2">
              {attendees.map((a) => {
                const lbl = payLabel(a);
                const cancelled = a.status === "cancelled";
                const byTeacher = a.source === "teacher";
                const isEditing = editingId === a.id;
                return (
                  <div key={a.id} className={cn("rounded-lg border border-border p-3", cancelled && "opacity-50")}>
                    {isEditing ? (
                      /* Inline edit — name, contact and student type */
                      <div className="space-y-2">
                        <Input value={editDraft.name} placeholder="Name *"
                          onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <Input value={editDraft.email} placeholder="Email (optional)"
                            onChange={(e) => setEditDraft({ ...editDraft, email: e.target.value })} />
                          <Input value={editDraft.phone} placeholder="Phone (optional)"
                            onChange={(e) => setEditDraft({ ...editDraft, phone: e.target.value })} />
                        </div>
                        <select value={editDraft.client_type}
                          onChange={(e) => setEditDraft({ ...editDraft, client_type: e.target.value })}
                          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                          <option value="">Student type…</option>
                          {clientTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} disabled={savingStudent}>Cancel</Button>
                          <Button size="sm" onClick={() => saveStudent(a)} disabled={savingStudent || !editDraft.name.trim()}>
                            {savingStudent ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Save
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-body text-sm font-medium text-foreground truncate">
                            {a.guest_name || "Guest"}
                            {cancelled && <span className="ml-2 text-xs text-destructive">(cancelled)</span>}
                          </p>
                          {a.guest_email && <p className="font-body text-xs text-muted-foreground truncate">{a.guest_email}</p>}
                          {a.guest_phone && <p className="font-body text-xs text-muted-foreground">{a.guest_phone}</p>}
                          <span className="mt-1 inline-block font-body text-[11px] text-muted-foreground">
                            {byTeacher ? "Added by you" : "Booked online"}
                          </span>
                          {/* Edit / remove */}
                          <span className="mt-1 flex items-center gap-2">
                            <button
                              onClick={() => {
                                setEditingId(a.id);
                                setEditDraft({
                                  name: a.guest_name ?? "", email: a.guest_email ?? "",
                                  phone: a.guest_phone ?? "", client_type: a.client_type ?? "",
                                });
                              }}
                              className="font-body text-[11px] font-semibold uppercase tracking-wider text-primary hover:underline"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => removeStudent(a)}
                              className="font-body text-[11px] font-semibold uppercase tracking-wider text-destructive hover:underline"
                            >
                              Remove
                            </button>
                          </span>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <span className={cn("rounded-full px-2 py-1 text-[11px] font-medium", lbl.tone)}>
                            {lbl.text}
                          </span>
                          {!cancelled && (
                            <button
                              onClick={() => cycleAttendance(a)}
                              title="Tap to change: not marked / came / no-show"
                              className={cn(
                                "rounded-full px-2 py-1 text-[11px] font-medium border transition-colors",
                                a.attended === true && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/40",
                                a.attended === false && "bg-destructive/10 text-destructive border-destructive/40",
                                (a.attended === null || a.attended === undefined) && "bg-muted text-muted-foreground border-border hover:bg-border",
                              )}
                            >
                              {a.attended === true ? "Came ✓" : a.attended === false ? "No-show" : "Mark attendance"}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {confirmDialog}
      <Footer />
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub, accent }: { icon: any; label: string; value: string; sub?: string; accent?: boolean }) {
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

function ReadOnly({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
      <p className="font-body text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-body text-sm text-foreground">{value}</p>
      {note && <p className="font-body text-[11px] text-muted-foreground mt-0.5">{note}</p>}
    </div>
  );
}
