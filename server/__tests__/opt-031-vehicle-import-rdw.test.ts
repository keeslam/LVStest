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
import { RDWNotFoundError, RDWTimeoutError } from "../utils/rdw-api";
import { MAX_IMPORT_BATCH } from "../services/vehicle-import";
import { countSql, statementsOfKind } from "./helpers/sqlCounter";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { cleanupFixtures, FIXTURE_PLATE_PREFIX } from "./helpers/fixtures";

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

  it("one failing row does not fail the import", async () => {
    rdwLookup.mockReset();
    const good = nextPlate();
    const missing = nextPlate();
    const slow = nextPlate();
    rdwLookup.mockImplementation(async (plate: string) => {
      if (plate === missing) throw new RDWNotFoundError(plate);
      if (plate === slow) throw new RDWTimeoutError();
      return rdwAnswer();
    });

    const res = await admin.post("/api/vehicles/bulk-import-plates")
      .send({ licensePlates: [good, missing, slow] });

    expect(res.status).toBe(200);
    // All three vehicles exist — an RDW outage costs data, never the import.
    expect(res.body.imported).toHaveLength(3);
    expect(res.body.failed).toHaveLength(0);

    const byPlate = Object.fromEntries(res.body.imported.map((row: any) => [row.licensePlate, row]));
    expect(byPlate[good].enriched).toBe(true);
    expect(byPlate[missing].enriched).toBe(false);
    expect(byPlate[missing].enrichmentReason).toBe("not_found");
    expect(byPlate[slow].enrichmentReason).toBe("timeout");

    const [row] = await db.select().from(vehicles).where(eq(vehicles.licensePlate, missing.toUpperCase()));
    expect(row).toBeTruthy();
    expect(row.brand).toBe("Unknown");
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

  it("a CSV row whose lookup fails is still imported", async () => {
    rdwLookup.mockReset();
    rdwLookup.mockRejectedValue(new RDWTimeoutError());
    const plate = nextPlate();

    const res = await admin.post("/api/vehicles/bulk-import-csv").send({
      vehicles: [{ licensePlate: plate, brand: "DAF", model: "LF" }],
    });

    expect(res.status).toBe(200);
    expect(res.body.imported).toHaveLength(1);
    expect(res.body.imported[0].rdwVerified).toBe(false);
    const [stored] = await db.select().from(vehicles).where(eq(vehicles.licensePlate, plate.toUpperCase()));
    expect(stored.brand).toBe("DAF");
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
