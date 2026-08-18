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

function getCsrfTokenFromCookie(): string | null {
  const match = document.cookie.match(/XSRF-TOKEN=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function isSameOriginApiRequest(input: RequestInfo): boolean {
  const url = typeof input === "string" ? input : input.url;
  try {
    const resolved = new URL(url, window.location.origin);
    return resolved.origin === window.location.origin && resolved.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

const originalFetch = window.fetch.bind(window);

window.fetch = (input: RequestInfo, init: RequestInit = {}) => {
  const method = (init.method || (typeof input !== "string" ? input.method : "GET") || "GET").toUpperCase();

  if (!MUTATING_METHODS.has(method) || !isSameOriginApiRequest(input)) {
    return originalFetch(input, init);
  }

  const headers = new Headers(init.headers ?? (typeof input !== "string" ? input.headers : undefined));
  if (!headers.has("X-CSRF-Token")) {
    const token = getCsrfTokenFromCookie();
    if (token) {
      headers.set("X-CSRF-Token", token);
    }
  }

  return originalFetch(input, {
    ...init,
    headers,
    credentials: init.credentials ?? "include",
  });
};
