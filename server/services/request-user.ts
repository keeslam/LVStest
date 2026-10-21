/**
 * Kees, 2026-10-21 — who is making this request, for code deep down that has no `req`:
 * the contract renderer prints the signature of the staff member who generates the
 * contract ("Handtekening verhuurder"), and a contract is generated from several routes
 * and services. Set once per request by `requestUserContext` (mounted with the staff
 * routers, after authentication).
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { NextFunction, Request, Response } from "express";

const storage = new AsyncLocalStorage<{ userId: number | null }>();

export function requestUserContext(req: Request, _res: Response, next: NextFunction): void {
  storage.run({ userId: (req.user as { id?: number } | undefined)?.id ?? null }, next);
}

/** The signed-in staff member of the current request, or null (scheduler, portal, tests). */
export function currentRequestUserId(): number | null {
  return storage.getStore()?.userId ?? null;
}
