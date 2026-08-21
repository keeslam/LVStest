# DamageCheck Template Editor Uniformity + Default Diagram Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the DamageCheck template editor a per-template background image (with a shared library) like the Contract Templates and Transport Report Templates editors already have, ship a default damage-check template whose PDF output embeds an auto-matched vehicle diagram, remove the legacy 4-slot diagram mechanism that the live pickup/return flow never used, and separate "damage check templates" management (fields/layout/diagram uploads) from "completed damage check documents" (which belong in the Document Library, filtered by license plate).

**Architecture:** DamageCheck's canvas editor (`damage-check-template-editor.tsx`) already has the same zoom/grid/rulers/undo-redo/multi-select/copy-paste chrome as the other two editors — research during planning found this already built. The only missing piece is the background-image-per-template concept (`backgroundPath`/`backgroundPreviewPath` + a `damageCheckTemplateBackgrounds` library table), ported from the `transportReportTemplates`/`transportReportTemplateBackgrounds` implementation (the cleanest of the two existing precedents — no legacy special-casing). The default-template diagram embedding is done by extracting the client's existing `buildDefaultLayout()` (which already places a diagram field) into `shared/damage-check-default-layout.ts` so both the client editor and the server's auto-create/backfill logic in `getDefaultDamageCheckTemplate()` share one implementation. The legacy 4-slot diagram mechanism (`diagramTopView/FrontView/RearView/SideView`) is removed from schema, server routes, the PDF generator, and the legacy structured editor — except the "Diagram Placement" point-pinning feature in that legacy editor, which is repointed to source its image from the make/model-matched `vehicleDiagramTemplates` entry instead of a bespoke upload, so that feature keeps working without the deprecated columns.

**Tech Stack:** React + TypeScript (client), Express + TypeScript (server), Drizzle ORM / Postgres, `drizzle-kit push` for schema sync (this repo has no generated migration files — schema changes are applied by editing `shared/schema.ts` and running `npm run db:push`).

**Spec:** [docs/superpowers/specs/2026-08-21-damagecheck-template-editor-uniform-design.md](../specs/2026-08-21-damagecheck-template-editor-uniform-design.md)

## Global Constraints

- No shared/extracted canvas engine across all 3 template editors — only the DamageCheck editor is touched for the background-image feature; Contract Templates and Transport Report Templates editors are not modified.
- `vehicleDiagramTemplates` (make/model-keyed auto-match, mechanism A) is not modified — it already works correctly end-to-end.
- The legacy 4-slot diagram mechanism (mechanism B: `diagramTopView/FrontView/RearView/SideView`) is removed, but the "Diagram Placement" inspection-point-pinning feature in the legacy structured editor must keep working — repoint it to the matched `vehicleDiagramTemplates` image rather than deleting the feature.
- Follow the existing `transportReportTemplates`/`transportReportTemplateBackgrounds` pattern exactly for naming, route shape, and storage-method shape when adding the damage-check-template background feature — do not invent a different shape.
- The Documents page's "Damage Check" tab becomes a pure templates hub (fields, layout, template library, vehicle diagram library) — it does not list or upload completed damage-check PDFs. Those already live in the `documents` table (`documentType: 'damage_check'`, keyed by `vehicleId`) and are already fully browsable/uploadable from the "Document Library" tab, filtered by vehicle/license plate — no backend change needed for that part, only removing the redundant UI surface.

---

## Task 1: Schema — background columns/table, drop legacy diagram columns, fix type union

**Files:**
- Modify: `shared/schema.ts:1286-1396` (`damageCheckTemplates` table + insert schema/types)

**Interfaces:**
- Produces: `damageCheckTemplates.backgroundPath`, `.backgroundPreviewPath`, `.templatePreviewPath` (all nullable text columns); new table `damageCheckTemplateBackgrounds` with exported `insertDamageCheckTemplateBackgroundSchema`, `type DamageCheckTemplateBackground`, `type InsertDamageCheckTemplateBackground`. `damageCheckTemplates.canvasFields` field-type union now includes `"diagram"`. `diagramTopView/FrontView/RearView/SideView` columns and their `InsertDamageCheckTemplate` fields no longer exist.

- [ ] **Step 1: Edit `damageCheckTemplates` table definition**

In `shared/schema.ts`, inside the `damageCheckTemplates` table (currently lines 1286-1386):

Remove these 6 lines (1298-1302, plus the leading comment):
```ts
  // Vehicle diagram images (paths or URLs)
  diagramTopView: text("diagram_top_view"), // Path to top-view diagram image
  diagramFrontView: text("diagram_front_view"), // Path to front-view diagram image
  diagramRearView: text("diagram_rear_view"), // Path to rear-view diagram image
  diagramSideView: text("diagram_side_view"), // Path to side-view diagram image
```

Replace them with:
```ts
  // Background page image (optional layer behind the canvas fields) — same
  // shape as pdfTemplates/transportReportTemplates.
  backgroundPath: text("background_path"),
  backgroundPreviewPath: text("background_preview_path"),
  templatePreviewPath: text("template_preview_path"),
```

