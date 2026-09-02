/**
 * Globally attaches the CSRF token to every same-origin, state-changing
 * fetch() call, instead of relying on each call site to remember to do it.
 *
 * The server enforces CSRF verification on all POST/PUT/PATCH/DELETE routes
 * (see server/middleware/security/csrf.ts). apiRequest() in queryClient.ts
 * already attaches the header for its own callers, but a number of file
 * upload flows and legacy call sites use raw fetch() directly — patching
 * window.fetch once here covers all of them (current and future) without
 * having to find and edit every call site individually.
 *
 * Imported once, for its side effect, at the very top of main.tsx.
 */

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function getCsrfTokenFromCookie(pathname: string): string | null {
  // The customer portal runs on its own session and its own CSRF cookie.
  const name = pathname === "/api/portal" || pathname.startsWith("/api/portal/") ? "PORTAL-XSRF-TOKEN" : "XSRF-TOKEN";
  const match = document.cookie.match(new RegExp(`${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function pathnameOf(input: RequestInfo | URL): string {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  try {
    return new URL(url, window.location.origin).pathname;
  } catch {
    return "";
  }
}

function isSameOriginApiRequest(input: RequestInfo | URL): boolean {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  try {
    const resolved = new URL(url, window.location.origin);
    return resolved.origin === window.location.origin && resolved.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

const originalFetch = window.fetch.bind(window);

window.fetch = ((input: RequestInfo | URL, init: RequestInit = {}) => {
  const method = (init.method || (input instanceof Request ? input.method : "GET") || "GET").toUpperCase();

  if (!MUTATING_METHODS.has(method) || !isSameOriginApiRequest(input)) {
    return originalFetch(input, init);
  }

  const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
  if (!headers.has("X-CSRF-Token")) {
    const token = getCsrfTokenFromCookie(pathnameOf(input));
    if (token) {
      headers.set("X-CSRF-Token", token);
    }
  }

  return originalFetch(input, {
    ...init,
    headers,
    credentials: init.credentials ?? "include",
  });
}) as typeof window.fetch;
