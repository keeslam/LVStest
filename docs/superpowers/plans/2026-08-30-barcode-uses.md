# Barcode System Extensions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Extend the existing barcode system with nine operational uses: pickup/return handover from scan, expense capture from scan, document upload from scan, maintenance toggle from scan, transport check-in/out from scan, spare-key barcodes, a barcode on printed rental contracts, a scan-event history, and a key-cabinet audit mode.

**Architecture:** Everything builds on the existing scan stack: `GET /api/barcodes/:code` (server/routes.ts ~1425), `ScanPanel` (client/src/components/barcodes/scan-panel.tsx), `shared/barcode.ts`, and the printing helpers in client/src/components/barcodes/key-label-print.ts. Existing dialogs are reused, never rebuilt: `PickupDialog`/`ReturnDialog` (client/src/components/reservations/pickup-return-dialogs.tsx, both take a full `reservation: Reservation` object), `ExpenseAddDialog` (client/src/components/expenses/expense-add-dialog.tsx, takes `vehicleId` + `children` trigger), `InlineDocumentUpload` (client/src/components/documents/inline-document-upload.tsx, takes `vehicleId`, `reservationId?`, `children`). Server barcode PNGs for PDFs come from `jsbarcode` + the already-installed `canvas` package.

**Tech Stack:** existing app stack; no new dependencies.

