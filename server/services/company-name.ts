/**
 * D15 — the company name for mails (`app_settings.company_name`, default
 * "Autolease Lam"). Same shape as services/office-time.ts: a synchronous
 * accessor over an in-memory value that is read at start-up, re-read when the
 * settings route stores the key (cache cleared on save) and, once loaded, in the
 * background when older than 60 s. Before the first load nothing touches the
 * database and the default answers.
 */
import { COMPANY_NAME_KEY, DEFAULT_COMPANY_NAME, LEGACY_COMPANY_NAME, companyNameFromSetting, validCompanyName } from "../../shared/company-name";

const CACHE_TTL_MS = 60_000;
let name = DEFAULT_COMPANY_NAME;
/** True when a usable `company_name` value is stored (not just the default answering). */
let saved = false;
let loadedAt = 0;
let loading: Promise<string> | null = null;
let reloadRequested = false;

/** The company name; cheap and synchronous. */
export function companyName(): string {
  if (loadedAt !== 0 && Date.now() - loadedAt >= CACHE_TTL_MS) void loadCompanyName();
  return name;
}

/**
 * The name for the customer-facing portal texts (the bell notifications). Like the portal mail
 * templates (portal-mail.ts), they keep saying "Lam Groep" until somebody has saved a company name, so
 * a customer never sees two names; after the first save they follow the setting.
 */
export function portalCompanyName(): string {
  const current = companyName();
  return saved ? current : LEGACY_COMPANY_NAME;
}

/** Reads the setting now, replacing the cached value. Never rejects. */
export function loadCompanyName(): Promise<string> {
  // A call made while a read is running (a background reload that started just before a save)
  // asks for one more read and resolves after it, so a save never gets the value from before it.
  if (loading) {
    reloadRequested = true;
    return loading;
  }
  loading = (async () => {
    try {
      do {
        reloadRequested = false;
        try {
          const { storage } = await import("../storage");
          const stored = (await storage.getAppSettingByKey(COMPANY_NAME_KEY))?.value;
          name = companyNameFromSetting(stored);
          saved = validCompanyName(stored) !== null;
        } catch (error) {
          console.warn("company_name could not be read, keeping", name, error);
        }
        loadedAt = Date.now();
      } while (reloadRequested);
    } finally {
      // Cleared in the same tick as the last check of the flag (see office-time.ts).
      loading = null;
    }
    return name;
  })();
  return loading;
}

/** For callers that are async anyway: loads when stale, so the answer is never older than the cache. */
export async function getCompanyName(): Promise<string> {
  if (loadedAt === 0 || Date.now() - loadedAt >= CACHE_TTL_MS) await loadCompanyName();
  return name;
}
