/**
 * FIX-T — performance on the hot paths, asserted as statement counts and
 * payload shapes rather than milliseconds (remediation plan §8.6).
 *
 *   BUG-203 (HIGH) — getReservationsInDateRange is N+1: 924 statements for one
 *                    month view, 3 774 for a year.
 *   BUG-215        — every damage-check PDF re-encodes the 1.6 MB header PNG.
 *   BUG-216 (T-half)— the mileage report loads 17 MB of base64 diagrams to read
 *                    a mileage field, and the damage-check *list* ships them to
 *                    a screen that renders none of them.
 *   BUG-217        — GET /api/vehicles runs the status sync (2 SELECT + up to
 *                    3 UPDATE) on every read.
 *   BUG-218        — express.json({ limit: '50mb' }) globally.
 *   BUG-226        — customers/with-reservations and find-by-contract load the
 *                    whole reservation table to compute one boolean.
 *   BUG-227        — per-row console.log on the hottest read path.
 *   BUG-230        — the nightly service-due scan loads settings and all
 *                    vehicles twice; the RDW scan does one SELECT per vehicle.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { db } from "../db";
import { storage } from "../storage";
import { countSql, statementsOfKind } from "./helpers/sqlCounter";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import {
  createFixtureCustomer,
  createFixtureVehicle,
  createFixtureReservation,
  cleanupFixtures,
} from "./helpers/fixtures";

let admin: TestAgent;
let customerId: number;
let vehicleIds: number[] = [];

/**
 * A fixed window well away from "today", so the assertions do not depend on
 * the date or the weekday the suite runs on.
 */
const RANGE_START = "2031-03-01";
const RANGE_END = "2031-03-31";

beforeAll(async () => {
  admin = await agentFor("admin");
  customerId = (await createFixtureCustomer("Perf")).id;

  // 60 reservations over 12 distinct vehicles inside the window. The pre-fix
  // implementation issues two to three statements per row here; the fixed one
  // issues a constant number whatever the row count.
  for (let v = 0; v < 12; v++) {
    const vehicle = await createFixtureVehicle();
    vehicleIds.push(vehicle.id);
  }
  for (let i = 0; i < 60; i++) {
    const day = String((i % 25) + 1).padStart(2, "0");
    await createFixtureReservation({
      customerId,
      vehicleId: vehicleIds[i % vehicleIds.length],
      startDate: `2031-03-${day}`,
      endDate: `2031-03-${day}`,
    });
  }
}, 120_000);

afterAll(async () => {
  await cleanupFixtures();
  await cleanupFixtureUsers();
});

