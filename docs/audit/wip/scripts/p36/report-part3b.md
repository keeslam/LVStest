
### 4.2 Keten 2 — onderhoud, vervanger, transport, afronden

Scripts: `p36-flow2-maint.cjs`, `p36-flow2b.cjs`, `p36-flow2c-spare.cjs`, `p36-flow2d.cjs`.

| # | Stap | Resultaat | Vergeleken met de audit |
|---|---|---|---|
| 1 | Onderhoudsblok op een vrije auto | HTTP 201 | gelijk |
| 2 | Boeken over een onderhoudsblok | **HTTP 201 — mag** | **nieuw gedrag (B-09)**: vroeger 409 |
| 3 | Waarschuwing vooraf | `GET /api/reservations/booking-check` geeft `warnings` met code `MAINTENANCE_OVERLAP`: "Let op: dit voertuig staat in deze periode ingepland voor onderhoud (02-10-2026 t/m 04-10-2026). Opslaan mag; het onderhoudsblok blijft staan." | **nieuw (B-09)**, Nederlands, dd-mm-jjjj |
| 4 | Telt de auto als beschikbaar tijdens onderhoud? | `GET /api/vehicles/available` → **nee** | **conform B-01** |
| 5 | Onderhoud op een auto met een lopende huur | HTTP 200 met `needsSpareVehicle:true`, de conflicterende huur en `maintenanceReservationId` | gelijk gedrag, nu met het id erbij |
| 6 | Onderhoud plus vervanger in één handeling | HTTP 201: één blok en één vervangingsreservering | **beter** — B3-2: kostte drie handelingen in twee schermen |
| 7 | Transport aanmaken en afronden | 201 respectievelijk 200 | gelijk |
| 8 | Werkplaatsvlag na het afronden van het transport | blijft **`needs_fixing`**, de notitie blijft staan | **beter** — B2-2: de vlag werd vroeger gewist |
| 9 | Ophalen van een auto in de werkplaats | **HTTP 409 `VEHICLE_IN_WORKSHOP`**, `overridable:true` | **nieuw gedrag (B-03)** |
| 10 | Onderhoud afronden met een datum vóór de start van het blok | HTTP 400 "The completion date cannot be before the block started." | **beter** — B3-3: schreef vroeger een einddatum vóór de startdatum |

**Eén robuustheidsgat, geen achteruitgang.** Laat een aanroeper `maintenanceId` weg bij
`maintenance-with-spare`, dan maakt de server een **tweede** onderhoudsblok aan naast het blok dat
de vorige aanroep al aanmaakte — waargenomen: blok 3329 en 3330 op voertuig 1788, waarvan alleen
3330 aan de vervanger hangt. Het echte scherm stuurt `maintenanceId` wel mee; de server dwingt het
niet af.

### 4.3 Keten 3 — portaalaanvraag, beoordeling aan de balie

Script: `p36-flow3-portal.cjs`, portaalklant 179.

| # | Stap | Resultaat |
|---|---|---|
| 1 | Klant logt in op het portaal | HTTP 200 |
| 2 | Voertuig online zetten | HTTP 200 |
| 3 | Klant dient een boekingsaanvraag in | HTTP 201, aanvraag 577 |
| 4 | Aanvraag in de balie-inbox | HTTP 200, gevonden; teller nieuwe aanvragen = 1 |
| 5 | Oppakken | HTTP 200, status `in_progress` |
| 6 | Goedkeuren | HTTP 200; er ontstaat reservering 3299 |
| 7 | Klant ziet de reservering | HTTP 200, reservering 3299 bovenaan de portaallijst |
| 8 | Portaalmelding voor de klant | HTTP 200, drie meldingen, laatste "Aanvraag #577 afgehandeld" |
| 9 | Aanvraag afgesloten | status `done` |

**Kanttekening.** De aangemaakte reservering heeft `portal_request_id = NULL`: de koppeling bestaat
alleen van de aanvraag naar de reservering, niet terug, terwijl de kolom er wel is.
