import path from "path";
import { E2E } from "./env";
import { PROFILES, ROLES, type Role } from "../seed/users";

export { ROLES, type Role };
export const authFile = (role: Role) => path.join(E2E.authDir, `${role}.json`);
/** May this role do something that needs one of these permissions? */
export const can = (role: Role, anyOf: readonly string[]) => role === "admin" || anyOf.some((permission) => PROFILES[role].includes(permission));
