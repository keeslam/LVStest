import { useAuth } from "@/hooks/use-auth";
import { UserRole } from "@shared/schema";

/**
 * Client-side mirror of the server's `hasPermission(...)` OR logic
 * (server/middleware/permissions.ts): true for role `admin`, which bypasses
 * every check server-side, else true when the signed-in user holds at least
 * one of the given permissions.
 *
 * Use this to gate a query with `enabled` before firing a request the server
 * would refuse anyway — see the four findings in
 * .superpowers/sdd/2026-09-20-e2e-browser-tests/task-6-report.md
 * ("Findings for the owner"), which is what pulled this out of
 * `useCanViewPortal` into a shared, generic hook.
 */
export function useHasPermission(...anyOf: string[]): boolean {
  const { user } = useAuth();
  if (user?.role === UserRole.ADMIN) return true;
  const perms = (user?.permissions as string[] | undefined) ?? [];
  return anyOf.some((permission) => perms.includes(permission));
}
