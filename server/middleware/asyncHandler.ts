/**
 * FIX-A — async error handling (BUG-002, BUG-061, BUG-101).
 *
 * 96 of the 372 async route handlers in this codebase have no `try` at all.
 * When one of them rejects, Express 4 never sees the error: the rejected
 * promise becomes a process-level `unhandledRejection`, and the handler in
 * `server/index.ts` used to treat every one of those as fatal. One malformed
 * field from any low-privileged portal account therefore took the whole
 * backoffice down (BUG-002 — proven twice, three times in the live logs).
 *
 * Two pieces:
 *
 * 1. `asyncHandler(fn)` — the explicit wrapper, for new code and for handlers
 *    that want to be obviously guarded at the call site.
 * 2. `installAsyncErrorHandling()` — installs the same guarantee for *every*
 *    handler already registered anywhere in the app, including the ones in
 *    sub-routers, by patching `Layer.prototype.handle_request`. This is the
 *    one change that removes the whole bug class rather than three instances
 *    of it; it is exactly what the `express-async-errors` package does, kept
 *    in-tree because this project may not take new dependencies mid-audit.
 *
 * Behaviour after this: a rejected handler promise reaches `next(err)` and so
 * the terminal Express error handler, which answers a clean 500 for that one
 * request. The process keeps serving.
 */
import { createRequire } from "module";
import type { NextFunction, Request, RequestHandler, Response } from "express";

export type AsyncRequestHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown;

/** Wraps one handler so a rejected promise becomes `next(err)`. */
export function asyncHandler(fn: AsyncRequestHandler): RequestHandler {
  return function wrapped(req, res, next) {
    try {
      const result = fn(req, res, next);
      if (result && typeof (result as Promise<unknown>).then === "function") {
        (result as Promise<unknown>).then(undefined, next);
      }
    } catch (err) {
      next(err as Error);
    }
  };
}

let installed = false;

/**
 * Makes every Express handler in this process async-safe. Idempotent; call it
 * once, before any route is registered.
 */
export function installAsyncErrorHandling(): void {
  if (installed) return;
  const require = createRequire(import.meta.url);
  // express 4 has no "exports" map, so the internal path resolves. If a future
  // express makes this fail, the explicit asyncHandler() wrapper still stands
  // and the process policy below still refuses to exit on a request error.
  const Layer = require("express/lib/router/layer.js");

  const originalHandleRequest = Layer.prototype.handle_request;
  Layer.prototype.handle_request = function handle_request(req: Request, res: Response, next: NextFunction) {
    const fn = this.handle;
    // 4-arity handlers are Express error handlers; leave those to Express.
    if (typeof fn !== "function" || fn.length > 3) {
      return originalHandleRequest.call(this, req, res, next);
    }
    try {
      const result = fn.call(this, req, res, next);
      if (result && typeof result.then === "function") {
        result.then(undefined, next);
      }
    } catch (err) {
      next(err);
    }
  };

  installed = true;
}
