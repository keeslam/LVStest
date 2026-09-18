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
stored with category **`expenses`**, exposed on `GET/PUT
/api/expenses/inbox/config` (`manage_settings`). The category must not be
`email`: `server/utils/email-service.ts` loads every `email`-category setting
and falls back to "first available", so an inbox row there could be picked
up as an SMTP configuration.

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
| invoice_hash | text | sha256 of `vendor|invoiceNumber|invoiceDate|totalAmount` (vendor reduced to letters and digits, number without whitespace, total in cents); index. **Null when the invoice has no number**: vendor + date + total alone would call two fuel receipts of one day duplicates, so such invoices are never flagged |
| parsed | jsonb | full `ParsedInvoice` from the scanner, plus `plates: string[]` found |
| status | text | `booked`, `review`, `dismissed`. There is no `failed`: whatever goes wrong ends as `review` with a reason, so staff always see it |
| note | text | what staff typed when dismissing |
| review_reason | text | see below; null when `booked` |
| vehicle_id | integer | references vehicles(id) on delete set null; set on booking |
| expense_ids | integer[] | expenses created from this item |
| error_message | text | scanner or booking error |
| received_at | timestamptz | default now() |
| processed_at | timestamptz | set on book / dismiss |
| created_by | text | `scheduler` or the staff username that booked/dismissed |
| updated_by | text | |

Review reasons (`review_reason`), in the order they are checked:

| reason | when |
| --- | --- |
| `no_attachment` | mail has no PDF/JPG/PNG attachment, or all attachments were skipped (over 15 MB, wrong type) |
| `parse_failed` | the scanner threw on every model, or validation of the parsed invoice failed |
| `unknown_sender` | `from_address` matches no entry in `allowedSenders`, **or** the receiving mail server's `Authentication-Results` header says `dmarc=fail` or `spf=fail`. A From address is trivial to forge; a hard fail from our own mail server takes the trust away. Only a fail counts, so a forged "pass" line gains nothing |
| `duplicate` | an item with the same `invoice_hash` already exists with status `booked` or `review` |
| `no_plate` | no license plate found on the invoice |
| `multiple_plates` | more than one distinct plate found |
| `plate_unknown` | exactly one plate, but it is not in the fleet |
| `total_mismatch` | the line sum is not within `totalTolerance` of any of: the total incl. VAT, the stated subtotal excl. VAT, or total minus VAT (garage invoices list lines excl. VAT and the total incl. VAT, so comparing with the total alone would queue nearly every invoice); or `invoiceDate` is unreadable or in the future |

`expenses` gets one nullable column `inbox_item_id integer references
invoice_inbox_items(id) on delete set null`. Existing rows stay null. The
existing `invoice_hash` that the manual scan computes but never stores is
now stored on the item too (the manual scan writes an item with
`message_id = null`, `from_address = null`, status `booked`), so the
duplicate check covers both entry points.

## Reading the mailbox

`server/services/invoice-inbox/imap-client.ts` — thin wrapper over
`imapflow` (new dependency, MIT, maintained by the nodemailer author):
one connection per run, behind a session interface:
`withSession(config, fn)` opens the mailbox and hands `fn` a session with
`listUnseen()` (uid + envelope), `fetchRaw(uid)` (raw source, fetched with
`BODY.PEEK` so a mail that fails to import stays unseen) and
`markProcessed(uid)` (IMAP MOVE to `processedFolder`, which imapflow turns
into COPY + delete on servers without MOVE; marks `\Seen` instead when no
folder is configured or the move fails). TLS certificate validation on. An
`error` listener is attached to the connection, because an unhandled
`error` event would take the server process down. Tests swap the client for
a fake through `setInvoiceImapClient()`. The wrapper itself has no unit
test, like `cjib/ftps-client.ts`; the "Verbinding testen" button is its
test.

Attachments are extracted with `mailparser` (new dependency, MIT). Accepted:
`application/pdf`, `image/jpeg`, `image/png` (also when sent as
`application/octet-stream` with a matching extension), **verified by magic
bytes**, at most 15 MB each, at most 10 per mail. Images under 20 KB
(signatures, logos) are ignored. A file name is reduced to its base name
and a conservative character set (the CJIB importer's rule); the stored
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
   sent with their own mime type; the manual scan route is unchanged). The
   scanner's prompt and response schema are extended with `subtotalAmount`
   (excl. VAT), `vatAmount` and `vehicleInfo.licensePlates` (every plate on
   the invoice), all optional. Then `validateParsedInvoice`. Failure → item
   `review`, reason `parse_failed`, `error_message` set, and whatever was
   read is kept in `parsed`.
4. Collect plates: `vehicleInfo.licensePlate`, every entry of
   `vehicleInfo.licensePlates`, plus every dashed Dutch plate found in
   line-item descriptions (six characters, at least one letter and one
   digit, so dates and article numbers do not count), normalised
   (upper-case, no dashes or spaces). Match against the fleet with the same
   normalisation applied in SQL, because plates are stored both with and
   without dashes.
5. Decide with `decideInvoiceBooking()` (pure function in
   `server/services/invoice-inbox/decide.ts`): returns
   `{ action: 'book', vehicleId }` or `{ action: 'review', reason }`.
