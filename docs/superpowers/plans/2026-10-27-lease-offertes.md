# Lease offertes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A menu module "Lease offertes" that replaces Kees's Excel lease calculation: quotes with variants, defaults
tab, dealer-quote upload read by AI, a customer PDF from an editable template (under Documenten), stored PDFs, list,
copy, history, recycle bin.

**Architecture:** One shared pure calculation module used by client (live) and server (authoritative). Own tables for
quotes, variants, files, settings and the template. Server routes in one `register*` module behind a new right. The
template follows the transport-report template pattern end to end. Client page `/lease-quotes` with two tabs; the
template editor is a new tab on `/documents`.

**Tech Stack:** TypeScript, React + wouter + TanStack Query + shadcn/ui, i18next (7 languages), Express, Drizzle ORM /
Postgres, pdf-lib, multer, Google Gemini (`@google/genai`), vitest + supertest (`server/__tests__/helpers/app`).

**Spec:** `docs/superpowers/specs/2026-10-27-lease-offertes-design.md` — read it first; this plan argues from it.

## Global Constraints

- All amounts excl. btw. Formulas exactly as the spec table; interest over the **full** purchase price; no other method.
- Sum unrounded lines; round only the displayed/stored total to cents. Excel case: purchase 17318, residual 10000,
  48 months, 9 %, ROB 275/yr, insurance 97.80, road tax 34, other 350/yr, margin 0, 20000 km/yr ⇒
  total 466.23, depreciation 152.46, interest 129.89, ROB 22.92, other 29.17, cost per km 0.28.
- Residual value is always manual input; km per year never changes it.
- Settings are copied into a quote at creation; later settings changes never alter existing quotes.
- Customer PDF shows only the sources listed in the spec "PDF-sjabloon" section. Never: depreciation, interest, margin,
  ROB, insurance, road tax, other costs, purchase price, residual value, other variants.
- Scanner results are never applied without the user clicking "Overnemen".
- New right `manage_lease_quotes` (label "Lease offertes"); not in any role preset except what `ROLE_PRESETS.admin`
  (ALL) already implies; admin passes by role. Template tab on Documenten uses existing `MANAGE_PDF_TEMPLATES`.
- Production migrations additive only (`startup-migration.js` `createTableIfNotExists`, `schema-columns.json` via
  `npm run schema:export`). Never drop or alter existing tables.
- Every UI string in all 7 locales (`nl,en,es,pt,it,ro,pl`); `client/src/__tests__/locale-parity.test.tsx` stays green.
  Dutch is the source text; other languages may be machine-translated (`scripts/auto-translate.js`).
- Status values stored: `concept | sent | accepted | rejected`. `expired` is derived, never stored: status in
  (`concept`,`sent`) and `validUntil` < today (Amsterdam date, use the existing office-date helper).
- Quote number `LO-<year>-<4-digit seq>`, sequence per calendar year of `quoteDate`, unique.
- Code comments and commits in English like the surrounding code; user-facing copy in plain Dutch.

## Review Focus

1. Looptijd 0 or empty, km per year 0 ⇒ no division by zero: depreciation/total show "—", cost per km `null`;
   save refused (400) when the chosen variant has term < 1. Test in Task 1 and Task 3.
