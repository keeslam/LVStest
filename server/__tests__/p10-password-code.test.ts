/**
 * A-1-3 (audit 2026-10-09): "Current password is incorrect" reached the toast
 * in English. The server keeps its English message and adds a stable code; the
 * profile dialog translates by the code.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const { agentFor, cleanupFixtureUsers } = await import("./helpers/app");

describe("P10 - change-password answers a wrong current password with a code", () => {
  let user: Awaited<ReturnType<typeof agentFor>>;
  beforeAll(async () => {
    user = await agentFor([]);
  }, 60_000);
  afterAll(async () => {
    await cleanupFixtureUsers();
  });

  it("400 with code CURRENT_PASSWORD_INCORRECT", async () => {
    const res = await user.post("/api/users/change-password").send({
      currentPassword: "definitely-not-it-1",
      newPassword: "Another-Password-9",
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("CURRENT_PASSWORD_INCORRECT");
    expect(res.body.message).toBe("Current password is incorrect");
  });
});
