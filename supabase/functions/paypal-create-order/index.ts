// deno-lint-ignore-file no-explicit-any
// Edge function: paypal-create-order
//
// Creates a PayPal order for a yoga CLASS booking, an OFFERING purchase
// (membership / pass / drop-in) or a TEACHER'S PASS. The amount is computed HERE
// from the database, never taken from the browser, and stored in paypal_orders
// so capture can re-verify it. Returns the PayPal order id for the JS SDK.
//
// Paying a teacher (studio-rental model): a class booked with `pay_teacher`, and
// every teacher's pass, can be paid to HER PayPal account (`payee`). That is
// switched off for now (TEACHER_PAYOUTS_ENABLED): every class and every
// teacher's pass is paid to Holis, as a class always was without `pay_teacher`.
//
// The price (2026-10): Holis Wellness Center runs the classes and passes — the
// teachers chose not to use their panel. A class or a Holis pass is priced by
// holis_price() in the database: the studio's local discount for a Costa Rican
// cédula, or else a Holis coupon — never both. A pass can be bought without an
// account (name, email and phone), like a teacher's pass was. teacher_price()
// stays for a teacher's own pass (kind "teacher_pass"), no longer sold.
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { z } from "npm:zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: any, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const PP_BASE = (Deno.env.get("PAYPAL_MODE") ?? "live") === "sandbox"
  ? "https://api-m.sandbox.paypal.com"
  : "https://api-m.paypal.com";

