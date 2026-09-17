# Handleiding fiscale mobiliteitscheck — kantoor

Voor medewerkers van Lam Groep. De fiscale check helpt zakelijke klanten in te schatten of de
pseudo-eindheffing voor fossiele personenauto's (art. 32bc Wet LB 1964, vanaf 1 januari 2027) speelt
voor een auto die zij van Lam Groep huren. De applicatie berekent op basis van de **geconfigureerde
regels** en de **beschikbare gegevens**; zij geeft geen fiscaal advies en doet geen aangifte. Bij
twijfel is handmatige beoordeling nodig en is de adviseur of de Belastingdienst leidend.

## 1. Waar zit wat

| Onderdeel | Plaats | Recht |
|---|---|---|
| Configuratie (regelversies, parameters, publiceren) | App-instellingen → Klantenportaal → Fiscale check | `manage_fiscal_configuration`, `approve_fiscal_configuration`, `publish_fiscal_configuration` |
| Beoordelingswachtrij | App-instellingen → Klantenportaal → Fiscale check → Wachtrij | `manage_fiscal_review` |
| Auditlog | App-instellingen → Klantenportaal → Fiscale check → Audit | `view_fiscal_audit_log` |
| Overzicht (tegels per status) | Klantenportaal → knop **Fiscale check** | `view_fiscal` |
| Per voertuig: profiel en beoordelingen | Voertuig → tab **Fiscaal** | `view_fiscal` (corrigeren: `manage_fiscal_review`) |
| Per reservering: gebruiksvragen en beoordeling | Reservering → kaart **Fiscaal gebruik** | `view_fiscal` (bevestigen: `manage_fiscal_review`) |
| Rapport per maand, CSV en PDF | Rapporten → tab **Fiscaal** | `view_fiscal` |
| Klantschakelaars | Klantenportaal → klant → portaalinstellingen | portaalbeheer |

Een beheerder heeft alle rechten. Elke geweigerde poging staat in de auditlog.

## 2. Hoe een beoordeling tot stand komt

1. **Gebruiksperiode.** Elke huur (standaard of vervangend voertuig) met een startdatum vanaf 1 januari
   2027 en een zakelijke klant krijgt automatisch een gebruiksperiode. Zij volgt de reservering: ophalen,
   inleveren, verplaatsen, annuleren en verwijderen werken door. Een herstelronde bij het opstarten en
   in de nachtelijke run vangt op wat ooit buiten de gewone weg om is geschreven.
