# De baliewerkstroom doorgelicht — ronde 1

Gemeten op 20 en 21 september 2026 in een echte browser, op de echte applicatie, met
een teller die elke klik en elke getypte waarde optelt. Niets in dit document is
geschat of uit het hoofd opgeschreven: elke stap hieronder is een stap die de test
daadwerkelijk heeft uitgevoerd.

---

## 1. Samenvatting

- De hele baliestroom — nieuwe klant, reservering, ophalen, schadecheck, inleveren —
  kost vandaag **23 handelingen**: 7 + 6 + 4 + 3 + 3. Kiest de medewerker het voertuig
  rechtstreeks uit de lijst in plaats van eerst op kenteken te zoeken, dan zijn het er
  **21** (zie 2.2).
- Een nieuw voertuig via kentekenopzoeking aanmaken kost daarbovenop **5 handelingen**
  (aparte stroom, ander soort medewerker).
- De drie voorstellen die het meeste schelen: **OPT-034** (contractnummer zelf
  voorstellen, 1 van de 4 handelingen bij élke ophaling), **OPT-035** (onthoud of je de
  agenda of de lijst gebruikt, 1 handeling bij élke inname die via de lijst loopt),
  **OPT-036** (telefoon en e-mail bij de naam zetten, 1 van de 7 bij elke nieuwe klant).
- De fout die je moet weten: **sinds de auditwijzigingen live gingen, kon niemand meer
  een schadecheck opslaan.** Elke poging gaf een foutmelding. De reparatie is gemaakt en
  getest, maar staat op de werkbranch — **nog niet in productie** (BUG-231).
- Wat er van jou gevraagd wordt: **beantwoord hoofdstuk 7, regel voor regel, met "ja" of
  "nee".** Zolang een regel leeg is, wordt er niets aan gebouwd.

---

## 2. Per werkstroom: de stappen zoals ze vandaag zijn

De nummering is letterlijk wat de teller na afloop afdrukte. Een "handeling" is één
bewuste actie van de medewerker: een klik of het invullen van één veld. Wat het scherm
zelf al had ingevuld telt niet mee — dat staat apart genoemd, want dat is precies wat
er goed gaat.

### 2.1 Nieuwe klant — 7 handelingen

```
1. klik: Klanten
2. klik: Klant toevoegen
3. typ: Volledige naam
4. klik: tabblad Contact
5. typ: Telefoon
6. typ: E-mail
7. klik: Klant toevoegen (opslaan)
```

**Wat opvalt**

- Je typt de naam op het ene tabblad en het telefoonnummer en e-mailadres op het
  andere. Een medewerker noteert die drie altijd in één keer van hetzelfde
  telefoontje, maar moet halverwege van tabblad wisselen. Stap 4 is een klik die
  alleen bestaat omdat het formulier zo is ingedeeld. → voorstel OPT-036.
- De naam wordt bij opslaan stil herschreven: "E2E Story Klant" komt er als
  "E2e Story Klant" uit. Elk woord krijgt één hoofdletter aan het begin en de rest
  kleine letters. Bij een bedrijfsnaam met een afkorting erin gaat dat mis. →
  fout BUG-237.
- *Technisch:* `client/src/components/customers/customer-form.tsx`,
  `client/src/lib/format-utils.ts` (`capitalizeName`).

### 2.2 Nieuwe reservering — 6 handelingen met zoeken op kenteken, 4 zonder

```
1. klik: Nieuwe reservering
2. klik: voertuig zoeken openen
3. typ: zoek E2E-08-H
4. klik: voertuig E2E-08-H (Toyota Proace)
5. klik: Reservering aanmaken
6. klik: Reserveringen
```

**Wat het scherm zelf al goed doet (niet meegeteld)**

- De knop "Nieuwe reservering" staat naast de klantregel, dus de klant staat al
  ingevuld zodra het formulier opengaat. Dit is de plek waar de applicatie het precies
  goed doet: de volgende logische handeling wordt aangeboden waar de vorige eindigde.
- De periode staat al op vandaag tot en met vandaag+3 voordat je iets aanraakt.

**Wat opvalt**

