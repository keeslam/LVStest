# CJIB fine import (FTPS, receive only) — design

Date: 2026-09-04. Branch: `feat/customer-portal`. Builds on the fines module
(`shared/fines.ts`, `server/services/fines-storage.ts`,
`server/services/fine-attribution.ts`, `server/routes/fines.ts`).

## Goal

The CJIB delivers "digitale beschikkingen" for rental companies as structured
files (XML or CSV) on a secured FTPS server. The app fetches those files on a
schedule, turns every record into a fine, links it automatically to vehicle,
reservation and driver, and tells staff what came in. Lam pays and recharges;
nothing is sent back to the CJIB.

The exact CJIB file format is not known yet. The parser therefore works with an
alias table per field and ships with two fixtures (XML and CSV) that document
the assumed layout. When the real specification arrives only the alias table
and the fixtures change.

## Out of scope

Return files to the CJIB (renter details), payment status sync, foreign
authorities, SFTP (CJIB uses FTPS; `basic-ftp` also does plain FTP for tests).

## Configuration

Stored as one JSON app setting `cjib_config` (same pattern as
`portal_config`), exposed on `GET/PUT /api/fines/cjib-config` (`manage_fines`):

```ts
interface CjibConfig {
  enabled: boolean;            // scheduler on/off
  host: string; port: number;  // default 990
  secure: 'implicit' | 'explicit'; // implicit TLS (990) or explicit AUTH TLS (21)
  username: string; password: string; // password stored like the SMTP password
  inboxDir: string;            // e.g. "/out" — where CJIB drops files
  processedDir: string;        // e.g. "/out/verwerkt" — moved here after processing; "" = leave in place
  pollMinutes: number;         // 5..1440, default 60
  filePattern: string;         // regex on file name, default "\\.(xml|csv)$"
}
```

`GET` returns the password masked as `"********"`; `PUT` keeps the stored
password when the masked value comes back. `POST /api/fines/cjib-config/test`
connects with the given (or stored) settings and returns the file list of the
inbox; no download.

## Data

New table `fine_import_files` (idempotent DDL in `startup-migration.js`):

| column | type | notes |
| --- | --- | --- |
| id | serial | |
| source | text | `cjib_ftps`, `cjib_upload` |
| file_name | text | |
| file_hash | text unique | sha256 of the raw bytes: a file is processed once |
| raw_path | text | copy under `uploads/cjib/` |
| status | text | `processed`, `failed` |
| records_total / records_created / records_linked / records_duplicate / records_failed | int | |
| error_message | text | parse or connection error |
| details | jsonb | per record: `{ reference, plate, fineId?, outcome, error? }` |
| received_at, processed_at | timestamp | |
| created_by | text | `scheduler` or staff username |

`fines` gets two nullable columns: `source` text (`manual`, `scan`, `cjib`;
existing rows stay null = manual) and `import_file_id` integer references
`fine_import_files(id) on delete set null`.

## Parsing

`server/services/cjib/parser.ts`:

- `parseCjibFile(buffer, fileName): CjibRecord[]` — detects XML (starts with
  `<`) or CSV (`;` or `,` separated with a header row). Throws with a clear
  message on an unreadable file.
- `CjibRecord = { reference, licensePlate, offenceAt (Date), description,
  amount, letterDate?, dueDate?, offenceCode?, location?, raw }`.
- Field aliases (case-insensitive, punctuation ignored) in `CJIB_FIELDS`:
  reference: `beschikkingsnummer, cjibnummer, cjib_nummer, kenmerk, zaaknummer`;
  plate: `kenteken, kentekennummer, licenseplate`;
  offence date: `pleegdatum, overtredingsdatum, datum_overtreding, datum`;
  offence time: `pleegtijd, tijd, tijdstip`;
  description: `feitomschrijving, omschrijving, feit, gedraging`;
  offence code: `feitcode, gedragingscode`;
  location: `pleeglocatie, plaats, locatie, straat`;
  amount: `bedrag, sanctiebedrag, boetebedrag, totaalbedrag`;
  letter date: `dagtekening, datumbeschikking, beschikkingsdatum`;
  due date: `vervaldatum, uiterstebetaaldatum`.
- XML: every element that has a reference and a plate child (at any depth) is a
  record; child element names are matched through the alias table. CSV: header
  columns matched through the alias table; `;` preferred, `,` fallback;
  decimal comma accepted.
- Dates: `dd-mm-yyyy`, `yyyy-mm-dd`, `yyyymmdd`; time `hh:mm` or `hhmm`.
  Missing time → 00:00. Plates normalised with `normalizeLicensePlate`.
