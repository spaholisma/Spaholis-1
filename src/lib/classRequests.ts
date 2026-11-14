import { supabase } from "@/integrations/supabase/client";

/**
 * Special events "on request": events Holis offers without a date on the
 * schedule yet (e.g. Wellness Sunday). They still show on the Classes page,
 * with a Request button that opens the request form; the team then arranges
 * the date with the guest.
 *
 * Which events are on request is kept in site_content ("class_requests" →
 * { ids: [...] }), next to the other website settings, so no new column is
 * needed. Set in Admin → Classes → Edit Event → Special event options.
 */
export const CLASS_REQUESTS_KEY = "class_requests";

export async function fetchRequestClassIds(): Promise<string[]> {
  const { data } = await supabase
    .from("site_content")
    .select("content")
    .eq("section_key", CLASS_REQUESTS_KEY)
    .maybeSingle();
  const ids = (data?.content as any)?.ids;
  return Array.isArray(ids) ? ids.filter((x: unknown): x is string => typeof x === "string") : [];
}

/** Turns "on request" on or off for one event. Returns an error message, if any. */
export async function setClassOnRequest(classId: string, on: boolean): Promise<string | null> {
  const ids = await fetchRequestClassIds();
  const has = ids.includes(classId);
  if (has === on) return null;
  const next = on ? [...ids, classId] : ids.filter((id) => id !== classId);
  const { error } = await supabase
    .from("site_content")
    .upsert(
      { section_key: CLASS_REQUESTS_KEY, content: { ids: next } as any, updated_at: new Date().toISOString() },
      { onConflict: "section_key" },
    );
  return error ? error.message : null;
}

/** The request form, with the event named (Holis gets it by email). */
export const classRequestHref = (title: string) =>
  `/book?service=consultation&topic=${encodeURIComponent(`Special Event: ${title}`)}`;
