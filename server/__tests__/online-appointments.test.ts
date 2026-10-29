/**
 * The garage planner's "Afspraak Aanvraag" mails: read from the invoice inbox, planned in the maintenance planner as
 * "te bevestigen", and confirmed, cancelled, linked or dismissed by staff. Real database, fake mailbox.
 * Design: docs/superpowers/specs/2026-10-13-online-afspraken-design.md
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import request from "supertest";
import { and, eq, inArray, like } from "drizzle-orm";

const { importInvoiceMail, recordRun } = vi.hoisted(() => ({
  importInvoiceMail: vi.fn(async () => ({ attachments: 0, booked: 0, review: 1, skipped: 0 })),
  recordRun: vi.fn(async () => {}),
}));
vi.mock("../services/invoice-inbox/importer", () => ({ importInvoiceMail, recordOversizeMail: vi.fn(), recordFailedMail: vi.fn(), MAX_MAIL_BYTES: 30 * 1024 * 1024 }));
vi.mock("../services/invoice-inbox/notify", () => ({ notifyInvoiceInbox: vi.fn(async () => {}) }));
vi.mock("../services/invoice-inbox/run-log", () => ({ inboxRunLog: { record: recordRun, list: vi.fn() } }));

import { DEFAULT_INVOICE_INBOX_CONFIG, type InvoiceInboxConfig } from "../../shared/invoice-inbox";
import type { InvoiceImapClient } from "../services/invoice-inbox/imap-client";
import { runInvoiceInboxImport, setInvoiceImapClient, resetInvoiceInboxPollerForTests } from "../services/invoice-inbox/poller";
import { invoiceInboxConfigSchema } from "../services/invoice-inbox/config";
import { registerOnlineAppointmentRoutes } from "../routes/online-appointments";
import { buildStaffTestApp, createTestCustomer, createTestVehicle, createTestReservation, cleanupPortalTestData, TEST_EMAIL_DOMAIN } from "./portal-helpers";
import { db } from "../db";
import { onlineAppointments, reservations, customNotifications, portalNotifications, portalUsers, UserPermission } from "../../shared/schema";

const PLANNER = "noreply@garage-planner.invalid";
const config: InvoiceInboxConfig = {
  ...DEFAULT_INVOICE_INBOX_CONFIG, enabled: true, host: "imap.example.test", username: "u", password: "p",
  allowedSenders: ["@garage-test.invalid"], appointmentSenders: [PLANNER],
};
const PLATE = "PT-AP-20";

/** A weekday of a week in 2098 (3 Nov 2098 is a Monday), as dd-MM-yyyy and ISO. */
function day(weekday: number, week = 0) {
  const d = new Date(Date.UTC(2098, 10, 3 + week * 7 + (weekday - 1)));
  const iso = d.toISOString().slice(0, 10);
  return { iso, nl: iso.split("-").reverse().join("-") };
}

function body(o: { date: string; time?: string; plate?: string; work?: string; replacement?: string }): string {
  return `Afspraak Aanvraag

Geachte Dhr. Kees Lam,

Wij hebben uw verzoek voor het maken van een werkplaatsafspraak voor uw RENAULT TWINGO met
kenteken ${o.plate ?? PLATE} succesvol ontvangen.

U wil een afspraak maken voor ${o.date} om ${o.time ?? "08:00"}.
Wij zullen de afspraak inplannen en zo spoedig mogelijk de afspraak bevestigen.

Voertuig gegevens:
Kenteken: ${o.plate ?? PLATE}
Merk: RENAULT
Model: TWINGO
Tellerstand: 120

Werkzaamheden:
${o.work ?? "APK"}


Vervangend vervoer:
${o.replacement ?? "Leenauto"}

Met vriendelijke groet,

Autobedrijf Bernisse`;
}

