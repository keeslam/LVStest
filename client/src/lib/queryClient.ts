import { QueryCache, QueryClient, QueryFunction } from "@tanstack/react-query";
import { invokeSessionExpired } from "./session-expiry";
import { promptForAdminPassword } from "./admin-password-prompt";
import { toast } from "@/hooks/use-toast";
import i18n from "@/i18n";
import {
  fetchWithTimeout,
  shouldForceLogout,
  REQUEST_TIMEOUT_MS,
  RequestTimeoutError,
} from "./request-policy";

import { queryKeyUrl } from "./query-key-url";
import { readJsonBody } from "./read-json-body";

export { fetchWithTimeout, shouldForceLogout, REQUEST_TIMEOUT_MS, RequestTimeoutError };
export { queryKeyUrl };

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    // BUG-213: any 401 on a staff endpoint means this tab's session is gone.
    // Clear the cache so no stale row is rendered behind the login page, then
    // let the registered handler log out and navigate.
    if (shouldForceLogout(res.url || "", res.status)) {
      queryClient.clear();
      await invokeSessionExpired();
    }
    
    const text = (await res.text()) || res.statusText;
    let message = text;
    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
      if (typeof parsed?.message === "string") {
        message = parsed.message;
      }
    } catch {
      // Response body wasn't JSON; use the raw text as-is.
    }
    const error = new Error(`${res.status}: ${message}`);
    // Callers (e.g. mileage-decrease override flows) check custom fields the
    // server sent alongside the error message (requiresOverride, code, etc.) -
    // merge them onto the thrown Error so `error.requiresOverride` etc. work.
    if (parsed && typeof parsed === "object") {
      Object.assign(error, parsed);
    }
    // OPT-022: the HTTP status, under a name no server payload uses, so a
    // caller can tell "you may not see this" (403) from "this broke" (500).
    // Set after the merge on purpose - a body field must not be able to
    // rewrite it.
    (error as Error & { httpStatus?: number }).httpStatus = res.status;
    throw error;
  }
}

/**
 * Get CSRF token from cookie
 */
