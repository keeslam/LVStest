# Invoice Inbox (facturen per e-mail) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Invoices mailed to `fakturenapp@lamgroep.nl` are read over IMAP, scanned with the existing Gemini invoice scanner, and booked as expenses on the right vehicle automatically when every certainty rule passes; everything else waits in a review list on the Kosten page.

**Architecture:** A new service `server/services/invoice-inbox/` built after the CJIB import pattern (config in `app_settings`, poller with mutex and node-cron, importer, storage module, hash table against duplicates). Booking goes through one shared helper `server/services/expenses/book-invoice.ts`, which the manual scan route uses too, so both entry points share the duplicate check. The client gets a settings form in the E-mail tab and an inbox card with a review dialog on the expenses page.

**Tech Stack:** TypeScript, Express 4, Drizzle ORM on PostgreSQL, node-cron, `imapflow` 2.x (new), `mailparser` 3.x (new), `@google/genai` (existing scanner), React 18 + TanStack Query + shadcn/ui + i18next, vitest + supertest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-18-invoice-inbox-design.md` — read it before starting any task.

## Global Constraints

- Mailbox transport is IMAP only. Allowed ports: **993** (implicit TLS) and **143** (STARTTLS). TLS certificate validation stays on. Every connection first passes `assertPublicHost` from `server/utils/security/outboundGuard.ts`.
- The app setting key is `invoice_inbox_config` and its `category` is **`expenses`**. It must never be `email`: `server/utils/email-service.ts` loads every `email`-category setting and falls back to "first available", so an inbox row there could be picked up as an SMTP config.
- The IMAP password is never returned by the API: `GET` returns `"********"`, and that mask coming back on `PUT` means "keep the stored password".
- Automatic booking requires ALL of: sender on the allowlist and not failing SPF/DMARC, no duplicate, exactly one plate found, that plate matching exactly one vehicle, line sum within `totalTolerance` (default 1.00 euro) of the total incl. VAT or the subtotal excl. VAT, invoice date not in the future. Anything else becomes status `review` with a reason. Nothing is dropped silently.
- Item statuses: `booked`, `review`, `dismissed`. Review reasons, in checked order: `no_attachment`, `parse_failed`, `unknown_sender`, `duplicate`, `no_plate`, `multiple_plates`, `plate_unknown`, `total_mismatch`.
- Accepted attachments: `application/pdf`, `image/jpeg`, `image/png`, verified by magic bytes, at most 15 MB each, at most 10 per mail; images under 20 KB are ignored (signatures, logos). At most 25 mails per run.
- Client-supplied file paths are never trusted (BUG-060). Every stored path is resolved through `resolveDocumentFilePath` and additionally required to sit inside `uploads/invoice-inbox/` or `uploads/invoices/`.
- Production migrations are additive only: DDL in `startup-migration.js` (idempotent helpers) plus `npm run schema:export` so `schema-columns.json` matches `shared/schema.ts` (the drift test `scripts/export-schema.test.ts` fails otherwise).
- Every new route is gated with `hasPermission(...)` — `server/__tests__/fix-i-permission-matrix.test.ts` walks the router and fails on an ungated route. Config routes: `manage_settings`. All other inbox routes: `manage_expenses`.
- Expense categories are stored in English (`Maintenance`, `Tires`, `Brakes`, `Damage`, `Fuel`, `Insurance`, `Registration`, `Cleaning`, `Accessories`, `Other`); only labels are Dutch.
- All UI text goes through i18next, namespace `expenses`, in both `client/src/locales/nl/expenses.json` and `client/src/locales/en/expenses.json`. Dutch is what the client tests assert on.
- Server tests run against the dedicated test database, never the dev database:
  `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lvs_fixtest npx vitest run <file>`
  (PowerShell: `$env:DATABASE_URL='postgresql://postgres:postgres@localhost:5432/lvs_fixtest'; npx vitest run <file>`). Test vehicles use plates starting with `PT` so `cleanupPortalTestData()` removes them.
- Commit messages: Conventional Commits in Dutch, like the existing history (`feat(kosten): …`), ending with
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Work on the current branch `fix/audit-remediation` unless the user says otherwise. Do not push.

## File Structure

| File | Responsibility |
| --- | --- |
| `shared/invoice-inbox.ts` (new) | Config type + defaults, statuses, review reasons + Dutch labels, expense categories, parsed-invoice type, run summary type, sender matching (pure) |
| `shared/schema.ts` (modify) | Table `invoiceInboxItems`, column `expenses.inboxItemId`, omit it from `insertExpenseSchema` |
| `startup-migration.js` (modify) | Idempotent DDL for the table, indexes and the expenses column |
| `schema-columns.json` (regenerate) | Manifest, via `npm run schema:export` |
| `server/services/invoice-inbox/config.ts` (new) | Zod schema, get / mask / save, IMAP target guard |
| `server/services/invoice-inbox/inbox-storage.ts` (new) | All SQL for `invoice_inbox_items` plus fleet lookup by normalised plate |
| `server/services/invoice-inbox/hash.ts` (new) | `sha256`, `computeInvoiceHash` |
| `server/services/invoice-inbox/plates.ts` (new) | `extractPlates` |
| `server/services/invoice-inbox/decide.ts` (new) | `decideInvoiceBooking`, `totalsMatch` (pure) |
| `server/services/invoice-inbox/notify.ts` (new) | In-app notification + socket broadcast |
| `server/services/invoice-inbox/importer.ts` (new) | One raw mail end to end: parse, filter attachments, store, scan, decide, book, notify |
| `server/services/invoice-inbox/imap-client.ts` (new) | Thin `imapflow` wrapper behind a session interface; swapped for a fake in tests |
| `server/services/invoice-inbox/poller.ts` (new) | Run with mutex, run state, scheduler |
| `server/services/expenses/book-invoice.ts` (new) | `bookInvoiceAsExpenses`, `groupLinesByCategory`, receipt containment helper |
| `server/utils/invoice-scanner.ts` (modify) | Optional `mimeType` parameter; extract `subtotalAmount`, `vatAmount`, `vehicleInfo.licensePlates` |
| `server/routes/expense-inbox.ts` (new) | Routes under `/api/expenses/inbox` |
| `server/routes/expenses.ts` (modify) | `/api/expenses/from-invoice` uses the helper and the duplicate check |
| `server/routes.ts`, `server/index.ts` (modify) | Register routes; start and stop the scheduler |
| `client/src/components/expenses/invoice-line-items-table.tsx` (new) | The editable line table, extracted from the scanner |
| `client/src/components/invoice-scanner.tsx` (modify) | Uses the extracted table |
| `client/src/components/expenses/invoice-inbox-config-form.tsx` (new) | Settings card in the E-mail tab |
| `client/src/components/expenses/invoice-inbox-card.tsx` (new) | Card on the Kosten page: tabs, rows, "Nu ophalen" |
| `client/src/components/expenses/invoice-review-dialog.tsx` (new) | Attachment preview, editable lines, vehicle, Boeken / Afwijzen |
| `client/src/components/settings/settings-panel.tsx`, `client/src/pages/expenses/index.tsx`, `client/src/hooks/use-socket.tsx` (modify) | Mount points and live toast |
| `client/src/locales/{nl,en}/expenses.json` (modify) | `invoiceInbox.*` keys |
| `docs/gebruikershandleiding/09-email.md` (modify) | Section 9.9 "Facturen per e-mail ontvangen" |

Tests: `server/__tests__/invoice-inbox-{senders,config,storage,plates,decide,importer,poller}.test.ts`, `server/__tests__/invoice-scanner-mime.test.ts`, `server/__tests__/book-invoice.test.ts`, `server/__tests__/expense-inbox-routes.test.ts`, `server/__tests__/invoice-inbox-helpers.ts` (helper, not a test), `client/src/components/__tests__/invoice-inbox-card.test.tsx`, `client/src/components/__tests__/invoice-inbox-config-form.test.tsx`.

---

### Task 1: Shared types, sender matching and the config service

**Files:**
- Create: `shared/invoice-inbox.ts`
- Create: `server/services/invoice-inbox/config.ts`
- Test: `server/__tests__/invoice-inbox-senders.test.ts`
- Test: `server/__tests__/invoice-inbox-config.test.ts`

**Interfaces:**
- Consumes: `storage.getAppSettingByKey`, `storage.createAppSetting`, `storage.updateAppSetting` (existing); `assertPublicHost`, `OutboundBlockedError` from `server/utils/security/outboundGuard.ts`.
- Produces (from `shared/invoice-inbox.ts`): `INVOICE_INBOX_CONFIG_KEY`, `INVOICE_INBOX_PASSWORD_MASK`, `InvoiceInboxConfig`, `DEFAULT_INVOICE_INBOX_CONFIG`, `INBOX_STATUSES`, `InboxStatus`, `REVIEW_REASONS`, `ReviewReason`, `REVIEW_REASON_LABELS_NL`, `EXPENSE_CATEGORIES`, `InboxLineItem`, `InboxParsedInvoice`, `InvoiceInboxRunSummary`, `normalizeSender(raw: string): string`, `isAllowedSender(from: string, allowed: string[]): boolean`.
- Produces (from `config.ts`): `invoiceInboxConfigSchema`, `getInvoiceInboxConfig(): Promise<InvoiceInboxConfig>`, `maskInvoiceInboxConfig(c): InvoiceInboxConfig`, `saveInvoiceInboxConfig(input: unknown, updatedBy: string): Promise<InvoiceInboxConfig>`, `assertAllowedImapTarget(host: string, port: number): Promise<void>`, `IMAP_ALLOWED_PORTS`.

- [ ] **Step 1: Write the failing sender test**

Create `server/__tests__/invoice-inbox-senders.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalizeSender, isAllowedSender } from "../../shared/invoice-inbox";

