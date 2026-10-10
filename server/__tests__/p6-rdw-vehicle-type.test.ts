/**
 * Audit A-3-5 — the vehicle type from the RDW. Real RDW rows (read from opendata.rdw.nl on
 * 2026-10-10): a VW Transporter, Fiat Ducato, Peugeot Boxer and Ford Transit/Tourneo are all
 * voertuigsoort "Personenauto", M1, inrichting "MPV", nine seats - the old MPV rule made them SUVs.
 * The network is stubbed; the RDW is never called.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchVehicleInfoByLicensePlate, vehicleTypeFromRdwRow } from "../utils/rdw-api";

function stubRdw(registration: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const rows = String(url).includes("m9d7-ebf2") ? [registration] : [];
      return new Response(JSON.stringify(rows), { status: 200, headers: { "Content-Type": "application/json" } });
    }),
  );
}
afterEach(() => vi.unstubAllGlobals());

const nineSeatVan = (merk: string, handelsbenaming: string) => ({
  merk,
  handelsbenaming,
  voertuigsoort: "Personenauto",
  inrichting: "MPV",
  europese_voertuigcategorie: "M1",
  aantal_zitplaatsen: "9",
});

describe("A-3-5 — RDW vehicle type", () => {
  it.each([
    ["VW Transporter", "11RHDF", nineSeatVan("VOLKSWAGEN", "TRANSPORTER")],
    ["Fiat Ducato", "53ZGH7", nineSeatVan("FIAT", "FIAT DUCATO")],
    ["Peugeot Boxer", "11ZSZ3", nineSeatVan("PEUGEOT", "PEUGEOT BOXER")],
    ["Ford Transit/Tourneo", "17XGSX", nineSeatVan("FORD", "TRANSIT/TOURNEO")],
  ])("%s (M1, MPV, nine seats) becomes a Van through the lookup", async (_name, plate, row) => {
    stubRdw(row);
    expect(await fetchVehicleInfoByLicensePlate(plate)).toMatchObject({ vehicleType: "Van" });
  });

  it("a real MPV/SUV passenger car with five seats stays an SUV", () => {
    expect(
      vehicleTypeFromRdwRow({ voertuigsoort: "Personenauto", inrichting: "MPV", europese_voertuigcategorie: "M1", aantal_zitplaatsen: "5" }),
    ).toBe("SUV");
    expect(
      vehicleTypeFromRdwRow({ voertuigsoort: "Personenauto", inrichting: "terreinwagen", europese_voertuigcategorie: "M1", aantal_zitplaatsen: "5" }),
    ).toBe("SUV");
  });

  it("the EU category N1 and a closed body or delivery-van body are a Van before the MPV rule", () => {
    expect(vehicleTypeFromRdwRow({ voertuigsoort: "Personenauto", inrichting: "MPV", europese_voertuigcategorie: "N1", aantal_zitplaatsen: "3" })).toBe("Van");
    expect(vehicleTypeFromRdwRow({ voertuigsoort: "Personenauto", inrichting: "gesloten opbouw", europese_voertuigcategorie: "M1" })).toBe("Van");
    expect(vehicleTypeFromRdwRow({ voertuigsoort: "Personenauto", inrichting: "bestelwagen" })).toBe("Van");
    expect(vehicleTypeFromRdwRow({ voertuigsoort: "Bedrijfsauto", inrichting: "gesloten opbouw", europese_voertuigcategorie: "N1" })).toBe("Van");
  });

  it("the ordinary passenger car bodies are unchanged", () => {
    expect(vehicleTypeFromRdwRow({ voertuigsoort: "Personenauto", inrichting: "hatchback", europese_voertuigcategorie: "M1", aantal_zitplaatsen: "5" })).toBe("Hatchback");
    expect(vehicleTypeFromRdwRow({ voertuigsoort: "Personenauto", inrichting: "stationwagen", aantal_zitplaatsen: "5" })).toBe("Stationwagen");
    expect(vehicleTypeFromRdwRow({ voertuigsoort: "Personenauto", inrichting: "sedan", aantal_zitplaatsen: "5" })).toBe("Sedan");
    expect(vehicleTypeFromRdwRow({ voertuigsoort: "Personenauto" })).toBe("Sedan");
    expect(vehicleTypeFromRdwRow({ voertuigsoort: "Bedrijfsauto" })).toBe("Van");
    expect(vehicleTypeFromRdwRow({ voertuigsoort: "Motorfiets" })).toBe("Motorcycle");
    expect(vehicleTypeFromRdwRow({})).toBeNull();
  });
});
