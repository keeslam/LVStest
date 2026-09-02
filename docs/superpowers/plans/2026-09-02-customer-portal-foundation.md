# Customer Portal Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Business customers log in to a portal embedded in the Lam Groep website, see their reservations and contracts, manage their drivers and who drives which car, while staff manage every account, switch features per customer, and flag which vehicles are offered online.

**Architecture:** The portal is a second, isolated authentication realm inside this Express + React app: its own `portal_users` table, its own Passport instance, its own session cookie and CSRF cookie, mounted on `/api/portal`. The staff session/passport/CSRF stack is skipped for portal paths so the two never share `req.session`. Portal routes are registered in `server/index.ts` *before* `registerRoutes(app)` so the staff audit middleware never sees them; the portal has its own activity log. Portal React pages live under `/portaal/*` in a minimal `PortalLayout` and talk to the API through a dedicated fetch wrapper that never triggers the staff session-expiry handler. Staff-side management is an extra tab in the customer dialog, a new `/portal-admin` page and a settings tab.

**Tech Stack:** TypeScript, Express 4, Passport (`passport.Passport` second instance), express-session + connect-pg-simple, Drizzle ORM (Postgres), zod, nodemailer via the existing `sendEmail`, React 18, wouter 3, TanStack Query 5, shadcn/ui, react-i18next, vitest + supertest (new).

**Spec:** `docs/superpowers/specs/2026-09-02-customer-portal-foundation-design.md`

## Global Constraints

- Portal user roles are exactly `admin` and `driver` (spec: "Multiple logins per customer, with roles").
- Password minimum length for portal users: 10 characters (spec: "min 10 chars").
- Invitation / reset tokens expire 72 hours after sending (spec).
- Portal session cookie is named `portal.sid` with `sameSite: 'lax'`; the staff cookie stays `sameSite: 'strict'` (spec).
- Portal CSRF cookie is `PORTAL-XSRF-TOKEN`, `sameSite: 'lax'`; staff keeps `XSRF-TOKEN` strict.
- `Content-Security-Policy: frame-ancestors …` and *no* `X-Frame-Options` on paths starting with `/portaal` or `/api/portal`; every other path keeps `SAMEORIGIN` (spec).
- Default allowed frame origins: `https://lamgroep.nl`, `https://www.lamgroep.nl` (spec).
- A disabled feature switch returns HTTP 403 with `code: 'PORTAL_FEATURE_DISABLED'`; a document/reservation/driver that is not the customer's returns 404, never 403 (spec).
- Portal API errors are `{ error: string, code: string }` (spec).
- Every portal storage method takes `customerId` as a parameter (spec).
- `npm run check` (tsc) must stay at 0 errors after every task.
- Files written by the plan use LF line endings; commits end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Deviation from spec, agreed here: portal storage methods live in `server/services/portal-storage.ts` (exported object `portalStorage`) instead of being added to the 4,400-line `DatabaseStorage`; they still all take `customerId`.

## File Structure

New files:

| File | Responsibility |
|---|---|
| `vitest.config.ts`, `server/__tests__/setup.ts`, `server/__tests__/portal-helpers.ts` | test runner, dotenv loading, test app + fixtures + cleanup |
| `shared/schema.ts` (modify) | new tables, vehicle columns, permissions, `PortalUserRole` |
| `shared/portal-types.ts` | DTO types and error codes shared by server and client |
| `startup-migration.js` (modify) | idempotent DDL + one-off driver-assignment back-fill |
| `server/portal-paths.ts` | `isPortalPath` / `isPortalApiPath` |
| `server/services/portal-config.ts` | `portal_config` app setting with cache |
| `server/middleware/security/csrf.ts` (modify) | factory `createCsrfMiddleware`; existing exports kept |
| `server/middleware/security/headers.ts` (modify) | `portalFrameHeaders` middleware |
| `server/auth.ts` (modify) | skip staff session/passport/csrf for portal paths |
| `server/services/portal-storage.ts` | every portal DB access, all scoped by `customerId` |
| `server/services/driver-assignments.ts` | assignment history + back-fill |
| `server/services/portal-tokens.ts` | invite/reset token generation + hashing |
| `server/services/portal-mail.ts` | invitation/reset mails, template seeding |
| `server/services/portal-notifications.ts` | `notifyStaffOfPortalEvent` |
| `server/portal-auth.ts` | portal session, Passport instance, login/logout/me, `requirePortalUser` |
| `server/routes/portal.ts` | customer-facing API |
| `server/routes/portal-admin.ts` | staff API for accounts, settings, activity, online vehicles, config |
| `server/index.ts` (modify) | mount portal auth + routes before `registerRoutes` |
| `server/routes.ts` (modify) | staff driver change goes through `assignDriverToReservation` |
| `client/src/lib/portal-api.ts` | fetch wrapper for `/api/portal` |
| `client/src/lib/csrf-fetch-interceptor.ts` (modify) | portal CSRF cookie |
| `client/src/hooks/use-portal-auth.tsx` | `PortalAuthProvider`, `usePortalAuth` |
| `client/src/layouts/PortalLayout.tsx` | minimal layout, tabs, iframe height postMessage |
| `client/src/pages/portal/*.tsx` | login, activate, overview, reservations, reservation-detail, documents, drivers, account |
| `client/src/components/portal/*.tsx` | shared portal widgets |
| `client/src/App.tsx` (modify) | `/portaal` route branch |
| `client/src/i18n.ts`, `client/src/locales/{nl,en}/portal.json`, `nav.json` (modify) | translations |
| `client/src/components/customers/customer-portal-tab.tsx` | "Portaal" tab in customer dialog |
| `client/src/components/customers/customer-details.tsx` (modify) | add the tab |
| `client/src/components/portal-admin/*.tsx` | accounts table/dialog, settings form, online vehicles, activity, config form |
| `client/src/pages/portal-admin/index.tsx` | `/portal-admin` page |
| `client/src/components/sidebar-nav.tsx`, `client/src/components/settings/settings-panel.tsx` (modify) | nav item, settings tab |
| `docs/portal-wordpress-embed.md` | WordPress snippet |

---

### Task 1: Test tooling (vitest + supertest)

There are no tests in the repository yet. Every later task writes DB-backed tests, so the runner comes first.

**Files:**
- Modify: `package.json` (devDependencies, `test` script)
- Create: `vitest.config.ts`
- Create: `server/__tests__/setup.ts`
- Create: `server/__tests__/smoke.test.ts`

**Interfaces:**
- Produces: `npm test` runs `vitest run`; tests can `import { db } from "../db"` with `DATABASE_URL` loaded from `.env`.

- [ ] **Step 1: Install dev dependencies**

```bash
npm install --save-dev vitest@^2.1.0 supertest@^7.0.0 @types/supertest@^6.0.2
```

- [ ] **Step 2: Add the test script and vitest config**

In `package.json` scripts add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "shared"),
      "@": path.resolve(__dirname, "client", "src"),
    },
  },
  test: {
    include: ["server/**/*.test.ts", "shared/**/*.test.ts"],
    setupFiles: ["./server/__tests__/setup.ts"],
    // DB-backed tests share one Postgres; run files one after another.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
```

Create `server/__tests__/setup.ts`:

```ts
import dotenv from "dotenv";
dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set (see .env) to run the server tests");
}
process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-session-secret";
```

- [ ] **Step 3: Write a smoke test that touches the database**

Create `server/__tests__/smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { db } from "../db";
import { sql } from "drizzle-orm";

describe("test database", () => {
  it("answers a trivial query", async () => {
    const result = await db.execute(sql`select 1 as one`);
    expect(result.rows[0]).toEqual({ one: 1 });
  });
});
```

- [ ] **Step 4: Run it**

Run: `npm test`
Expected: `1 passed`. If the DB is unreachable the setup file throws with a clear message; fix the environment before continuing.

- [ ] **Step 5: Confirm tsc still ignores tests**

Run: `npm run check`
Expected: no output (0 errors). `tsconfig.json` already excludes `**/*.test.ts`; `server/__tests__/setup.ts` is plain TS and type-checks.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts server/__tests__/setup.ts server/__tests__/smoke.test.ts
git commit -m "chore: add vitest and supertest with a database smoke test"
```

---

### Task 2: Schema, shared types and startup migration

**Files:**
- Modify: `shared/schema.ts` (after the `drivers` block ~line 407, vehicles table ~line 250, `UserPermission` ~line 86)
- Create: `shared/portal-types.ts`
- Modify: `startup-migration.js` (inside `runMigrations()`, before its final log line)
- Test: `shared/portal-schema.test.ts`

**Interfaces:**
- Produces (schema): tables `portalUsers`, `portalCustomerSettings`, `reservationDriverAssignments`, `portalActivityLog`; types `PortalUser`, `InsertPortalUser`, `PortalCustomerSettings`, `InsertPortalCustomerSettings`, `ReservationDriverAssignment`, `InsertReservationDriverAssignment`, `PortalActivityLogEntry`, `InsertPortalActivityLogEntry`; const `PortalUserRole = { ADMIN: 'admin', DRIVER: 'driver' }`; `UserPermission.MANAGE_PORTAL = 'manage_portal'`, `UserPermission.VIEW_PORTAL = 'view_portal'`; vehicle columns `offeredOnline: boolean`, `onlineDescription: text | null`.
- Produces (portal-types): `PortalMe`, `PortalSettingsFlags`, `PortalReservationDto`, `PortalDocumentDto`, `PortalDriverDto`, `PortalConfig`, `DEFAULT_PORTAL_CONFIG`, `PortalErrorCode`, `PORTAL_ERROR`.

- [ ] **Step 1: Write the failing schema test**

Create `shared/portal-schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  insertPortalUserSchema,
  insertPortalCustomerSettingsSchema,
  PortalUserRole,
  UserPermission,
  vehicles,
} from "./schema";
import { getTableColumns } from "drizzle-orm";

describe("portal schema", () => {
  it("accepts a driver-role user only with a driverId", () => {
    const base = { customerId: 1, email: "a@b.nl", fullName: "A", role: PortalUserRole.DRIVER };
    expect(insertPortalUserSchema.safeParse(base).success).toBe(false);
    expect(insertPortalUserSchema.safeParse({ ...base, driverId: 5 }).success).toBe(true);
  });

  it("lower-cases the e-mail", () => {
    const parsed = insertPortalUserSchema.parse({ customerId: 1, email: "Kees@Lam.NL", fullName: "K", role: "admin" });
    expect(parsed.email).toBe("kees@lam.nl");
  });

  it("defaults every customer switch to on", () => {
    const parsed = insertPortalCustomerSettingsSchema.parse({ customerId: 1 });
    expect(parsed.portalEnabled ?? true).toBe(true);
    expect(parsed.canBook ?? true).toBe(true);
  });

  it("adds the portal permissions and vehicle columns", () => {
    expect(UserPermission.MANAGE_PORTAL).toBe("manage_portal");
    expect(UserPermission.VIEW_PORTAL).toBe("view_portal");
    const cols = getTableColumns(vehicles);
    expect(cols.offeredOnline).toBeDefined();
    expect(cols.onlineDescription).toBeDefined();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run shared/portal-schema.test.ts`
Expected: FAIL, `insertPortalUserSchema` is not exported.

- [ ] **Step 3: Add permissions and vehicle columns**

In `shared/schema.ts`, inside `UserPermission` after `MANAGE_NOTIFICATIONS`:

```ts
  // Customer portal (accounts, per-customer switches, online vehicles)
  MANAGE_PORTAL: 'manage_portal',
  VIEW_PORTAL: 'view_portal',
```

In the `vehicles` table, directly after the `barcode` column:

```ts
  // Customer portal: staff flag a vehicle as offered online; the portal's
  // booking flow (part 2) only ever lists vehicles with this on.
  offeredOnline: boolean("offered_online").default(false).notNull(),
  onlineDescription: text("online_description"),
```

- [ ] **Step 4: Add the four portal tables**

In `shared/schema.ts`, after `export type InsertDriver = …` (end of the drivers block) add:

```ts
// ---------------------------------------------------------------------------
// Customer portal
// ---------------------------------------------------------------------------

export const PortalUserRole = {
  ADMIN: 'admin',   // may do everything the customer's switches allow
  DRIVER: 'driver', // tied to one drivers row; sees only their own rentals
} as const;
export type PortalUserRoleValue = typeof PortalUserRole[keyof typeof PortalUserRole];

// Logins for customers. Deliberately NOT in `users`: every staff permission
// check assumes req.user is staff, and one missed check would leak staff data.
export const portalUsers = pgTable("portal_users", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  passwordHash: text("password_hash"), // null until the invitation is accepted
  fullName: text("full_name").notNull(),
  role: text("role").notNull().default(PortalUserRole.ADMIN),
  driverId: integer("driver_id").references(() => drivers.id, { onDelete: "set null" }),
  active: boolean("active").notNull().default(true),
  inviteTokenHash: text("invite_token_hash"),
  inviteExpiresAt: timestamp("invite_expires_at"),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
}, (table) => ({
  emailLowerIdx: uniqueIndex("portal_users_email_lower_idx").on(sql`lower(${table.email})`),
  customerIdx: index("portal_users_customer_id_idx").on(table.customerId),
}));

export const insertPortalUserSchema = createInsertSchema(portalUsers)
  .omit({ id: true, createdAt: true, updatedAt: true, passwordHash: true, inviteTokenHash: true, inviteExpiresAt: true, lastLoginAt: true })
  .extend({
    email: z.string().email().transform((v) => v.trim().toLowerCase()),
    fullName: z.string().trim().min(1),
    role: z.enum([PortalUserRole.ADMIN, PortalUserRole.DRIVER]),
    driverId: z.number().int().positive().nullable().optional(),
  })
  .refine((d) => d.role !== PortalUserRole.DRIVER || (d.driverId != null), {
    message: "A driver account must be linked to a driver",
    path: ["driverId"],
  });

export type PortalUser = typeof portalUsers.$inferSelect;
export type InsertPortalUser = z.infer<typeof insertPortalUserSchema>;

// One row per customer. Staff can switch off any portal feature per customer.
export const portalCustomerSettings = pgTable("portal_customer_settings", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().unique().references(() => customers.id, { onDelete: "cascade" }),
  portalEnabled: boolean("portal_enabled").notNull().default(true),
  canBook: boolean("can_book").notNull().default(true),
  canManageDrivers: boolean("can_manage_drivers").notNull().default(true),
  canSubmitRequests: boolean("can_submit_requests").notNull().default(true),
  canViewFines: boolean("can_view_fines").notNull().default(true),
  canViewContracts: boolean("can_view_contracts").notNull().default(true),
  showPrices: boolean("show_prices").notNull().default(false),
  internalNotes: text("internal_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedBy: text("updated_by"),
});

export const insertPortalCustomerSettingsSchema = createInsertSchema(portalCustomerSettings)
  .omit({ id: true, createdAt: true, updatedAt: true });
export const updatePortalCustomerSettingsSchema = insertPortalCustomerSettingsSchema
  .omit({ customerId: true }).partial();

export type PortalCustomerSettings = typeof portalCustomerSettings.$inferSelect;
export type InsertPortalCustomerSettings = z.infer<typeof insertPortalCustomerSettingsSchema>;

// Who was the driver of a reservation, and when. Exactly one open row
// (assigned_until IS NULL) per reservation. Part 3 (fines) answers
// "who drove plate X at time T" from this table.
export const reservationDriverAssignments = pgTable("reservation_driver_assignments", {
  id: serial("id").primaryKey(),
  reservationId: integer("reservation_id").notNull().references(() => reservations.id, { onDelete: "cascade" }),
  driverId: integer("driver_id").references(() => drivers.id, { onDelete: "set null" }),
  assignedFrom: timestamp("assigned_from").notNull(),
  assignedUntil: timestamp("assigned_until"),
  assignedByPortalUserId: integer("assigned_by_portal_user_id").references(() => portalUsers.id, { onDelete: "set null" }),
  assignedByUserId: integer("assigned_by_user_id").references(() => users.id, { onDelete: "set null" }),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  reservationFromIdx: index("rda_reservation_from_idx").on(table.reservationId, table.assignedFrom),
}));

export const insertReservationDriverAssignmentSchema = createInsertSchema(reservationDriverAssignments)
  .omit({ id: true, createdAt: true });
export type ReservationDriverAssignment = typeof reservationDriverAssignments.$inferSelect;
export type InsertReservationDriverAssignment = z.infer<typeof insertReservationDriverAssignmentSchema>;

// What customers do in the portal. Separate from audit_logs (staff actions).
export const portalActivityLog = pgTable("portal_activity_log", {
  id: serial("id").primaryKey(),
  portalUserId: integer("portal_user_id").references(() => portalUsers.id, { onDelete: "set null" }),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  entity: text("entity"),
  entityId: integer("entity_id"),
  details: jsonb("details").$type<Record<string, unknown>>(),
  ip: text("ip"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  customerCreatedIdx: index("portal_activity_customer_created_idx").on(table.customerId, table.createdAt),
}));

export const insertPortalActivityLogSchema = createInsertSchema(portalActivityLog)
  .omit({ id: true, createdAt: true });
export type PortalActivityLogEntry = typeof portalActivityLog.$inferSelect;
export type InsertPortalActivityLogEntry = z.infer<typeof insertPortalActivityLogSchema>;
```

`uniqueIndex`, `index`, `sql`, `jsonb` are already imported at the top of the file.

- [ ] **Step 5: Create `shared/portal-types.ts`**

```ts
// DTOs the portal API returns and the portal client consumes. Kept apart from
// schema.ts so the client never has to import Drizzle table objects.

export const PORTAL_ERROR = {
  NOT_AUTHENTICATED: 'PORTAL_NOT_AUTHENTICATED',
  INVALID_CREDENTIALS: 'PORTAL_INVALID_CREDENTIALS',
  ACCOUNT_BLOCKED: 'PORTAL_ACCOUNT_BLOCKED',
  PORTAL_DISABLED: 'PORTAL_DISABLED',
  LOCKED: 'PORTAL_LOCKED',
  FEATURE_DISABLED: 'PORTAL_FEATURE_DISABLED',
  ROLE_FORBIDDEN: 'PORTAL_ROLE_FORBIDDEN',
  TOKEN_INVALID: 'PORTAL_TOKEN_INVALID',
  TOKEN_EXPIRED: 'PORTAL_TOKEN_EXPIRED',
  VALIDATION: 'PORTAL_VALIDATION',
  NOT_FOUND: 'PORTAL_NOT_FOUND',
  CSRF: 'PORTAL_CSRF',
  SERVER: 'PORTAL_SERVER_ERROR',
} as const;
export type PortalErrorCode = typeof PORTAL_ERROR[keyof typeof PORTAL_ERROR];

export interface PortalSettingsFlags {
  portalEnabled: boolean;
  canBook: boolean;
  canManageDrivers: boolean;
  canSubmitRequests: boolean;
  canViewFines: boolean;
  canViewContracts: boolean;
  showPrices: boolean;
}

export interface PortalMe {
  id: number;
  email: string;
  fullName: string;
  role: 'admin' | 'driver';
  driverId: number | null;
  customerId: number;
  customerName: string;
  language: 'nl' | 'en';
  settings: PortalSettingsFlags;
}

export interface PortalReservationDto {
  id: number;
  status: string;
  type: string;
  startDate: string;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  actualPickupDate: string | null;
  actualReturnDate: string | null;
  pickupMileage: number | null;
  returnMileage: number | null;
  contractNumber: string | null;
  totalPrice: string | null; // only present when settings.showPrices
  vehicle: { id: number; licensePlate: string; brand: string; model: string } | null;
  driver: { id: number; displayName: string } | null;
  replacementForReservationId: number | null;
}

export interface PortalDocumentDto {
  id: number;
  reservationId: number | null;
  documentType: string;
  kind: 'contract' | 'damage_check';
  fileName: string;
  uploadDate: string;
}

export interface PortalDriverDto {
  id: number;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  driverLicenseNumber: string | null;
  licenseExpiry: string | null;
  status: string;
  hasLicenseFile: boolean;
}

export interface PortalConfig {
  allowedFrameOrigins: string[];
  notificationEmail: string;
  portalBaseUrl: string;
}

export const DEFAULT_PORTAL_CONFIG: PortalConfig = {
  allowedFrameOrigins: ['https://lamgroep.nl', 'https://www.lamgroep.nl'],
  notificationEmail: '',
  portalBaseUrl: '',
};

export const PORTAL_CONFIG_KEY = 'portal_config';
```

- [ ] **Step 6: Run the schema test and tsc**

Run: `npx vitest run shared/portal-schema.test.ts && npm run check`
Expected: 4 passed, tsc 0 errors.

- [ ] **Step 7: Add the DDL to `startup-migration.js`**

Inside `runMigrations()`, just before its closing success log, add (uses the file's existing `addColumnIfNotExists` and `createTableIfNotExists` helpers):

```js
    // ==================== CUSTOMER PORTAL (part 1) ====================
    await addColumnIfNotExists('vehicles', 'offered_online', 'BOOLEAN NOT NULL DEFAULT false');
    await addColumnIfNotExists('vehicles', 'online_description', 'TEXT');

    await createTableIfNotExists('portal_users', `
      CREATE TABLE portal_users (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        password_hash TEXT,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'admin',
        driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
        active BOOLEAN NOT NULL DEFAULT true,
        invite_token_hash TEXT,
        invite_expires_at TIMESTAMP,
        last_login_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_by TEXT,
        updated_by TEXT
      )`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS portal_users_email_lower_idx ON portal_users (lower(email))`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS portal_users_customer_id_idx ON portal_users (customer_id)`);

    await createTableIfNotExists('portal_customer_settings', `
      CREATE TABLE portal_customer_settings (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
        portal_enabled BOOLEAN NOT NULL DEFAULT true,
        can_book BOOLEAN NOT NULL DEFAULT true,
        can_manage_drivers BOOLEAN NOT NULL DEFAULT true,
        can_submit_requests BOOLEAN NOT NULL DEFAULT true,
        can_view_fines BOOLEAN NOT NULL DEFAULT true,
        can_view_contracts BOOLEAN NOT NULL DEFAULT true,
        show_prices BOOLEAN NOT NULL DEFAULT false,
        internal_notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_by TEXT
      )`);

    await createTableIfNotExists('reservation_driver_assignments', `
      CREATE TABLE reservation_driver_assignments (
        id SERIAL PRIMARY KEY,
        reservation_id INTEGER NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
        driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
        assigned_from TIMESTAMP NOT NULL,
        assigned_until TIMESTAMP,
        assigned_by_portal_user_id INTEGER REFERENCES portal_users(id) ON DELETE SET NULL,
        assigned_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        note TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS rda_reservation_from_idx ON reservation_driver_assignments (reservation_id, assigned_from)`);

    await createTableIfNotExists('portal_activity_log', `
      CREATE TABLE portal_activity_log (
        id SERIAL PRIMARY KEY,
        portal_user_id INTEGER REFERENCES portal_users(id) ON DELETE SET NULL,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        action TEXT NOT NULL,
        entity TEXT,
        entity_id INTEGER,
        details JSONB,
        ip TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS portal_activity_customer_created_idx ON portal_activity_log (customer_id, created_at)`);

    // One-off back-fill: every reservation that already has a driver gets one
    // open assignment row starting at its start date. Idempotent: skips
    // reservations that already have any assignment row.
    await db.execute(sql`
      INSERT INTO reservation_driver_assignments (reservation_id, driver_id, assigned_from, note)
      SELECT r.id, r.driver_id, COALESCE(r.start_date::timestamp, r.created_at, NOW()), 'backfill'
      FROM reservations r
      WHERE r.driver_id IS NOT NULL
        AND r.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM reservation_driver_assignments a WHERE a.reservation_id = r.id)
    `);
    console.log('✅ Customer portal tables ready');
```

If `reservations.start_date` holds a non-ISO string on some row the cast fails; wrap the back-fill in its own `try/catch` that logs `⚠️ portal back-fill skipped:` plus the error and continues, matching how the file treats optional steps.

- [ ] **Step 8: Run the migration against the dev database**

Run: `node -r dotenv/config startup-migration.js`
Expected: the log ends with `✅ Customer portal tables ready` and the script exits 0. Verify:

```bash
node -r dotenv/config -e "import('pg').then(async ({default:pg})=>{const c=new pg.Client({connectionString:process.env.DATABASE_URL});await c.connect();const r=await c.query(\"select table_name from information_schema.tables where table_name like 'portal_%' or table_name='reservation_driver_assignments' order by 1\");console.log(r.rows);await c.end();})"
```

Expected: four rows.

- [ ] **Step 9: Commit**

```bash
git add shared/schema.ts shared/portal-types.ts shared/portal-schema.test.ts startup-migration.js
git commit -m "feat(portal): schema for portal users, customer switches, driver assignments and activity log"
```

Put the DDL from Step 7 verbatim in the commit body (pattern of commits `e3cc8d4d` and `911891f5`) so a production database can be brought up to date by hand.

---
### Task 3: Portal paths, CSRF factory and frame headers

**Files:**
- Create: `server/portal-paths.ts`
- Modify: `server/middleware/security/csrf.ts`
- Modify: `server/middleware/security/headers.ts`
- Create: `server/services/portal-config.ts`
- Modify: `server/index.ts` (line ~162)
- Test: `server/__tests__/portal-paths.test.ts`, `server/__tests__/portal-csrf.test.ts`, `server/__tests__/portal-headers.test.ts`

**Interfaces:**
- Produces: `isPortalPath(path: string): boolean` (true for `/portaal`, `/portaal/x`, `/api/portal`, `/api/portal/x`), `isPortalApiPath(path)` (only the `/api/portal` forms).
- Produces: `createCsrfMiddleware(opts: { cookieName: string; sameSite: 'strict' | 'lax'; exemptPaths: string[] }): { attachCsrfToken, csrfProtection }`; the existing named exports `attachCsrfToken` and `csrfProtection` keep their behaviour (`XSRF-TOKEN`, strict, `/api/login` exempt).
- Produces: `portalFrameHeaders(req, res, next)` — on portal paths sets `Content-Security-Policy: frame-ancestors 'self' <origins>` and removes `X-Frame-Options`; no-op elsewhere.
- Produces: `getPortalConfig(): Promise<PortalConfig>`, `savePortalConfig(input: unknown, updatedBy: string): Promise<PortalConfig>`, `clearPortalConfigCache(): void`, `portalConfigSchema`.

- [ ] **Step 1: Path helper test**

Create `server/__tests__/portal-paths.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isPortalPath, isPortalApiPath } from "../portal-paths";

describe("portal paths", () => {
  it("recognises page and api paths", () => {
    expect(isPortalPath("/portaal")).toBe(true);
    expect(isPortalPath("/portaal/reserveringen/3")).toBe(true);
    expect(isPortalPath("/api/portal/me")).toBe(true);
    expect(isPortalPath("/portaalx")).toBe(false);
    expect(isPortalPath("/api/portal-admin/accounts")).toBe(false);
    expect(isPortalPath("/vehicles")).toBe(false);
  });
  it("api helper ignores page paths", () => {
    expect(isPortalApiPath("/api/portal/login")).toBe(true);
    expect(isPortalApiPath("/portaal")).toBe(false);
  });
});
```

- [ ] **Step 2: Implement `server/portal-paths.ts`**

```ts
// Single definition of "is this request part of the customer portal", used by
// the staff auth stack (to step aside), the frame headers and the CSRF setup.
const PAGE_PREFIX = "/portaal";
const API_PREFIX = "/api/portal";

function matches(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + "/");
}

export function isPortalApiPath(path: string): boolean {
  return matches(path, API_PREFIX);
}

export function isPortalPath(path: string): boolean {
  return matches(path, PAGE_PREFIX) || isPortalApiPath(path);
}
```

Run: `npx vitest run server/__tests__/portal-paths.test.ts` — Expected: 2 passed.

- [ ] **Step 3: CSRF factory test**

Create `server/__tests__/portal-csrf.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import express from "express";
import session from "express-session";
import request from "supertest";
import { createCsrfMiddleware, attachCsrfToken, csrfProtection } from "../middleware/security/csrf";

function appWith(attach: any, protect: any) {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: "t", resave: false, saveUninitialized: true }));
  app.use(attach);
  app.use(protect);
  app.get("/api/portal/csrf-token", (_req, res) => res.json({ token: res.locals.csrfToken }));
  app.post("/api/portal/login", (_req, res) => res.json({ ok: true }));
  app.post("/api/portal/thing", (_req, res) => res.json({ ok: true }));
  return app;
}

describe("createCsrfMiddleware", () => {
  const mw = createCsrfMiddleware({ cookieName: "PORTAL-XSRF-TOKEN", sameSite: "lax", exemptPaths: ["/api/portal/login"] });
  const app = appWith(mw.attachCsrfToken, mw.csrfProtection);

  it("sets its own cookie name with SameSite=Lax", async () => {
    const res = await request(app).get("/api/portal/csrf-token");
    const cookie = (res.headers["set-cookie"] as string[]).find((c) => c.startsWith("PORTAL-XSRF-TOKEN="));
    expect(cookie).toContain("SameSite=Lax");
  });

  it("lets exempt paths through and blocks the rest without a token", async () => {
    expect((await request(app).post("/api/portal/login")).status).toBe(200);
    expect((await request(app).post("/api/portal/thing")).status).toBe(403);
  });

  it("accepts the token it issued", async () => {
    const agent = request.agent(app);
    const first = await agent.get("/api/portal/csrf-token");
    const res = await agent.post("/api/portal/thing").set("X-CSRF-Token", first.body.token);
    expect(res.status).toBe(200);
  });
});

describe("default staff exports", () => {
  it("still use XSRF-TOKEN strict", async () => {
    const app = appWith(attachCsrfToken, csrfProtection);
    const res = await request(app).get("/api/portal/csrf-token");
    const cookie = (res.headers["set-cookie"] as string[]).find((c) => c.startsWith("XSRF-TOKEN="));
    expect(cookie).toContain("SameSite=Strict");
  });
});
```

- [ ] **Step 4: Refactor `csrf.ts` into a factory**

Replace the existing `csrfProtection` and `attachCsrfToken` functions with the factory below and re-export the staff defaults. Keep `generateCsrfToken` and `verifyCsrfToken` unchanged.

```ts
export interface CsrfOptions {
  cookieName: string;
  sameSite: 'strict' | 'lax';
  /** Paths (exact match on req.path) that carry no session yet and are exempt. */
  exemptPaths: string[];
}

