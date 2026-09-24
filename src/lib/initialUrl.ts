// The address this visit arrived with, copied before anything else runs.
//
// A password link lands on /reset-password carrying the new session or an
// error in the address, and the Supabase client may tidy it away as it starts
// up. main.tsx imports this file first — it imports nothing itself, so it
// always runs before the client does.
export const initialUrl =
  typeof window !== "undefined"
    ? { path: window.location.pathname, hash: window.location.hash, search: window.location.search }
    : { path: "", hash: "", search: "" };
