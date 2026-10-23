import { UserPermission as P, UserRole } from "../../shared/schema";
import { ROLE_PRESETS } from "../../shared/role-presets";

// A role is only a label in this application; rights are an explicit list per
// user (server/middleware/permissions.ts; `admin` bypasses the list). These
// ten profiles are an assumption the E2E suite makes about what each role
// should be able to do — Task 9 puts that assumption in front of the owner.
// "reports-only" is Task 5's own addition (docs/superpowers/specs/
// 2026-09-21-toegang-design.md, §6): unlike the other seven, it deliberately
// holds nothing from the vehicle/reservation/customer families, to prove a
// screen's queries never fail for someone who holds only the screen's own
// permission.
// "templates-only" is the 2026-09-21 review's addition (item 6): the other
// half of B-29's /communications split — it holds the screen's own
// manage_email_templates but not manage_notifications, to prove the send
// controls stay visible-disabled-explained rather than the screen itself
// refusing to open.
// "notifications-only" is B-29a's addition: the owner confirmed accounts
// exist with manage_notifications but WITHOUT manage_email_templates
// (templates are admin/manager-only, on purpose). It holds exactly
// view_dashboard + manage_notifications, to prove the screen now opens for
// that combination too and that template-management controls (not the send
// controls) are what stays visible-disabled-explained for it.
export const ROLES = ["admin", "manager", "user", "cleaner", "viewer", "accountant", "maintenance", "reports-only", "templates-only", "notifications-only"] as const;
export type Role = (typeof ROLES)[number];

// Twin sessions: the same profile as `admin` / `manager` / `user` under another
// username, so a spec can spread its requests over two per-user buckets of the API
// limiter (5000 requests per logged-in user per 15 minutes since 2026-10-23, was 1000, one server process and one window
// per run, counters in memory; server/middleware/security/rateLimiter.ts). The
// server keeps its production limits and a 429 stays a page-health violation
// (e2e/support/guards.ts); the remedy for a bucket that runs dry is another seeded
// user, never a bypass (docs/superpowers/specs/2026-09-20-e2e-browser-tests-design.md,
// "Rate limits"). Only the three profiles that the later layers also lean on have
// one; the numbers are in docs/e2e/README.md, "Het verzoekbudget".
// Twins are NOT part of ROLES: pages/forbidden/dialogs run the role matrix over
// ROLES, and an extra copy of a role would only spend more requests. They exist
// as accounts (seed + login) and are picked by name in the specs that need them.
export const TWIN_OF = { admin: "admin-b", manager: "manager-b", user: "user-b" } as const satisfies Partial<Record<Role, string>>;
export type Twin = (typeof TWIN_OF)[keyof typeof TWIN_OF];
export const TWINS: readonly Twin[] = Object.values(TWIN_OF);
/** Every seeded login: the ten roles plus the twins. */
export type Account = Role | Twin;
export const ACCOUNTS: readonly Account[] = [...ROLES, ...TWINS];
/** The role whose profile (rights, role label) an account carries. */
export const profileOf = (account: Account): Role =>
  (Object.keys(TWIN_OF) as Array<keyof typeof TWIN_OF>).find((role) => TWIN_OF[role] === account) ?? (account as Role);

// The seven real roles take their rights from the presets the user form pre-fills (B-65),
// so the suite and the app cannot drift apart.
export const PROFILES: Record<Role, string[]> = {
  ...ROLE_PRESETS,
  // Task 5 (docs/superpowers/specs/2026-09-21-toegang-design.md, §6) — the
  // deliberately narrow profile that exposes "a part of a screen needs
  // another permission family than the screen itself": only view_dashboard
  // and view_reports, nothing from the vehicle/reservation/customer families
  // every other profile happens to also hold. Opens exactly "/" and
  // "/reports" (their own sidebar anyOf), which is precisely where the fact
  // sheet found unconditional queries guarded by a different family.
  "reports-only": [P.VIEW_DASHBOARD, P.VIEW_REPORTS],
  // 2026-09-21 review, item 6 — proves B-29's /communications split
  // end-to-end: the screen's own permission (manage_email_templates) opens
  // it, but the send controls stay behind manage_notifications, which this
  // profile deliberately does not hold.
  "templates-only": [P.VIEW_DASHBOARD, P.MANAGE_EMAIL_TEMPLATES],
  // B-29a — the other half: an account that may send notifications but not
  // manage templates, matching real accounts the owner confirmed exist.
  // Proves /communications now opens on manage_notifications alone, and
  // that template-management controls (not the send controls) are the ones
  // that stay visible-disabled-explained for this profile.
  "notifications-only": [P.VIEW_DASHBOARD, P.MANAGE_NOTIFICATIONS],
};

/** The rights of an account: a twin holds exactly what its profile holds. */
export const permissionsOf = (account: Account): string[] => PROFILES[profileOf(account)];

export const usernameOf = (account: Account) => `e2e-${account}`;
export const roleLabel: Record<Role, string> = {
  admin: UserRole.ADMIN, manager: UserRole.MANAGER, user: UserRole.USER, cleaner: UserRole.CLEANER,
  viewer: UserRole.VIEWER, accountant: UserRole.ACCOUNTANT, maintenance: UserRole.MAINTENANCE,
  // Same underlying role label as "viewer" — a role is only a label in this
  // application (server/middleware/permissions.ts); what differs is the
  // permissions array above. usernameOf keeps the two accounts distinct
  // (e2e-viewer vs e2e-reports-only).
  "reports-only": UserRole.VIEWER,
  // Same underlying role label as "user" (a role is only a label); the
  // permissions array above is what makes this profile "templates-only".
  "templates-only": UserRole.USER,
  // Same underlying role label as "user" (a role is only a label); the
  // permissions array above is what makes this profile "notifications-only".
  "notifications-only": UserRole.USER,
};
