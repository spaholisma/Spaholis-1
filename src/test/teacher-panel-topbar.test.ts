import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The Teacher Panel is her workspace: no site navbar, a way back to the
// website at the top left, and her account (My Account, Sign Out) at the right.
const read = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8");

describe("Teacher Panel top bar", () => {
  const panel = read("src/pages/TeacherPanel.tsx");

  it("has no site navbar", () => {
    expect(panel).not.toMatch(/<Navbar\b/);
    expect(panel).not.toMatch(/from "@\/components\/Navbar"/);
  });

  it("shows the way home and her account on every screen of the panel", () => {
    expect(panel).toMatch(/<BackToSiteButton \/>/);
    expect(panel).toMatch(/<ProfileMenu myAccountLabel="My Account" signOutLabel="Sign Out" \/>/);
    expect(panel.match(/<PanelTopBar\b/g)?.length).toBe(3); // loading, not a teacher, the panel
  });

  it("the button goes to the Holis home page", () => {
    const btn = read("src/components/teacher/BackToSiteButton.tsx");
    expect(btn).toMatch(/to="\/"/);
    expect(btn).toMatch(/Back to Holis/);
  });
});
