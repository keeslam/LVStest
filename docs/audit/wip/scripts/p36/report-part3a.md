
---

## 4. Doorloop van de kernwerkstromen

Alle stappen zijn echte HTTP-verzoeken op :5003, met de uitkomst uit de database ernaast gelegd.
De laatste kolom zet de stap naast de bevinding uit `08-phase-20-33-workflow-rapport.md` §4
(de ketenbreuken B1-1 t/m B4-4).

### 4.1 Keten 1 — klant, reservering, contract, ophalen, innemen, documenten

Scripts: `p36-flow1-rental.cjs`, `p36-flow1b-contract.cjs`.

| # | Stap | Resultaat | Vergeleken met de audit |
|---|---|---|---|
| 1 | Klant aanmaken | HTTP 201, klant 1251 | gelijk |
| 2 | Voertuig aanmaken | HTTP 201, voertuig 1682 | gelijk |
| 3 | Reservering, start morgen | HTTP 201, reservering 3225 | gelijk |
| 4 | Contract genereren | HTTP 200, `application/pdf`, 5 433 B; de tekst bevat klantnaam, adres, kenteken en contractnummer | **beter** — B4-3: genereren registreert nu wel een `documents`-rij |
| 5a | Ophalen vóór de startdatum, zonder antwoord | **HTTP 409 `PICKUP_BEFORE_START_DATE`** — "Deze huur begint pas op 2026-09-13. Gaat de huur vandaag in?" | **nieuw gedrag (B-16)** |
| 5b | Ophalen na "ja" | HTTP 200, status `picked_up`, startdatum verschoven naar 2026-09-12 | **nieuw gedrag (B-16)** |
| 6a | Innemen | HTTP 200 | gelijk |
| 6b | Status na innemen | **`completed`**, `completion_date = 2026-09-12` | **beter** — B1-5: `returned` bleef vroeger staan (B-02) |
| 6c | Einddatum na innemen | **2026-09-17**, de afgesproken datum, ongewijzigd | **beter** — B1-3: innemen overschreef de einddatum vroeger met vandaag |
| 6d | Voertuig na innemen | `available`, kilometerstand 10 200 | gelijk |
| 7 | Documenten bij de reservering | HTTP 200; bekijken en downloaden beide 200 | gelijk |
| 8 | Contract verouderd na een wijziging | Na een datumwijziging krijgt document 261 de status **verouderd**; opnieuw genereren geeft 201 en document 262 | **beter** — B4-1 en B4-2 (B-05); het versienummer staat nu in een eigen kolom |

**Observatie bij stap 4.** Het sjabloon dat in deze database als standaard staat (`gffg`, id 2)
heeft **nul velden**, en generatie weigert daarop met een duidelijke 409: het contract zou blanco
zijn. Dat is precies het gewenste gedrag, maar het betekent ook dat er met de huidige
standaardinstelling van deze database geen contract te maken is tot iemand een sjabloon met velden
als standaard zet. Voor de doorloop is een sjabloon met 20 velden gebruikt.
