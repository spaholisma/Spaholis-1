import { describe, it, expect } from "vitest";
import { toE164 } from "./phone";
import { phoneToSave, phoneProblem } from "@/components/admin/ContactPhoneField";

// Phones typed at the desk over the years, read into the country picker.
describe("reading an old phone number into the country picker", () => {
  it("reads a Costa Rican number with no country code", () => {
    expect(toE164("8888-1234")).toBe("+50688881234");
    expect(toE164("8888 1234")).toBe("+50688881234");
  });

  it("keeps a number that already has its country code", () => {
    expect(toE164("+506 8888 1234")).toBe("+50688881234");
    expect(toE164("+1 (305) 555-0100")).toBe("+13055550100");
    expect(toE164("001 305 555 0100")).toBe("+13055550100");
  });

  it("gives nothing back for what is not a phone number", () => {
    expect(toE164("")).toBe("");
    expect(toE164(null)).toBe("");
    expect(toE164("call me")).toBe("");
    expect(toE164("12")).toBe("");
  });
});

describe("saving the phone box", () => {
  it("saves what is in the box", () => {
    expect(phoneToSave("+50688881234", "8888-1234")).toBe("+50688881234");
  });

  it("clears a number the picker could read, when the box is emptied", () => {
    expect(phoneToSave("", "8888-1234")).toBe("");
  });

  it("never loses a number it could not read", () => {
    expect(phoneToSave("", "ext. 22 front desk")).toBe("ext. 22 front desk");
  });

  it("flags a number too short to be real", () => {
    expect(phoneProblem("+5068")).toBeTruthy();
    expect(phoneProblem("+50688881234")).toBeNull();
    expect(phoneProblem("")).toBeNull();
  });
});
