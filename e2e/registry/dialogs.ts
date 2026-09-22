import { UserPermission as P } from "../../shared/schema";

export interface DialogEntry {
  /** Page the opener is on. */
  page: string;
  /** data-testid of the control that opens the dialog. */
  opener: string;
  /**
   * Permissions the opener's own action needs (Task 3+: exactly the
   * permission(s) its `RequiresPermission` wrapper uses, which are exactly
   * the permission(s) the server route its action finally calls accepts). A
   * role without them either sees the opener visible-but-disabled (the B-27
   * house style — dialogs.spec.ts asserts that), or, if `hiddenWithoutRight`
   * is set, does not see it at all.
   */
  anyOf: string[];
  /**
   * True when the opener is hidden on purpose for a role without the right
   * (admin-only today: `menu-users`, `menu-backup`, `menu-settings`,
   * `button-open-recycle-bin`) rather than shown disabled — B-27 keeps these
   * exactly as they are. `anyOf: []` on such an entry means `can()` only
   * passes for admin (its own bypass), matching the real `isAdmin`/role gate.
   */
  hiddenWithoutRight?: boolean;
  /** Source file that renders the dialog root; this is what the coverage report counts. */
  source: string;
  name: string;
  /** data-testid of a menu trigger to click before `opener`, when the opener lives inside a dropdown menu. */
  via?: string;
  /** data-testid of a close/cancel control, when the dialog blocks Escape on purpose (a form guarding against losing input). */
  close?: string;
  /**
   * Set when the opener's OWN component state (a chosen vehicle/customer, a
   * chosen template, …) — not the permission `anyOf` proves — keeps it
   * disabled on a fresh page load, so a bare click can never open the dialog
   * for a role that DOES hold the permission. `dialogs.spec.ts` then skips
   * generating the allowed-branch test for this entry entirely (no test, no
   * skip in the report) and leaves that proof to a Layer B story that seeds
   * the record state first — the same division `LAYER_B_SOURCES` already
   * uses for dialogs that need a record in a certain state, just per-opener
   * instead of per-file, because the DENIED branch (RequiresPermission's own
   * tooltip, never a click) stays valid and worth keeping in this registry.
   * The value is the reason, so it lives in the registry, not only in a spec.
   */
  allowedPathNeedsState?: string;
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
  // for admin, matching the real gate; hiddenWithoutRight since B-27 keeps
  // admin-only controls hidden rather than showing them disabled.
  { page: "/", opener: "menu-users", via: "user-menu-button", anyOf: [], hiddenWithoutRight: true, source: "client/src/components/dialogs/users-dialog.tsx", name: "gebruikersbeheer" },
  { page: "/", opener: "menu-backup", via: "user-menu-button", anyOf: [], hiddenWithoutRight: true, source: "client/src/components/dialogs/backup-dialog.tsx", name: "back-upbeheer" },
  { page: "/", opener: "menu-settings", via: "user-menu-button", anyOf: [], hiddenWithoutRight: true, source: "client/src/components/settings/settings-dialog.tsx", name: "app-instellingen (heeft tabbladen, eenmalig geregistreerd)" },
  // Task 3 (docs/superpowers/specs/2026-09-21-toegang-design.md, §4): each
  // dashboard quick-action tile is now wrapped in RequiresPermission with
  // exactly the permission its own mutation route needs — anyOf here matches
  // that wrapper, not the page's own VIEW_DASHBOARD gate any more.
  { page: "/", opener: "button-quick-add-vehicle", anyOf: [P.MANAGE_VEHICLES], source: "client/src/components/dashboard/quick-actions.tsx", name: "snelle actie: voertuig toevoegen" },
  { page: "/", opener: "button-quick-add-customer", anyOf: [P.MANAGE_CUSTOMERS], source: "client/src/components/dashboard/quick-actions.tsx", name: "snelle actie: klant toevoegen" },
  { page: "/", opener: "button-quick-log-expense", anyOf: [P.MANAGE_EXPENSES], source: "client/src/components/dashboard/quick-actions.tsx", name: "snelle actie: uitgave registreren" },
  // The dialog root itself lives in reservation-add-dialog.tsx; the widget
  // file only supplies a custom trigger button as `children`, now wrapped in
  // RequiresPermission there too.
  { page: "/", opener: "button-dashboard-new-reservation", anyOf: [P.MANAGE_RESERVATIONS], source: "client/src/components/reservations/reservation-add-dialog.tsx", name: "dashboard: nieuwe reservering" },

