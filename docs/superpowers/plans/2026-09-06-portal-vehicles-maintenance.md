# Portal Vehicle Overview and Maintenance Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Customers see the vehicles they have on the road, report maintenance (optionally asking for a replacement), can ask to move planned maintenance until 48 hours before it starts, and are told about every maintenance block on their vehicle; staff confirm from the Klantenportaal dashboard and the block lands in the maintenance calendar.

**Architecture:** Maintenance stays a `reservations` row with `type = 'maintenance_block'`; approval creates that row (plus a placeholder spare when asked) and links it through a new `portal_request_id` column. A new service `portal-maintenance-events.ts` is called at every write point of maintenance blocks and replacement reservations and turns state changes into customer notifications and mails, deduplicated by tag. The customer UI adds a vehicles page built from a new `GET /api/portal/vehicles/mine` endpoint and two request forms (`maintenance` extended, `maintenance_change` new).

**Tech Stack:** Express, Drizzle/Postgres, zod, vitest + supertest (shared dev database, test files run in parallel), React 18, wouter, TanStack Query, react-i18next (`portal` namespace nl/en), shadcn/ui, existing portal UI vocabulary in `client/src/components/portal/ui.tsx`.

**Spec:** `docs/superpowers/specs/2026-09-06-portal-vehicles-maintenance-design.md`

## Global Constraints

- All customer-facing text in both `client/src/locales/nl/portal.json` and `client/src/locales/en/portal.json`; staff texts under the `admin.*` keys of the same files.
- Every list assertion in tests is scoped by the test's own `customerId` or ids it created (parallel files share the database). Test data uses the helpers in `server/__tests__/portal-helpers.ts`; vehicles get plates starting with `PT` so cleanup removes them.
- Migration is idempotent: `addColumnIfNotExists` in `startup-migration.js`, run with `node -r dotenv/config startup-migration.js`.
- The customer never sees a placeholder spare (`placeholderSpare = true` or `vehicleId = null`).
- 48-hour rule: block start = `startDate` plus `startTime` when set, otherwise `08:00` Europe/Amsterdam; changes are allowed only while `now <= start - 48h` and `maintenanceStatus === 'scheduled'`.
- Dates in the UI go through `formatPortalDate` from `client/src/components/portal/reservation-card.tsx`; plates through `Plate` from `client/src/components/portal/ui.tsx`.
- Files in this repo use CRLF line endings in many places; write patch scripts with the Write tool, never bash heredocs (they mangle backslashes). `node` needs Windows paths like `C:/Users/KEESLA~1/...`.
- Server changes need a dev-server restart (`preview_stop` then `preview_start`); after HMR of `use-portal-dialogs.tsx` do a full navigate.
- Commit after every task with the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

## File map

Create:
- `server/services/portal-maintenance-events.ts` — turns maintenance block and replacement changes into customer notifications and mails.
- `server/__tests__/portal-maintenance-events.test.ts` — tests for that service.
- `server/services/portal-vehicles.ts` — builds the "my vehicles" list for a customer (query plus DTO mapping), used by the route.
- `client/src/pages/portal/vehicles.tsx` — customer vehicles page.
- `client/src/components/portal/vehicle-card.tsx` — one vehicle card plus the shared `MaintenanceLine` used by the reservation dialog.
- `client/src/components/portal-admin/maintenance-approval.tsx` — staff "Inplannen" and "Verplaatsen" blocks.

Modify:
- `shared/schema.ts` — `reservations.portalRequestId`.
- `startup-migration.js` — new column.
- `shared/portal-requests.ts` — payload fields, `maintenance_change` type.
- `shared/portal-types.ts` — `PortalMyVehicleDto`, `PortalVehicleMaintenanceDto`, error code, dashboard count, `PortalMe.info.phone`.
- `server/routes/portal.ts` — `GET /api/portal/vehicles/mine`, request checks, `REQUEST_LABEL`, staff notification kind.
- `server/routes/portal-requests.ts` — approve for `maintenance` and `maintenance_change`, `MAINTENANCE_NEEDS_BLOCK` guard.
- `server/routes.ts` — hook calls at the maintenance and spare write points.
- `server/services/portal-dashboard.ts` — `counts.maintenance`.
- `server/services/portal-mail.ts` — `portal_maintenance` template and `sendMaintenanceMail`.
- `server/portal-auth.ts` — `info.phone` in `buildMe`.
- `server/services/portal-config.ts` / `shared/portal-types.ts` — `phone` in `PortalConfig`.
- `client/src/components/portal/request-form.tsx` — maintenance fields, `maintenance_change` form.
- `client/src/components/portal/reservation-dialog.tsx` — maintenance line and change button.
- `client/src/components/portal/notifications-bell.tsx` — icons for the new types.
- `client/src/hooks/use-portal-dialogs.tsx` — `blockId` in `NewRequestPrefill`.
- `client/src/pages/portal/index.tsx`, `client/src/layouts/PortalLayout.tsx` — route and tab.
- `client/src/components/portal-admin/portal-request-dialog.tsx` — summary and approval blocks for the two types.
- `client/src/components/portal-admin/dashboard-panels.tsx` — tile "Onderhoud".
- `client/src/components/maintenance/maintenance-view-dialog.tsx` — "Uit klantenportaal" link.
- `client/src/components/portal-admin/portal-config-form.tsx` — phone field.
- `client/src/locales/nl/portal.json`, `client/src/locales/en/portal.json`.
- `server/__tests__/portal-routes.test.ts`, `server/__tests__/portal-requests-routes.test.ts`.

---

### Task 1: Schema, migration, shared types and translations

**Files:**
- Modify: `shared/schema.ts` (reservations table, after `affectedRentalId` around line 748)
- Modify: `startup-migration.js` (next to the `fines` columns around line 1084)
- Modify: `shared/portal-requests.ts`
- Modify: `shared/portal-types.ts`
- Modify: `client/src/locales/nl/portal.json`, `client/src/locales/en/portal.json`
- Test: `shared/portal-requests.test.ts` (create)

**Interfaces:**
- Produces: `reservations.portalRequestId: number | null`; `PortalRequestType.MAINTENANCE_CHANGE = 'maintenance_change'`; `requestPayloadSchemas.maintenance` with `needsReplacement`, `preferredDate`; `requestPayloadSchemas.maintenance_change` with `newDate`, `reason`, `needsReplacement`; `PORTAL_ERROR.MAINTENANCE_TOO_LATE = 'PORTAL_MAINTENANCE_TOO_LATE'`; `PortalMyVehicleDto`, `PortalVehicleMaintenanceDto`; `PortalDashboard.counts.maintenance`; `PortalConfig.phone`; `PortalMe.info.phone`.

- [ ] **Step 1: Write the failing payload tests**

Create `shared/portal-requests.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { requestPayloadSchemas, REQUEST_NEEDS, PortalRequestType } from "./portal-requests";

describe("maintenance request payloads", () => {
  it("maintenance accepts the replacement wish and a preferred date, defaults to no replacement", () => {
    const r = requestPayloadSchemas.maintenance.parse({ issue: "Lampje", mileage: "12000", urgent: "true", needsReplacement: "true", preferredDate: "2026-12-01" });
    expect(r).toMatchObject({ issue: "Lampje", mileage: 12000, urgent: true, needsReplacement: true, preferredDate: "2026-12-01" });
    expect(requestPayloadSchemas.maintenance.parse({ issue: "Lampje", preferredDate: "" })).toMatchObject({ needsReplacement: false, preferredDate: undefined });
  });
  it("maintenance_change needs a date and a reason", () => {
    expect(requestPayloadSchemas.maintenance_change.safeParse({ newDate: "2026-12-05", reason: "Vakantie" }).success).toBe(true);
    expect(requestPayloadSchemas.maintenance_change.safeParse({ newDate: "2026-12-05" }).success).toBe(false);
    expect(requestPayloadSchemas.maintenance_change.safeParse({ newDate: "5-12-2026", reason: "x" }).success).toBe(false);
    expect(REQUEST_NEEDS.maintenance_change).toBe("reservation");
    expect(PortalRequestType.MAINTENANCE_CHANGE).toBe("maintenance_change");
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run shared/portal-requests.test.ts`
Expected: FAIL, `maintenance_change` is undefined / `needsReplacement` missing.

- [ ] **Step 3: Extend `shared/portal-requests.ts`**

Change the type constant:

```ts
export const PortalRequestType = {
  BOOKING: 'booking', EXTENSION: 'extension', EARLY_RETURN: 'early_return', DAMAGE: 'damage', MAINTENANCE: 'maintenance', MAINTENANCE_CHANGE: 'maintenance_change', MILEAGE: 'mileage', FINE_QUESTION: 'fine_question', OTHER: 'other',
} as const;
```

Add a boolean helper next to `blankToUndefined`:

```ts
const formBool = z.preprocess((v) => v === true || v === "true", z.boolean().default(false));
```

Replace the `maintenance` schema and add `maintenance_change`:

```ts
  /** Something wrong with the car (noise, warning light, tyres) or a service that is due. */
  maintenance: z.object({
    issue: z.string().trim().min(1).max(500),
    mileage: z.preprocess(blankToUndefined, z.coerce.number().int().min(0).optional()),
    urgent: formBool,
    /** "Ik heb vervangend vervoer nodig": approval then creates a placeholder spare for staff to fill. */
    needsReplacement: formBool,
    preferredDate: z.preprocess(blankToUndefined, isoDate.optional()),
  }),
  /** Ask to move a planned maintenance block; the linked reservation is the block itself. */
  maintenance_change: z.object({
    newDate: isoDate,
    reason: z.string().trim().min(1).max(500),
    needsReplacement: formBool,
  }),
```

Add `maintenance_change: 'reservation'` to `REQUEST_NEEDS`.

- [ ] **Step 4: Run the test to see it pass**

Run: `npx vitest run shared/portal-requests.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Schema column and migration**

In `shared/schema.ts`, directly after the `affectedRentalId` line of the `reservations` table:

```ts
  portalRequestId: integer("portal_request_id"), // Set on a maintenance block created from a customer portal request
```

In `startup-migration.js`, after the `fines.import_file_id` line:

```js
    await addColumnIfNotExists('reservations', 'portal_request_id', 'INTEGER');
```

Run: `node -r dotenv/config startup-migration.js`
Expected: log line that the column was added (or already exists), exit 0.

- [ ] **Step 6: Shared portal types**

In `shared/portal-types.ts`:

Add to `PORTAL_ERROR` after `DUPLICATE_REQUEST`:

```ts
  MAINTENANCE_TOO_LATE: 'PORTAL_MAINTENANCE_TOO_LATE',
```

Add after `PortalVehicleDto`:

```ts
/** Planned or running maintenance on a vehicle the customer has in use. Placeholder spares are never sent. */
export interface PortalVehicleMaintenanceDto {
  blockId: number;
  startDate: string;
  endDate: string | null;
  status: 'scheduled' | 'in' | 'out';
  category: 'scheduled_maintenance' | 'repair' | null;
  /** False within 48 hours of the start or once the car is in. */
  canRequestChange: boolean;
  openChangeRequestId: number | null;
  replacement: { licensePlate: string; brand: string; model: string; status: string | null } | null;
}

/** One vehicle the customer has on the road, as shown on the Voertuigen page. */
export interface PortalMyVehicleDto {
  reservationId: number;
  vehicle: { id: number; licensePlate: string; brand: string; model: string; apkDate: string | null; currentMileage: number | null };
  driver: { id: number; displayName: string } | null;
  startDate: string;
  endDate: string | null;
  lastReportedMileage: { value: number; at: string } | null;
  serviceDue: 'due' | 'soon' | null;
  maintenance: PortalVehicleMaintenanceDto | null;
  openMaintenanceRequestId: number | null;
}
```

In `PortalMe.info` add `phone: string`. In `PortalConfig` add, under `privacyUrl`:

```ts
  /** Phone number customers should call for changes that the portal no longer allows (e.g. maintenance within 48 hours). */
  phone: string;
```

and in `DEFAULT_PORTAL_CONFIG`: `phone: '0181 - 45 10 40',`.

In `PortalDashboard.counts` add:

```ts
    /** Open maintenance and maintenance-change requests plus placeholder spares from portal blocks that still need a car. */
    maintenance: number;
```

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "^$" | head -20`
Expected: errors only where `counts.maintenance` and `info.phone` are built (`server/services/portal-dashboard.ts`, `server/portal-auth.ts`). Fix them now:

