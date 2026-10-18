/**
 * Security review 2026-10-18, the three findings rated Hoog
 * (docs/audit/beveiliging-klantgegevens-2026-10-18.md):
 *  1. a staff document is served with a type the server decides, and a damage check uploaded with
 *     a reservation is checked on its content;
 *  2. the live connection only takes an existing, active staff user (fix-j-socket.test.ts covers the
 *     real handshake; here the decision itself);
 *  3. an account that is switched off, or whose password someone else resets, is logged out at once.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { useTempUploadsDir, removeTempUploadsDir, tinyPdf } from "./helpers/uploads";

// MUST run before anything builds the app: registerRoutes() resolves the uploads directory once.
const TEMP_UPLOADS = useTempUploadsDir("lvs-sec1018-");

const { db } = await import("../db");
const { documents, users, reservations } = await import("../../shared/schema");
const { eq } = await import("drizzle-orm");
const { agentFor, cleanupFixtureUsers } = await import("./helpers/app");
const { createFixtureCustomer, createFixtureVehicle, cleanupFixtures } = await import("./helpers/fixtures");
const { staffUserIdForSocket } = await import("../utils/security/socket-auth");

type Agent = Awaited<ReturnType<typeof agentFor>>;
let admin: Agent;
let vehicleId: number;
let customerId: number;

beforeAll(async () => {
  admin = await agentFor("admin");
  vehicleId = (await createFixtureVehicle()).id;
  customerId = (await createFixtureCustomer("Sec1018")).id;
}, 60_000);

afterAll(async () => {
  await cleanupFixtures();
  await cleanupFixtureUsers();
  removeTempUploadsDir(TEMP_UPLOADS);
});

const HTML = Buffer.from("<html><body><script>fetch('/api/users')</script></body></html>");

/** A document row pointing at a file in the temp uploads dir, with whatever type the uploader claimed. */
async function storedDocument(fileName: string, bytes: Buffer, contentType: string) {
  const dir = path.join(TEMP_UPLOADS, "sec1018");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${Date.now()}-${fileName}`);
  fs.writeFileSync(file, bytes);
  const [row] = await db.insert(documents).values({
    vehicleId, documentType: "Damage Check", fileName, filePath: file, fileSize: bytes.length, contentType,
  }).returning();
  return row;
}

describe("1 — staff documents are served with a type the server decides", () => {
  it("an HTML file that claimed to be a PDF is a sandboxed download, never a page", async () => {
    const doc = await storedDocument("schade.html", HTML, "text/html;x=pdf");
    for (const url of [`/api/documents/view/${doc.id}`, `/api/documents/download/${doc.id}`]) {
      const res = await admin.get(url);
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/^application\/octet-stream/);
      expect(res.headers["content-disposition"]).toMatch(/^attachment/);
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["content-security-policy"]).toContain("sandbox");
    }
  });

  it("a real PDF still opens inline", async () => {
    const doc = await storedDocument("contract.pdf", tinyPdf("FIXT-sec1018"), "application/pdf");
    const res = await admin.get(`/api/documents/view/${doc.id}`);
    expect(res.headers["content-type"]).toMatch(/^application\/pdf/);
    expect(res.headers["content-disposition"]).toMatch(/^inline/);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    // No sandbox on an inline PDF: the counter prints contracts from the preview window.
    expect(String(res.headers["content-security-policy"] ?? "")).not.toContain("sandbox");
  });

  it("a declared type that only contains 'pdf' is refused at upload", async () => {
    const res = await admin.post("/api/reservations")
      .field("vehicleId", String(vehicleId)).field("customerId", String(customerId))
      .field("startDate", "2031-01-01").field("endDate", "2031-01-05")
      .attach("damageCheckFile", HTML, { filename: "schade.pdf", contentType: "text/html;x=pdf" });
    expect(res.status).toBe(400);
    // Refused by the upload filter itself, not by some later check of the reservation.
    const { createSecureMulterFilter } = await import("../utils/security/fileUploadSecurity");
    const verdict = (mimetype: string) => new Promise<boolean>((resolve) =>
      createSecureMulterFilter("document")({} as any, { originalname: "schade.pdf", mimetype } as any, (err: unknown, ok?: boolean) => resolve(!err && ok === true)));
    expect(await verdict("text/html;x=pdf")).toBe(false);
    expect(await verdict("application/javascript;x=pdf")).toBe(false);
    expect(await verdict("application/pdf")).toBe(true);
    expect(await verdict("application/x-pdf")).toBe(true);
  });

  it("a damage check whose content is not what it claims is refused before the reservation is made", async () => {
    const before = (await db.select({ id: reservations.id }).from(reservations).where(eq(reservations.vehicleId, vehicleId))).length;
    const res = await admin.post("/api/reservations")
      .field("vehicleId", String(vehicleId)).field("customerId", String(customerId))
      .field("startDate", "2031-02-01").field("endDate", "2031-02-05")
      .attach("damageCheckFile", HTML, { filename: "schade.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/does not match|not appear to be a valid PDF|Could not verify/);
    const after = (await db.select({ id: reservations.id }).from(reservations).where(eq(reservations.vehicleId, vehicleId))).length;
    expect(after).toBe(before);
  });

  it("a date with '../' cannot steer where the damage check is written", async () => {
    await admin.post("/api/reservations")
      .field("vehicleId", String(vehicleId)).field("customerId", String(customerId))
      .field("startDate", "../../../../sec1018-escape").field("endDate", "2031-03-05")
      .attach("damageCheckFile", tinyPdf("FIXT-sec1018-escape"), { filename: "schade.pdf", contentType: "application/pdf" });
    const escaped = fs.readdirSync(path.dirname(TEMP_UPLOADS)).filter((name) => name.includes("sec1018-escape"));
    expect(escaped).toEqual([]);
  });
});

describe("2 — the live connection only takes an active staff user", () => {
  it("refuses a portal session, garbage and a switched-off account", async () => {
    const staff = await agentFor(["view_vehicles"]);
    expect(await staffUserIdForSocket(staff.userId)).toBe(staff.userId);
    expect(await staffUserIdForSocket(String(staff.userId))).toBe(staff.userId);
    expect(await staffUserIdForSocket({ kind: "portal", id: staff.userId })).toBeNull();
    expect(await staffUserIdForSocket(undefined)).toBeNull();
    expect(await staffUserIdForSocket("1 or 1=1")).toBeNull();
    await db.update(users).set({ active: false }).where(eq(users.id, staff.userId));
    expect(await staffUserIdForSocket(staff.userId)).toBeNull();
  });
});

describe("Middel 4 — a portal path is a portal path in any case", () => {
  it("the staff stack steps aside for /API/PORTAL as well (the real request is in fix-j-socket.test.ts)", async () => {
    const { isPortalPath, isPortalApiPath } = await import("../portal-paths");
    expect(isPortalApiPath("/API/PORTAL/reservations")).toBe(true);
    expect(isPortalPath("/Portaal/documenten")).toBe(true);
    expect(isPortalApiPath("/api/portalx")).toBe(false);
  });
});

describe("Middel 5 — 'gebruikers beheren' has a ceiling", () => {
  let counter = 0;
  const body = (permissions: string[], role = "user") => ({
    username: `FIXT-user-sec1018-${Date.now().toString(36)}-${++counter}`,
    password: "Nieuw-wachtwoord-2026!", fullName: "Nieuw", role, permissions, active: true,
  });

  it("a shift leader cannot hand out a right they do not hold", async () => {
    const leader = await agentFor(["manage_users", "view_vehicles"]);
    const refused = await leader.post("/api/users").send(body(["view_vehicles", "manage_backups"]));
    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({ code: "PERMISSION_CEILING", permissions: ["manage_backups"] });
    expect((await leader.post("/api/users").send(body(["view_vehicles"]))).status).toBe(201);
  });

  it("nor add one to a colleague, while rights the colleague already had may stay", async () => {
    const leader = await agentFor(["manage_users", "view_vehicles"]);
    const colleague = await agentFor(["view_customers"]);
    const add = await leader.patch(`/api/users/${colleague.userId}`).send({ permissions: ["view_customers", "manage_backups"] });
    expect(add.status).toBe(403);
    expect(add.body.code).toBe("PERMISSION_CEILING");
    const keep = await leader.patch(`/api/users/${colleague.userId}`).send({ permissions: ["view_customers", "view_vehicles"] });
    expect(keep.status).toBe(200);
  });

  it("leaves an administrator's account alone: no change, no switching off, no delete", async () => {
    const leader = await agentFor(["manage_users"]);
    const otherAdmin = await agentFor("admin");
    const patch = await leader.patch(`/api/users/${otherAdmin.userId}`).send({ active: false });
    expect(patch.status).toBe(403);
    expect(patch.body.code).toBe("ADMIN_ACCOUNT_PROTECTED");
    expect((await leader.delete(`/api/users/${otherAdmin.userId}`)).body.code).toBe("ADMIN_ACCOUNT_PROTECTED");
    const [still] = await db.select({ active: users.active }).from(users).where(eq(users.id, otherAdmin.userId));
    expect(still.active).toBe(true);
  });

  it("an administrator may still grant anything", async () => {
    expect((await admin.post("/api/users").send(body(["manage_backups"]))).status).toBe(201);
  });
});

describe("Middel 6 — a diagram's file name is always a bare, safe name", () => {
  it("strips paths and odd extensions out of make and model", async () => {
    const { diagramFileName } = await import("../routes/vehicle-diagram-templates");
    const name = diagramFileName("../../../../public", "..\\..\\evil", "x.html", 1);
    expect(name).not.toMatch(/[\\/]/);
    expect(name).not.toContain("..");
    expect(name.endsWith(".png")).toBe(true);
    expect(diagramFileName("Peugeot", "Boxer L2", "tekening.JPG", 5)).toBe("Peugeot-Boxer_L2-5.jpg");
  });
});

describe("3 — switching an account off logs it out everywhere", () => {
  it("a switched-off account's open session stops working on its next request", async () => {
    const staff = await agentFor(["view_vehicles"]);
    expect((await staff.get("/api/user")).status).toBe(200);
    // Even without the route (a direct change, a restore): the session no longer loads.
    await db.update(users).set({ active: false }).where(eq(users.id, staff.userId));
    expect((await staff.get("/api/user")).status).toBe(401);
    expect((await staff.get("/api/vehicles")).status).toBe(401);
  });

  it("switching off through the users screen ends the sessions", async () => {
    const staff = await agentFor(["view_vehicles"]);
    expect((await admin.patch(`/api/users/${staff.userId}`).send({ active: false })).status).toBe(200);
    expect((await staff.get("/api/user")).status).toBe(401);
  });

  it("a password reset by an administrator logs the old sessions out", async () => {
    const staff = await agentFor(["view_vehicles"]);
    expect((await admin.patch(`/api/users/${staff.userId}`).send({ password: "Nieuw-wachtwoord-2026!" })).status).toBe(200);
    expect((await staff.get("/api/user")).status).toBe(401);
    // The administrator who did it stays signed in.
    expect((await admin.get("/api/user")).status).toBe(200);
  });
});
