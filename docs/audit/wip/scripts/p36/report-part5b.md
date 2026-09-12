
### 8.4 Documenten

14. **Een gewijzigde reservering markeert het contract als "verouderd"**, met een knop "opnieuw
    genereren". Het oude document blijft bewaard. Vroeger bleef er een contract staan met de oude
    prijs zonder dat iets dat liet zien. *(B-05)*
15. **Het versienummer staat niet meer in de documentsoort.** Er staat niet langer "Contract
    (Unsigned) 2" in de typekolom; de versie heeft een eigen veld.
16. **Een sjabloon zonder velden levert geen blanco contract meer op.** De app weigert met de uitleg
    dat het sjabloon geen velden heeft. *Let op: het sjabloon dat nu als standaard staat is er zo
    één — er moet vóór ingebruikname een sjabloon mét velden als standaard worden gezet.*
17. **Het schadecheck-PDF is van 3,4 MB naar 5,6 kB gegaan** en wordt in ongeveer 100 milliseconden
    gemaakt in plaats van een halve tot ruim twee seconden.
18. **Nog niet veranderd, wel besloten:** de datums op het contract staan nog in het Engels
    ("September 13, 2026", "7 days") naast Nederlandse datums en bedragen. Besluit B-18 schrijft
    overal Nederlands met dd-mm-jjjj voor. **Dit hoort niet in het handboek als "zo werkt het" —
    het is openstaand werk.**

### 8.5 Dagelijks werk

19. **Er is een werkdagscherm "Vandaag"** met drie groepen: wat vandaag opgehaald en ingenomen moet
    worden (met de knop om dat meteen te doen), onderhoud en transport van vandaag inclusief nog toe
    te wijzen vervangers, en nieuwe portaalaanvragen. Er is bewust géén lijst "te laat terug". *(B-17)*
20. **De kalendermaand opent merkbaar sneller:** van ruim een seconde naar ongeveer 60
    milliseconden, en van 924 databasevragen naar negen. Bij drukte is het verschil groter: tien
    gelijktijdige gebruikers gingen van bijna zeven seconden naar ongeveer een derde seconde.
21. **De reserveringenpagina haalt de lijst nog maar één keer op** in plaats van twee keer: van
    19,6 MB naar 11,6 MB per schermopbouw.
22. **De zoekbalk wacht tot je uitgetypt bent** en vindt nu ook een contractnummer — het nummer dat
    een klant aan de telefoon voorleest.
23. **Er is geschiedenis per record**: wie wat wanneer wijzigde, per reservering, voertuig of klant.
24. **Bulkacties geven een resultaat per regel** in plaats van één melding voor de hele stapel.
25. **Bij importeren wordt een onleesbare datum per regel afgekeurd** met de reden erbij; de overige
    regels worden gewoon geïmporteerd, en een Nederlandse datum verschuift geen dag meer. *(B-12)*

### 8.6 Dingen die kunnen verrassen

26. **De app kan "te veel verzoeken" antwoorden.** Er geldt nu een limiet van 1 000 verzoeken per
    kwartier per gebruiker, en vijf mislukte inlogpogingen per kwartier per werkplek. Wie veel
    tabbladen openhoudt of een lange bulkactie draait, kan die grens raken. De melding die dan
    verschijnt is kale technische tekst; dat mag het handboek benoemen.
27. **Een herstel van een back-up vraagt om de bestandsnaam.** De medewerker moet de exacte
    bestandsnaam overtypen voordat het herstel begint, en de app maakt vooraf automatisch een
    veiligheidskopie waarvan de naam in de bevestiging staat.
28. **Een beschadigde of onvolledige back-up wordt geweigerd met uitleg** — "de dump is maar 45
    bytes, er is niets gewijzigd" — in plaats van een lege foutmelding.
29. **De meldingen zijn nog gemengd Nederlands en Engels.** Alles wat in deze ronde nieuw is gebouwd
    spreekt Nederlands; de oudere meldingen eromheen niet. In één werkstroom komen beide talen voor.
