/**
 * Kees, 2026-10-23: a template preview must show a value in every field that can be placed
 * (km readings, driver, fuel, APK, company...) and a sample signature in the signature boxes.
 */
import { describe, it, expect } from "vitest";
import { PDFDocument, PDFName, PDFDict } from "pdf-lib";
import { generateRentalContractFromTemplate, prepareContractData } from "../utils/pdf-generator";
import { contractPreviewReservation } from "../utils/preview-sample";
import { sampleSignaturePng } from "../utils/sample-signature";

async function imageCount(pdf: Buffer): Promise<number> {
  const doc = await PDFDocument.load(pdf);
  const resources = doc.getPage(0).node.Resources();
  const xobjects = resources?.lookupMaybe(PDFName.of("XObject"), PDFDict);
  return xobjects ? xobjects.keys().length : 0;
}

describe("template preview sample", () => {
  it("fills every contract value", () => {
    const data = prepareContractData(contractPreviewReservation(new Date("2026-10-23T10:00:00Z")), null) as Record<string, unknown>;
    const empty = Object.entries(data).filter(([key, v]) => key !== "vehicleId" && (v === "" || v === null || v === undefined)).map(([key]) => key);
    expect(empty).toEqual([]);
    expect(data.driverName).toBe("Jan de Vries");
    expect(data.pickupMileage).toMatch(/48\.250/);
  });

  it("draws a sample signature in both boxes in a preview, none in a real contract", async () => {
    expect(sampleSignaturePng().subarray(1, 4).toString()).toBe("PNG");
    const template = { id: 1, name: "t", fields: [
      { id: "a", source: "signatureTenant", x: 60, y: 700, fontSize: 12 },
      { id: "b", source: "signatureLandlord", x: 320, y: 700, fontSize: 12 },
    ] } as any;
    const reservation = contractPreviewReservation();
    const real = await imageCount(await generateRentalContractFromTemplate(reservation, template, null));
    const preview = await imageCount(await generateRentalContractFromTemplate(reservation, template, null, { preview: true }));
    expect(preview).toBeGreaterThan(real);
  });
});
