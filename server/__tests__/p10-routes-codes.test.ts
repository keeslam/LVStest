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
  describe("return-from-service codes", () => {
    // INVALID_RESERVATION_ID (the isNaN branch in the route) is unreachable over
    // HTTP: the central id-param guard (middleware/parseIntParam.ts) refuses every
    // non-integer id first, with its own body. This pins what a caller really
    // sees, so a change to the guard cannot silently turn it into a 500.
    it("a non-numeric reservation id is a 400 from the central id guard before the route runs", async () => {
      const res = await admin.post("/api/reservations/abc/return-from-service").send({ returnDate: "2026-10-10" });
      expect(res.status).toBe(400);
      expect(res.body.field).toBe("id");
    });

    it("RETURN_DATE_REQUIRED when no date is sent", async () => {
      const res = await admin.post("/api/reservations/1/return-from-service").send({});
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("RETURN_DATE_REQUIRED");
    });

    it("RETURN_DATE_INVALID for a date that does not exist, with the field named", async () => {
      const res = await admin.post("/api/reservations/1/return-from-service").send({ returnDate: "2026-02-30" });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("RETURN_DATE_INVALID");
      expect(res.body.errors[0].field).toBe("returnDate");
    });

    it("RETURN_FROM_SERVICE_REFUSED when the storage layer refuses (reservation does not exist)", async () => {
      const res = await admin.post("/api/reservations/2147483000/return-from-service").send({ returnDate: "2026-10-10" });
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("RETURN_FROM_SERVICE_REFUSED");
    });

    it("RETURN_FROM_SERVICE_FAILED on an exception, without the exception text", async () => {
      const spy = vi.spyOn(storage, "returnVehicleFromService").mockRejectedValue(new Error("SECRET-DB-DETAIL relation reservations"));
      const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const res = await admin.post("/api/reservations/1/return-from-service").send({ returnDate: "2026-10-10" });
        expect(res.status).toBe(500);
        expect(res.body.code).toBe("RETURN_FROM_SERVICE_FAILED");
        expect(JSON.stringify(res.body)).not.toContain("SECRET-DB-DETAIL");
      } finally {
        spy.mockRestore();
        quiet.mockRestore();
      }
    });
  });

  it("CUSTOMERS_WITH_RESERVATIONS_FAILED on an exception, without the exception text", async () => {
    const spy = vi.spyOn(storage, "getVehicle").mockRejectedValue(new Error("SECRET-DB-DETAIL relation vehicles"));
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await admin.get("/api/vehicles/1/customers-with-reservations");
      expect(res.status).toBe(500);
      expect(res.body.code).toBe("CUSTOMERS_WITH_RESERVATIONS_FAILED");
      expect(JSON.stringify(res.body)).not.toContain("SECRET-DB-DETAIL");
    } finally {
      spy.mockRestore();
      quiet.mockRestore();
    }
  });
});
