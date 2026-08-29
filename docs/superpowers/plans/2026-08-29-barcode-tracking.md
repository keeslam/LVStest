# Barcode-Based Vehicle & Reservation Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every vehicle a permanent unique barcode printable on key labels, scannable via USB/Bluetooth scanners and device cameras, that instantly opens the vehicle with its reservation context; plus a printable "Barcode Book" of all vehicle barcodes, and reservation barcode lookup.

**Architecture:** A `barcode` column on `vehicles` (unique, auto-assigned `VEH-000123` from the row id, regenerable by admins). A single server lookup endpoint (`GET /api/barcodes/:code`) resolves any scanned code (vehicle barcode, `RES-` reservation barcode, or license plate fallback) and returns the vehicle plus its current reservation context. Client side: a `/scan` page with an auto-focused input (USB/Bluetooth scanners type + Enter) and an optional camera scanner (html5-qrcode), a context card with actions wired to the existing `GlobalDialogContext` dialogs, barcode rendering as SVG via JsBarcode, and a `/vehicles/barcodes` Barcode Book page with print CSS. No server-side barcode PDF: SVG + browser print gives crisp vector output. Configurable **barcode label templates** live in a new tab on the Documents page and REUSE the existing drag-position template editor: the transport-report editor (`client/src/pages/documents/transport-report-template-editor.tsx`, itself a clone of the contract editor — cloning + adapting is this repo's established template-editor pattern per the schema comment at `shared/schema.ts:826`) is cloned to a barcode-label editor with vehicle data sources, a special positioned `barcode` field type rendered via JsBarcode, and a configurable label canvas size (mm) instead of fixed A4. Table `barcode_label_templates` mirrors `transport_report_templates` (name, isDefault, backgroundPath, fields jsonb) plus `label_width_mm`/`label_height_mm`. Sticker printing everywhere (vehicle details, barcode book) renders the template's positioned fields per vehicle into the print iframe.

**Tech Stack:** Existing: React + wouter + TanStack Query + Radix/shadcn + i18next (nl primary), Express + Drizzle + Postgres (`startup-migration.js` for prod migrations), pdf-lib (untouched). New deps: `jsbarcode` (Code 128 SVG rendering), `html5-qrcode` (camera scanning; supports 1D CODE_128 and QR).

**Spec:** The user's request message of 2026-08-29 (barcode tracking system, 16 sections). Key decisions locked in from the spec: Code 128 format `VEH-` + zero-padded id; do not base barcode solely on license plate; no destructive actions on scan; reuse existing dialogs/print/permission systems; reservation barcodes are derived (`RES-` + id), vehicle barcodes are stored.

## Global Constraints

- Windows dev machine; shell scripts must work in Git Bash; do NOT run `npm run dev` via Bash (preview server already managed by the harness).
- Repo has **no test framework** (no vitest/jest). "Tests" for this plan = `npm run check` (tsc) passing + browser verification via the running preview at http://localhost:5000. Do not add a test framework.
- UI text: every user-visible string goes through i18next with both `nl` and `en` entries. Dutch is the primary language.
- Reuse: `GlobalDialogContext` for opening vehicle/reservation dialogs; `hasPermission(UserPermission.X)` + `requireAuth` middleware for API auth; `apiRequest` from `@/lib/queryClient` for mutations; `formatLicensePlate` from `@/lib/format-utils`.
- Migration safety: production DBs migrate through `startup-migration.js` (`addColumnIfNotExists` pattern); dev DBs through `npm run db:push`. Both must be updated.
- Commit after each task with a conventional-commit message ending in the Claude co-author trailer.
- Barcode format: `VEH-` + 6-digit zero-padded vehicle id (e.g. `VEH-000123`); regenerated barcodes append `-R<n>` (e.g. `VEH-000123-R2`). Reservation lookup codes: `RES-` + 6-digit zero-padded reservation id, derived, never stored.
- No sensitive data in barcodes. No destructive action triggered purely by a scan.

---

### Task 1: Shared barcode utilities + schema column + migrations

**Files:**
- Create: `shared/barcode.ts`
- Modify: `shared/schema.ts` (vehicles table, ~line 247, next to `availabilityStatus`)
- Modify: `startup-migration.js` (inside the existing migration function, after other `addColumnIfNotExists` calls)

**Interfaces:**
- Produces: `formatVehicleBarcode(vehicleId: number, revision?: number): string`, `formatReservationBarcode(reservationId: number): string`, `parseBarcode(raw: string): ParsedBarcode`, type `ParsedBarcode = { kind: "vehicle"; vehicleId: number } | { kind: "reservation"; reservationId: number } | { kind: "unknown"; normalized: string }`, and `vehicles.barcode: text | null` on the Drizzle schema.

- [ ] **Step 1: Create `shared/barcode.ts`**

```typescript
/**
 * Central barcode format for the whole app. Vehicle barcodes are STORED on the
 * vehicles.barcode column (assigned once, regenerable by admins); reservation
 * barcodes are DERIVED from the reservation id and never stored. Code 128 is
 * the symbology used everywhere (JsBarcode on the client renders it).
 */

export const VEHICLE_BARCODE_PREFIX = "VEH-";
export const RESERVATION_BARCODE_PREFIX = "RES-";

// VEH-000123 or VEH-000123-R2 (revision suffix added on regeneration so the
// old physical label stops matching after an explicit admin regenerate)
const VEHICLE_BARCODE_RE = /^VEH-(\d{6,})(?:-R(\d+))?$/;
const RESERVATION_BARCODE_RE = /^RES-(\d{6,})$/;

export type ParsedBarcode =
  | { kind: "vehicle"; vehicleId: number }
  | { kind: "reservation"; reservationId: number }
  | { kind: "unknown"; normalized: string };

export function formatVehicleBarcode(vehicleId: number, revision?: number): string {
  const base = `${VEHICLE_BARCODE_PREFIX}${String(vehicleId).padStart(6, "0")}`;
  return revision && revision > 1 ? `${base}-R${revision}` : base;
}

export function formatReservationBarcode(reservationId: number): string {
  return `${RESERVATION_BARCODE_PREFIX}${String(reservationId).padStart(6, "0")}`;
}

// Scanners sometimes send trailing whitespace/CR and users may type lowercase.
export function normalizeScannedCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function parseBarcode(raw: string): ParsedBarcode {
  const normalized = normalizeScannedCode(raw);
  const vehicleMatch = VEHICLE_BARCODE_RE.exec(normalized);
  if (vehicleMatch) {
    return { kind: "vehicle", vehicleId: parseInt(vehicleMatch[1], 10) };
  }
  const reservationMatch = RESERVATION_BARCODE_RE.exec(normalized);
  if (reservationMatch) {
    return { kind: "reservation", reservationId: parseInt(reservationMatch[1], 10) };
  }
  return { kind: "unknown", normalized };
}
```

- [ ] **Step 2: Add the column to the Drizzle schema**

In `shared/schema.ts`, inside `export const vehicles = pgTable("vehicles", {...})`, directly after the `availabilityStatus` field (~line 247), add:

```typescript
  // Permanent scan identifier printed on the key label. Assigned automatically
  // from the row id (VEH-000123, see shared/barcode.ts); only an explicit admin
  // regenerate changes it. Unique index added in startup-migration.js.
  barcode: text("barcode").unique(),
```

Note: nullable on purpose — rows get their value backfilled/assigned right after insert (the id is needed to compute it). Also confirm `insertVehicleSchema` does not require it (it uses `createInsertSchema(vehicles).omit(...)` — a nullable column is optional automatically; no change needed there).

- [ ] **Step 3: Add production migration**

In `startup-migration.js`, inside the main migration function where the other `addColumnIfNotExists` calls live, add (following the file's existing style):

```javascript
  // Barcode tracking: permanent per-vehicle scan code printed on key labels
  await addColumnIfNotExists('vehicles', 'barcode', 'TEXT');
  try {
    await db.execute(sql`
      UPDATE vehicles
      SET barcode = 'VEH-' || LPAD(id::text, 6, '0')
      WHERE barcode IS NULL
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS vehicles_barcode_unique_idx
      ON vehicles (barcode)
    `);
    console.log('✅ Vehicle barcodes backfilled and unique index ensured');
  } catch (error) {
    console.error('⚠️ Vehicle barcode backfill failed:', error.message);
  }
```

- [ ] **Step 4: Push schema to dev DB and verify**

Run: `npm run db:push` (answer non-destructive prompts if any; the new column is additive).
Then run the backfill against the dev DB by executing `node startup-migration.js` **only if** that script is safe to run standalone locally (it is — it only adds missing columns); otherwise backfill via a one-off script. Verify:

```bash
node -e "
import('pg').then(async ({default: pkg}) => {
  const pool = new pkg.Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
  const r = await pool.query(\"SELECT id, barcode FROM vehicles ORDER BY id LIMIT 5\");
  console.log(r.rows);
  const dup = await pool.query(\"SELECT barcode, COUNT(*) FROM vehicles GROUP BY barcode HAVING COUNT(*) > 1\");
  console.log('duplicates:', dup.rows.length);
  await pool.end();
});
"
```

Expected: 5 rows each with `VEH-0000NN` barcodes matching their ids; `duplicates: 0`. (Load DATABASE_URL from `.env` — the app uses `dotenv`.)

- [ ] **Step 5: Typecheck**

Run: `npm run check`
Expected: no NEW errors (the repo may have pre-existing ones; compare against a baseline run taken before editing).

- [ ] **Step 6: Commit**

```bash
git add shared/barcode.ts shared/schema.ts startup-migration.js
git commit -m "feat: add unique vehicle barcode column with backfill migration

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Storage methods + auto-assign barcode on vehicle creation

**Files:**
- Modify: `server/storage.ts` (IStorage interface ~line 42 area; MemStorage class)
- Modify: `server/database-storage.ts` (DatabaseStorage class, `createVehicle` and new methods)

**Interfaces:**
- Consumes: `formatVehicleBarcode` from `shared/barcode.ts` (Task 1).
- Produces: `getVehicleByBarcode(barcode: string): Promise<Vehicle | undefined>` and `regenerateVehicleBarcode(id: number, updatedBy?: string): Promise<Vehicle | undefined>` on `IStorage`, implemented in both `MemStorage` and `DatabaseStorage`; `createVehicle` in both now returns a vehicle whose `barcode` is set.

- [ ] **Step 1: Extend the IStorage interface**

In `server/storage.ts`, next to `getVehicle(id: number)` (~line 42), add:

```typescript
  getVehicleByBarcode(barcode: string): Promise<Vehicle | undefined>;
  // Bumps the -R<n> revision suffix so old printed labels stop resolving.
  regenerateVehicleBarcode(id: number, updatedBy?: string): Promise<Vehicle | undefined>;
```

- [ ] **Step 2: Implement in DatabaseStorage**

In `server/database-storage.ts`: find `createVehicle`. After the insert returns the new row, if `barcode` is null, immediately update it to `formatVehicleBarcode(insertedVehicle.id)` and return the updated row. Add imports from `../shared/barcode` (match the import style already used for `../shared/schema` in that file — check whether it uses `.js` suffixes and copy that). Then add:

```typescript
  async getVehicleByBarcode(barcode: string): Promise<Vehicle | undefined> {
    const [vehicle] = await db
      .select()
      .from(vehicles)
      .where(eq(vehicles.barcode, barcode));
    return vehicle;
  }

  async regenerateVehicleBarcode(id: number, updatedBy?: string): Promise<Vehicle | undefined> {
    const vehicle = await this.getVehicle(id);
    if (!vehicle) return undefined;
    // Parse current revision from an existing -R<n> suffix; bump it.
    const match = /-R(\d+)$/.exec(vehicle.barcode ?? "");
    const nextRevision = match ? parseInt(match[1], 10) + 1 : 2;
    const newBarcode = formatVehicleBarcode(id, nextRevision);
    const [updated] = await db
      .update(vehicles)
      .set({ barcode: newBarcode, updatedBy: updatedBy ?? vehicle.updatedBy, updatedAt: new Date() })
      .where(eq(vehicles.id, id))
      .returning();
    return updated;
  }
```

(Adapt exact `db`/`eq`/`vehicles` identifiers to what the file already imports — it uses Drizzle throughout; follow the pattern of the existing `getVehicle` implementation in the same file.)

- [ ] **Step 3: Implement in MemStorage**

In `server/storage.ts` MemStorage class, mirror the same behavior against the in-memory `this.vehicles` map:

```typescript
  async getVehicleByBarcode(barcode: string): Promise<Vehicle | undefined> {
    return Array.from(this.vehicles.values()).find(v => v.barcode === barcode);
  }

  async regenerateVehicleBarcode(id: number, updatedBy?: string): Promise<Vehicle | undefined> {
    const vehicle = this.vehicles.get(id);
    if (!vehicle) return undefined;
    const match = /-R(\d+)$/.exec(vehicle.barcode ?? "");
    const nextRevision = match ? parseInt(match[1], 10) + 1 : 2;
    const updated = { ...vehicle, barcode: formatVehicleBarcode(id, nextRevision), updatedBy: updatedBy ?? vehicle.updatedBy };
    this.vehicles.set(id, updated);
    return updated;
  }
```

And in MemStorage's `createVehicle`, set `barcode: formatVehicleBarcode(newId)` on the created object.

- [ ] **Step 4: Typecheck**

Run: `npm run check`
Expected: no new errors. If TypeScript complains that other IStorage implementers miss the methods, implement them there too (search `implements IStorage`).

- [ ] **Step 5: Commit**

```bash
git add server/storage.ts server/database-storage.ts
git commit -m "feat: storage lookup + auto-assignment + regeneration for vehicle barcodes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Barcode lookup + regenerate API endpoints

**Files:**
- Modify: `server/routes.ts` (add endpoints near the other vehicle routes, ~line 1412 where `GET /api/vehicles/:id` lives)

**Interfaces:**
- Consumes: `parseBarcode`, `normalizeScannedCode`, `formatReservationBarcode` from `shared/barcode.ts`; `storage.getVehicleByBarcode`, `storage.regenerateVehicleBarcode`, `storage.getVehicle`, `storage.getReservationsByVehicle`, `storage.getReservation` (existing).
- Produces:
  - `GET /api/barcodes/:code` → `200 { type: "vehicle", vehicle, activeReservation, upcomingReservation, lastReturnedReservation }` or `200 { type: "reservation", reservation, vehicle }` or `404 { message }`. Auth: `requireAuth` + `hasPermission(VIEW_VEHICLES, MANAGE_VEHICLES)`.
  - `POST /api/vehicles/:id/barcode/regenerate` → `200 { vehicle }`. Auth: `requireAuth` + `hasPermission(MANAGE_VEHICLES)`.

- [ ] **Step 1: Add the lookup endpoint**

In `server/routes.ts`, next to the other vehicle endpoints, add (imports of `parseBarcode`/`normalizeScannedCode` go at the top of the file, matching its existing `../shared/...` import style):

```typescript
  // Resolve any scanned code: stored vehicle barcode, derived RES- reservation
  // code, or (fallback) a license plate typed/scanned manually.
  app.get("/api/barcodes/:code", requireAuth, hasPermission(UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES), async (req: Request, res: Response) => {
    try {
      const parsed = parseBarcode(req.params.code);

      if (parsed.kind === "reservation") {
        const reservation = await storage.getReservation(parsed.reservationId);
        if (!reservation || (reservation as any).deletedAt) {
          return res.status(404).json({ message: "Reservation not found for this barcode" });
        }
        const vehicle = reservation.vehicleId ? await storage.getVehicle(reservation.vehicleId) : undefined;
        return res.json({ type: "reservation", reservation, vehicle: vehicle ?? null });
      }

      // Vehicle path: exact barcode match first (covers -R revisions since the
      // stored value is matched verbatim), then license-plate fallback.
      const normalized = normalizeScannedCode(req.params.code);
      let vehicle = await storage.getVehicleByBarcode(normalized);
      if (!vehicle && parsed.kind === "unknown") {
        const plate = normalized.replace(/[-\s]/g, "");
        const all = await storage.getVehicles();
        vehicle = all.find(v => v.licensePlate.replace(/[-\s]/g, "").toUpperCase() === plate);
      }
      if (!vehicle) {
        return res.status(404).json({ message: "No vehicle found for this barcode" });
      }

      const today = new Date().toISOString().split("T")[0];
      const reservations = (await storage.getReservationsByVehicle(vehicle.id))
        .filter(r => !(r as any).deletedAt && r.type !== "maintenance_block");

      // Active: picked up and not returned, or booked window covering today.
      const activeReservation = reservations.find(r =>
        r.status === "picked_up" ||
        (r.status === "booked" && r.startDate <= today && (!r.endDate || r.endDate >= today))
      ) ?? null;

      // Upcoming: earliest booked reservation starting after today.
      const upcomingReservation = reservations
        .filter(r => r.status === "booked" && r.startDate > today)
        .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null;

      // Most recent returned/completed one, for return-flow context.
      const lastReturnedReservation = reservations
        .filter(r => r.status === "returned" || r.status === "completed")
        .sort((a, b) => b.startDate.localeCompare(a.startDate))[0] ?? null;

      return res.json({
        type: "vehicle",
        vehicle,
        activeReservation,
        upcomingReservation,
        lastReturnedReservation,
      });
    } catch (error) {
      console.error("Barcode lookup failed:", error);
      return res.status(500).json({ message: "Barcode lookup failed" });
    }
  });
```

(Check what the existing `getReservation` single-fetch method is called in IStorage — if it's `getReservation(id)`, use that; adapt name if different. `getVehicles()` likewise — confirm exact name via grep before writing.)

- [ ] **Step 2: Add the regenerate endpoint**

```typescript
  app.post("/api/vehicles/:id/barcode/regenerate", requireAuth, hasPermission(UserPermission.MANAGE_VEHICLES), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid vehicle id" });
      }
      const updatedBy = (req.user as any)?.fullName || (req.user as any)?.username;
      const vehicle = await storage.regenerateVehicleBarcode(id, updatedBy);
      if (!vehicle) {
        return res.status(404).json({ message: "Vehicle not found" });
      }
      return res.json({ vehicle });
    } catch (error) {
      console.error("Barcode regeneration failed:", error);
      return res.status(500).json({ message: "Barcode regeneration failed" });
    }
  });
```

- [ ] **Step 3: Typecheck and smoke-test the endpoint**

Run: `npm run check` → no new errors.
With the dev server running (preview), verify via the browser preview's network tools or authenticated fetch from the app context — e.g., temporarily via the browser console on the logged-in app: `fetch('/api/barcodes/VEH-000003').then(r=>r.json()).then(console.log)`.
Expected: `{ type: "vehicle", vehicle: { id: 3, ... }, ... }`. Also verify `VEH-999999` → 404 with message, and `RES-000001` resolves if reservation 1 exists.

- [ ] **Step 4: Commit**

```bash
git add server/routes.ts
git commit -m "feat: barcode lookup and regeneration API endpoints

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Client barcode rendering component + dependencies

**Files:**
- Modify: `package.json` (via npm install)
- Create: `client/src/components/barcodes/barcode-svg.tsx`

**Interfaces:**
- Produces: `<BarcodeSvg value={string} height?={number} className?={string} />` — renders a Code 128 SVG with human-readable text below, transparent background, quiet zone included. Used by Tasks 5, 7, 8.

- [ ] **Step 1: Install dependencies**

```bash
npm install jsbarcode html5-qrcode
```

(`jsbarcode` ships its own types; `html5-qrcode` is TypeScript-native. Verify both import cleanly; if jsbarcode types are missing in this version, `npm i -D @types/jsbarcode`.)

- [ ] **Step 2: Create the BarcodeSvg component**

```tsx
import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

interface BarcodeSvgProps {
  value: string;
  /** Bar height in px (not counting text). Print labels use taller bars. */
  height?: number;
  className?: string;
}

// Code 128 SVG barcode with the human-readable value underneath. SVG keeps
// print output vector-crisp; JsBarcode adds the required quiet zone via margin.
export function BarcodeSvg({ value, height = 60, className }: BarcodeSvgProps) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, {
        format: "CODE128",
        displayValue: true,
        fontSize: 14,
        height,
        margin: 10, // quiet zone
        background: "transparent",
        lineColor: "#000000",
      });
    } catch (error) {
      console.error("Barcode render failed for value:", value, error);
    }
  }, [value, height]);

  if (!value) return null;
  return <svg ref={ref} className={className} data-testid={`barcode-${value}`} />;
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run check` → no new errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json client/src/components/barcodes/barcode-svg.tsx
git commit -m "feat: add JsBarcode/html5-qrcode deps and BarcodeSvg component

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Scan page with scanner-friendly input + context card + navigation

**Files:**
- Create: `client/src/pages/scan/index.tsx`
- Create: `client/src/locales/nl/barcodes.json`
- Create: `client/src/locales/en/barcodes.json`
- Modify: `client/src/i18n.ts` (register `barcodes` namespace, both languages)
- Modify: `client/src/App.tsx` (route `/scan`)
- Modify: `client/src/components/sidebar-nav.tsx` (nav item + icon)
- Modify: `client/src/locales/nl/nav.json`, `client/src/locales/en/nav.json` (nav label)

**Interfaces:**
- Consumes: `GET /api/barcodes/:code` (Task 3 shape), `openVehicleDialog(vehicleId)` / `openReservationDialog(id)` from `useGlobalDialog()`, `<BarcodeSvg>` (Task 4), `formatLicensePlate` from `@/lib/format-utils`.
- Produces: route `/scan`; component `ScanPage` (default export). The camera dialog slot is added in Task 6 — leave a clearly marked mount point (a `cameraOpen` state and button already wired, dialog added next task).

- [ ] **Step 1: Create locale files**

`client/src/locales/nl/barcodes.json`:

```json
{
  "scanPage": {
    "title": "Barcode scannen",
    "description": "Scan een sleutellabel met een barcodescanner of camera, of typ de code handmatig.",
    "inputPlaceholder": "Scan of typ een barcode (VEH-... / RES-... / kenteken)",
    "searchButton": "Zoeken",
    "cameraButton": "Camera scannen",
    "notFound": "Geen voertuig of reservering gevonden voor \"{{code}}\"",
    "lookupError": "Opzoeken mislukt. Controleer de verbinding en probeer opnieuw.",
    "scanning": "Bezig met zoeken...",
    "vehicleFound": "Voertuig gevonden",
    "reservationFound": "Reservering gevonden",
    "statusLabel": "Status",
    "barcodeLabel": "Barcode",
    "licensePlateLabel": "Kenteken",
    "customerLabel": "Klant",
    "periodLabel": "Periode",
    "openEnded": "open einde",
    "activeReservation": "Actieve reservering",
    "upcomingReservation": "Aankomende reservering",
    "noReservation": "Geen actieve of aankomende reservering",
    "openVehicleButton": "Voertuig openen",
    "openReservationButton": "Reservering openen",
    "scanAgain": "Opnieuw scannen",
    "status": {
      "available": "Beschikbaar",
      "scheduled": "Gereserveerd",
      "rented": "Verhuurd",
      "needs_fixing": "In reparatie",
      "not_for_rental": "Niet voor verhuur"
    },
    "reservationStatus": {
      "booked": "Geboekt",
      "picked_up": "Opgehaald",
      "returned": "Geretourneerd",
      "completed": "Afgerond"
    }
  },
  "camera": {
    "dialogTitle": "Camera scannen",
    "dialogDescription": "Richt de camera op de barcode van het sleutellabel.",
    "permissionDenied": "Cameratoegang geweigerd. Sta cameragebruik toe in de browserinstellingen of gebruik het invoerveld.",
    "noCamera": "Geen camera gevonden op dit apparaat.",
    "startError": "Camera starten mislukt.",
    "closeButton": "Sluiten"
  },
  "label": {
    "printKeyLabel": "Sleutellabel afdrukken",
    "viewBarcode": "Barcode bekijken",
    "regenerate": "Barcode opnieuw genereren",
    "regenerateConfirmTitle": "Barcode opnieuw genereren?",
    "regenerateConfirmDescription": "De oude barcode ({{barcode}}) werkt daarna niet meer. Reeds afgedrukte labels moeten opnieuw worden afgedrukt. Deze actie kan niet ongedaan worden gemaakt.",
    "regenerateSuccess": "Nieuwe barcode: {{barcode}}",
    "regenerateError": "Barcode opnieuw genereren mislukt.",
    "barcodeDialogTitle": "Voertuigbarcode"
  },
  "book": {
    "title": "Barcodeboek",
    "description": "Druk alle voertuigbarcodes af voor in een map of klapper.",
    "searchPlaceholder": "Zoeken op kenteken, merk of model...",
    "statusFilterAll": "Alle statussen",
    "selectAll": "Alles selecteren",
    "deselectAll": "Selectie wissen",
    "selectedCount": "{{count}} geselecteerd",
    "printSelectedButton": "Selectie afdrukken",
    "printAllButton": "Alles afdrukken ({{count}})",
    "printFilteredButton": "Gefilterde afdrukken ({{count}})",
    "noVehicles": "Geen voertuigen gevonden",
    "pageHeader": "Barcodeboek — Auto Lease LAM"
  }
}
```

`client/src/locales/en/barcodes.json` — same keys, English values:

```json
{
  "scanPage": {
    "title": "Scan barcode",
    "description": "Scan a key label with a barcode scanner or camera, or type the code manually.",
    "inputPlaceholder": "Scan or type a barcode (VEH-... / RES-... / license plate)",
    "searchButton": "Search",
    "cameraButton": "Camera scan",
    "notFound": "No vehicle or reservation found for \"{{code}}\"",
    "lookupError": "Lookup failed. Check the connection and try again.",
    "scanning": "Looking up...",
    "vehicleFound": "Vehicle found",
    "reservationFound": "Reservation found",
    "statusLabel": "Status",
    "barcodeLabel": "Barcode",
    "licensePlateLabel": "License plate",
    "customerLabel": "Customer",
    "periodLabel": "Period",
    "openEnded": "open-ended",
    "activeReservation": "Active reservation",
    "upcomingReservation": "Upcoming reservation",
    "noReservation": "No active or upcoming reservation",
    "openVehicleButton": "Open vehicle",
    "openReservationButton": "Open reservation",
    "scanAgain": "Scan again",
    "status": {
      "available": "Available",
      "scheduled": "Reserved",
      "rented": "Rented",
      "needs_fixing": "In repair",
      "not_for_rental": "Not for rental"
    },
    "reservationStatus": {
      "booked": "Booked",
      "picked_up": "Picked up",
      "returned": "Returned",
      "completed": "Completed"
    }
  },
  "camera": {
    "dialogTitle": "Camera scan",
    "dialogDescription": "Point the camera at the key label barcode.",
    "permissionDenied": "Camera access denied. Allow camera use in your browser settings or use the input field.",
    "noCamera": "No camera found on this device.",
    "startError": "Failed to start the camera.",
    "closeButton": "Close"
  },
  "label": {
    "printKeyLabel": "Print key label",
    "viewBarcode": "View barcode",
    "regenerate": "Regenerate barcode",
    "regenerateConfirmTitle": "Regenerate barcode?",
    "regenerateConfirmDescription": "The old barcode ({{barcode}}) will stop working. Already printed labels must be reprinted. This cannot be undone.",
    "regenerateSuccess": "New barcode: {{barcode}}",
    "regenerateError": "Failed to regenerate barcode.",
    "barcodeDialogTitle": "Vehicle barcode"
  },
  "book": {
    "title": "Barcode book",
    "description": "Print all vehicle barcodes for a physical binder.",
    "searchPlaceholder": "Search by license plate, make or model...",
    "statusFilterAll": "All statuses",
    "selectAll": "Select all",
    "deselectAll": "Clear selection",
    "selectedCount": "{{count}} selected",
    "printSelectedButton": "Print selection",
    "printAllButton": "Print all ({{count}})",
    "printFilteredButton": "Print filtered ({{count}})",
    "noVehicles": "No vehicles found",
    "pageHeader": "Barcode book — Auto Lease LAM"
  }
}
```

- [ ] **Step 2: Register the namespace in `client/src/i18n.ts`**

Add imports `barcodesNl` / `barcodesEn` from the new files, add `barcodes: barcodesNl` and `barcodes: barcodesEn` to the respective `resources` blocks, and `"barcodes"` to the `ns` array.

- [ ] **Step 3: Create the scan page**

`client/src/pages/scan/index.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScanLine, Camera, Truck, CalendarRange, User, RotateCcw } from "lucide-react";
import { useGlobalDialog } from "@/contexts/GlobalDialogContext";
import { formatDate, formatLicensePlate } from "@/lib/format-utils";
import { BarcodeSvg } from "@/components/barcodes/barcode-svg";
import { Vehicle, Reservation } from "@shared/schema";

