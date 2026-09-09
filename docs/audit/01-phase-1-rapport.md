# PHASE 1 REPORT — Complete application discovery

Datum 2026-09-09, commit 3e28645e. Deelrapporten: `01a-api-en-autorisatie.md`, `01b-frontend-en-werkprocessen.md`, `01c-documenten-mail-backup-jobs.md`, `01d-domein-en-data-integriteit.md`. Alles in deze fase is leesonderzoek; niets is runtime-bewezen of gewijzigd.

## Application overview

Auto Lease LAM / Car Rental Manager: interne beheerapp voor een autoverhuur-/leasebedrijf (Lam Groep) plus een klantenportaal (`/portaal`). Eén Express-proces serveert API, statische SPA, uploads, Socket.IO en cron-taken; één PostgreSQL-database. Productie in Docker op Coolify, poort 3000.

## Architecture

```
UI (React 18 SPA: staff onder /, portaal onder /portaal; wouter, TanStack Query, shadcn)
 ↓  apiRequest / portalFetch (JSON, FormData), Socket.IO voor cache-invalidatie
API (Express: server/routes.ts 121 endpoints + 22 modules in server/routes/, portal-auth.ts; 352 endpoints)
 ↓
Auth/authz: staff Passport-sessie 15 min rolling + CSRF-HMAC + hasPermission (rol admin omzeilt); portaal eigen Passport-realm, 1 u idle, eigen CSRF, scoping per klant/bestuurder
 ↓
Business logic: server/database-storage.ts (4476 r.) achter `storage`-interface; services/ (portal-*, driver-assignments, booking-period, cjib, reservation-pdf-regeneration, document-paths); vehicle-status-helper.ts (deels dood)
 ↓
Database: Drizzle → Postgres, 47 tabellen; veel FK's niet afgedwongen; 9 transacties in totaal
 ↓
Files (uploads/<kenteken>/…, templates, backups), PDF (pdf-lib), e-mail (nodemailer, config in DB), RDW, Gemini, CJIB-FTPS, Nominatim/OSRM, cron (backup 02:00, RDW 02:30, service-due 03:00, portaal 04:00, CJIB-poll, sessie-cleanup)
```

## Feature inventory

Dashboard (widgets, quick actions, backup-stalenessbanner) · Voertuigen (CRUD, bulkimport, prullenbak, barcodes/labels, documenten, historie, APK/garantie/km/service-interval, BV/Opnaam-registratie) · Scannen (barcode → ophalen/inleveren/onderhoud/kosten/brandstof/km/document) · Klanten (CRUD, bestuurders, blacklist, portaalaccount) · Reserveringen (kalender, formulier, ophalen met contractnummer + schadecheck, inleveren, status terugdraaien, vervangers, onderhoud markeren/terug uit service, overdue) · Onderhoud (kalender, blokken, APK-/garantie-/servicemeldingen, vervanger/TBD) · Transporten/bezorging (transporten, routeoptimalisatie, vervangerprompt, rapport-PDF, bulk print/afronden) · Kosten (bonnen, Gemini-factuurscan) · Documenten (bibliotheek, contract-/transport-/label-/schadecheck-sjablooneditors, interactieve schadecheck) · Communicatie (bulkmail APK/onderhoud/custom, mailsjablonen) · Rapporten (financieel, operatie, kosten, voertuigen, klanten, transporten, report builder) · Boetes (staff: invoer, scan, CJIB-import, koppeling; portaal: inzien) · Klantenportaal-beheer (dashboard, accounts, aanvragen, blacklist, config) · Klantenportaal (reserveringen, voertuigen, bestuurders, contracten met akkoord, boetes, aanvragen incl. boeking/verlenging/onderhoud/wijziging, meldingen, account) · Beheer (instellingen, gebruikers/permissies, backup/restore, activiteitenlog, profiel) · Meldingen (custom_notifications, RDW-APK-wijzigingen).

## User roles

- Staff (`users.role`): admin, manager, user, cleaner, viewer, accountant, maintenance; 25 permissies in `users.permissions` (jsonb), onafhankelijk van rol; admin omzeilt alles server- en client-side. Frontend verbergt alleen navigatie; geen route-guard.
- Portaal (`portal_users.role`): admin (alle klantfuncties binnen klantschakelaars), driver (alleen eigen huur). Klantschakelaars in `portal_customer_settings`, accountpermissies kunnen alleen beperken.

## Major business entities

vehicles, customers, drivers, reservations (type standard | replacement | maintenance_block; soft delete), vehicle_transports, delivery_tasks, documents, interactive_damage_checks, expenses, fines (+ import files), portal_users/settings/requests/messages/notifications/document_acks/activity_log, reservation_driver_assignments, vehicle_customer_blacklist, deleted_records, sjabloontabellen (pdf, damage-check, transport-report, barcode-label, vehicle-diagram), settings/app_settings, email_templates/logs, backup_settings/runs, users/audit/session-tabellen.

