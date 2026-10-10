/**
 * P10 (audit 2026-10-09): codes added in server/routes.ts. A failure inside the
 * toggle-registration route answers a fixed message and a code, never the
 * exception text.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const { agentFor, cleanupFixtureUsers } = await import("./helpers/app");
const { createFixtureVehicle, cleanupFixtures } = await import("./helpers/fixtures");
const { storage } = await import("../storage");

describe("P10 - routes.ts failure codes", () => {
  let admin: Awaited<ReturnType<typeof agentFor>>;
  beforeAll(async () => {
    admin = await agentFor("admin");
  }, 60_000);
  afterAll(async () => {
    await cleanupFixtures();
    await cleanupFixtureUsers();
  });

  it("toggle-registration: a storage failure is TOGGLE_REGISTRATION_FAILED without the exception text", async () => {
    const vehicle = await createFixtureVehicle({});
    const spy = vi.spyOn(storage, "updateVehicle").mockRejectedValue(new Error("SECRET-DB-DETAIL relation vehicles"));
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await admin.patch(`/api/vehicles/${vehicle.id}/toggle-registration`).send({ status: "opnaam" });
      expect(res.body.code).toBe("TOGGLE_REGISTRATION_FAILED");
      expect(JSON.stringify(res.body)).not.toContain("SECRET-DB-DETAIL");
    } finally {
      spy.mockRestore();
      quiet.mockRestore();
    }
  });
});
