# Customer Portal Fines and Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staff enter traffic fines that are attributed to the reservation and driver at the time of the offence and shown to the customer in the portal; customers submit typed requests (extension, early return, damage, fine question, other) that staff handle from an inbox tab, with replies reaching the portal and e-mail.

**Architecture:** Two new tables (`fines`, `portal_requests` + attachments) next to the part-1 portal tables. Attribution is a pure service over `reservations` + `reservation_driver_assignments`. Staff API under `/api/fines` and `/api/portal-requests`, customer API extends `/api/portal`. No new pages: the Klantenportaal page gets tabs "Bekeuringen" and "Aanvragen"; every detail is a dialog registered in `GlobalDialogContext` so it opens from tabs, the customer dialog and notification links. Portal client gets tabs "Bekeuringen" and "Aanvragen".

**Tech Stack:** TypeScript, Express 4, Drizzle (Postgres), zod, multer, vitest + supertest, React 18, wouter (nested `/portaal` router: relative paths inside the portal), TanStack Query, shadcn/ui, react-i18next.

**Spec:** `docs/superpowers/specs/2026-09-03-customer-portal-fines-and-requests-design.md`

## Global Constraints

- Fine statuses: `new`, `linked`, `charged`, `paid`, `disputed`, `cancelled`; transitions exactly as the spec table (`new → linked | cancelled`; `linked → charged | disputed | cancelled | new`; `charged → paid | disputed`; `disputed → linked | charged | cancelled`; `paid`, `cancelled` final).
- Request types: `extension`, `early_return`, `damage`, `fine_question`, `other`; statuses `new`, `in_progress`, `done`, `rejected` (`new → in_progress | done | rejected`; `in_progress → done | rejected`).
- A customer never sees a fine with status `new` or `cancelled`; role `driver` sees only fines/requests tied to their own driver id / own submissions.
- Attachments: max 5 per request, 10 MB each, images or PDF, stored under `uploads/portal-requests/`; fine letters under `uploads/fines/`.
- Portal errors stay `{ error, code }` (new codes `PORTAL_REQUEST_INVALID_PERIOD`, `PORTAL_ATTACHMENT_LIMIT`); staff errors stay `{ message }`.
- New permissions `manage_fines`, `view_fines`; requests use `manage_portal` / `view_portal`.
- No new pages; staff UI = tabs on `/portal-admin` + dialogs in `GlobalDialogContext`.
- Inside the portal client use relative paths (`/bekeuringen`, `/aanvragen`), never `/portaal/...`.
- Portal client never uses `apiRequest`/`getQueryFn`; only `portalFetch`/`portalQueryFn`.
- `npm test` and `npm run check` (0 errors) after every task; commits end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## File Structure

| File | Responsibility |
|---|---|
| `shared/fines.ts` | fine status constants, transitions, plate normalisation, DTO types |
| `shared/portal-requests.ts` | request type/status constants, transitions, per-type payload zod schemas, DTO types |
| `shared/schema.ts` (modify) | `fines`, `portalRequests`, `portalRequestAttachments`, permissions |
| `shared/portal-types.ts` (modify) | `PortalConfig.fineAdminFee`, new error codes |
| `startup-migration.js` (modify) | DDL |
| `server/services/fines-storage.ts` | all DB access for fines (staff + customer-scoped) |
| `server/services/fine-attribution.ts` | candidates, driver-at-time, auto/manual link |
| `server/services/portal-requests-storage.ts` | DB access for requests + attachments |
| `server/services/portal-mail.ts` (modify) | templates `portal_fine_linked`, `portal_request_replied`, `sendFineLinkedMail`, `sendRequestReplyMail` |
| `server/routes/fines.ts` | staff fines API |
| `server/routes/portal-requests.ts` | staff requests API incl. approve extension/early return |
| `server/routes/portal.ts` (modify) | customer fines + requests API |
| `server/routes.ts`, `server/index.ts` (modify) | registration |
| `client/src/contexts/GlobalDialogContext.tsx`, `client/src/components/global-dialogs.tsx` (modify) | fine / newFine / portalRequest dialogs |
| `client/src/components/fines/{fine-dialog,new-fine-dialog,fines-table,fine-status-badge}.tsx` | staff fines UI |
| `client/src/components/portal-admin/{requests-table,portal-request-dialog}.tsx` | staff requests UI |
| `client/src/pages/portal-admin/index.tsx` (modify) | tabs + `?fine=`/`?request=`/`?tab=` params |
| `client/src/components/customers/customer-portal-tab.tsx` (modify) | fines + requests lists |
| `client/src/components/portal-admin/portal-config-form.tsx` (modify) | admin fee |
| `client/src/components/sidebar-nav.tsx` (modify) | badge includes new requests |
| `client/src/pages/portal/{fines,fine-detail,requests,new-request}.tsx`, `client/src/components/portal/request-form.tsx` | portal client |
| `client/src/layouts/PortalLayout.tsx`, `client/src/pages/portal/index.tsx`, `reservation-detail.tsx` (modify) | tabs, routes, shortcuts |
| `client/src/locales/{nl,en}/portal.json`, `nav.json` (modify) | translations |

---
### Task 1: Shared constants, schema tables and migration

**Files:**
- Create: `shared/fines.ts`, `shared/portal-requests.ts`
- Modify: `shared/schema.ts` (after the `portalActivityLog` block; `UserPermission`), `shared/portal-types.ts`, `server/services/portal-config.ts`, `startup-migration.js`
- Test: `shared/fines.test.ts`, `shared/portal-requests.test.ts`

**Interfaces:**
- Produces (`shared/fines.ts`): `FineStatus = { NEW:'new', LINKED:'linked', CHARGED:'charged', PAID:'paid', DISPUTED:'disputed', CANCELLED:'cancelled' }`, `FineStatusValue`, `FINE_TRANSITIONS: Record<FineStatusValue, FineStatusValue[]>`, `isValidFineTransition(from, to): boolean`, `CUSTOMER_VISIBLE_FINE_STATUSES = ['linked','charged','paid','disputed']`, `normalizeLicensePlate(input: string): string` (uppercase, strips spaces and dashes), `PortalFineDto`.
- Produces (`shared/portal-requests.ts`): `PortalRequestType = { EXTENSION:'extension', EARLY_RETURN:'early_return', DAMAGE:'damage', FINE_QUESTION:'fine_question', OTHER:'other' }`, `PortalRequestStatus = { NEW:'new', IN_PROGRESS:'in_progress', DONE:'done', REJECTED:'rejected' }`, `REQUEST_TRANSITIONS`, `isValidRequestTransition(from,to)`, `requestPayloadSchemas: Record<type, ZodSchema>` (`extension: { newEndDate: YYYY-MM-DD }`, `early_return: { returnDate }`, `damage: { location: string, occurredAt: string }`, `fine_question: {}`, `other: { subject: string }`), `PortalRequestDto`, `PortalRequestAttachmentDto`.
- Produces (schema): tables `fines`, `portalRequests`, `portalRequestAttachments`; types `Fine`, `InsertFine`, `PortalRequest`, `InsertPortalRequest`, `PortalRequestAttachment`; `insertFineSchema` (staff input: licensePlate, offenceAt ISO string, receivedAt?, reference?, description, amount, adminFee, letter path set by server), `UserPermission.MANAGE_FINES = 'manage_fines'`, `VIEW_FINES = 'view_fines'`.
- Produces (config): `PortalConfig.fineAdminFee: number` (default 0), `DEFAULT_PORTAL_CONFIG.fineAdminFee = 0`, `portalConfigSchema.fineAdminFee: z.coerce.number().min(0).default(0)`; error codes `PORTAL_ERROR.REQUEST_INVALID_PERIOD = 'PORTAL_REQUEST_INVALID_PERIOD'`, `PORTAL_ERROR.ATTACHMENT_LIMIT = 'PORTAL_ATTACHMENT_LIMIT'`.

- [ ] **Step 1: Failing tests for the shared modules**

`shared/fines.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { FineStatus, isValidFineTransition, normalizeLicensePlate, CUSTOMER_VISIBLE_FINE_STATUSES } from "./fines";

describe("fines shared", () => {
  it("allows only the spec transitions", () => {
    expect(isValidFineTransition("new", "linked")).toBe(true);
    expect(isValidFineTransition("new", "charged")).toBe(false);
    expect(isValidFineTransition("linked", "new")).toBe(true);
    expect(isValidFineTransition("charged", "paid")).toBe(true);
    expect(isValidFineTransition("paid", "charged")).toBe(false);
    expect(isValidFineTransition("disputed", "cancelled")).toBe(true);
    expect(isValidFineTransition(FineStatus.CANCELLED, FineStatus.NEW)).toBe(false);
  });
  it("normalises plates and hides new/cancelled from customers", () => {
    expect(normalizeLicensePlate(" 94-xt-184 ")).toBe("94XT184");
    expect(CUSTOMER_VISIBLE_FINE_STATUSES).toEqual(["linked", "charged", "paid", "disputed"]);
  });
});
```

`shared/portal-requests.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isValidRequestTransition, requestPayloadSchemas } from "./portal-requests";

describe("portal requests shared", () => {
  it("validates transitions", () => {
    expect(isValidRequestTransition("new", "in_progress")).toBe(true);
    expect(isValidRequestTransition("done", "new")).toBe(false);
    expect(isValidRequestTransition("in_progress", "rejected")).toBe(true);
  });
  it("validates payloads per type", () => {
    expect(requestPayloadSchemas.extension.safeParse({ newEndDate: "2026-10-01" }).success).toBe(true);
    expect(requestPayloadSchemas.extension.safeParse({ newEndDate: "1-10-2026" }).success).toBe(false);
    expect(requestPayloadSchemas.other.safeParse({}).success).toBe(false);
    expect(requestPayloadSchemas.fine_question.safeParse({}).success).toBe(true);
  });
});
```

Run: `npx vitest run shared/fines.test.ts shared/portal-requests.test.ts` — Expected: FAIL (modules missing).

- [ ] **Step 2: `shared/fines.ts`**

```ts
export const FineStatus = {
  NEW: 'new', LINKED: 'linked', CHARGED: 'charged', PAID: 'paid', DISPUTED: 'disputed', CANCELLED: 'cancelled',
} as const;
export type FineStatusValue = typeof FineStatus[keyof typeof FineStatus];

export const FINE_TRANSITIONS: Record<FineStatusValue, FineStatusValue[]> = {
  new: ['linked', 'cancelled'],
  linked: ['charged', 'disputed', 'cancelled', 'new'],
  charged: ['paid', 'disputed'],
  disputed: ['linked', 'charged', 'cancelled'],
  paid: [],
  cancelled: [],
};

export function isValidFineTransition(from: string, to: string): boolean {
  return (FINE_TRANSITIONS[from as FineStatusValue] ?? []).includes(to as FineStatusValue);
}

export const CUSTOMER_VISIBLE_FINE_STATUSES: FineStatusValue[] = ['linked', 'charged', 'paid', 'disputed'];

/** "94-xt-184" -> "94XT184" so lookups on vehicles.license_plate match. */
export function normalizeLicensePlate(input: string): string {
  return input.toUpperCase().replace(/[\s-]+/g, '');
}

export interface PortalFineDto {
  id: number;
  licensePlate: string;
  offenceAt: string;
  description: string;
  reference: string | null;
  amount: string;
  adminFee: string;
  totalAmount: string;
  status: FineStatusValue;
  customerNote: string | null;
  driver: { id: number; displayName: string } | null;
  reservationId: number | null;
  hasLetter: boolean;
  createdAt: string;
}
```

- [ ] **Step 3: `shared/portal-requests.ts`**

```ts
import { z } from "zod";

export const PortalRequestType = {
  EXTENSION: 'extension', EARLY_RETURN: 'early_return', DAMAGE: 'damage', FINE_QUESTION: 'fine_question', OTHER: 'other',
} as const;
export type PortalRequestTypeValue = typeof PortalRequestType[keyof typeof PortalRequestType];

export const PortalRequestStatus = { NEW: 'new', IN_PROGRESS: 'in_progress', DONE: 'done', REJECTED: 'rejected' } as const;
export type PortalRequestStatusValue = typeof PortalRequestStatus[keyof typeof PortalRequestStatus];

export const REQUEST_TRANSITIONS: Record<PortalRequestStatusValue, PortalRequestStatusValue[]> = {
  new: ['in_progress', 'done', 'rejected'],
  in_progress: ['done', 'rejected'],
  done: [],
  rejected: [],
};
export function isValidRequestTransition(from: string, to: string): boolean {
  return (REQUEST_TRANSITIONS[from as PortalRequestStatusValue] ?? []).includes(to as PortalRequestStatusValue);
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const requestPayloadSchemas = {
  extension: z.object({ newEndDate: isoDate }),
  early_return: z.object({ returnDate: isoDate }),
  damage: z.object({ location: z.string().trim().max(200).default(""), occurredAt: z.string().trim().max(40).default("") }),
  fine_question: z.object({}),
  other: z.object({ subject: z.string().trim().min(1).max(200) }),
} as const;

/** Which link a type requires. */
export const REQUEST_NEEDS: Record<PortalRequestTypeValue, 'reservation' | 'fine' | null> = {
  extension: 'reservation', early_return: 'reservation', damage: 'reservation', fine_question: 'fine', other: null,
};

export interface PortalRequestAttachmentDto { id: number; fileName: string; contentType: string; fileSize: number }

export interface PortalRequestDto {
  id: number;
  type: PortalRequestTypeValue;
  status: PortalRequestStatusValue;
  reservationId: number | null;
  fineId: number | null;
  payload: Record<string, unknown>;
  message: string;
  staffReply: string | null;
  repliedAt: string | null;
  createdAt: string;
  submittedBy: string | null;
  attachments: PortalRequestAttachmentDto[];
  /** Filled for staff views only */
  customerId?: number;
  customerName?: string;
  reservationLabel?: string | null;
}
```

- [ ] **Step 4: Schema additions**

In `shared/schema.ts`, `UserPermission`: after `VIEW_PORTAL` add

```ts
  MANAGE_FINES: 'manage_fines',
  VIEW_FINES: 'view_fines',
```

After the `portalActivityLog` block add:

```ts
// Traffic fines. Lam Groep pays the authority and recharges the customer plus
// an administration fee; attribution to reservation + driver happens through
// reservation_driver_assignments (see server/services/fine-attribution.ts).
export const fines = pgTable("fines", {
  id: serial("id").primaryKey(),
  licensePlate: text("license_plate").notNull(),
  vehicleId: integer("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
  offenceAt: timestamp("offence_at").notNull(),
  receivedAt: text("received_at"),
  reference: text("reference"),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  adminFee: numeric("admin_fee", { precision: 10, scale: 2 }).notNull().default("0"),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull(),
  letterFilePath: text("letter_file_path"),
  status: text("status").notNull().default("new"),
  customerId: integer("customer_id").references(() => customers.id, { onDelete: "set null" }),
  reservationId: integer("reservation_id").references(() => reservations.id, { onDelete: "set null" }),
  driverId: integer("driver_id").references(() => drivers.id, { onDelete: "set null" }),
  linkedAt: timestamp("linked_at"),
  linkedBy: text("linked_by"),
  chargedAt: timestamp("charged_at"),
  invoiceReference: text("invoice_reference"),
  paidAt: timestamp("paid_at"),
  internalNotes: text("internal_notes"),
  customerNote: text("customer_note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
}, (table) => ({
  plateOffenceIdx: index("fines_plate_offence_idx").on(table.licensePlate, table.offenceAt),
  customerStatusIdx: index("fines_customer_status_idx").on(table.customerId, table.status),
}));

// Staff input; server computes totalAmount, normalises the plate and sets the letter path.
export const insertFineSchema = z.object({
  licensePlate: z.string().trim().min(4).max(12),
  offenceAt: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)),
  receivedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  reference: z.string().trim().max(100).nullable().optional(),
  description: z.string().trim().min(1).max(500),
  amount: z.coerce.number().min(0),
  adminFee: z.coerce.number().min(0).default(0),
  internalNotes: z.string().max(2000).nullable().optional(),
  customerNote: z.string().max(1000).nullable().optional(),
});
export type Fine = typeof fines.$inferSelect;
export type InsertFine = z.infer<typeof insertFineSchema>;

export const portalRequests = pgTable("portal_requests", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  portalUserId: integer("portal_user_id").references(() => portalUsers.id, { onDelete: "set null" }),
  type: text("type").notNull(),
  reservationId: integer("reservation_id").references(() => reservations.id, { onDelete: "set null" }),
  fineId: integer("fine_id").references(() => fines.id, { onDelete: "set null" }),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  message: text("message").notNull(),
  status: text("status").notNull().default("new"),
  staffReply: text("staff_reply"),
  repliedAt: timestamp("replied_at"),
  repliedBy: text("replied_by"),
  handledBy: text("handled_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  customerCreatedIdx: index("portal_requests_customer_created_idx").on(table.customerId, table.createdAt),
  statusIdx: index("portal_requests_status_idx").on(table.status),
}));
export type PortalRequest = typeof portalRequests.$inferSelect;
export type InsertPortalRequest = typeof portalRequests.$inferInsert;

export const portalRequestAttachments = pgTable("portal_request_attachments", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").notNull().references(() => portalRequests.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  filePath: text("file_path").notNull(),
  contentType: text("content_type").notNull(),
  fileSize: integer("file_size").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type PortalRequestAttachment = typeof portalRequestAttachments.$inferSelect;
```

(`numeric` and `jsonb` are already imported.)

- [ ] **Step 5: Config + error codes**

`shared/portal-types.ts`: add `fineAdminFee: number;` to `PortalConfig`, `fineAdminFee: 0` to `DEFAULT_PORTAL_CONFIG`, and to `PORTAL_ERROR`: `REQUEST_INVALID_PERIOD: 'PORTAL_REQUEST_INVALID_PERIOD', ATTACHMENT_LIMIT: 'PORTAL_ATTACHMENT_LIMIT'`.
`server/services/portal-config.ts`: add `fineAdminFee: z.coerce.number().min(0).default(0),` to `portalConfigSchema`.

- [ ] **Step 6: Migration DDL**

In `startup-migration.js`, after `console.log('✅ Customer portal tables ready');`:

