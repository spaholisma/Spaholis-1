// deno-lint-ignore-file no-explicit-any
// Edge function: admin-clients
//
// Website logins for clients, managed from Admin → Clients. Creating,
// suspending and deleting a login, or changing the email someone signs in
// with, needs the auth admin API — which only the server may hold — so the
// Admin screen asks this function to do it.
//
//   create     give a client (often a walk-in) a website account; it picks up
//              the memberships and bookings they already have, and they get an
//              email to choose their own password — nobody on the team ever
//              knows it
//   update     change the name, phone or sign-in email of an account
//   suspend    block the login without deleting anything; undone by unsuspend
//   delete     remove the login; everything they did stays in their history
//
// Staff accounts (anyone with a role, and teachers) and the caller's own
// account are never touched from here.
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { emailShell, emailButton, escapeHtml } from "../_shared/email-layout.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SITE_URL = "https://www.spaholis.com";
const FROM_ADDRESS = "Holis Wellness <info@spaholis.com>";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// "Suspended" is a ban long enough to mean "until we lift it" (100 years).
const SUSPEND_FOR = "876000h";

const clean = (s: unknown) => String(s ?? "").trim();
const cleanEmail = (s: unknown) => clean(s).toLowerCase();

async function sendWelcome(to: string, name: string, link: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return { ok: false, error: "email_config_missing" };
  const first = name.split(/\s+/)[0] || "there";
  const html = emailShell(
    "Your Holis account is ready",
    `<p style="font-size:15px;margin:0 0 14px;">Hi ${escapeHtml(first)},</p>
     <p style="font-size:14px;line-height:1.6;margin:0 0 14px;">
       We've created your account on spaholis.com. Choose a password and you're in —
       you'll see your memberships, passes and bookings, and book classes and
       treatments in a couple of taps.
     </p>
     <p style="text-align:center;margin:24px 0;">${emailButton(link, "Choose my password")}</p>
     <p class="fine" style="font-size:13px;line-height:1.6;color:#555;margin:0;">
       The link works once and expires after a while. If it has, go to
       spaholis.com, press "Sign in" and "Forgot password" with this email address.
     </p>`,
    { title: "Your Holis account is ready" },
  );
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ from: FROM_ADDRESS, to, subject: "Your Holis Wellness account is ready", html }),
  });
  return res.ok ? { ok: true } : { ok: false, error: await res.text() };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, reason: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ ok: false, reason: "unauthorized" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // The caller's own session: the database functions check it is staff.
  const asCaller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: me, error: meErr } = await admin.auth.getUser(token);
  const callerId = me?.user?.id;
  if (meErr || !callerId) return json({ ok: false, reason: "unauthorized" }, 401);
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", callerId);
  const isAdmin = (roles ?? []).some((r: any) => r.role === "super_admin" || r.role === "manager");
  if (!isAdmin) return json({ ok: false, reason: "forbidden" }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, reason: "invalid_json" }, 400); }
  const action = clean(body?.action);

  // Accounts that are not a client's to manage from here.
  const guard = async (userId: string): Promise<string | null> => {
    if (!UUID_RE.test(userId)) return "invalid_user";
    if (userId === callerId) return "That is your own account";
    const { data: r } = await admin.from("user_roles").select("user_id").eq("user_id", userId).limit(1);
    if ((r ?? []).length) return "This is a staff account — it cannot be changed from Clients";
    const { data: t } = await admin.from("teachers").select("id").eq("user_id", userId).limit(1);
    if ((t ?? []).length) return "This is a teacher's account — it cannot be changed from Clients";
    return null;
  };

  try {
    // ── create ──────────────────────────────────────────────────────────
    if (action === "create") {
      const email = cleanEmail(body.email);
      const name = clean(body.full_name);
      const phone = clean(body.phone) || null;
      if (!name) return json({ ok: false, reason: "The client's name is required" }, 400);
      if (!EMAIL_RE.test(email)) return json({ ok: false, reason: "That email address does not look right" }, 400);

      const { data: existing } = await admin.from("profiles").select("user_id").ilike("email", email).limit(1);
      if ((existing ?? []).length) {
        return json({ ok: false, reason: "This email already has a website account" }, 409);
      }

      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name: name },
      });
      if (cErr || !created?.user) {
        const msg = /already|registered|exists/i.test(cErr?.message ?? "")
          ? "This email already has a website account"
          : (cErr?.message ?? "Could not create the account");
        return json({ ok: false, reason: msg }, 400);
      }
      const userId = created.user.id;

      // The profile row is made by the signup trigger; add what it does not set.
      await admin.from("profiles").update({ full_name: name, phone }).eq("user_id", userId);

      const { data: linked } = await asCaller.rpc("admin_link_records_to_account", { _user_id: userId, _email: email });

      let emailed = false;
      if (body.send_email !== false) {
        const { data: link, error: lErr } = await admin.auth.admin.generateLink({
          type: "recovery",
          email,
          options: { redirectTo: `${SITE_URL}/reset-password` },
        });
        const actionLink = (link as any)?.properties?.action_link;
        if (!lErr && actionLink) {
          const sent = await sendWelcome(email, name, actionLink);
          emailed = sent.ok;
          if (!sent.ok) console.error("[admin-clients] welcome email failed", sent.error);
        } else {
          console.error("[admin-clients] could not make the password link", lErr?.message);
        }
      }

      return json({ ok: true, user_id: userId, linked, emailed });
    }

    // ── the rest act on an existing account ─────────────────────────────
    const userId = clean(body.user_id);
    const blocked = await guard(userId);
    if (blocked) return json({ ok: false, reason: blocked }, 400);

    if (action === "update") {
      const email = cleanEmail(body.email);
      const name = clean(body.full_name);
      const phone = clean(body.phone) || null;
      if (!name) return json({ ok: false, reason: "The client's name is required" }, 400);
      if (email && !EMAIL_RE.test(email)) return json({ ok: false, reason: "That email address does not look right" }, 400);

      const { data: current } = await admin.auth.admin.getUserById(userId);
      if (!current?.user) return json({ ok: false, reason: "Account not found" }, 404);

      if (email && email !== (current.user.email ?? "").toLowerCase()) {
        const { error: eErr } = await admin.auth.admin.updateUserById(userId, { email, email_confirm: true });
        if (eErr) {
          const msg = /already|registered|exists/i.test(eErr.message)
            ? "Another account already uses that email"
            : eErr.message;
          return json({ ok: false, reason: msg }, 400);
        }
      }
      await admin.from("profiles")
        .update({ full_name: name, phone, ...(email ? { email } : {}) })
        .eq("user_id", userId);
      return json({ ok: true });
    }

    if (action === "suspend" || action === "unsuspend") {
      const { error } = await admin.auth.admin.updateUserById(userId, {
        ban_duration: action === "suspend" ? SUSPEND_FOR : "none",
      } as any);
      if (error) return json({ ok: false, reason: error.message }, 400);
      return json({ ok: true, suspended: action === "suspend" });
    }

    if (action === "delete") {
      // Keep who they were on everything they did, then remove the login.
      const { error: dErr } = await asCaller.rpc("admin_detach_client_account", { _user_id: userId });
      if (dErr) return json({ ok: false, reason: dErr.message }, 400);
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) return json({ ok: false, reason: error.message }, 400);
      return json({ ok: true, deleted: true });
    }

    return json({ ok: false, reason: "unknown_action" }, 400);
  } catch (err) {
    console.error("[admin-clients] failed", { action, message: (err as Error).message });
    return json({ ok: false, reason: (err as Error).message }, 500);
  }
});
