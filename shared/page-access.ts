import { UserPermission as P, UserRole } from "./schema";

/**
 * The one table of "which permission opens which staff screen"
 * (docs/superpowers/specs/2026-09-21-toegang-design.md, §1). Consumers:
 * `client/src/components/sidebar-nav.tsx` (menu visibility), the route guard
 * added in Task 2, and `e2e/registry/pages.ts` (E2E page registry) — so the
 * three can never drift apart again.
 *
 * Kept free of React and of server-only imports: this file is bundled by the
 * client (like `shared/schema.ts` already is, e.g. in the sidebar) as well as
 * imported by the server and by the E2E suite.
 *
 * Rows are the sidebar's current entries with the two changes the owner
 * decided (B-29) plus the two screens reachable without a menu entry:
 * - `/delivery`: widened from reservations-only to reservations OR vehicles
 *   (matches the `GET /api/transports` guard already in place).
 * - `/communications`: narrowed to `manage_email_templates` only (the send
 *   controls stay gated by `manage_notifications` separately, on the
 *   controls themselves, not on opening the screen).
 * - `/reservations/edit/:id` and `/expenses/add` have no sidebar entry but
 *   are real screens with their own access rule.
 */
export interface PageAccess {
  path: string;
  anyOf: readonly string[];
}

export const PAGE_ACCESS: readonly PageAccess[] = [
  // OPT-001 — "Vandaag" is the first thing an employee sees in the menu; kept
  // first here too so firstOpenablePage() offers it first.
  { path: "/", anyOf: [P.VIEW_DASHBOARD] },
  { path: "/vehicles", anyOf: [P.VIEW_VEHICLES, P.MANAGE_VEHICLES] },
  { path: "/scan", anyOf: [P.VIEW_VEHICLES, P.MANAGE_VEHICLES] },
  { path: "/customers", anyOf: [P.VIEW_CUSTOMERS, P.MANAGE_CUSTOMERS] },
  { path: "/portal-admin", anyOf: [P.VIEW_PORTAL, P.MANAGE_PORTAL] },
  { path: "/reservations", anyOf: [P.VIEW_RESERVATIONS, P.MANAGE_RESERVATIONS] },
  { path: "/maintenance", anyOf: [P.MANAGE_MAINTENANCE] },
  { path: "/expenses", anyOf: [P.MANAGE_EXPENSES] },
  { path: "/documents", anyOf: [P.VIEW_DOCUMENTS, P.MANAGE_DOCUMENTS] },
  // B-29: everyone who may see reservations OR vehicles gets the menu item.
  { path: "/delivery", anyOf: [P.VIEW_RESERVATIONS, P.MANAGE_RESERVATIONS, P.VIEW_VEHICLES, P.MANAGE_VEHICLES] },
  // B-29: opening the screen needs "e-mailsjablonen beheren" only; the send
  // buttons additionally need "meldingen beheren" (RequiresPermission, §4 —
  // not built in this task).
  { path: "/communications", anyOf: [P.MANAGE_EMAIL_TEMPLATES] },
  { path: "/reports", anyOf: [P.VIEW_REPORTS, P.MANAGE_REPORTS] },
  // Screens without a menu entry, listed after the 12 above so
  // firstOpenablePage() only ever offers a menu screen as the way out.
  { path: "/reservations/edit/:id", anyOf: [P.MANAGE_RESERVATIONS] },
  { path: "/expenses/add", anyOf: [P.MANAGE_EXPENSES] },
];

/** Escapes a literal path segment for use inside a RegExp. */
function escapeRegExp(segment: string): string {
  return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True when the pattern's segment count matches and every static segment matches literally. */
function matchesPattern(pattern: string, path: string): boolean {
  const patternSegments = pattern.split("/");
  const pathSegments = path.split("/");
  if (patternSegments.length !== pathSegments.length) return false;
  return patternSegments.every((segment, index) =>
    segment.startsWith(":") ? pathSegments[index].length > 0 : segment === pathSegments[index]
  );
}

/**
 * Matches a concrete path (e.g. "/reservations/edit/12") to its table row,
 * static or parameterised. Strips a query string or hash first so callers
 * can pass a raw `location.pathname`-like value either way.
 */
export function pageAccessFor(path: string): PageAccess | undefined {
  const clean = path.split("?")[0].split("#")[0];
  return PAGE_ACCESS.find((entry) => matchesPattern(entry.path, clean));
}

/**
 * Client-side mirror of the server's rule: role `admin` bypasses every
 * check; everyone else needs at least one of the row's permissions. A path
 * with no row in the table is not gated here (true) — it is either handled
 * elsewhere (login-only pages) or not a real route, in which case wouter
 * renders the not-found page regardless.
 */
export function canOpenPage(
  user: { role: string; permissions?: string[] | null } | null | undefined,
  path: string
): boolean {
  if (!user) return false;
  if (user.role === UserRole.ADMIN) return true;
  const entry = pageAccessFor(path);
  if (!entry) return true;
  const permissions = user.permissions ?? [];
  return entry.anyOf.some((permission) => permissions.includes(permission));
}

/**
 * The first screen, in menu order, the user may open — used by the no-access
 * page's way-out button. `null` when there is none.
 */
export function firstOpenablePage(
  user: { role: string; permissions?: string[] | null } | null | undefined
): string | null {
  if (!user) return null;
  const entry = PAGE_ACCESS.find((candidate) => canOpenPage(user, candidate.path));
  return entry ? entry.path : null;
}
