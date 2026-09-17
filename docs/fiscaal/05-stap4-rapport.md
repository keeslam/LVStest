# Stap 4: kantoorschermen, rechten en beveiliging (STOP POINT 4)

Datum 17 september 2026. Branch `fix/audit-remediation`, commit `ed8900ba` en de correctie erna.
Alles is test-first gebouwd.

## 1. Wat er staat

| Onderdeel | Waar | Wat het doet |
|---|---|---|
| Impactvoorbeeld | `server/services/fiscal/impact.ts`, routes `POST/GET /api/fiscal/rule-versions/:id/impact` | Rekent het concept door over alle open perioden van klanten met de fiscale check aan, naast wat vandaag geldt. Klanten, auto's, perioden, huidig totaal, concepttotaal, verschil, jaar- en maandimpact, aantal handmatige beoordelingen en gevallen met ontbrekende gegevens. Draait op de achtergrond met een status om te pollen; geaudit; wordt nooit als beoordeling opgeslagen; gelabeld als schatting. |
| Pagina **Fiscaal** | `client/src/pages/fiscal/index.tsx`, zijbalkitem onder Rapporten (besluit F-07), titel in de balk | Tabbladen Overzicht, Configuratie, Beoordelingen (recht `manage_fiscal_review`) en Auditlog (recht `view_fiscal_audit_log`). |
| Overzicht | `components/fiscal/overview-panel.tsx` | Tegels per status (laatste beoordeling per open periode), open perioden, nog niet beoordeeld, open zaken, geldende versie; waarschuwing als er geen versie geldt. |
| Configuratie | `configuration-panel.tsx` | Per regel: geldend nu, toekomstig, concepten en beoordeling, verlopen, gearchiveerd. Elke versie met status, validatie (volledig/onvolledig), geldigheid en wie. "Nieuw concept" (leeg of kopie) met recht `manage_fiscal_configuration`. Bereik ALLE KLANTEN staat er letterlijk. |
| Versiedialoog | `version-dialog.tsx` | Versiegegevens (ingangsdatum, einddatum, reden, bron, wettelijke referentie, aannames) en alle parameters, gegroepeerd per categorie en opgebouwd uit de definities: naam, uitleg, eenheid, wettelijk/intern, invoer per type, bron per wettelijke parameter. Validatie-uitkomst. Acties per status en recht: opslaan, indienen, goedkeuren, afwijzen (met reden), publiceren, archiveren, impact tonen. Geschiedenis van de versie. Alleen een concept is bewerkbaar. |
| Publicatiedialoog | `publish-dialog.tsx` | Parameter, was en wordt met eenheid; geldigheid; bereik ALLE KLANTEN; geraakte klanten en auto's uit het impactvoorbeeld; bron; reden; de vaste waarschuwing; een uitdrukkelijk vinkje vóór de knop; verzendt `confirm: true`. |
| Beoordelingswachtrij | `review-queue.tsx` | Open en lopende zaken met klant, kenteken, periode, redenen in het Nederlands; toewijzen aan jezelf; afhandelen met afhandeling en toelichting (verplicht); daarna wordt de periode opnieuw beoordeeld. |
| Auditlog | `audit-log-panel.tsx` | Alleen lezen: tijd, wie, actie, wat, was → wordt, reden. |
| Voertuigtab **Fiscaal** | `vehicle-fiscal-tab.tsx`, zevende tabblad in de voertuigdialoog | Profiel met per feit de herkomst (RDW, handmatig, voertuigrecord, onbekend), correctie met verplichte reden (recht `manage_fiscal_review`), laatste beoordelingen. Na een correctie worden de open perioden van de auto opnieuw beoordeeld. |
| Gebruiksblok | `usage-period-card.tsx`, in de reserveringsdialoog | Afgeleide feiten (periode, datumbasis, vervanging, bestuurders), overgangshint, herbevestigingswaarschuwing, de vragen (privé, woon-werk, vóór 2027, gebruikstype, pool, reden van vervanging, vervangen auto, notities), bevestigen, en de laatste beoordeling met uitleg. Alleen-lezen zonder het recht. |
| Klantschakelaars | `customer-portal-settings-form.tsx` | De zes fiscale schakelaars in het portaaltabblad van de klant. |
| Vertalingen | `client/src/locales/{nl,en}/fiscal.json` | Nieuwe namespace `fiscal`; de statuslabels komen uit `shared/fiscal-types.ts`. |
| Opmaak | `shared/fiscal-format.ts` | Bedragen, datums, eenheden en keuzelabels, gedeeld door server (uitleg) en client. |

