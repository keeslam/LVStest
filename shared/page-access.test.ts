import { describe, it, expect } from "vitest";
import { PAGE_ACCESS, pageAccessFor, canOpenPage, firstOpenablePage } from "./page-access";
import { UserPermission as P, UserRole } from "./schema";

// The sidebar's own hrefs (client/src/components/sidebar-nav.tsx, `navItems`),
// kept here as a plain list so this test fails the moment a screen is added
// to the menu without a matching row in the shared table.
const SIDEBAR_HREFS = [
  "/", "/vehicles", "/scan", "/customers", "/portal-admin", "/reservations",
  "/maintenance", "/expenses", "/documents", "/delivery", "/communications", "/reports",
];

describe("page-access", () => {
  it("has a row for every sidebar href", () => {
    for (const href of SIDEBAR_HREFS) {
      expect(pageAccessFor(href), href).toBeDefined();
    }
  });

  it("/delivery accepts view_vehicles (B-29: reservations OR vehicles)", () => {
    const entry = pageAccessFor("/delivery");
    expect(entry?.anyOf).toContain(P.VIEW_VEHICLES);
    expect(canOpenPage({ role: UserRole.USER, permissions: [P.VIEW_VEHICLES] }, "/delivery")).toBe(true);
  });

  it("/communications does not accept manage_notifications alone (B-29: templates only)", () => {
    const entry = pageAccessFor("/communications");
    expect(entry?.anyOf).toEqual([P.MANAGE_EMAIL_TEMPLATES]);
    expect(canOpenPage({ role: UserRole.USER, permissions: [P.MANAGE_NOTIFICATIONS] }, "/communications")).toBe(false);
    expect(canOpenPage({ role: UserRole.USER, permissions: [P.MANAGE_EMAIL_TEMPLATES] }, "/communications")).toBe(true);
  });

  it("resolves the two menu-less screens", () => {
    expect(pageAccessFor("/reservations/edit/12")?.anyOf).toEqual([P.MANAGE_RESERVATIONS]);
    expect(pageAccessFor("/expenses/add")?.anyOf).toEqual([P.MANAGE_EXPENSES]);
  });

  it("gives undefined for an unknown path", () => {
    expect(pageAccessFor("/nope-does-not-exist")).toBeUndefined();
  });

  it("admin with an empty permission list opens everything in the table", () => {
    const admin = { role: UserRole.ADMIN, permissions: [] };
    for (const entry of PAGE_ACCESS) {
      expect(canOpenPage(admin, entry.path), entry.path).toBe(true);
    }
  });

  it("firstOpenablePage returns the first row in menu order the user may open", () => {
    // Only vehicles rights: dashboard needs view_dashboard (not held), so the
    // first match in PAGE_ACCESS's menu order is /vehicles.
    const vehiclesOnly = { role: UserRole.USER, permissions: [P.VIEW_VEHICLES] };
    expect(firstOpenablePage(vehiclesOnly)).toBe("/vehicles");
  });

  it("firstOpenablePage returns null when the user may open nothing", () => {
    const nobody = { role: UserRole.USER, permissions: [] };
    expect(firstOpenablePage(nobody)).toBeNull();
  });
});
