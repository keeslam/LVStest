# DamageCheck Template Unified Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the three separate damage-check template entry points (Edit Fields / Template Library / Edit Layout) into one dialog with two tabs, retire the legacy categories/inspectionPoints/handoverChecklist vocabulary in favor of `canvasFields`, remove the dead `damageCheckPdfTemplates` system, and surface header/footer text editing that's about to lose its only home.

**Architecture:** The gallery (`damage-check-templates.tsx`) becomes a thin list+lifecycle owner that, on "Edit", switches its own view to the canvas editor (`damage-check-template-editor.tsx`) for one template — no more separate dialogs, no more duplicate template pickers. A new lightweight `TemplateMetadataDialog` takes over the create/rename/vehicle-targeting job the deleted structured form used to do. A new `damage-check-template-studio.tsx` wraps the gallery and the relocated Fields page in two tabs behind one Documents-page button. Existing legacy template data is migrated into `canvasFields` before the old columns and renderer are dropped.

**Tech Stack:** React + TanStack Query + shadcn/ui (existing conventions, no new libraries), Express + Drizzle ORM, PostgreSQL via manual DDL (this repo's `drizzle-kit push` can't run non-interactively for column drop/rename ambiguity — same workaround used in the prior migration).

**Spec:** [docs/superpowers/specs/2026-08-22-damagecheck-template-unified-editor-design.md](../specs/2026-08-22-damagecheck-template-unified-editor-design.md)

## Global Constraints

- No test runner exists in this repo (no `test` script, no `*.test.*` files) — every task ends in a manual verification step against the running dev server, not an automated test, matching the prior `2026-08-21` plan's approach.
- `drizzle-kit push` requires a TTY for column drop/rename disambiguation. Apply schema changes with a one-off Node script using the `pg` package directly (pattern established in the prior migration), then confirm with `npx drizzle-kit push --force` reporting no remaining diff.
- Take a DB snapshot/backup before any column-drop step (Task 8) — it's one-way.
- Follow existing patterns exactly: `apiRequest`/`invalidateByPrefix` from `@/lib/queryClient`, shadcn `Dialog`/`Select`/`Button` components, `data-testid` on every interactive element, `useMutation`/`useQuery` from `@tanstack/react-query`.

---

## Task 1: Remove `damageCheckPdfTemplates` from the schema