## Major workflows

1. Klant → reservering → ophalen (contractnummer, km, brandstof, schadecheck, contract-PDF) → inleveren → afronden.
2. Onderhoud: markeren → blok in kalender → vervanger (TBD placeholder of auto) → uitvoeren → terug uit service.
3. Transport/bezorging: transport → planning → vervanger → transportdag → afronden → rapport-PDF.
4. Documenten: genereren → preview → corrigeren → regenereren → printen/mailen.
5. Boetes: invoer/scan/CJIB → automatische toewijzing via bestuurdershistorie → koppelen → portaal.
6. Klantenportaal: uitnodigen → activeren → boeken/aanvragen → staff keurt goed (reservering of onderhoudsblok) → meldingen/mail.
7. Beheer: backup/restore, gebruikers, instellingen, mailsjablonen.

## External dependencies

PostgreSQL, SMTP (config in DB), RDW open data, Google Gemini (`GEMINI_API_KEY`), CJIB FTPS, Nominatim + OSRM, Replit object-storage-sidecar (legacy, dood buiten Replit), pg_dump/psql in het image, Coolify.

## Shared services

`storage` (DatabaseStorage), `portalStorage`, `requestsStorage`, `finesStorage`, `customerNotifications`, `notifyStaffOfPortalEvent`, `AuditLogger` + `auditMutations`, `resolveDocumentFilePath`, `createSecureMulterFilter`/`validateAfterUpload`, `checkReservationConflicts`, `syncVehicleAvailabilityWithReservations`, `reservation-pdf-regeneration`, `email-service`, `backupService`, realtime `broadcastDataUpdate`, `shared/transport-spare-status.ts`.

## Duplicated functionality

- Beschikbaarheid/overlap: 5 implementaties met verschillende regels (1d §3).
- Reserveringsstatus: 3 encoderingen van transities (1d §2).
- Voertuigstatus: helper (grotendeels dood) vs sync vs inline pickup/return.
- Kentekenformattering 4×; PDF-coördinaatwiskunde 3×; dode schadecheck-generator; twee sjabloonveld-parsers (1c).
- Documentpad-resolutie 4 varianten, waarvan 1 met traversal-guard (1c).
- Restore DB en bestanden elk 2 paden met verschillende veiligheidschecks (1c).
- Mailsjablonen op twee plekken in de UI en één tabel voor twee doelen (1b, 1c).
- "Terug uit service" 2× (dialoog + inline kalender) (1b).
- Dialoogstate voor voertuig/klant/reservering in MainLayout naast GlobalDialogContext (1b).
- Auditlog: middleware + handmatige logs → dubbele rijen (1d §7).
- `requireAdmin` 2× (1a).

## High-risk areas

Beveiliging (te bewijzen in fase 6–8): Socket.IO zonder auth met volledige records; expenses-endpoints zonder login; open RDW-proxy en `/object-storage/*`; reserveringen verwijderen, interactive damage checks, diagram-sjablonen, contracten, system-settings, bulkmigratie met alleen `requireAuth`; `/api/settings` op backup-permissie; wachtwoorden onversleuteld in DB; geen rate limit ingelogd; documentpaden buiten de guard.

Data-integriteit (fase 9–13): conflictcheck zonder lock → dubbele boeking; klant verwijderen hard + cascade zonder snapshot; status omzeilt statusmachine; API boekt niet-verhuurbare auto; pickup/return niet-atomair; contractnummer race; FK-loze verwijzingen; dode statushelper; recurring zonder implementatie.

Documenten/mail/backup (fase 14–17): statische uploads negeren `UPLOADS_DIR`; verwijderen zonder padcontainment; bestanden blijven achter na voertuigdelete; mail zonder log/retry; Replit-sidecarpad; restore zonder type-to-confirm op uploadpad.

Frontend/werkproces (fase 18–32): hele tabellen client-side; geen ErrorBoundary; geen route-guard; statusovergang via omweg; nauwelijks verplichte velden; geen bulkacties; mobiel zwak; debuglogs.

Operationeel: geen CI/lint/E2E; tests op gedeelde dev-DB; Coolify-start negeert migratiefouten.

## Unknowns (te sluiten in fase 2+)

- Of `ensurePortalEmailTemplates()` bij boot wordt aangeroepen.
- Werkelijke rollen/permissies van de productiegebruikers.
- Of `POST /api/fines` en de generieke fine-PATCH `status` echt accepteren.
- Gedrag van `apiLimiter`-skip en lockout onder echte load.
- Welke sjablonen in productie een absoluut `backgroundPath` (Replit) hebben.
- Staat van de productie-uploadsmap (mapnaamvarianten).
- Uitkomst van de security-scan van 2026-08-27.
