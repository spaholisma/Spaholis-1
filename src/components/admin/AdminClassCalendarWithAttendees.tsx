import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronLeft, ChevronRight, Users, Mail, XCircle, CheckCircle2, Plus, Pencil, Ban, RotateCcw, Trash2, Search, Loader2 } from "lucide-react";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths,
  startOfWeek, endOfWeek, isSameMonth, isSameDay, parseISO,
} from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useOfferings } from "@/hooks/useOfferings";

interface ScheduledClass {
  id: string;
  class_id: string;
  start_time: string;
  end_time: string;
  spots_remaining: number;
  is_cancelled: boolean;
  classes: {
    title: string;
    instructor: string | null;
    max_capacity: number;
    duration_minutes: number;
    location: string | null;
    price: number;
  } | null;
}

interface Attendee {
  id: string;
  user_id: string | null;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  status: string;
  payment_status: string;
  payment_method: string | null;
  total_price: number | null;
  coupon_code: string | null;
  created_at: string;
  profile_name?: string | null;
  profile_email?: string | null;
}

interface ClassOption {
  id: string;
  title: string;
  duration_minutes: number;
  max_capacity: number;
}

type EditForm = {
  class_id: string;
  date: string;
  time: string;
  duration_minutes: number;
  capacity: number;
  instructor: string;
  location: string;
};

type AttendeeForm = {
  name: string;
  email: string;
  phone: string;
  total_price: number;
  payment_method: string;
  payment_status: string;
  coupon_code: string;
};

/** A previously-seen customer surfaced by the admin typeahead. */
type KnownContact = {
  name: string;
  email: string | null;
  phone: string | null;
  last_seen: string;
  membership: {
    id: string;
    code: string | null;
    name_snapshot: string;
    is_unlimited: boolean;
    credits_remaining: number | null;
    expires_at: string | null;
  } | null;
};

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card (in person)" },
  { value: "transfer", label: "Bank transfer" },
  { value: "sinpe", label: "SINPE" },
  { value: "gift_card", label: "Gift card" },
  { value: "offering", label: "Package / offering redemption" },
  { value: "complimentary", label: "Complimentary" },
  { value: "other", label: "Other" },
];

const DEFAULT_LOCATION = "Holis Wellness Center";

