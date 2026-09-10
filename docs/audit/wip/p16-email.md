# Phase 16 — E-mail / SMTP

2026-09-10, tested against `http://localhost:5001` / db `lvs_audit`. Staff admin session (`admin`), portal customer 179 (`portaal-test@example.com`), portal user 30. All SMTP traffic was captured by a purpose-built raw-TCP stub (`docs/audit/wip/scripts/p16-stub.cjs`) with switchable failure modes; the app was pointed at `127.0.0.1:2525` through its own `POST /api/app-settings` (row `email_config`, category `email`). Scripts and outputs live in `docs/audit/wip/scripts/` (`p16-*`). The 10 MB `p16-smtp-log.jsonl` is the full DATA capture; it was grepped selectively, never cat-ed.

This report was written from the evidence produced by an earlier run of every p16 script; the settings were already restored to the start-of-phase snapshot by `p16-z-restore.cjs`, so no test was re-run against the server.

Central code:
- `server/utils/email-service.ts` — config load (`getEmailConfig` :40), pooled transporter (`getTransporter` :246), send (`sendViaSmtp` :272 / `sendEmail` :302), `testSmtpConnection` :207, `clearEmailConfigCache` :316, hard-coded templates :326.
- `server/routes/notifications.ts` — bulk APK/maintenance/custom (`/api/notifications/send` :88), GPS (`/api/notifications/send-gps-activation` :369).
- `server/routes.ts:5219` `POST /api/documents/:id/email`, `:5305` `POST /api/email/send-documents`.
- `server/services/portal-mail.ts` — invite/reset (:128), new-device (:150), e-mail change (:158), fine-linked (:171), maintenance (:192), request reply (:214).
- `server/services/portal-notifications.ts:26` staff notification, `server/services/portal-maintenance-events.ts` maintenance events, `server/routes/app-settings.ts:309` SMTP test route.

---

## Mail path inventory

| Trigger / route | Settings source (purpose → row) | Recipient source | Template / language | Attach | In `email_logs`? | Retry / idempotency |
|---|---|---|---|---|---|---|
| `POST /api/documents/:id/email` (`routes.ts:5273`) | `documents` → `email_documents`, else `email_config` | `recipients` body, comma-split (`routes.ts:5266`) | inline `<p>message</p>` HTML + text; message language = caller's; no i18n | 1 file (contract/damage only) | **No** | **No** |
| `POST /api/email/send-documents` (`routes.ts:5374`) | `documents` | `recipientEmail` body | inline HTML/text | many files | **No** | **No** |
| `POST /api/notifications/send` template=apk (`notifications.ts:301`) | `apk` → `email_apk`, else `email_config` | join vehicles→reservations→customers; auto-picks `emailForMOT`→`email`→`emailGeneral` (:207) | `email-templates-i18n.ts` apk, nl/en by `customer.preferredLanguage` | – | **Yes** (`:338`, one row per call) | No |
| …template=maintenance | `maintenance` → `email_maintenance` | same join | i18n maintenance, nl/en | – | Yes | No |
| …template=custom | `custom` → `email_custom` | same join / `customerIds` | i18n custom wrapper, `{placeholder}` substitution (`:13`) | – | Yes | No |
| `POST /api/notifications/send-gps-activation` (`notifications.ts:432`) | `gps` → `email_gps` | `app_settings.gps_recipient_email` | inline default nl text, `{brand}{model}{licensePlate}{imei}` | – | Yes (`:447`) | No |
| Portal invite / reset (`portal-mail.ts:139`) | `custom` → `email_custom`/`email_config` | `portalUser.email` | `email_templates` `portal_invite`/`portal_password_reset`, nl | – | **No** | **No** (new token each send) |
| Portal new-device (`portal-mail.ts:154`) | `custom` | `portalUser.email` | `portal_new_device`, nl | – | **No** | n/a |
| Portal e-mail change (`portal-mail.ts:166`) | `custom` | **new** address | `portal_email_change`, nl | – | **No** | No |
| Portal fine-linked (`portal-mail.ts:188`) | `custom` | `customer.email`/`emailForInvoices` | `portal_fine_linked`, nl | – | **No** | No |
| Portal maintenance (`portal-mail.ts:207`) | `custom` | `customer.emailForMOT`/`email` | `portal_maintenance`, nl | – | **No** | dedupe by notification tag, mail follows |
| Portal request reply (`portal-mail.ts:225`) | `custom` | `request.submitterEmail` | `portal_request_replied`, nl | – | **No** | No |
| Portal staff notification (`portal-notifications.ts:61`) | `custom` | `portal_config.notificationEmail` | `portal_staff_notification`, nl | – | **No** | No |
| SMTP test (`app-settings.ts:317`) | body only (host/port/user/pass) | none (verify only) | – | – | No | n/a |

