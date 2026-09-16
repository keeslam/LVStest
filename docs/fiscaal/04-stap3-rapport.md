# Stap 3: regels, configuratie en beoordeling (STOP POINT 3)

Datum 16 september 2026. Branch `fix/audit-remediation`, commits `e70b602c`, `f52a7c2a` en de
commit met de API-routes. Alles is test-first gebouwd: elke test is eerst rood gezien.

## 1. Wat er staat

| Onderdeel | Bestand | Wat het doet |
|---|---|---|
| Vocabulaire | `shared/fiscal-types.ts` | Alle statussen, gebruikstypen, redenen en codes als gesloten lijsten met Nederlandse labels. Geen fiscale waarden. |
| Parameterdefinities | `server/services/fiscal/definitions.ts` | De 27 parameters van de regel: naam, uitleg, type, eenheid, grenzen, wettelijk of intern, wie hem leest. Een test bewaakt dat de rekenmodule precies deze sleutels leest en geen verborgen constanten bevat. |
| Kalender | `calendar.ts` | De enige dagteller: kalenderdagen inclusief begin en eind, maanden, volle jaren, tijdzonevrij. |
| Parameterset | `parameters.ts` | Gevalideerde, getypte waarden met eenheid en bron; een snapshot voor de beoordeling. Een ontbrekende of foute waarde is een configuratiefout, nooit een stille standaard. |
| Rekenmodule | `rules/pseudo-eindheffing.ts` | De pure berekening: scope, privégebruik, overgangsrecht, vervanging, kortstondig, grondslag op leeftijd, maandindeling dag voor dag, afronding. 45 scenario's. |
| Uitleg | `explain.ts` | De Nederlandse uitleg in de vorm van de opdracht (status, waarom, regelversie, parameters, maanden, ontbrekend, disclaimer). |
| Regelversies | `rule-versions.ts` | Concept → ter beoordeling → goedgekeurd → gepubliceerd → vervangen/gearchiveerd, met validatie bij elke poort, onveranderlijke gepubliceerde rij (behalve het sluiten van een open voorganger door het systeem, geaudit), weigering van overlap. |
| Versiekeuze | `resolve.ts` | Op datum en op periode, uitsluitend via het geldigheidsvenster; nooit "de nieuwste". Cache van één minuut, geleegd bij publicatie. |
| Audit | `audit.ts` | Alleen toevoegen; lezen met filters. Gebeurtenissen worden in dezelfde transactie geschreven als de wijziging. |
| Voertuigprofiel | `profiles.ts` | Feiten uit het voertuigrecord (eerste toelating, brandstofklasse), handmatige waarden met reden en bron, alles geaudit; nooit overschreven door een latere afleiding. |
| Gebruiksperioden | `usage-periods.ts` | Eén periode per huur of vervanging vanaf 1 januari 2027 (F-10), afgeleid bij elke schrijfactie op de reservering via haakjes in de opslaglaag; werkelijke ophaal- en innamedatum gaan voor; reden van vervanging uit het onderhoudsblok; overgangshint bij aansluitende eerdere huur; bevestigingen blijven staan en worden gemarkeerd als de feiten schuiven; een periode wordt gesloten, nooit verwijderd. |
| Beoordeling | `assess.ts` | Feiten verzamelen, versie kiezen op de datums van de periode, rekenen, uitleggen, één onveranderlijke rij met snapshot en hash. Ongewijzigd = niets schrijven; gewijzigd of herberekening met reden = nieuwe rij die de vorige opvolgt. |
| Beoordelingszaken | `review-cases.ts` (+ `assess.ts`) | Eén open zaak per periode, automatisch geopend en gesloten; handmatig toewijzen en sluiten met afhandeling en toelichting, geaudit. |
| Startseed | `seed.ts` | Regelversie 1 als **concept** met de waarden en bronnen uit `01-wettelijk-kader.md`; eenmalig; nooit gepubliceerd door het systeem. |
| API | `server/routes/fiscal.ts` | Alle routes uit `03-schema-en-dataflow.md` §5 behalve het impactvoorbeeld (stap 4). Zes rechten. Geweigerde pogingen op de auditlog. Geen schrijfroute onder `/api/fiscal/audit`. |
| Schema en migratie | `shared/schema.ts`, `startup-migration.js` | Zeven tabellen, zes klantschakelaars, zes rechten met labels, portaalsleutel `canViewFiscal`. Migratiestap met foreign keys en indexen, uitgevoerd op de test- en ontwikkeldatabase. |

## 2. Testuitslag