- Description = feitomschrijving, with location appended when present, else
  `Feitcode <code>`.

## Import

`server/services/cjib/importer.ts` — `importCjibFile({ buffer, fileName,
source, createdBy })`:

1. Hash; if a `fine_import_files` row with that hash exists → return it with
   `skipped: true` (nothing created).
2. Save the raw file under `uploads/cjib/<timestamp>_<safe name>`.
3. Parse. A parse error stores a `failed` row and returns it.
4. Per record: reference already on a fine → `duplicate`; else create the fine
   (`source: 'cjib'`, `receivedAt` = letter date or today, admin fee from
   portal config, `createdBy`), run `attributeFine`, send the linked mail when
   linked (through the shared `createFineWithAttribution` helper that the
   manual route also uses from now on). Any error on one record is stored in
   `details` as `failed`; the rest continues.
5. Store counters and details, status `processed`.
6. `notifyStaffOfPortalEvent`-style in-app notification of type
   `portal_fine_import` (title "CJIB: n beschikkingen geïmporteerd", description
   with linked/unlinked/duplicate counts, link `/portal-admin?tab=fines`) plus
   the configured notification e-mail. Skipped files do not notify.

`server/services/cjib/ftps-client.ts` — thin wrapper over `basic-ftp`:
`withClient(config, fn)`, `listInbox(config)`, `download(config, name)`,
`moveToProcessed(config, name)`. Implicit TLS via `secure: 'implicit'`,
explicit via `secure: true`. Rejects unauthorised certificates by default.

`server/services/cjib/poller.ts` — `runCjibImport(trigger)`: connect, list
files matching `filePattern`, for each: download → `importCjibFile` → move to
`processedDir` (only when the import row is `processed` or `skipped`). Returns
a run summary `{ files, created, linked, duplicate, failed, errors[] }`.
A mutex prevents overlapping runs. `startCjibScheduler()` (called from
`server/index.ts`) reads the config, and when `enabled` schedules
`*/<pollMinutes> * * * *` with node-cron; `PUT` of the config restarts the
schedule. A connection error stores nothing in `fine_import_files` but is
kept in memory as `lastRun` for the UI.

## Routes (`server/routes/fines.ts`, prefix `/api/fines`)

| route | perm | does |
| --- | --- | --- |
| `GET /imports` | view_fines | last 100 import files, newest first |
| `GET /imports/status` | view_fines | `{ enabled, nextRunAt, lastRun }` |
| `POST /imports/run` | manage_fines | run the poller now, returns the summary |
| `POST /imports/upload` (multipart `file`) | manage_fines | import a CJIB file by hand, returns the import row |
| `GET /imports/:id/file` | view_fines | download the raw file |
| `GET /cjib-config`, `PUT /cjib-config`, `POST /cjib-config/test` | manage_fines | see Configuration |

`GET /api/fines` accepts `importFileId=` to list the fines of one file.

## Staff UI (dialogs only)

- Settings → tab Klantenportaal → new card "CJIB-koppeling" (`CjibConfigForm`):
  the fields above, "Verbinding testen" (shows file names), "Nu ophalen".
- Fines list dialog: button "CJIB-importen" opens `FineImportsDialog`
  (registered in `GlobalDialogContext` as `fineImports`): status line
  (enabled, next run, last run result), "Nu ophalen", "Bestand uploaden", and
  the table of import files (date, file, source, counts, status, error). A row
  opens the fines list dialog filtered on that file (`importFileId`).
- Dashboard: notifications of type `portal_fine_import` show up in the
  Meldingen panel; clicking follows the `?tab=fines` link.
- `FineDialog` shows "Bron: CJIB, bestand …" when `source = 'cjib'`.

## Tests

- `cjib-parser.test.ts`: XML fixture and CSV fixture under
  `server/__tests__/fixtures/cjib/`, alias matching, dates, decimal comma,
  unreadable file.
- `cjib-importer.test.ts`: creates fines and links to the covering reservation,
  second import of the same bytes is skipped, duplicate reference counted,
  failed record does not stop the file, notification created.
- `cjib-routes.test.ts`: upload route, imports list, config masking, run with
  a mocked ftps client.

## Deployment

`npm install` (adds `basic-ftp`, `fast-xml-parser`), run
`node -r dotenv/config startup-migration.js`, fill in the CJIB card in the
settings, test the connection, enable. The CJIB must whitelist the server's
outgoing IP.
