import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { canGoBackInSite } from "@/hooks/useLeaveFlow";
import { profileInitials } from "@/components/ProfileMenu";
import { staffRoleOf } from "@/hooks/useStaffRole";
import { groupIdOf, groupLinks, matchesLink, SIDEBAR_GROUPS } from "@/components/admin/adminSidebarGroups";

// Back buttons on every form, the profile menu in the top bar, and the Admin
// sidebar in sections.
const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8").replace(/\r\n/g, "\n");

describe("Back on the forms", () => {
  it("goes back in the site only when the visit has a page before this one", () => {
    expect(canGoBackInSite({ idx: 3 })).toBe(true);
    expect(canGoBackInSite({ idx: 0 })).toBe(false);
    expect(canGoBackInSite(null)).toBe(false);
    expect(canGoBackInSite({})).toBe(false);
  });

  it("the treatment booking: one step back; a picked treatment back to the list; out from the first step", () => {
    const page = read("src/pages/Booking.tsx");
    expect(page).toMatch(/if \(step > 1\) setStep\(step - 1\);\s+else if \(step === 1 && !arrivedWithService\) \{ setSelectedService\(""\); setStep\(0\); \}\s+else \{ leaveFlow\(\); return; \}/);
    // Back sits at the bottom only, and works on the first step too.
    expect(page).toMatch(/<Button variant="ghost" onClick=\{goBack\} disabled=\{submitting\}>/);
    expect(page).not.toMatch(/FlowBackButton/);
    // The hook comes before the page's early return.
    expect(page.indexOf("const leaveFlow = useLeaveFlow(")).toBeLessThan(page.indexOf('if (preselected === "consultation")'));
    // The bottom Back no longer disappears on the first step.
    expect(page).not.toMatch(/step > \(serviceLocked \? 1 : 0\) \?/);
  });

  it("the class booking: payment back to the details, the details back out", () => {
    const page = read("src/pages/ClassBooking.tsx");
    // Both at the bottom: the details step leaves, the payment step goes back to the details.
    expect(page).toMatch(/<Button variant="ghost" onClick=\{leaveFlow\} disabled=\{submitting\}>/);
    expect(page).toMatch(/Back to your details/);
    expect(page).not.toMatch(/FlowBackButton/);
    expect(page.indexOf("const leaveFlow = useLeaveFlow(")).toBeLessThan(page.indexOf("if (isLoading)"));
  });

  it("experiences, custom retreats and the request form can be left from their first step", () => {
    expect(read("src/pages/ExperienceBooking.tsx")).toMatch(/step === 0 \? leaveFlow\(\) : setStep/);
    const retreat = read("src/pages/CustomRetreat.tsx");
    expect(retreat).toMatch(/if \(step === 0\) \{ leaveFlow\(\); return; \}/);
    expect(retreat).not.toMatch(/disabled=\{step === 0\}/);
    const form = read("src/components/booking/ConsultationForm.tsx");
    expect(form).toMatch(/<Button type="button" variant="ghost" onClick=\{leaveFlow\} disabled=\{submitting\}>/);
    expect(form).not.toMatch(/FlowBackButton/);
  });
});

describe("the profile menu", () => {
  it("shows two initials from the name, else the email's first letter", () => {
    expect(profileInitials("Ana María Pérez", "a@b.com")).toBe("AM");
    expect(profileInitials("  ", "zoe@example.com")).toBe("Z");
    expect(profileInitials(null, null)).toBe("?");
  });

  it("offers the Admin Panel to the team only, the calendar to reception and view-only", () => {
    expect(staffRoleOf(["super_admin"])).toBe("admin");
    expect(staffRoleOf(["coordinator"])).toBe("coordinator");
    expect(staffRoleOf(["viewer"])).toBe("viewer");
    expect(staffRoleOf(["teacher"])).toBeNull();
    expect(staffRoleOf([])).toBeNull();
  });

  it("replaces My Account and the sign-out icon in the top bar", () => {
    const nav = read("src/components/Navbar.tsx");
    expect(nav).toMatch(/<ProfileMenu\s+myAccountLabel=/);
    expect(nav).not.toMatch(/aria-label=\{t\("nav\.signOut"\)\}>\s*<LogOut/);
  });
});

describe("the Admin sidebar in sections", () => {
  const ids = [...read("src/pages/AdminDashboard.tsx").matchAll(/\{ label: "[^"]+", icon: \w+, id: "([^"]+)" \}/g)].map((m) => m[1]);

  it("puts every link of the sidebar in a named section, or the Dashboard at the top", () => {
    expect(ids.length).toBeGreaterThan(30);
    for (const id of ids) expect(groupIdOf(id) === null || SIDEBAR_GROUPS.some((g) => g.id === groupIdOf(id))).toBe(true);
    // No link sits in two sections.
    const all = SIDEBAR_GROUPS.flatMap((g) => g.items);
    expect(new Set(all).size).toBe(all.length);
  });

  it("keeps the saved order inside a section, leaves out hidden links and empty sections", () => {
    const links = [{ id: "trash" }, { id: "overview" }, { id: "calendars" }, { id: "brand-new" }];
    const { top, groups } = groupLinks(links);
    expect(top.map((l) => l.id)).toEqual(["overview"]);
    expect(groups.map((g) => g.id)).toEqual(["bookings", "other"]);
    expect(groups[0].links.map((l) => l.id)).toEqual(["trash", "calendars"]);
  });

  it("finds a link by typing part of its name", () => {
    expect(matchesLink("Coupons", "coup")).toBe(true);
    expect(matchesLink("Gift Cards", "GIFT")).toBe(true);
    expect(matchesLink("Coupons", "blog")).toBe(false);
  });
});
