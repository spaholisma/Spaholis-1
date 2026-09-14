import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

// Signing out must end the session on this device only. supabase-js defaults
// to scope "global", which revokes every session of the account, so one
// person pressing Sign Out logged the same account out on every other device.
const root = resolve(__dirname, "../..");

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(name) ? [p] : [];
  });

describe("sign out", () => {
  it("only ends the session on this device", () => {
    const src = readFileSync(resolve(root, "src/hooks/useAuth.ts"), "utf8");
    expect(src).toContain('supabase.auth.signOut({ scope: "local" })');
  });

  it("is never called without a scope anywhere in the app", () => {
    const offenders = walk(resolve(root, "src"))
      .filter((f) => !/\.test\.tsx?$/.test(f))
      .flatMap((f) =>
        readFileSync(f, "utf8")
          .split("\n")
          .map((line, i) => ({ f, i: i + 1, line }))
          .filter(({ line }) => /auth\.signOut\(\s*\)/.test(line)),
      );
    expect(offenders.map((o) => `${o.f}:${o.i}`)).toEqual([]);
  });
});