- **Twee van de zes handelingen zijn het zoeken op kenteken (stap 2 en 3), en die staan
  er niet omdat bewezen is dat een medewerker het zo doet.** Ze staan er omdat de test
  anders niet betrouwbaar was: de keuzelijst toont wat er op dat moment in de database
  vrij is, en die lijst kan lang genoeg worden om deels buiten beeld te vallen (zie
  BUG-239). Door eerst het kenteken te typen blijft er één kaartje over dat altijd
  zichtbaar is. Kiest een medewerker het voertuig direct uit de lijst, dan kost deze
  stroom **4 handelingen**; met zoeken **6**. Op dit verschil is bewust geen
  verbetervoorstel gebouwd — het is een eigenschap van de meting, geen gemeten winst.
- Na het opslaan sta je nog op het klantenscherm. Er is geen knop of link die je naar de
  zojuist gemaakte boeking in de agenda brengt; stap 6 is een omweg via het
  zijbalkmenu. → voorstel OPT-037.
- *Technisch:* `client/src/components/reservations/reservation-form.tsx`,
  `client/src/components/ui/vehicle-selector.tsx`.

### 2.3 Ophalen — 4 handelingen

```
1. klik: reservering openen
2. klik: Ophalen starten
3. typ: Contractnummer
4. klik: Ophalen voltooien & contract genereren
```

**Wat het scherm zelf al goed doet (niet meegeteld)**

- De ophaaldatum staat op vandaag, de kilometerstand op de huidige stand van het
  voertuig en het brandstofniveau op "Vol". Alle drie geverifieerd.

**Wat opvalt**

- Het veld voor het contractnummer zegt in de grijze hulptekst "Automatisch gegenereerd
  (bewerkbaar)", maar het veld is leeg en wordt nooit gevuld. De medewerker moet zelf
  een nummer weten en intypen. De applicatie herkent tijdens het typen wél meteen een
  dubbel of ongebruikelijk hoog nummer — ze weet dus genoeg om zelf een nummer voor te
  stellen, maar doet dat niet. → voorstel OPT-034.
- Na het voltooien verschijnt vanzelf een bevestigingsvenster ("Contract klaar", met
  afdrukken en mailen). Dat venster is een eerder goedgekeurde verbetering (OPT-005) en
  blijft dus. Het probleem is dat het reserveringsscherm op hetzelfde moment opnieuw
  opengaat en bovenop dat venster komt te liggen. De "Sluiten"-knop staat er nog, maar
  een klik erop komt op het scherm erboven terecht. → fout BUG-235.
- Op een verse installatie mislukt het contract zelf: er is geen contractsjabloon
  ingesteld. Het venster meldt netjes "Contract kon niet gemaakt worden". Opmerkelijk:
  het schadeformulier bij inleveren lukt in dezelfde situatie wél, want dat kent een
  terugvalsjabloon. De twee documentsoorten zijn dus verschillend afgehandeld. →
  voorstel OPT-038.
- *Technisch:* `client/src/components/reservations/pickup-return-dialogs.tsx`,
  `client/src/components/reservations/handover-result-dialog.tsx`.

### 2.4 Schadecheck bij ophalen — 3 handelingen

```
1. klik: Schadecheck aanmaken
2. klik: Schadecheck opslaan
3. klik: Sluiten
```

**Wat het scherm zelf al goed doet (niet meegeteld)**

- Voertuig, reservering en het soort check (ophaal) staan al goed. Kilometerstand en
  brandstof worden overgenomen uit de ophaling die je net hebt vastgelegd.

**Wat opvalt**

- Deze drie handelingen konden lange tijd helemaal niet gemeten worden, omdat opslaan
  altijd mislukte. Zie BUG-231 — dat is de belangrijkste fout in dit document.
- Op een verse installatie blijft de knop "Opslaan" grijs zolang er geen
  voertuigdiagram-sjabloon is geüpload. Het scherm zegt niet dat dat de reden is. →
  voorstel OPT-038.
- *Technisch:* `client/src/pages/interactive-damage-check.tsx`.

### 2.5 Inleveren — 3 handelingen

```
1. klik: Inleveren starten
2. typ: Kilometerstand bij inleveren
3. klik: Inleveren voltooien & schadecheck genereren
```

**Wat het scherm zelf al goed doet (niet meegeteld)**

- De inleverdatum staat op vandaag, de kilometerstand op de stand van bij het ophalen
  en het brandstofniveau op "Vol".

