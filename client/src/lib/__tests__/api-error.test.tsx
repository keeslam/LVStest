/**
 * A-19-5 (audit 2026-10-09, module 19): error toasts showed the raw wire text
 * ("500: {...}", "Vehicle not found"). The server's text is English and
 * technical; the client speaks by stable `code` and, failing that, by HTTP
 * status. Runs in the jsdom project with the real nl/en locale files.
 */
import { describe, it, expect, afterEach } from "vitest";
import i18n from "@/i18n";
import { parseApiError, describeApiError } from "@/lib/api-error";
import { RequestTimeoutError } from "@/lib/request-policy";

function apiError(status: number, body: Record<string, unknown> | string, extra: Record<string, unknown> = {}) {
  // Same shape throwIfResNotOk produces: message "<status>: <text>", the JSON
  // body merged on top (so a string `message` replaces the prefixed text) and
  // httpStatus set last.
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const error = new Error(`${status}: ${raw}`) as Error & Record<string, unknown>;
  if (typeof body !== "string") Object.assign(error, body);
  error.httpStatus = status;
  Object.assign(error, extra);
  return error;
}

afterEach(async () => {
  await i18n.changeLanguage("nl");
});

describe("parseApiError", () => {
  it("reads status, code and message from a thrown API error", () => {
    const parsed = parseApiError(apiError(409, { message: "Vehicle already exists", code: "DUPLICATE_PLATE" }));
    expect(parsed).toMatchObject({ status: 409, code: "DUPLICATE_PLATE", message: "Vehicle already exists" });
  });

  it("recovers the JSON message when only the prefixed raw text is left", () => {
    const error = new Error('500: {"message":"Boom","code":"X_FAILED"}');
    expect(parseApiError(error)).toMatchObject({ status: 500, code: "X_FAILED", message: "Boom" });
  });

  it("falls back to the status prefix when httpStatus is absent", () => {
    expect(parseApiError(new Error("404: Vehicle not found")).status).toBe(404);
  });

  it("copes with things that are not errors", () => {
    expect(parseApiError("nope")).toMatchObject({ status: null, code: null });
    expect(parseApiError(undefined)).toMatchObject({ status: null, code: null });
  });

  it("recognises a timeout", () => {
    expect(parseApiError(new RequestTimeoutError()).timedOut).toBe(true);
  });
});

describe("describeApiError", () => {
  it("never shows the raw JSON of a 500", () => {
    const text = describeApiError(apiError(500, { error: "Failed to download app code", details: "Command failed: tar" }));
    expect(text).not.toMatch(/[{}]/);
    expect(text).not.toMatch(/Command failed|500:/);
    expect(text).toMatch(/server/i);
  });

  it("does not echo English server text for an unknown code or status", () => {
    const text = describeApiError(apiError(404, { message: "Vehicle not found" }));
    expect(text).not.toBe("Vehicle not found");
    expect(text).toMatch(/niet gevonden/i);
  });

  it("translates a known code", () => {
    const text = describeApiError(apiError(400, { message: "Current password is incorrect", code: "CURRENT_PASSWORD_INCORRECT" }));
    expect(text).toBe("Het huidige wachtwoord klopt niet.");
  });

  it("has a sentence for every status the app meets", () => {
    for (const status of [400, 401, 403, 404, 409, 413, 429, 500, 502, 503]) {
      const text = describeApiError(apiError(status, { message: "English" }));
      expect(text, String(status)).not.toBe("English");
      expect(text, String(status)).not.toMatch(/^errors\./);
    }
  });

  it("uses the caller's fallback for a plain failure, not for a refusal", () => {
    expect(describeApiError(apiError(500, { message: "x" }), undefined, "Kon de boeking niet opslaan.")).toBe("Kon de boeking niet opslaan.");
    expect(describeApiError(apiError(403, { message: "x" }), undefined, "Kon de boeking niet opslaan.")).toMatch(/recht/i);
  });

  it("describes a timeout and a dropped connection", () => {
    expect(describeApiError(new RequestTimeoutError())).toMatch(/niet op tijd/i);
    expect(describeApiError(new TypeError("Failed to fetch"))).toMatch(/verbinding/i);
  });

  it("follows the language", async () => {
    await i18n.changeLanguage("en");
    expect(describeApiError(apiError(404, { message: "Vehicle not found" }))).toMatch(/not found/i);
  });
});
