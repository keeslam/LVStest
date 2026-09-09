# Fase 1c — PDF/documenten, bestanden, e-mail, backups, achtergrondtaken (leesonderzoek)

2026-09-09, commit 3e28645e.

## PDF-generatoren

| Generator | Bestand | Trigger | Sjabloon | Opslag | Regeneratie |
|---|---|---|---|---|---|
| `generateRentalContractFromTemplate` | `server/utils/pdf-generator.ts:55` | `routes.ts:2705,4190,5505,5539,5736,5871,6004`, preview `routes/pdf-templates.ts:149` | `pdf_templates` (fields jsonb + backgroundPath, lokaal of object-storage) | `documents` + `uploads/<plate>/contracts/` of `uploads/contracts/<plate>/` | `services/reservation-pdf-regeneration.ts:94`, alleen bij ongesigneerd contract |
| `generateRentalContract` (legacy, vaste coördinaten) | `pdf-generator.ts:541` | fallback in `routes.ts:4191,5509,5551,5557,6010` | `uploads/templates/rental_contract_template.pdf` | idem | niet |
| `generateDamageCheckPDFWithTemplate` → `FromCanvas` | `server/pdf-damage-check-generator.ts:802,114` | `routes.ts:4348,6207,6718,6954,7145,7267` | `damage_check_templates.canvasFields`, headerimage uit app setting, `vehicle_diagram_templates` | `documents` + `uploads/<plate>/damage-checks/` | `:322` + `cleanupSupersededDamageCheckVersions` (`:220`) |
| `generateInteractiveDamageCheckPDF` | `pdf-generator.ts:968-1258` | **nergens aangeroepen** | – | – | dode code |
| `generateTransportReportsPdf` | `pdf-generator.ts:1450` | `routes.ts:7701`, preview `routes/report-and-label-templates.ts:88` | `transport_report_templates` | inline response, niet in `documents` | – |
| Barcodelabels | `client/src/components/barcodes/key-label-print.ts` | client-only | `barcode_label_templates` | HTML in iframe + `window.print()` | – |
| Barcode-PNG | `server/utils/barcode-png.ts` | in contract | – | ingebed | – |

Dubbele logica: `formatLicensePlate` 4× (`pdf-generator.ts:19`, `pdf-damage-check-generator.ts:13`, `rdw-api.ts:35`, `client/src/lib/format-utils.ts:57`); coördinaattransformatie editor→PDF 3× met afwijkende constanten (`pdf-generator.ts:449-461`, `:1417-1425`, `pdf-damage-check-generator.ts:700-713`); dode generator; twee JSON-veldparsers (`pdf-generator.ts:230-280`, `:1434-1443`).

## Sjablooneditors (client)

Contract (`pages/documents/template-editor.tsx` → `/api/pdf-templates*`), transportrapport (`transport-report-template-editor.tsx` → `/api/transport-report-templates*`), barcodelabel (`barcode-label-template-editor.tsx`, CRUD zonder preview), schadecheck-sjablonen (`pages/settings/damage-check-templates.tsx`, canvas-editor `damage-check-template-editor.tsx` 1263 r., studio-wrapper), voertuigdiagrammen inline vanuit `interactive-damage-check.tsx` en `documents/index.tsx`. Transportrapport- en labelroutes samen in `server/routes/report-and-label-templates.ts`.

## Bestanden

- Root `getUploadsDir()` (`shared/paths.ts:12`, `UPLOADS_DIR` of `cwd/uploads`); **`server/index.ts:337` serveert statisch `path.join(cwd,'uploads')`**, niet `getUploadsDir()`.
- Mappen: contracten (twee naamvarianten), schadechecks (`damage-checks`/`damage_checks`/`damage-check`), bonnen/verzekering per kenteken, templates, `vehicle-diagrams`, `fines`, `portal-requests`, `cjib` (sha256-naam, nooit verwijderd), backups (`getBackupPathFromEnv()`).
- Downloads `/api/documents/view|download/:id` (`routes.ts:~5111,~5165`): eigen `path.join(cwd, filePath)` + retry, niet via `resolveDocumentFilePath` (`server/services/document-paths.ts:16`); documentverwijdering (`routes.ts:5403-5427`) unlinkt zonder containment-check.
- Voertuig verwijderen (`database-storage.ts:535-618`): documentrijen weg in transactie, bestanden blijven op schijf.
- Prullenbak `deleted_records` (`shared/schema.ts:1941`): alleen `vehicle` (cascade-snapshot) en `fine` (`database-storage.ts:727`); andere types `unsupported_type` (`routes.ts:1730`). Endpoints `routes.ts:1694,1715`, admin.

## E-mail

`server/utils/email-service.ts`: config uit `app_settings` categorie `email` (`email_<purpose>` apk|maintenance|gps|documents|custom, fallback `:40-84`), afzender uit dezelfde rij; transporter gepoold/gecachet (`:246-270`); `sendEmail` (`:302`) logt zelf niets.

