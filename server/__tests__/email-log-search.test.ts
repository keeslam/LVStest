/**
 * The e-mail log as a searchable, sortable, paged table (Kees, 2026-10-24: "ik
 * wil kunnen zoeken in de email logboek en kunnen filteren/sorteren en de tabel
 * moet beter voor 10000 meldingen"). GET /api/email-logs used to send every row
 * to the browser; /search returns one page, /summary the Analyse totals and
 * /export every matching row for the CSV download.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "../db";
import { emailLogs } from "@shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { createFixtureVehicle, cleanupFixtures } from "./helpers/fixtures";

// A subject marker no real mail carries, so every query below can be scoped to
// this test's rows with `q` and stays independent of what the database holds.
const MARK = `FIXTLOG${Date.now().toString(36)}`;

describe("GET /api/email-logs/search, /summary, /export", () => {
  let staff: TestAgent;
  let outsider: TestAgent;
  let plate: string;
  const ids: number[] = [];

  beforeAll(async () => {
    staff = await agentFor(["manage_email_templates"]);
    outsider = await agentFor(["view_customers"]);
    const vehicle = await createFixtureVehicle();
    plate = vehicle.licensePlate;

    const rows: Array<typeof emailLogs.$inferInsert> = [
      // single mails
      { template: "apk", subject: `${MARK} APK herinnering`, recipients: 1, emailsSent: 1, recipient: "anna@fixture-test.invalid", result: "sent", sentAt: "2026-03-01T09:00:00.000Z", vehicleIds: [vehicle.id] },
      { template: "custom", subject: `${MARK} Eigen bericht`, recipients: 1, emailsFailed: 1, recipient: "bert@fixture-test.invalid", result: "failed", failureReason: "MAILBOX_FULL", sentAt: "2026-03-02T09:00:00.000Z" },
      { template: "gps", subject: `${MARK} GPS melding`, recipients: 1, emailsSent: 1, recipient: "carla@fixture-test.invalid", result: "sent", sentAt: "2026-03-03T23:30:00.000Z" },
      // a bulk run with failures
      { template: "maintenance", subject: `${MARK} Onderhoudsronde`, recipients: 10, emailsSent: 8, emailsFailed: 2, sentAt: "2026-03-04T09:00:00.000Z" },
    ];
    for (let i = 0; i < 3; i++) {
      rows.push({ template: "custom", subject: `${MARK} Extra ${i}`, recipients: 1, emailsSent: 1, recipient: `extra${i}@fixture-test.invalid`, result: "sent", sentAt: `2026-02-0${i + 1}T09:00:00.000Z` });
    }
    const inserted = await db.insert(emailLogs).values(rows).returning({ id: emailLogs.id });
    ids.push(...inserted.map((r) => r.id));
  });

  afterAll(async () => {
    if (ids.length) await db.delete(emailLogs).where(inArray(emailLogs.id, ids));
    await cleanupFixtures();
    await cleanupFixtureUsers();
  });

  const search = (params: Record<string, string | number>) =>
    staff.get("/api/email-logs/search").query({ q: MARK, ...params });

  it("geeft één pagina met het totaal, nieuwste bovenaan", async () => {
    const res = await search({ pageSize: 2, page: 1 });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(7);
    expect(res.body.rows).toHaveLength(2);
    expect(res.body.rows[0].subject).toBe(`${MARK} Onderhoudsronde`);
    expect(res.body.rows[1].subject).toBe(`${MARK} GPS melding`);

    const last = await search({ pageSize: 2, page: 4 });
    expect(last.body.rows).toHaveLength(1);
    expect(last.body.rows[0].subject).toBe(`${MARK} Extra 0`);
  });

  it("zoekt in ontvanger, foutmelding en kenteken", async () => {
    const byRecipient = await staff.get("/api/email-logs/search").query({ q: "bert@fixture-test" });
    expect(byRecipient.body.rows.map((r: { id: number }) => r.id)).toContain(ids[1]);

    const byReason = await staff.get("/api/email-logs/search").query({ q: "MAILBOX_FULL" });
    expect(byReason.body.rows.map((r: { id: number }) => r.id)).toContain(ids[1]);

    // without the dashes and in lower case, the way people type a plate
    const loose = plate.replace(/-/g, "").toLowerCase();
    const byPlate = await staff.get("/api/email-logs/search").query({ q: loose });
    const hit = byPlate.body.rows.find((r: { id: number }) => r.id === ids[0]);
    expect(hit).toBeDefined();
    expect(hit.vehicles).toEqual([{ id: expect.any(Number), licensePlate: plate }]);
  });

  it("filtert op status, soort, rondes en periode", async () => {
    const failed = await search({ status: "failed" });
    expect(failed.body.rows.map((r: { subject: string }) => r.subject)).toEqual([`${MARK} Eigen bericht`]);

    const partial = await search({ status: "partial" });
    expect(partial.body.rows.map((r: { subject: string }) => r.subject)).toEqual([`${MARK} Onderhoudsronde`]);

    const gps = await search({ kind: "gps" });
    expect(gps.body.rows.map((r: { subject: string }) => r.subject)).toEqual([`${MARK} GPS melding`]);
    expect((await search({ kind: "other" })).body.total).toBe(0);

    const runs = await search({ scope: "runs" });
    expect(runs.body.total).toBe(1);
    const mails = await search({ scope: "mails" });
    expect(mails.body.total).toBe(6);

    // 2026-03-03T23:30Z is 4 March in Amsterdam, so it belongs to the 4th
    const day = await search({ from: "2026-03-04", to: "2026-03-04" });
    expect(day.body.rows.map((r: { subject: string }) => r.subject).sort()).toEqual([`${MARK} GPS melding`, `${MARK} Onderhoudsronde`]);
  });

  it("sorteert op onderwerp, ontvanger en status", async () => {
    const bySubject = await search({ sort: "subject", dir: "asc", pageSize: 1 });
    expect(bySubject.body.rows[0].subject).toBe(`${MARK} APK herinnering`);

    const byRecipient = await search({ sort: "recipient", dir: "asc", scope: "mails", pageSize: 1 });
    expect(byRecipient.body.rows[0].recipient).toBe("anna@fixture-test.invalid");

    const byStatus = await search({ sort: "status", dir: "asc", pageSize: 2 });
    expect(byStatus.body.rows.map((r: { subject: string }) => r.subject).sort()).toEqual([`${MARK} Eigen bericht`, `${MARK} Onderhoudsronde`]);
  });

  it("weigert onzin in de parameters niet maar valt terug op veilige waarden", async () => {
    const res = await search({ sort: "id; drop table", dir: "sideways", page: -3, pageSize: 99999, status: "nonsense" });
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBeLessThanOrEqual(250);
    expect(res.body.total).toBe(7);
  });

  it("telt de totalen voor de Analyse-tab op de server", async () => {
    const res = await staff.get("/api/email-logs/summary");
    expect(res.status).toBe(200);
    for (const key of ["sent", "failed", "runs", "runsWithFailures"]) expect(typeof res.body[key]).toBe("number");
    expect(res.body.runsWithFailures).toBeGreaterThanOrEqual(1);
    expect(res.body.kinds.other.sent).toBeGreaterThanOrEqual(1);
  });

  it("exporteert alle rijen die aan de filters voldoen, niet alleen één pagina", async () => {
    const res = await staff.get("/api/email-logs/export").query({ q: MARK, scope: "mails" });
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(6);
    expect(res.body.truncated).toBe(false);
  });

  it("vraagt het recht om e-mailsjablonen te beheren", async () => {
    for (const path of ["/api/email-logs/search", "/api/email-logs/summary", "/api/email-logs/export"]) {
      const res = await outsider.get(path);
      expect(res.status).toBe(403);
    }
  });
});
