# Fase 3-5, 14-16 (first pass) — Documents, PDFs, templates, uploads, expenses, e-mail

2026-09-09, tested against `http://localhost:5001` / db `lvs_audit`. Admin session (`admin`/`admin123`). All created records prefixed `AUDIT-`. Scripts and captured PDFs live in `docs/audit/wip/scripts/` (this area's files are prefixed `dm-`: `dm-jar.txt`/`dm-csrf.txt` cookie jar, `dm-db.cjs` ad-hoc DB helper, `dm-upload-doc.cjs` manual-multipart uploader for long/unicode filenames, `dm-smtp-stub.cjs` raw-TCP SMTP capture server, `pdfs/` generated PDFs, `files/` test fixtures).

Fixtures created: reservation 3213 (normal, customer 1247 "AUDIT-Normal Klant", vehicle 2 / 12XT102), reservation 3214 (edge case: customer 1250 with a 372-char name mixing emoji and `<b>` HTML, vehicle 74 / 84XT174), reservation 3222 (customer_id/vehicle_id forced to NULL via direct SQL after API creation, since `insertReservationSchema` refuses a fully-null reservation via the API itself).

## Operational note — the shared audit server crashed repeatedly during this session

The server (`preview_start "audit"`) exited with code 1 three times while this phase's tests were running (observed via `preview_list`/`preview_logs`, each time requiring a manual `preview_start` to bring it back; the DB-backed session store meant the login cookie kept working across restarts). All three crashes show the **identical** stack trace, unrelated to any request this phase's tests sent:

```
❌ UNHANDLED PROMISE REJECTION at: Promise { <rejected> SyntaxError: Unexpected token 'o', "not-json-at-all" is not valid JSON
    at JSON.parse (<anonymous>)
    at Object.transform (server\routes\portal.ts:316:66)
    ... ZodEffects._parse / ZodObject.safeParse ...
    at multerMiddleware (node_modules\multer\lib\make-middleware.js:13:41)
    at requirePortalUser (server\portal-auth.ts:228:5)
🛑 UNHANDLED_REJECTION received, starting graceful shutdown...
❌ Forced shutdown - graceful shutdown timed out
```
This is `POST /api/portal/requests` (`server/routes/portal.ts:305-317`), a multipart file-upload route (`attachmentUpload.array("attachments", 5)`) whose `payload` field is parsed with `z.preprocess((v) => (typeof v === "string" ? JSON.parse(v || "{}") : v ?? {}), z.record(z.unknown()))` — a bare `JSON.parse` with no try/catch, wrapped in `.safeParse()` inside an `async (req, res) =>` handler that has no surrounding try/catch either. A non-JSON string in `payload` (e.g. the literal `not-json-at-all`) throws synchronously, escapes `safeParse`, and becomes an unhandled promise rejection; the app's global handler (`server/index.ts`, `UNHANDLED_REJECTION` listener) treats **any** unhandled rejection anywhere in the process as fatal and force-kills the whole server — taking down the staff app and the customer portal for every concurrent session, not just the offending request. This is included here (not actively re-triggered by this phase's own tests, since it was already reproducing from other concurrent audit activity and re-triggering it deliberately would have caused more shared downtime) because it sits squarely in the "file handling" first pass: it is a multipart-upload route, the crash repro is clean and 100% consistent (identical stack twice), and its severity (full-process DoS, one malformed field from any logged-in portal customer) outranks everything else found in this pass. Logged as DM-001; whichever agent owns the portal-requests area should also be made aware.

## Tested

