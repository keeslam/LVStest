# Browser end-to-end tests and workflow reviews — design

Date: 2026-09-20. Branch: `fix/audit-remediation`. Builds on the audit of
2026-09-09/15 (`docs/audit/`, tracker BUG-001…230, OPT-001…033, owner decisions
B-01…B-24 in `docs/audit/besluiten.md`).

## Goal

Two production faults on 2026-09-20 were found by staff, not by tests: the
Reservations page crashed on an emptied start date, and the dashboard showed
"Kon de gegevens niet laden" on a database that had missed a migration. The
suite of 1449 vitest tests exercises server rules and single components; nothing
drives the real application in a real browser.

This project adds that, and uses the same walk-throughs to make the daily work
of desk staff as short and logical as possible:

1. A browser test suite that opens every page and dialog for every role, and
   walks the real workflows from start to finish.
2. Before each workflow test is written, a review of that workflow as staff
   experience it, producing improvement proposals the owner approves one by one.
3. The test then records the approved, efficient order of work, so a later
   change that adds a click, a screen or a retyped field turns the test red.

Decisions taken during brainstorming (owner: Kees):

1. Runs locally first, before every push to `main`. When all areas are covered
   the same suite moves to GitHub, and only then is the deploy tied to it. That
   last step needs a new explicit approval.
2. Two layers, built in rounds. Layer A: every page and every dialog per role.
   Layer B: workflows, the rental desk first, then one area per round in this
   order: costs and invoices, maintenance and APK, transport, customer portal,
   settings, reports.
3. "The test must think about which actions logically follow each other, so
   that everything works as efficiently as possible." A test cannot judge; the
   review in step 2 above does, and the test guards the result.
4. Workflow or business changes are built only after approval per proposal, the
   rule the audit already used. Technical bugs found on the way may be fixed
   directly, each with a regression test.

## Non-goals

- Visual regression (pixel comparison of screenshots).
- Load or performance testing (audit phase 19 covered it).
- Testing third parties: no mail is sent, no Gemini, RDW, IMAP or CJIB call
  leaves the machine.
- Replacing the hour of watching a staff member at the desk. The reviews are
  made from the application, not from observed behaviour; where the real order
  of work is uncertain, the owner is asked.

## Tooling

Playwright Test (`@playwright/test`, dev dependency). It waits for the page by
itself, keeps a screenshot, video and replayable trace of a failure, and runs
unchanged on GitHub Actions later. Locally it drives the Chrome that is already
installed (`channel: "chrome"`), so no browser download is needed.

Rejected: the hand-written Chrome DevTools scripts of the audit
(`docs/audit/wip/scripts/`): no waiting model, no reporting, flaky. More jsdom
tests: they never touch the built application, the database or the migration,
which is where both faults of 2026-09-20 sat.

## Layout

```
e2e/
  playwright.config.ts      projects: setup, layer-a, layer-b
  global-setup.ts           database, migration, seed, build check
  seed/
    seed.ts                 deterministic data, no real customer data
    users.ts                one user per role, fixed names
  support/
    app.ts                  start/stop the application under test
    guards.ts               page-health guard (see Layer A)
    steps.ts                step counter (see Layer B)
    login.ts                one login per role, session reused
  registry/
    pages.ts                every route, which roles may open it
    dialogs.ts              per page: the openers of its dialogs
  layer-a/
    pages.spec.ts
    dialogs.spec.ts
    forbidden.spec.ts
  layer-b/
    desk/…                  round 1
  scripts/
    dialog-coverage.ts      dialogs in the source that no registry entry opens
docs/e2e/
  README.md                 how to run, how to read a failure (Dutch)
  werkstromen/
    01-balie.md             review + proposals per round (Dutch)
```

`npm run e2e` runs everything; `npm run e2e:a` and `npm run e2e:b` run one
layer; `npm run e2e:coverage` prints the dialog coverage.

## The application under test

- Database `lvs_e2e` on the local PostgreSQL, dropped and recreated on every
  run. It is built from nothing: `drizzle-kit push`, then
  `node startup-migration.js`. That is the path a new production database
  takes, and running the real migration on every run is what catches a missing
  column before staff do. The first implementation task verifies this path
  works on an empty database; if it does not, that is a bug to fix, not
  something to work around with a cloned database.
- The production build (`npm run build`, `npm start`) on its own port (5010),
  with its own `UPLOADS_DIR` and `BACKUP_PATH` under `e2e/.tmp/` (git-ignored).
  The build is reused when no source file is newer than `dist/`.
- No outbound traffic. No SMTP setting is seeded, `GEMINI_API_KEY` is unset,
  the invoice inbox and CJIB are not configured. The RDW lookup is the one
  call staff trigger from a form. `server/utils/rdw-api.ts` has the address
  `https://opendata.rdw.nl` hard-coded; it gets one constant read from
  `RDW_BASE_URL` (default: the real address), and the harness points it at a
  small local stub that answers for the seeded plates.
- Rate limits stay as in production; there is no test-only bypass in the
  server. The login limiter (5 per 15 minutes) only counts failed logins, and
  each role logs in once per run with the session reused (`storageState`). The
  API limiter allows 1000 requests per user per 15 minutes and its counters
  live in memory, so every run starts at zero. Layer A uses seven users; Layer
  B stories get their own seeded desk user each when one user would come near
  the limit. A 429 is caught by the page-health guard like any other failure.

## Seed

One TypeScript script writing through the application's own storage layer
where possible, so the seed cannot drift from the schema. Fixed content:

- Seven users, one per role (`admin`, `manager`, `user`, `cleaner`, `viewer`,
  `accountant`, `maintenance`), password from an environment variable with a
  documented local default that exists only in the E2E database.
