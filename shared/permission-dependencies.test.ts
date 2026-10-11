/**
 * D13 (besluit B-41, spec section 9): which read rights each right needs. The
 * table is the one list the users dialog shows ("Heeft nodig: ...") and the
 * button "Benodigde rechten ook aanzetten" works from. These tests tie it to the
 * two places the app already knows about missing data: every screen in
 * PAGE_ACCESS and every NoDataAccess site in the client source.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { UserPermission } from "./schema";
import { PAGE_ACCESS } from "./page-access";
import {
  ADMIN_ONLY_RIGHTS,
  PERMISSION_DEPENDENCIES,
  enableRequiredRights,
  isAdminOnlyRight,
  missingOptional,
  missingRequired,
  satisfiesDependency,
} from "./permission-dependencies";

const ALL = Object.values(UserPermission) as string[];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      walk(full, out);
    } else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe("PERMISSION_DEPENDENCIES - the table itself", () => {
  it("has exactly one entry per right: none missing, none invented", () => {
    expect(Object.keys(PERMISSION_DEPENDENCIES).sort()).toEqual([...ALL].sort());
  });

  it("only names real rights, never itself, and never the same right as required and optional", () => {
    for (const [right, dep] of Object.entries(PERMISSION_DEPENDENCIES)) {
      for (const needed of [...dep.required, ...dep.optional]) {
        expect(ALL, `${right} names unknown right ${needed}`).toContain(needed);
        expect(needed, `${right} depends on itself`).not.toBe(right);
      }
      expect(dep.required.filter((r) => dep.optional.includes(r)), right).toEqual([]);
    }
  });

  it("only the three rights that no screen outside the admin dialogs uses are admin-only", () => {
    expect([...ADMIN_ONLY_RIGHTS].sort()).toEqual(
      [UserPermission.MANAGE_BACKUPS, UserPermission.MANAGE_SETTINGS, UserPermission.MANAGE_USERS].sort(),
    );
    for (const right of ALL) {
      expect(isAdminOnlyRight(right), right).toBe(ADMIN_ONLY_RIGHTS.includes(right));
    }
  });

  it("states the facts of the owner decision: the dashboard needs vehicles and reservations", () => {
    expect(PERMISSION_DEPENDENCIES[UserPermission.VIEW_DASHBOARD].required).toEqual([
      UserPermission.VIEW_VEHICLES,
      UserPermission.VIEW_RESERVATIONS,
    ]);
    expect(PERMISSION_DEPENDENCIES[UserPermission.MANAGE_MAINTENANCE].required).toEqual([
      UserPermission.VIEW_VEHICLES,
      UserPermission.VIEW_RESERVATIONS,
    ]);
    expect(PERMISSION_DEPENDENCIES[UserPermission.MANAGE_NOTIFICATIONS].required).toEqual([
      UserPermission.VIEW_CUSTOMERS,
      UserPermission.VIEW_VEHICLES,
    ]);
  });
});

describe("PERMISSION_DEPENDENCIES - tied to the screens", () => {
  it("every right that opens a screen in PAGE_ACCESS has a rule", () => {
    for (const page of PAGE_ACCESS) {
      for (const right of page.anyOf) {
        expect(PERMISSION_DEPENDENCIES[right], `${page.path} -> ${right}`).toBeDefined();
      }
    }
  });

  it("every right a NoDataAccess site names is needed (required or optional) by some right in the table", () => {
    const needed = new Set<string>();
    for (const dep of Object.values(PERMISSION_DEPENDENCIES)) {
      for (const right of [...dep.required, ...dep.optional]) needed.add(right);
    }

    const root = join(__dirname, "..", "client", "src");
    const sites: Array<{ file: string; right: string }> = [];
    for (const file of walk(root)) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/<NoDataAccess[^>]*permission=\{UserPermission\.([A-Z_]+)\}/g)) {
        sites.push({ file: relative(root, file).split("\\").join("/"), right: UserPermission[match[1] as keyof typeof UserPermission] });
      }
    }

    // The scan must really find the sites (30 at the time of writing); a regex
    // that silently matches nothing would make this test vacuous.
    expect(sites.length).toBeGreaterThanOrEqual(25);
    for (const site of sites) {
      expect(site.right, `${site.file} names an unknown right`).toBeTruthy();
      expect(needed.has(site.right), `${site.file}: ${site.right} is shown as missing data but no right in PERMISSION_DEPENDENCIES lists it`).toBe(true);
    }
  });
});

describe("dependency helpers", () => {
  it("a view right is satisfied by itself or by the manage right of the same family", () => {
    expect(satisfiesDependency([UserPermission.VIEW_VEHICLES], UserPermission.VIEW_VEHICLES)).toBe(true);
    expect(satisfiesDependency([UserPermission.MANAGE_VEHICLES], UserPermission.VIEW_VEHICLES)).toBe(true);
    expect(satisfiesDependency([UserPermission.MANAGE_CUSTOMERS], UserPermission.VIEW_VEHICLES)).toBe(false);
    expect(satisfiesDependency([], UserPermission.VIEW_VEHICLES)).toBe(false);
    // A right without a manage twin only counts as itself.
    expect(satisfiesDependency([UserPermission.MANAGE_FISCAL_REVIEW], UserPermission.VIEW_FISCAL)).toBe(false);
  });

  it("missingRequired and missingOptional list what the held rights do not cover", () => {
    const held = [UserPermission.VIEW_DASHBOARD, UserPermission.MANAGE_VEHICLES];
    expect(missingRequired(UserPermission.VIEW_DASHBOARD, held)).toEqual([UserPermission.VIEW_RESERVATIONS]);
    expect(missingOptional(UserPermission.VIEW_DASHBOARD, held)).toEqual([
      UserPermission.VIEW_CUSTOMERS,
      UserPermission.MANAGE_EXPENSES,
    ]);
    expect(missingRequired(UserPermission.VIEW_VEHICLES, held)).toEqual([]);
  });

  it("enableRequiredRights adds the missing required rights of every ticked right, once, and nothing else", () => {
    const ticked = [UserPermission.VIEW_DASHBOARD, UserPermission.MANAGE_MAINTENANCE];
    const result = enableRequiredRights(ticked);
    expect(result).toEqual(
      expect.arrayContaining([
        UserPermission.VIEW_DASHBOARD,
        UserPermission.MANAGE_MAINTENANCE,
        UserPermission.VIEW_VEHICLES,
        UserPermission.VIEW_RESERVATIONS,
      ]),
    );
    expect(result).toHaveLength(4);
    // Optional rights are never switched on.
    expect(result).not.toContain(UserPermission.VIEW_CUSTOMERS);
    // Idempotent, and it does not mutate its input.
    expect(enableRequiredRights(result)).toEqual(result);
    expect(ticked).toHaveLength(2);
  });

  it("a manage right already covers the view right it would otherwise add", () => {
    const result = enableRequiredRights([UserPermission.VIEW_DASHBOARD, UserPermission.MANAGE_VEHICLES, UserPermission.MANAGE_RESERVATIONS, UserPermission.VIEW_CUSTOMERS]);
    expect(result).not.toContain(UserPermission.VIEW_VEHICLES);
    expect(result).not.toContain(UserPermission.VIEW_RESERVATIONS);
  });

  it("follows chains: a right whose required right itself needs another", () => {
    // manage_fiscal_configuration needs view_fiscal; manage_reservations needs view_customers.
    const result = enableRequiredRights([UserPermission.MANAGE_FISCAL_CONFIGURATION, UserPermission.MANAGE_RESERVATIONS]);
    expect(result).toContain(UserPermission.VIEW_FISCAL);
    expect(result).toContain(UserPermission.VIEW_CUSTOMERS);
  });
});
