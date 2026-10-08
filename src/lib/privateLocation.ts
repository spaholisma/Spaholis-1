import { isGyrotonic, sameName } from "@/lib/privateOfferings";

// Where a private class happens. The guest chooses on the request form:
//  - the Holis Wellness studio;
//  - their own place (home, hotel, villa) — then the address is required;
//  - the beach, only with the teachers listed below.

export const PRIVATE_LOCATIONS = ["studio", "client", "beach"] as const;
export type PrivateLocation = (typeof PRIVATE_LOCATIONS)[number];

/** Teachers who give private classes on the beach. */
export const BEACH_TEACHERS = ["Evelina"];

export const beachAllowed = (teacherName: string | null | undefined) =>
  !!teacherName && BEACH_TEACHERS.some((n) => sameName(n, teacherName));

/**
 * The places this class can be chosen at, in the order the form lists them.
 * GYROTONIC® needs the studio's tower, so it is only at the studio.
 */
export function locationsFor(teacherName: string | null | undefined, classTitle?: string | null): PrivateLocation[] {
  if (isGyrotonic(classTitle)) return ["studio"];
  return beachAllowed(teacherName) ? ["studio", "client", "beach"] : ["studio", "client"];
}

/** English names, as the team and the teacher read them in emails and notes. */
export const LOCATION_LABEL: Record<PrivateLocation, string> = {
  studio: "Holis Wellness Studio",
  client: "Client's location",
  beach: "Beach",
};

export const parseLocation = (v: unknown): PrivateLocation | null =>
  (PRIVATE_LOCATIONS as readonly string[]).includes(String(v)) ? (v as PrivateLocation) : null;

/** One line for notes and emails: "Client's location: Villa Sol, Manuel Antonio". */
export function locationLine(location: PrivateLocation, address?: string | null): string {
  const a = (address ?? "").trim();
  return location === "client" && a ? `${LOCATION_LABEL.client}: ${a}` : LOCATION_LABEL[location];
}
