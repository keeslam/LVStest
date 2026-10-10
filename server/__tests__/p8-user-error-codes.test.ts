/**
 * Audit 2026-10-09 module 17 (A-17-6): the users routes answer a stable `code`
 * next to the English message, so the dialog can translate it. The status codes
 * and guards are unchanged.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { agentFor, cleanupFixtureUsers, FIXTURE_USER_PREFIX, type TestAgent } from "./helpers/app";

describe("users routes - stable error codes", () => {
  let admin: TestAgent;

  beforeAll(async () => {
    admin = await agentFor("admin");
  }, 90_000);

  afterAll(async () => {
    await cleanupFixtureUsers();
  });

  it("POST /api/users with an existing username answers 400 USERNAME_EXISTS", async () => {
    const res = await admin.post("/api/users").send({
      username: admin.username,
      password: "Een-Echt-Wachtwoord1",
      role: "viewer",
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("USERNAME_EXISTS");
    expect(res.body.message).toBe("Username already exists");
  });

  it("PATCH /api/users/:id to a taken username answers 400 USERNAME_EXISTS", async () => {
    const other = await agentFor([]);
    const res = await admin.patch(`/api/users/${other.userId}`).send({ username: admin.username });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("USERNAME_EXISTS");
    expect(other.username.startsWith(FIXTURE_USER_PREFIX)).toBe(true);
  });

  it("DELETE /api/users/:id on your own id answers 400 CANNOT_DELETE_SELF", async () => {
    const res = await admin.delete(`/api/users/${admin.userId}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("CANNOT_DELETE_SELF");
  });
});