```js
    // ==================== CUSTOMER PORTAL (parts 3+4: fines, requests) ====================
    await createTableIfNotExists('fines', `
      CREATE TABLE fines (
        id SERIAL PRIMARY KEY,
        license_plate TEXT NOT NULL,
        vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
        offence_at TIMESTAMP NOT NULL,
        received_at TEXT,
        reference TEXT,
        description TEXT NOT NULL,
        amount NUMERIC(10,2) NOT NULL,
        admin_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
        total_amount NUMERIC(10,2) NOT NULL,
        letter_file_path TEXT,
        status TEXT NOT NULL DEFAULT 'new',
        customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        reservation_id INTEGER REFERENCES reservations(id) ON DELETE SET NULL,
        driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
        linked_at TIMESTAMP, linked_by TEXT,
        charged_at TIMESTAMP, invoice_reference TEXT,
        paid_at TIMESTAMP,
        internal_notes TEXT, customer_note TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_by TEXT, updated_by TEXT
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS fines_plate_offence_idx ON fines (license_plate, offence_at)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS fines_customer_status_idx ON fines (customer_id, status)`);

    await createTableIfNotExists('portal_requests', `
      CREATE TABLE portal_requests (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        portal_user_id INTEGER REFERENCES portal_users(id) ON DELETE SET NULL,
        type TEXT NOT NULL,
        reservation_id INTEGER REFERENCES reservations(id) ON DELETE SET NULL,
        fine_id INTEGER REFERENCES fines(id) ON DELETE SET NULL,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        message TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'new',
        staff_reply TEXT, replied_at TIMESTAMP, replied_by TEXT, handled_by TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS portal_requests_customer_created_idx ON portal_requests (customer_id, created_at)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS portal_requests_status_idx ON portal_requests (status)`);

    await createTableIfNotExists('portal_request_attachments', `
      CREATE TABLE portal_request_attachments (
        id SERIAL PRIMARY KEY,
        request_id INTEGER NOT NULL REFERENCES portal_requests(id) ON DELETE CASCADE,
        file_name TEXT NOT NULL, file_path TEXT NOT NULL, content_type TEXT NOT NULL, file_size INTEGER NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`);
    console.log('✅ Fines and portal request tables ready');
```

- [ ] **Step 7: Run, migrate, commit**

Run: `npx vitest run shared/fines.test.ts shared/portal-requests.test.ts && npm run check && node -r dotenv/config startup-migration.js` — Expected: 4 passed, 0 errors, log ends with `✅ Fines and portal request tables ready`.

```bash
git add shared/fines.ts shared/portal-requests.ts shared/fines.test.ts shared/portal-requests.test.ts shared/schema.ts shared/portal-types.ts server/services/portal-config.ts startup-migration.js
git commit -m "feat(portal): schema and shared rules for fines and portal requests"
```

Include the DDL in the commit body.

---

### Task 2: Fines storage and attribution

**Files:**
- Create: `server/services/fines-storage.ts`, `server/services/fine-attribution.ts`
- Modify: `server/__tests__/portal-helpers.ts` (cleanup + `createTestFine`)
- Test: `server/__tests__/fine-attribution.test.ts`

**Interfaces:**
- Produces (`fines-storage.ts`, object `finesStorage`): `createFine(data: Omit<InsertFineRow,'id'>): Promise<Fine>`, `getFine(id)`, `updateFine(id, patch: Partial<Fine>)`, `listFines(filters: { status?, customerId?, licensePlate?, from?, to? }): Promise<FineListRow[]>` (joined customer name, driver name, plate), `listFinesForCustomer(customerId, scope: PortalScope): Promise<FineListRow[]>` (visible statuses only; driver scope = `driverId`), `getFineForCustomer(id, customerId, scope)`, `countFinesForCustomer(customerId)`, `countFinesForPlate(plate)`. `FineListRow = Fine & { customerName: string | null; driverName: string | null }`.
- Produces (`fine-attribution.ts`): `findCandidates(licensePlate: string, offenceAt: Date): Promise<{ covering: CandidateReservation[]; near: CandidateReservation[] }>` where `CandidateReservation = { id, customerId, customerName, startDate, endDate, actualPickupDate, actualReturnDate, driverId, driverName }`; `driverAt(reservationId: number, at: Date): Promise<number | null>`; `attributeFine(fineId: number): Promise<{ fine: Fine; candidates: { covering; near } }>`; `linkFineManually(fineId, input: { customerId: number; reservationId?: number | null; driverId?: number | null }, by: string): Promise<Fine>` (throws `Error('Reservation does not belong to customer')` / `Error('Driver does not belong to customer')`); `unlinkFine(fineId, by): Promise<Fine>`.

- [ ] **Step 1: Test helpers**

Append to `server/__tests__/portal-helpers.ts` (and import `fines`, `portalRequests` from the schema, `and`, `eq`):

```ts
export async function createTestFine(input: { licensePlate: string; offenceAt: Date; amount?: number; description?: string }): Promise<Fine> {
  const [row] = await db.insert(fines).values({
    licensePlate: input.licensePlate, offenceAt: input.offenceAt,
    description: input.description ?? "Test overtreding",
    amount: String(input.amount ?? 100), adminFee: "10", totalAmount: String((input.amount ?? 100) + 10),
    status: "new", createdBy: "test",
  }).returning();
  return row;
}
```

In `cleanupPortalTestData`, before the customers are deleted, add `await db.delete(fines).where(like(fines.licensePlate, "PT%"));` and `if (ids.length) await db.delete(portalRequests).where(inArray(portalRequests.customerId, ids));` (attachments cascade). Test plates are `PT-…` normalised to `PT…`, so the `like` matches both.

- [ ] **Step 2: Attribution test**

`server/__tests__/fine-attribution.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { findCandidates, driverAt, attributeFine, linkFineManually, unlinkFine } from "../services/fine-attribution";
import { assignDriverToReservation } from "../services/driver-assignments";
import { createTestCustomer, createTestVehicle, createTestDriver, createTestReservation, createTestFine, cleanupPortalTestData } from "./portal-helpers";

describe("fine attribution", () => {
  let plate: string, customerA: number, customerB: number, vehicleId: number, resA: number, d1: number, d2: number;

  beforeAll(async () => {
    await cleanupPortalTestData();
    plate = `PT${Date.now().toString().slice(-6)}`;
    vehicleId = (await createTestVehicle(plate)).id;
    customerA = (await createTestCustomer("FA")).id;
    customerB = (await createTestCustomer("FB")).id;
    d1 = (await createTestDriver(customerA, "Eerste")).id;
    d2 = (await createTestDriver(customerA, "Tweede")).id;
    resA = (await createTestReservation({ customerId: customerA, vehicleId, startDate: "2026-09-01", endDate: "2026-09-10", status: "picked_up" })).id;
    await assignDriverToReservation({ reservationId: resA, driverId: d1, at: new Date("2026-09-01T08:00:00Z") });
    await assignDriverToReservation({ reservationId: resA, driverId: d2, at: new Date("2026-09-05T12:00:00Z") });
    await createTestReservation({ customerId: customerB, vehicleId, startDate: "2026-09-12", endDate: "2026-09-14" });
  });
  afterAll(cleanupPortalTestData);

  it("finds the covering reservation and the driver at that moment", async () => {
    const { covering, near } = await findCandidates(plate, new Date("2026-09-03T10:00:00Z"));
    expect(covering.map((c) => c.id)).toEqual([resA]);
    expect(near.length).toBeGreaterThanOrEqual(0);
    expect(await driverAt(resA, new Date("2026-09-03T10:00:00Z"))).toBe(d1);
    expect(await driverAt(resA, new Date("2026-09-06T10:00:00Z"))).toBe(d2);
  });

  it("auto-links with one covering reservation", async () => {
    const fine = await createTestFine({ licensePlate: plate, offenceAt: new Date("2026-09-06T10:00:00Z") });
    const { fine: linked } = await attributeFine(fine.id);
    expect(linked.status).toBe("linked");
    expect(linked.customerId).toBe(customerA);
    expect(linked.reservationId).toBe(resA);
    expect(linked.driverId).toBe(d2);
    expect(linked.linkedBy).toBe("system");
  });

  it("stays new with zero covering reservations and offers near candidates", async () => {
    const fine = await createTestFine({ licensePlate: plate, offenceAt: new Date("2026-09-11T10:00:00Z") });
    const { fine: after, candidates } = await attributeFine(fine.id);
    expect(after.status).toBe("new");
    expect(candidates.covering).toEqual([]);
    expect(candidates.near.map((c) => c.customerId).sort()).toEqual([customerA, customerB].sort());
  });

  it("stays new with two covering reservations", async () => {
    await createTestReservation({ customerId: customerB, vehicleId, startDate: "2026-09-02", endDate: "2026-09-04" });
    const fine = await createTestFine({ licensePlate: plate, offenceAt: new Date("2026-09-03T10:00:00Z") });
    const { fine: after, candidates } = await attributeFine(fine.id);
    expect(after.status).toBe("new");
    expect(candidates.covering).toHaveLength(2);
  });

  it("manual link validates ownership and unlink returns to new", async () => {
    const fine = await createTestFine({ licensePlate: plate, offenceAt: new Date("2026-09-20T10:00:00Z") });
    await expect(linkFineManually(fine.id, { customerId: customerB, reservationId: resA }, "staff")).rejects.toThrow(/Reservation/);
    await expect(linkFineManually(fine.id, { customerId: customerB, driverId: d1 }, "staff")).rejects.toThrow(/Driver/);
    const linked = await linkFineManually(fine.id, { customerId: customerA, reservationId: resA, driverId: d1 }, "staff");
    expect(linked.status).toBe("linked");
    expect(linked.linkedBy).toBe("staff");
    const back = await unlinkFine(fine.id, "staff");
    expect(back.status).toBe("new");
    expect(back.customerId).toBeNull();
  });
});
```

Run: `npx vitest run server/__tests__/fine-attribution.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: `server/services/fines-storage.ts`**

```ts
import { db } from "../db";
import { fines, customers, drivers, type Fine } from "../../shared/schema";
import { and, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { CUSTOMER_VISIBLE_FINE_STATUSES } from "../../shared/fines";
import type { PortalScope } from "./portal-storage";

export type FineListRow = Fine & { customerName: string | null; driverName: string | null };
export type InsertFineRow = typeof fines.$inferInsert;

export interface FineFilters { status?: string; customerId?: number; licensePlate?: string; from?: string; to?: string }

async function select(where: SQL | undefined): Promise<FineListRow[]> {
  const rows = await db.select({ fine: fines, customerName: sql<string | null>`coalesce(${customers.companyName}, ${customers.name})`, driverName: drivers.displayName })
    .from(fines)
    .leftJoin(customers, eq(fines.customerId, customers.id))
    .leftJoin(drivers, eq(fines.driverId, drivers.id))
    .where(where)
    .orderBy(desc(fines.offenceAt), desc(fines.id));
  return rows.map((r) => ({ ...r.fine, customerName: r.customerName, driverName: r.driverName }));
}

export const finesStorage = {
  async createFine(data: InsertFineRow): Promise<Fine> {
    const [row] = await db.insert(fines).values(data).returning();
    return row;
  },
  async getFine(id: number): Promise<Fine | undefined> {
    const [row] = await db.select().from(fines).where(eq(fines.id, id));
    return row;
  },
  async getFineRow(id: number): Promise<FineListRow | undefined> {
    const [row] = await select(eq(fines.id, id));
    return row;
  },
  async updateFine(id: number, patch: Partial<Fine>): Promise<Fine | undefined> {
    const [row] = await db.update(fines).set({ ...patch, updatedAt: new Date() }).where(eq(fines.id, id)).returning();
    return row;
  },
  async listFines(f: FineFilters): Promise<FineListRow[]> {
    return select(and(
      f.status ? eq(fines.status, f.status) : undefined,
      f.customerId ? eq(fines.customerId, f.customerId) : undefined,
      f.licensePlate ? eq(fines.licensePlate, f.licensePlate) : undefined,
      f.from ? gte(fines.offenceAt, new Date(f.from)) : undefined,
      f.to ? lte(fines.offenceAt, new Date(`${f.to}T23:59:59`)) : undefined,
    ));
  },
  async listFinesForCustomer(customerId: number, scope: PortalScope): Promise<FineListRow[]> {
    return select(and(
      eq(fines.customerId, customerId),
      inArray(fines.status, CUSTOMER_VISIBLE_FINE_STATUSES),
      scope.driverId ? eq(fines.driverId, scope.driverId) : undefined,
    ));
  },
  async getFineForCustomer(id: number, customerId: number, scope: PortalScope): Promise<FineListRow | undefined> {
    const rows = await select(and(
      eq(fines.id, id), eq(fines.customerId, customerId),
      inArray(fines.status, CUSTOMER_VISIBLE_FINE_STATUSES),
      scope.driverId ? eq(fines.driverId, scope.driverId) : undefined,
    ));
    return rows[0];
  },
  async countFinesForCustomer(customerId: number): Promise<number> {
    const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(fines).where(eq(fines.customerId, customerId));
    return r?.n ?? 0;
  },
  async countFinesForPlate(licensePlate: string): Promise<number> {
    const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(fines).where(eq(fines.licensePlate, licensePlate));
    return r?.n ?? 0;
  },
};
```

- [ ] **Step 4: `server/services/fine-attribution.ts`**

```ts
import { db } from "../db";
import { reservations, customers, drivers, vehicles, reservationDriverAssignments, type Fine } from "../../shared/schema";
import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { finesStorage } from "./fines-storage";
import { portalStorage } from "./portal-storage";
import { normalizeLicensePlate } from "../../shared/fines";

export interface CandidateReservation {
  id: number; customerId: number | null; customerName: string | null;
  startDate: string; endDate: string | null; actualPickupDate: string | null; actualReturnDate: string | null;
  driverId: number | null; driverName: string | null;
}

const NEAR_DAYS = 3;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const shift = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);

/** Effective period: actual dates win over planned ones; open end = still running. */
function covers(c: CandidateReservation, day: string): boolean {
  const start = c.actualPickupDate || c.startDate;
  const end = c.actualReturnDate || c.endDate;
  return start <= day && (!end || day <= end);
}

export async function findCandidates(licensePlate: string, offenceAt: Date): Promise<{ covering: CandidateReservation[]; near: CandidateReservation[] }> {
  const plate = normalizeLicensePlate(licensePlate);
  const day = isoDay(offenceAt);
  const rows = await db.select({
    id: reservations.id, customerId: reservations.customerId, customerName: sql<string | null>`coalesce(${customers.companyName}, ${customers.name})`,
    startDate: reservations.startDate, endDate: reservations.endDate,
    actualPickupDate: reservations.actualPickupDate, actualReturnDate: reservations.actualReturnDate,
    driverId: reservations.driverId, driverName: drivers.displayName,
  }).from(reservations)
    .innerJoin(vehicles, eq(reservations.vehicleId, vehicles.id))
    .leftJoin(customers, eq(reservations.customerId, customers.id))
    .leftJoin(drivers, eq(reservations.driverId, drivers.id))
    .where(and(
      eq(vehicles.licensePlate, plate),
      isNull(reservations.deletedAt),
      inArray(reservations.type, ["standard", "replacement"]),
      ne(reservations.status, "cancelled"),
      lte(reservations.startDate, isoDay(shift(offenceAt, NEAR_DAYS))),
      or(isNull(reservations.endDate), gte(reservations.endDate, isoDay(shift(offenceAt, -NEAR_DAYS)))),
    ))
    .orderBy(desc(reservations.startDate));
  const covering = rows.filter((r) => covers(r, day));
  const near = rows.filter((r) => !covers(r, day));
  return { covering, near };
}

export async function driverAt(reservationId: number, at: Date): Promise<number | null> {
  const [row] = await db.select({ driverId: reservationDriverAssignments.driverId })
    .from(reservationDriverAssignments)
    .where(and(
      eq(reservationDriverAssignments.reservationId, reservationId),
      lte(reservationDriverAssignments.assignedFrom, at),
      or(isNull(reservationDriverAssignments.assignedUntil), sql`${reservationDriverAssignments.assignedUntil} > ${at}`),
    ))
    .orderBy(asc(reservationDriverAssignments.assignedFrom))
    .limit(1);
  if (row) return row.driverId;
  const [res] = await db.select({ driverId: reservations.driverId }).from(reservations).where(eq(reservations.id, reservationId));
  return res?.driverId ?? null;
}

export async function attributeFine(fineId: number): Promise<{ fine: Fine; candidates: { covering: CandidateReservation[]; near: CandidateReservation[] } }> {
  const fine = await finesStorage.getFine(fineId);
  if (!fine) throw new Error("Fine not found");
  const candidates = await findCandidates(fine.licensePlate, fine.offenceAt);
  if (fine.status !== "new" || candidates.covering.length !== 1) return { fine, candidates };
  const [match] = candidates.covering;
  const driverId = await driverAt(match.id, fine.offenceAt);
  const updated = await finesStorage.updateFine(fineId, {
    customerId: match.customerId, reservationId: match.id, driverId,
    status: "linked", linkedAt: new Date(), linkedBy: "system",
  });
  return { fine: updated!, candidates };
}

export async function linkFineManually(fineId: number, input: { customerId: number; reservationId?: number | null; driverId?: number | null }, by: string): Promise<Fine> {
  const fine = await finesStorage.getFine(fineId);
  if (!fine) throw new Error("Fine not found");
  if (input.reservationId) {
    const [r] = await db.select({ customerId: reservations.customerId }).from(reservations).where(eq(reservations.id, input.reservationId));
    if (!r || r.customerId !== input.customerId) throw new Error("Reservation does not belong to customer");
  }
  if (input.driverId) {
    const d = await portalStorage.getDriverForCustomer(input.driverId, input.customerId);
    if (!d) throw new Error("Driver does not belong to customer");
  }
  const updated = await finesStorage.updateFine(fineId, {
    customerId: input.customerId, reservationId: input.reservationId ?? null, driverId: input.driverId ?? null,
    status: "linked", linkedAt: new Date(), linkedBy: by, updatedBy: by,
  });
  return updated!;
}

export async function unlinkFine(fineId: number, by: string): Promise<Fine> {
  const updated = await finesStorage.updateFine(fineId, {
    customerId: null, reservationId: null, driverId: null, status: "new", linkedAt: null, linkedBy: null, updatedBy: by,
  });
  if (!updated) throw new Error("Fine not found");
  return updated;
}
```

- [ ] **Step 5: Run and commit**

Run: `npx vitest run server/__tests__/fine-attribution.test.ts && npm run check` — Expected: 5 passed, 0 errors.

```bash
git add server/services/fines-storage.ts server/services/fine-attribution.ts server/__tests__/portal-helpers.ts server/__tests__/fine-attribution.test.ts
git commit -m "feat(fines): fines storage and attribution to reservation and driver at the offence moment"
```

---
### Task 3: Staff fines API and customer mail on link

**Files:**
- Create: `server/routes/fines.ts`
- Modify: `server/services/portal-mail.ts` (templates + `sendFineLinkedMail`), `server/routes.ts` (register), `server/__tests__/portal-helpers.ts` (`buildStaffTestApp`)
- Test: `server/__tests__/fines-routes.test.ts`

**Interfaces:**
- Consumes: `finesStorage`, `attributeFine`, `linkFineManually`, `unlinkFine`, `findCandidates`, `isValidFineTransition`, `normalizeLicensePlate`, `getPortalConfig().fineAdminFee`, `AuditLogger.logFromRequest`, upload helpers.
- Produces: `registerFineRoutes(app, deps: RouteDeps)`; routes (staff, `view_fines` read / `manage_fines` write):
  - `GET /api/fines?status&customerId&licensePlate&from&to` → `FineListRow[]`
  - `GET /api/fines/count?customerId|licensePlate` → `{ count }`
  - `GET /api/fines/:id` → `FineListRow & { candidates? }` (candidates only when status `new`)
  - `POST /api/fines` (multipart, field `letterFile` optional) → `{ fine, candidates }` after attribution
  - `PATCH /api/fines/:id` (fields of `insertFineSchema.partial()`; recomputes total)
  - `POST /api/fines/:id/letter` (multipart) ; `GET /api/fines/:id/letter` (stream)
  - `POST /api/fines/:id/link` `{ customerId, reservationId?, driverId? }`; `POST /api/fines/:id/unlink`
  - `POST /api/fines/:id/status` `{ status, invoiceReference? }` → 400 with `{ message, allowed: string[] }` on invalid transition
- Produces (`portal-mail.ts`): templates `portal_fine_linked` ("Beste {{name}}, er is een bekeuring gekoppeld: {{plate}} {{date}} {{description}} bedrag {{amount}} (+ {{adminFee}} administratiekosten) = {{total}}. Bekijk in het portaal: {{link}}") and `portal_request_replied` (Task 5); `sendFineLinkedMail(fineId): Promise<boolean>` (to `customers.email` ?? `emailForInvoices`, only when the customer's `portal_enabled` is true; returns false when no address).
- Produces (helpers): `buildStaffTestApp(permissions: string[], register: (app) => void): Express` — express + json + fake `req.user` (`{ id: 1, username: 'staff-test', role: 'manager', permissions }`) + `isAuthenticated`.

- [ ] **Step 1: Staff test helper**

Append to `server/__tests__/portal-helpers.ts`:

```ts
/** Express app with a fake staff user; `register` mounts the routes under test. */
export function buildStaffTestApp(permissions: string[], register: (app: Express) => void): Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: 1, username: "staff-test", role: "manager", permissions };
    (req as any).isAuthenticated = () => true;
    next();
  });
  register(app);
  return app;
}
```

- [ ] **Step 2: Routes test**

`server/__tests__/fines-routes.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import fs from "fs";
import path from "path";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn(async () => true) }));
vi.mock("../utils/email-service", () => ({ sendEmail }));

