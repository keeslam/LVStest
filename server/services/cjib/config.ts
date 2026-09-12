import { z } from "zod";
import { storage } from "../../storage";
import { CJIB_CONFIG_KEY, CJIB_PASSWORD_MASK, DEFAULT_CJIB_CONFIG, type CjibConfig } from "../../../shared/fines";
import { assertPublicHost, OutboundBlockedError } from "../../utils/security/outboundGuard";

/**
 * FIX-U (BUG-071). The FTPS host came straight from the request body, so
 * "test the connection" was a port scanner for anything the container could
 * reach — and the directory listing came back in the response. The destination
 * is now restricted to the operator's allowlist (one suffix per entry) and, on
 * top of that, has to resolve to a public address.
 *
 * Deployments that use a CJIB endpoint outside cjib.nl set CJIB_ALLOWED_HOSTS
 * to a comma-separated list of host suffixes.
 */
export const CJIB_DEFAULT_ALLOWED_HOSTS = ["cjib.nl"];

export function cjibAllowedHostSuffixes(): string[] {
  const configured = (process.env.CJIB_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase().replace(/^\.+/, ""))
    .filter(Boolean);
  return configured.length ? configured : CJIB_DEFAULT_ALLOWED_HOSTS;
}

export function isAllowedCjibHost(host: string): boolean {
  const name = String(host ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (!name) return false;
  return cjibAllowedHostSuffixes().some((suffix) => name === suffix || name.endsWith("." + suffix));
}

/** Throws OutboundBlockedError — one generic message, no oracle — when refused. */
export async function assertAllowedCjibHost(host: string): Promise<void> {
  if (!isAllowedCjibHost(host)) throw new OutboundBlockedError();
  await assertPublicHost(host);
}

export const cjibConfigSchema = z.object({
  enabled: z.boolean().default(false),
  host: z.string().trim().max(200).default(""),
  port: z.coerce.number().int().min(1).max(65535).default(990),
  secure: z.enum(["implicit", "explicit"]).default("implicit"),
  username: z.string().trim().max(200).default(""),
  password: z.string().max(500).default(""),
  inboxDir: z.string().trim().max(500).default("/"),
  processedDir: z.string().trim().max(500).default(""),
  pollMinutes: z.coerce.number().int().min(5).max(1440).default(60),
  filePattern: z.string().trim().max(200).default(DEFAULT_CJIB_CONFIG.filePattern)
    .refine((p) => { try { new RegExp(p); return true; } catch { return false; } }, "filePattern is not a valid regular expression"),
});

export async function getCjibConfig(): Promise<CjibConfig> {
  try {
    const row = await storage.getAppSettingByKey(CJIB_CONFIG_KEY);
    const parsed = cjibConfigSchema.safeParse(row?.value ?? {});
    return parsed.success ? { ...DEFAULT_CJIB_CONFIG, ...parsed.data } : DEFAULT_CJIB_CONFIG;
  } catch (error) {
    console.warn("cjib_config could not be read, using defaults:", error);
    return DEFAULT_CJIB_CONFIG;
  }
}

/** What the UI may see: never the stored password. */
export function maskCjibConfig(c: CjibConfig): CjibConfig {
  return { ...c, password: c.password ? CJIB_PASSWORD_MASK : "" };
}

/** The masked password coming back from the form means "keep what is stored". */
export async function saveCjibConfig(input: unknown, updatedBy: string): Promise<CjibConfig> {
  const current = await getCjibConfig();
  const value = cjibConfigSchema.parse(input);
  if (value.password === CJIB_PASSWORD_MASK) value.password = current.password;
  const existing = await storage.getAppSettingByKey(CJIB_CONFIG_KEY);
  if (existing) await storage.updateAppSetting(existing.id, { value, updatedBy });
  else await storage.createAppSetting({ key: CJIB_CONFIG_KEY, value, category: "portal", description: "CJIB fine import over FTPS", createdBy: updatedBy, updatedBy });
  return value;
}
