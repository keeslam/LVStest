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
 *
 * C2 (docs/audit/13-app-settings-geheimen.md, rebuilt on main 2026-10-29):
 *  - who may read: an account without manage_settings gets only the rows an
 *    ordinary screen needs (`PUBLIC_APP_SETTING_KEYS`). Host names, mailbox
 *    names and the trusted invoice senders are not passwords, and still
 *    nobody's business;
 *  - the SMTP password is shown as a mask, and the mask (or an empty field)
 *    coming back on save means "keep what is stored";
 *  - a kept password belongs to one server and one account name. A save that
 *    keeps it while either changes is refused, so it never travels to a host
 *    somebody merely typed in (`keptPasswordWouldTravel`).
 */
import { INVOICE_INBOX_CONFIG_KEY, INVOICE_INBOX_PASSWORD_MASK } from "../../../shared/invoice-inbox";
import { CJIB_CONFIG_KEY, CJIB_PASSWORD_MASK } from "../../../shared/fines";
import { RDW_TYPE_REMAP_PLAN_KEY } from "../../../shared/rdw-type-remap";
import { OFFICE_TIMEZONE_KEY } from "../../../shared/office-timezone";
import { COMPANY_NAME_KEY } from "../../../shared/company-name";
import { KM_ALLOWANCE_KEY } from "../../../shared/km-allowance";
import { UserPermission, UserRole } from "../../../shared/schema";

/** Shown instead of a stored SMTP password; coming back on save it means "keep what is stored". */
export const SMTP_PASSWORD_MASK = "********";

/** The code (translated on the screen) when a kept password would follow a changed server or user name. */
export const RETYPE_PASSWORD_CODE = "RETYPE_PASSWORD";
export const RETYPE_PASSWORD_MESSAGE = "Type the password again when the server or the user name changes";

/** Thrown by the mailbox screens' save functions; their routes answer it with a 400. */
export class RetypePasswordError extends Error {
  readonly code = RETYPE_PASSWORD_CODE;
  constructor() { super(RETYPE_PASSWORD_MESSAGE); }
}

const sameHost = (a: unknown, b: unknown) =>
  String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
const sameUser = (a: unknown, b: unknown) => String(a ?? "").trim() === String(b ?? "").trim();

/**
 * True when a write keeps the stored password (`keeping`) while the host or the
 * user name differs from what the password was stored for. Nothing stored means
 * nothing can travel.
 */
export function keptPasswordWouldTravel(
  stored: { host?: unknown; user?: unknown; password?: unknown },
  incoming: { host?: unknown; user?: unknown },
  keeping: boolean,
): boolean {
  if (!keeping || typeof stored.password !== "string" || !stored.password) return false;
  return !sameHost(stored.host, incoming.host) || !sameUser(stored.user, incoming.user);
}

/**
 * The rows every logged-in account may read through the generic routes, because
 * an ordinary screen needs them: the reservation form and the customer's
 * deductibles (`business_rules`), the calendars, the "e-mail documents" dialog,
 * the office time zone (loaded on every page), the company name on printed
 * reports and the free km per vehicle type. None of them holds an address, a
 * host name or a credential. Adding a key here is a decision: check what the
 * row holds first.
 */
export const PUBLIC_APP_SETTING_KEYS: ReadonlySet<string> = new Set([
  "business_rules",
  "calendar_settings",
  "document_email_templates",
  OFFICE_TIMEZONE_KEY,
  COMPANY_NAME_KEY,
  KM_ALLOWANCE_KEY,
]);

/** Setting key -> the mask its `value.password` is shown as. */
const MANAGED_PASSWORD_KEYS: Record<string, string> = {
  [INVOICE_INBOX_CONFIG_KEY]: INVOICE_INBOX_PASSWORD_MASK,
  [CJIB_CONFIG_KEY]: CJIB_PASSWORD_MASK,
};

/**
 * Rows with no secret in them that only their own routes may write. D17: the stored RDW type
 * plan is exactly what "Toepassen" applies, so a generic write could slip a vehicle into it.
 */
