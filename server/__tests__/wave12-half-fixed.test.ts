/**
 * Wave 12 — the items the phase-36 regression report lists as "half
 * gerepareerd": the bug got smaller, it did not go away.
 *
 *   BUG-127  the vehicle's odometer does not follow a corrected return reading
 *   BUG-125  `barcode` is still a free client field, and a squatted code still
 *            shadows another car's license plate at scan time
 *   BUG-096  an anonymous request still creates a `session` row
 *   BUG-194  empty template name, `fields: null`, negative label sizes
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq, sql, like } from "drizzle-orm";
import { db } from "../db";
import { vehicles, reservations, barcodeLabelTemplates, pdfTemplates } from "../../shared/schema";
import { makeApp, agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { buildDataHygieneReport, formatDataHygieneReport } from "../../scripts/data-hygiene-report";
import {
  cleanupFixtures,
  createFixtureVehicle,
  createFixtureReservation,
  createFixtureCustomer,
  FIXTURE_PLATE_PREFIX,
} from "./helpers/fixtures";

async function sessionCount(): Promise<number> {
  const r = await db.execute(sql`SELECT count(*)::int AS n FROM session`);
  return Number((r as any).rows[0].n);
}

describe("BUG-127 — the vehicle follows a corrected return reading", () => {
  let admin: TestAgent;
  let vehicleId: number;
  let customerId: number;
  let latest: number;
  let older: number;

  beforeAll(async () => {
    admin = await agentFor("admin");
    customerId = (await createFixtureCustomer("Km")).id;
    vehicleId = (await createFixtureVehicle({ currentMileage: 39300 })).id;
    older = (
      await createFixtureReservation({
        customerId, vehicleId, startDate: "2024-01-01", endDate: "2024-01-10", status: "completed",
      })
    ).id;
    latest = (
      await createFixtureReservation({
        customerId, vehicleId, startDate: "2026-01-01", endDate: "2026-01-10", status: "completed",
      })
    ).id;
    await db.update(reservations)
      .set({ pickupMileage: 10000, returnMileage: 10500, actualReturnDate: "2024-01-10" })
      .where(eq(reservations.id, older));
    await db.update(reservations)
      .set({ pickupMileage: 39100, returnMileage: 39300, actualReturnDate: "2026-01-10" })
      .where(eq(reservations.id, latest));
  }, 90_000);

  afterAll(async () => {
    await cleanupFixtures();
    await cleanupFixtureUsers();
  });

  const vehicleRow = async () => {
    const [row] = await db.select().from(vehicles).where(eq(vehicles.id, vehicleId));
    return row;
  };

  it("a higher corrected return reading reaches the vehicle", async () => {
    const res = await admin.patch(`/api/reservations/${latest}`).send({ returnMileage: 39800 });
    expect(res.status).toBe(200);
    expect((await vehicleRow()).currentMileage).toBe(39800);
  });

  it("a lower one is refused without the same authorization every other writer needs", async () => {
    const res = await admin.patch(`/api/reservations/${latest}`).send({ returnMileage: 39500 });
    expect(res.status).toBe(400);
    expect(res.body.requiresOverride).toBe(true);
    // And nothing moved.
    expect((await vehicleRow()).currentMileage).toBe(39800);
    const [row] = await db.select().from(reservations).where(eq(reservations.id, latest));
    expect(row.returnMileage).toBe(39800);
  });

  it("with the permission and the account password it goes through and is recorded", async () => {
    const authorized = await agentFor(["manage_reservations", "manage_documents", "authorize_mileage_decrease"]);
    const res = await authorized.patch(`/api/reservations/${latest}`).send({
      returnMileage: 39500,
      mileageOverridePassword: authorized.password,
    });
    expect(res.status).toBe(200);
    const vehicle = await vehicleRow();
    expect(vehicle.currentMileage).toBe(39500);
    expect(vehicle.mileageDecreasedBy).toBe(authorized.username);
    expect(vehicle.previousMileage).toBe(39800);
  });

  it("editing an older rental corrects that rental and leaves the vehicle alone", async () => {
    const before = (await vehicleRow()).currentMileage;
    const res = await admin.patch(`/api/reservations/${older}`).send({ returnMileage: 10600 });
    expect(res.status).toBe(200);
    const [row] = await db.select().from(reservations).where(eq(reservations.id, older));
    expect(row.returnMileage).toBe(10600);
    expect((await vehicleRow()).currentMileage).toBe(before);
  });

  it("a return reading below the pickup reading is still refused (first half of BUG-127)", async () => {
    const res = await admin.patch(`/api/reservations/${latest}`).send({ returnMileage: 100 });
    expect(res.status).toBe(400);
  });
});

describe("BUG-125 — the barcode is the server's, and a squatted one resolves to nobody", () => {
  let admin: TestAgent;

  beforeAll(async () => {
    admin = await agentFor("admin");
  }, 90_000);

  afterAll(async () => {
    await db.delete(vehicles).where(like(vehicles.licensePlate, `${FIXTURE_PLATE_PREFIX}%`));
    await cleanupFixtures();
    await cleanupFixtureUsers();
  });

  it("a barcode in a create body is dropped; the server assigns VEH-<id>", async () => {
    const plate = `${FIXTURE_PLATE_PREFIX}-B125A`;
    const res = await admin.post("/api/vehicles").send({
      licensePlate: plate,
      brand: "FIXT-Brand",
      model: "Model",
      barcode: "VEH-000001-R9",
    });
    expect(res.status).toBe(201);
    const [row] = await db.select().from(vehicles).where(eq(vehicles.id, res.body.id));
    expect(row.barcode).toBe(`VEH-${String(row.id).padStart(6, "0")}`);
  });

  it("a PATCH cannot move a barcode", async () => {
    const vehicle = await createFixtureVehicle();
    const [seeded] = await db.select().from(vehicles).where(eq(vehicles.id, vehicle.id));
    const before = seeded.barcode;
    const res = await admin.patch(`/api/vehicles/${vehicle.id}`).send({ barcode: "VEH-000042" });
    expect([200, 400]).toContain(res.status);
    const [after] = await db.select().from(vehicles).where(eq(vehicles.id, vehicle.id));
    expect(after.barcode).toBe(before);
  });

  it("a squatted barcode does not shadow the other car's license plate", async () => {
    const victim = await createFixtureVehicle();
    const squatter = await createFixtureVehicle();
    // A row written before the column became server-owned: the squatter holds
    // the victim's plate as its "barcode".
    await db.update(vehicles).set({ barcode: victim.licensePlate }).where(eq(vehicles.id, squatter.id));

    const res = await admin.get(`/api/barcodes/${encodeURIComponent(victim.licensePlate)}`);
    expect(res.status).toBe(200);
    expect(res.body.vehicle.id).toBe(victim.id);
    expect(res.body.vehicle.id).not.toBe(squatter.id);
  });

  it("a vehicle's own code still resolves", async () => {
    // Through the API, so the server assigns the barcode the way it does in
    // production (the fixture helper inserts straight into the table).
    const created = await admin.post("/api/vehicles").send({
      licensePlate: `${FIXTURE_PLATE_PREFIX}-B125C`,
      brand: "FIXT-Brand",
      model: "Model",
    });
    expect(created.status).toBe(201);
    const [row] = await db.select().from(vehicles).where(eq(vehicles.id, created.body.id));
    expect(row.barcode).toBe(`VEH-${String(row.id).padStart(6, "0")}`);

    const res = await admin.get(`/api/barcodes/${encodeURIComponent(row.barcode!)}`);
    expect(res.status).toBe(200);
    expect(res.body.vehicle.id).toBe(row.id);
  });
});

describe("BUG-096 — an anonymous visitor no longer gets a session row", () => {
  it("fifty requests without a cookie write nothing to the session table", async () => {
    const app = await makeApp();
    const before = await sessionCount();
    for (let i = 0; i < 50; i++) {
      await request(app).get("/api/user");
    }
    expect(await sessionCount()).toBe(before);
  }, 60_000);

  it("an anonymous mutating request is still answered 401, not a CSRF refusal", async () => {
    const app = await makeApp();
    const agent = request.agent(app);
    const seed = await agent.get("/api/user");
    const raw = (seed.headers["set-cookie"] as unknown as string[] | undefined) ?? [];
    const token = raw
      .map((c) => /(?:^|;\s*)XSRF-TOKEN=([^;]+)/.exec(c)?.[1])
      .find(Boolean);
    expect(token, "an anonymous visitor still receives a usable token").toBeTruthy();

    const res = await agent
      .post("/api/customers")
      .set("X-CSRF-Token", decodeURIComponent(token!))
      .send({ name: "FIXT-anon-probe" });
    expect(res.status).toBe(401);
    expect(res.body?.code).not.toBe("CSRF_MISSING");
    expect(res.body?.code).not.toBe("CSRF_INVALID");
  });

  it("a logged-in session still gets its own secret and its token is accepted", async () => {
    const admin = await agentFor("admin");
    const res = await admin.post("/api/customers").send({ name: "FIXT-csrf-authenticated" });
    expect(res.status).not.toBe(403);
    await cleanupFixtures();
    await cleanupFixtureUsers();
  });
});

describe("BUG-194 — the template endpoints refuse rubbish instead of storing it", () => {
  let admin: TestAgent;
  let labelId: number;
  let pdfId: number;

  beforeAll(async () => {
    admin = await agentFor("admin");
    const [label] = await db.insert(barcodeLabelTemplates).values({
      name: "FIXT-label", labelWidthMm: 62, labelHeightMm: 29, fields: [],
    }).returning();
    labelId = label.id;
    const [pdf] = await db.insert(pdfTemplates).values({ name: "FIXT-pdf", fields: [] }).returning();
    pdfId = pdf.id;
  }, 90_000);

  afterAll(async () => {
    await db.delete(barcodeLabelTemplates).where(like(barcodeLabelTemplates.name, "FIXT-%"));
    await db.delete(pdfTemplates).where(like(pdfTemplates.name, "FIXT-%"));
    await cleanupFixtureUsers();
  });

  const unchanged = async () => {
    const [row] = await db.select().from(barcodeLabelTemplates).where(eq(barcodeLabelTemplates.id, labelId));
    return row;
  };

  it("a negative or zero label size is refused", async () => {
    for (const body of [{ labelWidthMm: -5 }, { labelHeightMm: 0 }]) {
      const res = await admin.patch(`/api/barcode-label-templates/${labelId}`).send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    const row = await unchanged();
    expect(row.labelWidthMm).toBe(62);
    expect(row.labelHeightMm).toBe(29);
  });

  it("`fields: \"garbage\"` is refused on a label template", async () => {
    const res = await admin.patch(`/api/barcode-label-templates/${labelId}`).send({ fields: "garbage" });
    expect(res.status).toBe(400);
    expect((await unchanged()).fields).toEqual([]);
  });

  it("an empty name is refused on all three template families", async () => {
    expect((await admin.patch(`/api/barcode-label-templates/${labelId}`).send({ name: "" })).status).toBe(400);
    expect((await admin.patch(`/api/pdf-templates/${pdfId}`).send({ name: "  " })).status).toBe(400);
    expect((await admin.post("/api/transport-report-templates").send({ name: "" })).status).toBe(400);
    expect((await unchanged()).name).toBe("FIXT-label");
  });

  it("`fields: null` no longer empties a contract template", async () => {
    const res = await admin.patch(`/api/pdf-templates/${pdfId}`).send({ fields: null });
    expect(res.status).toBe(400);
    const [row] = await db.select().from(pdfTemplates).where(eq(pdfTemplates.id, pdfId));
    expect(row.fields).toEqual([]);
  });

  it("no response leaks the driver's own wording", async () => {
    const res = await admin.patch(`/api/barcode-label-templates/${labelId}`).send({ labelWidthMm: -5 });
    expect(JSON.stringify(res.body)).not.toContain("syntax for type");
  });
});

describe("BUG-143 / BUG-034 — the data-hygiene report counts, and writes nothing", () => {
  let orphanId: number;
  const GHOST_VEHICLE_ID = 2_000_000_001;

  beforeAll(async () => {
    const [row] = await db.insert(reservations).values({
      vehicleId: GHOST_VEHICLE_ID,
      customerId: null,
      startDate: "2024-03-01",
      endDate: "2024-03-05",
      status: "active",
      type: "maintenance_block",
    } as any).returning();
    orphanId = row.id;
  }, 60_000);

  afterAll(async () => {
    await db.delete(reservations).where(eq(reservations.id, orphanId));
  });

  it("counts an orphan maintenance block and names its type", async () => {
    const report = await buildDataHygieneReport();
    expect(report.orphanReservations).toBeGreaterThanOrEqual(1);
    const block = report.orphanReservationsByType.find((r) => r.type === "maintenance_block");
    expect(block?.count).toBeGreaterThanOrEqual(1);
  });

  it("reports a legacy status without touching it — that is B-21's job, on its own terms", async () => {
    const report = await buildDataHygieneReport();
    expect(report.legacyStatusReservations).toBeGreaterThanOrEqual(1);
    const [row] = await db.select().from(reservations).where(eq(reservations.id, orphanId));
    expect(row.status).toBe("active");
  });

  it("renders every line an owner has to decide on", () => {
    const lines = formatDataHygieneReport({
      orphanReservations: 258,
      orphanReservationsByType: [{ type: "maintenance_block", count: 258 }],
      vehicleForeignKeyPresent: false,
      blockedWithoutBlock: 8,
      blockedButAvailable: 0,
      stillOutReservations: 363,
      legacyStatusReservations: 263,
    });
    const text = lines.join("\n");
    expect(text).toContain("BUG-143");
    expect(text).toContain("258");
    expect(text).toContain("ABSENT");
    expect(text).toContain("BUG-034");
    expect(text).toContain("B-21");
    expect(text).toContain("this script does not write");
  });
});
