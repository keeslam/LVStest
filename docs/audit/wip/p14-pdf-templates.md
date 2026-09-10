# Phase 14 — PDF & template system

2026-09-10, audit server `http://localhost:5001` / db `lvs_audit`, admin session + throwaway limited user `AUDIT-P14-limited` (permissions `["view_vehicles"]`, id 19). All created data is prefixed `AUDIT-P14` (customers 1285-1297, vehicles `AU-140-X`..`AU-147-X`, `AU-14A-X`..`AU-14C-X`, reservations 3466-3477, transports 60-64/72, pdf_templates 9-14, transport_report_templates 2-3, damage_check_templates 4, vehicle_diagram_templates 2, interactive_damage_checks 15). No application code was modified; nothing committed.

Scripts: `docs/audit/wip/scripts/p14-lib.cjs` (HTTP/multipart/PDF helpers), `p14-pdfinfo.cjs` (pdfjs text+coordinates, page count, PNG render via `@napi-rs/canvas`), `p14-setup.cjs` (fixtures), `p14-a-contracts.cjs`, `p14-b-templates.cjs`, `p14-c-damage.cjs`, `p14-d-transport.cjs`, `p14-e-perms.cjs`, `p14-f-eventloop.cjs`; raw results `p14-*.out.json` / `.out.txt`; generated PDFs and PNGs under `docs/audit/wip/scripts/files/p14/` (gitignored).

