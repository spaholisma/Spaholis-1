// deno-lint-ignore-file no-explicit-any
// Edge function: create-booking
//
// Creates customer-facing bookings with the service role so checkout is never
// blocked by anonymous Row Level Security. The function performs the security
// checks that RLS cannot express for guest checkout: validates the service,
// verifies the selected room/slot, recalculates price/coupon values, and only
// confirms/email-notifies bookings that do not require a deposit.

import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { z } from "npm:zod@3.25.76";
import {
  checkBusinessHours,
  rowsToWeeklyHours,
  SPA_TIMEZONE,
  spaLocalParts,
  type WeeklyHours,
} from "./businessHours.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const BodySchema = z.object({
  id: z.string().uuid().optional(),
  service_id: z.string().uuid(),
  booking_date: z.string().regex(DATE_RE),
  booking_time: z.string().regex(TIME_RE),
  guest_name: z.string().trim().min(2).max(100),
  guest_email: z.string().trim().email().max(255),
  guest_phone: z.string().trim().max(30).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  coupon_code: z.string().trim().max(64).optional().nullable(),
  room_id: z.string().uuid().optional().nullable(),
  secondary_room_id: z.string().uuid().optional().nullable(),
  // In-session add-on extras (is_addon services) that extend this treatment's
  // duration and price. The server re-derives their minutes/price for security.
  addon_service_ids: z.array(z.string().uuid()).max(10).optional().nullable(),
  start_time: z.string().datetime().optional().nullable(),
  end_time: z.string().datetime().optional().nullable(),
  intake_form: z.unknown().optional().nullable(),
});

type BookingBody = z.infer<typeof BodySchema>;

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function isDepositRequired(service: { category?: string | null; type?: string | null }) {
  const category = String(service.category || "");
  const type = String(service.type || "");
  if (type === "class" || type === "private") return false;
  if (category === "Wellness Retreats") return false;
  if (type === "program" || type === "experience") return false;
  return true;
}

// NOTE: business-hours logic lives in ./businessHours.ts and is mirrored on
// the frontend at src/lib/businessHours.ts. Do NOT redefine here.

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

async function validateCoupon(admin: any, codeRaw: string | null | undefined, basePrice: number, serviceId: string) {
  const code = (codeRaw || "").trim().toUpperCase();
  if (!code) return { code: null as string | null, discount: 0 };

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
  if (Array.isArray(coupon.restricted_service_ids) && coupon.restricted_service_ids.length > 0) {
    if (!coupon.restricted_service_ids.includes(serviceId)) {
      throw Object.assign(new Error("Coupon does not apply to this service"), { code: "INVALID_COUPON" });
    }
  }

  const discount = coupon.discount_type === "percentage"
    ? Math.round(basePrice * (Number(coupon.discount_value) / 100) * 100) / 100
    : Math.min(basePrice, Number(coupon.discount_value));

  return { code: coupon.code as string, discount: Number.isFinite(discount) ? discount : 0 };
}

async function fetchWeeklyHours(admin: any): Promise<WeeklyHours | undefined> {
  try {
    const { data, error } = await admin
      .from("business_hours")
      .select("weekday, is_closed, open_time, close_time");
    if (error || !data) return undefined;
    return rowsToWeeklyHours(data);
  } catch {
    return undefined;
  }
}

