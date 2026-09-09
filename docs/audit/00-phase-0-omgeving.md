# Audit Car Rental Manager — Fase 0: omgeving en tooling

Datum: 2026-09-09. Commit bij start: 3e28645e (main = feat/customer-portal = productie in Coolify).

## Project

| Onderdeel | Feit |
|---|---|
| Repository | https://github.com/keeslam/LVStest (werkkopie `C:\Users\kees lam\Desktop\LVStest-main\LVStest-main`) |
| Frontend | React 18, wouter, TanStack Query, shadcn/ui + Tailwind, react-i18next (nl/en), Socket.IO-client; klantenportaal onder `/portaal` |
| Backend | Express 4, Passport + express-session (Postgres-store), csurf + eigen portaal-CSRF-token, helmet, express-rate-limit, multer, node-cron, nodemailer, pdf-lib/pdfjs-dist, tesseract.js, Gemini (boetescan) |
| Database | PostgreSQL via Drizzle ORM 0.39; `shared/schema.ts` 47 tabellen; productie-migratie `startup-migration.js` + `schema-columns.json` (additief) |
| Tests | vitest + supertest: 26 bestanden / 125 tests, draaien tegen de gedeelde dev-database. Geen E2E-framework, geen lint-config, geen CI |
| Omvang | 352 HTTP-endpoints (`server/routes.ts` 7758 regels + 22 modules in `server/routes/`), `server/database-storage.ts` 4476 regels |
| Deploy | Docker-image (node 20 alpine + postgresql17-client), Coolify, `node startup-migration.js && npm start`; Coolify-startcommando gaat door bij migratiefouten (niet in repo) |

## Beschikbare tooling

| Categorie | Beschikbaar |
|---|---|
| Plugins/skills | superpowers (brainstorming, plans, subagent-driven development, code review, systematic debugging, TDD), claude-security (scan + patch), coderabbit, code-review, security-review, simplify, caveman (investigate-first, surgical-patch, migration, verify-and-stop), graphify (kennisgraaf in `graphify-out/`), anthropic-skills (pdf, docx, xlsx, pptx), frontend-design |
| Connectors | geen SaaS-connectors; GitHub via `gh` CLI |
| MCP | Claude Browser (in-app browser + dev-server), claude-in-chrome, terminal, context7, visualize, scheduled-tasks, notities/bestanden-MCP, Workflow-tool (alleen op verzoek) |
| Browser/E2E | Claude Browser tegen `http://localhost:5000` (navigate, read_page, find, form_input, screenshots, console/netwerk, mobile/tablet); geen Playwright/Cypress |
| Security | claude-security plugin, security-review skill, coderabbit; in de app helmet, csurf, rate limiter, dompurify; `npm audit` |
| Database | node + pg via `.env` (lokale Postgres `lvstest`), Drizzle, scratch-databases; geen psql/pg_dump op de dev-machine |
| PDF | anthropic-skills:pdf, Read-tool (PDF-pagina's), pdfjs-dist/pdf-lib in de app |
| Performance | Node `--cpu-prof`, browser-netwerktimings, Postgres EXPLAIN via pg, request-ms in de serverlog |

## Initiële risico's

1. `server/routes.ts` monoliet met handmatige autorisatie per endpoint: kans op IDOR/BOLA-gaten.
2. Tests draaien tegen de gedeelde dev-DB; geen E2E, lint of CI: regressies bereiken productie ongemerkt (2026-09-08 gebeurd).
3. Productie-migratie was tot 2026-09-08 incompleet; schema-sync maakt geen FK's/indexes voor nieuw aangemaakte tabellen; startcommando negeert fouten.
4. Backup/restore nooit echt getest; dev-machine mist pg_dump (incident 2026-08-25 als aanleiding).
5. Meerdere schrijfpaden voor reserveringen, placeholders en PDF's.
6. Onderhoudsblokken blokkeren verhuur bewust niet; `PATCH /api/reservations/:id/status` zonder typecontrole.
7. Uploads en externe proxy's (RDW, OCR, Gemini) nog niet getoetst op SSRF/path traversal.
8. Standaard admin-wachtwoord in dev-logs.

## Onbekend bij start

- Uitkomst van de security-scan van 2026-08-27 (niet vastgelegd).
- SMTP lokaal niet geconfigureerd; mailcatcher nodig voor fase 16.
- Werkelijke gebruikersrollen/permissies in productie.
- Welke PDF-generators nog actief gebruikt worden.

## Strategie

1. Fase 1: bestaande kennis + graphify + vier leesonderzoeken (API/auth, documenten/mail/backup/jobs, frontend/rollen, domeinlogica).
2. Fase 2: vitest, tsc, build, npm audit; ontbreken van lint/E2E vastleggen.
3. Fase 3–13: geautomatiseerde API-/fuzz-/race-tests met supertest tegen een scratch-database; browserflows via Claude Browser.
4. Fase 6–8: endpointmatrix uit de routeregistraties + claude-security scan op hotspots.
5. Fase 14–17: PDF's inspecteren met de pdf-skill; SMTP-stub; backup/restore op scratch-DB (pg-client installeren of Docker-image).
6. Fase 18–19: browser desktop/mobiel; timings en EXPLAIN.
7. Fase 20–33: codekwaliteit en werkprocessen; alle voorstellen als OPT-lijst, niets implementeren zonder akkoord.
8. Bugfixes alleen technisch, elk met regressietest; handleiding pas na stabiele staat.

Besluiten van Kees (2026-09-09): scratch-database naast dev toegestaan; Postgres-client mag lokaal geïnstalleerd worden; doorgaan naar fase 1.
