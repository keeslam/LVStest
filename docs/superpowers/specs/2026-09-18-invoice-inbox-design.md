# Invoice inbox (invoices by e-mail, IMAP, receive only) — design

Date: 2026-09-18. Branch: `fix/audit-remediation`. Builds on the expenses
module (`server/routes/expenses.ts`, `server/utils/invoice-scanner.ts`,
`client/src/components/invoice-scanner.tsx`) and follows the CJIB import
pattern (`server/services/cjib/*`, spec `2026-09-04-cjib-fine-import-design.md`).

## Goal

The maintenance company already sends its invoices by e-mail. Adding the
app's own address (`fakturenapp@lamgroep.nl`, a plain IMAP mailbox at the
web host) as an extra recipient must be enough: the app reads the mailbox on
a schedule, extracts the invoice with the existing Gemini scanner, and books
the amounts as expenses on the right vehicle. When the app is not certain,
the invoice waits in a review list where staff book it with one click.

Decisions taken during brainstorming:

1. Transport: IMAP over TLS against the web host's mailbox. No webhook, no
   Microsoft Graph, no OAuth.
2. Automation: hybrid. Book automatically only when every certainty rule
   passes; otherwise queue for review. Nothing is ever silently dropped.
3. Trust: a configurable sender allowlist. Mail from a sender outside the
   list is kept and queued with reason `unknown_sender`, never auto-booked.

## Out of scope (version 1)

Splitting one invoice over several vehicles, expenses without a vehicle
(the `expenses` table requires one), a confirmation mail back to the sender,
following download links in mails without an attachment, OAuth mailboxes,
reading the mail body as the invoice.

## Configuration

One JSON app setting `invoice_inbox_config` (same pattern as `cjib_config`),
exposed on `GET/PUT /api/expenses/inbox/config` (`manage_settings`):

```ts
interface InvoiceInboxConfig {
  enabled: boolean;               // scheduler on/off
  host: string; port: number;     // default 993
  secure: boolean;                // implicit TLS (993) or STARTTLS (143); default true
  username: string; password: string; // password stored like the SMTP password, masked in GET
  inboxFolder: string;            // default "INBOX"
  processedFolder: string;        // default "Verwerkt"; "" = leave in place, mark \Seen only
  pollMinutes: number;            // 5..1440, default 15
  allowedSenders: string[];       // "naam@garage.nl" or "@garage.nl"; case-insensitive
  totalTolerance: number;         // allowed |sum(lines) - total| in euro, default 1.00
}
```

`GET` returns the password as `"********"`; `PUT` keeps the stored password
when the mask comes back, and restarts the scheduler. `POST
/api/expenses/inbox/config/test` connects with the given (or stored)
settings and returns `{ ok, unseen }` (count of unseen messages in
`inboxFolder`); nothing is downloaded.

Outbound guard (same reason as CJIB FIX-U): the host must pass
`assertPublicHost` from `server/utils/security/outboundGuard.ts`, and the
port must be 993 or 143. Otherwise the test button is a port scanner for
whatever the container can reach. Deployments on a private mail host set
the existing private-outbound override.

Shared types and defaults live in `shared/invoice-inbox.ts`
(`INVOICE_INBOX_CONFIG_KEY`, `DEFAULT_INVOICE_INBOX_CONFIG`,
`INVOICE_INBOX_PASSWORD_MASK`, `InvoiceInboxItem`, `ReviewReason`).

## Data

New table `invoice_inbox_items` (idempotent DDL in `startup-migration.js`,
columns exported to `schema-columns.json` by the build; production
migrations are additive only):

