# Phase 18 — Browser / E2E testing (Claude Browser, audit server :5001)

Date 2026-09-10/11. Tool: the in-app Claude Browser (Chromium) against `http://127.0.0.1:5001` (dev mode, Vite dev server; the Vite error overlay is dev-only, in production the same failures produce a blank page because the client has no React error boundary — verified: `grep -rn ErrorBoundary client/src` returns nothing). No Playwright/Cypress exists in the repo (phase 2). Viewports: desktop 1182×698, mobile 375×812, tablet 768×1024. Login `admin`. Two staff tabs on the same session ("seed" and "tab-2"). Test data created: reservation #3544 (vehicle AU-13-DCX, customer "Klant 5 B.V.", 2026-10-20..22) created, picked up and returned through the UI.

## Tested

| Spec item | What was done | Result |
|---|---|---|
| Desktop | Dashboard, calendar, list dialog, new-reservation dialog, pickup dialog, return dialog, reports, vehicles, customers, documents | Works except the findings below |
| Mobile (375 px) | Dashboard, /reservations | Dashboard usable (hamburger sidebar, stacked quick actions). /reservations crashed on the bad row (E18-001) exactly like desktop |
| Tablet (768 px) | /vehicles | Sidebar stays expanded and takes ~30 % width; the vehicle table is clipped at the "Kenteken" column and needs an inner horizontal scroll (E18-008) |
| Refresh | Full reload of /reservations, /vehicles, /reports | Session survives, pages reload; every reload re-fetches everything (no persisted cache) |
| Back / Forward | Dashboard → /reservations → back → forward | Routing correct; on back to the dashboard the app fired 41 API requests again (all dashboard queries refetched; `staleTime` 0) |
| Multiple tabs | Same session in two tabs; logout in tab A, then navigate in tab B | Tab B keeps rendering cached data after its requests return 401 and shows no "logged out" message (E18-006) |
| Slow network | `fetch` for `/api/documents` delayed 9 s via the page console, navigated to Documents | Spinner shown, page renders when data arrives; no timeout message; no cancel. `/api/customers` delayed the same way: page rendered instantly from the React Query cache, so a slow backend is invisible until the next reload |
| Failed requests | `/api/reports/maintenance-costs` (500, BUG-089) opened from Reports | The 500 is shown as the empty state "Geen onderhoudskostgegevens beschikbaar" — indistinguishable from "no data" (E18-005) |
| API timeout | Not emulable in this tool beyond the delay above; the client has no request timeout at all (`client/src/lib/queryClient.ts`: plain `fetch`, no `AbortController`) | See E18-005 |
| Server restart | See §Server restart (:5002) below | |
| Database outage | NOT tested — stopping the local Postgres service would also take down the developer's own dev server and database; recorded as not covered | |
| Long loading | 8.0 MB uncompressed `/api/reservations` (2075 rows, no `Content-Encoding`) loaded in 181 ms on localhost; the calendar page requests it twice on load and three times after creating a reservation | Performance detail → phase 19 |
| Empty states | Vehicles search "ZZZ-NOPE-999" | Table shows "No results." / "Showing 0 of 0" / "Previous" / "Next" in English inside the Dutch UI (E18-009) |
| Large datasets | Vehicles list 665 rows | Client-side pagination "10 of 665", 10 per page, responsive; calendar month view with ~2000 reservations renders in < 1 s (dev mode) |
| Real-world workflow | New reservation → pickup (contract) → return (damage check) through the dialogs | Works end to end (reservation #3544, documents 447 contract + 448 damage check, vehicle mileage 100 → 250). Side effects: BUG-019 reproduced through the UI (end date overwritten with today: start 2026-10-20 / end 2026-09-10), pickup allowed 40 days before the start date without any warning and the vehicle stayed `available` while `picked_up` (E18-004) |
| Reservation edit form | Edit an existing reservation (#3472 and #3231) from the list view, change only notes, save | **Fails every time** with 400 "invalid input syntax for type integer: \"\"" (E18-002) |
| Login | Username + password + Enter key | Enter does not submit; only the button click does (E18-007) |

| Portal (customer) smoke test | `/portaal/login` → login (fixture customer 179) → `/portaal/voertuigen` on desktop and mobile | Login, greeting, vehicle cards with "Onderhoud melden / Schade melden / Kilometerstand doorgeven", planned-maintenance and replacement badges all render; mobile layout has a bottom tab bar and stacks cleanly. `/portal` (without the Dutch path) shows the SPA 404 page with the developer text "Ben je vergeten de pagina aan de router toe te voegen?" (E18-009). The Enter key did not submit the portal login either — same tool behaviour as the staff login, which supports the "tool artefact" reading of E18-007 |

## Not tested (why)

- Database outage (would break the shared dev environment).
- Portal (customer) UI beyond the smoke test above (request dialogs, document acks, driver management): API-level coverage in phases 3-5/10/11/16.
- Barcode scanner page (`/scan`) needs a camera.
- Print dialogs / actual printing (browser print is not observable in this tool).
- Drag-and-drop in the calendar (BUG-106 was proven at API level; the pointer drag could not be reproduced reliably in the tool).

## Findings summary

| Id | Severity | Title |
|---|---|---|
| E18-001 | HIGH | One reservation with an unparsable date crashes the whole Reservations page (no error boundary) |
| E18-002 | HIGH | The reservation edit form is broken: every save fails with `invalid input syntax for type integer: ""` |
| E18-003 | MEDIUM | Calendar page overflows horizontally at 1182 px; after a dialog closes the viewport stays scrolled and the sidebar covers the header |
| E18-004 | MEDIUM | Pickup dialog allows pickup weeks before the start date without warning; vehicle stays `available` while `picked_up` |
| E18-005 | MEDIUM | Failed API requests are rendered as empty states; no request timeout, no retry, no error toast on GET failures |
| E18-006 | MEDIUM | A tab whose session ended keeps showing cached data and never redirects to login |
| E18-007 | LOW | Enter key does not submit the login form |
| E18-008 | LOW | Tablet layout: sidebar stays open, tables clipped |
| E18-009 | LOW | Untranslated English strings and US date formats in the Dutch UI ("No results.", "Showing 0 of 0", "Previous/Next", "Full", "Sep 11, 2026, 12:54 AM", "Aug 11, 2026 - Sep 10, 2026") |
| E18-010 | LOW | Document timestamps shown 2 h ahead of real time ("Uploaded: Sep 11, 2026, 12:54 AM" for a file created 2026-09-10 22:54 CEST) |
| E18-011 | LOW | Clicking outside the new-reservation dialog discards everything typed without confirmation |

## BUGs

BUG E18-001
Severity: HIGH
Feature: Reservations page (calendar) — rendering of completed rentals
Status: OPEN
Reproduction: With a reservation whose `endDate` is not an ISO date (audit rows 3442 `"not-a-date"` and 3365 `"2099-13-45"`, both created through `PATCH /api/reservations/:id` = BUG-111; the dev clone also holds 3 pre-existing rows with a full ISO timestamp in `end_date`, which `parseISO` still accepts), open `/reservations` as any user, on any viewport.
Expected: The page renders; a row with a broken date shows a placeholder ("–") and is reported.
Actual: `RangeError: Invalid time value` from `format(parseISO(rental.endDate), 'MMM d, yyyy')` in `client/src/pages/reservations/calendar.tsx:3205` inside the "Voltooid bekijken" list (rendered eagerly on page load, not only when the dialog opens). In dev the Vite overlay appears; in production React unmounts the tree — a blank page. Back navigation to the dashboard works, forward to /reservations crashes again. Only after deleting rows 3442 and 3365 through the API did the page render. Same pattern (`format(parseISO(...))` without a guard) occurs in the same file at several other places (`grep -n "format(parseISO" calendar.tsx` → 20+ hits).
Root cause: `client/src/pages/reservations/calendar.tsx:3205` (and siblings) format dates without validating them; `client/src/App.tsx` has no error boundary around routes; the server accepts non-ISO dates (BUG-111).
Affected files: client/src/pages/reservations/calendar.tsx, client/src/App.tsx
Affected data: any reservation with a malformed date; the 3 pre-existing rows with timestamps in `end_date` render but are at risk with any stricter formatter.
Security impact: Low-privilege DoS of the main planning page: any account that can `PATCH /api/reservations/:id` (BUG-084/BUG-111) can make the Reservations page unusable for every employee.
Business impact: The planning screen is the core of the daily work; one bad row takes it away for everyone until someone finds and fixes the row in the database.
Fix: Wrap `format(parseISO(x))` in a safe helper (`isValid(parsed) ? format(...) : '–'`); add a route-level `ErrorBoundary` with a "Reload / report" fallback; fix BUG-111 server-side.
Regression test: vitest component test rendering the completed-rentals list with `endDate: "not-a-date"` → renders "–", no throw; server test: `PATCH` with `endDate: "not-a-date"` → 400.

BUG E18-002
Severity: HIGH
Feature: Reservation edit form (`client/src/components/reservations/reservation-form.tsx`, used by "Bewerken" in the list view and details dialog)
Status: OPEN
Reproduction: Open any reservation (tested #3472 `AU-147-X` and #3231 `AU-002-X`, both `booked`) → "Bewerken" → change only the notes → "Reservering bijwerken".
Expected: 200, notes saved.
Actual: `PATCH /api/reservations/3231` → 400 `{"message":"Failed to update reservation","error":"invalid input syntax for type integer: \"\""}`; toast "Reservering bijwerken mislukt: Failed to update reservation". Captured multipart body: the form posts EVERY column of the reservation row, null values as empty strings (`reservation-form.tsx:916-923`): `driverId=""`, `replacementForReservationId=""`, `replacementForTransportId=""`, `affectedRentalId=""`, `portalRequestId=""`, `deliveryStaffId=""`, `recurringParentId=""`, … The route `PATCH /api/reservations/:id` (`server/routes.ts:3445-3540`) converts a fixed list of fields from `""` to null (driverId, replacementForReservationId, affectedRentalId, maintenanceDuration, recurring*, pickupMileage, …) but NOT `replacementForTransportId` (column added 2026-08-29, commit 8b7f913d) and NOT `portalRequestId` (added 2026-09-06, commit 20e7bf6b, the customer-portal maintenance feature). Isolated with curl: `-F replacementForTransportId=` → 400, `-F portalRequestId=` → 400, `-F driverId=` / `spareVehicleId=` / `deliveryStaffId=` / `deliveryFee=` → 200. So the form has been broken since 2026-08-29 (one unhandled column) and the portal feature added a second one; both are in production (main = 3e28645e).
Root cause: `server/routes.ts:3445` PATCH handler passes the raw multipart body to `db.update()` (BUG-084) with a hand-maintained `""→null` whitelist; `reservation-form.tsx:912-923` spreads the whole row into the request.
Affected files: server/routes.ts, client/src/components/reservations/reservation-form.tsx
Affected data: none written (the update is rejected), but every edit through the standard form is impossible.
Security impact: None directly; the raw pg error text is returned to the client (same class as BUG-148).
Business impact: Employees cannot correct a booking (dates, customer, vehicle, price, notes) through the normal edit screen; workarounds are the calendar drag (BUG-106) or the `/basic` route used by other dialogs.
Fix: Server: coerce every nullable integer column generically (`for (const k of INT_COLUMNS) if (req.body[k] === '' || req.body[k] === 'null') req.body[k] = null`) or, better, validate the PATCH body with a zod schema (also closes BUG-084). Client: send only changed fields as JSON when no file is attached.
Regression test: supertest `PATCH /api/reservations/:id` multipart with `portalRequestId=""` and `replacementForTransportId=""` → 200; and a schema-drift test asserting every integer column of `reservations` is covered by the coercion list.

BUG E18-003
Severity: MEDIUM
Feature: Reservations calendar page — layout
Status: OPEN
Reproduction: Desktop viewport 1182×698, open /reservations, open "Nieuwe reservering", select a vehicle, click outside the dialog.
Expected: No horizontal page scroll; closing the dialog restores the previous scroll position.
Actual: `document.documentElement.scrollWidth` = 1416 px vs `clientWidth` 1166 px on the calendar page (the page body scrolls horizontally at a normal laptop width); after the dialog closed `window.scrollX` was 234 px, so the fixed sidebar covered the page header ("Reserveringskalender" cut to "er"). Screenshot evidence in the session.
Root cause: calendar grid min-width larger than the content area (`client/src/pages/reservations/calendar.tsx` week grid); Radix dialog scroll-lock release leaves the horizontal offset.
Affected files: client/src/pages/reservations/calendar.tsx, client/src/layouts/MainLayout.tsx
Affected data: none
Security impact: none
Business impact: On 13"–14" laptops the calendar header/buttons slide under the sidebar; users scroll sideways to find "Nieuwe reservering".
Fix: `overflow-x: auto` on the calendar container instead of the page; `min-w-0` on the main column; reset `scrollX` when dialogs close.
Regression test: Playwright viewport 1182 px → `documentElement.scrollWidth <= clientWidth`.

BUG E18-004
Severity: MEDIUM
Feature: Pickup dialog / vehicle status after pickup
Status: OPEN
Reproduction: Reservation #3544 with start 2026-10-20; on 2026-09-10 click "Ophalen starten", fill mileage, submit.
Expected: A warning that the rental starts in 40 days (or a block); after pickup the vehicle is `rented`.
Actual: Pickup accepted without warning (`POST /api/reservations/3544/pickup` 200, status `picked_up`, contract 1000000 generated). `GET /api/vehicles/1866` afterwards: `availabilityStatus: "available"` while the reservation is `picked_up` — the vehicle is still offered as bookable on the dashboard. After the return the same rental ended with start 2026-10-20 / end 2026-09-10 (BUG-019).
Root cause: `server/routes.ts` pickup route has no start-date check; vehicle status helper sets `rented` only when today is inside the reservation period (`server/vehicle-status-helper.ts`).
Affected files: server/routes.ts (pickup), server/vehicle-status-helper.ts, client/src/components/reservations/pickup-return-dialogs.tsx
Affected data: reservations picked up before their start date (130 `picked_up` rows with a future start in the dev clone, phase 12)
Security impact: none
Business impact: A car that physically left the yard is still shown available; a second booking for the same days is accepted (relates to BUG-107/109/130).
Fix: On pickup, if `startDate > today`, either require a confirmation and move `startDate` to today, or block; derive `availabilityStatus` from `status === 'picked_up'` regardless of dates. Needs an owner decision on the desired behaviour (B).
Regression test: pickup of a future reservation → 409 (or 200 + startDate updated, per decision); vehicle status `rented` after any pickup.

BUG E18-005
Severity: MEDIUM
Feature: Client error handling for GET requests
Status: OPEN
Reproduction: Reports → "Analyse onderhoudskosten" (backend returns 500, BUG-089). Also: delay `/api/documents` by 9 s in the console and open Documents.
Expected: An error message ("Kon rapport niet laden, probeer opnieuw") distinct from "no data"; a timeout after N seconds with a retry.
Actual: The 500 is rendered as "Geen onderhoudskostgegevens beschikbaar" (also a typo: "onderhoudskost­gegevens"); no toast, no retry. There is no client-side timeout: `client/src/lib/queryClient.ts` uses bare `fetch` without `AbortController`; a hung backend shows a spinner forever.
Root cause: components use `data ?? []` and never look at `isError`; no global `onError` in the QueryClient; no timeout.
Affected files: client/src/lib/queryClient.ts, client/src/components/reports/*, client/src/pages/reports*
Affected data: none
Security impact: none
Business impact: Employees conclude "there are no costs" when the report actually failed.
Fix: Global query error handler (toast + inline error state), `AbortController` timeout (e.g. 30 s) with a retry button.
Regression test: component test with a 500 → error state rendered, not the empty state.

BUG E18-006
Severity: MEDIUM
Feature: Session end in other tabs
Status: OPEN
Reproduction: Two tabs, same session. Tab A: user menu → "Uitloggen". Tab B: click "Voertuigen".
Expected: Tab B redirects to the login page (or shows "Je bent uitgelogd") on the first 401.
Actual: Tab B renders the vehicles page from the React Query cache; `/api/vehicles` and `/api/reservations` return 401 in the background, nothing is shown to the user; every mutation would fail. The same happens when the 15-minute session expires while a tab is open.
Root cause: `client/src/hooks/use-auth.tsx` / `queryClient.ts` do not treat 401 globally (no redirect, no cache clear).
Affected files: client/src/lib/queryClient.ts, client/src/hooks/use-auth.tsx, client/src/components/protected-route.tsx
Affected data: none
Security impact: Stale customer data remains visible on a shared workstation after logout in another tab until the page is reloaded.
Business impact: Employees think they are still logged in, fill in a form and lose it on submit.
Fix: Global 401 handler: clear the query cache and navigate to `/login`; optionally broadcast logout via `BroadcastChannel`/storage event.
Regression test: mocked 401 on any query → `location` becomes `/login`.

BUG E18-007
Severity: LOW
Feature: Login form
Status: OPEN
Reproduction: Type username and password, press Enter (twice reproduced, before and after logout).
Expected: Form submits.
Actual: Nothing happens; no `POST /api/login`. Only the "Inloggen" button submits.
Root cause: NOT CONFIRMED in code — `client/src/pages/auth-page.tsx:80` has a proper `<form onSubmit={loginForm.handleSubmit(onLoginSubmit)}>` and the button is `type="submit"` (`:108`), so implicit submission should work. The synthetic "Return" key of the test tool may not trigger Chromium's implicit form submission; treat as UNVERIFIED until reproduced by hand in a real browser.
Affected files: client/src/pages/auth-page.tsx
Affected data: none
Security impact: none
Business impact: If real: minor daily friction; password managers that submit with Enter fail.
Fix: Only if reproduced manually: check for an `onKeyDown` handler swallowing Enter in the password `Input` wrapper.
Regression test: component test: Enter in the password field triggers the login mutation.

BUG E18-008
Severity: LOW
Feature: Tablet layout (768 px)
Status: OPEN
Reproduction: Tablet preset, open /vehicles.
Expected: Collapsed sidebar or a table that fits; horizontal scroll inside the table container.
Actual: Sidebar stays at full width (~220 px); the vehicle table is clipped after "Kenteken" with a scrollbar on the card, page content narrower than the table.
Root cause: sidebar breakpoint is `md` (768 px) → expanded exactly at tablet width; table has no `overflow-x-auto` wrapper.
Affected files: client/src/layouts/MainLayout.tsx, client/src/pages/vehicles*.tsx
Affected data: none
Security impact: none
Business impact: Tablet use at the counter is awkward.
Fix: Collapse the sidebar below `lg`; wrap tables in `overflow-x-auto`.
Regression test: visual/Playwright check at 768 px.

BUG E18-009
Severity: LOW
Feature: i18n — untranslated strings and locale formats
Status: OPEN
Reproduction: Vehicles empty search; reservation details (fuel "Full"); document list ("Uploaded: Sep 11, 2026, 12:54 AM"); Reports date range ("Aug 11, 2026 - Sep 10, 2026"); list view dates "01 Oct 26".
Expected: Dutch strings and `nl-NL` formats in the Dutch UI.
Actual: English strings/formats as listed.
Root cause: hard-coded strings in `client/src/components/ui/data-table*.tsx`, `date-fns` `format` without the `nl` locale, fuel level enum values shown raw.
Affected files: client/src (data-table, reservation details dialog, documents list, reports header)
Affected data: none
Security impact: none
Business impact: Unprofessional appearance; US date order confuses users.
Fix: i18n keys for the table strings; `format(date, pattern, { locale: nl })` via a shared helper.
Regression test: i18n lint (no untranslated literals in JSX) — advisory.

BUG E18-010
Severity: LOW
Feature: Document timestamps
Status: OPEN
Reproduction: Generate a contract at 22:54 CEST (2026-09-10); open the reservation details.
Expected: "10 sep 2026, 22:54".
Actual: "Uploaded: Sep 11, 2026, 12:54 AM" (+2 h). `documents.created_at` is stored as a naive timestamp (server local time) and rendered as if UTC, or vice versa.
Root cause: `timestamp` without time zone in `shared/schema.ts` for `documents.createdAt` (and other tables), serialised with `Z` and displayed in local time.
Affected files: shared/schema.ts, server/database-storage.ts (document insert), client document lists
Affected data: all timestamp columns without tz
Security impact: none
Business impact: Wrong times on documents and audit views (matters for "who did what when" in disputes).
Fix: `timestamp with time zone` for new columns and a migration for existing ones, or format with the stored offset. Needs owner decision for the migration (B).
Regression test: insert now(), read back through the API, compare to the client's rendered time.

BUG E18-011
Severity: LOW
Feature: New-reservation dialog — dismiss on outside click
Status: OPEN
Reproduction: Fill dates, pick a vehicle, click on the page outside the dialog.
Expected: Confirmation ("Wijzigingen weggooien?") or the dialog stays open.
Actual: Dialog closes immediately; all input lost.
Root cause: Radix `Dialog` default `onPointerDownOutside`; no dirty-check.
Affected files: client/src/components/reservations/reservation-form.tsx (dialog wrapper)
Affected data: none
Security impact: none
Business impact: Re-typing long bookings; frustration.
Fix: `onPointerDownOutside={(e) => form.formState.isDirty && e.preventDefault()}` + confirm.
Regression test: component test: dirty form + outside click → dialog still open.

## Re-confirmed existing bugs (new evidence)

- BUG-019: reproduced through the UI return dialog: reservation #3544 ends with `startDate 2026-10-20`, `endDate 2026-09-10`.
- BUG-089: `/api/reports/maintenance-costs` 500 as seen from the Reports page (see E18-005 for the UI effect).
- BUG-111: the two garbage-date rows created in phase 10 are what crashed the page (E18-001).
- BUG-084: the raw multipart body reaching `db.update()` is the mechanism behind E18-002.
- BUG-172: the client sends the full row on every edit with no version field — the lost-update mechanism, now seen from the browser.
- BUG-079-related: the dashboard fires ~20 API calls on load, the calendar page requests the 8 MB `/api/reservations` twice on load and three times after a mutation; no `Content-Encoding` on responses (phase 19 measures this).

## Server restart (:5002)

Done after phase 17 released the :5002 server. Logged in on `http://127.0.0.1:5002/vehicles`, then killed the node process of the server (`taskkill /F` on the :5002 listener; the launch loop restarts it after 3 s, `/health` was 000 for ~5 s).

- During the outage: clicking "Klanten" in the sidebar rendered the customers page from the React Query cache; console shows `❌ Socket connection error … xhr poll error` and `net::ERR_CONNECTION_REFUSED` for `/api/*`, but the UI shows **no banner, toast or offline indicator** — the employee cannot tell the server is down (same class as E18-005/E18-006).
- After the restart: the Socket.IO client reconnected by itself, the next navigation fetched fresh data (all 200), and the session survived (`GET /api/user` 200 — sessions live in Postgres, not in process memory). No re-login needed, no data loss in open dialogs was tested.
- Verdict: recovery is automatic and correct; the missing piece is user feedback during the outage (folded into E18-005: add a global "verbinding verbroken" indicator driven by the socket `disconnect`/`connect_error` events that already fire).

Database outage: not tested (see Not tested).
