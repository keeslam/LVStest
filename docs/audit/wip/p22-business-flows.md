# Phase 22 / 26 / 27 / 28 / 30 / 31 — Business flows, automation opportunities, daily simulation, state consistency

Date 2026-09-11. Target: audit server `http://localhost:5001`, database `lvs_audit` (clone of dev). The fleet grew during the phase as fixtures were added — **675 vehicles when the chains ran, 678 at the end**; 354 customers, 2101 live reservations at the end. Every fleet-wide figure below states which of those it was measured against. Never port 5000/5002, never production. No application code was modified; nothing was committed.

Scope split agreed with the parallel agent: this report covers **end-to-end chains (22)**, **automation / bulk / barcode / quick actions (26/27/28)**, the **daily simulation (30)** and the **state-consistency matrix (31)**. Per-workflow click counts, the human-error catalogue and recovery paths (21/23/24/25/29) are that agent's.

---

## 1. Method & caveats

**What was executed.**

| Script | What it did | Raw output |
|---|---|---|
| `docs/audit/wip/scripts/p22-chains.cjs` | The four spec chains end to end, 38 logged steps, each with the HTTP result and a SQL read of the affected rows immediately afterwards | `p22-chains.out.json`, ids in `p22-ids.json` |
| `docs/audit/wip/scripts/p22-b-daysim.cjs` | Morning-dashboard endpoint inventory (16 endpoints: status, latency, bytes, row count), availability probes, portal-realm reads, "does an unresolved/conflicts surface exist" probes | `p22-b-daysim.out.json` |
| `docs/audit/wip/scripts/p22-c-statematrix.cjs` | Corrected availability/consistency matrix (`not_for_rental`, `needs_fixing`, `in_service`) with booking + pickup + return attempts in each state | `p22-c-statematrix.out.json` |
| `docs/audit/wip/scripts/p22-d-needsfixing.cjs` | Isolated re-run of the `needs_fixing` cell after a confound was found in the previous script | console output, reproduced in §5.1 |

All sessions used `lib.cjs` `Session` with unique fake IPs `10.22.1.1` … `10.22.1.5`, one `POST /api/login` each, and the portal fixture (customer 179) from `README-agents.md`. All created data is prefixed `AUDIT-P22` (customers 1298/1299, vehicles 1878-1884 `AU-22A-X` … `AU-22G-X` plus 1889 `AU-22H-X`, 1890 `AU-22I-X`, reservations 3545-3570, transport 73). `/health` was 200 before and after every script; no 5xx crash occurred in this phase.

**Caveats — read these before using any number in this report.**

