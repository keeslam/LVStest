/**
 * Singleton utility for handling session expiration
 * Allows queryClient to trigger logout without direct access to Auth context
 */

type SessionExpiredHandler = () => void | Promise<void>;

// Keep the registry on globalThis so there is exactly ONE copy of this state,
// even if Vite dev HMR evaluates this module twice (duplicate module copies
// would otherwise register the handler in one copy while apiRequest invokes
// the other, silently breaking auto-logout on 401).
type SessionExpiryRegistry = {
  handler: SessionExpiredHandler | null;
  isHandlingExpiry: boolean; // Prevent double calls
};

const globalForSessionExpiry = globalThis as unknown as {
  __sessionExpiryRegistry?: SessionExpiryRegistry;
};

const registry: SessionExpiryRegistry =
  globalForSessionExpiry.__sessionExpiryRegistry ??
  { handler: null, isHandlingExpiry: false };

globalForSessionExpiry.__sessionExpiryRegistry = registry;

/**
 * Register a handler to be called when session expires
 * Should be called from AuthProvider on mount
 */
export function registerSessionExpiredHandler(handler: SessionExpiredHandler) {
  registry.handler = handler;
}

/**
 * Unregister the session expired handler
 * Should be called from AuthProvider on unmount
 */
export function unregisterSessionExpiredHandler() {
  registry.handler = null;
  registry.isHandlingExpiry = false;
}

/**
 * Invoke the session expired handler
 * Called by queryClient when 401 response is received
 */
export async function invokeSessionExpired() {
  // Prevent double calls
  if (registry.isHandlingExpiry) {
    return;
  }
  
  if (!registry.handler) {
    console.warn('Session expired but no handler registered');
    return;
  }
  
  registry.isHandlingExpiry = true;
  
  try {
    await registry.handler();
  } catch (error) {
    console.error('Error handling session expiration:', error);
  } finally {
    // Reset after a delay to allow for any async operations
    setTimeout(() => {
      registry.isHandlingExpiry = false;
    }, 1000);
  }
}
