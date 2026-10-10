/**
 * A-R-1 (docs/audit/fysieke-e2e-audit-2026-10-09.md, rights round): "Boetes bekijken"
 * and "Fiscale check bekijken" had no screen of their own. The fines list got its own
 * menu item and address; the fiscal check lives in Rapporten > Fiscaal, which now
 * also opens for the right Fiscale check bekijken.
 */
import { describe, it, expect } from "vitest";
import { UserPermission as P, UserRole } from "./schema";
import { canOpenPage, firstOpenablePage, pageAccessFor } from "./page-access";

const user = (...permissions: string[]) => ({ role: UserRole.USER, permissions });

describe("A-R-1 - a screen for each of the two rights", () => {
  it("/fines opens for Boetes bekijken or Boetes beheren, and for nobody else", () => {
    expect(pageAccessFor("/fines")?.anyOf).toEqual([P.VIEW_FINES, P.MANAGE_FINES]);
    expect(canOpenPage(user(P.VIEW_FINES), "/fines")).toBe(true);
    expect(canOpenPage(user(P.MANAGE_FINES), "/fines")).toBe(true);
    expect(canOpenPage(user(P.VIEW_PORTAL), "/fines")).toBe(false);
  });

  it("holding only Boetes bekijken no longer means 'nothing to open'", () => {
    expect(canOpenPage(user(P.VIEW_FINES), "/portal-admin")).toBe(false);
    expect(firstOpenablePage(user(P.VIEW_FINES))).toBe("/fines");
  });

  it("/reports also opens for Fiscale check bekijken, and still for the report rights", () => {
    expect(canOpenPage(user(P.VIEW_FISCAL), "/reports")).toBe(true);
    expect(canOpenPage(user(P.VIEW_REPORTS), "/reports")).toBe(true);
    expect(canOpenPage(user(P.MANAGE_REPORTS), "/reports")).toBe(true);
    expect(canOpenPage(user(P.VIEW_FINES), "/reports")).toBe(false);
  });

  it("holding only Fiscale check bekijken: Rapporten is the way in", () => {
    expect(firstOpenablePage(user(P.VIEW_FISCAL))).toBe("/reports");
  });
});
