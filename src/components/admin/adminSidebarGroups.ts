import {
  CalendarDays, FileEdit, Heart, Settings, Tent, UserCircle, Users, type LucideIcon,
} from "lucide-react";

// The Admin Panel sidebar, in sections that open and close, instead of one long
// list of thirty-odd links. The Dashboard stays on its own at the top; every
// other link sits in one section. A link added later and not listed here lands
// in "More", so nothing can ever go missing from the sidebar.
//
// "Edit" (reorder / hide) still works: hidden links stay hidden, and the saved
// order decides the order inside each section.

export interface SidebarGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  items: string[];
}

export const SIDEBAR_GROUPS: SidebarGroup[] = [
  { id: "bookings", label: "Bookings & Calendar", icon: CalendarDays, items: ["calendars", "appointments", "trash"] },
  { id: "treatments", label: "Treatments & Spa", icon: Heart, items: ["services", "rooms", "spa-packages", "wellness", "intake-questions"] },
  { id: "classes", label: "Classes", icon: Users, items: ["events", "weekly-schedule", "featured-event", "offerings"] },
  { id: "clients", label: "Clients & Sales", icon: UserCircle, items: ["clients", "giftcards", "coupons", "loyalty", "receipts", "client-emails"] },
  { id: "retreats", label: "Retreats & Education", icon: Tent, items: ["retreats", "custom-retreats", "experiences", "educational", "course-reviews", "practitioners"] },
  { id: "website", label: "Website", icon: FileEdit, items: ["content", "navigation", "home-lists", "blog", "faqs", "media", "theme"] },
  { id: "studio", label: "Studio Settings", icon: Settings, items: ["business-hours", "vacation", "settings"] },
];

/** Links that are not in any section, always shown on their own at the top. */
export const TOP_LEVEL = ["overview"];

const OTHER: Omit<SidebarGroup, "items"> = { id: "other", label: "More", icon: Settings };

/** The section a link belongs to. */
export function groupIdOf(linkId: string): string | null {
  if (TOP_LEVEL.includes(linkId)) return null;
  return SIDEBAR_GROUPS.find((g) => g.items.includes(linkId))?.id ?? OTHER.id;
}

/**
 * The links (already filtered and in the saved order) arranged in sections.
 * Sections keep their own order; inside each, the links keep the order they
 * came in. Empty sections are left out.
 */
export function groupLinks<T extends { id: string }>(links: T[]): { top: T[]; groups: (SidebarGroup & { links: T[] })[] } {
  const top = links.filter((l) => TOP_LEVEL.includes(l.id));
  const groups = [...SIDEBAR_GROUPS, { ...OTHER, items: [] as string[] }]
    .map((g) => ({ ...g, links: links.filter((l) => groupIdOf(l.id) === g.id) }))
    .filter((g) => g.links.length > 0);
  return { top, groups };
}

/** Case- and accent-insensitive search over the link names. */
export function matchesLink(label: string, query: string): boolean {
  const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const q = fold(query.trim());
  return !q || fold(label).includes(q);
}
