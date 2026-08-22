# DamageCheck Template Unified Editor

Date: 2026-08-22
Status: Approved for planning

## Problem

Even after the editor-uniformity work (see
`2026-08-21-damagecheck-template-editor-uniform-design.md`, merged to
`main`), damage-check template management is still split across three
separate entry points on the Documents → Damage Check tab
(`client/src/pages/documents/index.tsx`, `DamageCheckManager` buttons at
~lines 1275-1291):

- **"Edit Fields"** → `damage-check-fields.tsx` — defines the checklist
  vocabulary: interior/exterior/delivery groups, each a list of
  `{key, label, inputType, options}` field definitions
  (`shared/schema.ts:969-991`, stored as one `app_settings` row keyed
  `damage_check_fields`). Also used directly by the live interactive
  check UI and the PDF auto-fill map — not template-specific.
- **"Template Library"** → `damage-check-templates.tsx` (~2500 lines) —
  the template gallery: create/clone/delete/import-export/set-default,
  vehicle-targeting metadata (make/model/type/year range), and (today) a
  structured "Edit Template" dialog for `categories`/`inspectionPoints`/
  `handoverChecklist`.
- **"Edit Layout"** → `damage-check-template-editor.tsx` (~1200 lines) —
  the canvas drag-and-drop editor for `canvasFields`, with its own
  internal template picker separate from the gallery.

Two of these (Template Library, Edit Layout) edit the *same*
`damageCheckTemplates` row through two unrelated field vocabularies with
no data-model relationship, reached via two separate dialogs with two
separate template pickers. A template can have `categories`/
`inspectionPoints` set in one and empty `canvasFields` in the other, or
vice versa, with no indication in either UI. There's no way to see a
rendered preview without leaving the editor and generating a real PDF
through a completed check.

## Goals

1. One entry point ("Damage Check Templates") opens one dialog/page with
   two tabs — **Templates** and **Fields** — replacing the current three
   separate buttons/dialogs for those two concerns.
2. **Templates** tab combines the gallery (from Template Library) with
   the canvas editor (from Edit Layout) as a single flow: pick or create
   a template in the gallery, its layout opens inline in the same
   surface. One template picker, not two.
3. Legacy vocabulary (`categories`, `inspectionPoints`,
   `handoverChecklist`) is retired from the UI entirely. Existing data is
   migrated into equivalent `canvasFields` (see Data migration below) so
   no template silently loses its content.
4. **Fields** tab is "Edit Fields" relocated, unchanged in function
   (still the settings surface for the interior/exterior/delivery
   vocabulary), *plus* it doubles as the source of a drag-from palette
   inside the Templates tab's canvas editor — defined fields become
   draggable onto the layout instead of the canvas editor having no
   connection to what fields are defined.
5. A "Generate Preview" action in the Templates tab renders the actual
   PDF via the real generator (same pattern as
   `client/src/pages/documents/template-editor.tsx`'s
   `generatePreviewMutation`, `/api/pdf-templates/:id/preview`) against a
   sample/chosen record, shown next to the canvas — not a continuous
   re-render on every edit.
6. Legacy PDF renderer (`generateDamageCheckPDF`, the
   categories/inspectionPoints/handoverChecklist render path in
   `server/pdf-damage-check-generator.ts`) is removed once every template
   is guaranteed to have equivalent `canvasFields`.

## Non-goals

- **Vehicle diagram uploads stay exactly where they are.** Per explicit
  direction: diagrams are added far more often than templates are
  edited, so `DiagramTemplateManager` stays inline on the Documents →
  Damage Check page, untouched, not folded into the unified dialog. The
  canvas editor's `diagram`-type field properties still read from
  `vehicleDiagramTemplates` to offer auto-match vs. pick-a-specific-one —
  that's read-only reuse of existing data, not a UI move.
- No change to `damageCheckPdfTemplates` (the dead sections/themes/
  presets system, mechanism 4 from prior investigation) — separate
  problem, out of scope here.
- No change to how `vehicleDiagramTemplates` matching itself works.
- `headerText`/`footerText` are **not** part of the legacy vocabulary
  being retired — they're plain template-level settings already shared
  by both PDF render paths (`applyHeaderFooterOverlay`, called from both
  the legacy and canvas renderers in
  `pdf-damage-check-generator.ts:1301` and `:2094`). They get a small
  settings field in the Templates tab's canvas editor toolbar; no
  migration needed.

## Design

### 1. Client — unified dialog shell

