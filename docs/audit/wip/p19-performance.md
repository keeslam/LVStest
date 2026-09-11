# Phase 19 — Performance audit (Car Rental Manager)

Audit server http://localhost:5001, database `lvs_audit`, 2026-09-10 22:49–23:15 CEST. All timings are from the **dev-mode tsx server with the Vite dev server attached — not a production build** — on a host shared with two other concurrent audit activities.

```
PERFORMANCE REPORT
Slow operations: calendar month view (GET /api/reservations/range, 461 rows) p50 1.08 s / p95 1.49 s sequential (1.28 / 3.69 s with statement logging on), 5.8 s p95 under 10 parallel; year range 4.3 s (22.9 s wall for 10 parallel); damage-check PDF 0.58 s CPU per copy (5 in parallel stall every other request for 2.6 s); 10 parallel full reservation lists 2.2 s.
Measured timings: 69 endpoints × 12 sequential + 10-parallel burst (p19-timing.out.json); 62 of 69 have p95 < 120 ms sequential; the slow set is the reservation calendar family, the 8 MB / 17 MB list payloads, and the reports (100–240 ms, one is a 500).
Database problems: no slow SQL — every statement < 10 ms except the 17 MB `select * from interactive_damage_checks` (45–104 ms); the problem is statement COUNT: the range endpoint issues 2 statements per row (924 for 462 rows, 3774 for 1894 rows), GET /api/vehicles issues 5 sync statements incl. up to 3 UPDATEs on every read; anonymous hits create one `session` row each (50/50); 2 unused indexes; interactive_damage_checks 18 MB for 14 rows (base64 images in text columns).
Frontend problems: the reservations page downloads 19.6 MB on first paint (8 MB full list twice because of two different query keys for the same URL), dashboard 13.1 MB, maintenance 10.5 MB, vehicles 8.8 MB, customers 8.1 MB — all uncompressed; one remote reservation mutation refetches ≈19 MB per open reservations tab; no memoised list rows, per-cell `.filter` over all reservations in both calendars.
Backend problems: N+1 in getReservationsInDateRange (+ 4 console.log lines per maintenance block); no compression middleware; full vehicle+customer rows embedded in every reservation (8 MB list, no pagination anywhere); write-on-read status sync in GET /api/vehicles; 17 MB damage-check list served whole and loaded server-side for a mileage report; 1.6 MB PNG re-encoded into every damage-check PDF on the event loop; express.json limit 50 MB → +100 MB RSS per 20 MB body.
Memory problems: no unbounded growth observed — RSS 799 → 751 → 709 → 758 → 758 MB across 500 mixed requests, 20 large lists, 50 PDFs and 20 s idle (V8 GC-driven, dev mode); RSS did rise 641 → 799 MB over the first ~2 700 requests of the session (dev/tsx heap growth, not shown to be a leak). Bounded in-memory stores only (preview tokens with TTL, geocode cache keyed by address, portal last-seen map keyed by user id).
Recommended optimizations: (1) batch-load vehicles/customers/drivers in getReservationsInDateRange (same pattern already used in getAllReservations) — removes ~99% of its statements and the 1.3–4.9 s latency; (2) enable `compression()` (measured gzip: 8 MB list → 288 KB, 27.9×; month range 28×; vehicles 27×) and stop embedding full vehicle/customer rows in list responses (or paginate); (3) one query key for `/api/reservations` on the calendar page and server-side status filters; (4) pre-scale the damage-check header image (1983×793 PNG, 1.6 MB) once at upload or move PDF generation off the event loop; (5) move syncVehicleAvailabilityWithReservations out of GET handlers; (6) project the interactive-damage-check list without the base64 blobs; (7) per-route JSON body limits.
```

## Method & caveats

- Server: `node --import tsx server/index.ts` (PID 11872), `NODE_ENV=development`, Vite middleware attached; **every number here is dev mode** and should be re-measured on the production build before being quoted as an SLA. Postgres 17 local, `lvs_audit` (665 vehicles, 348 customers, 2 125 reservations of which 2 077 live / 305 maintenance blocks / 26 placeholders, 283 documents, 1 999 expenses, 14 interactive damage checks).
- Shared host: another agent ran destructive backup tests on :5002/`lvs_audit_bk` and the lead ran browser tests on :5001 during the run. Bursts were kept ≤ 32 s; the p95 figures include whatever those activities added. Statement counts are the minimum of 3 repetitions (contamination can only add statements); two endpoints whose first counts were contaminated by the lead's calendar loads (`with-reservations`, `filtered`) were re-counted separately.
- Statement counting: `ALTER DATABASE lvs_audit SET log_min_duration_statement = 0` plus `ALTER SYSTEM SET log_line_prefix = '%m [%p] %d %a '` + `pg_reload_conf()` (`log_line_prefix` is not database-settable). Parsed from `data/log/postgresql-2026-09-10_*.log`, counting `statement:` and `execute` lines only (parse/bind lines of the extended protocol are not statements). The log rotates at 10 MB; full statement logging produced **~700 MB of Postgres log (71 files) in ~15 minutes** — the first timing run happened with logging on. The reservation endpoints were therefore re-timed with logging off (table below); other endpoints carry the logged-on numbers, which are pessimistic by a few ms per statement.
- Latency = wall time from request start to full body read by a Node 24 client on the same host; sizes are decoded body bytes (`Content-Encoding` was absent on every response).
- Rate limiter: every session used its own `X-Forwarded-For` (10.19.x.y) because the general 1000/15 min bucket also counts logged-in sessions (BUG-074, re-confirmed: authenticated responses carry `RateLimit-Remaining`, see p19-compress.out.json).
- Side effects left in `lvs_audit` (disposable): ≈79 `Contract (Unsigned) N` documents + 304 KB files each, 24 `transport_report` documents, 18 damage-check PDFs, one 20 MB `AUDIT-P19-large` document, 50 anonymous `session` rows, 6 staff + 1 portal login sessions.
- Scripts: `docs/audit/wip/scripts/p19-lib.cjs` (helpers), `p19-timing.cjs`, `p19-sqlcount.cjs`, `p19-page-replay.cjs`, `p19-memory.cjs`, `p19-pdf.cjs`, `p19-largefile.cjs`, `p19-anon-session.cjs`, `p19-loglines.cjs`, `p19-compress.cjs`; raw numbers in the matching `p19-*.out.json` (`p19-timing.out.json` = logged-on run, `p19-timing-nolog-reservations.out.json` = logging-off re-run).

## Timing table (12 sequential runs, then one 10-parallel burst; ms)