async function ppToken(): Promise<string> {
  const id = Deno.env.get("PAYPAL_CLIENT_ID");
  const secret = Deno.env.get("PAYPAL_SECRET");
  if (!id || !secret) throw Object.assign(new Error("paypal_not_configured"), { code: "CONFIG" });
  const res = await fetch(`${PP_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(`${id}:${secret}`), "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw Object.assign(new Error("paypal_auth_failed"), { code: "AUTH" });
  return (await res.json()).access_token;
}

const Body = z.object({
  kind: z.enum(["class", "offering", "teacher_pass"]),
  schedule_id: z.string().uuid().optional(),
  offering_id: z.string().uuid().optional(),
  // A teacher's own pass (teacher_memberships.id).
  membership_id: z.string().uuid().optional(),
  // Class only: pay the teacher of the session, not Holis.
  pay_teacher: z.boolean().optional(),
  coupon_code: z.string().trim().max(64).optional().nullable(),
  guest_name: z.string().trim().max(120).optional().nullable(),
  guest_email: z.string().trim().email().max(255).optional().nullable(),
  guest_phone: z.string().trim().max(40).optional().nullable(),
  user_id: z.string().uuid().optional().nullable(),
  // Number of class spots to book in one payment (default 1).
  quantity: z.number().int().min(1).max(10).optional(),
  // One name per spot (booker first), so each spot books a named participant.
  participant_names: z.array(z.string().trim().max(120)).max(10).optional(),
  // The student's ID. Only a Costa Rican cédula can take a local discount.
  id_document: z.string().trim().max(40).optional().nullable(),
  id_document_type: z.enum(["cr_cedula", "other"]).optional().nullable(),
});

/** Her price for this student: local discount, else her coupon, else as it is.
 *  Null when it could not be worked out (then nothing is discounted). */
async function teacherPrice(admin: any, teacherId: string, base: number, body: z.infer<typeof Body>, coupon: string | null) {
  const cedula = body.id_document_type === "cr_cedula" ? (body.id_document || "").trim() || null : null;
  const { data, error } = await admin.rpc("teacher_price", {
    _teacher_id: teacherId, _base: base, _id_document: cedula, _coupon: coupon,
  });
  if (error || !data) {
    console.error("[paypal-create-order] teacher_price failed", error?.message);
    return null;
  }
  return data as { price: number; discount: number; local: boolean; local_pct: number; coupon: string | null; coupon_status: string | null };
}

/** Holis' price: the local discount, else a Holis coupon. Null when it could not
 *  be worked out (then the order is refused rather than charged wrong). */
async function holisPrice(
  admin: any, base: number, body: z.infer<typeof Body>, coupon: string | null,
  ids: { classId?: string | null; offeringId?: string | null },
) {
  const cedula = body.id_document_type === "cr_cedula" ? (body.id_document || "").trim() || null : null;
  const { data, error } = await admin.rpc("holis_price", {
    _base: base, _id_document: cedula, _coupon: coupon,
    _class_id: ids.classId ?? null, _offering_id: ids.offeringId ?? null,
  });
  if (error || !data) {
    console.error("[paypal-create-order] holis_price failed", error?.message);
    return null;
  }
  return data as {
    price: number; discount: number; local: boolean; local_pct: number;
    coupon: string | null; coupon_id?: string | null; coupon_status: string | null;
  };
}

/** A coupon typed that does not apply: the guest is told, nothing is charged. */
const COUPON_MESSAGES: Record<string, string> = {
  not_found: "That coupon code doesn't exist.",
  not_valid: "That coupon is no longer valid.",
  not_for_this: "That coupon doesn't work on this.",
  full_price_only: "This class is always paid in full — coupons don't apply to it.",
};

/** What is kept of the student's ID with the order. */
const idOf = (body: z.infer<typeof Body>) => ({
  id_document: (body.id_document || "").trim() || null,
  id_document_type: (body.id_document || "").trim() ? (body.id_document_type ?? null) : null,
});

/** The teacher of a session — the same rule as the cash payee: whoever is named
 *  on the session, else the class's usual teacher. Active teachers only. */
async function sessionTeacher(admin: any, sessionName?: string | null, className?: string | null) {
  const name = (sessionName || "").trim() || (className || "").trim();
  if (!name) return null;
  const { data } = await admin.from("teachers").select("id, display_name, paypal_email, paypal_enabled, active").eq("active", true);
  return ((data ?? []) as any[]).find((t) => String(t.display_name || "").trim().toLowerCase() === name.toLowerCase()) ?? null;
}

/**
 * Teachers paid straight to their own PayPal. Off for now: Holis takes every
 * online payment. The database has the same switch (teacher_payouts_enabled()).
 */
const TEACHER_PAYOUTS_ENABLED = false;

/** Her PayPal account — only while she has PayPal switched on (and payouts are on). */
const paypalOf = (t: any): string | null => {
  if (!TEACHER_PAYOUTS_ENABLED) return null;
  if (!t || t.paypal_enabled === false) return null;
  const e = String(t.paypal_email || "").trim();
  return e ? e : null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, reason: "method_not_allowed" }, 405);

  let parsed; try { parsed = Body.safeParse(await req.json()); } catch { return json({ ok: false, reason: "invalid_json" }, 400); }
  if (!parsed.success) return json({ ok: false, reason: "invalid_body", errors: parsed.error.flatten().fieldErrors }, 400);
  const body = parsed.data;

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    let amount = 0;
    let description = "";
    let target: any = {};
    // Set when the money goes to a teacher's PayPal instead of Holis'.
    let payee: { teacherId: string; email: string } | null = null;

    if (body.kind === "class") {
      if (!body.schedule_id) return json({ ok: false, reason: "missing_schedule" }, 400);
      const { data: sched } = await admin
        .from("class_schedule")
        .select("id, start_time, spots_remaining, class_id, instructor, classes(id, title, price, requires_payment, is_active, instructor, full_price_only)")
        .eq("id", body.schedule_id).maybeSingle();
      const cls: any = (sched as any)?.classes;
      if (!sched || !cls || cls.is_active === false) return json({ ok: false, reason: "class_unavailable" }, 404);
      // The studio is closed that day: stop before PayPal takes any money.
      const { data: closedDay } = await admin.rpc("is_class_day_closed", { _at: (sched as any).start_time });
      if (closedDay) return json({ ok: false, reason: "class_day_closed" }, 409);
      // Online booking is open until the class starts. Checked here, before any
      // money moves: a payment begun in time is honoured at capture even if it
      // completes a few seconds after the start (the booking trigger lets this
      // server function through for exactly that reason).
      if (new Date((sched as any).start_time).getTime() <= Date.now()) {
        return json({ ok: false, reason: "class_started", message: "This class has already started — online booking is closed." }, 409);
      }
      const qty = Math.max(1, Math.min(Number(body.quantity ?? 1), 10));
      if (Number(sched.spots_remaining) < qty) return json({ ok: false, reason: "class_full" }, 409);
      const base = Number(cls.price ?? 0);
      // With teacher payouts off, `pay_teacher` is ignored: the class is paid to Holis.
      if (body.pay_teacher && TEACHER_PAYOUTS_ENABLED) {
        const teacher = await sessionTeacher(admin, (sched as any).instructor, cls.instructor);
        const email = paypalOf(teacher);
        if (!teacher || !email) {
          return json({ ok: false, reason: "teacher_no_paypal", message: "This teacher does not take PayPal yet — please pay in cash at the class." }, 409);
        }
        // A Holis coupon discounts Holis money; it cannot discount the teacher's.
        if ((body.coupon_code || "").trim()) {
          return json({ ok: false, reason: "invalid_coupon", message: "Holis coupons don't apply when you pay your teacher directly." }, 400);
        }
        payee = { teacherId: teacher.id, email };
      }
      // A discount applies once to the whole order (one spot — the booker's):
      // Holis' local discount (Costa Rican cédula), else a Holis coupon. A class
      // always paid in full takes no coupon, but the local discount applies.
      const wanted = (body.coupon_code || "").trim().toUpperCase() || null;
      const q = await holisPrice(admin, base, body, cls.full_price_only ? null : wanted, { classId: String(cls.id) });
      if (!q) return json({ ok: false, reason: "pricing_failed" }, 500);
      if (wanted && !q.local && q.coupon_status !== "applied" && !cls.full_price_only) {
        return json({ ok: false, reason: "invalid_coupon", message: COUPON_MESSAGES[String(q.coupon_status)] ?? "That coupon is not valid." }, 400);
      }
      const local = !!q.local;
      const discount = Number(q.discount) || 0;
      const couponUsed: string | null = local ? null : q.coupon ?? null;
      amount = Math.max(0, Math.round((base * qty - discount) * 100) / 100);
      if (amount <= 0) return json({ ok: false, reason: "class_is_free" }, 400);
      description = qty > 1 ? `Class: ${cls.title} (${qty} spots)` : `Class: ${cls.title}`;
      if (local) description += " — local price";
      const names = (body.participant_names || []).map((n) => (n || "").trim()).slice(0, qty);
      target = {
        schedule_id: body.schedule_id, guest_name: body.guest_name, guest_email: body.guest_email, guest_phone: body.guest_phone,
        coupon_code: couponUsed, coupon_id: local ? null : q.coupon_id ?? null, quantity: qty, participant_names: names,
        unit_price: base, discount, local_discount: local, ...idOf(body),
      };
    } else if (body.kind === "teacher_pass") {
      if (!body.membership_id) return json({ ok: false, reason: "missing_membership" }, 400);
      if (!(body.guest_name || "").trim() || !(body.guest_email || "").trim()) {
        return json({ ok: false, reason: "missing_contact", message: "Your name and email are needed to send you the pass." }, 400);
      }
      const { data: m } = await admin.from("teacher_memberships")
        .select("id, name, price, is_active, teacher_id, teachers(id, display_name, paypal_email, paypal_enabled, active)")
        .eq("id", body.membership_id).maybeSingle();
      const teacher: any = (m as any)?.teachers;
      if (!m || !(m as any).is_active || !teacher?.active) return json({ ok: false, reason: "pass_unavailable" }, 404);
      // Paid to her PayPal while payouts are on; to Holis for now.
      const email = paypalOf(teacher);
      if (TEACHER_PAYOUTS_ENABLED && !email) return json({ ok: false, reason: "teacher_no_paypal", message: "This teacher does not take PayPal yet." }, 409);
      const listPrice = Math.round(Number((m as any).price ?? 0) * 100) / 100;
      if (listPrice <= 0) return json({ ok: false, reason: "invalid_amount" }, 400);
      // Her price for this student: local discount, else one of her coupons.
      const wanted = (body.coupon_code || "").trim().toUpperCase() || null;
      const q = await teacherPrice(admin, teacher.id, listPrice, body, wanted);
      if (wanted && q && !q.local && q.coupon_status !== "applied") {
        return json({ ok: false, reason: "invalid_coupon", message: `That is not one of ${teacher.display_name}'s coupons.` }, 400);
      }
      const local = !!q?.local;
      const discount = q ? Number(q.discount) || 0 : 0;
      amount = Math.max(0, Math.round((listPrice - discount) * 100) / 100);
      if (amount <= 0) {
        return json({ ok: false, reason: "free_with_coupon", message: `That coupon makes the pass free — ${teacher.display_name} can give it to you directly.` }, 400);
      }
      description = `${(m as any).name} — with ${teacher.display_name}${local ? " — local price" : ""}`;
      payee = email ? { teacherId: teacher.id, email } : null;
      target = {
        membership_id: body.membership_id, teacher_id: teacher.id,
        guest_name: (body.guest_name || "").trim(), guest_email: (body.guest_email || "").trim().toLowerCase(),
        guest_phone: (body.guest_phone || "").trim() || null, user_id: body.user_id ?? null,
        list_price: listPrice, discount, local_discount: local,
        coupon_code: local ? null : (q?.coupon_status === "applied" ? q.coupon : null),
        ...idOf(body),
      };
    } else {
      if (!body.offering_id) return json({ ok: false, reason: "missing_offering" }, 400);
      const { data: off } = await admin.from("offerings").select("id, name, price, status").eq("id", body.offering_id).maybeSingle();
      if (!off || (off as any).status !== "active") return json({ ok: false, reason: "offering_unavailable" }, 404);
      // Signed in or not: the pass code and booking link go to this email.
      if (!body.user_id && (!(body.guest_name || "").trim() || !(body.guest_email || "").trim())) {
        return json({ ok: false, reason: "missing_contact", message: "Your name and email are needed to send you the pass." }, 400);
      }
      const listPrice = Math.round(Number((off as any).price ?? 0) * 100) / 100;
      if (listPrice <= 0) return json({ ok: false, reason: "invalid_amount" }, 400);
      const wanted = (body.coupon_code || "").trim().toUpperCase() || null;
      const q = await holisPrice(admin, listPrice, body, wanted, { offeringId: String((off as any).id) });
      if (!q) return json({ ok: false, reason: "pricing_failed" }, 500);
      if (wanted && !q.local && q.coupon_status !== "applied") {
        return json({ ok: false, reason: "invalid_coupon", message: COUPON_MESSAGES[String(q.coupon_status)] ?? "That coupon is not valid." }, 400);
      }
      const local = !!q.local;
      const discount = Number(q.discount) || 0;
      amount = Math.max(0, Math.round((listPrice - discount) * 100) / 100);
      // PayPal cannot take $0: such a pass is issued by claim_offering_with_coupon().
      if (amount <= 0) return json({ ok: false, reason: "free_with_coupon", message: "That coupon covers the whole pass — confirm it on the page." }, 400);
      description = `${(off as any).name}${local ? " — local price" : ""}`;
      target = {
        offering_id: body.offering_id, user_id: body.user_id ?? null,
        guest_name: (body.guest_name || "").trim() || null,
        guest_email: (body.guest_email || "").trim().toLowerCase() || null,
        guest_phone: (body.guest_phone || "").trim() || null,
        list_price: listPrice, discount, local_discount: local,
        coupon_code: local ? null : q.coupon ?? null, coupon_id: local ? null : q.coupon_id ?? null,
        ...idOf(body),
      };
    }

    const token = await ppToken();
    const orderRes = await fetch(`${PP_BASE}/v2/checkout/orders`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{
          amount: { currency_code: "USD", value: amount.toFixed(2) },
          description: description.slice(0, 127),
          // The teacher's own account receives the money.
          ...(payee ? { payee: { email_address: payee.email } } : {}),
        }],
      }),
    });
    const order = await orderRes.json();
    if (!orderRes.ok || !order.id) {
      console.error("[paypal-create-order] paypal error", order);
      return json({ ok: false, reason: "paypal_error" }, 502);
    }

    await admin.from("paypal_orders").insert({
      order_id: order.id, kind: body.kind, amount, currency: "USD", target, status: "created",
      payee_teacher_id: payee?.teacherId ?? null, payee_email: payee?.email ?? null,
    });

    return json({ ok: true, orderId: order.id, amount });
  } catch (err) {
    const code = (err as any)?.code;
    console.error("[paypal-create-order] failed", { message: (err as Error).message, code });
    if (code === "CONFIG") return json({ ok: false, reason: "paypal_not_configured" }, 503);
    if (code === "COUPON") return json({ ok: false, reason: "invalid_coupon", message: (err as Error).message }, 400);
    return json({ ok: false, reason: "create_failed", message: (err as Error).message }, 500);
  }
});
