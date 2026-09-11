/**
 * FIX-I — permission and privilege gaps
 * (BUG-001, BUG-010, BUG-011, BUG-015, BUG-023, BUG-064, BUG-065, BUG-066,
 *  BUG-067, BUG-068, BUG-085).
 *
 * Every case below answered 200 to the named account before this wave.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, like } from "drizzle-orm";
import { db } from "../db";
import { users, reservations, appSettings } from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { cleanupFixtures, createFixtureVehicle, createFixtureReservation, createFixtureCustomer } from "./helpers/fixtures";

describe("FIX-I — a permission is required where one was missing", () => {
  let nobody: TestAgent;      // permissions: []
  let manageUsers: TestAgent; // manage_users, role manager — not an admin
  let admin: TestAgent;
  let reservationId: number;
  let vehicleId: number;

  beforeAll(async () => {
    nobody = await agentFor([]);
    manageUsers = await agentFor(["manage_users"]);
    admin = await agentFor("admin");
    const customer = await createFixtureCustomer("Perm");
    vehicleId = (await createFixtureVehicle()).id;
    reservationId = (await createFixtureReservation({ customerId: customer.id, vehicleId })).id;
  }, 90_000);

  afterAll(async () => {
    await db.delete(appSettings).where(like(appSettings.key, "FIXT-%"));
    await cleanupFixtures();
    await cleanupFixtureUsers();
  });

  it("BUG-001: a manager with manage_users cannot create an admin", async () => {
    const username = `FIXT-user-escalate-${Date.now().toString(36)}`;
    const res = await manageUsers.post("/api/users").send({
      username, password: "some-password-1", role: "admin",
    });
    expect(res.status).toBe(403);
    const rows = await db.select().from(users).where(eq(users.username, username));
    expect(rows).toHaveLength(0);
  });

  it("BUG-001: a manager with manage_users cannot promote itself", async () => {
    const res = await manageUsers.patch(`/api/users/${manageUsers.userId}`).send({ role: "admin" });
    expect([200, 403]).toContain(res.status);
    const [row] = await db.select().from(users).where(eq(users.id, manageUsers.userId));
    // Either refused outright or the field was dropped — never actually admin.
    expect(row.role).toBe("manager");
  });

  it("BUG-001: a manager with manage_users cannot promote someone else", async () => {
    const victim = await agentFor([]);
    const res = await manageUsers.patch(`/api/users/${victim.userId}`).send({ role: "admin" });
    expect(res.status).toBe(403);
    const [row] = await db.select().from(users).where(eq(users.id, victim.userId));
    expect(row.role).toBe("manager");
  });

  it("BUG-001: a manager with manage_users cannot grant itself permissions", async () => {
    const res = await manageUsers.patch(`/api/users/${manageUsers.userId}`).send({ permissions: ["manage_settings", "manage_backups"] });
    expect([200, 403]).toContain(res.status);
    const [row] = await db.select().from(users).where(eq(users.id, manageUsers.userId));
    expect(row.permissions).toEqual(["manage_users"]);
  });

  it("BUG-001: a real admin can still set roles", async () => {
    const target = await agentFor([]);
    const res = await admin.patch(`/api/users/${target.userId}`).send({ role: "admin" });
    expect(res.status).toBe(200);
    const [row] = await db.select().from(users).where(eq(users.id, target.userId));
    expect(row.role).toBe("admin");
  });

  it("BUG-010: manage_backups can no longer read the SMTP password", async () => {
    const [setting] = await db.insert(appSettings).values({
      key: "FIXT-email_config",
      category: "email",
      value: { smtpHost: "smtp.test", smtpPassword: "FIXT-super-secret-smtp-pw" },
    } as any).returning();

    const backups = await agentFor(["manage_backups"]);
    for (const url of ["/api/settings", "/api/settings/category/email", `/api/settings/key/${setting.key}`, `/api/settings/${setting.id}`]) {
      const res = await backups.get(url);
      expect(res.status, url).toBe(403);
      expect(JSON.stringify(res.body)).not.toContain("FIXT-super-secret-smtp-pw");
    }

    // And even with the right permission the value is redacted.
    const settingsUser = await agentFor(["manage_settings"]);
    for (const url of ["/api/settings", "/api/settings/category/email", `/api/settings/key/${setting.key}`, `/api/settings/${setting.id}`]) {
      const res = await settingsUser.get(url);
      expect(res.status, url).toBe(200);
      expect(JSON.stringify(res.body)).not.toContain("FIXT-super-secret-smtp-pw");
    }
  });

  it("BUG-011: PUT /api/system-settings requires manage_settings", async () => {
    expect((await nobody.put("/api/system-settings").send({ tollRatePerKm: "9.99" })).status).toBe(403);
    const settingsUser = await agentFor(["manage_settings"]);
    expect((await settingsUser.put("/api/system-settings").send({ tollRatePerKm: "0.35" })).status).toBe(200);
  });

  it("BUG-015: spare-status requires manage_reservations", async () => {
    const viewer = await agentFor(["view_reservations"]);
    const res = await viewer.patch(`/api/reservations/${reservationId}/spare-status`).send({ spareVehicleStatus: "returned" });
    expect(res.status).toBe(403);
    const [row] = await db.select().from(reservations).where(eq(reservations.id, reservationId));
    expect(row.spareVehicleStatus ?? null).not.toBe("returned");
  });

  it("BUG-064: DELETE /api/reservations/:id requires manage_reservations", async () => {
    const res = await nobody.delete(`/api/reservations/${reservationId}`);
    expect(res.status).toBe(403);
    const [row] = await db.select().from(reservations).where(eq(reservations.id, reservationId));
    expect(row.deletedAt ?? null).toBeNull();
  });

  it("BUG-023: the customer-drivers migration requires manage_customers", async () => {
    const viewer = await agentFor(["view_vehicles", "view_customers"]);
    expect((await viewer.post("/api/migrate/customer-drivers").send({})).status).toBe(403);
  });

  it("BUG-065: all seven interactive-damage-check routes refuse an account with no permissions", async () => {
    const routes: Array<[string, string]> = [
      ["get", "/api/interactive-damage-checks"],
      ["get", "/api/interactive-damage-checks/1"],
      ["get", "/api/interactive-damage-checks/1/pdf"],
      ["get", `/api/vehicles/${vehicleId}/damage-check-pdf`],
      ["post", "/api/interactive-damage-checks"],
      ["put", "/api/interactive-damage-checks/1"],
      ["delete", "/api/interactive-damage-checks/1"],
    ];
    for (const [method, url] of routes) {
      const res = await (nobody as any)[method](url).send({});
      expect(res.status, `${method.toUpperCase()} ${url}`).toBe(403);
    }
  });

  it("BUG-066: vehicle-diagram-template mutations require manage_vehicles", async () => {
    expect((await nobody.post("/api/vehicle-diagram-templates").send({})).status).toBe(403);
    expect((await nobody.patch("/api/vehicle-diagram-templates/1").send({})).status).toBe(403);
    expect((await nobody.delete("/api/vehicle-diagram-templates/1")).status).toBe(403);
  });

  it("BUG-067: the contract-number override requires manage_settings", async () => {
    expect((await nobody.post("/api/settings/contract-number-override").send({ overrideNumber: 999999 })).status).toBe(403);
    expect((await nobody.delete("/api/settings/contract-number-override")).status).toBe(403);
  });

  it("BUG-068: placeholder and spare overviews refuse an account with no permissions", async () => {
    const routes: Array<[string, string]> = [
      ["post", "/api/placeholder-reservations"],
      ["get", "/api/placeholder-reservations"],
      ["get", "/api/placeholder-reservations/needing-assignment"],
      ["post", "/api/placeholder-reservations/1/assign-vehicle"],
      ["get", `/api/vehicles/${vehicleId}/customers-with-reservations`],
      ["get", "/api/spare-vehicles/available"],
    ];
    for (const [method, url] of routes) {
      const res = await (nobody as any)[method](url).send({});
      expect(res.status, `${method.toUpperCase()} ${url}`).toBe(403);
    }
  });
});
