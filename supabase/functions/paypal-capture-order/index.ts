// deno-lint-ignore-file no-explicit-any
// Edge function: paypal-capture-order
//
// Captures an approved PayPal order, verifies with PayPal that it COMPLETED for
// the exact amount we stored, then fulfils: confirms the class booking (with a
// spot decrement + email) or grants the offering (membership / pass / drop-in).
// Idempotent — a replayed capture returns the already-fulfilled result.
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

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
  if (!id || !secret) throw new Error("paypal_not_configured");
  const res = await fetch(`${PP_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(`${id}:${secret}`), "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error("paypal_auth_failed");
  return (await res.json()).access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, reason: "method_not_allowed" }, 405);

  let orderId: string | undefined;
  try { orderId = (await req.json())?.orderId; } catch { return json({ ok: false, reason: "invalid_json" }, 400); }
  if (!orderId) return json({ ok: false, reason: "missing_order" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: rec } = await admin.from("paypal_orders").select("*").eq("order_id", orderId).maybeSingle();
  if (!rec) return json({ ok: false, reason: "order_not_found" }, 404);
  if (rec.status === "captured") {
    // Idempotent replay — already fulfilled.
    return json({ ok: true, kind: rec.kind, bookingId: rec.class_booking_id, userOfferingId: rec.user_offering_id, replay: true });
  }

  try {
    const token = await ppToken();
    const capRes = await fetch(`${PP_BASE}/v2/checkout/orders/${orderId}/capture`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
    const cap = await capRes.json();
    const capture = cap?.purchase_units?.[0]?.payments?.captures?.[0];
    const capturedAmount = Number(capture?.amount?.value ?? 0);
    const capId: string | null = capture?.id ?? cap?.id ?? null;

    if (cap?.status !== "COMPLETED" || Math.abs(capturedAmount - Number(rec.amount)) > 0.01) {
      await admin.from("paypal_orders").update({ status: "failed", updated_at: new Date().toISOString() }).eq("order_id", orderId);
      console.error("[paypal-capture-order] not completed / amount mismatch", { status: cap?.status, capturedAmount, expected: rec.amount });
      return json({ ok: false, reason: "payment_not_completed" }, 402);
    }

    const t = rec.target ?? {};

    if (rec.kind === "class") {
      // One paid booking row per spot. Claim each spot atomically; if the class
      // just filled, still honour the paid booking (staff can reconcile) but note it.
      const qty = Math.max(1, Math.min(Number(t.quantity ?? 1), 10));
      const perSpot = Math.round((Number(rec.amount) / qty) * 100) / 100;
      const bookingIds: string[] = [];
      let overbooked = false;
      for (let i = 0; i < qty; i++) {
        const { data: remaining } = await admin.rpc("decrement_class_spot", { _schedule_id: t.schedule_id });
        const spotOverbooked = remaining === null || remaining === undefined;
        if (spotOverbooked) overbooked = true;

        const bookingId = crypto.randomUUID();
        const { error: insErr } = await admin.from("class_bookings").insert({
          id: bookingId, schedule_id: t.schedule_id,
          guest_name: t.guest_name, guest_email: t.guest_email, guest_phone: t.guest_phone || null,
          status: "confirmed", payment_status: "paid", payment_method: "paypal",
          coupon_code: i === 0 ? (t.coupon_code || null) : null, total_price: perSpot,
        });
        if (insErr) { if (!spotOverbooked) await admin.rpc("increment_class_spot", { _schedule_id: t.schedule_id }); throw insErr; }
        bookingIds.push(bookingId);
      }

      await admin.from("paypal_orders").update({ status: "captured", class_booking_id: bookingIds[0], updated_at: new Date().toISOString() }).eq("order_id", orderId);
      // One confirmation email to the guest (covers all their spots).
      try { await admin.functions.invoke("send-booking-notification", { body: { classBookingId: bookingIds[0] } }); } catch (e) { console.error("[paypal-capture-order] notify failed", e); }
      return json({ ok: true, kind: "class", bookingId: bookingIds[0], bookingIds, quantity: qty, overbooked });
    }

    // offering
    const { data: off } = await admin.from("offerings").select("*").eq("id", t.offering_id).maybeSingle();
    if (!off) return json({ ok: false, reason: "offering_gone" }, 404);
    // A monthly membership ends on the same day of the following month
    // (activated Jul 27 → expires Aug 27), not exactly N days later.
    let expires_at: string | null = null;
    const durDays = Number((off as any).duration_days) || 0;
    if ((off as any).type === "membership" && durDays > 0) {
      const d = new Date();
      if (durDays % 30 === 0) {
        const day = d.getDate();
        d.setMonth(d.getMonth() + durDays / 30);
        if (d.getDate() < day) d.setDate(0);
      } else {
        d.setDate(d.getDate() + durDays);
      }
      expires_at = d.toISOString();
    }
    const { data: uo, error: uoErr } = await admin.from("user_offerings").insert({
      user_id: t.user_id ?? null,
      offering_id: (off as any).id, type: (off as any).type, name_snapshot: (off as any).name,
      price_paid: (off as any).price, is_unlimited: (off as any).is_unlimited,
      credits_total: (off as any).credits, credits_remaining: (off as any).credits,
      expires_at, status: "active", source: "purchase", payment_id: capId,
    }).select("id").single();
    if (uoErr) throw uoErr;

    await admin.from("paypal_orders").update({ status: "captured", user_offering_id: uo.id, updated_at: new Date().toISOString() }).eq("order_id", orderId);
    try { await admin.functions.invoke("send-membership-order-email", { body: { userOfferingId: uo.id } }); } catch (e) { console.error("[paypal-capture-order] offering email failed", e); }
    return json({ ok: true, kind: "offering", userOfferingId: uo.id });
  } catch (err) {
    console.error("[paypal-capture-order] failed", { message: (err as Error).message });
    return json({ ok: false, reason: "capture_failed", message: (err as Error).message }, 500);
  }
});
