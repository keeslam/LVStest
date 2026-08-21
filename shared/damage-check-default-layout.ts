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

export const newId = () => `f_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

export function defaultFieldFor(type: FieldType, x: number, y: number): CanvasField {
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