**Wat opvalt**

- **Deze drie handelingen gelden alleen als je al in het reserveringsscherm zit**,
  zoals in dit verhaal, waar het inleveren direct op de schadecheck volgt. Komt de bus
  een paar dagen later terug, dan kost het eerst nog drie handelingen om de reservering
  terug te vinden: Reserveringen → Reserveringen als lijst → reservering bekijken. Dat
  is apart gemeten bij het randgeval "inleveren met een lagere kilometerstand" (6
  handelingen in totaal). → voorstel OPT-035.
- Ook hier verschijnt het bevestigingsvenster ("Schadeformulier klaar") en ook hier
  komt het reserveringsscherm er bovenop te liggen. → dezelfde fout BUG-235.
- *Technisch:* `client/src/components/reservations/pickup-return-dialogs.tsx`.

### 2.6 Eindstatus — 0 handelingen

Na het inleveren is er niets meer te doen. De reservering staat op "afgerond", het
voertuig is weer beschikbaar en de kilometerstand is opgeslagen — allemaal automatisch,
zoals besluit B-02 het voorschrijft. Gecontroleerd via de gegevens zelf, niet alleen op
het scherm.

### 2.7 Nieuw voertuig via kentekenopzoeking — 5 handelingen

Dit is een aparte stroom: een baliemedewerker mag geen voertuigen aanmaken, een
onderhoudsmedewerker wel.

```
1. klik: Voertuigen
2. klik: Voertuig toevoegen
3. typ: Kenteken
4. klik: Opzoeken
5. klik: Opslaan
```

**Wat opvalt**

- De opzoeking vult merk en model zelf in — dat is precies wat je wilt. Maar ze komen
  binnen in volledige hoofdletters ("VOLKSWAGEN", "CRAFTER"), terwijl een handmatig
  getypt merk netjes als "Volkswagen" wordt opgeslagen. Je krijgt dus twee schrijfwijzen
  door elkaar in de voertuiglijst. → fout BUG-238.
- *Technisch:* `client/src/components/vehicles/vehicle-form.tsx`.

### 2.8 De vijf randgevallen die aan de balie echt voorkomen

| Randgeval | Handelingen | Wat de applicatie vandaag doet |
|---|---|---|
| Startdatum leeggemaakt | 3 | Het scherm blijft staan, geen crash meer. Maar het overzicht toont "Duur: 1 dag" naast "Startdatum: Niet geselecteerd", en het einddatumveld houdt exact de waarde die het vóór het wissen had. → fout BUG-236 |
| Ophalen vóór de startdatum | 7 | De vraag verschijnt; "Nee, niet ophalen" laat alles onaangeroerd. Precies zoals besluit B-16 het vraagt. Goed. |
| Dubbele boeking | 7 | De standaardkeuzelijst biedt de al bezette auto niet eens aan; pas na "Toon alle voertuigen" is hij zichtbaar, en dan volgt een rode waarschuwing en blijft "Reservering aanmaken" uitgeschakeld. Er wordt niets verstuurd. Goed. |
| Inleveren met een lagere kilometerstand | 6 | Geweigerd, met de uitleg erbij ("kan niet lager zijn dan bij ophalen (61000 km)"), voordat er iets wordt verstuurd. Goed. Anders dan bij ophalen is er geen mogelijkheid om met een reden toch door te gaan. |
| Net na middernacht ophalen | 5 | De ophaaldatum staat op de juiste kalenderdag in Nederlandse tijd. Goed. |

---

## 3. Voorstellen

Genummerd verder op de audit (die eindigde bij OPT-033). Ze staan op volgorde van wat
ze de medewerker opleveren. Elk voorstel staat op zichzelf: je kunt er één goedkeuren
en de rest niet.

### OPT-034 — Laat de applicatie het contractnummer zelf voorstellen

**Nu.** Het veld zegt "Automatisch gegenereerd (bewerkbaar)" maar begint leeg. De
medewerker typt bij elke ophaling zelf een nummer in, terwijl de applicatie tijdens het
typen al meldt of dat nummer dubbel of ongebruikelijk is.

**Voorstel.** Het veld staat bij het openen al ingevuld met het eerstvolgende vrije
nummer. De medewerker kan het gewoon overschrijven als hij een ander nummer wil.

