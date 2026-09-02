import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
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
} from "lucide-react";
import { format, startOfMonth, endOfMonth, addMonths, subMonths, parseISO, isSameMonth } from "date-fns";
import { formatSpaDate, formatSpaTime } from "@/lib/businessHours";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const sb = supabase as any;
const usd = (n: number) => `$${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface TeacherRow {
  id: string; display_name: string; email: string;
  payment_instructions: string | null; studio_rate: number; active: boolean;
}
interface Session {
  id: string; class_id: string; start_time: string; end_time: string;
  spots_remaining: number; is_cancelled: boolean; instructor: string | null;
  classes: { title: string | null; instructor: string | null; max_capacity: number | null; location: string | null } | null;
}
interface Coupon {
  id: string; code: string; description: string | null;
  discount_type: string; discount_value: number; is_active: boolean;
}
interface Attendee {
  id: string; schedule_id: string; guest_name: string | null; guest_email: string | null;
  guest_phone: string | null; status: string; payment_status: string | null;
  payment_method: string | null; total_price: number | null; user_offering_id: string | null;
  source: string | null; attended: boolean | null; client_type: string | null;
}

/** A session's teacher: the per-session name wins, else the class template's. */
const teacherOf = (s: Session) =>
  (s.instructor?.trim() || s.classes?.instructor?.trim() || "").toLowerCase();

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

  const [teacher, setTeacher] = useState<TeacherRow | null>(null);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(new Date());
  const [sessions, setSessions] = useState<Session[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [openSession, setOpenSession] = useState<Session | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [loadingAttendees, setLoadingAttendees] = useState(false);
  const [payDraft, setPayDraft] = useState("");
  const [savingPay, setSavingPay] = useState(false);
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
    })();
  }, [user]);

  const load = useCallback(async () => {
    if (!teacher) return;
    setLoading(true);
    const from = format(startOfMonth(month), "yyyy-MM-dd");
    const to = format(endOfMonth(month), "yyyy-MM-dd");
    const { data } = await sb
      .from("class_schedule")
      .select("id, class_id, start_time, end_time, spots_remaining, is_cancelled, instructor, classes(title, instructor, max_capacity, location)")
      .gte("start_time", `${from}T00:00:00Z`).lte("start_time", `${to}T23:59:59Z`)
      .order("start_time");
    const mine = (((data as any) ?? []) as Session[])
      .filter((s) => teacherOf(s) === teacher.display_name.trim().toLowerCase());
    setSessions(mine);

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
   * Call off a class, or put it back. Only `is_cancelled` can change here — a
   * database trigger pins the date, time and capacity to their old values, so
   * a teacher can never quietly move a class on the studio calendar.
   */
  const setCancelled = async (s: Session, cancel: boolean) => {
    const n = counts[s.id] ?? 0;
    const msg = cancel
      ? n > 0
        ? `Cancel this class? The ${n} student${n === 1 ? "" : "s"} signed up will be emailed.`
        : "Cancel this class? Nobody has signed up, so no one will be emailed."
      : "Put this class back on the schedule?";
    if (!confirm(msg)) return;
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
    if (!confirm(`Remove ${a.guest_name || "this student"} from the class?`)) return;
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
    if (!confirm(`Delete coupon ${c.code}?`)) return;
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

  // Studio rent counts only classes that actually happened (past, not cancelled).
  const stats = useMemo(() => {
    const now = new Date();
    const given = sessions.filter((s) => !s.is_cancelled && parseISO(s.start_time) < now);
    const upcoming = sessions.filter((s) => !s.is_cancelled && parseISO(s.start_time) >= now);
    const students = sessions.reduce((n, s) => n + (counts[s.id] ?? 0), 0);
    const rate = Number(teacher?.studio_rate ?? 35);
    return { given: given.length, upcoming: upcoming.length, students, owed: given.length * rate, rate };
  }, [sessions, counts, teacher]);

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
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-20">
        <div className="mb-8">
          <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-2">Teacher Panel</p>
          <h1 className="spa-heading-lg text-foreground">{teacher?.display_name}</h1>
          <p className="spa-body mt-2">Your classes, who is coming, and what you owe for the studio.</p>
        </div>

        {/* Month navigation */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <Button variant="outline" size="icon" onClick={() => setMonth(subMonths(month, 1))}><ChevronLeft className="h-4 w-4" /></Button>
          <h2 className="font-heading text-lg font-semibold min-w-[160px] text-center">{format(month, "MMMM yyyy")}</h2>
          <Button variant="outline" size="icon" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight className="h-4 w-4" /></Button>
          {!isSameMonth(month, new Date()) && <Button variant="ghost" size="sm" onClick={() => setMonth(new Date())}>This month</Button>}
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          <Stat icon={CalendarDays} label="Classes given" value={String(stats.given)} sub="this month" />
          <Stat icon={CalendarDays} label="Upcoming" value={String(stats.upcoming)} sub="still to come" />
          <Stat icon={Users} label="Students" value={String(stats.students)} sub="signed up" />
          <Stat icon={Wallet} label="Studio rent" value={usd(stats.owed)} sub={`${stats.given} x ${usd(stats.rate)}`} accent />
        </div>

        {/* Classes */}
        <Card className="p-4 mb-8">
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
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-body text-xs text-muted-foreground whitespace-nowrap">
                        <Users className="h-3 w-3 inline mr-1" />{n}
                      </span>
                      <Button variant="outline" size="sm" onClick={() => openAttendees(s)}>Students</Button>
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

        {/* Her own coupons */}
        <Card className="p-4 mb-8">
          <h3 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-2">
            <Ticket className="h-4 w-4" /> Your coupons
          </h3>
          <p className="font-body text-xs text-muted-foreground mb-3">
            A record of a price you agreed with a student — you apply it when they pay you.
            These never change what Holis charges.
          </p>

          {/* New coupon */}
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

        {/* How students pay her */}
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
