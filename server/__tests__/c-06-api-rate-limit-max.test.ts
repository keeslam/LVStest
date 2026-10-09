/**
 * Sub-project C, task 6: the budget of the general API limiter is 1000 requests
 * per 15 minutes per user - what production runs with - unless the E2E harness
 * raises it through API_RATE_LIMIT_MAX (e2e/support/serve.ts). A run of the
 * browser suite is one server process and one 15-minute window, and layer-a's
 * admin account ran out of budget once the dialog registry grew.
 */
import { describe, it, expect, afterEach } from "vitest";
import { apiRateLimitMax } from "../middleware/security/rateLimiter";

const original = process.env.API_RATE_LIMIT_MAX;

afterEach(() => {
  if (original === undefined) delete process.env.API_RATE_LIMIT_MAX;
  else process.env.API_RATE_LIMIT_MAX = original;
});

describe("apiRateLimitMax", () => {
  it("is 1000 when nothing is configured (production)", () => {
    delete process.env.API_RATE_LIMIT_MAX;
    expect(apiRateLimitMax()).toBe(1000);
    process.env.API_RATE_LIMIT_MAX = "  ";
    expect(apiRateLimitMax()).toBe(1000);
  });

  it("honours API_RATE_LIMIT_MAX", () => {
    process.env.API_RATE_LIMIT_MAX = "20000";
    expect(apiRateLimitMax()).toBe(20000);
  });

  it("falls back to 1000 for a value that is not a positive number, never to 0 or NaN", () => {
    for (const bad of ["abc", "0", "-5", "NaN"]) {
      process.env.API_RATE_LIMIT_MAX = bad;
      expect(apiRateLimitMax(), bad).toBe(1000);
    }
  });
});