import { registerFineRoutes } from "../routes/fines";
import { buildStaffTestApp, createTestCustomer, createTestVehicle, createTestDriver, createTestReservation, cleanupPortalTestData } from "./portal-helpers";
import { getUploadsDir } from "../../shared/paths";
import { UserPermission } from "../../shared/schema";
import { db } from "../db";
import { customers } from "../../shared/schema";
import { eq } from "drizzle-orm";

const deps = { uploadsDir: getUploadsDir(), requireAuth: (_r: any, _s: any, n: any) => n() } as any;
const manager = buildStaffTestApp([UserPermission.MANAGE_FINES], (app) => registerFineRoutes(app, deps));
const viewer = buildStaffTestApp([UserPermission.VIEW_FINES], (app) => registerFineRoutes(app, deps));

describe("fines routes", () => {
  let plate: string, customerId: number, otherId: number, driverId: number, resId: number, fineId: number;
  beforeAll(async () => {
    await cleanupPortalTestData();
    plate = `PT${Date.now().toString().slice(-6)}`;
    const v = await createTestVehicle(plate);
    customerId = (await createTestCustomer("FR")).id;
    otherId = (await createTestCustomer("FR2")).id;
    await db.update(customers).set({ email: "fr@portal-test.invalid" }).where(eq(customers.id, customerId));
    driverId = (await createTestDriver(customerId)).id;
    resId = (await createTestReservation({ customerId, vehicleId: v.id, driverId, startDate: "2026-09-01", endDate: "2026-09-10", status: "picked_up" })).id;
  });
  afterAll(async () => { await cleanupPortalTestData(); fs.rmSync(path.join(getUploadsDir(), "fines", "__test__"), { recursive: true, force: true }); });

  it("creates a fine with a letter, normalises the plate, applies the default fee and auto-links", async () => {
    const res = await request(manager).post("/api/fines")
      .field("licensePlate", plate.replace(/^(..)(..)/, "$1-$2-"))
      .field("offenceAt", "2026-09-03T10:00:00.000Z")
      .field("description", "Snelheid").field("amount", "90").field("adminFee", "12.50")
      .attach("letterFile", Buffer.from("%PDF-1.4 test"), { filename: "brief.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(201);
    fineId = res.body.fine.id;
    expect(res.body.fine.licensePlate).toBe(plate);
    expect(res.body.fine.totalAmount).toBe("102.50");
    expect(res.body.fine.status).toBe("linked");
    expect(res.body.fine.customerId).toBe(customerId);
    expect(res.body.fine.driverId).toBe(driverId);
    expect(res.body.fine.letterFilePath).toBeTruthy();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect((sendEmail.mock.calls[0][0] as any).to).toBe("fr@portal-test.invalid");
  });

  it("lists with filters and streams the letter", async () => {
    const list = await request(viewer).get(`/api/fines?licensePlate=${plate}&status=linked`);
    expect(list.body.map((f: any) => f.id)).toContain(fineId);
    expect(list.body.find((f: any) => f.id === fineId).customerName).toContain("FR");
    const letter = await request(viewer).get(`/api/fines/${fineId}/letter`);
    expect(letter.status).toBe(200);
    expect(letter.headers["content-type"]).toContain("pdf");
  });

  it("viewers cannot change anything", async () => {
    expect((await request(viewer).post(`/api/fines/${fineId}/status`).send({ status: "charged" })).status).toBe(403);
  });

  it("enforces transitions and records charge/paid timestamps", async () => {
    const bad = await request(manager).post(`/api/fines/${fineId}/status`).send({ status: "paid" });
    expect(bad.status).toBe(400);
    expect(bad.body.allowed).toEqual(["charged", "disputed", "cancelled", "new"]);
    const charged = await request(manager).post(`/api/fines/${fineId}/status`).send({ status: "charged", invoiceReference: "F-2026-001" });
    expect(charged.body.status).toBe("charged");
    expect(charged.body.invoiceReference).toBe("F-2026-001");
    expect(charged.body.chargedAt).toBeTruthy();
    const paid = await request(manager).post(`/api/fines/${fineId}/status`).send({ status: "paid" });
    expect(paid.body.paidAt).toBeTruthy();
  });

  it("unlinks and relinks manually with validation", async () => {
    const created = await request(manager).post("/api/fines").send({ licensePlate: plate, offenceAt: "2026-09-20T10:00:00.000Z", description: "Parkeren", amount: 60 });
    expect(created.status).toBe(201);
    expect(created.body.fine.status).toBe("new");
    expect(created.body.candidates.near.length).toBeGreaterThanOrEqual(0);
    const id = created.body.fine.id;
    const wrong = await request(manager).post(`/api/fines/${id}/link`).send({ customerId: otherId, reservationId: resId });
    expect(wrong.status).toBe(400);
    const ok = await request(manager).post(`/api/fines/${id}/link`).send({ customerId, reservationId: resId, driverId });
    expect(ok.body.status).toBe("linked");
    const back = await request(manager).post(`/api/fines/${id}/unlink`);
    expect(back.body.status).toBe("new");
  });

  it("recomputes the total on patch", async () => {
    const list = await request(manager).get(`/api/fines?licensePlate=${plate}&status=new`);
    const id = list.body[0].id;
    const res = await request(manager).patch(`/api/fines/${id}`).send({ amount: 70, adminFee: 5 });
    expect(res.body.totalAmount).toBe("75.00");
  });
});
```

- [ ] **Step 3: Mail additions in `portal-mail.ts`**

Add to `PORTAL_TEMPLATE`: `FINE_LINKED: "portal_fine_linked"`, `REQUEST_REPLIED: "portal_request_replied"`. Add to `DEFAULT_TEMPLATES`:

```ts
  {
    name: PORTAL_TEMPLATE.FINE_LINKED,
    subject: "Bekeuring {{plate}} van {{date}}",
    content: `<p>Beste {{name}},</p>
<p>Er is een bekeuring op naam van {{company}} verwerkt:</p>
<p>Kenteken {{plate}}, {{date}}<br>{{description}}<br>Bedrag € {{amount}} + € {{adminFee}} administratiekosten = <strong>€ {{total}}</strong></p>
<p>Bekijk de bekeuring in het klantenportaal: <a href="{{link}}">{{link}}</a></p>
<p>Met vriendelijke groet,<br>Lam Groep</p>`,
  },
  {
    name: PORTAL_TEMPLATE.REQUEST_REPLIED,
    subject: "Reactie op uw aanvraag ({{type}})",
    content: `<p>Beste {{name}},</p>
<p>Wij hebben uw aanvraag ({{type}}) beantwoord:</p>
<blockquote>{{reply}}</blockquote>
<p>Status: {{status}}. Bekijk de aanvraag in het klantenportaal: <a href="{{link}}">{{link}}</a></p>
<p>Met vriendelijke groet,<br>Lam Groep</p>`,
  },
```

Add:

```ts
export async function sendFineLinkedMail(fineId: number): Promise<boolean> {
  const fine = await finesStorage.getFineRow(fineId);
  if (!fine || !fine.customerId) return false;
  const [customer, settings, config] = await Promise.all([
    storage.getCustomer(fine.customerId), portalStorage.getOrCreateCustomerSettings(fine.customerId), getPortalConfig(),
  ]);
  const to = customer?.email || customer?.emailForInvoices;
  if (!customer || !settings.portalEnabled || !to) return false;
  const template = await getPortalTemplate(PORTAL_TEMPLATE.FINE_LINKED);
  const vars = {
    name: customer.contactPerson || customer.companyName || customer.name, company: customer.companyName || customer.name,
    plate: fine.licensePlate, date: fine.offenceAt.toISOString().slice(0, 10), description: fine.description,
    amount: fine.amount, adminFee: fine.adminFee, total: fine.totalAmount,
    link: `${config.portalBaseUrl.replace(/\/$/, "")}/portaal/bekeuringen/${fine.id}`,
  };
  const html = renderTemplate(template.content, vars);
  return sendEmail({ to, subject: renderTemplate(template.subject, vars), html, text: stripHtml(html) }, "custom");
}
```

with `import { finesStorage } from "./fines-storage";`.

- [ ] **Step 4: `server/routes/fines.ts`**

```ts
import type { Express, Request, Response } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { z } from "zod";
import { hasPermission } from "../middleware/permissions.js";
import { UserPermission, insertFineSchema } from "../../shared/schema";
import { isValidFineTransition, FINE_TRANSITIONS, normalizeLicensePlate, type FineStatusValue } from "../../shared/fines";
import { finesStorage } from "../services/fines-storage";
import { attributeFine, findCandidates, linkFineManually, unlinkFine } from "../services/fine-attribution";
import { sendFineLinkedMail } from "../services/portal-mail";
import { getPortalConfig } from "../services/portal-config";
import { storage } from "../storage";
import { AuditLogger } from "../utils/security/auditLogger";
import { createSecureMulterFilter, sanitizeFilename, validateAfterUpload } from "../utils/security/fileUploadSecurity";
import { resolveDocumentFilePath } from "../services/document-paths";
import type { RouteDeps } from "./deps";

const canView = hasPermission(UserPermission.VIEW_FINES, UserPermission.MANAGE_FINES);
const canManage = hasPermission(UserPermission.MANAGE_FINES);
const money = (n: number) => n.toFixed(2);

function idParam(req: Request, res: Response): number | null {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) { res.status(400).json({ message: "Invalid id" }); return null; }
  return id;
}

export function registerFineRoutes(app: Express, deps: RouteDeps): void {
  const actor = (req: Request) => req.user?.username ?? "system";
  const letterUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => { const dir = path.join(deps.uploadsDir, "fines"); fs.mkdirSync(dir, { recursive: true }); cb(null, dir); },
      filename: (_req, file, cb) => cb(null, `fine_${Date.now()}${path.extname(sanitizeFilename(file.originalname))}`),
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: createSecureMulterFilter("document"),
  });

  async function storeLetter(req: Request): Promise<string | null> {
    if (!req.file) return null;
    const check = await validateAfterUpload(req.file.path, req.file.originalname, req.file.mimetype, "document");
    if (!check.valid) { fs.rmSync(req.file.path, { force: true }); throw new Error(check.error ?? "Invalid file"); }
    return path.relative(process.cwd(), req.file.path);
  }

  async function notifyLinked(fineId: number) {
    try { await sendFineLinkedMail(fineId); } catch (e) { console.error("fine linked mail failed:", e); }
  }

  app.get("/api/fines", canView, async (req, res) => {
    const q = req.query;
    res.json(await finesStorage.listFines({
      status: q.status ? String(q.status) : undefined,
      customerId: q.customerId ? parseInt(String(q.customerId), 10) : undefined,
      licensePlate: q.licensePlate ? normalizeLicensePlate(String(q.licensePlate)) : undefined,
      from: q.from ? String(q.from) : undefined, to: q.to ? String(q.to) : undefined,
    }));
  });

  app.get("/api/fines/count", canView, async (req, res) => {
    if (req.query.customerId) return res.json({ count: await finesStorage.countFinesForCustomer(parseInt(String(req.query.customerId), 10)) });
    if (req.query.licensePlate) return res.json({ count: await finesStorage.countFinesForPlate(normalizeLicensePlate(String(req.query.licensePlate))) });
    res.json({ count: 0 });
  });

  app.get("/api/fines/:id", canView, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const fine = await finesStorage.getFineRow(id);
    if (!fine) return res.status(404).json({ message: "Fine not found" });
    const candidates = fine.status === "new" ? await findCandidates(fine.licensePlate, fine.offenceAt) : undefined;
    res.json({ ...fine, candidates });
  });

  app.post("/api/fines", canManage, letterUpload.single("letterFile"), async (req, res) => {
    const parsed = insertFineSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid input" });
    const config = await getPortalConfig();
    const adminFee = req.body.adminFee === undefined || req.body.adminFee === "" ? config.fineAdminFee : parsed.data.adminFee;
    let letterFilePath: string | null = null;
    try { letterFilePath = await storeLetter(req); } catch (e) { return res.status(400).json({ message: (e as Error).message }); }
    const plate = normalizeLicensePlate(parsed.data.licensePlate);
    const vehicle = (await storage.getAllVehicles()).find((v) => v.licensePlate === plate);
    const fine = await finesStorage.createFine({
      licensePlate: plate, vehicleId: vehicle?.id ?? null, offenceAt: new Date(parsed.data.offenceAt),
      receivedAt: parsed.data.receivedAt ?? null, reference: parsed.data.reference ?? null, description: parsed.data.description,
      amount: money(parsed.data.amount), adminFee: money(adminFee), totalAmount: money(parsed.data.amount + adminFee),
      letterFilePath, internalNotes: parsed.data.internalNotes ?? null, customerNote: parsed.data.customerNote ?? null,
      createdBy: actor(req), updatedBy: actor(req),
    });
    const result = await attributeFine(fine.id);
    await AuditLogger.logFromRequest(req, "fine.create", "fine", fine.id, { plate, status: result.fine.status });
    if (result.fine.status === "linked") await notifyLinked(fine.id);
    res.status(201).json(result);
  });

  app.patch("/api/fines/:id", canManage, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const existing = await finesStorage.getFine(id);
    if (!existing) return res.status(404).json({ message: "Fine not found" });
    if (existing.status === "paid" || existing.status === "cancelled") return res.status(400).json({ message: "Fine is closed" });
    const parsed = insertFineSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid input" });
    const amount = parsed.data.amount ?? Number(existing.amount);
    const adminFee = parsed.data.adminFee ?? Number(existing.adminFee);
    const updated = await finesStorage.updateFine(id, {
      ...(parsed.data.licensePlate ? { licensePlate: normalizeLicensePlate(parsed.data.licensePlate) } : {}),
      ...(parsed.data.offenceAt ? { offenceAt: new Date(parsed.data.offenceAt) } : {}),
      ...(parsed.data.receivedAt !== undefined ? { receivedAt: parsed.data.receivedAt } : {}),
      ...(parsed.data.reference !== undefined ? { reference: parsed.data.reference } : {}),
      ...(parsed.data.description ? { description: parsed.data.description } : {}),
      ...(parsed.data.internalNotes !== undefined ? { internalNotes: parsed.data.internalNotes } : {}),
      ...(parsed.data.customerNote !== undefined ? { customerNote: parsed.data.customerNote } : {}),
      amount: money(amount), adminFee: money(adminFee), totalAmount: money(amount + adminFee), updatedBy: actor(req),
    });
    await AuditLogger.logFromRequest(req, "fine.update", "fine", id, parsed.data);
    res.json(updated);
  });

  app.post("/api/fines/:id/letter", canManage, letterUpload.single("letterFile"), async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    if (!(await finesStorage.getFine(id))) return res.status(404).json({ message: "Fine not found" });
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    try {
      const letterFilePath = await storeLetter(req);
      res.json(await finesStorage.updateFine(id, { letterFilePath, updatedBy: actor(req) }));
    } catch (e) { res.status(400).json({ message: (e as Error).message }); }
  });

  app.get("/api/fines/:id/letter", canView, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const fine = await finesStorage.getFine(id);
    const file = fine?.letterFilePath ? resolveDocumentFilePath(fine.letterFilePath) : null;
    if (!fine || !file) return res.status(404).json({ message: "No letter" });
    res.setHeader("Content-Type", file.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${sanitizeFilename(path.basename(file))}"`);
    fs.createReadStream(file).pipe(res);
  });

  app.post("/api/fines/:id/link", canManage, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const parsed = z.object({ customerId: z.number().int().positive(), reservationId: z.number().int().positive().nullable().optional(), driverId: z.number().int().positive().nullable().optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "customerId is required" });
    try {
      const fine = await linkFineManually(id, parsed.data, actor(req));
      await AuditLogger.logFromRequest(req, "fine.link", "fine", id, parsed.data);
      await notifyLinked(id);
      res.json(fine);
    } catch (e) { res.status(400).json({ message: (e as Error).message }); }
  });

  app.post("/api/fines/:id/unlink", canManage, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    try {
      const fine = await unlinkFine(id, actor(req));
      await AuditLogger.logFromRequest(req, "fine.unlink", "fine", id);
      res.json(fine);
    } catch (e) { res.status(404).json({ message: (e as Error).message }); }
  });

  app.post("/api/fines/:id/status", canManage, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const fine = await finesStorage.getFine(id);
    if (!fine) return res.status(404).json({ message: "Fine not found" });
    const parsed = z.object({ status: z.string(), invoiceReference: z.string().trim().max(100).optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "status is required" });
    const next = parsed.data.status as FineStatusValue;
    if (!isValidFineTransition(fine.status, next)) {
      return res.status(400).json({ message: `Cannot go from ${fine.status} to ${next}`, allowed: FINE_TRANSITIONS[fine.status as FineStatusValue] ?? [] });
    }
    if (next === "new") { res.json(await unlinkFine(id, actor(req))); return; }
    const patch: Record<string, unknown> = { status: next, updatedBy: actor(req) };
    if (next === "charged") { patch.chargedAt = new Date(); if (parsed.data.invoiceReference) patch.invoiceReference = parsed.data.invoiceReference; }
    if (next === "paid") patch.paidAt = new Date();
    const updated = await finesStorage.updateFine(id, patch);
    await AuditLogger.logFromRequest(req, "fine.status", "fine", id, { from: fine.status, to: next });
    res.json(updated);
  });
}
```

Register in `server/routes.ts` next to `registerPortalAdminRoutes(app, routeDeps);`: `registerFineRoutes(app, routeDeps);` with the import.

- [ ] **Step 5: Run and commit**

Run: `npx vitest run server/__tests__/fines-routes.test.ts && npm run check` — Expected: 6 passed, 0 errors. If multer + supertest `.field()` sends numbers as strings, `insertFineSchema` already coerces `amount`/`adminFee`.

```bash
git add server/routes/fines.ts server/services/portal-mail.ts server/routes.ts server/__tests__/portal-helpers.ts server/__tests__/fines-routes.test.ts
git commit -m "feat(fines): staff API for entering, attributing, linking and charging fines"
```

---
### Task 4: Customer fines API in the portal

**Files:**
- Modify: `server/routes/portal.ts`
- Test: `server/__tests__/portal-fines.test.ts`

**Interfaces:**
- Consumes: `finesStorage.listFinesForCustomer / getFineForCustomer`, `requireFeature("canViewFines")`, `PortalFineDto`.
- Produces: `toFineDto(row: FineListRow): PortalFineDto`; routes `GET /api/portal/fines`, `GET /api/portal/fines/:id`, `GET /api/portal/fines/:id/letter` (404 for other customers / invisible statuses / no letter). Downloads log `fine_letter_downloaded`.

- [ ] **Step 1: Test**

`server/__tests__/portal-fines.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import fs from "fs";
import path from "path";
vi.mock("../utils/email-service", () => ({ sendEmail: vi.fn(async () => true) }));

