# Fase 17–19 — geconsolideerd rapport (back-up & recovery, browser/E2E, performance)

2026-09-11 · branch `feat/customer-portal` · samengevoegd uit `docs/audit/wip/p17-backups.md`
(B17-001…011), `docs/audit/wip/p18-browser-e2e.md` (E18-001…011) en
`docs/audit/wip/p19-performance.md` (PF19-001…013). Bestaande bevindingen uit
`docs/audit/03-phase-3-5-rapport.md` (BUG-001…059), `docs/audit/04-phase-6-8-security-report.md`
(BUG-060…105), `docs/audit/05-phase-9-12-rapport.md` (BUG-106…158) en
`docs/audit/06-phase-13-16-rapport.md` (BUG-159…196) worden **gerefereerd, niet herhaald**. Er is
geen applicatiecode gewijzigd, niets gecommit en de applicatie is niet in productie gedraaid.

## Context — lees dit vóór elk getal

- **Fase 17 draaide op een eigen, wegwerpbare omgeving.** Server `http://localhost:5002`
  (launchconfig `audit-bk`, tsx dev mode), database **`lvs_audit_bk`** (verse kloon van `lvs_audit`:
  47 tabellen, 665 voertuigen / 348 klanten / 2125 reserveringen / 23 gebruikers / 8 portaalgebruikers
  / 281 documenten, 31→34 MB), `UPLOADS_DIR=C:\…\LVStest-main\audit-uploads-bk` (197 bestanden,
  114 MB), `BACKUP_PATH=C:\…\LVStest-main\audit-backups` (leeg bij aanvang). `pg_dump`/`psql` 17.11
  stonden op de PATH van de server. Poort 5000/5001, `lvstest`, `lvs_audit` en de `uploads/` van de
  repo zijn **niet** aangeraakt. Dit was de enige fase waarin destructieve herstelacties écht zijn
  uitgevoerd — en dat kon alleen omdat de database wegwerpbaar was.
- **Fase 18 draaide in de Claude Browser (Chromium) tegen `:5001` in dev mode.** De Vite-foutoverlay
  die je daar ziet bestaat in productie niet: dezelfde fout levert daar een **wit scherm**, want
  `grep -rn ErrorBoundary client/src` geeft nul treffers. Viewports 1182×698 (desktop), 375×812
  (mobiel), 768×1024 (tablet). Er is één echte werkstroom volledig doorlopen (reservering #3544:
  aanmaken → ophalen mét contract → innemen mét schadecheck).
- **Fase 19 is in dev mode gemeten.** `node --import tsx server/index.ts` mét Vite-middleware, **geen
  productionbuild**, op een host waarop tegelijk de back-uptests (:5002) en de browsertests (:5001)
  liepen. Statement-tellingen komen uit Postgres-statementlogging
  (`log_min_duration_statement = 0`). **Elk getal in dit rapport is een dev-modegetal en moet op de
  productionbuild opnieuw gemeten worden voordat het als norm geldt.** De richting van de bevindingen
  (aantal statements, aantal bytes, aantal requests) verandert daar niet door — die zijn build-onafhankelijk.
- **Alles is achteraf teruggezet.** `lvs_audit_bk` staat op de goede back-up, de scratchdatabases
  (`lvs_audit_bk_other`, `lvs_audit_bk_empty`) zijn gedropt, de `icacls`-deny is verwijderd,
  `backup_settings.localPath` is hersteld, de tijdelijke `gunzip.exe`-shim is weggehaald en de
  Postgres-statementlogging is met `ALTER DATABASE … RESET` / `ALTER SYSTEM RESET` uitgezet en
  geverifieerd. Wat bewust is blijven staan: de back-uparchieven in `audit-backups` (1,6 GB), de
  fixtures met prefix `AUDIT-P19`/`AUDIT-` en ±700 MB gerotaliseerde Postgres-logbestanden onder
  `C:\Program Files\PostgreSQL\17\data\log` (veilig te verwijderen).

```text
PERFORMANCE REPORT

Slow operations: kalendermaandweergave (GET /api/reservations/range, 461 rijen) p50 1,08 s /
  p95 1,49 s sequentieel (1,28 / 3,69 s mét statementlogging aan), p95 5,8 s bij 10 parallel;
  jaarbereik 4,3 s (22,9 s wandkloktijd voor 10 parallel); schadecheck-PDF 0,58 s CPU per stuk
  (5 parallel laten élke andere request 2,6 s stilstaan); 10 parallelle volledige
  reserveringslijsten 2,2 s.
Measured timings: 69 endpoints × 12 sequentieel + één burst van 10 parallel
  (`p19-timing.out.json`); 62 van de 69 hebben p95 < 120 ms sequentieel. De trage verzameling is de
  reserveringskalenderfamilie, de payloads van 8 MB / 17 MB en de rapporten (100–240 ms, waarvan
  er één een 500 is).
Database problems: geen trage SQL — élk statement < 10 ms, behalve de 17 MB
  `select * from interactive_damage_checks` (45–104 ms). Het probleem is het **aantal** statements:
  het range-endpoint vuurt 2 statements per rij af (924 voor 462 rijen, 3774 voor 1894 rijen),
  `GET /api/vehicles` doet 5 synchrone statements inclusief tot 3 UPDATEs bij élke lees-actie,
  elke anonieme hit maakt één `session`-rij (50/50), 2 ongebruikte indexen,
  `interactive_damage_checks` is 18 MB voor 14 rijen (base64-afbeeldingen in tekstkolommen).
Frontend problems: de reserveringspagina downloadt **19,6 MB bij de eerste weergave** (8 MB
  volledige lijst tweemaal, door twee verschillende query keys voor dezelfde URL), dashboard
  13,1 MB, onderhoud 10,5 MB, voertuigen 8,8 MB, klanten 8,1 MB — allemaal ongecomprimeerd. Eén
  reserveringswijziging door een collega laat ≈19 MB opnieuw ophalen per open reserveringstabblad;
  geen gememoiseerde lijstrijen, een `.filter` over álle reserveringen per cel in beide kalenders.
Backend problems: N+1 in `getReservationsInDateRange` (+ 4 `console.log`-regels per onderhoudsblok);
  geen compressiemiddleware; volledige voertuig- én klantrijen ingebed in élke reservering (8 MB
  lijst, nergens paginering); schrijf-bij-lezen-statussync in `GET /api/vehicles`; 17 MB
  schadechecklijst in zijn geheel geserveerd én serverzijdig ingeladen voor een
  kilometerstandrapport; 1,6 MB PNG opnieuw gecodeerd in élke schadecheck-PDF op de event loop;
  `express.json` limiet 50 MB → +100 MB RSS per body van 20 MB.
Memory problems: geen ongeremde groei waargenomen — RSS 799 → 751 → 709 → 758 → 758 MB over
  500 gemengde requests, 20 grote lijsten, 50 PDF's en 20 s idle (V8-GC-gedreven, dev mode). RSS
  steeg wél van 641 → 799 MB over de eerste ~2 700 requests van de sessie (dev/tsx-heapgroei, niet
  aangetoond als lek). Alleen begrensde in-memory stores (previewtokens met TTL, geocodecache op
  adres, portal-last-seen-map op gebruikers-id).
Recommended optimizations: (1) voertuigen/klanten/chauffeurs in batch laden in
  `getReservationsInDateRange` (hetzelfde patroon dat `getAllReservations` al gebruikt) — haalt ~99%
  van de statements en de 1,3–4,9 s latency weg; (2) `compression()` aanzetten (gemeten gzip: 8 MB
  lijst → 288 KB, 27,9×; maandbereik 28×; voertuigen 27×) en stoppen met het inbedden van volledige
  voertuig-/klantrijen in lijstresponses (of pagineren); (3) één query key voor `/api/reservations`
  op de kalenderpagina plus serverzijdige statusfilters; (4) de headerafbeelding van de schadecheck
  (1983×793 PNG, 1,6 MB) eenmalig bij upload verkleinen of de PDF-generatie van de event loop halen;
  (5) `syncVehicleAvailabilityWithReservations` uit de GET-handlers halen; (6) de
  interactieve-schadechecklijst projecteren zónder de base64-blobs; (7) per-route JSON-bodylimieten.
```

**Nieuwe bugs:** 34 (BUG-197 … BUG-230) — 1 CRITICAL, 8 HIGH, 13 MEDIUM, 12 LOW.
**Totaal tracker na deze fase:** 230 bugs — **13 CRITICAL, 64 HIGH, 94 MEDIUM, 59 LOW**.

---

## 0. BACKUP & RECOVERY — werkt herstel echt?

**Ja, precies één keer: voor een byte-perfect archief van dezelfde database op een Linux-achtige
host.** In dat geval klopt alles — 665 voertuigen, 348 klanten, 2125 reserveringen, alle sequences
(`vehicles_id_seq.last_value` = de hoogste id, de eerstvolgende insert kreeg gewoon 1878), de
portaalwachtwoordhashes, het SMTP-wachtwoord, de admin-rij; iedereen wordt uitgelogd (de
`session`-tabel komt uit de dump mee) en kan daarna gewoon opnieuw inloggen. In élk ander geval niet.
Een archief dat **beschadigd of half gedownload** is, wordt met `psql … -f` zonder
`ON_ERROR_STOP` uitgevoerd: psql slaat elke fout over en eindigt met exitcode 0, dus de API antwoordt
**200 "Database restore completed successfully"** terwijl de kerntabellen leeg zijn — in test 4e-6
bleven `vehicles`, `reservations`, `users` en `session` allemaal op 0 rijen staan, waarna
`POST /api/login` eerst 401 en daarna **429 "Account temporarily locked"** gaf: de applicatie was
volledig buitengesloten, zonder enige weg terug ván binnenuit. Een dump van een **andere database**
(`--create`, met `\connect`) wordt met succes uitgevoerd — in de ándere database, die daarbij eerst
gedropt wordt; de doeldatabase blijft ongemoeid en de operator krijgt "succes" te zien. En een
**bestandsherstel** landt per code in `process.cwd()` in plaats van in `UPLOADS_DIR`, dus in de
gedocumenteerde productie-opstelling komt er geen enkel verwijderd document terug. De veiligheidsback-up
die vóór elke destructieve actie wordt gemaakt bestáát en is geverifieerd — maar hij is alleen met
shell-toegang en `psql` toe te passen, en juist die toegang heeft de Coolify-operator niet.

### Herstelmatrix (verdicht uit fase 17 §Restore matrix)

