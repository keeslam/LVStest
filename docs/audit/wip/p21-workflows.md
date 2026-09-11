# Phase 21 / 23 / 24 / 25 / 29 — user-centric workflow audit, process mapping, employee efficiency, human-error prevention, error recovery

Date 2026-09-11 · branch `feat/customer-portal` · audit server `http://localhost:5001` (dev/tsx), database
`lvs_audit` · client source read at the working-tree state of this branch.

Report language: English. Dutch UI labels are quoted verbatim from `client/src/locales/nl/*.json`
(the language the counter staff actually see).

---

## 0. Method & caveats

**What this phase did**

1. Read the staff client end to end: `client/src/App.tsx`, `client/src/layouts/MainLayout.tsx`,
   `client/src/components/sidebar-nav.tsx`, every page under `client/src/pages/**` and the dialog
   components under `client/src/components/**` that those pages mount, plus all 16 Dutch locale
   namespaces.
2. Re-read the earlier audit output for the *defects* so this report does not repeat them:
   `docs/audit/01b-frontend-en-werkprocessen.md`, `docs/audit/wip/p18-browser-e2e.md`,
   `docs/audit/05-phase-9-12-rapport.md` §1, `docs/audit/06-phase-13-16-rapport.md` §1,
   `docs/audit/07-phase-17-19-rapport.md` §1–2, and
   `docs/superpowers/specs/2026-09-06-portal-vehicles-maintenance-design.md`.