| Endpoint | Status | Rows | Bytes | seq p50 | seq p95 | burst p95 | burst wall |
|---|---|---|---|---|---|---|---|
| GET /health | 200 | – | 310 | 14 | 21 | 192 | 194 |
| GET /api (no auth, no DB) | 200 | – | 102 | 15 | 21 | 61 | 62 |
| GET /api/user | 200 | 1 | 470 | 15 | 24 | 40 | 41 |
| GET /api/reservations | 200 | 2075 | 8 029 598 | 209 | 254 | 2194 | 2201 |
| GET /api/reservations?search=A | 200 | 10 | 42 057 | 44 | 71 | 278 | 279 |
| GET /api/reservations?search=AU | 200 | 10 | 42 012 | 31 | 39 | 167 | 169 |
| GET /api/reservations?search=ZZZZNOMATCH | 200 | 0 | 2 | 30 | 469* | 71 | 72 |
| GET /api/reservations/range 2026-08-31..10-04 (calendar grid) | 200 | 461 | 1 651 568 | **1275** | **3692** | **6893** | 6896 |
| GET /api/reservations/range 2026-01-01..12-31 | 200 | 1894 | 7 380 903 | **4907** | **6851** | **32368** | 32376 |
| GET /api/reservations/upcoming | 200 | 5 | 21 529 | 16 | 43 | 65 | 66 |
| GET /api/reservations/upcoming-maintenance | 200 | 159 | 257 469 | 35 | 306* | 195 | 197 |
| GET /api/reservations/overdue | 200 | 358 | 1 501 628 | 63 | 78 | 473 | 475 |
| GET /api/reservations/3535 | 200 | 1 | 4 213 | 15 | 30 | 59 | 60 |
| GET /api/reservations/vehicle/1870 | 200 | 1 | 4 215 | 15 | 30 | 47 | 49 |
| GET /api/reservations/check-conflicts?… | 200 | 1 | 4 215 | 15 | 25 | 47 | 47 |
| GET /api/placeholder-reservations/needing-assignment?daysAhead=30 | 200 | 8 | 8 951 | 13 | 24 | 55 | 56 |
| GET /api/vehicles | 200 | 665 | 1 157 506 | 57 | 78 | 454 | 456 |
| GET /api/vehicles?search=A | 200 | 10 | 17 483 | 32 | 43 | 228 | 229 |
| GET /api/vehicles?search=AU-13 | 200 | 10 | 17 436 | 28 | 39 | 120 | 121 |
| GET /api/vehicles?search=ZZZZNOMATCH | 200 | 0 | 2 | 31 | 44 | 122 | 123 |
| GET /api/vehicles/available | 200 | 310 | 539 383 | 32 | 41 | 262 | 263 |
| GET /api/vehicles/available?startDate=…&endDate=… | 200 | 591 | 1 028 046 | 53 | 83 | 414 | 417 |
| GET /api/vehicles/apk-expiring | 200 | 96 | 167 060 | 29 | 32 | 110 | 112 |
| GET /api/vehicles/warranty-expiring | 200 | 1 | 1 797 | 18 | 52 | 61 | 62 |
| GET /api/vehicles/service-due | 200 | 1 | 2 031 | 29 | 36 | 192 | 193 |
| GET /api/vehicles/status/breakdown | 200 | – | 78 | 46 | 54 | 228 | 229 |
| GET /api/vehicles/with-reservations | 200 | 90 | 381 532 | 31 | 39 | 191 | 192 |
| GET /api/vehicles/filtered?filterType=apk | 200 | 17 | 73 050 | 32 | 43 | 126 | 127 |
| GET /api/vehicles/1870 | 200 | 1 | 1 721 | 15 | 101* | 44 | 45 |
| GET /api/customers | 200 | 348 | 406 358 | 24 | 32 | 183 | 184 |
| GET /api/customers?search=A | 200 | 10 | 11 379 | 15 | 25 | 40 | 40 |
| GET /api/customers?search=AUDIT | 200 | 10 | 11 726 | 15 | 26 | 39 | 40 |
| GET /api/customers?search=ZZZZNOMATCH | 200 | 0 | 2 | 17 | 24 | 59 | 60 |
| GET /api/customers/with-reservations | 200 | 348 | 416 405 | 83 | 119 | 719 | 720 |
| GET /api/customers/1282 | 200 | 1 | 1 129 | 15 | 27 | 39 | 40 |
| GET /api/drivers | 200 | – | 1 240 | 22 | 33 | 98 | 98 |
| GET /api/documents | 200 | 283 | 125 703 | 15 | 33 | 78 | 78 |
| GET /api/documents/reservation/3535 | 200 | 0 | 2 | 16 | 20 | 38 | 38 |
| GET /api/custom-notifications | 200 | 129 | 45 772 | 15 | 27 | 65 | 66 |
| GET /api/custom-notifications/unread | 200 | 89 | 31 206 | 15 | 29 | 46 | 47 |
| GET /api/transports | 200 | 36 | 180 988 | 18 | 31 | 104 | 105 |
| GET /api/fines | 200 | 11 | 7 467 | 15 | 30 | 37 | 37 |
| GET /api/fines/count?customerId=1282 | 200 | – | 11 | 14 | 23 | 34 | 35 |
| GET /api/expenses | 200 | 1999 | 4 252 990 | 97 | 111 | 942 | 945 |
| GET /api/expenses/recent?limit=10 | 200 | 10 | 19 885 | 15 | 28 | 45 | 46 |
| GET /api/interactive-damage-checks | 200 | 14 | **17 043 541** | 266 | 299 | 2539 | 2550 |
| GET /api/reports/maintenance-costs | **500** | – | 54 | 101 | 126 | 637 | 638 |
| GET /api/reports/vehicle-financials?from=2026-01-01&to=2026-09-10 | 200 | – | 153 863 | 128 | 236 | 1354 | 1355 |
| GET /api/reports/mileage-per-month?from=…&to=… | 200 | – | 113 443 | 135 | 172 | 1342 | 1342 |
| GET /api/reports/saved | 200 | 0 | 2 | 15 | 26 | 34 | 34 |
| GET /api/portal-admin/unread-count | 200 | – | 28 | 15 | 28 | 69 | 69 |
| GET /api/portal-admin/dashboard | 200 | – | 19 646 | 28 | 34 | 89 | 90 |
| GET /api/portal-admin/customers-overview | 200 | 4 | 1 199 | 14 | 26 | 38 | 38 |
| GET /api/portal-admin/vehicles-online | 200 | 665 | 160 112 | 28 | 37 | 196 | 196 |
| GET /api/portal-requests | 200 | 31 | 17 377 | 14 | 26 | 52 | 52 |
| GET /api/app-settings/key/calendar_settings | 200 | – | 0 | 16 | 22 | 33 | 34 |
| GET /api/system-settings | 200 | – | 553 | 16 | 22 | 24 | 25 |
| GET /api/audit-logs | 200 | – | 20 713 | 15 | 30 | 55 | 56 |
| GET /api/pdf-templates | 200 | 10 | 10 288 | 15 | 23 | 48 | 49 |
| GET /api/damage-check-templates | 200 | 3 | 28 577 | 16 | 23 | 41 | 41 |
| portal GET /api/portal/reservations | 200 | 23 | 9 012 | 17 | 35 | 69 | 69 |
| portal GET /api/portal/documents | 200 | 7 | 1 395 | 16 | 34 | 66 | 66 |
| portal GET /api/portal/notifications | 200 | 43 | 11 447 | 15 | 19 | 43 | 44 |
| portal GET /api/portal/notifications/unread-count | 200 | – | 12 | 16 | 22 | 30 | 30 |
| portal GET /api/portal/fines | 200 | 4 | 1 372 | 14 | 26 | 27 | 28 |
| portal GET /api/portal/requests | 200 | 30 | 15 569 | 15 | 27 | 49 | 50 |
| portal GET /api/portal/vehicles/mine | 200 | 10 | 3 864 | 35 | 56 | 236 | 237 |
| portal GET /api/portal/vehicles | 200 | 1 | 169 | 14 | 26 | 43 | 44 |
| portal GET /api/portal/drivers | 200 | 2 | 497 | 16 | 23 | 59 | 60 |

`*` single outlier in 12 runs (shared host). Compression: **no response carried `Content-Encoding`** (request sent `Accept-Encoding: gzip, deflate, br`); there is no `compression` middleware in `server/index.ts` and no `compression` dependency in `package.json`.

Re-timing of the reservation endpoints with statement logging OFF (same script, filter `reservations`):

| Endpoint | logged p50 / p95 | logging OFF p50 / p95 | OFF burst p95 | OFF burst wall |
|---|---|---|---|---|
| /api/reservations | 209 / 254 | 204 / 247 | 2222 | 2231 |
| /api/reservations?search=A | 44 / 71 | 44 / 57 | 255 | 256 |
| /api/reservations?search=AU | 31 / 39 | 29 / 36 | 129 | 131 |
| /api/reservations?search=ZZZZNOMATCH | 30 / 469 | 19 / 30 | 41 | 42 |
| /api/reservations/range 2026-08-31..10-04 (month grid) | 1275 / 3692 | **1080 / 1485** | **5830** | 5834 |
| /api/reservations/range 2026-01-01..12-31 | 4907 / 6851 | **4255 / 4329** | **22942** | 22950 |
| /api/reservations/upcoming | 16 / 43 | 16 / 32 | 78 | 80 |
| /api/reservations/upcoming-maintenance | 35 / 306 | 30 / 38 | 166 | 166 |
| /api/reservations/overdue | 63 / 78 | 61 / 83 | 474 | 476 |
| /api/reservations/3535 | 15 / 30 | 13 / 29 | 55 | 55 |
| /api/reservations/vehicle/1870 | 15 / 30 | 14 / 26 | 43 | 44 |
| /api/reservations/check-conflicts?… | 15 / 25 | 16 / 25 | 45 | 46 |
| /api/placeholder-reservations/needing-assignment?daysAhead=30 | 13 / 24 | 16 / 22 | 46 | 47 |
| /api/vehicles/with-reservations | 31 / 39 | 30 / 36 | 189 | 190 |
| /api/customers/with-reservations | 83 / 119 | 83 / 132 | 737 | 738 |
| /api/portal/reservations | 17 / 35 | 15 / 39 | 64 | 65 |

Statement logging cost the range endpoint ~15 % (one log write per statement × 924 statements); the p95 outliers of the logged run (3.7 s) were shared-host noise. The logging-off numbers are the ones cited in the findings.

## SQL statement counts per endpoint (N+1 table)

Baseline per request: **3 statements for any authenticated request** (`SELECT sess FROM session`, `select … from users` for passport deserialisation, `UPDATE session SET expire` because `rolling: true`, `server/auth.ts:107-114`) and 2 for an anonymous request (the CSRF middleware creates a session for everyone — BUG-096). Routes registered in `server/routes.ts` show the users select **twice** (one extra statement per request vs. `/api/user`).