Tooling note: `pdfjs-dist 5.4.296`, `pdf-lib 1.17.1`, `canvas 3.2.0` and `@napi-rs/canvas` were already present in `node_modules`; nothing was installed. Text extraction with coordinates worked for every PDF. PNG rendering worked once the target canvas was created with `@napi-rs/canvas` (pdfjs 5 creates its own internal canvases with that package; mixing it with `canvas` throws "Image or Canvas expected" on any page containing an image — the app's own `server/utils/pdf-to-image.ts` uses `canvas`, see P14-018). 14 PDFs were rendered to PNG and inspected visually (`a2_full_normal`, `a2_full_long`, `a3_invalid_fields`, `a4_unknown_template_legacy_normal`, `b3_png_background`, `c1_dc_generate_name_only`, `c2_vehicle_dc_old_reservation_2020`, `c3_interactive_check`, `d1_transport_normal`, `d1_transport_long`, `d3_transport_mytemplate_normal`, `d4_preview_default_tpl1`, `b9_transport_preview_png`, `_selftest_default_template`).

## 1. Generator inventory

| # | Generator | File:line | Library | Triggered by | Template source | Output persisted? |
|---|---|---|---|---|---|---|
| G1 | `generateRentalContractFromTemplate(reservation, template)` | `server/utils/pdf-generator.ts:55-535` | pdf-lib, Helvetica (WinAnsi) | `GET /api/contracts/generate/:id` (`routes.ts:5451`, with/without `templateId`), `GET /api/contracts/generate-default/:id` (`:5963`), `POST /api/contracts/generate-versioned/:id` (`:5798`), `POST /api/contracts/preview` (`:5676`, token store), `GET /api/pdf-templates/:id/preview` (`routes/pdf-templates.ts:80`), pickup flow (`routes.ts:2705`, `:4190`), regeneration service (`services/reservation-pdf-regeneration.ts:126`) | `pdf_templates.fields` (jsonb, 3 accepted shapes) + `backgroundPath` (PDF or PNG/JPG, local or Replit object storage) or `uploads/templates/rental_contract_template.pdf` | `documents` row + file (three different save blocks, see §2) |
| G2 | `generateRentalContract(reservation)` (legacy, fixed coordinates) | `pdf-generator.ts:541-733` | pdf-lib | fallback in `routes.ts:4191, 5509, 5551, 5557, 6010` (unknown `templateId`, no `pdf_templates` rows, or G1 throws) | hard-coded `process.cwd()/uploads/templates/rental_contract_template.pdf` | same as G1 |
| G3 | `generateFallbackContract(contractData)` (plain text) | `pdf-generator.ts:735-793` | none — returns a **text** Buffer | catch blocks of G1 (`:531`) and G2 (`:727`) | — | served as `application/pdf` and stored as `.pdf` (P14-002) |
| G4 | `generateInteractiveDamageCheckPDF` | `pdf-generator.ts:968-1258` | pdf-lib | **no caller** (dead code, confirmed again with grep) | — | — |
| G5 | `generateDamageCheckPDFWithTemplate` → `generateDamageCheckPDFFromCanvas` | `server/pdf-damage-check-generator.ts:802 → 114-757` | pdf-lib, Helvetica, own `sanitizeForWinAnsi` | `GET /api/damage-checks/generate/:reservationId` (`routes.ts:6117`), `GET /api/vehicles/:id/damage-check-pdf` (`:6641`), `GET /api/interactive-damage-checks/:id/pdf` (`:7213`), `POST/PUT /api/interactive-damage-checks` auto-PDF (`:6954`, `:7145`), pickup flow (`:4398`), `POST /api/damage-check-templates/preview-pdf` (`routes/damage-check-templates.ts:88`), regeneration (`reservation-pdf-regeneration.ts:410`) | `damage_check_templates.canvasFields` + optional `backgroundPath`, header image from `app_settings.damage_check_fields.headerImagePath` (else `attached_assets/image_1779471993617.png`, absent in this checkout), `vehicle_diagram_templates`, interactive-check JSON blobs | `documents` row + file for generate/interactive routes (generate route's row insert always fails, P14-004); vehicle route is download-only |
| G6 | `generateTransportReportsPdf(transports, template)` | `pdf-generator.ts:1450-1489` (+ `drawTransportReportPage :1391`, `prepareTransportReportData :1298`) | pdf-lib, Helvetica | `POST /api/delivery/transports/generate-report` (`routes.ts:7666`), `GET /api/transport-report-templates/:id/preview` (`routes/report-and-label-templates.ts:44`) | `transport_report_templates.fields` + image background | `documents` row (`document_type='transport_report'`, path relative to uploads root → BUG-029) |
| G7 | Barcode PNG `renderBarcodePng` | `server/utils/barcode-png.ts:5` | own PNG encoder | embedded top-right by G1/G2 | — | inside contract |
| C1 | Key labels / barcode book | `client/src/components/barcodes/key-label-print.ts:159, 239` | HTML in hidden iframe + `window.print()` | client only | `barcode_label_templates` (`fields` jsonb, mm units, no server validation: `labelWidthMm: -5`, `fields: "garbage"` accepted, B10) | no |
| C2 | Print of server PDFs | `client/src/components/documents/pdf-preview-dialog.tsx:39/56`, `pages/documents/index.tsx:249/277`, `maintenance-view-dialog.tsx:871/958`, `vehicle-details.tsx:2303`, `pages/delivery/dashboard.tsx:378`, `pages/reports/index.tsx:1251`, `pages/reservations/calendar.tsx:3071` | iframe/popup `print()` of an already generated PDF (or HTML report/calendar) | client only | — | no |
| PDF→PNG | `convertPdfToPng` | `server/utils/pdf-to-image.ts:17` | pdfjs + `canvas` | background upload of a PDF (`routes/pdf-templates.ts:377`, `:566`) | — | preview PNG next to the background (fails on Windows, P14-018) |

No invoice/fine/expense/report PDF generator exists on the server (reports are JSON/HTML printed client-side; `invoice-scanner.ts` only *reads* PDFs). The portal has no document generation of its own; it serves existing `documents` rows.

Template editors (client) and what they send:

- Contract editor `client/src/pages/documents/template-editor.tsx:150-175, 1099-1118`: `POST/PATCH /api/pdf-templates[/:id]` with `{ id, name, isDefault, backgroundPath, fields: JSON.stringify([{ id, name, x, y, fontSize, isBold, source, textAlign, locked }]) }` — i.e. `fields` arrives as a **JSON string**, the storage layer parses it (`database-storage.ts:2359-2368`) and jsonb stores an array; `PATCH` never validates (`routes/pdf-templates.ts:194-266`, no zod). No `width`, `page`, `font`, `color` or wrap concept exists in the editor; the generator ignores `page` anyway (A3). Background: `POST /:id/background` (multipart `background`), library `POST /:id/backgrounds` (+`name`), `POST .../:backgroundId/select`, preview `GET /:id/preview`.
- Transport editor `transport-report-template-editor.tsx:166-398`: identical shape against `/api/transport-report-templates*` (zod-validated on write: `insertTransportReportTemplateSchema`, but `fields` is `jsonb` so any JSON value passes — `"not json"` stored, B9).
- Damage-check editor `pages/settings/damage-check-template-editor.tsx:251-284, 396-404`: `PUT/POST /api/damage-check-templates[/:id]` with `{ name, description, language, canvasFields, headerText, footerText, vehicleMake/Model/Type, ... }` (no validation at all, `routes/damage-check-templates.ts:200-235`), draft preview `POST /preview-pdf` with the whole draft. The editor has **no representation of the header image** the generator draws (only `headerText`), see P14-009.

## 2. Duplicate-implementation analysis (proposal, no change made)

| Concern | Implementations (file:line) | Divergence observed |
|---|---|---|
| Contract rendering | G1 `pdf-generator.ts:55`, G2 `:541`, G3 `:735`, dead G4 `:968` | G1 = positioned fields (top-left origin, flipped); G2 = fixed coordinates **without** the y-flip → every value lands in the wrong box (P14-003); G3 = plain text (P14-002); G4 unreachable |
| Coordinate transform editor→PDF | `pdf-generator.ts:439-461` (contract: `842-y-1-0.85*fontHeight`, padX 6), `:1411-1425` (transport: same formula copied), `pdf-damage-check-generator.ts:443-450, 522, 563, 626-640` (damage: `PAGE_H-yTop-PAD_Y-0.78*fontSize`, padX 4, checkbox/text/inspection each their own) | three different baseline formulas; a field at the same (x,y) renders at different heights per document type |
| Template `fields` parsing | `pdf-generator.ts:230-280` (4 shapes), `:1434-1443`, `routes.ts:2697, 5484-5497, 5519-5533, 5722-5730, 5857-5865, 5990-5998`, `routes/pdf-templates.ts:126-138`, `database-storage.ts:2327-2335` | 10 copies of "if string then JSON.parse"; none validates the element shape (BUG-048) |
| Field-value resolution | contract `pdf-generator.ts:312-392` (dotted + flat + `in contractData` fallback + *field name* fallback), transport `:1401` (`data[source] ?? ''`), damage `:672-676` (`dynVals[source] ?? '{{source}}'`) | three behaviours for an unknown source: prints the label / prints nothing / prints `{{source}}` (P14-016) |
| WinAnsi safety | damage `pdf-damage-check-generator.ts:123-137` `sanitizeForWinAnsi` | contract and transport have none → fields silently dropped (P14-001) |
| Damage-check template selection | `routes.ts:6155-6165` (`getDamageCheckTemplatesByVehicle(...)[0]`, i.e. alphabetical by name), `routes.ts:6660-6710` (5-tier make/model/type), `services/reservation-pdf-regeneration.ts:299-320` `pickBestDamageCheckTemplate` (exact incl. type → default-with-content → any-with-content → first), used by `routes.ts:6935, 7126, 7239` and regeneration | same vehicle (1840) got template 4 from two endpoints and template 1 from the third (P14-013c) |
| `reservationData` for damage checks | `routes.ts:6178-6190` (firstName/lastName, `C-<id>-<date>`, end = start+7d if open), `:6720-6746` (firstName/lastName, `#<id>`, end = now), `:6940-6950` (`name`, `RES-<id>`, 'Open'), `:7250-7262` (`name`, `RES-<id>`, ''), `reservation-pdf-regeneration.ts:~370` | three contract-number formats and two name sources on the same document type (P14-005, P14-015) |
| Contract save-as-document | `routes.ts:5561-5650` (`contracts/<plate>/<plate>_contract_<yyyymmdd>.pdf`, versioned type), `:5885-5950` (same folder, same name, versioned), `:6020-6060` (`<plate>/contracts/<plate>_Contract_Unsigned_...pdf`, never versioned, insert always fails), `:4824` pickup, `reservation-pdf-regeneration.ts:131-200` | two folder conventions, one file name reused for every version (BUG-027), one path that never registers (P14-004) |
| Damage-check save-as-document | `routes.ts:6217-6280` (insert fails, P14-004), `:6960-7000`, `:7150-7190`, `reservation-pdf-regeneration.ts:418-460` | idem |
| `formatLicensePlate` | `pdf-generator.ts:19`, `pdf-damage-check-generator.ts:13`, `rdw-api.ts:35`, `client/src/lib/format-utils.ts:57` | identical copies; re-derives dash positions from the raw string (non-standard plates get their dashes moved/removed, e.g. `AU-14B-X` → `AU-14-BX`) |
| Background loading | contract `pdf-generator.ts:73-207` (PDF or image, object storage, 5 nested fallbacks), transport `:1462-1478` (image only), damage `?` (canvas `backgroundPath` column exists but the canvas renderer never draws it — the column is dead for G5) | contract silently falls back to the default (P14-011); transport silently draws nothing; damage ignores it |
| Background upload routes | `routes/pdf-templates.ts:306-412, 503-603` and `routes/report-and-label-templates.ts:256-300, 351-388` and `routes/damage-check-templates.ts:329-372, 423-460` | three copies of the same multer+write+preview code; only the transport copy checks the extension whitelist |

Verdict: the contract path alone has three renderers of which two (G2, G3) only ever produce wrong or non-PDF output, plus one dead renderer (G4). Consolidation proposal (owner decision): (1) one shared `renderPositionedFields(page, fields, values, fonts, {origin, padding})` used by contract and transport with a single coordinate formula and a single WinAnsi sanitizer (or an embedded Unicode font via `@pdf-lib/fontkit`); (2) delete G2/G3/G4 and let the route return 500 when no template can be rendered instead of a text file; (3) one `resolveDamageCheckTemplate(vehicle)` and one `buildDamageCheckReservationData(reservation)`; (4) one `registerGeneratedDocument({buffer, kind, reservation, vehicle})` that owns folder convention, version numbering (with a DB-level guard) and the `documents` insert; (5) one `saveTemplateBackground(kind, id, file)` route helper with the extension check.

## 3. Test matrix (generator × case → result)

Legend: OK = behaves acceptably; BUG = new finding (id); KNOWN = existing tracker id re-confirmed; NV = not verifiable.

| Case | G1 contract-from-template | G2 legacy contract | G5 damage check | G6 transport report |
|---|---|---|---|---|
| Normal data | OK (a2_normal, PNG checked, all 20 fields at the intended boxes) | **P14-003** all values in wrong boxes (a4_unknown_tpl_normal PNG) | **P14-005** "null null" customer (c1_name_only); OK with first/last (c1_first_last) | OK (d1_normal), BUG-029 download 404 |
| Missing data (empty customer, open-ended) | OK: "To be determined", "1 day", "€0.00" (a2_empty; format inconsistency P14-017) | not run separately (same `prepareContractData`) | OK, fabricated `rentalDays` (P14-015) | OK, "-" placeholders (d1_empty, d1_external) |
| Partial data (no vehicle/customer) | covered in phase 3-5 (`documents-mail.md`), not repeated | idem | `400 Vehicle not found` (phase 3-5) | n/a |
| Long text (500-char name, 1000-char address, 300-char brand/model, 20 kB notes) | **P14-010** 8 text runs past the page edge, no wrap (a2_long PNG) | **P14-010** 5 runs (a4_unknown_tpl_long) | notes 20 kB drawn as one line off-page (c3, with own template c6); `PDF` still valid | **P14-010** 5-8 runs (d1_long PNG, d3_mytpl_long) |
| Special characters (é ü ß € emoji CJK RTL `<script>` `%s` `{{field}}`) | **P14-001** name, address, phone, model silently missing (a2_special); Latin-1 (`Ærø`, `Citroën`, `ÄB`) fine; `%s`/`{{x}}` literal; `<script>` already stripped by the customer API | **P14-002** text file instead of PDF (a4_unknown_tpl_special, documents row 336) | OK-ish: non-WinAnsi → `?` (c1_special shows nothing because the default template has no dynamic fields; fuelLevel `1/2 😀` → `1/2 ?`) | **P14-001** Van/Naar/Chauffeur/Reden/Notities/Klant lines missing (d1_special, server log "WinAnsi cannot encode") |
| Missing template (no `pdf_templates` row / unknown id) | unknown `templateId` → G2 (KNOWN BUG-156, a4); no default flagged → arbitrary first row (**P14-013a**, b7) | — | no template → auto-created default (`database-storage.ts:4055`) | unknown `templateId` → **blank page saved as document** (**P14-013b**, d3_unknown_tpl 643 B) |
| Deleted template (was default / in use) | b7: delete default → generation continues with first row, `GET /default` returns an unflagged template (**P14-013a**); deleted id → G2 (BUG-156) | — | delete of default not attempted (unique partial index protects one default); import can steal default (**P14-008**) | delete default → first row by id (d4, acceptable) |
| Corrupt template file (garbage / 0 bytes / PDF in `.png` / JPEG in `.png`) | **P14-011** silent fallback to default vector background, 200, row keeps dangling path (b4, b5) | — | diagram file garbage/missing → placeholder box "Vehicle diagram (no template available)" (c6, OK) | JPEG bytes as `.png` accepted, silently no background (b9) |
| Invalid template fields (neg/off-page coords, font 0/500/-12/"big", unknown/`__proto__`/no source, `page`, non-object entries) | all accepted (KNOWN BUG-048); rendering: **P14-016** (a3 PNG: giant "AU", labels printed as values) | — | **P14-008**: `null` entry / emoji or number `damageTypes` / `__proto__` source → 500 for every PDF using the template (c4); font -5/900, x "abc", page 0/-3/2.7/"5" silently coerced (c4_page_neg → 5 pages) | unknown source → empty, font 200 → off-page, neg coords → off-page (d3_mytpl) |
| Missing images (background removed, header/diagram missing) | **P14-011** (b4_missing) | — | header absent in repo → PDF without header + warning (code read); diagram missing → placeholder (c6) | background missing → drawn without (code `:1466`) |
| Multiple pages / overflow | 3-page background PDF → 3-page contract, fields on page 1 only, background OpenAction JS copied (**P14-012**, b5) | 1 page always | `page` unbounded: 200/5000/40000 pages OK/5 s/76 s with the server unresponsive (**P14-007**, c5, f) | 5 and 50 transports → 5/50 pages OK; 51 → 400; duplicates allowed (d2) |
| Page count / validity | 1 page, `%PDF-1.7`, parses | 1 page | 1-2 pages as designed | 1 page per transport |
| Language | mixed en/nl inside one document (**P14-017**) | idem + hard-coded "Nederland" | `language` column ignored; dates `10/09/2026` vs `10-09-2026` (P14-017) | "Vehicle Swap"/"Tow" vs "Aflevering"/"Gepland" (P14-017) |
| Permissions (limited user `view_vehicles` only / anonymous) | **P14-006** 200/401 on generate, generate-default, generate-versioned, preview, data (writes documents rows 442, 444) | same routes | 403 on `damage-checks/generate` (OK); **P14-006** 200 on `vehicles/:id/damage-check-pdf`, `interactive-damage-checks/:id/pdf`, `POST interactive-damage-checks` (known 01a:25), header image | 403 on generate-report and template routes (OK) |
| Template editor API (create/update/background/preview/use/delete) | B1-B8: works end to end; findings P14-011, P14-012, P14-013a, P14-018, P14-019, BUG-050 | — | C7/C8: PUT/import unvalidated (P14-008); export/import/clone work | B9: works; `fields:"not json"` accepted (P14-019) |

## 4. Tested (passed or acceptable)

- G1 with a complete 20-field template on a normal reservation renders every source (`customer.*`, `vehicle.*`, `reservation.*`, `contractNumber`, `contractDate`, `driver.*`, center/right alignment) at the expected coordinates; barcode `RES-003466` top-right; 1 page, 311 kB, parses with pdfjs and pdf-lib.
- `contracts/data/:id` returns the same values as the PDF (a9); `€ 1.234.567,89` formatted correctly for large prices.
- Preview token flow: token bound to the creating user — fetching it as another user → 404 (a6); `/api/contracts/preview/../../etc/passwd` → SPA HTML, no traversal.
- `GET /api/pdf-templates/:id/preview` 404 for unknown id, 400 for non-numeric id; dummy data does not touch the DB.
- Background upload PNG works: contract becomes a 5 kB image-backed A4 page with the fields on top (b3, PNG checked); JPEG library background also works; deleting a library background removes its files; `POST /backgrounds` without `name` → 400; SVG/HTML/oversize rejections were proven in phase 3-5 and not repeated.
- Transport route rejects a TBD-spare transport with 400 and the transport id (d5) — the server-side guard that BUG-119 lacks on the contract side is present here.
- Transport batch limit (`max 50`) and "none found" → 404 work; a batch with one unknown id silently drops it (201 with the known ones).
- Damage-check draft preview with an empty body / non-array `canvasFields` renders a blank page instead of failing (c4_empty, c4_nonarray).
- Damage-check diagram upload and embedding via `vehicle_diagram_templates` works; missing/garbage file degrades to a visible placeholder.
- Damage-check template export → import → clone round trip works (c8).
- Permission checks on `/api/pdf-templates*`, `/api/damage-check-templates*`, `/api/transport-report-templates*`, `generate-report`, `damage-checks/generate` and `documents/download` are correct for the limited user (403) and anonymous (401); `barcode-label-templates` GET is `requireAuth` by design (comment in `report-and-label-templates.ts:153`).
- The server never crashed during this phase (`/health` 200 after every script; the 40000-page test made it unresponsive for ~45 s but it recovered without restart).
- Concurrency: 5 parallel `contracts/generate` → 5×200, identical bytes, no error (but see BUG-027 evidence below).

## 5. Not tested (why)

- **Legacy template file absent** (`uploads/templates/rental_contract_template.pdf` missing): the only copy lives in `process.cwd()/uploads` of the dev server on port 5000, which must not be touched; removing it would affect the other server. The consequence (G2 → text fallback) is inferred from `pdf-generator.ts:548-549, 727` and the fact that `uploads/` is gitignored (`git check-ignore` confirms) and the path ignores `UPLOADS_DIR`, so a fresh deployment does not have the file at all.
- **Portal-side generation**: none exists; the portal only downloads existing documents (out of scope here).
- **Replit object-storage background path** (`backgroundPath` starting with `/`, `pdf-generator.ts:83-91`): sidecar unreachable, already covered in phase 3-5 (DM-013).
- **Visual verification of the default contract background**: the vector template renders (PNG `_selftest_default_template.png`), so "field lands in the right box" was verified visually for a2_normal and a4 legacy; overlap between a long value and printed form text is only inferred from coordinates (pdfjs gives text boxes, not the vector form), i.e. "no overlap" for long text is **not verifiable** beyond the page-edge check.
- **Client-side print output** (key labels, barcode book, calendar/report print): HTML + `window.print()`; not renderable in this harness — only the template CRUD was exercised (B10). Label templates with negative sizes are accepted (P14-019) but the visual effect is NV.
- **Damage-check `backgroundPath`**: the canvas renderer never reads it (dead column for G5); background upload routes for damage-check templates were not exercised because the generator would not show any effect.
- **page ≥ 100 000 damage-check pages / 100 000 contract fields**: not attempted on the shared server after the 40 000-page run already blocked it for ~45 s (P14-007 extrapolates linearly: ~2 ms/page, ~380 B/page).
- **pickup / return flows that generate contracts and damage checks** (`routes.ts:2705, 4190, 4398`): phase 10/13 territory; only the generator they call (G1/G5) was tested here.
- **Rate limiting / DoS on `contracts/generate`** by an ordinary user: not measured; each call takes ~100 ms and writes a 310 kB file + row (see P14-006).

## 6. Findings summary

| Id | Sev | Feature | One line |
|---|---|---|---|
| P14-001 | HIGH | contract + transport PDF | non-WinAnsi characters (emoji, CJK, Arabic, `→`, `☎`) make pdf-lib throw; the field is silently dropped — contract without renter name/address, transport letter without addresses |
| P14-002 | HIGH | legacy contract | fallback returns a **plain-text** file served as `application/pdf` and stored as a `.pdf` document |
| P14-003 | HIGH | legacy contract | fixed-coordinate renderer has no y-flip: every value is printed in the wrong box, end date clipped |
| P14-004 | HIGH | generate-default + damage-checks/generate | `documents` insert always fails (`uploadDate` string) → files on disk, no row, response 200 |
| P14-005 | HIGH | damage check | customer printed as `null null` for every customer without first/last name (331/335 customers) |
| P14-006 | HIGH | authz | any authenticated user (no permissions) can generate/persist contracts, read contract data and damage-check PDFs (PII) |
| P14-007 | HIGH | damage-check template | unbounded `page` → 40 000 blank pages, 76 s, server unresponsive (event loop) for ~45 s; persisted via unvalidated PUT |
| P14-008 | MEDIUM | damage-check template | `canvasFields` unvalidated: one malformed entry breaks every PDF for the vehicle (500); import can steal the default |
| P14-009 | MEDIUM | damage check | header image drawn at image-dependent height over the canvas; editor never shows it; overlay text size/position hard-coded |
| P14-010 | MEDIUM | all generators | no wrapping/truncation: long values run off the page and are lost in print |
| P14-011 | MEDIUM | contract templates | corrupt/missing/wrong-format background → silent fallback to the default, dangling paths, cross-template background select |
| P14-012 | MEDIUM | contract templates | background PDF's OpenAction JavaScript and extra pages are copied into every generated contract |
| P14-013 | MEDIUM | template selection | no default → arbitrary template; unknown transport template → blank report; three damage-check matchers disagree |
| P14-014 | MEDIUM | generate-versioned | no reservation/ownership check: document rows for reservation 999999 and with a foreign customer/vehicle |
| P14-015 | MEDIUM | vehicle damage-check-pdf | prints an old/unrelated reservation when there is no current rental; fabricated rental days |
| P14-016 | LOW | contract templates | unresolvable sources print the field label / `[object Object]` / `Field`; font 500 covers the page |
| P14-017 | LOW | all | mixed en/nl wording, date and currency formats inside one document; `language` column ignored |
| P14-018 | LOW | template editor | PDF background preview conversion fails on Windows (worker URL) → no preview image |
| P14-019 | LOW | validation | garbage dates/ids → 500 with DB error text; invalid JSON → 404; empty name, null fields, negative label sizes accepted |

Re-confirmed existing: BUG-027 (+ race: duplicate version labels), BUG-028, BUG-029, BUG-048, BUG-050, BUG-066, BUG-156 (see §8).

## 7. BUGs

```
BUG P14-001
Severity: HIGH
Feature: Contract PDF (template renderer) and transport report PDF — text with characters outside WinAnsi
Status: OPEN
Reproduction: p14-a-contracts.cjs A2 (GET /api/contracts/generate/3475?templateId=9, customer 1291 "AUDIT-P14 Spéçiål Ünïcödé ß € 😀 日本語 مرحبا …", address with "→", phone with "☎", vehicle model with emoji) and p14-d-transport.cjs D1 (POST /api/delivery/transports/generate-report {transportIds:[62]}, transport with emoji/CJK/RTL in origin, destination, driver, reason, notes, customer).
Expected: the glyphs are rendered with a Unicode font, or replaced (as the damage-check generator does with sanitizeForWinAnsi), or the request fails visibly. The renter's name must never be missing from a contract.
Actual: 200, valid PDF, but every field whose value contains one such character is absent. a2_full_special.pdf page text = "1234 ÄB Ærø %d %s %n {{x}} Citroën AU-14-BX AUDITP14AU14BX September 11, 2026 September 18, 2026 7 days € 99,50 C-3475-20260910 10 september 2026" — no customer name, no address, no phone, no model. d1_transport_special.pdf contains no "Van:", "Naar:", "Chauffeur:", "Reden:", "Notities:", "Klant:" line at all. Server log: `Error drawing transport report field lblNaar: Error: WinAnsi cannot encode "م" (0x0645) ... at drawTransportReportPage (pdf-generator.ts:1420)` and the same for 0x1f600 / 0x2192. Latin-1 characters (é ü ß € Æ ø) render correctly.
Root cause: server/utils/pdf-generator.ts:210-211 embeds StandardFonts.Helvetica (WinAnsi only); the per-field try/catch at :517-519 (contract) and :1426-1428 (transport) swallows the encoding error and continues. Only server/pdf-damage-check-generator.ts:123-137 sanitizes.
Affected files: server/utils/pdf-generator.ts, server/pdf-damage-check-generator.ts (has the sanitizer that should be shared)
Affected data: every contract/transport letter for customers, addresses or vehicles containing non-Latin-1 characters (Turkish/Polish/Arabic names, emoji in notes, "→" typed by staff).
Security impact: none direct; legal/document-integrity impact: a signed rental contract without the renter's name.
Business impact: incorrect legal documents handed to customers and drivers; not detectable from the UI (200 + file).
Fix: (proposal) register @pdf-lib/fontkit and embed a Unicode TTF (e.g. DejaVu/Noto) for all three generators, or apply one shared sanitizeForWinAnsi before every drawText/widthOfTextAtSize; log at warn level and surface a "characters replaced" note in the response header or document notes.
Regression test: unit test rendering a contract and a transport report for a reservation/transport whose customer name is "Zoë 😀 日本語 مرحبا" and asserting the extracted page text contains "Zoë" and a replacement for the rest; assert no field is dropped (count of drawn fields == template fields).
```

```
BUG P14-002
Severity: HIGH
Feature: Legacy contract generator fallback produces a non-PDF file that is served and stored as a PDF
Status: OPEN
Reproduction: p14-a-contracts.cjs A4: GET /api/contracts/generate/3475?templateId=999999 (unknown templateId → legacy generateRentalContract; reservation 3475 has the emoji customer). Then `select id, file_path, file_size from documents where id=336`; `head -c 8` of the file.
Expected: either a real PDF or an HTTP 500; never a text file with Content-Type application/pdf; never a documents row pointing at a non-PDF.
Actual: 200, `Content-Type: application/pdf`, `Content-Disposition: attachment; filename=rental_contract_3475.pdf`, body 1342 bytes starting with "\nAuto Lease LAM\nKerkweg 47a\n3214 VC Zuidland …RENTAL CONTRACT…" (plain text). documents row 336 (`Contract (Unsigned) 2`, `..\audit-uploads\contracts\AU14BX\AU14BX_contract_20260910.pdf`, file_size 1342) and the file on disk begin with "\nAuto Le" — the previous valid contract for that plate/day was overwritten (same file name, BUG-027). Any PDF viewer reports the document as corrupt.
Root cause: server/utils/pdf-generator.ts:735-793 generateFallbackContract returns Buffer.from(text); reached from the catch at :727 (legacy) when page.drawText throws (WinAnsi, see P14-001) and — on any deployment where uploads/ is not shipped — from fs.readFileSync at :548-549 (path is process.cwd()/uploads/templates/rental_contract_template.pdf, ignores UPLOADS_DIR; the file is gitignored). Also reachable from :531 (template renderer outer catch). routes.ts:5561-5650 then saves whatever buffer it got as .pdf.
Affected files: server/utils/pdf-generator.ts, server/routes.ts:5451-5650, 5963-6078
Affected data: documents rows + files for every reservation that hits the fallback; the phase 3-5 emoji reservation 3214 is a candidate.
Security impact: none. Data integrity: corrupt documents in the archive.
Business impact: staff download an unreadable "contract"; the archive silently contains text files named .pdf.
Fix: (proposal) delete generateFallbackContract; make generateRentalContract throw; have the routes return 500 with a clear message and NOT write a documents row; move the default template into the repo (or UPLOADS_DIR) and resolve it via getUploadsDir().
Regression test: call the generate route for a reservation with a non-WinAnsi customer name and an unknown templateId; assert response body starts with "%PDF-" or status is 500; assert no documents row with file_size < 1 kB / non-PDF header is created.
```

```
BUG P14-003
Severity: HIGH
Feature: Legacy contract generator (generateRentalContract) places every value in the wrong box
Status: OPEN
Reproduction: p14-a-contracts.cjs A4: GET /api/contracts/generate/3466?templateId=999999 (or =-1) → files/p14/a4_unknown_template_legacy_normal.pdf/.png. Same output path is taken when no pdf_templates row exists, when a templateId is unknown (BUG-156) and when the template renderer throws (routes.ts:5509, 5551, 5557, 6010, 4191).
Expected: brand/model/plate in "Gegevens voertuig", name/address in "Huurder / bestuurder 1", dates in "Huurtijd van-tot", price in "Huurprijs", contract date at the bottom.
Actual (PNG inspected + pdfjs coordinates): contract date "10 september 2026" printed in the "Groep" line of the vehicle block (y=637 from the bottom); customer name/address/postcode/city/phone/licence printed in the "Bestuurder 2" block (y=254..358 from the bottom); brand/model/plate printed inside "Schade aan het voertuig" (y=150..179 from the bottom); "Nederland" printed as a phone value; start/end dates on the "Hoog eigen risico" row with the end date clipped at the right edge (pdfjs: "September 1" at x=545, runs past 595 pt); price on the "Premie vermindering eigen risico" row. The form's own labels are covered by unrelated values.
Root cause: server/utils/pdf-generator.ts:569-703 passes editor-style top-left y values straight to pdf-lib (bottom-left origin) — the `842 - y` flip that the template renderer applies at :450 is missing; x=545 for the end date leaves ~50 pt for an ~85 pt string.
Affected files: server/utils/pdf-generator.ts:541-733; callers in server/routes.ts
Affected data: every contract produced through the fallback path (unknown templateId, no templates, renderer error).
Security impact: none. Legal: an unreadable/incorrectly filled rental contract.
Business impact: fallback path produces documents that must be re-done by hand; combined with BUG-156 a typo in templateId silently yields this document.
Fix: (proposal) remove the legacy generator entirely (it duplicates G1 with a hard-coded field list); if a "hard-coded default layout" is wanted, express it as a seeded pdf_templates row so G1 renders it.
Regression test: render via generateRentalContract for a fixture reservation and assert with pdfjs that the customer name item has y > 500 (upper half) and that every text item has x + width <= 595.
```

```
BUG P14-004
Severity: HIGH
Feature: GET /api/contracts/generate-default/:id and GET /api/damage-checks/generate/:id write the file but never create the documents row
Status: OPEN
Reproduction: p14-a-contracts.cjs A5 (GET /api/contracts/generate-default/3466 and /3475), p14-c-damage.cjs C1 (GET /api/damage-checks/generate/3476 and /3477), p14-e-perms.cjs (generate-default as admin and as limited user). Then `select * from documents where reservation_id in (3476,3477) and document_type like 'Damage Check (Unsigned)%'` → 0 rows; documents created during A5/E contain no generate-default rows (the 'Contract (Unsigned)' rows 328-357/442-445 all come from generate/generate-versioned).
Expected: 200 + documents row (`Contract (Unsigned)` / `Damage Check (Unsigned) n`) as the code intends.
Actual: 200 and the PDF downloads; server log for every call: `⚠️ Error saving contract to documents (PDF will still download): TypeError: value.toISOString is not a function at PgTimestamp.mapToDriverValue` (same for `⚠️ Error saving damage check to documents`). Files exist on disk (`audit-uploads/AU14CX/damage-checks/AU14CX_DamageCheck_Unsigned_2026-09-10_*.pdf`, `audit-uploads/AU140X/contracts/AU140X_Contract_Unsigned_*.pdf`) with no row → orphan files, nothing in the Documents UI, versioning never increments.
Root cause: server/routes.ts:6047 and :6268 pass `uploadDate: new Date().toISOString()` (a string) into storage.createDocument; drizzle's timestamp column mapper expects a Date. insertDocumentSchema omits uploadDate (shared/schema.ts:1067) but createDocument does not validate, so the string reaches the driver. The other save blocks (:5561, :5885) do not set uploadDate and work.
Affected files: server/routes.ts:6017-6062, 6217-6280
Affected data: all "unsigned damage checks" ever produced via the reservation button and all contracts via generate-default since this code shipped: files without rows.
Security impact: none. Storage: unbounded orphan files.
Business impact: the reservation's Documents tab never shows the damage check that staff just generated; staff regenerate repeatedly (more orphans); the regeneration service (reservation-pdf-regeneration.ts:326) finds no 'Damage Check (Unsigned)' rows and never regenerates.
Fix: (proposal) drop the uploadDate property (column default now()) or pass `new Date()`; add a unit test around storage.createDocument with the exact payload; consider failing the request (or at least returning a warning header) when the row insert fails instead of silently returning 200.
Regression test: call both routes for a fixture reservation and assert one new documents row each with content_type application/pdf and an existing file.
```

```
BUG P14-005
Severity: HIGH
Feature: Damage check PDF prints "null null" as customer name
Status: OPEN
Reproduction: p14-c-damage.cjs C1/C2: GET /api/damage-checks/generate/3476 and GET /api/vehicles/1840/damage-check-pdf (reservation 3476, customer 1285 "AUDIT-P14 Normal Customer", first_name/last_name NULL — like 331 of the 335 customers in this database). Template 4 has a dynamic field source=customerName. Files c1_dc_generate_name_only.pdf/.png, c2_vehicle_dc_damage_vehicle.pdf.
Expected: "AUDIT-P14 Normal Customer" (the customers.name value used everywhere else, e.g. routes.ts:6946, 7255 and the contract).
Actual: page text contains "null null" at the customer position (visible in the PNG next to the contract number). Only customer 1289 with first/last name set prints "AuditFirst AuditLast".
Root cause: server/routes.ts:6187 `customerName: \`${reservation.customer.firstName} ${reservation.customer.lastName}\`` and :6742 `customer ? \`${customer.firstName} ${customer.lastName}\` : 'N/A'` — the customer model's primary field is `name` (first/last are optional, populated for 4 rows).
Affected files: server/routes.ts:6178-6190, 6720-6746
Affected data: every damage check produced by these two routes for the ~99% of customers without first/last name.
Security impact: none. Document integrity: the inspection report does not identify the renter.
Business impact: damage disputes need the customer on the signed check; staff must correct by hand.
Fix: (proposal) one shared buildDamageCheckReservationData(reservation) using `customer.name || [firstName,lastName].filter(Boolean).join(' ')`; delete the four inline copies.
Regression test: generate for a customer with only `name` and assert the page text contains that name and not "null".
```

```
BUG P14-006
Severity: HIGH
Feature: Contract and damage-check PDF endpoints have no permission check (requireAuth only)
Status: OPEN (catalogued as a gap in docs/audit/01a-api-en-autorisatie.md:23-24 and api-matrix item 6; no tracker id; runtime evidence added here)
Reproduction: p14-e-perms.cjs — user AUDIT-P14-limited (role user, permissions ["view_vehicles"]) vs anonymous vs admin on 27 endpoints. Results (anon/limited/admin): GET /api/contracts/generate/3466?templateId=9 → 401/200/200 (PDF 311626 B, documents row 442 created_by AUDIT-P14-limited); GET /api/contracts/generate-default/3466 → 401/200/200; POST /api/contracts/generate-versioned/3466 → 401/200/200 (row 444); POST /api/contracts/preview → 401/200/200 (token + PDF with customer PII); GET /api/contracts/data/3466 → 401/200/200 (JSON with name, address, phone, licence); GET /api/vehicles/1840/damage-check-pdf → 401/200/200 (1.9 MB); GET /api/interactive-damage-checks/15/pdf → 401/200/200 (signatures + customer); POST /api/interactive-damage-checks → 401/201/201 (known 01a:25); GET /api/damage-check-fields/header → 401/200/200. All template routes, /api/damage-checks/generate and generate-report correctly return 403.
Expected: contract generation/preview/data behind VIEW_RESERVATIONS or MANAGE_RESERVATIONS (generation that persists documents behind MANAGE_RESERVATIONS/MANAGE_DOCUMENTS); damage-check PDFs behind VIEW/MANAGE_DAMAGE_CHECKS like /api/damage-checks/generate already is.
Actual: any active staff login, regardless of permissions, can produce and persist contracts for any reservation (documents rows + 310 kB files, unbounded), read every customer's contract data and every signed damage check.
Root cause: server/routes.ts:5451, 5676, 5768, 5798, 5963, 6080 (`requireAuth` only), :6641, :7213, :6849 (`requireAuth` only); server/routes/app-settings.ts:79.
Affected files: server/routes.ts, server/routes/app-settings.ts
Affected data: all customers' PII (name, address, phone, driver licence) and all signed damage checks; documents table growth.
Security impact: horizontal information disclosure inside the staff realm + unauthenticated-permission write of documents; also a cheap resource-exhaustion vector (each call writes a 310 kB file).
Business impact: the permission model advertised in the user admin ("view_reservations", "manage_damage_checks") is not enforced for the most sensitive documents.
Fix: (proposal) add hasPermission(...) to the nine routes; put persistence behind a manage permission; consider a per-user rate limit on generation.
Regression test: extend docs/audit/wip/scripts/matrix with these routes and assert 403 for the "nobody" identity.
```

```
BUG P14-007
Severity: HIGH
Feature: Damage-check template `page` value is unbounded → multi-minute synchronous PDF generation blocks the whole server
Status: OPEN
Reproduction: p14-c-damage.cjs C5 and p14-f-eventloop.cjs 40000: POST /api/damage-check-templates/preview-pdf {name:"x", canvasFields:[{id:"a",type:"text",x:40,y:200,name:"on page 40000",fontSize:11,page:40000}]} (admin or any MANAGE_DAMAGE_CHECKS user). The same field persisted with PUT /api/damage-check-templates/:id (no validation) makes every damage-check PDF for matching vehicles — incl. the auto-PDF in the pickup/return flow — do the same.
Expected: page limited to a small number (e.g. ≤ 10) at write time and at render time; generation off the event loop or with a size/time budget.
Actual: page=200 → 200 pages/0.7 s; page=5000 → 5000 pages/3.5 MB/5.1 s; page=40000 → 200 OK, 40000 pages, 15.3 MB, 75.9 s; during that request two consecutive GET /health probes timed out after 20 s each and the next took 6 s (server unresponsive to every client for ~45 s), CPU-bound in the single Node process; memory not measured. Linear cost ≈ 2 ms and 380 B per page, so page=1e6 would take ~30 min and ~400 MB. No crash/restart was triggered (so this is a DoS, not the auto-restart case).
Root cause: server/pdf-damage-check-generator.ts:322-323 `const maxPage = Math.max(1, ...fields.map(f => Number(f.page) || 1)); const pages = Array.from({ length: maxPage }, () => pdfDoc.addPage(...))` and the header image loop :407-421 draws on every page; routes/damage-check-templates.ts:88-190 (preview) and :200-235 (create/update) accept the draft without validation.
Affected files: server/pdf-damage-check-generator.ts, server/routes/damage-check-templates.ts
Affected data: none corrupted; availability of the whole application.
Security impact: authenticated DoS by any user with MANAGE_DAMAGE_CHECKS (the `ike` account has it); persisted variant affects all users indefinitely.
Business impact: one bad template save = every pickup/return that generates a damage check stalls the server for minutes.
Fix: (proposal) zod-validate canvasFields (page 1..10, fontSize 4..72, width/height ≤ page, damageTypes string[] ≤ 20, type enum) on POST/PUT/import/preview; clamp maxPage in the generator; reject templates with > N fields.
Regression test: PUT a template with page=99999 → 400; generator unit test asserts page count ≤ 10 for page=99999.
```

```
BUG P14-008
Severity: MEDIUM
Feature: Damage-check template fields are not validated; one malformed entry breaks every PDF using the template; import can take over the default
Status: OPEN
Reproduction: p14-c-damage.cjs C4/C7/C8. POST /api/damage-check-templates/preview-pdf with canvasFields [{type:"inspection", damageTypes:["ja","😀","nee"]}] → 500; damageTypes [42,null,{a:1}] → 500; [{type:"unknownType"}, {name:"no type"}, "string-field", null, 42] → 500; a dynamic field with source "__proto__" → 500 (c4_dynamic_all). PUT /api/damage-check-templates/4 accepts anything (canvasFields:"not an array" only failed because isDefault:"yes" is not boolean). POST /api/damage-check-templates/import {name, canvasFields:"garbage", isDefault:true} → 200 and the imported template became the only default (select id from damage_check_templates where is_default → 6) until reset with /1/set-default.
Expected: 400 with field-level errors on create/update/import/preview; the generator skips a bad field rather than failing the whole document; import never changes the default silently.
Actual: as above; once persisted, GET /api/vehicles/:id/damage-check-pdf, /api/damage-checks/generate/:id and the pickup/return auto-PDF all fail with 500 (or, in the pickup flow, silently skip the document) for every vehicle that matches the template.
Root cause: server/routes/damage-check-templates.ts:200-235 (spread req.body), :531 (import), :88 (preview) — no schema; pdf-damage-check-generator.ts:634 `font.widthOfTextAtSize(t, optSize)` with the raw damageType (not sanitized, not stringified), :430 `Number(f.page)` on null, :673 `dynVals[String(f.source)]` returns Object.prototype for "__proto__" and sanitizeForWinAnsi calls .replace on it.
Affected files: server/routes/damage-check-templates.ts, server/pdf-damage-check-generator.ts, client editor (can it even produce these? no — API only)
Affected data: damage_check_templates rows; is_default flag.
Security impact: low (needs MANAGE_DAMAGE_CHECKS); denial of the damage-check feature.
Business impact: a corrupt import or API misuse disables damage-check PDFs for a vehicle class with an opaque 500.
Fix: (proposal) shared zod schema for CanvasField (shared/damage-check-default-layout.ts already has the TS type), applied in all four routes; per-field try/catch in the generator; import ignores isDefault unless explicitly requested.
Regression test: POST preview with the three payloads above → 400; PUT with canvasFields [null] → 400.
```

```
BUG P14-009
Severity: MEDIUM
Feature: Damage-check header image overlays the template canvas; its height depends on the uploaded image; the editor never shows it
Status: OPEN
Reproduction: current app_settings.damage_check_fields.headerImagePath = uploads\damage-check\header-1787427063629.png (1983×793 px). Any damage-check PDF, e.g. p14-c-damage.cjs C1 → files/p14/c1_dc_generate_name_only.png, c3_interactive_check.png.
Expected: the editor and the generator agree on a fixed header band (e.g. 60-80 pt) and the template fields start below it; date/contract overlay positioned relative to the band, readable size.
Actual (PNG): the header is drawn 595 pt wide × 238 pt high (aspect-derived) over y=604..842, covering every field with y < 238 in editor coordinates — template 4's title, plate, brand, model, customer ("null null"), dates are drawn on top of the dark image and are barely readable; with the seeded default template (id 1) the entire checklist rows at y=30..160 are hidden under the image (c3). The overlay date "10/09/2026" and contract number are rendered at 29 pt (`textSize = round(headerH*0.12)`) at pixel offsets (445,28)/(445,80) meant for the original bundled image, so they land in the middle of the picture. The bundled default `attached_assets/image_1779471993617.png` is not in the repository (149 other files are), so without an upload the PDF has no header at all (warning only).
Root cause: server/pdf-damage-check-generator.ts:384-425 (headerH = 595 * srcH/srcW; datumSrcX/Y hard-coded; drawn on every page before the fields); no header notion in client/src/pages/settings/damage-check-template-editor.tsx (only headerText); upload route app-settings.ts:107 validates the image but not its aspect ratio.
Affected files: server/pdf-damage-check-generator.ts, server/routes/app-settings.ts, client/src/pages/settings/damage-check-template-editor.tsx
Affected data: every damage-check PDF while a tall header image is configured.
Security impact: none.
Business impact: damage checks with unreadable identification block; template authors cannot see the collision in the editor.
Fix: (proposal) fix the header band height (fit the image into a 595×70 box, letterbox), store the overlay positions as a percentage of the band, render the band in the editor as a locked top region, validate aspect ratio on upload (or crop), and ship the default header in the repo.
Regression test: generate with a 1:1 header image and assert the first template field's baseline is below the header band; assert overlay font size ≤ 12.
```

```
BUG P14-010
Severity: MEDIUM
Feature: No wrapping/truncation in any generator — long values run off the page
Status: OPEN
Reproduction: p14-a-contracts.cjs A2/A4 with reservation 3474 (customer 1290: 500-char name, 1000-char address, 240-char city, 62-char phone, 200-char licence; vehicle 1838: 300-char brand/model): files a2_full_long.pdf/.png, a4_unknown_template_legacy_long.pdf; p14-d-transport.cjs D1/D3 with transport 61 (1000-char destination, 300-char driver, 2000-char reason, 20 kB notes): d1_transport_long.pdf/.png, d3_transport_mytemplate_long.pdf; p14-c-damage.cjs C3 (20 kB notes in the interactive check → dynamic `notes` field).
Expected: wrap within the field/box width, or truncate with an ellipsis, or shrink-to-fit, or at least reject over-long input where the document cannot hold it.
Actual: pdfjs coordinates show 8 text runs on the contract (name at x=61 w=539 → past 595 pt; centred name starting at x=0.1; right-aligned name starting at x=-2.5, i.e. origin outside the page), 5 on the legacy contract, 5-8 on the transport letters; the PNGs show the text disappearing under the right margin — the tail of every long value is lost in print and the right column of the contract form is overwritten by the left column's text.
Root cause: pdf-generator.ts:474-517 (single drawText, alignment math assumes the text fits), :1420-1428, pdf-damage-check-generator.ts:640-650; no width in the template model (editor stores none for text fields), no maxLength on customer/vehicle/transport text columns (customers.name accepted 500 chars, address 1000).
Affected files: server/utils/pdf-generator.ts, server/pdf-damage-check-generator.ts, client editors (no width concept), shared/schema.ts (no length limits)
Affected data: documents for customers/companies with long names or addresses, transports with long notes.
Security impact: none.
Business impact: printed contracts and driver letters with missing/overlapping information.
Fix: (proposal) add optional width/maxLines to positioned fields (default: page width − x − margin), implement word-wrap with pdf-lib's widthOfTextAtSize, and add sane maxLength validation on the inputs (name 200, address 300, notes 5000).
Regression test: render the long fixture and assert with pdfjs that every text item satisfies x ≥ 0 and x + width ≤ 595.
```

```
BUG P14-011
Severity: MEDIUM
Feature: Contract template backgrounds — corrupt/missing/wrong-format files and library operations degrade silently
Status: OPEN
Reproduction: p14-b-templates.cjs B4-B6 on template 12/14 ("AUDIT-P14 background tests"): (1) after a valid PNG upload, overwrite audit-uploads/templates/template_12_background.png with garbage bytes, with 0 bytes, with a PDF, with JPEG bytes, and finally delete it → GET /api/contracts/generate/3466?templateId=12 → 200 each time, 311626 B, page 1 built from the *default vector template* (pdf-lib inspection: 12 content streams, 1 image = barcode), template row still says backgroundPath=…template_12_background.png, and GET /<backgroundPreviewPath> (what the editor loads) returns 200 text/html (SPA fallback) instead of 404. (2) Upload JPEG bytes named `x.png` with mimetype image/jpeg → 200, stored as template_12_background.png, generation silently falls back to the default (embedPng fails). (3) Add a library background to template 12, POST /api/pdf-templates/9/backgrounds/1/select (background of another template) → 200, template 9 now uses template 12's file; DELETE /api/pdf-templates/12/backgrounds/1 → file removed, but template 12's (and 9's) backgroundPath still point at the deleted file → next generation silently uses the default.
Expected: generation with an unreadable configured background fails loudly (500 + log) or at least flags the fallback; upload derives the extension from the detected content type; library select checks ownership; deleting the active background resets backgroundPath (or is refused); missing preview → 404.
Actual: as above — the operator's custom form disappears from every new contract without any signal.
Root cause: server/utils/pdf-generator.ts:88-207 (five nested fallbacks to the default template, all `console.log`); routes/pdf-templates.ts:346-352 (`ext = path.extname(req.file.originalname)`); :605-629 (no templateId check on select); :631-676 (no reset of the active path); server/index.ts static uploads route + SPA catch-all (BUG-029 family) for the preview URL.
Affected files: server/utils/pdf-generator.ts, server/routes/pdf-templates.ts (and the two copies in report-and-label-templates.ts / damage-check-templates.ts)
Affected data: pdf_templates.backgroundPath / backgroundPreviewPath, template_backgrounds
Security impact: low (BUG-070 already covers path abuse of backgroundPath).
Business impact: contracts printed on the wrong stationery; the editor shows a broken image with no explanation.
Fix: (proposal) treat "configured background unreadable" as an error; sniff the content type and set ext from it; validate background ownership on select; on library delete, null out any template using it; make the static route return 404 for missing files.
Regression test: corrupt the background file in a test and assert the generate route returns 500 (or a warning header) instead of 200 with the default background.
```

```
BUG P14-012
Severity: MEDIUM
Feature: A PDF background's document-level content (OpenAction JavaScript, extra pages, names tree) is copied into every generated contract
Status: OPEN
Reproduction: p14-b-templates.cjs B5: build a 3-page PDF with catalog /OpenAction → /S /JavaScript /JS (app.alert('AUDIT-P14 background JavaScript')) (files/p14/b5_background_3pages_js.pdf), upload it as background of template 12 (accepted, 200, backgroundPreviewPath null — P14-018), GET /api/contracts/generate/3466?templateId=12 → files/p14/b5_pdf_background_3pages.pdf.
Expected: only page 1's appearance is used as a background (copyPages/embedPage into a fresh document); no scripts, actions, forms or embedded files from the upload survive; page count = 1 (or fields on every page if multi-page backgrounds are a feature).
Actual: generated contract has 3 pages, fields only on page 1, and pdf-lib shows catalog OpenAction = `<< /Type /Action /S /JavaScript /JS (app.alert('AUDIT-P14 background JavaScript')) >>`; documents row 421 (5788 B) stores it. The upload validator (validateFileBuffer, 'document') only checks magic bytes.
Root cause: server/utils/pdf-generator.ts:113 `pdfDoc = await PDFDocument.load(templateBytes)` — the uploaded document *becomes* the output document; :540 saves it with everything it carried.
Affected files: server/utils/pdf-generator.ts, server/routes/pdf-templates.ts:306-412 (no PDF content policy)
Affected data: every contract generated with a PDF background.
Security impact: a user with MANAGE_PDF_TEMPLATES (or anyone via BUG-070-style path abuse) can plant active content that runs in Acrobat/Foxit for every customer/employee who opens a contract (JS is sandboxed but supports phishing dialogs, launch actions on older viewers, and data exfiltration via submitForm); also allows hiding extra pages/terms in contracts.
Business impact: reputational/legal; customers receive documents with hidden content.
Fix: (proposal) create a fresh PDFDocument, `copyPages`/`embedPage` page 1 of the background, never keep the source catalog; on upload reject PDFs containing /JavaScript, /OpenAction, /AA, /Launch, /EmbeddedFiles, or flatten via pdf-to-image and use the PNG.
Regression test: upload the fixture PDF and assert the generated contract has 1 page and no OpenAction/JavaScript objects.
```

```
BUG P14-013
Severity: MEDIUM
Feature: Template selection falls back inconsistently: arbitrary contract template, blank transport report, three damage-check matchers
Status: OPEN (BUG-156 covers "unknown contract templateId → default"; the three cases below are different)
Reproduction: (a) p14-b-templates.cjs B7: PATCH /api/pdf-templates/13 {isDefault:true} → DELETE /api/pdf-templates/13 → `select id from pdf_templates where is_default` = none; GET /api/pdf-templates/default → 200 {id:9,"AUDIT-P14 full fields"} (not flagged default); GET /api/contracts/generate/3466 → 200 rendered with template 9 (first row by insertion). (b) p14-d-transport.cjs D3: POST /api/delivery/transports/generate-report {transportIds:[60], templateId:999999} → 201, documents row 439, file 643 B, 1 page, no text at all (d3_transport_unknown_template.pdf). (c) p14-c-damage.cjs: vehicle 1840 (brand/model match template 4, vehicleType 'van', template 4 has vehicleType NULL): GET /api/damage-checks/generate/3476 → template 4 (alphabetically first), GET /api/vehicles/1840/damage-check-pdf → template 4 (tier 2 make+model), GET /api/interactive-damage-checks/15/pdf and the pickup auto-PDF → template 1 "Auto-Generated Default" (pickBest requires vehicleType equality when the vehicle has a type).
Expected: (a) no default → explicit "no default template" error or the seeded default, never "first row"; (b) unknown templateId → 404, never a blank document; (c) one matcher.
Actual: as above; in (a) the deleted default's replacement depends on insertion order; in (b) a blank letter is archived; in (c) the same vehicle gets different layouts depending on which button staff press.
Root cause: (a) server/database-storage.ts:2322 `allTemplates.find(t => t.isDefault) || allTemplates[0]` (also reservation-pdf-regeneration.ts:117); (b) server/routes.ts:7692-7694 `templateId ? getTransportReportTemplate(templateId) : getDefault…` with no null check, generateTransportReportsPdf draws nothing for template undefined; (c) routes.ts:6155-6165 vs :6660-6710 vs services/reservation-pdf-regeneration.ts:299-320 (also the storage query getDamageCheckTemplatesByVehicle orders by name).
Affected files: server/database-storage.ts, server/routes.ts, server/services/reservation-pdf-regeneration.ts
Affected data: documents produced after a default is deleted; transport_report documents with unknown templateId.
Security impact: none.
Business impact: unpredictable layouts; blank letters in the archive.
Fix: (proposal) `getDefaultPdfTemplate` returns undefined when none is flagged and routes 409 "no default template"; generate-report 404s on unknown templateId; one shared resolveDamageCheckTemplate used by all six callers; DELETE of a default template either refused or transfers the flag explicitly.
Regression test: delete the default → generate → expect 409; generate-report with templateId 999999 → 404; snapshot test that the three damage-check routes resolve the same template id for a fixture vehicle.
```

```
BUG P14-014
Severity: MEDIUM
Feature: POST /api/contracts/generate-versioned/:reservationId does not verify the reservation or that vehicle/customer belong to it
Status: OPEN
Reproduction: p14-a-contracts.cjs A7: POST /api/contracts/generate-versioned/999999?templateId=9 {vehicleId:1833, customerId:1285, startDate, endDate} → 200 PDF with contract number "C-999999-20260910" and `select * from documents where reservation_id=999999` → row 365 (vehicle 1833, 'Contract (Unsigned)', file ..\audit-uploads\contracts\AU140X\AU140X_contract_20260910.pdf — the same file name every AU140X contract of the day uses, BUG-027). POST …/3466 with vehicleId 1839 / customerId 1291 (not the reservation's) → 200 and documents row 364 attached to reservation 3466 showing customer 1291 and vehicle AU-14-BX.
Expected: 404 for a non-existent reservation; for an existing one, either the form data is validated against the reservation or the mismatch is recorded (notes) — the "edit mode before save" use case should at least require MANAGE_RESERVATIONS (P14-006).
Actual: dangling documents rows (documents.reservation_id has no FK), a contract file that overwrites the real reservation's file of the day, and contracts attached to a reservation that name another customer.
Root cause: server/routes.ts:5798-5960 — reservationId is only parseInt'd, never loaded; vehicle/customer come from the body.
Affected files: server/routes.ts
Affected data: documents rows 364/365 in the audit DB; any similar rows in production.
Security impact: low; with P14-006 any user can attach arbitrary contract documents to any reservation id.
Business impact: wrong contract in a reservation's document list; archive pollution.
Fix: (proposal) load the reservation (404), require the caller to have MANAGE_RESERVATIONS, and either force vehicle/customer from the reservation or record "draft with unsaved form data" in documentType/notes; use a unique file name per version.
Regression test: POST for reservation 999999 → 404 and no documents row.
```

```
BUG P14-015
Severity: MEDIUM
Feature: GET /api/vehicles/:id/damage-check-pdf prints an unrelated/old reservation when there is no current rental; rentalDays fabricated for open-ended rentals
Status: OPEN
Reproduction: p14-c-damage.cjs C2: vehicle 1837 has one reservation 3472 (2020-01-01..2020-01-05, customer 1291); GET /api/vehicles/1837/damage-check-pdf → contract number "#3472" on today's check (c2_vehicle_dc_old_reservation_2020.pdf; with a template that has customerName it would also print that customer). GET /api/damage-checks/generate/3469 (open-ended reservation, endDate NULL) → endDate printed as start+7 days and rentalDays 7 (routes.ts:6180).
Expected: no reservation block when no reservation covers today (or the next upcoming one, clearly labelled); open-ended → "open" and no day count.
Actual: `reservations.find(current) || reservations[0]` picks the most recent past rental; the check is pre-filled with a customer who returned the car years ago.
Root cause: server/routes.ts:6725 `|| reservations[0]` (getReservationsByVehicle orders by start_date desc); :6180 `new Date(startDate.getTime() + 7*24*3600*1000)`.
Affected files: server/routes.ts:6717-6746, 6176-6190
Affected data: damage checks generated from the vehicle page for idle vehicles.
Security impact: minor PII leakage (previous renter's name on a new check).
Business impact: wrong customer/contract on the inspection sheet; staff may sign the wrong renter.
Fix: (proposal) only use a reservation whose period contains today (or the explicit reservationId passed by the client); render "open" for missing endDate.
Regression test: vehicle with only a past reservation → page text contains no "#<id>"; open-ended reservation → no rentalDays.
```

```
BUG P14-016
Severity: LOW
Feature: Contract template renderer prints placeholder text for unresolvable fields and accepts absurd geometry
Status: OPEN (BUG-048 covers acceptance of malformed fields; this is about what ends up on paper)
Reproduction: p14-a-contracts.cjs A3 (template 10 "AUDIT-P14 invalid fields") → files/p14/a3_invalid_fields.pdf/.png and A8 (template preview). pdfjs items: "SHOULD-NOT-PRINT-unknown-plain" (field name printed because source "nonexistentSource" is unknown), "[object Object]" (source "__proto__"), "1833" (source "vehicleId" — internal id), "NoSource"/"NullField"/"Field"/"Field" (fields without source or non-object entries) at (61,218)/(6,833)/(6,831); "Zuidland" at (6,833) for x:"abc"; fontSize 500 accepted → a 500 pt "AU" of the plate covers the whole page (PNG); fontSize 0/-12/"big" → 12; page:3 ignored (drawn on page 1); coordinates -50/-50 and 2000/2000 → drawn outside the page (silently invisible).
Expected: unknown source → empty string + warning (as the transport renderer does), no internal ids, fontSize clamped (e.g. 6-48), coordinates clamped to the page, non-object entries rejected.
Actual: as above; the customer-facing contract can contain the template author's labels.
Root cause: server/utils/pdf-generator.ts:386-390 (`else if (field.name) value = field.name; else value = source || 'Field'`), :344-355 (`source in contractData` exposes any key incl. vehicleId and prototype members), :419-431 (no upper bound on fontSize), :439-461 (no clamping).
Affected files: server/utils/pdf-generator.ts, server/routes/pdf-templates.ts (validation)
Affected data: contracts rendered with mis-configured templates.
Security impact: negligible (prototype access yields "[object Object]").
Business impact: confusing/incorrect contracts after a template typo.
Fix: (proposal) whitelist of sources (the editor's list), zod schema on fields (x 0..595, y 0..842, fontSize 6..48, textAlign enum), unknown → '' + warn.
Regression test: render template 10 and assert the page text contains none of "SHOULD-NOT-PRINT", "[object Object]", "Field".
```

```
BUG P14-017
Severity: LOW
Feature: Mixed languages and formats inside one document; template `language` ignored
Status: OPEN
Reproduction: any contract (a2_full_normal.pdf): start/end "September 11, 2026" (date-fns default en) vs contract date "10 september 2026" (nl locale), duration "7 days", open end "To be determined", price "€ 750,00" (Intl nl-NL) vs "€0.00" for null/0 (hard-coded); legacy contract adds "Nederland". Transport letters: "Type transport: Vehicle Swap" / "Tow" (en) next to "Aflevering", "Gepland", "Terughaling" (nl). Damage checks: header overlay "10/09/2026" (toLocaleDateString('en-GB')) next to "10-09-2026" (dd-MM-yyyy); damage_check_templates.language ('nl'|'en') is never read by the generator (C7: language=en produced identical output). The client UI is i18n-enabled (react-i18next), so an English UI still produces Dutch/English hybrid PDFs.
Expected: one locale per document, driven by the template's or customer's language.
Root cause: server/utils/pdf-generator.ts:846-850, 872-878, 1258-1270; server/pdf-damage-check-generator.ts:296, 410; server/routes.ts:6183-6186.
Fix: (proposal) central formatters (date/currency/labels) taking a locale; use template.language (damage checks) or customer.preferred_language.
Regression test: snapshot of prepareContractData for locale nl and en.
```

```
BUG P14-018
Severity: LOW
Feature: PDF background preview image generation fails on Windows (and mixes two canvas implementations)
Status: OPEN
Reproduction: p14-b-templates.cjs B5: POST /api/pdf-templates/12/background with a PDF → 200 but backgroundPreviewPath: null; server log: `⚠️ Failed to generate preview image: Error: Failed to convert PDF to PNG: Setting up fake worker failed: "Only URLs with a scheme in: file, data, and node are supported by the default ESM loader. On Windows, absolute paths must be valid file:// URLs. Received protocol 'c:'" at convertPdfToPng (server/utils/pdf-to-image.ts:103)`.
Expected: preview PNG generated on every platform; failure surfaced to the editor (it currently shows an empty canvas for PDF backgrounds).
Actual: on Windows every PDF background has no editor preview; the template still generates. Additionally pdfjs-dist 5 creates internal canvases with @napi-rs/canvas (present in node_modules) while pdf-to-image.ts renders into a `canvas`-package context; in this harness that combination threw "Image or Canvas expected" for any page containing an image — the app path was not reached because the worker error comes first, so this second issue is a code-reading observation.
Root cause: server/utils/pdf-to-image.ts:7-8 (`workerSrc = path.join(...)` instead of `pathToFileURL(...).href`), :1 (`import { createCanvas } from 'canvas'`).
Fix: (proposal) `GlobalWorkerOptions.workerSrc = pathToFileURL(...).href`; render with @napi-rs/canvas (or pass a CanvasFactory); return the failure to the client so the editor can say "no preview".
Regression test: upload a text-only PDF background in CI on Windows and assert backgroundPreviewPath is set and the PNG has non-white pixels.
```

```
BUG P14-019
Severity: LOW
Feature: Input validation gaps on PDF/template endpoints (500s, DB error leakage, accepted garbage)
Status: OPEN
Reproduction (all from p14-a/b/c/d scripts): POST /api/contracts/preview with startDate "not-a-date" or without dates → 500 {"error":"Invalid time value"}; with vehicleId "abc"/{$gt:0} → 500 {"error":"invalid input syntax for type integer: \"abc\""} (Postgres text leaked); same for generate-versioned; POST generate-report with transportIds ["abc",60] or [{id:60}] → 500; templateId "abc"/{a:1} → 500; GET /api/interactive-damage-checks/abc/pdf → 500 (NaN to Postgres, AM-002 family); PATCH /api/pdf-templates/:id with fields "{oops" or a 2 MB string → 404 "Failed to update template" (DB error swallowed, wrong status); PATCH name "" → 200 stored; PATCH fields null → 200 stored null (generation then "No template fields"); PATCH /api/transport-report-templates/:id fields "not json" → 200 stored (all reports with that template become blank); PATCH /api/barcode-label-templates/:id labelWidthMm -5, labelHeightMm 0, fields "garbage" → 200.
Expected: 400 with a message for every case; no driver error text in responses; name required; fields must be an array.
Root cause: routes.ts:5676-5765, 5798-5960, 7666-7700 (no zod on body), 7213 (no isNaN check), routes/pdf-templates.ts:194-266 (no schema, catch → 404), report-and-label-templates.ts:116 & :212 (jsonb accepts any JSON), database-storage.ts:2401-2528 (returns undefined on any error).
Fix: (proposal) zod schemas per route (ids positive ints, ISO dates, fields array of the editor shape), `parseIntParam` middleware (AM-002), map storage errors to 400/500 correctly.
Regression test: table-driven test of the payloads above asserting 400 and no "syntax for type" substring in bodies.
```

## 8. Re-confirmed existing bugs (new evidence only)

- **BUG-027** (contract regeneration creates N rows on 1 file): 16 `Contract (Unsigned)` rows for reservation 3466 all point at `contracts/AU140X/AU140X_contract_20260910.pdf`; the file content is whatever the *last* call produced (row 336's text file overwrote the valid contract of AU14BX, P14-002). New: 5 parallel calls (A10) produced duplicate version labels ("Contract (Unsigned) 12" twice) — the read-max-then-insert numbering at `routes.ts:5601-5620` races.
- **BUG-028** (default template has no fields → blank contracts): default template id 2 "gffg" still has `[]`; A1/A5 contracts contain zero text items (only the barcode image) — and the legacy fallback that would at least print data is itself broken (P14-003).
- **BUG-029** (transport report unretrievable): every one of the 12 transport_report rows created here (432-441, 446) returns 404 on `GET /api/documents/download/:id` (D1-D4 `download.status`), while the file exists under `audit-uploads/reports/`.
- **BUG-048** (templates accept malformed fields): template 10 with `'just-a-string'`, `42`, `null`, negative/NaN coordinates, fontSize 500 accepted with 201; visible effect documented in P14-016.
- **BUG-050** (template delete leaves background files): after `DELETE /api/pdf-templates/12`, `audit-uploads/templates/template_12_background.pdf` (the JS-carrying background) is still on disk; library files (`template_backgrounds` rows) are removed by cascade only in the DB.
- **BUG-066** (vehicle-diagram-templates without permission): limited user → `GET /api/vehicle-diagram-templates` 200 (362 B).
- **BUG-070** (arbitrary file delete via backgroundPath): not re-exercised (destructive); the transport template PATCH with `backgroundPath: "../../.env"` was rejected only because `createdAt` in the same body failed zod (B9) — the path itself is not validated.
- **BUG-088** (by-vehicle route shadowed): not re-tested (unchanged code).
- **BUG-119** (contract endpoints blank for TBD placeholder / maintenance block): not re-tested; noted that the transport side does refuse TBD transports (D5, 400).
- **BUG-153**: `prepareContractData` still uses `Math.ceil(abs(end-start)/day)` → "7 days" for 11..18 Sept; `rentalDays` on damage checks uses the same formula in three copies (routes.ts:6181, 6737, 6948) plus `endDate ? … : 0` in :7261 — four copies of the day count.
- **BUG-156** (unknown templateId → default layout): `templateId=999999`/`-1` → legacy generator (P14-003 output); `templateId=abc` → parseInt NaN → treated as "no templateId" → default template (blank).

## 9. Environment notes for the owner

- The audit DB's default damage-check template (id 1 "Auto-Generated Default") has only 7 canvas fields (an older stub), so PDFs produced through the interactive route with the default show almost nothing; `buildDefaultDamageCheckCanvasFields()` in the current code would produce a full layout — a fresh install behaves differently from this database.
- Uploaded header image in this DB is 1983×793 px (test image), which makes P14-009 very visible; a wide banner would hide the collision but not the root cause.
- Fixtures left in place for follow-up: interactive check 15 (20 kB notes, 300 markers, signatures), vehicle diagram template 2 (68 B PNG), transport 72 (TBD spare), templates 9/10/11/14 (contract), 3 (transport), 4 (damage check). Defaults were restored: pdf_templates → id 2, transport_report_templates → id 1, damage_check_templates → id 1.