**Scheelt.** 1 van de 4 handelingen bij élke ophaling, en het voorkomt dubbele of
vertypte contractnummers.

**Grootte.** Klein.

**Risico.** Eerst moet vastliggen hoe een nummer eruitziet — met of zonder voorloopnul.
De audit vond daar al drie botsende groepen (BUG-153/BUG-157). Zonder die afspraak maakt
dit voorstel het probleem groter in plaats van kleiner.

*Technisch:* `client/src/components/reservations/pickup-return-dialogs.tsx`, plus één
serverkant die het hoogste bestaande nummer teruggeeft.

### OPT-035 — Onthoud of je de agenda of de lijst gebruikt

**Nu.** Het reserveringenscherm opent altijd in de agenda. Wie een bus komt innemen die
dagen geleden is opgehaald, klikt eerst naar Reserveringen, dan naar "Reserveringen als
lijst", dan naar de reservering — drie handelingen voordat het inleveren begint.

**Voorstel.** Het scherm opent in de weergave die je de vorige keer gebruikte.

**Scheelt.** 1 handeling bij elke inname die via de lijst loopt.

**Grootte.** Klein.

**Risico.** Geen. Wie de agenda wil, klikt één keer terug en houdt die weer.

*Technisch:* `client/src/pages/reservations/calendar.tsx`.

### OPT-036 — Zet telefoon en e-mail bij de naam

**Nu.** De naam staat op het tabblad "Basisgegevens", telefoon en e-mail op "Contact".
Een medewerker noteert die drie in één keer van een telefoontje en moet er halverwege
een tabblad voor wisselen.

**Voorstel.** Telefoonnummer en e-mailadres komen op hetzelfde eerste tabblad als de
naam te staan. De rest van het formulier blijft waar het staat.

**Scheelt.** 1 van de 7 handelingen bij elke nieuwe klant, en de onderbreking midden in
een telefoongesprek.

**Grootte.** Klein.

**Risico.** Geen. Het formulier wordt alleen anders ingedeeld; er verandert niets aan
welke velden er zijn of wat verplicht is.

*Technisch:* `client/src/components/customers/customer-form.tsx`.

### OPT-037 — Na het opslaan van een reservering meteen naar die reservering

**Nu.** Maak je een reservering vanaf de klantenlijst, dan sta je daarna nog steeds op
het klantenscherm. Wil je controleren of de boeking goed in de agenda staat, dan moet je
via het menu terug.

**Voorstel.** De melding na het opslaan krijgt een knop die de nieuwe reservering
rechtstreeks opent.

**Scheelt.** 1 handeling per reservering die vanaf de klantenlijst wordt gemaakt, plus
het zoeken in de agenda.

**Grootte.** Klein.

**Risico.** Geen.

*Technisch:* `client/src/components/reservations/reservation-form.tsx`.

### OPT-038 — Zeg wat er ontbreekt in plaats van stil te mislukken

**Nu.** Op een installatie zonder sjablonen gebeuren twee dingen zonder uitleg: de
knop "Opslaan" van de schadecheck blijft grijs (er is geen voertuigdiagram-sjabloon), en
het contract bij het ophalen mislukt met alleen de tekst "Contract kon niet gemaakt
worden". Het schadeformulier bij inleveren lukt in diezelfde situatie wél, omdat daar
een terugvalsjabloon bestaat.

**Voorstel.** Waar een sjabloon ontbreekt, zegt het scherm wat er ontbreekt en waar je
het instelt. En de contract-PDF krijgt dezelfde terugval als het schadeformulier al
heeft.

**Scheelt.** Niet in handelingen te vatten. Het voorkomt een ophaling die eindigt zonder
contract terwijl niemand weet waarom, en een schadecheck die niet opgeslagen kan worden
zonder dat het scherm de reden noemt.

**Grootte.** Middel.

**Risico.** Een standaard-contractsjabloon moet wel een contract opleveren dat je durft
mee te geven. Als je dat liever niet hebt: dan alleen het deel "zeg wat er ontbreekt",
en dat is klein.

*Technisch:* `client/src/pages/interactive-damage-check.tsx`, `server/routes.ts`
(`getDefaultDamageCheckTemplate`, het contractpad).

---