import { buildPortalTestApp, createTestCustomer, createTestVehicle, createTestDriver, createTestReservation, createTestFine, cleanupPortalTestData, TEST_EMAIL_DOMAIN } from "./portal-helpers";
import { portalStorage } from "../services/portal-storage";
import { finesStorage } from "../services/fines-storage";
import { linkFineManually } from "../services/fine-attribution";
import { hashPassword } from "../auth";
import { getUploadsDir } from "../../shared/paths";

const password = "wachtwoord-1234";
async function login(app: any, email: string) {
  const agent = request.agent(app);
  expect((await agent.post("/api/portal/login").send({ email, password })).status).toBe(200);
  return agent;
}

describe("portal fines", () => {
  const app = buildPortalTestApp();
  let plate: string, a: number, b: number, driverA: number, driverOther: number, linkedId: number, newId: number, letterPath: string;

  beforeAll(async () => {
    await cleanupPortalTestData();
    plate = `PT${Date.now().toString().slice(-6)}`;
    const v = await createTestVehicle(plate);
    a = (await createTestCustomer("PFA")).id; b = (await createTestCustomer("PFB")).id;
    driverA = (await createTestDriver(a, "Chauffeur A")).id; driverOther = (await createTestDriver(a, "Ander")).id;
    const res = await createTestReservation({ customerId: a, vehicleId: v.id, driverId: driverA, status: "picked_up" });
    letterPath = path.join(getUploadsDir(), "fines", "__test__", "brief.pdf");
    fs.mkdirSync(path.dirname(letterPath), { recursive: true }); fs.writeFileSync(letterPath, "%PDF");
    const f1 = await createTestFine({ licensePlate: plate, offenceAt: new Date("2026-09-03T10:00:00Z") });
    await finesStorage.updateFine(f1.id, { letterFilePath: path.relative(process.cwd(), letterPath) });
    linkedId = (await linkFineManually(f1.id, { customerId: a, reservationId: res.id, driverId: driverA }, "t")).id;
    newId = (await createTestFine({ licensePlate: plate, offenceAt: new Date("2026-09-04T10:00:00Z") })).id;
    for (const [cid, email, role, driverId] of [[a, `admin@${TEST_EMAIL_DOMAIN}`, "admin", null], [a, `drv@${TEST_EMAIL_DOMAIN}`, "driver", driverOther], [b, `b@${TEST_EMAIL_DOMAIN}`, "admin", null]] as const) {
      const u = await portalStorage.createPortalUser({ customerId: cid, email, fullName: "U", role, driverId }, "t");
      await portalStorage.updatePortalUser(u.id, { passwordHash: await hashPassword(password) });
    }
  });
  afterAll(async () => { await cleanupPortalTestData(); fs.rmSync(path.dirname(letterPath), { recursive: true, force: true }); });

  it("shows linked fines only, with driver and letter flag", async () => {
    const agent = await login(app, `admin@${TEST_EMAIL_DOMAIN}`);
    const res = await agent.get("/api/portal/fines");
    expect(res.body.map((f: any) => f.id)).toEqual([linkedId]);
    expect(res.body[0]).toMatchObject({ licensePlate: plate, totalAmount: "110", hasLetter: true, driver: { id: driverA } });
    expect((await agent.get(`/api/portal/fines/${newId}`)).status).toBe(404);
    expect((await agent.get(`/api/portal/fines/${linkedId}/letter`)).status).toBe(200);
  });

  it("driver role sees only own fines; other customer sees none", async () => {
    const drv = await login(app, `drv@${TEST_EMAIL_DOMAIN}`);
    expect((await drv.get("/api/portal/fines")).body).toEqual([]);
    const other = await login(app, `b@${TEST_EMAIL_DOMAIN}`);
    expect((await other.get(`/api/portal/fines/${linkedId}/letter`)).status).toBe(404);
  });

  it("respects the canViewFines switch", async () => {
    await portalStorage.updateCustomerSettings(a, { canViewFines: false }, "t");
    const agent = await login(app, `admin@${TEST_EMAIL_DOMAIN}`);
    expect((await agent.get("/api/portal/fines")).body.code).toBe("PORTAL_FEATURE_DISABLED");
    await portalStorage.updateCustomerSettings(a, { canViewFines: true }, "t");
  });
});
```

- [ ] **Step 2: Implement in `server/routes/portal.ts`**

Imports: `import { finesStorage, type FineListRow } from "../services/fines-storage";`, `import type { PortalFineDto } from "../../shared/fines";`.

```ts
export function toFineDto(f: FineListRow): PortalFineDto {
  return {
    id: f.id, licensePlate: f.licensePlate, offenceAt: f.offenceAt.toISOString(), description: f.description, reference: f.reference,
    amount: f.amount, adminFee: f.adminFee, totalAmount: f.totalAmount, status: f.status as PortalFineDto["status"],
    customerNote: f.customerNote, driver: f.driverId ? { id: f.driverId, displayName: f.driverName ?? "" } : null,
    reservationId: f.reservationId, hasLetter: Boolean(f.letterFilePath), createdAt: f.createdAt.toISOString(),
  };
}
```

Inside `registerPortalRoutes`, after the documents block:

```ts
  // ---- fines ------------------------------------------------------------------
  app.get("/api/portal/fines", requirePortalUser, requireFeature("canViewFines"), async (req, res) => {
    const ctx = ctxOf(req);
    res.json((await finesStorage.listFinesForCustomer(ctx.customerId, ctx.scope)).map(toFineDto));
  });

  app.get("/api/portal/fines/:id", requirePortalUser, requireFeature("canViewFines"), async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const ctx = ctxOf(req);
    const fine = await finesStorage.getFineForCustomer(id, ctx.customerId, ctx.scope);
    if (!fine) return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Fine not found");
    res.json(toFineDto(fine));
  });

  app.get("/api/portal/fines/:id/letter", requirePortalUser, requireFeature("canViewFines"), async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const ctx = ctxOf(req);
    const fine = await finesStorage.getFineForCustomer(id, ctx.customerId, ctx.scope);
    const file = fine?.letterFilePath ? resolveDocumentFilePath(fine.letterFilePath) : null;
    if (!fine || !file) return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Letter not found");
    await logPortalActivity(req, "fine_letter_downloaded", { entity: "fine", entityId: id });
    res.setHeader("Content-Type", file.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${sanitizeFilename(path.basename(file))}"`);
    fs.createReadStream(file).pipe(res);
  });
```

Note the test expects `totalAmount: "110"` — Postgres returns numeric as text `"110.00"`. Make the assertion `Number(res.body[0].totalAmount) === 110` instead (`expect(Number(res.body[0].totalAmount)).toBe(110)`).

- [ ] **Step 3: Run and commit**

Run: `npx vitest run server/__tests__/portal-fines.test.ts && npm run check` — Expected: 3 passed, 0 errors.

```bash
git add server/routes/portal.ts server/__tests__/portal-fines.test.ts
git commit -m "feat(portal): customers see their linked fines and download the letter"
```

---
### Task 5: Requests storage and staff requests API

**Files:**
- Create: `server/services/portal-requests-storage.ts`, `server/routes/portal-requests.ts`
- Modify: `server/services/portal-mail.ts` (`sendRequestReplyMail`), `server/routes.ts` (register), `server/routes/portal-admin.ts` (`unread-count` adds new requests)
- Test: `server/__tests__/portal-requests-routes.test.ts`

**Interfaces:**
- Produces (`portal-requests-storage.ts`, object `requestsStorage`): `createRequest(data: InsertPortalRequest): Promise<PortalRequest>`, `addAttachment(data)`, `getRequest(id): Promise<RequestRow | undefined>` (`RequestRow = PortalRequest & { customerName: string; submittedBy: string | null; submitterEmail: string | null; attachments: PortalRequestAttachment[]; reservationLabel: string | null }`), `listRequests(filters: { status?, type?, customerId? }): Promise<RequestRow[]>`, `listRequestsForCustomer(customerId, scope: { portalUserId?: number })`, `getRequestForCustomer(id, customerId, scope)`, `updateRequest(id, patch)`, `countNewRequests(): Promise<number>`, `getAttachment(id)`, `toRequestDto(row: RequestRow, staff: boolean): PortalRequestDto`.
- Produces (`portal-requests.ts`): `registerPortalRequestRoutes(app, deps)`; routes (`view_portal` read, `manage_portal` write):
  - `GET /api/portal-requests?status&type&customerId`, `GET /api/portal-requests/count-new` → `{ count }`, `GET /api/portal-requests/:id`, `GET /api/portal-requests/:id/attachments/:attachmentId`
  - `POST /api/portal-requests/:id/take` → status `in_progress`, `handledBy`
  - `POST /api/portal-requests/:id/reply` `{ reply, status: 'done' | 'rejected' | 'in_progress' }` (reply required for `rejected`) → saves reply, mails the submitter, logs `request_replied`
  - `POST /api/portal-requests/:id/approve` (only `extension`/`early_return`): conflict check via `storage.checkReservationConflicts(vehicleId, startDate, newEnd, reservationId)`; on conflict 409 `{ message, conflicts }`; otherwise `storage.updateReservation(id, { endDate })`, `scheduleContractRegeneration(reservationId, username)`, request `done` with reply `"Goedgekeurd: nieuwe einddatum <date>."` (or "…inleverdatum…"), mail + log.
- Produces (`portal-mail.ts`): `sendRequestReplyMail(requestId): Promise<boolean>` → to the submitting portal user's e-mail, template `portal_request_replied`, vars `name, type (Dutch label), reply, status, link (<base>/portaal/aanvragen/<id>)`.
- Modify `GET /api/portal-admin/unread-count` to return `{ count: unreadPortalNotifications + newRequests }`.

- [ ] **Step 1: Test**

`server/__tests__/portal-requests-routes.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn(async () => true) }));
vi.mock("../utils/email-service", () => ({ sendEmail }));
vi.mock("../services/reservation-pdf-regeneration", () => ({ scheduleContractRegeneration: vi.fn() }));

import { registerPortalRequestRoutes } from "../routes/portal-requests";
import { requestsStorage } from "../services/portal-requests-storage";
import { portalStorage } from "../services/portal-storage";
import { buildStaffTestApp, createTestCustomer, createTestVehicle, createTestReservation, cleanupPortalTestData, TEST_EMAIL_DOMAIN } from "./portal-helpers";
import { UserPermission } from "../../shared/schema";
import { getUploadsDir } from "../../shared/paths";
import { db } from "../db";
import { reservations } from "../../shared/schema";
import { eq } from "drizzle-orm";

const deps = { uploadsDir: getUploadsDir(), requireAuth: (_r: any, _s: any, n: any) => n() } as any;
const manager = buildStaffTestApp([UserPermission.MANAGE_PORTAL], (app) => registerPortalRequestRoutes(app, deps));

describe("staff portal requests", () => {
  let customerId: number, vehicleId: number, resId: number, userId: number, extId: number, otherId: number;
  beforeAll(async () => {
    await cleanupPortalTestData();
    customerId = (await createTestCustomer("RQ")).id;
    vehicleId = (await createTestVehicle()).id;
    resId = (await createTestReservation({ customerId, vehicleId, startDate: "2026-09-01", endDate: "2026-09-10", status: "picked_up" })).id;
    await createTestReservation({ customerId, vehicleId, startDate: "2026-09-20", endDate: "2026-09-25" });
    userId = (await portalStorage.createPortalUser({ customerId, email: `rq@${TEST_EMAIL_DOMAIN}`, fullName: "Aanvrager", role: "admin" }, "t")).id;
    extId = (await requestsStorage.createRequest({ customerId, portalUserId: userId, type: "extension", reservationId: resId, payload: { newEndDate: "2026-09-15" }, message: "Graag verlengen" })).id;
    otherId = (await requestsStorage.createRequest({ customerId, portalUserId: userId, type: "other", payload: { subject: "Vraag" }, message: "Hallo" })).id;
  });
  afterAll(cleanupPortalTestData);

  it("lists, counts new and takes a request", async () => {
    const list = await request(manager).get("/api/portal-requests?status=new");
    expect(list.body.map((r: any) => r.id).sort()).toEqual([extId, otherId].sort());
    expect(list.body[0].customerName).toContain("RQ");
    expect((await request(manager).get("/api/portal-requests/count-new")).body.count).toBeGreaterThanOrEqual(2);
    const taken = await request(manager).post(`/api/portal-requests/${otherId}/take`);
    expect(taken.body.status).toBe("in_progress");
    expect(taken.body.handledBy).toBe("staff-test");
  });

  it("replies, mails the submitter and enforces transitions", async () => {
    sendEmail.mockClear();
    const res = await request(manager).post(`/api/portal-requests/${otherId}/reply`).send({ reply: "Geregeld", status: "done" });
    expect(res.body.status).toBe("done");
    expect(res.body.staffReply).toBe("Geregeld");
    expect((sendEmail.mock.calls[0][0] as any).to).toBe(`rq@${TEST_EMAIL_DOMAIN}`);
    expect((await request(manager).post(`/api/portal-requests/${otherId}/reply`).send({ reply: "x", status: "in_progress" })).status).toBe(400);
    expect((await request(manager).post(`/api/portal-requests/${extId}/reply`).send({ status: "rejected" })).status).toBe(400);
  });

  it("refuses an extension that conflicts and approves one that fits", async () => {
    const conflict = await request(manager).post(`/api/portal-requests/${extId}/approve`);
    expect(conflict.status).toBe(200); // 2026-09-15 is before the next booking (20th): no conflict
    expect(conflict.body.status).toBe("done");
    const [r] = await db.select().from(reservations).where(eq(reservations.id, resId));
    expect(r.endDate).toBe("2026-09-15");

    const clash = await requestsStorage.createRequest({ customerId, portalUserId: userId, type: "extension", reservationId: resId, payload: { newEndDate: "2026-09-22" }, message: "Nog langer" });
    const res = await request(manager).post(`/api/portal-requests/${clash.id}/approve`);
    expect(res.status).toBe(409);
    expect(res.body.conflicts.length).toBe(1);
    expect((await requestsStorage.getRequest(clash.id))!.status).toBe("new");
  });
});
```

- [ ] **Step 2: `server/services/portal-requests-storage.ts`**

```ts
import { db } from "../db";
import { portalRequests, portalRequestAttachments, customers, portalUsers, reservations, vehicles, type PortalRequest, type InsertPortalRequest, type PortalRequestAttachment } from "../../shared/schema";
import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { PortalRequestDto } from "../../shared/portal-requests";

export type RequestRow = PortalRequest & {
  customerName: string; submittedBy: string | null; submitterEmail: string | null;
  attachments: PortalRequestAttachment[]; reservationLabel: string | null;
};

async function select(where: SQL | undefined, limit = 500): Promise<RequestRow[]> {
  const rows = await db.select({
    r: portalRequests,
    customerName: sql<string>`coalesce(${customers.companyName}, ${customers.name})`,
    submittedBy: portalUsers.fullName, submitterEmail: portalUsers.email,
    reservationLabel: sql<string | null>`case when ${reservations.id} is null then null else concat(${vehicles.licensePlate}, ' ', ${reservations.startDate}, ' – ', coalesce(${reservations.endDate}, '…')) end`,
  }).from(portalRequests)
    .innerJoin(customers, eq(portalRequests.customerId, customers.id))
    .leftJoin(portalUsers, eq(portalRequests.portalUserId, portalUsers.id))
    .leftJoin(reservations, eq(portalRequests.reservationId, reservations.id))
    .leftJoin(vehicles, eq(reservations.vehicleId, vehicles.id))
    .where(where).orderBy(desc(portalRequests.createdAt), desc(portalRequests.id)).limit(limit);
  if (rows.length === 0) return [];
  const atts = await db.select().from(portalRequestAttachments).where(inArray(portalRequestAttachments.requestId, rows.map((x) => x.r.id)));
  return rows.map((x) => ({ ...x.r, customerName: x.customerName, submittedBy: x.submittedBy, submitterEmail: x.submitterEmail, reservationLabel: x.reservationLabel, attachments: atts.filter((a) => a.requestId === x.r.id) }));
}

export function toRequestDto(row: RequestRow, staff: boolean): PortalRequestDto {
  const dto: PortalRequestDto = {
    id: row.id, type: row.type as PortalRequestDto["type"], status: row.status as PortalRequestDto["status"],
    reservationId: row.reservationId, fineId: row.fineId, payload: row.payload, message: row.message,
    staffReply: row.staffReply, repliedAt: row.repliedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(),
    submittedBy: row.submittedBy, reservationLabel: row.reservationLabel,
    attachments: row.attachments.map((a) => ({ id: a.id, fileName: a.fileName, contentType: a.contentType, fileSize: a.fileSize })),
  };
  if (staff) { dto.customerId = row.customerId; dto.customerName = row.customerName; }
  return dto;
}

export const requestsStorage = {
  async createRequest(data: InsertPortalRequest): Promise<PortalRequest> {
    const [row] = await db.insert(portalRequests).values(data).returning(); return row;
  },
  async addAttachment(data: typeof portalRequestAttachments.$inferInsert): Promise<PortalRequestAttachment> {
    const [row] = await db.insert(portalRequestAttachments).values(data).returning(); return row;
  },
  async getAttachment(id: number): Promise<PortalRequestAttachment | undefined> {
    const [row] = await db.select().from(portalRequestAttachments).where(eq(portalRequestAttachments.id, id)); return row;
  },
  async getRequest(id: number): Promise<RequestRow | undefined> { return (await select(eq(portalRequests.id, id)))[0]; },
  async listRequests(f: { status?: string; type?: string; customerId?: number }): Promise<RequestRow[]> {
    return select(and(
      f.status ? eq(portalRequests.status, f.status) : undefined,
      f.type ? eq(portalRequests.type, f.type) : undefined,
      f.customerId ? eq(portalRequests.customerId, f.customerId) : undefined,
    ));
  },
  async listRequestsForCustomer(customerId: number, scope: { portalUserId?: number }): Promise<RequestRow[]> {
    return select(and(eq(portalRequests.customerId, customerId), scope.portalUserId ? eq(portalRequests.portalUserId, scope.portalUserId) : undefined));
  },
  async getRequestForCustomer(id: number, customerId: number, scope: { portalUserId?: number }): Promise<RequestRow | undefined> {
    return (await select(and(eq(portalRequests.id, id), eq(portalRequests.customerId, customerId), scope.portalUserId ? eq(portalRequests.portalUserId, scope.portalUserId) : undefined)))[0];
  },
  async updateRequest(id: number, patch: Partial<PortalRequest>): Promise<PortalRequest | undefined> {
    const [row] = await db.update(portalRequests).set({ ...patch, updatedAt: new Date() }).where(eq(portalRequests.id, id)).returning(); return row;
  },
  async countNewRequests(): Promise<number> {
    const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(portalRequests).where(eq(portalRequests.status, "new")); return r?.n ?? 0;
  },
};
```

- [ ] **Step 3: Reply mail in `portal-mail.ts`**

```ts
const REQUEST_TYPE_LABEL: Record<string, string> = { extension: "verlenging", early_return: "eerder inleveren", damage: "schademelding", fine_question: "vraag over bekeuring", other: "overig" };
const REQUEST_STATUS_LABEL: Record<string, string> = { new: "nieuw", in_progress: "in behandeling", done: "afgehandeld", rejected: "afgewezen" };