In `server/services/portal-dashboard.ts` `counts` add `maintenance: 0,` (Task 7 fills it). In `server/portal-auth.ts` `buildMe`, where `info` is assembled from the config, add `phone: config.phone`. In `server/services/portal-config.ts`, where the stored JSON is merged with `DEFAULT_PORTAL_CONFIG`, nothing changes if it spreads the defaults; confirm by reading `getPortalConfig` and add `phone: typeof raw.phone === "string" ? raw.phone : DEFAULT_PORTAL_CONFIG.phone` if fields are picked one by one.

Run `npx tsc --noEmit -p tsconfig.json` again. Expected: clean.

- [ ] **Step 7: Translations**

`client/src/locales/nl/portal.json`:

- `tabs`: add `"vehicles": "Voertuigen"`.
- `requests.type`: add `"maintenance_change": "Onderhoud wijzigen"`.
- `requests.form`: add
  ```json
  "needsReplacement": "Ik heb vervangend vervoer nodig tijdens het onderhoud",
  "preferredDate": "Gewenste datum (optioneel)",
  "currentMaintenanceDate": "Gepland op",
  "newDate": "Nieuwe gewenste datum",
  "reason": "Reden",
  "stillNeedsReplacement": "Ik heb nog steeds vervangend vervoer nodig",
  "changeHint": "Lam Groep bekijkt of de nieuwe datum past en bevestigt dit."
  ```
- new top-level `vehicles` block (there is already `vehicles` for the online offer; add keys inside it):
  ```json
  "mine": "Mijn voertuigen",
  "none": "Geen auto in gebruik.",
  "search": "Zoek op kenteken, auto of bestuurder",
  "apk": "APK tot",
  "apkExpired": "APK verlopen op {{date}}",
  "apkSoon": "APK verloopt op {{date}}",
  "mileage": "Kilometerstand",
  "noMileage": "Nog geen kilometerstand doorgegeven",
  "mileageAt": "{{value}} km op {{date}}",
  "serviceSoon": "Bijna toe aan onderhoud",
  "serviceDue": "Onderhoud nodig",
  "maintenanceScheduled": "Onderhoud gepland op {{date}}",
  "maintenanceIn": "Auto in onderhoud sinds {{date}}",
  "maintenanceOut": "Onderhoud klaar op {{date}}",
  "replacement": "Vervangend vervoer: {{car}}",
  "changeMaintenance": "Onderhoud wijzigen",
  "changeTooLate": "Wijzigen kan tot 48 uur van tevoren. Bel Lam Groep: {{phone}}",
  "changePending": "Wijziging aangevraagd (#{{id}})",
  "requestPending": "Onderhoudsmelding #{{id}} bekijken",
  "viewAll": "Alles bekijken en zoeken"
  ```
- `errors`: add `"PORTAL_MAINTENANCE_TOO_LATE": "Dit onderhoud start binnen 48 uur en kan via het portaal niet meer worden gewijzigd. Bel Lam Groep."`.
- `notifications` types (find the block where bell titles or filters are translated; if none, skip).
- `admin.requests.type` (staff labels): add `"maintenance_change": "Onderhoud wijzigen"`.
- `admin.maintenance` (new block):
  ```json
  "title": "Inplannen in de onderhoudskalender",
  "moveTitle": "Onderhoud verplaatsen",
  "date": "Datum",
  "duration": "Duur (dagen)",
  "category": "Soort",
  "categoryService": "Onderhoudsbeurt",
  "categoryRepair": "Reparatie",
  "note": "Notitie voor de klant",
  "approve": "Inplannen en bevestigen",
  "move": "Verplaatsen en bevestigen",
  "created": "Onderhoud #{{id}} staat in de kalender",
  "moved": "Onderhoud #{{id}} is verplaatst",
  "closeHint": "Een onderhoudsmelding kan alleen worden afgehandeld via Inplannen (zet het in de kalender) of Afwijzen.",
  "summary": "Melding van de klant",
  "issue": "Klacht",
  "mileage": "Kilometerstand",
  "urgent": "Dringend",
  "wantsReplacement": "Vervangend vervoer gewenst",
  "preferredDate": "Gewenste datum",
  "currentDate": "Nu gepland op",
  "requestedDate": "Gevraagde datum",
  "reason": "Reden",
  "placeholderNote": "Er wordt een vervanger-placeholder aangemaakt; wijs later een auto toe in de onderhoudskalender.",
  "fromPortal": "Uit klantenportaal, aanvraag #{{id}}"
  ```
- `admin.tabs`: add `"maintenance": "Onderhoud"`; `admin.dashboard.tiles`: add `"maintenanceSub": "meldingen en placeholders"`.
- `admin.config`: add `"phone": "Telefoonnummer voor klanten"`.

`client/src/locales/en/portal.json`: same keys in English ("Vehicles", "Change maintenance", "I need a replacement vehicle during the maintenance", "Preferred date (optional)", "Planned on", "New preferred date", "Reason", "I still need a replacement vehicle", "Lam Groep checks whether the new date fits and confirms it.", "My vehicles", "No car in use.", "Search by plate, car or driver", "APK until", "APK expired on {{date}}", "APK expires on {{date}}", "Mileage", "No mileage reported yet", "{{value}} km on {{date}}", "Service due soon", "Service due", "Maintenance planned on {{date}}", "Car in maintenance since {{date}}", "Maintenance finished on {{date}}", "Replacement vehicle: {{car}}", "Change maintenance", "Changes are possible until 48 hours before. Call Lam Groep: {{phone}}", "Change requested (#{{id}})", "View maintenance report #{{id}}", "View all and search", error "This maintenance starts within 48 hours and can no longer be changed through the portal. Please call Lam Groep.", admin block in English accordingly, "Phone number for customers").

Run: `node -e "JSON.parse(require('fs').readFileSync('client/src/locales/nl/portal.json','utf8'));JSON.parse(require('fs').readFileSync('client/src/locales/en/portal.json','utf8'));console.log('ok')"`
Expected: `ok`.

- [ ] **Step 8: Commit**

```bash
git add shared/schema.ts startup-migration.js shared/portal-requests.ts shared/portal-requests.test.ts shared/portal-types.ts server/services/portal-dashboard.ts server/portal-auth.ts server/services/portal-config.ts client/src/locales/nl/portal.json client/src/locales/en/portal.json
git commit -m "feat(portal): schema, types and texts for vehicle overview and maintenance requests"
```

---

### Task 2: Maintenance event service

**Files:**
- Create: `server/services/portal-maintenance-events.ts`
- Modify: `server/services/portal-mail.ts` (template + `sendMaintenanceMail`)
- Test: `server/__tests__/portal-maintenance-events.test.ts`

**Interfaces:**
- Consumes: `customerNotifications.notify` (`server/services/portal-customer-notifications.ts`), `storage.getReservation`, `storage.getVehicle`, `getPortalConfig`, `db`.
- Produces:
  ```ts
  export type MaintenanceEvent = 'maintenance_planned' | 'maintenance_moved' | 'maintenance_in' | 'maintenance_out' | 'maintenance_cancelled';
  export async function onMaintenanceBlockChanged(before: Reservation | null, after: Reservation | null): Promise<MaintenanceEvent | null>;
  export async function onReplacementAssigned(replacement: Reservation): Promise<boolean>;
  export async function findPortalCustomerForBlock(block: Reservation): Promise<{ customerId: number; rental: Reservation } | null>;
  export function maintenanceStartsAt(block: Pick<Reservation, 'startDate' | 'startTime'>): Date;
  export function canCustomerChangeMaintenance(block: Pick<Reservation, 'startDate' | 'startTime' | 'maintenanceStatus'>, now?: Date): boolean;
  ```
  and in `portal-mail.ts`: `PORTAL_TEMPLATE.MAINTENANCE = "portal_maintenance"`, `sendMaintenanceMail(customerId: number, vars: { plate: string; car: string; event: string; date: string; endDate: string }): Promise<boolean>`.

- [ ] **Step 1: Write the failing tests**

Create `server/__tests__/portal-maintenance-events.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn(async () => true) }));
vi.mock("../utils/email-service", () => ({ sendEmail }));

import { onMaintenanceBlockChanged, onReplacementAssigned, canCustomerChangeMaintenance, maintenanceStartsAt } from "../services/portal-maintenance-events";
import { customerNotifications } from "../services/portal-customer-notifications";
import { portalStorage } from "../services/portal-storage";
import { storage } from "../storage";
import { createTestCustomer, createTestVehicle, createTestReservation, cleanupPortalTestData, TEST_EMAIL_DOMAIN } from "./portal-helpers";
import { db } from "../db";
import { reservations, type Reservation } from "../../shared/schema";
import { eq } from "drizzle-orm";

describe("portal maintenance events", () => {
  let customerId: number, userId: number, vehicleId: number, rentalId: number;
  beforeAll(async () => {
    await cleanupPortalTestData();
    customerId = (await createTestCustomer("ME")).id;
    userId = (await portalStorage.createPortalUser({ customerId, email: `me@${TEST_EMAIL_DOMAIN}`, fullName: "Melder", role: "admin" }, "t")).id;
    vehicleId = (await createTestVehicle()).id;
    rentalId = (await createTestReservation({ customerId, vehicleId, startDate: "2026-09-01", endDate: null, status: "picked_up" })).id;
  });
  afterAll(cleanupPortalTestData);

  const block = async (patch: Partial<Reservation>): Promise<Reservation> => {
    const row = await storage.createMaintenanceBlock(vehicleId, "2026-10-10", "2026-10-11");
    await db.update(reservations).set(patch).where(eq(reservations.id, row.id));
    return (await storage.getReservation(row.id))!;
  };
  const mine = async (type: string) => (await customerNotifications.listForUser(customerId, userId)).filter((n) => n.type === type);

  it("planned, moved, in, out and cancelled each notify the customer once", async () => {
    const b = await block({});
    expect(await onMaintenanceBlockChanged(null, b)).toBe("maintenance_planned");
    expect(await onMaintenanceBlockChanged(null, b)).toBeNull();
    expect((await mine("maintenance_planned")).filter((n) => n.link === `/voertuigen?block=${b.id}`)).toHaveLength(1);
    const moved = { ...b, startDate: "2026-10-12", endDate: "2026-10-13" };
    expect(await onMaintenanceBlockChanged(b, moved)).toBe("maintenance_moved");
    expect(await onMaintenanceBlockChanged(b, moved)).toBeNull();
    expect(await onMaintenanceBlockChanged(moved, { ...moved, maintenanceStatus: "in" })).toBe("maintenance_in");
    expect(await onMaintenanceBlockChanged({ ...moved, maintenanceStatus: "in" }, { ...moved, maintenanceStatus: "out" })).toBe("maintenance_out");
    const other = await block({});
    expect(await onMaintenanceBlockChanged(other, null)).toBe("maintenance_cancelled");
    expect(sendEmail).toHaveBeenCalled();
  });

  it("does nothing for a vehicle without a portal customer on the road", async () => {
    const lonely = await createTestVehicle();
    const b = await storage.createMaintenanceBlock(lonely.id, "2026-10-10", "2026-10-11");
    expect(await onMaintenanceBlockChanged(null, b)).toBeNull();
  });

  it("tells the customer when a replacement gets a real vehicle, once", async () => {
    const spare = await createTestVehicle();
    const rep = await createTestReservation({ customerId, vehicleId: spare.id, startDate: "2026-10-10", endDate: "2026-10-11", type: "replacement" });
    await db.update(reservations).set({ replacementForReservationId: rentalId }).where(eq(reservations.id, rep.id));
    const row = (await storage.getReservation(rep.id))!;
    expect(await onReplacementAssigned(row)).toBe(true);
    expect(await onReplacementAssigned(row)).toBe(false);
    expect(await mine("replacement_ready")).toHaveLength(1);
  });

  it("48-hour rule", () => {
    const now = new Date("2026-10-08T07:00:00+02:00");
    expect(maintenanceStartsAt({ startDate: "2026-10-10", startTime: null }).toISOString()).toBe(new Date("2026-10-10T08:00:00+02:00").toISOString());
    expect(canCustomerChangeMaintenance({ startDate: "2026-10-10", startTime: null, maintenanceStatus: "scheduled" }, now)).toBe(true);
    expect(canCustomerChangeMaintenance({ startDate: "2026-10-10", startTime: null, maintenanceStatus: "scheduled" }, new Date("2026-10-08T09:00:00+02:00"))).toBe(false);
    expect(canCustomerChangeMaintenance({ startDate: "2026-10-10", startTime: "12:00", maintenanceStatus: "scheduled" }, new Date("2026-10-08T11:00:00+02:00"))).toBe(true);
    expect(canCustomerChangeMaintenance({ startDate: "2026-10-10", startTime: null, maintenanceStatus: "in" }, now)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run server/__tests__/portal-maintenance-events.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Mail template and sender**

In `server/services/portal-mail.ts` add to `PORTAL_TEMPLATE`: `MAINTENANCE: "portal_maintenance",` and to `DEFAULT_TEMPLATES`:

```ts
  {
    name: PORTAL_TEMPLATE.MAINTENANCE,
    subject: "Onderhoud {{plate}}: {{event}}",
    content: `<p>Beste {{name}},</p>
<p>{{event}} voor {{car}} ({{plate}}).</p>
<p>Datum: {{date}}{{endDate}}</p>
<p>Adres: {{pickupAddress}}<br>Openingstijden: {{openingHours}}</p>
<p>In het klantenportaal ziet u de actuele status: <a href="{{link}}">{{link}}</a></p>
<p>Met vriendelijke groet,<br>Lam Groep</p>`,
  },
