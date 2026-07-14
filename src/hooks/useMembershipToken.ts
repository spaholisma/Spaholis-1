import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const KEY = "holis:membership_token";

/** The membership link token persisted for this browser session, if any. */
export function getStoredMembershipToken(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export type TokenOffering = {
  id: string;
  offering_id: string;
  name_snapshot: string;
  type: string;
  is_unlimited: boolean;
  credits_remaining: number | null;
  expires_at: string | null;
  status: string;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  /** true when the membership is active, unexpired and has credits (or unlimited). */
  valid: boolean;
};

/**
 * Reads the membership link token from `?m=<token>` and persists it to
 * sessionStorage so it survives navigation from /classes to /class-booking.
 * Returns the current token (URL takes precedence, else the stored one).
 */
export function useMembershipToken(): string | null {
  const [params] = useSearchParams();
  const urlToken = params.get("m");
  useEffect(() => {
    if (urlToken) {
      try {
        sessionStorage.setItem(KEY, urlToken);
      } catch {
        /* sessionStorage unavailable — fall back to URL param only */
      }
    }
  }, [urlToken]);
  return urlToken || getStoredMembershipToken();
}

/**
 * Loads the membership behind the current link token (no login required).
 * Returns null when there is no token or it doesn't resolve.
 */
export function useTokenOffering() {
  const token = useMembershipToken();
  return useQuery({
    queryKey: ["membership-token-offering", token],
    queryFn: async (): Promise<TokenOffering | null> => {
      if (!token) return null;
      const { data, error } = await supabase.rpc(
        "get_user_offering_by_token" as any,
        { _token: token },
      );
      if (error) throw error;
      return (data as unknown as TokenOffering) ?? null;
    },
    enabled: !!token,
    staleTime: 30_000,
  });
}
