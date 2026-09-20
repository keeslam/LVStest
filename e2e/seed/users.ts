import { UserPermission as P, UserRole } from "../../shared/schema";

// A role is only a label in this application; rights are an explicit list per
// user (server/middleware/permissions.ts; `admin` bypasses the list). These
// seven profiles are an assumption the E2E suite makes about what each role
// should be able to do — Task 9 puts that assumption in front of the owner.
export const ROLES = ["admin", "manager", "user", "cleaner", "viewer", "accountant", "maintenance"] as const;
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
};

export const usernameOf = (role: Role) => `e2e-${role}`;
export const roleLabel: Record<Role, string> = {
  admin: UserRole.ADMIN, manager: UserRole.MANAGER, user: UserRole.USER, cleaner: UserRole.CLEANER,
  viewer: UserRole.VIEWER, accountant: UserRole.ACCOUNTANT, maintenance: UserRole.MAINTENANCE,
};