| Endpoint | Rows | Statements (min of 3) | SQL time (ms) | Slowest statement | N+1? |
|---|---|---|---|---|---|
| GET /api/user | 1 | 3 | 0.1 | 0.06 UPDATE session | – |
| GET /api | – | 2 | 0.1 | – | – |
| GET /api/reservations | 2076 | 7 | 8.2 | 5.5 select reservations | no (batched IN() at `database-storage.ts:1062-1103`) |
| GET /api/reservations?search=A | 10 | 9 | 3.9 | 2.3 | no |
| GET /api/reservations/range 1 week | 235 | **472** | 18.0 | 3.3 | **yes: 2/row** |
| GET /api/reservations/range 5-week grid | 462 | **924** | 31.5 | 3.3 | **yes: 455 vehicle + 341 customer + 115 active-rental + 9 driver selects** |
| GET /api/reservations/range 1 year | 1894 | **3774** | 118.7 | 5.1 | **yes: linear in rows** |
| GET /api/reservations/upcoming | 5 | 5 | 0.4 | 0.2 | no (leftJoin) |
| GET /api/reservations/overdue | 358 | 5 | 4.8 | 4.6 | no (leftJoin) |
| GET /api/reservations/3535 | 1 | 7 | 0.3 | 0.1 | – |
| GET /api/reservations/check-conflicts | 1 | 7 | 0.4 | 0.1 | – |
| GET /api/placeholder-reservations/needing-assignment | 8 | 5 | 0.4 | 0.1 | no |
| GET /api/vehicles | 665 | 10 | 5.4 | 2.3 | no, but **2 SELECT + up to 3 UPDATE (status sync) per read** |
| GET /api/vehicles?search=A | 10 | 10 | 3.2 | 1.6 | same sync |
| GET /api/vehicles/available | 310 | 6 | 2.5 | 1.4 | no (one `id != a AND id != b …` chain of 410 predicates, `database-storage.ts:812-826`) |
| GET /api/vehicles/available?startDate… | 591 | 6 | 3.3 | 2.1 | no |
| GET /api/vehicles/apk-expiring | 96 | 7 | 2.7 | 1.3 | no |
| GET /api/vehicles/service-due | 1 | 6 | 3.1 | 2.7 (all vehicles) | no |
| GET /api/vehicles/status/breakdown | – | 10 | 5.3 | 2.5 | status sync again |
| GET /api/vehicles/with-reservations | 90 | 4 | 2.5 | 2.3 | no |
| GET /api/vehicles/filtered?filterType=maintenance | 70 | 6 | 3.1 | 2.5 | no |
| GET /api/customers | 348 | 5 | 2.7 | 2.5 | no |
| GET /api/customers/with-reservations | 348 | 8 | 9.7 | 5.8 | no, but loads all 2 076 reservations + all vehicles + customers to compute one boolean |
| GET /api/documents | 283 | 5 | 8.5 | 8.2 | no |
| GET /api/transports | 36 | 8 | 5.1 | 4.2 | no (batched) |
| GET /api/expenses | 1999 | 6 | 7.7 | 6.1 | no (batched) |
| GET /api/fines | 11 | 5 | 7.4 | 7.2 | no |
| GET /api/custom-notifications | 129 | 5 | 3.0 | 2.8 | no |
| GET /api/interactive-damage-checks | 14 | 5 | 45.1 | **44.7 select * (17 MB)** | no |
| GET /api/reports/maintenance-costs | 500 | 7 | 5.9 | 2.3 | executes all queries, then throws (BUG-089) |
| GET /api/reports/vehicle-financials | – | 10 | 73.6 | 53.4 | no; loads all vehicles + reservations + expenses |
| GET /api/reports/mileage-per-month | – | 9 | 126.9 | **104.3 select * from interactive_damage_checks** | no; loads 17 MB of base64 to read mileage fields |
| GET /api/portal-admin/unread-count | – | 6 | 0.4 | 0.2 | no |
| GET /api/portal-admin/dashboard | – | 15 | 14.4 | 6.1 | no (Promise.all) |
| GET /api/portal-admin/customers-overview | 4 | 5 | 0.5 | 0.3 | no |
| GET /api/portal-requests | 31 | 7 | 1.0 | 0.5 | no |
| GET /api/audit-logs | – | 6 | 2.0 | 1.1 | no |
| portal /api/portal/reservations | 23 | 6 | 1.5 | 1.2 | no |
| portal /api/portal/documents | 7 | 8 | 1.5 | 1.1 | no |
| portal /api/portal/vehicles/mine | 10 | 13 | 5.3 | 2.6 | no (fixed count) |
| portal /api/portal/vehicles, fines, requests, notifications, unread-count | – | 6–8 | < 1 | – | no |
| GET /health | – | 3 | 0.6 | 0.4 | `getAllUsers()` on every health probe |
| GET /api/contracts/generate/3535 (PDF) | – | 12 | 2.3 | 1.9 | reservation, vehicle ×2, customer ×2, template, documents-by-reservation, insert |
| GET /api/damage-checks/generate/3535 (PDF) | – | 14 | – | – | + app_settings ×2, template, interactive checks |

Other per-row loops found statically (not list endpoints): `POST /api/delivery/transports/generate-report` loads each transport with 4 statements in a `for` loop (`server/routes.ts:7676-7679`, max 50 → 200 statements); `GET /api/vehicles/:vehicleId/customers-with-reservations` calls `getCustomer` and `getVehicle` per reservation (`server/routes.ts:4763-4771`); `POST /api/portal-admin/notifications/mark-read` updates one row per notification (`server/routes/portal-admin.ts:150-153`).

Schedulers (static analysis, not triggered): `scanVehiclesForServiceDue` (`server/utils/service-due-scanner.ts:82-135`) loads settings + all vehicles **twice** (`getServiceDueVehicles` at :37 and again at :101) and then 1–2 statements per due vehicle; `scanVehiclesForApkChanges` (`server/utils/rdw-apk-scanner.ts:27-74`) does one external RDW call + `getPendingApkDateChangeForVehicle` (1 SELECT) per vehicle with a 250 ms delay → ≥ 665 × 0.25 s ≈ 2.8 min nightly, sequential, 665+ statements (N+1 by design against an external API; harmless at this scale); `scanVehicleAlertsForPortal` (`server/services/portal-customer-notifications.ts:79-118`) does a dedupe SELECT per on-road reservation per alert; `BackupScheduler` streams `pg_dump` through gzip (`server/backupService.ts:239-280`) — no in-memory buffering.

## Frontend request analysis

Defaults (`client/src/lib/queryClient.ts:200-212`): `staleTime: 30000`, `gcTime: 300000`, `refetchOnWindowFocus: false`, `refetchOnReconnect: false`, `refetchInterval: false`, `retry: false`; every query also sends `cache: "no-store"` (`:183`) so the browser HTTP cache is bypassed. Invalidations are coalesced in a 50 ms window (`scheduleInvalidation`, `:284-315`) with `refetchType: 'active'`.

Polling (measured intervals from code): sidebar `/api/portal-admin/unread-count` every 5 min (`sidebar-nav.tsx:52`), portal-admin page three queries every 60 s (`pages/portal-admin/index.tsx:32`, `customers-overview-table.tsx:38`, `dashboard-panels.tsx:295`), `portal-alert-chip.tsx:23` 5 min, backup dialog 30 s while open, fine imports 15 s while open, quick-actions 3 s while an RDW scan runs, portal bell 60 s, and `InactivityPrompt` POSTs `/api/session/heartbeat` every 2 min (`InactivityPrompt.tsx:16,102` → 3 SQL statements each).

First-paint request sets, replayed in parallel exactly as the pages' `useQuery` keys fire them (`p19-page-replay.out.json`, shell = `/api/user` + unread-count included):

| Page | Requests | Bytes | Wall | Notes |
|---|---|---|---|---|
| Reservations calendar (`pages/reservations/calendar.tsx:583-711`) | 9 | **19.61 MB** | 1.9 s | `/api/reservations` fetched **twice** (keys `['/api/reservations']` :632 and `['/api/reservations', vehicles.length]` :658 → same URL, separate cache entries), `/range` 1.65 MB, `/overdue` 1.5 MB, `/vehicles` 1.16 MB |
| Dashboard (`pages/dashboard.tsx` widgets) | 17 | 13.06 MB | 1.6 s | `SpareVehicleAssignmentsWidget` pulls `/api/reservations` (8 MB) + customers + vehicles + transports; `ReservationCalendar` pulls `/range` |
| Maintenance calendar (`pages/maintenance/calendar.tsx:357-441`) | 10 | 10.51 MB | 1.6 s | `/api/reservations` (8 MB) used twice with different `select` (same key → one request) |
| Vehicles (`pages/vehicles/index.tsx:97-104`) | 4 | 8.77 MB | 0.25 s | 8 MB reservation list for per-vehicle lookups |
| Customers (`pages/customers/index.tsx:47-57`) | 5 | 8.05 MB | 0.22 s | same |
| Documents | 7 | 1.28 MB | 0.08 s | – |

Socket-driven refetch (`hooks/use-socket.tsx:64-80` → `lib/cache-utils.ts`): the server broadcasts one `data-update` per mutation (31 call sites in `routes.ts`, e.g. `PATCH /api/reservations/:id` → `reservations.updated` at `routes.ts:3750`; `POST /api/reservations` → `reservations.created` + `documents.created`). A `reservations` event invalidates every key starting with `/api/reservations` or `/api/placeholder-reservations` **and any key containing `/<reservationId>` or `/<vehicleId>`** (`cache-utils.ts:23-25`; `includes('/18')` also matches `/api/reservations/vehicle/1870`). On an open reservations tab that means 4 refetches ≈ **19.2 MB** (range 1.65 + list 8.0 ×2 + overdue 1.5) per remote reservation mutation; the 50 ms batching only merges the three layers (mutation onSuccess, dialog handler, socket) into one pass. Dialog fan-out: `reservation-view-dialog.tsx` has 12 `useQuery`s, `reservation-form.tsx` 14.

## Payload table

