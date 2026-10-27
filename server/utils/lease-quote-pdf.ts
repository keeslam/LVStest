// Lease quote customer PDF: draws a lease quote template (fields on one A4 page) with a
// plain data map. Task 6 prepares the data of a real quote; the template preview route
// calls this with sample data (see leaseQuotePreviewData in preview-sample.ts).
import * as fs from "fs";
import * as path from "path";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { parseTemplateFields, PAGE_WIDTH, PAGE_HEIGHT } from "../../shared/template-fields";
import { DEFAULT_SIGNATURE_BOX, SIGNATURE_LANDLORD_SOURCE, fitInBox } from "../../shared/contract-signature-box";
import { LEASE_QUOTE_TEMPLATE_SOURCES } from "../../shared/lease-quotes";
import { resolveDocumentFilePath } from "../services/document-paths";
import { sanitizeForWinAnsi, wrapTextToWidth } from "./pdf-text";

export interface LeaseQuoteTemplateLike {
  name?: string | null;
  fields?: unknown;
  backgroundPath?: string | null;
}

export interface DrawLeaseQuoteOptions {
  /** PNG of the landlord's signature for fields with source signatureLandlord; none = box stays empty. */
  landlordSignaturePng?: Uint8Array | null;
}

/**
 * Draws one A4 page. A field is only drawn when its source is allowed for lease quotes
 * (so a stale or hand-edited template can never print a cost-build-up value), and an empty
 * value draws nothing. Same box model as the transport report renderer: top-left origin,
 * 6pt horizontal and 1pt vertical padding, wrapping inside the field's width/height.
 */
export async function drawLeaseQuoteTemplate(
  template: LeaseQuoteTemplateLike,
  data: Record<string, string>,
  options: DrawLeaseQuoteOptions = {},
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  if (template.backgroundPath) {
    try {
      const full = resolveDocumentFilePath(template.backgroundPath);
      if (full) {
        const bytes = fs.readFileSync(full);
        const ext = path.extname(full).toLowerCase();
        const image = ext === ".png" ? await pdfDoc.embedPng(bytes)
          : ext === ".jpg" || ext === ".jpeg" ? await pdfDoc.embedJpg(bytes) : null;
        if (image) page.drawImage(image, { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT });
      }
    } catch (error) {
      console.error("Error loading lease quote template background:", error);
    }
  }

  const { fields, rejected } = parseTemplateFields(template.fields);
  if (rejected.length > 0) {
    console.warn(`[lease-quote] ${rejected.length} field(s) of template "${template.name ?? "?"}" were rejected: ${rejected.join(" | ")}`);
  }

  const signature = options.landlordSignaturePng
    ? await pdfDoc.embedPng(options.landlordSignaturePng).catch(() => null)
    : null;

  const paddingX = 6;
  const paddingY = 1;
  for (const field of fields as any[]) {
    try {
      const source: string | undefined = field.source;
      if (!source || !LEASE_QUOTE_TEMPLATE_SOURCES.includes(source)) continue;

      if (source === SIGNATURE_LANDLORD_SOURCE) {
        if (!signature) continue;
        const h = field.height || DEFAULT_SIGNATURE_BOX.height;
        const box = { x: field.x, y: PAGE_HEIGHT - field.y - h, width: field.width || DEFAULT_SIGNATURE_BOX.width, height: h };
        page.drawImage(signature, fitInBox(signature.width, signature.height, box));
        continue;
      }

      const raw = data[source] ?? "";
      if (raw === "") continue;
      const value = sanitizeForWinAnsi(raw, `lease quote field "${source}"`);
      if (value === "") continue;

      const x = Number.isFinite(field.x) ? field.x : 0;
      const y = Number.isFinite(field.y) ? field.y : 0;
      const fontSize = field.fontSize > 0 ? field.fontSize : 12;
      const f = field.isBold ? bold : font;
      const ascent = f.heightAtSize(fontSize) * 0.85;
      const lineHeight = fontSize * 1.15;
      const boxWidth = field.width && field.width > paddingX * 2
        ? field.width - paddingX * 2
        : Math.max(20, PAGE_WIDTH - x - paddingX * 2);
      const maxLines = field.height && field.height >= lineHeight ? Math.max(1, Math.floor(field.height / lineHeight)) : 1;
      const lines = wrapTextToWidth(value, f, fontSize, boxWidth, maxLines);

      lines.forEach((line, index) => {
        if (line === "") return;
        const textWidth = f.widthOfTextAtSize(line, fontSize);
        let drawX = x + paddingX;
        if (field.textAlign === "center") drawX = x - textWidth / 2;
        else if (field.textAlign === "right") drawX = x - textWidth - paddingX;
        drawX = Math.min(Math.max(0, drawX), Math.max(0, PAGE_WIDTH - textWidth));
        const drawY = PAGE_HEIGHT - y - paddingY - ascent - index * lineHeight;
        if (drawY < 0 || drawY > PAGE_HEIGHT) return;
        page.drawText(line, { x: drawX, y: drawY, size: fontSize, font: f, color: rgb(0, 0, 0) });
      });
    } catch (error) {
      console.error(`Error drawing lease quote field ${field.name || field.source}:`, error);
    }
  }

  return pdfDoc.save();
}