- Eight vehicles with invented plates in valid Dutch formats, covering:
  available, rented, in workshop, not for rental, APK due within 30 days,
  warranty ending.
- Six customers (private and business, one with a second driver).
- Reservations in every status: booked for today, booked for next week, picked
  up, returned, completed, cancelled; one open-ended rental; one placeholder
  spare.
- A few expenses, one maintenance block, one transport, one portal user.

Dates are relative to the run date (office date, Europe/Amsterdam), so the
suite never rots.

## Layer A — every page and dialog, per role

`registry/pages.ts` lists each route with the roles that may open it, derived
from the permissions the routes and the sidebar already use. `registry/dialogs.ts`
lists, per page, the controls that open a dialog, by `data-testid` (the client
has about 1400 of them; a missing one is added to the source as part of the work).

For each role the suite logs in once, then for each page:

1. opens it and waits until the network is idle;
2. opens each registered dialog, checks it rendered a title, and closes it with
   Escape;
3. the page-health guard fails the test on any of: a destructive toast, the
   error boundary text "Er ging iets mis op dit scherm", an HTTP response of
   500 or higher on `/api/`, an uncaught exception, or a `console.error`. A
   short allowlist with a written reason per entry covers known harmless noise.

For a page a role may not open, the suite checks the refusal (redirect or the
"geen toegang" state) and that the page's API calls return 403, not data.

Openers are explicit on purpose. A crawler that clicks every button would also
press "Verwijderen". The gap this leaves is made visible instead of hidden:
`dialog-coverage.ts` scans the client source for `Dialog`, `AlertDialog` and
`Sheet` roots (about 200) and reports the ones no registry entry reaches. The
report is part of `npm run e2e`; the count may only go down. Dialogs that need
a specific record state (a picked-up rental, a fine, an inbox item) are opened
in Layer B and count as covered there.

## Layer B — workflows

Each round has two parts.

### Part 1: workflow review (before the test)

The workflow is walked in the real browser the way staff do it, from the event
that starts it ("customer calls", "van comes back") to the end state. Every
click, screen change and typed field is written down. Marked as waste:

- data typed twice, or typed although the application already knows it;
- leaving the screen to continue (back to a list, search again);
- the logical next action not offered where the previous one ends;
- an order the form enforces that does not match the order of the work;
- a confirmation that adds nothing, or a missing one where a mistake is costly;
- a default that is usually wrong.

Output: `docs/e2e/werkstromen/NN-<area>.md`, in Dutch, for the owner. Per
workflow: the steps as they are now with counts, and numbered proposals that
continue the audit's series (OPT-034 onward), each with what it saves staff
and a size estimate. The OPT questions the audit left open (listed in
`docs/audit/11-eindrapport.md`) are raised again in the round they belong to. The owner answers per proposal; answers are recorded
in `docs/audit/besluiten.md` (B-25 onward). Nothing in a workflow changes
before that.

### Part 2: the workflow test

Written against the approved flow; an approved improvement is built test-first,
with this test as the failing test.

- It follows the order of the work, not the order of the menu, as one
  continuous story per workflow.
- After each step it asserts that the next logical action is reachable from
  where the user is, without navigating away.
- It asserts the pre-filled values staff rely on: customer, vehicle, mileage,
  fuel level, today's date (office date), suggested end date.
- It counts user actions through `support/steps.ts`: every click, fill and
  select in a workflow goes through one helper that counts it. Each workflow
  has a budget equal to the approved flow. More actions than the budget fails
  the test with the list of steps; fewer prints a notice to lower the budget.
  The budget is a guard against regression, not a target to game: a step is
  one deliberate user action, and the helper is the only way tests interact
  with the page in Layer B.
- It checks the end state in the interface and through the API (rental
  completed, vehicle free again, mileage stored, documents present).

### Round 1: the rental desk

One story: new customer, new vehicle, reservation, pickup (contract number,
mileage, fuel), damage check, return, completed rental and free vehicle. Plus
the edge cases staff already hit: emptied start date, pickup before the start
date (B-16 question), double booking refused, return with lower mileage,
pickup just after midnight (clock faked to 00:30 Amsterdam).

Later rounds each get their own short addition to this spec when they start.

## Failure handling and reporting

- Playwright's HTML report, with screenshot, video and trace kept for failed
  tests only, under `e2e/.tmp/report/` (git-ignored).
- A red suite blocks the request for push approval: the failure and its
  screenshot are shown to the owner instead.
- A flaky test is a bug in the test or the application. It is fixed or, with a
  written reason and an issue number, quarantined; never retried into green.
  `retries: 0` locally.
- Target duration: Layer A plus round 1 under five minutes on this machine.
  Layer A runs the roles in parallel workers; Layer B runs serially per story
  because each story owns its records.

## Later: GitHub

When all rounds are in: a GitHub Actions workflow with a PostgreSQL service
container runs `npm test` and `npm run e2e` on every push and pull request.
Tying the Coolify deploy to a green run (deploy from a `release` branch or a
webhook after the workflow) is a separate decision with its own approval,
because it changes how production is deployed.

## Order of work

1. Harness: database from nothing, seed, application start, login per role,
   page-health guard, one page as proof.
2. Layer A: page registry and forbidden pages for all roles.
3. Layer A: dialog registry and the coverage report.
4. Round 1 review: `docs/e2e/werkstromen/01-balie.md`, owner decides.
5. Round 1 tests and approved improvements.
6. `docs/e2e/README.md`, and `npm run e2e` added to the pre-push routine.

Steps 1 to 3 need no owner input. Step 4 ends at a stop point.