| Response | Bytes | Composition (from DB row sizes) | Pagination | Unneeded content |
|---|---|---|---|---|
| GET /api/reservations | 8 029 598 (2 075 rows, 3.9 KB/row) | reservation row avg 1 458 B + embedded vehicle 1 869 B + customer 1 235 B | none | full vehicle and customer objects repeated per reservation (665 distinct vehicles, 348 customers); every column incl. notes, addresses, VAT numbers |
| GET /api/reservations/range (month) | 1 651 568 (461 rows) | same + `driver` | none | same |
| GET /api/reservations/overdue | 1 501 628 (358 rows) | same | none | same; dashboard widget shows a count and a few rows |
| GET /api/interactive-damage-checks | 17 043 541 (14 rows) | `diagram_with_annotations` 1.30 MB base64 PNG per row (`interactive_damage_checks` = 18 MB TOAST) | none | only used by the calendar "admin history" dialog (`calendar.tsx:703-706`, `enabled: adminDialogOpen`) |
| GET /api/expenses | 4 252 990 (1 999 rows) | expense + embedded vehicle 1.87 KB | none | vehicle object per expense |
| GET /api/vehicles | 1 157 506 (665 rows) | 1.74 KB/row | none | all 70+ columns |
| GET /api/vehicles/available (dated) | 1 028 046 (591) | full vehicle rows | none | – |
| GET /api/customers | 406 358 (348) | 1.17 KB/row | none | – |
| GET /api/vehicles/with-reservations | 381 532 (90) | vehicle + customer + reservation | none | – |
| GET /api/customers/with-reservations | 416 405 | customers + boolean | none | computed from 8 MB of in-process data |
| GET /api/reservations/upcoming-maintenance | 257 469 (159) | joins | none | – |
| GET /api/transports | 180 988 (36) | vehicle, relatedVehicle, customer, spareReservation(+vehicle) | none | – |
| Contract PDF | 565 025 | 307 KB `uploads/templates/rental_contract_template.pdf` page copied + text | – | – |
| Damage-check PDF | 3 465 695 | 1.6 MB 1983×793 header PNG re-encoded by pdf-lib | – | header at print resolution on every page |

Reservations page first paint: 19.61 MB uncompressed (table above). No list endpoint in the application supports `limit`/`offset`/cursor; the only bounded lists are `upcoming` (LIMIT 5), search (LIMIT 10), `expenses/recent`, activity/audit logs.

## Memory samples (PID 11872, PowerShell `Get-Process`; RSS = WorkingSet64, private = PrivateMemorySize64)

| Point | RSS MB | Private MB | Pool total/idle/waiting |
|---|---|---|---|
| Session start 22:49 (before any P19 load) | 641 | – | – |
| Baseline before memory test (after ≈2 700 P19 requests: timing, sqlcount, pdf) | 799.3 | 1013.5 | 1/1/0 |
| After 500 mixed requests (10 in flight, 20 endpoints, 5 IPs; 500×200, 0 errors, 24.4 s) | 751.0 | 964.6 | 10/10/0 |
| +3 s | 751.0 | 964.6 | 10/10/0 |
| After 20 large-list requests (4× 8 MB, 5× 17 MB, 5× 7.4 MB, 5× 154 KB = 165 MB) | 708.9 | 922.0 | 3/3/0 |
| After 50 contract PDF generations (p50 43 ms, 28 MB of PDF) | 757.7 | 968.7 | 3/3/0 |
| After 20 s idle | 757.7 | 968.7 | 1/1/0 |
| 20 MB upload (multipart, diskStorage) | 765 → 785 (transient, back to 758 after download) | | |
| **20 MB JSON body** to POST /api/vehicles (400 after 216 ms) | **764 → 864 (+100 MB), still 864 after 5 s** | | |

Conclusion: no monotonic growth under list/PDF load (GC reclaims between phases); the 158 MB rise from session start to baseline happened while the process served ~2 700 requests and the tsx/Vite dev heap warmed up — not evidence of a leak, not evidence against one either (dev mode, 25 min window). Pool `waiting` stayed 0 with 10 in flight; `max: 10`, `min: 0`, `idleTimeoutMillis: 20000` (`server/db.ts:43-51`) means clients are dropped after 20 s idle and re-created (the pool went 10 → 3 → 1 within seconds of load ending; each reconnect logs `✅ New database client connected`).

In-memory stores checked statically: `previewTokenService` Map holds a full PDF buffer (≈565 KB) per preview token for 30 min with a 5-min sweeper (`server/preview-token-service.ts:17-78`) — bounded by TTL × rate; `geocodeCache` Map keyed by normalised address, never evicted (`server/geocoding.ts:13`) — grows with distinct addresses geocoded (route planning only); portal `lastSeenWrites` Map keyed by portal user id (`server/portal-auth.ts:209`) — bounded by users; `express-rate-limit` default MemoryStore resets per 15-min window; Socket.IO uses no rooms; the request logger adds one `finish` listener per response (released with the response). No per-request `setInterval`/listener accumulation found.

## PDF timings (12 sequential each; `p19-pdf.out.json`)

| Generation | Status | Bytes | p50 | p95 | max | SQL stmts |
|---|---|---|---|---|---|---|
| GET /api/contracts/generate/3535 (default template id 2) | 200 | 565 025 | 42 | 61 | 61 | 12 |
| GET /api/contracts/generate/3535?templateId=2 | 200 | 565 025 | 41 | 49 | 49 | – |
| GET /api/contracts/generate-default/3535 | 200 | 564 995 | 48 | 58 | 58 | – |
| GET /api/damage-checks/generate/3535 (default template id 1, 7 canvas fields, 1 page) | 200 | **3 465 695** | **581** | 634 | 634 | 14 |
| POST /api/delivery/transports/generate-report [71] | 201 | 432 | 27 | 37 | 37 | – |
| POST /api/delivery/transports/generate-report [67,68,69,71] | 201 | 446 | 31 | 48 | 48 | – |

Every contract/damage-check generation also writes the PDF to disk and inserts a `documents` row (side effect of a GET). Event-loop blocking probe (`GET /api`, no DB, polled every 50 ms from a separate IP):

| Phase | Probe n | probe p50 | probe p95 | **probe max** | Work wall |
|---|---|---|---|---|---|
| Idle | 40 | 18.9 | 20.8 | 21.4 | – |
| 5 contract PDFs in parallel | 79 | 19.0 | 20.5 | 60.9 | 171 ms (each 100–169) |
| **5 damage-check PDFs in parallel** | 45 | 18.7 | 21.9 | **2598** | 2803 ms (each 1678–2794) |
| 5 × GET /api/reservations in parallel (JSON of 8 MB ×5) | 67 | 19.1 | 21.1 | **622** | 1065 ms (each 388–1058) |

The damage-check generator embeds the uploaded header PNG (`uploads/damage-check/header-1787427063629.png`, 1 611 901 B, 1983×793) via `pdfDoc.embedPng` on every generation (`server/pdf-damage-check-generator.ts:376-405`) — pdf-lib decodes and re-deflates the image synchronously on the event loop (~0.5 s CPU) and the result is 3.4 MB per PDF. BUG-168 (phase 14: pathological `page` value → 40 000 pages, 76 s stall) is the extreme of the same synchronous generator; the **normal** case measured here already stalls all other requests for 2.6 s when five staff print a damage check at once.

## Large-file results (`p19-largefile.out.json`)

| Test | Result |
|---|---|
| Upload 20 MB PDF-shaped file to POST /api/documents | 201 in **126 ms**; RSS +20 MB transient; multer `diskStorage` (`server/routes.ts:4874-4937`), post-upload `validateAfterUpload` reads magic bytes only; file lands under `audit-uploads/…` |
| Download it (GET /api/documents/download/553) | 200, TTFB 23 ms, total 188 ms for 20 971 520 bytes, `res.sendFile` (streamed, `Accept-Ranges` served by send); RSS unchanged (785 → 758) |
| Upload 50 MB | rejected after **178 ms** with **HTTP 500** `MulterError: File too large` + stack with absolute paths (limit 25 MB, `routes.ts:4934`): the stream is aborted early (no 50 MB buffering, RSS +6 MB) but the status/body is wrong — **BUG-030 re-confirmed** (phase 15 saw the same with 60 MB) |
| 20 MB JSON body (`express.json({ limit: '50mb' })`, `server/index.ts:163`) to POST /api/vehicles | 400 (Zod) after 216 ms; the body is fully buffered, parsed and walked by `sanitizeInput` before validation; **RSS +100 MB**, not released after 5 s |

Other multer configs: `memoryStorage()` is used only for damage-check template backgrounds (`server/routes/damage-check-templates.ts:323-324`); all other uploads are `diskStorage`. Downloads use `res.sendFile` (staff) and `fs.createReadStream().pipe(res)` (portal, `server/routes/portal.ts:203`).

## Logging volume

