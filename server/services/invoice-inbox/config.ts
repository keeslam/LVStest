import { z } from "zod";
import { storage } from "../../storage";
import {
  INVOICE_INBOX_CONFIG_KEY, INVOICE_INBOX_PASSWORD_MASK, DEFAULT_INVOICE_INBOX_CONFIG,
  type InvoiceInboxConfig,
} from "../../../shared/invoice-inbox";
import { assertPublicHost, OutboundBlockedError } from "../../utils/security/outboundGuard";

/** 993 = implicit TLS, 143 = STARTTLS. Nothing else, or "test connection" becomes a port scanner (cf. BUG-071). */
export const IMAP_ALLOWED_PORTS = [993, 143];

const SENDER_PATTERN = /^(@[a-z0-9-]+(\.[a-z0-9-]+)+|[^\s@<>]+@[a-z0-9-]+(\.[a-z0-9-]+)+)$/;

/** Returns a deep copy of the default config to prevent mutations from corrupting the shared constant. */
function defaultConfig(): InvoiceInboxConfig {
  return { ...DEFAULT_INVOICE_INBOX_CONFIG, allowedSenders: [...DEFAULT_INVOICE_INBOX_CONFIG.allowedSenders] };
}

export const invoiceInboxConfigSchema = z.object({
  enabled: z.boolean().default(false),
  host: z.string().trim().max(200).default(""),
  port: z.coerce.number().int()
    .refine((p) => IMAP_ALLOWED_PORTS.includes(p), "Alleen poort 993 (TLS) of 143 (STARTTLS) is toegestaan")
    .default(993),
  secure: z.boolean().default(true),
  /** I2: the name our own mail server writes in its Authentication-Results header. */
  authservId: z.string().trim().max(200).default(""),
  username: z.string().trim().max(320).default(""),
  password: z.string().max(500).default(""),
  inboxFolder: z.string().trim().min(1).max(200).default("INBOX"),
  processedFolder: z.string().trim().max(200).default("Verwerkt"),
  pollMinutes: z.coerce.number().int().min(5).max(1440).default(15),
  allowedSenders: z.array(
    z.string().trim().toLowerCase().max(320)
      .regex(SENDER_PATTERN, "Ongeldige afzender: gebruik naam@domein.nl of @domein.nl"),
  ).max(200).default([]).transform((list) => Array.from(new Set(list))),
  totalTolerance: z.coerce.number().min(0).max(100).default(1),
  // I3: the port decides the connection type, so a form (or an old stored row)
  // can never leave 143 paired with "implicit TLS" — which would have meant a
  // plaintext login on a server that does not advertise STARTTLS.
}).transform((config) => ({ ...config, secure: config.port === 993 }));

export async function getInvoiceInboxConfig(): Promise<InvoiceInboxConfig> {
  try {
    const row = await storage.getAppSettingByKey(INVOICE_INBOX_CONFIG_KEY);
    const parsed = invoiceInboxConfigSchema.safeParse(row?.value ?? {});
    return parsed.success ? { ...DEFAULT_INVOICE_INBOX_CONFIG, ...parsed.data } : defaultConfig();
  } catch (error) {
    console.warn("invoice_inbox_config could not be read, using defaults:", error);
    return defaultConfig();
  }
}

/** What the UI may see: never the stored password. */
export function maskInvoiceInboxConfig(c: InvoiceInboxConfig): InvoiceInboxConfig {
  return { ...c, password: c.password ? INVOICE_INBOX_PASSWORD_MASK : "" };
}

/** The masked password coming back from the form means "keep what is stored". */
export async function saveInvoiceInboxConfig(input: unknown, updatedBy: string): Promise<InvoiceInboxConfig> {
  const current = await getInvoiceInboxConfig();
  const value = invoiceInboxConfigSchema.parse(input);
  if (value.password === INVOICE_INBOX_PASSWORD_MASK) value.password = current.password;
  const existing = await storage.getAppSettingByKey(INVOICE_INBOX_CONFIG_KEY);
  if (existing) await storage.updateAppSetting(existing.id, { value, updatedBy });
  else {
    // Category "expenses" on purpose: email-service.ts reads every "email"
    // setting and falls back to the first one it finds as an SMTP config.
    await storage.createAppSetting({
      key: INVOICE_INBOX_CONFIG_KEY, value, category: "expenses",
      description: "Facturen per e-mail: IMAP-postvak dat de app uitleest", createdBy: updatedBy, updatedBy,
    });
  }
  return value;
}

/**
 * Throws OutboundBlockedError — one generic message, no oracle — when refused.
 * M2: returns the addresses the guard resolved, so the connection can be pinned
 * to one of them and a second DNS lookup cannot answer with a private address
 * after the check passed. Empty with the private-outbound override, which
 * resolves nothing (and is ignored in production).
 */
export async function assertAllowedImapTarget(host: string, port: number): Promise<string[]> {
  if (!IMAP_ALLOWED_PORTS.includes(Number(port))) throw new OutboundBlockedError();
  return assertPublicHost(String(host ?? "").trim());
}
