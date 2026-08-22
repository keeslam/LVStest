import { PDFDocument, PDFPage, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs/promises';
import path from 'path';
import { db } from './db';
import { damageCheckTemplates, vehicleDiagramTemplates } from '../shared/schema';
import { eq } from 'drizzle-orm';
import { ObjectStorageService } from './objectStorage';

/**
 * Format a license plate consistently throughout the application
 * Removes dashes and spaces, then formats according to Dutch license plate standards
 */
function formatLicensePlate(licensePlate: string): string {
  // Remove any existing dashes or spaces and convert to uppercase
  const sanitized = licensePlate.replace(/[-\s]/g, '').toUpperCase();
  
  // Standard Dutch license plate formats
  const formats = [
    { pattern: /^([A-Z]{2})(\d{2})(\d{2})$/, format: '$1-$2-$3' }, // XX-00-00
    { pattern: /^(\d{2})(\d{2})([A-Z]{2})$/, format: '$1-$2-$3' }, // 00-00-XX
    { pattern: /^(\d{2})([A-Z]{2})(\d{2})$/, format: '$1-$2-$3' }, // 00-XX-00
    { pattern: /^([A-Z]{2})([A-Z]{2})(\d{2})$/, format: '$1-$2-$3' }, // XX-XX-00
    { pattern: /^([A-Z]{2})(\d{2})([A-Z]{2})$/, format: '$1-$2-$3' }, // XX-00-XX
    { pattern: /^(\d{2})([A-Z]{2})([A-Z]{2})$/, format: '$1-$2-$3' }, // 00-XX-XX
    { pattern: /^([A-Z])(\d{3})([A-Z]{2})$/, format: '$1-$2-$3' }, // X-000-XX
    { pattern: /^([A-Z]{2})(\d{3})([A-Z])$/, format: '$1-$2-$3' }, // XX-000-X
    { pattern: /^([A-Z])(\d{2})([A-Z]{3})$/, format: '$1-$2-$3' }, // X-00-XXX
    { pattern: /^([A-Z]{3})(\d{2})([A-Z])$/, format: '$1-$2-$3' }, // XXX-00-X
    { pattern: /^(\d{1})([A-Z]{3})(\d{2})$/, format: '$1-$2-$3' }, // 0-XXX-00
    { pattern: /^(\d{2})([A-Z]{3})(\d{1})$/, format: '$1-$2-$3' }, // 00-XXX-0
  ];
  
  // Try to match and format the license plate
  for (const { pattern, format } of formats) {
    if (pattern.test(sanitized)) {
      return sanitized.replace(pattern, format);
    }
  }
  
  // If no standard format matches, return as-is (already uppercase)
  return sanitized;
}

interface VehicleData {
  brand: string;
  model: string;
  licensePlate: string;
  buildYear?: string;
  fuel?: string;
  mileage?: number;
}

interface DamageCheckTemplate {
  id?: number;
  name: string;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  vehicleType?: string | null;
  buildYearFrom?: number | null;
  buildYearTo?: number | null;
  isDefault?: boolean;
  headerText?: string | null;
  footerText?: string | null;
}

interface PdfTemplateSection {
  id: string;
  type: 'header' | 'contractInfo' | 'vehicleData' | 'checklist' | 'diagram' | 'remarks' | 'signatures' | 'customField';
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  settings: {
    fontSize?: number;
    checkboxSize?: number;
    companyName?: string;
    headerColor?: string;
    headerFontSize?: number;
    showLogo?: boolean;
    logoPath?: string;
    customLabel?: string;
    textAlign?: 'left' | 'center' | 'right';
    columnCount?: number;
    fieldText?: string;
    hasCheckbox?: boolean;
    hasText?: boolean;
    [key: string]: any;
  };
}

interface PdfTemplate {
  id: number;
  name: string;
  isDefault: boolean;
  sections: PdfTemplateSection[];
  pageMargins?: number;
}

interface ReservationData {
  contractNumber?: string;
  customerName?: string;
  startDate?: string;
  endDate?: string;
  rentalDays?: number;
}

/**
 * Canvas-mode renderer: draws free-positioned fields onto blank A4 pages.
 * Used when template.canvasFields is non-empty. Each field carries x/y in
 * PDF points using a top-left origin (matching the editor's coordinate
 * system); we convert to PDF's bottom-left origin per page.
 */
async function generateDamageCheckPDFFromCanvas(
  vehicle: VehicleData,
  template: any,
  reservationData?: ReservationData,
  interactiveCheck?: any,
  inspectorName?: string,
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // pdf-lib's standard fonts only support WinAnsi (~Latin-1). Strip or map
  // characters outside that range so user-typed glyphs like "→" / smart
  // quotes don't blow up the whole PDF.
  const sanitizeForWinAnsi = (s: string): string => {
    if (!s) return s;
    return s
      .replace(/→/g, '->')
      .replace(/←/g, '<-')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/\u2026/g, '...')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      // drop anything still outside WinAnsi (basic Latin + Latin-1 Supp)
      .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '?');
  };

  // Parse interactive check JSON blobs once.
  const parseJson = (v: any) => {
    if (!v) return null;
    if (typeof v !== 'string') return v;
    try { return JSON.parse(v); } catch { return null; }
  };
  const checklist = parseJson(interactiveCheck?.checklistData) || {};
  const checkInterior: Record<string, string> = checklist.interior || {};
  const checkExterior: Record<string, string> = checklist.exterior || {};
  const checkDelivery: Record<string, boolean> = checklist.delivery || {};

  // Build label->key maps from the admin-editable schema (falls back to default).
  // Match labels case/whitespace-insensitively, and also tolerate the editor's
  // "(eventueel kopie)" style suffixes by matching on the leading words.
  const { storage } = await import('./storage');
  const { DAMAGE_CHECK_FIELDS_KEY, DEFAULT_DAMAGE_CHECK_FIELDS, damageCheckFieldsConfigSchema } =
    await import('../shared/schema');
  let fieldsConfig = DEFAULT_DAMAGE_CHECK_FIELDS;
  try {
    const setting = await storage.getAppSettingByKey(DAMAGE_CHECK_FIELDS_KEY);
    if (setting) {
      const parsed = damageCheckFieldsConfigSchema.safeParse(setting.value);
      if (parsed.success) fieldsConfig = parsed.data;
    }
  } catch (e) {
    console.warn('Damage check fields config fetch failed, using defaults:', (e as Error).message);
  }
  const normalize = (s: string) =>
    s.trim().toLowerCase().replace(/\s*\(.*?\)\s*$/, '').trim();
  const interiorKeyByLabel: Record<string, string> = {};
  const exteriorKeyByLabel: Record<string, string> = {};
  const deliveryKeyByLabel: Record<string, string> = {};
  for (const group of fieldsConfig.groups) {
    const target =
      group.id === 'interior' ? interiorKeyByLabel
      : group.id === 'exterior' ? exteriorKeyByLabel
      : deliveryKeyByLabel;
    for (const field of group.fields) target[normalize(field.label)] = field.key;
  }
  // Legacy label -> canonical checklist key aliases. Older damage check
  // templates were authored against a fixed Dutch label list; if an admin later
  // edits / renames fields, those legacy labels won't appear in the config-
  // derived map above. This fallback keeps existing PDF templates auto-filling
  // correctly. Keys here MUST match the historical interactive-check JSON keys
  // (interior/exterior/delivery sub-objects).
  const legacyInteriorAliases: Record<string, string> = {
    'binnenzijde auto': 'carInterior',
    'ruitschade': 'windowDamage',
    'matten': 'floorMats',
    'vloermatten': 'floorMats',
    'bekleding': 'upholstery',
    'asbak': 'ashtray',
    'reservewiel': 'spareWheel',
    'krik': 'jack',
    'wielsleutel': 'wheelBrace',
    'hoofdsteunen': 'headrests',
  };
  const legacyExteriorAliases: Record<string, string> = {
    'buitenzijde auto': 'carExterior',
    'wieldoppen': 'hubcaps',
    'kentekenplaten': 'licensePlates',
    'spiegelkap links': 'mirrorCapsLeft',
    'spiegelkap rechts': 'mirrorCapsRight',
    'spiegelglas l+r': 'mirrorGlassLeftRight',
    'antenne': 'antenna',
    'ruitenwisser': 'wiperBlade',
    'deurvangers': 'doorCatchers',
    'deurvanger': 'doorCatchers',
    'schuifdeur': 'slidingDoorBus',
    'werkende sloten': 'indicatorSlots',
    'mistlampen voor': 'fogLights',
  };
  // Cross-rename map: lookups under a new schema key also try old keys so
  // damage checks saved before the rename still surface in the PDF.
  const legacyKeyRenames: Record<string, string[]> = {
    floorMats: ['matKit'],
    headrests: ['mainKeys'],
    doorCatchers: ['mudguards'],
  };
  const readFromGroup = (group: Record<string, string>, key: string): string | null => {
    if (group[key]) return group[key];
    const olds = legacyKeyRenames[key];
    if (olds) for (const o of olds) if (group[o]) return group[o];
    return null;
  };
  const legacyDeliveryAliases: Record<string, string> = {
    'olie - water': 'oilWater',
    'ruitenproeiervloeistof': 'washerFluid',
    'verlichting': 'lighting',
    'bandenspanning incl. reservewiel': 'tireInflation',
    'kachelfan': 'fanBelt',
    'hoedenplank': 'engineBoard',
    'ijskrabber': 'jackKnife',
    'gaan alle deuren open': 'allDoorsOpen',
    'kentekenpapieren': 'licensePlatePapers',
    'geldige groene kaart': 'validGreenCard',
    'europees schadeformulier': 'europeanDamageForm',
  };
  // Multi-select chips in the interactive damage check are stored as CSV
  // (e.g. "LV,RV"). Normalize whitespace so the PDF shows "LV, RV".
  const formatAnswer = (v: string | null | undefined): string | null => {
    if (!v) return null;
    if (!v.includes(',')) return v;
    return v.split(',').map(s => s.trim()).filter(Boolean).join(', ');
  };
  const lookupAnswer = (label: string): string | null => {
    const key = normalize(label);
    if (interiorKeyByLabel[key]) {
      const v = readFromGroup(checkInterior, interiorKeyByLabel[key]);
      if (v) return formatAnswer(v);
    }
    if (exteriorKeyByLabel[key]) {
      const v = readFromGroup(checkExterior, exteriorKeyByLabel[key]);
      if (v) return formatAnswer(v);
    }
    // Legacy fallback: historical Dutch labels on older templates.
    const li = legacyInteriorAliases[key];
    if (li) {
      const v = readFromGroup(checkInterior, li);
      if (v) return formatAnswer(v);
    }
    const le = legacyExteriorAliases[key];
    if (le) {
      const v = readFromGroup(checkExterior, le);
      if (v) return formatAnswer(v);
    }
    return null;
  };
  const isDeliveryChecked = (label: string): boolean => {
    const key = normalize(label);
    if (deliveryKeyByLabel[key] && checkDelivery[deliveryKeyByLabel[key]] !== undefined) {
      return !!checkDelivery[deliveryKeyByLabel[key]];
    }
    const ld = legacyDeliveryAliases[key];
    return ld ? !!checkDelivery[ld] : false;
  };

  // Pre-embed signatures from the interactive check (base64 PNG data URLs).
  const embedDataUrl = async (dataUrl: string | null | undefined) => {
    if (!dataUrl || typeof dataUrl !== 'string') return null;
    try {
      const m = dataUrl.match(/^data:image\/(png|jpe?g);base64,(.+)$/i);
      if (!m) return null;
      const bytes = Buffer.from(m[2], 'base64');
      return m[1].toLowerCase().startsWith('png')
        ? await pdfDoc.embedPng(bytes)
        : await pdfDoc.embedJpg(bytes);
    } catch (e) {
      console.warn('Signature embed failed:', (e as Error).message);
      return null;
    }
  };
  const renterSigImg = await embedDataUrl(interactiveCheck?.renterSignature);
  const customerSigImg = await embedDataUrl(interactiveCheck?.customerSignature);
  const annotatedDiagramImg = await embedDataUrl(interactiveCheck?.diagramWithAnnotations);

  // Override vehicle values from the interactive check (these reflect what the
  // staff member actually recorded at pickup/return time).
  const checkMileage = interactiveCheck?.mileage ?? vehicle.mileage;
  const checkFuel = interactiveCheck?.fuelLevel ?? vehicle.fuel;
  const checkNotes = interactiveCheck?.notes ?? '';

  const dynVals: Record<string, string> = {
    licensePlate: vehicle.licensePlate ? formatLicensePlate(vehicle.licensePlate) : '',
    brand: vehicle.brand || '',
    model: vehicle.model || '',
    buildYear: vehicle.buildYear || '',
    fuel: checkFuel || '',
    currentMileage: checkMileage ? String(checkMileage) : '',
    customerName: reservationData?.customerName || '',
    contractNumber: reservationData?.contractNumber || '',
    startDate: reservationData?.startDate || '',
    endDate: reservationData?.endDate || '',
    rentalDays: reservationData?.rentalDays ? String(reservationData.rentalDays) : '',
    currentDate: new Date().toLocaleDateString('en-GB'),
    notes: checkNotes || '',
    inspectorName: inspectorName || '',
  };

  const fields: any[] = Array.isArray(template.canvasFields) ? template.canvasFields : [];
  const maxPage = Math.max(1, ...fields.map(f => Number(f.page) || 1));
  const pages = Array.from({ length: maxPage }, () => pdfDoc.addPage([595, 842]));
  const PAGE_H = 842;

  // Pre-resolve diagram template images so each field can embed one. We fetch
  // any explicitly referenced ids, plus a fallback (auto-match by vehicle, or
  // the first available template) used when a field has no diagramTemplateId.
  const diagramCache = new Map<number, any>(); // id -> embedded pdf-lib image
  let fallbackDiagram: any = null;
  const hasDiagram = fields.some(f => f.type === 'diagram');
  if (hasDiagram) {
    try {
      const allDiagrams = await db.select().from(vehicleDiagramTemplates);
      const explicitIds = new Set<number>(
        fields.filter(f => f.type === 'diagram' && f.diagramTemplateId).map(f => Number(f.diagramTemplateId)),
      );
      const tryEmbed = async (row: any) => {
        if (!row?.diagramPath) return null;
        try {
          const filePath = path.join(process.cwd(), row.diagramPath);
          const bytes = await fs.readFile(filePath);
          return row.diagramPath.toLowerCase().endsWith('.png')
            ? await pdfDoc.embedPng(bytes)
            : await pdfDoc.embedJpg(bytes);
        } catch (e) {
          console.warn(`Canvas diagram embed failed for #${row.id}:`, (e as Error).message);
          return null;
        }
      };
      for (const id of explicitIds) {
        const row = allDiagrams.find((d: any) => d.id === id);
        if (row) {
          const img = await tryEmbed(row);
          if (img) diagramCache.set(id, img);
        }
      }
      // Fallback: prefer a brand/model match against the vehicle, else first row.
      const brandLc = (vehicle.brand || '').toLowerCase();
      const modelLc = (vehicle.model || '').toLowerCase();
      const matched = allDiagrams.find((d: any) => {
        const mk = String(d.make || '').toLowerCase();
        const md = String(d.model || '').toLowerCase();
        return brandLc && mk && (brandLc.includes(mk) || mk.includes(brandLc))
          && modelLc && md && (modelLc.includes(md) || md.includes(modelLc));
      }) || allDiagrams[0];
      if (matched) fallbackDiagram = await tryEmbed(matched);
    } catch (e) {
      console.warn('Canvas diagram lookup failed:', (e as Error).message);
    }
  }

  // Draw the LAM Groep / BOVAG branded header at the top of every page,
  // matching the paper damage check form. Overlays Datum and Verhuur-
  // contractnummer values on top of the lines in the static image.
  // Header source: admin-uploaded file (damage_check_fields.headerImagePath)
  // if present, otherwise the bundled default in attached_assets/.
  try {
    let headerPath = path.join(process.cwd(), 'attached_assets', 'image_1779471993617.png');
    try {
      const { storage: appStorage } = await import('./storage');
      const setting = await appStorage.getAppSettingByKey('damage_check_fields');
      const customPath = (setting?.value as any)?.headerImagePath as string | undefined;
      if (customPath) {
        const candidate = path.isAbsolute(customPath) ? customPath : path.join(process.cwd(), customPath);
        try { await fs.access(candidate); headerPath = candidate; } catch {}
      }
    } catch {}
    try {
      await fs.access(headerPath);
    } catch {
      // attached_assets/ is gitignored, so the "bundled default" is not present
      // in a deployed build. Without an uploaded header the damage check PDF is
      // produced without its branded top — say so rather than failing silently.
      console.warn(
        '⚠️ No damage check header image available — generating the PDF without it. ' +
        'Upload one under Settings → Damage Check Fields to restore the branded header.'
      );
      throw new Error('damage check header image not available');
    }
    const headerBytes = await fs.readFile(headerPath);
    const isJpeg = headerPath.toLowerCase().endsWith('.jpg') || headerPath.toLowerCase().endsWith('.jpeg');
    const headerImg = isJpeg
      ? await pdfDoc.embedJpg(headerBytes)
      : await pdfDoc.embedPng(headerBytes);
    const margin = 0;
    const headerW = 595;
    const srcW = headerImg.width;
    const srcH = headerImg.height;
    const headerH = headerW * (srcH / srcW);
    const headerYBottom = PAGE_H - headerH;
    const dateStr = new Date().toLocaleDateString('en-GB');
    const contractStr = reservationData?.contractNumber || '';
    // Normalize overlay coords against the actual source image dimensions so
    // a different aspect ratio still lands the text on the printed lines.
    const sx = headerW / srcW;
    const sy = headerH / srcH;
    const textSize = Math.max(7, Math.round(headerH * 0.12));
    const datumSrcX = 445, datumSrcY = 28;     // top line in source pixels
    const contractSrcX = 445, contractSrcY = 80; // bottom line in source pixels
    for (const pg of pages) {
      pg.drawImage(headerImg, { x: margin, y: headerYBottom, width: headerW, height: headerH });
      pg.drawText(sanitizeForWinAnsi(dateStr), {
        x: margin + datumSrcX * sx,
        y: headerYBottom + headerH - datumSrcY * sy - textSize,
        size: textSize, font, color: rgb(0, 0, 0),
      });
      pg.drawText(sanitizeForWinAnsi(contractStr), {
        x: margin + contractSrcX * sx,
        y: headerYBottom + headerH - contractSrcY * sy - textSize,
        size: textSize, font, color: rgb(0, 0, 0),
      });
    }
  } catch (e) {
    console.warn('Damage check header embed failed:', (e as Error).message);
  }

  for (const f of fields) {
    const p = pages[(Number(f.page) || 1) - 1];
    if (!p) continue;
    const x = Number(f.x) || 0;
    const yTop = Number(f.y) || 0;
    const fontSize = Number(f.fontSize) || 11;
    const useFont = f.isBold ? boldFont : font;
    // Convert top-left origin to bottom-left baseline. We treat (x,y) as the
    // top-left of the text box and offset by fontSize so the baseline sits
    // inside the box (closer to top alignment than CSS-equivalent).
    const baselineY = PAGE_H - yTop - fontSize;

    if (f.type === 'line') {
      // The editor renders the line as a div with top=yTop and height=h, so
      // its visual band is yTop..yTop+h. pdf-lib's drawLine centers the
      // stroke on the given y, so shift down by thickness/2 to match.
      const thickness = Math.max(0.5, Number(f.height) || 1);
      const lineY = PAGE_H - yTop - thickness / 2;
      p.drawLine({
        start: { x, y: lineY },
        end: { x: x + (Number(f.width) || 100), y: lineY },
        thickness,
        color: rgb(0, 0, 0),
      });
      continue;
    }
    if (f.type === 'diagram') {
      const w = Number(f.width) || 400;
      const h = Number(f.height) || 220;
      // Prefer the marked-up diagram from the interactive check (it bakes in
      // damage markers/drawing paths). Fall back to explicit template, then
      // the auto-matched fallback.
      const img = f.diagramTemplateId ? diagramCache.get(Number(f.diagramTemplateId)) : null;
      const useImg = annotatedDiagramImg || img || fallbackDiagram;
      if (useImg) {
        // Fit-contain inside the box, preserving aspect ratio
        const iw = useImg.width;
        const ih = useImg.height;
        const scale = Math.min(w / iw, h / ih);
        const dw = iw * scale;
        const dh = ih * scale;
        const dx = x + (w - dw) / 2;
        const dy = PAGE_H - yTop - h + (h - dh) / 2;
        p.drawImage(useImg, { x: dx, y: dy, width: dw, height: dh });
      } else {
        // Placeholder box so missing-diagram is visible rather than invisible
        p.drawRectangle({
          x, y: PAGE_H - yTop - h, width: w, height: h,
          borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 0.5,
        });
        p.drawText('Vehicle diagram (no template available)', {
          x: x + 6, y: PAGE_H - yTop - h / 2,
          size: 9, font, color: rgb(0.5, 0.5, 0.5),
        });
      }
      continue;
    }
    if (f.type === 'box') {
      const w = Number(f.width) || 100;
      const h = Number(f.height) || 50;
      p.drawRectangle({
        x,
        y: PAGE_H - yTop - h,
        width: w,
        height: h,
        borderColor: rgb(0, 0, 0),
        borderWidth: 0.7,
      });
      continue;
    }
    if (f.type === 'signature') {
      const w = Number(f.width) || 200;
      const h = Number(f.height) || 40;
      // If the interactive check captured a signature image, draw it inside
      // the box. Pick renter vs customer based on the field's name.
      const lname = String(f.name || '').toLowerCase();
      let sigImg: any = null;
      if (lname.includes('verhuurder') || lname.includes('renter') || lname.includes('staff')) {
        sigImg = renterSigImg;
      } else if (lname.includes('huurder') || lname.includes('customer') || lname.includes('klant')) {
        sigImg = customerSigImg;
      }
      if (sigImg) {
        const iw = sigImg.width;
        const ih = sigImg.height;
        const scale = Math.min(w / iw, h / ih);
        const dw = iw * scale;
        const dh = ih * scale;
        const dx = x + (w - dw) / 2;
        const dy = PAGE_H - yTop - h + (h - dh) / 2;
        p.drawImage(sigImg, { x: dx, y: dy, width: dw, height: dh });
      }
      // Underline at the bottom of the box
      p.drawLine({
        start: { x, y: PAGE_H - yTop - h },
        end: { x: x + w, y: PAGE_H - yTop - h },
        thickness: 0.7, color: rgb(0, 0, 0),
      });
      // Caption above the line
      const label = sanitizeForWinAnsi(String(f.name || 'Signature'));
      p.drawText(label, {
        x: x + 2,
        y: PAGE_H - yTop - h + 3,
        size: Math.min(9, fontSize),
        font,
        color: rgb(0.4, 0.4, 0.4),
      });
      continue;
    }
    if (f.type === 'checkbox') {
      const box = Math.max(8, fontSize - 2);
      // Editor renders the checkbox as an inline-flex with the box vertically
      // centered next to text whose top sits at yTop + ~2 (padding) and whose
      // baseline is at yTop + ~2 + 0.78*fontSize. Place the rect so its top
      // matches the text top and the label uses the shared text baseline.
      const labelTop = yTop + 2;
      const rectTop = labelTop + Math.max(0, (fontSize - box) / 2);
      p.drawRectangle({
        x, y: PAGE_H - rectTop - box,
        width: box, height: box,
        borderColor: rgb(0, 0, 0), borderWidth: 0.7,
      });
      const label = sanitizeForWinAnsi(String(f.name || ''));
      if (label) {
        p.drawText(label, {
          x: x + box + 4,
          y: PAGE_H - labelTop - fontSize * 0.78,
          size: fontSize,
          font: useFont,
          color: rgb(0, 0, 0),
        });
      }
      // Auto-tick the box if this label matches a checked delivery item.
      // Also handles the layout where the label sits in a SEPARATE text field
      // immediately to the right of an empty-named checkbox — we look for any
      // text field whose x is within ~30pt to the right at the same y.
      let effectiveLabel = label;
      if (!effectiveLabel) {
        // Find nearest text field on same row whose name resolves to a known
        // delivery key. Try right side first (typical layout: ☐ Label), then
        // left side. Tolerate ~8pt vertical drift and up to 120pt horizontal.
        const sameRow = fields.filter((g: any) =>
          g !== f && g.type === 'text' && String(g.name || '').trim()
          && (Number(g.page) || 1) === (Number(f.page) || 1)
          && Math.abs((Number(g.y) || 0) - yTop) <= 8,
        );
        const pickSide = (rightSide: boolean) => sameRow
          .filter((g: any) => {
            const dx = (Number(g.x) || 0) - x;
            return rightSide ? (dx > -2 && dx < 120) : (dx < 2 && dx > -200);
          })
          .sort((a: any, b: any) => Math.abs((Number(a.x) || 0) - x) - Math.abs((Number(b.x) || 0) - x));
        const candidates = [...pickSide(true), ...pickSide(false)];
        const matched = candidates.find((g: any) => isDeliveryChecked(String(g.name || '')))
                     || candidates[0];
        if (matched) effectiveLabel = String(matched.name || '');
      }
      if (effectiveLabel && isDeliveryChecked(effectiveLabel)) {
        // Draw an X mark inside the (possibly-shifted) checkbox rect
        const pad = 1.5;
        const bx = x, by = PAGE_H - rectTop - box;
        p.drawLine({ start: { x: bx + pad, y: by + pad }, end: { x: bx + box - pad, y: by + box - pad }, thickness: 0.9, color: rgb(0, 0, 0) });
        p.drawLine({ start: { x: bx + pad, y: by + box - pad }, end: { x: bx + box - pad, y: by + pad }, thickness: 0.9, color: rgb(0, 0, 0) });
      }
      continue;
    }
    if (f.type === 'inspection') {
      // Title — use the same CSS-ascender baseline as text/dynamic fields so
      // the row lines up with neighbouring labels.
      const title = String(f.name || '');
      p.drawText(sanitizeForWinAnsi(title), {
        x, y: PAGE_H - yTop - 2 - fontSize * 0.78,
        size: fontSize, font: useFont, color: rgb(0, 0, 0),
      });
      // Damage type checkboxes underneath
      const types: string[] = Array.isArray(f.damageTypes) ? f.damageTypes : [];
      // Look up what the staff recorded for this label (may be a single answer
      // or CSV of damage codes like "LV,RV" / "voor,achter" / "schoon").
      const recorded = lookupAnswer(title) || '';
      const recordedSet = new Set(
        recorded
          .split(',')
          .map(s => s.trim().toLowerCase())
          .filter(Boolean),
      );
      let cx = x;
      const cy = PAGE_H - yTop - fontSize - 4;
      const optSize = Math.max(7, fontSize - 1);
      const box = optSize;
      for (const t of types) {
        p.drawRectangle({
          x: cx, y: cy - box,
          width: box, height: box,
          borderColor: rgb(0, 0, 0), borderWidth: 0.5,
        });
        // Tick the box if this damage type was recorded for this inspection.
        if (recordedSet.has(String(t).trim().toLowerCase())) {
          const pad = 1;
          p.drawLine({
            start: { x: cx + pad, y: cy - box + pad },
            end:   { x: cx + box - pad, y: cy - pad },
            thickness: 0.9, color: rgb(0, 0, 0),
          });
          p.drawLine({
            start: { x: cx + pad, y: cy - pad },
            end:   { x: cx + box - pad, y: cy - box + pad },
            thickness: 0.9, color: rgb(0, 0, 0),
          });
        }
        p.drawText(sanitizeForWinAnsi(String(t)), { x: cx + box + 3, y: cy - box + 2, size: optSize, font, color: rgb(0, 0, 0) });
        cx += box + 4 + font.widthOfTextAtSize(t, optSize) + 8;
      }
      continue;
    }
    // text / dynamic
    let textVal = String(f.name || '');
    if (f.type === 'dynamic') {
      textVal = dynVals[String(f.source || '')] ?? `{{${f.source || ''}}}`;
    } else if (f.type === 'text') {
      // If this text field is a checklist label/options pair, append the
      // recorded answer (e.g. "schoon / vuil  → schoon"). We try the
      // immediate-left sibling text as the label, falling back to this field's
      // own name.
      const opts = textVal;
      // Detect "options" text by presence of "/" and find the recorded
      // answer(s) so we can circle them in-place when drawing below.
      if (opts.includes('/')) {
        const sameRow = fields.filter((g: any) =>
          g !== f && g.type === 'text' && String(g.name || '').trim()
          && !String(g.name || '').includes('/')
          && (Number(g.page) || 1) === (Number(f.page) || 1)
          && Math.abs((Number(g.y) || 0) - yTop) <= 8,
        );
        const left = sameRow
          .filter((g: any) => (Number(f.x) || 0) - (Number(g.x) || 0) > 0
                           && (Number(f.x) || 0) - (Number(g.x) || 0) < 250)
          .sort((a: any, b: any) => Math.abs((Number(a.x) || 0) - (Number(f.x) || 0))
                                  - Math.abs((Number(b.x) || 0) - (Number(f.x) || 0)));
        const right = sameRow
          .filter((g: any) => (Number(g.x) || 0) - (Number(f.x) || 0) > 0
                           && (Number(g.x) || 0) - (Number(f.x) || 0) < 250)
          .sort((a: any, b: any) => Math.abs((Number(a.x) || 0) - (Number(f.x) || 0))
                                  - Math.abs((Number(b.x) || 0) - (Number(f.x) || 0)));
        const candidates = [...left, ...right];
        const matched = candidates.find((g: any) => lookupAnswer(String(g.name || '')) != null)
                     || candidates[0];
        const labelStr = matched ? String(matched.name || '') : '';
        const ans = lookupAnswer(labelStr);
        if (ans) {
          (f as any).__circleAnswers = ans.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        }
      }
    }
    const sanitized = sanitizeForWinAnsi(textVal);
    // Mirror the editor's text/dynamic box model exactly:
    //   - padding: 1px top, 4px left+right
    //   - NO explicit width (the editor ignores f.width for text fields), so
    //     the div is always content-sized. minWidth: 40 only kicks in for
    //     very short strings.
    // Honoring f.width here would push center-aligned labels off-position
    // versus the editor — the editor draws them at x, not centered across
    // the stored width.
    const PAD_X = 4;
    const PAD_Y = 1;
    const tw = useFont.widthOfTextAtSize(sanitized, fontSize);
    const boxW = Math.max(tw + PAD_X * 2, 40);
    const contentLeft = x + PAD_X;
    const contentW = Math.max(0, boxW - PAD_X * 2);
    let drawX = contentLeft;
    if (f.textAlign === 'center') drawX = contentLeft + (contentW - tw) / 2;
    else if (f.textAlign === 'right') drawX = contentLeft + contentW - tw;
    // Match the editor's CSS baseline: text top at yTop + PAD_Y, baseline
    // at yTop + PAD_Y + 0.78*fontSize (Helvetica ascender ratio). Use the
    // same formula as the checkbox label so text fields and checkbox labels
    // sit on the SAME row instead of drifting ~5pt apart.
    const drawY = PAGE_H - yTop - PAD_Y - fontSize * 0.78;
    p.drawText(sanitized, { x: drawX, y: drawY, size: fontSize, font: useFont, color: rgb(0, 0, 0) });

    // Circle the selected option(s) inside an options field like "ja / nee".
    // We split on "/" and ellipse the substring(s) whose trimmed text matches
    // one of the recorded answers (case-insensitive).
    const circles: string[] | undefined = (f as any).__circleAnswers;
    if (circles && circles.length > 0) {
      const parts = sanitized.split('/');
      let cursor = 0;
      for (let i = 0; i < parts.length; i++) {
        const seg = parts[i];
        const trimmed = seg.trim().toLowerCase();
        if (circles.includes(trimmed)) {
          const leadingSpaces = seg.length - seg.trimStart().length;
          const beforeText = sanitized.slice(0, cursor + leadingSpaces);
          const wordText = seg.trim();
          const wordX = drawX + useFont.widthOfTextAtSize(beforeText, fontSize);
          const wordW = useFont.widthOfTextAtSize(wordText, fontSize);
          const padX = Math.max(2, fontSize * 0.3);
          const padY = Math.max(2, fontSize * 0.25);
          const cx = wordX + wordW / 2;
          const cy = drawY + fontSize * 0.35;
          const rx = wordW / 2 + padX;
          const ry = fontSize * 0.6 + padY;
          p.drawEllipse({
            x: cx, y: cy,
            xScale: rx, yScale: ry,
            borderColor: rgb(0, 0, 0),
            borderWidth: 1,
          });
        }
        cursor += seg.length + (i < parts.length - 1 ? 1 : 0); // +1 for "/"
      }
    }
  }

  // Ensure at least one page
  if (pdfDoc.getPageCount() === 0) pdfDoc.addPage([595, 842]);

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

