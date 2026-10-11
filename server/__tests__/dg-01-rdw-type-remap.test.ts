/**
 * D17 (besluiten D, spec §13): the RDW type re-map, checked and applied from the app.
 *
 * "Controleren" asks the RDW for every vehicle in the background and stores a
 * plan; "Toepassen" (admin only) applies exactly that plan, only where the type
 * still equals what the plan saw, in one transaction, with an audit line per
 * vehicle, and clears the plan. The RDW itself is mocked.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";

const rdwLookup = vi.hoisted(() => vi.fn());
vi.mock("../utils/rdw-api", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../utils/rdw-api");
  return { ...actual, fetchVehicleInfoByLicensePlate: rdwLookup };
});

import { db } from "../db";
import { appSettings, auditLogs, vehicles } from "../../shared/schema";
import { RDW_TYPE_REMAP_PLAN_KEY, type RdwTypeRemapPlan, type RdwTypeRemapStatus } from "../../shared/rdw-type-remap";
import { RDWNotFoundError, RDWTimeoutError } from "../utils/rdw-api";
import { isManagedSettingKey } from "../utils/security/redactAppSetting";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { cleanupFixtures, createFixtureVehicle } from "./helpers/fixtures";

let admin: TestAgent;
let manager: TestAgent; // MANAGE_VEHICLES but not role admin
let nobody: TestAgent;

/** What the mocked RDW answers per plate; every other plate (the rest of the fleet) is unknown to it. */
let rdwTypes: Record<string, string | Error>;

async function waitForJob(agent: TestAgent): Promise<RdwTypeRemapStatus> {
  for (let i = 0; i < 400; i += 1) {
    const res = await agent.get("/api/vehicles/rdw-type-remap/plan");
    if (res.status === 200 && res.body.job.status !== "running") return res.body as RdwTypeRemapStatus;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("the RDW check did not finish");
}

async function clearPlan() {
  await db.delete(appSettings).where(eq(appSettings.key, RDW_TYPE_REMAP_PLAN_KEY));
}

let plateCounter = 0;
/** Unique fixture plates (the FIXT prefix is what cleanupFixtures looks for). */
function plate(letter: string): string {
  plateCounter += 1;
  return `FIXTD17${letter}${String(plateCounter).padStart(4, "0")}`;
}

let saloon: { id: number; licensePlate: string };
let sameType: { id: number; licensePlate: string };
let unknown: { id: number; licensePlate: string };
let slow: { id: number; licensePlate: string };
let edited: { id: number; licensePlate: string };

beforeAll(async () => {
  process.env.RDW_TYPE_REMAP_PAUSE_MS = "0"; // the fixture database holds hundreds of vehicles
  admin = await agentFor("admin");
  manager = await agentFor(["manage_vehicles"]);
  nobody = await agentFor(["view_vehicles"]);
});

afterAll(async () => {
  delete process.env.RDW_TYPE_REMAP_PAUSE_MS;
  await clearPlan();
  await cleanupFixtures();
  await cleanupFixtureUsers();
});

beforeEach(async () => {
  await clearPlan();
  rdwLookup.mockReset();
  saloon = await createFixtureVehicle({ vehicleType: "SUV", licensePlate: plate("A") });
  sameType = await createFixtureVehicle({ vehicleType: "Van", licensePlate: plate("B") });
  unknown = await createFixtureVehicle({ vehicleType: "SUV", licensePlate: plate("C") });
  slow = await createFixtureVehicle({ vehicleType: "SUV", licensePlate: plate("D") });
  edited = await createFixtureVehicle({ vehicleType: "SUV", licensePlate: plate("E") });
  rdwTypes = {
    [saloon.licensePlate]: "Van",
    [sameType.licensePlate]: "Van",
    [slow.licensePlate]: new RDWTimeoutError(),
    [edited.licensePlate]: "Van",
  };
  rdwLookup.mockImplementation(async (plate: string) => {
    const answer = rdwTypes[plate];
    if (answer instanceof Error) throw answer;
    if (answer === undefined) throw new RDWNotFoundError(plate);
    return { vehicleType: answer };
  });
});

describe("D17 - Controleren maakt een plan", () => {
  it("stores {createdAt, rows, notFound, failed} and lists only the vehicles whose type would change", async () => {
    const start = await manager.post("/api/vehicles/rdw-type-remap/check").send({});
    expect(start.status).toBe(202);

    const status = await waitForJob(manager);
    expect(status.job.status).toBe("done");
    expect(status.job.checked).toBe(status.job.total);
    const plan = status.plan as RdwTypeRemapPlan;
    expect(typeof plan.createdAt).toBe("string");

    const byId = Object.fromEntries(plan.rows.map((row) => [row.id, row]));
    expect(byId[saloon.id]).toEqual({ id: saloon.id, plate: saloon.licensePlate, from: "SUV", to: "Van" });
    expect(byId[edited.id]).toBeTruthy();
    // Same type: not in the plan. Unknown to the RDW / failed lookup: kept, and named.
    expect(byId[sameType.id]).toBeUndefined();
    expect(byId[unknown.id]).toBeUndefined();
    expect(byId[slow.id]).toBeUndefined();
    expect(plan.notFound).toContain(unknown.licensePlate);
    expect(plan.failed).toContain(slow.licensePlate);
    expect(plan.failed).not.toContain(unknown.licensePlate);

    // It sits in app_settings, where a restart does not lose it.
    const [stored] = await db.select().from(appSettings).where(eq(appSettings.key, RDW_TYPE_REMAP_PLAN_KEY));
    expect((stored.value as RdwTypeRemapPlan).rows.some((row) => row.id === saloon.id)).toBe(true);

    // Checking changes nothing.
    const [row] = await db.select().from(vehicles).where(eq(vehicles.id, saloon.id));
    expect(row.vehicleType).toBe("SUV");
  });

  it("records who started a check (vehicle.type-remap-check), once per start", async () => {
    const mine = () => db.select().from(auditLogs)
      .where(and(eq(auditLogs.action, "vehicle.type-remap-check"), eq(auditLogs.username, manager.username)));
    const before = (await mine()).length;
    const start = await manager.post("/api/vehicles/rdw-type-remap/check").send({});
    expect(start.status).toBe(202);
    const rows = await mine();
    expect(rows).toHaveLength(before + 1);
    expect(rows[rows.length - 1]).toMatchObject({ resourceType: "vehicle", status: "success", userId: manager.userId });
    await waitForJob(manager);
  });

  it("refuses a second check while one is running, with a code", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    rdwLookup.mockImplementation(async () => { await gate; return { vehicleType: "Van" }; });

    const first = await manager.post("/api/vehicles/rdw-type-remap/check").send({});
    expect(first.status).toBe(202);
    const second = await manager.post("/api/vehicles/rdw-type-remap/check").send({});
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("REMAP_CHECK_RUNNING");

    const running = await manager.get("/api/vehicles/rdw-type-remap/plan");
    expect(running.body.job.status).toBe("running");

    release();
    const done = await waitForJob(manager);
    expect(done.job.status).toBe("done");
  });
});