| Geval | Uitkomst | Databasetoestand | Herstelbaar? |
|---|---|---|---|
| Goed archief via `restore/database` | 200 in 4,3 s | volledig correct; sessies vervangen (iedereen uitgelogd), nieuwe login 200 | **ja** |
| Goed archief via `restore-data` (upload, `.sql.gz` / platte `.sql` / gzip-bytes met `.sql`-naam) | 200 in 3,5–4,0 s | identiek correct | **ja** |
| SQL-tekst met `.sql.gz`/`.tar.gz`-naam | **400** `Could not verify file type` in ~130 ms | ongewijzigd | n.v.t. (correct geweigerd) |
| Afgekapt gzip (50 % van de bytes) | **500** `Decompression failed with code 1` | ongewijzigd | n.v.t. (correct geweigerd) |
| Beschadigd gzip (8 bytes overschreven) | **500** `Decompression failed with code 1` | ongewijzigd | n.v.t. (correct geweigerd) |
| Gemanipuleerd bestand met het originele manifest | **500** `Backup file integrity check failed - checksum mismatch` | ongewijzigd | n.v.t. (checksumcontrole bewezen) |
| Dump met één onbestaande `INSERT` | **200 "succes"** | volledig hersteld (het foute statement was onschadelijk) | — |
| Dump met één kapotte COPY-rij (`NOTANINT` als id) | **200 "succes"** | **`vehicles` 0 rijen** (665 weg), FK-cascade nam `apk_date_changes` en `fines` mee; rest intact | alleen met `psql` op de server |
| Platte dump op 50 % afgekapt | **200 "succes"** | **`vehicles`/`reservations`/`users`/`session` 0**, alle sequences op 1, **niemand kan meer inloggen (429)** | alleen met `psql` uit de veiligheidsback-up |
| Schema-only dump van een lege database | **200 "succes"** | data bleef staan (DROP faalde op FK's) maar **élke sequence teruggezet naar 1** → de tweede insert botst | alleen met `psql` |
| Dump van een **andere** database (`\connect`, `CREATE DATABASE`) | **200 "succes"** in 8,2 s | doeldatabase **ongewijzigd**; de ándere database gedropt en opnieuw aangemaakt | er is niets hersteld |
| `restore/files` en `restore-files` (upload) | **500** `tar (child): Cannot connect to C: resolve failed` ná een veiligheidsback-up van 117 MB | geen bestand geschreven | Windows-tarfout; doelmap is per code `process.cwd()`, niet `UPLOADS_DIR` |
| `restore/complete` (goed DB-archief + kapotte tar) | **500** "Complete restore failed" in 12,3 s | **de database wás al vervangen** en iedereen uitgelogd | antwoord en werkelijkheid spreken elkaar tegen |
| Herstel terwijl een schrijver doorloopt | 200 in 4,0 s | schrijver kreeg 27×201, daarna 400/500/403/401; geen deadlock, geen halve toestand | consistent |

Wat wél goed werkt en bewezen is: het **maken** van back-ups (beide types, handmatig én via de
boot-catch-up), de verificatie ná elke back-up (gunzip + omvang + afsluitmarkering + sha256,
`verified=true`), de dumpvlaggen `--clean --if-exists --no-owner --no-privileges` (0 `OWNER TO`-regels),
manifest-checksum = schijf-sha256 = download-sha256, het volledige bestandsarchief (197/197 bestanden,
alleen relatieve paden, geen symlinks), de GFS-retentie (dagelijks/wekelijks/maandelijks/>365 d exact
zoals gedocumenteerd, geüploade losse bestanden nooit opgeruimd), het single-flight-slot bij
gelijktijdige back-upruns, en de foutafhandeling bij een niet-schrijfbare doelmap (`failed`-rij +
`lastError` zichtbaar in status, health en UI, en die verdwijnt weer na de eerstvolgende geslaagde run).

---

## 1. BROWSER / E2E — wat er in de echte browser is gedaan

| Specpunt | Wat er gedaan is | Uitkomst |
|---|---|---|
| Desktop | dashboard, kalender, lijstdialoog, nieuwe-reserveringsdialoog, ophaaldialoog, innamedialoog, rapporten, voertuigen, klanten, documenten | werkt, behalve de bevindingen hieronder |
| Mobiel (375 px) | dashboard, `/reservations` | dashboard bruikbaar (hamburgermenu, gestapelde snelacties); `/reservations` crasht op de kapotte rij, exact als op desktop |
| Tablet (768 px) | `/vehicles` | zijbalk blijft uitgeklapt (~30 % breedte), voertuigtabel afgekapt na "Kenteken" |
| Herladen | volledige reload van `/reservations`, `/vehicles`, `/reports` | sessie overleeft; élke reload haalt alles opnieuw op (geen persistente cache) |
| Terug / vooruit | dashboard → `/reservations` → terug → vooruit | routing correct; bij "terug" vuurde de app **41 API-requests** opnieuw af (`staleTime` 0 op die queries) |
| Meerdere tabbladen | dezelfde sessie in twee tabbladen, uitloggen in A, navigeren in B | tabblad B toont gewoon cachegegevens door, terwijl zijn requests 401 geven — geen melding |
| Traag netwerk | `/api/documents` 9 s vertraagd, daarna Documenten openen; idem `/api/customers` | spinner, daarna rendert de pagina; géén timeout, géén annuleren. Bij `/api/customers` rendert de pagina direct uit de cache → een trage backend is onzichtbaar tot de volgende reload |
| Mislukte requests | `/api/reports/maintenance-costs` (500, BUG-089) vanaf de rapportenpagina | de 500 wordt getoond als de lege toestand "Geen onderhoudskostgegevens beschikbaar" — niet te onderscheiden van "geen data" |
| API-timeout | niet emuleerbaar voorbij de vertraging hierboven; de client heeft **helemaal geen** requesttimeout (`queryClient.ts`: kale `fetch`, geen `AbortController`) | zie BUG-212 |
| Serverherstart | ingelogd op `:5002`, node-proces gekild, herstartlus pakte het na ~5 s op | tijdens de storing: `ERR_CONNECTION_REFUSED` + socketfouten in de console, **geen banner, toast of offline-indicator**. Ná de herstart: socket verbond zichzelf, sessie overleefde (`GET /api/user` 200 — sessies staan in Postgres), geen herlogin nodig. **Herstel is automatisch en correct; alleen de terugkoppeling aan de gebruiker ontbreekt.** |
| Lang laden | 8,0 MB ongecomprimeerde `/api/reservations` (2075 rijen) in 181 ms op localhost; de kalenderpagina vraagt hem **tweemaal** bij het laden en driemaal na het aanmaken van een reservering | doorgezet naar fase 19 |
| Lege toestanden | voertuigen zoeken op "ZZZ-NOPE-999" | "No results." / "Showing 0 of 0" / "Previous" / "Next" — Engels in een Nederlandse UI |
| Grote datasets | voertuigenlijst 665 rijen; kalendermaand met ~2000 reserveringen | clientpaginering "10 of 665" reageert vlot; de maandweergave rendert < 1 s (dev mode) |
| Echte werkstroom | nieuwe reservering → ophalen (contract) → innemen (schadecheck) | werkt van begin tot eind (reservering #3544, documenten 447 + 448, km-stand 100 → 250). Bijwerkingen: BUG-019 gereproduceerd via de UI (einddatum overschreven met vandaag), ophalen 40 dagen vóór de startdatum zonder enige waarschuwing, voertuig bleef `available` terwijl de reservering `picked_up` was |
| Reservering bewerken | #3472 en #3231 openen, alléén de notitie wijzigen, opslaan | **faalt elke keer** met 400 `invalid input syntax for type integer: ""` |
| Inloggen | gebruikersnaam + wachtwoord + Enter | Enter verstuurt niet; alleen de knop werkt — **niet bevestigd**, zie §6.1 |
| Portaal (rooktest) | `/portaal/login` → inloggen (klant 179) → `/portaal/voertuigen`, desktop én mobiel | login, begroeting, voertuigkaarten, onderhouds- en vervangerbadges renderen; mobiele layout met onderbalk stapelt netjes. `/portal` (zonder het Nederlandse pad) toont de SPA-404 met de ontwikkelaarstekst "Ben je vergeten de pagina aan de router toe te voegen?" |

**Niet getest in fase 18 — en waarom**

- **Database-uitval:** het stoppen van de lokale Postgres-service zou óók de eigen dev-server en
  database van de ontwikkelaar platleggen, plus de twee andere auditactiviteiten die op dat moment op
  dezelfde host draaiden. Bewust niet gedaan; blijft een **open gat**.
- **Drag & drop in de kalender:** BUG-106 is op API-niveau bewezen, maar de muissleep was in dit
  gereedschap niet betrouwbaar te reproduceren.
- **Printen:** de browserprintdialoog is in dit gereedschap niet waarneembaar; alle client-side
  printuitvoer (sleutellabels, barcodeboek, kalender- en rapportprint) blijft ongetest — net als in
  fase 14.
- **Barcodescanner (`/scan`):** vereist een camera.
- **Portaal-UI voorbij de rooktest** (aanvraagdialogen, documentbevestigingen, chauffeurbeheer): op
  API-niveau gedekt in de fases 3-5/10/11/16.

---

## 2. Voor de eigenaar

Acht punten in gewone taal.

1. **Het bewerkscherm van reserveringen is al ruim twaalf dagen stuk — in productie.** Wie een
   bestaande boeking opent, alleen de notitie wijzigt en op "Reservering bijwerken" klikt, krijgt
   altijd een foutmelding. Elke keer, bij elke reservering, bij elke gebruiker. De oorzaak zit in twee
   kolommen die in augustus en september aan de reservering zijn toegevoegd en die de server niet
   verwerkt als ze leeg zijn. De tweede daarvan is toegevoegd door de klantenportaalfunctie die **de
   auditleider zelf gebouwd en op 2026-09-08 uitgerold heeft**. Dit is het enige punt in dit rapport
   waarvoor een directe hotfix wordt voorgesteld. **BUG-202.**
2. **Eén foutieve datum legt de hele planningspagina plat.** Staat er in één reservering een datum die
   geen datum is, dan crasht `/reservations` voor **iedereen**, op elk scherm. In de testomgeving zag
   je nog een foutmelding; in productie krijgt de medewerker een **wit scherm**, omdat er nergens in de
   applicatie een vangnet ("error boundary") zit. De pagina komt pas terug als iemand die ene rij in de
   database repareert. **BUG-201.**
3. **Een beschadigde back-up wordt teruggezet als "gelukt" — met een lege database.** Wordt een archief
   half gedownload of raakt het beschadigd, dan meldt het systeem "Database restore completed
   successfully" terwijl de voertuigen, reserveringen en gebruikers weg zijn. Daarna kan **niemand meer
   inloggen** (na vijf pogingen gaat het account zelfs op slot), en er is geen enkele knop in de
   applicatie om het terug te draaien. De veiligheidskopie die het systeem vlak daarvoor maakt, bestaat
   wél — maar die is alleen met technische toegang tot de server terug te zetten. **BUG-197.**
4. **Geüploade back-ups en bestandsherstel komen in de verkeerde map terecht.** In de productie-opstelling
   (bestanden op een apart gekoppeld volume) landt een handmatig geüploade back-up in de programmamap in
   plaats van op het back-upvolume — hij is daarna niet te vinden, niet te downloaden en niet terug te
   zetten (404). Het terugzetten van documenten schrijft om dezelfde reden naar de verkeerde map: een
   verwijderd contract komt níét terug, terwijl het scherm "Files restore completed successfully" meldt.
   **BUG-198, BUG-200.**
5. **De planningsschermen downloaden ongeveer 20 MB per keer dat u ze opent.** De reserveringspagina
   haalt dezelfde lijst van 8 MB tweemaal op, plus nog wat, en doet dat opnieuw élke keer dat een
   collega ergens een reservering wijzigt. Bovendien vuurt de maandweergave meer dan **900
   database-opdrachten** af voor één scherm (een jaarweergave bijna 3 800), waardoor die pagina 1 tot 4
   seconden staat te wachten — en 6 tot 23 seconden als een handvol mensen tegelijk kijkt. Op kantoor
   valt dat mee omdat alles op één netwerk staat; op een 4G-verbinding kost één schermopening tientallen
   seconden. Niets hiervan is gecomprimeerd, terwijl compressie de bestanden 24 tot 28 keer kleiner
   maakt. **BUG-203, BUG-204, BUG-205, BUG-214.**
6. **Niemand ziet wanneer de server of de mail eruit ligt.** Valt de server weg, dan blijft het scherm
   gewoon de laatst geladen gegevens tonen: geen melding, geen streepje, niets. Hetzelfde geldt voor een
   rapport dat mislukt — dat wordt getoond als "geen gegevens beschikbaar", niet als een fout. Een
   medewerker concludeert dan "er zijn geen onderhoudskosten" terwijl het rapport in werkelijkheid
   kapot is. En logt iemand in een ander tabblad uit, dan werkt het eerste tabblad ogenschijnlijk
   gewoon door tot de eerste keer opslaan. **BUG-212, BUG-213.**
7. **Een auto die al opgehaald is, staat nog steeds als beschikbaar in het systeem.** Tijdens de test is
   een auto 40 dagen vóór de startdatum opgehaald — zonder enige waarschuwing — en daarna bleef hij op
   het dashboard gewoon als vrij staan, terwijl hij fysiek van het terrein was. Dat is precies het
   scenario waarin dezelfde auto een tweede keer verhuurd wordt. **BUG-211.**
8. **Vier punten zijn geen programmeerfout maar een keuze die u moet maken.** Mag een auto vóór de
   startdatum opgehaald worden — en zo ja, schuift de startdatum dan mee of wordt het geblokkeerd? Mogen
   de lijstschermen minder gegevens meesturen en gepagineerd worden (dat verandert wat elk scherm
   binnenkrijgt)? Mogen de schadechecktekeningen uit de database naar bestanden verhuizen? En gaan we de
   tijdstempels in de database migreren zodat documenttijden niet langer twee uur naast de werkelijkheid
   staan? Deze staan in §8 als **voorstel**, niet als opdracht. **BUG-205, BUG-211, BUG-216, BUG-224.**

---

## 3. Totalen

### 3.1 Nieuw in deze fase

| Severity | Nieuw | Bug-id's |
|---|---|---|
| CRITICAL | 1 | BUG-197 |
| HIGH | 8 | BUG-198 … BUG-205 |
| MEDIUM | 13 | BUG-206 … BUG-218 |
| LOW | 12 | BUG-219 … BUG-230 |
| **Totaal** | **34** | **BUG-197 … BUG-230** |

Verdeling over de bronfases: fase 17 → 11 bugs, fase 18 → 10 bugs (uit 11 bevindingen; E18-007 kreeg
géén nummer, zie §6.1), fase 19 → 13 bugs.

### 3.2 Cumulatief tracker BUG-001 … BUG-230

| Severity | BUG-001…059 | BUG-060…105 | BUG-106…158 | BUG-159…196 | BUG-197…230 | Totaal |
|---|---|---|---|---|---|---|
| CRITICAL | 7 | 2 | 2 | 1 | 1 | **13** |
| HIGH | 16 | 14 | 14 | 12 | 8 | **64** |
| MEDIUM | 24 | 17 | 24 | 16 | 13 | **94** |
| LOW | 12 | 13 | 13 | 9 | 12 | **59** |
| **Totaal** | **59** | **46** | **53** | **38** | **34** | **230** |

### 3.3 T/B-classificatie van de 34 nieuwe bugs

**T** = technische fout, mag met een regressietest gefixt worden zonder goedkeuring van de eigenaar.
**B** = bedrijfsregel/proces-/migratiebesluit — de eigenaar moet eerst kiezen; komt terug als
OPT-voorstel in §8.

| Type | Aantal | Bug-id's |
|---|---|---|
| T | 30 | alle nieuwe bugs behalve de vier hieronder |
| B | 4 | BUG-205, BUG-211, BUG-216, BUG-224 |

Bij twee daarvan is maar één **helft** een besluit: bij **BUG-211** is "voertuigstatus afleiden uit
`status === 'picked_up'`" gewoon **T** (dat is een fout, geen keuze) en is alleen "blokkeren of de
startdatum meeschuiven" **B**; bij **BUG-216** is de projectie zónder blobkolommen **T** en is alleen
het verplaatsen van de afbeeldingen naar bestanden een **migratiebesluit (B)**.

### 3.4 Severity-normalisaties ten opzichte van de bronrapporten

| Bron | Bronseverity | Nieuw | Reden |
|---|---|---|---|
| B17-001 | CRITICAL | **CRITICAL** (BUG-197) — *bevestigd, niet verlaagd* | Overwogen en verworpen: "het is alleen een fout archief, dat overkomt je zelden". De testreeks laat zien dat een half gedownload of licht beschadigd archief géén uitzonderlijk geval is, dat het resultaat **stille, volledige** dataverlies is (`vehicles` 0, `users` 0) en dat er ván binnenuit geen enkele weg terug is — inclusief een accountlockout die de laatste poging afsnijdt. Dat is exact de definitie van CRITICAL (dataverlies / onherstelbaar) in deze tracker. |

Alle overige 33 bugs behouden de severity van hun bronrapport. Twee **bestaande** bugs krijgen op grond
van runtimebewijs uit deze fases een bijstelling zónder hernummering (zie §7): **BUG-079** (het
volumeaspect wordt ontkracht — 203 bytes per regel, ≈1 MB/dag; het lek van kleine geheimdragende
bodies blijft staan) en **BUG-062** (blijft staan, maar krijgt een nuance die de bug in dit scenario
juist tot de **enige** manier maakt om weer binnen te komen).

---

## 4. Per fase

### 4.1 Fase 17 — Back-up & recovery

Alles op `:5002` / `lvs_audit_bk`. Scripts `docs/audit/wip/scripts/p17-*.cjs|sh` met helper
`p17-lib.cjs` (unieke nep-IP's `10.17.1.x`); fixtures, logs en snapshots onder
`docs/audit/wip/scripts/files/p17/` (sha256-lijst in `fixtures.sha256`, requestlog in
`restore-log.jsonl`). Alle back-uproutes hangen achter `hasPermission(MANAGE_BACKUPS)`
(`server/routes/backups.ts`). De scheduler (`server/backupScheduler.ts`) draait `node-cron '0 2 * * *'`
in Europe/Amsterdam plus een boot-catch-up 5 minuten na start wanneer de oudste van de twee
back-uptypes meer dan 24 uur geen geverifieerd succes heeft; die catch-up is live waargenomen
(`backup_runs` 285/286, `trigger=catchup`, beide `success`, `verified=true`).

**Eén platformdetail dat het hele hoofdstuk kleurt:** de `gunzip` van Git-for-Windows is een
`#!/bin/sh`-script, dat Node's `spawn()` niet kan uitvoeren (`spawn gunzip ENOENT`). Om de
herstelpaden überhaupt te kunnen testen is een kleine `gunzip.exe`-shim gecompileerd
(`files/p17/gunzip.cs`, byte-identieke uitvoer en identieke exitcodes als echte gzip op het goede, het
afgekapte en het beschadigde archief), die na afloop weer is verwijderd. De C#-bron staat er nog voor
reproduceerbaarheid.

**Getest (geslaagd)**
- **Back-up maken** van beide types via de handmatige run én via de boot-catch-up; na élke back-up
  draait de verificatie (gunzip, minimale omvang, afsluitmarkering, sha256) en wordt `verified=true`
  vastgelegd.
- **Dumpinhoud:** `--clean --if-exists` aanwezig (47 × `DROP TABLE IF EXISTS`, 123 × `DROP
  CONSTRAINT`), **0** `OWNER TO`/`GRANT`-regels, 47 `CREATE TABLE`, 47 `COPY`-blokken, 46 `setval`,
  geen `\connect`, afsluitend met `PostgreSQL database dump complete`. Rijtellingen in de dump zijn
  gelijk aan live op hetzelfde moment.
- **Integriteit end-to-end:** manifest-checksum = sha256 op schijf = sha256 van de download, via
  **beide** downloadroutes, met `Content-Disposition: attachment`.
- **Bestandsarchief compleet:** 197 entries = 197 bestanden op schijf (`comm` op beide gesorteerde
  lijsten: niets alleen-op-schijf, niets alleen-in-tar), uitsluitend relatieve paden onder `uploads/`,
  geen symlinks, geen `..`, `metadata.fileCount = 197`.
- **Herstel van een goed archief** via `restore/database` én via `restore-data` (gz, platte SQL,
  gzip-bytes met `.sql`-naam): data, sequences, portaalgebruikers, SMTP-instelling en admin allemaal
  correct; sessies ongeldig (iedereen uitgelogd), nieuwe login 200, eerstvolgende insert kreeg id 1878
  zonder sleutelbotsing.
- **Veiligheidsback-up** wordt vóór élk destructief pad genomen en geverifieerd, óók op de
  uploadroutes.
- **Alles wat geweigerd moet worden, wordt geweigerd vóórdat psql draait:** afgekapt gzip, beschadigd
  gzip, gemanipuleerd bestand met het originele manifest (checksummismatch), en niet-dumpuploads
  (`Could not verify file type` / "does not look like a PostgreSQL dump"). De volgorde is bewezen:
  eerst gunzip, dan checksum, dan pas psql.
- **Typebevestiging:** `restore/database` eist `confirmFilename` (400 bij mismatch),
  `restore/complete` eist beide.
- **Retentie (GFS)** gedraagt zich exact als gedocumenteerd: 21 dagen oud op een donderdag → weg,
  18 dagen op een zondag → bewaard (wekelijks), de 1e van de maand → bewaard (maandelijks), > 365
  dagen → weg, en losse geüploade bestanden worden **nooit** opgeruimd. Manifesten verdwijnen mét het
  archief, `backup_runs`-rijen blijven met `file_pruned=true`.
- **Single-flight:** twee gelijktijdige `POST /api/backups/run` → A 200 (6,3 s), B 500 "Backup is
  already running"; exact één archief + manifest per type, geen corruptie.
- **`BACKUP_PATH` wint van de databaseinstelling** (bewezen door `localPath` naar een niet-bestaande
  map te zetten: de back-up landde gewoon in `BACKUP_PATH`, de map werd nooit aangemaakt).
- **Niet-schrijfbare doelmap:** 500 in 1,4 s met de volledige EPERM-melding, `backup_runs` 293/294
  `failed`, `lastError` zichtbaar in `/status`, `/health` en in de rode "Last backup error"-box in de
  UI — en die verdwijnt weer zodra de volgende run slaagt.
- **Schrijvers tijdens een herstel:** geen deadlock, geen halve toestand; schrijvers falen snel
  (400/500/403/401) en geen enkele request duurde langer dan 1 s.
- **Uploadvalidatie:** tekst-als-gz, zip-als-gz, 0-byte `.sql.gz` en `.exe` worden alle geweigerd;
  200 MB werd in 1,1 s geaccepteerd (limiet 1 GB).

**Niet getest**
- **De echte 02:00-cronrun** — dat vereist wachten; het catch-uppad is in plaats daarvan uitgeoefend
  (identieke `runBackup`-aanroep).
- **Bestandsherstel end-to-end** (een verwijderd document terughalen, extra bestanden
  bewaard/verwijderd, open bestandshandles): GNU tar op Windows leest `C:\…` als `host:file`, dus élk
  bestandsherstel faalt vóór de extractie. Forceren zou in de `uploads/` van de repo hebben
  geschreven — buiten de scope. De doelmap is daarom **alleen per code** bewezen (BUG-198).
- **`restore-code`** — BUG-069, een destructieve RCE-primitief die bovendien `process.exit(0)` doet.
- **`download-code`-inhoud** — 500 op deze host door dezelfde tar-oorzaak.
- **Volle schijf** — geen quotagereedschap op deze host.
- **`pg_dump` ontbrekend tijdens runtime op `:5002`** — niet simuleerbaar zonder herstart. De
  foutmelding is wél bekend en historisch bewezen: 28 eerdere `catchup`-rijen in de gekloonde
  `backup_runs` falen met exact `pg_dump executable not found on PATH. Install the PostgreSQL client
  tools (postgresql-client) on this host to enable database backups.`
- **De retentierail "de nieuwste back-up is beschermd"** — alle echte archieven waren te jong.
- **De bestandsrechten van back-ups binnen de Docker-deployment** — op deze host zijn ze NTFS-geërfd
  (`SYSTEM/Administrators/kees lam:(F)`, niet wereldleesbaar); in de container is het wat het volume
  geeft en dat is hier niet toetsbaar.
- **Herstel onder echte productiebelasting** — er liep maar één schrijverslus.

**Wat een archief waard is voor een aanvaller** (relevant voor het bewaarbeleid): elke dump bevat de
volledige `session`-tabel met live `connect.sid`-waarden (bruikbaar voor sessiekaping tot de sessie
verloopt), de scrypt-hashes en salts uit `users`, `portal_users.password_hash`, `login_attempts`,
`audit_logs`, het **SMTP-wachtwoord in platte tekst** (BUG-010), de CJIB-FTPS-configuratie en alle
klant-PII.

**Bevindingen:** 11 (B17-001…011) → 11 nieuwe bugs, geen samenvoegingen.

### 4.2 Fase 18 — Browser / E2E

Uitgevoerd in de Claude Browser tegen `http://127.0.0.1:5001` (dev mode). Er bestaat **geen**
Playwright/Cypress in de repo (vastgesteld in fase 2), dus dit is de eerste en enige fase waarin de
applicatie daadwerkelijk door een browser is bediend. Testdata: reservering **#3544** (voertuig
`AU-13-DCX`, klant "Klant 5 B.V.", 2026-10-20..22) is aangemaakt, opgehaald en ingenomen via de echte
dialogen. Twee stafftabbladen deelden één sessie. De volledige matrix "wat er per specpunt is gedaan"
staat in §1.

**Getest (geslaagd)**
- De volledige werkstroom nieuwe reservering → ophalen mét contract → innemen mét schadecheck loopt
  van begin tot eind door de UI (documenten 447 en 448 aangemaakt, kilometerstand 100 → 250).
- Routing (terug/vooruit), sessiebehoud over een harde reload, en sessiebehoud over een
  **serverherstart** heen — sessies staan in Postgres, dus er was geen herlogin nodig en de
  Socket.IO-client verbond zichzelf opnieuw.
- Clientpaginering op 665 voertuigen (10 per pagina) en de kalendermaandweergave met ~2000
  reserveringen renderen vlot (< 1 s in dev mode).
- Het mobiele dashboard (375 px) is bruikbaar: hamburgerzijbalk, gestapelde snelacties.
- De portaalrooktest: inloggen, begroeting, voertuigkaarten met "Onderhoud melden / Schade melden /
  Kilometerstand doorgeven", onderhouds- en vervangerbadges, en een mobiele onderbalk die netjes
  stapelt.
- Herstel na serverstoring is **automatisch en correct** — de enige tekortkoming is dat de gebruiker
  er niets van ziet (ondergebracht in BUG-212).

**Niet getest:** database-uitval, drag & drop in de kalender, printen, de barcodescanner en de
portaal-UI voorbij de rooktest — met de redenen in §1.

**Bevindingen:** 11 (E18-001…011) → **10** nieuwe bugs. E18-007 (Enter verstuurt het loginformulier
niet) is **niet** genummerd: de code klopt (`<form onSubmit={…}>` met een `type="submit"`-knop,
`auth-page.tsx:80` en `:108`) en dezelfde niet-verzending trad op bij het **portaal**-loginformulier,
wat sterk wijst op de synthetische Return-toets van het testgereedschap. Zie §6.1.

### 4.3 Fase 19 — Performance

Auditserver `:5001`, database `lvs_audit` (665 voertuigen, 348 klanten, 2 125 reserveringen waarvan
2 077 live / 305 onderhoudsblokken / 26 placeholders, 283 documenten, 1 999 kostenposten, 14
interactieve schadechecks). Scripts `p19-lib.cjs`, `p19-timing.cjs`, `p19-sqlcount.cjs`,
`p19-page-replay.cjs`, `p19-memory.cjs`, `p19-pdf.cjs`, `p19-largefile.cjs`, `p19-anon-session.cjs`,
`p19-loglines.cjs`, `p19-compress.cjs`, met de ruwe getallen in de bijbehorende `p19-*.out.json`.

**Meetopzet en de grenzen daarvan.** Latency = wandkloktijd van requeststart tot de volledig gelezen
body door een Node 24-client op dezelfde host; omvang = gedecodeerde bodybytes. Statement-tellingen
komen uit de Postgres-log met `log_min_duration_statement = 0` en zijn het **minimum van 3
herhalingen** (vervuiling kan alleen statements toevoegen). Die logging produceerde in ~15 minuten
≈700 MB log; de reserveringsendpoints zijn daarom **opnieuw gemeten met logging uit** en die getallen
zijn de getallen die in de bevindingen staan (logging kostte het range-endpoint ~15 %). Elke sessie
gebruikte een eigen `X-Forwarded-For`, omdat de algemene limiter van 1000/15 min ook ingelogde
sessies meetelt (BUG-074).

**Basiskosten per request** (relevant bij élk getal hieronder): **3 statements voor elke
geauthenticeerde request** (`SELECT sess FROM session`, de `users`-select voor passport-deserialisatie
en een `UPDATE session SET expire` omdat `rolling: true` aanstaat, `server/auth.ts:107-114`) en 2 voor
een anonieme request. Routes die in `server/routes.ts` geregistreerd staan doen de `users`-select
**tweemaal** — één statement extra per request ten opzichte van `/api/user`.

**Getest (geen probleem gevonden)**
- **62 van de 69 endpoints** hebben p95 < 120 ms sequentieel en ≤ 240 ms bij 10 parallel: alle
  klant-, document-, transport-, boete-, melding-, instellings-, sjabloon-, portaal- (9 endpoints) en
  portaal-adminlijsten, met 4–15 statements en geen enkele per-rij-query
  (`attachTransportRelations`, `getAllExpenses`, `getAllReservations`, `getUpcoming*` en
  `getAllOverdueReservations` batchen of joinen allemaal netjes).
- **Zoekendpoints** (voertuigen/klanten/reserveringen, 1 teken / veelvoorkomend / geen treffer):
  15–44 ms p50, `LIMIT 10`, statementaantal onafhankelijk van de resultaatgrootte.
- **Postgres is op dit datavolume niet de bottleneck.** `EXPLAIN (ANALYZE, BUFFERS)` van de zwaarste
  SQL: kalenderrange → Seq Scan, 47 buffers, **2,4 ms** voor 461 rijen; volledige live lijst 0,7 ms;
  statussync-select 1,7 ms; voertuigzoekactie 0,2 ms. De **plantijd (3–9 ms) overtreft overal de
  uitvoertijd**. De indexen op `reservations` zijn adequaat (pkey, `vehicle_id`, `customer_id`,
  `start_date`, `end_date`, `status`, `status_start_date`, `deleted_at`, uniek `contract_number`);
  0 tijdelijke bestanden, 0 deadlocks, 268 rollbacks op 298 352 commits, geen enkele transactie
  `idle in transaction`.
- **Bestandsstromen:** 20 MB uploaden (201 in 126 ms, multer `diskStorage`) en downloaden (TTFB
  23 ms, 188 ms totaal, `res.sendFile`) zijn aan beide kanten gestreamd, zonder RSS-groei.
- **Contract- en transportrapport-PDF's:** 27–48 ms p50, geen meetbare invloed op de event loop met
  5 parallel (probe max 61 ms).
- **Geheugen:** geen groei buiten GC-ruis over 500 gemengde requests, 20 grote lijsten en 50 PDF's;
  de in-memory stores zijn alle begrensd (previewtokens per TTL, geocodecache per adres, portal
  last-seen per gebruiker).
- **Connectiepool:** `max 10`, geen enkele wachtende client bij 10 gelijktijdige requests.

**Niet gemeten**
- **Browser-rendertijden en React-rerendertellingen** — er was geen browser in die agent; de
  renderanalyse is **statisch** en als zodanig gelabeld (BUG-228).
- **De productionbuild** (`npm run build` + `NODE_ENV=production`) — buiten scope voor de
  auditserver. De dev-modegetallen zijn pessimistisch (tsx, Vite-middleware, geen
  `express.static`-caching); de statement- en bytetellingen zijn dat níét.
- **De RDW-APK-scan** (`POST /api/apk-date-changes/scan-now`) — die bevraagt de publieke RDW-API voor
  alle 665 voertuigen; alleen statisch geanalyseerd.
- **Een back-uprun** — er draaide op dat moment een andere agent met destructieve back-uptests;
  statisch geanalyseerd (gestreamde `pg_dump | gzip`, geen in-memory buffering).
- **Socket.IO-fan-out met veel gelijktijdige clients** — er was er één.
- **De omvang van de serverconsole** — die stdout hoort bij de terminal van de auditleider; de
  logvolumes zijn berekend uit de exacte formatstrings tegen echte rijen.

**Bevindingen:** 13 (PF19-001…013) → 13 nieuwe bugs, geen samenvoegingen.

---

## 5. Deduplicatie — mapping wip-id → tracker-id

Er is in deze drie fases **nul keer** samengevoegd op root cause tussen twee wip-bevindingen, met
**één** uitzondering: de serverherstart-observatie uit fase 18 ("geen offline-indicator") is
ondergebracht bíj E18-005 in plaats van als eigen nummer, omdat het exact dezelfde ontbrekende laag
is (de client kijkt nergens naar `isError`/verbindingsstatus). Eén bevinding krijgt **geen** nummer
(E18-007, niet bevestigd). Verder zijn er **veertien expliciete rulings** over "nieuw nummer versus
bestaande bug", **twee gedeeltelijke toewijzingen** en **één ontkrachting** van een bestaande bug.

| Wip-id | Verdict | Tracker-id |
|---|---|---|
| B17-001 | nieuw, **severity CRITICAL bevestigd** (zie §3.4). *Ruling:* niet samengevoegd met BUG-062 (standaardadmin wordt bij het starten opnieuw aangemaakt). BUG-062 is een beveiligingsfout die hier toevallig het enige vangnet is; B17-001 is het dataverlies zelf | **BUG-197** |
| B17-002 | nieuw. *Ruling:* **gescheiden gehouden van BUG-069.** BUG-069 is `restore-code`: een tar over `process.cwd()` gevolgd door `process.exit(0)`, geclassificeerd als RCE-primitief. B17-002 is dezelfde `-C process.cwd()`-fout in de **niet-code**-herstelpaden (`restore/files`, `restore-files`, `restore/complete`), waar het gevolg functioneel is: documenten komen niet terug in `UPLOADS_DIR`, terwijl de veiligheidsback-up wél uit `getUploadsDir()` is gemaakt. Andere fix (`--strip-components=1 -C getUploadsDir()`), andere regressietest. Nieuwe evidence bíj BUG-069: de primitief is niet beperkt tot `restore-code` (zie §7) | **BUG-198** |
| B17-003 | nieuw — geen bestaande bug dekt dat een dump met `\connect`/`CREATE DATABASE` in een **andere** database wordt uitgevoerd terwijl de API succes meldt. Raakt aan B17-001 (fouten worden ingeslikt) maar heeft een eigen, veel goedkopere fix (bestandsinhoud weigeren die psql-metacommando's of `CREATE|DROP DATABASE` bevat) | **BUG-199** |
| B17-004 | nieuw. *Ruling:* **gescheiden gehouden van BUG-076.** BUG-076 gaat over de **bestandsnaam** (`originalname` zonder `sanitizeFilename`) en is in fase 15 runtime ontkracht. B17-004 gaat over de **map**: de route hardcodeert `process.cwd()/backups`, dus met `BACKUP_PATH` gezet — de productievorm — is een geüploade back-up niet te listen, niet te downloaden en niet te herstellen (404 op beide) | **BUG-200** |
| B17-005 | nieuw | **BUG-206** |
| B17-006 | nieuw. *Ruling:* niet samengevoegd met B17-005 hoewel beide "achtergebleven kopieën van de dump" opleveren. B17-005 is `os.tmpdir()` (nooit `unlink`), B17-006 is een **ESM-fout** (`require is not defined` in een `"type":"module"`-build) die de opruiming van het gedecomprimeerde bestand in de **back-upmap** stilzwijgend laat mislukken; dat bestand verschijnt bovendien als "restorable backup" in `/api/backups/list`. Andere root cause, andere fix, andere regressietest | **BUG-207** |
| B17-007 | nieuw | **BUG-208** |
| B17-008 | nieuw — *gedeeltelijke toewijzing:* de helft "`download-data` lekt `DATABASE_URL`/laat artefacten in `temp/` achter" is **BUG-075** (herbevestigd met nieuwe evidence, geen nieuw nummer) en de clear-text-SMTP-inhoud van de export is **BUG-010**. Het nieuwe deel is dat `download-files` `process.cwd()/uploads` archiveert in plaats van `getUploadsDir()` — precies de fout die het commentaar bij `getUploadsDir()` in `shared/paths.ts` als opgelost beschrijft — plus dat de `download-data`-dump `--clean/--no-owner` mist en dus niet met hetzelfde gereedschap terug te zetten is als de automatische back-ups | **BUG-209** |
| B17-009 | nieuw, **LOW**. *Ruling:* bewust **niet** verhoogd hoewel op deze host élk herstelpad faalt. Productie draait in Linux-containers waar `gunzip` en `tar` bestaan; de bug is de architectuurkeuze (drie verschillende decompressiestrategieën, waarvan twee externe binaries die de Dockerfile niet als dependency declareert) plus het feit dat de fout pas ná de 1–13 s veiligheidsback-up optreedt. De 28 historische `pg_dump`-ENOENT-rijen in `backup_runs` laten zien dat gereedschapsgaten in deze deployment wél degelijk voorkomen | **BUG-219** |
| B17-010 | nieuw | **BUG-220** |
| B17-011 | nieuw — *ruling:* als **één bundel** gehouden (zes UX-/statusdetails met één gedeelde eigenaar: de back-updialoog en de statusroutes). Punt (f), het ontbreken van de getypte bevestiging op `restore-data`/`restore-files`, verdient in de fix voorrang omdat het de drempel voor een volledige databasevervanging tot één klik verlaagt | **BUG-221** |
| E18-001 | nieuw, **HIGH**. *Ruling:* **gescheiden gehouden van BUG-111.** BUG-111 is de serverfout (`PATCH /api/reservations/:id` accepteert een niet-ISO-datum); E18-001 is het **clientdefect**: `format(parseISO(...))` zonder `isValid`-guard op 20+ plaatsen in één bestand, plus het volledig ontbreken van een `ErrorBoundary` in `client/src/App.tsx`. Twee bestanden, twee fixes, twee regressietests — en de clientfix is de enige die ook bestaande, al vervuilde rijen overleeft | **BUG-201** |
| E18-002 | nieuw, **HIGH**. *Ruling:* **gescheiden gehouden van BUG-084.** BUG-084 is het algemene patroon "de rauwe multipart-body gaat ongevalideerd naar `db.update()`". E18-002 is het concrete, **nu in productie actieve** gevolg: twee integerkolommen ontbreken in de handmatig onderhouden `""→null`-whitelist, waardoor het standaard bewerkformulier **altijd** 400 geeft. Eigen regressietest (multipart met `portalRequestId=""` én `replacementForTransportId=""` → 200) plus een schema-drift-test. Kandidaat voor een **onmiddellijke hotfix**, zie §8.2 | **BUG-202** |
| E18-003 | nieuw | **BUG-210** |
| E18-004 | nieuw, **B** (met een T-helft). *Ruling:* **gescheiden gehouden van BUG-109 en BUG-130.** Die gaan over dubbele boekingen respectievelijk over reserveringen die in een verkeerde status blijven hangen; E18-004 is het **ophaalmoment**: er is geen enkele controle op `startDate > vandaag` (40 dagen te vroeg opgehaald, zonder waarschuwing) én `availabilityStatus` blijft `available` omdat de statushelper alleen naar de datums kijkt en niet naar `status === 'picked_up'`. Die tweede helft is een **T** (een fout, geen keuze); de eerste helft — blokkeren of de startdatum meeschuiven — is een **B** | **BUG-211** |
| E18-005 | nieuw — **enige samenvoeging in deze fases:** E18-005 (mislukte GET's als lege toestand, geen timeout, geen retry) plus de serverherstart-observatie ("geen banner, toast of offline-indicator terwijl `ERR_CONNECTION_REFUSED` en socketfouten in de console staan") vormen één bug met één fix: een globale foutlaag in `queryClient` plus een verbindingsindicator gevoed door de `disconnect`/`connect_error`-events die al afgevuurd worden | **BUG-212** |
| E18-006 | nieuw. *Ruling:* **gescheiden gehouden van BUG-091.** BUG-091 is serverzijdig ("een wachtwoordwijziging trekt andere sessies niet in"). E18-006 is clientzijdig: de sessie is wél beëindigd, de server antwoordt keurig 401, maar de client toont onverstoorbaar de React-Query-cache door en leidt nooit naar `/login`. Eigen fix (globale 401-handler + cache wissen), eigen regressietest | **BUG-213** |
| E18-007 | **geen tracker-id.** Enter verstuurt het loginformulier niet, twee keer gereproduceerd — maar `client/src/pages/auth-page.tsx:80` heeft een correcte `<form onSubmit={loginForm.handleSubmit(onLoginSubmit)}>` met een `type="submit"`-knop op `:108`, en exact hetzelfde gedrag trad op bij het **portaal**-loginformulier. Dat wijst op de synthetische Return-toets van het testgereedschap, niet op de applicatie. Staat in §6.1 als **niet bevestigd**, met de handmatige controle die het zou moeten beslissen | **—** |
| E18-008 | nieuw. *Ruling:* niet samengevoegd met E18-003 hoewel beide layout zijn. E18-003 is horizontale paginascroll + een niet-gereset `scrollX` op de **kalender bij 1182 px**; E18-008 is de **zijbalk-breakpoint** (`md` = 768 px, dus precies uitgeklapt op tabletbreedte) plus tabellen zonder `overflow-x-auto`-wrapper. Andere bestanden, andere fix | **BUG-222** |
| E18-009 | nieuw | **BUG-223** |
| E18-010 | nieuw, **B** (migratiebesluit). *Ruling:* dit is de zichtbare kant van "`timestamp` zonder tijdzone" in `shared/schema.ts`; het raakt élke timestampkolom, niet alleen `documents.createdAt`, en de fix is een kolommigratie plus het formatteren met de opgeslagen offset. Daarom een besluit van de eigenaar en niet zomaar een patch | **BUG-224** |
| E18-011 | nieuw | **BUG-225** |
| PF19-001 | nieuw, **HIGH** — de zwaarste bevinding van fase 19 en de enige met een fix die niets aan het gedrag verandert: hetzelfde batchpatroon dat `getAllReservations` (`database-storage.ts:1062-1103`) al gebruikt | **BUG-203** |
| PF19-002 | nieuw, **HIGH**. *Ruling:* niet samengevoegd met PF19-003 hoewel beide "19,6 MB" verklaren. PF19-002 is een **clientfout** (twee query keys voor één URL, plus prefix-brede socketinvalidatie); PF19-003 is de **serverzijdige payloadvorm**. De clientfix halveert de eerste weergave zonder één API-contract te wijzigen en is daarom afzonderlijk uitvoerbaar | **BUG-204** |
| PF19-003 | nieuw, **HIGH**, **B**. *Ruling:* de splitsing die de fase-19-agent zelf aanbracht is **behouden**: PF19-003 (volledige voertuig- en klantrijen ingebed + nergens paginering, HIGH) en PF19-004 (geen HTTP-compressie, MEDIUM) blijven twee bugs. Ze hebben een verschillende eigenaar (de queryvorm in `database-storage.ts` versus één middlewareregel in `server/index.ts`), een verschillend risico (API-contractwijziging versus geen enkele gedragswijziging) en een verschillende regressietest. Samenvoegen zou de goedkope, risicoloze helft gijzelen achter de dure | **BUG-205** |
| PF19-004 | nieuw, **MEDIUM** (zie de ruling bij PF19-003) | **BUG-214** |
| PF19-005 | nieuw, **MEDIUM**. *Ruling:* **gescheiden gehouden van BUG-168.** BUG-168 is het **pathologische** geval (een ongevalideerde `page`-waarde → 40 000 pagina's, 76 s stilstand) en de fix daarvan is inputvalidatie. PF19-005 is het **normale** geval van dezelfde synchrone generator: 0,58 s CPU en 3,4 MB per gewone schadecheck, en 2,6 s serverbrede stilstand zodra vijf medewerkers tegelijk printen. De fix is een andere (de headerafbeelding eenmalig verkleinen bij upload, of de generatie van de event loop halen) en werkt ook als BUG-168 al gefixt is | **BUG-215** |
| PF19-006 | nieuw, **B** (de migratiehelft). De projectie zonder blobkolommen is **T** en kan meteen; het verplaatsen van de diagrammen en handtekeningen naar bestanden onder `uploads` is een schema-/datamigratie | **BUG-216** |
| PF19-007 | nieuw. *Ruling:* niet ondergebracht bij de concurrencybevindingen van fase 13. Dit is geen race maar een ontwerpfout: `syncVehicleAvailabilityWithReservations()` staat in de **GET**-handler en schrijft tot 3 UPDATEs over honderden rijen bij élke lees-actie van het meest opgevraagde endpoint (25 `useQuery`-aanroepplaatsen) | **BUG-217** |
| PF19-008 | nieuw. *Ruling:* **gescheiden gehouden van BUG-030.** BUG-030 is het multer-`LIMIT_FILE_SIZE`-pad (verkeerde statuscode + stack trace). PF19-008 is `express.json({limit:'50mb'})` globaal: een JSON-body van 20 MB wordt volledig gebufferd, geparsed én recursief door `sanitizeInput` gelopen vóór enige validatie, en kost +100 MB RSS die 5 s later nog niet vrijgegeven is | **BUG-218** |
| PF19-009 | nieuw | **BUG-226** |
| PF19-010 | nieuw — *gedeeltelijke toewijzing:* het **volumeaspect** hoort bij **BUG-079** en wordt daar juist **ontkracht** (203 bytes per regel, ≈1 MB/dag bij 5 000 requests — geen probleem). Het nieuwe deel is de per-rij-logging op het heetste leespad (17 566 bytes console-uitvoer per kalenderlading, met `util.inspect` van een volledige rij) plus 34 `console.log`-aanroepen per contract-PDF | **BUG-227** |
| PF19-011 | nieuw, **LOW (statisch — ongemeten)**, en als zodanig gelabeld in de bugtekst: er was geen browser in fase 19, dus de ~500 k predicaatevaluaties per render zijn geteld, niet geklokt | **BUG-228** |
| PF19-012 | nieuw | **BUG-229** |
| PF19-013 | nieuw | **BUG-230** |

**Eén samenvoeging** (E18-005 + de serverherstart-observatie), **één bevinding zonder nummer**
(E18-007), **zeventien expliciete rulings** (B17-001, B17-002, B17-004, B17-006, B17-009, B17-011,
E18-001, E18-002, E18-004, E18-006, E18-008, E18-010, PF19-002, PF19-003, PF19-005, PF19-007,
PF19-008), **twee gedeeltelijke toewijzingen** (B17-008 → deels BUG-075/BUG-010; PF19-010 → deels
BUG-079) en **één ontkrachting** (het volumeaspect van BUG-079).

---

## 6. Bugtracker-aanvulling — BUG-197 … BUG-230

Type: **T** = technische fout · **B** = bedrijfsregel/proces-/migratiebesluit (goedkeuring nodig,
zie §8).

### 6.1 Niet bevestigd — geen tracker-id

**E18-007 — Enter verstuurt het loginformulier niet.** Twee keer gereproduceerd in de Claude Browser
(vóór en ná uitloggen): gebruikersnaam en wachtwoord invullen, Enter drukken, er gebeurt niets en er
volgt geen `POST /api/login`; alleen een klik op "Inloggen" werkt. **Maar de code klopt:**
`client/src/pages/auth-page.tsx:80` is een normale `<form onSubmit={loginForm.handleSubmit(onLoginSubmit)}>`
en de knop op `:108` is `type="submit"`, dus impliciete formulierverzending hoort te werken. Exact
hetzelfde gedrag trad op bij het **portaal**-loginformulier, een ander component in een ander bestand
— wat sterk wijst op de synthetische Return-toets van het testgereedschap in plaats van op de
applicatie. **Daarom geen BUG-nummer.** Te beslissen met één handmatige controle: open
`/auth` in een gewone browser, typ inloggegevens, druk Enter en kijk of er een `POST /api/login` in
het netwerktabblad verschijnt. Verschijnt die niet, dan wordt dit alsnog een LOW-bug en is de
verdachte een `onKeyDown`-handler in de `Input`-wrapper die Enter opslokt.

### 6.2 CRITICAL

#### BUG-197 — Een beschadigde of onvolledige back-up wordt teruggezet als "succes" en laat de database half of leeg achter, zonder weg terug
- **Severity:** CRITICAL · **Status:** OPEN · **Type:** **T** · **Bron:** B17-001 (CRITICAL, bevestigd)
- **Feature:** Databaseherstel — `backupService.restoreDatabase` (`POST /api/backups/restore/database`, `POST /api/backups/restore/complete`) en de uploadroute `POST /api/backups/restore-data`
- **Reproduction:** `docs/audit/wip/scripts/p17-e-partial.sh`, met fixtures die uit het goede archief `dl-db-backup-2026-09-10T20-50-42-649Z.sql.gz` zijn afgeleid.
  - **(a) `p17-copyerror.sql.gz`** — de eerste COPY-rij van `vehicles` heeft `NOTANINT` als id → `POST /api/backups/restore/database {filename, confirmFilename}` → **200** `{"success":true,…}` in 4 171 ms. SQL erna: **`vehicles` 0 rijen** (waren er 665), `apk_date_changes` en `fines` faalden mee via de FK-cascade (7 `ERROR`-regels, psql exitcode **0**), de rest is wél hersteld.
  - **(b) `p17-half.sql`** — een platte dump afgekapt op 50 % van de regels (precies wat een afgebroken download oplevert) → **200 succes** in 2 645 ms. SQL erna: `vehicles` 0, `reservations` 0, `users` 0, `session` 0, `customers` 348, **alle sequences op 1**. `POST /api/login` → 401, na 5 pogingen **429 "Account temporarily locked"** — er ís geen gebruiker meer, er volgt geen herstart, en de applicatie is volledig onbruikbaar.
  - **(c) `p17-empty.sql.gz`** — schema-only dump van een database die door `startup-migration.js` is aangemaakt (47 tabellen, geen FK's) → **200 succes** in 2 419 ms. De `DROP TABLE`s faalden op afhankelijke FK's, dus de data bleef staan, **maar élke sequence is teruggezet naar 1** (`vehicles_id_seq.last_value = 1` terwijl `min(id) = 2`) en `backup_runs`/`session` zijn geleegd → de eerstvolgende inserts lopen op dubbele sleutels.
  - **Zonder de applicatie te reproduceren:** `psql -U postgres -h localhost lvs_audit_bk_other -f p17-copyerror.sql` → 7 `ERROR:`-regels, **exitcode 0**; met `-v ON_ERROR_STOP=1` → exitcode 3 op regel 14948.
- **Expected:** een herstel dat op welke SQL-fout dan ook stuit (of een dump die niet met de afsluitmarkering eindigt) breekt af, laat de database ongemoeid (of zet de veiligheidsback-up automatisch terug) en geeft een fout terug met het falende statement erin.
- **Actual:** psql wordt aangeroepen als `psql <DATABASE_URL> -f <bestand>` — **zonder `ON_ERROR_STOP` en zonder `--single-transaction`** (`server/backupService.ts:798-823`; en `server/routes/backups.ts:283-295` met `2>&1`, zodat stderr niet eens bekeken wordt). psql gaat na élke fout door en eindigt met 0, dus de route antwoordt 200 "Database restore completed successfully". De veiligheidsback-up staat wél op schijf, maar is alleen met `psql` op de server toe te passen — en in geval (b) kan niemand meer inloggen om überhaupt iets te starten.
- **Root cause:** `server/backupService.ts:798-801` (`spawn('psql', [url, '-f', file])`) en `server/routes/backups.ts:283-286` (`execAsync("psql \"${url}\" -f \"${file}\" 2>&1")`); geen `-v ON_ERROR_STOP=1`, geen `--single-transaction`, en geen controle op de marker `PostgreSQL database dump complete` vóórdat psql draait (`verifyDatabaseBackup` wordt alleen ná het **maken** van een back-up gebruikt, niet vóór een herstel; de sniff van `restore-data` kijkt alleen naar de eerste 4 KB).
- **Affected files:** `server/backupService.ts`, `server/routes/backups.ts`, `server/backupVerification.ts` (ongebruikt bij herstel)
- **Affected data:** élke tabel; sequences; sessies; `users` (buitensluiting)
- **Security impact:** een door de operator aangeleverd archief wordt statement voor statement uitgevoerd met de databasereferenties van de applicatie (hier de superuser `postgres`), terwijl fouten ingeslikt worden. Een vijandig of beschadigd bestand laat een half geladen database achter die "succes" meldt.
- **Business impact:** een slecht archief (afgebroken download, schijffout, verkeerde schemaversie) vernietigt de live dataset met een groen vinkje. Herstel vereist shell- plus `psql`-toegang, precies wat de Coolify-operator niet in de applicatie heeft.
- **Fix proposal:** draai psql met `-v ON_ERROR_STOP=1 --single-transaction` (de dump is één plain `pg_dump`-script, dus één transactie werkt), laat de request falen op een exitcode ≠ 0 en geef de eerste `ERROR`-regel terug; draai `verifyDatabaseBackup` (afsluitmarkering + gunzip) op het te herstellen bestand **vóórdat** er iets gedropt wordt, ook bij uploads; zet bij een mislukking de veiligheidsback-up automatisch terug, of noem minimaal de bestandsnaam ervan én meld dat de database nu gedeeltelijk is. Structureel: `pg_restore -Fc` in plaats van plain SQL.
- **Regression test:** vitest tegen een scratchdatabase: de copyerror-fixture herstellen → verwacht 500 met "invalid input syntax" en ongewijzigde rijtellingen; de half-fixture → 500 en een ongewijzigd aantal gebruikers; het goede archief → 200 met rijtellingen gelijk aan de dump.

### 6.3 HIGH

#### BUG-198 — Bestandsherstel pakt uit in `process.cwd()` in plaats van in `UPLOADS_DIR`; de veiligheidsback-up komt uit een ándere map dan de map die overschreven wordt
- **Severity:** HIGH · **Status:** OPEN · **Type:** **T** · **Bron:** B17-002
- **Feature:** Bestandsherstel — `backupService.restoreFiles` (`POST /api/backups/restore/files`, `POST /api/backups/restore/complete`) en `POST /api/backups/restore-files` (upload)
- **Reproduction:** code- plus archiefbewijs (runtime-extractie is op deze Windows-host onmogelijk, zie BUG-219; bewust niet geforceerd omdat het doel de `uploads/` van de repo zélf is).
  - `tar -tzf files-backup-2026-09-10T20-50-44-059Z.tar.gz` → alle 197 entries staan als `uploads/<…>` in het archief (archiver zet die naam hard, `backupService.ts:352`).
  - `restoreFiles` pakt uit met `tar -xzf <file> -C ${targetPath || process.cwd()} --overwrite` (`backupService.ts:927-934`) en **geen enkele route geeft `targetPath` mee** (`routes/backups.ts:896-921`); `restore-files` doet `tar -xzf "${req.file.path}" -C "${process.cwd()}"` (`routes/backups.ts:481`).
  - Op `:5002` is `process.cwd()` = `C:\Users\kees lam\Desktop\LVStest-main\LVStest-main` terwijl `UPLOADS_DIR` = `C:\…\audit-uploads-bk`. De tar faalde met `Cannot connect to C:`, maar het `-C`-argument in die foutmelding is aantoonbaar de repo-map (`files/p17/restore-log.jsonl`).
  - De veiligheidsback-up die er direct vóór genomen wordt (`takeSafetyBackup('files')`) archiveert **`getUploadsDir()`** (`backupService.ts:348`) — dus een andere map dan de map die de extractie overschrijft.
- **Expected:** bestanden komen terug in `getUploadsDir()` — de map die de applicatie serveert en back-upt; een verwijderd document staat er na het herstel weer.
- **Actual:** met `UPLOADS_DIR` gezet (in `DEPLOYMENT_CONFIG.md:13/29` gedocumenteerd als de bedoelde productie-instelling, terwijl het codecommentaar op `backupService.ts:848-855` beweert dat de paden samenvallen) landt de extractie in `<cwd>/uploads`: verwijderde documenten komen niet terug, de geserveerde map verandert niet, en in een container is `<cwd>/uploads` bovendien vluchtig. Zónder `UPLOADS_DIR` vallen de paden per toeval samen — daar komt de illusie vandaan dat dit werkt.
- **Root cause:** `server/backupService.ts:927` (`const extractPath = targetPath || process.cwd()`), `server/routes/backups.ts:481` en `:356`; de archiefentries dragen de vaste prefix `uploads/` ongeacht hoe de echte map heet.
- **Affected files:** `server/backupService.ts`, `server/routes/backups.ts`
- **Affected data:** alle geüploade documenten, contracten, rijbewijzen, foto's en sjablonen
- **Security impact:** `--overwrite` in de applicatiemap met paden die uit het archief komen. BUG-069 dekt de traversal/RCE-hoek voor `restore-code`; hier is het dezelfde primitief in het "veilige" herstelpad.
- **Business impact:** de gedocumenteerde herstelprocedure voor bestanden herstelt in de gedocumenteerde deployment **geen enkel bestand**, terwijl de operator "Files restore completed successfully" te zien krijgt.
- **Fix proposal:** uitpakken met `--strip-components=1 -C getUploadsDir()` (of archiveren zónder prefix), controleren dat elke entry binnen de doelmap blijft (`..` en absolute paden weigeren), en hard asserten dat `extractPath` gelijk is aan de bronmap van de veiligheidsback-up.
- **Regression test:** zet `UPLOADS_DIR` op een tijdelijke map, verwijder één bestand, roep `restoreFiles(latest)` aan → het bestand staat weer in `UPLOADS_DIR` en er is niets onder `process.cwd()/uploads` geschreven.

#### BUG-199 — Een dump met `\connect`/`CREATE DATABASE` herstelt in een ándere database (en dropt die eerst), terwijl de doeldatabase ongemoeid blijft en de API succes meldt
- **Severity:** HIGH · **Status:** OPEN · **Type:** **T** · **Bron:** B17-003
- **Feature:** Databaseherstel — dumps met statements op databaseniveau
- **Reproduction:** `p17-connect.sql.gz` = `pg_dump --create --clean --if-exists --no-owner --no-privileges lvs_audit_bk_other | gzip` (bevat `DROP DATABASE IF EXISTS lvs_audit_bk_other;`, `CREATE DATABASE lvs_audit_bk_other …;` en `\connect lvs_audit_bk_other`). Bestand in de root van `BACKUP_PATH` gezet, eerst mutaties aangebracht in `lvs_audit_bk` (voertuig `AU-174f-X`, markeringsinstelling), daarna `node p17-restore.cjs database p17-connect.sql.gz` → **200** `{"success":true,…,"safetyBackupFilename":"db-backup-2026-09-10T21-02-28-848Z.sql.gz"}` in 8 206 ms; de sessie van de aanroeper bleef zelfs geldig. Resultaat: `lvs_audit_bk` **ongewijzigd** (de mutaties staan er nog), `lvs_audit_bk_other` **gedropt en opnieuw aangemaakt** met de inhoud van de dump.
- **Expected:** een dump die van database wisselt of `CREATE`/`DROP DATABASE` bevat wordt geweigerd vóórdat er iets draait, of het herstel wordt afgedwongen binnen de geconfigureerde database.
- **Actual:** psql voert `\connect` uit en werkt verder in de andere database; `DROP DATABASE` slaagt met de referenties van de applicatie; de API meldt succes en de operator gelooft dat het herstel gelukt is. In combinatie met BUG-197 wordt ook elke fout onderweg (bijvoorbeeld "database is being accessed by other users") ingeslikt.
- **Root cause:** `server/backupService.ts:798-801` en `server/routes/backups.ts:283-286` geven het hele bestand aan psql mét metacommando's ingeschakeld; er is geen enkele scan op `\connect`, `\!`, `\i`, `CREATE DATABASE`, `DROP DATABASE` of `ALTER SYSTEM`.
- **Affected files:** `server/backupService.ts`, `server/routes/backups.ts`
- **Affected data:** élke database die de databaserol van de applicatie mag droppen — hier als superuser `postgres` dus ook `lvstest` en `lvs_audit` op dezelfde server
- **Security impact:** een geüploade "back-up" kan andere databases op de server overschrijven of droppen en psql-metacommando's uitvoeren (`\!` voert shellcommando's uit — niet uitgeprobeerd), met alleen `MANAGE_BACKUPS` als vereiste.
- **Business impact:** "herstel geslaagd" terwijl er niets hersteld is, is de slechtst denkbare uitkomst tijdens een incident: de operator gaat verder in de veronderstelling dat de data terug is.
- **Fix proposal:** weiger bestanden die `\connect`, `\!`, `\i`, `\copy … PROGRAM`, `CREATE|DROP DATABASE` of `ALTER SYSTEM` bevatten; draai psql met `--set=ON_ERROR_STOP=1` onder een rol met minimale rechten; gebruik bij voorkeur het `pg_restore`-customformaat, dat helemaal geen metacommando's kan dragen; vergelijk na afloop een rijtelling of checksum met de dump.
- **Regression test:** het herstellen van een `--create`-dump geeft 4xx en laat beide databases ongemoeid.

#### BUG-200 — `POST /api/backups/upload` schrijft naar `process.cwd()/backups` in plaats van `BACKUP_PATH`: een geüploade back-up is nergens te vinden en niet te herstellen
- **Severity:** HIGH · **Status:** OPEN · **Type:** **T** · **Bron:** B17-004
- **Feature:** `POST /api/backups/upload`
- **Reproduction:** `node docs/audit/wip/scripts/p17-11-uploads.cjs` — uploads van `small.sql`, `db-backup-2026-09-10T20-50-42-649Z.sql.gz`, `marker.tar.gz` en `big.sql.gz` (200 MB) geven alle **200** "backup uploaded successfully". De bestanden verschijnen als `C:\…\LVStest-main\LVStest-main\backups\uploaded-database-2026-09-10T21-06-08-351Z-db-backup-….sql.gz` (dus `process.cwd()/backups`), en er staat **niets** in `BACKUP_PATH`. Vervolgens: `GET /api/backups/list` → geen enkele `uploaded-*`-entry; `POST /api/backups/restore/database` met die naam → **404** "Backup file not found"; `GET /api/backups/download/database/<naam>` → **404**.
- **Expected:** uploads komen in dezelfde map waaruit de service lijst en herstelt (`resolveBackupPath`: `BACKUP_PATH` → instelling → `cwd/backups`).
- **Actual:** de route hardcodeert `path.join(process.cwd(), 'backups')` (`routes/backups.ts:798-811`). Met `BACKUP_PATH` gezet — de deploymentvorm waarvoor de rest van de service juist herschreven is — kan een van buiten aangeleverde back-up **nooit** via de UI hersteld worden, en staat hij bovendien op vluchtige containeropslag. De response geeft zelfs een manifest terug met `checksum:"uploaded"` dat nergens naar schijf geschreven wordt.
- **Root cause:** `server/routes/backups.ts:798` (`const backupDir = path.join(process.cwd(), 'backups')`)
- **Affected files:** `server/routes/backups.ts`
- **Affected data:** geüploade back-uparchieven — precies de off-box-kopieën waar het hele veiligheidsmodel op leunt
- **Security impact:** niets nieuws (BUG-076 dekt de bestandsnaam); wel kan een `MANAGE_BACKUPS`-gebruiker met de limiet van 1 GB de applicatiemap volschrijven in plaats van het back-upvolume.
- **Business impact:** het herstelpad "back-up uploaden en terugzetten" is in de bedoelde deployment van begin tot eind stuk — en dat is precies het pad dat je gebruikt wanneer het lokale volume verloren is gegaan.
- **Fix proposal:** de map via `backupService` bepalen (`resolveBackupPath` / `getBackupPathInfo` exporteren) en daar schrijven; schrijf het manifest-sidecarbestand mét een echte sha256, zodat ook geüploade bestanden checksumverificatie krijgen.
- **Regression test:** met `BACKUP_PATH` op een tijdelijke map: uploaden → het bestand staat onder `BACKUP_PATH`, komt terug in `/list`, en het herstel geeft 200.

#### BUG-201 — Eén reservering met een onleesbare datum laat de hele reserveringspagina crashen; er is nergens een error boundary
- **Severity:** HIGH · **Status:** OPEN · **Type:** **T** · **Bron:** E18-001
- **Feature:** Reserveringspagina (kalender) — het renderen van voltooide verhuringen
- **Reproduction:** met een reservering waarvan `endDate` geen ISO-datum is (auditrijen 3442 `"not-a-date"` en 3365 `"2099-13-45"`, beide via `PATCH /api/reservations/:id` aangemaakt = BUG-111; de devkloon bevat daarnaast 3 bestaande rijen met een volledige ISO-**timestamp** in `end_date`, die `parseISO` nog wel accepteert): open `/reservations` als willekeurige gebruiker, op willekeurige viewport.
- **Expected:** de pagina rendert; een rij met een kapotte datum toont een plaatsvervanger ("–") en wordt gerapporteerd.
- **Actual:** `RangeError: Invalid time value` uit `format(parseISO(rental.endDate), 'MMM d, yyyy')` op `client/src/pages/reservations/calendar.tsx:3205`, binnen de lijst "Voltooid bekijken" — die **direct bij het laden** gerenderd wordt, niet pas als de dialoog opengaat. In dev verschijnt de Vite-overlay; **in productie unmount React de boom en blijft het scherm wit**. Terug naar het dashboard werkt, vooruit naar `/reservations` crasht opnieuw. Pas nadat de rijen 3442 en 3365 via de API verwijderd waren, rendeerde de pagina. Hetzelfde patroon (`format(parseISO(...))` zonder guard) staat op **20+ plaatsen in datzelfde bestand**.
- **Root cause:** `client/src/pages/reservations/calendar.tsx:3205` en de gelijksoortige aanroepen formatteren datums zonder ze te valideren; `client/src/App.tsx` heeft geen `ErrorBoundary` rond de routes (`grep -rn ErrorBoundary client/src` → nul treffers); de server accepteert niet-ISO-datums (BUG-111).
- **Affected files:** `client/src/pages/reservations/calendar.tsx`, `client/src/App.tsx`
- **Affected data:** elke reservering met een misvormde datum; de 3 bestaande rijen met een timestamp in `end_date` renderen nu nog, maar lopen risico bij elke strengere formatter
- **Security impact:** een DoS van het belangrijkste planningsscherm met lage rechten: elk account dat `PATCH /api/reservations/:id` mag doen (BUG-084/BUG-111) kan de reserveringspagina voor **alle** medewerkers onbruikbaar maken.
- **Business impact:** het planningsscherm is de kern van het dagelijkse werk; één kapotte rij haalt het voor iedereen weg, tot iemand die rij in de database vindt en repareert. Zonder error boundary ziet de medewerker alleen een wit scherm — geen foutmelding, geen herlaadknop, geen aanwijzing.
- **Fix proposal:** `format(parseISO(x))` achter een veilige helper (`isValid(parsed) ? format(...) : '–'`), één keer geschreven en overal gebruikt; een `ErrorBoundary` op routeniveau met een "Herladen / melden"-fallback; en BUG-111 serverzijdig dichtzetten zodat er geen nieuwe kapotte rijen bijkomen.
- **Regression test:** vitest-componenttest die de lijst met voltooide verhuringen rendert met `endDate: "not-a-date"` → toont "–", gooit niet; plus een servertest: `PATCH` met `endDate: "not-a-date"` → 400.

#### BUG-202 — Het bewerkformulier van reserveringen faalt altijd: `portalRequestId=""` en `replacementForTransportId=""` worden niet naar `null` omgezet
- **Severity:** HIGH · **Status:** OPEN · **Type:** **T** · **Bron:** E18-002 · **Kandidaat voor een onmiddellijke hotfix, zie §8.2**
- **Feature:** Bewerkformulier van reserveringen (`client/src/components/reservations/reservation-form.tsx`, gebruikt door "Bewerken" in de lijstweergave en in de detaildialoog)
- **Reproduction:** open een willekeurige reservering (getest: #3472 `AU-147-X` en #3231 `AU-002-X`, beide `booked`) → "Bewerken" → wijzig **alleen de notitie** → "Reservering bijwerken". Resultaat: `PATCH /api/reservations/3231` → **400** `{"message":"Failed to update reservation","error":"invalid input syntax for type integer: \"\""}` met de toast "Reservering bijwerken mislukt: Failed to update reservation". Geïsoleerd met curl: `-F replacementForTransportId=` → **400**, `-F portalRequestId=` → **400**, terwijl `-F driverId=` / `spareVehicleId=` / `deliveryStaffId=` / `deliveryFee=` allemaal **200** geven.
- **Expected:** 200, de notitie is opgeslagen.
- **Actual:** het formulier stuurt **élke kolom** van de reserveringsrij mee, met `null`-waarden als lege strings (`reservation-form.tsx:916-923`): `driverId=""`, `replacementForReservationId=""`, `replacementForTransportId=""`, `affectedRentalId=""`, `portalRequestId=""`, `deliveryStaffId=""`, `recurringParentId=""`, … De route `PATCH /api/reservations/:id` (`server/routes.ts:3445-3540`) zet een **handmatig bijgehouden lijst** velden om van `""` naar `null` — maar **niet** `replacementForTransportId` en **niet** `portalRequestId`. Postgres krijgt dus een lege string voor een integerkolom en weigert.
- **Tijdlijn — dit staat nu in productie:** `replacementForTransportId` is toegevoegd op **2026-08-29** (commit `8b7f913d`); vanaf dat moment is het formulier stuk. Op **2026-09-06** voegde commit `20e7bf6b` — de klantenportaalfunctie voor onderhoudsaanvragen — `portalRequestId` toe als **tweede** niet-afgehandelde kolom, en die is op **2026-09-08** uitgerold. **Die portaalfunctie is door de auditleider zelf gebouwd; dat wordt hier expliciet vermeld omdat het de tweede helft van deze bug is.** Beide kolommen staan in `main` (`3e28645e`). Het bewerkformulier is daarmee sinds 2026-08-29 — ruim twaalf dagen — in productie onbruikbaar, en dat is in geen enkele test opgevallen omdat er geen enkele test op dit pad bestaat.
- **Root cause:** `server/routes.ts:3445` geeft de rauwe multipart-body door aan `db.update()` (het patroon van BUG-084) met een met de hand onderhouden `""→null`-whitelist die per definitie achterloopt op het schema; `reservation-form.tsx:912-923` spreidt de volledige rij in de request uit.
- **Affected files:** `server/routes.ts`, `client/src/components/reservations/reservation-form.tsx`
- **Affected data:** er wordt niets weggeschreven (de update wordt geweigerd) — maar élke bewerking via het standaardformulier is onmogelijk.
- **Security impact:** geen directe; de rauwe Postgres-foutmelding gaat wel naar de client (dezelfde klasse als BUG-148).
- **Business impact:** medewerkers kunnen een boeking niet corrigeren — geen datums, geen klant, geen voertuig, geen prijs, geen notitie — via het normale bewerkscherm. De omwegen zijn de kalender-drag (met BUG-106 als eigen risico) en de `/basic`-route die andere dialogen gebruiken. Dit is de meest alledaagse handeling in het systeem.
- **Fix proposal:** **server:** coerceer élke nullable integerkolom generiek (`for (const k of INT_COLUMNS) if (req.body[k] === '' || req.body[k] === 'null') req.body[k] = null`) of — beter en tevens de fix voor BUG-084 — valideer de PATCH-body met een zod-schema. **Client:** stuur alleen gewijzigde velden, als JSON, wanneer er geen bestand meegaat.
- **Regression test:** supertest `PATCH /api/reservations/:id` multipart met `portalRequestId=""` én `replacementForTransportId=""` → 200; plus een **schema-drift-test** die assert dat élke integerkolom van `reservations` door de coercielijst gedekt wordt — zonder die tweede test herhaalt deze bug zich bij de volgende kolom.

#### BUG-203 — `getReservationsInDateRange` is N+1: 924 statements voor één maandweergave, 3 774 voor een jaar
- **Severity:** HIGH · **Status:** OPEN · **Type:** **T** · **Bron:** PF19-001
- **Feature:** Reserveringskalender, onderhoudskalender en dashboardkalender — `GET /api/reservations/range`
- **Reproduction:** `node docs/audit/wip/scripts/p19-sqlcount.cjs range` → 1 week: 235 rijen / **472 statements**; het 5-weekse maandraster (2026-08-31..10-04): 462 rijen / **924 statements** (455 voertuigselects, 341 klantselects, 115 "active rental"-selects, 9 chauffeurselects); 1 jaar: 1 894 rijen / **3 774 statements**. `node p19-timing.cjs range` → maand p50 **1 080 ms** / p95 **1 485 ms** (logging uit; 1 275 / 3 692 ms met logging aan), jaar p50 **4 255 ms**; 10 parallelle maandladingen p95 **5 830 ms**; 10 parallelle jaarladingen **22,9 s** wandkloktijd. De totale Postgres-tijd voor die maandlading is **31,5 ms** — al het overige is 924 sequentiële heen-en-weertjes door node-postgres/drizzle.
- **Expected:** een constant aantal statements (1 range-select + 3 batchladingen, of 3 left joins) en < 100 ms voor een maand bij dit datavolume. De zusterfunctie `getAllReservations` doet dit al goed.
- **Actual:** één SELECT per voertuig, per klant (of per "active rental"-lookup bij onderhoudsblokken) en per chauffeur, binnen een `for`-lus, plus 4 `console.log`-regels per onderhoudsblok zonder klant.
- **Root cause:** `server/database-storage.ts:1285-1356` — `for (const reservation of reservationsData) { await db.select()…vehicles…; await db.select()…customers…; await db.select()…drivers… }`.
- **Affected files:** `server/database-storage.ts:1285-1356`; consumenten `client/src/pages/reservations/calendar.tsx:607-615`, `client/src/pages/maintenance/calendar.tsx:378-387`, `client/src/components/dashboard/reservation-calendar.tsx:137-140`
- **Affected data:** `reservations`, `vehicles`, `customers`, `drivers` (alleen lezen)
- **Security impact:** geen directe; wel kan een gebruiker met alleen `VIEW_RESERVATIONS` een bereik van 30 jaar opvragen en daarmee tientallen seconden een poolclient vasthouden (10 parallelle jaarrequests duurden 32 s) — een goedkope DoS.
- **Business impact:** de drie meest gebruikte schermen (dashboard, reserveringen, onderhoud) wachten 1,3–3,7 s op hun hoofddataset en zakken naar ~7 s zodra een handvol medewerkers ze tegelijk opent. Het groeit **lineair** met de boekingshistorie en zit nu al op het dubbele van de 1,5 k reserveringen waar het commentaar bij een eerdere fix van uitgaat.
- **Fix proposal:** verzamel `vehicleId`/`customerId`/`driverId` één keer en laad ze met drie `inArray()`-selects — exact zoals `getAllReservations` op `database-storage.ts:1062-1103` — of gebruik de leftJoin-vorm van `getUpcomingReservations` (`:1358-1388`); los de "active rental customer" van onderhoudsblokken op met één query (`vehicle_id IN (…) AND end_date IS NULL …`) plus een `Map`; haal de per-rij-`console.log` weg; overweeg een serverzijdig maximum op het bereik (bijvoorbeeld 400 dagen).
- **Regression test:** met de Postgres-statementlog (of een spy op de pg-client) asserten dat `GET /api/reservations/range` voor 1 week en voor 1 jaar **hetzelfde** aantal statements uitvoert (≤ 8 inclusief sessie), en dat het maandraster < 200 ms antwoordt tegen de auditdataset.

#### BUG-204 — De reserveringspagina downloadt 19,6 MB bij de eerste weergave, waarvan 16 MB dezelfde lijst tweemaal (twee query keys voor één URL)
- **Severity:** HIGH · **Status:** OPEN · **Type:** **T** · **Bron:** PF19-002
- **Feature:** Reserveringskalenderpagina (client) — eerste weergave en live-updates
- **Reproduction:** `node docs/audit/wip/scripts/p19-page-replay.cjs` → "reservations 9 requests, **19,61 MB**, wall 1 907 ms". `/api/reservations` wordt **tweemaal** opgehaald (8 033 805 bytes per keer), omdat `calendar.tsx` zowel de key `['/api/reservations']` (`:631-633`) als `['/api/reservations', vehicles?.length]` (`:657-675`) gebruikt: React Query ziet twee verschillende cache-entries, terwijl de standaard-`queryFn` het numerieke deel van de key negeert en dus exact dezelfde URL ophaalt — en de tweede opnieuw zodra `vehicles.length` verandert. Bij een socket-`reservations`-event invalideert `cache-utils.ts:22-30` élke key die met `/api/reservations` begint → range (1,65 MB) + beide volledige lijsten (16 MB) + overdue (1,5 MB) ≈ **19,2 MB opnieuw opgehaald per event per open tabblad**.
- **Expected:** één download van de lijst per pagina (of nul: voltooide verhuringen serverzijdig filteren), en een wijziging elders die alleen het zichtbare bereik opnieuw ophaalt.
- **Actual:** 19,6 MB voor de eerste weergave van de drukste pagina; élke reserveringswijziging door een collega haalt ~19 MB opnieuw op in élk open reserveringstabblad. De pagina's voertuigen, klanten, onderhoud en dashboard trekken diezelfde 8 MB-lijst binnen om er opzoekingen in te doen (8,8 / 8,1 / 10,5 / 13,1 MB eerste weergave).
- **Root cause:** `client/src/pages/reservations/calendar.tsx:631-633` en `:657-675` (twee keys voor één URL; de tweede bestaat alleen om `select` opnieuw te draaien als de voertuigen wijzigen, wat `select` via de closure al doet), plus de prefix-brede invalidatie in `client/src/lib/cache-utils.ts:22-30` en het ontbreken van serverzijdige filters (BUG-205).
- **Affected files:** `client/src/pages/reservations/calendar.tsx:583-711`, `client/src/lib/cache-utils.ts:22-30`, `client/src/components/dashboard/spare-vehicle-assignments-widget.tsx:77-96`, `client/src/pages/vehicles/index.tsx:102-104`, `client/src/pages/customers/index.tsx:51-53`, `client/src/pages/maintenance/calendar.tsx:389-427`
- **Affected data:** geen (alleen lezen)
- **Security impact:** geen
- **Business impact:** 20 MB per schermopening en per wijziging elders is op een 4G-kantoorverbinding 10 tot 40 seconden transport. De dev-server levert het in 1,9 s omdat de client op dezelfde machine draait — dat getal is dus **geen** maat voor de werkelijkheid bij de gebruiker.
- **Fix proposal:** één key `['/api/reservations']` met `select` voor de voltooide verhuringen (de voertuigen zitten al in de closure); serverzijdige filters `?status=completed,returned` / `?type=maintenance_block` / `?fields=` toevoegen en gebruiken; de socketinvalidatie voor reserveringen laten richten op de range- en overdue-keys plus het betrokken id.
- **Regression test:** een Vitest/RTL-test die de kalender mount met een gemockte `fetch` en assert dat er exact **één** `GET /api/reservations` is; plus een Playwright-controle dat de route `/reservations` bij de eerste weergave < 5 MB aan XHR veroorzaakt.

#### BUG-205 — Lijstendpoints bedden de volledige voertuig- én klantrij in elke regel in en kennen nergens paginering: 8 MB per lijst
- **Severity:** HIGH · **Status:** OPEN · **Type:** **B** (API-contract) · **Bron:** PF19-003
- **Feature:** `GET /api/reservations`, `/api/reservations/range`, `/api/reservations/overdue`, `/api/expenses` — payloadvorm en paginering
- **Reproduction:** `node docs/audit/wip/scripts/p19-timing.cjs` → `GET /api/reservations`: 2 075 rijen = **8 029 598 bytes** (3,87 KB per reservering), p50 209 ms / p95 254 ms sequentieel, 10 parallel = 2,2 s wandkloktijd met een gemeten event-loopstilstand van **622 ms** bij 5 parallel; `/api/expenses` 1 999 rijen = 4,25 MB; `/overdue` 358 rijen = 1,5 MB. Rijgroottes uit `row_to_json`: reservering 1 458 B, voertuig 1 869 B, klant 1 235 B — de ingebedde voertuig- en klantrij zijn **80 % van elk item** en worden 2 075 keer herhaald voor 665 verschillende voertuigen en 348 klanten, die diezelfde pagina's óók al los ophalen (`/api/vehicles`, `/api/customers`).
- **Expected:** een lijstitem draagt id's plus de handvol velden die de client toont (kenteken, merk, model, klantnaam), of het endpoint is te pagineren/filteren. De lijst van 8 MB hoort niet de standaardmanier te zijn om de historie van één voertuig op te zoeken.
- **Actual:** `{...reservation, vehicle: fullVehicleRow, customer: fullCustomerRow}` voor élke rij; **geen enkel lijstendpoint in de applicatie kent `limit`/`offset`/cursor**; `Cache-Control: no-store`, dus er wordt ook nooit iets gecachet.
- **Root cause:** `server/database-storage.ts:1093-1103` (retourvorm van `getAllReservations`), `:1300-1352` (range), `:1462-1492` (overdue), `:1794-1815` (expenses); de routes op `server/routes.ts:2299-2313` accepteren alleen `search`.
- **Affected files:** `server/database-storage.ts` (bovenstaande), `server/routes.ts:2299-2313`, `:2139-2170`, `:2203-2216`; de clientconsumenten uit BUG-204
- **Affected data:** geen (alleen lezen)
- **Security impact:** volledige klantrecords — adressen, btw-/KvK-nummers, notities, rijbewijsnummers — reizen naar élk scherm dat alleen een naam nodig heeft. Dat vergroot de schade van elke XSS en van elk over-de-schouder-meegelezen devtools-tabblad, en een gebruiker met alleen leesrechten haalt het hele klantenbestand binnen door de kalender te openen.
- **Business impact:** elke pagina die de lijst gebruikt betaalt 8 MB plus ~250 ms servertijd (het `JSON.stringify` van 8 MB blokkeert de event loop 100–600 ms afhankelijk van de gelijktijdigheid), en dat groeit met de historie mee.
- **Fix proposal:** projecteer alleen de benodigde kolommen (drizzle `select({...})` met expliciete voertuig-/klant-subobjecten); voeg `?status=`, `?type=`, `?from=&to=`, `?limit=&cursor=` toe aan `GET /api/reservations` en `/api/expenses`; geef `vehicleId`/`customerId` terug en laat de client joinen tegen zijn al gecachete `/api/vehicles` en `/api/customers`; overweeg `ETag`/`If-None-Match` in plaats van `no-store`.
- **Regression test:** assert dat de JSON-omvang van `GET /api/reservations` tegen de auditdataset < 1 MB is (of dat een item geen `customer.notes` / `customer.driverLicenseNumber` bevat) en dat `?limit=50` precies 50 rijen teruggeeft.
- **Waarom B:** dit verandert wat élk scherm binnenkrijgt en is dus een wijziging van het API-contract, niet een interne fix. De eigenaar moet beslissen welke velden een lijstitem mag dragen en of paginering voor de kalender acceptabel is. Zie §8.3.

---

### 6.4 MEDIUM

#### BUG-206 — Elke back-up laat zijn tijdelijke kopie achter in `os.tmpdir()` (13 MB + 118 MB per run, voor altijd)
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **T** · **Bron:** B17-005
- **Feature:** Aanmaken van back-ups — tijdelijke bestanden
- **Reproduction:** na élke `POST /api/backups/run` (en na élke veiligheidsback-up) blijven `%TEMP%\db-backup-<stamp>.sql.gz` (13 MB) en `%TEMP%\files-backup-<stamp>.tar.gz` (118 MB) staan. Op deze host vóór het opruimen: **149** `db-backup-*.sql.gz` (312 MB) en **9** `files-backup-*.tar.gz` (1 012 MB), teruggaand tot 2026-08-27; 38 daarvan kwamen uit de `:5002`-runs van deze fase en zijn verwijderd, de oudere zijn bewust blijven staan.
- **Expected:** het tijdelijke bestand wordt verwijderd na de kopie naar de back-upmap, of de back-up wordt meteen naar de bestemming geschreven.
- **Actual:** `createDatabaseBackup`/`createFilesBackup` schrijven naar `join(tmpdir(), filename)` (`backupService.ts:234`, `:332`), kopiëren met `copyFileSync` naar de bestemming (`:126`) en doen nooit een `unlink`. Elk herstel voegt er twee toe via de veiligheidsback-up. De `restore-<ts>.sql` van `restore-data` wordt wél netjes opgeruimd.
- **Root cause:** `server/backupService.ts:118-133` (`saveToLocalFilesystem` kopieert en verwijdert nooit), `:234`, `:332`
- **Affected files:** `server/backupService.ts`
- **Affected data:** geen direct; schijfruimte (≈130 MB/dag bij één run per dag, ×2 per herstelpoging)
- **Security impact:** een tweede, onbeschermde kopie van élke dump — met sessie-id's, wachtwoordhashes en het SMTP-wachtwoord — blijft permanent in de tijdelijke map van de host of container staan.
- **Business impact:** in een container zit `/tmp` in de schrijfbare laag; na enkele maanden loopt die vol, en dán beginnen de back-ups zélf te falen (EPERM/ENOSPC) — precies het "de back-ups zijn stilletjes gestopt"-incident waar het commentaar in de scheduler voor waarschuwt.
- **Fix proposal:** `unlink` het tijdelijke bestand in een `finally` (of stream meteen naar de bestemming en verifieer daar); voeg bij het opstarten een opruimactie toe voor achtergebleven `db-backup-*`/`files-backup-*` in `tmpdir`.
- **Regression test:** na `runBackup()` bevat `tmpdir` geen `db-backup-*`/`files-backup-*`-bestand.

#### BUG-207 — `require is not defined` (ESM) in de opruiming van `restoreDatabase`: een platte dump van 20 MB blijft naast het archief staan en wordt als herstelbare back-up gelist
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **T** · **Bron:** B17-006
- **Feature:** `backupService.restoreDatabase` — opruimen van het gedecomprimeerde bestand
- **Reproduction:** elk geslaagd `POST /api/backups/restore/database`. Serverlog: `Error cleaning up uncompressed file: ReferenceError: require is not defined at BackupService.restoreDatabase (server/backupService.ts:838:11)`. Op schijf blijft daarna `audit-backups/database/2026/09/10/db-backup-2026-09-10T20-50-42-649Z.sql` staan — **20 111 676 bytes platte SQL** naast het archief. Voor archieven die uit de rootmap hersteld worden komt de `.sql` in de root terecht, waar `GET /api/backups/list` hem als extra "uploaded" databaseback-up teruggeeft (waargenomen voor `p17-trunc50.sql`, `p17-corrupt.sql`, `p17-sqlerror.sql` en `p17-copyerror.sql` — ook wanneer het herstel al bij gunzip faalde). De eerste mislukte poging liet zelfs een `.sql` van 0 bytes achter.
- **Expected:** het tijdelijk gedecomprimeerde bestand wordt na psql verwijderd en komt nooit in de back-upmap terecht.
- **Actual:** `uncompressedFile = tempFile.replace('.gz', '')` (`backupService.ts:760`) schrijft de platte dump naast de back-up, en de opruiming gebruikt `require('fs').unlinkSync` (`:829`, `:838`) in een ES-module (`package.json` `"type":"module"`, esbuild `--format=esm`). Die `require` gooit, de fout wordt ingeslikt, en het bestand blijft voor altijd staan — ook in productiebuilds.
- **Root cause:** `server/backupService.ts:760`, `:829`, `:838`
- **Affected files:** `server/backupService.ts`
- **Affected data:** de back-upmap (platte dumps van 20 MB stapelen zich op)
- **Security impact:** een ongecomprimeerde kopie van de database (sessies, wachtwoordhashes, SMTP-wachtwoord) zonder checksumbescherming, gelist als herstelbare "uploaded" back-up, op het permanente back-upvolume.
- **Business impact:** het back-upvolume groeit, operators zien onverklaarde `.sql`-entries in de lijst, en de retentie ruimt rootbestanden nooit op.
- **Fix proposal:** importeer `unlinkSync` bovenaan uit `'fs'`; decomprimeer naar `tmpdir` (of pipe `gunzip` → `psql` via stdin) en `unlink` in een `finally`.
- **Regression test:** na `restoreDatabase()` bestaat er geen enkel `*.sql` onder het back-uppad noch in `tmpdir`.

#### BUG-208 — `restore/complete` is niet atomair: de database is al vervangen (en iedereen uitgelogd) wanneer de bestandenstap faalt, terwijl het antwoord zegt dat het herstel mislukt is
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **T** · **Bron:** B17-007
- **Feature:** `POST /api/backups/restore/complete`
- **Reproduction:** `node p17-restore.cjs complete db-backup-2026-09-10T20-50-42-649Z.sql.gz files-backup-p17-marker.tar.gz` (na `p17-mutate.cjs`, geval 4d) → **500** `{"error":"Complete restore failed: Files restore failed with code 2 …"}` in 12 348 ms. Database erna: 665 voertuigen, de `AUDIT-P17-4d`-rijen weg, de `session`-tabel vervangen (de aanroeper was uitgelogd) — **de databasehelft was dus al toegepast**.
- **Expected:** óf beide helften slagen, óf er verandert niets; anders vermeldt het antwoord exact welke helft is toegepast en hoe je dat ongedaan maakt.
- **Actual:** `restoreComplete` draait `restoreDatabase` en daarna `restoreFiles` sequentieel (`backupService.ts:998-1001`); een fout in de tweede stap wordt gerapporteerd als volledige mislukking, zónder te vermelden dat de database vervangen is en iedereen is uitgelogd — en zónder de twee namen van de veiligheidsback-ups mee te geven op het foutpad.
- **Root cause:** `server/backupService.ts:994-1009`, `server/routes/backups.ts:987-992`
- **Affected files:** `server/backupService.ts`, `server/routes/backups.ts`
- **Affected data:** database (vervangen), sessies
- **Security impact:** geen
- **Business impact:** de operator denkt dat er niets gebeurd is en probeert het mogelijk opnieuw met een ander paar bestanden, of zet "terug" vanaf het verkeerde archief — terwijl de live dataset ondertussen de oude is.
- **Fix proposal:** valideer en pak het bestandsarchief eerst uit naar een staging-map (en draai de psql-voorcontroles) vóórdat de database wordt aangeraakt; geef bij gedeeltelijke mislukking een 207-achtig detailantwoord terug: `{databaseRestored:true, filesRestored:false, databaseSafetyBackupFilename, filesSafetyBackupFilename}`.
- **Regression test:** een complete restore met een geldig DB-archief en een kapotte tar → database ongewijzigd (of het antwoord meldt expliciet `databaseRestored:true`).

#### BUG-209 — `download-files` archiveert `process.cwd()/uploads` in plaats van `UPLOADS_DIR`; de `download-data`-dump mist `--clean/--no-owner` en wordt in de applicatiemap geschreven
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **T** · **Bron:** B17-008 (gedeeltelijk; het `DATABASE_URL`-lek is BUG-075, de SMTP-inhoud is BUG-010)
- **Feature:** `GET /api/backups/download-files` en `GET /api/backups/download-data`
- **Reproduction:** `node p17-d-downloads.cjs`. `download-files` → **500** op deze host; het foutbody toont het commando `tar -czf "…\temp\car-rental-files-2026-09-10.tar.gz" -C "C:\…\LVStest-main\LVStest-main" uploads` (`routes/backups.ts:406`, `path.join(process.cwd(), 'uploads')`, en `:427`) — dus de `uploads/` van de repo, terwijl de applicatie `UPLOADS_DIR=…\audit-uploads-bk` serveert én back-upt. `download-data` → **200**, 20 087 186 bytes: **geen** `DROP TABLE IF EXISTS`, wél `OWNER TO`-regels (47 COPY-blokken), inclusief het SMTP-wachtwoord in platte tekst; het bestand wordt eerst naar `<cwd>/temp/car-rental-data-<datum>.sql` geschreven.
- **Expected:** de knop "bestanden downloaden" exporteert de map die de applicatie werkelijk gebruikt, en de data-export is met hetzelfde gereedschap terug te zetten als de automatische back-ups (clean, zonder owner).
- **Actual:** `download-files` negeert `getUploadsDir()` — exact de fout die het commentaar bij `getUploadsDir()` in `shared/paths.ts` als opgelost beschrijft — dus de export kan leeg of verouderd zijn. `download-data` produceert een niet-clean dump waarvan de `OWNER TO`-statements op een andere rol falen (en die fouten worden ingeslikt, BUG-197), met tijdens de download een platte kopie in de applicatiemap.
- **Root cause:** `server/routes/backups.ts:406`, `:427` (uploadpad), `:95` (`pg_dump` zonder vlaggen), `:83` (temp onder `cwd`)
- **Affected files:** `server/routes/backups.ts`
- **Affected data:** de uploads-export en de data-export
- **Security impact:** een onversleutelde volledige dump in `<cwd>/temp`; het geheim uit BUG-010 zit in de export.
- **Business impact:** een operator die "Download files" gebruikt voor een kopie buiten de server krijgt de verkeerde map — en merkt dat pas op het moment dat hij de export nodig heeft.
- **Fix proposal:** gebruik `getUploadsDir()` met `-C dirname(uploadsDir) basename(uploadsDir)`; hergebruik `createDatabaseBackup()` voor `download-data` (dezelfde vlaggen, `tmpdir`, gzip) of stream `pg_dump` rechtstreeks naar de response.
- **Regression test:** met `UPLOADS_DIR` gezet is de tar-inhoudsopgave van `download-files` gelijk aan de bestanden onder `UPLOADS_DIR`.

#### BUG-210 — De kalenderpagina scrollt horizontaal bij 1182 px, en na het sluiten van een dialoog blijft de viewport verschoven zodat de zijbalk de koptekst bedekt
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **T** · **Bron:** E18-003
- **Feature:** Reserveringskalenderpagina — layout
- **Reproduction:** desktopviewport 1182×698, open `/reservations`, open "Nieuwe reservering", kies een voertuig, klik buiten de dialoog.
- **Expected:** geen horizontale paginascroll; na het sluiten van de dialoog staat de scrollpositie terug zoals hij was.
- **Actual:** `document.documentElement.scrollWidth` = **1416 px** tegenover `clientWidth` **1166 px** op de kalenderpagina — de pagina-body scrollt dus horizontaal bij een normale laptopbreedte. Na het sluiten van de dialoog was `window.scrollX` **234 px**, waardoor de vaste zijbalk de paginakop bedekte ("Reserveringskalender" was afgekapt tot "er"). Schermafbeeldingen staan in de sessie van fase 18.
- **Root cause:** de minimumbreedte van het kalenderraster is groter dan het contentgebied (`client/src/pages/reservations/calendar.tsx`, weekraster); daarnaast laat de scroll-lockvrijgave van de Radix-dialoog de horizontale offset staan.
- **Affected files:** `client/src/pages/reservations/calendar.tsx`, `client/src/layouts/MainLayout.tsx`
- **Affected data:** geen
- **Security impact:** geen
- **Business impact:** op 13"–14"-laptops schuiven de kalenderkop en de knoppen onder de zijbalk; gebruikers moeten zijwaarts scrollen om "Nieuwe reservering" terug te vinden.
- **Fix proposal:** `overflow-x: auto` op de kalendercontainer in plaats van op de pagina; `min-w-0` op de hoofdkolom; `scrollX` resetten wanneer een dialoog sluit.
- **Regression test:** Playwright bij viewport 1182 px → `documentElement.scrollWidth <= clientWidth`.

#### BUG-211 — Ophalen mag weken vóór de startdatum, zonder waarschuwing; het voertuig blijft `available` terwijl de reservering `picked_up` is
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **B** (de blokkeer-/verschuifkeuze) met een **T**-helft (de statusafleiding) · **Bron:** E18-004
- **Feature:** Ophaaldialoog en de voertuigstatus na het ophalen
- **Reproduction:** reservering **#3544** met startdatum 2026-10-20; op 2026-09-10 op "Ophalen starten" klikken, kilometerstand invullen, verzenden.
- **Expected:** een waarschuwing dat de verhuring pas over 40 dagen begint (of een blokkade); en ná het ophalen staat het voertuig op `rented`.
- **Actual:** het ophalen wordt zonder enige waarschuwing geaccepteerd (`POST /api/reservations/3544/pickup` → 200, status `picked_up`, contract 1000000 gegenereerd). `GET /api/vehicles/1866` erna: **`availabilityStatus: "available"`** terwijl de reservering `picked_up` is — de auto wordt dus op het dashboard nog steeds als boekbaar aangeboden. Na de inname eindigde diezelfde verhuring met startdatum 2026-10-20 en einddatum 2026-09-10 (BUG-019).
- **Root cause:** de pickup-route in `server/routes.ts` heeft geen enkele controle op de startdatum; de voertuigstatushelper zet `rented` alleen wanneer vandaag **binnen** de reserveringsperiode valt (`server/vehicle-status-helper.ts`) en kijkt niet naar `status === 'picked_up'`.
- **Affected files:** `server/routes.ts` (pickup), `server/vehicle-status-helper.ts`, `client/src/components/reservations/pickup-return-dialogs.tsx`
- **Affected data:** reserveringen die vóór hun startdatum zijn opgehaald — in de devkloon **130** `picked_up`-rijen met een toekomstige startdatum (fase 12)
- **Security impact:** geen
- **Business impact:** een auto die fysiek van het terrein is, staat in het systeem nog als beschikbaar; een tweede boeking voor dezelfde dagen wordt gewoon geaccepteerd. Dit is precies het scenario van BUG-107/BUG-109/BUG-130, maar via een ander pad: niet een falende conflictcontrole, maar een statusveld dat de werkelijkheid niet volgt.
- **Fix proposal:** **T-helft:** leid `availabilityStatus` af uit `status === 'picked_up'`, ongeacht de datums — dat is een fout en geen keuze. **B-helft:** bij ophalen met `startDate > vandaag` óf een bevestiging vragen en de startdatum naar vandaag verplaatsen, óf blokkeren met 409. Welke van de twee is een besluit van de eigenaar (§8.1).
- **Regression test:** ophalen van een toekomstige reservering → 409 (of 200 met bijgewerkte `startDate`, afhankelijk van het besluit); en het voertuig staat na élk ophalen op `rented`.

#### BUG-212 — Mislukte GET-requests worden als lege toestand getoond, er is geen requesttimeout, geen retry en geen enkele indicatie wanneer de server onbereikbaar is
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **T** · **Bron:** E18-005 **+ de serverherstart-observatie** (de enige samenvoeging in deze fases)
- **Feature:** Clientzijdige foutafhandeling voor GET-requests en de verbindingsstatus
- **Reproduction:**
  - **(a)** Rapporten → "Analyse onderhoudskosten" (de backend geeft 500, BUG-089) → de UI toont **"Geen onderhoudskostgegevens beschikbaar"** — niet te onderscheiden van "er zijn geen kosten". Geen toast, geen retry. (De tekst bevat bovendien een typefout: "onderhoudskost­gegevens".)
  - **(b)** `/api/documents` 9 s vertragen via de console en Documenten openen → spinner, daarna rendert de pagina; **geen timeout, geen annuleerknop**. Bij `/api/customers` rendert de pagina direct uit de React-Query-cache, waardoor een trage of stukke backend pas bij de volgende reload zichtbaar wordt.
  - **(c)** Serverherstart op `:5002`: het node-proces gekild terwijl de gebruiker op `/vehicles` stond. Tijdens de storing rendert "Klanten" gewoon uit de cache; de console toont `❌ Socket connection error … xhr poll error` en `net::ERR_CONNECTION_REFUSED` voor `/api/*` — maar de UI toont **geen banner, geen toast, geen offline-indicator**. Na de herstart verbond de Socket.IO-client zichzelf, haalde de volgende navigatie verse data (alles 200) en overleefde de sessie (`GET /api/user` 200, sessies staan in Postgres). Herstel is dus automatisch en correct; wat ontbreekt is terugkoppeling.
- **Expected:** een foutmelding die verschilt van "geen data" ("Kon rapport niet laden, probeer opnieuw"); een timeout na N seconden met een retryknop; en een zichtbare "verbinding verbroken"-indicatie zolang de server onbereikbaar is.
- **Actual:** componenten gebruiken `data ?? []` en kijken nooit naar `isError`; er is geen globale `onError` in de QueryClient; `client/src/lib/queryClient.ts` gebruikt een kale `fetch` **zonder `AbortController`**, dus een hangende backend levert een spinner die nooit stopt; en de `disconnect`/`connect_error`-events die de socket al afvuurt worden nergens op het scherm vertaald.
- **Root cause:** `client/src/lib/queryClient.ts` (geen timeout, geen globale foutafhandelaar), `client/src/components/reports/*`, `client/src/pages/reports*` (`data ?? []`), `client/src/hooks/use-socket.tsx` (events worden niet naar een UI-status vertaald)
- **Affected files:** zoals hierboven
- **Affected data:** geen
- **Security impact:** geen
- **Business impact:** medewerkers concluderen "er zijn geen kosten" terwijl het rapport in werkelijkheid faalt, en blijven doorwerken in een scherm waarvan de server al minuten weg is. Alles wat ze intypen gaat verloren bij de eerste opslagpoging.
- **Fix proposal:** een globale query-foutafhandelaar (toast plus een inline foutstaat in plaats van de lege staat), een `AbortController`-timeout van bijvoorbeeld 30 s met een retryknop, en een globale verbindingsindicator gevoed door de bestaande socket-events.
- **Regression test:** componenttest met een 500-response → de foutstaat wordt gerenderd, niet de lege staat; plus een test die assert dat een query na de timeout afbreekt en een retry aanbiedt.

#### BUG-213 — Een tabblad waarvan de sessie beëindigd is, toont gecachete gegevens door en gaat nooit naar de loginpagina
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **T** · **Bron:** E18-006
- **Feature:** Sessie-einde in andere tabbladen
- **Reproduction:** twee tabbladen met dezelfde sessie. Tabblad A: gebruikersmenu → "Uitloggen". Tabblad B: klik op "Voertuigen".
- **Expected:** tabblad B gaat bij de eerste 401 naar de loginpagina (of toont "Je bent uitgelogd").
- **Actual:** tabblad B rendert de voertuigenpagina uit de React-Query-cache; `/api/vehicles` en `/api/reservations` geven op de achtergrond **401**, er wordt niets getoond, en élke mutatie zou falen. Exact hetzelfde gebeurt wanneer de sessie van 15 minuten verloopt terwijl een tabblad openstaat.
- **Root cause:** `client/src/hooks/use-auth.tsx` en `client/src/lib/queryClient.ts` behandelen 401 nergens globaal — geen redirect, geen cache die gewist wordt.
- **Affected files:** `client/src/lib/queryClient.ts`, `client/src/hooks/use-auth.tsx`, `client/src/components/protected-route.tsx`
- **Affected data:** geen
- **Security impact:** klantgegevens blijven na het uitloggen in een ander tabblad zichtbaar op een gedeelde balie-werkplek, tot iemand de pagina herlaadt.
- **Business impact:** medewerkers denken dat ze nog ingelogd zijn, vullen een formulier in en raken het kwijt bij het opslaan.
- **Fix proposal:** globale 401-afhandeling: querycache wissen en naar `/login` navigeren; eventueel het uitloggen tussen tabbladen doorgeven via `BroadcastChannel` of een storage-event.
- **Regression test:** gemockte 401 op een willekeurige query → `location` wordt `/login`.

#### BUG-214 — Geen HTTP-compressie: responses van 8 MB / 4,25 MB / 1,65 MB gaan ongecomprimeerd de deur uit terwijl gzip ze 24–28× kleiner maakt
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **T** · **Bron:** PF19-004
- **Feature:** HTTP-laag — responscompressie
- **Reproduction:** `curl -sD - -o /dev/null -H "Accept-Encoding: gzip, deflate, br" http://localhost:5001/api/reservations` (met cookie) → **geen** `Content-Encoding`-header; alle 69 endpoints in `p19-timing.out.json` melden `contentEncoding: null`. `node docs/audit/wip/scripts/p19-compress.cjs` (gzip niveau 6 op de echte bodies) → `/api/reservations` 8 033 805 → **287 891 bytes (27,9×)**; maandbereik 1 655 775 → 58 754 (28,2×); `/api/vehicles` 1 157 506 → 42 746 (27,1×); `/api/expenses` 4 252 990 → 177 998 (23,9×); `/api/interactive-damage-checks` 17 043 541 → 12 719 679 (1,3× — base64-PNG's, zie BUG-216).
- **Expected:** JSON-responses groter dan ~1 KB worden met gzip of brotli gecomprimeerd, door Express (`compression()`) of door de reverse proxy. De herhaalde voertuig- en klantobjecten comprimeren extreem goed.
- **Actual:** bodies van 8 MB, 17 MB, 4,25 MB, 1,65 MB, 1,5 MB en 1,16 MB gaan onbewerkt over de lijn. `grep compression package.json server/` → geen dependency, geen middleware.
- **Root cause:** `server/index.ts:158-166` — de middlewarestack bevat helmet, rate limit, json en de sanitizer, maar geen compressie; of de productiedeployment (Coolify/Traefik) comprimeert is **niet geverifieerd** en moet daar gecontroleerd worden voordat deze fix wordt ingepland.
- **Affected files:** `server/index.ts`, `package.json`
- **Affected data:** geen
- **Security impact:** geen (BREACH is niet van toepassing op deze JSON-bodies zonder gereflecteerde geheimen; het CSRF-token zit in een cookie, niet in de body).
- **Business impact:** de eerste weergave van 19,6 MB op de reserveringspagina zou ~2 MB worden; alle lijstpagina's worden 5–10× sneller op kantoor- en 4G-verbindingen. Dit is de goedkoopste ingreep in het hele rapport: één middlewareregel, geen gedragswijziging.
- **Fix proposal:** `app.use(compression({ threshold: 1024 }))` vóór de JSON-routes (of gzip/br aanzetten in Traefik); laat PDF- en bestandsdownloads buiten beschouwing (die zijn al binair).
- **Regression test:** supertest `GET /api/reservations` met `Accept-Encoding: gzip` → verwacht de header `content-encoding: gzip` en een body < 20 % van de identity-omvang.

#### BUG-215 — Elke schadecheck-PDF codeert een header-PNG van 1,6 MB opnieuw: 581 ms CPU, 3,5 MB per bestand, 2,6 s stilstand voor de hele server bij 5 tegelijk
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **T** · **Bron:** PF19-005
- **Feature:** Schadecheck-PDF-generatie (`GET /api/damage-checks/generate/:id` en de interactieve schadecheck-PDF)
- **Reproduction:** `node docs/audit/wip/scripts/p19-pdf.cjs` → schadecheck p50 **581 ms** / p95 634 ms, **3 465 695 bytes** per PDF (ter vergelijking: een contract is 42 ms en 565 KB). Blokkeerprobe: terwijl 5 schadecheck-PDF's parallel gegenereerd worden (wandkloktijd 2,8 s) gaat de triviale `GET /api` (geen database) van p95 21 ms naar **max 2 598 ms** — élke andere request op de server staat te wachten. De ingebedde header is `uploads/damage-check/header-1787427063629.png` = **1 611 901 bytes, 1983×793 px** (`app_settings damage_check_fields.headerImagePath`).
- **Expected:** een schadecheck-PDF van een paar honderd KB, gegenereerd in < 100 ms, of gegenereerd buiten de hoofdthread.
- **Actual:** pdf-lib `embedPng` decodeert en her-deflate't die 1,6 MB PNG **synchroon bij élke generatie** (pdf-lib cachet niets tussen documenten), levert een bestand van 3,4 MB op en kost ~0,5 s CPU op de event loop; het bestand wordt daarna ook nog naar schijf geschreven en als document geregistreerd — bij een **GET**.
- **Root cause:** `server/pdf-damage-check-generator.ts:376-405` (header laden + `embedPng` per generatie, op élke pagina getekend); geen normalisatie van formaat of resolutie bij de upload in `server/routes/app-settings.ts:62-135`
- **Affected files:** `server/pdf-damage-check-generator.ts:376-421`, `server/routes/app-settings.ts:62-135`, `server/routes.ts:6117-6335` (de route)
- **Affected data:** `documents` plus uploads (één bestand van 3,4 MB per print)
- **Security impact:** elke gebruiker met `MANAGE_DAMAGE_CHECKS` kan de hele server laten stilstaan door een handvol schadechecks tegelijk op te vragen (2,6 s per vijf). BUG-168 toont de onbegrensde vorm daarvan (76 s) via een sjabloonwaarde.
- **Business impact:** het printen van schadechecks aan de balie bevriest de applicatie voor iedereen, seconden achtereen; en elke print bewaart 3,4 MB (≈1,2 GB per 350 prints).
- **Fix proposal:** normaliseer de header bij de upload (verkleinen tot ≤ 1200 px breed, JPEG q80 → ~100 KB) of converteer hem één keer en cache de bytes; genereer PDF's in een `worker_thread` of een job-queue met een concurrencylimiet; sla niet bij élke GET een document op (of hergebruik de laatste ongetekende versie).
- **Regression test:** assert dat de gegenereerde schadecheck-PDF voor reservering 3535 < 500 KB is, en dat een probe-request onder 100 ms blijft terwijl er 5 schadechecks tegelijk gegenereerd worden.

#### BUG-216 — `GET /api/interactive-damage-checks` levert 17 MB base64-diagrammen, en het kilometerstandrapport laadt diezelfde 17 MB serverzijdig per aanroep
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **B** (de migratiehelft; de projectie is **T**) · **Bron:** PF19-006
- **Feature:** Lijst met interactieve schadechecks (`GET /api/interactive-damage-checks`) en het kilometerstandrapport (`GET /api/reports/mileage-per-month`)
- **Reproduction:** `p19-timing` → `GET /api/interactive-damage-checks`: 14 rijen, **17 043 541 bytes**, p50 266 ms, 10 parallel 2,5 s wandkloktijd. `p19-sqlcount` → `/api/reports/mileage-per-month` voert `select * from interactive_damage_checks` uit = **104 ms** (het traagste statement van de hele audit) en pompt 17 MB base64 door Node om er alleen `startMileage` en `checkDate` uit te lezen. In psql: 13 van de 14 rijen dragen een `diagram_with_annotations` van **1,30 MB** base64-PNG; de tabel is 18 MB voor 14 rijen (`pg_total_relation_size`), met 16 dode tuples die nooit gevacuumd zijn.
- **Expected:** lijst- en rapportqueries projecteren alleen scalaire kolommen; afbeeldingen worden als bestand opgeslagen (net als élke andere upload) of op id opgehaald wanneer ze nodig zijn.
- **Actual:** `db.select().from(interactiveDamageChecks)` geeft élke kolom terug inclusief de base64-blobs (`database-storage.ts:4341-4343`); zowel de admindialoog van de kalender (`calendar.tsx:703-706`) als het rapport (`server/routes/reports.ts:287-302`) consumeert het geheel.
- **Root cause:** `server/database-storage.ts:4341-4343`, `server/routes/reports.ts:293-296`; het schema bewaart afbeeldingen in tekstkolommen (`shared/schema.ts`: `interactive_damage_checks.diagram_with_annotations`, `renter_signature`, `customer_signature`)
- **Affected files:** `server/database-storage.ts:4341-4343`, `server/routes/reports.ts:287-302`, `client/src/pages/reservations/calendar.tsx:703-706`
- **Affected data:** `interactive_damage_checks` (18 MB, 16 dode tuples)
- **Security impact:** niets nieuws
- **Business impact:** 1,2 MB databasegroei per schadecheck, en een rapport dat trager wordt met élke schadecheck die erbij komt (14 checks = 104 ms; 1 000 checks ≈ 1,2 GB gescand per rapportrun). Dat betekent ook dat élke back-up en élk herstel navenant langer duurt — zie de extrapolatie in fase 17.
- **Fix proposal:** **T-helft:** een projectie zónder de blobkolommen voor lijsten en rapporten, plus een `VACUUM` op de 16 dode rijen. **B-helft:** de diagrammen en handtekeningen verplaatsen naar bestanden onder `uploads` (met het pad in de rij) of naar een aparte tabel `interactive_damage_check_images` die alleen door de PDF- en detailroutes gejoind wordt — dat is een datamigratie en dus een besluit (§8.1).
- **Regression test:** assert dat de items van `GET /api/interactive-damage-checks` geen veld `diagramWithAnnotations` hebben en dat de response < 100 KB is voor de auditdataset.

#### BUG-217 — `GET /api/vehicles` en `/status/breakdown` draaien de statussync (2 SELECT + tot 3 UPDATE) bij élke lees-actie
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **T** · **Bron:** PF19-007
- **Feature:** Voertuigenlijst — schrijven tijdens lezen
- **Reproduction:** `p19-sqlcount` → `GET /api/vehicles` = **10 statements**: 2× `select vehicle_id from reservations …`, `update vehicles set availability_status='rented' where id in (410 ids) and status in ('available','scheduled')`, `update … 'scheduled' where id in (…)`, `update … 'available' where status in ('rented','scheduled') and id not in (…)`, en dan pas de lijstselect. `/status/breakdown` doet dezelfde 5 statements. `p19-timing` → `/api/vehicles` p50 **57 ms** alleen, p95 **454 ms** bij 10 parallel (de drie UPDATEs serialiseren op rijvergrendelingen). Het endpoint wordt door 7 pagina's en 4 dialogen opgevraagd (25 `useQuery`-aanroepplaatsen).
- **Expected:** het lezen van de voertuigenlijst schrijft niets; statusovergangen gebeuren wanneer reserveringen wijzigen of in een geplande taak.
- **Actual:** `await storage.syncVehicleAvailabilityWithReservations()` staat ín de GET-handler (`server/routes.ts:466`, `:429`) en voert tot 3 UPDATE-statements uit over honderden rijen, bij élke lijstlading, vanuit élk open tabblad, inclusief de verversingen na 30 s staleness.
- **Root cause:** `server/routes.ts:463-467` en `:426-430`; `server/database-storage.ts:224-353`
- **Affected files:** `server/routes.ts:426-475`, `server/database-storage.ts:224-353`
- **Affected data:** `vehicles.availability_status` (wordt bij lezen herschreven; 704 tuple-updates op `vehicles` sinds de laatste statsreset, grotendeels uit dit pad; 38 dode tuples)
- **Security impact:** een gebruiker met alleen `VIEW_VEHICLES` veroorzaakt schrijfacties; gelijktijdige lezers racen op dezelfde rijen (de transactionele kant is in fase 13 behandeld).
- **Business impact:** onnodige lockcontentie en WAL op het heetste leespad, met een p95 die ×8 gaat bij bescheiden gelijktijdigheid.
- **Fix proposal:** roep de sync aan vanuit de reserveringsmutaties (dat gebeurt al op `database-storage.ts:1788`, `:2224`, `:3317`) en vanuit de nachtelijke scheduler; haal hem uit de GET-handlers, of maak er een goedkope controle van die in SQL berekent en alleen de verschillen bijwerkt. Let op de samenhang met BUG-211: de afleidingsregel zelf moet eerst kloppen.
- **Regression test:** statementlog-assertie dat `GET /api/vehicles` geen enkele UPDATE uitvoert.

#### BUG-218 — `express.json({ limit: '50mb' })` staat globaal: één body van 20 MB kost +100 MB RSS en wordt geparsed en gesaneerd vóór enige validatie
- **Severity:** MEDIUM · **Status:** OPEN · **Type:** **T** · **Bron:** PF19-008
- **Feature:** Requestbody-limieten (`express.json` / `urlencoded`, 50 MB op élke route)
- **Reproduction:** `node docs/audit/wip/scripts/p19-largefile.cjs` → `POST /api/vehicles` met een JSON-body van 20 MB: **HTTP 400** (Zod) na 216 ms, terwijl de RSS van de server van 763,6 naar **863,7 MB** gaat (+100 MB) en 5 seconden later nog steeds op 863,7 MB staat. De body wordt volledig door body-parser gebufferd, met `JSON.parse` geparsed en daarna recursief door `sanitizeInput` gelopen (`server/middleware/security/sanitization.ts:18-41`) **vóórdat** er ook maar één routevalidatie draait.
- **Expected:** een limiet per route, op maat van die route (een voertuig is < 10 KB; alleen de schadecheck-diagramroutes hebben megabytes nodig), zodat een vergissing of een vijandige client niet 50 MB × N in het geheugen kan vasthouden.
- **Actual:** `app.use(express.json({ limit: '50mb' }))` plus `urlencoded` 50 MB, globaal (`server/index.ts:163-164`). Tien gelijktijdige bodies van 50 MB van een willekeurige ingelogde gebruiker — of 1 000 anonieme binnen het rate-limitvenster naar routes die vóór de authenticatie parsen — duwen het proces meer dan een gigabyte omhoog.
- **Root cause:** `server/index.ts:163-164`
- **Affected files:** `server/index.ts:163-164`, `server/middleware/security/sanitization.ts:18-41`
- **Affected data:** geen
- **Security impact:** geheugenuitputting-DoS door een ingelogde gebruiker — en zelfs anoniem, omdat het parsen van de body in `index.ts` vóór de sessie- en authenticatiemiddleware staat.
- **Business impact:** een per ongeluk geplakte grote tekst in een notitieveld kan de container omver duwen.
- **Fix proposal:** standaard `express.json({ limit: '1mb' })`; mount `express.json({ limit: '50mb' })` alleen op de interactieve-schadecheckroutes (`POST`/`PUT /api/interactive-damage-checks`) — en verplaats die afbeeldingen op termijn naar multipart-uploads (BUG-216).
- **Regression test:** `POST /api/vehicles` met een body van 2 MB → 413.

---

### 6.5 LOW

#### BUG-219 — Herstel hangt af van externe `gunzip`- en `tar`-binaries terwijl zlib en archiver al gebruikt worden; op een Windows-host faalt élk herstel ná de veiligheidsback-up
- **Severity:** LOW · **Status:** OPEN · **Type:** **T** · **Bron:** B17-009
- **Feature:** Gereedschapsafhankelijkheden van het herstelpad (`gunzip`, `tar`) — platformportabiliteit
- **Reproduction:** `restore/database` op deze host → **500** `{"error":"spawn gunzip ENOENT"}` ná de veiligheidsback-up (Git-for-Windows levert `usr/bin/gunzip` als shellscript, niet als `.exe`; `gzip.exe` bestaat wél). `restore/files`, `restore-files`, `download-files` en `download-code` → **500** `tar (child): Cannot connect to C: resolve failed` (GNU tar leest `C:\pad` als `host:pad` en heeft `--force-local` nodig). `restore-data` werkt wél, want dat pad gebruikt zlib.
- **Expected:** herstellen werkt overal waar back-uppen werkt — en back-uppen gebruikt zlib plus archiver, zonder andere externe binaries dan `pg_dump`.
- **Actual:** er zijn **drie verschillende decompressiestrategieën** in één service: zlib in `restore-data`, een externe `gunzip` in `restoreDatabase` en een externe `tar` in de bestandenpaden. De fout wordt bovendien pas ontdekt ná de veiligheidsback-up van 1–13 s, die op haar beurt tijdelijke bestanden lekt (BUG-206) en een `.sql` van 0 bytes achterlaat (BUG-207) — alleen al de mislukte pogingen in deze fase produceerden 6 bestandsarchieven van 117 MB.
- **Root cause:** `server/backupService.ts:763` (`spawn('gunzip')`), `:930` (`spawn('tar')`); `server/routes/backups.ts:356`, `:427`, `:481` (`exec tar`)
- **Affected files:** `server/backupService.ts`, `server/routes/backups.ts`, `Dockerfile` (declareert deze afhankelijkheden niet)
- **Affected data:** geen
- **Security impact:** geen
- **Business impact:** een op Windows gehoste instantie — de dev-/testopstelling die hier gebruikt is — kan **helemaal niet** herstellen, en merkt dat pas na een minuut wachten. **Waarom toch LOW:** productie draait in Linux-containers waar `gunzip` en `tar` bestaan. Maar de 28 historische `pg_dump`-ENOENT-rijen in `backup_runs` bewijzen dat ontbrekend gereedschap in deze deployment wél degelijk voorkomt, en de Dockerfile declareert deze binaries nergens.
- **Fix proposal:** gebruik `zlib.createGunzip()` (en pipe rechtstreeks naar de stdin van psql) plus het `tar`-npm-pakket (of `tar-fs`) voor extractie; controleer bij het opstarten of het gereedschap beschikbaar is en publiceer dat in `/api/backups/health`.
- **Regression test:** unittest dat `restoreDatabase` geen `gunzip` spawnt; het health-endpoint rapporteert `restoreToolsOk`.

#### BUG-220 — De `backup_runs`-geschiedenis overleeft een herstel niet: spookruns blijven op `running` staan en de `pre-restore`-rij verdwijnt
- **Severity:** LOW · **Status:** OPEN · **Type:** **T** · **Bron:** B17-010
- **Feature:** `backup_runs`-historie rond een herstel
- **Reproduction:** elk herstel van een archief dat door `runBackup` is gemaakt. De dump die run 287/288 maakte bevat zijn **eigen** rijen met `status='running'` en zonder bestandsnaam; na `restore/database` komen die terug als `287 database running` en `288 files running` en blijven ze voor altijd staan (na élk herstel in deze fase waargenomen). De `pre-restore`-rij (289) die `takeSafetyBackup` had geschreven is dan weg (gedocumenteerd op `backupService.ts:659-669`), en `/api/backups/health.lastSuccessAt` valt terug op het laatste succes uít de dump (20:50:18 na een herstel om 23:04).
- **Expected:** de runhistorie weerspiegelt de werkelijkheid na een herstel: de veiligheidsback-up is bekend en er staan geen spookruns in.
- **Actual:** de historie is gewoon onderdeel van de herstelde dataset; de service verzoent hem nergens.
- **Root cause:** `backup_runs` wordt met alles meegedumpt (`server/backupService.ts:239-246`, geen `--exclude-table-data=backup_runs`) en `restoreDatabase` (`:702-846`) doet achteraf geen enkele correctie.
- **Affected files:** `server/backupService.ts`
- **Affected data:** `backup_runs`
- **Security impact:** geen
- **Business impact:** de health-tegel en de "laatste back-up"-box liegen tot een dag lang na een herstel, en de veiligheidsback-up is alleen nog terug te vinden in de toast die de operator waarschijnlijk al weggeklikt heeft — precies op het moment dat hij hem nodig heeft.
- **Fix proposal:** sluit de data van `backup_runs` uit van de dump (of markeer rijen met `status='running'` na een herstel als `failed: "interrupted by restore"`) en schrijf de `pre-restore`-rij opnieuw weg zodra psql klaar is.
- **Regression test:** na `restoreDatabase()` heeft geen enkele `backup_runs`-rij de status `running` en bestaat de `pre-restore`-rij.

#### BUG-221 — Status- en UX-gaten in het back-upscherm (bundel van zes)
- **Severity:** LOW · **Status:** OPEN · **Type:** **T** · **Bron:** B17-011
- **Feature:** Statusmeldingen en bevestigingen rond back-ups (bundel)
- **Reproduction:**
  - **(a)** Twee gelijktijdige `POST /api/backups/run` → de tweede krijgt **500** `{"error":"Backup is already running"}` (`p17-9-concurrent-backup.cjs`) in plaats van 409.
  - **(b)** `GET /api/backups/status` om 22:50 lokale tijd → `nextScheduled` `"2026-09-11T00:00:00.000Z"` — onvoorwaardelijk berekend als "morgen 02:00" (`backupService.ts:217-223`); tussen 00:00 en 02:00 is die dus een dag te laat, en `BackupScheduler.getStatus` (`:96-112`) telt er nóg een dag bij (dode code, niet door een route aangeroepen).
  - **(c)** De map van `BACKUP_PATH` hernoemd → `/api/backups/health` geeft **200** met `stale:false, lastError:null` en `/api/backups/list` geeft **`[]`** — de hele historie is stil verdwenen zonder één waarschuwing. Na `POST /run` wordt de map via `mkdir -p` opnieuw aangemaakt alsof er niets aan de hand is.
  - **(d)** `POST /api/backups/cleanup` laat lege datummappen (`database/2025/05/01`) achter.
  - **(e)** `POST /api/backups/upload` accepteert een `empty.sql` van 0 bytes → 200.
  - **(f)** `POST /api/backups/restore-data` en `/restore-files` droppen respectievelijk overschrijven **alles** zonder de getypte bestandsnaambevestiging die `/restore/database` en `/restore/complete` wél eisen (`routes/backups.ts:173-331` tegenover `:848-862`).
- **Expected:** 409 bij bezet; een echte volgende uitvoertijd; health op rood wanneer het back-uppad ontbreekt of leeg is; geen lege mappen; lege uploads geweigerd; dezelfde bevestiging op álle destructieve paden.
- **Actual:** zoals hierboven.
- **Root cause:** `server/routes/backups.ts:656-661`, `:739-750`, `:753-843`; `server/backupService.ts:217-223`, `:1113`; `server/backupScheduler.ts:96-112`
- **Affected files:** `server/routes/backups.ts`, `server/backupService.ts`, `server/backupScheduler.ts`, `client/src/components/dialogs/backup-dialog.tsx`
- **Affected data:** geen
- **Security impact:** punt **(f)** verlaagt de drempel voor een volledige, onomkeerbare databasevervanging tot één klik — en in combinatie met BUG-197 is dat de gevaarlijkste van de zes.
- **Business impact:** misleidende status (groen terwijl de back-upmap weg is) en een destructief uploadherstel zonder rem.
- **Fix proposal:** 409 plus `Retry-After`; de volgende cron-uitvoering berekenen met `node-cron`/`cron-parser`; een bestaanscontrole in health; lege datummappen verwijderen; omvang 0 weigeren; een `confirm`-veld verplichten op de uploadherstelroutes. **Punt (f) eerst.**
- **Regression test:** per punt één test.

#### BUG-222 — Tabletlayout: de zijbalk blijft uitgeklapt en tabellen worden afgekapt
- **Severity:** LOW · **Status:** OPEN · **Type:** **T** · **Bron:** E18-008
- **Feature:** Tabletlayout (768 px)
- **Reproduction:** tabletpreset (768×1024), open `/vehicles`.
- **Expected:** een ingeklapte zijbalk of een tabel die past, met horizontale scroll binnen de tabelcontainer.
- **Actual:** de zijbalk blijft op volle breedte (~220 px, ongeveer 30 % van het scherm); de voertuigtabel is afgekapt na "Kenteken", met een scrollbar op de kaart terwijl de pagina-inhoud smaller is dan de tabel.
- **Root cause:** de breakpoint van de zijbalk staat op `md` (768 px), dus precies op tabletbreedte uitgeklapt; de tabellen hebben geen `overflow-x-auto`-wrapper.
- **Affected files:** `client/src/layouts/MainLayout.tsx`, `client/src/pages/vehicles*.tsx`
- **Affected data:** geen
- **Security impact:** geen
- **Business impact:** een tablet aan de balie werkt onhandig.
- **Fix proposal:** klap de zijbalk in onder `lg`; wikkel tabellen in `overflow-x-auto`.
- **Regression test:** visuele/Playwright-controle bij 768 px.

#### BUG-223 — Onvertaalde Engelse teksten en Amerikaanse datumnotaties in de Nederlandse UI
- **Severity:** LOW · **Status:** OPEN · **Type:** **T** · **Bron:** E18-009
- **Feature:** i18n — onvertaalde teksten en localeformaten
- **Reproduction:** lege voertuigzoekactie ("No results.", "Showing 0 of 0", "Previous", "Next"); reserveringsdetails (brandstof "Full"); documentlijst ("Uploaded: Sep 11, 2026, 12:54 AM"); datumbereik in Rapporten ("Aug 11, 2026 - Sep 10, 2026"); datums in de lijstweergave als "01 Oct 26". Ook: `/portal` (zonder het Nederlandse pad) toont de SPA-404 met de ontwikkelaarstekst "Ben je vergeten de pagina aan de router toe te voegen?" — een interne boodschap die een klant nooit hoort te zien.
- **Expected:** Nederlandse teksten en `nl-NL`-formaten in een Nederlandse UI.
- **Actual:** de Engelse teksten en formaten hierboven.
- **Root cause:** hardgecodeerde strings in `client/src/components/ui/data-table*.tsx`; `date-fns` `format` zonder de `nl`-locale; enumwaarden van het brandstofniveau worden rauw getoond; de 404-pagina toont ontwikkelaarstekst.
- **Affected files:** `client/src` (data-table, reserveringsdetaildialoog, documentenlijst, rapportenkop, 404-pagina)
- **Affected data:** geen
- **Security impact:** geen
- **Business impact:** onprofessionele indruk, en de Amerikaanse datumvolgorde (maand vóór dag) is in een verhuuradministratie werkelijk verwarrend — "Sep 10" versus "10 sep" scheelt bij het aflezen van een ophaaldatum.
- **Fix proposal:** i18n-sleutels voor de tabelteksten; `format(date, pattern, { locale: nl })` via één gedeelde helper; de 404-pagina een klantvriendelijke tekst geven. Let op de samenhang met BUG-192 (welke taal en welk formaat leidend zijn op documenten) — dat besluit hoort hier ook te gelden.
- **Regression test:** i18n-lint (geen onvertaalde letterlijke teksten in JSX) — adviserend.

#### BUG-224 — Documenttijdstempels staan twee uur vóór op de werkelijkheid
- **Severity:** LOW · **Status:** OPEN · **Type:** **B** (migratiebesluit) · **Bron:** E18-010
- **Feature:** Tijdstempels van documenten (en élke andere `timestamp`-kolom zonder tijdzone)
- **Reproduction:** genereer een contract om 22:54 CEST (2026-09-10) en open de reserveringsdetails.
- **Expected:** "10 sep 2026, 22:54".
- **Actual:** "Uploaded: **Sep 11, 2026, 12:54 AM**" — twee uur vooruit, en meteen ook een andere dag. `documents.created_at` wordt opgeslagen als een naïeve timestamp (servertijd) en gerenderd alsof het UTC is (of andersom).
- **Root cause:** `timestamp` **zonder** tijdzone in `shared/schema.ts` voor `documents.createdAt` en andere tabellen, geserialiseerd met een `Z` en vervolgens in lokale tijd weergegeven.
- **Affected files:** `shared/schema.ts`, `server/database-storage.ts` (de document-insert), de documentlijsten in de client
- **Affected data:** **alle** timestampkolommen zonder tijdzone — dit is dus niet alleen een documentkwestie
- **Security impact:** geen
- **Business impact:** verkeerde tijden op documenten en in auditweergaven. Dat telt zodra "wie deed wat wanneer" ter discussie staat: een contract dat op 10 september om 22:54 is opgemaakt staat in het systeem als 11 september.
- **Fix proposal:** `timestamp with time zone` voor nieuwe kolommen plus een migratie voor de bestaande, óf formatteren met de opgeslagen offset. **Dit is een datamigratie over vrijwel élke tabel en vereist een besluit van de eigenaar** (§8.1) — inclusief het besluit hoe bestaande rijen geïnterpreteerd worden (zijn die in servertijd of in UTC geschreven?).
- **Regression test:** `now()` invoegen, via de API teruglezen en vergelijken met de tijd die de client rendert.

#### BUG-225 — Klikken naast de nieuwe-reserveringsdialoog gooit alles weg wat er is ingetypt
- **Severity:** LOW · **Status:** OPEN · **Type:** **T** · **Bron:** E18-011
- **Feature:** Nieuwe-reserveringsdialoog — sluiten bij een klik buiten de dialoog
- **Reproduction:** vul de datums in, kies een voertuig, klik ergens op de pagina buiten de dialoog.
- **Expected:** een bevestiging ("Wijzigingen weggooien?") of de dialoog blijft gewoon open.
- **Actual:** de dialoog sluit onmiddellijk; alle invoer is weg.
- **Root cause:** het standaardgedrag van `onPointerDownOutside` van de Radix-`Dialog`; er is geen controle op een gewijzigd formulier.
- **Affected files:** `client/src/components/reservations/reservation-form.tsx` (de dialoogwrapper)
- **Affected data:** geen
- **Security impact:** geen
- **Business impact:** een lange boeking opnieuw intypen; irritatie aan de balie.
- **Fix proposal:** `onPointerDownOutside={(e) => form.formState.isDirty && e.preventDefault()}` plus een bevestiging.
- **Regression test:** componenttest: een gewijzigd formulier plus een klik buiten de dialoog → de dialoog staat nog open.

#### BUG-226 — `customers/with-reservations` en `find-by-contract` laden de volledige reserveringstabel om één boolean te berekenen of één rij te vinden
- **Severity:** LOW · **Status:** OPEN · **Type:** **T** · **Bron:** PF19-009
- **Feature:** `GET /api/customers/with-reservations` en `GET /api/reservations/find-by-contract/:contractNumber`
- **Reproduction:** `p19-sqlcount` → `customers/with-reservations` = 8 statements, inclusief de volledige reserveringsselect (5,8 ms) plus batchladingen van voertuigen en klanten — ≈8 MB in Node gematerialiseerd om `hasActiveReservation` te bepalen; `p19-timing` p50 83 ms, 10 parallel p95 **719 ms**. `find-by-contract` (`server/routes.ts:2315-2331`) roept `getAllReservations()` aan en doet daarna `.find()` in JavaScript, terwijl `reservations.contract_number` een **unieke index** heeft.
- **Expected:** `EXISTS (select 1 from reservations where customer_id = c.id and start_date <= today and end_date >= today)` respectievelijk `WHERE contract_number = $1`.
- **Actual:** de hele tabel per request in het geheugen.
- **Root cause:** `server/routes.ts:1986-2024` en `:2315-2331`
- **Affected files:** `server/routes.ts:1986-2024`, `:2315-2331`
- **Affected data:** geen
- **Security impact:** geen
- **Business impact:** vandaag verwaarloosbaar (83 ms), maar het schaalt met de historie mee — en `find-by-contract` is het pad dat de balie gebruikt om een contractnummer op te zoeken.
- **Fix proposal:** SQL `EXISTS` respectievelijk een geïndexeerde lookup.
- **Regression test:** statement-tellingsassertie (≤ 5) plus de assertie dat `find-by-contract` een query uitvoert die `contract_number = $1` bevat.

#### BUG-227 — Per-rij-`console.log` op het heetste leespad (17,6 KB per kalenderlading) en 34 logregels per contract-PDF
- **Severity:** LOW · **Status:** OPEN · **Type:** **T** · **Bron:** PF19-010 (gedeeltelijk; het volumeaspect hoort bij BUG-079 en wordt daar **ontkracht**)
- **Feature:** Serverlogging in hot paths
- **Reproduction:** `node docs/audit/wip/scripts/p19-loglines.cjs` → het septemberraster bevat **114** onderhoudsblokken zonder klant; `getReservationsInDateRange` logt **4 regels per blok** = **17 566 bytes console-uitvoer per kalenderlading**, inclusief `console.log('📋 Found active rental:', activeRental)` dat een volledige rij `util.inspect`t (1 485 bytes zodra er er één is; nu lossen ze allemaal op `undefined` op, met open verhuringen zou het ≈190 KB per lading worden). Elke dashboard-, reserverings- en onderhoudslading triggert dit. `generateRentalContractFromTemplate` bevat **34** `console.log`-aanroepen (`server/utils/pdf-generator.ts:55-541`); `server/routes.ts` 109, `server/database-storage.ts` 43; de contractroute (`:5479-5610`) logt ~14 regels per contract.
- **Expected:** geen per-rij-logging op leespaden; debuglogging achter een vlag.
- **Actual:** debug-`console.log` met `util.inspect` van hele rijen op de meest opgevraagde query; `console.log` is synchroon naar een TTY of pipe en draait binnen de request.
- **Root cause:** `server/database-storage.ts:1313-1335`, `server/utils/pdf-generator.ts:67-192` e.v.
- **Affected files:** `server/database-storage.ts:1313-1335`, `server/utils/pdf-generator.ts`, `server/routes.ts`
- **Affected data:** containerlogs
- **Security impact:** zie BUG-079 voor de responsbodies; deze bevinding gaat puur over volume en CPU.
- **Business impact:** beperkte CPU-kosten en logruis, maar het maakt forensisch grepwerk in het containerlog wél lastiger — precies wanneer je dat nodig hebt.
- **Fix proposal:** haal de per-rij-logregels weg (of zet ze achter een `debug`-logger met een env-vlag) en houd de requestregel.
- **Regression test:** niet praktisch verder dan een lintregel (`no-console` in `server/database-storage.ts`).

#### BUG-228 — Ongememoiseerde kalenderrendering: per cel een `.filter` over de hele reserveringsset (statisch — ongemeten)
- **Severity:** LOW · **Status:** OPEN · **Type:** **T** · **Bron:** PF19-011
- **Feature:** Frontendrendering van kalenders en lijsten
- **Reproduction:** **statisch** (er was geen browser in fase 19): `grep -rn "React.memo\|memo(" client/src` → **0** gememoiseerde componenten. `client/src/pages/reservations/calendar.tsx` (4 244 regels) berekent `getReservationsForDay(vehicleId, day)` door de volledige reserveringsarray per voertuigcel te filteren (`:927-943`), en `getReservationsForDate(day)` per datumcel binnen JSX-klik-/drag-handlers (`:1261-1263`). `client/src/components/dashboard/reservation-calendar.tsx:370-385` filtert alle reserveringen binnen `week.map(day => …)`, dus per cel (42 cellen × N reserveringen per render). `GlobalDialogContext.Provider` geeft bij élke render een vers `value={{ … }}`-object door (`client/src/contexts/GlobalDialogContext.tsx:237-250`), waardoor élke consument hertekent zodra welke dialoogstatus dan ook wijzigt; plus 62 inline arrow-handlers in de JSX van `calendar.tsx`.
- **Expected:** reserveringen één keer per datawijziging in emmers verdelen (`Map<dateKey, …>` / `Map<vehicleId, …>`) met `useMemo`; gememoiseerde rij- en celcomponenten; een gememoiseerde contextwaarde.
- **Actual:** O(cellen × N) filteren per render met N = 461 in een maandweergave, en hertekeningen bij élke dialoogstatus of socketinvalidatie (die bovendien de referentie van de 8 MB-array verwisselt, waardoor élke afgeleide `useMemo` opnieuw rekent).
- **Root cause:** de bestanden en regels hierboven
- **Affected files:** `client/src/pages/reservations/calendar.tsx`, `client/src/components/dashboard/reservation-calendar.tsx`, `client/src/contexts/GlobalDialogContext.tsx`, `client/src/pages/maintenance/calendar.tsx`
- **Affected data:** geen
- **Security impact:** geen
- **Business impact:** **hier niet gemeten.** Met 461 zichtbare reserveringen en ~35 voertuigen × 30 dagen aan cellen komt dat neer op ~500 000 predicaatevaluaties per render — waarschijnlijk tientallen milliseconden op een desktop, geen seconden. Dit staat hier als **LOW en expliciet ongemeten**; het verdient een meting met de React Profiler vóórdat er iets aan verbouwd wordt.
- **Fix proposal:** reserveringen in `Map`-emmers per dag en per voertuig zetten; de contextwaarde met `useMemo`; `React.memo` op de dagcel- en rijcomponenten.
- **Regression test:** een meting met de React Profiler vóór en ná; niet automatiseerbaar zonder browserharnas.

#### BUG-229 — De socketinvalidatie matcht op `key.includes('/' + id)` en invalideert daardoor niet-gerelateerde queries
- **Severity:** LOW · **Status:** OPEN · **Type:** **T** · **Bron:** PF19-012
- **Feature:** Socket-gedreven cache-invalidatie (client)
- **Reproduction:** `client/src/lib/cache-utils.ts:11`, `:23-25`, `:38`, `:50-51`, `:62-63`, `:75` gebruiken `key.includes('/' + id)`. Een `reservations`-event met `vehicleId` 18 invalideert daarmee ook `/api/reservations/vehicle/1870`, `/api/vehicles/1870` en `/api/customers/18…`; een event met id 1 invalideert **élke** key die "/1" bevat. In combinatie met de prefixinvalidatie worden zo ook detailqueries van dialogen opnieuw opgehaald die niets met de wijziging te maken hebben.
- **Expected:** matchen op een volledig padsegment (`/${id}` gevolgd door het einde of een `/`), of gebruikmaken van gestructureerde query-families.
- **Actual:** een substringvergelijking.
- **Root cause:** `client/src/lib/cache-utils.ts` (regels hierboven)
- **Affected files:** `client/src/lib/cache-utils.ts`
- **Affected data:** geen
- **Security impact:** geen
- **Business impact:** extra netwerkverkeer op drukke dagen; wordt gemaskeerd door de batching van 50 ms, maar telt op bij de 19 MB van BUG-204.
- **Fix proposal:** `new RegExp('/' + id + '(/|$|\\?)')`.
- **Regression test:** unittest van de matcher met de id's 1, 18 en 1870.

#### BUG-230 — Nachtelijke scans: de service-duescan laadt alle voertuigen tweemaal, de RDW-scan doet 665 sequentiële externe calls plus 665 SELECTs
- **Severity:** LOW · **Status:** OPEN · **Type:** **T** · **Bron:** PF19-013
- **Feature:** Nachtelijke schedulers (service-duescan, RDW-APK-scan, portaalalerts)
- **Reproduction:** **statisch.** `server/utils/service-due-scanner.ts:83-101` — `getServiceDueVehicles()` laadt de instellingen plus alle 665 voertuigen op `:100`, en `storage.getAllVehicles()` laadt ze op `:101` nóg een keer, alleen om te tellen; daarna 1–2 statements per voertuig dat aan de beurt is (`:105-120`). `server/utils/rdw-apk-scanner.ts:27-74` — per voertuig één externe HTTPS-call plus een `getPendingApkDateChangeForVehicle`-SELECT plus 250 ms wachttijd → **≥ 665 statements en ≥ 2,8 minuten** voor de vloot, volledig sequentieel; datzelfde pad wordt ook handmatig aangeroepen via `POST /api/apk-date-changes/scan-now` (niet uitgevoerd in deze audit). `server/services/portal-customer-notifications.ts:92-118` — één dedupe-SELECT per rijdende reservering per alerttype.
- **Expected:** één doorloop over de al geladen voertuigenarray; openstaande wijzigingen in één `IN()`-query; dedupe via één verzamelquery.
- **Actual:** zoals hierboven — onschadelijk bij 665 voertuigen tussen 02:30 en 04:00, maar de handmatige scanknop laat die lus van 2,8 minuten **binnen de levensduur van één HTTP-request** draaien.
- **Root cause:** de bestanden en regels hierboven
- **Affected files:** `server/utils/service-due-scanner.ts`, `server/utils/rdw-apk-scanner.ts`, `server/services/portal-customer-notifications.ts`
- **Affected data:** `custom_notifications`, `apk_date_changes`, `portal_notifications` (de schrijfacties zijn idempotent ontworpen)
- **Security impact:** geen
- **Business impact:** vandaag niet meetbaar; alleen de duur van de handmatige scan is merkbaar.
- **Fix proposal:** hergebruik de al geladen voertuigenarray; batch de lookup van openstaande wijzigingen; houd de RDW-throttle maar maak het handmatige endpoint asynchroon met voortgang (er is al een `/scan-status`).
- **Regression test:** statement-tellingsassertie voor `scanVehiclesForServiceDue` tegen een fixture — constant, niet O(voertuigen).

---

## 7. Herbevestigde bestaande bugs (nieuwe evidence, geen nieuw nummer)

**Eén ontkrachting — voorstel tot bijstelling zonder hernummering:**

- **BUG-079** (de requestlogger hangt de JSON-body aan élke logregel) — het **volumeaspect wordt
  ontkracht**: de body wordt op **200 tekens** afgekapt en de gemeten regellengte is **203 bytes** voor
  de reserveringslijst, wat bij 5 000 requests per dag neerkomt op **≈0,97 MB/dag**
  (`p19-loglines.out.json`). Dat is geen probleem. **Het echte probleem blijft onverkort staan:** een
  kleine, geheimdragende respons past juist wél volledig binnen die 200 tekens en wordt dus integraal
  gelogd. **Voorstel: de formulering van BUG-079 aanscherpen tot uitsluitend het lekaspect**, en het
  volumeargument laten vervallen.

**Overige herbevestigingen:**

- **BUG-005** (`io.emit('data-update')` stuurt de volledige entiteit naar élke verbonden socket) —
  fase 19 meet de omvang: één reserveringsevent is ~4 KB (`server/realtime-events.ts:11-23`). Dat is
  **geen** performanceprobleem; de blootstellingskant blijft bij de securityfases.
- **BUG-010** (SMTP-wachtwoord in platte tekst) — fase 17: het staat in **élke** automatische dump
  (`COPY public.app_settings`, waarde `AUDIT-super-secret-smtp-pw` in de auditomgeving) én in de
  `download-data`-export. **Wie een back-upbestand heeft, heeft de SMTP-referenties.** Dat verbreedt de
  impact van BUG-010 aanzienlijk: het gaat niet alleen om een endpoint dat te veel teruggeeft, maar om
  élke kopie van de database die ooit ergens heen gaat.
- **BUG-019** (einddatum wordt bij inname overschreven met vandaag) — voor het eerst **via de echte UI**
  gereproduceerd: reservering **#3544** eindigt met `startDate 2026-10-20` en `endDate 2026-09-10`, na
  een volledig normale innamehandeling in de innamedialoog.
- **BUG-030** (geweigerde upload → 500 met stack trace) — fase 19: een upload van 50 MB wordt na
  **178 ms** geweigerd met **HTTP 500** `MulterError: File too large` plus een stack met absolute paden
  (limiet 25 MB, `routes.ts:4934`). Nieuw en geruststellend: de stream wordt **vroeg afgebroken** — er
  wordt geen 50 MB gebufferd (RSS +6 MB). Alleen de statuscode en de body deugen niet.
- **BUG-057** (stack traces in foutresponses, dev-gated) — fase 17: `POST /api/backups/upload` met
  `evil.exe` → 500 `{"error":"Server Error","message":"This file type is not permitted for security
  reasons","stack":"Error: … at <anonymous> (C:\\Users\\kees lam\\…"}`; ook de 500's die de
  schrijverslus tijdens een herstel kreeg droegen een `stack`.
- **BUG-062** (standaardadmin wordt na een herstart opnieuw aangemaakt) — **belangrijke nuance uit
  fase 17:** die hercreatie gebeurt alleen bij het starten van het proces (`server/index.ts:21` →
  `initAdmin`). In deze fase vond geen herstart plaats, dus na het herstel van `p17-half.sql` bleef
  `users` leeg en kon **niemand** meer inloggen. Mét een herstart zou `admin`/`admin123` weer verschenen
  zijn. Met andere woorden: **BUG-062 is op dit moment de enige weg terug in de applicatie na een
  mislukt herstel** — een beveiligingsfout die als noodluik dienstdoet. Dat is een argument om BUG-197
  te fixen **vóórdat** BUG-062 dichtgezet wordt, niet om BUG-062 te laten staan.
- **BUG-069** (`tar -xzf` over `process.cwd()` in `restore-code`, RCE-primitief) — **niet uitgevoerd**
  (destructief). Nieuwe evidence: exact dezelfde primitief wordt gebruikt door de **niet-code**-paden
  `restore/files` en `restore-files` (beide `-C process.cwd()`, zie BUG-198). Het aanvalsoppervlak is
  dus niet beperkt tot `restore-code`, en een fix die alleen `restore-code` weghaalt lost het niet op.
- **BUG-074** (de `skip` van de `apiLimiter` treedt nooit in werking) — fase 19: **geauthenticeerde**
  responses dragen nog steeds `RateLimit-Limit: 1000` en `RateLimit-Remaining`
  (`p19-compress.out.json`). Deze fase moest daardoor ~3 500 requests over 20 nep-IP's spreiden om
  onder de gedeelde emmer te blijven, en de browsersessie van de auditleider deelde die emmer met élke
  test vanaf het echte loopbackadres (`RateLimit-Remaining` stond op 819 vóór de fase begon).
- **BUG-075** (`download-data` lekt `DATABASE_URL`) — fase 17: op `:5002` bestaat `pg_dump`, dus de
  route gaf 200. Nieuw: de `temp/`-map van de repo bevat nog steeds **drie `car-rental-data-*.sql` van
  0 bytes** (2026-08-22, 08-23, 09-09) van eerdere mislukte runs — de shell-redirect maakt het bestand
  aan vóórdat `pg_dump` faalt en het foutpad verwijdert het nooit (`routes/backups.ts:95`, `:110-116`).
  Élke mislukking laat dus een artefact in de applicatiemap achter; het bestand van de geslaagde run
  werd wél opgeruimd.
- **BUG-076** (traversal via `originalname` bij de back-upupload) — fase 17 bevestigt het gedrag uit
  fase 15: de upload van `db-backup-2026-09-10T20-50-42-649Z.sql.gz` werd
  `uploaded-database-<ts>-db-backup-2026-09-10T20-50-42-649Z.sql.gz`, dus basename-gedrag ongewijzigd.
  Het werkelijke probleem met deze route is **BUG-200** (de verkeerde map).
- **BUG-079** — zie de ontkrachting hierboven.
- **BUG-084** (de rauwe multipart-body gaat ongevalideerd naar `db.update()`) — fase 18 laat het
  concrete gevolg zien: dit is het mechanisme achter **BUG-202**, waardoor het standaard bewerkformulier
  van reserveringen al twaalf dagen in productie stuk is. Dat verheft BUG-084 van een architectuurbezwaar
  tot een aantoonbare productiestoring.
- **BUG-089** (`GET /api/reports/maintenance-costs` → 500) — fase 18 ziet het vanaf de rapportenpagina
  (getoond als lege staat, zie BUG-212); fase 19 meet het: **12/12 sequentieel en 10/10 in de burst**
  een 500, p50 101 ms, en alle 7 statements (expenses, vehicles plus batches) worden **uitgevoerd
  vóórdat** de fout gegooid wordt — de fout zit dus in de aggregatiecode, niet in de query.
- **BUG-095** (`active_sessions` wordt nooit opgeruimd) — fase 19: **213 rijen** en groeiend, 136 kB,
  bevestigd in de tabelgroottetabel.
- **BUG-096** (de CSRF-middleware maakt voor iedereen een sessie) — fase 19 **kwantificeert** het:
  **50 requests zonder cookie → 50 nieuwe `session`-rijen** (`p19-anon-session.out.json`; de tabel ging
  tijdens de fase van 49 → 99 → 111 rijen), waarvan 24 requests bovendien gewoon een 401 kregen. De
  tabel wordt alleen opgeruimd door de intervalsweep van connect-pg-simple, en stond in de metingen op
  59 % dode tuples.
- **BUG-097** (de bestandsnaamfilter van de back-uproutes mist de backslash) — fase 17 bevestigt de
  ontkrachting uit fase 15: `GET /api/backups/download/database/..%5c..%5cpackage.json` → **400**
  "Invalid filename", omdat `..` als eerste geweigerd wordt. Ongewijzigd LOW/hardeningpunt.
- **BUG-106** (drag & drop in de kalender) — API-niveau al bewezen; in fase 18 **niet** via de muis
  gereproduceerd (het gereedschap kreeg de pointersleep niet betrouwbaar aan de praat). Blijft staan
  zoals hij is.
- **BUG-107 / BUG-109 / BUG-130** (dubbele boekingen en statusgaten) — fase 18 levert er een nieuw pad
  bij: een auto die 40 dagen te vroeg is opgehaald blijft `available`, zodat een tweede boeking gewoon
  geaccepteerd wordt. Apart gefiled als **BUG-211**.
- **BUG-111** (de server accepteert niet-ISO-datums op `PATCH /api/reservations/:id`) — de twee
  rommeldatumrijen die in fase 10 zijn aangemaakt (3442 `"not-a-date"`, 3365 `"2099-13-45"`) zijn
  precies wat in fase 18 de reserveringspagina liet crashen. **De serverbug en de clientbug zijn beide
  nodig om dit te veroorzaken en beide nodig om het te voorkomen** (zie BUG-201).
- **BUG-148** (rauwe Postgres-tekst in foutresponses) — BUG-202 is een nieuw voorbeeld: de client krijgt
  letterlijk `invalid input syntax for type integer: ""` te zien.
- **BUG-168** (de synchrone pdf-lib-generator; pathologische `page`-waarde → 40 000 pagina's, 76 s) —
  fase 19 kwantificeert het **normale** geval van dezelfde generator: 0,58 s CPU per schadecheck en
  **2,6 s serverbrede stilstand** bij 5 gelijktijdige generaties. Apart gefiled als **BUG-215**, omdat
  de fix een andere is.
- **BUG-172** (geen optimistic locking bij het bewerken van reserveringen) — fase 18 ziet het
  mechanisme vanuit de browser: de client stuurt bij élke bewerking de **volledige rij** mee, zonder
  enig versieveld. Dat is precies het lost-update-patroon, nu ook zichtbaar in de daadwerkelijke
  netwerkrequest.

**Niet opnieuw getest in deze fases:** BUG-002/DM-001 (portaal-proceskill), BUG-069 en BUG-070
(destructief), BUG-012, BUG-026/BUG-085, BUG-027, BUG-029, BUG-073, BUG-088, BUG-098, BUG-131,
BUG-150.

---

## 8. Voorgestelde wijzigingen die goedkeuring vereisen

Niets hiervan is uitgevoerd. Dit zijn **voorstellen**; ze wijzigen bedrijfsregels, een API-contract,
de gegevensstructuur of de productieconfiguratie en horen als OPT-voorstel voorgelegd te worden.

### 8.1 Bedrijfsregels en migratiebesluiten (de vier B-bugs)

| Bug | Te nemen besluit |
|---|---|
| BUG-211 | Mag een auto vóór de startdatum opgehaald worden? Zo ja: schuift de startdatum dan automatisch mee naar vandaag (met bevestiging), of blijft de oorspronkelijke startdatum staan? Zo nee: wordt het geblokkeerd met 409? (De tweede helft — het voertuig op `rented` zetten zodra de reservering `picked_up` is — is géén keuze en wordt als technische fix meegenomen.) |
| BUG-205 | Mogen lijstendpoints minder gegevens teruggeven (alleen id's plus weergavevelden in plaats van de volledige voertuig- en klantrij) en mogen ze gepagineerd worden? Dit verandert wat élk scherm binnenkrijgt en vereist aanpassingen aan de client. Deelbesluit: mag de kalender een maximumbereik krijgen (bijvoorbeeld 400 dagen)? |
| BUG-216 | Verhuizen de schadecheckdiagrammen en handtekeningen uit de databasekolommen naar bestanden onder `uploads` (met het pad in de rij), of naar een aparte tabel die alleen door de detail- en PDF-routes gejoind wordt? Dit is een datamigratie van de bestaande 14 rijen (18 MB) en raakt ook de back-upomvang. |
| BUG-224 | Migreren we `timestamp` naar `timestamp with time zone` over vrijwel élke tabel? En hoe interpreteren we de bestaande rijen — als servertijd of als UTC? Zonder dat besluit is élke migratie een gok over de historie. |

### 8.2 De hotfixvraag — het bewerkformulier van reserveringen (BUG-202)

Dit is **geen** bedrijfsregel maar een technische fout (T), en normaal zou hij gewoon in de wachtrij
staan. Hij wordt hier apart voorgelegd omdat de situatie afwijkt:

- Het standaard bewerkformulier van reserveringen is **nu, in productie, voor alle gebruikers stuk** —
  sinds 2026-08-29, ruim twaalf dagen, en de tweede oorzaak is op 2026-09-08 mee uitgerold met de
  klantenportaalfunctie die de auditleider zelf gebouwd heeft.
- De minimale fix is klein en goed te overzien: twee kolomnamen toevoegen aan de bestaande
  `""→null`-lijst in `server/routes.ts:3445-3540`. Dat raakt geen enkel ander pad en is binnen een
  regressietest te vangen.
- De **echte** fix (een zod-schema op de PATCH-body, wat tegelijk BUG-084 sluit) is groter en hoort in
  de normale planning.

**Gevraagd besluit:** mag de minimale fix — de twee kolommen plus de bijbehorende regressietest én de
schema-drift-test die voorkomt dat de volgende kolom hetzelfde doet — nú als hotfix uitgevoerd worden,
buiten de audit om? Zo ja, dan hoort daar één afspraak bij: de audit blijft verder op HARD STOP en er
wordt niets anders meegenomen in die commit.

### 8.3 Performancepakket (voorstel — er is niets geoptimaliseerd)

Fase 19 heeft **gemeten en geanalyseerd, niet verbeterd**. Er is geen regel code gewijzigd. Het
onderstaande is een voorstel in volgorde van kosten-batenverhouding; elk punt is zelfstandig
uitvoerbaar. Bedenk bij elk getal dat het een **dev-modemeting** is: de verhoudingen kloppen, de
absolute waarden moeten op de productionbuild opnieuw vastgesteld worden.

1. **Batchladen in `getReservationsInDateRange`** (BUG-203) — het grootste effect voor het kleinste
   risico: haalt ~99 % van de 924 statements per maandweergave weg en daarmee de 1,3–4,9 s wachttijd.
   Het patroon bestaat al in hetzelfde bestand (`getAllReservations`, `database-storage.ts:1062-1103`),
   dus het is kopiëren, niet ontwerpen. Geen gedragswijziging, geen contractwijziging.
2. **Compressie aanzetten** (BUG-214) — één middlewareregel, `compression({ threshold: 1024 })`, of
   gzip/br in Traefik. Gemeten winst: 24–28× op de grote JSON-responses. **Controleer eerst of de
   Coolify/Traefik-laag in productie al comprimeert** — dat is hier niet geverifieerd en zou het hele
   punt kunnen wegnemen.
3. **Eén query key voor `/api/reservations` op de kalenderpagina** (BUG-204) — halveert de eerste
   weergave van de drukste pagina van 19,6 naar ~11,6 MB, puur clientzijdig, zonder enige
   API-wijziging. Daarbij hoort het gerichter maken van de socketinvalidatie (BUG-229).
4. **Statussync uit de GET-handlers** (BUG-217) — verwijdert schrijfacties van het heetste leespad. De
   aanroepen vanuit de mutatiepaden bestaan al; let wel op de samenhang met het besluit bij BUG-211,
   want de afleidingsregel zelf moet eerst kloppen.
5. **De headerafbeelding van de schadecheck vooraf schalen** (BUG-215) — verkleinen bij de upload tot
   ≤ 1200 px (JPEG q80, ~100 KB) of één keer converteren en cachen. Dat haalt 0,58 s CPU en 2,9 MB per
   PDF weg. **Let op:** dit verlaagt de printresolutie van de header; als de eigenaar daar eisen aan
   stelt, is de alternatieve route de generatie naar een `worker_thread` of een job-queue verplaatsen.
6. **Paginering en magere projecties op de lijstendpoints** (BUG-205) — de grootste structurele winst,
   maar het enige punt met een **contractwijziging**; daarom een besluit (§8.1) en niet zomaar een
   taak. Idem voor de projectie zonder blobkolommen bij de schadechecks (BUG-216), waarvan de
   projectiehelft wél meteen kan.
7. **Per-route JSON-bodylimieten** (BUG-218) en het weghalen van de per-rij-logging (BUG-227) — klein,
   goedkoop, en ze horen bij de eerste opruimronde.

**Wat expliciet géén onderdeel van dit voorstel is:** het herschrijven van de kalendercomponenten
(BUG-228). Die bevinding is statisch en ongemeten; er hoort eerst een meting met de React Profiler te
staan voordat er 4 244 regels kalendercode verbouwd worden.

### 8.4 Herstelprocedure — wat er organisatorisch bij hoort

Naast de technische fixes van BUG-197 tot BUG-200 vraagt het herstelpad een besluit over de
**procedure**, want de belangrijkste bevinding van fase 17 is niet dat er code stuk is, maar dat de
operator geen enkele manier heeft om te zien of een herstel werkelijk gelukt is:

1. **Een verificatiestap ná het herstel** die rijtellingen en sequences met de dump vergelijkt en het
   resultaat toont — niet alleen "success".
2. **Een gedocumenteerde noodprocedure** voor het geval BUG-197 toeslaat: wie heeft shell- en
   `psql`-toegang tot de productiedatabase, waar staan de veiligheidsback-ups, en hoe zet iemand er één
   terug? Vandaag is dat antwoord "de auditleider, handmatig" — en tijdens een incident is dat te laat.
3. **Een periodieke hersteltest** op een wegwerpdatabase, precies zoals fase 17 die nu één keer gedaan
   heeft. Zonder zo'n test is "wij hebben back-ups" een aanname, geen feit.

---

## 9. Niet gedekt

**Buiten scope van deze drie fases (per instructie of elders belegd)**
- De database `lvstest` en poort 5000 zijn nooit aangeraakt. De productiedatabase is in geen enkele
  fase benaderd — `lvs_audit` en `lvs_audit_bk` zijn klonen van de **dev**-database, dus codefouten
  gelden onverkort voor productie, maar élke datavondst moet daar opnieuw gemeten worden.
- Socket.IO/realtime (`socket.md`) en de volledige autorisatiematrix (fases 6-8).

**Niet uitgevoerd wegens destructiviteit of gedeelde infrastructuur**
- **Database-uitval** (fase 18): het stoppen van de lokale Postgres-service zou de dev-omgeving van de
  ontwikkelaar én de twee andere lopende auditactiviteiten platleggen. **Dit blijft het grootste
  openstaande gat in de E2E-dekking:** hoe de applicatie zich gedraagt wanneer de database wegvalt
  (in plaats van de server) is onbekend.
- **`restore-code`** (BUG-069) — destructieve tar-over-cwd plus `process.exit(0)`.
- **Bestandsherstel forceren** met `--force-local` — dat zou in de `uploads/` van de repo hebben
  geschreven, buiten de auditomgeving.
- **De RDW-APK-scan** (665 externe calls naar een publieke API) en een **back-uprun tijdens de
  performancemeting**.

**Niet meetbaar of niet beslisbaar in dit harnas**
- **De productionbuild.** Alle timings zijn dev-mode. Wat er in productie werkelijk uitkomt, is
  onbekend tot het daar gemeten is — dat geldt met name voor de vraag of Traefik al comprimeert.
- **Browser-rendertijden** (fase 19 had geen browser; fase 18 had er wel een, maar meet geen
  rendercycli). BUG-228 is daarom statisch en expliciet ongemeten.
- **Enter op het loginformulier** (E18-007) — het testgereedschap kan implicit form submission
  waarschijnlijk niet nabootsen; er is één handmatige controle nodig, zie §6.1.
- **Drag & drop in de kalender** — de pointersleep was niet betrouwbaar te reproduceren.
- **Printen** — de browserprintdialoog is niet waarneembaar in dit gereedschap; alle client-side
  printuitvoer blijft ongetest, net als in fase 14.
- **De barcodescanner (`/scan`)** — vereist een camera.
- **De bestandsrechten van back-ups binnen de Docker-deployment** — op deze host NTFS-geërfd; in de
  container is het wat het volume geeft.
- **Volle schijf** en **`pg_dump` ontbrekend tijdens runtime** — niet simuleerbaar zonder quotagereedschap
  respectievelijk een herstart.

**Openstaande meetvragen (eerst in productie beantwoorden)**
- Comprimeert de Coolify-/Traefik-laag de API-responses al? Zo ja, vervalt BUG-214 grotendeels en
  veranderen de getallen van BUG-204 en BUG-205 wezenlijk.
- Hoe lang duren een back-up en een herstel daar werkelijk, met de echte hoeveelheid uploads? De
  extrapolatie uit fase 17 zegt: bij 10 GB uploads kost élke run én élke veiligheidsback-up ~10
  minuten, en lekt elke run 10 GB naar `/tmp` (BUG-206).
- Hoeveel `uploaded-*`-back-ups staan daar in de applicatiemap in plaats van op het back-upvolume
  (BUG-200)?
- Hoeveel reserveringen hebben daar een `picked_up`-status met een toekomstige startdatum, en hoeveel
  van die voertuigen staan als `available` (BUG-211)?
- Staan er in productie rijen met een misvormde datum, die de reserveringspagina per direct zouden
  neerhalen (BUG-201/BUG-111)?
- Hoeveel medewerkers hebben in de afgelopen twaalf dagen tevergeefs geprobeerd een reservering te
  bewerken (BUG-202)? Dat is af te lezen uit de 400-responses in het requestlog.

---

In deze fases is **geen applicatiecode gewijzigd**, is er **niets gecommit**, is de applicatie **niet
in productie gedraaid** en is er **geen enkele optimalisatie geïmplementeerd** — het performancepakket
in §8.3, het hotfixvoorstel in §8.2 en de herstelprocedure in §8.4 zijn uitsluitend voorstellen. Fase
17 draaide volledig op de wegwerpomgeving `:5002` / `lvs_audit_bk` met een eigen `UPLOADS_DIR` en
`BACKUP_PATH`, en die omgeving is achteraf teruggezet op het goede back-uparchief; de scratchdatabases
zijn gedropt, de ACL-wijziging is ongedaan gemaakt, de `gunzip.exe`-shim is verwijderd en de
databaseinstelling is hersteld. Fase 18 deed alleen normale gebruikershandelingen door de browser (met
één opzettelijke serverherstart op `:5002`, ná fase 17). Fase 19 heeft de Postgres-statementlogging
aangezet en na afloop met `ALTER DATABASE … RESET` en `ALTER SYSTEM RESET` weer uitgezet en
geverifieerd; de ≈700 MB gerotaliseerde logbestanden onder `C:\Program Files\PostgreSQL\17\data\log`
zijn blijven staan en kunnen veilig verwijderd worden. Alle fixtures dragen de prefix `AUDIT-` of een
kenteken `AU-…-X` en zijn bewust blijven staan als bewijsmateriaal.

HARD STOP — STOP POINT 7