- Request logger (`server/index.ts:249-266`): one line per `/api` request, JSON body appended and **truncated to 200 characters** — measured 203 bytes/line for the reservations list (`p19-loglines.out.json`): at 5 000 requests/day ≈ **0.97 MB/day**. The volume aspect of BUG-079 is therefore small; its problem remains that small secret-bearing responses fit entirely in 200 characters.
- `getReservationsInDateRange` logs 4 lines per maintenance block without a customer (`database-storage.ts:1313-1335`), including `console.log('📋 Found active rental:', activeRental)` which `util.inspect`s a full row (1 485 bytes) when one exists: the September grid has 114 such blocks → **17.6 KB of console output per calendar load** (all blocks currently resolve to `undefined`; with open-ended rentals present it would be ≈190 KB/load). Every dashboard, reservations and maintenance page load triggers it.
- `console.log` density in hot paths: `server/routes.ts` 109, `server/database-storage.ts` 43, `server/utils/pdf-generator.ts` 35 (34 inside `generateRentalContractFromTemplate`, i.e. per contract), `realtime-events.ts` 1 per broadcast, `db.ts` 1 per pool connect (churns every 20 s idle → connect cycle).
- Postgres side (environment note for the lead): the statement logging needed for this phase wrote ≈700 MB to `C:\Program Files\PostgreSQL\17\data\log` (71 × 10 MB files dated 2026-09-10_22xxxx/23xxxx) in ~15 minutes — that is the app's statement volume (≈1 000–4 000 statements per calendar load) rendered as log lines with full column lists. The files were left in place; they are safe to delete.

## Database (indexes / EXPLAIN / sizes)

- Database size 34 MB; largest relations: `interactive_damage_checks` 18 MB (1 live row per `pg_stat`, 16 dead, never autovacuumed — the base64 columns are TOASTed), `audit_logs` 1.1 MB, `reservations` 952 kB, `expenses` 488 kB, `vehicles` 344 kB, `login_attempts` 296 kB (1 541 rows), `session` 248 kB (27 live / 39 dead = 59 % dead), `active_sessions` 136 kB (213 rows, never cleaned — BUG-095).
- `EXPLAIN (ANALYZE, BUFFERS)` of the heaviest SQL: calendar range select → Seq Scan on reservations, 47 buffers, **2.4 ms** (461 rows); full live list → 0.7 ms; status-sync select → 1.7 ms; vehicles search `UPPER(replace(license_plate,'-','')) LIKE '%AU13%' OR …` → Seq Scan 0.2 ms (function-wrapped LIKE with leading `%` cannot use an index; irrelevant at 665 rows); customers search → 0.1 ms; documents ↔ vehicles left join → Hash Join 1.0 ms. Planning time (3–9 ms) exceeds execution time everywhere: **Postgres is not the bottleneck at this data volume**; per-statement round-trip and JSON work in Node are.
- Indexes present on reservations: pkey, `vehicle_id`, `customer_id`, `start_date`, `end_date`, `status`, `status_start_date`, `deleted_at`, `contract_number` unique — adequate. Unused (0 scans): `expenses_date_idx`, `vehicle_transports_status_idx`. Missing but not needed at this size: none observed (all filtered scans are sub-3 ms).
- `pg_stat_database`: 0 temp files, 0 deadlocks, 268 rollbacks / 298 352 commits. No long transactions (all app backends `idle`, none `idle in transaction`). Seq-scan counters: `session` 8 045 (connect-pg-simple pruning), `vehicles` 5 445 / 3.2 M tuples, `reservations` 3 216 / 6.4 M tuples read.
- Anonymous requests: **50 cookie-less requests → 50 new `session` rows** (`p19-anon-session.out.json`; 24 of them 401s) — BUG-096 quantified; the table is only pruned by connect-pg-simple's interval sweep.
- Pool (`server/db.ts:43-51`): `max 10`, `min 0`, idle 20 s, `query_timeout 30 s`; under 10 concurrent requests `total=10 idle=10 waiting=0` right after the burst; no saturation seen. `/health` reports these numbers but also runs `getAllUsers()` per probe.

## Tested (no issue)

- All customer, document, transport, fines, notification, settings, template, portal (9 endpoints) and portal-admin list endpoints: p95 ≤ 60 ms sequential, ≤ 240 ms with 10 parallel, 4–15 statements, no per-row queries (`attachTransportRelations`, `getAllExpenses`, `getAllReservations`, `getUpcoming*`, `getAllOverdueReservations` all batch or join).
- Search endpoints (vehicles/customers/reservations, 1-char / common / no-match): 15–44 ms p50, LIMIT 10, statement count independent of result size; reservation search runs 3 sub-searches (vehicles, customers, reservations) = 9 statements.
- 20 MB upload/download path: streamed on both sides, no RSS growth.
- Contract and transport-report PDFs: 27–48 ms p50, no measurable event-loop impact with 5 in parallel (probe max 61 ms).
- Memory under 500 mixed requests, 20 large lists, 50 PDFs: no growth beyond GC noise.
- Pool: no waiting clients at 10 concurrent.

## Not measured (why)

- Browser render timings / React re-render counts: no browser in this agent; render analysis is static (see PF19-011 and the Frontend section) and labelled as unmeasured.
- Production build (`npm run build` + `NODE_ENV=production`): out of scope for the audit server; dev-mode numbers are pessimistic (tsx, Vite middleware, no `express.static` caching).
- RDW APK scan (`POST /api/apk-date-changes/scan-now`): hits the public RDW API for all 665 vehicles — analysed statically only.
- Backup run: another agent was running destructive backup tests concurrently; analysed statically (streamed `pg_dump | gzip`).
- Server console volume: the process's stdout belongs to the lead's terminal; log sizes are computed from the exact format strings against real rows, not captured.
- Socket.IO fan-out under many connected clients: one client at a time here; broadcast cost is `io.emit` of the entity to every socket (BUG-005 covers the exposure aspect).

## Findings summary

| ID | Sev | One line |
|---|---|---|
| PF19-001 | HIGH | Calendar `range` endpoint is N+1 (2 statements/row + per-row logging): 1.3 s p50 / 3.7 s p95 for a month, 4.9 s for a year, 6.9 s p95 under 10 parallel |
| PF19-002 | HIGH | Reservations page downloads 19.6 MB on first paint, 16 MB of it the same `/api/reservations` list twice (two query keys for one URL); every socket reservation event refetches ≈19 MB per open tab |
| PF19-003 | HIGH | `GET /api/reservations` (and `/overdue`, `/range`, `/expenses`) embed the full vehicle + customer row in every item and have no pagination: 8 MB per list, used by 6 pages for lookups only |
| PF19-004 | MEDIUM | No HTTP compression: 8 MB / 4.25 MB / 1.65 MB JSON responses leave the server uncompressed although gzip shrinks them 24–28× (8 MB → 288 KB measured) |
| PF19-005 | MEDIUM | Damage-check PDF re-encodes a 1.6 MB 1983×793 header PNG per generation: 581 ms CPU, 3.5 MB PDF, 2.6 s event-loop stall with 5 concurrent (normal-case sibling of BUG-168) |
| PF19-006 | MEDIUM | `GET /api/interactive-damage-checks` returns 17 MB (base64 diagrams) and the mileage report loads the same 17 MB server-side per request |
| PF19-007 | MEDIUM | `GET /api/vehicles` and `/status/breakdown` run the status-sync (2 SELECT + up to 3 UPDATE) on every read — writes and row locks on the most-fetched list |
| PF19-008 | MEDIUM | `express.json({ limit: '50mb' })` globally: one 20 MB JSON body costs +100 MB RSS and is parsed and sanitised before any validation |
| PF19-009 | LOW | `customers/with-reservations` and `find-by-contract` materialise all 2 076 reservations (+vehicles +customers) to compute a boolean / find one row |
| PF19-010 | LOW | Per-row `console.log` in the calendar query (17.6 KB per load, full-row `util.inspect`) and 34 `console.log` per contract PDF |
| PF19-011 | LOW | Unmemoised calendar rendering: per-cell `.filter` over the whole reservation set in both calendars, inline context value, no `memo` anywhere (0 usages) — static, unmeasured |
| PF19-012 | LOW | Socket invalidation matcher `key.includes('/'+id)` over-invalidates unrelated queries |
| PF19-013 | LOW | Nightly service-due scan loads settings + all vehicles twice; RDW scan is 665 sequential external calls + 665 SELECTs (≥ 2.8 min) |

Severity counts: HIGH 3, MEDIUM 5, LOW 5.

## BUGs

