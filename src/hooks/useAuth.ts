import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, fullName: string) => {
    return supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
  };

  const signIn = async (email: string, password: string) => {
    return supabase.auth.signInWithPassword({ email, password });
  };

  // Signs out THIS device only. supabase-js defaults to scope "global", which
  // revokes every session of the account — so pressing Sign Out on a phone
  // kicked the same account off every laptop still using it (seen on 11
  // September: a logout on an iPhone, then "Refresh Token Not Found" on a
  // laptop an hour later).
  const signOut = async () => {
    return supabase.auth.signOut({ scope: "local" });
  };

  return { user, session, loading, signUp, signIn, signOut };
}