3. Exercised the recovery paths against the audit server with three scripts
   (`docs/audit/wip/scripts/p21-recovery.cjs`, `p21-recovery2.cjs`, `p21-recovery3.cjs`; outputs
   `p21-recovery*.out.json` / `.out.txt`). All data created is prefixed `AUDIT-P21`
   (vehicles `AU-211-X`…`AU-214-X`, customers `AUDIT-P21 Customer A/B`, reservations #3554–#3563).
   Sessions used `fakeIp` `10.21.1.1`–`10.21.1.4`, one login each, per `README-agents.md`.
   `audit_logs` rows were read straight from the database for every action exercised.

**How the counts were produced — read this before believing any number**

- **No browser was available to this phase.** Every click/screen/field count is
  **counted from code**: it is the number of pointer interactions on rendered controls in the
  happy path of the JSX, read from the component source. Nothing was measured in a real browser.
- Counting rule used throughout: **1 click** = one pointer interaction on a control. A `<Select>`
  costs **2** (open the trigger, pick the item). A searchable combobox (`SearchableCombobox`,
  `VehicleSelector`) costs **2 clicks + 1 typed search string**. A checkbox, tab, table row or
  button costs **1**. Opening a dialog costs 1, closing it 1 (only counted where the flow forces it).
- **Typed fields** = fields the user must fill by keyboard in the happy path (date inputs count as
  typed, even though the browser offers a picker).
- Anything phrased as "seconds", "per day", "×50" or "time saved" is an **estimate** and is labelled
  as such inline. There are no measured durations in this report.
- Frequencies ("50 times a day") come from the brief, not from data. Where the audit database gave a
  real number (e.g. 362 overdue rentals) it is labelled as a clone measurement, not a production one.

**Scope boundaries**

- Read-only for application code. Nothing was modified, nothing committed.
- The customer-facing portal UI is only covered where staff touch it (workflow I). The customer side
  is phase 3-5/10/11/16 territory.
- Printing could not be observed (no browser) — same gap as phases 14 and 18.
- Defects are **referenced by BUG id**, never re-described. This report is about **process**.

---

## 1. Navigation and global inventory

### 1.1 Sidebar (`client/src/components/sidebar-nav.tsx:21-33`)

Twelve items, in this order, each gated by permission (admin sees all):

| # | Label (nl) | Route |
|---|---|---|
| 1 | "Dashboard" | `/` |
| 2 | "Voertuigen" | `/vehicles` |
| 3 | "Scannen" | `/scan` |
| 4 | "Klanten" | `/customers` |
| 5 | "Klantenportaal" | `/portal-admin` (unread badge, 5-min poll, `sidebar-nav.tsx:48-54`) |
| 6 | "Reserveringen" | `/reservations` |
| 7 | "Onderhoud" | `/maintenance` |
| 8 | "Kosten" | `/expenses` |
| 9 | "Documenten" | `/documents` |
| 10 | "Transporten" | `/delivery` |
| 11 | "Communicatie" | `/communications` |
| 12 | "Rapporten" | `/reports` |

"Instellingen", "Gebruikers", "Back-upbeheer" and "Profiel" are **not** in the sidebar; they are
dialogs behind the avatar menu (`components/user-menu.tsx:130-160`, labels in `nav.json` →
`userMenu`). A counter employee looking for settings has no visual cue they exist.

**Process observations.** The order is not the order of the working day. The two screens the counter
uses most (Reserveringen, Scannen) sit at positions 6 and 3, below "Voertuigen" and
"Klantenportaal". There is no grouping (planning / vehicles / administration). There is no "Vandaag"
entry point anywhere in the navigation.

### 1.2 Global search (`layouts/MainLayout.tsx:85-120, 229-300, 400-560`)

- One input in the header, placeholder from `common:searchPage.searchPlaceholder`. Minimum 2
  characters (`:100, :106, :114`).
- **Three separate queries fire in parallel on every keystroke** — `/api/vehicles?search=`,
  `/api/customers?search=`, `/api/reservations?search=` (`MainLayout.tsx:86-120`). There is **no
  debounce** here (contrast `pages/vehicles/index.tsx:88-95`, which does debounce 300 ms). Typing an
  8-character plate therefore issues **21 API calls** (7 keystrokes × 3), counted from code.
- Results render as a dropdown grouped Voertuigen / Klanten / Reserveringen; Enter (form submit,
  `:230-246`) opens a larger "Zoekresultaten voor …" dialog with the same three lists.
- Clicking a result opens a **detail dialog**, not a page (`:143-170`). Those dialog states are a
  *second*, private copy of the global dialog context (`contexts/GlobalDialogContext.tsx` keeps its
  own set) — `01b` observation 11.
- Two hard-coded English strings in the Dutch UI: `No results found for "…"` at
  `MainLayout.tsx:310` and `:558` (BUG-209/E18-009 class).
- Six `console.log` calls with entity ids on this path (`MainLayout.tsx:94, 98, 161, 169, 595, 600`).

**Process observations.** Search is the only cross-entity entry point and it is good: one box, three
entity types, result → dialog without losing the current page. Two gaps: it does not search by
**contract number** (the number the customer reads out over the phone — `/api/reservations?search=`
is the generic list search; `find-by-contract` exists at `server/routes.ts:2315` but is only wired
into the pickup dialog's duplicate check, `pickup-return-dialogs.tsx:205`), and it does not search
**documents** or **fines**.

### 1.3 Dashboard quick actions (`components/dashboard/quick-actions.tsx:270-336`)

Eleven actions; the first five render as large tiles:

| Tile | Label (nl) | Primary? |
|---|---|---|
| 1 | "Nieuwe reservering" | yes |
| 2 | "Schadecheck starten" | yes |
| 3 | "Voertuig toevoegen" | yes |
| 4 | "Klant toevoegen" | yes |
| 5 | "RDW APK-datums scannen" | yes |
| 6 | "Document uploaden" | no |
| 7 | "Kosten registreren" | no |
| 8 | "Brandstofstatus bijwerken" | no |
| 9 | "Registratie wijzigen" | no |
| 10 | "APK-rapport uploaden" | no |
| 11 | "APK-meldingen versturen" | no |

**The two actions the counter performs most — handing a car over ("Ophalen") and taking it back
("Innemen") — are not on the dashboard at all.** Both require navigating to `/reservations`, finding
the booking, opening it and clicking inside the view dialog, or going to `/scan`. Meanwhile
"RDW APK-datums scannen", a background maintenance job, occupies a primary tile.

### 1.4 Dashboard widgets (`pages/dashboard.tsx:1-42`)

`BackupStalenessBanner`, `QuickActions`, then `VehicleAvailabilityWidget`, `ApkExpirationWidget`,
`OverdueReservationsWidget`, `WarrantyExpirationWidget`, `SpareVehicleAssignmentsWidget`,
`RecentExpenses`, `UpcomingReservations`, `ReservationCalendar`.

None of them is "today's pickups", "today's returns", "today's transports" or "today's maintenance".
See workflow F.

### 1.5 Keyboard shortcuts

`grep -rn "onKeyDown|useHotkeys|addEventListener('keydown')|accessKey" client/src` returns **nine**
hits. Four are real shortcut handlers and all four are inside template **editors**:

| File:line | Shortcuts |
|---|---|
| `pages/documents/template-editor.tsx:515-546` | Ctrl/Cmd+C, +V, +D, arrows (+Shift), Delete, Escape |
| `pages/documents/transport-report-template-editor.tsx:531` | same set |
| `pages/documents/barcode-label-template-editor.tsx:280-307` | same set |
| `pages/settings/damage-check-template-editor.tsx:495` | Escape/selection |

The other five are accessibility helpers (`reservation-list-dialog.tsx:296, 500` — Enter/Space to
open a row; `searchable-combobox.tsx:154` and `vehicle-selector.tsx:147` — `stopPropagation` so the
dialog does not steal keys; `edit-contract-number-dialog.tsx:157`).

**There is not a single keyboard shortcut in any operational screen.** No "N" for new reservation,
no "/" to focus search, no Escape-to-cancel convention, no Enter-to-submit beyond native form
behaviour (and E18-007 suggests even that is worth verifying by hand on the login screen).

### 1.6 Barcode / scan

`pages/scan/index.tsx` (21 lines) mounts `components/barcodes/scan-panel.tsx` (573 lines).
Also reachable as a dialog from the global dialog context and as a pre-step for the interactive
damage check (`quick-actions.tsx:380-386`). See workflow K — it is the fastest path in the product
and the only place where one physical action (scan) resolves to the right next action.

---

## 2. Workflow A — customer intake → reservation → documents → pickup → return → close

### A.1 Step table

| # | Step | Screen / dialog | User action | Clicks (counted from code) | Typed fields | Searches | Confirmations | Waits | Information visible here | What can go wrong (human error) | Prevented / validated / warned / nothing | Recovery path |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | New customer | "Klant toevoegen" tile → `customer-form.tsx` (34 `FormField`) | fill + save | 2 (+1 per select) | 1 required ("Naam", min 2 chars, `customer-form.tsx:29`); 33 optional | – | none | save round-trip | empty form, no duplicate hint | duplicate customer created; no e-mail/phone/address captured, which blocks the contract later | **nothing** — proven: two `POST /api/customers` with identical name *and* e-mail both returned 201 (ids 1302, 1303; `p21-recovery2.out.json` step G) | manual: find + delete one, re-point the reservation |
| 2 | Add driver (optional) | `driver-dialog.tsx` from inside the reservation form ("Snel chauffeur toevoegen", `reservation-form.tsx:1867-1870`) | fill + save | 3 | 1 required ("displayName", `driver-dialog.tsx:48`); 11 optional incl. licence upload | – | none | upload | customer's existing drivers | driver filed under the wrong customer | validated only insofar as the dialog is scoped to `customerId` | edit the driver; no move-to-other-customer |
| 3 | Open new reservation | Dashboard tile **or** `/reservations` → "Nieuwe reservering" (`calendar.tsx:1074-1080`) **or** `/scan` → "Reservering maken" (`scan-panel.tsx:399-402`) | click | 1 | – | – | – | 9 queries fire on form mount (`reservation-form.tsx:333-494`) | – | wrong entry point → vehicle not pre-filled | n/a | – |
| 4 | Dates | Section 1 of the form (`reservation-form.tsx:1338-1470`) | type start, type end | 2 | 2 ("Startdatum", "Einddatum") + 2 optional ("Ophaaltijd", "Inlevertijd") | – | – | – | duration ("Duur:"), "Open einde" checkbox | end before start; wrong month | end date **auto-filled** as start+3 days (`:385`, `:682-689`); duration recomputed (`:578-586`); invalid range renders `null` duration | retype |
| 5 | Vehicle | `VehicleSelector` (`:1616-1640`) | open, type, pick | 2 | 1 search string | 1 | – | list = `/api/vehicles/available?startDate&endDate` (`:497-529`) | picking a car that is in the workshop or blacklisted | blacklist **filtered out both ways** (`:522-542`); remarks trigger `vehicle-remarks-warning-dialog` ("BELANGRIJK: Bekijk deze opmerkingen voordat het voertuig vertrekt"); workshop status **not** filtered — BUG-109 | change the selection |
| 6 | Customer | `SearchableCombobox` (`:1773`) | open, type, pick | 2 | 1 search string | 1 | – | phone • e-mail • city • company tag (`:740-770`) | wrong customer with a similar name | **nothing beyond the visible contact line**; driver is auto-cleared on customer change (`:449-457`) | re-pick before save; after save see workflow C |
| 7 | Status | "Reserveringsstatus" select (`:2062-2095`) | leave on "Geboekt" | 0 | – | – | – | hint "Werk de reserveringsstatus bij indien nodig" | choosing "Opgehaald" here does **not** pick the car up — it saves as `booked` and then opens a second dialog (`:1205-1216`, `:1094-1116`) | warned by a toast: "Ophaaldialoog wordt geopend / Vul de ophaalgegevens in (contractnummer, kilometerstand, brandstofniveau)." | – |
| 8 | Price / delivery / notes | `:2223-2360`, `:2652` | usually leave | 0–5 | 0–5 | – | – | "Totaalprijs (€)" auto-filled from daily rate × days until first manual edit (`:587-595`) | wrong price silently kept after a date change | auto-fill **stops permanently** once the user types (`priceManuallyEditedRef`, `:589`) — good | retype |
| 9 | Overdue pre-check | `AlertDialog` (`:1270-1300` + `:2780-2860`) | read + "Doorgaan met reservering" | +1 when it fires | – | – | 1 | `GET /api/reservations/overdue/:vehicleId` before submit | employee clicks through | **warned**, with "Markeer als voltooid" / "Verwijderen" / "Details bekijken" buttons in-dialog — the best-designed interruption in the product | – |
| 10 | Save | "Reservering aanmaken" (`:2700-2712`) | click | 1 | – | – | – | button is **disabled** while `hasOverlap` (`:2704`); red banner "Dit voertuig is al gereserveerd voor de geselecteerde data…" (`:2717-2726`) | **open-ended rentals skip the conflict check entirely** (`:698-702`) | conflict: prevented on this path; BUG-106/107 for the other paths | – |
| 11 | Silent side effect | – | – | 0 | – | – | – | toast "Voertuigregistratie bijgewerkt / Voertuig automatisch gewijzigd van BV naar Opnaam…" | a BV vehicle is re-registered as a side effect of saving a booking (`:876-909`) | **automation without consent** — no prompt, only a toast afterwards | manual re-edit on the vehicle |
| 12 | Documents at intake | — | — | — | — | — | — | — | **There is no step here.** `InlineDocumentUpload` requires a `vehicleId` (`inline-document-upload.tsx:99-101, 156-158`), so an identity document or driving licence cannot be filed against the *customer* at all; it can only be filed against a driver record (`driver-dialog.tsx` `licenseFile`) or against a car | nothing | – |
| 13 | Pickup | "Ophalen starten" from the reservation view dialog (`calendar.tsx:2488-2494`), from `/scan` (`scan-panel.tsx:412-415`), or as the second dialog after step 7 | open dialog | 2 | – | – | – | Kenteken / Voertuig / Klant repeated (`pickup-return-dialogs.tsx:526-540`) | picking up the wrong reservation | the dialog shows plate+customer — visible, not validated | – |
| 14 | Contract number | `:587-615` | accept prefill | 0 | 0 (prefilled from `/api/settings/next-contract-number`, `:171-178`) | – | – | live duplicate check (`:195-231`) with "⚠️ Dit contractnummer bestaat al!" and "⚠️ Ongebruikelijk hoog nummer - controleer aub" | reusing a number | **warned + override dialog** ("Overschrijven & doorgaan") which *clears the number from the other reservation* (`server/routes.ts:4082-4092`) | edit-contract-number dialog afterwards |
| 15 | Pickup date | `:618-634` | accept "vandaag" | 0 | 0 | – | – | hint "Wanneer het voertuig wordt opgehaald" | **picking a car up weeks before its start date** | **nothing** — re-proven this run: reservation #3555, start 2026-10-01, picked up 2026-09-11 → `200 OK`, no warning (BUG-211/E18-004) | none |
| 16 | Mileage | `:636-658` | accept prefill | 0 | 0 (prefilled from `vehicle.currentMileage`) | – | – | "Huidig: {{mileage}} km" | typing a lower reading | **validated + admin-password override** (`:290-296`, `handleOverrideConfirm` `:308-336`) — strongest control in the product | – |
| 17 | Fuel | `:661-678` | select | 2 | – | – | – | "Huidig brandstofniveau in de tank" | – | required server-side (`server/routes.ts:4092-4096`) | – |
| 18 | Damage check | `:685-895` | optional: "Ophaal-schadecheck aanmaken" opens the 1 819-line interactive check, or "Papieren check uploaden" | +3 … +20 | – | – | – | existing checks with author and timestamp | forgetting the check entirely | **nothing** — the pickup submits fine without one | add later from the reservation dialog |
| 19 | Confirm pickup | "Ophalen voltooien & contract genereren" (`:1008-1015`) | click | 1 | – | – | 1 (remarks ack, if the car has remarks: "Ik bevestig & ga door") | toast "Ophalen voltooid / Voertuig succesvol opgehaald. Contract is gegenereerd." | **that toast is unconditional.** The server wraps contract generation in `try { … } catch (pdfError) { console.error(…) }` (`server/routes.ts:4223-4225`) and still answers `200`. A failed contract is indistinguishable from a good one | nothing |
| 20 | Give the customer the contract | reservation view dialog → documents section (`calendar.tsx:2153-2270`) | close pickup dialog, reopen reservation, scroll, preview, print | ≈4 | – | – | – | document list grouped contracts / damage checks / other | printing the wrong version; printing nothing | nothing; print goes through `window.open` (`reservation-view-dialog.tsx` and `delivery/dashboard.tsx:360-369`) and is blocked by pop-up blockers ("Pop-up geblokkeerd") | retry / download |
| 21 | Return | "Innemen starten" (`calendar.tsx:2504-2510`), `/scan` (`scan-panel.tsx:406-409`), or via the status dropdown | open dialog | 2 | – | – | – | "Bij ophalen: {{mileage}} km", "Bij ophalen: {{fuel}}" | – | return mileage below pickup mileage → "Kilometerstand bij inleveren kan niet lager zijn dan bij ophalen ({{km}} km)." | – |
| 22 | Confirm return | "Inleveren voltooien & schadecheck genereren" | click | 1 | 1 (mileage) + fuel select 2 | – | – | toast "Inleveren voltooid / Schadecheck is gegenereerd." | the return **overwrites `endDate` with the return date** (BUG-019 — re-proven this run: #3563 ended with `start = end = 2026-09-11`); damage-check generation is in the same swallow-the-error `catch` (`server/routes.ts:4436-4438`) | nothing |
| 23 | Close | – | – | 0 | – | – | – | the rental appears under "Voltooid bekijken ({{count}})" (`calendar.tsx:1037-1042`) | nothing ever sets `completed`; the rental stays `returned` forever unless someone edits it | nothing | – |

### A.2 Phase 21 analysis

| Dimension | Finding |
|---|---|
| Clicks | **≈22 clicks for an existing customer**, counted from code (8 create + 5 pickup + 4 contract handover + 5 return). A new customer adds ≈3 clicks and ≥1 typed field (realistically 8, estimate). |
| Screens/dialogs | 4 minimum (new-reservation dialog, pickup dialog, reservation view dialog, return dialog); 6 if a damage check is made; 7 if the customer is new. |
| Searches | 2 (vehicle, customer) — both inside the same form, both typed. |
| Forms | 1 large form (23 `FormField`), 2 medium dialogs. |
| Manual entry | 2 dates + 2 search strings + 1 return mileage. Everything else is prefilled. **This is genuinely good** — the auto-fills (end date, price, mileage, contract number, fuel policy) remove most typing. |
| Repeated information | Plate + brand/model + customer name are re-rendered in the form, the view dialog, the pickup dialog (`pickup-return-dialogs.tsx:526-540`), the return dialog and the day dialog. Harmless as confirmation, but the *pickup* dialog does not show the rental **period**, so "is this the right booking?" cannot be answered there. |
| Unnecessary confirmations | The remarks acknowledgement fires on **every** pickup of a car that has any text in `remarks`, however stale (`pickup-return-dialogs.tsx:338-352`). There is no per-remark dismissal and no expiry, so on a car with an old note it is pure friction, 50×/day. |
| Unnecessary navigation | Step 20 (hand over the contract) forces a close-reopen-scroll cycle purely because the pickup dialog has no "Afdrukken" / "Mail naar klant" button. |
| Waiting | Form mount fires 9 queries (`:333-494`); the calendar behind it re-fetches the 8 MB `/api/reservations` up to three times after a save (BUG-203/204). No request timeout at all (BUG-212). |
| Information visibility | Missing at the moment of decision: the rental period in the pickup dialog; whether a contract PDF actually exists after pickup; whether the customer has an e-mail address at all (the contract cannot be mailed without one, and nothing says so until the mail dialog). |
| Error risk | Highest at steps 6 (wrong customer), 15 (early pickup), 18 (skipped damage check), 19/22 (silent PDF failure). |
| Automation opportunities | (a) generate + attach + *offer to print/mail* the contract in the same dialog; (b) set `completed` automatically at return; (c) flag "no e-mail on file" at intake, before pickup. |
| Bulk | None anywhere in this workflow. |
| Keyboard | None. |
| Barcode | Only at steps 13/21 via `/scan`. The **new-reservation** flow has no barcode entry for the vehicle. |
| Quick actions | Only step 3 has one. |

---

## 3. Workflow B — walk-in / phone quote: "is a car available next week?"

### B.1 Step table

| # | Step | Screen | Action | Clicks | Typed | Info visible | What can go wrong | Protection | Recovery |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Decide where to look | — | — | — | — | **There is no availability-search screen.** `/vehicles` filters on *current* status only (`pages/vehicles/index.tsx:159-185`: registration filter, `needs_fixing` filter, feature filters, free-text search) — it has **no date range** | employee answers from the dashboard number instead | nothing | – |
| 2a | Path A (the one that works) | "Nieuwe reservering" dialog | open, type both dates, open the vehicle picker, read the list | 4 | 2 | list = `/api/vehicles/available?startDate&endDate` (`reservation-form.tsx:497-529`), each row = plate, brand, model, type | – | – | – |
| 3a | Abandon the quote | – | click "Annuleren" — **or click outside and lose everything** | 1 | – | – | dismiss-on-outside-click discards the typed dates (BUG-225/E18-011) | nothing | retype |
| 2b | Path B | `/reservations` month view | read the bars | 1–3 | 0 | ~2 000 reservation bars | mis-reading overlaps | nothing | – |
| 2c | Path C (the wrong one) | Dashboard "Beschikbare voertuigen" | read the count | 0 | 0 | "**N** klaar om te huren" | **this is availability *now*, not for the requested week** | nothing warns about the difference | – |
| 4 | Convert to a booking | same dialog | continue with workflow A from step 5 | – | – | – | – | – | – |

### B.2 The two "available" numbers disagree

Measured on the audit server this run:

```
GET /api/vehicles/available                                   -> 200, 315 vehicles
GET /api/vehicles/available?startDate=2026-09-18&endDate=2026-09-25 -> 200, 593 vehicles
```

`server/routes.ts:277-297` branches on the presence of `startDate`: with dates it calls
`storage.getAvailableVehiclesInRange()` (conflict-based); without dates it calls
`storage.getAvailableVehicles()` (status-based). The dashboard widget
(`components/dashboard/vehicle-availability-widget.tsx:13-15`) uses the **no-dates** variant and
labels it "klaar om te huren". So the dashboard says 315 cars are free and the booking form says 593
are free next week. An employee quoting from the dashboard under-sells by ~280 cars; an employee
told "we have nothing left" by the dashboard will believe it.

### B.3 Phase 21/23 analysis

- **5 clicks and 2 typed dates to answer a yes/no question**, counted from code — and the answer is a
  flat list of plates. There is no count by vehicle type, no price, no "the nearest free day is…".
- The only route to the correct answer is a **create-something dialog**, which is exactly the dialog
  that discards its input when clicked outside (BUG-225). Asking a question should not require
  opening a creation form.
- Nothing here can be answered over the phone in one screen. **Biggest single process gap in the
  product** for a rental back-office.

---

## 4. Workflow C — modify a booking after a customer call

### C.1 Step table

| # | Step | Screen | Action | Clicks | Info visible | What can go wrong | Protection | Recovery |
|---|---|---|---|---|---|---|---|---|
| 1 | Find the booking | header search (plate / customer name) or `/reservations` → "Lijstweergave" (`calendar.tsx:1026-1032`) | type, click result | 3 | plate, customer, period | searching by **contract number** does not work in the header | nothing | – |
| 2 | Open | reservation view dialog | click | 1 | full detail, documents, damage checks | – | – | – |
| 3 | Edit | "Bewerken" (`calendar.tsx:2520-2526`) → the same 3 110-line form in edit mode | click | 1 | – | **every save fails** — BUG-202 (proven in phase 18, still open) | none | – |
| 4a | Workaround: drag in the calendar | month grid | drag the bar | 1 drag | – | **no conflict check on this path** — BUG-106 | none | – |
| 4b | Workaround: `/basic` | used by other dialogs | – | – | – | requires a full body; overwrites concurrent edits — BUG-172 | none | – |
| 4c | Workaround: contract number only | `edit-contract-number-dialog.tsx` | – | 3 | – | – | duplicate check | – |
| 5 | Tell the customer | — | — | — | — | **nothing is sent.** Moving, cancelling or deleting a portal customer's reservation produces no notification — BUG-134 | nothing | – |

### C.2 What actually works at API level (exercised this run)

| Change | Route | Result | Audit trail |
|---|---|---|---|
| wrong customer → right customer | `PATCH /api/reservations/3554 {customerId}` | 200 | `audit_logs` `reservation.update` with `changes: [{field, from, to}]` |
| wrong vehicle → right vehicle | `PATCH /api/reservations/3554/basic {…full body…}` | 200 | recorded |
| wrong dates → right dates | `PATCH /api/reservations/3554 {startDate, endDate}` | 200 | recorded, e.g. `{"to":"2026-09-22","from":"2026-09-21","field":"startDate"}` |
| dates changed **after** pickup | `PATCH /api/reservations/3562 {startDate, endDate}` | 200 — a picked-up rental's dates can be moved freely, contract number untouched | recorded |

So the data model and the audit log support correction correctly; it is the **UI path that is
broken**. That is a defect (BUG-202), but the *process* consequence is what matters here: the only
correction gestures left to an employee are the two that skip validation (drag) or overwrite a
colleague's work (`/basic`).

### C.3 Phase 21/23 analysis

- Clicks to correct one field, if the form worked: **5** (search 3 + open 1 + Bewerken 1) plus the
  field plus save = 7, counted from code. The form re-renders all 23 fields and re-submits the whole
  row (`reservation-form.tsx:912-923`) — that is the mechanism behind both BUG-202 and BUG-172.
- There is no "change only the dates" or "change only the customer" micro-dialog, although
  `edit-contract-number-dialog.tsx` proves the pattern works and is cheap.
- No customer-facing consequence of the change is produced anywhere.

---

## 5. Workflow D — transport / delivery with a spare vehicle

### D.1 Step table

| # | Step | Screen / dialog | Action | Clicks | Typed | Info visible | What can go wrong | Protection | Recovery |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Mark the booking as a delivery | reservation form, "Bezorgservice vereist" checkbox (`reservation-form.tsx:2263-2280`) | tick + fill | 1 + 4 | 4 ("Bezorgadres", "Stad", "Postcode", "Bezorgkosten (€)") | – | address typed a second time (it is already on the customer) | **no copy-from-customer button** | retype |
| 2 | Transport row appears | `/delivery` | – | 0 | – | created server-side on save (`pages/delivery/dashboard.tsx:73-76`) | – | automation — good | – |
| 3 | Or create a transport directly | `transport-dialog.tsx` (28 `FormField`) | fill | ~12 | ~8 | type, status, vehicle or external vehicle (6 extra fields), spare required, dates, from/to address+city, km, toll, billable | wrong transport type | selects | edit |
| 4 | Assign the spare | `spare-vehicle-dialog.tsx` / `spare-vehicle-assignment-dialog.tsx` | pick from a list | 3 | 1 | available vehicles for the period | – | **no suggestion at all** — the employee scans the list manually (`01b` §"Transport en vervangers") | re-pick |
| 5 | Or leave it TBD | `/api/placeholder-reservations` | – | 1 | – | "Nog te bepalen" | forgetting to fill it in | **printing is blocked**: toast "Vervangend voertuig vereist" (`delivery/dashboard.tsx:283-292, 341-351`) | – |
| 6 | Transport day: filter | `/delivery` tabs "Alle transporten ({{count}})" / "Leveringen" / "In afwachting" / "Gepland" / "Onderweg" / "Voltooid" | click a tab, optionally search | 1–2 | 1 | status counters "In afwachting", "Klaar voor levering", "Onderweg", "Vandaag voltooid" | – | – | – |
| 7 | Print the transport letters | select rows (checkbox each) → "Afdrukken" | 1 per row + 1 | – | preview dialog, then a new window (`:360-369`) | pop-up blocked → "Pop-up geblokkeerd / Sta pop-ups voor deze site toe…" | warned | retry |
| 8 | Spare handover | dashboard widget `spare-vehicle-assignments-widget.tsx:441-474` | one button per state | 1 each | – | badge per state | clicking "Markeer als opgehaald" on the wrong row | **no confirmation, no undo** — the status ladder assigned → ready → picked_up → returned is one-way in the UI | none |
| 9 | Complete | "Voltooien" per row, or bulk | 1 (+1 per row) | – | – | if a spare is `assigned`/`picked_up` a prompt dialog fires first (`:255-268`) — good | bulk complete uses `Promise.all` with **no per-row error handling** (`:316-320`): a partial failure shows one green toast | nothing | – |

### D.2 Phase 21/23 analysis

- The transport dashboard is the **only screen in the product with bulk actions** (checkbox select →
  bulk print, bulk complete). That is the right pattern and it is confined to one page.
- Counted from code: completing a day of 10 transports = 10 checkbox clicks + 1 bulk complete = **11
  clicks**, versus 20 one-by-one. Printing the same 10 = 11 clicks + 1 pop-up.
- The TBD-print block (step 5) is a hard stop with **no route to the fix**: the toast says a
  replacement vehicle is required but does not open the assignment dialog. Counted from code, the
  employee then needs 4 more clicks to find the row's spare dialog. (`01b` observation 12.)
- Address duplication (step 1) is pure re-typing of data the system already holds.

---

## 6. Workflow E — vehicle to the workshop

### E.1 Step table

| # | Step | Screen / dialog | Action | Clicks | Info visible | What can go wrong | Protection | Recovery |
|---|---|---|---|---|---|---|---|---|
| 1a | From the car | `/scan` → scan → "Onderhoud starten" (`scan-panel.tsx:180-189`) | 1 scan + 1 click | 1 | plate, APK, km, fuel, active reservation, active maintenance block | – | – | "Onderhoud beëindigen" on the same panel |
| 1b | From the rental | reservation view dialog → "Naar service sturen" (`calendar.tsx:2544-2548`) → `service-vehicle-dialog.tsx` | 2 + form | 3 | start date defaults to **today** (deliberately, `service-vehicle-dialog.tsx:75-78`) | – | – | – |
| 1c | From planning | `/maintenance` → "Onderhoud plannen" → `schedule-maintenance-dialog.tsx` (8 `FormField`, 1 598 lines) | – | ~10 | vehicle filters "Alleen beschikbare voertuigen tonen" / "Voertuigen met bestaand onderhoud uitsluiten"; 14 maintenance types each with a description ("Bandenwissel — Versleten banden, lekke band") | – | "Selecteer een voertuig" / "Selecteer een datum" validation | – |
| 2 | Block the car | – | – | 0 | – | **a blocked car can still be handed to a customer** — re-proven this run: vehicle 1885 set to `maintenance_status = in_service`, new reservation created, `POST /pickup` → **200 OK** (BUG-109) | **nothing** | none |
| 3 | Spare for affected rentals | same dialog, "vervanger" section (`:1330-1440`) | per affected reservation: pick a vehicle, or "Nog te bepalen", or "klant regelt zelf" | 2–3 per rental | conflicting reservations listed | forgetting one | **validated**: "Ontbrekende toewijzingen vervangend voertuig / Kies een specifiek voertuig of 'Nog te bepalen' voor alle betrokken reserveringen." | – |
| 4 | Car arrives | `/maintenance` → status "Binnen (voertuig is in onderhoud)" | 2 | – | – | – | – | – |
| 5a | Complete — path 1 | `/maintenance` day dialog, **inline** (`pages/maintenance/calendar.tsx:2060-2100`) | fill km, details, category → save | ~6 | – | **the completion date is forced to the block's `startDate`, not today** (`:2061`), and `endDate` is set to the same day, shrinking the block | nothing | manual edit |
| 5b | Complete — path 2 | `return-from-service-dialog.tsx` (`POST /api/reservations/:id/return-from-service`) | fill date, km, notes | 4 | return date defaults to today | two different implementations of the same business step (`01b` observation 5) | nothing | – |
| 6 | Spare back | dashboard widget | "Markeer als ingeleverd" | 1 | – | forgetting it — the spare stays blocked | **nothing** | manual |
| 7 | Car back in service | – | – | – | – | **the workshop flag is lost on return** — BUG-109 | nothing | – |

### E.2 Phase 21/23 analysis

- **Three entry points, two exits, no single owner.** The planner, the counter and the workshop each
  have their own door into the same state machine, and the two exits write different dates.
- The "50 times a day" question does not apply here (estimate: a handful per day), but the
  *consequences* are the most expensive in the product: a car in the workshop that the counter can
  still rent out is how the 2026-08-25 incident class happens.
- Automation opportunity: step 3 has no spare suggestion (same gap as workflow D step 4) even though
  `/api/vehicles/available?startDate&endDate` already returns exactly the right list.

---

## 7. Workflow F — the daily start

### F.1 What the employee actually has to do

| # | Step | Screen | Clicks | What they get | What is missing |
|---|---|---|---|---|---|
| 1 | Open the app | `/` | 0 | Backup banner, 11 quick-action tiles, then: "Beschikbare voertuigen", "APK verloopt binnenkort", "Achterstallige verhuringen", "Garantie verloopt binnenkort", "Beheer vervangende voertuigen", recent expenses, "Aankomende reserveringen" (10 rows), a month calendar | **no "vandaag op te halen", no "vandaag in te leveren", no "transporten vandaag", no "onderhoud vandaag"** |
| 2 | Today's pickups/returns | `/reservations`, click "Vandaag" | 2 | the month grid with today highlighted; click the day → day dialog listing that day's rows (`calendar.tsx:2802-2960`) | the day dialog mixes pickups, returns and maintenance without separating them |
| 3 | Today's transports | `/delivery` | 1 | stat tiles + tabs | – |
| 4 | Today's maintenance | `/maintenance` | 1 | month calendar | – |
| 5 | Portal work | `/portal-admin` (badge in the sidebar) | 1 | requests, fines, accounts | good — the badge is the only proactive signal in the product |

**5 pages, ≈5 clicks, counted from code, to assemble a picture of one day.** Each of those pages
re-downloads its full dataset (BUG-203/204: ~20 MB for the reservations page alone, 900+ SQL
statements for one month view).

### F.2 "Aankomende reserveringen" is not a work list

`components/dashboard/upcoming-reservations.tsx:44, 98` renders
`slice(0, 10)` of `GET /api/reservations/upcoming`. Measured on the audit server this run: the
endpoint returned **5 rows**, mixing `picked_up` and `booked` — i.e. it is neither "starting today"
nor "to be handed over". Meanwhile `GET /api/reservations/overdue` returned **362 rows** in the
clone (clone measurement, not production — see the §1 caveat in
`docs/audit/05-phase-9-12-rapport.md`), and the overdue widget shows a subset of those.

### F.3 Phase 21/23 analysis

- The dashboard answers *stock* questions ("how many cars are free", "whose APK expires") and not
  *flow* questions ("what has to happen today"). For a rental back-office that is the wrong axis.
- The single highest-leverage change in the whole report is a "Vandaag" widget or page: today's
  pickups, today's returns, today's transports, today's maintenance in/out, each row with a direct
  "Ophalen starten" / "Innemen starten" button. All four data sources already exist
  (`/api/reservations/range`, `/api/transports`, the maintenance blocks, the overdue endpoint).

---

## 8. Workflow G — documents: generate / preview / correct / regenerate / print / send

### G.1 Step table

| # | Step | Screen | Action | Clicks | What can go wrong | Protection | Recovery |
|---|---|---|---|---|---|---|---|
| 1 | Generate a contract | **none — it is automatic on pickup** (`server/routes.ts:4155-4225`) | – | 0 | generation throws → swallowed, `200` returned, toast still says "Contract is gegenereerd" (`:4223`) | **nothing** | – |
| 2 | Generate a damage check | automatic on return (`server/routes.ts:4348-4437`) | – | 0 | same swallow (`:4436`) | nothing | – |
| 3 | Generate manually | **no UI exists.** `GET /api/contracts/generate-default/:id` (`server/routes.ts:5963`) and `GET /api/damage-checks/generate/:id` (`:6117`) have **zero callers in `client/src`** (verified by grep) — and per BUG-165 both fail to write the database row | – | – | – | – | – |
| 4 | Preview | reservation view dialog documents section (`calendar.tsx:2153-2270`, `reservation-view-dialog.tsx:700-730`) | expand, click | 3 | – | grouped contracts / damage checks / other | – |
| 5 | Correct a wrong contract | **no "regenereren" button anywhere.** The only route is: revert the pickup, pick up again | 6+ | the old PDF stays attached — proven this run: document 566 ("Contract (Unsigned)") survived `PATCH /status {booked}` on #3555 and is still linked to a reservation whose `contract_number` is now `NULL` | **nothing** | manual delete |
| 6 | Print | preview → `window.open` → browser print | 2–3 | pop-up blocked → "Afdrukken mislukt / Je browser heeft afdrukken geblokkeerd. Gebruik de downloadknop en druk handmatig af." | **warned, with the correct fallback named** — good | download |
| 7 | Send | "Documenten e-mailen naar klant" (`email-document-dialog.tsx`) | select documents (1 each), recipient select (2), template select (2), language select (2), edit subject/message, send | ≈9 | sending to the wrong address; sending before the document is signed | recipient choices are explicit: "Algemeen: {{email}}", "Facturen: {{email}}", "Aangepast e-mailadres"; validations "Geen e-mailadres ontvanger geselecteerd", "Selecteer minstens één document om te versturen" | – |

### G.2 Phase 21/23 analysis

- The generate step is fully automated — excellent — but it is **unobservable**. No screen tells the
  employee whether the PDF exists. Combined with BUG-165 (two generate paths always fail to register
  the row) and the swallowed `catch`, an employee can complete a pickup, tell the customer "the
  contract is in your mail", and be wrong, with nothing anywhere showing it.
- There is no versioning story in the UI: no "regenereren", no "vervangen", no "markeer als
  ongeldig". The only correction gesture is to undo a physical event (the pickup) in order to fix a
  piece of paper.
- Two places manage mail templates (Instellingen → Doc-Emails, and `/communications`) — `01b`
  observation 4. Whoever edits one will not know the other exists.

---

## 9. Workflow H — fines (CJIB)

### H.1 Step table

| # | Step | Screen | Action | Clicks | Automation present | What can go wrong | Protection | Recovery |
|---|---|---|---|---|---|---|---|---|
| 1 | Letter arrives | `/portal-admin` → "Bekeuringen" → "Brief scannen" (single) or "Brieven scannen" (bulk import, `fine-import-dialog.tsx`) | drop files | 2 | **OCR reads plate, date/time, reference, amount** (`fines.scan.*`) | unreadable letter | "Brief kon niet gelezen worden"; "Onzeker gelezen: {{fields}}" names the low-confidence fields | manual entry |
| 2 | Match to a rental | automatic | – | 0 | **the system proposes the covering reservation**: "Wordt gekoppeld aan {{customer}}" / "{{n}} reserveringen op dat moment; kies er een na het opslaan." / "Geen reservering op dat moment; koppel handmatig na het opslaan." | wrong attribution | candidates are split into "Reserveringen op het moment van de overtreding" and "Reserveringen rond die datum" (`fine-dialog.tsx:94-110`) | "Ontkoppelen" (`:138`) |
| 3 | Duplicate letter | automatic | – | 0 | "Kenmerk bestaat al: bekeuring #{{id}}." with an "Openen" link | double-charging the customer | **prevented + navigable** | – |
| 4 | Link | "Koppelen" | 1 | – | – | – | audit: "Gekoppeld door {{by}} op {{at}}" is shown in the dialog | "Ontkoppelen" |
| 5 | Status | "Doorbelast" / "Betaald" / "Betwist" / "Geannuleerd" | 1 each | transitions come from a declared table (`FINE_TRANSITIONS`, `fine-dialog.tsx:61`) | illegal transition | **prevented** — only allowed buttons render | "Heractiveren" (`:141`) |
| 6 | Delete | "Verwijderen" | 2 | – | – | – | confirm: "Deze bekeuring naar de prullenbak verplaatsen? Een beheerder kan hem daar terugzetten." | **recycle bin** — verified: `GET /api/deleted-records` returns entity types `["vehicle","fine"]` |

### H.2 Phase 21/23 analysis

**This is the best-designed workflow in the application, by a wide margin**, and it is the model the
rest of the product should copy:

- OCR replaces manual entry instead of adding a form.
- The system *proposes* the answer and the human *confirms* it, rather than the human searching.
- Duplicates are detected and linked, not silently created.
- Status transitions are declared, so illegal ones cannot be clicked.
- Every destructive action is reversible ("Ontkoppelen", "Heractiveren", recycle bin) and the
  confirmation text says *why* it is safe.
- Attribution is stamped and shown ("Gekoppeld door … op …").

Counted from code: **≈5 clicks from a paper letter to a fine charged to the right customer**, with
zero typed fields in the happy path.

---

## 10. Workflow I — portal requests handled by staff

### I.1 Step table

| # | Step | Screen | Action | Clicks | What can go wrong | Protection | Recovery |
|---|---|---|---|---|---|---|---|
| 1 | Notice | sidebar badge on "Klantenportaal" (5-min poll) + `PortalAlertChip` in the header | – | 0 | a request sits unseen for up to 5 minutes | poll + socket | – |
| 2 | Open | `/portal-admin` → "Aanvragen" table (filters "Alle statussen", "Alle types") → row | 2 | – | – | – |
| 3 | Take it | "In behandeling nemen" | 1 | two people work the same request | status `new` → `in_progress` is explicit | – |
| 4a | Booking request | "Goedkeuren: reservering aanmaken" → `booking-approval.tsx` | 1 + ~5 | booking a car that is no longer free | **"Het gevraagde voertuig kan niet meer (geblokkeerd of niet verhuurbaar). Kies een ander voertuig."**, plus per-candidate badges "Vrij" / "Bezet in deze periode" / "Blacklist", plus suggestions "Zelfde type, vrij" | conflict is reported by id: "Conflict met reservering #{{id}} ({{from}} – {{to}})" |
| 4b | Maintenance request | "Inplannen en bevestigen" → `maintenance-approval.tsx` | 1 + ~4 | – | date prefilled with the customer's "Gewenste datum"; category defaults to "Reparatie" when the customer marked it urgent (per the design spec §3.1); "Alleen werkdagen (ma t/m vr)."; "Er wordt een vervanger-placeholder aangemaakt; wijs later een auto toe in de onderhoudskalender." | – |
| 4c | Change request | "Verplaatsen en bevestigen" | 1 + ~3 | moving a block the workshop already started | server refuses inside 48 h / once status is `in`/`out` (`PORTAL_MAINTENANCE_TOO_LATE`) | – |
| 5 | Answer | "Beantwoorden en afhandelen" / "Antwoord sturen (blijft open)" / "Afwijzen" | 1 | closing a request without doing the work | **"Een huuraanvraag wordt pas afgehandeld via \"Goedkeuren: reservering aanmaken\" (zet hem in de kalender) of \"Afwijzen\". Een antwoord sturen kan altijd; de aanvraag blijft dan open."** — the UI states the process rule in the UI | – |
| 6 | Reply text | – | typed | – | empty reply | validated: "Vul een antwoord in." | – |

### I.2 Phase 21/23 analysis

The second-best workflow in the product. Notable, and worth copying elsewhere:

- It **suggests** a vehicle of the same type instead of making staff search.
- It shows why a choice is not possible ("Bezet in deze periode", "Blacklist") *at the point of
  choosing*.
- It names the conflicting reservation by id and period rather than saying "conflict".
- It writes the process rule into the screen ("closeHint"), so an employee cannot silently short-cut
  it.

The gap: this is the *only* place where a customer is informed of anything. Staff-initiated changes
to the same customer's reservation send nothing (BUG-134), so the customer's experience depends on
which door the change came through.

---

## 11. Workflow J — vehicle intake (new car)

### J.1 Step table

| # | Step | Screen | Action | Clicks | Typed | What can go wrong | Protection | Recovery |
|---|---|---|---|---|---|---|---|---|
| 1 | Open | "Voertuig toevoegen" tile, or `/vehicles` | 1 | – | – | – | – |
| 2 | RDW lookup | plate field + "Opzoeken" button (`vehicle-form.tsx:877, 906-925`) | 1 | 1 (plate) | – | **automation** — `GET /api/rdw/vehicle/:plate` fills every matching form key (`:512-540`) and marks them dirty; distinct error toasts for 404 / 502 / 504 | retype |
| 3 | Fill the rest | 5 tabs: "Algemeen", "Technisch", "Datums", "Contract", "Aanvullend" (`:940-944`), **46 `FormField`** | 4 tab clicks + fields | many | only **3 fields are required**: kenteken, merk, model (`:53-55`) | a car with no APK date, no daily price and no service interval is saved silently, and shows up as bookable | **nothing** | edit later |
| 4 | APK | APK date + "APK-rapport uploaden" quick action | 3 | 1 | wrong date → the APK widget and reminders are wrong | RDW scan job can correct it (`apk-date-changes-dialog.tsx`, shown at login, `App.tsx:46`) — good automation | – |
| 5 | Barcode | assigned server-side; label printed from `vehicle-barcode-dialog.tsx` (template select + "Afdrukken", regenerate behind `MANAGE_VEHICLES`) | 3 | – | – | regenerate is admin/permission-gated with an `AlertDialog` | – |
| 6 | Key cabinet | `key-label-print-panel.tsx`, `key-audit-dialog.tsx`, spare-key barcode (`shared/barcode.ts` `formatSpareKeyBarcode`) | 2–3 | – | – | – | – |
| 7 | Bulk | `vehicle-bulk-import-dialog.tsx` (1 013 lines) — **the only bulk import in the product** | – | – | – | – | – |

### J.2 Phase 21/23 analysis

- RDW lookup is the second-best automation in the product after the fine OCR: one typed plate
  replaces ~15 fields.
- The 3-required-fields rule is the root of a lot of downstream pain: nothing at intake guarantees
  the data the *contract* and the *APK reminder* need. The cost lands on the counter employee weeks
  later (see Phase 25, "document too early / incomplete").
- 46 fields across 5 tabs with no progressive disclosure and no "minimaal nodig om te verhuren"
  grouping.

---

## 12. Workflow K — barcode / scan

### K.1 Step table

| # | Step | Screen | Action | Clicks | Information shown | Next actions offered |
|---|---|---|---|---|---|---|
| 1 | Scan | `/scan` (or the scan dialog) — text input + camera button (`scan-panel.tsx:234-252`) | scan or type + Enter | 0–1 | – | – |
| 2 | Lookup | `GET /api/barcodes/:code` (`:136-150`) | – | 0 | plate, "Reservesleutel" badge, APK, garantie, kilometerstand, brandstof, registratie (Opnaam/BV) | – |
| 3 | Context | – | – | 0 | active reservation with status badge and period; active maintenance block with its status; active transport with its status | "Reservering openen", "Onderhoud openen" |
| 4 | Act | action tiles (`:393-430`) | 1 | – | – | "Voertuig openen", "Reservering maken", **"Ophalen starten"** / **"Innemen starten"** (chosen automatically from the active/upcoming reservation), "Onderhoud starten"/"beëindigen", "Kosten toevoegen", transport "Starten"/"Voltooien" |
| 5 | Errors | – | – | – | "Streepjescode {{code}} niet gevonden" / lookup error | – |

### K.2 Phase 21/23 analysis

**This is the right shape for the whole product**: one physical action resolves the object *and* the
correct next step, and the panel decides pickup-vs-return for you instead of asking. It is also
touch-sized on purpose ("Square, touch-friendly tiles … easy to hit on tablets at the key cabinet",
`scan-panel.tsx:61-62`).

Its problem is reach: it is nav item 3, it is not on the dashboard, phase 18 could not test it (needs
a camera), and the tablet layout it was designed for is broken at 768 px (BUG-218/E18-008). If the
counter used `/scan` as its home screen, workflow A would collapse from ≈22 clicks to roughly 12
(estimate — scan 0 clicks + "Ophalen starten" 1 + fuel 2 + confirm 1 per handover).

---

## 13. Phase 24 — efficiency summary

All click/screen/field counts below are **counted from code** (JSX happy path, counting rule in §0).
All time and frequency figures are **estimates** and are marked as such. Nothing here was measured in
a browser.

| Workflow | Clicks | Screens / dialogs | Searches | Typed fields | Confirmations | Repeated info | Waits (blocking loads) | "50×/day" verdict |
|---|---|---|---|---|---|---|---|---|
| **A** intake → close (existing customer) | **≈22** | 4–6 | 2 | 4–6 | 1–2 (overdue, remarks) | plate/customer ×5 | form mount 9 queries; calendar refetch ×3 after save | **Fails.** ≈1 100 clicks/day at 50 rentals (estimate). The contract handover (4 clicks of close-reopen-scroll) and the always-firing remarks acknowledgement are the two that hurt most. |
| **A** with a new customer | **≈25** | 5–7 | 2 | ≈12 | 1–2 | – | + customer save | Fails. |
| **B** availability question | **5** + 1 to abandon | 1 (a *creation* dialog) | 0 | 2 dates | 0 | – | `/api/vehicles/available` | **Fails badly.** A read-only question requires opening a write form, and the dashboard gives a different answer (315 vs 593 this run). |
| **C** modify a booking | **7** if it worked | 3 | 1 | 1 | 0 | full row re-sent | – | **Broken, not slow** (BUG-202). The surviving paths skip validation. |
| **D** transport day (10 rows) | **11** bulk / 20 one-by-one | 1 | 1 | 0 | 0 | address re-typed at creation | `/api/transports` + 3 full tables | **Passes** — the only workflow with bulk actions. TBD-print dead end costs 4 extra clicks. |
| **E** to workshop and back | **10–16** | 3–4 | 1 | 3–5 | 0 | – | maintenance calendar full load | Low frequency (estimate: a few per day), high consequence. Two completion paths write different dates. |
| **F** daily start | **≈5** across **5 pages** | 5 | 0 | 0 | 0 | – | ≈20 MB (BUG-203/204) | **Fails.** No day view exists; the employee assembles it by hand every morning. |
| **G** documents | 0 to generate, **3** to find, **≈9** to mail, **6+** to correct | 2–4 | 0 | 2 (subject, message) | 0 | – | PDF render | Generation is free; *verification* and *correction* are not possible. |
| **H** fines | **≈5** | 2 | 0 | 0 | 1 (delete) | – | OCR | **Passes — best in product.** |
| **I** portal requests | **≈8** | 2 | 0 | 1 (reply) | 0 | – | 60 s dashboard poll | **Passes.** |
| **J** vehicle intake | **≈20** (4 tab switches + 46 possible fields) | 1 (5 tabs) | 0 | 1 typed plate + the rest | 0 | – | RDW call | Low frequency. RDW lookup does the heavy lifting; the 3-required-field rule pushes cost downstream. |
| **K** scan | **1–2** | 1 | 0 | 0 | 0 | – | one lookup | **Passes — the right pattern.** |

**Cross-cutting efficiency facts (counted from code)**

| Fact | Evidence |
|---|---|
| Zero operational keyboard shortcuts | §1.5 |
| Bulk actions on exactly one screen | `pages/delivery/dashboard.tsx:219-351`; notifications panel |
| Global search issues 3 requests per keystroke, no debounce | `layouts/MainLayout.tsx:86-120` vs `pages/vehicles/index.tsx:88-95` |
| Two contradictory definitions of "beschikbaar" | `server/routes.ts:277-297`; measured 315 vs 593 |
| The most frequent daily actions (Ophalen / Innemen) have no dashboard entry point | `components/dashboard/quick-actions.tsx:270-336` |
| The largest form re-submits all 23 fields on every edit | `components/reservations/reservation-form.tsx:912-923` |
| Client-side filtering of whole tables on vehicles/customers/delivery | `01b` §Dwarsdoorsnede |

---

## 14. Phase 25 — human-error catalogue

Protection levels are named in the preference order **Automation > Validation > Warning > Manual
instruction > None**. "Current" is what the code does today; "Proposed" is the level this phase
believes the step should reach (the OPT writer turns these into proposals — no OPT entries are
written here).

| # | Error | Where it can happen (screen) | Current protection | Evidence (file:line / probe) | Proposed level | Note |
|---|---|---|---|---|---|---|
| 25.1 | **Wrong customer** on a reservation | new-reservation dialog, "Klant" combobox | **None** beyond showing phone/e-mail/city under each option | `reservation-form.tsx:1688-1790`, options built at `:740-772` | **Validation** (confirm the customer on a review line before save when two candidates share a surname) + **Warning** (flag a customer with no e-mail/phone, which blocks the contract later) | The driver field *is* cleared on customer change (`:449-457`) — that half is right |
| 25.2 | **Wrong vehicle** | same dialog, `VehicleSelector`; also the spare-assignment dialogs | **Partial**: blacklist filtered both ways (`:522-542`); remarks warning dialog ("BELANGRIJK: Bekijk deze opmerkingen voordat het voertuig vertrekt"). **None** for workshop status | `reservation-form.tsx:497-542`; probe step 7: `maintenance_status=in_service` + `POST /pickup` → 200 (BUG-109) | **Automation** (exclude `in_service` / `needs_fixing` / active maintenance block from the picker) then **Validation** at pickup | – |
| 25.3 | **Wrong reservation** picked up or returned | pickup / return dialog | **Warning-level only**: the dialog shows Kenteken / Voertuig / Klant but **not the rental period** | `pickup-return-dialogs.tsx:526-540` | **Validation** — show the period and the contract number, and refuse a pickup whose period does not contain today without an explicit override | Ties into 25.8 |
| 25.4 | **Wrong dates** | date inputs, calendar drag | **Automation** (end = start + 3), **Validation** (duration goes null on an inverted range), **Validation** (conflict check disables submit, `:2704`). **None** on the drag path (BUG-106) and **none** for open-ended rentals (`:698-702`) | `reservation-form.tsx:385, 578-586, 696-738, 2704` | **Validation** on every write path (server-side), including open-ended | The client-side control is good; the gap is that two other paths bypass it |
| 25.5 | **Duplicate reservation** | double-click, two tabs, two employees | **Validation server-side** — verified: identical second `POST /api/reservations` → `409 "Reservation conflicts with existing bookings"` with the conflicting row attached. Still open for the drag and maintenance-with-spare paths (BUG-159/173/190) | probe step 8 | keep **Validation**, extend to the remaining write paths | Good news: the main create path is protected |
| 25.6 | **Duplicate customer / driver** | "Klant toevoegen", "Snel chauffeur toevoegen" | **None** — verified: two identical name+e-mail customers both created (ids 1302, 1303) | `p21-recovery2.out.json` step G; `customer-form.tsx:29` | **Warning** at minimum ("Er bestaat al een klant met dit e-mailadres — openen?"), ideally **Validation** on e-mail | The fine dialog already proves the "duplicate detected → open it" pattern works |
| 25.7 | **Forgotten status change** (rental never closed) | after return | **None** — nothing sets `completed`; the overdue pre-check only fires when the *next* booking for that car is made | `reservation-form.tsx:1270-1300`; clone measurement: `GET /api/reservations/overdue` = 362 rows | **Automation** (set `completed` at return) + **Warning** on a daily "nog open" list | The overdue dialog is the right UI; it just fires at the wrong moment |
| 25.8 | **Picked up too early / too late** | pickup dialog | **None** | probe step 2a: start 2026-10-01, pickup 2026-09-11 → 200, no warning (BUG-211) | **Warning** with an explicit "de huur start over N dagen — toch ophalen?" and an owner decision on whether the start date moves | Owner decision already flagged as BUG-211 |
| 25.9 | **Forgotten related record** — spare not marked returned, placeholder left TBD | dashboard spare widget, transport dashboard | **Warning only for print** ("Vervangend voertuig vereist"); **none** for the spare status ladder | `delivery/dashboard.tsx:283-292`; `spare-vehicle-assignments-widget.tsx:441-474` | **Warning** on the daily view ("vervanger staat al N dagen op opgehaald") + make the TBD toast open the assignment dialog | – |
| 25.10 | **Document generated too early / not generated at all** | pickup and return | **None** — the toast claims success regardless; the `catch` swallows the error | `server/routes.ts:4223-4225`, `4436-4438`; nl: "Voertuig succesvol opgehaald. Contract is gegenereerd." | **Validation** — return the document id, and if it is missing show "contract kon niet gemaakt worden" with a retry | Compounded by BUG-165 |
| 25.11 | **Information to the wrong customer** | "Documenten e-mailen naar klant"; APK reminders | **Validation** in the document mail dialog (explicit recipient choice, e-mail format check). **None** for APK reminders — BUG-170 sends one car's reminder to every customer who ever rented it | `email-document-dialog.tsx:355-386`; BUG-170 | **Automation** (address the current holder only) + **Validation** | The privacy-relevant one |
| 25.12 | **Stale maintenance** — car still flagged in the workshop, or flag lost | maintenance calendar, scan panel | **None** in either direction (BUG-109 loses the flag on return; nothing chases a block left `in`) | `server/vehicle-status-helper.ts:50-62`; probe step 7 | **Automation** (derive the flag from the block) + **Warning** on a daily list | – |
| 25.13 | **Stale spare** — spare vehicle still blocked after the original is back | dashboard widget, maintenance calendar | **None** (BUG-112/115/118: cancelling or deleting leaves the spare in place) | `01b` §Transport en vervangers | **Automation** (release the spare when the original rental or block closes) | – |
| 25.14 | **Vehicle re-registered as a side effect** (BV → Opnaam) | saving any reservation | **None** — it happens first, then a toast says so | `reservation-form.tsx:876-909`; nl: "Voertuig automatisch gewijzigd van BV naar Opnaam (vereist voor verhuur - verzekering & wegenbelasting)" | **Validation** — ask before changing a registration, or at minimum make it undoable | A silent write to a tax-relevant field |
| 25.15 | **Acknowledgement fatigue** | pickup of any car with remarks | **Warning that cannot be dismissed** — fires on every pickup regardless of the note's age | `pickup-return-dialogs.tsx:338-352` | keep **Warning** but scope it (per-remark acknowledgement, or only when the remark changed since the last pickup) | A warning that always fires stops being a warning |

---

## 15. Phase 29 — error recovery matrix

Every row was exercised against the audit server this run unless marked "traced". Scripts:
`docs/audit/wip/scripts/p21-recovery.cjs`, `p21-recovery2.cjs`, `p21-recovery3.cjs`.

| Mistake | Is it visible? | Is it understandable? | Is it recoverable? (screen / route) | Traceable in `audit_logs`? | Actual outcome of the recovery |
|---|---|---|---|---|---|
| **Wrong customer** on a booked reservation | Yes — the view dialog and every list show the customer name | Yes | **Yes at API level, no in the UI.** `PATCH /api/reservations/3554 {customerId}` → **200**. Through the UI the only path is "Bewerken", which always fails (BUG-202) | **Yes** — `reservation.update` with `changes:[{field:"customerId", from, to}]` | Clean. Nothing else had to be touched |
| **Wrong vehicle** | Yes | Yes | **Yes at API level.** `PATCH /api/reservations/3554/basic {vehicleId}` → **200** (a full body is required) | Yes | Clean, but the `/basic` route sends the whole row → lost-update risk (BUG-172) |
| **Wrong dates** (booked) | Yes | Yes | **Yes.** `PATCH /api/reservations/3554 {startDate, endDate}` → 200 | Yes, both fields with from/to | Clean |
| **Wrong dates** (already picked up) | Yes | Yes | **Yes — and unguarded.** `PATCH /api/reservations/3562 {startDate,endDate}` on a `picked_up` rental → 200; the dates moved from 2026-11-20/22 to 2026-11-21/25 while the contract number stayed | Yes | Works, but nothing warns that a signed contract now disagrees with the record |
| **Accidental pickup** | Yes — status "Opgehaald", vehicle shows "rented" | Yes | **Yes, and the UI has it**: "Terugzetten naar geboekt" (`status-change-dialog.tsx`), double confirmation, and the hint states exactly what is lost: *"Het contractnummer, de kilometerstand bij ophalen en het brandstofniveau bij ophalen worden gewist. De daadwerkelijke ophaaldatum wordt ook verwijderd. Dit kan niet ongedaan worden gemaakt."* `PATCH /api/reservations/3555/status {booked}` → 200 | **Yes** — one row with all five cleared fields listed with from/to | **Partial.** Three things are *not* rolled back: (1) the vehicle stays `availability_status = rented` — verified on two vehicles (1886 and 1888) after the revert; (2) the vehicle's `current_mileage` keeps the mistaken reading (12 000 and 20 500 respectively); (3) the generated **contract PDF stays attached** (document 566) to a reservation whose contract number is now `NULL`. Good news: the contract *number* is released — `next-contract-number` returned `1000003` again after the revert |
| **Accidental return** | Yes | Yes | **API: yes. UI: no.** `PATCH /api/reservations/3563/status {picked_up}` → 200 (the server explicitly allows `returned → picked_up`, `server/routes.ts:3255-3258`) — but **no screen offers it**: `status-change-dialog.tsx` only does `picked_up → booked`, and the edit form that has the full status dropdown is BUG-202 | Yes | **Damaging.** The un-return set `end_date` to **NULL**, silently converting a dated rental into an open-ended one, and left `current_mileage` at the wrong value. An employee who un-returns via the only working route loses the rental's end date |
| **Accidental cancellation** | Yes — status "Geannuleerd"; the row stays in both `/api/reservations` and `/api/reservations/range` (verified), so it is still on the calendar | Yes | **Inconsistent and undocumented.** `PATCH /api/reservations/3556/status {booked}` → **400 `"Invalid status transition from 'cancelled' to 'booked'"`**. The *same change* through `PATCH /api/reservations/3556 {status:"booked"}` → **200**. There is no "Annulering ongedaan maken" button anywhere | Yes | **The guard is real on one route and absent on the other.** Whether an employee can undo a cancellation depends on which dialog they happen to use |
| **Accidental delete of a reservation** | **No.** `GET /api/reservations/3557` → **404**; it is absent from `/api/reservations`; the row still exists in the database with `deleted_at` set | No — nothing tells the user it is recoverable | **No route at all.** `GET /api/deleted-records` (the "prullenbak") returns only entity types `["vehicle","fine"]` — reservations are not in it. `PATCH /api/reservations/3557 {deletedAt:null}` → **404** | **Yes, twice** — the delete writes **two** `audit_logs` rows (`reservation.delete` at id 3508 and again at 3509 with `changes:[{field:"deletedBy"}]`) | **Unrecoverable without database access.** This is the single worst recovery gap found: the data is right there, soft-deleted, and no screen and no API route can bring it back |
| **Wrong spare assignment** | Yes — the widget and the transport table show it | Yes | **API: yes. UI: no.** `PATCH /api/reservations/3558 {vehicleId:null, placeholderSpare:true}` → 200 (back to TBD); `PATCH {vehicleId:<other>}` → 200 (straight swap). No "vervanger wijzigen" or "vervanger vrijgeven" button exists | Yes | Works, but the swap did **not** run a conflict check on the new vehicle |
| **Accidental vehicle delete** | Yes — the car disappears and so do its reservations (verified: reservation #3559 became unreadable) | Yes — the delete dialog requires typing the plate and shows an impact preview (`vehicle-delete-dialog.tsx:87-97`) | **Yes, and it works.** `GET /api/deleted-records` → the record with `relatedCounts`; `POST /api/deleted-records/:id/restore` → `{"success":true,"message":"Restored AU-213-X …"}`; the vehicle came back (`GET /api/vehicles/1887` → 200) and reservation #3559 was restored with it | Yes, on the vehicle resource | **Works** — but restore is one click with **no confirmation** (`deleted-vehicles-dialog.tsx:143-161`) and does not re-check conflicts (BUG-108/110), and it is `requireAdmin` only (`server/routes.ts:1694, 1715`), so the person who made the mistake usually cannot fix it |

### 15.1 Recovery-visibility summary

| Property | Reservation | Vehicle | Fine | Customer | Spare assignment |
|---|---|---|---|---|---|
| In the recycle bin ("prullenbak") | **No** | Yes | Yes | Not tested | n/a |
| Restore button in the UI | No | Yes (1 click, no confirm) | Yes | – | No |
| Un-cancel in the UI | **No** | – | Yes ("Heractiveren") | – | – |
| Un-pickup in the UI | Yes ("Terugzetten naar geboekt") | – | – | – | – |
| Un-return in the UI | **No** (API allows it) | – | – | – | – |
| Audit trail with from/to per field | **Yes** | Yes | Yes | Yes | Yes |
| Audit log filterable by that record in the UI | **No** — `GET /api/audit-logs?resourceId=3563` returned **906** rows (the filter is ignored) and `?search=3563` returned **0**. Only `resourceType` + `action` filter (verified: 367 rows for `reservation.update`) | | | | |

**The one genuinely strong thing here:** the audit log records every recovery action with field-level
from/to values and the acting username (verified for every probe above). The information needed to
answer "who changed this and when" exists. What is missing is a way to *ask the question about one
record* — the `resourceId` filter does not work, so a manager investigating reservation #3563 has to
page through 906 rows.

---

## 16. Candidate improvements (WF-001 …)

One line each, for the OPT writer. Format: workflow · problem · idea · frequency guess (estimate) ·
error reduction · size · needs business decision.

| Id | Workflow | Problem | Idea | Frequency (estimate) | Error reduction | Size | Business decision? |
|---|---|---|---|---|---|---|---|
| WF-001 | F | No "what has to happen today" anywhere; 5 pages to assemble a day | A "Vandaag" page/widget: today's pickups, returns, transports, maintenance in/out, each row with a direct "Ophalen starten" / "Innemen starten" button | every employee, every morning | high (25.7, 25.9, 25.12) | M | no |
| WF-002 | A | Ophalen/Innemen have no dashboard entry point while an APK batch job has a primary tile | Replace two of the five primary quick-action tiles with "Ophalen starten" and "Innemen starten" (scan-or-search pre-step, reusing `scan-panel`'s auto-choice logic) | 50×/day | medium | S | no |
| WF-003 | B | No availability search; the dashboard's "beschikbaar" (315) contradicts the booking form's (593) | A read-only "Beschikbaarheid" screen: date range + optional type → free cars grouped by type with a "Reserveer" button; make the dashboard widget use the same definition | 20×/day | high (mis-quoting) | M | yes — which definition of "beschikbaar" is the house answer |
| WF-004 | G / A | The pickup dialog claims "Contract is gegenereerd" even when generation threw | Return the document id from the pickup/return routes; show "contract kon niet gemaakt worden — opnieuw proberen" when it is missing | 50×/day (silent failures rare, consequences high) | high (25.10) | S | no |
| WF-005 | A / G | Handing the contract over costs a close-reopen-scroll cycle | "Afdrukken" and "Mail naar klant" buttons directly in the pickup/return success state | 50×/day | low | S | no |
| WF-006 | Recovery | A deleted reservation is unrecoverable — not in the prullenbak, no restore route, though the row is only soft-deleted | Add `reservation` to `deleted_records` / the recycle bin with the same restore + impact-preview pattern vehicles already have | rare, catastrophic | high (29 row 8) | M | no |
| WF-007 | Recovery | Un-cancel works on one route (`PATCH /:id`) and is refused on the other (`/:id/status`); no UI either way | One declared transition table for reservations (copy `FINE_TRANSITIONS`), enforced on every write path, with the allowed reversions surfaced as buttons | weekly | high (29 row 7) | M | yes — is un-cancelling allowed at all, and by whom |
| WF-008 | Recovery | Un-return exists only at API level and wipes `endDate` to NULL | Add "Inname ongedaan maken" to the status dialog, preserving `endDate`, with the same "dit wordt gewist" hint the pickup revert already has | weekly | high | S | no |
| WF-009 | Recovery | "Terugzetten naar geboekt" leaves the vehicle `rented`, keeps the wrong mileage and keeps the contract PDF attached | Make the revert a real compensating transaction: recompute `availability_status`, restore `previous_mileage`, mark the orphan contract superseded | weekly | high | M | yes — should the contract PDF be deleted or kept as history |
| WF-010 | E / A | A car flagged `in_service` can still be handed to a customer, and the flag is lost on return | Exclude workshop-flagged cars from the picker and block pickup with an explicit override | weekly, very high consequence | high (25.2, 25.12) | M | yes — is an override allowed and who may use it |
| WF-011 | A | The vehicle-remarks acknowledgement fires on every pickup of any car that has any note | Acknowledge per remark text: only re-prompt when the remark changed since the last acknowledged pickup | 50×/day | raises signal quality | S | no |
| WF-012 | A / J | Nothing at intake guarantees the data the contract and the reminders need (3 required vehicle fields, 1 required customer field) | A "klaar om te verhuren" checklist on the vehicle and the customer, warned at booking time rather than blocking at intake | continuous | medium (25.1, 25.10) | M | yes — which fields are mandatory to rent |
| WF-013 | A | Duplicate customers and drivers are created silently | Duplicate detection on e-mail/phone with the fine dialog's "bestaat al — openen?" pattern | daily | medium (25.6) | S | no |
| WF-014 | C | No micro-edit for a single field; the whole 23-field row is re-sent every time | Small focused dialogs ("Datums wijzigen", "Klant wijzigen") sending only the changed fields, following `edit-contract-number-dialog` | 10×/day | high (also removes the BUG-172 mechanism) | M | no |
| WF-015 | D / E | Spare vehicles are chosen from a raw list with no suggestion, and the TBD-print block is a dead end | Suggest same-type free cars (the portal booking approval already does exactly this) and make the TBD toast open the assignment dialog | daily | medium (25.9) | S | no |
| WF-016 | D | Address is retyped at delivery although it is on the customer record | "Adres overnemen van klant" button on the delivery section | daily | low | S | no |
| WF-017 | All | Global search fires 3 requests per keystroke, cannot find a contract number, and shows English "No results found for" | Debounce 300 ms (as the vehicles page already does), add contract-number lookup via `find-by-contract`, translate the two strings | 50×/day | low, but removes a phone-call dead end | S | no |
| WF-018 | All | Zero keyboard shortcuts outside the four template editors | A minimal set: `/` focus search, `N` new reservation, `Esc` close dialog, Enter submits — plus a discoverable shortcut list | 50×/day | low | M | no |
| WF-019 | Recovery | The audit log cannot be filtered to one record (`resourceId` ignored, `search` returns nothing) | Make `resourceId`/`search` work and add a "Geschiedenis" tab on the reservation, vehicle and customer dialogs | weekly | high for dispute handling | S | no |
| WF-020 | A | Saving a reservation silently re-registers a BV vehicle as Opnaam | Ask first ("Dit voertuig staat op de BV. Omzetten naar Opnaam?") instead of telling afterwards | daily | medium (25.14) | S | yes — may this ever be automatic |
| WF-021 | K | The scan panel is the best interaction pattern in the product and is nav item 3, untested, and broken on tablets | Promote it: dashboard tile, a global scan hotkey, and fix the 768 px layout so the key cabinet tablet works | 50×/day if adopted | high (right object, right action) | M | no |
| WF-022 | A | A rental is never `completed`; 362 overdue rows in the clone, and the overdue warning only fires when the next booking is made | Close the rental at return, and surface "nog niet afgerond" on the daily view instead of at the next booking | continuous | high (25.7) | S | yes — what "voltooid" means for invoicing |
| WF-023 | All | Only one screen has bulk actions | Extend the transport dashboard's checkbox+bulk pattern to the reservation list (bulk complete, bulk print) and the vehicles list | daily | medium | M | no |
| WF-024 | G | Two places manage mail templates; no way to regenerate or supersede a document | One template admin, plus "regenereren" on generated documents that marks the previous version superseded | weekly | medium | M | yes — document retention/versioning policy |

---

## 17. Data created by this phase

Left in place per `README-agents.md` (the database is disposable):

- Vehicles `AU-211-X` (1885), `AU-212-X` (1886), `AU-213-X` (1887, deleted and restored),
  `AU-214-X` (1888) — all brand `AUDIT-P21`.
- Customers `AUDIT-P21 Customer A` (1300), `AUDIT-P21 Customer B` (1301),
  `AUDIT-P21 Dup Customer` (1302, 1303 — the duplicate probe).
- Reservations #3554–#3563, all with `AUDIT-P21` in `notes`; #3557 is soft-deleted (the
  unrecoverable-delete probe).
- Documents 566, 570, 571 (contracts/damage checks generated by the pickup/return probes).
- Contract numbers 1000002 and 1000003 were consumed and released.
- One vehicle registration side effect was **not** triggered (no BV vehicles were used).

`p21-recovery.cjs` was found already written in the scripts directory but had never run; its vehicle
lookup used a non-existent `vehicles.deleted_at` column and was corrected to
`select id from vehicles where license_plate=$1` (line 36) before running. No application code was
modified.
