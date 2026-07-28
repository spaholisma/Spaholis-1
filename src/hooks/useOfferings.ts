import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/i18n/LanguageProvider";
import { localizeRows } from "@/lib/localizeRow";
import { membershipExpiryISO } from "@/lib/membership";

const OFFERING_I18N_FIELDS = ["name", "description"];

export type OfferingType = "membership" | "class_pass" | "drop_in";

export interface Offering {
  id: string;
  name: string;
  description: string | null;
  type: OfferingType;
  price: number;
  currency: string;
  credits: number | null;
  duration_days: number | null;
  is_unlimited: boolean;
  status: "active" | "inactive";
  sort_order: number;
  payment_link: string | null;
}

export interface UserOffering {
  id: string;
  user_id: string;
  offering_id: string;
  type: OfferingType;
  name_snapshot: string;
  price_paid: number;
  is_unlimited: boolean;
  credits_total: number | null;
  credits_remaining: number | null;
  starts_at: string;
  expires_at: string | null;
  status: "active" | "expired" | "depleted" | "cancelled";
  source: "purchase" | "admin_grant";
  notes: string | null;
}

export function useOfferings(opts: { includeInactive?: boolean } = {}) {
  const { language } = useLanguage();
  return useQuery({
    queryKey: ["offerings", opts.includeInactive ?? false, language],
    queryFn: async () => {
      let q = supabase.from("offerings").select("*").order("sort_order").order("created_at");
      if (!opts.includeInactive) q = q.eq("status", "active");
      const { data, error } = await q;
      if (error) throw error;
      return localizeRows(data as any[], language, OFFERING_I18N_FIELDS) as Offering[];
    },
  });
}

export function useMyOfferings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-offerings", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("user_offerings")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false });
      if (error) throw error;
      // filter out time-expired (DB updates lazily on redeem)
      const now = Date.now();
      return ((data ?? []) as UserOffering[]).filter(
        (o) => !o.expires_at || new Date(o.expires_at).getTime() > now
      );
    },
    enabled: !!user,
  });
}

export function useInvalidateOfferings() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["offerings"] });
    qc.invalidateQueries({ queryKey: ["my-offerings"] });
  };
}

export async function purchaseOffering(params: {
  userId: string;
  offering: Offering;
  paymentId?: string;
}) {
  const { offering, userId, paymentId } = params;
  const expires_at =
    offering.type === "membership" ? membershipExpiryISO(offering.duration_days) : null;
  const { data, error } = await supabase
    .from("user_offerings")
    .insert({
      user_id: userId,
      offering_id: offering.id,
      type: offering.type,
      name_snapshot: offering.name,
      price_paid: offering.price,
      is_unlimited: offering.is_unlimited,
      credits_total: offering.credits,
      credits_remaining: offering.credits,
      expires_at,
      status: "active",
      source: "purchase",
      payment_id: paymentId,
    })
    .select()
    .single();
  if (error) throw error;
  return data as UserOffering;
}

export async function redeemOffering(userOfferingId: string, classBookingId?: string) {
  const { data, error } = await supabase.rpc("redeem_offering", {
    _user_offering_id: userOfferingId,
    _class_booking_id: classBookingId ?? null,
  });
  if (error) throw error;
  return data as { success: boolean; redemption_type: "membership" | "credits" };
}