Fix the `canvasFields` type union (currently line 1353):
```ts
    type: "text" | "dynamic" | "inspection" | "checkbox" | "signature" | "line" | "box";
```
becomes:
```ts
    type: "text" | "dynamic" | "inspection" | "checkbox" | "signature" | "line" | "box" | "diagram";
```
and add a `diagramTemplateId` field to that same jsonb array type (it's already written by the client at `damage-check-template-editor.tsx:40` but missing from this annotation) — insert right after the `damageTypes` line inside the `canvasFields` jsonb `$type<>`:
```ts
    damageTypes?: string[]; // for type="inspection"
    diagramTemplateId?: number | null; // for type="diagram"; null = auto-match by vehicle
```

- [ ] **Step 2: Add `damageCheckTemplateBackgrounds` table**

Immediately after the `damageCheckTemplates` table's closing `insertDamageCheckTemplateSchema`/type exports (after current line 1395, before the `vehicleDiagramTemplates` comment on line 1397), insert:

```ts
// Damage Check Template Backgrounds — per-template background image library,
// same shape as templateBackgrounds / transportReportTemplateBackgrounds.
export const damageCheckTemplateBackgrounds = pgTable("damage_check_template_backgrounds", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").notNull().references(() => damageCheckTemplates.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  backgroundPath: text("background_path").notNull(),
  previewPath: text("preview_path").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDamageCheckTemplateBackgroundSchema = createInsertSchema(damageCheckTemplateBackgrounds)
  .omit({ id: true, createdAt: true });

export type DamageCheckTemplateBackground = typeof damageCheckTemplateBackgrounds.$inferSelect;
export type InsertDamageCheckTemplateBackground = z.infer<typeof insertDamageCheckTemplateBackgroundSchema>;
```

- [ ] **Step 3: Typecheck**

Run: `npm run check`
Expected: no new type errors from `shared/schema.ts`. (Errors will appear in files still referencing `diagramTopView` etc. — that's expected; those are fixed in later tasks. Confirm the *schema file itself* has no errors and note which other files now show errors, for reference in later tasks.)

- [ ] **Step 4: Push schema to the database**

Run: `npm run db:push`
Expected: drizzle-kit reports the 3 new columns + new table being added, and the 4 legacy diagram columns being dropped. It will prompt for confirmation on the destructive column drops (data loss warning) — confirm interactively. This is expected and matches the spec's "Open risk" note: the 2 files under `uploads/` referenced by those columns become orphaned but were already unused by the live flow.

- [ ] **Step 5: Commit**

```bash
git add shared/schema.ts
git commit -m "feat: add damage-check template background library, drop legacy 4-slot diagram columns"
```

---

## Task 2: Extract default canvas layout into a shared module

**Files:**
- Create: `shared/damage-check-default-layout.ts`
- Modify: `client/src/pages/settings/damage-check-template-editor.tsx:1-279`

**Interfaces:**
- Consumes: `DamageCheckFieldsConfig`, `DEFAULT_DAMAGE_CHECK_FIELDS` from `./schema` (already exist).
- Produces: `export type FieldType`, `export interface CanvasField`, `export function buildDefaultDamageCheckCanvasFields(config?: DamageCheckFieldsConfig): CanvasField[]` from `shared/damage-check-default-layout.ts`. Task 3 (server) and this task's client edit both import from here.

- [ ] **Step 1: Create the shared module**

`damage-check-template-editor.tsx` lines 25-279 currently define `FieldType`, `CanvasField`, `newId()`, `defaultFieldFor()`, and `buildDefaultLayout()` — all pure data/TS with no React or DOM dependency, so they move as-is. Create `shared/damage-check-default-layout.ts`:

```ts
import { type DamageCheckFieldsConfig, DEFAULT_DAMAGE_CHECK_FIELDS } from './schema';

export type FieldType = 'text' | 'dynamic' | 'inspection' | 'checkbox' | 'signature' | 'line' | 'box' | 'diagram';

export interface CanvasField {
  id: string;
  type: FieldType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  name: string;
  source?: string;
  fontSize: number;
  isBold: boolean;
  textAlign: 'left' | 'center' | 'right';
  damageTypes?: string[];
  diagramTemplateId?: number | null; // for type=='diagram'; null = auto-match by vehicle
  locked?: boolean;
  page?: number;
}

const newId = () => `f_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

function defaultFieldFor(type: FieldType, x: number, y: number): CanvasField {
  const base = { id: newId(), x, y, fontSize: 11, isBold: false, textAlign: 'left' as const, page: 1 };
  switch (type) {
    case 'text':
      return { ...base, type, name: 'Static text' };
    case 'dynamic':
      return { ...base, type, name: 'License Plate', source: 'licensePlate' };
    case 'inspection':
      return { ...base, type, name: 'Voorruit', damageTypes: ['Kras', 'Deuk', 'Ster'] };
    case 'checkbox':
      return { ...base, type, name: 'Checkbox label' };
    case 'signature':
      return { ...base, type, name: 'Signature', width: 200, height: 40 };
    case 'line':
      return { ...base, type, name: '', width: 200, height: 1 };
    case 'box':
      return { ...base, type, name: '', width: 150, height: 80 };
    case 'diagram':
      return { ...base, type, name: 'Vehicle diagram', width: 400, height: 220, diagramTemplateId: null };
  }
}

// Default starter layout matching the legacy structured form: header text, key
// dynamic fields (license plate, customer, contract #, dates), a vehicle
// diagram (auto-matched by vehicle make/model), an inspection grid and
// signature lines. Editors can move/delete anything — this is just a
// starting point so a blank canvas isn't overwhelming. Shared between the
// client editor's "Insert Default Layout" action and the server's
// auto-created/backfilled default template so both stay in lock-step.
export function buildDefaultDamageCheckCanvasFields(config: DamageCheckFieldsConfig = DEFAULT_DAMAGE_CHECK_FIELDS): CanvasField[] {
  const mk = (
    type: FieldType,
    x: number,
    y: number,
    name: string,
    extra: Partial<CanvasField> = {},
  ): CanvasField => ({
    ...defaultFieldFor(type, x, y),
    name,
    ...extra,
  });
  const out: CanvasField[] = [];

  // Sizing tuned for tablet readability while still fitting on A4.
  // ============ LEFT COLUMN ============
  const LX = 30;                  // left edge for checkbox/label column
  const LABEL_X = LX + 16;        // text label after the checkbox
  const OPT_X = LX + 150;         // option text (e.g. "schoon / vuil")
  const ROW_H = 15;               // distance between checklist rows
  const HEAD_GAP = 22;            // space the heading bar + small gap takes
  const COL_W = 350;              // full width of the left column (heading bar)
  const ROW_FS = 10;
  const HEAD_FS = 13;

  const heading = (title: string, y: number) => {
    out.push(mk('box', LX, y, '', { width: COL_W, height: 18 }));
    out.push(mk('text', LX, y + 3, title, { fontSize: HEAD_FS, isBold: true, textAlign: 'center', width: COL_W } as any));
  };

  const row = (y: number, label: string, options: string) => {
    out.push(mk('checkbox', LX, y, '', { fontSize: ROW_FS }));
    out.push(mk('text', LABEL_X, y, label, { fontSize: ROW_FS }));
    if (options) out.push(mk('text', OPT_X, y, options, { fontSize: ROW_FS }));
  };

  let y = 30;
  const findGroup = (id: 'interior' | 'exterior' | 'delivery') =>
    config.groups.find(g => g.id === id) || { label: id, fields: [] as { label: string; options: string[]; inputType: string }[] };

  const interior = findGroup('interior');
  heading(interior.label, y); y += HEAD_GAP;
  interior.fields.forEach(f => {
    row(y, f.label, f.options.join(' / '));
    y += ROW_H;
  });

  y += 6;
  const exterior = findGroup('exterior');
  heading(exterior.label, y); y += HEAD_GAP;
  exterior.fields.forEach(f => {
    row(y, f.label, f.options.join(' / '));
    y += ROW_H;
  });

  y += 6;
  const delivery = findGroup('delivery');
  heading(delivery.label, y); y += HEAD_GAP;
  delivery.fields.forEach(f => {
    row(y, f.label, '');
    y += ROW_H;
  });

  const leftEndY = y;

  out.push(mk('line', 390, 30, '', { width: 1, height: 560 }));

  // ============ RIGHT COLUMN ============
  const RX = 405;
  const RCOL_W = 160;
  const rheading = (title: string, y: number) => {
    out.push(mk('box', RX, y, '', { width: RCOL_W, height: 18 }));
    out.push(mk('text', RX, y + 3, title, { fontSize: HEAD_FS, isBold: true, textAlign: 'center', width: RCOL_W } as any));
  };

  let ry = 30;
  rheading('Gegevens voertuig', ry); ry += HEAD_GAP;
  const vehicleRow = (label: string, source: string | null, valueText?: string) => {
    out.push(mk('text', RX, ry, label, { fontSize: ROW_FS, isBold: true }));
    if (source) {
      out.push(mk('dynamic', RX + 70, ry, label, { source, fontSize: ROW_FS } as any));
    }
    out.push(mk('line', RX + 70, ry + 12, '', { width: RCOL_W - 70, height: 1 }));
    if (valueText) {
      out.push(mk('text', RX + 70, ry, valueText, { fontSize: ROW_FS }));
    }
    ry += 20;
  };
  vehicleRow('Merk:', 'brand');
  vehicleRow('Type:', 'model');
  vehicleRow('Kenteken:', 'licensePlate');
  vehicleRow('Tellerstand:', 'currentMileage');
  vehicleRow('Tank:', 'fuel');

  ry += 6;
  rheading('Gegevens huurder', ry); ry += HEAD_GAP;
  vehicleRow('Naam:', 'customerName');
  vehicleRow('Contract:', 'contractNumber');
  vehicleRow('Van:', 'startDate');
  vehicleRow('Tot:', 'endDate');

  ry += 6;
  rheading('Opmerkingen', ry); ry += HEAD_GAP;
  out.push(mk('dynamic', RX, ry, 'Inspection Notes', { source: 'notes', fontSize: ROW_FS } as any));
  out.push(mk('line', RX, ry + 12, '', { width: RCOL_W, height: 1 }));
  ry += 17;
  for (let i = 0; i < 4; i++) {
    out.push(mk('line', RX, ry, '', { width: RCOL_W, height: 1 }));
    ry += 17;
  }

  ry += 6;
  rheading('Controle door', ry); ry += HEAD_GAP;
  out.push(mk('text', RX, ry, 'Datum:', { fontSize: ROW_FS, isBold: true }));
  out.push(mk('dynamic', RX + 50, ry, 'Today\'s Date', { source: 'currentDate', fontSize: ROW_FS } as any));
  out.push(mk('line', RX + 50, ry + 12, '', { width: RCOL_W - 50, height: 1 }));
  ry += 22;
  out.push(mk('text', RX, ry, 'NAAM:', { fontSize: ROW_FS, isBold: true }));
  out.push(mk('line', RX + 50, ry + 12, '', { width: RCOL_W - 50, height: 1 }));
  ry += 22;

  ry += 6;
  rheading('Handtekening', ry); ry += HEAD_GAP;
  out.push(mk('text', RX, ry, 'Naam verhuurder', { fontSize: ROW_FS })); ry += 13;
  out.push(mk('line', RX, ry, '', { width: RCOL_W, height: 1 })); ry += 6;
  out.push(mk('text', RX, ry, 'Voor akkoord:', { fontSize: ROW_FS }));
  out.push(mk('signature', RX + 70, ry - 4, 'Verhuurder', { width: RCOL_W - 70, height: 26 } as any));
  ry += 32;
  out.push(mk('text', RX, ry, 'Naam huurder', { fontSize: ROW_FS })); ry += 13;
  out.push(mk('line', RX, ry, '', { width: RCOL_W, height: 1 })); ry += 6;
  out.push(mk('text', RX, ry, 'Voor akkoord:', { fontSize: ROW_FS }));
  out.push(mk('signature', RX + 70, ry - 4, 'Huurder', { width: RCOL_W - 70, height: 26 } as any));
  ry += 32;

  // ============ BOTTOM: VEHICLE DIAGRAM (full width, prominent) ============
  const diagStart = Math.max(leftEndY, ry) + 10;
  out.push(mk('box', 30, diagStart, '', { width: 535, height: 18 }));
  out.push(mk('text', 30, diagStart + 3, 'Voertuig diagram', {
    fontSize: HEAD_FS, isBold: true, textAlign: 'center', width: 535,
  } as any));
  const diagY = diagStart + 22;
  const diagH = Math.max(140, 820 - diagY);
  out.push(mk('diagram', 30, diagY, 'Vehicle diagram', {
    width: 535, height: diagH, diagramTemplateId: null,
  } as any));

  return out;
}
```

- [ ] **Step 2: Point the client editor at the shared module**

In `damage-check-template-editor.tsx`, replace lines 25-279 (from `type FieldType = ...` through the closing `}` of `buildDefaultLayout`) with:

```ts
import {
  type FieldType,
  type CanvasField,
  buildDefaultDamageCheckCanvasFields as buildDefaultLayout,
} from '@shared/damage-check-default-layout';
```

Move this new import line up next to the other `@shared/schema` import (currently line 23: `import { type DamageCheckFieldsConfig, DEFAULT_DAMAGE_CHECK_FIELDS } from '@shared/schema';`), so the top of the file reads:

```ts
import { type DamageCheckFieldsConfig, DEFAULT_DAMAGE_CHECK_FIELDS } from '@shared/schema';
import {
  type FieldType,
  type CanvasField,
  buildDefaultDamageCheckCanvasFields as buildDefaultLayout,
} from '@shared/damage-check-default-layout';
```

Keep everything from the old line 280 onward (`interface HistoryState { fields: CanvasField[]; ts: number; }` and the rest of the component) unchanged — only the type/function *definitions* moved, their usage (`buildDefaultLayout(...)`, `CanvasField[]`, `FieldType`) elsewhere in the file is unaffected because of the `as buildDefaultLayout` import alias.

- [ ] **Step 3: Typecheck**

Run: `npm run check`
Expected: no errors in `damage-check-template-editor.tsx` or the new `shared/damage-check-default-layout.ts`.

- [ ] **Step 4: Manual smoke test**

Start the dev server, open Documents → Damage Check → Edit Layout, create a new template, click "Insert Default Layout" (or equivalent action that calls `buildDefaultLayout`), confirm the layout renders identically to before (checklist columns + diagram box at the bottom).

- [ ] **Step 5: Commit**

```bash
git add shared/damage-check-default-layout.ts client/src/pages/settings/damage-check-template-editor.tsx
git commit -m "refactor: extract damage-check default canvas layout into shared module"
```

---

## Task 3: Storage layer — background CRUD, default-template diagram seeding/backfill, clone fix

**Files:**
- Modify: `server/storage.ts:1-152` (interface)
- Modify: `server/database-storage.ts:1-30` (imports), `:3200-3353` (`getDefaultDamageCheckTemplate`, `createDamageCheckTemplate` region unchanged, `cloneDamageCheckTemplate`), append new methods near `:2016` (after the transport-report background methods, for proximity to the pattern they mirror) — new methods can be placed anywhere in the class; placing them directly after `selectTransportReportTemplateBackground` (current line 2016) keeps all three background-library implementations adjacent.

**Interfaces:**
- Consumes: `damageCheckTemplateBackgrounds`, `type DamageCheckTemplateBackground`, `type InsertDamageCheckTemplateBackground` from `../shared/schema` (Task 1); `buildDefaultDamageCheckCanvasFields` from `../shared/damage-check-default-layout` (Task 2).
- Produces: `storage.getAllDamageCheckTemplateBackgrounds()`, `storage.getDamageCheckTemplateBackgrounds(templateId)`, `storage.getDamageCheckTemplateBackground(id)`, `storage.createDamageCheckTemplateBackground(data)`, `storage.deleteDamageCheckTemplateBackground(id)`, `storage.selectDamageCheckTemplateBackground(templateId, backgroundId)` — consumed by Task 4's routes.

- [ ] **Step 1: Add the new type imports**

In `server/storage.ts`, in the `from "../shared/schema"` import block (lines 1-26), add after line 9 (`templateBackgrounds, type TemplateBackground, type InsertTemplateBackground,`):
```ts
  type DamageCheckTemplateBackground, type InsertDamageCheckTemplateBackground,
```

In `server/database-storage.ts`, in its `from "../shared/schema"` import block (lines 1-29), add the same line after line 9, and add a value import for the table itself — after line 17 (`damageCheckTemplates, type DamageCheckTemplate, type InsertDamageCheckTemplate,`):
```ts
  damageCheckTemplateBackgrounds,
```
Also add, near the top of `database-storage.ts` alongside its other imports, the shared layout builder:
```ts
import { buildDefaultDamageCheckCanvasFields } from "../shared/damage-check-default-layout";
```

- [ ] **Step 2: Add the interface methods**

In `server/storage.ts`, immediately after the existing `selectTransportReportTemplateBackground` line (current line 152), add:
```ts
  getAllDamageCheckTemplateBackgrounds(): Promise<DamageCheckTemplateBackground[]>;
  getDamageCheckTemplateBackgrounds(templateId: number): Promise<DamageCheckTemplateBackground[]>;
  getDamageCheckTemplateBackground(id: number): Promise<DamageCheckTemplateBackground | undefined>;
  createDamageCheckTemplateBackground(background: InsertDamageCheckTemplateBackground): Promise<DamageCheckTemplateBackground>;
  deleteDamageCheckTemplateBackground(id: number): Promise<boolean>;
  selectDamageCheckTemplateBackground(templateId: number, backgroundId: number): Promise<DamageCheckTemplate | undefined>;
```

- [ ] **Step 3: Implement the background CRUD methods**

In `server/database-storage.ts`, immediately after `selectTransportReportTemplateBackground` (current lines 2009-2016), insert:
```ts
  async getAllDamageCheckTemplateBackgrounds(): Promise<DamageCheckTemplateBackground[]> {
    return await db.select().from(damageCheckTemplateBackgrounds).orderBy(desc(damageCheckTemplateBackgrounds.createdAt));
  }

  async getDamageCheckTemplateBackgrounds(templateId: number): Promise<DamageCheckTemplateBackground[]> {
    return await db
      .select()
      .from(damageCheckTemplateBackgrounds)
      .where(eq(damageCheckTemplateBackgrounds.templateId, templateId))
      .orderBy(desc(damageCheckTemplateBackgrounds.createdAt));
  }

  async getDamageCheckTemplateBackground(id: number): Promise<DamageCheckTemplateBackground | undefined> {
    const [background] = await db.select().from(damageCheckTemplateBackgrounds).where(eq(damageCheckTemplateBackgrounds.id, id));
    return background || undefined;
  }

  async createDamageCheckTemplateBackground(backgroundData: InsertDamageCheckTemplateBackground): Promise<DamageCheckTemplateBackground> {
    const [background] = await db.insert(damageCheckTemplateBackgrounds).values(backgroundData).returning();
    return background;
  }

  async deleteDamageCheckTemplateBackground(id: number): Promise<boolean> {
    const [deleted] = await db.delete(damageCheckTemplateBackgrounds).where(eq(damageCheckTemplateBackgrounds.id, id)).returning();
    return !!deleted;
  }

  async selectDamageCheckTemplateBackground(templateId: number, backgroundId: number): Promise<DamageCheckTemplate | undefined> {
    const background = await this.getDamageCheckTemplateBackground(backgroundId);
    if (!background) return undefined;
    return await this.updateDamageCheckTemplate(templateId, {
      backgroundPath: background.backgroundPath,
      backgroundPreviewPath: background.previewPath,
    });
  }
```

- [ ] **Step 4: Seed the diagram field into the auto-created default template, and backfill existing defaults**

In `server/database-storage.ts`, `getDefaultDamageCheckTemplate()` (current lines 3200-3238) currently sets `diagramTopView: null, diagramFrontView: null, diagramSideView: null, diagramRearView: null` on the auto-created row and has no `canvasFields`. Replace the whole method with:

```ts
  async getDefaultDamageCheckTemplate(): Promise<DamageCheckTemplate | undefined> {
    const [template] = await db.select().from(damageCheckTemplates)
      .where(eq(damageCheckTemplates.isDefault, true))
      .limit(1);

    // If no default template exists, auto-create one with the shared default
    // canvas layout, which includes an auto-matched vehicle diagram field.
    if (!template) {
      const defaultTemplate: InsertDamageCheckTemplate = {
        name: 'Auto-Generated Default',
        description: 'Automatically created default damage check template',
        vehicleMake: null,
        vehicleModel: null,
        vehicleType: null,
        buildYearFrom: null,
        buildYearTo: null,
        isDefault: true,
        language: 'nl',
        inspectionPoints: [
          { id: '1', name: 'Binnenzijde auto schoon', category: 'interieur', damageTypes: ['Kapot', 'Vuil', 'Beschadigd'], required: false },
          { id: '2', name: 'Vloermatten', category: 'interieur', damageTypes: ['Ontbreekt', 'Vuil'], required: false },
          { id: '3', name: 'Buitenzijde auto schoon', category: 'exterieur', damageTypes: ['Vuil', 'Beschadigd'], required: false },
          { id: '4', name: 'Kentekenplaten', category: 'exterieur', damageTypes: ['Ontbreekt', 'Beschadigd'], required: false },
          { id: '5', name: 'Olie - water', category: 'afweez_check', damageTypes: [], required: false },
          { id: '6', name: 'Ruitenwisser vloeistof', category: 'afweez_check', damageTypes: [], required: false },
        ],
        canvasFields: buildDefaultDamageCheckCanvasFields() as any,
        createdBy: 'system',
        updatedBy: 'system'
      };

      const [created] = await db.insert(damageCheckTemplates).values(defaultTemplate).returning();
      return created;
    }

    // Backfill: a default template created before canvas-mode diagrams
    // existed has an empty canvasFields array, which renders with the legacy
    // structured layout — a layout that no longer has any diagram section
    // now that the 4-slot mechanism is removed. Give it the shared default
    // canvas layout (which includes an auto-matched diagram field) once, in
    // place, so out-of-the-box PDFs always include a vehicle diagram.
    const existingCanvasFields = Array.isArray((template as any).canvasFields) ? (template as any).canvasFields : [];
    if (existingCanvasFields.length === 0) {
      const [updated] = await db.update(damageCheckTemplates)
        .set({ canvasFields: buildDefaultDamageCheckCanvasFields() as any, updatedAt: new Date() })
        .where(eq(damageCheckTemplates.id, template.id))
        .returning();
      return updated || template;
    }

    return template;
  }
```

- [ ] **Step 5: Remove legacy diagram fields from `cloneDamageCheckTemplate`, and fix its pre-existing `canvasFields` drop bug**

In `cloneDamageCheckTemplate` (current lines 3316-3353), the `insertData` object currently includes:
```ts
      diagramTopView: source.diagramTopView ?? null,
      diagramFrontView: source.diagramFrontView ?? null,
      diagramRearView: source.diagramRearView ?? null,
      diagramSideView: source.diagramSideView ?? null,
```
Remove those 4 lines (the columns no longer exist after Task 1).

The same object never copies `source.canvasFields` at all, so cloning a canvas-mode template today silently drops all its fields (defaults to `[]`). Since canvas fields are now how the default template's diagram gets carried forward, fix this in the same edit — add, right after the `handoverChecklist` line:
```ts
      canvasFields: (source as any).canvasFields ?? [],
```

- [ ] **Step 6: Typecheck**

Run: `npm run check`
Expected: no errors in `server/storage.ts` or `server/database-storage.ts`.

- [ ] **Step 7: Manual verification**

With the dev server running and authenticated, in a browser or via `curl`:
- `GET /api/damage-check-templates/default/template` — confirm the response's `canvasFields` array is non-empty and contains one entry with `"type":"diagram"`.
- If a default template already existed before this change with empty `canvasFields`, call the same endpoint twice and confirm the second call still returns the same (now backfilled) `canvasFields` rather than re-backfilling every time.

- [ ] **Step 8: Commit**

```bash
git add server/storage.ts server/database-storage.ts
git commit -m "feat: add damage-check template background storage, seed default template's diagram field"
```

---

## Task 4: Server routes — background endpoints, remove legacy diagram routes

**Files:**
- Modify: `server/routes.ts:10402-10832` (damage-check-templates route block)

**Interfaces:**
- Consumes: `storage.getAllDamageCheckTemplateBackgrounds`, `.getDamageCheckTemplateBackgrounds`, `.getDamageCheckTemplateBackground`, `.createDamageCheckTemplateBackground`, `.deleteDamageCheckTemplateBackground`, `.selectDamageCheckTemplateBackground` (Task 3); existing `storage.getDamageCheckTemplate`, `.updateDamageCheckTemplate`.
- Produces: `POST /api/damage-check-templates/:id/background`, `DELETE /api/damage-check-templates/:id/background`, `GET /api/damage-check-templates/backgrounds/all`, `GET /api/damage-check-templates/:id/backgrounds`, `POST /api/damage-check-templates/:id/backgrounds`, `POST /api/damage-check-templates/:id/backgrounds/:backgroundId/select`, `DELETE /api/damage-check-templates/:id/backgrounds/:backgroundId` — consumed by Task 6's client editor.

- [ ] **Step 1: Add multer config and background endpoints**

In `server/routes.ts`, immediately after the DELETE handler for `/api/damage-check-templates/:id` (current lines 10732-10748, right before the `/:id/export` route on line 10749), insert — this mirrors the `transportReportTemplates` background routes at lines 12657-12832 exactly, renamed to the damage-check-templates table/storage methods and its own upload directory:

```ts
  // Configure multer for damage-check template background uploads — images only
  const damageCheckTemplateBackgroundUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: createSecureMulterFilter('document'),
  });

  app.post("/api/damage-check-templates/:id/background", hasPermission(UserPermission.MANAGE_DAMAGE_CHECKS), damageCheckTemplateBackgroundUpload.single('background'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid template ID" });
      if (!req.file) return res.status(400).json({ message: "No background file provided" });

      const ext = path.extname(req.file.originalname).toLowerCase();
      if (!['.jpg', '.jpeg', '.png'].includes(ext)) {
        return res.status(400).json({ message: "Background must be a JPG or PNG image" });
      }

      const template = await storage.getDamageCheckTemplate(id);
      if (!template) return res.status(404).json({ message: "Template not found" });

      const bufferValidation = await validateFileBuffer(req.file.buffer, req.file.mimetype, req.file.originalname, 'document');
      if (!bufferValidation.valid) return res.status(400).json({ message: bufferValidation.error });

      const templatesDir = path.join(uploadsDir, 'damage-check-templates');
      if (!fs.existsSync(templatesDir)) fs.mkdirSync(templatesDir, { recursive: true });

      if ((template as any).backgroundPath) {
        try {
          await fs.promises.unlink(path.join(process.cwd(), (template as any).backgroundPath));
        } catch (error) {
          console.error("Error deleting old damage-check template background:", error);
        }
      }

      const filename = `template_${id}_background_${Date.now()}${ext}`;
      const filePath = path.join(templatesDir, filename);
      await fs.promises.writeFile(filePath, req.file.buffer);
      const backgroundPath = path.relative(process.cwd(), filePath);

      const updated = await storage.updateDamageCheckTemplate(id, {
        backgroundPath,
        backgroundPreviewPath: backgroundPath,
      } as any);
      if (!updated) return res.status(404).json({ message: "Failed to update template" });
      res.json(updated);
    } catch (error) {
      console.error("Error uploading damage-check template background:", error);
      res.status(400).json({ message: "Failed to upload background" });
    }
  });

  app.delete("/api/damage-check-templates/:id/background", hasPermission(UserPermission.MANAGE_DAMAGE_CHECKS), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid template ID" });
      const template = await storage.getDamageCheckTemplate(id);
      if (!template) return res.status(404).json({ message: "Template not found" });

      if ((template as any).backgroundPath) {
        try {
          await fs.promises.unlink(path.join(process.cwd(), (template as any).backgroundPath));
        } catch (error) {
          console.error("Error deleting damage-check template background:", error);
        }
      }

      const updated = await storage.updateDamageCheckTemplate(id, {
        backgroundPath: null,
        backgroundPreviewPath: null,
      } as any);
      if (!updated) return res.status(404).json({ message: "Failed to update template" });
      res.json(updated);
    } catch (error) {
      console.error("Error removing damage-check template background:", error);
      res.status(500).json({ message: "Failed to remove background" });
    }
  });

  app.get("/api/damage-check-templates/backgrounds/all", hasPermission(UserPermission.MANAGE_DAMAGE_CHECKS), async (req: Request, res: Response) => {
    try {
      const backgrounds = await storage.getAllDamageCheckTemplateBackgrounds();
      res.json(backgrounds);
    } catch (error) {
      console.error("Error fetching damage-check template backgrounds:", error);
      res.status(500).json({ message: "Failed to fetch backgrounds" });
    }
  });

  app.get("/api/damage-check-templates/:id/backgrounds", hasPermission(UserPermission.MANAGE_DAMAGE_CHECKS), async (req: Request, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      if (isNaN(templateId)) return res.status(400).json({ message: "Invalid template ID" });
      const backgrounds = await storage.getDamageCheckTemplateBackgrounds(templateId);
      res.json(backgrounds);
    } catch (error) {
      console.error("Error fetching damage-check template backgrounds:", error);
      res.status(500).json({ message: "Failed to fetch backgrounds" });
    }
  });

  app.post("/api/damage-check-templates/:id/backgrounds", hasPermission(UserPermission.MANAGE_DAMAGE_CHECKS), damageCheckTemplateBackgroundUpload.single('background'), async (req: Request, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      if (isNaN(templateId)) return res.status(400).json({ message: "Invalid template ID" });
      if (!req.file) return res.status(400).json({ message: "No background file provided" });

      const ext = path.extname(req.file.originalname).toLowerCase();
      if (!['.jpg', '.jpeg', '.png'].includes(ext)) {
        return res.status(400).json({ message: "Background must be a JPG or PNG image" });
      }

      const template = await storage.getDamageCheckTemplate(templateId);
      if (!template) return res.status(404).json({ message: "Template not found" });

      const bufferValidation = await validateFileBuffer(req.file.buffer, req.file.mimetype, req.file.originalname, 'document');
      if (!bufferValidation.valid) return res.status(400).json({ message: bufferValidation.error });

      const templatesDir = path.join(uploadsDir, 'damage-check-templates');
      if (!fs.existsSync(templatesDir)) fs.mkdirSync(templatesDir, { recursive: true });

      const name = (req.body.name || req.file.originalname || 'Background').toString().slice(0, 100);
      const filename = `library_${templateId}_${Date.now()}${ext}`;
      const filePath = path.join(templatesDir, filename);
      await fs.promises.writeFile(filePath, req.file.buffer);
      const backgroundPath = path.relative(process.cwd(), filePath);

      const background = await storage.createDamageCheckTemplateBackground({
        templateId,
        name,
        backgroundPath,
        previewPath: backgroundPath,
      });
      res.status(201).json(background);
    } catch (error) {
      console.error("Error uploading damage-check template background to library:", error);
      res.status(400).json({ message: "Failed to upload background" });
    }
  });

  app.post("/api/damage-check-templates/:id/backgrounds/:backgroundId/select", hasPermission(UserPermission.MANAGE_DAMAGE_CHECKS), async (req: Request, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      const backgroundId = parseInt(req.params.backgroundId);
      if (isNaN(templateId) || isNaN(backgroundId)) return res.status(400).json({ message: "Invalid ID" });
      const updated = await storage.selectDamageCheckTemplateBackground(templateId, backgroundId);
      if (!updated) return res.status(404).json({ message: "Template or background not found" });
      res.json(updated);
    } catch (error) {
      console.error("Error selecting damage-check template background:", error);
      res.status(500).json({ message: "Failed to select background" });
    }
  });

  app.delete("/api/damage-check-templates/:id/backgrounds/:backgroundId", hasPermission(UserPermission.MANAGE_DAMAGE_CHECKS), async (req: Request, res: Response) => {
    try {
      const backgroundId = parseInt(req.params.backgroundId);
      if (isNaN(backgroundId)) return res.status(400).json({ message: "Invalid background ID" });
      const background = await storage.getDamageCheckTemplateBackground(backgroundId);
      if (!background) return res.status(404).json({ message: "Background not found" });

      try {
        await fs.promises.unlink(path.join(process.cwd(), background.backgroundPath));
      } catch (error) {
        console.error("Error deleting damage-check template background file:", error);
      }

      const deleted = await storage.deleteDamageCheckTemplateBackground(backgroundId);
      if (!deleted) return res.status(500).json({ message: "Failed to delete background" });
      res.status(200).json({ message: "Background deleted successfully" });
    } catch (error) {
      console.error("Error deleting damage-check template background:", error);
      res.status(500).json({ message: "Failed to delete background" });
    }
  });

