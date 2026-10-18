import { storage } from "../../storage";

/**
 * Security review 2026-10-18 (Hoog 2): who may open the live (Socket.IO) connection.
 *
 * The handshake used to accept any session whose `passport.user` held *something*. The customer
 * portal stores its sessions in the same table, signed with the same secret, as
 * `passport.user = { kind: "portal", id }`; a customer who renamed his own `portal.sid` cookie to
 * `connect.sid` was let in and heard every staff broadcast (other customers' names, messages,
 * driver changes). Only a staff session carries a plain numeric user id, and that user must still
 * exist and be active.
 *
 * Returns the staff user id, or null when the connection must be refused.
 */
export async function staffUserIdForSocket(passportUser: unknown): Promise<number | null> {
  const id = typeof passportUser === "number" ? passportUser
    : typeof passportUser === "string" && /^\d+$/.test(passportUser) ? Number(passportUser)
    : NaN;
  if (!Number.isInteger(id) || id <= 0) return null;
  try {
    const user = await storage.getUser(id);
    return user && user.active !== false ? id : null;
  } catch {
    return null;
  }
}
