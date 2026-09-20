# Invoice Inbox Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Logboek" button on the invoice inbox settings card opens a dialog with three tabs: fetched invoices, other mail, and fetch runs, the first two searchable on the server.

**Architecture:** Tabs 1 and 2 are read-only views over the existing `invoice_inbox_items` table through one new search query. Tab 3 needs a new additive table `invoice_inbox_runs`, written by the poller at the end of every run and pruned after 90 days. Two new GET routes next to the existing inbox routes; one new dialog component.

**Tech Stack:** Express 4, Drizzle ORM / PostgreSQL, React 18, TanStack Query, shadcn/ui (Dialog, Tabs, Table, Badge, Switch, Select), i18next, vitest (server project with database, client project jsdom).

**Spec:** `docs/superpowers/specs/2026-09-20-invoice-inbox-log-design.md` — binding; read it first. It holds the DDL, the route contracts, the two TypeScript row types, the dialog layout and the full test list. This plan does not repeat them.

## Global Constraints

- Read-only feature: no change to importing, booking, review reasons, notifications or the review list.
- Additive migration only: `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` in `startup-migration.js`, table in `shared/schema.ts`, manifest via `npm run schema:export`. Note: `startup-migration.js` runs `syncSchemaFromManifest({ createTables: false })` BEFORE the explicit blocks, so the explicit block must create the table.
- Routes accept `manage_expenses` OR `manage_settings` (existing `canRunOrSeeStatus`); the PDF route keeps `manage_expenses`.
- The log response never contains `attachmentPath`, `attachmentHash`, `invoiceHash` or the `parsed` object.
- Search text only through bound parameters; `%`, `_`, `\` escaped.
- Writing the run log never fails or delays a run.
- Server tests only with `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lvs_fixtest DATABASE_SSL=false`. Never another database.
- Code and comments in English, matching the surrounding style. UI text through i18next, Dutch and English. Commit messages Dutch Conventional Commits, scope `(kosten)`, ending with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- `git add` explicit paths only. Never push.

---

### Task 1: fetch runs are stored

**Files:**
- Modify: `shared/schema.ts` (new table `invoiceInboxRuns` next to `invoiceInboxItems`), `shared/invoice-inbox.ts` (`InboxRunRow`, `InboxLogRow`), `startup-migration.js` (INVOICE INBOX block), `schema-columns.json` (generated), `server/services/invoice-inbox/poller.ts`, `server/routes/expense-inbox.ts` (pass the username into the manual run if it is not passed yet)
- Create: `server/services/invoice-inbox/run-log.ts`, `server/__tests__/invoice-inbox-run-log.test.ts`
- Test: also extend the existing migration test for the inbox tables (find it with `grep -l "invoice_inbox_items" server/__tests__/*.test.ts`)

**Interfaces — produces:**

```ts
// server/services/invoice-inbox/run-log.ts
export const RUN_LOG_RETENTION_DAYS = 90;
export const inboxRunLog = {
  /** Stores one finished run and prunes rows older than the retention. Never throws. */
  record(summary: InvoiceInboxRunSummary, triggeredBy: string | null): Promise<void>;
  list(opts: { activeOnly: boolean; limit?: number; offset?: number }): Promise<{ runs: InboxRunRow[]; total: number }>;
};
```

- [ ] **Step 1:** Write `invoice-inbox-run-log.test.ts` first: `record` stores the summary's numbers, trigger, username and errors (capped at 20 × 500 characters); a row with `started_at` 91 days ago is pruned by the next `record`, one of 89 days stays; `list` orders newest first, pages with `total`, and `activeOnly` keeps exactly the rows with `mails > 0`, `failed > 0` or a non-empty `errors`; `record` swallows a database error (make the insert fail, e.g. by mocking `db.insert` to reject) and logs it. Clean up the rows the test creates. Run it: FAIL (module missing).
- [ ] **Step 2:** Add the table to `shared/schema.ts`, the DDL from the spec to `startup-migration.js`, run `npm run schema:export`, run `node startup-migration.js` against `lvs_fixtest` so the table exists there. Extend the migration test: table and index exist, second run is a no-op.
- [ ] **Step 3:** Implement `run-log.ts`. Run the test: PASS.
- [ ] **Step 4:** In `poller.ts`, where the summary of a finished run is stored in `lastRun` (also on the path where connecting failed), call `void inboxRunLog.record(summary, triggeredBy)` — not awaited inside the run's critical path, errors already swallowed. Thread the username through `runInvoiceInboxImport(trigger, …)`; look at how `createdBy` already reaches the importer and reuse it. Add poller tests next to the existing ones (find with `grep -l "runInvoiceInboxImport" server/__tests__/*.test.ts`): a finished run writes one row; a run that fails to connect writes one row with its error; a run that does not start (disabled / already running) writes none.
- [ ] **Step 5:** Run the inbox test files and `npx tsc --noEmit -p .`. Commit:

```bash
git add shared/schema.ts shared/invoice-inbox.ts startup-migration.js schema-columns.json server/services/invoice-inbox/run-log.ts server/services/invoice-inbox/poller.ts server/routes/expense-inbox.ts server/__tests__/<the test files you touched>
git commit -m "feat(kosten): ophaalrondes van het factuurpostvak worden bewaard (90 dagen)"
```

Stage `schema-columns.json` only if `git diff --ignore-cr-at-eol -- schema-columns.json` shows a content change (it must, for the new table).

---

### Task 2: the two read routes

**Files:**
- Modify: `server/services/invoice-inbox/inbox-storage.ts` (`searchLog`), `server/routes/expense-inbox.ts`
- Create: `server/__tests__/invoice-inbox-log-routes.test.ts`

**Interfaces — produces:**

```ts
// inbox-storage.ts
searchLog(opts: { kind: 'invoices' | 'other'; q?: string; status?: InboxStatus; limit?: number; offset?: number }): Promise<{ items: InboxLogRow[]; total: number }>;
```

The heart of it (adapt names to the file's imports):

```ts
const OTHER_REASONS = ['no_attachment', 'not_invoice'] as const;
const escapeLike = (text: string) => text.replace(/[\\%_]/g, (ch) => `\\${ch}`);

const conditions = [
  opts.kind === 'other'
    ? inArray(invoiceInboxItems.reviewReason, [...OTHER_REASONS])
    : or(isNull(invoiceInboxItems.reviewReason), notInArray(invoiceInboxItems.reviewReason, [...OTHER_REASONS])),
];
if (opts.status) conditions.push(eq(invoiceInboxItems.status, opts.status));
const q = (opts.q ?? '').trim().slice(0, 100);
if (q) {
  const like = `%${escapeLike(q)}%`;
  const plate = `%${escapeLike(q.replace(/[\s-]/g, ''))}%`;
  conditions.push(or(
    ilike(invoiceInboxItems.fromAddress, like),
    ilike(invoiceInboxItems.subject, like),
    ilike(invoiceInboxItems.attachmentName, like),
    ilike(invoiceInboxItems.errorMessage, like),
    sql`${invoiceInboxItems.parsed}->>'vendor' ILIKE ${like}`,
    sql`${invoiceInboxItems.parsed}->>'invoiceNumber' ILIKE ${like}`,
    sql`regexp_replace(${vehicles.licensePlate}, '[\\s-]', '', 'g') ILIKE ${plate}`,
  )!);
}
```

PostgreSQL's default LIKE escape character is the backslash, which is what `escapeLike` relies on; the test with `%` and `_` proves it. When `q` holds only dashes/spaces the plate pattern would be `%%`: skip the plate condition when the stripped text is empty. Count and page with the same `where`; the count needs the same `leftJoin(vehicles, …)`. Map rows to `InboxLogRow` explicitly (no spreading of the item), `hasFile = Boolean(attachmentPath)`, `totalAmount` only when `parsed.totalAmount` is a finite number.

- [ ] **Step 1:** Write the route tests from the spec's list first (seed rows through `inboxStorage.create`, use a distinctive marker in subject/sender so the assertions are not disturbed by other rows, clean up afterwards; for the login/permission harness copy the existing inbox route tests). Run: FAIL (404).
- [ ] **Step 2:** Implement `searchLog` and the two routes (`/api/expenses/inbox/log`, `/api/expenses/inbox/runs`) with `canRunOrSeeStatus`; validate `kind`, `status` (400), clamp `limit`/`offset`, parse `activeOnly` (`"false"` → false, anything else → true). Register them BEFORE `/api/expenses/inbox/items/:id` only if Express ordering requires it (different path prefix: it does not, but check).
- [ ] **Step 3:** Run the test: PASS. Run all inbox test files and `npx tsc --noEmit -p .`. Commit:

```bash
git add server/services/invoice-inbox/inbox-storage.ts server/routes/expense-inbox.ts server/__tests__/invoice-inbox-log-routes.test.ts
git commit -m "feat(kosten): logboek van het factuurpostvak doorzoekbaar via de server"
```

---

### Task 3: the dialog

**Files:**
- Create: `client/src/components/expenses/invoice-inbox-log-dialog.tsx`, `client/src/components/expenses/__tests__/invoice-inbox-log-dialog.test.tsx`
- Modify: `client/src/components/expenses/invoice-inbox-config-form.tsx`, `client/src/locales/nl/expenses.json`, `client/src/locales/en/expenses.json`, `docs/gebruikershandleiding/09-email.md`

- [ ] **Step 1:** Read `invoice-inbox-dialog.tsx` and `invoice-review-dialog.tsx` for the house style: how the PDF is opened, how reasons are labelled, how permissions are read from the user, how tables and badges are built. Reuse, do not copy logic that can be imported.
- [ ] **Step 2:** Write the component test first (the spec's client list). Run: FAIL.
- [ ] **Step 3:** Build the dialog per the spec's "Client" section. Paging: keep `offset` in state per tab, append pages, reset to 0 when `q`, `status`, `kind` or the switch changes. Query keys must carry every parameter, e.g. `["/api/expenses/inbox/log", { kind, q, status, offset }]`; check how `getQueryFn` in `client/src/lib/queryClient.ts` turns a key into a URL and follow that convention (or pass an explicit `queryFn`). Only fetch while open and for the active tab (`enabled`).
- [ ] **Step 4:** Add the button to the config form (`data-testid="button-invoice-inbox-log"`), always enabled. Add all strings under `invoiceInbox.log.*` in both locale files; the repository has tests that look for hard-coded Dutch strings and missing keys — run `npx vitest run --project client` in full before committing.
- [ ] **Step 5:** Add the paragraph to `docs/gebruikershandleiding/09-email.md` §9.9 (Dutch, plain language).
- [ ] **Step 6:** `npx vitest run --project client`, `npx tsc --noEmit -p .`. Commit:

```bash
git add client/src/components/expenses/invoice-inbox-log-dialog.tsx client/src/components/expenses/__tests__/invoice-inbox-log-dialog.test.tsx client/src/components/expenses/invoice-inbox-config-form.tsx client/src/locales/nl/expenses.json client/src/locales/en/expenses.json docs/gebruikershandleiding/09-email.md
git commit -m "feat(kosten): knop Logboek bij het factuurpostvak met tabbladen Facturen, Overige mail en Ophaalrondes"
```
