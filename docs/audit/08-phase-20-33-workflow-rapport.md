# Fase 20–33 — geconsolideerd rapport (codekwaliteit, werkprocessen, bedrijfsketens, consistentie, verbetervoorstellen)

2026-09-11 · branch `feat/customer-portal` · samengevoegd uit `docs/audit/wip/p20-code-quality.md`
(CQ-001…030), `docs/audit/wip/p21-workflows.md` (werkstromen A–K, WF-001…024) en
`docs/audit/wip/p22-business-flows.md` (ketens 1–4, A-01…A-38 / B-01…B-08 / C-01…C-09 / D-01…D-06,
BF-001…031).

**Welke fases dit rapport dekt**

| Fase | Onderwerp | Bron |
|---|---|---|
| 20 | Codekwaliteit & architectuur (statisch) | `wip/p20-code-quality.md` |
| 21 / 23 / 24 / 25 / 29 | Werkprocessen, procesmapping, efficiëntie, menselijke fouten, foutherstel | `wip/p21-workflows.md` |
| 22 / 30 / 31 | Bedrijfsketens, dagsimulatie, statusconsistentie | `wip/p22-business-flows.md` |
| 26 / 27 / 28 | Automatisering, bulkacties, barcode, snelacties | `wip/p22-business-flows.md` §3 |
| 32 | Verbetervoorstellen (OPT-001…033) | dit rapport, §7 |
| 33 | Goedkeuringspoort | dit rapport, slot |

**Context — lees dit vóór elk getal**

- Gemeten tegen de auditserver `http://localhost:5001` (tsx dev mode) en database **`lvs_audit`**, een
  kloon van de DEV-database. Nooit poort 5000/5002, nooit productie. Fase 20 was volledig statisch.
- **Er is geen applicatiecode gewijzigd, er is niets gecommit en de applicatie is niet in productie
  gedraaid.** Er is in deze fases ook **geen enkele verbetering geïmplementeerd**.
- **Klik-, scherm- en veldtellingen zijn geteld uit code** (het gelukkige pad in de JSX), niet in een
  browser gemeten — fase 21 had geen browser. Telregel: 1 klik = één aanwijzerinteractie; een
  `<Select>` kost 2; een zoekbare combobox kost 2 klikken + 1 getypte zoekterm.
- **Alles wat "seconden", "per dag", "×50" of "tijdwinst" heet is een schatting** en is als zodanig
  gelabeld. Er staan geen gemeten tijdsduren in dit rapport.
- **Getallen uit de kloon zijn kloongetallen.** 362 achterstallige rijen, 788 poortrijen op 423 van
  675 voertuigen, 44 actieve onderhoudsblokken, 601 aangeboden voertuigen: dat is een meting van
  *deze kloon* (met de bekende datarommel BUG-143/144/145) en moet opnieuw gemeten worden tegen de
  echte database voordat er iets op gebouwd wordt. Het bewijst wel dát de software zulke rijen
  produceert.
- Bekende defecten worden **per BUG-id gerefereerd, niet herhaald** (`docs/audit/03…07`,
  BUG-001…BUG-230).
- **Een OPT is een voorstel, geen besluit.** Niets in §7 is gebouwd, gepland of toegezegd.

---

## 1. Voor de eigenaar

- **Een dag kost nu te veel klikken op de verkeerde plek.** Eén verhuring van intake tot inname is
  **≈22 klikken** (geteld uit code); bij 50 verhuringen per dag is dat ruim 1 100 klikken (schatting).
  Het scanscherm doet hetzelfde werk in 1–2 klikken, maar staat op navigatiepositie 3 en staat niet op
  het dashboard.
- **De app vertelt de medewerker niet wat er vandaag moet gebeuren.** Er is geen "Vandaag"-scherm: de
  medewerker opent elke ochtend 5 pagina's om zelf een dagbeeld te maken, terwijl alle gegevens al
  bestaan.
- **Er is een onzichtbare achterstand.** In de kloon zijn **423 van de 675 voertuigen** stil
  onverhuurbaar door 788 oude reserveringsrijen, en 426 van die rijen staan op géén enkel scherm.
  Tegelijk toont het dashboard 362 "achterstallige" rijen die iets anders meten.
- **"Beschikbaar" betekent vier verschillende dingen.** Het dashboard zegt 315 vrije auto's, het
  boekingsformulier zegt 593 voor volgende week. Wie vanaf het dashboard een offerte geeft, verkoopt
  de helft van de vloot niet.
- **De grootste vermijdbare risico's zijn stil.** Een contract dat níet gemaakt is meldt toch
  "Contract is gegenereerd"; een verstuurde mail laat geen enkel spoor na; een gewijzigde reservering
  laat het oude contract ongewijzigd staan; een auto die bewust uit de verhuur is gehaald
  (`not_for_rental`) staat na één werkplaatsbezoek weer gewoon in de verhuur.
- **De app kan veel meer onthouden dan zij nu doet.** Postcode → adres, KvK → bedrijfsgegevens, RDW bij
  bulkimport, een vergelijkbare vervanger voorstellen, een huur afsluiten bij inname, een reservevoertuig
  op `verhuurd` zetten zodra het de deur uit gaat: dat zijn allemaal dingen die de medewerker nu uit
  het hoofd moet doen en die de software al bijna kan.
- **Twee werkstromen zijn al goed en zijn het model voor de rest**: de bekeuringenafhandeling (OCR
  leest, systeem stelt voor, mens bevestigt, alles omkeerbaar — ≈5 klikken) en het scanpaneel (één
  fysieke handeling levert het juiste object én de juiste vervolgactie).
- **Wat een besluit van u vraagt** (de 16 BUSINESS DECISION-voorstellen in §7, samengevat): wat
  "beschikbaar" in huis betekent; of een huur automatisch afgesloten wordt bij inname; of een auto in
  de werkplaats geblokkeerd of alleen gewaarschuwd wordt; welke velden verplicht zijn om te mogen
  verhuren; wat er met de prijs gebeurt als de datums wijzigen; wat er met het al verstuurde contract
  gebeurt als de boeking wijzigt; welke gebeurtenissen de portaalklant te horen krijgt; en of een
  annulering automatisch doorwerkt of expliciet gevraagd wordt.

---

## 2. Codekwaliteit (fase 20)

Statisch, commit `9825c29a`. Bewijs per regel staat in `wip/p20-code-quality.md`.

### 2.1 Inventaris

| Meting | Waarde |
|---|---|
| TypeScript LOC (`server` + `client/src` + `shared`) | **127 946** (server 35 273 / 102 modules · client 88 888 / 253 bestanden · shared 3 785 / 16) |
| `tsc --noEmit` | **0 fouten**; 0 `@ts-ignore`/`@ts-expect-error`/`@ts-nocheck`; 0 echte `TODO`/`FIXME`/`HACK` |
| `any`-voorkomens | **711** (server 392, client 310, shared 9) |
| `console.*` | server **982**, client **307** — geen loggerabstractie |
| HTTP-routeregistraties in `server/**` | **382**, waarvan **119** in `server/routes.ts` |
| async handlers **zonder enige `try`** | **96 van 372 (26 %)** |
| `db.transaction(...)` | **9** aanroepplekken; `IStorage` telt 203 methodes |
| Testbestanden | **25**, alle serverzijdig; **0 clienttests**; 36 van 102 productiemodules geraakt |
| Grootste bestand / functie | `server/routes.ts` 7 758 LOC, waarvan **7 664 in één functie** (`registerRoutes`, `:96-7759`) |
| Circulaire afhankelijkheden (madge, mét tsconfig-paths) | **9** (8 client, 1 server) |
| `npm audit` | 70 kwetsbaarheden — 3 kritiek, 23 hoog, 36 gemiddeld, 8 laag |

Grootste bestanden na `routes.ts`: `database-storage.ts` 4 476 · `reservations/calendar.tsx` 4 244 ·
`vehicle-details.tsx` 3 978 · `reservation-form.tsx` 3 110 · `settings-panel.tsx` 2 615 ·
`reports/index.tsx` 2 564 · `shared/schema.ts` 2 110.

### 2.2 Dubbele implementaties (verdicht)

| # | Categorie | Aantal implementaties | Gevolg in één zin | BUG-ids |
|---|---|---|---|---|
| D1 | `formatLicensePlate` | **6**, 4 algoritmes (client 14 sidecodes, beide server-PDF-kopieën 12) | sidecode 13/14 staat goed op het scherm en ongeformatteerd op het contract | nieuw |
| D2 | Padresolutie uploads | `getUploadsDir()` 21× vs **79 harde `process.cwd()`-joins** | met `UPLOADS_DIR` gezet splitst het bestandssysteem in tweeën | BUG-026, 029, 169, 198, 200 |
| D3 | Reserveringsstatus schrijven | transitietabel gehandhaafd door **1 van 5** schrijvers | de bewerkroute accepteert elke status | BUG-159, BUG-019 |
| D4 | "Is dit voertuig vrij" | **5** losse definities | `POST /api/reservations` boekt een `not_for_rental`-auto die de picker verbergt | BUG-006/106/107/159/160 |
| D5 | Keuze schadecheck-sjabloon | **4** regels, 1 inhoudsbewust | twee paden kiezen een leeg sjabloon en leveren een blanco PDF | BUG-166, 181, 183 |
| D6 | Registratie gegenereerd document | **15** `createDocument`-plekken, **2** mapconventies | twee contracten op één dag delen één bestand | BUG-027, 165, 184, 190 |
| D7 | Contractrenderers | **3** levend + 1 dood | twee van de drie kunnen alleen fout of geen PDF opleveren | BUG-163, 164 |
| D8 | Sjabloon-achtergrond upload | **6** bijna identieke routes, **16** multer-instanties | maar één familie controleert de extensie-whitelist | BUG-179, 180 |
| D9 | `template.fields` JSON-parsing | **13** kopieën, 5 met guard | de 8 ongeguarde gooien op een al geparste jsonb-waarde | BUG-168-klasse |
| D10 | `""` → `null` coercie | **5** handgeschreven blokken, al gedrift | elke bewerk-opslag van een reservering faalt | BUG-202 |
| D11 | Id-parsing | **143** kale `parseInt` vs 3 losse `idParam`-helpers | `NaN` bereikt Postgres → 500 in plaats van 400 | BUG-103, 088 |
| D12 | Adminpoort | **2** `requireAdmin` met verschillende 401-body | beleidswijziging mist de registratieroute | 01a |
| D13 | Geld-/datumformattering | geld **7**, datum **9** | scherm, PDF en e-mail hanteren andere conventies | BUG-192, 223 |
| D14 | Herstelpaden | **2** voor database, **2** voor bestanden | de paden verschillen in veiligheidscontroles én doelmap | BUG-198, 207 |
| D15 | Conflict → HTTP-status | 409, 400 óf 500 voor dezelfde situatie | één pad routeert op substring van een Engelse foutmelding | BUG-148-klasse |

### 2.3 Circulaire afhankelijkheden

**9 cycli.** Acht daarvan vormen één naaf-en-spaak rond
`client/src/hooks/use-portal-dialogs.tsx` ↔ de portaaldialogen — goedaardig onder een bundler, maar het
maakt code-splitting en geïsoleerd testen onmogelijk. De negende is een **runtime**-cyclus:
`server/storage.ts:301` ↔ `server/database-storage.ts:52` (geen `import type`, dus esbuild houdt de
module-edge). Het werkt alleen omdat `export const storage = new DatabaseStorage()` de laatste regel
van `storage.ts` is; elke module-initialisatie erboven zou in productie op een half geëvalueerde
module stuiten. Fix: één woord (`import type`).

Fan-in/fan-out: `server/routes.ts` is tegelijk hoogste fan-out (45), grootste bestand en grootste
functie — dat is het koppelingsbrandpunt. `shared/schema.ts` heeft de hoogste fan-in (63).

### 2.4 CQ-bevindingen

| Id | Ernst | Categorie | Bevinding (één regel) | Gerelateerde BUGs |
|---|---|---|---|---|
| CQ-001 | HIGH | separation | 96 async handlers zonder `try`; elke rejection bereikt `unhandledRejection` → `gracefulShutdown()` → `process.exit(0)` | **BUG-002, BUG-061** (dit is hun gezamenlijke oorzaak) |
| CQ-002 | HIGH | complexity | `registerRoutes` = 7 664 LOC, 119 routes, 7 multer-configs, 0 tests | — |
| CQ-003 | HIGH | duplication | 79 `process.cwd()`-joins naast de gedocumenteerde `getUploadsDir()` | BUG-026, 029, 169, 198, 200 |
| CQ-004 | HIGH | duplication | 6 × `formatLicensePlate`, 4 algoritmes, 12 vs 14 sidecodes | — (nieuw) |
| CQ-005 | HIGH | duplication | statusmachine door 1 van 5 schrijvers gehandhaafd | BUG-159, BUG-019 |
| CQ-006 | HIGH | duplication | 5 antwoorden op "is dit voertuig vrij in deze periode" | BUG-006/106/107/159/160 |
| CQ-007 | HIGH | inconsistency | 143 kale `parseInt(req.params.x)` vs 3 gedupliceerde helpers | BUG-103, BUG-088 |
| CQ-008 | HIGH | separation | 15 `createDocument`-plekken, elk met eigen map/naam/versie | BUG-027, 165, 184, 190 |
| CQ-009 | HIGH | inconsistency | 25 handgeschreven lege-string-coercions per route, al gedrift | BUG-202 |
| CQ-010 | MEDIUM | duplication | 4 selectieregels voor één schadecheck-sjabloon | BUG-166, 181, 183 |
| CQ-011 | MEDIUM | dead-code | 6 van 12 exports van de statusmachine dood; `getStatusOnReturn` geïmporteerd maar nooit aangeroepen | BUG-109, BUG-211 |
| CQ-012 | MEDIUM | dead-code | `generateInteractiveDamageCheckPDF` (291 LOC) heeft nul aanroepers | BUG-163 |
| CQ-013 | MEDIUM | dead-code | exact één onbereikbare route in 382 registraties | BUG-088 |
| CQ-014 | MEDIUM | dependency | 10 gedeclareerde runtime-dependencies met nul imports (`tar` = CRITICAL) | — |
| CQ-015 | MEDIUM | dead-code | 6 terugkerende-reservering-kolommen schrijfbaar, generator bestaat niet | — |
| CQ-016 | MEDIUM | coupling | 9 circulaire afhankelijkheden, waarvan 1 runtime-cyclus in de server | — |
| CQ-017 | MEDIUM | complexity | `calendar.tsx` 4 082 LOC in één component; 0 clienttests | BUG-203, 204 |
| CQ-018 | MEDIUM | separation | 129 rauwe `fetch()` naast 313 `apiRequest`; CSRF teruggepatcht via `window.fetch` | BUG-212 |
| CQ-019 | MEDIUM | inconsistency | controlflow op substring van Engelse foutteksten; 3 responseshapes | BUG-148 |
| CQ-020 | MEDIUM | performance | `GET /api/vehicles` en `/status/breakdown` doen een volledige tabel-**schrijf** vóór het lezen | BUG-217 |
| CQ-021 | MEDIUM | maintenance | 66 van 102 productiemodules ongetest; de complete verhuurkern heeft geen enkele test | BUG-202 |
| CQ-022 | MEDIUM | dependency | 3 × CommonJS `require()` in een ESM-build; ~50 `await import` in hot paths | BUG-207 |
| CQ-023 | MEDIUM | dead-code | Replit-resten: sidecar-endpoint, 2 instanties, onbeveiligde route, CORS, UI-optie | — |
| CQ-024 | LOW | inconsistency | 4 error-envelopes (`{message}` 665× / `{error}` 98× / `{success,message}` 16× / globale handler) | BUG-148 |
| CQ-025 | LOW | inconsistency | 196 hardgecodeerde UI-strings; de eigen detector draait nergens | BUG-223 |
| CQ-026 | LOW | inconsistency | 4 datumconventies; `date-utils.ts` heeft 6 van 7 exports dood | BUG-224 |
| CQ-027 | LOW | duplication | 6 identieke achtergrond-uploadroutes, 16 multer-instanties, 3 strengheden | BUG-179, 180 |
| CQ-028 | LOW | duplication | twee `requireAdmin`-definities met verschillend gedrag | — |
| CQ-029 | LOW | maintenance | 982 server-`console.*`, 307 client, geen logger, geen redactie | — |
| CQ-030 | LOW | dead-code | ~25 ongebruikte exports, waaronder een complete, nooit aangesloten sessie-revocatiefunctie | — |

### 2.5 Wat we NIET moeten refactoren

Fase 20 noemt expliciet negen dingen die eruitzien als rommel en het niet zijn. Kort:

1. `shared/transport-spare-status.ts` — bewust gecentraliseerde TBD-afleiding; het **model**, niet het probleem.
2. De 22 al afgesplitste routemodules onder `server/routes/` — consistent, `RouteDeps`, geen permissiegaten.
3. `server/services/portal-*` en `services/cjib/*` — 19 modules, allemaal getest; de beste code in de repo.
4. De camelCase-payloadnaamgeving — geverifieerd consistent, nul snake_case-sleutels.
5. De 8 clientcycli rond `use-portal-dialogs.tsx` — echt, maar goedaardig; 8 bestanden raken voor nul gedragswinst.
6. `shared/schema.ts` (2 110 LOC) — 63 afhankelijken; splitsen levert 63 importdiffs en geen winst.
7. `cn()` en de shadcn/ui-primitieven die ts-prune aanwijst — bibliotheekoppervlak.
8. De fallback-padlogica in `documents/view|download` — dat is de enige reden dat oude rijen nog leesbaar zijn; **eerst** CQ-003 oplossen en de rijen migreren.
9. `archiver` voor het schrijven van back-ups — werkt en is end-to-end geverifieerd in fase 17.

---

## 3. Werkprocessen (fase 21 / 23 / 24 / 29)

