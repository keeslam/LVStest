import { UserPermission as P } from "../../shared/schema";

export interface DialogEntry {
  /** Page the opener is on. */
  page: string;
  /** data-testid of the control that opens the dialog. */
  opener: string;
  /** Permissions that show the opener; roles without them are skipped. An empty array means the opener is gated by role (admin only) rather than a permission — `can()`'s admin bypass then decides it. */
  anyOf: string[];
  /** Source file that renders the dialog root; this is what the coverage report counts. */
  source: string;
  name: string;
  /** data-testid of a menu trigger to click before `opener`, when the opener lives inside a dropdown menu. */
  via?: string;
  /** data-testid of a close/cancel control, when the dialog blocks Escape on purpose (a form guarding against losing input). */
  close?: string;
}

export const DIALOGS: DialogEntry[] = [
  // --- Global (header/sidebar), registered once on "/" ---------------------
  // Rendered by MainLayout on every authenticated page; VIEW_DASHBOARD is the
  // permission every one of the seven E2E profiles holds, so this stands in
  // for "any signed-in user".
  { page: "/", opener: "button-notification-center", anyOf: [P.VIEW_DASHBOARD], source: "client/src/components/notifications/notification-center-dialog.tsx", name: "meldingencentrum" },
  { page: "/", opener: "menu-profile", via: "user-menu-button", anyOf: [P.VIEW_DASHBOARD], source: "client/src/components/dialogs/profile-dialog.tsx", name: "eigen profiel" },
  // users/backup/settings menu items only render for user.role === admin
  // (user-menu.tsx), not for a permission — anyOf: [] so can() only passes
  // for admin, matching the real gate.
  { page: "/", opener: "menu-users", via: "user-menu-button", anyOf: [], source: "client/src/components/dialogs/users-dialog.tsx", name: "gebruikersbeheer" },
  { page: "/", opener: "menu-backup", via: "user-menu-button", anyOf: [], source: "client/src/components/dialogs/backup-dialog.tsx", name: "back-upbeheer" },
  { page: "/", opener: "menu-settings", via: "user-menu-button", anyOf: [], source: "client/src/components/settings/settings-dialog.tsx", name: "app-instellingen (heeft tabbladen, eenmalig geregistreerd)" },
  // Dashboard "snelle acties": QuickActions renders every tile for anyone who
  // can see "/", with no per-action permission check of its own (see Findings
  // for the owner) — anyOf: [VIEW_DASHBOARD] reflects that reality.
  { page: "/", opener: "button-quick-add-vehicle", anyOf: [P.VIEW_DASHBOARD], source: "client/src/components/dashboard/quick-actions.tsx", name: "snelle actie: voertuig toevoegen" },
  { page: "/", opener: "button-quick-add-customer", anyOf: [P.VIEW_DASHBOARD], source: "client/src/components/dashboard/quick-actions.tsx", name: "snelle actie: klant toevoegen" },
  { page: "/", opener: "button-quick-log-expense", anyOf: [P.VIEW_DASHBOARD], source: "client/src/components/dashboard/quick-actions.tsx", name: "snelle actie: uitgave registreren" },
  // The dialog root itself lives in reservation-add-dialog.tsx; the widget
  // file only supplies a custom trigger button as `children`.
  { page: "/", opener: "button-dashboard-new-reservation", anyOf: [P.VIEW_DASHBOARD], source: "client/src/components/reservations/reservation-add-dialog.tsx", name: "dashboard: nieuwe reservering" },

  // --- /vehicles -------------------------------------------------------------
  // isAdmin-gated in vehicles/index.tsx (role === UserRole.ADMIN), not
  // MANAGE_VEHICLES (manager and maintenance also hold that permission but do
  // not see this button) — anyOf: [] so can() only passes for admin.
  { page: "/vehicles", opener: "button-open-recycle-bin", anyOf: [], source: "client/src/components/vehicles/deleted-vehicles-dialog.tsx", name: "prullenbak voertuigen" },
  { page: "/vehicles", opener: "button-open-barcode-book", anyOf: [P.VIEW_VEHICLES, P.MANAGE_VEHICLES], source: "client/src/components/barcodes/barcode-book-dialog.tsx", name: "barcodeboek" },
  { page: "/vehicles", opener: "button-key-audit", anyOf: [P.VIEW_VEHICLES, P.MANAGE_VEHICLES], source: "client/src/components/barcodes/key-audit-dialog.tsx", name: "sleutelcontrole (hoofdsleutels)" },
  { page: "/vehicles", opener: "button-add-vehicle", anyOf: [P.VIEW_VEHICLES, P.MANAGE_VEHICLES], source: "client/src/components/vehicles/vehicle-add-dialog.tsx", name: "voertuig toevoegen" },
  { page: "/vehicles", opener: "button-bulk-import", anyOf: [P.VIEW_VEHICLES, P.MANAGE_VEHICLES], source: "client/src/components/vehicles/vehicle-bulk-import-dialog.tsx", name: "voertuigen bulk-importeren" },

  // --- /reservations -------------------------------------------------------
  { page: "/reservations", opener: "button-list-view", anyOf: [P.VIEW_RESERVATIONS, P.MANAGE_RESERVATIONS], source: "client/src/components/reservations/reservation-list-dialog.tsx", name: "reserveringen als lijst" },
  { page: "/reservations", opener: "button-view-completed", anyOf: [P.VIEW_RESERVATIONS, P.MANAGE_RESERVATIONS], source: "client/src/pages/reservations/calendar.tsx", name: "afgeronde verhuringen" },
  { page: "/reservations", opener: "button-administration", anyOf: [P.VIEW_RESERVATIONS, P.MANAGE_RESERVATIONS], source: "client/src/pages/reservations/calendar.tsx", name: "administratie" },

  // --- /maintenance --------------------------------------------------------
  { page: "/maintenance", opener: "button-maintenance-list-view", anyOf: [P.MANAGE_MAINTENANCE], source: "client/src/components/maintenance/maintenance-list-dialog.tsx", name: "onderhoud als lijst" },
  { page: "/maintenance", opener: "button-view-completed", anyOf: [P.MANAGE_MAINTENANCE], source: "client/src/pages/maintenance/calendar.tsx", name: "afgerond onderhoud" },
  { page: "/maintenance", opener: "button-schedule-maintenance", anyOf: [P.MANAGE_MAINTENANCE], source: "client/src/components/maintenance/schedule-maintenance-dialog.tsx", name: "onderhoud inplannen" },

  // --- /documents ----------------------------------------------------------
  // All four dialog roots are inline in documents/index.tsx itself, each
  // behind its own tab (default tab is "library"), so each needs `via`.
  { page: "/documents", opener: "button-open-template-editor", via: "tab-contract-templates", anyOf: [P.VIEW_DOCUMENTS, P.MANAGE_DOCUMENTS], source: "client/src/pages/documents/index.tsx", name: "contractsjabloon-editor" },
  { page: "/documents", opener: "button-open-transport-template-editor", via: "tab-transport-templates", anyOf: [P.VIEW_DOCUMENTS, P.MANAGE_DOCUMENTS], source: "client/src/pages/documents/index.tsx", name: "transportrapport-sjabloon-editor" },
  { page: "/documents", opener: "button-open-barcode-label-editor", via: "tab-barcode-labels", anyOf: [P.VIEW_DOCUMENTS, P.MANAGE_DOCUMENTS], source: "client/src/pages/documents/index.tsx", name: "barcode-labelsjabloon-editor" },
  { page: "/documents", opener: "button-open-damage-check-studio", via: "tab-damage-check-templates", anyOf: [P.VIEW_DOCUMENTS, P.MANAGE_DOCUMENTS], source: "client/src/pages/documents/index.tsx", name: "schadecontrole-sjablonen-studio" },

  // --- /delivery -------------------------------------------------------------
  { page: "/delivery", opener: "button-new-transport", anyOf: [P.VIEW_RESERVATIONS, P.MANAGE_RESERVATIONS], source: "client/src/components/delivery/transport-dialog.tsx", name: "nieuw transport" },
  { page: "/delivery", opener: "button-route-optimization", anyOf: [P.VIEW_RESERVATIONS, P.MANAGE_RESERVATIONS], source: "client/src/components/delivery/route-optimization-dialog.tsx", name: "routeoptimalisatie" },

  // --- /reports --------------------------------------------------------------
  // Both dialog roots (the <Dialog open={reportBuilderOpen}>/<Dialog
  // open={maintenanceCostsOpen}> wrapping <ReportBuilderPage />/
  // <MaintenanceCostsPage /> as content) are inline in reports/index.tsx
  // itself, around lines 2556 and 2578 — NOT in report-builder.tsx or
  // maintenance-costs.tsx (fix round 1: those two were wrongly credited;
  // maintenance-costs.tsx has no dialog root at all, and report-builder.tsx's
  // own two other roots, save-report and results, were never opened by any
  // test).
  { page: "/reports", opener: "card-report-builder", anyOf: [P.VIEW_REPORTS, P.MANAGE_REPORTS], source: "client/src/pages/reports/index.tsx", name: "rapportenbouwer" },
  { page: "/reports", opener: "card-maintenance-costs", anyOf: [P.VIEW_REPORTS, P.MANAGE_REPORTS], source: "client/src/pages/reports/index.tsx", name: "onderhoudskosten" },

  // --- /customers --------------------------------------------------------
  { page: "/customers", opener: "button-add-customer", anyOf: [P.VIEW_CUSTOMERS, P.MANAGE_CUSTOMERS], source: "client/src/components/customers/customer-add-dialog.tsx", name: "klant toevoegen" },

  // --- /portal-admin -------------------------------------------------------
  // Only admin/manager hold VIEW_PORTAL/MANAGE_PORTAL among the seven E2E
  // profiles, so both roles that ever reach this page also satisfy each
  // button's own narrower gate (MANAGE_PORTAL, MANAGE_FINES, VIEW_FISCAL).
  { page: "/portal-admin", opener: "button-invite-portal-account", anyOf: [P.VIEW_PORTAL, P.MANAGE_PORTAL], source: "client/src/components/portal-admin/account-dialog.tsx", name: "portalaccount uitnodigen" },
  { page: "/portal-admin", opener: "button-fiscal-overview", anyOf: [P.VIEW_PORTAL, P.MANAGE_PORTAL], source: "client/src/components/fiscal/fiscal-overview-dialog.tsx", name: "fiscaal overzicht" },
  { page: "/portal-admin", opener: "button-import-fines", anyOf: [P.VIEW_PORTAL, P.MANAGE_PORTAL], source: "client/src/components/fines/fine-import-dialog.tsx", name: "boetes importeren" },

  { page: "/expenses", opener: "button-invoice-inbox", anyOf: [P.MANAGE_EXPENSES], source: "client/src/components/expenses/invoice-inbox-dialog.tsx", name: "ontvangen facturen" },
];

/**
 * Dialogs that need a record in a certain state; a Layer B story opens them.
 * (Task 8: the desk story picks up and returns a seeded/newly-created
 * reservation, and dismisses the "handover" dialog both hand back.)
 */
export const LAYER_B_SOURCES: string[] = [
  "client/src/components/reservations/pickup-return-dialogs.tsx",
  "client/src/components/reservations/handover-result-dialog.tsx",
  // Opened by e2e/layer-b/settings/invoice-inbox-log.spec.ts.
  "client/src/components/expenses/invoice-inbox-log-dialog.tsx",
];
