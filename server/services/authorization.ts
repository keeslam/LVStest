import type { Request } from "express";
import { storage } from "../storage";
import { comparePasswords } from "../auth";
import { UserRole, UserPermission } from "../../shared/schema";

// ============================================================================
// Old-rental admin password override
// ============================================================================
// After 3 weeks past the actual pickup date, non-admin users editing a
// reservation must enter an admin password to confirm the change (and trigger
// PDF regeneration). Admins bypass this check entirely.
const OLD_RENTAL_LOCK_DAYS = 21;

export function reservationIsOld(reservation: any | null | undefined): boolean {
  if (!reservation) return false;
  const pickup = reservation.actualPickupDate;
  if (!pickup) return false;
  const pickupTime = new Date(pickup).getTime();
  if (Number.isNaN(pickupTime)) return false;
  const ageMs = Date.now() - pickupTime;
  return ageMs > OLD_RENTAL_LOCK_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Verifies the supplied password matches any active admin user's password.
 * Returns true on match, false otherwise. Safe to fail silently.
 */
export async function verifyAdminPassword(password: string): Promise<boolean> {
  if (!password || typeof password !== "string") return false;
  try {
    const allUsers = await storage.getAllUsers();
    const admins = allUsers.filter(
      (u) => u.role === UserRole.ADMIN && (u as any).active !== false,
    );
    if (admins.length === 0) return false;
    const { comparePasswords } = await import("../auth");
    for (const admin of admins) {
      try {
        if (await comparePasswords(password, admin.password)) {
          return true;
        }
      } catch {
        // skip
      }
    }
  } catch (err) {
    console.error("[admin-override] Error verifying admin password:", err);
  }
  return false;
}

type MileageDecreaseAuthorization =
  | { ok: true; authorizedBy: string }
  | { ok: false; status: number; body: Record<string, any> };

/**
 * Single gate for lowering a vehicle's odometer reading, used by every route
 * that can write a lower mileage (pickup, vehicle update, mileage-only update).
 *
 * The caller confirms with their OWN account password and must hold the
 * `authorize_mileage_decrease` permission. That permission is checked strictly
 * against the stored permissions - unlike hasPermission(), an admin role is not
 * a free pass, so it can be revoked per user. Permissions are read from the
 * database so a revoked right applies without a new sign-in.
 */
export async function authorizeMileageDecrease(
  req: Request,
  overridePassword: unknown,
  context: { oldMileage: number; newMileage: number },
): Promise<MileageDecreaseAuthorization> {
  const sessionUser = (req as any).user;
  if (!sessionUser) {
    return { ok: false, status: 401, body: { message: "User not authenticated" } };
  }

  if (!overridePassword || typeof overridePassword !== "string") {
    return {
      ok: false,
      status: 400,
      body: {
        message: `Mileage decrease detected (${context.newMileage} < ${context.oldMileage}). Override authorization required.`,
        requiresOverride: true,
      },
    };
  }

  const user = await storage.getUser(sessionUser.id);
  if (!user) {
    return { ok: false, status: 401, body: { message: "User not authenticated" } };
  }

  if (!(user.permissions || []).includes(UserPermission.AUTHORIZE_MILEAGE_DECREASE)) {
    return {
      ok: false,
      status: 403,
      body: {
        message: "Not authorized. The 'authorize_mileage_decrease' permission is required.",
        code: "MILEAGE_OVERRIDE_FORBIDDEN",
      },
    };
  }

  if (!(await comparePasswords(overridePassword, user.password))) {
    return {
      ok: false,
      status: 403,
      body: { message: "Invalid override password", code: "MILEAGE_OVERRIDE_INVALID_PASSWORD" },
    };
  }

  console.log(
    `✅ Mileage decrease authorized by ${user.username}: ${context.newMileage} km (was ${context.oldMileage} km)`,
  );
  return { ok: true, authorizedBy: user.username };
}