type LookupResult =
  | { type: "vehicle"; vehicle: Vehicle; activeReservation: Reservation | null; upcomingReservation: Reservation | null; lastReturnedReservation: Reservation | null }
  | { type: "reservation"; reservation: Reservation; vehicle: Vehicle | null };

export default function ScanPage() {
  const { t } = useTranslation(["barcodes", "common"]);
  const { openVehicleDialog, openReservationDialog } = useGlobalDialog();
  const [code, setCode] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // USB/Bluetooth scanners emulate a keyboard: focus the field on mount so a
  // scan lands here without a click. Refocus after each lookup for repeat scans.
  useEffect(() => {
    inputRef.current?.focus();
  }, [result, error]);

  const lookup = async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    setIsLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch(`/api/barcodes/${encodeURIComponent(trimmed)}`, { credentials: "include" });
      if (response.status === 404) {
        setError(t("scanPage.notFound", { code: trimmed }));
        return;
      }
      if (!response.ok) {
        setError(t("scanPage.lookupError"));
        return;
      }
      setResult(await response.json());
    } catch {
      setError(t("scanPage.lookupError"));
    } finally {
      setIsLoading(false);
      setCode("");
    }
  };

  // Scanners terminate with Enter; the form submit catches both scanner and
  // manual entry without a page reload.
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    lookup(code);
  };

  const statusBadge = (vehicle: Vehicle) => {
    const status = vehicle.availabilityStatus || "available";
    const variant = status === "available" ? "default" : status === "rented" ? "destructive" : "secondary";
    return <Badge variant={variant}>{t(`scanPage.status.${status}`, { defaultValue: status })}</Badge>;
  };

  const reservationCard = (reservation: Reservation, headingKey: string) => (
    <div className="border rounded-md p-4 space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground">{t(headingKey)}</h3>
      <div className="flex items-center gap-2">
        <User className="h-4 w-4 text-primary" />
        <span>{(reservation as any).customer?.name || "-"}</span>
        <Badge variant="outline">{t(`scanPage.reservationStatus.${reservation.status}`, { defaultValue: reservation.status })}</Badge>
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <CalendarRange className="h-4 w-4" />
        <span>
          {formatDate(reservation.startDate)} — {reservation.endDate ? formatDate(reservation.endDate) : t("scanPage.openEnded")}
        </span>
      </div>
      <Button size="sm" onClick={() => openReservationDialog(reservation.id)} data-testid={`button-open-reservation-${reservation.id}`}>
        {t("scanPage.openReservationButton")}
      </Button>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ScanLine className="h-6 w-6" />
          {t("scanPage.title")}
        </h1>
        <p className="text-muted-foreground">{t("scanPage.description")}</p>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          ref={inputRef}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t("scanPage.inputPlaceholder")}
          autoComplete="off"
          autoFocus
          className="text-lg"
          data-testid="input-barcode-scan"
        />
        <Button type="submit" disabled={isLoading || !code.trim()}>
          {isLoading ? t("scanPage.scanning") : t("scanPage.searchButton")}
        </Button>
        <Button type="button" variant="outline" onClick={() => setCameraOpen(true)} title={t("scanPage.cameraButton")}>
          <Camera className="h-4 w-4" />
        </Button>
      </form>

      {error && (
        <div className="border border-red-200 bg-red-50 text-red-700 rounded-md p-4" data-testid="scan-error">
          {error}
        </div>
      )}

      {result?.type === "vehicle" && (
        <Card data-testid="scan-result-vehicle">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-primary" />
                {result.vehicle.brand} {result.vehicle.model}
              </span>
              {statusBadge(result.vehicle)}
            </CardTitle>
            <CardDescription>
              {t("scanPage.licensePlateLabel")}: {formatLicensePlate(result.vehicle.licensePlate)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {result.vehicle.barcode && <BarcodeSvg value={result.vehicle.barcode} height={40} />}

            {result.activeReservation
              ? reservationCard(result.activeReservation, "scanPage.activeReservation")
              : result.upcomingReservation
                ? reservationCard(result.upcomingReservation, "scanPage.upcomingReservation")
                : <p className="text-muted-foreground text-sm">{t("scanPage.noReservation")}</p>}

            <div className="flex gap-2 pt-2 border-t">
              <Button onClick={() => openVehicleDialog(result.vehicle.id)} data-testid="button-open-vehicle">
                {t("scanPage.openVehicleButton")}
              </Button>
              <Button variant="outline" onClick={() => { setResult(null); inputRef.current?.focus(); }}>
                <RotateCcw className="h-4 w-4 mr-2" />
                {t("scanPage.scanAgain")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {result?.type === "reservation" && (
        <Card data-testid="scan-result-reservation">
          <CardHeader>
            <CardTitle>{t("scanPage.reservationFound")}</CardTitle>
            {result.vehicle && (
              <CardDescription>
                {result.vehicle.brand} {result.vehicle.model} ({formatLicensePlate(result.vehicle.licensePlate)})
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {reservationCard(result.reservation, "scanPage.reservationFound")}
            {result.vehicle && (
              <Button variant="outline" onClick={() => openVehicleDialog(result.vehicle!.id)}>
                {t("scanPage.openVehicleButton")}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Camera scanner dialog mounts here — added in the camera-scanning task. */}
      {cameraOpen && null}
    </div>
  );
}
```

- [ ] **Step 4: Register route and navigation**

In `client/src/App.tsx`: `import ScanPage from "@/pages/scan/index";` and add `<ProtectedRoute path="/scan" component={ScanPage} />` next to the other routes.

In `client/src/components/sidebar-nav.tsx`: add to `navItems` after the vehicles entry:

```typescript
    { href: "/scan", labelKey: "scan", icon: "scan", permissions: [UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES] },
```

and a `"scan"` case in `getNavIcon` (lucide scan-line paths):

```tsx
    case "scan":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`lucide lucide-scan-line ${className}`}>
          <path d="M3 7V5a2 2 0 0 1 2-2h2" />
          <path d="M17 3h2a2 2 0 0 1 2 2v2" />
          <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
          <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
          <path d="M7 12h10" />
        </svg>
      );
```

Add `"scan": "Scannen"` to `client/src/locales/nl/nav.json` and `"scan": "Scan"` to `client/src/locales/en/nav.json`.

- [ ] **Step 5: Typecheck + browser verification**

Run: `npm run check` → no new errors.
In the preview: open `/scan`, type `VEH-000003`, press Enter → vehicle card with status, barcode SVG, reservation context (or "no reservation"), and the Open Vehicle button opens the existing VehicleViewDialog. Type garbage `XXXXX` → clear not-found message, input refocused and cleared. Type a real license plate → resolves to the vehicle.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/scan client/src/locales/nl/barcodes.json client/src/locales/en/barcodes.json client/src/i18n.ts client/src/App.tsx client/src/components/sidebar-nav.tsx client/src/locales/nl/nav.json client/src/locales/en/nav.json
git commit -m "feat: barcode scan page with scanner-friendly input and vehicle context

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Camera scanning dialog

**Files:**
- Create: `client/src/components/barcodes/camera-scanner-dialog.tsx`
- Modify: `client/src/pages/scan/index.tsx` (replace the `{cameraOpen && null}` placeholder)

**Interfaces:**
- Consumes: `html5-qrcode` (`Html5Qrcode` class), locale keys under `barcodes:camera.*` (Task 5).
- Produces: `<CameraScannerDialog open onOpenChange onScan={(code: string) => void} />`. `onScan` fires once per successful decode; the dialog closes itself after a successful scan.

- [ ] **Step 1: Create the dialog component**

```tsx
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface CameraScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (code: string) => void;
}

const REGION_ID = "barcode-camera-region";

// One Html5Qrcode instance per open dialog; always stopped+cleared on close or
// unmount so a second open never runs two camera streams at once.
export function CameraScannerDialog({ open, onOpenChange, onScan }: CameraScannerDialogProps) {
  const { t } = useTranslation(["barcodes"]);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setErrorKey(null);

    const scanner = new Html5Qrcode(REGION_ID, {
      formatsToSupport: [
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.QR_CODE,
      ],
      verbose: false,
    });
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 280, height: 140 } },
        (decodedText) => {
          if (cancelled) return;
          cancelled = true;
          onScan(decodedText);
          onOpenChange(false);
        },
        () => { /* per-frame decode misses are expected; ignore */ }
      )
      .catch((error: unknown) => {
        const message = String(error);
        if (message.includes("NotAllowedError") || message.includes("Permission")) {
          setErrorKey("camera.permissionDenied");
        } else if (message.includes("NotFoundError") || message.includes("no camera")) {
          setErrorKey("camera.noCamera");
        } else {
          setErrorKey("camera.startError");
        }
      });

    return () => {
      cancelled = true;
      const current = scannerRef.current;
      scannerRef.current = null;
      if (current) {
        // stop() rejects if start() never succeeded; clear() is safe after.
        current.stop().catch(() => {}).finally(() => current.clear());
      }
    };
  }, [open, onScan, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("camera.dialogTitle")}</DialogTitle>
          <DialogDescription>{t("camera.dialogDescription")}</DialogDescription>
        </DialogHeader>
        {errorKey ? (
          <div className="border border-red-200 bg-red-50 text-red-700 rounded-md p-4">
            {t(errorKey)}
          </div>
        ) : (
          <div id={REGION_ID} className="w-full overflow-hidden rounded-md" />
        )}
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          {t("camera.closeButton")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Mount it in the scan page**

In `client/src/pages/scan/index.tsx` replace:

```tsx
      {/* Camera scanner dialog mounts here — added in the camera-scanning task. */}
      {cameraOpen && null}
```

with:

```tsx
      <CameraScannerDialog
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        onScan={(scanned) => lookup(scanned)}
      />
```

and add the import: `import { CameraScannerDialog } from "@/components/barcodes/camera-scanner-dialog";`

- [ ] **Step 3: Typecheck + browser verification**

Run: `npm run check` → no new errors.
In the preview (desktop, likely no camera): open `/scan` → camera button → dialog opens and shows the no-camera/permission error message rather than crashing; Close button stops cleanly; reopening doesn't double-start. (Real camera decode is verified on a physical device in final verification.)

- [ ] **Step 4: Commit**

```bash
git add client/src/components/barcodes/camera-scanner-dialog.tsx client/src/pages/scan/index.tsx
git commit -m "feat: camera barcode scanning dialog with clean lifecycle handling

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Key label printing + vehicle-details barcode actions + regenerate flow

**Files:**
- Create: `client/src/components/barcodes/key-label-print.ts` (print helper, no React needed for the print window)
- Create: `client/src/components/barcodes/vehicle-barcode-dialog.tsx`
- Modify: `client/src/components/vehicles/vehicle-details.tsx` (header actions area, near the Edit/Delete buttons ~line 958)

**Interfaces:**
- Consumes: `Vehicle` type; `POST /api/vehicles/:id/barcode/regenerate` (Task 3); `apiRequest` + `invalidateByPrefix` from `@/lib/queryClient`; `BarcodeSvg` (Task 4); JsBarcode directly for the print window; locale keys `barcodes:label.*` (Task 5).
- Produces: `printKeyLabels(vehicles: Array<Pick<Vehicle, "id" | "barcode" | "licensePlate" | "brand" | "model">>): void` — opens a print window with one 62×29mm-proportioned label per vehicle (also fine on A4); `<VehicleBarcodeDialog vehicle open onOpenChange />` with View/Print/Regenerate actions.

- [ ] **Step 1: Create the print helper**

`client/src/components/barcodes/key-label-print.ts`:

```typescript
import JsBarcode from "jsbarcode";

interface LabelVehicle {
  id: number;
  barcode: string | null;
  licensePlate: string;
  brand: string;
  model: string;
}

// Renders labels into a hidden same-origin iframe and prints it. SVG barcodes
// stay vector-sharp at any print scale. Layout targets standard key-label
// stock (~62x29mm) but prints fine on plain A4 as a grid.
export function printKeyLabels(vehicles: LabelVehicle[]): void {
  const printable = vehicles.filter((v): v is LabelVehicle & { barcode: string } => !!v.barcode);
  if (printable.length === 0) return;

  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  document.body.appendChild(frame);

  const doc = frame.contentDocument!;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; }
    .label {
      width: 62mm; height: 29mm; padding: 2mm;
      display: inline-flex; flex-direction: column; align-items: center; justify-content: center;
      page-break-inside: avoid; break-inside: avoid;
      border: 0.2mm dashed #bbb; margin: 1mm;
    }
    .label svg { max-width: 58mm; height: auto; }
    .meta { font-size: 8pt; text-align: center; line-height: 1.2; margin-top: 0.5mm; }
    .plate { font-weight: bold; font-size: 10pt; letter-spacing: 0.5pt; }
    @media print { .label { border: none; } }
  </style></head><body></body></html>`);
  doc.close();

  for (const vehicle of printable) {
    const label = doc.createElement("div");
    label.className = "label";
    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    label.appendChild(svg);
    const meta = doc.createElement("div");
    meta.className = "meta";
    const plate = doc.createElement("div");
    plate.className = "plate";
    plate.textContent = vehicle.licensePlate;
    const name = doc.createElement("div");
    name.textContent = `${vehicle.brand} ${vehicle.model}`;
    meta.appendChild(plate);
    meta.appendChild(name);
    label.appendChild(meta);
    doc.body.appendChild(label);
    JsBarcode(svg, vehicle.barcode, {
      format: "CODE128",
      displayValue: true,
      fontSize: 12,
      height: 40,
      margin: 6,
      background: "transparent",
    });
  }

  // Give layout a tick, print, then remove the frame.
  setTimeout(() => {
    frame.contentWindow!.focus();
    frame.contentWindow!.print();
    setTimeout(() => frame.remove(), 2000);
  }, 250);
}
```

- [ ] **Step 2: Create the vehicle barcode dialog**

`client/src/components/barcodes/vehicle-barcode-dialog.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Printer, RefreshCw } from "lucide-react";
import { Vehicle, UserRole, UserPermission } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { BarcodeSvg } from "./barcode-svg";
import { printKeyLabels } from "./key-label-print";
import { formatLicensePlate } from "@/lib/format-utils";

interface VehicleBarcodeDialogProps {
  vehicle: Vehicle;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VehicleBarcodeDialog({ vehicle, open, onOpenChange }: VehicleBarcodeDialogProps) {
  const { t } = useTranslation(["barcodes", "common"]);
  const { user } = useAuth();
  const { toast } = useToast();

  const canRegenerate =
    user?.role === UserRole.ADMIN ||
    ((user?.permissions as string[]) || []).includes(UserPermission.MANAGE_VEHICLES);

  const regenerateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/vehicles/${vehicle.id}/barcode/regenerate`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || t("label.regenerateError"));
      }
      return (await response.json()) as { vehicle: Vehicle };
    },
    onSuccess: (data) => {
      toast({ title: t("label.regenerateSuccess", { barcode: data.vehicle.barcode }) });
      invalidateByPrefix("/api/vehicles");
      invalidateByPrefix(`/api/vehicles/${vehicle.id}`);
    },
    onError: (error: Error) => {
      toast({ title: t("label.regenerateError"), description: error.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("label.barcodeDialogTitle")}</DialogTitle>
          <DialogDescription>
            {vehicle.brand} {vehicle.model} ({formatLicensePlate(vehicle.licensePlate)})
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-center py-4">
          {vehicle.barcode && <BarcodeSvg value={vehicle.barcode} height={70} />}
        </div>

        <div className="flex gap-2">
          <Button
            onClick={() => printKeyLabels([vehicle])}
            className="flex-1"
            data-testid="button-print-key-label"
          >
            <Printer className="h-4 w-4 mr-2" />
            {t("label.printKeyLabel")}
          </Button>
          {canRegenerate && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" disabled={regenerateMutation.isPending}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {t("label.regenerate")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("label.regenerateConfirmTitle")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("label.regenerateConfirmDescription", { barcode: vehicle.barcode })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("common:actions.cancel")}</AlertDialogCancel>
                  <AlertDialogAction onClick={() => regenerateMutation.mutate()}>
                    {t("label.regenerate")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Wire into vehicle details**

In `client/src/components/vehicles/vehicle-details.tsx`:
- Add state: `const [barcodeDialogOpen, setBarcodeDialogOpen] = useState(false);`
- In the header action-button row (next to the Edit button around line 958), add:

```tsx
          <Button variant="outline" size="sm" onClick={() => setBarcodeDialogOpen(true)} data-testid="button-view-barcode">
            <ScanLine className="mr-1 h-4 w-4" />
            {t("barcodes:label.viewBarcode")}
          </Button>
```

- Near the other dialogs at the bottom of the component:

```tsx
      {vehicle && (
        <VehicleBarcodeDialog vehicle={vehicle} open={barcodeDialogOpen} onOpenChange={setBarcodeDialogOpen} />
      )}
```

- Imports: `ScanLine` from lucide-react (extend the existing lucide import), `VehicleBarcodeDialog` from `@/components/barcodes/vehicle-barcode-dialog`. Also extend the component's `useTranslation([...])` array with `"barcodes"`.

- [ ] **Step 4: Typecheck + browser verification**

Run: `npm run check` → no new errors.
Preview: open a vehicle → "Barcode bekijken" button → dialog shows large barcode → "Sleutellabel afdrukken" opens the browser print preview showing a compact label with barcode + plate + make/model. Regenerate (as admin) → confirm dialog → toast with new `-R2` barcode → old code 404s on `/scan`, new one resolves.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/barcodes/key-label-print.ts client/src/components/barcodes/vehicle-barcode-dialog.tsx client/src/components/vehicles/vehicle-details.tsx
git commit -m "feat: key label printing, barcode dialog and regenerate flow on vehicle details

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Barcode Book page (list, filter, select, print)

**Files:**
- Create: `client/src/pages/vehicles/barcode-book.tsx`
- Modify: `client/src/App.tsx` (route `/vehicles/barcodes` — MUST be registered; wouter matches in order, and `/vehicles` uses `startsWith` highlighting so nav still highlights correctly)
- Modify: `client/src/pages/vehicles/index.tsx` (header button linking to the book, next to "Bulk importeren")

**Interfaces:**
- Consumes: `GET /api/vehicles` (existing list endpoint; returns `Vehicle[]`), `BarcodeSvg`, `printKeyLabels` is NOT used here — the book prints its own full-page layout via a dedicated print stylesheet on the page itself.
- Produces: route `/vehicles/barcodes` rendering `BarcodeBookPage` (default export).

- [ ] **Step 1: Create the page**

`client/src/pages/vehicles/barcode-book.tsx`:

```tsx
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer, BookOpen } from "lucide-react";
import { Vehicle } from "@shared/schema";
import { BarcodeSvg } from "@/components/barcodes/barcode-svg";
import { formatLicensePlate } from "@/lib/format-utils";

// Print rules: 2-column grid, ~8 entries per A4 page, entries never split
// across a page break, screen-only chrome hidden. The .print-page-header
// repeats via position at top of the printout only once (simple header).
const PRINT_STYLES = `
@media print {
  body * { visibility: hidden; }
  #barcode-book-print, #barcode-book-print * { visibility: visible; }
  #barcode-book-print { position: absolute; left: 0; top: 0; width: 100%; }
  .barcode-book-entry { break-inside: avoid; page-break-inside: avoid; }
  @page { size: A4 portrait; margin: 12mm; }
}
`;

export default function BarcodeBookPage() {
  const { t } = useTranslation(["barcodes", "vehicles", "common"]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const { data: vehicles, isLoading } = useQuery<Vehicle[]>({ queryKey: ["/api/vehicles"] });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (vehicles ?? [])
      .filter(v => !!v.barcode)
      .filter(v => statusFilter === "all" || v.availabilityStatus === statusFilter)
      .filter(v =>
        !q ||
        v.licensePlate.toLowerCase().replace(/-/g, "").includes(q.replace(/-/g, "")) ||
        v.brand.toLowerCase().includes(q) ||
        v.model.toLowerCase().includes(q)
      )
      .sort((a, b) => a.licensePlate.localeCompare(b.licensePlate));
  }, [vehicles, search, statusFilter]);

  const printSet = selected.size > 0 ? filtered.filter(v => selected.has(v.id)) : filtered;

  const toggle = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const statuses = ["all", "available", "scheduled", "rented", "needs_fixing", "not_for_rental"];

  return (
    <div className="space-y-6">
      <style>{PRINT_STYLES}</style>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6" />
            {t("book.title")}
          </h1>
          <p className="text-muted-foreground">{t("book.description")}</p>
        </div>
        <Button onClick={() => window.print()} disabled={printSet.length === 0} data-testid="button-print-book">
          <Printer className="h-4 w-4 mr-2" />
          {selected.size > 0
            ? t("book.printSelectedButton")
            : search || statusFilter !== "all"
              ? t("book.printFilteredButton", { count: printSet.length })
              : t("book.printAllButton", { count: printSet.length })}
        </Button>
      </div>

      <div className="flex flex-col md:flex-row gap-3 print:hidden">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("book.searchPlaceholder")}
          className="max-w-sm"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statuses.map(s => (
              <SelectItem key={s} value={s}>
                {s === "all" ? t("book.statusFilterAll") : t(`scanPage.status.${s}`, { defaultValue: s })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set(filtered.map(v => v.id)))}>
            {t("book.selectAll")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            {t("book.deselectAll")}
          </Button>
          {selected.size > 0 && <span>{t("book.selectedCount", { count: selected.size })}</span>}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">{t("book.noVehicles")}</p>
      ) : (
        <div id="barcode-book-print">
          <h2 className="hidden print:block text-lg font-bold mb-4">{t("book.pageHeader")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(printSet.length > 0 && selected.size > 0 ? filtered : filtered).map(vehicle => (
              <div
                key={vehicle.id}
                className={`barcode-book-entry border rounded-md p-4 flex flex-col items-center gap-1 ${
                  selected.size > 0 && !selected.has(vehicle.id) ? "print:hidden opacity-50" : ""
                }`}
              >
                <div className="self-start print:hidden">
                  <Checkbox
                    checked={selected.has(vehicle.id)}
                    onCheckedChange={() => toggle(vehicle.id)}
                    data-testid={`checkbox-vehicle-${vehicle.id}`}
                  />
                </div>
                <BarcodeSvg value={vehicle.barcode!} height={55} />
                <div className="text-center">
                  <div className="font-bold tracking-wide">{formatLicensePlate(vehicle.licensePlate)}</div>
                  <div className="text-sm text-muted-foreground">{vehicle.brand} {vehicle.model}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

Note the selection print behavior: unselected entries get `print:hidden` when a selection exists, so "print selection" needs no separate render path. Filtered-print falls out naturally since only `filtered` renders.

- [ ] **Step 2: Register route + entry point**

`client/src/App.tsx`: `import BarcodeBookPage from "@/pages/vehicles/barcode-book";` and add **above** the `/vehicles` route if wouter would otherwise shadow it (wouter `path="/vehicles"` is exact by default, so ordering is safe either way — still place `/vehicles/barcodes` first for clarity):

```tsx
              <ProtectedRoute path="/vehicles/barcodes" component={BarcodeBookPage} />
```

`client/src/pages/vehicles/index.tsx`: in the header next to "Bulk importeren", add:

```tsx
          <Link href="/vehicles/barcodes">
            <Button variant="outline">
              <BookOpen className="h-4 w-4 mr-2" />
              {t("barcodes:book.title")}
            </Button>
          </Link>
```

(Import `BookOpen` from lucide-react and `Link` from wouter if not already there; extend that page's `useTranslation` namespaces with `"barcodes"`.)

- [ ] **Step 3: Typecheck + browser verification**

Run: `npm run check` → no new errors.
Preview: `/vehicles/barcodes` → all vehicles with barcodes render in a 2-col grid; search filters live; status filter works; select 3 → print button label switches to "Selectie afdrukken"; `window.print()` preview shows only selected entries, header line, no cut-off barcodes (entries keep `break-inside: avoid`).

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/vehicles/barcode-book.tsx client/src/App.tsx client/src/pages/vehicles/index.tsx
git commit -m "feat: printable barcode book with search, filters and selection

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Reservation barcode surfacing

**Files:**
- Modify: `client/src/components/reservations/reservation-view-dialog.tsx` (add a barcode block near the reservation-id display)

**Interfaces:**
- Consumes: `formatReservationBarcode` from `shared/barcode.ts`, `BarcodeSvg` (Task 4). Lookup already works server-side (Task 3 handles `RES-` codes).

- [ ] **Step 1: Show the derived reservation barcode in the view dialog**

In `client/src/components/reservations/reservation-view-dialog.tsx`, locate where the reservation details render (find the reservation id / contract number display) and add a compact barcode row:

```tsx
          <div className="flex justify-center py-2">
            <BarcodeSvg value={formatReservationBarcode(reservation.id)} height={35} />
          </div>
```

with imports `import { BarcodeSvg } from "@/components/barcodes/barcode-svg";` and `import { formatReservationBarcode } from "@shared/barcode";`. Place it where it doesn't disturb the existing layout (bottom of the details section is fine). Guard on `reservation` being loaded, matching the component's existing null-handling.

- [ ] **Step 2: Typecheck + browser verification**

Run: `npm run check` → no new errors.
Preview: open any reservation view dialog → barcode `RES-0000NN` renders. Copy that code into `/scan` → reservation context card opens with customer, vehicle, dates, status, and the Open Reservation button works.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/reservations/reservation-view-dialog.tsx
git commit -m "feat: show scannable RES- barcode on reservation view dialog

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Barcode label template editor (clone of the existing template editor) + Documents tab

**Rationale:** The repo already has a drag-position template editor pattern used twice: `client/src/pages/documents/template-editor.tsx` (contracts) and `client/src/pages/documents/transport-report-template-editor.tsx` (transport reports — itself a clone of the contract one; the schema comment at `shared/schema.ts:826` documents cloning as the intended pattern so editors can't collide). Do NOT build a new editor. Clone the transport editor and adapt it: vehicle data sources, a positioned `barcode` field type rendered with JsBarcode, and a small configurable label canvas (mm) instead of fixed A4. Strip the background-upload/background-library features from the clone (labels print on blank sticker stock; removing those sections keeps schema to one table and drops the multer endpoints).

**Files:**
- Modify: `shared/schema.ts` (new `barcodeLabelTemplates` table after `transportReportTemplateBackgrounds` ~line 860)
- Modify: `startup-migration.js` (guarded CREATE TABLE)
- Modify: `server/storage.ts` (IStorage + MemStorage CRUD — mirror the existing transportReportTemplates storage methods; find them by grepping `TransportReportTemplate` in the file)
- Modify: `server/database-storage.ts` (DatabaseStorage CRUD, same mirror)
- Modify: `server/routes.ts` (CRUD endpoints, placed next to the transport-report-template routes ~line 12580)
- Create: `client/src/pages/documents/barcode-label-template-editor.tsx` (clone of `transport-report-template-editor.tsx`, adapted)
- Modify: `client/src/components/barcodes/key-label-print.ts` (template-driven positioned rendering)
- Modify: `client/src/pages/documents/index.tsx` (5th tab + editor dialog, cloned from the transport-templates tab ~lines 496 + 987-1061; TabsList `grid-cols-4` → `grid-cols-5`)
- Modify: `client/src/components/barcodes/vehicle-barcode-dialog.tsx` (template picker before printing)
- Modify: `client/src/pages/vehicles/barcode-book.tsx` (sticker-print button with template picker; the book's own full-page print stays unchanged)
- Modify: `client/src/locales/nl/barcodes.json`, `client/src/locales/en/barcodes.json` (template picker keys)
- Modify: `client/src/locales/nl/documents.json`, `client/src/locales/en/documents.json` (tab + editor strings, cloned from the transport-template keys and re-worded for barcode labels)

**Interfaces:**
- Consumes: the transport editor component as the clone source; `printKeyLabels` (Task 7 — signature extended here); `BarcodeSvg` (Task 4); `hasPermission(UserPermission.MANAGE_PDF_TEMPLATES)`; JsBarcode.
- Produces:
  - Table `barcode_label_templates`: `id, name, is_default, label_width_mm (int, default 62), label_height_mm (int, default 29), fields (jsonb), created_at, updated_at`. Drizzle export `barcodeLabelTemplates`, types `BarcodeLabelTemplate` / `InsertBarcodeLabelTemplate`.
  - Field shape stored in `fields` jsonb (defined in `shared/barcode.ts`):
    `BarcodeLabelField = { id: string; name: string; x: number; y: number; fontSize: number; isBold: boolean; source: string; textAlign: "left" | "center" | "right"; locked?: boolean; barcodeHeightMm?: number }`
    — same shape as the editors' existing `TemplateField` plus optional `barcodeHeightMm` (used only when `source === "barcode"`). **x/y are stored in mm** (label space), not A4 points.
  - Endpoints: `GET /api/barcode-label-templates` (requireAuth only — normal staff need the list for print pickers), `GET /api/barcode-label-templates/default` (requireAuth), `GET /api/barcode-label-templates/:id` (requireAuth), `POST | PATCH /:id | DELETE /:id` (requireAuth + `hasPermission(MANAGE_PDF_TEMPLATES)`).
  - `printKeyLabels(vehicles, template?: BarcodeLabelTemplate)` — with a template, renders its positioned fields per vehicle; without, keeps the Task 7 hardcoded 62×29 layout.

- [ ] **Step 1: Shared field type + data-source resolver in `shared/barcode.ts`**

```typescript
// Positioned field on a barcode label template. Same shape as the existing
// template editors' TemplateField, but x/y are in millimetres of label space
// (labels are small; mm maps 1:1 onto print CSS). barcodeHeightMm only
// applies when source === "barcode".
export interface BarcodeLabelField {
  id: string;
  name: string;
  x: number;
  y: number;
  fontSize: number;
  isBold: boolean;
  source: string;
  textAlign: "left" | "center" | "right";
  locked?: boolean;
  barcodeHeightMm?: number;
}

// Data sources the barcode label editor offers. "barcode" renders as a Code
// 128 graphic; "staticText" prints the field's own name as literal text.
export const BARCODE_LABEL_SOURCES = [
  "barcode",
  "licensePlate",
  "brand",
  "model",
  "vehicleFull",
  "vehicleType",
  "chassisNumber",
  "apkDate",
  "company",
  "fleetNumber",
  "staticText",
] as const;

export function resolveBarcodeLabelSource(
  source: string,
  vehicle: {
    id: number; barcode?: string | null; licensePlate: string; brand: string;
    model: string; vehicleType?: string | null; chassisNumber?: string | null;
    apkDate?: string | null; company?: string | null;
  },
  fieldName: string,
): string {
  switch (source) {
    case "licensePlate": return vehicle.licensePlate;
    case "brand": return vehicle.brand;
    case "model": return vehicle.model;
    case "vehicleFull": return `${vehicle.brand} ${vehicle.model}`;
    case "vehicleType": return vehicle.vehicleType ?? "";
    case "chassisNumber": return vehicle.chassisNumber ?? "";
    case "apkDate": return vehicle.apkDate ?? "";
    case "company": return vehicle.company ?? "";
    case "fleetNumber": return String(vehicle.id);
    case "staticText": return fieldName;
    default: return "";
  }
}
```

- [ ] **Step 2: Schema table + migrations**

`shared/schema.ts` after `transportReportTemplateBackgrounds`:

```typescript
// Barcode label templates — same clone-per-domain template-editor pattern as
// transportReportTemplates above (see that comment), adapted for key-label
// stickers: a small mm-sized canvas instead of A4, no background library, and
// fields may include a positioned Code 128 barcode. x/y in fields are mm.
export const barcodeLabelTemplates = pgTable("barcode_label_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  isDefault: boolean("is_default").default(false),
  labelWidthMm: integer("label_width_mm").default(62).notNull(),
  labelHeightMm: integer("label_height_mm").default(29).notNull(),
  fields: jsonb("fields").default([]),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertBarcodeLabelTemplateSchema = createInsertSchema(barcodeLabelTemplates)
  .omit({ id: true });

export type BarcodeLabelTemplate = typeof barcodeLabelTemplates.$inferSelect;
export type InsertBarcodeLabelTemplate = z.infer<typeof insertBarcodeLabelTemplateSchema>;
```

`startup-migration.js`:

```javascript
  // Barcode label templates table (Documents page barcode-labels tab)
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS barcode_label_templates (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        is_default BOOLEAN DEFAULT false,
        label_width_mm INTEGER NOT NULL DEFAULT 62,
        label_height_mm INTEGER NOT NULL DEFAULT 29,
        fields JSONB DEFAULT '[]',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ barcode_label_templates table ensured');
  } catch (error) {
    console.error('⚠️ barcode_label_templates creation failed:', error.message);
  }
```

Run `npm run db:push` for dev.

- [ ] **Step 3: Storage CRUD (mirror the transport template methods)**

Grep `getTransportReportTemplates` in `server/storage.ts` / `server/database-storage.ts` and mirror every non-background method 1:1 for barcode label templates:

```typescript
  getBarcodeLabelTemplates(): Promise<BarcodeLabelTemplate[]>;
  getBarcodeLabelTemplate(id: number): Promise<BarcodeLabelTemplate | undefined>;
  getDefaultBarcodeLabelTemplate(): Promise<BarcodeLabelTemplate | undefined>;
  createBarcodeLabelTemplate(template: InsertBarcodeLabelTemplate): Promise<BarcodeLabelTemplate>;
  updateBarcodeLabelTemplate(id: number, template: Partial<InsertBarcodeLabelTemplate>): Promise<BarcodeLabelTemplate | undefined>;
  deleteBarcodeLabelTemplate(id: number): Promise<boolean>;
```

Copy the bodies of the corresponding transport-template implementations in each class and swap table/type names (including the "setting isDefault clears other defaults" behavior if the transport implementation has it — check `updateTransportReportTemplate`; replicate exactly).

- [ ] **Step 4: API endpoints (mirror transport routes minus backgrounds/preview)**

In `server/routes.ts` next to the transport-report-template routes (~line 12580), clone `GET list / GET default / GET :id / POST / PATCH :id / DELETE :id` handlers, swapping storage calls and paths to `/api/barcode-label-templates`. Two deliberate differences from the transport versions:
- The three GET endpoints use `requireAuth` WITHOUT `hasPermission(MANAGE_PDF_TEMPLATES)` — staff print pickers need to read templates.
- POST/PATCH/DELETE keep `requireAuth + hasPermission(UserPermission.MANAGE_PDF_TEMPLATES)`.
Validate bodies with `insertBarcodeLabelTemplateSchema` (`.partial()` for PATCH) exactly the way the transport POST/PATCH handlers validate theirs (copy their validation style verbatim).

- [ ] **Step 5: Clone and adapt the editor**

```bash
cp client/src/pages/documents/transport-report-template-editor.tsx client/src/pages/documents/barcode-label-template-editor.tsx
```

Adapt the clone (component renamed `BarcodeLabelTemplateEditor`, props identical `{ onClose?: () => void }`):

1. **Endpoints:** replace every `/api/transport-report-templates` string with `/api/barcode-label-templates`; delete the background-upload, background-library, and PDF-preview sections (state, mutations, JSX, and dropzone imports that become unused).
2. **Data sources:** replace `DATA_SOURCE_KEYS` with `BARCODE_LABEL_SOURCES` imported from `@shared/barcode`. Source display names come from new `documents:barcodeLabelEditor.sources.*` locale keys (Step 8).
3. **Canvas:** the transport editor renders a fixed A4-proportioned canvas. Replace its canvas dimension constants with mm-driven ones:

```typescript
const MM_TO_PX = 8; // editor scale: 8px per mm at zoom 1 (62mm label → 496px wide)
const canvasWidth = (currentTemplate?.labelWidthMm ?? 62) * MM_TO_PX * zoom;
const canvasHeight = (currentTemplate?.labelHeightMm ?? 29) * MM_TO_PX * zoom;
```

Field drag math: wherever the clone converts mouse px → stored coordinates, divide by `MM_TO_PX * zoom` so stored x/y are mm. Add two number Inputs (width/height mm, range 20–210 / 10–297) in the template settings area that PATCH `labelWidthMm`/`labelHeightMm`.
4. **Barcode field rendering on the canvas:** where the clone renders each positioned field as absolutely-positioned text, special-case `field.source === "barcode"`:

```tsx
{field.source === "barcode" ? (
  <div style={{ height: (field.barcodeHeightMm ?? 10) * MM_TO_PX * zoom }}>
    <BarcodeSvg value="VEH-000123" height={(field.barcodeHeightMm ?? 10) * MM_TO_PX * zoom} className="h-full w-auto" />
  </div>
) : (
  /* existing text rendering, with sample text from resolveBarcodeLabelSource(field.source, SAMPLE_VEHICLE, field.name) */
)}
```

with `const SAMPLE_VEHICLE = { id: 123, barcode: "VEH-000123", licensePlate: "12-XT-102", brand: "Mercedes-Benz", model: "C-Klasse", vehicleType: "Hatchback", chassisNumber: "WDB12345", apkDate: "2027-01-15", company: "Auto Lease LAM" };`
In the field-properties panel, when the selected field's source is `barcode`, show a `barcodeHeightMm` number Input (default 10) instead of the fontSize input.
5. **New-template defaults:** the create-template mutation body gains `labelWidthMm: 62, labelHeightMm: 29` and a starter fields array: one barcode field centered (`{ id: crypto.randomUUID(), name: "Barcode", x: 4, y: 4, fontSize: 10, isBold: false, source: "barcode", textAlign: "center", barcodeHeightMm: 12 }`) and one licensePlate field under it (`x: 4, y: 20, fontSize: 10, isBold: true, source: "licensePlate", textAlign: "center"`).
6. Everything else in the clone (undo/redo, multi-select, alignment tools, grid, zoom, presets, save/delete mutations, ConfirmDialog) stays as-is — that is the point of cloning.

- [ ] **Step 6: Template-driven printing in `key-label-print.ts`**

Extend `printKeyLabels` to accept the full template row and render positioned fields; keep the Task 7 layout as the no-template fallback:

```typescript
import JsBarcode from "jsbarcode";
import { BarcodeLabelTemplate } from "@shared/schema";
import { BarcodeLabelField, resolveBarcodeLabelSource } from "@shared/barcode";

interface LabelVehicle {
  id: number;
  barcode: string | null;
  licensePlate: string;
  brand: string;
  model: string;
  vehicleType?: string | null;
  chassisNumber?: string | null;
  apkDate?: string | null;
  company?: string | null;
}

export function printKeyLabels(vehicles: LabelVehicle[], template?: BarcodeLabelTemplate): void {
  const printable = vehicles.filter((v): v is LabelVehicle & { barcode: string } => !!v.barcode);
  if (printable.length === 0) return;

  const widthMm = template?.labelWidthMm ?? 62;
  const heightMm = template?.labelHeightMm ?? 29;

  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(frame);

  const doc = frame.contentDocument!;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; }
    .label {
      width: ${widthMm}mm; height: ${heightMm}mm; position: relative;
      display: inline-block; overflow: hidden;
      page-break-inside: avoid; break-inside: avoid;
      border: 0.2mm dashed #bbb; margin: 1mm;
    }
    .field { position: absolute; white-space: nowrap; line-height: 1; }
    @media print { .label { border: none; } }
  </style></head><body></body></html>`);
  doc.close();

  const fields: BarcodeLabelField[] = template
    ? ((template.fields as BarcodeLabelField[]) ?? [])
    : [
        { id: "b", name: "Barcode", x: 2, y: 3, fontSize: 10, isBold: false, source: "barcode", textAlign: "left", barcodeHeightMm: 12 },
        { id: "p", name: "Kenteken", x: 2, y: 20, fontSize: 10, isBold: true, source: "licensePlate", textAlign: "left" },
        { id: "m", name: "Merk/model", x: 2, y: 25, fontSize: 8, isBold: false, source: "vehicleFull", textAlign: "left" },
      ];

  for (const vehicle of printable) {
    const label = doc.createElement("div");
    label.className = "label";
    for (const field of fields) {
      const holder = doc.createElement("div");
      holder.className = "field";
      holder.style.left = `${field.x}mm`;
      holder.style.top = `${field.y}mm`;
      if (field.source === "barcode") {
        const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
        holder.appendChild(svg);
        holder.style.height = `${field.barcodeHeightMm ?? 10}mm`;
        JsBarcode(svg, vehicle.barcode, {
          format: "CODE128",
          displayValue: true,
          fontSize: 10,
          height: (field.barcodeHeightMm ?? 10) * 3, // px; svg is scaled by mm height below
          margin: 4,
          background: "transparent",
        });
        svg.style.height = `${field.barcodeHeightMm ?? 10}mm`;
        svg.style.width = "auto";
      } else {
        holder.textContent = resolveBarcodeLabelSource(field.source, vehicle, field.name);
        holder.style.fontSize = `${field.fontSize}pt`;
        holder.style.fontWeight = field.isBold ? "bold" : "normal";
        holder.style.textAlign = field.textAlign;
      }
      label.appendChild(holder);
    }
    doc.body.appendChild(label);
  }

  setTimeout(() => {
    frame.contentWindow!.focus();
    frame.contentWindow!.print();
    setTimeout(() => frame.remove(), 2000);
  }, 250);
}
```

(This replaces Task 7's implementation body; Task 7's call sites keep working since the second parameter is optional.)

- [ ] **Step 7: Documents page tab**

In `client/src/pages/documents/index.tsx`, clone the transport-templates tab wiring:
- `TabsList` `grid-cols-4` → `grid-cols-5`; add `<TabsTrigger value="barcode-labels" data-testid="tab-barcode-labels">{t('indexPage.tabBarcodeLabels')}</TabsTrigger>`.
- Clone the transport TabsContent block (~lines 987–1061: Card + "open editor" button + full-screen Dialog hosting the editor) for `value="barcode-labels"`, switching to `BarcodeLabelTemplateEditor`, new state `barcodeLabelEditorDialogOpen`, and the new locale keys.
- Import: `import BarcodeLabelTemplateEditor from "./barcode-label-template-editor";`

- [ ] **Step 8: Locale keys**

`documents.json` (nl) — add to `indexPage`: `"tabBarcodeLabels": "Barcodelabels"`, `"barcodeLabelEditorTitle": "Barcodelabel-sjablonen"`, `"barcodeLabelEditorDescription": "Ontwerp sleutellabel-stickers met barcode en voertuiggegevens"`, `"openBarcodeLabelEditorIntro": "Open de editor om labelsjablonen te maken en te bewerken."`, `"openBarcodeLabelEditorButton": "Editor openen"`. Add a `barcodeLabelEditor` section with `sources` display names: `{ "barcode": "Barcode", "licensePlate": "Kenteken", "brand": "Merk", "model": "Model", "vehicleFull": "Merk en model", "vehicleType": "Voertuigtype", "chassisNumber": "Chassisnummer", "apkDate": "APK-datum", "company": "Bedrijf", "fleetNumber": "Vlootnummer", "staticText": "Vaste tekst" }` plus `"labelWidthLabel": "Breedte (mm)"`, `"labelHeightLabel": "Hoogte (mm)"`, `"barcodeHeightLabel": "Barcodehoogte (mm)"`. Reuse the transport editor's other keys where the clone already references `documents:` keys that exist (the clone inherits them; only add keys the adaptation introduces). English mirror in `en/documents.json`.
`barcodes.json` (nl + en) — add: `"templatePicker": { "label": "Labelsjabloon", "defaultOption": "Standaardindeling" }` (en: "Label template" / "Default layout").

- [ ] **Step 9: Template pickers at print points**

`vehicle-barcode-dialog.tsx`: `useQuery<BarcodeLabelTemplate[]>({ queryKey: ["/api/barcode-label-templates"] })`, Select above the print button (options: default layout + each template; preselect the row with `isDefault`), pass the chosen template to `printKeyLabels([vehicle], chosen)`.
`barcode-book.tsx`: add the same Select plus a "print as stickers" Button in the toolbar calling `printKeyLabels(printSet, chosen)`; the book's full-page print button stays unchanged.

- [ ] **Step 10: Typecheck + browser verification**

Run: `npm run check` → no new errors.
Preview: Documents → Barcodelabels tab → open editor → create template → canvas is label-sized (62×29 default), starter barcode + plate fields present → drag fields, resize label to 89×36 → save. Undo/redo and alignment tools work (inherited from clone). Vehicle details → barcode dialog → picker shows the template → print → print preview shows fields at their positions, barcode scannably large. Barcode book → sticker print with the template. Editor endpoints: POST/PATCH/DELETE 403 for non-admin without MANAGE_PDF_TEMPLATES; GET list still 200 for normal authed staff.

- [ ] **Step 11: Commit**

```bash
git add shared/schema.ts shared/barcode.ts startup-migration.js server/storage.ts server/database-storage.ts server/routes.ts client/src/pages/documents/barcode-label-template-editor.tsx client/src/pages/documents/index.tsx client/src/components/barcodes client/src/pages/vehicles/barcode-book.tsx client/src/locales/nl/barcodes.json client/src/locales/en/barcodes.json client/src/locales/nl/documents.json client/src/locales/en/documents.json
git commit -m "feat: barcode label template editor cloned from transport template editor

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: Final verification + implementation report

**Files:** none (verification only; fix regressions in place if found)

- [ ] **Step 1: Full typecheck**

Run: `npm run check`. Zero new errors versus pre-implementation baseline.

- [ ] **Step 2: End-to-end browser walkthrough (preview)**

1. Create a new vehicle via the UI → open it → barcode dialog shows `VEH-<its id>`.
2. `/scan`: scan (type+Enter) that barcode → vehicle opens with correct status.
3. Scan the barcode of a vehicle with an active (picked_up) reservation → active reservation card with customer + Open Reservation working.
4. Scan a vehicle with only a future reservation → upcoming card shown.
5. Scan an unknown code → clear error, input refocused.
6. Scan a license plate → resolves.
7. Scan `RES-<id>` of an existing reservation → reservation card.
8. Vehicle details → print key label → print preview correct.
9. Barcode book → print all + print selection → print preview correct, no clipped entries.
9b. Documents → Barcodelabels: template CRUD, live preview, default template applied at vehicle-dialog and book sticker printing.
10. Camera dialog opens/closes cleanly (device test for actual decode noted as manual follow-up if no camera on dev machine).
11. Mobile viewport (`resize_window` mobile preset): `/scan` and barcode book usable.
12. Regression sweep: vehicles list, vehicle dialog tabs, reservations calendar, expenses page still load without console errors.

- [ ] **Step 3: Permission spot-check**

As a non-admin user without `MANAGE_VEHICLES` (or via API): `POST /api/vehicles/:id/barcode/regenerate` → 403. `GET /api/barcodes/:code` unauthenticated → 401.

- [ ] **Step 4: Write the implementation report**

Deliver in chat (not a file): what was added, DB changes (vehicles.barcode + unique index + backfill via startup-migration.js and db:push), files changed, how generation/scanning/book work, deps added (jsbarcode, html5-qrcode), migration instructions for production (startup-migration.js runs at deploy), manual config (none), test results, and remaining recommendations (e.g., real hardware-scanner test, physical print scan test, label-printer stock calibration).

- [ ] **Step 5: Final commit if fixes were made, then push only on user request**
