# DamageCheck Template Editor Uniformity + Default Vehicle-Diagram Template

Date: 2026-08-21
Status: Approved for planning

## Problem

Three template editors exist in the app: Contract Templates
(`client/src/pages/documents/template-editor.tsx`), Transport Report
Templates (`client/src/pages/documents/transport-report-template-editor.tsx`),
and the DamageCheck template editor
(`client/src/pages/settings/damage-check-template-editor.tsx`). The first
two share the same pattern: drag-positioned fields on top of an uploaded
background page image, with a per-template background library, zoom,
grid/snap, rulers, alignment guides, multi-select, undo/redo history, and
copy/paste. The DamageCheck editor was built independently: it has no
background-image concept, renders a page composed programmatically
(`buildDefaultLayout()`), and lacks the shared editor chrome
(zoom/grid/rulers/undo-redo/multi-select/copy-paste). Its field-type
vocabulary is also richer than the other two (`diagram`, `inspection`,
`checkbox`, `line`, `box` vs. plain positioned text), and that stays.

The app also has no ready-to-use default damage-check template that
includes a vehicle diagram out of the box, even though the underlying
auto-match mechanism (`vehicleDiagramTemplates`, keyed by make/model/year)
already works end-to-end in the live pickup/return flow
(`client/src/pages/interactive-damage-check.tsx`).

A second, legacy vehicle-diagram mechanism also exists:
`damageCheckTemplates.diagramTopView/FrontView/RearView/SideView` — four
fixed-angle image slots attached directly to a template, editable only in
the legacy structured editor (`damage-check-templates.tsx`), and not read
by the live pickup/return flow at all. It predates the make/model-keyed
mechanism and is confirmed dead weight.

## Goals

1. DamageCheck template editor gets the same background-image + library +
   zoom/grid/rulers/undo-redo/multi-select/copy-paste chrome as the other
   two editors, while keeping its own field types.
2. A default damage-check template ships with an embedded vehicle-diagram
   field (auto-match by vehicle, `diagramTemplateId: null`), so pickup/
   return checks show a matched diagram without manual per-template setup.
3. Remove the legacy 4-slot diagram mechanism (columns, upload UI, PDF
   rendering path) since it's unused by the live flow.
4. Vehicle diagram images themselves keep uploading exactly where they do
   today: Documents → Damage Check tab → "Diagram Templates"
   (`DiagramTemplateManager`, `client/src/pages/documents/index.tsx`,
   ~line 1592) — no change to that upload flow or its make/model/year
   keying.

## Non-goals

- No shared/extracted canvas engine across all 3 editors. Per existing
  codebase precedent (Contract vs. Transport Report templates already
  duplicate ~2200 lines rather than share a base), the DamageCheck
  background-image machinery is ported/duplicated into
  `damage-check-template-editor.tsx`, not extracted into a shared
  component. The two existing editors are not touched.
- No change to how `vehicleDiagramTemplates` matching works
  (`GET /api/vehicle-diagram-templates/match/:vehicleId`,
  `storage.getVehicleDiagramTemplateByVehicle`) — that mechanism is
  already correct and stays as-is.

## Design

### 1. Schema (`shared/schema.ts`)

- `damageCheckTemplates` gains three nullable columns, matching
  `pdfTemplates`' shape (schema.ts:783-793):
  - `backgroundPath: text`
  - `backgroundPreviewPath: text`
  - `templatePreviewPath: text`
- New table `damageCheckTemplateBackgrounds`, mirroring
  `templateBackgrounds` (schema.ts:802-809):
  - `id serial`
  - `templateId integer -> damageCheckTemplates.id` (cascade delete)
  - `name text`
  - `backgroundPath text`
  - `previewPath text`
  - `createdAt timestamp`
- Drop columns: `diagramTopView`, `diagramFrontView`, `diagramRearView`,
  `diagramSideView` (schema.ts:1286-1386 region).
- Fix the `canvasFields` jsonb `$type<>` union (schema.ts:1351-1366): add
  the missing `"diagram"` literal so the type matches what the client
  already writes/reads (`FieldType` in damage-check-template-editor.tsx:25
  already includes it; the schema annotation was stale).

### 2. Server (`server/routes.ts`, `server/storage.ts`)