```

- [ ] **Step 2: Remove the legacy `upload-diagrams` route**

In `server/routes.ts`, delete the entire route block at current lines 10594-10623:
```ts
  // Upload diagrams for damage check templates
  app.post("/api/damage-check-templates/upload-diagrams", hasPermission(UserPermission.MANAGE_DAMAGE_CHECKS), diagramUpload.fields([
    { name: 'topView', maxCount: 1 },
    { name: 'frontView', maxCount: 1 },
    { name: 'rearView', maxCount: 1 },
    { name: 'sideView', maxCount: 1 }
  ]), async (req: Request, res: Response) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const paths: any = {};
      
      if (files.topView) {
        paths.diagramTopView = getRelativePath(files.topView[0].path);
      }
      if (files.frontView) {
        paths.diagramFrontView = getRelativePath(files.frontView[0].path);
      }
      if (files.rearView) {
        paths.diagramRearView = getRelativePath(files.rearView[0].path);
      }
      if (files.sideView) {
        paths.diagramSideView = getRelativePath(files.sideView[0].path);
      }
      
      res.json(paths);
    } catch (error) {
      console.error("Error uploading diagrams:", error);
      res.status(500).json({ message: "Error uploading diagrams" });
    }
  });

```
Leave the `diagramUpload` multer instance itself (line 721) — it's still used by `/api/damage-check-templates/upload-photo` and the `vehicle-diagram-templates` routes.

- [ ] **Step 3: Remove legacy diagram fields from the preview-pdf draft**

In the `/api/damage-check-templates/preview-pdf` handler (current lines 10465-10592):

Delete the "Diagram path safety" helper block (current lines 10472-10483):
```ts
        // Diagram path safety: only allow relative paths inside the uploads
        // directory and reject any traversal attempt. Anything that fails the
        // check is silently dropped so the preview still renders without it.
        const isSafeDiagramPath = (p: unknown): p is string => {
          if (typeof p !== "string" || p.length === 0) return false;
          if (p.includes("..") || p.includes("\0")) return false;
          if (path.isAbsolute(p)) return false;
          const normalized = path.posix.normalize(p.replace(/\\/g, "/"));
          if (normalized.startsWith("../") || normalized === "..") return false;
          return normalized.startsWith("uploads/");
        };
        const safeDiagram = (p: unknown) => (isSafeDiagramPath(p) ? p : null);

