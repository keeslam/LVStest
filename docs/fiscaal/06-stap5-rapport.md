# Stap 5: RDW-profiel, nachtelijke run, klantportaal en meldingen (STOP POINT 5)

Datum 17 september 2026. Branch `fix/audit-remediation`. Alles is test-first gebouwd.

## 1. Wat er staat

| Onderdeel | Waar | Wat het doet |
|---|---|---|
| RDW-ophaling | `server/utils/rdw-api.ts` (`fetchRdwFiscalData`) | Twee open-datasets per kenteken: kentekenregistratie (`m9d7-ebf2`: catalogusprijs, Europese voertuigcategorie, voertuigsoort, inrichting, datum eerste toelating) en brandstof/emissie (`8ys7-d773`: alle brandstofrijen, CO₂ (WLTP eerst), hybrideklasse). Injecteerbare `fetch`, 5 s time-out, dezelfde foutklassen als de bestaande client. |
| Profielverversing | `server/services/fiscal/profiles.ts` (`normaliseRdwFiscal`, `refreshFromRdw`) | Ruwe rijen en ophaaltijd bewaard; genormaliseerde feiten met bron `rdw`; brandstofklasse uit de brandstofrijen (alleen elektrisch/waterstof = emissievrij; mix of hybrideklasse = hybride); een handmatige waarde wordt nooit overschreven; een fout komt in `rdw_error` en wordt nooit gegooid. Geaudit als `profile_refreshed` met de gewijzigde velden. Knop **RDW opnieuw ophalen** op de voertuigtab (recht `manage_fiscal_review`), gevolgd door herbeoordeling van de open perioden. |
| Nachtelijke run | `server/services/fiscal/nightly.ts`, `server/fiscalScheduler.ts` (03:30 Europe/Amsterdam) | Klanten met de hoofdschakelaar aan; regelversie die vandaag van kracht wordt → kantoormelding; open perioden in het venster [vandaag − 45, vandaag + vooruitkijkdagen]; verouderde profielen (> 30 dagen) verversen met 250 ms pauze; elke periode beoordelen (ongewijzigd = niets schrijven); meldingen. Alle knoppen zijn argumenten, dus testbaar zonder klok of netwerk. |
| Meldingen (F-06) | `server/services/fiscal/fiscal-notifications.ts` | Kantoor (`custom_notifications`): beoordeling nodig, gegevens ontbreken, versie vandaag van kracht; één per (soort, link) per 30 dagen. Klant (`portal_notifications`, alleen met `fiscal_warnings_enabled`): gegevens ontbreken, beoordeling door Lam Groep, vervanging nadert de vrijstellingsgrens (parameter `WARN_DAYS_BEFORE_REPLACEMENT_LIMIT`), nieuwe kalendermaand nadert (parameter `WARN_ON_MONTH_BOUNDARY`); dedupe-tags per periode. Nooit conceptversies, nooit interne parameters. |
| Portaalroutes | `server/routes/portal-fiscal.ts`, `server/services/fiscal/portal-storage.ts` | In het portaalrealm: `GET /api/portal/fiscal/summary`, `/vehicles`, `/reservations/:id`, `PATCH /reservations/:id/usage`. De klant komt uit de sessie; poort `requireFeature("canViewFiscal")` (plafond `fiscal_mobility_enabled`); bestuurdersrol alleen eigen huren én alleen met `driver_fiscal_visibility_enabled`; bedragen en de regels met € in de uitleg alleen met `fiscal_dashboard_enabled` (F-05); bevestigen alleen door de klantbeheerder (F-02), geaudit als `portal_admin` met het e-mailadres. |
| Portaalpagina | `client/src/pages/portal/fiscal.tsx`, tab **Fiscale check** in `PortalLayout` | Per auto per periode: status in gewone taal, ontbrekende gegevens, uitleg (in- en uitklapbaar), bedrag alleen als de klant dat mag zien, en de vragen (privé, woon-werk, vóór 2027, gebruik, reden van vervanging, vervangen auto); bestuurders lezen alleen. Disclaimer boven en onder. |
| Gedeelde DTO's | `shared/fiscal-types.ts` | `PortalFiscalPeriodDto`, `PortalFiscalVehicleDto`, `PortalFiscalSummaryDto`, gebruikt door server en client. |
| Herstelronde gebruiksperioden | `server/services/fiscal/usage-periods.ts` (`reconcileUsagePeriods`), `server/database-storage.ts` | Elke schrijfroute van de reserveringsopslag (dertien methoden: aanmaken en wijzigen met boekingscontrole, ophalen, innemen, annuleren, vervangende auto aanmaken en sluiten, tijdelijke reservering en toewijzing, herstellen, verwijderen) roept na de schrijfactie de afleiding van de gebruiksperiode aan. Daaronder een vangnet: bij het opstarten en in de nachtelijke run worden reserveringen zonder periode, reserveringen die na de laatste afleiding zijn gewijzigd en open perioden van geannuleerde of verwijderde reserveringen opnieuw afgeleid. Een gemiste periode is dus nooit langer dan één nacht stil. |

