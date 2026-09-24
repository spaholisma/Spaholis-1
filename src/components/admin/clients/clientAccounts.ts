import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction, extractInvokeErrorMessage } from "@/lib/invokeEdgeFunction";

// What the Admin can do to a client from Admin → Clients. The website login
// (create, suspend, delete, sign-in email) is handled by the `admin-clients`
// function; the details on their memberships and bookings by the database.
// Nobody on the team ever sets or sees a client's password: a new account gets
// an email with a link to choose their own.

export type ClientDetails = { name: string; email: string; phone: string };

async function adminClients<T = any>(body: Record<string, unknown>): Promise<T> {
  const res = await invokeEdgeFunction<T>("admin-clients", { body });
  if (!res.ok) throw new Error(extractInvokeErrorMessage(res, "Could not complete that"));
  return res.data as T;
}

async function rpc<T = any>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn as any, args as any);
  if (error) throw new Error(error.message);
  return data as T;
}

/**
 * Correct a client's name, email and phone everywhere they appear. Returns the
 * key they are found under now (it follows the email, so it can change).
 */
export async function saveClientDetails(
  clientKey: string,
  userId: string | null,
  d: ClientDetails,
): Promise<string> {
  // The login first: if the new email already belongs to someone else, stop
  // before anything else has changed.
  if (userId) {
    await adminClients({ action: "update", user_id: userId, full_name: d.name, email: d.email, phone: d.phone });
  }
  const out = await rpc<{ client_key: string }>("admin_update_client_contact", {
    _key: clientKey, _name: d.name, _email: d.email, _phone: d.phone, _user_id: userId,
  });
  return out?.client_key ?? clientKey;
}

/**
 * Give a client a website account. When they are already a client (`clientKey`),
 * everything they have — memberships, passes, classes, treatments — moves into it.
 */
export async function createClientAccount(
  d: ClientDetails,
  opts: { sendEmail: boolean; clientKey?: string | null },
): Promise<{ userId: string; clientKey: string; emailed: boolean }> {
  const created = await adminClients<{ user_id: string; emailed: boolean }>({
    action: "create", full_name: d.name, email: d.email, phone: d.phone, send_email: opts.sendEmail,
  });
  let key = d.email.trim().toLowerCase();
  if (opts.clientKey) {
    // Their past visits may have been filed under a phone or a name: put the
    // email on them, then hand them to the new account.
    key = await saveClientDetails(opts.clientKey, null, d).catch(() => key);
    await rpc("admin_link_records_to_account", { _user_id: created.user_id, _email: d.email }).catch(() => null);
  }
  return { userId: created.user_id, clientKey: key, emailed: !!created.emailed };
}

export const suspendAccount = (userId: string) => adminClients({ action: "suspend", user_id: userId });
export const unsuspendAccount = (userId: string) => adminClients({ action: "unsuspend", user_id: userId });

/** Remove the login. Their memberships, classes and treatments stay under their name. */
export const deleteAccount = (userId: string) => adminClients({ action: "delete", user_id: userId });
