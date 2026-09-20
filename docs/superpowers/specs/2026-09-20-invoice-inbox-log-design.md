# Invoice inbox log (received mail, other mail, fetch runs) — design

Date: 2026-09-20. Branch: `fix/audit-remediation`. Builds on the invoice inbox
(`docs/superpowers/specs/2026-09-18-invoice-inbox-design.md`, code under
`server/services/invoice-inbox/`, `server/routes/expense-inbox.ts`,
`client/src/components/expenses/invoice-inbox-*.tsx`).

## Goal

The owner wants to see what the application fetched from the invoice mailbox,
and to search it. A button "Logboek" on the invoice inbox card in Settings,
tab E-mail, next to "Nu ophalen", opens a dialog with three tabs:

1. **Facturen** — every fetched attachment that was treated as an invoice.
2. **Overige mail** — mail that was not processed because it holds no invoice.
3. **Ophaalrondes** — every fetch run.

Decisions taken during brainstorming (owner: Kees):

1. A dialog with tabs, opened from the settings card (his standing preference:
   dialogs, not extra blocks on a page).
2. Search on the server (the log grows without bound), one search field.
3. Mail without an invoice stays in the "Te controleren" list on the Kosten
   page as it is today, AND appears in the tab "Overige mail". Nothing changes
   in how staff handle it.
4. Fetch runs are stored from now on; runs older than 90 days are deleted
   automatically. Runs from before this feature do not exist.

## Non-goals

- No change to importing, booking, review reasons, notifications or the review
  list. The log is read-only.
- No export, no deleting from the log, no editing.
- No mail bodies are stored or shown (they never were).

## Data

Tabs 1 and 2 read the existing table `invoice_inbox_items`; every fetched mail
already leaves at least one row there (also mail without attachment, from an
unknown sender, too large, or failed three times).

- **Other mail** = rows whose `review_reason` is `no_attachment` or
  `not_invoice`, whatever their status.
- **Invoices** = every other row.

Tab 3 needs a new table, additive like the inbox tables before it:

```sql
CREATE TABLE IF NOT EXISTS invoice_inbox_runs (
  id           serial PRIMARY KEY,
  started_at   timestamptz NOT NULL,
  finished_at  timestamptz NOT NULL,
  trigger      text        NOT NULL,            -- 'scheduler' | 'manual'
  triggered_by text,                            -- username for a manual run
  mails        integer     NOT NULL DEFAULT 0,
  attachments  integer     NOT NULL DEFAULT 0,
  booked       integer     NOT NULL DEFAULT 0,
  review       integer     NOT NULL DEFAULT 0,
  skipped      integer     NOT NULL DEFAULT 0,
  failed       integer     NOT NULL DEFAULT 0,
  errors       jsonb       NOT NULL DEFAULT '[]'::jsonb   -- string[]
);
CREATE INDEX IF NOT EXISTS invoice_inbox_runs_started_at_idx ON invoice_inbox_runs (started_at DESC);
```

Defined in `shared/schema.ts` (`invoiceInboxRuns`), created by an explicit
block in `startup-migration.js` next to the existing INVOICE INBOX block, and
exported to `schema-columns.json` (`npm run schema:export`). The columns mirror
`InvoiceInboxRunSummary` in `shared/invoice-inbox.ts`.

**Recording.** `runInvoiceInboxImport` in `server/services/invoice-inbox/poller.ts`
writes one row when a run ends, including a run that failed to connect (its
`errors` say why). A run that did not start (disabled, not configured, another
run in progress) writes nothing. Writing the log must never fail or delay the
run: errors are caught and logged to the console. For a manual run the
username of the person who pressed "Nu ophalen" is stored; the route already
knows it. Error strings are stored as the summary holds them, capped at 20
entries of 500 characters.

**Retention.** After writing a row, rows with `started_at` older than 90 days
are deleted. At the default of one run per 15 minutes that is under 9 000 rows.

## API

Both routes live in `server/routes/expense-inbox.ts` and accept
`manage_expenses` OR `manage_settings` (the existing `canRunOrSeeStatus`
guard), because the button sits on a settings card. Opening the PDF keeps its
own guard (`manage_expenses`).

`GET /api/expenses/inbox/log`

| Query | Meaning |
|---|---|
| `kind` | `invoices` (default) or `other` |
| `q` | optional search text, trimmed, at most 100 characters |
| `status` | optional, `booked` \| `review` \| `dismissed`; only with `kind=invoices` |
| `limit` | default 50, 1–200 |
| `offset` | default 0 |

Answers `{ items: InboxLogRow[], total: number }`, newest first
(`received_at DESC, id DESC`). `total` counts all matches, not the page.
An unknown `kind` or `status` is a 400.