## 4. Gevonden fouten

Genummerd verder op de audit (die eindigde bij BUG-230).

### BUG-231 — Een schadecheck opslaan gaf altijd een foutmelding

**Status: opgelost in commit `e19e786f`, aangevuld in `228a21f9` — staat op de
werkbranch, nog NIET in productie.**

Sinds de auditreparatie BUG-104 live ging, antwoordde de server op élke poging om een
schadecheck op te slaan met een fout. Dat gold voor iedere medewerker, ieder voertuig,
iedere reservering en beide soorten check. Er kon dus in die hele periode geen enkele
interactieve schadecheck worden vastgelegd. De oorzaak: het scherm stuurt een datum als
tekst, en de controle aan de serverkant eiste sinds die wijziging een echt datumtype.
Niets had dit gezien, omdat de bestaande test alleen controleerde dat een léég verzoek
werd geweigerd — en een geldig verzoek werd op precies dezelfde manier geweigerd.

Er staan geen foute regels in de database: er kon niets worden opgeslagen, dus er is
niets om op te schonen.

### BUG-232 — Drie serverroutes met dezelfde zwakte

**Status: open.** Dezelfde zwakte als BUG-231 zit nog in drie andere plekken aan de
serverkant (voertuig aanmaken, document aanmaken, portaalgebruiker aanmaken). Vandaag
kan geen enkel scherm daar een datum naartoe sturen, dus er gaat niets mis. Het wordt
pas een echte fout op de dag dat iemand zo'n veld op een formulier zet.

### BUG-233 — Rode foutmelding op elk scherm voor wie geen meldingen mag beheren

**Status: opgelost in commits `900d3fca` en `1d199028`.** Het meldingenklokje bovenin
vroeg op elk scherm gegevens op die alleen iemand met het recht "meldingen beheren" mag
zien. Iedereen zonder dat recht kreeg daardoor op élke pagina een rode foutmelding. In
dezelfde ronde zijn zes plekken van dezelfde soort gevonden en gerepareerd
(dashboard-uitgaven, vervangende voertuigen, documenten, reserveringen, rapporten,
transportoverzicht). Niemand heeft er rechten bij of af gekregen: de schermen vragen
alleen niet langer om gegevens die de server toch weigert.

### BUG-234 — Dezelfde fout, maar dan in vensters

**Status: opgelost in commits `1ecfa440`, `9b925b4c`, `cc3f87d8`, `27fb0e0e`.** Vijf
vensters deden hetzelfde als BUG-233, maar dan pas op het moment dat je ze opende: het
reserveringsformulier, "Onderhoud inplannen", de contractsjabloon-editor, de
transportrapport-editor en de schadecontrole-sjablonen, plus "Nieuw transport". Ook hier
is alleen de vraag weggehaald, niet het recht.

### BUG-235 — Het bevestigingsvenster na ophalen en inleveren is niet weg te klikken

**Status: open.** Zodra het venster "Contract klaar" of "Schadeformulier klaar"
verschijnt, gaat het reserveringsscherm eronder opnieuw open en komt erbovenop te
liggen. De "Sluiten"-knop is zichtbaar maar een klik erop komt op het verkeerde scherm
terecht. Het venster eronder is daarmee onbereikbaar. De test kwam hier rechtstreeks op
vast te lopen; een medewerker zou hetzelfde meemaken.

### BUG-236 — Lege startdatum toont een duur die er niet is

**Status: open.** Het scherm klapt er niet meer uit — dat was de productiefout van 20
september en die is al gerepareerd. Wat er nog wél gebeurt: maak je de startdatum leeg,
dan blijft het overzicht "Duur: 1 dag" tonen naast "Startdatum: Niet geselecteerd".
Diezelfde 1 wordt ook gebruikt om de totaalprijs te berekenen zodra er een voertuig
gekozen is. En het einddatumveld blijft gewoon de oude suggestie tonen, terwijl er geen
startdatum meer is om drie dagen bij op te tellen. Gecontroleerd in de test: de waarde
vóór en ná het wissen is exact dezelfde.

*Technisch:* `client/src/components/reservations/reservation-form.tsx`, regels 693-721 —
de einddatum wordt alleen opnieuw berekend als het veld leeg is of als de huur net van
"zonder einddatum" is omgezet. Het wissen van de startdatum is geen van beide.

