/**
 * Punt 15 / OPT-032 (Kees, 2026-10-20) — the A4 print of a key-cabinet audit.
 */
import { describe, it, expect } from "vitest";
import "@/i18n";
import { buildKeyAuditPrintHtml } from "@/components/barcodes/key-audit-print";

const audit = {
  mode: "main",
  finishedAt: "2026-10-20T12:30:00.000Z",
  performedByName: "Jan Balie",
  expectedCount: 3,
  scannedCount: 2,
  missing: [{ vehicleId: 1, licensePlate: "AB123C", brand: "Volkswagen", model: "Polo" }],
  unexpected: [],
  scanned: [
    { vehicleId: 2, licensePlate: "XY999Z", brand: "Ford", model: "Transit" },
    { vehicleId: 3, licensePlate: "QQ111A", brand: "Fiat", model: "<Ducato>" },
  ],
  note: "Sleutel AB-123-C ligt bij de garage",
} as any;

describe("buildKeyAuditPrintHtml", () => {
  it("prints the cabinet, the time in Amsterdam, who, and the counts", () => {
    const html = buildKeyAuditPrintHtml(audit);
    expect(html).toContain("Sleutelkastcontrole – hoofdsleutels");
    expect(html).toContain("14:30");
    expect(html).toContain("Jan Balie");
    expect(html).toContain("2 gescand van 3 verwacht");
  });

  it("lists missing, unexpected and every scanned key, plus the note and a signature line", () => {
    const html = buildKeyAuditPrintHtml(audit);
    expect(html).toContain("Ontbrekende sleutels (1)");
    expect(html).toContain("AB-123-C");
    expect(html).toContain("Sleutels die er niet horen (0)");
    expect(html).toContain("Alle gescande sleutels (2)");
    expect(html).toContain("XY-999-Z");
    expect(html).toContain("Sleutel AB-123-C ligt bij de garage");
    expect(html).toContain("Handtekening");
  });

  it("escapes what came from the data", () => {
    expect(buildKeyAuditPrintHtml(audit)).toContain("&lt;Ducato&gt;");
  });

  it("says spare keys for the spare cabinet", () => {
    expect(buildKeyAuditPrintHtml({ ...audit, mode: "spare" })).toContain("reservesleutels");
  });
});
