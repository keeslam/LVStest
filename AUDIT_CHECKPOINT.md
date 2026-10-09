# Fysieke E2E-audit — checkpoint

Doel: de hele applicatie fysiek doorklikken in een echte browser (de ingebouwde browser van de Claude-app), niet alleen de broncode lezen. Vier categorieën per module: (1) interface en dialogen, (2) generatie en dynamische gegevens, (3) rechten en permissies (admin tegenover gestripte gebruiker), (4) werkstroomoptimalisaties (UX-opmerkingen).

Gestart: 2026-10-09. Omgeving: lokale dev-server `npm run dev` op http://localhost:5000, database `lvstest` (lokale kopie met de echte vloot, geen productie). Bevindingen staan in `docs/audit/fysieke-e2e-audit-2026-10-09.md` (per module: wat getest, wat werkt, wat niet, UX-opmerkingen met ernst). Dit bestand houdt alleen de status bij.

Spelregels: alleen localhost; testaccounts worden in de app zelf aangemaakt (nooit het echte admin-account strippen); geen code wijzigen tijdens de audit; de Playwright-suite (`npm run e2e`) hoort niet bij deze audit en wordt niet gestart; de dev-server kan tijdens de audit kort herstarten omdat deelproject C tegelijk gebouwd wordt (bij een onderbroken pagina: herladen en verder).

Status: `[x] Passed` = module volledig doorgeklikt en bevindingen vastgelegd; `[~] Partial` = begonnen, zie "Volgende stap"; `[ ] Blocked` = kan niet verder, reden erbij; `[ ] Pending` = nog niet begonnen.

## Modules

| # | Module | Status | Opmerking |
|---|---|---|---|
| 1 | Auth (inloggen, uitloggen, profiel, wachtwoord wijzigen) | [ ] Pending | |
| 2 | Dashboard (tegels, snelle acties, widgets, meldingencentrum) | [ ] Pending | |
| 3 | Voertuigen (lijst, filters, details, toevoegen/bewerken, bulkimport, RDW, prullenbak) | [ ] Pending | |
| 4 | Klanten (lijst, toevoegen/bewerken, chauffeurs, portaaltab, debiteurnummer, prullenbak) | [ ] Pending | |
| 5 | Reserveringen (kalender, nieuwe reservering, lijst, niet-opgehaald popup, bewerken, annuleren, verwijderen) | [ ] Pending | |
| 6 | Overdracht (ophalen, innemen, schadecheck, contract, terugdraaien) | [ ] Pending | |
| 7 | Onderhoud (kalender, plannen, vervangend voertuig, afronden, terug uit onderhoud) | [ ] Pending | |
| 8 | Transporten (/delivery) | [ ] Pending | |
| 9 | Kosten (lijst, toevoegen, factuurpostvak, logboek) | [ ] Pending | |
| 10 | Documenten (bibliotheek, uploaden, sjablonen, contract genereren en voorvertoning, PDF openen) | [ ] Pending | |
| 11 | Schadechecks en scannen (/scan, interactieve schadecheck, PDF) | [ ] Pending | |
| 12 | Boetes (lijst, toevoegen, koppelen, prullenbak) | [ ] Pending | |
| 13 | Communicatie (meldingen versturen, e-mailsjablonen) | [ ] Pending | |
| 14 | Rapporten (standaardrapporten, rapportbouwer, export) | [ ] Pending | |
| 15 | Portaalbeheer (accounts, aanvragen) | [ ] Pending | |
| 16 | Fiscaal (mobiliteitscheck) | [ ] Pending | |
| 17 | Instellingen en beheer (app-instellingen, back-ups, gebruikers en rechten) | [ ] Pending | |
| 18 | Rechten fysiek (admin handelt, rechten strippen van een testgebruiker, inloggen als die gebruiker, knoppen grijs/verborgen, directe navigatie geblokkeerd) | [ ] Pending | |
| 19 | Generatie (PDF's, exports, back-up, wachtstanden en toasts) | [ ] Pending | |
| 20 | UX-samenvatting (te veel kliks, ontbrekende bevestigingen, trage terugkoppeling) | [ ] Pending | |

## Volgende stap

Begin bij module 1 (Auth) als admin op http://localhost:5000, maak daarna in module 17/18 een testgebruiker aan voor de rechtenproef.

## Hervattingsinstructie

Open dit bestand, neem de eerste module die niet `[x] Passed` is, lees de "Volgende stap", controleer dat http://localhost:5000 antwoordt (anders de voorbeeldserver `start` opnieuw starten), en ga verder in de browser. Bevindingen altijd in `docs/audit/fysieke-e2e-audit-2026-10-09.md` bijschrijven vóór dit bestand wordt bijgewerkt.
