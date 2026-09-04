import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { parseCjibFile, parseAmount, parseDay, parseTime } from "../services/cjib/parser";

const fixture = (name: string) => fs.readFileSync(path.join(__dirname, "fixtures", "cjib", name));

describe("cjib parser", () => {
  it("reads the XML fixture", () => {
    const { records } = parseCjibFile(fixture("beschikkingen.xml"), "beschikkingen.xml");
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      reference: "1234567890", licensePlate: "PTCJ01", amount: 95, offenceCode: "VM012", location: "A2 Utrecht",
      description: "Overschrijding maximumsnelheid met 12 km/u, A2 Utrecht", letterDate: "2026-07-30", dueDate: "2026-09-27",
    });
    expect(records[0].offenceAt.toISOString()).toBe(new Date("2026-07-26T21:17:00").toISOString());
    // Second record: ISO date, no time, integer amount, no location.
    expect(records[1]).toMatchObject({ reference: "1234567891", licensePlate: "PTCJ02", amount: 410, location: null, dueDate: null });
    expect(records[1].offenceAt.getHours()).toBe(0);
  });

  it("reads the CSV fixture with ; separator, quoted decimal comma and compact dates", () => {
    const { records } = parseCjibFile(fixture("beschikkingen.csv"), "beschikkingen.csv");
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ reference: "2000000001", licensePlate: "PTCJ03", amount: 63, letterDate: "2026-08-18" });
    expect(records[0].offenceAt.toISOString()).toBe(new Date("2026-08-15T08:30:00").toISOString());
    expect(records[0].description).toBe("Overschrijding maximumsnelheid met 8 km/u, N201 Uithoorn");
    expect(records[1]).toMatchObject({ reference: "2000000002", amount: 280 });
    expect(records[1].offenceAt.getHours()).toBe(0);
  });

  it("falls back to the offence code when there is no description", () => {
    const csv = "beschikkingsnummer,kenteken,pleegdatum,feitcode,bedrag\n1,AB-12-CD,01-09-2026,VM010,50\n";
    expect(parseCjibFile(csv).records[0].description).toBe("Feitcode VM010");
  });

  it("rejects records without the required fields", () => {
    const csv = "beschikkingsnummer;kenteken;pleegdatum;bedrag\n1;;01-09-2026;50\n";
    const r = parseCjibFile(csv);
    expect(r.records).toHaveLength(0);
    expect(r.rejected[0]).toMatchObject({ row: 1, error: expect.stringMatching(/missing kenteken/) });
  });

  it("rejects unreadable input", () => {
    expect(() => parseCjibFile("<Beschikkingen><Iets>x</Iets></Beschikkingen>")).toThrow(/No beschikkingen/);
    expect(() => parseCjibFile("just a header")).toThrow(/CSV/);
  });

  it("normalises dates, times and amounts", () => {
    expect(parseDay("26-07-2026")).toBe("2026-07-26");
    expect(parseDay("2026-07-26T10:00")).toBe("2026-07-26");
    expect(parseDay("20260726")).toBe("2026-07-26");
    expect(parseDay("juli")).toBeNull();
    expect(parseTime("9:05")).toBe("09:05");
    expect(parseTime("0830")).toBe("08:30");
    expect(parseTime(null)).toBe("00:00");
    expect(parseAmount("€ 1.234,50")).toBe(1234.5);
    expect(parseAmount("95,00")).toBe(95);
    expect(parseAmount("410")).toBe(410);
    expect(parseAmount("n.v.t.")).toBeNull();
  });
});