export function getCsrfToken(): string | null {
  // Anchored: the customer portal sets PORTAL-XSRF-TOKEN alongside, which an
  // unanchored match would pick up first.
  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
  return match ? match[1] : null;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  options?: { _adminRetryCount?: number },
): Promise<Response> {
  const headers: Record<string, string> = {};
  let bodyPayload: unknown = data;

  // Backwards-compat: some callers pass { body: JSON.stringify(payload), headers: {...} }
  // (a fetch-init-style wrapper) instead of the raw payload. Detect and unwrap so the
  // server receives the actual payload and not a doubly-wrapped object.
  if (
    data &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    typeof (data as any).body === 'string' &&
    (Object.keys(data as any).length === 1 ||
      (Object.keys(data as any).length === 2 && 'headers' in (data as any)))
  ) {
    try {
      bodyPayload = JSON.parse((data as any).body);
      const wrappedHeaders = (data as any).headers;
      if (wrappedHeaders && typeof wrappedHeaders === 'object') {
        Object.assign(headers, wrappedHeaders);
      }
    } catch {
      // If body isn't valid JSON, fall through and send original data as-is
      bodyPayload = data;
    }
  }

  // Add Content-Type for requests with data
  if (bodyPayload !== undefined && bodyPayload !== null) {
    headers["Content-Type"] = "application/json";
  }

  // Add CSRF token for state-changing requests
  if (['POST', 'PATCH', 'DELETE', 'PUT'].includes(method.toUpperCase())) {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers["X-CSRF-Token"] = csrfToken;
    }
  }

  const res = await fetchWithTimeout(url, {
    method,
    headers,
    body: bodyPayload !== undefined && bodyPayload !== null ? JSON.stringify(bodyPayload) : undefined,
    credentials: "include",
  });

  // Handle "old rental" admin-password override: when the backend rejects with
  // 403 + code ADMIN_PASSWORD_REQUIRED (or INVALID_ADMIN_PASSWORD), prompt the
  // user for an admin password and retry transparently with the password
  // merged into the request body. Caps at 3 retries to avoid infinite loops.
  if (res.status === 403) {
    const retryCount = options?._adminRetryCount ?? 0;
    if (retryCount < 3) {
      let parsedBody: any = null;
      try {
        parsedBody = await res.clone().json();
      } catch {
        parsedBody = null;
      }
      const code = parsedBody?.code;
      if (code === "ADMIN_PASSWORD_REQUIRED" || code === "INVALID_ADMIN_PASSWORD") {
        const password = await promptForAdminPassword({
          reason:
            code === "ADMIN_PASSWORD_REQUIRED"
              ? parsedBody?.message ||
                "This rental was picked up more than 3 weeks ago. Admin password required to save changes."
              : undefined,
          errorMessage:
            code === "INVALID_ADMIN_PASSWORD"
              ? parsedBody?.message || "The admin password you entered is incorrect."
              : undefined,
        });
        if (password) {
          const mergedBody =
            bodyPayload && typeof bodyPayload === "object" && !Array.isArray(bodyPayload)
              ? { ...(bodyPayload as Record<string, unknown>), adminPasswordOverride: password }
              : { adminPasswordOverride: password };
          return apiRequest(method, url, mergedBody, {
            _adminRetryCount: retryCount + 1,
          });
        }
        // User cancelled — fall through to throw
      }
    }
  }

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn =
  <T>({ on401: unauthorizedBehavior }: { on401: UnauthorizedBehavior }): QueryFunction<T> =>
  async ({ queryKey }) => {
    // BUG-204: the key-to-URL rule lives in one place now, so a test can walk a
    // page's query keys and prove no two of them fetch the same URL.
    const url = queryKeyUrl(queryKey as readonly unknown[]);

    const startedAt = Date.now();
    const res = await fetchWithTimeout(url, {
      credentials: "include",
      cache: "no-store", // Bypass browser HTTP cache entirely - always get fresh data from the server
    });
    console.debug(`[query] GET ${url} -> ${res.status} in ${Date.now() - startedAt}ms`);

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null as T;
    }
    if (shouldForceLogout(url, res.status)) {
      queryClient.clear();
      await invokeSessionExpired();
    }

    await throwIfResNotOk(res);
    // A 200 with an empty body reads as null instead of throwing
    // "Unexpected end of JSON input" — see client/src/lib/read-json-body.ts.
    // The cast is the same shape as the `return null` above: this function has
    // always been able to answer null and the callers treat it as "no data".
    return (await readJsonBody<T>(res)) as T;
  };

// Store the QueryClient on globalThis so there is exactly ONE cache instance,
// even if this module gets evaluated twice (e.g. Vite dev HMR can load both a
// timestamped and non-timestamped copy of this module, which previously caused
// invalidations to run against an empty duplicate cache — saves then appeared
// to "not update" until a manual page refresh).
const globalForQueryClient = globalThis as unknown as {
  __appQueryClient?: QueryClient;
};

