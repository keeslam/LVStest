# Fase 1a — API- en autorisatie-inventaris

Leesonderzoek, 2026-09-09, commit 3e28645e. Nog niets runtime-getest; alle bevindingen zijn kandidaten voor fase 6–8.

## Auth-model

- Staffrollen (`users.role`): admin, manager, user, cleaner, viewer, accountant, maintenance (`shared/schema.ts:7-15`).
- Permissies (`UserPermission`, `shared/schema.ts:73-124`): manage_users, manage_vehicles, view_vehicles, manage_customers, view_customers, manage_reservations, view_reservations, authorize_mileage_decrease, manage_maintenance, manage_expenses, manage_documents, manage_pdf_templates, manage_damage_checks, view_damage_checks, manage_reports, view_reports, manage_backups, manage_settings, manage_email_templates, manage_notifications, manage_portal, view_portal, manage_fines, view_fines, view_dashboard.
- `hasPermission(...)` (`server/middleware/permissions.ts`): 401 zonder user; rol admin omzeilt alle checks; anders check op `users.permissions` (jsonb, losstaand van de rol). `requireAdmin` kijkt alleen naar rol. Dubbele `requireAdmin` in `server/auth.ts:210`.
- Staffsessie (`server/auth.ts`): cookie 15 min rolling, httpOnly, sameSite strict, secure auto; sessie geregenereerd bij login. CSRF: HMAC-token aan sessie, 24 uur, verplicht op alle niet-GET; alleen `/api/login` vrijgesteld. Login-limiter 5/15 min per IP plus account-lockout na 5 fouten (tabel `login_attempts`). `apiLimiter` (1000/15 min) wordt overgeslagen voor ingelogde verzoeken.
- Portaalrealm (`server/portal-auth.ts`): eigen Passport, cookie `portal.sid` 1 uur idle, sameSite lax; eigen CSRF (`PORTAL-XSRF-TOKEN`), vrijgesteld: login, forgot, activate, email/confirm. `requirePortalUser` herlaadt account + klantinstellingen per verzoek; `requireFeature` = klantschakelaar EN accountpermissie; `requirePortalRole('admin')`; eigen lockout per e-mail. Alle portaalhandlers scopen op `ctx.customerId`/`ctx.scope` (driver alleen eigen huur); in de gelezen `:id`-routes geen IDOR gevonden.

## Endpoint-inventaris (afwijkingen)

| Endpoint | Middleware | Opmerking |
|---|---|---|
| `GET /api/rdw/vehicle/:licensePlate` (`server/routes.ts:1930`) | geen | open RDW-proxy |
| `GET /object-storage/*` (`routes.ts:7338`) | geen | ongeauthenticeerd lezen van opslagobjecten |
| `GET /api/expenses/:id/receipt`, `POST /api/expenses/with-receipt`, `PATCH /api/expenses/:id`, `PATCH /api/expenses/:id/with-receipt` (`server/routes/expenses.ts:158,275,341,405`) | geen | upload, aanmaken, wijzigen en downloaden zonder login |
| `DELETE /api/reservations/:id` (`routes.ts:4621`) | requireAuth | geen MANAGE_RESERVATIONS; cascadeert naar vervangers |
| `/api/placeholder-reservations*`, `PATCH /api/reservations/:id/spare-status`, `GET /api/spare-vehicles/available`, `GET /api/vehicles/:vehicleId/customers-with-reservations` | requireAuth | geen permissie |
| `POST /api/migrate/customer-drivers` (`routes.ts:6572`) | requireAuth | bulkactie |
| `/api/contracts/generate*`, `/preview*`, `/data/:id` (`routes.ts:5451-6117`) | requireAuth | elke ingelogde rol kan contracten genereren/inzien |
| `/api/vehicles/:id/damage-check-pdf` (`routes.ts:6641`) | requireAuth | |
| `/api/interactive-damage-checks*` incl. DELETE (`routes.ts:6783-7335`) | requireAuth | geen MANAGE_DAMAGE_CHECKS |
| `vehicle-diagram-templates` CRUD incl. upload (`server/routes/vehicle-diagram-templates.ts:89,138,211`) | requireAuth | zustermodules eisen MANAGE_* |
| `/api/settings*` (`server/routes/settings.ts:15-206`) | MANAGE_BACKUPS | vermoedelijk verkeerde permissie |
| `GET/PUT /api/system-settings` (`server/routes/app-settings.ts:431,463`) | requireAuth | schrijven van systeeminstellingen zonder permissie |
| `GET /api/documents/view/:id`, `/download/:id` (`routes.ts:5111,5165`) | MANAGE_DOCUMENTS | pad handmatig samengesteld, niet via `resolveDocumentFilePath` |