### 3.1 Efficiëntiesamenvatting per werkstroom

Alle klik-, scherm- en veldtellingen zijn **geteld uit code**; alle frequenties en tijden zijn
**schattingen**.

| Werkstroom | Kliks | Schermen/dialogen | Zoekacties | Getypte velden | Oordeel |
|---|---|---|---|---|---|
| **A** intake → afsluiten (bestaande klant) | **≈22** | 4–6 | 2 | 4–6 | **Zakt.** ≈1 100 kliks/dag bij 50 verhuringen (schatting). De contractoverdracht (4 kliks sluiten-heropenen-scrollen) en de altijd vurende opmerkingenbevestiging kosten het meest. |
| **A** met nieuwe klant | **≈25** | 5–7 | 2 | ≈12 | Zakt. |
| **B** beschikbaarheidsvraag | **5** (+1 om af te breken) | 1 (een *aanmaak*dialoog) | 0 | 2 datums | **Zakt hard.** Een leesvraag vereist een schrijfformulier, en het dashboard geeft een ander antwoord (315 vs 593, gemeten). |
| **C** boeking wijzigen | **7** als het werkte | 3 | 1 | 1 | **Kapot, niet traag** (BUG-202). De overgebleven paden slaan validatie over of overschrijven collega's. |
| **D** transportdag (10 rijen) | **11** bulk / 20 los | 1 | 1 | 0 | **Slaagt** — de enige werkstroom met bulkacties. De TBD-afdrukblokkade kost 4 extra kliks. |
| **E** naar de werkplaats en terug | **10–16** | 3–4 | 1 | 3–5 | Lage frequentie, hoogste gevolgen. Drie ingangen, twee uitgangen die verschillende datums schrijven. |
| **F** dagstart | **≈5** over **5 pagina's** | 5 | 0 | 0 | **Zakt.** Er is geen dagbeeld; de medewerker bouwt het elke ochtend zelf. |
| **G** documenten | 0 genereren / **3** vinden / **≈9** mailen / **6+** corrigeren | 2–4 | 0 | 2 | Genereren is gratis; *verifiëren* en *corrigeren* kan niet. |
| **H** bekeuringen | **≈5** | 2 | 0 | 0 | **Slaagt — beste in het product.** |
| **I** portaalaanvragen | **≈8** | 2 | 0 | 1 | **Slaagt.** |
| **J** voertuigintake | **≈20** (4 tabwissels, 46 mogelijke velden) | 1 (5 tabs) | 0 | 1 + rest | Lage frequentie; RDW doet het zware werk, de 3-verplichte-velden-regel schuift kosten door. |
| **K** scannen | **1–2** | 1 | 0 | 0 | **Slaagt — het juiste patroon.** |

**Dwarsdoorsnede (geteld uit code)**: nul operationele sneltoetsen (de enige vier
sneltoetshandlers zitten in sjablooneditors) · bulkacties op precies één scherm · de globale zoekbalk
vuurt **3 requests per toetsaanslag** zonder debounce (een kenteken van 8 tekens = 21 API-calls) ·
twee tegenstrijdige definities van "beschikbaar" · de twee meest frequente handelingen (Ophalen,
Innemen) hebben géén dashboard-ingang terwijl "RDW APK-datums scannen" een primaire tegel heeft · het
grootste formulier verstuurt alle 23 velden bij elke bewerking.

### 3.2 Menselijke fouten (fase 25, verdicht)

Beschermingsniveaus in voorkeursvolgorde **Automatisering > Validatie > Waarschuwing > Instructie > Geen**.

| # | Fout | Huidige bescherming | Voorgesteld niveau |
|---|---|---|---|
| 25.1 | Verkeerde klant op een reservering | **Geen** (alleen telefoon/e-mail/plaats onder de optie) | Validatie + waarschuwing bij ontbrekend e-mailadres |
| 25.2 | Verkeerd voertuig | Deels: blacklist gefilterd, opmerkingendialoog. **Geen** voor werkplaatsstatus (BUG-109) | Automatisering (filteren) + validatie bij ophalen |
| 25.3 | Verkeerde reservering opgehaald/ingenomen | Alleen tonen van kenteken/voertuig/klant — **niet de huurperiode** | Validatie: periode + contractnummer tonen |
| 25.4 | Verkeerde datums | Goed op het formulier; **geen** op het sleeppad (BUG-106) en **geen** bij open einde | Validatie serverzijdig op élk schrijfpad |
| 25.5 | Dubbele reservering | **Validatie werkt** op het hoofdpad (409, geverifieerd) | Uitbreiden naar de overige schrijfpaden |
| 25.6 | Dubbele klant/chauffeur | **Geen** — twee identieke klanten (naam + e-mail) beide aangemaakt, ids 1302/1303 | Waarschuwing, liefst validatie op e-mail |
| 25.7 | Vergeten statuswijziging (huur nooit afgesloten) | **Geen**; 362 achterstallige rijen in de kloon | Automatisering bij inname + waarschuwing op de daglijst |
| 25.8 | Te vroeg/te laat opgehaald | **Geen** — start 2026-10-01, opgehaald 2026-09-11, 200 OK (BUG-211) | Waarschuwing + eigenaarsbesluit over de startdatum |
| 25.9 | Vergeten gerelateerd record (vervanger, TBD) | Alleen een afdrukblokkade | Waarschuwing op de daglijst; de toast moet de dialoog openen |
| 25.10 | Document te vroeg of niet gegenereerd | **Geen** — de toast claimt succes, de `catch` slikt de fout | Validatie: document-id teruggeven, anders retry tonen |
| 25.11 | Informatie naar de verkeerde klant | Validatie in de documentmaildialoog; **geen** bij APK-herinneringen (BUG-170) | Automatisering + validatie |
| 25.12 | Verouderde onderhoudsvlag / vlag kwijt | **Geen** in beide richtingen | Automatisering (afleiden uit het blok) + waarschuwing |
| 25.13 | Verouderde vervanger | **Geen** (BUG-112/115/118) | Automatisering: vrijgeven bij afsluiten |
| 25.14 | Voertuig omgezet BV → Opnaam als bijwerking | **Geen** — het gebeurt, daarna volgt een toast | Validatie: eerst vragen |
| 25.15 | Bevestigingsmoeheid bij opmerkingen | Waarschuwing die **altijd** vuurt, ongeacht ouderdom | Waarschuwing behouden maar scopen |

### 3.3 Herstelmatrix (fase 29)

Elke rij is tegen de auditserver uitgevoerd.

| Vergissing | Zichtbaar? | Herstelbaar? | Uitkomst van het herstel |
|---|---|---|---|
| Verkeerde klant | ja | **API ja, UI nee** (`PATCH` 200; "Bewerken" faalt altijd, BUG-202) | schoon |
| Verkeerd voertuig | ja | API ja via `/basic` (volledige body vereist) | schoon, maar lost-update-risico (BUG-172) |
| Verkeerde datums (geboekt) | ja | ja | schoon |
| Verkeerde datums (al opgehaald) | ja | **ja en ongecontroleerd** | werkt, maar niets waarschuwt dat een getekend contract nu afwijkt |
| Onbedoeld opgehaald | ja | **ja, en de UI heeft het** ("Terugzetten naar geboekt", dubbele bevestiging) | **gedeeltelijk**: voertuig blijft `rented`, kilometerstand blijft fout, contract-PDF blijft hangen; het contract*nummer* wordt wel vrijgegeven |
| Onbedoeld ingenomen | ja | **API ja, UI nee** | **schadelijk**: `end_date` wordt **NULL** — een gedateerde huur wordt stil een open-einde-huur |
| Onbedoeld geannuleerd | ja | **inconsistent**: `/status` weigert (400), `PATCH /:id` doet het (200); geen knop | de waarborg bestaat op één route en ontbreekt op de andere |
| Onbedoeld verwijderde reservering | **nee** | **geen enkele route** — de prullenbak kent alleen `vehicle` en `fine` | **onherstelbaar zonder databasetoegang**; de rij staat er nog, soft-deleted. Het ergste herstelgat dat is gevonden |
| Verkeerde vervanger | ja | API ja, UI nee | werkt, maar de wissel doet **geen** conflictcontrole |
| Onbedoeld verwijderd voertuig | ja (met impactvoorbeeld + kenteken typen) | **ja, en het werkt** | terugzetten is **één klik zonder bevestiging**, doet geen conflictcontrole (BUG-108/110) en is `requireAdmin` — wie de fout maakte kan hem meestal niet herstellen |

**Het sterkste punt**: de auditlog legt élke herstelactie vast met veldniveau `from`/`to` en de
gebruikersnaam. **Het gat**: je kunt die vraag niet over één record stellen —
`GET /api/audit-logs?resourceId=3563` gaf **906** rijen (filter genegeerd) en `?search=3563` gaf **0**.

---

## 4. Bedrijfsketens (fase 22 / 30)

### 4.1 Keten 1 — KLANT → RESERVERING → DOCUMENTEN → OPHALEN → INNEMEN → AFSLUITEN

| Id | Breuk | Bewijs |
|---|---|---|
| B1-1 | Stap "voertuig bevestigen/wijzigen" is **onmogelijk via het normale formulier** | BUG-202; workarounds slepen (BUG-106) of `/basic` |
| B1-2 | "Versturen" faalt in ~20 ms en laat **nergens** een spoor: geen `email_logs`, geen notificatie, geen auditregel | BUG-155 |
| B1-3 | Inname **overschrijft de afgesproken einddatum** met vandaag; de prijs blijft staan (3 dagen prijs, 1 dag looptijd) | BUG-019 |
| B1-4 | Ophalen genereert een **tweede, byte-identiek contract** (documenten 554 + 555) | BUG-027-familie |
| B1-5 | `returned` wordt nooit `completed`; na 3 dagen blokkeert die rij alle toekomstige boekingen op die auto | BUG-113 |
| B1-6 | Een boeking die vandaag dekt zet het voertuig meteen op `rented`, terwijl de sleutels nog aan het bord hangen | §5.2 definitie 3 |

### 4.2 Keten 2 — TRANSPORT (aanvraag → planning → uitvoering → documenten)

| Id | Breuk | Bewijs |
|---|---|---|
| B2-1 | Het **scannen van de vervanger toont niets** — geen reservering, geen transport (de reservering lag 3 dagen vooruit, `upcomingReservation: null`) | keten 2 stap 10' |
| B2-2 | Transport afronden **reset de werkplaatsvlag** `needs_service` → `ok` en wist de notitie, precies wanneer de auto fysiek bij de garage aankomt | keten 2 stap 13 |
| B2-3 | Na de omruil staan **twee huren open** voor één klant en lezen beide auto's `rented` | keten 2 stap 15 |
| B2-4 | Transportdatum wijzigen laat de vervanger op de oude dag staan; annuleren laat hem geboekt | BUG-114, BUG-115 |
| B2-5 | De TBD-afdrukblokkade is een doodlopende weg: de toast noemt het probleem maar opent de toewijzingsdialoog niet | `delivery/dashboard.tsx:283-292` |

Het goede nieuws: `POST /api/transports` met `spareRequired` doet **wel** het juiste — placeholder
aangemaakt, origineel gevlagd, TBD-wachtrij bijgewerkt. Dat is de best geautomatiseerde stap in de app.

### 4.3 Keten 3 — ONDERHOUD (probleem → onbeschikbaar → vervanger → reparatie → weer beschikbaar)

| Id | Breuk | Bewijs |
|---|---|---|
| B3-1 | Een vervanger die **fysiek bij de klant is** leest `available` en wordt opnieuw aangeboden: de widgetknoppen schrijven alleen `spare_vehicle_status`, de reservering blijft `pending` | keten 3 stap 5 |
| B3-2 | Eén reparatie afsluiten kost **drie handelingen in twee schermen**, in een volgorde die niets afdwingt | keten 3 stap 6/6'/7 |
| B3-3 | `return-from-service` schrijft vandaag in `end_date` ongeacht `start_date` → **einddatum vóór startdatum** | BUG-019-klasse, voedt BUG-201 |
| B3-4 | Markeren voor service, blok aanmaken en vervanger toewijzen leverden **nul** portaalnotificaties op | BUG-134 |

### 4.4 Keten 4 — DOCUMENTEN (aanmaken → genereren → corrigeren → opnieuw genereren → afdrukken → versturen)

| Id | Breuk | Bewijs |
|---|---|---|
| B4-1 | Prijs of datums corrigeren laat het **al gegenereerde contract ongewijzigd en ongemarkeerd** staan (PDF zegt € 225, boeking zegt € 270) | keten 4 stap 4' |
| B4-2 | Het versienummer staat **in de typekolom** (`"Contract (Unsigned) 2"`); code die op `document_type` filtert ziet er maar één | keten 4 stap 5 |
| B4-3 | Twee genereerknoppen registreren hun output nooit in `documents` | BUG-165 |
| B4-4 | Versturen: zelfde stille mislukking als B1-2 | BUG-155 |

### 4.5 Dagsimulatie (fase 30) — doodlopende wegen

| # | Doodlopende weg | Bewijs |
|---|---|---|
| DE-1 | Het standaard bewerkformulier kan niet opslaan; elke correctie is een workaround en de kortste dubbelboekt | BUG-202 + BUG-106 |
| DE-2 | 63 % van de vloot is onverhuurbaar en de blokkerende rijen staan op geen enkel scherm (788 rijen / 423 van 675 voertuigen, kloon) | BUG-040/113/129 |
| DE-3 | "Versturen" is een no-op die nooit iets rapporteert | BUG-155 |
| DE-4 | Een contract dat niet meer klopt met zijn eigen reservering is niet te onderscheiden van een goed contract | B4-1 |
| DE-5 | Een reparatie afsluiten kost drie handelingen in twee schermen | B3-2 |
| DE-6 | Een vervanger die bij de klant staat leest `available` en is opnieuw te boeken | B3-1 |
| DE-7 | Na een pechomruil bestaan twee huren en twee `rented`-auto's voor één klant, en de werkplaatsvlag is gewist | B2-2, B2-3 |
| DE-8 | Het scanpaneel valt op 5 van de 14 acties uit de scanmodus | C-01 |
| DE-9 | De sleutelkastaudit levert een resultaat op dat niet bewaard, afgedrukt of geëxporteerd kan worden | C-04 |
| DE-10 | Er is geen enkel "openstaande punten"-oppervlak | §4.3 van p22 |
| DE-11 | Inname herschrijft stil de afgesproken einddatum en de prijs volgt niet | BUG-019, A-10 |
| DE-12 | Een auto met "moet gerepareerd worden" kan verhuurd worden en de vlag wordt door de verhuring vernietigd | A-19 |
| DE-13 | Een auto die bewust uit de vloot is gehaald wordt na elk werkplaatsbezoek weer verhuurbaar | A-25b |

**Ochtenddashboard, gemeten**: `"Achterstallige verhuringen"` 362 rijen / 1 482 KB; de vervangerswidget
haalt náást zijn eigen endpoint de **vier volledige tabellen** op — **≈9 700 KB voor één widget**;
`"Reserveringskalender"` 443 rijen / 1 523 KB / **835 ms**; `"Aankomende reserveringen"` is hard
begrensd op **5 rijen** en sluit TBD-vervangers uit. Transporten, onderhoud (155 rijen beschikbaar) en
portaalaanvragen staan **niet** op het dashboard.

---

## 5. Consistentie (fase 31)

### 5.1 Weet elk subsysteem van elke status? (verdicht)

