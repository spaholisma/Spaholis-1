import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  looksLikeEmail, nameOnSession, namesOnSchedule, scheduleMatch, similarNames, type ScheduleSession,
} from "@/lib/teacherNames";

// Admin → Teachers: adding a teacher so it works the first time — her name as
// the schedule spells it, her login made by invitation, linked by the database,
// and a welcome that tells her how to open her panel.
const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8").replace(/\r\n/g, "\n");

const now = new Date("2026-09-25T12:00:00Z");
const session = (instructor: string | null, start: string, classInstructor: string | null = null, cancelled = false): ScheduleSession => ({
  instructor, start_time: start, is_cancelled: cancelled, classes: { instructor: classInstructor },
});

describe("the names on the class schedule", () => {
  const sessions = [
    session("Evelina", "2026-09-26T14:00:00Z"),
    session("evelina", "2026-09-27T14:00:00Z"),
    session("Evelina", "2026-09-20T14:00:00Z"),
    session(null, "2026-09-28T14:00:00Z", "Kataleia Dragonfly"),
    session("Melanie", "2026-09-29T14:00:00Z"),
    session("Melanie Moss", "2026-09-30T14:00:00Z"),
    session("Zhijian Chen", "2026-09-30T16:00:00Z"),
    session("Petra", "2026-10-01T14:00:00Z", null, true),
  ];

  it("reads the session's own name, else its class's", () => {
    expect(nameOnSession(session("  Ana ", "x", "Bea"))).toBe("Ana");
    expect(nameOnSession(session("", "x", "Bea"))).toBe("Bea");
  });

  it("lists who is not a teacher yet, busiest first, counting upcoming and past apart", () => {
    const list = namesOnSchedule(sessions, now, ["Zhijian Chen"]);
    expect(list[0]).toEqual({ name: "Evelina", upcoming: 2, recent: 1 });
    expect(list.map((n) => n.name)).toContain("Kataleia Dragonfly");
    expect(list.map((n) => n.name)).not.toContain("Zhijian Chen");
    // A cancelled class is nobody's.
    expect(list.map((n) => n.name)).not.toContain("Petra");
  });

  it("finds her exact name, capitals aside, and warns of another spelling", () => {
    const list = namesOnSchedule(sessions, now, []);
    expect(scheduleMatch("evelina ", list)?.upcoming).toBe(2);
    expect(scheduleMatch("Eve", list)).toBeUndefined();
    expect(similarNames("Melanie Moss", list).map((n) => n.name)).toEqual(["Melanie"]);
    expect(similarNames("Evelina", list)).toEqual([]);
  });

  it("checks the email before anything is saved", () => {
    expect(looksLikeEmail("her@email.com")).toBe(true);
    expect(looksLikeEmail("her@email")).toBe(false);
  });
});

describe("the database", () => {
  const sql = read("supabase/migrations/20260930140000_teacher_onboarding.sql");

  it("adds a teacher only for an Admin, with a checked name and email", () => {
    expect(sql).toMatch(/if not \(has_role\(auth\.uid\(\), 'super_admin'\) or has_role\(auth\.uid\(\), 'manager'\)\) then\s+raise exception 'Not authorized'/);
    expect(sql).toMatch(/raise exception 'There is already a teacher called %'/);
    expect(sql).toMatch(/raise exception 'Another teacher already uses %'/);
    expect(sql).toMatch(/revoke all on function public\.admin_add_teacher\(text, text, numeric\) from public, anon;/);
  });

  it("links her account the moment it exists — added by the Admin or signing up herself", () => {
    expect(sql).toMatch(/insert into public\.teachers \(display_name, email, studio_rate, user_id\)\s+values \(v_name, v_email, v_rate, v_user\)/);
    expect(sql).toMatch(/create trigger trg_link_teacher_on_signup\s+after insert on public\.profiles/);
    expect(sql).toMatch(/where t\.user_id is null and lower\(btrim\(t\.email\)\) = lower\(btrim\(new\.email\)\)/);
  });

  it("lets only its own triggers past the guard — a teacher still cannot give herself access", () => {
    expect(sql).toMatch(/if pg_trigger_depth\(\) > 1 then\s+new\.updated_at := now\(\);\s+return new;\s+end if;/);
    expect(sql).toMatch(/new\.user_id     := old\.user_id;/);
    expect(sql).toMatch(/new\.studio_rate := old\.studio_rate;/);
  });

  it("welcomes her once, when she is linked, and respects the quiet switch", () => {
    expect(sql).toMatch(/after insert or update of user_id on public\.teachers/);
    expect(sql).toMatch(/if tg_op = 'UPDATE' and old\.user_id is not distinct from new\.user_id then return new; end if;/);
    expect(sql).toMatch(/current_setting\('holis\.quiet_teacher_notify', true\)/);
    expect(sql).toMatch(/'event', 'teacher_welcome', 'teacherId', new\.id/);
  });
});

describe("the welcome email", () => {
  const fn = read("supabase/functions/notify-teacher/index.ts");

  it("gives a first-timer a link to choose her own password, and everyone the way to her panel", () => {
    expect(fn).toMatch(/if \(event === "teacher_welcome"\)/);
    expect(fn).toMatch(/const firstTime = !u\?\.user\?\.last_sign_in_at;/);
    expect(fn).toMatch(/type: "recovery", email: to, options: \{ redirectTo: `\$\{SITE\}\/reset-password` \}/);
    expect(fn).toMatch(/emailButton\(passwordLink, "Choose my password"\)/);
    expect(fn).toMatch(/emailButton\(`\$\{SITE\}\/teacher`, "Open my Teacher Panel"\)/);
  });
});

// ── after choosing her password she lands in her panel ──────────────────────
const roles = vi.hoisted(() => ({ list: [] as string[] }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: async () => ({ data: roles.list.map((role) => ({ role })) }) }) }),
  },
}));
import { homeFor } from "@/lib/authRedirect";

describe("where she lands", () => {
  beforeEach(() => { roles.list = []; });

  it("a teacher goes to her Teacher Panel, the team to the Admin, a client to their page", async () => {
    roles.list = ["teacher"];
    expect(await homeFor("u")).toBe("/teacher");
    roles.list = ["teacher", "coordinator"];
    expect(await homeFor("u")).toBe("/admin");
    roles.list = [];
    expect(await homeFor("u")).toBe("/dashboard");
  });
});