/**
 * Draws optional header / footer text on every page of the document.
 * Shared by both the standard and section-based render paths so configured
 * text appears consistently regardless of which renderer is used.
 */
function applyHeaderFooterOverlay(
  pdfDoc: PDFDocument,
  font: any,
  headerTextRaw: string | null | undefined,
  footerTextRaw: string | null | undefined,
  margin: number,
): void {
  const headerText = (headerTextRaw ?? '').trim();
  const footerText = (footerTextRaw ?? '').trim();
  if (!headerText && !footerText) return;
  for (const p of pdfDoc.getPages()) {
    const { width: pw, height: ph } = p.getSize();
    if (headerText) {
      const line = headerText.replace(/\s+/g, ' ').substring(0, 140);
      const textWidth = font.widthOfTextAtSize(line, 7);
      p.drawText(line, {
        x: Math.max(margin, (pw - textWidth) / 2),
        y: ph - 12,
        size: 7,
        font,
        color: rgb(0.35, 0.35, 0.35),
      });
    }
    if (footerText) {
      const line = footerText.replace(/\s+/g, ' ').substring(0, 160);
      const textWidth = font.widthOfTextAtSize(line, 7);
      p.drawText(line, {
        x: Math.max(margin, (pw - textWidth) / 2),
        y: 12,
        size: 7,
        font,
        color: rgb(0.35, 0.35, 0.35),
      });
    }
  }
}

/**
 * Generate damage check PDF using the template system with custom section layout
 */
export async function generateDamageCheckPDFWithTemplate(
  vehicle: VehicleData,
  damageTemplate: DamageCheckTemplate,
  reservationData?: ReservationData,
  interactiveDamageCheck?: any,
  inspectorName?: string,
): Promise<Buffer> {
  return generateDamageCheckPDFFromCanvas(vehicle, damageTemplate, reservationData, interactiveDamageCheck, inspectorName);
}
