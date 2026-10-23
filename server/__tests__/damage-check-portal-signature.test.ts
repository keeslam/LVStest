/**
 * Kees, 2026-10-23: the customer's signature from the portal lands in the damage check's own
 * signature box, the one its template marks as "Handtekening klant" (or names huurder/klant).
 * A check the customer already signed on the tablet keeps that signature; nothing is recorded.
 */
import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { generateDamageCheckPDFWithTemplate } from "../pdf-damage-check-generator";
import { buildSignedPdf } from "../services/contract-signing";
import { damageCheckSignatureRole, tenantSignatureBoxFrom, tenantSignatureKeyword } from "../../shared/contract-signature-box";

// A 1x1 transparent PNG.
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const PNG = Buffer.from(PNG_B64, "base64");
const vehicle = { licensePlate: "AB123C", brand: "Ford", model: "Transit" } as any;
const template = (fields: any[]) => ({ id: 1, name: "t", canvasFields: fields }) as any;
const signInfo = {
  kind: "damage_check", signerName: "Klant", signerEmail: "k@example.nl", companyName: "Klant BV",
  signedAt: new Date("2026-10-23T10:00:00Z"), reservationId: 7, contractNumber: "C-7",
  originalFileName: "s.pdf", originalVersion: 1, ip: null, userAgent: null, originalSha256: "x", portalOwner: "LAM",
} as any;

describe("damage check signature from the portal", () => {
  it("knows who signs a field: source first, else the name", () => {
    expect(damageCheckSignatureRole({ source: "signatureTenant", name: "Verhuurder" })).toBe("customer");
    expect(damageCheckSignatureRole({ source: "signatureLandlord" })).toBe("staff");
    expect(damageCheckSignatureRole({ name: "Handtekening huurder" })).toBe("customer");
    expect(damageCheckSignatureRole({ name: "Handtekening verhuurder" })).toBe("staff");
    expect(damageCheckSignatureRole({ name: "Paraaf" })).toBeNull();
  });

  it("keeps a page in the keyword and reads the old four-number form as page 1", () => {
    expect(tenantSignatureBoxFrom(tenantSignatureKeyword({ x: 10, y: 20, width: 30, height: 40, page: 1 }))).toEqual({ x: 10, y: 20, width: 30, height: 40, page: 1 });
    expect(tenantSignatureBoxFrom("lvs-tenant-signature:10,20,30,40")).toEqual({ x: 10, y: 20, width: 30, height: 40 });
  });

  it("records the customer's box on its page and fills it when the customer signs", async () => {
    const pdf = await generateDamageCheckPDFWithTemplate(vehicle, template([
      { id: "a", type: "text", name: "Pagina 1", x: 40, y: 40, fontSize: 11, page: 1 },
      { id: "s", type: "signature", source: "signatureTenant", name: "Klant", x: 300, y: 700, width: 180, height: 50, fontSize: 9, page: 2 },
    ]));
    const box = tenantSignatureBoxFrom((await PDFDocument.load(pdf)).getKeywords());
    expect(box).toEqual({ x: 300, y: 842 - 700 - 50, width: 180, height: 50, page: 1 });

    const signed = await PDFDocument.load(await buildSignedPdf(pdf, PNG, signInfo));
    expect(signed.getPageCount()).toBe(3); // two pages and the proof page
  });

  it("records nothing when the customer already signed on the tablet", async () => {
    const pdf = await generateDamageCheckPDFWithTemplate(vehicle, template([
      { id: "s", type: "signature", name: "Handtekening huurder", x: 300, y: 700, width: 180, height: 50, fontSize: 9, page: 1 },
    ]), undefined, { customerSignature: `data:image/png;base64,${PNG_B64}` });
    expect(tenantSignatureBoxFrom((await PDFDocument.load(pdf)).getKeywords())).toBeNull();
  });
});