export function createCsrfMiddleware(options: CsrfOptions) {
  const exempt = new Set(options.exemptPaths);

  function csrfProtection(req: Request & { session: any }, res: Response, next: NextFunction): void {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (exempt.has(req.path)) return next();

    const token = req.get('X-CSRF-Token') || req.body?._csrf;
    if (!token) {
      res.status(403).json({ message: 'CSRF token missing', code: 'CSRF_MISSING' });
      return;
    }
    const secret = req.session?.csrfSecret;
    if (!secret || !verifyCsrfToken(token, secret)) {
      res.status(403).json({ message: 'Invalid CSRF token', code: 'CSRF_INVALID' });
      return;
    }
    next();
  }

  function attachCsrfToken(req: Request & { session: any }, res: Response, next: NextFunction): void {
    const token = generateCsrfToken(req);
    res.locals.csrfToken = token;
    const secureSetting = useSecureCookies();
    const secure = secureSetting === 'auto' ? req.secure : secureSetting;
    res.cookie(options.cookieName, token, { httpOnly: false, secure, sameSite: options.sameSite });
    next();
  }

  return { csrfProtection, attachCsrfToken };
}

// Staff defaults: unchanged behaviour for every existing caller.
const staffCsrf = createCsrfMiddleware({ cookieName: 'XSRF-TOKEN', sameSite: 'strict', exemptPaths: ['/api/login'] });
export const csrfProtection = staffCsrf.csrfProtection;
export const attachCsrfToken = staffCsrf.attachCsrfToken;
```

Run: `npx vitest run server/__tests__/portal-csrf.test.ts && npm run check` — Expected: 4 passed, 0 tsc errors.

- [ ] **Step 5: Portal config service**

Create `server/services/portal-config.ts`:

```ts
import { storage } from "../storage";
import { DEFAULT_PORTAL_CONFIG, PORTAL_CONFIG_KEY, type PortalConfig } from "../../shared/portal-types";
import { z } from "zod";

export const portalConfigSchema = z.object({
  allowedFrameOrigins: z.array(z.string().url()).default(DEFAULT_PORTAL_CONFIG.allowedFrameOrigins),
  notificationEmail: z.union([z.string().email(), z.literal("")]).default(""),
  portalBaseUrl: z.union([z.string().url(), z.literal("")]).default(""),
});

const CACHE_TTL_MS = 60_000;
let cached: { value: PortalConfig; at: number } | null = null;

export function clearPortalConfigCache(): void {
  cached = null;
}

export async function getPortalConfig(): Promise<PortalConfig> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
  try {
    const row = await storage.getAppSettingByKey(PORTAL_CONFIG_KEY);
    const parsed = portalConfigSchema.safeParse(row?.value ?? {});
    const value = parsed.success ? { ...DEFAULT_PORTAL_CONFIG, ...parsed.data } : DEFAULT_PORTAL_CONFIG;
    cached = { value, at: Date.now() };
    return value;
  } catch (error) {
    console.warn("⚠️ portal_config could not be read, using defaults:", error);
    return DEFAULT_PORTAL_CONFIG;
  }
}

export async function savePortalConfig(input: unknown, updatedBy: string): Promise<PortalConfig> {
  const value = portalConfigSchema.parse(input);
  const existing = await storage.getAppSettingByKey(PORTAL_CONFIG_KEY);
  if (existing) {
    await storage.updateAppSetting(existing.id, { value, updatedBy });
  } else {
    await storage.createAppSetting({
      key: PORTAL_CONFIG_KEY,
      value,
      category: "portal",
      description: "Customer portal: allowed iframe origins, staff notification e-mail, portal base URL",
      createdBy: updatedBy,
      updatedBy,
    });
  }
  clearPortalConfigCache();
  return value;
}
```

- [ ] **Step 6: Frame headers test**

Create `server/__tests__/portal-headers.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../services/portal-config", () => ({
  getPortalConfig: async () => ({ allowedFrameOrigins: ["https://lamgroep.nl", "http://lamgroep.local"], notificationEmail: "", portalBaseUrl: "" }),
}));

import { securityHeaders, customSecurityHeaders, portalFrameHeaders } from "../middleware/security/headers";

const app = express();
app.use(securityHeaders);
app.use(customSecurityHeaders);
app.use(portalFrameHeaders);
app.get("*", (_req, res) => res.send("ok"));

describe("portalFrameHeaders", () => {
  it("allows the configured parents on portal paths", async () => {
    const res = await request(app).get("/portaal/login");
    expect(res.headers["x-frame-options"]).toBeUndefined();
    expect(res.headers["content-security-policy"]).toContain("frame-ancestors 'self' https://lamgroep.nl http://lamgroep.local");
  });
  it("keeps SAMEORIGIN everywhere else", async () => {
    const res = await request(app).get("/vehicles");
    expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(res.headers["content-security-policy"]).not.toContain("https://lamgroep.nl");
  });
});
```

- [ ] **Step 7: Implement `portalFrameHeaders` in `headers.ts`**

Add the imports at the top of `server/middleware/security/headers.ts`:

```ts
import { isPortalPath } from '../../portal-paths';
import { getPortalConfig } from '../../services/portal-config';
```

Append at the end of the file:

```ts
/**
 * The customer portal is embedded in an <iframe> on the public website, so on
 * portal paths the frame-ancestors directive names the allowed parents and
 * X-Frame-Options (which cannot express "these origins") is dropped. Helmet's
 * CSP has already been written by the time this runs; only the
 * frame-ancestors part of it is replaced.
 */
export async function portalFrameHeaders(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!isPortalPath(req.path)) return next();
  try {
    const config = await getPortalConfig();
    const origins = config.allowedFrameOrigins.join(' ');
    const existing = String(res.getHeader('Content-Security-Policy') ?? '');
    const withoutFrame = existing
      .split(';')
      .map((d) => d.trim())
      .filter((d) => d && !d.startsWith('frame-ancestors'));
    res.setHeader('Content-Security-Policy', [...withoutFrame, `frame-ancestors 'self' ${origins}`].join('; '));
    res.removeHeader('X-Frame-Options');
  } catch (error) {
    console.warn('⚠️ portalFrameHeaders: falling back to same-origin framing:', error);
  }
  next();
}
```

- [ ] **Step 8: Wire it in `server/index.ts`**

Change the import to `import { securityHeaders, customSecurityHeaders, portalFrameHeaders } from "./middleware/security/headers.js";` and directly after `app.use(customSecurityHeaders);` add:

```ts
app.use(portalFrameHeaders);
```

Run: `npx vitest run server/__tests__/portal-headers.test.ts && npm run check` — Expected: 2 passed, 0 errors.

- [ ] **Step 9: Commit**

```bash
git add server/portal-paths.ts server/middleware/security/csrf.ts server/middleware/security/headers.ts server/services/portal-config.ts server/index.ts server/__tests__/portal-paths.test.ts server/__tests__/portal-csrf.test.ts server/__tests__/portal-headers.test.ts
git commit -m "feat(portal): portal path helper, CSRF middleware factory and iframe frame-ancestors headers"
```

---
### Task 4: Test fixtures and portal storage

**Files:**
- Create: `server/__tests__/portal-helpers.ts`
- Create: `server/services/portal-storage.ts`
- Test: `server/__tests__/portal-storage.test.ts`

**Interfaces:**
- Produces (helpers): `createTestCustomer(name?)`, `createTestVehicle(plate?)`, `createTestDriver(customerId, displayName?)`, `createTestReservation({ customerId, vehicleId, driverId?, startDate?, endDate?, status?, type? })`, `createTestDocument({ reservationId, vehicleId, documentType, fileName? })`, `cleanupPortalTestData()`. Test rows are recognisable: customer names start with `__portal_test__`, plates start with `PT-`, e-mails end with `@portal-test.invalid`.
- Produces (storage): `portalStorage` with the methods listed in Step 4; `PortalScope = { driverId?: number | null }`; `PortalReservation`; `PortalDocument` (a `Document` plus `kind: 'contract' | 'damage_check'`).

- [ ] **Step 1: Fixture helpers**

Create `server/__tests__/portal-helpers.ts`:

```ts
import { db } from "../db";
import {
  customers, vehicles, drivers, reservations, documents,
  portalUsers, portalCustomerSettings, portalActivityLog, reservationDriverAssignments,
  type Customer, type Vehicle, type Driver, type Reservation, type Document,
} from "../../shared/schema";
import { like, inArray } from "drizzle-orm";

export const TEST_PREFIX = "__portal_test__";
export const TEST_EMAIL_DOMAIN = "portal-test.invalid";

export async function createTestCustomer(name = "Klant"): Promise<Customer> {
  const [row] = await db.insert(customers).values({
    name: `${TEST_PREFIX}${name}`,
    companyName: `${TEST_PREFIX}${name} BV`,
    email: `${name.toLowerCase()}@${TEST_EMAIL_DOMAIN}`,
    customerType: "business",
    preferredLanguage: "nl",
  }).returning();
  return row;
}

let plateCounter = 0;
export async function createTestVehicle(plate?: string): Promise<Vehicle> {
  plateCounter += 1;
  const [row] = await db.insert(vehicles).values({
    licensePlate: plate ?? `PT-${Date.now().toString().slice(-6)}-${plateCounter}`,
    brand: "Test",
    model: "Model",
  }).returning();
  return row;
}

export async function createTestDriver(customerId: number, displayName = "Bestuurder"): Promise<Driver> {
  const [row] = await db.insert(drivers).values({ customerId, displayName, status: "active" }).returning();
  return row;
}

export async function createTestReservation(input: {
  customerId: number; vehicleId: number; driverId?: number | null;
  startDate?: string; endDate?: string | null; status?: string; type?: string;
}): Promise<Reservation> {
  const [row] = await db.insert(reservations).values({
    customerId: input.customerId,
    vehicleId: input.vehicleId,
    driverId: input.driverId ?? null,
    startDate: input.startDate ?? "2026-09-01",
    endDate: input.endDate === undefined ? "2026-09-10" : input.endDate,
    status: input.status ?? "booked",
    type: input.type ?? "standard",
  }).returning();
  return row;
}

export async function createTestDocument(input: { reservationId: number; vehicleId: number; documentType: string; fileName?: string }): Promise<Document> {
  const [row] = await db.insert(documents).values({
    reservationId: input.reservationId,
    vehicleId: input.vehicleId,
    documentType: input.documentType,
    fileName: input.fileName ?? "test.pdf",
    filePath: "uploads/__portal_test__/test.pdf",
    fileSize: 3,
    contentType: "application/pdf",
  }).returning();
  return row;
}

/** Deletes everything the helpers above created. */
export async function cleanupPortalTestData(): Promise<void> {
  const testCustomers = await db.select({ id: customers.id }).from(customers).where(like(customers.name, `${TEST_PREFIX}%`));
  const ids = testCustomers.map((c) => c.id);
  if (ids.length) {
    await db.delete(portalActivityLog).where(inArray(portalActivityLog.customerId, ids));
    await db.delete(portalUsers).where(inArray(portalUsers.customerId, ids));
    await db.delete(portalCustomerSettings).where(inArray(portalCustomerSettings.customerId, ids));
    const res = await db.select({ id: reservations.id }).from(reservations).where(inArray(reservations.customerId, ids));
    const resIds = res.map((r) => r.id);
    if (resIds.length) {
      await db.delete(reservationDriverAssignments).where(inArray(reservationDriverAssignments.reservationId, resIds));
      await db.delete(documents).where(inArray(documents.reservationId, resIds));
      await db.delete(reservations).where(inArray(reservations.id, resIds));
    }
    await db.delete(drivers).where(inArray(drivers.customerId, ids));
    await db.delete(customers).where(inArray(customers.id, ids));
  }
  await db.delete(vehicles).where(like(vehicles.licensePlate, "PT-%"));
}
```

- [ ] **Step 2: Storage test**

Create `server/__tests__/portal-storage.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { portalStorage } from "../services/portal-storage";
import { createTestCustomer, createTestVehicle, createTestDriver, createTestReservation, createTestDocument, cleanupPortalTestData, TEST_EMAIL_DOMAIN } from "./portal-helpers";

