# Customer portal: vehicle overview, maintenance requests and calendar link

Date: 2026-09-06. Branch: `feat/customer-portal`. Status: approved design, awaiting implementation plan.

## Goal

A customer sees the vehicles they have on the road in the portal, reports maintenance on one of them (optionally asking for a replacement vehicle), and is kept informed while Lam Groep plans, executes and finishes that maintenance. Staff confirm the request from the Klantenportaal dashboard; confirming puts the maintenance in the existing maintenance calendar. Everything staff do to that maintenance block afterwards (move it, take the car in, hand it back) reaches the customer as a portal notification and an e-mail. Up to 48 hours before the block starts, the customer can ask to move it.

## Decisions taken with Kees

- The vehicle overview shows only vehicles in use (reservation status `picked_up`).
- Approving a maintenance request creates a maintenance block in the calendar. Replacement transport is not chosen by the customer: when the customer asks for one, approval creates a placeholder spare that staff fill in later through the existing spare-vehicle flow. The customer never sees the placeholder.
- The customer gets notifications for every maintenance block on a vehicle they have in use, also when staff plan it directly in the calendar without a portal request.
- Notifications come from hooks at the write points of maintenance blocks (approach A), not from a periodic scan.
- The customer can ask to move planned maintenance until 48 hours before the block starts. Later than that the portal tells them to phone.

## Existing building blocks this design relies on

- Maintenance is a row in `reservations` with `type = 'maintenance_block'`, `maintenanceStatus` `scheduled | in | out`, `maintenanceCategory` `scheduled_maintenance | repair`, `maintenanceDuration` in days. Created by `storage.createMaintenanceBlock` (`server/database-storage.ts`), edited through `PATCH /api/reservations/:id`, spare handling through `POST /api/reservations/maintenance-with-spare`.
- Placeholder spares are `reservations` rows with `type = 'replacement'`, `vehicleId = null`, `placeholderSpare = true`, created by `storage.createPlaceholderReservation(originalReservationId, customerId, startDate, endDate?)`; staff assign a car with `POST /api/placeholder-reservations/:id/assign-vehicle`.
- Customer notifications: `customerNotifications.notify` in `server/services/portal-customer-notifications.ts` with `dedupeTag`.
- Staff notifications: `notifyStaffOfPortalEvent` in `server/services/portal-notifications.ts` (writes `custom_notifications`, broadcasts, mails the portal notification address).
- Portal requests: `shared/portal-requests.ts` (types, payload schemas, `REQUEST_NEEDS`), `server/routes/portal.ts` (customer side), `server/routes/portal-requests.ts` (staff side, `approveBooking`, `finish`).
- Portal UI vocabulary: `client/src/components/portal/ui.tsx`, `ReservationPicker`, `PeriodPicker`, `PortalDialogsProvider`, the 5-row list plus "Alles bekijken en zoeken" dialog pattern.
- Service-due computation: `shared/service-due.ts` and `getServiceDueVehicles` in `server/utils/service-due-scanner.ts`.

## 1. Data model

### 1.1 Request payloads (`shared/portal-requests.ts`)

`maintenance` payload gains:

- `needsReplacement: boolean` (default false). "Ik heb vervangend vervoer nodig".
- `preferredDate?: iso date`. Optional wish; must not be in the past.

New request type `maintenance_change`, `REQUEST_NEEDS = 'reservation'` where the linked reservation is the maintenance block itself (not the rental):

- `newDate: iso date` (required, at least tomorrow)
- `reason: string` (1..500)
- `needsReplacement: boolean` (default false)

`REQUEST_LABEL` and the nl/en `requests.type.*` texts get `maintenance_change` = "Onderhoud wijzigen" / "Change maintenance".

### 1.2 Reservations

New nullable column `reservations.portal_request_id integer` (Drizzle `portalRequestId`). Set on a maintenance block that was created from a portal request. Used by the staff calendar to show "Uit portaal, aanvraag #12" and by the request dialog to link back to the block. Added with `addColumnIfNotExists` in `startup-migration.js`.

No other schema changes. Customer notifications keep using `portal_notifications`; staff notifications keep using `custom_notifications`.

### 1.3 Error codes (`shared/portal-types.ts` `PORTAL_ERROR`)

- `PORTAL_MAINTENANCE_TOO_LATE`: block starts within 48 hours, or the block is already `in` or `out`.
- Existing `PORTAL_DUPLICATE_REQUEST` is reused for a second open maintenance request on the same rental and for a second open change request on the same block.

