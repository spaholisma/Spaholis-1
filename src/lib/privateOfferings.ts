import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PrivateClassOption, PrivateKind } from "@/lib/privateClassRequest";

// A teacher's private classes and her own prices (table teacher_private_offerings,
// edited in her Teacher Panel). The website reads them through
// public_private_offerings(); the price of a request is worked out again on the
// server by private_offering_price(), which this mirrors.

export interface PrivateOffering {
  id: string;
  teacher_id: string;
  teacher_name: string;
  teacher_photo: string | null;
  class_id: string | null;
  title: string;
  description: string | null;
  duration_minutes: number | null;
  price_one: number | null;
  price_two: number | null;
  price_group: number | null;
  price_extra: number | null;
}

const num = (v: unknown): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/** Her price for a kind and a number of people — null when she does not offer it. */
export function offeringPrice(o: Pick<PrivateOffering, "price_one" | "price_two" | "price_group" | "price_extra">, kind: PrivateKind, people: number): number | null {
  if (kind === "oneOnOne") return num(o.price_one);
  if (kind === "couples") return num(o.price_two);
  const group = num(o.price_group);
  if (group == null || people < 1) return null;
  if (people <= 4) return group;
  const extra = num(o.price_extra);
  return extra == null ? null : group + (people - 4) * extra;
}

/** The kinds she offers, in the order the website lists them. */
export function kindsOffered(o: PrivateOffering): PrivateKind[] {
  return (["oneOnOne", "couples", "group"] as const).filter((k) => offeringPrice(o, k, k === "group" ? 4 : 1) != null);
}

/** The largest group she takes: four when she set no price for extra people. */
export const maxGroup = (o: PrivateOffering) => (num(o.price_extra) == null ? 4 : 20);

/** Her lowest price, for a "from $X". */
export function fromPrice(o: PrivateOffering): number | null {
  const list = [num(o.price_one), num(o.price_two), num(o.price_group)].filter((n): n is number => n != null);
  return list.length ? Math.min(...list) : null;
}

export const sameName = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? "").trim().replace(/\s+/g, " ").toLowerCase() === (b ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/** Every teacher's active private classes. */
export function usePrivateOfferings() {
  return useQuery({
    queryKey: ["public-private-offerings"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("public_private_offerings");
      if (error) throw error;
      return ((data ?? []) as PrivateOffering[]).map((o) => ({
        ...o,
        price_one: num(o.price_one), price_two: num(o.price_two),
        price_group: num(o.price_group), price_extra: num(o.price_extra),
      }));
    },
    staleTime: 60_000,
  });
}

/** One teacher's, with the one for this class first when there is one. */
export function offeringsOf(all: PrivateOffering[], teacherName: string, classId?: string | null): PrivateOffering[] {
  const mine = all.filter((o) => sameName(o.teacher_name, teacherName));
  if (!classId) return mine;
  return [...mine.filter((o) => o.class_id === classId), ...mine.filter((o) => o.class_id !== classId)];
}

/**
 * One line of the request form's list: a teacher's own private class at her
 * price — or, while she has not listed hers yet, one of her classes from the
 * schedule, with the price to be confirmed by her.
 */
export interface PrivateChoice {
  key: string;
  title: string;
  classId: string | null;
  teacherName: string | null;
  teacherPhoto: string | null;
  /** Her private class with her prices; null when she has not listed hers yet. */
  offering: PrivateOffering | null;
}

export function buildPrivateChoices(
  offerings: PrivateOffering[],
  scheduleOptions: PrivateClassOption[],
  kind: PrivateKind,
  people: number,
): PrivateChoice[] {
  const priced: PrivateChoice[] = offerings
    .filter((o) => offeringPrice(o, kind, people) != null)
    .map((o) => ({
      key: `o:${o.id}`, title: o.title, classId: o.class_id,
      teacherName: o.teacher_name, teacherPhoto: o.teacher_photo, offering: o,
    }));
  // A teacher who has listed her private classes is offered only through them.
  const listed = new Set(offerings.map((o) => o.teacher_name.trim().replace(/\s+/g, " ").toLowerCase()));
  const fallback: PrivateChoice[] = scheduleOptions
    .filter((s) => !s.teacherName || !listed.has(s.teacherName.trim().replace(/\s+/g, " ").toLowerCase()))
    .map((s) => ({
      key: `c:${s.key}`, title: s.classTitle, classId: s.classId,
      teacherName: s.teacherName, teacherPhoto: s.teacherPhoto, offering: null,
    }));
  return [...priced, ...fallback].sort(
    (a, b) => a.title.localeCompare(b.title) || (a.teacherName ?? "~").localeCompare(b.teacherName ?? "~"),
  );
}

/** The choice a link asked for: her private class, else her class on the schedule. */
export function findChoice(
  choices: PrivateChoice[],
  pre: { offeringId?: string | null; classId?: string | null; teacherName?: string | null },
): PrivateChoice | null {
  if (pre.offeringId) return choices.find((c) => c.offering?.id === pre.offeringId) ?? null;
  if (!pre.classId || !pre.teacherName) return null;
  const mine = choices.filter((c) => c.classId === pre.classId && sameName(c.teacherName, pre.teacherName));
  return mine.find((c) => c.offering) ?? mine[0] ?? null;
}
