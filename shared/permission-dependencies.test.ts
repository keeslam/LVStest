/**
 * D13 (besluit B-41, spec section 9): which read rights each right needs. The
 * table is the one list the users dialog shows ("Heeft nodig: ...") and the
 * button "Benodigde rechten ook aanzetten" works from. These tests tie it to the
 * two places the app already knows about missing data: every screen in
 * PAGE_ACCESS and every NoDataAccess site in the client source. The reports
 * screen has no NoDataAccess lines any more: it hides a report whose data the
 * user may not read (report-registry.tsx, visible()), so its sites are the read
 * rights that registry gates on.
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

/**
 * Which source files render which screen's missing-data lines. A page is
 * listed by its PAGE_ACCESS path (the rights that open it come from there);
 * a feature that is not a page names the rights it belongs to. A NoDataAccess
 * site in a file that is in none of these lists fails the test below, so a new
 * site cannot appear without a rule.
 */
const SCREEN_SOURCES: Array<{ screen: string; files: string[]; rights?: string[] }> = [
  { screen: "/", files: ["client/src/components/dashboard/", "client/src/pages/dashboard.tsx"] },
  { screen: "/customers", files: ["client/src/components/customers/customer-details.tsx", "client/src/pages/customers/"] },
  { screen: "/expenses", files: ["client/src/components/expenses/expense-form.tsx"] },
  { screen: "/communications", files: ["client/src/pages/CustomerCommunications.tsx"] },
  { screen: "/delivery", files: ["client/src/pages/delivery/"] },
  { screen: "/maintenance", files: ["client/src/pages/maintenance/"] },
  { screen: "/reports", files: ["client/src/pages/reports/"] },
  // Not pages of their own: the fiscal cards belong to the rights that work with them.
  { screen: "fiscal review", files: ["client/src/components/fiscal/usage-period-card.tsx"], rights: [UserPermission.MANAGE_FISCAL_REVIEW] },
  {
    screen: "fiscal configuration",
    files: ["client/src/components/fiscal/fiscal-settings-section.tsx"],
    rights: [UserPermission.MANAGE_FISCAL_CONFIGURATION, UserPermission.APPROVE_FISCAL_CONFIGURATION, UserPermission.PUBLISH_FISCAL_CONFIGURATION],
  },
];

/** Screens in PAGE_ACCESS that show no missing-data line at all today. */
const PAGES_WITHOUT_SITES = ["/vehicles", "/scan", "/portal-admin", "/fines", "/reservations", "/documents", "/reservations/edit/:id", "/expenses/add"];

interface Site {
  file: string;
  rights: string[];
}

const REPORT_REGISTRY = "client/src/pages/reports/report-registry.tsx";
/**
 * Rights helpers of the registry that are not a read dependency of the data: "reports" is the right
 * that opens the screen itself, "portal" is a feature right of its own (portal reports are hidden
 * without it, like the fines screen is for fines).
 */
const REGISTRY_NOT_A_READ_DEPENDENCY = ["reports", "portal"];

/**
 * The read rights the reports screen gates a report on: every `const x = (ctx) => any(ctx, UserPermission.A, ...)`
 * helper in report-registry.tsx except the two above. The first right of a helper is its read right; the others are
 * the manage twins that satisfy it. A helper without any UserPermission (transports) only combines other helpers.
 */
function findRegistrySites(): Site[] {
  const root = join(__dirname, "..");
  const text = readFileSync(join(root, ...REPORT_REGISTRY.split("/")), "utf8");
  const helpers = [...text.matchAll(/^const (\w+) = \(ctx: ReportAccess\) =>(.*)$/gm)];
  const sites: Site[] = [];
  for (const [, name, body] of helpers) {
    const rights = [...body.matchAll(/UserPermission\.([A-Z_]+)/g)].map((m) => UserPermission[m[1] as keyof typeof UserPermission] as string);
    if (REGISTRY_NOT_A_READ_DEPENDENCY.includes(name)) continue;
    if (rights.length === 0) {
      // transports = vehicles || reservations: it must only name other helpers.
      expect(body, `${REPORT_REGISTRY}: helper ${name} names no UserPermission and no other helper`).toMatch(/\b(vehicles|reservations|customers|expenses)\(ctx\)/);
      continue;
    }
    sites.push({ file: REPORT_REGISTRY, rights: [rights[0]] });
  }
  return sites;
}

