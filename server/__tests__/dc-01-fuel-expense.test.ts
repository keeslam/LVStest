/**
 * Sub-project D, package DC item 1 (besluit B-41 D1, approval B-42; spec
 * docs/superpowers/specs/2026-10-11-besluiten-d-design.md §1): a fuel amount
 * entered at "Brandstofstatus bijwerken" also becomes an expense (category
 * `fuel`) on that vehicle.
 *
 *  - `cost` is validated on the server: a positive number of at most 1,000,000,
 *    otherwise 400 `FUEL_COST_INVALID` and nothing changes (no vehicle write, no
 *    file left behind);
 *  - the vehicle update and the expense are written in ONE transaction; the fuel
 *    receipt is the expense's receipt (same stored path as `fuelRefillReceipt`);
 *  - a second request with the same level, amount and day within two minutes
 *    (double click, retried upload) does not book a second expense (lookup on
 *    `expenses.source_ref`); a deliberate second refill later does;
 *  - the route stays `manage_vehicles`: booking the expense needs no
 *    "Kosten beheren";
 *  - the route writes its own `expense.create` audit row;
 *  - a failing expense insert answers 500 `FUEL_EXPENSE_FAILED`, rolls the vehicle
 *    update back and removes the uploaded file;
 *  - `source` / `source_ref` are server-set: a request body cannot choose them.
 *
 * Runs with UPLOADS_DIR on a temp directory so "no file left behind" is a
 * statement about a directory this test owns.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { and, eq, inArray } from "drizzle-orm";

import {
  useTempUploadsDir,
  removeTempUploadsDir,
  listFilesRecursive,
  tinyPdf,
} from "./helpers/uploads";

// MUST run before anything builds the app (multer destinations are resolved once).
const TEMP_UPLOADS = useTempUploadsDir("lvs-dc01-");

const { db } = await import("../db");
const { expenses, vehicles, auditLogs, deletedRecords } = await import("../../shared/schema");
const { storage } = await import("../storage");
const { isoToday } = await import("../services/lifecycle");
const { agentFor, cleanupFixtureUsers } = await import("./helpers/app");
const { createFixtureVehicle, cleanupFixtures } = await import("./helpers/fixtures");

type Agent = Awaited<ReturnType<typeof agentFor>>;

let admin: Agent;
let vehiclesOnly: Agent;
const auditIds: number[] = [];

beforeAll(async () => {
  admin = await agentFor("admin");
  // The point of the approved proposal: no manage_expenses here.
  vehiclesOnly = await agentFor(["manage_vehicles", "view_vehicles"]);
}, 60_000);

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  if (auditIds.length) await db.delete(auditLogs).where(inArray(auditLogs.id, auditIds));
  await cleanupFixtures();
  await cleanupFixtureUsers();
  removeTempUploadsDir(TEMP_UPLOADS);
});

const vehicleRow = async (id: number) => (await db.select().from(vehicles).where(eq(vehicles.id, id)))[0];
const expensesOf = (vehicleId: number) => db.select().from(expenses).where(eq(expenses.vehicleId, vehicleId));

function fuelRequest(
  agent: Agent,
  vehicleId: number,
  fields: Record<string, string>,
  file?: { bytes: Buffer; name: string; type: string },
) {
  let req = agent.patch(`/api/vehicles/${vehicleId}/fuel-status`);
  for (const [key, value] of Object.entries(fields)) req = req.field(key, value);
  if (file) req = req.attach("receipt", file.bytes, { filename: file.name, contentType: file.type });
  return req;
}

const receipt = (marker: string) => ({ bytes: tinyPdf(marker), name: "tankbon.pdf", type: "application/pdf" });

async function auditRowsFor(expenseId: number) {
  const rows = await db.select().from(auditLogs)
    .where(and(eq(auditLogs.action, "expense.create"), eq(auditLogs.resourceId, String(expenseId))));
  auditIds.push(...rows.map((r) => r.id));
  return rows;
}

describe("D1 - a fuel amount becomes a fuel expense", () => {
  it("books one fuel expense that shares the receipt with the vehicle, and audits it", async () => {
    const vehicle = await createFixtureVehicle();

    const res = await fuelRequest(admin, vehicle.id, { fuelLevel: "3/4", cost: "45.50", notes: "Shell" }, receipt("FIXT-dc01-a"));
    expect(res.status).toBe(200);
    // The answer is still the vehicle row.
    expect(res.body.id).toBe(vehicle.id);
    expect(res.body.currentFuelLevel).toBe("3/4");
    // ...plus what was booked, so the dialog can name the amount.
    expect(res.body.fuelExpense).toMatchObject({ amount: 45.5 });

    const car = await vehicleRow(vehicle.id);
    expect(Number(car.fuelRefillCost)).toBe(45.5);
    expect(car.fuelRefillReceipt).toMatch(/^uploads\/[A-Za-z0-9]+\/fuel_receipt\/.+\.pdf$/);

    const booked = await expensesOf(vehicle.id);
    expect(booked).toHaveLength(1);
    const [expense] = booked;
    expect(expense.category).toBe("fuel");
    expect(Number(expense.amount)).toBe(45.5);
    expect(expense.date).toBe(isoToday());
    expect(expense.description).toMatch(/^Tankbeurt 3\/4 /);
    expect(expense.createdBy).toBeTruthy();
    expect(expense.source).toBe("fuel_refill");
    expect(expense.sourceRef).toMatch(new RegExp(`^vehicle:${vehicle.id}:`));
    // One receipt, two owners: the same stored path, and the file is there.
    expect(expense.receiptFilePath).toBe(car.fuelRefillReceipt);
    expect(fs.existsSync(path.join(TEMP_UPLOADS, car.fuelRefillReceipt!.replace(/^uploads\//, "")))).toBe(true);

    // The route logs the expense itself (the middleware only sees vehicle.fuel-status).
    const audit = await auditRowsFor(expense.id);
    expect(audit).toHaveLength(1);
    expect(audit[0].resourceType).toBe("expense");
    expect(audit[0].details).toMatchObject({ source: "fuel_refill", vehicleId: vehicle.id, amount: 45.5 });
  });

  it("books nothing when no amount is entered", async () => {
    const vehicle = await createFixtureVehicle();
    const res = await fuelRequest(admin, vehicle.id, { fuelLevel: "Full" });
    expect(res.status).toBe(200);
    expect(await expensesOf(vehicle.id)).toHaveLength(0);
    // An empty string is "no amount" too (the dialog sends no field, other clients may send "").
    const blank = await fuelRequest(admin, vehicle.id, { fuelLevel: "1/2", cost: "" });
    expect(blank.status).toBe(200);
    expect(await expensesOf(vehicle.id)).toHaveLength(0);
  });

  it("books an amount without a level too, and still reports the date of the refill", async () => {
    const vehicle = await createFixtureVehicle();
    const res = await fuelRequest(admin, vehicle.id, { cost: "12,5" });
    expect(res.status).toBe(200);
    const [expense] = await expensesOf(vehicle.id);
    expect(Number(expense.amount)).toBe(12.5);
    expect(expense.description).toMatch(/^Tankbeurt /);
    const car = await vehicleRow(vehicle.id);
    expect(car.fuelRefillDate).not.toBeNull();
  });

  it("a double submit does not book twice; a later refill with another amount does", async () => {
    const vehicle = await createFixtureVehicle();
    const first = await fuelRequest(admin, vehicle.id, { fuelLevel: "Full", cost: "60.00" });
    const again = await fuelRequest(admin, vehicle.id, { fuelLevel: "Full", cost: "60.00" });
    expect(first.status).toBe(200);
    expect(again.status).toBe(200);
    expect(await expensesOf(vehicle.id)).toHaveLength(1);

    const other = await fuelRequest(admin, vehicle.id, { fuelLevel: "Full", cost: "61.00" });
    expect(other.status).toBe(200);
    expect(await expensesOf(vehicle.id)).toHaveLength(2);
  });

  it("two identical requests at the same moment still book once", async () => {
    const vehicle = await createFixtureVehicle();
    const [a, b] = await Promise.all([
      fuelRequest(admin, vehicle.id, { fuelLevel: "3/4", cost: "52.10" }),
      fuelRequest(admin, vehicle.id, { fuelLevel: "3/4", cost: "52.10" }),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(await expensesOf(vehicle.id)).toHaveLength(1);
  });

  it("the same refill after the two-minute window is a new event and books again", async () => {
    const vehicle = await createFixtureVehicle();
    await fuelRequest(admin, vehicle.id, { fuelLevel: "1/2", cost: "30.00" });
    // Age the first expense past the window.
    await db.update(expenses).set({ createdAt: new Date(Date.now() - 3 * 60_000) }).where(eq(expenses.vehicleId, vehicle.id));
    const later = await fuelRequest(admin, vehicle.id, { fuelLevel: "1/2", cost: "30.00" });
    expect(later.status).toBe(200);
    expect(await expensesOf(vehicle.id)).toHaveLength(2);
  });

  it("an account with manage_vehicles but without manage_expenses can still book the refill", async () => {
    const vehicle = await createFixtureVehicle();
    const res = await fuelRequest(vehiclesOnly, vehicle.id, { fuelLevel: "Full", cost: "20" });
    expect(res.status).toBe(200);
    expect(await expensesOf(vehicle.id)).toHaveLength(1);
    // ...but the expense routes keep their own guard.
    const direct = await vehiclesOnly.get(`/api/expenses/vehicle/${vehicle.id}`);
    expect(direct.status).toBe(403);
  });

  it.each(["abc", "0", "0.00", "-5", "1000000.01", "NaN", "1e3x"])(
    "refuses the amount %j with 400 FUEL_COST_INVALID and changes nothing",
    async (bad) => {
      const vehicle = await createFixtureVehicle();
      const before = await vehicleRow(vehicle.id);
      const filesBefore = listFilesRecursive(TEMP_UPLOADS);

      const res = await fuelRequest(admin, vehicle.id, { fuelLevel: "Full", cost: bad }, receipt("FIXT-dc01-bad"));
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("FUEL_COST_INVALID");

      const after = await vehicleRow(vehicle.id);
      expect(after.currentFuelLevel).toBe(before.currentFuelLevel);
      expect(after.fuelRefillCost).toBe(before.fuelRefillCost);
      expect(after.fuelRefillReceipt).toBe(before.fuelRefillReceipt);
      expect(await expensesOf(vehicle.id)).toHaveLength(0);
      expect(listFilesRecursive(TEMP_UPLOADS)).toEqual(filesBefore);
    },
  );

  it("accepts the largest allowed amount", async () => {
    const vehicle = await createFixtureVehicle();
    const res = await fuelRequest(admin, vehicle.id, { fuelLevel: "Full", cost: "1000000" });
    expect(res.status).toBe(200);
    expect(await expensesOf(vehicle.id)).toHaveLength(1);
  });

  it("rolls the vehicle update back and removes the upload when the expense cannot be written", async () => {
    const vehicle = await createFixtureVehicle();
    const filesBefore = listFilesRecursive(TEMP_UPLOADS);
    vi.spyOn(storage, "createExpense").mockRejectedValueOnce(new Error("boom"));

    const res = await fuelRequest(admin, vehicle.id, { fuelLevel: "Full", cost: "45.50" }, receipt("FIXT-dc01-fail"));
    expect(res.status).toBe(500);
    expect(res.body.code).toBe("FUEL_EXPENSE_FAILED");

    const car = await vehicleRow(vehicle.id);
    expect(car.currentFuelLevel).toBeNull();
    expect(car.fuelRefillCost).toBeNull();
    expect(car.fuelRefillDate).toBeNull();
    expect(car.fuelRefillReceipt).toBeNull();
    expect(await expensesOf(vehicle.id)).toHaveLength(0);
    expect(listFilesRecursive(TEMP_UPLOADS)).toEqual(filesBefore);
  });

  it("keeps working without an amount when the receipt is only a vehicle receipt", async () => {
    const vehicle = await createFixtureVehicle();
    const res = await fuelRequest(admin, vehicle.id, { fuelLevel: "1/4" }, receipt("FIXT-dc01-noamount"));
    expect(res.status).toBe(200);
    const car = await vehicleRow(vehicle.id);
    expect(car.fuelRefillReceipt).toBeTruthy();
    expect(await expensesOf(vehicle.id)).toHaveLength(0);
  });

  it("source and source_ref are server-set: POST /api/expenses ignores them", async () => {
    const vehicle = await createFixtureVehicle();
    const res = await admin.post("/api/expenses").send({
      vehicleId: vehicle.id, category: "fuel", amount: "10.00", date: isoToday(),
      source: "fuel_refill", sourceRef: `vehicle:${vehicle.id}:x`, source_ref: `vehicle:${vehicle.id}:x`,
    });
    expect(res.status).toBe(201);
    const [row] = await expensesOf(vehicle.id);
    expect(row.source).toBeNull();
    expect(row.sourceRef).toBeNull();
  });
});

describe("D1 - emptying a bin never takes a receipt the vehicle still points at", () => {
  it("keeps the fuel receipt file while vehicles.fuel_refill_receipt names it; removes an unreferenced one", async () => {
    const vehicle = await createFixtureVehicle();
    const plate = "DC01PURGE";
    const sharedRel = `uploads/${plate}/fuel_receipt/shared-${Date.now()}.pdf`;
    const loneRel = `uploads/${plate}/fuel_receipt/lone-${Date.now()}.pdf`;
    for (const rel of [sharedRel, loneRel]) {
      const abs = path.join(TEMP_UPLOADS, rel.slice("uploads/".length));
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, "bytes");
    }
    await db.update(vehicles).set({ fuelRefillReceipt: sharedRel }).where(eq(vehicles.id, vehicle.id));
    // A binned expense whose snapshot names both files (the shared one is also the vehicle's receipt).
    const [record] = await db.insert(deletedRecords).values({
      entityType: "fine", entityId: 991001, label: "FIXT-DC01 bin row", relatedCounts: {},
      payload: { expense: { receiptFilePath: sharedRel }, other: { receiptFilePath: loneRel } },
    }).returning();
    try {
      const res = await admin.post("/api/deleted-records/purge").send({ ids: [record.id] });
      expect(res.status).toBe(200);
      expect(res.body.purged).toBe(1);
      const exists = (rel: string) => fs.existsSync(path.join(TEMP_UPLOADS, rel.slice("uploads/".length)));
      expect(exists(sharedRel)).toBe(true);
      expect(exists(loneRel)).toBe(false);
    } finally {
      await db.delete(deletedRecords).where(eq(deletedRecords.id, record.id));
    }
  });
});