  // --- /vehicles -------------------------------------------------------------
  // isAdmin-gated in vehicles/index.tsx (role === UserRole.ADMIN), not
  // MANAGE_VEHICLES (manager and maintenance also hold that permission but do
  // not see this button) — anyOf: [] so can() only passes for admin;
  // hiddenWithoutRight since B-27 keeps this hidden, not disabled.
  { page: "/vehicles", opener: "button-open-recycle-bin", anyOf: [], hiddenWithoutRight: true, source: "client/src/components/vehicles/deleted-vehicles-dialog.tsx", name: "prullenbak voertuigen" },
  { page: "/vehicles", opener: "button-open-barcode-book", anyOf: [P.VIEW_VEHICLES, P.MANAGE_VEHICLES], source: "client/src/components/barcodes/barcode-book-dialog.tsx", name: "barcodeboek" },
  { page: "/vehicles", opener: "button-key-audit", anyOf: [P.VIEW_VEHICLES, P.MANAGE_VEHICLES], source: "client/src/components/barcodes/key-audit-dialog.tsx", name: "sleutelcontrole (hoofdsleutels)" },
  // Task 3: both wrapped in RequiresPermission anyOf={[MANAGE_VEHICLES]} —
  // narrower than the page's own VIEW_VEHICLES/MANAGE_VEHICLES gate, matching
  // their POST /api/vehicles* mutation routes.
  { page: "/vehicles", opener: "button-add-vehicle", anyOf: [P.MANAGE_VEHICLES], source: "client/src/components/vehicles/vehicle-add-dialog.tsx", name: "voertuig toevoegen" },
  { page: "/vehicles", opener: "button-bulk-import", anyOf: [P.MANAGE_VEHICLES], source: "client/src/components/vehicles/vehicle-bulk-import-dialog.tsx", name: "voertuigen bulk-importeren" },

  // --- /reservations -------------------------------------------------------
  // Read-only openers (list/history/search-and-sort table, no mutation of
  // their own) — anyOf stays the page's own VIEW_RESERVATIONS/MANAGE_RESERVATIONS
  // gate, per §4 "a control whose dialog only READS is not disabled".
  { page: "/reservations", opener: "button-list-view", anyOf: [P.VIEW_RESERVATIONS, P.MANAGE_RESERVATIONS], source: "client/src/components/reservations/reservation-list-dialog.tsx", name: "reserveringen als lijst" },
  { page: "/reservations", opener: "button-view-completed", anyOf: [P.VIEW_RESERVATIONS, P.MANAGE_RESERVATIONS], source: "client/src/pages/reservations/calendar.tsx", name: "afgeronde verhuringen" },
  { page: "/reservations", opener: "button-administration", anyOf: [P.VIEW_RESERVATIONS, P.MANAGE_RESERVATIONS], source: "client/src/pages/reservations/calendar.tsx", name: "administratie" },
  // Task 4: wrapped in RequiresPermission anyOf={[MANAGE_RESERVATIONS]},
  // narrower than the page's own gate, matching POST /api/reservations
  // (routes.ts:2966, MANAGE_RESERVATIONS).
  { page: "/reservations", opener: "button-new-reservation", anyOf: [P.MANAGE_RESERVATIONS], source: "client/src/components/reservations/reservation-add-dialog.tsx", name: "nieuwe reservering" },

