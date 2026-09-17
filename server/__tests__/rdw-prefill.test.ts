/**
 * The RDW prefill of a new vehicle: fuel and emission class come from the fuel
 * data set (8ys7-d773), the body type from the registration's "inrichting".
 * The network is stubbed; the RDW is never called.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchVehicleInfoByLicensePlate } from "../utils/rdw-api";

function stubRdw(registration: Record<string, unknown>, fuels: Array<Record<string, unknown>>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const rows = String(url).includes("m9d7-ebf2") ? [registration] : fuels;
      return new Response(JSON.stringify(rows), { status: 200, headers: { "Content-Type": "application/json" } });
    }),
  );
}
afterEach(() => vi.unstubAllGlobals());

describe("RDW prefill of a vehicle", () => {
  it("reads a hybrid from the fuel rows, the Euro class from the first row, and the body type from the inrichting", async () => {
    stubRdw(
      { kenteken: "GGD74K", merk: "TOYOTA", handelsbenaming: "YARIS", voertuigsoort: "Personenauto", inrichting: "hatchback", datum_eerste_toelating: "20240501" },
      [
        { brandstof_omschrijving: "Elektriciteit", klasse_hybride_elektrisch_voertuig: "NOVC-HEV", uitlaatemissieniveau: "EURO 6 EA" },
        { brandstof_omschrijving: "Benzine" },
      ],
    );
    const vehicle = await fetchVehicleInfoByLicensePlate("GGD-74-K");
    expect(vehicle).toMatchObject({ fuel: "Hybrid", euroZone: "EURO 6 EA", vehicleType: "Hatchback", brand: "TOYOTA", productionDate: "2024-05-01" });
  });

  it("LPG next to petrol is LPG, a station wagon keeps its body type, a van without fuel rows leaves the fuel empty", async () => {
    stubRdw(
      { kenteken: "07ZJLJ", merk: "LAND ROVER", handelsbenaming: "RANGE ROVER", voertuigsoort: "Personenauto", inrichting: "stationwagen" },
      [{ brandstof_omschrijving: "LPG" }, { brandstof_omschrijving: "Benzine" }],
    );
    expect(await fetchVehicleInfoByLicensePlate("07-ZJ-LJ")).toMatchObject({ fuel: "LPG", vehicleType: "Stationwagen" });

    stubRdw({ kenteken: "04VKD6", merk: "RENAULT", handelsbenaming: "MASTER", voertuigsoort: "Bedrijfsauto", inrichting: "gesloten opbouw" }, []);
    expect(await fetchVehicleInfoByLicensePlate("04-VKD-6")).toMatchObject({ fuel: null, vehicleType: "Van" });
  });
});
