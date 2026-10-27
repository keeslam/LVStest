import { describe, expect, it } from "vitest";
import { presetRightsFor, ROLE_PRESETS } from "./role-presets";
import { isAdminOnlyRight } from "./permission-dependencies";
import { UserPermission, UserRole } from "./schema";

describe("role presets (B-65)", () => {
  it("has a preset for every role", () => {
    for (const role of Object.values(UserRole)) expect(ROLE_PRESETS[role]).toBeDefined();
  });
  it("leaves admin-only rights off for anyone but an admin", () => {
    for (const role of Object.values(UserRole).filter((r) => r !== UserRole.ADMIN)) {
      expect(presetRightsFor(role).some(isAdminOnlyRight)).toBe(false);
    }
    expect(presetRightsFor(UserRole.ADMIN)).toEqual(Object.values(UserPermission));
  });
  it("gives Lease offertes to no preset but admin (Kees: standard only for beheerders)", () => {
    for (const [role, rights] of Object.entries(ROLE_PRESETS)) {
      if (role === UserRole.ADMIN) continue;
      expect(rights, role).not.toContain(UserPermission.MANAGE_LEASE_QUOTES);
      expect(presetRightsFor(role), role).not.toContain(UserPermission.MANAGE_LEASE_QUOTES);
    }
  });
  it("gives a cleaner only the three viewing rights and an unknown role nothing", () => {
    expect(presetRightsFor(UserRole.CLEANER)).toEqual([UserPermission.VIEW_DASHBOARD, UserPermission.VIEW_VEHICLES, UserPermission.VIEW_RESERVATIONS]);
    expect(presetRightsFor("onbekend")).toEqual([]);
  });
});