**Files:**
- Modify: `shared/schema.ts:1567-1642` (delete `damageCheckPdfTemplates`, `damageCheckPdfTemplateVersions`, `damageCheckPdfTemplateThemes` table defs — read the file first to confirm current exact line numbers before deleting, since Task numbering in this plan doesn't shift file content until each task lands)
- Modify: `shared/schema.ts` (delete `damageCheckPdfSectionPresets` table def — locate via `grep -n "damageCheckPdfSectionPresets" shared/schema.ts`, it follows immediately after the Themes table)
- Create (temporary, delete after use): a scratch Node script to run the DDL

**Interfaces:**
- Produces: no more `damageCheckPdfTemplates`, `damageCheckPdfTemplateVersions`, `damageCheckPdfTemplateThemes`, `damageCheckPdfSectionPresets` exports from `shared/schema.ts`. Task 2 depends on these being gone so its route/storage deletions don't leave dangling imports.

- [ ] **Step 1: Locate and delete the four table definitions**

Run: `grep -n "^export const damageCheckPdfTemplates\|^export const damageCheckPdfTemplateVersions\|^export const damageCheckPdfTemplateThemes\|^export const damageCheckPdfSectionPresets\|^export type DamageCheckPdfSectionPreset\|^export const insertSectionPresetSchema" shared/schema.ts`

This gives the exact current line spans (they were `1567-1642`+ at spec-writing time, but confirm live). Delete each table's `pgTable(...)` block, its `insert...Schema` (`createInsertSchema(...)`), and its exported `type X = typeof ... $inferSelect` / `type InsertX = z.infer<...>` — for all four tables: `damageCheckPdfTemplates`, `damageCheckPdfTemplateVersions`, `damageCheckPdfTemplateThemes`, `damageCheckPdfSectionPresets`. Also delete the `TemplateSection` / `PdfTemplateSection`-shaped inline type block immediately above `damageCheckPdfTemplates` (the `sections: jsonb("sections").notNull().$type<TemplateSection[]>()` field references it) if — and only if — nothing else in `shared/schema.ts` still references that type after the four tables are gone (check with `grep -n "TemplateSection" shared/schema.ts` before deleting it).

- [ ] **Step 2: Typecheck to find every now-broken import**

Run: `npx tsc --noEmit 2>&1 | grep -i "damageCheckPdfTemplate\|SectionPreset\|TemplateSection"`

Expected: a list of files importing the now-deleted symbols (`server/database-storage.ts`, `server/routes.ts`, `server/pdf-damage-check-generator.ts`, `client/src/pages/documents/index.tsx`). Don't fix these yet — Task 2 does that. This step is just to confirm the schema deletion is complete and correctly scoped (if the grep comes back empty, you deleted too little or the symbols were unused, which would be surprising — double check).

- [ ] **Step 3: Write and run the DDL script**

Create a temporary file at the repo root, e.g. `_tmp_drop_pdf_templates.mjs`:

```javascript
import fs from 'fs';
import pg from 'pg';

for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) {
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

const sql = `
BEGIN;
DROP TABLE IF EXISTS damage_check_pdf_section_presets;
DROP TABLE IF EXISTS damage_check_pdf_template_versions;
DROP TABLE IF EXISTS damage_check_pdf_template_themes;
DROP TABLE IF EXISTS damage_check_pdf_templates;
COMMIT;
`;

try {
  await client.connect();
  await client.query(sql);
  console.log('Dropped damageCheckPdfTemplates family.');
} catch (err) {
  console.error('FAILED:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
```

Run: `node _tmp_drop_pdf_templates.mjs`
Expected: `Dropped damageCheckPdfTemplates family.`

Then delete the temp file: `rm _tmp_drop_pdf_templates.mjs`

- [ ] **Step 4: Confirm no drift remains**

Run: `npx drizzle-kit push --force`
Expected: `[✓] Changes applied` with no interactive prompt (if it prompts, the schema.ts deletion in Step 1 doesn't fully match what Step 3 dropped — reconcile before continuing).

- [ ] **Step 5: Commit**

```bash
git add shared/schema.ts
git commit -m "$(cat <<'EOF'
Drop damageCheckPdfTemplates family from schema

Dead sections/themes/presets system with no reachable UI — first step
of removing it entirely per the unified-editor spec.
EOF
)"
```

---

## Task 2: Remove `damageCheckPdfTemplates` server/client code

**Files:**
- Modify: `server/routes.ts` (delete route block, currently `11936-12399` — reconfirm via `grep -n 'app\.\(get\|post\|put\|delete\)("/api/damage-check-pdf-template' server/routes.ts` before editing since Task 1's edits don't shift this file's line numbers, but re-confirm anyway)
- Modify: `server/database-storage.ts` (delete storage methods block, currently `3671-3881`, plus the four import lines near the top, currently `24-27`)
- Modify: `server/pdf-damage-check-generator.ts:1362-2104` (`generateDamageCheckPDFWithTemplate`) — collapse to a two-way dispatch
- Modify: `client/src/pages/documents/index.tsx:2141-2502` (`DamageCheckPdfTemplateManager`) — delete, it's never rendered

**Interfaces:**
- Consumes: `generateDamageCheckPDFFromCanvas` (existing, `server/pdf-damage-check-generator.ts:148`) and `generateDamageCheckPDF` (existing, `server/pdf-damage-check-generator.ts:791`, removed later in Task 8) — both already defined, this task only changes what calls them.
- Produces: `generateDamageCheckPDFWithTemplate(vehicle, damageTemplate, reservationData?, interactiveDamageCheck?, inspectorName?): Promise<Buffer>` keeps its exact existing signature — nothing downstream (the ~10 call sites in `routes.ts`) needs to change.

- [ ] **Step 1: Delete the routes**

Run: `grep -n 'app\.\(get\|post\|put\|delete\)("/api/damage-check-pdf' server/routes.ts` to get the current first and last route line, then read that whole span with the Read tool to find its true end (the block ends right before the `// Serve object storage files` comment). Delete the entire span — every `app.get/post/put/delete("/api/damage-check-pdf-templates...` and `"/api/damage-check-pdf-template-versions...`, `"/api/damage-check-pdf-template-themes...`, `"/api/damage-check-pdf-section-presets...` handler.

- [ ] **Step 2: Delete the storage methods and imports**

Read `server/database-storage.ts` around the import block at the top (`grep -n "damageCheckPdfTemplate" server/database-storage.ts | head -5` to find it) and delete the four import lines (`damageCheckPdfTemplates`, `damageCheckPdfTemplateVersions`, `damageCheckPdfTemplateThemes`, `damageCheckPdfSectionPresets` plus their types).

Then find and delete the full storage-method block: `getAllDamageCheckPdfTemplates`, `getDamageCheckPdfTemplate`, `getDefaultDamageCheckPdfTemplate`, `createDamageCheckPdfTemplate`, `updateDamageCheckPdfTemplate`, `deleteDamageCheckPdfTemplate`, the seed-defaults helper that calls `createDamageCheckPdfTemplate`, `getTemplateVersions`, `createTemplateVersion`, `getTemplateVersion`, `deleteTemplateVersion` (or similarly named), `getAllTemplateThemes`, `getTemplateTheme`, `createTemplateTheme`, `updateTemplateTheme`, `deleteTemplateTheme`, `getAllSectionPresets`, `getSectionPreset`, `createSectionPreset`, `updateSectionPreset`, `deleteSectionPreset`, the usage-increment helper, and `duplicateTemplate`. Locate the exact span with `grep -n "DamageCheckPdfTemplate\|SectionPreset" server/database-storage.ts` — it's one contiguous block ending right before a `// Vehicle-Customer Blacklist methods` comment.

- [ ] **Step 3: Collapse the PDF-generation cascade**

Read `server/pdf-damage-check-generator.ts` from `generateDamageCheckPDFWithTemplate`'s `export async function` line to the end of the file. Replace the entire function body with:

```typescript
export async function generateDamageCheckPDFWithTemplate(
  vehicle: VehicleData,
  damageTemplate: DamageCheckTemplate,
  reservationData?: ReservationData,
  interactiveDamageCheck?: any,
  inspectorName?: string,
): Promise<Buffer> {
  if (damageTemplate && Array.isArray((damageTemplate as any).canvasFields) && (damageTemplate as any).canvasFields.length > 0) {
    return generateDamageCheckPDFFromCanvas(vehicle, damageTemplate, reservationData, interactiveDamageCheck, inspectorName);
  }
  return generateDamageCheckPDF(vehicle, damageTemplate, reservationData);
}
```

This removes the entire sections/theme rendering engine (the `header`/`contractInfo`/etc. `switch` and everything after it) along with the `damageCheckPdfTemplates` default-row lookup. Also delete any now-unused imports at the top of this file that only served the deleted code — check with `grep -n "damageCheckPdfTemplates\|PdfTemplateSection\|hexToRgb" server/pdf-damage-check-generator.ts` after the edit; if `hexToRgb` or similexplicitly-local helpers were defined only inside the deleted body, they're already gone with it (they were nested, not top-level, per the read-through — confirm with the same grep).

- [ ] **Step 4: Delete the dead client component**

Read `client/src/pages/documents/index.tsx` from `function DamageCheckPdfTemplateManager()` to the end of the file (it's the last top-level declaration). Delete the entire function. Then run `grep -n "DamageCheckPdfTemplateManager" client/src/pages/documents/index.tsx` — expect zero matches (it was never imported/rendered elsewhere, confirmed during investigation).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -i "damageCheckPdfTemplate\|SectionPreset"`
Expected: no output. If anything remains, find and remove it before continuing (likely a leftover import or a `storage.xyz` call site in a route not covered by Step 1 — search `grep -rn "damageCheckPdfTemplate\|SectionPreset\|duplicateTemplate\b" server/ client/src/` to be thorough).

- [ ] **Step 6: Manual verification**

Start the dev server, log in, open Documents → Damage Check tab, generate a PDF for any existing damage check with an existing template that has `canvasFields` (e.g. via the interactive damage check flow, or the "Generate Preview" button already in the canvas editor) — confirm it still renders correctly (this exercises the now-simplified `generateDamageCheckPDFWithTemplate`).

- [ ] **Step 7: Commit**

```bash
git add server/routes.ts server/database-storage.ts server/pdf-damage-check-generator.ts client/src/pages/documents/index.tsx
git commit -m "$(cat <<'EOF'
Remove damageCheckPdfTemplates routes, storage, and dead UI

Collapses the PDF-generation cascade from three paths (canvas /
sections-template fallback / legacy) to two (canvas / legacy), and
deletes the DamageCheckPdfTemplateManager component that was never
rendered anywhere.
EOF
)"
```

---

## Task 3: Migrate legacy vocabulary into `canvasFields`

**Files:**
- Create: `scripts/migrate-damage-check-legacy-fields.ts`

**Interfaces:**
- Consumes: `db` from `server/db.ts`, `damageCheckTemplates` from `shared/schema.ts`, `newId`/`defaultFieldFor`/`type CanvasField` from `shared/damage-check-default-layout.ts`.
- Produces: every existing `damageCheckTemplates` row that has legacy data (`categories`/`inspectionPoints`/`handoverChecklist` non-empty) and empty `canvasFields` gets `canvasFields` populated. Nothing else depends on this script's exports — it's run once, standalone.

- [ ] **Step 1: Write the migration script**

```typescript
// scripts/migrate-damage-check-legacy-fields.ts
//
// One-time migration: converts each damageCheckTemplates row's legacy
// categories/inspectionPoints/handoverChecklist into equivalent
// canvasFields entries. Templates that already have non-empty
// canvasFields are left alone. Run once via:
//   npx tsx scripts/migrate-damage-check-legacy-fields.ts
import { db } from '../server/db';
import { damageCheckTemplates } from '../shared/schema';
import { eq } from 'drizzle-orm';
import { newId, type CanvasField, type FieldType } from '../shared/damage-check-default-layout';

interface LegacyInspectionPoint {
  id: string;
  name: string;
  category: string;
  damageTypes: string[];
  position?: { x: number; y: number };
}
interface LegacyCategory {
  id: string;
  label: string;
  order: number;
}
interface LegacyHandoverItem {
  id: string;
  label: string;
  type: 'checkbox' | 'text';
  order: number;
}

function mkField(type: FieldType, x: number, y: number, name: string, extra: Partial<CanvasField> = {}): CanvasField {
  return {
    id: newId(),
    type,
    x,
    y,
    fontSize: 11,
    isBold: false,
    textAlign: 'left',
    page: 1,
    name,
    ...extra,
  };
}

function convertTemplate(
  categories: LegacyCategory[],
  inspectionPoints: LegacyInspectionPoint[],
  handoverChecklist: LegacyHandoverItem[],
): CanvasField[] {
  const out: CanvasField[] = [];
  const sortedCategories = [...categories].sort((a, b) => a.order - b.order);
  const pointsByCategory = new Map<string, LegacyInspectionPoint[]>();
  for (const p of inspectionPoints) {
    if (!pointsByCategory.has(p.category)) pointsByCategory.set(p.category, []);
    pointsByCategory.get(p.category)!.push(p);
  }

  // Grid fallback for points with no legacy `.position` — simple top-down
  // list, category by category, matching reading order.
  let gridY = 30;
  const GRID_X = 30;
  const ROW_H = 18;
  const HEAD_H = 22;

  for (const cat of sortedCategories) {
    const pts = pointsByCategory.get(cat.id) || [];
    if (pts.length === 0) continue;
    out.push(mkField('text', GRID_X, gridY, cat.label, { fontSize: 13, isBold: true }));
    gridY += HEAD_H;
    for (const p of pts) {
      if (p.position) {
        // Legacy position was a 0..1 fraction over the diagram image;
        // canvas coordinates are absolute PDF points on a 595x842 A4
        // page — place these inspection fields on the same fractional
        // spot on the page as a best-effort carry-over.
        const x = Math.round(p.position.x * 595);
        const y = Math.round(p.position.y * 842);
        out.push(mkField('inspection', x, y, p.name, { damageTypes: p.damageTypes }));
      } else {
        out.push(mkField('inspection', GRID_X, gridY, p.name, { damageTypes: p.damageTypes }));
        gridY += ROW_H;
      }
    }
    gridY += 8;
  }

  // Points with no category (shouldn't normally happen, but the legacy
  // schema didn't enforce it) — append at the end.
  const uncategorized = inspectionPoints.filter(p => !categories.some(c => c.id === p.category));
  for (const p of uncategorized) {
    out.push(mkField('inspection', GRID_X, gridY, p.name, { damageTypes: p.damageTypes }));
    gridY += ROW_H;
  }

  gridY += 10;
  const sortedHandover = [...handoverChecklist].sort((a, b) => a.order - b.order);
  for (const item of sortedHandover) {
    if (item.type === 'checkbox') {
      out.push(mkField('checkbox', GRID_X, gridY, item.label));
    } else {
      out.push(mkField('text', GRID_X, gridY, item.label));
    }
    gridY += ROW_H;
  }

  return out;
}

async function main() {
  const rows = await db.select().from(damageCheckTemplates);
  let migrated = 0;
  let skipped = 0;
  for (const row of rows) {
    const hasLegacyData =
      (row.categories && row.categories.length > 0) ||
      (row.inspectionPoints && row.inspectionPoints.length > 0) ||
      (row.handoverChecklist && row.handoverChecklist.length > 0);
    const hasCanvasFields = Array.isArray(row.canvasFields) && row.canvasFields.length > 0;

    if (!hasLegacyData || hasCanvasFields) {
      skipped++;
      continue;
    }

    const converted = convertTemplate(
      (row.categories as LegacyCategory[]) || [],
      (row.inspectionPoints as LegacyInspectionPoint[]) || [],
      (row.handoverChecklist as LegacyHandoverItem[]) || [],
    );

    await db.update(damageCheckTemplates)
      .set({ canvasFields: converted })
      .where(eq(damageCheckTemplates.id, row.id));

    console.log(`Migrated template ${row.id} ("${row.name}"): ${converted.length} canvasFields from ${(row.inspectionPoints || []).length} inspection points, ${(row.categories || []).length} categories, ${(row.handoverChecklist || []).length} handover items.`);
    migrated++;
  }
  console.log(`Done. Migrated ${migrated} templates, skipped ${skipped} (no legacy data or already has canvasFields).`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Run it against the dev database**

Run: `npx tsx scripts/migrate-damage-check-legacy-fields.ts`
Expected: one log line per migrated template plus a final `Done. Migrated N templates, skipped M ...` summary.

- [ ] **Step 3: Spot-check the results**

Run a quick read-only check for a couple of migrated template IDs (substitute real IDs from Step 2's output):

```bash
npx tsx -e "
import { db } from './server/db';
import { damageCheckTemplates } from './shared/schema';
import { eq } from 'drizzle-orm';
(async () => {
  const [t] = await db.select().from(damageCheckTemplates).where(eq(damageCheckTemplates.id, /* ID */ 1));
  console.log(JSON.stringify(t?.canvasFields, null, 2));
  process.exit(0);
})();
"
```

Expected: a `canvasFields` array whose `inspection`-type entries' `name`/`damageTypes` match what the template's old `inspectionPoints` had (cross-check against the migration log line printed in Step 2), and one `text` heading per category, one `checkbox`/`text` field per handover item.

- [ ] **Step 4: Manual UI check**

Open Documents → Damage Check tab → Template Library → Edit Layout for one of the migrated templates (still via the current three-button UI at this point in the plan — Task 5/6/7 haven't restructured it yet). Confirm the migrated fields appear on the canvas and look reasonable (not all stacked at the same point, no field off the A4 page bounds).

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate-damage-check-legacy-fields.ts
git commit -m "$(cat <<'EOF'
Add and run legacy-vocabulary-to-canvasFields migration

Converts categories/inspectionPoints/handoverChecklist into
equivalent canvasFields for every existing template that doesn't
already have a curated canvas layout, so the legacy columns and
renderer can be safely dropped in a later task.
EOF
)"
```

Note: this commits the script (for history/reproducibility) but the DB mutation it performed isn't part of the git diff — that already happened against the live dev database in Step 2.

---

## Task 4: `TemplateMetadataDialog` — replacement for the deleted create/edit-metadata form

**Files:**
- Modify: `client/src/pages/settings/damage-check-templates.tsx` (add new component, near `ClonePickerDialog`)

**Interfaces:**
- Produces: `TemplateMetadataDialog({ open, onOpenChange, template, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; template: DamageCheckTemplate | null; onSaved: (saved: DamageCheckTemplate) => void })` — `template: null` means create mode. Task 5 renders this and reacts to `onSaved`.

- [ ] **Step 1: Add `DialogFooter` to the existing dialog import and add the `Settings` icon import**

In `client/src/pages/settings/damage-check-templates.tsx`, change:

```typescript
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
```

to:

```typescript
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
```

and add `Settings` to the existing `lucide-react` import list (alongside `Plus, Edit, Trash2, ...`).

- [ ] **Step 2: Add the component**

Insert this new component right after `ClonePickerDialog` closes (before the `TemplateEditor` function — which Task 5 deletes anyway, so exact placement relative to it doesn't matter as long as it's a top-level function in this file):

```tsx
// ---------------------------------------------------------------------------
// Template metadata — create a template, or edit name/description/vehicle
// targeting/language for an existing one. Layout editing happens separately
// in the canvas editor; this dialog only owns the fields that used to live
// in the deleted structured "Edit Template" form's top section.
// ---------------------------------------------------------------------------

function TemplateMetadataDialog({
  open,
  onOpenChange,
  template,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: DamageCheckTemplate | null;
  onSaved: (saved: DamageCheckTemplate) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [buildYearFrom, setBuildYearFrom] = useState("");
  const [buildYearTo, setBuildYearTo] = useState("");
  const [language, setLanguage] = useState<"nl" | "en">("nl");

  useEffect(() => {
    if (!open) return;
    setName(template?.name || "");
    setDescription(template?.description || "");
    setVehicleMake(template?.vehicleMake || "");
    setVehicleModel(template?.vehicleModel || "");
    setVehicleType(template?.vehicleType || "");
    setBuildYearFrom(template?.buildYearFrom || "");
    setBuildYearTo(template?.buildYearTo || "");
    setLanguage((template?.language as "nl" | "en") || "nl");
  }, [open, template]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const data = {
        name: name.trim(),
        description: description.trim() || null,
        vehicleMake: vehicleMake.trim() || null,
        vehicleModel: vehicleModel.trim() || null,
        vehicleType: vehicleType || null,
        buildYearFrom: buildYearFrom.trim() || null,
        buildYearTo: buildYearTo.trim() || null,
        language,
      };
      const url = template
        ? `/api/damage-check-templates/${template.id}`
        : "/api/damage-check-templates";
      const method = template ? "PUT" : "POST";
      const res = await apiRequest(method, url, data);
      return res.json();
    },
    onSuccess: (saved: DamageCheckTemplate) => {
      invalidateByPrefix("/api/damage-check-templates");
      toast({
        title: "Success",
        description: template ? "Template updated" : "Template created",
      });
      onOpenChange(false);
      onSaved(saved);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save template",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template ? "Template Settings" : "Create Template"}</DialogTitle>
          <DialogDescription>
            Name, description, and vehicle targeting. Field layout is edited separately.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="tmd-name">Name</Label>
            <Input
              id="tmd-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="input-metadata-name"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tmd-description">Description</Label>
            <Textarea
              id="tmd-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              data-testid="input-metadata-description"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="tmd-make">Vehicle Make</Label>
              <Input
                id="tmd-make"
                value={vehicleMake}
                onChange={(e) => setVehicleMake(e.target.value)}
                placeholder="e.g., Toyota"
                data-testid="input-metadata-make"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tmd-model">Vehicle Model</Label>
              <Input
                id="tmd-model"
                value={vehicleModel}
                onChange={(e) => setVehicleModel(e.target.value)}
                placeholder="e.g., Camry"
                data-testid="input-metadata-model"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="tmd-type">Vehicle Type</Label>
              <Select
                value={vehicleType || "all"}
                onValueChange={(v) => setVehicleType(v === "all" ? "" : v)}
              >
                <SelectTrigger id="tmd-type" data-testid="select-metadata-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any</SelectItem>
                  <SelectItem value="sedan">Sedan</SelectItem>
                  <SelectItem value="suv">SUV</SelectItem>
                  <SelectItem value="van">Van</SelectItem>
                  <SelectItem value="truck">Truck</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="tmd-year-from">Build Year From</Label>
              <Input
                id="tmd-year-from"
                value={buildYearFrom}
                onChange={(e) => setBuildYearFrom(e.target.value)}
                placeholder="2015"
                data-testid="input-metadata-year-from"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tmd-year-to">Build Year To</Label>
              <Input
                id="tmd-year-to"
                value={buildYearTo}
                onChange={(e) => setBuildYearTo(e.target.value)}
                placeholder="2020"
                data-testid="input-metadata-year-to"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="tmd-language">Language</Label>
            <Select value={language} onValueChange={(v) => setLanguage(v as "nl" | "en")}>
              <SelectTrigger id="tmd-language" data-testid="select-metadata-language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nl">Dutch (NL)</SelectItem>
                <SelectItem value="en">English (EN)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => name.trim() && saveMutation.mutate()}
            disabled={!name.trim() || saveMutation.isPending}
            data-testid="button-save-metadata"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            {template ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "damage-check-templates.tsx"`
Expected: no new errors introduced by this addition (the file overall may still show pre-existing unrelated errors from before this plan — compare against a baseline run if unsure).

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/settings/damage-check-templates.tsx
git commit -m "$(cat <<'EOF'
Add TemplateMetadataDialog

Lightweight create/edit-metadata dialog (name, description, vehicle
targeting, language) to replace the metadata section of the
structured "Edit Template" form before it's deleted in the next task.
EOF
)"
```

---

## Task 5: Restructure the gallery to switch into the canvas editor

**Files:**
- Modify: `client/src/pages/settings/damage-check-templates.tsx`

**Interfaces:**
- Consumes: `TemplateMetadataDialog` (Task 4), `DamageCheckTemplateCanvasEditor` (Task 6 changes its prop signature to accept `templateId`/`onBack` — this task's edits assume that signature exists, so land Task 6 first if working sequentially, or coordinate if working in parallel).
- Produces: `DamageCheckTemplates({ embedded }: { embedded?: boolean })` keeps its existing default export signature — Task 7's Studio shell renders it unchanged.

- [ ] **Step 1: Delete the legacy sub-components**

Delete, in this file:
- `DiagramPlacementPanel` (find current span via `grep -n "^function DiagramPlacementPanel" client/src/pages/settings/damage-check-templates.tsx` and read to its closing `}` before the `// ---... Templates list page` comment)
- `TemplateEditor` (from `function TemplateEditor(` to right before `function InspectionPointEditor(`)
- `InspectionPointEditor` (from its `function` line to right before `function BulkAddDialog(`)
- `BulkAddDialog` (from its `function` line to end of file)

Also delete `SortableRow` (it's used only by the three components just deleted — confirm with `grep -n "SortableRow" client/src/pages/settings/damage-check-templates.tsx` after deleting the above; if the only remaining match is its own `function SortableRow(` line, delete that too).

- [ ] **Step 2: Add view-mode state and imports**

Add to the top-level imports:

```typescript
import DamageCheckTemplateCanvasEditor from "@/pages/settings/damage-check-template-editor";
```

Inside `export default function DamageCheckTemplates({ embedded = false }: ...)`, add alongside the existing `useState` calls:

```typescript
const [viewMode, setViewMode] = useState<"list" | "edit">("list");
const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);
const [metadataDialogOpen, setMetadataDialogOpen] = useState(false);
const [metadataTemplate, setMetadataTemplate] = useState<DamageCheckTemplate | null>(null);
```

- [ ] **Step 3: Rewire the create/edit handlers**

Replace:

```typescript
const handleCreateNew = () => {
  setEditingTemplate(null);
  setEditorOpen(true);
};

const handleEdit = (template: DamageCheckTemplate) => {
  setEditingTemplate(template);
  setEditorOpen(true);
};
```

with:

```typescript
const handleCreateNew = () => {
  setMetadataTemplate(null);
  setMetadataDialogOpen(true);
};

const handleEditMetadata = (template: DamageCheckTemplate) => {
  setMetadataTemplate(template);
  setMetadataDialogOpen(true);
};

const handleEdit = (template: DamageCheckTemplate) => {
  setEditingTemplateId(template.id);
  setViewMode("edit");
};
```

Also delete the now-unused `editorOpen`/`editingTemplate` state declarations (`const [editorOpen, setEditorOpen] = useState(false);` and `const [editingTemplate, setEditingTemplate] = useState<DamageCheckTemplate | null>(null);`).

- [ ] **Step 4: Add an early return for edit mode**

Immediately before the component's existing `return (` (the one that renders the gallery grid, `<div className={embedded ? ...}>`), add:

```tsx
if (viewMode === "edit" && editingTemplateId != null) {
  return (
    <DamageCheckTemplateCanvasEditor
      embedded
      templateId={editingTemplateId}
      onBack={() => {
        setViewMode("list");
        setEditingTemplateId(null);
      }}
    />
  );
}
```

- [ ] **Step 5: Add the Settings button to each gallery card and wire the metadata dialog**

In the card's action row (the `<div className="flex gap-2 pt-2 flex-wrap">` block with the Edit/Set Default/Export/Delete buttons), add a new button right after "Edit":

```tsx
<Button
  variant="outline"
  size="sm"
  onClick={() => handleEditMetadata(template)}
  data-testid={`button-settings-template-${template.id}`}
  title="Template settings"
>
  <Settings className="h-3.5 w-3.5" />
</Button>
```

Replace the old `{editorOpen && (<TemplateEditor .../>)}` render block (now deleted along with `TemplateEditor`) with:

```tsx
<TemplateMetadataDialog
  open={metadataDialogOpen}
  onOpenChange={setMetadataDialogOpen}
  template={metadataTemplate}
  onSaved={(saved) => {
    if (!metadataTemplate) {
      // Just created — jump straight into the canvas editor for it.
      setEditingTemplateId(saved.id);
      setViewMode("edit");
    }
  }}
/>
```

- [ ] **Step 6: Clean up now-unused imports**

Run: `npx tsc --noEmit 2>&1 | grep "damage-check-templates.tsx"` — TypeScript doesn't flag unused imports by default, so also manually check each of these symbols with `grep -c "\bSYMBOL\b" client/src/pages/settings/damage-check-templates.tsx` (count of 1 means only the import line remains, safe to delete): `DAMAGE_TYPES`, `DndContext`, `closestCenter`, `closestCorners`, `KeyboardSensor`, `PointerSensor`, `useSensor`, `useSensors`, `DragEndEvent`, `DragOverEvent`, `DragStartEvent`, `DragOverlay`, `arrayMove`, `SortableContext`, `sortableKeyboardCoordinates`, `useSortable`, `verticalListSortingStrategy`, `CSS` (from `@dnd-kit/utilities`), `GripVertical`, `MapPin`, `X`, `ClipboardList`, `Eye`, `EyeOff`. Remove any whose count is 1.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "damage-check-templates.tsx"`
Expected: no errors from this file (pre-existing unrelated repo-wide errors elsewhere are fine — see Task 6's baseline note).

- [ ] **Step 8: Manual verification**

Start the dev server. Open Documents → Damage Check tab → Template Library. Confirm: gallery grid still renders, "Create Template" opens the new metadata dialog and creating one switches straight into the canvas editor, each card's gear icon opens metadata edit, each card's "Edit" button switches into the canvas editor for that template with a working "back" affordance, Set Default / Export / Delete / Clone-from-existing / Import still all work unchanged.

- [ ] **Step 9: Commit**

```bash
git add client/src/pages/settings/damage-check-templates.tsx
git commit -m "$(cat <<'EOF'
Retire the structured Edit Template form, switch gallery into canvas editor

Deletes TemplateEditor/InspectionPointEditor/BulkAddDialog/
DiagramPlacementPanel (superseded by canvas drag-and-drop) and
TemplateMetadataDialog now owns creation and metadata edits. The
gallery's "Edit" button switches its own view into the canvas editor
for the selected template instead of opening a separate dialog.
EOF
)"
```

---

## Task 6: Canvas editor — external `templateId`, header/footer text, Fields palette

**Files:**
- Modify: `client/src/pages/settings/damage-check-template-editor.tsx`

**Interfaces:**
- Produces: `DamageCheckTemplateCanvasEditor({ embedded, templateId, onBack }: { embedded?: boolean; templateId?: number | null; onBack?: () => void })`. When `templateId` is provided, the component loads that template directly and hides its own internal template-picker chrome (the picker/New/Delete controls that used to own template selection now belong to the gallery). When `templateId` is omitted (e.g. if this component is ever reached some other way), it falls back to today's internal-picker behavior — nothing regresses for any caller not yet updated.

- [ ] **Step 1: Extend the prop signature and auto-load by `templateId`**

Change:

```typescript
export default function DamageCheckTemplateCanvasEditor({ embedded = false }: { embedded?: boolean } = {}) {
```

to:

```typescript
export default function DamageCheckTemplateCanvasEditor({
  embedded = false,
  templateId = null,
  onBack,
}: { embedded?: boolean; templateId?: number | null; onBack?: () => void } = {}) {
```

Add a new `useEffect` right after the existing "Parse ?id= from URL once templates load" effect:

```typescript
// External templateId prop (from the gallery) takes priority over the
// legacy ?id= URL param / internal picker.
useEffect(() => {
  if (templateId != null && templates.length > 0 && currentId !== templateId) {
    const t = templates.find(x => x.id === templateId);
    if (t) loadTemplate(t);
  }
}, [templateId, templates]);
```

- [ ] **Step 2: Hide the internal picker chrome when driven externally**

In the "Template selection bar" `<Card>` block, wrap the `<Select>` template-picker and the "New" button in `{templateId == null && (...)}`:

```tsx
{templateId == null && (
  <div className="flex-1 min-w-[200px] space-y-1.5">
    <Label className="text-xs">Template</Label>
    <Select
      value={currentId?.toString() ?? ''}
      onValueChange={(v) => {
        const t = templates.find(x => x.id.toString() === v);
        if (t) loadTemplate(t);
      }}
    >
      <SelectTrigger data-testid="select-template"><SelectValue placeholder={isLoading ? 'Loading…' : 'Select template'} /></SelectTrigger>
      <SelectContent>
        {templates.map(t => (
          <SelectItem key={t.id} value={t.id.toString()}>
            {t.name}{t.isDefault ? ' (Default)' : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
)}
```

(Keep the `<div className="flex-1 ...">` wrapper structure identical — only add the surrounding conditional. If `templateId != null`, add a small `<div>` showing the current template's name as plain text instead, so the toolbar isn't empty: `{templateId != null && currentTemplate && (<div className="flex-1 min-w-[200px]"><p className="text-sm font-medium">{currentTemplate.name}</p></div>)}`.)

Similarly wrap the `createOpen` Dialog/"New" button (`{templateId == null && (<Dialog open={createOpen} ...>...</Dialog>)}`) and the "Delete" button (`{templateId == null && (<Button variant="destructive" ...>Delete</Button>)}`) — deleting a template is now the gallery's job (its own delete-confirmation flow, already present in the gallery grid).

Add a "Back" button when `onBack` is provided, next to the (hidden-or-not) template name, e.g. right before the "Undo" button:

```tsx
{onBack && (
  <Button variant="ghost" size="sm" onClick={onBack} data-testid="button-back-to-gallery">
    <ArrowLeft className="h-4 w-4 mr-1" /> Back to templates
  </Button>
)}
```

- [ ] **Step 3: Add `headerText`/`footerText` state and inputs**

Add to the `Template` interface at the top of the file:

```typescript
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
  headerText?: string | null;
  footerText?: string | null;
}
```

Add state alongside `language`:

```typescript
const [headerText, setHeaderText] = useState('');
const [footerText, setFooterText] = useState('');
```

In `loadTemplate(t: Template)`, add:

```typescript
setHeaderText(t.headerText || '');
setFooterText(t.footerText || '');
```

In `saveMutation`'s `mutationFn`, add `headerText, footerText` to the PUT body:

```typescript
const res = await apiRequest('PUT', `/api/damage-check-templates/${currentId}`, {
  name, description, language, canvasFields: fieldsRef.current, headerText, footerText,
});
```

In `handleGeneratePreview`'s request body, add the same two fields (the endpoint already reads them per `server/routes.ts:10494-10495` — this is the client-side gap being closed):

```typescript
body: JSON.stringify({
  name: name || 'Preview',
  description, language,
  canvasFields: fields,
  headerText, footerText,
  inspectionPoints: [], categories: [], handoverChecklist: [],
}),
```

Add two inputs in the "Template selection bar" `<Card>`'s metadata row (the `{currentId && (<div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">...)}` block), extending it to a 5-column grid on larger screens:

```tsx
{currentId && (
  <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-3">
    <div className="space-y-1.5"><Label className="text-xs">Name</Label><Input value={name} onChange={e => setName(e.target.value)} data-testid="input-template-name" /></div>
    <div className="space-y-1.5"><Label className="text-xs">Description</Label><Input value={description} onChange={e => setDescription(e.target.value)} data-testid="input-template-description" /></div>
    <div className="space-y-1.5">
      <Label className="text-xs">Language</Label>
      <Select value={language} onValueChange={(v) => setLanguage(v as 'nl' | 'en')}>
        <SelectTrigger data-testid="select-language"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="nl">Dutch (NL)</SelectItem>
          <SelectItem value="en">English (EN)</SelectItem>
        </SelectContent>
      </Select>
    </div>
    <div className="space-y-1.5"><Label className="text-xs">Header text</Label><Input value={headerText} onChange={e => setHeaderText(e.target.value)} placeholder="Printed at the top of every page" data-testid="input-header-text" /></div>
    <div className="space-y-1.5"><Label className="text-xs">Footer text</Label><Input value={footerText} onChange={e => setFooterText(e.target.value)} placeholder="Printed at the bottom of every page" data-testid="input-footer-text" /></div>
  </div>
)}
```

- [ ] **Step 4: Add the Fields-config drag-from palette**

In the "Add Field" left palette `<Card>`, add a new section below the existing static field-type buttons and above "Insert Default Layout":

```tsx
{damageCheckFields.groups.length > 0 && (
  <>
    <Separator />
    <p className="text-xs font-medium text-muted-foreground px-1">From Fields config</p>
    <div className="space-y-1 max-h-48 overflow-y-auto">
      {damageCheckFields.groups.flatMap(group =>
        group.fields.map(f => (
          <Button
            key={`${group.id}.${f.key}`}
            variant="ghost"
            size="sm"
            className="w-full justify-start text-xs"
            onClick={() => {
              const type: FieldType = f.inputType === 'checkbox' ? 'checkbox' : 'inspection';
              const base = defaultFieldFor(type, 60, 60 + fields.length * 22);
              const field: CanvasField = {
                ...base,
                name: f.label,
                source: f.key,
                ...(type === 'inspection' ? { damageTypes: f.options } : {}),
              };
              updateFields([...fields, field]);
              setSelectedIds([field.id]);
            }}
            data-testid={`button-add-fromfields-${group.id}-${f.key}`}
          >
            {f.inputType === 'checkbox' ? <CheckSquare className="h-3.5 w-3.5 mr-2" /> : <ClipboardList className="h-3.5 w-3.5 mr-2" />}
            {group.label}: {f.label}
          </Button>
        ))
      )}
    </div>
  </>
)}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "damage-check-template-editor.tsx"`
Expected: no errors from this file.

- [ ] **Step 6: Manual verification**

Start the dev server (or reuse a running one). Reach the canvas editor via the (still three-button, pre-Task-7) Documents → Damage Check → "Edit Layout" dialog: confirm the internal picker still works (since `templateId` is omitted from that call site until Task 7 rewires it). Separately, once Task 5 is also in place, reach it via the gallery's "Edit" button and confirm: no internal picker/New/Delete shown, "Back to templates" returns to the gallery, header/footer inputs save and round-trip on reload, a field dragged in from the new Fields-config palette section appears on the canvas with the right label and (for inspection-type) damage types, "Generate Preview" output includes the header/footer text.

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/settings/damage-check-template-editor.tsx
git commit -m "$(cat <<'EOF'
Canvas editor: external templateId, header/footer text, Fields palette

Accepts an externally-driven templateId (from the gallery) and hides
its own picker/create/delete chrome when present. Adds headerText/
footerText inputs (relocated from the deleted structured form) wired
into save and preview. Adds a palette section sourced from the
damage-check-fields config so defined checklist fields can be dragged
onto the canvas one at a time.
EOF
)"
```

---

## Task 7: Unified Studio shell

**Files:**
- Create: `client/src/pages/settings/damage-check-template-studio.tsx`
- Modify: `client/src/pages/documents/index.tsx` (`DamageCheckManager`, currently `1247-1342`)

**Interfaces:**
- Produces: `DamageCheckTemplateStudio({ embedded }: { embedded?: boolean })`, default export.
- Consumes: `DamageCheckTemplates` (Task 5's default export, unchanged signature), `DamageCheckFieldsPage` (existing, unchanged).

- [ ] **Step 1: Create the Studio shell**

```tsx
// client/src/pages/settings/damage-check-template-studio.tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DamageCheckTemplates from "@/pages/settings/damage-check-templates";
import DamageCheckFieldsPage from "@/pages/settings/damage-check-fields";

export default function DamageCheckTemplateStudio({ embedded = false }: { embedded?: boolean } = {}) {
  return (
    <div className={embedded ? "flex flex-col h-full" : "container mx-auto p-6"}>
      <Tabs defaultValue="templates" className="flex flex-col h-full">
        <TabsList className="grid w-full grid-cols-2 flex-shrink-0">
          <TabsTrigger value="templates" data-testid="tab-studio-templates">Templates</TabsTrigger>
          <TabsTrigger value="fields" data-testid="tab-studio-fields">Fields</TabsTrigger>
        </TabsList>
        <TabsContent value="templates" className="flex-1 overflow-auto">
          <DamageCheckTemplates embedded />
        </TabsContent>
        <TabsContent value="fields" className="flex-1 overflow-auto">
          <DamageCheckFieldsPage embedded />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 2: Replace the three-button `DamageCheckManager` with one button + one dialog**

In `client/src/pages/documents/index.tsx`, add the import:

```typescript
import DamageCheckTemplateStudio from "@/pages/settings/damage-check-template-studio";
```

Replace the entire `DamageCheckManager` function body with:

```tsx
function DamageCheckManager() {
  const [studioOpen, setStudioOpen] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Damage Check Templates</CardTitle>
            <CardDescription>
              Manage the fields, layout, and checklist vocabulary used to build damage check forms. Completed damage check PDFs are in the Document Library, filtered by vehicle. Vehicle diagrams are managed below.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            onClick={() => setStudioOpen(true)}
            data-testid="button-open-damage-check-studio"
          >
            <SettingsIcon className="mr-2 h-4 w-4" />
            Damage Check Templates
          </Button>
        </div>
      </CardHeader>

      <Dialog open={studioOpen} onOpenChange={setStudioOpen}>
        <DialogContent className="max-w-[98vw] w-[98vw] max-h-[98vh] h-[98vh] flex flex-col p-0 gap-0" data-testid="dialog-damage-check-studio">
          <DialogHeader className="px-4 py-2 border-b">
            <DialogTitle>Damage Check Templates</DialogTitle>
            <DialogDescription className="sr-only">
              Manage damage check templates, their layout, and the checklist field vocabulary.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-hidden bg-background">
            {studioOpen && <DamageCheckTemplateStudio embedded />}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
```

Note `DiagramTemplateManager` (the very next function in the file) is untouched and keeps rendering as its own sibling `<Card>` in the Documents page's `damage-check` tab — nothing here changes how it's reached.

- [ ] **Step 3: Remove now-unused imports in `documents/index.tsx`**

`DamageCheckTemplatesPage`, `DamageCheckTemplateCanvasEditor`, and `DamageCheckFieldsPage` were previously imported directly into `documents/index.tsx` for the three old dialogs — now they're only used inside `damage-check-template-studio.tsx`. Run `grep -n "DamageCheckTemplatesPage\|DamageCheckTemplateCanvasEditor\|DamageCheckFieldsPage" client/src/pages/documents/index.tsx`; if the only remaining occurrences are the `import` lines themselves, delete those three import lines.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "documents/index.tsx\|damage-check-template-studio.tsx"`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Start the dev server. Documents → Damage Check tab now shows exactly one "Damage Check Templates" button (not three) plus the untouched `DiagramTemplateManager` panel below it. Clicking it opens one dialog with "Templates"/"Fields" tabs. Full flow: Templates tab → Create Template → fill metadata → lands in canvas editor → add a field from the Fields palette → Back to templates → gear icon edits metadata → Edit reopens canvas editor for that template. Fields tab still lets you add/edit a checklist field definition, and it shows up in the Templates tab's palette after switching tabs (a query refetch on tab switch is fine — no need for real-time sync between tabs).

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/settings/damage-check-template-studio.tsx client/src/pages/documents/index.tsx
git commit -m "$(cat <<'EOF'
Add unified Damage Check Templates studio, collapse 3 buttons to 1

Documents -> Damage Check tab now opens one dialog with Templates/
Fields tabs instead of three separate dialogs (Edit Fields/Template
Library/Edit Layout). DiagramTemplateManager stays exactly where it
is, unchanged, per explicit direction (higher-frequency workflow).
EOF
)"
```

---

## Task 8: Remove the legacy PDF renderer and legacy columns

**Files:**
- Modify: `server/pdf-damage-check-generator.ts` (delete `generateDamageCheckPDF`, currently `791-1321`; simplify `generateDamageCheckPDFWithTemplate`'s fallback)
- Modify: `shared/schema.ts` (drop `categories`, `inspectionPoints`, `handoverChecklist` fields from `damageCheckTemplates`)
- Create (temporary): DDL script for the column drop

**Interfaces:**
- Produces: `generateDamageCheckPDFWithTemplate` now calls `generateDamageCheckPDFFromCanvas` unconditionally — no fallback branch remains, since Task 3's migration guarantees every template has `canvasFields`.

- [ ] **Step 1: Confirm migration coverage before deleting anything**

Run a read-only check against every template:

```bash
npx tsx -e "
import { db } from './server/db';
import { damageCheckTemplates } from './shared/schema';
(async () => {
  const rows = await db.select().from(damageCheckTemplates);
  const missing = rows.filter(r => !Array.isArray(r.canvasFields) || r.canvasFields.length === 0);
  console.log('Templates with empty canvasFields:', missing.map(r => ({ id: r.id, name: r.name })));
  process.exit(0);
})();
"
```

Expected: an empty array. If any templates show up, they had no legacy data to convert either (a genuinely blank template) — decide whether to seed them with `buildDefaultDamageCheckCanvasFields()` before continuing, since after this task's column drop there's no more legacy fallback to render them at all.

- [ ] **Step 2: Simplify the PDF-generation entry point**

In `server/pdf-damage-check-generator.ts`, change `generateDamageCheckPDFWithTemplate` (already collapsed once in Task 2, Step 3) from:

```typescript
export async function generateDamageCheckPDFWithTemplate(
  vehicle: VehicleData,
  damageTemplate: DamageCheckTemplate,
  reservationData?: ReservationData,
  interactiveDamageCheck?: any,
  inspectorName?: string,
): Promise<Buffer> {
  if (damageTemplate && Array.isArray((damageTemplate as any).canvasFields) && (damageTemplate as any).canvasFields.length > 0) {
    return generateDamageCheckPDFFromCanvas(vehicle, damageTemplate, reservationData, interactiveDamageCheck, inspectorName);
  }
  return generateDamageCheckPDF(vehicle, damageTemplate, reservationData);
}
```

to:

```typescript
export async function generateDamageCheckPDFWithTemplate(
  vehicle: VehicleData,
  damageTemplate: DamageCheckTemplate,
  reservationData?: ReservationData,
  interactiveDamageCheck?: any,
  inspectorName?: string,
): Promise<Buffer> {
  return generateDamageCheckPDFFromCanvas(vehicle, damageTemplate, reservationData, interactiveDamageCheck, inspectorName);
}
```

Then delete the entire `generateDamageCheckPDF` function (its `export async function generateDamageCheckPDF(` line through the line right before `function applyHeaderFooterOverlay(`).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "pdf-damage-check-generator.ts"`
Expected: no errors. If any call site elsewhere still calls `generateDamageCheckPDF` directly (not through `generateDamageCheckPDFWithTemplate`), find it with `grep -rn "generateDamageCheckPDF\b" server/` (note the word-boundary — this excludes `generateDamageCheckPDFWithTemplate`/`generateDamageCheckPDFFromCanvas`) and update it to call `generateDamageCheckPDFWithTemplate` instead, or `generateDamageCheckPDFFromCanvas` directly if it already has a canvas-mode template in hand.

- [ ] **Step 4: Drop the legacy columns from the schema**

In `shared/schema.ts`, inside the `damageCheckTemplates` table definition, delete the `inspectionPoints`, `categories`, and `handoverChecklist` jsonb column definitions (the three large `.jsonb(...).$type<Array<{...}>>().default([]).notNull()` blocks).

- [ ] **Step 5: Write and run the DDL**

```javascript
// _tmp_drop_legacy_columns.mjs
import fs from 'fs';
import pg from 'pg';

for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) {
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

const sql = `
BEGIN;
ALTER TABLE damage_check_templates
  DROP COLUMN IF EXISTS inspection_points,
  DROP COLUMN IF EXISTS categories,
  DROP COLUMN IF EXISTS handover_checklist;
COMMIT;
`;

try {
  await client.connect();
  await client.query(sql);
  console.log('Dropped legacy columns from damage_check_templates.');
} catch (err) {
  console.error('FAILED:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
```

Run: `node _tmp_drop_legacy_columns.mjs`, then `rm _tmp_drop_legacy_columns.mjs`.

- [ ] **Step 6: Confirm no drift and re-typecheck**

Run: `npx drizzle-kit push --force`
Expected: `[✓] Changes applied`, no prompt.

Run: `npx tsc --noEmit 2>&1 | grep "inspectionPoints\|handoverChecklist\|categories.*TemplateCategory\|DamageCheckTemplate"`
Expected: nothing pointing at `shared/schema.ts`'s `damageCheckTemplates` fields — any hit here means a client or server file still references the dropped columns and needs fixing (check `client/src/pages/settings/damage-check-templates.tsx`'s local `DamageCheckTemplate`/`InspectionPoint`/`TemplateCategory`/`HandoverChecklistItem` interfaces — Task 5 already deleted the components that used them, but the interface declarations themselves may still be sitting unused at the top of the file; delete them too if so, along with `DEFAULT_CATEGORIES`/`getCategoryColor`/`getCategoryLabel`/`CATEGORY_COLORS` if the gallery card display was also simplified to stop showing category badges — check whether Task 5's card JSX still references `template.categories`/`template.inspectionPoints`/`template.handoverChecklist` and simplify that display to drop those stats if so, since the fields no longer exist on the type).

- [ ] **Step 7: Manual verification**

Start the dev server. Generate a PDF for a damage check via the interactive flow for a vehicle with a matched diagram — confirm the canvas-rendered PDF still comes out correctly (this now exercises the fully-simplified `generateDamageCheckPDFWithTemplate` with no fallback). Confirm the gallery in Documents → Damage Check Templates → Templates still loads without errors (no attempt to read the dropped columns).

- [ ] **Step 8: Commit**

```bash
git add server/pdf-damage-check-generator.ts shared/schema.ts client/src/pages/settings/damage-check-templates.tsx
git commit -m "$(cat <<'EOF'
Remove legacy PDF renderer and legacy template columns

generateDamageCheckPDF and the categories/inspectionPoints/
handoverChecklist columns are gone now that every template has been
migrated to canvasFields (Task 3) and no UI writes the legacy
vocabulary any more (Task 5). generateDamageCheckPDFWithTemplate
always renders through the canvas path.
EOF
)"
```

---

## Task 9: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit`
Compare the error count/list against the pre-plan baseline (691 pre-existing errors, unrelated to this work, confirmed at the start of this session) — expect the same baseline errors and nothing new.

- [ ] **Step 2: Fresh-template flow**

Documents → Damage Check Templates → Templates tab → Create Template → fill in name/vehicle targeting → lands in canvas editor → Insert Default Layout (or add a couple of fields manually, including one from the Fields palette) → set header/footer text → Generate Preview (confirm header/footer appear in the rendered PDF) → Save → Back to templates → confirm the new template's card shows up in the gallery with correct vehicle-targeting badges.

- [ ] **Step 3: Existing/migrated-template flow**

Open a template that existed before this plan (migrated in Task 3) via Edit — confirm its converted fields are present and sensibly laid out, edit one, save, reload the dialog, confirm it persisted.

- [ ] **Step 4: Fields tab round-trip**

Fields tab → add a new checklist field definition to any group → switch to Templates tab → open a template's canvas editor → confirm the new field appears in the Fields-config palette section and can be dragged onto the canvas.

- [ ] **Step 5: Live pickup/return flow unaffected**

Start a pickup or return interactive damage check for a vehicle with a matched diagram (unrelated to this plan's changes) — confirm diagram auto-match, click-to-mark, freehand drawing, and final PDF generation all still work exactly as before.

- [ ] **Step 6: Diagram library untouched**

Confirm `DiagramTemplateManager` still renders inline on the Documents → Damage Check tab (not inside the new Studio dialog) and its upload flow is unchanged.

- [ ] **Step 7: No dead references remain**

Run:
```bash
grep -rn "damageCheckPdfTemplate\|DamageCheckPdfTemplateManager" client/src server shared
grep -rn "categories.*TemplateCategory\|handoverChecklist\|generateDamageCheckPDF\b" client/src server shared
```
(second grep's `generateDamageCheckPDF\b` intentionally excludes the `WithTemplate`/`FromCanvas` suffixed names via word boundary)
Expected: no results (aside from this plan file and the spec docs themselves, if grepped over `docs/`).
