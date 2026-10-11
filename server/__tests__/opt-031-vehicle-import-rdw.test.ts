/**
 * OPT-031 — "RDW-verrijking bij voertuigimport + echte voortgang".
 *
 * The Dutch import screen promises that vehicle data is fetched from the RDW
 * automatically. The handler never called the client that already exists and
 * wrote `brand: "Unknown"`, `model: "Unknown"`. It also called
 * `getAllVehicles()` once per row, and had no bound on a batch.
 *
 * The RDW itself is stubbed: the tests must not depend on opendata.rdw.nl
 * being up, or on any real plate's data.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { eq, like } from "drizzle-orm";

const rdwLookup = vi.hoisted(() => vi.fn());
vi.mock("../utils/rdw-api", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../utils/rdw-api");
  return { ...actual, fetchVehicleInfoByLicensePlate: rdwLookup };
});

import { db } from "../db";
import { vehicles } from "../../shared/schema";
import { RDWNotFoundError, RDWTimeoutError, RDWUpstreamError } from "../utils/rdw-api";
import { MAX_IMPORT_BATCH } from "../services/vehicle-import";
import { countSql, statementsOfKind } from "./helpers/sqlCounter";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { cleanupFixtures, FIXTURE_PLATE_PREFIX } from "./helpers/fixtures";
import { storage } from "../storage";

let admin: TestAgent;
let plateCounter = 0;

/** Fixture plates, so `cleanupFixtures()` finds them. */
function nextPlate(): string {
  plateCounter += 1;
  return `${FIXTURE_PLATE_PREFIX}O31${String(plateCounter).padStart(4, "0")}`;
}

function rdwAnswer(overrides: Record<string, unknown> = {}) {
  return {
    brand: "Volkswagen",
    model: "Crafter",
    vehicleType: "Van",
    fuel: "Diesel",
    apkDate: "2027-05-01",
    productionDate: "2020-03-11",
    ...overrides,
  };
}

beforeAll(async () => {
  admin = await agentFor("admin");
});

afterAll(async () => {
  await db.delete(vehicles).where(like(vehicles.licensePlate, `${FIXTURE_PLATE_PREFIX}%`));
  await cleanupFixtures();
  await cleanupFixtureUsers();
});

