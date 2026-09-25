import { supabase } from "@/integrations/supabase/client";
import { initialUrl as captured } from "@/lib/initialUrl";

// What the password link brought with it.
//
// A link from a "set your password" or "forgot password" email lands on
// /reset-password carrying either the new session (#access_token=…&type=recovery)
// or, when it was already used or has expired, an error
// (#error=access_denied&error_code=otp_expired&…). The address is copied in
// initialUrl.ts before the Supabase client can tidy it away.

export type AuthLink =
  | { kind: "recovery" }
  | { kind: "code"; code: string }
  | { kind: "error"; message: string }
  | { kind: "none" };

export function readAuthLink(src: { hash: string; search: string }): AuthLink {
  const hash = new URLSearchParams(src.hash.replace(/^#/, ""));
  const query = new URLSearchParams(src.search);
  const error =
    hash.get("error_description") || query.get("error_description") ||
    hash.get("error_code") || query.get("error_code") ||
    hash.get("error") || query.get("error");
  if (error) return { kind: "error", message: error.replace(/\+/g, " ") };
  const code = query.get("code");
  if (code) return { kind: "code", code };
  if (hash.get("type") === "recovery" || hash.get("access_token") || query.get("type") === "recovery") {
    return { kind: "recovery" };
  }
  return { kind: "none" };
}

/** The link this visit arrived with — only when it arrived on the password page. */
export function initialPasswordLink(): AuthLink {
  if (captured.path !== "/reset-password") return { kind: "none" };
  return readAuthLink(captured);
}

// Roles that open the Admin panel — the same list AdminDashboard lets in.
const STAFF_ROLES = new Set(["super_admin", "manager", "coordinator", "viewer"]);

/**
 * Where someone belongs once signed in: the team to the Admin panel, a teacher
 * to her Teacher Panel, everyone else to their own page. Sending every client
 * to /admin showed them "Access Denied" right after they chose a password.
 */
export async function homeFor(userId: string | null | undefined): Promise<"/admin" | "/teacher" | "/dashboard"> {
  if (!userId) return "/dashboard";
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => String(r.role));
  if (roles.some((r) => STAFF_ROLES.has(r))) return "/admin";
  return roles.includes("teacher") ? "/teacher" : "/dashboard";
}
