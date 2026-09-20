import { UserPermission as P } from "../../shared/schema";

export interface PageEntry {
  path: string;
  anyOf: string[];
  /**
   * One GET the page depends on, used by layer-a/forbidden.spec.ts to prove a
   * role this page's sidebar entry refuses also gets a 403 from the server.
   * `null` when no such route exists (every GET route the page depends on is
   * guarded by permissions wider than the sidebar's `anyOf` — see
   * .superpowers/sdd/2026-09-20-e2e-browser-tests/task-6-report.md, "Findings
   * for the owner"). forbidden.spec.ts then skips only the 403 assertion for
   * that page and keeps the other two.
   */
  api: string | null;
}

// Permissions copied from client/src/components/sidebar-nav.tsx (lines 24-37).
export const PAGES: PageEntry[] = [
  { path: "/", anyOf: [P.VIEW_DASHBOARD], api: "/api/vehicles" },
  { path: "/vehicles", anyOf: [P.VIEW_VEHICLES, P.MANAGE_VEHICLES], api: "/api/vehicles" },
  // ScanPage renders ScanPanel, which loads ["/api/scan-events"] on mount
  // (client/src/components/barcodes/scan-panel.tsx) — guarded the same as
  // /vehicles (VIEW_VEHICLES, MANAGE_VEHICLES).
  { path: "/scan", anyOf: [P.VIEW_VEHICLES, P.MANAGE_VEHICLES], api: "/api/scan-events" },
  { path: "/customers", anyOf: [P.VIEW_CUSTOMERS, P.MANAGE_CUSTOMERS], api: "/api/customers" },
  // portal-admin/index.tsx fetches DASHBOARD_KEY = ["/api/portal-admin/dashboard"]
  // on mount (client/src/components/portal-admin/dashboard-panels.tsx); the
  // brief's guessed "/api/portal-admin/users" route does not exist.
  { path: "/portal-admin", anyOf: [P.VIEW_PORTAL, P.MANAGE_PORTAL], api: "/api/portal-admin/dashboard" },
  { path: "/reservations", anyOf: [P.VIEW_RESERVATIONS, P.MANAGE_RESERVATIONS], api: "/api/reservations" },
  // Finding: every GET the maintenance calendar depends on (/api/vehicles/*,
  // /api/reservations, /api/app-settings, /api/system-settings) is guarded by
  // VIEW_VEHICLES/MANAGE_VEHICLES or VIEW_RESERVATIONS/MANAGE_RESERVATIONS —
  // permissions every one of the seven E2E profiles holds — never by
  // MANAGE_MAINTENANCE, which is what the sidebar actually requires. No GET
  // route refuses a role the sidebar refuses, so there is nothing to assert
  // a 403 against.
  { path: "/maintenance", anyOf: [P.MANAGE_MAINTENANCE], api: null },
  { path: "/expenses", anyOf: [P.MANAGE_EXPENSES], api: "/api/expenses" },
  { path: "/expenses/add", anyOf: [P.MANAGE_EXPENSES], api: "/api/expenses" },
  { path: "/documents", anyOf: [P.VIEW_DOCUMENTS, P.MANAGE_DOCUMENTS], api: "/api/documents" },
  // Finding: GET /api/transports (server/routes.ts) is guarded by
  // VIEW_VEHICLES/MANAGE_VEHICLES/VIEW_RESERVATIONS/MANAGE_RESERVATIONS — wider
  // than the sidebar's VIEW_RESERVATIONS/MANAGE_RESERVATIONS. Harmless today
  // only because every profile already holds VIEW_RESERVATIONS.
  { path: "/delivery", anyOf: [P.VIEW_RESERVATIONS, P.MANAGE_RESERVATIONS], api: "/api/transports" },
  // Finding: GET /api/email-templates (mounted in server/index.ts) is guarded
  // by MANAGE_EMAIL_TEMPLATES only — narrower than the sidebar's
  // MANAGE_EMAIL_TEMPLATES/MANAGE_NOTIFICATIONS. Harmless today only because
  // no profile holds MANAGE_NOTIFICATIONS without also holding
  // MANAGE_EMAIL_TEMPLATES.
  { path: "/communications", anyOf: [P.MANAGE_EMAIL_TEMPLATES, P.MANAGE_NOTIFICATIONS], api: "/api/email-templates" },
  { path: "/reports", anyOf: [P.VIEW_REPORTS, P.MANAGE_REPORTS], api: "/api/reports/saved" },
];