describe("portalStorage", () => {
  let a: number, b: number, vehicleId: number, driverA: number, resA: number, resB: number, docA: number, maintenanceId: number;

  beforeAll(async () => {
    await cleanupPortalTestData();
    a = (await createTestCustomer("A")).id;
    b = (await createTestCustomer("B")).id;
    vehicleId = (await createTestVehicle()).id;
    driverA = (await createTestDriver(a)).id;
    resA = (await createTestReservation({ customerId: a, vehicleId, driverId: driverA })).id;
    resB = (await createTestReservation({ customerId: b, vehicleId })).id;
    maintenanceId = (await createTestReservation({ customerId: a, vehicleId, type: "maintenance_block" })).id;
    docA = (await createTestDocument({ reservationId: resA, vehicleId, documentType: "Contract (Unsigned)" })).id;
    await createTestDocument({ reservationId: resA, vehicleId, documentType: "APK Inspection" });
  });
  afterAll(cleanupPortalTestData);

  it("creates a user, finds it case-insensitively, and creates the settings row", async () => {
    const user = await portalStorage.createPortalUser({ customerId: a, email: `admin@${TEST_EMAIL_DOMAIN}`, fullName: "Admin A", role: "admin" }, "tester");
    const found = await portalStorage.getPortalUserByEmail(`ADMIN@${TEST_EMAIL_DOMAIN}`);
    expect(found?.id).toBe(user.id);
    const settings = await portalStorage.getOrCreateCustomerSettings(a);
    expect(settings.portalEnabled).toBe(true);
    expect(settings.showPrices).toBe(false);
  });

  it("scopes reservations to the customer and hides maintenance blocks", async () => {
    const list = await portalStorage.listReservationsForCustomer(a, {});
    expect(list.map((r) => r.id)).toEqual([resA]);
    expect(await portalStorage.getReservationForCustomer(resB, a, {})).toBeUndefined();
    expect(await portalStorage.getReservationForCustomer(maintenanceId, a, {})).toBeUndefined();
    const own = await portalStorage.getReservationForCustomer(resA, a, {});
    expect(own?.vehicle?.id).toBe(vehicleId);
    expect(own?.driver?.id).toBe(driverA);
  });

  it("scopes by driver for driver-role users", async () => {
    const other = await createTestDriver(a, "Ander");
    expect(await portalStorage.listReservationsForCustomer(a, { driverId: other.id })).toEqual([]);
    expect((await portalStorage.listReservationsForCustomer(a, { driverId: driverA })).length).toBe(1);
  });

  it("lists only contract and damage-check documents of own reservations", async () => {
    const docs = await portalStorage.listDocumentsForCustomer(a, {});
    expect(docs.map((d) => d.id)).toEqual([docA]);
    expect(docs[0].kind).toBe("contract");
    expect(await portalStorage.getDocumentForCustomer(docA, b, {})).toBeUndefined();
  });

  it("writes and lists activity", async () => {
    await portalStorage.logActivity({ customerId: a, action: "login", ip: "127.0.0.1" });
    const rows = await portalStorage.listActivity({ customerId: a, limit: 10 });
    expect(rows[0].action).toBe("login");
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run server/__tests__/portal-storage.test.ts` — Expected: FAIL, cannot find module `../services/portal-storage`.

- [ ] **Step 4: Implement `server/services/portal-storage.ts`**

```ts
import { db } from "../db";
import {
  portalUsers, portalCustomerSettings, portalActivityLog, reservationDriverAssignments,
  reservations, vehicles, drivers, documents, customers,
  type PortalUser, type InsertPortalUser, type PortalCustomerSettings,
  type InsertPortalActivityLogEntry, type PortalActivityLogEntry,
  type Driver, type Reservation, type Document, type Vehicle,
} from "../../shared/schema";
import { and, desc, eq, exists, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { isContractDocument, isDamageCheckDocument } from "../../shared/document-types";

/** Set for driver-role users: restricts to reservations they were assigned to. */
export interface PortalScope {
  driverId?: number | null;
}

export type PortalReservation = Reservation & { vehicle?: Vehicle; driver?: Driver };
export type PortalDocument = Document & { kind: "contract" | "damage_check" };

type PortalUserUpdate = Partial<Pick<PortalUser,
  "fullName" | "role" | "driverId" | "active" | "passwordHash" | "inviteTokenHash" | "inviteExpiresAt" | "lastLoginAt" | "updatedBy">>;

const CUSTOMER_VISIBLE_TYPES = ["standard", "replacement"];

function driverScopeCondition(scope: PortalScope): SQL | undefined {
  if (!scope.driverId) return undefined;
  return or(
    eq(reservations.driverId, scope.driverId),
    exists(
      db.select({ one: sql`1` }).from(reservationDriverAssignments)
        .where(and(
          eq(reservationDriverAssignments.reservationId, reservations.id),
          eq(reservationDriverAssignments.driverId, scope.driverId),
        )),
    ),
  );
}

function reservationBase(customerId: number, scope: PortalScope): SQL | undefined {
  return and(
    eq(reservations.customerId, customerId),
    isNull(reservations.deletedAt),
    inArray(reservations.type, CUSTOMER_VISIBLE_TYPES),
    driverScopeCondition(scope),
  );
}

async function selectReservations(where: SQL | undefined): Promise<PortalReservation[]> {
  const rows = await db
    .select({ reservation: reservations, vehicle: vehicles, driver: drivers })
    .from(reservations)
    .leftJoin(vehicles, eq(reservations.vehicleId, vehicles.id))
    .leftJoin(drivers, eq(reservations.driverId, drivers.id))
    .where(where)
    .orderBy(desc(reservations.startDate), desc(reservations.id));
  return rows.map((r) => ({ ...r.reservation, vehicle: r.vehicle ?? undefined, driver: r.driver ?? undefined }));
}

function classify(doc: Document): PortalDocument | null {
  if (isContractDocument(doc.documentType)) return { ...doc, kind: "contract" };
  if (isDamageCheckDocument(doc.documentType)) return { ...doc, kind: "damage_check" };
  return null;
}

export const portalStorage = {
  // ---- users ----------------------------------------------------------------
  async getPortalUser(id: number): Promise<PortalUser | undefined> {
    const [row] = await db.select().from(portalUsers).where(eq(portalUsers.id, id));
    return row;
  },
  async getPortalUserByEmail(email: string): Promise<PortalUser | undefined> {
    const [row] = await db.select().from(portalUsers).where(sql`lower(${portalUsers.email}) = ${email.trim().toLowerCase()}`);
    return row;
  },
  async getPortalUserByInviteTokenHash(hash: string): Promise<PortalUser | undefined> {
    const [row] = await db.select().from(portalUsers).where(eq(portalUsers.inviteTokenHash, hash));
    return row;
  },
  async listPortalUsersByCustomer(customerId: number): Promise<PortalUser[]> {
    return db.select().from(portalUsers).where(eq(portalUsers.customerId, customerId)).orderBy(portalUsers.fullName);
  },
  async listAllPortalUsers(): Promise<Array<PortalUser & { customerName: string }>> {
    const rows = await db.select({ user: portalUsers, customerName: customers.name })
      .from(portalUsers).innerJoin(customers, eq(portalUsers.customerId, customers.id))
      .orderBy(customers.name, portalUsers.fullName);
    return rows.map((r) => ({ ...r.user, customerName: r.customerName }));
  },
  async createPortalUser(input: InsertPortalUser, createdBy: string): Promise<PortalUser> {
    await portalStorage.getOrCreateCustomerSettings(input.customerId);
    const [row] = await db.insert(portalUsers).values({ ...input, createdBy, updatedBy: createdBy }).returning();
    return row;
  },
  async updatePortalUser(id: number, data: PortalUserUpdate): Promise<PortalUser | undefined> {
    const [row] = await db.update(portalUsers).set({ ...data, updatedAt: new Date() }).where(eq(portalUsers.id, id)).returning();
    return row;
  },
  async deletePortalUser(id: number): Promise<boolean> {
    const rows = await db.delete(portalUsers).where(eq(portalUsers.id, id)).returning({ id: portalUsers.id });
    return rows.length > 0;
  },

  // ---- customer settings ----------------------------------------------------
  async getOrCreateCustomerSettings(customerId: number): Promise<PortalCustomerSettings> {
    const [existing] = await db.select().from(portalCustomerSettings).where(eq(portalCustomerSettings.customerId, customerId));
    if (existing) return existing;
    const [created] = await db.insert(portalCustomerSettings).values({ customerId }).onConflictDoNothing().returning();
    if (created) return created;
    const [again] = await db.select().from(portalCustomerSettings).where(eq(portalCustomerSettings.customerId, customerId));
    return again;
  },
  async updateCustomerSettings(
    customerId: number,
    data: Partial<Omit<PortalCustomerSettings, "id" | "customerId" | "createdAt" | "updatedAt" | "updatedBy">>,
    updatedBy: string,
  ): Promise<PortalCustomerSettings> {
    await portalStorage.getOrCreateCustomerSettings(customerId);
    const [row] = await db.update(portalCustomerSettings).set({ ...data, updatedBy, updatedAt: new Date() })
      .where(eq(portalCustomerSettings.customerId, customerId)).returning();
    return row;
  },

  // ---- activity -------------------------------------------------------------
  async logActivity(entry: InsertPortalActivityLogEntry): Promise<void> {
    await db.insert(portalActivityLog).values(entry);
  },
  async listActivity(opts: { customerId?: number; limit?: number }): Promise<Array<PortalActivityLogEntry & { userName: string | null; customerName: string | null }>> {
    const rows = await db.select({ entry: portalActivityLog, userName: portalUsers.fullName, customerName: customers.name })
      .from(portalActivityLog)
      .leftJoin(portalUsers, eq(portalActivityLog.portalUserId, portalUsers.id))
      .leftJoin(customers, eq(portalActivityLog.customerId, customers.id))
      .where(opts.customerId ? eq(portalActivityLog.customerId, opts.customerId) : undefined)
      .orderBy(desc(portalActivityLog.createdAt))
      .limit(opts.limit ?? 50);
    return rows.map((r) => ({ ...r.entry, userName: r.userName, customerName: r.customerName }));
  },

  // ---- reservations (always scoped) -----------------------------------------
  async listReservationsForCustomer(customerId: number, scope: PortalScope): Promise<PortalReservation[]> {
    return selectReservations(reservationBase(customerId, scope));
  },
  async getReservationForCustomer(id: number, customerId: number, scope: PortalScope): Promise<PortalReservation | undefined> {
    const [row] = await selectReservations(and(eq(reservations.id, id), reservationBase(customerId, scope)));
    return row;
  },

  // ---- documents (always scoped) --------------------------------------------
  async listDocumentsForCustomer(customerId: number, scope: PortalScope): Promise<PortalDocument[]> {
    const own = await selectReservations(reservationBase(customerId, scope));
    if (own.length === 0) return [];
    const rows = await db.select().from(documents)
      .where(inArray(documents.reservationId, own.map((r) => r.id)))
      .orderBy(desc(documents.uploadDate));
    return rows.map(classify).filter((d): d is PortalDocument => d !== null);
  },
  async getDocumentForCustomer(id: number, customerId: number, scope: PortalScope): Promise<PortalDocument | undefined> {
    const [doc] = await db.select().from(documents).where(eq(documents.id, id));
    if (!doc || doc.reservationId == null) return undefined;
    const reservation = await portalStorage.getReservationForCustomer(doc.reservationId, customerId, scope);
    if (!reservation) return undefined;
    return classify(doc) ?? undefined;
  },

  // ---- drivers (always scoped) ----------------------------------------------
  async listDriversForCustomer(customerId: number): Promise<Driver[]> {
    return db.select().from(drivers).where(eq(drivers.customerId, customerId)).orderBy(drivers.displayName);
  },
  async getDriverForCustomer(id: number, customerId: number): Promise<Driver | undefined> {
    const [row] = await db.select().from(drivers).where(and(eq(drivers.id, id), eq(drivers.customerId, customerId)));
    return row;
  },
};
```

- [ ] **Step 5: Run the tests and tsc**

Run: `npx vitest run server/__tests__/portal-storage.test.ts && npm run check` — Expected: 5 passed, 0 errors.

- [ ] **Step 6: Commit**

```bash
git add server/__tests__/portal-helpers.ts server/services/portal-storage.ts server/__tests__/portal-storage.test.ts
git commit -m "feat(portal): customer-scoped portal storage with test fixtures"
```

---
### Task 5: Driver assignment history, tokens, mail and staff notifications

**Files:**
- Create: `server/services/driver-assignments.ts`
- Create: `server/services/portal-tokens.ts`
- Create: `server/services/portal-mail.ts`
- Create: `server/services/portal-notifications.ts`
- Modify: `server/routes.ts` (PATCH `/api/reservations/:id`, ~line 3421) — staff driver changes go through the history
- Test: `server/__tests__/driver-assignments.test.ts`, `server/__tests__/portal-tokens.test.ts`, `server/__tests__/portal-mail.test.ts`

**Interfaces:**
- Produces: `assignDriverToReservation(input: { reservationId: number; driverId: number | null; byPortalUserId?: number; byUserId?: number; note?: string; at?: Date }): Promise<ReservationDriverAssignment>`, `getDriverAssignments(reservationId: number): Promise<Array<ReservationDriverAssignment & { driverName: string | null }>>`.
- Produces: `generateInviteToken(): { token: string; hash: string }`, `hashInviteToken(token: string): string`, `INVITE_TTL_MS = 72 * 60 * 60 * 1000`.
- Produces: `sendPortalInvite(user: PortalUser, kind: 'invite' | 'reset'): Promise<{ sent: boolean; token: string }>`, `ensurePortalEmailTemplates(): Promise<void>`, `renderTemplate(content: string, vars: Record<string, string>): string`; template names `portal_invite`, `portal_password_reset`, `portal_staff_notification`.
- Produces: `notifyStaffOfPortalEvent(event: { kind: string; title: string; description: string; link?: string; customerId: number }): Promise<void>`.

- [ ] **Step 1: Driver assignment test**

Create `server/__tests__/driver-assignments.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../db";
import { reservations, reservationDriverAssignments } from "../../shared/schema";
import { eq, isNull, and } from "drizzle-orm";
import { assignDriverToReservation, getDriverAssignments } from "../services/driver-assignments";
import { createTestCustomer, createTestVehicle, createTestDriver, createTestReservation, cleanupPortalTestData } from "./portal-helpers";

describe("assignDriverToReservation", () => {
  let reservationId: number, d1: number, d2: number;
  beforeAll(async () => {
    await cleanupPortalTestData();
    const c = await createTestCustomer("Drv");
    const v = await createTestVehicle();
    d1 = (await createTestDriver(c.id, "Een")).id;
    d2 = (await createTestDriver(c.id, "Twee")).id;
    reservationId = (await createTestReservation({ customerId: c.id, vehicleId: v.id })).id;
  });
  afterAll(cleanupPortalTestData);

  it("opens a row and mirrors driverId onto the reservation", async () => {
    const t1 = new Date("2026-09-01T08:00:00Z");
    const row = await assignDriverToReservation({ reservationId, driverId: d1, byUserId: undefined, at: t1 });
    expect(row.assignedUntil).toBeNull();
    const [res] = await db.select().from(reservations).where(eq(reservations.id, reservationId));
    expect(res.driverId).toBe(d1);
  });

  it("closes the previous row when the driver changes", async () => {
    const t2 = new Date("2026-09-03T08:00:00Z");
    await assignDriverToReservation({ reservationId, driverId: d2, at: t2, note: "wissel" });
    const open = await db.select().from(reservationDriverAssignments)
      .where(and(eq(reservationDriverAssignments.reservationId, reservationId), isNull(reservationDriverAssignments.assignedUntil)));
    expect(open).toHaveLength(1);
    expect(open[0].driverId).toBe(d2);
    const history = await getDriverAssignments(reservationId);
    expect(history.map((h) => h.driverId)).toEqual([d1, d2]);
    expect(history[0].assignedUntil?.toISOString()).toBe(t2.toISOString());
    expect(history[1].driverName).toBe("Twee");
  });

  it("is a no-op when the same driver is assigned again", async () => {
    await assignDriverToReservation({ reservationId, driverId: d2 });
    expect(await getDriverAssignments(reservationId)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Implement `server/services/driver-assignments.ts`**

```ts
import { db } from "../db";
import { reservations, reservationDriverAssignments, drivers, type ReservationDriverAssignment } from "../../shared/schema";
import { and, asc, eq, isNull } from "drizzle-orm";

export interface AssignDriverInput {
  reservationId: number;
  driverId: number | null;
  byPortalUserId?: number;
  byUserId?: number;
  note?: string;
  /** Moment the new driver takes over; defaults to now. */
  at?: Date;
}

/**
 * Records who drives a reservation from when. Closes the currently open
 * assignment, opens the new one and mirrors driver_id onto the reservation so
 * every existing staff screen keeps showing the current driver. Runs in one
 * transaction; assigning the driver that is already current changes nothing.
 */
export async function assignDriverToReservation(input: AssignDriverInput): Promise<ReservationDriverAssignment> {
  const at = input.at ?? new Date();
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(reservationDriverAssignments)
      .where(and(eq(reservationDriverAssignments.reservationId, input.reservationId), isNull(reservationDriverAssignments.assignedUntil)));

    if (current && current.driverId === input.driverId) return current;

    if (current) {
      await tx.update(reservationDriverAssignments)
        .set({ assignedUntil: at })
        .where(eq(reservationDriverAssignments.id, current.id));
    }

    const [created] = await tx.insert(reservationDriverAssignments).values({
      reservationId: input.reservationId,
      driverId: input.driverId,
      assignedFrom: at,
      assignedUntil: null,
      assignedByPortalUserId: input.byPortalUserId ?? null,
      assignedByUserId: input.byUserId ?? null,
      note: input.note ?? null,
    }).returning();

    await tx.update(reservations).set({ driverId: input.driverId }).where(eq(reservations.id, input.reservationId));
    return created;
  });
}

export async function getDriverAssignments(reservationId: number): Promise<Array<ReservationDriverAssignment & { driverName: string | null }>> {
  const rows = await db.select({ a: reservationDriverAssignments, driverName: drivers.displayName })
    .from(reservationDriverAssignments)
    .leftJoin(drivers, eq(reservationDriverAssignments.driverId, drivers.id))
    .where(eq(reservationDriverAssignments.reservationId, reservationId))
    .orderBy(asc(reservationDriverAssignments.assignedFrom), asc(reservationDriverAssignments.id));
  return rows.map((r) => ({ ...r.a, driverName: r.driverName }));
}
```

Run: `npx vitest run server/__tests__/driver-assignments.test.ts` — Expected: 3 passed.

- [ ] **Step 3: Staff driver changes go through the history**

In `server/routes.ts`, PATCH `/api/reservations/:id` (~line 3421): find where the handler has parsed `bodyData` and loaded the existing reservation (it fetches it for the audit/status checks; search for `const existingReservation` or the first `storage.getReservation(id)` call in that handler). After `storage.updateReservation(...)` succeeds, add:

```ts
      // Keep the driver assignment history in sync with staff edits so the
      // portal (and later the fines attribution) sees every change.
      if ('driverId' in bodyData && bodyData.driverId !== existingReservation?.driverId) {
        await assignDriverToReservation({
          reservationId: id,
          driverId: bodyData.driverId ?? null,
          byUserId: req.user?.id,
          note: 'staff',
        });
      }
```

Import at the top of `routes.ts`: `import { assignDriverToReservation } from "./services/driver-assignments";`. If the handler names the pre-update row differently, use that variable; if it does not load one, add `const existingReservation = await storage.getReservation(id);` before the update.

Also in POST `/api/reservations` (reservation creation, search `app.post("/api/reservations"`): after the reservation is created and if `reservation.driverId` is set, call `assignDriverToReservation({ reservationId: reservation.id, driverId: reservation.driverId, byUserId: req.user?.id, note: 'created' })`.

Run: `npm run check` — Expected: 0 errors.

- [ ] **Step 4: Token test and implementation**

Create `server/__tests__/portal-tokens.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { generateInviteToken, hashInviteToken, INVITE_TTL_MS } from "../services/portal-tokens";

describe("portal tokens", () => {
  it("makes a 64-hex token whose sha256 is the stored hash", () => {
    const { token, hash } = generateInviteToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashInviteToken(token));
    expect(hash).not.toBe(token);
  });
  it("uses a 72 hour lifetime", () => {
    expect(INVITE_TTL_MS).toBe(72 * 60 * 60 * 1000);
  });
});
```

Create `server/services/portal-tokens.ts`:

```ts
import { createHash, randomBytes } from "crypto";

export const INVITE_TTL_MS = 72 * 60 * 60 * 1000;

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** The token goes in the e-mail link; only its hash is stored. */
export function generateInviteToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("hex");
  return { token, hash: hashInviteToken(token) };
}
```

Run: `npx vitest run server/__tests__/portal-tokens.test.ts` — Expected: 2 passed.

- [ ] **Step 5: Mail test**

Create `server/__tests__/portal-mail.test.ts`:

```ts
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

const sendEmail = vi.fn(async () => true);
vi.mock("../utils/email-service", () => ({ sendEmail }));
vi.mock("../services/portal-config", () => ({
  getPortalConfig: async () => ({ allowedFrameOrigins: [], notificationEmail: "", portalBaseUrl: "https://portaal.lamgroep.nl" }),
}));

import { renderTemplate, sendPortalInvite, ensurePortalEmailTemplates } from "../services/portal-mail";
import { portalStorage } from "../services/portal-storage";
import { createTestCustomer, cleanupPortalTestData, TEST_EMAIL_DOMAIN } from "./portal-helpers";

describe("portal mail", () => {
  beforeAll(async () => { await cleanupPortalTestData(); await ensurePortalEmailTemplates(); });
  afterAll(cleanupPortalTestData);

  it("replaces placeholders and leaves unknown ones empty", () => {
    expect(renderTemplate("Hoi {{name}}, {{link}} {{nope}}", { name: "Kees", link: "x" })).toBe("Hoi Kees, x ");
  });

  it("stores a token hash with expiry and mails the activation link", async () => {
    const c = await createTestCustomer("Mail");
    const user = await portalStorage.createPortalUser({ customerId: c.id, email: `mail@${TEST_EMAIL_DOMAIN}`, fullName: "Mail", role: "admin" }, "t");
    const result = await sendPortalInvite(user, "invite");
    expect(result.sent).toBe(true);
    const stored = await portalStorage.getPortalUser(user.id);
    expect(stored?.inviteTokenHash).toBeTruthy();
    expect(stored?.inviteExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 71 * 3600 * 1000);
    const call = sendEmail.mock.calls[0][0] as any;
    expect(call.to).toBe(`mail@${TEST_EMAIL_DOMAIN}`);
    expect(call.html).toContain(`https://portaal.lamgroep.nl/portaal/activeren?token=${result.token}`);
  });
});
```

- [ ] **Step 6: Implement `server/services/portal-mail.ts`**

```ts
import { db } from "../db";
import { emailTemplates, type PortalUser } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { sendEmail } from "../utils/email-service";
import { storage } from "../storage";
import { portalStorage } from "./portal-storage";
import { getPortalConfig } from "./portal-config";
import { generateInviteToken, INVITE_TTL_MS } from "./portal-tokens";

export const PORTAL_TEMPLATE = {
  INVITE: "portal_invite",
  RESET: "portal_password_reset",
  STAFF: "portal_staff_notification",
} as const;

// Seeded once; staff edit them afterwards in Communicatie > E-mailsjablonen.
const DEFAULT_TEMPLATES: Array<{ name: string; subject: string; content: string }> = [
  {
    name: PORTAL_TEMPLATE.INVITE,
    subject: "Uw account voor het klantenportaal van Lam Groep",
    content: `<p>Beste {{name}},</p>
<p>Er is een account voor u aangemaakt in het klantenportaal van Lam Groep voor {{company}}.</p>
<p>Kies uw wachtwoord via deze link (72 uur geldig):</p>
<p><a href="{{link}}">{{link}}</a></p>
<p>Met vriendelijke groet,<br>Lam Groep</p>`,
  },
  {
    name: PORTAL_TEMPLATE.RESET,
    subject: "Wachtwoord opnieuw instellen - klantenportaal Lam Groep",
    content: `<p>Beste {{name}},</p>
<p>Via deze link stelt u een nieuw wachtwoord in (72 uur geldig):</p>
<p><a href="{{link}}">{{link}}</a></p>
<p>Heeft u dit niet aangevraagd, dan kunt u deze e-mail negeren.</p>
<p>Met vriendelijke groet,<br>Lam Groep</p>`,
  },
  {
    name: PORTAL_TEMPLATE.STAFF,
    subject: "Klantenportaal: {{title}}",
    content: `<p>{{title}}</p>
<p>{{description}}</p>
<p>Klant: {{company}}</p>
<p><a href="{{link}}">Openen in de app</a></p>`,
  },
];

export async function ensurePortalEmailTemplates(): Promise<void> {
  for (const t of DEFAULT_TEMPLATES) {
    const [existing] = await db.select({ id: emailTemplates.id }).from(emailTemplates).where(eq(emailTemplates.name, t.name));
    if (existing) continue;
    await db.insert(emailTemplates).values({ ...t, category: "portal", createdAt: new Date().toISOString() });
  }
}

export function renderTemplate(content: string, vars: Record<string, string>): string {
  return content.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => vars[key] ?? "");
}

export async function getPortalTemplate(name: string): Promise<{ subject: string; content: string }> {
  const [row] = await db.select().from(emailTemplates).where(eq(emailTemplates.name, name));
  if (row) return { subject: row.subject, content: row.content };
  const fallback = DEFAULT_TEMPLATES.find((t) => t.name === name)!;
  return { subject: fallback.subject, content: fallback.content };
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\n{2,}/g, "\n").trim();
}

/**
 * Issues a fresh token (invalidating any earlier one), stores its hash and
 * expiry on the user and mails the activation / reset link. Returns the raw
 * token so a caller (tests, or a staff "copy link" action) can use it.
 */
export async function sendPortalInvite(user: PortalUser, kind: "invite" | "reset"): Promise<{ sent: boolean; token: string }> {
  const { token, hash } = generateInviteToken();
  await portalStorage.updatePortalUser(user.id, { inviteTokenHash: hash, inviteExpiresAt: new Date(Date.now() + INVITE_TTL_MS) });

  const [config, customer] = await Promise.all([getPortalConfig(), storage.getCustomer(user.customerId)]);
  const base = config.portalBaseUrl.replace(/\/$/, "");
  const link = `${base}/portaal/activeren?token=${token}`;
  const template = await getPortalTemplate(kind === "invite" ? PORTAL_TEMPLATE.INVITE : PORTAL_TEMPLATE.RESET);
  const vars = { name: user.fullName, company: customer?.companyName || customer?.name || "", link };
  const html = renderTemplate(template.content, vars);

  const sent = await sendEmail({
    to: user.email,
    toName: user.fullName,
    subject: renderTemplate(template.subject, vars),
    html,
    text: stripHtml(html),
  }, "custom");
  return { sent, token };
}
```

Run: `npx vitest run server/__tests__/portal-mail.test.ts` — Expected: 2 passed.

- [ ] **Step 7: Staff notification helper**

Create `server/services/portal-notifications.ts`:

```ts
import { storage } from "../storage";
import { sendEmail } from "../utils/email-service";
import { getPortalConfig } from "./portal-config";
import { getPortalTemplate, renderTemplate, PORTAL_TEMPLATE } from "./portal-mail";

export interface PortalStaffEvent {
  /** e.g. 'portal_driver_change', later 'portal_booking_request', 'portal_request' */
  kind: string;
  title: string;
  description: string;
  /** In-app link, e.g. `/reservations/edit/12` */
  link?: string;
  customerId: number;
}

/**
 * One place every "a customer did something in the portal" goes through:
 * an in-app notification for staff plus an e-mail to the configured address.
 * Parts 2 (bookings) and 4 (requests) call this too. Never throws: a failed
 * notification must not fail the customer's action.
 */
export async function notifyStaffOfPortalEvent(event: PortalStaffEvent): Promise<void> {
  try {
    await storage.createCustomNotification({
      title: event.title,
      description: event.description,
      date: new Date().toISOString().slice(0, 10),
      type: event.kind,
      link: event.link ?? "",
      icon: "Users",
      priority: "normal",
      isRead: false,
    });
  } catch (error) {
    console.error("portal notification (in-app) failed:", error);
  }

  try {
    const config = await getPortalConfig();
    if (!config.notificationEmail) {
      console.warn("portal notification e-mail skipped: no notificationEmail in portal_config");
      return;
    }
    const customer = await storage.getCustomer(event.customerId);
    const template = await getPortalTemplate(PORTAL_TEMPLATE.STAFF);
    const vars = {
      title: event.title,
      description: event.description,
      company: customer?.companyName || customer?.name || String(event.customerId),
      link: event.link ?? "",
    };
    await sendEmail({
      to: config.notificationEmail,
      subject: renderTemplate(template.subject, vars),
      html: renderTemplate(template.content, vars),
    }, "custom");
  } catch (error) {
    console.error("portal notification (e-mail) failed:", error);
  }
}
```

Run: `npm run check` — Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add server/services/driver-assignments.ts server/services/portal-tokens.ts server/services/portal-mail.ts server/services/portal-notifications.ts server/routes.ts server/__tests__/driver-assignments.test.ts server/__tests__/portal-tokens.test.ts server/__tests__/portal-mail.test.ts
git commit -m "feat(portal): driver assignment history, invite tokens, portal mails and staff notifications"
```

---
### Task 6: Portal authentication realm

**Files:**
- Modify: `server/auth.ts` (`setupAuth`, the five `app.use(...)` calls ~lines 118-128)
- Create: `server/portal-auth.ts`
- Modify: `server/index.ts` (after `const { requireAuth } = setupAuth(app);`)
- Test: `server/__tests__/portal-auth.test.ts`

**Interfaces:**
- Consumes: `hashPassword`, `comparePasswords` from `server/auth.ts`; `checkAccountLockout`, `recordLoginAttempt`, `clearFailedAttempts` from `rateLimiter.ts`; `createCsrfMiddleware`; `portalStorage`; `sendPortalInvite`; `hashInviteToken`; `PORTAL_ERROR`.
- Produces: `setupPortalAuth(app: Express): { requirePortalUser: RequestHandler }`; `req.portalUser?: PortalRequestContext` where `PortalRequestContext = { user: PortalUser; customerId: number; settings: PortalCustomerSettings; scope: PortalScope }`; helper `portalError(res, status, code, error)`; `requireFeature(flag: keyof PortalSettingsFlags)`; `requirePortalRole('admin')`; `logPortalActivity(req, action, extra?)`. Routes: `GET /api/portal/csrf-token`, `POST /api/portal/login`, `POST /api/portal/logout`, `GET /api/portal/me`, `POST /api/portal/forgot`, `POST /api/portal/activate`, `POST /api/portal/me/password`, `PATCH /api/portal/me`.
- Produces (test helper): `buildPortalTestApp(): Express` in `server/__tests__/portal-helpers.ts` — express + json + `setupPortalAuth` (+ later `registerPortalRoutes`).

- [ ] **Step 1: Make the staff stack step aside on portal paths**

In `server/auth.ts` add the import `import { isPortalPath } from "./portal-paths";` and inside `setupAuth` replace

```ts
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(attachCsrfToken);
  app.use(csrfProtection);
```

with

```ts
  // express-session refuses to run when req.session already exists, so the
  // portal (its own cookie, its own Passport instance) can only mount its
  // stack if the staff stack skips portal paths entirely.
  const unlessPortal = (mw: RequestHandler): RequestHandler => (req, res, next) =>
    isPortalPath(req.path) ? next() : mw(req, res, next);

  app.use(unlessPortal(session(sessionSettings)));
  app.use(unlessPortal(passport.initialize()));
  app.use(unlessPortal(passport.session()));
  app.use(unlessPortal(attachCsrfToken));
  app.use(unlessPortal(csrfProtection));
```

Add `RequestHandler` to the express import at the top of the file.

- [ ] **Step 2: Auth test**

Create `server/__tests__/portal-auth.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";

const sendEmail = vi.fn(async () => true);
vi.mock("../utils/email-service", () => ({ sendEmail }));

import { buildPortalTestApp, createTestCustomer, createTestDriver, cleanupPortalTestData, TEST_EMAIL_DOMAIN } from "./portal-helpers";
import { portalStorage } from "../services/portal-storage";
import { sendPortalInvite } from "../services/portal-mail";
import { hashPassword } from "../auth";

const email = `login@${TEST_EMAIL_DOMAIN}`;
const password = "wachtwoord-1234";

describe("portal auth", () => {
  const app = buildPortalTestApp();
  let customerId: number, userId: number;

  beforeAll(async () => {
    await cleanupPortalTestData();
    customerId = (await createTestCustomer("Auth")).id;
    const user = await portalStorage.createPortalUser({ customerId, email, fullName: "Login", role: "admin" }, "t");
    userId = user.id;
    await portalStorage.updatePortalUser(userId, { passwordHash: await hashPassword(password) });
  });
  afterAll(cleanupPortalTestData);

  it("rejects /me without a session", async () => {
    const res = await request(app).get("/api/portal/me");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("PORTAL_NOT_AUTHENTICATED");
  });

  it("logs in with the portal cookie and returns me with settings", async () => {
    const agent = request.agent(app);
    const login = await agent.post("/api/portal/login").send({ email: email.toUpperCase(), password });
    expect(login.status).toBe(200);
    const cookies = login.headers["set-cookie"] as string[];
    expect(cookies.some((c) => c.startsWith("portal.sid=") && c.includes("SameSite=Lax"))).toBe(true);
    const me = await agent.get("/api/portal/me");
    expect(me.body.customerId).toBe(customerId);
    expect(me.body.settings.canManageDrivers).toBe(true);
    expect(me.body.role).toBe("admin");
  });

  it("refuses wrong passwords without saying which part is wrong", async () => {
    const res = await request(app).post("/api/portal/login").send({ email, password: "nope-nope-nope" });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("PORTAL_INVALID_CREDENTIALS");
  });

  it("blocks a customer whose portal is disabled", async () => {
    await portalStorage.updateCustomerSettings(customerId, { portalEnabled: false }, "t");
    const res = await request(app).post("/api/portal/login").send({ email, password });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PORTAL_DISABLED");
    await portalStorage.updateCustomerSettings(customerId, { portalEnabled: true }, "t");
  });

  it("activates through an invitation token and rejects it twice", async () => {
    const invited = await portalStorage.createPortalUser({ customerId, email: `new@${TEST_EMAIL_DOMAIN}`, fullName: "New", role: "admin" }, "t");
    const { token } = await sendPortalInvite(invited, "invite");
    const agent = request.agent(app);
    const ok = await agent.post("/api/portal/activate").send({ token, password: "nieuw-wachtwoord-1" });
    expect(ok.status).toBe(200);
    expect((await agent.get("/api/portal/me")).body.email).toBe(`new@${TEST_EMAIL_DOMAIN}`);
    const again = await request(app).post("/api/portal/activate").send({ token, password: "nieuw-wachtwoord-2" });
    expect(again.status).toBe(400);
    expect(again.body.code).toBe("PORTAL_TOKEN_INVALID");
    const short = await request(app).post("/api/portal/activate").send({ token: "x".repeat(64), password: "kort" });
    expect(short.body.code).toBe("PORTAL_VALIDATION");
  });

  it("forgot always answers 200 and mails only existing users", async () => {
    sendEmail.mockClear();
    expect((await request(app).post("/api/portal/forgot").send({ email })).status).toBe(200);
    expect((await request(app).post("/api/portal/forgot").send({ email: `ghost@${TEST_EMAIL_DOMAIN}` })).status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("requires the CSRF token for mutations after login", async () => {
    const agent = request.agent(app);
    await agent.post("/api/portal/login").send({ email, password });
    const noToken = await agent.patch("/api/portal/me").send({ fullName: "X" });
    expect(noToken.status).toBe(403);
    const { body } = await agent.get("/api/portal/csrf-token");
    const ok = await agent.patch("/api/portal/me").set("X-CSRF-Token", body.token).send({ fullName: "Login 2" });
    expect(ok.status).toBe(200);
    expect(ok.body.fullName).toBe("Login 2");
  });

  it("driver-role users get their driver scope", async () => {
    const driver = await createTestDriver(customerId, "Chauffeur");
    const du = await portalStorage.createPortalUser({ customerId, email: `drv@${TEST_EMAIL_DOMAIN}`, fullName: "Drv", role: "driver", driverId: driver.id }, "t");
    await portalStorage.updatePortalUser(du.id, { passwordHash: await hashPassword(password) });
    const agent = request.agent(app);
    await agent.post("/api/portal/login").send({ email: `drv@${TEST_EMAIL_DOMAIN}`, password });
    const me = await agent.get("/api/portal/me");
    expect(me.body.role).toBe("driver");
    expect(me.body.driverId).toBe(driver.id);
  });
});
```

- [ ] **Step 3: Add `buildPortalTestApp` to the helpers**

Append to `server/__tests__/portal-helpers.ts`:

```ts
import express, { type Express } from "express";
import { setupPortalAuth } from "../portal-auth";

/** Express app with only the portal realm mounted; no staff auth, no vite. */
export function buildPortalTestApp(): Express {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  const { requirePortalUser } = setupPortalAuth(app);
  // Task 7 adds: registerPortalRoutes(app, { requirePortalUser, uploadsDir: ... })
  void requirePortalUser;
  return app;
}
```

(Move the two imports to the top of the file with the others.)

- [ ] **Step 4: Run to see it fail**

Run: `npx vitest run server/__tests__/portal-auth.test.ts` — Expected: FAIL, cannot find module `../portal-auth`.

- [ ] **Step 5: Implement `server/portal-auth.ts`**

```ts
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import connectPg from "connect-pg-simple";
import type { Express, Request, Response, NextFunction, RequestHandler } from "express";
import { z } from "zod";
import { pool } from "./db";
import { storage } from "./storage";
import { hashPassword, comparePasswords } from "./auth";
import { useSecureCookies } from "./utils/secure-cookies.js";
import { createCsrfMiddleware } from "./middleware/security/csrf.js";
import { checkAccountLockout, recordLoginAttempt, clearFailedAttempts, loginLimiter } from "./middleware/security/rateLimiter.js";
import { portalStorage, type PortalScope } from "./services/portal-storage";
import { sendPortalInvite } from "./services/portal-mail";
import { hashInviteToken } from "./services/portal-tokens";
import { PortalUserRole, type PortalUser, type PortalCustomerSettings } from "../shared/schema";
import { PORTAL_ERROR, type PortalErrorCode, type PortalMe, type PortalSettingsFlags } from "../shared/portal-types";

export interface PortalRequestContext {
  user: PortalUser;
  customerId: number;
  settings: PortalCustomerSettings;
  scope: PortalScope;
}

declare global {
  namespace Express {
    interface Request {
      portalUser?: PortalRequestContext;
    }
  }
}

export const PORTAL_PASSWORD_MIN = 10;
const PORTAL_SESSION_MAX_AGE = 60 * 60 * 1000; // 1 hour of inactivity, rolling
const LOCKOUT_PREFIX = "portal:";

export function portalError(res: Response, status: number, code: PortalErrorCode, error: string) {
  return res.status(status).json({ error, code });
}

function settingsFlags(s: PortalCustomerSettings): PortalSettingsFlags {
  return {
    portalEnabled: s.portalEnabled, canBook: s.canBook, canManageDrivers: s.canManageDrivers,
    canSubmitRequests: s.canSubmitRequests, canViewFines: s.canViewFines,
    canViewContracts: s.canViewContracts, showPrices: s.showPrices,
  };
}

async function buildMe(ctx: PortalRequestContext): Promise<PortalMe> {
  const customer = await storage.getCustomer(ctx.customerId);
  return {
    id: ctx.user.id, email: ctx.user.email, fullName: ctx.user.fullName,
    role: ctx.user.role as "admin" | "driver", driverId: ctx.user.driverId,
    customerId: ctx.customerId,
    customerName: customer?.companyName || customer?.name || "",
    language: customer?.preferredLanguage === "en" ? "en" : "nl",
    settings: settingsFlags(ctx.settings),
  };
}

/** Loads user + settings; returns a reason when the account may not be used. */
async function loadContext(userId: number): Promise<{ ctx?: PortalRequestContext; code?: PortalErrorCode }> {
  const user = await portalStorage.getPortalUser(userId);
  if (!user || !user.active) return { code: PORTAL_ERROR.ACCOUNT_BLOCKED };
  const settings = await portalStorage.getOrCreateCustomerSettings(user.customerId);
  if (!settings.portalEnabled) return { code: PORTAL_ERROR.PORTAL_DISABLED };
  const scope: PortalScope = user.role === PortalUserRole.DRIVER ? { driverId: user.driverId } : {};
  return { ctx: { user, customerId: user.customerId, settings, scope } };
}

export async function logPortalActivity(req: Request, action: string, extra: { entity?: string; entityId?: number; details?: Record<string, unknown>; customerId?: number; portalUserId?: number } = {}): Promise<void> {
  const ctx = req.portalUser;
  const customerId = extra.customerId ?? ctx?.customerId;
  if (!customerId) return;
  try {
    await portalStorage.logActivity({
      customerId, portalUserId: extra.portalUserId ?? ctx?.user.id ?? null,
      action, entity: extra.entity ?? null, entityId: extra.entityId ?? null,
      details: extra.details ?? null, ip: req.ip || req.socket.remoteAddress || null,
    });
  } catch (error) {
    console.error("portal activity log failed:", error);
  }
}

export function requireFeature(flag: keyof PortalSettingsFlags): RequestHandler {
  return (req, res, next) => {
    if (!req.portalUser) return portalError(res, 401, PORTAL_ERROR.NOT_AUTHENTICATED, "Not authenticated");
    if (!req.portalUser.settings[flag]) return portalError(res, 403, PORTAL_ERROR.FEATURE_DISABLED, "This feature is disabled for your account");
    next();
  };
}

export function requirePortalRole(role: "admin"): RequestHandler {
  return (req, res, next) => {
    if (!req.portalUser) return portalError(res, 401, PORTAL_ERROR.NOT_AUTHENTICATED, "Not authenticated");
    if (req.portalUser.user.role !== role) return portalError(res, 403, PORTAL_ERROR.ROLE_FORBIDDEN, "Not allowed for your role");
    next();
  };
}

const passwordSchema = z.string().min(PORTAL_PASSWORD_MIN, `Password must be at least ${PORTAL_PASSWORD_MIN} characters`);

export function setupPortalAuth(app: Express): { requirePortalUser: RequestHandler } {
  const PostgresSessionStore = connectPg(session);
  const portalPassport = new passport.Passport();

  const portalSession = session({
    name: "portal.sid",
    secret: process.env.SESSION_SECRET || "portal-dev-secret",
    resave: false,
    saveUninitialized: false,
    rolling: true,
    store: new PostgresSessionStore({ pool, createTableIfMissing: true }),
    cookie: {
      maxAge: PORTAL_SESSION_MAX_AGE,
      secure: useSecureCookies(),
      httpOnly: true,
      // lax (not strict): the first navigation into the iframe on the website
      // must carry the cookie. Portal and site are same-site by deployment rule.
      sameSite: "lax",
    },
  });

  const csrf = createCsrfMiddleware({
    cookieName: "PORTAL-XSRF-TOKEN",
    sameSite: "lax",
    exemptPaths: ["/api/portal/login", "/api/portal/forgot", "/api/portal/activate"],
  });

  portalPassport.use("portal-local", new LocalStrategy({ usernameField: "email", passwordField: "password" }, async (email, password, done) => {
    try {
      const user = await portalStorage.getPortalUserByEmail(email);
      if (!user || !user.passwordHash) return done(null, false);
      const ok = await comparePasswords(password, user.passwordHash);
      return ok ? done(null, user) : done(null, false);
    } catch (error) {
      return done(error);
    }
  }));
  portalPassport.serializeUser((user: any, done) => done(null, { kind: "portal", id: (user as PortalUser).id }));
  portalPassport.deserializeUser(async (serialized: any, done) => {
    if (!serialized || serialized.kind !== "portal") return done(null, false);
    try {
      const user = await portalStorage.getPortalUser(serialized.id);
      done(null, user ?? false);
    } catch (error) {
      done(error);
    }
  });

  app.use("/api/portal", portalSession, portalPassport.initialize(), portalPassport.session(), csrf.attachCsrfToken, csrf.csrfProtection);

  const requirePortalUser: RequestHandler = async (req, res, next) => {
    const raw = req.user as PortalUser | undefined;
    if (!raw || !(req as any).isAuthenticated?.()) return portalError(res, 401, PORTAL_ERROR.NOT_AUTHENTICATED, "Not authenticated");
    const { ctx, code } = await loadContext(raw.id);
    if (!ctx) {
      req.logout(() => undefined);
      return portalError(res, 403, code!, "Account is not available");
    }
    req.portalUser = ctx;
    next();
  };

  app.get("/api/portal/csrf-token", (_req, res) => res.json({ token: res.locals.csrfToken }));

  app.post("/api/portal/login", loginLimiter, async (req, res, next) => {
    const parsed = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) return portalError(res, 400, PORTAL_ERROR.VALIDATION, "E-mail and password are required");
    const email = parsed.data.email.trim().toLowerCase();
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const ua = req.get("user-agent") || "unknown";
    const lockKey = LOCKOUT_PREFIX + email;

    const lock = await checkAccountLockout(lockKey, ip);
    if (lock.locked) return portalError(res, 429, PORTAL_ERROR.LOCKED, "Too many attempts, try again later");

    portalPassport.authenticate("portal-local", async (err: any, user: PortalUser | false) => {
      if (err) return next(err);
      if (!user) {
        await recordLoginAttempt(lockKey, ip, ua, false, "invalid_credentials");
        return portalError(res, 401, PORTAL_ERROR.INVALID_CREDENTIALS, "Invalid e-mail or password");
      }
      const { ctx, code } = await loadContext(user.id);
      if (!ctx) {
        await recordLoginAttempt(lockKey, ip, ua, false, code);
        return portalError(res, 403, code!, "Account is not available");
      }
      req.session.regenerate((regenErr: any) => {
        if (regenErr) return next(regenErr);
        req.login(user, async (loginErr: any) => {
          if (loginErr) return next(loginErr);
          await recordLoginAttempt(lockKey, ip, ua, true);
          await clearFailedAttempts(lockKey);
          await portalStorage.updatePortalUser(user.id, { lastLoginAt: new Date() });
          req.portalUser = ctx;
          await logPortalActivity(req, "login");
          res.json(await buildMe(ctx));
        });
      });
    })(req, res, next);
  });

  app.post("/api/portal/logout", async (req, res) => {
    if (req.user) {
      const raw = req.user as PortalUser;
      await logPortalActivity(req, "logout", { customerId: raw.customerId, portalUserId: raw.id });
    }
    req.logout(() => {
      req.session?.destroy(() => {
        res.clearCookie("portal.sid");
        res.json({ ok: true });
      });
    });
  });

  app.get("/api/portal/me", requirePortalUser, async (req, res) => {
    res.json(await buildMe(req.portalUser!));
  });

  app.patch("/api/portal/me", requirePortalUser, async (req, res) => {
    const parsed = z.object({ fullName: z.string().trim().min(1).max(200) }).safeParse(req.body);
    if (!parsed.success) return portalError(res, 400, PORTAL_ERROR.VALIDATION, "Name is required");
    await portalStorage.updatePortalUser(req.portalUser!.user.id, { fullName: parsed.data.fullName, updatedBy: req.portalUser!.user.email });
    const { ctx } = await loadContext(req.portalUser!.user.id);
    res.json(await buildMe(ctx!));
  });

  app.post("/api/portal/me/password", requirePortalUser, async (req, res) => {
    const parsed = z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema }).safeParse(req.body);
    if (!parsed.success) return portalError(res, 400, PORTAL_ERROR.VALIDATION, parsed.error.errors[0]?.message ?? "Invalid input");
    const user = req.portalUser!.user;
    if (!user.passwordHash || !(await comparePasswords(parsed.data.currentPassword, user.passwordHash))) {
      return portalError(res, 400, PORTAL_ERROR.INVALID_CREDENTIALS, "Current password is incorrect");
    }
    await portalStorage.updatePortalUser(user.id, { passwordHash: await hashPassword(parsed.data.newPassword), updatedBy: user.email });
    await logPortalActivity(req, "password_changed");
    res.json({ ok: true });
  });

  // Always 200: never reveal whether an address exists.
  app.post("/api/portal/forgot", loginLimiter, async (req, res) => {
    const parsed = z.object({ email: z.string().email() }).safeParse(req.body);
    if (parsed.success) {
      const user = await portalStorage.getPortalUserByEmail(parsed.data.email);
      if (user && user.active) {
        try { await sendPortalInvite(user, "reset"); } catch (error) { console.error("portal reset mail failed:", error); }
      }
    }
    res.json({ ok: true });
  });

  app.post("/api/portal/activate", loginLimiter, async (req, res, next) => {
    const parsed = z.object({ token: z.string().regex(/^[0-9a-f]{64}$/), password: passwordSchema }).safeParse(req.body);
    if (!parsed.success) return portalError(res, 400, PORTAL_ERROR.VALIDATION, parsed.error.errors[0]?.message ?? "Invalid input");
    const user = await portalStorage.getPortalUserByInviteTokenHash(hashInviteToken(parsed.data.token));
    if (!user) return portalError(res, 400, PORTAL_ERROR.TOKEN_INVALID, "This link is not valid");
    if (!user.inviteExpiresAt || user.inviteExpiresAt.getTime() < Date.now()) {
      return portalError(res, 400, PORTAL_ERROR.TOKEN_EXPIRED, "This link has expired");
    }
    await portalStorage.updatePortalUser(user.id, {
      passwordHash: await hashPassword(parsed.data.password),
      inviteTokenHash: null, inviteExpiresAt: null, updatedBy: user.email,
    });
    const { ctx, code } = await loadContext(user.id);
    if (!ctx) return portalError(res, 403, code!, "Account is not available");
    req.session.regenerate((regenErr: any) => {
      if (regenErr) return next(regenErr);
      req.login(ctx.user, async (loginErr: any) => {
        if (loginErr) return next(loginErr);
        req.portalUser = ctx;
        await logPortalActivity(req, "activate");
        res.json(await buildMe(ctx));
      });
    });
  });

  return { requirePortalUser };
}
```

- [ ] **Step 6: Mount it in `server/index.ts`**

After `const { requireAuth } = setupAuth(app);` add:

```ts
// Customer portal: its own session cookie, Passport instance and CSRF cookie
// on /api/portal. Mounted before registerRoutes() so the staff audit
// middleware never sees portal traffic (the portal keeps its own activity log).
const { requirePortalUser } = setupPortalAuth(app);
```

with `import { setupPortalAuth } from "./portal-auth";`. Also call `ensurePortalEmailTemplates()` once at startup: next to the other schedulers' start calls near the end of the file, add

```ts
import { ensurePortalEmailTemplates } from "./services/portal-mail";
…
ensurePortalEmailTemplates().catch((e) => console.error("portal e-mail templates:", e));
```

`requirePortalUser` is passed to `registerPortalRoutes` in Task 7; until then keep `void requirePortalUser;` so tsc does not flag it.

- [ ] **Step 7: Run tests, tsc, and boot the server once**

Run: `npx vitest run server/__tests__/portal-auth.test.ts && npm run check` — Expected: 8 passed, 0 errors.

Run the dev server (`npm run dev`) and `curl -i http://localhost:<PORT>/api/portal/me` — Expected: `401` with `{"error":"Not authenticated","code":"PORTAL_NOT_AUTHENTICATED"}` and a `PORTAL-XSRF-TOKEN` cookie; `curl -i http://localhost:<PORT>/api/user` still answers 401 with the staff message. Stop the server.

- [ ] **Step 8: Commit**

```bash
git add server/auth.ts server/portal-auth.ts server/index.ts server/__tests__/portal-auth.test.ts server/__tests__/portal-helpers.ts
git commit -m "feat(portal): separate portal login realm with its own session, passport and CSRF cookie"
```

---
### Task 7: Customer-facing portal API

**Files:**
- Create: `server/routes/portal.ts`
- Modify: `server/index.ts` (register after `setupPortalAuth`)
- Modify: `server/__tests__/portal-helpers.ts` (`buildPortalTestApp` registers the routes)
- Test: `server/__tests__/portal-routes.test.ts`

**Interfaces:**
- Consumes: `requirePortalUser`, `requireFeature`, `requirePortalRole`, `portalError`, `logPortalActivity` (Task 6); `portalStorage` (Task 4); `assignDriverToReservation`, `getDriverAssignments` (Task 5); `notifyStaffOfPortalEvent` (Task 5); `resolveDocumentFilePath` from `server/services/document-paths.ts`; `createSecureMulterFilter`, `sanitizeFilename`, `validateAfterUpload` from `server/utils/security/fileUploadSecurity.ts`; `getUploadsDir` from `shared/paths.ts`.
- Produces: `registerPortalRoutes(app: Express, deps: PortalRouteDeps)` with `PortalRouteDeps = { requirePortalUser: RequestHandler; uploadsDir: string }`. Routes (all under `/api/portal`): `GET /reservations`, `GET /reservations/:id` (includes `driverHistory`), `POST /reservations/:id/driver`, `GET /documents`, `GET /documents/:id/download`, `GET /drivers`, `POST /drivers`, `PATCH /drivers/:id`, `POST /drivers/:id/license`, `GET /drivers/:id/license`.
- Produces: `toReservationDto(r: PortalReservation, showPrices: boolean): PortalReservationDto`, `toDriverDto(d: Driver): PortalDriverDto`.

- [ ] **Step 1: Route test**

Create `server/__tests__/portal-routes.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import fs from "fs";
import path from "path";

vi.mock("../utils/email-service", () => ({ sendEmail: vi.fn(async () => true) }));
const notify = vi.fn(async () => undefined);
vi.mock("../services/portal-notifications", () => ({ notifyStaffOfPortalEvent: notify }));

import { buildPortalTestApp, createTestCustomer, createTestVehicle, createTestDriver, createTestReservation, createTestDocument, cleanupPortalTestData, TEST_EMAIL_DOMAIN } from "./portal-helpers";
import { portalStorage } from "../services/portal-storage";
import { hashPassword } from "../auth";
import { getUploadsDir } from "../../shared/paths";
import { db } from "../db";
import { documents } from "../../shared/schema";
import { eq } from "drizzle-orm";

const password = "wachtwoord-1234";

async function loginAs(app: any, email: string) {
  const agent = request.agent(app);
  const res = await agent.post("/api/portal/login").send({ email, password });
  expect(res.status).toBe(200);
  const { body } = await agent.get("/api/portal/csrf-token");
  return { agent, csrf: body.token as string };
}

describe("portal routes", () => {
  const app = buildPortalTestApp();
  let a: number, b: number, vehicleId: number, driverA: number, resA: number, resB: number, docA: number;
  const emailA = `a@${TEST_EMAIL_DOMAIN}`, emailB = `b@${TEST_EMAIL_DOMAIN}`;
  const docFile = path.join(getUploadsDir(), "__portal_test__", "test.pdf");

  beforeAll(async () => {
    await cleanupPortalTestData();
    a = (await createTestCustomer("RA")).id;
    b = (await createTestCustomer("RB")).id;
    vehicleId = (await createTestVehicle()).id;
    driverA = (await createTestDriver(a, "Driver A")).id;
    resA = (await createTestReservation({ customerId: a, vehicleId, driverId: driverA, status: "picked_up" })).id;
    resB = (await createTestReservation({ customerId: b, vehicleId })).id;
    docA = (await createTestDocument({ reservationId: resA, vehicleId, documentType: "Contract (Signed)" })).id;
    fs.mkdirSync(path.dirname(docFile), { recursive: true });
    fs.writeFileSync(docFile, "pdf");
    for (const [cid, email] of [[a, emailA], [b, emailB]] as const) {
      const u = await portalStorage.createPortalUser({ customerId: cid, email, fullName: "U", role: "admin" }, "t");
      await portalStorage.updatePortalUser(u.id, { passwordHash: await hashPassword(password) });
    }
  });
  afterAll(async () => { await cleanupPortalTestData(); fs.rmSync(path.dirname(docFile), { recursive: true, force: true }); });

  it("lists own reservations only, without prices by default", async () => {
    const { agent } = await loginAs(app, emailA);
    const res = await agent.get("/api/portal/reservations");
    expect(res.body.map((r: any) => r.id)).toEqual([resA]);
    expect(res.body[0]).not.toHaveProperty("totalPrice");
    expect(res.body[0].vehicle.id).toBe(vehicleId);
  });

  it("returns 404 for another customer's reservation and document", async () => {
    const { agent } = await loginAs(app, emailB);
    expect((await agent.get(`/api/portal/reservations/${resA}`)).status).toBe(404);
    expect((await agent.get(`/api/portal/documents/${docA}/download`)).status).toBe(404);
  });

  it("downloads an own contract and logs it", async () => {
    const { agent } = await loginAs(app, emailA);
    const res = await agent.get(`/api/portal/documents/${docA}/download`);
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toContain("test.pdf");
    const log = await portalStorage.listActivity({ customerId: a, limit: 5 });
    expect(log.some((l) => l.action === "document_downloaded" && l.entityId === docA)).toBe(true);
  });

  it("hides documents when contracts are switched off", async () => {
    await portalStorage.updateCustomerSettings(a, { canViewContracts: false }, "t");
    const { agent } = await loginAs(app, emailA);
    const res = await agent.get("/api/portal/documents");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PORTAL_FEATURE_DISABLED");
    await portalStorage.updateCustomerSettings(a, { canViewContracts: true }, "t");
  });

  it("manages drivers and changes the driver of a running rental", async () => {
    const { agent, csrf } = await loginAs(app, emailA);
    const created = await agent.post("/api/portal/drivers").set("X-CSRF-Token", csrf).send({ displayName: "Nieuwe", email: "n@x.nl" });
    expect(created.status).toBe(201);
    const list = await agent.get("/api/portal/drivers");
    expect(list.body.map((d: any) => d.displayName)).toEqual(["Driver A", "Nieuwe"]);

    const change = await agent.post(`/api/portal/reservations/${resA}/driver`).set("X-CSRF-Token", csrf).send({ driverId: created.body.id, note: "vakantie" });
    expect(change.status).toBe(200);
    expect(change.body.driver.id).toBe(created.body.id);
    expect(change.body.driverHistory).toHaveLength(2);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ kind: "portal_driver_change", customerId: a }));

    const foreign = await agent.post(`/api/portal/reservations/${resB}/driver`).set("X-CSRF-Token", csrf).send({ driverId: created.body.id });
    expect(foreign.status).toBe(404);
  });

  it("deactivates instead of deleting", async () => {
    const { agent, csrf } = await loginAs(app, emailA);
    const res = await agent.patch(`/api/portal/drivers/${driverA}`).set("X-CSRF-Token", csrf).send({ status: "inactive" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("inactive");
    expect((await agent.delete(`/api/portal/drivers/${driverA}`).set("X-CSRF-Token", csrf)).status).toBe(404);
  });

  it("driver-role users cannot manage drivers", async () => {
    const du = await portalStorage.createPortalUser({ customerId: a, email: `d@${TEST_EMAIL_DOMAIN}`, fullName: "D", role: "driver", driverId: driverA }, "t");
    await portalStorage.updatePortalUser(du.id, { passwordHash: await hashPassword(password) });
    const { agent, csrf } = await loginAs(app, `d@${TEST_EMAIL_DOMAIN}`);
    const res = await agent.post("/api/portal/drivers").set("X-CSRF-Token", csrf).send({ displayName: "X" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PORTAL_ROLE_FORBIDDEN");
  });
});
```

- [ ] **Step 2: Register routes in the test app**

In `server/__tests__/portal-helpers.ts` replace the `void requirePortalUser;` line with:

```ts
  registerPortalRoutes(app, { requirePortalUser, uploadsDir: getUploadsDir() });
```

and add the imports `import { registerPortalRoutes } from "../routes/portal";` and `import { getUploadsDir } from "../../shared/paths";`.

Run: `npx vitest run server/__tests__/portal-routes.test.ts` — Expected: FAIL, cannot find module `../routes/portal`.

- [ ] **Step 3: Implement `server/routes/portal.ts`**

```ts
import type { Express, RequestHandler, Request, Response } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { z } from "zod";
import { portalStorage, type PortalReservation } from "../services/portal-storage";
import { requireFeature, requirePortalRole, portalError, logPortalActivity } from "../portal-auth";
import { assignDriverToReservation, getDriverAssignments } from "../services/driver-assignments";
import { notifyStaffOfPortalEvent } from "../services/portal-notifications";
import { resolveDocumentFilePath } from "../services/document-paths";
import { createSecureMulterFilter, sanitizeFilename, validateAfterUpload } from "../utils/security/fileUploadSecurity";
import { storage } from "../storage";
import { PORTAL_ERROR, type PortalReservationDto, type PortalDocumentDto, type PortalDriverDto } from "../../shared/portal-types";
import type { Driver } from "../../shared/schema";

export interface PortalRouteDeps {
  requirePortalUser: RequestHandler;
  uploadsDir: string;
}

const ACTIVE_STATUSES = ["booked", "picked_up"];

export function toReservationDto(r: PortalReservation, showPrices: boolean): PortalReservationDto {
  const dto: PortalReservationDto = {
    id: r.id, status: r.status, type: r.type,
    startDate: r.startDate, endDate: r.endDate, startTime: r.startTime, endTime: r.endTime,
    actualPickupDate: r.actualPickupDate, actualReturnDate: r.actualReturnDate,
    pickupMileage: r.pickupMileage, returnMileage: r.returnMileage,
    contractNumber: r.contractNumber,
    vehicle: r.vehicle ? { id: r.vehicle.id, licensePlate: r.vehicle.licensePlate, brand: r.vehicle.brand, model: r.vehicle.model } : null,
    driver: r.driver ? { id: r.driver.id, displayName: r.driver.displayName } : null,
    replacementForReservationId: r.replacementForReservationId,
    totalPrice: null,
  };
  if (showPrices) dto.totalPrice = r.totalPrice;
  else delete (dto as Partial<PortalReservationDto>).totalPrice;
  return dto;
}

export function toDriverDto(d: Driver): PortalDriverDto {
  return {
    id: d.id, displayName: d.displayName, firstName: d.firstName, lastName: d.lastName,
    email: d.email, phone: d.phone, driverLicenseNumber: d.driverLicenseNumber,
    licenseExpiry: d.licenseExpiry, status: d.status, hasLicenseFile: Boolean(d.licenseFilePath),
  };
}

const driverInputSchema = z.object({
  displayName: z.string().trim().min(1).max(200),
  firstName: z.string().trim().max(100).nullable().optional(),
  lastName: z.string().trim().max(100).nullable().optional(),
  email: z.union([z.string().email(), z.literal("")]).nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  driverLicenseNumber: z.string().trim().max(50).nullable().optional(),
  licenseExpiry: z.string().trim().max(20).nullable().optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

function idParam(req: Request, res: Response): number | null {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) { portalError(res, 400, PORTAL_ERROR.VALIDATION, "Invalid id"); return null; }
  return id;
}

export function registerPortalRoutes(app: Express, deps: PortalRouteDeps): void {
  const { requirePortalUser, uploadsDir } = deps;
  const ctxOf = (req: Request) => req.portalUser!;

  // ---- reservations ---------------------------------------------------------
  app.get("/api/portal/reservations", requirePortalUser, async (req, res) => {
    const ctx = ctxOf(req);
    const rows = await portalStorage.listReservationsForCustomer(ctx.customerId, ctx.scope);
    res.json(rows.map((r) => toReservationDto(r, ctx.settings.showPrices)));
  });

  app.get("/api/portal/reservations/:id", requirePortalUser, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const ctx = ctxOf(req);
    const r = await portalStorage.getReservationForCustomer(id, ctx.customerId, ctx.scope);
    if (!r) return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Reservation not found");
    const history = await getDriverAssignments(id);
    res.json({ ...toReservationDto(r, ctx.settings.showPrices), driverHistory: history });
  });

  app.post("/api/portal/reservations/:id/driver", requirePortalUser, requireFeature("canManageDrivers"), requirePortalRole("admin"), async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const ctx = ctxOf(req);
    const parsed = z.object({ driverId: z.number().int().positive(), note: z.string().trim().max(500).optional() }).safeParse(req.body);
    if (!parsed.success) return portalError(res, 400, PORTAL_ERROR.VALIDATION, "driverId is required");
    const r = await portalStorage.getReservationForCustomer(id, ctx.customerId, ctx.scope);
    if (!r) return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Reservation not found");
    if (!ACTIVE_STATUSES.includes(r.status)) return portalError(res, 400, PORTAL_ERROR.VALIDATION, "Only booked or running rentals can change driver");
    const driver = await portalStorage.getDriverForCustomer(parsed.data.driverId, ctx.customerId);
    if (!driver || driver.status !== "active") return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Driver not found");

    await assignDriverToReservation({ reservationId: id, driverId: driver.id, byPortalUserId: ctx.user.id, note: parsed.data.note });
    await logPortalActivity(req, "driver_assigned", { entity: "reservation", entityId: id, details: { driverId: driver.id, previousDriverId: r.driverId } });
    await notifyStaffOfPortalEvent({
      kind: "portal_driver_change",
      title: `Bestuurder gewijzigd: ${r.vehicle?.licensePlate ?? `#${id}`}`,
      description: `${ctx.user.fullName} heeft ${driver.displayName} als bestuurder ingesteld${r.driver ? ` (was ${r.driver.displayName})` : ""}.`,
      link: `/reservations/edit/${id}`,
      customerId: ctx.customerId,
    });
    const updated = await portalStorage.getReservationForCustomer(id, ctx.customerId, ctx.scope);
    res.json({ ...toReservationDto(updated!, ctx.settings.showPrices), driverHistory: await getDriverAssignments(id) });
  });

  // ---- documents ------------------------------------------------------------
  app.get("/api/portal/documents", requirePortalUser, requireFeature("canViewContracts"), async (req, res) => {
    const ctx = ctxOf(req);
    const docs = await portalStorage.listDocumentsForCustomer(ctx.customerId, ctx.scope);
    const dto: PortalDocumentDto[] = docs.map((d) => ({
      id: d.id, reservationId: d.reservationId, documentType: d.documentType, kind: d.kind,
      fileName: d.fileName, uploadDate: d.uploadDate.toISOString(),
    }));
    res.json(dto);
  });

  app.get("/api/portal/documents/:id/download", requirePortalUser, requireFeature("canViewContracts"), async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const ctx = ctxOf(req);
    const doc = await portalStorage.getDocumentForCustomer(id, ctx.customerId, ctx.scope);
    const file = doc ? resolveDocumentFilePath(doc.filePath) : null;
    if (!doc || !file) return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Document not found");
    await logPortalActivity(req, "document_downloaded", { entity: "document", entityId: id });
    res.setHeader("Content-Type", doc.contentType || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${sanitizeFilename(doc.fileName)}"`);
    fs.createReadStream(file).pipe(res);
  });

  // ---- drivers ----------------------------------------------------------------
  const manageDrivers = [requirePortalUser, requireFeature("canManageDrivers"), requirePortalRole("admin")] as const;

  app.get("/api/portal/drivers", requirePortalUser, async (req, res) => {
    const ctx = ctxOf(req);
    const rows = await portalStorage.listDriversForCustomer(ctx.customerId);
    res.json(rows.map(toDriverDto));
  });

  app.post("/api/portal/drivers", ...manageDrivers, async (req, res) => {
    const ctx = ctxOf(req);
    const parsed = driverInputSchema.safeParse(req.body);
    if (!parsed.success) return portalError(res, 400, PORTAL_ERROR.VALIDATION, parsed.error.errors[0]?.message ?? "Invalid input");
    const driver = await storage.createDriver({ ...parsed.data, customerId: ctx.customerId, status: "active", createdBy: ctx.user.email, updatedBy: ctx.user.email });
    await logPortalActivity(req, "driver_created", { entity: "driver", entityId: driver.id });
    res.status(201).json(toDriverDto(driver));
  });

  app.patch("/api/portal/drivers/:id", ...manageDrivers, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const ctx = ctxOf(req);
    const existing = await portalStorage.getDriverForCustomer(id, ctx.customerId);
    if (!existing) return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Driver not found");
    const parsed = driverInputSchema.partial().safeParse(req.body);
    if (!parsed.success) return portalError(res, 400, PORTAL_ERROR.VALIDATION, parsed.error.errors[0]?.message ?? "Invalid input");
    const driver = await storage.updateDriver(id, { ...parsed.data, updatedBy: ctx.user.email });
    await logPortalActivity(req, "driver_updated", { entity: "driver", entityId: id, details: parsed.data });
    res.json(toDriverDto(driver!));
  });

  // No hard delete from the portal: deactivate via PATCH status=inactive.
  app.delete("/api/portal/drivers/:id", requirePortalUser, (_req, res) => portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Not available"));

  const licenseUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        const dir = path.join(uploadsDir, "drivers");
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (req, file, cb) => {
        const ext = path.extname(sanitizeFilename(file.originalname));
        cb(null, `license_customer${req.portalUser?.customerId ?? "portal"}_${Date.now()}${ext}`);
      },
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: createSecureMulterFilter("document"),
  });

  app.post("/api/portal/drivers/:id/license", ...manageDrivers, licenseUpload.single("licenseFile"), async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const ctx = ctxOf(req);
    const existing = await portalStorage.getDriverForCustomer(id, ctx.customerId);
    if (!existing) return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "Driver not found");
    if (!req.file) return portalError(res, 400, PORTAL_ERROR.VALIDATION, "No file uploaded");
    const check = await validateAfterUpload(req.file.path, req.file.originalname, req.file.mimetype, "document");
    if (!check.valid) { fs.rmSync(req.file.path, { force: true }); return portalError(res, 400, PORTAL_ERROR.VALIDATION, check.error ?? "Invalid file"); }
    const driver = await storage.updateDriver(id, { licenseFilePath: path.relative(process.cwd(), req.file.path), updatedBy: ctx.user.email });
    await logPortalActivity(req, "driver_license_uploaded", { entity: "driver", entityId: id });
    res.json(toDriverDto(driver!));
  });

  app.get("/api/portal/drivers/:id/license", ...manageDrivers, async (req, res) => {
    const id = idParam(req, res); if (id === null) return;
    const ctx = ctxOf(req);
    const driver = await portalStorage.getDriverForCustomer(id, ctx.customerId);
    const file = driver?.licenseFilePath ? resolveDocumentFilePath(driver.licenseFilePath) : null;
    if (!driver || !file) return portalError(res, 404, PORTAL_ERROR.NOT_FOUND, "No licence file");
    res.setHeader("Content-Disposition", `inline; filename="${sanitizeFilename(path.basename(file))}"`);
    fs.createReadStream(file).pipe(res);
  });
}
```

If `validateAfterUpload` returns a differently named field than `error`, use the field `fileUploadSecurity.ts` actually returns (`FileValidationResult`).

- [ ] **Step 4: Mount in `server/index.ts`**

Replace `void requirePortalUser;` with:

```ts
registerPortalRoutes(app, { requirePortalUser, uploadsDir: getUploadsDir() });
```

imports: `import { registerPortalRoutes } from "./routes/portal";` and `import { getUploadsDir } from "../shared/paths";` (check whether `getUploadsDir` is already imported in index.ts; reuse it if so).

- [ ] **Step 5: Run tests and tsc**

Run: `npx vitest run server/__tests__/portal-routes.test.ts && npm run check` — Expected: 7 passed, 0 errors.

- [ ] **Step 6: Commit**

```bash
git add server/routes/portal.ts server/index.ts server/__tests__/portal-helpers.ts server/__tests__/portal-routes.test.ts
git commit -m "feat(portal): customer API for reservations, contracts, drivers and driver changes"
```

---
### Task 8: Staff admin API

**Files:**
- Create: `server/routes/portal-admin.ts`
- Modify: `server/routes.ts` (register next to `registerUserRoutes(app, routeDeps)` ~line 265)
- Test: `server/__tests__/portal-admin-routes.test.ts`

**Interfaces:**
- Consumes: `RouteDeps` (`server/routes/deps.ts`), `hasPermission`, `UserPermission.MANAGE_PORTAL` / `VIEW_PORTAL`, `portalStorage`, `sendPortalInvite`, `savePortalConfig`/`getPortalConfig`, `AuditLogger`, `storage.getAllVehicles`/`updateVehicle`.
- Produces: `registerPortalAdminRoutes(app: Express, deps: RouteDeps)`. Routes under `/api/portal-admin`:
  - `GET /accounts` (all, with `customerName`), `GET /customers/:customerId/accounts`
  - `POST /customers/:customerId/accounts` `{ email, fullName, role, driverId? }` → creates + sends invite; returns `{ account, inviteSent }`
  - `PATCH /accounts/:id` `{ fullName?, role?, driverId?, active? }`
  - `POST /accounts/:id/invite` (re-send invite or reset; body `{ kind: 'invite' | 'reset' }`)
  - `DELETE /accounts/:id` (only when `passwordHash` is null)
  - `GET /customers/:customerId/settings`, `PATCH /customers/:customerId/settings`
  - `GET /activity?customerId=&limit=`
  - `GET /vehicles-online` (id, licensePlate, brand, model, availabilityStatus, offeredOnline, onlineDescription), `PATCH /vehicles-online/:id` `{ offeredOnline?, onlineDescription? }`, `POST /vehicles-online/bulk` `{ ids: number[], offeredOnline: boolean }`
  - `GET /config`, `PUT /config`
- Every response uses the staff convention `{ message }` on errors (not the portal `{ error, code }`).

- [ ] **Step 1: Admin route test**

Create `server/__tests__/portal-admin-routes.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";

