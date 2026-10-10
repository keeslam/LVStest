/**
 * Audit remediation P5, A-6-3 - "Mail naar klant" answered a failed send with
 * an English sentence the screen then showed as it was. The sentence stays
 * English (server messages do); the answer now also carries a stable `code`
 * the client words in Dutch/English.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { eq, like } from "drizzle-orm";
import { useTempUploadsDir, removeTempUploadsDir } from "./helpers/uploads";

const uploadsDir = useTempUploadsDir("lvs-p5-mail-");

import { db } from "../db";
import { documents, emailLogs, type Vehicle } from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { createFixtureVehicle, cleanupFixtures } from "./helpers/fixtures";
import { withSmtpStub } from "./helpers/smtpStub";

const SUBJECT = "FIXT-p5-send-documents";

let admin: TestAgent;
let vehicle: Vehicle;
let documentId: number;

beforeAll(async () => {
  admin = await agentFor("admin");
  vehicle = await createFixtureVehicle();
  fs.writeFileSync(path.join(uploadsDir, "p5-contract.pdf"), "%PDF-1.4\n%%EOF\n");
  const [doc] = await db.insert(documents).values({
    vehicleId: vehicle.id,
    documentType: "Contract (Unsigned)",
    fileName: "p5-contract.pdf",
    filePath: "p5-contract.pdf",
    fileSize: 15,
    contentType: "application/pdf",
  }).returning();
  documentId = doc.id;
});

afterAll(async () => {
  await db.delete(emailLogs).where(like(emailLogs.subject, `${SUBJECT}%`));
  await db.delete(documents).where(eq(documents.vehicleId, vehicle.id));
  await cleanupFixtures();
  await cleanupFixtureUsers();
  removeTempUploadsDir(uploadsDir);
});

describe("A-6-3 - POST /api/email/send-documents names a failed send by code", () => {
  it("answers 500 with EMAIL_SEND_FAILED when the mail server refuses, message unchanged", async () => {
    const res = await withSmtpStub("auth535", async () =>
      admin.post("/api/email/send-documents").send({
        documentIds: [documentId],
        recipientEmail: "klant@fixture-test.invalid",
        subject: `${SUBJECT} ${Date.now()}`,
        message: "Contract",
      }),
    );
    expect(res.status).toBe(500);
    expect(res.body.code).toBe("EMAIL_SEND_FAILED");
    expect(res.body.message).toBe("Failed to send email. Please check your email configuration in Settings.");
  }, 40_000);

  it("a server error that is not a mail failure gets its own code, not the mail one (round 1)", async () => {
    // A document id the database cannot parse throws inside the route (the generic catch).
    const res = await admin.post("/api/email/send-documents").send({
      documentIds: ["not-a-number"],
      recipientEmail: "klant@fixture-test.invalid",
      subject: `${SUBJECT} catch ${Date.now()}`,
      message: "Contract",
    });
    expect(res.status).toBe(500);
    expect(res.body.code).toBe("SEND_DOCUMENTS_FAILED");
    expect(res.body.message).toBe("Failed to send email");
  }, 40_000);

  it("a send that works carries no error code", async () => {
    const res = await withSmtpStub("ok", async () =>
      admin.post("/api/email/send-documents").send({
        documentIds: [documentId],
        recipientEmail: "klant@fixture-test.invalid",
        subject: `${SUBJECT} ok ${Date.now()}`,
        message: "Contract",
      }),
    );
    expect(res.status).toBe(200);
    expect(res.body.code).toBeUndefined();
  }, 40_000);
});