### BUG-237 — De klantnaam wordt bij opslaan herschreven

**Status: open.** Elk woord krijgt één hoofdletter aan het begin, de rest wordt klein.
"E2E Story Klant" wordt "E2e Story Klant". Bij een bedrijfsnaam met een afkorting of
een merknaam met opzettelijke hoofdletters gaat dat mis, en het valt niet op omdat
zoeken in de applicatie geen onderscheid maakt tussen hoofd- en kleine letters.

### BUG-238 — Merk en model uit de kentekenopzoeking komen in hoofdletters binnen

**Status: open.** Handmatig getypt wordt "Volkswagen"; via de opzoeking wordt het
"VOLKSWAGEN". In één voertuiglijst staan dan twee schrijfwijzen door elkaar.

### BUG-239 — De voertuigkeuze valt op een gewone laptop buiten beeld

**Status: open.** De keuzelijst van voertuigen klapt altijd naar beneden open, ook als
daar geen ruimte meer is, en je kunt er niet naartoe scrollen. Op een scherm van 1280
bij 720 beeldpunten valt hij daardoor deels buiten beeld, en hoe meer voertuigen er vrij
zijn, hoe eerder dat gebeurt. De testsuite werkt hier omheen door een hoger venster te
gebruiken en eerst op kenteken te zoeken; voor een medewerker op een kleine laptop is
het een echte blokkade, want die kan er niet omheen.

### BUG-240 — Klikken op de tekst naast een vinkje doet niets

**Status: open.** Bij "Toon alle voertuigen (voor langdurige verhuur)" werkt alleen het
kleine vierkantje zelf; op de tekst klikken doet niets. Met het toetsenbord is het vakje
daardoor ook lastiger te bereiken.

### BUG-241 — Het instellingenvenster heeft geen titel voor een schermlezer

**Status: open.** Alleen zichtbaar voor beheerders. De browser meldt dit bij elke keer
openen. Geen gevolgen voor het dagelijks werk, wel voor iemand die met een schermlezer
werkt.

---

## 5. Rechtenprofielen

In deze applicatie is een rol alleen een **etiket**. Alleen "admin" geeft vanzelf alle
rechten; bij iedereen anders staat per persoon een lijstje vinkjes aan. De testsuite
gaat uit van de zeven profielen hieronder. Dat is een **aanname**, geen waarneming van
jouw productieomgeving.

| Profiel | Mag in deze aanname |
|---|---|
| admin | alles |
| manager | alles, behalve gebruikers beheren, back-ups en instellingen |
| user (balie) | dashboard; voertuigen bekijken; klanten bekijken en beheren; reserveringen bekijken en beheren; documenten bekijken en beheren; schadechecks bekijken en beheren; bekeuringen bekijken |
| cleaner | dashboard; voertuigen bekijken; reserveringen bekijken. Verder niets |
| viewer | alleen bekijken: dashboard, voertuigen, klanten, reserveringen, documenten, schadechecks, rapporten |
| accountant | dashboard; voertuigen, klanten en reserveringen bekijken; kosten beheren; documenten bekijken; rapporten bekijken en beheren; bekeuringen bekijken; fiscaal bekijken |
| maintenance | dashboard; voertuigen bekijken en beheren; onderhoud beheren; reserveringen bekijken; schadechecks bekijken en beheren; documenten bekijken |

*Technisch:* `e2e/seed/users.ts`.

**V-1. Kloppen deze zeven profielen met hoe de accounts in productie echt staan?**
Zo niet: welke vinkjes staan er anders? Zolang dit niet klopt, test de suite iets anders
dan wat jouw mensen dagelijks meemaken.

**V-2. Wie moet meldingen krijgen?** Vandaag heeft alleen admin en manager het recht
"meldingen beheren". Iedereen anders ziet helemaal geen meldingen — en kreeg tot voor
kort in plaats daarvan een rode foutmelding op elk scherm (BUG-233). Dat laatste is
weg; de vraag wie meldingen *hoort* te zien, is nooit gesteld. Hetzelfde geldt voor de
recente uitgaven op het dashboard: die zijn nu verborgen voor wie geen kosten mag
beheren.

