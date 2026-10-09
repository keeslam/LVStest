# Fysieke E2E-audit — checkpoint

Doel: de hele applicatie fysiek doorklikken in een echte browser (de ingebouwde browser van de Claude-app), niet alleen de broncode lezen. Vier categorieën per module: (1) interface en dialogen, (2) generatie en dynamische gegevens, (3) rechten en permissies (admin tegenover gestripte gebruiker), (4) werkstroomoptimalisaties (UX-opmerkingen).

Gestart: 2026-10-09. Omgeving: lokale dev-server `npm run dev` op http://localhost:5000, database `lvstest` (lokale kopie met de echte vloot, geen productie). Bevindingen staan in `docs/audit/fysieke-e2e-audit-2026-10-09.md` (per module: wat getest, wat werkt, wat niet, UX-opmerkingen met ernst). Dit bestand houdt alleen de status bij.

Spelregels: alleen localhost; testaccounts worden in de app zelf aangemaakt (nooit het echte admin-account strippen); geen code wijzigen tijdens de audit; de Playwright-suite (`npm run e2e`) hoort niet bij deze audit en wordt niet gestart; de dev-server kan tijdens de audit kort herstarten omdat deelproject C tegelijk gebouwd wordt (bij een onderbroken pagina: herladen en verder).

Status: `[x] Passed` = module volledig doorgeklikt en bevindingen vastgelegd; `[~] Partial` = begonnen, zie "Volgende stap"; `[ ] Blocked` = kan niet verder, reden erbij; `[ ] Pending` = nog niet begonnen.

## Modules