2. **Voertuigprofiel.** Catalogusprijs, Europese voertuigcategorie, brandstofklasse, CO₂ en datum eerste
   toelating komen uit de RDW (knop **RDW opnieuw ophalen** op de tab Fiscaal). Een handmatige waarde
   vraagt een reden en wint altijd van de RDW. Ontbreekt de catalogusprijs (vooral auto's van vóór 2009),
   dan vult kantoor hem in met bron; bij auto's ouder dan 25 jaar geldt de waarde in het economische
   verkeer.
3. **Gebruiksvragen.** Privégebruik, woon-werkverkeer, "al vóór 2027 ter beschikking gesteld", soort
   gebruik en bij een vervangend voertuig de reden. De klantbeheerder beantwoordt ze in het portaal;
   kantoor kan ze ook invullen. Verschuift de reservering na een bevestiging, dan vraagt de applicatie
   opnieuw om bevestiging.
4. **Beoordeling.** De regelversie die op de datums van de periode geldt, wordt toegepast. De uitkomst
   is altijd één van: Van toepassing, Mogelijk van toepassing, Niet van toepassing, Handmatige
   beoordeling nodig, Onvoldoende gegevens, Configuratie ongeldig, Geen regelversie beschikbaar. Er is
   nooit een stil bedrag van € 0: ontbreekt iets, dan staat dat erbij.
5. **Snapshot.** Elke beoordeling wordt onveranderlijk vastgelegd met de invoer, de parameters en de
   uitleg. Een nieuwe beoordeling vervangt de vorige in het overzicht; de historie blijft.

## 3. Per maand, per jaar en de eindberekening (besluit F-15)

- Een lopende periode wordt beoordeeld **tot en met de laatste dag van de beoordelingsmaand**. De maanden
  daarvóór zijn **vastgelegd**; de lopende maand is **voorlopig**. In de nacht van de eerste van de
  maand legt de nachtelijke run de afgelopen maand vast als nieuwe beoordeling; op andere nachten
  verandert er niets zolang de feiten niet veranderen.
- Een geplande einddatum in de toekomst telt mee als voorlopig (verwacht).
- Zodra de auto is ingeleverd (werkelijke innamedatum bekend) volgt direct de **eindberekening** over de
  hele periode; alle maanden zijn dan vastgelegd. In de uitleg staat "Eindberekening"; in het rapport
  staat de stand "eindberekening".
- Het rapport en de uitleg tellen per kalenderjaar op, met het voorlopige deel apart.

## 4. Wachtrij

Een beoordelingszaak ontstaat bij "Handmatige beoordeling nodig" of "Onvoldoende gegevens" en sluit
vanzelf zodra de gegevens compleet zijn. Redenen zijn onder meer: categorie en voertuigsoort spreken
elkaar tegen, poolauto of meerdere bestuurders zonder bevestigd privégebruik, kortstondige huur over
een jaargrens, reden van vervanging onbekend, periode over twee regelversies. Wijs een zaak toe, los
hem op met een toelichting, en de volgende beoordeling gebruikt de nieuwe gegevens.

## 5. Configuratie en publiceren

- Alle fiscale waarden staan in een **regelversie**; niets staat in de code. Een nieuwe versie begint als
  concept, gaat naar beoordeling, wordt goedgekeurd en dan gepubliceerd (aparte rechten). Een
  gepubliceerde versie is onveranderlijk; een wijziging is een nieuwe versie met ingangsdatum, reden en
  bron. Publiceren sluit de open voorganger.
- **Impactvoorbeeld** vóór publicatie: hoeveel perioden, klanten en voertuigen raakt de versie, welk
  bedrag verschuift per maand.
- De eerste versie is bij oplevering een **concept**: publiceren is een menselijke handeling na het
  nalopen van de verificatiepunten in `01-wettelijk-kader.md` (wat wet is en wat nog wetsvoorstel).

## 6. Rapporten

Rapporten → tab Fiscaal: kies jaar en (optioneel) klant. Per klant, kenteken en kalendermaand staat de
laatste beoordeling met dagen, reden, bedrag en stand (vastgelegd / voorlopig / eindberekening), plus
totalen en het aantal nog niet beoordeelde perioden. **CSV downloaden** geeft hetzelfde als
puntkomma-bestand voor Excel (decimale komma). Elke beoordeling heeft een **PDF** met de feiten, de
uitleg en het beoordelingsnummer.

## 7. Nachtelijke run en meldingen

Elke nacht om 03:30 (Europe/Amsterdam): regelversies die vandaag ingaan, verouderde RDW-profielen
(ouder dan 30 dagen), herstelronde van gebruiksperioden, beoordeling van alle open perioden van
klanten met de schakelaar aan, en meldingen. Kantoor krijgt een melding bij beoordeling nodig,
gegevens ontbreken en versie vandaag van kracht (één per onderwerp per 30 dagen). Klanten met
waarschuwingen aan krijgen: gegevens ontbreken, beoordeling door Lam Groep, vervanging nadert de
vrijstellingsgrens, nieuwe kalendermaand nadert.

## 8. Klantschakelaars

Per klant: fiscale check aan, dashboard (bedragen zichtbaar), waarschuwingen, rapporten (CSV in het
portaal) en zichtbaarheid voor bestuurders. Zonder de hoofdschakelaar ziet de klant niets en wordt hij
niet beoordeeld in de nachtelijke run. De schakelaars zijn zichtbaarheid; de regels zijn voor iedereen
gelijk (geen klantspecifieke uitzonderingen).