**V-3. Moeten knoppen en tegels verborgen worden die iemand toch niet mag gebruiken?**
Op het dashboard ziet iedereen die het dashboard mag zien alle snelle acties, ook
"Voertuig toevoegen" en "Klant toevoegen". Op het voertuigenscherm geldt hetzelfde voor
de barcodeboek-, sleutelaudit-, toevoeg- en importknoppen: zichtbaar voor iedereen die
voertuigen mag *bekijken*. De server weigert de handeling wel netjes, dus het is geen
gat in de beveiliging — maar de medewerker ziet knoppen die niets doen. Verbergen of
laten staan?

**V-4. Wat moet iemand zien die het adres intypt van een scherm waar hij geen rechten
voor heeft?** Vandaag laadt het lege scherm gewoon en blijven de gegevens leeg; er
verschijnt geen "geen toegang". In het menu staat het scherm niet, dus je komt er alleen
door het adres te typen of een oude bladwijzer te gebruiken. Wil je een duidelijke
melding "U heeft geen toegang tot dit scherm", of mag dit zo blijven?

**V-5. Op drie plekken zijn het menu en de server het niet met elkaar eens.** Het
onderhoudsscherm vraagt in het menu het recht "onderhoud beheren", maar geen enkel
gegeven op dat scherm is daarmee beveiligd — wie het adres intypt, krijgt de gegevens
gewoon te zien. Bij het transportoverzicht en het communicatiescherm staat het net
andersom of net iets ruimer. Vandaag doet dat niemand kwaad omdat alle zeven profielen
toevallig de juiste combinatie hebben, maar het gaat mis zodra je één vinkje bij iemand
verandert. Moeten menu en server gelijk worden getrokken?

---

## 6. Open vragen uit de audit die bij de balie horen

Deze zijn eerder gesteld en nooit beantwoord. Ze staan hier opnieuw, in de ronde waar ze
thuishoren.

**V-6 (OPT-017) — Welke statusomkeringen mogen, en door wie?** Een ophaling terugdraaien
kan via een knop, maar het voertuig blijft daarna op "verhuurd" staan en de foute
kilometerstand blijft. Een inname terugdraaien kan alleen via de techniek, en wist de
einddatum. Een annulering terugdraaien wordt op de ene weg geweigerd en op de andere
toegestaan. Wat mag wel, wat mag niet, en mag alleen een beheerder het?

**V-7 (OPT-025) — Welke velden zijn verplicht voordat een auto verhuurd mag worden, en
voordat er een contract gemaakt mag worden?** Een voertuig heeft nu drie verplichte
velden van de 46, een klant één van de 34. Een auto zonder APK-datum of dagprijs
verschijnt gewoon als verhuurbaar; dat komt aan de balie terug als een leeg veld op het
contract. Blokkeren bij invoeren, waarschuwen bij boeken, of pas hard eisen bij het
maken van het contract?

**V-8 (OPT-026) — Een boeking op een BV-voertuig zet de tenaamstelling automatisch om
naar Opnaam en meldt dat achteraf.** Dat is een fiscaal en verzekeringstechnisch
relevante wijziging als bijwerking van een andere handeling. Vooraf vragen, of achteraf
melden zoals nu?

**V-9 (OPT-029) — Pechomruil: wat gebeurt er met de oorspronkelijke huur?** Nu blijft
die gewoon openstaan op een auto die in de werkplaats staat: twee lopende huren en twee
auto's op "verhuurd" voor één klant. (Deze vraag begint bij transport, maar de rommel
komt aan de balie terecht.)

**V-10 (BUG-040) — Mag er een reservering in het verleden worden aangemaakt?** Nu wel,
en zo'n reservering blokkeert daarna elke toekomstige boeking op dat voertuig.

**V-11 (BUG-132) — Mag een verhuring die al opgehaald is nog geannuleerd of verwijderd
worden, en door wie?** Nu kan allebei, zonder enige drempel.

**V-12 (BUG-163) — Mag het maken van een contract hard mislukken?** Nu levert het soms
een onbruikbaar bestand. Liever een duidelijke fout dan een leeg contract?

**V-13 (BUG-045) — Moet een debiteurnummer uniek zijn?** Nu niet, en er komt geen
waarschuwing bij een dubbele.

