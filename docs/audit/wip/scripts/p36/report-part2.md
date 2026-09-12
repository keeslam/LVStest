---

## 2. Uitkomst in één oogopslag

| Oordeel | Aantal | Aandeel |
|---|---|---|
| **FIXED** | **171** | 74,3 % |
| **NOT FIXED** | **42** | 18,3 % |
| **CHANGED BY DECISION** | **12** | 5,2 % |
| **NOT APPLICABLE** | **5** | 2,2 % |
| **NIET VASTGESTELD** | **0** | 0 % |
| Totaal | 230 | |

Per zwaarte:

| Zwaarte | FIXED | NOT FIXED | CHANGED BY DECISION | NOT APPLICABLE |
|---|---|---|---|---|
| **CRITICAL** (13) | **13** | 0 | 0 | 0 |
| **HIGH** (64) | 50 | 9 | 5 | 0 |
| **MEDIUM** (94) | 67 | 18 | 6 | 3 |
| **LOW** (59) | 41 | 15 | 1 | 2 |

**Alle dertien CRITICAL-bugs zijn dicht en runtime bevestigd.** Dat is het belangrijkste cijfer in
dit rapport. Daaronder wordt het beeld gemengder: van de 64 HIGH-bugs staan er negen nog open,
waarvan er twee — BUG-069 en BUG-070 — beveiligingsgaten zijn die het plan als gesloten opvoert.

Er is **geen enkele bug die niet vastgesteld kon worden**: elk van de 230 reproducties gaf een
eenduidige uitkomst in de ene of de andere richting.

### 2.1 De eenheidstests als los signaal

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lvs_fixtest npx vitest run
```

**119 testbestanden / 893 tests, alle groen, afsluitcode 0**, looptijd 531 s. De opdracht noemde
116 bestanden / 850 tests als stand vóór de laatste twee commits; de suite is dus met 3 bestanden
en 43 tests gegroeid en nergens roder geworden.

Let wel: een groene eenheidstestsuite en dit rapport meten niet hetzelfde. Van de 42 bugs die
hieronder NOT FIXED heten, zijn er meerdere waarvoor wél een test bestaat die groen is — die test
dekt dan de helft van de bug die is opgelost. BUG-192 is daar het scherpste voorbeeld van.

### 2.2 De twee proceskill-bugs, apart bewezen

Dit was de zwaarste klasse in de audit: één verzoek dat het hele Node-proces uitzette, waarna de
applicatie 15-20 s onbereikbaar was voor iedereen.

| Bug | Lading | Antwoord | Uptime ervoor → erna | Daarna nog een gewoon verzoek |
|---|---|---|---|---|
| **BUG-061** | `GET /api/portal-admin/customers/999999999/settings` | **404** `{"message":"Customer not found"}` | 332,8 s → 333,1 s (**doorgelopen**) | `GET /api/vehicles` → 200 |
| **BUG-002** | `POST /api/portal/requests` met `payload:"not-json-at-all"` | **400** `{"error":"payload is not valid JSON","code":"PORTAL_VALIDATION"}` | 373,1 s → 373,9 s (**doorgelopen**) | `GET /api/portal/me` → 200, `GET /api/vehicles` → 200 |
| **BUG-101** | 19 600 022 B XML, 2,8 miljoen niveaus diep | **400** | 776,35 s → 776,54 s (**doorgelopen**) | `GET /health` → 200 |

Script: `p36-killcheck.cjs`. De uptime is de sluitende maat: een herstart zet hem terug op nul.
Hij liep gedurende de hele fase monotoon door, van 158 s bij aanvang tot 2 755 s na de laatste
hersteltest — **geen enkele herstart**, ook niet na duizenden verzoeken van vijf gelijktijdige
controleurs, drie DoS-ladingen, een databaseherstel en een reeks corrupte archieven.

---

## 3. Resultaten per bug

Eén regel per bug, alle 230. De volledige reproductie per bug staat in de logboeken onder
`docs/audit/wip/scripts/p36/` (`results-A.jsonl` … `results-E.jsonl`, met de probescripts ernaast).

