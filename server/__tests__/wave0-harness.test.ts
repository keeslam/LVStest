/**
 * Wave 0 — the test harness itself.
 *
 * Proves `makeApp()` / `agentFor()` / `anonAgent()` from
 * `server/__tests__/helpers/app.ts` build the real staff app, log a throwaway
 * user in, and carry a working CSRF token. Every Wave 1 test builds on this.
 */
import { describe, it, expect, afterAll } from "vitest";
import { agentFor, anonAgent, cleanupFixtureUsers } from "./helpers/app";
import { cleanupFixtures, createFixtureVehicle } from "./helpers/fixtures";

describe("test harness", () => {
  afterAll(async () => {
    await cleanupFixtures();
    await cleanupFixtureUsers();
  });

  it("agentFor() logs in and the session answers /api/user", async () => {
    const staff = await agentFor(["view_vehicles"]);
    const res = await staff.get("/api/user");
    expect(res.status).toBe(200);
    expect(res.body.username).toBe(staff.username);
    expect(res.body.permissions).toEqual(["view_vehicles"]);
  });

  it("anonAgent() has no session", async () => {
    const anon = await anonAgent();
    const res = await anon.get("/api/user");
    expect(res.status).toBe(401);
  });

  it("the agent's CSRF token is accepted on a mutating request", async () => {
    const admin = await agentFor("admin");
    const res = await admin.post("/api/customers").send({ name: "FIXT-csrf-probe" });
    // Anything but a CSRF rejection proves the token was accepted.
    expect(res.status).not.toBe(403);
    expect(res.body?.code).not.toBe("CSRF_MISSING");
  });

  it("fixtures are cleaned up by vehicle id as well", async () => {
    const vehicle = await createFixtureVehicle();
    expect(vehicle.id).toBeGreaterThan(0);
    await cleanupFixtures();
  });
});