```

Add the sender (after `sendFineLinkedMail`):

```ts
/** Maintenance news for a customer: planned, moved, car in, car ready, cancelled, replacement ready. */
export async function sendMaintenanceMail(customerId: number, vars: { plate: string; car: string; event: string; date: string; endDate: string | null }): Promise<boolean> {
  const [customer, settings, config] = await Promise.all([
    storage.getCustomer(customerId), portalStorage.getOrCreateCustomerSettings(customerId), getPortalConfig(),
  ]);
  const to = customer?.emailForMOT || customer?.email;
  if (!customer || !settings.portalEnabled || !to) return false;
  const template = await getPortalTemplate(PORTAL_TEMPLATE.MAINTENANCE);
  const v = {
    name: customer.contactPerson || customer.companyName || customer.name,
    plate: vars.plate, car: vars.car, event: vars.event, date: vars.date,
    endDate: vars.endDate && vars.endDate !== vars.date ? ` tot en met ${vars.endDate}` : "",
    pickupAddress: config.pickupAddress, openingHours: config.openingHours,
    link: `${config.portalBaseUrl.replace(/\/$/, "")}/portaal/voertuigen`,
  };
  const html = renderTemplate(template.content, v);
  return sendEmail({ to, subject: renderTemplate(template.subject, v), html, text: stripHtml(html) }, "custom");
}
```

Check the column name for the APK e-mail on `customers` (`grep -n "emailForMOT" shared/schema.ts`); use the exact property.

- [ ] **Step 4: Write the service**

Create `server/services/portal-maintenance-events.ts`:

```ts
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "../db";
import { reservations, portalUsers, type Reservation } from "../../shared/schema";
import { storage } from "../storage";
import { customerNotifications } from "./portal-customer-notifications";
import { sendMaintenanceMail } from "./portal-mail";

export type MaintenanceEvent = "maintenance_planned" | "maintenance_moved" | "maintenance_in" | "maintenance_out" | "maintenance_cancelled";

/** Customers may ask to move maintenance until this long before it starts. */
export const CHANGE_CUTOFF_MS = 48 * 60 * 60 * 1000;

const TITLE: Record<MaintenanceEvent, string> = {
  maintenance_planned: "Onderhoud gepland", maintenance_moved: "Onderhoud verplaatst",
  maintenance_in: "Auto in onderhoud", maintenance_out: "Onderhoud klaar", maintenance_cancelled: "Onderhoud vervalt",
};

/** Block start as an instant: startDate + startTime, or 08:00 Amsterdam time when no time is set. */
export function maintenanceStartsAt(block: Pick<Reservation, "startDate" | "startTime">): Date {
  const time = block.startTime && /^\d{2}:\d{2}$/.test(block.startTime) ? block.startTime : "08:00";
  // Offset for Europe/Amsterdam on that date (+01:00 or +02:00).
  const probe = new Date(`${block.startDate}T12:00:00Z`);
  const local = new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", hour12: false }).format(probe);
  const offset = Number(local) - 12; // 1 or 2
  return new Date(`${block.startDate}T${time}:00${offset === 2 ? "+02:00" : "+01:00"}`);
}

export function canCustomerChangeMaintenance(block: Pick<Reservation, "startDate" | "startTime" | "maintenanceStatus">, now = new Date()): boolean {
  if (block.maintenanceStatus !== "scheduled") return false;
  return maintenanceStartsAt(block).getTime() - now.getTime() >= CHANGE_CUTOFF_MS;
}

/** The customer (with a portal account) who has this vehicle on the road during the block. */
export async function findPortalCustomerForBlock(block: Pick<Reservation, "vehicleId" | "startDate" | "endDate">): Promise<{ customerId: number; rental: Reservation } | null> {
  if (!block.vehicleId) return null;
  const rows = await db.select().from(reservations).where(and(
    eq(reservations.vehicleId, block.vehicleId), eq(reservations.status, "picked_up"), eq(reservations.type, "standard"), isNull(reservations.deletedAt),
    sql`${reservations.startDate} <= ${block.endDate ?? block.startDate}`,
    or(isNull(reservations.endDate), sql`${reservations.endDate} >= ${block.startDate}`),
  )).limit(1);
  const rental = rows[0];
  if (!rental?.customerId) return null;
  const [account] = await db.select({ id: portalUsers.id }).from(portalUsers).where(and(eq(portalUsers.customerId, rental.customerId), eq(portalUsers.active, true))).limit(1);
  return account ? { customerId: rental.customerId, rental } : null;
}

const alive = (r: Reservation | null): r is Reservation => Boolean(r && !r.deletedAt && r.status !== "cancelled");

function classify(before: Reservation | null, after: Reservation | null): MaintenanceEvent | null {
  const b = alive(before) ? before : null, a = alive(after) ? after : null;
  if (!b && a) return a.maintenanceStatus === "in" ? "maintenance_in" : a.maintenanceStatus === "out" ? null : "maintenance_planned";
  if (b && !a) return b.maintenanceStatus === "out" ? null : "maintenance_cancelled";
  if (!b || !a) return null;
  if (b.maintenanceStatus !== a.maintenanceStatus) {
    if (a.maintenanceStatus === "in") return "maintenance_in";
    if (a.maintenanceStatus === "out") return "maintenance_out";
    if (a.maintenanceStatus === "scheduled") return "maintenance_planned";
  }
  if (a.maintenanceStatus === "scheduled" && (b.startDate !== a.startDate || (b.endDate ?? "") !== (a.endDate ?? ""))) return "maintenance_moved";
  return null;
}

/**
 * Called at every write point of a maintenance block (create, edit, status, delete)
 * with the row before and after. Tells the customer who has the car what changed.
 * Idempotent through the dedupe tag; never throws.
 */
export async function onMaintenanceBlockChanged(before: Reservation | null, after: Reservation | null): Promise<MaintenanceEvent | null> {
  try {
    const block = alive(after) ? after : before;
    if (!block || block.type !== "maintenance_block") return null;
    const event = classify(before, after);
    if (!event) return null;
    const target = await findPortalCustomerForBlock(block);
    if (!target) return null;
    const vehicle = block.vehicleId ? await storage.getVehicle(block.vehicleId) : undefined;
    if (!vehicle) return null;
    const car = `${vehicle.brand} ${vehicle.model}`;
    const date = block.startDate, endDate = block.endDate ?? null;
    const tag = event === "maintenance_moved" ? `maint:${block.id}:moved:${date}:${endDate ?? ""}` : event === "maintenance_planned" ? `maint:${block.id}:planned:${date}` : `maint:${block.id}:${event.replace("maintenance_", "")}`;
    const description = {
      maintenance_planned: `${car} (${vehicle.licensePlate}) staat ingepland voor onderhoud op ${date}${endDate && endDate !== date ? ` tot en met ${endDate}` : ""}. Breng de auto op de afgesproken dag naar Lam Groep.`,
      maintenance_moved: `Het onderhoud van ${car} (${vehicle.licensePlate}) is verplaatst naar ${date}${endDate && endDate !== date ? ` tot en met ${endDate}` : ""}.`,
      maintenance_in: `${car} (${vehicle.licensePlate}) is bij Lam Groep in onderhoud.`,
      maintenance_out: `${car} (${vehicle.licensePlate}) is klaar en kan worden opgehaald.`,
      maintenance_cancelled: `Het geplande onderhoud van ${car} (${vehicle.licensePlate}) op ${date} gaat niet door. Lam Groep neemt contact op voor een nieuwe datum.`,
    }[event];
    const created = await customerNotifications.notify({
      customerId: target.customerId, type: event, title: `${TITLE[event]}: ${vehicle.licensePlate}`, description,
      link: `/voertuigen?block=${block.id}`, dedupeTag: tag, dedupeDays: 365,
    });
    if (!created) return null;
    try { await sendMaintenanceMail(target.customerId, { plate: vehicle.licensePlate, car, event: TITLE[event], date, endDate }); } catch (e) { console.error("maintenance mail failed:", e); }
    return event;
  } catch (e) {
    console.error("onMaintenanceBlockChanged failed:", e);
    return null;
  }
}

/** A replacement got a real vehicle: tell the customer of the original rental. Returns false when nothing was sent. */
export async function onReplacementAssigned(replacement: Reservation): Promise<boolean> {
  try {
    if (replacement.type !== "replacement" || !replacement.vehicleId || replacement.placeholderSpare || !replacement.replacementForReservationId) return false;
    const rental = await storage.getReservation(replacement.replacementForReservationId);
    if (!rental?.customerId) return false;
    const [account] = await db.select({ id: portalUsers.id }).from(portalUsers).where(and(eq(portalUsers.customerId, rental.customerId), eq(portalUsers.active, true))).limit(1);
    if (!account) return false;
    const spare = await storage.getVehicle(replacement.vehicleId);
    if (!spare) return false;
    const car = `${spare.brand} ${spare.model}`;
    const created = await customerNotifications.notify({
      customerId: rental.customerId, type: "replacement_ready", title: `Vervangend vervoer: ${spare.licensePlate}`,
      description: `${car} (${spare.licensePlate}) staat voor u klaar als vervangend vervoer vanaf ${replacement.startDate}${replacement.endDate ? ` tot en met ${replacement.endDate}` : ""}. Neem uw rijbewijs mee bij het ophalen.`,
      link: `/reserveringen/${replacement.id}`, dedupeTag: `spare:${replacement.id}:${replacement.vehicleId}`, dedupeDays: 365,
    });
    if (!created) return false;
    try { await sendMaintenanceMail(rental.customerId, { plate: spare.licensePlate, car, event: "Vervangend vervoer staat klaar", date: replacement.startDate, endDate: replacement.endDate ?? null }); } catch (e) { console.error("replacement mail failed:", e); }
    return true;
  } catch (e) {
    console.error("onReplacementAssigned failed:", e);
    return false;
  }
}
```

Check `reservations.status` for cancelled blocks: `grep -n '"cancelled"' server/database-storage.ts | head -3`. If cancellation is only soft delete (`deletedAt`), the `alive` check still works.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run server/__tests__/portal-maintenance-events.test.ts`
Expected: PASS (4 tests). If `createTestReservation` does not accept `endDate: null` for an open rental, check the helper: it does (`endDate === undefined ? "2026-09-10" : input.endDate`).

- [ ] **Step 6: Commit**

```bash
git add server/services/portal-maintenance-events.ts server/services/portal-mail.ts server/__tests__/portal-maintenance-events.test.ts
git commit -m "feat(portal): maintenance event service notifies customers about blocks and replacements"
```

---

### Task 3: Wire the hook into the staff write points

**Files:**
- Modify: `server/routes.ts` at: `POST /api/reservations` (maintenance branch, around line 2526), `PATCH /api/reservations/:id` (maintenance branch, around line 3114-3155), `DELETE /api/reservations/:id` (around line 4606-4690), `POST /api/reservations/maintenance-with-spare` (around line 2785-2990), `PATCH /api/vehicles/:id/maintenance-status` (around line 3787), `POST /api/placeholder-reservations/:id/assign-vehicle` (around line 4553), `POST /api/reservations/:id/assign-spare` (around line 3835).

**Interfaces:**
- Consumes: `onMaintenanceBlockChanged`, `onReplacementAssigned` from Task 2.

- [ ] **Step 1: Import**

At the top of `server/routes.ts` with the other service imports:

```ts
import { onMaintenanceBlockChanged, onReplacementAssigned } from "./services/portal-maintenance-events";
```

- [ ] **Step 2: Create**

In the `POST /api/reservations` maintenance branch, right after `const reservation = await storage.createReservation(dataWithTracking);`:

