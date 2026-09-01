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
  Save, CreditCard, ShieldAlert, UserPlus,
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
interface Attendee {
  id: string; schedule_id: string; guest_name: string | null; guest_email: string | null;
  guest_phone: string | null; status: string; payment_status: string | null;
  payment_method: string | null; total_price: number | null; user_offering_id: string | null;
  source: string | null; attended: boolean | null;
}

/** A session's teacher: the per-session name wins, else the class template's. */
const teacherOf = (s: Session) =>
  (s.instructor?.trim() || s.classes?.instructor?.trim() || "").toLowerCase();

/** How this student is paying — drives the badge the teacher sees. */
function payLabel(a: Attendee): { text: string; tone: string } {
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
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [loadingAttendees, setLoadingAttendees] = useState(false);
  const [payDraft, setPayDraft] = useState("");
  const [savingPay, setSavingPay] = useState(false);
  // Manually adding a walk-in student (vs. those who booked on the site).
  const [showAddForm, setShowAddForm] = useState(false);
  const [addingStudent, setAddingStudent] = useState(false);
  const [newStudent, setNewStudent] = useState({ name: "", email: "", phone: "", pay: "cash" });

  useEffect(() => { if (!authLoading && !user) navigate("/auth"); }, [user, authLoading, navigate]);

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
      .select("id, schedule_id, guest_name, guest_email, guest_phone, status, payment_status, payment_method, total_price, user_offering_id, source, attended")
      .eq("schedule_id", s.id).order("created_at");
    setAttendees(((data as any) ?? []) as Attendee[]);
    setLoadingAttendees(false);
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
      payment_method: newStudent.pay,
      payment_status: newStudent.pay === "free" ? "not_required" : "pending",
      source: "teacher",
    });
    if (error) { toast.error(error.message); setAddingStudent(false); return; }
    toast.success(`${name} added`);
    setNewStudent({ name: "", email: "", phone: "", pay: "cash" });
    setShowAddForm(false);
    setAddingStudent(false);
    await openAttendees(openSession);   // refresh the list
    load();                             // refresh the per-class counter
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
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-body text-xs text-muted-foreground whitespace-nowrap">
                        <Users className="h-3 w-3 inline mr-1" />{n}
                      </span>
                      <Button variant="outline" size="sm" onClick={() => openAttendees(s)}>Students</Button>
                    </div>
                  </div>
                );
              })}
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
                  value={newStudent.pay}
                  onChange={(e) => setNewStudent({ ...newStudent, pay: e.target.value })}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="cash">Pays me (cash / SINPE)</option>
                  <option value="membership">Has a membership / pass</option>
                  <option value="free">Free / guest</option>
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
                return (
                  <div key={a.id} className={cn("rounded-lg border border-border p-3", cancelled && "opacity-50")}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-body text-sm font-medium text-foreground truncate">
                          {a.guest_name || "Guest"}
                          {cancelled && <span className="ml-2 text-xs text-destructive">(cancelled)</span>}
                        </p>
                        {a.guest_email && <p className="font-body text-xs text-muted-foreground truncate">{a.guest_email}</p>}
                        {a.guest_phone && <p className="font-body text-xs text-muted-foreground">{a.guest_phone}</p>}
                        {/* Where the signup came from */}
                        <span className="mt-1 inline-block font-body text-[11px] text-muted-foreground">
                          {byTeacher ? "Added by you" : "Booked online"}
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
