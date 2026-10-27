import { UserPermission as P } from "./schema";

/**
 * D13 (besluit B-41, docs/superpowers/specs/2026-10-11-besluiten-d-design.md
 * section 9): which other rights a right needs before the screen it opens shows
 * real data. Without them the account can open the screen but the lists behind
 * it come back empty or show "Je hebt het recht ... niet" (NoDataAccess).
 *
 * - `required`: the screen's main data comes from these reads. The users dialog
 *   shows "Heeft nodig: ..." with a warning when they are not ticked, and its
 *   button "Benodigde rechten ook aanzetten" ticks them.
 * - `optional`: a part of the screen (a badge, a filter, one tab) needs them;
 *   shown as a hint only, never ticked for you.
 * - `adminOnly`: the right opens something that only exists for role `admin`
 *   in the app (the users, settings and backup dialogs). The server still
 *   accepts the right for anyone, so this is a label and a disabled checkbox,
 *   not a guard.
 *
 * Nothing here is applied automatically: the table informs, a person decides.
 * Sources: the `useHasPermission` gates and `NoDataAccess` sites of the client
 * (facts-rechten-tijdzone-fiscaal.md, D13); shared/permission-dependencies.test.ts
 * ties every PAGE_ACCESS screen and every NoDataAccess site to a rule here.
 */
export interface PermissionDependency {
  required: readonly string[];
  optional: readonly string[];
  adminOnly?: boolean;
}

const NONE: readonly string[] = [];

export const PERMISSION_DEPENDENCIES: Record<string, PermissionDependency> = {
  // Only role admin can open the dialogs these three rights name (user-menu.tsx).
  [P.MANAGE_USERS]: { required: NONE, optional: NONE, adminOnly: true },
  [P.MANAGE_SETTINGS]: { required: NONE, optional: NONE, adminOnly: true },
  [P.MANAGE_BACKUPS]: { required: NONE, optional: NONE, adminOnly: true },

  // The dashboard widgets read vehicles and reservations; customers and
  // expenses feed single widgets (spare vehicles, recent expenses).
  [P.VIEW_DASHBOARD]: { required: [P.VIEW_VEHICLES, P.VIEW_RESERVATIONS], optional: [P.VIEW_CUSTOMERS, P.MANAGE_EXPENSES] },

  // Vehicles: the rental badge reads reservations; the delivery screen, which
  // vehicles also opens, reads customers for its transports.
  [P.VIEW_VEHICLES]: { required: NONE, optional: [P.VIEW_RESERVATIONS, P.VIEW_CUSTOMERS] },
  [P.MANAGE_VEHICLES]: { required: NONE, optional: [P.VIEW_RESERVATIONS, P.VIEW_CUSTOMERS] },

  [P.VIEW_CUSTOMERS]: { required: NONE, optional: [P.VIEW_RESERVATIONS] },
  [P.MANAGE_CUSTOMERS]: { required: NONE, optional: [P.VIEW_RESERVATIONS] },

  // Reservations: the calendar filters on vehicles and the Administratie dialog
  // reads damage checks; creating one needs the customer picker.
  [P.VIEW_RESERVATIONS]: { required: NONE, optional: [P.VIEW_VEHICLES, P.VIEW_CUSTOMERS, P.VIEW_DAMAGE_CHECKS] },
  [P.MANAGE_RESERVATIONS]: { required: [P.VIEW_CUSTOMERS], optional: [P.VIEW_VEHICLES, P.VIEW_DAMAGE_CHECKS] },
  [P.AUTHORIZE_MILEAGE_DECREASE]: { required: [P.VIEW_RESERVATIONS], optional: NONE },
  [P.REVERT_HANDOVER]: { required: [P.VIEW_RESERVATIONS], optional: NONE },
  // Cancelling a picked-up rental needs MANAGE_RESERVATIONS AND this right.
  [P.CANCEL_PICKED_UP_RENTAL]: { required: [P.MANAGE_RESERVATIONS], optional: NONE },
  // One bin per screen: the bin opens on the vehicle, customer, reservation,
  // maintenance and fines screens, each of which needs its own right.
  [P.MANAGE_RECYCLE_BIN]: {
    required: NONE,
    optional: [P.VIEW_VEHICLES, P.VIEW_CUSTOMERS, P.VIEW_RESERVATIONS, P.MANAGE_MAINTENANCE, P.VIEW_FINES],
  },

  [P.MANAGE_MAINTENANCE]: { required: [P.VIEW_VEHICLES, P.VIEW_RESERVATIONS], optional: [P.VIEW_CUSTOMERS] },
  // The expense form picks a vehicle.
  [P.MANAGE_EXPENSES]: { required: [P.VIEW_VEHICLES], optional: NONE },

  [P.VIEW_DOCUMENTS]: { required: NONE, optional: [P.VIEW_VEHICLES] },
  [P.MANAGE_DOCUMENTS]: { required: NONE, optional: [P.VIEW_VEHICLES] },
  // Templates are edited from the documents screen.
  [P.MANAGE_PDF_TEMPLATES]: { required: [P.VIEW_DOCUMENTS], optional: NONE },
  // Lease quotes have a screen of their own and read their own data; the right stands alone.
  [P.MANAGE_LEASE_QUOTES]: { required: NONE, optional: NONE },

  [P.VIEW_DAMAGE_CHECKS]: { required: NONE, optional: [P.VIEW_RESERVATIONS] },
  [P.MANAGE_DAMAGE_CHECKS]: { required: NONE, optional: [P.VIEW_RESERVATIONS] },

  // Reports: every tab reads its own data (operations: vehicles + reservations;
  // vehicles; customers; transports; expenses; fiscal), so a missing right empties
  // one tab, not the screen.
  [P.VIEW_REPORTS]: { required: NONE, optional: [P.VIEW_VEHICLES, P.VIEW_RESERVATIONS, P.VIEW_CUSTOMERS, P.MANAGE_EXPENSES, P.VIEW_FISCAL] },
  [P.MANAGE_REPORTS]: { required: NONE, optional: [P.VIEW_VEHICLES, P.VIEW_RESERVATIONS, P.VIEW_CUSTOMERS, P.MANAGE_EXPENSES, P.VIEW_FISCAL] },

  // /communications reads customers and vehicles; templates and the log have their own right.
  [P.MANAGE_NOTIFICATIONS]: { required: [P.VIEW_CUSTOMERS, P.VIEW_VEHICLES], optional: [P.MANAGE_EMAIL_TEMPLATES] },
  [P.MANAGE_EMAIL_TEMPLATES]: { required: NONE, optional: NONE },

  [P.VIEW_PORTAL]: { required: NONE, optional: NONE },
  [P.MANAGE_PORTAL]: { required: NONE, optional: NONE },

  // Linking a fine to a customer lists customers.
  [P.VIEW_FINES]: { required: NONE, optional: NONE },
  [P.MANAGE_FINES]: { required: NONE, optional: [P.VIEW_CUSTOMERS] },

  // Fiscal: the configuration and review screens read the fiscal data.
  [P.VIEW_FISCAL]: { required: NONE, optional: NONE },
  [P.MANAGE_FISCAL_REVIEW]: { required: [P.VIEW_FISCAL], optional: [P.VIEW_CUSTOMERS] },
  [P.MANAGE_FISCAL_CONFIGURATION]: { required: [P.VIEW_FISCAL], optional: NONE },
  [P.APPROVE_FISCAL_CONFIGURATION]: { required: [P.VIEW_FISCAL], optional: NONE },
  [P.PUBLISH_FISCAL_CONFIGURATION]: { required: [P.VIEW_FISCAL], optional: NONE },
  [P.VIEW_FISCAL_AUDIT_LOG]: { required: NONE, optional: NONE },
};