```ts
export interface InboxLogRow {
  id: number;
  receivedAt: string;          // ISO
  mailDate: string | null;
  fromAddress: string | null;
  subject: string | null;
  attachmentName: string | null;
  status: InboxStatus;
  reviewReason: ReviewReason | null;
  errorMessage: string | null;
  vehiclePlate: string | null;
  vendor: string | null;        // parsed.vendor
  invoiceNumber: string | null; // parsed.invoiceNumber
  totalAmount: number | null;   // parsed.totalAmount
  hasFile: boolean;             // an attachment is stored
  expenseIds: number[];
}
```

The row deliberately leaves out `parsed` as a whole, `attachmentPath` and the
hashes.

**Search.** `q` matches, case-insensitively and as a substring: sender,
subject, attachment name, vendor, invoice number, error message and licence
plate. For the plate both sides are compared without dashes and spaces, so
"ab123c" finds "AB-123-C". `%`, `_` and `\` in `q` are escaped, so they match
literally. Everything goes through bound parameters.

`GET /api/expenses/inbox/runs`

| Query | Meaning |
|---|---|
| `activeOnly` | `true` (default) or `false`. Active = `mails > 0 OR failed > 0 OR errors <> '[]'` |
| `limit`, `offset` | as above |

Answers `{ runs: InboxRunRow[], total: number }`, newest first.

```ts
export interface InboxRunRow {
  id: number;
  startedAt: string;
  finishedAt: string;
  trigger: 'scheduler' | 'manual';
  triggeredBy: string | null;
  mails: number; attachments: number; booked: number; review: number; skipped: number; failed: number;
  errors: string[];
}
```

Both types live in `shared/invoice-inbox.ts`.

## Client

- `client/src/components/expenses/invoice-inbox-config-form.tsx`: a fourth
  button, outline, `data-testid="button-invoice-inbox-log"`, label "Logboek",
  always enabled (the log is useful even when the mailbox is switched off).
- New `client/src/components/expenses/invoice-inbox-log-dialog.tsx`: a wide
  dialog with shadcn `Tabs`. Queries run only while the dialog is open and only
  for the active tab.
  - **Facturen**: search field (debounced 300 ms), status select (Alles,
    Geboekt, Te controleren, Afgewezen), table: Ontvangen, Afzender, Onderwerp,
    Bijlage, Resultaat, Kenteken, Factuurnr., Bedrag, actions. "Resultaat" is a
    badge (green Geboekt, amber Te controleren plus the reason, grey
    Afgewezen); an error message is shown under it in small text.
  - **Overige mail**: the same search field, table: Ontvangen, Afzender,
    Onderwerp, Bijlage, Reden, Status.
  - **Ophaalrondes**: a switch "Alleen rondes met mail of fouten" (on by
    default), table: Gestart, Duur, Soort (Automatisch / Handmatig door …),
    Mails, Bijlagen, Geboekt, Te controleren, Overgeslagen, Mislukt, Fouten.
  - Every tab: "Meer laden" while `items.length < total`, an empty state, a
    loading state, and "x van y getoond".
  - Row actions: "PDF openen" when `hasFile` and the user holds
    `manage_expenses` (same opener as the review dialog uses); "Naar
    controleren" when the status is `review` and the user holds
    `manage_expenses` — goes to `/expenses?inbox=1`.
- Reason labels reuse the existing translations of the review dialog. All new
  text in `client/src/locales/nl/expenses.json` and `en/expenses.json` under
  `invoiceInbox.log.*`. Dates through the existing Dutch date helpers.
- The dialog must stay usable at 1280 px width: long subjects and file names
  are truncated with the full text in a `title`.

## Manual

`docs/gebruikershandleiding/09-email.md` §9.9 gets a short paragraph: what the
button shows, the three tabs, that search covers sender, subject, file name,
supplier, invoice number, plate and error text, and that runs are kept for 90
days.

## Tests

Server (vitest, database `lvs_fixtest`):
- log route: each searchable field is found; `%` and `_` match literally;
  plate without dashes; `kind` split is exact (a `no_attachment` row never in
  invoices, an `unknown_sender` row never in other); status filter; `total`
  with paging; ordering; 400 on bad `kind`/`status`; 403 without either
  permission; 200 with only `manage_settings`; the response never contains
  `attachmentPath`, `attachmentHash`, `invoiceHash` or `parsed`.
- runs: a finished run writes a row with the summary's numbers; a run that
  fails to connect writes a row with its error; a manual run stores the
  username; a failure while writing the log does not fail the run; rows older
  than 90 days are pruned; `activeOnly` filter; paging.
- migration: the table and index exist after `startup-migration.js`, and a
  second run changes nothing.

Client (vitest, jsdom): the button opens the dialog; typing searches after the
debounce with `q` in the request; switching tab requests the other `kind`;
"Meer laden" requests the next offset; "PDF openen" is absent without
`manage_expenses`; the runs switch flips `activeOnly`.

Browser: checked by hand in the dev server after the build.