  // --- /maintenance --------------------------------------------------------
  // list-view and view-completed only open a read-only list/history — not
  // wrapped in RequiresPermission (§4: a control whose dialog only reads is
  // not disabled), anyOf stays the page's own MANAGE_MAINTENANCE gate.
  { page: "/maintenance", opener: "button-maintenance-list-view", anyOf: [P.MANAGE_MAINTENANCE], source: "client/src/components/maintenance/maintenance-list-dialog.tsx", name: "onderhoud als lijst" },
  { page: "/maintenance", opener: "button-view-completed", anyOf: [P.MANAGE_MAINTENANCE], source: "client/src/pages/maintenance/calendar.tsx", name: "afgerond onderhoud" },
  // Task 4 finding (docs/superpowers/specs/2026-09-21-toegang-design.md, §5):
  // ScheduleMaintenanceDialog's create-mode submit is POST /api/reservations
  // (MANAGE_RESERVATIONS only) — not MANAGE_MAINTENANCE, this page's own
  // access permission. Reported to the owner (task-4-report.md); the route is
  // not maintenance-exclusive, so it is not widened.
  { page: "/maintenance", opener: "button-schedule-maintenance", anyOf: [P.MANAGE_RESERVATIONS], source: "client/src/components/maintenance/schedule-maintenance-dialog.tsx", name: "onderhoud inplannen" },

  // --- /documents ----------------------------------------------------------
  // All four dialog roots are inline in documents/index.tsx itself, each
  // behind its own tab (default tab is "library"), so each needs `via`.
  // Task 4: each wrapped in RequiresPermission with exactly the permission
  // its editor's own save/delete routes need — narrower than the page's own
  // VIEW_DOCUMENTS/MANAGE_DOCUMENTS gate.
  { page: "/documents", opener: "button-open-template-editor", via: "tab-contract-templates", anyOf: [P.MANAGE_PDF_TEMPLATES], source: "client/src/pages/documents/index.tsx", name: "contractsjabloon-editor" },
  { page: "/documents", opener: "button-open-transport-template-editor", via: "tab-transport-templates", anyOf: [P.MANAGE_PDF_TEMPLATES], source: "client/src/pages/documents/index.tsx", name: "transportrapport-sjabloon-editor" },
  { page: "/documents", opener: "button-open-barcode-label-editor", via: "tab-barcode-labels", anyOf: [P.MANAGE_PDF_TEMPLATES], source: "client/src/pages/documents/index.tsx", name: "barcode-labelsjabloon-editor" },
  { page: "/documents", opener: "button-open-damage-check-studio", via: "tab-damage-check-templates", anyOf: [P.MANAGE_DAMAGE_CHECKS], source: "client/src/pages/documents/index.tsx", name: "schadecontrole-sjablonen-studio" },

  // --- /delivery -------------------------------------------------------------
  // Task 4: wrapped in RequiresPermission anyOf={[MANAGE_VEHICLES, MANAGE_RESERVATIONS]},
  // matching POST /api/transports (routes.ts:8084).
  { page: "/delivery", opener: "button-new-transport", anyOf: [P.MANAGE_VEHICLES, P.MANAGE_RESERVATIONS], source: "client/src/components/delivery/transport-dialog.tsx", name: "nieuw transport" },
  // Read-only (no mutation route) — not wrapped, anyOf unchanged.
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
  // Task 4: wrapped in RequiresPermission anyOf={[MANAGE_CUSTOMERS]}, matching
  // POST /api/customers (routes.ts:2469).
  { page: "/customers", opener: "button-add-customer", anyOf: [P.MANAGE_CUSTOMERS], source: "client/src/components/customers/customer-add-dialog.tsx", name: "klant toevoegen" },

  // --- /portal-admin -------------------------------------------------------
  // Only admin/manager hold VIEW_PORTAL/MANAGE_PORTAL among the seven E2E
  // profiles, so both roles that ever reach this page also satisfy each
  // button's own narrower gate (MANAGE_PORTAL, MANAGE_FINES, VIEW_FISCAL).
  { page: "/portal-admin", opener: "button-invite-portal-account", anyOf: [P.VIEW_PORTAL, P.MANAGE_PORTAL], source: "client/src/components/portal-admin/account-dialog.tsx", name: "portalaccount uitnodigen" },
  { page: "/portal-admin", opener: "button-fiscal-overview", anyOf: [P.VIEW_PORTAL, P.MANAGE_PORTAL], source: "client/src/components/fiscal/fiscal-overview-dialog.tsx", name: "fiscaal overzicht" },
  { page: "/portal-admin", opener: "button-import-fines", anyOf: [P.VIEW_PORTAL, P.MANAGE_PORTAL], source: "client/src/components/fines/fine-import-dialog.tsx", name: "boetes importeren" },