## 2. Customer side

### 2.1 Vehicle overview page

Route `/portaal/voertuigen`, header tab "Voertuigen" between Reserveringen and Contracten, entry in the mobile "Meer" menu. Visible to every portal role; drivers see only their own vehicle (same scoping as reservations).

Data: `GET /api/portal/vehicles/mine` returns one item per `picked_up` reservation of the customer:

```
{
  reservationId, vehicle: { id, licensePlate, brand, model, apkDate, currentMileage },
  driver: { id, displayName } | null,
  startDate, endDate,
  lastReportedMileage: { value, at } | null,      // latest mileage request or return mileage
  serviceDue: 'due' | 'soon' | null,
  maintenance: {
    blockId, startDate, endDate, status: 'scheduled' | 'in' | 'out',
    category, canRequestChange: boolean,            // false within 48 h or once status is in/out
    openChangeRequestId: number | null,
    replacement: { licensePlate, brand, model, status } | null   // only when a real vehicle is assigned; placeholders are never sent
  } | null,
  openMaintenanceRequestId: number | null
}
```

`maintenance` is the next block for that vehicle whose `maintenanceStatus` is not `out` (or the `out` block finished in the last 7 days, so "Auto klaar" stays visible briefly), ordered by start date. Only blocks that overlap the rental period count.

Page layout follows the overview page: search box (plate, car, driver, dash-insensitive), first 5 cards, "Alles bekijken en zoeken" dialog for the rest. Empty state "Geen auto in gebruik".

Vehicle card:

- Plate chip, brand and model, `DriverChip`, period of the rental.
- APK line with colour: green when more than 30 days away, amber within 30 days, red when expired.
- Maintenance line, one of: "Bijna toe aan onderhoud" (serviceDue soon), "Onderhoud nodig" (due), "Onderhoud gepland op 12-10-2026" (scheduled), "Auto in onderhoud sinds …" (in), "Onderhoud klaar op …" (out), plus "Vervangend vervoer: 12-AB-34 Kia Picanto" when assigned.
- Mileage line: last reported value and date, or "Nog geen kilometerstand doorgegeven".
- Buttons: "Onderhoud melden" (hidden while an open maintenance request exists; then a link "Aanvraag #12 bekijken"), "Schade melden", "Kilometerstand doorgeven". When a block is scheduled and `canRequestChange`: "Onderhoud wijzigen". When a block is scheduled and not `canRequestChange`: muted text "Wijzigen kan tot 48 uur van tevoren. Bel Lam Groep: {phone}" with the phone number from the portal config.
- Clicking the card opens the existing reservation dialog.

The reservation dialog gets the same maintenance line and buttons for `picked_up` reservations, so both entry points behave the same.

### 2.2 Maintenance request form

Existing `maintenance` form in `RequestForm` gains:

- Checkbox "Ik heb vervangend vervoer nodig tijdens het onderhoud".
- Optional "Gewenste datum" (single-day calendar, minimum tomorrow).

Server (`POST /api/portal/requests`) rejects a second open `maintenance` request on the same reservation with `PORTAL_DUPLICATE_REQUEST`.

### 2.3 Maintenance change request form

Opened from "Onderhoud wijzigen". Fields: new date (calendar, minimum tomorrow), reason, checkbox replacement still needed. The linked reservation is the block; the form shows the block's current date read-only.

Server checks, in order: block exists and belongs to the customer (a maintenance block has no customerId, so ownership is "the customer has a `picked_up` rental on that vehicle overlapping the block"); `maintenanceStatus === 'scheduled'`; block start is at least 48 hours away, counted from `startDate` plus `startTime` when set, otherwise 08:00 Europe/Amsterdam; no other open `maintenance_change` request for the block. Failures: `PORTAL_MAINTENANCE_TOO_LATE` or `PORTAL_DUPLICATE_REQUEST`.

### 2.4 Notifications bell

New notification types shown with a wrench icon: `maintenance_planned`, `maintenance_moved`, `maintenance_in`, `maintenance_out`, `maintenance_cancelled`, `replacement_ready`. Links go to `/voertuigen` (the card of that vehicle) or to the request.

## 3. Staff side

### 3.1 Request dialog: maintenance

