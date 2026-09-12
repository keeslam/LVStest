import express, { type Express, type RequestHandler } from "express";
import path from "path";
import { UserPermission } from "../../shared/schema";
import { hasPermission } from "./permissions.js";
import { getUploadsDir, getUploadsRoot } from "../../shared/paths";

/**
 * The static `/uploads` mount, in one place.
 *
 * Gated behind `requireAuth`: these files include customer contracts,
 * damage-check photos and licence scans, which must never be reachable by an
 * unauthenticated request that merely guesses or obtains a file path.
 *
 * BUG-085: `requireAuth` alone meant every logged-in employee — a cleaner, a
 * kiosk account — could fetch any contract, damage photo or driving-licence
 * scan by guessing or reading a path out of an API response it was allowed to
 * see, bypassing the per-customer scoping of the portal routes entirely. The
 * mount also demands `manage_documents`; the scoped download routes
 * (/api/documents/view|download) remain the intended way in, and no client
 * code links to /uploads at all.
 *
 * BUG-026/FIX-B: the directory used to be `path.join(process.cwd(), 'uploads')`
 * while every upload route wrote to `getUploadsDir()`. With `UPLOADS_DIR` set —
 * the production and Coolify shape — express.static then served a *different*
 * tree, so a direct `/uploads/<path>` link fell through to the SPA catch-all
 * and answered **200 with index.html** instead of the file. `getUploadsDir()`
 * is the single owner, and the assertion below makes a future divergence fail
 * loudly at start-up rather than silently serve the wrong bytes.
 *
 * Extracted out of server/index.ts so the route tests — which build the app
 * without index.ts' listener and schedulers — mount the very same thing, and
 * so there is exactly one definition of where /uploads points.
 */
export function mountUploads(app: Express, requireAuth: RequestHandler): string {
  const uploadsPath = getUploadsDir();
  if (path.resolve(uploadsPath) !== getUploadsRoot()) {
    throw new Error(
      `Uploads mount ${uploadsPath} does not match the configured uploads root ${getUploadsRoot()}`
    );
  }
  app.use(
    "/uploads",
    requireAuth,
    hasPermission(UserPermission.MANAGE_DOCUMENTS),
    express.static(uploadsPath)
  );
  return uploadsPath;
}