describe("OPT-031 — de kentekenimport haalt de gegevens echt op", () => {
  it("fills brand and model from the RDW instead of writing Unknown", async () => {
    rdwLookup.mockReset();
    rdwLookup.mockResolvedValue(rdwAnswer());
    const plate = nextPlate();

    const res = await admin.post("/api/vehicles/bulk-import-plates").send({ licensePlates: [plate] });

    expect(res.status).toBe(200);
    expect(res.body.imported).toHaveLength(1);
    expect(res.body.imported[0].enriched).toBe(true);
    expect(res.body.imported[0].enrichedFields).toContain("brand");

    const [row] = await db.select().from(vehicles).where(eq(vehicles.licensePlate, plate.toUpperCase()));
    expect(row.brand).toBe("Volkswagen");
    expect(row.model).toBe("Crafter");
    expect(row.apkDate).toBe("2027-05-01");
    // The employee's own plate wins: a lookup must not rename the car.
    expect(row.licensePlate).toBe(plate.toUpperCase());
  });

  it("D2: a plate the RDW does not know is skipped with a warning, not created", async () => {
    rdwLookup.mockReset();
    const good = nextPlate();
    const missing = nextPlate();
    rdwLookup.mockImplementation(async (plate: string) => {
      if (plate === missing) throw new RDWNotFoundError(plate);
      return rdwAnswer();
    });

    const res = await admin.post("/api/vehicles/bulk-import-plates")
      .send({ licensePlates: [good, missing] });

    expect(res.status).toBe(200);
    expect(res.body.imported).toHaveLength(1);
    expect(res.body.imported[0].licensePlate).toBe(good);
    expect(res.body.failed).toHaveLength(0);
    expect(res.body.warnings).toHaveLength(1);
    expect(res.body.warnings[0]).toMatchObject({ licensePlate: missing, code: "RDW_NOT_FOUND_SKIPPED" });
    expect(res.body.warnings[0].vehicle).toBeUndefined();
    expect(res.body.maxBatch).toBe(MAX_IMPORT_BATCH);

    const rows = await db.select().from(vehicles).where(eq(vehicles.licensePlate, missing.toUpperCase()));
    expect(rows).toHaveLength(0);
  });

  it("D2: with createUnknown the unknown plate is created as Unknown/Unknown and counts as a warning", async () => {
    rdwLookup.mockReset();
    const missing = nextPlate();
    rdwLookup.mockRejectedValue(new RDWNotFoundError(missing));

    const res = await admin.post("/api/vehicles/bulk-import-plates")
      .send({ licensePlates: [missing], createUnknown: true });

    expect(res.status).toBe(200);
    expect(res.body.imported).toHaveLength(0);
    expect(res.body.warnings).toHaveLength(1);
    expect(res.body.warnings[0]).toMatchObject({ licensePlate: missing, code: "RDW_NOT_FOUND_CREATED" });
    expect(res.body.warnings[0].vehicle).toBeTruthy();

    const [row] = await db.select().from(vehicles).where(eq(vehicles.licensePlate, missing.toUpperCase()));
    expect(row).toBeTruthy();
    expect(row.brand).toBe("Unknown");
    expect(row.model).toBe("Unknown");
  });

  it("D2/OPT-031: an RDW outage still creates the vehicle, with a warning of its own (never 'not found')", async () => {
    rdwLookup.mockReset();
    const slow = nextPlate();
    const broken = nextPlate();
    rdwLookup.mockImplementation(async (plate: string) => {
      if (plate === slow) throw new RDWTimeoutError();
      throw new RDWUpstreamError(503, "down");
    });

    // createUnknown stays off: an outage creates the row regardless.
    const res = await admin.post("/api/vehicles/bulk-import-plates")
      .send({ licensePlates: [slow, broken] });

    expect(res.status).toBe(200);
    expect(res.body.imported).toHaveLength(0);
    expect(res.body.failed).toHaveLength(0);
    expect(res.body.warnings).toHaveLength(2);
    const byPlate = Object.fromEntries(res.body.warnings.map((row: any) => [row.licensePlate, row]));
    expect(byPlate[slow].code).toBe("RDW_UNAVAILABLE_CREATED");
    expect(byPlate[slow].enrichmentReason).toBe("timeout");
    expect(byPlate[broken].code).toBe("RDW_UNAVAILABLE_CREATED");
    expect(byPlate[broken].enrichmentReason).toBe("upstream");
    expect(byPlate[slow].vehicle).toBeTruthy();

    const rows = await db.select().from(vehicles).where(eq(vehicles.licensePlate, slow.toUpperCase()));
    expect(rows).toHaveLength(1);
  });

  it("D2: only a real boolean true switches createUnknown on", async () => {
    rdwLookup.mockReset();
    const plate = nextPlate();
    rdwLookup.mockRejectedValue(new RDWNotFoundError(plate));

    const res = await admin.post("/api/vehicles/bulk-import-plates")
      .send({ licensePlates: [plate], createUnknown: "true" });

    expect(res.body.warnings).toHaveLength(1);
    expect(res.body.warnings[0].code).toBe("RDW_NOT_FOUND_SKIPPED");
  });

  it("loads the fleet once for the whole batch, not once per row", async () => {
    rdwLookup.mockReset();
    rdwLookup.mockResolvedValue(rdwAnswer());
    const plates = [nextPlate(), nextPlate(), nextPlate(), nextPlate()];

    const { statements } = await countSql(async () => {
      const res = await admin.post("/api/vehicles/bulk-import-plates").send({ licensePlates: plates });
      expect(res.status).toBe(200);
      expect(res.body.imported).toHaveLength(4);
    });

    // The whole-fleet read is `select ... from "vehicles"` with no where clause;
    // there must be exactly one of them however many rows the batch has.
    const fleetReads = statementsOfKind(statements, "select")
      .filter((sql) => /from "vehicles"/i.test(sql) && !/where/i.test(sql));
    expect(fleetReads).toHaveLength(1);
  });

  it("refuses a batch bigger than the bound, with a message that names it", async () => {
    rdwLookup.mockReset();
    rdwLookup.mockResolvedValue(rdwAnswer());
    const tooMany = Array.from({ length: MAX_IMPORT_BATCH + 1 }, (_, i) => `${FIXTURE_PLATE_PREFIX}BIG${i}`);

    const res = await admin.post("/api/vehicles/bulk-import-plates").send({ licensePlates: tooMany });

    expect(res.status).toBe(400);
    expect(res.body.maxBatch).toBe(MAX_IMPORT_BATCH);
    expect(res.body.received).toBe(MAX_IMPORT_BATCH + 1);
    // Nothing was created.
    expect(rdwLookup).not.toHaveBeenCalled();
  });

  it("still refuses a blank plate and a plate that already exists", async () => {
    rdwLookup.mockReset();
    rdwLookup.mockResolvedValue(rdwAnswer());
    const plate = nextPlate();
    await admin.post("/api/vehicles/bulk-import-plates").send({ licensePlates: [plate] });

    const res = await admin.post("/api/vehicles/bulk-import-plates")
      .send({ licensePlates: ["", plate] });
    expect(res.body.failed).toHaveLength(2);
    expect(res.body.failed[1].error).toContain("already exists");
    // P10: the client words these by code.
    expect(res.body.failed[0].code).toBe("LICENSE_PLATE_REQUIRED");
    expect(res.body.failed[1].code).toBe("VEHICLE_ALREADY_EXISTS");
  });
});