```
BUG PF19-001
Severity: HIGH
Feature: Reservations calendar / maintenance calendar / dashboard calendar (GET /api/reservations/range)
Status: OPEN
Reproduction: node docs/audit/wip/scripts/p19-sqlcount.cjs range  → 1 week: 235 rows / 472 statements; 5-week grid (2026-08-31..10-04): 462 rows / 924 statements (455 vehicle selects, 341 customer selects, 115 "active rental" selects, 9 driver selects); 1 year: 1 894 rows / 3 774 statements. node p19-timing.cjs range → month p50 1 275 ms, p95 3 692 ms (statement logging on) / p50 1 080 ms, p95 1 485 ms (logging off); year p50 4 907 / 4 255 ms; 10 parallel month loads: p95 6 893 ms (logged) / 5 830 ms (off); 10 parallel year loads: 32.4 s / 22.9 s. Total Postgres time for the month load is 31.5 ms — the rest is 924 sequential round-trips through node-postgres/drizzle.
Expected: a constant number of statements (1 range select + 3 batch loads, or 3 left joins), < 100 ms for a month at this data size; the sibling getAllReservations already does this.
Actual: one SELECT per vehicle, per customer (or per "active rental" lookup for maintenance blocks) and per driver inside a for-loop, plus 4 console.log lines per customer-less maintenance block.
Root cause: server/database-storage.ts:1285-1356 (getReservationsInDateRange: for (const reservation of reservationsData) { await db.select()…vehicles…; await db.select()…customers…; await db.select()…drivers… }).
Affected files: server/database-storage.ts:1285-1356; consumers client/src/pages/reservations/calendar.tsx:607-615, client/src/pages/maintenance/calendar.tsx:378-387, client/src/components/dashboard/reservation-calendar.tsx:137-140.
Affected data: reservations, vehicles, customers, drivers (read only).
Security impact: none directly; a viewer can request a 30-year range and hold a pool client for tens of seconds per request (10 parallel year requests took 32 s) — cheap DoS for any VIEW_RESERVATIONS user.
Business impact: the three most-used screens (dashboard, reservations, maintenance) wait 1.3–3.7 s for their main dataset and degrade to 7 s when a handful of staff open them together; grows linearly with booking history (already 2× the 1.5k reservations the earlier fix comment mentions).
Fix: collect vehicleIds/customerIds/driverIds once and load them with three inArray() selects (exactly like getAllReservations at database-storage.ts:1062-1103), or use the leftJoin form of getUpcomingReservations (:1358-1388); resolve the maintenance-block "active rental customer" with one query (vehicle_id IN (…) AND end_date IS NULL …) and a Map; drop the per-row console.log; consider a maximum range (e.g. 400 days) server-side.
Regression test: with the Postgres statement log (or a pg client spy) assert that GET /api/reservations/range for 1 week and for 1 year execute the same number of statements (≤ 8 incl. session), and that the month grid responds < 200 ms against the audit dataset.
```

```
BUG PF19-002
Severity: HIGH
Feature: Reservations calendar page (client) first paint and live updates
Status: OPEN
Reproduction: node docs/audit/wip/scripts/p19-page-replay.cjs → "reservations 9 requests, 19.61 MB, wall 1907 ms": /api/reservations is requested twice (8 033 805 bytes each) because calendar.tsx uses key ['/api/reservations'] (:631-633) and key ['/api/reservations', vehicles?.length] (:657-675) — React Query treats them as different cache entries and the default queryFn ignores the numeric key part, so the same URL is downloaded twice; the second one re-downloads whenever vehicles.length changes. On a socket reservations event, cache-utils.ts:22-30 invalidates every key starting with /api/reservations → range (1.65 MB) + both full lists (16 MB) + overdue (1.5 MB) ≈ 19.2 MB refetched per event per open tab (sizes from p19-timing.out.json).
Expected: one download of the list per page (or none: completed rentals filtered server-side), and a remote change refetching only the visible range.
Actual: 19.6 MB for the first paint of the busiest page; each reservation change by any colleague re-downloads ~19 MB in every open reservations tab; the vehicles, customers, maintenance and dashboard pages likewise pull the 8 MB list for lookups (8.8 / 8.1 / 10.5 / 13.1 MB first paints).
Root cause: client/src/pages/reservations/calendar.tsx:631-633 and :657-675 (two keys for one URL; the second exists only to re-run `select` when vehicles change, which `select` already does via closure), plus prefix-wide invalidation in client/src/lib/cache-utils.ts:22-30 and no server-side filters (see PF19-003).
Affected files: client/src/pages/reservations/calendar.tsx:583-711; client/src/lib/cache-utils.ts:22-30; client/src/components/dashboard/spare-vehicle-assignments-widget.tsx:77-96; client/src/pages/vehicles/index.tsx:102-104; client/src/pages/customers/index.tsx:51-53; client/src/pages/maintenance/calendar.tsx:389-427.
Affected data: none (read only).
Security impact: none.
Business impact: 20 MB per page open and per remote edit on a 4G office connection is 10–40 s of transfer; the dev server serves it in 1.9 s only because the client is on the same host.
Fix: use a single key ['/api/reservations'] with `select` for completedRentals (vehicles are available in the closure); add `?status=completed,returned` / `?type=maintenance_block` / `?fields=` server-side filters and use them; make socket invalidation for reservations target the range/overdue keys and the affected id only.
Regression test: a Vitest/RTL test mounting the calendar with a mocked fetch asserting exactly one GET /api/reservations; a Playwright check that the reservations route triggers < 5 MB of XHR on first paint.
```

```
BUG PF19-003
Severity: HIGH
Feature: List endpoints GET /api/reservations, /api/reservations/range, /api/reservations/overdue, /api/expenses (payload shape, pagination)
Status: OPEN
Reproduction: node docs/audit/wip/scripts/p19-timing.cjs → GET /api/reservations 2 075 rows = 8 029 598 bytes (3.87 KB per reservation), p50 209 ms / p95 254 ms sequential, 10 parallel = 2.2 s wall and a 622 ms event-loop stall measured with 5 parallel (p19-pdf.out.json blocking.lists5); /api/expenses 1 999 rows = 4.25 MB; /overdue 358 rows = 1.5 MB. DB row sizes (row_to_json): reservation 1 458 B, vehicle 1 869 B, customer 1 235 B — the embedded vehicle+customer are 80 % of every item and are repeated 2 075 times for 665 distinct vehicles and 348 customers, which the same pages already fetch separately (/api/vehicles, /api/customers).
Expected: a list item carries ids plus the handful of display fields the client uses (plate, brand, model, customer name), or the endpoint is paginated / filterable; the 8 MB list should not be the default way to look up one vehicle's history.
Actual: `{...reservation, vehicle: fullVehicleRow, customer: fullCustomerRow}` for every row, no limit/offset/cursor on any list endpoint in the application, `Cache-Control: no-store` so nothing is ever cached.
Root cause: server/database-storage.ts:1093-1103 (getAllReservations return shape), :1300-1352 (range), :1462-1492 (overdue), :1794-1815 (expenses); routes at server/routes.ts:2299-2313 accept only `search`.
Affected files: server/database-storage.ts (above), server/routes.ts:2299-2313, 2139-2170, 2203-2216; client consumers listed in PF19-002.
Affected data: none.
Security impact: full customer records (addresses, VAT/KvK numbers, notes, driver-licence numbers) travel to every screen that only needs a name — widens the blast radius of any XSS or a shoulder-surfed devtools tab; a viewer can pull the whole customer base by opening the calendar.
Business impact: every page that uses the list pays 8 MB + ~250 ms server time (JSON.stringify of 8 MB blocks the loop for ~100–600 ms depending on concurrency); grows with history.
Fix: project only needed columns (drizzle `select({...})` with explicit vehicle/customer sub-objects); add `?status=`, `?type=`, `?from=&to=`, `?limit=&cursor=` to GET /api/reservations and /expenses; return `vehicleId`/`customerId` and let the client join against its cached /api/vehicles and /api/customers; consider ETag/If-None-Match instead of `no-store`.
Regression test: assert the JSON size of GET /api/reservations against the audit dataset < 1 MB (or that each item has no `customer.notes`/`customer.driverLicenseNumber` etc.), and that `?limit=50` returns 50 rows.
```

```
BUG PF19-004
Severity: MEDIUM
Feature: HTTP layer — response compression
Status: OPEN
Reproduction: curl -sD - -o /dev/null -H "Accept-Encoding: gzip, deflate, br" http://localhost:5001/api/reservations (with cookie) → no Content-Encoding header; all 69 endpoints in p19-timing.out.json report contentEncoding: null. node docs/audit/wip/scripts/p19-compress.cjs (gzip level 6 of the actual bodies) → /api/reservations 8 033 805 → 287 891 bytes (**27.9×**); /api/reservations/range month 1 655 775 → 58 754 (28.2×); /api/vehicles 1 157 506 → 42 746 (27.1×); /api/expenses 4 252 990 → 177 998 (23.9×); /api/interactive-damage-checks 17 043 541 → 12 719 679 (1.3× — base64 PNGs, see PF19-006). Every one of these responses also carried `RateLimit-Limit: 1000` / `RateLimit-Remaining` although the session was authenticated (BUG-074).
Expected: JSON responses > ~1 KB compressed with gzip/br (Express `compression()` or the reverse proxy); repeated vehicle/customer objects compress extremely well.
Actual: 8 MB, 17 MB, 4.25 MB, 1.65 MB, 1.5 MB, 1.16 MB bodies are sent as-is. grep compression package.json server/ → no dependency, no middleware (server/index.ts).
Root cause: server/index.ts:158-166 (middleware stack has helmet, rate limit, json, sanitiser — no compression); production deploy (Coolify/Traefik) is not known to compress either (not verified here).
Affected files: server/index.ts; package.json.
Affected data: none.
Security impact: none (BREACH is not applicable to these JSON bodies without reflected secrets; the CSRF token is in a cookie, not the body).
Business impact: the 19.6 MB reservations first paint would be ~2 MB; all list pages ~5–10× faster on office/4G links.
Fix: `app.use(compression({ threshold: 1024 }))` before the JSON routes (or enable gzip/br in Traefik); keep PDF/file downloads excluded (already binary).
Regression test: supertest GET /api/reservations with Accept-Encoding: gzip → expect header content-encoding gzip and body < 20 % of the identity size.
```

