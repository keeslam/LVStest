/**
 * Signing a contract in the customer portal (Kees, 2026-10-18): only the own customer's administrator
 * signs, only the current version, only the file that was shown, once; the signed PDF lands on the
 * reservation and the office sees the audit trail, with a fresh check that nothing changed since.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { PDFDocument } from "pdf-lib";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn(async () => true) }));
vi.mock("../utils/email-service", () => ({ sendEmail }));

import { buildPortalTestApp, buildStaffTestApp, createTestCustomer, createTestVehicle, createTestReservation, createTestDriver, cleanupPortalTestData, TEST_EMAIL_DOMAIN } from "./portal-helpers";
import { portalStorage } from "../services/portal-storage";
import { hashPassword } from "../auth";
import { db } from "../db";
import { documents, portalContractSignatures, auditLogs, UserPermission } from "../../shared/schema";
import { resolveDocumentFilePath } from "../services/document-paths";
import { getUploadsDir } from "../../shared/paths";
import { eq, like } from "drizzle-orm";
import contractSignaturesRoutes from "../routes/contract-signatures";
import { registerPortalAdminRoutes } from "../routes/portal-admin";
import { sha256 } from "../services/contract-signing";
import { customerNotifications } from "../services/portal-customer-notifications";
import { agentFor, anonAgent, cleanupFixtureUsers } from "./helpers/app";

const password = "wachtwoord-1234";
const TEST_DIR = path.join(getUploadsDir(), "__portal_test__", "signing");

/** A real PNG with some noise in it, so it is a non-empty drawing of a sane size. */
function signaturePng(width = 120, height = 40): string {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const o = y * (width * 4 + 1) + 1 + x * 4;
      const ink = (x * 7 + y * 13) % 11 === 0;
      raw[o] = 0; raw[o + 1] = 0; raw[o + 2] = 0; raw[o + 3] = ink ? 255 : 0;
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

async function contractPdf(label: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText(`Huurcontract ${label}`, { x: 50, y: 700 });
  return Buffer.from(await pdf.save());
}

let fileCounter = 0;
async function createContract(reservationId: number, vehicleId: number, opts: { version?: number; isStale?: boolean; documentType?: string } = {}) {
  fs.mkdirSync(TEST_DIR, { recursive: true });
  fileCounter += 1;
  const bytes = await contractPdf(`${reservationId}-${fileCounter}`);
  const file = path.join(TEST_DIR, `contract-${Date.now()}-${fileCounter}.pdf`);
  fs.writeFileSync(file, bytes);
  const [row] = await db.insert(documents).values({
    reservationId, vehicleId, documentType: opts.documentType ?? "Contract (Unsigned)", fileName: path.basename(file),
    filePath: path.relative(process.cwd(), file).split(path.sep).join("/"), fileSize: bytes.length, contentType: "application/pdf",
    version: opts.version ?? 1, isStale: opts.isStale ?? false,
  }).returning();
  return { doc: row, sha: sha256(bytes) };
}

describe("signing a contract in the portal", () => {
  const app = buildPortalTestApp();
  const staffApp = buildStaffTestApp([UserPermission.VIEW_DOCUMENTS], (a) => a.use("/api/contract-signatures", contractSignaturesRoutes));
  let customerA: number, customerB: number, vehicleA: number, vehicleB: number, resA: number, resB: number;
  let contractA: { doc: typeof documents.$inferSelect; sha: string };
  let contractB: { doc: typeof documents.$inferSelect; sha: string };

  const login = async (email: string) => {
    const agent = request.agent(app);
    const res = await agent.post("/api/portal/login").send({ email, password });
    expect(res.status).toBe(200);
    const csrf = (await agent.get("/api/portal/csrf-token")).body.token as string;
    return { agent, csrf, sign: (id: number, body: object) => agent.post(`/api/portal/documents/${id}/sign`).set("X-CSRF-Token", csrf).send(body) };
  };
  const mk = async (customerId: number, email: string, role: "admin" | "driver", extra: Record<string, unknown> = {}) => {
    const u = await portalStorage.createPortalUser({ customerId, email, fullName: `Naam ${email.split("@")[0]}`, role, ...extra }, "t");
    await portalStorage.updatePortalUser(u.id, { passwordHash: await hashPassword(password) });
  };
  const body = (sha: string, extra: Record<string, unknown> = {}) => ({ name: "Jan Klant", agree: true, signature: signaturePng(), documentSha256: sha, ...extra });

  beforeAll(async () => {
    await cleanupPortalTestData();
    customerA = (await createTestCustomer("SignA")).id;
    customerB = (await createTestCustomer("SignB")).id;
    vehicleA = (await createTestVehicle()).id;
    vehicleB = (await createTestVehicle()).id;
    const driverA = (await createTestDriver(customerA, "Bestuurder A")).id;
    resA = (await createTestReservation({ customerId: customerA, vehicleId: vehicleA, driverId: driverA, status: "booked", endDate: "2099-12-31" })).id;
    resB = (await createTestReservation({ customerId: customerB, vehicleId: vehicleB, status: "booked", endDate: "2099-12-31" })).id;
    await mk(customerA, `sign-a-admin@${TEST_EMAIL_DOMAIN}`, "admin");
    await mk(customerA, `sign-a-driver@${TEST_EMAIL_DOMAIN}`, "driver", { driverId: driverA });
    await mk(customerB, `sign-b-admin@${TEST_EMAIL_DOMAIN}`, "admin");
    contractA = await createContract(resA, vehicleA);
    contractB = await createContract(resB, vehicleB);
  });
  afterAll(async () => {
    await db.delete(auditLogs).where(like(auditLogs.username, `portaal:%@${TEST_EMAIL_DOMAIN}`));
    await cleanupPortalTestData();
    await cleanupFixtureUsers();
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    for (const v of [vehicleA, vehicleB]) fs.rmSync(path.join(getUploadsDir(), "documents", String(v)), { recursive: true, force: true });
  });

  describe("another customer gets nothing", () => {
    it("404 on the signing info, the sign action and the download of someone else's contract", async () => {
      const b = await login(`sign-b-admin@${TEST_EMAIL_DOMAIN}`);
      expect((await b.agent.get(`/api/portal/documents/${contractA.doc.id}/signing`)).status).toBe(404);
      expect((await b.sign(contractA.doc.id, body(contractA.sha))).status).toBe(404);
      expect((await b.agent.get(`/api/portal/documents/${contractA.doc.id}/download`)).status).toBe(404);
      const list = (await b.agent.get("/api/portal/documents")).body as Array<{ id: number }>;
      expect(list.map((d) => d.id)).not.toContain(contractA.doc.id);
      expect(await db.select().from(portalContractSignatures).where(eq(portalContractSignatures.documentId, contractA.doc.id))).toHaveLength(0);
    });
    it("needs a portal login at all", async () => {
      expect((await request(app).get(`/api/portal/documents/${contractA.doc.id}/signing`)).status).toBe(401);
    });
  });

  describe("only an administrator of the customer signs", () => {
    it("a driver sees the contract but may not sign it (403)", async () => {
      const d = await login(`sign-a-driver@${TEST_EMAIL_DOMAIN}`);
      const info = await d.agent.get(`/api/portal/documents/${contractA.doc.id}/signing`);
      expect(info.status).toBe(200);
      expect(info.body.canSign).toBe(false);
      expect((await d.sign(contractA.doc.id, body(contractA.sha))).status).toBe(403);
    });
    it("refuses without CSRF token", async () => {
      const a = await login(`sign-a-admin@${TEST_EMAIL_DOMAIN}`);
      expect((await a.agent.post(`/api/portal/documents/${contractA.doc.id}/sign`).send(body(contractA.sha))).status).toBe(403);
    });
  });

  describe("what is signed is exactly what was shown", () => {
    it("refuses a fingerprint of another file (409 DOCUMENT_CHANGED)", async () => {
      const a = await login(`sign-a-admin@${TEST_EMAIL_DOMAIN}`);
      const res = await a.sign(contractA.doc.id, body("0".repeat(64)));
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("PORTAL_DOCUMENT_CHANGED");
    });
    it("refuses without agreement, without name or with an empty signature", async () => {
      const a = await login(`sign-a-admin@${TEST_EMAIL_DOMAIN}`);
      expect((await a.sign(contractA.doc.id, body(contractA.sha, { agree: false }))).status).toBe(400);
      expect((await a.sign(contractA.doc.id, body(contractA.sha, { name: " " }))).status).toBe(400);
      expect((await a.sign(contractA.doc.id, body(contractA.sha, { signature: "data:image/png;base64,iVBORw0KGgo=" }))).status).toBe(400);
      expect((await a.sign(contractA.doc.id, body(contractA.sha, { signature: "data:image/svg+xml;base64,PHN2Zz4=" }))).status).toBe(400);
    });
    it("an older or stale version cannot be signed", async () => {
      const old = await createContract(resA, vehicleA, { version: 0 });
      const stale = await createContract(resA, vehicleA, { version: 5, isStale: true });
      const a = await login(`sign-a-admin@${TEST_EMAIL_DOMAIN}`);
      expect((await a.sign(old.doc.id, body(old.sha))).body.code).toBe("PORTAL_NOT_SIGNABLE");
      expect((await a.sign(stale.doc.id, body(stale.sha))).body.code).toBe("PORTAL_NOT_SIGNABLE");
      const list = (await a.agent.get("/api/portal/documents")).body as Array<{ id: number; signing: { status: string } | null }>;
      expect(list.find((d) => d.id === old.doc.id)?.signing?.status).toBe("superseded");
      expect(list.find((d) => d.id === contractA.doc.id)?.signing?.status).toBe("to_sign");
    });
  });

  describe("a signature", () => {
    let signedDocumentId: number;

    it("makes a signed PDF on the reservation with a full audit trail", async () => {
      sendEmail.mockClear();
      const a = await login(`sign-a-admin@${TEST_EMAIL_DOMAIN}`);
      const res = await a.sign(contractA.doc.id, body(contractA.sha)).set("User-Agent", "VitestBrowser/1.0");
      expect(res.status).toBe(201);
      signedDocumentId = res.body.signedDocumentId;

      const [signed] = await db.select().from(documents).where(eq(documents.id, signedDocumentId));
      expect(signed.documentType).toBe("Contract (Signed)");
      expect(signed.reservationId).toBe(resA);
      const bytes = fs.readFileSync(resolveDocumentFilePath(signed.filePath)!);
      expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);

      const [row] = await db.select().from(portalContractSignatures).where(eq(portalContractSignatures.documentId, contractA.doc.id));
      expect(row).toMatchObject({ signerName: "Jan Klant", signerEmail: `sign-a-admin@${TEST_EMAIL_DOMAIN}`, customerId: customerA, reservationId: resA, signedDocumentId, originalSha256: contractA.sha, signedSha256: sha256(bytes), userAgent: "VitestBrowser/1.0" });
      expect(row.ip).toBeTruthy();

      // Customer mail with a link, never the PDF.
      const mails = sendEmail.mock.calls.map((c) => c[0] as { to: string; subject: string; html: string; attachments?: unknown }).filter((m) => m.subject.startsWith("Getekend:"));
      // The company address and the account that signed (a different address here).
      expect(mails.map((m) => m.to).sort()).toEqual([`signa@${TEST_EMAIL_DOMAIN}`, `sign-a-admin@${TEST_EMAIL_DOMAIN}`].sort());
      for (const m of mails) { expect(m.attachments).toBeUndefined(); expect(m.html).toContain("/portaal/documenten"); }
      // And in the staff activity log.
      const audit = await db.select().from(auditLogs).where(eq(auditLogs.action, "portal.contract_signed"));
      expect(audit.some((r) => r.resourceId === String(signedDocumentId))).toBe(true);
    });

    it("cannot be given twice", async () => {
      const a = await login(`sign-a-admin@${TEST_EMAIL_DOMAIN}`);
      const res = await a.sign(contractA.doc.id, body(contractA.sha));
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("PORTAL_ALREADY_SIGNED");
      const list = (await a.agent.get("/api/portal/documents")).body as Array<{ id: number; signing: { status: string; signedBy?: string } | null }>;
      expect(list.find((d) => d.id === contractA.doc.id)?.signing).toMatchObject({ status: "signed", signedBy: "Jan Klant" });
      expect(list.find((d) => d.id === signedDocumentId)?.signing?.status).toBe("signed_copy");
    });

    it("is visible to the office with intact files, and a changed file is reported and not handed out", async () => {
      const ok = await request(staffApp).get(`/api/contract-signatures/reservation/${resA}`);
      expect(ok.status).toBe(200);
      expect(ok.body[0]).toMatchObject({ signerName: "Jan Klant", integrity: { original: "intact", signed: "intact" } });

      const [signed] = await db.select().from(documents).where(eq(documents.id, signedDocumentId));
      const file = resolveDocumentFilePath(signed.filePath)!;
      const original = fs.readFileSync(file);
      fs.writeFileSync(file, Buffer.concat([original, Buffer.from("\n% tampered")]));
      try {
        const changed = await request(staffApp).get(`/api/contract-signatures/reservation/${resA}`);
        expect(changed.body[0].integrity.signed).toBe("changed");
        const a = await login(`sign-a-admin@${TEST_EMAIL_DOMAIN}`);
        expect((await a.agent.get(`/api/portal/documents/${signedDocumentId}/download`)).status).toBe(409);
      } finally {
        fs.writeFileSync(file, original);
      }
    });

    it("locks both documents against delete and retyping by staff", async () => {
      const staff = await agentFor("admin");
      const del = await staff.delete(`/api/documents/${signedDocumentId}`);
      expect(del.status).toBe(409);
      expect(del.body.code).toBe("SIGNED_CONTRACT_LOCKED");
      expect((await staff.delete(`/api/documents/${contractA.doc.id}`)).status).toBe(409);
      expect((await staff.patch(`/api/documents/${contractA.doc.id}`).send({ documentType: "Other" })).status).toBe(409);
    });
  });

  it("a failing notification after signing does not turn the signature into an error", async () => {
    const res2 = (await createTestReservation({ customerId: customerA, vehicleId: vehicleA, status: "booked", startDate: "2099-01-01", endDate: "2099-01-10" })).id;
    const c = await createContract(res2, vehicleA);
    const spy = vi.spyOn(customerNotifications, "notify").mockRejectedValueOnce(new Error('column "params" does not exist'));
    try {
      const a = await login(`sign-a-admin@${TEST_EMAIL_DOMAIN}`);
      expect((await a.sign(c.doc.id, body(c.sha))).status).toBe(201);
    } finally {
      spy.mockRestore();
    }
  });

  describe("a damage form, and the office dashboard (Kees, 2026-10-18)", () => {
    const dashboard = buildStaffTestApp([UserPermission.VIEW_PORTAL], (a) => registerPortalAdminRoutes(a, { requireAuth: (_r: any, _s: any, n: any) => n() } as any));
    const outsider = buildStaffTestApp([UserPermission.VIEW_VEHICLES], (a) => registerPortalAdminRoutes(a, { requireAuth: (_r: any, _s: any, n: any) => n() } as any));
    let damage: Awaited<ReturnType<typeof createContract>>;
    let signatureId: number;

    beforeAll(async () => {
      const res3 = (await createTestReservation({ customerId: customerA, vehicleId: vehicleA, status: "picked_up", startDate: "2098-01-01", endDate: "2098-01-20" })).id;
      damage = await createContract(res3, vehicleA, { documentType: "Damage Check (Unsigned)" });
    });

    it("shows the damage form as waiting for a signature, to the office and to the customer", async () => {
      const list = await request(dashboard).get("/api/portal-admin/signatures");
      expect(list.status).toBe(200);
      expect(list.body.awaiting).toEqual(expect.arrayContaining([expect.objectContaining({ documentId: damage.doc.id, documentKind: "damage_check" })]));
      const a = await login(`sign-a-admin@${TEST_EMAIL_DOMAIN}`);
      const docs = (await a.agent.get("/api/portal/documents")).body as Array<{ id: number; signing: { status: string } | null }>;
      expect(docs.find((d) => d.id === damage.doc.id)?.signing?.status).toBe("to_sign");
    });

    it("signs the damage form into a 'Damage Check (Signed)' copy", async () => {
      const a = await login(`sign-a-admin@${TEST_EMAIL_DOMAIN}`);
      const res = await a.sign(damage.doc.id, body(damage.sha));
      expect(res.status).toBe(201);
      const [signed] = await db.select().from(documents).where(eq(documents.id, res.body.signedDocumentId));
      expect(signed.documentType).toBe("Damage Check (Signed)");
      const [row] = await db.select().from(portalContractSignatures).where(eq(portalContractSignatures.documentId, damage.doc.id));
      expect(row.documentKind).toBe("damage_check");
      signatureId = row.id;
    });

    it("puts it on the dashboard until somebody has seen it", async () => {
      const before = (await request(dashboard).get("/api/portal-admin/dashboard")).body;
      expect(before.counts.signedNew).toBeGreaterThanOrEqual(1);
      expect(before.attention.signatures.map((s: { id: number }) => s.id)).toContain(signatureId);
      const list = (await request(dashboard).get("/api/portal-admin/signatures")).body;
      expect(list.awaiting.map((r: { documentId: number }) => r.documentId)).not.toContain(damage.doc.id);
      expect(list.signed.find((r: { id: number }) => r.id === signatureId)).toMatchObject({ documentKind: "damage_check", signerName: "Jan Klant", seenAt: null });

      expect((await request(dashboard).post(`/api/portal-admin/signatures/${signatureId}/seen`)).status).toBe(200);
      const after = (await request(dashboard).get("/api/portal-admin/dashboard")).body;
      expect(after.counts.signedNew).toBe(before.counts.signedNew - 1);
      expect(after.attention.signatures.map((s: { id: number }) => s.id)).not.toContain(signatureId);
      const row = (await request(dashboard).get("/api/portal-admin/signatures")).body.signed.find((r: { id: number }) => r.id === signatureId);
      expect(row).toMatchObject({ seenBy: "staff-test" });
      expect(row.seenAt).toBeTruthy();
    });

    it("the tablet checks at pickup and return can each be signed on their own (Kees, 2026-10-18)", async () => {
      const res4 = (await createTestReservation({ customerId: customerA, vehicleId: vehicleA, status: "picked_up", startDate: "2097-01-01", endDate: "2097-01-20" })).id;
      const pickup = await createContract(res4, vehicleA, { documentType: "Damage Check (Pickup)" });
      const ret = await createContract(res4, vehicleA, { documentType: "Damage Check (Return)" });
      const a = await login(`sign-a-admin@${TEST_EMAIL_DOMAIN}`);
      const states = () => a.agent.get("/api/portal/documents").then((r) => r.body as Array<{ id: number; kind: string; signing: { status: string } | null }>);
      let docs = await states();
      expect(docs.find((d) => d.id === pickup.doc.id)).toMatchObject({ kind: "damage_check", signing: { status: "to_sign" } });
      expect(docs.find((d) => d.id === ret.doc.id)?.signing?.status).toBe("to_sign");

      const res = await a.sign(pickup.doc.id, body(pickup.sha));
      expect(res.status).toBe(201);
      const [signed] = await db.select().from(documents).where(eq(documents.id, res.body.signedDocumentId));
      expect(signed.documentType).toBe("Damage Check (Signed)");
      docs = await states();
      expect(docs.find((d) => d.id === pickup.doc.id)?.signing?.status).toBe("signed");
      // The return check is another document: still to sign, and on the office's waiting list.
      expect(docs.find((d) => d.id === ret.doc.id)?.signing?.status).toBe("to_sign");
      const awaiting = (await request(dashboard).get("/api/portal-admin/signatures")).body.awaiting.map((r: { documentId: number }) => r.documentId);
      expect(awaiting).toContain(ret.doc.id);
      expect(awaiting).not.toContain(pickup.doc.id);
    });

    it("is closed to staff without the portal right", async () => {
      expect((await request(outsider).get("/api/portal-admin/signatures")).status).toBe(403);
      expect((await request(outsider).post(`/api/portal-admin/signatures/${signatureId}/seen`)).status).toBe(403);
      expect((await request(dashboard).post("/api/portal-admin/signatures/999999999/seen")).status).toBe(404);
    });
  });

  it("two signatures at the same moment: exactly one wins, one signed PDF", async () => {
    const b = await login(`sign-b-admin@${TEST_EMAIL_DOMAIN}`);
    const results = await Promise.all([b.sign(contractB.doc.id, body(contractB.sha)), b.sign(contractB.doc.id, body(contractB.sha))]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const signedCopies = (await db.select().from(documents).where(eq(documents.reservationId, resB))).filter((d) => d.documentType === "Contract (Signed)");
    expect(signedCopies).toHaveLength(1);
  });

  it("the office route (as mounted by mountStaffRouters) needs a login and the document permission", async () => {
    const anon = await anonAgent();
    expect((await anon.get(`/api/contract-signatures/reservation/${resA}`)).status).toBe(401);
    const noPerm = await agentFor([UserPermission.VIEW_VEHICLES]);
    expect((await noPerm.get(`/api/contract-signatures/reservation/${resA}`)).status).toBe(403);
    const viewer = await agentFor([UserPermission.VIEW_DOCUMENTS]);
    expect((await viewer.get(`/api/contract-signatures/reservation/${resA}`)).status).toBe(200);
  });
});