All 8 portal paths and both staff document paths are invisible to `email_logs` (only the two `notifications.ts` handlers and the GPS handler write rows). Confirmed empirically: `email_logs` count stayed `10` across every failure case (B4, B8b, B10c, B11c, B12c, B3-fine).

---

## SMTP failure-mode matrix

`sendEmail` returns a plain `boolean`; every caller turns `false` into its own message. The document route maps `false`→HTTP 500; the bulk route always returns HTTP 200 with `{sent,failed}`; portal callers swallow the boolean entirely (mail failure is invisible to the customer’s action).

| Mode (stub) | Path | HTTP + latency | Business state afterwards | User-visible |
|---|---|---|---|---|
| happy `ok` | document | 200, ~40 ms | mail delivered, attachment == disk file byte-for-byte (`attMatchesDisk:true`, 310 858 B) | "Email sent successfully" |
| `auth535` (535) | document (A4) | **500, 25 ms** | nothing sent | generic "Failed to send email…" |
| `rcpt550` (550) | document (A4) | 500, 23 ms | nothing sent | same generic message |
| `tls-required` (530) | document (A4) | 500, 24 ms | nothing sent | same |
| `starttls-only` | document (A4) | 500, 27 ms | client issued STARTTLS, stub dropped → fail | same |
| `drop` (RST at connect) | document (A2/A4) | **NO RESPONSE within 20 000 ms**; nodemailer kept reconnecting (120 connections in 20 s, 180 total) | request thread blocked; late delivery once stub set back to ok | request hangs; browser spinner |
| `silent` (no banner) | document (C1) | **500 after 30 035 ms** (nodemailer greetingTimeout default ~30 s) | nothing sent | 30 s stall then generic error |
| `hang-ehlo` (banner, no EHLO reply) | document (C1) | **NO RESPONSE within 45 000 ms**; socket still open at cap | thread blocked ≥45 s, never returns | indefinite hang |
| `data-hang` (no 250 after DATA) | document (C1) | **NO RESPONSE within 45 000 ms**; message body WAS captured (`msgsCaptured:1`) but no ack | thread blocked; **duplicate risk** — server received the mail but the app treats it as unfinished | indefinite hang |
| `drop-data` (close after DATA) | document (A4) | 500, 20 ms; body captured | one copy captured, app reports failure | generic error (but recipient did get it) |
| missing config (no `email` rows) | document (A6) | 500, 28 ms | nothing | generic error; server log `⚠️ No email settings` |
| invalid host (DNS `.invalid`) | document (A5) | 500, 51 ms | nothing | generic error |
| refused `127.0.0.1:2526` | document (A5) | 500, 8 ms | nothing | generic error |
| unroutable `10.255.255.1` | document (A5) | **NO RESPONSE within 20 000 ms** (2-min connectTimeout default) | thread blocked | indefinite hang |
| non-numeric port `abc` / `0` / `-1` / `99999` | document (A5) | 500, ~20 ms; **row saved to DB unchanged** | nothing sent | generic error |
| empty port `""` | document (A5) | 500 (defaulted to 587, nothing listening) | nothing | generic error |
| `smtpSecure:true`, port 2525 | document (A5) | **200 — mail sent in plaintext** | delivered; the stored `smtpSecure` flag was ignored (see E16-004) | success |
| numeric port `465` (JS number) | document (A5) | 500 | secure derived false (string compare), TLS handshake never happened | generic error |
| invalid sender `fromEmail:"not an address"` | document (A5) | **200 — sent** with `MAIL FROM:<not an address>` | malformed envelope delivered | success (no validation) |
| `fromName` with `"`/CRLF | document (A5) | 200; header `"AUDITP16 X-Inj: 1" <…>` — CRLF stripped by nodemailer, no injected header | delivered | success |
| `auth535` | bulk APK (A8f) | **200** `{sent:0,failed:4}`; `email_logs` row `emails_sent:0, emails_failed:4, failure_reason:"Failed to send to …"` | log written, nothing delivered | UI shows 0 sent / 4 failed |
| `auth535` | portal reply/maintenance/fine/email-change/forgot (B4,B8b,B10c,B11c,B12c) | 200 to the caller | DB state fully committed (reply status=done, token rotated, block created, fine linked, pending_email set); **no mail, no log, no notification of failure** | customer/staff told the action succeeded |

