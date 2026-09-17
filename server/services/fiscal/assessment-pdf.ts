/**
 * One assessment as a PDF: the same explanation the screen shows, with the
 * facts of the period at the top and the assessment's identity at the bottom,
 * so the sheet can be filed and reproduced (docs/fiscaal, stap 6). Built with
 * the same pdf-lib and text helpers as the other documents of the app.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { customers, vehicles, type FiscalAssessment } from "../../../shared/schema";
import { FISCAL_STATUS_LABELS, ASSESSMENT_TRIGGER_LABELS, type AssessmentTrigger, type FiscalAssessmentStatus } from "../../../shared/fiscal-types";
import { dateLabelNl } from "../../../shared/fiscal-format";
import { sanitizeForWinAnsi, wrapTextToWidth } from "../../utils/pdf-text";
import { explanationFor } from "./portal-storage";

export interface AssessmentPdfContext {
  customerName: string;
  licensePlate: string | null;
  vehicle: string | null;
  /** Besluit F-05: a customer without the dashboard switch gets the sheet without amounts. */
  withAmounts: boolean;
}

const PAGE = { width: 595, height: 842, margin: 50 } as const;
const LINE = 14;

class Sheet {
  private page!: PDFPage;
  private y = 0;
  constructor(private readonly doc: PDFDocument, private readonly font: PDFFont, private readonly bold: PDFFont) {
    this.newPage();
  }
  private newPage(): void {
    this.page = this.doc.addPage([PAGE.width, PAGE.height]);
    this.y = PAGE.height - PAGE.margin;
  }
  private ensure(lines: number): void {
    if (this.y - lines * LINE < PAGE.margin + LINE) this.newPage();
  }
  text(text: string, options: { size?: number; bold?: boolean; gap?: number } = {}): void {
    const size = options.size ?? 10;
    const font = options.bold ? this.bold : this.font;
    const width = PAGE.width - 2 * PAGE.margin;
    const lines = wrapTextToWidth(sanitizeForWinAnsi(text, "fiscal-pdf"), font, size, width, 200);
    for (const line of lines) {
      this.ensure(1);
      this.page.drawText(line, { x: PAGE.margin, y: this.y, size, font, color: rgb(0.1, 0.1, 0.1) });
      this.y -= LINE * (size / 10);
    }
    this.y -= options.gap ?? 0;
  }
  footer(text: string): void {
    for (const page of this.doc.getPages()) {
      page.drawText(sanitizeForWinAnsi(text, "fiscal-pdf-footer"), { x: PAGE.margin, y: PAGE.margin / 2, size: 7, font: this.font, color: rgb(0.4, 0.4, 0.4) });
    }
  }
}

/** The names the sheet carries, read from the database. */
export async function assessmentPdfContext(assessment: FiscalAssessment, withAmounts: boolean): Promise<AssessmentPdfContext> {
  const [customer] = await db.select({ name: customers.name }).from(customers).where(eq(customers.id, assessment.customerId));
  const [vehicle] = assessment.vehicleId === null
    ? [undefined]
    : await db.select({ licensePlate: vehicles.licensePlate, brand: vehicles.brand, model: vehicles.model }).from(vehicles).where(eq(vehicles.id, assessment.vehicleId));
  return {
    customerName: customer?.name ?? `klant ${assessment.customerId}`,
    licensePlate: vehicle?.licensePlate ?? null,
    vehicle: vehicle ? [vehicle.brand, vehicle.model].filter(Boolean).join(" ") || null : null,
    withAmounts,
  };
}

export async function renderAssessmentPdf(assessment: FiscalAssessment, ctx: AssessmentPdfContext): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Fiscale beoordeling ${assessment.id}`);
  doc.setProducer("Auto Lease LAM");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const sheet = new Sheet(doc, font, bold);

  sheet.text("Fiscale beoordeling — pseudo-eindheffing fossiele personenauto's", { size: 15, bold: true, gap: 6 });
  const status = FISCAL_STATUS_LABELS[assessment.status as FiscalAssessmentStatus] ?? assessment.status;
  const stand = assessment.isFinal ? "Eindberekening" : assessment.periodEnd === null ? "Voorlopig (einddatum nog niet bekend)" : "Voorlopig";
  const facts = [
    `Klant: ${ctx.customerName}`,
    `Voertuig: ${[ctx.licensePlate, ctx.vehicle].filter(Boolean).join(" · ") || "onbekend"}`,
    `Periode: ${dateLabelNl(assessment.periodStart)} t/m ${assessment.periodEnd ? dateLabelNl(assessment.periodEnd) : "open"} (beoordeeld t/m ${dateLabelNl(assessment.periodEndEffective)})`,
    `Status: ${status}`,
    `Stand: ${stand}`,
    `Beoordelingsdatum: ${dateLabelNl(assessment.calculationDate)} · aanleiding: ${ASSESSMENT_TRIGGER_LABELS[assessment.trigger as AssessmentTrigger] ?? assessment.trigger}`,
  ];
  for (const line of facts) sheet.text(line, { size: 10 });
  sheet.text("", { gap: 6 });

  sheet.text(explanationFor(assessment, ctx.withAmounts), { size: 10 });

  sheet.footer(`Beoordeling #${assessment.id} (volgnummer ${assessment.sequence}) · invoerhash ${assessment.inputHash.slice(0, 16)} · vastgelegd ${assessment.createdAt.toISOString().slice(0, 19).replace("T", " ")} UTC · Auto Lease LAM`);
  return Buffer.from(await doc.save());
}
