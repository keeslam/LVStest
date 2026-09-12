/**
 * OPT-013 — "Elke uitgaande mail loggen en de status tonen".
 *
 * FIX-M built the logging (a row per attempt, success and failure, plus the
 * SMTP timeout) and is pinned in `fix-m-mail.test.ts`. What the proposal is
 * really about is the question it wanted answered — "heeft de klant het
 * contract gekregen?" — and that question is asked about **one document**.
 * Measured before: three failed sends left `email_logs` unchanged at 12, with
 * no notification, no flag on the document and no audit line.
 *
 * So this file pins the two things that were missing: the log row knows which
 * document it carried, and the document can be asked about.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, like } from "drizzle-orm";
import { db } from "../db";
import { emailLogs } from "../../shared/schema";
import { withSmtpStub } from "./helpers/smtpStub";
import { sendEmail } from "../utils/email-service";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";

const SUBJECT_PREFIX = "FIXT-opt013";

let admin: TestAgent;
let reader: TestAgent;

beforeAll(async () => {
  admin = await agentFor("admin");
  reader = await agentFor(["view_vehicles"]);
});

afterAll(async () => {
  await db.delete(emailLogs).where(like(emailLogs.subject, `${SUBJECT_PREFIX}%`));
  await cleanupFixtureUsers();
});

async function logsFor(subject: string) {
  return db.select().from(emailLogs).where(eq(emailLogs.subject, subject));
}

describe("OPT-013 — de mailstatus hoort bij het document", () => {
  it("files a successful send under the document it carried", async () => {
    const subject = `${SUBJECT_PREFIX} ok ${Date.now()}`;
    const sent = await withSmtpStub("ok", async () =>
      sendEmail({
        to: "klant@fixture-test.invalid",
        subject,
        html: "<p>Contract</p>",
        logDocumentIds: [910001],
      }, "documents"),
    );

    expect(sent).toBe(true);
    const rows = await logsFor(subject);
    expect(rows).toHaveLength(1);
    expect(rows[0].documentId).toBe(910001);
    expect(rows[0].result).toBe("sent");
  }, 40_000);

  it("files a failed send under the document too, so it is visible afterwards", async () => {
    const subject = `${SUBJECT_PREFIX} fail ${Date.now()}`;
    const sent = await withSmtpStub("silent", async () =>
      sendEmail({
        to: "klant@fixture-test.invalid",
        subject,
        html: "<p>Contract</p>",
        logDocumentIds: [910002],
      }, "documents"),
    );

    expect(sent).toBe(false);
    const rows = await logsFor(subject);
    expect(rows).toHaveLength(1);
    expect(rows[0].documentId).toBe(910002);
    expect(rows[0].result).toBe("failed");
    expect(rows[0].failureReason).toBeTruthy();
  }, 40_000);

  it("a send of three documents is answerable for each of them", async () => {
    const subject = `${SUBJECT_PREFIX} multi ${Date.now()}`;
    await withSmtpStub("ok", async () =>
      sendEmail({
        to: "klant@fixture-test.invalid",
        subject,
        html: "<p>Drie stukken</p>",
        logDocumentIds: [910003, 910004, 910005],
      }, "documents"),
    );

    const rows = await logsFor(subject);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.documentId).sort()).toEqual([910003, 910004, 910005]);
  }, 40_000);

  it("mail that carries no document still writes exactly one row (FIX-M unchanged)", async () => {
    const subject = `${SUBJECT_PREFIX} plain ${Date.now()}`;
    await withSmtpStub("ok", async () =>
      sendEmail({ to: "klant@fixture-test.invalid", subject, html: "<p>APK</p>" }, "custom"),
    );

    const rows = await logsFor(subject);
    expect(rows).toHaveLength(1);
    expect(rows[0].documentId).toBeNull();
  }, 40_000);

  it("the document can be asked, newest attempt first", async () => {
    const first = `${SUBJECT_PREFIX} first ${Date.now()}`;
    await withSmtpStub("ok", async () =>
      sendEmail({ to: "een@fixture-test.invalid", subject: first, html: "<p>1</p>", logDocumentIds: [910006] }, "documents"),
    );
    const second = `${SUBJECT_PREFIX} second ${Date.now() + 1}`;
    await withSmtpStub("silent", async () =>
      sendEmail({ to: "twee@fixture-test.invalid", subject: second, html: "<p>2</p>", logDocumentIds: [910006] }, "documents"),
    );

    const res = await admin.get("/api/documents/910006/email-status");
    expect(res.status).toBe(200);
    expect(res.body.attempts.length).toBeGreaterThanOrEqual(2);
    // The most recent attempt is the state the document is in now — a failure
    // after a success is exactly the case the report cares about.
    expect(res.body.attempts[0].result).toBe("failed");
    expect(res.body.attempts[0].recipient).toBe("twee@fixture-test.invalid");
  }, 60_000);

  it("a document that was never mailed answers with an empty list, not an error", async () => {
    const res = await admin.get("/api/documents/910999/email-status");
    expect(res.status).toBe(200);
    expect(res.body.attempts).toEqual([]);
  });

  it("refuses an invalid id and an account without the documents permission", async () => {
    expect((await admin.get("/api/documents/abc/email-status")).status).toBe(400);
    expect((await reader.get("/api/documents/910006/email-status")).status).toBe(403);
  });
});