/** Every <NoDataAccess permission={...}> in the client source, with all rights named in the prop (also an array or a conditional). */
function findSites(): Site[] {
  const root = join(__dirname, "..");
  const sites: Site[] = [];
  for (const abs of walk(join(root, "client", "src"))) {
    const text = readFileSync(abs, "utf8");
    const opened = [...text.matchAll(/<NoDataAccess\b/g)];
    let parsed = 0;
    for (const match of opened) {
      const from = match.index!;
      const propAt = text.indexOf("permission=", from);
      const tagEnd = text.indexOf("/>", from);
      if (propAt < 0 || (tagEnd >= 0 && propAt > tagEnd)) continue;
      // Balanced scan of the {...} value.
      let depth = 0;
      let i = text.indexOf("{", propAt);
      const valueStart = i;
      for (; i < text.length; i += 1) {
        if (text[i] === "{") depth += 1;
        if (text[i] === "}") {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      const value = text.slice(valueStart, i + 1);
      const rights = [...value.matchAll(/UserPermission\.([A-Z_]+)/g)].map(
        (m) => UserPermission[m[1] as keyof typeof UserPermission] as string,
      );
      expect(rights.length, `${relative(root, abs)}: NoDataAccess permission prop names no UserPermission: ${value}`).toBeGreaterThan(0);
      sites.push({ file: relative(root, abs).split("\\").join("/"), rights });
      parsed += 1;
    }
    // A <NoDataAccess without a parsable prop would hide a site from this test.
    expect(parsed, `${relative(root, abs)}: a <NoDataAccess> whose permission prop could not be read`).toBe(opened.length);
  }
  return sites;
}

type Table = typeof PERMISSION_DEPENDENCIES;

/** Every (screen, missing right) pair whose opening rights do not list that right in the given table. */
function screenGaps(table: Table): string[] {
  const sites = [...findSites(), ...findRegistrySites()];
  const gaps: string[] = [];
  for (const entry of SCREEN_SOURCES) {
    const openedBy = entry.rights ?? PAGE_ACCESS.find((page) => page.path === entry.screen)!.anyOf;
    const named = new Set<string>();
    for (const site of sites) {
      if (entry.files.some((prefix) => site.file.startsWith(prefix))) site.rights.forEach((right) => named.add(right));
    }
    if (named.size === 0) gaps.push(`${entry.screen}: no NoDataAccess site or registry gate found in its files`);
    for (const needed of named) {
      // The screen's own rights satisfy themselves (a reservations right on the delivery screen);
      // everything else has to be written down in the table.
      const own = satisfiesDependency(openedBy, needed);
      const listed = openedBy.some((right) => table[right] && [...table[right].required, ...table[right].optional].includes(needed));
      if (!own && !listed) gaps.push(`${entry.screen}: shows "missing ${needed}" but no right that opens it (${openedBy.join(", ")}) lists it`);
    }
  }
  return gaps;
}

describe("PERMISSION_DEPENDENCIES - tied to the screens", () => {
  it("every screen in PAGE_ACCESS is either mapped to its source files or known to show no missing-data line", () => {
    const mapped = new Set(SCREEN_SOURCES.map((entry) => entry.screen));
    for (const page of PAGE_ACCESS) {
      expect(mapped.has(page.path) || PAGES_WITHOUT_SITES.includes(page.path), `${page.path} is neither in SCREEN_SOURCES nor in PAGES_WITHOUT_SITES`).toBe(true);
    }
    for (const entry of SCREEN_SOURCES) {
      if (entry.rights) continue;
      expect(PAGE_ACCESS.some((page) => page.path === entry.screen), `${entry.screen} is not a PAGE_ACCESS path`).toBe(true);
    }
    for (const path of PAGES_WITHOUT_SITES) {
      expect(PAGE_ACCESS.some((page) => page.path === path), `${path} is not a PAGE_ACCESS path`).toBe(true);
    }
  });

  it("finds the NoDataAccess sites and the reports registry gates (about thirty), each in a file that belongs to a screen", () => {
    const registry = findRegistrySites();
    // The reports screen gates on vehicles, reservations, customers and expenses, nothing silently dropped.
    expect(registry.flatMap((site) => site.rights).sort()).toEqual(
      [UserPermission.VIEW_VEHICLES, UserPermission.VIEW_RESERVATIONS, UserPermission.VIEW_CUSTOMERS, UserPermission.MANAGE_EXPENSES].sort(),
    );
    const sites = [...findSites(), ...registry];
    expect(sites.length).toBeGreaterThanOrEqual(30);
    const unmapped = sites.filter((site) => !SCREEN_SOURCES.some((entry) => entry.files.some((prefix) => site.file.startsWith(prefix))));
    expect(unmapped.map((site) => site.file), "NoDataAccess sites in files no screen claims").toEqual([]);
  });

  it("for each screen, the rule of a right that opens it lists every read right its sites name", () => {
    expect(screenGaps(PERMISSION_DEPENDENCIES)).toEqual([]);
  });

  it("the tie depends on the table: dropping a dependency is noticed", () => {
    const dashboard = PERMISSION_DEPENDENCIES[UserPermission.VIEW_DASHBOARD];
    const without: Table = {
      ...PERMISSION_DEPENDENCIES,
      [UserPermission.VIEW_DASHBOARD]: { ...dashboard, required: dashboard.required.filter((r) => r !== UserPermission.VIEW_VEHICLES) },
    };
    const gaps = screenGaps(without);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toContain(`/: shows "missing ${UserPermission.VIEW_VEHICLES}"`);
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