| Controle | Uitkomst |
|---|---|
| Volledige suite | **161 bestanden, 1205 tests, alles groen** (593 s). Vóór stap 3: 150 bestanden, 1085 tests. |
| Typecontrole (`npm run check`) | 0 fouten |
| Productiebouw (`npm run build`) | geslaagd |
| Permissiematrix (`fix-i-permission-matrix.test.ts`) | elke nieuwe route is rechten-gebonden; geen uitbreiding van de allowlists |

Nieuwe tests, per onderdeel:

| Bestand | Tests | Dekt |
|---|---|---|
| `calendar.test.ts` | 7 | dagen, maanden, schrikkeljaren, leeftijd |
| `definitions.test.ts` | 6 | 27 definities compleet; rekenmodule leest precies de gedefinieerde sleutels; geen hardgecodeerde 12, 7, 14 of 25 |
| `pseudo-eindheffing.test.ts` | 45 | scope, privégebruik, overgangsrecht (incl. maandgrens 17 september 2030), vervanging (onder, op, boven de grens; over maandgrens; reden onbekend; buiten de lijst; met einddatum), kortstondig (één periode, tweede periode, ander jaar, te lange eerdere periode, na einddatum, jaargrens, bereik), grondslag (ontbrekend, oldtimer, eerste toelating), afronding, pro rata, open einde, snapshot |
| `explain.test.ts` | 6 | inhoud en toon per status |
| `rule-versions.test.ts` | 17 | nummering, audit van waarden, validatie, toestandsmachine, onveranderlijkheid, sluiten van de voorganger, overlap, archiveren, keuze op datum, ongeldige configuratie |
| `profiles.test.ts` | 6 | afleiding, idempotentie, handmatige waarde met audit, bescherming van handmatige waarden, weigering van onzin |
| `usage-periods.test.ts` | 11 | afleiding, buiten bereik, werkelijke datums, vervanging, bestuurders, overgangshint, bevestiging en herbevestiging, reden verplicht, sluiten en heropenen, opslaghaakjes |
| `assess.test.ts` | 10 | snapshot, dedupe, opvolging en onveranderlijkheid, herberekening met reden en audit, latere versie raakt oude rijen niet, versie op de datums van de periode, geen versie, open einde, zaken openen en automatisch sluiten |
| `seed.test.ts` | 1 | concept met 27 waarden, eenmalig |
| `fiscal-routes.test.ts` | 8 | 401/403, definities, geweigerde poging op de audit, geen schrijfroute op de audit, levensloop via de API met gescheiden rechten, validatie, beoordelingen en zaken via de API, gebruik bevestigen, zaak toewijzen en sluiten |

## 3. Twee verfijningen ten opzichte van het schema-ontwerp

Beide zijn vastgelegd in `03-schema-en-dataflow.md`.

1. **Versie op de datums van de periode.** Het ontwerp koos de versie op de beoordelingsdatum. Dan zou
   een huur in maart 2027, vandaag beoordeeld, geen regel vinden (vandaag geldt er nog geen). De
   beoordeling kiest nu de vroegste gepubliceerde versie waarvan het venster de periode raakt; dagen
   buiten het venster worden gemarkeerd als "vóór de regel". Niets wordt te vroeg toegepast.
2. **De dedupe-hash leunt niet op de beoordelingsdatum.** Anders zou de nachtelijke taak elke dag een
   nieuwe rij schrijven voor elke periode. De hash dekt de feiten, de parameters, de versie en de
   uitkomst; een herberekening met reden schrijft altijd.

## 4. Bewust nog niet gebouwd (volgende stappen)

- Impactvoorbeeld, kantoorschermen, publicatiedialoog (stap 4).
- RDW-uitbreiding (catalogusprijs, categorie, CO₂), nachtelijke taak, portaalpagina en -routes,
  meldingen (stap 5).
- Rapporten, PDF, randgevallen en documentatie (stap 6).

## 5. Wat je zelf kunt zien

Na een herstart maakt de server eenmalig regelversie 1 als concept aan (logregel `📐 Fiscale
regelversie 1 aangemaakt als concept`). Er is nog geen scherm; de API is er wel. Met een
beheerdersaccount:

- `GET /api/fiscal/configuration` toont het concept met alle 27 waarden en de validatie-uitkomst.
- Publiceren vraagt de rechten `manage_fiscal_configuration` (indienen),
  `approve_fiscal_configuration` en `publish_fiscal_configuration` (met `{ "confirm": true }`), of de
  rol beheerder. Tot publicatie geeft elke beoordeling `RULE_NOT_AVAILABLE`.

---

**HARD STOP: STOP POINT 3.** Na goedkeuring start stap 4: de kantoorschermen (Fiscaal, voertuigtab,
gebruiksblok, klantschakelaars), het impactvoorbeeld, de publicatiedialoog en de beveiligingstests.
