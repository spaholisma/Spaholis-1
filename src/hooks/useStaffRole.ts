import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { isAdminEmail } from "@/lib/adminEmails";

export type StaffRole = "admin" | "coordinator" | "viewer" | null;

/**
 * The signed-in person's place on the team, for the shortcuts into the Admin
 * Panel (My Account, the profile menu). Same reading as the dashboard: full
 * admins get the whole panel, reception and view-only land on the treatments
 * calendar. The Admin Panel still checks the real roles itself.
 */
export function staffRoleOf(roles: string[], email?: string | null): StaffRole {
  if (roles.includes("super_admin") || roles.includes("manager") || isAdminEmail(email)) return "admin";
  if (roles.includes("coordinator")) return "coordinator";
  if (roles.includes("viewer")) return "viewer";
  return null;
}

export function useStaffRole(): StaffRole {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["my-staff-role", user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user!.id);
      return staffRoleOf((data ?? []).map((r: any) => String(r.role)), user?.email);
    },
  });
  return user ? data ?? null : null;
}
