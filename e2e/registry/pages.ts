import { PAGE_ACCESS } from "../../shared/page-access";

export interface PageEntry {
  path: string;
  anyOf: readonly string[];
  /**
   * One GET the page depends on, used by layer-a/forbidden.spec.ts to prove a
   * role this page's sidebar entry refuses also gets a 403 from the server.
   * `null` when no such route exists (every GET route the page depends on is
   * guarded by permissions wider than the table's `anyOf` — see
   * .superpowers/sdd/2026-09-20-e2e-browser-tests/task-6-report.md, "Findings
   * for the owner") or, for `/reservations/edit/:id`, because the path is
   * parameterised and is not iterated by layer-a at all (see below).
   * forbidden.spec.ts then skips only the 403 assertion for that page and
   * keeps the other two.
   */
  api: string | null;
}

// `path` and `anyOf` come from shared/page-access.ts (also consumed by
// client/src/components/sidebar-nav.tsx and, from Task 2, the route guard) so
// this registry can never drift from the menu again. Only `api` — which GET
// proves a 403 for E2E — stays local to the E2E suite.
const API_BY_PATH: Record<string, string | null> = {
  "/": "/api/vehicles",
  "/vehicles": "/api/vehicles",
  // ScanPage renders ScanPanel, which loads ["/api/scan-events"] on mount
  // (client/src/components/barcodes/scan-panel.tsx) — guarded the same as
  // /vehicles (VIEW_VEHICLES, MANAGE_VEHICLES).
  "/scan": "/api/scan-events",
  "/customers": "/api/customers",
  // portal-admin/index.tsx fetches DASHBOARD_KEY = ["/api/portal-admin/dashboard"]
  // on mount (client/src/components/portal-admin/dashboard-panels.tsx); the
  // brief's guessed "/api/portal-admin/users" route does not exist.
  "/portal-admin": "/api/portal-admin/dashboard",
  "/reservations": "/api/reservations",
  // Finding: every GET the maintenance calendar depends on (/api/vehicles/*,
  // /api/reservations, /api/app-settings, /api/system-settings) is guarded by
  // VIEW_VEHICLES/MANAGE_VEHICLES or VIEW_RESERVATIONS/MANAGE_RESERVATIONS —
  // permissions every one of the seven E2E profiles holds — never by
  // MANAGE_MAINTENANCE, which is what the table actually requires. No GET
  // route refuses a role the table refuses, so there is nothing to assert
  // a 403 against.
  "/maintenance": null,
  "/expenses": "/api/expenses",
  "/expenses/add": "/api/expenses",
  "/documents": "/api/documents",
  // B-29 widened this row to VIEW_RESERVATIONS/MANAGE_RESERVATIONS/
  // VIEW_VEHICLES/MANAGE_VEHICLES (shared/page-access.ts), which now matches
  // GET /api/transports' guard (server/routes.ts) exactly — the mismatch a
  // previous version of this file reported here is resolved by that change.
  "/delivery": "/api/transports",
  // B-29a widened this row to MANAGE_NOTIFICATIONS OR MANAGE_EMAIL_TEMPLATES
  // (shared/page-access.ts) so an account with only manage_notifications does
  // not lose the screen. GET /api/email-templates still guards on
  // MANAGE_EMAIL_TEMPLATES alone (server/index.ts) — a role denied BOTH
  // permissions (every role this file's own forbidden.spec.ts loop actually
  // tests here) still gets refused by both the row and this route, so the
  // 403 assertion below stays valid; a manage_notifications-only role can
  // open the page but would still get a 403 from this one GET, which is by
  // design (B-29a keeps template management behind manage_email_templates)
  // and outside what that loop checks (it only runs for roles the row itself
  // already refuses).
  "/communications": "/api/email-templates",
  // Finding: reports/index.tsx (client/src/pages/reports/index.tsx, about
  // lines 145 and 150) fetches /api/customers and /api/transports with no
  // `enabled` gate of their own. Harmless for the seven E2E profiles (everyone
  // who reaches /reports also holds VIEW_CUSTOMERS), latent for a hand-built
  // profile with VIEW_REPORTS but without VIEW_CUSTOMERS.
  "/reports": "/api/reports/saved",
  // No api: this path is parameterised ("/reservations/edit/:id") and is
  // deliberately excluded from both layer-a/pages.spec.ts and
  // layer-a/forbidden.spec.ts (they filter out any path containing ":" — see
  // the comment there). Proving a 403 against a route (GET
  // /api/reservations/:id) that is guarded more widely —
  // VIEW_RESERVATIONS/MANAGE_RESERVATIONS — than this page's own
  // MANAGE_RESERVATIONS-only row, with a seeded reservation id, is left to
  // the route guard's own test in Task 2.
  "/reservations/edit/:id": null,
};

// A row present in shared/page-access.ts but missing here would silently
// fall back to `api: null` — losing forbidden.spec.ts's 403 assertion for
// that page without anyone noticing (fix round 1 of Task 1's review). Fail
// loudly instead: every PAGE_ACCESS path must be an explicit key of
// API_BY_PATH, `null` included, with its reason in a comment above.
for (const entry of PAGE_ACCESS) {
  if (!Object.prototype.hasOwnProperty.call(API_BY_PATH, entry.path)) {
    throw new Error(
      `e2e/registry/pages.ts: no API_BY_PATH entry for "${entry.path}" (add one, "null" with a reason in a comment if there really is no api to assert a 403 against).`
    );
  }
}

export const PAGES: PageEntry[] = PAGE_ACCESS.map((entry) => ({
  path: entry.path,
  anyOf: entry.anyOf,
  api: API_BY_PATH[entry.path],
}));
