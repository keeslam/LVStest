import { describe, it, expect } from "vitest";
import { PASSWORD_MIN_LENGTH, passwordPolicyIssues } from "./password-policy";

describe("password policy (D12)", () => {
  it("requires at least 10 characters", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(10);
  });

  it("accepts a password with 10+ characters, a lower, an upper and a digit", () => {
    expect(passwordPolicyIssues("Abcdefghi1")).toEqual([]);
    expect(passwordPolicyIssues("Een-Echt-Wachtwoord-2")).toEqual([]);
  });

  it("reports a password that is one character short", () => {
    expect(passwordPolicyIssues("Abcdefgh1")).toEqual(["tooShort"]);
  });

  it("reports every missing character class", () => {
    expect(passwordPolicyIssues("abcdefghijkl")).toEqual(["needsUpper", "needsDigit"]);
    expect(passwordPolicyIssues("ABCDEFGHIJKL")).toEqual(["needsLower", "needsDigit"]);
    expect(passwordPolicyIssues("Abcdefghijkl")).toEqual(["needsDigit"]);
    expect(passwordPolicyIssues("1234567890")).toEqual(["needsLower", "needsUpper"]);
  });

  it("reports everything for an empty or non-string value", () => {
    expect(passwordPolicyIssues("")).toEqual(["tooShort", "needsLower", "needsUpper", "needsDigit"]);
    expect(passwordPolicyIssues(undefined)).toEqual(["tooShort", "needsLower", "needsUpper", "needsDigit"]);
  });

  it("counts spaces as characters", () => {
    expect(passwordPolicyIssues("Ab1       ")).toEqual([]);
  });
});
