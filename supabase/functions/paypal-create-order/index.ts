// deno-lint-ignore-file no-explicit-any
// Edge function: paypal-create-order
//
// Creates a PayPal order for a yoga CLASS booking or an OFFERING purchase
// (membership / pass / drop-in). The amount is computed HERE from the database,
// never taken from the browser, and stored in paypal_orders so capture can
// re-verify it. Returns the PayPal order id for the JS SDK to approve.
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
  kind: z.enum(["class", "offering"]),
  schedule_id: z.string().uuid().optional(),
  offering_id: z.string().uuid().optional(),
  coupon_code: z.string().trim().max(64).optional().nullable(),
  guest_name: z.string().trim().max(120).optional().nullable(),
  guest_email: z.string().trim().email().max(255).optional().nullable(),
  guest_phone: z.string().trim().max(40).optional().nullable(),
  user_id: z.string().uuid().optional().nullable(),
  // Number of class spots to book in one payment (default 1).
  quantity: z.number().int().min(1).max(10).optional(),
});

async function couponDiscount(admin: any, code: string | null | undefined, base: number, classId?: string) {
  const c = (code || "").trim().toUpperCase();
  if (!c) return 0;
  const { data: coupon } = await admin.from("coupons").select("*").eq("code", c).maybeSingle();
  if (!coupon || !coupon.is_active) throw Object.assign(new Error("Coupon not valid"), { code: "COUPON" });
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) throw Object.assign(new Error("Coupon expired"), { code: "COUPON" });
  if (coupon.max_uses != null && coupon.current_uses >= coupon.max_uses) throw Object.assign(new Error("Coupon used up"), { code: "COUPON" });
  if (classId && Array.isArray(coupon.restricted_class_ids) && coupon.restricted_class_ids.length > 0 && !coupon.restricted_class_ids.includes(classId)) {
    throw Object.assign(new Error("Coupon not for this class"), { code: "COUPON" });
  }
  const d = coupon.discount_type === "percentage"
    ? Math.round(base * (Number(coupon.discount_value) / 100) * 100) / 100
    : Math.min(base, Number(coupon.discount_value));
  return Number.isFinite(d) ? d : 0;
}

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

    if (body.kind === "class") {
      if (!body.schedule_id) return json({ ok: false, reason: "missing_schedule" }, 400);
      const { data: sched } = await admin
        .from("class_schedule")
        .select("id, spots_remaining, class_id, classes(id, title, price, requires_payment, is_active)")
        .eq("id", body.schedule_id).maybeSingle();
      const cls: any = (sched as any)?.classes;
      if (!sched || !cls || cls.is_active === false) return json({ ok: false, reason: "class_unavailable" }, 404);
      const qty = Math.max(1, Math.min(Number(body.quantity ?? 1), 10));
      if (Number(sched.spots_remaining) < qty) return json({ ok: false, reason: "class_full" }, 409);
      const base = Number(cls.price ?? 0);
      // Coupon applies once to the whole order (not per spot).
      const discount = await couponDiscount(admin, body.coupon_code, base, String(cls.id));
      amount = Math.max(0, Math.round((base * qty - discount) * 100) / 100);
      if (amount <= 0) return json({ ok: false, reason: "class_is_free" }, 400);
      description = qty > 1 ? `Class: ${cls.title} (${qty} spots)` : `Class: ${cls.title}`;
      target = { schedule_id: body.schedule_id, guest_name: body.guest_name, guest_email: body.guest_email, guest_phone: body.guest_phone, coupon_code: (body.coupon_code || "").trim().toUpperCase() || null, quantity: qty };
    } else {
      if (!body.offering_id) return json({ ok: false, reason: "missing_offering" }, 400);
      const { data: off } = await admin.from("offerings").select("id, name, price, status").eq("id", body.offering_id).maybeSingle();
      if (!off || (off as any).status !== "active") return json({ ok: false, reason: "offering_unavailable" }, 404);
      amount = Math.round(Number((off as any).price ?? 0) * 100) / 100;
      if (amount <= 0) return json({ ok: false, reason: "invalid_amount" }, 400);
      description = `${(off as any).name}`;
      target = { offering_id: body.offering_id, user_id: body.user_id ?? null, guest_email: body.guest_email ?? null };
    }

    const token = await ppToken();
    const orderRes = await fetch(`${PP_BASE}/v2/checkout/orders`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{ amount: { currency_code: "USD", value: amount.toFixed(2) }, description: description.slice(0, 127) }],
      }),
    });
    const order = await orderRes.json();
    if (!orderRes.ok || !order.id) {
      console.error("[paypal-create-order] paypal error", order);
      return json({ ok: false, reason: "paypal_error" }, 502);
    }

    await admin.from("paypal_orders").insert({
      order_id: order.id, kind: body.kind, amount, currency: "USD", target, status: "created",
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
