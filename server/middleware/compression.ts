/**
 * besluiten.md **B-19** (BUG-214) — HTTP compression, in the application
 * itself.
 *
 * Phase 36 measured `GET /api/vehicles` at 8 MB, `/api/reservations` at
 * 4.25 MB and `/api/customers` at 1.65 MB, all of them uncompressed: there was
 * no middleware, no dependency in package.json and no `content-encoding` on
 * any response. The same bodies gzipped are 27 to 28 times smaller.
 *
 * The decision is explicit that this must not depend on what the proxy does —
 * and equally explicit that the work is skipped when the proxy already did it.
 */
import compression from "compression";
import type { Express, Request, Response } from "express";

/**
 * Whether this response is ours to compress.
 *
 * - A response that already carries `Content-Encoding` was compressed
 *   upstream (or by the handler itself); compressing it again would produce a
 *   body no client can read.
 * - `x-no-compression` is `compression`'s own documented opt-out, kept so a
 *   caller streaming a file can ask for the bytes untouched.
 * - Everything else falls through to the library's content-type filter, which
 *   already leaves images, video and archives alone.
 */
export function shouldCompressResponse(req: Request, res: Response): boolean {
  if (res.getHeader && res.getHeader("Content-Encoding")) return false;
  if (req.headers?.["x-no-compression"]) return false;
  return true;
}

/**
 * Mounts compression as early as possible: it wraps `res.write`/`res.end`, so
 * it has to be in front of the routes whose responses it should shrink.
 *
 * `threshold` is the library default, spelled out because it is the other half
 * of the decision: a 200-byte JSON answer costs more in CPU and in the gzip
 * header than it saves, so small responses go out as they are.
 */
export function mountCompression(app: Express): void {
  app.use(
    compression({
      threshold: 1024,
      filter: (req, res) => {
        if (!shouldCompressResponse(req as Request, res as Response)) return false;
        return compression.filter(req, res);
      },
    }),
  );
}