```

Delete the 4 diagram lines from `templateForRender` (current lines 10509-10512):
```ts
          diagramTopView: safeDiagram(draft.diagramTopView),
          diagramFrontView: safeDiagram(draft.diagramFrontView),
          diagramRearView: safeDiagram(draft.diagramRearView),
          diagramSideView: safeDiagram(draft.diagramSideView),
```

- [ ] **Step 4: Typecheck**

Run: `npm run check`
Expected: no errors in `server/routes.ts`.

- [ ] **Step 5: Manual verification**

With the dev server running and an authenticated session cookie:
- `POST /api/damage-check-templates/:id/background` with a small PNG as `background` form field — confirm 200 and the response includes `backgroundPath`.
- `GET /api/damage-check-templates/:id/backgrounds` — confirm empty array (no library entries yet).
- `POST /api/damage-check-templates/:id/backgrounds` with `background` + `name` fields — confirm 201 and the new library entry.
- `POST /api/damage-check-templates/:id/backgrounds/:backgroundId/select` — confirm the template's `backgroundPath` now matches the library entry's.
- `DELETE /api/damage-check-templates/:id/backgrounds/:backgroundId` — confirm 200 and the entry is gone from the list.
- `POST /api/damage-check-templates/upload-diagrams` — confirm 404 (route no longer exists).

- [ ] **Step 6: Commit**

```bash
git add server/routes.ts
git commit -m "feat: add damage-check template background endpoints, remove legacy diagram upload route"
```

---

## Task 5: PDF generator cleanup — remove legacy diagram rendering

**Files:**
- Modify: `server/pdf-damage-check-generator.ts:83-101` (interface), `:1216-1321` (legacy structured diagram section), `:2016-2026` (legacy fallback in canvas diagram field renderer)

**Interfaces:**
- Consumes: none new.
- Produces: same public functions as before (`generateDamageCheckPDFWithTemplate` etc.) with no behavior change for canvas-mode templates using mechanism A; legacy structured-mode templates simply no longer render a diagram section (they never had a real one post-Task-1 since the 4 columns are gone).

- [ ] **Step 1: Remove the 4 diagram fields from the `DamageCheckTemplate` interface**

In `server/pdf-damage-check-generator.ts`, in the `DamageCheckTemplate` interface (current lines 83-101), delete these 4 lines (currently 92-95):
```ts
  diagramTopView?: string | null;
  diagramFrontView?: string | null;
  diagramRearView?: string | null;
  diagramSideView?: string | null;
