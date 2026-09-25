import { supabase } from "@/integrations/supabase/client";

// How much of the Admin Panel a person can use. The database keeps roles
// (user_roles); the team thinks in these five levels, so the screen does too.
// admin_set_access_level() turns a level back into roles, and only an Admin
// may call it.

export type AccessLevel = "client" | "viewer" | "reception" | "treatments_admin" | "admin";

export const ACCESS_LEVELS: { id: AccessLevel; label: string; description: string }[] = [
  { id: "client", label: "Client", description: "No access to the Admin Panel." },
  { id: "viewer", label: "View only", description: "Sees the treatments calendar. Cannot change anything." },
  {
    id: "reception",
    label: "Reception",
    description: "Treatments calendar, appointments and the trash. Can reschedule and cancel.",
  },
  {
    id: "treatments_admin",
    label: "Treatments admin",
    description: "Everything Reception does, plus changing the service, room and price, seeing card details and duplicating bookings.",
  },
  {
    id: "admin",
    label: "Admin",
    description: "The whole Admin Panel — clients, finances, card details — and can change anyone's access.",
  },
];

export const accessLabel = (level: AccessLevel) =>
  ACCESS_LEVELS.find((l) => l.id === level)?.label ?? "Client";

/** The level a set of roles amounts to — the highest one wins. */
export function accessLevelOf(roles: readonly string[] | null | undefined): AccessLevel {
  const r = new Set(roles ?? []);
  if (r.has("super_admin") || r.has("manager")) return "admin";
  if (r.has("treatment_admin") && r.has("coordinator")) return "treatments_admin";
  if (r.has("coordinator")) return "reception";
  if (r.has("viewer")) return "viewer";
  return "client";
}

/** Set someone's level. Returns the roles they hold afterwards. */
export async function setAccessLevel(userId: string, level: AccessLevel): Promise<string[]> {
  const { data, error } = await supabase.rpc("admin_set_access_level" as any, { _user_id: userId, _level: level });
  if (error) throw new Error(error.message);
  return (data as string[]) ?? [];
}

/** What the confirmation says before anything changes. */
export function accessChangeWarning(name: string, level: AccessLevel): string {
  switch (level) {
    case "admin":
      return `${name} will see and change everything in the Admin Panel — every client, finances and card details — and will be able to change other people's access, including yours.`;
    case "treatments_admin":
      return `${name} will manage the treatments calendar as an Admin does, including card details. The rest of the Admin Panel stays hidden.`;
    case "reception":
      return `${name} will see the treatments calendar, appointments and the trash, and can reschedule and cancel.`;
    case "viewer":
      return `${name} will see the treatments calendar only, without changing anything.`;
    default:
      return `${name} will no longer be able to open the Admin Panel. Their website account stays as it is.`;
  }
}
