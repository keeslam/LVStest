/**
 * Singleton utility for prompting the user for an admin password when the
 * backend rejects a request with code "ADMIN_PASSWORD_REQUIRED" (used to
 * unlock edits on rentals older than 3 weeks).
 *
 * Mirrors the session-expiry singleton pattern so apiRequest can trigger
 * the prompt without needing direct access to React context.
 */

export type AdminPasswordPromptOptions = {
  reason?: string;
  errorMessage?: string;
};

type AdminPasswordPromptHandler = (
  opts: AdminPasswordPromptOptions,
) => Promise<string | null>;

// Keep the registry on globalThis so there is exactly ONE copy of this state,
// even if Vite dev HMR evaluates this module twice (duplicate module copies
// would otherwise register the handler in one copy while apiRequest invokes
// the other, silently breaking the admin-password prompt).
type AdminPasswordPromptRegistry = {
  handler: AdminPasswordPromptHandler | null;
};

const globalForAdminPrompt = globalThis as unknown as {
  __adminPasswordPromptRegistry?: AdminPasswordPromptRegistry;
};

const registry: AdminPasswordPromptRegistry =
  globalForAdminPrompt.__adminPasswordPromptRegistry ?? { handler: null };

globalForAdminPrompt.__adminPasswordPromptRegistry = registry;

export function registerAdminPasswordPromptHandler(
  handler: AdminPasswordPromptHandler,
) {
  registry.handler = handler;
}

export function unregisterAdminPasswordPromptHandler() {
  registry.handler = null;
}

/**
 * Request the admin password from the user. Resolves with the entered
 * password, or null if the user cancelled / no handler is mounted.
 */
export async function promptForAdminPassword(
  opts: AdminPasswordPromptOptions = {},
): Promise<string | null> {
  if (!registry.handler) {
    console.warn(
      "[admin-password] Admin password required but no prompt UI is mounted.",
    );
    return null;
  }
  return registry.handler(opts);
}