Health probe: `/health` returned **200 in 4–59 ms throughout every hang** (C1 healthDuring, A5 health `[200,200]`). A hung mail send blocks only the request thread that issued it, not the event loop — but it does hold a pooled SMTP socket (see below).

---

## Pool / hang analysis

The pooled transporter (`email-service.ts:253`) is created with `pool:true, maxConnections:2, maxMessages:100` and **no `connectionTimeout`, `greetingTimeout`, or `socketTimeout`** — those are set only on the throwaway `testSmtpConnection` transporter (:219-220), never on the real send path. So the real send path uses nodemailer defaults (~2 min connect, ~30 s greeting, ~10 min socket) and, for `hang-ehlo`/`data-hang`, effectively never returns (both exceeded the 45 s cap with the socket still open — C1 `openSockets:1`).

**C2 — two hung connections block the third and the portal forgot flow.** With `data-hang`, two document sends were fired; both hung and each held one of the pool's 2 connections (`connections:2, openSockets:2`). A third document send issued 1.5 s later — even after the stub was switched back to `ok` — could not get a connection and hung too (`third:"hang (queued behind hung connections)"`). Crucially, an **unrelated portal `POST /api/portal/forgot`** issued while the pool was stuck also hung for the full 15 s cap (C2b `http:"hang", ms:15012`): forgot mail uses `purpose:"custom"`, which resolves to the **same `email_config` row → same `transporterKey` → same 2-connection pool**. So one stuck SMTP server stalls password-reset e-mail for every customer. Sockets are only released when the far side closes: after `stub.dropAll()` the pending sends completed (C2c `connections:4`). The server stayed responsive on `/health` throughout, so this is a mail-subsystem stall, not a full outage — but any user waiting on a mail-bearing request sees an open-ended spinner. **New defect E16-002.**

**C3 — retry duplicates.** During a `drop` outage a user's first send hung; a second ("retry") was issued 3 s later; when the stub returned to `ok` **both** were delivered (`msgsDelivered:2`, two identical `AUDIT-P16 hang` messages). There is no idempotency key or de-dup, so any user re-click during a slow SMTP server produces duplicate mail once the server recovers. Same pattern seen on the happy path: A1 double-click on a document = 2 independent sends; A8g bulk double-click = 8 messages. **New defect E16-003.**

**C4 — bulk maintenance with a silent SMTP: "NO RESPONSE within 40 s" while `email_logs` says `emails_sent:1`.** `notifications.ts` loops over recipients **sequentially** (`for … await sendEmail`) and inserts its single `email_logs` row **only after the whole loop finishes** (`:338`). With a `silent` server each recipient blocks ~30 s on greetingTimeout, so a 3-vehicle send (which fans out to more than 3 recipients — see C5) never returns within the 40 s cap and the handler never reaches the `email_logs.insert`. The `emails_sent:1` the script read is therefore **a stale pre-existing row** (`select … order by id desc limit 1` returned the most recent earlier row, most plausibly the GPS row id 9 `emails_sent:1` from A8), **not C4's own** — C4 wrote no row at all. Net effect: a hung bulk send leaves no log of its own while an unrelated old row misleads anyone glancing at "last e-mail run". (The exact id of the row read was not captured, so its provenance can only be inferred, not proven; what is certain is that C4's handler was still blocked and had not logged.)

---

## Content verification