For type `maintenance` the staff request dialog (`client/src/components/portal-admin/portal-request-dialog.tsx`) shows a summary block: issue, mileage, urgent, replacement wanted, preferred date. Below it a "Inplannen" section (new component `MaintenanceApproval`, sibling of `BookingApproval`):

- Date (calendar, prefilled with the preferred date or tomorrow), duration in days (default 1), category (onderhoudsbeurt / reparatie, default reparatie when the customer marked urgent), staff note.
- Button "Inplannen en bevestigen".

`POST /api/portal-requests/:id/approve` for `maintenance` with body `{ startDate, durationDays, category, note? }`:

1. Creates the block via `createMaintenanceBlock` and patches category, duration, `portalRequestId`, notes "Portaal aanvraag #id: {issue}" plus the staff note.
2. If `payload.needsReplacement`: `createPlaceholderReservation(rentalId, customerId, startDate, endDate)`; sets the block's `spareAssignmentDecision = 'spare_assigned'` and `affectedRentalId`.
3. If `payload.mileage` is higher than `vehicles.currentMileage`: updates `currentMileage`.
4. Runs the maintenance hook (section 4) so the customer gets "Onderhoud gepland".
5. Finishes the request as `done` with the automatic reply "Ingepland op {date}, duur {n} dag(en)." plus the staff note. Uses the existing `finish()` so the customer notification, mail, activity and audit log follow.

Guard: a `maintenance` request can not be set to `done` through `/reply` without a block; it can be `rejected`. Same pattern as `BOOKING_NEEDS_RESERVATION` (`MAINTENANCE_NEEDS_BLOCK`).

### 3.2 Request dialog: maintenance change

Summary block: current block date, requested date, reason, replacement still needed. "Verplaatsen" section prefilled with the requested date and the block's current duration. Approve body `{ startDate, durationDays, note? }`:

1. Updates the block dates through the existing reservation update path so the maintenance conflict logic runs (customer rentals during the block never block the update).
2. If a placeholder spare exists for the block, moves it to the new period; if none exists and the customer still asks for one, creates it; if one exists and the customer no longer needs it, leaves it for staff to decide (never deletes automatically).
3. Hook fires "Onderhoud verplaatst".
4. Request finishes as `done` with reply "Verplaatst naar {date}."

Rejecting leaves the block untouched and tells the customer why via the normal reply.

### 3.3 Klantenportaal dashboard

New tile "Onderhoud" in `DashboardTiles`: count of open `maintenance` and `maintenance_change` requests plus placeholder spares that still need a vehicle and belong to a block with `portalRequestId`. Clicking opens the requests list filtered on those types. `PortalDashboard.counts.maintenance` added to the dashboard DTO.

### 3.4 Maintenance calendar

`client/src/pages/maintenance/calendar.tsx` and the view/edit dialogs show "Uit klantenportaal, aanvraag #12" with a link that opens the portal request dialog when `portalRequestId` is set. No other calendar changes.

## 4. Maintenance events (hook)

New service `server/services/portal-maintenance-events.ts`:

```
onMaintenanceBlockChanged(before: Reservation | null, after: Reservation | null): Promise<void>
onReplacementAssigned(replacement: Reservation): Promise<void>
```

Rules for `onMaintenanceBlockChanged`:

- Only acts when the block (before or after) has `type = 'maintenance_block'` and a `vehicleId`.
- Finds the customer: the `picked_up` rental on that vehicle overlapping the block period (after, or before when after is null). No customer, no portal account: nothing happens.
- Events and dedupe tags:
  - `before == null` or before was cancelled/deleted and after is scheduled: `maintenance_planned`, tag `maint:<id>:planned:<startDate>`.
  - Start or end date changed while scheduled: `maintenance_moved`, tag `maint:<id>:moved:<startDate>:<endDate>`.
  - `maintenanceStatus` changed to `in`: `maintenance_in`, tag `maint:<id>:in`.
  - Changed to `out`: `maintenance_out`, tag `maint:<id>:out`.
  - After is null, cancelled or deleted while it was scheduled: `maintenance_cancelled`, tag `maint:<id>:cancelled`.
- Each event writes a customer notification (title with the plate, description with car, date, and for `planned`/`moved` the pickup info from the portal config) and sends the `portal_maintenance` mail to the customer's APK/maintenance e-mail address when set, otherwise the account e-mail. Mail is skipped when the same dedupe tag already existed.
- Never throws; errors are logged, the calling route continues.

