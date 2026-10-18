import { Router } from "express";
import { listSignaturesForReservation } from "../services/contract-signing";

/**
 * Staff side of signing in the portal (Kees, 2026-10-18): the audit trail of every portal signature
 * on a reservation, with a fresh check that the original and the signed PDF are still the files
 * that were signed. Mounted by mountStaffRouters() behind requireAuth + the document permissions.
 */
const router = Router();

router.get("/reservation/:reservationId", async (req, res) => {
  const reservationId = Number.parseInt(req.params.reservationId, 10);
  if (!Number.isInteger(reservationId) || reservationId <= 0) return res.status(400).json({ message: "Invalid reservation ID" });
  try {
    res.json(await listSignaturesForReservation(reservationId));
  } catch (error) {
    console.error("contract signatures lookup failed:", (error as Error).message);
    res.status(500).json({ message: "Failed to load signatures" });
  }
});

export default router;