1. **UI steps are traced in client code, not clicked.** No browser was used (phase 18 did that). Wherever a step below says "the UI sends X", it is a code trace with a `file:line`, and it is labelled as such. Button labels are quoted verbatim from `client/src/locales/nl/*.json`.
2. **Chains 2 and 3 deliberately reuse the transport/spare and maintenance knowledge from `p11-transport-spare.md` and `maintenance-transport.md`.** The destructive cases already proven there (hard-deleting a picked-up replacement, MT-001; moving a transport's date, T11-001/BUG-114; cancelling a transport, T11-002/BUG-115) were **not** re-run. This phase walked the *happy* path of those chains end to end and recorded where the state comes out wrong anyway.
3. **Counts from the clone are clone counts.** The dev clone carries the pre-existing data mess documented as BUG-143/BUG-144/BUG-145. Every fleet-wide number below (362 overdue, 788 gate rows, 423 blocked vehicles, 44 active maintenance blocks) is *a measurement of this clone*, and must be re-measured against the real database before any of it is used to size a fix. It does prove the software can produce those rows.
4. **Mail could not be delivered.** The audit server's `app_settings.email_config` points at `127.0.0.1:1` (nothing listening). §2.1 step 7 records exactly what "versturen" does in that state; it is *not* a test of a working SMTP path (phase 16 did that with a stub).
5. **Estimates are labelled.** Frequency guesses in §3 are marked *(estimate)* and are the auditor's judgement from the code and the clone's data shape, not measured usage.
6. **One probe in `p22-b` was invalid and is corrected here.** `PATCH /api/vehicles/:id/status` is not a route; Express's SPA catch-all answered **200 `text/html`**, so the status was silently never changed. The real path is `PATCH /api/vehicles/:id` with `availabilityStatus` in the body (`server/routes.ts:1160-1182`). The corrected results are in §5.1. (That an unknown `/api/*` path returns 200 HTML instead of 404 is already on record in the BUG-029 family — `wip/documents-mail.md:32`, `wip/p14-pdf-templates.md:304`.)

---

## 2. The four chains

### 2.1 Chain 1 — CUSTOMER → RESERVATION → … → CLOSE

Fixture: customer 1298 "AUDIT-P22 Klant A", vehicle 1878 `AU-22A-X`, reservation **3545**, 2026-09-11 → 2026-09-14, € 135.

| # | Step | Route / UI | Result | State after (SQL) | Verdict |
|---|---|---|---|---|---|
| 1 | Find customer | `GET /api/customers` — there is no server-side customer search for the list screen; `client/src/pages/customers/index.tsx` filters client-side | 200, **350 rows, 399 KB** for one lookup | — | ⚠ works, does not scale (BUG-205) |
| 2 | Select vehicle | `GET /api/vehicles/available?startDate&endDate` (`routes.ts:277` → `getAvailableVehiclesInRange`, `database-storage.ts:3109`) | 200, **601 of the then-675 vehicles offered**; `AU-22A-X` present | vehicle `available` | ⚠ list is not filtered on type/segment and **ignores maintenance blocks** (§5.2) |
| 3 | Check availability | `GET /api/reservations/check-conflicts` + `GET /api/reservations/check-availability/:v/:s/:e` | 200 `[]` / 200 `[]` | — | ✅ |
| 4 | Create reservation | `POST /api/reservations` | **201**, id 3545, status `booked` | `reservations` row correct; **`vehicles.availability_status` flipped straight to `rented`** although nothing was picked up | ❌ wrong status (§5.3, definition C vs D) |
| 5 | Assign / confirm vehicle | `PATCH /api/reservations/3545 {vehicleId}` (JSON) | 200 | unchanged, correct | ⚠ **the UI cannot do this step** — the "Bewerken" form posts every column as multipart and always 400s (**BUG-202**) |
| 6 | Generate documents | `POST /api/contracts/generate-versioned/3545` | 200 `application/pdf`, 294 KB | `documents` **554** `Contract (Unsigned)` | ✅ |
| 7 | Send information | `POST /api/documents/554/email` and `POST /api/email/send-documents` | **500 in 28 ms / 16 ms**, body `{"message":"Failed to send email. Please check your email configuration in Settings."}` | `email_logs` **unchanged at 12**; no `custom_notifications` row; no flag on the document; `audit_logs` unchanged | ❌ **hard break — see below** |
| 8a | Next contract number | `GET /api/settings/next-contract-number` | 200 `{"contractNumber":"1000001"}` | — | ✅ |
| 8b | Pickup | `POST /api/reservations/3545/pickup` | 200, status `picked_up`, contract 1000001 | vehicle `rented`; `documents` gains **555**, a *second* `Contract (Unsigned)`, byte-identical to 554 (310 883 B) | ⚠ duplicate document (BUG-027 family) |
| 8b' | Overdue list at that moment | `GET /api/reservations/overdue` | 200, **362 rows** | — | ❌ noise (BUG-113, §4) |
| 9 | Return | `POST /api/reservations/3545/return` | 200, status `returned` | **`end_date` overwritten 2026-09-14 → 2026-09-11** while `total_price` stays € 135; vehicle back to `available`, mileage 10 250, fuel `half`; `documents` gains 556 Damage Check | ❌ **BUG-019 reproduced** |
| 10 | Close | `PATCH /api/reservations/3545/status {completed}` | 200, `completed`, `completion_date` set | vehicle `available` | ✅ — but nothing in the UI forces this step, see 10b |
| 10b | What happens if step 10 is skipped | reservation 3546 on `AU-22B-X`: pickup, return with `returnDate` = today−5, **left at `returned`**. Then `POST /api/reservations` for today+30 | **409** `{"message":"This vehicle has overdue reservations that must be resolved first"}` | vehicle shows `available` on every screen, yet **no future booking can be made on it** | ❌ **BUG-113 re-confirmed** |

**Where chain 1 breaks / needs manual repair**

- **B1-1 (blocking, no workaround in the UI).** Step 5 is impossible through the normal edit form — **BUG-202** (broken since 2026-08-29, second column added 2026-09-06, in production). Staff must use the calendar drag (which skips the conflict check, **BUG-106**) or a dialog that happens to call `/basic`.
- **B1-2 (silent).** Step 7 "versturen" with an unreachable mail server fails in ~20 ms with a generic English message and **leaves no trace anywhere**: no `email_logs` row, no notification, no document status, no audit entry. An employee who clicks it, sees the toast, and gets distracted has no way to find out later whether the customer ever got the contract. Root: `email_logs` is written only by `server/routes/notifications.ts:338` and `:447` and by the manual endpoint `routes/email-logs.ts:63`; the two document-mail routes (`routes.ts:5273`, `:5374`) and all eight portal mail paths write nothing (**BUG-155**, inventory in `wip/p16-email.md`).
- **B1-3 (data corruption).** Step 9 destroys the agreed end date (**BUG-019**). The rental now reads "2026-09-11 → 2026-09-11, € 135" — 1 day at a 3-day price. Any revenue or utilisation report built on `start_date`/`end_date` is wrong from this moment (`server/utils/financial-reports.ts:94` trusts `totalPrice` verbatim).
- **B1-4 (silent duplicate).** Pickup regenerates the contract into a *second* `documents` row with identical bytes (554 + 555). Nobody deletes 554. Over a year of pickups this doubles the document library (BUG-027 family, already measured in `wip/documents-mail.md`).
- **B1-5 (the dead end that matters most).** `returned` is not a terminal state, but nothing in the UI pushes it to `completed`, and a `returned` row older than 3 days silently makes the vehicle unbookable (**BUG-113**). Fleet-wide effect measured in §4.
- **B1-6 (wrong status from minute one).** Creating a booking that covers today marks the vehicle `rented` before anyone touched it (step 4). `AU-22A-X` was `rented` while the keys were still on the board.

### 2.2 Chain 2 — TRANSPORT (request → … → completion → documents)

Fixture: customer 1299 driving vehicle 1882 `AU-22E-X` on rental **3547** (picked up), breakdown swap **transport 73** for 2026-09-14, spare 1883 `AU-22F-X`.

| # | Step | Route / UI | Result | State after (SQL) | Verdict |
|---|---|---|---|---|---|
| 0 | Customer is driving the car | `POST /api/reservations` + `/pickup` | 201 / 200 | rental 3547 `picked_up`, vehicle `rented` | ✅ |
| 1-4 | Request → customer → vehicle → planning | `POST /api/transports` (`swap`, `spareRequired:true`, `isBreakdownOrMaintenance:true`) | **201**, transport 73 `scheduled` | placeholder **3548** auto-created (`type=replacement`, `vehicle_id NULL`, `placeholder_spare=true`, linked to both rental and transport); original vehicle gets `maintenance_status = needs_service` + note `"Replacement vehicle required for transport #73"` | ✅ the one genuinely automated chain step in the app |
| 1-4' | Staff notification | `custom_notifications` since T1 | **0 rows** | — | ❌ the TBD spare that *was* announced (`database-storage.ts:3002`) produced no row on this path |
| 1-4'' | TBD queue | `GET /api/placeholder-reservations/needing-assignment?daysAhead=30` | 200, **9 ids** (8 pre-existing + the new 3548) | — | ⚠ the queue works; 8 of the 9 are stale clone rows |
| 5 | Transport info | `PATCH /api/transports/73` (addresses, driver, notes) | 200 | stored | ✅ |
| 6-8 | Replacement / maintenance / spare reservation | `POST /api/placeholder-reservations/3548/assign-vehicle {vehicleId:1883}` | 200 | placeholder becomes a real replacement on `AU-22F-X`; `transports.related_vehicle_id = 1883`; TBD queue drops to 8 | ✅ |
| 6-8' | Spare vehicle status | — | — | **`AU-22F-X` still `available`** while reserved for 14 Sep | ⚠ see §5.3 |
| 9 | Final vehicle assignment | `GET /api/transports/73` | 200, `relatedVehicle AU-22F-X`, spare reservation `booked` 14→14 Sep | — | ✅ |
| 10 | Transport day — scan the two cars | `GET /api/barcodes/:code` | `AU-22E-X` → activeReservation 3547 + activeTransport 73 (`scheduled`, 14 Sep, Zuidland→Rotterdam) | — | ✅ the scan panel is the one place that shows the whole picture |
| 10' | Scan the spare | same | `AU-22F-X` → **activeReservation null, upcomingReservation null, activeTransport null** | — | ❌ **the spare's own reservation is invisible to the scanner** — see break list |
| 11 | Hand over the spare | `POST /api/reservations/3548/pickup` | 200, `picked_up`, `spare_vehicle_status=picked_up` | vehicle 1883 → `rented`; document 560 contract generated | ✅ (pickup 3 days before the reservation start, no warning — BUG-211) |
| 12 | Transport start | `PATCH /api/transports/73 {status:in_progress}` | 200 | `in_progress` | ✅ |
| 13 | Completion | `PATCH /api/transports/73 {status:completed, completedDate}` | 200 | transport `completed`; **original vehicle's `maintenance_status` silently reset `needs_service` → `ok`, note cleared**; original rental 3547 still `picked_up` on a car that is now in the workshop | ❌ see break list |
| 14 | Documents | `POST /api/delivery/transports/generate-report` | **201**, `documents` 561 `transport_report` | `reservation_id NULL`, `file_path` `reports\…` (backslash) | ⚠ BUG-029: with a production `UPLOADS_DIR` this download 404s |
| 15 | End state | — | spare out with the customer (`picked_up`), original rental open on a car in the garage, transport closed | — | ⚠ |

**Where chain 2 breaks / needs manual repair**

- **B2-1 (scanner blind spot).** Scanning the spare car on the transport day shows *nothing* — no reservation, no transport. The spare reservation exists (`3548`, `booked`, 14 Sep), but `GET /api/barcodes/:code` only reports `activeReservation` (covering today) and the *earliest future* reservation; on the day of the test the spare's reservation was 3 days out and the endpoint returned `upcomingReservation: null`. So the one screen designed for the counter (`/scan`, "Barcode scannen") cannot tell the employee "this is the replacement for transport 73". They must go back to the delivery dashboard and find it by eye.
- **B2-2 (workshop flag lost).** Completing the transport resets `vehicles.maintenance_status` from `needs_service` to `ok` and wipes the note — at exactly the moment the car physically arrives at the garage. The reason the swap happened is erased by the act of recording that it happened.
- **B2-3 (double-open rental).** After the swap the customer holds the spare (`3548 picked_up`) *and* the original rental `3547` is still `picked_up` on `AU-22E-X`. Both vehicles read `rented`. There is no route that closes or suspends the original rental as part of the swap. Billing, insurance and the overdue list all see two active rentals for one customer.
- **B2-4 (known, not re-run).** Editing the transport's date afterwards leaves the spare reservation on the old day (**BUG-114**/T11-001); cancelling it leaves the spare booked (**BUG-115**/T11-002). Both were proven in phase 11 and are the reason the end state above is fragile.
- **B2-5 (print trap).** `client/src/pages/delivery/dashboard.tsx:283-292, :341-351` hard-blocks printing while any selected transport still has a TBD spare, with a toast and **no link to the assignment dialog** — the employee has to find the row themselves.

### 2.3 Chain 3 — MAINTENANCE (problem → unavailable → spare → repair → available)

Fixture: customer 1298 driving vehicle 1880 `AU-22C-X` on rental **3549**; spare 1881 `AU-22D-X`; block **3550** for 2026-09-14 → 16.

| # | Step | Route / UI | Result | State after (SQL) | Verdict |
|---|---|---|---|---|---|
| 0 | Customer is driving the car | create + pickup | 201 / 200 | 3549 `picked_up`, vehicle `rented` | ✅ |
| 1-3 | Problem → maintenance → unavailable | `POST /api/reservations/3549/mark-needs-service` ("Markeren voor service") | 200 | vehicle `maintenance_status = in_service`, note stored; **block 3550 created** (`type=maintenance_block`, `status=active`, `maintenance_status=scheduled`); `availability_status` stays **`rented`** | ⚠ two status fields, only one moves |
| 1-3' | Is it off the availability lists? | `GET /api/vehicles/available` (both forms) | not listed — **but only because it is `rented`** | — | ⚠ see §5.2 |
| 1-3'' | Can it still be booked? | `POST /api/reservations` for a date after the block | **201, no warning** | new reservation 3551 on a car flagged `in_service` | ⚠ arguably legitimate (block is over by then) but there is no signal at all |
| 1-3''' | Notifications | `custom_notifications` / `portal_notifications` since T2 | **0 / 0** | — | ❌ the customer whose car is going in is told nothing on this path |
| 4 | Replacement / spare | `POST /api/reservations/3549/assign-spare {spareVehicleId:1881}` | 200 | replacement **3552** created, `status=pending`, `spare_vehicle_status=assigned`, 14→16 Sep | ⚠ `pending` is not in `VALID_RESERVATION_TRANSITIONS` (§5.4) |
| 5 | Spare status assigned → ready → picked_up | `PATCH /api/reservations/3552/spare-status` ×2 (the widget buttons "Markeer als opgehaald") | 200 / 200 | `spare_vehicle_status = picked_up`, but `reservations.status` **stays `pending`** and **vehicle 1881 stays `available`** | ❌ see break list |
| 6 | Repair: block in → out | `PATCH /api/reservations/3550 {maintenanceStatus:'in'}` then `{'out'}` | 200 / 200 | block `maintenance_status='out'` but **`status` still `active`**; vehicle still `in_service`, still `rented` | ❌ closing the block changes nothing on the vehicle |
| 6' | Clear the vehicle flag | `PATCH /api/vehicles/1880/maintenance-status {ok}` | 200 | `maintenance_status='ok'`, note cleared; `availability_status` still `rented` | ⚠ a **second, separate** manual action |
| 7 | Available again | `POST /api/reservations/3552/return-from-service` | 200 | replacement 3552 → `completed`, **`end_date` set to 2026-09-11 while `start_date` is 2026-09-14 (end before start)**; `spare_vehicle_status` left at `picked_up`; spare vehicle 1881 → `scheduled`; original rental 3549 untouched (`picked_up`) | ❌ BUG-019 class, second instance |

**Where chain 3 breaks / needs manual repair**

- **B3-1 (the spare is invisible while it is out).** After "Markeer als opgehaald" the spare car reads `available` in the database and is offered by `GET /api/vehicles/available` — while it is physically with a customer. The spare widget's status buttons write `spare_vehicle_status` only (`client/src/components/dashboard/spare-vehicle-assignments-widget.tsx:224`); the reservation's own `status` never leaves `pending`, so `syncVehicleAvailabilityWithReservations` (which keys off dates and `status`) never marks the car `rented`. This is the same class as **BUG-211/BUG-130** and it is a direct double-booking path.
- **B3-2 (three separate actions to finish one repair).** Closing a maintenance job takes (1) set the block to `out`, (2) set the vehicle's `maintenance_status` back to `ok`, (3) `return-from-service` on the replacement — three endpoints, in two different screens (the calendar patches the block inline at `client/src/pages/maintenance/calendar.tsx:2074-2090`; the return dialog is a second implementation of the same idea, `01b-frontend-en-werkprocessen.md` observation 5). Nothing enforces the order and nothing warns if one is skipped. Skip (2) and the car is permanently flagged "in de werkplaats"; skip (1) and the block stays `active` and keeps blocking the calendar.
- **B3-3 (reversed dates again).** `return-from-service` writes today into `end_date` regardless of `start_date` (3552: start 14 Sep, end 11 Sep). Combined with **BUG-201** (one unparsable date crashes `/reservations` for everyone) this is the kind of row that turns into a fleet-wide outage.
- **B3-4 (no customer signal).** Marking a car for service, creating the block, and assigning a spare produced **zero** `portal_notifications` on this path. The portal's maintenance notifier (`server/services/portal-maintenance-events.ts:70`) only fires for `type === "maintenance_block"` events routed through its own call sites, and `findPortalCustomerForBlock` (`:36-39`) additionally requires a `picked_up` rental and takes `.limit(1)` — **BUG-134**.

### 2.4 Chain 4 — DOCUMENTS (create → generate → preview → correct → regenerate → print → send)

Fixture: reservation **3553** on vehicle 1884 `AU-22G-X`, 2026-09-18 → 22, € 225.

| # | Step | Route / UI | Result | State after (SQL) | Verdict |
|---|---|---|---|---|---|
| 1 | Create record | `POST /api/reservations` | 201, id 3553 | correct | ✅ |
| 2 | Generate | `POST /api/contracts/generate-versioned/3553` | 200, `application/pdf`, 294 KB, `%PDF` header verified | `documents` **563** `Contract (Unsigned)` | ✅ |
| 3 | Preview (stored) | `GET /api/documents/view/563` | 200 `application/pdf`, 294 KB | — | ✅ |
| 3' | Preview (draft) | `POST /api/contracts/preview` → token → `GET /api/contracts/preview/:token` | 200 + token, then 200 `application/pdf` 294 KB | token store, 30-min TTL (`server/preview-token-service.ts:18`) | ✅ |
| 4 | Correct the record | `PATCH /api/reservations/3553 {totalPrice:270, endDate:+1d}` | 200 | row updated; `GET /api/contracts/data/3553` immediately reflects `€ 270,00` / `September 23, 2026` | — |
| 4' | What happened to the contract already issued? | `documents` for 3553 | **still exactly one row, 563, unchanged** — the PDF on disk still says € 225 and 22 September | **no flag, no warning, no version bump, nothing** | ❌ see break list |
| 5 | Regenerate | `POST /api/contracts/generate-versioned/3553` | 200 | old row renamed to `…_contract_regen_20260911_1789105122416.pdf` (**564**, type still `Contract (Unsigned)`); new row **565** with `document_type = "Contract (Unsigned) 2"` | ⚠ the version number is stored **inside the type string** |
| 6 | Print / download | `GET /api/documents/download/565` | 200, `application/pdf`, `Content-Disposition: attachment; filename="AU22GX_contract_20260911.pdf"`, valid `%PDF` | — | ✅ (browser printing itself not observable — phase 18) |
| 7 | Send | `POST /api/documents/565/email` | **500 in 10 ms**, same generic message | `email_logs` still **12**; no document flag | ❌ same as B1-2 |

**Where chain 4 breaks / needs manual repair**

- **B4-1 (stale contract, silently).** Correcting price or dates leaves the already-generated contract in place and untouched. There is no "dit contract is verouderd" marker anywhere in `documents`, no automatic regeneration, and nothing in the reservation view distinguishes the € 225 PDF from the € 270 booking. The only defence is that the employee remembers. *(There is a regeneration service, `server/services/reservation-pdf-regeneration.ts`, but it is not triggered by `PATCH /api/reservations/:id`.)*
- **B4-2 (versioning lives in the wrong column).** After one regeneration the reservation has two rows whose `document_type` values are `Contract (Unsigned)` and `Contract (Unsigned) 2`. Any code that filters on `document_type = 'Contract (Unsigned)'` — and the portal classifier does exactly this kind of matching (`server/services/portal-storage.ts:83` `classify`) — will see only one of them, and which one depends on the version count.
- **B4-3 (two buttons that never register their output).** Not exercised here because it is already proven: `generate-default` and `damage-checks/generate` write the file but the `documents` insert always fails (**BUG-165**). So the "regenerate → correct → regenerate" loop through *those* buttons produces orphan files nobody can find.
- **B4-4.** Step 7 is the same silent failure as B1-2.

---

## 3. Automation / bulk / barcode / quick-action opportunity catalogue

**62 opportunities** (A-01…A-38 + A-25b automation, B-01…B-08 bulk, C-01…C-09 barcode, D-01…D-06 quick actions/search). "Evidence" is always a `file:line` or a measured result from §2. "Needs business decision" = the owner must choose the rule before anything can be built; it is **not** a bug that can be fixed technically.

### 3.1 Automatic customer data (phase 26)

| # | Area | Current manual step (evidence) | Proposal idea | Benefit | Frequency *(estimate)* | Business decision |
|---|---|---|---|---|---|---|
| A-01 | KvK / Handelsregister | The field exists — `client/src/components/customers/customer-form.tsx:625`, label `nl/customers.json:207` `"Kamer van Koophandel nummer (KvK)"` — and **nothing** in the repo matches `kvk|handelsregister`. Company name, address and legal form are all typed by hand | KvK open-data lookup on the KvK number (or on name), pre-filling legal name, address and status | Removes 4-6 typed fields per business customer; catches "BV that no longer exists" | Every new business customer, *(estimate)* a few per week | No |
| A-02 | Postcode + huisnummer → street/city | `customer-form.tsx:411/430/444` (address, `"Postcode"`, city) and the billing duplicate at `:788` are free text. **`server/geocoding.ts` already resolves Dutch addresses** (Nominatim, `:4`) but is only wired to `/api/delivery/estimate-distance` (`routes.ts:7524`) and `/optimize-route` (`:7573`) | Reuse the existing geocoder (or a PDOK lookup) behind a `GET /api/address/lookup?postcode=&huisnummer=` and auto-fill street + city on blur | Removes the single most common typing error on contracts; the address on the contract is also the address used for fines | Every new customer and every delivery address | No |
| A-03 | BTW-nummer validation | `customer-form.tsx:636-639`, `nl/customers.json:124` `"BTW-nummer"`; read-only display `customer-details.tsx:743`. No VIES call anywhere | VIES check on save; store the check date | Invoicing correctness for EU business customers | Per business customer | **Yes** — is a failed VIES check a block or a warning? |
| A-04 | Almost nothing is required | `customer-form.tsx:29-60`: only `name` is mandatory; `driver-dialog.tsx:48`: only `displayName` | Make the fields the contract actually needs (address, postcode, city, e-mail) required *at the point the contract is generated*, not at customer creation | Stops the "null null" and blank-field contracts (BUG-166, BUG-162) at the source | Every contract | **Yes** — which fields are mandatory for a contract? |

### 3.2 Automatic vehicle data (phase 26)

| # | Area | Current manual step (evidence) | Proposal idea | Benefit | Frequency *(estimate)* | Business decision |
|---|---|---|---|---|---|---|
| A-05 | RDW in the **bulk plate import** | `server/routes.ts:849` comments `// Bulk import vehicles from license plates (fetches from RDW)` — the handler `:850-904` **never calls** `fetchVehicleInfoByLicensePlate` and hardcodes `brand: "Unknown", model: "Unknown"` (`:879-880`). The Dutch UI promises the opposite: `nl/vehicles.json:78` *"Voertuiggegevens worden automatisch opgehaald uit de RDW-database."* | Call the RDW lookup that already exists (`server/utils/rdw-api.ts:135`) per plate, with a per-row failure fallback | Turns a 30-field-per-car retype into a paste of plates; closes a UI promise that is currently false | Every fleet intake | No |
| A-06 | RDW in the **CSV/XLSX import** | `routes.ts:909+` takes brand/model/APK from the sheet only, no verification | Enrich/verify against RDW, flag rows where the sheet and RDW disagree | Catches typo'd plates before they become a whole vehicle record | Per bulk intake | No |
| A-07 | RDW never re-syncs | `vehicle-form.tsx:865` `handleLookup` is behind a manual button `"Opzoeken"` (`nl/vehicles.json:731`); the nightly scanner `server/apkScanScheduler.ts` (`30 2 * * *`) reads **only** `apkDate` (`server/utils/rdw-apk-scanner.ts:38`) | Extend the nightly scan to the other RDW fields it already receives (fuel, euro zone, WOK, registration) with a confirm queue like `apk_date_changes` | A WOK notification or a changed euro zone currently never reaches the system | Nightly | **Yes** — auto-apply or confirm queue? |
| A-08 | RDW result thrown away in transport | `client/src/components/delivery/transport-dialog.tsx:368-370` writes only plate/brand/model from the RDW response and discards `vehicleType`, `fuel`, `apkDate` that the same call already returned | Store what was fetched | Free data | Per external transport | No |
| A-09 | `GET /api/rdw/vehicle/:licensePlate` has no auth middleware | `server/routes.ts:1930`, unlike its neighbours | Add `requireAuth` | — | — | No *(hand to the security phase, not an OPT)* |

### 3.3 Automatic calculations (phase 26)

| # | Area | Current manual step (evidence) | Proposal idea | Benefit | Frequency *(estimate)* | Business decision |
|---|---|---|---|---|---|---|
| A-10 | Price stops recalculating forever after one manual edit | `reservation-form.tsx:588-595`; `priceManuallyEditedRef` set at `:2234`; guard at `:590` | Keep a `pricePerDay` on the reservation and recompute, showing "handmatig aangepast" with a reset | Chain 1 ended as "1 day, € 135" (B1-3) and nothing flagged it | Every edited booking | **Yes** — does the price follow a date change or not? |
| A-11 | Open-ended rentals get **no** price at all | `reservation-form.tsx:591` returns early when the duration is not a number; `:405` leaves `totalPrice: 0` | Monthly/periodic pricing for open-ended contracts | Open-ended rentals are the lease side of the business and currently invoice from nothing | All open-ended rentals | **Yes** — what is the price model? |
| A-12 | Server never validates the price | `routes.ts:2477-2482`, `:3113-3118`, `:3463-3468` only sanitise strings; `server/utils/financial-reports.ts:94` sums `totalPrice` verbatim | Server-side recompute-and-compare with a tolerance, reject absurd values | Reports currently cannot be trusted after any manual price edit | Every booking | **Yes** |
| A-13 | Mileage per day / expected km never computed | no such field anywhere (`reservation-form.tsx:561-571` only copies the vehicle's current mileage at creation) | Derive expected km from days × contractual km/day; flag the overrun at return | Over-mileage is currently found by hand or not at all | Every return | **Yes** — is there a km allowance? |

### 3.4 Automatic availability / conflict checking (phase 27)

| # | Area | Current manual step (evidence) | Proposal idea | Benefit | Frequency *(estimate)* | Business decision |
|---|---|---|---|---|---|---|
| A-14 | Partial `PATCH` skips the conflict check | `routes.ts:3445` `PATCH /api/reservations/:id` has **no** `checkReservationConflicts`, while `:3090` `/basic` does (`:3123`) — **BUG-106** | Run the same check on every write path | Calendar drag currently double-books deterministically | Every drag / date change | No |
| A-15 | One-day booking inside a running rental accepted | `checkReservationConflicts` turnover exception — **BUG-107** | Narrow the exception to same-day turnover | Deterministic double booking | — | No |
| A-16 | A maintenance block is invisible to the booking path | `database-storage.ts:3130` excludes `maintenance_block` from conflicts, `:3153` from the available list. **Measured this phase:** a vehicle with an active block covering 2026-11-10…12 is still returned by `GET /api/vehicles/available?startDate=2026-11-10&endDate=2026-11-12`, and `POST /api/reservations` for 2026-11-11 returns **201 with no warning** (`p22-b-daysim.out.json` `bookInsideBlock`). Matches MT-002 | Make the block a *soft* conflict: allow, but return `needsSpareVehicle` the way the reverse direction already does | Today the counter books a customer onto a car that is booked into the garage, with zero signal | *(estimate)* whenever maintenance is planned ahead — 44 vehicles have an active block today in the clone | **Yes** — block or warn? |
| A-17 | **There is no conflicts / unresolved view at all** | Conflicts are only computed inside `POST/PATCH` and in the form's live check (`reservation-form.tsx:696-738`). `client/src/pages/` contains no conflicts page (only `maintenance/calendar.tsx` mentions the word). No `/api/dashboard`, `/api/conflicts`, `/api/tasks` endpoint exists (probed — all fell through to the SPA catch-all) | A "Openstaande punten" screen: overlapping bookings, `returned`-not-`completed`, TBD spares, blocks left `active`, reservations on deleted vehicles, `picked_up` past end date | This is the single biggest structural gap for the daily work — see §4 | Daily | **Yes** — what belongs on it? |

### 3.5 Automatic status updates (phase 27)

| # | Area | Current manual step (evidence) | Proposal idea | Benefit | Frequency *(estimate)* | Business decision |
|---|---|---|---|---|---|---|
| A-18 | Two different engines decide vehicle availability | `syncVehicleAvailabilityWithReservations` (`database-storage.ts:224-352`, date-based) vs `calculateCorrectStatus` (`vehicle-status-helper.ts`) — **and `calculateCorrectStatus`, `getStatusOnReturn`, `getStatusOnMaintenanceStart/End`, `getStatusOnReservationCancel` are never called** (`getStatusOnReturn` is imported at `database-storage.ts:36` with no call site). Only `getStatusOnPickup` (`:1700`) and `validateManualStatusChange` (`routes.ts:1167`) are live | Delete the dead half or make it the only implementation | Every divergence in §5.3 has this as its root | — | No |
| A-19 | `needs_fixing` is silently destroyed by the rental cycle | **Measured this phase** (`p22-d-needsfixing.cjs`): set `needs_fixing` → correctly off both availability lists → booking still **201** → pickup still **200** → vehicle becomes `rented` → after return it is **`available`, flag gone**. `getStatusOnReturn` exists and would have preserved it, but is never called | Call it; block or warn on pickup of a `needs_fixing` car | **BUG-109** second half, now pinned to an exact dead-code cause | Every repair-flagged car that gets rented | **Yes** for the block/warn half |
| A-20 | Booking a `not_for_rental` car is accepted, pickup then fails | **Measured:** `POST /api/reservations` → **201**; `POST /pickup` → **400** `"Cannot pickup vehicle that is marked as \"not for rental\"."` | Move the guard to booking time | The customer is told at the counter, not at booking | — | No |
| A-21 | Handing over a spare does not make it `rented` | Chain 3 step 5: `spare_vehicle_status='picked_up'` but `reservations.status='pending'` and vehicle `available` | Advance the reservation status together with the spare status | Direct double-booking path (**BUG-130/211** class) | Every spare handover | No |
| A-22 | Closing a maintenance block changes nothing on the vehicle | Chain 3 step 6: block `maintenance_status='out'`, block `status` still `active`, vehicle still `in_service` and `rented` | One "onderhoud afronden" action that closes the block, clears the vehicle flag and returns the spare | Three endpoints in two screens today (B3-2) | Every repair | No |
| A-23 | `returned` never becomes `completed` | Chain 1 step 10b; `VALID_RESERVATION_TRANSITIONS['returned'] = ['completed']` (`shared/schema.ts:47`, marked "Legacy state") | Close on return, or a scheduled sweep | **423 of 675 vehicles in the clone are currently unbookable** because of this and BUG-040 (§4) | Every return | **Yes** — auto-close or keep a review step? |
| A-24 | Creating a booking for today marks the car `rented` | Chain 1 step 4 | Derive `rented` from `status === 'picked_up'`, not from dates | BUG-211's mirror image | Every same-day booking | No |
| A-25 | Availability is recomputed on **read** | `GET /api/vehicles` runs the full sync (2 SELECT + up to 3 UPDATE) — **BUG-217** | Event-driven sync | Also a performance item | Every list load | No |
| A-25b | Closing a repair silently erases a manual `not_for_rental` | **Measured** (`p22-e2-nfr-overwrite.cjs`): vehicle set to `not_for_rental` → `PATCH /api/vehicles/:id/maintenance-status {in_service}` overwrites availability to `needs_fixing` → `{ok}` overwrites it to **`available`**. The deliberate "uit de verhuur" decision is gone, and the car is bookable again | Do not let the maintenance-status route write `availability_status`; restore the previous value, or use `getStatusOnMaintenanceEnd` (which already preserves `not_for_rental` — and is dead code) | A car that was taken out of the fleet (sold, written off, insurance lapsed) silently returns to the bookable pool after any workshop visit | *(estimate)* every workshop visit on a withdrawn car | No |

### 3.6 Automatic related records (phase 27)

| # | Area | Current manual step (evidence) | Proposal idea | Benefit | Frequency *(estimate)* | Business decision |
|---|---|---|---|---|---|---|
| A-26 | Cancelling does not cascade | **BUG-112** (transport stays planned, driver assignment open, spare + placeholder active) | Cascade or an explicit "what else should happen?" step | Leftovers block other bookings | Every cancellation | **Yes** — cascade or ask? |
| A-27 | Moving a transport leaves the spare on the old day | **BUG-114**/T11-001 (`applyTransportUpdate`, `database-storage.ts:2025-2221`, no `scheduledDate` branch) | Move the spare reservation in the same transaction | Spare double-booked on the real day | Every rescheduled transport | No |
| A-28 | Cancelling a transport leaves the spare booked | **BUG-115**/T11-002 | idem | idem | — | No |
| A-29 | Portal maintenance-change approval duplicates the spare | **BUG-117** | idem | — | — | No |
| A-30 | Swapping a rental's vehicle orphans block + spare + notification | **BUG-139** | idem | — | — | No |
| A-31 | Placeholder spares are invisible in the normal lists | `getUpcomingReservations` (`database-storage.ts:1377`) excludes `vehicleId IS NULL`; "Aankomende reserveringen" therefore never shows a TBD spare, and it is capped at **5 rows** (`:1381`) | Surface the TBD queue (which exists: `/api/placeholder-reservations/needing-assignment`, 8 stale rows in the clone) on the dashboard, not only in the spare widget | The TBD queue is the thing that blocks printing (B2-5) | Daily | No |
| A-32 | Transport completion clears the workshop flag | Chain 2 step 13 (B2-2) | Keep the flag; clear it when the repair is closed | — | Every breakdown swap | No |

### 3.7 Documents, suggestions, warnings, notifications (phase 27)

| # | Area | Current manual step (evidence) | Proposal idea | Benefit | Frequency *(estimate)* | Business decision |
|---|---|---|---|---|---|---|
| A-33 | Editing a reservation does not invalidate its contract | Chain 4 step 4' | Mark the document stale and offer one-click regeneration (`services/reservation-pdf-regeneration.ts` already exists) | Wrong contracts leave the building | Every corrected booking | **Yes** — regenerate automatically or flag? |
| A-34 | Pickup generates a duplicate contract | Chain 1 step 8b (docs 554 + 555, byte-identical) | Reuse the contract already generated for that reservation | Halves the document library | Every pickup | No |
| A-35 | **No vehicle suggestion anywhere** | `getAvailableVehiclesInRange` (`database-storage.ts:3109`) filters only on date conflict, `in_service`, `not_for_rental`, `needs_fixing` — **no `vehicleType`, no segment, no fuel, no price band**, even though `vehicleType` is populated from RDW (`rdw-api.ts:189`). `spare-vehicle-dialog.tsx:94-98` and `spare-vehicle-assignment-dialog.tsx:110` send only dates | Rank the list: same type first, then same fuel, then nearest daily price. The full `Vehicle` rows are already loaded — no extra query | Picking a spare is currently scanning 601 rows by eye (chain 1 step 2) | Every spare and every booking | **Yes** — what makes a "comparable" car? |
| A-36 | No warning when picking up before the start date | **BUG-211**; chain 2 step 11 picked up 3 days early, silently | Warn, and offer to move the start date | — | — | **Yes** — block or shift? |
| A-37 | Portal customers are told nothing about their own rental | **BUG-134**. `portal-maintenance-events.ts:70` only fires for `maintenance_block`; `findPortalCustomerForBlock:36-39` needs a `picked_up` rental and uses `.limit(1)`. No notification for: rental created, dates moved, rental cancelled, rental deleted, vehicle swapped, spare returned, contract generated, fine status change after the initial link | Extend the notifier to standard rentals | The portal exists; it currently only speaks about maintenance | Every office-side change | **Yes** — which events are the customer's business? |
| A-38 | Mail success/failure is invisible | **BUG-155**; measured again in chain 1/4 (`email_logs` stayed at 12 across three failed sends) | Log every outbound mail, success and failure, and show the state on the document | The "did the customer get the contract?" question has no answer today | Every mail | No |

### 3.8 Bulk actions (phase 28)

Only recommend bulk where the benefit is real. Justification is in the "Benefit" column; items where bulk would **not** pay are listed after the table.

| # | Area | Current manual step (evidence) | Proposal idea | Benefit | Frequency *(estimate)* | Business decision |
|---|---|---|---|---|---|---|
| B-01 | Mass close of `returned` → `completed` | No such action exists; one `PATCH /api/reservations/:id/status` per row | A filtered list with "markeer geselecteerde als afgerond" | **This is the highest-value bulk action in the app.** In the clone 788 rows trip the booking gate on **423 of 675 vehicles**; 8 of them are `returned` rows that one bulk action would clear, and 374 are stale `booked` rows that a second one would. Without it each is a manual hunt | One-off cleanup, then weekly | **Yes** — which rows may be auto-closed? |
| B-02 | Bulk complete transports has no per-row error isolation | `client/src/pages/delivery/dashboard.tsx:316-335`: `Promise.all(ids.map(PATCH …))`, one failure rejects everything and shows one generic toast (`:328-334`). No server bulk route | Sequential with per-row result, like the CJIB importer already does (`server/services/cjib/importer.ts:35-51`) | The feature exists and is used daily ("Markeer voltooid", `nl/delivery.json:188`); today a single bad row makes the whole batch unverifiable | Daily | No |
| B-03 | Bulk APK confirm/dismiss loses partial results | `server/routes/apk-date-changes.ts:155` `/bulk-confirm`, `:125` `/bulk-dismiss`: sequential loop returning a count only; a mid-loop throw 500s and the partial work is invisible | Per-row outcome | The nightly RDW scan feeds this queue; it is the one place the fleet's APK data is corrected | After every nightly scan | No |
| B-04 | Bulk mail has no permission guard | `POST /api/notifications/send` (`server/routes/notifications.ts:88`) has no `hasPermission`; recipients resolved by joining vehicles→reservations→customers (`:207`) — **BUG-170**: one APK reminder went to four different customers | Guard + recipient rule | Privacy | — | **Yes** (BUG-170 is already a B) |
| B-05 | Batch contract / damage-check generation does not exist | Only `generateTransportReportsPdf` is batched (`routes.ts:7700`, max 50) | Batch-generate contracts for tomorrow's pickups into one print job | Morning prep is currently one reservation at a time | Daily | No |
| B-06 | Bulk plate import is N+1 and unbounded | `routes.ts:866` calls `storage.getAllVehicles()` **inside** the per-row loop; no row cap on `/bulk-import-plates` or `/bulk-import-csv` | Load once; cap the batch | A 200-plate import currently does 200 full-fleet reads | Per intake | No |
| B-07 | Import progress bar is fake | `vehicle-bulk-import-dialog.tsx:670` sets `importProgress = 5` and never advances it (`:950` renders it) | Real progress or none | Users cancel imports that are working | Per intake | No |
| B-08 | Label printing already has a good batch path | `barcode-book-dialog.tsx:97-117` ("Stickers afdrukken", "Selectie afdrukken", "Alles afdrukken ({{count}})") prints a selection or the whole filtered list | — | ✅ **keep as the model for the others** | — | — |

**Where bulk would *not* pay** (stated deliberately): bulk pickup/return — each needs mileage, fuel and a damage check per car, so a batch screen would just be the same forms in a row; bulk customer edit — the fields are per-customer by nature; bulk price change — no `pricePerDay` field exists to change (A-10).

### 3.9 Barcode workflows (phase 28)

Full trace of `client/src/components/barcodes/scan-panel.tsx` and siblings.

**The scan loop.** A code arrives three ways: a hardware wedge scanner (the input is auto-focused on mount, `scan-panel.tsx:242` `autoFocus`, and **re-focused after every lookup**, `:116-120`; the scanner's trailing Enter submits the form, `:159-162`), manual typing (placeholder *"Scan of typ een barcode (VEH-... / RES-... / kenteken)"*, button *"Zoeken"*), or the camera (*"Camera scannen"*, `:249-251` → `camera-scanner-dialog.tsx`, which closes itself on the first decode, `:83-88`). The lookup is `GET /api/barcodes/:code` (`server/routes.ts:494`); the input is cleared in `finally` (`:152`). The result is rendered **inline**, not on a new page.

**Actions offered on the vehicle card** (exact Dutch labels): *"Voertuig openen"*, *"Reservering maken"*, *"Inleveren starten"*, *"Ophalen starten"*, *"Kosten registreren"*, *"Document uploaden"*, *"Tanken"*, *"Km-stand bijwerken"*, *"Onderhoud inplannen"*, *"Terug uit onderhoud"*, *"Opnieuw scannen"*, plus *"Reservering openen"*, *"Onderhoudsblok openen"*, *"Transport starten"* / *"Transport afronden"*.

| # | Area | Current manual step (evidence) | Proposal idea | Benefit | Frequency *(estimate)* | Business decision |
|---|---|---|---|---|---|---|
| C-01 | Half the scan actions break the loop | Actions that call `lookup()` again on success — pickup/return (`scan-panel.tsx:533-540`), *"Tanken"* (`:439`), *"Km-stand bijwerken"* (`:548`), maintenance (`:562-568`), *"Terug uit onderhoud"* (`:187`), transport (`:201`) — refocus the input: **0 interactions between two scans**. Actions with no success wiring — *"Kosten registreren"* (`:423-428`), *"Document uploaden"* (`:429-434`), *"Reservering maken"* (`:397-404`), and the global dialogs behind *"Voertuig openen"* (`:393`) / *"Reservering openen"* (`:226`) — return focus to the **trigger tile**, so the operator must close the dialog and then click the input or *"Opnieuw scannen"* (the 11th tile): **≈2 interactions**, and a blind scan sends the wedge's Enter into a focused button | Wire `onSuccess → lookup(barcode)` on the remaining five dialogs | Makes the whole panel a true continuous-scan surface; also removes the mis-fire risk | Every scan-driven round (APK check, key audit, yard walk) | No |
| C-02 | There is no "scan volgende" affordance | *"Opnieuw scannen"* is the only reset and it sits 11th in the tile grid (`:461-464`) | Put it first, or auto-reset after a completed action | — | — | No |
| C-03 | The scan **dialog** is unreachable | `GlobalDialogContext.tsx:222` defines `openScanDialog` and `:270` exports it; **no component in `client/src` ever calls it**. The mounted dialog (`global-dialogs.tsx:171-174`) can never open | Wire it to the topbar, or delete it | Scanning is currently only possible by navigating to `/scan` | — | No |
| C-04 | Key-cabinet audit results are never stored | `key-audit-dialog.tsx`: the scanned set lives in component state (`:44-50`) and is discarded on close (`:65-75`). No POST route exists. The only trace is the incidental `scan_events` row written by the lookup (`routes.ts:497-506`). The result view (`"Ontbrekende sleutels"`, `"Onverwacht aanwezig (voertuig staat als verhuurd)"`) **cannot be exported, printed or saved** | Persist an audit run (who, when, missing list) and let it be printed | The audit is done to produce a record; today the record exists only on screen | *(estimate)* monthly / quarterly | **Yes** — is this a compliance record? |
| C-05 | The key audit silently drops scans | `key-audit-dialog.tsx:78` `if (isLoading) return` — the comment says a fast hardware scanner can out-run the fetch; those scans are discarded with **no feedback** | Queue the codes instead of dropping them | A key scanned but not counted shows up as "ontbrekend" — the audit produces a false miss | Every audit | No |
| C-06 | The key audit is the app's one good continuous-scan flow | `:127-131` clears and refocuses in `finally`; duplicate → *"Al gescand"*; wrong key class refused with *"Dit is een hoofdsleutel. Scan het reservesleutel-label (-S)."* — **1 step per key, 0 clicks between keys** | — | ✅ **the model C-01 should copy** | — | — |
| C-07 | Single label printing is 3 interactions | `key-label-print-panel.tsx`: click *"Sleutellabel"* → template picker dialog → *"Afdrukken"* → browser print dialog | Remember the last template and print directly; keep the picker behind a "..." | — | Per new vehicle | No |
| C-08 | Regenerating a barcode silently invalidates printed labels | `database-storage.ts:381-394` bumps `-R<n>`; the UI warns (*"De oude barcode ({{barcode}}) werkt daarna niet meer."*) but nothing reprints | Offer "label opnieuw afdrukken" in the same flow | — | Rare | No |
| C-09 | The scanner does not see a *future* spare reservation | Chain 2 step 10' — `upcomingReservation` was `null` for a car reserved 3 days later | Widen the window, or show "vervanger voor transport #73" | The counter cannot identify the spare it is about to hand out | Every transport day | No |

### 3.10 Quick actions, shortcuts, search (phase 28)

| # | Area | Current manual step (evidence) | Proposal idea | Benefit | Frequency *(estimate)* | Business decision |
|---|---|---|---|---|---|---|
| D-01 | **No keyboard shortcut exists outside the four template editors** | The complete inventory: `documents/template-editor.tsx:505-545`, `documents/transport-report-template-editor.tsx:491-531`, `documents/barcode-label-template-editor.tsx:265-305`, `settings/damage-check-template-editor.tsx:476-495` (all Ctrl+Z/Y/C/V/D, Delete, Escape; the last also arrow-nudge). Everything else is `onKeyDown` on a single input: `edit-contract-number-dialog.tsx:157`, `reservation-list-dialog.tsx:296/500`, and two `stopPropagation` guards. **No `useHotkeys`, no `accessKey`, no global handler** | A small set: Ctrl+K global search, `n` new reservation, `s` scan | The counter is a keyboard-and-scanner workplace | Daily | No |
| D-02 | Two quick-action labels are unreachable | `nl/dashboard.json:55` *"Status wijzigen per voertuig"* and `:57` *"Schadeformulier uploaden"* have no entry in the `quickActions` array (`quick-actions.tsx:271-338`), though the renderer for the first exists at `:889-901` | Wire or remove | — | — | No |
| D-03 | Three quick-action icons render as nothing | `quick-actions.tsx:333-335` `icon: "shield-alert"`, `:1310` `"check"`, `:1420` `"loader-2"` — `ActionIcon` (`:54-258`) has no case for any of them | Add the cases | Buttons with no icon | — | No |
| D-04 | Global search fires 3 requests per keystroke | `MainLayout.tsx:90-126`, min 2 chars, **no debounce** (the vehicles page does debounce, 300 ms — `01b-frontend-en-werkprocessen.md`) | Debounce 250 ms | Typing "Jansen" = 15 requests | Constantly | No |
| D-05 | Selecting a search result leaves the query in the box | `MainLayout.tsx:146-166` sets `showResults=false` but never clears `searchQuery`, so refocusing re-opens the dropdown | Clear on select | Minor friction, constant | Constantly | No |
| D-06 | Search result strings are hardcoded English | `MainLayout.tsx:310` / `:558` `"No results found for …"`, `:411`/`:536` `Maintenance`, `:419`/`:544` `"Unknown Customer"` | i18n | Same class as BUG E18-009 | — | No |

---

## 4. Daily simulation (phase 30)

A workday reconstructed from the code and from the endpoints an employee's browser actually calls. Measurements from `p22-b-daysim.out.json`.

### 4.1 Morning — opening the dashboard

`client/src/pages/dashboard.tsx` is 42 lines; it composes ten widgets. What they fetch, measured:

| Widget (Dutch title) | Endpoint | Rows | Bytes | Latency |
|---|---|---|---|---|
| *"Beschikbare voertuigen"* | `/api/vehicles/available` | 315 | 535 KB | 39 ms |
| *"APK verloopt binnenkort"* | `/api/vehicles/apk-expiring` | 96 | 163 KB | 20 ms |
| *"Achterstallige verhuringen"* | `/api/reservations/overdue` | **362** | 1 482 KB | 74 ms |
| *"Garantie verloopt binnenkort"* | `/api/vehicles/warranty-expiring` | 1 | 2 KB | 29 ms |
| *"Beheer vervangende voertuigen"* | `/api/placeholder-reservations/needing-assignment` **plus the four full tables** `/api/reservations` + `/api/vehicles` + `/api/customers` + `/api/transports` (`spare-vehicle-assignments-widget.tsx:73-95`) | 8 + 2094 + 676 + 354 + 37 | **≈ 9 700 KB** for one widget | 225 ms + 64 + 29 + 91 |
| *"Recente kosten"* | `/api/expenses/recent?limit=10` | 10 | 19 KB | 27 ms |
| *"Aankomende reserveringen"* | `/api/reservations/upcoming` | **5 (hard cap)** | 42 KB | 15 ms |
| *"Reserveringskalender"* | `/api/reservations/range` | 443 | 1 523 KB | **835 ms** |

**What the dashboard shows.**

- **Overdue is noise, and the wrong noise.** 362 rows under *"Achterstallige verhuringen — Voertuigen niet op tijd ingeleverd"*. That list is `status = 'picked_up' AND end_date < today` (`database-storage.ts:1462-1489`). It is unusable as a to-do list at that size (**BUG-113**, previously reported as "358 achterstallig"; it has grown to 362).
- **The list that actually blocks work is a *different* list and it is shown nowhere.** The gate that refuses new bookings is `getOverdueReservationsByVehicle` (`database-storage.ts:1494-1525`): `end_date < today − 3 days AND status NOT IN ('completed','cancelled')`. Measured in the clone: **788 rows on 423 of 675 vehicles (63 %)** — 374 `booked` (never picked up, BUG-040), 353 `picked_up`, 45 maintenance blocks (`active`/`scheduled`/`in`), 8 `returned` (BUG-113), 6 `replacement`, 4 `scheduled`. So **an employee looking at the dashboard sees 362 problems, while 423 cars are quietly unbookable and 426 of the blocking rows appear on no screen at all.** *(Clone numbers — caveat 3.)*
- **Transports are not on the dashboard.** `/api/transports` is fetched only as a lookup table for the spare widget. There is no "transporten vandaag" widget; the employee must open `/delivery`.
- **Maintenance is not on the dashboard.** `/api/reservations/upcoming-maintenance` exists and returns **155 rows**, but no widget renders it. The employee must open `/maintenance`.
- **New portal requests are not on the dashboard.** `/api/portal-admin/dashboard` returns `{counts, attention, notifications, upcoming}` in 131 ms, but the dashboard page does not call it. The only signal is the `PortalAlertChip` badge in the topbar (5-minute poll, `01b-frontend-en-werkprocessen.md`).
- **TBD spares are half-visible.** The spare widget's *"Nog te bepalen"* tab shows the 8 placeholder rows, but *"Aankomende reserveringen"* cannot: `getUpcomingReservations` excludes `vehicleId IS NULL` (`database-storage.ts:1377`) and caps at 5 rows (`:1381`). A planner reading "Aankomende reserveringen" sees five rows out of a fleet of 676.
- **Phantom blocks.** 44 vehicles carry a maintenance block covering today that is not closed (`maintenance_status <> 'out'`). None of them appear on the dashboard; 45 of the block rows are part of the invisible booking gate above. BUG-145 established that 258 such blocks in the dev database came from the test suite, not from the business.
- **Staleness.** `custom_notifications` returns 129 rows. `apk_date_changes` is empty (0 pending), so the nightly RDW scan (`30 2 * * *`) had nothing to confirm.

### 4.2 During the day

- **Create a reservation.** The form (`reservation-form.tsx`, 3111 lines, 9 queries on watch) auto-fills end date (+3 days, `:385`), total price from the daily rate until the user types (`:588-595`), pickup mileage from the vehicle (`:561-571`), the fuel policy (`:462-482`), and runs a live conflict check (`:696-738`). Good. But the vehicle list it offers is 601 of 675 cars with **no type/segment filter and no exclusion of cars booked into the garage** (A-16, A-35), and saving silently converts the vehicle's registration BV → Opnaam (`routes.ts:2631-2650`).
- **The customer calls to change the dates.** This is the wall. *"Bewerken"* → change → *"Reservering bijwerken"* → **400 every time** (**BUG-202**, in production since 2026-08-29). Workarounds: drag the booking in the calendar — which skips the conflict check entirely (**BUG-106**) and therefore can double-book — or use a dialog that happens to hit `/basic`. Then: the price does not follow the new dates (A-10), and the contract already sent to the customer is **not** marked stale (B4-1).
- **Generate and send the document.** Generation works (chain 4). "Versturen" fails in 10 ms with `"Failed to send email. Please check your email configuration in Settings."` and **writes nothing anywhere** — `email_logs` stayed at 12 across three attempts. If SMTP is merely slow rather than dead, the request hangs indefinitely with no timeout (**BUG-171**, measured at ≥45 s in phase 16) and the employee sees a spinner forever (**BUG-212**).
- **A car breaks down.** `POST /api/transports` with `spareRequired` does the right thing — placeholder created, original flagged, TBD queue updated (chain 2, the best-automated step in the app). Then: assigning the spare is a manual scan of an unranked list; handing it over leaves the spare car reading `available` (B3-1); completing the transport wipes the workshop flag (B2-2); and the original rental stays open on a car that is in the garage (B2-3).
- **Update the reservation after the swap.** Same wall as above (BUG-202), and the portal customer is told nothing (BUG-134).

### 4.3 End of day

- **"What is still open?"** — There is no answer. No conflicts view, no unresolved view, no task list. Probing `/api/conflicts`, `/api/dashboard`, `/api/dashboard/summary`, `/api/reservations/unresolved`, `/api/tasks` returned **200 `text/html`** in every case: those are not endpoints, the SPA catch-all answered. The nearest things that exist are the overdue widget (wrong population, §4.1) and the spare widget's TBD tab.
- **"Did today's mail go out?"** — No answer. Document and portal mail is not logged (BUG-155).
- **"Which cars are actually free tomorrow?"** — Two endpoints give different answers (§5.2), and one of them includes cars in the workshop.

### 4.4 Cumulative inefficiencies and dead ends

| # | Dead end | Evidence |
|---|---|---|
| DE-1 | The standard edit form cannot save. Every correction is a workaround, and the shortest workaround double-books | BUG-202 + BUG-106 |
| DE-2 | 63 % of the fleet is unbookable and the blocking rows are on no screen | §4.1, 788 rows / 423 vehicles *(clone)*, BUG-040/113/129 |
| DE-3 | "Versturen" is a no-op that reports nothing, ever | chain 1 step 7, chain 4 step 7, BUG-155 |
| DE-4 | A contract that is out of date with its own reservation is indistinguishable from a correct one | chain 4 step 4' |
| DE-5 | Closing a repair takes three actions across two screens, in an order nothing enforces | B3-2 |
| DE-6 | A spare that is physically with a customer reads `available` and can be booked again | B3-1 |
| DE-7 | After a breakdown swap, two rentals and two `rented` cars exist for one customer, and the workshop flag has been erased | B2-2, B2-3 |
| DE-8 | The scan panel — the fastest path in the app — drops out of scan mode on five of its fourteen actions | C-01 |
| DE-9 | The key-cabinet audit produces a result that cannot be saved, printed or exported | C-04 |
| DE-10 | There is no "openstaande punten" surface of any kind | §4.3 |
| DE-11 | Returning a car silently rewrites the agreed end date, and the price does not follow | BUG-019, A-10 |
| DE-12 | A car flagged "moet gerepareerd worden" can be rented out, and the flag is destroyed by the rental | A-19 |
| DE-13 | A car deliberately taken out of the fleet (`not_for_rental`) becomes bookable again after any workshop visit | A-25b, §5.2(g) |

---

## 5. Consistency matrix (phase 31)

### 5.1 Does each subsystem know about each state?

Legend: **yes** / **no** / **partial**. Evidence is `file:line`, a BUG id, or a measurement from this phase (marked *measured*).

| State | Availability lists | Reservations (booking gate) | Transports | Dashboard | Document generation | Portal | Calendar |
|---|---|---|---|---|---|---|---|
| **Vehicle in maintenance** (`maintenance_status='in_service'`) | **partial** — `getAvailableVehiclesInRange` excludes it (`database-storage.ts:3154`) but `getAvailableVehicles` (no dates) **does not filter `maintenanceStatus` at all**; *measured*: the dashboard's *"Beschikbare voertuigen"* list of 316 contains `AU-22H-X` (`in_service`) and `AU-12J-X` (`needs_service`) | **no** — booking accepted 201 *(measured)*; pickup not conclusively blocked (BUG-109) | **partial** — a breakdown swap sets the flag, completing the transport **clears** it (chain 2 step 13) | **no** — no maintenance widget; `/api/reservations/upcoming-maintenance` (155 rows) is not rendered | **no** — no generator reads `maintenanceStatus` | **yes** — `portal-vehicles.ts:19-31` surfaces blocks + replacement, but only for `picked_up` standard rentals | **yes** — `maintenance/calendar.tsx` |
| **Vehicle `needs_fixing`** (availability) | **yes** — excluded from both lists *(measured: plain=false, range=false)* | **no** — *measured*: booking **201**, pickup **200**, vehicle becomes `rented`, and after return the flag is **gone** (`available`). Root: `getStatusOnReturn` imported at `database-storage.ts:36`, **never called**; BUG-109 | **no** | **partial** — only by absence from *"Beschikbare voertuigen"* | **no** | **no** — not surfaced | **partial** — colour only |
| **Vehicle `not_for_rental`** | **yes** — excluded from all three lists *(measured, incl. `/api/spare-vehicles/available`)* — **but the flag itself does not survive a workshop visit**: *measured*, `PATCH /api/vehicles/:id/maintenance-status` `in_service` → `ok` leaves the car `available` (A-25b) | **partial** — booking **201**, pickup **400** `"Cannot pickup vehicle that is marked as \"not for rental\"."` *(measured)*; `getStatusOnPickup` (`vehicle-status-helper.ts`) is the only live guard. `PATCH /:id/status` bypasses it (BUG-109) | **no** | **partial** | **no** | **no** | **partial** |
| **Reservation `cancelled`** | **yes** — excluded everywhere (`database-storage.ts:237`, `:773`, `:3127`) | **yes** — excluded from the gate (`:1519`) | **no** — **BUG-112**: transport stays planned, driver assignment open, spare + placeholder active | **partial** — disappears from widgets, no trace | n/a | **yes but silent** — *measured*: customer 179's portal list contains 3 `cancelled` rows; **no notification is sent** (BUG-134) | **yes** |
| **Reservation `picked_up`** | **partial** — drives `rented` only via *date coverage*, not via the status (`database-storage.ts:243-257`); a pickup before the start date leaves the car `available` (**BUG-211**) | **yes** — the dominant overdue population (353 rows) | **yes** — `GET /api/barcodes/:code` reports `activeReservation` past the end date (`routes.ts:586-594`) | **yes** — the overdue widget | **yes** | **yes** — `portal-vehicles.ts:14` filters exactly on this | **yes** |
| **Spare assigned** | **no** — *measured* chain 3 step 5: `spare_vehicle_status='picked_up'` while `reservations.status='pending'` and the vehicle stays `available` | **partial** — the spare reservation blocks its own dates, but only if it has a `vehicleId` (placeholders do not) | **yes** — `transports.related_vehicle_id` + `spare_reservation_id`; TBD derivation centralised in `shared/transport-spare-status.ts` | **yes** — *"Beheer vervangende voertuigen"* with tabs *"Nog te bepalen"* / *"Aankomend"* / *"Actief"* | **partial** — the spare gets its own contract at pickup (chain 2 step 11, doc 560) | **partial** — `portal-vehicles.ts:23-26` shows an assigned replacement but **excludes placeholders** (`placeholderSpare = false`) | **yes** — *"Vervangend voertuig (nog te bepalen)"* / *"Wacht op toewijzing"* |
| **Customer blacklisted** (vehicle↔customer pair) | n/a | **yes** — enforced server-side at `routes.ts:2506-2517` (409) **and** client-side in the form (`reservation-form.tsx:522-542`) | **no** — `POST /api/transports` has no blacklist check | **no** | n/a | **yes** — `portal-storage.ts:242-244` applies it server-side | **no** |
| **Customer deleted** | n/a | **no** — `deleteCustomer` (`database-storage.ts:980-986`) is a bare `DELETE` with **no FK from `reservations.customer_id`** (verified: `information_schema` lists no such constraint), no recycle-bin snapshot, no dependency check. *Measured*: **4 reservations point at a customer that no longer exists** | **partial** — `vehicle_transports.customer_id` is `ON DELETE SET NULL` | **no** | **no** — generates `null null` (BUG-166) | **yes, destructively** — `portal_users.customer_id` is `ON DELETE CASCADE`: deleting the customer deletes their portal account | **no** |
| **Vehicle in recycle bin** | **yes** — the row is *gone* from `vehicles` (hard delete + snapshot in `deleted_records`; the table has no `deleted_at` column) | **no** — reservations survive with a dangling `vehicle_id`; *measured*: **262 reservations point at a vehicle that no longer exists**. Restoring re-imposes them without a conflict check (**BUG-108/110**) | **destructive** — `vehicle_transports.vehicle_id` is `ON DELETE CASCADE`: the transports are deleted outright | **no** | **no** | **partial** — `portal-vehicles.ts` left-joins and the rental silently drops out of *"Mijn voertuigen"* | **no** — this is the 2026-08-25 incident |

### 5.2 Conflicting definitions of the same state

**(a) "Available" has four implementations that disagree.**

| # | Implementation | Rule | Disagreement |
|---|---|---|---|
| 1 | `getAvailableVehicles()` — `database-storage.ts:759-830`, used by `GET /api/vehicles/available` with no dates, i.e. the dashboard widget *"Beschikbare voertuigen"* | `availability_status = 'available'` AND no reservation covering today or starting within 3 days; maintenance blocks excluded | **Does not look at `maintenance_status` at all** → *measured*: 2 cars in the workshop are counted as "klaar om te huren" |
| 2 | `getAvailableVehiclesInRange()` — `:3109-3157`, used by the reservation form and every spare dialog | Starts from **all** vehicles; excludes date conflicts (maintenance blocks **excluded from conflicts**), then filters out `in_service`, `not_for_rental`, `needs_fixing` | **Ignores `availability_status = 'rented'/'scheduled'`** (deliberate, `:3151`) and **ignores maintenance blocks** → *measured*: a car with an active block for the requested period is offered, and booking it returns 201 |
| 3 | `syncVehicleAvailabilityWithReservations()` — `:224-352`, run on every reservation write **and on every `GET /api/vehicles`** (BUG-217) | `rented` if any non-cancelled/returned/completed reservation *covers today by date*; `scheduled` if one starts within 30 days; maintenance blocks excluded entirely | **Keys off dates, not on `status`** → a `booked` reservation for today makes the car `rented` (chain 1 step 4) and a pickup before the start date does **not** (BUG-211) |
| 4 | `calculateCorrectStatus()` — `vehicle-status-helper.ts` | `rented` if a reservation is **`picked_up`**; `needs_fixing` if a maintenance block is active; `scheduled` if booked | **Dead code — never called.** It is the only implementation that is right, and it is the only one that does not run |

**(b) `returned` vs `completed`.** `shared/schema.ts:47` calls `returned` a "Legacy state — can transition to completed". In practice `POST /api/reservations/:id/return` **always** leaves the row at `returned`, and nothing pushes it to `completed`. Three subsystems then disagree: `syncVehicleAvailabilityWithReservations` (`:238`) and `getAvailableVehicles` (`:774`) treat `returned` as finished; `getVehicleStatusContext` (`vehicle-status-helper.ts`) also excludes it; but the booking gate `getOverdueReservationsByVehicle` (`:1519`) excludes only `completed` and `cancelled`, so a `returned` row **blocks all future bookings on that car** (BUG-113, re-measured: 8 such rows in the clone).

**(c) Two "overdue" definitions.** `getAllOverdueReservations` (`:1462`, `status='picked_up' AND end_date < today`) drives the widget — 362 rows. `getOverdueReservationsByVehicle` (`:1494`, `end_date < today−3 AND status NOT IN ('completed','cancelled')`) drives the booking gate — 788 rows on 423 vehicles. **The screen and the gate never show the same set.**

**(d) `active`/`pending`/`scheduled`/`in` are outside the state machine.** `VALID_RESERVATION_TRANSITIONS` (`shared/schema.ts:42-48`) knows only `booked`, `picked_up`, `completed`, `cancelled`, `returned`. Yet `POST /assign-spare` creates replacements with `status='pending'` (chain 3 step 4, *measured*), maintenance blocks are created with `status='active'` and `maintenance_status='scheduled'` (chain 3 step 1, *measured*), and the clone holds 40 `active` + 4 `scheduled` + 1 `in` rows inside the booking gate. `VALID_RESERVATION_TRANSITIONS['pending']` is `undefined`, so **no transition out of `pending` is valid** and `PATCH /:id/status` rejects the value as input as well (BUG-129).

**(e) `maintenanceStatus` on the vehicle vs on the block.** Two columns, same name, different vocabularies: `vehicles.maintenance_status` ∈ `ok | needs_service | in_service` (`shared/schema.ts:229`), `reservations.maintenance_status` ∈ `scheduled | in | out` for `maintenance_block` rows (`:744`). They are never synchronised: *measured* (chain 3 step 6) setting the block to `out` left the vehicle at `in_service`, and a separate `PATCH /api/vehicles/:id/maintenance-status {ok}` was required. Conversely, completing a transport clears the vehicle flag while leaving every block untouched (chain 2 step 13). `getVehicleStatusContext` adds a third vocabulary by also accepting `'in_service'` as a block status (`vehicle-status-helper.ts`, `activeMaintenanceStatus` check) — a value the block column never carries.

**(f) `spareVehicleStatus` vs the replacement reservation's own `status`.** `VALID_SPARE_TRANSITIONS` (`shared/schema.ts:51-57`) runs `assigned → ready → picked_up → returned` independently of `VALID_RESERVATION_TRANSITIONS`. *Measured*: after both widget buttons the replacement was `{status:'pending', spare_vehicle_status:'picked_up'}` and the car was still `available`. `shared/transport-spare-status.ts` exists specifically to stop this drift for **transport** spares, but the **maintenance** spare path does not use it.

**(g) Vehicle `availability_status = 'needs_fixing'` means three different things, and the column is a shared scratchpad.** Set manually it means "kapot, niet verhuren". Derived by `calculateCorrectStatus` it means "there is an active maintenance block". And `PATCH /api/vehicles/:id/maintenance-status` writes it as a side effect of the *repair flag*. *Measured* (`p22-e-maintstatus.cjs`, `p22-e2-nfr-overwrite.cjs`):

```
available      + maintenance-status in_service  -> needs_fixing / in_service
needs_fixing   + maintenance-status ok          -> available    / ok
not_for_rental + maintenance-status in_service  -> needs_fixing / in_service
needs_fixing   + maintenance-status ok          -> available    / ok      <-- the not_for_rental decision is gone
maintenance-status needs_service                -> availability untouched
```

So three independent writers share one column with no memory of what the previous value meant, and a deliberate "niet voor verhuur" is destroyed by an unrelated workshop visit (A-25b). `getStatusOnMaintenanceEnd` in `vehicle-status-helper.ts` explicitly preserves `not_for_rental` — and is never called.

---

## 6. Candidate improvements (for the OPT-writer)

One line each. **Size**: S ≤ 1 day, M ≤ 1 week, L > 1 week. **BD** = needs a business decision before it can be built. These are candidates only — no OPT entries are written here.

| Id | Workflow | Problem | Idea | Frequency *(est.)* | Benefit | Size | BD |
|---|---|---|---|---|---|---|---|
| BF-001 | Booking / editing | The standard edit form always 400s; the only workaround double-books | Hotfix BUG-202, then run the conflict check on `PATCH /api/reservations/:id` too | Every correction, daily | Restores the core screen; removes the drag-to-double-book path | S | No |
| BF-002 | Whole app | 63 % of the fleet is silently unbookable and the blocking rows appear nowhere | One "Openstaande punten" screen: gate-blocking rows, TBD spares, open blocks, reservations on deleted vehicles, `returned`-not-`completed` | Daily | Turns an invisible backlog into a work list | M | Yes — what belongs on it |
| BF-003 | Return | `returned` is never closed and then blocks the vehicle after 3 days | Close on return (or nightly sweep), plus a one-off bulk "markeer als afgerond" | Every return | Unblocks 423 vehicles *(clone)* in one action | S | Yes — auto-close or review |
| BF-004 | Availability | Four implementations of "available" disagree; the correct one is dead code | Make `vehicle-status-helper` the single source and delete the duplicates | Continuous | Root cause of BUG-130/211/217 and most of §5.2 | M | No |
| BF-005 | Return / repair flag | `needs_fixing` is destroyed by the rental cycle because `getStatusOnReturn` is never called | Call it; block or warn on pickup of a flagged car | Per repair-flagged car | Closes the second half of BUG-109 | S | Yes — block or warn |
| BF-006 | Spare handover | A spare that is with a customer still reads `available` | Advance the replacement's `status` together with `spare_vehicle_status`, reuse `shared/transport-spare-status.ts` for the maintenance path too | Every spare handover | Removes a live double-booking path | S | No |
| BF-007 | Maintenance close | Three endpoints in two screens to finish one repair, order unenforced | One "onderhoud afronden" action: close block + clear vehicle flag + return spare, transactionally | Every repair | Removes DE-5; kills the phantom-block population at source | M | No |
| BF-008 | Mail | "Versturen" leaves no trace, success or failure | Log every outbound mail to `email_logs`; show sent/failed on the document; add an SMTP timeout | Every mail | Makes "did the customer get it?" answerable | S | No |
| BF-009 | Documents | Editing a reservation leaves a stale contract that looks correct | Mark documents stale on reservation change; one-click regenerate via the existing regeneration service | Every corrected booking | Stops wrong contracts leaving the building | S | Yes — auto or flag |
| BF-010 | Documents | Version number is stored inside `document_type` (`"Contract (Unsigned) 2"`) | A real `version` column | Every regeneration | Makes document queries and the portal classifier correct | S | No |
| BF-011 | Vehicle intake | Bulk plate import promises RDW data in the UI and imports `"Unknown"` | Call the existing RDW client per row, with per-row fallback | Every fleet intake | Turns a 30-field retype into a paste of plates | S | No |
| BF-012 | Customer intake | No KvK, no postcode, no BTW lookup; only `name` is required | Postcode→address (reuse `server/geocoding.ts`) + KvK lookup; make contract-critical fields required at generation time | Every new customer | Fewer typos on every contract and fine | M | Yes — which fields are mandatory |
| BF-013 | Vehicle choice | 601 unranked, unfiltered vehicles offered; no spare suggestion anywhere | Rank the available list by type/fuel/price band; "vergelijkbaar met" for spares | Every booking and spare | Removes eye-scanning from the fastest-moving step | M | Yes — what is "comparable" |
| BF-014 | Booking | A car booked into the garage is offered and booked with no warning | Make an active maintenance block a soft conflict returning `needsSpareVehicle` | Whenever maintenance is planned ahead | Symmetry with the flow that already exists in reverse | S | Yes — block or warn |
| BF-015 | Booking | `not_for_rental` is only refused at pickup | Move the guard to booking | Rare but embarrassing | Customer hears it on the phone, not at the counter | S | No |
| BF-016 | Pricing | Price freezes after one manual edit; open-ended rentals get no price; the server never checks | Store `pricePerDay`, recompute with a "handmatig aangepast" marker, validate server-side | Every edited booking | Financial reports become trustworthy | M | Yes — price model |
| BF-017 | Return | Return and return-from-service overwrite `end_date` with today, sometimes before `start_date` | Keep the agreed end date; store the actual return separately | Every return | Fixes BUG-019 and one source of the BUG-201 crash rows | S | No |
| BF-018 | Scan panel | 5 of 14 actions drop out of scan mode; no "scan volgende"; the scan dialog is unreachable | Wire `onSuccess → lookup()` on the remaining dialogs; move *"Opnieuw scannen"* to the front; wire or delete `openScanDialog` | Every scan-driven round | Makes the fastest path in the app actually continuous | S | No |
| BF-019 | Key audit | The result cannot be saved, printed or exported, and fast scans are silently dropped | Persist an audit run + print it; queue codes instead of dropping them | Monthly/quarterly | The audit finally produces the record it exists for | M | Yes — compliance record? |
| BF-020 | Transport day | Scanning the spare shows nothing; completing the transport erases the workshop flag; the original rental stays open | Show the linked transport/spare on the scan card; keep the flag; close or suspend the original rental as part of the swap | Every breakdown swap | Removes DE-7 and B2-1 | M | Yes — what happens to the original rental |
| BF-021 | Transport / spare | Moving or cancelling a transport leaves the spare on the wrong day | Move/release the spare reservation inside `applyTransportUpdate` | Every rescheduled transport | Closes BUG-114/115 | S | No |
| BF-022 | Cancellation | Cancelling cascades to nothing | Cascade (or ask) for transport, driver, spare and placeholder | Every cancellation | Closes BUG-112 | M | Yes — cascade or ask |
| BF-023 | Portal | The customer is told nothing about their own rental | Extend `portal-maintenance-events` to standard rentals: created, moved, cancelled, vehicle swapped | Every office-side change | The portal starts doing what it was built for | M | Yes — which events |
| BF-024 | Dashboard | Transports, maintenance and portal requests are absent; *"Aankomende reserveringen"* is capped at 5 and hides TBD spares | Add the three widgets; raise/replace the cap; include placeholders | Daily | The morning screen becomes the day's plan | M | Yes — what does the owner want first |
| BF-025 | Bulk | Bulk transport complete is all-or-nothing; bulk APK confirm loses partial results | Per-row outcome, like the CJIB importer already does | Daily | A failed row stops hiding behind a green toast | S | No |
| BF-026 | Bulk | No batch contract generation for tomorrow's pickups | Batch-generate into one print job, following the Barcodeboek model | Daily | Morning prep in one action instead of N | M | No |
| BF-027 | Bulk import | Per-row `getAllVehicles()`, no cap, fake progress bar | Load once, cap the batch, real progress | Per intake | A 200-plate import stops doing 200 full-fleet reads | S | No |
| BF-028 | Keyboard | No shortcut exists outside the four template editors | Ctrl+K search, `n` new reservation, `s` scan | Daily | The counter is a keyboard-and-scanner workplace | S | No |
| BF-029 | Search | 3 requests per keystroke, query left in the box, English strings | Debounce 250 ms, clear on select, i18n | Constantly | Cheap, constant friction removed | S | No |
| BF-030 | Data integrity | `reservations` has no FK to `vehicles` or `customers`; deletes are hard, cascades are silent | Add FKs (or a guarded delete), extend the recycle bin to customers | Rare but catastrophic | *Measured*: 262 + 4 orphan reservations; this is the 2026-08-25 incident's mechanism | L | Yes — migration |
| BF-031 | Vehicle status | `availability_status` is one column written by three unrelated code paths; a workshop visit erases a deliberate `not_for_rental` | Separate "waarom is deze auto niet beschikbaar" from "is deze auto beschikbaar"; stop the maintenance-status route writing availability; use the `getStatusOnMaintenanceEnd` logic that already preserves it | Every workshop visit on a withdrawn car | A sold/written-off/uninsured car stops silently re-entering the bookable pool | S | No |

---

## 7. Scripts and raw outputs

`docs/audit/wip/scripts/`: `p22-chains.cjs` → `p22-chains.out.json`, `p22-ids.json`; `p22-b-daysim.cjs` → `p22-b-daysim.out.json`; `p22-c-statematrix.cjs` → `p22-c-statematrix.out.json`; `p22-d-needsfixing.cjs`, `p22-e-maintstatus.cjs`, `p22-e2-nfr-overwrite.cjs` (console output, reproduced verbatim in §5.1 and §5.2(g)).

Fixtures left in place per `README-agents.md`: customers 1298/1299, vehicles 1878-1884 / 1889 `AU-22H-X` / 1890 `AU-22I-X`, reservations 3545-3570, transport 73, documents 554-565. Note that vehicle 1889 was deliberately left with `maintenance_status='in_service'` while `availability_status='available'` as the standing evidence for §5.2(a) definition 1; do not "clean it up" without re-reading that section.
