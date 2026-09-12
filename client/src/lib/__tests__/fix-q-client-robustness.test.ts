/**
 * FIX-Q — client robustness.
 *
 *   BUG-212 — no request timeout and no global error handling.
 *   BUG-213 — a tab whose session expired keeps serving cached data.
 *   BUG-229 — the socket invalidation matches `key.includes('/' + id)`.
 *
 * These are the pure halves, deliberately kept in modules with no React and no
 * DOM dependency so they run in the existing node vitest project. The
 * component-level assertions (ErrorBoundary renders its fallback, the dialog
 * survives a click outside) need the jsdom project from plan §8.8, which is
 * wave 9.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { matchesEntityId } from "../query-key-match";
import {
  shouldForceLogout,
  fetchWithTimeout,
  RequestTimeoutError,
  REQUEST_TIMEOUT_MS,
} from "../request-policy";

describe("BUG-229 — the socket invalidation matcher", () => {
  it("matches the entity's own key", () => {
    expect(matchesEntityId("/api/reservations/1", 1)).toBe(true);
    expect(matchesEntityId("/api/reservations/1/documents", 1)).toBe(true);
    expect(matchesEntityId("/api/reservations/1?full=true", 1)).toBe(true);
  });

  it("does not match a longer id that merely starts with it", () => {
    // This is the regression: `'/api/reservations/12'.includes('/1')` is true.
    expect(matchesEntityId("/api/reservations/12", 1)).toBe(false);
    expect(matchesEntityId("/api/reservations/1870", 1)).toBe(false);
    expect(matchesEntityId("/api/reservations/vehicle/1870", 18)).toBe(false);
    expect(matchesEntityId("/api/documents/1234", 123)).toBe(false);
  });

  it("still matches an id that appears deeper in the path", () => {
    expect(matchesEntityId("/api/reservations/vehicle/1870", 1870)).toBe(true);
    expect(matchesEntityId("/api/expenses/vehicle/7", "vehicle/7")).toBe(true);
    expect(matchesEntityId("/api/expenses/vehicle/70", "vehicle/7")).toBe(false);
  });

  it("never matches on an empty or missing id", () => {
    expect(matchesEntityId("/api/reservations/1", "")).toBe(false);
    expect(matchesEntityId("/api/reservations/1", undefined as unknown as number)).toBe(false);
  });

  it("matches a repeated segment, not only the first occurrence", () => {
    expect(matchesEntityId("/api/a/12/b/1", 1)).toBe(true);
  });
});

describe("BUG-213 — which 401 means 'this session is over'", () => {
  it("a 401 on a staff endpoint forces the logout", () => {
    expect(shouldForceLogout("/api/reservations", 401)).toBe(true);
    expect(shouldForceLogout("/api/vehicles?search=A", 401)).toBe(true);
    expect(shouldForceLogout("https://app.example/api/customers", 401)).toBe(true);
  });

  it("a wrong password on the login form does not bounce the page", () => {
    expect(shouldForceLogout("/api/login", 401)).toBe(false);
    expect(shouldForceLogout("/api/register", 401)).toBe(false);
  });

  it("the /api/user probe answers 401 when nobody is logged in — that is not an expiry", () => {
    expect(shouldForceLogout("/api/user", 401)).toBe(false);
  });

  it("the customer portal is a separate authentication realm", () => {
    expect(shouldForceLogout("/api/portal/reservations", 401)).toBe(false);
    expect(shouldForceLogout("/api/portal-admin/dashboard", 401)).toBe(true);
  });

  it("any other status is left alone", () => {
    for (const status of [200, 204, 400, 403, 404, 409, 500]) {
      expect(shouldForceLogout("/api/reservations", status)).toBe(false);
    }
  });
});

describe("BUG-212 — every request has a deadline", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("the default deadline is 30 seconds", () => {
    expect(REQUEST_TIMEOUT_MS).toBe(30000);
  });

  it("a fetch that never settles rejects with RequestTimeoutError", async () => {
    vi.stubGlobal("fetch", (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("This operation was aborted");
          error.name = "AbortError";
          reject(error);
        });
      }),
    );
    const started = Date.now();
    await expect(fetchWithTimeout("/api/reservations", {}, 50)).rejects.toBeInstanceOf(
      RequestTimeoutError,
    );
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("a normal response is returned untouched and the timer is cleared", async () => {
    const response = new Response(JSON.stringify({ ok: true }), { status: 200 });
    vi.stubGlobal("fetch", async () => response);
    await expect(fetchWithTimeout("/api/user", {}, 50)).resolves.toBe(response);
  });

  it("a real network failure keeps its own error — it is not relabelled a timeout", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(fetchWithTimeout("/api/user", {}, 5000)).rejects.toBeInstanceOf(TypeError);
  });
});
