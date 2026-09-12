/**
 * Dutch labels for the permission checkboxes in the admin panel.
 *
 * besluit B-23 asked for "extra vinkje in admin panel of dit ook
 * bekeken/bewerkt mag worden". Two raw keys — `view_documents` and
 * `manage_documents` — next to each other in a grid of twenty-odd other raw
 * keys is not a readable answer to that, so the user-management screen renders
 * these labels instead. Anything without an entry falls back to its raw key,
 * so adding a permission can never blank out a checkbox.
 */
import { UserPermission } from "./schema";

export const PERMISSION_LABELS: Record<string, string> = {
  [UserPermission.MANAGE_USERS]: "Gebruikers beheren",

  [UserPermission.MANAGE_VEHICLES]: "Voertuigen beheren",
  [UserPermission.VIEW_VEHICLES]: "Voertuigen bekijken",

  [UserPermission.MANAGE_CUSTOMERS]: "Klanten beheren",
  [UserPermission.VIEW_CUSTOMERS]: "Klanten bekijken",

  [UserPermission.MANAGE_RESERVATIONS]: "Reserveringen beheren",
  [UserPermission.VIEW_RESERVATIONS]: "Reserveringen bekijken",
  [UserPermission.AUTHORIZE_MILEAGE_DECREASE]: "Kilometerverlaging goedkeuren",

  [UserPermission.MANAGE_MAINTENANCE]: "Onderhoud beheren",
  [UserPermission.MANAGE_EXPENSES]: "Kosten beheren",

  // B-23 — the two checkboxes this wave is about.
  [UserPermission.VIEW_DOCUMENTS]: "Documenten bekijken",
  [UserPermission.MANAGE_DOCUMENTS]: "Documenten bewerken en genereren",
  [UserPermission.MANAGE_PDF_TEMPLATES]: "PDF-sjablonen beheren",

  [UserPermission.MANAGE_DAMAGE_CHECKS]: "Schadecontroles beheren",
  [UserPermission.VIEW_DAMAGE_CHECKS]: "Schadecontroles bekijken",

  [UserPermission.MANAGE_REPORTS]: "Rapporten beheren",
  [UserPermission.VIEW_REPORTS]: "Rapporten bekijken",

  [UserPermission.MANAGE_BACKUPS]: "Back-ups beheren",
  [UserPermission.MANAGE_SETTINGS]: "Instellingen beheren",
  [UserPermission.MANAGE_EMAIL_TEMPLATES]: "E-mailsjablonen beheren",
  [UserPermission.MANAGE_NOTIFICATIONS]: "Meldingen beheren",

  [UserPermission.MANAGE_PORTAL]: "Klantportaal beheren",
  [UserPermission.VIEW_PORTAL]: "Klantportaal bekijken",

  [UserPermission.MANAGE_FINES]: "Boetes beheren",
  [UserPermission.VIEW_FINES]: "Boetes bekijken",

  [UserPermission.VIEW_DASHBOARD]: "Dashboard bekijken",
};

export function permissionLabel(permission: string): string {
  return PERMISSION_LABELS[permission] ?? permission;
}
