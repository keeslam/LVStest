import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { storage } from "../storage";
import { INVOICE_INBOX_CONFIG_KEY, INVOICE_INBOX_PASSWORD_MASK, DEFAULT_INVOICE_INBOX_CONFIG } from "../../shared/invoice-inbox";
import {
  getInvoiceInboxConfig, saveInvoiceInboxConfig, maskInvoiceInboxConfig,
  invoiceInboxConfigSchema, assertAllowedImapTarget,
} from "../services/invoice-inbox/config";
import { OutboundBlockedError } from "../utils/security/outboundGuard";

describe("invoice inbox config", () => {
  let previous: unknown;

  beforeAll(async () => {
    previous = (await storage.getAppSettingByKey(INVOICE_INBOX_CONFIG_KEY))?.value;
  });
  afterAll(async () => {
    await saveInvoiceInboxConfig(previous ?? { ...DEFAULT_INVOICE_INBOX_CONFIG }, "test");
  });

  it("stores the config under the expenses category, never under email", async () => {
    await saveInvoiceInboxConfig({ host: "imap.example.test", username: "fakturenapp@lamgroep.nl", password: "geheim", allowedSenders: ["@Garage.nl", "kees@lamgroep.nl", "@garage.nl"] }, "test");
    const row = await storage.getAppSettingByKey(INVOICE_INBOX_CONFIG_KEY);
    expect(row?.category).toBe("expenses");
    const config = await getInvoiceInboxConfig();
    expect(config).toMatchObject({ host: "imap.example.test", port: 993, secure: true, inboxFolder: "INBOX", processedFolder: "Verwerkt", pollMinutes: 15, totalTolerance: 1 });
    // lower-cased and de-duplicated
    expect(config.allowedSenders).toEqual(["@garage.nl", "kees@lamgroep.nl"]);
  });

  it("masks the password and keeps the stored one when the mask comes back", async () => {
    const masked = maskInvoiceInboxConfig(await getInvoiceInboxConfig());
    expect(masked.password).toBe(INVOICE_INBOX_PASSWORD_MASK);
    await saveInvoiceInboxConfig({ ...masked, pollMinutes: 30 }, "test");
    const after = await getInvoiceInboxConfig();
    expect(after.password).toBe("geheim");
    expect(after.pollMinutes).toBe(30);
    expect(maskInvoiceInboxConfig({ ...after, password: "" }).password).toBe("");
  });

  it("refuses other ports, bad sender entries and out-of-range intervals", () => {
    expect(invoiceInboxConfigSchema.safeParse({ port: 25 }).success).toBe(false);
    expect(invoiceInboxConfigSchema.safeParse({ port: 143, secure: false }).success).toBe(true);
    expect(invoiceInboxConfigSchema.safeParse({ allowedSenders: ["garage.nl"] }).success).toBe(false);
    expect(invoiceInboxConfigSchema.safeParse({ allowedSenders: ["naam <a@b.nl>"] }).success).toBe(false);
    expect(invoiceInboxConfigSchema.safeParse({ pollMinutes: 1 }).success).toBe(false);
    expect(invoiceInboxConfigSchema.safeParse({ totalTolerance: -1 }).success).toBe(false);
  });

  it("blocks a port outside the IMAP pair and a private host before any connection", async () => {
    await expect(assertAllowedImapTarget("imap.example.test", 6379)).rejects.toBeInstanceOf(OutboundBlockedError);
    await expect(assertAllowedImapTarget("127.0.0.1", 993)).rejects.toBeInstanceOf(OutboundBlockedError);
  });

  it("returns a deep copy of defaults, not the shared constant, so mutations do not corrupt it", async () => {
    const row = await storage.getAppSettingByKey(INVOICE_INBOX_CONFIG_KEY);
    if (row) {
      // Make the stored value unparsable so safeParse fails
      await storage.updateAppSetting(row.id, { value: { port: 25 } });
    }

    // First call: getInvoiceInboxConfig should return defaults because parsing fails
    const config1 = await getInvoiceInboxConfig();
    expect(config1).toEqual(DEFAULT_INVOICE_INBOX_CONFIG);

    // Mutate the returned config
    config1.enabled = true;
    config1.allowedSenders.push("mutated@example.nl");

    // Second call: should still return pristine defaults
    const config2 = await getInvoiceInboxConfig();
    expect(config2).toEqual(DEFAULT_INVOICE_INBOX_CONFIG);
    expect(config2.enabled).toBe(false);
    expect(config2.allowedSenders).toEqual([]);

    // Verify the shared constant itself is unchanged
    expect(DEFAULT_INVOICE_INBOX_CONFIG.enabled).toBe(false);
    expect(DEFAULT_INVOICE_INBOX_CONFIG.allowedSenders).toEqual([]);
  });
});