| Aanroeper | Doel | Log in `email_logs` | Bijlagen |
|---|---|---|---|
| `routes.ts:301` APK-bulk | apk | ja (`:338`) | – |
| `routes.ts:432` onderhoudsbulk | maintenance | ja (`:447`) | – |
| `routes.ts:5273` `POST /api/email/send-document` | documents | **nee** | 1 bestand |
| `routes.ts:5374` `send-documents` | documents | **nee** | meerdere |
| `services/portal-mail.ts` (invite, reset, e-mailwissel, nieuw apparaat, boete, antwoord, onderhoud) | custom | **nee** | – |
| `services/portal-notifications.ts:61` | default | **nee** | – |

`email_templates` gedeeld door bulksjablonen (`routes/email-templates.ts`) en portaalsjablonen (`portal-mail.ts:100-106`, seeding-aanroep niet gevonden in `index.ts`: verifiëren). Geen retry, geen idempotentie (dubbelklik = tweede mail + tweede token). SMTP niet geconfigureerd → `false`, geen exception, geen operatormelding.

## Backups

`server/backupService.ts` (1238 r.), `backupScheduler.ts`, `routes/backups.ts` (994 r.). DB: `pg_dump --clean --if-exists --no-owner --no-privileges` + gzip (`:239-282`), vereist `pg_dump` op PATH (`:259-260`). Bestanden: tar van `getUploadsDir()` (geen broncode, `:358-359`). Locatie: `BACKUP_PATH` → app setting → lokaal, met waarschuwing bij ontbreken (`backupScheduler.ts:19-35`). Retentie GFS (`:1129-1227`), nieuwste per type beschermd, geüploade bestanden nooit opgeruimd, `backup_runs` als `filePruned` bewaard. Manifest-sidecar met sha256. **Twee restore-implementaties**: upload-gebaseerd `restore-data` (`routes/backups.ts:173-331`, inline `psql`, drop-all, inhoud-sniff, safety backup, géén type-to-confirm) en `restore/database` (`:848` → `backupService.restoreDatabase` `:702`, wél `confirmFilename`). Zelfde dubbeling voor bestanden (`:452` vs `:896`). Alles achter MANAGE_BACKUPS.

## Achtergrondtaken

| Taak | Bestand | Schema | Schrijft | Fouten |
|---|---|---|---|---|
| Backup | `backupScheduler.ts:38` | 02:00 + inhaalslag 5 min na boot bij >24 u (`:67-83`) | `backup_runs`, bestanden | try/catch, log |
| RDW APK-scan | `apkScanScheduler.ts:15`, `rdw-apk-scanner.ts:30-66` | 02:30 | `apk_date_changes` | per voertuig geslikt; **serieel**, geen rate-limit |
| Service-due | `serviceDueScheduler.ts:18-27` | 03:00 + 60 s na boot | custom_notifications | try/catch |
| Portaalalerts | `portalAlertScheduler.ts:16` | 04:00 + 60 s na boot | portal_notifications | try/catch |
| CJIB-poll | `services/cjib/poller.ts:61-70` | dynamisch 5–1440 min | fine_import_files/details, fines | single-flight, per bestand/record |
| Sessie-cleanup | `utils/security/sessionManager.ts:186` | elke 60 min (`index.ts:456`) | verwijdert verlopen sessies | **geen try/catch** in interval |
| Preview-token-cleanup | `preview-token-service.ts:76-78` | elke 5 min, bij import | in-memory | ongeguard, andere levenscyclus |

## Externe diensten

RDW (`rdw-api.ts`, getypte fouten; scanner slaat not-found over), Gemini boetebrief (`fine-scanner.ts:82-105`, 5 modellen goedkoopst-eerst) en factuur (`invoice-scanner.ts:172-398`, expliciete keycheck), CJIB FTPS (`cjib/importer.ts`, hash- en referentiededup), `tesseract.js` **ongebruikt** (dependency zonder import), `server/objectStorage.ts:5-23` hardcoded Replit-sidecar `127.0.0.1:1106` — dood buiten Replit maar bereikbaar via `pdf-generator.ts:82-91` voor sjablonen met absoluut `backgroundPath`.

## Dubbele implementaties

1. Kentekenformattering 4×. 2. Coördinaatwiskunde 3× (afwijkend). 3. Dode schadecheck-generator. 4. Twee DB-restore-paden. 5. Twee bestands-restore-paden. 6. Documentpad-resolutie op 4 manieren (`document-paths.ts:16` vs `routes.ts:5129-5140`, `:5183-5194`, `:5255`, `:5351`, `:5417-5427`). 7. Twee sjabloonveld-parsers.

## Risico's

1. `server/index.ts:336-337` statische uploadsmap negeert `UPLOADS_DIR`.
2. Documentverwijdering zonder padcontainment (`routes.ts:5417-5427`).
3. Voertuig verwijderen laat bestanden achter (`database-storage.ts:592-593`).
4. Inconsistente mapnamen per kenteken op schijf.
5. Eén `email_templates`-tabel voor twee doelen; portaalsjablonen kwetsbaar voor hernoemen/verwijderen via generieke CRUD.
5. Documentmails en alle portaalmail niet in `email_logs`.
7. Geen retry/idempotentie bij mail.
8. RDW-scan serieel zonder limiet.
9. Sessie-cleanup zonder try/catch (`sessionManager.ts:187-190`).
10. Replit-sidecar-pad latent crashpad (`objectStorage.ts:8-23`).
11. Ongebruikte `tesseract.js`.
12. Prullenbak dekt alleen voertuigen en boetes (`database-storage.ts:645`).
