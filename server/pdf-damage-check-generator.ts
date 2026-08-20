import { PDFDocument, PDFPage, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs/promises';
import path from 'path';
import { db } from './db';
import { damageCheckPdfTemplates, damageCheckTemplates, vehicleDiagramTemplates } from '../shared/schema';
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

interface InspectionPoint {
  name: string;
  category: string;
  damageTypes: string[];
  // Phase 1 additions — present in stored templates, optional here for back-compat.
  inputType?: "checkbox" | "text" | "dropdown";
  dropdownOptions?: string[];
  notes?: string;
  required?: boolean;
  // Used by the PDF-template-driven render path to bind a point to a
  // checklistData field in an interactive damage check.
  fieldKey?: string;
}

interface TemplateCategory {
  id: string;
  label: string;
  order?: number;
  // Phase 2 layout controls (per category):
  columns?: 1 | 2 | 3 | 4;
  alignment?: "left" | "center" | "right";
}

interface HandoverChecklistItem {
  id: string;
  label: string;
  type: "checkbox" | "text";
  order?: number;
}

interface DamageCheckTemplate {
  id?: number;
  name: string;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  vehicleType?: string | null;
  buildYearFrom?: number | null;
  buildYearTo?: number | null;
  inspectionPoints: InspectionPoint[];
  diagramTopView?: string | null;
  diagramFrontView?: string | null;
  diagramRearView?: string | null;
  diagramSideView?: string | null;
  isDefault?: boolean;
  // Phase 1 additions
  categories?: TemplateCategory[] | null;
  handoverChecklist?: HandoverChecklistItem[] | null;
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

export async function generateDamageCheckPDF(
  vehicle: VehicleData,
  template: DamageCheckTemplate,
  reservationData?: ReservationData
): Promise<Buffer> {
  // Canvas-mode templates render via the free-positioning path on a blank A4.
  if (template && Array.isArray((template as any).canvasFields) && (template as any).canvasFields.length > 0) {
    return generateDamageCheckPDFFromCanvas(vehicle, template, reservationData);
  }
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([595, 842]); // A4 size
  const { width, height } = page.getSize();
  
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  const margin = 40;
  let yPosition = height - margin;
  
  // Helper function to ensure we have space on page
  const ensureSpace = (requiredSpace: number): PDFPage => {
    if (yPosition < requiredSpace + margin) {
      page = pdfDoc.addPage([595, 842]);
      yPosition = height - margin;
    }
    return page;
  };
  
  // Helper function to draw a box with text
  const drawBox = (currentPage: PDFPage, x: number, y: number, w: number, h: number, label?: string, value?: string) => {
    currentPage.drawRectangle({
      x,
      y: y - h,
      width: w,
      height: h,
      borderColor: rgb(0, 0, 0),
      borderWidth: 0.5,
    });
    
    if (label) {
      currentPage.drawText(label, {
        x: x + 3,
        y: y - h + 3,
        size: 7,
        font,
        color: rgb(0.4, 0.4, 0.4),
      });
    }
    
    if (value) {
      currentPage.drawText(value, {
        x: x + 3,
        y: y - h + 13,
        size: 9,
        font: boldFont,
      });
    }
  };
  
  // Header
  page.drawRectangle({
    x: margin,
    y: yPosition - 35,
    width: width - margin * 2,
    height: 35,
    color: rgb(0.1, 0.3, 0.6),
  });
  
  page.drawText('VERHUURCONTRACT / SCHADEFORMULIER', {
    x: margin + 10,
    y: yPosition - 22,
    size: 16,
    font: boldFont,
    color: rgb(1, 1, 1),
  });
  
  yPosition -= 50;
  
  // Contract and Customer Information Section
  if (reservationData) {
    page.drawText('GEGEVENS HUURDER', {
      x: margin,
      y: yPosition,
      size: 11,
      font: boldFont,
    });
    
    yPosition -= 20;
    
    const boxHeight = 28;
    const col1Width = 120;
    const col2Width = 150;
    
    // Contract Number and Customer Name
    drawBox(page, margin, yPosition, col1Width, boxHeight, 'Contractnummer', reservationData.contractNumber || 'N/A');
    drawBox(page, margin + col1Width + 5, yPosition, col2Width, boxHeight, 'Naam huurder', reservationData.customerName || 'N/A');
    
    yPosition -= boxHeight + 5;
    
    // Rental period
    if (reservationData.startDate && reservationData.endDate) {
      drawBox(page, margin, yPosition, col1Width, boxHeight, 'Huurperiode van', reservationData.startDate);
      drawBox(page, margin + col1Width + 5, yPosition, col1Width, boxHeight, 'Tot', reservationData.endDate);
      drawBox(page, margin + col1Width * 2 + 10, yPosition, 60, boxHeight, 'Dagen', reservationData.rentalDays?.toString() || '');
    }
    
    yPosition -= boxHeight + 15;
  }
  
  // Vehicle Information Section
  page.drawText('GEGEVENS VOERTUIG', {
    x: margin,
    y: yPosition,
    size: 11,
    font: boldFont,
  });
  
  yPosition -= 20;
  
  const vBoxHeight = 28;
  const vCol1 = 100;
  const vCol2 = 120;
  const vCol3 = 80;
  
  // Row 1: Brand, Model, License Plate
  drawBox(page, margin, yPosition, vCol1, vBoxHeight, 'Merk', vehicle.brand);
  drawBox(page, margin + vCol1 + 5, yPosition, vCol2, vBoxHeight, 'Type/Model', vehicle.model);
  drawBox(page, margin + vCol1 + vCol2 + 10, yPosition, vCol3, vBoxHeight, 'Kenteken', formatLicensePlate(vehicle.licensePlate));
  
  yPosition -= vBoxHeight + 5;
  
  // Row 2: Build Year, Fuel, Mileage
  if (vehicle.buildYear || vehicle.fuel || vehicle.mileage) {
    drawBox(page, margin, yPosition, vCol1, vBoxHeight, 'Bouwjaar', vehicle.buildYear || '');
    drawBox(page, margin + vCol1 + 5, yPosition, vCol2, vBoxHeight, 'Brandstof', vehicle.fuel || '');
    drawBox(page, margin + vCol1 + vCol2 + 10, yPosition, vCol3, vBoxHeight, 'KM-stand', vehicle.mileage?.toString() || '');
    yPosition -= vBoxHeight + 5;
  }
  
  yPosition -= 15;
  
  // Damage Check Section
  page.drawText('SCHADECONTROLE', {
    x: margin,
    y: yPosition,
    size: 11,
    font: boldFont,
  });
  
  yPosition -= 15;
  
  page.drawText('(Kruis aan wat van toepassing is)', {
    x: margin,
    y: yPosition,
    size: 8,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });
  
  yPosition -= 20;
  
  // Extract unique categories from template inspection points
  const categorySet = new Set<string>();
  template.inspectionPoints.forEach(p => {
    if (p.category) categorySet.add(p.category);
  });

  // Prefer the template's configured category ordering when available, so
  // editors control the section order on the PDF.
  const configuredOrder = (template.categories ?? [])
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map(c => c.id);
  const categories: string[] = [
    ...configuredOrder.filter(id => categorySet.has(id)),
    ...Array.from(categorySet).filter(id => !configuredOrder.includes(id)),
  ];

  // Build a label lookup that prefers the per-template configured label and
  // falls back to a humanised version of the category id.
  const categoryLabels: Record<string, string> = {};
  categories.forEach(cat => {
    const configured = template.categories?.find(c => c.id === cat);
    categoryLabels[cat] = configured?.label?.toUpperCase()
      || cat.replace(/_/g, ' ').toUpperCase();
  });
  
  // Extract all unique damage types from all inspection points to use as column headers
  const damageTypeSet = new Set<string>();
  template.inspectionPoints.forEach(p => {
    if (p.damageTypes && Array.isArray(p.damageTypes)) {
      p.damageTypes.forEach(dt => damageTypeSet.add(dt));
    }
  });
  
  // Use template damage types if available, otherwise fallback to standard Dutch types
  const damageTypes = damageTypeSet.size > 0 
    ? Array.from(damageTypeSet) 
    : ['Kapot', 'Gat', 'Kras', 'Deuk', 'Ster'];
  
  const checkboxSize = 8;
  const nameColumnWidth = 150;
  const damageColumnWidth = Math.max(18, Math.floor((width - margin * 2 - nameColumnWidth - 10) / damageTypes.length));
  
  for (const category of categories) {
    const points = template.inspectionPoints.filter(p => p.category === category);
    if (points.length === 0) continue;

    // Per-category layout overrides (Phase 2). Defaults preserve the prior
    // single-column / left-aligned rendering when not configured.
    const categoryConfig = template.categories?.find(c => c.id === category);
    const categoryAlignment = categoryConfig?.alignment ?? 'left';
    const categoryColumns = Math.max(1, Math.min(4, categoryConfig?.columns ?? 1));

    // Ensure space for category header
    page = ensureSpace(100);

    // Category header
    page.drawRectangle({
      x: margin,
      y: yPosition - 18,
      width: width - margin * 2,
      height: 18,
      color: rgb(0.2, 0.4, 0.7),
    });

    const headerLabel = categoryLabels[category as keyof typeof categoryLabels] || category;
    const headerWidth = boldFont.widthOfTextAtSize(headerLabel, 10);
    let headerX = margin + 5;
    if (categoryAlignment === 'center') {
      headerX = margin + (width - margin * 2 - headerWidth) / 2;
    } else if (categoryAlignment === 'right') {
      headerX = width - margin - 5 - headerWidth;
    }
    page.drawText(headerLabel, {
      x: headerX,
      y: yPosition - 13,
      size: 10,
      font: boldFont,
      color: rgb(1, 1, 1),
    });

    yPosition -= 20;

    // Multi-column rendering path — only used when columns > 1 AND none of
    // the category's points need the full-width damage-type checkbox grid.
    // Mixing the two would cause overlap, so we keep checkbox-grid points on
    // the single-column path.
    const hasCheckboxGrid = points.some(p => !p.inputType || p.inputType === 'checkbox');
    if (categoryColumns > 1 && !hasCheckboxGrid) {
      const colGap = 8;
      const colWidth = (width - margin * 2 - colGap * (categoryColumns - 1)) / categoryColumns;
      const rowsNeeded = Math.ceil(points.length / categoryColumns);
      const rowHeight = 16;

      for (let r = 0; r < rowsNeeded; r++) {
        page = ensureSpace(rowHeight + 10);
        for (let c = 0; c < categoryColumns; c++) {
          const idx = r * categoryColumns + c;
          const point = points[idx];
          if (!point) continue;
          const colX = margin + c * (colWidth + colGap);

          // Align the point name within its column based on category alignment.
          const nameSize = 8;
          const nameWidth = font.widthOfTextAtSize(point.name, nameSize);
          let nameX = colX;
          if (categoryAlignment === 'center') {
            nameX = colX + (colWidth - nameWidth) / 2;
          } else if (categoryAlignment === 'right') {
            nameX = colX + colWidth - nameWidth;
          }
          page.drawText(point.name, { x: nameX, y: yPosition, size: nameSize, font });

          if (point.inputType === 'text') {
            // Underline under the name as a write-in field.
            page.drawLine({
              start: { x: colX, y: yPosition - 3 },
              end: { x: colX + colWidth, y: yPosition - 3 },
              thickness: 0.5,
              color: rgb(0, 0, 0),
            });
          } else if (point.inputType === 'dropdown') {
            // Render checkable options below the name, wrapped within col width.
            const opts = (point.dropdownOptions ?? []).slice(0, 4);
            const checkboxSize = 7;
            let optX = colX;
            const optY = yPosition - 11;
            for (const opt of opts) {
              const label = opt.substring(0, 10);
              const labelWidth = font.widthOfTextAtSize(label, 6);
              const slot = checkboxSize + 2 + labelWidth + 4;
              if (optX + slot > colX + colWidth) break;
              page.drawRectangle({
                x: optX,
                y: optY,
                width: checkboxSize,
                height: checkboxSize,
                borderColor: rgb(0, 0, 0),
                borderWidth: 0.5,
              });
              page.drawText(label, {
                x: optX + checkboxSize + 2,
                y: optY + 1,
                size: 6,
                font,
              });
              optX += slot;
            }
          }
        }
        yPosition -= rowHeight + (points.some(p => p.inputType === 'dropdown') ? 6 : 0);
      }

      yPosition -= 10;
      continue;
    }
    
    // Damage type column headers
    let xPos = margin + nameColumnWidth + 10;
    for (const damageType of damageTypes) {
      page.drawText(damageType.substring(0, 4), {
        x: xPos,
        y: yPosition,
        size: 7,
        font: boldFont,
      });
      xPos += damageColumnWidth;
    }
    
    yPosition -= 12;
    
    // Inspection points with checkboxes (or a free-text line / dropdown row
    // depending on the point's inputType — Phase 1 additions).
    for (const point of points) {
      // Ensure space for this row
      page = ensureSpace(50);

      // Point name
      page.drawText(point.name, {
        x: margin + 5,
        y: yPosition,
        size: 8,
        font,
      });

      if (point.inputType === 'text') {
        // Draw a single full-width underline as a write-in field instead of
        // the checkbox grid.
        const lineY = yPosition - 1;
        page.drawLine({
          start: { x: margin + nameColumnWidth + 10, y: lineY },
          end: { x: width - margin - 5, y: lineY },
          thickness: 0.5,
          color: rgb(0, 0, 0),
        });
      } else if (point.inputType === 'dropdown') {
        // Render each option with its own checkbox so the inspector can
        // circle/check the chosen one. Width is measured ahead of time and
        // overflowing options are skipped instead of bleeding past the right
        // margin.
        const opts = (point.dropdownOptions ?? []).slice(0, 8);
        const optionGap = 8;
        const rightLimit = width - margin - 5;
        let optX = margin + nameColumnWidth + 10;
        for (const opt of opts) {
          const label = opt.substring(0, 12);
          const labelWidth = font.widthOfTextAtSize(label, 7);
          const slotWidth = checkboxSize + 3 + labelWidth + optionGap;
          if (optX + slotWidth > rightLimit) break;
          page.drawRectangle({
            x: optX,
            y: yPosition - 1,
            width: checkboxSize,
            height: checkboxSize,
            borderColor: rgb(0, 0, 0),
            borderWidth: 0.5,
          });
          page.drawText(label, {
            x: optX + checkboxSize + 3,
            y: yPosition,
            size: 7,
            font,
          });
          optX += slotWidth;
        }
      } else {
        // Default: damage-type checkbox grid (existing behaviour).
        let checkXPos = margin + nameColumnWidth + 10;
        for (const damageType of damageTypes) {
          page.drawRectangle({
            x: checkXPos + 2,
            y: yPosition - 1,
            width: checkboxSize,
            height: checkboxSize,
            borderColor: rgb(0, 0, 0),
            borderWidth: 0.5,
          });
          checkXPos += damageColumnWidth;
        }
      }

      yPosition -= 14;

      // Per-point notes are printed in small italic under the row when present.
      if (point.notes) {
        page = ensureSpace(20);
        page.drawText(point.notes.substring(0, 120), {
          x: margin + 12,
          y: yPosition,
          size: 7,
          font,
          color: rgb(0.35, 0.35, 0.35),
        });
        yPosition -= 10;
      }
    }
    
    yPosition -= 10;
  }
  
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
  
  // Ensure space for signatures
  page = ensureSpace(100);
  
  // Signature Section
  page.drawText('HANDTEKENINGEN', {
    x: margin,
    y: yPosition,
    size: 10,
    font: boldFont,
  });
  
  yPosition -= 15;
  
  const signatureBoxWidth = (width - margin * 2 - 10) / 2;
  const signatureBoxHeight = 60;
  
  // Customer signature
  drawBox(page, margin, yPosition, signatureBoxWidth, signatureBoxHeight, 'Handtekening huurder');
  page.drawText('Datum: ___/___/______', {
    x: margin + 5,
    y: yPosition - signatureBoxHeight + 5,
    size: 8,
    font,
  });
  
  // Company signature
  drawBox(page, margin + signatureBoxWidth + 10, yPosition, signatureBoxWidth, signatureBoxHeight, 'Handtekening verhuurder');
  page.drawText('Datum: ___/___/______', {
    x: margin + signatureBoxWidth + 15,
    y: yPosition - signatureBoxHeight + 5,
    size: 8,
    font,
  });
  
  // ---------------------------------------------------------------------
  // Handover checklist (Phase 1) — rendered after signatures when defined.
  // ---------------------------------------------------------------------
  if (template.handoverChecklist && template.handoverChecklist.length > 0) {
    const items = template.handoverChecklist
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    page = ensureSpace(40 + items.length * 14);
    yPosition -= 20;
    page.drawText('OVERDRACHT / HANDOVER CHECKLIST', {
      x: margin,
      y: yPosition,
      size: 10,
      font: boldFont,
    });
    yPosition -= 14;
    for (const item of items) {
      page = ensureSpace(20);
      if (item.type === 'checkbox') {
        page.drawRectangle({
          x: margin,
          y: yPosition - 1,
          width: 8,
          height: 8,
          borderColor: rgb(0, 0, 0),
          borderWidth: 0.5,
        });
        page.drawText(item.label, {
          x: margin + 14,
          y: yPosition,
          size: 8,
          font,
        });
      } else {
        page.drawText(`${item.label}:`, {
          x: margin,
          y: yPosition,
          size: 8,
          font: boldFont,
        });
        const labelWidth = boldFont.widthOfTextAtSize(`${item.label}:`, 8);
        page.drawLine({
          start: { x: margin + labelWidth + 6, y: yPosition - 1 },
          end: { x: width - margin, y: yPosition - 1 },
          thickness: 0.5,
          color: rgb(0, 0, 0),
        });
      }
      yPosition -= 14;
    }
  }

  // Per-page header / footer overlay (Phase 1).
  applyHeaderFooterOverlay(pdfDoc, font, template.headerText, template.footerText, margin);

  // Footer on last page — keeps the template-name watermark for traceability.
  const lastPage = pdfDoc.getPages()[pdfDoc.getPageCount() - 1];
  lastPage.drawText(`Template: ${template.name}`, {
    x: margin,
    y: (template.footerText ?? '').trim() ? 22 : 30,
    size: 7,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
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
  // Canvas-mode short-circuit: ignore the PDF sections template and render
  // directly from the canvas fields stored on the damage check template.
  if (damageTemplate && Array.isArray((damageTemplate as any).canvasFields) && (damageTemplate as any).canvasFields.length > 0) {
    return generateDamageCheckPDFFromCanvas(vehicle, damageTemplate, reservationData, interactiveDamageCheck, inspectorName);
  }
  // Fetch the default PDF template
  const [pdfTemplate] = await db.select().from(damageCheckPdfTemplates).where(eq(damageCheckPdfTemplates.isDefault, true)).limit(1);
  
  // If no template found, fall back to standard generation
  if (!pdfTemplate || !pdfTemplate.sections) {
    return generateDamageCheckPDF(vehicle, damageTemplate, reservationData);
  }

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4 size
  const { height } = page.getSize();
  
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  // Helper to convert hex color to RGB
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16) / 255,
      g: parseInt(result[2], 16) / 255,
      b: parseInt(result[3], 16) / 255
    } : { r: 0.2, g: 0.3, b: 0.6 };
  };
  
  // Render each visible section based on template
  for (const section of (pdfTemplate.sections as PdfTemplateSection[])) {
    if (!section.visible) continue;
    
    // PDF coordinates are from bottom-left, so convert from top-left
    const pdfY = height - section.y - section.height;
    
    switch (section.type) {
      case 'header': {
        const headerColor = hexToRgb(section.settings.headerColor || '#334d99');
        const headerFontSize = section.settings.headerFontSize || 14;
        const companyName = section.settings.companyName || 'LAM GROUP';
        
        // Draw header background
        page.drawRectangle({
          x: section.x,
          y: pdfY,
          width: section.width,
          height: section.height,
          color: rgb(headerColor.r, headerColor.g, headerColor.b),
        });
        
        // Draw company name
        page.drawText(companyName, {
          x: section.x + section.width / 2 - (companyName.length * headerFontSize * 0.3),
          y: pdfY + section.height / 2 - headerFontSize / 2,
          size: headerFontSize,
          font: boldFont,
          color: rgb(1, 1, 1),
        });
        
        // Load logo if available
        if (section.settings.logoPath) {
          try {
            const logoPath = path.join(process.cwd(), section.settings.logoPath);
            const logoBytes = await fs.readFile(logoPath);
            let logoImage;
            
            if (section.settings.logoPath.toLowerCase().endsWith('.png')) {
              logoImage = await pdfDoc.embedPng(logoBytes);
            } else if (section.settings.logoPath.toLowerCase().match(/\.(jpg|jpeg)$/)) {
              logoImage = await pdfDoc.embedJpg(logoBytes);
            }
            
            if (logoImage) {
              const logoHeight = section.height * 0.8;
              const logoWidth = (logoImage.width / logoImage.height) * logoHeight;
              page.drawImage(logoImage, {
                x: section.x + 10,
                y: pdfY + (section.height - logoHeight) / 2,
                width: logoWidth,
                height: logoHeight,
              });
            }
          } catch (error) {
            console.warn('Could not load logo:', error);
          }
        }
        break;
      }
      
      case 'contractInfo': {
        const fontSize = section.settings.fontSize || 9;
        const lineHeight = fontSize + 4;
        const checkboxSize = section.settings.checkboxSize || 8;
        const sectionLabel = section.settings.customLabel || 'CONTRACTGEGEVENS';
        const columnCount = section.settings.columnCount || 1;
        let yPos = pdfY + section.height - 15;
        
        page.drawText(sectionLabel, {
          x: section.x + 5,
          y: yPos,
          size: fontSize + 1,
          font: boldFont,
        });
        
        yPos -= lineHeight;
        
        // Render custom items with actual data in columns
        if (section.settings.customItems && section.settings.customItems.length > 0) {
          const columnGap = 10;
          const columnWidth = (section.width - 10 - (columnGap * (columnCount - 1))) / columnCount;
          const itemsPerColumn = Math.ceil(section.settings.customItems.length / columnCount);
          
          section.settings.customItems.forEach((item: any, index: number) => {
            const columnIndex = Math.floor(index / itemsPerColumn);
            const rowInColumn = index % itemsPerColumn;
            const xPos = section.x + 5 + (columnIndex * (columnWidth + columnGap));
            const itemY = yPos - (rowInColumn * lineHeight);
            
            if (itemY < pdfY + 10) return; // Stop if we run out of space
            
            let textX = xPos;
            
            if (item.hasCheckbox) {
              page.drawRectangle({
                x: textX,
                y: itemY - checkboxSize,
                width: checkboxSize,
                height: checkboxSize,
                borderColor: rgb(0, 0, 0),
                borderWidth: 0.5,
              });
              textX += checkboxSize + 5;
            }
            
            // Get actual value based on fieldKey
            let displayText = item.text;
            if (item.fieldKey && reservationData) {
              const valueMap: Record<string, string> = {
                contractNumber: reservationData.contractNumber || 'N/A',
                date: new Date().toLocaleDateString('nl-NL'),
                customerName: reservationData.customerName || 'N/A',
                rentalPeriod: `${reservationData.startDate || ''} - ${reservationData.endDate || ''}`,
              };
              const value = valueMap[item.fieldKey] || '';
              displayText = `${item.text} ${value}`;
            }
            
            page.drawText(displayText, {
              x: textX,
              y: itemY - checkboxSize + 1,
              size: fontSize,
              font,
            });
          });
        }
        break;
      }
      
      case 'vehicleData': {
        const fontSize = section.settings.fontSize || 9;
        const lineHeight = fontSize + 4;
        const checkboxSize = section.settings.checkboxSize || 8;
        const sectionLabel = section.settings.customLabel || 'VOERTUIGGEGEVENS';
        const columnCount = section.settings.columnCount || 1;
        let yPos = pdfY + section.height - 15;
        
        page.drawText(sectionLabel, {
          x: section.x + 5,
          y: yPos,
          size: fontSize + 1,
          font: boldFont,
        });
        
        yPos -= lineHeight;
        
        // Render custom items with actual data in columns
        if (section.settings.customItems && section.settings.customItems.length > 0) {
          const columnGap = 10;
          const columnWidth = (section.width - 10 - (columnGap * (columnCount - 1))) / columnCount;
          const itemsPerColumn = Math.ceil(section.settings.customItems.length / columnCount);
          
          section.settings.customItems.forEach((item: any, index: number) => {
            const columnIndex = Math.floor(index / itemsPerColumn);
            const rowInColumn = index % itemsPerColumn;
            const xPos = section.x + 5 + (columnIndex * (columnWidth + columnGap));
            const itemY = yPos - (rowInColumn * lineHeight);
            
            if (itemY < pdfY + 10) return; // Stop if we run out of space
            
            let textX = xPos;
            
            if (item.hasCheckbox) {
              page.drawRectangle({
                x: textX,
                y: itemY - checkboxSize,
                width: checkboxSize,
                height: checkboxSize,
                borderColor: rgb(0, 0, 0),
                borderWidth: 0.5,
              });
              textX += checkboxSize + 5;
            }
            
            // Get actual value based on fieldKey
            let displayText = item.text;
            if (item.fieldKey) {
              const valueMap: Record<string, string> = {
                licensePlate: vehicle.licensePlate ? formatLicensePlate(vehicle.licensePlate) : 'N/A',
                brand: vehicle.brand || 'N/A',
                model: vehicle.model || 'N/A',
                buildYear: vehicle.buildYear ? String(vehicle.buildYear) : 'N/A',
                mileage: vehicle.mileage ? `${vehicle.mileage} km` : 'N/A',
                fuel: vehicle.fuel || 'N/A',
              };
              const value = valueMap[item.fieldKey] || '';
              displayText = `${item.text} ${value}`;
            }
            
            page.drawText(displayText, {
              x: textX,
              y: itemY - checkboxSize + 1,
              size: fontSize,
              font,
            });
          });
        }
        break;
      }
      
      case 'checklist': {
        const fontSize = section.settings.fontSize || 8;
        const checkboxSize = section.settings.checkboxSize || 8;
        const lineHeight = fontSize + 3;
        const sectionLabel = section.settings.customLabel || 'SCHADECONTROLE';
        const columnCount = section.settings.columnCount || 3;
        let yPos = pdfY + section.height - 15;
        
        page.drawText(sectionLabel, {
          x: section.x + 5,
          y: yPos,
          size: fontSize + 2,
          font: boldFont,
        });
        
        yPos -= lineHeight * 2;
        
        // Parse checklist data from interactive damage check
        let checklistData: any = null;
        if (interactiveDamageCheck && interactiveDamageCheck.checklistData) {
          try {
            checklistData = typeof interactiveDamageCheck.checklistData === 'string' 
              ? JSON.parse(interactiveDamageCheck.checklistData)
              : interactiveDamageCheck.checklistData;
            console.log('📋 Parsed checklist data for PDF:', JSON.stringify(checklistData, null, 2));
          } catch (error) {
            console.warn('Could not parse checklist data:', error);
          }
        } else {
          console.log('⚠️ No checklist data found in interactive damage check');
        }
        
        // Group inspection points by category
        const categories = ['interieur', 'exterieur', 'afweez_check'];
        const categoryLabels: Record<string, string> = {
          interieur: 'Interieur',
          exterieur: 'Exterieur',
          afweez_check: 'Aflever Check'
        };
        
        // Calculate column width
        const columnWidth = (section.width - 10) / columnCount;
        const columnGap = 8;
        let currentColumn = 0;
        let columnYPos = yPos;
        
        for (const category of categories) {
          // Handle missing inspection points gracefully
          if (!damageTemplate.inspectionPoints || !Array.isArray(damageTemplate.inspectionPoints)) {
            console.warn('Damage template has no inspection points defined');
            break;
          }
          const points = damageTemplate.inspectionPoints.filter(p => p.category === category);
          if (points.length === 0) continue;
          
          // Check if we need to move to next column
          const categoryHeight = (points.length + 1) * lineHeight + lineHeight / 2;
          if (columnYPos - categoryHeight < pdfY + 10 && currentColumn < columnCount - 1) {
            currentColumn++;
            columnYPos = yPos;
          }
          
          const columnX = section.x + 5 + (currentColumn * (columnWidth + columnGap));
          
          // Category header
          page.drawText(categoryLabels[category] || category, {
            x: columnX,
            y: columnYPos,
            size: fontSize + 1,
            font: boldFont,
          });
          
          columnYPos -= lineHeight;
          
          // Inspection points
          for (const point of points) {
            if (columnYPos < pdfY + 10) {
              // Move to next column if we run out of space
              if (currentColumn < columnCount - 1) {
                currentColumn++;
                columnYPos = yPos;
              } else {
                break; // No more space
              }
            }
            
            const itemX = section.x + 5 + (currentColumn * (columnWidth + columnGap));
            
            // Get the value from checklistData if available
            let itemValue = '';
            let rawBooleanValue: boolean = false;
            if (checklistData) {
              const categoryKey = category === 'interieur' ? 'interior' : 
                                 category === 'exterieur' ? 'exterior' : 'delivery';
              const categoryData = checklistData[categoryKey];
              
              console.log(`🔍 Looking up checklist item: category=${category}, fieldKey=${point.fieldKey}, categoryKey=${categoryKey}, found=${!!categoryData}`);
              
              if (categoryData && point.fieldKey) {
                itemValue = categoryData[point.fieldKey];
                console.log(`✅ Found value for ${point.fieldKey}: ${itemValue}`);
                // For delivery category, save the raw boolean before converting
                if (categoryKey === 'delivery' && typeof itemValue === 'boolean') {
                  rawBooleanValue = itemValue;
                }
              } else {
                console.log(`❌ No value found for ${point.fieldKey} in category ${categoryKey}`);
              }
            }
            
            // For delivery/afweez_check category: use checkbox with X
            // For other categories: show the selected value in bold text (no box)
            // Fixed width for value column to ensure even spacing
            const fixedValueWidth = 35; // Fixed width for the value column (checkbox/value + gap)
            
            if (category === 'afweez_check') {
              // Checkbox for delivery checks - use raw boolean value
              console.log(`📦 Delivery check: ${point.fieldKey}, itemValue=${itemValue}, rawBooleanValue=${rawBooleanValue}, typeof=${typeof itemValue}`);
              const isChecked: boolean = Boolean(rawBooleanValue);
              console.log(`🎯 isChecked for ${point.fieldKey}: ${isChecked}`);
              
              page.drawRectangle({
                x: itemX + 5,
                y: columnYPos - checkboxSize,
                width: checkboxSize,
                height: checkboxSize,
                borderColor: rgb(0, 0, 0),
                borderWidth: 0.5,
              });
              
              // Draw X if checked - bigger and centered
              if (isChecked) {
                console.log(`✏️ Drawing X for ${point.fieldKey} at position (${itemX + 6.5}, ${columnYPos - checkboxSize + 2})`);
                page.drawText('X', {
                  x: itemX + 5.5,
                  y: columnYPos - checkboxSize + 1.5,
                  size: 10,  // Bigger X for visibility
                  font: boldFont,
                  color: rgb(0, 0, 0),
                });
              }
            } else {
              // For interieur/exterieur: show the selected value in bold text (no box)
              const displayValue = itemValue && itemValue !== '' ? itemValue : '';
              
              if (displayValue) {
                page.drawText(displayValue, {
                  x: itemX + 5,
                  y: columnYPos - checkboxSize + 1.5,
                  size: fontSize,
                  font: boldFont,
                  color: rgb(0, 0, 0),
                });
              } else {
                // If no value, show a dash
                page.drawText('-', {
                  x: itemX + 5,
                  y: columnYPos - checkboxSize + 1.5,
                  size: fontSize,
                  font: boldFont,
                  color: rgb(0.5, 0.5, 0.5),
                });
              }
            }
            
            // Point name positioned after the fixed-width value column
            const maxTextWidth = columnWidth - fixedValueWidth - 15;
            let displayText = point.name;
            
            const textWidth = font.widthOfTextAtSize(displayText, fontSize);
            
            if (textWidth > maxTextWidth) {
              // Truncate with ellipsis if text is too long
              while (font.widthOfTextAtSize(displayText + '...', fontSize) > maxTextWidth && displayText.length > 0) {
                displayText = displayText.slice(0, -1);
              }
              displayText += '...';
            }
            
            page.drawText(displayText, {
              x: itemX + fixedValueWidth + 10,
              y: columnYPos - checkboxSize + 1,
              size: fontSize,
              font,
            });
            
            columnYPos -= lineHeight;
          }
          
          columnYPos -= lineHeight / 2; // Extra space between categories
        }
        break;
      }
      
      case 'diagram': {
        // Draw diagram placeholder box
        page.drawRectangle({
          x: section.x,
          y: pdfY,
          width: section.width,
          height: section.height,
          borderColor: rgb(0.7, 0.7, 0.7),
          borderWidth: 1,
        });
        
        let diagramLoaded = false;
        
        // First, try to use the interactive damage check diagram with annotations
        if (interactiveDamageCheck?.diagramWithAnnotations) {
          console.log('🖼️ Using interactive damage check diagram with annotations');
          try {
            // Extract base64 data from data URL (format: data:image/png;base64,...)
            const base64Data = interactiveDamageCheck.diagramWithAnnotations.split(',')[1];
            if (base64Data) {
              const diagramBytes = Buffer.from(base64Data, 'base64');
              const diagramImage = await pdfDoc.embedPng(diagramBytes);
              
              // Apply padding to constrain diagram width
              const sidePadding = 5; // Increased padding for clear margins
              const maxWidth = section.width - (sidePadding * 2);
              const maxHeight = section.height - 20;
              
              // Calculate dimensions maintaining aspect ratio
              const aspectRatio = diagramImage.width / diagramImage.height;
              let imgWidth = maxWidth;
              let imgHeight = maxWidth / aspectRatio;
              
              // If height exceeds max, scale based on height instead
              if (imgHeight > maxHeight) {
                imgHeight = maxHeight;
                imgWidth = maxHeight * aspectRatio;
              }
              
              // Make sure width doesn't exceed maxWidth after height scaling
              if (imgWidth > maxWidth) {
                imgWidth = maxWidth;
                imgHeight = maxWidth / aspectRatio;
              }
              
              console.log(`📐 Interactive diagram sizing: section.width=${section.width}, sidePadding=${sidePadding}, maxWidth=${maxWidth}, calculated imgWidth=${imgWidth}, imgHeight=${imgHeight}`);
              
              page.drawImage(diagramImage, {
                x: section.x + (section.width - imgWidth) / 2,
                y: pdfY + (section.height - imgHeight) / 2,
                width: imgWidth,
                height: imgHeight,
              });
              diagramLoaded = true;
            }
          } catch (error) {
            console.warn('Could not load interactive damage check diagram:', error);
          }
        }
        
        // If no interactive diagram, show placeholder text
        if (!diagramLoaded) {
          console.log('🖼️ No interactive diagram, trying template diagram');
          page.drawText('VOERTUIGSCHEMA (Markeer schade)', {
            x: section.x + section.width / 2 - 60,
            y: pdfY + section.height / 2,
            size: 9,
            font: boldFont,
            color: rgb(0.5, 0.5, 0.5),
          });
          
          // Try to load vehicle diagram template from object storage or filesystem
          try {
            // First, try to find a matching vehicle diagram template
            const [vehicleDiagram] = await db.select()
              .from(vehicleDiagramTemplates)
              .where(eq(vehicleDiagramTemplates.make, vehicle.brand))
              .limit(1);
            
            let diagramBytes: Buffer | null = null;
            let diagramFormat: 'png' | 'jpg' | null = null;
            
            // Load from object storage if available
            if (vehicleDiagram?.objectStorageKey) {
              try {
                const objectStorage = new ObjectStorageService();
                const file = objectStorage.getFile(vehicleDiagram.objectStorageKey);
                const [exists] = await file.exists();
                
                if (exists) {
                  const [buffer] = await file.download();
                  diagramBytes = Buffer.from(buffer);
                  diagramFormat = vehicleDiagram.objectStorageKey.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
                  console.log(`✅ Loaded vehicle diagram from object storage: ${vehicleDiagram.objectStorageKey}`);
                }
              } catch (error) {
                console.warn('Could not load diagram from object storage:', error);
              }
            }
            
            // Fallback to legacy filesystem path
            if (!diagramBytes && vehicleDiagram?.diagramPath) {
              try {
                const diagramPath = path.join(process.cwd(), vehicleDiagram.diagramPath);
                diagramBytes = await fs.readFile(diagramPath);
                diagramFormat = vehicleDiagram.diagramPath.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
                console.log(`✅ Loaded vehicle diagram from filesystem: ${vehicleDiagram.diagramPath}`);
              } catch (error) {
                console.warn('Could not load diagram from filesystem:', error);
              }
            }
            
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
            
            // Embed and render the diagram if loaded
            if (diagramBytes && diagramFormat) {
              const diagramImage = diagramFormat === 'png' 
                ? await pdfDoc.embedPng(diagramBytes)
                : await pdfDoc.embedJpg(diagramBytes);
              
              const sidePadding = 80; // Apply 80px padding for clear margins
              const maxWidth = section.width - (sidePadding * 2);
              const maxHeight = section.height - 20;
              
              // Calculate dimensions maintaining aspect ratio
              const aspectRatio = diagramImage.width / diagramImage.height;
              let imgWidth = maxWidth;
              let imgHeight = maxWidth / aspectRatio;
              
              // If height exceeds max, scale based on height instead
              if (imgHeight > maxHeight) {
                imgHeight = maxHeight;
                imgWidth = maxHeight * aspectRatio;
              }
              
              // Make sure width doesn't exceed maxWidth after height scaling
              if (imgWidth > maxWidth) {
                imgWidth = maxWidth;
                imgHeight = maxWidth / aspectRatio;
              }
              
              console.log(`📐 Template diagram sizing: section.width=${section.width}, sidePadding=${sidePadding}, maxWidth=${maxWidth}, calculated imgWidth=${imgWidth}, imgHeight=${imgHeight}`);
              
              page.drawImage(diagramImage, {
                x: section.x + (section.width - imgWidth) / 2,
                y: pdfY + (section.height - imgHeight) / 2,
                width: imgWidth,
                height: imgHeight,
              });
            }
          } catch (error) {
            console.warn('Could not load vehicle diagram:', error);
          }
        }
        break;
      }
      
      case 'remarks': {
        const fontSize = section.settings.fontSize || 9;
        const lineHeight = fontSize + 4;
        const checkboxSize = section.settings.checkboxSize || 8;
        const sectionLabel = section.settings.customLabel || 'OPMERKINGEN';
        const columnCount = section.settings.columnCount || 1;
        let yPos = pdfY + section.height - 15;
        
        page.drawText(sectionLabel, {
          x: section.x + 5,
          y: yPos,
          size: fontSize + 1,
          font: boldFont,
        });
        
        yPos -= lineHeight;
        
        // Draw remarks box
        const remarksBoxHeight = 80;
        page.drawRectangle({
          x: section.x + 5,
          y: yPos - remarksBoxHeight,
          width: section.width - 10,
          height: remarksBoxHeight,
          borderColor: rgb(0, 0, 0),
          borderWidth: 0.5,
        });
        
        yPos -= remarksBoxHeight + lineHeight;
        
        // Render custom items in columns
        if (section.settings.customItems && section.settings.customItems.length > 0) {
          const columnGap = 10;
          const columnWidth = (section.width - 10 - (columnGap * (columnCount - 1))) / columnCount;
          const itemsPerColumn = Math.ceil(section.settings.customItems.length / columnCount);
          
          section.settings.customItems.forEach((item: any, index: number) => {
            const columnIndex = Math.floor(index / itemsPerColumn);
            const rowInColumn = index % itemsPerColumn;
            const xPos = section.x + 5 + (columnIndex * (columnWidth + columnGap));
            const itemY = yPos - (rowInColumn * lineHeight);
            
            if (itemY < pdfY + 10) return; // Stop if we run out of space
            
            let textX = xPos;
            
            if (item.hasCheckbox) {
              page.drawRectangle({
                x: textX,
                y: itemY - checkboxSize,
                width: checkboxSize,
                height: checkboxSize,
                borderColor: rgb(0, 0, 0),
                borderWidth: 0.5,
              });
              textX += checkboxSize + 5;
            }
            
            page.drawText(item.text, {
              x: textX,
              y: itemY - checkboxSize + 1,
              size: fontSize,
              font,
            });
          });
        }
        break;
      }
      
      case 'signatures': {
        const fontSize = section.settings.fontSize || 9;
        const checkboxSize = section.settings.checkboxSize || 8;
        const lineHeight = fontSize + 4;
        let yPos = pdfY + section.height - 10;
        
        // Render custom items (signature fields)
        if (section.settings.customItems && section.settings.customItems.length > 0) {
          const itemWidth = (section.width - 10 - ((section.settings.customItems.length - 1) * 5)) / section.settings.customItems.length;
          
          section.settings.customItems.forEach((item: any, index: number) => {
            const xPos = section.x + 5 + (index * (itemWidth + 5));
            const signatureHeight = section.height - 20;
            
            // Draw signature box
            page.drawRectangle({
              x: xPos,
              y: pdfY + 5,
              width: itemWidth,
              height: signatureHeight,
              borderColor: rgb(0, 0, 0),
              borderWidth: 0.5,
            });
            
            // Draw label
            const textWidth = font.widthOfTextAtSize(item.text, fontSize);
            page.drawText(item.text, {
              x: xPos + (itemWidth - textWidth) / 2,
              y: pdfY + 10,
              size: fontSize,
              font: boldFont,
            });
          });
        }
        break;
      }
      
      case 'customField': {
        const fontSize = section.settings.fontSize || 9;
        const checkboxSize = section.settings.checkboxSize || 10;
        const hasCheckbox = section.settings.hasCheckbox !== false;
        const hasText = section.settings.hasText !== false;
        const fieldText = section.settings.fieldText || 'Field Label';
        
        let xPos = section.x + 5;
        const yPos = pdfY + section.height / 2;
        
        // Draw checkbox if enabled
        if (hasCheckbox) {
          page.drawRectangle({
            x: xPos,
            y: yPos - checkboxSize / 2,
            width: checkboxSize,
            height: checkboxSize,
            borderColor: rgb(0, 0, 0),
            borderWidth: 0.5,
          });
          xPos += checkboxSize + 5;
        }
        
        // Draw text if enabled
        if (hasText) {
          page.drawText(fieldText, {
            x: xPos,
            y: yPos - fontSize / 2,
            size: fontSize,
            font,
          });
        }
        break;
      }
    }
  }

  // Per-page header / footer overlay (Phase 1) — same helper as the standard
  // renderer so configured text is consistent across both render paths.
  applyHeaderFooterOverlay(
    pdfDoc,
    font,
    (damageTemplate as any)?.headerText,
    (damageTemplate as any)?.footerText,
    40,
  );

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