- Add background CRUD + serving endpoints for damage-check templates,
  mirroring the existing `pdfTemplates` background routes 1:1 in shape
  (upload, list, select/patch, delete, serve image), scoped to
  `damageCheckTemplateBackgrounds` / `damageCheckTemplates`.
- Remove the legacy 4-slot diagram upload endpoint that backs
  `damage-check-templates.tsx`'s old editor (the handler that writes
  `diagramTopView` etc.).
- No changes to any `/api/vehicle-diagram-templates*` routes.

### 3. Client — DamageCheck editor
   (`client/src/pages/settings/damage-check-template-editor.tsx`)

- Port from `template-editor.tsx`: `TemplateBackground` state/interface,
  background upload input + library panel (select/upload/delete
  backgrounds), zoom controls, grid + snap-to-grid, rulers, alignment
  guides, multi-select marquee, undo/redo history stack, copy/paste of
  fields. Adapt API calls to the new damage-check-template background
  endpoints from section 2.
- Do not change the field-type system: `diagram`, `inspection`,
  `checkbox`, `line`, `box`, `text`, `dynamic`, `signature` all stay,
  including `FieldRender`'s existing diagram-image resolution
  (damage-check-template-editor.tsx:1103-1155).
- Canvas keeps its current page-generation behavior
  (`buildDefaultLayout()`, lines 112-274) as the starting point for new
  templates; the background image is an optional layer behind it, not a
  replacement for the programmatic layout.

### 4. Client — legacy editor cleanup
   (`client/src/pages/settings/damage-check-templates.tsx`)

- Remove the 4-slot diagram upload UI (lines ~904-946: top/front/rear/side
  view file inputs and their handlers).

### 5. Server — PDF generation cleanup
   (`server/pdf-damage-check-generator.ts`)

- Remove the legacy diagram-view rendering path that reads
  `template.diagramTopView` etc. (lines ~92, 1260, 2017-2022). The canvas
  `'diagram'` field type (already handled at lines ~502, 1904 via
  `diagramCache`) remains the only rendering path.

### 6. Default template with embedded diagram

- `buildDefaultLayout()` (damage-check-template-editor.tsx:112-274) gains
  a `diagram` field (`diagramTemplateId: null`, i.e. auto-match by
  vehicle) positioned alongside the existing checklist/header layout, so
  every newly created template starts with one.
- Data migration: whichever `damageCheckTemplates` row currently has
  `isDefault = true` gets its `canvasFields` backfilled with a diagram
  field if it doesn't already have one of type `'diagram'`. If no row is
  currently marked default, no row is force-created — the app's existing
  "no default" behavior is unchanged, only the content of an existing
  default (if any) is amended.

### 7. Migration

One Drizzle migration handling, in order:
1. Add `backgroundPath`, `backgroundPreviewPath`, `templatePreviewPath` to
   `damage_check_templates`.
2. Create `damage_check_template_backgrounds` table.
3. Backfill `canvasFields` on the current default template (if any) to
   include a diagram field, per section 6.
4. Drop `diagram_top_view`, `diagram_front_view`, `diagram_rear_view`,
   `diagram_side_view` columns from `damage_check_templates`.

Steps 1-3 must run before step 4 so the backfill logic can still be
written against a schema that (temporarily) has both old and new columns
if needed for reference; in practice the backfill only touches
`canvasFields` and doesn't read the old columns, so ordering is not
load-bearing beyond "don't drop columns still referenced by code that
hasn't been updated yet" — apply this migration together with the code
changes in the same deploy.

## Testing

- Typecheck/build (`npm run check` or equivalent) passes.
- Manual, DamageCheck editor: create a template, upload a background
  image, add one field of each type (incl. `diagram`), use zoom/grid/
  undo-redo/copy-paste, save, reload, confirm state persists.
- Manual, live flow: pickup/return damage check still auto-matches and
  renders the vehicle diagram unchanged (mechanism A untouched).
- Manual: confirm legacy 4-slot diagram UI is gone from
  `damage-check-templates.tsx` and no code references the dropped
  columns.
- Confirm PDF generation for a damage check still succeeds and renders
  the diagram field correctly.

## Open risk

Any existing `damageCheckTemplates` rows with data in the 4 legacy
diagram columns lose that data on migration (2 uploaded files were found
under `uploads/` during research). Confirmed acceptable since the legacy
mechanism is not read by the live pickup/return flow — those files are
already inert.
