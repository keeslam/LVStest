/**
 * An API address that does not exist answers with a JSON 404, not with the app.
 *
 * Reported from the running application: "Antwoord van de server is geen JSON".
 * Every request under /api that no route claims fell through to the single-page
 * app's catch-all and came back as `index.html` with status 200. The client
 * then tried to read that page as JSON. Because the status was 200, nothing in
 * the network tab looked wrong and the server log showed nothing either — the
 * one place the failing address was named was the browser console.
 *
 * Now the server answers such a request itself: status 404, a JSON body that
 * names the method and path, and a line in the server log. A missing route is
 * visible at once, on both sides.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { agentFor, anonAgent, cleanupFixtureUsers, type TestAgent } from "./helpers/app";

describe("een onbekend API-adres geeft een JSON-404", () => {
  let admin: TestAgent;

  beforeAll(async () => {
    admin = await agentFor("admin");
  });
  afterAll(cleanupFixtureUsers);

  it("een ingelogde gebruiker krijgt 404 met JSON, niet de HTML-pagina van de app", async () => {
    const res = await admin.get("/api/dit-adres-bestaat-niet");

    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.text).not.toMatch(/<!DOCTYPE html>/i);
    expect(res.body.message).toMatch(/dit-adres-bestaat-niet/);
  });

  it("noemt de methode, zodat een POST op een GET-adres herkenbaar is", async () => {
    const res = await admin.post("/api/nog-een-onbekend-adres").send({});

    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body.message).toMatch(/POST/);
  });

  it("een bestaand adres blijft gewoon werken", async () => {
    const res = await admin.get("/api/user");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });

  it("een niet-ingelogde bezoeker krijgt ook geen HTML op een onbekend API-adres", async () => {
    const anon = await anonAgent();
    const res = await anon.get("/api/dit-adres-bestaat-ook-niet");

    expect(res.text).not.toMatch(/<!DOCTYPE html>/i);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });
});
