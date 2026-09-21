# Facts for B-27 / B-28 / B-29 — access control on staff screens

Read-only fact sheet. No file in the repository was changed to produce this. All facts carry `file:line`; anything not directly verified is marked "not verified". Feeds the design of:
- **B-28** — a clear "U heeft geen toegang tot dit scherm" message when someone types the address of a screen they have no rights for.
- **B-29** — bringing the menu (sidebar `anyOf`) and the server (route guards) into line where they disagree.
- **B-27** — buttons/tiles a user may not use stay visible but greyed out and switched off.

Owner's own words on these three (`.superpowers/sdd/2026-09-20-e2e-browser-tests/owner-decisions-2026-09-21.md`, V-3/V-4/V-5): "laten staan maar grijs maken en de funtie uitschakelen" (B-27), "duidelijke u heeft geen toegang melding weergeven" (B-28), "gelijk getrokken" (B-29).

---

## 1. ROUTING

### How a staff route is declared and guarded today

- `client/src/App.tsx:56-89` — a wouter `<Switch>`. One top-level `<Route path="/portaal" nest>` renders `<PortalApp />` (`client/src/pages/portal/index.tsx`) — its own layout, its own auth realm (`portal_users`, not staff `users`), embeddable in the marketing site's iframe. **Out of scope for B-27/28/29** per the task; not investigated further here beyond confirming it is a structurally separate realm that never goes through `ProtectedRoute`/`MainLayout`.
- Every other route (`App.tsx:67-82`) is `<ProtectedRoute path="…" component={…} />`, all nested inside one `<MainLayout>` (`App.tsx:64-87`).
- `client/src/components/protected-route.tsx:11-46` — `ProtectedRoute` checks only `isLoading`/`user` (i.e. "is anyone logged in"). It never looks at `user.permissions`, `user.role`, or the route's own path. If `!user` it redirects to `/auth` (line 17-19, 34-39); otherwise it renders the page component unconditionally (line 42-46). **No permission check exists anywhere in the client routing layer.**
- `client/src/components/sidebar-nav.tsx:21-45` filters which links are *shown*, using the same `anyOf` logic as the server (`isAdmin || anyOf.some(p => userPermissions.includes(p))`, lines 40-45) — but this only hides the link, it does not block navigation to the underlying URL. Typing the address, following an old bookmark, or clicking a stale link from another page all bypass it entirely.
- `client/src/layouts/MainLayout.tsx:216-218` — the only other client-side gate: `if (isAuthPage || !user) return <>{children}</>;`, i.e. skip the sidebar/header chrome pre-login. Nothing route-specific.
- **Conclusion: no staff page today shows any "no access" state for a logged-in user who lacks the page's permission.** The page's own component renders, its queries 403, and (per the three-role case documented in section 2) the user sees a red toast per failed query and an otherwise-empty or partially-empty page. This is exactly the gap B-28 names.

### Reusable existing "no access" pattern

Two dialogs already implement an access-denied branch, both role-gated (`isAdmin`), not permission-gated:
- `client/src/components/dialogs/users-dialog.tsx:404-415`:
  ```
  if (!isAdmin) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('usersDialog.accessDeniedTitle')}</DialogTitle></DialogHeader>
          <p className="text-muted-foreground">{t('usersDialog.accessDeniedMessage')}</p>
        </DialogContent>
      </Dialog>
    );
  }
  ```
- `client/src/components/dialogs/backup-dialog.tsx:475-483` — identical shape, `backupDialog.accessDeniedTitle`/`accessDeniedMessage`.
- Locale strings (`client/src/locales/nl/settings.json`): `backupDialog.accessDeniedTitle`/`accessDeniedMessage` (lines 9-10, "Toegang geweigerd" / "Je hebt geen toestemming voor deze functie."), `usersDialog.accessDeniedTitle`/`accessDeniedMessage` (lines 106-107, identical text). A **third, currently unused** key exists at `settings.json:169`, under `"backup"` (not `"backupDialog"`): `"accessDeniedMessage": "Je hebt geen toestemming om deze pagina te openen."` ("…to open this **page**", not "…function") — grepped the whole client tree, nothing references `backup.accessDeniedMessage` today. Its wording ("pagina" not "functie") is closer to what a page-level B-28 message would need, but it is dead code right now.
- Search of `client/src/locales/**` for "geen toegang" / "niet gemachtigd" / "unauthorized": no hits for "geen toegang" or "niet gemachtigd" anywhere; "unauthorized" only appears once, unrelated (`fiscal.json:174`, `"unauthorized_attempt": "Geweigerde poging"`, a fiscal-audit-log label, not a UI message).
- `client/src/pages/not-found.tsx` (`common:notFoundPage.title` = "404 Pagina niet gevonden", `.description`) is the existing full-page empty/error-state pattern (a centered `Card` with an `AlertCircle` icon, `h1`, and a description paragraph) — this is the closest existing full-*page* (not dialog) visual pattern B-28 could reuse; it currently only fires for `<Route component={NotFound} />` (App.tsx:83), i.e. genuinely unknown paths, never for a known-but-forbidden path.
- `client/src/pages/reservations/edit/[id].tsx:36-43` has its own generic error block (red-bordered card, `editDialog.errorTitle`/`failedToLoad`) shown whenever its `useQuery` errors for *any* reason (network, 404, or a 403) — not permission-specific, but it is the one place today where a failed unconditional GET on a staff page produces a deliberate error UI instead of a silent empty page.

### Staff screens reached without a sidebar entry

