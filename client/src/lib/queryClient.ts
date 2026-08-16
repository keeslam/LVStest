import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { invokeSessionExpired } from "./session-expiry";
import { promptForAdminPassword } from "./admin-password-prompt";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    // Handle session expiration (401)
    if (res.status === 401) {
      // Try to parse response to check for expiry flag
      try {
        const data = await res.clone().json();
        if (data.expired || data.message === "Session expired due to inactivity") {
          // Session expired - trigger logout
          await invokeSessionExpired();
        }
      } catch (e) {
        // If we can't parse JSON, still invoke expiry for any 401
        await invokeSessionExpired();
      }
    }
    
    const text = (await res.text()) || res.statusText;
    let message = text;
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed?.message === "string") {
        message = parsed.message;
      }
    } catch {
      // Response body wasn't JSON; use the raw text as-is.
    }
    throw new Error(`${res.status}: ${message}`);
  }
}

/**
 * Get CSRF token from cookie
 */
function getCsrfToken(): string | null {
  const match = document.cookie.match(/XSRF-TOKEN=([^;]+)/);
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

  const res = await fetch(url, {
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
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    let url = queryKey[0] as string;
    const params = queryKey[1];
    
    // Handle query parameters if they exist
    if (params && typeof params === 'object') {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      });
      
      const queryString = searchParams.toString();
      if (queryString) {
        url = `${url}?${queryString}`;
      }
    }
    
    const startedAt = Date.now();
    const res = await fetch(url, {
      credentials: "include",
      cache: "no-store", // Bypass browser HTTP cache entirely - always get fresh data from the server
    });
    console.debug(`[query] GET ${url} -> ${res.status} in ${Date.now() - startedAt}ms`);

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
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
export function invalidateRelatedQueries(entityType: string, entityData?: { id?: number; vehicleId?: number; customerId?: number }) {
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
      
    default:
      console.warn(`Unknown entity type for invalidation: ${entityType}`);
      break;
  }
}
