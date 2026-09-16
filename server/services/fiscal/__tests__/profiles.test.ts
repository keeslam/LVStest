/**
 * The vehicle fiscal profile: what the vehicle record already tells us, what
 * a person corrected, and the provenance of each.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../../../db";
import { fiscalAuditEvents } from "../../../../shared/schema";
import { and, eq } from "drizzle-orm";
import { ensureProfile, applyManualOverride, getProfile } from "../profiles";
import { FiscalValidationError } from "../rule-versions";
import { createFixtureVehicle, cleanupFixtures } from "../../../__tests__/helpers/fixtures";
import { cleanupFiscalFixtures, FIXTURE_ACTOR } from "../../../__tests__/helpers/fiscal";

beforeAll(async () => {
  await cleanupFixtures();
  await cleanupFiscalFixtures();
});
afterAll(async () => {
  await cleanupFixtures();
  await cleanupFiscalFixtures();
});

describe("voertuigprofiel", () => {
  it("derives first admission and fuel category from the vehicle record, marked as such", async () => {
    const vehicle = await createFixtureVehicle({ fuel: "Diesel", productionDate: "2023-04-12" });
    const profile = await ensureProfile(vehicle.id);
    expect(profile.firstAdmissionDate).toBe("2023-04-12");
    expect(profile.firstAdmissionSource).toBe("vehicle_record");
    expect(profile.fuelCategory).toBe("fossil");
    expect(profile.europeanCategory).toBeNull();
    expect(profile.catalogValueSource).toBe("unknown");
  });

  it("maps the record's fuel words to a category, unknown when it cannot", async () => {
    const hybrid = await ensureProfile((await createFixtureVehicle({ fuel: "Hybrid" })).id);
    expect(hybrid.fuelCategory).toBe("hybrid");
    const electric = await ensureProfile((await createFixtureVehicle({ fuel: "Electric" })).id);
    expect(electric.fuelCategory).toBe("zero_emission");
    const blank = await ensureProfile((await createFixtureVehicle({ fuel: null })).id);
    expect(blank.fuelCategory).toBe("unknown");
    const nonsense = await ensureProfile((await createFixtureVehicle({ productionDate: "not a date" })).id);
    expect(nonsense.firstAdmissionDate).toBeNull();
    expect(nonsense.firstAdmissionSource).toBe("unknown");
  });

  it("is idempotent", async () => {
    const vehicle = await createFixtureVehicle({ fuel: "Gasoline" });
    const a = await ensureProfile(vehicle.id);
    const b = await ensureProfile(vehicle.id);
    expect(b.id).toBe(a.id);
  });

  it("records a manual value with reason, source and an audit event holding old and new", async () => {
    const vehicle = await createFixtureVehicle({ fuel: "Gasoline" });
    await ensureProfile(vehicle.id);
    const profile = await applyManualOverride(vehicle.id, { field: "catalogValue", value: "36000.00", reason: "factuur importeur" }, FIXTURE_ACTOR);
    expect(profile.catalogValue).toBe("36000.00");
    expect(profile.catalogValueSource).toBe("manual");
    expect(profile.catalogValueVerifiedByName).toBe(FIXTURE_ACTOR.username);
    expect(profile.manualOverride?.catalogValue).toMatchObject({ value: "36000.00", byName: FIXTURE_ACTOR.username, reason: "factuur importeur" });

    const again = await applyManualOverride(vehicle.id, { field: "catalogValue", value: "37000", reason: "correctie" }, FIXTURE_ACTOR);
    expect(again.catalogValue).toBe("37000.00");
    const events = await db.select().from(fiscalAuditEvents).where(and(eq(fiscalAuditEvents.vehicleId, vehicle.id), eq(fiscalAuditEvents.action, "profile_overridden"))).orderBy(fiscalAuditEvents.id);
    expect(events.map((e) => [e.parameterKey, e.oldValue, e.newValue])).toEqual([["catalogValue", null, "36000.00"], ["catalogValue", "36000.00", "37000.00"]]);
    expect(events[1].reasonText).toBe("correctie");
  });

  it("a manual value survives a later derivation from the record", async () => {
    const vehicle = await createFixtureVehicle({ fuel: "Gasoline", productionDate: "2020-01-01" });
    await ensureProfile(vehicle.id);
    await applyManualOverride(vehicle.id, { field: "europeanCategory", value: "M1", reason: "kentekenbewijs" }, FIXTURE_ACTOR);
    await applyManualOverride(vehicle.id, { field: "fuelCategory", value: "hybrid", reason: "plug-in volgens kentekenbewijs" }, FIXTURE_ACTOR);
    const profile = await ensureProfile(vehicle.id);
    expect(profile.europeanCategory).toBe("M1");
    expect(profile.fuelCategory).toBe("hybrid");
  });

  it("refuses nonsense and unknown fields", async () => {
    const vehicle = await createFixtureVehicle({ fuel: "Gasoline" });
    await ensureProfile(vehicle.id);
    await expect(applyManualOverride(vehicle.id, { field: "catalogValue", value: "-5", reason: "x" }, FIXTURE_ACTOR)).rejects.toBeInstanceOf(FiscalValidationError);
    await expect(applyManualOverride(vehicle.id, { field: "firstAdmissionDate", value: "2027-02-30", reason: "x" }, FIXTURE_ACTOR)).rejects.toBeInstanceOf(FiscalValidationError);
    await expect(applyManualOverride(vehicle.id, { field: "europeanCategory", value: "Z9", reason: "x" }, FIXTURE_ACTOR)).rejects.toBeInstanceOf(FiscalValidationError);
    await expect(applyManualOverride(vehicle.id, { field: "catalogValue", value: "1000", reason: "" }, FIXTURE_ACTOR)).rejects.toBeInstanceOf(FiscalValidationError);
    await expect(applyManualOverride(vehicle.id, { field: "brand" as any, value: "x", reason: "x" }, FIXTURE_ACTOR)).rejects.toBeInstanceOf(FiscalValidationError);
    expect((await getProfile(vehicle.id))?.catalogValue).toBeNull();
  });
});