export const ADMIN_ONLY_RIGHTS: readonly string[] = Object.entries(PERMISSION_DEPENDENCIES)
  .filter(([, dependency]) => dependency.adminOnly)
  .map(([right]) => right);

export function isAdminOnlyRight(right: string): boolean {
  return PERMISSION_DEPENDENCIES[right]?.adminOnly === true;
}

/**
 * The server and the client both open a read for the view right OR the manage
 * right of the same family (`hasPermission(VIEW_X, MANAGE_X)`, `useHasPermission
 * (VIEW_X, MANAGE_X)`), so holding the manage right already satisfies a need for
 * the view right. Rights that are not listed here count only as themselves.
 */
const READ_SATISFIED_BY: Record<string, readonly string[]> = {
  [P.VIEW_VEHICLES]: [P.VIEW_VEHICLES, P.MANAGE_VEHICLES],
  [P.VIEW_CUSTOMERS]: [P.VIEW_CUSTOMERS, P.MANAGE_CUSTOMERS],
  [P.VIEW_RESERVATIONS]: [P.VIEW_RESERVATIONS, P.MANAGE_RESERVATIONS],
  [P.VIEW_DOCUMENTS]: [P.VIEW_DOCUMENTS, P.MANAGE_DOCUMENTS],
  [P.VIEW_DAMAGE_CHECKS]: [P.VIEW_DAMAGE_CHECKS, P.MANAGE_DAMAGE_CHECKS],
  [P.VIEW_REPORTS]: [P.VIEW_REPORTS, P.MANAGE_REPORTS],
  [P.VIEW_FINES]: [P.VIEW_FINES, P.MANAGE_FINES],
  [P.VIEW_PORTAL]: [P.VIEW_PORTAL, P.MANAGE_PORTAL],
};

/** True when `held` covers the `needed` right (itself, or its manage twin). */
export function satisfiesDependency(held: readonly string[], needed: string): boolean {
  const accepted = READ_SATISFIED_BY[needed] ?? [needed];
  return accepted.some((right) => held.includes(right));
}

export function missingRequired(right: string, held: readonly string[]): string[] {
  return (PERMISSION_DEPENDENCIES[right]?.required ?? NONE).filter((needed) => !satisfiesDependency(held, needed));
}

export function missingOptional(right: string, held: readonly string[]): string[] {
  return (PERMISSION_DEPENDENCIES[right]?.optional ?? NONE).filter((needed) => !satisfiesDependency(held, needed));
}

/**
 * What the button "Benodigde rechten ook aanzetten" does: `ticked` plus every
 * missing required right of every ticked right, repeated until nothing is left
 * to add (a required right can need another). Optional rights are never added.
 * Returns a new list; order is the original ticks first, then the additions.
 */
export function enableRequiredRights(ticked: readonly string[]): string[] {
  const result = [...ticked];
  for (let round = 0; round < Object.keys(PERMISSION_DEPENDENCIES).length; round += 1) {
    const additions: string[] = [];
    for (const right of result) {
      for (const needed of missingRequired(right, result)) {
        if (!additions.includes(needed)) additions.push(needed);
      }
    }
    if (additions.length === 0) break;
    result.push(...additions);
  }
  return result;
}