export const queryClient =
  globalForQueryClient.__appQueryClient ??
  new QueryClient({
    // BUG-212: a failed GET used to render as an empty state - "no results" is
    // indistinguishable from "the server is down". One place now says so out
    // loud, whichever screen the query belongs to. 401 is excluded: that path
    // navigates to the login page and a toast would only add noise.
    queryCache: new QueryCache({
      onError: (error) => {
        const message = error instanceof Error ? error.message : String(error);
        if (/^401:/.test(message)) return;
        // WAVE 13 item 7 — this title was a hard-coded English string, so the
        // one toast that fires on *any* screen was the one thing on a Dutch app
        // that never spoke Dutch. `common:queryError.*` has held the wording
        // since BUG-212; it just was not used here.
        toast({
          title: i18n.t("common:queryError.title", { defaultValue: "Could not load the data" }),
          description: message || i18n.t("common:queryError.description", { defaultValue: "Try again, or reload the page." }),
          variant: "destructive",
        });
      },
    }),
    defaultOptions: {
      queries: {
        queryFn: getQueryFn({ on401: "throw" }),
        refetchInterval: false, // Don't auto-refresh on a timer
        refetchOnWindowFocus: false, // Disabled - prevents dialogs from closing when switching tabs. Real-time updates come via WebSocket instead.
        refetchOnReconnect: false, // Disabled - prevents refetch on network reconnect which can close dialogs
        staleTime: 30000, // Cache data for 30 seconds to reduce refetches while maintaining freshness
        gcTime: 300000, // Keep unused data for 5 minutes
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });

globalForQueryClient.__appQueryClient = queryClient;

/**
 * Automatic cache invalidation based on mutation patterns.
 * Uses soft invalidation to prevent dialogs from closing unexpectedly.
 * Data is marked as stale but not force-refetched.
 */
function autoInvalidateCache(mutationKey: string, data?: any) {
  // Extract the API path and method from mutation key
  const apiPath = mutationKey.toLowerCase();
  
  // Smart invalidation based on API patterns - uses soft invalidation
  if (apiPath.includes('users')) {
    invalidateByPrefix('/api/users');
  } else if (apiPath.includes('vehicles')) {
    invalidateRelatedQueries('vehicles', data);
  } else if (apiPath.includes('customers')) {
    invalidateRelatedQueries('customers', data);
  } else if (apiPath.includes('reservations')) {
    invalidateRelatedQueries('reservations', data);
  } else if (apiPath.includes('expenses')) {
    invalidateRelatedQueries('expenses', data);
  } else if (apiPath.includes('documents')) {
    invalidateRelatedQueries('documents', data);
  } else if (apiPath.includes('notifications')) {
    invalidateRelatedQueries('notifications', data);
  } else if (apiPath.includes('transports')) {
    invalidateRelatedQueries('transports', data);
  }
  
  // Soft invalidate dashboard data - they will refetch when visible
  invalidateByPrefix('/api/reservations/upcoming');
  invalidateByPrefix('/api/expenses/recent');
  invalidateByPrefix('/api/vehicles/apk-expiring');
  invalidateByPrefix('/api/vehicles/warranty-expiring');
}

/**
 * Prefix-based invalidation utility to invalidate all queries with a matching prefix.
 *
 * Uses refetchType 'active': all matching queries are marked stale, and the
 * ones currently rendered on screen are refetched immediately. This is what
 * makes list pages (vehicles, customers, reservations, …) update right after
 * a save instead of showing stale data until a manual page refresh.
 *
 * This is safe for dialogs: a refetch updates data in place and does not
 * unmount/close dialogs. (The old refetchType 'none' behaviour was a
 * workaround for dialogs rendered inside table cells losing state on table
 * re-render — that problem was since fixed properly by lifting dialog state
 * to page level. Background/websocket invalidations remain soft in
 * use-socket.tsx so remote changes never yank data out from under an open
 * form.)
 */
export function invalidateByPrefix(prefix: string) {
  return scheduleInvalidation((key) => key.startsWith(prefix));
}

const INVALIDATION_BATCH_MS = 50;

let pendingMatchers: Array<(key: string) => boolean> = [];
let pendingFlush: Promise<void> | null = null;
let resolvePendingFlush: (() => void) | null = null;

/**
 * Coalesces invalidation requests fired within a short window into one refetch pass.
 *
 * A single mutation is invalidated by three independent layers: the mutation's own
 * onSuccess, the page-level dialog success handler, and the WebSocket data-update
 * listener. Overlapping prefixes compound it further ('/api/vehicles' already covers
 * '/api/vehicles/apk-expiring'). Without batching, every list endpoint refetches once
 * per layer, so one save cost 3x the requests.
 */
export function scheduleInvalidation(matcher: (key: string) => boolean): Promise<void> {
  pendingMatchers.push(matcher);

  if (!pendingFlush) {
    pendingFlush = new Promise<void>((resolve) => {
      resolvePendingFlush = resolve;
    });
    setTimeout(flushInvalidations, INVALIDATION_BATCH_MS);
  }

  return pendingFlush;
}

function flushInvalidations() {
  const matchers = pendingMatchers;
  const done = resolvePendingFlush;
  pendingMatchers = [];
  pendingFlush = null;
  resolvePendingFlush = null;

  queryClient
    .invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey?.[0];
        if (typeof key !== 'string') return false;
        return matchers.some((matches) => matches(key));
      },
      refetchType: 'active', // Refetch mounted queries now; others refetch on next mount
    })
    .finally(() => done?.());
}

