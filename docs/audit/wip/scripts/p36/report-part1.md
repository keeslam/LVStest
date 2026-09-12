# Fase 36 — Volledig regressierapport

**Datum:** 2026-09-12 · **Tak:** `fix/audit-remediation` (75 commits boven `main`) ·
**Server:** `http://127.0.0.1:5003` · **Database:** `lvs_regress` · **Opdracht:** verifiëren, niet repareren.

Dit rapport controleert of de fixes uit fase 34 en 35 doen wat ze beloven. Het draait de
reproducties uit de audit zelf opnieuw tegen de gerepareerde code en noteert per bug wat er
gebeurde. Er is in deze fase **geen applicatiecode gewijzigd**; `git status` toont alleen de
onbewaakte map `docs/audit/wip/scripts/p36/` met de testscripts en hun uitvoer.

---

## 1. Methode en omgeving

### 1.1 Wat er draaide

| Onderdeel | Waarde |
|---|---|
| Applicatie | `http://127.0.0.1:5003`, tak `fix/audit-remediation` |
| Uitvoermodus | **`NODE_ENV=development`** (bevestigd: procesketen `cross-env NODE_ENV=development tsx server/index.ts`, PID 20456) |
| Database | `lvs_regress` — verse kloon van de ontwikkelkloon `lvstest` (499 voertuigen / 1806 reserveringen), gemigreerd met `startup-migration.js` |
| Uploadsmap | `C:\Users\kees lam\Desktop\LVStest-main\regress-uploads` |
| Back-upmap | `C:\Users\kees lam\Desktop\LVStest-main\regress-backups` |
| Inloggen | `admin` / `admin123`; daarnaast het eigen testaccount `audit-p36w` en de portaalgebruiker `portaal-test@example.com` (klant 179) |
| Draaitijd | De server is de hele fase **niet één keer herstart**: `/health` liep monotoon door van `uptime 158 s` bij aanvang tot `uptime 2755 s` na de laatste hersteltest. |

**De ontwikkelmodus is belangrijk voor drie uitspraken in dit rapport** en wordt daar telkens
genoemd: (a) een onbekende `/api/…`-route valt door naar de SPA en geeft **200 met HTML** in plaats
van 404 JSON — de 404-afhandelaar in `server/index.ts:450-453` zit in de productietak die alleen
draait als er een gebouwde `public/`-map is; (b) foutantwoorden dragen een stacktrace
(`server/index.ts:476-481`, bewust `NODE_ENV`-gebonden — dit is BUG-057); (c) prestatiecijfers zijn
gemeten op `tsx` zonder productiebundel. De sprong van een dev- naar een productie-uitvoering is
dus nog niet gemeten en hoort in een aparte controle vóór uitrol.

### 1.2 Hoe er gemeten is

- **Reproducties.** Voor elke bug zijn de velden *Reproduction* en *Regression test* uit het eigen
  trackerrapport (`docs/audit/03-…` t/m `07-…`) uitgelezen naar
  `docs/audit/wip/scripts/p36/bugindex.json` (alle 230 gevonden, geen gaten) en opnieuw uitgevoerd.
- **Werkwijze.** Echte HTTP-verzoeken via `docs/audit/wip/scripts/p36/lib.cjs` (cookies en CSRF
  automatisch), echte SQL tegen `lvs_regress`, echte bestanden in de uploads- en back-upmap, echte
  gegenereerde PDF's (tekst uitgelezen met `pdfjs-dist`). Bestaande auditscripts (`p9-*` … `p19-*`)
  zijn **gekopieerd** naar `p36/` en op poort 5003 gericht; de originelen zijn niet aangeraakt.
- **Verdeling.** Vijf parallelle controleurs, elk met een eigen bugbereik en een eigen
  fixture-voorvoegsel (`AUDIT-P36A` … `AUDIT-P36E`); de werkstroomdoorloop, de metingen, de
  opschoningsscripts en de proceskill-tests zijn door de leider zelf gedaan (`AUDIT-P36W`).
- **Codeinspectie** is toegestaan waar een runtime-reproductie onmogelijk of onverantwoord was
  (bijvoorbeeld een herstel dat de repository zou overschrijven). Dat staat dan letterlijk in het
  bewijs als `code-inspectie`, met bestand en regelnummer.

### 1.3 Woordenboek van de oordelen

| Oordeel | Betekenis |
|---|---|
| **FIXED** | De beschreven reproductie geeft nu het beschreven verwachte resultaat. |
| **NOT FIXED** | De reproductie geeft nog steeds het oude, kapotte resultaat — of de belofte is maar gedeeltelijk waargemaakt. |
| **CHANGED BY DECISION** | Het gedrag wijkt bewust af, volgens een vastgelegd eigenaarsbesluit uit `besluiten.md`; het B-nummer staat erbij. |
| **NOT APPLICABLE** | Weerlegd, alleen-ontwikkelomgeving, of door het plan uitgesteld; er viel niets te repareren. |
| **NIET VASTGESTELD** | Niet te reproduceren, in geen van beide richtingen. Dit is nadrukkelijk **geen** "opgelost". |

### 1.4 Wat de meting kon vertroebelen — en wat daaraan gedaan is

- **Gedeelde limieten.** De nieuwe verzoeklimiet telt **per gebruiker** (1000 per 15 minuten,
  `server/middleware/security/rateLimiter.ts:24-37`), en de inloglimiet **per IP** (5 mislukte
  pogingen per 15 minuten). Vijf gelijktijdige controleurs op één account liepen daar tegenaan.
  Dat is de fix van BUG-074/BUG-009 die werkt, niet een storing — maar het betekende wel dat er
  eigen testaccounts aangemaakt moesten worden en dat sommige metingen herhaald zijn in een stille
  periode. Waar een meting in een drukke periode viel, staat dat erbij.
- **Ruis bij het tellen van SQL.** De statementtelling is gedaan met de methode van fase 19
  (`log_min_duration_statement = 0`, tellen van `statement:`/`execute`-regels), met per endpoint
  drie herhalingen waarvan het **minimum** is genomen; vervuiling kan alleen optellen. De
  Postgres-instelling is daarna exact teruggezet (`-1`, `log_line_prefix = '%t '`).
- **Fixtures.** Alles wat is aangemaakt draagt een `AUDIT-P36`-voorvoegsel. Dat is zichtbaar in de
  cijfers: de rijaantallen in de metingen liggen hoger dan de 499/1806 waarmee de kloon begon.