describe("OPT-031 — de CSV-import wordt tegen de RDW gecontroleerd", () => {
  it("keeps the sheet's own value and reports the difference", async () => {
    rdwLookup.mockReset();
    rdwLookup.mockResolvedValue(rdwAnswer({ brand: "Volkswagen" }));
    const plate = nextPlate();

    const res = await admin.post("/api/vehicles/bulk-import-csv").send({
      vehicles: [{ licensePlate: plate, brand: "Volkwagen", model: "Crafter" }],
    });

    expect(res.status).toBe(200);
    const row = res.body.imported[0];
    expect(row.rdwVerified).toBe(true);
    expect(row.differences).toEqual([
      expect.objectContaining({ field: "brand", sheet: "Volkwagen", rdw: "Volkswagen" }),
    ]);
    // The typo is kept, not silently overwritten — it is reported so a human
    // decides.
    const [stored] = await db.select().from(vehicles).where(eq(vehicles.licensePlate, plate.toUpperCase()));
    expect(stored.brand).toBe("Volkwagen");
  });

  it("fills in the fields the sheet left empty", async () => {
    rdwLookup.mockReset();
    rdwLookup.mockResolvedValue(rdwAnswer());
    const plate = nextPlate();

    const res = await admin.post("/api/vehicles/bulk-import-csv").send({
      vehicles: [{ licensePlate: plate, brand: "Volkswagen", model: "Crafter" }],
    });

    expect(res.status).toBe(200);
    const [stored] = await db.select().from(vehicles).where(eq(vehicles.licensePlate, plate.toUpperCase()));
    // Not in the sheet, so the RDW answer stands.
    expect(stored.apkDate).toBe("2027-05-01");
    expect(stored.fuel).toBe("Diesel");
  });

  it("a CSV row whose lookup fails is still created, as an RDW_UNAVAILABLE_CREATED warning", async () => {
    rdwLookup.mockReset();
    rdwLookup.mockRejectedValue(new RDWTimeoutError());
    const plate = nextPlate();

    const res = await admin.post("/api/vehicles/bulk-import-csv").send({
      vehicles: [{ licensePlate: plate, brand: "DAF", model: "LF" }],
    });

    expect(res.status).toBe(200);
    expect(res.body.imported).toHaveLength(0);
    expect(res.body.warnings).toHaveLength(1);
    expect(res.body.warnings[0]).toMatchObject({ licensePlate: plate, code: "RDW_UNAVAILABLE_CREATED", rdwVerified: false });
    const [stored] = await db.select().from(vehicles).where(eq(vehicles.licensePlate, plate.toUpperCase()));
    expect(stored.brand).toBe("DAF");
  });

  it("D2: a CSV plate the RDW does not know is skipped unless createUnknown is on", async () => {
    rdwLookup.mockReset();
    const skipped = nextPlate();
    const created = nextPlate();
    rdwLookup.mockImplementation(async (plate: string) => { throw new RDWNotFoundError(plate); });

    const off = await admin.post("/api/vehicles/bulk-import-csv").send({
      vehicles: [{ licensePlate: skipped, brand: "DAF", model: "LF" }],
    });
    expect(off.status).toBe(200);
    expect(off.body.imported).toHaveLength(0);
    expect(off.body.warnings).toHaveLength(1);
    expect(off.body.warnings[0]).toMatchObject({ licensePlate: skipped, code: "RDW_NOT_FOUND_SKIPPED" });
    expect(off.body.warnings[0].vehicle).toBeUndefined();
    expect(await db.select().from(vehicles).where(eq(vehicles.licensePlate, skipped.toUpperCase()))).toHaveLength(0);

    const on = await admin.post("/api/vehicles/bulk-import-csv").send({
      vehicles: [{ licensePlate: created, brand: "DAF", model: "LF" }],
      createUnknown: true,
    });
    expect(on.status).toBe(200);
    expect(on.body.imported).toHaveLength(0);
    expect(on.body.warnings[0]).toMatchObject({ licensePlate: created, code: "RDW_NOT_FOUND_CREATED" });
    expect(on.body.warnings[0].vehicle).toBeTruthy();
    // The sheet's own values are what the vehicle gets.
    const [stored] = await db.select().from(vehicles).where(eq(vehicles.licensePlate, created.toUpperCase()));
    expect(stored.brand).toBe("DAF");
    expect(stored.model).toBe("LF");
  });

  it("still refuses an unreadable date per row (BUG-124 stays fixed)", async () => {
    rdwLookup.mockReset();
    rdwLookup.mockResolvedValue(rdwAnswer());
    const good = nextPlate();
    const bad = nextPlate();

    const res = await admin.post("/api/vehicles/bulk-import-csv").send({
      vehicles: [
        { licensePlate: good, brand: "DAF", model: "LF", apkDate: "09-03-2026" },
        { licensePlate: bad, brand: "DAF", model: "LF", apkDate: "geen idee" },
      ],
    });

    expect(res.body.imported).toHaveLength(1);
    expect(res.body.failed).toHaveLength(1);
    expect(res.body.failed[0].error).toContain("apkDate");
    // P10: the client words the row by code and names the field.
    expect(res.body.failed[0].code).toBe("INVALID_DATE");
    expect(res.body.failed[0].field).toBe("apkDate");
  });

  it("a row that throws is IMPORT_ROW_FAILED without the exception text (plates and CSV)", async () => {
    rdwLookup.mockReset();
    rdwLookup.mockResolvedValue(rdwAnswer());
    const spy = vi.spyOn(storage, "createVehicle").mockRejectedValue(new Error("SECRET-DB-DETAIL insert into vehicles"));
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const plates = await admin.post("/api/vehicles/bulk-import-plates").send({ licensePlates: [nextPlate()] });
      expect(plates.status).toBe(200);
      expect(plates.body.failed).toHaveLength(1);
      expect(plates.body.failed[0].code).toBe("IMPORT_ROW_FAILED");
      expect(JSON.stringify(plates.body)).not.toContain("SECRET-DB-DETAIL");

      const csv = await admin.post("/api/vehicles/bulk-import-csv").send({
        vehicles: [{ licensePlate: nextPlate(), brand: "DAF", model: "LF" }],
      });
      expect(csv.status).toBe(200);
      expect(csv.body.failed).toHaveLength(1);
      expect(csv.body.failed[0].code).toBe("IMPORT_ROW_FAILED");
      expect(JSON.stringify(csv.body)).not.toContain("SECRET-DB-DETAIL");
    } finally {
      spy.mockRestore();
      quiet.mockRestore();
    }
  });

  it("the CSV import has the same batch bound", async () => {
    const tooMany = Array.from({ length: MAX_IMPORT_BATCH + 1 }, (_, i) => ({
      licensePlate: `${FIXTURE_PLATE_PREFIX}CSVBIG${i}`,
    }));
    const res = await admin.post("/api/vehicles/bulk-import-csv").send({ vehicles: tooMany });
    expect(res.status).toBe(400);
    expect(res.body.maxBatch).toBe(MAX_IMPORT_BATCH);
  });
});
