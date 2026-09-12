/**
 * PDF generation utility to create rental contracts
 * Using the ELENA AVL ALL contract template or custom templates
 */

import { Reservation, PdfTemplate, VehicleTransport, TransportReportTemplate } from "../../shared/schema";
// Only the contract *number* still uses date-fns (a yyyyMMdd stamp); every
// human-readable date goes through ./dutch-format below (besluiten B-18).
import { format } from "date-fns";
import * as fs from 'fs';
import * as path from 'path';
import { PDFDocument, PDFName, rgb, StandardFonts, TextAlignment } from 'pdf-lib';
import { formatReservationBarcode } from '../../shared/barcode';
import { renderBarcodePng } from './barcode-png';
import { resolveUploadsPath } from '../../shared/paths';
import { resolveDocumentFilePath } from '../services/document-paths';
import { sanitizeForWinAnsi, wrapTextToWidth } from './pdf-text';
// besluiten B-18 (BUG-192): every date, number and amount on a generated
// document goes through one Dutch formatter.
import {
  formatDateNL, formatLongDateNL, formatLongDateTimeNL, formatCurrencyNL, formatDaysNL, formatKilometresNL,
} from './dutch-format';
import {
  parseTemplateFields,
  PAGE_WIDTH,
  PAGE_HEIGHT,
} from '../../shared/template-fields';

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

/**
 * Everything a contract field may be filled from. FIX-N (BUG-191): the
 * renderer used to end its source lookup with
 *
 *     else if (field.name) value = field.name;
 *     else value = source || 'Field';
 *
 * so a field whose source no longer resolved printed its own name — "Field",
 * "customerName", "Naam huurder" — in the box where the customer's name
 * belongs, and the contract looked filled in. An unknown source now prints
 * nothing and says so in the log.
 */
const CONTRACT_FIELD_SOURCES: Record<string, keyof ContractData> = {
  contractNumber: "contractNumber",
  contractDate: "contractDate",
  licensePlate: "licensePlate",
  brand: "brand",
  model: "model",
  chassisNumber: "chassisNumber",
  customerName: "customerName",
  customerAddress: "customerAddress",
  customerCity: "customerCity",
  customerPostalCode: "customerPostalCode",
  customerPhone: "customerPhone",
  driverLicense: "driverLicense",
  driverName: "driverName",
  driverFirstName: "driverFirstName",
  driverLastName: "driverLastName",
  driverEmail: "driverEmail",
  driverPhone: "driverPhone",
  driverLicenseNumber: "driverLicenseNumber",
  driverLicenseExpiry: "driverLicenseExpiry",
  startDate: "startDate",
  endDate: "endDate",
  duration: "duration",
  totalPrice: "totalPrice",
  // The dotted spellings the template editor writes.
  "customer.name": "customerName",
  "customer.address": "customerAddress",
  "customer.city": "customerCity",
  "customer.postalCode": "customerPostalCode",
  "customer.phone": "customerPhone",
  "customer.driverLicenseNumber": "driverLicense",
  "vehicle.licensePlate": "licensePlate",
  "vehicle.brand": "brand",
  "vehicle.model": "model",
  "vehicle.chassisNumber": "chassisNumber",
  "reservation.contractNumber": "contractNumber",
  "reservation.startDate": "startDate",
  "reservation.endDate": "endDate",
  "reservation.duration": "duration",
  "reservation.totalPrice": "totalPrice",
  "driver.name": "driverName",
  "driver.firstName": "driverFirstName",
  "driver.lastName": "driverLastName",
  "driver.email": "driverEmail",
  "driver.phone": "driverPhone",
  "driver.licenseNumber": "driverLicenseNumber",
  "driver.licenseExpiry": "driverLicenseExpiry",
};

type ContractData = ReturnType<typeof prepareContractData>;

function resolveContractFieldValue(source: string | undefined, data: ContractData): string {
  if (!source) return "";
  const key = CONTRACT_FIELD_SOURCES[source];
  if (!key) {
    console.warn(
      `[contract] template field source "${source}" is not a known contract value; leaving the field empty.`,
    );
    return "";
  }
  const value = data[key];
  return value === null || value === undefined ? "" : String(value);
}

