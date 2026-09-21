import { describe, it, expect } from "vitest";
import { PAGE_ACCESS, pageAccessFor, canOpenPage, firstOpenablePage } from "./page-access";
import { UserPermission as P, UserRole } from "./schema";

// "Every menu href has a row" now runs against the sidebar's real,
// exported item list — client/src/components/__tests__/sidebar-nav-page-access.test.tsx
// (jsdom project) — instead of a hand-copied array kept here, which could
// silently drift from the actual menu.

describe("page-access", () => {
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

// Fix round 1 (review of Task 1) — wouter matches routes via regexparam
// (node_modules/regexparam/dist/index.mjs), whose generated pattern is
// `RegExp('^' + pattern + '\/?$', 'i')`: a single trailing slash is optional
// and matching is case-insensitive. Its browser location hook
// (node_modules/wouter/esm/use-browser-location.js, `usePathname`) reads
// `location.pathname`, which never includes a query string or hash — but a
// caller of this module (E2E, a raw `<a href>`) can still pass one through,
// so pageAccessFor() strips those too, before wouter would ever see them.
// canOpenPage() answers "open" (true) for a path with no row — see the
// comment on that function — so every one of these normalised forms must
// still resolve to its row, never fall through to that default.
describe("pageAccessFor normalises the way wouter matches", () => {
  it("treats one trailing slash as optional, like wouter", () => {
    expect(pageAccessFor("/maintenance/")).toBe(pageAccessFor("/maintenance"));
    expect(pageAccessFor("/expenses/add/")).toBe(pageAccessFor("/expenses/add"));
    expect(pageAccessFor("/reservations/edit/12/")?.anyOf).toEqual([P.MANAGE_RESERVATIONS]);
  });

  it("strips a query string, which wouter's own location hook never sees either", () => {
    expect(pageAccessFor("/expenses?inbox=1")).toBe(pageAccessFor("/expenses"));
  });

  it("strips a hash, for the same reason", () => {
    expect(pageAccessFor("/vehicles#section")).toBe(pageAccessFor("/vehicles"));
  });

  it("matches case-insensitively, like wouter's `i`-flagged pattern", () => {
    expect(pageAccessFor("/Maintenance")).toBe(pageAccessFor("/maintenance"));
    expect(pageAccessFor("/RESERVATIONS/Edit/12")?.anyOf).toEqual([P.MANAGE_RESERVATIONS]);
  });

  it("never confuses /reservations with its edit row, in either direction", () => {
    expect(pageAccessFor("/reservations")?.anyOf).toEqual([P.VIEW_RESERVATIONS, P.MANAGE_RESERVATIONS]);
    expect(pageAccessFor("/reservations/edit/12")?.anyOf).toEqual([P.MANAGE_RESERVATIONS]);
    expect(pageAccessFor("/reservations")).not.toBe(pageAccessFor("/reservations/edit/12"));
  });

  it("no known path shape falls through to canOpenPage's no-row default", () => {
    for (const entry of PAGE_ACCESS) {
      const concrete = entry.path.includes(":") ? entry.path.replace(/:[^/]+/g, "12") : entry.path;
      const shapes = [
        concrete,
        concrete.toUpperCase(),
        `${concrete}?x=1`,
        `${concrete}#y`,
        ...(concrete === "/" ? [] : [`${concrete}/`]),
      ];
      for (const shape of shapes) {
        expect(pageAccessFor(shape), shape).toBeDefined();
      }
    }
  });
});