| column | type | notes |
| --- | --- | --- |
| id | serial | |
| message_id | text | RFC 5322 Message-ID; index, not unique (one mail can carry several invoices) |
| from_address | text | bare address, lower-cased |
| subject | text | |
| mail_date | timestamptz | Date header; falls back to received_at |
| attachment_name | text | original file name, sanitised |
| attachment_path | text | relative path under `uploads/invoice-inbox/` |
| attachment_hash | text unique | sha256 of the attachment bytes; an attachment is processed once |
| attachment_content_type | text | `application/pdf`, `image/jpeg`, `image/png` |
| invoice_hash | text | sha256 of `vendor|invoiceNumber|invoiceDate|totalAmount` (normalised); index |
| parsed | jsonb | full `ParsedInvoice` from the scanner, plus `plates: string[]` found |
| status | text | `booked`, `review`, `failed`, `dismissed` |
| review_reason | text | see below; null when `booked` |
| vehicle_id | integer | references vehicles(id) on delete set null; set on booking |
| expense_ids | integer[] | expenses created from this item |
| error_message | text | scanner or booking error |
| received_at | timestamptz | default now() |
| processed_at | timestamptz | set on book / dismiss / failed |
| created_by | text | `scheduler` or the staff username that booked/dismissed |
| updated_by | text | |

Review reasons (`review_reason`), in the order they are checked:

| reason | when |
| --- | --- |
| `no_attachment` | mail has no PDF/JPG/PNG attachment, or all attachments were skipped (over 15 MB, wrong type) |
| `parse_failed` | the scanner threw on every model, or validation of the parsed invoice failed |
| `unknown_sender` | `from_address` matches no entry in `allowedSenders` |
| `duplicate` | an item with the same `invoice_hash` already exists with status `booked` or `review` |
| `no_plate` | no license plate found on the invoice |
| `multiple_plates` | more than one distinct plate found |
| `plate_unknown` | exactly one plate, but it is not in the fleet |
| `total_mismatch` | `|sum(lineItems) - totalAmount| > totalTolerance`, or `invoiceDate` is in the future |

`expenses` gets one nullable column `inbox_item_id integer references
invoice_inbox_items(id) on delete set null`. Existing rows stay null. The
existing `invoice_hash` that the manual scan computes but never stores is
now stored on the item too (the manual scan writes an item with
`message_id = null`, `from_address = null`, status `booked`), so the
duplicate check covers both entry points.

## Reading the mailbox

`server/services/invoice-inbox/imap-client.ts` — thin wrapper over
`imapflow` (new dependency, MIT, maintained by the nodemailer author):
`withClient(config, fn)`, `listUnseen(config)` (uids + envelope),
`fetchMessage(config, uid)` (raw source), `moveToProcessed(config, uid)`
(IMAP MOVE, falls back to COPY + flag `\Deleted` + EXPUNGE when the server
lacks MOVE), `markSeen(config, uid)`. TLS certificate validation on.
Tests swap the client for a fake through `setInvoiceImapClient()`.

Attachments are extracted with `mailparser` (new dependency, MIT). Accepted:
`application/pdf`, `image/jpeg`, `image/png`, at most 15 MB each, at most
10 per mail. Inline images under 20 KB (signatures, logos) are ignored. A
file name is sanitised with the existing `sanitizeFilename`; the stored
name is `<timestamp>_<hash8>_<safe name>` under `uploads/invoice-inbox/`.

## Scanning and booking

`server/services/invoice-inbox/importer.ts` — `importInvoiceMail({ raw,
uid, config, createdBy })`:

1. Parse the mail. No accepted attachment → one item with reason
   `no_attachment`, status `review`, `attachment_hash = sha256(message_id)`
   so the same mail is not queued twice.
2. Per attachment: hash; if an item with that hash exists → skip (counted
   as `skipped`, nothing written). Save the file.
3. Run `processInvoiceWithAI(path, mimeType)` (existing; gets an optional
   second parameter, default `application/pdf`, so JPG/PNG attachments are
   sent with their own mime type; the manual scan route is unchanged). Then
   `validateParsedInvoice`. Failure → item `review`, reason `parse_failed`,
   `error_message` set.
4. Collect plates: `parsed.vehicleInfo.licensePlate` plus every Dutch plate
   pattern found in line-item descriptions, normalised (upper-case, no
   dashes or spaces). Match against the fleet with the same normalisation.
5. Decide with `decideInvoiceBooking()` (pure function in
   `server/services/invoice-inbox/decide.ts`): returns
   `{ action: 'book', vehicleId }` or `{ action: 'review', reason }`.
