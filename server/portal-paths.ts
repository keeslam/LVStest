// Single definition of "is this request part of the customer portal", used by
// the staff auth stack (to step aside), the frame headers and the CSRF setup.
const PAGE_PREFIX = "/portaal";
const API_PREFIX = "/api/portal";

// Security review 2026-10-18 (Middel 4): Express matches routes without regard to case, so
// "/API/PORTAL/…" reaches the portal routes. This check has to agree, or the staff session stack
// would run on that path and a staff login would be read as the portal account with the same id.
function matches(path: string, prefix: string): boolean {
  const lower = path.toLowerCase();
  return lower === prefix || lower.startsWith(prefix + "/");
}

export function isPortalApiPath(path: string): boolean {
  return matches(path, API_PREFIX);
}

export function isPortalPath(path: string): boolean {
  return matches(path, PAGE_PREFIX) || isPortalApiPath(path);
}
