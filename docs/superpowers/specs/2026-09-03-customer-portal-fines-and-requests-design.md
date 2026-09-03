# Customer Portal — Parts 3 and 4: Fines and Requests

Date: 2026-09-03
Status: Approved for planning

## Context

Part 1 (foundation, spec `2026-09-02-customer-portal-foundation-design.md`) is
built on branch `feat/customer-portal`: portal accounts, login realm, iframe
embedding, reservations and contracts in the portal, driver management with an
assignment history, per-customer feature switches, staff management screens and
live staff notifications. This spec covers the two next parts:

- **Part 3 — Fines.** Staff enter traffic fines; the system attributes them to
  the reservation and the driver at the time of the offence using the driver
  assignment history; customers see their fines in the portal.
- **Part 4 — Requests.** Customers submit typed requests (rental extension,
  early return, damage report, question about a fine, other); staff handle them
  in an inbox and reply; replies reach the customer in the portal and by e-mail.

Part 2 (online booking) remains a separate spec.

## Decisions taken

- **Financial flow of a fine:** Lam Groep pays the authority and recharges the
  customer, plus an administration fee. Statuses follow that flow:
  `new` → `linked` → `charged` → `paid`, with side states `disputed` and
  `cancelled`.
- **Attribution:** automatic when exactly one reservation on that licence plate
  covers the offence moment; otherwise the fine stays `new` ("niet gekoppeld")
  and staff pick the customer and, optionally, the driver from the candidates
  the system shows. A customer never sees a fine that is not linked to them.
- **Requests:** five fixed types; staff reply from the app; the reply is shown
  in the portal and e-mailed to the customer. Approving an extension or early
  return changes the reservation itself (with the existing conflict check).
- Both parts respect the part-1 switches `canViewFines` and `canSubmitRequests`
  and the `driver` role (drivers only see their own fines and requests).

## Part 3 — Fines

### Data model

Table `fines` (in `shared/schema.ts`, DDL in `startup-migration.js`):

| column | type | notes |
|---|---|---|
| id | serial PK | |
| license_plate | text not null | as entered (normalised uppercase, no dashes) |
| vehicle_id | integer FK vehicles, set null | resolved from the plate when it exists |
| offence_at | timestamp not null | moment of the offence |
| received_at | text (YYYY-MM-DD) | date the letter arrived |
| reference | text | CJIB / authority reference |
| description | text not null | e.g. "Snelheid 12 km/u te hard, A2" |
| amount | numeric(10,2) not null | fine amount |
| admin_fee | numeric(10,2) not null default 0 | pre-filled from settings, editable per fine |
| total_amount | numeric(10,2) not null | amount + admin_fee, stored for reporting |
| letter_file_path | text | uploaded letter (PDF/JPG/PNG) under `uploads/fines/` |
| status | text not null default 'new' | `new`, `linked`, `charged`, `paid`, `disputed`, `cancelled` |
| customer_id | integer FK customers, set null | set at linking |
| reservation_id | integer FK reservations, set null | set at linking |
| driver_id | integer FK drivers, set null | set at linking, optional |
| linked_at, linked_by | timestamp, text | |
| charged_at, invoice_reference | timestamp, text | set by "Doorbelasten" |
| paid_at | timestamp | set by "Betaald" |
| internal_notes | text | staff only |
| customer_note | text | shown to the customer |
| created_at, updated_at, created_by, updated_by | | |

Indexes: `(license_plate, offence_at)`, `(customer_id, status)`.

Valid transitions: `new → linked | cancelled`; `linked → charged | disputed | cancelled | new` (unlink); `charged → paid | disputed`; `disputed → linked | charged | cancelled`; `paid` and `cancelled` are final. Enforced in `shared/fines.ts` (`FineStatus`, `isValidFineTransition`), shared by server and client.

Setting: `portal_config.fineAdminFee` (numeric, default 0) added to the existing
portal config (Instellingen > Klantenportaal).

Permissions: `UserPermission.MANAGE_FINES = 'manage_fines'`,
`VIEW_FINES = 'view_fines'` (admin has both).

### Attribution

`server/services/fine-attribution.ts`:

- `findCandidates(licensePlate, offenceAt)` returns reservations on that plate
  (types `standard`/`replacement`, not deleted, status not `cancelled`) whose
  period covers the offence date, plus reservations within ±3 days as
  "near" candidates. Period = `start_date` .. `end_date` (open-ended = still
  running); when `actual_pickup_date`/`actual_return_date` are set they take
  precedence over the planned dates.