describe("invoice inbox sender allowlist", () => {
  it("reduces a From header to a bare lower-case address", () => {
    expect(normalizeSender("Garage Jansen <Facturen@GarageJansen.NL>")).toBe("facturen@garagejansen.nl");
    expect(normalizeSender("  info@garage.nl ")).toBe("info@garage.nl");
    expect(normalizeSender("geen adres")).toBe("");
  });

  it("matches a full address, case-insensitively", () => {
    expect(isAllowedSender("Facturen@Garage.nl", ["facturen@garage.nl"])).toBe(true);
    expect(isAllowedSender("iemand@garage.nl", ["facturen@garage.nl"])).toBe(false);
  });

  it("matches a whole domain written as @domain", () => {
    expect(isAllowedSender("Kees <kees@lamgroep.nl>", ["@lamgroep.nl"])).toBe(true);
    expect(isAllowedSender("kees@lamgroep.nl", ["@LamGroep.nl"])).toBe(true);
  });

  it("does not let a subdomain or a look-alike through on a bare domain", () => {
    expect(isAllowedSender("x@mail.lamgroep.nl", ["@lamgroep.nl"])).toBe(false);
    expect(isAllowedSender("x@evil-lamgroep.nl", ["@lamgroep.nl"])).toBe(false);
    expect(isAllowedSender("x@lamgroep.nl.evil.com", ["@lamgroep.nl"])).toBe(false);
  });

  it("refuses everything when the list is empty or the sender is unreadable", () => {
    expect(isAllowedSender("a@b.nl", [])).toBe(false);
    expect(isAllowedSender("", ["@b.nl"])).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lvs_fixtest npx vitest run server/__tests__/invoice-inbox-senders.test.ts`
Expected: FAIL — cannot resolve `../../shared/invoice-inbox`.

- [ ] **Step 3: Create `shared/invoice-inbox.ts`**

```ts
/**
 * Invoices by e-mail — shared types and pure helpers.
 * Design: docs/superpowers/specs/2026-09-18-invoice-inbox-design.md
 */

export const INVOICE_INBOX_CONFIG_KEY = 'invoice_inbox_config';
/** Shown instead of the stored password; coming back on save it means "keep what is stored". */
export const INVOICE_INBOX_PASSWORD_MASK = '********';

export interface InvoiceInboxConfig {
  /** Scheduler on/off. */
  enabled: boolean;
  host: string;
  /** 993 (implicit TLS) or 143 (STARTTLS). */
  port: number;
  /** true = implicit TLS, false = STARTTLS. */
  secure: boolean;
  username: string;
  password: string;
  inboxFolder: string;
  /** Where a handled mail is moved to; "" = leave it in place and mark it read. */
  processedFolder: string;
  /** 5..1440 */
  pollMinutes: number;
  /** "naam@garage.nl" or "@garage.nl", lower-case. */
  allowedSenders: string[];
  /** Allowed difference in euro between the sum of the lines and the invoice total. */
  totalTolerance: number;
}

export const DEFAULT_INVOICE_INBOX_CONFIG: InvoiceInboxConfig = {
  enabled: false, host: '', port: 993, secure: true, username: '', password: '',
  inboxFolder: 'INBOX', processedFolder: 'Verwerkt', pollMinutes: 15,
  allowedSenders: [], totalTolerance: 1,
};

export const INBOX_STATUSES = ['booked', 'review', 'dismissed'] as const;
export type InboxStatus = typeof INBOX_STATUSES[number];

/** In the order they are checked. */
export const REVIEW_REASONS = [
  'no_attachment', 'parse_failed', 'unknown_sender', 'duplicate',
  'no_plate', 'multiple_plates', 'plate_unknown', 'total_mismatch',
] as const;
export type ReviewReason = typeof REVIEW_REASONS[number];

/** Used in server-written notifications; the client has its own i18n keys. */
export const REVIEW_REASON_LABELS_NL: Record<ReviewReason, string> = {
  no_attachment: 'geen bruikbare bijlage',
  parse_failed: 'uitlezen mislukt',
  unknown_sender: 'onbekende afzender',
  duplicate: 'mogelijk dubbel',
  no_plate: 'geen kenteken gevonden',
  multiple_plates: 'meerdere kentekens',
  plate_unknown: 'kenteken niet in de vloot',
  total_mismatch: 'bedragen kloppen niet',
};

/** Stored values stay English; only labels are translated. */
export const EXPENSE_CATEGORIES = [
  'Maintenance', 'Tires', 'Brakes', 'Damage', 'Fuel',
  'Insurance', 'Registration', 'Cleaning', 'Accessories', 'Other',
] as const;

export interface InboxLineItem {
  description: string;
  amount: number;
  category: string;
  subcategory?: string;
}

/** What the scanner returns, plus `plates` added by the importer. */
export interface InboxParsedInvoice {
  vendor: string;
  invoiceNumber: string;
  invoiceDate: string;
  currency: string;
  totalAmount: number;
  subtotalAmount?: number;
  vatAmount?: number;
  lineItems: InboxLineItem[];
  vehicleInfo?: {
    licensePlate?: string;
    chassisNumber?: string;
    licensePlates?: string[];
  };
  /** Normalised plates found on the invoice (upper-case, no dashes). */
  plates?: string[];
}

export interface InvoiceInboxRunSummary {
  startedAt: string;
  finishedAt: string;
  trigger: 'scheduler' | 'manual';
  mails: number;
  attachments: number;
  booked: number;
  review: number;
  skipped: number;
  failed: number;
  errors: string[];
}

/** "Naam <A@B.nl>" -> "a@b.nl"; anything without an @ -> "". */
export function normalizeSender(raw: string): string {
  const text = String(raw ?? '');
  const open = text.lastIndexOf('<');
  const close = text.lastIndexOf('>');
  const address = (open !== -1 && close > open ? text.slice(open + 1, close) : text).trim().toLowerCase();
  return address.includes('@') && !/\s/.test(address) ? address : '';
}

/** An entry is a full address, or "@domain" for every address at exactly that domain. */
export function isAllowedSender(from: string, allowed: string[]): boolean {
  const address = normalizeSender(from);
  if (!address) return false;
  const domain = address.slice(address.lastIndexOf('@'));
  return allowed.some((entry) => {
    const e = String(entry ?? '').trim().toLowerCase();
    if (!e) return false;
    return e.startsWith('@') ? domain === e : address === e;
  });
}
```

- [ ] **Step 4: Run the sender test**

Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lvs_fixtest npx vitest run server/__tests__/invoice-inbox-senders.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the failing config test**

Create `server/__tests__/invoice-inbox-config.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { storage } from "../storage";
import { INVOICE_INBOX_CONFIG_KEY, INVOICE_INBOX_PASSWORD_MASK, DEFAULT_INVOICE_INBOX_CONFIG } from "../../shared/invoice-inbox";
import {
  getInvoiceInboxConfig, saveInvoiceInboxConfig, maskInvoiceInboxConfig,
  invoiceInboxConfigSchema, assertAllowedImapTarget,
} from "../services/invoice-inbox/config";
import { OutboundBlockedError } from "../utils/security/outboundGuard";

describe("invoice inbox config", () => {
  let previous: unknown;

  beforeAll(async () => {
    previous = (await storage.getAppSettingByKey(INVOICE_INBOX_CONFIG_KEY))?.value;
  });
  afterAll(async () => {
    await saveInvoiceInboxConfig(previous ?? { ...DEFAULT_INVOICE_INBOX_CONFIG }, "test");
  });

  it("stores the config under the expenses category, never under email", async () => {
    await saveInvoiceInboxConfig({ host: "imap.example.test", username: "fakturenapp@lamgroep.nl", password: "geheim", allowedSenders: ["@Garage.nl", "kees@lamgroep.nl", "@garage.nl"] }, "test");
    const row = await storage.getAppSettingByKey(INVOICE_INBOX_CONFIG_KEY);
    expect(row?.category).toBe("expenses");
    const config = await getInvoiceInboxConfig();
    expect(config).toMatchObject({ host: "imap.example.test", port: 993, secure: true, inboxFolder: "INBOX", processedFolder: "Verwerkt", pollMinutes: 15, totalTolerance: 1 });
    // lower-cased and de-duplicated
    expect(config.allowedSenders).toEqual(["@garage.nl", "kees@lamgroep.nl"]);
  });

  it("masks the password and keeps the stored one when the mask comes back", async () => {
    const masked = maskInvoiceInboxConfig(await getInvoiceInboxConfig());
    expect(masked.password).toBe(INVOICE_INBOX_PASSWORD_MASK);
    await saveInvoiceInboxConfig({ ...masked, pollMinutes: 30 }, "test");
    const after = await getInvoiceInboxConfig();
    expect(after.password).toBe("geheim");
    expect(after.pollMinutes).toBe(30);
    expect(maskInvoiceInboxConfig({ ...after, password: "" }).password).toBe("");
  });

  it("refuses other ports, bad sender entries and out-of-range intervals", () => {
    expect(invoiceInboxConfigSchema.safeParse({ port: 25 }).success).toBe(false);
    expect(invoiceInboxConfigSchema.safeParse({ port: 143, secure: false }).success).toBe(true);
    expect(invoiceInboxConfigSchema.safeParse({ allowedSenders: ["garage.nl"] }).success).toBe(false);
    expect(invoiceInboxConfigSchema.safeParse({ allowedSenders: ["naam <a@b.nl>"] }).success).toBe(false);
    expect(invoiceInboxConfigSchema.safeParse({ pollMinutes: 1 }).success).toBe(false);
    expect(invoiceInboxConfigSchema.safeParse({ totalTolerance: -1 }).success).toBe(false);
  });

  it("blocks a port outside the IMAP pair and a private host before any connection", async () => {
    await expect(assertAllowedImapTarget("imap.example.test", 6379)).rejects.toBeInstanceOf(OutboundBlockedError);
    await expect(assertAllowedImapTarget("127.0.0.1", 993)).rejects.toBeInstanceOf(OutboundBlockedError);
  });
});
```

- [ ] **Step 6: Run it to see it fail**

Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lvs_fixtest npx vitest run server/__tests__/invoice-inbox-config.test.ts`
Expected: FAIL — cannot resolve `../services/invoice-inbox/config`.

- [ ] **Step 7: Create `server/services/invoice-inbox/config.ts`**

```ts
import { z } from "zod";
import { storage } from "../../storage";
import {
  INVOICE_INBOX_CONFIG_KEY, INVOICE_INBOX_PASSWORD_MASK, DEFAULT_INVOICE_INBOX_CONFIG,
  type InvoiceInboxConfig,
} from "../../../shared/invoice-inbox";
import { assertPublicHost, OutboundBlockedError } from "../../utils/security/outboundGuard";

/** 993 = implicit TLS, 143 = STARTTLS. Nothing else, or "test connection" becomes a port scanner (cf. BUG-071). */
export const IMAP_ALLOWED_PORTS = [993, 143];

const SENDER_PATTERN = /^(@[a-z0-9-]+(\.[a-z0-9-]+)+|[^\s@<>]+@[a-z0-9-]+(\.[a-z0-9-]+)+)$/;

export const invoiceInboxConfigSchema = z.object({
  enabled: z.boolean().default(false),
  host: z.string().trim().max(200).default(""),
  port: z.coerce.number().int()
    .refine((p) => IMAP_ALLOWED_PORTS.includes(p), "Alleen poort 993 (TLS) of 143 (STARTTLS) is toegestaan")
    .default(993),
  secure: z.boolean().default(true),
  username: z.string().trim().max(320).default(""),
  password: z.string().max(500).default(""),
  inboxFolder: z.string().trim().min(1).max(200).default("INBOX"),
  processedFolder: z.string().trim().max(200).default("Verwerkt"),
  pollMinutes: z.coerce.number().int().min(5).max(1440).default(15),
  allowedSenders: z.array(
    z.string().trim().toLowerCase().max(320)
      .regex(SENDER_PATTERN, "Ongeldige afzender: gebruik naam@domein.nl of @domein.nl"),
  ).max(200).default([]).transform((list) => Array.from(new Set(list))),
  totalTolerance: z.coerce.number().min(0).max(100).default(1),
});

export async function getInvoiceInboxConfig(): Promise<InvoiceInboxConfig> {
  try {
    const row = await storage.getAppSettingByKey(INVOICE_INBOX_CONFIG_KEY);
    const parsed = invoiceInboxConfigSchema.safeParse(row?.value ?? {});
    return parsed.success ? { ...DEFAULT_INVOICE_INBOX_CONFIG, ...parsed.data } : DEFAULT_INVOICE_INBOX_CONFIG;
  } catch (error) {
    console.warn("invoice_inbox_config could not be read, using defaults:", error);
    return DEFAULT_INVOICE_INBOX_CONFIG;
  }
}

/** What the UI may see: never the stored password. */
export function maskInvoiceInboxConfig(c: InvoiceInboxConfig): InvoiceInboxConfig {
  return { ...c, password: c.password ? INVOICE_INBOX_PASSWORD_MASK : "" };
}

/** The masked password coming back from the form means "keep what is stored". */
export async function saveInvoiceInboxConfig(input: unknown, updatedBy: string): Promise<InvoiceInboxConfig> {
  const current = await getInvoiceInboxConfig();
  const value = invoiceInboxConfigSchema.parse(input);
  if (value.password === INVOICE_INBOX_PASSWORD_MASK) value.password = current.password;
  const existing = await storage.getAppSettingByKey(INVOICE_INBOX_CONFIG_KEY);
  if (existing) await storage.updateAppSetting(existing.id, { value, updatedBy });
  else {
    // Category "expenses" on purpose: email-service.ts reads every "email"
    // setting and falls back to the first one it finds as an SMTP config.
    await storage.createAppSetting({
      key: INVOICE_INBOX_CONFIG_KEY, value, category: "expenses",
      description: "Facturen per e-mail: IMAP-postvak dat de app uitleest", createdBy: updatedBy, updatedBy,
    });
  }
  return value;
}

/** Throws OutboundBlockedError — one generic message, no oracle — when refused. */
export async function assertAllowedImapTarget(host: string, port: number): Promise<void> {
  if (!IMAP_ALLOWED_PORTS.includes(Number(port))) throw new OutboundBlockedError();
  await assertPublicHost(String(host ?? "").trim());
}
```

- [ ] **Step 8: Run both tests**

Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lvs_fixtest npx vitest run server/__tests__/invoice-inbox-senders.test.ts server/__tests__/invoice-inbox-config.test.ts`
Expected: PASS, 9 tests. If the private-host assertion fails, the shell has `OUTBOUND_ALLOW_PRIVATE` set (`allowsPrivateOutbound()` in `outboundGuard.ts`); unset it for the test run, do not weaken the assertion.

- [ ] **Step 9: Type check and commit**

Run: `npm run check`
Expected: no new errors.

```bash
git add shared/invoice-inbox.ts server/services/invoice-inbox/config.ts server/__tests__/invoice-inbox-senders.test.ts server/__tests__/invoice-inbox-config.test.ts
git commit -m "feat(kosten): instellingen en afzenderlijst voor facturen per e-mail

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Table `invoice_inbox_items`, column `expenses.inbox_item_id`, storage module

**Files:**
- Modify: `shared/schema.ts` (expenses table near line 1196, `insertExpenseSchema` near line 1222, new table directly after the `insertExpenseSchema` block and before `// Documents table`)
- Modify: `startup-migration.js` (directly after the line `await addColumnIfNotExists('fines', 'import_file_id', 'INTEGER REFERENCES fine_import_files(id) ON DELETE SET NULL');`)
- Regenerate: `schema-columns.json`
- Create: `server/services/invoice-inbox/inbox-storage.ts`
- Create: `server/__tests__/invoice-inbox-helpers.ts`
- Test: `server/__tests__/invoice-inbox-storage.test.ts`

**Interfaces:**
- Consumes: `InboxParsedInvoice` from `shared/invoice-inbox.ts` (Task 1).
- Produces: `invoiceInboxItems` (Drizzle table), `InvoiceInboxItem` (select type), `expenses.inboxItemId`; and
  ```ts
  export type InboxItemWithVehicle = InvoiceInboxItem & { vehiclePlate: string | null };
  export const inboxStorage: {
    getByAttachmentHash(hash: string): Promise<InvoiceInboxItem | undefined>;
    get(id: number): Promise<InvoiceInboxItem | undefined>;
    /** A booked or waiting item with this invoice hash; dismissed items do not count. */
    findActiveByInvoiceHash(invoiceHash: string, excludeId?: number): Promise<InvoiceInboxItem | undefined>;
    list(opts: { status: InboxStatus; limit?: number; offset?: number }): Promise<InboxItemWithVehicle[]>;
    countByStatus(status: InboxStatus): Promise<number>;
    create(data: typeof invoiceInboxItems.$inferInsert): Promise<InvoiceInboxItem>;
    update(id: number, patch: Partial<typeof invoiceInboxItems.$inferInsert>): Promise<InvoiceInboxItem | undefined>;
    /** Vehicles whose plate, stripped of dashes and spaces, is one of `plates` (already normalised). */
    findVehiclesByPlates(plates: string[]): Promise<Array<{ id: number; licensePlate: string; brand: string; model: string }>>;
  };
  ```
- Produces (test helper): `cleanupInboxTestData(): Promise<void>`, `INBOX_TEST_ACTOR` (`"__portal_test__inbox"`).

- [ ] **Step 1: Write the failing storage test**

Create `server/__tests__/invoice-inbox-helpers.ts`:

```ts
import fs from "fs";
import { inArray, like } from "drizzle-orm";
import { db } from "../db";
import { expenses, invoiceInboxItems, vehicles } from "../../shared/schema";
import { resolveDocumentFilePath } from "../services/document-paths";
import { storage } from "../storage";
import { TEST_PREFIX } from "./portal-helpers";

/** `created_by` of every inbox item a test writes, so cleanup can find them. */
export const INBOX_TEST_ACTOR = `${TEST_PREFIX}inbox`;

/**
 * Removes what the inbox tests leave behind: items written by the test actor,
 * their stored attachments, the expenses on the `PT…` test vehicles (the
 * expenses table has no foreign key to vehicles, so cleanupPortalTestData()
 * would orphan them) and the notifications that mention the test prefix.
 * Call it BEFORE cleanupPortalTestData(), while the test vehicles still exist.
 */
export async function cleanupInboxTestData(): Promise<void> {
  const testVehicles = await db.select({ id: vehicles.id }).from(vehicles).where(like(vehicles.licensePlate, "PT%"));
  const vehicleIds = testVehicles.map((v) => v.id);
  if (vehicleIds.length) await db.delete(expenses).where(inArray(expenses.vehicleId, vehicleIds));

  const items = await db.select().from(invoiceInboxItems).where(like(invoiceInboxItems.createdBy, `${INBOX_TEST_ACTOR}%`));
  for (const item of items) {
    const abs = item.attachmentPath ? resolveDocumentFilePath(item.attachmentPath) : null;
    if (abs) fs.rmSync(abs, { force: true });
  }
  await db.delete(invoiceInboxItems).where(like(invoiceInboxItems.createdBy, `${INBOX_TEST_ACTOR}%`));

  const notes = await storage.getCustomNotificationsByType("invoice_inbox");
  for (const n of notes) {
    if (n.title.includes(TEST_PREFIX) || n.description.includes(TEST_PREFIX)) await storage.deleteCustomNotification(n.id);
  }
}
```

Create `server/__tests__/invoice-inbox-storage.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { inboxStorage } from "../services/invoice-inbox/inbox-storage";
import { createTestVehicle, cleanupPortalTestData } from "./portal-helpers";
import { cleanupInboxTestData, INBOX_TEST_ACTOR } from "./invoice-inbox-helpers";

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

describe("invoice inbox storage", () => {
  let vehicleId: number;

  beforeAll(async () => {
    await cleanupInboxTestData();
    await cleanupPortalTestData();
    vehicleId = (await createTestVehicle("PT-IB-01")).id;
    await createTestVehicle("PTIB02");
  });
  afterAll(async () => {
    await cleanupInboxTestData();
    await cleanupPortalTestData();
  });

  it("creates an item with defaults and finds it by attachment hash", async () => {
    const hash = `hash-${unique()}`;
    const item = await inboxStorage.create({ attachmentHash: hash, fromAddress: "a@b.nl", subject: "Factuur", status: "review", reviewReason: "no_plate", createdBy: INBOX_TEST_ACTOR });
    expect(item.id).toBeGreaterThan(0);
    expect(item.expenseIds).toEqual([]);
    expect(item.receivedAt).toBeInstanceOf(Date);
    expect((await inboxStorage.getByAttachmentHash(hash))?.id).toBe(item.id);
    expect((await inboxStorage.get(item.id))?.subject).toBe("Factuur");
  });

  it("refuses a second item with the same attachment hash", async () => {
    const hash = `hash-${unique()}`;
    await inboxStorage.create({ attachmentHash: hash, status: "review", createdBy: INBOX_TEST_ACTOR });
    await expect(inboxStorage.create({ attachmentHash: hash, status: "review", createdBy: INBOX_TEST_ACTOR })).rejects.toThrow();
  });

  it("treats booked and waiting items as active for the duplicate check, dismissed ones not", async () => {
    const invoiceHash = `inv-${unique()}`;
    const dismissed = await inboxStorage.create({ attachmentHash: `hash-${unique()}`, invoiceHash, status: "dismissed", createdBy: INBOX_TEST_ACTOR });
    expect(await inboxStorage.findActiveByInvoiceHash(invoiceHash)).toBeUndefined();
    const waiting = await inboxStorage.create({ attachmentHash: `hash-${unique()}`, invoiceHash, status: "review", createdBy: INBOX_TEST_ACTOR });
    expect((await inboxStorage.findActiveByInvoiceHash(invoiceHash))?.id).toBe(waiting.id);
    expect(await inboxStorage.findActiveByInvoiceHash(invoiceHash, waiting.id)).toBeUndefined();
    expect(dismissed.id).not.toBe(waiting.id);
  });

  it("updates an item and lists it per status with the vehicle plate", async () => {
    const item = await inboxStorage.create({ attachmentHash: `hash-${unique()}`, status: "review", createdBy: INBOX_TEST_ACTOR });
    const before = await inboxStorage.countByStatus("booked");
    const updated = await inboxStorage.update(item.id, { status: "booked", reviewReason: null, vehicleId, expenseIds: [1, 2], processedAt: new Date(), updatedBy: INBOX_TEST_ACTOR });
    expect(updated).toMatchObject({ status: "booked", vehicleId, expenseIds: [1, 2] });
    expect(await inboxStorage.countByStatus("booked")).toBe(before + 1);
    const listed = (await inboxStorage.list({ status: "booked", limit: 200 })).find((i) => i.id === item.id);
    expect(listed?.vehiclePlate).toBe("PT-IB-01");
  });

  it("finds fleet vehicles by normalised plate, whatever way the plate is stored", async () => {
    const found = await inboxStorage.findVehiclesByPlates(["PTIB01", "PTIB02", "ZZ999Z"]);
    expect(found.map((v) => v.licensePlate).sort()).toEqual(["PT-IB-01", "PTIB02"]);
    expect(await inboxStorage.findVehiclesByPlates([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lvs_fixtest npx vitest run server/__tests__/invoice-inbox-storage.test.ts`
Expected: FAIL — `invoiceInboxItems` is not exported from `shared/schema`.

- [ ] **Step 3: Extend `shared/schema.ts`**

3a. Below the existing `safe-url` import at the top of the file add:

```ts
import type { InboxParsedInvoice } from "./invoice-inbox";
```

3b. In the `expenses` table, after the line `receiptContentType: text("receipt_content_type"), // Stores the file content type`, add:

```ts
  // Invoices by e-mail: the inbox item this expense was booked from. Set by
  // the server only (see the omit list below); null for hand-typed expenses.
  inboxItemId: integer("inbox_item_id").references((): AnyPgColumn => invoiceInboxItems.id, { onDelete: "set null" }),
```

(`AnyPgColumn` is already imported on line 1.)

3c. In `insertExpenseSchema`'s `.omit({ … })` list, after `receiptContentType: true,` add:

```ts
  // Server-set, like the receipt fields: a request body may not attach an
  // expense to an inbox item of its choosing.
  inboxItemId: true,
```

3d. Directly after the closing `});` of `insertExpenseSchema` (before the `// Documents table` comment) add:

```ts
// Invoices by e-mail (docs/superpowers/specs/2026-09-18-invoice-inbox-design.md):
// one row per attachment the inbox has seen, or per manual scan that was booked.
export const invoiceInboxItems = pgTable("invoice_inbox_items", {
  id: serial("id").primaryKey(),
  messageId: text("message_id"),
  fromAddress: text("from_address"),
  subject: text("subject"),
  mailDate: timestamp("mail_date", { withTimezone: true }),
  attachmentName: text("attachment_name"),
  attachmentPath: text("attachment_path"),
  // sha256 of the attachment bytes: an attachment is processed once.
  attachmentHash: text("attachment_hash").notNull().unique(),
  attachmentContentType: text("attachment_content_type"),
  // sha256 of vendor|number|date|total; null when the invoice has no number.
  invoiceHash: text("invoice_hash"),
  parsed: jsonb("parsed").$type<InboxParsedInvoice | null>(),
  status: text("status").notNull().default("review"), // 'booked' | 'review' | 'dismissed'
  reviewReason: text("review_reason"),
  vehicleId: integer("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
  expenseIds: integer("expense_ids").array().notNull().default(sql`'{}'::integer[]`),
  errorMessage: text("error_message"),
  note: text("note"),
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
}, (table) => ({
  messageIdIdx: index("invoice_inbox_items_message_id_idx").on(table.messageId),
  invoiceHashIdx: index("invoice_inbox_items_invoice_hash_idx").on(table.invoiceHash),
  statusIdx: index("invoice_inbox_items_status_idx").on(table.status, table.receivedAt),
}));
export type InvoiceInboxItem = typeof invoiceInboxItems.$inferSelect;
```

- [ ] **Step 4: Add the DDL to `startup-migration.js`**

Directly after the line `await addColumnIfNotExists('fines', 'import_file_id', 'INTEGER REFERENCES fine_import_files(id) ON DELETE SET NULL');` insert:

```js
    // ==================== INVOICE INBOX (facturen per e-mail) ====================
    await createTableIfNotExists('invoice_inbox_items', `
      CREATE TABLE invoice_inbox_items (
        id SERIAL PRIMARY KEY,
        message_id TEXT,
        from_address TEXT,
        subject TEXT,
        mail_date TIMESTAMPTZ,
        attachment_name TEXT,
        attachment_path TEXT,
        attachment_hash TEXT NOT NULL UNIQUE,
        attachment_content_type TEXT,
        invoice_hash TEXT,
        parsed JSONB,
        status TEXT NOT NULL DEFAULT 'review',
        review_reason TEXT,
        vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
        expense_ids INTEGER[] NOT NULL DEFAULT '{}'::integer[],
        error_message TEXT,
        note TEXT,
        received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processed_at TIMESTAMPTZ,
        created_by TEXT,
        updated_by TEXT
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS invoice_inbox_items_message_id_idx ON invoice_inbox_items (message_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS invoice_inbox_items_invoice_hash_idx ON invoice_inbox_items (invoice_hash)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS invoice_inbox_items_status_idx ON invoice_inbox_items (status, received_at)`);
    await addColumnIfNotExists('expenses', 'inbox_item_id', 'INTEGER REFERENCES invoice_inbox_items(id) ON DELETE SET NULL');
```

- [ ] **Step 5: Regenerate the manifest and apply the schema to the test and dev databases**

```bash
npm run schema:export
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lvs_fixtest node startup-migration.js
node -r dotenv/config startup-migration.js
```

Expected: each migration run ends with `✅ Database migration completed successfully!`; `git diff --stat schema-columns.json` shows additions only (the new table and `inbox_item_id`). `startup-migration.js` is additive and idempotent; it runs at every container start in production.

- [ ] **Step 6: Create `server/services/invoice-inbox/inbox-storage.ts`**

```ts
import { and, count, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "../../db";
import { invoiceInboxItems, vehicles, type InvoiceInboxItem } from "../../../shared/schema";
import type { InboxStatus } from "../../../shared/invoice-inbox";

export type InboxItemWithVehicle = InvoiceInboxItem & { vehiclePlate: string | null };

const ACTIVE: InboxStatus[] = ["booked", "review"];

export const inboxStorage = {
  async getByAttachmentHash(hash: string): Promise<InvoiceInboxItem | undefined> {
    const [row] = await db.select().from(invoiceInboxItems).where(eq(invoiceInboxItems.attachmentHash, hash)).limit(1);
    return row;
  },
  async get(id: number): Promise<InvoiceInboxItem | undefined> {
    const [row] = await db.select().from(invoiceInboxItems).where(eq(invoiceInboxItems.id, id));
    return row;
  },
  /** A booked or waiting item with this invoice hash; dismissed items do not count. */
  async findActiveByInvoiceHash(invoiceHash: string, excludeId?: number): Promise<InvoiceInboxItem | undefined> {
    const conditions = [eq(invoiceInboxItems.invoiceHash, invoiceHash), inArray(invoiceInboxItems.status, ACTIVE)];
    if (excludeId !== undefined) conditions.push(ne(invoiceInboxItems.id, excludeId));
    const [row] = await db.select().from(invoiceInboxItems).where(and(...conditions)).orderBy(invoiceInboxItems.id).limit(1);
    return row;
  },
  async list(opts: { status: InboxStatus; limit?: number; offset?: number }): Promise<InboxItemWithVehicle[]> {
    const rows = await db
      .select({ item: invoiceInboxItems, vehiclePlate: vehicles.licensePlate })
      .from(invoiceInboxItems)
      .leftJoin(vehicles, eq(invoiceInboxItems.vehicleId, vehicles.id))
      .where(eq(invoiceInboxItems.status, opts.status))
      .orderBy(desc(invoiceInboxItems.receivedAt), desc(invoiceInboxItems.id))
      .limit(Math.min(Math.max(opts.limit ?? 50, 1), 200))
      .offset(Math.max(opts.offset ?? 0, 0));
    return rows.map((r) => ({ ...r.item, vehiclePlate: r.vehiclePlate ?? null }));
  },
  async countByStatus(status: InboxStatus): Promise<number> {
    const [row] = await db.select({ n: count() }).from(invoiceInboxItems).where(eq(invoiceInboxItems.status, status));
    return Number(row?.n ?? 0);
  },
  async create(data: typeof invoiceInboxItems.$inferInsert): Promise<InvoiceInboxItem> {
    const [row] = await db.insert(invoiceInboxItems).values(data).returning();
    return row;
  },
  async update(id: number, patch: Partial<typeof invoiceInboxItems.$inferInsert>): Promise<InvoiceInboxItem | undefined> {
    const [row] = await db.update(invoiceInboxItems).set(patch).where(eq(invoiceInboxItems.id, id)).returning();
    return row;
  },
  /** Plates are stored with and without dashes across the fleet, so both sides are normalised in SQL. */
  async findVehiclesByPlates(plates: string[]): Promise<Array<{ id: number; licensePlate: string; brand: string; model: string }>> {
    if (plates.length === 0) return [];
    return db
      .select({ id: vehicles.id, licensePlate: vehicles.licensePlate, brand: vehicles.brand, model: vehicles.model })
      .from(vehicles)
      .where(inArray(sql<string>`upper(regexp_replace(${vehicles.licensePlate}, '[^A-Za-z0-9]', '', 'g'))`, plates));
  },
};
```

- [ ] **Step 7: Run the storage test and the drift test**

Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lvs_fixtest npx vitest run server/__tests__/invoice-inbox-storage.test.ts scripts/export-schema.test.ts`
Expected: PASS (5 storage tests; the drift test passes because Step 5 regenerated the manifest).

- [ ] **Step 8: Make sure the expense routes still refuse a client-set `inboxItemId`**

Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lvs_fixtest npx vitest run shared/schema-validation.test.ts`
Expected: PASS (unchanged). Then `npm run check` — expected: no new errors.

- [ ] **Step 9: Commit**

```bash
git add shared/schema.ts startup-migration.js schema-columns.json server/services/invoice-inbox/inbox-storage.ts server/__tests__/invoice-inbox-helpers.ts server/__tests__/invoice-inbox-storage.test.ts
git commit -m "feat(kosten): tabel invoice_inbox_items en koppeling kosten naar factuurmail

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Pure rules — invoice hash, plate extraction, booking decision

**Files:**
- Create: `server/services/invoice-inbox/hash.ts`
- Create: `server/services/invoice-inbox/plates.ts`
- Create: `server/services/invoice-inbox/decide.ts`
- Test: `server/__tests__/invoice-inbox-plates.test.ts`
- Test: `server/__tests__/invoice-inbox-decide.test.ts`

**Interfaces:**
- Consumes: `InboxParsedInvoice`, `ReviewReason` (Task 1); `normalizeLicensePlate` from `shared/fines.ts` (existing: upper-cases and strips dashes and whitespace).
- Produces:
  ```ts
  // hash.ts
  export function sha256(data: Buffer | string): string;
  export function computeInvoiceHash(invoice: { vendor?: string; invoiceNumber?: string; invoiceDate?: string; totalAmount?: number }): string | null;
  // plates.ts
  export function extractPlates(invoice: InboxParsedInvoice): string[];
  // decide.ts
  export interface DecideInput {
    senderAllowed: boolean;
    duplicate: boolean;
    plates: string[];
    fleetMatches: Array<{ id: number; licensePlate: string }>;
    invoice: InboxParsedInvoice;
    tolerance: number;
    /** YYYY-MM-DD, Europe/Amsterdam */
    today: string;
  }
  export type Decision = { action: "book"; vehicleId: number } | { action: "review"; reason: ReviewReason };
  export function totalsMatch(invoice: InboxParsedInvoice, tolerance: number): boolean;
  export function decideInvoiceBooking(input: DecideInput): Decision;
  ```

- [ ] **Step 1: Write the failing plate and hash test**

Create `server/__tests__/invoice-inbox-plates.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { extractPlates } from "../services/invoice-inbox/plates";
import { computeInvoiceHash, sha256 } from "../services/invoice-inbox/hash";
import type { InboxParsedInvoice } from "../../shared/invoice-inbox";

const invoice = (over: Partial<InboxParsedInvoice> = {}): InboxParsedInvoice => ({
  vendor: "Garage Jansen B.V.", invoiceNumber: "2026-0412", invoiceDate: "2026-09-10", currency: "EUR",
  totalAmount: 121, lineItems: [{ description: "Grote beurt", amount: 100, category: "Maintenance" }], ...over,
});

describe("extractPlates", () => {
  it("normalises the plate the scanner named: dashes, spaces, lower case", () => {
    expect(extractPlates(invoice({ vehicleInfo: { licensePlate: "v-123-xb" } }))).toEqual(["V123XB"]);
    expect(extractPlates(invoice({ vehicleInfo: { licensePlate: " 12 abc 3 " } }))).toEqual(["12ABC3"]);
  });

  it("collects every plate the scanner listed, once each", () => {
    expect(extractPlates(invoice({ vehicleInfo: { licensePlate: "V-123-XB", licensePlates: ["V123XB", "GH-456-K"] } }))).toEqual(["V123XB", "GH456K"]);
  });

  it("finds a dashed Dutch plate inside a line description", () => {
    const found = extractPlates(invoice({ lineItems: [{ description: "APK keuring kenteken 12-ABC-3 incl. afmelden", amount: 45, category: "Registration" }] }));
    expect(found).toEqual(["12ABC3"]);
  });

  it("does not mistake dates, article numbers or phone numbers for plates", () => {
    const found = extractPlates(invoice({ lineItems: [
      { description: "Werkzaamheden 12-09-2026, order 45-67-89", amount: 10, category: "Other" },
      { description: "Oliefilter art. OC-1234-X tel 010-123-4567", amount: 10, category: "Maintenance" },
    ] }));
    expect(found).toEqual([]);
  });

  it("ignores values that cannot be a plate", () => {
    expect(extractPlates(invoice({ vehicleInfo: { licensePlate: "onbekend" } }))).toEqual([]);
    expect(extractPlates(invoice({ vehicleInfo: { licensePlate: "" } }))).toEqual([]);
    expect(extractPlates(invoice())).toEqual([]);
  });
});

describe("computeInvoiceHash", () => {
  it("is stable across spelling noise in vendor and number", () => {
    const a = computeInvoiceHash({ vendor: "Garage Jansen B.V.", invoiceNumber: "2026-0412", invoiceDate: "2026-09-10", totalAmount: 121 });
    const b = computeInvoiceHash({ vendor: " garage  jansen BV ", invoiceNumber: " 2026-0412 ", invoiceDate: "2026-09-10", totalAmount: 121.0 });
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("changes with number, date or total", () => {
    const base = { vendor: "G", invoiceNumber: "1", invoiceDate: "2026-09-10", totalAmount: 10 };
    const h = computeInvoiceHash(base);
    expect(computeInvoiceHash({ ...base, invoiceNumber: "2" })).not.toBe(h);
    expect(computeInvoiceHash({ ...base, invoiceDate: "2026-09-11" })).not.toBe(h);
    expect(computeInvoiceHash({ ...base, totalAmount: 10.01 })).not.toBe(h);
  });

  it("is null without an invoice number, so such invoices are never called duplicates", () => {
    expect(computeInvoiceHash({ vendor: "Shell", invoiceNumber: "  ", invoiceDate: "2026-09-10", totalAmount: 60 })).toBeNull();
  });

  it("sha256 hashes bytes and text alike", () => {
    expect(sha256("abc")).toBe(sha256(Buffer.from("abc")));
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lvs_fixtest npx vitest run server/__tests__/invoice-inbox-plates.test.ts`
Expected: FAIL — cannot resolve `../services/invoice-inbox/plates`.

- [ ] **Step 3: Create `hash.ts` and `plates.ts`**

`server/services/invoice-inbox/hash.ts`:

```ts
import crypto from "crypto";

export function sha256(data: Buffer | string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * Identity of an invoice, independent of the file it arrived in. Null when the
 * invoice carries no number: vendor + date + total alone would call two fuel
 * receipts of the same day "duplicates".
 */
export function computeInvoiceHash(invoice: { vendor?: string; invoiceNumber?: string; invoiceDate?: string; totalAmount?: number }): string | null {
  const number = String(invoice.invoiceNumber ?? "").replace(/\s+/g, "").toUpperCase();
  if (!number) return null;
  const vendor = String(invoice.vendor ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const total = (Math.round((Number(invoice.totalAmount) || 0) * 100) / 100).toFixed(2);
  return sha256(`${vendor}|${number}|${String(invoice.invoiceDate ?? "").trim()}|${total}`);
}
```

`server/services/invoice-inbox/plates.ts`:

```ts
import { normalizeLicensePlate } from "../../../shared/fines";
import type { InboxParsedInvoice } from "../../../shared/invoice-inbox";

/** A Dutch plate as printed: three groups of 1-3 characters, dashes between, not part of a longer token. */
const DASHED_PLATE = /(?<![A-Z0-9-])([A-Z0-9]{1,3})-([A-Z0-9]{1,3})-([A-Z0-9]{1,3})(?![A-Z0-9-])/g;

const hasLetterAndDigit = (s: string) => /[A-Z]/.test(s) && /[0-9]/.test(s);

/** What the scanner called a plate: accept 4-8 characters with a letter and a digit. */
function looksLikePlate(normalised: string): boolean {
  return /^[A-Z0-9]{4,8}$/.test(normalised) && hasLetterAndDigit(normalised);
}

/** Found in running text: be strict, six characters with a letter and a digit. */
function looksLikeDutchPlate(normalised: string): boolean {
  return normalised.length === 6 && hasLetterAndDigit(normalised);
}

/** Every distinct plate on the invoice, normalised (upper-case, no dashes or spaces), in order of appearance. */
export function extractPlates(invoice: InboxParsedInvoice): string[] {
  const found: string[] = [];
  const add = (plate: string) => { if (!found.includes(plate)) found.push(plate); };

  const named = [invoice.vehicleInfo?.licensePlate, ...(invoice.vehicleInfo?.licensePlates ?? [])];
  for (const raw of named) {
    if (typeof raw !== "string") continue;
    const normalised = normalizeLicensePlate(raw).replace(/[^A-Z0-9]/g, "");
    if (looksLikePlate(normalised)) add(normalised);
  }

  for (const item of invoice.lineItems ?? []) {
    const text = String(item.description ?? "").toUpperCase();
    for (const match of text.matchAll(DASHED_PLATE)) {
      const normalised = `${match[1]}${match[2]}${match[3]}`;
      if (looksLikeDutchPlate(normalised)) add(normalised);
    }
  }
  return found;
}
```

- [ ] **Step 4: Run the plate and hash test**

Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lvs_fixtest npx vitest run server/__tests__/invoice-inbox-plates.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Write the failing decision test**

Create `server/__tests__/invoice-inbox-decide.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { decideInvoiceBooking, totalsMatch, type DecideInput } from "../services/invoice-inbox/decide";
import type { InboxParsedInvoice } from "../../shared/invoice-inbox";

const invoice = (over: Partial<InboxParsedInvoice> = {}): InboxParsedInvoice => ({
  vendor: "Garage Jansen", invoiceNumber: "2026-0412", invoiceDate: "2026-09-10", currency: "EUR",
  totalAmount: 121, subtotalAmount: 100, vatAmount: 21,
  lineItems: [{ description: "Grote beurt", amount: 80, category: "Maintenance" }, { description: "Remblokken", amount: 20, category: "Brakes" }],
  ...over,
});

const input = (over: Partial<DecideInput> = {}): DecideInput => ({
  senderAllowed: true, duplicate: false, plates: ["V123XB"], fleetMatches: [{ id: 7, licensePlate: "V-123-XB" }],
  invoice: invoice(), tolerance: 1, today: "2026-09-18", ...over,
});

describe("decideInvoiceBooking", () => {
  it("books when every rule passes", () => {
    expect(decideInvoiceBooking(input())).toEqual({ action: "book", vehicleId: 7 });
  });

  it("names the first failing rule, in the documented order", () => {
    const everythingWrong = input({ senderAllowed: false, duplicate: true, plates: [], fleetMatches: [], invoice: invoice({ totalAmount: 999, subtotalAmount: undefined, vatAmount: undefined }) });
    expect(decideInvoiceBooking(everythingWrong)).toEqual({ action: "review", reason: "unknown_sender" });
    expect(decideInvoiceBooking({ ...everythingWrong, senderAllowed: true })).toEqual({ action: "review", reason: "duplicate" });
    expect(decideInvoiceBooking({ ...everythingWrong, senderAllowed: true, duplicate: false })).toEqual({ action: "review", reason: "no_plate" });
  });

  it("queues several plates, and one plate that is not (uniquely) in the fleet", () => {
    expect(decideInvoiceBooking(input({ plates: ["V123XB", "GH456K"], fleetMatches: [{ id: 7, licensePlate: "V-123-XB" }] }))).toEqual({ action: "review", reason: "multiple_plates" });
    expect(decideInvoiceBooking(input({ fleetMatches: [] }))).toEqual({ action: "review", reason: "plate_unknown" });
    expect(decideInvoiceBooking(input({ fleetMatches: [{ id: 7, licensePlate: "V-123-XB" }, { id: 8, licensePlate: "V123XB" }] }))).toEqual({ action: "review", reason: "plate_unknown" });
  });

  it("queues an invoice dated in the future, and books one dated today", () => {
    expect(decideInvoiceBooking(input({ invoice: invoice({ invoiceDate: "2026-09-19" }) }))).toEqual({ action: "review", reason: "total_mismatch" });
    expect(decideInvoiceBooking(input({ invoice: invoice({ invoiceDate: "2026-09-18" }) })).action).toBe("book");
  });

  it("queues an invoice whose date is unreadable", () => {
    expect(decideInvoiceBooking(input({ invoice: invoice({ invoiceDate: "10 september" }) }))).toEqual({ action: "review", reason: "total_mismatch" });
  });
});

describe("totalsMatch", () => {
  it("accepts lines that add up to the subtotal excl. VAT", () => {
    expect(totalsMatch(invoice(), 1)).toBe(true);
  });

  it("accepts lines that add up to the total incl. VAT", () => {
    expect(totalsMatch(invoice({ lineItems: [{ description: "Alles", amount: 121, category: "Maintenance" }] }), 1)).toBe(true);
  });

  it("derives the subtotal from total minus VAT when the scanner gave no subtotal", () => {
    expect(totalsMatch(invoice({ subtotalAmount: undefined }), 1)).toBe(true);
  });

  it("applies the tolerance in cents: exactly 1.00 off passes, 1.01 off fails", () => {
    const lines = (amount: number) => [{ description: "x", amount, category: "Other" }];
    expect(totalsMatch(invoice({ subtotalAmount: undefined, vatAmount: undefined, totalAmount: 100, lineItems: lines(99) }), 1)).toBe(true);
    expect(totalsMatch(invoice({ subtotalAmount: undefined, vatAmount: undefined, totalAmount: 100, lineItems: lines(98.99) }), 1)).toBe(false);
  });

  it("fails without lines", () => {
    expect(totalsMatch(invoice({ lineItems: [] }), 1)).toBe(false);
  });
});
```

- [ ] **Step 6: Run it to see it fail**

Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lvs_fixtest npx vitest run server/__tests__/invoice-inbox-decide.test.ts`
Expected: FAIL — cannot resolve `../services/invoice-inbox/decide`.

- [ ] **Step 7: Create `server/services/invoice-inbox/decide.ts`**

```ts
import type { InboxParsedInvoice, ReviewReason } from "../../../shared/invoice-inbox";

export interface DecideInput {
  /** On the allowlist AND not failing SPF/DMARC. */
  senderAllowed: boolean;
  /** Another booked or waiting item carries the same invoice hash. */
  duplicate: boolean;
  /** Distinct normalised plates found on the invoice. */
  plates: string[];
  /** Fleet vehicles whose plate is one of `plates`. */
  fleetMatches: Array<{ id: number; licensePlate: string }>;
  invoice: InboxParsedInvoice;
  /** Euro. */
  tolerance: number;
  /** YYYY-MM-DD in Europe/Amsterdam. */
  today: string;
}

export type Decision = { action: "book"; vehicleId: number } | { action: "review"; reason: ReviewReason };

const cents = (n: unknown) => Math.round((Number(n) || 0) * 100);

/**
 * Garage invoices list their lines excl. VAT and their total incl. VAT, so the
 * line sum is compared with both: the total, the stated subtotal, and total
 * minus VAT. One of them within the tolerance is enough.
 */
export function totalsMatch(invoice: InboxParsedInvoice, tolerance: number): boolean {
  if (!invoice.lineItems || invoice.lineItems.length === 0) return false;
  const sum = invoice.lineItems.reduce((acc, item) => acc + cents(item.amount), 0);
  const targets = [cents(invoice.totalAmount)];
  if ((invoice.subtotalAmount ?? 0) > 0) targets.push(cents(invoice.subtotalAmount));
  if ((invoice.vatAmount ?? 0) > 0) targets.push(cents(invoice.totalAmount) - cents(invoice.vatAmount));
  return targets.some((target) => Math.abs(sum - target) <= cents(tolerance));
}

/** Book only when every rule passes; otherwise name the first rule that did not. */
export function decideInvoiceBooking(input: DecideInput): Decision {
  const review = (reason: ReviewReason): Decision => ({ action: "review", reason });
  if (!input.senderAllowed) return review("unknown_sender");
  if (input.duplicate) return review("duplicate");
  if (input.plates.length === 0) return review("no_plate");
  if (input.plates.length > 1) return review("multiple_plates");
  if (input.fleetMatches.length !== 1) return review("plate_unknown");
  const date = input.invoice.invoiceDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > input.today) return review("total_mismatch");
  if (!totalsMatch(input.invoice, input.tolerance)) return review("total_mismatch");
  return { action: "book", vehicleId: input.fleetMatches[0].id };
}
```

- [ ] **Step 8: Run both test files**

Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lvs_fixtest npx vitest run server/__tests__/invoice-inbox-plates.test.ts server/__tests__/invoice-inbox-decide.test.ts`
Expected: PASS, 19 tests.

- [ ] **Step 9: Commit**

```bash
git add server/services/invoice-inbox/hash.ts server/services/invoice-inbox/plates.ts server/services/invoice-inbox/decide.ts server/__tests__/invoice-inbox-plates.test.ts server/__tests__/invoice-inbox-decide.test.ts
git commit -m "feat(kosten): beslisregels voor automatisch boeken van facturen (kenteken, dubbel, bedragen)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Scanner — image attachments, VAT amounts, every plate on the invoice

**Files:**
- Modify: `server/utils/invoice-scanner.ts`
- Test: `server/__tests__/invoice-scanner-mime.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `processInvoiceWithAI(filePath: string, mimeType?: string): Promise<ParsedInvoice>` (default `"application/pdf"`, so `server/routes/expenses.ts` keeps working unchanged); `ParsedInvoice` gains `subtotalAmount?: number`, `vatAmount?: number`, `vehicleInfo.licensePlates?: string[]`. `ParsedInvoice` stays structurally assignable to `InboxParsedInvoice`.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/invoice-scanner-mime.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class { models = { generateContent }; constructor(_options: unknown) {} },
}));

import { processInvoiceWithAI } from "../utils/invoice-scanner";

const reply = (body: Record<string, unknown>) => ({ text: JSON.stringify(body) });
const base = {
  vendor: "Garage Jansen", invoiceNumber: "2026-0412", invoiceDate: "2026-09-10", currency: "EUR", totalAmount: 121,
  lineItems: [{ description: "Grote beurt", amount: 100, category: "Maintenance" }],
};

describe("invoice scanner: mime type, VAT and plates", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scanner-"));
  const file = path.join(dir, "factuur.bin");
  let previousKey: string | undefined;

  beforeAll(() => {
    fs.writeFileSync(file, Buffer.from("inhoud"));
    previousKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "test-key";
  });
  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previousKey;
  });
  beforeEach(() => generateContent.mockReset());

  it("sends a PDF mime type by default, as the manual scan always did", async () => {
    generateContent.mockResolvedValue(reply(base));
    await processInvoiceWithAI(file);
    const request = generateContent.mock.calls[0][0];
    expect(request.contents[0].inlineData.mimeType).toBe("application/pdf");
    expect(request.contents[0].inlineData.data).toBe(Buffer.from("inhoud").toString("base64"));
  });

  it("sends the mime type it was given for a photo of an invoice", async () => {
    generateContent.mockResolvedValue(reply(base));
    await processInvoiceWithAI(file, "image/jpeg");
    expect(generateContent.mock.calls[0][0].contents[0].inlineData.mimeType).toBe("image/jpeg");
  });

  it("asks for, and returns, the VAT split and every plate on the invoice", async () => {
    generateContent.mockResolvedValue(reply({ ...base, subtotalAmount: 100, vatAmount: "21.00", vehicleInfo: { licensePlate: "V-123-XB", licensePlates: ["V-123-XB", "", "GH-456-K"] } }));
    const parsed = await processInvoiceWithAI(file);
    expect(parsed.subtotalAmount).toBe(100);
    expect(parsed.vatAmount).toBe(21);
    expect(parsed.vehicleInfo?.licensePlates).toEqual(["V-123-XB", "GH-456-K"]);
    const request = generateContent.mock.calls[0][0];
    expect(request.config.responseSchema.properties).toHaveProperty("subtotalAmount");
    expect(request.config.responseSchema.properties).toHaveProperty("vatAmount");
    expect(request.config.responseSchema.properties.vehicleInfo.properties).toHaveProperty("licensePlates");
    expect(String(request.contents[1])).toContain("licensePlates");
  });

  it("leaves the new fields undefined when the invoice does not state them", async () => {
    generateContent.mockResolvedValue(reply(base));
    const parsed = await processInvoiceWithAI(file);
    expect(parsed.subtotalAmount).toBeUndefined();
    expect(parsed.vatAmount).toBeUndefined();
    expect(parsed.vehicleInfo).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lvs_fixtest npx vitest run server/__tests__/invoice-scanner-mime.test.ts`
Expected: FAIL — the second test gets `application/pdf`, the third gets `undefined` for `subtotalAmount`.

- [ ] **Step 3: Extend `server/utils/invoice-scanner.ts`**

3a. In `export interface ParsedInvoice`, after `totalAmount: number;` add:

```ts
  /** Excl. VAT, when the invoice states it. */
  subtotalAmount?: number;
  /** Total VAT, when the invoice states it. */
  vatAmount?: number;
```

and replace its `vehicleInfo` member with:

```ts
  vehicleInfo?: {
    licensePlate?: string;
    chassisNumber?: string;
    /** Every license plate that appears anywhere on the invoice. */
    licensePlates?: string[];
  };
```

3b. Change the signature:

```ts
export async function processInvoiceWithAI(pdfPath: string, mimeType: string = "application/pdf"): Promise<ParsedInvoice> {
```

3c. In the prompt's JSON example, after the line `"totalAmount": 123.45,` add:

```
  "subtotalAmount": 102.02,
  "vatAmount": 21.43,
```

and replace the example's `vehicleInfo` block with:

```
  "vehicleInfo": {
    "licensePlate": "License plate if mentioned (Dutch format like XX-123-YZ)",
    "chassisNumber": "VIN/chassis number if mentioned",
    "licensePlates": ["EVERY license plate that appears anywhere on the invoice, each one once"]
  }
```

In the `IMPORTANT INSTRUCTIONS` list add these three lines:

```
- totalAmount is the amount to pay INCLUDING VAT (btw); subtotalAmount is the amount EXCLUDING VAT; vatAmount is the VAT itself. Leave subtotalAmount and vatAmount out when the invoice does not state them
- Line item amounts are the amounts as printed on the line (usually excluding VAT)
- licensePlates lists every license plate on the invoice, also when it covers several vehicles; licensePlate is the main one
```

3d. In `responseSchema.properties`, after `totalAmount: { type: "number" },` add:

```ts
            subtotalAmount: { type: "number" },
            vatAmount: { type: "number" },
```

and replace the `vehicleInfo` schema with:

```ts
            vehicleInfo: {
              type: "object",
              properties: {
                licensePlate: { type: "string" },
                chassisNumber: { type: "string" },
                licensePlates: { type: "array", items: { type: "string" } }
              }
            }
```

3e. In the `inlineData` block replace `mimeType: "application/pdf",` with `mimeType,`.

3f. Directly above `const parsedInvoice: ParsedInvoice = {` add:

```ts
    const optionalAmount = (value: unknown): number | undefined => {
      const n = typeof value === "string" ? parseFloat(value.replace(/[€\s]/g, "").replace(",", ".")) : Number(value);
      return Number.isFinite(n) && n > 0 ? n : undefined;
    };
    const listedPlates: string[] = Array.isArray(result.vehicleInfo?.licensePlates)
      ? result.vehicleInfo.licensePlates.filter((p: unknown): p is string => typeof p === "string" && p.trim() !== "")
      : [];
```

In the object literal, after `totalAmount: Number(result.totalAmount) || 0,` add:

```ts
      subtotalAmount: optionalAmount(result.subtotalAmount),
      vatAmount: optionalAmount(result.vatAmount),
```

and replace the `vehicleInfo:` member with:

```ts
      vehicleInfo: result.vehicleInfo ? {
        licensePlate: result.vehicleInfo.licensePlate || undefined,
        chassisNumber: result.vehicleInfo.chassisNumber || undefined,
        licensePlates: listedPlates.length ? listedPlates : undefined
      } : undefined
```

- [ ] **Step 4: Run the test**

Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lvs_fixtest npx vitest run server/__tests__/invoice-scanner-mime.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Type check and commit**

Run: `npm run check`
Expected: no new errors.

```bash
git add server/utils/invoice-scanner.ts server/__tests__/invoice-scanner-mime.test.ts
git commit -m "feat(kosten): factuurscanner leest ook foto's, btw-bedragen en alle kentekens

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Shared booking helper, and the manual scan route gets a real duplicate check

**Files:**
- Create: `server/services/expenses/book-invoice.ts`
- Modify: `server/routes/expenses.ts` (imports at the top; the whole `app.post("/api/expenses/from-invoice", …)` handler near line 562)
- Modify: `server/__tests__/invoice-inbox-helpers.ts` (widen cleanup)
- Test: `server/__tests__/book-invoice.test.ts`

**Interfaces:**
- Consumes: `inboxStorage` (Task 2), `computeInvoiceHash`, `sha256` (Task 3), `insertExpenseSchema`, `storage.createExpense`, `realtimeEvents.expenses.created`, `resolveDocumentFilePath`, `getRelativePath`, `getUploadsDir` (existing).
- Produces:
  ```ts
  export interface BookableLine { description: string; amount: number; category: string }
  export interface InvoiceReceipt { relativePath: string; fileName: string; size: number; contentType: string }
  export interface BookInvoiceInput {
    invoice: { vendor?: string; invoiceNumber?: string; invoiceDate: string };
    vehicleId: number;
    lineItems: BookableLine[];
    receipt?: InvoiceReceipt | null;
    inboxItemId?: number | null;
    createdBy: string;
  }
  export interface BookInvoiceResult { expenses: Expense[]; errors: string[] }
  export function groupLinesByCategory(lines: BookableLine[]): BookableLine[];
  export function invoiceExpenseDescription(line: BookableLine, invoice: { vendor?: string; invoiceNumber?: string }): string;
  export function resolveInvoiceFile(storedPath: string | null | undefined): string | null;
  export function receiptFromStoredPath(storedPath: string | null | undefined, contentType?: string): InvoiceReceipt | null;
  export function bookInvoiceAsExpenses(input: BookInvoiceInput): Promise<BookInvoiceResult>;
  ```
- Behaviour change of `POST /api/expenses/from-invoice`: `409 { message, inboxItemId, status }` when the same file or the same invoice (hash) is already `booked` or `review`; response gains `inboxItemId`; expense descriptions become `"<line> (Factuur <number>, <vendor>)"`; the receipt path is now really stored on the expense (today Zod strips it, so scanned invoices lose their PDF).

- [ ] **Step 1: Widen the test cleanup helper**

The manual route writes inbox items as the logged-in user; `buildStaffTestApp` always logs in as `staff-test`. In `server/__tests__/invoice-inbox-helpers.ts` change the drizzle import to `import { eq, inArray, like, or } from "drizzle-orm";`, add below `INBOX_TEST_ACTOR`:

```ts
/** Items written by the test actor, or through a route by buildStaffTestApp's fixed user. */
const writtenByTests = or(like(invoiceInboxItems.createdBy, `${INBOX_TEST_ACTOR}%`), eq(invoiceInboxItems.createdBy, "staff-test"));
```

and use `writtenByTests` in both places where the helper now has ``like(invoiceInboxItems.createdBy, `${INBOX_TEST_ACTOR}%`)`` (the `select` and the `delete`).

- [ ] **Step 2: Write the failing test**

Create `server/__tests__/book-invoice.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import multer from "multer";
import fs from "fs";
import os from "os";
import path from "path";
import { registerExpenseRoutes } from "../routes/expenses";
import { bookInvoiceAsExpenses, groupLinesByCategory, invoiceExpenseDescription, resolveInvoiceFile, receiptFromStoredPath } from "../services/expenses/book-invoice";
import { inboxStorage } from "../services/invoice-inbox/inbox-storage";
import { getUploadsDir } from "../../shared/paths";
import { UserPermission } from "../../shared/schema";
import { buildStaffTestApp, createTestVehicle, cleanupPortalTestData, TEST_PREFIX } from "./portal-helpers";
import { cleanupInboxTestData, INBOX_TEST_ACTOR } from "./invoice-inbox-helpers";

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

describe("book-invoice helper", () => {
  it("groups lines per category, summing in cents and keeping distinct descriptions", () => {
    const grouped = groupLinesByCategory([
      { description: "Olie", amount: 0.1, category: "Maintenance" },
      { description: "Filter", amount: 0.2, category: "Maintenance" },
      { description: "Olie", amount: 10, category: "Maintenance" },
      { description: "Remblokken", amount: 55.5, category: "Brakes" },
    ]);
    expect(grouped).toEqual([
      { category: "Maintenance", amount: 10.3, description: "Olie • Filter" },
      { category: "Brakes", amount: 55.5, description: "Remblokken" },
    ]);
  });

  it("writes the description the way the cost overview shows it", () => {
    expect(invoiceExpenseDescription({ description: "Grote beurt", amount: 1, category: "Maintenance" }, { vendor: "Garage Jansen", invoiceNumber: "2026-0412" }))
      .toBe("Grote beurt (Factuur 2026-0412, Garage Jansen)");
    expect(invoiceExpenseDescription({ description: "Tanken", amount: 1, category: "Fuel" }, { vendor: "", invoiceNumber: " " }))
      .toBe("Tanken (Factuur onbekend, onbekende leverancier)");
  });

  it("only accepts stored files inside the two invoice folders", () => {
    expect(resolveInvoiceFile("../../.env")).toBeNull();
    expect(resolveInvoiceFile("/etc/passwd")).toBeNull();
    expect(resolveInvoiceFile(null)).toBeNull();
    expect(receiptFromStoredPath("invoices/bestaat-niet.pdf")).toBeNull();
  });
});

describe("booking invoices as expenses", () => {
  const invoicesDir = path.join(getUploadsDir(), "invoices");
  const files: string[] = [];
  let vehicleId: number;
  const app = buildStaffTestApp([UserPermission.MANAGE_EXPENSES], (a) => registerExpenseRoutes(a, { upload: multer({ dest: os.tmpdir() }) } as any));

  const storedPdf = (): string => {
    fs.mkdirSync(invoicesDir, { recursive: true });
    const abs = path.join(invoicesDir, `${TEST_PREFIX}${unique()}.pdf`);
    fs.writeFileSync(abs, `%PDF-1.4\n% ${unique()}\n%%EOF`);
    files.push(abs);
    return path.relative(getUploadsDir(), abs).split(path.sep).join("/");
  };

  beforeAll(async () => {
    await cleanupInboxTestData();
    await cleanupPortalTestData();
    vehicleId = (await createTestVehicle("PT-BK-01")).id;
  });
  afterAll(async () => {
    await cleanupInboxTestData();
    await cleanupPortalTestData();
    for (const f of files) fs.rmSync(f, { force: true });
  });

  it("creates one expense per line with the receipt and the inbox item attached", async () => {
    const item = await inboxStorage.create({ attachmentHash: `hash-${unique()}`, status: "review", createdBy: INBOX_TEST_ACTOR });
    const receipt = receiptFromStoredPath(storedPdf());
    expect(receipt).not.toBeNull();
    const { expenses, errors } = await bookInvoiceAsExpenses({
      invoice: { vendor: `${TEST_PREFIX}Garage`, invoiceNumber: "F-1", invoiceDate: "2026-09-10" },
      vehicleId, receipt, inboxItemId: item.id, createdBy: INBOX_TEST_ACTOR,
      lineItems: [{ description: "Grote beurt", amount: 100, category: "Maintenance" }, { description: "Remblokken", amount: 55.5, category: "Brakes" }],
    });
    expect(errors).toEqual([]);
    expect(expenses).toHaveLength(2);
    expect(expenses[0]).toMatchObject({
      vehicleId, category: "Maintenance", amount: "100", date: "2026-09-10", inboxItemId: item.id,
      description: `Grote beurt (Factuur F-1, ${TEST_PREFIX}Garage)`, receiptFilePath: receipt!.relativePath,
      receiptFile: receipt!.fileName, receiptFileSize: receipt!.size, receiptContentType: "application/pdf", createdBy: INBOX_TEST_ACTOR,
    });
  });

  it("reports a line it could not book and still books the others", async () => {
    const { expenses, errors } = await bookInvoiceAsExpenses({
      invoice: { vendor: `${TEST_PREFIX}Garage`, invoiceNumber: "F-2", invoiceDate: "2026-09-10" }, vehicleId, createdBy: INBOX_TEST_ACTOR,
      lineItems: [{ description: "Goed", amount: 10, category: "Other" }, { description: "Nul", amount: 0, category: "Other" }],
    });
    expect(expenses).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Nul");
  });

  it("manual scan: books through the helper, then refuses the same invoice a second time", async () => {
    const number = `M-${unique()}`;
    const body = {
      invoice: { vendor: `${TEST_PREFIX}Garage`, invoiceNumber: number, invoiceDate: "2026-09-10", totalAmount: 121 },
      vehicleId, filePath: storedPdf(), lineItems: [{ description: "Beurt", amount: 100, category: "Maintenance" }],
    };
    const first = await request(app).post("/api/expenses/from-invoice").send(body);
    expect(first.status).toBe(200);
    expect(first.body.expenses).toHaveLength(1);
    expect(first.body.expenses[0].receiptFilePath).toBe(body.filePath);
    expect(first.body.expenses[0].inboxItemId).toBe(first.body.inboxItemId);
    const item = await inboxStorage.get(first.body.inboxItemId);
    expect(item).toMatchObject({ status: "booked", vehicleId, fromAddress: null, expenseIds: [first.body.expenses[0].id] });

    // Same invoice, scanned again into a different file: refused on the invoice hash.
    const again = await request(app).post("/api/expenses/from-invoice").send({ ...body, filePath: storedPdf() });
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ inboxItemId: first.body.inboxItemId, status: "booked" });
    expect(again.body.message).toMatch(/al geboekt/);
  });

  it("manual scan: a path outside the invoice folders is ignored, never stored", async () => {
    const res = await request(app).post("/api/expenses/from-invoice").send({
      invoice: { vendor: `${TEST_PREFIX}Garage`, invoiceNumber: `M-${unique()}`, invoiceDate: "2026-09-10", totalAmount: 10 },
      vehicleId, filePath: "../../.env", lineItems: [{ description: "Los", amount: 10, category: "Other" }],
    });
    expect(res.status).toBe(200);
    expect(res.body.expenses[0].receiptFilePath).toBeNull();
  });

  it("manual scan: keeps its validation answers", async () => {
    expect((await request(app).post("/api/expenses/from-invoice").send({ vehicleId })).status).toBe(400);
    const unknownVehicle = await request(app).post("/api/expenses/from-invoice").send({
      invoice: { vendor: "x", invoiceNumber: "", invoiceDate: "2026-09-10", totalAmount: 1 }, vehicleId: 99999999,
      lineItems: [{ description: "x", amount: 1, category: "Other" }],
    });
    expect(unknownVehicle.status).toBe(404);
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lvs_fixtest npx vitest run server/__tests__/book-invoice.test.ts`
Expected: FAIL — cannot resolve `../services/expenses/book-invoice`.

- [ ] **Step 4: Create `server/services/expenses/book-invoice.ts`**

```ts
import fs from "fs";
import path from "path";
import { insertExpenseSchema, type Expense, type InsertExpense } from "../../../shared/schema";
import { getUploadsDir } from "../../../shared/paths";
import { storage } from "../../storage";
import { realtimeEvents } from "../../realtime-events";
import { getRelativePath, resolveDocumentFilePath } from "../document-paths";

export interface BookableLine { description: string; amount: number; category: string }
export interface InvoiceReceipt { relativePath: string; fileName: string; size: number; contentType: string }

export interface BookInvoiceInput {
  invoice: { vendor?: string; invoiceNumber?: string; invoiceDate: string };
  vehicleId: number;
  lineItems: BookableLine[];
  receipt?: InvoiceReceipt | null;
  inboxItemId?: number | null;
  createdBy: string;
}
export interface BookInvoiceResult { expenses: Expense[]; errors: string[] }

/** Mailed invoices land in the first folder, manual scans in the second. */
const INVOICE_DIRS = ["invoice-inbox", "invoices"];

/**
 * Absolute path of a stored invoice file, or null. Goes through the one owner
 * of stored paths (BUG-060) and additionally insists on the two invoice
 * folders, because the manual route hands in a path that came from the client.
 */
export function resolveInvoiceFile(storedPath: string | null | undefined): string | null {
  const abs = resolveDocumentFilePath(storedPath);
  if (!abs) return null;
  const uploads = path.resolve(getUploadsDir());
  return INVOICE_DIRS.some((dir) => abs.startsWith(path.join(uploads, dir) + path.sep)) ? abs : null;
}

export function receiptFromStoredPath(storedPath: string | null | undefined, contentType = "application/pdf"): InvoiceReceipt | null {
  const abs = resolveInvoiceFile(storedPath);
  if (!abs) return null;
  return { relativePath: getRelativePath(abs), fileName: path.basename(abs), size: fs.statSync(abs).size, contentType };
}

/** One line per category, the way the scanner dialog groups by default. Sums in cents. */
export function groupLinesByCategory(lines: BookableLine[]): BookableLine[] {
  const groups = new Map<string, { cents: number; descriptions: string[] }>();
  for (const line of lines) {
    const category = line.category || "Other";
    const group = groups.get(category) ?? { cents: 0, descriptions: [] };
    group.cents += Math.round((Number(line.amount) || 0) * 100);
    if (line.description && !group.descriptions.includes(line.description)) group.descriptions.push(line.description);
    groups.set(category, group);
  }
  return Array.from(groups.entries()).map(([category, group]) => ({
    category, amount: group.cents / 100, description: group.descriptions.join(" • ").slice(0, 500),
  }));
}

export function invoiceExpenseDescription(line: BookableLine, invoice: { vendor?: string; invoiceNumber?: string }): string {
  const number = String(invoice.invoiceNumber ?? "").trim() || "onbekend";
  const vendor = String(invoice.vendor ?? "").trim() || "onbekende leverancier";
  return `${line.description} (Factuur ${number}, ${vendor})`;
}

/**
 * The one place an invoice becomes expenses — mail import, review dialog and
 * manual scan all end here. A line that fails validation is reported and does
 * not stop the others.
 */
export async function bookInvoiceAsExpenses(input: BookInvoiceInput): Promise<BookInvoiceResult> {
  const expenses: Expense[] = [];
  const errors: string[] = [];
  for (const line of input.lineItems) {
    try {
      const validated = insertExpenseSchema.parse({
        vehicleId: input.vehicleId,
        category: line.category || "Other",
        amount: line.amount,
        date: input.invoice.invoiceDate,
        description: invoiceExpenseDescription(line, input.invoice),
        createdBy: input.createdBy,
        updatedBy: null,
      });
      // Server-set fields: the insert schema deliberately omits them (BUG-060).
      const serverFields = {
        inboxItemId: input.inboxItemId ?? null,
        receiptFile: input.receipt?.fileName ?? null,
        receiptFilePath: input.receipt?.relativePath ?? null,
        receiptFileSize: input.receipt?.size ?? null,
        receiptContentType: input.receipt?.contentType ?? null,
      };
      const expense = await storage.createExpense({ ...validated, ...serverFields } as InsertExpense);
      realtimeEvents.expenses.created(expense);
      expenses.push(expense);
    } catch (error) {
      errors.push(`${line.description}: ${(error as Error).message}`);
    }
  }
  return { expenses, errors };
}
```

- [ ] **Step 5: Rewrite the `/api/expenses/from-invoice` handler in `server/routes/expenses.ts`**

5a. Add to the imports at the top:

```ts
import crypto from "crypto";
import { bookInvoiceAsExpenses, receiptFromStoredPath, resolveInvoiceFile } from "../services/expenses/book-invoice";
import { inboxStorage } from "../services/invoice-inbox/inbox-storage";
import { computeInvoiceHash, sha256 } from "../services/invoice-inbox/hash";
import type { InboxParsedInvoice } from "../../shared/invoice-inbox";
```

5b. Replace the whole handler — from the comment `// Create expenses from scanned invoice` down to the `});` that closes `app.post("/api/expenses/from-invoice", …)` — with:

```ts
  // Create expenses from scanned invoice
  const fromInvoiceSchema = z.object({
    invoice: z.object({
      vendor: z.string().max(300).optional().default(""),
      invoiceNumber: z.string().max(200).optional().default(""),
      invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      totalAmount: z.coerce.number().min(0).optional().default(0),
    }).passthrough(),
    vehicleId: z.coerce.number().int().positive(),
    filePath: z.string().max(1000).nullable().optional(),
    lineItems: z.array(z.object({
      description: z.string().trim().min(1).max(1000),
      amount: z.coerce.number().positive().max(1000000),
      category: z.string().trim().min(1).max(100),
    })).min(1).max(200),
  });

  app.post("/api/expenses/from-invoice", hasPermission(UserPermission.MANAGE_EXPENSES), async (req: Request, res: Response) => {
    try {
      const parsedBody = fromInvoiceSchema.safeParse(req.body ?? {});
      if (!parsedBody.success) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      const { invoice, vehicleId, filePath, lineItems } = parsedBody.data;
      const invoiceDate = invoice.invoiceDate ?? new Date().toISOString().split('T')[0];

      const vehicle = await storage.getVehicle(vehicleId);
      if (!vehicle) {
        return res.status(404).json({ message: "Vehicle not found" });
      }

      // The path comes from the client: only a file inside the invoice folders counts (BUG-060).
      const receipt = receiptFromStoredPath(filePath);
      const receiptAbsolute = receipt ? resolveInvoiceFile(filePath) : null;
      const attachmentHash = receiptAbsolute ? sha256(fs.readFileSync(receiptAbsolute)) : sha256(`manual:${crypto.randomUUID()}`);
      const invoiceHash = computeInvoiceHash({ ...invoice, invoiceDate });

      // Same file, or same invoice in another file, already booked or waiting for review?
      const sameFile = await inboxStorage.getByAttachmentHash(attachmentHash);
      const sameInvoice = invoiceHash ? await inboxStorage.findActiveByInvoiceHash(invoiceHash) : undefined;
      const clash = [sameFile, sameInvoice].find((i) => i && (i.status === "booked" || i.status === "review"));
      if (clash) {
        return res.status(409).json({
          message: clash.status === "booked"
            ? "Deze factuur is al geboekt."
            : "Deze factuur staat al bij Ontvangen facturen ter controle. Boek hem daar.",
          inboxItemId: clash.id,
          status: clash.status,
        });
      }

      const currentUser = (req as any).user?.username || 'system';
      const parsedForItem = { ...invoice, invoiceDate, currency: (invoice as any).currency ?? "EUR", lineItems } as unknown as InboxParsedInvoice;
      const itemData = {
        attachmentName: receipt?.fileName ?? null, attachmentPath: receipt?.relativePath ?? null,
        attachmentContentType: receipt?.contentType ?? null, invoiceHash, parsed: parsedForItem,
        status: "review", reviewReason: null, vehicleId, errorMessage: null, updatedBy: currentUser,
      };
      // A dismissed item for the same file is taken over instead of violating the unique hash.
      const item = sameFile
        ? (await inboxStorage.update(sameFile.id, itemData))!
        : await inboxStorage.create({ ...itemData, attachmentHash, createdBy: currentUser });

      const booked = await bookInvoiceAsExpenses({
        invoice: { vendor: invoice.vendor, invoiceNumber: invoice.invoiceNumber, invoiceDate },
        vehicleId, lineItems, receipt, inboxItemId: item.id, createdBy: currentUser,
      });

      if (booked.expenses.length === 0) {
        await inboxStorage.update(item.id, { reviewReason: "parse_failed", errorMessage: booked.errors.join("; ").slice(0, 2000) || "Boeken mislukt" });
        return res.status(400).json({ message: "No expenses could be created" });
      }

      await inboxStorage.update(item.id, {
        status: "booked", reviewReason: null, expenseIds: booked.expenses.map((e) => e.id),
        errorMessage: booked.errors.length ? booked.errors.join("; ").slice(0, 2000) : null,
        processedAt: new Date(), updatedBy: currentUser,
      });

      res.json({
        success: true,
        message: `Successfully created ${booked.expenses.length} expense(s)`,
        expenses: booked.expenses,
        inboxItemId: item.id,
        invoice: {
          vendor: invoice.vendor,
          invoiceNumber: invoice.invoiceNumber,
          invoiceDate,
          totalAmount: invoice.totalAmount
        }
      });

    } catch (error) {
      console.error("Error creating expenses from invoice:", error);
      res.status(500).json({
        message: "Failed to create expenses from invoice",
      });
    }
  });
```

The closing `}` of `registerExpenseRoutes` stays where it is. The client needs no change: `apiRequest` throws with the server's `message`, and the scanner's `onError` already shows it in a toast.

- [ ] **Step 6: Run the test**

Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lvs_fixtest npx vitest run server/__tests__/book-invoice.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 7: Run the neighbours that touch expenses and the permission matrix**

Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lvs_fixtest npx vitest run server/__tests__/fix-i-permission-matrix.test.ts shared/schema-validation.test.ts`
Expected: PASS. Then `npm run check` — no new errors.

- [ ] **Step 8: Commit**

```bash
git add server/services/expenses/book-invoice.ts server/routes/expenses.ts server/__tests__/book-invoice.test.ts server/__tests__/invoice-inbox-helpers.ts
git commit -m "feat(kosten): gedeelde boekhelper voor facturen; handmatige scan weigert dubbele factuur en bewaart de bon

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Importer — one mail from raw bytes to booked expenses or a review item

**Files:**
- Modify: `package.json`, `package-lock.json` (`mailparser`, `@types/mailparser`)
- Create: `server/services/invoice-inbox/notify.ts`
- Create: `server/services/invoice-inbox/importer.ts`
- Test: `server/__tests__/invoice-inbox-importer.test.ts`

**Interfaces:**
- Consumes: `processInvoiceWithAI`, `validateParsedInvoice` (Task 4); `bookInvoiceAsExpenses`, `groupLinesByCategory` (Task 5); `inboxStorage` (Task 2); `computeInvoiceHash`, `sha256`, `extractPlates`, `decideInvoiceBooking` (Task 3); `isAllowedSender`, `normalizeSender`, `REVIEW_REASON_LABELS_NL` (Task 1); `storage.createCustomNotification`, `broadcastDataUpdate` (existing).
- Produces:
  ```ts
  // notify.ts
  export interface InvoiceInboxEvent { title: string; description: string; priority?: "normal" | "high" }
  export function notifyInvoiceInbox(event: InvoiceInboxEvent): Promise<void>; // never throws
  // importer.ts
  export type InvoiceScanner = (filePath: string, mimeType: string) => Promise<InboxParsedInvoice>;
  /** Tests swap the Gemini scanner for a fake; null restores the real one. */
  export function setInvoiceScanner(scanner: InvoiceScanner | null): void;
  export interface ImportMailInput { raw: Buffer; config: InvoiceInboxConfig; createdBy: string }
  export interface ImportMailResult { attachments: number; booked: number; review: number; skipped: number }
  export function importInvoiceMail(input: ImportMailInput): Promise<ImportMailResult>;
  ```
- Notification type is `invoice_inbox`; socket broadcast entity type is `invoice-inbox` (Task 10 listens for it).

- [ ] **Step 1: Install the mail parser**

```bash
npm install mailparser@^3.9.0
npm install -D @types/mailparser@^3.4.6
```

Expected: both added to `package.json`; no native build step.

- [ ] **Step 2: Write the failing test**

Create `server/__tests__/invoice-inbox-importer.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import MailComposer from "nodemailer/lib/mail-composer";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { expenses } from "../../shared/schema";
import { DEFAULT_INVOICE_INBOX_CONFIG, type InboxParsedInvoice, type InvoiceInboxConfig } from "../../shared/invoice-inbox";
import { importInvoiceMail, setInvoiceScanner } from "../services/invoice-inbox/importer";
import { inboxStorage } from "../services/invoice-inbox/inbox-storage";
import { sha256 } from "../services/invoice-inbox/hash";
import { resolveDocumentFilePath } from "../services/document-paths";
import { storage } from "../storage";
import { createTestVehicle, cleanupPortalTestData, TEST_PREFIX } from "./portal-helpers";
import { cleanupInboxTestData, INBOX_TEST_ACTOR } from "./invoice-inbox-helpers";

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const pdf = (label: string) => Buffer.from(`%PDF-1.4\n% ${label} ${unique()}\n%%EOF`);
const VENDOR = `${TEST_PREFIX}Garage`;

const config: InvoiceInboxConfig = { ...DEFAULT_INVOICE_INBOX_CONFIG, allowedSenders: ["@garage-test.invalid"], totalTolerance: 1 };

interface MailOptions {
  from?: string;
  messageId?: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
  headers?: Record<string, string>;
}
const buildMail = (o: MailOptions = {}): Promise<Buffer> => new MailComposer({
  from: o.from ?? "Garage Test <facturen@garage-test.invalid>", to: "fakturenapp@lamgroep.nl",
  subject: `${TEST_PREFIX}Factuur`, text: "Zie bijlage", messageId: o.messageId ?? `<${unique()}@garage-test.invalid>`,
  attachments: o.attachments, headers: o.headers,
}).compile().build();

const invoice = (over: Partial<InboxParsedInvoice> = {}): InboxParsedInvoice => ({
  vendor: VENDOR, invoiceNumber: `F-${unique()}`, invoiceDate: "2026-09-10", currency: "EUR",
  totalAmount: 181.5, subtotalAmount: 150, vatAmount: 31.5,
  lineItems: [
    { description: "Grote beurt", amount: 80, category: "Maintenance" },
    { description: "Olie", amount: 20, category: "Maintenance" },
    { description: "Remblokken", amount: 50, category: "Brakes" },
  ],
  vehicleInfo: { licensePlate: "PT-IM-01" }, ...over,
});

describe("invoice inbox importer", () => {
  let vehicleId: number;
  let scanned: InboxParsedInvoice;
  let scannerCalls: Array<{ filePath: string; mimeType: string }>;
  const notifications = async () => (await storage.getCustomNotificationsByType("invoice_inbox")).filter((n) => n.title.includes(TEST_PREFIX));

  beforeAll(async () => {
    await cleanupInboxTestData();
    await cleanupPortalTestData();
    vehicleId = (await createTestVehicle("PT-IM-01")).id;
    await createTestVehicle("PT-IM-02");
  });
  afterAll(async () => {
    setInvoiceScanner(null);
    await cleanupInboxTestData();
    await cleanupPortalTestData();
  });
  beforeEach(() => {
    scanned = invoice();
    scannerCalls = [];
    setInvoiceScanner(async (filePath, mimeType) => { scannerCalls.push({ filePath, mimeType }); return scanned; });
  });

  it("books a trusted invoice with one fleet plate: grouped expenses, stored attachment, notification", async () => {
    const before = (await notifications()).length;
    const attachment = pdf("boek");
    const result = await importInvoiceMail({ raw: await buildMail({ attachments: [{ filename: "Factuur 2026.pdf", content: attachment, contentType: "application/pdf" }] }), config, createdBy: INBOX_TEST_ACTOR });
    expect(result).toEqual({ attachments: 1, booked: 1, review: 0, skipped: 0 });

    const item = (await inboxStorage.getByAttachmentHash(sha256(attachment)))!;
    expect(item).toMatchObject({ status: "booked", reviewReason: null, vehicleId, fromAddress: "facturen@garage-test.invalid", attachmentContentType: "application/pdf" });
    expect(item.attachmentName).toBe("Factuur_2026.pdf");
    expect(item.parsed?.plates).toEqual(["PTIM01"]);
    expect(item.expenseIds).toHaveLength(2);
    expect(resolveDocumentFilePath(item.attachmentPath!)).not.toBeNull();
    expect(scannerCalls[0].mimeType).toBe("application/pdf");

    const booked = await db.select().from(expenses).where(eq(expenses.inboxItemId, item.id));
    expect(booked.map((e) => [e.category, e.amount]).sort()).toEqual([["Brakes", "50"], ["Maintenance", "100"]]);
    expect(booked[0].receiptFilePath).toBe(item.attachmentPath);
    expect(booked[0].description).toContain(`(Factuur ${scanned.invoiceNumber}, ${VENDOR})`);

    const after = await notifications();
    expect(after.length).toBe(before + 1);
    expect(after.some((n) => n.title.includes("geboekt op PT-IM-01"))).toBe(true);
  });

  it("skips an attachment it has seen before, without scanning or booking again", async () => {
    const attachment = pdf("tweemaal");
    const raw = await buildMail({ attachments: [{ filename: "f.pdf", content: attachment, contentType: "application/pdf" }] });
    await importInvoiceMail({ raw, config, createdBy: INBOX_TEST_ACTOR });
    const calls = scannerCalls.length;
    const again = await importInvoiceMail({ raw, config, createdBy: INBOX_TEST_ACTOR });
    expect(again).toEqual({ attachments: 1, booked: 0, review: 0, skipped: 1 });
    expect(scannerCalls.length).toBe(calls);
  });

  it("queues the same invoice arriving in a different file as a possible duplicate", async () => {
    scanned = invoice({ invoiceNumber: `DUP-${unique()}` });
    await importInvoiceMail({ raw: await buildMail({ attachments: [{ filename: "a.pdf", content: pdf("origineel"), contentType: "application/pdf" }] }), config, createdBy: INBOX_TEST_ACTOR });
    const copy = pdf("kopie");
    const result = await importInvoiceMail({ raw: await buildMail({ attachments: [{ filename: "b.pdf", content: copy, contentType: "application/pdf" }] }), config, createdBy: INBOX_TEST_ACTOR });
    expect(result).toMatchObject({ booked: 0, review: 1 });
    expect(await inboxStorage.getByAttachmentHash(sha256(copy))).toMatchObject({ status: "review", reviewReason: "duplicate", expenseIds: [] });
  });

  it("never books for a sender outside the list, but keeps the invoice with the vehicle pre-filled", async () => {
    const attachment = pdf("vreemd");
    const result = await importInvoiceMail({ raw: await buildMail({ from: "iemand@elders.invalid", attachments: [{ filename: "f.pdf", content: attachment, contentType: "application/pdf" }] }), config, createdBy: INBOX_TEST_ACTOR });
    expect(result).toMatchObject({ booked: 0, review: 1 });
    expect(await inboxStorage.getByAttachmentHash(sha256(attachment))).toMatchObject({ status: "review", reviewReason: "unknown_sender", vehicleId, expenseIds: [] });
  });

  it("does not trust an allowed sender whose mail failed DMARC or SPF", async () => {
    for (const verdict of ["dmarc=fail", "spf=fail"]) {
      const attachment = pdf(verdict);
      await importInvoiceMail({ raw: await buildMail({ headers: { "Authentication-Results": `mx.lamgroep.nl; ${verdict} header.from=garage-test.invalid` }, attachments: [{ filename: "f.pdf", content: attachment, contentType: "application/pdf" }] }), config, createdBy: INBOX_TEST_ACTOR });
      expect((await inboxStorage.getByAttachmentHash(sha256(attachment)))?.reviewReason).toBe("unknown_sender");
    }
  });

  it("queues the plate and amount problems with their own reasons", async () => {
    const cases: Array<[Partial<InboxParsedInvoice>, string]> = [
      [{ vehicleInfo: undefined }, "no_plate"],
      [{ vehicleInfo: { licensePlate: "PT-IM-01", licensePlates: ["PT-IM-01", "PT-IM-02"] } }, "multiple_plates"],
      [{ vehicleInfo: { licensePlate: "ZZ-999-Z" } }, "plate_unknown"],
      [{ totalAmount: 500, subtotalAmount: undefined, vatAmount: undefined }, "total_mismatch"],
    ];
    for (const [over, reason] of cases) {
      scanned = invoice(over);
      const attachment = pdf(reason);
      await importInvoiceMail({ raw: await buildMail({ attachments: [{ filename: "f.pdf", content: attachment, contentType: "application/pdf" }] }), config, createdBy: INBOX_TEST_ACTOR });
      expect((await inboxStorage.getByAttachmentHash(sha256(attachment)))?.reviewReason).toBe(reason);
    }
  });

  it("records a scanner failure instead of throwing, and keeps the file for manual entry", async () => {
    setInvoiceScanner(async () => { throw new Error("Failed to process invoice with all available AI models."); });
    const attachment = pdf("kapot");
    const result = await importInvoiceMail({ raw: await buildMail({ attachments: [{ filename: "f.pdf", content: attachment, contentType: "application/pdf" }] }), config, createdBy: INBOX_TEST_ACTOR });
    expect(result).toMatchObject({ booked: 0, review: 1 });
    const item = (await inboxStorage.getByAttachmentHash(sha256(attachment)))!;
    expect(item).toMatchObject({ status: "review", reviewReason: "parse_failed", parsed: null });
    expect(item.errorMessage).toContain("AI models");
    expect(resolveDocumentFilePath(item.attachmentPath!)).not.toBeNull();
  });

  it("queues a scan that read nothing usable as parse_failed, keeping what it did read", async () => {
    scanned = invoice({ totalAmount: 0, lineItems: [] });
    const attachment = pdf("leeg");
    await importInvoiceMail({ raw: await buildMail({ attachments: [{ filename: "f.pdf", content: attachment, contentType: "application/pdf" }] }), config, createdBy: INBOX_TEST_ACTOR });
    const item = (await inboxStorage.getByAttachmentHash(sha256(attachment)))!;
    expect(item.reviewReason).toBe("parse_failed");
    expect(item.parsed?.vendor).toBe(VENDOR);
  });

  it("queues a mail without a usable attachment once, whatever is attached", async () => {
    const messageId = `<${unique()}@garage-test.invalid>`;
    const raw = await buildMail({ messageId, attachments: [
      { filename: "nep.pdf", content: Buffer.from("geen pdf"), contentType: "application/pdf" },
      { filename: "logo.png", content: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100)]), contentType: "image/png" },
      { filename: "offerte.docx", content: Buffer.from("PK"), contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
    ] });
    expect(await importInvoiceMail({ raw, config, createdBy: INBOX_TEST_ACTOR })).toEqual({ attachments: 0, booked: 0, review: 1, skipped: 0 });
    expect(await inboxStorage.getByAttachmentHash(sha256(`mail:${messageId}`))).toMatchObject({ status: "review", reviewReason: "no_attachment", attachmentPath: null });
    expect(await importInvoiceMail({ raw, config, createdBy: INBOX_TEST_ACTOR })).toEqual({ attachments: 0, booked: 0, review: 0, skipped: 1 });
    expect(scannerCalls).toHaveLength(0);
  });

  it("scans a photo of an invoice with its own mime type, also when it is sent as octet-stream", async () => {
    const photo = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(unique()), Buffer.alloc(25 * 1024)]);
    await importInvoiceMail({ raw: await buildMail({ attachments: [{ filename: "bon.JPG", content: photo, contentType: "application/octet-stream" }] }), config, createdBy: INBOX_TEST_ACTOR });
    expect(scannerCalls[0].mimeType).toBe("image/jpeg");
    expect((await inboxStorage.getByAttachmentHash(sha256(photo)))?.attachmentContentType).toBe("image/jpeg");
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lvs_fixtest npx vitest run server/__tests__/invoice-inbox-importer.test.ts`
Expected: FAIL — cannot resolve `../services/invoice-inbox/importer`.

- [ ] **Step 4: Create `server/services/invoice-inbox/notify.ts`**

```ts
import { storage } from "../../storage";
import { broadcastDataUpdate } from "../../realtime-events";

export interface InvoiceInboxEvent {
  title: string;
  description: string;
  priority?: "normal" | "high";
}

/**
 * In-app notification plus a live toast in every open staff session (see
 * client/src/hooks/use-socket.tsx, entity type "invoice-inbox"). No e-mail:
 * the invoice already arrived by e-mail. Never throws — a failed notification
 * must not fail the import.
 */
export async function notifyInvoiceInbox(event: InvoiceInboxEvent): Promise<void> {
  try {
    const notification = await storage.createCustomNotification({
      title: event.title,
      description: event.description,
      date: new Date().toISOString().slice(0, 10),
      type: "invoice_inbox",
      link: "/expenses",
      icon: "Receipt",
      priority: event.priority ?? "normal",
      isRead: false,
    });
    broadcastDataUpdate("invoice-inbox", "created", {
      notificationId: notification.id, title: event.title, description: event.description, link: "/expenses",
    });
  } catch (error) {
    console.error("invoice inbox notification failed:", error);
  }
}
```

- [ ] **Step 5: Create `server/services/invoice-inbox/importer.ts`**

```ts
import fs from "fs";
import path from "path";
import { simpleParser, type ParsedMail } from "mailparser";
import { getUploadsDir } from "../../../shared/paths";
import {
  REVIEW_REASON_LABELS_NL, isAllowedSender, normalizeSender,
  type InboxParsedInvoice, type InvoiceInboxConfig, type ReviewReason,
} from "../../../shared/invoice-inbox";
import { processInvoiceWithAI, validateParsedInvoice } from "../../utils/invoice-scanner";
import { getRelativePath } from "../document-paths";
import { bookInvoiceAsExpenses, groupLinesByCategory } from "../expenses/book-invoice";
import { inboxStorage } from "./inbox-storage";
import { computeInvoiceHash, sha256 } from "./hash";
import { extractPlates } from "./plates";
import { decideInvoiceBooking } from "./decide";
import { notifyInvoiceInbox } from "./notify";

export type InvoiceScanner = (filePath: string, mimeType: string) => Promise<InboxParsedInvoice>;

let scanner: InvoiceScanner = processInvoiceWithAI;
/** Tests swap the Gemini scanner for a fake; null restores the real one. */
export function setInvoiceScanner(replacement: InvoiceScanner | null): void {
  scanner = replacement ?? processInvoiceWithAI;
}

export interface ImportMailInput { raw: Buffer; config: InvoiceInboxConfig; createdBy: string }
export interface ImportMailResult { attachments: number; booked: number; review: number; skipped: number }

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_MAIL = 10;
/** Smaller images are signatures and logos, not invoices. */
const MIN_IMAGE_BYTES = 20 * 1024;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ACCEPTED: Record<string, { extension: string; matches: (b: Buffer) => boolean }> = {
  "application/pdf": { extension: "pdf", matches: (b) => b.subarray(0, 1024).includes("%PDF-") },
  "image/jpeg": { extension: "jpg", matches: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/png": { extension: "png", matches: (b) => b.subarray(0, 8).equals(PNG_SIGNATURE) },
};

interface UsableAttachment { name: string; content: Buffer; contentType: string }
interface MailMeta { messageId: string | null; fromAddress: string | null; subject: string | null; mailDate: Date | null }

/** Same rule as the CJIB importer: base name only, conservative character set. */
const safeName = (name: string) => path.basename(name).replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);

/** The declared type, or the file extension for octet-stream — and in both cases the bytes have to agree. */
function detectType(declared: string, fileName: string, content: Buffer): string | null {
  const type = declared.toLowerCase().trim();
  const name = fileName.toLowerCase();
  let candidate: string | null = type === "image/jpg" ? "image/jpeg" : ACCEPTED[type] ? type : null;
  if (!candidate && (type === "application/octet-stream" || type === "")) {
    if (name.endsWith(".pdf")) candidate = "application/pdf";
    else if (/\.jpe?g$/.test(name)) candidate = "image/jpeg";
    else if (name.endsWith(".png")) candidate = "image/png";
  }
  return candidate && ACCEPTED[candidate].matches(content) ? candidate : null;
}

function usableAttachments(mail: ParsedMail): UsableAttachment[] {
  const usable: UsableAttachment[] = [];
  for (const attachment of mail.attachments ?? []) {
    if (usable.length >= MAX_ATTACHMENTS_PER_MAIL) break;
    if (!Buffer.isBuffer(attachment.content)) continue;
    const content = attachment.content;
    if (content.length > MAX_ATTACHMENT_BYTES) continue;
    const contentType = detectType(attachment.contentType ?? "", attachment.filename ?? "", content);
    if (!contentType) continue;
    if (contentType !== "application/pdf" && content.length < MIN_IMAGE_BYTES) continue;
    usable.push({ name: safeName(attachment.filename || `factuur.${ACCEPTED[contentType].extension}`), content, contentType });
  }
  return usable;
}

/**
 * The receiving mail server's verdict. Only a hard fail counts, and only
 * against the sender: a forged "pass" line gains an attacker nothing here.
 */
function senderAuthFailed(mail: ParsedMail): boolean {
  const results = (mail.headerLines ?? [])
    .filter((h) => h.key === "authentication-results").map((h) => h.line).join(" ").toLowerCase();
  return /\bdmarc=fail\b/.test(results) || /\bspf=fail\b/.test(results);
}

function storeAttachment(attachment: UsableAttachment, hash: string): { absolutePath: string; relativePath: string } {
  const dir = path.join(getUploadsDir(), "invoice-inbox");
  fs.mkdirSync(dir, { recursive: true });
  const absolutePath = path.join(dir, `${Date.now()}_${hash.slice(0, 8)}_${attachment.name}`);
  fs.writeFileSync(absolutePath, attachment.content);
  return { absolutePath, relativePath: getRelativePath(absolutePath) };
}

const amsterdamToday = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam" }).format(new Date());
const euro = (amount: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(amount);

async function notifyReview(reason: ReviewReason, vendor: string | undefined, meta: MailMeta): Promise<void> {
  const who = vendor?.trim() || meta.fromAddress || "onbekende afzender";
  await notifyInvoiceInbox({
    title: `Factuur van ${who} wacht op controle`,
    description: `Reden: ${REVIEW_REASON_LABELS_NL[reason]}. Onderwerp: ${meta.subject ?? "(geen onderwerp)"}`,
  });
}

async function importAttachment(
  attachment: UsableAttachment, meta: MailMeta, senderAllowed: boolean, config: InvoiceInboxConfig, createdBy: string,
): Promise<"booked" | "review" | "skipped"> {
  const attachmentHash = sha256(attachment.content);
  if (await inboxStorage.getByAttachmentHash(attachmentHash)) return "skipped";

  const stored = storeAttachment(attachment, attachmentHash);
  const base = {
    ...meta, attachmentName: attachment.name, attachmentPath: stored.relativePath, attachmentHash,
    attachmentContentType: attachment.contentType, createdBy,
  };

  let parsed: InboxParsedInvoice | null = null;
  let scanError: string | null = null;
  try {
    parsed = await scanner(stored.absolutePath, attachment.contentType);
    const validation = validateParsedInvoice(parsed);
    if (!validation.valid) scanError = validation.errors.join("; ");
  } catch (error) {
    scanError = (error as Error).message;
  }
  if (scanError || !parsed) {
    await inboxStorage.create({ ...base, parsed, status: "review", reviewReason: "parse_failed", errorMessage: (scanError ?? "Uitlezen mislukt").slice(0, 2000) });
    await notifyReview("parse_failed", parsed?.vendor, meta);
    return "review";
  }

  const plates = extractPlates(parsed);
  parsed = { ...parsed, plates };
  const invoiceHash = computeInvoiceHash(parsed);
  const duplicate = invoiceHash ? Boolean(await inboxStorage.findActiveByInvoiceHash(invoiceHash)) : false;
  const fleetMatches = await inboxStorage.findVehiclesByPlates(plates);
  const decision = decideInvoiceBooking({
    senderAllowed, duplicate, plates, fleetMatches, invoice: parsed, tolerance: config.totalTolerance, today: amsterdamToday(),
  });

  // Written as "review" first: the expenses need the item id, and an item that
  // is never upgraded to "booked" is still visible to staff.
  const item = await inboxStorage.create({
    ...base, invoiceHash, parsed, status: "review",
    reviewReason: decision.action === "review" ? decision.reason : null,
    vehicleId: fleetMatches.length === 1 ? fleetMatches[0].id : null,
  });
  if (decision.action === "review") {
    await notifyReview(decision.reason, parsed.vendor, meta);
    return "review";
  }

  const booked = await bookInvoiceAsExpenses({
    invoice: parsed, vehicleId: decision.vehicleId, lineItems: groupLinesByCategory(parsed.lineItems),
    receipt: { relativePath: stored.relativePath, fileName: attachment.name, size: attachment.content.length, contentType: attachment.contentType },
    inboxItemId: item.id, createdBy,
  });
  if (booked.expenses.length === 0) {
    await inboxStorage.update(item.id, { reviewReason: "parse_failed", errorMessage: (booked.errors.join("; ") || "Boeken mislukt").slice(0, 2000) });
    await notifyReview("parse_failed", parsed.vendor, meta);
    return "review";
  }

  await inboxStorage.update(item.id, {
    status: "booked", reviewReason: null, vehicleId: decision.vehicleId, expenseIds: booked.expenses.map((e) => e.id),
    errorMessage: booked.errors.length ? booked.errors.join("; ").slice(0, 2000) : null, processedAt: new Date(), updatedBy: createdBy,
  });
  const total = booked.expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  await notifyInvoiceInbox({
    title: `Factuur van ${parsed.vendor} geboekt op ${fleetMatches[0].licensePlate}`,
    description: `${booked.expenses.length} kostenregel(s), samen ${euro(total)} (factuur ${parsed.invoiceNumber || "zonder nummer"})`,
  });
  return "booked";
}

/**
 * One mail end to end. Every usable attachment becomes exactly one inbox item
 * (or is skipped when its bytes were seen before); a mail without one becomes a
 * single "no_attachment" item. A bad attachment never stops the others; an
 * error thrown from here means the whole mail should be retried next run.
 */
export async function importInvoiceMail(input: ImportMailInput): Promise<ImportMailResult> {
  const mail = await simpleParser(input.raw);
  const fromAddress = normalizeSender(mail.from?.value?.[0]?.address ?? mail.from?.text ?? "");
  const senderAllowed = isAllowedSender(fromAddress, input.config.allowedSenders) && !senderAuthFailed(mail);
  const meta: MailMeta = {
    messageId: mail.messageId ?? null,
    fromAddress: fromAddress || null,
    subject: (mail.subject ?? "").slice(0, 500) || null,
    mailDate: mail.date ?? null,
  };
  const result: ImportMailResult = { attachments: 0, booked: 0, review: 0, skipped: 0 };

  const attachments = usableAttachments(mail);
  if (attachments.length === 0) {
    const attachmentHash = sha256(`mail:${mail.messageId ?? sha256(input.raw)}`);
    if (await inboxStorage.getByAttachmentHash(attachmentHash)) { result.skipped += 1; return result; }
    await inboxStorage.create({ ...meta, attachmentHash, status: "review", reviewReason: "no_attachment", createdBy: input.createdBy });
    await notifyReview("no_attachment", undefined, meta);
    result.review += 1;
    return result;
  }

  for (const attachment of attachments) {
    const outcome = await importAttachment(attachment, meta, senderAllowed, input.config, input.createdBy);
    result.attachments += 1;
    result[outcome] += 1;
  }
  return result;
}
```

- [ ] **Step 6: Run the test**

Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lvs_fixtest npx vitest run server/__tests__/invoice-inbox-importer.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 7: Type check and commit**

Run: `npm run check`
Expected: no new errors.

```bash
git add package.json package-lock.json server/services/invoice-inbox/notify.ts server/services/invoice-inbox/importer.ts server/__tests__/invoice-inbox-importer.test.ts
git commit -m "feat(kosten): factuurmail verwerken: bijlagen uitlezen, automatisch boeken of ter controle zetten

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: IMAP client, poller and scheduler

**Files:**
- Modify: `package.json`, `package-lock.json` (`imapflow`)
- Create: `server/services/invoice-inbox/imap-client.ts`
- Create: `server/services/invoice-inbox/poller.ts`
- Modify: `server/index.ts` (import near line 17; shutdown near line 109; start near line 520)
- Test: `server/__tests__/invoice-inbox-poller.test.ts`

**Interfaces:**
- Consumes: `importInvoiceMail` (Task 6), `notifyInvoiceInbox` (Task 6), `getInvoiceInboxConfig`, `assertAllowedImapTarget` (Task 1).
- Produces:
  ```ts
  // imap-client.ts
  export interface InboxMessageRef { uid: number; messageId: string | null; from: string | null; subject: string | null }
  export interface InvoiceImapSession {
    listUnseen(): Promise<InboxMessageRef[]>;
    fetchRaw(uid: number): Promise<Buffer>;
    /** Move to the processed folder, or mark read when none is configured or the move fails. */
    markProcessed(uid: number): Promise<void>;
  }
  export interface InvoiceImapClient {
    withSession<T>(config: InvoiceInboxConfig, fn: (session: InvoiceImapSession) => Promise<T>): Promise<T>;
  }
  export const imapClient: InvoiceImapClient;
  // poller.ts
  export const MAX_MAILS_PER_RUN = 25;
  export function setInvoiceImapClient(client: InvoiceImapClient | null): void;
  export function getInvoiceImapClient(): InvoiceImapClient;
  export function getInvoiceInboxRunState(): { running: boolean; lastRun: InvoiceInboxRunSummary | null; scheduledMinutes: number | null };
  export function runInvoiceInboxImport(trigger: InvoiceInboxRunSummary["trigger"], createdBy?: string, configOverride?: InvoiceInboxConfig): Promise<InvoiceInboxRunSummary>;
  export function cronExpressionFor(pollMinutes: number): string;
  export function startInvoiceInboxScheduler(): Promise<void>;
  export function stopInvoiceInboxScheduler(): void;
  export function resetInvoiceInboxPollerForTests(): void;
  ```
- `imap-client.ts` has no unit test, like `cjib/ftps-client.ts`: it is a thin wrapper whose only honest test is a real mailbox. The "Verbinding testen" button (Tasks 8 and 9) is that test, and Task 11 runs it against the real mailbox.

- [ ] **Step 1: Install the IMAP client**

```bash
npm install imapflow@^2.0.5
```

Expected: added to `dependencies`. It ships its own type definitions; do not add `@types/imapflow`.

- [ ] **Step 2: Write the failing poller test**

Create `server/__tests__/invoice-inbox-poller.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

const { importInvoiceMail, notifyInvoiceInbox } = vi.hoisted(() => ({
  importInvoiceMail: vi.fn(),
  notifyInvoiceInbox: vi.fn(async () => {}),
}));
vi.mock("../services/invoice-inbox/importer", () => ({ importInvoiceMail }));
vi.mock("../services/invoice-inbox/notify", () => ({ notifyInvoiceInbox }));

import { DEFAULT_INVOICE_INBOX_CONFIG, type InvoiceInboxConfig } from "../../shared/invoice-inbox";
import type { InvoiceImapClient } from "../services/invoice-inbox/imap-client";
import {
  runInvoiceInboxImport, setInvoiceImapClient, getInvoiceInboxRunState, cronExpressionFor,
  resetInvoiceInboxPollerForTests, MAX_MAILS_PER_RUN,
} from "../services/invoice-inbox/poller";

const config: InvoiceInboxConfig = { ...DEFAULT_INVOICE_INBOX_CONFIG, enabled: true, host: "imap.example.test", username: "u", password: "p" };

function fakeMailbox(uids: number[], options: { failConnect?: boolean } = {}) {
  const processed: number[] = [];
  let sessions = 0;
  const client: InvoiceImapClient = {
    async withSession(_config, fn) {
      if (options.failConnect) throw new Error("connect ECONNREFUSED");
      sessions += 1;
      return fn({
        async listUnseen() {
          return uids.filter((uid) => !processed.includes(uid)).map((uid) => ({ uid, messageId: `<${uid}@test>`, from: "a@b.nl", subject: `Factuur ${uid}` }));
        },
        async fetchRaw(uid) { return Buffer.from(`raw-${uid}`); },
        async markProcessed(uid) { processed.push(uid); },
      });
    },
  };
  return { client, processed, sessions: () => sessions };
}

describe("invoice inbox poller", () => {
  beforeEach(() => {
    importInvoiceMail.mockReset();
    notifyInvoiceInbox.mockClear();
    resetInvoiceInboxPollerForTests();
  });
  afterAll(() => setInvoiceImapClient(null));

  it("imports every unseen mail and adds up what the importer reports", async () => {
    const mailbox = fakeMailbox([1, 2]);
    setInvoiceImapClient(mailbox.client);
    importInvoiceMail
      .mockResolvedValueOnce({ attachments: 1, booked: 1, review: 0, skipped: 0 })
      .mockResolvedValueOnce({ attachments: 2, booked: 0, review: 1, skipped: 1 });
    const summary = await runInvoiceInboxImport("manual", "kees", config);
    expect(summary).toMatchObject({ trigger: "manual", mails: 2, attachments: 3, booked: 1, review: 1, skipped: 1, failed: 0, errors: [] });
    expect(importInvoiceMail.mock.calls[0][0]).toMatchObject({ createdBy: "kees", config });
    expect(importInvoiceMail.mock.calls[0][0].raw.toString()).toBe("raw-1");
    expect(mailbox.processed).toEqual([1, 2]);
    expect(getInvoiceInboxRunState().lastRun).toEqual(summary);
  });

  it("leaves a mail whose import threw in the inbox for the next run, and carries on with the rest", async () => {
    const mailbox = fakeMailbox([1, 2, 3]);
    setInvoiceImapClient(mailbox.client);
    importInvoiceMail
      .mockResolvedValueOnce({ attachments: 1, booked: 1, review: 0, skipped: 0 })
      .mockRejectedValueOnce(new Error("database weg"))
      .mockResolvedValueOnce({ attachments: 1, booked: 0, review: 1, skipped: 0 });
    const summary = await runInvoiceInboxImport("scheduler", "scheduler", config);
    expect(summary).toMatchObject({ mails: 3, booked: 1, review: 1, failed: 1 });
    expect(summary.errors).toEqual(["Factuur 2: database weg"]);
    expect(mailbox.processed).toEqual([1, 3]);
  });

  it("shares one run between overlapping calls", async () => {
    const mailbox = fakeMailbox([1]);
    setInvoiceImapClient(mailbox.client);
    importInvoiceMail.mockImplementation(async () => { await new Promise((r) => setTimeout(r, 30)); return { attachments: 1, booked: 1, review: 0, skipped: 0 }; });
    const [a, b] = await Promise.all([runInvoiceInboxImport("manual", "a", config), runInvoiceInboxImport("manual", "b", config)]);
    expect(a).toBe(b);
    expect(mailbox.sessions()).toBe(1);
    expect(importInvoiceMail).toHaveBeenCalledTimes(1);
    expect(getInvoiceInboxRunState().running).toBe(false);
  });

  it("handles at most MAX_MAILS_PER_RUN mails in one run", async () => {
    const mailbox = fakeMailbox(Array.from({ length: MAX_MAILS_PER_RUN + 5 }, (_, i) => i + 1));
    setInvoiceImapClient(mailbox.client);
    importInvoiceMail.mockResolvedValue({ attachments: 1, booked: 1, review: 0, skipped: 0 });
    const summary = await runInvoiceInboxImport("scheduler", "scheduler", config);
    expect(summary.mails).toBe(MAX_MAILS_PER_RUN);
    expect(mailbox.processed).toHaveLength(MAX_MAILS_PER_RUN);
  });

  it("reports a connection error in the summary and warns staff once, after three failures in a row", async () => {
    setInvoiceImapClient(fakeMailbox([], { failConnect: true }).client);
    for (let i = 0; i < 2; i += 1) {
      const summary = await runInvoiceInboxImport("scheduler", "scheduler", config);
      expect(summary.errors).toEqual(["connect ECONNREFUSED"]);
    }
    expect(notifyInvoiceInbox).not.toHaveBeenCalled();
    await runInvoiceInboxImport("scheduler", "scheduler", config);
    await runInvoiceInboxImport("scheduler", "scheduler", config);
    expect(notifyInvoiceInbox).toHaveBeenCalledTimes(1);
    expect(notifyInvoiceInbox.mock.calls[0][0].title).toBe("Postvak facturen onbereikbaar");

    // A good run resets the count: three new failures warn again.
    setInvoiceImapClient(fakeMailbox([]).client);
    await runInvoiceInboxImport("scheduler", "scheduler", config);
    setInvoiceImapClient(fakeMailbox([], { failConnect: true }).client);
    for (let i = 0; i < 3; i += 1) await runInvoiceInboxImport("scheduler", "scheduler", config);
    expect(notifyInvoiceInbox).toHaveBeenCalledTimes(2);
  });

  it("refuses to run without a host", async () => {
    setInvoiceImapClient(fakeMailbox([1]).client);
    const summary = await runInvoiceInboxImport("manual", "kees", { ...config, host: "" });
    expect(summary.errors).toEqual(["IMAP-host is niet ingesteld"]);
    expect(importInvoiceMail).not.toHaveBeenCalled();
  });

  it("turns the interval into a cron expression, clamped to 5..1440 minutes", () => {
    expect(cronExpressionFor(15)).toBe("*/15 * * * *");
    expect(cronExpressionFor(1)).toBe("*/5 * * * *");
    expect(cronExpressionFor(60)).toBe("0 */1 * * *");
    expect(cronExpressionFor(180)).toBe("0 */3 * * *");
    expect(cronExpressionFor(1440)).toBe("0 0 * * *");
    expect(cronExpressionFor(99999)).toBe("0 0 * * *");
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lvs_fixtest npx vitest run server/__tests__/invoice-inbox-poller.test.ts`
Expected: FAIL — cannot resolve `../services/invoice-inbox/poller`.

- [ ] **Step 4: Create `server/services/invoice-inbox/imap-client.ts`**

```ts
import { ImapFlow } from "imapflow";
import type { InvoiceInboxConfig } from "../../../shared/invoice-inbox";
import { assertAllowedImapTarget } from "./config";

export interface InboxMessageRef { uid: number; messageId: string | null; from: string | null; subject: string | null }

/** What the poller needs from one open mailbox; swapped for a fake in tests. */
export interface InvoiceImapSession {
  listUnseen(): Promise<InboxMessageRef[]>;
  fetchRaw(uid: number): Promise<Buffer>;
  /** Move to the processed folder, or mark read when none is configured or the move fails. */
  markProcessed(uid: number): Promise<void>;
}

export interface InvoiceImapClient {
  withSession<T>(config: InvoiceInboxConfig, fn: (session: InvoiceImapSession) => Promise<T>): Promise<T>;
}

function openSession(client: ImapFlow, config: InvoiceInboxConfig): InvoiceImapSession {
  return {
    async listUnseen() {
      const refs: InboxMessageRef[] = [];
      // No other command may run while this generator is open (imapflow deadlocks).
      for await (const message of client.fetch({ seen: false }, { uid: true, envelope: true })) {
        refs.push({
          uid: message.uid,
          messageId: message.envelope?.messageId ?? null,
          from: message.envelope?.from?.[0]?.address ?? null,
          subject: message.envelope?.subject ?? null,
        });
      }
      return refs.sort((a, b) => a.uid - b.uid);
    },
    async fetchRaw(uid) {
      // `source` is fetched with BODY.PEEK, so a mail that fails to import stays unseen.
      const message = await client.fetchOne(String(uid), { source: true }, { uid: true });
      if (!message || !message.source) throw new Error(`Bericht ${uid} kon niet worden opgehaald`);
      return message.source;
    },
    async markProcessed(uid) {
      if (config.processedFolder) {
        try { await client.mailboxCreate(config.processedFolder); } catch { /* exists already */ }
        try {
          const moved = await client.messageMove(String(uid), config.processedFolder, { uid: true });
          if (moved) return;
        } catch (error) {
          console.warn(`Factuurmail ${uid} kon niet naar "${config.processedFolder}" worden verplaatst:`, (error as Error).message);
        }
      }
      // Fallback, and the configured behaviour without a folder: the item is
      // already stored by hash, read-marking only keeps the mail out of the next listing.
      await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
    },
  };
}

export const imapClient: InvoiceImapClient = {
  async withSession(config, fn) {
    if (!config.host) throw new Error("IMAP-host is niet ingesteld");
    // Every connection — the poller's and the admin's "test connection" — passes
    // the port pair and the private-range check first (cf. BUG-071).
    await assertAllowedImapTarget(config.host, config.port);
    const client = new ImapFlow({
      host: config.host, port: config.port, secure: config.secure,
      auth: { user: config.username, pass: config.password },
      tls: { rejectUnauthorized: true },
      logger: false,
    });
    // An ImapFlow instance is an EventEmitter: an unhandled "error" event would
    // take the whole server process down.
    client.on("error", (error: Error) => console.error("IMAP connection error:", error.message));
    await client.connect();
    try {
      const lock = await client.getMailboxLock(config.inboxFolder || "INBOX");
      try {
        return await fn(openSession(client, config));
      } finally {
        lock.release();
      }
    } finally {
      try { await client.logout(); } catch { client.close(); }
    }
  },
};
```

- [ ] **Step 5: Create `server/services/invoice-inbox/poller.ts`**

```ts
import cron, { type ScheduledTask } from "node-cron";
import type { InvoiceInboxConfig, InvoiceInboxRunSummary } from "../../../shared/invoice-inbox";
import { getInvoiceInboxConfig } from "./config";
import { imapClient, type InvoiceImapClient } from "./imap-client";
import { importInvoiceMail } from "./importer";
import { notifyInvoiceInbox } from "./notify";

/** Bounds one run: every mail can cost a Gemini call. The rest waits for the next run. */
export const MAX_MAILS_PER_RUN = 25;
const FAILURES_BEFORE_WARNING = 3;

let client: InvoiceImapClient = imapClient;
/** Tests swap the IMAP client for a fake; null restores the real one. */
export function setInvoiceImapClient(replacement: InvoiceImapClient | null): void { client = replacement ?? imapClient; }
export function getInvoiceImapClient(): InvoiceImapClient { return client; }

let running: Promise<InvoiceInboxRunSummary> | null = null;
let lastRun: InvoiceInboxRunSummary | null = null;
let task: ScheduledTask | null = null;
let scheduledMinutes: number | null = null;
let consecutiveFailures = 0;

export function getInvoiceInboxRunState(): { running: boolean; lastRun: InvoiceInboxRunSummary | null; scheduledMinutes: number | null } {
  return { running: running !== null, lastRun, scheduledMinutes };
}

export function resetInvoiceInboxPollerForTests(): void {
  running = null; lastRun = null; consecutiveFailures = 0;
}

/**
 * Read every unseen mail and import it. Overlapping calls share one run. A
 * connection error ends the run with that error; a mail whose import throws
 * stays unseen and is retried next run, without stopping the other mails.
 */
export function runInvoiceInboxImport(
  trigger: InvoiceInboxRunSummary["trigger"], createdBy = "scheduler", configOverride?: InvoiceInboxConfig,
): Promise<InvoiceInboxRunSummary> {
  if (running) return running;
  running = (async () => {
    const summary: InvoiceInboxRunSummary = {
      startedAt: new Date().toISOString(), finishedAt: "", trigger,
      mails: 0, attachments: 0, booked: 0, review: 0, skipped: 0, failed: 0, errors: [],
    };
    let connected = false;
    try {
      const config = configOverride ?? await getInvoiceInboxConfig();
      if (!config.host) throw new Error("IMAP-host is niet ingesteld");
      await client.withSession(config, async (session) => {
        connected = true;
        const refs = (await session.listUnseen()).slice(0, MAX_MAILS_PER_RUN);
        for (const ref of refs) {
          summary.mails += 1;
          try {
            const raw = await session.fetchRaw(ref.uid);
            const result = await importInvoiceMail({ raw, config, createdBy });
            summary.attachments += result.attachments;
            summary.booked += result.booked;
            summary.review += result.review;
            summary.skipped += result.skipped;
            await session.markProcessed(ref.uid);
          } catch (error) {
            summary.failed += 1;
            summary.errors.push(`${ref.subject ?? `bericht ${ref.uid}`}: ${(error as Error).message}`);
          }
        }
      });
    } catch (error) {
      summary.errors.push((error as Error).message);
    }

    if (connected) consecutiveFailures = 0;
    else {
      consecutiveFailures += 1;
      if (consecutiveFailures === FAILURES_BEFORE_WARNING) {
        await notifyInvoiceInbox({
          title: "Postvak facturen onbereikbaar",
          description: `De app kon het postvak ${FAILURES_BEFORE_WARNING} keer achter elkaar niet uitlezen: ${summary.errors[0] ?? "onbekende fout"}. Controleer de instellingen onder E-mail.`,
          priority: "high",
        });
      }
    }

    summary.finishedAt = new Date().toISOString();
    lastRun = summary;
    if (summary.errors.length) console.error("Invoice inbox run finished with errors:", summary.errors);
    else console.log(`Invoice inbox: ${summary.mails} mail(s), ${summary.booked} booked, ${summary.review} for review, ${summary.skipped} skipped`);
    return summary;
  })().finally(() => { running = null; });
  return running;
}

export function cronExpressionFor(pollMinutes: number): string {
  const minutes = Math.max(5, Math.min(1440, Math.round(Number(pollMinutes) || 15)));
  if (minutes < 60) return `*/${minutes} * * * *`;
  const hours = Math.round(minutes / 60);
  return hours >= 24 ? "0 0 * * *" : `0 */${hours} * * *`;
}

/** (Re)reads the config and (re)schedules the poll; call at start-up and after the config is saved. */
export async function startInvoiceInboxScheduler(): Promise<void> {
  stopInvoiceInboxScheduler();
  const config = await getInvoiceInboxConfig();
  if (!config.enabled || !config.host) return;
  const expression = cronExpressionFor(config.pollMinutes);
  task = cron.schedule(expression, () => { void runInvoiceInboxImport("scheduler"); }, { timezone: "Europe/Amsterdam" });
  scheduledMinutes = Math.max(5, Math.min(1440, config.pollMinutes));
  console.log(`Invoice inbox scheduled every ${scheduledMinutes} minutes (${expression})`);
}

export function stopInvoiceInboxScheduler(): void {
  task?.stop(); task = null; scheduledMinutes = null;
}
```

Note on the "refuses to run without a host" test: the missing host is a configuration error, not a connection failure of a configured mailbox, but it still counts towards `consecutiveFailures`. That is intended — a mailbox that was switched on and later lost its host should warn staff too.

- [ ] **Step 6: Run the poller test**

Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lvs_fixtest npx vitest run server/__tests__/invoice-inbox-poller.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 7: Wire the scheduler into `server/index.ts`**

7a. Below `import { startCjibScheduler } from "./services/cjib/poller";` add:

```ts
import { startInvoiceInboxScheduler, stopInvoiceInboxScheduler } from "./services/invoice-inbox/poller";
```

7b. In the shutdown handler, directly below the line `if (fiscalScheduler) fiscalScheduler.stop();` add:

```ts
    stopInvoiceInboxScheduler();
```

7c. Directly below the line `startCjibScheduler().catch((e) => console.error("CJIB scheduler failed to start:", e));` add:

```ts
startInvoiceInboxScheduler().catch((e) => console.error("Invoice inbox scheduler failed to start:", e));
```

- [ ] **Step 8: Type check, start the server once, commit**

Run: `npm run check`
Expected: no new errors. If TypeScript rejects a detail of the imapflow calls under the installed typings (for example the search object passed to `client.fetch`), keep the behaviour and adjust only the typing.

Run: `npm run dev` (stop it with Ctrl+C after the log settles)
Expected: no "Invoice inbox scheduler failed to start" line; with the feature switched off there is no "Invoice inbox scheduled" line either.

```bash
git add package.json package-lock.json server/services/invoice-inbox/imap-client.ts server/services/invoice-inbox/poller.ts server/index.ts server/__tests__/invoice-inbox-poller.test.ts
git commit -m "feat(kosten): IMAP-postvak uitlezen op interval, met gedeelde run en melding bij herhaalde storing

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Routes under `/api/expenses/inbox`

**Files:**
- Create: `server/routes/expense-inbox.ts`
- Modify: `server/routes.ts` (import at the top with the other route modules; call directly above `registerExpenseRoutes(app, routeDeps);` near line 5636)
- Test: `server/__tests__/expense-inbox-routes.test.ts`

**Interfaces:**
- Consumes: config service (Task 1), `inboxStorage` (Task 2), `computeInvoiceHash` (Task 3), `bookInvoiceAsExpenses`, `groupLinesByCategory`, `receiptFromStoredPath`, `resolveInvoiceFile` (Task 5), `getInvoiceImapClient`, `getInvoiceInboxRunState`, `runInvoiceInboxImport`, `startInvoiceInboxScheduler` (Task 7), `AuditLogger.logFromRequest`, `hasPermission` (existing).
- Produces: `export function registerExpenseInboxRoutes(app: Express): void` and these routes:

| route | permission | request | response |
| --- | --- | --- | --- |
| `GET /api/expenses/inbox/config` | `manage_settings` | | masked `InvoiceInboxConfig` |
| `PUT /api/expenses/inbox/config` | `manage_settings` | `InvoiceInboxConfig` | masked config; 400 `{ message }` |
| `POST /api/expenses/inbox/config/test` | `manage_settings` | `InvoiceInboxConfig` | `{ ok: true, unseen }`; 400/502 `{ ok: false, message }` |
| `POST /api/expenses/inbox/run` | `manage_expenses` | | `InvoiceInboxRunSummary` |
| `GET /api/expenses/inbox/status` | `manage_expenses` | | `{ enabled, running, lastRun, scheduledMinutes, reviewCount, geminiConfigured }` |
| `GET /api/expenses/inbox/items?status=&limit=&offset=` | `manage_expenses` | | `InboxItemWithVehicle[]` |
| `GET /api/expenses/inbox/items/:id` | `manage_expenses` | | `InvoiceInboxItem` |
| `GET /api/expenses/inbox/items/:id/file` | `manage_expenses` | | the attachment, inline |
| `POST /api/expenses/inbox/items/:id/book` | `manage_expenses` | `{ vehicleId, invoice: { vendor, invoiceNumber, invoiceDate }, lineItems, groupByCategory? }` | `{ item, expenses }`; 409 when not `review` |
| `POST /api/expenses/inbox/items/:id/dismiss` | `manage_expenses` | `{ note? }` | `{ item }`; 409 when not `review` |

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/expense-inbox-routes.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import fs from "fs";
import path from "path";
import MailComposer from "nodemailer/lib/mail-composer";
import { registerExpenseInboxRoutes } from "../routes/expense-inbox";
import { saveInvoiceInboxConfig } from "../services/invoice-inbox/config";
import { inboxStorage } from "../services/invoice-inbox/inbox-storage";
import { setInvoiceImapClient, resetInvoiceInboxPollerForTests } from "../services/invoice-inbox/poller";
import { setInvoiceScanner } from "../services/invoice-inbox/importer";
import type { InvoiceImapClient } from "../services/invoice-inbox/imap-client";
import { OutboundBlockedError, OUTBOUND_BLOCKED_MESSAGE } from "../utils/security/outboundGuard";
import { storage } from "../storage";
import { getUploadsDir } from "../../shared/paths";
import { UserPermission } from "../../shared/schema";
import { DEFAULT_INVOICE_INBOX_CONFIG, INVOICE_INBOX_CONFIG_KEY, INVOICE_INBOX_PASSWORD_MASK, type InboxParsedInvoice } from "../../shared/invoice-inbox";
import { buildStaffTestApp, createTestVehicle, cleanupPortalTestData, TEST_PREFIX } from "./portal-helpers";
import { cleanupInboxTestData, INBOX_TEST_ACTOR } from "./invoice-inbox-helpers";

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const VENDOR = `${TEST_PREFIX}Garage`;

const parsedInvoice = (over: Partial<InboxParsedInvoice> = {}): InboxParsedInvoice => ({
  vendor: VENDOR, invoiceNumber: `R-${unique()}`, invoiceDate: "2026-09-10", currency: "EUR", totalAmount: 121,
  lineItems: [{ description: "Beurt", amount: 80, category: "Maintenance" }, { description: "Olie", amount: 20, category: "Maintenance" }],
  ...over,
});

function mailboxWith(raws: Buffer[], error?: Error): InvoiceImapClient {
  const processed: number[] = [];
  return {
    async withSession(_config, fn) {
      if (error) throw error;
      return fn({
        async listUnseen() { return raws.map((_, i) => i + 1).filter((uid) => !processed.includes(uid)).map((uid) => ({ uid, messageId: null, from: null, subject: `Factuur ${uid}` })); },
        async fetchRaw(uid) { return raws[uid - 1]; },
        async markProcessed(uid) { processed.push(uid); },
      });
    },
  };
}

describe("expense inbox routes", () => {
  const admin = buildStaffTestApp([UserPermission.MANAGE_EXPENSES, UserPermission.MANAGE_SETTINGS], registerExpenseInboxRoutes);
  const bookkeeper = buildStaffTestApp([UserPermission.MANAGE_EXPENSES], registerExpenseInboxRoutes);
  const outsider = buildStaffTestApp([], registerExpenseInboxRoutes);
  const inboxDir = path.join(getUploadsDir(), "invoice-inbox");
  let previousConfig: unknown;
  let vehicleId: number;

  const reviewItem = async (over: Record<string, unknown> = {}) => {
    fs.mkdirSync(inboxDir, { recursive: true });
    const abs = path.join(inboxDir, `${TEST_PREFIX}${unique()}.pdf`);
    fs.writeFileSync(abs, `%PDF-1.4\n% ${unique()}\n%%EOF`);
    return inboxStorage.create({
      attachmentHash: `hash-${unique()}`, attachmentName: "factuur.pdf", attachmentContentType: "application/pdf",
      attachmentPath: path.relative(getUploadsDir(), abs).split(path.sep).join("/"),
      fromAddress: "facturen@garage-test.invalid", subject: `${TEST_PREFIX}Factuur`, parsed: parsedInvoice(),
      status: "review", reviewReason: "no_plate", createdBy: INBOX_TEST_ACTOR, ...over,
    });
  };

  beforeAll(async () => {
    await cleanupInboxTestData();
    await cleanupPortalTestData();
    previousConfig = (await storage.getAppSettingByKey(INVOICE_INBOX_CONFIG_KEY))?.value;
    vehicleId = (await createTestVehicle("PT-RT-01")).id;
  });
  afterAll(async () => {
    setInvoiceImapClient(null);
    setInvoiceScanner(null);
    await saveInvoiceInboxConfig(previousConfig ?? { ...DEFAULT_INVOICE_INBOX_CONFIG }, "test");
    await cleanupInboxTestData();
    await cleanupPortalTestData();
  });
  beforeEach(() => resetInvoiceInboxPollerForTests());

  it("keeps the mailbox settings to people who manage settings", async () => {
    expect((await request(bookkeeper).get("/api/expenses/inbox/config")).status).toBe(403);
    expect((await request(bookkeeper).put("/api/expenses/inbox/config").send({})).status).toBe(403);
    expect((await request(bookkeeper).post("/api/expenses/inbox/config/test").send({})).status).toBe(403);
    expect((await request(outsider).get("/api/expenses/inbox/items")).status).toBe(403);
    expect((await request(outsider).post("/api/expenses/inbox/run")).status).toBe(403);
  });

  it("stores the config with a masked password and keeps it on re-save", async () => {
    const put = await request(admin).put("/api/expenses/inbox/config").send({ enabled: false, host: "imap.example.test", port: 993, secure: true, username: "fakturenapp@lamgroep.nl", password: "geheim", allowedSenders: ["@garage-test.invalid"], pollMinutes: 30 });
    expect(put.status).toBe(200);
    expect(put.body.password).toBe(INVOICE_INBOX_PASSWORD_MASK);
    const again = await request(admin).put("/api/expenses/inbox/config").send({ ...put.body, pollMinutes: 45 });
    expect(again.status).toBe(200);
    const get = await request(admin).get("/api/expenses/inbox/config");
    expect(get.body).toMatchObject({ host: "imap.example.test", pollMinutes: 45, password: INVOICE_INBOX_PASSWORD_MASK, allowedSenders: ["@garage-test.invalid"] });
    expect(JSON.stringify(get.body)).not.toContain("geheim");
    const bad = await request(admin).put("/api/expenses/inbox/config").send({ port: 25 });
    expect(bad.status).toBe(400);
    expect(bad.body.message).toMatch(/993/);
  });

  it("tests the connection with the stored password behind the mask, and gives one answer for a blocked host", async () => {
    await saveInvoiceInboxConfig({ enabled: false, host: "imap.example.test", username: "u", password: "geheim", allowedSenders: ["@garage-test.invalid"] }, "test");
    let seenPassword = "";
    setInvoiceImapClient({ async withSession(config, fn) { seenPassword = config.password; return mailboxWith([Buffer.from("a"), Buffer.from("b")]).withSession(config, fn); } });
    const ok = await request(admin).post("/api/expenses/inbox/config/test").send({ host: "imap.example.test", username: "u", password: INVOICE_INBOX_PASSWORD_MASK });
    expect(ok.body).toEqual({ ok: true, unseen: 2 });
    expect(seenPassword).toBe("geheim");

    setInvoiceImapClient(mailboxWith([], new OutboundBlockedError()));
    const blocked = await request(admin).post("/api/expenses/inbox/config/test").send({ host: "10.0.0.5", username: "u", password: "x" });
    expect(blocked.status).toBe(400);
    expect(blocked.body).toEqual({ ok: false, message: OUTBOUND_BLOCKED_MESSAGE });

    setInvoiceImapClient(mailboxWith([], new Error("Invalid credentials")));
    const refused = await request(admin).post("/api/expenses/inbox/config/test").send({ host: "imap.example.test", username: "u", password: "x" });
    expect(refused.status).toBe(502);
    expect(refused.body).toEqual({ ok: false, message: "Invalid credentials" });
  });

  it("runs the import on request and reports it in the status", async () => {
    await saveInvoiceInboxConfig({ enabled: false, host: "imap.example.test", username: "u", password: "geheim", allowedSenders: ["@garage-test.invalid"] }, "test");
    const attachment = Buffer.from(`%PDF-1.4\n% run ${unique()}\n%%EOF`);
    const raw = await new MailComposer({ from: "facturen@garage-test.invalid", to: "fakturenapp@lamgroep.nl", subject: `${TEST_PREFIX}Factuur`, text: "bijlage", attachments: [{ filename: "f.pdf", content: attachment, contentType: "application/pdf" }] }).compile().build();
    setInvoiceImapClient(mailboxWith([raw]));
    setInvoiceScanner(async () => parsedInvoice({ subtotalAmount: 100, vatAmount: 21, vehicleInfo: { licensePlate: "PT-RT-01" } }));

    const run = await request(bookkeeper).post("/api/expenses/inbox/run");
    expect(run.status).toBe(200);
    expect(run.body).toMatchObject({ trigger: "manual", mails: 1, booked: 1, review: 0, errors: [] });

    const status = await request(bookkeeper).get("/api/expenses/inbox/status");
    expect(status.status).toBe(200);
    expect(status.body.lastRun).toMatchObject({ mails: 1, booked: 1 });
    expect(typeof status.body.reviewCount).toBe("number");
    expect(typeof status.body.geminiConfigured).toBe("boolean");
    expect(status.body.enabled).toBe(false);

    const booked = await request(bookkeeper).get("/api/expenses/inbox/items?status=booked&limit=200");
    expect(booked.body.some((i: any) => i.vehiclePlate === "PT-RT-01" && i.createdBy === "staff-test")).toBe(true);
  });

  it("lists items per status and refuses an unknown status", async () => {
    const item = await reviewItem();
    const list = await request(bookkeeper).get("/api/expenses/inbox/items?status=review&limit=200");
    expect(list.status).toBe(200);
    expect(list.body.find((i: any) => i.id === item.id)).toMatchObject({ reviewReason: "no_plate", vehiclePlate: null });
    expect((await request(bookkeeper).get(`/api/expenses/inbox/items/${item.id}`)).body.parsed.vendor).toBe(VENDOR);
    expect((await request(bookkeeper).get("/api/expenses/inbox/items?status=alles")).status).toBe(400);
    expect((await request(bookkeeper).get("/api/expenses/inbox/items/abc")).status).toBe(400);
    expect((await request(bookkeeper).get("/api/expenses/inbox/items/99999999")).status).toBe(404);
  });

  it("serves the attachment inline, and nothing that sits outside the invoice folders", async () => {
    const item = await reviewItem();
    const file = await request(bookkeeper).get(`/api/expenses/inbox/items/${item.id}/file`);
    expect(file.status).toBe(200);
    expect(file.headers["content-type"]).toContain("application/pdf");
    expect(file.headers["content-disposition"]).toContain("inline");

    const escaped = await reviewItem({ attachmentPath: "../.env" });
    expect((await request(bookkeeper).get(`/api/expenses/inbox/items/${escaped.id}/file`)).status).toBe(404);
    const none = await reviewItem({ attachmentPath: null });
    expect((await request(bookkeeper).get(`/api/expenses/inbox/items/${none.id}/file`)).status).toBe(404);
  });

  it("books a reviewed invoice once: grouped by default, header corrections saved", async () => {
    const item = await reviewItem();
    const body = {
      vehicleId, invoice: { vendor: VENDOR, invoiceNumber: "GECORRIGEERD-1", invoiceDate: "2026-09-11" },
      lineItems: [{ description: "Beurt", amount: 80, category: "Maintenance" }, { description: "Olie", amount: 20, category: "Maintenance" }],
    };
    const res = await request(bookkeeper).post(`/api/expenses/inbox/items/${item.id}/book`).send(body);
    expect(res.status).toBe(200);
    expect(res.body.expenses).toHaveLength(1);
    expect(res.body.expenses[0]).toMatchObject({ vehicleId, amount: "100", category: "Maintenance", date: "2026-09-11", inboxItemId: item.id, receiptFilePath: item.attachmentPath });
    expect(res.body.expenses[0].description).toBe(`Beurt • Olie (Factuur GECORRIGEERD-1, ${VENDOR})`);
    expect(res.body.item).toMatchObject({ status: "booked", reviewReason: null, vehicleId, updatedBy: "staff-test", expenseIds: [res.body.expenses[0].id] });
    expect(res.body.item.parsed.invoiceNumber).toBe("GECORRIGEERD-1");

    expect((await request(bookkeeper).post(`/api/expenses/inbox/items/${item.id}/book`).send(body)).status).toBe(409);
    expect((await request(bookkeeper).post(`/api/expenses/inbox/items/${item.id}/dismiss`).send({})).status).toBe(409);
  });

  it("books line by line when grouping is switched off, and validates the body", async () => {
    const item = await reviewItem();
    const lines = [{ description: "Beurt", amount: 80, category: "Maintenance" }, { description: "Olie", amount: 20, category: "Maintenance" }];
    const invoice = { vendor: VENDOR, invoiceNumber: "L-1", invoiceDate: "2026-09-10" };
    expect((await request(bookkeeper).post(`/api/expenses/inbox/items/${item.id}/book`).send({ vehicleId, invoice, lineItems: [] })).status).toBe(400);
    expect((await request(bookkeeper).post(`/api/expenses/inbox/items/${item.id}/book`).send({ vehicleId, invoice, lineItems: [{ description: "x", amount: 1, category: "Snoep" }] })).status).toBe(400);
    expect((await request(bookkeeper).post(`/api/expenses/inbox/items/${item.id}/book`).send({ vehicleId: 99999999, invoice, lineItems: lines })).status).toBe(404);
    const res = await request(bookkeeper).post(`/api/expenses/inbox/items/${item.id}/book`).send({ vehicleId, invoice, lineItems: lines, groupByCategory: false });
    expect(res.status).toBe(200);
    expect(res.body.expenses).toHaveLength(2);
  });

  it("dismisses an invoice with a note and creates nothing", async () => {
    const item = await reviewItem();
    const res = await request(bookkeeper).post(`/api/expenses/inbox/items/${item.id}/dismiss`).send({ note: "Niet van ons" });
    expect(res.status).toBe(200);
    expect(res.body.item).toMatchObject({ status: "dismissed", note: "Niet van ons", expenseIds: [], updatedBy: "staff-test" });
    expect(res.body.item.processedAt).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lvs_fixtest npx vitest run server/__tests__/expense-inbox-routes.test.ts`
Expected: FAIL — cannot resolve `../routes/expense-inbox`.

- [ ] **Step 3: Create `server/routes/expense-inbox.ts`**

```ts
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { hasPermission } from "../middleware/permissions.js";
import { UserPermission } from "../../shared/schema";
import {
  EXPENSE_CATEGORIES, INBOX_STATUSES, INVOICE_INBOX_PASSWORD_MASK,
  type InboxParsedInvoice, type InboxStatus,
} from "../../shared/invoice-inbox";
import { storage } from "../storage";
import { AuditLogger } from "../utils/security/auditLogger";
import { OutboundBlockedError, OUTBOUND_BLOCKED_MESSAGE } from "../utils/security/outboundGuard";
import { getInvoiceInboxConfig, invoiceInboxConfigSchema, maskInvoiceInboxConfig, saveInvoiceInboxConfig } from "../services/invoice-inbox/config";
import { inboxStorage } from "../services/invoice-inbox/inbox-storage";
import { computeInvoiceHash } from "../services/invoice-inbox/hash";
import { getInvoiceImapClient, getInvoiceInboxRunState, runInvoiceInboxImport, startInvoiceInboxScheduler } from "../services/invoice-inbox/poller";
import { bookInvoiceAsExpenses, groupLinesByCategory, receiptFromStoredPath, resolveInvoiceFile } from "../services/expenses/book-invoice";

const canManageSettings = hasPermission(UserPermission.MANAGE_SETTINGS);
const canManageExpenses = hasPermission(UserPermission.MANAGE_EXPENSES);

const SERVABLE_TYPES = ["application/pdf", "image/jpeg", "image/png"];

function idParam(req: Request, res: Response): number | null {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ message: "Invalid id" });
    return null;
  }
  return id;
}

const bookSchema = z.object({
  vehicleId: z.coerce.number().int().positive(),
  invoice: z.object({
    vendor: z.string().trim().max(300).default(""),
    invoiceNumber: z.string().trim().max(200).default(""),
    invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Factuurdatum moet JJJJ-MM-DD zijn"),
  }),
  lineItems: z.array(z.object({
    description: z.string().trim().min(1).max(1000),
    amount: z.coerce.number().positive().max(1000000),
    category: z.enum(EXPENSE_CATEGORIES),
  })).min(1).max(200),
  groupByCategory: z.boolean().default(true),
});

const dismissSchema = z.object({ note: z.string().trim().max(500).optional() });

/** Invoices by e-mail: settings, manual run, the review list and its two decisions. */
export function registerExpenseInboxRoutes(app: Express): void {
  const actor = (req: Request) => req.user?.username ?? "system";

  // ---- settings ---------------------------------------------------------------
  app.get("/api/expenses/inbox/config", canManageSettings, async (_req, res) => {
    res.json(maskInvoiceInboxConfig(await getInvoiceInboxConfig()));
  });

  app.put("/api/expenses/inbox/config", canManageSettings, async (req, res) => {
    try {
      const saved = await saveInvoiceInboxConfig(req.body, actor(req));
      await startInvoiceInboxScheduler();
      await AuditLogger.logFromRequest(req, "expense.inbox.config", "settings", 0, { enabled: saved.enabled, host: saved.host, pollMinutes: saved.pollMinutes, senders: saved.allowedSenders.length });
      res.json(maskInvoiceInboxConfig(saved));
    } catch (e) {
      res.status(400).json({ message: e instanceof z.ZodError ? e.errors[0]?.message ?? "Invalid input" : (e as Error).message });
    }
  });

  // Connects with the posted settings (masked or empty password = the stored one) and counts unread mail.
  app.post("/api/expenses/inbox/config/test", canManageSettings, async (req, res) => {
    const parsed = invoiceInboxConfigSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ ok: false, message: parsed.error.errors[0]?.message ?? "Invalid input" });
    const stored = await getInvoiceInboxConfig();
    const password = parsed.data.password === INVOICE_INBOX_PASSWORD_MASK || !parsed.data.password ? stored.password : parsed.data.password;
    try {
      const unseen = await getInvoiceImapClient().withSession({ ...parsed.data, password }, async (session) => (await session.listUnseen()).length);
      res.json({ ok: true, unseen });
    } catch (e) {
      // One answer for every refused destination: the route is not a port scanner (cf. BUG-071).
      if (e instanceof OutboundBlockedError) return res.status(400).json({ ok: false, message: OUTBOUND_BLOCKED_MESSAGE });
      res.status(502).json({ ok: false, message: (e as Error).message });
    }
  });

  // ---- run and status ---------------------------------------------------------
  app.post("/api/expenses/inbox/run", canManageExpenses, async (req, res) => {
    const summary = await runInvoiceInboxImport("manual", actor(req));
    await AuditLogger.logFromRequest(req, "expense.inbox.run", "invoice_inbox", 0, summary as unknown as Record<string, unknown>);
    res.json(summary);
  });

  app.get("/api/expenses/inbox/status", canManageExpenses, async (_req, res) => {
    const config = await getInvoiceInboxConfig();
    res.json({
      enabled: config.enabled && Boolean(config.host),
      ...getInvoiceInboxRunState(),
      reviewCount: await inboxStorage.countByStatus("review"),
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
    });
  });

  // ---- items ------------------------------------------------------------------
  app.get("/api/expenses/inbox/items", canManageExpenses, async (req, res) => {
    const status = String(req.query.status ?? "review");
    if (!(INBOX_STATUSES as readonly string[]).includes(status)) return res.status(400).json({ message: "Unknown status" });
    const limit = Number(req.query.limit ?? 50);
    const offset = Number(req.query.offset ?? 0);
    res.json(await inboxStorage.list({
      status: status as InboxStatus,
      limit: Number.isFinite(limit) ? limit : 50,
      offset: Number.isFinite(offset) ? offset : 0,
    }));
  });

  app.get("/api/expenses/inbox/items/:id", canManageExpenses, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const item = await inboxStorage.get(id);
    if (!item) return res.status(404).json({ message: "Not found" });
    res.json(item);
  });

  app.get("/api/expenses/inbox/items/:id/file", canManageExpenses, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const item = await inboxStorage.get(id);
    // Through the one owner of stored paths, and only inside the invoice folders.
    const abs = item ? resolveInvoiceFile(item.attachmentPath) : null;
    if (!item || !abs) return res.status(404).json({ message: "No file" });
    const type = SERVABLE_TYPES.includes(item.attachmentContentType ?? "") ? item.attachmentContentType! : "application/octet-stream";
    res.setHeader("Content-Type", type);
    res.setHeader("Content-Disposition", `inline; filename="${(item.attachmentName ?? "factuur").replace(/[^A-Za-z0-9._-]/g, "_")}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.sendFile(abs);
  });

  app.post("/api/expenses/inbox/items/:id/book", canManageExpenses, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const body = bookSchema.safeParse(req.body ?? {});
    if (!body.success) return res.status(400).json({ message: body.error.errors[0]?.message ?? "Invalid input" });
    const item = await inboxStorage.get(id);
    if (!item) return res.status(404).json({ message: "Not found" });
    if (item.status !== "review") return res.status(409).json({ message: "Deze factuur is al afgehandeld." });
    const { vehicleId, invoice, lineItems, groupByCategory } = body.data;
    if (!(await storage.getVehicle(vehicleId))) return res.status(404).json({ message: "Vehicle not found" });

    const booked = await bookInvoiceAsExpenses({
      invoice, vehicleId, lineItems: groupByCategory ? groupLinesByCategory(lineItems) : lineItems,
      receipt: receiptFromStoredPath(item.attachmentPath, item.attachmentContentType ?? "application/pdf"),
      inboxItemId: item.id, createdBy: actor(req),
    });
    if (booked.expenses.length === 0) {
      return res.status(400).json({ message: "Er kon geen kostenregel worden aangemaakt.", errors: booked.errors });
    }

    // What staff corrected is what the item says from now on, duplicate check included.
    const total = item.parsed?.totalAmount ?? lineItems.reduce((sum, l) => sum + l.amount, 0);
    const parsed: InboxParsedInvoice = { currency: "EUR", ...(item.parsed ?? {}), ...invoice, totalAmount: total, lineItems };
    const updated = await inboxStorage.update(item.id, {
      status: "booked", reviewReason: null, vehicleId, expenseIds: booked.expenses.map((e) => e.id),
      parsed, invoiceHash: computeInvoiceHash(parsed),
      errorMessage: booked.errors.length ? booked.errors.join("; ").slice(0, 2000) : null,
      processedAt: new Date(), updatedBy: actor(req),
    });
    await AuditLogger.logFromRequest(req, "expense.inbox.book", "invoice_inbox_item", item.id, { vehicleId, expenses: booked.expenses.length });
    res.json({ item: updated, expenses: booked.expenses });
  });

  app.post("/api/expenses/inbox/items/:id/dismiss", canManageExpenses, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const body = dismissSchema.safeParse(req.body ?? {});
    if (!body.success) return res.status(400).json({ message: body.error.errors[0]?.message ?? "Invalid input" });
    const item = await inboxStorage.get(id);
    if (!item) return res.status(404).json({ message: "Not found" });
    if (item.status !== "review") return res.status(409).json({ message: "Deze factuur is al afgehandeld." });
    const updated = await inboxStorage.update(item.id, {
      status: "dismissed", note: body.data.note || null, processedAt: new Date(), updatedBy: actor(req),
    });
    await AuditLogger.logFromRequest(req, "expense.inbox.dismiss", "invoice_inbox_item", item.id, { note: body.data.note ?? null });
    res.json({ item: updated });
  });
}
```

- [ ] **Step 4: Register the routes in `server/routes.ts`**

4a. Next to the other route-module imports at the top add:

```ts
import { registerExpenseInboxRoutes } from "./routes/expense-inbox";
```

4b. Directly above the line `registerExpenseRoutes(app, routeDeps);` add:

```ts
  registerExpenseInboxRoutes(app);
```

(Above, so the literal `/api/expenses/inbox/...` paths are registered before the parameterised `/api/expenses/:id` routes.)

- [ ] **Step 5: Run the route test and the permission matrix**

Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lvs_fixtest npx vitest run server/__tests__/expense-inbox-routes.test.ts server/__tests__/fix-i-permission-matrix.test.ts`
Expected: PASS (9 route tests; the matrix test sees every new route gated by `hasPermissionMiddleware`). If `AuditLogger.logFromRequest` fails in the supertest app because the audit table rejects a missing user id, look at how `server/__tests__/cjib-routes.test.ts` passes with the same call and follow that; do not remove the audit calls.

- [ ] **Step 6: Type check and commit**

Run: `npm run check`
Expected: no new errors.

```bash
git add server/routes/expense-inbox.ts server/routes.ts server/__tests__/expense-inbox-routes.test.ts
git commit -m "feat(kosten): routes voor ontvangen facturen: instellingen, nu ophalen, controlelijst, boeken en afwijzen

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Settings card "Facturen per e-mail (inkomend)" in the E-mail tab

**Files:**
- Create: `client/src/components/expenses/invoice-inbox-config-form.tsx`
- Modify: `client/src/components/settings/settings-panel.tsx` (import near line 8; mount inside `<TabsContent value="email" …>`, directly above the `</TabsContent>` that precedes `<TabsContent value="activity"` near line 2372)
- Modify: `client/src/locales/nl/expenses.json`, `client/src/locales/en/expenses.json` (new top-level key `invoiceInbox` with sub-key `config`)
- Test: `client/src/components/__tests__/invoice-inbox-config-form.test.tsx`

**Interfaces:**
- Consumes: `GET/PUT /api/expenses/inbox/config`, `POST /api/expenses/inbox/config/test`, `POST /api/expenses/inbox/run`, `GET /api/expenses/inbox/status` (Task 8); `InvoiceInboxConfig`, `InvoiceInboxRunSummary` (Task 1); `apiRequest`, `invalidateByPrefix` from `@/lib/queryClient` (existing; `apiRequest` throws an `Error` carrying the server's `message` on a non-2xx answer).
- Produces: `export function InvoiceInboxConfigForm(): JSX.Element | null` and `export const INVOICE_INBOX_CONFIG_QUERY_KEY = ["/api/expenses/inbox/config"]`.

- [ ] **Step 1: Add the Dutch and English texts**

In `client/src/locales/nl/expenses.json` add a new top-level key (after `"vehiclePage"`; mind the comma):

```json
  "invoiceInbox": {
    "config": {
      "title": "Facturen per e-mail (inkomend)",
      "description": "De app leest dit postvak uit. Facturen van vertrouwde afzenders met één herkend kenteken worden automatisch als kosten geboekt; de rest wacht bij Kosten op controle.",
      "enabled": "Postvak automatisch uitlezen",
      "host": "IMAP-server",
      "connection": "Verbinding",
      "connectionTls": "TLS (poort 993)",
      "connectionStartTls": "STARTTLS (poort 143)",
      "username": "Gebruikersnaam",
      "password": "Wachtwoord",
      "inboxFolder": "Map om te lezen",
      "processedFolder": "Map na verwerking",
      "processedFolderHint": "Leeg laten: de mail blijft staan en wordt als gelezen gemarkeerd.",
      "pollMinutes": "Elke hoeveel minuten ophalen",
      "totalTolerance": "Toegestaan verschil regels en totaal (euro)",
      "allowedSenders": "Vertrouwde afzenders",
      "allowedSendersHint": "Eén per regel: een adres (facturen@garage.nl) of een heel domein (@garage.nl). Alleen hun facturen worden automatisch geboekt.",
      "save": "Opslaan",
      "saved": "Instellingen voor facturen per e-mail opgeslagen",
      "test": "Verbinding testen",
      "testOk": "Verbonden, {{count}} ongelezen",
      "testFailed": "Verbinden mislukt",
      "runNow": "Nu ophalen",
      "runDone": "{{mails}} mail(s) opgehaald: {{booked}} geboekt, {{review}} ter controle",
      "geminiMissing": "Let op: GEMINI_API_KEY is niet ingesteld op de server. Facturen kunnen dan niet worden uitgelezen en komen allemaal ter controle."
    }
  }
```

In `client/src/locales/en/expenses.json` add the same structure:

```json
  "invoiceInbox": {
    "config": {
      "title": "Invoices by e-mail (incoming)",
      "description": "The app reads this mailbox. Invoices from trusted senders with one recognised license plate are booked as expenses automatically; the rest waits for review under Expenses.",
      "enabled": "Read the mailbox automatically",
      "host": "IMAP server",
      "connection": "Connection",
      "connectionTls": "TLS (port 993)",
      "connectionStartTls": "STARTTLS (port 143)",
      "username": "Username",
      "password": "Password",
      "inboxFolder": "Folder to read",
      "processedFolder": "Folder after processing",
      "processedFolderHint": "Leave empty: the mail stays in place and is marked as read.",
      "pollMinutes": "Fetch every (minutes)",
      "totalTolerance": "Allowed difference between lines and total (euro)",
      "allowedSenders": "Trusted senders",
      "allowedSendersHint": "One per line: an address (invoices@garage.nl) or a whole domain (@garage.nl). Only their invoices are booked automatically.",
      "save": "Save",
      "saved": "Settings for invoices by e-mail saved",
      "test": "Test connection",
      "testOk": "Connected, {{count}} unread",
      "testFailed": "Connection failed",
      "runNow": "Fetch now",
      "runDone": "{{mails}} mail(s) fetched: {{booked}} booked, {{review}} for review",
      "geminiMissing": "Note: GEMINI_API_KEY is not set on the server. Invoices cannot be read then and will all wait for review."
    }
  }
```

- [ ] **Step 2: Write the failing component test**

Create `client/src/components/__tests__/invoice-inbox-config-form.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InvoiceInboxConfigForm } from "@/components/expenses/invoice-inbox-config-form";

const config = {
  enabled: false, host: "imap.voorbeeld.nl", port: 993, secure: true, username: "fakturenapp@lamgroep.nl", password: "********",
  inboxFolder: "INBOX", processedFolder: "Verwerkt", pollMinutes: 15, allowedSenders: ["@garage.nl", "kees@lamgroep.nl"], totalTolerance: 1,
};
const status = { enabled: false, running: false, lastRun: null, scheduledMinutes: null, reviewCount: 0, geminiConfigured: false };

const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" }, ...init });

describe("InvoiceInboxConfigForm", () => {
  let calls: Array<{ url: string; method: string; body: any }>;

  beforeEach(() => {
    calls = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url.endsWith("/api/expenses/inbox/status")) return json(status);
      if (url.endsWith("/api/expenses/inbox/config/test")) return json({ ok: true, unseen: 2 });
      if (url.endsWith("/api/expenses/inbox/config")) return json(method === "PUT" ? { ...JSON.parse(String(init!.body)), password: "********" } : config);
      return json({}, { status: 404 });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  const mount = () => render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <InvoiceInboxConfigForm />
    </QueryClientProvider>,
  );

  it("shows the stored settings in Dutch, one trusted sender per line, and warns when the AI key is missing", async () => {
    mount();
    expect(await screen.findByText("Facturen per e-mail (inkomend)")).toBeInTheDocument();
    expect(screen.getByLabelText("IMAP-server")).toHaveValue("imap.voorbeeld.nl");
    expect(screen.getByLabelText("Vertrouwde afzenders")).toHaveValue("@garage.nl\nkees@lamgroep.nl");
    expect(await screen.findByText(/GEMINI_API_KEY is niet ingesteld/)).toBeInTheDocument();
  });

  it("tests the connection with what is in the form and shows the unread count", async () => {
    mount();
    await screen.findByLabelText("IMAP-server");
    await userEvent.click(screen.getByRole("button", { name: "Verbinding testen" }));
    expect(await screen.findByText("Verbonden, 2 ongelezen")).toBeInTheDocument();
    const call = calls.find((c) => c.url.endsWith("/config/test"))!;
    expect(call.method).toBe("POST");
    expect(call.body).toMatchObject({ host: "imap.voorbeeld.nl", password: "********" });
  });

  it("saves the trusted senders as a list, skipping empty lines", async () => {
    mount();
    const senders = await screen.findByLabelText("Vertrouwde afzenders");
    await userEvent.clear(senders);
    await userEvent.type(senders, "@garage.nl{enter}{enter}  Facturen@Banden.nl  ");
    await userEvent.click(screen.getByRole("button", { name: "Opslaan" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    expect(calls.find((c) => c.method === "PUT")!.body.allowedSenders).toEqual(["@garage.nl", "Facturen@Banden.nl"]);
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run --project client client/src/components/__tests__/invoice-inbox-config-form.test.tsx`
Expected: FAIL — cannot resolve `@/components/expenses/invoice-inbox-config-form`.

- [ ] **Step 4: Create `client/src/components/expenses/invoice-inbox-config-form.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Inbox, Loader2 } from "lucide-react";
import type { InvoiceInboxConfig, InvoiceInboxRunSummary } from "@shared/invoice-inbox";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

export const INVOICE_INBOX_CONFIG_QUERY_KEY = ["/api/expenses/inbox/config"];
const STATUS_QUERY_KEY = ["/api/expenses/inbox/status"];

type TextField = "host" | "username" | "password" | "inboxFolder" | "processedFolder";
type NumberField = "pollMinutes" | "totalTolerance";

/** Settings card in the E-mail tab: the IMAP mailbox the app reads invoices from. */
export function InvoiceInboxConfigForm() {
  const { t } = useTranslation("expenses");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data } = useQuery<InvoiceInboxConfig>({
    queryKey: INVOICE_INBOX_CONFIG_QUERY_KEY,
    queryFn: async () => (await apiRequest("GET", INVOICE_INBOX_CONFIG_QUERY_KEY[0])).json(),
  });
  const { data: status } = useQuery<{ geminiConfigured: boolean }>({
    queryKey: STATUS_QUERY_KEY,
    queryFn: async () => (await apiRequest("GET", STATUS_QUERY_KEY[0])).json(),
  });
  const [form, setForm] = useState<InvoiceInboxConfig | null>(null);
  const [sendersText, setSendersText] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; unseen?: number; message?: string } | null>(null);

  useEffect(() => {
    if (!data) return;
    setForm(data);
    setSendersText(data.allowedSenders.join("\n"));
  }, [data]);

  /** The form as the API expects it: the textarea split into one entry per non-empty line. */
  const payload = (): InvoiceInboxConfig => ({
    ...form!,
    allowedSenders: sendersText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
  });

  const save = useMutation({
    mutationFn: async () => (await apiRequest("PUT", INVOICE_INBOX_CONFIG_QUERY_KEY[0], payload())).json(),
    onSuccess: (saved: InvoiceInboxConfig) => {
      queryClient.setQueryData(INVOICE_INBOX_CONFIG_QUERY_KEY, saved);
      invalidateByPrefix("/api/expenses/inbox");
      toast({ title: t("invoiceInbox.config.saved") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });
  const test = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/expenses/inbox/config/test", payload())).json(),
    onSuccess: (r: { ok: boolean; unseen: number }) => setTestResult(r),
    onError: (e: Error) => setTestResult({ ok: false, message: e.message }),
  });
  const run = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/expenses/inbox/run")).json(),
    onSuccess: (s: InvoiceInboxRunSummary) => {
      invalidateByPrefix("/api/expenses");
      toast({
        title: t("invoiceInbox.config.runDone", { mails: s.mails, booked: s.booked, review: s.review }),
        description: s.errors.join("\n") || undefined,
        variant: s.errors.length ? "destructive" : "default",
      });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  if (!form) return null;

  const textField = (key: TextField, label: string, extra: Record<string, unknown> = {}) => (
    <div>
      <Label htmlFor={`invoice-inbox-${key}`}>{label}</Label>
      <Input id={`invoice-inbox-${key}`} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} data-testid={`input-invoice-inbox-${key}`} {...extra} />
    </div>
  );
  const numberField = (key: NumberField, label: string, extra: Record<string, unknown> = {}) => (
    <div>
      <Label htmlFor={`invoice-inbox-${key}`}>{label}</Label>
      <Input id={`invoice-inbox-${key}`} type="number" value={String(form[key])} onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })} data-testid={`input-invoice-inbox-${key}`} {...extra} />
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Inbox className="h-5 w-5" />{t("invoiceInbox.config.title")}</CardTitle>
        <CardDescription>{t("invoiceInbox.config.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status && !status.geminiConfigured && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm" data-testid="invoice-inbox-gemini-warning">
            {t("invoiceInbox.config.geminiMissing")}
          </div>
        )}
        <div className="flex items-center gap-3">
          <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} id="invoice-inbox-enabled" data-testid="switch-invoice-inbox-enabled" />
          <Label htmlFor="invoice-inbox-enabled">{t("invoiceInbox.config.enabled")}</Label>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {textField("host", t("invoiceInbox.config.host"), { placeholder: "imap.voorbeeld.nl" })}
          <div>
            <Label htmlFor="invoice-inbox-connection">{t("invoiceInbox.config.connection")}</Label>
            <select
              id="invoice-inbox-connection"
              className="flex h-10 w-full rounded-md border px-3 py-2 text-sm"
              value={form.secure ? "tls" : "starttls"}
              onChange={(e) => setForm({ ...form, secure: e.target.value === "tls", port: e.target.value === "tls" ? 993 : 143 })}
            >
              <option value="tls">{t("invoiceInbox.config.connectionTls")}</option>
              <option value="starttls">{t("invoiceInbox.config.connectionStartTls")}</option>
            </select>
          </div>
          {textField("username", t("invoiceInbox.config.username"), { autoComplete: "off", placeholder: "fakturenapp@lamgroep.nl" })}
          {textField("password", t("invoiceInbox.config.password"), { type: "password", autoComplete: "new-password" })}
          {textField("inboxFolder", t("invoiceInbox.config.inboxFolder"), { placeholder: "INBOX" })}
          <div>
            {textField("processedFolder", t("invoiceInbox.config.processedFolder"), { placeholder: "Verwerkt" })}
            <p className="mt-1 text-xs text-muted-foreground">{t("invoiceInbox.config.processedFolderHint")}</p>
          </div>
          {numberField("pollMinutes", t("invoiceInbox.config.pollMinutes"), { min: 5, max: 1440 })}
          {numberField("totalTolerance", t("invoiceInbox.config.totalTolerance"), { min: 0, max: 100, step: "0.01" })}
        </div>
        <div>
          <Label htmlFor="invoice-inbox-senders">{t("invoiceInbox.config.allowedSenders")}</Label>
          <Textarea id="invoice-inbox-senders" rows={4} value={sendersText} onChange={(e) => setSendersText(e.target.value)} placeholder={"@garage.nl\n@lamgroep.nl"} data-testid="textarea-invoice-inbox-senders" />
          <p className="mt-1 text-xs text-muted-foreground">{t("invoiceInbox.config.allowedSendersHint")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => save.mutate()} disabled={save.isPending} data-testid="button-save-invoice-inbox">{t("invoiceInbox.config.save")}</Button>
          <Button variant="outline" onClick={() => { setTestResult(null); test.mutate(); }} disabled={test.isPending || !form.host} data-testid="button-test-invoice-inbox">
            {test.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{t("invoiceInbox.config.test")}
          </Button>
          <Button variant="outline" onClick={() => run.mutate()} disabled={run.isPending || !form.host} data-testid="button-run-invoice-inbox">
            {run.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{t("invoiceInbox.config.runNow")}
          </Button>
        </div>
        {testResult && (
          <div className={`rounded-md border p-3 text-sm ${testResult.ok ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`} data-testid="invoice-inbox-test-result">
            {testResult.ok
              ? t("invoiceInbox.config.testOk", { count: testResult.unseen ?? 0 })
              : <>{t("invoiceInbox.config.testFailed")}: {testResult.message}</>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Mount the card in the E-mail tab**

In `client/src/components/settings/settings-panel.tsx`:

5a. Below `import { CjibConfigForm } from "@/components/fines/cjib-config-form";` add:

```tsx
import { InvoiceInboxConfigForm } from "@/components/expenses/invoice-inbox-config-form";
```

5b. Inside `<TabsContent value="email" className="space-y-6">`, directly above the `</TabsContent>` that closes it (the one immediately followed by the `{/* … */}` comment or blank line and `<TabsContent value="activity"`), add:

```tsx
          {/* Incoming mail: the mailbox invoices are sent to (docs/superpowers/specs/2026-09-18-invoice-inbox-design.md) */}
          <InvoiceInboxConfigForm />
```

- [ ] **Step 6: Run the component test**

Run: `npx vitest run --project client client/src/components/__tests__/invoice-inbox-config-form.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 7: Run the client guards that watch for untranslated text, then commit**

Run: `npx vitest run --project client client/src/components/__tests__/dutch-ui-leaks.test.tsx client/src/components/__tests__/wave14-labels.test.tsx`
Expected: PASS. Then `npm run check` — no new errors.

```bash
git add client/src/components/expenses/invoice-inbox-config-form.tsx client/src/components/settings/settings-panel.tsx client/src/locales/nl/expenses.json client/src/locales/en/expenses.json client/src/components/__tests__/invoice-inbox-config-form.test.tsx
git commit -m "feat(kosten): instellingen voor het factuurpostvak in het tabblad E-mail, met verbindingstest

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Extract the editable line table from the scanner dialog

**Files:**
- Create: `client/src/components/expenses/invoice-line-items-table.tsx`
- Modify: `client/src/components/invoice-scanner.tsx` (imports lines 35-55, the `EXPENSE_CATEGORIES` constant near line 84, the three handlers near lines 384-415, the table JSX near lines 608-697)
- Modify: `client/src/components/__tests__/wave14-labels.test.tsx` (the file list near line 214)
- Test: `client/src/components/__tests__/invoice-line-items-table.test.tsx`

**Interfaces:**
- Consumes: `EXPENSE_CATEGORIES`, `InboxLineItem` from `@shared/invoice-inbox` (Task 1); `formatExpenseCategory` from `@/lib/format-utils`; existing i18n keys `invoiceScanner.selectAll`, `invoiceScanner.descriptionCol`, `invoiceScanner.amountCol`, `invoiceScanner.categoryCol` (namespace `expenses`).
- Produces:
  ```tsx
  export interface InvoiceLineItemsTableProps {
    items: InboxLineItem[];
    selected: Set<number>;
    onItemsChange: (items: InboxLineItem[]) => void;
    onSelectedChange: (selected: Set<number>) => void;
  }
  export function InvoiceLineItemsTable(props: InvoiceLineItemsTableProps): JSX.Element;
  ```
  Same `data-testid`s as today (`checkbox-item-N`, `input-description-N`, `input-amount-N`, `select-category-N`, `button-remove-N`), so nothing that drives the scanner breaks.

- [ ] **Step 1: Write the failing test**

Create `client/src/components/__tests__/invoice-line-items-table.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import type { InboxLineItem } from "@shared/invoice-inbox";
import { InvoiceLineItemsTable } from "@/components/expenses/invoice-line-items-table";

const LINES: InboxLineItem[] = [
  { description: "Grote beurt", amount: 80, category: "Maintenance" },
  { description: "Remblokken", amount: 50, category: "Brakes" },
  { description: "Ruitenwissers", amount: 20, category: "Accessories" },
];

function Harness({ initialSelected }: { initialSelected: number[] }) {
  const [items, setItems] = useState(LINES);
  const [selected, setSelected] = useState(new Set(initialSelected));
  return (
    <>
      <InvoiceLineItemsTable items={items} selected={selected} onItemsChange={setItems} onSelectedChange={setSelected} />
      <output data-testid="state">{JSON.stringify({ items, selected: Array.from(selected).sort() })}</output>
    </>
  );
}
const state = () => JSON.parse(screen.getByTestId("state").textContent!);

describe("InvoiceLineItemsTable", () => {
  it("shows every line with the Dutch category label and the selection count", () => {
    render(<Harness initialSelected={[0, 1, 2]} />);
    expect(screen.getByTestId("input-description-1")).toHaveValue("Remblokken");
    expect(screen.getByTestId("input-amount-1")).toHaveValue(50);
    expect(screen.getByTestId("select-category-1")).toHaveTextContent("Remmen");
    expect(screen.getByText("Alles selecteren (3/3)")).toBeInTheDocument();
  });

  it("edits a description and an amount in place", async () => {
    render(<Harness initialSelected={[0]} />);
    await userEvent.type(screen.getByTestId("input-description-0"), " APK");
    fireEvent.change(screen.getByTestId("input-amount-0"), { target: { value: "95.5" } });
    expect(state().items[0]).toMatchObject({ description: "Grote beurt APK", amount: 95.5 });
  });

  it("removing a line keeps the selection on the lines it was on", async () => {
    render(<Harness initialSelected={[0, 2]} />);
    await userEvent.click(screen.getByTestId("button-remove-1"));
    expect(state().items.map((i: InboxLineItem) => i.description)).toEqual(["Grote beurt", "Ruitenwissers"]);
    expect(state().selected).toEqual([0, 1]);
  });

  it("toggles one line and all lines", async () => {
    render(<Harness initialSelected={[]} />);
    await userEvent.click(screen.getByTestId("checkbox-item-2"));
    expect(state().selected).toEqual([2]);
    await userEvent.click(screen.getByTestId("checkbox-select-all"));
    expect(state().selected).toEqual([0, 1, 2]);
    await userEvent.click(screen.getByTestId("checkbox-select-all"));
    expect(state().selected).toEqual([]);
  });
});
```

The two Dutch literals are the real ones: `invoiceScanner.selectAll` is `"Alles selecteren ({{selected}}/{{total}})"` in `client/src/locales/nl/expenses.json`, and `formatExpenseCategory("Brakes")` resolves `expenses:form.categories.brakes`, which is `"Remmen"`.

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run --project client client/src/components/__tests__/invoice-line-items-table.test.tsx`
Expected: FAIL — cannot resolve `@/components/expenses/invoice-line-items-table`.

- [ ] **Step 3: Create `client/src/components/expenses/invoice-line-items-table.tsx`**

```tsx
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import { EXPENSE_CATEGORIES, type InboxLineItem } from "@shared/invoice-inbox";
import { formatExpenseCategory } from "@/lib/format-utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface InvoiceLineItemsTableProps {
  items: InboxLineItem[];
  selected: Set<number>;
  onItemsChange: (items: InboxLineItem[]) => void;
  onSelectedChange: (selected: Set<number>) => void;
}

/**
 * The editable invoice lines, shared by the manual scanner dialog and the
 * review dialog of mailed invoices. Controlled: the parent owns both the lines
 * and the selection (indices into `items`).
 */
export function InvoiceLineItemsTable({ items, selected, onItemsChange, onSelectedChange }: InvoiceLineItemsTableProps) {
  const { t } = useTranslation("expenses");
  const selectAllId = useId();

  const update = (index: number, patch: Partial<InboxLineItem>) => {
    onItemsChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };
  const toggle = (index: number) => {
    const next = new Set(selected);
    if (next.has(index)) next.delete(index); else next.add(index);
    onSelectedChange(next);
  };
  const remove = (index: number) => {
    onItemsChange(items.filter((_, i) => i !== index));
    // Indices above the removed line shift down by one.
    const next = new Set<number>();
    selected.forEach((i) => { if (i < index) next.add(i); else if (i > index) next.add(i - 1); });
    onSelectedChange(next);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Checkbox
          id={selectAllId}
          checked={items.length > 0 && selected.size === items.length}
          onCheckedChange={(checked) => onSelectedChange(checked ? new Set(items.map((_, i) => i)) : new Set())}
          data-testid="checkbox-select-all"
        />
        <Label htmlFor={selectAllId} className="text-sm font-medium">
          {t("invoiceScanner.selectAll", { selected: selected.size, total: items.length })}
        </Label>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12"></TableHead>
              <TableHead>{t("invoiceScanner.descriptionCol")}</TableHead>
              <TableHead>{t("invoiceScanner.amountCol")}</TableHead>
              <TableHead>{t("invoiceScanner.categoryCol")}</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, index) => (
              <TableRow key={index}>
                <TableCell>
                  <Checkbox checked={selected.has(index)} onCheckedChange={() => toggle(index)} data-testid={`checkbox-item-${index}`} />
                </TableCell>
                <TableCell>
                  <Input value={item.description} onChange={(e) => update(index, { description: e.target.value })} className="min-w-[200px]" data-testid={`input-description-${index}`} />
                </TableCell>
                <TableCell>
                  <Input type="number" step="0.01" value={item.amount} onChange={(e) => update(index, { amount: parseFloat(e.target.value) || 0 })} className="w-24" data-testid={`input-amount-${index}`} />
                </TableCell>
                <TableCell>
                  <Select value={item.category} onValueChange={(value) => update(index, { category: value })}>
                    <SelectTrigger className="w-32" data-testid={`select-category-${index}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPENSE_CATEGORIES.map((category) => (
                        <SelectItem key={category} value={category}>{formatExpenseCategory(category)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => remove(index)} data-testid={`button-remove-${index}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the table test**

Run: `npx vitest run --project client client/src/components/__tests__/invoice-line-items-table.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Use the table in `client/src/components/invoice-scanner.tsx`**

5a. Add the import:

```tsx
import { InvoiceLineItemsTable } from "@/components/expenses/invoice-line-items-table";
```

5b. In the JSX, inside `{editableLineItems.length > 0 ? ( <div className="space-y-4">`, replace the two sibling blocks — the `<div className="flex items-center gap-2">` that holds the `id="select-all"` checkbox, and the `<div className="border rounded-lg overflow-hidden">` that holds the whole `<Table>` — with:

```tsx
                      <InvoiceLineItemsTable
                        items={editableLineItems}
                        selected={selectedItems}
                        onItemsChange={setEditableLineItems}
                        onSelectedChange={setSelectedItems}
                      />
```

Leave the `<div className="flex justify-between items-center pt-4 border-t">` totals-and-buttons block that follows untouched.

5c. Delete the three handlers that are now unused: `updateLineItem`, `toggleItemSelection`, `removeLineItem` (near lines 384-415).

5d. Delete the local `const EXPENSE_CATEGORIES = [ … ];` (near line 84) and the comment lines directly under it that introduce it.

5e. Remove the imports nothing else in the file uses any more. Search the file for each name first: the `Table, TableBody, TableCell, TableHead, TableHeader, TableRow` import block, the `Select, SelectContent, SelectItem, SelectTrigger, SelectValue` import block, `Checkbox`, `Trash2` (from the lucide import), and `formatExpenseCategory` (from the `@/lib/format-utils` import). `Input`, `Label`, `Switch`, `formatCurrency` and `sumMoney` are still used; keep them.

- [ ] **Step 6: Point the category-label guard at the file that now renders the label**

`client/src/components/__tests__/wave14-labels.test.tsx` asserts that the scanner source contains `formatExpenseCategory`. That call moved. In the test "the three cost screens share one source for the category label", replace the list entry

```ts
      "client/src/components/invoice-scanner.tsx",
```

with

```ts
      // The scanner's line table moved here (invoice inbox, 2026-09-18); the
      // scanner itself no longer renders a category label.
      "client/src/components/expenses/invoice-line-items-table.tsx",
```

- [ ] **Step 7: Run the client suite and type check**

Run: `npx vitest run --project client`
Expected: PASS (all client tests, including `wave14-labels` and `dutch-ui-leaks`). Then `npm run check` — no new errors.

- [ ] **Step 8: Check the manual scanner by hand**

Run the app (`npm run dev`), open Kosten, press the scan button, upload any invoice PDF. Expected: the line table looks and behaves as before (edit, tick, remove, select all, total updates). If `GEMINI_API_KEY` is not set locally the scan itself fails with the existing error toast; in that case the component test of Step 4 is the proof and this step is skipped, and say so in the task report.

- [ ] **Step 9: Commit**

```bash
git add client/src/components/expenses/invoice-line-items-table.tsx client/src/components/invoice-scanner.tsx client/src/components/__tests__/invoice-line-items-table.test.tsx client/src/components/__tests__/wave14-labels.test.tsx
git commit -m "refactor(kosten): factuurregel-tabel uit de scanner gehaald voor hergebruik in de controlelijst

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: "Ontvangen facturen" card, review dialog and live toast

**Files:**
- Create: `client/src/components/expenses/invoice-review-dialog.tsx`
- Create: `client/src/components/expenses/invoice-inbox-card.tsx`
- Modify: `client/src/pages/expenses/index.tsx` (import near line 16; mount directly above `<div className="grid grid-cols-1 md:grid-cols-4 gap-6">` near line 229)
- Modify: `client/src/hooks/use-socket.tsx` (inside the `data-update` handler, directly below the `if (entityType === 'portal') { … }` block near line 83)
- Modify: `client/src/locales/nl/expenses.json`, `client/src/locales/en/expenses.json` (more keys inside the `invoiceInbox` object from Task 9)
- Test: `client/src/components/__tests__/invoice-inbox-card.test.tsx`

**Interfaces:**
- Consumes: routes of Task 8; `InvoiceLineItemsTable` (Task 10); `InvoiceInboxItem`, `Vehicle` from `@shared/schema`; `InboxLineItem`, `InboxStatus`, `InvoiceInboxRunSummary` from `@shared/invoice-inbox`; `VehicleSelector` (`{ vehicles, value, onChange, placeholder, className }`), `formatCurrency`, `displayLicensePlate`, `apiRequest`, `invalidateByPrefix` (existing).
- Produces:
  ```tsx
  // invoice-review-dialog.tsx — what the API sends: timestamps arrive as strings
  export type InboxListItem = Omit<InvoiceInboxItem, "receivedAt" | "processedAt" | "mailDate"> & {
    receivedAt: string; processedAt: string | null; mailDate: string | null; vehiclePlate: string | null;
  };
  export function InvoiceReviewDialog(props: { item: InboxListItem | null; vehicles: Vehicle[]; onClose: () => void }): JSX.Element | null;
  // invoice-inbox-card.tsx
  export function InvoiceInboxCard(): JSX.Element;
  ```

- [ ] **Step 1: Add the texts**

In `client/src/locales/nl/expenses.json`, inside the `"invoiceInbox"` object and before its `"config"` key, add:

```json
    "title": "Ontvangen facturen",
    "description": "Facturen die per e-mail zijn binnengekomen. Wat de app zeker weet is al geboekt; de rest wacht hier op controle.",
    "disabledHint": "Facturen per e-mail staat uit. Zet het aan bij Instellingen, tabblad E-mail.",
    "fetchNow": "Nu ophalen",
    "lastRun": "Laatst opgehaald {{time}}: {{booked}} geboekt, {{review}} ter controle",
    "lastRunFailed": "Ophalen mislukt: {{error}}",
    "neverRun": "Nog niet opgehaald sinds de app is gestart",
    "runDone": "{{mails}} mail(s) opgehaald: {{booked}} geboekt, {{review}} ter controle",
    "manualScan": "handmatige scan",
    "reviewButton": "Controleren",
    "viewButton": "Bekijken",
    "tabs": { "review": "Te controleren", "booked": "Geboekt", "dismissed": "Afgewezen" },
    "columns": {
      "received": "Ontvangen", "sender": "Afzender", "vendor": "Leverancier", "invoiceNumber": "Factuurnummer",
      "total": "Totaal", "reason": "Reden", "vehicle": "Voertuig", "note": "Notitie"
    },
    "empty": { "review": "Niets te controleren.", "booked": "Nog geen geboekte facturen.", "dismissed": "Geen afgewezen facturen." },
    "reasons": {
      "no_attachment": "Geen bruikbare bijlage",
      "parse_failed": "Uitlezen mislukt",
      "unknown_sender": "Onbekende afzender",
      "duplicate": "Mogelijk dubbel",
      "no_plate": "Geen kenteken gevonden",
      "multiple_plates": "Meerdere kentekens",
      "plate_unknown": "Kenteken niet in de vloot",
      "total_mismatch": "Bedragen kloppen niet"
    },
    "dialog": {
      "title": "Factuur controleren",
      "titleReadOnly": "Factuur bekijken",
      "description": "Controleer wat de app heeft uitgelezen, kies het voertuig en boek de kosten.",
      "previewTitle": "Factuur",
      "noAttachment": "Deze mail had geen bruikbare bijlage.",
      "vendor": "Leverancier",
      "invoiceNumber": "Factuurnummer",
      "invoiceDate": "Factuurdatum",
      "vehicle": "Voertuig",
      "vehiclePlaceholder": "Kies een voertuig",
      "platesFound": "Gevonden kentekens: {{plates}}",
      "groupByCategory": "Eén kostenregel per categorie",
      "addLine": "Regel toevoegen",
      "appMessage": "Melding van de app: {{message}}",
      "book": "Boeken",
      "dismiss": "Afwijzen",
      "dismissNote": "Waarom afwijzen? (optioneel)",
      "bookedToast": "{{count}} kostenregel(s) geboekt",
      "dismissedToast": "Factuur afgewezen"
    },
```

In `client/src/locales/en/expenses.json`, inside `"invoiceInbox"` and before `"config"`, add:

```json
    "title": "Received invoices",
    "description": "Invoices that arrived by e-mail. What the app is sure about has been booked; the rest waits here for review.",
    "disabledHint": "Invoices by e-mail is switched off. Switch it on under Settings, tab E-mail.",
    "fetchNow": "Fetch now",
    "lastRun": "Last fetched {{time}}: {{booked}} booked, {{review}} for review",
    "lastRunFailed": "Fetching failed: {{error}}",
    "neverRun": "Not fetched since the app started",
    "runDone": "{{mails}} mail(s) fetched: {{booked}} booked, {{review}} for review",
    "manualScan": "manual scan",
    "reviewButton": "Review",
    "viewButton": "View",
    "tabs": { "review": "To review", "booked": "Booked", "dismissed": "Dismissed" },
    "columns": {
      "received": "Received", "sender": "Sender", "vendor": "Vendor", "invoiceNumber": "Invoice number",
      "total": "Total", "reason": "Reason", "vehicle": "Vehicle", "note": "Note"
    },
    "empty": { "review": "Nothing to review.", "booked": "No booked invoices yet.", "dismissed": "No dismissed invoices." },
    "reasons": {
      "no_attachment": "No usable attachment",
      "parse_failed": "Reading failed",
      "unknown_sender": "Unknown sender",
      "duplicate": "Possible duplicate",
      "no_plate": "No license plate found",
      "multiple_plates": "Several license plates",
      "plate_unknown": "License plate not in the fleet",
      "total_mismatch": "Amounts do not add up"
    },
    "dialog": {
      "title": "Review invoice",
      "titleReadOnly": "View invoice",
      "description": "Check what the app read, choose the vehicle and book the expenses.",
      "previewTitle": "Invoice",
      "noAttachment": "This mail had no usable attachment.",
      "vendor": "Vendor",
      "invoiceNumber": "Invoice number",
      "invoiceDate": "Invoice date",
      "vehicle": "Vehicle",
      "vehiclePlaceholder": "Choose a vehicle",
      "platesFound": "License plates found: {{plates}}",
      "groupByCategory": "One expense per category",
      "addLine": "Add line",
      "appMessage": "Message from the app: {{message}}",
      "book": "Book",
      "dismiss": "Dismiss",
      "dismissNote": "Why dismiss? (optional)",
      "bookedToast": "{{count}} expense(s) booked",
      "dismissedToast": "Invoice dismissed"
    },
```

- [ ] **Step 2: Write the failing test**

Create `client/src/components/__tests__/invoice-inbox-card.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InvoiceInboxCard } from "@/components/expenses/invoice-inbox-card";

const item = (over: Record<string, unknown> = {}) => ({
  id: 12, messageId: "<a@b>", fromAddress: "facturen@garage.nl", subject: "Factuur 2026-0412", mailDate: "2026-09-10T08:00:00.000Z",
  attachmentName: "factuur.pdf", attachmentPath: "invoice-inbox/1_abcd1234_factuur.pdf", attachmentHash: "h", attachmentContentType: "application/pdf",
  invoiceHash: "i", status: "review", reviewReason: "no_plate", vehicleId: null, expenseIds: [], errorMessage: null, note: null,
  receivedAt: "2026-09-10T08:05:00.000Z", processedAt: null, createdBy: "scheduler", updatedBy: null, vehiclePlate: null,
  parsed: {
    vendor: "Garage Jansen", invoiceNumber: "2026-0412", invoiceDate: "2026-09-10", currency: "EUR", totalAmount: 181.5, plates: [],
    lineItems: [{ description: "Grote beurt", amount: 100, category: "Maintenance" }, { description: "Remblokken", amount: 50, category: "Brakes" }],
  },
  ...over,
});
const vehicles = [{ id: 7, licensePlate: "V-123-XB", brand: "Volkswagen", model: "Crafter" }];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("InvoiceInboxCard", () => {
  let reviewItems: unknown[];
  let calls: Array<{ url: string; method: string; body: any }>;

  beforeEach(() => {
    reviewItems = [item()];
    calls = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url.includes("/api/expenses/inbox/status")) return json({ enabled: true, running: false, lastRun: null, scheduledMinutes: 15, reviewCount: reviewItems.length, geminiConfigured: true });
      if (url.includes("/api/expenses/inbox/items?status=review")) return json(reviewItems);
      if (url.includes("/api/expenses/inbox/items?status=")) return json([]);
      if (url.endsWith("/book")) return json({ item: item({ status: "booked" }), expenses: [{ id: 1 }] });
      if (url.includes("/api/vehicles")) return json(vehicles);
      return json({}, 404);
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  const mount = () => render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <InvoiceInboxCard />
    </QueryClientProvider>,
  );

  it("lists what waits for review, with the reason in Dutch and the count in the badge", async () => {
    mount();
    expect(await screen.findByText("Ontvangen facturen")).toBeInTheDocument();
    const row = (await screen.findByText("Garage Jansen")).closest("tr")!;
    expect(within(row).getByText("Geen kenteken gevonden")).toBeInTheDocument();
    expect(within(row).getByText("facturen@garage.nl")).toBeInTheDocument();
    expect(within(row).getByText("2026-0412")).toBeInTheDocument();
    expect(screen.getByTestId("badge-invoice-inbox-review")).toHaveTextContent("1");
  });

  it("opens the review dialog pre-filled, and will not book without a vehicle", async () => {
    mount();
    await userEvent.click(await screen.findByRole("button", { name: "Controleren" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Factuur controleren")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Leverancier")).toHaveValue("Garage Jansen");
    expect(within(dialog).getByLabelText("Factuurnummer")).toHaveValue("2026-0412");
    expect(within(dialog).getByLabelText("Factuurdatum")).toHaveValue("2026-09-10");
    expect(within(dialog).getByTestId("input-description-1")).toHaveValue("Remblokken");
    expect(within(dialog).getByRole("button", { name: "Boeken" })).toBeDisabled();
  });

  it("books the ticked lines on the pre-filled vehicle", async () => {
    reviewItems = [item({ vehicleId: 7, reviewReason: "unknown_sender" })];
    mount();
    await userEvent.click(await screen.findByRole("button", { name: "Controleren" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByTestId("checkbox-item-1"));
    const book = within(dialog).getByRole("button", { name: "Boeken" });
    await waitFor(() => expect(book).toBeEnabled());
    await userEvent.click(book);
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/api/expenses/inbox/items/12/book"))).toBe(true));
    expect(calls.find((c) => c.url.endsWith("/book"))!.body).toEqual({
      vehicleId: 7,
      invoice: { vendor: "Garage Jansen", invoiceNumber: "2026-0412", invoiceDate: "2026-09-10" },
      lineItems: [{ description: "Grote beurt", amount: 100, category: "Maintenance" }],
      groupByCategory: true,
    });
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run --project client client/src/components/__tests__/invoice-inbox-card.test.tsx`
Expected: FAIL — cannot resolve `@/components/expenses/invoice-inbox-card`.

- [ ] **Step 4: Create `client/src/components/expenses/invoice-review-dialog.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2, Plus } from "lucide-react";
import type { InvoiceInboxItem, Vehicle } from "@shared/schema";
import type { InboxLineItem } from "@shared/invoice-inbox";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { formatCurrency, formatExpenseCategory } from "@/lib/format-utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { VehicleSelector } from "@/components/ui/vehicle-selector";
import { useToast } from "@/hooks/use-toast";
import { InvoiceLineItemsTable } from "./invoice-line-items-table";

/** What the API sends: timestamps arrive as strings, and the list adds the plate. */
export type InboxListItem = Omit<InvoiceInboxItem, "receivedAt" | "processedAt" | "mailDate"> & {
  receivedAt: string; processedAt: string | null; mailDate: string | null; vehiclePlate: string | null;
};

interface Props {
  item: InboxListItem | null;
  vehicles: Vehicle[];
  onClose: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);

/** Attachment on the left; what the app read, editable, on the right. Read-only for handled items. */
export function InvoiceReviewDialog({ item, vehicles, onClose }: Props) {
  const { t } = useTranslation("expenses");
  const { toast } = useToast();
  const [vendor, setVendor] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [lines, setLines] = useState<InboxLineItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [groupByCategory, setGroupByCategory] = useState(true);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!item) return;
    const parsedLines = item.parsed?.lineItems ?? [];
    setVendor(item.parsed?.vendor ?? "");
    setInvoiceNumber(item.parsed?.invoiceNumber ?? "");
    setInvoiceDate(/^\d{4}-\d{2}-\d{2}$/.test(item.parsed?.invoiceDate ?? "") ? item.parsed!.invoiceDate : today());
    setVehicleId(item.vehicleId ? String(item.vehicleId) : "");
    setLines(parsedLines);
    setSelected(new Set(parsedLines.map((_, i) => i)));
    setGroupByCategory(true);
    setNote("");
  }, [item?.id]);

  const done = (title: string) => {
    toast({ title });
    invalidateByPrefix("/api/expenses");
    onClose();
  };

  const book = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/expenses/inbox/items/${item!.id}/book`, {
      vehicleId: Number(vehicleId),
      invoice: { vendor, invoiceNumber, invoiceDate },
      lineItems: lines.filter((_, i) => selected.has(i)).map(({ description, amount, category }) => ({ description, amount, category })),
      groupByCategory,
    })).json(),
    onSuccess: (r: { expenses: unknown[] }) => done(t("invoiceInbox.dialog.bookedToast", { count: r.expenses.length })),
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });
  const dismiss = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/expenses/inbox/items/${item!.id}/dismiss`, { note: note.trim() || undefined })).json(),
    onSuccess: () => done(t("invoiceInbox.dialog.dismissedToast")),
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  if (!item) return null;

  const readOnly = item.status !== "review";
  const chosen = lines.filter((_, i) => selected.has(i));
  const canBook = !readOnly && vehicleId !== "" && /^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)
    && chosen.length > 0 && chosen.every((l) => l.description.trim() !== "" && l.amount > 0);
  const fileUrl = `/api/expenses/inbox/items/${item.id}/file`;
  const isImage = (item.attachmentContentType ?? "").startsWith("image/");

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex h-[90vh] max-w-6xl flex-col">
        <DialogHeader>
          <DialogTitle>{readOnly ? t("invoiceInbox.dialog.titleReadOnly") : t("invoiceInbox.dialog.title")}</DialogTitle>
          <DialogDescription>
            {item.reviewReason ? `${t(`invoiceInbox.reasons.${item.reviewReason}`)}. ` : ""}{t("invoiceInbox.dialog.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-2">
          <div className="min-h-[300px] overflow-hidden rounded border">
            {!item.attachmentPath ? (
              <p className="p-4 text-sm text-muted-foreground">{t("invoiceInbox.dialog.noAttachment")}</p>
            ) : isImage ? (
              <img src={fileUrl} alt={t("invoiceInbox.dialog.previewTitle")} className="h-full w-full object-contain" />
            ) : (
              <iframe src={fileUrl} title={t("invoiceInbox.dialog.previewTitle")} className="h-full w-full border-0" />
            )}
          </div>

          <div className="space-y-4 overflow-y-auto pr-1">
            {item.errorMessage && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">{t("invoiceInbox.dialog.appMessage", { message: item.errorMessage })}</div>
            )}
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <Label htmlFor="inbox-vendor">{t("invoiceInbox.dialog.vendor")}</Label>
                <Input id="inbox-vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} disabled={readOnly} />
              </div>
              <div>
                <Label htmlFor="inbox-number">{t("invoiceInbox.dialog.invoiceNumber")}</Label>
                <Input id="inbox-number" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} disabled={readOnly} />
              </div>
              <div>
                <Label htmlFor="inbox-date">{t("invoiceInbox.dialog.invoiceDate")}</Label>
                <Input id="inbox-date" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} disabled={readOnly} />
              </div>
            </div>

            <div>
              <Label>{t("invoiceInbox.dialog.vehicle")}</Label>
              <VehicleSelector vehicles={vehicles} value={vehicleId} onChange={setVehicleId} placeholder={t("invoiceInbox.dialog.vehiclePlaceholder")} disabled={readOnly} className="w-full" />
              {(item.parsed?.plates?.length ?? 0) > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">{t("invoiceInbox.dialog.platesFound", { plates: item.parsed!.plates!.join(", ") })}</p>
              )}
            </div>

            {readOnly ? (
              <ul className="space-y-1 text-sm">
                {lines.map((line, i) => (
                  <li key={i} className="flex justify-between gap-3 border-b py-1">
                    <span>{line.description} · {formatExpenseCategory(line.category)}</span>
                    <span>{formatCurrency(line.amount)}</span>
                  </li>
                ))}
                {item.note && <li className="pt-2 text-muted-foreground">{item.note}</li>}
              </ul>
            ) : (
              <>
                <InvoiceLineItemsTable items={lines} selected={selected} onItemsChange={setLines} onSelectedChange={setSelected} />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Button
                    variant="outline" size="sm"
                    onClick={() => { setLines([...lines, { description: "", amount: 0, category: "Other" }]); setSelected(new Set([...Array.from(selected), lines.length])); }}
                    data-testid="button-inbox-add-line"
                  >
                    <Plus className="mr-1.5 h-4 w-4" />{t("invoiceInbox.dialog.addLine")}
                  </Button>
                  <div className="flex items-center gap-2">
                    <Switch id="inbox-group" checked={groupByCategory} onCheckedChange={setGroupByCategory} />
                    <Label htmlFor="inbox-group" className="text-sm">{t("invoiceInbox.dialog.groupByCategory")}</Label>
                  </div>
                </div>
                <div>
                  <Label htmlFor="inbox-note">{t("invoiceInbox.dialog.dismissNote")}</Label>
                  <Input id="inbox-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
                </div>
                <div className="flex justify-between gap-2 border-t pt-4">
                  <Button variant="outline" onClick={() => dismiss.mutate()} disabled={dismiss.isPending || book.isPending} data-testid="button-inbox-dismiss">
                    {dismiss.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{t("invoiceInbox.dialog.dismiss")}
                  </Button>
                  <Button onClick={() => book.mutate()} disabled={!canBook || book.isPending || dismiss.isPending} data-testid="button-inbox-book">
                    {book.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{t("invoiceInbox.dialog.book")}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Create `client/src/components/expenses/invoice-inbox-card.tsx`**

```tsx
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Inbox, Loader2, RefreshCw } from "lucide-react";
import type { Vehicle } from "@shared/schema";
import type { InboxStatus, InvoiceInboxRunSummary, ReviewReason } from "@shared/invoice-inbox";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/format-utils";
import { displayLicensePlate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { InvoiceReviewDialog, type InboxListItem } from "./invoice-review-dialog";

interface InboxStatusResponse {
  enabled: boolean;
  running: boolean;
  lastRun: InvoiceInboxRunSummary | null;
  scheduledMinutes: number | null;
  reviewCount: number;
  geminiConfigured: boolean;
}

const TABS: InboxStatus[] = ["review", "booked", "dismissed"];
const dateTime = (iso: string) => new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));

/** Kosten page: invoices that arrived by e-mail — waiting for review, booked, dismissed. */
export function InvoiceInboxCard() {
  const { t } = useTranslation("expenses");
  const { toast } = useToast();
  const [tab, setTab] = useState<InboxStatus>("review");
  const [openItem, setOpenItem] = useState<InboxListItem | null>(null);

  const { data: status } = useQuery<InboxStatusResponse>({
    queryKey: ["/api/expenses/inbox/status"],
    queryFn: async () => (await apiRequest("GET", "/api/expenses/inbox/status")).json(),
    refetchInterval: 60_000,
  });
  const { data: items = [] } = useQuery<InboxListItem[]>({
    queryKey: ["/api/expenses/inbox/items", tab],
    queryFn: async () => (await apiRequest("GET", `/api/expenses/inbox/items?status=${tab}&limit=100`)).json(),
  });
  const { data: vehicles = [] } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles"],
    queryFn: async () => (await apiRequest("GET", "/api/vehicles")).json(),
    enabled: openItem !== null,
  });

  const run = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/expenses/inbox/run")).json(),
    onSuccess: (s: InvoiceInboxRunSummary) => {
      invalidateByPrefix("/api/expenses");
      toast({
        title: t("invoiceInbox.runDone", { mails: s.mails, booked: s.booked, review: s.review }),
        description: s.errors.join("\n") || undefined,
        variant: s.errors.length ? "destructive" : "default",
      });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const lastRun = status?.lastRun;
  const lastRunText = !lastRun
    ? t("invoiceInbox.neverRun")
    : lastRun.errors.length && lastRun.mails === 0
      ? t("invoiceInbox.lastRunFailed", { error: lastRun.errors[0] })
      : t("invoiceInbox.lastRun", { time: dateTime(lastRun.finishedAt), booked: lastRun.booked, review: lastRun.review });

  return (
    <Card data-testid="card-invoice-inbox">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Inbox className="h-5 w-5" />
              {t("invoiceInbox.title")}
              {(status?.reviewCount ?? 0) > 0 && <Badge data-testid="badge-invoice-inbox-review">{status!.reviewCount}</Badge>}
            </CardTitle>
            <CardDescription>{t("invoiceInbox.description")}</CardDescription>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Button variant="outline" size="sm" onClick={() => run.mutate()} disabled={run.isPending || !status?.enabled} data-testid="button-invoice-inbox-run">
              {run.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
              {t("invoiceInbox.fetchNow")}
            </Button>
            <span className={`text-xs ${lastRun?.errors.length ? "text-red-600" : "text-muted-foreground"}`}>{lastRunText}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {status && !status.enabled && <p className="text-sm text-muted-foreground">{t("invoiceInbox.disabledHint")}</p>}

        <Tabs value={tab} onValueChange={(v) => setTab(v as InboxStatus)}>
          <TabsList>
            {TABS.map((s) => <TabsTrigger key={s} value={s} data-testid={`tab-invoice-inbox-${s}`}>{t(`invoiceInbox.tabs.${s}`)}</TabsTrigger>)}
          </TabsList>
        </Tabs>

        {items.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{t(`invoiceInbox.empty.${tab}`)}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("invoiceInbox.columns.received")}</TableHead>
                  <TableHead>{t("invoiceInbox.columns.sender")}</TableHead>
                  <TableHead>{t("invoiceInbox.columns.vendor")}</TableHead>
                  <TableHead>{t("invoiceInbox.columns.invoiceNumber")}</TableHead>
                  <TableHead className="text-right">{t("invoiceInbox.columns.total")}</TableHead>
                  <TableHead>{tab === "review" ? t("invoiceInbox.columns.reason") : tab === "booked" ? t("invoiceInbox.columns.vehicle") : t("invoiceInbox.columns.note")}</TableHead>
                  <TableHead className="w-32"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id} data-testid={`row-invoice-inbox-${item.id}`}>
                    <TableCell className="whitespace-nowrap">{dateTime(item.receivedAt)}</TableCell>
                    <TableCell>{item.fromAddress ?? t("invoiceInbox.manualScan")}</TableCell>
                    <TableCell>{item.parsed?.vendor || item.subject || "-"}</TableCell>
                    <TableCell>{item.parsed?.invoiceNumber || "-"}</TableCell>
                    <TableCell className="text-right">{item.parsed?.totalAmount ? formatCurrency(item.parsed.totalAmount) : "-"}</TableCell>
                    <TableCell>
                      {tab === "review" && item.reviewReason ? t(`invoiceInbox.reasons.${item.reviewReason as ReviewReason}`)
                        : tab === "booked" ? (item.vehiclePlate ? displayLicensePlate(item.vehiclePlate) : "-")
                        : item.note || "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant={tab === "review" ? "default" : "outline"} onClick={() => setOpenItem(item)}>
                        {tab === "review" ? t("invoiceInbox.reviewButton") : t("invoiceInbox.viewButton")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <InvoiceReviewDialog item={openItem} vehicles={vehicles} onClose={() => setOpenItem(null)} />
    </Card>
  );
}
```

- [ ] **Step 6: Run the card test**

Run: `npx vitest run --project client client/src/components/__tests__/invoice-inbox-card.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 7: Mount the card and wire the live toast**

7a. In `client/src/pages/expenses/index.tsx`, below `import { InvoiceScanner } from "@/components/invoice-scanner";` add:

```tsx
import { InvoiceInboxCard } from "@/components/expenses/invoice-inbox-card";
```

and directly above the line `<div className="grid grid-cols-1 md:grid-cols-4 gap-6">` add:

```tsx
      <InvoiceInboxCard />
```

7b. In `client/src/hooks/use-socket.tsx`, inside the `data-update` handler, directly below the closing `}` of the `if (entityType === 'portal') { … }` block, add:

```tsx
      // An invoice arrived by e-mail (server/services/invoice-inbox/notify.ts):
      // say so right away and refresh the costs, the inbox card and the bell.
      if (entityType === 'invoice-inbox') {
        toast({ title: data?.title ?? 'Ontvangen facturen', description: data?.description });
        queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/api/expenses') });
        queryClient.invalidateQueries({ queryKey: ['/api/custom-notifications/unread'] });
        return;
      }
```

- [ ] **Step 8: Run the whole client suite, type check, look at it**

Run: `npx vitest run --project client`
Expected: PASS. Then `npm run check` — no new errors.

Run the app (`npm run dev`), open Kosten. Expected: the card "Ontvangen facturen" above the costs table; with the feature off it shows the hint and a disabled "Nu ophalen". Open Instellingen, tab E-mail: the card "Facturen per e-mail (inkomend)" is at the bottom. Take one screenshot of each for the task report.

- [ ] **Step 9: Commit**

```bash
git add client/src/components/expenses/invoice-review-dialog.tsx client/src/components/expenses/invoice-inbox-card.tsx client/src/pages/expenses/index.tsx client/src/hooks/use-socket.tsx client/src/locales/nl/expenses.json client/src/locales/en/expenses.json client/src/components/__tests__/invoice-inbox-card.test.tsx
git commit -m "feat(kosten): kaart Ontvangen facturen met controledialoog, boeken en afwijzen, en live melding

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Manual, deployment notes and the full verification run

**Files:**
- Modify: `docs/gebruikershandleiding/09-email.md` (new section 9.9 at the end)
- Modify: `.env.coolify` (comment block for `GEMINI_API_KEY`)

**Interfaces:**
- Consumes: everything above. Produces documentation and the evidence that the whole suite is green.

- [ ] **Step 1: Add section 9.9 to `docs/gebruikershandleiding/09-email.md`**

Append at the end of the file:

```markdown
## 9.9 Facturen per e-mail ontvangen

De app heeft een eigen postvak: **fakturenapp@lamgroep.nl**. Elke factuur die daar
binnenkomt, leest de app zelf uit en boekt hij als kosten op het juiste voertuig.
Vraag het onderhoudsbedrijf om dit adres als extra ontvanger (CC) op elke factuur te
zetten. Zelf een factuur doorsturen vanaf een `@lamgroep.nl`-adres werkt hetzelfde.

### Wanneer boekt de app automatisch?

Alleen als alles klopt:

- de afzender staat in de lijst **Vertrouwde afzenders**;
- er staat precies één kenteken op de factuur, en dat kenteken zit in de vloot;
- de factuur is niet eerder binnengekomen;
- de regels tellen op tot het totaal (excl. of incl. btw), op hooguit 1 euro na;
- de factuurdatum ligt niet in de toekomst.

Dan maakt de app één kostenregel per categorie (bijvoorbeeld Onderhoud en Remmen), hangt
de factuur als bon aan elke regel en zet een melding in de bel:
"Factuur van Garage Jansen geboekt op V-123-XB".

### Wat als de app twijfelt?

Dan wordt er **niets geboekt**. De factuur komt op de pagina **Kosten** in de kaart
**Ontvangen facturen**, tabblad **Te controleren**, met de reden erbij:

| Reden | Wat je doet |
| --- | --- |
| Onbekende afzender | Controleer of de factuur echt is. Zo ja: boeken, en zet de afzender in de lijst. |
| Geen kenteken gevonden | Kies zelf het voertuig. |
| Meerdere kentekens | Kies het voertuig waar de kosten op horen. Splitsen over voertuigen kan niet; boek dan met de hand. |
| Kenteken niet in de vloot | Verkeerd gelezen of niet van ons. Kies het voertuig of wijs af. |
| Mogelijk dubbel | Dezelfde factuur is al geboekt of wacht al. Meestal: afwijzen. |
| Bedragen kloppen niet | Kijk de regels na naast de factuur en verbeter ze. |
| Uitlezen mislukt | Vul leverancier, datum en regels zelf in; de factuur staat ernaast. |
| Geen bruikbare bijlage | De mail had geen PDF of foto. Vraag de factuur opnieuw op of wijs af. |

Klik op **Controleren**. Links staat de factuur, rechts wat de app heeft gelezen. Pas aan
wat niet klopt, kies het voertuig en klik op **Boeken**. Hoort de factuur niet in de app,
klik dan op **Afwijzen** (met eventueel een korte notitie). Afgewezen en geboekte facturen
blijven terug te vinden in de andere twee tabbladen.

### Instellen

**Instellingen, tabblad E-mail, kaart "Facturen per e-mail (inkomend)".** Hiervoor is het
recht *instellingen beheren* nodig.

1. Vul de IMAP-server, de gebruikersnaam en het wachtwoord van het postvak in. Deze
   gegevens staan in het beheerpaneel van de webhosting. Verbinding: TLS (poort 993).
2. **Map na verwerking**: `Verwerkt`. De app verplaatst elke afgehandelde mail daarheen,
   zodat het postvak leeg blijft. Werkt dat bij jullie provider niet, probeer dan
   `INBOX.Verwerkt`. Leeg laten mag ook: de mail blijft dan staan als gelezen.
3. **Vertrouwde afzenders**: één per regel. Een adres (`facturen@garage.nl`) of een heel
   domein (`@garage.nl`). Zet er ook `@lamgroep.nl` in als je zelf facturen wilt doorsturen.
4. Klik op **Verbinding testen**. Je ziet "Verbonden, 3 ongelezen" of de foutmelding van
   de mailserver.
5. Zet **Postvak automatisch uitlezen** aan en klik op **Opslaan**. De app kijkt daarna
   elke 15 minuten (instelbaar). Met **Nu ophalen** hoef je daar niet op te wachten.

### Als het niet werkt

- **"Ophalen mislukt" in de kaart, of de melding "Postvak facturen onbereikbaar"**: het
  wachtwoord is gewijzigd of de mailserver is onbereikbaar. Test de verbinding bij de
  instellingen.
- **Alles komt ter controle met "Uitlezen mislukt"**: de sleutel voor de AI-dienst
  (`GEMINI_API_KEY`) ontbreekt op de server. De instellingenkaart waarschuwt hiervoor.
- **Een factuur is op het verkeerde voertuig geboekt**: verwijder de kostenregels bij dat
  voertuig en voer ze met de hand opnieuw in bij het juiste voertuig (Kosten, knop
  **Kosten vastleggen**). Opnieuw scannen kan niet: de app kent de factuur al en weigert
  hem als dubbel.
- **Handmatig scannen zegt "Deze factuur is al geboekt"**: dat klopt dan ook. Dezelfde
  factuur is al via de mail of een eerdere scan verwerkt. Kijk in het tabblad **Geboekt**.
```

- [ ] **Step 2: Document the AI key in `.env.coolify`**

Below the `UPLOAD_DIR=...` line add:

```
# Invoice scanning (manual scan and invoices by e-mail)
# Google Gemini API key. Without it every mailed invoice ends up under
# "Te controleren" with the reason "Uitlezen mislukt".
GEMINI_API_KEY=
```

- [ ] **Step 3: Run the complete verification**

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lvs_fixtest npx vitest run
npm run check
npm run build
```

Expected: the whole vitest workspace passes (server and client projects); `tsc` reports no errors; the build ends without errors and `git status` shows no change to `schema-columns.json` (the build re-exports it; a diff here means Task 2 Step 5 was skipped). If a test outside this feature fails, run it on the commit before Task 1 to tell a pre-existing failure from a regression, and report which it is; do not "fix" unrelated tests.

- [ ] **Step 4: Prove the migration is additive on a copy of production-shaped data**

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lvs_fixtest node startup-migration.js
```

Expected: `✅ Database migration completed successfully!` with the inbox table reported as already existing — the second run changes nothing.

- [ ] **Step 5: Live check against the real mailbox (needs the user)**

This step cannot be done by an agent: the mailbox password must be typed by the user. Ask the user to:

1. create `fakturenapp@lamgroep.nl` and the folder `Verwerkt` at the web host;
2. start the app, open Instellingen, tab E-mail, fill in the card and press **Verbinding testen**;
3. add their own address to the trusted senders, mail one real invoice PDF to the mailbox, press **Nu ophalen** on the Kosten page.

Expected: the invoice is either booked on the right vehicle (notification in the bell, expense lines with the PDF attached) or appears under **Te controleren** with a reason, and the mail has moved to `Verwerkt`. Record the outcome in the task report. If the move fails on this provider, set the folder to `INBOX.Verwerkt` and repeat.

- [ ] **Step 6: Commit**

```bash
git add docs/gebruikershandleiding/09-email.md .env.coolify
git commit -m "docs(kosten): handleiding facturen per e-mail en GEMINI_API_KEY in het Coolify-sjabloon

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Deployment (after the plan is done and merged)

1. Mailbox `fakturenapp@lamgroep.nl` with folder `Verwerkt` exists at the web host.
2. `GEMINI_API_KEY` is set in the Coolify environment.
3. Deploy. The container runs `node startup-migration.js` first: it creates `invoice_inbox_items` and adds `expenses.inbox_item_id`. Check the container log for `✅ Database migration completed successfully!` (see the memory note on the 2026-09-08 outage: a failed migration there means the app does not start).
4. In the app: Instellingen, E-mail, fill in the card, test, add the maintenance company and `@lamgroep.nl` as trusted senders, switch on, save.
5. Ask the maintenance company to CC the address on every invoice.