**V-14 (BUG-056) — Wat moet een terugkerende reservering doen?** De velden zijn in te
vullen, maar er ontstaat nooit een vervolgreservering.

**Niet hier gevraagd.** OPT-009 (mag de applicatie zelf een vervanger voorstellen) en
OPT-032 (wat de sleutelkastaudit moet vastleggen) horen bij de ronde onderhoud en
transport en komen daar terug.

---

## 7. Besluiten — hier vul jij in

Eén regel per voorstel en per vraag. "ja" betekent: bouwen. "nee" betekent: niet
bouwen, en de regel gaat dicht. Bij een vraag mag het antwoord ook een zin zijn. Zolang
een regel leeg is, verandert er niets. Wat je hier invult, wordt daarna overgenomen in
`docs/audit/besluiten.md` vanaf B-25.

| Voorstel of vraag | Besluit | Datum |
|---|---|---|
| OPT-034 — contractnummer zelf voorstellen | | |
| OPT-035 — onthoud agenda- of lijstweergave | | |
| OPT-036 — telefoon en e-mail bij de naam | | |
| OPT-037 — na opslaan meteen naar de reservering | | |
| OPT-038 — zeggen wat er aan sjablonen ontbreekt | | |
| V-1 — kloppen de zeven rechtenprofielen met productie? | | |
| V-2 — wie moet meldingen krijgen? | | |
| V-3 — knoppen verbergen die iemand niet mag gebruiken? | | |
| V-4 — wat ziet iemand die een adres intypt zonder rechten? | | |
| V-5 — menu en server gelijktrekken? | | |
| V-6 (OPT-017) — welke statusomkeringen mogen, en door wie? | | |
| V-7 (OPT-025) — welke velden verplicht voor verhuur en contract? | | |
| V-8 (OPT-026) — BV naar Opnaam: vooraf vragen of achteraf melden? | | |
| V-9 (OPT-029) — pechomruil: wat met de oorspronkelijke huur? | | |
| V-10 (BUG-040) — reservering in het verleden toestaan? | | |
| V-11 (BUG-132) — opgehaalde verhuring annuleren of verwijderen? | | |
| V-12 (BUG-163) — mag contractgeneratie hard mislukken? | | |
| V-13 (BUG-045) — debiteurnummer uniek? | | |
| V-14 (BUG-056) — wat moet een terugkerende reservering doen? | | |

---

## Waar dit op gebaseerd is, en waar het wringt

- Alle stappen en aantallen komen uit de gemeten runs van 20 en 21 september 2026
  (`e2e/layer-b/desk/rental-story.spec.ts`, `e2e/layer-b/desk/edge-cases.spec.ts`).
- **Elke handeling loopt echt door de teller.** Dat is mechanisch gecontroleerd: er zit
  geen enkele klik of invulactie in deze twee testbestanden die buiten de teller om
  gaat. De aantallen zijn dus volledig, niet een selectie.
- **De stroom loopt door zonder verborgen omwegen.** Het inleveren begint precies waar
  de schadecheck eindigt; er wordt tussendoor niet stiekem genavigeerd om een scherm
  terug te vinden. Dat is waarom het inleveren op 3 handelingen uitkomt en niet op 6
  (zie de opmerking bij 2.5).
- **De reservering telt 6 of 4, afhankelijk van hoe je het voertuig kiest** (zie 2.2).
  Dat is niet gladgestreken tot één getal, en er is geen voorstel op dat verschil
  gebouwd.
- **De tests draaien in een venster van 1280 bij 1400 beeldpunten**, hoger dan een
  gewone laptop. Dat is geen technisch detail: het is nodig omdat de voertuigkeuze
  anders buiten beeld valt (BUG-239). Op een echte laptop van 1280 bij 720 loopt een
  medewerker daar dus tegenaan.
- De schadecheck (2.4) is pas ná de reparatie van BUG-231 voor het eerst echt gedraaid.
  De drie handelingen zijn dus gemeten, niet geschat — maar op de gerepareerde code, die
  nog niet in productie staat.
- De tellingen zijn "vandaag, met de fouten er nog in". Wordt BUG-235 opgelost, dan komt
  er bij ophalen en inleveren mogelijk nog een klik "Sluiten" bij die vandaag simpelweg
  niet lukt. Dat moet dan opnieuw gemeten worden.
