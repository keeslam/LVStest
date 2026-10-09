import path from "path";
import { E2E } from "./env";
import { ACCOUNTS, PROFILES, ROLES, TWINS, TWIN_OF, profileOf, type Account, type Role, type Twin } from "../seed/users";

export { ACCOUNTS, ROLES, TWINS, TWIN_OF, profileOf, type Account, type Role, type Twin };
/** The saved browser session of an account (written once per run by setup/auth.setup.ts). */
export const authFile = (account: Account) => path.join(E2E.authDir, `${account}.json`);
/** May this role do something that needs one of these permissions? (A twin answers like its profile.) */
export const can = (account: Account, anyOf: readonly string[]) => {
  const role = profileOf(account);
  return role === "admin" || anyOf.some((permission) => PROFILES[role].includes(permission));
};