## 2. RDW-dekking op de echte vloot

Kees leverde 99 kentekens; die zijn alleen gelezen (publieke open data), niets is opgeslagen.

| Meting | Uitkomst |
|---|---|
| Gevonden | 95 van 99. Niet gevonden: 55-95-YN, 69-SFF-2, 70-BV-TL, 87-DT-SL (geëxporteerd, gesloopt of tikfout; handmatig nakijken). |
| Categorie | M1 (personenauto) 81 · N1 (bedrijfsauto) 9 · O2 (aanhangwagen) 2 · L1/L6 (bromfiets) 3 |
| Brandstofklasse | fossiel 90 · emissievrij 2 · hybride 1 (GGD-74-K, NOVC-HEV) · onbekend 2 (aanhangwagens zonder brandstofrijen) |
| Catalogusprijs | aanwezig bij **56 van 95 (59%)**. Ontbreekt bij vrijwel alle auto's met eerste toelating vóór 2009 en bij de bedrijfsauto's en aanhangwagens. Voor de personenauto's zonder catalogusprijs geldt: leeftijd > 25 jaar → waarde economisch verkeer (handmatig, F-08); jonger → catalogusprijs handmatig met bron (kentekenbewijs, importeur). |
| CO₂ | 72 van 95 |
| Datum eerste toelating | 95 van 95 |
| De vier met * | G-870-TZ, G-874-TZ, G-875-TZ, G-891-TZ: M1, fossiel, catalogusprijs € 50.701,00, CO₂ 188, eerste toelating 9 december 2019 — volledig automatisch beoordeelbaar. |

Gevolg voor de werkwijze: na de deploy vult de nachtelijke run de profielen; de auto's zonder
catalogusprijs verschijnen in de beoordelingswachtrij zodra ze een periode vanaf 2027 hebben, en
kantoor vult daar de waarde in (met bron). Voor bedrijfsauto's (N1) is dat niet nodig: die vallen
buiten de regel en krijgen `NOT_APPLICABLE`.


## 2b. Gevonden en verholpen tijdens de productietest (:5004, kloon van de productiedatabase)

| Bevinding | Oorzaak | Verholpen |
|---|---|---|
| Een reservering vanaf 2027 die via het gewone boekingsscherm werd aangemaakt kreeg **geen gebruiksperiode**; de fiscale check bleef er stil over. | De boekingsroute schrijft via `createReservationChecked` (met boekingscontrole in één transactie); de fiscale hook uit stap 3 zat alleen op `createReservation`, `updateReservation`, `softDeleteReservation` en `restoreDeletedRecord`. Negen andere schrijfroutes (ophalen, innemen, annuleren, vervangende auto, tijdelijke reservering, toewijzing, sluiten) misten hem ook. | Hook op alle dertien schrijfroutes plus de herstelronde (zie §1). Test `usage-periods.test.ts` dekt nu elke route en de herstelronde; `nightly.test.ts` dekt de herstelronde in de nachtelijke run. |
| De test "de klantbeheerder bevestigt het gebruik" faalde in de volledige suite (drie auditregels in plaats van één). | Het opruimen van portaaltestgegevens liet de fiscale auditregels staan die een portaalbeheerder onder zijn e-mailadres achterlaat. | `cleanupPortalTestData` wist die regels nu ook. |