async function ensureSlotAvailable(
  admin: any,
  body: BookingBody,
  service: any,
  weeklyHours: WeeklyHours | undefined,
) {
  if (!body.room_id) return;
  if (!body.start_time || !body.end_time) {
    throw Object.assign(new Error("Selected time is required"), { code: "INVALID_SLOT" });
  }

  const start = new Date(body.start_time);
  const end = new Date(body.end_time);
  const debugBase = {
    timezone: SPA_TIMEZONE,
    start_iso: body.start_time,
    end_iso: body.end_time,
    start_local: Number.isFinite(start.getTime()) ? spaLocalParts(start).hhmm : null,
    end_local: Number.isFinite(end.getTime()) ? spaLocalParts(end).hhmm : null,
    service_duration_minutes: Number(service.duration_minutes),
  };
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    throw Object.assign(new Error("Selected time is invalid"), { code: "INVALID_SLOT", debug: debugBase });
  }
  if (start < new Date(Date.now() + 15 * 60 * 1000)) {
    throw Object.assign(new Error("Selected time has already passed"), {
      code: "INVALID_SLOT",
      debug: { ...debugBase, now_iso: new Date().toISOString(), lead_minutes_required: 15 },
    });
  }
  const observedDuration = Math.round((end.getTime() - start.getTime()) / 60_000);
  if (observedDuration !== Number(service.duration_minutes)) {
    throw Object.assign(new Error("Selected time does not match service duration"), {
      code: "INVALID_SLOT",
      debug: { ...debugBase, observed_duration_minutes: observedDuration },
    });
  }
  const bh = checkBusinessHours(start, end, weeklyHours);
  if (!bh.ok) {
    throw Object.assign(
      new Error(bh.is_closed ? "Spa is closed on this day" : "Selected time is outside business hours"),
      { code: "INVALID_SLOT", debug: { ...debugBase, business_hours: bh } },
    );
  }

  const { data: room, error: roomErr } = await admin
    .from("rooms")
    .select("id, forbidden_categories, is_active")
    .eq("id", body.room_id)
    .maybeSingle();
  if (roomErr || !room || !room.is_active) {
    throw Object.assign(new Error("Selected room is not available"), { code: "INVALID_SLOT" });
  }

  const category = String(service.category || "").toLowerCase();
  const forbidden = Array.isArray(room.forbidden_categories) ? room.forbidden_categories : [];
  if (forbidden.includes(category)) {
    throw Object.assign(new Error("Selected room cannot host this service"), { code: "INVALID_SLOT" });
  }

  // Exclude cancelled AND payment_failed bookings — a failed BAC payment
  // must not permanently block the slot for future guests.
  const { data: conflicts, error: conflictErr } = await admin
    .from("bookings")
    .select("id")
    .eq("room_id", body.room_id)
    .not("status", "in", "(cancelled,payment_failed)")
    .lt("start_time", end.toISOString())
    .gt("end_time", start.toISOString())
    .limit(1);

  if (conflictErr) throw conflictErr;
  if (conflicts && conflicts.length > 0) {
    throw Object.assign(new Error("This time slot was just booked by someone else. Please pick another time."), {
      code: "SLOT_TAKEN",
    });
  }

  // Full-spa availability blocks (lunch / off-site with no coverage) make the
  // slot unbookable even if the room is free — mirrors the website's
  // get_availability_blocks check so a stale slot can't slip through.
  const { data: blocks, error: blockErr } = await admin.rpc("get_availability_blocks", {
    _from: start.toISOString(),
    _to: end.toISOString(),
  });
  if (blockErr) throw blockErr;
  if (blocks && blocks.length > 0) {
    throw Object.assign(new Error("This time is not available. Please choose another time."), {
      code: "SLOT_TAKEN",
    });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, reason: "method_not_allowed" }, 405);

  let parsed: z.SafeParseReturnType<unknown, BookingBody>;
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
    const { data: service, error: serviceErr } = await admin
      .from("services")
      .select("id, title, category, type, duration_minutes, price, is_active")
      .eq("id", body.service_id)
      .maybeSingle();

    if (serviceErr) throw serviceErr;
    if (!service || !service.is_active) return json({ ok: false, reason: "service_unavailable" }, 404);

    // In-session add-on extras: re-derive their extra minutes + price server-side
    // (never trust the client). They extend the treatment's duration and price.
    let extrasMinutes = 0;
    let extrasPrice = 0;
    if (Array.isArray(body.addon_service_ids) && body.addon_service_ids.length > 0) {
      const { data: extras, error: extrasErr } = await admin
        .from("services")
        .select("id, duration_minutes, price, is_addon, is_active")
        .in("id", body.addon_service_ids)
        .eq("is_addon", true)
        .eq("is_active", true);
      if (extrasErr) throw extrasErr;
      for (const e of (extras ?? [])) {
        extrasMinutes += Number(e.duration_minutes ?? 0);
        extrasPrice += Number(e.price ?? 0);
      }
    }
    // The slot must cover the treatment PLUS its add-ons.
    const effectiveService = { ...service, duration_minutes: Number(service.duration_minutes ?? 0) + extrasMinutes };

    const weeklyHours = await fetchWeeklyHours(admin);
    await ensureSlotAvailable(admin, body, effectiveService, weeklyHours);

    const basePrice = Number(service.price ?? 0);
    const coupon = await validateCoupon(admin, body.coupon_code, basePrice, service.id);
    const totalPrice = Math.max(0, basePrice - coupon.discount) + extrasPrice;
    const userId = await getAuthenticatedUserId(req, admin);
    const depositRequired = isDepositRequired(service);
    const status = depositRequired ? "pending_payment" : "pending";
    const bookingId = body.id && UUID_RE.test(body.id) ? body.id : crypto.randomUUID();
    // A couples treatment is detected by its title (matches the frontend's
    // src/pages/Booking.tsx isCouplesBooking check) — the couples services are
    // not tagged with capacity in the DB, so title is the reliable signal.
    const isCouples = String(service.title || "").toLowerCase().includes("couple")
      || String(body.notes || "").toLowerCase().includes("couple");

    // For couples bookings, create TWO reservations so each person can be
    // assigned a separate therapist. Both use the same intake_form (person1+person2 data).
    const commonFields = {
      service_id: service.id,
      user_id: userId,
      booking_date: body.booking_date,
      booking_time: body.booking_time.length === 5 ? `${body.booking_time}:00` : body.booking_time,
      guest_name: body.guest_name,
      guest_email: body.guest_email,
      guest_phone: body.guest_phone || null,
      notes: body.notes || null,
      total_price: totalPrice,
      coupon_code: coupon.code,
      discount_amount: coupon.discount,
      status,
      payment_id: null,
      start_time: body.start_time || null,
      end_time: body.end_time || null,
      intake_form: body.intake_form ?? null,
    };

    const bookingsToInsert = isCouples
      ? [
          // First booking: primary room (Room 2 or 3A)
          { id: bookingId, ...commonFields, room_id: body.room_id || null },
          // Second booking: secondary room (3B) or same room (Room 2)
          { id: crypto.randomUUID(), ...commonFields, room_id: body.secondary_room_id || body.room_id || null },
        ]
      : [
          { id: bookingId, ...commonFields, room_id: body.room_id || null },
        ];

    const { error: insertErr } = await admin.from("bookings").insert(bookingsToInsert);

    if (insertErr) throw insertErr;

    // Staff push notification — best effort, never blocks the checkout result.
    try {
      await admin.functions.invoke("notify-staff-push", {
        body: {
          title: "Nueva reserva",
          body: `${body.guest_name} — ${service.title} · ${body.booking_date} ${body.booking_time.slice(0, 5)}${isCouples ? " (couples ×2)" : ""}`,
          url: "/admin",
        },
      });
    } catch (e) {
      console.error("[create-booking] staff push failed", e);
    }

    if (!depositRequired) {
      try {
        await admin.functions.invoke("send-booking-notification", { body: { bookingId } });
      } catch (e) {
        console.error("[create-booking] notification invoke failed", e);
      }
    }

    return json({ ok: true, bookingId, status, depositRequired, totalPrice });
  } catch (err) {
    const debug = (err as any)?.debug ?? null;
    // Log the full error (message + stack + code + debug context) so
    // production log searches show exactly WHY a slot was rejected —
    // timezone, business-hours window, selected local wall clocks, etc.
    console.error("[create-booking] failed", {
      message: (err as Error).message,
      stack: (err as Error).stack,
      code: (err as any)?.code,
      debug,
    });
    const code = (err as any)?.code;
    if (code === "SLOT_TAKEN") return json({ ok: false, reason: "slot_taken", message: (err as Error).message }, 409);
    if (code === "INVALID_SLOT") return json({ ok: false, reason: "invalid_slot", message: (err as Error).message, debug }, 400);
    if (code === "INVALID_COUPON") return json({ ok: false, reason: "invalid_coupon", message: (err as Error).message }, 400);
    return json({ ok: false, reason: "create_failed", message: (err as Error).message }, 500);
  }
});