## 2. Rechten en beveiliging

- Elke route in `server/routes/fiscal.ts` staat achter een van de zes rechten; de bestaande
  permissiematrixtest (`fix-i-permission-matrix.test.ts`) bewaakt dat automatisch. Een geweigerde
  poging komt op de fiscale auditlog (`unauthorized_attempt`, met methode, pad en het vereiste recht).
- Onder `/api/fiscal/audit` bestaat geen schrijfroute; een test loopt de routerstack na.
- Publiceren vraagt `publish_fiscal_configuration` én `{ "confirm": true }`; zonder bevestiging 400.
- De client verbergt alleen; de server beslist. Tests per rol: alleen-lezen ziet geen wachtrij, geen
  auditlog en geen "Nieuw concept"; beheerder ziet alles; bevestigen in het gebruiksblok is
  onzichtbaar zonder `manage_fiscal_review`.
- Klantportaal: het portaal heeft een eigen inlogrealm (eigen Passport-instantie, eigen cookie,
  deserialisatie weigert alles wat niet van het portaal is). Een portaalsessie bereikt de
  kantoorroutes niet; de portaalroutes van stap 5 krijgen hun eigen tenant- en zichtbaarheidstests.
- Bekend en ongewijzigd: de adminbypass in `hasPermission()` geldt ook hier (besluit F-04).

## 3. Testuitslag

| Controle | Uitkomst |
|---|---|
| Server, fiscale tests | impact 5, routes 8, engine en services 108 — groen |
| Client, hele jsdom-project | **36 bestanden, 159 tests, groen** (was 33 / 148) |
| Typecontrole | 0 fouten |
| Productiebouw | geslaagd |
| Productiemodus op :5004 | pagina Fiscaal, tabbladen, configuratie met het concept van versie 1 en de versiedialoog laden; geen fouten in de serverlog |

Nieuwe tests: `impact.test.ts` (vergelijking met de geldende versie, telling van zaken, weigering van
een onvolledig concept, achtergrondstatus via de API, geen dubbele start), `fiscal-page.test.tsx`
(tabbladen per recht, tegels, configuratielijst), `publish-dialog.test.tsx` (inhoud en bevestiging),
`usage-period-card.test.tsx` (feiten, serverfout bij ontbrekende reden, verzending, alleen-lezen),
`vehicle-fiscal-tab.test.tsx` (herkomst per feit, correctie met reden).

## 4. Wat je zelf kunt doen op :5004

1. Zijbalk → **Fiscaal** → tabblad **Configuratie** → **Bekijken** bij versie 1 (concept).
2. Loop de parameters na; pas eventueel een waarde aan en klik **Opslaan**; de validatie meldt wat
   nog ontbreekt.
3. **Impact tonen** laat het voorbeeld zien (in de kloon staan nog geen perioden vanaf 2027, dus nul).
4. **Indienen ter beoordeling** → **Goedkeuren** → **Publiceren…**: de publicatiedialoog toont de
   wijziging voor alle klanten en vraagt het vinkje. Publiceer op :5004 gerust; dat is de kloon.
   In productie is publiceren pas aan de orde na de verificatiepunten V1–V10.
5. Open een voertuig → tabblad **Fiscaal**; open een reservering vanaf 2027 → blok **Fiscaal gebruik**.

## 5. Nog niet gebouwd (stap 5 en 6)

RDW-uitbreiding (catalogusprijs, categorie, CO₂) met de knop "RDW opnieuw ophalen", nachtelijke taak,
portaalpagina en -routes met tenanttests, meldingen (F-06), rapporten, PDF, randgevallen, documentatie.

---

**HARD STOP: STOP POINT 4.** Na goedkeuring start stap 5: RDW-profiel, afleiding en nachtelijke
beoordeling, portaalpagina en -routes, meldingen; met tenant- en zichtbaarheidstests.