  { page: "/expenses", opener: "button-invoice-inbox", anyOf: [P.MANAGE_EXPENSES], source: "client/src/components/expenses/invoice-inbox-dialog.tsx", name: "ontvangen facturen" },

  // --- /communications ---------------------------------------------------
  // 2026-09-21 review, item 6 — B-29's other half: the screen itself opened
  // on MANAGE_EMAIL_TEMPLATES alone at the time (shared/page-access.ts),
  // these three "preview & send" buttons (one per send-mode sub-tab, all
  // three wrapped in RequiresPermission anyOf={[MANAGE_NOTIFICATIONS]}, all
  // three opening the same shared email-preview Dialog in this file)
  // separately need MANAGE_NOTIFICATIONS. The "send" outer tab and its "apk"
  // sub-tab are both the default, so button-preview-apk needs no `via`; the
  // other two sub-tabs do. Each Button is ALSO disabled by component state
  // (no vehicle/customer and no template chosen yet), independent of the
  // permission this registry proves — the DENIED branch (templates-only, the
  // profile added for this item) is unaffected by that, since
  // RequiresPermission's own tooltip is what it asserts, never a click.
  // `allowedPathNeedsState` below is what keeps the ALLOWED branch (a role
  // that already holds the permission — today admin/manager) out of this
  // registry's own test: the e2e seed creates no email_templates rows (the
  // template Select has zero options) and the vehicle-picker row carries no
  // data-testid, so there is no way to satisfy that state from Layer A. A
  // Layer B story that seeds a template and picks a vehicle first is where
  // that proof belongs.
  //
  // B-29a widened the row to MANAGE_NOTIFICATIONS OR MANAGE_EMAIL_TEMPLATES
  // (the owner confirmed accounts exist with the former but not the latter)
  // and added the "notifications-only" profile as this section's other half:
  // it holds MANAGE_NOTIFICATIONS only, so the three entries below stay
  // ALLOWED for it (RequiresPermission anyOf={[MANAGE_NOTIFICATIONS]}) and
  // are skipped by `allowedPathNeedsState`, same as for admin/manager. Every
  // control that mutates a template (new/save/duplicate/edit/delete, plus
  // the "edit" button inside the template-preview dialog) is now wrapped in
  // RequiresPermission anyOf={[MANAGE_EMAIL_TEMPLATES]} too
  // (client/src/pages/CustomerCommunications.tsx), proven by the component
  // test (client/src/pages/__tests__/customer-communications-query-permissions.test.tsx)
  // instead of here: none of them open a `[role="dialog"]` this registry's
  // own pattern can assert on — "new template"/"save template" are inline,
  // not a dialog, and the per-template card buttons (duplicate/edit/delete)
  // carry a `${template.id}`-suffixed testid with no seeded template to give
  // it a stable value (the e2e seed creates no email_templates rows, same
  // reason `allowedPathNeedsState` gives above), so none qualify for this
  // registry's "if they have stable test ids" bar.
  {
    page: "/communications", opener: "button-preview-apk", anyOf: [P.MANAGE_NOTIFICATIONS],
    source: "client/src/pages/CustomerCommunications.tsx", name: "e-mailvoorbeeld en verzenden: APK",
    allowedPathNeedsState: "needs a saved email template (none seeded) and a chosen vehicle (picker row has no data-testid) before the button leaves its own disabled state",
  },
  {
    page: "/communications", opener: "button-preview-maintenance", via: "tab-maintenance", anyOf: [P.MANAGE_NOTIFICATIONS],
    source: "client/src/pages/CustomerCommunications.tsx", name: "e-mailvoorbeeld en verzenden: onderhoud",
    allowedPathNeedsState: "needs a saved email template (none seeded) and a chosen vehicle (picker row has no data-testid) before the button leaves its own disabled state",
  },
  {
    page: "/communications", opener: "button-preview-custom", via: "tab-custom", anyOf: [P.MANAGE_NOTIFICATIONS],
    source: "client/src/pages/CustomerCommunications.tsx", name: "e-mailvoorbeeld en verzenden: aangepast bericht",
    allowedPathNeedsState: "needs a saved email template (none seeded) and a chosen customer/vehicle (picker row has no data-testid) before the button leaves its own disabled state",
  },
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