describe("D17 - Toepassen past exact dat plan toe", () => {
  it("applies the rows whose type still equals 'from', skips the rest, audits each, clears the plan", async () => {
    await manager.post("/api/vehicles/rdw-type-remap/check").send({});
    await waitForJob(manager);

    // Between plan and apply somebody sets another type by hand: that row must be left alone.
    await db.update(vehicles).set({ vehicleType: "Coupe" }).where(eq(vehicles.id, edited.id));

    const res = await admin.post("/api/vehicles/rdw-type-remap/apply").send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ applied: 1, skipped: 1 });

    const [changed] = await db.select().from(vehicles).where(eq(vehicles.id, saloon.id));
    expect(changed.vehicleType).toBe("Van");
    const [untouched] = await db.select().from(vehicles).where(eq(vehicles.id, edited.id));
    expect(untouched.vehicleType).toBe("Coupe");
    const [unknownRow] = await db.select().from(vehicles).where(eq(vehicles.id, unknown.id));
    expect(unknownRow.vehicleType).toBe("SUV");

    const audit = await db.select().from(auditLogs)
      .where(and(eq(auditLogs.action, "vehicle.type-remap"), inArray(auditLogs.resourceId, [String(saloon.id), String(edited.id)])));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ resourceType: "vehicle", resourceId: String(saloon.id), username: admin.username, status: "success" });
    expect(audit[0].details).toMatchObject({ from: "SUV", to: "Van", plate: saloon.licensePlate });

    // The generic mutation audit does not also call this a "vehicle.create" (the route logs its own lines).
    await new Promise((resolve) => setTimeout(resolve, 150));
    const generic = await db.select().from(auditLogs)
      .where(and(eq(auditLogs.username, admin.username), eq(auditLogs.action, "vehicle.create")));
    expect(generic).toHaveLength(0);

    // The plan is gone.
    const after = await admin.get("/api/vehicles/rdw-type-remap/plan");
    expect(after.body.plan).toBeNull();
    const stored = await db.select().from(appSettings).where(eq(appSettings.key, RDW_TYPE_REMAP_PLAN_KEY));
    expect(stored).toHaveLength(0);
  });

  it("a vehicle without a stored type: applied while still empty (from null), skipped once it got a type", async () => {
    const empty = await createFixtureVehicle({ vehicleType: null, licensePlate: plate("F") });
    const filledMeanwhile = await createFixtureVehicle({ vehicleType: null, licensePlate: plate("G") });
    rdwTypes[empty.licensePlate] = "Van";
    rdwTypes[filledMeanwhile.licensePlate] = "Van";

    await manager.post("/api/vehicles/rdw-type-remap/check").send({});
    const status = await waitForJob(manager);
    const planned = status.plan!.rows.find((row) => row.id === empty.id);
    expect(planned).toEqual({ id: empty.id, plate: empty.licensePlate, from: null, to: "Van" });

    await db.update(vehicles).set({ vehicleType: "Coupe" }).where(eq(vehicles.id, filledMeanwhile.id));
    const res = await admin.post("/api/vehicles/rdw-type-remap/apply").send({});
    expect(res.status).toBe(200);

    const [applied] = await db.select().from(vehicles).where(eq(vehicles.id, empty.id));
    expect(applied.vehicleType).toBe("Van");
    const [skipped] = await db.select().from(vehicles).where(eq(vehicles.id, filledMeanwhile.id));
    expect(skipped.vehicleType).toBe("Coupe");
    const audit = await db.select().from(auditLogs)
      .where(and(eq(auditLogs.action, "vehicle.type-remap"), eq(auditLogs.resourceId, String(empty.id))));
    expect(audit).toHaveLength(1);
    expect(audit[0].details).toMatchObject({ from: null, to: "Van" });
  });

  it("a second apply does nothing: the plan is gone (409 REMAP_PLAN_MISSING)", async () => {
    await manager.post("/api/vehicles/rdw-type-remap/check").send({});
    await waitForJob(manager);
    const first = await admin.post("/api/vehicles/rdw-type-remap/apply").send({});
    expect(first.status).toBe(200);

    // Put the type back by hand; a second apply must not push it to Van again.
    await db.update(vehicles).set({ vehicleType: "SUV" }).where(eq(vehicles.id, saloon.id));
    const second = await admin.post("/api/vehicles/rdw-type-remap/apply").send({});
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("REMAP_PLAN_MISSING");
    const [row] = await db.select().from(vehicles).where(eq(vehicles.id, saloon.id));
    expect(row.vehicleType).toBe("SUV");
  });

  it("is refused while a check is still running", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    rdwLookup.mockImplementation(async () => { await gate; return { vehicleType: "Van" }; });
    await manager.post("/api/vehicles/rdw-type-remap/check").send({});
    const res = await admin.post("/api/vehicles/rdw-type-remap/apply").send({});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("REMAP_CHECK_RUNNING");
    release();
    await waitForJob(manager);
  });
});

describe("D17 - rechten", () => {
  it("check and plan need MANAGE_VEHICLES", async () => {
    expect((await nobody.post("/api/vehicles/rdw-type-remap/check").send({})).status).toBe(403);
    expect((await nobody.get("/api/vehicles/rdw-type-remap/plan")).status).toBe(403);
    expect((await manager.get("/api/vehicles/rdw-type-remap/plan")).status).toBe(200);
  });

  it("apply is for the role admin only, not for a manager with MANAGE_VEHICLES", async () => {
    await manager.post("/api/vehicles/rdw-type-remap/check").send({});
    await waitForJob(manager);
    const res = await manager.post("/api/vehicles/rdw-type-remap/apply").send({});
    expect(res.status).toBe(403);
    expect((await nobody.post("/api/vehicles/rdw-type-remap/apply").send({})).status).toBe(403);
    // Nothing happened.
    const [row] = await db.select().from(vehicles).where(eq(vehicles.id, saloon.id));
    expect(row.vehicleType).toBe("SUV");
  });

  it("the plan key is a managed setting (route-level 403s: dg-02-remap-plan-visibility.test.ts)", () => {
    expect(isManagedSettingKey(RDW_TYPE_REMAP_PLAN_KEY)).toBe(true);
  });
});