**Spec:** The numbered suggestion list approved by the user on 2026-08-30 ("make them al"), with these controller rulings: return-kiosk (#8) is folded into #1 (return-start from scan IS the kiosk core); APK workflow (#10) = maintenance-status toggle on the scan card; scan history (#9) = event log + recent-scans list on the scan page.

## Global Constraints

- Windows dev machine, Git Bash for the Bash tool, NO python (use node). NEVER start/stop the dev server or run browser tests — the controller does browser verification (Ruling R4 from the previous plan holds).
- tsc gate: repo has ~369 pre-existing errors. Per task: capture `npm run check 2>&1 | grep -cE "error TS"` before/after and grep the touched files — no NEW error lines attributable to the change.
- Every user-visible string via i18next, BOTH nl and en (`barcodes` namespace unless stated). Dutch primary.
- All new endpoints: `requireAuth` at minimum; mutations follow the permission of the underlying resource.
- Scan actions must never destroy data on scan alone; every mutation goes through an existing dialog or an explicit button press.
- Commit per task, conventional message, ending with blank line + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- The scan lookup response is PII-projected (reservations → {id,status,startDate,endDate,customer:{name}}). Never widen it; fetch full objects client-side via existing per-id endpoints when a dialog needs them.

---

### Task 1: Scan-card actions — pickup/return handover, expense, document upload, maintenance toggle

**Files:**
- Modify: `client/src/components/barcodes/scan-panel.tsx`
- Modify: `client/src/locales/nl/barcodes.json`, `client/src/locales/en/barcodes.json`
- Modify (server): `server/routes.ts` — extend the vehicle branch of `GET /api/barcodes/:code` response with `maintenanceStatus: vehicle.maintenanceStatus` (already on the vehicle object — nothing to add server-side if the full vehicle is returned; VERIFY the response returns the full vehicle and skip the server change if so).

**Interfaces:**
- Consumes: `PickupDialog`/`ReturnDialog` from `@/components/reservations/pickup-return-dialogs` — props `{ open, onOpenChange, reservation: Reservation, onSuccess }`; full reservation fetched on demand from `GET /api/reservations/:id` (existing, returns populated reservation). `ExpenseAddDialog` (`vehicleId`, `children`). `InlineDocumentUpload` (`vehicleId`, `reservationId?`, `children`). `apiRequest` for `PATCH /api/vehicles/:id` (existing, `MANAGE_VEHICLES`) to toggle `maintenanceStatus`.
- Produces: extended vehicle result card in ScanPanel. New locale keys under `scanPage.actions.*`.

- [ ] **Step 1: Extend ScanPanel state + handlers**

Add to `ScanPanel`:

```tsx
const [handoverReservation, setHandoverReservation] = useState<Reservation | null>(null);
const [pickupOpen, setPickupOpen] = useState(false);
const [returnOpen, setReturnOpen] = useState(false);

// The scan card only holds the PII-projected reservation; the handover
// dialogs need the full row, so fetch it when the user asks for one.
const startHandover = async (reservationId: number, kind: "pickup" | "return") => {
  try {
    const response = await fetch(`/api/reservations/${reservationId}`, { credentials: "include" });
    if (!response.ok) throw new Error();
    const full = await response.json();
    setHandoverReservation(full);
    if (kind === "pickup") setPickupOpen(true); else setReturnOpen(true);
  } catch {
    setError(t("scanPage.lookupError"));
  }
};

const maintenanceMutation = useMutation({
  mutationFn: async (vars: { vehicleId: number; status: "ok" | "in_service" }) => {
    const response = await apiRequest("PATCH", `/api/vehicles/${vars.vehicleId}`, { maintenanceStatus: vars.status });
    if (!response.ok) throw new Error();
    return response.json();
  },
  onSuccess: (_data, vars) => {
    invalidateByPrefix("/api/vehicles");
    toast({ title: t(vars.status === "in_service" ? "scanPage.actions.maintenanceStarted" : "scanPage.actions.maintenanceEnded") });
    // refresh the card
    if (result?.type === "vehicle" && result.vehicle.barcode) lookup(result.vehicle.barcode);
  },
  onError: () => toast({ title: t("scanPage.lookupError"), variant: "destructive" }),
});
```

Imports to add: `useMutation` from `@tanstack/react-query`; `apiRequest, invalidateByPrefix` from `@/lib/queryClient`; `useToast` from `@/hooks/use-toast`; `Reservation` type; the three dialog components; extra lucide icons (`LogOut`, `LogIn`, `Receipt`, `Upload`, `Wrench`).

Check the exact `apiRequest` signature in `@/lib/queryClient` (grep) — it may be `apiRequest(method, url, body?)`; adapt.

- [ ] **Step 2: Extend the vehicle-card action row**

In the vehicle result card's button row, after "Voertuig openen":

```tsx
{result.activeReservation?.status === "picked_up" && (
  <Button variant="default" onClick={() => startHandover(result.activeReservation!.id, "return")} data-testid="button-scan-return">
    <LogIn className="h-4 w-4 mr-2" />
    {t("scanPage.actions.startReturn")}
  </Button>
)}
{result.activeReservation && result.activeReservation.status !== "picked_up" && (
  <Button variant="default" onClick={() => startHandover(result.activeReservation!.id, "pickup")} data-testid="button-scan-pickup">
    <LogOut className="h-4 w-4 mr-2" />
    {t("scanPage.actions.startPickup")}
  </Button>
)}
{!result.activeReservation && result.upcomingReservation && (
  <Button variant="default" onClick={() => startHandover(result.upcomingReservation!.id, "pickup")} data-testid="button-scan-pickup">
    <LogOut className="h-4 w-4 mr-2" />
    {t("scanPage.actions.startPickup")}
  </Button>
)}
<ExpenseAddDialog vehicleId={result.vehicle.id}>
  <Button variant="outline" data-testid="button-scan-expense">
    <Receipt className="h-4 w-4 mr-2" />
    {t("scanPage.actions.addExpense")}
  </Button>
</ExpenseAddDialog>
<InlineDocumentUpload vehicleId={result.vehicle.id} reservationId={result.activeReservation?.id}>
  <Button variant="outline" data-testid="button-scan-upload">
    <Upload className="h-4 w-4 mr-2" />
    {t("scanPage.actions.uploadDocument")}
  </Button>
</InlineDocumentUpload>
{(result.vehicle.maintenanceStatus === "ok" || !result.vehicle.maintenanceStatus) ? (
  <Button variant="outline" onClick={() => maintenanceMutation.mutate({ vehicleId: result.vehicle.id, status: "in_service" })} disabled={maintenanceMutation.isPending} data-testid="button-scan-maintenance-start">
    <Wrench className="h-4 w-4 mr-2" />
    {t("scanPage.actions.startMaintenance")}
  </Button>
) : (
  <Button variant="outline" onClick={() => maintenanceMutation.mutate({ vehicleId: result.vehicle.id, status: "ok" })} disabled={maintenanceMutation.isPending} data-testid="button-scan-maintenance-end">
    <Wrench className="h-4 w-4 mr-2" />
    {t("scanPage.actions.endMaintenance")}
  </Button>
)}
```

VERIFY first that `ExpenseAddDialog` and `InlineDocumentUpload` accept a `children` trigger (both do per their interfaces; ExpenseAddDialog renders a default button when no children — grep to confirm children path exists; if ExpenseAddDialog has no children prop, wrap: keep its default trigger button styling or extend the component minimally).

Mount at panel bottom (next to CameraScannerDialog):

```tsx
{handoverReservation && (
  <>
    <PickupDialog open={pickupOpen} onOpenChange={setPickupOpen} reservation={handoverReservation}
      onSuccess={() => { setPickupOpen(false); if (result?.type === "vehicle" && result.vehicle.barcode) lookup(result.vehicle.barcode); }} />
    <ReturnDialog open={returnOpen} onOpenChange={setReturnOpen} reservation={handoverReservation}
      onSuccess={() => { setReturnOpen(false); if (result?.type === "vehicle" && result.vehicle.barcode) lookup(result.vehicle.barcode); }} />
  </>
)}
```

Check PickupDialog/ReturnDialog's actual `onSuccess` prop name/shape (grep the interface at pickup-return-dialogs.tsx:20-27, 1189-1196) and adapt.

- [ ] **Step 3: Locale keys (both languages)**

`scanPage.actions` in nl: `{ "startPickup": "Ophalen starten", "startReturn": "Inleveren starten", "addExpense": "Kosten registreren", "uploadDocument": "Document uploaden", "startMaintenance": "Naar onderhoud", "endMaintenance": "Terug uit onderhoud", "maintenanceStarted": "Voertuig staat nu in onderhoud", "maintenanceEnded": "Voertuig is terug uit onderhoud" }`; en mirror: Start pickup / Start return / Log expense / Upload document / Send to maintenance / Back from maintenance / Vehicle is now in maintenance / Vehicle is back from maintenance.

- [ ] **Step 4: tsc gate, commit** — `feat: pickup/return, expense, document and maintenance actions on barcode scan`

---

### Task 2: Transport check-in/out from scan

**Files:**
- Modify: `server/routes.ts` (vehicle branch of `GET /api/barcodes/:code`)
- Modify: `client/src/components/barcodes/scan-panel.tsx`
- Modify: both `barcodes.json` locale files

**Interfaces:**
- Consumes: `vehicle_transports` table (status: `'scheduled' | 'in_progress' | 'completed' | 'cancelled'`, shared/schema.ts ~1282); existing `PATCH /api/transports/:id` (routes.ts ~12463, accepts partial body incl. `status` — VERIFY by reading the handler; if it validates via a schema, confirm `status` passes). Storage: find the method that lists transports (grep `getTransports\b|getAllTransports` in server/storage.ts) to filter by vehicleId, or query the table directly in the route via db — follow whichever pattern the lookup route file already uses (it uses `storage.*`; add `storage.getActiveTransportByVehicle(vehicleId)` to IStorage + DatabaseStorage returning the first transport with `vehicleId` match, `deletedAt` null if the column exists, and status `scheduled` or `in_progress`, ordered by scheduledDate; MemStorage mirror).
- Produces: lookup response gains `activeTransport: { id, status, transportType, scheduledDate, originCity, destinationCity } | null` (projection — no customer/driver PII needed). ScanPanel shows a transport block with an advance button.

- [ ] **Step 1: Storage method** (both DatabaseStorage + MemStorage + IStorage) as described; check exact column names via schema (~line 1248-1300): `transportType`, `scheduledDate`, `originCity`, `destinationCity` — grep to confirm, adapt.
- [ ] **Step 2: Lookup route** — after computing reservations, `const transport = await storage.getActiveTransportByVehicle(vehicle.id);` and include the projection in the response.
- [ ] **Step 3: ScanPanel transport block** — under the reservation card:

```tsx
{result.activeTransport && (
  <div className="border rounded-md p-4 space-y-2">
    <h3 className="text-sm font-medium text-muted-foreground">{t("scanPage.transport.heading")}</h3>
    <div className="flex items-center gap-2 text-sm">
      <Truck className="h-4 w-4 text-primary" />
      <span>{result.activeTransport.originCity || "?"} → {result.activeTransport.destinationCity || "?"}</span>
      <Badge variant="outline">{t(`scanPage.transport.status.${result.activeTransport.status}`, { defaultValue: result.activeTransport.status })}</Badge>
    </div>
    <Button size="sm" onClick={() => transportMutation.mutate({ id: result.activeTransport!.id, status: result.activeTransport!.status === "scheduled" ? "in_progress" : "completed" })} disabled={transportMutation.isPending} data-testid="button-scan-transport-advance">
      {result.activeTransport.status === "scheduled" ? t("scanPage.transport.start") : t("scanPage.transport.complete")}
    </Button>
  </div>
)}
```

with `transportMutation` PATCHing `/api/transports/:id` `{ status }`, on success toast + re-lookup (same pattern as maintenanceMutation). Type: extend `LookupResult`'s vehicle variant with `activeTransport`.
- [ ] **Step 4: Locale** — nl `scanPage.transport`: `{ "heading": "Actief transport", "start": "Transport starten", "complete": "Transport afronden", "started": "Transport gestart", "completed": "Transport afgerond", "status": { "scheduled": "Gepland", "in_progress": "Onderweg" } }`; en mirror.
- [ ] **Step 5: tsc gate, commit** — `feat: transport check-in/out from barcode scan`. (Controller restarts server + verifies.)

---

### Task 3: Spare-key barcodes (VEH-000123-S)

**Files:**
- Modify: `shared/barcode.ts`, `server/routes.ts` (lookup), `client/src/components/barcodes/scan-panel.tsx` (badge), `client/src/components/barcodes/key-label-print.ts` (barcode override), `client/src/components/barcodes/vehicle-barcode-dialog.tsx` (spare label print button), locale files.

**Interfaces:**
- Produces: `formatSpareKeyBarcode(vehicleId: number): string` → `VEH-000123-S`; `parseBarcode` returns `{ kind: "vehicle"; vehicleId: number; spareKey?: true }` for `-S` codes (regex: `/^VEH-(\d{6,})(?:-R(\d+))?(?:-S)?$/` — S suffix after optional revision). Lookup: when `parsed.spareKey`, resolve via `storage.getVehicle(parsed.vehicleId)` and only accept if `vehicle.barcode` starts with `VEH-` + padded id (guards stale ids), respond with extra field `scannedSpareKey: true`. ScanPanel: amber badge `scanPage.spareKeyBadge` on the card title row when set. `printKeyLabels`: `LabelVehicle` gains optional `barcodeOverride?: string` used instead of `barcode` for rendering (both fallback and template paths). Barcode dialog: second outline button "Reservesleutel-label" calling `printKeyLabels([{ ...vehicle, barcodeOverride: formatSpareKeyBarcode(vehicle.id) }], selectedTemplate)`.
- [ ] Steps: implement, locale (`scanPage.spareKeyBadge` nl "Reservesleutel" / en "Spare key"; `label.printSpareKeyLabel` nl "Reservesleutel-label afdrukken" / en "Print spare key label"), tsc gate, commit — `feat: spare key barcodes with -S suffix`.

---

### Task 4: Barcode on printed rental contracts

**Files:**
- Create: `server/utils/barcode-png.ts`
- Modify: `server/utils/pdf-generator.ts` (`generateRentalContract` ~line 521 AND `generateRentalContractFromTemplate` ~line 53)

**Interfaces:**
- Produces:

```typescript
// server/utils/barcode-png.ts
import JsBarcode from "jsbarcode";
import { createCanvas } from "canvas";

// Code 128 PNG for embedding into pdf-lib documents (contracts etc.).
export function renderBarcodePng(value: string): Buffer {
  const canvas = createCanvas(1, 1);
  JsBarcode(canvas as unknown as HTMLCanvasElement, value, {
    format: "CODE128",
    displayValue: true,
    fontSize: 14,
    height: 50,
    margin: 8,
    background: "#ffffff",
  });
  return (canvas as any).toBuffer("image/png");
}
```

(jsbarcode is currently a client dep in package.json dependencies — it is in `dependencies`, not devDependencies, so the server build can import it; verify with `node -e "require('jsbarcode')"`. If the esbuild server bundle externalizes packages (build script uses `--packages=external`), a plain import works.)
- In both contract generators: after the PDF page exists, embed `renderBarcodePng(formatReservationBarcode(reservation.id))` (import from `../../shared/barcode`) top-right of page 1: `const png = await pdfDoc.embedPng(renderBarcodePng(...)); page.drawImage(png, { x: pageWidth - pngDims.width*0.5 - 24, y: pageHeight - pngDims.height*0.5 - 20, width: pngDims.width*0.5, height: pngDims.height*0.5 });` — read each generator to find its page/width variables and a spot after page creation; wrap the whole embed in try/catch so a barcode failure never blocks contract generation (log a warning).
- [ ] Steps: helper, wire both generators, `node -e` smoke test of renderBarcodePng writing a PNG file and checking its first bytes are the PNG magic, tsc gate, commit — `feat: RES barcode printed on rental contracts`.

---

### Task 5: Scan-event history

**Files:**
- Modify: `shared/schema.ts` (new table after `barcodeLabelTemplates`), `startup-migration.js`, `server/storage.ts` + `server/database-storage.ts` (create + list methods), `server/routes.ts` (log in lookup + GET endpoint), `client/src/components/barcodes/scan-panel.tsx` (recent-scans collapsible), locale files.

**Interfaces:**
- Table `scan_events`: `id serial PK, code text NOT NULL, match_type text NOT NULL ('vehicle'|'reservation'|'spare_key'|'none'), vehicle_id integer, reservation_id integer, license_plate text, scanned_by text, created_at timestamp DEFAULT NOW()`. Drizzle export `scanEvents` + `ScanEvent` type + insert schema. Migration: guarded CREATE TABLE (same pattern as barcode_label_templates).
- Storage: `logScanEvent(event: InsertScanEvent): Promise<void>` (insert, swallow errors) and `getRecentScanEvents(limit?: number): Promise<ScanEvent[]>` (order created_at desc, default limit 20). Mirror in MemStorage.
- Route: inside `GET /api/barcodes/:code`, after resolution fire-and-forget `storage.logScanEvent({...})` for all outcomes (404 too, matchType 'none'); `scannedBy` = `(req.user as any)?.username`. New `GET /api/scan-events` (requireAuth) → `storage.getRecentScanEvents(20)`.
- ScanPanel: below the camera dialog, a collapsible (use existing `Collapsible` ui component if present — grep `components/ui/collapsible`; else a simple useState toggle button) "Recente scans" list fetching `useQuery<ScanEvent[]>({ queryKey: ["/api/scan-events"], enabled: active })`, rows: time (HH:mm via formatDate or date-fns format), code, plate (when set), scanner name; invalidate `"/api/scan-events"` after each lookup.
- Locale: `scanPage.history`: nl `{ "title": "Recente scans", "empty": "Nog geen scans", "noMatch": "geen match" }`; en mirror.
- [ ] Steps: schema+migration (+ `npm run db:push` or node fallback like earlier tasks), storage, route, panel UI, tsc gate, commit — `feat: scan event history with recent-scans list`.

---

### Task 6: Key-cabinet audit

**Files:**
- Create: `client/src/components/barcodes/key-audit-dialog.tsx`
- Modify: `client/src/pages/vehicles/index.tsx` (toolbar button next to Barcodeboek), locale files.

**Interfaces & behavior:**
- Dialog (`open`,`onOpenChange`), full-height (`max-w-2xl max-h-[90vh] overflow-y-auto`). Uses `useQuery<Vehicle[]>(["/api/vehicles"])`.
- Session state: `scanned: Map<number, { plate: string; spare: boolean }>`; autofocused input; each submit calls the lookup endpoint (logs history for free); on vehicle hit → add to map (toast-free, list updates); unknown → inline error line; input clears + refocuses after every scan.
- Expected-in-cabinet = vehicles where `availabilityStatus !== 'rented'`. Live counters: scanned X / expected Y.
- "Audit afronden" → result view: **Ontbrekende sleutels** (expected but not scanned; plate + brand/model list, red) and **Onverwacht aanwezig** (scanned but availabilityStatus === 'rented', amber). "Opnieuw beginnen" resets.
- Button on vehicles page: `<Button variant="outline" onClick={() => setKeyAuditOpen(true)} data-testid="button-key-audit"><KeyRound .../>{t("barcodes:keyAudit.title")}</Button>` + dialog mount.
- Locale `keyAudit`: nl `{ "title": "Sleutelkast-audit", "description": "Scan alle sleutels in de kast; daarna zie je welke ontbreken.", "scannedCount": "{{scanned}} van {{expected}} verwachte sleutels gescand", "finishButton": "Audit afronden", "resetButton": "Opnieuw beginnen", "missingHeading": "Ontbrekende sleutels", "unexpectedHeading": "Onverwacht aanwezig (voertuig staat als verhuurd)", "noneMissing": "Geen sleutels ontbreken 🎉", "alreadyScanned": "Al gescand", "unknownCode": "Onbekende code: {{code}}" }`; en mirror.
- [ ] Steps: component, wire button, tsc gate, commit — `feat: key cabinet audit via barcode scanning`.

---

### Task 7: Final verification + report

- [ ] `npm run check` — total unchanged vs baseline (~369).
- [ ] Controller browser walkthrough: scan card new buttons (pickup on booked vehicle, return on picked_up, expense dialog opens preselected, upload dialog opens, maintenance toggle round-trips), transport block on a vehicle with scheduled transport (create one if needed via UI), spare-key scan `VEH-000002-S` resolves with badge, spare label print button fires, contract PDF for a reservation contains the barcode (download via existing contract button and inspect), recent-scans list populates, key audit flow with 2 scans.
- [ ] Final whole-branch review (most capable model), ONE fix wave max, then merge/push per user instruction.
