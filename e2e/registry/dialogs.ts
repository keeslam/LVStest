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
   * (admin-only today: `menu-users`, `menu-backup`, `menu-settings`) rather
   * than shown disabled — B-27 keeps these exactly as they are. `anyOf: []` on such an entry means `can()` only
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
  /**
   * The mirror image, for an opener that does not exist on the page until a
   * record in a certain state has been opened: the DENIED branch of
   * `dialogs.spec.ts` finds its opener by test id on a bare page load and
   * expects it visible, disabled and explaining itself, which cannot be true
   * for a control that only appears inside a dialog opened FROM a record
   * (a reservation's detail dialog). `dialogs.spec.ts` then generates no
   * denied-branch test for this entry; the same proof (visible, disabled,
   * names the right) belongs to a Layer B story or a component test that
   * opens the record first. The value is the reason, so it lives here.
   */
  deniedPathNeedsState?: string;
  /**
   * When the control a role without the right sees visible-disabled-explained is NOT the opener but
   * the thing in front of it (the /documents tabs: the tab itself is gated, so the opener behind it
   * is never reachable for that role). The denied branch then checks this control, by the same
   * assertions (visible, aria-disabled, tooltip names the right, a click opens nothing), and does not
   * try to click `via` first. The allowed branch is unchanged.
   */
  deniedOpener?: string;
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
  // Sub-project C (besluiten B-36, B-38, B-39): one recycle bin per screen, all of
  // them the same kind-aware dialog (recycle-bin-dialog.tsx), every opener wrapped
  // in RequiresPermission anyOf={[MANAGE_RECYCLE_BIN]} - the right the bin routes
  // need (admin passes by role, manager holds it). It used to be hidden behind
  // role === ADMIN; now a profile without the right sees it greyed out, naming
  // the right. The dialog opens empty for a profile with the right (the e2e seed
  // holds no deleted rows), which is a complete state of the dialog, so none of
  // the six entries needs allowedPathNeedsState. The five entries after this one
  // sit on their own screens (customers, reservations, maintenance, delivery,
  // portal-admin); restore, purge and the purge confirmation are proven by the tail
  // spec e2e/layer-b-tail/recycle-bin/bins.spec.ts (Task 7).
  { page: "/vehicles", opener: "button-open-recycle-bin", anyOf: [P.MANAGE_RECYCLE_BIN], source: "client/src/components/recycle-bin/recycle-bin-dialog.tsx", name: "prullenbak voertuigen" },
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
  // besluiten B-32 aanvulling (2026-09-23) — like button-view-overdue right
  // next to it, this opener only renders once the list it counts is
  // non-empty (calendar.tsx), which is component state this suite's own
  // seed never produces (no seeded row is a never-collected booking 30+
  // days old). allowedPathNeedsState skips the allowed-branch click for a
  // role that already holds the permission; the DENIED branch (a role
  // without either right cannot even open /reservations) never applied to
  // this opener either, same as button-view-completed/button-administration
  // above. The actual open/auto-open/cancel behaviour is proven by
  // e2e/layer-b-tail/reservations/past-reservation.spec.ts, which seeds the
  // row itself.
  {
    page: "/reservations", opener: "button-view-not-collected", anyOf: [P.VIEW_RESERVATIONS, P.MANAGE_RESERVATIONS],
    source: "client/src/components/reservations/not-collected-dialog.tsx", name: "niet opgehaalde reserveringen",
    allowedPathNeedsState: "needs a booked reservation started 30+ days ago that was never picked up (none seeded) before the toolbar button leaves its own hidden state",
  },
  // Sub-project C, Task 4 (besluiten B-30, B-39): every reversal - undo a
  // pickup, a return or a cancellation - goes through ONE dialog with a
  // preview and a confirm (revert-handover-dialog.tsx). Its openers are
  // wrapped in RequiresPermission anyOf={[REVERT_HANDOVER]}, the right
  // GET /api/reservations/:id/revert-preview and POST .../revert need:
  // the calendar's reservation detail dialog (`button-revert-handover`, the
  // one registered here), the hover card, the completed-rentals list, the
  // reservation list rows, the dashboard and the vehicle details.
  // Every one of them sits on a record (a picked-up, completed or cancelled
  // reservation) that a bare page load of /reservations does not show, so
  // neither branch of dialogs.spec.ts can reach it from here:
  //  - allowed: the Layer B story "Overdracht terugdraaien" in
  //    e2e/layer-b/desk/edge-cases.spec.ts opens the reservation, picks it up
  //    and undoes it, as `manager`;
  //  - denied: the same file's "zonder recht" story opens the list as the
  //    desk role and reads the disabled opener and its tooltip;
  //    client/src/components/reservations/__tests__/reservation-quick-status-button.test.tsx
  //    and client/src/components/vehicles/__tests__/quick-status-change-button.test.tsx
  //    prove it per component.
  {
    page: "/reservations", opener: "button-revert-handover", anyOf: [P.REVERT_HANDOVER],
    source: "client/src/components/reservations/revert-handover-dialog.tsx", name: "overdracht terugdraaien",
    allowedPathNeedsState: "the opener sits in the detail dialog of a picked-up, completed or cancelled reservation, which has to be opened (and picked up) first; the Layer B story does that",
    deniedPathNeedsState: "the opener does not exist on a bare load of /reservations: it only renders inside the detail dialog of a reservation, so there is nothing to find until a record is opened",
  },
  // Sub-project C, Task 5 (besluiten B-33, B-39): cancelling or deleting a rental
  // that has been PICKED UP needs the new right `cancel_picked_up_rental` on top
  // of `manage_reservations` and a confirmed warning ("Deze huur is al opgehaald
  // op <datum> met contract <nr>."). The openers - `button-cancel-reservation`
  // and `button-delete-reservation` in the reservation view dialog, the delete
  // buttons in the list, the calendar's detail card and day dialog, the completed
  // list and the customer and vehicle details - are wrapped in RequiresPermission
  // with `allOf={cancelRightFor(row)}`: manage_reservations plus the new right
  // for a picked-up row, `manage_reservations` for every other row (the routes'
  // own guards). The one
  // registered here is the cancel dialog's opener, the only one of them that opens
  // a dialog with a root of its own (the delete confirmations are the shared
  // ConfirmDialog from ui/). Like the revert opener it sits inside a record's view
  // dialog, so neither branch of dialogs.spec.ts can reach it from a bare page load:
  //  - allowed: the Layer B story "Opgehaalde huur annuleren" in
  //    e2e/layer-b/desk/edge-cases.spec.ts opens an overdue picked-up rental from
  //    the dashboard as `manager`, reads the warning, ticks the box and cancels;
  //  - denied: the same file's "zonder recht" story reads the disabled delete
  //    openers (list row, calendar detail card) of a picked-up row as the desk role
  //    (`user`) and their tooltips; the view dialog's two openers are proven by
  //    client/src/components/reservations/__tests__/reservation-view-dialog-permissions.test.tsx.
  {
    page: "/reservations", opener: "button-cancel-reservation", anyOf: [P.CANCEL_PICKED_UP_RENTAL],
    source: "client/src/components/reservations/cancel-reservation-dialog.tsx", name: "opgehaalde huur annuleren",
    allowedPathNeedsState: "the opener sits in the detail dialog of a reservation, which has to be opened (and picked up) first; the Layer B story does that",
    deniedPathNeedsState: "the opener does not exist on a bare load of /reservations: it only renders inside the detail dialog of a reservation, so there is nothing to find until a record is opened",
  },
  // Task 4: wrapped in RequiresPermission anyOf={[MANAGE_RESERVATIONS]},
  // narrower than the page's own gate, matching POST /api/reservations
  // (routes.ts:2966, MANAGE_RESERVATIONS).
  { page: "/reservations", opener: "button-new-reservation", anyOf: [P.MANAGE_RESERVATIONS], source: "client/src/components/reservations/reservation-add-dialog.tsx", name: "nieuwe reservering" },
  { page: "/reservations", opener: "button-open-recycle-bin-reservations", anyOf: [P.MANAGE_RECYCLE_BIN], source: "client/src/components/recycle-bin/recycle-bin-dialog.tsx", name: "prullenbak reserveringen" },

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
  { page: "/maintenance", opener: "button-open-recycle-bin-maintenance", anyOf: [P.MANAGE_RECYCLE_BIN], source: "client/src/components/recycle-bin/recycle-bin-dialog.tsx", name: "prullenbak onderhoud" },
  // Sub-project C, Task 8 (B-37): "Onderhoud afronden" in ONE request - closes the
  // block and takes the APK date, the odometer reading and the APK file with it
  // (client/src/components/maintenance/complete-maintenance-dialog.tsx). The opener
  // is the green "Afronden" button on an event card of the day dialog, test id
  // `button-complete-scheduled_maintenance_<reservationId>`, wrapped in
  // RequiresPermission anyOf={[MANAGE_MAINTENANCE, MANAGE_RESERVATIONS]} (the
  // endpoint's own guard). It exists only for an open block on the calendar, behind
  // a click on the day it falls on, and the e2e seed holds no maintenance block - so
  // neither branch of dialogs.spec.ts can reach it from a bare page load. The proof
  // is the Layer B story e2e/layer-b/maintenance/complete-maintenance.spec.ts, which
  // plans a block (through the API of admin-b), opens it as the `maintenance` profile
  // - which holds manage_maintenance but not manage_documents: the dialog calls neither
  // /api/documents nor /api/vehicles any more - and completes it with an APK date, a
  // reading and a PDF; the submit button is checked per right by
  // client/src/components/maintenance/__tests__/complete-maintenance-dialog.test.tsx.
  {
    page: "/maintenance", opener: "button-complete-scheduled_maintenance_<reservationId>", anyOf: [P.MANAGE_MAINTENANCE, P.MANAGE_RESERVATIONS],
    source: "client/src/components/maintenance/complete-maintenance-dialog.tsx", name: "onderhoud afronden",
    allowedPathNeedsState: "the opener exists only on the event card of an open maintenance block inside the calendar's day dialog (the e2e seed holds no block); the Layer B story complete-maintenance.spec.ts plans one and completes it",
    deniedPathNeedsState: "the opener does not exist on a bare load of /maintenance: it only renders for a block, inside the day dialog of a day that has one; the dialog's submit button per right is proven by complete-maintenance-dialog.test.tsx",
  },
  // Audit A-7-11 (package P4): the same dialog opens from the "Onderhoudsoverzicht"
  // list too - the green "Afronden" button on every open row of the "Gepland" tab,
  // test id `button-list-complete-<reservationId>`, same RequiresPermission as the
  // calendar's button. It needs a planned block (the e2e seed holds none) inside the
  // list dialog. A role without manage_maintenance cannot open the list at all: /maintenance
  // itself needs that right (shared/page-access.ts), so the opener of the list never mounts
  // for it, and a role that can open it holds the right the button asks for. The per-right
  // proof (the button disabled and explained for a profile with neither right, as a
  // component test can mount the dialog directly) is
  // client/src/components/maintenance/__tests__/p4-maintenance-list-actions.test.tsx.
  // "Binnen melden" next to it is a direct action (PATCH /api/vehicles/:id/maintenance-status),
  // not a dialog, so it has no entry of its own.
  {
    page: "/maintenance", opener: "button-list-complete-<reservationId>", via: "button-maintenance-list-view", anyOf: [P.MANAGE_MAINTENANCE, P.MANAGE_RESERVATIONS],
    source: "client/src/components/maintenance/complete-maintenance-dialog.tsx", name: "onderhoud afronden vanuit het overzicht",
    allowedPathNeedsState: "the opener exists only on the row of an open maintenance block in the Gepland tab of the overview (the e2e seed holds no block); the jsdom test p4-maintenance-list-actions.test.tsx plans one and opens the dialog",
    deniedPathNeedsState: "the opener does not exist on a bare load of /maintenance: it only renders for a block, inside the overview's Gepland tab; its disabled-and-explained state per right is proven by p4-maintenance-list-actions.test.tsx",
  },

  // --- /documents ----------------------------------------------------------
  // All four dialog roots are inline in documents/index.tsx itself, each
  // behind its own tab (default tab is "library"), so each needs `via`.
  // Task 4: each wrapped in RequiresPermission with exactly the permission
  // its editor's own save/delete routes need — narrower than the page's own
  // VIEW_DOCUMENTS/MANAGE_DOCUMENTS gate.
  // A-18-1 (commit 7c52b21a): the contract and transport tabs are gated themselves (RequiresPermission
  // around the TabsTrigger), so without manage_pdf_templates the tab is the visible-disabled-explained
  // control and the editor button behind it cannot be reached: `deniedOpener` is that tab.
  { page: "/documents", opener: "button-open-template-editor", via: "tab-contract-templates", deniedOpener: "tab-contract-templates", anyOf: [P.MANAGE_PDF_TEMPLATES], source: "client/src/pages/documents/index.tsx", name: "contractsjabloon-editor" },
  { page: "/documents", opener: "button-open-transport-template-editor", via: "tab-transport-templates", deniedOpener: "tab-transport-templates", anyOf: [P.MANAGE_PDF_TEMPLATES], source: "client/src/pages/documents/index.tsx", name: "transportrapport-sjabloon-editor" },
  { page: "/documents", opener: "button-open-barcode-label-editor", via: "tab-barcode-labels", anyOf: [P.MANAGE_PDF_TEMPLATES], source: "client/src/pages/documents/index.tsx", name: "barcode-labelsjabloon-editor" },
  { page: "/documents", opener: "button-open-damage-check-studio", via: "tab-damage-check-templates", anyOf: [P.MANAGE_DAMAGE_CHECKS], source: "client/src/pages/documents/index.tsx", name: "schadecontrole-sjablonen-studio" },

  // --- /delivery -------------------------------------------------------------
  // Task 4: wrapped in RequiresPermission anyOf={[MANAGE_VEHICLES, MANAGE_RESERVATIONS]},
  // matching POST /api/transports (routes.ts:8084).
  { page: "/delivery", opener: "button-new-transport", anyOf: [P.MANAGE_VEHICLES, P.MANAGE_RESERVATIONS], source: "client/src/components/delivery/transport-dialog.tsx", name: "nieuw transport" },
  // Read-only (no mutation route) — not wrapped, anyOf unchanged.
  { page: "/delivery", opener: "button-route-optimization", anyOf: [P.VIEW_RESERVATIONS, P.MANAGE_RESERVATIONS], source: "client/src/components/delivery/route-optimization-dialog.tsx", name: "routeoptimalisatie" },
  { page: "/delivery", opener: "button-open-recycle-bin-transports", anyOf: [P.MANAGE_RECYCLE_BIN], source: "client/src/components/recycle-bin/recycle-bin-dialog.tsx", name: "prullenbak transporten" },

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
  // The confirmation behind the trash button of a saved report (report-builder.tsx, A-9 / P7a). The opener
  // is the row of a saved report in the builder dialog's saved tab (`button-delete-report-<id>`), and the e2e
  // seed holds no saved report; both branches would otherwise look for a control that is not there. The jsdom
  // test p7a-saved-reports-print.test.tsx opens it and cancels and confirms.
  {
    page: "/reports", opener: "button-delete-report-<id>", via: "card-report-builder", anyOf: [P.MANAGE_REPORTS],
    source: "client/src/pages/reports/report-builder.tsx", name: "opgeslagen rapport verwijderen (bevestiging)",
    allowedPathNeedsState: "needs a saved report (none seeded): the opener is the trash button on a row of the saved tab inside the report builder dialog; confirm-delete-saved-report is covered by p7a-saved-reports-print.test.tsx",
    deniedPathNeedsState: "needs a saved report (none seeded): without one the saved tab has no row and so no trash button to find disabled",
  },
  { page: "/reports", opener: "card-maintenance-costs", anyOf: [P.VIEW_REPORTS, P.MANAGE_REPORTS], source: "client/src/pages/reports/index.tsx", name: "onderhoudskosten" },

  // --- /customers --------------------------------------------------------
  // Task 4: wrapped in RequiresPermission anyOf={[MANAGE_CUSTOMERS]}, matching
  // POST /api/customers (routes.ts:2469).
  { page: "/customers", opener: "button-add-customer", anyOf: [P.MANAGE_CUSTOMERS], source: "client/src/components/customers/customer-add-dialog.tsx", name: "klant toevoegen" },
  { page: "/customers", opener: "button-open-recycle-bin-customers", anyOf: [P.MANAGE_RECYCLE_BIN], source: "client/src/components/recycle-bin/recycle-bin-dialog.tsx", name: "prullenbak klanten" },
  // Sub-project C, Task 7 (B-38): the confirmation behind "Prullenbak leegmaken" - the
  // same dialog file, an AlertDialog of its own (`dialog-confirm-purge`). Its opener only
  // exists inside the bin dialog and only while that bin holds a row (the button is off on
  // an empty bin, and the e2e seed holds no deleted rows), so neither branch can find it on
  // a bare page load: the ALLOWED branch has no row to empty, and the DENIED branch never
  // reaches it (a profile without the right sees `button-open-recycle-bin-customers`
  // greyed out - proven by that entry - and so cannot open the bin at all). The proof that
  // it opens, names the count and the kind, cancels and confirms is the tail spec
  // e2e/layer-b-tail/recycle-bin/bins.spec.ts.
  {
    page: "/customers", opener: "button-purge-all", via: "button-open-recycle-bin-customers", anyOf: [P.MANAGE_RECYCLE_BIN],
    source: "client/src/components/recycle-bin/recycle-bin-dialog.tsx", name: "prullenbak leegmaken (bevestiging)",
    allowedPathNeedsState: "the opener sits inside the recycle-bin dialog and is off while the bin is empty (the e2e seed holds no deleted rows); the tail spec bins.spec.ts deletes rows first and then opens the confirmation",
    deniedPathNeedsState: "a role without manage_recycle_bin cannot open the bin (its opener is greyed out, proven by the entry above), so the purge button never exists for it; the tail spec bins.spec.ts runs as manager",
  },

  // --- /portal-admin -------------------------------------------------------
  // Only admin/manager hold VIEW_PORTAL/MANAGE_PORTAL among the seven E2E
  // profiles, so both roles that ever reach this page also satisfy each
  // button's own narrower gate (MANAGE_PORTAL, MANAGE_FINES, VIEW_FISCAL).
  { page: "/portal-admin", opener: "button-invite-portal-account", anyOf: [P.VIEW_PORTAL, P.MANAGE_PORTAL], source: "client/src/components/portal-admin/account-dialog.tsx", name: "portalaccount uitnodigen" },
  { page: "/portal-admin", opener: "button-fiscal-overview", anyOf: [P.VIEW_PORTAL, P.MANAGE_PORTAL], source: "client/src/components/fiscal/fiscal-overview-dialog.tsx", name: "fiscaal overzicht" },
  { page: "/portal-admin", opener: "button-import-fines", anyOf: [P.VIEW_PORTAL, P.MANAGE_PORTAL], source: "client/src/components/fines/fine-import-dialog.tsx", name: "boetes importeren" },
  // The fines bin lives in the toolbar of the fines table, which the portal
  // dashboard opens as a list dialog from its "Boetes" tile (`via`). Only admin
  // and manager reach this page, and both hold manage_recycle_bin.
  { page: "/portal-admin", opener: "button-fines-bin", via: "tile-fines", anyOf: [P.MANAGE_RECYCLE_BIN], source: "client/src/components/recycle-bin/recycle-bin-dialog.tsx", name: "prullenbak boetes" },

  { page: "/expenses", opener: "button-invoice-inbox", anyOf: [P.MANAGE_EXPENSES], source: "client/src/components/expenses/invoice-inbox-dialog.tsx", name: "ontvangen facturen" },
  // Audit P1 (A-9-7): the Kosten page opens the same dialog as the dashboard (ExpenseAddDialog)
  // instead of navigating to /expenses/add.
  { page: "/expenses", opener: "button-record-expense", anyOf: [P.MANAGE_EXPENSES], source: "client/src/components/expenses/expense-add-dialog.tsx", name: "kosten registreren" },
  // Audit P1 (A-9-4): the Logboek in the header of the Ontvangen facturen dialog. It opens on top of that
  // dialog (hence `via`); the log dialog itself is also opened by e2e/layer-b/settings/invoice-inbox-log.spec.ts.
  { page: "/expenses", opener: "button-invoice-inbox-log", via: "button-invoice-inbox", anyOf: [P.MANAGE_EXPENSES], source: "client/src/components/expenses/invoice-inbox-log-dialog.tsx", name: "logboek factuurpostvak (vanuit ontvangen facturen)" },

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
  // Opened by the "Overdracht terugdraaien" story in e2e/layer-b/desk/edge-cases.spec.ts
  // (sub-project C, Task 4): pickup, then undo with the odometer confirmation.
  "client/src/components/reservations/revert-handover-dialog.tsx",
  // Opened by e2e/layer-b/communications/send-and-log.spec.ts (audit remediation P3): the detail
  // of an e-mail log row. Its opener carries the row's id, and the seed holds no log row.
  "client/src/components/communications/email-log-detail-dialog.tsx",
];