`onReplacementAssigned`: when a `replacement` reservation gets a real `vehicleId` (placeholder filled or `assign-spare`) and the original rental belongs to a portal customer: notification `replacement_ready` with plate, brand, model and pickup info, tag `spare:<replacementId>:<vehicleId>`.

Call sites (each wraps the existing write, passing the row before and after):

- `POST /api/reservations` when `type = 'maintenance_block'`
- `PATCH /api/reservations/:id` for maintenance blocks (dates, status, cancel)
- `DELETE /api/reservations/:id` for maintenance blocks
- `POST /api/reservations/maintenance-with-spare` (block dates may change; replacements created here call `onReplacementAssigned`)
- `PATCH /api/vehicles/:id/maintenance-status` when it changes the linked block's status
- `POST /api/placeholder-reservations/:id/assign-vehicle` and `POST /api/reservations/:id/assign-spare` (`onReplacementAssigned`)
- Portal approvals in sections 3.1 and 3.2

Staff side: a new `maintenance` or `maintenance_change` request calls `notifyStaffOfPortalEvent` with kind `portal_maintenance`, title "Onderhoudsmelding {plate}" / "Wijziging onderhoud {plate}", link `/portal-admin?request=<id>`. Urgent requests get `priority: 'high'`.

## 5. Mail

New template `portal_maintenance` in `server/services/portal-mail.ts`, editable under E-mailsjablonen like the other portal templates. Variables: customer name, plate, car, event text, date, end date, pickup address, opening hours, portal link. One template, the event text differs per event.

## 6. Language

All new texts in `client/src/locales/nl/portal.json` and `en/portal.json`, both for the customer pages and the staff `admin.*` keys. Dates shown with the existing `formatPortalDate`.

## 7. Tests (vitest + supertest, existing helpers in `server/__tests__/portal-helpers.ts`)

Customer routes (`portal-routes.test.ts`):

- `vehicles/mine` returns only the customer's `picked_up` rentals, never another customer's, never a placeholder replacement.
- Second open `maintenance` request on the same rental is `PORTAL_DUPLICATE_REQUEST`.
- `maintenance_change`: 49 hours before start is accepted, 47 hours is `PORTAL_MAINTENANCE_TOO_LATE`, block with status `in` is `PORTAL_MAINTENANCE_TOO_LATE`, second open change request is `PORTAL_DUPLICATE_REQUEST`, block on another customer's vehicle is 404.

Staff routes (`portal-requests-routes.test.ts`):

- Approving `maintenance` creates a block with `portalRequestId`, category and duration; with `needsReplacement` also a placeholder replacement for the rental; mileage updates the vehicle only when higher.
- Approving without `startDate` is 400. Setting a `maintenance` request to `done` via `/reply` without a block is 400 `MAINTENANCE_NEEDS_BLOCK`; `rejected` is allowed.
- Approving `maintenance_change` moves the block and the placeholder; a customer notification `maintenance_moved` exists afterwards.

Events (`portal-maintenance-events.test.ts`):

- planned, moved, in, out, cancelled each produce exactly one notification; calling twice with the same state produces none; a vehicle without a portal customer produces none.
- `onReplacementAssigned` produces `replacement_ready` once.

Shared (`shared/portal-requests.test.ts` or existing schema tests): payload parsing for the new fields, `maintenance_change` rejects dates in the past.

The current suite (24 files, 102 tests) stays green. Tests scope every list assertion by customerId because files run in parallel on the shared dev database.

## 8. Out of scope

- The customer choosing or seeing a spare before it is assigned.
- The customer cancelling planned maintenance (they can ask to move it; cancelling is a phone call or a free-text request).
- Changes within 48 hours of the block.
- A separate "replacement vehicle" request type outside maintenance.
- Two-way sync with an external workshop system.

## 9. Order of work (for the implementation plan)

1. Schema, migration, shared types and payload schemas, error codes, translations.
2. Event service and its tests; wire the staff call sites.
3. Customer routes: `vehicles/mine`, request checks, change request; tests.
4. Staff routes: approve for `maintenance` and `maintenance_change`, guard, dashboard count; tests.
5. Customer UI: vehicles page, card, dialog additions, forms, bell types.
6. Staff UI: approval components, dashboard tile, calendar back-link.
7. Mail template, docs, browser verification (desktop and 375px), test data cleanup.
