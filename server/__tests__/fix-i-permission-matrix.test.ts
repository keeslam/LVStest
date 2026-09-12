/**
 * FIX-I — the default-deny net (remediation plan §3, FIX-I).
 *
 * Eleven separate bugs in this audit were the same mistake: a route registered
 * with `requireAuth` and no `hasPermission(...)`, or with no middleware at all.
 * This test walks the *real* router stack at runtime and fails on any
 * registration that is neither permission-guarded nor listed below. Adding a
 * new route without a permission check is therefore a failing test, not a
 * twelfth bug.
 *
 * Scope: everything `setupAuth()` + `registerRoutes()` mount, which is where
 * all eleven bugs were. The handful of `app.use('/api/...', router)` mounts in
 * server/index.ts already carry `hasPermission(...)` on the mount itself.
 */
import { describe, it, expect } from "vitest";
import { makeApp } from "./helpers/app";

/** Reachable with no session at all. Keep this list as short as it is. */
const PUBLIC_ROUTES = new Set([
  "POST /api/login",
  "POST /api/logout",
  "GET /api/user", // answers 401 without a session; the client polls it
  "GET /api", // the API banner
]);

/**
 * Authenticated, but deliberately not permission-gated: self-service, or a
 * read every staff screen needs. Each entry is a decision, not an oversight.
 */
const AUTHENTICATED_ONLY_ROUTES = new Set([
  "POST /api/session/heartbeat",
  "POST /api/reauthenticate",
  "PATCH /api/users/:id", // self-service profile; role/permissions are guarded inside (BUG-001)
  "POST /api/users/change-password", // own password, old password required
  // (The six /api/contracts/* routes used to live here. Besluit B-23 /
  // BUG-167 moved them onto view_documents / manage_documents; they are now
  // permission-guarded like everything else, which is what makes the
  // view_vehicles-only account lose its 200 on contracts/data.)
  // Contract numbering reads, used by the pickup dialog.
  "GET /api/settings/next-contract-number",
  "GET /api/settings/check-contract-number/:contractNumber",
  "GET /api/settings/contract-number-conflicts/:proposedNumber",
  // Application configuration reads with nothing secret in them; the SMTP
  // password is redacted by app-settings.ts and the writes are gated.
  "GET /api/app-settings",
  "GET /api/app-settings/key/:key",
  "GET /api/system-settings",
  "GET /api/damage-check-fields",
  "GET /api/damage-check-fields/header",
  // Template reads used to render screens; the mutations are gated.
  "GET /api/vehicle-diagram-templates",
  "GET /api/vehicle-diagram-templates/:id",
  "GET /api/vehicle-diagram-templates/match/:vehicleId",
  "GET /api/vehicle-diagram-templates/:id/image",
  "GET /api/barcode-label-templates",
  "GET /api/barcode-label-templates/default",
  "GET /api/barcode-label-templates/:id",
  // Inert Replit sidecar passthrough; requireAuth added by BUG-051.
  "GET /object-storage/*",
]);

interface Registration {
  key: string;
  handlers: string[];
}

function collectRoutes(app: any): Registration[] {
  const seen = new Map<string, Registration>();
  for (const layer of app._router.stack) {
    if (!layer.route) continue;
    const methods = Object.keys(layer.route.methods).filter((m) => layer.route.methods[m]);
    const handlers = layer.route.stack.map((s: any) => s.name || "(anonymous)");
    for (const method of methods) {
      const key = `${method.toUpperCase()} ${layer.route.path}`;
      // setupAuth() runs twice (index.ts and registerRoutes both call it), so
      // the same registration can appear more than once; the first wins.
      if (!seen.has(key)) seen.set(key, { key, handlers });
    }
  }
  return [...seen.values()];
}

const isPermissionGuarded = (r: Registration) =>
  r.handlers.includes("hasPermissionMiddleware") || r.handlers.includes("requireAdmin");
const isAuthGuarded = (r: Registration) =>
  isPermissionGuarded(r) || r.handlers.includes("requireAuth");

describe("FIX-I — default deny over the whole router", () => {
  it("every route is permission-guarded or explicitly listed", async () => {
    const app = await makeApp();
    const ungated = collectRoutes(app)
      .filter((r) => !isPermissionGuarded(r))
      .filter((r) => !PUBLIC_ROUTES.has(r.key) && !AUTHENTICATED_ONLY_ROUTES.has(r.key))
      .map((r) => `${r.key}  ::  ${r.handlers.join(" > ")}`);

    expect(ungated, `routes with no hasPermission() and no allowlist entry:\n${ungated.join("\n")}`).toEqual([]);
  }, 60_000);

  it("nothing outside the public allowlist is reachable without a session", async () => {
    const app = await makeApp();
    const anonymous = collectRoutes(app)
      .filter((r) => !isAuthGuarded(r))
      .filter((r) => !PUBLIC_ROUTES.has(r.key))
      .map((r) => `${r.key}  ::  ${r.handlers.join(" > ")}`);

    expect(anonymous, `routes with no auth middleware at all:\n${anonymous.join("\n")}`).toEqual([]);
  }, 60_000);

  it("the allowlists themselves stay small", async () => {
    // A guard against the easy fix: silencing the test by growing the list.
    expect(PUBLIC_ROUTES.size).toBeLessThanOrEqual(6);
    expect(AUTHENTICATED_ONLY_ROUTES.size).toBeLessThanOrEqual(24);
  });
});