- `driverAt(reservationId, offenceAt)` reads `reservation_driver_assignments`
  for the row where `assigned_from <= offenceAt < coalesce(assigned_until, ∞)`,
  falling back to `reservations.driver_id`.
- `attributeFine(fineId)`: exactly one covering candidate → sets customer,
  reservation, driver, status `linked`, `linked_by = 'system'`. Otherwise leaves
  `new` and returns the candidate list for the UI.
- `linkFineManually(fineId, { customerId, reservationId?, driverId? }, staffUser)`:
  validates the reservation belongs to the customer and the driver belongs to
  the customer, then sets `linked`.

### Staff UI (dialogs, like the rest of the app)

No new pages. The existing Klantenportaal page (`/portal-admin`) gets a tab
"Bekeuringen"; everything else is a dialog, registered in
`GlobalDialogContext` (`openFineDialog(id)`, `openNewFineDialog()`) so it can
open from the tab, from the customer dialog, from the vehicle dialog and from
notification links (`/portal-admin?fine=<id>` opens the dialog on load).

- Tab "Bekeuringen" (permissions `view_fines`/`manage_fines`): table with
  filters status, customer, licence plate, period; columns plate, offence date,
  description, customer, driver, amount (+ fee), status; button
  "Nieuwe bekeuring"; row click → `FineDialog`.
- `NewFineDialog`: plate (with vehicle lookup), offence date/time, received
  date, reference, description, amount, admin fee (pre-filled), letter upload.
  On save the attribution runs and the same dialog shows the result: linked
  automatically, or the candidate list to pick from (customer + reservation +
  driver, or customer only). Closing after save opens `FineDialog`.
- `FineDialog` (view/edit): all fields editable while not `paid`/`cancelled`;
  status actions "Koppelen"/"Ontkoppelen", "Doorbelasten" (asks invoice
  reference), "Betaald", "Betwist", "Annuleren"; letter preview/download;
  internal notes; links to the customer, reservation and driver dialogs.
- Customer dialog, Portaal tab: list of that customer's fines (row → `FineDialog`).
- Vehicle dialog: a "Bekeuringen" count with a link that opens the tab filtered
  on that plate.
- Staff actions go through `AuditLogger` (`fine.create`, `fine.link`,
  `fine.status`).
- Linking a fine e-mails the customer (template `portal_fine_linked`, editable
  under Communicatie) to the customer's `email` (fallback `emailForInvoices`)
  when the customer's portal is enabled; failure is logged, not fatal.

### Portal (customer)

- Tab "Bekeuringen" (switch `canViewFines`): list of the customer's fines with
  status in (`linked`, `charged`, `paid`, `disputed`); columns date, plate,
  description, driver, amount, admin fee, total, status; detail with the letter
  download (`GET /api/portal/fines/:id/letter`, ownership check, 404 otherwise)
  and `customer_note`. Role `driver`: only fines where `driver_id` is the
  user's driver.
- Button "Vraag stellen" on a fine creates a request of type `fine_question`
  pre-linked to that fine (part 4).
- API: `GET /api/portal/fines`, `GET /api/portal/fines/:id`,
  `GET /api/portal/fines/:id/letter`.

## Part 4 — Requests

### Data model

Table `portal_requests`:

| column | type | notes |
|---|---|---|
| id | serial PK | |
| customer_id | integer FK customers, cascade | |
| portal_user_id | integer FK portal_users, set null | who submitted |
| type | text not null | `extension`, `early_return`, `damage`, `fine_question`, `other` |
| reservation_id | integer FK reservations, set null | required for `extension`, `early_return`, `damage` |
| fine_id | integer FK fines, set null | required for `fine_question` |
| payload | jsonb not null default '{}' | per type: `{ newEndDate }`, `{ returnDate }`, `{ location, occurredAt }`, `{}` , `{ subject }` |
| message | text not null | customer's text |
| status | text not null default 'new' | `new`, `in_progress`, `done`, `rejected` |
| staff_reply | text | shown to the customer |
| replied_at, replied_by | timestamp, text | |
| handled_by | text | staff username who took it |
| created_at, updated_at | | |

Table `portal_request_attachments`: id, request_id (FK cascade), file_name,
file_path (`uploads/portal-requests/`), content_type, file_size, created_at.
Max 5 files per request, 10 MB each, images or PDF (existing upload security
helpers).

