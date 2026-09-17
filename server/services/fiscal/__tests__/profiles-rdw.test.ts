/**
 * Refreshing a vehicle's fiscal profile from RDW: the facts land with their
 * source and time, a manual value is never overwritten, a failure is recorded
 * and never thrown, and the fuel rows become a fuel class.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { db } from "../../../db";
import { fiscalAuditEvents } from "../../../../shared/schema";
import { and, eq } from "drizzle-orm";
import { ensureProfile, applyManualOverride, refreshFromRdw, normaliseRdwFiscal } from "../profiles";
import { createFixtureVehicle, cleanupFixtures } from "../../../__tests__/helpers/fixtures";
import { cleanupFiscalFixtures, FIXTURE_ACTOR } from "../../../__tests__/helpers/fiscal";

function rdw(vehicle: Record<string, unknown> | null, fuels: Array<Record<string, unknown>>, status = 200): typeof fetch {
  return vi.fn(async (url: string | URL) => {
    const rows = String(url).includes("m9d7-ebf2") ? (vehicle ? [vehicle] : []) : fuels;
    return new Response(JSON.stringify(rows), { status, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
}

const FOSSIL = rdw(
  { kenteken: "FIXT1", catalogusprijs: "36000", europese_voertuigcategorie: "M1", europese_voertuigcategorie_toevoeging: null, voertuigsoort: "Personenauto", inrichting: "hatchback", datum_eerste_toelating: "20240501" },
  [{ brandstof_volgnummer: "1", brandstof_omschrijving: "Benzine", co2_uitstoot_gecombineerd: "120", emissie_co2_gecombineerd_wltp: "135" }],
);

beforeAll(async () => {
  await cleanupFixtures();
  await cleanupFiscalFixtures();
});
afterAll(async () => {
  await cleanupFixtures();
  await cleanupFiscalFixtures();
});

describe("normalisation of RDW rows", () => {
  it("classifies fuel rows and prefers the WLTP CO₂ figure", () => {
    const n = normaliseRdwFiscal({ vehicle: { catalogusprijs: "36000", datum_eerste_toelating: "20240501" }, fuels: [{ brandstof_omschrijving: "Benzine", co2_uitstoot_gecombineerd: "120", emissie_co2_gecombineerd_wltp: "135" }], retrievedAt: "2026-09-17T00:00:00.000Z" });
    expect(n).toMatchObject({ catalogValue: "36000.00", firstAdmissionDate: "2024-05-01", fuelCategory: "fossil", co2GKm: 135, co2SourceField: "emissie_co2_gecombineerd_wltp", fuelDescriptions: ["Benzine"] });
    const hybrid = normaliseRdwFiscal({ vehicle: {}, fuels: [{ brandstof_omschrijving: "Benzine" }, { brandstof_omschrijving: "Elektriciteit", klasse_hybride_elektrisch_voertuig: "OVC-HEV" }], retrievedAt: "x" });
    expect(hybrid.fuelCategory).toBe("hybrid");
    expect(hybrid.hybridClass).toBe("OVC-HEV");
    expect(normaliseRdwFiscal({ vehicle: {}, fuels: [{ brandstof_omschrijving: "Elektriciteit" }], retrievedAt: "x" }).fuelCategory).toBe("zero_emission");
    expect(normaliseRdwFiscal({ vehicle: {}, fuels: [{ brandstof_omschrijving: "Waterstof" }], retrievedAt: "x" }).fuelCategory).toBe("zero_emission");
    expect(normaliseRdwFiscal({ vehicle: {}, fuels: [], retrievedAt: "x" }).fuelCategory).toBe("unknown");
    expect(normaliseRdwFiscal({ vehicle: { catalogusprijs: "" }, fuels: [], retrievedAt: "x" }).catalogValue).toBeNull();
  });
});

describe("profile refresh from RDW", () => {
  it("fills the profile with sourced facts, keeps the raw rows and audits the refresh", async () => {
    const vehicle = await createFixtureVehicle({ fuel: null });
    const result = await refreshFromRdw(vehicle.id, FIXTURE_ACTOR, FOSSIL);
    expect(result.ok).toBe(true);
    expect(result.profile).toMatchObject({ catalogValue: "36000.00", catalogValueSource: "rdw", europeanCategory: "M1", vehicleKind: "Personenauto", bodyType: "hatchback", firstAdmissionDate: "2024-05-01", firstAdmissionSource: "rdw", fuelCategory: "fossil", co2GKm: 135, rdwError: null });
    expect(result.profile.rdwRetrievedAt).not.toBeNull();
    expect(result.profile.catalogValueRetrievedAt).not.toBeNull();
    expect((result.profile.rdwRaw as any).fuels).toHaveLength(1);
    expect(result.changed).toEqual(expect.arrayContaining(["catalogValue", "europeanCategory", "fuelCategory"]));
    const events = await db.select().from(fiscalAuditEvents).where(and(eq(fiscalAuditEvents.vehicleId, vehicle.id), eq(fiscalAuditEvents.action, "profile_refreshed")));
    expect(events).toHaveLength(1);
    expect((events[0].details as any).changed).toContain("catalogValue");
  });

  it("never overwrites a value a person set", async () => {
    const vehicle = await createFixtureVehicle({ fuel: "Diesel" });
    await ensureProfile(vehicle.id);
    await applyManualOverride(vehicle.id, { field: "catalogValue", value: "40000", reason: "factuur" }, FIXTURE_ACTOR);
    await applyManualOverride(vehicle.id, { field: "fuelCategory", value: "hybrid", reason: "kentekenbewijs" }, FIXTURE_ACTOR);
    const { profile } = await refreshFromRdw(vehicle.id, FIXTURE_ACTOR, FOSSIL);
    expect(profile.catalogValue).toBe("40000.00");
    expect(profile.catalogValueSource).toBe("manual");
    expect(profile.fuelCategory).toBe("hybrid");
    // Facts nobody set by hand do come in.
    expect(profile.europeanCategory).toBe("M1");
  });

  it("records a failure on the profile and does not throw", async () => {
    const vehicle = await createFixtureVehicle({ fuel: "Diesel", productionDate: "2020-01-01" });
    const result = await refreshFromRdw(vehicle.id, FIXTURE_ACTOR, rdw(null, []));
    expect(result.ok).toBe(false);
    expect(result.profile.rdwError).toMatch(/No vehicle data/);
    expect(result.profile.rdwRetrievedAt).toBeNull();
    // What the record already told us is still there.
    expect(result.profile.firstAdmissionDate).toBe("2020-01-01");
    expect(result.profile.fuelCategory).toBe("fossil");
  });

  it("leaves the catalogue value unknown when RDW has none", async () => {
    const vehicle = await createFixtureVehicle({ fuel: null });
    const { profile } = await refreshFromRdw(vehicle.id, FIXTURE_ACTOR, rdw({ kenteken: "FIXT2", europese_voertuigcategorie: "N1", voertuigsoort: "Bedrijfsauto" }, [{ brandstof_omschrijving: "Diesel" }]));
    expect(profile.catalogValue).toBeNull();
    expect(profile.catalogValueSource).toBe("unknown");
    expect(profile.europeanCategory).toBe("N1");
    expect(profile.fuelCategory).toBe("fossil");
  });
});
