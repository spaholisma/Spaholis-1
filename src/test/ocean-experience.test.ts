import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Private Ocean & Wellness Experience: $320 per person, minimum 4 ($1,280).
const page = readFileSync(resolve(__dirname, "../../src/pages/ExperienceBooking.tsx"), "utf8");

describe("Private Ocean & Wellness Experience", () => {
  it("can't be booked for fewer than 4 people", () => {
    expect(page).toMatch(/"9b3d99d5-3f0a-4189-9f79-482fcc9d8343": 4,/);
  });
});