| Status | Beschikbaarheids­lijsten | Boekingspoort | Transporten | Dashboard | Documenten | Portaal | Kalender |
|---|---|---|---|---|---|---|---|
| Voertuig `in_service` | **deels** — de lijst zónder datums filtert `maintenanceStatus` helemaal niet (gemeten: 2 werkplaatsauto's in "klaar om te huren") | **nee** (boeking 201) | **deels** — omruil zet de vlag, afronden **wist** hem | **nee** | nee | ja (alleen `picked_up`) | ja |
| Voertuig `needs_fixing` | ja | **nee** — boeken 201, ophalen 200, en na inname is de vlag **weg** | nee | deels | nee | nee | deels |
| Voertuig `not_for_rental` | ja — **maar de vlag overleeft geen werkplaatsbezoek** | deels (boeken 201, ophalen 400) | nee | deels | nee | nee | deels |
| Reservering `cancelled` | ja | ja | **nee** (BUG-112) | deels | n.v.t. | ja maar stil (BUG-134) | ja |
| Reservering `picked_up` | **deels** — afgeleid uit datumdekking, niet uit status (BUG-211) | ja | ja | ja | ja | ja | ja |
| Vervanger toegewezen | **nee** — `spare_vehicle_status='picked_up'` terwijl de reservering `pending` is en de auto `available` | deels | ja | ja | deels | deels | ja |
| Klant op blacklist | n.v.t. | ja (server + client) | **nee** | nee | n.v.t. | ja | nee |
| Klant verwijderd | n.v.t. | **nee** — harde `DELETE`, geen FK; gemeten: **4 reserveringen wijzen naar een niet-bestaande klant** | deels | nee | nee (`null null`) | **ja, destructief** (`ON DELETE CASCADE` op het portaalaccount) | nee |
| Voertuig in de prullenbak | ja | **nee** — gemeten: **262 reserveringen wijzen naar een niet-bestaand voertuig**; terugzetten doet geen conflictcontrole | **destructief** (transporten worden gecascadeerd verwijderd) | nee | nee | deels | nee — dit is het incident van 2026-08-25 |

### 5.2 Tegenstrijdige definities van dezelfde status

**(a) "Beschikbaar" heeft vier implementaties die het oneens zijn.**

| # | Implementatie | Regel | Onenigheid |
|---|---|---|---|
| 1 | `getAvailableVehicles()` — dashboardwidget | `availability_status='available'` + geen dekkende reservering | kijkt **niet** naar `maintenance_status` → werkplaatsauto's tellen als "klaar om te huren" |
| 2 | `getAvailableVehiclesInRange()` — boekingsformulier en elke vervangerdialoog | alle voertuigen minus datumconflicten, daarna filteren op `in_service`/`not_for_rental`/`needs_fixing` | negeert `rented`/`scheduled` (bewust) én **negeert onderhoudsblokken** → een auto die in de garage staat wordt aangeboden en boeken geeft 201 |
| 3 | `syncVehicleAvailabilityWithReservations()` — bij elke schrijfactie **en bij elke `GET /api/vehicles`** | `rented` als een niet-geannuleerde reservering **op datum** vandaag dekt | keyt op datums, niet op status → geboekt-voor-vandaag = `rented`, opgehaald-vóór-startdatum ≠ `rented` |
| 4 | `calculateCorrectStatus()` | `rented` als een reservering **`picked_up`** is | **dode code, wordt nooit aangeroepen — en het is de enige die klopt** |

Gemeten gevolg: `GET /api/vehicles/available` = **315**, met datums voor volgende week = **593**.

**(b) `returned` vs `completed`.** Inname laat de rij altijd op `returned`; niets duwt hem naar
`completed`. Drie subsystemen zijn het dan oneens: twee behandelen `returned` als afgerond, maar de
boekingspoort sluit alleen `completed` en `cancelled` uit — dus een `returned`-rij **blokkeert alle
toekomstige boekingen** op die auto (BUG-113).

**(c) Twee definities van "achterstallig".** Het scherm toont `status='picked_up' AND end_date < today`
(362 rijen); de poort gebruikt `end_date < today−3 AND status NOT IN ('completed','cancelled')`
(788 rijen op 423 voertuigen). **Scherm en poort tonen nooit dezelfde verzameling.**

**(d) `active`/`pending`/`scheduled`/`in` vallen buiten de statusmachine.** `VALID_RESERVATION_TRANSITIONS`
kent alleen `booked`, `picked_up`, `completed`, `cancelled`, `returned`, maar vervangers worden als
`pending` aangemaakt en onderhoudsblokken als `active`. `VALID_RESERVATION_TRANSITIONS['pending']` is
`undefined` → **geen enkele overgang uit `pending` is geldig** (BUG-129).

**(e) `maintenanceStatus` op het voertuig vs op het blok.** Twee kolommen, dezelfde naam, andere
woordenschat (`ok|needs_service|in_service` vs `scheduled|in|out`), nooit gesynchroniseerd; een derde
woordenschat wordt defensief geaccepteerd in `getVehicleStatusContext`.

**(f) `spareVehicleStatus` vs de status van de vervangingsreservering.** Twee onafhankelijke ladders.
`shared/transport-spare-status.ts` bestaat juist om die drift te stoppen — maar het **onderhouds**pad
gebruikt het niet.

**(g) `availability_status` wordt door drie niet-verwante paden geschreven (nieuwe bevinding).**
Gemeten reeks:

```
available      + maintenance-status in_service  -> needs_fixing / in_service
needs_fixing   + maintenance-status ok          -> available    / ok
not_for_rental + maintenance-status in_service  -> needs_fixing / in_service
needs_fixing   + maintenance-status ok          -> available    / ok      <-- het not_for_rental-besluit is weg
```

Eén kolom betekent drie dingen ("handmatig kapot gemeld", "er loopt een onderhoudsblok", "bijwerking
van de reparatievlag"), en **een auto die bewust uit de verhuur is gehaald — verkocht, afgeschreven,
verzekering verlopen — komt na elk willekeurig werkplaatsbezoek stil terug in de verhuurbare pool.**
`getStatusOnMaintenanceEnd` bewaart `not_for_rental` expliciet — en wordt nooit aangeroepen.

---

## 6. Automatisering, bulk en barcode (fase 26–28)

62 kansen gecatalogiseerd (A-01…A-38 + A-25b, B-01…B-08, C-01…C-09, D-01…D-06). Verdicht:

### 6.1 Automatische gegevens (A-01…A-13)

| Thema | Wat nu handwerk is | Wat al bestaat en ongebruikt blijft |
|---|---|---|
| Klantgegevens | KvK, postcode→adres, BTW-nummer worden volledig getypt; alleen `name` is verplicht | `server/geocoding.ts` lost Nederlandse adressen al op, maar hangt alleen aan de afstandschatting |
| Voertuiggegevens | De **bulk-kentekenimport belooft RDW-gegevens in het Nederlandse scherm en schrijft `"Unknown"`** | `server/utils/rdw-api.ts` bestaat en werkt; de nachtelijke scan leest alleen `apkDate` |
| Berekeningen | De prijs stopt permanent met herberekenen na één handmatige wijziging; open-einde-huren krijgen **geen prijs**; de server valideert de prijs nooit | — |

### 6.2 Automatische beschikbaarheid, status en gerelateerde records (A-14…A-32)

- Een **onderhoudsblok is onzichtbaar voor het boekingspad** (gemeten: boeken midden in een actief blok → 201 zonder waarschuwing).
- Er is **geen conflicten- of openstaande-punten-scherm**; `/api/conflicts`, `/api/dashboard`, `/api/tasks` bestaan niet (de SPA-catch-all antwoordt 200 HTML).
- `needs_fixing` wordt door de verhuurcyclus vernietigd; `not_for_rental` wordt pas bij het ophalen geweigerd; een vervanger overhandigen maakt hem niet `rented`; een blok sluiten verandert niets aan het voertuig; `returned` wordt nooit `completed`; beschikbaarheid wordt **op leesacties** herberekend.
- Annuleren cascadeert nergens heen; een transport verplaatsen laat de vervanger op de oude dag; een voertuigwissel laat blok, vervanger en notificatie verweesd achter; placeholder-vervangers zijn onzichtbaar in de normale lijsten.

### 6.3 Documenten en communicatie (A-33…A-38)

Een gewijzigde reservering markeert haar contract niet als verouderd · ophalen maakt een duplicaatcontract ·
er is **nergens** een voertuigsuggestie (601 ongesorteerde rijen op het oog scannen) · geen waarschuwing
bij te vroeg ophalen · portaalklanten horen niets over hun eigen huur · succes en mislukking van
uitgaande mail worden nergens vastgelegd.

### 6.4 Bulk (B-01…B-08)

De hoogste waarde zit in **massaal `returned` → `completed`** (in de kloon zouden twee bulkacties de
788 poortrijen grotendeels opruimen). Bestaande bulkacties zijn fragiel: transport-bulk gebruikt
`Promise.all` zonder per-rij-foutafhandeling, APK-bulk verliest deelresultaten, bulkmail heeft **geen**
permissiecontrole, de kentekenimport doet een volledige vlootlezing **per rij** en de voortgangsbalk is
nep (staat vast op 5 %). Het label-afdrukpad (`barcode-book-dialog.tsx`) is al goed en is het model.
**Waar bulk níet loont** (bewust vastgelegd): ophalen/innemen in bulk, klantgegevens in bulk,
prijswijziging in bulk (er is geen `pricePerDay`-veld om te wijzigen).

### 6.5 Barcode (C-01…C-09)

Het scanpaneel is het snelste pad in het product: één fysieke handeling levert het object én de juiste
vervolgactie, en het kiest zelf tussen "Ophalen starten" en "Innemen starten". **Vijf van de veertien
acties vallen uit de scanmodus** (de dialogen zonder `onSuccess → lookup()` geven de focus terug aan de
tegel, waarna een blinde scan zijn Enter in een knop stuurt). De scan*dialoog* uit de globale
dialoogcontext is gedefinieerd, geëxporteerd en wordt **nergens aangeroepen**. De sleutelkastaudit is
juist het beste doorlopende scanpatroon (0 kliks tussen sleutels) maar het resultaat kan niet worden
opgeslagen, afgedrukt of geëxporteerd, en te snelle scans worden zonder melding weggegooid.

### 6.6 Snelacties, sneltoetsen en zoeken (D-01…D-06)

Geen enkele sneltoets buiten de vier sjablooneditors · twee snelactie-labels zijn onbereikbaar en drie
snelactie-iconen renderen als niets · de globale zoekbalk vuurt 3 requests per toetsaanslag zonder
debounce, laat de zoekterm staan na het kiezen van een resultaat en toont hardgecodeerde Engelse teksten.

---

## 7. OPT-voorstellen (fase 32)

### 7.1 Rangschikking — verantwoording

De 55 kandidaten uit fase 21 (WF-001…024) en fase 22 (BF-001…031) zijn samengevoegd tot **33
OPT-voorstellen**. De volgorde is bepaald in deze weegvolgorde: **frequentie → aantal betrokken
medewerkers → tijdwinst → foutreductie → bedrijfsimpact → implementatie-inspanning → risico.**
Concreet betekent dat: iets wat élke medewerker élke dag raakt gaat vóór iets wat één planner
wekelijks raakt, ook als het tweede goedkoper is; binnen dezelfde frequentie wint het voorstel dat
meer fouten wegneemt; bij gelijke foutreductie wint wat het minst kost en het minst risico draagt.
Daarom staan het dagoverzicht (OPT-001), de ophaal-/inname-ingang (OPT-002) en het afsluiten van
huren (OPT-003) bovenaan: dat zijn respectievelijk "elke ochtend, iedereen", "50× per dag" en "elke
inname, met 423 stil geblokkeerde voertuigen als gevolg" (kloonmeting). Voorstellen die zeldzaam zijn
maar catastrofaal (OPT-018 prullenbak voor reserveringen, OPT-033 referentiële integriteit) staan
lager op frequentie maar zijn in hun eigen tekst als zodanig gemarkeerd — bedrijfsimpact tilt ze
boven pure comfortverbeteringen uit. Reeds bekende defecten (BUG-001…230) zijn **geen** OPT: zij
worden in fase 35 opgelost en staan hier uitsluitend als voorwaarde onder "Afhankelijkheden".

**Categorieën.** `QUICK WIN` = klein, geen gedragskeuze, direct te doen. `MEDIUM` / `LARGE` =
omvang zonder dat de eigenaar iets hoeft te kiezen. `BUSINESS DECISION` = het voorstel verandert wat
de medewerker moet doen, wat de klant ziet of wat een status betekent; de eigenaar moet eerst de
regel kiezen. Waar een voorstel groot **én** een keuze is, wint `BUSINESS DECISION` — de omvang staat
apart in de kolom "Omvang". Daarom staat er maar één `LARGE`: de drie grootste voorstellen
(OPT-001, OPT-030, OPT-033) zijn omvang L maar staan als `BUSINESS DECISION`.

### 7.2 Overzichtstabel

| OPT | Titel | Categorie | Prio | Omvang | Beslissing eigenaar? | Afhankelijkheden |
|---|---|---|---|---|---|---|
| OPT-001 | Werkdagscherm "Vandaag" met "Openstaande punten" | BUSINESS DECISION | 1 | L | ja | BUG-203/204, BUG-113, BUG-040 |
| OPT-002 | Ophalen/Innemen en Scannen als primaire ingang | QUICK WIN | 2 | S | nee | BUG-218 |
| OPT-003 | Huur afsluiten bij inname + eenmalige bulkafronding | BUSINESS DECISION | 3 | S–M | ja | BUG-113, BUG-019, BUG-040 |
| OPT-004 | Eén definitie van "beschikbaar" + beschikbaarheidsscherm | BUSINESS DECISION | 4 | M | ja | CQ-006, BUG-109, BUG-130, BUG-211 |
| OPT-005 | Contract bevestigen en direct afdrukken/mailen in de ophaaldialoog | QUICK WIN | 5 | S | nee | BUG-165, BUG-184 |
| OPT-006 | `availability_status`: één eigenaar, geen bijwerkingen | MEDIUM | 6 | S–M | nee | OPT-004, CQ-011 |
| OPT-007 | Werkplaatsvlag blokkeert verhuur en overleeft de inname | BUSINESS DECISION | 7 | M | ja | BUG-109, OPT-006 |
| OPT-008 | Vervanger krijgt de status die hij fysiek heeft | QUICK WIN | 8 | S | nee | BUG-130, OPT-006 |
| OPT-009 | Voertuigsuggestie en vervanger-toewijzing in één klik | BUSINESS DECISION | 9 | M | ja | OPT-004 |
| OPT-010 | Micro-bewerkdialogen ("Datums wijzigen", "Klant wijzigen") | MEDIUM | 10 | M | nee | BUG-202, BUG-172, BUG-106 |
| OPT-011 | Opmerkingenbevestiging per opmerking in plaats van per ophaling | QUICK WIN | 11 | S | nee | — |
| OPT-012 | Zoekbalk: debounce, contractnummer, Nederlandse teksten | QUICK WIN | 12 | S | nee | BUG-223 |
| OPT-013 | Elke uitgaande mail loggen en de status tonen | QUICK WIN | 13 | S | nee | BUG-155, BUG-171 |
| OPT-014 | Documentversiebeheer: verouderd markeren, regenereren, versiekolom | BUSINESS DECISION | 14 | M | ja | BUG-165, BUG-184, BUG-190, CQ-008 |
| OPT-015 | "Onderhoud afronden" als één handeling | MEDIUM | 15 | M | nee | OPT-006, OPT-008 |
| OPT-016 | Bulkacties met resultaat per rij | QUICK WIN | 16 | S | nee | — |
| OPT-017 | Terugdraaien van statusfouten via één transitietabel | BUSINESS DECISION | 17 | M | ja | CQ-005, BUG-019, BUG-159 |
| OPT-018 | Verwijderde reservering in de prullenbak | MEDIUM | 18 | M | nee | BUG-108, BUG-110 |
| OPT-019 | Dubbele klant en chauffeur detecteren | QUICK WIN | 19 | S | nee | — |
| OPT-020 | Adres- en KvK-gegevens opzoeken in plaats van typen | QUICK WIN | 20 | S–M | nee | — |
| OPT-021 | Een kleine set sneltoetsen voor het baliewerk | MEDIUM | 21 | M | nee | OPT-002 |
| OPT-022 | Auditlog per record ("Geschiedenis"-tab) | QUICK WIN | 22 | S | nee | — |
| OPT-023 | Onderhoudsblok als zacht conflict bij boeken | BUSINESS DECISION | 23 | S | ja | OPT-004 |
| OPT-024 | Bulkacties uitbreiden: reserveringslijst en batchcontracten | LARGE | 24 | L | nee | OPT-003, OPT-016 |
| OPT-025 | "Klaar om te verhuren"-checklist (verplichte velden) | BUSINESS DECISION | 25 | M | ja | BUG-162, BUG-166 |
| OPT-026 | BV → Opnaam: vragen in plaats van achteraf melden | BUSINESS DECISION | 26 | S | ja | — |
| OPT-027 | Klantcommunicatie bij kantoorwijzigingen | BUSINESS DECISION | 27 | M | ja | BUG-134, OPT-013 |
| OPT-028 | Annulering: cascade of expliciete vraag | BUSINESS DECISION | 28 | M | ja | BUG-112, BUG-115, BUG-118 |
| OPT-029 | Pechomruil: wat gebeurt er met de oorspronkelijke huur | BUSINESS DECISION | 29 | M | ja | BUG-114, BUG-115, OPT-006 |
| OPT-030 | Prijsmodel: `pricePerDay`, herberekening, servervalidatie | BUSINESS DECISION | 30 | L | ja | BUG-019, BUG-143/144/145 |
| OPT-031 | RDW-verrijking bij voertuigimport + echte voortgang | MEDIUM | 31 | M | nee | — |
| OPT-032 | Sleutelkastaudit vastleggen en afdrukken | BUSINESS DECISION | 32 | M | ja | — |
| OPT-033 | Referentiële integriteit en een prullenbak voor klanten | BUSINESS DECISION | 33 | L | ja | BUG-143/144/145, OPT-018 |

**Aantallen per categorie: QUICK WIN 10 · MEDIUM 6 · LARGE 1 · BUSINESS DECISION 16 = 33.**

### 7.3 De voorstellen

```
OPT-001
Workflow: F (dagstart) — raakt daarna A, D, E en I
Huidig proces: De medewerker opent in de ochtend het dashboard, dat voorraadvragen beantwoordt
  ("Beschikbare voertuigen", "APK verloopt binnenkort", "Garantie verloopt binnenkort"), en bouwt
  vervolgens zelf een dagbeeld door /reservations (klik "Vandaag", klik de dag), /delivery,
  /maintenance en /portal-admin te openen.
Probleem: Er bestaat geen "wat moet er vandaag gebeuren"-oppervlak en geen "wat staat er nog open"-
  oppervlak. Transporten, onderhoud (155 beschikbare rijen) en portaalaanvragen staan niet op het
  dashboard; "Aankomende reserveringen" is hard begrensd op 5 rijen en sluit TBD-vervangers uit;
  "Achterstallige verhuringen" toont 362 rijen die een andere verzameling zijn dan de 788 rijen die
  op 423 van 675 voertuigen daadwerkelijk nieuwe boekingen blokkeren (kloonmeting).
Waarom inefficiënt: Vijf paginabezoeken die elk hun volledige dataset opnieuw downloaden, om
  informatie samen te stellen die de server al in vier bestaande endpoints heeft.
Impact op medewerker: Elke medewerker, elke ochtend, bouwt hetzelfde overzicht handmatig opnieuw op
  en mist structureel de werkvoorraad die op geen enkel scherm staat.
Frequentie: Dagelijks, elke medewerker (schatting; de brief noemt de ochtendstart als vast ritueel).
Huidige kliks: ≈5 kliks over 5 pagina's (geteld uit code), plus ≈20 MB aan herhaalde downloads
  (gemeten: kalenderbereik 1 523 KB / 835 ms; vervangerswidget ≈9 700 KB).
Voorgesteld proces: Eén "Vandaag"-scherm met vier secties — vandaag ophalen, vandaag innemen,
  transporten vandaag, onderhoud in/uit — elke rij met een directe knop "Ophalen starten" /
  "Innemen starten"; daaronder (of als tweede tab) "Openstaande punten": rijen die de boekingspoort
  blokkeren, TBD-vervangers, blokken die nog `active` staan, reserveringen op verwijderde voertuigen,
  en `returned`-niet-`completed`.
Verwachte kliks: 0 kliks om het dagbeeld te zien (het is de startpagina), 1 klik per handeling
  (schatting).
Verwachte tijdwinst: Schatting — 4 paginabezoeken per medewerker per ochtend, plus het wegvallen van
  de dagelijkse zoektocht naar "waarom kan ik deze auto niet boeken".
Vermindering menselijke fouten: Hoog. Dekt 25.7 (vergeten afsluiten), 25.9 (vergeten vervanger) en
  25.12 (verouderde onderhoudsvlag) in één scherm; maakt DE-2 en DE-10 zichtbaar.
Automatiseringskans: Geen nieuwe berekening nodig — `/api/reservations/range`, `/api/transports`,
  `/api/reservations/upcoming-maintenance` en `/api/placeholder-reservations/needing-assignment`
  bestaan al; de blokkerende verzameling komt uit `getOverdueReservationsByVehicle`.
Implementatiecomplexiteit: L — een nieuw scherm plus een nieuw samengesteld endpoint; de bestaande
  widgets moeten niet nog een keer alle vier de volledige tabellen ophalen.
Risico: Middel. Als het scherm bovenop de huidige laadpatronen wordt gebouwd, verergert het
  BUG-203/BUG-204. Het moet één samengesteld, gepagineerd endpoint krijgen.
Afhankelijkheden: BUG-203/BUG-204 (paginaload) als randvoorwaarde voor de bouwwijze; BUG-113 en
  BUG-040 bepalen de inhoud van "Openstaande punten"; OPT-003 verkleint die lijst structureel.
Prioriteit: 1
Categorie: BUSINESS DECISION — de eigenaar moet beslissen wat er op "Openstaande punten" hoort
  (welke rijen zijn een taak en welke zijn ruis), en of "Vandaag" de nieuwe startpagina wordt in
  plaats van het huidige dashboard.
```

```
OPT-002
Workflow: A (ophalen/innemen) en K (scannen)
Huidig proces: De twee meest uitgevoerde handelingen van de balie — een auto meegeven ("Ophalen") en
  terugnemen ("Innemen") — hebben geen dashboard-ingang. De medewerker gaat naar /reservations, zoekt
  de boeking, opent hem en klikt in de weergavedialoog; of navigeert naar /scan (navigatie-item 3).
  Tegelijk bezet "RDW APK-datums scannen", een achtergrondtaak, een primaire tegel. In het scanpaneel
  vallen bovendien 5 van de 14 acties uit de scanmodus, en de scan-dialoog uit de globale
  dialoogcontext wordt nergens aangeroepen.
Probleem: Het snelste interactiepatroon in het product is het minst bereikbaar, en het verliest zijn
  doorlopende scanmodus zodra een dialoog opengaat.
Waarom inefficiënt: Het scanpaneel lost met één fysieke handeling zowel het object als de juiste
  vervolgactie op (het kiest zelf tussen "Ophalen starten" en "Innemen starten"); dat voordeel wordt
  weggegeven door de plaatsing en door vijf ontbrekende `onSuccess`-koppelingen.
Impact op medewerker: De balie doet het meest frequente werk via de langste route.
Frequentie: 50×/dag (schatting, uit de brief).
Huidige kliks: Werkstroom A ≈22 kliks (geteld uit code); via het scanpaneel ≈1–2 kliks per handeling
  (geteld uit code); tussen twee scans 0 interacties bij de goed gekoppelde acties en ≈2 bij de vijf
  ontkoppelde.
Voorgesteld proces: (a) vervang twee van de vijf primaire snelactietegels door "Ophalen starten" en
  "Innemen starten", met een scan-of-zoek voorstap die de keuzelogica van het scanpaneel hergebruikt;
  (b) zet "Opnieuw scannen" vooraan in het tegelraster of reset automatisch na een afgeronde actie;
  (c) koppel `onSuccess → lookup(barcode)` op de resterende vijf dialogen; (d) sluit `openScanDialog`
  aan op de topbalk of verwijder het.
Verwachte kliks: Schatting — werkstroom A zakt van ≈22 naar ≈12 als de balie het scanpaneel als
  thuisscherm gebruikt; 0 interacties tussen twee scans op alle veertien acties.
Verwachte tijdwinst: Schatting — ongeveer de helft van de kliks van de meest uitgevoerde werkstroom.
Vermindering menselijke fouten: Hoog. Eén fysieke handeling levert het juiste object en de juiste
  actie; het verwijdert ook het risico dat een blinde scan zijn afsluitende Enter in een knop stuurt.
Automatiseringskans: De keuzelogica "ophalen of innemen" bestaat al in het scanpaneel.
Implementatiecomplexiteit: S — tegels verwisselen, vijf callbacks koppelen, één volgorde wijzigen.
Risico: Laag. Het tabletformaat van het scanpaneel is kapot op 768 px (BUG-218); zonder die fix
  levert promotie naar het sleutelkastscherm frustratie in plaats van winst.
Afhankelijkheden: BUG-218 (tabletlayout) voor het sleutelkastgebruik; verder geen.
Prioriteit: 2
Categorie: QUICK WIN
```

```
OPT-003
Workflow: A (inname en afsluiten)
Huidig proces: `POST /api/reservations/:id/return` laat de rij altijd op `returned` staan. Niets in de
  UI duwt hem naar `completed`. De boekingspoort sluit alleen `completed` en `cancelled` uit, dus een
  `returned`-rij ouder dan drie dagen blokkeert stil elke toekomstige boeking op die auto, terwijl het
  voertuig op elk scherm `available` toont.
Probleem: De laatste stap van de kernwerkstroom bestaat niet als handeling, en het ontbreken ervan
  maakt voertuigen onverhuurbaar zonder dat iemand dat ziet.
Waarom inefficiënt: De medewerker ontdekt het pas bij de volgende boeking, in de vorm van een
  409-melding, en moet dan uitzoeken welke oude rij het blokkeert.
Impact op medewerker: Onverklaarbare weigeringen aan de balie, met de klant aan de lijn.
Frequentie: Elke inname (schatting: 50×/dag).
Huidige kliks: 0 (de stap bestaat niet); het opruimen achteraf kost per geval een zoektocht van
  onbepaalde lengte (geen klikpad in de code).
Voorgesteld proces: (a) laat inname de reservering afsluiten (`returned` → `completed`) of laat een
  nachtelijke veegactie dat doen; (b) lever eenmalig een gefilterde lijst met "markeer geselecteerde
  als afgerond" om de bestaande achterstand op te ruimen; (c) toon de resterende rijen op
  "Openstaande punten" (OPT-001).
Verwachte kliks: 0 per inname; de eenmalige opruiming is 1 selectie + 1 bulkactie in plaats van één
  `PATCH` per rij (geteld uit code: er is vandaag geen bulkroute).
Verwachte tijdwinst: Schatting — de opruiming van 788 poortrijen op 423 voertuigen (kloonmeting) in
  twee handelingen in plaats van honderden.
Vermindering menselijke fouten: Hoog (25.7). Verwijdert de belangrijkste oorzaak van DE-2.
Automatiseringskans: Groot — `VALID_RESERVATION_TRANSITIONS['returned'] = ['completed']` bestaat al;
  de schedulers voor een nachtelijke veegactie bestaan ook al.
Implementatiecomplexiteit: S voor het afsluiten bij inname; M met de bulkopruiming erbij.
Risico: Middel. Als "voltooid" in de administratie iets betekent (gefactureerd, gecontroleerd), dan
  is automatisch afsluiten het verlies van een controlemoment. Daarom een beslissing.
Afhankelijkheden: BUG-113 (de poortdefinitie zelf), BUG-019 (inname overschrijft de einddatum — moet
  eerst opgelost zijn, anders wordt een foute einddatum definitief afgesloten), BUG-040.
Prioriteit: 3
Categorie: BUSINESS DECISION — mag een huur automatisch afgesloten worden bij inname, of blijft er
  een controlestap? En welke bestaande rijen mogen in de eenmalige opruiming mee?
```

```
OPT-004
Workflow: B (beschikbaarheidsvraag) en A (voertuigkeuze)
Huidig proces: Er is geen beschikbaarheidsscherm. De enige manier om "is er volgende week een auto
  vrij?" te beantwoorden is het aanmaakformulier voor een reservering openen, twee datums typen en de
  voertuigpicker openen — een formulier dat zijn invoer weggooit als je ernaast klikt. Ondertussen
  geeft de dashboardwidget "Beschikbare voertuigen" een ander antwoord dan datzelfde formulier.
Probleem: Vier implementaties van "beschikbaar" die het oneens zijn (§5.2a). Gemeten: 315 vs 593.
  De enige implementatie die inhoudelijk klopt (`calculateCorrectStatus`) is dode code.
Waarom inefficiënt: Een leesvraag vereist een schrijfformulier, en het antwoord is een platte lijst
  kentekens zonder aantal per type, zonder prijs en zonder "de eerstvolgende vrije dag is…".
Impact op medewerker: Wie vanaf het dashboard offreert, verkoopt de vloot te krap; wie te horen
  krijgt "we hebben niets meer" gelooft dat.
Frequentie: 20×/dag (schatting).
Huidige kliks: 5 kliks + 2 getypte datums om een ja/nee-vraag te beantwoorden, +1 om af te breken
  (geteld uit code).
Voorgesteld proces: (a) één `isVehicleBookable(vehicleId, periode, …)` die zowel het overlappredicaat
  als het statusfilter bezit, waar alle vier de huidige paden op delegeren; (b) een alleen-lezen
  scherm "Beschikbaarheid": datumbereik + optioneel type → vrije auto's gegroepeerd per type, met een
  knop "Reserveer"; (c) de dashboardwidget gebruikt dezelfde definitie.
Verwachte kliks: 2 kliks + 2 datums, zonder dat er iets aangemaakt kan worden (schatting).
Verwachte tijdwinst: Schatting — het grootste enkele procesgat voor een verhuurbackoffice;
  telefonisch antwoord in één scherm in plaats van in een formulier dat verkeerd kan aflopen.
Vermindering menselijke fouten: Hoog — verkeerd offreren verdwijnt; BUG-225 (formulier gooit invoer
  weg) verdwijnt van dit pad omdat het pad zelf verdwijnt.
Automatiseringskans: De gegevens en beide predicaten bestaan al; het is consolidatie, geen nieuwe
  logica.
Implementatiecomplexiteit: M.
Risico: Middel-hoog. Het gelijktrekken verandert gedrag: het personeel wordt voortaan geblokkeerd op
  auto's waar het nu gewoon op kan boeken (`not_for_rental`, actieve blokken). Dat is de bedoeling,
  maar het is een gedragswijziging aan de balie.
Afhankelijkheden: CQ-006 (de vijf definities), BUG-109, BUG-130, BUG-211. OPT-006 en OPT-023 hangen
  hieronder.
Prioriteit: 4
Categorie: BUSINESS DECISION — welke definitie is het huisantwoord? Telt een auto in de werkplaats,
  een auto met een gepland blok in die periode, of een auto met de reparatievlag als "beschikbaar"?
```

```
OPT-005
Workflow: A stap 19–20 en G (documenten)
Huidig proces: De ophaaldialoog toont onvoorwaardelijk de melding "Ophalen voltooid / Voertuig
  succesvol opgehaald. Contract is gegenereerd." De server vangt een mislukte PDF-generatie af in een
  `catch` die alleen logt, en antwoordt alsnog 200. Om het contract daarna aan de klant te geven moet
  de medewerker de ophaaldialoog sluiten, de reservering heropenen, naar de documentensectie scrollen,
  het document uitklappen en het voorbeeld openen.
Probleem: Een mislukt contract is niet te onderscheiden van een geslaagd contract, en de overdracht
  kost een sluiten-heropenen-scrollen-cyclus omdat de ophaaldialoog geen "Afdrukken" of "Mail naar
  klant" heeft.
Waarom inefficiënt: De medewerker doet vier extra kliks voor iets wat in dezelfde dialoog kan, en kan
  de klant vertellen dat het contract in zijn mail zit terwijl er niets bestaat.
Impact op medewerker: Bij elke ophaling; en de fout komt pas dagen later aan het licht.
Frequentie: 50×/dag (schatting). Stille mislukkingen zijn zeldzaam, de gevolgen groot.
Huidige kliks: ≈4 kliks voor de overdracht (geteld uit code), 0 kliks om te controleren of het
  contract bestaat — dat kan niet.
Voorgesteld proces: De ophaal- en innameroutes geven de aangemaakte document-id terug; de dialoog
  toont "Contract klaar" met knoppen "Afdrukken" en "Mail naar klant", of — als de id ontbreekt —
  "Contract kon niet gemaakt worden" met een knop "Opnieuw proberen".
Verwachte kliks: 1 (afdrukken) of 1 (mailen) vanuit dezelfde dialoog (schatting).
Verwachte tijdwinst: Schatting — 3 kliks per ophaling, 50× per dag.
Vermindering menselijke fouten: Hoog (25.10). Het is de enige manier waarop een medewerker een
  mislukte generatie kan zien.
Automatiseringskans: De generatie is al volledig geautomatiseerd; alleen het resultaat is onzichtbaar.
Implementatiecomplexiteit: S.
Risico: Laag. Wel zichtbaar: mislukkingen die vandaag stil zijn worden voortaan gemeld — dat kan
  aanvankelijk lijken op "er gaat ineens veel mis".
Afhankelijkheden: BUG-165 (twee genereerroutes registreren hun rij nooit) en BUG-184 (twee contracten
  op één dag delen één bestand) moeten eerst weg, anders meldt de dialoog succes op een rij die naar
  verkeerde bytes wijst.
Prioriteit: 5
Categorie: QUICK WIN
```

```
OPT-006
Workflow: Alle — voertuigstatus
Huidig proces: `vehicles.availability_status` wordt door drie niet-verwante paden geschreven: de
  handmatige statuswijziging, de reserveringssynchronisatie en — als bijwerking —
  `PATCH /api/vehicles/:id/maintenance-status`. Gemeten: een auto op `not_for_rental` die een
  werkplaatsronde doorloopt (`in_service` → `ok`) komt er als `available` uit.
Probleem: Eén kolom betekent drie dingen en geen enkele schrijver weet wat de vorige waarde betekende.
  Een bewust besluit "deze auto gaat uit de verhuur" — verkocht, afgeschreven, verzekering verlopen —
  wordt vernietigd door een onderhoudsregistratie die er niets mee te maken heeft.
Waarom inefficiënt: Niemand hoeft iets fout te doen; de auto komt vanzelf terug in de verhuurbare
  pool.
Impact op medewerker: De medewerker die de auto uit de verhuur haalde krijgt geen enkel signaal dat
  zijn besluit is teruggedraaid.
Frequentie: Elk werkplaatsbezoek op een teruggetrokken auto (schatting).
Huidige kliks: n.v.t. — dit is servergedrag, geen klikpad.
Voorgesteld proces: Scheid "waarom is deze auto niet beschikbaar" van "is deze auto beschikbaar".
  Laat de maintenance-statusroute `availability_status` niet meer schrijven, of laat hem de vorige
  waarde herstellen — de logica die `not_for_rental` expliciet bewaart bestaat al in
  `getStatusOnMaintenanceEnd` en wordt nooit aangeroepen.
Verwachte kliks: n.v.t.
Verwachte tijdwinst: Geen kliktijd; de winst is dat een teruggetrokken auto teruggetrokken blijft.
Vermindering menselijke fouten: Hoog — het verwijdert DE-13 volledig.
Automatiseringskans: De correcte implementatie bestaat al als dode code.
Implementatiecomplexiteit: S–M (de dode helft van `vehicle-status-helper.ts` activeren of opruimen).
Risico: Laag-middel. Auto's die vandaag "per ongeluk" weer verhuurbaar werden, blijven voortaan
  geblokkeerd — dat is correct, maar het kan bestaande werkafspraken raken.
Afhankelijkheden: OPT-004 (één definitie van beschikbaar) hoort hier direct boven; CQ-011 (dode
  statusmachine) is de technische voorwaarde.
Prioriteit: 6
Categorie: MEDIUM
```

```
OPT-007
Workflow: E (werkplaats) en A (ophalen)
Huidig proces: Een auto met `maintenance_status = in_service` staat gewoon in de voertuigpicker en
  `POST /pickup` op zo'n auto antwoordt 200. Een auto met `availability_status = needs_fixing` wordt
  wel uit de beschikbaarheidslijsten gefilterd, maar boeken geeft 201, ophalen geeft 200, en na de
  inname is de reparatievlag verdwenen — de auto staat weer op `available`.
Probleem: De werkplaatsvlag houdt niemand tegen, en de verhuurcyclus wist hem. `getStatusOnReturn`,
  dat de vlag zou bewaren, wordt geïmporteerd en nooit aangeroepen.
Waarom inefficiënt: De reden dat de auto niet verhuurd mag worden overleeft de verhuring niet.
Impact op medewerker: De balie kan een auto meegeven die in de garage hoort te staan; de volgende
  medewerker ziet geen enkel spoor meer van de melding.
Frequentie: Wekelijks (schatting), met de hoogste gevolgen van alle bevindingen — dit is de klasse
  van het incident van 2026-08-25.
Huidige kliks: n.v.t. — er is geen blokkade om weg te klikken.
Voorgesteld proces: Sluit werkplaats- en reparatiegevlagde auto's uit de picker, blokkeer het ophalen
  met een expliciete override, en roep bij inname de statusfunctie aan die de vlag bewaart.
Verwachte kliks: +1 klik voor de override in de uitzonderingsgevallen (schatting).
Verwachte tijdwinst: Geen; de winst is uitsluitend foutreductie.
Vermindering menselijke fouten: Zeer hoog (25.2, 25.12; DE-12).
Automatiseringskans: Groot — de statusfuncties bestaan al en zijn dood.
Implementatiecomplexiteit: M.
Risico: Middel. Een harde blokkade kan de balie klemzetten op een moment dat de klant er staat; een
  te makkelijke override maakt de blokkade betekenisloos.
Afhankelijkheden: BUG-109 (de vlag zelf), OPT-006 (één eigenaar van de kolom).
Prioriteit: 7
Categorie: BUSINESS DECISION — blokkeren of waarschuwen? Mag er een override zijn, en wie mag die
  gebruiken (iedereen, alleen een beheerder, of met adminwachtwoord zoals bij de kilometerstand)?
```

```
OPT-008
Workflow: D en E (vervangend voertuig)
Huidig proces: De knoppen in de vervangerswidget ("Markeer als opgehaald") schrijven uitsluitend
  `spare_vehicle_status`. De onderliggende vervangingsreservering blijft op `pending` staan, en
  daardoor blijft het voertuig `available` — terwijl het fysiek bij de klant is. Gemeten in keten 3
  stap 5.
Probleem: Een auto die de deur uit is, is opnieuw boekbaar. Dat is een direct dubbelboekingspad.
Waarom inefficiënt: De medewerker heeft de handeling correct geregistreerd; het systeem trekt er
  alleen geen conclusie uit.
Impact op medewerker: De volgende medewerker boekt de auto opnieuw en ontdekt het pas aan de balie.
Frequentie: Elke vervangeroverdracht (schatting: dagelijks).
Huidige kliks: 1 klik (die het verkeerde doet).
Voorgesteld proces: Laat de status van de vervangingsreservering meelopen met `spare_vehicle_status`,
  en gebruik `shared/transport-spare-status.ts` — dat precies hiervoor is geschreven — ook voor het
  onderhoudspad, niet alleen voor het transportpad.
Verwachte kliks: 1 klik (dezelfde), met het juiste gevolg.
Verwachte tijdwinst: Geen kliktijd; de winst is het wegvallen van een dubbelboeking en de afhandeling
  daarvan.
Vermindering menselijke fouten: Hoog — verwijdert DE-6.
Automatiseringskans: De centraliserende module bestaat al en is in fase 20 expliciet aangemerkt als
  "niet refactoren, dit is het model".
Implementatiecomplexiteit: S.
Risico: Laag.
Afhankelijkheden: BUG-130 (statusafleiding), OPT-006.
Prioriteit: 8
Categorie: QUICK WIN
```

```
OPT-009
Workflow: A (voertuigkeuze), D en E (vervanger kiezen)
Huidig proces: De voertuiglijst in het boekingsformulier bood tijdens de meting 601 van de toen 675
  auto's aan, ongesorteerd, zonder filter op type, brandstof of prijsklasse. De vervangerdialogen
  sturen alleen datums mee. De medewerker scant de lijst met het oog. Als een transportregel nog een
  TBD-vervanger heeft, blokkeert het afdrukken met de toast "Vervangend voertuig vereist" zonder een
  link naar de toewijzingsdialoog.
Probleem: Er is nergens een voertuigsuggestie, terwijl de portaal-goedkeuringsdialoog precies dat al
  doet ("Zelfde type, vrij") en `vehicleType` gewoon uit RDW gevuld wordt.
Waarom inefficiënt: De snelst bewegende stap in de werkstroom is de stap waar het meeste handwerk zit.
Impact op medewerker: Elke boeking en elke vervangertoewijzing begint met visueel zoeken.
Frequentie: Elke boeking en elke vervangertoewijzing (schatting: dagelijks tot 50×/dag).
Huidige kliks: 2 kliks + 1 getypte zoekterm voor de picker (geteld uit code), plus het scannen van de
  lijst; de TBD-doodlopende weg kost 4 extra kliks (geteld uit code).
Voorgesteld proces: Rangschik de beschikbare lijst — zelfde type eerst, dan zelfde brandstof, dan de
  dichtstbijzijnde dagprijs — en toon per kandidaat waarom hij wel of niet kan, zoals de
  portaalgoedkeuring dat al doet. Laat de TBD-toast de toewijzingsdialoog openen.
Verwachte kliks: 2 kliks zonder zoekterm in het normale geval (de bovenste suggestie klopt);
  TBD-toewijzing 1 klik in plaats van 5 (schatting).
Verwachte tijdwinst: Schatting — het wegvallen van het lijstscannen bij elke boeking.
Vermindering menselijke fouten: Middel (25.2, 25.9) — een medewerker die snel kiest, kiest vaker de
  juiste categorie.
Automatiseringskans: De volledige `Vehicle`-rijen zijn al geladen; ranking kost geen extra query.
Implementatiecomplexiteit: M.
Risico: Laag technisch; het risico zit in de definitie van "vergelijkbaar".
Afhankelijkheden: OPT-004 (welke auto's mogen überhaupt in de lijst staan).
Prioriteit: 9
Categorie: BUSINESS DECISION — wat maakt een auto "vergelijkbaar"? Type, brandstof, prijsklasse,
  segment, of een eigen indeling? En mag een duurdere auto automatisch als vervanger worden
  voorgesteld?
```

```
OPT-010
Workflow: C (boeking wijzigen na een klantgesprek)
Huidig proces: Eén veld wijzigen betekent het volledige formulier van 23 velden openen en de hele rij
  opnieuw versturen. Dat formulier faalt vandaag bij elke opslag (BUG-202); de overgebleven
  gebaren zijn slepen in de kalender (zonder conflictcontrole) of een dialoog die `/basic` raakt (die
  de hele rij overschrijft en dus het werk van een collega kan wissen).
Probleem: Er is geen micro-bewerking. De enige bestaande micro-dialoog,
  `edit-contract-number-dialog.tsx`, bewijst dat het patroon werkt en goedkoop is.
Waarom inefficiënt: Het opnieuw versturen van alle velden is tegelijk de oorzaak van BUG-202 en van
  het lost-update-mechanisme van BUG-172.
Impact op medewerker: De meest voorkomende klantvraag ("kan ik een dag later inleveren?") heeft geen
  werkend gebaar.
Frequentie: 10×/dag (schatting).
Huidige kliks: 7 als het formulier zou werken (zoeken 3 + openen 1 + "Bewerken" 1 + veld + opslaan),
  geteld uit code.
Voorgesteld proces: Kleine gerichte dialogen — "Datums wijzigen", "Klant wijzigen", "Voertuig
  wijzigen" — die alleen de gewijzigde velden versturen, in de stijl van de contractnummerdialoog, en
  die dezelfde conflictcontrole draaien als het aanmaakpad.
Verwachte kliks: 4 (zoeken 3 + dialoog 1) + het veld + opslaan (schatting).
Verwachte tijdwinst: Schatting — 3 kliks per wijziging en het wegvallen van het volledige
  formulierlaadproces (9 queries bij het openen, geteld uit code).
Vermindering menselijke fouten: Hoog — het verwijdert het mechanisme achter BUG-172 en maakt het
  sleepgebaar overbodig als enige werkende weg.
Automatiseringskans: n.v.t.
Implementatiecomplexiteit: M.
Risico: Laag, mits elke micro-dialoog dezelfde validatie draait als het volledige formulier —
  anders ontstaat een zesde schrijfpad zonder controle.
Afhankelijkheden: BUG-202 (het formulier moet eerst weer werken), BUG-172, BUG-106.
Prioriteit: 10
Categorie: MEDIUM
```

```
OPT-011
Workflow: A stap 19 (ophalen)
Huidig proces: Bij het ophalen van elke auto die ook maar enige tekst in `remarks` heeft, verschijnt
  een bevestigingsdialoog ("BELANGRIJK: Bekijk deze opmerkingen voordat het voertuig vertrekt" →
  "Ik bevestig & ga door"). Er is geen bevestiging per opmerking en geen vervaldatum.
Probleem: Een waarschuwing die altijd vuurt, is geen waarschuwing meer.
Waarom inefficiënt: Bij een auto met een oude notitie is dit pure wrijving, 50× per dag.
Impact op medewerker: Bevestigingsmoeheid — en daardoor gemiste échte meldingen.
Frequentie: 50×/dag (schatting).
Huidige kliks: +1 klik per ophaling van elke auto met een notitie (geteld uit code).
Voorgesteld proces: Bevestig per opmerkingstekst: vraag alleen opnieuw als de opmerking is gewijzigd
  sinds de laatste bevestigde ophaling van dat voertuig.
Verwachte kliks: +1 alleen bij een nieuwe of gewijzigde opmerking (schatting).
Verwachte tijdwinst: Schatting — enkele tientallen kliks per dag, maar vooral herstel van de
  signaalwaarde.
Vermindering menselijke fouten: Verhoogt de signaalkwaliteit (25.15); vermindert het aantal fouten
  niet direct maar maakt de resterende waarschuwingen geloofwaardig.
Automatiseringskans: Klein; het is een vergelijking met de laatst bevestigde tekst.
Implementatiecomplexiteit: S.
Risico: Laag. Let op: als een opmerking ongewijzigd blijft maar wél belangrijk is, wordt er niet meer
  gevraagd. Daarom alleen scopen, niet uitschakelen.
Afhankelijkheden: Geen.
Prioriteit: 11
Categorie: QUICK WIN
```

```
OPT-012
Workflow: Alle (globale zoekbalk)
Huidig proces: De zoekbalk in de kopbalk vuurt bij elke toetsaanslag drie parallelle queries
  (voertuigen, klanten, reserveringen) zonder debounce; de voertuigenpagina doet dat wél met 300 ms.
  Een kenteken van 8 tekens levert 21 API-calls op. De zoekterm blijft na het kiezen van een resultaat
  in het veld staan, zodat het uitklapmenu opnieuw opent bij focus. Twee teksten zijn hardgecodeerd
  Engels ("No results found for …").
Probleem: Constante, goedkoop te verwijderen wrijving — plus één echt gat: er kan niet op
  contractnummer gezocht worden, terwijl dat het nummer is dat de klant door de telefoon voorleest.
Waarom inefficiënt: De route `find-by-contract` bestaat al, maar is alleen gekoppeld aan de
  duplicaatcontrole in de ophaaldialoog.
Impact op medewerker: Elke telefonische vraag die met een contractnummer begint is een doodlopende weg.
Frequentie: Voortdurend; 50×/dag (schatting).
Huidige kliks: 3 kliks om een boeking te vinden (geteld uit code); 21 API-calls per kenteken (geteld
  uit code).
Voorgesteld proces: Debounce 250–300 ms (zoals de voertuigenpagina), zoekterm wissen bij het kiezen
  van een resultaat, contractnummer toevoegen via `find-by-contract`, en de twee Engelse teksten
  vertalen.
Verwachte kliks: Gelijk aantal kliks; 3 API-calls in plaats van 21 per zoekterm (geteld uit code) en
  één extra vindbare ingang.
Verwachte tijdwinst: Schatting — klein per keer, groot per dag; plus het wegvallen van een
  telefonische doodlopende weg.
Vermindering menselijke fouten: Laag, maar het verwijdert een dead end.
Automatiseringskans: n.v.t.
Implementatiecomplexiteit: S.
Risico: Laag.
Afhankelijkheden: BUG-223 (hardgecodeerde strings) overlapt; verder geen.
Prioriteit: 12
Categorie: QUICK WIN
```

```
OPT-013
Workflow: G (documenten versturen) en alle mail
Huidig proces: "Documenten e-mailen naar klant" en de portaalmailpaden schrijven niets weg. Gemeten:
  drie mislukte verzendingen lieten `email_logs` onveranderd op 12 staan, zonder notificatie, zonder
  vlag op het document en zonder auditregel. Bij een trage in plaats van dode SMTP-server hangt het
  verzoek onbeperkt (geen timeout).
Probleem: De vraag "heeft de klant het contract gekregen?" heeft geen antwoord — niet aan de balie,
  niet achteraf.
Waarom inefficiënt: De medewerker die de toast mist of wordt afgeleid kan het nooit meer nagaan.
Impact op medewerker: Onzekerheid bij elke verzending; bij een klacht is er geen bewijs.
Frequentie: Elke verzending (schatting: tientallen per dag).
Huidige kliks: ≈9 kliks om te versturen (geteld uit code), 0 om achteraf te controleren — dat kan niet.
Voorgesteld proces: Log elke uitgaande mail — geslaagd en mislukt — in `email_logs`, toon de status
  op het document ("verzonden op … aan …" / "verzenden mislukt"), en zet een SMTP-timeout.
Verwachte kliks: Gelijk om te versturen; 1 klik om de status te zien (schatting).
Verwachte tijdwinst: Schatting — geen kliktijd, wel het wegvallen van elke "heb ik dit al gestuurd?"-
  zoektocht.
Vermindering menselijke fouten: Hoog (25.10, 25.11) — en het maakt DE-3 zichtbaar.
Automatiseringskans: De tabel en de schrijffunctie bestaan al; alleen de twee documentmailroutes en
  de acht portaalpaden gebruiken ze niet.
Implementatiecomplexiteit: S.
Risico: Laag.
Afhankelijkheden: BUG-155 (de ontbrekende logging zelf), BUG-171 (geen timeout op de transporter).
Prioriteit: 13
Categorie: QUICK WIN
```

```
OPT-014
Workflow: G (documenten) en C (boeking wijzigen)
Huidig proces: Een prijs- of datumcorrectie laat het al gegenereerde contract ongewijzigd en
  ongemarkeerd staan. Gemeten: na een wijziging van € 225 naar € 270 bleef er precies één
  documentrij staan, met de oude bedragen, zonder vlag. Er is geen "regenereren"-knop; de enige
  correctieroute is de ophaling terugdraaien en opnieuw ophalen. Na een regeneratie staat het
  versienummer in de typekolom ("Contract (Unsigned) 2"). Bovendien worden mailsjablonen op twee
  plaatsen beheerd.
Probleem: Een contract dat niet meer klopt met zijn eigen reservering is niet te onderscheiden van
  een goed contract, en versiebeheer staat in een tekstveld.
Waarom inefficiënt: De enige verdediging is dat de medewerker het onthoudt; de correctie van een stuk
  papier vereist het terugdraaien van een fysieke gebeurtenis.
Impact op medewerker: Verkeerde contracten verlaten het pand; 6+ kliks om er één te corrigeren.
Frequentie: Elke gecorrigeerde boeking (schatting: dagelijks).
Huidige kliks: 6+ om te corrigeren (geteld uit code); 0 om te zien dat correctie nodig is.
Voorgesteld proces: Markeer documenten als verouderd zodra hun reservering wijzigt, bied
  "regenereren" met één klik (de regeneratieservice bestaat al), verplaats het versienummer naar een
  echte `version`-kolom, en breng het sjabloonbeheer terug naar één plek.
Verwachte kliks: 1 klik om te regenereren; 0 om te zien dat het nodig is (het staat er) (schatting).
Verwachte tijdwinst: Schatting — 5 kliks per correctie plus het wegvallen van het terugdraaien van de
  ophaling.
Vermindering menselijke fouten: Hoog — verwijdert DE-4.
Automatiseringskans: `server/services/reservation-pdf-regeneration.ts` bestaat en wordt niet
  aangeroepen vanuit de wijzigingsroute.
Implementatiecomplexiteit: M (de `version`-kolom is een migratie).
Risico: Middel. Automatisch regenereren vervangt een document dat de klant misschien al getekend
  heeft; dat mag niet stil gebeuren.
Afhankelijkheden: BUG-165, BUG-184, BUG-190, CQ-008 (één eigenaar van documentregistratie).
Prioriteit: 14
Categorie: BUSINESS DECISION — automatisch regenereren of alleen markeren? Wat gebeurt er met een al
  getekende versie: bewaren als historie, markeren als vervallen, of verwijderen? Hoe lang moeten
  oude versies bewaard blijven?
```

```
OPT-015
Workflow: E (werkplaats)
Huidig proces: Eén reparatie afsluiten kost drie handelingen in twee schermen: (1) het blok op `out`
  zetten, (2) de `maintenance_status` van het voertuig terug op `ok` zetten, (3) `return-from-service`
  op de vervanger. Niets dwingt de volgorde af en niets waarschuwt als er één wordt overgeslagen. Sla
  (2) over en de auto blijft permanent "in de werkplaats"; sla (1) over en het blok blijft `active` en
  blijft de kalender blokkeren. Bovendien schrijven de twee afrondingspaden verschillende datums.
Probleem: Eén bedrijfsgebeurtenis ("de reparatie is klaar") heeft geen enkele handeling die haar
  representeert.
Waarom inefficiënt: Drie endpoints, twee schermen, geen transactie.
Impact op medewerker: De werkplaats, de planner en de balie moeten onderling afspreken wie welk deel
  doet.
Frequentie: Elke reparatie (schatting: enkele per dag).
Huidige kliks: ≈6 in het ene pad, 4 in het andere (geteld uit code), verdeeld over twee schermen.
Voorgesteld proces: Eén handeling "Onderhoud afronden" die transactioneel het blok sluit, de
  voertuigvlag wist en de vervanger terugmeldt, met één datumconventie.
Verwachte kliks: 1–2 (schatting).
Verwachte tijdwinst: Schatting — 4 kliks en één schermwissel per reparatie.
Vermindering menselijke fouten: Hoog — verwijdert DE-5 en de bron van de spookblokken (44 voertuigen
  met een niet-gesloten blok in de kloon).
Automatiseringskans: Groot; alle drie de stappen zijn bestaande endpoints.
Implementatiecomplexiteit: M — het moet in één transactie, en de database heeft vandaag 9
  transactie-aanroepplekken in totaal.
Risico: Middel — dit is een schrijfpad dat drie tabellen raakt; zonder transactie wordt het een
  nieuwe bron van halve toestanden.
Afhankelijkheden: OPT-006 (welke kolom wint), OPT-008 (vervangerstatus).
Prioriteit: 15
Categorie: MEDIUM
```

```
OPT-016
Workflow: D (transporten) en J (APK-bevestigingen)
Huidig proces: De bulkafronding van transporten gebruikt `Promise.all` over losse `PATCH`-verzoeken
  zonder foutafhandeling per rij: één mislukte rij verwerpt het geheel en levert één algemene toast
  op. De bulkbevestiging van APK-datumwijzigingen loopt sequentieel maar geeft alleen een aantal
  terug; een fout halverwege levert een 500 en het deelresultaat is onzichtbaar.
Probleem: De enige twee bulkacties in het product kunnen niet vertellen wat er wél en niet is gelukt.
Waarom inefficiënt: Een groene toast verbergt een halve batch; de medewerker moet handmatig
  controleren wat er is gebeurd.
Impact op medewerker: Dagelijks, op het enige scherm dat bulk ondersteunt.
Frequentie: Dagelijks (transportafronding), na elke nachtelijke RDW-scan (APK).
Huidige kliks: 11 kliks om 10 transporten af te ronden (geteld uit code) — maar zonder zekerheid over
  het resultaat.
Voorgesteld proces: Sequentieel met een resultaat per rij, zoals de CJIB-importer dat al doet, en een
  samenvatting "8 gelukt, 2 mislukt" met de mislukte rijen benoemd.
Verwachte kliks: 11 (gelijk), met een betrouwbaar resultaat (schatting).
Verwachte tijdwinst: Schatting — het wegvallen van de handmatige controle achteraf.
Vermindering menselijke fouten: Middel-hoog; het is de enige manier om te weten dat de bulkactie
  klopte.
Automatiseringskans: Het patroon bestaat al in `server/services/cjib/importer.ts`.
Implementatiecomplexiteit: S.
Risico: Laag.
Afhankelijkheden: Geen.
Prioriteit: 16
Categorie: QUICK WIN
```

```
OPT-017
Workflow: Herstel (fase 29) — ophalen, innemen, annuleren terugdraaien
Huidig proces: Drie terugdraaigebaren, drie verschillende uitkomsten. "Terugzetten naar geboekt"
  bestaat in de UI, met dubbele bevestiging en een tekst die exact zegt wat er gewist wordt — maar
  het voertuig blijft `rented`, de foute kilometerstand blijft staan en het contract-PDF blijft
  hangen aan een reservering zonder contractnummer. Een inname terugdraaien kan alleen via de API en
  zet `end_date` op NULL. Een annulering terugdraaien wordt door `/status` geweigerd (400) en door
  `PATCH /:id` toegestaan (200); er is geen knop.
Probleem: Of een medewerker een fout kan herstellen hangt af van welke dialoog hij toevallig gebruikt,
  en het herstel laat sporen achter die niemand opruimt.
Waarom inefficiënt: De enige route die werkt is de route die de meeste schade doet.
Impact op medewerker: Wie zich vergist, vergroot het probleem door het te herstellen.
Frequentie: Wekelijks (schatting), met hoge gevolgen per geval.
Huidige kliks: Ophalen terugdraaien 2–3 kliks (geteld uit code); inname terugdraaien en annulering
  terugdraaien: geen klikpad, alleen API.
Voorgesteld proces: Eén gedeclareerde transitietabel voor reserveringen, gehandhaafd op élk
  schrijfpad — het patroon dat de bekeuringendialoog al gebruikt — met de toegestane terugdraaiingen
  als knoppen in de statusdialoog, met dezelfde "dit wordt gewist"-tekst; en een terugdraaiing die een
  echte compenserende handeling is (beschikbaarheid herberekenen, vorige kilometerstand terugzetten,
  het verweesde contract markeren).
Verwachte kliks: 2–3 kliks voor elk van de drie terugdraaiingen (schatting).
Verwachte tijdwinst: Schatting — vooral het wegvallen van handmatige databasereparaties.
Vermindering menselijke fouten: Hoog — verwijdert het NULL-worden van `end_date` en de inconsistente
  annuleringsregel.
Automatiseringskans: `FINE_TRANSITIONS` in de bekeuringendialoog is het werkende model.
Implementatiecomplexiteit: M.
Risico: Middel. Terugdraaien toestaan waar het nu geweigerd wordt is een uitbreiding van
  bevoegdheden; terugdraaien weigeren waar het nu kan is een inperking. Beide raken de dagelijkse
  praktijk.
Afhankelijkheden: CQ-005 (de statusmachine wordt door 1 van 5 schrijvers gehandhaafd), BUG-019,
  BUG-159.
Prioriteit: 17
Categorie: BUSINESS DECISION — mag een annulering überhaupt teruggedraaid worden, en door wie? Moet
  een verweesde contract-PDF bewaard blijven als historie of verwijderd worden?
```

```
OPT-018
Workflow: Herstel — verwijderde reservering
Huidig proces: Een verwijderde reservering is via geen enkele route terug te halen. `GET` geeft 404,
  hij staat niet in de lijsten, en de prullenbak kent alleen de typen `vehicle` en `fine`. De rij
  staat er nog wel: hij is alleen soft-deleted. De verwijdering schrijft zelfs twee auditregels.
Probleem: De gegevens zijn er, het herstel niet. Dit is het ernstigste herstelgat dat de audit heeft
  gevonden.
Waarom inefficiënt: Herstel vereist databasetoegang, dus een externe partij, dus tijd en risico.
Impact op medewerker: Een vergissing die één klik kost, is niet door de medewerker zelf te herstellen.
Frequentie: Zeldzaam, catastrofaal (schatting).
Huidige kliks: Geen — er is geen herstelpad.
Voorgesteld proces: Voeg `reservation` toe aan `deleted_records` / de prullenbak met hetzelfde
  patroon dat voertuigen al hebben: impactvoorbeeld vooraf, herstel met bevestiging, en een
  conflictcontrole bij het terugzetten.
Verwachte kliks: 3–4 kliks om te herstellen (schatting; het voertuigpad kost er vandaag 2).
Verwachte tijdwinst: Schatting — geen dagelijkse winst; wel het verschil tussen "zelf oplossen" en
  "externe hulp inschakelen".
Vermindering menselijke fouten: Hoog voor de gevolgen, niet voor de frequentie.
Automatiseringskans: Het prullenbakmechanisme bestaat al volledig.
Implementatiecomplexiteit: M.
Risico: Middel. Het voertuigpad herstelt vandaag met één klik zonder bevestiging en zonder
  conflictcontrole (BUG-108/110); dat gebrek mag niet meegekopieerd worden. Bovendien is herstel nu
  `requireAdmin`, zodat degene die de fout maakte hem meestal niet kan herstellen — dat is een keuze
  die bij het bouwen opnieuw gemaakt moet worden.
Afhankelijkheden: BUG-108, BUG-110 (herstel zonder conflictcontrole).
Prioriteit: 18
Categorie: MEDIUM
```

```
OPT-019
Workflow: A stap 1–2 (klant en chauffeur aanmaken)
Huidig proces: Het klantformulier heeft 34 velden waarvan er precies één verplicht is ("Naam",
  minimaal 2 tekens). Er is geen duplicaatcontrole. Bewezen in deze audit: twee `POST /api/customers`
  met identieke naam én e-mail gaven beide 201 (ids 1302 en 1303). De chauffeursdialoog heeft
  dezelfde situatie met één verplicht veld.
Probleem: Dubbele klanten ontstaan stil en zijn achteraf duur om op te ruimen (zoeken, verwijderen,
  de reservering omhangen).
Waarom inefficiënt: Het systeem heeft de gegevens al om het te zien.
Impact op medewerker: De volgende medewerker kiest de verkeerde van twee identieke klanten (25.1).
Frequentie: Dagelijks (schatting).
Huidige kliks: 2 kliks om een klant aan te maken (geteld uit code); het opruimen van een duplicaat
  heeft geen vast klikpad.
Voorgesteld proces: Duplicaatdetectie op e-mailadres en telefoonnummer, met exact het patroon dat de
  bekeuringendialoog al gebruikt: "Kenmerk bestaat al: … — Openen". Dus: melden en de bestaande
  openen, niet blokkeren.
Verwachte kliks: Gelijk in het normale geval; 1 klik om naar de bestaande klant te springen in plaats
  van een duplicaat aan te maken (schatting).
Verwachte tijdwinst: Schatting — het wegvallen van de opruiming achteraf.
Vermindering menselijke fouten: Middel (25.6).
Automatiseringskans: Het patroon bestaat al en werkt.
Implementatiecomplexiteit: S.
Risico: Laag, mits het een waarschuwing blijft. Een harde blokkade op e-mail zou legitieme gevallen
  raken (twee bestuurders van hetzelfde bedrijf).
Afhankelijkheden: Geen.
Prioriteit: 19
Categorie: QUICK WIN
```

```
OPT-020
Workflow: A stap 1 (klantintake) en D stap 1 (bezorgadres)
Huidig proces: Adres, postcode en plaats zijn vrije tekst in het klantformulier én nog een keer in de
  facturatiesectie. Bij een bezorging wordt het adres een derde keer getypt, hoewel het al op de
  klantkaart staat. Het KvK-veld bestaat maar er is nergens code die er iets mee doet.
Probleem: Gegevens die het systeem al heeft of gratis kan ophalen, worden met de hand ingevoerd — en
  het adres op het contract is ook het adres waarop bekeuringen binnenkomen.
Waarom inefficiënt: `server/geocoding.ts` lost Nederlandse adressen al op, maar hangt alleen aan de
  afstandschatting voor bezorgingen.
Impact op medewerker: 4–6 getypte velden per zakelijke klant, plus het adres nog een keer per
  bezorging.
Frequentie: Elke nieuwe klant en elk bezorgadres (schatting: enkele per dag).
Huidige kliks: Klantformulier 2 kliks + veel typwerk (geteld uit code: 34 velden, 1 verplicht);
  bezorgsectie 1 klik + 4 getypte velden (geteld uit code).
Voorgesteld proces: (a) postcode + huisnummer → straat en plaats invullen bij het verlaten van het
  veld, via de bestaande geocoder of een PDOK-lookup achter één endpoint; (b) een KvK-lookup die
  bedrijfsnaam, adres en status invult; (c) een knop "Adres overnemen van klant" in de bezorgsectie.
Verwachte kliks: 1 klik om het adres over te nemen; 0 getypte adresvelden na de postcode (schatting).
Verwachte tijdwinst: Schatting — 4–6 getypte velden per zakelijke klant en 4 per bezorging.
Vermindering menselijke fouten: Middel-hoog — typfouten in adressen werken door op contracten én op
  bekeuringen.
Automatiseringskans: De geocoder bestaat al in de codebase.
Implementatiecomplexiteit: S voor de adresknop en de postcodelookup; M met de KvK-koppeling erbij.
Risico: Laag. Een externe lookup mag het formulier nooit blokkeren als hij niet antwoordt.
Afhankelijkheden: Geen. (Een BTW/VIES-controle is bewust buiten dit voorstel gelaten — zie §9.)
Prioriteit: 20
Categorie: QUICK WIN
```

```
OPT-021
Workflow: Alle
Huidig proces: Er bestaat geen enkele sneltoets buiten vier sjablooneditors. Geen "/" om de zoekbalk
  te focussen, geen "N" voor een nieuwe reservering, geen afgesproken Escape-conventie, geen globale
  handler.
Probleem: De balie is een toetsenbord-en-scannerwerkplek en het product is volledig muisgedreven.
Waarom inefficiënt: Elke handeling begint met richten en klikken, terwijl de hand al op het
  toetsenbord ligt (de scanner tikt zijn code plus Enter in het veld).
Impact op medewerker: Constant, klein, over alle werkstromen.
Frequentie: 50×/dag (schatting).
Huidige kliks: Elke ingang kost minstens 1 muisklik (geteld uit code).
Voorgesteld proces: Een kleine, ontdekbare set: Ctrl+K of "/" voor de globale zoekbalk, "N" voor een
  nieuwe reservering, "S" voor scannen, Escape sluit de dialoog, Enter verstuurt — plus een
  overzichtje van de sneltoetsen.
Verwachte kliks: 0 kliks voor de vijf meest gebruikte ingangen (schatting).
Verwachte tijdwinst: Schatting — klein per keer, merkbaar per dag.
Vermindering menselijke fouten: Laag.
Automatiseringskans: n.v.t.
Implementatiecomplexiteit: M — een globale handler die niet met invoervelden, dialogen en de
  scannerinvoer in de weg zit is meer werk dan het lijkt.
Risico: Middel. Een globale letter-sneltoets die afvuurt terwijl de scanner een code intikt is
  schadelijker dan geen sneltoets. Het scanveld en elke tekstinvoer moeten uitgezonderd worden.
Afhankelijkheden: OPT-002 (de scan-ingang waar "S" naartoe wijst).
Prioriteit: 21
Categorie: MEDIUM
```

```
OPT-022
Workflow: Herstel en geschilafhandeling
Huidig proces: De auditlog legt élke wijziging vast met veldniveau `from`/`to` en de gebruikersnaam —
  dat is aantoonbaar het sterkste onderdeel van het systeem. Maar je kunt er geen vraag over één
  record aan stellen: `GET /api/audit-logs?resourceId=3563` gaf 906 rijen (het filter wordt genegeerd)
  en `?search=3563` gaf 0. Alleen `resourceType` en `action` filteren werkt.
Probleem: De informatie om "wie heeft dit gewijzigd en wanneer" te beantwoorden bestaat, maar de vraag
  is niet te stellen.
Waarom inefficiënt: Een leidinggevende die één reservering onderzoekt moet door 906 rijen bladeren.
Impact op medewerker: Alleen bij onderzoek en geschillen, maar dan volledig blokkerend.
Frequentie: Wekelijks (schatting).
Huidige kliks: Geen werkend pad.
Voorgesteld proces: Laat `resourceId` en `search` werken, en zet een tab "Geschiedenis" op de
  reserverings-, voertuig- en klantdialoog die precies dat record toont.
Verwachte kliks: 1 klik vanaf het record (schatting).
Verwachte tijdwinst: Schatting — van bladeren door 906 rijen naar één klik.
Vermindering menselijke fouten: Hoog voor geschilafhandeling; het maakt bestaande gegevens bruikbaar.
Automatiseringskans: De gegevens worden al volledig vastgelegd.
Implementatiecomplexiteit: S.
Risico: Laag. Wel een aandachtspunt: de historie toont namen van medewerkers; wie mag die tab zien is
  een permissievraag die bij het bouwen beantwoord moet worden.
Afhankelijkheden: Geen.
Prioriteit: 22
Categorie: QUICK WIN
```

```
OPT-023
Workflow: A (boeken) en E (onderhoud plannen)
Huidig proces: Onderhoudsblokken tellen niet mee als conflict en worden niet uit de beschikbare lijst
  gefilterd. Gemeten: een voertuig met een actief blok over 2026-11-10…12 wordt gewoon aangeboden
  voor die periode, en `POST /api/reservations` voor 2026-11-11 antwoordt 201 zonder waarschuwing.
  In de kloon hebben 44 voertuigen vandaag een actief blok.
Probleem: De balie boekt een klant op een auto die al naar de garage is ingepland, zonder enig signaal.
Waarom inefficiënt: De omgekeerde richting bestaat al wél: als je onderhoud plant op een auto met
  reserveringen, dwingt het systeem een vervangerkeuze af.
Impact op medewerker: De conflictontdekking verschuift naar de dag zelf, wanneer er geen auto meer is.
Frequentie: Zodra er vooruit gepland wordt (schatting).
Huidige kliks: n.v.t. — er is geen signaal om weg te klikken.
Voorgesteld proces: Maak een actief onderhoudsblok een *zacht* conflict: sta de boeking toe maar geef
  `needsSpareVehicle` terug, precies zoals het onderhoudsplanpad dat al doet in de andere richting.
Verwachte kliks: +1 klik om de melding te bevestigen of een vervanger te kiezen (schatting).
Verwachte tijdwinst: Geen; de winst is dat het probleem bij het boeken zichtbaar wordt in plaats van
  op de dag zelf.
Vermindering menselijke fouten: Hoog (25.2).
Automatiseringskans: De `needsSpareVehicle`-afhandeling bestaat al aan de onderhoudskant.
Implementatiecomplexiteit: S.
Risico: Middel — als het een hard conflict wordt in plaats van een zacht, kan de balie legitieme
  boekingen niet meer maken rond gepland onderhoud.
Afhankelijkheden: OPT-004 (de definitie waarin dit filter thuishoort).
Prioriteit: 23
Categorie: BUSINESS DECISION — blokkeren of waarschuwen? En als waarschuwen: moet er meteen een
  vervanger gekozen worden, of mag dat later?
```

```
OPT-024
Workflow: A (ochtendvoorbereiding) en C (reserveringslijst)
Huidig proces: Bulkacties bestaan op precies één scherm: het transportdashboard (aanvinken → bulk
  afdrukken, bulk afronden). Gemeten voordeel daar: 10 transporten afronden kost 11 kliks in plaats
  van 20 (geteld uit code). Op de reserveringslijst bestaat niets vergelijkbaars, en contracten voor
  de ophalingen van morgen worden één voor één gegenereerd. Het labelafdrukpad
  (`barcode-book-dialog.tsx`) is al goed en is het model.
Probleem: Het werkende patroon is opgesloten in één scherm.
Waarom inefficiënt: Werk dat per definitie in batches komt (de ophalingen van morgen, de afronding
  van vandaag) wordt per rij gedaan.
Impact op medewerker: Dagelijks, vooral in de ochtendvoorbereiding.
Frequentie: Dagelijks (schatting).
Huidige kliks: Geteld uit code: 20 kliks voor 10 losse afrondingen tegenover 11 met bulk; contracten
  voor N ophalingen kosten N afzonderlijke handelingen.
Voorgesteld proces: Breid het aanvink-plus-bulkpatroon uit naar de reserveringslijst (bulk afronden,
  bulk afdrukken) en voeg batchgeneratie van contracten voor de ophalingen van morgen toe, in één
  afdruktaak, volgens het Barcodeboek-model.
Verwachte kliks: N+1 in plaats van N×meerdere (schatting).
Verwachte tijdwinst: Schatting — de ochtendvoorbereiding van N reserveringen in één handeling.
Vermindering menselijke fouten: Middel — minder herhaling betekent minder overgeslagen rijen.
Automatiseringskans: Het batchpatroon bestaat al in twee vormen in de codebase.
Implementatiecomplexiteit: L — twee schermen plus een batchgeneratieroute; de bestaande
  batchgeneratie is begrensd op 50 stuks, die grens moet bewust gekozen worden.
Risico: Middel. Bulkacties zonder resultaat per rij zijn schadelijker dan geen bulkacties — daarom
  moet OPT-016 eerst landen.
Afhankelijkheden: OPT-003 (bulk afronden heeft alleen zin als "afgerond" gedefinieerd is), OPT-016
  (resultaat per rij).
Prioriteit: 24
Categorie: LARGE
```

```
OPT-025
Workflow: A (intake) en J (voertuigintake)
Huidig proces: Een voertuig heeft drie verplichte velden (kenteken, merk, model) uit 46; een klant
  heeft er één ("Naam") uit 34. Een auto zonder APK-datum, zonder dagprijs en zonder service-interval
  wordt stil opgeslagen en verschijnt gewoon als verhuurbaar. Een klant zonder adres en zonder
  e-mailadres komt pas in de knel wanneer het contract gegenereerd of gemaild moet worden.
Probleem: De kosten van ontbrekende gegevens worden doorgeschoven naar het moment waarop de klant aan
  de balie staat — en verschijnen daar als lege velden of "null null" op het contract.
Waarom inefficiënt: Het invullen kost bij intake seconden en bij de balie een onderbreking.
Impact op medewerker: De baliemedewerker betaalt voor een nalatigheid van de intake.
Frequentie: Voortdurend (schatting).
Huidige kliks: Voertuigintake ≈20 kliks over 4 tabwissels (geteld uit code); klantintake 2 kliks
  (geteld uit code). Het repareren achteraf heeft geen vast klikpad.
Voorgesteld proces: Een "klaar om te verhuren"-checklist op het voertuig en op de klant, die niet bij
  de intake blokkeert maar bij het boeken waarschuwt ("deze auto mist een dagprijs en een APK-datum",
  "deze klant heeft geen e-mailadres — het contract kan niet gemaild worden"), plus harde eisen op het
  moment dat het contract gegenereerd wordt.
Verwachte kliks: 0 extra bij intake; +1 waarschuwing bij boeken in de onvolledige gevallen (schatting).
Verwachte tijdwinst: Schatting — het wegvallen van de onderbreking aan de balie.
Vermindering menselijke fouten: Middel-hoog (25.1, 25.10) — dit is de bron van BUG-162 en BUG-166.
Automatiseringskans: Klein; het is een validatie, geen automatisering.
Implementatiecomplexiteit: M.
Risico: Middel. Te streng bij intake maakt het onmogelijk om snel een auto of klant vast te leggen;
  te laat waarschuwen verandert niets.
Afhankelijkheden: BUG-162, BUG-166 (lege velden op het contract) zijn de symptomen; dit voorstel is
  de bron.
Prioriteit: 25
Categorie: BUSINESS DECISION — welke velden zijn verplicht om een auto te mogen verhuren en om een
  contract te mogen maken? Blokkeren bij intake, bij boeken, of pas bij contractgeneratie?
```

```
OPT-026
Workflow: A stap 11 (opslaan van een reservering)
Huidig proces: Het opslaan van een boeking op een BV-voertuig zet de registratie van dat voertuig
  automatisch om van BV naar Opnaam en meldt dat achteraf met een toast ("Voertuig automatisch
  gewijzigd van BV naar Opnaam (vereist voor verhuur - verzekering & wegenbelasting)").
Probleem: Een fiscaal en verzekeringstechnisch relevante eigenschap van het voertuig wordt gewijzigd
  als bijwerking van een andere handeling, zonder toestemming vooraf en zonder terugdraaiknop.
Waarom inefficiënt: De medewerker leest de melding pas nadat het gebeurd is, en moet het handmatig
  terugdraaien op de voertuigkaart als het niet de bedoeling was.
Impact op medewerker: Verrassing en handmatige correctie; en niemand kan zien of de omzetting bewust
  was.
Frequentie: Dagelijks (schatting; bij elke boeking op een BV-voertuig).
Huidige kliks: 0 om het te laten gebeuren; onbepaald om het terug te draaien (geen vast klikpad).
Voorgesteld proces: Vraag het vooraf ("Dit voertuig staat op de BV. Omzetten naar Opnaam?") of maak
  de omzetting expliciet terugdraaibaar met een vermelding in de auditlog.
Verwachte kliks: +1 bevestiging in de gevallen waar het speelt (schatting).
Verwachte tijdwinst: Geen; de winst is zeggenschap.
Vermindering menselijke fouten: Middel (25.14).
Automatiseringskans: De automatisering bestaat al — de vraag is of zij mag blijven.
Implementatiecomplexiteit: S.
Risico: Laag technisch. Als de omzetting daadwerkelijk een verzekeringsvereiste is, mag een "nee" de
  verhuring mogelijk niet toestaan — dat hoort bij de beslissing.
Afhankelijkheden: Geen.
Prioriteit: 26
Categorie: BUSINESS DECISION — mag deze omzetting ooit automatisch gebeuren? Zo nee: wat gebeurt er
  als de medewerker "nee" antwoordt — gaat de boeking dan niet door?
```

```
OPT-027
Workflow: C (wijziging na klantgesprek) en I (portaal)
Huidig proces: De portaalklant hoort niets over zijn eigen huur. Er is geen bericht bij: reservering
  aangemaakt, datums verplaatst, reservering geannuleerd, reservering verwijderd, voertuig gewisseld,
  vervanger teruggebracht, contract gegenereerd. Gemeten in keten 3: markeren voor service, blok
  aanmaken en vervanger toewijzen produceerden nul portaalnotificaties. De enige plek waar een klant
  wél iets hoort is het antwoord op zijn eigen aanvraag.
Probleem: Het portaal is gebouwd en spreekt alleen over onderhoud; de ervaring van de klant hangt af
  van door welke deur de wijziging binnenkwam.
Waarom inefficiënt: De medewerker belt of mailt de klant handmatig — of vergeet het.
Impact op medewerker: Handwerk per wijziging, en klachten achteraf.
Frequentie: Elke kantoorzijdige wijziging (schatting: dagelijks).
Huidige kliks: 0 automatisch; handmatig informeren via de documentmaildialoog kost ≈9 kliks (geteld
  uit code).
Voorgesteld proces: Breid de bestaande portaalnotificatieservice uit naar gewone huurovereenkomsten,
  met een per gebeurtenis in te stellen keuze wat er wél en niet gemeld wordt.
Verwachte kliks: 0 (schatting) — het bericht gaat vanzelf bij de wijziging die de medewerker toch al
  doet.
Verwachte tijdwinst: Schatting — elke handmatige klantmelding die nu naast de app om gaat.
Vermindering menselijke fouten: Middel-hoog (25.11) — mits de ontvangerbepaling klopt; de bestaande
  bulkmailroute stuurt vandaag één APK-herinnering naar vier klanten (BUG-170).
Automatiseringskans: `server/services/portal-maintenance-events.ts` bestaat en dekt één
  gebeurtenistype.
Implementatiecomplexiteit: M.
Risico: Hoog qua zichtbaarheid: dit is het enige voorstel waarbij een fout rechtstreeks bij de klant
  landt. Niets hiervan mag live voordat BUG-170 (verkeerde ontvangers) en OPT-013 (logging) klaar zijn.
Afhankelijkheden: BUG-134 (de ontbrekende notificaties), BUG-170 (ontvangerbepaling), OPT-013.
Prioriteit: 27
Categorie: BUSINESS DECISION — welke gebeurtenissen zijn de zaak van de klant? Wil de eigenaar dat de
  klant een annulering of een voertuigwissel automatisch te horen krijgt, of blijft dat een telefoontje?
```

```
OPT-028
Workflow: C (annuleren)
Huidig proces: Een reservering annuleren doet verder niets: het transport blijft gepland, de
  chauffeurstoewijzing blijft open, de vervanger en de placeholder blijven actief. Die restanten
  blokkeren vervolgens andere boekingen.
Probleem: Eén bedrijfsgebeurtenis ("deze huur gaat niet door") werkt niet door naar de records die
  eraan hangen.
Waarom inefficiënt: De medewerker moet zelf onthouden welke vier andere dingen opgeruimd moeten
  worden, in vier verschillende schermen.
Impact op medewerker: Vergeten restanten blokkeren later onverklaarbaar andere boekingen.
Frequentie: Elke annulering (schatting: dagelijks).
Huidige kliks: 1–2 om te annuleren (geteld uit code); het opruimen van de restanten heeft geen vast
  klikpad.
Voorgesteld proces: Ofwel cascaderen (transport, chauffeur, vervanger en placeholder mee opruimen),
  ofwel een expliciete tussenstap "wat moet er verder gebeuren?" met aanvinkbare gevolgen.
Verwachte kliks: 1–2 bij cascaderen; 2–3 bij de expliciete vraag (schatting).
Verwachte tijdwinst: Schatting — vier schermwissels per annulering.
Vermindering menselijke fouten: Hoog — dit is de bron van de verouderde vervangers (25.13).
Automatiseringskans: Groot, maar het is precies het soort automatisering dat stil schade kan doen als
  het te breed cascadeert.
Implementatiecomplexiteit: M — het moet transactioneel.
Risico: Hoog bij cascaderen: een transport dat al onderweg is mag niet verdwijnen omdat iemand de
  reservering annuleert.
Afhankelijkheden: BUG-112, BUG-115, BUG-118.
Prioriteit: 28
Categorie: BUSINESS DECISION — automatisch cascaderen of expliciet vragen? En welke gevolgen mogen
  onder geen beding automatisch verdwijnen (een lopend transport, een al overhandigde vervanger)?
```

```
OPT-029
Workflow: D (transport) — pechomruil
Huidig proces: `POST /api/transports` met `spareRequired` doet het juiste: placeholder aangemaakt,
  origineel voertuig gevlagd, TBD-wachtrij bijgewerkt. Daarna gaat het mis. Het scannen van de
  vervanger op de transportdag toont niets (de reservering lag drie dagen vooruit en de scanroute
  meldde `upcomingReservation: null`). Het afronden van het transport reset de werkplaatsvlag naar
  `ok` en wist de notitie — precies op het moment dat de auto bij de garage aankomt. En de
  oorspronkelijke huur blijft gewoon open staan op een auto die in de werkplaats staat: twee huren en
  twee `rented`-auto's voor één klant.
Probleem: De omruil wordt vastgelegd, maar de gevolgen ervan worden ongedaan gemaakt door de
  vastlegging zelf.
Waarom inefficiënt: Facturatie, verzekering en de achterstallige-lijst zien twee actieve huren.
Impact op medewerker: Niemand kan aan de balie zien welke auto nu bij welke klant hoort.
Frequentie: Elke pechomruil (schatting: enkele per week).
Huidige kliks: De omruil zelf is goed geautomatiseerd; het opruimen achteraf heeft geen klikpad.
Voorgesteld proces: (a) toon op de scankaart het gekoppelde transport en de vervangerrol ("vervanger
  voor transport #73") en verbreed het venster waarin een toekomstige reservering meetelt; (b) behoud
  de werkplaatsvlag bij het afronden van het transport en wis hem pas bij het afsluiten van de
  reparatie (OPT-015); (c) sluit of schors de oorspronkelijke huur als onderdeel van de omruil.
Verwachte kliks: 1 klik voor de omruilafronding in plaats van de huidige losse handelingen
  (schatting).
Verwachte tijdwinst: Schatting — vooral het wegvallen van het uitzoekwerk achteraf.
Vermindering menselijke fouten: Hoog — verwijdert DE-7 en B2-1.
Automatiseringskans: Middel; onderdeel (a) is puur presentatie, (b) is een regel, (c) is nieuw gedrag.
Implementatiecomplexiteit: M.
Risico: Middel-hoog. Onderdeel (c) raakt facturatie: als de oorspronkelijke huur wordt afgesloten, is
  de vraag wat er met de afgesproken prijs en periode gebeurt.
Afhankelijkheden: BUG-114 en BUG-115 (transport verplaatsen/annuleren laat de vervanger staan) —
  deze twee zijn trackerbugs en worden in fase 35 opgelost; OPT-006 (werkplaatsvlag).
Prioriteit: 29
Categorie: BUSINESS DECISION — wat gebeurt er bij een omruil met de oorspronkelijke huur: doorlopen,
  schorsen of afsluiten? En wat betekent dat voor de facturatie van de vervangingsperiode?
```

```
OPT-030
Workflow: A (prijs) en alle financiële rapportage
Huidig proces: De totaalprijs wordt automatisch berekend uit dagprijs × dagen, maar stopt permanent
  met herberekenen zodra de medewerker het veld één keer aanraakt. Er is geen `pricePerDay` op de
  reservering. Open-einde-huren krijgen helemaal geen prijs. De server valideert de prijs nooit en de
  financiële rapportage telt `totalPrice` letterlijk op. Gecombineerd met BUG-019 (inname overschrijft
  de einddatum) ontstaat de situatie uit keten 1: "1 dag, € 135" voor een driedaagse huur.
Probleem: Zodra iemand de prijs één keer met de hand aanpast, is de relatie tussen periode en bedrag
  verbroken — en niets meldt dat.
Waarom inefficiënt: Rapportages over omzet en bezetting zijn vanaf dat moment niet te vertrouwen.
Impact op medewerker: Onzichtbaar voor de medewerker; volledig zichtbaar in de cijfers van de eigenaar.
Frequentie: Elke bewerkte boeking (schatting); alle open-einde-huren.
Huidige kliks: 0–5 kliks voor de prijssectie (geteld uit code); de correctie achteraf heeft geen
  klikpad.
Voorgesteld proces: Sla `pricePerDay` op de reservering op, herbereken bij een datumwijziging en toon
  "handmatig aangepast" met een resetknop; definieer een prijsmodel voor open-einde-huren
  (maandelijks of periodiek); laat de server de prijs opnieuw berekenen en vergelijken met een
  tolerantie.
Verwachte kliks: Gelijk of minder (de prijs volgt vanzelf) (schatting).
Verwachte tijdwinst: Schatting — geen kliktijd; de winst is betrouwbare cijfers.
Vermindering menselijke fouten: Hoog voor de financiële kant.
Automatiseringskans: Groot, maar alleen als het prijsmodel eerst vastligt.
Implementatiecomplexiteit: L — nieuwe kolom, herberekening, servervalidatie en een prijsmodel voor
  open einde.
Risico: Hoog. Een automatische herberekening kan een met de klant afgesproken prijs overschrijven.
  Dit mag alleen met een expliciete "handmatig aangepast"-status.
Afhankelijkheden: BUG-019 (de einddatum moet kloppen voordat prijs op periode gebaseerd kan worden);
  BUG-143/144/145 (de bestaande datarommel moet bekend zijn voordat er over historische cijfers
  geoordeeld wordt).
Prioriteit: 30
Categorie: BUSINESS DECISION — volgt de prijs een datumwijziging automatisch of niet? Wat is het
  prijsmodel voor open-einde-huren? Is er een kilometerbundel, en wat kost overschrijding?
```

```
OPT-031
Workflow: J (voertuigintake)
Huidig proces: De bulk-kentekenimport belooft in het Nederlandse scherm dat voertuiggegevens
  automatisch uit de RDW-database worden opgehaald, maar de handler roept de RDW-lookup nooit aan en
  schrijft `brand: "Unknown"`, `model: "Unknown"`. De CSV/XLSX-import neemt merk, model en APK
  ongecontroleerd over uit het blad. De importlus haalt per rij de volledige vloot op en er is geen
  bovengrens op de batch. De voortgangsbalk staat vast op 5 % en beweegt nooit.
Probleem: Een belofte in de UI die het tegenovergestelde doet, bovenop een importroutine die niet
  schaalt en waarvan de voortgang nep is.
Waarom inefficiënt: Wat een plak-de-kentekens-actie kon zijn, is een handmatige invoer van tientallen
  velden per auto.
Impact op medewerker: Bij elke vlootintake; en gebruikers breken imports af die gewoon bezig zijn.
Frequentie: Per vlootintake (schatting: enkele keren per jaar, maar dan groot).
Huidige kliks: Handmatige voertuigintake ≈20 kliks + veel typwerk per auto (geteld uit code).
Voorgesteld proces: Roep de bestaande RDW-client per rij aan met een fallback per rij; verrijk en
  verifieer de CSV-import tegen RDW en markeer afwijkingen; laad de vloot één keer in plaats van per
  rij; begrens de batch; toon echte voortgang of geen. Optioneel: breid de nachtelijke RDW-scan uit
  naar de velden die hij al binnenkrijgt (brandstof, euroklasse, WOK, registratie) met dezelfde
  bevestigingswachtrij die APK-datums al hebben.
Verwachte kliks: 1 plakactie + 1 bevestiging voor N auto's (schatting).
Verwachte tijdwinst: Schatting — 30 velden per auto worden nul.
Vermindering menselijke fouten: Hoog — een verkeerd getypt kenteken wordt zichtbaar voordat het een
  volledig voertuigrecord wordt.
Automatiseringskans: De RDW-client bestaat, werkt en wordt op de handmatige knop al gebruikt.
Implementatiecomplexiteit: M.
Risico: Laag-middel; een RDW-uitval moet de import niet laten mislukken maar per rij terugvallen.
  De uitbreiding van de nachtelijke scan is apart te nemen en vraagt wél een keuze (automatisch
  toepassen of in een bevestigingswachtrij) — dat deel is dan BUSINESS DECISION.
Afhankelijkheden: Geen.
Prioriteit: 31
Categorie: MEDIUM
```

```
OPT-032
Workflow: Sleutelkastaudit (barcode)
Huidig proces: De sleutelkastaudit is het beste doorlopende scanpatroon in het product: 1 handeling
  per sleutel, 0 kliks ertussen, duplicaten gemeld ("Al gescand"), verkeerde sleutelsoort geweigerd
  ("Dit is een hoofdsleutel. Scan het reservesleutel-label (-S)."). Maar het resultaat —
  "Ontbrekende sleutels" en "Onverwacht aanwezig (voertuig staat als verhuurd)" — leeft alleen in de
  componentstatus en verdwijnt bij het sluiten. Er is geen opslagroute. Bovendien worden scans die
  binnenkomen terwijl de vorige lookup nog loopt zonder melding weggegooid.
Probleem: De audit wordt gedaan om een vastlegging op te leveren, en levert geen vastlegging op. Een
  weggegooide scan verschijnt bovendien als "ontbrekend" — een vals alarm.
Waarom inefficiënt: Het werk is gedaan en het resultaat is weg.
Impact op medewerker: De hele ronde moet overgedaan of met de hand overgeschreven worden.
Frequentie: Maandelijks tot per kwartaal (schatting).
Huidige kliks: 1 scan per sleutel, 0 kliks ertussen (geteld uit code); 0 mogelijkheden om te bewaren.
Voorgesteld proces: Leg een auditronde vast (wie, wanneer, welke sleutels ontbraken, wat onverwacht
  aanwezig was) en maak hem afdrukbaar; zet binnenkomende codes in een wachtrij in plaats van ze weg
  te gooien.
Verwachte kliks: 1 extra klik ("Ronde afsluiten en bewaren") (schatting).
Verwachte tijdwinst: Schatting — het overschrijven of overdoen van een hele ronde vervalt.
Vermindering menselijke fouten: Hoog — valse "ontbrekend"-meldingen door weggegooide scans verdwijnen.
Automatiseringskans: Klein; het is opslag, niet automatisering.
Implementatiecomplexiteit: M (nieuwe tabel + route + afdrukweergave).
Risico: Laag.
Afhankelijkheden: Geen.
Prioriteit: 32
Categorie: BUSINESS DECISION — is de sleutelkastaudit een nalevingsdocument? Zo ja: hoe lang moet hij
  bewaard blijven, wie mag hem inzien en moet hij ondertekend worden?
```

```
OPT-033
Workflow: Alle — gegevensintegriteit
Huidig proces: `reservations` heeft geen foreign key naar `vehicles` en geen naar `customers`. Een
  klant verwijderen is een kale `DELETE` zonder afhankelijkheidscontrole en zonder prullenbaksnapshot;
  het bijbehorende portaalaccount wordt wél gecascadeerd verwijderd. Een voertuig verwijderen is een
  harde verwijdering met snapshot, waarbij de transporten van dat voertuig gecascadeerd worden
  verwijderd. Gemeten in de kloon: 262 reserveringen wijzen naar een niet-bestaand voertuig en 4 naar
  een niet-bestaande klant.
Probleem: Het datamodel laat verweesde rijen ontstaan en vernietigt bij sommige verwijderingen meer
  dan de gebruiker ziet. Dit is het mechanisme van het incident van 2026-08-25.
Waarom inefficiënt: De gevolgen zijn niet te overzien op het moment van de handeling, en niet zelf te
  herstellen.
Impact op medewerker: Zeldzaam, maar dan volledig buiten zijn macht.
Frequentie: Zeldzaam, catastrofaal (schatting).
Huidige kliks: Voertuig verwijderen is goed beveiligd (kenteken typen + impactvoorbeeld, geteld uit
  code); klant verwijderen niet.
Voorgesteld proces: Voeg foreign keys toe (of een bewaakte verwijdering met afhankelijkheidscontrole),
  breid de prullenbak uit naar klanten met hetzelfde impactvoorbeeld dat voertuigen al hebben, en maak
  de cascade naar portaalaccounts en transporten expliciet zichtbaar vóór de bevestiging.
Verwachte kliks: +1 à +2 bevestigingskliks bij verwijderen (schatting).
Verwachte tijdwinst: Geen; de winst is uitsluitend het voorkomen van onherstelbaar verlies.
Vermindering menselijke fouten: Zeer hoog voor de gevolgen.
Automatiseringskans: n.v.t.
Implementatiecomplexiteit: L — het is een migratie, en de bestaande 262 + 4 verweesde rijen moeten
  eerst opgeruimd of geaccepteerd worden voordat een foreign key aangezet kan worden.
Risico: Hoog. Een foreign key op een tabel met bestaande verweesde rijen faalt bij het aanzetten; de
  productie-opschoning moet eerst plaatsvinden en dat is zelf een risicovolle actie.
Afhankelijkheden: BUG-143/BUG-144/BUG-145 (de bestaande datarommel moet eerst gemeten en opgeruimd
  worden in productie, niet in de kloon), OPT-018 (prullenbak voor reserveringen hoort in dezelfde
  beweging).
Prioriteit: 33
Categorie: BUSINESS DECISION — dit is een databasemigratie op productiedata. De eigenaar moet
  beslissen of de verweesde rijen opgeruimd of bewaard worden, en of een klant met historie nog
  verwijderd mag kunnen worden.
```

---

## 8. Mapping WF / BF → OPT

55 kandidaten in, 33 OPT-voorstellen uit: **33 kandidaten zijn leidend voor een OPT, 19 zijn
samengevoegd in een ander OPT, en 3 zijn geen OPT** (het zijn bekende defecten die in fase 35 worden
opgelost). Er is niets weggelaten.

### 8.1 WF-001 … WF-024 (fase 21)

| Kandidaat | Bestemming |
|---|---|
| WF-001 | **OPT-001** (leidend) |
| WF-002 | **OPT-002** (leidend) |
| WF-003 | **OPT-004** (leidend) |
| WF-004 | **OPT-005** (leidend) |
| WF-005 | samengevoegd in OPT-005 (afdrukken/mailen in dezelfde dialoog) |
| WF-006 | **OPT-018** (leidend) |
| WF-007 | **OPT-017** (leidend) |
| WF-008 | samengevoegd in OPT-017 (inname terugdraaien met behoud van `endDate`) |
| WF-009 | samengevoegd in OPT-017 (ophaling terugdraaien als echte compenserende handeling) |
| WF-010 | **OPT-007** (leidend) |
| WF-011 | **OPT-011** (leidend) |
| WF-012 | **OPT-025** (leidend) |
| WF-013 | **OPT-019** (leidend) |
| WF-014 | **OPT-010** (leidend) |
| WF-015 | samengevoegd in OPT-009 (vervangersuggestie + TBD-toast opent de dialoog) |
| WF-016 | samengevoegd in OPT-020 ("Adres overnemen van klant") |
| WF-017 | **OPT-012** (leidend) |
| WF-018 | **OPT-021** (leidend) |
| WF-019 | **OPT-022** (leidend) |
| WF-020 | **OPT-026** (leidend) |
| WF-021 | samengevoegd in OPT-002 (scanpaneel promoveren; de 768 px-layout is BUG-218, geen OPT) |
| WF-022 | samengevoegd in OPT-003 (afsluiten bij inname) |
| WF-023 | **OPT-024** (leidend) |
| WF-024 | samengevoegd in OPT-014 (regenereren, vorige versie vervallen verklaren, één sjabloonbeheer) |

### 8.2 BF-001 … BF-031 (fase 22)

| Kandidaat | Bestemming |
|---|---|
| BF-001 | **geen OPT: bestaande BUG-202 + BUG-106 / fase-35-fix.** Beide staan als afhankelijkheid onder OPT-010 |
| BF-002 | samengevoegd in OPT-001 ("Openstaande punten") |
| BF-003 | **OPT-003** (leidend) |
| BF-004 | samengevoegd in OPT-004 (één definitie, dode helft van de statusmachine) |
| BF-005 | samengevoegd in OPT-007 (`getStatusOnReturn` aanroepen; `needs_fixing` bewaren) |
| BF-006 | **OPT-008** (leidend) |
| BF-007 | **OPT-015** (leidend) |
| BF-008 | **OPT-013** (leidend) |
| BF-009 | **OPT-014** (leidend) |
| BF-010 | samengevoegd in OPT-014 (echte `version`-kolom) |
| BF-011 | **OPT-031** (leidend) |
| BF-012 | **OPT-020** (leidend) voor het opzoekdeel; het deel "contractkritische velden verplicht" is samengevoegd in **OPT-025** |
| BF-013 | **OPT-009** (leidend) |
| BF-014 | **OPT-023** (leidend) |
| BF-015 | samengevoegd in OPT-004 (`not_for_rental` al bij het boeken weigeren) |
| BF-016 | **OPT-030** (leidend) |
| BF-017 | **geen OPT: bestaande BUG-019 / fase-35-fix.** De bedrijfsvraag eronder (blijft de afgesproken einddatum staan en volgt de prijs?) wordt beantwoord in OPT-030; BUG-019 staat als afhankelijkheid onder OPT-003 en OPT-030 |
| BF-018 | samengevoegd in OPT-002 (doorlopende scanmodus, "Opnieuw scannen", `openScanDialog`) |
| BF-019 | **OPT-032** (leidend) |
| BF-020 | **OPT-029** (leidend). Het scankaart-deel (C-09) is samengevoegd in OPT-002; het behoud van de werkplaatsvlag is samengevoegd in OPT-006/OPT-015 |
| BF-021 | **geen OPT: bestaande BUG-114 + BUG-115 / fase-35-fix.** Staat als afhankelijkheid onder OPT-029 |
| BF-022 | **OPT-028** (leidend) |
| BF-023 | **OPT-027** (leidend) |
| BF-024 | samengevoegd in OPT-001 (transport-, onderhouds- en portaalwidget; de grens van 5 rijen) |
| BF-025 | **OPT-016** (leidend) |
| BF-026 | samengevoegd in OPT-024 (batchcontracten voor de ophalingen van morgen) |
| BF-027 | samengevoegd in OPT-031 (vloot één keer laden, batch begrenzen, echte voortgang) |
| BF-028 | samengevoegd in OPT-021 (sneltoetsen) |
| BF-029 | samengevoegd in OPT-012 (debounce, zoekterm wissen, i18n) |
| BF-030 | **OPT-033** (leidend) |
| BF-031 | **OPT-006** (leidend) |

---

## 9. Wat expliciet NIET wordt voorgesteld

Overwogen en bewust niet als OPT opgenomen, met de reden:

1. **Bulk ophalen en bulk innemen.** Elke auto heeft een eigen kilometerstand, brandstofniveau en
   schadecheck nodig; een batchscherm zou simpelweg dezelfde formulieren achter elkaar zijn. Geen winst.
2. **Bulk klantgegevens bewerken.** De velden zijn van nature per klant.
3. **Bulk prijswijziging.** Er is geen `pricePerDay`-veld om te wijzigen; dit kan pas bestaan ná
   OPT-030, en dan nog is de vraag of het gewenst is.
4. **Het splitsen van `shared/schema.ts` (2 110 regels).** 63 modules hangen eraan; splitsen levert
   63 importwijzigingen en geen enkel voordeel voor de gebruiker. Fase 20 noemt dit expliciet.
5. **Het ontwarren van de 8 client-importcycli rond `use-portal-dialogs.tsx`.** Echt aanwezig, maar
   goedaardig onder een bundler en beperkt tot de portaaldialogen. Acht bestanden raken voor nul
   gedragswinst.
6. **Het opsplitsen van `vehicle-details.tsx` en `settings-panel.tsx`.** Groot, maar het zijn
   tabcontainers: de complexiteit is breedte, geen diepte, en er zijn geen tests om een regressie te
   vangen. Lagere waarde dan de kalenderpagina.
7. **Het verwijderen van de fallback-padlogica in `documents/view|download`.** Dat is vandaag het
   enige dat oude documentrijen leesbaar houdt. Eerst CQ-003 oplossen en de rijen migreren.
8. **`archiver` vervangen voor het schrijven van back-ups.** Werkt, is end-to-end geverifieerd in
   fase 17 en streamt. Alleen de ongebruikte `tar`-dependency hoort weg (CQ-014).
9. **Een BTW/VIES-controle bij de klantintake.** Overwogen bij OPT-020, maar het roept meteen een
   beleidsvraag op (is een mislukte controle een blokkade of een waarschuwing?) die niet in een
   QUICK WIN thuishoort. Kan later als eigen voorstel terugkomen.
10. **Terugkerende reserveringen implementeren.** Zes kolommen bestaan en zijn schrijfbaar via de API,
    maar er is geen generator en nul verwijzingen in de client. Dit is een productbeslissing
    ("willen we dit?"), geen werkprocesverbetering. Tot die beslissing genomen is, is het enige
    verstandige het veld uit de geaccepteerde payload te halen — dat is een opruimactie (CQ-015),
    geen OPT.
11. **Het wegwerken van de 711 `any`-voorkomens, de 982 `console.*`-aanroepen en de 196
    hardgecodeerde strings als project op zich.** Dat zijn codekwaliteitsbevindingen (CQ-025,
    CQ-029), geen werkprocesvoorstellen; ze horen meegenomen te worden in het werk dat er toch al
    langskomt.
12. **Alle 230 bekende defecten.** Die zijn geen OPT en worden niet in fase 32 opnieuw voorgesteld;
    ze horen in fase 35. Waar een OPT niet zonder zo'n fix kan, staat de BUG-id onder
    "Afhankelijkheden".

---

## 10. Niet gedekt

- **Geen browser.** Fase 21 en 22 hadden geen browser tot hun beschikking; alle klik- en veldtellingen
  zijn uit de JSX geteld, niet geklikt. Fase 18 deed het browserwerk en die bevindingen staan in
  `07-phase-17-19-rapport.md`. Afdrukken is opnieuw niet waarneembaar geweest.
- **Geen tijdmetingen.** Er is geen enkele werkelijke doorlooptijd van een medewerker gemeten. Elk
  getal over tijdwinst in §7 is een schatting die uit de kliktellingen is afgeleid.
- **Geen gebruiksdata.** Frequenties ("50×/dag", "dagelijks", "wekelijks") komen uit de opdracht en
  uit de vorm van de data in de kloon, niet uit gemeten gebruik. De app legt wel `audit_logs` vast —
  daaruit is de werkelijke frequentie per handeling af te leiden, en dat is nog niet gedaan.
- **Geen productiegetallen.** Alles is gemeten op `lvs_audit`, een kloon van DEV met bekende
  datarommel. De 788 poortrijen, 423 geblokkeerde voertuigen, 362 achterstallige rijen, 262 + 4
  verweesde rijen en 44 open blokken moeten opnieuw gemeten worden tegen productie vóór er iets op
  gebouwd wordt.
- **Geen kostenraming.** "S / M / L" komt uit de bronrapporten en betekent respectievelijk ≤ 1 dag,
  ≤ 1 week, > 1 week. Dat is een grofheidsklasse, geen offerte.
- **Geen prioritering op omzet.** De rangschikking weegt frequentie, medewerkers, tijd, fouten,
  bedrijfsimpact, inspanning en risico — niet de financiële opbrengst, omdat die niet meetbaar was
  binnen deze fases.
- **Geen ontwerp.** Geen enkel voorstel bevat een schermontwerp, een veldindeling of een technisch
  ontwerp. Dat hoort bij fase 34, en alleen voor wat is goedgekeurd.
- **Cyclomatische complexiteit per functie** is niet gemeten (geen eslint in dit project; installeren
  zou de projectconfiguratie wijzigen). In plaats daarvan is functiegrootte gemeten.
- **Testkwaliteit** is niet beoordeeld — alleen de dekkingskaart is gemaakt.

---

## GOEDKEURINGSPOORT — STOP POINT 8

**Er is niets geïmplementeerd.** Er is in fase 20 tot en met 33 geen applicatiecode gewijzigd, niets
gecommit, geen database gemuteerd buiten de wegwerpkloon `lvs_audit`, en de applicatie is niet in
productie gedraaid. Alle 33 OPT-voorstellen in §7 zijn **voorstellen**: er is niets gebouwd, niets
gepland en niets toegezegd.

**Wat de eigenaar nu kan doen:**

- **alles goedkeuren** — alle 33 voorstellen gaan door naar fase 34 (ontwerp), of
- **specifieke OPT-ids goedkeuren** — noem de nummers; alleen die gaan door, of
- **afwijzen** — geheel of per voorstel, met of zonder reden, of
- **wijzigen** — een voorstel aanpassen, splitsen of samenvoegen voordat het doorgaat, of
- **meer analyse vragen** — bijvoorbeeld de werkelijke frequenties uit `audit_logs`, de
  productiemetingen die §10 noemt, of een uitwerking van één specifiek voorstel.

**Alleen goedgekeurde voorstellen gaan door naar fase 34.** Wat niet expliciet is goedgekeurd, blijft
staan als voorstel en wordt niet ontworpen en niet gebouwd.

**Zestien van de 33 voorstellen zijn BUSINESS DECISION** (OPT-001, 003, 004, 007, 009, 014, 017, 023,
025, 026, 027, 028, 029, 030, 032, 033). Die kunnen niet technisch worden opgelost: bij elk daarvan
staat onder "Categorie" exact welke vraag de eigenaar moet beantwoorden. Zonder dat antwoord kan het
ontwerp niet beginnen.

**Als tijdens fase 34 of later een nieuwe bedrijfsbeslissing aan het licht komt** — een regel die niet
in dit rapport staat en die bepaalt wat de medewerker moet doen, wat de klant ziet of wat een status
betekent — dan stopt het werk daar en volgt een nieuwe goedkeuringspoort. Er wordt geen
bedrijfsregel ingevuld zonder de eigenaar.

HARD STOP — STOP POINT 8