```ts
        void onMaintenanceBlockChanged(null, reservation);
```

- [ ] **Step 3: Edit**

In `PATCH /api/reservations/:id`, before `const updatedMaintenance = await storage.updateReservation(id, maintDataWithTracking);` add `const maintBefore = await storage.getReservation(id);` and after the `if (!updatedMaintenance)` guard add:

```ts
        void onMaintenanceBlockChanged(maintBefore ?? null, updatedMaintenance);
```

Also find the non-maintenance path of the same route: if a block can be edited there (type not sent), skip; the maintenance dialog always sends `type`.

- [ ] **Step 4: Delete**

In `DELETE /api/reservations/:id`, after `const updatedReservation = await storage.updateReservation(id, softDeleteData);`:

```ts
      if (reservation.type === 'maintenance_block') void onMaintenanceBlockChanged(reservation, null);
```

- [ ] **Step 5: maintenance-with-spare**

In `POST /api/reservations/maintenance-with-spare`, before `maintenanceReservation = await storage.updateReservation(maintenanceId, maintenanceWithTracking);` read `const maintBefore = await storage.getReservation(maintenanceId);` and after it `void onMaintenanceBlockChanged(maintBefore ?? null, maintenanceReservation ?? null);`. Where replacements are created in that route (`createReplacementReservation` calls), after each: `void onReplacementAssigned(created);` using the variable that holds the returned row.

- [ ] **Step 6: Vehicle maintenance status route**

In `PATCH /api/vehicles/:id/maintenance-status`: where `storage.createMaintenanceBlock(` is called, capture the result and call `void onMaintenanceBlockChanged(null, block);`. Where an existing block's status is updated (look for `updateReservation` with `maintenanceStatus` in that route), wrap with before/after and call the hook.

- [ ] **Step 7: Spare assignment**

In `POST /api/placeholder-reservations/:id/assign-vehicle`, after `const updatedReservation = await storage.assignVehicleToPlaceholder(...)` and its null guard: `void onReplacementAssigned(updatedReservation);`.
In `POST /api/reservations/:id/assign-spare`, after `const replacementReservation = await storage.createReplacementReservation(...)`: `void onReplacementAssigned(replacementReservation);`.

- [ ] **Step 8: Typecheck and smoke test**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: clean.

Restart the dev server (`preview_stop`, `preview_start`). In the staff app open `/maintenance`, schedule a block on a vehicle that portal customer 179 has in use (see the customer's Voertuigen list or reservations), then open the portal bell as that customer: one "Onderhoud gepland" notification. Delete the block: "Onderhoud vervalt". Remove both test notifications afterwards with:

```bash
node -r dotenv/config -e "const {Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query(\"delete from portal_notifications where dedupe_tag like 'maint:%' and customer_id=179\").then(r=>{console.log(r.rowCount);p.end()})"
```

- [ ] **Step 9: Commit**

```bash
git add server/routes.ts
git commit -m "feat(portal): maintenance block and spare write points notify the customer"
```

---

### Task 4: `GET /api/portal/vehicles/mine`

**Files:**
- Create: `server/services/portal-vehicles.ts`
- Modify: `server/routes/portal.ts` (next to the other vehicles route, around line 398)
- Test: `server/__tests__/portal-routes.test.ts`

**Interfaces:**
- Consumes: `portalStorage.listReservationsForCustomer(customerId, scope)`, `requestsStorage.listRequestsForCustomer`, `getServiceDueVehicles`, `canCustomerChangeMaintenance`.
- Produces: `listMyVehicles(customerId: number, scope: PortalScope): Promise<PortalMyVehicleDto[]>`.

- [ ] **Step 1: Write the failing test**

In `server/__tests__/portal-routes.test.ts` find how a logged-in agent is built (`login(...)` helper and `createTestCustomer` in `beforeAll`). Add a describe block at the end of the file:

```ts
describe("my vehicles", () => {
  let customerId: number, agent: ReturnType<typeof request.agent>, vehicleId: number, rentalId: number, otherCustomerId: number;
  beforeAll(async () => {
    customerId = (await createTestCustomer("MV")).id;
    otherCustomerId = (await createTestCustomer("MVO")).id;
    vehicleId = (await createTestVehicle()).id;
    rentalId = (await createTestReservation({ customerId, vehicleId, startDate: "2026-09-01", endDate: null, status: "picked_up" })).id;
    await createTestReservation({ customerId, vehicleId: (await createTestVehicle()).id, startDate: "2026-12-01", endDate: "2026-12-05", status: "booked" });
    await createTestReservation({ customerId: otherCustomerId, vehicleId: (await createTestVehicle()).id, startDate: "2026-09-01", endDate: null, status: "picked_up" });
    // A placeholder spare for our rental must never show up.
    await db.insert(reservations).values({ customerId, vehicleId: null, startDate: "2026-10-10", endDate: "2026-10-11", status: "booked", type: "replacement", placeholderSpare: true, replacementForReservationId: rentalId });
    agent = await loginAs(customerId, "mv"); // use the file's existing helper name
  });

  it("lists only vehicles in use, with maintenance info and the 48-hour flag", async () => {
    const block = await storage.createMaintenanceBlock(vehicleId, "2099-10-10", "2099-10-11");
    const res = await agent.get("/api/portal/vehicles/mine");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ reservationId: rentalId, vehicle: { id: vehicleId }, maintenance: { blockId: block.id, status: "scheduled", canRequestChange: true, replacement: null } });
    await db.update(reservations).set({ startDate: new Date(Date.now() + 24 * 3600e3).toISOString().slice(0, 10), endDate: null }).where(eq(reservations.id, block.id));
    expect((await agent.get("/api/portal/vehicles/mine")).body[0].maintenance.canRequestChange).toBe(false);
  });
});
```

Adapt `loginAs` to the helper the file actually uses (read the top of the file first) and add the missing imports (`db`, `reservations`, `eq`, `storage`).

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run server/__tests__/portal-routes.test.ts -t "my vehicles"`
Expected: FAIL with 404.

- [ ] **Step 3: Service**

Create `server/services/portal-vehicles.ts`:

```ts
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "../db";
import { reservations, vehicles } from "../../shared/schema";
import { portalStorage, type PortalScope } from "./portal-storage";
import { requestsStorage } from "./portal-requests-storage";
import { getServiceDueVehicles } from "../utils/service-due-scanner";
import { canCustomerChangeMaintenance } from "./portal-maintenance-events";
import type { PortalMyVehicleDto, PortalVehicleMaintenanceDto } from "../../shared/portal-types";

const isoDay = (offset = 0) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };

