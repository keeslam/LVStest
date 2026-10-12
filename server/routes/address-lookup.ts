import type { Express, Request, Response } from "express";
import { z } from "zod";
import { lookupDutchAddress } from "../services/address-lookup";
import { addressLookupLimiter } from "../middleware/security/rateLimiter.js";
import type { RouteDeps } from "./deps";

const querySchema = z.object({
  postcode: z.string().trim().min(1).max(10),
  number: z.string().trim().regex(/^\d{1,5}$/),
  addition: z.string().trim().max(6).optional().default(""),
});

/**
 * One handler for both realms: the staff app (`/api/address-lookup`, staff session) and the customer
 * portal (`/api/portal/address-lookup`, portal session). An unknown address is a normal 200 with
 * `found: false`; only an unreachable lookup service is an error (502), and the forms then just let the
 * user type the address.
 */
export async function addressLookupHandler(req: Request, res: Response): Promise<void> {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ message: "Postcode and house number are required", code: "ADDRESS_LOOKUP_INVALID" }); return; }
  try {
    res.json(await lookupDutchAddress({ postcode: parsed.data.postcode, number: parsed.data.number, addition: parsed.data.addition }));
  } catch (error) {
    console.error("address lookup failed:", error instanceof Error ? error.message : error);
    res.status(502).json({ message: "Address lookup is not available right now", code: "ADDRESS_LOOKUP_UNAVAILABLE" });
  }
}

/** Staff side. */
export function registerAddressLookupRoutes(app: Express, deps: RouteDeps): void {
  app.get("/api/address-lookup", deps.requireAuth, addressLookupLimiter, addressLookupHandler);
}