2. Residual value higher than purchase price ⇒ negative depreciation is allowed (math stays the Excel's) but the UI
   shows a warning line "Restwaarde is hoger dan de aanschafwaarde". Test in Task 1 (`warnings`) and Task 8.
3. Dutch number input "17.318,50" and "9,5" ⇒ parsed as 17318.50 and 9.5 in the form (reuse the app's existing
   Dutch decimal parser if one exists — grep `parseDutch|parseDecimal` in `client/src/lib`; otherwise add one to
   `shared/lease-quote-calc.ts`). Test in Task 1.
4. Client sends a forged `totalPerMonth` ⇒ server ignores it and stores its own recalculation. Test in Task 3.
5. A generated PDF for a quote whose template has a field with a forbidden source (e.g. stored `"source":"interest"`)
   ⇒ the generator prints nothing for it. Test in Task 6.

---

## File Structure

| File | Responsibility |
|---|---|
| `shared/lease-quote-calc.ts` (+ `.test.ts`) | Pure calculation, input/output types, warnings, number parsing |
| `shared/lease-quotes.ts` (+ `.test.ts`) | Status constants, `displayStatus()`, quote number format, zod payload schemas, template source list |
| `shared/schema.ts` | Tables + insert schemas + types, new right, recycle-bin kind |
| `startup-migration.js` | `createTableIfNotExists` for the new tables + default settings row + default template row |
| `server/services/lease-quotes.ts` | DB logic: create/update (recalc), list/search, number allocation, copy, soft delete/restore snapshot |
| `server/routes/lease-quotes.ts` | `registerLeaseQuoteRoutes(app, deps)`: quotes, settings, files, scan, pdf |
| `server/utils/dealer-quote-scanner.ts` | Gemini read of a dealer quote |
| `server/routes/lease-quote-templates.ts` | Template CRUD + background upload (copy of transport-report template routes) |
| `server/utils/lease-quote-pdf.ts` | `prepareLeaseQuoteData`, `generateLeaseQuotePdf` |
| `client/src/pages/lease-quotes/index.tsx` | Page with tabs Offertes / Instellingen |
| `client/src/pages/lease-quotes/quote-list.tsx` | List, search, filter, paging, row actions |
| `client/src/pages/lease-quotes/quote-settings.tsx` | Defaults form |
| `client/src/pages/lease-quotes/quote-editor.tsx` | Editor dialog/screen |
| `client/src/pages/lease-quotes/variants-table.tsx` | Live comparison table |
| `client/src/pages/lease-quotes/dealer-scan-dialog.tsx` | Scan review dialog |
| `client/src/pages/documents/lease-quote-template-editor.tsx` | Template editor (copy of transport editor) |
| `client/src/locales/*/leaseQuotes.json` | New namespace, 7 languages |

---

### Task 1: Calculation module

**Files:**
- Create: `shared/lease-quote-calc.ts`, `shared/lease-quote-calc.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface LeaseCostInputs { purchasePrice: number; interestRatePercent: number; robPerYear: number;
    otherCostsPerYear: number; insurancePerMonth: number; roadTaxPerMonth: number; marginPerMonth: number; }
  export interface LeaseVariantInputs { termMonths: number; kmPerYear: number; residualValue: number; }
  export interface LeaseVariantResult { depreciation: number | null; interest: number; rob: number; insurance: number;
    roadTax: number; otherCosts: number; margin: number; totalPerMonth: number | null; costPerKm: number | null;
    robTotalOverTerm: number | null; warnings: LeaseWarning[]; }
  export type LeaseWarning = "residual_above_purchase" | "term_missing" | "km_missing";
  export function calculateLeaseVariant(costs: LeaseCostInputs, variant: LeaseVariantInputs): LeaseVariantResult;
  export function roundCents(n: number): number;
  export function parseDutchAmount(input: string): number | null;
  ```
  Results are **unrounded** (callers round for display with `roundCents`; `totalPerMonth` is the unrounded sum).

- [ ] **Step 1: Write failing tests** in `shared/lease-quote-calc.test.ts`:
  - `"matches Kees's Excel"`: Excel case from Global Constraints ⇒ `roundCents(totalPerMonth)=466.23`,
    `roundCents(depreciation)=152.46`, `roundCents(interest)=129.89`, `roundCents(rob)=22.92`,
    `roundCents(otherCosts)=29.17`, `roundCents(costPerKm)=0.28`, `robTotalOverTerm=1100`, `warnings=[]`.
  - `"margin adds to the total"`: same + margin 25 ⇒ total 491.23.
  - `"term 0 gives no depreciation and no total"`: term 0 ⇒ `depreciation=null`, `totalPerMonth=null`,
    warnings contains `"term_missing"`.
  - `"km 0 gives no cost per km"`: km 0 ⇒ `costPerKm=null`, warnings contains `"km_missing"`, total still 466.23.
  - `"residual above purchase warns"`: residual 20000 ⇒ warnings contains `"residual_above_purchase"`.
  - `"parseDutchAmount"`: `"17.318,50"`⇒17318.5, `"9,5"`⇒9.5, `"350"`⇒350, `"€ 1.100"`⇒1100, `""`⇒null, `"abc"`⇒null.
- [ ] **Step 2: Run** `npx vitest run shared/lease-quote-calc.test.ts` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** in `shared/lease-quote-calc.ts` with the spec formulas. Before writing `parseDutchAmount`,
  grep `client/src/lib` and `shared` for an existing Dutch number parser and re-export it if present.
- [ ] **Step 4: Run** same command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(lease-quotes): shared lease price calculation`.

### Task 2: Schema, right, migration

**Files:**
- Modify: `shared/schema.ts` (tables near the other template tables; right in `UserPermission` :79-154;
  `DELETED_RECORD_KINDS` add `"lease_quote"`), `shared/permission-labels.ts`, `shared/page-access.ts`,
  `shared/permission-dependencies.ts` (if a dependency entry is needed: none — the right stands alone),
  `startup-migration.js`, `schema-columns.json` (regenerate)
- Create: `shared/lease-quotes.ts`, `shared/lease-quotes.test.ts`
- Test: `shared/page-access.test.ts`, `shared/permission-dependencies.test.ts` (must stay green)

**Interfaces:**
- Produces tables (Drizzle names → SQL names):
  - `leaseQuoteSettings` → `lease_quote_settings`: `id` serial, `interestRatePercent` numeric(6,3) default 9,
    `marginPerMonth` numeric(10,2) default 0, `robPerYear` numeric(10,2) default 275, `otherCostsPerYear`
    numeric(10,2) default 350, `excessKmPrice` numeric(8,4) default 0, `shortfallKmPrice` numeric(8,4) default 0,
    `validityDays` integer default 30, `updatedAt`, `updatedBy`. One row, seeded by the migration.
  - `leaseQuotes` → `lease_quotes`: `id`, `quoteNumber` text unique notNull, `status` text default 'concept',
    `quoteDate` date notNull, `validUntil` date notNull, `customerId` integer FK customers null,
    `prospectName`, `prospectCompany`, `prospectEmail`, `prospectPhone`, `vehicleMake`, `vehicleModel`,
    `vehicleTrim`, `licensePlate`, `dealerName`, `deliveryTime`, `vehicleNotes`, `purchasePrice` numeric(12,2),
    `priceBreakdown` jsonb (`{catalogPrice?, options?, discount?, bpm?, deliveryCosts?, totalExclVat?, totalInclVat?}`),
    the seven cost inputs of `LeaseCostInputs` (except purchasePrice) plus `excessKmPrice`, `shortfallKmPrice`,
    `internalNotes`, `createdAt`, `updatedAt`, `createdBy`, `updatedBy`.
  - `leaseQuoteVariants` → `lease_quote_variants`: `id`, `quoteId` FK cascade, `position` int, `termMonths` int,
    `kmPerYear` int, `residualValue` numeric(12,2), `isChosen` boolean, `totalPerMonth` numeric(12,2) (server-calculated).
  - `leaseQuoteFiles` → `lease_quote_files`: `id`, `quoteId` FK cascade, `kind` text (`'dealer' | 'generated'`),
    `fileName`, `filePath` (relative to uploads), `fileSize`, `contentType`, `createdAt`, `createdBy`.
  - `leaseQuoteTemplates` + `leaseQuoteTemplateBackgrounds`: same columns as `transportReportTemplates` /
    `transportReportTemplateBackgrounds` (`shared/schema.ts:1638-1675`).
- Produces in `shared/lease-quotes.ts`:
  ```ts
  export const LEASE_QUOTE_STATUSES = ["concept", "sent", "accepted", "rejected"] as const;
  export type LeaseQuoteDisplayStatus = (typeof LEASE_QUOTE_STATUSES)[number] | "expired";
  export function displayStatus(status: string, validUntil: string, today: string): LeaseQuoteDisplayStatus;
  export function formatQuoteNumber(year: number, seq: number): string; // "LO-2026-0001"
  export const LEASE_QUOTE_TEMPLATE_SOURCES: readonly string[]; // exact list below
  export const leaseQuotePayloadSchema: z.ZodType; // body of POST/PATCH /api/lease-quotes
  export function isEditWarningStatus(status: string): boolean; // sent | accepted
  ```
  `LEASE_QUOTE_TEMPLATE_SOURCES` = `quoteNumber, quoteDate, validUntil, customerName, customerContact,
  customerAddress, customerPostalCode, customerCity, customerEmail, vehicleMake, vehicleModel, vehicleTrim,
  licensePlate, deliveryTime, termMonths, kmPerYear, monthlyPriceExclVat, excessKmPrice, shortfallKmPrice`, plus the
  company-detail and landlord-signature sources that `CONTRACT_FIELD_SOURCES` (`server/utils/pdf-generator.ts:106`)
  already offers (copy their keys; check the file).
- Right: `MANAGE_LEASE_QUOTES: 'manage_lease_quotes'`; label `"Lease offertes"`; page-access row
  `{ path: "/lease-quotes", anyOf: [P.MANAGE_LEASE_QUOTES] }`.

- [ ] **Step 1: Write failing tests** in `shared/lease-quotes.test.ts`: `displayStatus("sent","2026-10-01","2026-10-27")
  ="expired"`, `("accepted","2026-10-01","2026-10-27")="accepted"`, `("concept","2026-10-27","2026-10-27")="concept"`;
  `formatQuoteNumber(2026,1)="LO-2026-0001"`; `LEASE_QUOTE_TEMPLATE_SOURCES` contains none of
  `["purchasePrice","residualValue","interest","depreciation","margin","rob","insurance","roadTax","otherCosts"]`;
  payload schema rejects a variant list with zero or two `isChosen: true`.
- [ ] **Step 2: Run** `npx vitest run shared/lease-quotes.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `shared/lease-quotes.ts`, the tables, the right, label, page-access row.
- [ ] **Step 4: Migration.** In `startup-migration.js` add `createTableIfNotExists` steps (pattern :1731-1781) for all
  six tables with FKs and a unique index on `quote_number`; seed one `lease_quote_settings` row and one default
  `lease_quote_templates` row (`is_default = true`, name "Standaard lease offerte", fields laid out on A4 for the
  sources above). Run `npm run schema:export`.
- [ ] **Step 5: Run** `npx vitest run shared` and `npx tsc` — Expected: PASS, including page-access and
  permission-dependencies tests (add `/lease-quotes` to `PAGES_WITHOUT_SITES` in
  `shared/permission-dependencies.test.ts` if that test asks for it).
- [ ] **Step 6: Commit** `feat(lease-quotes): tables, right and migration`.

### Task 3: Quote service and routes

**Files:**
- Create: `server/services/lease-quotes.ts`, `server/routes/lease-quotes.ts`, `server/__tests__/lease-quotes.test.ts`
- Modify: `server/routes.ts` (import + `registerLeaseQuoteRoutes(app, routeDeps)` next to `registerFineRoutes` :547),
  `server/middleware/body-limits.ts` and `server/middleware/stored-path-guard.ts` (add `/api/lease-quotes` prefixes
  as the transport templates are listed), `server/middleware/audit.ts` (`TRACKED_RESOURCES` entry `lease-quotes` with
  `load` and `label` = quote number + customer), `server/routes/users.ts` `HISTORY_PERMISSIONS` (`lease_quote` ⇒
  `MANAGE_LEASE_QUOTES`), recycle-bin service (new kind `lease_quote`: follow the `fine` kind through every place that
  switches on kinds — grep `"fine"` in `server/services` and `server/routes`)

**Interfaces:**
- Consumes: Task 1 `calculateLeaseVariant`, `roundCents`; Task 2 tables, `leaseQuotePayloadSchema`, `displayStatus`,
  `formatQuoteNumber`.
- Produces routes (all `requireAuth` + `hasPermission(UserPermission.MANAGE_LEASE_QUOTES)`):
  - `GET /api/lease-quotes?search=&status=&page=&pageSize=` ⇒ `{ rows: LeaseQuoteListRow[], total }`;
    row = `{ id, quoteNumber, quoteDate, validUntil, status, displayStatus, customerName, vehicle, licensePlate,
    monthlyPrice }`. Search matches quote number, customer display name (`customerDisplayName()`), prospect
    name/company, make, model, plate (plate compared without dashes, case-insensitive). `status=expired` filters on
    the derived status.
  - `GET /api/lease-quotes/:id` ⇒ quote + `variants` + `files`.
  - `POST /api/lease-quotes` ⇒ 201; empty body allowed: creates concept with settings copied in, today, validUntil =
    today + `validityDays`, one variant (48 months, 20000 km, residual 0, chosen).
  - `PATCH /api/lease-quotes/:id` ⇒ replaces fields and variant list; server recalculates every variant's
    `totalPerMonth` (rounded to cents) and ignores any client total; 400 when the chosen variant has term < 1.
  - `POST /api/lease-quotes/:id/copy` body `{ withAttachments: boolean }` ⇒ 201 new quote: new number, status concept,
    today, new validUntil, all fields and variants; with `withAttachments` the `dealer` files are copied to new files
    on disk; `generated` files never.
  - `DELETE /api/lease-quotes/:id` ⇒ recycle bin snapshot (quote + variants + file rows), then delete.
  - `GET /api/lease-quotes/settings`, `PUT /api/lease-quotes/settings`.
  Register `/settings` before `/:id`.
- Number allocation: inside a transaction, `max(seq)` for the year with a row lock (or a retry on unique violation);
  two parallel creates must get different numbers.

- [ ] **Step 1: Write failing tests** (`server/__tests__/lease-quotes.test.ts`, style of `b45-tape-template.test.ts`,
  fixture prefix `FIXT-lq-`): `"a user without the right gets 403"`; `"create copies the settings and numbers per year"`
  (two creates ⇒ consecutive `LO-<year>-` numbers, interest = settings value); `"changing settings leaves existing
  quotes alone"`; `"server recalculates and ignores a forged total"` (PATCH with `totalPerMonth: 1` on a variant ⇒
  stored 466.23 for the Excel case); `"chosen variant with term 0 is refused"` ⇒ 400; `"copy asks about attachments"`
  (with `withAttachments:false` ⇒ no files; `true` ⇒ dealer file copied with a different `filePath`, generated not);
  `"search finds by plate without dashes"`; `"expired filter"`; `"delete puts it in the recycle bin and restore brings
  variants back"`; `"history lists the update"` (GET `/api/audit-logs/resource/lease_quote/:id`).
- [ ] **Step 2: Run** `npx vitest run server/__tests__/lease-quotes.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** service and routes.
- [ ] **Step 4: Run** the test plus `server/__tests__/audit-router-coverage.test.ts`, `fix-i-permission-matrix.test.ts`
  (note from memory: fix-i was already red on `/api/manual` before this work — compare against main, do not fix that),
  `c-07-purge.test.ts`, `b-15-recycle-bin.test.ts` — Expected: new test PASS, others no new failures.
- [ ] **Step 5: Commit** `feat(lease-quotes): quote service and API`.

### Task 4: Dealer quote upload and scanner

**Files:**
- Create: `server/utils/dealer-quote-scanner.ts`, `server/__tests__/lease-quote-files.test.ts`
- Modify: `server/routes/lease-quotes.ts`, `shared/lease-quotes.ts` (`ParsedDealerQuote` type)

**Interfaces:**
- Produces:
  ```ts
  export interface ParsedDealerQuote { dealerName: string|null; make: string|null; model: string|null; trim: string|null;
    catalogPrice: number|null; options: number|null; discount: number|null; bpm: number|null; deliveryCosts: number|null;
    totalExclVat: number|null; totalInclVat: number|null; deliveryTime: string|null; quoteDate: string|null;
    validUntil: string|null; }
  export function processDealerQuoteWithAI(filePath: string, mimeType: string): Promise<ParsedDealerQuote>;
  export function suggestedPurchasePrice(p: ParsedDealerQuote): { amount: number | null; onlyInclVat: boolean };
  ```
  `suggestedPurchasePrice`: `totalExclVat` when present (assumed to include BPM and delivery costs, as the spec
  says); otherwise `amount=null, onlyInclVat = totalInclVat != null`. Never divides by 1.21 itself.
- Routes: `POST /api/lease-quotes/:id/files` (multipart `file`, PDF/PNG/JPG, 10 MB, `createSecureMulterFilter("document")`
  + `validateAfterUpload`, stored under `uploads/lease-quotes/<id>/`, kind `dealer`) ⇒ file row;
  `POST /api/lease-quotes/:id/files/:fileId/scan` ⇒ `{ parsed: ParsedDealerQuote, suggestion }` — does **not**
  change the quote; `GET /api/lease-quotes/:id/files/:fileId` ⇒ streams the file (`assertWithinUploads`);
  `DELETE /api/lease-quotes/:id/files/:fileId`. Scanner errors ⇒ 502 `{ code: "LEASE_SCAN_FAILED" }`, file kept.
  Make the scanner injectable for tests (same as `server/services/invoice-inbox/importer.ts` injects its scanner).

- [ ] **Step 1: Write failing tests**: `suggestedPurchasePrice` cases (excl present ⇒ that amount; only incl ⇒
  `{amount:null, onlyInclVat:true}`); route tests with a stub scanner: upload stores a `dealer` row and the file lies
  under `uploads/lease-quotes/<id>/`; scan returns the stub's values and the quote's `purchasePrice` is unchanged;
  scanner throwing ⇒ 502 and file row still there; an `.exe` renamed `.pdf` is refused 400; download of a file id from
  another quote ⇒ 404.
- [ ] **Step 2: Run** `npx vitest run server/__tests__/lease-quote-files.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** scanner (copy the structure of `server/utils/fine-scanner.ts`: `GEMINI_MODELS`, `PROMPT`,
  `RESPONSE_SCHEMA`; prompt in English asking for the fields above, amounts as numbers in euro, "null when not
  printed") and the routes.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(lease-quotes): dealer quote upload and AI read`.

### Task 5: Template type under Documenten

**Files:**
- Create: `server/routes/lease-quote-templates.ts`, `client/src/pages/documents/lease-quote-template-editor.tsx`,
  `server/__tests__/lease-quote-templates.test.ts`
- Modify: every place listed in spec "Wat er vastligt aan de techniek → Sjabloon": `server/storage.ts` +
  `server/database-storage.ts` (or query the tables directly from the route module — follow whichever the transport
  routes use), `server/routes.ts` (register), `server/middleware/body-limits.ts`, `server/middleware/stored-path-guard.ts`,
  `server/services/recycle-bin-purge.ts` (path columns in `EXTRA_LIVE_COLUMNS`), `client/src/pages/documents/index.tsx`
  (new tab `lease-quote-templates` inside `<RequiresPermission anyOf={[MANAGE_PDF_TEMPLATES]}>`, query, dialog with
  `useUnsavedChangesGuard`), `client/src/locales/*/documents.json`, `shared/document-types.ts` if it lists template
  kinds, `server/__tests__/wave11-template-paths.test.ts`, `client/src/pages/documents/__tests__/other-editors-unsaved.test.tsx`

**Interfaces:**
- Consumes: Task 2 tables, `LEASE_QUOTE_TEMPLATE_SOURCES`.
- Produces routes `GET/POST /api/lease-quote-templates`, `GET/PATCH/DELETE /api/lease-quote-templates/:id`,
  `POST /api/lease-quote-templates/:id/background`, background library routes, `GET /api/lease-quote-templates/:id/preview`
  (PDF with sample data) — same shapes as the transport-report template routes in
  `server/routes/report-and-label-templates.ts`; field validation with `templateFieldsSchema`; additionally a field
  whose `source` is not in `LEASE_QUOTE_TEMPLATE_SOURCES` ⇒ 400.
- Editor: copy `transport-report-template-editor.tsx`, replace its source key list with
  `LEASE_QUOTE_TEMPLATE_SOURCES`, labels from `documents.json` `leaseQuoteTemplateEditor.dataSourceOptions.<key>`.
  One A4 page. Background PDF/PNG/JPG as the contract editor accepts (check what the transport editor accepts; if PNG/JPG
  only, keep that and say so in the commit).

- [ ] **Step 1: Write failing tests**: CRUD works for `MANAGE_PDF_TEMPLATES` and 403 without; a field with source
  `"interest"` ⇒ 400; background upload of a script disguised as PNG ⇒ 400; preview returns `%PDF-`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** server routes and client tab + editor; locale keys in all 7 languages.
- [ ] **Step 4: Run** the new test, `wave11-template-paths.test.ts`, `c-07-purge.test.ts`,
  `other-editors-unsaved.test.tsx` (`npx vitest run -c vitest.client.config.ts client/src/pages/documents`),
  `locale-parity.test.tsx` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(lease-quotes): editable PDF template under Documenten`.

### Task 6: PDF generation and stored PDFs

**Files:**
- Create: `server/utils/lease-quote-pdf.ts`, `server/__tests__/lease-quote-pdf.test.ts`
- Modify: `server/routes/lease-quotes.ts`, `server/utils/preview-sample.ts` (sample data for the template preview)

**Interfaces:**
- Produces:
  ```ts
  export function prepareLeaseQuoteData(quote, chosenVariant, customer | null, company): Record<LeaseQuoteTemplateSource, string>;
  export function generateLeaseQuotePdf(data: Record<string,string>, template): Promise<Uint8Array>;
  ```
  `prepareLeaseQuoteData` returns **only** keys of `LEASE_QUOTE_TEMPLATE_SOURCES`; amounts formatted Dutch
  (`€ 466,23`, km prices with as many decimals as stored, at least 2); customer fields from the linked customer
  (display name via `customerDisplayName()`) or from the prospect fields. The generator draws only fields whose
  source is in that list (drawing pattern: `drawTransportReportPage`, `server/utils/pdf-generator.ts:1173`).
- Route: `POST /api/lease-quotes/:id/pdf` ⇒ generates with the default lease template, stores the file under
  `uploads/lease-quotes/<id>/` as kind `generated` (name `<quoteNumber>-<yyyy-mm-dd-HHmm>.pdf`), returns the file row;
  the client then downloads it via the file route of Task 4. 409 `{code:"LEASE_NO_TEMPLATE"}` when no template exists.
  Add the route to `TRACKED_READS` if it is treated as a read there; otherwise it is a POST and audited automatically.

- [ ] **Step 1: Write failing tests**: `prepareLeaseQuoteData` for the Excel case ⇒ `monthlyPriceExclVat="€ 466,23"`,
  keys ⊆ `LEASE_QUOTE_TEMPLATE_SOURCES`, no value equals `"€ 129,89"` or `"€ 10.000,00"`; a template row inserted
  directly in the DB with an extra field `source:"interest"` ⇒ the PDF text (extract with the existing
  `extractPdfTextRows` helper in `server/utils/invoice-text-rows.ts`) does not contain `129`; route stores a
  `generated` file row and two calls give two rows; prospect without customer ⇒ customerName = prospect company or
  name.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(lease-quotes): customer PDF and stored copies`.

### Task 7: Menu, page, list and settings tab

**Files:**
- Create: `client/src/pages/lease-quotes/index.tsx`, `quote-list.tsx`, `quote-settings.tsx`,
  `client/src/locales/{nl,en,es,pt,it,ro,pl}/leaseQuotes.json`, `client/src/pages/lease-quotes/__tests__/quote-list.test.tsx`
- Modify: `client/src/App.tsx` (`<ProtectedRoute path="/lease-quotes" component={LeaseQuotesPage} />`),
  `client/src/components/sidebar-nav.tsx` (`{ href: "/lease-quotes", labelKey: "leaseQuotes", icon: "request_quote" }`
  after reports; add the icon to `getNavIcon`), `client/src/locales/*/nav.json` (`"leaseQuotes": "Lease offertes"`),
  `client/src/i18n.ts` (`ns` list)

**Interfaces:**
- Consumes: Task 3 routes, Task 2 `displayStatus` labels.
- List: columns and actions from the spec "Offertelijst"; paging with the app's existing `Pager` component; search
  debounced; status filter including Verlopen; row click opens the editor (Task 8); Kopiëren opens a dialog
  "Bijlagen (dealerofferte) ook kopiëren?" with Ja / Nee / Annuleren ⇒ `POST /copy {withAttachments}`; Verwijderen
  with confirm, then a toast that it is in the prullenbak.
- Settings tab: the six defaults + validity days, Dutch number inputs (`parseDutchAmount`), a line "Geldt voor nieuwe
  offertes; bestaande offertes houden hun eigen waarden."

- [ ] **Step 1: Write failing tests** (jsdom, style of `client/src/pages/expenses/__tests__/expenses-index.test.tsx`):
  list renders rows and the Verlopen badge from `displayStatus`; copy dialog sends `withAttachments:true` on Ja and
  `false` on Nee; settings form sends `interestRatePercent: 9.5` when typing `9,5`.
- [ ] **Step 2: Run** `npx vitest run -c vitest.client.config.ts client/src/pages/lease-quotes` — Expected: FAIL.
- [ ] **Step 3: Implement**; locale keys in all 7 languages.
- [ ] **Step 4: Run** the test, `sidebar-nav-page-access.test.tsx`, `locale-parity.test.tsx` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(lease-quotes): menu, list and settings tab`.

### Task 8: Quote editor with live variants

**Files:**
- Create: `client/src/pages/lease-quotes/quote-editor.tsx`, `variants-table.tsx`, `dealer-scan-dialog.tsx`,
  `client/src/pages/lease-quotes/__tests__/quote-editor.test.tsx`
- Modify: `client/src/components/audit/record-history.tsx` (`RecordHistoryResourceType` + client
  `HISTORY_PERMISSIONS`), `client/src/lib/audit-action-label.ts` (`RESOURCES`), locale labels for history

**Interfaces:**
- Consumes: Task 1 (live calculation), Task 3 (GET/PATCH), Task 4 (files, scan), Task 6 (PDF).
- Editor sections exactly as spec "Offerte openen / maken" 1-6. Customer picker reuses the existing customer search
  component used in reservations (grep `CustomerSelect|customer-search` in `client/src/components`).
- Variants table: columns = variants; input rows term / km / residual; result rows per `LeaseVariantResult` rounded
  with `roundCents`; buttons toevoegen / dupliceren / verwijderen (not the last one) / "Deze naar de klant" (radio
  behaviour). Warnings from `warnings` shown under the column in plain Dutch:
  `residual_above_purchase` ⇒ "Restwaarde is hoger dan de aanschafwaarde", `term_missing` ⇒ "Vul een looptijd in",
  `km_missing` ⇒ "Vul km per jaar in voor de prijs per km". Horizontal scroll on narrow screens.
- Save: when the stored status is `sent` or `accepted` (`isEditWarningStatus`), first a confirm
  "Deze offerte is al verstuurd. Toch wijzigen?" / "…al geaccepteerd…" ⇒ only on Ja the PATCH goes.
  Unsaved-changes guard like the other editors (`useUnsavedChangesGuard`).
- Scan dialog: after upload, call scan; show each parsed field with a checkbox "overnemen" (checked when not null)
  and the suggested purchase price; when `onlyInclVat`, show "De dealer noemt alleen een bedrag incl. btw. Vul de
  aanschafwaarde excl. btw zelf in." and leave purchase price unchecked/empty. "Overnemen" writes only checked fields
  into the form (not saved yet). Scan failure ⇒ "Uitlezen lukte niet. Het bestand is bewaard; vul de gegevens zelf in."
- Files list: dealer files and generated PDFs (date, by whom), open/download, delete dealer files.
- Buttons Opslaan, PDF maken (saves first if dirty, then POST pdf, then downloads), Kopiëren (same dialog as Task 7),
  Geschiedenis (`record-history-dialog` with resource `lease_quote`).

- [ ] **Step 1: Write failing tests**: typing the Excel case shows "€ 466,23" in the chosen column without saving;
  changing residual to 10500 updates the total live (Excel: (17318−10500)/48 + … ⇒ 455,81); "Deze naar de klant" on
  column 2 leaves exactly one chosen; saving a `sent` quote shows the confirm and sends no PATCH on Nee; scan dialog
  with `onlyInclVat` leaves purchase price unchanged after Overnemen; unchecked fields are not applied.
- [ ] **Step 2: Run** `npx vitest run -c vitest.client.config.ts client/src/pages/lease-quotes` — Expected: FAIL.
- [ ] **Step 3: Implement**; locale keys in all 7 languages.
- [ ] **Step 4: Run** the tests, `p5-record-history-labels.test.tsx`, `locale-parity.test.tsx`, `npx tsc` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(lease-quotes): editor with live variants and dealer scan`.

### Task 9: Handleiding and end-to-end check

**Files:**
- Modify: the in-app manual chapter list and content (see memory note "Handleiding screenshots": `scripts/handleiding`
  pipeline, plain Dutch, a picture at every step); `client/src/locales/*` manual keys if the manual is translated.

- [ ] **Step 1:** Add a chapter "Lease offertes": nieuwe offerte maken, dealerofferte uploaden en controleren,
  varianten vergelijken, de variant voor de klant kiezen, PDF maken, offerte kopiëren, Instellingen, sjabloon aanpassen
  onder Documenten. Screenshots via the existing pipeline.
- [ ] **Step 2:** Run the app (`run` skill / preview) as admin: make the Excel case and check 466,23; make a PDF and
  check it shows only the allowed data; log in as a non-admin user without the right ⇒ no menu item, `/lease-quotes`
  refused.
- [ ] **Step 3:** Run the full suites `npm test` and `npx vitest run -c vitest.client.config.ts` and `npx tsc` —
  Expected: no new failures compared with main.
- [ ] **Step 4: Commit** `docs(handleiding): lease offertes`.