export async function sendRequestReplyMail(requestId: number): Promise<boolean> {
  const row = await requestsStorage.getRequest(requestId);
  if (!row || !row.submitterEmail || !row.staffReply) return false;
  const config = await getPortalConfig();
  const template = await getPortalTemplate(PORTAL_TEMPLATE.REQUEST_REPLIED);
  const vars = {
    name: row.submittedBy ?? "", type: REQUEST_TYPE_LABEL[row.type] ?? row.type, reply: row.staffReply,
    status: REQUEST_STATUS_LABEL[row.status] ?? row.status,
    link: `${config.portalBaseUrl.replace(/\/$/, "")}/portaal/aanvragen/${row.id}`,
  };
  const html = renderTemplate(template.content, vars);
  return sendEmail({ to: row.submitterEmail, toName: row.submittedBy ?? undefined, subject: renderTemplate(template.subject, vars), html, text: stripHtml(html) }, "custom");
}
```

with `import { requestsStorage } from "./portal-requests-storage";`.

- [ ] **Step 4: `server/routes/portal-requests.ts`**

```ts
import type { Express, Request, Response } from "express";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { hasPermission } from "../middleware/permissions.js";
import { UserPermission } from "../../shared/schema";
import { isValidRequestTransition, REQUEST_TRANSITIONS, type PortalRequestStatusValue } from "../../shared/portal-requests";
import { requestsStorage, toRequestDto } from "../services/portal-requests-storage";
import { sendRequestReplyMail } from "../services/portal-mail";
import { portalStorage } from "../services/portal-storage";
import { storage } from "../storage";
import { scheduleContractRegeneration } from "../services/reservation-pdf-regeneration";
import { resolveDocumentFilePath } from "../services/document-paths";
import { sanitizeFilename } from "../utils/security/fileUploadSecurity";
import { AuditLogger } from "../utils/security/auditLogger";
import type { RouteDeps } from "./deps";

const canView = hasPermission(UserPermission.VIEW_PORTAL, UserPermission.MANAGE_PORTAL);
const canManage = hasPermission(UserPermission.MANAGE_PORTAL);

function idParam(req: Request, res: Response, name = "id"): number | null {
  const id = parseInt(req.params[name], 10);
  if (Number.isNaN(id)) { res.status(400).json({ message: `Invalid ${name}` }); return null; }
  return id;
}

export function registerPortalRequestRoutes(app: Express, _deps: RouteDeps): void {
  const actor = (req: Request) => req.user?.username ?? "system";

  async function finish(req: Request, id: number, reply: string, status: PortalRequestStatusValue, customerId: number) {
    const updated = await requestsStorage.updateRequest(id, { staffReply: reply, repliedAt: new Date(), repliedBy: actor(req), status, handledBy: actor(req) });
    try { await sendRequestReplyMail(id); } catch (e) { console.error("request reply mail failed:", e); }
    await portalStorage.logActivity({ customerId, action: "request_replied", entity: "request", entityId: id, details: { status, by: actor(req) } });
    await AuditLogger.logFromRequest(req, "portal_request.reply", "portal_request", id, { status });
    return updated;
  }

  app.get("/api/portal-requests", canView, async (req, res) => {
    const rows = await requestsStorage.listRequests({
      status: req.query.status ? String(req.query.status) : undefined,
      type: req.query.type ? String(req.query.type) : undefined,
      customerId: req.query.customerId ? parseInt(String(req.query.customerId), 10) : undefined,
    });
    res.json(rows.map((r) => toRequestDto(r, true)));
  });

  app.get("/api/portal-requests/count-new", canView, async (_req, res) => res.json({ count: await requestsStorage.countNewRequests() }));

  app.get("/api/portal-requests/:id", canView, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const row = await requestsStorage.getRequest(id);
    if (!row) return res.status(404).json({ message: "Request not found" });
    res.json(toRequestDto(row, true));
  });

  app.get("/api/portal-requests/:id/attachments/:attachmentId", canView, async (req, res) => {
    const id = idParam(req, res); const attachmentId = idParam(req, res, "attachmentId"); if (id === null || attachmentId === null) return;
    const att = await requestsStorage.getAttachment(attachmentId);
    const file = att && att.requestId === id ? resolveDocumentFilePath(att.filePath) : null;
    if (!att || !file) return res.status(404).json({ message: "Attachment not found" });
    res.setHeader("Content-Type", att.contentType);
    res.setHeader("Content-Disposition", `inline; filename="${sanitizeFilename(att.fileName)}"`);
    fs.createReadStream(file).pipe(res);
  });

  app.post("/api/portal-requests/:id/take", canManage, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const row = await requestsStorage.getRequest(id);
    if (!row) return res.status(404).json({ message: "Request not found" });
    if (!isValidRequestTransition(row.status, "in_progress")) return res.status(400).json({ message: "Cannot take this request", allowed: REQUEST_TRANSITIONS[row.status as PortalRequestStatusValue] });
    res.json(await requestsStorage.updateRequest(id, { status: "in_progress", handledBy: actor(req) }));
  });

  app.post("/api/portal-requests/:id/reply", canManage, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const row = await requestsStorage.getRequest(id);
    if (!row) return res.status(404).json({ message: "Request not found" });
    const parsed = z.object({ reply: z.string().trim().max(4000).optional(), status: z.enum(["done", "rejected", "in_progress"]) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "status is required" });
    const reply = parsed.data.reply ?? "";
    if (parsed.data.status !== "in_progress" && !reply) return res.status(400).json({ message: "A reply is required" });
    if (row.status !== parsed.data.status && !isValidRequestTransition(row.status, parsed.data.status)) {
      return res.status(400).json({ message: `Cannot go from ${row.status} to ${parsed.data.status}`, allowed: REQUEST_TRANSITIONS[row.status as PortalRequestStatusValue] });
    }
    res.json(await finish(req, id, reply, parsed.data.status, row.customerId));
  });

  app.post("/api/portal-requests/:id/approve", canManage, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const row = await requestsStorage.getRequest(id);
    if (!row) return res.status(404).json({ message: "Request not found" });
    if (row.type !== "extension" && row.type !== "early_return") return res.status(400).json({ message: "Only extensions and early returns can be approved" });
    if (!isValidRequestTransition(row.status, "done")) return res.status(400).json({ message: "Request is already closed" });
    const reservation = row.reservationId ? await storage.getReservation(row.reservationId) : undefined;
    if (!reservation || !reservation.vehicleId) return res.status(400).json({ message: "Reservation not found" });
    const newEnd = String(row.type === "extension" ? row.payload.newEndDate : row.payload.returnDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newEnd)) return res.status(400).json({ message: "Request has no valid date" });
    const conflicts = (await storage.checkReservationConflicts(reservation.vehicleId, reservation.startDate, newEnd, reservation.id))
      .filter((c) => c.id !== reservation.id);
    if (conflicts.length > 0) {
      return res.status(409).json({ message: "Conflicts with another reservation", conflicts: conflicts.map((c) => ({ id: c.id, startDate: c.startDate, endDate: c.endDate, customerId: c.customerId })) });
    }
    await storage.updateReservation(reservation.id, { endDate: newEnd, updatedBy: actor(req) } as any);
    scheduleContractRegeneration(reservation.id, actor(req));
    await AuditLogger.logFromRequest(req, "reservation.update", "reservation", reservation.id, { endDate: newEnd, viaPortalRequest: id });
    const reply = row.type === "extension" ? `Goedgekeurd: nieuwe einddatum ${newEnd}.` : `Goedgekeurd: inleverdatum ${newEnd}.`;
    res.json(await finish(req, id, reply, "done", row.customerId));
  });
}
```

Register in `server/routes.ts` next to `registerFineRoutes(app, routeDeps);`: `registerPortalRequestRoutes(app, routeDeps);`.

In `server/routes/portal-admin.ts`, `GET /api/portal-admin/unread-count` becomes:

```ts
    const unread = await storage.getUnreadCustomNotifications();
    const newRequests = await requestsStorage.countNewRequests();
    res.json({ count: unread.filter((n) => n.type.startsWith("portal_")).length + newRequests, newRequests });
```

with `import { requestsStorage } from "../services/portal-requests-storage";`. Adjust the existing admin test expectation (`count` may be > 0 after mark-read when new requests exist): assert `res.body.count === res.body.newRequests` after mark-read.

- [ ] **Step 5: Run and commit**

Run: `npx vitest run server/__tests__/portal-requests-routes.test.ts server/__tests__/portal-admin-routes.test.ts && npm run check` — Expected: all passed, 0 errors.

```bash
git add server/services/portal-requests-storage.ts server/routes/portal-requests.ts server/services/portal-mail.ts server/routes.ts server/routes/portal-admin.ts server/__tests__/portal-requests-routes.test.ts server/__tests__/portal-admin-routes.test.ts
git commit -m "feat(portal): staff inbox API for customer requests with reply mail and extension approval"
```

---
### Task 6: Customer requests API in the portal

**Files:**
- Modify: `server/routes/portal.ts`
- Test: `server/__tests__/portal-requests.test.ts`

**Interfaces:**
- Consumes: `requestsStorage`, `toRequestDto`, `requestPayloadSchemas`, `REQUEST_NEEDS`, `finesStorage.getFineForCustomer`, `portalStorage.getReservationForCustomer`, `notifyStaffOfPortalEvent`, upload helpers.
- Produces (all behind `requirePortalUser` + `requireFeature("canSubmitRequests")`):
  - `GET /api/portal/requests` (role `driver`: own submissions only), `GET /api/portal/requests/:id`
  - `POST /api/portal/requests` multipart (`type`, `message`, `reservationId?`, `fineId?`, `payload` as JSON string, files `attachments[]` max 5) → 201 `PortalRequestDto`; validation: payload per type, linked reservation/fine must be the customer's (404 otherwise), `extension.newEndDate` > current end and `early_return.returnDate` >= today and < current end else 400 `PORTAL_REQUEST_INVALID_PERIOD`, more than 5 files → 400 `PORTAL_ATTACHMENT_LIMIT`
  - `GET /api/portal/requests/:id/attachments/:attachmentId`
  - Submitting calls `notifyStaffOfPortalEvent({ kind: 'portal_request', title: 'Nieuwe aanvraag (<type label>): <customer>', description: message (first 200 chars), link: '/portal-admin?request=<id>', customerId })` and logs `request_submitted`.

- [ ] **Step 1: Test**

`server/__tests__/portal-requests.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
const { notify } = vi.hoisted(() => ({ notify: vi.fn(async () => undefined) }));
vi.mock("../utils/email-service", () => ({ sendEmail: vi.fn(async () => true) }));
vi.mock("../services/portal-notifications", () => ({ notifyStaffOfPortalEvent: notify }));

import { buildPortalTestApp, createTestCustomer, createTestVehicle, createTestDriver, createTestReservation, cleanupPortalTestData, TEST_EMAIL_DOMAIN } from "./portal-helpers";
import { portalStorage } from "../services/portal-storage";
import { hashPassword } from "../auth";

const password = "wachtwoord-1234";
async function login(app: any, email: string) {
  const agent = request.agent(app);
  expect((await agent.post("/api/portal/login").send({ email, password })).status).toBe(200);
  const { body } = await agent.get("/api/portal/csrf-token");
  return { agent, csrf: body.token as string };
}

describe("portal requests (customer)", () => {
  const app = buildPortalTestApp();
  let a: number, b: number, resA: number, resB: number, driverId: number;
  beforeAll(async () => {
    await cleanupPortalTestData();
    a = (await createTestCustomer("PRA")).id; b = (await createTestCustomer("PRB")).id;
    const v = await createTestVehicle();
    driverId = (await createTestDriver(a)).id;
    resA = (await createTestReservation({ customerId: a, vehicleId: v.id, startDate: "2026-09-01", endDate: "2026-12-10", status: "picked_up" })).id;
    resB = (await createTestReservation({ customerId: b, vehicleId: v.id, startDate: "2027-01-01", endDate: "2027-01-05" })).id;
    for (const [cid, email, role, drv] of [[a, `pra@${TEST_EMAIL_DOMAIN}`, "admin", null], [a, `prd@${TEST_EMAIL_DOMAIN}`, "driver", driverId]] as const) {
      const u = await portalStorage.createPortalUser({ customerId: cid, email, fullName: "U", role, driverId: drv }, "t");
      await portalStorage.updatePortalUser(u.id, { passwordHash: await hashPassword(password) });
    }
  });
  afterAll(cleanupPortalTestData);

  it("creates an extension request with an attachment and notifies staff", async () => {
    const { agent, csrf } = await login(app, `pra@${TEST_EMAIL_DOMAIN}`);
    const res = await agent.post("/api/portal/requests").set("X-CSRF-Token", csrf)
      .field("type", "extension").field("reservationId", String(resA)).field("payload", JSON.stringify({ newEndDate: "2026-12-20" })).field("message", "Graag tot de 20e")
      .attach("attachments", Buffer.from("%PDF-1.4"), { filename: "bijlage.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(201);
    expect(res.body.type).toBe("extension");
    expect(res.body.attachments).toHaveLength(1);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ kind: "portal_request", customerId: a }));
    const att = await agent.get(`/api/portal/requests/${res.body.id}/attachments/${res.body.attachments[0].id}`);
    expect(att.status).toBe(200);
  });

  it("rejects invalid periods, foreign reservations and bad payloads", async () => {
    const { agent, csrf } = await login(app, `pra@${TEST_EMAIL_DOMAIN}`);
    const early = await agent.post("/api/portal/requests").set("X-CSRF-Token", csrf).send({ type: "extension", reservationId: resA, payload: { newEndDate: "2026-12-01" }, message: "x" });
    expect(early.body.code).toBe("PORTAL_REQUEST_INVALID_PERIOD");
    const foreign = await agent.post("/api/portal/requests").set("X-CSRF-Token", csrf).send({ type: "damage", reservationId: resB, payload: {}, message: "x" });
    expect(foreign.status).toBe(404);
    const bad = await agent.post("/api/portal/requests").set("X-CSRF-Token", csrf).send({ type: "other", payload: {}, message: "x" });
    expect(bad.body.code).toBe("PORTAL_VALIDATION");
  });

  it("drivers only see their own submissions", async () => {
    const admin = await login(app, `pra@${TEST_EMAIL_DOMAIN}`);
    expect((await admin.agent.get("/api/portal/requests")).body.length).toBe(1);
    const drv = await login(app, `prd@${TEST_EMAIL_DOMAIN}`);
    expect((await drv.agent.get("/api/portal/requests")).body).toEqual([]);
    const own = await drv.agent.post("/api/portal/requests").set("X-CSRF-Token", drv.csrf).send({ type: "other", payload: { subject: "Hoi" }, message: "Vraag" });
    expect(own.status).toBe(201);
    expect((await drv.agent.get("/api/portal/requests")).body.length).toBe(1);
    expect((await admin.agent.get("/api/portal/requests")).body.length).toBe(2);
  });
});
```

- [ ] **Step 2: Implement in `server/routes/portal.ts`**

Imports: `requestsStorage, toRequestDto` from `../services/portal-requests-storage`; `requestPayloadSchemas, REQUEST_NEEDS, PortalRequestType` from `../../shared/portal-requests`.

```ts
  // ---- requests -----------------------------------------------------------------
  const REQUEST_LABEL: Record<string, string> = { extension: "verlenging", early_return: "eerder inleveren", damage: "schademelding", fine_question: "vraag over bekeuring", other: "overig" };
  const requestScope = (req: Request) => (ctxOf(req).user.role === "driver" ? { portalUserId: ctxOf(req).user.id } : {});
  const attachmentUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => { const dir = path.join(uploadsDir, "portal-requests"); fs.mkdirSync(dir, { recursive: true }); cb(null, dir); },
      filename: (req, file, cb) => cb(null, `req_c${req.portalUser?.customerId ?? 0}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${path.extname(sanitizeFilename(file.originalname))}`),
    }),
    limits: { fileSize: 10 * 1024 * 1024, files: 5 },
    fileFilter: createSecureMulterFilter("document"),
  });
  const requireRequests = [requirePortalUser, requireFeature("canSubmitRequests")] as const;

  app.get("/api/portal/requests", ...requireRequests, async (req, res) => {
    const ctx = ctxOf(req);
    res.json((await requestsStorage.listRequestsForCustomer(ctx.customerId, requestScope(req))).map((r) => toRequestDto(r, false)));
  });

  app.get("/api/portal/requests/:id", ...requireRequests, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const row = await requestsStorage.getRequestForCustomer(id, ctxOf(req).customerId, requestScope(req));
    if (!row) return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Request not found");
    res.json(toRequestDto(row, false));
  });

  app.get("/api/portal/requests/:id/attachments/:attachmentId", ...requireRequests, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const attachmentId = parseInt(req.params.attachmentId, 10);
    const row = await requestsStorage.getRequestForCustomer(id, ctxOf(req).customerId, requestScope(req));
    const att = row?.attachments.find((a) => a.id === attachmentId);
    const file = att ? resolveDocumentFilePath(att.filePath) : null;
    if (!att || !file) return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Attachment not found");
    res.setHeader("Content-Type", att.contentType);
    res.setHeader("Content-Disposition", `inline; filename="${sanitizeFilename(att.fileName)}"`);
    fs.createReadStream(file).pipe(res);
  });

  app.post("/api/portal/requests", ...requireRequests, (req, res, next) => {
    attachmentUpload.array("attachments", 5)(req, res, (err: any) => {
      if (err?.code === "LIMIT_FILE_COUNT" || err?.code === "LIMIT_UNEXPECTED_FILE") return portalError(res, 400, PORTAL_ERROR.ATTACHMENT_LIMIT, "At most 5 attachments");
      if (err) return portalError(res, 400, PORTAL_ERROR.VALIDATION, err.message ?? "Upload failed");
      next();
    });
  }, async (req, res) => {
    const ctx = ctxOf(req);
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const discard = () => files.forEach((f) => fs.rmSync(f.path, { force: true }));
    const base = z.object({
      type: z.enum([PortalRequestType.EXTENSION, PortalRequestType.EARLY_RETURN, PortalRequestType.DAMAGE, PortalRequestType.FINE_QUESTION, PortalRequestType.OTHER]),
      message: z.string().trim().min(1).max(4000),
      reservationId: z.coerce.number().int().positive().optional(),
      fineId: z.coerce.number().int().positive().optional(),
      payload: z.preprocess((v) => (typeof v === "string" ? JSON.parse(v || "{}") : v ?? {}), z.record(z.unknown())),
    }).safeParse(req.body);
    if (!base.success) { discard(); return portalError(res, 400, PORTAL_ERROR.VALIDATION, base.error.errors[0]?.message ?? "Invalid input"); }
    const { type, message, reservationId, fineId } = base.data;
    const payload = requestPayloadSchemas[type].safeParse(base.data.payload);
    if (!payload.success) { discard(); return portalError(res, 400, PORTAL_ERROR.VALIDATION, payload.error.errors[0]?.message ?? "Invalid details"); }

    const needs = REQUEST_NEEDS[type];
    let reservation = null;
    if (needs === "reservation") {
      if (!reservationId) { discard(); return portalError(res, 400, PORTAL_ERROR.VALIDATION, "reservationId is required"); }
      reservation = await portalStorage.getReservationForCustomer(reservationId, ctx.customerId, ctx.scope);
      if (!reservation) { discard(); return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Reservation not found"); }
    }
    if (needs === "fine") {
      if (!fineId || !(await finesStorage.getFineForCustomer(fineId, ctx.customerId, ctx.scope))) { discard(); return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Fine not found"); }
    }
    const today = new Date().toISOString().slice(0, 10);
    const p = payload.data as Record<string, string>;
    if (type === "extension" && reservation?.endDate && p.newEndDate <= reservation.endDate) { discard(); return portalError(res, 400, PORTAL_ERROR.REQUEST_INVALID_PERIOD, "New end date must be after the current end date"); }
    if (type === "early_return" && reservation && (p.returnDate < today || (reservation.endDate && p.returnDate >= reservation.endDate))) { discard(); return portalError(res, 400, PORTAL_ERROR.REQUEST_INVALID_PERIOD, "Return date must be before the current end date"); }

    for (const f of files) {
      const check = await validateAfterUpload(f.path, f.originalname, f.mimetype, "document");
      if (!check.valid) { discard(); return portalError(res, 400, PORTAL_ERROR.VALIDATION, check.error ?? "Invalid file"); }
    }
    const created = await requestsStorage.createRequest({
      customerId: ctx.customerId, portalUserId: ctx.user.id, type, reservationId: needs === "reservation" ? reservationId! : null,
      fineId: needs === "fine" ? fineId! : null, payload: payload.data as Record<string, unknown>, message,
    });
    for (const f of files) {
      await requestsStorage.addAttachment({ requestId: created.id, fileName: sanitizeFilename(f.originalname), filePath: path.relative(process.cwd(), f.path), contentType: f.mimetype, fileSize: f.size });
    }
    await logPortalActivity(req, "request_submitted", { entity: "request", entityId: created.id, details: { type } });
    const customer = await storage.getCustomer(ctx.customerId);
    await notifyStaffOfPortalEvent({
      kind: "portal_request", title: `Nieuwe aanvraag (${REQUEST_LABEL[type]}): ${customer?.companyName || customer?.name || ctx.customerId}`,
      description: message.slice(0, 200), link: `/portal-admin?request=${created.id}`, customerId: ctx.customerId,
    });
    const row = await requestsStorage.getRequest(created.id);
    res.status(201).json(toRequestDto(row!, false));
  });
```

`requireRequests` is a readonly tuple; spread it the same way `manageDrivers` is spread (declare it as `RequestHandler[]` if tsc complains).

- [ ] **Step 3: Run and commit**

Run: `npx vitest run server/__tests__/portal-requests.test.ts && npm test && npm run check` — Expected: all green, 0 errors.

```bash
git add server/routes/portal.ts server/__tests__/portal-requests.test.ts
git commit -m "feat(portal): customers submit typed requests with attachments"
```

---
### Task 7: Staff fines UI — dialogs and tab

**Files:**
- Create: `client/src/components/fines/fine-status-badge.tsx`, `client/src/components/fines/fines-table.tsx`, `client/src/components/fines/new-fine-dialog.tsx`, `client/src/components/fines/fine-dialog.tsx`
- Modify: `client/src/contexts/GlobalDialogContext.tsx`, `client/src/components/global-dialogs.tsx`, `client/src/pages/portal-admin/index.tsx`, `client/src/locales/{nl,en}/portal.json`

**Interfaces:**
- Consumes: staff API from Task 3 (`/api/fines…`), `useGlobalDialog().openCustomerDialog / openReservationDialog`.
- Produces: `GlobalDialogContext`: state `fine: { open: boolean; id: number | null }`, `newFine: { open: boolean; licensePlate?: string }`; `openFineDialog(id: number)`, `closeFineDialog()`, `openNewFineDialog(prefill?: { licensePlate?: string })`, `closeNewFineDialog()`. Components `<FinesTable customerId? licensePlate? />` (list with filters; row → `openFineDialog`), `<NewFineDialog />` and `<FineDialog />` (rendered once in `GlobalDialogs`, driven by context), `<FineStatusBadge status />`. Page `/portal-admin` tab `fines`; URL params `?tab=fines&plate=…` select tab + plate filter, `?fine=<id>` opens `FineDialog` on load.
- Query keys: `['/api/fines', filters]`, `['/api/fines', id]`.

- [ ] **Step 1: Translations**

Add to `admin` in `client/src/locales/nl/portal.json` (English mirror in `en/portal.json`):

```json
"tabs": { "customers": "Klanten", "accounts": "Accounts", "vehicles": "Voertuigen online", "activity": "Activiteit", "fines": "Bekeuringen", "requests": "Aanvragen" },
"fines": {
  "title": "Bekeuringen", "new": "Nieuwe bekeuring", "empty": "Geen bekeuringen gevonden.",
  "columns": { "plate": "Kenteken", "offenceAt": "Datum/tijd", "description": "Omschrijving", "customer": "Klant", "driver": "Bestuurder", "amount": "Bedrag", "fee": "Adm.kosten", "total": "Totaal", "status": "Status" },
  "filters": { "allStatuses": "Alle statussen", "plate": "Kenteken", "from": "Van", "to": "Tot" },
  "status": { "new": "Niet gekoppeld", "linked": "Gekoppeld", "charged": "Doorbelast", "paid": "Betaald", "disputed": "Betwist", "cancelled": "Geannuleerd" },
  "fields": { "plate": "Kenteken", "offenceAt": "Datum en tijd overtreding", "receivedAt": "Ontvangen op", "reference": "Kenmerk (CJIB)", "description": "Omschrijving", "amount": "Bedrag (€)", "adminFee": "Administratiekosten (€)", "letter": "Brief (PDF/JPG/PNG)", "internalNotes": "Interne notities", "customerNote": "Toelichting voor klant", "invoiceReference": "Factuurkenmerk" },
  "dialog": { "title": "Bekeuring #{{id}}", "newTitle": "Nieuwe bekeuring", "autoLinked": "Automatisch gekoppeld aan {{customer}}{{driver}}.", "notLinked": "Niet automatisch gekoppeld. Kies hieronder de klant (en eventueel de reservering/bestuurder).", "covering": "Reserveringen op het moment van de overtreding", "near": "Reserveringen rond die datum", "noCandidates": "Geen reserveringen gevonden voor dit kenteken. Kies een klant.", "chooseCustomer": "Klant", "chooseDriver": "Bestuurder (optioneel)", "withoutReservation": "Alleen klant, geen reservering", "link": "Koppelen", "unlink": "Ontkoppelen", "charge": "Doorbelasten", "paid": "Betaald", "dispute": "Betwist", "cancel": "Annuleren", "viewLetter": "Brief bekijken", "uploadLetter": "Brief uploaden", "save": "Opslaan", "saved": "Bekeuring opgeslagen.", "openCustomer": "Klant openen", "openReservation": "Reservering openen", "linkedBy": "Gekoppeld door {{by}} op {{at}}", "closed": "Deze bekeuring is afgesloten." }
}
```

- [ ] **Step 2: Dialog context**

`client/src/contexts/GlobalDialogContext.tsx`: add to `DialogState`

```ts
  fine: { open: boolean; id: number | null };
  newFine: { open: boolean; licensePlate?: string };
```

initial values `fine: { open: false, id: null }, newFine: { open: false }`; to the context type and provider:

```ts
  openFineDialog: (id: number) => void;
  closeFineDialog: () => void;
  openNewFineDialog: (prefill?: { licensePlate?: string }) => void;
  closeNewFineDialog: () => void;
```

```ts
  const openFineDialog = (id: number) => setDialogState((prev) => ({ ...prev, fine: { open: true, id } }));
  const closeFineDialog = () => setDialogState((prev) => ({ ...prev, fine: { open: false, id: null } }));
  const openNewFineDialog = (prefill?: { licensePlate?: string }) => setDialogState((prev) => ({ ...prev, newFine: { open: true, licensePlate: prefill?.licensePlate } }));
  const closeNewFineDialog = () => setDialogState((prev) => ({ ...prev, newFine: { open: false } }));
```

and add the four to the provider `value`. In `client/src/components/global-dialogs.tsx` render `<FineDialog />` and `<NewFineDialog />` (they read the context themselves) after the customer dialog.

- [ ] **Step 3: `fine-status-badge.tsx`**

```tsx
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";

const VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = { new: "secondary", linked: "default", charged: "outline", paid: "default", disputed: "destructive", cancelled: "secondary" };

export function FineStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation("portal");
  return <Badge variant={VARIANT[status] ?? "outline"} className={status === "paid" ? "bg-green-600 hover:bg-green-600" : undefined}>{t(`admin.fines.status.${status}`, { defaultValue: status })}</Badge>;
}
```

- [ ] **Step 4: `fines-table.tsx`**

```tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { useGlobalDialog } from "@/contexts/GlobalDialogContext";
import { useAuth } from "@/hooks/use-auth";
import { UserPermission, UserRole } from "@shared/schema";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FineStatusBadge } from "./fine-status-badge";
import { FineStatus } from "@shared/fines";