Transitions: `new → in_progress | done | rejected`; `in_progress → done | rejected`;
`done`/`rejected` final. Shared in `shared/portal-requests.ts`
(`PortalRequestType`, `PortalRequestStatus`, per-type payload zod schemas).

### Portal (customer)

- Tab "Aanvragen" (switch `canSubmitRequests`): list of own requests (role
  `driver`: own submissions only) with type, date, status, and the staff reply
  when present; "Nieuwe aanvraag" opens a type picker and a type-specific form:
  - extension: reservation (running or booked), new end date (> current end)
  - early return: reservation, return date (>= today, < current end)
  - damage: reservation, what happened, where, when, up to 5 photos
  - fine question: fine (pre-selected when opened from a fine), message
  - other: subject, message
- Shortcuts: "Verlengen" and "Eerder inleveren" on the reservation detail page,
  "Vraag stellen" on a fine.
- API: `GET /api/portal/requests`, `GET /api/portal/requests/:id`,
  `POST /api/portal/requests` (multipart when photos are attached),
  `GET /api/portal/requests/:id/attachments/:attachmentId`.
- Submitting calls `notifyStaffOfPortalEvent({ kind: 'portal_request', … })`
  (existing: toast, badge, e-mail) and logs `request_submitted`.

### Staff UI (dialogs)

No new page. The Klantenportaal page gets a tab "Aanvragen" (permission
`manage_portal`; `view_portal` read-only) and the menu badge on Klantenportaal
counts unread portal notifications plus `new` requests. Row click and
notification links (`/portal-admin?request=<id>`) open `PortalRequestDialog`,
registered in `GlobalDialogContext` (`openPortalRequestDialog(id)`).

- Tab "Aanvragen": inbox table with filters (status, type, customer); columns
  date, type, customer, submitter, short message, status.
- `PortalRequestDialog`: customer, submitter, linked reservation/fine (links
  open the existing reservation/fine dialogs), payload rendered per type,
  message, attachments (open in a new tab), status, reply textarea, actions.
- Actions: "In behandeling nemen", "Beantwoorden" (reply + status `done`),
  "Afwijzen" (reply required), and for `extension`/`early_return`
  "Goedkeuren": runs the existing reservation conflict check
  (`storage.checkReservationConflicts`) for the new period; on conflict the
  action fails with the conflicting reservation shown and nothing changes; on
  success the reservation's `end_date` is updated through the normal update path
  (so contract regeneration and audit keep working), the request becomes `done`
  with an automatic reply line "Goedgekeurd, nieuwe einddatum …".
- Every reply e-mails the submitting portal user (template
  `portal_request_replied`) and logs `request_replied` in the portal activity
  log; the customer sees the reply in the portal.
- Customer dialog Portaal tab shows the customer's last 10 requests with status
  (row → `PortalRequestDialog`).

## Error handling

- Portal errors keep the `{ error, code }` convention; new codes:
  `PORTAL_REQUEST_INVALID_PERIOD`, `PORTAL_ATTACHMENT_LIMIT`.
- Staff endpoints keep `{ message }`; invalid transitions return 400 with the
  allowed next statuses.
- Attribution never throws on a missing vehicle: a plate without a vehicle row
  still creates the fine (`vehicle_id` null) and stays `new`.
- Letter/attachment downloads stream through the API only (uploads are behind
  staff auth), with `resolveDocumentFilePath`-style path containment.

## Testing

- Unit: fine transitions; attribution with 0, 1 and 2 covering reservations;
  driver-at-time from the assignment history (before/after a change, fallback
  to `reservations.driver_id`); actual dates overriding planned dates.
- API: staff creates a fine → auto-linked → portal user of that customer sees
  it, another customer gets 404, `driver` role sees only own; status actions and
  invalid transitions; manual link validation (foreign reservation/driver →
  400); portal request create per type with validation; extension approval
  changes `end_date` and refuses on conflict; reply e-mail sent (mocked) and
  visible in the portal; attachments limit.
- Browser: create a fine, link it, see it in the portal; submit an extension in
  the portal, approve it in the inbox, see the reply and the new end date.
- `npm run check` stays at 0 errors.

## Out of scope

Online booking (part 2), automatic import of fines from CJIB files, invoicing
integration (the invoice reference is a text field), SMS, and per-customer
notification preferences.