export function AdminClassCalendarWithAttendees() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [scheduled, setScheduled] = useState<ScheduledClass[]>([]);
  const [selected, setSelected] = useState<ScheduledClass | null>(null);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [loadingAttendees, setLoadingAttendees] = useState(false);
  const [classOptions, setClassOptions] = useState<ClassOption[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EditForm>({ class_id: "", date: format(new Date(), "yyyy-MM-dd"), time: "09:00", duration_minutes: 60, capacity: 15, instructor: "", location: DEFAULT_LOCATION });
  const [saving, setSaving] = useState(false);
  const [attendeeOpen, setAttendeeOpen] = useState(false);
  const [editingAttendeeId, setEditingAttendeeId] = useState<string | null>(null);
  const [attendeeForm, setAttendeeForm] = useState<AttendeeForm>({ name: "", email: "", phone: "", total_price: 0, payment_method: "cash", payment_status: "paid", coupon_code: "" });
  const [addingAttendee, setAddingAttendee] = useState(false);
  // ---- Contact recall: typeahead over everyone we've ever recorded ----
  const [contactMatches, setContactMatches] = useState<KnownContact[]>([]);
  const [showContactList, setShowContactList] = useState(false);
  // The customer's existing pass, pulled by the typeahead and applied on submit
  // (booking through it deducts a credit server-side).
  const [linkedPass, setLinkedPass] = useState<KnownContact["membership"]>(null);
  const [codeLookup, setCodeLookup] = useState<{
    status: "idle" | "loading" | "valid" | "invalid";
    kind?: "coupon" | "gift_card" | "user_offering";
    message?: string;
    detail?: string;
  }>({ status: "idle" });

  // ---- "New Order": create a membership/pass for a customer (Acuity-style) ----
  const { data: sellableOfferings = [] } = useOfferings();
  const [orderOpen, setOrderOpen] = useState(false);
  const [orderForm, setOrderForm] = useState({ firstName: "", lastName: "", email: "", phone: "", offeringId: "" });
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [orderResult, setOrderResult] = useState<{ code: string; link: string; offeringName: string } | null>(null);

  const resetOrder = () => {
    setOrderResult(null);
    setOrderForm({ firstName: "", lastName: "", email: "", phone: "", offeringId: "" });
  };

  const submitOrder = async () => {
    if (!orderForm.firstName.trim() || !orderForm.email.trim()) return toast.error("First name and email are required");
    if (!orderForm.offeringId) return toast.error("Select a membership or pass");
    setCreatingOrder(true);
    try {
      const fullName = `${orderForm.firstName.trim()} ${orderForm.lastName.trim()}`.trim();
      const { data, error } = await supabase.rpc("create_membership_order" as any, {
        _offering_id: orderForm.offeringId,
        _guest_name: fullName,
        _guest_email: orderForm.email.trim(),
        _guest_phone: orderForm.phone.trim() || null,
      });
      if (error) throw error;
      const res = data as any;
      const link = `${window.location.origin}/classes?m=${res.access_token}`;
      setOrderResult({ code: res.code, link, offeringName: res.offering_name });
      toast.success(`Order created — code ${res.code}`);
      // Fire the "membership ready" email to the customer (+ admin copy).
      supabase.functions
        .invoke("send-membership-order-email", { body: { userOfferingId: res.id } })
        .then(
          ({ error: mailErr }) =>
            mailErr
              ? toast.warning("Order created, but the email didn't send — share the link manually.")
              : toast.success("Email sent to the customer."),
          () => toast.warning("Order created, but the email didn't send — share the link manually."),
        );
    } catch (e: any) {
      toast.error(e.message || "Failed to create order");
    } finally {
      setCreatingOrder(false);
    }
  };

  // Debounced recall of previously-recorded customers as the admin types a name.
  // Skipped while editing an existing attendee (their details are already set).
  useEffect(() => {
    const q = attendeeForm.name.trim();
    if (editingAttendeeId || !attendeeOpen || q.length < 2) {
      setContactMatches([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data, error } = await supabase.rpc("search_known_contacts" as any, { _q: q });
      if (cancelled || error) return;
      setContactMatches((data as unknown as KnownContact[]) ?? []);
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [attendeeForm.name, editingAttendeeId, attendeeOpen]);

  // Fill the form from a recalled customer, pulling their pass if they have one.
  const applyContact = (c: KnownContact) => {
    setAttendeeForm((f) => ({
      ...f,
      name: c.name,
      email: c.email ?? "",
      phone: c.phone ?? "",
      ...(c.membership
        ? { payment_method: "offering", payment_status: "paid", total_price: 0, coupon_code: c.membership.code ?? "" }
        : {}),
    }));
    setLinkedPass(c.membership);
    setShowContactList(false);
    if (c.membership) {
      setCodeLookup({
        status: "valid",
        kind: "user_offering",
        message: `Pass on file: ${c.membership.name_snapshot}${c.membership.code ? ` (code ${c.membership.code})` : ""}`,
        detail: c.membership.is_unlimited
          ? "Unlimited membership — booking through it won't use a credit."
          : `${c.membership.credits_remaining} credits remaining — booking will use 1.`,
      });
    } else {
      setCodeLookup({ status: "idle" });
    }
  };

  const lookupRedemptionCode = async () => {
    const code = attendeeForm.coupon_code.trim();
    if (!code) { setCodeLookup({ status: "idle" }); return; }
    setCodeLookup({ status: "loading" });
    const price = Number(selected?.classes?.price ?? 0);

    // 1. Try coupon
    const { data: coupon } = await supabase
      .from("coupons")
      .select("id, code, description, discount_type, discount_value, max_uses, current_uses, expires_at, is_active, restricted_class_ids")
      .ilike("code", code)
      .maybeSingle();

    if (coupon) {
      const expired = coupon.expires_at && new Date(coupon.expires_at) < new Date();
      const used = coupon.max_uses != null && coupon.current_uses >= coupon.max_uses;
      const restricted = coupon.restricted_class_ids && coupon.restricted_class_ids.length > 0
        && selected?.class_id && !coupon.restricted_class_ids.includes(selected.class_id);
      if (!coupon.is_active) { setCodeLookup({ status: "invalid", message: "Coupon is inactive" }); return; }
      if (expired) { setCodeLookup({ status: "invalid", message: "Coupon has expired" }); return; }
      if (used) { setCodeLookup({ status: "invalid", message: "Coupon usage limit reached" }); return; }
      if (restricted) { setCodeLookup({ status: "invalid", message: "Coupon not valid for this class" }); return; }
      const discounted = coupon.discount_type === "percentage"
        ? Math.max(0, price - price * (Number(coupon.discount_value) / 100))
        : Math.max(0, price - Number(coupon.discount_value));
      const discountLabel = coupon.discount_type === "percentage"
        ? `${coupon.discount_value}% off`
        : `$${coupon.discount_value} off`;
      setAttendeeForm((f) => ({
        ...f,
        coupon_code: coupon.code,
        total_price: Number(discounted.toFixed(2)),
      }));
      setCodeLookup({
        status: "valid",
        kind: "coupon",
        message: `Coupon: ${discountLabel}`,
        detail: `Price adjusted from $${price.toFixed(2)} to $${discounted.toFixed(2)}. ${coupon.description ?? ""}`.trim(),
      });
      return;
    }

    // 2. Try gift card
    const { data: gift } = await supabase
      .from("gift_cards")
      .select("id, code, remaining_value, is_active, expires_at")
      .ilike("code", code)
      .maybeSingle();

    if (gift) {
      const expired = gift.expires_at && new Date(gift.expires_at) < new Date();
      if (!gift.is_active) { setCodeLookup({ status: "invalid", message: "Gift card is inactive" }); return; }
      if (expired) { setCodeLookup({ status: "invalid", message: "Gift card has expired" }); return; }
      if (Number(gift.remaining_value) <= 0) { setCodeLookup({ status: "invalid", message: "Gift card has no balance remaining" }); return; }
      setAttendeeForm((f) => ({
        ...f,
        coupon_code: gift.code,
        payment_method: "gift_card",
        payment_status: "paid",
      }));
      setCodeLookup({
        status: "valid",
        kind: "gift_card",
        message: `Gift card · $${Number(gift.remaining_value).toFixed(2)} remaining`,
        detail: `Payment method set to Gift card.`,
      });
      return;
    }

    // 3. Try user offering (membership / class pass) — match the order code the
    //    customer was given (e.g. MU3477), or the raw id for older records.
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code);
    const uoSelect = () => supabase
      .from("user_offerings")
      .select("id, code, name_snapshot, is_unlimited, credits_remaining, status, expires_at, user_id");
    const { data: uo } = isUuid
      ? await uoSelect().eq("id", code).maybeSingle()
      : await uoSelect().ilike("code", code).maybeSingle();

    if (uo) {
      if (uo.status !== "active") { setCodeLookup({ status: "invalid", message: `Package is ${uo.status}` }); return; }
      if (uo.expires_at && new Date(uo.expires_at) < new Date()) {
        setCodeLookup({ status: "invalid", message: "Package has expired" }); return;
      }
      if (!uo.is_unlimited && (uo.credits_remaining ?? 0) <= 0) {
        setCodeLookup({ status: "invalid", message: "Package has no credits remaining" }); return;
      }
      setAttendeeForm((f) => ({
        ...f,
        coupon_code: (uo as any).code ?? f.coupon_code,
        payment_method: "offering",
        payment_status: "paid",
        total_price: 0,
      }));
      // Link it so saving redeems through the pass (deducting a credit).
      setLinkedPass({
        id: uo.id,
        code: (uo as any).code ?? null,
        name_snapshot: uo.name_snapshot,
        is_unlimited: !!uo.is_unlimited,
        credits_remaining: uo.credits_remaining ?? null,
        expires_at: uo.expires_at ?? null,
      });
      setCodeLookup({
        status: "valid",
        kind: "user_offering",
        message: `Package: ${uo.name_snapshot}`,
        detail: uo.is_unlimited
          ? "Unlimited membership. Payment method set to Package."
          : `${uo.credits_remaining} credits remaining — saving will use 1.`,
      });
      return;
    }

    setCodeLookup({ status: "invalid", message: "Code not found" });
  };

  const loadScheduled = useCallback(async () => {
    const start = format(startOfWeek(startOfMonth(currentDate)), "yyyy-MM-dd");
    const end = format(endOfWeek(endOfMonth(currentDate)), "yyyy-MM-dd");
    const { data } = await supabase
      .from("class_schedule")
      .select("id, class_id, start_time, end_time, spots_remaining, is_cancelled, classes(title, instructor, max_capacity, duration_minutes, location, price)")
      .gte("start_time", `${start}T00:00:00Z`)
      .lte("start_time", `${end}T23:59:59Z`)
      .order("start_time", { ascending: true });
    setScheduled((data as any) ?? []);
  }, [currentDate]);

  useEffect(() => { loadScheduled(); }, [loadScheduled]);

  const loadAttendees = async (scheduleId: string) => {
    setLoadingAttendees(true);
    const { data } = await supabase
      .from("class_bookings")
      .select("id, user_id, guest_name, guest_email, guest_phone, status, payment_status, payment_method, total_price, coupon_code, created_at")
      .eq("schedule_id", scheduleId)
      .order("created_at", { ascending: true });

    const rows = (data as any[]) ?? [];
    const userIds = rows.map((r) => r.user_id).filter(Boolean);
    let profilesMap: Record<string, { full_name: string | null; email: string | null }> = {};
    if (userIds.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", userIds);
      (profiles ?? []).forEach((p: any) => {
        profilesMap[p.user_id] = { full_name: p.full_name, email: p.email };
      });
    }
    setAttendees(rows.map((r) => ({
      ...r,
      profile_name: r.user_id ? profilesMap[r.user_id]?.full_name : null,
      profile_email: r.user_id ? profilesMap[r.user_id]?.email : null,
    })));
    setLoadingAttendees(false);
  };

  useEffect(() => {
    supabase.from("classes").select("id,title,duration_minutes,max_capacity").eq("is_active", true).order("title")
      .then(({ data }) => setClassOptions((data as ClassOption[]) ?? []));
  }, []);

  const openClass = (sc: ScheduledClass) => {
    setSelected(sc);
    loadAttendees(sc.id);
  };

  const openNewSession = (date?: Date) => {
    const first = classOptions[0];
    setEditingId(null);
    setForm({
      class_id: first?.id ?? "",
      date: format(date ?? new Date(), "yyyy-MM-dd"),
      time: "09:00",
      duration_minutes: first?.duration_minutes ?? 60,
      capacity: first?.max_capacity ?? 15,
      instructor: "",
      location: DEFAULT_LOCATION,
    });
    setEditorOpen(true);
  };

  const openEditSession = (sc: ScheduledClass) => {
    const start = parseISO(sc.start_time);
    const end = parseISO(sc.end_time);
    const dur = Math.max(5, Math.round((end.getTime() - start.getTime()) / 60000));
    const cap = sc.classes?.max_capacity ?? 15;
    const booked = cap - sc.spots_remaining;
    setEditingId(sc.id);
    setForm({
      class_id: sc.class_id,
      date: format(start, "yyyy-MM-dd"),
      time: format(start, "HH:mm"),
      duration_minutes: dur,
      capacity: Math.max(booked, cap),
      instructor: sc.classes?.instructor ?? "",
      location: sc.classes?.location ?? DEFAULT_LOCATION,
    });
    setEditorOpen(true);
  };

  const saveSession = async () => {
    if (!form.class_id) { toast.error("Pick a class"); return; }
    setSaving(true);
    try {
      const [h, m] = form.time.split(":").map(Number);
      const start = new Date(`${form.date}T00:00:00`);
      start.setHours(h, m, 0, 0);
      const end = new Date(start.getTime() + form.duration_minutes * 60000);

      if (editingId) {
        // Recompute spots_remaining = new capacity - booked
        const current = scheduled.find((s) => s.id === editingId);
        const oldCap = current?.classes?.max_capacity ?? form.capacity;
        const booked = oldCap - (current?.spots_remaining ?? 0);
        if (form.capacity < booked) {
          toast.error(`Cannot set capacity below ${booked} (already booked)`);
          setSaving(false);
          return;
        }
        const { error } = await supabase.from("class_schedule").update({
          class_id: form.class_id,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          spots_remaining: form.capacity - booked,
        }).eq("id", editingId);
        if (error) throw error;
        // Update the class-level fields so they reflect on this and future sessions
        await supabase.from("classes").update({
          max_capacity: form.capacity,
          instructor: form.instructor.trim() || null,
          location: form.location.trim() || DEFAULT_LOCATION,
        }).eq("id", form.class_id);
        toast.success("Session updated");
      } else {
        const { error } = await supabase.from("class_schedule").insert({
          class_id: form.class_id,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          spots_remaining: form.capacity,
          is_cancelled: false,
        });
        if (error) throw error;
        await supabase.from("classes").update({
          max_capacity: form.capacity,
          instructor: form.instructor.trim() || null,
          location: form.location.trim() || DEFAULT_LOCATION,
        }).eq("id", form.class_id);
        toast.success("Session created");
      }
      setEditorOpen(false);
      loadScheduled();
      if (selected && editingId === selected.id) setSelected(null);
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const toggleCancel = async (sc: ScheduledClass) => {
    const next = !sc.is_cancelled;
    if (next && !confirm("Cancel this session? Attendees will keep their bookings but the class will show as cancelled.")) return;
    const { error } = await supabase.from("class_schedule").update({ is_cancelled: next }).eq("id", sc.id);
    if (error) { toast.error(error.message); return; }
    toast.success(next ? "Session cancelled" : "Session reactivated");
    loadScheduled();
    setSelected((prev) => (prev && prev.id === sc.id ? { ...prev, is_cancelled: next } : prev));
  };

  const openAddAttendee = () => {
    setEditingAttendeeId(null);
    setAttendeeForm({
      name: "",
      email: "",
      phone: "",
      total_price: Number(selected?.classes?.price ?? 0),
      payment_method: "cash",
      payment_status: "paid",
      coupon_code: "",
    });
    setCodeLookup({ status: "idle" });
    setLinkedPass(null);
    setContactMatches([]);
    setShowContactList(false);
    setAttendeeOpen(true);
  };

  const openEditAttendee = (a: Attendee) => {
    setEditingAttendeeId(a.id);
    setAttendeeForm({
      name: a.profile_name || a.guest_name || "",
      email: a.profile_email || a.guest_email || "",
      phone: a.guest_phone || "",
      total_price: Number(a.total_price ?? 0),
      payment_method: a.payment_method || "cash",
      payment_status: a.payment_status || "paid",
      coupon_code: a.coupon_code || "",
    });
    setCodeLookup({ status: "idle" });
    setLinkedPass(null);
    setContactMatches([]);
    setShowContactList(false);
    setAttendeeOpen(true);
  };

  const submitAttendee = async () => {
    if (!selected) return;
    if (!attendeeForm.name.trim()) { toast.error("Name is required"); return; }
    setAddingAttendee(true);
    try {
      if (editingAttendeeId) {
        const { error } = await supabase.from("class_bookings").update({
          guest_name: attendeeForm.name.trim(),
          guest_email: attendeeForm.email.trim() || null,
          guest_phone: attendeeForm.phone.trim() || null,
          payment_status: attendeeForm.payment_status,
          payment_method: attendeeForm.payment_method,
          total_price: attendeeForm.total_price,
          coupon_code: attendeeForm.coupon_code.trim() || null,
        }).eq("id", editingAttendeeId);
        if (error) throw error;
        toast.success("Attendee updated");
        setAttendeeOpen(false);
        loadAttendees(selected.id);
      } else {
        if (selected.spots_remaining <= 0) { toast.error("This session is full"); return; }
        // Booking through the customer's own pass goes via the server so the
        // credit, the redemption record and the spot all move atomically.
        if (linkedPass && attendeeForm.payment_method === "offering") {
          const { error } = await supabase.rpc("admin_book_class_with_offering" as any, {
            _user_offering_id: linkedPass.id,
            _schedule_id: selected.id,
            _guest_name: attendeeForm.name.trim(),
            _guest_email: attendeeForm.email.trim() || null,
            _guest_phone: attendeeForm.phone.trim() || null,
          });
          if (error) throw error;
          toast.success(
            linkedPass.is_unlimited
              ? `Added with ${linkedPass.name_snapshot}`
              : `Added — 1 credit used from ${linkedPass.name_snapshot}`,
          );
          setAttendeeOpen(false);
          loadAttendees(selected.id);
          loadScheduled();
          setSelected((prev) => prev ? { ...prev, spots_remaining: Math.max(0, prev.spots_remaining - 1) } : prev);
          return;
        }
        const { error } = await supabase.from("class_bookings").insert({
          schedule_id: selected.id,
          guest_name: attendeeForm.name.trim(),
          guest_email: attendeeForm.email.trim() || null,
          guest_phone: attendeeForm.phone.trim() || null,
          status: "confirmed",
          payment_status: attendeeForm.payment_status,
          payment_method: attendeeForm.payment_method,
          total_price: attendeeForm.total_price,
          coupon_code: attendeeForm.coupon_code.trim() || null,
        });
        if (error) throw error;
        await supabase.from("class_schedule")
          .update({ spots_remaining: Math.max(0, selected.spots_remaining - 1) })
          .eq("id", selected.id);
        toast.success("Attendee added");
        setAttendeeOpen(false);
        loadAttendees(selected.id);
        loadScheduled();
        setSelected((prev) => prev ? { ...prev, spots_remaining: Math.max(0, prev.spots_remaining - 1) } : prev);
      }
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save attendee");
    } finally {
      setAddingAttendee(false);
    }
  };

  const removeAttendee = async (a: Attendee) => {
    if (!selected) return;
    if (!confirm(`Remove ${a.guest_name || a.profile_name || "this attendee"} from the class?`)) return;
    const { error } = await supabase.from("class_bookings").delete().eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    await supabase.from("class_schedule")
      .update({ spots_remaining: selected.spots_remaining + 1 })
      .eq("id", selected.id);
    toast.success("Attendee removed");
    loadAttendees(selected.id);
    loadScheduled();
    setSelected((prev) => prev ? { ...prev, spots_remaining: prev.spots_remaining + 1 } : prev);
  };

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentDate)),
    end: endOfWeek(endOfMonth(currentDate)),
  });

  const confirmedAttendees = attendees.filter((a) => a.status !== "cancelled");
  const capacity = selected?.classes?.max_capacity ?? 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCurrentDate(subMonths(currentDate, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h3 className="font-heading text-lg font-semibold">{format(currentDate, "MMMM yyyy")}</h3>
          <Button variant="outline" size="icon" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => { resetOrder(); setOrderOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> New Order
          </Button>
          <Button size="sm" onClick={() => openNewSession()}>
            <Plus className="h-4 w-4 mr-1" /> New session
          </Button>
        </div>
      </div>

      <div className="border border-border rounded-xl overflow-hidden">
        <div className="grid grid-cols-7 bg-muted">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="p-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const dayClasses = scheduled.filter((s) => isSameDay(parseISO(s.start_time), day));
            const isToday = isSameDay(day, new Date());
            const inMonth = isSameMonth(day, currentDate);
            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "min-h-[110px] border-b border-r border-border p-1.5",
                  !inMonth && "opacity-40 bg-muted/10"
                )}
              >
                <div className={cn(
                  "text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full",
                  isToday && "bg-primary text-primary-foreground"
                )}>
                  {format(day, "d")}
                </div>
                <div className="space-y-0.5">
                  {dayClasses.slice(0, 4).map((sc) => {
                    const cap = sc.classes?.max_capacity ?? 0;
                    const booked = cap - sc.spots_remaining;
                    return (
                      <button
                        key={sc.id}
                        onClick={() => openClass(sc)}
                        className={cn(
                          "block w-full text-left text-[10px] leading-tight px-1.5 py-1 rounded truncate font-medium hover:opacity-80 transition-opacity",
                          sc.is_cancelled ? "bg-destructive/10 text-destructive line-through" : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                        )}
                      >
                        <div className="truncate">{format(parseISO(sc.start_time), "HH:mm")} {sc.classes?.title ?? "Class"}</div>
                        <div className="opacity-70">{booked}/{cap} booked</div>
                      </button>
                    );
                  })}
                  {dayClasses.length > 4 && (
                    <div className="text-[10px] text-muted-foreground px-1.5">+{dayClasses.length - 4} more</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6 space-y-2">
        <h4 className="font-heading text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Classes this month ({scheduled.length})
        </h4>
        {scheduled.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">No classes scheduled for this month.</p>
        )}
        {scheduled.map((sc) => {
          const cap = sc.classes?.max_capacity ?? 0;
          const booked = cap - sc.spots_remaining;
          return (
            <Card key={sc.id} className="p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className={cn("w-2 h-10 rounded-full shrink-0", sc.is_cancelled ? "bg-destructive" : "bg-emerald-500")} />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {sc.classes?.title ?? "Class"}
                    {sc.is_cancelled && <span className="ml-2 text-xs text-destructive">(Cancelled)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(parseISO(sc.start_time), "EEE, MMM d · HH:mm")} – {format(parseISO(sc.end_time), "HH:mm")}
                    {sc.classes?.instructor && ` · ${sc.classes.instructor}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={sc.spots_remaining === 0 ? "destructive" : "secondary"}>
                  <Users className="h-3 w-3 mr-1" /> {booked}/{cap}
                </Badge>
                <Button variant="outline" size="sm" onClick={() => openClass(sc)}>
                  View attendees
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) { setSelected(null); setAttendees([]); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selected?.classes?.title ?? "Class"}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm bg-muted/40 rounded-lg p-3">
                <div>
                  <p className="text-xs text-muted-foreground">Date & time</p>
                  <p className="font-medium">
                    {format(parseISO(selected.start_time), "EEE, MMM d yyyy")}<br />
                    {format(parseISO(selected.start_time), "HH:mm")} – {format(parseISO(selected.end_time), "HH:mm")}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Instructor</p>
                  <p className="font-medium">{selected.classes?.instructor ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Location</p>
                  <p className="font-medium">{selected.classes?.location ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Capacity</p>
                  <p className="font-medium">
                    {confirmedAttendees.length} / {capacity} booked
                    {" · "}{selected.spots_remaining} spots left
                  </p>
                </div>
              </div>



              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => openEditSession(selected)}>
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Edit session
                </Button>
                <Button
                  variant={selected.is_cancelled ? "outline" : "destructive"}
                  size="sm"
                  onClick={() => toggleCancel(selected)}
                >
                  {selected.is_cancelled ? (
                    <><RotateCcw className="h-3.5 w-3.5 mr-1" /> Reactivate</>
                  ) : (
                    <><Ban className="h-3.5 w-3.5 mr-1" /> Cancel session</>
                  )}
                </Button>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-heading text-sm font-semibold flex items-center gap-2">
                    <Users className="h-4 w-4" /> Attendees ({attendees.length})
                  </h4>
                  <Button size="sm" variant="outline" onClick={openAddAttendee} disabled={selected.spots_remaining <= 0}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add attendee
                  </Button>
                </div>
                {loadingAttendees ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
                ) : attendees.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center border border-dashed border-border rounded-lg">
                    No attendees booked yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {attendees.map((a) => {
                      const name = a.profile_name || a.guest_name || "Guest";
                      const email = a.profile_email || a.guest_email || "—";
                      const cancelled = a.status === "cancelled";
                      return (
                        <div key={a.id} className={cn(
                          "flex items-center justify-between gap-3 p-3 border border-border rounded-lg",
                          cancelled && "opacity-60"
                        )}>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate flex items-center gap-2">
                              {cancelled ? <XCircle className="h-3.5 w-3.5 text-destructive" /> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                              {name}
                              {a.user_id ? (
                                <Badge variant="outline" className="text-[10px]">Member</Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px]">Guest</Badge>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                              <Mail className="h-3 w-3" /> {email}
                            </p>
                          </div>
                          <div className="text-right shrink-0 flex items-start gap-2">
                            <div>
                              <Badge variant={a.payment_status === "paid" ? "default" : a.payment_status === "pending" ? "secondary" : "outline"} className="text-[10px]">
                                {a.payment_status}
                              </Badge>
                              {a.total_price != null && a.total_price > 0 && (
                                <p className="text-[10px] text-muted-foreground mt-1">${Number(a.total_price).toFixed(2)}</p>
                              )}
                              {a.payment_method && (
                                <p className="text-[10px] text-muted-foreground">{a.payment_method}</p>
                              )}
                              {a.coupon_code && (
                                <p className="text-[10px] text-muted-foreground italic">code: {a.coupon_code}</p>
                              )}
                            </div>
                            <div className="flex flex-col gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditAttendee(a)} title="Edit attendee">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeAttendee(a)} title="Remove attendee">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {attendees.length > 0 && (
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const rows = [
                        ["Name", "Email", "Status", "Payment", "Method", "Total", "Booked at"],
                        ...attendees.map((a) => [
                          a.profile_name || a.guest_name || "Guest",
                          a.profile_email || a.guest_email || "",
                          a.status,
                          a.payment_status,
                          a.payment_method || "",
                          a.total_price ?? "",
                          a.created_at,
                        ]),
                      ];
                      const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
                      const blob = new Blob([csv], { type: "text/csv" });
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement("a");
                      link.href = url;
                      link.download = `attendees-${selected.classes?.title ?? "class"}-${format(parseISO(selected.start_time), "yyyy-MM-dd")}.csv`;
                      link.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    Export CSV
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* New Order — create a membership/pass for a customer */}
      <Dialog open={orderOpen} onOpenChange={(v) => { setOrderOpen(v); if (!v) resetOrder(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Order — Membership / Pass</DialogTitle>
          </DialogHeader>
          {orderResult ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-spa-sage/40 bg-spa-sage/10 p-4 space-y-1">
                <p className="text-sm font-body text-foreground">Order created for <strong>{orderResult.offeringName}</strong>.</p>
                <p className="text-sm font-body">Code: <span className="font-mono font-semibold tracking-wider">{orderResult.code}</span></p>
              </div>
              <div>
                <label className="font-body text-sm font-medium mb-1.5 block">Scheduling link (send to the customer)</label>
                <div className="flex gap-2">
                  <Input readOnly value={orderResult.link} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
                  <Button type="button" variant="outline" onClick={() => { navigator.clipboard?.writeText(orderResult.link); toast.success("Link copied"); }}>Copy</Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1 font-body">We also emailed this link to the customer (with a copy to admin). Opening it lets them book eligible classes at $0 — no login.</p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={resetOrder}>Create another</Button>
                <Button onClick={() => setOrderOpen(false)}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-body text-sm font-medium mb-1.5 block">First name *</label>
                  <Input value={orderForm.firstName} onChange={(e) => setOrderForm({ ...orderForm, firstName: e.target.value })} />
                </div>
                <div>
                  <label className="font-body text-sm font-medium mb-1.5 block">Last name</label>
                  <Input value={orderForm.lastName} onChange={(e) => setOrderForm({ ...orderForm, lastName: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="font-body text-sm font-medium mb-1.5 block">Email *</label>
                <Input type="email" value={orderForm.email} onChange={(e) => setOrderForm({ ...orderForm, email: e.target.value })} placeholder="customer@example.com" />
              </div>
              <div>
                <label className="font-body text-sm font-medium mb-1.5 block">Phone</label>
                <Input value={orderForm.phone} onChange={(e) => setOrderForm({ ...orderForm, phone: e.target.value })} placeholder="+506 8888 8888" />
              </div>
              <div>
                <label className="font-body text-sm font-medium mb-1.5 block">Membership / Pass *</label>
                <select
                  className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-body"
                  value={orderForm.offeringId}
                  onChange={(e) => setOrderForm({ ...orderForm, offeringId: e.target.value })}
                >
                  <option value="">Select…</option>
                  {sellableOfferings
                    .filter((o) => o.type === "membership" || o.type === "class_pass")
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name} — {o.is_unlimited ? "Unlimited" : `${o.credits ?? 0} credits`}{o.duration_days ? ` · ${o.duration_days}d` : ""}
                      </option>
                    ))}
                </select>
              </div>
              <p className="text-xs text-muted-foreground font-body">Creating the order confirms payment was received. A unique code + booking link are generated automatically.</p>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOrderOpen(false)}>Cancel</Button>
                <Button onClick={submitOrder} disabled={creatingOrder}>{creatingOrder ? "Creating…" : "Create order"}</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit class session" : "New class session"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Class</Label>
              <select
                className="w-full text-sm rounded-md border border-input bg-background px-3 py-2"
                value={form.class_id}
                onChange={(e) => {
                  const c = classOptions.find((o) => o.id === e.target.value);
                  setForm((f) => ({
                    ...f,
                    class_id: e.target.value,
                    duration_minutes: c?.duration_minutes ?? f.duration_minutes,
                    capacity: editingId ? f.capacity : (c?.max_capacity ?? f.capacity),
                  }));
                }}
              >
                {classOptions.length === 0 && <option value="">No classes available</option>}
                {classOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Start time</Label>
                <Input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Duration (minutes)</Label>
                <Input
                  type="number"
                  min={5}
                  step={5}
                  value={form.duration_minutes}
                  onChange={(e) => setForm({ ...form, duration_minutes: Math.max(5, Number(e.target.value) || 0) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Capacity</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.capacity}
                  onChange={(e) => setForm({ ...form, capacity: Math.max(1, Number(e.target.value) || 0) })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Instructor</Label>
                <Input
                  value={form.instructor}
                  onChange={(e) => setForm({ ...form, instructor: e.target.value })}
                  placeholder="e.g. Eve Holis"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Location</Label>
                <Input
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder={DEFAULT_LOCATION}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Instructor, location and capacity are saved on the class and apply to this and future sessions of the same class. Capacity cannot go below the number of already-booked attendees.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button>
            <Button onClick={saveSession} disabled={saving}>
              {saving ? "Saving..." : editingId ? "Save changes" : "Create session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={attendeeOpen} onOpenChange={setAttendeeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingAttendeeId ? "Edit attendee" : "Add attendee"} — {selected?.classes?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 relative">
                <Label>Name *</Label>
                <Input
                  value={attendeeForm.name}
                  onChange={(e) => {
                    setAttendeeForm({ ...attendeeForm, name: e.target.value });
                    setShowContactList(true);
                    setLinkedPass(null);
                  }}
                  onFocus={() => setShowContactList(true)}
                  onBlur={() => setTimeout(() => setShowContactList(false), 150)}
                  placeholder="Start typing to find a past customer"
                  autoComplete="off"
                />
                {showContactList && contactMatches.length > 0 && (
                  <ul className="absolute z-50 top-full left-0 right-0 mt-1 max-h-60 overflow-auto rounded-md border border-border bg-popover shadow-md">
                    {contactMatches.map((c, i) => (
                      <li key={`${c.email ?? c.name}-${i}`}>
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => applyContact(c)}
                        >
                          <span className="block text-sm font-medium text-foreground">{c.name}</span>
                          <span className="block text-xs text-muted-foreground truncate">
                            {[c.email, c.phone].filter(Boolean).join(" · ") || "no contact details on file"}
                          </span>
                          {c.membership && (
                            <span className="mt-0.5 inline-block rounded-full bg-spa-sage/15 px-2 py-0.5 text-[11px] font-medium text-spa-sage">
                              {c.membership.name_snapshot}
                              {c.membership.code ? ` · ${c.membership.code}` : ""}
                              {c.membership.is_unlimited ? " · Unlimited" : ` · ${c.membership.credits_remaining} left`}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={attendeeForm.email} onChange={(e) => setAttendeeForm({ ...attendeeForm, email: e.target.value })} placeholder="optional" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={attendeeForm.phone} onChange={(e) => setAttendeeForm({ ...attendeeForm, phone: e.target.value })} placeholder="optional" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Price paid</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={attendeeForm.total_price}
                  onChange={(e) => setAttendeeForm({ ...attendeeForm, total_price: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Payment status</Label>
                <select
                  className="w-full text-sm rounded-md border border-input bg-background px-3 py-2"
                  value={attendeeForm.payment_status}
                  onChange={(e) => setAttendeeForm({ ...attendeeForm, payment_status: e.target.value })}
                >
                  <option value="paid">Paid</option>
                  <option value="pending">Pending</option>
                  <option value="waived">Waived / comp</option>
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Payment method</Label>
              <select
                className="w-full text-sm rounded-md border border-input bg-background px-3 py-2"
                value={attendeeForm.payment_method}
                onChange={(e) => {
                  const v = e.target.value;
                  setAttendeeForm((f) => ({
                    ...f,
                    payment_method: v,
                    total_price: v === "complimentary" ? 0 : f.total_price,
                    payment_status: v === "complimentary" ? "waived" : f.payment_status,
                  }));
                }}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Redemption / coupon code (optional)</Label>
              <div className="flex gap-2">
                <Input
                  value={attendeeForm.coupon_code}
                  onChange={(e) => {
                    setAttendeeForm({ ...attendeeForm, coupon_code: e.target.value });
                    setCodeLookup({ status: "idle" });
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); lookupRedemptionCode(); } }}
                  placeholder="Coupon, gift card, or package ID"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={lookupRedemptionCode}
                  disabled={codeLookup.status === "loading" || !attendeeForm.coupon_code.trim()}
                >
                  {codeLookup.status === "loading"
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <><Search className="h-4 w-4 mr-1" /> Validate</>}
                </Button>
              </div>
              {codeLookup.status === "valid" && (
                <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-3 py-2 text-xs flex items-start gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">{codeLookup.message}</p>
                    {codeLookup.detail && <p className="opacity-80 mt-0.5">{codeLookup.detail}</p>}
                  </div>
                </div>
              )}
              {codeLookup.status === "invalid" && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 text-destructive px-3 py-2 text-xs flex items-start gap-2">
                  <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <p className="font-medium">{codeLookup.message}</p>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">Validates against coupons, gift cards, and packages. Payment method and price auto-update when a code matches.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAttendeeOpen(false)}>Cancel</Button>
            <Button onClick={submitAttendee} disabled={addingAttendee}>
              {addingAttendee ? "Saving..." : editingAttendeeId ? "Save changes" : "Add attendee"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
