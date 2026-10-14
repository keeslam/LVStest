import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { extractPdfTextRows, linesFromTextRows, parseTableRows } from "../utils/invoice-text-rows";

const rows = [
  "Auto Lease Lam",
  " | Factuurnummer |  | : 26000840",
  " | Omschrijving |   | Aantal |   | Stuksprijs | Korting | Bedrag",
  " | Remblokken voor vervangen\nKoppeling vervangen\nKoplampen voor vervangen",
  " | Remblokkenset |   | 1 |   | 74,00 |   | 45,82% | 40,09 |   | 1",
  " | Kleinmateriaal |   | 1 |   | 5,00 |   | 5,00 |   | 1",
  " | Milieuheffing |   | 1 |   | 2,50 |   | 2,50 |   | 1",
  " | Koppelingsset |   | 1 |   | 246,34 |   | 16,00% | 206,93 |   | 1",
  " | Werkplaats tarief LAM |   | 6 |   | 40,00 |   | 240,00 |   | 1",
  " | Versnellingsbak Olie |   | 2,1 |   | 17,70 |   | 85,88% | 5,25 |   | 1",
  " | Gloeilamp, koplamp |   | 2 |   | 38,65 |   | 38,01% | 47,92 |   | 1",
  " | Btwcode |   | % |  | Grondslag |  | BTW Bedrag",
  " | 1 |   | 21,00 |  | € 547,69 |  | € 115,01",
];

describe("invoice text rows", () => {
  it("keeps description and amount of the same row and skips heading rows", () => {
    const lines = linesFromTextRows(rows, { totalAmount: 662.7, subtotalAmount: 547.69, vatAmount: 115.01 });
    expect(lines).toEqual([
      { description: "Remblokkenset", amount: 40.09 }, { description: "Kleinmateriaal", amount: 5 },
      { description: "Milieuheffing", amount: 2.5 }, { description: "Koppelingsset", amount: 206.93 },
      { description: "Werkplaats tarief LAM", amount: 240 }, { description: "Versnellingsbak Olie", amount: 5.25 },
      { description: "Gloeilamp, koplamp", amount: 47.92 },
    ]);
  });

  it("trusts the table only when it adds up to the invoice", () => {
    expect(linesFromTextRows(rows, { totalAmount: 700, subtotalAmount: 600, vatAmount: 100 })).toBeNull();
    expect(linesFromTextRows(["geen tabel"], { totalAmount: 1 })).toBeNull();
    expect(parseTableRows(["geen tabel"])).toEqual([]);
  });

  it("reads the real Bernisse invoice from its text layer when present", async () => {
    const dir = path.join(process.cwd(), "uploads", "invoice-inbox");
    const file = fs.existsSync(dir) ? fs.readdirSync(dir).find((f) => f.endsWith("FACTUUR_26000840.pdf")) : undefined;
    if (!file) return;
    const lines = linesFromTextRows(await extractPdfTextRows(path.join(dir, file)), { totalAmount: 662.7, subtotalAmount: 547.69, vatAmount: 115.01 });
    expect(lines?.map((l) => l.description)).toEqual(["Remblokkenset", "Kleinmateriaal", "Milieuheffing", "Koppelingsset", "Werkplaats tarief LAM", "Versnellingsbak Olie", "Gloeilamp, koplamp"]);
  });
});
