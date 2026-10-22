import { UserPermission as P, UserRole } from "./schema";
import { isAdminOnlyRight } from "./permission-dependencies";

const ALL = Object.values(P) as string[];
const without = (...denied: string[]) => ALL.filter((permission) => !denied.includes(permission));

/**
 * B-65: the rights a role starts with when an account is made. A role is still only a label
 * (rights are an explicit list per user; admin passes every check). These are the profiles the
 * E2E suite has assumed per role since 2026-09-20 (e2e/seed/users.ts), approved by Kees on
 * 2026-10-22. They pre-fill the form only; no existing account is ever changed by them.
 */
export const ROLE_PRESETS: Record<(typeof UserRole)[keyof typeof UserRole], string[]> = {
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

/**
 * The rights to tick for a role in the user form. A right only an administrator can use is
 * left off for any other role, the same way the form keeps its checkbox off.
 */
export function presetRightsFor(role: string): string[] {
  const preset = ROLE_PRESETS[role as keyof typeof ROLE_PRESETS] ?? [];
  return role === UserRole.ADMIN ? [...preset] : preset.filter((right) => !isAdminOnlyRight(right));
}
