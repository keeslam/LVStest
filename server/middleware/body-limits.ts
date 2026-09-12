/**
 * FIX-T (BUG-218) — per-route request-body limits.
 *
 * `express.json({ limit: '50mb' })` was mounted globally, so any authenticated
 * caller could post a 20 MB body to any route and have it fully buffered,
 * JSON-parsed and walked by the input sanitizer *before* a single validation
 * ran: phase 19 measured +100 MB RSS for one such request, still held five
 * seconds later, on a route that answered 400.
 *
 * Nothing in this application legitimately posts a megabyte of JSON except the
 * screens that carry base64 images — the interactive damage check (a ~1.3 MB
 * diagram plus two signature PNGs) and the damage-check/PDF template editors
 * (an exported template may embed its background). Those paths keep a large
 * limit; everything else gets 1 MB and a 413.
 *
 * Order matters: body-parser sets `req._body` once it has parsed, and every
 * later parser no-ops, so mounting the large parsers on their paths first and
 * the small one afterwards gives each route exactly one limit.
 *
 * Mounted from `server/index.ts` and from the test harness, so the limit under
 * test is the limit in production.
 */
import express, { type Express } from "express";

/** Routes whose bodies legitimately carry base64 images. */
export const LARGE_BODY_PATHS = [
  "/api/interactive-damage-checks",
  "/api/damage-check-templates",
  "/api/pdf-templates",
  "/api/barcode-label-templates",
  "/api/transport-report-templates",
] as const;

export const LARGE_BODY_LIMIT = "25mb";
export const DEFAULT_BODY_LIMIT = "1mb";

export function mountBodyParsers(app: Express): void {
  for (const path of LARGE_BODY_PATHS) {
    app.use(path, express.json({ limit: LARGE_BODY_LIMIT }));
    app.use(path, express.urlencoded({ extended: false, limit: LARGE_BODY_LIMIT }));
  }
  app.use(express.json({ limit: DEFAULT_BODY_LIMIT }));
  app.use(express.urlencoded({ extended: false, limit: DEFAULT_BODY_LIMIT }));
}
