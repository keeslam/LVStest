
---

## 9. Bewijsmateriaal

Alles staat in `docs/audit/wip/scripts/p36/`:

| Bestand | Inhoud |
|---|---|
| `results-A.jsonl` … `results-E.jsonl` | oordeel plus bewijsregel per bug, alle 230 |
| `aggregate.json`, `table-all.md`, `sections.md` | de samengevoegde uitslag en de tabellen in dit rapport |
| `bugindex.json` | reproductie en regressietest per bug, uit de rapporten 03 t/m 07 |
| `p36-killcheck.cjs` | de proceskill-tests (BUG-002, BUG-061, BUG-101) |
| `p36-flow1…flow6*.cjs`, `flow*.json` | de werkstroomdoorloop |
| `p36-smoke.cjs`, `smoke.json` | de rooktest over 43 schermendpoints |
| `p36-measure.cjs`, `p36-sqlcount3.cjs`, `measurements.json`, `sqlcount.json` | de metingen van de leider |
| `e-perf.out.json`, `e-sqlcount.out.json`, `e-compress.out.json` | de metingen van de tweede controleur |
| `a-*.cjs`, `b-*.cjs`, `p36c-*.cjs`, `p36d-*.cjs`, `e-*.cjs` | de probescripts per bugbereik |
| `vitest.out` | de volledige uitvoer van de eenheidstestsuite |

De originele auditscripts onder `docs/audit/wip/scripts/` zijn niet gewijzigd; wat nodig was is
gekopieerd naar `p36/` en op poort 5003 gericht. Aan de applicatiecode is niets veranderd —
`git diff HEAD` is leeg, en `git status` toont alleen de onbewaakte map `p36/`.

### Fixtures die in `lvs_regress` zijn achtergebleven

Alles draagt een `AUDIT-P36`-voorvoegsel. Testaccounts: `audit-p36w`, `AUDIT-P36B-nobody`,
`AUDIT-P36B-viewer`, `AUDIT-P36B-manager`, `AUDIT-P36D-adm`, `AUDIT-P36D-limited`. Het wachtwoord
van de bestaande portaalgebruiker `portaal-test@example.com` is gezet om de BUG-002-reproductie te
kunnen draaien. Twee controleurs hebben waarden die zij tijdelijk overschreven
(`pdf_templates.background_path`, `damage_check_templates.background_path`, `app_settings` id 7,
`pdf_templates.is_default`) uit de vooraf gemaakte dump teruggezet.

**Let op bij hergebruik van deze database:** de laatste handeling van deze fase was de hersteltest
uit §4.4 stap 7. `lvs_regress` staat daardoor op de momentopname van 19:09 uur — voertuigen 645,
reserveringen 1 948, gebruikers 21. Fixtures die ná dat tijdstip zijn aangemaakt, en de
bewijsregels in dit rapport die daarnaar verwijzen, bestaan in de database niet meer. De
veiligheidskopie van vlak vóór het herstel staat als
`regress-backups/database/2026/09/12/db-backup-2026-09-12T19-33-33-865Z.sql.gz`.
