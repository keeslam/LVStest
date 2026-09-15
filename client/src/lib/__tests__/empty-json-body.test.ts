/**
 * An empty 200 must not take a screen down.
 *
 * Reported from the running application: both calendars showed "Failed to
 * execute 'json' on 'Response': Unexpected end of JSON input". The cause was a
 * route answering 200 with zero bytes (`res.json(undefined)`), and the query
 * function calling `res.json()` on it unconditionally. The route is fixed, but
 * any `res.json(someUndefinedValue)` anywhere else would do it again, so the
 * reader treats an empty body as "no data" instead of throwing.
 *
 * A body that is present but malformed still throws — that is a real defect and
 * must stay visible.
 */
import { describe, it, expect } from "vitest";
import { readJsonBody } from "../read-json-body";

function response(body: string, init: ResponseInit = {}): Response {
  return new Response(body, { status: 200, ...init });
}

describe("readJsonBody", () => {
  it("leest een gewoon JSON-antwoord", async () => {
    await expect(readJsonBody(response('{"a":1}'))).resolves.toEqual({ a: 1 });
  });

  it("geeft null bij een leeg antwoord in plaats van een fout", async () => {
    await expect(readJsonBody(response(""))).resolves.toBeNull();
  });

  it("geeft null bij een antwoord dat alleen witruimte bevat", async () => {
    await expect(readJsonBody(response("\n  "))).resolves.toBeNull();
  });

  it("geeft null bij 204 zonder inhoud", async () => {
    await expect(readJsonBody(new Response(null, { status: 204 }))).resolves.toBeNull();
  });

  it("leest JSON null als null", async () => {
    await expect(readJsonBody(response("null"))).resolves.toBeNull();
  });

  it("werpt wel bij een kapotte body, want dat is een echt defect", async () => {
    await expect(readJsonBody(response("{oeps"))).rejects.toThrow();
  });

  it("noemt de URL in de fout, zodat je weet welk endpoint het is", async () => {
    const res = response("<!DOCTYPE html>");
    Object.defineProperty(res, "url", { value: "http://x/api/kapot" });
    await expect(readJsonBody(res)).rejects.toThrow(/\/api\/kapot/);
  });
});
