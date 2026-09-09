# PHASE 2 REPORT — Baseline testing

Datum 2026-09-09, commit 3969ca5b (code identiek aan productie 3e28645e). Alles uitgevoerd op de dev-machine (Windows, Node 24, lokale Postgres `lvstest`).

## Baseline

| Check | Commando | Resultaat |
|---|---|---|
| Unit + integration (server/shared/scripts) | `npx vitest run` | 26 bestanden, **126 tests geslaagd**, 0 gefaald, 49 s. Draait tegen de gedeelde dev-database. |
| E2E | – | **Niet aanwezig.** Geen Playwright/Cypress; alleen handmatige browsercontrole via Claude Browser. |
| API-tests | onderdeel van vitest (supertest) | Dekt vooral portaal, boetes, exportscript; staff-API grotendeels ongedekt. |
| Typecheck | `npx tsc --noEmit -p tsconfig.json` | **0 fouten.** |
| Lint | – | **Geen ESLint/Prettier-config in de repo.** |
| Build | `npm run build` (schema:export + vite + esbuild) | **Geslaagd** in 22 s; `dist/server/index.js` 1,2 MB; chunk-size-waarschuwing (code-splitting). Build herschrijft `schema-columns.json` alleen qua regeleinden (autocrlf), geen inhoudsverschil. |
| Database | migratie-dry-run gisteren (`node -r dotenv/config startup-migration.js`) | Exit 0 tegen dev-DB; verse DB 47/47 tabellen (fase 0-context). |
| Security (dependencies) | `npm audit` | **70 kwetsbaarheden: 3 critical, 23 high, 36 moderate, 8 low.** |
| CI | – | **Geen `.github/workflows`.** |

## npm audit — relevante posten

Geïnstalleerde versies: drizzle-orm 0.39.3, express 4.21.2, express-rate-limit 8.1.0, nodemailer 7.0.6, socket.io 4.8.1 (engine.io 6.6.4, socket.io-parser 4.2.4), tar 7.4.3, vite 5.4.14, vitest 2.1.9, postcss 8.4.47, ws 8.18.3, lodash 4.17.21, fast-xml-parser 4.5.7 + 5.11.1.

| Pakket | Ernst | Direct? | Advisory | Relevantie voor deze app |
|---|---|---|---|---|
| tar 7.4.3 | critical | direct | arbitrary file overwrite via hardlink/symlink path traversal | backup-restore pakt tar-archieven uit (`backupService.restoreFiles`); geüploade backups zijn admin-only maar dit is precies het aanvalspad |
| fast-xml-parser | critical | transitief | DoS numeric entities, entity-bypass | CJIB XML-parser? te verifiëren welke keten |
| vitest 2.1.9 | critical | dev | UI-server file read | alleen dev; Vitest UI wordt niet gebruikt |
| drizzle-orm 0.39.3 | high | direct | SQL-injectie via onjuist ge-escapete identifiers | app bouwt `sql.raw` met tabelnamen in migratie/queries; fase 8 |
| express 4.21.2 | high | direct | body-parser, path-to-regexp ReDoS | |
| express-rate-limit 8.1.0 | high | direct | IPv4-mapped IPv6 omzeilt per-client limiet | login-limiter omzeilbaar bij dual-stack |
| nodemailer 7.0.6 | high | direct | SMTP-commando-injectie via `envelope.size`; verkeerd domein | mailverzending |
| socket.io / engine.io / socket.io-parser / ws | high | transitief | verbindingsuitputting, geheugen-DoS | realtime zonder auth (fase 1a) versterkt dit |
| multer 1.4.5-lts.2 | – (audit meldt niet) | direct | verouderde 1.x-lijn | |
| overige (browserslist, glob, minimatch, picomatch, rollup, postcss, vite, nanoid, lodash, jws, validator, form-data, ip-address, brace-expansion) | high | vooral build-/dev-keten | | lage productierelevantie behalve lodash/form-data/ip-address indien runtime gebruikt |

## Existing failures

Geen. Alle aanwezige checks slagen.

## Environmental issues

- Geen `psql`/`pg_dump` op de dev-machine: backup maken/herstellen kan lokaal niet (productie-image heeft postgresql17-client). Wordt in fase 17 opgelost (installatie toegestaan).
- Tests delen de dev-database met de draaiende dev-server; parallel draaiende testbestanden scopen assertions op eigen id's. Destructieve tests van fase 3+ gaan naar een scratch-database.
- SMTP lokaal niet geconfigureerd; mail wordt in fase 16 met een lokale stub getest.
- `GEMINI_API_KEY` lokaal aanwezig? Niet gecontroleerd; scanfuncties in fase 15 met echte key of gemockt.

## Potential bugs (uit de baseline zelf, niet uit code-lezen)

1. Build laat `schema-columns.json` met LF achter terwijl git CRLF normaliseert: cosmetisch, maar elke `npm run build` toont een "gewijzigd" bestand. Oplossing: `.gitattributes` met `eol=lf` voor dat bestand (technische fix, fase 35).
2. Vite chunk-size-waarschuwing: hoofdbundel groot; performance in fase 19.
3. Testdekking: 0 tests voor reserveringen-conflicten, pickup/return, backups, PDF, mail, transports, voertuig-delete/restore, auth-permissies per rol. Regressietests hiervoor komen mee met de bugfixes in fase 35.

## Wat nog niet is gedaan

Geen fixes, geen dependency-upgrades (tar/drizzle/nodemailer/rate-limit zijn kandidaten voor fase 8/35 na bewijs van bereikbaarheid).