const sendEmail = vi.fn(async () => true);
vi.mock("../utils/email-service", () => ({ sendEmail }));

import { registerPortalAdminRoutes } from "../routes/portal-admin";
import { createTestCustomer, createTestVehicle, createTestDriver, cleanupPortalTestData, TEST_EMAIL_DOMAIN } from "./portal-helpers";
import { portalStorage } from "../services/portal-storage";
import { UserPermission } from "../../shared/schema";

function staffApp(permissions: string[]) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: 1, username: "staff-test", role: "manager", permissions };
    (req as any).isAuthenticated = () => true;
    next();
  });
  registerPortalAdminRoutes(app, { requireAuth: (_r, _s, n) => n() } as any);
  return app;
}

describe("portal admin routes", () => {
  const app = staffApp([UserPermission.MANAGE_PORTAL]);
  const viewer = staffApp([UserPermission.VIEW_PORTAL]);
  let customerId: number, driverId: number, vehicleId: number, accountId: number;

  beforeAll(async () => {
    await cleanupPortalTestData();
    customerId = (await createTestCustomer("Adm")).id;
    driverId = (await createTestDriver(customerId)).id;
    vehicleId = (await createTestVehicle()).id;
  });
  afterAll(cleanupPortalTestData);

  it("creates an account and sends the invitation", async () => {
    const res = await request(app).post(`/api/portal-admin/customers/${customerId}/accounts`)
      .send({ email: `adm@${TEST_EMAIL_DOMAIN}`, fullName: "Adm", role: "admin" });
    expect(res.status).toBe(201);
    expect(res.body.inviteSent).toBe(true);
    accountId = res.body.account.id;
    expect(res.body.account).not.toHaveProperty("passwordHash");
    expect(res.body.account).not.toHaveProperty("inviteTokenHash");
  });

  it("rejects a driver account whose driver belongs to another customer", async () => {
    const other = await createTestCustomer("Adm2");
    const foreign = await createTestDriver(other.id);
    const res = await request(app).post(`/api/portal-admin/customers/${customerId}/accounts`)
      .send({ email: `drv@${TEST_EMAIL_DOMAIN}`, fullName: "D", role: "driver", driverId: foreign.id });
    expect(res.status).toBe(400);
    const ok = await request(app).post(`/api/portal-admin/customers/${customerId}/accounts`)
      .send({ email: `drv@${TEST_EMAIL_DOMAIN}`, fullName: "D", role: "driver", driverId });
    expect(ok.status).toBe(201);
  });

  it("viewers can read but not change", async () => {
    expect((await request(viewer).get(`/api/portal-admin/customers/${customerId}/accounts`)).status).toBe(200);
    expect((await request(viewer).patch(`/api/portal-admin/accounts/${accountId}`).send({ active: false })).status).toBe(403);
  });

  it("updates switches and deletes a never-activated account", async () => {
    const s = await request(app).patch(`/api/portal-admin/customers/${customerId}/settings`).send({ canSubmitRequests: false, internalNotes: "Wil alleen bellen" });
    expect(s.status).toBe(200);
    expect(s.body.canSubmitRequests).toBe(false);
    expect((await request(app).delete(`/api/portal-admin/accounts/${accountId}`)).status).toBe(200);
    expect(await portalStorage.getPortalUser(accountId)).toBeUndefined();
  });

  it("toggles vehicles online, singly and in bulk", async () => {
    const one = await request(app).patch(`/api/portal-admin/vehicles-online/${vehicleId}`).send({ offeredOnline: true, onlineDescription: "Bestelbus L2H2" });
    expect(one.body.offeredOnline).toBe(true);
    const bulk = await request(app).post(`/api/portal-admin/vehicles-online/bulk`).send({ ids: [vehicleId], offeredOnline: false });
    expect(bulk.body.updated).toBe(1);
    const list = await request(app).get(`/api/portal-admin/vehicles-online`);
    expect(list.body.find((v: any) => v.id === vehicleId).offeredOnline).toBe(false);
  });

  it("saves and reads config", async () => {
    const put = await request(app).put(`/api/portal-admin/config`).send({ allowedFrameOrigins: ["https://lamgroep.nl", "http://lamgroep.local"], notificationEmail: `staff@${TEST_EMAIL_DOMAIN}`, portalBaseUrl: "https://portaal.lamgroep.nl" });
    expect(put.status).toBe(200);
    const get = await request(app).get(`/api/portal-admin/config`);
    expect(get.body.allowedFrameOrigins).toContain("http://lamgroep.local");
    const bad = await request(app).put(`/api/portal-admin/config`).send({ allowedFrameOrigins: ["not a url"] });
    expect(bad.status).toBe(400);
  });
});
```

- [ ] **Step 2: Implement `server/routes/portal-admin.ts`**

```ts
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { hasPermission } from "../middleware/permissions.js";
import { UserPermission, insertPortalUserSchema, updatePortalCustomerSettingsSchema, PortalUserRole, type PortalUser } from "../../shared/schema";
import { portalStorage } from "../services/portal-storage";
import { sendPortalInvite } from "../services/portal-mail";
import { getPortalConfig, savePortalConfig } from "../services/portal-config";
import { AuditLogger } from "../utils/security/auditLogger";
import type { RouteDeps } from "./deps";

