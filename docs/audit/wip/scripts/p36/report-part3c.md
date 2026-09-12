
### 4.4 Keten 4 — back-up en herstel

Script: `p36-flow4-backup.cjs`.

| # | Stap | Resultaat | Vergeleken met de audit |
|---|---|---|---|
| 1 | Back-upgezondheid | 200, `backupPathFromEnv:true`, pad wijst naar `regress-backups`, `stale:false` | **nieuw** |
| 2 | Back-up draaien | 200; database-archief 13 940 612 B mét checksum en manifest, plus een bestandsarchief | gelijk, nu met checksum |
| 3 | Herstel zonder bevestiging | **HTTP 400** "Confirmation does not match. Type the exact backup filename to confirm this restore." | **nieuw** — bevestigingsdrempel |
| 4 | Beschadigd archief, geen gzip | HTTP 400 "Refusing to restore: the dump is only 45 bytes — it is empty or truncated, **so nothing was changed**." | **beter** — vroeger een lege 500 (BUG-197) |
| 5 | Geldige gzip met onzin erin | HTTP 400, zelfde boodschap, 56 B na uitpakken | **beter** |
| 6 | Padtraversal in de bestandsnaam, ook met backslashes | HTTP 404 "Backup file not found" | **beter** |
| 7 | **Goed archief herstellen** | **HTTP 200 in 4 426 ms**; vooraf automatisch een veiligheidsback-up, waarvan de naam in het antwoord terugkomt | **beter** — veiligheidskopie en naamteruggave zijn nieuw |
| 8 | Toestand na het herstel | Database teruggerold naar de momentopname van 19:09: voertuigen 716 naar **645**, reserveringen 2 034 naar **1 948**, gebruikers 23 naar **21** | herstel doet wat het belooft |
| 9 | Server na alles | `/health` 200, uptime 2 755 s, doorgelopen | geen procesimpact |

Twee dingen werken hier **niet**, en die staan als bug in de tabel: `GET /api/backups/download-files`
en `download-code` geven op deze Windows-host nog steeds **500** met de melding
`tar (child): Cannot connect to C: resolve failed` (BUG-209, BUG-219) — het herstelpad is omgezet
naar de npm-`tar`-bibliotheek, het downloadpad roept nog de externe `tar` aan zonder `--force-local`.

### 4.5 Keten 5 — bulkimport

Script: `p36-flow5-import.cjs`.

| Rij | Invoer | Resultaat |
|---|---|---|
| A | APK-datum `31-12-2027`, Nederlandse notatie | geïmporteerd, opgeslagen als **2027-12-31** — geen dagverschuiving |
| B | APK-datum `2027-12-31`, ISO | geïmporteerd, 2027-12-31 |
| C | APK-datum `geen idee` | **afgekeurd met een melding per regel**: "apkDate is not a date we can read (use dd-mm-yyyy or yyyy-MM-dd)" |
| D | APK-datum leeg | geïmporteerd, APK leeg |
| E | geen kenteken | afgekeurd: "License plate is required" |

Eindstand 3 geïmporteerd, 2 afgekeurd, elk met een eigen reden — precies **B-12**. BUG-124
(Nederlandse datums als Amerikaanse lezen, onleesbare datums stil weglaten) is daarmee dicht.

### 4.6 Besloten gedragsveranderingen, apart nagelopen

Script: `p36-flow6-besluiten.cjs`.

| Besluit | Wat er gebeurt | Bewijs |
|---|---|---|
| **B-14** voertuig verwijderen | Eerst een impactlijst, dan een bevestiging ("typ het kenteken"), en pas daarna de weigering | impactlijst 200 met `blocked:true`; verwijderen zonder bevestiging 400 `CONFIRMATION_REQUIRED`; mét bevestiging **409 `VEHICLE_HAS_LIVE_RESERVATIONS`** — "Dit voertuig heeft een lopende of geplande huur en kan niet worden verwijderd." |
| **B-08** klant verwijderen | Zelfde regel | **409 `CUSTOMER_HAS_LIVE_RESERVATIONS`** met de blokkerende reserveringen erbij |
| **B-15** prullenbak | `GET /api/deleted-records` bevat 47 rijen: 9 reserveringen, 10 voertuigen, 1 transport, 27 bekeuringen | terugzetten geeft 200 "Restored Reservering #3375 …"; de reservering staat daarna weer op `booked` |
| **B-17** werkdagscherm | `/api/today` levert `pickups`, `returns`, `maintenance`, `transports`, `spareAssignments`, `portalRequests` en een `counts`-blok — de drie groepen uit B-17, en **geen** lijst "te laat terug", zoals besloten | HTTP 200, 4 790 B, 5 gejoinde queries, geen N+1 |

### 4.7 Werd er iets slechter dan de audit het aantrof?

**Nee, met één uitzondering.** Geen 5xx in de rooktest over 43 schermendpoints, geen procesherstart,
geen werkstroom die vastliep, en twee endpoints die de audit kapot aantrof doen het weer:

| Endpoint | Audit (fase 19) | Nu |
|---|---|---|
| `GET /api/reports/maintenance-costs` | **HTTP 500** (BUG-089) | HTTP 200, 87 005 B, 89 ms |
| `GET /api/reports/mileage-per-month` | 126,9 ms, laadt 17 MB base64 om kilometerstanden te lezen | HTTP 200, 116 729 B, 83 ms |

De uitzondering is **de taal van de gegenereerde documenten**: besluit B-18 is genomen en niet
uitgevoerd (§7). Dat is geen achteruitgang ten opzichte van de audit, maar wel een besluit dat
onuitgevoerd in productie zou komen.

Drie kleinere zaken die opvielen en die géén achteruitgang zijn, maar wel de aandacht verdienen:

1. **De meldingen zijn gemengd Nederlands en Engels.** Alles wat in deze ronde nieuw is gebouwd
   spreekt Nederlands ("Deze huur begint pas op …", "Dit voertuig heeft een lopende of geplande
   huur …"); de oudere meldingen eromheen zijn nog Engels ("This vehicle is marked as needing
   service …", "Invalid pickup date", "Reservation not found"). Een medewerker ziet in één
   werkstroom beide talen.
2. **Een onbekende `/api/…`-route geeft in ontwikkelmodus 200 met HTML** in plaats van 404. De
   404-afhandelaar bestaat (`server/index.ts:450-453`) maar zit in de productietak.
3. **De 429-melding van de verzoeklimiet is kale HTML** ("Too many requests, please try again
   later."), geen JSON met foutcode zoals de rest van de API. Een scherm kan daar niets
   verstandigs mee tonen.
