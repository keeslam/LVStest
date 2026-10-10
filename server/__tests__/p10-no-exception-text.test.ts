/**
 * P10 (audit 2026-10-09, module 19 / X2): the routers outside server/routes.ts
 * answered a failed request with `details: error.message`, which carries
 * database and file-system text (relation names, absolute paths). The error is
 * logged on the server; the answer is a fixed English message plus a stable
 * `code`, and nothing from the exception.
 *
 * Each router is mounted on a bare Express app with a `db` that throws a
 * recognisable secret, so the test needs no data and no login.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import express from "express";
import request from "supertest";

const SECRET = "SECRET-PG-DETAIL relation \"email_logs\" C:\\secret\\path";

vi.mock("../db.js", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  const boom = () => {
    throw new Error("SECRET-PG-DETAIL relation \"email_logs\" C:\\secret\\path");
  };
  const deep: any = new Proxy(function () {}, {
    get: (_t, prop) => (prop === "then" ? undefined : deep),
    apply: boom,
  });
  const db = new Proxy({}, { get: (_t, prop) => (prop === "query" ? deep : boom) });
  return { ...original, db };
});

const { default: emailLogsRouter } = await import("../routes/email-logs");
const { default: emailTemplatesRouter } = await import("../routes/email-templates");
const { default: filteredVehiclesRouter } = await import("../routes/filtered-vehicles");
const { default: notificationsRouter } = await import("../routes/notifications");
const { default: vehiclesWithReservationsRouter } = await import("../routes/vehicles-with-reservations");

function app() {
  const a = express();
  a.use(express.json());
  a.use("/email-logs", emailLogsRouter);
  a.use("/email-templates", emailTemplatesRouter);
  a.use("/filtered", filteredVehiclesRouter);
  a.use("/notifications", notificationsRouter);
  a.use("/with-reservations", vehiclesWithReservationsRouter);
  return a;
}

describe("P10 — a failed request does not echo the exception", () => {
  const silence = vi.spyOn(console, "error").mockImplementation(() => {});
  beforeAll(() => silence.mockClear());
  afterAll(() => silence.mockRestore());

  const cases: Array<[string, "get" | "post" | "put" | "delete", string, object | undefined, string]> = [
    ["email-logs list", "get", "/email-logs", undefined, "EMAIL_LOG_LIST_FAILED"],
    ["email-logs read", "get", "/email-logs/1", undefined, "EMAIL_LOG_READ_FAILED"],
    ["email-logs create", "post", "/email-logs", { template: "apk", subject: "s", recipients: 1, emailsSent: 1, emailsFailed: 0 }, "EMAIL_LOG_CREATE_FAILED"],
    ["email-templates list", "get", "/email-templates", undefined, "EMAIL_TEMPLATE_LIST_FAILED"],
    ["email-templates read", "get", "/email-templates/1", undefined, "EMAIL_TEMPLATE_READ_FAILED"],
    ["email-templates create", "post", "/email-templates", { name: "n", subject: "s", content: "c" }, "EMAIL_TEMPLATE_CREATE_FAILED"],
    ["email-templates update", "put", "/email-templates/1", { name: "n", subject: "s", content: "c" }, "EMAIL_TEMPLATE_UPDATE_FAILED"],
    ["email-templates delete", "delete", "/email-templates/1", undefined, "EMAIL_TEMPLATE_DELETE_FAILED"],
    ["filtered vehicles", "get", "/filtered", undefined, "FILTERED_VEHICLES_FAILED"],
    ["notifications send", "post", "/notifications/send", { customerIds: [1], template: "apk" }, "NOTIFICATIONS_SEND_FAILED"],
    ["gps activation", "post", "/notifications/send-gps-activation", { vehicleData: { imei: "1" } }, "GPS_ACTIVATION_SEND_FAILED"],
    ["vehicles with reservations", "get", "/with-reservations", undefined, "VEHICLES_WITH_RESERVATIONS_FAILED"],
  ];

  for (const [name, method, url, body, code] of cases) {
    it(`${name}: 500 with code ${code}, no details, nothing from the exception`, async () => {
      const req = request(app())[method](url);
      const res = await (body ? req.send(body) : req);
      expect(res.status).toBe(500);
      expect(res.body.code).toBe(code);
      expect(typeof res.body.message).toBe("string");
      expect(res.body).not.toHaveProperty("details");
      const wire = JSON.stringify(res.body);
      expect(wire).not.toContain("SECRET-PG-DETAIL");
      expect(wire).not.toContain("secret");
      expect(wire).not.toContain("relation");
      expect(SECRET).toContain("SECRET");
    });
  }
});
