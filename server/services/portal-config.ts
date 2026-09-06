import { storage } from "../storage";
import { DEFAULT_PORTAL_CONFIG, PORTAL_CONFIG_KEY, type PortalConfig } from "../../shared/portal-types";
import { z } from "zod";

export const portalConfigSchema = z.object({
  allowedFrameOrigins: z.array(z.string().url()).default(DEFAULT_PORTAL_CONFIG.allowedFrameOrigins),
  notificationEmail: z.union([z.string().email(), z.literal("")]).default(""),
  portalBaseUrl: z.union([z.string().url(), z.literal("")]).default(""),
  fineAdminFee: z.coerce.number().min(0).default(0),
  pickupAddress: z.string().max(300).default(DEFAULT_PORTAL_CONFIG.pickupAddress),
  openingHours: z.string().max(300).default(DEFAULT_PORTAL_CONFIG.openingHours),
  pickupInstructions: z.string().max(1000).default(DEFAULT_PORTAL_CONFIG.pickupInstructions),
  privacyUrl: z.union([z.string().url(), z.literal("")]).default(DEFAULT_PORTAL_CONFIG.privacyUrl),
  phone: z.string().max(50).default(DEFAULT_PORTAL_CONFIG.phone),
});

const CACHE_TTL_MS = 60_000;
let cached: { value: PortalConfig; at: number } | null = null;

export function clearPortalConfigCache(): void {
  cached = null;
}

export async function getPortalConfig(): Promise<PortalConfig> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
  try {
    const row = await storage.getAppSettingByKey(PORTAL_CONFIG_KEY);
    const parsed = portalConfigSchema.safeParse(row?.value ?? {});
    const value = parsed.success ? { ...DEFAULT_PORTAL_CONFIG, ...parsed.data } : DEFAULT_PORTAL_CONFIG;
    cached = { value, at: Date.now() };
    return value;
  } catch (error) {
    console.warn("⚠️ portal_config could not be read, using defaults:", error);
    return DEFAULT_PORTAL_CONFIG;
  }
}

export async function savePortalConfig(input: unknown, updatedBy: string): Promise<PortalConfig> {
  const value = portalConfigSchema.parse(input);
  const existing = await storage.getAppSettingByKey(PORTAL_CONFIG_KEY);
  if (existing) {
    await storage.updateAppSetting(existing.id, { value, updatedBy });
  } else {
    await storage.createAppSetting({
      key: PORTAL_CONFIG_KEY,
      value,
      category: "portal",
      description: "Customer portal: allowed iframe origins, staff notification e-mail, portal base URL",
      createdBy: updatedBy,
      updatedBy,
    });
  }
  clearPortalConfigCache();
  return value;
}
