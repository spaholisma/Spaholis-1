// The client directory, without the screen: what a row is, and how the list
// is searched, filtered and ordered. Kept apart so it can be tested.

/** One person, as admin_client_directory() returns them. */
export type ClientRow = {
  client_key: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  has_account: boolean;
  first_seen: string | null;
  last_activity: string | null;
  classes: number;
  treatments: number;
  memberships: number;
  memberships_active: number;
  total_value: number | string | null;
  /** Their website login, when they have one. */
  user_id?: string | null;
  /** The login is blocked from signing in. */
  suspended?: boolean;
};

export type ClientFilter = "all" | "account" | "staff" | "active";

export const FILTER_LABELS: Record<ClientFilter, string> = {
  all: "Everyone",
  account: "Website account",
  staff: "Registered by staff",
  active: "Active membership",
};

/** Lower-case, accents off — so "Briceño" is found by typing "briceno". */
export function fold(s: string | null | undefined): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

export function matchesSearch(row: ClientRow, query: string): boolean {
  const q = fold(query);
  if (!q) return true;
  const digits = q.replace(/\D/g, "");
  if (fold(row.name).includes(q) || fold(row.email).includes(q)) return true;
  // A phone is typed every which way: compare the digits only.
  if (digits.length >= 3 && String(row.phone ?? "").replace(/\D/g, "").includes(digits)) return true;
  return false;
}

export function matchesFilter(row: ClientRow, filter: ClientFilter): boolean {
  switch (filter) {
    case "account": return row.has_account;
    case "staff": return !row.has_account;
    case "active": return row.memberships_active > 0;
    default: return true;
  }
}

/** Most recent first; people never seen at all go last. */
export function byLastActivity(a: ClientRow, b: ClientRow): number {
  const ta = a.last_activity ? new Date(a.last_activity).getTime() : -Infinity;
  const tb = b.last_activity ? new Date(b.last_activity).getTime() : -Infinity;
  if (tb !== ta) return tb - ta;
  return fold(a.name).localeCompare(fold(b.name));
}

export function visibleClients(rows: ClientRow[], query: string, filter: ClientFilter): ClientRow[] {
  return rows
    .filter((r) => matchesFilter(r, filter) && matchesSearch(r, query))
    .sort(byLastActivity);
}

export function countBy(rows: ClientRow[]): Record<ClientFilter, number> {
  return {
    all: rows.length,
    account: rows.filter((r) => r.has_account).length,
    staff: rows.filter((r) => !r.has_account).length,
    active: rows.filter((r) => r.memberships_active > 0).length,
  };
}

/** A name to show even when only a phone or an email is known. */
export function displayName(row: Pick<ClientRow, "name" | "email" | "phone">): string {
  return (row.name && row.name.trim()) || row.email || row.phone || "Unnamed client";
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}
