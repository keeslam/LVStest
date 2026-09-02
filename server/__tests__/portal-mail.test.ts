import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn(async () => true) }));
vi.mock("../utils/email-service", () => ({ sendEmail }));
vi.mock("../services/portal-config", () => ({
  getPortalConfig: async () => ({ allowedFrameOrigins: [], notificationEmail: "", portalBaseUrl: "https://portaal.lamgroep.nl" }),
}));

import { renderTemplate, sendPortalInvite, ensurePortalEmailTemplates } from "../services/portal-mail";
import { portalStorage } from "../services/portal-storage";
import { createTestCustomer, cleanupPortalTestData, TEST_EMAIL_DOMAIN } from "./portal-helpers";

describe("portal mail", () => {
  beforeAll(async () => { await cleanupPortalTestData(); await ensurePortalEmailTemplates(); });
  afterAll(cleanupPortalTestData);

  it("replaces placeholders and leaves unknown ones empty", () => {
    expect(renderTemplate("Hoi {{name}}, {{link}} {{nope}}", { name: "Kees", link: "x" })).toBe("Hoi Kees, x ");
  });

  it("stores a token hash with expiry and mails the activation link", async () => {
    const c = await createTestCustomer("Mail");
    const user = await portalStorage.createPortalUser({ customerId: c.id, email: `mail@${TEST_EMAIL_DOMAIN}`, fullName: "Mail", role: "admin" }, "t");
    const result = await sendPortalInvite(user, "invite");
    expect(result.sent).toBe(true);
    const stored = await portalStorage.getPortalUser(user.id);
    expect(stored?.inviteTokenHash).toBeTruthy();
    expect(stored?.inviteExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 71 * 3600 * 1000);
    const call = sendEmail.mock.calls[0][0] as any;
    expect(call.to).toBe(`mail@${TEST_EMAIL_DOMAIN}`);
    expect(call.html).toContain(`https://portaal.lamgroep.nl/portaal/activeren?token=${result.token}`);
  });
});