6. `book`: call the shared helper `bookInvoiceAsExpenses()` (below) with
   the line items grouped per category (the scanner's default grouping),
   then write the item as `booked` with `vehicle_id` and `expense_ids`.
   The item is first written as `review` (the expenses need its id) and
   upgraded afterwards. No expense at all → it stays `review` with reason
   `parse_failed` and the error. Some lines refused → `booked`, with the
   refused lines named in `error_message` (re-opening it for review would
   invite booking the good lines twice).
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
helper too and refuses with 409 when the same file or the same invoice hash
is already `booked` ("Deze factuur is al geboekt.") or waiting as `review`
("… staat al bij Ontvangen facturen ter controle. Boek hem daar."). The
scanner dialog already shows the server's message in its error toast. The
`filePath` that route receives comes from the client, so it only counts when
it resolves inside `uploads/invoices/` or `uploads/invoice-inbox/` (BUG-060).

The manual scan keeps its current UI. Visible changes: the real duplicate
check, the Dutch description format, and the scanned PDF is now really
attached to the expenses (today Zod strips `receiptFilePath`, so it is lost).

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
reads the config and, when `enabled`, schedules with node-cron the way the
CJIB poller does (`*/<m> * * * *` under an hour, `0 */<h> * * *` above,
`0 0 * * *` for a day); `PUT` of the config restarts it. One run handles at
most 25 mails, because every mail can cost a Gemini call; the rest waits for
the next run. A connection error writes
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
| `GET /items?status=review\|booked\|dismissed&limit=&offset=` | list, newest first, with vehicle plate when linked |
| `GET /items/:id` | one item with `parsed` |
| `GET /items/:id/file` | the attachment (same path resolution and content-type checks as the receipt route) |
| `POST /items/:id/book` | body `{ vehicleId, invoice: { vendor, invoiceNumber, invoiceDate }, lineItems, groupByCategory = true }`; the header fields let staff correct or fill in what the scan got wrong; books through the helper (grouped per category on the server unless switched off), saves the corrections on the item, sets `booked`, records `updated_by`; 409 if not `review` |
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
- "Geboekt" rows show the vehicle plate; "Afgewezen" rows show the note.
  "Bekijken" opens the same dialog read-only (attachment, header, lines).
  There is no per-vehicle expenses page to link to; the expenses table
  below the card is searchable by plate.

Settings: a new block "Facturen per e-mail (inkomend)" in the settings
panel (`client/src/components/settings/settings-panel.tsx`), in the existing
"E-mail" tab (`TabsContent value="email"`) below the SMTP cards, so every
mail setting, outgoing and incoming, is in one place. Not in the
"Klantenportaal" tab where the CJIB block lives. Its own component
`client/src/components/expenses/invoice-inbox-config-form.tsx` (modelled on
`fines/cjib-config-form.tsx`), with the fields
from the config, a textarea for the sender list (one per line) and a
"Verbinding testen" button that shows "Verbonden, {n} ongelezen".

All labels through i18next in the `expenses` namespace, key group
`invoiceInbox` (the settings card included, the way the CJIB card lives in
the `portal` namespace), in both `nl` and `en`.

A live toast: the server broadcasts entity type `invoice-inbox` on every
notification; `client/src/hooks/use-socket.tsx` shows it and refreshes the
`/api/expenses…` queries and the bell.

## Error handling summary

| failure | result |
| --- | --- |
| IMAP unreachable | run ends with the error in `lastRun`; item table untouched; notification after 3 consecutive failures |
| scanner fails on all models | item `review`, `parse_failed`; mail moved (the file is stored, staff fill in by hand) |
| attachment too big / wrong type | skipped; mail gets `no_attachment` only when nothing else was usable |
| move to `processedFolder` fails | item already stored by hash, so the next run skips it; never booked twice |
| some lines refused while booking | the accepted lines are booked; item `booked`, refused lines named in `error_message` and shown in the dialog |
| no line could be booked | item stays `review`, reason `parse_failed`, with the error |
| `GEMINI_API_KEY` missing | every attachment becomes `parse_failed`; the settings block shows a warning when the key is absent |

## Tests (vitest, `server/__tests__/`)

- `invoice-inbox-decide.test.ts`: every reason in its checked order; the
  book path; tolerance boundary (exactly 1.00 passes, 1.01 fails); future
  date.
- `invoice-inbox-senders.test.ts`: plain address, `@domain`, upper-case,
  `Name <address>`, subdomain and look-alike domains not matching a bare
  domain.
- `invoice-inbox-config.test.ts`: category `expenses`, masked password kept
  on re-save, port pair, sender entry format, private host refused.
- `invoice-inbox-storage.test.ts`: unique attachment hash, active-duplicate
  lookup ignores dismissed items, list per status with plate, fleet lookup
  by normalised plate.
- `invoice-scanner-mime.test.ts` (mocked Gemini): mime type passed through,
  VAT split and plate list requested and returned.
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
- Client: `invoice-inbox-card.test.tsx` (reason labels, badge, review
  dialog pre-filled, booking sends only the ticked lines),
  `invoice-inbox-config-form.test.tsx` (Dutch labels, senders one per line,
  connection test), `invoice-line-items-table.test.tsx` (edit, remove keeps
  the selection aligned, select all).

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
