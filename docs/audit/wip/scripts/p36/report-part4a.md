
---

## 5. Metingen — wat fase 19 mat, opnieuw gemeten op de gerepareerde code

**Leesinstructie.** De "voor"-kolom komt uit `docs/audit/wip/p19-performance.md`, gemeten op
`lvs_audit` (665 voertuigen / 2 075 reserveringen). De "na"-kolom is `lvs_regress` (499 voertuigen /
1 806 reserveringen plus de P36-fixtures). **De databases zijn niet even groot.** Absolute
bytetotalen zijn daarom niet één-op-één vergelijkbaar; **bytes per rij en statementtellingen wel**,
en dat zijn de getallen waar de conclusies op rusten.

De statementtellingen hieronder zijn gemeten met **dezelfde methode als fase 19**:
`log_min_duration_statement = 0` plus `log_line_prefix = '%t %d %a '`, tellen van `statement:`- en
`execute`-regels die bij `lvs_regress` horen, drie herhalingen waarvan het minimum. De
Postgres-instellingen zijn daarna exact teruggezet op `-1` en `'%t '`. Een tweede controleur kwam
met een andere methode (transactietellerdelta's) op vrijwel dezelfde getallen uit; waar ze
verschillen staan beide vermeld.

### 5.1 De maandweergave van de kalender — de zwaarste klacht van fase 19

| Meting | Voor (fase 19) | Na (fase 36) |
|---|---|---|
| **SQL-statements, maand** | **924** voor 462 rijen (2 per rij, N+1) | **9** voor 392 rijen · tweede meting 11 voor 331 rijen |
| **SQL-statements, heel jaar** | **3 774** voor 1 894 rijen | **11** voor 1 724 rijen |
| Latentie p50 / p95 | 1 275 ms / 3 692 ms | **58,4 ms / 67,1 ms** |
| Latentie, 10 parallel (p95) | 6 893 ms | **361 ms** |
| Payload | 1 651 568 B (3 582 B per rij) | 1 462 700 B (**3 559 B per rij — ongewijzigd**) |

Dit is de duidelijkste winst in het hele rapport. De statementtelling is **constant geworden**: een
maand en een heel jaar kosten evenveel queries. De code laat zien waarom — `getReservationsInDateRange`
(`server/database-storage.ts:2065`) laadt voertuigen, chauffeurs en de klant-van-het-blok nu in
gebundelde `inArray`-queries in plaats van twee tot drie queries per rij, en de vier
`console.log`-regels per onderhoudsblok zijn weg.

Wat **niet** veranderd is: de omvang per rij. De volledige voertuig- en klantrij zit nog in elk
reserveringsitem. Dat is BUG-205, en dat is een eigenaarsbeslissing die nog niet genomen is.

### 5.2 De lijsten

| Endpoint | Voor: bytes (rijen) | Voor: B/rij | Na: bytes (rijen) | Na: B/rij | Oordeel |
|---|---|---|---|---|---|
| `GET /api/reservations` | 8 029 598 (2 075) | 3 869 | 7 736 798 (1 984) | **3 899** | ongewijzigd; `?limit=50` wordt genegeerd |
| `GET /api/vehicles` | 1 157 506 (665) | 1 740 | 1 299 182 (713) | **1 822** | ongewijzigd |
| `GET /api/customers` | 406 358 (348) | 1 168 | 380 828 (332) | **1 147** | ongewijzigd |
| `GET /api/expenses` | 4 252 990 (1 999) | 2 128 | 4 404 949 (1 995) | **2 208** | ongewijzigd |
| **`GET /api/interactive-damage-checks`** | **17 043 541** (14) | 1 217 396 | **4 408** (14) | **315** | **3 866× kleiner** |
| `GET /api/today` | bestond niet | — | 4 790 / 6 285 (8 groepen) | — | nieuw, 5 gejoinde queries |

De schadecheck-lijst is het tweede grote succes: de base64-afbeeldingen zijn uit de lijstprojectie
gehaald, waardoor 17 MB naar 4,4 kB gaat en het rapport dat die lijst gebruikte
(`mileage-per-month`) van 126,9 ms naar 83 ms.

### 5.3 Schrijven tijdens het lezen, en de eerste schermopbouw

| Meting | Voor | Na |
|---|---|---|
| `GET /api/vehicles` doet UPDATE's tijdens het lezen | tot 3 UPDATE's per leesverzoek | **0** — de statementlog toont alleen sessie-select, tweemaal gebruiker, één voertuig-select en de rollende sessie-UPDATE; de teller `n_tup_upd` blijft over drie herhalingen op 0 |
| Reserveringenpagina, eerste opbouw | 9 verzoeken / **19,61 MB** (de 8 MB-lijst werd **twee keer** gehaald) | 8 verzoeken / **11,63 MB** — de lijst wordt nog één keer gehaald |
| Dashboard | 17 verzoeken / 13,06 MB | 17 verzoeken / 12,76 MB |
| Onderhoudskalender | 10 / 10,51 MB | 10 / 10,19 MB |
| Voertuigen | 4 / 8,77 MB | 4 / 8,62 MB |
| Klanten | 5 / 8,05 MB | 5 / 7,74 MB |
| Schadecheck-PDF | 3 465 695 B, p50 581 ms, piek 2 598 ms | **5 619 B**, 96-109 ms, piek **131 ms** |
| Logregels per schermopbouw op het hete pad | 17 566 B consolelog; PDF-generatie 34 regels | **0**; PDF-generatie **1** |
| Verzoek met een lichaam van 2 MB | 400 ná het parsen, +100 MB RSS | **413 in 16 ms** |

De dubbele ophaalactie op de reserveringenpagina is weg (twee cachesleutels voor dezelfde URL zijn
er één geworden): 19,61 MB naar 11,63 MB, ruim 40 % minder. De overige pagina's zijn nauwelijks
veranderd, want daar zat geen dubbeling — daar zit de omvang in de rijen zelf (BUG-205) en in het
ontbreken van compressie.

### 5.4 Compressie — besluit B-19, niet uitgevoerd

**B-19 luidt: "aanzetten in de applicatie zelf, niet afhankelijk van wat de proxy doet."**
Dat is niet gebeurd. Plat gezegd: **er is geen compressie.**

| Controle | Uitkomst |
|---|---|
| `grep compression package.json server/` | **0 treffers** — het pakket is geen afhankelijkheid en er is geen middleware |
| `GET /api/vehicles` met `Accept-Encoding: gzip, deflate, br` | HTTP 200, **geen `content-encoding`-kop**, geen `vary`-kop, `content-length: 983 438` |
| `GET /api/reservations`, idem | 7 047 576 B ongecomprimeerd over de lijn |
| `GET /api/customers`, idem | 361 140 B ongecomprimeerd |
| Wat het zou schelen (gemeten met gzip -6 op dezelfde bytes) | `/api/vehicles` 950 868 → **32 810 B (28,5×)** · `/api/reservations` 6 917 279 → **255 974 B (27×)** |

Dit is geen randgeval: het is de grootste enkele winst die nog op tafel ligt, hij is met één
middleware te halen, het besluit is genomen, en hij zit er niet in. In de tabel is dit **BUG-214,
NOT FIXED**.