type Mail = { id: string; raw: Buffer; from: string; subject: string };
let seq = 0;
function rawMail(text: string, extra: { from?: string; subject?: string; headers?: string[] } = {}): Mail {
  seq += 1;
  const id = `<apptest-${Date.now()}-${seq}@garage.test>`;
  const from = extra.from ?? PLANNER;
  const subject = extra.subject ?? "Afspraak Aanvraag";
  const raw = Buffer.from([
    `From: Autobedrijf Bernisse <${from}>`, "To: klant@example.test", `Subject: ${subject}`, `Message-ID: ${id}`,
    ...(extra.headers ?? []), "Content-Type: text/plain; charset=utf-8", "", text,
  ].join("\r\n"));
  return { id, raw, from, subject };
}

function mailbox(mails: Mail[]) {
  const moved: Array<{ uid: number; folder: string }> = [];
  const processed: number[] = [];
  const client: InvoiceImapClient = {
    async withSession(_c, fn) {
      return fn({
        async folderOverview() { return []; },
        async diagnostics() { return { server: null, exists: 0, searchUnseen: null }; },
        async listUnseen() {
          return mails.map((m, i) => ({ uid: i + 1, messageId: m.id, from: m.from, subject: m.subject, size: m.raw.length }))
            .filter((r) => !moved.some((x) => x.uid === r.uid) && !processed.includes(r.uid));
        },
        async fetchRaw(uid) { return mails[uid - 1].raw; },
        async markProcessed(uid) { processed.push(uid); },
        async moveTo(uid, folder) { moved.push({ uid, folder }); },
      });
    },
  };
  return { client, moved, processed };
}

async function run(mails: Mail[], cfg: InvoiceInboxConfig = config) {
  const box = mailbox(mails);
  setInvoiceImapClient(box.client);
  resetInvoiceInboxPollerForTests();
  const summary = await runInvoiceInboxImport("manual", "tester", cfg);
  return { ...box, summary };
}

const rows = () => db.select().from(onlineAppointments).where(like(onlineAppointments.messageId, "<apptest-%"));
const blockOf = async (blockId: number) => (await db.select().from(reservations).where(eq(reservations.id, blockId)))[0];

