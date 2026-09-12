
---

## 7. Wat nog open staat

De 42 NOT FIXED-bugs vallen in vier groepen. De eerste groep is de groep die telt.

### 7.1 Echt gemist — het plan noemt ze gesloten, ze zijn het niet

**BUG-069 (HIGH) — uitpakken van een archief over de applicatiemap.**
Het plan zet deze in cluster FIX-L ("restore safety"); geen enkele commit noemt hem.
`/api/backups/restore-files` **is** gerepareerd: een archief met `dist/server/index.js` erin geeft
400 met "entries that would be written outside the uploads directory".
Maar **`/api/backups/restore-code` pakt nog steeds uit over `process.cwd()`**, achter alleen een
filter op `..` en absolute paden (`server/routes/backups.ts:424-440`), en doet daarna
`process.exit(0)` (`:452`). Datzelfde filter, nagespeeld in een afgeschermde map op de
gedocumenteerde lading, wees **nul** items af en schreef `dist/server/index.js` en een
`node_modules`-bestand weg. De route is bewust niet echt afgevuurd — dat zou de draaiende
applicatie overschrijven. Dit is een pad van een archiefupload naar het draaien van eigen code.

**BUG-070 (HIGH) — willekeurig pad in `backgroundPath`.**
De helft die er het meest toe deed is dicht: een bestand buiten de uploadsmap **overleeft** het
verwijderen van een sjabloonachtergrond. Maar het pad wordt nog steeds aangenomen:
`PATCH /api/pdf-templates/2` met `backgroundPath: "../../AUDIT-P36B-canary.txt"` geeft **200** en
slaat die waarde op; hetzelfde geldt voor `PUT /api/damage-check-templates/1`.

**BUG-009 (HIGH) — de inloglimiet is te omzeilen met een verzonnen afzender-IP.**
Het plan zet deze op DEFERRED omdat het echte aantal proxystappen van Coolify onbekend is. Dat
verklaart de meting niet: **tien inlogpogingen achter elkaar, elk met een andere verzonnen
`X-Forwarded-For`, gaven tien keer 401** en geen enkele 429 — terwijl dezelfde tien pogingen vanaf
één IP bij nummer 6 een 429 geven. `app.set("trust proxy", 1)` staat er (`server/auth.ts:182`) en
`loginLimiter` heeft geen eigen `keyGenerator`. De rem op wachtwoordraden is daarmee vanaf het open
internet uit te zetten, ongeacht hoeveel proxystappen er zijn.

**BUG-161 (HIGH)** hoort bij dezelfde familie: twintig parallelle foute inlogpogingen vanaf twintig
IP's leveren tien volledige wachtwoordverificaties op voordat de limiet ingrijpt, waar de audit ~5
als plafond noemde. De accountvergrendeling zelf werkt wel.

**BUG-192 — besluit B-18 is genomen en niet uitgevoerd.**
Op papier LOW, in de praktijk zichtbaar op elk document dat een klant krijgt. Het contract drukt
`September 13, 2026`, `September 20, 2026` en `7 days` — Engels, Amerikaanse notatie — pal naast
`12 september 2026` en `€ 1.234,50`, die wél Nederlands zijn. De bron is één plek:
`server/utils/pdf-generator.ts:440-442` gebruikt `format(startDate, 'MMMM d, yyyy')` zonder locale
en bouwt `duration` als een Engelse tekst. De transportbrief zegt "Vehicle Swap" en "Tow" en toont
`€0.00` met een punt; de schadecheck mengt `12-09-2026` met `12/09/2026`. Twee controleurs vonden
dit onafhankelijk van elkaar. **Dit is nadrukkelijk geen CHANGED BY DECISION:** het besloten gedrag
is aantoonbaar niet wat de applicatie produceert.

**BUG-214 — besluit B-19 is genomen en niet uitgevoerd.**
Geen compressiemiddleware, geen afhankelijkheid in `package.json`, geen `content-encoding` op welk
antwoord dan ook. Zie §5.4 voor de cijfers: 27 tot 28 keer kleiner, met één middleware.

**BUG-224 — tijdstempels zonder tijdzone.**
Het codepad is **niet** gerepareerd voor nieuwe rijen: een document dat om 21:18:26 Nederlandse tijd
is gemaakt, staat als `21:18:26` in een kolom zonder tijdzone, komt als `…T21:18:26Z` terug en toont
in het scherm **23:18:26** — precies de +120 minuten uit de bug. Het schema heeft nog 101 kolommen
`timestamp without time zone` en nul met tijdzone.
