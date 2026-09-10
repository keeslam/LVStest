# Phase 15 — File handling

2026-09-10, tested against `http://localhost:5001` / db `lvs_audit`, `UPLOADS_DIR=C:\Users\kees lam\Desktop\LVStest-main\audit-uploads`. Admin session (`admin`/`admin123`, logged in once per script, unique `fakeIp` per session). All created records prefixed `AUDIT-`, plate `AU-15A-X` (vehicle id 1832). Fixtures under `docs/audit/wip/scripts/files/p15/` (gitignored). Scripts: `docs/audit/wip/scripts/p15-a-docs.cjs`, `p15-b-endpoints.cjs`, `p15-c-traversal.cjs` (+ `.out.json` captures). The shared server stayed up the whole phase (`/health` OK before, during, after — uptime climbed monotonically, no restart). Every temporary file written outside the DB was deleted afterwards (see Cleanup).

The server runs on **Windows** with `UPLOADS_DIR` pointing **outside** the repo (exactly the production/Coolify shape per the memory notes) — this configuration is what exposes the path-resolution bugs below; several routes assume `process.cwd()/uploads`.

## Upload endpoint inventory

| # | Route | Auth / permission | Multer storage | Limit / files | fileFilter | post-upload magic-byte check | Stored path column |
|---|-------|-------------------|----------------|---------------|-----------|------------------------------|--------------------|
| 1 | `POST /api/documents` | `MANAGE_DOCUMENTS` | disk `<UPLOADS>/<plate>/<type>/` or `contracts/<plate>/` | 25 MB / 1 | `createSecureMulterFilter('document')` | `validateAfterUpload` ✓ | `documents.file_path` (server-set) |
| 2 | `POST /api/reservations` | `MANAGE_RESERVATIONS` | disk `<UPLOADS>/<plate>/damage_checks/` | 10 MB / 1 | `'document'` | — (none on create) | `documents` via damage-check |
| 3 | `PATCH /api/reservations/:id` | `MANAGE_RESERVATIONS` | same | 10 MB / 1 | `'document'` | — | same |
| 4 | `PATCH /api/vehicles/:id/fuel-status` | `MANAGE_VEHICLES` | disk `<UPLOADS>/<plate>/fuel_receipt/` | 25 MB / 1 | `'document'` | `validateAfterUpload` ✓ | `vehicles.fuel_refill_receipt` (`uploads/...`) |
| 5 | `POST /api/expenses` | `MANAGE_EXPENSES` | disk `<UPLOADS>/<plate>/receipts/` | 25 MB / 1 | `'document'` | `validateAfterUpload` ✓ | `expenses.receipt_file_path` |
| 6 | `POST /api/expenses/with-receipt` | **none (BUG-003)** | same | 25 MB / 1 | `'document'` | `validateAfterUpload` ✓ | same |
| 7 | `PATCH /api/expenses/:id` | **none (BUG-003)** | same | 25 MB / 1 | `'document'` | ✓ | same |
| 8 | `PATCH /api/expenses/:id/with-receipt` | **none (BUG-003)** | same | 25 MB / 1 | `'document'` | ✓ | same |
| 9 | `POST /api/expenses/scan` | `MANAGE_EXPENSES` | disk `<UPLOADS>/temp/` → `invoices/<hash>.pdf` | 25 MB / 1 | `'pdf'` | `validateAfterUpload('pdf')` ✓ | (AI scan only) |
| 10 | `POST /api/customers/:customerId/drivers` | `MANAGE_CUSTOMERS` | disk `<UPLOADS>/drivers/` | 10 MB / 1 | `'document'` | `validateAfterUpload` ✓ | `drivers.license_file_path` (server-set, omitted from schema) |
| 11 | `PATCH /api/drivers/:id` | `MANAGE_CUSTOMERS` | same | 10 MB / 1 | `'document'` | ✓ | same |
| 12 | `POST /api/pdf-templates/:id/background` | `MANAGE_PDF_TEMPLATES` | **memory** → `<UPLOADS>/templates/` | 10 MB / 1 | `'document'` | `validateFileBuffer` ✓ | `pdf_templates.background_path` |
| 13 | `POST /api/pdf-templates/:id/backgrounds` | `MANAGE_PDF_TEMPLATES` | memory → `templates/` | 10 MB / 1 | `'document'` | `validateFileBuffer` ✓ | `template_backgrounds` |
| 14 | `POST /api/damage-check-templates/:id/background` | `MANAGE_DAMAGE_CHECKS` | memory → `damage-check-templates/` | 10 MB / 1 | `'document'` + ext must be jpg/png | `validateFileBuffer` ✓ | `background_path` |
| 15 | `POST /api/damage-check-templates/:id/backgrounds` | `MANAGE_DAMAGE_CHECKS` | memory | 10 MB / 1 | `'document'`+ext | ✓ | `background_path` |
| 16 | `POST /api/damage-check-templates/upload-photo` | `MANAGE_DAMAGE_CHECKS` | disk `<UPLOADS>/vehicle-diagrams/` | 10 MB / 1 | `'image'` | — | returns `path`, `/uploads/...` url |
| 17 | `POST /api/transport-report-templates/:id/background` | `MANAGE_PDF_TEMPLATES` | memory → `transport-report-templates/` | 10 MB / 1 | `'document'`+ext jpg/png | `validateFileBuffer` ✓ | `background_path` |
| 18 | `POST /api/transport-report-templates/:id/backgrounds` | `MANAGE_PDF_TEMPLATES` | memory | 10 MB / 1 | `'document'`+ext | ✓ | `background_path` |
| 19 | `POST /api/vehicle-diagram-templates` | **`requireAuth` only (BUG-066)** | disk `<UPLOADS>/vehicle-diagrams/` | 10 MB / 1 | `'image'` | `validateAfterUpload('image')` ✓ | `diagram_path` |
| 20 | `PATCH /api/vehicle-diagram-templates/:id` | **`requireAuth` only** | same | 10 MB / 1 | `'image'` | ✓ | `diagram_path` |
| 21 | `POST /api/damage-check-fields/header` | `requireAuth`+`requireAdmin` | disk `<UPLOADS>/damage-check/` | 5 MB / 1 | `'image'` | — | `app_settings` value |
| 22 | `POST /api/backups/upload` | `MANAGE_BACKUPS` | disk `<UPLOADS>/temp/` → `backups/` | 1 GB / 1 | `'backup'` | `validateAfterUpload('backup')` ✓ | filesystem (`backups/`) |
| 23 | `POST /api/backups/restore-data` | `MANAGE_BACKUPS` | disk temp | 1 GB / 1 | `'backup'` | ✓ | tar/psql (BUG-069) |
| 24 | `POST /api/backups/restore-code` | `MANAGE_BACKUPS` | disk temp | 1 GB / 1 | `'backup'` | ✓ | tar over cwd (BUG-069) |
| 25 | `POST /api/backups/restore-files` | `MANAGE_BACKUPS` | disk temp | 1 GB / 1 | `'backup'` | ✓ | tar over cwd (BUG-069) |
| 26 | `POST /api/fines/scan` | `canManage` | disk `<UPLOADS>/fines/` | 10 MB / 1 | `'document'` | `validateAfterUpload` ✓ | (AI scan only) |
| 27 | `POST /api/fines` | `canManage` | disk `fines/` | 10 MB / 1 | `'document'` | ✓ | `fines.letter_file_path` |
| 28 | `POST /api/fines/:id/letter` | `canManage` | disk `fines/` | 10 MB / 1 | `'document'` | ✓ | `fines.letter_file_path` |
| 29 | `POST /api/fines/imports/upload` | `canManage` | **memory** | 20 MB / 1 | **none** (ext regex on originalname after) | — (XML/CSV parsed) | `fine_import_files.raw_path` (server-set) |
| 30 | `POST /api/portal/requests` | portal user + `canSubmitRequests` | disk `<UPLOADS>/portal-requests/` | 10 MB / **5** | `'document'` | `validateAfterUpload` ✓ | `portal_request_attachments.file_path` (server-set) |
| 31 | `POST /api/portal/drivers/:id/license` | portal + manageDrivers | disk `<UPLOADS>/drivers/` | 10 MB / 1 | `'document'` | `validateAfterUpload` ✓ | `drivers.license_file_path` (server-set) |