Geverifieerd in de browser op de kloon: knop **RDW opnieuw ophalen** op G-870-TZ vult catalogusprijs
(€ 50.701,00), datum eerste toelating (9 december 2019), brandstofklasse (fossiel) en categorie (M1) met
bron RDW en ophaaltijdstip; de portaalpagina **Fiscale check** toont de periode met status "Geen
regelversie beschikbaar" (de kloon heeft alleen de conceptversie), en de antwoorden van de
klantbeheerder worden opgeslagen en geaudit. Geen serverfouten in de log.

## 2c. Nieuw besluit tijdens stap 5: open einde (F-15)

Kees: bij een open einde per maand en per jaar berekenen; bij het afsluiten van de reservering een
eindberekening. Vastgelegd als F-15 in `besluiten.md`; de bouw hoort bij stap 6 (volledige berekeningen):
maandbeoordelingen als eigen snapshots, jaartotalen, eindberekening met trigger `final` zodra de
periode een einddatum krijgt, en het onderscheid "voorlopig" / "eindberekening" in kantoor en portaal.

## 3. Rechten en isolatie

- Portaal: klant C zonder schakelaar → 403 `PORTAL_FEATURE_DISABLED`; klant A ziet de reservering van
  klant B niet (404); bestuurder van A ziet niets zolang de klant het niet toestaat en daarna alleen
  eigen huren; bevestigen door een bestuurder → 403; bevestigen op andermans reservering → 404;
  ongeldige antwoorden → 400.
- Kantoor: de knop RDW opnieuw ophalen staat achter `manage_fiscal_review`; de matrixtest dekt de route.
- De portaalrealm blijft gescheiden (eigen Passport-instantie en cookie); de portaalroutes zijn
  in `registerPortalRoutes` gemonteerd en delen dus de bestaande poorten en tests.

## 4. Testuitslag

| Bestand | Tests | Dekt |
|---|---|---|
| `rdw-fiscal.test.ts` | 4 | beide datasets, genormaliseerd kenteken, niet gevonden, upstreamfout, geen brandstofrijen |
| `profiles-rdw.test.ts` | 5 | normalisatie (WLTP eerst, hybride, emissievrij, onbekend), verversing met bron en audit, handmatige waarde beschermd, fout vastgelegd zonder gooien, ontbrekende catalogusprijs blijft onbekend |
| `nightly.test.ts` | 5 | alleen ingeschakelde klanten, één keer per feit, kantoor- en klantmeldingen met dedupe, vrijstellingsgrenswaarschuwing, versie-activering, profielverversing met geïnjecteerde fetch, herstelronde |
| `usage-periods.test.ts` | 13 (+2) | elke schrijfroute van de reserveringsopslag (aanmaken en wijzigen met boekingscontrole, ophalen, vervangende auto aanmaken en sluiten, innemen) en de herstelronde voor reserveringen die buiten de opslaglaag om zijn geschreven |
| `portal-fiscal-routes.test.ts` | 6 | eigen perioden, bedragen achter schakelaar, tenantisolatie, schakelaar uit, bestuurdersrol, bevestigen en audit, samenvatting |
| `fiscal-page.test.tsx` (portaal) | 4 | status en ontbrekend, bedrag achter schakelaar, beheerder bevestigt, bestuurder leest alleen |

Volledige suites en typecontrole: zie het overzicht in de chat bij dit stopmoment (server- en
clientproject beide groen, 0 typefouten, productiebouw geslaagd).

## 5. Nog niet gebouwd (stap 6)

Open einde volgens F-15 (maandbeoordelingen, jaartotalen, eindberekening bij afsluiten), rapporten
(tabblad Fiscaal, CSV), PDF per beoordeling via de bestaande generator, randgevaltests
over maand- en jaargrenzen in de draaiende app, documentatie voor medewerkers en klanten,
eindaudit (hardgecodeerde waarden, dubbele logica, ontbrekende rechten), volledige regressie en de
productie-vormige migratietest.

---

**HARD STOP: STOP POINT 5.** Na goedkeuring start stap 6.