```
BUG PF19-005
Severity: MEDIUM
Feature: Damage-check PDF generation (GET /api/damage-checks/generate/:id, interactive damage-check PDF)
Status: OPEN
Reproduction: node docs/audit/wip/scripts/p19-pdf.cjs → damage check p50 581 ms / p95 634 ms, 3 465 695 bytes per PDF (contract: 42 ms / 565 KB). Blocking probe: while 5 damage-check PDFs generate in parallel (wall 2.8 s) the trivial GET /api (no DB) goes from p95 21 ms to max 2 598 ms — every other request on the server waits. The embedded header is uploads/damage-check/header-1787427063629.png = 1 611 901 bytes, 1983×793 px (app_settings damage_check_fields.headerImagePath).
Expected: a damage check PDF of a few hundred KB, generated in < 100 ms, or generated off the main thread.
Actual: pdf-lib `embedPng` decodes and re-deflates the 1.6 MB PNG synchronously on every generation (pdf-lib has no cache across documents), producing a 3.4 MB file and ~0.5 s of CPU on the event loop; the file is then also written to disk and registered as a document on every GET.
Root cause: server/pdf-damage-check-generator.ts:376-405 (header load + embedPng per generation, drawn on every page); no size/resolution normalisation at upload in server/routes/app-settings.ts:62-135 (damage-check header upload).
Affected files: server/pdf-damage-check-generator.ts:376-421; server/routes/app-settings.ts:62-135; server/routes.ts:6117-6335 (route).
Affected data: documents table + uploads (one 3.4 MB file per print).
Security impact: any MANAGE_DAMAGE_CHECKS user can stall the whole server by requesting a handful of damage checks concurrently (2.6 s per 5); BUG-168 shows the unbounded form (76 s) via a template value.
Business impact: printing damage checks at the counter freezes the app for everyone for seconds; each print stores 3.4 MB (≈1.2 GB per 350 prints).
Fix: normalise the header at upload time (resize to ≤ 1200 px wide, JPEG q80 → ~100 KB) or convert once and cache the bytes; generate PDFs in a worker_thread / job queue with a concurrency limit; don't persist a document on every GET (or reuse the last unsigned version).
Regression test: assert the generated damage-check PDF for reservation 3535 is < 500 KB and that GET /api generation with 5 concurrent damage checks keeps a probe request under 100 ms.
```

```
BUG PF19-006
Severity: MEDIUM
Feature: Interactive damage checks list (GET /api/interactive-damage-checks) and mileage report (GET /api/reports/mileage-per-month)
Status: OPEN
Reproduction: p19-timing: GET /api/interactive-damage-checks → 14 rows, 17 043 541 bytes, p50 266 ms, 10 parallel 2.5 s wall. p19-sqlcount: /api/reports/mileage-per-month executes `select * from interactive_damage_checks` = 104 ms (the slowest statement in the whole audit) and streams 17 MB of base64 through Node to read `startMileage`/`checkDate`. psql: 13 of 14 rows carry a 1.30 MB `diagram_with_annotations` base64 PNG; table = 18 MB for 14 rows (pg_total_relation_size).
Expected: list/report queries project scalar columns only; images stored as files (like every other upload) or fetched by id on demand.
Actual: `db.select().from(interactiveDamageChecks)` returns every column including the base64 blobs (database-storage.ts:4341-4343); the calendar's admin dialog (calendar.tsx:703-706) and the report (server/routes/reports.ts:287-302, utils/financial-reports) both consume it whole.
Root cause: server/database-storage.ts:4341-4343; server/routes/reports.ts:293-296; schema stores images in text columns (shared/schema.ts interactive_damage_checks.diagram_with_annotations / renter_signature / customer_signature).
Affected files: server/database-storage.ts:4341-4343, server/routes/reports.ts:287-302, client/src/pages/reservations/calendar.tsx:703-706.
Affected data: interactive_damage_checks (18 MB, 16 dead tuples never vacuumed).
Security impact: none new.
Business impact: 1.2 MB per damage check of DB growth and a report that gets slower with every check made (14 checks = 104 ms; 1 000 checks ≈ 1.2 GB scanned per report run).
Fix: a projection without the blob columns for lists/reports; move diagrams/signatures to files under uploads (path in the row) or at least a dedicated `interactive_damage_check_images` table joined only by the PDF/detail routes; VACUUM (the 16 dead 1.3 MB rows).
Regression test: assert GET /api/interactive-damage-checks response items have no `diagramWithAnnotations` field and the response < 100 KB for the audit dataset.
```

```
BUG PF19-007
Severity: MEDIUM
Feature: Vehicle list (GET /api/vehicles, GET /api/vehicles/status/breakdown) — write-on-read status sync
Status: OPEN
Reproduction: p19-sqlcount: GET /api/vehicles = 10 statements: 2 `select vehicle_id from reservations …`, `update vehicles set availability_status='rented' where id in (410 ids) and status in ('available','scheduled')`, `update … 'scheduled' where id in (…)`, `update … 'available' where status in ('rented','scheduled') and id not in (…)`, then the list select. Same 5 statements on /status/breakdown. p19-timing: /api/vehicles p50 57 ms alone, p95 454 ms with 10 parallel (the three UPDATEs serialise on row locks); the endpoint is requested by 7 pages and 4 dialogs (25 useQuery call sites).
Expected: reading the vehicle list performs no writes; status transitions happen when reservations change or in a scheduled job.
Actual: `await storage.syncVehicleAvailabilityWithReservations()` in the GET handler (server/routes.ts:466, :429) issues up to 3 UPDATE statements touching hundreds of rows on every list read, from every open tab, including the 30-s stale refetches.
Root cause: server/routes.ts:463-467 and :426-430; server/database-storage.ts:224-353.
Affected files: server/routes.ts:426-475, server/database-storage.ts:224-353.
Affected data: vehicles.availability_status (rewritten on read; 704 tuple updates on vehicles in pg_stat since stats reset, most from this path), vehicles has 38 dead tuples.
Security impact: a VIEW_VEHICLES-only user triggers writes; concurrent reads race the same rows (phase 13 covered transactional aspects).
Business impact: unnecessary lock contention and WAL on the hottest read path; p95 ×8 under modest concurrency.
Fix: call the sync from the reservation mutation paths (already done at database-storage.ts:1788, 2224, 3317) and from the nightly scheduler; drop it from GET handlers, or make it a cheap no-op check (compare computed vs stored in SQL and update only diffs).
Regression test: statement-log assertion that GET /api/vehicles executes no UPDATE.
```

```
BUG PF19-008
Severity: MEDIUM
Feature: Request body limits (express.json / urlencoded 50 MB on every route)
Status: OPEN
Reproduction: node docs/audit/wip/scripts/p19-largefile.cjs → POST /api/vehicles with a 20 MB JSON body: HTTP 400 (Zod) after 216 ms; server RSS 763.6 → 863.7 MB (+100 MB) and still 863.7 MB 5 s later. The body is fully buffered by body-parser, JSON.parsed, then recursively walked by sanitizeInput (server/middleware/security/sanitization.ts:18-41) before any route validation runs.
Expected: a per-route limit sized to the route (a vehicle is < 10 KB; only damage-check diagram routes need MBs), so a mistaken or hostile client cannot hold 50 MB × N in memory.
Actual: `app.use(express.json({ limit: '50mb' }))` and urlencoded 50 MB globally (server/index.ts:163-164) — 10 concurrent 50 MB bodies from any logged-in user (or 1 000 anonymous ones within the rate-limit window to routes that parse before auth) can push the process past 1 GB extra.
Root cause: server/index.ts:163-164.
Affected files: server/index.ts:163-164; server/middleware/security/sanitization.ts:18-41.
Affected data: none.
Security impact: memory-exhaustion DoS by an authenticated user (or anonymous, since body parsing precedes the session/auth middleware in index.ts).
Business impact: an accidental oversized paste in a notes field can knock the container over.
Fix: default `express.json({ limit: '1mb' })`; mount `express.json({ limit: '50mb' })` only on the interactive damage-check routes (POST/PUT /api/interactive-damage-checks) — and move those images to multipart uploads (PF19-006).
Regression test: POST /api/vehicles with a 2 MB body → 413.
```

```
BUG PF19-009
Severity: LOW
Feature: GET /api/customers/with-reservations, GET /api/reservations/find-by-contract/:contractNumber
Status: OPEN
Reproduction: p19-sqlcount: customers/with-reservations = 8 statements incl. the full reservations select (5.8 ms) + vehicles + customers batch loads (≈8 MB materialised in Node) to compute `hasActiveReservation`; p19-timing p50 83 ms, 10 parallel p95 719 ms. find-by-contract (server/routes.ts:2315-2331) calls getAllReservations() and `.find()` in JS although reservations.contract_number has a unique index.
Expected: `EXISTS (select 1 from reservations where customer_id = c.id and start_date <= today and end_date >= today)` / `WHERE contract_number = $1`.
Actual: whole-table materialisation per request.
Root cause: server/routes.ts:1986-2024 and :2315-2331.
Affected files: server/routes.ts:1986-2024, :2315-2331.
Affected data: none.
Security impact: none.
Business impact: minor today (83 ms); scales with history.
Fix: SQL EXISTS / indexed lookup.
Regression test: statement-count assertion (≤ 5) and that find-by-contract executes a query containing `contract_number = $1`.
```

