/**
 * FIX-M — mail reliability, logging and injection.
 *
 *   BUG-171 — the pooled transporter had no timeouts and two connections, so
 *             one hanging mail server stopped all mail, password recovery
 *             included.
 *   BUG-080 — TLS certificate validation was switched off for every send.
 *   BUG-186 — the stored `smtpSecure` flag was ignored (derived from a string
 *             comparison against '465').
 *   BUG-100 — fromName/fromEmail were interpolated raw into a header.
 *   BUG-155 — outgoing portal mail was never logged; failures were invisible.
 *   BUG-185 — a bulk send that died halfway logged nothing at all.
 *   BUG-187 — portal-controlled fields rendered as raw HTML in mail.
 *   BUG-196 — a broken staff deep link and a mangled euro sign.
 *
 * Driven by the raw-TCP stub of plan §8.5 — never a real SMTP server.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, like, sql } from "drizzle-orm";
import { db } from "../db";
import { emailLogs } from "../../shared/schema";
import { withSmtpStub, decodeBody } from "./helpers/smtpStub";
import { sendEmail, resolveEmailConfig, describeTransportOptions, isSafeHeaderValue } from "../utils/email-service";
import { renderTemplate, renderTemplateText, escapeHtml } from "../services/portal-mail";
import { absoluteStaffLink } from "../services/portal-notifications";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";

const SUBJECT_PREFIX = "FIXT-mail";

let admin: TestAgent;

beforeAll(async () => {
  admin = await agentFor("admin");
});

afterAll(async () => {
  await db.delete(emailLogs).where(like(emailLogs.subject, `${SUBJECT_PREFIX}%`));
  await cleanupFixtureUsers();
});

async function logsFor(subject: string) {
  return db.select().from(emailLogs).where(eq(emailLogs.subject, subject));
}

describe("FIX-M — delivery", () => {
  it("logs a successful send with the recipient and the template (BUG-155)", async () => {
    const subject = `${SUBJECT_PREFIX} ok ${Date.now()}`;
    const sent = await withSmtpStub("ok", async (stub) => {
      const ok = await sendEmail({
        to: "klant@fixture-test.invalid",
        subject,
        html: "<p>Hallo</p>",
        text: "Hallo",
      }, "custom");
      expect(stub.state.messages.length).toBe(1);
      return ok;
    });

    expect(sent).toBe(true);
    const rows = await logsFor(subject);
    expect(rows.length).toBe(1);
    expect(rows[0].result).toBe("sent");
    expect(rows[0].recipient).toBe("klant@fixture-test.invalid");
    expect(rows[0].template).toBe("custom");
    expect(rows[0].emailsSent).toBe(1);
  }, 40_000);

  it("a silent mail server fails the send in seconds, and says so in the log (BUG-171)", async () => {
    const subject = `${SUBJECT_PREFIX} silent ${Date.now()}`;
    const started = Date.now();
    const sent = await withSmtpStub("silent", async () =>
      sendEmail({ to: "klant@fixture-test.invalid", subject, html: "<p>x</p>" }, "custom"),
    );
    const elapsed = Date.now() - started;

    expect(sent).toBe(false);
    // Without connectionTimeout/greetingTimeout this hangs until vitest gives up.
    expect(elapsed).toBeLessThan(15_000);
    const rows = await logsFor(subject);
    expect(rows.length).toBe(1);
    expect(rows[0].result).toBe("failed");
    expect(rows[0].failureReason).toBeTruthy();
  }, 40_000);

  it("logs one row per attempted recipient, even when a later one fails (BUG-185)", async () => {
    const stamp = Date.now();
    const subjects = [`${SUBJECT_PREFIX} bulk1 ${stamp}`, `${SUBJECT_PREFIX} bulk2 ${stamp}`];
    await withSmtpStub("ok", async (stub) => {
      await sendEmail({ to: "een@fixture-test.invalid", subject: subjects[0], html: "<p>1</p>" }, "custom");
      // The server dies between the two messages, as a real relay does.
      stub.setMode("drop");
      stub.dropAll();
      await sendEmail({ to: "twee@fixture-test.invalid", subject: subjects[1], html: "<p>2</p>" }, "custom");
    });

    const [first] = await logsFor(subjects[0]);
    const [second] = await logsFor(subjects[1]);
    expect(first?.result).toBe("sent");
    expect(second).toBeTruthy();
    expect(second.result).toBe("failed");
    expect(second.recipient).toBe("twee@fixture-test.invalid");
  }, 40_000);
});

describe("FIX-M — the message itself", () => {
  it("escapes a portal-controlled variable instead of sending live HTML (BUG-187)", async () => {
    const subject = `${SUBJECT_PREFIX} escape ${Date.now()}`;
    const html = renderTemplate("<p>Beste {{name}},</p><p>{{description}}</p>", {
      name: "Klant",
      description: '<img src=x onerror=alert(1)>',
    });

    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img");

    const raw = await withSmtpStub("ok", async (stub) => {
      await sendEmail({ to: "staff@fixture-test.invalid", subject, html }, "custom");
      return stub.state.messages[0]?.raw ?? "";
    });

    const body = decodeBody(raw);
    expect(body).toContain("&lt;img");
    expect(body).not.toMatch(/<img\s+src=x\s+onerror/);
  }, 40_000);

  it("keeps a euro sign and a deep link intact in the body (BUG-196)", async () => {
    const subject = `${SUBJECT_PREFIX} euro ${Date.now()}`;
    const link = absoluteStaffLink("https://portaal.example.test", "/portal-admin?request=42");
    expect(link).toBe("https://portaal.example.test/portal-admin?request=42");

    const raw = await withSmtpStub("ok", async (stub) => {
      await sendEmail({
        to: "klant@fixture-test.invalid",
        subject,
        html: renderTemplate("<p>Bedrag <strong>€ {{amount}}</strong></p><p><a href=\"{{link}}\">Openen in de app</a></p>", {
          amount: "42.50",
          link,
        }),
      }, "custom");
      return stub.state.messages[0]?.raw ?? "";
    });

    const body = decodeBody(raw);
    expect(body).toContain("€ 42.50");
    expect(body).toContain("request=42");
    expect(body).not.toContain("â¬");
  }, 40_000);

  it("a subject keeps its ampersand while the body escapes it", () => {
    expect(renderTemplateText("Onderhoud {{plate}}", { plate: "AB-12-CD & co" })).toBe("Onderhoud AB-12-CD & co");
    expect(escapeHtml("AB & CO")).toBe("AB &amp; CO");
  });
});

describe("FIX-M — configuration", () => {
  it("honours the stored smtpSecure flag and validates the certificate (BUG-186, BUG-080)", async () => {
    await withSmtpStub("ok", async () => {
      const config = await resolveEmailConfig("custom");
      expect(config).toBeTruthy();
      expect(config!.smtpSecure).toBe(true);
      const options = describeTransportOptions(config!);
      expect(options.secure).toBe(true);
      expect(options.rejectUnauthorized).toBe(true);
      expect(options.connectionTimeout).toBe(10000);
      expect(options.greetingTimeout).toBe(10000);
      expect(options.socketTimeout).toBe(10000);
    }, { config: { smtpSecure: true, smtpPort: "587" } });
  }, 40_000);

  it("rejects a fromName carrying a header injection at save time (BUG-100)", async () => {
    expect(isSafeHeaderValue("Lam Groep")).toBe(true);
    expect(isSafeHeaderValue("Lam Groep\r\nBcc: evil@example.test")).toBe(false);

    const res = await admin.post("/api/app-settings").send({
      key: "FIXT_email_injection",
      category: "email",
      value: JSON.stringify({
        fromEmail: "noreply@fixture-test.invalid",
        fromName: "Lam Groep\r\nBcc: evil@example.test",
        smtpHost: "127.0.0.1",
        smtpPort: "587",
        smtpUser: "x",
        smtpPassword: "y",
      }),
    });

    expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/fromName/);
  }, 40_000);

  it("rejects an impossible SMTP port and a malformed from address (BUG-100)", async () => {
    const res = await admin.post("/api/app-settings").send({
      key: "FIXT_email_port",
      category: "email",
      value: JSON.stringify({
        fromEmail: "not-an-address",
        smtpHost: "127.0.0.1",
        smtpPort: "70000",
        smtpUser: "x",
        smtpPassword: "y",
      }),
    });

    expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(400);
    const body = JSON.stringify(res.body);
    expect(body).toMatch(/smtpPort/);
    expect(body).toMatch(/fromEmail/);
  }, 40_000);
});
