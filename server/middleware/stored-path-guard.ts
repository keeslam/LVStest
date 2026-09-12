/**
 * BUG-070, the half phase 36 found still open.
 *
 * The *delete* half was closed in an earlier wave: `unlinkStoredFile()` now
 * resolves every stored path through `assertWithinUploads()`, so a file
 * outside the uploads root survives the removal of a template background. The
 * *accept* half was not: `PATCH /api/pdf-templates/2` with
 * `backgroundPath: "../../AUDIT-P36B-canary.txt"` answered 200 and stored that
 * value, and `PUT /api/damage-check-templates/1` did the same.
 *
 * A path column is filled by the upload routes, from a file the server itself
 * just wrote. A path arriving in a request body that does not resolve inside
 * the uploads root is therefore never legitimate — it is a value aimed at
 * whatever code path picks it up next. Refuse it at the door, on all four
 * template families, for create and update alike.
 *
 * Clearing stays allowed (`null` / `""`): that is how a background is removed.
 */
import type { Request, Response, NextFunction, RequestHandler } from "express";
import path from "path";
import { getUploadsDir, isInsideUploads } from "../../shared/paths";

/** The `*_path` columns a client is able to reach on these routes. */
export const GUARDED_PATH_FIELDS = [
  "backgroundPath",
  "backgroundPreviewPath",
  "templatePreviewPath",
  "previewPath",
  "diagramPath",
  "filePath",
] as const;

/**
 * True when `value` is something this application would itself have stored: an
 * empty value (clearing the column) or a path that resolves inside the uploads
 * root, whether it is written uploads-relative, with the historic `uploads/`
 * prefix, or absolute.
 */
export function isSafeStoredPathValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value !== "string") return false;
  const raw = value.trim();
  if (raw === "") return true;
  if (raw.includes("\0")) return false;

  const uploadsDir = getUploadsDir();
  const candidates: string[] = [];
  if (path.isAbsolute(raw) || path.win32.isAbsolute(raw)) {
    candidates.push(raw);
  } else {
    candidates.push(path.join(uploadsDir, raw));
    if (raw.startsWith("uploads/") || raw.startsWith("uploads\\")) {
      candidates.push(path.join(uploadsDir, raw.slice("uploads/".length)));
    }
  }
  return candidates.some((candidate) => {
    try {
      return isInsideUploads(path.resolve(candidate));
    } catch {
      return false;
    }
  });
}

/** The offending field names in a request body, in order. */
export function unsafeStoredPathFields(body: unknown): string[] {
  if (!body || typeof body !== "object" || Array.isArray(body)) return [];
  const record = body as Record<string, unknown>;
  return GUARDED_PATH_FIELDS.filter((field) => field in record && !isSafeStoredPathValue(record[field]));
}

/**
 * Refuses a create/update whose body carries a stored-file path pointing
 * outside the uploads root. Mounted on the template route prefixes, so all
 * four families are covered by one rule instead of four copies of it.
 */
export const storedPathGuard: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "DELETE") return next();
  const offending = unsafeStoredPathFields(req.body);
  if (offending.length === 0) return next();
  console.error(
    `[paths] refused ${req.method} ${req.path}: ${offending
      .map((f) => `${f}=${String((req.body as any)[f]).slice(0, 120)}`)
      .join(", ")} — outside the uploads directory`,
  );
  return res.status(400).json({
    message: "Invalid file path",
    code: "PATH_OUTSIDE_UPLOADS",
    errors: offending.map((field) => ({
      field,
      message: "That file path is not inside the uploads directory. Upload the file instead of naming a path.",
    })),
  });
};

/** The route prefixes the guard is mounted on — the four template families. */
export const TEMPLATE_ROUTE_PREFIXES = [
  "/api/pdf-templates",
  "/api/damage-check-templates",
  "/api/vehicle-diagram-templates",
  "/api/transport-report-templates",
  "/api/barcode-label-templates",
];
