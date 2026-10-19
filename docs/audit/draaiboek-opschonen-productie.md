# Draaiboek: tijdzone en opschonen in productie

Bij de volgende start van de app voeren vier vlaggen eenmalig de opschoning uit. Ze staan standaard
**uit**. Je zet ze aan in Coolify. Het proefrapport staat in `docs/audit/proefdraai-opschonen-2026-10-19.md`.

| Vlag | Wat er gebeurt |
|---|---|
| `TIMESTAMPTZ_MIGRATION=apply` | Tijdzone-migratie B-22: tijden staan niet langer twee uur te laat. Tijden die de app zelf schreef (voertuig gewijzigd, bekeuringstijdstip) blijven goed staan. |
| `CLEANUP_ORPHAN_BLOCKS=apply` | Onderhoudsblokken op auto's die niet meer bestaan gaan naar de prullenbak van Onderhoud. Ze zijn terug te zetten. |
| `CLEANUP_STALE_RESERVATIONS=apply` | Verlopen reserveringen die nooit zijn opgehaald worden geannuleerd. Oude statussen worden afgerond. "Opgehaald" wordt nooit aangeraakt; die blijven op "Nog buiten" staan. |
| `CLEANUP_NORMALIZE_PLATES=apply` | Kentekens worden gelijkgetrokken en er komt een unieke index op. Bij een botsing stopt deze stap vanzelf en verandert er niets. |

De volgorde ligt vast: eerst de tijdzone, dan de losse blokken, dan de reserveringen, dan de
kentekens. Elke stap duurde op de kopie minder dan 5 seconden.

## Stappen

1. **Code staat in productie.** Deze vlaggen werken pas als de commits van 19-10 gepusht en uitgerold zijn.
2. **Back-up.** Maak in Coolify een back-up van de database. Zet ook de back-up van de app zelf (Instellingen → Back-ups) aan of draai die één keer.
3. **Rustig moment kiezen.** De tijdzone-migratie vergrendelt per tabel heel kort de tabel. Kies een moment waarop niemand aan het werk is.
4. **Vlaggen aanzetten.** Ga in Coolify naar Environment Variables en voeg de vier vlaggen toe, elk met de waarde `apply`.
5. **Herstarten.** Kies Redeploy of Restart.
6. **Log controleren.** Zoek in het containerlog naar deze regels:
   - `B-22: converted 99 column(s) to timestamptz`
     (het aantal kan in productie anders zijn)
   - `🧹 BUG-143: … losse onderhoudsblok(ken) naar de prullenbak van Onderhoud.`
   - `🧹 B-21 (peildag …): … nooit opgehaald geannuleerd, … afgerond; … blijven op "Nog buiten".`
   - `🧹 B-10: … kenteken(s) gelijkgetrokken; unieke index staat.`
   - `🧹 Eenmalige opschoning klaar.`

   Staat er `B-10: … botsing(en) gevonden`, dan is er niets aan de kentekens veranderd. De
   botsingen staan in het activiteitenlog (`system.cleanup-normalize-plates`).
7. **Vlaggen weghalen.** Haal de vier vlaggen weer weg in Coolify. Nog een keer draaien doet niets,
   maar zo blijft het duidelijk.
8. **In de app nakijken:**
   - Tijden op documenten en in het activiteitenlog kloppen weer.
   - De prullenbak van Onderhoud bevat de losse blokken.
   - De lijst "Nog buiten" toont de huren die echt nagelopen moeten worden.
   - Het activiteitenlog heeft drie regels `system.cleanup-*` met de aantallen.

## Als het misgaat

- Een mislukte stap houdt de app niet tegen. De fout staat in het log en in het activiteitenlog.
- Terugzetten kan op twee manieren:
  - een losse blok of reservering via de prullenbak;
  - alles tegelijk met de back-up uit stap 2.