/** The vehicles a customer has on the road right now, with maintenance and replacement state. */
export async function listMyVehicles(customerId: number, scope: PortalScope): Promise<PortalMyVehicleDto[]> {
  const rentals = (await portalStorage.listReservationsForCustomer(customerId, scope)).filter((r) => r.status === "picked_up" && r.type === "standard" && r.vehicle);
  if (rentals.length === 0) return [];
  const vehicleIds = rentals.map((r) => r.vehicleId!);
  const rentalIds = rentals.map((r) => r.id);
  const recentOut = isoDay(-7);
  const [blocks, replacements, requests, due] = await Promise.all([
    db.select().from(reservations).where(and(
      eq(reservations.type, "maintenance_block"), inArray(reservations.vehicleId, vehicleIds), isNull(reservations.deletedAt),
      or(sql`${reservations.maintenanceStatus} is distinct from 'out'`, sql`coalesce(${reservations.endDate}, ${reservations.startDate}) >= ${recentOut}`),
    )).orderBy(reservations.startDate),
    db.select({ r: reservations, v: vehicles }).from(reservations).leftJoin(vehicles, eq(reservations.vehicleId, vehicles.id)).where(and(
      eq(reservations.type, "replacement"), inArray(reservations.replacementForReservationId, rentalIds), isNull(reservations.deletedAt),
      eq(reservations.placeholderSpare, false), sql`${reservations.vehicleId} is not null`,
    )).orderBy(desc(reservations.startDate)),
    requestsStorage.listRequestsForCustomer(customerId, {}),
    getServiceDueVehicles(),
  ]);
  const open = requests.filter((q) => q.status === "new" || q.status === "in_progress");
  const mileageReports = requests.filter((q) => q.type === "mileage" && q.reservationId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return rentals.map((r) => {
    const block = blocks.find((b) => b.vehicleId === r.vehicleId && b.startDate <= (r.endDate ?? "9999-12-31") && (b.endDate ?? b.startDate) >= r.startDate) ?? null;
    let maintenance: PortalVehicleMaintenanceDto | null = null;
    if (block) {
      const rep = replacements.find((x) => x.r.replacementForReservationId === r.id && x.v);
      maintenance = {
        blockId: block.id, startDate: block.startDate, endDate: block.endDate, status: (block.maintenanceStatus as "scheduled" | "in" | "out") ?? "scheduled",
        category: (block.maintenanceCategory as "scheduled_maintenance" | "repair" | null) ?? null,
        canRequestChange: canCustomerChangeMaintenance(block),
        openChangeRequestId: open.find((q) => q.type === "maintenance_change" && q.reservationId === block.id)?.id ?? null,
        replacement: rep?.v ? { licensePlate: rep.v.licensePlate, brand: rep.v.brand, model: rep.v.model, status: rep.r.spareVehicleStatus } : null,
      };
    }
    const lastMileage = mileageReports.find((q) => q.reservationId === r.id);
    const km = lastMileage ? Number((lastMileage.payload as Record<string, unknown>).mileage) : NaN;
    const d = due.find((v) => v.id === r.vehicleId);
    return {
      reservationId: r.id,
      vehicle: { id: r.vehicle!.id, licensePlate: r.vehicle!.licensePlate, brand: r.vehicle!.brand, model: r.vehicle!.model, apkDate: r.vehicle!.apkDate ?? null, currentMileage: r.vehicle!.currentMileage ?? null },
      driver: r.driver ? { id: r.driver.id, displayName: r.driver.displayName } : null,
      startDate: r.startDate, endDate: r.endDate,
      lastReportedMileage: lastMileage && Number.isFinite(km) ? { value: km, at: lastMileage.createdAt.toISOString() } : r.pickupMileage ? { value: r.pickupMileage, at: r.actualPickupDate ?? r.startDate } : null,
      serviceDue: d?.serviceDue.isServiceDue ? "due" : d?.serviceDue.isServiceDueSoon ? "soon" : null,
      maintenance,
      openMaintenanceRequestId: open.find((q) => q.type === "maintenance" && q.reservationId === r.id)?.id ?? null,
    };
  });
}
```

Check the request row type returned by `listRequestsForCustomer` (`RequestRow` in `server/services/portal-requests-storage.ts`) for the exact `createdAt` type; adapt `.getTime()` if it is a string.

- [ ] **Step 4: Route**

In `server/routes/portal.ts` add the import `import { listMyVehicles } from "../services/portal-vehicles";` and, before the `GET /api/portal/vehicles` route (so `/mine` is not swallowed):

```ts
  // The vehicles the customer has on the road, with maintenance and replacement state.
  app.get("/api/portal/vehicles/mine", requirePortalUser, async (req, res) => {
    const ctx = ctxOf(req);
    res.json(await listMyVehicles(ctx.customerId, ctx.scope));
  });
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run server/__tests__/portal-routes.test.ts -t "my vehicles"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/services/portal-vehicles.ts server/routes/portal.ts server/__tests__/portal-routes.test.ts
git commit -m "feat(portal): my-vehicles endpoint with maintenance and replacement state"
```

---

### Task 5: Customer request rules (duplicate maintenance, change request, 48 hours)

**Files:**
- Modify: `server/routes/portal.ts` (`POST /api/portal/requests`, lines ~296-395; `REQUEST_LABEL` line 32)
- Test: `server/__tests__/portal-routes.test.ts`

**Interfaces:**
- Consumes: `findPortalCustomerForBlock`, `canCustomerChangeMaintenance` (Task 2), `PORTAL_ERROR.MAINTENANCE_TOO_LATE` (Task 1).

- [ ] **Step 1: Write the failing tests**

Append to the "my vehicles" describe block in `server/__tests__/portal-routes.test.ts`:

```ts
  it("one open maintenance report per rental", async () => {
    const body = { type: "maintenance", message: "Piept", reservationId: rentalId, payload: JSON.stringify({ issue: "Piept bij remmen", needsReplacement: "true" }) };
    expect((await agent.post("/api/portal/requests").send(body)).status).toBe(201);
    const dup = await agent.post("/api/portal/requests").send(body);
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe("PORTAL_DUPLICATE_REQUEST");
  });

  it("maintenance change: allowed 49 hours before, refused 47 hours before, once the car is in, and twice", async () => {
    const far = new Date(Date.now() + 49 * 3600e3), near = new Date(Date.now() + 47 * 3600e3);
    const okBlock = await storage.createMaintenanceBlock(vehicleId, far.toISOString().slice(0, 10), undefined);
    await db.update(reservations).set({ startTime: `${String(far.getHours()).padStart(2, "0")}:${String(far.getMinutes()).padStart(2, "0")}` }).where(eq(reservations.id, okBlock.id));
    const change = (blockId: number) => agent.post("/api/portal/requests").send({ type: "maintenance_change", message: "Past niet", reservationId: blockId, payload: JSON.stringify({ newDate: "2099-01-05", reason: "Vakantie" }) });
    expect((await change(okBlock.id)).status).toBe(201);
    const twice = await change(okBlock.id);
    expect(twice.status).toBe(409);
    expect(twice.body.code).toBe("PORTAL_DUPLICATE_REQUEST");
    const lateBlock = await storage.createMaintenanceBlock(vehicleId, near.toISOString().slice(0, 10), undefined);
    await db.update(reservations).set({ startTime: `${String(near.getHours()).padStart(2, "0")}:${String(near.getMinutes()).padStart(2, "0")}` }).where(eq(reservations.id, lateBlock.id));
    const late = await change(lateBlock.id);
    expect(late.status).toBe(400);
    expect(late.body.code).toBe("PORTAL_MAINTENANCE_TOO_LATE");
    const inBlock = await storage.createMaintenanceBlock(vehicleId, "2099-03-01", "2099-03-02");
    await db.update(reservations).set({ maintenanceStatus: "in" }).where(eq(reservations.id, inBlock.id));
    expect((await change(inBlock.id)).body.code).toBe("PORTAL_MAINTENANCE_TOO_LATE");
    const foreign = await storage.createMaintenanceBlock((await createTestVehicle()).id, "2099-04-01", "2099-04-02");
    expect((await change(foreign.id)).status).toBe(404);
  });
```

Note: `createMaintenanceBlock` sets `maintenanceStatus: 'scheduled'`. Times use the server's local clock; the test computes hours from local `Date`, which matches how `maintenanceStartsAt` interprets Amsterdam time on this machine. If the machine is not on Amsterdam time, set the block's `startTime` via the Amsterdam-formatted hour instead: `new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit", hour12: false }).format(far)`.

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run server/__tests__/portal-routes.test.ts -t "maintenance"`
Expected: FAIL (duplicate returns 201; `maintenance_change` rejected as unknown type).

- [ ] **Step 3: Implement in `server/routes/portal.ts`**

Imports:

```ts
import { findPortalCustomerForBlock, canCustomerChangeMaintenance } from "../services/portal-maintenance-events";
```

`REQUEST_LABEL`: add `maintenance_change: "wijziging onderhoud"`.

In the request `POST` handler, the `base` schema's `type` enum: add `PortalRequestType.MAINTENANCE_CHANGE`.

Replace the `needs === "reservation"` block with:

```ts
    let reservation: PortalReservation | undefined;
    let block: Awaited<ReturnType<typeof storage.getReservation>> | undefined;
    if (needs === "reservation") {
      if (!reservationId) { discard(); return portalError(res, 400, PORTAL_ERROR.VALIDATION, "reservationId is required"); }
      if (type === "maintenance_change") {
        // The linked reservation is the maintenance block; it is "ours" when we have the car on the road during it.
        block = await storage.getReservation(reservationId);
        const owner = block && block.type === "maintenance_block" && !block.deletedAt ? await findPortalCustomerForBlock(block) : null;
        if (!block || !owner || owner.customerId !== ctx.customerId) { discard(); return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Maintenance not found"); }
        if (ctx.scope.driverId && owner.rental.driverId !== ctx.scope.driverId) { discard(); return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Maintenance not found"); }
      } else {
        reservation = await portalStorage.getReservationForCustomer(reservationId, ctx.customerId, ctx.scope);
        if (!reservation) { discard(); return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Reservation not found"); }
      }
    }
```

After the `early_return` checks add:

```ts
    if (type === "maintenance" || type === "maintenance_change") {
      const openSame = (await requestsStorage.listRequestsForCustomer(ctx.customerId, {})).find((r) => r.type === type && r.reservationId === reservationId && (r.status === "new" || r.status === "in_progress"));
      if (openSame) { discard(); return portalError(res, 409, PORTAL_ERROR.DUPLICATE_REQUEST, `Er staat al een aanvraag (#${openSame.id}) open hiervoor`); }
    }
    if (type === "maintenance" && p.preferredDate && p.preferredDate < today) { discard(); return portalError(res, 400, PORTAL_ERROR.REQUEST_INVALID_PERIOD, "Preferred date must be today or later"); }
    if (type === "maintenance_change" && block) {
      if (!canCustomerChangeMaintenance(block)) { discard(); return portalError(res, 400, PORTAL_ERROR.MAINTENANCE_TOO_LATE, "Maintenance starts within 48 hours"); }
      if (p.newDate <= today) { discard(); return portalError(res, 400, PORTAL_ERROR.REQUEST_INVALID_PERIOD, "New date must be tomorrow or later"); }
    }
```

Staff notification: replace the `notifyStaffOfPortalEvent` call with:

```ts
    const isMaint = type === "maintenance" || type === "maintenance_change";
    const plate = reservation?.vehicle?.licensePlate ?? (block?.vehicleId ? (await storage.getVehicle(block.vehicleId))?.licensePlate : undefined);
    await notifyStaffOfPortalEvent({
      kind: isMaint ? "portal_maintenance" : "portal_request",
      title: isMaint
        ? `${type === "maintenance" ? "Onderhoudsmelding" : "Wijziging onderhoud"} ${plate ?? ""}${p.urgent === true || p.urgent === "true" ? " (dringend)" : ""}: ${customer?.companyName || customer?.name || ctx.customerId}`
        : `Nieuwe aanvraag (${REQUEST_LABEL[type]}${type === "booking" ? ` ${p.vehicleLabel}` : ""}): ${customer?.companyName || customer?.name || ctx.customerId}`,
      description: message.slice(0, 200), link: `/portal-admin?request=${created.id}`, customerId: ctx.customerId,
    });
```

Check `PortalStaffEvent.kind` in `server/services/portal-notifications.ts`; if it is a string union, add `"portal_maintenance"`. Check whether the staff socket hook (`client/src/hooks/use-socket.tsx`) filters on `kind`; if it only handles known kinds, add `portal_maintenance` to the same list as `portal_request`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run server/__tests__/portal-routes.test.ts`
Expected: PASS, all tests in the file.

- [ ] **Step 5: Commit**

```bash
git add server/routes/portal.ts server/services/portal-notifications.ts server/__tests__/portal-routes.test.ts client/src/hooks/use-socket.tsx
git commit -m "feat(portal): maintenance change requests with the 48-hour rule; one open maintenance report per rental"
```

---

### Task 6: Staff approval for `maintenance` and `maintenance_change`

**Files:**
- Modify: `server/routes/portal-requests.ts` (approve route lines ~158-186, reply guard lines ~116-119, `finish` unchanged)
- Test: `server/__tests__/portal-requests-routes.test.ts`

**Interfaces:**
- Consumes: `storage.createMaintenanceBlock(vehicleId, startDate, endDate?, customerId?)`, `storage.updateReservation(id, partial)`, `storage.createPlaceholderReservation(originalReservationId, customerId, startDate, endDate?)`, `storage.updateVehicle`, `onMaintenanceBlockChanged`, `daysBetween` from `server/services/booking-period.ts`.
- Produces: `POST /api/portal-requests/:id/approve` bodies `{ startDate, durationDays, category, note? }` (maintenance) and `{ startDate, durationDays, note? }` (maintenance_change); responses `{ ...request, block: Reservation }`; guard code `MAINTENANCE_NEEDS_BLOCK`.

- [ ] **Step 1: Write the failing tests**

Append to `server/__tests__/portal-requests-routes.test.ts` inside the main describe:

```ts
  it("approving a maintenance report puts a block in the calendar, with a placeholder spare when asked", async () => {
    const car = await createTestVehicle();
    await storage.updateVehicle(car.id, { currentMileage: 10000 });
    const rental = await createTestReservation({ customerId, vehicleId: car.id, startDate: "2026-09-01", endDate: null, status: "picked_up" });
    const reqId = (await requestsStorage.createRequest({ customerId, portalUserId: userId, type: "maintenance", reservationId: rental.id, payload: { issue: "Lampje", mileage: 12000, urgent: true, needsReplacement: true }, message: "Lampje brandt" })).id;
    expect((await request(manager).post(`/api/portal-requests/${reqId}/approve`).send({})).status).toBe(400);
    expect((await request(manager).post(`/api/portal-requests/${reqId}/reply`).send({ reply: "ok", status: "done" })).body.code).toBe("MAINTENANCE_NEEDS_BLOCK");
    const res = await request(manager).post(`/api/portal-requests/${reqId}/approve`).send({ startDate: "2026-11-02", durationDays: 2, category: "repair", note: "Graag om 8 uur brengen" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("done");
    const block = res.body.block;
    expect(block).toMatchObject({ type: "maintenance_block", vehicleId: car.id, startDate: "2026-11-02", endDate: "2026-11-03", maintenanceCategory: "repair", maintenanceDuration: 2, portalRequestId: reqId, affectedRentalId: rental.id });
    const placeholders = await db.select().from(reservations).where(eq(reservations.replacementForReservationId, rental.id));
    expect(placeholders.filter((p) => p.placeholderSpare && !p.deletedAt)).toHaveLength(1);
    expect((await storage.getVehicle(car.id))!.currentMileage).toBe(12000);
    expect((await customerNotifications.listForUser(customerId, userId)).some((n) => n.type === "maintenance_planned" && n.link === `/voertuigen?block=${block.id}`)).toBe(true);
    expect((await request(manager).get(`/api/portal-requests/${reqId}`)).body.staffReply).toContain("2026-11-02");
  });

  it("approving a change request moves the block and its placeholder", async () => {
    const car = await createTestVehicle();
    const rental = await createTestReservation({ customerId, vehicleId: car.id, startDate: "2026-09-01", endDate: null, status: "picked_up" });
    const block = await storage.createMaintenanceBlock(car.id, "2099-05-10", "2099-05-11");
    await db.update(reservations).set({ maintenanceDuration: 2, affectedRentalId: rental.id }).where(eq(reservations.id, block.id));
    await storage.createPlaceholderReservation(rental.id, customerId, "2099-05-10", "2099-05-11");
    const reqId = (await requestsStorage.createRequest({ customerId, portalUserId: userId, type: "maintenance_change", reservationId: block.id, payload: { newDate: "2099-05-20", reason: "Vakantie", needsReplacement: true }, message: "Graag later" })).id;
    const res = await request(manager).post(`/api/portal-requests/${reqId}/approve`).send({ startDate: "2099-05-20", durationDays: 2 });
    expect(res.status).toBe(200);
    expect(res.body.block).toMatchObject({ id: block.id, startDate: "2099-05-20", endDate: "2099-05-21" });
    const placeholder = (await db.select().from(reservations).where(eq(reservations.replacementForReservationId, rental.id)))[0];
    expect(placeholder).toMatchObject({ startDate: "2099-05-20", endDate: "2099-05-21" });
    expect((await customerNotifications.listForUser(customerId, userId)).some((n) => n.type === "maintenance_moved")).toBe(true);
  });
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run server/__tests__/portal-requests-routes.test.ts -t "maintenance"`
Expected: FAIL with 400 "Only extensions, early returns and rental requests can be approved".

- [ ] **Step 3: Implement**

Imports in `server/routes/portal-requests.ts`:

```ts
import { onMaintenanceBlockChanged } from "../services/portal-maintenance-events";
import { db } from "../db";
import { reservations } from "../../shared/schema";
import { and, eq, isNull } from "drizzle-orm";
```

Reply guard, after the booking guard:

```ts
    if (row.type === "maintenance" && parsed.data.status === "done" && !(await hasBlockFor(id))) {
      return res.status(400).json({ message: "Een onderhoudsmelding kan alleen worden afgehandeld via Inplannen (zet het in de kalender) of Afwijzen", code: "MAINTENANCE_NEEDS_BLOCK" });
    }
```

with, above the routes:

```ts
  async function hasBlockFor(requestId: number): Promise<boolean> {
    const [b] = await db.select({ id: reservations.id }).from(reservations).where(and(eq(reservations.portalRequestId, requestId), isNull(reservations.deletedAt))).limit(1);
    return Boolean(b);
  }
  const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
```

Approve dispatch: change the type check to

```ts
    if (row.type === "booking") return approveBooking(req, res, id, row);
    if (row.type === "maintenance") return approveMaintenance(req, res, id, row);
    if (row.type === "maintenance_change") return approveMaintenanceChange(req, res, id, row);
```

Add the two functions after `approveBooking`:

```ts
  type Row = NonNullable<Awaited<ReturnType<typeof requestsStorage.getRequest>>>;

  /** Puts the reported maintenance in the calendar; a placeholder spare when the customer asked for one. */
  async function approveMaintenance(req: Request, res: Response, id: number, row: Row) {
    if (!isValidRequestTransition(row.status, "done")) return res.status(400).json({ message: "Request is already closed" });
    const parsed = z.object({
      startDate: isoDate, durationDays: z.number().int().min(1).max(60).default(1),
      category: z.enum(["scheduled_maintenance", "repair"]).default("repair"), note: z.string().trim().max(2000).optional(),
    }).safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "startDate is required", field: "startDate" });
    const b = parsed.data;
    const rental = row.reservationId ? await storage.getReservation(row.reservationId) : undefined;
    if (!rental?.vehicleId) return res.status(400).json({ message: "Reservation not found" });
    const p = row.payload as Record<string, unknown>;
    const endDate = addDays(b.startDate, b.durationDays - 1);
    const created = await storage.createMaintenanceBlock(rental.vehicleId, b.startDate, endDate);
    const block = (await storage.updateReservation(created.id, {
      maintenanceCategory: b.category, maintenanceDuration: b.durationDays, portalRequestId: id, affectedRentalId: rental.id,
      spareAssignmentDecision: p.needsReplacement ? "spare_assigned" : "customer_arranging",
      notes: `Portaal aanvraag #${id}: ${String(p.issue ?? "")}${p.urgent ? " (dringend)" : ""}${b.note ? `\n${b.note}` : ""}`,
      createdBy: actor(req), updatedBy: actor(req),
    } as any))!;
    if (p.needsReplacement && rental.customerId) {
      await storage.createPlaceholderReservation(rental.id, rental.customerId, b.startDate, endDate);
    }
    const km = Number(p.mileage);
    if (Number.isFinite(km) && km > 0) {
      const vehicle = await storage.getVehicle(rental.vehicleId);
      if (vehicle && km > (vehicle.currentMileage ?? 0)) await storage.updateVehicle(vehicle.id, { currentMileage: km });
    }
    await storage.syncVehicleAvailabilityWithReservations();
    realtimeEvents.reservations.created(block);
    await onMaintenanceBlockChanged(null, block);
    await AuditLogger.logFromRequest(req, "reservation.create", "reservation", block.id, { viaPortalRequest: id, maintenance: true });
    const reply = `Ingepland op ${b.startDate}${b.durationDays > 1 ? ` tot en met ${endDate}` : ""}.${b.note ? ` ${b.note}` : ""}`;
    const updated = await finish(req, id, reply, "done", row.customerId);
    res.json({ ...updated, block });
  }

  /** Moves the block (and its placeholder spare) to the date staff confirm. */
  async function approveMaintenanceChange(req: Request, res: Response, id: number, row: Row) {
    if (!isValidRequestTransition(row.status, "done")) return res.status(400).json({ message: "Request is already closed" });
    const parsed = z.object({ startDate: isoDate, durationDays: z.number().int().min(1).max(60).optional(), note: z.string().trim().max(2000).optional() }).safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "startDate is required", field: "startDate" });
    const b = parsed.data;
    const before = row.reservationId ? await storage.getReservation(row.reservationId) : undefined;
    if (!before || before.type !== "maintenance_block" || before.deletedAt) return res.status(400).json({ message: "Maintenance block not found" });
    if (before.maintenanceStatus !== "scheduled") return res.status(409).json({ message: "Het onderhoud is al gestart" });
    const days = b.durationDays ?? before.maintenanceDuration ?? 1;
    const endDate = addDays(b.startDate, days - 1);
    const after = (await storage.updateReservation(before.id, { startDate: b.startDate, endDate, maintenanceDuration: days, updatedBy: actor(req) } as any))!;
    const p = row.payload as Record<string, unknown>;
    const rentalId = before.affectedRentalId;
    if (rentalId) {
      const [placeholder] = await db.select().from(reservations).where(and(eq(reservations.replacementForReservationId, rentalId), eq(reservations.placeholderSpare, true), isNull(reservations.deletedAt))).limit(1);
      if (placeholder) await storage.updateReservation(placeholder.id, { startDate: b.startDate, endDate, updatedBy: actor(req) } as any);
      else if (p.needsReplacement) {
        const rental = await storage.getReservation(rentalId);
        if (rental?.customerId) await storage.createPlaceholderReservation(rental.id, rental.customerId, b.startDate, endDate);
      }
    }
    realtimeEvents.reservations.updated(after);
    await onMaintenanceBlockChanged(before, after);
    await AuditLogger.logFromRequest(req, "reservation.update", "reservation", after.id, { viaPortalRequest: id, startDate: b.startDate, endDate });
    const reply = `Verplaatst naar ${b.startDate}${days > 1 ? ` tot en met ${endDate}` : ""}.${b.note ? ` ${b.note}` : ""}`;
    const updated = await finish(req, id, reply, "done", row.customerId);
    res.json({ ...updated, block: after });
  }