const MANAGED_PLAIN_KEYS = new Set<string>([RDW_TYPE_REMAP_PLAN_KEY]);

/** The one answer a generic write to a managed key gets. */
export const MANAGED_SETTING_MESSAGE = "Deze instelling wordt beheerd via zijn eigen scherm.";

/** True for a row that has its own settings screen and must not be written generically. */
export function isManagedSettingKey(key: unknown): boolean {
  return typeof key === "string"
    && (Object.prototype.hasOwnProperty.call(MANAGED_PASSWORD_KEYS, key) || MANAGED_PLAIN_KEYS.has(key));
}

/**
 * Keys that need one particular right instead of manage_settings. D17: the stored RDW type
 * plan lists plates and types of the fleet, and is for accounts that manage vehicles.
 */
const READ_RIGHT_BY_KEY: Record<string, string> = {
  [RDW_TYPE_REMAP_PLAN_KEY]: UserPermission.MANAGE_VEHICLES,
};

type ReadingUser = { role?: string; permissions?: string[] } | null | undefined;

/**
 * C2: a public key for everyone; a key in `READ_RIGHT_BY_KEY` for its right; any other key
 * for manage_settings. An admin reads everything.
 */
export function canReadAppSettingKey(key: unknown, user: ReadingUser): boolean {
  if (typeof key !== "string") return false;
  if (PUBLIC_APP_SETTING_KEYS.has(key)) return true;
  if (user?.role === UserRole.ADMIN) return true;
  const permissions = user?.permissions ?? [];
  const right = Object.prototype.hasOwnProperty.call(READ_RIGHT_BY_KEY, key) ? READ_RIGHT_BY_KEY[key] : UserPermission.MANAGE_SETTINGS;
  return permissions.includes(right);
}

/** Drops the rows `user` may not read; the list routes call it before redaction. */
export function readableAppSettings<T extends { key?: unknown }>(settings: T[], user: ReadingUser): T[] {
  return settings.filter((setting) => canReadAppSettingKey(setting?.key, user));
}

type SettingLike = { key?: unknown; value?: any } | null | undefined;

/**
 * What a settings route may return: the SMTP password and the password of a
 * managed row replaced by a mask. An empty password stays empty, so the form
 * can tell "none stored" from "one stored".
 */
export function redactAppSetting<T extends SettingLike>(setting: T): T {
  if (!setting?.value || typeof setting.value !== "object") return setting;

  let value = setting.value;
  let changed = false;

  if ("smtpPassword" in value) {
    value = { ...value, smtpPassword: value.smtpPassword ? SMTP_PASSWORD_MASK : "" };
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

/** True when the form sent the SMTP password back unchanged: the mask, or an empty field. */
export function isKeptSmtpPassword(password: unknown): boolean {
  return password === SMTP_PASSWORD_MASK || password === "";
}

/**
 * Counterpart of the redaction for a generic write of an e-mail row: the mask
 * (or an empty field) is replaced by the stored password, or by "" when none is
 * stored, so the mask itself is never stored. Refused when the kept password
 * would follow a changed SMTP host or user name.
 */
export function prepareEmailSettingValue(
  category: unknown,
  value: any,
  existing: { value?: any } | null | undefined,
): { value: any; refusal?: undefined } | { refusal: { message: string; code: string }; value?: undefined } {
  if (category !== "email" || !value || typeof value !== "object" || Array.isArray(value)) return { value };
  if (!("smtpPassword" in value) || !isKeptSmtpPassword(value.smtpPassword)) return { value };
  const stored = existing?.value && typeof existing.value === "object" && !Array.isArray(existing.value) ? existing.value : {};
  const storedPassword = typeof stored.smtpPassword === "string" ? stored.smtpPassword : "";
  if (keptPasswordWouldTravel(
    { host: stored.smtpHost, user: stored.smtpUser, password: storedPassword },
    { host: value.smtpHost, user: value.smtpUser },
    true,
  )) {
    return { refusal: { message: RETYPE_PASSWORD_MESSAGE, code: RETYPE_PASSWORD_CODE } };
  }
  return { value: { ...value, smtpPassword: storedPassword } };
}
