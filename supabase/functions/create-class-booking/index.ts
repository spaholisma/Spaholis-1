// deno-lint-ignore-file no-explicit-any
// Edge function: create-class-booking
//
// Server-authoritative creation of CLASS bookings, mirroring `create-booking`
// (which handles treatment `bookings`). Runs with the service role so guest
// checkout is never blocked by RLS, and — crucially — RECOMPUTES the price and
// coupon on the server so the browser can never dictate what a customer pays.
//
// Two outcomes:
//   * total > 0  -> create a `pending_payment` class_booking and return the BAC
//                   CompraClick link so the browser can redirect to pay. The
//                   booking is only confirmed later by `finalize-booking` when
//                   BAC's return callback is validated server-side.
//   * total == 0 -> (100% coupon) create a CONFIRMED/paid class_booking
//                   immediately, decrement a spot, record coupon usage and send
//                   the confirmation email. No redirect.
//
// Membership / class-credit redemption is NOT handled here — it already flows
// through the `redeem_offering` RPC on the client.

import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { z } from "npm:zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BodySchema = z.object({
  id: z.string().uuid().optional(),
  schedule_id: z.string().uuid(),
  guest_name: z.string().trim().min(2).max(100),
  guest_email: z.string().trim().email().max(255),
  coupon_code: z.string().trim().max(64).optional().nullable(),
});
type Body = z.infer<typeof BodySchema>;

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function getAuthenticatedUserId(req: Request, admin: any): Promise<string | null> {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token || token === Deno.env.get("SUPABASE_ANON_KEY")) return null;
  try {
    const { data, error } = await admin.auth.getUser(token);
    if (error) return null;
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

// Same rules as the client validateCoupon + create-booking, but restricted on
// the CLASS dimension. Returns the normalized code + discount, or throws.
async function validateClassCoupon(
  admin: any,
  codeRaw: string | null | undefined,
  basePrice: number,
  classId: string,
): Promise<{ code: string | null; discount: number; couponId: string | null }> {
  const code = (codeRaw || "").trim().toUpperCase();
  if (!code) return { code: null, discount: 0, couponId: null };

  const { data: coupon, error } = await admin
    .from("coupons")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (error || !coupon) throw Object.assign(new Error("Coupon not found"), { code: "INVALID_COUPON" });
  if (!coupon.is_active) throw Object.assign(new Error("Coupon inactive"), { code: "INVALID_COUPON" });
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    throw Object.assign(new Error("Coupon expired"), { code: "INVALID_COUPON" });
  }
  if (coupon.max_uses != null && coupon.current_uses >= coupon.max_uses) {
    throw Object.assign(new Error("Coupon usage limit reached"), { code: "INVALID_COUPON" });
  }
  if (Array.isArray(coupon.restricted_class_ids) && coupon.restricted_class_ids.length > 0) {
    if (!coupon.restricted_class_ids.includes(classId)) {
      throw Object.assign(new Error("Coupon does not apply to this class"), { code: "INVALID_COUPON" });
    }
  }

  const discount = coupon.discount_type === "percentage"
    ? Math.round(basePrice * (Number(coupon.discount_value) / 100) * 100) / 100
    : Math.min(basePrice, Number(coupon.discount_value));

  return {
    code: coupon.code as string,
    discount: Number.isFinite(discount) ? discount : 0,
    couponId: coupon.id as string,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, reason: "method_not_allowed" }, 405);

  let parsed: z.SafeParseReturnType<unknown, Body>;
  try {
    parsed = BodySchema.safeParse(await req.json());
  } catch {
    return json({ ok: false, reason: "invalid_json" }, 400);
  }
  if (!parsed.success) {
    return json({ ok: false, reason: "invalid_body", errors: parsed.error.flatten().fieldErrors }, 400);
  }
  const body = parsed.data;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // 1. Load schedule + class.
    const { data: schedule, error: schErr } = await admin
      .from("class_schedule")
      .select("id, spots_remaining, class_id, classes(id, title, price, requires_payment, is_active, payment_link)")
      .eq("id", body.schedule_id)
      .maybeSingle();

    if (schErr) throw schErr;
    if (!schedule) return json({ ok: false, reason: "class_unavailable" }, 404);

    const cls: any = (schedule as any).classes;
    if (!cls || cls.is_active === false) return json({ ok: false, reason: "class_unavailable" }, 404);

    const basePrice = Number(cls.price ?? 0);
    const requiresPayment = !!cls.requires_payment && basePrice > 0;
    // This function is only for the paid / coupon path. Free classes use the
    // existing client flow.
    if (!requiresPayment) return json({ ok: false, reason: "class_is_free" }, 400);

    // 2. Recompute price with coupon (server-authoritative).
    const coupon = await validateClassCoupon(admin, body.coupon_code, basePrice, String(cls.id));
    const totalPrice = Math.max(0, Math.round((basePrice - coupon.discount) * 100) / 100);

    // The reused Drop-in CompraClick link charges a FIXED amount (the full
    // class price). A partial discount (>0 and <full) can't be charged by it,
    // so we only support: full price (no/covered discount) or a 100% coupon
    // (free, handled below). Reject partial coupons rather than mis-charge.
    if (totalPrice > 0 && coupon.discount > 0) {
      return json({
        ok: false,
        reason: "partial_coupon_unsupported",
        message: "Partial coupons can't be used for card payment on classes. Use a 100% coupon or pay the full price.",
      }, 400);
    }

    // 3. Capacity check.
    if (Number(schedule.spots_remaining) <= 0) {
      return json({ ok: false, reason: "class_full" }, 409);
    }

    const userId = await getAuthenticatedUserId(req, admin);
    const bookingId = body.id && UUID_RE.test(body.id) ? body.id : crypto.randomUUID();

    // ============ CASE A: coupon covers 100% -> confirm immediately ============
    if (totalPrice <= 0) {
      // Atomically claim a spot; if it just filled, refuse.
      const { data: remaining, error: decErr } = await admin.rpc("decrement_class_spot", {
        _schedule_id: schedule.id,
      });
      if (decErr) throw decErr;
      if (remaining === null || remaining === undefined) return json({ ok: false, reason: "class_full" }, 409);

      const { error: insErr } = await admin.from("class_bookings").insert({
        id: bookingId,
        schedule_id: schedule.id,
        user_id: userId,
        guest_name: body.guest_name,
        guest_email: body.guest_email,
        status: "confirmed",
        payment_status: "paid",
        payment_method: "free", // 100% coupon = no money charged
        coupon_code: coupon.code,
        discount_amount: coupon.discount,
        total_price: 0,
      });
      if (insErr) {
        // Roll back the spot we just claimed so we don't leak capacity.
        await admin.rpc("increment_class_spot", { _schedule_id: schedule.id });
        throw insErr;
      }

      // Record coupon usage (best effort, atomic).
      if (coupon.couponId) {
        try {
          await admin.rpc("increment_coupon_usage", { _coupon_id: coupon.couponId });
        } catch (e) {
          console.error("[create-class-booking] coupon usage update failed", (e as Error)?.message);
        }
      }

      // Confirmation email (fire-and-forget; function is idempotent).
      try {
        await admin.functions.invoke("send-booking-notification", { body: { classBookingId: bookingId } });
      } catch (e) {
        console.error("[create-class-booking] notification invoke failed", e);
      }

      return json({ ok: true, bookingId, needsPayment: false, amount: 0 });
    }

    // ============ CASE B: total > 0 -> pending_payment + BAC link ============
    // Prefer the class's OWN CompraClick link; fall back to the Drop-in offering.
    let bacLink: string | null = (cls.payment_link || "").trim() || null;
    if (!bacLink) {
      const { data: dropIn, error: linkErr } = await admin
        .from("offerings")
        .select("payment_link")
        .eq("type", "drop_in")
        .eq("status", "active")
        .not("payment_link", "is", null)
        .order("sort_order")
        .limit(1)
        .maybeSingle();
      if (linkErr) throw linkErr;
      bacLink = dropIn?.payment_link || null;
    }
    if (!bacLink) return json({ ok: false, reason: "no_payment_link" }, 503);

    const { error: insErr } = await admin.from("class_bookings").insert({
      id: bookingId,
      schedule_id: schedule.id,
      user_id: userId,
      guest_name: body.guest_name,
      guest_email: body.guest_email,
      status: "pending_payment",
      payment_status: "pending",
      payment_method: "card",
      coupon_code: coupon.code,
      discount_amount: coupon.discount,
      total_price: totalPrice,
    });
    if (insErr) throw insErr;

    return json({ ok: true, bookingId, needsPayment: true, bacLink, amount: totalPrice });
  } catch (err) {
    const code = (err as any)?.code;
    console.error("[create-class-booking] failed", {
      message: (err as Error).message,
      code,
    });
    if (code === "INVALID_COUPON") {
      return json({ ok: false, reason: "invalid_coupon", message: (err as Error).message }, 400);
    }
    return json({ ok: false, reason: "create_failed", message: (err as Error).message }, 500);
  }
});