describe("online appointments from the garage planner", () => {
  let customerId: number, vehicleId: number, rentalId: number;
  const wed = day(3), sat = day(6);

  async function cleanRows() {
    await db.delete(onlineAppointments).where(like(onlineAppointments.messageId, "<apptest-%"));
    await db.delete(customNotifications).where(eq(customNotifications.type, "online_appointment"));
  }
  async function cleanBlocks() {
    const stale = await db.select({ id: reservations.id }).from(reservations)
      .where(and(eq(reservations.vehicleId, vehicleId), eq(reservations.type, "maintenance_block")));
    if (stale.length) await db.delete(reservations).where(inArray(reservations.id, stale.map((s) => s.id)));
    await db.delete(reservations).where(and(eq(reservations.replacementForReservationId, rentalId), eq(reservations.type, "replacement")));
  }

  beforeAll(async () => {
    await cleanRows(); await cleanupPortalTestData();
    customerId = (await createTestCustomer("Afspraak")).id;
    vehicleId = (await createTestVehicle(PLATE)).id;
    rentalId = (await createTestReservation({ customerId, vehicleId, startDate: "2098-01-01", endDate: "2098-12-31", status: "picked_up" })).id;
  });
  beforeEach(async () => {
    importInvoiceMail.mockClear(); recordRun.mockClear();
    await cleanRows(); await cleanBlocks();
    await db.delete(portalNotifications).where(eq(portalNotifications.customerId, customerId));
    await db.delete(portalUsers).where(eq(portalUsers.customerId, customerId));
  });
  afterAll(async () => { await cleanRows(); await cleanupPortalTestData(); setInvoiceImapClient(null); });

  it("keeps the planner senders in the inbox settings; empty means off", () => {
    expect(DEFAULT_INVOICE_INBOX_CONFIG.appointmentSenders).toEqual([]);
    const parsed = invoiceInboxConfigSchema.parse({ appointmentSenders: ["NoReply@Garage.Software", "noreply@garage.software", "@planner.nl"] });
    expect(parsed.appointmentSenders).toEqual(["noreply@garage.software", "@planner.nl"]);
    expect(invoiceInboxConfigSchema.safeParse({ appointmentSenders: ["geen adres"] }).success).toBe(false);
    expect(invoiceInboxConfigSchema.parse({}).appointmentSenders).toEqual([]);
  });

  it("plans an APK mail as regular maintenance on the day, 'te bevestigen', for the customer's rental, with a placeholder for the replacement car", async () => {
    await db.insert(portalUsers).values({ customerId, email: `afspraak@${TEST_EMAIL_DOMAIN}`, fullName: "Afspraak" });
    const { summary, moved } = await run([rawMail(body({ date: wed.nl, time: "08:00", replacement: "Leenauto" }))]);
    expect(summary.appointments).toBe(1);
    expect(importInvoiceMail).not.toHaveBeenCalled();
    expect(moved).toEqual([{ uid: 1, folder: "online afspraken" }]);

    const [row] = await rows();
    expect(row).toMatchObject({ status: "pending", plate: "PTAP20", appointmentDate: wed.iso, appointmentTime: "08:00", vehicleId, customerId, rentalId, replacement: "Leenauto", workItems: ["APK"], fromAddress: PLANNER });
    const block = await blockOf(row.blockId!);
    expect(block).toMatchObject({
      type: "maintenance_block", vehicleId, customerId, startDate: wed.iso, endDate: wed.iso,
      maintenanceCategory: "scheduled_maintenance", maintenanceType: "apk_inspection", affectedRentalId: rentalId, status: "booked", startTime: "08:00",
    });
    expect(block.notes).toContain("Online agenda: te bevestigen");
    const [spare] = await db.select().from(reservations).where(and(eq(reservations.replacementForReservationId, rentalId), eq(reservations.type, "replacement")));
    expect(spare).toMatchObject({ placeholderSpare: true, vehicleId: null, startDate: wed.iso, endDate: wed.iso, maintenanceBlockId: block.id });

    const bell = await db.select().from(portalNotifications).where(and(eq(portalNotifications.customerId, customerId), eq(portalNotifications.type, "online_appointment")));
    expect(bell).toHaveLength(1);
    expect(bell[0].description).toContain(`Afspraak aangevraagd op ${wed.nl} om 08:00 voor APK`);
    const staff = await db.select().from(customNotifications).where(eq(customNotifications.type, "online_appointment"));
    expect(staff.some((n) => n.title === "Online afspraak binnengekomen" && n.link === "/maintenance?onlineAppointments=1")).toBe(true);
  });

  it("tells the customer nothing in the portal when the customer has no portal account", async () => {
    await run([rawMail(body({ date: wed.nl }))]);
    expect((await rows())[0].status).toBe("pending");
    const bell = await db.select().from(portalNotifications).where(eq(portalNotifications.customerId, customerId));
    expect(bell).toHaveLength(0);
  });

  it("asks for no replacement car when the planner says 'Geen', and files other work as a repair", async () => {
    await run([rawMail(body({ date: wed.nl, replacement: "Geen", work: "Grote beurt" }))]);
    const [row] = await rows();
    expect(await blockOf(row.blockId!)).toMatchObject({ maintenanceCategory: "repair", maintenanceType: "other" });
    const spares = await db.select().from(reservations).where(and(eq(reservations.replacementForReservationId, rentalId), eq(reservations.type, "replacement")));
    expect(spares).toHaveLength(0);
  });

  it("treats a second mail for the same car, day and time as the same appointment", async () => {
    await run([rawMail(body({ date: wed.nl }))]);
    const second = await run([rawMail(body({ date: wed.nl }))]);
    expect(second.moved).toHaveLength(1); // still taken out of the inbox
    expect(await rows()).toHaveLength(1);
    const blocks = await db.select().from(reservations).where(and(eq(reservations.vehicleId, vehicleId), eq(reservations.type, "maintenance_block")));
    expect(blocks).toHaveLength(1);
  });

  it("does not plan what it cannot link: unknown plate, no rental that day, a weekend, an unreadable mail", async () => {
    await run([
      rawMail(body({ date: wed.nl, plate: "PT-ZZ-99" })),
      rawMail(body({ date: day(3, 60).nl })),
      rawMail(body({ date: sat.nl })),
      rawMail("Afspraak Aanvraag\n\nGeachte klant, dit is geen echte aanvraag."),
    ]);
    const found = await rows();
    expect(found.map((r) => r.reviewReason).sort()).toEqual(["no_rental", "plate_unknown", "unreadable", "weekend"]);
    expect(found.every((r) => r.status === "review" && r.blockId === null)).toBe(true);
    const blocks = await db.select().from(reservations).where(and(eq(reservations.vehicleId, vehicleId), eq(reservations.type, "maintenance_block")));
    expect(blocks).toHaveLength(0);
    const staff = await db.select().from(customNotifications).where(eq(customNotifications.type, "online_appointment"));
    expect(staff.filter((n) => n.title === "Online afspraak om te controleren")).toHaveLength(4);
  });

  it("leaves a mail from another address, or one that fails the sender check, to the invoice flow", async () => {
    const stranger = rawMail(body({ date: wed.nl }), { from: "iemand@elders.invalid" });
    const forged = rawMail(body({ date: wed.nl }), { headers: ["Authentication-Results: mx.test; dmarc=fail header.from=garage-planner.invalid"] });
    const { summary, moved } = await run([stranger, forged]);
    expect(summary.appointments ?? 0).toBe(0);
    expect(moved).toHaveLength(0);
    expect(importInvoiceMail).toHaveBeenCalledTimes(2);
    expect(await rows()).toHaveLength(0);
  });

  it("in strict mode only takes a mail with a pass from our own mail server", async () => {
    const strict = { ...config, authservId: "mx.ours.test" };
    const unsigned = await run([rawMail(body({ date: wed.nl }))], strict);
    expect(unsigned.summary.appointments ?? 0).toBe(0);
    expect(importInvoiceMail).toHaveBeenCalledTimes(1);
    const signed = await run([rawMail(body({ date: wed.nl }), { headers: ["Authentication-Results: mx.ours.test; dmarc=pass header.from=garage-planner.invalid"] })], strict);
    expect(signed.summary.appointments).toBe(1);
  });

  it("is off when no planner sender is configured, and a normal invoice mail is unaffected", async () => {
    const off = await run([rawMail(body({ date: wed.nl }))], { ...config, appointmentSenders: [] });
    expect(off.summary.appointments ?? 0).toBe(0);
    expect(importInvoiceMail).toHaveBeenCalledTimes(1);
    importInvoiceMail.mockClear();
    const invoice = await run([rawMail("Hierbij uw factuur.", { subject: "Factuur 2098-1", from: "boekhouding@garage-test.invalid" })]);
    expect(importInvoiceMail).toHaveBeenCalledTimes(1);
    expect(invoice.processed).toEqual([1]);
    // Another mail from the planner (not an appointment request) is not taken for one either.
    importInvoiceMail.mockClear();
    await run([rawMail("Uw afspraak is bevestigd.", { subject: "Afspraak bevestigd" })]);
    expect(importInvoiceMail).toHaveBeenCalledTimes(1);
    expect(await rows()).toHaveLength(0);
  });

  describe("staff", () => {
    const manager = buildStaffTestApp([UserPermission.MANAGE_MAINTENANCE], registerOnlineAppointmentRoutes);
    const viewer = buildStaffTestApp([UserPermission.VIEW_RESERVATIONS], registerOnlineAppointmentRoutes);
    const bookkeeper = buildStaffTestApp([UserPermission.MANAGE_EXPENSES], registerOnlineAppointmentRoutes);
    const outsider = buildStaffTestApp([], registerOnlineAppointmentRoutes);

    it("sees what is waiting, with the count, and only the right accounts may", async () => {
      await run([rawMail(body({ date: wed.nl })), rawMail(body({ date: wed.nl, plate: "PT-ZZ-99" }))]);
      const list = await request(manager).get("/api/online-appointments");
      expect(list.status).toBe(200);
      const mine = list.body.filter((a: any) => a.plate === "PTAP20" || a.plate === "PTZZ99");
      expect(mine.map((a: any) => a.status).sort()).toEqual(["pending", "review"]);
      expect(mine.find((a: any) => a.status === "pending").customerLabel).toContain("Afspraak");
      expect((await request(manager).get("/api/online-appointments/count")).body.count).toBeGreaterThanOrEqual(2);
      expect((await request(viewer).get("/api/online-appointments")).status).toBe(200);
      expect((await request(viewer).post(`/api/online-appointments/${mine[0].id}/confirm`)).status).toBe(403);
      expect((await request(outsider).get("/api/online-appointments")).status).toBe(403);
      expect((await request(bookkeeper).get("/api/online-appointments")).status).toBe(403);
      const log = await request(bookkeeper).get("/api/online-appointments/log?q=PT-ZZ");
      expect(log.status).toBe(200);
      expect(log.body.items.map((a: any) => a.plate)).toContain("PTZZ99");
      expect(log.body.items.map((a: any) => a.plate)).not.toContain("PTAP20");
      expect((await request(outsider).get("/api/online-appointments/log")).status).toBe(403);
    });

    it("confirms: the entry is no longer 'te bevestigen' and cannot be handled twice", async () => {
      await run([rawMail(body({ date: wed.nl }))]);
      const [row] = await rows();
      const res = await request(manager).post(`/api/online-appointments/${row.id}/confirm`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("confirmed");
      expect(res.body.handledBy).toBe("staff-test");
      expect((await blockOf(row.blockId!)).notes).toContain("Online agenda: bevestigd");
      expect((await request(manager).post(`/api/online-appointments/${row.id}/confirm`)).status).toBe(409);
      expect((await request(manager).post(`/api/online-appointments/999999999/confirm`)).status).toBe(404);
    });

    it("cancels: the block and its placeholder go, and the open list no longer has it", async () => {
      await run([rawMail(body({ date: wed.nl }))]);
      const [row] = await rows();
      expect((await request(manager).post(`/api/online-appointments/${row.id}/cancel`)).status).toBe(200);
      expect((await blockOf(row.blockId!)).status).toBe("cancelled");
      const [spare] = await db.select().from(reservations).where(and(eq(reservations.replacementForReservationId, rentalId), eq(reservations.type, "replacement")));
      expect(spare.status).toBe("cancelled");
      const list = await request(manager).get("/api/online-appointments");
      expect(list.body.some((a: any) => a.id === row.id)).toBe(false);
      expect((await request(manager).post(`/api/online-appointments/${row.id}/cancel`)).status).toBe(409);
    });

    it("links a mail that could not be matched to a rental by hand, and then plans it; or dismisses it", async () => {
      await run([rawMail(body({ date: wed.nl, plate: "PT-ZZ-99" })), rawMail(body({ date: wed.nl, plate: "PT-ZZ-98" }))]);
      const [first, second] = (await rows()).sort((a, b) => a.id - b.id);
      expect((await request(manager).post(`/api/online-appointments/${first.id}/link`).send({})).status).toBe(400);
      const linked = await request(manager).post(`/api/online-appointments/${first.id}/link`).send({ rentalId });
      expect(linked.status).toBe(200);
      expect(linked.body.status).toBe("pending");
      const after = (await rows()).find((r) => r.id === first.id)!;
      expect(await blockOf(after.blockId!)).toMatchObject({ type: "maintenance_block", vehicleId, customerId, affectedRentalId: rentalId });
      expect((await request(manager).post(`/api/online-appointments/${first.id}/link`).send({ rentalId })).status).toBe(409);
      expect((await request(manager).post(`/api/online-appointments/${second.id}/dismiss`)).status).toBe(200);
      expect((await rows()).find((r) => r.id === second.id)!.status).toBe("dismissed");
    });

    it("refuses to link to a rental that does not run on the day", async () => {
      const otherVehicle = await createTestVehicle();
      const short = await createTestReservation({ customerId, vehicleId: otherVehicle.id, startDate: "2098-01-01", endDate: "2098-01-31", status: "booked" });
      await run([rawMail(body({ date: wed.nl, plate: "PT-ZZ-97" }))]);
      const [row] = await rows();
      const res = await request(manager).post(`/api/online-appointments/${row.id}/link`).send({ rentalId: short.id });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("RENTAL_NOT_ON_DATE");
    });
  });
});