Consistent en zonder gaten gevonden: fines, portal-admin, portal-requests, pdf-templates, damage-check-templates, report-and-label-templates, reports, custom-notifications, backups (alle MANAGE_BACKUPS, bestandsnamen gevalideerd), users (zelf-update met veldwhitelist), router-gemonteerde modules (auth bij mount in `server/index.ts:351-356`).

## Uploads en downloads

Alle multer-instanties gebruiken `createSecureMulterFilter` (extensie-allowlist, MIME-check, magic-byte-controle via `file-type`, blocklist voor svg/html/scripts) behalve `importUpload` (CJIB, geheugen, 20 MB, geen filter). Limieten 5–25 MB; backupupload 1 GB. `sanitizeFilename` op bestandsnamen. `resolveDocumentFilePath` (`server/services/document-paths.ts`) weigert paden buiten de uploadmap en wordt gebruikt door portaal- en boeteroutes; `documents/view|download` en `expenses/:id/receipt` bouwen paden zelf (uit DB, niet uit request). `validateAfterUpload` controleert opgeslagen bestanden en verwijdert bij mismatch.

## Uitgaande verbindingen

| Trigger | Doel | Gebruikersinvoer |
|---|---|---|
| RDW-proxy + voertuig aanmaken/bewerken | opendata.rdw.nl (`server/utils/rdw-api.ts:140`) | kenteken genormaliseerd naar `[A-Za-z0-9]` |
| Bonnen-/boetescan | Google Gemini (`GEMINI_API_KEY`) | geüploade bestanden met klant-/financiële gegevens naar externe partij |
| E-mail | SMTP via nodemailer, config uit `app_settings` (`server/utils/email-service.ts:103`) | SMTP-wachtwoord onversleuteld in DB |
| CJIB-import | FTPS (`server/services/cjib/ftps-client.ts`), rejectUnauthorized true | wachtwoord onversleuteld in DB, gemaskeerd bij uitlezen |
| Bezorging | Nominatim + OSRM | vrije adresvelden naar externe geocoders |

## Realtime

Socket.IO (`server/index.ts:196-237`) zonder authenticatie op de verbinding; `broadcastDataUpdate` (`server/realtime-events.ts:11-23`) doet `io.emit` naar alle sockets met volledige records (users zonder wachtwoord, vehicles, customers, reservations, expenses, documents, notificaties, portaalmeldingen). CORS `*` in development.

## Toprisico's (kandidaten, te bewijzen in fase 6–8)

1. Socket.IO zonder auth broadcast klant-, financiële en gebruikersgegevens.
2. Expenses-uploads/-downloads volledig open.
3. Open RDW-proxy.
4. `/object-storage/*` open.
5. Reservering verwijderen zonder permissie.
6. Interactive damage checks CRUD zonder permissie.
7. Bulk-migratieroute zonder permissie.
8. Voertuigdiagram-templates zonder permissie.
9. Contractendpoints zonder permissie.
10. SMTP/FTPS-wachtwoorden onversleuteld.
11. Documentroutes buiten de centrale padcontrole.
12. `/api/settings` op de backup-permissie.
13. `system-settings` schrijfbaar met alleen login.
14. Geen rate limit voor ingelogde sessies.
15. Uploads naar Gemini zonder redactie.
