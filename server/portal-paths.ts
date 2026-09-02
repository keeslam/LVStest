// Single definition of "is this request part of the customer portal", used by
// the staff auth stack (to step aside), the frame headers and the CSRF setup.
const PAGE_PREFIX = "/portaal";
const API_PREFIX = "/api/portal";

function matches(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + "/");
}

export function isPortalApiPath(path: string): boolean {
  return matches(path, API_PREFIX);
}

export function isPortalPath(path: string): boolean {
  return matches(path, PAGE_PREFIX) || isPortalApiPath(path);
}