```

Check `createPlaceholderReservation` for a duplicate guard that throws (it checks "duplicate placeholder"); wrap the call in `try/catch` and log when it throws because a placeholder exists already.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run server/__tests__/portal-requests-routes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routes/portal-requests.ts server/__tests__/portal-requests-routes.test.ts
git commit -m "feat(portal-admin): approve maintenance reports into calendar blocks; move blocks on change requests"
```

---

### Task 7: Dashboard count and calendar back-link

**Files:**
- Modify: `server/services/portal-dashboard.ts` (counts, around line 85)
- Modify: `client/src/components/portal-admin/dashboard-panels.tsx` (SectionKind, icons, tiles, lines 94-140)
- Modify: `client/src/components/portal-admin/portal-list-dialog.tsx` (requests list gets a `types` filter) and `client/src/contexts/GlobalDialogContext.tsx` (`openPortalListDialog` options)
- Modify: `client/src/components/maintenance/maintenance-view-dialog.tsx`

**Interfaces:**
- Consumes: `counts.maintenance` from Task 1.
- Produces: `openPortalListDialog("requests", { types: ["maintenance", "maintenance_change"] })`.

- [ ] **Step 1: Count**

In `server/services/portal-dashboard.ts`, where `openRequests` is available, compute:

```ts
  const [placeholdersFromPortal] = await db.select({ n: sql<number>`count(*)::int` }).from(reservations)
    .where(and(eq(reservations.type, "replacement"), eq(reservations.placeholderSpare, true), isNull(reservations.deletedAt),
      sql`exists (select 1 from reservations b where b.affected_rental_id = ${reservations.replacementForReservationId} and b.portal_request_id is not null and b.deleted_at is null and b.maintenance_status is distinct from 'out')`));
```

and set `maintenance: openRequests.filter((r) => r.type === "maintenance" || r.type === "maintenance_change").length + (placeholdersFromPortal?.n ?? 0)`. Add the needed imports (`db`, `reservations`, `and`, `eq`, `isNull`, `sql`) if the file does not have them.

- [ ] **Step 2: Tile**

In `dashboard-panels.tsx`: add `"maintenance"` to `SectionKind`, `maintenance: <Wrench className="h-5 w-5" />` to `SECTION_ICON` (import `Wrench` from lucide-react), `maintenance: "bg-orange-100 text-orange-800"` to `SECTION_TONE`. In `DashboardTiles`, after the requests tile:

```tsx
      <SectionTile kind="maintenance" value={counts.maintenance} alert={counts.maintenance > 0} sub={t("admin.dashboard.tiles.maintenanceSub")}
        onClick={() => openPortalListDialog("requests", { types: ["maintenance", "maintenance_change"] })} />
```

In `GlobalDialogContext.tsx` extend the options type of `openPortalListDialog` with `types?: string[]` and pass it through to `PortalListDialog`; in `portal-list-dialog.tsx` when `kind === "requests"` and `types` is set, filter the rows on `types.includes(r.type)` and show the type filter preselected. Read both files first to follow the existing `plate` option pattern exactly.

- [ ] **Step 3: Calendar back-link**

In `maintenance-view-dialog.tsx`, where the block's details are rendered (notes/category), add when `reservation.portalRequestId`:

```tsx
{reservation.portalRequestId && (
  <button type="button" className="text-sm text-primary underline" onClick={() => openPortalRequestDialog(reservation.portalRequestId!)} data-testid="link-portal-request">
    {tp("admin.maintenance.fromPortal", { id: reservation.portalRequestId })}
  </button>
)}
```

with `const { openPortalRequestDialog } = useGlobalDialog();` and `const { t: tp } = useTranslation("portal");`. Check that `Reservation` type now has `portalRequestId` (from Task 1).

- [ ] **Step 4: Typecheck and look**

Run: `npx tsc --noEmit -p tsconfig.json`. Expected: clean.
Restart the dev server, open `/portal-admin`: tile "Onderhoud" present; click opens the requests list filtered.

- [ ] **Step 5: Commit**

```bash
git add server/services/portal-dashboard.ts client/src/components/portal-admin/dashboard-panels.tsx client/src/components/portal-admin/portal-list-dialog.tsx client/src/contexts/GlobalDialogContext.tsx client/src/components/maintenance/maintenance-view-dialog.tsx
git commit -m "feat(portal-admin): maintenance tile on the dashboard; calendar shows the portal request behind a block"
```

---

### Task 8: Staff approval UI

**Files:**
- Create: `client/src/components/portal-admin/maintenance-approval.tsx`
- Modify: `client/src/components/portal-admin/portal-request-dialog.tsx` (lines ~112-135)

**Interfaces:**
- Consumes: approve bodies from Task 6; `PeriodPicker` (`client/src/components/portal/period-picker.tsx`, single day = start only).
- Produces: `MaintenanceApproval({ request, onApproved })`, `MaintenanceSummary({ request })`.

- [ ] **Step 1: Component**

