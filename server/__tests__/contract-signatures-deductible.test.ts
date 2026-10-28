/**
 * Kees, 2026-10-21 — "Getekend te", the damage line, the deductible per customer per
 * vehicle type, and the signature boxes on the contract (landlord drawn at generation,
 * tenant drawn into the recorded box when the customer signs in the portal).
 */
import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { contractBusinessTexts, contractDeductibles, generateRentalContractFromTemplate, prepareContractData } from "../utils/pdf-generator";
import { buildSignedPdf } from "../services/contract-signing";
import { tenantSignatureBoxFrom } from "../../shared/contract-signature-box";
import { isValidCustomerDeductibles } from "../../shared/customer-deductibles";
import { isValidStaffSignature } from "../../shared/staff-signature";

// A 1x1 transparent PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

const reservation = (customer: Record<string, unknown> = {}) => ({
  id: 7, contractNumber: "C-7", startDate: "2026-10-01", endDate: "2026-10-08", totalPrice: "100",
  vehicle: { licensePlate: "AB123C", brand: "Ford", model: "Transit", chassisNumber: "", vehicleType: "Van" },
  customer: { name: "Klant", city: "Utrecht", postalCode: "1234 AB", phone: "", driverLicenseNumber: "", ...customer },
}) as any;

describe("contract texts and deductible", () => {
  it("prints Zuidland and the damage line unless the business rules say otherwise", () => {
    expect(contractBusinessTexts(null)).toEqual({ signingPlace: "Zuidland", damageNote: "Zie schadecheck" });
    expect(contractBusinessTexts({ signingPlace: "Rotterdam", damageNoteText: "Zie bijlage" })).toEqual({ signingPlace: "Rotterdam", damageNote: "Zie bijlage" });
  });

  it("uses the customer's amount for the car's type, the general amount otherwise", () => {
    const deductibles = { byType: { van: { domestic: 250, abroad: null } } };
    const d = contractDeductibles({ eigenrisicoBusBinnenland: "500", eigenrisicoBusBuitenland: "1000" }, deductibles, "Van"); // a Van is a bus
    expect(d.domestic).toMatch(/250,00/);
    expect(d.abroad).toMatch(/1\.000,00/);
    const data = prepareContractData(reservation({ deductibles }), { eigenrisicoBinnenland: "500" });
    expect(data.deductibleDomestic).toMatch(/250,00/);
    expect(isValidCustomerDeductibles({ byType: { van: { domestic: -1 } } })).toBe(false);
    expect(isValidCustomerDeductibles(null)).toBe(true);
  });

  it("accepts only a PNG data URL as a staff signature", () => {
    expect(isValidStaffSignature({ png: "data:image/png;base64," + "A".repeat(400) })).toBe(true);
    expect(isValidStaffSignature({ png: "data:image/jpeg;base64," + "A".repeat(400) })).toBe(false);
  });
});

describe("barcode field", () => {
  it("prints the barcode in the template's box, and top right without one", async () => {
    const { PDFName, PDFDict } = await import("pdf-lib");
    const imageCount = async (pdf: Buffer) => {
      const doc = await PDFDocument.load(pdf);
      return doc.getPage(0).node.Resources()?.lookup(PDFName.of("XObject"), PDFDict)?.keys().length ?? 0;
    };
    const withField = { id: 1, name: "t", fields: [{ id: "b", source: "reservationBarcode", x: 50, y: 50, fontSize: 12 }] } as any;
    const without = { id: 1, name: "t", fields: [] } as any;
    // One barcode either way (the page also holds the embedded default background), never two.
    const placed = await imageCount(await generateRentalContractFromTemplate(reservation(), withField, null));
    const standard = await imageCount(await generateRentalContractFromTemplate(reservation(), without, null));
    expect(placed).toBe(standard);
    expect(placed).toBeGreaterThan(0);
  });
});

describe("signature boxes", () => {
  it("records the tenant box at generation and fills it when the customer signs", async () => {
    const template = { id: 1, name: "t", fields: [{ id: "s", source: "signatureTenant", x: 300, y: 700, fontSize: 12 }] } as any;
    const contract = await generateRentalContractFromTemplate(reservation(), template, null);
    const box = tenantSignatureBoxFrom((await PDFDocument.load(contract)).getKeywords());
    expect(box).toEqual({ x: 300, y: 842 - 700 - 55, width: 170, height: 55 });

    const signed = await buildSignedPdf(contract, PNG, {
      kind: "contract", signerName: "Klant", signerEmail: "k@example.nl", companyName: "Klant BV",
      signedAt: new Date("2026-10-21T10:00:00Z"), reservationId: 7, contractNumber: "C-7",
      originalFileName: "c.pdf", originalVersion: 1, ip: null, userAgent: null, originalSha256: "x", portalOwner: "LAM",
    } as any);
    expect((await PDFDocument.load(signed)).getPageCount()).toBe(2);
  });
});
