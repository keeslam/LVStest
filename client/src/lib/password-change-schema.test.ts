/**
 * A-1-4 — the confirm field of the profile's password form said "Please
 * confirm your new password" while "abc" was typed in it (a short confirm hit
 * the "required" rule). The confirm field now only says "required" when it is
 * empty and "do not match" when it differs; the new-password rule mirrors what
 * POST /api/users/change-password really enforces (server/routes/users.ts), so
 * the form never accepts what the server refuses.
 */
import { describe, it, expect } from "vitest";
import nl from "../locales/nl/auth.json";
import en from "../locales/en/auth.json";
import { makePasswordChangeSchema, PASSWORD_MIN_LENGTH } from "./password-change-schema";

const t = (key: string) => key;
const schema = makePasswordChangeSchema(t);

function issues(values: { currentPassword?: string; newPassword?: string; confirmPassword?: string }) {
  const res = schema.safeParse({ currentPassword: "old", newPassword: "Abcdefg1", confirmPassword: "Abcdefg1", ...values });
  if (res.success) return {};
  const byPath: Record<string, string> = {};
  for (const i of res.error.issues) byPath[i.path.join(".")] ??= i.message;
  return byPath;
}

describe("makePasswordChangeSchema", () => {
  it("accepts a password the server accepts", () => {
    expect(issues({})).toEqual({});
  });

  it("mirrors the server's length (8) and character rules", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(issues({ newPassword: "Abc1", confirmPassword: "Abc1" }).newPassword).toBe("profileDialog.passwordErrors.newTooShort");
    expect(issues({ newPassword: "abcdefg1", confirmPassword: "abcdefg1" }).newPassword).toBe("profileDialog.passwordErrors.newCharacters");
    expect(issues({ newPassword: "ABCDEFG1", confirmPassword: "ABCDEFG1" }).newPassword).toBe("profileDialog.passwordErrors.newCharacters");
    expect(issues({ newPassword: "Abcdefgh", confirmPassword: "Abcdefgh" }).newPassword).toBe("profileDialog.passwordErrors.newCharacters");
  });

  it("a short confirmation is a mismatch, not 'please confirm'", () => {
    expect(issues({ confirmPassword: "abc" }).confirmPassword).toBe("profileDialog.passwordErrors.mismatch");
  });

  it("an empty confirmation asks for it", () => {
    expect(issues({ confirmPassword: "" }).confirmPassword).toBe("profileDialog.passwordErrors.confirmRequired");
  });

  it("an empty current password asks for it", () => {
    expect(issues({ currentPassword: "" }).currentPassword).toBe("profileDialog.passwordErrors.currentRequired");
  });

  it("every message key exists in both languages", () => {
    for (const key of ["currentRequired", "newTooShort", "newCharacters", "confirmRequired", "mismatch"]) {
      expect((nl as any).profileDialog.passwordErrors[key], `nl ${key}`).toBeTruthy();
      expect((en as any).profileDialog.passwordErrors[key], `en ${key}`).toBeTruthy();
    }
  });

  it("the hint states the same rule the form enforces", () => {
    expect((nl as any).profileDialog.newPasswordHint).toContain("8");
    expect((en as any).profileDialog.newPasswordHint).toContain("8");
  });
});