Create `client/src/components/portal-admin/maintenance-approval.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Wrench, CalendarClock } from "lucide-react";
import type { PortalRequestDto } from "@shared/portal-requests";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { PeriodPicker } from "@/components/portal/period-picker";

const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };

/** What the customer filled in, for both maintenance and maintenance_change requests. */
export function MaintenanceSummary({ request: r, blockDate }: { request: PortalRequestDto; blockDate?: string | null }) {
  const { t } = useTranslation("portal");
  const p = r.payload as Record<string, unknown>;
  const row = (label: string, value: unknown) => value === undefined || value === null || value === "" ? null : <div className="grid gap-0.5 sm:grid-cols-3"><dt className="text-muted-foreground">{label}</dt><dd className="sm:col-span-2">{String(value)}</dd></div>;
  return (
    <dl className="space-y-1 rounded-md border bg-muted/30 p-3 text-sm" data-testid="maintenance-summary">
      <div className="mb-1 font-medium">{t("admin.maintenance.summary")}</div>
      {r.type === "maintenance" ? (<>
        {row(t("admin.maintenance.issue"), p.issue)}
        {row(t("admin.maintenance.mileage"), p.mileage)}
        {row(t("admin.maintenance.urgent"), p.urgent ? t("requests.form.yes") : null)}
        {row(t("admin.maintenance.wantsReplacement"), p.needsReplacement ? t("requests.form.yes") : null)}
        {row(t("admin.maintenance.preferredDate"), p.preferredDate)}
      </>) : (<>
        {row(t("admin.maintenance.currentDate"), blockDate)}
        {row(t("admin.maintenance.requestedDate"), p.newDate)}
        {row(t("admin.maintenance.reason"), p.reason)}
        {row(t("admin.maintenance.wantsReplacement"), p.needsReplacement ? t("requests.form.yes") : null)}
      </>)}
    </dl>
  );
}

/** Staff put the reported maintenance in the calendar, or move an existing block. */
export function MaintenanceApproval({ request: r, onApproved }: { request: PortalRequestDto; onApproved: (blockId: number) => void }) {
  const { t } = useTranslation("portal");
  const { toast } = useToast();
  const p = r.payload as Record<string, string | undefined>;
  const isChange = r.type === "maintenance_change";
  const [startDate, setStartDate] = useState((isChange ? p.newDate : p.preferredDate) || tomorrow());
  const [days, setDays] = useState(1);
  const [category, setCategory] = useState<"scheduled_maintenance" | "repair">(p.urgent ? "repair" : "scheduled_maintenance");
  const [note, setNote] = useState("");
  useEffect(() => { setStartDate((isChange ? p.newDate : p.preferredDate) || tomorrow()); setDays(1); setNote(""); }, [r.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const approve = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/portal-requests/${r.id}/approve`, isChange
      ? { startDate, durationDays: days, note: note.trim() || undefined }
      : { startDate, durationDays: days, category, note: note.trim() || undefined })).json(),
    onSuccess: (data: { block: { id: number } }) => { toast({ title: t(isChange ? "admin.maintenance.moved" : "admin.maintenance.created", { id: data.block.id }) }); onApproved(data.block.id); },
    onError: (e: Error) => toast({ title: e.message.replace(/^\d+:\s*/, ""), variant: "destructive" }),
  });

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3" data-testid="maintenance-approval">
      <div className="flex items-center gap-2 font-medium">{isChange ? <CalendarClock className="h-4 w-4" /> : <Wrench className="h-4 w-4" />}{t(isChange ? "admin.maintenance.moveTitle" : "admin.maintenance.title")}</div>
      <div className="grid gap-2 md:grid-cols-3">
        <div><Label htmlFor="ma-date">{t("admin.maintenance.date")}</Label><PeriodPicker id="ma-date" start={startDate} end="" single onChange={(s) => setStartDate(s)} testId="maintenance-date" /></div>
        <div><Label htmlFor="ma-days">{t("admin.maintenance.duration")}</Label><Input id="ma-days" type="number" min={1} max={60} value={days} onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))} data-testid="input-maintenance-days" /></div>
        {!isChange && (
          <div><Label htmlFor="ma-cat">{t("admin.maintenance.category")}</Label>
            <select id="ma-cat" className="w-full rounded-md border px-3 py-2 text-sm" value={category} onChange={(e) => setCategory(e.target.value as "scheduled_maintenance" | "repair")} data-testid="select-maintenance-category">
              <option value="scheduled_maintenance">{t("admin.maintenance.categoryService")}</option>
              <option value="repair">{t("admin.maintenance.categoryRepair")}</option>
            </select>
          </div>
        )}
      </div>
      {p.needsReplacement && <p className="text-xs text-amber-900">{t("admin.maintenance.placeholderNote")}</p>}
      <div><Label htmlFor="ma-note">{t("admin.maintenance.note")}</Label><Textarea id="ma-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></div>
      <Button size="sm" disabled={approve.isPending || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)} onClick={() => approve.mutate()} data-testid="button-approve-maintenance">{t(isChange ? "admin.maintenance.move" : "admin.maintenance.approve")}</Button>
    </div>
  );
}
```

`PeriodPicker` needs a `single` prop (one day, no end): read `client/src/components/portal/period-picker.tsx`; if it has no such mode, add `single?: boolean` that renders the calendar in `mode="single"` and calls `onChange(day, "")`. Keep existing callers untouched.

- [ ] **Step 2: Dialog wiring**

In `portal-request-dialog.tsx`:

- Import `{ MaintenanceApproval, MaintenanceSummary }`.
- Where the request details are rendered (above the thread), add `{(r.type === "maintenance" || r.type === "maintenance_change") && <MaintenanceSummary request={r} blockDate={r.reservationLabel} />}`. Check what `reservationLabel` holds for a block in `toRequestDto` (`server/services/portal-requests-storage.ts`); if it is empty for blocks, extend `toRequestDto` to label a maintenance block as `Onderhoud {plate} {startDate}`.
- Below the booking approval line add:

```tsx
            {canManage && isOpen && (r.type === "maintenance" || r.type === "maintenance_change") && !approving && (
              <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">{t("admin.maintenance.closeHint")}</p>
            )}
            {canManage && isOpen && (r.type === "maintenance" || r.type === "maintenance_change") && approving && (
              <MaintenanceApproval request={r} onApproved={() => { done(); setApproving(false); }} />
            )}
```

- In the button row, extend the booking "open" button condition to `(r.type === "booking" || r.type === "maintenance" || r.type === "maintenance_change") && !approving`, with label `t(r.type === "booking" ? "admin.booking.open" : r.type === "maintenance" ? "admin.maintenance.title" : "admin.maintenance.moveTitle")`.
- The "answer" (done) button: hide it for `maintenance` (the guard would reject it); keep "Alleen antwoorden" (in_progress) like booking does, and keep reject.

- [ ] **Step 3: Verify in the browser**

Restart the dev server. As customer 179 create a maintenance report on a car in use with the replacement checkbox on (Task 9 form; until then use the existing form and set `needsReplacement` through the API with curl or the test). In `/portal-admin` open the request: summary shows issue and replacement wish; "Inplannen in de onderhoudskalender" opens the block; approve with tomorrow, 2 days, reparatie. Expect: toast "Onderhoud #… staat in de kalender", request done, `/maintenance` shows the block with the placeholder spare needing a car, portal bell shows "Onderhoud gepland".

- [ ] **Step 4: Commit**

```bash
git add client/src/components/portal-admin/maintenance-approval.tsx client/src/components/portal-admin/portal-request-dialog.tsx client/src/components/portal/period-picker.tsx server/services/portal-requests-storage.ts
git commit -m "feat(portal-admin): schedule and move maintenance from the request dialog"
```

---

### Task 9: Customer request forms

**Files:**
- Modify: `client/src/components/portal/request-form.tsx`
- Modify: `client/src/hooks/use-portal-dialogs.tsx` (`NewRequestPrefill`)
- Modify: `client/src/components/portal/new-request-dialog.tsx` (key includes blockId)

**Interfaces:**
- Produces: `NewRequestPrefill.blockId?: number` and `NewRequestPrefill.blockDate?: string`; `RequestForm` props `blockId`, `blockDate`.

- [ ] **Step 1: Prefill type**

In `use-portal-dialogs.tsx`:

```ts
export interface NewRequestPrefill { type?: PortalRequestTypeValue; reservationId?: number; fineId?: number; vehicleId?: number; startDate?: string; endDate?: string; blockId?: number; blockDate?: string }
```

In `new-request-dialog.tsx` pass `blockId={prefill.blockId} blockDate={prefill.blockDate}` to `RequestForm` and add `${prefill.blockId ?? ""}` to the `key`.

- [ ] **Step 2: Form**

In `request-form.tsx`:

- Props: add `blockId?: number; blockDate?: string`.
- `reservationId` initial: `initialReservation ? String(initialReservation) : blockId ? String(blockId) : ""`.
- Type select: hide `maintenance_change` unless `type === "maintenance_change"` (it is only reachable from the "Onderhoud wijzigen" button): filter `.filter((v) => v !== "maintenance_change" || type === "maintenance_change")`.
- Reservation picker: when `type === "maintenance_change"` do not render `ReservationPicker`; instead render a read-only line:

```tsx
      {type === "maintenance_change" && (
        <div className="rounded-md border bg-[#f8fafc] px-3 py-2 text-sm" data-testid="change-current-date">
          <span className="text-[#64748b]">{t("requests.form.currentMaintenanceDate")}: </span>{blockDate ? formatPortalDate(blockDate) : `#${blockId}`}
        </div>
      )}
```

  and keep `{needs === "reservation" && type !== "maintenance_change" && (...ReservationPicker...)}`.
- Maintenance section: add under the mileage/urgent grid:

```tsx
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={payload.needsReplacement === "true"} onChange={(e) => setPayload({ ...payload, needsReplacement: e.target.checked ? "true" : "" })} data-testid="checkbox-needs-replacement" />{t("requests.form.needsReplacement")}</label>
          <div>
            <Label htmlFor="rq-pref">{t("requests.form.preferredDate")}</Label>
            <PeriodPicker id="rq-pref" start={payload.preferredDate ?? ""} end="" single minDate={tomorrowIso()} onChange={(s) => setPayload({ ...payload, preferredDate: s })} testId="request-preferred-date" />
          </div>
```

- New section for `maintenance_change`:

```tsx
      {type === "maintenance_change" && (
        <div className="space-y-2">
          <div>
            <Label htmlFor="rq-newdate">{t("requests.form.newDate")}</Label>
            <PeriodPicker id="rq-newdate" start={payload.newDate ?? ""} end="" single minDate={tomorrowIso()} onChange={(s) => setPayload({ ...payload, newDate: s })} testId="request-new-date" />
          </div>
          <div><Label htmlFor="rq-reason">{t("requests.form.reason")}</Label><Input id="rq-reason" value={payload.reason ?? ""} onChange={setP("reason")} required data-testid="input-change-reason" /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={payload.needsReplacement === "true"} onChange={(e) => setPayload({ ...payload, needsReplacement: e.target.checked ? "true" : "" })} />{t("requests.form.stillNeedsReplacement")}</label>
          <p className="text-xs text-[#64748b]">{t("requests.form.changeHint")}</p>
        </div>
      )}
```

- Submit guard: for `maintenance_change` require `payload.newDate` (toast `t("requests.form.newDate")` when missing).
- Add `const tomorrowIso = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };` and import `formatPortalDate` from `./reservation-card`.
- `PeriodPicker` needs `minDate?: string` besides `single` (Task 8); add it to the component so days before it are disabled.

- [ ] **Step 3: Verify**

Open the portal overview, "Onderhoud melden": checkbox and preferred date visible; submit with the checkbox on; the request detail shows the fields (the request dialog lists payload entries; check `request-dialog.tsx` renders `needsReplacement`/`preferredDate` labels via `t("requests.form.*")`, add the two labels to its field map if it has one).

- [ ] **Step 4: Commit**

```bash
git add client/src/components/portal/request-form.tsx client/src/hooks/use-portal-dialogs.tsx client/src/components/portal/new-request-dialog.tsx client/src/components/portal/period-picker.tsx client/src/components/portal/request-dialog.tsx
git commit -m "feat(portal): replacement wish and preferred date on maintenance reports; maintenance change form"
```

---

### Task 10: Vehicles page, vehicle card and reservation dialog

**Files:**
- Create: `client/src/components/portal/vehicle-card.tsx`
- Create: `client/src/pages/portal/vehicles.tsx`
- Modify: `client/src/pages/portal/index.tsx` (route), `client/src/layouts/PortalLayout.tsx` (tab), `client/src/components/portal/reservation-dialog.tsx`, `client/src/components/portal/notifications-bell.tsx`, `client/src/components/portal/list-dialog.tsx` (kind `vehicles`)

**Interfaces:**
- Consumes: `PortalMyVehicleDto` (Task 1), `GET /api/portal/vehicles/mine` (Task 4), `openNewRequest({ type: "maintenance_change", blockId, blockDate })` (Task 9).
- Produces: `VehicleCard({ item })`, `MaintenanceLine({ maintenance, serviceDue, reservationId, canRequest })`.

- [ ] **Step 1: Card and maintenance line**

Create `client/src/components/portal/vehicle-card.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { CalendarDays, Gauge, ShieldAlert, Wrench, TriangleAlert, Phone } from "lucide-react";
import type { PortalMyVehicleDto, PortalVehicleMaintenanceDto } from "@shared/portal-types";
import { Button } from "@/components/ui/button";
import { usePortalAuth } from "@/hooks/use-portal-auth";
import { usePortalDialogs } from "@/hooks/use-portal-dialogs";
import { formatLicensePlate } from "@/lib/format-utils";
import { DriverChip, Plate, daysUntil } from "./ui";
import { formatPortalDate } from "./reservation-card";

