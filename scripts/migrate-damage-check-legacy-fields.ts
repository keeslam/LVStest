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
