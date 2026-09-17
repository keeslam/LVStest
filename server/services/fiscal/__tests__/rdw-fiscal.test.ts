/**
 * The RDW client for fiscal facts: two open-data sets (vehicle registration
 * m9d7-ebf2 and fuel/emissions 8ys7-d773), read with an injected fetch so no
 * test touches the network.
 */
import { describe, it, expect, vi } from "vitest";
import { fetchRdwFiscalData, RDWNotFoundError, RDWUpstreamError } from "../../../utils/rdw-api";

function fetchMock(vehicleRows: unknown[], fuelRows: unknown[], status = 200) {
  const calls: string[] = [];
  const impl = vi.fn(async (url: string | URL) => {
    const u = String(url);
    calls.push(u);
    const body = u.includes("m9d7-ebf2") ? vehicleRows : fuelRows;
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

describe("RDW fiscal data", () => {
  it("reads both data sets for a normalised plate and keeps the raw rows", async () => {
    const { impl, calls } = fetchMock(
      [{ kenteken: "AB123C", catalogusprijs: "36000", europese_voertuigcategorie: "M1", voertuigsoort: "Personenauto", inrichting: "hatchback", datum_eerste_toelating: "20240501" }],
      [{ brandstof_volgnummer: "1", brandstof_omschrijving: "Benzine", co2_uitstoot_gecombineerd: "120", emissie_co2_gecombineerd_wltp: "135" }],
    );
    const data = await fetchRdwFiscalData("ab-123-c", impl);
    expect(calls.some((c) => c.includes("m9d7-ebf2.json?kenteken=AB123C"))).toBe(true);
    expect(calls.some((c) => c.includes("8ys7-d773.json?kenteken=AB123C"))).toBe(true);
    expect(data.vehicle?.catalogusprijs).toBe("36000");
    expect(data.fuels).toHaveLength(1);
    expect(data.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("reports an unknown plate as not found", async () => {
    const { impl } = fetchMock([], []);
    await expect(fetchRdwFiscalData("XX-999-X", impl)).rejects.toBeInstanceOf(RDWNotFoundError);
  });

  it("reports an upstream failure as such", async () => {
    const { impl } = fetchMock([], [], 503);
    await expect(fetchRdwFiscalData("AB-123-C", impl)).rejects.toBeInstanceOf(RDWUpstreamError);
  });

  it("tolerates a vehicle without fuel rows", async () => {
    const { impl } = fetchMock([{ kenteken: "AB123C", voertuigsoort: "Aanhangwagen" }], []);
    const data = await fetchRdwFiscalData("AB123C", impl);
    expect(data.fuels).toEqual([]);
  });
});