```

- [ ] **Step 2: Remove the legacy structured-mode "Vehicle Diagram Section"**

In the legacy structured PDF generation function, delete the entire block from the `// Vehicle Diagram Section` comment through the end of the front/rear-view row (current lines 1216-1321):
```ts
  // Ensure space for diagrams and signatures
  page = ensureSpace(250);
  
  yPosition -= 20;
  
  // Vehicle Diagram Section
  page.drawText('VOERTUIGSCHEMA', {
    x: margin,
    y: yPosition,
    size: 10,
    font: boldFont,
  });
  
  yPosition -= 15;
  
  // Try to load and embed vehicle diagrams if available
  const diagramBoxWidth = (width - margin * 2 - 10) / 2;
  const diagramBoxHeight = 80;
  
  // Helper function to load and embed a diagram
  const loadDiagram = async (diagramPath: string | null | undefined) => {
    if (!diagramPath) return null;
    
    try {
      const diagramFullPath = path.join(process.cwd(), diagramPath);
      const diagramExists = await fs.access(diagramFullPath).then(() => true).catch(() => false);
      
      if (diagramExists) {
        const diagramBytes = await fs.readFile(diagramFullPath);
        
        if (diagramPath.toLowerCase().endsWith('.png')) {
          return await pdfDoc.embedPng(diagramBytes);
        } else if (diagramPath.toLowerCase().endsWith('.jpg') || diagramPath.toLowerCase().endsWith('.jpeg')) {
          return await pdfDoc.embedJpg(diagramBytes);
        }
      }
    } catch (error) {
      console.warn('Could not load vehicle diagram:', diagramPath, error);
    }
    
    return null;
  };
  
  // Load all available diagrams
  const topViewImage = await loadDiagram(template.diagramTopView);
  const sideViewImage = await loadDiagram(template.diagramSideView);
  const frontViewImage = await loadDiagram(template.diagramFrontView);
  const rearViewImage = await loadDiagram(template.diagramRearView);
  
  const diagramEmbedded = !!(topViewImage || sideViewImage || frontViewImage || rearViewImage);
  
  // Display diagrams (top row: Top & Side, bottom row: Front & Rear)
  const drawDiagramOrPlaceholder = (image: any, x: number, y: number, width: number, height: number, label: string) => {
    if (image) {
      // Add padding around the diagram (10 points on each side)
      const padding = 10;
      const availableWidth = width - (padding * 2);
      const availableHeight = height - (padding * 2);
      
      const dims = image.scale(1);
      const scale = Math.min(availableWidth / dims.width, availableHeight / dims.height);
      const imgWidth = dims.width * scale;
      const imgHeight = dims.height * scale;
      const xOffset = (width - imgWidth) / 2;
      const yOffset = (height - imgHeight) / 2;
      
      page.drawImage(image, {
        x: x + xOffset,
        y: y - height + yOffset,
        width: imgWidth,
        height: imgHeight,
      });
    } else {
      page.drawRectangle({
        x,
        y: y - height,
        width,
        height,
        borderColor: rgb(0, 0, 0),
        borderWidth: 1,
      });
      page.drawText(label, {
        x: x + width / 2 - (label.length * 2.5),
        y: y - height / 2,
        size: 9,
        font: boldFont,
        color: rgb(0.5, 0.5, 0.5),
      });
    }
  };
  
  // Top row: Top view and Side view
  drawDiagramOrPlaceholder(topViewImage, margin, yPosition, diagramBoxWidth, diagramBoxHeight, 'BOVENAANZICHT');
  drawDiagramOrPlaceholder(sideViewImage, margin + diagramBoxWidth + 10, yPosition, diagramBoxWidth, diagramBoxHeight, 'ZIJAANZICHT');
  
  yPosition -= diagramBoxHeight + 10;
  
  // Bottom row: Front view and Rear view (if we have any diagrams at all)
  if (diagramEmbedded) {
    page = ensureSpace(diagramBoxHeight + 20);
    drawDiagramOrPlaceholder(frontViewImage, margin, yPosition, diagramBoxWidth, diagramBoxHeight, 'VOORAANZICHT');
    drawDiagramOrPlaceholder(rearViewImage, margin + diagramBoxWidth + 10, yPosition, diagramBoxWidth, diagramBoxHeight, 'ACHTERAANZICHT');
    yPosition -= diagramBoxHeight + 20;
  } else {
    yPosition -= 20;
  }
```
Replace it with just enough spacing to keep the signature section's layout intact:
```ts
  // Ensure space for signatures
  page = ensureSpace(250);
  yPosition -= 20;
```
(This collapses what were two separate "ensure space" calls — one before the removed diagram section, one after it, at the old line 1324 — into one; delete the old `page = ensureSpace(100);` comment/call that immediately followed the removed block, since it's now redundant with this one.)

- [ ] **Step 3: Remove the legacy fallback in the canvas-mode diagram field renderer**

In the canvas-mode `'diagram'` field renderer, delete the "Fallback to damage template diagram (old system)" block (current lines 2016-2026):
```ts
            
            // Fallback to damage template diagram (old system)
            if (!diagramBytes && damageTemplate.diagramTopView) {
              try {
                const diagramPath = path.join(process.cwd(), damageTemplate.diagramTopView);
                diagramBytes = await fs.readFile(diagramPath);
                diagramFormat = damageTemplate.diagramTopView.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
                console.log(`✅ Loaded damage template diagram from filesystem: ${damageTemplate.diagramTopView}`);
              } catch (error) {
                console.warn('Could not load damage template diagram:', error);
              }
            }
```
Leave the object-storage and `vehicleDiagram.diagramPath` filesystem fallbacks immediately above it untouched — those are mechanism A and stay.

- [ ] **Step 4: Typecheck**

Run: `npm run check`
Expected: no errors in `server/pdf-damage-check-generator.ts`.

- [ ] **Step 5: Manual verification**

Generate a damage check PDF for a template with `canvasFields` containing a `'diagram'` field (e.g. the default template from Task 3) for a vehicle whose make/model has an uploaded `vehicleDiagramTemplates` entry — confirm the PDF still embeds that diagram correctly. Generate a PDF for a legacy structured-mode template (empty `canvasFields`) and confirm it still generates without errors (just without a diagram section).

- [ ] **Step 6: Commit**

```bash
git add server/pdf-damage-check-generator.ts
git commit -m "refactor: remove legacy 4-slot diagram rendering from PDF generator"
```

---

## Task 6: Client — background image UI in the DamageCheck canvas editor

**Files:**
- Modify: `client/src/pages/settings/damage-check-template-editor.tsx`

**Interfaces:**
- Consumes: `POST/DELETE /api/damage-check-templates/:id/background`, `GET/POST /api/damage-check-templates/:id/backgrounds`, `GET /api/damage-check-templates/backgrounds/all`, `POST .../select`, `DELETE .../:backgroundId` (Task 4).

- [ ] **Step 1: Add `backgroundPath`/`backgroundPreviewPath` to the `Template` interface**

The `Template` interface (current lines 53-62) is:
```ts
interface Template {
  id: number;
  name: string;
  description?: string | null;
  isDefault: boolean;
  language: string;
  canvasFields: CanvasField[];
  vehicleMake?: string | null;
  vehicleModel?: string | null;
}
```
Add two fields:
```ts
interface Template {
  id: number;
  name: string;
  description?: string | null;
  isDefault: boolean;
  language: string;
  canvasFields: CanvasField[];
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  backgroundPath?: string | null;
  backgroundPreviewPath?: string | null;
}
```

- [ ] **Step 2: Add a `TemplateBackground` type and background state/mutations**

Add this interface near the top of the file, next to `DiagramTemplateSummary` (current lines 45-51):
```ts
interface TemplateBackground {
  id: number;
  templateId: number;
  name: string;
  backgroundPath: string;
  previewPath: string;
}
```

Inside the component, after the existing `previewLoading` state declaration (current line 302), add:
```ts
  const [isBackgroundLibraryOpen, setIsBackgroundLibraryOpen] = useState(false);
  const [backgroundName, setBackgroundName] = useState('');
```

After the `deleteMutation` block (ends at current line ~486, before whatever mutation/effect follows), add these mutations — same request pattern as `transport-report-template-editor.tsx:196-260,269-300,302-...`:
```ts
  const uploadBackgroundMutation = useMutation({
    mutationFn: async ({ templateId, file }: { templateId: number; file: File }) => {
      const formData = new FormData();
      formData.append('background', file);
      const res = await fetch(`/api/damage-check-templates/${templateId}/background`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!res.ok) throw new Error((await res.text()) || 'Upload failed');
      return res.json();
    },
    onSuccess: async () => {
      await invalidateByPrefix('/api/damage-check-templates');
      toast({ title: 'Success', description: 'Background uploaded' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const removeBackgroundMutation = useMutation({
    mutationFn: async (templateId: number) => {
      const res = await apiRequest('DELETE', `/api/damage-check-templates/${templateId}/background`);
      return res.json();
    },
    onSuccess: async () => {
      await invalidateByPrefix('/api/damage-check-templates');
      toast({ title: 'Success', description: 'Background removed' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const { data: backgroundLibrary = [], refetch: refetchBackgrounds } = useQuery<TemplateBackground[]>({
    queryKey: ['/api/damage-check-templates/backgrounds/all'],
    enabled: isBackgroundLibraryOpen,
  });

  const addBackgroundToLibraryMutation = useMutation({
    mutationFn: async ({ templateId, file, name }: { templateId: number; file: File; name: string }) => {
      const formData = new FormData();
      formData.append('background', file);
      formData.append('name', name);
      const res = await fetch(`/api/damage-check-templates/${templateId}/backgrounds`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!res.ok) throw new Error((await res.text()) || 'Upload failed');
      return res.json();
    },
    onSuccess: async () => {
      await refetchBackgrounds();
      setBackgroundName('');
      toast({ title: 'Success', description: 'Background added to library' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const selectBackgroundMutation = useMutation({
    mutationFn: async ({ templateId, backgroundId }: { templateId: number; backgroundId: number }) => {
      const res = await apiRequest('POST', `/api/damage-check-templates/${templateId}/backgrounds/${backgroundId}/select`);
      return res.json();
    },
    onSuccess: async () => {
      await invalidateByPrefix('/api/damage-check-templates');
      toast({ title: 'Success', description: 'Background selected' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteLibraryBackgroundMutation = useMutation({
    mutationFn: async ({ templateId, backgroundId }: { templateId: number; backgroundId: number }) => {
      return apiRequest('DELETE', `/api/damage-check-templates/${templateId}/backgrounds/${backgroundId}`);
    },
    onSuccess: async () => {
      await refetchBackgrounds();
      toast({ title: 'Success', description: 'Background deleted' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
```
(This takes both `templateId` and `backgroundId` because the route is `DELETE /api/damage-check-templates/:id/backgrounds/:backgroundId` — same shape as `transportReportTemplates` at `routes.ts:12812`.)

- [ ] **Step 3: Add a `currentTemplate` lookup**

Near the other derived state (e.g. right after `loadTemplate` is defined, current line ~367), add:
```ts
  const currentTemplate = templates.find(t => t.id === currentId) ?? null;
```

- [ ] **Step 4: Add a "Background" button + dialog to the template selection bar**

In the template selection bar's button group (current lines 751-775, alongside the "New" `Dialog`), add a sibling `Dialog` for background management:
```tsx
              <Dialog open={isBackgroundLibraryOpen} onOpenChange={setIsBackgroundLibraryOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" disabled={!currentId} data-testid="button-background">
                    <ImageIcon className="h-4 w-4 mr-1" /> Background
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Template background</DialogTitle>
                    <DialogDescription>
                      Optional page image shown behind the canvas fields. Same background can be reused across templates via the library below.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs">Current background</Label>
                      {currentTemplate?.backgroundPath ? (
                        <div className="flex items-center gap-2">
                          <img
                            src={`/${currentTemplate.backgroundPreviewPath ?? currentTemplate.backgroundPath}`}
                            alt="Current background"
                            className="h-16 w-auto border rounded"
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => currentId && removeBackgroundMutation.mutate(currentId)}
                            disabled={removeBackgroundMutation.isPending}
                          >
                            Remove
                          </Button>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">No background set — canvas is blank.</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Upload new background</Label>
                      <Input
                        type="file"
                        accept="image/png,image/jpeg"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file && currentId) uploadBackgroundMutation.mutate({ templateId: currentId, file });
                        }}
                        disabled={uploadBackgroundMutation.isPending}
                      />
                    </div>
                    <Separator />
                    <div className="space-y-2">
                      <Label className="text-xs">Add to shared library</Label>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Background name"
                          value={backgroundName}
                          onChange={(e) => setBackgroundName(e.target.value)}
                        />
                        <Input
                          type="file"
                          accept="image/png,image/jpeg"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file && currentId && backgroundName.trim()) {
                              addBackgroundToLibraryMutation.mutate({ templateId: currentId, file, name: backgroundName.trim() });
                            }
                          }}
                          disabled={addBackgroundToLibraryMutation.isPending || !backgroundName.trim()}
                        />
                      </div>
                    </div>
                    <div className="space-y-2 max-h-48 overflow-auto">
                      {backgroundLibrary.map(bg => (
                        <div key={bg.id} className="flex items-center justify-between gap-2 border rounded p-2">
                          <div className="flex items-center gap-2">
                            <img src={`/${bg.previewPath}`} alt={bg.name} className="h-10 w-auto border rounded" />
                            <span className="text-xs">{bg.name}</span>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => currentId && selectBackgroundMutation.mutate({ templateId: currentId, backgroundId: bg.id })}
                            >
                              Use
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600"
                              onClick={() => currentId && deleteLibraryBackgroundMutation.mutate({ templateId: currentId, backgroundId: bg.id })}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsBackgroundLibraryOpen(false)}>Close</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
```
(`ImageIcon` is already imported at line 21.)

- [ ] **Step 5: Render the background image behind the canvas fields**

In the canvas container (current lines 904-919), immediately inside the opening `<div ref={canvasRef} ...>` tag and before the existing header `<img>` (current lines 920-933), add:
```tsx
                    {currentTemplate?.backgroundPath && (
                      <img
                        src={`/${currentTemplate.backgroundPreviewPath ?? currentTemplate.backgroundPath}`}
                        alt="Background"
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: PAGE_W * zoom,
                          height: PAGE_H * zoom,
                          objectFit: 'cover',
                          pointerEvents: 'none',
                          userSelect: 'none',
                        }}
                        draggable={false}
                      />
                    )}
```

- [ ] **Step 6: Typecheck**

Run: `npm run check`
Expected: no errors in `damage-check-template-editor.tsx`.

- [ ] **Step 7: Manual browser verification**

Start the dev server, open Documents → Damage Check → Edit Layout, select or create a template, click "Background", upload a PNG, confirm it appears behind the canvas fields and persists across a page reload. Add a second background to the shared library, use "Use" to switch the active template to it, then delete it from the library and confirm it disappears from the list.

- [ ] **Step 8: Commit**

```bash
git add client/src/pages/settings/damage-check-template-editor.tsx
git commit -m "feat: add background image support to the DamageCheck template editor"
```

---

## Task 7: Client — remove legacy 4-slot diagram UI, repoint diagram placement to matched vehicle diagram

**Files:**
- Modify: `client/src/pages/settings/damage-check-templates.tsx`

**Interfaces:**
- Consumes: `GET /api/vehicle-diagram-templates` (existing route, already used elsewhere in the app, e.g. `damage-check-template-editor.tsx:323`) — returns entries with `{ id, make, model, yearFrom, yearTo }`; images served at `GET /api/vehicle-diagram-templates/:id/image`.

- [ ] **Step 1: Remove the 4 diagram fields from the `DamageCheckTemplate` interface**

Delete lines 99-102:
```ts
  diagramTopView: string | null;
  diagramFrontView: string | null;
  diagramRearView: string | null;
  diagramSideView: string | null;
```

- [ ] **Step 2: Remove the diagram file state and upload plumbing**

Delete the diagram file state block (current lines 904-923):
```ts
  // Diagram files
  const [topViewFile, setTopViewFile] = useState<File | null>(null);
  const [frontViewFile, setFrontViewFile] = useState<File | null>(null);
  const [rearViewFile, setRearViewFile] = useState<File | null>(null);
  const [sideViewFile, setSideViewFile] = useState<File | null>(null);
  const [uploadingDiagrams, setUploadingDiagrams] = useState(false);

  // Stable object URL for the freshly-selected top-view file. Created once
  // per file selection and explicitly revoked on change/unmount so we don't
  // leak blob URLs across long editing sessions.
  const [topViewPreviewUrl, setTopViewPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!topViewFile) {
      setTopViewPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(topViewFile);
    setTopViewPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [topViewFile]);

```

Delete the pending-upload state and its 4 upload effects plus the `effectiveDiagrams` derivation (current lines 937-1021 minus the preview-debounce comment block that follows — keep the "Phase 3 — once a user picks..." comment removed too since it describes what's being deleted):
```ts
  // Phase 3 — once a user picks a new diagram file in the editor, upload it
  // immediately so the live preview can render the in-flight selection. The
  // resulting server-relative path is stored in `pendingDiagramPaths` and is
  // used both by the preview pane and the final save flow.
  const [pendingDiagramPaths, setPendingDiagramPaths] = useState<{
    diagramTopView?: string | null;
    diagramFrontView?: string | null;
    diagramRearView?: string | null;
    diagramSideView?: string | null;
  }>({});

  // Revoke the previous preview blob URL whenever it changes or unmounts so
  // long editing sessions don't accumulate blobs in memory.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Auto-upload each newly-selected diagram file to the existing upload
  // endpoint so the live preview can render the in-flight selection. One
  // effect per slot keeps uploads independent. AbortController guards
  // against rapid file changes superseding an in-flight upload.
  const uploadDiagramForPreview = (
    file: File,
    fieldName: "topView" | "frontView" | "rearView" | "sideView",
    pathKey: "diagramTopView" | "diagramFrontView" | "diagramRearView" | "diagramSideView",
    signal: AbortSignal,
  ) => {
    const fd = new FormData();
    fd.append(fieldName, file);
    fetch("/api/damage-check-templates/upload-diagrams", {
      method: "POST",
      body: fd,
      credentials: "include",
      signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error("upload failed");
        return res.json();
      })
      .then((paths) => {
        if (paths?.[pathKey]) {
          setPendingDiagramPaths((prev) => ({ ...prev, [pathKey]: paths[pathKey] }));
        }
      })
      .catch((err) => {
        if (err?.name !== "AbortError") {
          console.warn(`Diagram preview upload failed for ${fieldName}:`, err);
        }
      });
  };
  useEffect(() => {
    if (!topViewFile) return;
    const c = new AbortController();
    uploadDiagramForPreview(topViewFile, "topView", "diagramTopView", c.signal);
    return () => c.abort();
  }, [topViewFile]);
  useEffect(() => {
    if (!frontViewFile) return;
    const c = new AbortController();
    uploadDiagramForPreview(frontViewFile, "frontView", "diagramFrontView", c.signal);
    return () => c.abort();
  }, [frontViewFile]);
  useEffect(() => {
    if (!rearViewFile) return;
    const c = new AbortController();
    uploadDiagramForPreview(rearViewFile, "rearView", "diagramRearView", c.signal);
    return () => c.abort();
  }, [rearViewFile]);
  useEffect(() => {
    if (!sideViewFile) return;
    const c = new AbortController();
    uploadDiagramForPreview(sideViewFile, "sideView", "diagramSideView", c.signal);
    return () => c.abort();
  }, [sideViewFile]);

  // Effective diagram paths for preview + save: pending uploads win over the
  // persisted template paths.
  const effectiveDiagrams = {
    diagramTopView: pendingDiagramPaths.diagramTopView ?? template?.diagramTopView ?? null,
    diagramFrontView: pendingDiagramPaths.diagramFrontView ?? template?.diagramFrontView ?? null,
    diagramRearView: pendingDiagramPaths.diagramRearView ?? template?.diagramRearView ?? null,
    diagramSideView: pendingDiagramPaths.diagramSideView ?? template?.diagramSideView ?? null,
  };

```
Keep the plain "Revoke the previous preview blob URL" `useEffect` — re-add it exactly as it was (it revokes `previewUrl`, unrelated to diagrams, it was only interleaved with the deleted block):
```ts
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

```

- [ ] **Step 3: Add a make/model diagram matcher and use it in the live-preview draft**

Add this near the top of the `TemplateEditor` function body (right after the `inspectionPoints`/`editingPoint`/`pointEditorOpen`/`bulkOpen` state, before the deleted diagram-file block used to start):
```ts
  // Vehicle diagram used by the "Diagram Placement" panel below — sourced
  // from the make/model-keyed vehicleDiagramTemplates library (the same one
  // used by the live pickup/return flow and the canvas editor's 'diagram'
  // field), matched against this template's own vehicleMake/vehicleModel.
  // Replaces the old per-template 4-slot diagram upload.
  const { data: vehicleDiagramTemplates = [] } = useQuery<Array<{
    id: number; make: string; model: string; yearFrom?: number | null; yearTo?: number | null;
  }>>({
    queryKey: ["/api/vehicle-diagram-templates"],
  });
  const matchedDiagramUrl = useMemo(() => {
    if (!vehicleMake.trim() || !vehicleModel.trim()) return null;
    const nm = vehicleMake.trim().toLowerCase();
    const nmo = vehicleModel.trim().toLowerCase();
    const year = buildYearFrom.trim() ? parseInt(buildYearFrom.trim(), 10) : undefined;
    const match = vehicleDiagramTemplates.find((t) => {
      if (t.make.trim().toLowerCase() !== nm || t.model.trim().toLowerCase() !== nmo) return false;
      if (year !== undefined && !Number.isNaN(year)) {
        if (t.yearFrom != null && t.yearFrom > year) return false;
        if (t.yearTo != null && t.yearTo < year) return false;
      }
      return true;
    });
    return match ? `/api/vehicle-diagram-templates/${match.id}/image` : null;
  }, [vehicleDiagramTemplates, vehicleMake, vehicleModel, buildYearFrom]);
```
Check the top of the file imports `useMemo` from `"react"` already — if not, add it to the existing React import.

Update the preview draft object (current lines 1447-1461) to drop `...effectiveDiagrams` — since the draft's diagram is now sourced from `vehicleMake`/`vehicleModel` (already present in the draft) and mechanism A resolves it server-side, just remove the spread:
```ts
        const draft = {
          name,
          description,
          vehicleMake,
          vehicleModel,
          vehicleType,
          buildYearFrom,
          buildYearTo,
          headerText,
          footerText,
          categories,
          inspectionPoints,
          handoverChecklist,
        };
```
Remove `effectiveDiagrams.diagramTopView` etc. from the `useEffect` dependency array (current lines 1504-1507) — leave the rest of that array untouched.

- [ ] **Step 4: Simplify `handleSave`**

Delete the file-upload block (current lines 1129-1167):
```ts
    // Start from current effective paths (pending live-preview uploads have
    // priority over persisted template paths). Only re-upload diagram files
    // that haven't already been uploaded by the live-preview auto-upload.
    let diagramPaths = { ...effectiveDiagrams };

    const filesNeedingUpload: { field: string; file: File }[] = [];
    if (topViewFile && !pendingDiagramPaths.diagramTopView)
      filesNeedingUpload.push({ field: "topView", file: topViewFile });
    if (frontViewFile && !pendingDiagramPaths.diagramFrontView)
      filesNeedingUpload.push({ field: "frontView", file: frontViewFile });
    if (rearViewFile && !pendingDiagramPaths.diagramRearView)
      filesNeedingUpload.push({ field: "rearView", file: rearViewFile });
    if (sideViewFile && !pendingDiagramPaths.diagramSideView)
      filesNeedingUpload.push({ field: "sideView", file: sideViewFile });

    if (filesNeedingUpload.length > 0) {
      try {
        setUploadingDiagrams(true);
        const formData = new FormData();
        filesNeedingUpload.forEach(({ field, file }) => formData.append(field, file));
        const response = await fetch("/api/damage-check-templates/upload-diagrams", {
          method: "POST",
          body: formData,
        });
        if (!response.ok) throw new Error("Failed to upload diagrams");
        const uploadedPaths = await response.json();
        diagramPaths = { ...diagramPaths, ...uploadedPaths };
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to upload diagram images",
          variant: "destructive",
        });
        setUploadingDiagrams(false);
        return;
      } finally {
        setUploadingDiagrams(false);
      }
    }

```
Remove `...diagramPaths` from the final `data` object (current line 1200):
```ts
    const data = {
      name: name.trim(),
      description: description.trim() || null,
      vehicleMake: vehicleMake.trim() || null,
      vehicleModel: vehicleModel.trim() || null,
      vehicleType: vehicleType || null,
      buildYearFrom: buildYearFrom.trim() || null,
      buildYearTo: buildYearTo.trim() || null,
      language: "nl",
      isDefault,
      headerText: headerText.trim() || null,
      footerText: footerText.trim() || null,
      categories: categories.map((c, idx) => ({ ...c, order: idx })),
      handoverChecklist: handoverChecklist.map((h, idx) => ({ ...h, order: idx })),
      inspectionPoints: orderedPoints,
    };
```

- [ ] **Step 5: Remove the "Vehicle Diagrams" upload section, repoint "Diagram Placement"**

Delete the entire `{/* Vehicle Diagrams */}` section (current lines 1870-1930).

Update the `{/* Diagram Placement */}` section's `DiagramPlacementPanel` call (current line 1945) from:
```tsx
            <DiagramPlacementPanel
              topViewPath={topViewPreviewUrl ?? template?.diagramTopView ?? null}
              points={inspectionPoints}
              onSetPosition={setPointPosition}
            />
```
to:
```tsx
            <DiagramPlacementPanel
              topViewPath={matchedDiagramUrl}
              points={inspectionPoints}
              onSetPosition={setPointPosition}
            />
```
Also update its placeholder copy so it reflects the new source. In `DiagramPlacementPanel` (current lines 259-264):
```tsx
  if (!topViewPath) {
    return (
      <div className="border-2 border-dashed rounded-lg p-6 text-center text-gray-500 text-xs">
        Upload a Top View diagram above to start placing inspection points on it.
      </div>
    );
  }
```
becomes:
```tsx
  if (!topViewPath) {
    return (
      <div className="border-2 border-dashed rounded-lg p-6 text-center text-gray-500 text-xs">
        Set this template's vehicle make and model above, and upload a matching diagram under Documents → Damage Check → Diagram Templates, to start placing inspection points on it.
      </div>
    );
  }
```

- [ ] **Step 6: Simplify the save button**

Current (lines 2236-2248):
```tsx
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending || uploadingDiagrams}
            data-testid="button-save-template"
          >
            {uploadingDiagrams
              ? "Uploading Diagrams..."
              : saveMutation.isPending
              ? "Saving..."
              : template
              ? "Update Template"
              : "Create Template"}
          </Button>
```
becomes:
```tsx
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            data-testid="button-save-template"
          >
            {saveMutation.isPending
              ? "Saving..."
              : template
              ? "Update Template"
              : "Create Template"}
          </Button>
```

- [ ] **Step 7: Typecheck**

Run: `npm run check`
Expected: no errors in `damage-check-templates.tsx`. Watch specifically for any remaining reference to `topViewFile`, `frontViewFile`, `rearViewFile`, `sideViewFile`, `pendingDiagramPaths`, `effectiveDiagrams`, `uploadingDiagrams`, `topViewPreviewUrl`, or `template.diagramTopView`/etc — any leftover reference is a bug in this task's removal and must be cleaned up before moving on.

- [ ] **Step 8: Manual browser verification**

Open Documents → Damage Check → Template Library, edit a template whose make/model matches an uploaded `vehicleDiagramTemplates` entry (or create one via Documents → Damage Check → Diagram Templates first) — confirm the "Diagram Placement" panel shows that diagram and pin-placement still works (click to place a point, drag to reposition). Edit a template with no matching diagram — confirm the panel shows the updated placeholder text instead of crashing. Save a template and confirm no console errors and no `diagramTopView` etc. appear in the network request payload.

- [ ] **Step 9: Commit**

```bash
git add client/src/pages/settings/damage-check-templates.tsx
git commit -m "refactor: remove legacy 4-slot diagram upload, source diagram placement from matched vehicle diagram"
```

---

## Task 8: Documents page — trim "Damage Check" tab to templates-only

**Files:**
- Modify: `client/src/pages/documents/index.tsx:470` (tab label), `:1036-1041` (tab content), `:1247-1590` (`DamageCheckManager` function)

**Interfaces:**
- Consumes: none new — `documents` table and its existing `/api/documents`, `/api/documents/damage-checks` routes are untouched; completed damage-check PDFs continue to live there and remain fully visible/uploadable from the "Document Library" tab (already filters by vehicle/license plate and by document type, confirmed at `index.tsx:466-517`).
- Produces: no interface change for other tasks — this is a UI-only trim of one tab in one file, independent of Tasks 1-7.

Today, `DamageCheckManager` (current lines 1247-1590) does two unrelated things in one component: (a) renders the "Edit Fields" / "Template Library" / "Edit Layout" buttons and their dialogs — the template-management surface this whole plan is about — and (b) uploads and lists completed damage-check PDF documents, which is a narrower, redundant duplicate of what "Document Library" already shows (its `handleUpload` posts to the generic `POST /api/documents` with `documentType: 'damage_check'` and a `vehicleId`, current lines 1272-1305, so those PDFs already land in the same `documents` table the Document Library tab reads from). The user wants this tab to only be about templates — completed checks stay in Document Library, filtered by license plate, as they already can be today.

- [ ] **Step 1: Strip `DamageCheckManager` down to the template-management surface**

In `client/src/pages/documents/index.tsx`, rewrite the `DamageCheckManager` function (current lines 1247-1590). Remove:
- State: `selectedVehicleId`, `selectedReservationId`, `uploadFile`, `filterReservation`, `uploadDialogOpen`.
- The `damageChecks` query (`useQuery<Document[]>({ queryKey: ['/api/documents/damage-checks'] })`) and the `reservations` query.
- `uploadMutation`, `handleUpload`, `filteredChecks`.
- JSX: the "Upload Damage Check" button, the "Filter by Reservation" block, the "Damage Check List" block (the `filteredChecks.map(...)` section and its empty state), and the entire "Upload Dialog" (`<Dialog open={uploadDialogOpen} ...>`).

Keep: `isAdmin`/`user` (still gates "Edit Fields"), `fieldsDialogOpen`/`templatesDialogOpen`/`templateLibraryOpen` state, the "Edit Fields" / "Template Library" / "Edit Layout" buttons, and their three dialogs at the bottom of the function (current lines 1543-1587: the `DamageCheckFieldsPage`, `DamageCheckTemplateCanvasEditor`, `DamageCheckTemplatesPage` dialogs) — none of these are touched.

The component no longer needs a `vehicles` prop (it was only used by the removed upload dialog and list) — drop the `{ vehicles }: { vehicles: Vehicle[] }` parameter, making it `function DamageCheckManager() {`.

Update the `CardHeader` copy (current lines 1338-1346) from:
```tsx
            <CardTitle>Damage Check Documents</CardTitle>
            <CardDescription>
              Upload and manage damage check PDFs for vehicles and reservations
            </CardDescription>
```
to:
```tsx
            <CardTitle>Damage Check Templates</CardTitle>
            <CardDescription>
              Manage the fields, layout, and vehicle diagrams used to build damage check forms. Completed damage check PDFs are in the Document Library, filtered by vehicle.
            </CardDescription>
```

Remove the now-empty `<CardContent>` if nothing remains inside it (the "Filter by Reservation" and "Damage Check List" blocks were its only children) — the header's buttons and the trailing dialogs are enough; a `Card` with just a `CardHeader` and no `CardContent` is fine here (matches this file's `DiagramTemplateManager` pattern immediately below it, which also has `CardContent` only for its own grid — don't force an empty one).

- [ ] **Step 2: Update the call site**

Current lines 1036-1041:
```tsx
        <TabsContent value="damage-check">
          <div className="space-y-6">
            <DamageCheckManager vehicles={vehicles || []} />
            <DiagramTemplateManager />
          </div>
        </TabsContent>
```
becomes:
```tsx
        <TabsContent value="damage-check">
          <div className="space-y-6">
            <DamageCheckManager />
            <DiagramTemplateManager />
          </div>
        </TabsContent>
```

- [ ] **Step 3: Rename the tab label**

Current line 470:
```tsx
          <TabsTrigger value="damage-check">Damage Check</TabsTrigger>
```
becomes:
```tsx
          <TabsTrigger value="damage-check">Damage Check Templates</TabsTrigger>
```
(The `value="damage-check"` stays unchanged — only the visible label changes — so no other reference to this tab's identity breaks.)

- [ ] **Step 4: Typecheck**

Run: `npm run check`
Expected: no errors in `documents/index.tsx`. If `tsc` flags now-unused imports (e.g. `FileCheck`, `Eye`, `formatFileSize`, `formatDate` if they were only used by the removed list — check each is still used elsewhere in the file, e.g. by the Document Library tab, before removing it), remove only the ones actually unused; leave any still referenced elsewhere untouched.

- [ ] **Step 5: Manual browser verification**

Open the Documents page. Confirm the fourth tab now reads "Damage Check Templates" and its content shows only: Edit Fields / Template Library / Edit Layout buttons (each dialog still opens correctly) and the "Vehicle Diagram Templates" section below it — no upload-PDF button, no "Filter by Reservation", no completed-checks list. Switch to "Document Library", filter by a vehicle that has a damage-check PDF uploaded (or upload one via the generic "Upload Document" button with type "damage_check") — confirm it appears there, filterable by that vehicle's license plate.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/documents/index.tsx
git commit -m "refactor: trim Documents 'Damage Check' tab to templates-only, completed checks stay in Document Library"
```

---

## Task 9: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck and build**

Run: `npm run check`
Expected: no errors anywhere in the repo.

Run: `npm run build` (or the project's build script if named differently — check `package.json` `scripts`)
Expected: build succeeds.

- [ ] **Step 2: Default template shows a diagram out of the box**

`GET /api/damage-check-templates/default/template` — confirm `canvasFields` contains a `type: "diagram"` entry with `diagramTemplateId: null`.

- [ ] **Step 3: Live pickup/return flow unaffected**

Open the interactive damage check page for a vehicle whose make/model has an uploaded diagram, start a pickup check — confirm the vehicle diagram still loads and click-to-mark / freehand drawing still works exactly as before (this flow doesn't touch anything changed in this plan, but confirms no regression).

- [ ] **Step 4: Generate a real damage check PDF**

Complete or use an existing interactive damage check for a vehicle with a matched diagram, generate its PDF, and confirm the vehicle diagram (with damage annotations) appears in the output.

- [ ] **Step 5: DamageCheck canvas editor — background + diagram field together**

In Documents → Damage Check → Edit Layout: open the default template, confirm it already has a diagram field on the canvas; upload a background image via the new "Background" button and confirm it renders behind the fields; save, reload the page, and confirm both the background and the diagram field persisted.

- [ ] **Step 6: Legacy editor — no dead code paths**

In Documents → Damage Check → Template Library, open the legacy structured editor for a non-default template, confirm there is no "Vehicle Diagrams" upload section, confirm "Diagram Placement" works off the matched vehicle diagram, save successfully.

- [ ] **Step 7: Documents tab split holds together**

Confirm the "Damage Check Templates" tab (renamed in Task 8) shows only template-management UI, and that a damage-check PDF uploaded via "Document Library" → "Upload Document" (type "damage_check", a chosen vehicle) shows up there filtered by that vehicle's license plate.