```
BUG PF19-010
Severity: LOW
Feature: Server logging in hot paths
Status: OPEN
Reproduction: node docs/audit/wip/scripts/p19-loglines.cjs → the September calendar grid contains 114 customer-less maintenance blocks; getReservationsInDateRange logs 4 lines per block (17 566 bytes per calendar load, 1 485 bytes extra per block when an active rental row is inspected). generateRentalContractFromTemplate contains 34 console.log calls (server/utils/pdf-generator.ts:55-541); server/routes.ts 109, server/database-storage.ts 43. Request logger: 203 bytes per request (≈1 MB/day at 5 000 req/day — the volume side of BUG-079 is small).
Expected: no per-row logging on read paths; debug logging behind a flag.
Actual: debug-style console.log with util.inspect of rows on the most-hit query; console.log is synchronous to a TTY/pipe and runs inside the request.
Root cause: server/database-storage.ts:1313-1335; server/utils/pdf-generator.ts:67-192 etc.
Affected files: server/database-storage.ts:1313-1335, server/utils/pdf-generator.ts, server/routes.ts (contract route :5479-5610 logs ~14 lines per contract).
Affected data: container logs.
Security impact: see BUG-079 (response bodies) — this finding is volume/CPU only.
Business impact: minor CPU and log noise; makes forensic grep of the container log harder.
Fix: remove the per-row logs (or use a `debug` logger gated by env); keep the request line.
Regression test: none practical beyond a lint rule (`no-console` in server/database-storage.ts).
```

```
BUG PF19-011
Severity: LOW (static analysis — unmeasured)
Feature: Frontend rendering of calendars and lists
Status: OPEN
Reproduction: static: `grep -rn "React.memo\|memo(" client/src` → 0 memoised components; client/src/pages/reservations/calendar.tsx (4 244 lines) computes `getReservationsForDay(vehicleId, day)` by filtering the entire reservation array per vehicle-cell (`:927-943`) and `getReservationsForDate(day)` per date cell inside JSX click/drag handlers (`:1261-1263`); client/src/components/dashboard/reservation-calendar.tsx:370-385 filters all reservations inside `week.map(day => …)` per cell (42 cells × N reservations per render); GlobalDialogContext.Provider passes a fresh `value={{ … }}` object each render (client/src/contexts/GlobalDialogContext.tsx:237-250) so every consumer re-renders when any dialog state changes; 62 inline arrow handlers in calendar.tsx JSX.
Expected: O(N) bucketing of reservations by day/vehicle in a useMemo, memoised row/cell components, memoised context value.
Actual: O(cells × N) filtering per render with N = 461 (month) and re-renders triggered by any dialog state or socket invalidation (which also swaps the 8 MB array reference → every derived useMemo recomputes).
Root cause: files/lines above.
Affected files: client/src/pages/reservations/calendar.tsx, client/src/components/dashboard/reservation-calendar.tsx, client/src/contexts/GlobalDialogContext.tsx, client/src/pages/maintenance/calendar.tsx.
Affected data: none.
Security impact: none.
Business impact: unmeasured here (no browser); with 461 visible reservations and ~35 vehicles × 30 days cells this is ~500 k predicate evaluations per render — probably tens of ms, not seconds, on a desktop.
Fix: bucket reservations into Map<dateKey, Reservation[]> / Map<vehicleId, …> once per data change; `useMemo` the context value; `React.memo` the day-cell and row components.
Regression test: React Profiler measurement before/after; not automatable without a browser harness.
```

```
BUG PF19-012
Severity: LOW
Feature: Socket-driven cache invalidation (client)
Status: OPEN
Reproduction: client/src/lib/cache-utils.ts:11, :23-25, :38, :50-51, :62-63, :75 use `key.includes('/' + id)`: a `reservations` event with vehicleId 18 invalidates `/api/reservations/vehicle/1870`, `/api/vehicles/1870`, `/api/customers/18…`, etc.; an event with id 1 invalidates every key containing "/1". Combined with prefix invalidation this refetches dialogs' detail queries that are unrelated to the change.
Expected: exact-segment matching (`/${id}` followed by end or `/`), or keyed query families.
Actual: substring match.
Root cause: client/src/lib/cache-utils.ts (lines above).
Affected files: client/src/lib/cache-utils.ts.
Affected data: none.
Security impact: none.
Business impact: extra refetches on busy days; masked by the 50 ms batching.
Fix: regex `new RegExp('/' + id + '(/|$|\\?)')`.
Regression test: unit test of the matcher with ids 1, 18, 1870.
```

```
BUG PF19-013
Severity: LOW
Feature: Nightly schedulers (service-due scan, RDW APK scan)
Status: OPEN
Reproduction: static: server/utils/service-due-scanner.ts:83-101 — `getServiceDueVehicles()` (settings + all 665 vehicles) at :100 and `storage.getAllVehicles()` again at :101 just to count; then 1–2 statements per due vehicle (:105-120). server/utils/rdw-apk-scanner.ts:27-74 — per vehicle: 1 external HTTPS call + `getPendingApkDateChangeForVehicle` SELECT + 250 ms delay → ≥ 665 statements and ≥ 2.8 min for the fleet, sequential (also triggered manually via POST /api/apk-date-changes/scan-now; not run here). server/services/portal-customer-notifications.ts:92-118 — one dedupe SELECT per on-road reservation per alert type.
Expected: one pass over the vehicles already loaded; pending changes fetched in one IN() query; dedupe via a single set query.
Actual: as above; harmless at 665 vehicles at 02:30–04:00, but the manual scan-now button runs the 2.8-minute loop inside a request lifetime.
Root cause: files/lines above.
Affected files: server/utils/service-due-scanner.ts, server/utils/rdw-apk-scanner.ts, server/services/portal-customer-notifications.ts.
Affected data: custom_notifications, apk_date_changes, portal_notifications (writes are idempotent by design).
Security impact: none.
Business impact: none measurable today; only the manual scan's duration.
Fix: reuse the loaded vehicle array; batch the pending-change lookup; keep the RDW throttle but make the manual endpoint asynchronous with progress (it already has /scan-status).
Regression test: statement-count assertion for scanVehiclesForServiceDue against a fixture (constant, not O(vehicles)).
```

## Re-confirmed existing bugs

- **BUG-089** — `GET /api/reports/maintenance-costs` → 500 on every call (12/12 and 10/10 in the burst), 100 ms p50; it executes all 7 statements (expenses, vehicles + batches) before throwing — the failure is in the aggregation code, not the query.
- **BUG-168** — the synchronous pdf-lib generator; the normal case is quantified above (0.58 s CPU per damage check, 2.6 s server-wide stall with 5 concurrent). PF19-005 is the everyday manifestation.
- **BUG-079** — request logger still appends the JSON body (200-char cap): measured 203 bytes/line, ≈1 MB/day; the leak of small secret-bearing bodies stands, the volume concern does not.
- **BUG-074** — the `apiLimiter` skip never fires: authenticated responses still carry `RateLimit-Limit: 1000` / `RateLimit-Remaining` (p19-compress.out.json); this audit had to spread ~3 500 requests over 20 fake IPs to stay under the shared bucket, and the lead's browser session shares the bucket with any test using the real loopback address (RateLimit-Remaining was 819 before this phase started).
- **BUG-096** — 50 cookie-less requests created 50 `session` rows (p19-anon-session.out.json; session table 49 → 99 → 111 rows during the phase).
- **BUG-030** — 50 MB upload rejected with HTTP 500 + `MulterError` stack containing absolute paths (phase 15's 60 MB variant, same handler); the rejection itself is cheap (178 ms, no buffering).
- **BUG-095** — `active_sessions` 213 rows and growing (never pruned), noted in the DB size table.
- **BUG-005** — `io.emit('data-update')` carries the full entity to every connected socket (`server/realtime-events.ts:11-23`); size-wise one reservation event is ~4 KB, not a performance problem, exposure covered by the security phases.

## Environment restored

- `ALTER DATABASE lvs_audit RESET log_min_duration_statement;` and `ALTER SYSTEM RESET log_line_prefix;` + `SELECT pg_reload_conf();` executed at 23:04; verified afterwards on a fresh connection: `log_min_duration_statement = -1`, `log_line_prefix = '%t '` (from postgresql.conf), `pg_db_role_setting` has no rows for `lvs_audit`. The 71 rotated log files (≈700 MB) under `C:\Program Files\PostgreSQL\17\data\log\postgresql-2026-09-10_22*/23*.log` were left for the lead to delete.
- Test artefacts left in `lvs_audit` / `audit-uploads` as listed under Method & caveats (all recognisable: `AUDIT-P19-large`, `Contract (Unsigned) N` for reservation 3535, transport reports for transports 67-71). Scratch files (20 MB / 50 MB PDFs) are in the agent scratchpad only.
- No application code was modified; nothing committed.