Replace the three `DamageCheckManager` buttons ("Edit Fields", "Template
Library", "Edit Layout") in `client/src/pages/documents/index.tsx` with
one button opening a new tabbed component
(`client/src/pages/settings/damage-check-template-studio.tsx` or
similar), tabs `Templates` | `Fields`.

- **Fields tab**: the existing `damage-check-fields.tsx` content,
  relocated in as a tab (same form: groups, field defs, header image
  upload). No functional change.
- **Templates tab**: gallery (ported from `damage-check-templates.tsx`,
  minus the "Edit Template" structured-form dialog) as the left/top
  panel; selecting or creating a template opens the canvas editor (from
  `damage-check-template-editor.tsx`, adapted to take an external
  `templateId` prop instead of its own internal picker) inline.
  - The canvas editor's field palette reads the current `damage_check_fields`
    config (`GET /api/damage-check-fields`) and lists definitions as
    draggable items alongside the existing static field types
    (text/checkbox/signature/line/box/diagram/inspection); dragging one
    onto the canvas creates a `canvasFields` entry whose `source` matches
    the definition's `key`, `name` from its `label`, and (for
    `inputType: "checkbox"`) type `"checkbox"`, (for `"select"`) type
    `"inspection"` with `damageTypes` from `options`.
  - "Generate Preview" button calls a new endpoint
    `GET /api/damage-check-templates/:id/preview` (mirroring
    `/api/pdf-templates/:id/preview`), rendering through
    `generateDamageCheckPDFFromCanvas` against either a sample/blank
    record or an existing `interactiveDamageChecks` row the user picks,
    and displays the returned PDF next to the canvas (embed/iframe, same
    as the contract editor's preview panel).

### 2. Data migration — legacy vocabulary → canvasFields

One-time server-side migration (script or startup task, run once against
existing data), converting each `damageCheckTemplates` row's legacy
fields into `canvasFields` entries, best-effort per type:

- `inspectionPoints[]` → one `"inspection"` canvas field per point:
  `name` from `.name`, `damageTypes` from `.damageTypes`. Position: use
  `.position` (x/y) if present (carried over from the old Diagram
  Placement feature); otherwise lay out via the same grid logic
  `buildDefaultLayout()` already uses for fresh templates.
- `categories[]` → one `"text"` canvas field per category, used as a
  section heading positioned above that category's converted inspection
  points. **Lossy**: canvas has no first-class grouping concept, so this
  is a plain heading label, not a structural group — accepted as the
  closest available fidelity.
- `handoverChecklist[]` → for `type: "checkbox"` items, one `"checkbox"`
  canvas field (`name` from `.label`). For `type: "text"` items (e.g.
  "fuel card #"), one `"text"` canvas field with `.label` as a static
  label. **Lossy**: canvas has no fillable-text-line field type, so a
  `type: "text"` handover item becomes a static label only, not a
  captured value — accepted as-is; flag if this needs revisiting later.
- Templates that already have non-empty `canvasFields` are left alone
  (assume already-curated layout takes precedence over a stale legacy
  form).

After migration is confirmed (via the Testing section's manual checks),
drop `categories`, `inspectionPoints`, `handoverChecklist` columns from
`damage_check_templates` in a follow-up schema change + `db:push` (same
manual-DDL approach as the prior uniformity work, since `drizzle-kit
push` requires a TTY to resolve column-drop-vs-rename ambiguity
non-interactively).

### 3. Server cleanup

- Remove `generateDamageCheckPDF` (the legacy categories/inspectionPoints/
  handoverChecklist renderer) from `server/pdf-damage-check-generator.ts`
  once migration is confirmed complete — `generateDamageCheckPDFFromCanvas`
  becomes the sole render path (the `damageCheckPdfTemplates` fallback,
  already dead, is untouched).
- Remove the `/api/damage-check-templates` structured-form-only fields
  from create/update validation if they're no longer written by any
  client (check `insertDamageCheckTemplateSchema` usage before removing
  from the Zod schema, since the schema itself doesn't change until the
  column-drop step in section 2).
- Add `GET /api/damage-check-templates/:id/preview` per section 1.

### 4. Client cleanup

- Delete `damage-check-templates.tsx`'s structured "Edit Template"
  dialog code (categories/inspectionPoints/handoverChecklist form,
  ~1383-2077 per prior investigation) and the "Diagram Placement"
  picker dialog tied to it (~344-380) — both superseded by canvas
  drag-and-drop per the 2026-08-21 design's Diagram Placement decision.
- Delete `damage-check-template-editor.tsx`'s internal template
  picker/dropdown and its own create/delete — the gallery now owns
  template lifecycle.
- Delete `damage-check-fields.tsx` as a standalone route/page if nothing
  else links to it directly; keep its component logic, relocated into
  the Fields tab.

## Testing

- Typecheck/build passes.
- Migration: run against a copy of current data (or the dev DB), spot-
  check several templates with `categories`/`inspectionPoints`/
  `handoverChecklist` before/after — confirm every legacy item has a
  corresponding `canvasFields` entry, no template ends up with fewer
  visible fields than before.
- Manual: Documents → Damage Check tab shows one "Damage Check
  Templates" button (not three) plus the untouched
  `DiagramTemplateManager` panel.
- Manual: Templates tab — select a template, drag a field from the
  Fields-tab-sourced palette onto the canvas, save, reload, confirm
  persisted. Generate Preview renders a real PDF matching the canvas
  layout.
- Manual: Fields tab — add/edit a field definition, confirm it appears
  in the Templates tab's palette without a page reload (or after one, if
  that's the simpler implementation — decide during implementation).
- Manual: live pickup/return flow unaffected — diagram auto-match and
  PDF generation for a completed check still work exactly as before
  (mechanism untouched, per Non-goals).
- Confirm no remaining references to `categories`/`inspectionPoints`/
  `handoverChecklist` in client or server code after the column-drop
  step.

## Open risk

- The two lossy conversions (category grouping → plain heading text;
  handover `text`-type items → static label, not a fillable field) are
  accepted trade-offs, not full fidelity. If either turns out to matter
  in practice post-migration, it's a follow-up, not a blocker for this
  work.
- Migration is one-way (columns get dropped after). Take a DB
  snapshot/backup before running the column-drop step, same caution
  applied in the 2026-08-21 migration.