export interface FineRow {
  id: number; licensePlate: string; offenceAt: string; description: string; amount: string; adminFee: string; totalAmount: string;
  status: string; customerId: number | null; customerName: string | null; driverName: string | null; reservationId: number | null;
}

export function useCanManageFines(): boolean {
  const { user } = useAuth();
  return user?.role === UserRole.ADMIN || ((user?.permissions as string[] | undefined) ?? []).includes(UserPermission.MANAGE_FINES);
}

export function FinesTable({ customerId, initialPlate }: { customerId?: number; initialPlate?: string }) {
  const { t } = useTranslation("portal");
  const { openFineDialog, openNewFineDialog } = useGlobalDialog();
  const canManage = useCanManageFines();
  const [status, setStatus] = useState("");
  const [plate, setPlate] = useState(initialPlate ?? "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const filters = { status: status || undefined, customerId, licensePlate: plate.trim() || undefined, from: from || undefined, to: to || undefined };
  const { data = [] } = useQuery<FineRow[]>({
    queryKey: ["/api/fines", filters],
    queryFn: async () => {
      const q = new URLSearchParams(Object.entries(filters).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));
      return (await apiRequest("GET", `/api/fines?${q}`)).json();
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select className="rounded-md border px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)} data-testid="select-fine-status">
          <option value="">{t("admin.fines.filters.allStatuses")}</option>
          {Object.values(FineStatus).map((s) => <option key={s} value={s}>{t(`admin.fines.status.${s}`)}</option>)}
        </select>
        {!customerId && <Input placeholder={t("admin.fines.filters.plate")} value={plate} onChange={(e) => setPlate(e.target.value)} className="w-40" />}
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" aria-label={t("admin.fines.filters.from")} />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" aria-label={t("admin.fines.filters.to")} />
        {canManage && <Button size="sm" className="ml-auto" onClick={() => openNewFineDialog({ licensePlate: plate || undefined })} data-testid="button-new-fine">{t("admin.fines.new")}</Button>}
      </div>
      {data.length === 0 ? <p className="text-sm text-muted-foreground">{t("admin.fines.empty")}</p> : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>{t("admin.fines.columns.plate")}</TableHead><TableHead>{t("admin.fines.columns.offenceAt")}</TableHead>
            <TableHead>{t("admin.fines.columns.description")}</TableHead>
            {!customerId && <TableHead>{t("admin.fines.columns.customer")}</TableHead>}
            <TableHead>{t("admin.fines.columns.driver")}</TableHead><TableHead className="text-right">{t("admin.fines.columns.total")}</TableHead><TableHead>{t("admin.fines.columns.status")}</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {data.map((f) => (
              <TableRow key={f.id} className="cursor-pointer hover:bg-muted/40" onClick={() => openFineDialog(f.id)} data-testid={`row-fine-${f.id}`}>
                <TableCell className="font-mono">{f.licensePlate}</TableCell>
                <TableCell className="whitespace-nowrap">{new Date(f.offenceAt).toLocaleString()}</TableCell>
                <TableCell>{f.description}</TableCell>
                {!customerId && <TableCell>{f.customerName ?? "—"}</TableCell>}
                <TableCell>{f.driverName ?? "—"}</TableCell>
                <TableCell className="text-right">€ {f.totalAmount}</TableCell>
                <TableCell><FineStatusBadge status={f.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
```

- [ ] **Step 5: `new-fine-dialog.tsx`**

```tsx
import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { useGlobalDialog } from "@/contexts/GlobalDialogContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { PortalConfig } from "@shared/portal-types";

export function NewFineDialog() {
  const { t } = useTranslation("portal");
  const { toast } = useToast();
  const { dialogState, closeNewFineDialog, openFineDialog } = useGlobalDialog();
  const open = dialogState.newFine.open;
  const { data: config } = useQuery<PortalConfig>({ queryKey: ["/api/portal-admin/config"], queryFn: async () => (await apiRequest("GET", "/api/portal-admin/config")).json(), enabled: open });
  const [form, setForm] = useState({ licensePlate: "", offenceAt: "", receivedAt: "", reference: "", description: "", amount: "", adminFee: "", internalNotes: "" });
  const [file, setFile] = useState<File | null>(null);
  useEffect(() => { if (open) setForm((f) => ({ ...f, licensePlate: dialogState.newFine.licensePlate ?? "", adminFee: config ? String(config.fineAdminFee) : f.adminFee })); }, [open, config, dialogState.newFine.licensePlate]);

  const save = useMutation({
    mutationFn: async () => {
      const body = new FormData();
      Object.entries(form).forEach(([k, v]) => { if (v !== "") body.append(k, k === "offenceAt" ? new Date(v).toISOString() : v); });
      if (file) body.append("letterFile", file);
      const res = await fetch("/api/fines", { method: "POST", body, credentials: "include" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? res.statusText);
      return res.json() as Promise<{ fine: { id: number; status: string } }>;
    },
    onSuccess: ({ fine }) => {
      invalidateByPrefix("/api/fines");
      setForm({ licensePlate: "", offenceAt: "", receivedAt: "", reference: "", description: "", amount: "", adminFee: "", internalNotes: "" }); setFile(null);
      closeNewFineDialog();
      openFineDialog(fine.id); // shows the linked result or the candidate picker
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  function submit(e: FormEvent) { e.preventDefault(); save.mutate(); }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeNewFineDialog()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{t("admin.fines.dialog.newTitle")}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="nf-plate">{t("admin.fines.fields.plate")}</Label><Input id="nf-plate" value={form.licensePlate} onChange={set("licensePlate")} required data-testid="input-fine-plate" /></div>
            <div><Label htmlFor="nf-at">{t("admin.fines.fields.offenceAt")}</Label><Input id="nf-at" type="datetime-local" value={form.offenceAt} onChange={set("offenceAt")} required /></div>
            <div><Label htmlFor="nf-recv">{t("admin.fines.fields.receivedAt")}</Label><Input id="nf-recv" type="date" value={form.receivedAt} onChange={set("receivedAt")} /></div>
            <div><Label htmlFor="nf-ref">{t("admin.fines.fields.reference")}</Label><Input id="nf-ref" value={form.reference} onChange={set("reference")} /></div>
            <div><Label htmlFor="nf-amount">{t("admin.fines.fields.amount")}</Label><Input id="nf-amount" type="number" step="0.01" min="0" value={form.amount} onChange={set("amount")} required /></div>
            <div><Label htmlFor="nf-fee">{t("admin.fines.fields.adminFee")}</Label><Input id="nf-fee" type="number" step="0.01" min="0" value={form.adminFee} onChange={set("adminFee")} /></div>
          </div>
          <div><Label htmlFor="nf-desc">{t("admin.fines.fields.description")}</Label><Input id="nf-desc" value={form.description} onChange={set("description")} required /></div>
          <div><Label htmlFor="nf-letter">{t("admin.fines.fields.letter")}</Label><Input id="nf-letter" type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
          <div><Label htmlFor="nf-notes">{t("admin.fines.fields.internalNotes")}</Label><Textarea id="nf-notes" rows={2} value={form.internalNotes} onChange={set("internalNotes")} /></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={closeNewFineDialog}>{t("admin.dialog.cancel")}</Button>
            <Button type="submit" disabled={save.isPending} data-testid="button-save-fine">{t("admin.fines.dialog.save")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

The CSRF header is added by the global fetch interceptor.

- [ ] **Step 6: `fine-dialog.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { Customer, Driver } from "@shared/schema";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { useGlobalDialog } from "@/contexts/GlobalDialogContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { FineStatusBadge } from "./fine-status-badge";
import { useCanManageFines, type FineRow } from "./fines-table";
import { FINE_TRANSITIONS, type FineStatusValue } from "@shared/fines";

interface Candidate { id: number; customerId: number | null; customerName: string | null; startDate: string; endDate: string | null; driverId: number | null; driverName: string | null }
type FineDetail = FineRow & { reference: string | null; receivedAt: string | null; letterFilePath: string | null; internalNotes: string | null; customerNote: string | null; invoiceReference: string | null; linkedBy: string | null; linkedAt: string | null; driverId: number | null; candidates?: { covering: Candidate[]; near: Candidate[] } };

export function FineDialog() {
  const { t } = useTranslation("portal");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { dialogState, closeFineDialog, openCustomerDialog, openReservationDialog } = useGlobalDialog();
  const canManage = useCanManageFines();
  const id = dialogState.fine.id;
  const open = dialogState.fine.open && id !== null;
  const key = ["/api/fines", id];
  const { data: fine } = useQuery<FineDetail>({ queryKey: key, queryFn: async () => (await apiRequest("GET", `/api/fines/${id}`)).json(), enabled: open });

  const [edit, setEdit] = useState({ description: "", amount: "", adminFee: "", reference: "", internalNotes: "", customerNote: "" });
  const [pick, setPick] = useState<{ customerId: string; reservationId: string; driverId: string }>({ customerId: "", reservationId: "", driverId: "" });
  useEffect(() => { if (fine) setEdit({ description: fine.description, amount: fine.amount, adminFee: fine.adminFee, reference: fine.reference ?? "", internalNotes: fine.internalNotes ?? "", customerNote: fine.customerNote ?? "" }); }, [fine]);
  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"], enabled: open && fine?.status === "new" });
  const { data: drivers = [] } = useQuery<Driver[]>({ queryKey: [`/api/customers/${pick.customerId}/drivers`], enabled: open && pick.customerId !== "" });

  const done = () => { queryClient.invalidateQueries({ queryKey: key }); invalidateByPrefix("/api/fines"); };
  const call = useMutation({
    mutationFn: async ({ method, url, body }: { method: string; url: string; body?: unknown }) => (await apiRequest(method, url, body)).json(),
    onSuccess: () => { done(); toast({ title: t("admin.fines.dialog.saved") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });
  const closed = fine?.status === "paid" || fine?.status === "cancelled";
  const allowed = fine ? (FINE_TRANSITIONS[fine.status as FineStatusValue] ?? []) : [];
  const setStatus = (status: string) => {
    const invoiceReference = status === "charged" ? window.prompt(t("admin.fines.fields.invoiceReference")) ?? undefined : undefined;
    call.mutate({ method: "POST", url: `/api/fines/${id}/status`, body: { status, invoiceReference } });
  };
  const choose = (c: Candidate) => setPick({ customerId: String(c.customerId ?? ""), reservationId: String(c.id), driverId: c.driverId ? String(c.driverId) : "" });

  if (!open) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeFineDialog()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2">{t("admin.fines.dialog.title", { id })} {fine && <FineStatusBadge status={fine.status} />}</DialogTitle></DialogHeader>
        {fine && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><Label>{t("admin.fines.fields.plate")}</Label><div className="font-mono">{fine.licensePlate}</div></div>
              <div><Label>{t("admin.fines.fields.offenceAt")}</Label><div>{new Date(fine.offenceAt).toLocaleString()}</div></div>
              <div><Label htmlFor="fd-desc">{t("admin.fines.fields.description")}</Label><Input id="fd-desc" value={edit.description} disabled={!canManage || closed} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></div>
              <div><Label htmlFor="fd-ref">{t("admin.fines.fields.reference")}</Label><Input id="fd-ref" value={edit.reference} disabled={!canManage || closed} onChange={(e) => setEdit({ ...edit, reference: e.target.value })} /></div>
              <div><Label htmlFor="fd-amount">{t("admin.fines.fields.amount")}</Label><Input id="fd-amount" type="number" step="0.01" value={edit.amount} disabled={!canManage || closed} onChange={(e) => setEdit({ ...edit, amount: e.target.value })} /></div>
              <div><Label htmlFor="fd-fee">{t("admin.fines.fields.adminFee")}</Label><Input id="fd-fee" type="number" step="0.01" value={edit.adminFee} disabled={!canManage || closed} onChange={(e) => setEdit({ ...edit, adminFee: e.target.value })} /></div>
              <div><Label htmlFor="fd-cn">{t("admin.fines.fields.customerNote")}</Label><Textarea id="fd-cn" rows={2} value={edit.customerNote} disabled={!canManage || closed} onChange={(e) => setEdit({ ...edit, customerNote: e.target.value })} /></div>
              <div><Label htmlFor="fd-in">{t("admin.fines.fields.internalNotes")}</Label><Textarea id="fd-in" rows={2} value={edit.internalNotes} disabled={!canManage || closed} onChange={(e) => setEdit({ ...edit, internalNotes: e.target.value })} /></div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {fine.customerId && <Button size="sm" variant="link" onClick={() => openCustomerDialog(fine.customerId!, "portal")}>{t("admin.fines.dialog.openCustomer")}: {fine.customerName}</Button>}
              {fine.reservationId && <Button size="sm" variant="link" onClick={() => openReservationDialog(fine.reservationId!)}>{t("admin.fines.dialog.openReservation")} #{fine.reservationId}</Button>}
              {fine.driverName && <span>· {fine.driverName}</span>}
              {fine.linkedBy && <span className="text-muted-foreground">· {t("admin.fines.dialog.linkedBy", { by: fine.linkedBy, at: fine.linkedAt ? new Date(fine.linkedAt).toLocaleString() : "" })}</span>}
              {fine.letterFilePath && <Button asChild size="sm" variant="outline"><a href={`/api/fines/${id}/letter`} target="_blank" rel="noopener">{t("admin.fines.dialog.viewLetter")}</a></Button>}
            </div>

            {fine.status === "new" && canManage && (
              <div className="rounded-md border p-3 space-y-2">
                <p className="text-sm">{t("admin.fines.dialog.notLinked")}</p>
                {fine.candidates && fine.candidates.covering.length > 0 && (<>
                  <p className="text-xs font-medium">{t("admin.fines.dialog.covering")}</p>
                  {fine.candidates.covering.map((c) => <Button key={c.id} size="sm" variant={pick.reservationId === String(c.id) ? "default" : "outline"} onClick={() => choose(c)}>#{c.id} {c.customerName} {c.startDate}–{c.endDate ?? "…"} {c.driverName ? `· ${c.driverName}` : ""}</Button>)}
                </>)}
                {fine.candidates && fine.candidates.near.length > 0 && (<>
                  <p className="text-xs font-medium">{t("admin.fines.dialog.near")}</p>
                  {fine.candidates.near.map((c) => <Button key={c.id} size="sm" variant={pick.reservationId === String(c.id) ? "default" : "outline"} onClick={() => choose(c)}>#{c.id} {c.customerName} {c.startDate}–{c.endDate ?? "…"}</Button>)}
                </>)}
                {fine.candidates && fine.candidates.covering.length + fine.candidates.near.length === 0 && <p className="text-xs text-muted-foreground">{t("admin.fines.dialog.noCandidates")}</p>}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="fd-cust">{t("admin.fines.dialog.chooseCustomer")}</Label>
                    <select id="fd-cust" className="w-full rounded-md border px-2 py-2 text-sm" value={pick.customerId} onChange={(e) => setPick({ customerId: e.target.value, reservationId: "", driverId: "" })}>
                      <option value="">—</option>
                      {customers.map((c) => <option key={c.id} value={c.id}>{c.companyName || c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="fd-drv">{t("admin.fines.dialog.chooseDriver")}</Label>
                    <select id="fd-drv" className="w-full rounded-md border px-2 py-2 text-sm" value={pick.driverId} onChange={(e) => setPick({ ...pick, driverId: e.target.value })}>
                      <option value="">—</option>
                      {drivers.map((d) => <option key={d.id} value={d.id}>{d.displayName}</option>)}
                    </select>
                  </div>
                </div>
                <Button size="sm" disabled={!pick.customerId || call.isPending} data-testid="button-link-fine"
                  onClick={() => call.mutate({ method: "POST", url: `/api/fines/${id}/link`, body: { customerId: Number(pick.customerId), reservationId: pick.reservationId ? Number(pick.reservationId) : null, driverId: pick.driverId ? Number(pick.driverId) : null } })}>
                  {t("admin.fines.dialog.link")}
                </Button>
              </div>
            )}

            {canManage && (
              <div className="flex flex-wrap gap-2 border-t pt-3">
                {!closed && <Button size="sm" onClick={() => call.mutate({ method: "PATCH", url: `/api/fines/${id}`, body: { ...edit, amount: Number(edit.amount), adminFee: Number(edit.adminFee) } })}>{t("admin.fines.dialog.save")}</Button>}
                {allowed.includes("new") && <Button size="sm" variant="outline" onClick={() => call.mutate({ method: "POST", url: `/api/fines/${id}/unlink` })}>{t("admin.fines.dialog.unlink")}</Button>}
                {allowed.includes("charged") && <Button size="sm" variant="outline" onClick={() => setStatus("charged")}>{t("admin.fines.dialog.charge")}</Button>}
                {allowed.includes("paid") && <Button size="sm" variant="outline" onClick={() => setStatus("paid")}>{t("admin.fines.dialog.paid")}</Button>}
                {allowed.includes("disputed") && <Button size="sm" variant="outline" onClick={() => setStatus("disputed")}>{t("admin.fines.dialog.dispute")}</Button>}
                {allowed.includes("linked") && fine.status === "disputed" && <Button size="sm" variant="outline" onClick={() => setStatus("linked")}>{t("admin.fines.dialog.link")}</Button>}
                {allowed.includes("cancelled") && <Button size="sm" variant="destructive" onClick={() => setStatus("cancelled")}>{t("admin.fines.dialog.cancel")}</Button>}
                {closed && <span className="text-sm text-muted-foreground">{t("admin.fines.dialog.closed")}</span>}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 7: Tab and URL params on the Klantenportaal page**

In `client/src/pages/portal-admin/index.tsx`: read `useSearch()` from wouter; `const params = new URLSearchParams(search)`; `const [tab, setTab] = useState(params.get("tab") ?? "customers")`; `<Tabs value={tab} onValueChange={setTab}>`; add `<TabsTrigger value="fines">{t("admin.tabs.fines")}</TabsTrigger>` (only when the user has `view_fines`/`manage_fines` or is admin) and `<TabsContent value="fines" className="mt-4"><FinesTable initialPlate={params.get("plate") ?? undefined} /></TabsContent>`. In a `useEffect` on mount: `const fine = params.get("fine"); if (fine) openFineDialog(Number(fine));`.

- [ ] **Step 8: Check and commit**

Run: `npm run check` — 0 errors. In the browser (staff logged in): Klantenportaal → Bekeuringen → Nieuwe bekeuring with plate `94XT184` and an offence moment inside reservation 1214's period → dialog closes and `FineDialog` opens with status "Gekoppeld" and driver "Jan de Tester"; "Doorbelasten" asks for the invoice reference and the badge becomes "Doorbelast". Create a second fine with a date outside any reservation → dialog shows candidates and the customer picker; link it.

```bash
git add client/src/components/fines client/src/contexts/GlobalDialogContext.tsx client/src/components/global-dialogs.tsx client/src/pages/portal-admin/index.tsx client/src/locales
git commit -m "feat(fines): staff fines tab with new-fine and fine dialogs"
```

---
### Task 8: Staff requests inbox dialog, badge, customer tab, settings, vehicle dialog

**Files:**
- Create: `client/src/components/portal-admin/requests-table.tsx`, `client/src/components/portal-admin/portal-request-dialog.tsx`
- Modify: `client/src/contexts/GlobalDialogContext.tsx`, `client/src/components/global-dialogs.tsx`, `client/src/pages/portal-admin/index.tsx`, `client/src/components/sidebar-nav.tsx`, `client/src/components/customers/customer-portal-tab.tsx`, `client/src/components/portal-admin/portal-config-form.tsx`, `client/src/components/vehicles/vehicle-view-dialog.tsx`, `client/src/locales/{nl,en}/portal.json`

**Interfaces:**
- Consumes: Task 5 API (`/api/portal-requests…`), `unread-count` (now `{ count, newRequests }`), `FinesTable` (Task 7).
- Produces: context `portalRequest: { open: boolean; id: number | null }`, `openPortalRequestDialog(id)`, `closePortalRequestDialog()`; `<RequestsTable customerId? />`, `<PortalRequestDialog />`; URL `?request=<id>` opens the dialog; `?tab=requests`.

- [ ] **Step 1: Translations** (nl; mirror en)

```json
"requests": {
  "title": "Aanvragen", "empty": "Geen aanvragen.",
  "columns": { "date": "Datum", "type": "Type", "customer": "Klant", "submitter": "Ingediend door", "message": "Bericht", "status": "Status" },
  "filters": { "allStatuses": "Alle statussen", "allTypes": "Alle types" },
  "type": { "extension": "Verlenging", "early_return": "Eerder inleveren", "damage": "Schademelding", "fine_question": "Vraag over bekeuring", "other": "Overig" },
  "status": { "new": "Nieuw", "in_progress": "In behandeling", "done": "Afgehandeld", "rejected": "Afgewezen" },
  "dialog": { "title": "Aanvraag #{{id}}", "reservation": "Reservering", "fine": "Bekeuring", "newEndDate": "Gevraagde nieuwe einddatum", "returnDate": "Gevraagde inleverdatum", "location": "Locatie", "occurredAt": "Wanneer", "subject": "Onderwerp", "message": "Bericht van klant", "attachments": "Bijlagen", "reply": "Antwoord aan klant", "take": "In behandeling nemen", "approve": "Goedkeuren (past reservering aan)", "answer": "Beantwoorden en afhandelen", "reject": "Afwijzen", "conflict": "Conflict met reservering #{{id}} ({{from}} – {{to}})", "replied": "Antwoord verstuurd.", "replyRequired": "Vul een antwoord in.", "previousReply": "Eerder antwoord" }
},
"config": { "...": "...", "fineAdminFee": "Standaard administratiekosten per bekeuring (€)" }
```

(Keep the existing `config` keys; add `fineAdminFee`.)

- [ ] **Step 2: Context + global dialogs**

Add `portalRequest: { open: boolean; id: number | null }` to `DialogState` (initial `{ open: false, id: null }`), `openPortalRequestDialog(id)` / `closePortalRequestDialog()` following the fine pattern from Task 7, render `<PortalRequestDialog />` in `GlobalDialogs`.

- [ ] **Step 3: `requests-table.tsx`**

```tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { PortalRequestDto } from "@shared/portal-requests";
import { PortalRequestType, PortalRequestStatus } from "@shared/portal-requests";
import { apiRequest } from "@/lib/queryClient";
import { useGlobalDialog } from "@/contexts/GlobalDialogContext";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = { new: "default", in_progress: "secondary", done: "outline", rejected: "destructive" };

export function RequestStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation("portal");
  return <Badge variant={STATUS_VARIANT[status] ?? "outline"}>{t(`admin.requests.status.${status}`, { defaultValue: status })}</Badge>;
}

export function RequestsTable({ customerId }: { customerId?: number }) {
  const { t } = useTranslation("portal");
  const { openPortalRequestDialog } = useGlobalDialog();
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const filters = { status: status || undefined, type: type || undefined, customerId };
  const { data = [] } = useQuery<PortalRequestDto[]>({
    queryKey: ["/api/portal-requests", filters],
    queryFn: async () => {
      const q = new URLSearchParams(Object.entries(filters).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));
      return (await apiRequest("GET", `/api/portal-requests?${q}`)).json();
    },
  });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select className="rounded-md border px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t("admin.requests.filters.allStatuses")}</option>
          {Object.values(PortalRequestStatus).map((s) => <option key={s} value={s}>{t(`admin.requests.status.${s}`)}</option>)}
        </select>
        <select className="rounded-md border px-3 py-2 text-sm" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">{t("admin.requests.filters.allTypes")}</option>
          {Object.values(PortalRequestType).map((s) => <option key={s} value={s}>{t(`admin.requests.type.${s}`)}</option>)}
        </select>
      </div>
      {data.length === 0 ? <p className="text-sm text-muted-foreground">{t("admin.requests.empty")}</p> : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>{t("admin.requests.columns.date")}</TableHead><TableHead>{t("admin.requests.columns.type")}</TableHead>
            {!customerId && <TableHead>{t("admin.requests.columns.customer")}</TableHead>}
            <TableHead>{t("admin.requests.columns.submitter")}</TableHead><TableHead>{t("admin.requests.columns.message")}</TableHead><TableHead>{t("admin.requests.columns.status")}</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {data.map((r) => (
              <TableRow key={r.id} className="cursor-pointer hover:bg-muted/40" onClick={() => openPortalRequestDialog(r.id)} data-testid={`row-request-${r.id}`}>
                <TableCell className="whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</TableCell>
                <TableCell>{t(`admin.requests.type.${r.type}`)}</TableCell>
                {!customerId && <TableCell>{r.customerName}</TableCell>}
                <TableCell>{r.submittedBy ?? "—"}</TableCell>
                <TableCell className="max-w-md truncate">{r.message}</TableCell>
                <TableCell><RequestStatusBadge status={r.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
```

- [ ] **Step 4: `portal-request-dialog.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { PortalRequestDto } from "@shared/portal-requests";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { useGlobalDialog } from "@/contexts/GlobalDialogContext";
import { useCanManagePortal } from "@/components/portal-admin/accounts-table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { RequestStatusBadge } from "./requests-table";

export function PortalRequestDialog() {
  const { t } = useTranslation("portal");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { dialogState, closePortalRequestDialog, openCustomerDialog, openReservationDialog, openFineDialog } = useGlobalDialog();
  const canManage = useCanManagePortal();
  const id = dialogState.portalRequest.id;
  const open = dialogState.portalRequest.open && id !== null;
  const key = ["/api/portal-requests", id];
  const { data: r } = useQuery<PortalRequestDto>({ queryKey: key, queryFn: async () => (await apiRequest("GET", `/api/portal-requests/${id}`)).json(), enabled: open });
  const [reply, setReply] = useState("");
  useEffect(() => { setReply(""); }, [id]);

  const done = () => { queryClient.invalidateQueries({ queryKey: key }); invalidateByPrefix("/api/portal-requests"); queryClient.invalidateQueries({ queryKey: ["/api/portal-admin/unread-count"] }); };
  const act = useMutation({
    mutationFn: async ({ url, body }: { url: string; body?: unknown }) => {
      const res = await apiRequest("POST", url, body);
      return res.json();
    },
    onSuccess: () => { done(); toast({ title: t("admin.requests.dialog.replied") }); },
    onError: (e: Error & { conflicts?: Array<{ id: number; startDate: string; endDate: string | null }> }) => {
      const c = e.conflicts?.[0];
      toast({ title: c ? t("admin.requests.dialog.conflict", { id: c.id, from: c.startDate, to: c.endDate ?? "…" }) : e.message, variant: "destructive" });
    },
  });
  const needReply = () => { if (!reply.trim()) { toast({ title: t("admin.requests.dialog.replyRequired"), variant: "destructive" }); return false; } return true; };
  const openState = r?.status === "new" || r?.status === "in_progress";
  const p = (r?.payload ?? {}) as Record<string, string>;

  if (!open) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && closePortalRequestDialog()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2">{t("admin.requests.dialog.title", { id })} {r && <RequestStatusBadge status={r.status} />}</DialogTitle></DialogHeader>
        {r && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="font-medium">{t(`admin.requests.type.${r.type}`)}</span>
              {r.customerId && <Button size="sm" variant="link" onClick={() => openCustomerDialog(r.customerId!, "portal")}>{r.customerName}</Button>}
              <span className="text-muted-foreground">· {r.submittedBy ?? "—"} · {new Date(r.createdAt).toLocaleString()}</span>
            </div>
            {r.reservationId && <div><Label>{t("admin.requests.dialog.reservation")}</Label> <Button size="sm" variant="link" onClick={() => openReservationDialog(r.reservationId!)}>#{r.reservationId} {r.reservationLabel}</Button></div>}
            {r.fineId && <div><Label>{t("admin.requests.dialog.fine")}</Label> <Button size="sm" variant="link" onClick={() => openFineDialog(r.fineId!)}>#{r.fineId}</Button></div>}
            {r.type === "extension" && <div><Label>{t("admin.requests.dialog.newEndDate")}</Label><div>{p.newEndDate}</div></div>}
            {r.type === "early_return" && <div><Label>{t("admin.requests.dialog.returnDate")}</Label><div>{p.returnDate}</div></div>}
            {r.type === "damage" && <div className="grid grid-cols-2 gap-2"><div><Label>{t("admin.requests.dialog.location")}</Label><div>{p.location || "—"}</div></div><div><Label>{t("admin.requests.dialog.occurredAt")}</Label><div>{p.occurredAt || "—"}</div></div></div>}
            {r.type === "other" && <div><Label>{t("admin.requests.dialog.subject")}</Label><div>{p.subject}</div></div>}
            <div><Label>{t("admin.requests.dialog.message")}</Label><p className="whitespace-pre-wrap rounded-md bg-muted p-2">{r.message}</p></div>
            {r.attachments.length > 0 && (
              <div><Label>{t("admin.requests.dialog.attachments")}</Label>
                <ul className="list-disc pl-5">{r.attachments.map((a) => <li key={a.id}><a className="underline" href={`/api/portal-requests/${r.id}/attachments/${a.id}`} target="_blank" rel="noopener">{a.fileName}</a></li>)}</ul>
              </div>
            )}
            {r.staffReply && <div><Label>{t("admin.requests.dialog.previousReply")}</Label><p className="whitespace-pre-wrap rounded-md border p-2">{r.staffReply}</p></div>}
            {canManage && openState && (
              <div className="space-y-2 border-t pt-3">
                <Label htmlFor="rq-reply">{t("admin.requests.dialog.reply")}</Label>
                <Textarea id="rq-reply" rows={4} value={reply} onChange={(e) => setReply(e.target.value)} data-testid="textarea-request-reply" />
                <div className="flex flex-wrap gap-2">
                  {r.status === "new" && <Button size="sm" variant="outline" onClick={() => act.mutate({ url: `/api/portal-requests/${id}/take` })}>{t("admin.requests.dialog.take")}</Button>}
                  {(r.type === "extension" || r.type === "early_return") && <Button size="sm" onClick={() => act.mutate({ url: `/api/portal-requests/${id}/approve` })} data-testid="button-approve-request">{t("admin.requests.dialog.approve")}</Button>}
                  <Button size="sm" onClick={() => needReply() && act.mutate({ url: `/api/portal-requests/${id}/reply`, body: { reply, status: "done" } })} data-testid="button-answer-request">{t("admin.requests.dialog.answer")}</Button>
                  <Button size="sm" variant="destructive" onClick={() => needReply() && act.mutate({ url: `/api/portal-requests/${id}/reply`, body: { reply, status: "rejected" } })}>{t("admin.requests.dialog.reject")}</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

`apiRequest` merges the JSON error body onto the thrown Error, so `e.conflicts` is available on a 409.

- [ ] **Step 5: Page, badge, customer tab, settings, vehicle dialog**

- `pages/portal-admin/index.tsx`: add `<TabsTrigger value="requests">` + `<TabsContent value="requests"><RequestsTable /></TabsContent>`; on mount `const request = params.get("request"); if (request) openPortalRequestDialog(Number(request));`.
- `sidebar-nav.tsx`: the badge already reads `unread-count` (`count` now includes new requests): no change needed beyond the type `{ count: number; newRequests?: number }`.
- `customer-portal-tab.tsx`: two extra cards: `<FinesTable customerId={customerId} />` (title `admin.fines.title`) and `<RequestsTable customerId={customerId} />` (title `admin.requests.title`), each only when the user may view them (`useCanManageFines()` or `view_fines` for fines; portal permissions are already implied by the tab).
- `portal-config-form.tsx`: numeric input `fineAdminFee` (label `admin.config.fineAdminFee`), included in the PUT body as `Number(...)`.
- `vehicle-view-dialog.tsx`: inside the `DialogTitle` area add a small link showing the fines count: `const { data: fineCount } = useQuery<{ count: number }>({ queryKey: ["/api/fines/count", vehicle?.licensePlate], queryFn: async () => (await apiRequest("GET", `/api/fines/count?licensePlate=${encodeURIComponent(vehicle!.licensePlate)}`)).json(), enabled: Boolean(vehicle?.licensePlate) && canViewFines })`; render `{fineCount && fineCount.count > 0 && <Link href={`/portal-admin?tab=fines&plate=${vehicle.licensePlate}`} className="ml-2 text-sm underline">{t('admin.fines.title', { ns: 'portal' })}: {fineCount.count}</Link>}` where `vehicle` is the dialog's loaded vehicle object (find its name in the file) and `canViewFines` mirrors `useCanManageFines` but also accepts `view_fines`.

- [ ] **Step 6: Check, verify, commit**

Run: `npm run check` — 0 errors. Browser: submit a request from the portal (Task 9 delivers the portal UI; until then insert one through the API test helper or `psql`) → badge increments, toast appears; open Klantenportaal → Aanvragen → row → dialog; "In behandeling nemen", reply "Geregeld" + "Beantwoorden en afhandelen" → status Afgehandeld, `sendEmail` attempted (SMTP not configured locally: error logged, request still done).

```bash
git add client/src/components/portal-admin client/src/contexts/GlobalDialogContext.tsx client/src/components/global-dialogs.tsx client/src/pages/portal-admin/index.tsx client/src/components/sidebar-nav.tsx client/src/components/customers/customer-portal-tab.tsx client/src/components/vehicles/vehicle-view-dialog.tsx client/src/locales
git commit -m "feat(portal): staff requests inbox dialog, fines and requests in the customer dialog, admin fee setting"
```

---
### Task 9: Portal client — fines and requests tabs

**Files:**
- Create: `client/src/pages/portal/fines.tsx`, `client/src/pages/portal/fine-detail.tsx`, `client/src/pages/portal/requests.tsx`, `client/src/pages/portal/request-detail.tsx`, `client/src/pages/portal/new-request.tsx`, `client/src/components/portal/request-form.tsx`
- Modify: `client/src/layouts/PortalLayout.tsx` (tabs), `client/src/pages/portal/index.tsx` (routes), `client/src/pages/portal/reservation-detail.tsx` (shortcuts), `client/src/locales/{nl,en}/portal.json`

**Interfaces:**
- Consumes: `portalFetch`, `portalQueryFn`, `usePortalAuth`, `PortalFineDto`, `PortalRequestDto`, `requestPayloadSchemas`, `REQUEST_NEEDS`.
- Routes (relative to `/portaal`): `/bekeuringen`, `/bekeuringen/:id`, `/aanvragen`, `/aanvragen/nieuw?type=&reservationId=&fineId=`, `/aanvragen/:id`.
- Query keys: `['portal', '/api/portal/fines']`, `['portal', '/api/portal/fines/<id>']`, `['portal', '/api/portal/requests']`, `['portal', '/api/portal/requests/<id>']`.

- [ ] **Step 1: Translations** (customer-facing, nl; mirror en)

```json
"tabs": { "...": "...", "fines": "Bekeuringen", "requests": "Aanvragen" },
"fines": {
  "title": "Bekeuringen", "empty": "Er zijn geen bekeuringen.", "detailTitle": "Bekeuring", "letter": "Brief bekijken", "ask": "Vraag stellen over deze bekeuring",
  "fields": { "plate": "Kenteken", "offenceAt": "Datum/tijd", "description": "Omschrijving", "reference": "Kenmerk", "driver": "Bestuurder", "amount": "Bedrag", "adminFee": "Administratiekosten", "total": "Totaal", "status": "Status", "note": "Toelichting" },
  "status": { "linked": "In behandeling", "charged": "Doorbelast", "paid": "Betaald", "disputed": "Betwist" }
},
"requests": {
  "title": "Aanvragen", "empty": "Nog geen aanvragen.", "new": "Nieuwe aanvraag", "detailTitle": "Aanvraag", "reply": "Antwoord van Lam Groep", "noReply": "Nog geen antwoord.", "submitted": "Aanvraag verstuurd. Lam Groep neemt contact op.", "attachments": "Bijlagen", "chooseType": "Wat wilt u aanvragen?",
  "type": { "extension": "Huur verlengen", "early_return": "Eerder inleveren", "damage": "Schade melden", "fine_question": "Vraag over bekeuring", "other": "Overig" },
  "status": { "new": "Ingediend", "in_progress": "In behandeling", "done": "Afgehandeld", "rejected": "Afgewezen" },
  "form": { "reservation": "Reservering", "fine": "Bekeuring", "newEndDate": "Nieuwe einddatum", "returnDate": "Inleverdatum", "location": "Waar", "occurredAt": "Wanneer", "subject": "Onderwerp", "message": "Toelichting", "photos": "Foto's of PDF (max 5)", "send": "Versturen", "extend": "Verlengen", "earlyReturn": "Eerder inleveren" }
},
"errors": { "...": "...", "PORTAL_REQUEST_INVALID_PERIOD": "De gekozen datum valt niet binnen de toegestane periode.", "PORTAL_ATTACHMENT_LIMIT": "Maximaal 5 bijlagen." }
```

- [ ] **Step 2: Layout tabs and routes**

`PortalLayout.tsx` tabs: after documents add `{ href: "/bekeuringen", key: "tabs.fines", show: me.settings.canViewFines }`, `{ href: "/aanvragen", key: "tabs.requests", show: me.settings.canSubmitRequests }`.

`pages/portal/index.tsx` routes (before `/`):

```tsx
          <Route path="/bekeuringen/:id" component={PortalFineDetailPage} />
          <Route path="/bekeuringen" component={PortalFinesPage} />
          <Route path="/aanvragen/nieuw" component={PortalNewRequestPage} />
          <Route path="/aanvragen/:id" component={PortalRequestDetailPage} />
          <Route path="/aanvragen" component={PortalRequestsPage} />
```

- [ ] **Step 3: Fines pages**

`pages/portal/fines.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import type { PortalFineDto } from "@shared/fines";
import { portalQueryFn } from "@/lib/portal-api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function PortalFinesPage() {
  const { t } = useTranslation("portal");
  const { data = [], isLoading } = useQuery<PortalFineDto[]>({ queryKey: ["portal", "/api/portal/fines"], queryFn: portalQueryFn });
  if (isLoading) return null;
  return (
    <div className="space-y-2">
      <h1 className="text-lg font-semibold">{t("fines.title")}</h1>
      {data.length === 0 && <p className="text-sm text-muted-foreground">{t("fines.empty")}</p>}
      {data.map((f) => (
        <Link key={f.id} href={`/bekeuringen/${f.id}`} className="block">
          <Card className="hover:bg-muted/40"><CardContent className="p-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-medium">{f.description} <span className="ml-2 font-mono text-sm text-muted-foreground">{f.licensePlate}</span></div>
              <div className="text-sm text-muted-foreground">{new Date(f.offenceAt).toLocaleString()}{f.driver ? ` · ${f.driver.displayName}` : ""}</div>
            </div>
            <div className="flex items-center gap-3"><span>€ {f.totalAmount}</span><Badge variant="outline">{t(`fines.status.${f.status}`, { defaultValue: f.status })}</Badge></div>
          </CardContent></Card>
        </Link>
      ))}
    </div>
  );
}
```

`pages/portal/fine-detail.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { useTranslation } from "react-i18next";
import type { PortalFineDto } from "@shared/fines";
import { portalQueryFn } from "@/lib/portal-api";
import { usePortalAuth } from "@/hooks/use-portal-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function PortalFineDetailPage() {
  const { t } = useTranslation("portal");
  const { id } = useParams<{ id: string }>();
  const { me } = usePortalAuth();
  const { data: f } = useQuery<PortalFineDto>({ queryKey: ["portal", `/api/portal/fines/${id}`], queryFn: portalQueryFn });
  if (!f) return null;
  const row = (label: string, value: string | null | undefined) => value ? <div className="grid grid-cols-3 gap-2 text-sm"><dt className="text-muted-foreground">{label}</dt><dd className="col-span-2">{value}</dd></div> : null;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h1 className="text-lg font-semibold">{t("fines.detailTitle")} #{f.id}</h1><Link href="/bekeuringen"><Button variant="ghost" size="sm">←</Button></Link></div>
      <Card><CardContent className="p-4 space-y-3">
        <dl className="space-y-1">
          {row(t("fines.fields.plate"), f.licensePlate)}
          {row(t("fines.fields.offenceAt"), new Date(f.offenceAt).toLocaleString())}
          {row(t("fines.fields.description"), f.description)}
          {row(t("fines.fields.reference"), f.reference)}
          {row(t("fines.fields.driver"), f.driver?.displayName)}
          {row(t("fines.fields.amount"), `€ ${f.amount}`)}
          {row(t("fines.fields.adminFee"), `€ ${f.adminFee}`)}
          {row(t("fines.fields.total"), `€ ${f.totalAmount}`)}
          {row(t("fines.fields.status"), t(`fines.status.${f.status}`, { defaultValue: f.status }))}
          {row(t("fines.fields.note"), f.customerNote)}
        </dl>
        <div className="flex flex-wrap gap-2">
          {f.hasLetter && <Button asChild size="sm" variant="outline"><a href={`/api/portal/fines/${f.id}/letter`} target="_blank" rel="noopener">{t("fines.letter")}</a></Button>}
          {me?.settings.canSubmitRequests && <Link href={`/aanvragen/nieuw?type=fine_question&fineId=${f.id}`}><Button size="sm">{t("fines.ask")}</Button></Link>}
        </div>
      </CardContent></Card>
    </div>
  );
}
```

- [ ] **Step 4: Request form component**

`components/portal/request-form.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import type { PortalReservationDto } from "@shared/portal-types";
import type { PortalFineDto } from "@shared/fines";
import { PortalRequestType, REQUEST_NEEDS, type PortalRequestTypeValue } from "@shared/portal-requests";
import { portalFetch, portalQueryFn, PortalApiError } from "@/lib/portal-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

export function RequestForm({ initialType, reservationId: initialReservation, fineId: initialFine }: { initialType?: PortalRequestTypeValue; reservationId?: number; fineId?: number }) {
  const { t } = useTranslation("portal");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [type, setType] = useState<PortalRequestTypeValue>(initialType ?? PortalRequestType.OTHER);
  const [reservationId, setReservationId] = useState(initialReservation ? String(initialReservation) : "");
  const [fineId, setFineId] = useState(initialFine ? String(initialFine) : "");
  const [payload, setPayload] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const needs = REQUEST_NEEDS[type];
  const { data: reservations = [] } = useQuery<PortalReservationDto[]>({ queryKey: ["portal", "/api/portal/reservations"], queryFn: portalQueryFn, enabled: needs === "reservation" });
  const { data: fines = [] } = useQuery<PortalFineDto[]>({ queryKey: ["portal", "/api/portal/fines"], queryFn: portalQueryFn, enabled: needs === "fine" });
  const openReservations = reservations.filter((r) => r.status === "booked" || r.status === "picked_up");

  const submit = useMutation({
    mutationFn: async () => {
      const body = new FormData();
      body.append("type", type); body.append("message", message); body.append("payload", JSON.stringify(payload));
      if (needs === "reservation") body.append("reservationId", reservationId);
      if (needs === "fine") body.append("fineId", fineId);
      files.slice(0, 5).forEach((f) => body.append("attachments", f));
      return portalFetch<{ id: number }>("POST", "/api/portal/requests", body);
    },
    onSuccess: async (r) => { await queryClient.invalidateQueries({ queryKey: ["portal", "/api/portal/requests"] }); toast({ title: t("requests.submitted") }); navigate(`/aanvragen/${r.id}`); },
    onError: (e) => toast({ title: t(`errors.${e instanceof PortalApiError ? e.code : "PORTAL_SERVER_ERROR"}`, { defaultValue: (e as Error).message }), variant: "destructive" }),
  });
  const setP = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setPayload({ ...payload, [k]: e.target.value });
  function onSubmit(e: FormEvent) { e.preventDefault(); if (files.length > 5) { toast({ title: t("errors.PORTAL_ATTACHMENT_LIMIT"), variant: "destructive" }); return; } submit.mutate(); }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <Label htmlFor="rq-type">{t("requests.chooseType")}</Label>
        <select id="rq-type" className="w-full rounded-md border px-3 py-2 text-sm" value={type} onChange={(e) => { setType(e.target.value as PortalRequestTypeValue); setPayload({}); }}>
          {Object.values(PortalRequestType).map((v) => <option key={v} value={v}>{t(`requests.type.${v}`)}</option>)}
        </select>
      </div>
      {needs === "reservation" && (
        <div><Label htmlFor="rq-res">{t("requests.form.reservation")}</Label>
          <select id="rq-res" className="w-full rounded-md border px-3 py-2 text-sm" value={reservationId} onChange={(e) => setReservationId(e.target.value)} required>
            <option value="">—</option>
            {openReservations.map((r) => <option key={r.id} value={r.id}>#{r.id} {r.vehicle ? `${r.vehicle.brand} ${r.vehicle.model} ${r.vehicle.licensePlate}` : ""} {r.startDate} – {r.endDate ?? "…"}</option>)}
          </select>
        </div>
      )}
      {needs === "fine" && (
        <div><Label htmlFor="rq-fine">{t("requests.form.fine")}</Label>
          <select id="rq-fine" className="w-full rounded-md border px-3 py-2 text-sm" value={fineId} onChange={(e) => setFineId(e.target.value)} required>
            <option value="">—</option>
            {fines.map((f) => <option key={f.id} value={f.id}>#{f.id} {f.licensePlate} {new Date(f.offenceAt).toLocaleDateString()} € {f.totalAmount}</option>)}
          </select>
        </div>
      )}
      {type === "extension" && <div><Label htmlFor="rq-end">{t("requests.form.newEndDate")}</Label><Input id="rq-end" type="date" value={payload.newEndDate ?? ""} onChange={setP("newEndDate")} required /></div>}
      {type === "early_return" && <div><Label htmlFor="rq-ret">{t("requests.form.returnDate")}</Label><Input id="rq-ret" type="date" value={payload.returnDate ?? ""} onChange={setP("returnDate")} required /></div>}
      {type === "damage" && (<div className="grid grid-cols-2 gap-2">
        <div><Label htmlFor="rq-loc">{t("requests.form.location")}</Label><Input id="rq-loc" value={payload.location ?? ""} onChange={setP("location")} /></div>
        <div><Label htmlFor="rq-when">{t("requests.form.occurredAt")}</Label><Input id="rq-when" value={payload.occurredAt ?? ""} onChange={setP("occurredAt")} /></div>
      </div>)}
      {type === "other" && <div><Label htmlFor="rq-subj">{t("requests.form.subject")}</Label><Input id="rq-subj" value={payload.subject ?? ""} onChange={setP("subject")} required /></div>}
      <div><Label htmlFor="rq-msg">{t("requests.form.message")}</Label><Textarea id="rq-msg" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} required /></div>
      <div><Label htmlFor="rq-files">{t("requests.form.photos")}</Label><Input id="rq-files" type="file" multiple accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} /></div>
      <Button type="submit" disabled={submit.isPending} data-testid="button-submit-request">{t("requests.form.send")}</Button>
    </form>
  );
}
```

- [ ] **Step 5: Requests pages**

`pages/portal/new-request.tsx`:

```tsx
import { useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { RequestForm } from "@/components/portal/request-form";
import type { PortalRequestTypeValue } from "@shared/portal-requests";

export default function PortalNewRequestPage() {
  const { t } = useTranslation("portal");
  const params = new URLSearchParams(useSearch());
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">{t("requests.new")}</h1>
      <RequestForm initialType={(params.get("type") as PortalRequestTypeValue) ?? undefined}
        reservationId={params.get("reservationId") ? Number(params.get("reservationId")) : undefined}
        fineId={params.get("fineId") ? Number(params.get("fineId")) : undefined} />
    </div>
  );
}
```

`pages/portal/requests.tsx`: list like the fines page (`['portal','/api/portal/requests']`), each card links to `/aanvragen/${r.id}` showing type label, date, first line of message and a status badge; header has `<Link href="/aanvragen/nieuw"><Button size="sm">{t("requests.new")}</Button></Link>`.

`pages/portal/request-detail.tsx`: loads `['portal', '/api/portal/requests/<id>']`; shows type, status badge, date, payload fields (same conditional rendering as the staff dialog, customer labels from `requests.form.*`), message, attachments (links to `/api/portal/requests/<id>/attachments/<aid>` with `target="_blank"`), and the reply block: `staffReply` in a bordered box with `repliedAt`, or `t("requests.noReply")`.

- [ ] **Step 6: Shortcuts on the reservation detail**

In `pages/portal/reservation-detail.tsx`, next to the change-driver button, when `me?.settings.canSubmitRequests && ["booked","picked_up"].includes(r.status)`:

```tsx
<Link href={`/aanvragen/nieuw?type=extension&reservationId=${r.id}`}><Button size="sm" variant="outline">{t("requests.form.extend")}</Button></Link>
<Link href={`/aanvragen/nieuw?type=early_return&reservationId=${r.id}`}><Button size="sm" variant="outline">{t("requests.form.earlyReturn")}</Button></Link>
```

- [ ] **Step 7: Check, verify, commit**

Run: `npm run check` — 0 errors. Browser (portal user `portaal-test@example.com`): tab Bekeuringen shows the fine linked in Task 7 with the letter link; open reservation 1214 → "Verlengen" → form pre-filled → submit → detail page "Ingediend"; staff tab Aanvragen shows it; approve in the dialog → portal detail shows the reply "Goedgekeurd: nieuwe einddatum …" and the reservation's end date changed.

```bash
git add client/src/pages/portal client/src/components/portal client/src/layouts/PortalLayout.tsx client/src/locales
git commit -m "feat(portal): customers see fines and submit requests from the portal"
```

---

### Task 10: End-to-end verification and hand-over

**Files:**
- Modify: `docs/portal-wordpress-embed.md` (one paragraph on fines/requests e-mails), memory note.

- [ ] **Step 1: Full suite**

Run: `npm test && npm run check` — Expected: all files pass, 0 errors.

- [ ] **Step 2: Browser walk-through**

1. Staff: Klantenportaal → Bekeuringen → new fine on `94XT184` at `2026-10-01 10:00` → auto-linked to Klant 179 / Jan de Tester; badge in the vehicle dialog shows 1.
2. Portal: Bekeuringen tab lists it; "Vraag stellen" → request `fine_question` submitted; staff badge increments and a toast appears in the staff tab.
3. Staff: Aanvragen → open → reply → portal shows the reply.
4. Portal: reservation 1214 → Verlengen to a date before the next booking → staff approves → end date updated (check in the staff reservation dialog).
5. Customer dialog Klant 179 → Portaal tab shows the fine and both requests.

- [ ] **Step 3: Docs and memory**

Append to `docs/portal-wordpress-embed.md` a section "E-mails" listing the templates `portal_fine_linked` and `portal_request_replied` and that they require SMTP under Instellingen > E-mail. Update the memory note `customer-portal-project-2026-09-02.md` status line (parts 3 and 4 built, branch, test count).

```bash
git add docs/portal-wordpress-embed.md
git commit -m "docs: fines and request e-mails in the portal embed notes"
```