- `/reservations/edit/:id` (`client/src/pages/reservations/edit/[id].tsx`, `App.tsx:73`) — no sidebar link; reached from reservation rows/dialogs elsewhere. No client-side permission check in the file at all (grepped: zero `useHasPermission`/`permission` hits). Its unconditional `useQuery({queryKey: [\`/api/reservations/${id}\`]})` (line 15-17) hits `GET /api/reservations/:id` (`server/routes.ts:2864`, `hasPermission(VIEW_RESERVATIONS, MANAGE_RESERVATIONS)`). Its submit (`ReservationForm`) ultimately `PATCH /api/reservations/:id` (`server/routes.ts:4118`, `hasPermission(MANAGE_RESERVATIONS)`). **Functional permission: to load, `VIEW_RESERVATIONS` or `MANAGE_RESERVATIONS`; to actually save, `MANAGE_RESERVATIONS` specifically** — a `VIEW_RESERVATIONS`-only user can open this page, fill in the whole form, and only discover on submit that they cannot save.
- `/expenses/add` (`client/src/pages/expenses/add.tsx`, `App.tsx:76`) — no sidebar entry (the flow is reached from quick-actions/scan). No client-side permission check in the file. Its edit-mode query (`[\`/api/expenses/${expenseId}\`]`, line 49-52) is `enabled`-gated by edit mode only, not permission. `ExpenseForm` (rendered unconditionally) itself fires an unconditional `["/api/vehicles"]` (`client/src/components/expenses/expense-form.tsx:130-132`) → `GET /api/vehicles` (`server/routes.ts:646`, `VIEW_VEHICLES`/`MANAGE_VEHICLES`) — an unrelated permission family. Submit is `POST /api/expenses` (`server/routes/expenses.ts:272`) / `PATCH /api/expenses/:id` (`expenses.ts:388`), both `hasPermission(MANAGE_EXPENSES)`. **Functional permission: `MANAGE_EXPENSES`** (same as `/expenses`'s own sidebar entry) — but nothing on this page tests for it before the final submit; a user with only `VIEW_VEHICLES` can fully fill out the form and only get a 403 at the very end.

---

## 2. PAGE × PERMISSION TABLE

Sidebar `anyOf` source: `client/src/components/sidebar-nav.tsx:24-37`. Server guard source: `server/middleware/permissions.ts:6-34` (`hasPermission(...)`, OR logic; `role === 'admin'` bypasses everything, line 17-19). All queries below fire **unconditionally on page load** (no `enabled`, or an `enabled` that does not depend on the viewer's permission) — click-triggered/dialog-only/edit-mode-only queries are excluded as out of scope (they don't cause the page itself to fail on load). Global widget: every staff page is wrapped in `MainLayout` (`client/src/layouts/MainLayout.tsx`), which mounts `NotificationCenter` and `PortalAlertChip`; that overlay is listed once below rather than repeated per page.

### Global (every page, via MainLayout)

| Component:line | GET path | Server guard (file:line) |
|---|---|---|
| `client/src/components/ui/notification-center.tsx:19-21` | `/api/vehicles/apk-expiring` | `VIEW_VEHICLES, MANAGE_VEHICLES` (`server/routes.ts:486`) |
| `notification-center.tsx:23-25` | `/api/vehicles/warranty-expiring` | `VIEW_VEHICLES, MANAGE_VEHICLES` (`server/routes.ts:505`) |
| `notification-center.tsx:27-29` | `/api/reservations/upcoming` | `VIEW_RESERVATIONS, MANAGE_RESERVATIONS` (`server/routes.ts:2649`) |
| `notification-center.tsx:31-33` | `/api/reservations/upcoming-maintenance` | `VIEW_RESERVATIONS, MANAGE_RESERVATIONS, MANAGE_MAINTENANCE` (`server/routes.ts:2659`) |
| `notification-center.tsx:40-42` | `/api/placeholder-reservations/needing-assignment` | `VIEW_RESERVATIONS, MANAGE_RESERVATIONS` (`server/routes.ts:5406`) |
| `notification-center.tsx:35-38` | `/api/custom-notifications/unread` | correctly gated: `enabled: canViewNotifications` (`useHasPermission(MANAGE_NOTIFICATIONS)`) — **already fixed** (in-code comment cites task-6-report.md Finding 1); excluded from the mismatch count below |
| `client/src/components/portal-admin/portal-alert-chip.tsx:19-24` | `/api/portal-admin/unread-count` | correctly gated: `enabled: canView` (`useCanViewPortal()`) — excluded |

None of the five unconditional header queries is guarded by `VIEW_DASHBOARD`, `VIEW_CUSTOMERS`/`MANAGE_CUSTOMERS`, or `VIEW_PORTAL`/`MANAGE_PORTAL` — so on `/`, `/customers`, `/portal-admin` this header widget alone can 403 for a sidebar-admitted role that lacks vehicle/reservation view rights (latent, not live: every one of the 7 E2E seed profiles that can see those pages also holds `VIEW_VEHICLES` and `VIEW_RESERVATIONS` — `e2e/seed/users.ts:13-24`).

### Per-page table

| # | Path | Sidebar `anyOf` | Unconditional GETs (file:line → path → server guard file:line) | Verdict |
|---|---|---|---|---|
| 1 | `/` | `[VIEW_DASHBOARD]` | `quick-actions.tsx:524-531` → `/api/vehicles` (VIEW_VEHICLES/MANAGE_VEHICLES, `routes.ts:646`), `/api/reservations/upcoming` (VIEW_RESERVATIONS/MANAGE_RESERVATIONS, `routes.ts:2649`) · `vehicle-availability-widget.tsx:13-15` → `/api/vehicles/available` (VIEW_VEHICLES/MANAGE_VEHICLES, `routes.ts:463`) · `apk-expiration-widget.tsx:40-42` → `/api/vehicles/apk-expiring` (`routes.ts:486`) · `overdue-reservations-widget.tsx:31-33` → `/api/reservations/overdue` (VIEW_RESERVATIONS/MANAGE_RESERVATIONS, `routes.ts:2680`) · `warranty-expiration-widget.tsx:34-36` → `/api/vehicles/warranty-expiring` (`routes.ts:505`) · `spare-vehicle-assignments-widget.tsx:78-103` → `/api/placeholder-reservations/needing-assignment` (`routes.ts:5406`), `/api/reservations` (`routes.ts:2829`), `/api/vehicles` (`routes.ts:646`), `/api/transports` (4-perm OR, `routes.ts:8049`) · `upcoming-reservations.tsx:43-45` → `/api/reservations/upcoming` (`routes.ts:2649`) · `reservation-calendar.tsx:139-173` → `/api/reservations/range` (`routes.ts:2616`), `/api/app-settings/key/calendar_settings` (`requireAuth` only, `server/routes/app-settings.ts:254`) | **Server narrower than menu, page-wide.** Not one of these routes accepts `VIEW_DASHBOARD`; all need `VIEW_VEHICLES`/`MANAGE_VEHICLES` or `VIEW_RESERVATIONS`/`MANAGE_RESERVATIONS` families instead. A hypothetical `VIEW_DASHBOARD`-only role would see the link and 403 on every widget. (Correctly excluded, already fixed: `backup-staleness-banner.tsx` `/api/backups/health` is `enabled: canViewBackupHealth`; `spare-vehicle-assignments-widget.tsx` `/api/customers` is `enabled: canViewCustomers`; `recent-expenses.tsx` `/api/expenses/recent` is `enabled: canViewExpenses`.) |
| 2 | `/vehicles` | `[VIEW_VEHICLES, MANAGE_VEHICLES]` | `vehicles/index.tsx:97-99` → `/api/vehicles` (VIEW_VEHICLES/MANAGE_VEHICLES, `routes.ts:646`) · `vehicles/index.tsx:102-104` → `/api/reservations` (VIEW_RESERVATIONS/MANAGE_RESERVATIONS, `routes.ts:2829`) | **Server narrower than menu**, on one route. `/api/vehicles` matches exactly; `/api/reservations` (per-row rented/spare enrichment) needs a permission family absent from the sidebar's `anyOf`. |
| 3 | `/scan` | `[VIEW_VEHICLES, MANAGE_VEHICLES]` | `scan-panel.tsx:117-120` → `/api/scan-events` (`requireAuth` then VIEW_VEHICLES/MANAGE_VEHICLES, `routes.ts:826`) | **In line.** Exact match (only the global header widget adds an unrelated dependency, as noted above). |
| 4 | `/customers` | `[VIEW_CUSTOMERS, MANAGE_CUSTOMERS]` | `customers/index.tsx:47-53` → `/api/customers` (VIEW_CUSTOMERS/MANAGE_CUSTOMERS, `routes.ts:2379`), `/api/reservations` (VIEW_RESERVATIONS/MANAGE_RESERVATIONS, `routes.ts:2829`) · `customers/index.tsx:55-57` → `/api/drivers` (VIEW_CUSTOMERS/MANAGE_CUSTOMERS, `routes.ts:6989`) | **Server narrower than menu**, on one route. `/api/customers` and `/api/drivers` match exactly; `/api/reservations` (rental-count/last-rental stats) needs an unrelated permission family. (Excluded, already fixed: `use-portal-accounts.ts` is `enabled: canView`.) |
| 5 | `/portal-admin` | `[VIEW_PORTAL, MANAGE_PORTAL]` | `portal-admin/index.tsx:34-38` → `/api/portal-admin/dashboard` (`canView` = VIEW_PORTAL/MANAGE_PORTAL, `server/routes/portal-admin.ts:15,144`) · `dashboard-panels.tsx:292-296` → `/api/portal-admin/customers-overview` (same guard, `portal-admin.ts:139`) | **In line.** Both page-specific GETs match the sidebar exactly (only the global header widget adds an unrelated dependency). |
| 6 | `/reservations` | `[VIEW_RESERVATIONS, MANAGE_RESERVATIONS]` | `calendar.tsx:589-591` → `/api/vehicles` (VIEW_VEHICLES/MANAGE_VEHICLES, `routes.ts:646`) · `calendar.tsx:596-598` → `/api/transports` (4-perm OR incl. reservation perms, `routes.ts:8049`) · `calendar.tsx:613-621` → `/api/reservations/range` (`routes.ts:2616`) · `calendar.tsx:645-647` → `/api/reservations` (`routes.ts:2829`) · `calendar.tsx:691-693` → `/api/reservations/overdue` (`routes.ts:2680`) · `calendar.tsx:726-728` → `/api/app-settings/key/calendar_settings` (`requireAuth` only) | **Server narrower than menu**, on one route (`/api/vehicles`, unrelated permission family, breaks the calendar's own vehicle rows/filters for a reservation-only role). `/api/transports` is wider but harmless (superset). Everything else matches exactly. (Excluded, already fixed: `/api/interactive-damage-checks` at `calendar.tsx:720-723` is now `enabled: adminDialogOpen && canViewDamageChecks`.) |
| 7 | `/maintenance` | `[MANAGE_MAINTENANCE]` | `maintenance/calendar.tsx:360-445` → `/api/vehicles` (`routes.ts:646`), `/api/vehicles/apk-expiring` (`routes.ts:486`), `/api/vehicles/warranty-expiring` (`routes.ts:505`), `/api/vehicles/service-due` (`routes.ts:525`), `/api/reservations/range` (`routes.ts:2616`), `/api/reservations` (×2 calls, `routes.ts:2829`), `/api/app-settings/key/calendar_settings` (`requireAuth` only), `/api/system-settings` (`requireAuth` only, `server/routes/app-settings.ts:546`) | **No server guard matches the menu at all.** None of the nine GETs this page depends on accepts `MANAGE_MAINTENANCE`; they're all VIEW_VEHICLES/MANAGE_VEHICLES, VIEW_RESERVATIONS/MANAGE_RESERVATIONS, or requireAuth-only. Runs both directions: (a) a role the sidebar refuses (no `MANAGE_MAINTENANCE`) but holding vehicle+reservation view rights gets 200 on every GET if it navigates here directly; (b) a role the sidebar admits (`MANAGE_MAINTENANCE`) but lacking vehicle/reservation view rights 403s on all nine. |
| 8 | `/expenses` | `[MANAGE_EXPENSES]` | `expenses/index.tsx:127-133` → `/api/expenses` (MANAGE_EXPENSES, `server/routes/expenses.ts:168`) · `invoice-inbox-dialog.tsx:53-57` (its status-poll button is rendered unconditionally on the page) → `/api/expenses/inbox/status` (`hasPermission(MANAGE_EXPENSES, MANAGE_SETTINGS)`, `server/routes/expense-inbox.ts:23,120`) | **Server wider than menu**, harmless. Main list query matches exactly; the always-mounted inbox-status poll accepts `MANAGE_SETTINGS` too, but every role the sidebar admits to `/expenses` already holds `MANAGE_EXPENSES`, so this never produces a visible 403 today. |
| 9 | `/expenses/add` | *(no sidebar entry — see §1)* | `expense-form.tsx:130-132` → `/api/vehicles` (VIEW_VEHICLES/MANAGE_VEHICLES, `routes.ts:646`) | **No server guard matches the page's real requirement.** The page's only unconditional GET tests an unrelated permission (vehicles); its actual functional need, `MANAGE_EXPENSES` (from the `POST`/`PATCH /api/expenses*` it submits to), is never tested until the final submit. |
| 10 | `/documents` | `[VIEW_DOCUMENTS, MANAGE_DOCUMENTS]` | `documents/index.tsx:77-79` → `/api/documents` (VIEW_DOCUMENTS/MANAGE_DOCUMENTS, `routes.ts:5850`) · `documents/index.tsx:82-84` → `/api/vehicles` (VIEW_VEHICLES/MANAGE_VEHICLES, `routes.ts:646`) · `documents/index.tsx:99-101` → `/api/barcode-label-templates` (`requireAuth` **only, no permission check**, `server/routes/report-and-label-templates.ts:208`) | **Mixed, two different problems.** `/api/documents` matches exactly. `/api/vehicles` needs an unrelated permission family (a `VIEW_DOCUMENTS`-only role 403s here while the rest of the page loads). `/api/barcode-label-templates` has **no permission guard at all** — any authenticated user of any role, including ones the sidebar hides `/documents` from entirely, gets 200. (Excluded, already fixed per in-code comments: `/api/pdf-templates` and `/api/transport-report-templates` are `enabled: canManagePdfTemplates`.) |
| 11 | `/delivery` | `[VIEW_RESERVATIONS, MANAGE_RESERVATIONS]` | `dashboard.tsx:65-67` → `/api/reservations` (`routes.ts:2829`) · `dashboard.tsx:74-76` → `/api/vehicles` (VIEW_VEHICLES/MANAGE_VEHICLES, `routes.ts:646`) · `dashboard.tsx:78-80` → `/api/transports` (4-perm OR, `routes.ts:8049`) | **Mixed.** `/api/reservations` matches exactly. `/api/transports` is wider but harmless (superset, matches prior report's finding 6). `/api/vehicles` needs an unrelated permission family. (Excluded, already fixed: `/api/customers` is `enabled: canViewCustomers`.) |
| 12 | `/communications` | `[MANAGE_EMAIL_TEMPLATES, MANAGE_NOTIFICATIONS]` | `CustomerCommunications.tsx:93-100` → `/api/email-templates` (MANAGE_EMAIL_TEMPLATES only, `server/index.ts:417`) · `:103-113` → `/api/vehicles/filtered?filterType=apk` (VIEW_VEHICLES/MANAGE_VEHICLES, `server/index.ts:416`) · `:116-118` → `/api/customers` (VIEW_CUSTOMERS/MANAGE_CUSTOMERS, `routes.ts:2379`) · `:121-146` → `/api/customers/with-reservations` (VIEW_CUSTOMERS/MANAGE_CUSTOMERS, `routes.ts:2396`) · `:149-156` → `/api/email-logs` (MANAGE_EMAIL_TEMPLATES only, `server/index.ts:418`) | **Server narrower than menu, severely.** None of the five unconditional GETs accepts `MANAGE_NOTIFICATIONS` — the second half of the sidebar's own `anyOf`. A role holding only `MANAGE_NOTIFICATIONS` sees the link but 403s on all five queries on load. |
| 13 | `/reports` | `[VIEW_REPORTS, MANAGE_REPORTS]` | `reports/index.tsx:128-130` → `/api/vehicles` (`routes.ts:646`) · `:139-141` → `/api/reservations` (`routes.ts:2829`) · `:144-146` → `/api/customers` (`routes.ts:2379`) · `:149-151` → `/api/transports` (4-perm OR, `routes.ts:8049`) | **Server narrower than menu, completely.** All four unconditional GETs are guarded by vehicle/reservation/customer permissions; none accepts `VIEW_REPORTS`/`MANAGE_REPORTS` (confirmed distinct permission strings, `shared/schema.ts:113-114`). A role holding only `VIEW_REPORTS`/`MANAGE_REPORTS` sees the link and 403s on all four queries simultaneously. (Excluded, already fixed: `/api/expenses` is `enabled: canViewExpenses`.) |

**Summary: 11 of 13 pages show a mismatch between the sidebar's `anyOf` and the server guard(s) of at least one GET the page fires unconditionally on load (`/`, `/vehicles`, `/customers`, `/reservations`, `/maintenance`, `/expenses`, `/expenses/add`, `/documents`, `/delivery`, `/communications`, `/reports`). 2 are in line (`/scan`, `/portal-admin`).**

### Options to bring the three known mismatches (`/maintenance`, `/delivery`, `/communications`) into line

These three are named in the task brief as the pre-existing known cases (`e2e/registry/pages.ts` comments, task-6-report.md findings 5/6). Options only — no choice made here.

**`/maintenance`** (no GET tests `MANAGE_MAINTENANCE` at all):
- **A. Widen the sidebar's `anyOf`** to include `VIEW_VEHICLES`/`MANAGE_VEHICLES` and/or `VIEW_RESERVATIONS`/`MANAGE_RESERVATIONS` (what the page's GETs actually require) instead of `MANAGE_MAINTENANCE`. Changes who *sees the link*: anyone with vehicle-view or reservation-view rights would see "Onderhoud" even without `MANAGE_MAINTENANCE` — but they'd then hit B-27's "visible but disabled" state on the schedule/complete-maintenance actions (which do need `MANAGE_MAINTENANCE` server-side per §3). Net effect: more roles can *view* the calendar read-only; nobody gains write access they don't already have.
- **B. Narrow the server**: add `MANAGE_MAINTENANCE` as a required (AND, not OR) check on top of the existing vehicle/reservation guards for the GETs this page depends on, or add a new `MANAGE_MAINTENANCE`-gated GET the page can depend on for its "am I allowed here" check. Changes who *can load data*: any role with `MANAGE_MAINTENANCE` but missing `VIEW_VEHICLES`/`VIEW_RESERVATIONS` today already 403s (per table row 7) — this option is consistent with that, and a role with vehicle/reservation view but not `MANAGE_MAINTENANCE` would newly lose the ability to view the page's data (currently they can, if they navigate to it directly, since nothing stops them).
- **C. Leave the server unchanged, add a client-side `MANAGE_MAINTENANCE` check** (`useHasPermission`) that blocks rendering regardless of what the GETs return — the B-28 "no access" screen would fire client-side even though the server would technically allow the data through. Cheapest, but leaves the server gap (any authenticated vehicle/reservation-view role can still fetch this data directly via the API, bypassing the UI).

**`/delivery`** (`/api/transports` wider than sidebar — harmless today):
- **A. Leave as is.** No profile is currently affected (every role with `VIEW_RESERVATIONS`/`MANAGE_RESERVATIONS` — the sidebar's gate — already satisfies `/api/transports`'s guard too, since it's an OR superset). Risk is only latent: a future role with just `VIEW_VEHICLES`/`MANAGE_VEHICLES` (no reservation permission) would see data on this endpoint the sidebar wouldn't otherwise show them a link for.
- **B. Narrow `/api/transports`' guard** to exactly `VIEW_RESERVATIONS`/`MANAGE_RESERVATIONS` (drop the two vehicle permissions), matching the sidebar precisely. Changes who can call the API directly: a hypothetical vehicle-only role would lose access to `/api/transports` (today: has it; would not, after). Need to check every other page/widget that also calls `/api/transports` (e.g. `/` and `/reports` per §2 rows 1 and 13) before narrowing, since this is a shared route.
- **C. Widen the sidebar's `anyOf`** to also include `VIEW_VEHICLES`/`MANAGE_VEHICLES`, matching the server. Changes who *sees the link*: a vehicle-view-only role would newly see "Transporten" in the sidebar.

**`/communications`** (server narrower — no GET accepts `MANAGE_NOTIFICATIONS`):
- **A. Narrow the sidebar's `anyOf`** to `[MANAGE_EMAIL_TEMPLATES]` only (drop `MANAGE_NOTIFICATIONS`), matching what the page's GETs actually require. Changes who sees the link: a role holding only `MANAGE_NOTIFICATIONS` (no `MANAGE_EMAIL_TEMPLATES`) would lose the "Communicatie" link entirely — today they see it and the page fails outright.
- **B. Widen the server**: add `MANAGE_NOTIFICATIONS` as an accepted OR-permission on `/api/email-templates`, `/api/email-logs`, and the vehicles/customers queries this page depends on. Changes who can succeed server-side: a `MANAGE_NOTIFICATIONS`-only role would newly be able to read email templates/logs/customers/vehicles through this page (and, per §3, the "preview & send" buttons' own guard — `MANAGE_NOTIFICATIONS` on `server/index.ts:414` — already matches this option, so this brings the *page* in line with what the *buttons* already require).
- **C. Split the page**: show only the "preview & send" (notification) part of the UI to `MANAGE_NOTIFICATIONS`-only users and only the template-management part to `MANAGE_EMAIL_TEMPLATES`-only users, each firing only the GETs it actually needs. Larger change; no existing precedent for this kind of per-permission partial-page render was found in the codebase (see §3, no `PermissionButton`/section-level gating pattern exists yet).

---

## 3. CONTROLS A USER MAY SEE BUT NOT USE

Every control below is rendered **unconditionally**, or gated only by the page's broader view permission / a role check unrelated to the specific action, while its underlying mutation is guarded server-side by a narrower or different permission. `data-testid` given where one exists; "(no testid)" otherwise. Grouped by page.

### `/` (dashboard) — `client/src/components/dashboard/quick-actions.tsx` has **zero permission checks anywhere in the file** (confirmed by grep)

| Control (file:line, testid) | Opens/does | Mutation route + guard | Should require |
|---|---|---|---|
| `quick-actions.tsx:1006` `button-quick-add-vehicle` | Add Vehicle form | `POST /api/vehicles` — `routes.ts:921`, `MANAGE_VEHICLES` | MANAGE_VEHICLES |
| `quick-actions.tsx:1037` `button-quick-add-customer` | Add Customer form | `POST /api/customers` — `routes.ts:2469`, `MANAGE_CUSTOMERS` | MANAGE_CUSTOMERS |
| `quick-actions.tsx:1072` `button-quick-log-expense` | Log Expense form | `POST /api/expenses` — `routes/expenses.ts:272`, `MANAGE_EXPENSES` | MANAGE_EXPENSES |
| `quick-actions.tsx:945` (start-pickup/return/scan tiles, ×3) | Opens scan panel for pickup/return/generic | `POST /api/reservations/:id/pickup` (`routes.ts:4874`) / `.../return` (`routes.ts:5127`), `MANAGE_RESERVATIONS` | MANAGE_RESERVATIONS |
| `quick-actions.tsx:2010` `button-scan-rdw-apk-dates` | Fires an RDW APK-date scan | `POST /api/apk-date-changes/scan-now` — `server/routes/apk-date-changes.ts:98`, `MANAGE_VEHICLES` | MANAGE_VEHICLES |
| `quick-actions.tsx` new-reservation tile (no testid) | New Reservation form | `POST /api/reservations` — `routes.ts:2966`, `MANAGE_RESERVATIONS` | MANAGE_RESERVATIONS |
| `quick-actions.tsx` ~1104 document-upload tile (no testid) | Uploads a vehicle document | `POST /api/documents` — `routes.ts:5913`, `MANAGE_DOCUMENTS` | MANAGE_DOCUMENTS |
| `quick-actions.tsx` ~1505 APK-report upload tile (no testid) | Uploads APK report, patches vehicle APK date | `POST /api/documents` + `PATCH /api/vehicles/:id` — both `MANAGE_DOCUMENTS`/`MANAGE_VEHICLES` | MANAGE_DOCUMENTS **and** MANAGE_VEHICLES |
| `quick-actions.tsx` ~1683 registration-change tile (no testid) | Bulk toggles Opnaam/BV registration | `PATCH /api/vehicles/:id/toggle-registration` — `routes.ts:1740`, `MANAGE_VEHICLES` | MANAGE_VEHICLES |
| `quick-actions.tsx` ~1884 fuel-status tile (no testid) | Updates a vehicle's fuel level | `PATCH /api/vehicles/:id/fuel-status` — `routes.ts:1880` | MANAGE_VEHICLES |
| `quick-actions.tsx` ~1985 damage-check tile (no testid) | Starts pickup/return damage check | `POST /api/interactive-damage-checks` — `routes.ts:7520`, `MANAGE_DAMAGE_CHECKS` | MANAGE_DAMAGE_CHECKS |
| `quick-actions.tsx` "Send APK Notifications" tile (no testid) | Bulk-emails APK reminders | `POST /api/notifications/send`, mount guard `MANAGE_NOTIFICATIONS` — `server/index.ts:414` | MANAGE_NOTIFICATIONS |
| `client/src/components/dashboard/reservation-calendar.tsx:315` `button-dashboard-new-reservation` | New Reservation | same as above | MANAGE_RESERVATIONS |
| `reservation-calendar.tsx:648` `button-assign-vehicle` | Assigns a spare vehicle | `POST /api/placeholder-reservations/:id/assign-vehicle` — `routes.ts:5430`, `MANAGE_RESERVATIONS` | MANAGE_RESERVATIONS |
| `reservation-calendar.tsx:634` inline "Edit" (no testid) | Navigates to reservation edit | `PATCH /api/reservations/:id`, `MANAGE_RESERVATIONS` | MANAGE_RESERVATIONS |
| `client/src/components/dashboard/spare-vehicle-assignments-widget.tsx:455` `button-start-pickup-spare` | Starts pickup of a spare | `PATCH /api/reservations/:id/spare-status` — `routes.ts:4797`, `MANAGE_RESERVATIONS` | MANAGE_RESERVATIONS |
| `spare-vehicle-assignments-widget.tsx:548` `button-mark-returned-spare` | Marks spare returned | same route | MANAGE_RESERVATIONS |
| `client/src/components/reservations/reservation-quick-status-button.tsx` (whole component, reused on dashboard + `/reservations`) | Quick status revert/advance | `PATCH /api/reservations/:id/status` — `routes.ts:3846`, `MANAGE_RESERVATIONS` | MANAGE_RESERVATIONS |

Note: several of these tiles (start-pickup/return/scan, new-reservation, document upload, APK-report upload, registration-change, fuel-status, damage-check) have **no `data-testid`** at all — worth adding as part of the B-27 build so each can be targeted individually.

### `/vehicles`

| Control (file:line, testid) | Opens/does | Mutation route + guard | Should require |
|---|---|---|---|
| `client/src/pages/vehicles/index.tsx:255` `button-edit-vehicle-${id}` | Edit Vehicle | `PATCH /api/vehicles/:id` — `routes.ts:1387`, `MANAGE_VEHICLES` | MANAGE_VEHICLES |
| `vehicles/index.tsx:264` `button-delete-vehicle-${id}` | Delete Vehicle confirm | `DELETE /api/vehicles/:id` — `routes.ts:2000`, `MANAGE_VEHICLES` | MANAGE_VEHICLES |
| `vehicles/index.tsx:328` `button-reserve-vehicle-${id}` | Reserve dialog | `POST /api/reservations`, `MANAGE_RESERVATIONS` | MANAGE_RESERVATIONS |
| `client/src/components/vehicles/vehicle-add-dialog.tsx:37` `button-add-vehicle` | Add Vehicle form | `POST /api/vehicles`, `MANAGE_VEHICLES` | MANAGE_VEHICLES |
| `client/src/components/vehicles/vehicle-bulk-import-dialog.tsx:735` `button-bulk-import` | Bulk-import wizard | `POST /api/vehicles/bulk-import-plates`/`-csv` — `routes.ts:1078`/`1168`, `MANAGE_VEHICLES` | MANAGE_VEHICLES |

(`button-open-barcode-book`, `button-key-audit`, `button-spare-key-audit` are read-only — no mutation route — visible to `VIEW_VEHICLES`+`MANAGE_VEHICLES` correctly per the page's own gate; not a gap.)

### `/reservations`

| Control (file:line, testid) | Opens/does | Mutation route + guard | Should require |
|---|---|---|---|
| `client/src/pages/reservations/calendar.tsx:1071` `button-administration` | Administration dialog (further mutating actions inside) | various, see below | MANAGE_RESERVATIONS |
| `calendar.tsx:1075-1099` "+" default trigger, `button-new-reservation` (in `reservation-add-dialog.tsx:161`) | New Reservation form | `POST /api/reservations`, `MANAGE_RESERVATIONS` | MANAGE_RESERVATIONS |
| `calendar.tsx:2514` `button-start-pickup-calendar` | Starts pickup | `POST /api/reservations/:id/pickup`, `MANAGE_RESERVATIONS` | MANAGE_RESERVATIONS |
| `calendar.tsx:2530` `button-start-return-calendar` | Starts return | `POST /api/reservations/:id/return`, `MANAGE_RESERVATIONS` | MANAGE_RESERVATIONS |
| `calendar.tsx:2546` `button-edit-reservation-dialog` | Edit Reservation | `PATCH /api/reservations/:id`, `MANAGE_RESERVATIONS` | MANAGE_RESERVATIONS |
| `calendar.tsx:2557` `button-change-status-dialog` | Reverts status | `PATCH /api/reservations/:id/status`, `MANAGE_RESERVATIONS` | MANAGE_RESERVATIONS |
| `calendar.tsx:2568` `button-send-to-service` | Opens Schedule Maintenance for this vehicle | `POST /api/reservations/maintenance-with-spare` — `routes.ts:3342`, `MANAGE_RESERVATIONS`/`MANAGE_MAINTENANCE` | MANAGE_RESERVATIONS or MANAGE_MAINTENANCE |
| `calendar.tsx:2586` `button-delete-reservation-dialog` | Deletes reservation | `DELETE /api/reservations/:id` — `routes.ts:5495`, `MANAGE_RESERVATIONS` | MANAGE_RESERVATIONS |
| `calendar.tsx:2256` `button-email-documents` | Emails reservation documents | `POST /api/documents/:id/email` — `routes.ts:6156`, `MANAGE_DOCUMENTS` | MANAGE_DOCUMENTS |
| `calendar.tsx:2349-2362` per-document delete "×" (no testid) | Deletes a document | `DELETE /api/documents/:id` — `routes.ts:6344`, `MANAGE_DOCUMENTS` | MANAGE_DOCUMENTS |
| `calendar.tsx:2393` `button-create-return-check` | Opens return damage check | `POST /api/interactive-damage-checks`, `MANAGE_DAMAGE_CHECKS` | MANAGE_DAMAGE_CHECKS |
| `calendar.tsx:2403` `button-create-damage-check` | Opens damage check | same | MANAGE_DAMAGE_CHECKS |
| `calendar.tsx:2434` `button-edit-damage-check-${id}` | Edits a damage check | `PUT /api/interactive-damage-checks/:id` — `routes.ts:7684`, `MANAGE_DAMAGE_CHECKS` | MANAGE_DAMAGE_CHECKS |
| `calendar.tsx:2452` `button-delete-damage-check-${id}` | Deletes a damage check | `DELETE /api/interactive-damage-checks/:id` — `routes.ts:7991`, `MANAGE_DAMAGE_CHECKS` | MANAGE_DAMAGE_CHECKS |

Note: `calendar.tsx:198-200` defines a `canManageReservations` variable but per the sub-agent sweep it is **not applied** to the pickup/return/edit/status/delete buttons above — worth confirming directly before design (flagged "not independently re-verified by me" — see Open Questions).

### `/maintenance` — `client/src/pages/maintenance/calendar.tsx` has **zero permission checks anywhere in the file**

| Control (file:line, testid) | Opens/does | Mutation route + guard | Should require |
|---|---|---|---|
| `maintenance/calendar.tsx:1108` `button-schedule-maintenance` | Schedule Maintenance | `POST /api/reservations/maintenance-with-spare`, `MANAGE_MAINTENANCE`/`MANAGE_RESERVATIONS` | MANAGE_MAINTENANCE |
| `maintenance/calendar.tsx:2123` `button-complete-maintenance` | Completes a maintenance block | `POST /api/reservations/:id/complete-maintenance` — `routes.ts:4610`, `MANAGE_MAINTENANCE`/`MANAGE_RESERVATIONS` | MANAGE_MAINTENANCE |

(`button-maintenance-list-view` is read-only, matches the page's own `MANAGE_MAINTENANCE` gate — not a gap, though per §2 row 7 the page's own view-gate isn't server-enforced anywhere either.)

### `/expenses/add` (no sidebar entry)

| Control | Opens/does | Mutation route + guard | Should require |
|---|---|---|---|
| Whole page (`expenses/add.tsx` → `ExpenseForm`) | Creates/edits an expense | `POST /api/expenses` / `PATCH /api/expenses/:id`, `MANAGE_EXPENSES` | MANAGE_EXPENSES |

### `/documents`

| Control (file:line, testid) | Opens/does | Mutation route + guard | Should require |
|---|---|---|---|
| `client/src/pages/documents/index.tsx:513-516` four `tab-*-templates` triggers | Reveal template-management tabs | n/a (navigation only) | same as the opener below, since the tab just reveals it |
| `documents/index.tsx:901` `button-open-template-editor` | Contract-template editor | Editor's own Save/Delete: `POST/PATCH/DELETE /api/pdf-templates*` — `server/routes/pdf-templates.ts:219/246/332`, `MANAGE_PDF_TEMPLATES` | MANAGE_PDF_TEMPLATES |
| `documents/index.tsx:1025` `button-open-transport-template-editor` | Transport-report template editor | `POST/PATCH/DELETE /api/transport-report-templates*` — `server/routes/report-and-label-templates.ts:147/163/186`, `MANAGE_PDF_TEMPLATES` | MANAGE_PDF_TEMPLATES |
| `documents/index.tsx:1101` `button-open-barcode-label-editor` | Barcode-label editor | `POST/PATCH/DELETE /api/barcode-label-templates*`, `MANAGE_PDF_TEMPLATES` | MANAGE_PDF_TEMPLATES |
| `documents/index.tsx:1405` `button-open-damage-check-studio` | Damage-check template studio | `POST/PUT/DELETE /api/damage-check-templates*` — `server/routes/damage-check-templates.ts:244/263/355`, `MANAGE_DAMAGE_CHECKS` | MANAGE_DAMAGE_CHECKS |
| `client/src/pages/documents/template-editor.tsx` Save/Create/Delete/Rename buttons (~1237/1306/1302/1342/1360) | Persist/delete contract templates | same `MANAGE_PDF_TEMPLATES` routes | MANAGE_PDF_TEMPLATES — file defines `canManageTemplates = useHasPermission(MANAGE_PDF_TEMPLATES)` at line 154 but (per sub-agent sweep) only applies it to query `enabled`, not to these buttons |
| `client/src/pages/documents/transport-report-template-editor.tsx` Save/Delete buttons | Same pattern | same routes | MANAGE_PDF_TEMPLATES — same gap (`canManageTemplates` at line 154, same story) |
| `documents/index.tsx:1625` `button-upload-diagram-template` | Uploads a vehicle diagram template | `POST /api/vehicle-diagram-templates` — `server/routes/vehicle-diagram-templates.ts:92`, `MANAGE_VEHICLES` | MANAGE_VEHICLES (a different permission domain than the page's own VIEW_DOCUMENTS/MANAGE_DOCUMENTS) |

### `/delivery`

| Control (file:line, testid) | Opens/does | Mutation route + guard | Should require |
|---|---|---|---|
| `client/src/pages/delivery/dashboard.tsx:663` `button-new-transport` | New Transport | `POST /api/transports` — `routes.ts:8076`, `MANAGE_VEHICLES`/`MANAGE_RESERVATIONS` | MANAGE_VEHICLES or MANAGE_RESERVATIONS |
| `dashboard.tsx:678` `button-bulk-print` | Bulk-generates transport reports | `POST /api/delivery/transports/generate-report` — `routes.ts:8391`, same guard | same |
| `dashboard.tsx:688` `button-bulk-complete` | Bulk-completes transports | `PATCH /api/transports/:id` — `routes.ts:8146`, same guard | same |
| `dashboard.tsx:935` `button-edit-transport-${id}` | Edits a transport | same PATCH route | same |
| `dashboard.tsx:944` `button-delete-transport-${id}` | Deletes a transport | `DELETE /api/transports/:id` — `routes.ts:8193`, same guard | same |
| `dashboard.tsx:881/896/911` `button-complete-transport-${id}` / `button-mark-spare-pickup-${id}` / `button-mark-spare-return-${id}` | Row-level status mutations | same PATCH route | same |

(`button-route-optimization` is read-only, no mutation route found — not a gap.)

### `/communications`

| Control (file:line, testid) | Opens/does | Mutation route + guard | Should require |
|---|---|---|---|
| `CustomerCommunications.tsx:900` `button-preview-apk` | Leads to sending APK reminder emails | `POST /api/notifications/send`, mount guard `MANAGE_NOTIFICATIONS` (`server/index.ts:414`) | MANAGE_NOTIFICATIONS |
| `CustomerCommunications.tsx:1098` `button-preview-maintenance` | Same, maintenance reminders | same | MANAGE_NOTIFICATIONS |
| `CustomerCommunications.tsx:1237` `button-preview-custom` | Same, custom message | same | MANAGE_NOTIFICATIONS |

The page's sidebar `anyOf` is `[MANAGE_EMAIL_TEMPLATES, MANAGE_NOTIFICATIONS]` (OR) — a `MANAGE_EMAIL_TEMPLATES`-only user sees the page and these three buttons, but the actual send needs `MANAGE_NOTIFICATIONS` specifically; they are indistinguishable today.

### `/reports`

| Control (file:line, testid) | Opens/does | Mutation route + guard | Should require |
|---|---|---|---|
| `client/src/pages/reports/index.tsx:1338` `card-report-builder` | Report builder | Builder's own Save: `POST /api/reports/saved` — `server/routes/reports.ts:232`, `MANAGE_REPORTS` | MANAGE_REPORTS (for saving) |
| `client/src/pages/reports/report-builder.tsx:284` `button-save-report` | Saves a custom report | same route | MANAGE_REPORTS — file has no `useHasPermission` check at all; reachable by `VIEW_REPORTS`-only users |

(`card-maintenance-costs` and `button-print-transports-report` are read-only — not a gap.)

### `/customers`

| Control (file:line, testid) | Opens/does | Mutation route + guard | Should require |
|---|---|---|---|
| `client/src/pages/customers/index.tsx:305` `button-delete-customer-${id}` | Deletes a customer | `DELETE /api/customers/:id` — `routes.ts:2575`, `MANAGE_CUSTOMERS` | MANAGE_CUSTOMERS |
| `client/src/components/customers/customer-add-dialog.tsx:33` `button-add-customer` | Add Customer form | `POST /api/customers`, `MANAGE_CUSTOMERS` | MANAGE_CUSTOMERS |
| `client/src/components/customers/customer-details.tsx:906` `button-add-driver` | Adds a driver | `POST /api/customers/:customerId/drivers` — `routes.ts:7046`, `MANAGE_CUSTOMERS` | MANAGE_CUSTOMERS |
| `customer-details.tsx:1083` `button-edit-driver-${id}` | Edits a driver | `PATCH /api/drivers/:id` — `routes.ts:7116`, `MANAGE_CUSTOMERS` | MANAGE_CUSTOMERS |
| `customer-details.tsx:1093` `button-delete-driver-${id}` | Deletes a driver | `DELETE /api/drivers/:id` — `routes.ts:7224`, `MANAGE_CUSTOMERS` | MANAGE_CUSTOMERS |

### `/scan`

| Control | Opens/does | Mutation route + guard | Should require |
|---|---|---|---|
| `client/src/pages/scan/index.tsx` → `ScanPanel` (whole flow) | Pickup/return/generic scan | `POST /api/reservations/:id/pickup`/`.../return`, `MANAGE_RESERVATIONS` | MANAGE_RESERVATIONS |

**Total: 68 distinct controls/control-groups documented above across 11 pages that are visible regardless of the permission their action needs** (dashboard 18, `/vehicles` 5, `/reservations` 13, `/maintenance` 2, `/expenses/add` 1, `/documents` 8, `/delivery` 6, `/communications` 3, `/reports` 2, `/customers` 5, `/scan` 1 — plus roughly a dozen more individual buttons where a row above groups several near-identical siblings, e.g. the 3 dashboard scan tiles or the 4 template-editor Save/Create/Delete/Rename buttons).

### Controls already correctly gated (pattern reference)

| Location | Control | Pattern |
|---|---|---|
| `client/src/pages/vehicles/index.tsx:628-637` | `button-open-recycle-bin` | `{isAdmin && <Button/>}` conditional render — **role** check, not permission (per task-7-report.md, deliberate: manager/maintenance hold `MANAGE_VEHICLES` but don't see this button) |
| `client/src/components/user-menu.tsx:130-160` | `menu-users`, `menu-backup`, `menu-settings` | `{user.role === UserRole.ADMIN && (...)}` around the whole admin section — role check, not `MANAGE_USERS`/`MANAGE_BACKUPS`/`MANAGE_SETTINGS` permission |
| `client/src/pages/portal-admin/index.tsx:58-68` | `button-fiscal-overview`, `button-import-fines`, `button-invite-portal-account` | `{canViewFiscal/canManageFines/canManage && <Button/>}`, each from a dedicated hook checking its own specific permission (`useFiscalPermissions`, `useCanManageFines`, `useCanManagePortal`) — this is the pattern closest to what B-27 needs, just missing the "grey out, don't hide" half |
| `client/src/components/portal-admin/accounts-table.tsx:16-19,54` | `button-invite-portal-account` (list view) | `useCanManagePortal()` → `role===ADMIN \|\| permissions.includes(MANAGE_PORTAL)`, `{canManage && <AccountDialog>...}` |
| `client/src/components/fines/fines-table.tsx:31-38,80-87` | `button-fines-bin`, `button-cjib-imports`, `button-import-fines`, `button-new-fine` | `{canManage && (<div>...)}` via `useCanManageFines()`, `isAdmin` nested further for the recycle bin |
| `client/src/pages/documents/index.tsx:1422` | `isAdmin` prop into `DamageCheckTemplateStudio` | Prop-drilled role gate for one sub-feature (header-image upload), matching `requireAdmin` server-side (`server/routes/damage-check-templates.ts:147`) |

Every existing pattern **hides** the control (`{condition && <Element/>}`); none disables-with-explanation. This is the same style the sidebar itself uses (`sidebar-nav.tsx:47`, `.filter(hasPermission)`).

### Existing disabled+tooltip pattern

**None found for permission.** A `Tooltip` + `disabled` combination exists in 5 files (`reservation-form.tsx`, `reservation-view-dialog.tsx`, `vehicle-details.tsx`, `reservations/calendar.tsx`, `vehicles/index.tsx`), but every instance found is **business-state-based**, not permission-based — e.g. `vehicles/index.tsx:296-320`, the Reserve button is `disabled` with a tooltip reading "vehicle not available for rental" when `availabilityStatus === 'not_for_rental'`. No shared `PermissionButton`/`DisabledTooltip`-style wrapper component exists anywhere under `client/src/components/ui` or elsewhere (grepped, zero hits). **A B-27 "greyed out, function switched off" house style would be introduced from scratch, not extended from an existing pattern.**

---

## 4. WHAT THE E2E SUITE ASSUMES

- **`e2e/registry/roles.ts`-adjacent `e2e/support/roles.ts:8`**: `can(role, anyOf) = role === "admin" || anyOf.some(p => PROFILES[role].includes(p))` — mirrors the client's `useHasPermission`/sidebar logic exactly. `PROFILES` (`e2e/seed/users.ts:13-24`) is the suite's own assumption of what each of 7 roles (`admin, manager, user, cleaner, viewer, accountant, maintenance`) should hold; the file's own header comment calls this "an assumption the E2E suite makes … Task 9 puts that assumption in front of the owner" — i.e. these profiles are not the owner's actual account configuration, and B-29's menu/server realignment could change which of the 7 profiles are still internally consistent.
- **`e2e/registry/pages.ts:1-60`** — `PageEntry.api: string | null`, one GET per page used only to prove a 403 for a role the sidebar refuses. Comments already document the `/maintenance` (`api: null`), `/delivery`, `/communications` mismatches this fact sheet re-confirms in §2. **Whatever B-29 resolves for these three pages requires updating this file's `anyOf` and/or `api` values to match the new guard**, and correspondingly:
  - **`e2e/layer-a/forbidden.spec.ts:15-18`** — `if (entry.api !== null) { const refused = await request.get(entry.api); expect(refused.status()).toBe(403); }`. If B-29 adds a real `MANAGE_MAINTENANCE`-gated GET for `/maintenance`, `api: null` should become that route, turning a currently-skipped assertion into an enforced one.
  - **`forbidden.spec.ts:24-30`** — "A typed address: the client has no page-level refusal today (ProtectedRoute only checks the login). It must at least not crash." This comment is the exact statement of the B-28 gap; once B-28 ships, this test's intent should upgrade from "does not crash" to "shows the no-access message" — likely asserting the new access-denied UI's text/testid appears, not just the absence of `boundary`/`pageerror`/`http` violations.
  - **`forbidden.spec.ts:22`** — `await expect(page.locator('nav a[href="${entry.path}"]')).toHaveCount(0)` (sidebar link absent) is unaffected by B-27/28/29 as long as the sidebar continues to hide links by permission (B-27 is only about in-page controls, not the sidebar itself, per the owner's "laten staan maar grijs maken" wording applying to buttons/tiles, not nav links — **not verified that this reading is what the owner intends for the sidebar itself; flagged in Open Questions**).
- **`e2e/layer-a/pages.spec.ts:9-15`** — for every page a role *can* use, asserts `health.violations` is empty (no console error, no unhandled 403 toast, etc.). If B-29 changes a page's server guard to be narrower (option B/A variants in §2), a currently-passing role/page combination could start failing this test until `PAGES`/`PROFILES` are updated in lockstep — this is the direct mechanism by which a B-29 change could break currently-green tests.
- **`e2e/registry/dialogs.ts:1-98`**, used by **`e2e/layer-a/dialogs.spec.ts:8`** (`DIALOGS.filter(candidate => can(role, candidate.anyOf))`) — every one of the 33 registered dialog openers carries an `anyOf` describing **today's actual (often too-broad) visibility gate**, not the action's own narrower permission. E.g. `dialogs.ts:35-40` registers the four dashboard quick-action openers as `anyOf: [VIEW_DASHBOARD]` with an explicit comment: "QuickActions renders every tile for anyone who can see \"/\", with no per-action permission check of its own … `anyOf: [VIEW_DASHBOARD]` reflects that reality." **Every one of these `anyOf` values will need to change to the narrower permission once B-27 hides/disables per-action** — otherwise the spec will keep clicking a tile that no longer renders for that role (or that now renders disabled, in which case the spec's `page.getByTestId(entry.opener).click()` at `dialogs.spec.ts:22` would need to become a "control renders but is disabled, and clicking it does nothing" assertion for the roles that lose access, alongside a working-click assertion for the roles that keep it).
- **`dialogs.ts:26-31`** (`menu-users`/`menu-backup`/`menu-settings`, `anyOf: []`) and **`dialogs.ts:44-46`** (`button-open-recycle-bin`, `anyOf: []`) already encode "gated by `role === admin`, not a permission" via the empty-array convention (`can()` then only passes via its own `role === "admin"` fallback, `roles.ts:8`) — these are the one place the registry already distinguishes a role-gate from a permission-gate; B-29/B-27 work on these two controls would need to either keep using this convention or introduce a real permission for them (the sidebar/menu itself has no notion of `MANAGE_USERS`-gates-the-menu-item today — see Open Questions).
- **`e2e/registry/coverage-baseline.json`** (`{"unreached": 93}`, read by `scripts/e2e-dialog-coverage.ts`) will need no change for B-27/28/29 by itself, but any new dialog (e.g. a B-28 "no access" full-page component, if built as a `<Dialog>` rather than inline content — not expected, but worth noting) would move this number and require a baseline bump, per the mechanism task-7-report.md's "Fix round 1" already describes.
- Nothing in the current suite exercises a **disabled-but-visible** control at all — `dialogs.spec.ts`'s only two actions per test are "click the opener" and "close the dialog" (lines 21-22, 34-38); there is no existing assertion shape for "control is visible, has `disabled` (or `aria-disabled`), and clicking it does nothing" — B-27 will need a new assertion pattern in this spec (or a new one), not just new registry entries.

---

## 5. OPEN QUESTIONS

1. **B-28's exact trigger condition on `/maintenance`.** Per §2 row 7, no GET the page depends on is gated by `MANAGE_MAINTENANCE` at all — so a purely server-driven "did any request I fired 403" signal cannot detect "this user lacks `MANAGE_MAINTENANCE`" today (the requests would all succeed for a vehicle/reservation-view role that lacks maintenance rights). Should B-28's no-access check be a **client-side permission check per route** (a lookup table of "route → required `anyOf`", independent of what the GETs happen to return), or should it wait on B-29 first adding a real server signal to detect from? These two decisions are coupled — building B-28 for `/maintenance` before B-29 resolves this page effectively requires the client-side-lookup approach regardless of what's chosen elsewhere.
2. **Which options for `/maintenance`, `/delivery`, `/communications` (§2) does the owner want?** Options are given but not chosen. In particular for `/delivery`, narrowing `/api/transports`' guard (option B) affects `/` and `/reports` too (§2 rows 1 and 13 both call this same route) — worth the owner/designer seeing that ripple before deciding.
3. **Does B-27 ("buttons and tiles … stay visible but greyed out") apply to sidebar/menu links too, or only in-page controls?** The owner's wording ("knoppen verbergen die iemand niet mag gebruiken? … laten staan maar grijs maken") was given in response to a question about buttons specifically (V-3, `docs/e2e/werkstromen/01-balie.md §7` — not read in full as part of this fact sheet); today the sidebar already **hides** links entirely (`sidebar-nav.tsx:47`), which is the opposite of "stay visible but greyed out." If B-27 extends to the sidebar, that's a behavior change to `sidebar-nav.tsx` beyond what B-27's own description (which names dashboard tiles and `/vehicles` buttons) implies; if it doesn't, the sidebar's current hide-behavior and B-28's "typed address" scenario both stay as the only way a user discovers a page is off-limits.
4. **Multi-permission controls**: several controls in §3 need **two different permissions together** (e.g. the dashboard's APK-report-upload tile needs both `MANAGE_DOCUMENTS` and `MANAGE_VEHICLES`; `button-send-to-service` needs `MANAGE_RESERVATIONS` *or* `MANAGE_MAINTENANCE`). Should the greyed-out state require *all* of a control's permissions, matching the strictest read of its own server route, or is *any one* sufficient where the server itself accepts an OR? These need to be decided per control, not globally — `useHasPermission(...anyOf)` today is OR-only; an AND case would need new hook support.
5. **The three `/communications` preview-and-send dialogs** (`button-preview-apk/maintenance/custom`) are already excluded from Layer A E2E coverage because they need multi-step setup before they open (task-7-report.md finding 3) — should B-27's greyed-out treatment for these three wait for a Layer B story to exist to test it, or is a visual-only check (no interaction) acceptable for now?
6. **`calendar.tsx`'s unused `canManageReservations` variable** (`reservations/calendar.tsx:198-200`, per §3) — was flagged by the research sweep as defined but not applied to the pickup/return/edit/status/delete buttons; this fact sheet did not independently re-verify that specific claim line-by-line. Worth a direct check before design work assumes it's true, since if it's already applied somewhere the §3 table for `/reservations` would need correcting.
7. **The dead locale key `settings.json:169`** (`backup.accessDeniedMessage`, "Je hebt geen toestemming om deze pagina te openen.") — was this meant for a page-level access-denied component that was never built, or is it simply stale? If meant for page-level use, its wording is closer to what B-28 needs than the two dialog-scoped keys that are actually in use today.
8. **Whether B-28's message applies to the "reached without a sidebar entry" pages** (`/reservations/edit/:id`, `/expenses/add`, §1) the same way it does to the 11 sidebar-listed pages — since these have no `anyOf` in the menu to compare against, B-28 needs an explicit permission assigned to them (this fact sheet's §1 states what each functionally needs: `VIEW_RESERVATIONS`/`MANAGE_RESERVATIONS` to load and `MANAGE_RESERVATIONS` to save for the first; `MANAGE_EXPENSES` for the second) rather than reusing a sidebar value that doesn't exist for them.