| Template | Recipient / sender | Subject | Lang | Placeholders | Attach / links |
|---|---|---|---|---|---|
| document mail (A0) | to = recipients; from = `"AUDIT P16" <audit-p16@…>` | as typed | caller | message → `<p>…</p>` (newlines→`<br>`); `<b>bold</b>` typed by staff **stripped** in text, rendered in html | contract PDF, byte-identical to disk |
| invite (B1) | to = portalUser.email | "Uw account voor het klantenportaal van Lam Groep" | nl | all resolved, no leftovers | link `https://portaal.lamgroep.nl/portaal/activeren?token=<64 hex>`; **token = 256-bit random, only its sha256 stored** (`hashMatches:true`); **72 h expiry** (`expiresInH:70`) |
| reset / forgot (B3a) | to = portalUser.email | "Wachtwoord opnieuw instellen…" | nl | resolved | same link shape, fresh token |
| e-mail change (B8a) | **to = NEW address** | "Bevestig uw nieuwe e-mailadres…" | nl | resolved | `…/portaal/email-bevestigen?token=…`, 72 h |
| new-device (B7) | to = portalUser.email | "Nieuwe aanmelding…" | nl | `{{name}}` leftover when UA contains it; **User-Agent injected raw**: `Browser: AUDIT-P16 <b>bold</b> <a href="https://evil.example">x</a>` rendered as live HTML; IP shown `10..16.2.99` (cosmetic double dot) | attacker-controlled link in a security e-mail |
| staff notification (B9a) | to = `notificationEmail` | "Klantenportaal: E-mailadressen gewijzigd: …" | nl | **portal user's own `fullName` rendered raw**: `<a href="https://evil.example/login">Klik hier…</a>` appears live in the staff e-mail **and** in the in-app `custom_notifications` row | phishing link injected by the customer into staff's mailbox |
| request reply (B10b) | to = submitterEmail | "Reactie op uw aanvraag (overig)" | nl | staff reply rendered raw (`<i>html</i>` live); customer's own `{{name}}` in the quoted text stays literal | `…/portaal/aanvragen/<id>` |
| maintenance (B11b/d) | to = emailForMOT/email | "Onderhoud <plate>: Onderhoud gepland/verplaatst" | nl | resolved, address + opening hours from portal_config | `…/portaal/voertuigen` |
| fine-linked (B3-fine B12b) | to = customer.email | "Bekeuring <plate> van <date>" | nl | resolved; **`€` mangled to `â¬`** — the mail is built with a Latin-1/UTF-8 mismatch on the euro sign; company shown "Klant 179 B..V." (double dot in source data) | `…/portaal/bekeuringen/<id>` |
| staff-side placeholder bug | staff mail (B10a) | — | — | in-app link rendered as `/portal-admin?requestY8` / `request\`0` — the request id is concatenated without a separator/param name (`?request` + a stray char), producing a broken deep-link | broken "Openen in de app" link |

Token hygiene (B2): a second invite/resend **overwrites** the stored hash, so only the last-mailed link works — the earlier link returns `PORTAL_TOKEN_INVALID` (single valid token at a time, `distinctTokens:2, storedTokenIsMail:1`). Activation is **single-use** (reuse → `PORTAL_TOKEN_INVALID`). Expiry is enforced server-side in UTC (B2b `PORTAL_TOKEN_EXPIRED`). `portalBaseUrl` is honoured verbatim, including an empty value (relative link) and arbitrary hosts, but it is **staff-configured, not taken from the Host header** — B6 set `Host: evil.example` and the link still used the stored base, so no Host-header link poisoning.

