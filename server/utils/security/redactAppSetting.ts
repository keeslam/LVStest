/**
 * C1 — one owner for "what may an app-settings row show, and who may write it".
 *
 * `app_settings` is a grab bag: the SMTP configuration, the damage-check
 * fields, and two rows that hold a mailbox password — `invoice_inbox_config`
 * (IMAP, facturen per e-mail) and `cjib_config` (FTPS). The generic settings
 * routes handed those rows out verbatim, so `GET
 * /api/app-settings/key/invoice_inbox_config` gave the plaintext password to
 * any logged-in account.
 *
 * Deliberately narrow: only the two keys below are masked, plus the
 * `smtpPassword` blanking that was already there. Masking every field that
 * looks like a secret would break the e-mail form, which round-trips its values
 * on save without a "keep the stored one" rule.
 *
 * Writes to the two keys go through their own screens
 * (`/api/expenses/inbox/config`, `/api/fines/cjib-config`), which validate,
 * keep the stored password behind the mask and write an audit line. A generic
 * write would bypass all three, so it is refused.
 */
import { INVOICE_INBOX_CONFIG_KEY, INVOICE_INBOX_PASSWORD_MASK } from "../../../shared/invoice-inbox";
import { CJIB_CONFIG_KEY, CJIB_PASSWORD_MASK } from "../../../shared/fines";

/** Setting key -> the mask its `value.password` is shown as. */
const MANAGED_PASSWORD_KEYS: Record<string, string> = {
  [INVOICE_INBOX_CONFIG_KEY]: INVOICE_INBOX_PASSWORD_MASK,
  [CJIB_CONFIG_KEY]: CJIB_PASSWORD_MASK,
};

/** The one answer a generic write to a managed key gets. */
export const MANAGED_SETTING_MESSAGE = "Deze instelling wordt beheerd via zijn eigen scherm.";

/** True for a row that has its own settings screen and must not be written generically. */
export function isManagedSettingKey(key: unknown): boolean {
  return typeof key === "string" && Object.prototype.hasOwnProperty.call(MANAGED_PASSWORD_KEYS, key);
}

type SettingLike = { key?: unknown; value?: any } | null | undefined;

/**
 * What a settings route may return: the SMTP password blanked as before, and
 * the password of a managed row replaced by its mask. An empty password stays
 * empty, so the form can tell "none stored" from "one stored".
 */
export function redactAppSetting<T extends SettingLike>(setting: T): T {
  if (!setting?.value || typeof setting.value !== "object") return setting;

  let value = setting.value;
  let changed = false;

  if ("smtpPassword" in value) {
    value = { ...value, smtpPassword: "" };
    changed = true;
  }

  const mask = typeof setting.key === "string" ? MANAGED_PASSWORD_KEYS[setting.key] : undefined;
  if (mask !== undefined && "password" in value) {
    value = { ...value, password: value.password ? mask : "" };
    changed = true;
  }

  return changed ? ({ ...setting, value } as T) : setting;
}

export function redactAppSettings<T extends SettingLike>(settings: T[]): T[] {
  return settings.map((setting) => redactAppSetting(setting));
}