6. `book`: call the shared helper `bookInvoiceAsExpenses()` (below) with
   the line items grouped per category (the scanner's default grouping),
   then write the item as `booked` with `vehicle_id` and `expense_ids`.
   A booking error → item `review`, reason `parse_failed`, error stored.
7. `review`: write the item with the reason and the parsed invoice.
8. Notify staff through `notifyStaffOfPortalEvent`-style helper
   `notifyInvoiceInbox()` (in-app `custom_notifications` row of type
   `invoice_inbox`, icon `Receipt`, plus the socket broadcast). Titles:
   "Factuur van {vendor} geboekt op {plate}" / "Factuur van {vendor} wacht
   op controle ({reason in Dutch})". Skipped attachments do not notify.

`server/services/expenses/book-invoice.ts` — `bookInvoiceAsExpenses({
invoice, vehicleId, lineItems, receiptPath, inboxItemId?, createdBy })`:
validates each line against `insertExpenseSchema`, creates one expense per
line (`category`, `amount`, `date = invoiceDate`, `description =
"{description} (Factuur {invoiceNumber}, {vendor})"`, receipt file fields
from the stored attachment, `inboxItemId`), and returns the created
expenses. The existing `POST /api/expenses/from-invoice` route calls this
helper too and refuses with 409 when the invoice hash is already `booked`
(the client shows "Deze factuur is al geboekt" with a link to the item).

The manual scan keeps its current UI; the only visible change is the real
duplicate check.

## Poller

`server/services/invoice-inbox/poller.ts` — `runInvoiceInboxImport(trigger,
createdBy = 'scheduler')`: connect, list unseen messages in `inboxFolder`,
for each: fetch → `importInvoiceMail` → move to `processedFolder` (or mark
seen when empty). Move only when every attachment of the mail ended as
`booked`, `review` or `skipped`; a mail whose import threw stays unseen and
is retried next run. Returns `{ startedAt, finishedAt, trigger, mails,
attachments, booked, review, skipped, failed, errors[] }`. A mutex shares
one run between overlapping calls. `startInvoiceInboxScheduler()` (called
from `server/index.ts`, stopped on shutdown like the other schedulers)
reads the config and, when `enabled`, schedules `*/<pollMinutes> * * * *`
with node-cron; `PUT` of the config restarts it. A connection error writes
no item; it is kept in memory as `lastRun` and, after three consecutive
failed runs, one in-app notification "Postvak facturen onbereikbaar" is
written (reset when a run succeeds).

## Routes (`server/routes/expense-inbox.ts`, prefix `/api/expenses/inbox`)

Permission `manage_expenses` unless stated.

| route | does |
| --- | --- |
| `GET /config` (`manage_settings`) | masked config |
| `PUT /config` (`manage_settings`) | validate, save, restart scheduler |
| `POST /config/test` (`manage_settings`) | connect, return `{ ok, unseen }` |
| `POST /run` | run now; returns the run summary |
| `GET /status` | `{ running, lastRun, scheduledMinutes, reviewCount }` |
| `GET /items?status=review\|booked\|dismissed\|failed&limit=&offset=` | list, newest first, with vehicle plate when linked |
| `GET /items/:id` | one item with `parsed` |
| `GET /items/:id/file` | the attachment (same path resolution and content-type checks as the receipt route) |
| `POST /items/:id/book` | body `{ vehicleId, lineItems }`; books through the helper, sets `booked`, records `created_by`; 409 if not `review` |
| `POST /items/:id/dismiss` | body `{ note? }`; sets `dismissed`; 409 if not `review` |

Registered from `server/routes.ts` next to the expense routes. Item ids are
validated as integers; the file route refuses paths outside
`uploads/invoice-inbox/`.

## Staff UI

Expenses page (`client/src/pages/expenses/index.tsx`): a card "Ontvangen
facturen" above the expenses table, new component
`client/src/components/expenses/invoice-inbox-card.tsx`:

- Header: badge with the number of items to review, "Nu ophalen" button,
  text "Laatst opgehaald {time}: {n} nieuw" or the last error in red.
- Tabs "Te controleren" (default), "Geboekt", "Afgewezen". Rows: received
  date, sender, vendor, invoice number, total, reason (Dutch label),
  vehicle plate when linked, action buttons.
- "Controleren" opens `invoice-review-dialog.tsx`: the attachment on the
  left (PDF in an iframe, image as `<img>`), on the right the editable line
  table reused from `invoice-scanner.tsx` (extract the table into
  `invoice-line-items-table.tsx` so both use it), a `VehicleSelector`
  pre-filled with the matched or single found plate, and buttons "Boeken"
  and "Afwijzen". Booking invalidates the expenses queries and closes.
- "Geboekt" rows link to the vehicle's expenses; "Afgewezen" rows show the
  note.

Settings: a new block "Facturen per e-mail" in the settings panel
(`client/src/components/settings/settings-panel.tsx`), next to the CJIB
block, as its own component
`client/src/components/expenses/invoice-inbox-config-form.tsx` (modelled on
`fines/cjib-config-form.tsx`), with the fields
from the config, a textarea for the sender list (one per line) and a
"Verbinding testen" button that shows "Verbonden, {n} ongelezen".

All labels through i18next in the `expenses` and `settings` namespaces
(Dutch primary, English secondary), following the existing keys.

## Error handling summary

| failure | result |
| --- | --- |
| IMAP unreachable | run ends with the error in `lastRun`; item table untouched; notification after 3 consecutive failures |
| scanner fails on all models | item `review`, `parse_failed`; mail moved (the file is stored, staff fill in by hand) |
| attachment too big / wrong type | skipped; mail gets `no_attachment` only when nothing else was usable |
| move to `processedFolder` fails | item already stored by hash, so the next run skips it; never booked twice |
| booking throws halfway | expenses already created stay (each is valid on its own); item `review` with the error and the created ids, so staff see what exists |
| `GEMINI_API_KEY` missing | every attachment becomes `parse_failed`; the settings block shows a warning when the key is absent |

## Tests (vitest, `server/__tests__/`)

- `invoice-inbox-decide.test.ts`: every reason in its checked order; the
  book path; tolerance boundary (exactly 1.00 passes, 1.01 fails); future
  date.
- `invoice-inbox-senders.test.ts`: plain address, `@domain`, upper-case,
  `Name <address>`, subdomain not matching a bare domain.
- `invoice-inbox-plates.test.ts`: dashes, spaces, lower-case, plate only in
  a line description, two different plates, same plate written twice.
- `invoice-inbox-importer.test.ts` (fake scanner and fake fleet): duplicate
  attachment skipped, duplicate invoice hash queued, `no_attachment`,
  booking writes expenses with `inbox_item_id` and receipt fields.
- `book-invoice.test.ts`: one expense per line, description format, 409 on
  a booked hash from the manual route.
- `invoice-inbox-poller.test.ts` (fake IMAP client): move only after
  success, retry when import throws, mutex shares one run, scheduler
  expression per interval.
- `expense-inbox-routes.test.ts` (supertest): permissions, masked password
  on GET, book/dismiss state guard (409), file route path containment.
- Client: `invoice-inbox-card.test.tsx` renders the reason labels and the
  review dialog opens with the pre-filled vehicle.

## Dependencies

`imapflow` and `mailparser` added to `dependencies`. Both pure JavaScript,
no native build, so the Docker image needs no change.

## Deployment

1. Create the mailbox `fakturenapp@lamgroep.nl` at the web host; note the
   IMAP host, port 993, and the password. Create the folder `Verwerkt`.
2. `GEMINI_API_KEY` must be set in Coolify (the manual scanner already
   needs it).
3. Deploy; `startup-migration.js` adds the table and the column
   (additive, no downtime).
4. In the app settings fill in the IMAP details, add the maintenance
   company's address and `@lamgroep.nl` to the sender list, press
   "Verbinding testen", switch it on.
5. Ask the maintenance company to add the address as a recipient (CC) on
   every invoice. Forwarding an invoice from a `@lamgroep.nl` mailbox works
   the same way.