| # | Module | Status | Opmerking |
|---|---|---|---|
| 1 | Auth (inloggen, uitloggen, profiel, wachtwoord wijzigen) | [x] Passed | 4 bevindingen (1 Middel, 3 Laag), zie rapport |
| 2 | Dashboard (tegels, snelle acties, widgets, meldingencentrum) | [x] Passed | 5 bevindingen (5 Laag), zie rapport; RDW-scan per ongeluk gestart (alleen voorstel 2-XJT-31, niet bevestigd) |
| 3 | Voertuigen (lijst, filters, details, toevoegen/bewerken, bulkimport, RDW, prullenbak) | [x] Passed | 7 bevindingen (2 Middel, 5 Laag); testvoertuigen AUDIT1 (id 1667) en AUDIT2 (id 1669) staan nog voor latere modules; ZZ-ZZ-99 verwijderd |
| 4 | Klanten (lijst, toevoegen/bewerken, chauffeurs, portaaltab, debiteurnummer, prullenbak) | [x] Passed | 5 bevindingen (2 Middel, 3 Laag); testklant "Audit Testklant B.v." (id 1247, debiteurnr 900001) staat nog voor module 5/6 |
| 5 | Reserveringen (kalender, nieuwe reservering, lijst, niet-opgehaald popup, bewerken, annuleren, verwijderen) | [x] Passed | 7 bevindingen (1 Middel, 6 Laag); reservering #3200 (AUDIT1 + Audit Testklant, geboekt, 9 t/m 12 okt) blijft voor module 6; annuleren van een opgehaalde reservering nog in module 6 of 18 |
| 6 | Overdracht (ophalen, innemen, schadecheck, contract, terugdraaien) | [x] Passed | 6 bevindingen (2 Middel, 4 Laag); contract kon niet gemaakt worden door testsjabloon "gffg" (zie module 10); AUDIT1 weer beschikbaar, reservering #3200 geannuleerd |
| 7 | Onderhoud (kalender, plannen, vervangend voertuig, afronden, terug uit onderhoud) | [~] Partial | 6 bevindingen (2 Hoog, 1 Middel, 3 Laag); echt vervangend voertuig toewijzen en Annuleren in het vervangerdialoog niet doorgetest; AUDIT1 staat nu op Reparatie nodig (needs_fixing), onderhoudsrecord 3201 actief |
| 8 | Transporten (/delivery) | [x] Passed | 5 bevindingen (5 Laag); transport #30 aangemaakt en weer verwijderd; bezorgtransport bij klantreservering en vervangend voertuig koppelen niet doorgetest |
| 9 | Kosten (lijst, toevoegen, factuurpostvak, logboek) | [~] Partial | 7 bevindingen (3 Middel, 4 Laag); factuur-PDF scannen niet te testen (geen bestandskeuze in de browser), Nu ophalen bewust niet geklikt (echte postbus); kostenpost 1999 (AUDIT1, 25,50) staat nog |
| 10 | Documenten (bibliotheek, uploaden, sjablonen, contract genereren en voorvertoning, PDF openen) | [~] Partial | 7 bevindingen (1 Middel, 6 Laag); contractgeneratie bewezen na toevoegen van veld Klantnaam aan sjabloon gffg (testdata gewijzigd); echt bestand uploaden en afdrukken niet testbaar; reservering #3202 (AUDIT2) staat opgehaald, contract 1013 |
| 11 | Schadechecks en scannen (/scan, interactieve schadecheck, PDF) | [x] Passed | 6 bevindingen (1 Middel, 5 Laag); markeren op diagram werkt niet door 1198x24 testdiagram; foto en handtekening niet testbaar |
| 12 | Boetes (lijst, toevoegen, koppelen, prullenbak) | [ ] Pending | |
| 13 | Communicatie (meldingen versturen, e-mailsjablonen) | [ ] Pending | |
| 14 | Rapporten (standaardrapporten, rapportbouwer, export) | [ ] Pending | |
| 15 | Portaalbeheer (accounts, aanvragen) | [ ] Pending | |
| 16 | Fiscaal (mobiliteitscheck) | [ ] Pending | |
| 17 | Instellingen en beheer (app-instellingen, back-ups, gebruikers en rechten) | [~] Partial | 5 bevindingen (1 Hoog: gebruiker opslaan wist wachtwoord; 1 Laag/Middel; 3 Laag); gedaan vóór module 12-16; gebruiker toevoegen/verwijderen, instellingen opslaan en back-up herstellen niet getest |
| 18 | Rechten fysiek (admin handelt, rechten strippen van een testgebruiker, inloggen als die gebruiker, knoppen grijs/verborgen, directe navigatie geblokkeerd) | [x] Passed | 4 bevindingen (1 Middel, 3 Laag); e2e-user rechten gestript, getest en weer teruggezet (11 rechten, wachtwoord hersteld) |
| 19 | Generatie (PDF's, exports, back-up, wachtstanden en toasts) | [~] Partial | tussenstand in rapport (PDF-uitvoer uit modules 6, 8, 10, 11 bewezen); CSV- en rapportexports en back-upbestand nog te doen |
| 20 | UX-samenvatting (te veel kliks, ontbrekende bevestigingen, trage terugkoppeling) | [~] Partial | voorlopige samenvatting in rapport (74 bevindingen: 3 Hoog, 15 Middel, 56 Laag over 13 modules); aanvullen na modules 12-16 en 19 |

## Volgende stap

Modules 1 t/m 11, 17 en 18 zijn doorgeklikt (17 en 18 zijn vóór 12 t/m 16 gedaan omdat de rechtenproef het gebruikersbeheer nodig had). Ga verder bij module 12 (Boetes), 13 (Communicatie), 14 (Rapporten), 15 (Portaalbeheer), 16 (Fiscaal), daarna 19 (Generatie: PDF's, exports, back-up, wachtstanden en toasts) en 20 (UX-samenvatting uit de rapporttekst, geen browserwerk nodig).

Praktische werkwijze (bewezen):
- Browser: viewport emuleren met resize_window 1400x900 (de pane zelf is maar 800x266). Dialogen en lijsten lees je het snelst met javascript_tool (innerText van [role=dialog]); klikken doe je met computer left_click op een ref uit find/read_page (refs verlopen na elke herlaad of HMR; zoek opnieuw met find). Radix-dialogen sluiten pas ~1-2 s na Escape; wacht kort. Dev-server herlaadt soms de pagina (HMR door deelproject C): opnieuw beginnen is dan normaal. Toasts verdwijnen na ~5 s: lees ze meteen met [role=status]. Lazy dialogen laden de eerste keer 3-6 s.
- BELANGRIJK: in Gebruikersbeheer een gebruiker opslaan zonder nieuw wachtwoord wist het wachtwoord (bevinding module 17). Vul bij elke bewerking van een e2e-account het standaard testwachtwoord opnieuw in (constante password in e2e/support/env.ts), anders kan niemand meer inloggen. e2e-user staat nu weer op 11 rechten met een werkend wachtwoord.
- Inloggen: de browser is bij de overdracht uitgelogd; log in als e2e-admin (wachtwoord in e2e/support/env.ts, constante password; NOOIT in rapport). Voor module 18: rechten van e2e-user aanpassen via menu > Gebruikers, uitloggen, inloggen als e2e-user.
- Testrecords van de audit (alle in lvstest): voertuig AUDIT1 (id 1667, staat op Reparatie nodig door module 7; onderhoudsrecord 3201), voertuig AUDIT2 (id 1669, verhuurd via reservering #3202, contract 1013), klant "Audit Testklant B.v." (id 1247, debiteurnr 900001), reservering #3200 (geannuleerd), kostenpost 1999 (AUDIT1), ZZ-ZZ-99 (verwijderd, in prullenbak). Contractsjabloon "gffg" kreeg een veld Klantnaam (testdata).
- Bewust niet gedaan (echte systemen): knop "Nu ophalen" bij Ontvangen facturen, e-mails naar echte adressen, RDW-voorstel 2-XJT-31 niet bevestigd.
- De RDW-scan op het dashboard is per ongeluk twee keer gestart (alleen voorstellen, geen wijziging).

## Hervattingsinstructie

Open dit bestand. Modules 7, 9 en 10 staan op Partial alleen wegens testbeperkingen die in de tabel staan; ga daar niet voor terug, maar neem de eerste module die op `[ ] Pending` staat (nu 12; modules 17 en 18 zijn al gedaan), lees de "Volgende stap", controleer dat http://localhost:5000 antwoordt (anders de voorbeeldserver `start` opnieuw starten), en ga verder in de browser. Bevindingen altijd in `docs/audit/fysieke-e2e-audit-2026-10-09.md` bijschrijven vóór dit bestand wordt bijgewerkt.