## File-serving endpoint inventory

| # | Route | Auth | Path resolution | Containment | Content-Type / Disposition | Notes |
|---|-------|------|-----------------|-------------|----------------------------|-------|
| 1 | `GET /api/documents/view/:id` | `MANAGE_DOCUMENTS` | `path.join(cwd, filePath)` (+`uploads/` fallback) | **none (BUG-012)** | DB `contentType`, `inline`, nosniff(global) | works with UPLOADS_DIR (`..\` kept by join) |
| 2 | `GET /api/documents/download/:id` | `MANAGE_DOCUMENTS` | same | **none (BUG-012)** | DB `contentType`, `attachment` | |
| 3 | `GET /api/expenses/:id/receipt` | **none (BUG-003/060)** | `path.resolve(receiptFilePath)` | **none** | sendFile infers | arbitrary read (BUG-060) |
| 4 | `GET /api/drivers/:id/license` | `VIEW/MANAGE_CUSTOMERS` | `path.resolve(cwd, licenseFilePath)` | `startsWith(cwd/uploads)` | `res.sendFile` (ext-inferred) | **BROKEN with UPLOADS_DIR → 403 (F15-001)** |
| 5 | `GET /api/vehicle-diagram-templates/:id/image` | `requireAuth` | `path.join(cwd, diagramPath)` | **none** | `res.sendFile` | read side of BUG-066/070; no write primitive today |
| 6 | `GET /api/pdf-templates/:id/preview` | `MANAGE_PDF_TEMPLATES` | (generates) | n/a | `application/pdf` inline | |
| 7 | `GET /api/transport-report-templates/:id/preview` | `MANAGE_PDF_TEMPLATES` | (generates) | n/a | pdf | |
| 8 | `GET /api/fines/:id/letter` | `canView` | `resolveDocumentFilePath` | ✓ (BUG-098 symlink caveat) | pdf/octet inline | |
| 9 | `GET /api/fines/imports/:id/file` | `canView` | `path.resolve(cwd, rawPath)` | none, but rawPath server-set | `res.download` | |
| 10 | `GET /api/backups/download/:filename` | `MANAGE_BACKUPS` | service join(backupPath,name) | blocks `..` and `/` (BUG-097 backslash) | attachment gzip | traversal blocked at runtime (see Tested) |
| 11 | `GET /api/backups/download/:type/:filename` | `MANAGE_BACKUPS` | same | same | attachment | |
| 12 | `GET /api/damage-check-fields/header` | `requireAuth` | `path.join(cwd, headerImagePath)` / fallback | none | sendFile | headerImagePath server-set |
| 13 | `GET /uploads/*` (static) | `requireAuth` | `express.static(cwd/uploads)` | static resolver | ext-inferred | **BUG-085/026**: hardcodes cwd/uploads, ignores UPLOADS_DIR |
| 14 | `GET /api/portal/documents/:id/download` | portal | `resolveDocumentFilePath` | ✓ + customer-scoped | DB CT, attachment/inline | correct |
| 15 | `GET /api/portal/requests/:id/attachments/:attachmentId` | portal | `resolveDocumentFilePath` | ✓ + scoped | DB CT inline | correct |
| 16 | `GET /api/portal/fines/:id/letter` | portal | `resolveDocumentFilePath` | ✓ + scoped | pdf inline | correct |
| 17 | `GET /api/portal/drivers/:id/license` | portal | `resolveDocumentFilePath` | ✓ + scoped | inline | **works** where staff route #4 fails — inconsistent |
| 18 | `GET /api/portal-requests/:id/attachments/:attachmentId` | staff `canView` | `resolveDocumentFilePath` | ✓ | DB CT inline | correct |
| 19 | `GET /object-storage/*` | **none** | Replit sidecar | n/a | — | BUG-051 (inert) |

## Test matrix (endpoint × case × result)

| Endpoint | Case | Fixture / request | Result |
|----------|------|-------------------|--------|
| POST /api/documents | valid PDF | `valid.pdf`, type `AUDIT-P15` | **201**, id 321, renamed `AU15AX_AUDIT-P15_<date>_<ts>.pdf` |
| POST /api/documents | empty file | `empty.pdf` (0 bytes) | **400** "File does not appear to be a valid PDF" |
| POST /api/documents | fake EXE as .pdf | `MZ..` bytes, `.pdf` | **400** "content does not match... detected application/x-msdownload" |
| POST /api/documents | text as .pdf | `text-as.pdf` | **400** "does not appear to be a valid PDF" |
| POST /api/documents | PDF/`<script>` polyglot | `polyglot.pdf` | **201** stored; served inline `application/pdf` + nosniff → no XSS (browser treats as PDF) |
| POST /api/documents | octet-stream mime + pdf bytes | `valid.pdf` as `application/octet-stream` | **201** (filter allows octet-stream; magic-byte confirms pdf) |
| POST /api/documents | dangerous ext `.exe` | jpg bytes, name `AUDIT-x.exe` | **500 + full stack trace** (BUG-030) |
| POST /api/documents | **huge 60 MB** | `huge.pdf` (60 MB) | **500 + MulterError "File too large" stack** with absolute local paths (BUG-030, size variant); disk-streamed, no RSS spike |
| POST /api/documents | **duplicate contract** | two different PDFs, type `contract`, same plate/day | **both 201** (ids 324, 325) — **same physical file**, first overwritten, doc 324 now serves doc 325 bytes (**F15-002**) |
| GET /api/documents/view/:id | **file deleted from disk** | unlink then GET | **404** "Document file not found on disk"; **DB row still 200** (F15-003) |
| GET /api/documents/download/:id | file deleted | GET | **404**, row not cleaned |
| POST /api/customers/:id/drivers | valid licence (jpg) | `valid.jpg`, `displayName` | **201** |
| POST /api/customers/:id/drivers | empty | `empty.pdf` | **400** |
| GET /api/drivers/:id/license | retrieve a just-uploaded licence | GET | **403 "Access denied"** — containment check rejects UPLOADS_DIR file (**F15-001**) |
| POST /api/pdf-templates/:id/background | huge 60 MB | `huge.pdf` | **500 + stack** (BUG-030) |
| POST /api/backups/upload | traversal via originalname `/` | `../../audit-uploads/x.sql` | 200; **busboy stripped path → landed in `backups/` as basename** (BUG-076 not exploitable at runtime) |
| POST /api/backups/upload | traversal via originalname `\` (Windows) | `..\..\..\audit-uploads\x.sql` | 200; **busboy stripped `\` too** → basename in `backups/`, did **not** escape |
| GET /api/backups/download/:filename | traversal | `..%2f..%2fpackage.json`, `..\..\package.json`, `....//package.json` | **400 "Invalid filename"** all three (`..` blocked; BUG-097 not exploitable) |
| GET /uploads/* | missing file | `/uploads/AU15AX/AUDIT-P15/nonexist.pdf` | **200 SPA HTML shell** (dev), confirms mount serves cwd/uploads not UPLOADS_DIR (BUG-085/026) |
| POST /api/fines/imports/upload | valid CSV | `beschikkingsnummer;kenteken;...` | **201** import created |
| POST /api/fines/imports/upload | malformed XML | `<broken><unclosed>` | **201** graceful (stored, no crash) |
| POST /api/fines/imports/upload | wrong ext `.exe` | `MZ`, `.exe` | **400** "Only XML or CSV files" |

## Tested (passed / safe by design)

- **Magic-byte enforcement** is solid across the disk-storage upload routes that call `validateAfterUpload`: EXE-as-.pdf, text-as-.pdf, empty file, wrong-content — all cleanly 400. `createSecureMulterFilter` correctly blocks dangerous extensions (`.exe`, `.svg`, `.html`, …) and only lets a declared `application/octet-stream` through to the stricter post-upload magic-byte gate.
- **Stored filenames never trust client input.** Documents/expenses/fuel/damage-check derive `<plate>_<type>_<date>_<timestamp><ext>`; drivers/fines/portal use server-generated names; `busboy` additionally reduces `originalname` to its basename (verified live for both `/` and `\`), so `../`, `..\`, `%00`, spaces, unicode/emoji and 255-char names cannot traverse or collide through the filename.
- **Path traversal on the two backup-download routes is blocked** (`..` and `/` rejected → 400); the backslash gap (BUG-097) is not reachable because any `..` is rejected first.
- **Polyglot PDF/`<script>` served safely**: `X-Content-Type-Options: nosniff` present (globally, via helmet + a second explicit header), inline `Content-Type` taken from a magic-byte-validated PDF, so no HTML/SVG can be served inline for XSS through the document routes.
- **Portal serving routes are correctly scoped and containment-checked** — all use `resolveDocumentFilePath()` and per-customer scope.
- **`GET /api/documents/view/:id` works with `UPLOADS_DIR`** (verified 200) because `path.join(cwd, "..\\audit-uploads\\...")` preserves the `..`; this is the exact opposite of the staff driver-licence route (F15-001) which adds a `startsWith(cwd/uploads)` check and therefore fails.
- **CJIB import** parses XML with `fast-xml-parser` (no external-entity/XXE resolution) inside try/catch; malformed input degrades to a "failed" import row, no crash; wrong extensions rejected 400.
- Large uploads to disk-storage routes are streamed to disk (multer `diskStorage`/`dest`), so a 60 MB body does not balloon process RSS (server `/health` uptime kept climbing, no restart).

## Not tested (why)

- **Portal `POST /api/portal/requests` malformed `payload`** (the DM-001/BUG-002 process-kill) — deliberately **not** re-triggered; it crashes the shared server for every concurrent agent. Cited only.
- **Backup restore (`restore-data/code/files`)** — BUG-069 tar-over-cwd is a destructive RCE primitive; not executed against the shared instance. Cited.
- **Deep/entity-expansion XML DoS on CJIB import** — `collectRecordNodes`/`flatten` are unbounded-recursive, but the recursion sits inside `parseCjibFile`'s try/catch so a `RangeError` is caught; a genuinely hostile billion-laughs/very-deep file could still spike CPU/memory on the shared box, so only a shallow malformed case was sent. Flagged as a LOW residual (no BUG filed — untested exploitability).
- **Case-insensitive collision A.PDF vs a.pdf** — not separately forced: template backgrounds already overwrite per-id by design, and all other routes append a millisecond timestamp, so a case-only collision cannot arise except in the contract path already captured by F15-002.
- **Permission-failure (read-only file/dir)** — the more impactful storage failures (oversize → 500, missing file → 404, UPLOADS_DIR mismatch → 403) were reproduced without needing an ACL change; a read-only-dir test would only have re-confirmed the same "rejected upload → 500 + stack" (BUG-030) surface.

## Findings summary table

| ID | Severity | Feature | Summary |
|----|----------|---------|---------|
| F15-001 | HIGH | Driver licences | `GET /api/drivers/:id/license` hardcodes `cwd/uploads` in its containment check → **403 on every licence** when `UPLOADS_DIR` is set (production) |
| F15-002 | MEDIUM | Contract documents | Uploading two different contract PDFs for the same plate/day silently overwrites the first; its document row then serves the second file's bytes (data loss + wrong content) |
| F15-003 | LOW | Documents / serving | A document whose file is deleted from disk 404s on view/download but the DB row is never flagged or cleaned (stale references accumulate; applies to expenses/driver/fine serve routes too) |

## BUGs

```
BUG F15-001
Severity: HIGH
Feature: Driver licence retrieval broken whenever UPLOADS_DIR is configured
Status: OPEN
Reproduction:
  1. UPLOADS_DIR is set outside the repo (audit server: C:\...\audit-uploads; production/Coolify: the mounted volume).
  2. POST /api/customers/2/drivers (multipart, displayName + licenseFile=valid.jpg) -> 201. Server stores drivers.license_file_path = "..\audit-uploads\drivers\license_customer2_<ts>.jpg" (path.relative(cwd, UPLOADS_DIR/...) yields a "..\"-prefixed path).
  3. GET /api/drivers/860/license (authenticated, VIEW_CUSTOMERS) -> 403 {"error":"Access denied"}.
  Script: docs/audit/wip/scripts/p15-c-traversal.cjs / p15-b-endpoints.cjs; capture p15-c-traversal.out.json (driverServe.status=403).
Expected: The freshly uploaded licence is returned (200, the JPG bytes), exactly as the portal counterpart GET /api/portal/drivers/:id/license does (it uses resolveDocumentFilePath and returns 200).
Actual: 403 "Access denied" for every legitimately uploaded licence. The containment check compares the resolved file path against path.resolve(cwd,'uploads'); the real file lives under UPLOADS_DIR, whose resolved path does not start with cwd/uploads, so the check always fails.
Root cause: server/routes.ts:6520-6533 —
  const uploadsDir = path.resolve(process.cwd(), 'uploads');
  const requestedPath = path.resolve(process.cwd(), driver.licenseFilePath);
  if (!requestedPath.startsWith(uploadsDir)) return res.status(403)...
  Hardcodes 'uploads' instead of getUploadsDir(); same root family as BUG-026 (static mount) and BUG-029 (transport report 404), but here it is a hard authorization/functional failure on the staff licence route.
Affected files: server/routes.ts:6512-6540 (GET /api/drivers/:id/license)
Affected data: drivers.license_file_path (all rows with UPLOADS_DIR set)
Security impact: Availability only for staff (the file is not exposed); however the SAME data is reachable via /uploads/drivers/... (BUG-085) and via the portal route, so this is an inconsistency, not a containment win. The check gives a false sense of protection while failing open elsewhere.
Business impact: In the production/Coolify deployment (UPLOADS_DIR = mounted volume) NO driver licence copy can be viewed or downloaded from the staff app — a core compliance/KYC workflow is entirely broken; staff see "Access denied" for documents that uploaded successfully.
Fix (proposal only): replace path.resolve(process.cwd(),'uploads') with getUploadsDir() (or route the whole handler through resolveDocumentFilePath() as the portal/fines routes already do), then verify containment against the resolved uploads dir.
Regression test (proposal): with UPLOADS_DIR set outside cwd, upload a licence then GET /api/drivers/:id/license and assert 200 + correct bytes; assert a "..\..\etc\passwd" style stored path still 403s.
```

```
BUG F15-002
Severity: MEDIUM
Feature: Contract document upload — filename collision overwrites and cross-serves
Status: OPEN
Reproduction:
  1. POST /api/documents (documentType="contract", vehicleId=1832, file=valid.pdf) -> 201, id 324, filePath ..\audit-uploads\contracts\AU15AX\AU15AX_contract_20260910.pdf.
  2. POST /api/documents (documentType="contract", vehicleId=1832, file=polyglot.pdf — DIFFERENT content) -> 201, id 325, filePath IDENTICAL to step 1.
  3. GET /api/documents/view/324 -> 200 but returns polyglot.pdf's bytes ("%PDF-1.4\n<script>alert(document.domain)...") — document 324's original content is gone.
  Script: docs/audit/wip/scripts/p15-a-docs.cjs; capture p15-a-docs.out.json (contractDup: doc1/doc2 same filePath; doc1_view_head = doc2 content).
Expected: Each uploaded document keeps its own bytes; two rows must not share one physical file (either version the filename with a timestamp like every other document type, or refuse/replace-with-single-row).
Actual: The contract filename is <plate>_contract_<YYYYMMDD><ext> with NO timestamp (server/routes.ts:4900-4911 filename callback, and the parallel getRelativePath in the POST handler), so two contract uploads on the same day for the same plate write to the same path; the second silently overwrites the first while a second documents row is inserted. The earlier row now serves the later file's content.
Root cause: server/routes.ts ~4900-4911 (documentStorage filename callback, contract branch: `${sanitizedPlate}_contract_${currentDate}${extension}` — omits the timestamp that the non-contract branch includes).
Affected files: server/routes.ts:4873-4915 (documentStorage.filename), 5000-5035 (POST /api/documents)
Affected data: documents rows of type "contract" sharing one file; older rows silently corrupted.
Security impact: Low-moderate — an attacker with MANAGE_DOCUMENTS can overwrite an existing contract's on-disk bytes (repudiation / evidence tampering: the row metadata is unchanged but the served PDF is swapped).
Business impact: Silent legal-document data loss: re-uploading a corrected contract destroys the earlier one, and any earlier document row now renders someone else's contract. Same shared-file root cause as BUG-027 (regeneration) but reached through the upload route and adds the cross-serving harm.
Fix (proposal only): include the millisecond timestamp in the contract filename (as the standard document branch already does), or de-duplicate to a single row per (plate, contract, day) and replace atomically.
Regression test (proposal): upload two different contract PDFs for one vehicle same day; assert two distinct filePaths and that view/:id of each returns its own bytes.
```

```
BUG F15-003
Severity: LOW
Feature: Document/receipt serving — no reconciliation when the file is missing on disk
Status: OPEN
Reproduction:
  1. Upload a document (id 321), then delete its file from disk by hand.
  2. GET /api/documents/view/321 -> 404 "Document file not found on disk"; GET /api/documents/download/321 -> 404.
  3. GET /api/documents/321 -> 200 (the row is still listed as a valid document); it also still appears in GET /api/documents and per-vehicle/reservation listings.
  Script: docs/audit/wip/scripts/p15-a-docs.cjs (missingFile: viewStatus 404, rowStillExists true).
Expected: A document whose backing file is gone should be flagged (e.g. a "file missing" state) or reconciled, so the UI does not present a permanently un-openable document as normal.
Actual: The row is never marked or cleaned; every list keeps offering a document that 404s on open. Same pattern on GET /api/expenses/:id/receipt, GET /api/drivers/:id/license and GET /api/fines/:id/letter (all 404 without touching the row).
Root cause: view/download handlers (server/routes.ts:5147, 5201) return 404 on missing file but never update or flag documents; no background reconciliation exists. Complements BUG-150 (the inverse: files remain after the row is deleted).
Affected files: server/routes.ts:5111-5217; server/routes/expenses.ts:161-186; server/routes.ts:6512-6540; server/routes/fines.ts (letter serve)
Affected data: documents / expenses / drivers / fines rows with a now-missing file.
Security impact: None.
Business impact: Users repeatedly click documents that fail to open with no explanation; data-quality drift (stale references) accumulates silently.
Fix (proposal only): on a 404-on-disk, either flag the row (nullable "file_missing_at" / status) so the UI can show it, or provide an admin reconciliation job; at minimum surface a clearer message.
Regression test (proposal): upload, delete file, assert the listing marks the document as missing (not as a normal openable document).
```

## Re-confirmed existing bugs (cite + new evidence, not re-filed)

- **BUG-030** (rejected uploads → 500 + stack trace): reproduced twice more this phase with **new variants** — (a) a dangerous-extension reject (`AUDIT-x.exe`) and (b) the **multer `LIMIT_FILE_SIZE` path** (60 MB `huge.pdf` to `POST /api/documents` and to `POST /api/pdf-templates/:id/background`) both return **HTTP 500** `{"error":"Server Error","message":"File too large","stack":"MulterError: File too large ...\\node_modules\\multer\\..."}` with absolute local filesystem paths in the body. The size-limit case is the same global-handler leak as the fileFilter case.
- **BUG-076** (path traversal on write in `POST /api/backups/upload` via `originalname`): the static gap is real (originalname is concatenated into `newFilename` without `sanitizeFilename`), **but runtime testing shows it is not exploitable through the HTTP layer**: `busboy` reduces `originalname` to its basename for both `/` and `\` (verified — `../../audit-uploads/x.sql` and `..\..\..\audit-uploads\x.sql` both landed in `backups/` as `uploaded-database-<ts>-x.sql`, neither escaped). Worth the defensive fix, but the severity is lower than the static write-up implies for this multer/busboy version. Evidence: `p15-b-endpoints.cjs`, `p15-c-traversal.cjs`.
- **BUG-097** (backup filename filter misses backslash): confirmed **not exploitable** — `GET /api/backups/download/:filename` rejects any name containing `..` (400 "Invalid filename") before the backslash gap matters; all three traversal encodings returned 400.
- **BUG-085 / BUG-026** (`/uploads` static ignores `UPLOADS_DIR`): reconfirmed — `GET /uploads/<any missing path>` returns **200 with the SPA HTML shell** (dev), and the mount is hardcoded to `cwd/uploads` while the app writes to `UPLOADS_DIR`; files written this phase live under `audit-uploads` and are not served by the static mount.
- **BUG-012** (documents view/download/delete without path containment): confirmed present — all three build `path.join(cwd, filePath)` / `unlinkSync` with no containment; not directly re-exploited (no client-writable `filePath` route today, per SEC-023), cited.
- **BUG-003 / BUG-060** (unauthenticated expenses routes + arbitrary read via `receiptFilePath`): confirmed still present by inspection (`POST /api/expenses/with-receipt`, both PATCH variants and `GET /api/expenses/:id/receipt` carry no auth middleware; `insertExpenseSchema` still keeps `receiptFilePath`); not re-exploited to avoid duplicating the prior pass.
- **BUG-066** (`vehicle-diagram-templates` create/patch/serve with only `requireAuth`), **BUG-070** (arbitrary delete via `backgroundPath`/`diagramPath`), **BUG-050** (template delete leaves files), **BUG-098** (symlink follow), **BUG-131** (pickup/return dates in filenames), **BUG-073** (DOM-XSS via `licenseFilePath`): all still present by code inspection; cited, out of this phase's direct dynamic scope.

## Cleanup

- Removed the two stray files written into `backups/` by the traversal tests (`uploaded-database-*-AUDIT-p15-traversal.sql`, `-AUDIT-p15-esc.sql`, `-AUDIT-p15-sub.sql`).
- Deleted `huge.pdf` fixture is left in `files/p15/` (gitignored); the 60 MB file may be removed. No files escaped `UPLOADS_DIR`/`backups`. DB rows (documents 321-325, driver 860, expenses/fines import test rows) left in the disposable `lvs_audit` DB, all `AUDIT-`/`AU-15A-X` prefixed.