**C5 — cross-customer APK join (confirmed real).** `GET`/`send` for one vehicle (id 4, plate 14XT104) mails the APK reminder to **four different customers**. The bulk join `vehicles ⟕ reservations ⟕ customers` (`notifications.ts:127-135`) returns **every reservation ever attached to the vehicle** with no filter on status, date, or "current holder", then de-dups nothing. Vehicle 4 had 4 live `booked` reservations for customers 111, 215, 3 and 179; the send produced 4 messages, to `klant3@example.com`, `klant111@example.com`, `klant215@example.com` and `keeslamapk45@gmail.com` (179's MOT address), all subject "APK Herinnering - 14XT104 verloopt binnenkort". So a single vehicle's APK/maintenance/custom reminder is disclosed to every customer with any reservation on that plate — each recipient learns the plate and that "their" vehicle needs an APK, even though only one customer currently holds it. **New defect E16-001.** (The bulk send also opens one envelope per row but reuses the same `to`, producing the duplicated `RCPT TO` lists seen in A8 — cosmetically noisy, functionally one mail per recipient.)

---

## Tested (passed / behaved correctly)

- Happy-path document mail: correct recipient/subject/from, HTML+text alternative, attachment byte-identical to the on-disk PDF (A0).
- Multiple/empty/missing recipients: comma-split works (A2a); empty → clean 400 "Recipients and subject are required" (A2c); unknown/duplicate document ids handled (A3b/e); missing file → 404 "Document file not found on disk" (A3c), partial set skips the missing file (A3d).
- Document-type allow-list (contract/damage only) enforced at both routes.
- Purpose precedence: `email_documents` overrides `email_config` for document mail (A7 `p16-documents@…`), falls back cleanly when deleted (A7b); a junk `category=email` row does not break the fallback.
- Bulk i18n: nl vs en selected by `preferredLanguage` (A8a/d); missing APK date rendered "Unknown" (A8e); `{placeholder}` substitution works, unknown `{unknownPlaceholder}` left literal (A8c).
- Bulk failure bookkeeping: `auth535` → `{sent:0,failed:4}` and an `email_logs` row with `failure_reason` (A8f) — the **one** path that records failures.
- SMTP test route reports success/auth/timeout distinctly and never sends (A10).
- Portal token model: single valid token, single-use, 72 h UTC expiry, sha256-at-rest (B1, B2, B2b).
- Forgot is a uniform 200 for known/unknown/blocked/upper-cased addresses (B3a-d) — no user-enumeration oracle in the response body.
- Idempotent maintenance notifications via dedupe tag; approval/notification still committed when SMTP fails (B11 in `p16-b2`).

## Not tested (why)

- Real TLS / port 465 SSL handshake: the stub cannot speak TLS (STARTTLS → drop), so `smtpSecure:true` over a genuinely encrypted channel was not exercised; the plaintext-path observation stands.
- Actual provider rate-limiting / abuse flagging of the free-recipient relay (BUG-081): out of scope for a local stub.
- The `unroutable 10.255.255.1` and `drop`/`hang-ehlo` cases were capped (20–45 s) rather than run to nodemailer's full ~2 min connectTimeout, to keep the harness moving; the "request hangs indefinitely" conclusion is from the cap being hit with the socket still open.
- Exact provenance of the `email_logs` row read in C4 (see C4 note) — the row id was not captured.
- `POST /api/notifications/send` with `customerIds` (no vehicle) path and `individualEmailSelections` — only the vehicle-driven path was exercised.

---

## Findings summary table

| ID | Sev | Area | One-line |
|---|---|---|---|
| E16-001 | HIGH | Bulk notifications | One vehicle's APK/maintenance/custom reminder is mailed to every customer with any reservation on that plate |
| E16-002 | HIGH | SMTP pool | Pooled transporter has no timeouts + `maxConnections:2`; a slow/hung server blocks the pool and stalls unrelated mail incl. portal password-reset |
| E16-003 | MEDIUM | Idempotency | No de-dup/retry guard: re-click during a slow server delivers duplicate mail; hung bulk send writes no log |
| E16-004 | MEDIUM | Config | `smtpSecure` boolean is ignored — TLS is chosen only when `smtpPort === '465'` (string); saved SSL toggle has no effect; invalid `fromEmail` accepted and sent |
| E16-005 | MEDIUM | Injection | Portal-user-controlled fields (fullName, User-Agent, reply/message) rendered as raw HTML in staff & customer e-mails and in-app notifications — phishing-link injection |
| E16-006 | LOW | Templates | Staff-notification "Openen in de app" deep-link is malformed (`/portal-admin?request` + stray char); fine mail mangles `€`→`â¬` |

Re-confirmed existing: BUG-010, BUG-025, BUG-077, BUG-080, BUG-081, BUG-092, BUG-100, BUG-155.

---

## BUGs

```
BUG E16-001
Severity: HIGH
Feature: Bulk customer notifications (APK / maintenance / custom)
Status: OPEN
Reproduction: p16-c-hang.cjs case C5 (stub mode ok); also visible in p16-a2-staff.cjs A8a where vehicle 1802 fanned out to 4 RCPTs
Expected: An APK/maintenance reminder for a vehicle goes only to the customer who currently holds it (one recipient), not to unrelated customers.
Actual: POST /api/notifications/send {vehicleIds:[4],template:"apk"} → HTTP 200 {sent:4,failed:0}; the stub captured 4 messages, one each to klant3@example.com, klant111@example.com, klant215@example.com and keeslamapk45@gmail.com (customer 179). Vehicle 4 had 4 live "booked" reservations for customers 111,215,3,179; all four were mailed the same "APK Herinnering - 14XT104" e-mail.
Root cause: server/routes/notifications.ts:127-143 — the query left-joins vehicles→reservations→customers with only `inArray(vehicles.id, vehicleIds)` and no filter on reservation status/date/current-holder, and the recipient loop never de-dups by customer. Every historical/future reservation row becomes a recipient.
Affected files: server/routes/notifications.ts
Affected data: customers.email / emailForMOT of every customer ever linked to the vehicle; vehicles.licensePlate + APK status disclosed cross-customer.
Security impact: Cross-customer PII / vehicle-status disclosure. A customer learns that a plate they once (or will) rent needs an APK, plus the implicit customer↔vehicle association.
Business impact: Customers receive reminders for cars they do not currently hold; support noise; GDPR exposure (data minimisation).
Fix (proposal): Restrict the join to the reservation that currently covers "today" (status picked_up / standard, deletedAt null, date range containing now) and de-dup recipients per customer; or drive the send from the current holder only. Do not implement here.
Regression test (proposal): Seed a vehicle with reservations for 3 customers (1 current, 2 past/future); assert send targets exactly the current holder.
```

```
BUG E16-002
Severity: HIGH
Feature: SMTP transporter pool (all outgoing mail)
Status: OPEN
Reproduction: p16-c-hang.cjs C1 (modes hang-ehlo, data-hang), C2 (data-hang two sends + third), C2b (portal forgot while pool stuck); p16-a2-staff.cjs A5 unroutable host
Expected: A slow or non-responsive SMTP server fails a single request within a short bounded timeout and does not affect other mail paths.
Actual: hang-ehlo and data-hang document sends returned NO RESPONSE within 45 000 ms with the socket still open (C1 openSockets:1). With data-hang, two sends held both pool connections (connections:2, openSockets:2) and a third send hung "queued behind hung connections" even after the server recovered. A concurrent portal POST /api/portal/forgot hung for the full 15 000 ms cap (C2b) because it uses purpose "custom" → same email_config row → same transporterKey → same 2-connection pool. /health stayed 200 (4-59 ms) throughout.
Root cause: server/utils/email-service.ts:253-267 getTransporter creates the pooled transporter with pool:true, maxConnections:2, maxMessages:100 but NO connectionTimeout/greetingTimeout/socketTimeout (those exist only on the testSmtpConnection transporter at :219-220). transporterKey (:242) keys only on host:port:user:secure, so every purpose that resolves to the same credentials shares one 2-slot pool.
Affected files: server/utils/email-service.ts
Affected data: none directly; availability of every mail-bearing request (password reset, invites, document mail, bulk).
Security impact: Availability/DoS — a mis-set or slow SMTP host stalls password-reset and invite mail for all customers; request threads hold open sockets indefinitely.
Business impact: Open-ended spinners for staff and customers; password resets silently delayed; hard-to-diagnose "mail is slow" incidents.
Fix (proposal): Set connectionTimeout/greetingTimeout/socketTimeout (e.g. 10 s each) on the pooled transporter; consider a per-purpose pool or a higher maxConnections; fail fast and surface the error. Do not implement here.
Regression test (proposal): Point at a stub that accepts TCP but never greets; assert the send rejects within the configured timeout and a second unrelated send is unaffected.
```

```
BUG E16-003
Severity: MEDIUM
Feature: Mail idempotency / retry & bulk logging
Status: OPEN
Reproduction: p16-c-hang.cjs C3 (retry during outage), C4 (bulk with silent SMTP); p16-a-staff.cjs A1 (double click), p16-a2-staff.cjs A8g (bulk double click)
Expected: A re-submitted send during a slow server does not deliver duplicates; a bulk run records what it did even when it stalls.
Actual: C3 — first send hung under drop, a retry 3 s later, and when the server returned to ok BOTH were delivered (msgsDelivered:2, identical subjects). A1/A8g — double-clicks produced 2 and 8 independent messages. C4 — a silent-server bulk send returned NO RESPONSE within 40 s and, because notifications.ts logs only after the loop finishes, wrote no email_logs row of its own; the row observed (emails_sent:1) was a stale earlier row.
Root cause: No idempotency key or de-dup on any send route; server/routes/notifications.ts:180-347 sends sequentially and inserts the single email_logs row only at :338 after the whole loop; portal/document routes never log at all.
Affected files: server/routes/notifications.ts, server/routes.ts:5219/5305, server/services/portal-mail.ts
Affected data: email_logs completeness; duplicate customer mail.
Security impact: Low; mail spam / confusion.
Business impact: Duplicate reminders and reset e-mails; no audit trail for hung/partial bulk runs.
Fix (proposal): Add a short-lived idempotency guard per (route,payload) and a request-level dedupe; write the email_logs row incrementally / in a finally block. Do not implement here.
Regression test (proposal): Fire two identical sends concurrently; assert one delivery and one log row.
```

```
BUG E16-004
Severity: MEDIUM
Feature: SMTP config interpretation / validation
Status: OPEN
Reproduction: p16-a2-staff.cjs A5 "smtpSecure:true on plain stub" (200, sent plaintext), "numeric port 465 as number" (500), "invalid fromEmail" (200, MAIL FROM:<not an address>)
Expected: The stored smtpSecure flag governs TLS; an invalid sender address is rejected before send.
Actual: With smtpSecure:true and port 2525 the mail was sent in plaintext (200) — the stored boolean was ignored. TLS is enabled only by getEmailConfig computing `smtpSecure: value.smtpPort === '465'` (strict string compare), so a numeric 465, or 465 with the boolean set on a non-465 port, never enables TLS. fromEmail "not an address" was accepted and used verbatim as the envelope MAIL FROM.
Root cause: server/utils/email-service.ts:104 `smtpSecure: value.smtpPort === '465'` ignores value.smtpSecure and only matches the string '465'; :88-95 validate presence but not format of fromEmail/host/port. Settings are persisted with no validation (server/routes/app-settings.ts:333-402 stores value as-is).
Affected files: server/utils/email-service.ts, server/routes/app-settings.ts
Affected data: app_settings email_config; confidentiality of mail in transit.
Security impact: Mail an admin believes is TLS-protected may be sent in cleartext; malformed sender aids spoofing/bounce issues. Compounds BUG-080 (rejectUnauthorized:false).
Business impact: Silent misconfiguration; SSL toggle in Settings has no effect.
Fix (proposal): Honour value.smtpSecure (default port 465 ⇒ secure), validate fromEmail/host/port on save. Do not implement here.
Regression test (proposal): Save smtpSecure:true on port 587; assert the transporter is created with secure:true (or STARTTLS upgrade) and refuses plaintext.
```

```
BUG E16-005
Severity: MEDIUM
Feature: E-mail / in-app notification templating (portal-controlled input)
Status: OPEN
Reproduction: p16-b-portal.cjs B9a (fullName → staff mail + custom_notifications), B7 (User-Agent → new-device mail); B10b (staff reply html)
Expected: User-supplied text is HTML-escaped before being placed in an e-mail body or notification.
Actual: A portal user set fullName to `AUDIT-P16 <a href="https://evil.example/login">Klik hier om uw wachtwoord te vernieuwen</a>`; that markup was rendered live in the staff notification e-mail AND stored raw in custom_notifications.description (B9a inAppNotification). A crafted User-Agent `<b>bold</b> <a href="https://evil.example">x</a>` appeared as a live link in the customer's new-device security e-mail (B7, linkOf → https://evil.example).
Root cause: server/services/portal-mail.ts renderTemplate (:108) does plain `{{var}}` substitution with no escaping; server/services/portal-notifications.ts:61-65 passes the same raw vars to both the e-mail and the stored notification. No output encoding anywhere on the portal mail path.
Affected files: server/services/portal-mail.ts, server/services/portal-notifications.ts
Affected data: staff mailbox content, custom_notifications rows, customer security e-mails.
Security impact: HTML/phishing injection — a customer can plant a "reset your password" link in the e-mail staff receive (and in the staff dashboard notification); an attacker who has a customer's login can seed a misleading link into that customer's own new-device alert. Distinct from BUG-081 (staff-authored document-mail HTML) because the injected content is portal-side, unauthenticated-user-controlled.
Business impact: Social-engineering surface against staff and customers.
Fix (proposal): HTML-escape all interpolated vars in renderTemplate (or switch to a templating engine with auto-escaping) and escape notification descriptions before storage/render. Do not implement here.
Regression test (proposal): Set fullName to `<script>`/`<a>`; assert the delivered mail and the stored notification contain escaped entities.
```

```
BUG E16-006
Severity: LOW
Feature: Staff-notification deep-links and fine-mail encoding
Status: OPEN
Reproduction: p16-b2-portal.cjs B10a/B11a (link `/portal-admin?requestY8`, `/portal-admin?request`0`); p16-b3-fine.cjs B12b (body `â¬ 42.50`)
Expected: A working "Openen in de app" link and a correctly encoded euro sign.
Actual: The staff-notification link is built as `/portal-admin?request` immediately followed by a stray character (the request id is not appended as a readable query param), yielding un-clickable/incorrect deep-links. The fine-linked mail renders `€` as `â¬` (UTF-8 bytes shown as Latin-1).
Root cause: link/template construction for the STAFF event (portal-notifications.ts / caller passing event.link) and a charset mismatch in the fine-mail body assembly (portal-mail.ts:171-188 / transport encoding). Exact link source not pinned in this pass.
Affected files: server/services/portal-notifications.ts, server/services/portal-mail.ts
Affected data: none; cosmetic/usability.
Security impact: None.
Business impact: Broken staff deep-links; unprofessional euro rendering in customer fine e-mails.
Fix (proposal): Build the deep-link with an explicit param (`?request=<id>`); set a UTF-8 charset / encoding on the fine mail. Do not implement here.
Regression test (proposal): Assert the staff link matches `/portal-admin?request=<id>` and the fine body contains `€`.
```

---

## Re-confirmed existing bugs (cite + new evidence only)

- **BUG-010 (GET /api/settings leaks unencrypted SMTP password).** A9: `GET /api/settings` → 200 and the body contains `AUDIT-p16-smtp-secret` (`settingsHasPw:true`); `GET /api/app-settings/email` also returns the cleartext password (`appSettingsEmailPw:["AUDIT-p16-smtp-secret"]`). Nuance: the list endpoint `GET /api/app-settings` redacts it to `""` (`appSettingsPw:""`), so the leak is specifically via `/api/settings` and `/api/app-settings/:category`. `/api/settings` is gated on `MANAGE_BACKUPS` (`server/routes/settings.ts:15`), a different permission than settings management.
- **BUG-025 (settings writes without validation).** A5: ports `abc`/`0`/`-1`/`99999`, a bare string value, and `fromEmail:"not an address"` were all persisted by `POST /api/app-settings` (`app-settings.ts:333`) with no schema check; failures surface only at send time.
- **BUG-077 (SSRF/portscan oracle via SMTP test route).** A10: `POST /api/app-settings/email/test` takes arbitrary host/port from the body (`app-settings.ts:311-323`) and returns distinct outcomes — auth535 → "basic authentication is disabled", non-numeric port → "timed out", drop → "unexpected error", ok → "successful" — a timing/message oracle usable to probe internal hosts.
- **BUG-080 (rejectUnauthorized:false on all outgoing SMTP).** Present on both the pooled send transporter (`email-service.ts:262`) and the test transporter (`:217`); TLS cert validation is disabled globally.
- **BUG-081 (authenticated mail relay: free recipients, unescaped HTML, real attachments).** A0/A2a: staff can send to any comma-separated recipient list with a real contract PDF attached and raw `<p>message</p>` HTML. A2d: a `recipients` value containing `\r\nBcc: y@example.invalid` caused nodemailer to add `y@example.invalid` as an actual envelope RCPT (hidden recipient), though the injected `Subject` CRLF was folded/neutralised.
- **BUG-092 (portal forgot has no effective rate limit).** `server/portal-auth.ts:373` mounts `loginLimiter` on `/api/portal/forgot`, but the limiter is `{max:5, skipSuccessfulRequests:true}` (`server/middleware/security/rateLimiter.ts:28`) and forgot **always** responds 200 `{ok:true}` — so every request counts as "successful" and is skipped, leaving the limiter a no-op. B5 double-click both returned 200; no 429 was observed anywhere in the B series.
- **BUG-100 (fromName raw in a mail header).** A5 "fromName with quote/newline": stored `AUDIT "P16"\r\nX-Inj: 1` was placed into the From header as `"AUDITP16 X-Inj: 1" <…>`; nodemailer stripped the CRLF (so no injected header) but the quotes/content pass through unescaped into the display name (`sendViaSmtp` builds `` `"${config.fromName}" <${config.fromEmail}>` `` at email-service.ts:277).
- **BUG-155 (portal mail never logged / failures invisible).** Confirmed across the whole B series: `email_logs` count stayed `10` after invite, reset, forgot, new-device, e-mail-change, fine-linked, request-reply, maintenance and staff-notification sends, and after every SMTP-535 failure (B4, B8b, B10c, B11c, B12c). Portal callers discard the `sendEmail` boolean, so a customer/staff action returns success (200) with the DB fully committed while no mail went out and nothing is recorded.

---

## Environment restored

`p16-z-restore.cjs` restored `app_settings` (email_config id 7, portal_config id 4) to the start-of-phase snapshot (`p16-original-settings.json`) through the app's own API and removed the temporary AUDIT-P16 settings rows.

Reported result:
- **app_settings identical to snapshot: true**
- Leftovers left in place as AUDIT- data: **portal user 940** (inactive AUDIT-P16 invite account) and **document 327** (fake "Contract (AUDIT-P16 missing file)" row pointing at a non-existent file) — both deliberately left as recognisable AUDIT- fixtures in the disposable clone.

No application code was modified; nothing was committed.