- Contract PDF: `GET /api/contracts/generate/:reservationId` (note: **GET**, not POST as the task brief assumed — verified against `server/routes.ts:5451`) for a normal reservation, twice in a row (duplicate-row behavior — see DM-004), for the 372-char emoji/HTML-name reservation, for the null-customer/null-vehicle reservation (gracefully degrades: PDF still returned 200, but no `documents` row is created because the code requires `reservation.vehicle.licensePlate` to save a copy — confirmed via server-side log condition, not a bug), and for a non-existing reservation id (404 "Reservation not found", clean). `?templateId=` with a real template, a deleted template id (falls back to legacy, 200), and a template whose background file was deleted from disk by hand (falls back gracefully, 200, no error surfaced to the caller — silent degradation, not flagged as its own bug given time budget but worth noting for the template-editor owner).
- `GET /api/contracts/generate-default/:reservationId`: same default-template code path as above (see DM-005), same byte size.
- Downloaded contract PDFs via `/api/documents/download/:id` and opened with the PDF reader — see DM-005 for what was actually inside.
- Damage-check PDFs: `GET /api/damage-checks/generate/:reservationId` (reservation 3213 → 200, ~1.9MB) and `GET /api/vehicles/:id/damage-check-pdf` (vehicle 2 → 200, ~1.9MB, same size) both work; `generate/:reservationId` on the null-vehicle reservation 3222 correctly returns 400 "Vehicle not found for reservation" rather than crashing.
- Transport report: `POST /api/delivery/transports/generate-report` with an empty `transportIds` array → clean 400 "No transports specified"; with 200 ids → clean 400 "Too many transports for a single report (max 50)" (server-side cap already in `server/routes.ts:7672-7674`, so the "200 transports" scenario from the task brief is already handled); with 3 real transport ids → 201 and a `documents` row — but see DM-006, the file is unretrievable afterwards.
- PDF templates: `POST /api/pdf-templates` with malformed `fields` — a truly double-stringified JSON string, an array of plain strings instead of field objects, and a plain object instead of an array — all accepted with 201 (see DM-007); background upload of `.svg` and `.html` correctly **rejected** by `createSecureMulterFilter`'s magic-byte/extension check (both 400-class rejections, but delivered as HTTP 500 with a full stack trace, see DM-008); a real PNG uploaded with a spoofed `.html` filename+mimetype also correctly rejected (magic-byte check wins over the declared name); a 20MB background (over the 10MB limit) correctly rejected by Multer's `fileSize` limit (also via the DM-008 500/stack-trace path); filenames `../../x.png`, `x%00.png`, and a unicode/emoji filename all handled safely — the server always derives the stored filename from `template_<id>_background<ext>` (`ext` from `path.extname`), so none of these could traverse or collide; deleting a template that had generated a contract with it (`templateId=7`) does not error subsequent generation — the route re-fetches the template each time and falls back cleanly when it's gone (verified via `preview` also 404ing correctly after delete); deleting a template does **not** delete its background file from disk (DM-010, low severity).
- Documents: `POST /api/documents` (`server/routes.ts:5000`) — valid PDF and valid JPG accepted (201, `documentType`/`reservationId`/`vehicleId` correctly parsed *only* when those form fields precede the `file` field in the multipart body — see DM-009 for what happens when they don't); an EXE with a spoofed `.pdf` name/mimetype correctly rejected 400 "File content does not match declared type. Expected application/pdf, detected application/x-msdownload" (magic-byte check via `validateAfterUpload`); an empty/zero-byte file declared `.pdf` correctly rejected 400 "File does not appear to be a valid PDF"; a 250-char unicode-safe filename and a filename mixing Japanese characters and an emoji both accepted cleanly (server always renames to `<plate>_<type>_<date>_<timestamp>.<ext>`, so the original name is never trusted for storage — safe by design). `GET /api/documents/view|download/:id` for a non-existing id → clean 404 both; `DELETE /api/documents/:id` twice → 200 then clean 404 on the second call, and `view` of the now-deleted id → 404. `documents.file_path` altered directly in the DB to prove path-containment gaps in `view`/`download`/`DELETE` — see DM-002 (the most severe finding after DM-001).
- `/uploads/<path>` static route: correctly gated behind `requireAuth` (401 without a session); `../` and URL-encoded `..%2f` traversal attempts against it are safely neutralized by Express's static resolver (falls through to the SPA catch-all, 200 HTML, not a leak). Separately, a **file this very server wrote** (a generated contract PDF) is **not reachable** through this route at all — see DM-003, the top non-crash/non-auth finding.
- Expenses, unauthenticated (fresh cookie jar, zero login): `GET /api/expenses/:id/receipt` for an expense that has no receipt → clean 404 `{"error":"No receipt file found for this expense"}`; `POST /api/expenses/with-receipt` (multipart, small JPG, all fields) → **201, full record created, receipt file written to disk, `createdBy: null`** — see DM-012 (Critical); the CSRF cookie needed for the POST is handed out to an unauthenticated visitor by a plain `GET /`, so CSRF is not a meaningful barrier here. `GET /api/expenses/2001/receipt` (the just-created id) unauthenticated → 200, correct 22-byte JPG returned. `PATCH /api/expenses/2001` unauthenticated with a full body → 200, amount/category/description all changed. Authenticated (admin) edge cases: negative amount and `amount: "1e308"` both correctly rejected 400 ("Amount must be greater than 0 and no more than €1,000,000" — zod bound already in place); `date: "2026-13-45"` (nonsensical calendar date) accepted and stored verbatim, no format/range validation (minor, not a full BUG entry given time budget — same class of gap as the vehicles/customers phase's date-field findings); `vehicleId: 999999` (non-existing FK) accepted and stored as a dangling reference with no FK-level or app-level existence check (minor, same reasoning).
- E-mail: `POST /api/documents/:id/email` (this is the actual route — no separate `/api/email/send-document` singular route exists; the plural `/api/email/send-documents` at `server/routes.ts:5305` shares the same `sendEmail(..., 'documents')` call). Inserted a temporary `app_settings` row (`category=email`, `key=email_documents`, host `127.0.0.1:2525`) pointing at a purpose-built raw-TCP SMTP stub (`dm-smtp-stub.cjs`) that logs `MAIL FROM`/`RCPT TO`/`Subject`/attachment filenames from the `DATA` payload; sent the contract document (id 198) to `audit-recipient@example.invalid` → 200 "Email sent successfully", and the stub captured the correct recipient, subject, and the contract PDF as an attachment (`hasAttachment: true`, `attachmentFilenames: ["12XT102_contract_20260909.pdf"]`). Sent the **same document again** immediately after → also 200, a second, fully independent send captured by the stub — **no duplicate-send protection of any kind** (matches the architecture doc's "geen retry, geen idempotentie" note, now reproduced). `recipients: "not-an-email"` → 500 "Failed to send email..." (no upfront email-format validation; the SMTP layer's own rejection is caught and turned into a message, so it fails safely, just with the wrong status code — 500 instead of 400 — not written up as its own BUG given time budget). Missing `recipients` → clean 400 "Recipients and subject are required". Checked `email_logs` immediately after both sends: **table was empty**, confirming the architecture doc's finding that document e-mails are never logged (no BUG entry duplicated here since it's already a known/documented gap, not new). Restored the environment afterwards: deleted the temporary `email_documents` row (`app_settings.id=8`), leaving the original `email_config` row (id 7, unrelated — pre-existing, likely from a concurrent phase's own SMTP test) untouched.
- `GET /object-storage/anything`: no login required either way — with and without a session cookie both return the same `500 "Error loading file from object storage"` (the backing Replit sidecar at `127.0.0.1:1106` is unreachable outside Replit, per the architecture doc, so no actual file content can leak today) — see DM-013 (low/info).

## Not tested (why)

- Portal invite resend duplicate-capture (`POST /api/portal-admin/accounts/:id/invite`, called twice) — skipped. The only portal test account available (`portaal-test@example.com`, `portal_users.id=30`, linked to customer 179) is the shared fixture the README documents for portal-realm login testing; re-sending its invite could rotate a token/credential while another concurrently-running phase agent is mid-way through a portal-login test, which seemed like an unacceptable risk to other agents' work for a test that is not central to this phase's brief.
- Interactive damage check create → generate → compare — `generateInteractiveDamageCheckPDF` (`server/pdf-generator.ts:968-1258`) is dead code per the architecture doc; confirmed no route calls it (the two damage-check generation routes actually exercised, `server/routes.ts:6117` and `:6641`, both go through `generateDamageCheckPDFWithTemplate`/`FromCanvas` instead). There is no separate interactive-damage-check PDF flow to compare against.
- Backup jobs, scheduler behavior, CJIB file handling — out of this phase's assigned scope (documents/PDF/templates/uploads/expenses/e-mail); left for whichever pass covers phase 15/16 in full plus the background-jobs phase.
- Deep fuzzing of the `date`/`vehicleId` expense gaps noted above, and the 500-vs-400 status code on invalid-email send — noted inline above as minor, not written up as full BUG entries given the time budget; flagged here so they aren't lost.

## BUGs

```
BUG DM-001
Severity: CRITICAL
Feature: Portal file-upload route crashes the entire server process (DoS)
Status: OPEN
Reproduction (observed in server logs during this session, not actively re-triggered — see "Operational note" above):
  1. An authenticated portal user calls POST /api/portal/requests (multipart form, attachmentUpload.array("attachments", 5)) with a non-JSON string (e.g. "not-json-at-all") in the `payload` field.
  2. server/routes/portal.ts:316's z.preprocess((v) => (typeof v === "string" ? JSON.parse(v || "{}") : v ?? {}), z.record(z.unknown())) throws a SyntaxError from the bare JSON.parse.
  3. The throw escapes zod's .safeParse() and the route's async handler (no try/catch anywhere in the chain) as an unhandled promise rejection.
  4. server/index.ts's global `unhandledRejection` handler treats this as fatal, logs "🛑 UNHANDLED_REJECTION received, starting graceful shutdown..." then "❌ Forced shutdown - graceful shutdown timed out", and the whole Node process exits (code 1).
  Reproduced identically 2 times in this session's server logs (via preview_logs on serverIds 5a4a887d... and 5d178b5c...), both with the exact same stack trace and payload string "not-json-at-all".
Expected: A malformed `payload` field should be caught by validation and return 400, exactly like every other zod-rejected field on this same route (type, message, reservationId, fineId all fail cleanly via safeParse already).
Actual: One malformed field from one request takes down the entire application (staff back-office and customer portal alike) for every concurrent user; the process does not self-heal and must be manually restarted.
Root cause: server/routes/portal.ts:316-317 — JSON.parse inside a z.preprocess callback with no try/catch, combined with a process-wide policy (server/index.ts) that any unhandled promise rejection is fatal rather than being caught by Express's per-request error handling.
Affected files: server/routes/portal.ts:305-317, server/index.ts (unhandledRejection handler)
Affected data: none corrupted; availability only.
Security impact: Denial of service reachable by any authenticated portal customer (not staff-only), single request, no rate limiting or repeated-attempt requirement.
Business impact: full outage of both the staff application and the customer portal from one bad field in one low-privilege request; every in-flight request from every other user is dropped.
Fix (proposal only): wrap the JSON.parse in the preprocess callback in a try/catch that returns z.NEVER (or the original string, letting the outer schema reject it) instead of throwing; as defense in depth, wrap the route's async body in try/catch (or use an async-handler wrapper) so no single route can produce an unhandled rejection; separately, reconsider whether "any unhandled rejection anywhere in the process is fatal" is the right global policy for a multi-tenant server — at minimum it should not force-kill before in-flight requests from unrelated users complete.
Regression test (proposal): POST /api/portal/requests with payload="not-json-at-all" (or any non-JSON string) as a logged-in portal user; expect a clean 400 and the server process still running afterward.

BUG DM-002
Severity: HIGH
Feature: Documents - arbitrary file read/delete via documents.file_path (no path containment)
Status: OPEN
Reproduction:
  1. Uploaded a normal document (id 211) via POST /api/documents, then via SQL set documents.file_path = 'package.json' (a file at the repo root, reachable via process.cwd()) for that row.
  2. GET /api/documents/download/211 (authenticated, normal MANAGE_DOCUMENTS session) -> 200, 5747 bytes, the actual content of package.json (verified: starts with {"name":"rest-express",...).
  3. Set documents.file_path = '../audit-uploads/AUDIT-throwaway-delete-test.txt' (a harmless file created outside any document's normal per-plate folder, purely for this test).
  4. DELETE /api/documents/211 -> 200 "Document deleted successfully"; the throwaway file was unlinked from disk (confirmed gone afterwards) even though it was never associated with any upload flow.
  5. (Also tried file_path='.env' / '../../../.env': Express's res.sendFile default dotfile policy blocks these specifically, returning 500 "Failed to serve document file" with no content leaked - dotfiles are accidentally protected, non-dotfiles are not.)
Expected: Both routes should resolve document.filePath through a single, containment-checked resolver (the codebase already has one: server/services/document-paths.ts's resolveDocumentFilePath, used elsewhere for portal/fine routes) that refuses to serve or delete anything outside the uploads tree.
Actual: server/routes.ts:5127 (view), 5181 (download), and 5417 (delete) all independently do `path.join(process.cwd(), document.filePath)` (or unlinkSync it) with zero containment check.
Root cause: view/download/delete build the absolute path from a DB-stored string with no allowlist/prefix check, instead of using the existing resolveDocumentFilePath helper.
Affected files: server/routes.ts:5111-5217 (view/download), server/routes.ts:5403-5427 (delete), server/services/document-paths.ts:16 (the unused-here containment helper)
Affected data: documents id 211 (deleted as part of this test, as intended); a throwaway file docs/... audit-uploads/AUDIT-throwaway-delete-test.txt (also deleted, as intended, harmless).
Security impact: Arbitrary file read of any non-dotfile reachable from the server's working directory, and arbitrary file delete of any file reachable from it, for any actor able to influence a document row's file_path. Today file_path is not settable via the API (PATCH /api/documents/:id whitelists only documentType/notes - verified in server/routes.ts:5069-5104), so this specific path currently requires direct DB write access (e.g. a future SQL injection elsewhere, a compromised DB credential, or a rogue operator) - it is a defense-in-depth gap today, not a directly remote-exploitable one, but the missing containment check means the very next endpoint or migration that accepts a user-influenced filePath turns this into a full path-traversal RCE-adjacent bug with no additional code changes needed.
Business impact: potential exposure of source code/config, or destructive deletion of arbitrary files, if the (currently theoretical) write primitive is ever obtained.
Fix (proposal only): route view/download/delete through resolveDocumentFilePath (or an equivalent containment check resolving against getUploadsDir() and refusing anything that normalizes outside it) instead of building the path ad hoc in three separate places.
Regression test (proposal): set a document's file_path (directly in a test DB) to an out-of-tree path like '../package.json' or an absolute path; expect view/download/delete to all refuse with 404/400, never touching the target file.

BUG DM-003
Severity: MEDIUM
Feature: Static /uploads route ignores UPLOADS_DIR — files this server writes are unreachable through it
Status: OPEN
Reproduction:
  1. Server started with UPLOADS_DIR=C:\Users\kees lam\Desktop\LVStest-main\audit-uploads (per .claude/launch.json's "audit" config), confirmed via the startup log line "📁 Serving uploads from: C:\Users\...\LVStest-main\LVStest-main\uploads" (note: LVStest-main\LVStest-main\uploads, NOT the configured audit-uploads).
  2. GET /api/contracts/generate/3213 (authenticated) -> 200, and the code path confirms (and disk listing confirms) the file is written to C:\Users\kees lam\Desktop\LVStest-main\audit-uploads\contracts\12XT102\12XT102_contract_20260909.pdf, i.e. under getUploadsDir() = UPLOADS_DIR.
  3. GET /uploads/contracts/12XT102/12XT102_contract_20260909.pdf (authenticated, same session) -> HTTP 200, but Content-Length only 1240 bytes and the body is the SPA's index.html, not the PDF - the static middleware didn't find the file (because it looked under LVStest-main\LVStest-main\uploads, an unrelated stale directory with leftover dev data) and the request fell through to the SPA catch-all, which returns 200 by design for unknown client-side routes.
Expected: A file this server itself wrote should be retrievable at the path the app tells users to use for it, or the route should at least 404 rather than silently returning the wrong content with a 200.
Actual: silently returns the wrong content (app shell HTML) with a 200 status - worse than a 404, since a script or the client blindly trusting the status code would treat this as success.
Root cause: server/index.ts's static mount hardcodes `const uploadsPath = path.join(process.cwd(), 'uploads')` instead of calling the existing getUploadsDir() helper (shared/paths.ts:12) that every file-writing route already uses (and whose own doc comment explicitly warns about exactly this class of drift: "They previously disagreed... which meant setting that variable would silently move uploads while the backup carried on... reporting success").
Affected files: server/index.ts (the `app.use('/uploads', requireAuth, express.static(uploadsPath))` line and its `uploadsPath` computation), shared/paths.ts:12 (getUploadsDir, not used here)
Affected data: none corrupted; every file written while UPLOADS_DIR differs from cwd/uploads is affected (this whole audit run's generated PDFs/uploads, for instance).
Security impact: low directly; the confusing "200 with wrong body" behavior could mask real 404s during debugging/monitoring, and is the same root symptom (UPLOADS_DIR not universally honoured) already flagged as risk #1 in the phase-1c architecture doc.
Business impact: any deployment that sets UPLOADS_DIR (e.g. to point at a mounted persistent volume, exactly the scenario shared/paths.ts's own comment describes) will have every direct /uploads/<path> link silently broken; note that /api/documents/view|download/:id are NOT affected by this specific bug (they build the path from process.cwd() + the stored relative path, and the stored relative path already contains the necessary ../ back out to the configured UPLOADS_DIR - see DM-006 for the sibling bug where a *different* route's relative-path math is wrong in the other direction).
Fix (proposal only): change `const uploadsPath = path.join(process.cwd(), 'uploads')` to `const uploadsPath = getUploadsDir()` in server/index.ts, matching every other consumer.
Regression test (proposal): start the server with UPLOADS_DIR set to a directory other than cwd/uploads, write a file through any upload/generation route, then GET it via /uploads/<relative path>; expect the actual file back, not the SPA shell.

BUG DM-004
Severity: LOW-MEDIUM
Feature: Contract PDF regeneration creates duplicate `documents` rows sharing one physical file, with no reference counting on delete
Status: OPEN
Reproduction:
  1. GET /api/contracts/generate/3213 twice in a row (authenticated).
  2. Both calls create a documents row: id 198 "Contract (Unsigned)" and id 199 "Contract (Unsigned) 2", both with the IDENTICAL file_path (..\audit-uploads\contracts\12XT102\12XT102_contract_20260909.pdf) and identical file_size (310766), because the on-disk filename is date-based (12XT102_contract_20260909.pdf), not per-generation-unique.
  3. Given DM-002's finding that DELETE /api/documents/:id unlinks by path with no reference-count/other-rows check, deleting document 198 would remove the shared file from disk while document 199's row (and any further "Contract (Unsigned) N" rows for the same reservation/day) continues to claim the file exists - its next view/download would fail with "Document file not found on disk" despite the document record itself looking intact.
Expected: Either regeneration should overwrite/version the existing unsigned-contract row instead of creating an ever-growing series of "Unsigned N" rows for what is physically one file, or each generation should produce a distinct physical file so the rows are truly independent.
Actual: N document rows silently share 1 file on disk with no coordination between them.
Root cause: server/routes.ts's contract-save block computes the on-disk filename from the license plate and the current date only (`${sanitizedPlate}_contract_${currentDate}.pdf`), with no per-generation uniqueness (no id/hash/time-of-day component), while still creating a brand new documents row every single call.
Affected files: server/routes.ts (contract-generation document-save block, ~5560-5625, inside the /api/contracts/generate/:reservationId handler)
Affected data: documents ids 198, 199 (both left in place, both still valid at time of writing).
Security impact: none directly.
Business impact: confusing document history ("Contract (Unsigned) 2, 3, 4..." for a reservation where nothing actually changed between generations besides the timestamp inside the PDF), and a latent data-loss trap once combined with DM-002's unlink-without-refcount behavior - deleting what looks like an old/superseded contract row can silently break a newer-looking one.
Fix (proposal only): include a per-generation unique component (e.g. a counter or short hash) in the saved filename so each documents row maps to its own file, or explicitly supersede/overwrite the previous unsigned-contract row+file on regeneration instead of appending a new one.
Regression test (proposal): generate a contract for the same reservation twice, then delete the first resulting document; expect the second document to still be viewable/downloadable afterward.

BUG DM-005
Severity: MEDIUM
Feature: Default PDF contract template has no configured fields — all generated contracts are blank
Status: OPEN
Reproduction:
  1. GET /api/pdf-templates -> the only template is id=2 "gffg", isDefault:true, fields:[] (empty array).
  2. GET /api/contracts/generate/3214 (reservation for the 372-char emoji/HTML-name customer, real vehicle/dates attached) -> 200, valid PDF.
  3. Opened the PDF with the PDF-reading tool: page 1 is the full "Auto Lease LAM" contract letterhead/form, but every data field (Merk/Type/Kenteken, huurder name/address, huurperiode dates, prices) is completely blank - no customer name, no license plate, no dates anywhere on the page, despite the reservation having a real vehicle (84XT174) and a real (if extreme) customer name attached.
  4. GET /api/contracts/generate-default/3213 produces an identically-sized PDF (310766 bytes, same as the plain generate/3213 call) because that route also tries the default template first (server/routes.ts:5983-6002) and only falls back to the truly fixed-coordinate generateRentalContract when NO default template row exists at all - which is not the case here.
Expected: Either the shipped/seeded default template should have real field mappings, or contract generation should refuse / warn when the resolved template has zero fields, rather than silently producing a form with no rental data on it.
Actual: Both "with template" and "generate-default" routes silently produce a data-free contract, HTTP 200, normal file size, indistinguishable from a working contract by anyone who doesn't open and read it.
Root cause: templates.fields is entirely admin-configured with no minimum-viable-content check; generateRentalContractFromTemplate happily draws a background with zero field overlays when fields is empty, and both /api/contracts/generate and /api/contracts/generate-default prefer whatever template is currently flagged isDefault, however empty.
Affected files: server/routes.ts:5451-5560 (generate), server/routes.ts:5963-6010 (generate-default), server/utils/pdf-generator.ts (generateRentalContractFromTemplate)
Affected data: pdf_templates id 2 ("gffg") - pre-existing seed/test data in this DB, not created by this test pass.
Security impact: none.
Business impact: if this is representative of a real deployment's template configuration (an admin created/activated a template before finishing its field layout), every contract generated in the meantime is a blank form - a serious operational risk for a car rental business (unsigned/unusable contracts, or worse, a signed-but-blank contract with no legal content), with no error or warning surfaced anywhere in the flow.
Fix (proposal only): warn (in the UI and/or via a response header/flag) when generating from a template with an empty or near-empty fields array, and/or block setting isDefault:true on a template with zero fields.
Regression test (proposal): generate a contract from a template with fields:[]; expect either a non-200 warning-class response or a response that flags "template has no configured fields" so callers can detect it programmatically.

BUG DM-006
Severity: MEDIUM
Feature: Transport-report documents become permanently unretrievable when UPLOADS_DIR differs from process.cwd()
Status: OPEN
Reproduction:
  1. POST /api/delivery/transports/generate-report {"transportIds":[36,37,38]} (authenticated) -> 201, documents row id 223, filePath "reports\Transport_Reports_3_vehicles_09-09-2026_65144.pdf" (relative, no ../audit-uploads/ prefix).
  2. Confirmed on disk: the PDF is physically at C:\Users\kees lam\Desktop\LVStest-main\audit-uploads\reports\Transport_Reports_3_vehicles_09-09-2026_65144.pdf (i.e. under getUploadsDir()/UPLOADS_DIR, same as every other generated document).
  3. GET /api/documents/download/223 (authenticated, fresh session) -> 404 "Document file not found on disk".
Expected: Same as every other document type (contracts, damage checks, uploaded files) - downloadable via /api/documents/download/:id once created.
Actual: 404, because the download route computes path.join(process.cwd(), document.filePath) = process.cwd() + 'reports\...' , which is missing the '../audit-uploads/' component that would be present had the relative path been computed the same way every other document-creating route computes it.
Root cause: server/routes.ts's generate-report handler computes `const relativePath = path.relative(uploadsDir, filePath)` (relative to getUploadsDir()), whereas every other document-creating route (contracts, damage checks, document upload) uses `getRelativePath(filePath)` (server/services/document-paths.ts:6), which is relative to process.cwd(). The two are only equal when UPLOADS_DIR happens to equal cwd/uploads (the out-of-the-box default) - exactly the same class of drift already flagged for the static /uploads mount in DM-003, but here it breaks the API route instead of the static file route, and does so unconditionally (not just for direct static links).
Affected files: server/routes.ts (POST /api/delivery/transports/generate-report handler, ~7666-7749, specifically the `path.relative(uploadsDir, filePath)` line), server/services/document-paths.ts:6 (getRelativePath, the correct pattern used everywhere else)
Affected data: documents id 223 (left in place - permanently 404 on download until fixed or UPLOADS_DIR is reset to the default).
Security impact: none.
Business impact: every transport report generated while UPLOADS_DIR is customized (which is exactly how this audit environment - and per shared/paths.ts's own comment, real deployments pointing at a persistent volume - are configured) is silently undownloadable after creation; the 201 response looked completely successful.
Fix (proposal only): change the generate-report handler to use the same getRelativePath(filePath) helper (relative to process.cwd()) that every other document-creating route already uses, instead of computing its own path.relative(uploadsDir, filePath).
Regression test (proposal): with UPLOADS_DIR set to a directory other than cwd/uploads, generate a transport report, then GET /api/documents/download/:id for the resulting document; expect 200 with the PDF, not 404.

BUG DM-007
Severity: LOW
Feature: PDF templates accept malformed `fields` with no shape validation; generation silently discards the malformed template instead of surfacing an error
Status: OPEN
Reproduction:
  1. POST /api/pdf-templates with fields as a genuinely double-stringified JSON value (JSON.stringify(JSON.stringify(fieldArray))) -> 201, stored fields is a literal string containing JSON text, not an array (template id 4).
  2. POST /api/pdf-templates with fields:["customerName","licensePlate","startDate"] (array of plain strings, not field objects with x/y/type) -> 201 (template id 5).
  3. POST /api/pdf-templates with fields:{"customerName":{"x":10,"y":10}} (an object, not an array) -> 201 (template id 6).
  4. GET /api/contracts/generate/3213?templateId=4 (and =5, =6) -> all three return 200 with a PDF sized ~310.8-310.9KB, matching the blank/fallback-template size (not the ~4KB size seen when a real custom-background template like id 7 is used), consistent with the route's try/catch around generateRentalContractFromTemplate silently catching whatever error these malformed shapes cause internally and falling back to the plain generateRentalContract instead of surfacing anything to the caller.
Expected: POST /api/pdf-templates should validate that fields, once normalized, is an array of objects with the expected keys (or reject with 400); at minimum, generation should indicate when it had to discard a broken template rather than returning an indistinguishable 200.
Actual: any JSON-serializable value is accepted for fields with no shape check (insertPdfTemplateSchema only inherits the drizzle-zod default for a jsonb column, no .refine()), and the generation route hides the resulting failure behind a full fallback.
Root cause: shared/schema.ts:1108's insertPdfTemplateSchema has no field-shape validation for the fields jsonb column; server/routes.ts's contract-generation handler wraps the whole custom-template attempt in one broad try/catch that falls back silently on any error (by design, for legacy-template compatibility, but with no operator-visible signal that it happened).
Affected files: shared/schema.ts:1096-1109 (pdfTemplates table / insertPdfTemplateSchema), server/routes.ts:5451-5560 (the try/catch around generateRentalContractFromTemplate)
Affected data: pdf_templates ids 4, 5, 6 (left in place, all AUDIT-prefixed).
Security impact: none.
Business impact: an admin who misconfigures a template's fields (e.g. a client-side bug that double-encodes the JSON before submitting) gets no error anywhere - the template "saves successfully" and later "generates successfully", but every contract using it is silently the wrong/blank layout, same operational risk class as DM-005.
Fix (proposal only): validate fields shape (array of objects, each with the expected key/x/y/type properties) in insertPdfTemplateSchema or in the POST/PATCH handlers; have the generation route return a distinguishable warning/flag when it had to fall back rather than swallowing the error entirely.
Regression test (proposal): POST a template with fields as a non-array; expect 400 rather than 201.

BUG DM-008
Severity: LOW
Feature: Multer upload-rejection errors leak full stack traces (500) instead of a clean 400
Status: OPEN
Reproduction:
  1. POST /api/pdf-templates/:id/background with an .svg file -> the fileFilter in createSecureMulterFilter correctly identifies and rejects it, but the rejection is thrown as a plain Error and surfaces as HTTP 500 {"error":"Server Error","message":"This file type is not permitted for security reasons","stack":"Error: ...\n    at ... fileUploadSecurity.ts:219:23\n    at wrappedFileFilter (multer/index.js:44:7)\n    ... 15 more stack frames with full local filesystem paths ..."}.
  2. Same for an .html upload, and for a PNG uploaded with a spoofed .html filename/mimetype (magic-byte check correctly still rejects it, same 500+stack response shape).
  3. Same for a 20MB background upload (over the 10MB configured limit): MulterError "File too large", again delivered as 500 with a full stack trace.
Expected: A rejected upload (wrong type, too large) is an ordinary client input-validation failure and should be a 400 with a short message, not a 500 with internals exposed.
Actual: 500, with the response body including the full Node stack trace and local filesystem paths (e.g. C:\Users\kees lam\Desktop\LVStest-main\LVStest-main\server\utils\security\fileUploadSecurity.ts:219:23).
Root cause: multer's fileFilter throw and MulterError (file-too-large) are not caught by a dedicated error handler before Express's generic error handler (server/index.ts, `app.use((err, _req, res, _next) => {...})`) picks them up; that handler status-codes based on err.status/err.statusCode (both undefined for these errors, defaulting to 500) and includes err.stack in the JSON body whenever `process.env.NODE_ENV !== 'production'`.
Affected files: server/utils/security/fileUploadSecurity.ts:219 (the thrown Error), server/routes/pdf-templates.ts:297-303 (the multer config with no per-route error handling), server/index.ts (the generic error handler)
Affected data: none.
Security impact: information disclosure (internal file paths, library versions/internals) to any authenticated user with MANAGE_PDF_TEMPLATES; confirmed this only happens because this audit server runs with NODE_ENV=development (per .env) - the packaged `npm run start` script sets NODE_ENV=production (package.json), which suppresses the stack field per server/index.ts's own guard, so this is not present via the documented production entrypoint. Still worth fixing since `npm run dev` is easy to run unintentionally in a container/deployment context.
Business impact: low; mostly a hardening gap rather than an active production issue given the NODE_ENV guard already in place.
Fix (proposal only): give multer's fileFilter/limit errors their own catch (e.g. wrap templateBackgroundUpload.single(...) calls the same way server/routes/portal.ts:307-311 already does for its own attachmentUpload - see that pattern already used correctly elsewhere in the codebase) and return a clean 400 with just the message.
Regression test (proposal): upload an .svg (or oversized file) as a template background; expect 400 with no stack field, regardless of NODE_ENV.

BUG DM-009
Severity: LOW
Feature: POST /api/documents crashes with a 500+stack trace instead of a clean 400 when required multipart fields arrive after the file part
Status: OPEN
Reproduction:
  POST /api/documents as multipart/form-data with the `file` part appearing BEFORE the `vehicleId`/`documentType`/`reservationId` parts in the request body (a client could easily produce this depending on how its FormData is built/iterated) -> 500 {"error":"Server Error","message":"Vehicle ID is required","stack":"Error: Vehicle ID is required\n    at createDocumentUploadStorage (server/routes.ts:4810:25)\n    at DiskStorage.destination (server/routes.ts:4876:7)\n ..."}. Reordering the same fields so vehicleId/documentType/reservationId precede `file` -> works normally (201).
Expected: A missing/not-yet-parsed vehicleId at the point multer's disk-storage `destination` callback runs should produce a clean 400 (same message, no stack), regardless of multipart field order - the required-ness of vehicleId shouldn't be sensitive to field ordering in the first place, or at minimum shouldn't crash-path when the ordering is "wrong".
Actual: throws inside multer's destination callback, which isn't wrapped in the same clean-error handling as the rest of the route, so it falls through to Express's generic error handler (see DM-008's same root pattern) - message content is fine, but status/format is not.
Root cause: server/routes.ts:4810's createDocumentUploadStorage reads req.body.vehicleId inside multer's synchronous destination callback, which runs as soon as the `file` field is encountered in the multipart stream - if vehicleId is declared later in the same request body, it hasn't been parsed into req.body yet, so the check throws.
Affected files: server/routes.ts:4810 (createDocumentUploadStorage), server/routes.ts:4876 (its use in the disk storage config)
Affected data: none.
Security impact: same information-disclosure class as DM-008 (stack trace with local paths), gated the same way by NODE_ENV.
Business impact: low; a client-side integration bug (wrong field order) surfaces as a confusing 500 with an internal stack instead of the intended clean validation message.
Fix (proposal only): either validate vehicleId from query params / a required-first field instead of relying on multipart ordering, or catch this specific throw and translate it into a normal 400 response the same way the rest of the route's validation failures are handled.
Regression test (proposal): POST /api/documents with the file part ordered before vehicleId; expect 400 with no stack field.

BUG DM-010
Severity: LOW
Feature: Deleting a PDF template leaves its background/preview files on disk
Status: OPEN
Reproduction:
  1. Created template id 8, uploaded a PNG background via POST /api/pdf-templates/8/background -> file written to audit-uploads/templates/template_8_background.png.
  2. DELETE /api/pdf-templates/8 -> 200 "Template deleted successfully".
  3. File still present on disk afterward (confirmed via directory listing).
Expected: Deleting a template should clean up its background/preview files (the upload handler itself already does this correctly when replacing a background - server/routes/pdf-templates.ts:337-345 - so the delete handler could reuse the same logic).
Actual: server/routes/pdf-templates.ts's DELETE handler (~268-293) only deletes the DB row; no fs.unlink call for backgroundPath/backgroundPreviewPath/templatePreviewPath.
Root cause: missing file cleanup in the delete handler, inconsistent with the upload handler which does clean up the previous file when a background is replaced.
Affected files: server/routes/pdf-templates.ts:268-293 (delete handler)
Affected data: audit-uploads/templates/template_7_background.png, template_8_background.png (orphaned, harmless test fixtures, left in place).
Security impact: none.
Business impact: slow disk-space leak over the lifetime of a deployment as templates are created/deleted; matches the same class of issue already flagged for vehicle deletion in the phase-1c architecture doc ("Voertuig verwijderen laat bestanden achter").
Fix (proposal only): in the DELETE handler, after confirming the template exists and before/after deleting the row, unlink backgroundPath/backgroundPreviewPath/templatePreviewPath if set (skip the shared default template file, same guard already used on replace).
Regression test (proposal): create a template with a background, delete the template, assert the background file no longer exists on disk.

BUG DM-012
Severity: CRITICAL
Feature: Expenses endpoints have no authentication at all — full anonymous CRUD + file upload/download
Status: OPEN
Reproduction (fresh cookie jar, zero login, throughout):
  1. GET / (unauthenticated) -> a valid XSRF-TOKEN cookie is still issued (CSRF protection here is a plain double-submit cookie unrelated to authentication, so it is not a meaningful barrier for a direct API caller).
  2. POST /api/expenses/with-receipt (multipart: vehicleId=2, category="AUDIT-Unauth", amount=12.34, date=2026-09-09, description="AUDIT unauth expense test", receiptFile=<small JPG>), with the CSRF header from step 1 but NO session cookie -> 201, full expense record returned (id 2001), "createdBy":null, and the receipt file physically written to disk at audit-uploads\12XT102\receipts\12XT102_receipt_audit-unauth_2026-09-09_<ts>.jpg.
  3. GET /api/expenses/2001/receipt (still unauthenticated) -> 200, the correct 22-byte JPG returned.
  4. PATCH /api/expenses/2001 (unauthenticated, full body: vehicleId, category, amount:999.99, date, description) -> 200, the expense fully updated.
  5. (Not separately re-tested here since the code path is identical: PATCH /api/expenses/:id/with-receipt has the same missing middleware per server/routes/expenses.ts:405, so it is presumed equally exploitable.)
Expected: All four routes should require, at minimum, MANAGE_EXPENSES the same as every other /api/expenses/* route (GET /api/expenses, GET /api/expenses/:id, DELETE /api/expenses/:id, POST /api/expenses, POST /api/expenses/scan, POST /api/expenses/from-invoice all correctly require it).
Actual: server/routes/expenses.ts:158 (`GET /api/expenses/:id/receipt`), :275 (`POST /api/expenses/with-receipt`), :341 (`PATCH /api/expenses/:id`), :405 (`PATCH /api/expenses/:id/with-receipt`) are registered with no `hasPermission`/`requireAuth` middleware whatsoever - anyone who can reach the server (no credentials, no session) can create expenses with uploaded receipts, read any expense's receipt by id, and modify any existing expense's amount/category/description/vehicle.
Root cause: these four route registrations were written without the `hasPermission(UserPermission.MANAGE_EXPENSES)` middleware that every sibling expenses route has; this exact gap was already flagged as the leading hypothesis in the phase-1 API/authorization architecture pass (docs/audit/01a-api-en-autorisatie.md line 19) and is now reproduced end-to-end with real data.
Affected files: server/routes/expenses.ts:158, 275, 341, 405
Affected data: expenses id 2001 (created anonymously), id 2002 ("2026-13-45" date test), id 2003 (vehicleId 999999 test) - all AUDIT-prefixed, left in place; receipt file audit-uploads\12XT102\receipts\12XT102_receipt_audit-unauth_2026-09-09_<ts>.jpg (left in place).
Security impact: complete, unauthenticated read/write/upload access to a financial record type (vehicle running costs / receipts) and to the file upload subsystem behind it - an anonymous actor can fabricate expense records (inflating or fabricating vehicle costs), tamper with existing ones (silently changing amounts on records staff already reviewed), exfiltrate any receipt by enumerating small integer ids, and use the upload path as a free anonymous file-drop (subject only to the multer file-type/size checks, not to any account being compromised).
Business impact: direct exposure to financial-record tampering/fraud (a competitor or disgruntled actor could alter real expense amounts, or a script could mass-create bogus expenses to corrupt cost reporting) with no audit trail pointing to a responsible user (createdBy is null on every anonymous write).
Fix (proposal only): add `hasPermission(UserPermission.MANAGE_EXPENSES)` to all four route registrations, matching every other route in this file.
Regression test (proposal): call each of the four routes with no Authorization/session cookie at all; expect 401 on every one.

BUG DM-013
Severity: LOW / INFORMATIONAL
Feature: /object-storage/* has no authentication middleware
Status: OPEN
Reproduction:
  GET /object-storage/anything with no session cookie at all -> 500 "Error loading file from object storage" (identical response with a valid admin session).
Expected: Consistent with every other file-serving surface in the app (/uploads is `requireAuth`-gated; /api/documents/view|download require MANAGE_DOCUMENTS), this route should require at least a session.
Actual: no auth middleware on `app.get('/object-storage/*', async (req, res) => {...})` at all.
Root cause: server/routes.ts:7338 - the route was written for a Replit-specific object storage sidecar (127.0.0.1:1106, per the phase-1c architecture doc) and never had auth added, presumably because it was expected to be inert outside Replit.
Affected files: server/routes.ts:7338-7353
Affected data: none - no content can currently be returned since the backing sidecar is unreachable in this environment.
Security impact: currently none (every request 500s regardless of auth state, confirmed identical for authenticated and unauthenticated calls), but this is a latent gap: if the app is ever deployed somewhere `objectStorageService.getFile()`/`downloadObject()` actually resolve (Replit itself, or a future non-Replit implementation of the same interface), this becomes an unauthenticated arbitrary-object-read endpoint with no code changes required to "activate" it.
Business impact: none today; worth closing before this dead code is ever revived.
Fix (proposal only): add `requireAuth` (matching the /uploads mount) to this route now, regardless of current reachability.
Regression test (proposal): none needed beyond a static check that the route declares requireAuth - the endpoint has no functional behavior to test against in this environment.
```
