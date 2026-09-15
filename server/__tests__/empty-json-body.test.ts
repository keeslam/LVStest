/**
 * A 200 must never carry an empty body.
 *
 * Reported from the running application: opening either calendar produced
 * "Failed to execute 'json' on 'Response': Unexpected end of JSON input".
 * Both calendar pages read `/api/app-settings/key/calendar_settings`, and that
 * route ended in `res.json(setting)` with `setting` undefined whenever the key
 * had never been stored. Express then sends 200 with zero bytes, and the query
 * function's `await res.json()` throws on the empty body.
 *
 * The route now answers a literal `null`, which is what a caller reading
 * "there is no such setting" needs. The client is hardened separately so no
 * other route can reintroduce the same failure (see
 * client/src/lib/__tests__/empty-json-body.test.ts).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { db } from "../db";
import { appSettings } from "@shared/schema";
import { eq } from "drizzle-orm";

const UNKNOWN_KEY = "fixt_setting_that_does_not_exist";

describe("een 200 heeft altijd een body die als JSON te lezen is", () => {
  let admin: TestAgent;

  beforeAll(async () => {
    admin = await agentFor("admin");
    // Make sure the key really is absent, whatever earlier runs did.
    await db.delete(appSettings).where(eq(appSettings.key, UNKNOWN_KEY));
  });

  afterAll(cleanupFixtureUsers);

  it("een onbekende instelling levert JSON null, geen leeg antwoord", async () => {
    const res = await admin.get(`/api/app-settings/key/${UNKNOWN_KEY}`);

    expect(res.status).toBe(200);
    // supertest gives the raw bytes; an empty body is exactly what broke the
    // calendars, so assert on the bytes rather than on the parsed value.
    expect(res.text).not.toBe("");
    expect(res.text.length).toBeGreaterThan(0);
    expect(() => JSON.parse(res.text)).not.toThrow();
    expect(JSON.parse(res.text)).toBeNull();
  });

  it("calendar_settings is leesbaar, ook als de instelling nooit is opgeslagen", async () => {
    // The two calendars ask for this key on every load. Whether the row exists
    // depends on the database; either way the answer must parse.
    const res = await admin.get("/api/app-settings/key/calendar_settings");

    expect(res.status).toBe(200);
    expect(res.text).not.toBe("");
    expect(() => JSON.parse(res.text)).not.toThrow();
  });
});