/**
 * Enhanced API request function that supports automatic cache invalidation
 * Pass a mutationKey to enable automatic cache refresh on success
 */
export async function apiRequestWithCache(
  method: string,
  url: string,
  data?: unknown,
  mutationKey?: string
): Promise<Response> {
  const response = await apiRequest(method, url, data);
  
  // Trigger automatic cache invalidation if mutationKey is provided
  if (mutationKey) {
    autoInvalidateCache(mutationKey, data);
  }
  
  return response;
}

/**
 * Disable automatic cache invalidation for specific mutations
 * Use this when you want to handle cache invalidation manually
 */
export const createMutationWithoutAutoCache = (options: any) => ({
  ...options,
  mutationKey: undefined, // Prevents automatic cache invalidation
});

/**
 * Comprehensive invalidation system for all entity types and their relationships.
 * Marks matching queries stale and refetches the ones currently on screen
 * (via invalidateByPrefix), so views update immediately after a save.
 */
export function invalidateRelatedQueries(entityType: string, entityData?: { id?: number | null; vehicleId?: number | null; customerId?: number | null }) {
  const id = entityData?.id;
  const vehicleId = entityData?.vehicleId;
  const customerId = entityData?.customerId;
  
  // All invalidations use soft mode (refetchType: 'none') via invalidateByPrefix
  switch (entityType) {
    case 'vehicles':
      invalidateByPrefix('/api/vehicles');
      if (id) {
        invalidateByPrefix(`/api/reservations/vehicle/${id}`);
        invalidateByPrefix(`/api/expenses/vehicle/${id}`);
        invalidateByPrefix(`/api/documents/vehicle/${id}`);
      }
      break;
      
    case 'reservations':
      invalidateByPrefix('/api/reservations');
      invalidateByPrefix('/api/vehicles/available');
      invalidateByPrefix('/api/placeholder-reservations');
      if (vehicleId) {
        invalidateByPrefix(`/api/reservations/vehicle/${vehicleId}`);
      }
      if (customerId) {
        invalidateByPrefix(`/api/reservations/customer/${customerId}`);
      }
      break;
      
    case 'expenses':
      invalidateByPrefix('/api/expenses');
      if (vehicleId) {
        invalidateByPrefix(`/api/expenses/vehicle/${vehicleId}`);
      }
      break;
      
    case 'documents':
      invalidateByPrefix('/api/documents');
      if (vehicleId) {
        invalidateByPrefix(`/api/documents/vehicle/${vehicleId}`);
      }
      break;
      
    case 'customers':
      invalidateByPrefix('/api/customers');
      if (id) {
        invalidateByPrefix(`/api/reservations/customer/${id}`);
      }
      break;
      
    case 'notifications':
      invalidateByPrefix('/api/custom-notifications');
      invalidateByPrefix('/api/notifications');
      break;

    case 'transports':
      invalidateByPrefix('/api/transports');
      // A spare assignment can create/cancel a reservation and change the original
      // vehicle's maintenance/availability status.
      invalidateByPrefix('/api/vehicles');
      invalidateByPrefix('/api/reservations');
      invalidateByPrefix('/api/vehicles/available');
      if (vehicleId) {
        invalidateByPrefix(`/api/reservations/vehicle/${vehicleId}`);
      }
      break;

    default:
      console.warn(`Unknown entity type for invalidation: ${entityType}`);
      break;
  }
}