/** "Onderhoud gepland op …" plus the change button or the 48-hour phone hint; shared by the card and the reservation dialog. */
export function MaintenanceLine({ maintenance: m, serviceDue, canRequest }: { maintenance: PortalVehicleMaintenanceDto | null; serviceDue: "due" | "soon" | null; canRequest: boolean }) {
  const { t } = useTranslation("portal");
  const { me } = usePortalAuth();
  const { openNewRequest, openRequest } = usePortalDialogs();
  if (!m && !serviceDue) return null;
  const tone = m?.status === "out" ? "border-[#c8ebdc] bg-[#e1f5ee] text-[#085041]" : m || serviceDue === "soon" ? "border-[#f4d7a8] bg-[#faeeda] text-[#633806]" : "border-[#f3c1c1] bg-[#fcebeb] text-[#791f1f]";
  const text = m
    ? m.status === "in" ? t("vehicles.maintenanceIn", { date: formatPortalDate(m.startDate) })
      : m.status === "out" ? t("vehicles.maintenanceOut", { date: formatPortalDate(m.endDate ?? m.startDate) })
      : t("vehicles.maintenanceScheduled", { date: formatPortalDate(m.startDate) })
    : t(serviceDue === "due" ? "vehicles.serviceDue" : "vehicles.serviceSoon");
  return (
    <div className={`rounded-xl border p-3 text-sm ${tone}`} data-testid="maintenance-line">
      <div className="flex items-start gap-2"><Wrench className="mt-0.5 h-4 w-4 shrink-0" /><span>{text}</span></div>
      {m?.replacement && <div className="mt-1 pl-6 text-xs">{t("vehicles.replacement", { car: `${formatLicensePlate(m.replacement.licensePlate)} ${m.replacement.brand} ${m.replacement.model}` })}</div>}
      {m && m.status === "scheduled" && canRequest && (
        <div className="mt-2 pl-6">
          {m.openChangeRequestId
            ? <button type="button" className="text-xs underline" onClick={() => openRequest(m.openChangeRequestId!)}>{t("vehicles.changePending", { id: m.openChangeRequestId })}</button>
            : m.canRequestChange
              ? <Button size="sm" variant="outline" onClick={() => openNewRequest({ type: "maintenance_change", blockId: m.blockId, blockDate: m.startDate })} data-testid="button-change-maintenance"><CalendarDays className="mr-1 h-4 w-4" />{t("vehicles.changeMaintenance")}</Button>
              : <span className="inline-flex items-center gap-1 text-xs"><Phone className="h-3.5 w-3.5" />{t("vehicles.changeTooLate", { phone: me?.info.phone ?? "" })}</span>}
        </div>
      )}
    </div>
  );
}

/** One vehicle the customer has on the road. */
export function VehicleCard({ item }: { item: PortalMyVehicleDto }) {
  const { t } = useTranslation("portal");
  const { me } = usePortalAuth();
  const { openReservation, openNewRequest, openRequest } = usePortalDialogs();
  const canRequest = Boolean(me?.settings.canSubmitRequests);
  const apkIn = daysUntil(item.vehicle.apkDate);
  const apkTone = apkIn === null ? "text-[#64748b]" : apkIn < 0 ? "text-[#a32d2d]" : apkIn <= 30 ? "text-[#8a5a0b]" : "text-[#085041]";
  const apkText = item.vehicle.apkDate
    ? apkIn !== null && apkIn < 0 ? t("vehicles.apkExpired", { date: formatPortalDate(item.vehicle.apkDate) })
      : apkIn !== null && apkIn <= 30 ? t("vehicles.apkSoon", { date: formatPortalDate(item.vehicle.apkDate) })
      : `${t("vehicles.apk")} ${formatPortalDate(item.vehicle.apkDate)}`
    : null;
  return (
    <article className="rounded-2xl border border-[#e6e8f0] bg-white p-4 shadow-sm" data-testid={`vehicle-card-${item.vehicle.id}`}>
      <button type="button" className="flex w-full items-start justify-between gap-3 text-left" onClick={() => openReservation(item.reservationId)}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><Plate value={item.vehicle.licensePlate} /><span className="font-semibold text-[#1a1d62]">{item.vehicle.brand} {item.vehicle.model}</span></div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#64748b]">
            <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{formatPortalDate(item.startDate)} – {item.endDate ? formatPortalDate(item.endDate) : t("overview.openEnded")}</span>
            <DriverChip name={item.driver?.displayName} />
          </div>
        </div>
      </button>
      <dl className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
        {apkText && <div className={`inline-flex items-center gap-1.5 ${apkTone}`}><ShieldAlert className="h-4 w-4" />{apkText}</div>}
        <div className="inline-flex items-center gap-1.5 text-[#334155]"><Gauge className="h-4 w-4" />{item.lastReportedMileage ? t("vehicles.mileageAt", { value: item.lastReportedMileage.value.toLocaleString("nl-NL"), date: formatPortalDate(item.lastReportedMileage.at.slice(0, 10)) }) : t("vehicles.noMileage")}</div>
      </dl>
      <div className="mt-3"><MaintenanceLine maintenance={item.maintenance} serviceDue={item.serviceDue} canRequest={canRequest} /></div>
      {canRequest && (
        <div className="mt-3 flex flex-wrap gap-2">
          {item.openMaintenanceRequestId
            ? <Button size="sm" variant="outline" onClick={() => openRequest(item.openMaintenanceRequestId!)} data-testid="button-view-maintenance-request"><Wrench className="mr-1 h-4 w-4" />{t("vehicles.requestPending", { id: item.openMaintenanceRequestId })}</Button>
            : <Button size="sm" variant="outline" onClick={() => openNewRequest({ type: "maintenance", reservationId: item.reservationId })} data-testid="button-report-maintenance"><Wrench className="mr-1 h-4 w-4" />{t("requests.form.reportMaintenance")}</Button>}
          <Button size="sm" variant="outline" onClick={() => openNewRequest({ type: "damage", reservationId: item.reservationId })} data-testid="button-report-damage"><TriangleAlert className="mr-1 h-4 w-4" />{t("requests.type.damage")}</Button>
          <Button size="sm" variant="outline" onClick={() => openNewRequest({ type: "mileage", reservationId: item.reservationId })} data-testid="button-report-mileage"><Gauge className="mr-1 h-4 w-4" />{t("requests.form.reportMileage")}</Button>
        </div>
      )}
    </article>
  );
}
```

`daysUntil` lives in `ui.tsx` (confirmed). `Plate` and `DriverChip` exist there too.

- [ ] **Step 2: Page**

Create `client/src/pages/portal/vehicles.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { Car } from "lucide-react";
import type { PortalMyVehicleDto } from "@shared/portal-types";
import { portalQueryFn } from "@/lib/portal-api";
import { usePortalDialogs } from "@/hooks/use-portal-dialogs";
import { VehicleCard } from "@/components/portal/vehicle-card";
import { EmptyState, MoreFooter, SearchBox, Section, usePortalSearch } from "@/components/portal/ui";

const ROWS = 5;

/** The customer's vehicles on the road; ?block=<id> (from a notification) puts that vehicle first. */
export default function PortalVehiclesPage() {
  const { t } = useTranslation("portal");
  const { openList } = usePortalDialogs();
  const focusBlock = Number(new URLSearchParams(useSearch()).get("block") ?? 0);
  const { data: items = [], isLoading } = useQuery<PortalMyVehicleDto[]>({ queryKey: ["portal", "/api/portal/vehicles/mine"], queryFn: portalQueryFn });
  const { query, setQuery, hit } = usePortalSearch();
  const list = items
    .filter((v) => hit(v.vehicle.licensePlate, v.vehicle.brand, v.vehicle.model, v.driver?.displayName))
    .sort((a, b) => Number(b.maintenance?.blockId === focusBlock) - Number(a.maintenance?.blockId === focusBlock));
  return (
    <div className="space-y-4" data-testid="portal-vehicles">
      <Section title={t("vehicles.mine")} count={items.length}>
        {items.length > 1 && <div className="mb-3"><SearchBox value={query} onChange={setQuery} placeholder={t("vehicles.search")} testId="vehicles-search" /></div>}
        {!isLoading && list.length === 0
          ? <EmptyState icon={<Car className="h-6 w-6" />} text={t("vehicles.none")} />
          : <div className="space-y-3">{list.slice(0, query ? list.length : ROWS).map((v) => <VehicleCard key={v.reservationId} item={v} />)}</div>}
        {!query && list.length > ROWS && <MoreFooter shown={ROWS} total={list.length} onMore={() => openList("vehicles")} testId="more-vehicles" />}
      </Section>
    </div>
  );
}
```

Add `"vehicles"` to `PortalListKind` in `list-dialog.tsx` and render the same cards there (query `/api/portal/vehicles/mine`, search with `hit`, icon `Car`), following the existing `current` branch.

- [ ] **Step 3: Route and tab**

`client/src/pages/portal/index.tsx`: import `PortalVehiclesPage` and add `<Route path="/voertuigen" component={PortalVehiclesPage} />` above `/reserveringen`.
`client/src/layouts/PortalLayout.tsx`: add after the reservations tab `{ href: "/voertuigen", key: "tabs.vehicles", show: true, icon: <Car className="h-4 w-4" /> }` (import `Car`). The bottom nav shows the first four tabs; check `visible.slice(0, 4)` logic and decide with the existing order: Overzicht, Reserveringen, Voertuigen, Contracten; the rest under "Meer".

- [ ] **Step 4: Reservation dialog**

In `reservation-dialog.tsx`: the detail route does not know about blocks, so fetch the vehicles list when the reservation is `picked_up`:

```tsx
  const { data: mine = [] } = useQuery<PortalMyVehicleDto[]>({ queryKey: ["portal", "/api/portal/vehicles/mine"], queryFn: portalQueryFn, enabled: r?.status === "picked_up" });
  const myVehicle = mine.find((v) => v.reservationId === id);
```

Replace the existing `r.serviceDue` warning line with `<MaintenanceLine maintenance={myVehicle?.maintenance ?? null} serviceDue={r.serviceDue ?? null} canRequest={canRequest} />` inside the same warnings block (keep the APK warning as it is).

- [ ] **Step 5: Bell icons**

In `notifications-bell.tsx` `iconFor`: add `if (type.startsWith("maintenance")) return <Wrench className="h-4 w-4" />; if (type === "replacement_ready") return <Car className="h-4 w-4" />;` (import `Car`). `toneFor`: `maintenance_cancelled` red, other `maintenance_*` amber, `maintenance_out` and `replacement_ready` green (`bg-[#e1f5ee] text-[#085041]`). Notification links `/voertuigen?block=…` already work through the existing link handling (check the bell navigates with wouter `navigate(n.link)`).

- [ ] **Step 6: Verify in the browser**

Restart the dev server, log in as customer 179, open Voertuigen: cards for the cars in use with APK line, mileage line, buttons. Create a block in the staff calendar for one of them: after reload the card shows "Onderhoud gepland op …" and the "Onderhoud wijzigen" button when the block is more than 48 hours away, the phone hint otherwise. Click "Onderhoud wijzigen": the dialog opens on the change form with the current date shown. Check at 375px (`resize_window` mobile): tab order and card layout. Take screenshots for the report.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/portal/vehicle-card.tsx client/src/pages/portal/vehicles.tsx client/src/pages/portal/index.tsx client/src/layouts/PortalLayout.tsx client/src/components/portal/reservation-dialog.tsx client/src/components/portal/notifications-bell.tsx client/src/components/portal/list-dialog.tsx
git commit -m "feat(portal): vehicles page with maintenance state, change button and 48-hour hint"
```

---

### Task 11: Portal config phone field, docs, full test run, cleanup

**Files:**
- Modify: `client/src/components/portal-admin/portal-config-form.tsx`
- Modify: `docs/portal-wordpress-embed.md` (section on notifications and maintenance)
- Modify: memory note `customer-portal-project-2026-09-02.md` (build status)

- [ ] **Step 1: Config form**

Add a text input for `phone` next to `privacyUrl` in `portal-config-form.tsx`, label `t("admin.config.phone")`, following the existing field pattern (state, default from `DEFAULT_PORTAL_CONFIG`, PATCH body).

- [ ] **Step 2: Full suite**

Run: `npx vitest run`
Expected: all files pass (previous 24 files + 2 new). Fix any parallel-run collisions by scoping assertions on ids the test created.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: clean.

- [ ] **Step 4: Clean test data from the browser checks**

Delete the blocks, placeholders and requests made during manual verification (customer 179): use the staff UI (calendar delete, request reject) or a single SQL statement listing the ids seen during verification. Remove maintenance notifications created for customer 179 during testing:

```bash
node -r dotenv/config -e "const {Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query(\"delete from portal_notifications where customer_id=179 and (type like 'maintenance_%' or type='replacement_ready')\").then(r=>{console.log(r.rowCount);p.end()})"
```

- [ ] **Step 5: Docs and memory**

In `docs/portal-wordpress-embed.md` add a short section "Onderhoud via het portaal": what the customer sees, the 48-hour rule, what staff do, which notifications and the mail template name. Update the memory note's build status line.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/portal-admin/portal-config-form.tsx docs/portal-wordpress-embed.md
git commit -m "feat(portal): phone number in portal config; docs for maintenance via the portal"
```

Report to Kees: what was built per spec section, screenshots (desktop + 375px), test counts, and that `main` was not touched.
