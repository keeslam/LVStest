import { UserPermission as P, UserRole } from "../../shared/schema";

// A role is only a label in this application; rights are an explicit list per
// user (server/middleware/permissions.ts; `admin` bypasses the list). These
// nine profiles are an assumption the E2E suite makes about what each role
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
export const ROLES = ["admin", "manager", "user", "cleaner", "viewer", "accountant", "maintenance", "reports-only", "templates-only"] as const;
export type Role = (typeof ROLES)[number];

const ALL = Object.values(P) as string[];
const without = (...denied: string[]) => ALL.filter((permission) => !denied.includes(permission));

export const PROFILES: Record<Role, string[]> = {
  admin: ALL,
  manager: without(P.MANAGE_USERS, P.MANAGE_BACKUPS, P.MANAGE_SETTINGS),
  user: [P.VIEW_DASHBOARD, P.VIEW_VEHICLES, P.VIEW_CUSTOMERS, P.MANAGE_CUSTOMERS, P.VIEW_RESERVATIONS, P.MANAGE_RESERVATIONS,
    P.VIEW_DOCUMENTS, P.MANAGE_DOCUMENTS, P.VIEW_DAMAGE_CHECKS, P.MANAGE_DAMAGE_CHECKS, P.VIEW_FINES],
  cleaner: [P.VIEW_DASHBOARD, P.VIEW_VEHICLES, P.VIEW_RESERVATIONS],
  viewer: [P.VIEW_DASHBOARD, P.VIEW_VEHICLES, P.VIEW_CUSTOMERS, P.VIEW_RESERVATIONS, P.VIEW_DOCUMENTS, P.VIEW_DAMAGE_CHECKS, P.VIEW_REPORTS],
  accountant: [P.VIEW_DASHBOARD, P.VIEW_VEHICLES, P.VIEW_CUSTOMERS, P.VIEW_RESERVATIONS, P.MANAGE_EXPENSES, P.VIEW_DOCUMENTS,
    P.VIEW_REPORTS, P.MANAGE_REPORTS, P.VIEW_FINES, P.VIEW_FISCAL],
  maintenance: [P.VIEW_DASHBOARD, P.VIEW_VEHICLES, P.MANAGE_VEHICLES, P.MANAGE_MAINTENANCE, P.VIEW_RESERVATIONS,
    P.VIEW_DAMAGE_CHECKS, P.MANAGE_DAMAGE_CHECKS, P.VIEW_DOCUMENTS],
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
};

export const usernameOf = (role: Role) => `e2e-${role}`;
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
};
