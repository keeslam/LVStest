/**
 * A-1-1 (fysieke E2E-audit 2026-10-09, module 1) — the login must answer an
 * unknown user and a wrong password with the SAME message, so nobody can use
 * the form to find out which accounts exist. The server message stays English
 * (the client shows its own translated text); the audit log keeps the real
 * reason apart.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { agentFor, anonAgent, cleanupFixtureUsers, type TestAgent } from "./helpers/app";

describe("POST /api/login — one neutral message for every credential failure", () => {
  let target: TestAgent;

  beforeAll(async () => {
    target = await agentFor([]);
  }, 90_000);

  afterAll(async () => {
    await cleanupFixtureUsers();
  });

  it("an unknown user and a wrong password give the same status and message", async () => {
    const unknown = await (await anonAgent()).post("/api/login").send({ username: "nobody-p9-xyz", password: "whatever-123" });
    const wrong = await (await anonAgent()).post("/api/login").send({ username: target.username, password: "definitely-wrong-1" });

    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body.message).toBe(wrong.body.message);
    expect(unknown.body.message).not.toMatch(/username|password/i);
  });
});