const canView = hasPermission(UserPermission.VIEW_PORTAL, UserPermission.MANAGE_PORTAL);
const canManage = hasPermission(UserPermission.MANAGE_PORTAL);

function publicAccount(u: PortalUser) {
  const { passwordHash, inviteTokenHash, ...rest } = u;
  return { ...rest, activated: Boolean(passwordHash), invitePending: Boolean(inviteTokenHash) };
}

function intParam(req: Request, res: Response, name: string): number | null {
  const v = parseInt(req.params[name], 10);
  if (Number.isNaN(v)) { res.status(400).json({ message: `Invalid ${name}` }); return null; }
  return v;
}

async function driverBelongsToCustomer(driverId: number | null | undefined, customerId: number): Promise<boolean> {
  if (driverId == null) return true;
  const d = await portalStorage.getDriverForCustomer(driverId, customerId);
  return Boolean(d);
}

export function registerPortalAdminRoutes(app: Express, _deps: RouteDeps): void {
  const actor = (req: Request) => req.user?.username ?? "system";

  // ---- accounts ---------------------------------------------------------------
  app.get("/api/portal-admin/accounts", canView, async (_req, res) => {
    const rows = await portalStorage.listAllPortalUsers();
    res.json(rows.map((r) => ({ ...publicAccount(r), customerName: r.customerName })));
  });

  app.get("/api/portal-admin/customers/:customerId/accounts", canView, async (req, res) => {
    const customerId = intParam(req, res, "customerId"); if (customerId === null) return;
    res.json((await portalStorage.listPortalUsersByCustomer(customerId)).map(publicAccount));
  });

  app.post("/api/portal-admin/customers/:customerId/accounts", canManage, async (req, res) => {
    const customerId = intParam(req, res, "customerId"); if (customerId === null) return;
    if (!(await storage.getCustomer(customerId))) return res.status(404).json({ message: "Customer not found" });
    const parsed = insertPortalUserSchema.safeParse({ ...req.body, customerId });
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid input" });
    if (!(await driverBelongsToCustomer(parsed.data.driverId, customerId))) return res.status(400).json({ message: "Driver does not belong to this customer" });
    if (await portalStorage.getPortalUserByEmail(parsed.data.email)) return res.status(400).json({ message: "An account with this e-mail already exists" });

    const account = await portalStorage.createPortalUser(parsed.data, actor(req));
    let inviteSent = false;
    try { inviteSent = (await sendPortalInvite(account, "invite")).sent; } catch (error) { console.error("portal invite failed:", error); }
    await AuditLogger.logFromRequest(req, "portal_account.create", "portal_user", String(account.id), { email: account.email, customerId, inviteSent });
    res.status(201).json({ account: publicAccount((await portalStorage.getPortalUser(account.id))!), inviteSent });
  });

  app.patch("/api/portal-admin/accounts/:id", canManage, async (req, res) => {
    const id = intParam(req, res, "id"); if (id === null) return;
    const existing = await portalStorage.getPortalUser(id);
    if (!existing) return res.status(404).json({ message: "Account not found" });
    const parsed = z.object({
      fullName: z.string().trim().min(1).max(200).optional(),
      role: z.enum([PortalUserRole.ADMIN, PortalUserRole.DRIVER]).optional(),
      driverId: z.number().int().positive().nullable().optional(),
      active: z.boolean().optional(),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid input" });
    const role = parsed.data.role ?? existing.role;
    const driverId = parsed.data.driverId === undefined ? existing.driverId : parsed.data.driverId;
    if (role === PortalUserRole.DRIVER && driverId == null) return res.status(400).json({ message: "A driver account must be linked to a driver" });
    if (!(await driverBelongsToCustomer(driverId, existing.customerId))) return res.status(400).json({ message: "Driver does not belong to this customer" });
    const updated = await portalStorage.updatePortalUser(id, { ...parsed.data, role, driverId, updatedBy: actor(req) });
    await AuditLogger.logFromRequest(req, "portal_account.update", "portal_user", String(id), parsed.data);
    res.json(publicAccount(updated!));
  });

  app.post("/api/portal-admin/accounts/:id/invite", canManage, async (req, res) => {
    const id = intParam(req, res, "id"); if (id === null) return;
    const user = await portalStorage.getPortalUser(id);
    if (!user) return res.status(404).json({ message: "Account not found" });
    const kind = req.body?.kind === "reset" ? "reset" : "invite";
    const result = await sendPortalInvite(user, kind);
    await AuditLogger.logFromRequest(req, `portal_account.${kind}`, "portal_user", String(id), { sent: result.sent });
    res.json({ sent: result.sent });
  });

  app.delete("/api/portal-admin/accounts/:id", canManage, async (req, res) => {
    const id = intParam(req, res, "id"); if (id === null) return;
    const user = await portalStorage.getPortalUser(id);
    if (!user) return res.status(404).json({ message: "Account not found" });
    if (user.passwordHash) return res.status(400).json({ message: "Activated accounts are blocked, not deleted" });
    await portalStorage.deletePortalUser(id);
    await AuditLogger.logFromRequest(req, "portal_account.delete", "portal_user", String(id), { email: user.email });
    res.json({ ok: true });
  });

  // ---- customer settings ---------------------------------------------------------
  app.get("/api/portal-admin/customers/:customerId/settings", canView, async (req, res) => {
    const customerId = intParam(req, res, "customerId"); if (customerId === null) return;
    res.json(await portalStorage.getOrCreateCustomerSettings(customerId));
  });

  app.patch("/api/portal-admin/customers/:customerId/settings", canManage, async (req, res) => {
    const customerId = intParam(req, res, "customerId"); if (customerId === null) return;
    const parsed = updatePortalCustomerSettingsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid input" });
    const row = await portalStorage.updateCustomerSettings(customerId, parsed.data, actor(req));
    await AuditLogger.logFromRequest(req, "portal_settings.update", "customer", String(customerId), parsed.data);
    res.json(row);
  });

  // ---- activity ------------------------------------------------------------------
  app.get("/api/portal-admin/activity", canView, async (req, res) => {
    const customerId = req.query.customerId ? parseInt(String(req.query.customerId), 10) : undefined;
    const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 500);
    res.json(await portalStorage.listActivity({ customerId: Number.isNaN(customerId) ? undefined : customerId, limit }));
  });

  // ---- vehicles offered online -------------------------------------------------
  app.get("/api/portal-admin/vehicles-online", canView, async (_req, res) => {
    const all = await storage.getAllVehicles();
    res.json(all.map((v) => ({
      id: v.id, licensePlate: v.licensePlate, brand: v.brand, model: v.model, vehicleType: v.vehicleType,
      availabilityStatus: v.availabilityStatus, offeredOnline: v.offeredOnline, onlineDescription: v.onlineDescription,
      dailyPrice: v.dailyPrice, monthlyPrice: v.monthlyPrice,
    })));
  });

  app.patch("/api/portal-admin/vehicles-online/:id", canManage, async (req, res) => {
    const id = intParam(req, res, "id"); if (id === null) return;
    const parsed = z.object({ offeredOnline: z.boolean().optional(), onlineDescription: z.string().max(2000).nullable().optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input" });
    const v = await storage.updateVehicle(id, { ...parsed.data, updatedBy: actor(req) });
    if (!v) return res.status(404).json({ message: "Vehicle not found" });
    res.json({ id: v.id, offeredOnline: v.offeredOnline, onlineDescription: v.onlineDescription });
  });

  app.post("/api/portal-admin/vehicles-online/bulk", canManage, async (req, res) => {
    const parsed = z.object({ ids: z.array(z.number().int().positive()).min(1).max(500), offeredOnline: z.boolean() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input" });
    let updated = 0;
    for (const id of parsed.data.ids) {
      if (await storage.updateVehicle(id, { offeredOnline: parsed.data.offeredOnline, updatedBy: actor(req) })) updated += 1;
    }
    await AuditLogger.logFromRequest(req, "vehicle.online_bulk", "vehicle", undefined, { ids: parsed.data.ids, offeredOnline: parsed.data.offeredOnline });
    res.json({ updated });
  });

  // ---- config ------------------------------------------------------------------------
  app.get("/api/portal-admin/config", canView, async (_req, res) => res.json(await getPortalConfig()));

  app.put("/api/portal-admin/config", canManage, async (req, res) => {
    try {
      const saved = await savePortalConfig(req.body, actor(req));
      await AuditLogger.logFromRequest(req, "portal_config.update", "app_setting", "portal_config", saved as unknown as Record<string, unknown>);
      res.json(saved);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: error.errors[0]?.message ?? "Invalid config" });
      throw error;
    }
  });
}
```

Check `AuditLogger.logFromRequest`'s exact signature in `server/utils/security/auditLogger.ts` (lines 75-95: `(req, action, resourceType?, resourceId?, details?)`) and match it. If `storage.getAllVehicles` is named differently in `IStorage` (search `getAllVehicles\|getVehicles(` in `server/storage.ts`), use that name.

- [ ] **Step 3: Register in `server/routes.ts`**

Next to `registerUserRoutes(app, routeDeps);`:

```ts
  registerPortalAdminRoutes(app, routeDeps);
```

with `import { registerPortalAdminRoutes } from "./routes/portal-admin";`.

- [ ] **Step 4: Run tests and tsc**

Run: `npx vitest run server/__tests__/portal-admin-routes.test.ts && npm run check` — Expected: 6 passed, 0 errors.

- [ ] **Step 5: Run the whole server suite once**

Run: `npm test` — Expected: every file passes. Fix any cross-file leftovers (the fixtures clean by prefix, so an aborted earlier run cannot poison a later one).

- [ ] **Step 6: Commit**

```bash
git add server/routes/portal-admin.ts server/routes.ts server/__tests__/portal-admin-routes.test.ts
git commit -m "feat(portal): staff API for portal accounts, customer switches, activity, online vehicles and config"
```

---
### Task 9: Portal client foundation (API wrapper, auth provider, layout, login, activation, routing, i18n)

The portal client never uses `apiRequest`/`getQueryFn` from `queryClient.ts`: those call `invokeSessionExpired` on 401, which would fire the *staff* logout handler and redirect to `/auth`.

**Files:**
- Create: `client/src/lib/portal-api.ts`
- Modify: `client/src/lib/csrf-fetch-interceptor.ts`
- Create: `client/src/hooks/use-portal-auth.tsx`
- Create: `client/src/layouts/PortalLayout.tsx`
- Create: `client/src/pages/portal/login.tsx`, `client/src/pages/portal/activate.tsx`, `client/src/pages/portal/index.tsx` (route switch), `client/src/pages/portal/overview.tsx` (placeholder filled in Task 10)
- Create: `client/src/locales/nl/portal.json`, `client/src/locales/en/portal.json`
- Modify: `client/src/i18n.ts`, `client/src/App.tsx`

**Interfaces:**
- Produces: `portalFetch<T>(method, url, body?): Promise<T>` throwing `PortalApiError { status, code, message }`; `portalQueryFn` for `useQuery` with keys `['portal', <url>]`; `usePortalAuth(): { me: PortalMe | null; isLoading: boolean; refresh(); logout() }`; `PortalAuthProvider`; `PortalLayout` with `usePortalHeightReporter`; route tree under `/portaal`.
- i18n namespace `portal`.

- [ ] **Step 1: API wrapper**

Create `client/src/lib/portal-api.ts`:

```ts
import type { PortalErrorCode } from "@shared/portal-types";

export class PortalApiError extends Error {
  status: number;
  code: PortalErrorCode | string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function csrfToken(): string | null {
  const m = document.cookie.match(/PORTAL-XSRF-TOKEN=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export async function portalFetch<T = unknown>(method: string, url: string, body?: unknown | FormData): Promise<T> {
  const headers: Record<string, string> = {};
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  if (body !== undefined && !isForm) headers["Content-Type"] = "application/json";
  if (!["GET", "HEAD"].includes(method)) {
    const token = csrfToken();
    if (token) headers["X-CSRF-Token"] = token;
  }
  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    credentials: "include",
    cache: "no-store",
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) {
    throw new PortalApiError(res.status, data?.code ?? "PORTAL_SERVER_ERROR", data?.error ?? data?.message ?? res.statusText);
  }
  return data as T;
}

/** For useQuery: queryKey = ['portal', '/api/portal/…'] */
export async function portalQueryFn<T>({ queryKey }: { queryKey: readonly unknown[] }): Promise<T> {
  return portalFetch<T>("GET", String(queryKey[1]));
}
```

- [ ] **Step 2: CSRF interceptor knows the portal cookie**

In `client/src/lib/csrf-fetch-interceptor.ts` change `getCsrfTokenFromCookie` to take the URL into account:

```ts
function getCsrfTokenFromCookie(pathname: string): string | null {
  const name = pathname.startsWith("/api/portal/") || pathname === "/api/portal" ? "PORTAL-XSRF-TOKEN" : "XSRF-TOKEN";
  const match = document.cookie.match(new RegExp(`${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}
```

and in the patched `fetch` compute `const pathname = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.origin).pathname;` before `getCsrfTokenFromCookie(pathname)`. Raw `fetch` calls from portal pages (file uploads) then get the right header too.

- [ ] **Step 3: Auth provider**

Create `client/src/hooks/use-portal-auth.tsx`:

```tsx
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { PortalMe } from "@shared/portal-types";
import { portalFetch, PortalApiError } from "@/lib/portal-api";

interface PortalAuthContextValue {
  me: PortalMe | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const PortalAuthContext = createContext<PortalAuthContextValue | null>(null);
export const PORTAL_ME_KEY = ["portal", "/api/portal/me"] as const;

export function PortalAuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { i18n } = useTranslation();

  const { data, isLoading } = useQuery<PortalMe | null>({
    queryKey: PORTAL_ME_KEY,
    queryFn: async () => {
      try {
        return await portalFetch<PortalMe>("GET", "/api/portal/me");
      } catch (e) {
        if (e instanceof PortalApiError && (e.status === 401 || e.status === 403)) return null;
        throw e;
      }
    },
    staleTime: 60_000,
    retry: false,
  });

  // The portal follows the customer's preferred language, not the browser's.
  useEffect(() => {
    if (data?.language && i18n.language !== data.language) i18n.changeLanguage(data.language);
  }, [data?.language, i18n]);

  const refresh = async () => { await queryClient.invalidateQueries({ queryKey: PORTAL_ME_KEY }); };
  const logout = async () => {
    try { await portalFetch("POST", "/api/portal/logout"); } catch { /* session already gone */ }
    queryClient.removeQueries({ queryKey: ["portal"] });
    queryClient.setQueryData(PORTAL_ME_KEY, null);
  };

  return (
    <PortalAuthContext.Provider value={{ me: data ?? null, isLoading, refresh, logout }}>
      {children}
    </PortalAuthContext.Provider>
  );
}

export function usePortalAuth(): PortalAuthContextValue {
  const ctx = useContext(PortalAuthContext);
  if (!ctx) throw new Error("usePortalAuth must be used within PortalAuthProvider");
  return ctx;
}
```

- [ ] **Step 4: Layout with tabs and iframe height reporting**

Create `client/src/layouts/PortalLayout.tsx`:

```tsx
import { useEffect, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { usePortalAuth } from "@/hooks/use-portal-auth";
import { LogOut, Loader2 } from "lucide-react";

/** Tells the embedding website how tall the document is, so the iframe can grow. */
export function usePortalHeightReporter() {
  useEffect(() => {
    if (window.parent === window) return;
    const send = () => window.parent.postMessage({ type: "lamgroep-portal:height", height: document.documentElement.scrollHeight }, "*");
    send();
    const observer = new ResizeObserver(send);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, []);
}

interface TabDef { href: string; key: string; show: boolean }

export function PortalLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation("portal");
  const { me, isLoading, logout } = usePortalAuth();
  const [location, navigate] = useLocation();
  usePortalHeightReporter();

  useEffect(() => {
    if (!isLoading && !me && !location.startsWith("/portaal/login") && !location.startsWith("/portaal/activeren")) {
      navigate("/portaal/login", { replace: true });
    }
  }, [isLoading, me, location, navigate]);

  if (isLoading) {
    return <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (!me) return <div className="mx-auto max-w-md p-4">{children}</div>;

  const tabs: TabDef[] = [
    { href: "/portaal", key: "tabs.overview", show: true },
    { href: "/portaal/reserveringen", key: "tabs.reservations", show: true },
    { href: "/portaal/documenten", key: "tabs.documents", show: me.settings.canViewContracts },
    { href: "/portaal/bestuurders", key: "tabs.drivers", show: me.settings.canManageDrivers && me.role === "admin" },
    { href: "/portaal/account", key: "tabs.account", show: true },
  ];

  return (
    <div className="mx-auto max-w-5xl p-4 space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
        <div>
          <div className="text-lg font-semibold">{me.customerName}</div>
          <div className="text-sm text-muted-foreground">{me.fullName}</div>
        </div>
        <Button variant="outline" size="sm" onClick={() => logout().then(() => navigate("/portaal/login"))}>
          <LogOut className="mr-2 h-4 w-4" />{t("actions.logout")}
        </Button>
      </header>
      <nav className="flex flex-wrap gap-1 border-b">
        {tabs.filter((tab) => tab.show).map((tab) => {
          const active = tab.href === "/portaal" ? location === "/portaal" : location.startsWith(tab.href);
          return (
            <Link key={tab.href} href={tab.href}
              className={`px-3 py-2 text-sm border-b-2 -mb-px ${active ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {t(tab.key)}
            </Link>
          );
        })}
      </nav>
      <main>{children}</main>
    </div>
  );
}
```

- [ ] **Step 5: Login and activation pages**

Create `client/src/pages/portal/login.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { portalFetch, PortalApiError } from "@/lib/portal-api";
import { usePortalAuth } from "@/hooks/use-portal-auth";

export default function PortalLoginPage() {
  const { t } = useTranslation("portal");
  const { refresh } = usePortalAuth();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setInfo(null);
    try {
      if (mode === "forgot") {
        await portalFetch("POST", "/api/portal/forgot", { email });
        setInfo(t("login.forgotSent"));
      } else {
        await portalFetch("POST", "/api/portal/login", { email, password });
        await refresh();
        navigate("/portaal");
      }
    } catch (err) {
      const code = err instanceof PortalApiError ? err.code : "PORTAL_SERVER_ERROR";
      setError(t(`errors.${code}`, { defaultValue: t("errors.PORTAL_SERVER_ERROR") }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <h1 className="text-xl font-semibold">{t("login.title")}</h1>
      <div>
        <Label htmlFor="portal-email">{t("fields.email")}</Label>
        <Input id="portal-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      {mode === "login" && (
        <div>
          <Label htmlFor="portal-password">{t("fields.password")}</Label>
          <Input id="portal-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
      )}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {info && <p className="text-sm text-green-700">{info}</p>}
      <Button type="submit" disabled={busy} className="w-full">{mode === "login" ? t("login.submit") : t("login.forgotSubmit")}</Button>
      <button type="button" className="text-sm text-muted-foreground underline" onClick={() => { setMode(mode === "login" ? "forgot" : "login"); setError(null); setInfo(null); }}>
        {mode === "login" ? t("login.forgotLink") : t("login.backToLogin")}
      </button>
    </form>
  );
}
```

Create `client/src/pages/portal/activate.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { useLocation, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { portalFetch, PortalApiError } from "@/lib/portal-api";
import { usePortalAuth } from "@/hooks/use-portal-auth";

export default function PortalActivatePage() {
  const { t } = useTranslation("portal");
  const { refresh } = usePortalAuth();
  const [, navigate] = useLocation();
  const token = new URLSearchParams(useSearch()).get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError(t("activate.mismatch")); return; }
    setBusy(true); setError(null);
    try {
      await portalFetch("POST", "/api/portal/activate", { token, password });
      await refresh();
      navigate("/portaal");
    } catch (err) {
      const code = err instanceof PortalApiError ? err.code : "PORTAL_SERVER_ERROR";
      if (code === "PORTAL_TOKEN_EXPIRED" || code === "PORTAL_TOKEN_INVALID") setExpired(true);
      setError(t(`errors.${code}`, { defaultValue: t("errors.PORTAL_SERVER_ERROR") }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <h1 className="text-xl font-semibold">{t("activate.title")}</h1>
      <p className="text-sm text-muted-foreground">{t("activate.hint")}</p>
      <div>
        <Label htmlFor="pw">{t("fields.newPassword")}</Label>
        <Input id="pw" type="password" autoComplete="new-password" minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      <div>
        <Label htmlFor="pw2">{t("fields.confirmPassword")}</Label>
        <Input id="pw2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      </div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {expired
        ? <Button type="button" variant="outline" className="w-full" onClick={() => navigate("/portaal/login")}>{t("activate.requestNewLink")}</Button>
        : <Button type="submit" disabled={busy || !token} className="w-full">{t("activate.submit")}</Button>}
    </form>
  );
}
```

- [ ] **Step 6: Portal route switch and placeholder overview**

Create `client/src/pages/portal/overview.tsx` (replaced with the real page in Task 10):

```tsx
export default function PortalOverviewPage() {
  return <div data-testid="portal-overview" />;
}
```

Create `client/src/pages/portal/index.tsx`:

```tsx
import { Route, Switch } from "wouter";
import { PortalAuthProvider } from "@/hooks/use-portal-auth";
import { PortalLayout } from "@/layouts/PortalLayout";
import PortalLoginPage from "./login";
import PortalActivatePage from "./activate";
import PortalOverviewPage from "./overview";

/** Everything under /portaal. Mounted from App.tsx with `nest`, so paths here are relative. */
export default function PortalApp() {
  return (
    <PortalAuthProvider>
      <PortalLayout>
        <Switch>
          <Route path="/login" component={PortalLoginPage} />
          <Route path="/activeren" component={PortalActivatePage} />
          <Route path="/" component={PortalOverviewPage} />
          <Route>{() => <PortalOverviewPage />}</Route>
        </Switch>
      </PortalLayout>
    </PortalAuthProvider>
  );
}
```

- [ ] **Step 7: Mount in `App.tsx`**

In `client/src/App.tsx` import `PortalApp from "@/pages/portal/index"` and, inside the outer `<Switch>` *before* the staff `<Route>` catch-all, add:

```tsx
      {/* Customer portal - own layout, own auth realm, embeddable in the website iframe */}
      <Route path="/portaal" nest>
        <PortalApp />
      </Route>
```

The staff `InactivityPrompt` and `ApkDateChangesDialog` only render when a staff `user` exists, so they stay dormant on portal pages.

- [ ] **Step 8: Translations**

Create `client/src/locales/nl/portal.json`:

```json
{
  "tabs": { "overview": "Overzicht", "reservations": "Reserveringen", "documents": "Contracten", "drivers": "Bestuurders", "account": "Mijn account" },
  "actions": { "logout": "Uitloggen", "save": "Opslaan", "cancel": "Annuleren", "download": "Downloaden", "changeDriver": "Bestuurder wijzigen", "addDriver": "Bestuurder toevoegen", "edit": "Bewerken", "deactivate": "Deactiveren", "activate": "Activeren", "uploadLicense": "Rijbewijs uploaden", "viewLicense": "Rijbewijs bekijken" },
  "fields": { "email": "E-mailadres", "password": "Wachtwoord", "newPassword": "Nieuw wachtwoord (minimaal 10 tekens)", "confirmPassword": "Herhaal wachtwoord", "currentPassword": "Huidig wachtwoord", "fullName": "Naam", "displayName": "Naam bestuurder", "firstName": "Voornaam", "lastName": "Achternaam", "phone": "Telefoon", "licenseNumber": "Rijbewijsnummer", "licenseExpiry": "Rijbewijs geldig tot", "note": "Opmerking", "driver": "Bestuurder", "vehicle": "Voertuig", "period": "Periode", "status": "Status", "pickupMileage": "Km bij ophalen", "returnMileage": "Km bij inleveren", "contractNumber": "Contractnummer", "price": "Prijs" },
  "login": { "title": "Inloggen klantenportaal", "submit": "Inloggen", "forgotLink": "Wachtwoord vergeten?", "forgotSubmit": "Herstel-link sturen", "forgotSent": "Als dit e-mailadres bekend is, is er een e-mail met een herstel-link verstuurd.", "backToLogin": "Terug naar inloggen" },
  "activate": { "title": "Wachtwoord instellen", "hint": "Kies een wachtwoord van minimaal 10 tekens.", "submit": "Wachtwoord opslaan", "mismatch": "De wachtwoorden zijn niet gelijk.", "requestNewLink": "Nieuwe link aanvragen via 'Wachtwoord vergeten'" },
  "overview": { "currentRentals": "Lopende huur", "upcoming": "Komende reserveringen", "none": "Geen reserveringen", "since": "Sinds {{date}}", "until": "Tot {{date}}", "openEnded": "Doorlopend" },
  "reservations": { "title": "Reserveringen", "empty": "Er zijn nog geen reserveringen.", "detailTitle": "Reservering", "driverHistory": "Bestuurdershistorie", "current": "huidig", "spareFor": "Vervangend voertuig voor reservering #{{id}}", "status": { "booked": "Gereserveerd", "picked_up": "In gebruik", "returned": "Ingeleverd", "completed": "Afgerond", "cancelled": "Geannuleerd" } },
  "documents": { "title": "Contracten en documenten", "empty": "Er zijn nog geen documenten.", "contract": "Contract", "damage_check": "Schadeformulier", "reservation": "Reservering #{{id}}" },
  "drivers": { "title": "Bestuurders", "empty": "Nog geen bestuurders. Voeg een bestuurder toe.", "inactive": "Inactief", "active": "Actief", "dialogTitle": "Bestuurder", "selectDriver": "Kies bestuurder", "changeDriverTitle": "Bestuurder wijzigen voor {{plate}}", "changed": "Bestuurder gewijzigd. Lam Groep is op de hoogte gebracht." },
  "account": { "title": "Mijn account", "changePassword": "Wachtwoord wijzigen", "passwordChanged": "Wachtwoord gewijzigd.", "nameSaved": "Naam opgeslagen." },
  "errors": {
    "PORTAL_NOT_AUTHENTICATED": "U bent niet ingelogd.",
    "PORTAL_INVALID_CREDENTIALS": "E-mailadres of wachtwoord is onjuist.",
    "PORTAL_ACCOUNT_BLOCKED": "Dit account is geblokkeerd. Neem contact op met Lam Groep.",
    "PORTAL_DISABLED": "Het klantenportaal is voor uw bedrijf niet actief. Neem contact op met Lam Groep.",
    "PORTAL_LOCKED": "Te veel pogingen. Probeer het over 15 minuten opnieuw.",
    "PORTAL_FEATURE_DISABLED": "Dit onderdeel is voor uw account niet beschikbaar.",
    "PORTAL_ROLE_FORBIDDEN": "U heeft hiervoor geen rechten.",
    "PORTAL_TOKEN_INVALID": "Deze link is niet (meer) geldig.",
    "PORTAL_TOKEN_EXPIRED": "Deze link is verlopen.",
    "PORTAL_VALIDATION": "Controleer de ingevulde gegevens.",
    "PORTAL_NOT_FOUND": "Niet gevonden.",
    "PORTAL_SERVER_ERROR": "Er ging iets mis. Probeer het later opnieuw."
  }
}
```

Create `client/src/locales/en/portal.json` with the same keys in English (translate every value; keep the `errors` codes and `{{…}}` placeholders identical).

In `client/src/i18n.ts` import `portalNl` / `portalEn`, add `portal: portalNl` / `portal: portalEn` to the resources and `"portal"` to the `ns` array.

- [ ] **Step 9: Type-check and check in the browser**

Run: `npm run check` — Expected: 0 errors.

Start the dev server and open `http://localhost:<PORT>/portaal/login`: the login form renders inside the narrow layout with no staff sidebar. Log in with a portal user created through the admin API (or with `node -r dotenv/config -e` against `portalStorage` + `hashPassword`) and confirm the header shows the customer name and tabs; `/portaal/activeren?token=abc` renders the activation form. Check the console for errors.

- [ ] **Step 10: Commit**

```bash
git add client/src/lib/portal-api.ts client/src/lib/csrf-fetch-interceptor.ts client/src/hooks/use-portal-auth.tsx client/src/layouts/PortalLayout.tsx client/src/pages/portal client/src/locales/nl/portal.json client/src/locales/en/portal.json client/src/i18n.ts client/src/App.tsx
git commit -m "feat(portal): portal client shell with login, activation, layout and iframe height reporting"
```

---
### Task 10: Portal pages (overview, reservations, documents, drivers, account)

**Files:**
- Replace: `client/src/pages/portal/overview.tsx`
- Create: `client/src/pages/portal/reservations.tsx`, `client/src/pages/portal/reservation-detail.tsx`, `client/src/pages/portal/documents.tsx`, `client/src/pages/portal/drivers.tsx`, `client/src/pages/portal/account.tsx`
- Create: `client/src/components/portal/reservation-card.tsx`, `client/src/components/portal/driver-form-dialog.tsx`, `client/src/components/portal/change-driver-dialog.tsx`
- Modify: `client/src/pages/portal/index.tsx` (routes)

**Interfaces:**
- Consumes: `portalFetch`, `portalQueryFn`, `usePortalAuth`, DTOs from `@shared/portal-types`; reservation detail returns `PortalReservationDto & { driverHistory: Array<{ id; driverId; driverName; assignedFrom; assignedUntil; note }> }`.
- Query keys: `['portal', '/api/portal/reservations']`, `['portal', '/api/portal/reservations/<id>']`, `['portal', '/api/portal/documents']`, `['portal', '/api/portal/drivers']`.

- [ ] **Step 1: Shared reservation card**

Create `client/src/components/portal/reservation-card.tsx`:

```tsx
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import type { PortalReservationDto } from "@shared/portal-types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatLicensePlate } from "@/lib/format-utils";

export function formatPortalDate(value: string | null | undefined): string {
  if (!value) return "";
  const [y, m, d] = value.split("-");
  return y && m && d ? `${d}-${m}-${y}` : value;
}

export function ReservationCard({ reservation, showPrice }: { reservation: PortalReservationDto; showPrice: boolean }) {
  const { t } = useTranslation("portal");
  const r = reservation;
  return (
    <Link href={`/portaal/reserveringen/${r.id}`} className="block">
      <Card className="hover:bg-muted/40 transition-colors">
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-medium">
              {r.vehicle ? `${r.vehicle.brand} ${r.vehicle.model}` : t("reservations.spareFor", { id: r.replacementForReservationId })}
              {r.vehicle && <span className="ml-2 font-mono text-sm text-muted-foreground">{formatLicensePlate(r.vehicle.licensePlate)}</span>}
            </div>
            <div className="text-sm text-muted-foreground">
              {formatPortalDate(r.startDate)} – {r.endDate ? formatPortalDate(r.endDate) : t("overview.openEnded")}
              {r.driver && <> · {r.driver.displayName}</>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {showPrice && r.totalPrice && <span className="text-sm">€ {r.totalPrice}</span>}
            <Badge variant="outline">{t(`reservations.status.${r.status}`, { defaultValue: r.status })}</Badge>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
```

If `formatLicensePlate` does not exist in `@/lib/format-utils`, render `r.vehicle.licensePlate` as-is.

- [ ] **Step 2: Overview page**

Replace `client/src/pages/portal/overview.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { PortalReservationDto } from "@shared/portal-types";
import { portalQueryFn } from "@/lib/portal-api";
import { usePortalAuth } from "@/hooks/use-portal-auth";
import { ReservationCard } from "@/components/portal/reservation-card";

export default function PortalOverviewPage() {
  const { t } = useTranslation("portal");
  const { me } = usePortalAuth();
  const { data = [] } = useQuery<PortalReservationDto[]>({ queryKey: ["portal", "/api/portal/reservations"], queryFn: portalQueryFn });
  const showPrice = Boolean(me?.settings.showPrices);
  const current = data.filter((r) => r.status === "picked_up");
  const upcoming = data.filter((r) => r.status === "booked");

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 text-base font-semibold">{t("overview.currentRentals")}</h2>
        {current.length === 0 ? <p className="text-sm text-muted-foreground">{t("overview.none")}</p>
          : <div className="space-y-2">{current.map((r) => <ReservationCard key={r.id} reservation={r} showPrice={showPrice} />)}</div>}
      </section>
      <section>
        <h2 className="mb-2 text-base font-semibold">{t("overview.upcoming")}</h2>
        {upcoming.length === 0 ? <p className="text-sm text-muted-foreground">{t("overview.none")}</p>
          : <div className="space-y-2">{upcoming.map((r) => <ReservationCard key={r.id} reservation={r} showPrice={showPrice} />)}</div>}
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Reservations list and detail**

Create `client/src/pages/portal/reservations.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { PortalReservationDto } from "@shared/portal-types";
import { portalQueryFn } from "@/lib/portal-api";
import { usePortalAuth } from "@/hooks/use-portal-auth";
import { ReservationCard } from "@/components/portal/reservation-card";

export default function PortalReservationsPage() {
  const { t } = useTranslation("portal");
  const { me } = usePortalAuth();
  const { data = [], isLoading } = useQuery<PortalReservationDto[]>({ queryKey: ["portal", "/api/portal/reservations"], queryFn: portalQueryFn });
  if (isLoading) return null;
  return (
    <div className="space-y-2">
      <h1 className="text-lg font-semibold">{t("reservations.title")}</h1>
      {data.length === 0 && <p className="text-sm text-muted-foreground">{t("reservations.empty")}</p>}
      {data.map((r) => <ReservationCard key={r.id} reservation={r} showPrice={Boolean(me?.settings.showPrices)} />)}
    </div>
  );
}
```

Create `client/src/pages/portal/reservation-detail.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { useTranslation } from "react-i18next";
import type { PortalReservationDto } from "@shared/portal-types";
import { portalQueryFn } from "@/lib/portal-api";
import { usePortalAuth } from "@/hooks/use-portal-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatPortalDate } from "@/components/portal/reservation-card";
import { ChangeDriverDialog } from "@/components/portal/change-driver-dialog";

type Detail = PortalReservationDto & {
  driverHistory: Array<{ id: number; driverId: number | null; driverName: string | null; assignedFrom: string; assignedUntil: string | null; note: string | null }>;
};

export default function PortalReservationDetailPage() {
  const { t } = useTranslation("portal");
  const { id } = useParams<{ id: string }>();
  const { me } = usePortalAuth();
  const url = `/api/portal/reservations/${id}`;
  const { data: r, isLoading } = useQuery<Detail>({ queryKey: ["portal", url], queryFn: portalQueryFn });
  if (isLoading || !r) return null;

  const canChangeDriver = me?.role === "admin" && me.settings.canManageDrivers && ["booked", "picked_up"].includes(r.status);
  const row = (label: string, value: string | number | null | undefined) => value ? (
    <div className="grid grid-cols-3 gap-2 text-sm"><dt className="text-muted-foreground">{label}</dt><dd className="col-span-2">{value}</dd></div>
  ) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{t("reservations.detailTitle")} #{r.id}</h1>
        <Link href="/portaal/reserveringen"><Button variant="ghost" size="sm">←</Button></Link>
      </div>
      <Card>
        <CardContent className="p-4 space-y-2">
          <dl className="space-y-1">
            {row(t("fields.vehicle"), r.vehicle ? `${r.vehicle.brand} ${r.vehicle.model} (${r.vehicle.licensePlate})` : null)}
            {row(t("fields.period"), `${formatPortalDate(r.startDate)} – ${r.endDate ? formatPortalDate(r.endDate) : t("overview.openEnded")}`)}
            {row(t("fields.status"), t(`reservations.status.${r.status}`, { defaultValue: r.status }))}
            {row(t("fields.driver"), r.driver?.displayName)}
            {row(t("fields.contractNumber"), r.contractNumber)}
            {row(t("fields.pickupMileage"), r.pickupMileage)}
            {row(t("fields.returnMileage"), r.returnMileage)}
            {me?.settings.showPrices && row(t("fields.price"), r.totalPrice ? `€ ${r.totalPrice}` : null)}
          </dl>
          {canChangeDriver && <ChangeDriverDialog reservation={r} />}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">{t("reservations.driverHistory")}</CardTitle></CardHeader>
        <CardContent className="p-4 pt-0">
          <ul className="space-y-1 text-sm">
            {r.driverHistory.map((h) => (
              <li key={h.id} className="flex justify-between gap-2">
                <span>{h.driverName ?? "—"}{h.note ? <span className="text-muted-foreground"> · {h.note}</span> : null}</span>
                <span className="text-muted-foreground">
                  {new Date(h.assignedFrom).toLocaleDateString()} – {h.assignedUntil ? new Date(h.assignedUntil).toLocaleDateString() : t("reservations.current")}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Change-driver dialog**

Create `client/src/components/portal/change-driver-dialog.tsx`:

```tsx
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { PortalDriverDto, PortalReservationDto } from "@shared/portal-types";
import { portalFetch, portalQueryFn, PortalApiError } from "@/lib/portal-api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

export function ChangeDriverDialog({ reservation }: { reservation: PortalReservationDto }) {
  const { t } = useTranslation("portal");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [driverId, setDriverId] = useState<string>(reservation.driver ? String(reservation.driver.id) : "");
  const [note, setNote] = useState("");
  const { data: drivers = [] } = useQuery<PortalDriverDto[]>({ queryKey: ["portal", "/api/portal/drivers"], queryFn: portalQueryFn, enabled: open });

  const mutation = useMutation({
    mutationFn: () => portalFetch("POST", `/api/portal/reservations/${reservation.id}/driver`, { driverId: Number(driverId), note: note || undefined }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["portal"] });
      toast({ title: t("drivers.changed") });
      setOpen(false);
    },
    onError: (e) => toast({ title: t(`errors.${e instanceof PortalApiError ? e.code : "PORTAL_SERVER_ERROR"}`), variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline">{t("actions.changeDriver")}</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("drivers.changeDriverTitle", { plate: reservation.vehicle?.licensePlate ?? `#${reservation.id}` })}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="driver-select">{t("drivers.selectDriver")}</Label>
            <select id="driver-select" className="w-full rounded-md border px-3 py-2 text-sm" value={driverId} onChange={(e) => setDriverId(e.target.value)}>
              <option value="">—</option>
              {drivers.filter((d) => d.status === "active").map((d) => <option key={d.id} value={d.id}>{d.displayName}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="driver-note">{t("fields.note")}</Label>
            <Input id="driver-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>{t("actions.cancel")}</Button>
            <Button disabled={!driverId || mutation.isPending} onClick={() => mutation.mutate()}>{t("actions.save")}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Documents page**

Create `client/src/pages/portal/documents.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { PortalDocumentDto } from "@shared/portal-types";
import { portalQueryFn } from "@/lib/portal-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

export default function PortalDocumentsPage() {
  const { t } = useTranslation("portal");
  const { data = [], isLoading } = useQuery<PortalDocumentDto[]>({ queryKey: ["portal", "/api/portal/documents"], queryFn: portalQueryFn });
  if (isLoading) return null;
  const groups = new Map<number | null, PortalDocumentDto[]>();
  for (const d of data) groups.set(d.reservationId, [...(groups.get(d.reservationId) ?? []), d]);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">{t("documents.title")}</h1>
      {data.length === 0 && <p className="text-sm text-muted-foreground">{t("documents.empty")}</p>}
      {[...groups.entries()].map(([reservationId, docs]) => (
        <Card key={reservationId ?? "none"}>
          <CardHeader className="pb-2"><CardTitle className="text-base">{t("documents.reservation", { id: reservationId })}</CardTitle></CardHeader>
          <CardContent className="p-4 pt-0">
            <ul className="divide-y">
              {docs.map((d) => (
                <li key={d.id} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    <span className="mr-2 rounded bg-muted px-1.5 py-0.5 text-xs">{t(`documents.${d.kind}`)}</span>
                    {d.fileName}
                    <span className="ml-2 text-muted-foreground">{new Date(d.uploadDate).toLocaleDateString()}</span>
                  </span>
                  {/* target=_blank: never navigate the iframe itself away */}
                  <Button asChild size="sm" variant="outline">
                    <a href={`/api/portal/documents/${d.id}/download`} target="_blank" rel="noopener"><Download className="mr-1 h-4 w-4" />{t("actions.download")}</a>
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Drivers page and form dialog**

Create `client/src/components/portal/driver-form-dialog.tsx`:

```tsx
import { useState, type ReactNode, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { PortalDriverDto } from "@shared/portal-types";
import { portalFetch, PortalApiError } from "@/lib/portal-api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const FIELDS = ["displayName", "firstName", "lastName", "email", "phone", "driverLicenseNumber", "licenseExpiry"] as const;
type Field = typeof FIELDS[number];
const LABEL_KEY: Record<Field, string> = { displayName: "fields.displayName", firstName: "fields.firstName", lastName: "fields.lastName", email: "fields.email", phone: "fields.phone", driverLicenseNumber: "fields.licenseNumber", licenseExpiry: "fields.licenseExpiry" };

export function DriverFormDialog({ driver, children }: { driver?: PortalDriverDto; children: ReactNode }) {
  const { t } = useTranslation("portal");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<Field, string>>(() => Object.fromEntries(FIELDS.map((f) => [f, (driver?.[f] as string | null) ?? ""])) as Record<Field, string>);
  const [file, setFile] = useState<File | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const body = Object.fromEntries(FIELDS.map((f) => [f, values[f] === "" ? null : values[f]]));
      body.displayName = values.displayName;
      const saved = driver
        ? await portalFetch<PortalDriverDto>("PATCH", `/api/portal/drivers/${driver.id}`, body)
        : await portalFetch<PortalDriverDto>("POST", "/api/portal/drivers", body);
      if (file) {
        const form = new FormData();
        form.append("licenseFile", file);
        await portalFetch("POST", `/api/portal/drivers/${saved.id}/license`, form);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["portal", "/api/portal/drivers"] });
      setOpen(false);
    },
    onError: (e) => toast({ title: e instanceof PortalApiError ? e.message : t("errors.PORTAL_SERVER_ERROR"), variant: "destructive" }),
  });

  function submit(e: FormEvent) { e.preventDefault(); mutation.mutate(); }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("drivers.dialogTitle")}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {FIELDS.map((f) => (
            <div key={f}>
              <Label htmlFor={`drv-${f}`}>{t(LABEL_KEY[f])}</Label>
              <Input id={`drv-${f}`} type={f === "licenseExpiry" ? "date" : f === "email" ? "email" : "text"} required={f === "displayName"} value={values[f]} onChange={(e) => setValues({ ...values, [f]: e.target.value })} />
            </div>
          ))}
          <div>
            <Label htmlFor="drv-file">{t("actions.uploadLicense")}</Label>
            <Input id="drv-file" type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t("actions.cancel")}</Button>
            <Button type="submit" disabled={mutation.isPending}>{t("actions.save")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

Create `client/src/pages/portal/drivers.tsx`:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { PortalDriverDto } from "@shared/portal-types";
import { portalFetch, portalQueryFn } from "@/lib/portal-api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DriverFormDialog } from "@/components/portal/driver-form-dialog";

export default function PortalDriversPage() {
  const { t } = useTranslation("portal");
  const queryClient = useQueryClient();
  const { data = [], isLoading } = useQuery<PortalDriverDto[]>({ queryKey: ["portal", "/api/portal/drivers"], queryFn: portalQueryFn });
  const toggle = useMutation({
    mutationFn: (d: PortalDriverDto) => portalFetch("PATCH", `/api/portal/drivers/${d.id}`, { status: d.status === "active" ? "inactive" : "active" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["portal", "/api/portal/drivers"] }),
  });
  if (isLoading) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{t("drivers.title")}</h1>
        <DriverFormDialog><Button size="sm">{t("actions.addDriver")}</Button></DriverFormDialog>
      </div>
      {data.length === 0 && <p className="text-sm text-muted-foreground">{t("drivers.empty")}</p>}
      {data.map((d) => (
        <Card key={d.id}>
          <CardContent className="p-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-medium">{d.displayName} <Badge variant={d.status === "active" ? "default" : "secondary"} className="ml-2">{t(`drivers.${d.status === "active" ? "active" : "inactive"}`)}</Badge></div>
              <div className="text-sm text-muted-foreground">{[d.email, d.phone, d.driverLicenseNumber].filter(Boolean).join(" · ")}</div>
            </div>
            <div className="flex gap-2">
              {d.hasLicenseFile && <Button asChild size="sm" variant="ghost"><a href={`/api/portal/drivers/${d.id}/license`} target="_blank" rel="noopener">{t("actions.viewLicense")}</a></Button>}
              <DriverFormDialog driver={d}><Button size="sm" variant="outline">{t("actions.edit")}</Button></DriverFormDialog>
              <Button size="sm" variant="outline" onClick={() => toggle.mutate(d)}>{d.status === "active" ? t("actions.deactivate") : t("actions.activate")}</Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 7: Account page**

Create `client/src/pages/portal/account.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { portalFetch, PortalApiError } from "@/lib/portal-api";
import { usePortalAuth } from "@/hooks/use-portal-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export default function PortalAccountPage() {
  const { t } = useTranslation("portal");
  const { me, refresh } = usePortalAuth();
  const { toast } = useToast();
  const [fullName, setFullName] = useState(me?.fullName ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const fail = (e: unknown) => toast({ title: t(`errors.${e instanceof PortalApiError ? e.code : "PORTAL_SERVER_ERROR"}`), variant: "destructive" });

  async function saveName(e: FormEvent) {
    e.preventDefault();
    try { await portalFetch("PATCH", "/api/portal/me", { fullName }); await refresh(); toast({ title: t("account.nameSaved") }); } catch (err) { fail(err); }
  }
  async function savePassword(e: FormEvent) {
    e.preventDefault();
    try { await portalFetch("POST", "/api/portal/me/password", { currentPassword, newPassword }); setCurrentPassword(""); setNewPassword(""); toast({ title: t("account.passwordChanged") }); } catch (err) { fail(err); }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">{t("account.title")}</h1>
      <Card><CardContent className="p-4">
        <form onSubmit={saveName} className="space-y-3">
          <div><Label htmlFor="acc-email">{t("fields.email")}</Label><Input id="acc-email" value={me?.email ?? ""} disabled /></div>
          <div><Label htmlFor="acc-name">{t("fields.fullName")}</Label><Input id="acc-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required /></div>
          <Button type="submit" size="sm">{t("actions.save")}</Button>
        </form>
      </CardContent></Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">{t("account.changePassword")}</CardTitle></CardHeader>
        <CardContent className="p-4 pt-0">
          <form onSubmit={savePassword} className="space-y-3">
            <div><Label htmlFor="acc-cur">{t("fields.currentPassword")}</Label><Input id="acc-cur" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required /></div>
            <div><Label htmlFor="acc-new">{t("fields.newPassword")}</Label><Input id="acc-new" type="password" autoComplete="new-password" minLength={10} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required /></div>
            <Button type="submit" size="sm">{t("actions.save")}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 8: Routes**

In `client/src/pages/portal/index.tsx` import the new pages and replace the `<Switch>` body with:

```tsx
          <Route path="/login" component={PortalLoginPage} />
          <Route path="/activeren" component={PortalActivatePage} />
          <Route path="/reserveringen/:id" component={PortalReservationDetailPage} />
          <Route path="/reserveringen" component={PortalReservationsPage} />
          <Route path="/documenten" component={PortalDocumentsPage} />
          <Route path="/bestuurders" component={PortalDriversPage} />
          <Route path="/account" component={PortalAccountPage} />
          <Route path="/" component={PortalOverviewPage} />
          <Route>{() => <PortalOverviewPage />}</Route>
```

- [ ] **Step 9: Type-check and browser check**

Run: `npm run check` — Expected: 0 errors.

In the dev server, logged in as a portal admin of a customer with at least one `picked_up` reservation and a contract document: overview shows the rental; reservation detail shows the history; "Bestuurder wijzigen" adds a history row and creates a staff notification (visible in the staff notification centre) ; documents download opens in a new tab; drivers can be added, edited, deactivated. Switch `canViewContracts` off via the admin API and confirm the Contracten tab disappears and `/portaal/documenten` shows the disabled-feature error.

- [ ] **Step 10: Commit**

```bash
git add client/src/pages/portal client/src/components/portal
git commit -m "feat(portal): overview, reservations, contracts, drivers and account pages"
```

---
### Task 11: Staff UI — customer "Portaal" tab and `/portal-admin` page

**Files:**
- Create: `client/src/components/portal-admin/customer-portal-settings-form.tsx`, `client/src/components/portal-admin/accounts-table.tsx`, `client/src/components/portal-admin/account-dialog.tsx`, `client/src/components/portal-admin/activity-table.tsx`, `client/src/components/portal-admin/online-vehicles-table.tsx`
- Create: `client/src/components/customers/customer-portal-tab.tsx`
- Modify: `client/src/components/customers/customer-details.tsx` (tabs ~line 584)
- Create: `client/src/pages/portal-admin/index.tsx`
- Modify: `client/src/App.tsx`, `client/src/components/sidebar-nav.tsx`, `client/src/locales/{nl,en}/nav.json`, `client/src/locales/{nl,en}/portal.json` (add an `admin` section)

**Interfaces:**
- Consumes: staff `apiRequest` (`@/lib/queryClient`), `useAuth`, `UserPermission`, admin API from Task 8.
- Produces: `<CustomerPortalTab customerId />`, `<AccountsTable customerId? />`, `<AccountDialog customerId account? />`, `<CustomerPortalSettingsForm customerId />`, `<ActivityTable customerId? />`, `<OnlineVehiclesTable />`.
- Staff query keys: `['/api/portal-admin/accounts']`, `['/api/portal-admin/customers', customerId, 'accounts']`, `['/api/portal-admin/customers', customerId, 'settings']`, `['/api/portal-admin/activity', { customerId }]`, `['/api/portal-admin/vehicles-online']`.

- [ ] **Step 1: Translations for the staff side**

Add an `admin` object to both `portal.json` files. Dutch:

```json
"admin": {
  "navLabel": "Klantenportaal",
  "pageTitle": "Klantenportaal beheren",
  "tabs": { "accounts": "Accounts", "vehicles": "Voertuigen online", "activity": "Activiteit" },
  "customerTab": "Portaal",
  "accounts": { "title": "Portaalaccounts", "empty": "Nog geen accounts. Nodig een contactpersoon uit.", "invite": "Uitnodigen", "resend": "Uitnodiging opnieuw sturen", "sendReset": "Wachtwoord-reset sturen", "block": "Blokkeren", "unblock": "Deblokkeren", "delete": "Verwijderen", "deleteConfirm": "Dit account is nog niet geactiveerd en wordt definitief verwijderd. Doorgaan?", "columns": { "name": "Naam", "email": "E-mail", "customer": "Klant", "role": "Rol", "driver": "Bestuurder", "status": "Status", "lastLogin": "Laatste login" }, "status": { "active": "Actief", "blocked": "Geblokkeerd", "pending": "Uitnodiging open", "notActivated": "Niet geactiveerd" }, "role": { "admin": "Beheerder", "driver": "Bestuurder" }, "invited": "Uitnodiging verstuurd naar {{email}}.", "inviteFailed": "Account aangemaakt, maar de e-mail kon niet worden verstuurd. Controleer de e-mailinstellingen en stuur de uitnodiging opnieuw.", "sent": "E-mail verstuurd.", "filterAll": "Alle klanten", "onlyPending": "Alleen niet-geactiveerd" },
  "dialog": { "title": "Portaalaccount", "email": "E-mailadres", "fullName": "Naam", "role": "Rol", "driver": "Gekoppelde bestuurder", "driverRequired": "Kies een bestuurder voor een bestuurdersaccount", "save": "Opslaan", "cancel": "Annuleren" },
  "settings": { "title": "Instellingen voor deze klant", "portalEnabled": "Portaal actief", "canBook": "Mag online huren (aanvraag)", "canManageDrivers": "Mag bestuurders beheren", "canSubmitRequests": "Mag aanvragen indienen", "canViewFines": "Ziet bekeuringen", "canViewContracts": "Ziet contracten en schadeformulieren", "showPrices": "Ziet prijzen", "internalNotes": "Interne notities (wat heeft deze klant nodig?)", "saved": "Instellingen opgeslagen." },
  "activity": { "title": "Activiteit in het portaal", "empty": "Nog geen activiteit.", "columns": { "when": "Wanneer", "customer": "Klant", "user": "Gebruiker", "action": "Actie", "details": "Details" } },
  "vehicles": { "title": "Voertuigen die online worden aangeboden", "hint": "Alleen aangevinkte voertuigen zijn straks in het portaal te huren.", "offered": "Online", "description": "Omschrijving voor klanten", "bulkOn": "Selectie online", "bulkOff": "Selectie offline", "onlyOffered": "Alleen online", "search": "Zoek kenteken of model" },
  "config": { "title": "Klantenportaal", "description": "Website-koppeling en meldingen", "allowedFrameOrigins": "Toegestane website-adressen voor de iframe (één per regel)", "notificationEmail": "E-mailadres voor meldingen uit het portaal", "portalBaseUrl": "Basis-URL van het portaal (voor uitnodigingsmails), bv. https://portaal.lamgroep.nl", "templatesHint": "De e-mailsjablonen portal_invite, portal_password_reset en portal_staff_notification staan onder Communicatie.", "saved": "Portaalinstellingen opgeslagen." }
}
```

English: same keys, translated. In both `nav.json` files add `"portalAdmin": "Klantenportaal"` / `"Customer portal"`.

- [ ] **Step 2: Settings form (shared by the customer tab and the admin page)**

Create `client/src/components/portal-admin/customer-portal-settings-form.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { PortalCustomerSettings } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const FLAGS = ["portalEnabled", "canBook", "canManageDrivers", "canSubmitRequests", "canViewFines", "canViewContracts", "showPrices"] as const;

export function CustomerPortalSettingsForm({ customerId, readOnly }: { customerId: number; readOnly?: boolean }) {
  const { t } = useTranslation("portal");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const key = ["/api/portal-admin/customers", customerId, "settings"] as const;
  const { data } = useQuery<PortalCustomerSettings>({ queryKey: key, queryFn: async () => (await apiRequest("GET", `/api/portal-admin/customers/${customerId}/settings`)).json() });
  const [notes, setNotes] = useState("");
  useEffect(() => { setNotes(data?.internalNotes ?? ""); }, [data?.internalNotes]);

  const save = useMutation({
    mutationFn: async (patch: Partial<PortalCustomerSettings>) => (await apiRequest("PATCH", `/api/portal-admin/customers/${customerId}/settings`, patch)).json(),
    onSuccess: (row) => { queryClient.setQueryData(key, row); toast({ title: t("admin.settings.saved") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });
  if (!data) return null;

  return (
    <div className="space-y-4">
      <h3 className="font-medium">{t("admin.settings.title")}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {FLAGS.map((flag) => (
          <div key={flag} className="flex items-center justify-between rounded-md border p-3">
            <Label htmlFor={`ps-${flag}`} className="text-sm">{t(`admin.settings.${flag}`)}</Label>
            <Switch id={`ps-${flag}`} checked={data[flag]} disabled={readOnly || save.isPending} onCheckedChange={(v) => save.mutate({ [flag]: v })} />
          </div>
        ))}
      </div>
      <div>
        <Label htmlFor="ps-notes">{t("admin.settings.internalNotes")}</Label>
        <Textarea id="ps-notes" value={notes} disabled={readOnly} onChange={(e) => setNotes(e.target.value)} rows={4} />
        {!readOnly && <Button size="sm" className="mt-2" disabled={save.isPending || notes === (data.internalNotes ?? "")} onClick={() => save.mutate({ internalNotes: notes })}>{t("admin.dialog.save")}</Button>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Account dialog and accounts table**

Create `client/src/components/portal-admin/account-dialog.tsx`:

```tsx
import { useState, type ReactNode, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { Driver } from "@shared/schema";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export interface PortalAccountRow {
  id: number; customerId: number; email: string; fullName: string; role: "admin" | "driver"; driverId: number | null;
  active: boolean; activated: boolean; invitePending: boolean; lastLoginAt: string | null; customerName?: string;
}

export function AccountDialog({ customerId, account, children }: { customerId: number; account?: PortalAccountRow; children: ReactNode }) {
  const { t } = useTranslation("portal");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(account?.email ?? "");
  const [fullName, setFullName] = useState(account?.fullName ?? "");
  const [role, setRole] = useState<"admin" | "driver">(account?.role ?? "admin");
  const [driverId, setDriverId] = useState<string>(account?.driverId ? String(account.driverId) : "");
  const { data: drivers = [] } = useQuery<Driver[]>({ queryKey: [`/api/customers/${customerId}/drivers`], enabled: open });

  const save = useMutation({
    mutationFn: async () => {
      const body = { fullName, role, driverId: role === "driver" ? Number(driverId) : null };
      if (account) return (await apiRequest("PATCH", `/api/portal-admin/accounts/${account.id}`, body)).json();
      return (await apiRequest("POST", `/api/portal-admin/customers/${customerId}/accounts`, { ...body, email })).json();
    },
    onSuccess: (result) => {
      invalidateByPrefix("/api/portal-admin");
      queryClient.invalidateQueries({ queryKey: ["/api/portal-admin/customers", customerId, "accounts"] });
      if (!account) toast({ title: result.inviteSent ? t("admin.accounts.invited", { email }) : t("admin.accounts.inviteFailed"), variant: result.inviteSent ? "default" : "destructive" });
      setOpen(false);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (role === "driver" && !driverId) { toast({ title: t("admin.dialog.driverRequired"), variant: "destructive" }); return; }
    save.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("admin.dialog.title")}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div><Label htmlFor="pa-email">{t("admin.dialog.email")}</Label><Input id="pa-email" type="email" value={email} disabled={Boolean(account)} onChange={(e) => setEmail(e.target.value)} required /></div>
          <div><Label htmlFor="pa-name">{t("admin.dialog.fullName")}</Label><Input id="pa-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required /></div>
          <div>
            <Label htmlFor="pa-role">{t("admin.dialog.role")}</Label>
            <select id="pa-role" className="w-full rounded-md border px-3 py-2 text-sm" value={role} onChange={(e) => setRole(e.target.value as "admin" | "driver")}>
              <option value="admin">{t("admin.accounts.role.admin")}</option>
              <option value="driver">{t("admin.accounts.role.driver")}</option>
            </select>
          </div>
          {role === "driver" && (
            <div>
              <Label htmlFor="pa-driver">{t("admin.dialog.driver")}</Label>
              <select id="pa-driver" className="w-full rounded-md border px-3 py-2 text-sm" value={driverId} onChange={(e) => setDriverId(e.target.value)}>
                <option value="">—</option>
                {drivers.map((d) => <option key={d.id} value={d.id}>{d.displayName}</option>)}
              </select>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t("admin.dialog.cancel")}</Button>
            <Button type="submit" disabled={save.isPending}>{account ? t("admin.dialog.save") : t("admin.accounts.invite")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

Create `client/src/components/portal-admin/accounts-table.tsx`:

```tsx
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { UserPermission, UserRole } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AccountDialog, type PortalAccountRow } from "./account-dialog";

export function useCanManagePortal(): boolean {
  const { user } = useAuth();
  return user?.role === UserRole.ADMIN || (user?.permissions ?? []).includes(UserPermission.MANAGE_PORTAL);
}

export function AccountsTable({ customerId }: { customerId?: number }) {
  const { t } = useTranslation("portal");
  const { toast } = useToast();
  const canManage = useCanManagePortal();
  const [onlyPending, setOnlyPending] = useState(false);
  const url = customerId ? `/api/portal-admin/customers/${customerId}/accounts` : "/api/portal-admin/accounts";
  const key = customerId ? ["/api/portal-admin/customers", customerId, "accounts"] : ["/api/portal-admin/accounts"];
  const { data = [] } = useQuery<PortalAccountRow[]>({ queryKey: key, queryFn: async () => (await apiRequest("GET", url)).json() });

  const act = useMutation({
    mutationFn: async ({ id, action, body }: { id: number; action: "patch" | "invite" | "delete"; body?: unknown }) => {
      if (action === "patch") return apiRequest("PATCH", `/api/portal-admin/accounts/${id}`, body);
      if (action === "invite") return apiRequest("POST", `/api/portal-admin/accounts/${id}/invite`, body);
      return apiRequest("DELETE", `/api/portal-admin/accounts/${id}`);
    },
    onSuccess: (_r, v) => { invalidateByPrefix("/api/portal-admin"); if (v.action === "invite") toast({ title: t("admin.accounts.sent") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const status = (a: PortalAccountRow) => !a.active ? "blocked" : a.activated ? "active" : a.invitePending ? "pending" : "notActivated";
  const rows = onlyPending ? data.filter((a) => !a.activated) : data;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">{t("admin.accounts.title")}</h3>
        <div className="flex gap-2">
          <Button size="sm" variant={onlyPending ? "default" : "outline"} onClick={() => setOnlyPending(!onlyPending)}>{t("admin.accounts.onlyPending")}</Button>
          {customerId && canManage && <AccountDialog customerId={customerId}><Button size="sm">{t("admin.accounts.invite")}</Button></AccountDialog>}
        </div>
      </div>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">{t("admin.accounts.empty")}</p> : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>{t("admin.accounts.columns.name")}</TableHead>
            <TableHead>{t("admin.accounts.columns.email")}</TableHead>
            {!customerId && <TableHead>{t("admin.accounts.columns.customer")}</TableHead>}
            <TableHead>{t("admin.accounts.columns.role")}</TableHead>
            <TableHead>{t("admin.accounts.columns.status")}</TableHead>
            <TableHead>{t("admin.accounts.columns.lastLogin")}</TableHead>
            <TableHead />
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((a) => (
              <TableRow key={a.id}>
                <TableCell>{a.fullName}</TableCell>
                <TableCell>{a.email}</TableCell>
                {!customerId && <TableCell>{a.customerName}</TableCell>}
                <TableCell>{t(`admin.accounts.role.${a.role}`)}</TableCell>
                <TableCell><Badge variant={status(a) === "active" ? "default" : status(a) === "blocked" ? "destructive" : "secondary"}>{t(`admin.accounts.status.${status(a)}`)}</Badge></TableCell>
                <TableCell>{a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleString() : "—"}</TableCell>
                <TableCell className="text-right">
                  {canManage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button size="icon" variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <AccountDialog customerId={a.customerId} account={a}><DropdownMenuItem onSelect={(e) => e.preventDefault()}>{t("admin.dialog.save")}</DropdownMenuItem></AccountDialog>
                        {!a.activated && <DropdownMenuItem onSelect={() => act.mutate({ id: a.id, action: "invite", body: { kind: "invite" } })}>{t("admin.accounts.resend")}</DropdownMenuItem>}
                        {a.activated && <DropdownMenuItem onSelect={() => act.mutate({ id: a.id, action: "invite", body: { kind: "reset" } })}>{t("admin.accounts.sendReset")}</DropdownMenuItem>}
                        <DropdownMenuItem onSelect={() => act.mutate({ id: a.id, action: "patch", body: { active: !a.active } })}>{a.active ? t("admin.accounts.block") : t("admin.accounts.unblock")}</DropdownMenuItem>
                        {!a.activated && <DropdownMenuItem className="text-destructive" onSelect={() => { if (window.confirm(t("admin.accounts.deleteConfirm"))) act.mutate({ id: a.id, action: "delete" }); }}>{t("admin.accounts.delete")}</DropdownMenuItem>}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
```

`invalidateByPrefix` is already exported from `@/lib/queryClient` (used by settings-panel.tsx).

- [ ] **Step 4: Activity and online vehicles tables**

Create `client/src/components/portal-admin/activity-table.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface ActivityRow { id: number; action: string; entity: string | null; entityId: number | null; details: Record<string, unknown> | null; ip: string | null; createdAt: string; userName: string | null; customerName: string | null }

export function ActivityTable({ customerId, limit = 50 }: { customerId?: number; limit?: number }) {
  const { t } = useTranslation("portal");
  const params = new URLSearchParams({ limit: String(limit), ...(customerId ? { customerId: String(customerId) } : {}) });
  const { data = [] } = useQuery<ActivityRow[]>({
    queryKey: ["/api/portal-admin/activity", { customerId, limit }],
    queryFn: async () => (await apiRequest("GET", `/api/portal-admin/activity?${params}`)).json(),
  });
  if (data.length === 0) return <p className="text-sm text-muted-foreground">{t("admin.activity.empty")}</p>;
  return (
    <Table>
      <TableHeader><TableRow>
        <TableHead>{t("admin.activity.columns.when")}</TableHead>
        {!customerId && <TableHead>{t("admin.activity.columns.customer")}</TableHead>}
        <TableHead>{t("admin.activity.columns.user")}</TableHead>
        <TableHead>{t("admin.activity.columns.action")}</TableHead>
        <TableHead>{t("admin.activity.columns.details")}</TableHead>
      </TableRow></TableHeader>
      <TableBody>
        {data.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</TableCell>
            {!customerId && <TableCell>{r.customerName}</TableCell>}
            <TableCell>{r.userName ?? "—"}</TableCell>
            <TableCell><code className="text-xs">{r.action}</code></TableCell>
            <TableCell className="text-xs text-muted-foreground">{[r.entity && `${r.entity} #${r.entityId}`, r.details && JSON.stringify(r.details), r.ip].filter(Boolean).join(" · ")}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

Create `client/src/components/portal-admin/online-vehicles-table.tsx`:

```tsx
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useCanManagePortal } from "./accounts-table";

interface OnlineVehicleRow { id: number; licensePlate: string; brand: string; model: string; vehicleType: string | null; availabilityStatus: string; offeredOnline: boolean; onlineDescription: string | null; dailyPrice: string | null; monthlyPrice: string | null }
const KEY = ["/api/portal-admin/vehicles-online"];

export function OnlineVehiclesTable() {
  const { t } = useTranslation("portal");
  const queryClient = useQueryClient();
  const canManage = useCanManagePortal();
  const [search, setSearch] = useState("");
  const [onlyOffered, setOnlyOffered] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const { data = [] } = useQuery<OnlineVehicleRow[]>({ queryKey: KEY, queryFn: async () => (await apiRequest("GET", KEY[0])).json() });

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<OnlineVehicleRow> }) => apiRequest("PATCH", `/api/portal-admin/vehicles-online/${id}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
  const bulk = useMutation({
    mutationFn: (offeredOnline: boolean) => apiRequest("POST", "/api/portal-admin/vehicles-online/bulk", { ids: [...selected], offeredOnline }),
    onSuccess: () => { setSelected(new Set()); queryClient.invalidateQueries({ queryKey: KEY }); },
  });

  const q = search.trim().toLowerCase();
  const rows = data.filter((v) => (!onlyOffered || v.offeredOnline) && (!q || `${v.licensePlate} ${v.brand} ${v.model}`.toLowerCase().includes(q)));
  const toggleSel = (id: number) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("admin.vehicles.hint")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder={t("admin.vehicles.search")} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Button size="sm" variant={onlyOffered ? "default" : "outline"} onClick={() => setOnlyOffered(!onlyOffered)}>{t("admin.vehicles.onlyOffered")}</Button>
        {canManage && selected.size > 0 && (<>
          <Button size="sm" onClick={() => bulk.mutate(true)}>{t("admin.vehicles.bulkOn")} ({selected.size})</Button>
          <Button size="sm" variant="outline" onClick={() => bulk.mutate(false)}>{t("admin.vehicles.bulkOff")} ({selected.size})</Button>
        </>)}
      </div>
      <Table>
        <TableHeader><TableRow>
          <TableHead className="w-8" />
          <TableHead>Kenteken</TableHead>
          <TableHead>Voertuig</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>{t("admin.vehicles.offered")}</TableHead>
          <TableHead>{t("admin.vehicles.description")}</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {rows.map((v) => (
            <TableRow key={v.id}>
              <TableCell><Checkbox checked={selected.has(v.id)} onCheckedChange={() => toggleSel(v.id)} disabled={!canManage} /></TableCell>
              <TableCell className="font-mono">{v.licensePlate}</TableCell>
              <TableCell>{v.brand} {v.model}</TableCell>
              <TableCell>{v.availabilityStatus}</TableCell>
              <TableCell><Switch checked={v.offeredOnline} disabled={!canManage} onCheckedChange={(on) => patch.mutate({ id: v.id, body: { offeredOnline: on } })} /></TableCell>
              <TableCell>
                <Input defaultValue={v.onlineDescription ?? ""} disabled={!canManage} onBlur={(e) => { if (e.target.value !== (v.onlineDescription ?? "")) patch.mutate({ id: v.id, body: { onlineDescription: e.target.value || null } }); }} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

The three literal column headers (`Kenteken`, `Voertuig`, `Status`) reuse keys from the `vehicles` namespace if matching ones exist (`useTranslation("vehicles")`); otherwise add `columns.plate/vehicle/status` under `admin.vehicles` in `portal.json`.

- [ ] **Step 5: Customer dialog tab**

Create `client/src/components/customers/customer-portal-tab.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AccountsTable, useCanManagePortal } from "@/components/portal-admin/accounts-table";
import { CustomerPortalSettingsForm } from "@/components/portal-admin/customer-portal-settings-form";
import { ActivityTable } from "@/components/portal-admin/activity-table";

export function CustomerPortalTab({ customerId }: { customerId: number }) {
  const { t } = useTranslation("portal");
  const canManage = useCanManagePortal();
  return (
    <div className="space-y-6">
      <Card><CardContent className="p-4"><AccountsTable customerId={customerId} /></CardContent></Card>
      <Card><CardContent className="p-4"><CustomerPortalSettingsForm customerId={customerId} readOnly={!canManage} /></CardContent></Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">{t("admin.activity.title")}</CardTitle></CardHeader>
        <CardContent className="p-4 pt-0"><ActivityTable customerId={customerId} /></CardContent>
      </Card>
    </div>
  );
}
```

In `client/src/components/customers/customer-details.tsx`: import `CustomerPortalTab`, `useAuth`, `UserPermission`, `UserRole`; compute

```tsx
  const { user } = useAuth();
  const canSeePortal = user?.role === UserRole.ADMIN || (user?.permissions ?? []).some((p) => p === UserPermission.VIEW_PORTAL || p === UserPermission.MANAGE_PORTAL);
```

change the `TabsList` class to `grid-cols-5` when `canSeePortal`, add `{canSeePortal && <TabsTrigger value="portal">{t("admin.customerTab", { ns: "portal" })}</TabsTrigger>}` after the history trigger, and after the history `TabsContent` add:

```tsx
        {canSeePortal && (
          <TabsContent value="portal" className="mt-6">
            <CustomerPortalTab customerId={customerId} />
          </TabsContent>
        )}
```

- [ ] **Step 6: `/portal-admin` page, route and menu**

Create `client/src/pages/portal-admin/index.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AccountsTable } from "@/components/portal-admin/accounts-table";
import { OnlineVehiclesTable } from "@/components/portal-admin/online-vehicles-table";
import { ActivityTable } from "@/components/portal-admin/activity-table";

export default function PortalAdminPage() {
  const { t } = useTranslation("portal");
  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-semibold">{t("admin.pageTitle")}</h1>
      <Tabs defaultValue="accounts">
        <TabsList>
          <TabsTrigger value="accounts">{t("admin.tabs.accounts")}</TabsTrigger>
          <TabsTrigger value="vehicles">{t("admin.tabs.vehicles")}</TabsTrigger>
          <TabsTrigger value="activity">{t("admin.tabs.activity")}</TabsTrigger>
        </TabsList>
        <TabsContent value="accounts" className="mt-4"><AccountsTable /></TabsContent>
        <TabsContent value="vehicles" className="mt-4"><OnlineVehiclesTable /></TabsContent>
        <TabsContent value="activity" className="mt-4"><ActivityTable limit={200} /></TabsContent>
      </Tabs>
    </div>
  );
}
```

`App.tsx`: `<ProtectedRoute path="/portal-admin" component={PortalAdminPage} />` next to the other staff routes. `sidebar-nav.tsx`: add `{ href: "/portal-admin", labelKey: "portalAdmin", icon: "people", permissions: [UserPermission.VIEW_PORTAL, UserPermission.MANAGE_PORTAL] }` after the customers entry (reuse an existing icon key; check the icon map in that file).

Accounts on the global page are created from the customer dialog (the page has no customer picker); its dropdown still edits, invites, blocks and deletes.

- [ ] **Step 7: Type-check and browser check**

Run: `npm run check` — Expected: 0 errors.

As an admin in the dev server: open a customer, see the Portaal tab, invite an account (with SMTP not configured expect the "kon niet worden verstuurd" toast and the account listed as *Niet geactiveerd*), toggle switches, see the activity list. Open `/portal-admin`, toggle a vehicle online, bulk-toggle two. Give a `user`-role staff account only `view_portal` and confirm read-only rendering.

- [ ] **Step 8: Commit**

```bash
git add client/src/components/portal-admin client/src/components/customers/customer-portal-tab.tsx client/src/components/customers/customer-details.tsx client/src/pages/portal-admin client/src/App.tsx client/src/components/sidebar-nav.tsx client/src/locales
git commit -m "feat(portal): staff management of portal accounts, customer switches, activity and online vehicles"
```

---
### Task 12: Settings tab, WordPress embed doc and end-to-end iframe verification

**Files:**
- Create: `client/src/components/portal-admin/portal-config-form.tsx`
- Modify: `client/src/components/settings/settings-panel.tsx` (tabs ~line 732)
- Create: `docs/portal-wordpress-embed.md`
- Create: `scripts/portal-iframe-test.html` (local check page, not deployed)

**Interfaces:**
- Consumes: `GET/PUT /api/portal-admin/config` (Task 8), `PortalConfig`.

- [ ] **Step 1: Config form**

Create `client/src/components/portal-admin/portal-config-form.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { PortalConfig } from "@shared/portal-types";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Globe } from "lucide-react";

const KEY = ["/api/portal-admin/config"];

export function PortalConfigForm() {
  const { t } = useTranslation("portal");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data } = useQuery<PortalConfig>({ queryKey: KEY, queryFn: async () => (await apiRequest("GET", KEY[0])).json() });
  const [origins, setOrigins] = useState("");
  const [email, setEmail] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  useEffect(() => {
    if (!data) return;
    setOrigins(data.allowedFrameOrigins.join("\n"));
    setEmail(data.notificationEmail);
    setBaseUrl(data.portalBaseUrl);
  }, [data]);

  const save = useMutation({
    mutationFn: async () => (await apiRequest("PUT", KEY[0], {
      allowedFrameOrigins: origins.split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
      notificationEmail: email.trim(),
      portalBaseUrl: baseUrl.trim().replace(/\/$/, ""),
    })).json(),
    onSuccess: (saved) => { queryClient.setQueryData(KEY, saved); toast({ title: t("admin.config.saved") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5" />{t("admin.config.title")}</CardTitle>
        <CardDescription>{t("admin.config.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="pc-origins">{t("admin.config.allowedFrameOrigins")}</Label>
          <Textarea id="pc-origins" rows={3} value={origins} onChange={(e) => setOrigins(e.target.value)} placeholder={"https://lamgroep.nl\nhttps://www.lamgroep.nl"} />
        </div>
        <div>
          <Label htmlFor="pc-email">{t("admin.config.notificationEmail")}</Label>
          <Input id="pc-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="pc-base">{t("admin.config.portalBaseUrl")}</Label>
          <Input id="pc-base" type="url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
        </div>
        <p className="text-xs text-muted-foreground">{t("admin.config.templatesHint")}</p>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>{t("admin.dialog.save")}</Button>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Settings tab**

In `settings-panel.tsx`: import `PortalConfigForm`; change the `TabsList` class from `grid-cols-7` to `grid-cols-8`; add after the `activity` trigger

```tsx
          <TabsTrigger value="portal" className="gap-2" data-testid="tab-portal">
            <Globe className="h-4 w-4" />
            {t("admin.config.title", { ns: "portal" })}
          </TabsTrigger>
```

(import `Globe` from `lucide-react` if not already imported) and a matching

```tsx
        <TabsContent value="portal" className="space-y-6">
          <PortalConfigForm />
        </TabsContent>
```

- [ ] **Step 3: WordPress embed document**

Create `docs/portal-wordpress-embed.md`:

````markdown
# Klantenportaal insluiten op lamgroep.nl

Het portaal draait in de beheerapp en wordt op de website in een iframe getoond.

## Vereisten

1. De beheerapp is bereikbaar op een subdomein van de website, bijvoorbeeld
   `https://portaal.lamgroep.nl`. Dit is nodig omdat browsers cookies in een
   iframe van een *ander* domein blokkeren; een subdomein telt als hetzelfde.
2. In de beheerapp, Instellingen > Klantenportaal:
   - Toegestane website-adressen: `https://lamgroep.nl` en `https://www.lamgroep.nl`
     (lokaal ook `http://lamgroep.local`).
   - Basis-URL van het portaal: `https://portaal.lamgroep.nl`.
   - E-mailadres voor meldingen.

## Pagina "Klantenportaal" in WordPress

Plaats dit in een HTML-blok (of in het thema-template van die pagina):

```html
<iframe id="lamgroep-portal" src="https://portaal.lamgroep.nl/portaal"
        style="width:100%;border:0;min-height:600px" title="Klantenportaal"></iframe>
<script>
window.addEventListener('message', function (e) {
  if (e.origin !== 'https://portaal.lamgroep.nl') return;
  if (e.data && e.data.type === 'lamgroep-portal:height') {
    document.getElementById('lamgroep-portal').style.height = e.data.height + 'px';
  }
});
</script>
```

Het portaal stuurt zijn hoogte naar de pagina, zodat er geen tweede scrollbalk
ontstaat. Uitnodigingsmails linken rechtstreeks naar
`https://portaal.lamgroep.nl/portaal/activeren?token=…`; die pagina werkt ook
buiten het iframe.
````

- [ ] **Step 4: Local iframe test page**

Create `scripts/portal-iframe-test.html` (served by any static server on a different origin than the app, e.g. `npx serve scripts -l 8099`):

```html
<!doctype html>
<meta charset="utf-8">
<title>Portal iframe test</title>
<h1>lamgroep.local (test parent)</h1>
<iframe id="lamgroep-portal" src="http://localhost:5000/portaal" style="width:100%;border:1px solid #999;min-height:300px" title="Klantenportaal"></iframe>
<pre id="log"></pre>
<script>
window.addEventListener('message', function (e) {
  document.getElementById('log').textContent += e.origin + ' ' + JSON.stringify(e.data) + '\n';
  if (e.data && e.data.type === 'lamgroep-portal:height') {
    document.getElementById('lamgroep-portal').style.height = e.data.height + 'px';
  }
});
</script>
```

Replace `5000` with the app's `PORT` from `.env`.

- [ ] **Step 5: Verify the iframe end to end**

1. In Instellingen > Klantenportaal add `http://localhost:8099` to the allowed origins and save.
2. Run `npx serve scripts -l 8099` and open `http://localhost:8099/portal-iframe-test.html` in the Browser pane.
3. Expected: the portal login renders inside the frame (no "refused to connect"); the `<pre>` shows height messages; after logging in with a portal user the tabs work inside the frame and the frame grows.
4. Open `http://localhost:8099/portal-iframe-test.html` after *removing* the origin from the settings: the frame is blank/refused (CSP). Re-add it.
5. Confirm with `curl -sI http://localhost:<PORT>/vehicles | grep -i frame` that staff pages still send `X-Frame-Options: SAMEORIGIN`.

Note for the executor: over plain `http://localhost`, different ports are different origins but the cookie is not "third-party" in the same-site sense (both are `localhost`), so the `lax` cookie is sent. This mirrors the production `lamgroep.nl` / `portaal.lamgroep.nl` setup.

- [ ] **Step 6: Full test run and type-check**

Run: `npm test && npm run check` — Expected: all files pass, 0 errors.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/portal-admin/portal-config-form.tsx client/src/components/settings/settings-panel.tsx docs/portal-wordpress-embed.md scripts/portal-iframe-test.html
git commit -m "feat(portal): portal settings tab and WordPress iframe embed documentation"
```

---

## Deployment notes (for the hand-over, not a task)

- Run `node -r dotenv/config startup-migration.js` (or the SQL from the Task 2 commit body) on the production database before starting the new build.
- Serve the app on `portaal.lamgroep.nl` and set the three portal settings; without `portalBaseUrl` invitation links are relative and will not work from e-mail.
- SMTP must be configured (Instellingen > E-mail) for invitations to arrive; the account is created regardless and the invitation can be re-sent.
- Give staff members the `manage_portal` or `view_portal` permission (admins have everything).

## Follow-ups (parts 2-4, separate specs)

- Part 2 online booking: `vehicles.offered_online` + availability by period, `POST /api/portal/booking-requests`, staff approve/reject, `notifyStaffOfPortalEvent({ kind: 'portal_booking_request' })`.
- Part 3 fines: new table, staff entry, attribution via `reservation_driver_assignments`, portal tab behind `canViewFines`.
- Part 4 requests: typed requests with status and reply, staff inbox, behind `canSubmitRequests`.