describe("BUG-203 — the calendar range query is O(1) in the number of rows", () => {
  it("a month with 60 reservations costs a constant, small number of statements", async () => {
    const { result, statements } = await countSql(() =>
      storage.getReservationsInDateRange(RANGE_START, RANGE_END),
    );
    expect(result.length).toBeGreaterThanOrEqual(60);
    // Pre-fix: 2-3 statements per row (924 for the audit's 462-row month).
    expect(statements.length).toBeLessThanOrEqual(5);
  });

  it("the statement count does not grow with the number of rows", async () => {
    const narrow = await countSql(() =>
      storage.getReservationsInDateRange("2031-03-01", "2031-03-02"),
    );
    const wide = await countSql(() => storage.getReservationsInDateRange(RANGE_START, RANGE_END));
    expect(wide.result.length).toBeGreaterThan(narrow.result.length * 3);
    // This is the property, stated directly: more rows, same number of queries.
    expect(wide.statements.length).toBe(narrow.statements.length);
  });

  it("returns the same shape it always did — vehicle, customer and driver attached", async () => {
    const rows = await storage.getReservationsInDateRange(RANGE_START, RANGE_END);
    const mine = rows.filter((r) => r.customerId === customerId);
    expect(mine.length).toBeGreaterThan(0);
    for (const row of mine) {
      expect(row.vehicle?.id).toBe(row.vehicleId);
      expect(row.customer?.id).toBe(customerId);
      expect("driver" in row).toBe(true);
    }
  });

  it("a maintenance block with no customer still borrows the open-ended rental's customer", async () => {
    const vehicle = await createFixtureVehicle();
    // An open-ended rental on the vehicle…
    await createFixtureReservation({
      customerId,
      vehicleId: vehicle.id,
      startDate: "2031-05-01",
      endDate: null,
      status: "confirmed",
    });
    // …and a maintenance block over it, with no customer of its own.
    await createFixtureReservation({
      customerId: null,
      vehicleId: vehicle.id,
      startDate: "2031-05-10",
      endDate: "2031-05-12",
      type: "maintenance_block",
    });

    const rows = await storage.getReservationsInDateRange("2031-05-09", "2031-05-13");
    const block = rows.find((r) => r.vehicleId === vehicle.id && r.type === "maintenance_block");
    expect(block).toBeDefined();
    expect(block!.customer?.id).toBe(customerId);
  });

  it("BUG-227 — the read path no longer writes a line per row to the console", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await storage.getReservationsInDateRange("2031-05-09", "2031-05-13");
      const noisy = spy.mock.calls.filter((call) =>
        /Looking for active rental|Found active rental|Found customer from active rental|No active rental found/.test(
          String(call[0]),
        ),
      );
      expect(noisy).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("BUG-217 — GET /api/vehicles does not write", () => {
  it("issues no UPDATE and a bounded number of statements", async () => {
    const { statements } = await countSql(async () => {
      const res = await admin.get("/api/vehicles?search=FIXT");
      expect(res.status).toBe(200);
    });
    expect(statementsOfKind(statements, "update").filter((s) => /vehicles/i.test(s))).toEqual([]);
    expect(statements.length).toBeLessThanOrEqual(12);
  });

  it("/api/vehicles/status/breakdown does not write either", async () => {
    const { statements } = await countSql(async () => {
      const res = await admin.get("/api/vehicles/status/breakdown");
      expect(res.status).toBe(200);
    });
    expect(statementsOfKind(statements, "update").filter((s) => /vehicles/i.test(s))).toEqual([]);
  });
});

describe("BUG-226 — one boolean does not cost the whole reservation table", () => {
  it("GET /api/customers/with-reservations stays within a handful of statements", async () => {
    const { statements } = await countSql(async () => {
      const res = await admin.get("/api/customers/with-reservations");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
    // Baseline for any authenticated request in this app is 3-4 statements.
    expect(statements.length).toBeLessThanOrEqual(7);
    expect(statements.filter((s) => /from "reservations"/i.test(s)).length).toBeLessThanOrEqual(1);
  });

  it("with-reservations still reports the right boolean", async () => {
    // A customer with a rental that is running right now must be flagged.
    const activeCustomer = await createFixtureCustomer("Active");
    const vehicle = await createFixtureVehicle();
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    await createFixtureReservation({
      customerId: activeCustomer.id,
      vehicleId: vehicle.id,
      startDate: yesterday,
      endDate: nextWeek,
    });
    // …and one whose rental is long over must not be.
    const pastCustomer = await createFixtureCustomer("Past");
    await createFixtureReservation({
      customerId: pastCustomer.id,
      vehicleId: vehicle.id,
      startDate: "2020-01-01",
      endDate: "2020-01-05",
    });

    const res = await admin.get("/api/customers/with-reservations");
    const byId = new Map(res.body.map((c: any) => [c.id, c.hasActiveReservation]));
    expect(byId.get(activeCustomer.id)).toBe(true);
    expect(byId.get(pastCustomer.id)).toBe(false);
  });

  it("find-by-contract looks the contract up instead of scanning every reservation", async () => {
    const vehicle = await createFixtureVehicle();
    const reservation = await createFixtureReservation({
      customerId,
      vehicleId: vehicle.id,
      startDate: "2031-07-01",
      endDate: "2031-07-05",
    });
    const contractNumber = `FIXT-C-${reservation.id}`;
    await storage.updateReservation(reservation.id, { contractNumber } as any);

    const { statements } = await countSql(async () => {
      const res = await admin.get(`/api/reservations/find-by-contract/${contractNumber}`);
      expect(res.status).toBe(200);
      expect(res.body.exists).toBe(true);
      expect(res.body.reservation.id).toBe(reservation.id);
    });
    expect(statements.length).toBeLessThanOrEqual(9);

    const missing = await admin.get("/api/reservations/find-by-contract/FIXT-NOPE-0");
    expect(missing.status).toBe(200);
    expect(missing.body).toEqual({ exists: false, reservation: null });
  });
});

describe("BUG-218 — per-route JSON body limits", () => {
  const bigBody = () => ({ notes: "x".repeat(5 * 1024 * 1024) });

  it("a 5 MB JSON body is refused on a normal route", async () => {
    const res = await admin.post("/api/customers").send(bigBody());
    expect(res.status).toBe(413);
  });

  it("the interactive damage-check routes still accept a large body", async () => {
    const vehicle = await createFixtureVehicle();
    const res = await admin.post("/api/interactive-damage-checks").send({
      vehicleId: vehicle.id,
      checkType: "pickup",
      checkDate: "2031-03-01",
      // A real diagram is a 1.3 MB base64 PNG; two signatures come with it.
      diagramWithAnnotations: `data:image/png;base64,${"A".repeat(4 * 1024 * 1024)}`,
    });
    expect(res.status).not.toBe(413);
    if (res.status === 201 && res.body?.id) {
      await storage.deleteInteractiveDamageCheck(res.body.id).catch(() => undefined);
    }
  }, 60_000);

  it("a normal-sized body is unaffected", async () => {
    const res = await admin.get("/api/customers");
    expect(res.status).toBe(200);
  });
});

describe("BUG-216 (technical half) — the blobs stay out of the list and the report", () => {
  it("GET /api/interactive-damage-checks returns no base64 diagram or signature", async () => {
    const res = await admin.get("/api/interactive-damage-checks");
    expect(res.status).toBe(200);
    for (const row of res.body) {
      // The only consumer (the calendar's admin history) reads reservationId,
      // checkDate/createdAt and completedBy — never the images.
      expect(row.diagramWithAnnotations).toBeUndefined();
      expect(row.renterSignature).toBeUndefined();
      expect(row.customerSignature).toBeUndefined();
      expect(row).toHaveProperty("reservationId");
      expect(row).toHaveProperty("completedBy");
    }
  });

  it("the per-id and per-reservation reads still carry everything", async () => {
    const vehicle = await createFixtureVehicle();
    const created = await storage.createInteractiveDamageCheck({
      vehicleId: vehicle.id,
      checkType: "pickup",
      checkDate: new Date("2031-03-02T00:00:00Z"),
      diagramWithAnnotations: "data:image/png;base64,AAAA",
    } as any);
    try {
      const single = await admin.get(`/api/interactive-damage-checks/${created.id}`);
      expect(single.status).toBe(200);
      expect(single.body.diagramWithAnnotations).toBe("data:image/png;base64,AAAA");

      const byVehicle = await admin.get(`/api/interactive-damage-checks/vehicle/${vehicle.id}`);
      expect(byVehicle.status).toBe(200);
      expect(byVehicle.body[0].diagramWithAnnotations).toBe("data:image/png;base64,AAAA");
    } finally {
      await storage.deleteInteractiveDamageCheck(created.id).catch(() => undefined);
    }
  });

  it("the mileage report reads mileage without loading the diagrams", async () => {
    const rows = await storage.getDamageCheckMileageReadings();
    expect(Array.isArray(rows)).toBe(true);
    for (const row of rows) {
      expect(row).toHaveProperty("vehicleId");
      expect(row).toHaveProperty("mileage");
      expect(row).not.toHaveProperty("diagramWithAnnotations");
    }
  });
});

describe("BUG-215 — the damage-check header image is normalised once, not per PDF", () => {
  it("two generations reuse one normalised image", async () => {
    const { prepareHeaderImage, __headerCacheStats } = await import("../utils/header-image-cache");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fixt-header-"));
    const file = path.join(dir, "header.png");
    try {
      // A deliberately oversized source, like the 1983x793 / 1.6 MB original.
      const { createCanvas } = await import("canvas");
      const canvas = createCanvas(1983, 793);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#123456";
      ctx.fillRect(0, 0, 1983, 793);
      fs.writeFileSync(file, canvas.toBuffer("image/png"));
      const originalSize = fs.statSync(file).size;

      const before = __headerCacheStats().normalisations;
      const first = await prepareHeaderImage(file);
      const second = await prepareHeaderImage(file);
      const after = __headerCacheStats().normalisations;

      expect(after - before).toBe(1); // encoded once for two generations
      expect(first.bytes.equals(second.bytes)).toBe(true);
      expect(first.width).toBeLessThanOrEqual(1200);
      expect(first.bytes.length).toBeLessThan(originalSize);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it("a changed file is re-normalised rather than served stale", async () => {
    const { prepareHeaderImage, __headerCacheStats } = await import("../utils/header-image-cache");
    const { createCanvas } = await import("canvas");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fixt-header2-"));
    const file = path.join(dir, "header.png");
    try {
      const draw = (w: number, colour: string) => {
        const canvas = createCanvas(w, 400);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = colour;
        ctx.fillRect(0, 0, w, 400);
        fs.writeFileSync(file, canvas.toBuffer("image/png"));
      };
      draw(800, "#111111");
      const first = await prepareHeaderImage(file);
      draw(1600, "#eeeeee");
      const before = __headerCacheStats().normalisations;
      const second = await prepareHeaderImage(file);
      expect(__headerCacheStats().normalisations - before).toBe(1);
      expect(second.bytes.equals(first.bytes)).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});

describe("BUG-230 — the nightly scans stop loading the fleet twice", () => {
  it("the service-due scan loads the settings and the vehicles once each", async () => {
    const { scanVehiclesForServiceDue } = await import("../utils/service-due-scanner");
    const { statements } = await countSql(() => scanVehiclesForServiceDue());
    const vehicleSelects = statements.filter((s) => /^\s*select/i.test(s) && /from "vehicles"/i.test(s));
    const settingsSelects = statements.filter((s) => /^\s*select/i.test(s) && /from "settings"/i.test(s));
    expect(vehicleSelects.length).toBe(1);
    expect(settingsSelects.length).toBe(1);
  }, 60_000);

  it("the RDW scan reads the pending changes in one statement, not one per vehicle", async () => {
    const rdwApi = await import("../utils/rdw-api");
    const spy = vi
      .spyOn(rdwApi, "fetchVehicleInfoByLicensePlate")
      .mockImplementation(async () => ({ apkDate: null }) as any);
    try {
      const { scanVehiclesForApkChanges } = await import("../utils/rdw-apk-scanner");
      const { statements } = await countSql(() => scanVehiclesForApkChanges());
      const pendingSelects = statements.filter(
        (s) => /^\s*select/i.test(s) && /from "apk_date_changes"/i.test(s),
      );
      expect(pendingSelects.length).toBeLessThanOrEqual(1);
    } finally {
      spy.mockRestore();
    }
  }, 120_000);
});
