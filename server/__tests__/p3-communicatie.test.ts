/**
 * Audit remediation P3 (Communicatie), findings A-13-2 and A-13-6.
 *
 *  - A-13-6: the send path replaced `{customerName}` only; a template written
 *    with `{{customerName}}` (the portal style) reached the customer as typed.
 *  - A-13-2: the reason of a failed mail was stored as English prose only. Every
 *    reason now starts with a stable code the client translates, and the
 *    errors a run answers with carry the same codes.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { eq, like } from "drizzle-orm";
import { db } from "../db";
import { customers, emailLogs } from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { createFixtureCustomer, cleanupFixtures } from "./helpers/fixtures";
import { withSmtpStub, decodeBody } from "./helpers/smtpStub";
import { sendEmail, clearEmailConfigCache } from "../utils/email-service";
import { storage } from "../storage";
import { renderTemplate } from "../services/portal-mail";

const SUBJECT_PREFIX = "FIXT-p3";

let admin: TestAgent;

beforeAll(async () => {
  admin = await agentFor("admin");
}, 60_000);

afterAll(async () => {
  await db.delete(emailLogs).where(like(emailLogs.subject, `${SUBJECT_PREFIX}%`));
  await cleanupFixtures();
  await cleanupFixtureUsers();
});

async function customerWithEmail(label: string): Promise<{ id: number; name: string; email: string }> {
  const row = await createFixtureCustomer(label);
  const email = `${label.toLowerCase()}-${row.id}@fixture-test.invalid`;
  await db.update(customers).set({ email }).where(eq(customers.id, row.id));
  return { id: row.id, name: row.name, email };
}

describe("A-13-6 - one replacer for both placeholder styles", () => {
  it("a custom message with {customerName} and {{customerName}} reaches the customer filled in", async () => {
    const customer = await customerWithEmail("P3dubbel");
    const subject = `${SUBJECT_PREFIX} {{customerName}} ${Date.now()}`;
    const body = await withSmtpStub("ok", async (stub) => {
      const res = await admin.post("/api/notifications/send").send({
        customerIds: [customer.id],
        template: "custom",
        customSubject: subject,
        customMessage: "Een: {customerName}. Twee: {{customerName}}. Drie: {{ customerName }}.",
      });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.sent).toBe(1);
      expect(stub.state.messages).toHaveLength(1);
      return { text: decodeBody(stub.state.messages[0].raw), subject: stub.state.messages[0].subject ?? "" };
    });

    expect(body.text).toContain(`Een: ${customer.name}. Twee: ${customer.name}. Drie: ${customer.name}.`);
    expect(body.text).not.toContain("{{");
    expect(body.subject).toContain(customer.name);
    expect(body.subject).not.toContain("{{");
    await db.delete(emailLogs).where(like(emailLogs.subject, `${SUBJECT_PREFIX}%`));
  }, 60_000);

  it("the portal renderer also reads the single-brace style for keys it knows, and still blanks unknown double braces", () => {
    expect(renderTemplate("Hoi {name} en {{name}}, {{nope}}{css}", { name: "Kees" })).toBe("Hoi Kees en Kees, {css}");
    // The escaping of portal-controlled values stays.
    expect(renderTemplate("{{name}} {name}", { name: "<b>x</b>" })).toBe("&lt;b&gt;x&lt;/b&gt; &lt;b&gt;x&lt;/b&gt;");
  });
});

describe("A-13-2 - stable codes in the stored reasons", () => {
  it("a mail with no e-mail configuration is logged as NO_EMAIL_CONFIG", async () => {
    const subject = `${SUBJECT_PREFIX} geen-config ${Date.now()}`;
    clearEmailConfigCache();
    const spy = vi.spyOn(storage, "getAppSettingsByCategory").mockResolvedValue([]);
    try {
      const sent = await sendEmail({ to: "klant@fixture-test.invalid", subject, html: "<p>x</p>" }, "custom");
      expect(sent).toBe(false);
    } finally {
      spy.mockRestore();
      clearEmailConfigCache();
    }
    const [row] = await db.select().from(emailLogs).where(eq(emailLogs.subject, subject));
    expect(row.result).toBe("failed");
    expect(row.failureReason).toMatch(/^NO_EMAIL_CONFIG: No valid email configuration for purpose: custom$/);
  }, 40_000);

  it("a recipient with a line break is logged as UNSAFE_HEADER", async () => {
    const subject = `${SUBJECT_PREFIX} header ${Date.now()}`;
    await withSmtpStub("ok", async () => {
      const sent = await sendEmail({ to: "a@fixture-test.invalid\nbcc: b@x.invalid", subject, html: "<p>x</p>" }, "custom");
      expect(sent).toBe(false);
    });
    const [row] = await db.select().from(emailLogs).where(eq(emailLogs.subject, subject));
    expect(row.failureReason).toMatch(/^UNSAFE_HEADER: /);
  }, 40_000);

  it("a run that fails answers with coded errors, and the summary row stores the same codes", async () => {
    const customer = await customerWithEmail("P3mislukt");
    const subject = `${SUBJECT_PREFIX} run ${Date.now()}`;
    clearEmailConfigCache();
    const spy = vi.spyOn(storage, "getAppSettingsByCategory").mockResolvedValue([]);
    let body: any;
    try {
      const res = await admin.post("/api/notifications/send").send({
        customerIds: [customer.id], template: "custom", customSubject: subject, customMessage: "Hallo",
      });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      body = res.body;
    } finally {
      spy.mockRestore();
      clearEmailConfigCache();
    }

    expect(body.sent).toBe(0);
    expect(body.failed).toBe(1);
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0]).toMatch(/^SEND_FAILED: Failed to send to /);

    const rows = await db.select().from(emailLogs).where(eq(emailLogs.subject, subject));
    const summary = rows.find((row) => !row.recipient);
    const attempt = rows.find((row) => row.recipient);
    expect(summary?.failureReason).toMatch(/^SEND_FAILED: /);
    expect(attempt?.failureReason).toMatch(/^NO_EMAIL_CONFIG: /);
  }, 60_000);

  it("asking for an address the customer does not have is NO_ADDRESS", async () => {
    const customer = await customerWithEmail("P3geenadres");
    const subject = `${SUBJECT_PREFIX} adres ${Date.now()}`;
    const res = await withSmtpStub("ok", async () =>
      admin.post("/api/notifications/send").send({
        customerIds: [customer.id], template: "custom", customSubject: subject, customMessage: "Hallo",
        emailFieldSelection: "emailForInvoices",
      }),
    );
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.failed).toBe(1);
    expect(res.body.errors[0]).toMatch(/^NO_ADDRESS: No emailForInvoices email for customer /);
  }, 60_000);
});
