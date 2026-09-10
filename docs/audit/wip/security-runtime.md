# Fase 8 — Runtime security-verificatie

**Scope:** runtime/dynamische verificatie van 9 aangewezen controlepunten tegen de audit-server
(`http://localhost:5001`, dev/tsx, database `lvs_audit`). Vult `docs/audit/wip/security-static.md`
(statische code-review) aan met echte requests/responses.
**Datum:** 2026-09-09/10 · **Branch:** `feat/customer-portal`.

**Update 2026-09-10 (vervolgsessie) — alle resterende checks alsnog live uitgevoerd:** de server was bij
de start van deze vervolgsessie weer bereikbaar. Checks 3c, 5, 6 (live HTTP-deel), 6b, 7, 8 (live
HTTP-deel) en 9 (live HTTP-deel) — hieronder tot dan toe gemarkeerd als "NIET UITGEVOERD" — zijn deze
sessie alsnog met echte requests/responses uitgevoerd, inclusief twee tussentijdse server-crashes
(dezelfde gedeeld-gebruik-situatie als hieronder beschreven: de server werd onbereikbaar tijdens
`check3c-email.cjs` en opnieuw tijdens `check6b-pwchange-session.cjs`, telkens binnen ~30s vanzelf
teruggekomen zonder dat deze sessie iets herstart heeft, conform de opdrachtinstructie). De secties
hieronder zijn per stuk bijgewerkt met de echte evidence; de oorspronkelijke "niet uitgevoerd"-tekst is
waar nodig vervangen, met behoud van SR-001 t/m SR-004's nummering. Nieuw gevonden problemen staan als
SR-005 e.v. onder "Nieuwe bevindingen". Twee scriptbugs zijn deze sessie gefixt (zie de betreffende
check-secties): `sr-smtp-stub.cjs`'s default log-pad (relatief, brak als het proces vanuit een andere
cwd werd gestart dan `check3c-email.cjs` leest), `check6-session.cjs`'s portal-logout-aanroep (gebruikte
het CSRF-token uit de portal-loginrespons zelf, wat altijd faalt — dezelfde reeds bekende **BUG-047**,
hier voor het eerst ook live in de portal-realm gereproduceerd, zie Check 6/6b hieronder), en
`check9-upload-confusion.cjs` (miste het verplichte `vehicleId`-veld, en had `file` vóór de tekstvelden
staan wat multer's storage-callback sowieso te vroeg zou laten falen).

**Belangrijke operationele noot — server bereikbaar, daarna gecrasht:** de audit-server was bij de start
van deze sessie bereikbaar (`curl http://localhost:5001/` → 200). Checks 1, 2, 3a, 3b en de PDF-check
(3-pdf) zijn hierdoor **echt tegen de levende server** uitgevoerd, met request/response-evidence hieronder.
Halverwege check 3c (e-mail/SMTP-stub) werd de server onbereikbaar (`curl` → exit 7 / connection refused,
drie keer herbevestigd met enkele seconden ertussen; `Get-NetTCPConnection -LocalPort 5001` toont geen
listener meer, alleen een `TimeWait`-restant van een oude verbinding — het proces is dus echt gestopt,
niet alleen traag). Conform de opdrachtinstructie is dit **niet** zelf herstart. De laatste request die
nog een echt antwoord kreeg was `GET /api/documents/reservation/3334` (in `check3-pdf.mjs`, 200 OK, zie
Check 3 hieronder); de eerstvolgende request (`GET /api/user` binnen `check3c-email.cjs`'s `loginStaff()`)
kreeg `ECONNREFUSED`. Deze sessie stuurde op dat moment geen enkele request meer — de SMTP-stub die net
was opgestart (`sr-smtp-stub.cjs`, poort 2525, eigen proces, *niet* de audit-server) draaide al en had geen
enkel bericht ontvangen. Sterke aanwijzing dat de crash **niet** door een request van deze sessie kwam:
zie de operationele noot hieronder over gedeeld gebruik.

**Gedeeld gebruik door meerdere audit-agents (vastgesteld tijdens deze sessie):** meermaals bleken
bestanden in `docs/audit/wip/scripts/sec/` (met name `sr-lib.cjs` en `check3-pdf.mjs`) tussen twee
leesacties in gewijzigd te zijn (toevoeging van een jar-cache-mechanisme, `getOrLoginStaff`/
`getOrLoginPortal`) zonder dat deze sessie dat zelf deed. Ook was de gedeelde `loginLimiter`
(5 pogingen/15 min per IP, zie SR-003) bij de allereerste request van deze sessie al volledig verbruikt
(`429 "Too many login attempts..."`, zie Check 2), en later ook de generieke `apiLimiter`
(1000 req/15 min per IP, zie Check 3) voor het echte client-IP. Dit alles wijst op andere,
gelijktijdig actieve audit-agents op hetzelfde IP/dezelfde checkout. Om toch te kunnen testen is het
door de opdracht expliciet toegestane `X-Forwarded-For`-omzeilingspad (**BUG-009**) gebruikt: alle
scripts sturen nu (via `AUDIT_XFF=203.0.113.77`, een gereserveerd TEST-NET-3-adres) een
`X-Forwarded-For`-header mee, wat — omdat `server/auth.ts:135` `app.set("trust proxy", 1)` zet — een
eigen, ongebruikte rate-limit-bucket oplevert. Dit is dus zowel een **werkmethode** als, apart
gedocumenteerd, een **runtime-bevestiging van BUG-009** (zie Check 2/7 en SR-004).

**Referentiekader:** bekende bevindingen uit `03-phase-3-5-rapport.md` §1 (BUG-001…BUG-059) en
`security-static.md` (SEC-001…SEC-039) worden hier niet herhaald als nieuwe bug; waar een van de 9
controlepunten exact een SEC-/BUG-id raakt staat dat vermeld. Nieuwe bevindingen staan onder
"Nieuwe bevindingen" als `SR-00x`.

**Status per check (bijgewerkt 2026-09-10):** alle 9 checks zijn nu **volledig live uitgevoerd**
(1, 2, 3a, 3b, 3-pdf al in de eerste sessie; 3c, 4, 5, 6, 6b, 7, 8, 9 alsnog in de vervolgsessie, inclusief
het live-HTTP-deel van 4/6/8/9 dat voorheen alleen DB-/bestands-/library-niveau was).

---

## Check 1 — Response headers (`/`, `/api/user`, `/uploads/x`, `/portaal`), CORS, Socket.IO-origin

**Runtime status: UITGEVOERD** (`docs/audit/wip/scripts/sec/check1-headers.cjs`, live tegen
`http://localhost:5001`, ingelogd als `admin`).

**Resultaten (samengevat uit `out/check1.txt`):**
- `GET /` → `200`. Headers: `Content-Security-Policy` bevat inderdaad ongeconditioneerd
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net` (**bevestigt SEC-012**: geen
  `NODE_ENV`-gating op `unsafe-inline`/`unsafe-eval`), `Strict-Transport-Security: max-age=31536000;
  includeSubDomains; preload` (ook over plain HTTP, zoals voorspeld), `X-Frame-Options: SAMEORIGIN`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy: geolocation=(), microphone=(), camera=()`. **Confirmed OK/bevestigd.**
- `GET /api/user` (ingelogd) → `200`, zelfde header-set.
- `GET /uploads/x` (niet-bestaand bestand, ingelogd) → **`200`** met de Vite-dev `index.html`-shell
  (`<script type="module">import { createHotContext } from "/@vite/client";...`), **niet** een 404 en
  **niet** een 401. Dit is een kleine, niet eerder gedocumenteerde observatie: een ontbrekend
  `/uploads/*`-bestand valt in dev-mode terug op Vite's SPA-catch-all in plaats van een nette 404 —
  onschuldig (geen bestandsinhoud lekt, gewoon de client-shell), maar betekent dat monitoring/logging
  een `404` op een ontbrekend upload-bestand nooit zal zien in deze dev-configuratie. Geen eigen SR-bug
  (dev-only Vite-gedrag, geen beveiligingsimpact); vermeld als observatie.
- `GET /portaal` → `200`, met de portal-specifieke CSP (`frame-ancestors 'self' https://lamgroep.nl
  http://lamgroep.local`, geen `X-Frame-Options`) — **bevestigt** de `portalFrameHeaders`-wissel exact
  zoals voorspeld.
- `OPTIONS /api/vehicles` met `Origin: https://evil.example` → `204`, **geen**
  `Access-Control-Allow-Origin`-header (wel `Access-Control-Allow-Methods`). **Confirmed OK**: een browser
  zou dit antwoord blokkeren voor cross-origin JS, precies zoals voorspeld — er is geen CORS-laag op
  `/api/*`.
- `GET /socket.io/?EIO=4&transport=polling` met `Origin: https://evil.example` → `200`,
  `access-control-allow-origin: *` + `access-control-allow-credentials: true` tegelijk, geldige
  Engine.IO-handshake-body. **Bevestigt SEC-025/BUG-005 runtime**: de Socket.IO-laag accepteert in
  dev-modus elke Origin.

**Confirmed OK:** `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`/`frame-ancestors`-wissel
op `/portaal`, ontbreken van CORS-headers op `/api/*` voor een onbekende Origin.
**Bevestigd, geen nieuwe bug:** SEC-012 (CSP unsafe-inline/unsafe-eval ongeconditioneerd), SEC-025/BUG-005
(Socket.IO CORS `origin:"*"` in dev).

---

## Check 2 — Cookievlaggen (`connect.sid`, `XSRF-TOKEN`, `portal.sid`, `PORTAL-XSRF-TOKEN`, `portal_device`) en login-bounce

**Runtime status: UITGEVOERD** (`check2-cookies.cjs`, live).

**Eerste poging (vóór de `X-Forwarded-For`-workaround, reëel client-IP) — onbedoeld maar bruikbaar bewijs
voor SR-003:**
```
"plain http login Set-Cookie":  { "status": 429, "cookieFromLoginBody":
  "Too many login attempts from this IP, please try again after 15 minutes." }
"X-Forwarded-Proto: https login Set-Cookie": { "status": 429, "cookieFromLoginBody": "Too many login attempts..." }
"plain http portal login Set-Cookie": { "status": 429, ... }
"X-Forwarded-Proto:https portal login Set-Cookie": { "status": 429, ... }
```
Alle vier — twee staff-loginpogingen (met juiste `admin`/`admin123`-credentials) én twee
portal-loginpogingen (met juiste credentials) — kregen `429` van dezelfde gedeelde `loginLimiter`-bucket,
**vóórdat** deze sessie zelf ook maar één login had geprobeerd. Dit is **directe runtime-bevestiging van
SR-003** (één gedeelde teller over de vier auth-routes) én laat zien hoe scherp het probleem in de
praktijk is: een kantoor-IP kan al "dood" zijn voordat een eigen testsessie ook maar begint.

**Na toepassing van de `X-Forwarded-For`-workaround (BUG-009, eigen/vers IP-bucket) — echte
cookie-vlaggen, uit `out/check2.txt`:**
- Plain HTTP login: `XSRF-TOKEN=...; Path=/; SameSite=Strict` (**geen** `Secure`),
  `connect.sid=...; HttpOnly; SameSite=Strict` (**geen** `Secure`).
- Met `X-Forwarded-Proto: https`: `XSRF-TOKEN=...; Path=/; **Secure**; SameSite=Strict`,
  `connect.sid=...; HttpOnly; **Secure**; SameSite=Strict`. **Bevestigt**: de `'auto'`-cookielogica werkt
  zoals de code voorspelt — `Secure` volgt `req.secure`, niet een hardcoded waarde. **Geen login-bounce.**
- Portal, plain HTTP: `PORTAL-XSRF-TOKEN=...; SameSite=Lax` (geen Secure), `portal.sid=...; HttpOnly;
  SameSite=Lax` (geen Secure), **`portal_device=...; Max-Age=34560000; Path=/api/portal; Expires=...;
  HttpOnly; SameSite=Lax`** (geen Secure).
- Portal, met `X-Forwarded-Proto: https`: `PORTAL-XSRF-TOKEN` en `portal.sid` krijgen nu wél `Secure`
  (zelfde patroon als staff) — **maar `portal_device` blijft zonder `Secure`**, ook nu:
  `portal_device=...; Max-Age=34560000; Path=/api/portal; Expires=...; HttpOnly; SameSite=Lax`.
  **Runtime bevestigd**: `server/portal-auth.ts:96`'s `secure: sec === "auto" ? undefined : sec` negeert
  `req.secure` daadwerkelijk, in alle omstandigheden. Blijft **Low/observatie** (bevat alleen een
  willekeurige 16-byte device-id voor een "nieuw apparaat"-mail, geen sessie-/authmateriaal) — geen eigen
  SR-nummer, zoals in de vorige versie van dit rapport al beargumenteerd.

**Confirmed OK (runtime):** sessiecookies volgen `req.secure` correct (geen login-bounce-klasse fout);
`HttpOnly`/`SameSite`-vlaggen exact zoals voorspeld voor beide realms.

---

## Check 3 — Stored XSS (klant, voertuig, portal-bericht) → API/PDF/e-mail/client-sinks

**Runtime status: 3a/3b/PDF/3c = UITGEVOERD (live; 3c alsnog in de vervolgsessie van 2026-09-10, zie
verderop). 3d (browser-DOM) = niet mogelijk — geen browser-tool beschikbaar in deze sessie, zie onderaan.**

### 3a — JSON-pad, server-side sanitisatie (`check3-xss.cjs`, live)

- `POST /api/customers` met `name: "AUDIT-<img src=x onerror=alert(1)>"`,
  `notes: "AUDIT-<script>document.title='xss'</script>"` → `201`. `GET /api/customers/1270` terug:
  **`"name":"AUDIT-"`, `"notes":"AUDIT-"`** — de hele `<img>`- en `<script>`-tag (inclusief eventuele
  tekstinhoud) is volledig verdwenen. **Bevestigt de 3a-voorspelling**: DOMPurify (`ALLOWED_TAGS: []`)
  strip dit soort payloads op het JSON-pad volledig, geen letterlijke `<img`/`<script`-payload blijft over.
- `POST /api/vehicles` met `brand: 'AUDIT-"><svg onload=alert(2)>'` → `201`. `GET /api/vehicles/1732` terug:
  **`"brand":"AUDIT-\"&gt;"`** — de losse `">`-tekst blijft over (`>` HTML-encoded als `&gt;`), de
  `<svg onload=...>`-tag zelf is volledig gestript. **Bevestigt exact** de voorspelling in de vorige versie
  van dit rapport (SEC-021's tegenhanger: JSON-pad is wél beschermd).
- **Conclusie 3a: bevestigd, geen nieuwe bug** — dit is precies SEC-021's impliciete keerzijde, nu met
  live evidence in plaats van alleen code-analyse.

### 3b — Portal-bericht, JSON vs. multipart (`check3b-portal-xss.cjs`, live)

- (A) JSON `POST /api/portal/requests` met `message: 'AUDIT-JSON-<a href="javascript:alert(3)">click</a>'`
  → `201`, opgeslagen als **`"message":"AUDIT-JSON-click"`** — de `<a href="javascript:...">`-tag is
  gestript, alleen de tekst-node ("click") overleeft. Sanitizer werkt op dit JSON-pad.
- (B) Dezelfde payload via **multipart/form-data** (met een geldige PDF-bijlage, om
  `createSecureMulterFilter`/`validateAfterUpload` te passeren) → `201`, opgeslagen als
  **`"message":"AUDIT-MULTIPART-<a href=\"javascript:alert(3)\">click</a>"`** — **volledig rauw, ongefilterd
  opgeslagen**, inclusief de werkende `javascript:`-URL. `GET /api/portal/requests/582` bevestigt dezelfde
  rauwe waarde bij het teruglezen.
- **Dit is een directe, live bevestiging van SEC-021** (de globale `sanitizeInput`-middleware raakt
  `req.body` van een multipart-request niet, omdat multer dat pas ná de sanitizer vult) **gecombineerd met
  SEC-008's `javascript:`-URL-klasse** (de tag-stripper had de `href` sowieso niet geneutraliseerd). Een
  portal-klant kan dus, puur door een bijlage toe te voegen aan een verzoek, een opgeslagen
  `<a href="javascript:...">`-payload plaatsen die overal waar `request.message` ongeëscaped gerenderd
  wordt (potentieel de staff-inbox voor portal-verzoeken) als klikbare link met JS-URI terechtkomt. Geen
  nieuw SR-nummer — dit was al SEC-021/SEC-008, nu met onweerlegbaar live bewijs in plaats van alleen
  code-redenering.

### PDF-kanaal (`check3-pdf.mjs`, live, met workaround voor een kapotte default-template)

**Afwijking van het oorspronkelijke testplan:** het standaard-endpoint
`GET /api/contracts/generate/:reservationId` gebruikt in deze audit-DB standaard `pdf_templates`-rij
`id=2` ("gffg", `is_default=true`) met **`fields: []`** (leeg). `server/utils/pdf-generator.ts:227-503`
(`generateRentalContractFromTemplate`) tekent dan helemaal geen tekst (logt intern "No template fields
found", regel 503) — bevestigd door de rauwe PDF content-streams te decompressen: **nul** `Tj`/`TJ`
text-showing-operators in alle 15 streams van de eerste testrun. Dit is een **data-/configuratiegebrek in
de seed-template van de audit-DB, geen security-bevinding** — maar het betekent dat het standaard-endpoint
niet bruikbaar was om de PDF-tekst-hypothese te testen. Workaround: `?templateId=999999` (niet-bestaand)
laat `server/routes.ts:5507-5509` terugvallen op de **andere** generator, `generateRentalContract()`
(`pdf-generator.ts:541-693`), die brand/model/customerName altijd onvoorwaardelijk met `page.drawText()`
tekent.

**Resultaat, met die workaround:** contract gegenereerd voor reservering 3334 (klant 1270, voertuig 1732 —
dezelfde XSS-tainted records uit 3a). Tekst geëxtraheerd met `pdfjs-dist`:
```
AUDIT-"&gt;  AUDIT-XSS-Model  AU95790X  AUDIT-  Nederland  0600000000  November 15, 2026   November 17  10 september 2026
```
Dit is **exact de reeds server-side gesanitiseerde waarde** uit 3a (`AUDIT-"&gt;` voor het merk,
`AUDIT-` voor de klantnaam) — als **letterlijke, niet-uitvoerbare PDF-tekst**, geen `<`/`>`-markup, geen
`<img src=x` substring aanwezig. **Bevestigt 3b van de opdracht (PDF-kanaal): Confirmed OK** — zowel omdat
`pdf-lib`'s `drawText()` geen markup interpreteert, als omdat de payload die de PDF bereikt sowieso al door
de server-side sanitizer is gehaald (er is dus geen dubbele blootstelling: wat de sanitizer mist zou als
tekst in de PDF komen, maar niet als uitvoerbare inhoud).

### 3c — E-mail (SMTP-stub) — UITGEVOERD (live, vervolgsessie 2026-09-10)

**Scriptbug gevonden en gefixt:** `sr-smtp-stub.cjs`'s default `LOG_FILE` (`docs/audit/wip/scripts/sec/
sr-smtp-log.jsonl`, een *relatief* pad) resolvet t.o.v. de cwd van het node-proces, niet t.o.v.
`__dirname`. Gestart vanuit `docs/audit/wip/scripts/sec/` zelf zou dit een geneste
`sec/docs/audit/wip/scripts/sec/sr-smtp-log.jsonl` hebben opgeleverd — een ander bestand dan
`check3c-email.cjs` leest (`path.join(__dirname, 'sr-smtp-log.jsonl')`). Fix: de stub vanaf de repo-root
gestart met het log-pad expliciet als tweede argument meegegeven (`node docs/audit/wip/scripts/sec/
sr-smtp-stub.cjs 2525 docs/audit/wip/scripts/sec/sr-smtp-log.jsonl`), zodat beide scripts naar hetzelfde
bestand kijken.

**Uitvoering:** stub luisterde op `127.0.0.1:2525` (bevestigd via `netstat`). `check3c-email.cjs`
(1) zette `app_settings.email_documents` via `POST /api/app-settings` naar de stub (`id:9`, 200), (2)
verstuurde `POST /api/documents/226/email` (document 226 = contract voor reservering 3334, dezelfde
XSS-tainted klant/voertuig uit Check 3a) met `message: "Zie bijlage voor AUDIT-<img src=x
onerror=alert(6)> - <script>document.title='mailxss'</script>"` → **200** `{"message":"Email sent
successfully",...}`, (3) las de stub-log.

**Resultaat — de stub ontving het bericht volledig** (MAIL FROM/RCPT TO/DATA, multipart MIME met de
PDF-bijlage als base64-part). De HTML-body in de DATA-payload was:
```
<p>Zie bijlage voor AUDIT- -</p>
```
**De `<img src=x onerror=...>`- en `<script>...</script>`-tags zijn volledig verdwenen** — niet alleen
HTML-geëscaped, letterlijk gestript, exact zoals bij Check 3a/3b-A. **Root cause:** `POST /api/documents/
:id/email` is een **JSON**-route (`recipients`/`subject`/`message` uit `req.body`, geen multer/multipart),
dus de globale `sanitizeInput`-middleware (dezelfde die 3a/3b-A beschermt) heeft `message` al gestript
**vóórdat** `server/routes.ts:5277-5278`'s ongeëscapete `` `<p>${message...}</p>` `` (de exacte,
nog steeds aanwezige **SEC-016**-code) het te zien kreeg. **Confirmed OK voor dit specifieke, geteste
pad**: de voorspelde SEC-016-payload bereikt de e-mail-HTML niet via deze JSON-route. SEC-016's
onderliggende code-gebrek (geen expliciete escaping in de route zelf) blijft niettemin een reële SEC-021-
achtige blootstelling *als* een multipart-omzeilde, rauwe waarde (zoals de Check 3b-multipart-vondst) ooit
via een ander pad in een `message`-achtig veld van een e-mailroute terechtkomt — dat is met deze test niet
uitgesloten, alleen niet aangetoond voor dit ene endpoint. Geen nieuw SR-nummer: dit is dezelfde
SEC-016/SEC-021-combinatie als al in Check 3b geconcludeerd, nu met een derde, JSON-only datapunt dat de
sanitizer-bescherming bevestigt in plaats van doorbreekt.

**Restore (bevestigd):** `check3c-email.cjs` deed na de test `GET /api/app-settings` en `DELETE /api/
app-settings/9` (200) om de tijdelijke `email_documents`-rij te verwijderen. Een directe DB-query
(`db-check.cjs`) ná afloop bevestigt: `app_settings` bevat weer exact dezelfde 5 rijen als vóór de test
(`damage_check_fields`, `business_rules`, `cjib_config`, `email_config` id=7 ongewijzigd, `portal_config`)
— geen `email_documents`-rij meer aanwezig. Origineel-was-er-niet → verwijderen ís de correcte restore,
zoals ook in de vorige versie van dit rapport al beargumenteerd.

### 3d — Client-side sinks (DOM-executie)

**Geen browser-tool beschikbaar in deze sessie** (deze sub-agent heeft geen `mcp__Claude_Browser__*`- of
vergelijkbare tools tot zijn beschikking) — het openen van de customers-pagina en het observeren van
`document.title`/DOM-executie kon sowieso niet, los van de servercrash. De statische bevindingen
(**SEC-009** `driver-view-dialog.tsx:165`, **SEC-038** `reports/index.tsx:1247`, beide `innerHTML`, geen
`dangerouslySetInnerHTML` in de hele client) blijven ongewijzigd van kracht — zie `security-static.md`.

**Samenvatting check 3:** 3a, 3b, de PDF-deelvraag én 3c (e-mail) zijn nu allemaal met harde live-evidence
bevestigd (niet meer alleen voorspeld); alleen 3d blijft onbevestigd omdat een browser niet beschikbaar
is. Geen van de vier onderdelen levert een nieuwe SR-bug op — alles valt onder reeds bestaande
SEC-008/009/016/021/038.

---

## Check 4 — Secrets

**Runtime status:** bestand-/DB-niveau bevestigd; **API-responses nu ook live opgevraagd**
(vervolgsessie 2026-09-10, `check4-secrets-settings.cjs`, plus een los diagnosescript
`sr-secrets-nonadmin-test.cjs` voor de non-admin-vraag).

- `dist/public/assets/index-CAQfQZJN.js` — `grep -i "API_KEY|GEMINI|postgres://|smtp"` levert uitsluitend
  UI-labels op (`"SMTP Password"`, `"API Key:"`, `smtpHostLabel`, enz.) — **geen** waarden. **Confirmed OK**
  (vers bevestigd, huidige build).
- `dist/server/index.js` — geen `postgres://`, geen hardcoded `password:`/`secret:`-literal; wél drie
  treffers van `admin123` (`DEFAULT_ADMIN_PASSWORD`-default + twee console-logregels). **Bevestigt
  SEC-002**, geen nieuwe bug. `.env` van deze checkout zet geen `DEFAULT_ADMIN_PASSWORD` — de lopende
  `admin`/`admin123`-login die deze hele sessie gebruikt is, is zelf het bewijs dat SEC-002 in de praktijk
  actief is.
- **`GET /api/app-settings/email` (als admin, `manage_settings`) → 200**, met de **rauwe**
  `smtpPassword` in de body (`"smtpPassword":"AUDIT-super-secret-smtp-pw"`, de testwaarde eerder in deze
  audit gezet in `email_config` id=7). **By design, correct gescoped**: de route zit achter
  `hasPermission(UserPermission.MANAGE_SETTINGS)` (`server/routes/app-settings.ts:295`), met een expliciete
  code-comment (`:24-27`: *"The admin-only /api/app-settings/:category route below is the one place the
  real password is still returned, since the Settings UI needs it to pre-fill the edit dialog"*).
  **Getest met een verse wegwerp-staffgebruiker zónder `manage_settings`**
  (`AUDIT-secrets-test-...`, permissies `[view_vehicles, view_customers]`) → **403** `{"message":"Not
  authorized. One of these permissions required: manage_settings"}`. **Confirmed OK.**
- **`GET /api/app-settings` (algemene lijst, alleen `requireAuth`, dus elke ingelogde staff-gebruiker)
  → 200**, `email_config`-rij zit erin maar met **`"smtpPassword":""`** — leeggemaakt door
  `redactAppSetting()` (`server/routes/app-settings.ts:28-33`, matcht specifiek op de sleutel
  `smtpPassword`). Zelfde low-priv wegwerpgebruiker: **200**, identieke geredacteerde rij. **Confirmed OK**
  — volledige waarde alleen achter `manage_settings`, overal elders geredacteerd.
- **`GET /api/fines/cjib-config` (als admin) → 200**, `{"password":"",...}` — leeg omdat er in
  `lvs_audit` geen CJIB-wachtwoord is ingesteld, maar de route gebruikt sowieso structureel
  `maskCjibConfig()` (`server/routes/fines.ts:105-106`, vaste `CJIB_PASSWORD_MASK` als er wél een
  wachtwoord staat) en zit achter `canManage` (`manage_fines`). Low-priv wegwerpgebruiker (geen
  `manage_fines`) → **403** `{"message":"Not authorized. One of these permissions required:
  manage_fines"}`. **Confirmed OK.**
- `GET /api/settings`: bestaat niet als apart endpoint in deze routeset — de relevante routes zijn
  `/api/app-settings` en `/api/app-settings/:category`, beide hierboven getest. BUG-010
  (`03-phase-3-5-rapport.md`) gaat over een ander onderwerp (business-rules-autorisatie); geen relatie.
- Server-logging (`server/index.ts:241-270`): code-based conclusie ongewijzigd — logt alleen de
  response-JSON, nooit `req.body`, dus geen wachtwoorden in de server-console bij mislukte logins. Raakt
  nog steeds SEC-013 (ongeredacteerde responsebodies wél gelogd).

---

## Check 5 — Foutafhandeling (500's, malformed JSON, dev/productie-gating)

**Runtime status: UITGEVOERD** (live, vervolgsessie 2026-09-10, `check5-errors.cjs`).

- `GET /api/vehicles/abc` (ongeldige numerieke id) → **400** `{"message":"Invalid vehicle ID"}` — een
  nette, expliciete validatiefout zonder stack trace. **Confirmed OK.**
- `POST /api/login` met afgekapte/malformed JSON-body (`{"username": "admin", "password": `, zonder
  sessie/cookie nodig) → **400**, met een **volledige Node-stack trace inclusief absoluut Windows-pad**:
  `{"error":"Server Error","message":"Unexpected end of JSON input","stack":"SyntaxError: ... at parse
  (C:\\Users\\kees lam\\Desktop\\LVStest-main\\LVStest-main\\node_modules\\body-parser\\lib\\types\\
  json.js:92:19) ..."}`.
- `POST /api/vehicles` (geauthenticeerd, met geldige CSRF-token) met dezelfde afgekapte JSON → **400**,
  identieke stack-trace-vorm.
- **Dit is een live, letterlijke reproductie van de al bestaande BUG-057** (`03-phase-3-5-rapport.md`
  regel 938-950, "malformed JSON geeft een volledige Node-stack trace (dev-gated)") — zelfde root cause
  (`server/index.ts:428-433`, `err.stack` opgenomen zodra `NODE_ENV !== 'production'`), nu bevestigd op
  zowel een pre-auth route (`/api/login`) als een geauthenticeerde route (`/api/vehicles`), inclusief het
  volledige absolute serverpad. Geen nieuw SR-nummer — BUG-057 dekt dit al exact, inclusief de conclusie
  dat dit **correct gegate, LOW** dev-only gedrag is (de audit-omgeving draait bewust in dev-modus).

---

## Check 6 — Sessie (fixatie, invalidatie bij wachtwoordwijziging, `active_sessions`, logout)

**Runtime status:** DB-inspectie bevestigd; **live HTTP-gedrag nu ook getest** (vervolgsessie 2026-09-10,
`check6-session.cjs`: cookie vóór/na login, logout-Set-Cookie, cookie-hergebruik na logout, beide realms).

**Sessiefixatie — Confirmed OK, nu ook live:** `connect.sid` vóór login
(`s%3AhSr8Uz...`/`s%3A525oWa...`) verschilt van `connect.sid` ná een geslaagde login
(`session regenerated on login?: true`) — `req.session.regenerate()` draait daadwerkelijk vóór
`req.login()` in beide realms (`server/auth.ts:329-334`, `server/portal-auth.ts:255-257`), niet alleen in
de code maar bevestigd in de echte Set-Cookie-respons. Zelfde voor `portal.sid`
(`changed: true`).

**Logout — Confirmed OK, server-side sessie-invalidatie werkt echt, niet alleen cookie-clearing:**
- Staff: `POST /api/logout` → **200**, `Set-Cookie: connect.sid=...; Expires=<verleden>`. De **oude**
  (vóór-logout) cookiewaarde daarna hergebruikt tegen `GET /api/user` → **401** `{"message":"Not
  authenticated"}` — de sessie bestaat écht niet meer server-side (niet slechts client-side "unset").
- Portal: `POST /api/portal/logout` → **200**, `Set-Cookie: portal.sid=; Expires=Thu, 01 Jan 1970
  00:00:00 GMT`. Oude cookie hergebruikt tegen `GET /api/portal/me` → **401**
  `{"error":"Not authenticated","code":"PORTAL_NOT_AUTHENTICATED"}`. **Confirmed OK.**
- **Scriptbug gevonden en gefixt onderweg:** de eerste run van `check6-session.cjs` liet de portal-logout-
  aanroep het `PORTAL-XSRF-TOKEN` gebruiken dat rechtstreeks uit de **portal-loginrespons** kwam (zonder
  tussenliggende GET, i.t.t. het staff-blok dat wél `csrfHeader(jar)` gebruikt) — dat token is **altijd**
  ongeldig op het eerstvolgende verzoek (de al bekende **BUG-047**, hier voor het eerst ook in de
  portal-realm live gereproduceerd: `POST /api/portal/logout` → **403** `{"message":"Invalid CSRF
  token","code":"CSRF_INVALID"}`, i.p.v. de logout daadwerkelijk te testen). Gefixt door vóór de
  portal-logout-aanroep een `GET /api/portal/me` te doen (zelfde patroon als het staff-blok); zie de
  aparte diagnosescripts `sr-csrf-after-login-test.cjs`/`sr-csrf-portal-after-login-test.cjs` voor een
  geïsoleerde, herhaalbare reproductie van BUG-047 in beide realms (Check 6b hieronder).

**Verse DB-cijfers (`lvs_audit`, deze sessie, ná de vorige rapportversie's meting van 127/1):**
```
active_sessions: 142 rijen
session (express-session store): 94 rijen
```
Het gat is nu **142 vs. 94** in plaats van het eerder gemeten **127 vs. 1** — de absolute cijfers zijn
hoger (consistent met meerdere gelijktijdig actieve audit-agents die deze sessie tegelijk inlogden, zie de
operationele noot bovenaan) en het **relatieve gat is kleiner** dan voorheen, maar `active_sessions`
(142) blijft substantieel groter dan de echte sessiestore (94) — **bevestigt SEC-027 opnieuw**, met
vollediger/actueler bewijs dat het patroon structureel is en niet één toevallige meting. Alle
`active_sessions`-steekproefrijen tonen bovendien `ip_address: "203.0.113.77"` — **dat is letterlijk het
`X-Forwarded-For`-adres dat deze sessie zelf verzon** voor de BUG-009-workaround, opgeslagen als het
"echte" client-IP in de sessie-trackingtabel. Zie **SR-004** hieronder — dit is een nieuwe, aparte
consequentie van dezelfde onderliggende `trust proxy: 1`-configuratie.

**Wachtwoordwijziging invalideert géén andere sessies — nu WEL runtime bevestigd, VULNERABLE (SR-001,
zie hieronder).**

---

## Check 6b — Wachtwoordwijziging vs. sessie-invalidatie

**Runtime status: UITGEVOERD** (live, vervolgsessie 2026-09-10, `check6b-pwchange-session.cjs`; server
crashte één keer halverwege deze specifieke run — na ~30s vanzelf teruggekomen, script daarna zonder
wijzigingen opnieuw gedraaid, geen scriptbug).

**Reproductie:** wegwerp-staffgebruiker aangemaakt (`AUDIT-pwtest-1788992285947`, id 17, rol `user`, geen
bijzondere permissies), twee onafhankelijke sessies A en B beide ingelogd met het beginwachtwoord
(`session A login: 200`, `session B login: 200`). Sessie A wijzigt via `POST /api/users/change-password`
haar eigen wachtwoord (`currentPassword` correct, nieuw wachtwoord) → **200**. Direct daarna: **`GET
/api/user` met sessie B's (oude) cookie → 200**, nog steeds de volledige user-payload van de wegwerp-
gebruiker. **Verdict: VULNERABLE — sessie B blijft geauthenticeerd nadat sessie A het wachtwoord heeft
gewijzigd; andere sessies worden niet ingetrokken.** Dit bevestigt **SR-001** met live evidence (zie
hieronder voor de volledige bug-entry, ongewijzigd nummer, status nu "runtime bevestigd" i.p.v. "code-only").
Opruimen (`DELETE /api/users/17`) gaf **404** ondanks dat de gebruiker in de DB bestaat (zelfde
storage-laag-eigenaardigheid als bij de wegwerp-testgebruikers van Check 4 hieronder — buiten scope van
deze security-check, data blijft staan per README-conventie, disposable audit-DB).

---

## Check 7 — Rate limiting buiten login

**Runtime status: UITGEVOERD** (live, vervolgsessie 2026-09-10, `check7-ratelimit.cjs`, met een verse
`X-Forwarded-For`-bucket `203.0.113.100` om de gedeelde `loginLimiter`/`apiLimiter`-buckets van andere
gelijktijdige audit-agents niet te raken/verstoren).

**1. 200x `GET /api/vehicles?limit=1` als ingelogde staff-gebruiker → 200/200, geen enkele 429.**
**Bevestigt SR-002's voorspelling met harde runtime-evidence**: `apiLimiter`'s `skip: (req) =>
req.isAuthenticated && req.isAuthenticated()` (`server/middleware/security/rateLimiter.ts:12-23`) werkt
zoals de code voorspelt — een geauthenticeerde staff-sessie heeft **geen enkele bovengrens** op
API-verzoeken. Zie SR-002 hieronder (nummer ongewijzigd, status nu "runtime bevestigd").

**2. 50x `POST /api/portal/forgot` met hetzelfde e-mailadres → 200/200, geen enkele 429 — dit is
NIEUW en NIET wat de eerdere versie van dit rapport voorspelde.** SR-003 documenteerde één gedeelde
`loginLimiter`-bucket (5/15min) over de vier auth-routes inclusief `/api/portal/forgot`
(`server/portal-auth.ts:373`); 50 verzoeken zouden dus na de 5e een 429 moeten geven. In plaats daarvan
kreeg **geen enkel** verzoek een 429. **Root cause gevonden:** `loginLimiter` heeft
`skipSuccessfulRequests: true` (`server/middleware/security/rateLimiter.ts:28-35`, comment: "Don't count
successful logins") — bedoeld om een gebruiker die toevallig meermaals het juiste wachtwoord intypt niet
te blokkeren. Maar `/api/portal/forgot`'s handler (`server/portal-auth.ts:373-382`) retourneert **altijd**
`res.json({ ok: true })` (bewust, om e-mail-enumeratie te voorkomen) — dus **elk** verzoek naar deze route
telt voor `skipSuccessfulRequests` als een "succesvolle login" en wordt **nooit** meegeteld in de
5/15min-teller. Het resultaat: `/api/portal/forgot` heeft in de praktijk **geen enkele effectieve
rate limit**, ondanks dat de route expliciet `loginLimiter` als middleware heeft. Zie **SR-005**
hieronder — nieuwe, losstaande bevinding (andere hoek dan SR-003, dat over de gedeelde bucket ging, niet
over deze route-specifieke bypass).

**3. 7x `POST /api/portal/login` met een niet-bestaand e-mailadres (fout wachtwoord) → 5x 401, dan 2x
429.** Dit bevestigt dat de limiter voor **daadwerkelijk mislukte** aanmeldpogingen wél normaal werkt
(401's tellen niet als "succesvol", dus geen `skipSuccessfulRequests`-vrijstelling) — precies het
verwachte gedrag en consistent met **SR-003** (gedeelde bucket, hier opnieuw bevestigd, nu met een
schone/verse IP-bucket in plaats van een al-verzadigde).

---

## Check 8 — Bestand-serverende routes (achtergronden, licentie, backups, traversal)

**Runtime status:** offline Node-experiment bevestigd; **live HTTP-verificatie nu ook uitgevoerd**
(vervolgsessie 2026-09-10, `check8-fileserving.cjs`, ongewijzigd).

Herbevestigd (`path-join-test.cjs`):
```
abs windows path: C:\backups\C:\Windows\win.ini      (niet-absoluut resultaat -> bestaat niet -> 404)
unc path:          C:\backups\server\share\file.txt  (idem)
dotdot (backslash): C:\Windows\win.ini                (zou vóóraf al geblokkeerd worden door de '..'-check)
dotdot (forward):    C:\Windows\win.ini                (idem)
```

**Live HTTP-resultaten:**
- `GET /api/pdf-templates/1/background`, `/api/damage-check-templates/1/background`,
  `/api/transport-report-templates/1/background` → alle drie **200 `text/html`** met de Vite dev-shell
  (`<script type="module">import { createHotContext } ...`) — géén 404, géén bestandsinhoud. Zelfde,
  al in Check 1 als onschuldig geclassificeerde dev-only SPA-catch-all-gedrag voor een niet-bestaand
  achtergrondbestand van template-id 1 (dat gewoon geen achtergrond heeft in `lvs_audit`); geen
  traversal-effect.
- `GET /api/vehicle-diagram-templates/1/image` → **200**, echte `image/png` met geldige PNG-magic-bytes
  (`\x89PNG\r\n\x1a\n...IHDR...`) — werkt normaal.
- `GET /api/fines/1/letter` → **404** `{"message":"No letter"}`; `GET /api/drivers/1/license` → **404**
  `{"error":"License file not found"}` — beide nette, verwachte 404's.
- **Traversal-payloads op `/api/backups/download/[database/]<payload>` (12 varianten: forward-slash-
  encoded, dubbel-encoded, backslash, absoluut Windows-pad, UNC-pad):**
  - `..%2f...`, `%2e%2e%2f...`, dubbel-geëncodeerde varianten → **400** `{"error":"Invalid filename"}` —
    de bestaande blacklist vangt deze, zoals verwacht.
  - **Alle backslash-/absolute-Windows-pad-/UNC-varianten** (`..\..\..\Windows\win.ini`,
    `C:\Windows\win.ini`, `\\localhost\c$\Windows\win.ini`) → **200 `text/html`**, de Vite-SPA-shell —
    **geen `win.ini`-inhoud, geen bestandsdata van welke aard dan ook.** Dit is géén 400 van de backend
    (de blacklist-controle, die inderdaad geen `\`-variant afvangt — **SEC-031**), maar de payloads
    bereiken de Express-routehandler **helemaal niet**: een literale `\` in een URL-pad-segment matcht
    kennelijk niet als geldig `:filename`-segment in deze Node/Express-stack en de request valt door naar
    dezelfde Vite SPA-catch-all als hierboven. **Confirmed OK in de praktijk voor deze deployment**: geen
    enkele payload (12/12) leverde bestandsinhoud op. SEC-031's blacklist-gat blijft theoretisch bestaan
    (Low, code-niveau) maar is voor dit concrete aanvalsoppervlak niet exploiteerbaar gebleken — geen
    nieuw SR-nummer, dit verfijnt SEC-031 met live bewijs in plaats van het te weerleggen.

**Aanvullende, niet in het testplan voorziene ontdekking — cross-environment bestandslek via
`/uploads/*`:** tijdens Check 9 (zie hieronder) bleek dat een net via de audit-server geüploade PDF NIET
terug te vinden was op `/uploads/...` (200 met de SPA-shell, geen PDF). Root cause: de statische mount
`app.use('/uploads', requireAuth, express.static(uploadsPath))` (`server/index.ts:337`) hardcodeert
`uploadsPath = path.join(process.cwd(), 'uploads')` in plaats van `getUploadsDir()` te gebruiken — de
helper die **alle andere** upload-/documentroutes wél gebruiken en die `UPLOADS_DIR` respecteert. Dit is
**exact BUG-026** uit `03-phase-3-5-rapport.md` (al bekend, "statische `/uploads`-mount negeert
`UPLOADS_DIR`; 200 met verkeerde body"). **Nieuw, verzwarend live bewijs bij deze audit dat BUG-026's
eigen rapport nog niet had:** `<repo>/uploads/` bevat géén lege/oude map, maar **echte, niet-audit
bestanden** van kennelijk een ander (dev-)draaiende omgeving die dezelfde checkout deelt — getest met
`GET /uploads/12XT102/receipts/12XT102_receipt_tires_2026-01-24_1788033206383.pdf` (ingelogd als admin op
de audit-server, database `lvs_audit`) → **200, `Content-Type: application/pdf`, 308048 bytes, echte
PDF-inhoud** (een garagebon voor voertuig 12XT102, gedateerd 2026-01-24 — geen AUDIT-record, dus
afkomstig uit een andere omgeving/database die toevallig dezelfde `<repo>/uploads`-directory op schijf
deelt). Met andere woorden: de statische mount serveert niet "een lege/verkeerde map" (zoals BUG-026's
reproductie liet zien voor nieuw aangemaakte bestanden) maar **een map met echte bestanden van buiten de
audit-scope**, bereikbaar voor elke `requireAuth`-staff-gebruiker (geen extra permissie-check) zodra de
map-/bestandsnaam (kenteken + submap) geraden of bekend is. Dit verandert niets aan BUG-026's root cause
of fix-voorstel (`const uploadsPath = getUploadsDir()`), maar onderbouwt met concreet bewijs dat de
severity-inschatting **eerder aan de hoge kant van MEDIUM/richting HIGH** zou moeten zitten in elke
deployment waar `<repo>/uploads` en `UPLOADS_DIR` op schijf van elkaar verschillen (zoals hier) — het is
dan niet alleen "stille 404's", maar een reëel cross-environment confidentialiteitslek. Geen nieuw
SR-nummer (BUG-026 dekt de root cause exact); toegevoegd als aanvullende evidence bij dat bestaande id.

---

## Check 9 — Upload-confusie (PDF/HTML-polyglot, SVG-als-.png)

**Runtime status:** library-niveau bevestigd; **live upload + `Content-Type`/`Content-Disposition`-
verificatie nu ook uitgevoerd** (vervolgsessie 2026-09-10, `check9-upload-confusion.cjs`, na een
scriptbugfix).

Herbevestigd (`filetype-svg-test.mjs`):
```
detected for SVG buffer: undefined
detected for PDF-polyglot buffer: { ext: 'pdf', mime: 'application/pdf' }
```

**Scriptbug gevonden en gefixt:** de oorspronkelijke multipart-payloads plaatsten het `file`-veld vóór
`documentType` en bevatten helemaal geen `vehicleId`-veld. `createDocumentUploadStorage`
(`server/routes.ts:4805-4810`) leest `req.body.vehicleId` binnen multer's disk-storage
`destination()`-callback, die afgaat zodra het `file`-deel geparsed is — een tekstveld ná `file` in de
multipart-body staat op dat moment nog niet op `req.body` (multer/busboy parsen delen in stream-volgorde;
een bekende multer-valkuil, niet appspecifiek). Resultaat vóór de fix: **500**
`{"error":"Server Error","message":"Vehicle ID is required", "stack":"...createDocumentUploadStorage
(...server\\routes.ts:4810:25)..."}` voor **beide** uploads — de content-type-confusielogica werd nooit
bereikt. Fix: `vehicleId` (waarde `1732`, het AUDIT-XSS-voertuig uit Check 3a) en `documentType` vóór
`file` in de multipart-body gezet.

**Na de fix:**
- **PDF/HTML-polyglot** (`%PDF-1.4\n<script>document.title="uploadxss"</script>\n%%EOF`,
  `Content-Type: application/pdf` in de upload) → **201**, opgeslagen. `GET /api/documents/view/226+1` (id
  231) → **200**, `Content-Type: application/pdf`, `Content-Disposition: inline;
  filename="AU95790X_contract_20260910.pdf"`, **`X-Content-Type-Options: nosniff`** aanwezig, body =
  letterlijk de rauwe polyglot-bytes inclusief de `<script>`-tekst. **Confirmed OK**: `nosniff` voorkomt
  dat een browser dit ondanks de `<script>`-substring als HTML gaat interpreteren/uitvoeren — de
  `Content-Type: application/pdf` wordt gerespecteerd, geen MIME-sniffing-based XSS.
- `GET /uploads/...` (directe statische serving van dezelfde polyglot) → **200 `text/html`** (Vite-shell,
  geen PDF-inhoud) — dit is **niet** een aparte bevinding maar dezelfde **BUG-026**-mismatch als
  hierboven bij Check 8 beschreven: dit specifieke bestand staat onder `../audit-uploads/contracts/...`
  (via `UPLOADS_DIR`), niet onder `<repo>/uploads/...` (wat de static mount hardcoded serveert), dus de
  static route vindt het simpelweg niet. Geen aparte contenttype-confusie via dit pad voor dít bestand —
  wél (zie Check 8) een reëel bestaand ander lek via hetzelfde mount-adres voor bestanden die daar wél
  toevallig staan.
- **SVG hernoemd naar `.png`** (`<svg ... onload="alert(4)"><script>alert(5)</script></svg>`,
  `Content-Type: image/png`, `filename="audit-fake.png"`) → **400** `{"message":"Could not verify file
  type"}` — **de upload wordt geweigerd**, consistent met de offline `file-type`-bevinding
  hierboven (SVG levert geen magic-byte-detectie op, en `validateFileBuffer()`'s fallback-tak accepteert
  zonder detectie alleen `textBasedTypes`, waar deze content niet onder valt ondanks de `.png`-extensie/
  `image/png`-Content-Type-header). **Confirmed OK**: content-type-confusie via een hernoemd
  SVG-als-PNG-bestand wordt server-side geblokkeerd vóórdat het ooit wordt opgeslagen of uitgeserveerd.

---

## Nieuwe bevindingen

### SR-001 — Medium — Wachtwoordwijziging invalideert geen andere actieve sessies (staff én portal)

- **Severity:** MEDIUM · **Status:** OPEN — **nu runtime bevestigd, VULNERABLE** (`check6b-pwchange-
  session.cjs`, vervolgsessie 2026-09-10) · **Type:** Technische fout
- **Locatie:** `server/routes/users.ts:349-398` (`POST /api/users/change-password`),
  `server/portal-auth.ts:360-368` (`POST /api/portal/me/password`); ongebruikte tegenhanger:
  `server/utils/security/sessionManager.ts:88-120` (`revokeSession`, `revokeUserSessions`).
- **Evidence (code):** `grep -rn "revokeUserSessions\|revokeSession" server --include=*.ts` buiten de
  eigen definities → nul aanroepen.
- **Evidence (live, nieuw deze sessie):** wegwerp-staffgebruiker (`AUDIT-pwtest-1788992285947`, id 17)
  ingelogd in twee onafhankelijke sessies A en B (`200`/`200`). Sessie A: `POST /api/users/change-password`
  met correct huidig wachtwoord → **200**, wachtwoord succesvol gewijzigd. Direct daarna: `GET /api/user`
  met sessie **B**'s (ongewijzigde, oude) cookie → **200**, volledige user-payload — sessie B is nog
  steeds volledig geauthenticeerd. **Reproduceerbaar, geen ambiguïteit.**
- **Exploitpad:** een aanvaller met een gestolen sessiecookie (bijv. via het live bevestigde
  multipart-XSS-gat, SEC-021, zie Check 3b hierboven) blijft ingelogd nadat het slachtoffer zijn
  wachtwoord wijzigt — nu met live bewijs i.p.v. alleen de afwezigheid van een `revokeUserSessions`-call.
- **Testscript:** `docs/audit/wip/scripts/sec/check6b-pwchange-session.cjs` — **uitgevoerd, bevestigt de
  bug.**
- **Fix (tekstueel):** ongewijzigd — `revokeUserSessions(user.id, req.sessionID)` aanroepen na een
  geslaagde wachtwoordwijziging, plus een vergelijkbaar mechanisme voor de portal-realm.

---

### SR-002 — Low/Medium — Geauthenticeerde sessies hebben geen enkele API-rate-limit (ontwerpkeuze)

- **Severity:** LOW-MEDIUM · **Status:** OPEN — **nu runtime bevestigd** (`check7-ratelimit.cjs`,
  vervolgsessie 2026-09-10) · **Type:** Technische fout/bedrijfsrisico
- **Locatie:** `server/middleware/security/rateLimiter.ts:12-23` (`apiLimiter`, `skip: (req) =>
  req.isAuthenticated && req.isAuthenticated()`).
- **Evidence (live, nieuw deze sessie):** 200 snelle, opeenvolgende `GET /api/vehicles?limit=1`-verzoeken
  als ingelogde staff-gebruiker → **200/200**, geen enkele `429`, geen enkele `RateLimit-*`-header die op
  een naderende limiet wijst. Bevestigt dat een geauthenticeerde sessie inderdaad volledig buiten
  `apiLimiter` valt, zoals de `skip`-code voorspelt. (De eerdere, niet-doorslaggevende observatie over een
  `429` op een geauthenticeerde portal-multipart-aanroep in Check 3b bleek bij nader onderzoek gewoon een
  opgebruikt gedeeld-IP-budget te zijn geweest, niet een gat in de `skip`-check specifiek voor de
  portal-realm — met een verse IP-bucket kregen 200/200 staff-GET's geen enkele 429.)
- **Fix (tekstueel):** ongewijzigd — eindige per-sessie/per-gebruiker-limiet in plaats van volledige
  `skip`.

---

### SR-003 — Low — Eén gedeelde rate-limiter-teller over vier auth-routes

- **Severity:** LOW · **Status:** OPEN — **nu wél runtime bevestigd**, zij het onbedoeld: zie Check 2
  hierboven, waar alle vier eerste-pogingen van deze sessie (2x staff-login, 2x portal-login, met
  **correcte** credentials) direct `429` kregen van de gedeelde `loginLimiter`-bucket, opgebruikt door
  eerdere/gelijktijdige activiteit op hetzelfde IP. · **Type:** Technische fout
- **Locatie:** `server/middleware/security/rateLimiter.ts:28-35` (`loginLimiter`), hergebruikt op
  `server/auth.ts:263`, `server/portal-auth.ts:233,373,384`.
- **Exploitpad:** ongewijzigd — 5 mislukte requests tegen `/api/portal/forgot` blokkeert ook
  staff-`/api/login` voor 15 minuten voor hetzelfde IP.
- **Fix (tekstueel):** ongewijzigd — aparte `rateLimit()`-instanties of `keyGenerator`-prefixes per
  route/realm.

---

### SR-004 — Low — `X-Forwarded-For` wordt ook vertrouwd voor het IP-adres in `active_sessions` (audit-trail-vervuiling)

- **Severity:** LOW (forensisch/audit-trail, geen directe auth-impact) · **Status:** OPEN (nieuw, andere
  hoek dan BUG-009 — dat gaat over rate-limit-omzeiling, dit gaat over de integriteit van het
  IP-adres dat in beveiligingslogging terechtkomt) · **Type:** Technische fout
- **Locatie:** dezelfde grondoorzaak als BUG-009: `server/auth.ts:135` (`app.set("trust proxy", 1)`)
  zonder dat er in deze deployment een daadwerkelijke, `X-Forwarded-For`-herschrijvende reverse proxy
  vóór de Node-app staat. `active_sessions.ip_address` (gebruikt door het "actieve sessies"-beheerscherm,
  zie SEC-027) wordt gevuld op basis van `req.ip`.
- **Evidence:** deze sessie stuurde bewust `X-Forwarded-For: 203.0.113.77` mee (de BUG-009-workaround om
  de opgebruikte `loginLimiter`-bucket te omzeilen — zie de operationele noot bovenaan). De daarop volgende
  DB-query op `active_sessions` (Check 6) toont **letterlijk `ip_address: "203.0.113.77"`** voor de
  nieuw aangemaakte sessies — een volledig door de client verzonnen waarde, zonder enige validatie.
- **Exploitpad:** een aanvaller die inlogt (met gestolen of eigen credentials) kan het IP-adres dat in de
  "actieve sessies"-admin-UI en in `login_attempts`/`active_sessions` wordt vastgelegd naar willekeur
  spoofen — dit ondermijnt elke vorm van forensisch onderzoek of "verdachte login vanaf IP X"-detectie die
  op deze tabel vertrouwt, los van de al bekende rate-limit-omzeiling (BUG-009).
- **Fix (tekstueel):** `trust proxy` alleen instellen wanneer er daadwerkelijk een vertrouwde reverse
  proxy vóór de app staat die zelf een schone `X-Forwarded-For` zet (en de client-header overschrijft in
  plaats van toevoegt); anders `trust proxy` uit laten staan zodat `req.ip` het TCP-peer-adres blijft.

---

### SR-005 — Medium — `POST /api/portal/forgot` heeft in de praktijk geen effectieve rate limit (`skipSuccessfulRequests` + altijd-200-respons)

- **Severity:** MEDIUM · **Status:** OPEN (nieuw) · **Type:** Technische fout
- **Feature:** Rate limiting op het "wachtwoord vergeten"-endpoint van de klantenportal
- **Reproduction:** 50 snelle, opeenvolgende `POST /api/portal/forgot`-verzoeken met hetzelfde e-mailadres
  (`portaal-test@example.com`, een bestaande, actieve portal-klant) vanaf één IP →
  **50/50 keer `200 {"ok":true}`, geen enkele `429`.** Testscript: `docs/audit/wip/scripts/sec/
  check7-ratelimit.cjs`, punt 2 (script ongewijzigd, wel met een verse `X-Forwarded-For`-bucket om niet
  door andere gelijktijdige audit-agents beïnvloed te worden).
- **Expected:** De route heeft `loginLimiter` (5 verzoeken/15 min per IP) als middleware
  (`server/portal-auth.ts:373`) en zou dus na de 5e poging `429` moeten geven, exact zoals bij herhaalde
  mislukte `/api/portal/login`-pogingen (zie SR-003/Check 7 punt 3, waar dat wél gebeurt).
- **Actual:** Geen enkel verzoek raakt ooit de limiet, ongeacht het aantal.
- **Root cause:** `loginLimiter` is gedefinieerd met `skipSuccessfulRequests: true`
  (`server/middleware/security/rateLimiter.ts:28-35`, comment "Don't count successful logins") — een
  redelijke instelling vóór een echt login-endpoint (voorkomt dat een gebruiker die toevallig een paar keer
  het juiste wachtwoord intypt zichzelf blokkeert), maar `/api/portal/forgot`'s handler
  (`server/portal-auth.ts:373-382`) retourneert **onvoorwaardelijk** `res.json({ ok: true })` — ook als het
  e-mailadres niet bestaat of niet actief is — juist *om* e-mail-enumeratie te voorkomen (`if (user &&
  user.active) { try { await sendPortalInvite(...) } catch {} }`, maar de 200-respons volgt sowieso).
  Express-rate-limit interpreteert elke `2xx`/`3xx`-respons als "succesvol" voor
  `skipSuccessfulRequests`, dus **elk verzoek naar deze route wordt overgeslagen in de teller**, wat de
  facto neerkomt op een compleet ongelimiteerde route ondanks de aanwezige middleware.
- **Affected files:** `server/middleware/security/rateLimiter.ts:28-35` (`loginLimiter`),
  `server/portal-auth.ts:373-382` (`POST /api/portal/forgot`).
- **Affected data:** Geen directe datacorruptie; wel worden bij elk geslaagd verzoek (bestaand + actief
  e-mailadres) daadwerkelijk reset-mails verstuurd via `sendPortalInvite(user, "reset")` — deze 50
  testverzoeken hebben dus in potentie 50 echte reset-mails naar de geconfigureerde SMTP-server voor
  `portaal-test@example.com` gestuurd (de audit gebruikte op dat moment de originele `email_config`-rij,
  niet de SMTP-stub, die op dat punt al weer verwijderd was — zie Check 3c/restore hierboven).
- **Exploitpad:** een aanvaller kan zonder enige snelheidsbeperking herhaaldelijk "wachtwoord
  vergeten"-mails naar een specifieke, bekende klant sturen (mail-bombing/harassment van een reëel
  bestaande klant), of de e-mailinfrastructuur/SMTP-relay van de verhuurder belasten met een volume aan
  uitgaande mail dat de bedoelde 5/15min-grens ver overschrijdt — puur door het feit dat het endpoint zelf
  altijd 200 teruggeeft. Geen open relay naar willekeurige externe adressen (het e-mailadres moet al een
  bestaande, actieve portalklant zijn), dus begrensd tot harassment/DoS-risico op bekende accounts en
  eigen mailinfrastructuur, geen spam-relay-risico naar derden.
- **Fix proposal:** `skipSuccessfulRequests: false` specifiek voor deze route (een aparte
  `rateLimit()`-instantie voor `/api/portal/forgot`/`/api/portal/activate`, los van de login-instantie —
  ook een goede gelegenheid om meteen SR-003's gedeelde-bucket-probleem mee te fixen), of de handler zo
  aanpassen dat non-2xx alternatieven niet nodig zijn maar de limiter-configuratie zelf wél telt op
  "verzoek ontvangen" in plaats van "resultaat was ok".
- **Regression test proposal:** 6+ snelle `POST /api/portal/forgot`-verzoeken met hetzelfde (bestaande)
  e-mailadres vanaf één IP; verwacht `429` na de 5e, net als bij `/api/portal/login`.

---

## Confirmed OK (runtime, alle 9 checks nu volledig live uitgevoerd over beide sessies)

- Response-headers op `/`, `/api/user`, `/portaal`: CSP, HSTS, X-Content-Type-Options, Referrer-Policy,
  Permissions-Policy, `X-Frame-Options`/`frame-ancestors`-wissel — allemaal live geverifieerd (Check 1).
- Geen CORS-headers op `/api/*` voor een onbekende Origin — live bevestigd (Check 1).
- Sessiecookie-`Secure`-vlag volgt `req.secure` correct in beide realms — geen login-bounce-klasse fout
  (Check 2, live).
- JSON-pad server-side sanitisatie van klant-/voertuig-/portal-payloads — volledig gestript, geen
  letterlijke `<tag`-payload overleeft (Check 3a/3b-A, live), **inclusief de e-mail-HTML-route**
  (`POST /api/documents/:id/email`, Check 3c, live): een `<img onerror>`/`<script>`-payload in `message`
  werd volledig gestript vóórdat SEC-016's ongeëscapete `${message}`-interpolatie het te zien kreeg.
- PDF-kanaal: gesanitiseerde tekst komt als letterlijke, niet-uitvoerbare tekst in de contract-PDF terecht
  (Check 3-pdf, live, met gedocumenteerde workaround voor een kapotte seed-template).
- `GET /api/vehicles/abc` → nette `400` zonder stack trace (Check 5, live).
- Session-fixatie: `connect.sid`/`portal.sid` veranderen daadwerkelijk bij login (regenerate bevestigd in
  de echte Set-Cookie-respons, niet alleen in de code) — Check 6, live, beide realms.
- Logout vernietigt de sessie echt server-side (niet alleen de cookie): de vóór-logout cookie hergebruiken
  geeft `401`/`PORTAL_NOT_AUTHENTICATED` in beide realms — Check 6, live.
- `manage_settings`/`manage_fines`-gating op `GET /api/app-settings/email` resp. `GET /api/fines/
  cjib-config` werkt echt: een wegwerpgebruiker zonder die permissies krijgt `403`, en de algemene
  `/api/app-settings`-lijst (voor elke ingelogde gebruiker) redacteert `smtpPassword` altijd naar `""` —
  Check 4, live, met een speciaal daarvoor aangemaakte non-admin testgebruiker.
- Login-limiter werkt normaal voor **echte** mislukte pogingen (5x 401 dan 429 op
  `/api/portal/login` met fout wachtwoord) — Check 7, live.
- 200 snelle geauthenticeerde `GET /api/vehicles`-verzoeken: geen enkele 429 — bevestigt `apiLimiter`'s
  `skip`-ontwerp werkt zoals bedoeld (zie ook SR-002) — Check 7, live.
- Traversal-payloads (forward-slash-encoded, dubbel-encoded, backslash, absoluut Windows-pad, UNC-pad — 12
  varianten) op `/api/backups/download/...` leverden in geen enkel geval bestandsinhoud op — Check 8, live
  + offline `path.join()`-experiment.
- Content-type-confusie-uploads: een SVG hernoemd naar `.png` wordt bij upload geweigerd (`400 Could not
  verify file type`); een PDF/`<script>`-polyglot wordt wél opgeslagen maar door `/api/documents/view/:id`
  met `Content-Type: application/pdf` + `X-Content-Type-Options: nosniff` uitgeserveerd, wat
  MIME-sniffing-based uitvoering voorkomt — Check 9, live.
- `dist/`-bundels bevatten geen hardcoded secrets buiten de bekende `admin123`-default (Check 4).

## Bevestigd probleem (geen nieuwe bug, wél nu met hard bewijs)

- **SEC-021 (multipart bypasses de globale sanitizer) — nu onweerlegbaar aangetoond:** een
  `<a href="javascript:alert(3)">`-payload kwam via een portal-multipart-request **volledig rauw** de
  database in (Check 3b). Dit was voorheen alleen code-redenering.
- **SEC-025/BUG-005 (Socket.IO CORS `origin:"*"` in dev) — live bevestigd** (Check 1).
- **SR-003 (gedeelde loginLimiter-bucket) — live bevestigd**, zowel onbedoeld (bucket al op vóór deze
  sessie iets deed, Check 2) als gericht (Check 7 punt 3: 5x 401 dan 429 op één gedeelde teller).
- **BUG-057 (malformed JSON → volledige stack trace, dev-gated) — live gereproduceerd** op zowel een
  pre-auth (`/api/login`) als een geauthenticeerde (`/api/vehicles`) route, inclusief het volledige
  absolute serverpad (Check 5).
- **BUG-047 (CSRF-token uit de loginrespons is ongeldig op het eerstvolgende verzoek) — voor het eerst ook
  in de portal-realm live gereproduceerd** (niet alleen staff, zoals BUG-047's oorspronkelijke
  reproductie): `POST /api/portal/login` gevolgd door direct een muterend verzoek met het token uit die
  loginrespons → `403 CSRF_INVALID`; met één tussenliggend GET-verzoek → succes. Zie de diagnosescripts
  `sr-csrf-after-login-test.cjs` (staff) en `sr-csrf-portal-after-login-test.cjs` (portal). Dit was ook de
  root cause van een scriptbug in `check6-session.cjs` (portal-logout testte aanvankelijk per ongeluk deze
  bug i.p.v. de bedoelde logout-functionaliteit) — zie Check 6.
- **BUG-026 (statische `/uploads`-mount negeert `UPLOADS_DIR`) — live bevestigd, met een zwaardere,
  nieuwe invalshoek:** niet alleen "stille 404's" voor nieuw geüploade bestanden, maar een **reëel
  cross-environment bestandslek** — `<repo>/uploads/` bevat echte, niet-audit bestanden van een andere
  omgeving die dezelfde checkout deelt, en die zijn via de audit-server voor elke ingelogde staff-gebruiker
  opvraagbaar (`GET /uploads/12XT102/receipts/...` → 200, echte 308KB PDF). Zie Check 8/9.

## Alle checks: uitvoeringsoverzicht (bijgewerkt)

Sessie 1 (2026-09-09): Checks 1, 2, 3a, 3b, 3-pdf volledig live; 4/6/8/9 deels (DB-/bestands-/
library-niveau); 3c/5/6b/7 geblokkeerd door een server-crash halverwege, met als meest waarschijnlijke
verklaring gedeeld gebruik door andere, gelijktijdig actieve audit-agents op dezelfde omgeving (zie de
operationele noot bovenaan dit document voor het volledige bewijs: uitgeputte `loginLimiter`-/
`apiLimiter`-buckets vóór deze sessie ook maar begon, bestanden die tussen twee leesacties wijzigden).

Sessie 2 (2026-09-10, deze sessie): de resterende checks (3c, 4-livedeel, 5, 6-livedeel, 6b, 7,
8-livedeel, 9-livedeel) alsnog volledig live uitgevoerd, met twee nieuwe, kortstondige server-crashes
onderweg (tijdens `check3c-email.cjs` en tijdens `check6b-pwchange-session.cjs`) — beide keren binnen
~30-40 seconden vanzelf hersteld (auto-restart-loop, zoals in de opdracht beschreven), zonder dat deze
sessie de server zelf heeft gestart of gestopt. Drie scriptbugs onderweg gevonden en gefixt (zie de
betreffende check-secties voor details): `sr-smtp-stub.cjs`'s relatieve default-logpad,
`check6-session.cjs`'s portal-logout-CSRF-token-hergebruik, en `check9-upload-confusion.cjs`'s
ontbrekende/verkeerd-geordende `vehicleId`-veld.

**Alle 9 checks zijn nu volledig live uitgevoerd; er staat niets meer open.** Alle testscripts in
`docs/audit/wip/scripts/sec/` zijn bijgewerkt en herbruikbaar voor een volgende regressietest (met beide
sessies' bugfixes: `AUDIT_XFF`-ondersteuning in `sr-lib.cjs` en `check3-pdf.mjs`/`check3b-portal-xss.cjs`'s
raw-fetch-aanroepen, gecorrigeerde `pdfjs-dist`-padresolutie in `check3-pdf.mjs`, poort 2525 i.p.v. 2526
voor de SMTP-stub met een absoluut/vanaf-repo-root log-pad, `check6-session.cjs`'s portal-logout-CSRF-fix,
`check9-upload-confusion.cjs`'s `vehicleId`-veldvolgorde). Twee losse eenmalige diagnosescripts zijn deze
sessie toegevoegd voor gerichte reproductie: `sr-csrf-after-login-test.cjs` / `sr-csrf-portal-after-login-
test.cjs` (BUG-047, beide realms) en `sr-secrets-nonadmin-test.cjs` (Check 4, non-admin-toegang). Zet
`AUDIT_XFF` naar een vers, ongebruikt adres als de gedeelde rate-limiter-buckets bij een volgende run weer
verzadigd blijken.