/** What kind of file these bytes actually are, regardless of the stored name. */
function sniffBackgroundType(bytes: Buffer): "pdf" | "png" | "jpg" | null {
  if (bytes.length < 4) return null;
  if (bytes.slice(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  return null;
}

/** Document-level constructs a background must never smuggle into a contract. */
const ACTIVE_PDF_KEYS = ["/OpenAction", "/JavaScript", "/JS", "/AA", "/Launch", "/EmbeddedFiles"];

/**
 * True when the PDF carries document-level JavaScript or an auto-action.
 * FIX-P (BUG-180): the old renderer loaded the *background* document and drew
 * onto it, so the background's `/OpenAction` JavaScript, its extra pages and
 * its embedded files were part of every contract that template produced. A
 * background uploaded once became code in every contract for ever.
 */
export function pdfCarriesActiveContent(bytes: Buffer): boolean {
  const text = bytes.toString("latin1");
  return ACTIVE_PDF_KEYS.some((key) => text.includes(key));
}

/**
 * The thorough version of the check above: object streams are compressed, so
 * a scan of the raw bytes misses an /OpenAction that pdf-lib itself would
 * write. Parsing the document and looking at the catalog catches those too.
 * Returns the offending key, or null when the file is clean.
 */
export async function detectActivePdfContent(bytes: Buffer): Promise<string | null> {
  for (const key of ACTIVE_PDF_KEYS) {
    if (bytes.toString("latin1").includes(key)) return key;
  }
  try {
    const doc = await PDFDocument.load(bytes, { throwOnInvalidObject: false });
    const catalog = doc.catalog;
    for (const key of ["OpenAction", "AA", "Names", "EmbeddedFiles"]) {
      const entry = catalog.get(PDFName.of(key));
      if (!entry) continue;
      if (key !== "Names") return `/${key}`;
      const names = catalog.lookup(PDFName.of("Names"));
      const serialised = names ? String(names) : "";
      if (serialised.includes("/JavaScript") || serialised.includes("/EmbeddedFiles")) return "/JavaScript";
    }
  } catch {
    // Unparseable here means the background is unusable anyway; the caller
    // finds that out when it tries to draw with it.
  }
  return null;
}
interface BackgroundSource {
  bytes: Buffer;
  /** True when the template names this background; false for the bundled default. */
  configured: boolean;
  label: string;
}

async function loadBackgroundBytes(template?: PdfTemplate | null): Promise<BackgroundSource | null> {
  const configuredPath = template?.backgroundPath || null;
  const label = template?.name ? `template "${template.name}"` : "the contract template";

  if (configuredPath) {
    if (configuredPath.startsWith("/")) {
      // Object storage path.
      const { ObjectStorageService } = await import("../objectStorage");
      const objStorageService = new ObjectStorageService();
      const file = objStorageService.getFile(configuredPath);
      const [fileBuffer] = await file.download();
      return { bytes: Buffer.from(fileBuffer), configured: true, label };
    }
    const resolved = resolveDocumentFilePath(configuredPath);
    if (!resolved) {
      // BUG-179: five nested catches used to turn this into "use the default
      // layout instead", so a template whose background had been deleted kept
      // producing contracts that looked like somebody else's.
      throw new Error(
        `The background configured for ${label} could not be read (${configuredPath}). ` +
          `Upload the background again before generating contracts with this template.`,
      );
    }
    return { bytes: fs.readFileSync(resolved), configured: true, label };
  }

  const defaultPath = resolveUploadsPath("templates", "rental_contract_template.pdf");
  if (fs.existsSync(defaultPath)) {
    return { bytes: fs.readFileSync(defaultPath), configured: false, label: "the bundled default background" };
  }
  return null;
}

/**
 * Builds the page the contract is drawn on.
 *
 * The document is always a **fresh** `PDFDocument`; a PDF background is brought
 * in with `embedPage`, which copies the page's content and resources and
 * nothing else (BUG-180).
 */
async function createContractPage(
  pdfDoc: PDFDocument,
  template?: PdfTemplate | null,
): Promise<any> {
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const source = await loadBackgroundBytes(template);
  if (!source) return page;

  const kind = sniffBackgroundType(source.bytes);
  if (!kind) {
    if (source.configured) {
      throw new Error(
        `The background of ${source.label} is not a PDF, PNG or JPEG file, so the contract cannot be drawn on it.`,
      );
    }
    return page;
  }

  try {
    if (kind === "pdf") {
      const backgroundDoc = await PDFDocument.load(source.bytes, { throwOnInvalidObject: false });
      if (backgroundDoc.getPageCount() === 0) {
        throw new Error("the background PDF has no pages");
      }
      const embedded = await pdfDoc.embedPage(backgroundDoc.getPage(0));
      page.drawPage(embedded, { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT });
    } else if (kind === "png") {
      const image = await pdfDoc.embedPng(source.bytes);
      page.drawImage(image, { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT });
    } else {
      const image = await pdfDoc.embedJpg(source.bytes);
      page.drawImage(image, { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT });
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (source.configured) {
      throw new Error(`The background of ${source.label} could not be used: ${detail}`);
    }
    console.warn(`[contract] the bundled default background could not be used: ${detail}`);
  }
  return page;
}

/**
 * Generates a rental contract PDF using a custom template.
 *
 * FIX-N. What changed, and why:
 *  - every value is sanitised for WinAnsi before it reaches pdf-lib, instead of
 *    each field sitting in its own try/catch that swallowed the whole field
 *    when one character was outside cp1252 (BUG-162);
 *  - values are wrapped (or clipped with an ellipsis) inside the field's box
 *    instead of running off the right edge of the page (BUG-178);
 *  - an unresolvable source prints nothing instead of its own name (BUG-191);
 *  - geometry is validated, so `x: 1e9` can no longer place a value where no
 *    printer reaches (BUG-191);
 *  - the output is a fresh document with the background *embedded*, so the
 *    background's document-level JavaScript never becomes part of a contract
 *    (BUG-180);
 *  - a configured background that cannot be read is an error rather than a
 *    silent fall back to a different layout (BUG-179).
 */
export async function generateRentalContractFromTemplate(
  reservation: Reservation,
  template?: PdfTemplate,
): Promise<Buffer> {
  const contractData = prepareContractData(reservation);
  const pdfDoc = await PDFDocument.create();
  const page = await createContractPage(pdfDoc, template);

  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const textColor = rgb(0, 0, 0);

  const { fields, rejected } = parseTemplateFields(template?.fields);
  if (rejected.length > 0) {
    console.warn(
      `[contract] ${rejected.length} field(s) of template "${template?.name ?? "?"}" were rejected and not drawn: ${rejected.join(" | ")}`,
    );
  }

  // The editor's box model: 1pt vertical, 6pt horizontal padding, text
  // positioned from the top-left, PDF drawing from the bottom-left baseline.
  const PADDING_X = 6;
  const PADDING_Y = 1;

  for (const field of fields) {
    const raw = resolveContractFieldValue(field.source, contractData);
    if (raw === "") continue;
    const value = sanitizeForWinAnsi(raw, `contract field "${field.source}"`);
    if (value === "") continue;

    const font = field.isBold ? helveticaBold : helveticaFont;
    const fontSize = field.fontSize;
    const lineHeight = fontSize * 1.15;
    const ascent = font.heightAtSize(fontSize) * 0.85;

    const boxWidth =
      field.width && field.width > PADDING_X * 2
        ? field.width - PADDING_X * 2
        : Math.max(20, PAGE_WIDTH - field.x - PADDING_X * 2);
    const maxLines =
      field.height && field.height >= lineHeight
        ? Math.max(1, Math.floor(field.height / lineHeight))
        : 1;
    const lines = wrapTextToWidth(value, font, fontSize, boxWidth, maxLines);

    lines.forEach((line, index) => {
      if (line === "") return;
      const textWidth = font.widthOfTextAtSize(line, fontSize);
      let x = field.x + PADDING_X;
      if (field.textAlign === "center") x = field.x - textWidth / 2;
      else if (field.textAlign === "right") x = field.x - textWidth - PADDING_X;
      // Keep the line on the page even when the template's own x is extreme.
      x = Math.min(Math.max(0, x), Math.max(0, PAGE_WIDTH - textWidth));
      const y = PAGE_HEIGHT - field.y - PADDING_Y - ascent - index * lineHeight;
      if (y < 0 || y > PAGE_HEIGHT) return;
      page.drawText(line, { x, y, size: fontSize, font, color: textColor });
    });
  }

  // Draw the reservation barcode top-right of page 1 (never fail contract
  // generation because of the barcode).
  try {
    const barcodePng = renderBarcodePng(formatReservationBarcode(reservation.id));
    const barcodeImage = await pdfDoc.embedPng(barcodePng);
    const scaledDims = barcodeImage.scale(0.5);
    const { width: pageWidth, height: pageHeight } = page.getSize();
    page.drawImage(barcodeImage, {
      x: pageWidth - scaledDims.width - 24,
      y: pageHeight - scaledDims.height - 20,
      width: scaledDims.width,
      height: scaledDims.height,
    });
  } catch (e) {
    console.warn('Contract barcode skipped:', e);
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

/**
 * Prepare contract data from reservation
 */
export function prepareContractData(reservation: Reservation) {
  const vehicle = reservation.vehicle || {
    licensePlate: "",
    brand: "",
    model: "",
    chassisNumber: "",
  };
  
  const customer = reservation.customer || {
    name: "",
    address: "",
    city: "",
    postalCode: "",
    phone: "",
    driverLicenseNumber: "",
  };
  
  // Extract driver information if available
  const driver = (reservation as any).driver || null;
  const driverName = driver?.displayName || "";
  const driverFirstName = driver?.firstName || "";
  const driverLastName = driver?.lastName || "";
  const driverEmail = driver?.email || "";
  const driverPhone = driver?.phone || "";
  const driverLicenseNumber = driver?.driverLicenseNumber || "";
  const driverLicenseExpiry = driver?.licenseExpiry || "";
  
  // Calculate duration in days
  const startDate = new Date(reservation.startDate);
  const endDate = reservation.endDate && reservation.endDate.trim() !== '' 
    ? new Date(reservation.endDate) 
    : null;
  
  let diffDays = 1; // Default to 1 day
  if (endDate && !isNaN(endDate.getTime())) {
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
  
  // Parse totalPrice as a number if it's a string
  const totalPrice = typeof reservation.totalPrice === 'string' 
    ? parseFloat(reservation.totalPrice) 
    : reservation.totalPrice;
  
  return {
    contractNumber: reservation.contractNumber || `C-${reservation.id}-${format(new Date(), 'yyyyMMdd')}`,
    contractDate: formatLongDateNL(new Date()),
    licensePlate: formatLicensePlate(vehicle.licensePlate),
    brand: vehicle.brand,
    model: vehicle.model,
    chassisNumber: vehicle.chassisNumber || "",
    customerName: customer.name,
    customerAddress: customer.address || "",
    customerCity: customer.city || "",
    customerPostalCode: customer.postalCode || "",
    customerPhone: customer.phone || "",
    driverLicense: customer.driverLicenseNumber || "",
    driverName,
    driverFirstName,
    driverLastName,
    driverEmail,
    driverPhone,
    driverLicenseNumber,
    driverLicenseExpiry,
    startDate: formatDateNL(startDate),
    endDate: endDate ? formatDateNL(endDate) : 'nader te bepalen',
    duration: formatDaysNL(diffDays),
    totalPrice: formatCurrency(totalPrice),
    vehicleId: reservation.vehicleId || 0,  // Add vehicleId for document cache invalidation
  };
}

/**
 * Format a value as currency (Euro).
 *
 * besluiten B-18: Dutch notation, always — `€ 1.234,50`. A missing or
 * unparseable amount used to print `€0.00`, with a point; it now prints
 * `€ 0,00`, because a contract field that is on the page has to read as money.
 */
function formatCurrency(amount: any): string {
  const formatted = formatCurrencyNL(amount);
  return formatted === '' ? formatCurrencyNL(0) : formatted;
}

/**
 * Helper: Draw a rectangle border
 */
function drawBox(page: any, x: number, y: number, width: number, height: number, lineWidth = 1) {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    borderColor: rgb(0, 0, 0),
    borderWidth: lineWidth,
  });
}

/**
 * Helper: Draw a filled rectangle header
 */
function drawFilledHeader(page: any, x: number, y: number, width: number, height: number, text: string, font: any, fontSize = 10) {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: rgb(0.2, 0.3, 0.6),
    borderColor: rgb(0, 0, 0),
    borderWidth: 1,
  });
  page.drawText(text, {
    x: x + 5,
    y: y + (height / 2) - (fontSize / 2),
    size: fontSize,
    font,
    color: rgb(1, 1, 1),
  });
}

/**
 * Helper: Draw checkbox with label
 */
function drawCheckbox(page: any, x: number, y: number, label: string, value: any, font: any) {
  // Checkbox
  page.drawRectangle({
    x,
    y,
    width: 10,
    height: 10,
    borderColor: rgb(0, 0, 0),
    borderWidth: 0.5,
  });
  
  // If checked, draw X
  if (value) {
    page.drawText('X', {
      x: x + 2,
      y: y + 2,
      size: 8,
      font,
    });
  }
  
  // Label
  page.drawText(label, {
    x: x + 14,
    y: y + 1,
    size: 9,
    font,
  });
}

/**
 * Generate a PDF for an interactive damage check - Dutch format
 * Matches professional rental damage check form layout
 */
export async function generateInteractiveDamageCheckPDF(damageCheck: any, vehicle?: any): Promise<Buffer> {
  try {
    console.log('Generating interactive damage check PDF for check:', damageCheck.id);
    
    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    
    // Embed fonts
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Add first page - A4 size
    const page = pdfDoc.addPage([595, 842]);
    const { width, height} = page.getSize();
    
    // Layout constants - more compact
    const margin = 15;
    const columnWidth = (width - margin * 2 - 140) / 3; // 3 columns + right sidebar (wider columns)
    const sidebarWidth = 130;
    const sidebarX = width - margin - sidebarWidth;
    
    let y = height - margin;
    
    // ===== HEADER SECTION =====
    // Logo placeholder (left)
    page.drawText('LAM GROUP', {
      x: margin,
      y: y - 15,
      size: 14,
      font: helveticaBold,
      color: rgb(0, 0.2, 0.6),
    });
    
    // Date field (top right)
    page.drawText('Datum:', {
      x: sidebarX - 80,
      y: y - 10,
      size: 9,
      font: helveticaFont,
    });
    drawBox(page, sidebarX, y - 20, sidebarWidth, 15);
    const checkDate = damageCheck.checkDate ? formatDateNL(damageCheck.checkDate) : '--';
    page.drawText(checkDate, {
      x: sidebarX + 5,
      y: y - 17,
      size: 9,
      font: helveticaFont,
    });
    
    // Contract number field
    y -= 25;
    page.drawText('Verhuurcontractnummer:', {
      x: sidebarX - 80,
      y: y - 10,
      size: 8,
      font: helveticaFont,
    });
    drawBox(page, sidebarX, y - 20, sidebarWidth, 15);
    const contractRef = `DC-${damageCheck.id || 'TEMP'}`;
    page.drawText(contractRef, {
      x: sidebarX + 5,
      y: y - 17,
      size: 9,
      font: helveticaFont,
    });
    
    y -= 35;
    
    // ===== CHECKLIST COLUMNS =====
    const checklistY = y;
    const checklistHeight = 280; // More compact height
    
    // Parse checklist data with error handling
    let checklistData: { interior: Record<string, any>; exterior: Record<string, any>; delivery: Record<string, any> } = { interior: {}, exterior: {}, delivery: {} };
    if (damageCheck.checklistData) {
      try {
        checklistData = typeof damageCheck.checklistData === 'string' 
          ? JSON.parse(damageCheck.checklistData) 
          : damageCheck.checklistData;
      } catch (err) {
        console.error('Error parsing checklist data:', err);
      }
    }
    
    // INTERIEUR COLUMN
    let colY = checklistY;
    drawFilledHeader(page, margin, colY, columnWidth, 20, 'Interieur', helveticaBold, 11);
    colY -= 25;
    const interiorItems = [
      ['carInterior', 'Binnenzijde auto'],
      ['floorMats', 'Vloermatten'],
      ['upholstery', 'Bekleding'],
      ['ashtray', 'Asbak'],
      ['spareWheel', 'Reservewiel'],
      ['jack', 'Krik'],
      ['wheelBrace', 'Wielsleutel'],
      ['matKit', 'Matten'],
      ['mainKeys', 'Hoofdsteunen'],
    ];
    interiorItems.forEach(([key, label]) => {
      const value = checklistData.interior?.[key];
      page.drawText(label, {
        x: margin + 16,
        y: colY + 1,
        size: 9,
        font: helveticaFont,
      });
      drawCheckbox(page, margin + 2, colY, '', value, helveticaFont);
      if (value && typeof value === 'string') {
        page.drawText(value, {
          x: margin + columnWidth - 50,
          y: colY + 1,
          size: 8,
          font: helveticaFont,
        });
      }
      colY -= 11;
    });
    drawBox(page, margin, checklistY - checklistHeight, columnWidth, checklistHeight);
    
    // EXTERIEUR COLUMN
    colY = checklistY;
    const col2X = margin + columnWidth + 5;
    drawFilledHeader(page, col2X, colY, columnWidth, 20, 'Exterieur', helveticaBold, 11);
    colY -= 25;
    const exteriorItems = [
      ['carExterior', 'Buitenzijde auto'],
      ['hubcaps', 'Wieldoppen'],
      ['licensePlates', 'Kentekemplaten'],
      ['mirrorCapsLeft', 'Spiegelkap links'],
      ['mirrorCapsRight', 'Spiegelkap rechts'],
      ['mirrorGlassLeftRight', 'Spiegelglas L+R'],
      ['antenna', 'Antenne'],
      ['wiperBlade', 'Ruitenwisser'],
      ['mudguards', 'Deurvanger'],
      ['slidingDoorBus', 'Schuifdeur (bus)'],
      ['indicatorSlots', 'Werkende sloten'],
      ['fogLights', 'Mistlampen voor'],
    ];
    exteriorItems.forEach(([key, label]) => {
      const value = checklistData.exterior?.[key];
      page.drawText(label, {
        x: col2X + 16,
        y: colY + 1,
        size: 9,
        font: helveticaFont,
      });
      drawCheckbox(page, col2X + 2, colY, '', value, helveticaFont);
      if (value && typeof value === 'string') {
        page.drawText(value, {
          x: col2X + columnWidth - 50,
          y: colY + 1,
          size: 8,
          font: helveticaFont,
        });
      }
      colY -= 11;
    });
    drawBox(page, col2X, checklistY - checklistHeight, columnWidth, checklistHeight);
    
    // AFLEVER CHECK COLUMN
    colY = checklistY;
    const col3X = margin + (columnWidth + 5) * 2;
    drawFilledHeader(page, col3X, colY, columnWidth, 20, 'Aflever Check', helveticaBold, 11);
    colY -= 25;
    const deliveryItems = [
      ['oilWater', 'Olie - water'],
      ['washerFluid', 'Ruitenproeiervloeistof'],
      ['lighting', 'Verlichting'],
      ['tireInflation', 'Bandenspanning incl. reservewiel'],
      ['fanBelt', 'Kachelfan'],
      ['engineBoard', 'Hoedenplank'],
      ['jackKnife', 'IJskrabber'],
      ['allDoorsOpen', 'Gaan alle deuren open'],
      ['licensePlatePapers', 'Kentekenpapieren'],
      ['validGreenCard', 'Geldige groene kaart'],
      ['europeanDamageForm', 'Europees schadeformulier'],
    ];
    deliveryItems.forEach(([key, label]) => {
      const value = checklistData.delivery?.[key];
      drawCheckbox(page, col3X + 2, colY, label, value, helveticaFont);
      colY -= 11;
    });
    drawBox(page, col3X, checklistY - checklistHeight, columnWidth, checklistHeight);
    
    // ===== RIGHT SIDEBAR =====
    colY = checklistY;
    
    // Gegevens voertuig (Vehicle Data)
    drawFilledHeader(page, sidebarX, colY, sidebarWidth, 16, 'Gegevens voertuig', helveticaBold, 9);
    colY -= 19;
    const vehicleDataHeight = 75;
    drawBox(page, sidebarX, colY - vehicleDataHeight, sidebarWidth, vehicleDataHeight);
    page.drawText(`Merk: ${vehicle?.brand || '-'}`, { x: sidebarX + 3, y: colY - 10, size: 8, font: helveticaFont });
    page.drawText(`Model: ${vehicle?.model || '-'}`, { x: sidebarX + 3, y: colY - 21, size: 8, font: helveticaFont });
    page.drawText(`Kenteken: ${vehicle?.licensePlate || '-'}`, { x: sidebarX + 3, y: colY - 32, size: 8, font: helveticaFont });
    page.drawText(`Brandstof: ${vehicle?.fuel || '-'}`, { x: sidebarX + 3, y: colY - 43, size: 8, font: helveticaFont });
    page.drawText(`Km: ${damageCheck.mileage || '-'}`, { x: sidebarX + 3, y: colY - 54, size: 8, font: helveticaFont });
    page.drawText(`Tank: ${damageCheck.fuelLevel || '-'}`, { x: sidebarX + 3, y: colY - 65, size: 8, font: helveticaFont });
    colY -= (vehicleDataHeight + 4);
    
    // Opmerkingen (Remarks)
    drawFilledHeader(page, sidebarX, colY, sidebarWidth, 16, 'Opmerkingen', helveticaBold, 9);
    colY -= 19;
    const remarksHeight = 60;
    drawBox(page, sidebarX, colY - remarksHeight, sidebarWidth, remarksHeight);
    if (damageCheck.notes) {
      page.drawText(damageCheck.notes.substring(0, 100), {
        x: sidebarX + 3,
        y: colY - 10,
        size: 7,
        font: helveticaFont,
        maxWidth: sidebarWidth - 6,
      });
    }
    colY -= (remarksHeight + 4);
    
    // Controle door (Checked by)
    drawFilledHeader(page, sidebarX, colY, sidebarWidth, 16, 'Controle door', helveticaBold, 9);
    colY -= 19;
    const controlHeight = 40;
    drawBox(page, sidebarX, colY - controlHeight, sidebarWidth, controlHeight);
    const controlDate = damageCheck.checkDate ? formatDateNL(damageCheck.checkDate) : '--';
    page.drawText(`Datum: ${controlDate}`, {
      x: sidebarX + 3,
      y: colY - 10,
      size: 8,
      font: helveticaFont,
    });
    page.drawText(`NAAM: ${damageCheck.completedBy || ''}`, {
      x: sidebarX + 3,
      y: colY - 25,
      size: 8,
      font: helveticaFont,
    });
    colY -= (controlHeight + 4);
    
    // Handtekening (Signatures)
    drawFilledHeader(page, sidebarX, colY, sidebarWidth, 16, 'Handtekening', helveticaBold, 9);
    colY -= 19;
    const sigHeight = 80;
    drawBox(page, sidebarX, colY - sigHeight, sidebarWidth, sigHeight);
    
    // Draw signatures if available
    if (damageCheck.renterSignature) {
      try {
        const base64Data = damageCheck.renterSignature.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
        const signatureBytes = Buffer.from(base64Data, 'base64');
        const signatureImage = await pdfDoc.embedPng(signatureBytes);
        page.drawImage(signatureImage, {
          x: sidebarX + 5,
          y: colY - 45,
          width: sidebarWidth - 10,
          height: 35,
        });
      } catch (err) {
        console.error('Error embedding signature:', err);
      }
    }
    
    // ===== VEHICLE DIAGRAMS =====
    if (damageCheck.diagramWithAnnotations) {
      try {
        const base64Data = damageCheck.diagramWithAnnotations.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
        const imageBytes = Buffer.from(base64Data, 'base64');
        const image = damageCheck.diagramWithAnnotations.startsWith('data:image/png') ?
          await pdfDoc.embedPng(imageBytes) : await pdfDoc.embedJpg(imageBytes);
        
        const diagramY = checklistY - checklistHeight - 20;
        const diagramWidth = width - margin * 2 - sidebarWidth - 10;
        const diagramHeight = 180;
        
        page.drawImage(image, {
          x: margin,
          y: diagramY - diagramHeight,
          width: diagramWidth,
          height: diagramHeight,
        });
      } catch (err) {
        console.error('Error embedding diagram:', err);
      }
    }
    
    // Save and return the PDF
    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  } catch (error) {
    console.error('Error generating interactive damage check PDF:', error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Vehicle transport reports — one big, clear page per transport for the driver.
// Same drag-position-fields-on-a-page model as the contract template above,
// but a much simpler implementation: flat field sources (no dotted paths, no
// preview-mode branching, no legacy double-JSON parsing) since this template
// system has no old data to stay compatible with. Background is an optional
// image (logo/letterhead) — PDF backgrounds aren't supported here, keeping
// per-page embedding simple for the multi-transport batch case below.
// ---------------------------------------------------------------------------

const TRANSPORT_TYPE_REPORT_LABELS: Record<string, string> = {
  swap: 'Voertuigruil',
  tow: 'Sleepopdracht',
  repossession: 'Terughaling',
  delivery: 'Aflevering',
  other: 'Overig',
};

const TRANSPORT_STATUS_REPORT_LABELS: Record<string, string> = {
  scheduled: 'Gepland',
  in_progress: 'Onderweg',
  completed: 'Voltooid',
  cancelled: 'Geannuleerd',
};

/**
 * besluiten B-18 — one Dutch formatter for every generated document. This used
 * to be a second month table living next to the contract's `date-fns`
 * formatting, which is how the two halves of one document drifted apart.
 */
function formatDutchDate(date: Date, withTime = false): string {
  return withTime ? formatLongDateTimeNL(date) : formatLongDateNL(date);
}

export function prepareTransportReportData(transport: VehicleTransport): Record<string, string> {
  const vehicle = transport.vehicle;
  const relatedVehicle = transport.relatedVehicle;
  const customer = transport.customer;

  const typeLabel = TRANSPORT_TYPE_REPORT_LABELS[transport.transportType] || transport.transportType;
  const statusLabel = TRANSPORT_STATUS_REPORT_LABELS[transport.status] || transport.status;
  // An external/outside vehicle has no fleet `vehicle` record — fall back to the
  // free-text external_* fields captured on the transport itself.
  const vehicleBrandValue = vehicle?.brand || (transport.isExternalVehicle ? (transport.externalBrand || '') : '');
  const vehicleModelValue = vehicle?.model || (transport.isExternalVehicle ? (transport.externalModel || '') : '');
  const vehicleFull = vehicle
    ? `${vehicle.brand} ${vehicle.model}`
    : (transport.isExternalVehicle ? [transport.externalBrand, transport.externalModel].filter(Boolean).join(' ') : '');
  const licensePlate = vehicle
    ? formatLicensePlate(vehicle.licensePlate)
    : (transport.isExternalVehicle && transport.externalLicensePlate ? formatLicensePlate(transport.externalLicensePlate) : '');
  const replacementVehicleFull = relatedVehicle ? `${relatedVehicle.brand} ${relatedVehicle.model}` : (transport.spareRequired ? 'TBD' : '');
  const replacementLicensePlate = relatedVehicle ? formatLicensePlate(relatedVehicle.licensePlate) : '';
  const scheduledDate = transport.scheduledDate ? formatDutchDate(new Date(transport.scheduledDate)) : '';
  const completedDate = transport.completedDate ? formatDutchDate(new Date(transport.completedDate)) : '';
  const originFull = [transport.originAddress, transport.originCity].filter(Boolean).join(', ');
  const destinationFull = [transport.destinationAddress, transport.destinationCity].filter(Boolean).join(', ');
  const distanceKm = transport.distanceKm != null ? formatKilometresNL(transport.distanceKm) : '';
  const tollCost = transport.tollCost != null ? formatCurrencyNL(transport.tollCost) : '';
  const billableAmount = transport.billableAmount != null ? formatCurrencyNL(transport.billableAmount) : '';
  const generatedDate = formatDutchDate(new Date(), true);

  return {
    vehicleBrand: vehicleBrandValue,
    vehicleModel: vehicleModelValue,
    vehicleFull,
    licensePlate,
    externalOwnerName: transport.externalOwnerName || '',
    externalColor: transport.externalColor || '',
    replacementVehicleBrand: relatedVehicle?.brand || '',
    replacementVehicleModel: relatedVehicle?.model || '',
    replacementVehicleFull,
    replacementLicensePlate,
    transportType: typeLabel,
    status: statusLabel,
    scheduledDate,
    completedDate,
    originAddress: transport.originAddress || '',
    originCity: transport.originCity || '',
    originFull,
    destinationAddress: transport.destinationAddress || '',
    destinationCity: transport.destinationCity || '',
    destinationFull,
    distanceKm,
    tollCost,
    driverName: transport.driverName || '',
    reason: transport.reason || '',
    notes: transport.notes || '',
    customerName: customer?.name || '',
    billable: transport.billable ? 'Ja' : 'Nee',
    billableAmount,
    generatedDate,

    // Dutch "Label: Waarde" versions — handy when there is no pre-printed background image with labels
    lblVoertuig: `Voertuig: ${vehicleFull || '-'}`,
    lblKenteken: `Kenteken: ${licensePlate || '-'}`,
    lblVervangendVoertuig: `Vervangend voertuig: ${replacementVehicleFull || '-'}`,
    lblVervangendKenteken: `Kenteken vervangend voertuig: ${replacementLicensePlate || '-'}`,
    lblType: `Type transport: ${typeLabel}`,
    lblStatus: `Status: ${statusLabel}`,
    lblDatum: `Datum: ${scheduledDate || '-'}`,
    lblVoltooid: `Voltooid op: ${completedDate || '-'}`,
    lblVan: `Van: ${originFull || '-'}`,
    lblNaar: `Naar: ${destinationFull || '-'}`,
    lblAfstand: `Afstand: ${distanceKm || '-'}`,
    lblTolkosten: `Tolkosten: ${tollCost || '-'}`,
    lblChauffeur: `Chauffeur: ${transport.driverName || '-'}`,
    lblReden: `Reden: ${transport.reason || '-'}`,
    lblNotities: `Notities: ${transport.notes || '-'}`,
    lblKlant: `Klant: ${customer?.name || '-'}`,
    lblFactureerbaar: `Factureerbaar: ${transport.billable ? 'Ja' : 'Nee'}`,
    lblBedrag: `Bedrag: ${billableAmount || '-'}`,
    lblGegenereerd: `Gegenereerd op: ${generatedDate}`,
    lblEigenaar: `Eigenaar: ${transport.externalOwnerName || '-'}`,
  };
}

interface TransportReportField {
  x: number;
  y: number;
  width?: number;
  height?: number;
  fontSize?: number;
  isBold?: boolean;
  source?: string;
  label?: string;
  textAlign?: 'left' | 'center' | 'right';
}

async function drawTransportReportPage(
  pdfDoc: PDFDocument,
  page: any,
  transport: VehicleTransport,
  fields: TransportReportField[],
  helveticaFont: any,
  helveticaBold: any,
) {
  const data = prepareTransportReportData(transport);
  const textColor = rgb(0, 0, 0);

  // BUG-162: the try/catch below used to be the only protection, and it threw
  // the whole field away the moment a value contained a character outside
  // WinAnsi — a driver's name with an accent, a city with a Turkish letter, an
  // address with an arrow. Sanitising first means the value survives; the
  // catch stays as a last resort for anything else.
  for (const field of fields) {
    try {
      const raw = field.source ? (data[field.source] ?? '') : '';
      if (raw === '') continue;
      const value = sanitizeForWinAnsi(raw, `transport report field "${field.source}"`);
      if (value === '') continue;

      const x = typeof field.x === 'number' && !isNaN(field.x) ? field.x : 0;
      const y = typeof field.y === 'number' && !isNaN(field.y) ? field.y : 0;
      const fontSize = typeof field.fontSize === 'number' && field.fontSize > 0 ? field.fontSize : 12;
      const font = field.isBold ? helveticaBold : helveticaFont;

      // Same coordinate math as the contract template renderer: top-left
      // origin with padding, flipped to PDF's bottom-left origin (A4 height
      // 842), so positions match exactly what the drag editor shows.
      const paddingX = 6;
      const paddingY = 1;
      const fontHeight = font.heightAtSize(fontSize);
      const ascent = fontHeight * 0.85;
      const lineHeight = fontSize * 1.15;

      // BUG-178: wrap inside the field's box instead of running off the page.
      const boxWidth =
        field.width && field.width > paddingX * 2
          ? field.width - paddingX * 2
          : Math.max(20, PAGE_WIDTH - x - paddingX * 2);
      const maxLines =
        field.height && field.height >= lineHeight
          ? Math.max(1, Math.floor(field.height / lineHeight))
          : 1;
      const lines = wrapTextToWidth(value, font, fontSize, boxWidth, maxLines);

      lines.forEach((line, index) => {
        if (line === '') return;
        const textWidth = font.widthOfTextAtSize(line, fontSize);
        let adjustedX = x + paddingX;
        if (field.textAlign === 'center') {
          adjustedX = x - textWidth / 2;
        } else if (field.textAlign === 'right') {
          adjustedX = x - textWidth - paddingX;
        }
        adjustedX = Math.min(Math.max(0, adjustedX), Math.max(0, PAGE_WIDTH - textWidth));
        const adjustedY = PAGE_HEIGHT - y - paddingY - ascent - index * lineHeight;
        if (adjustedY < 0 || adjustedY > PAGE_HEIGHT) return;
        page.drawText(line, { x: adjustedX, y: adjustedY, size: fontSize, font, color: textColor });
      });
    } catch (error) {
      console.error(`Error drawing transport report field ${field.label || field.source}:`, error);
    }
  }
}

function parseTransportTemplateFields(template?: TransportReportTemplate | null): TransportReportField[] {
  // FIX-P: the shared schema, so a stored field with absurd geometry is dropped
  // with a warning instead of drawing somewhere off the paper (BUG-191).
  const { fields, rejected } = parseTemplateFields(template?.fields);
  if (rejected.length > 0) {
    console.warn(
      `[transport-report] ${rejected.length} field(s) of template "${template?.name ?? '?'}" were rejected: ${rejected.join(' | ')}`,
    );
  }
  return fields as unknown as TransportReportField[];
}

/**
 * Generates one big, clear PDF page per transport — meant to be handed to a
 * driver with everything they need for the job. Supports multiple transports
 * in a single multi-page PDF (one page each), e.g. for a day's worth of jobs.
 */
export async function generateTransportReportsPdf(
  transports: VehicleTransport[],
  template?: TransportReportTemplate | null,
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fields = parseTransportTemplateFields(template);

  // Embed the background image once (if any) and reuse it across every page —
  // pdf-lib lets one embedded image be drawn on multiple pages cheaply.
  let backgroundImage: any = null;
  if (template?.backgroundPath) {
    try {
      // FIX-B: contained resolution of the stored background path.
      const backgroundFullPath = resolveDocumentFilePath(template.backgroundPath);
      if (backgroundFullPath) {
        const bytes = fs.readFileSync(backgroundFullPath);
        const ext = path.extname(backgroundFullPath).toLowerCase();
        if (ext === '.png') {
          backgroundImage = await pdfDoc.embedPng(bytes);
        } else if (ext === '.jpg' || ext === '.jpeg') {
          backgroundImage = await pdfDoc.embedJpg(bytes);
        }
      }
    } catch (error) {
      console.error('Error loading transport report template background:', error);
    }
  }

  for (const transport of transports) {
    const page = pdfDoc.addPage([595, 842]); // A4
    if (backgroundImage) {
      const { width, height } = page.getSize();
      page.drawImage(backgroundImage, { x: 0, y: 0, width, height });
    }
    await drawTransportReportPage(pdfDoc, page, transport, fields, helveticaFont, helveticaBold);
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}