/**
 * D15 (besluiten B-41/B-42, ontwerp 12) — sjabloon-plekhouders worden ingevuld waar de
 * gegevens er zijn: bedrijfsnaam (instelling), e-mail, telefoon, begin- en einddatum
 * van de lopende reservering, en de onderhoudsdatum alleen in onderhoudssjablonen.
 * Wat niet bekend of leeg is, gaat leeg de deur uit, nooit als code.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { eq, like } from "drizzle-orm";
import { db } from "../db";
import { appSettings, customers, emailLogs, emailTemplates } from "../../shared/schema";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures } from "./helpers/fixtures";
import { withSmtpStub, decodeBody } from "./helpers/smtpStub";
import { isoDay } from "./helpers/dates";
import { loadCompanyName } from "../services/company-name";

const PREFIX = "FIXT-d15";
let admin: TestAgent;

beforeAll(async () => {
  admin = await agentFor("admin");
  await db.delete(appSettings).where(eq(appSettings.key, "company_name"));
  await loadCompanyName();
}, 60_000);

afterEach(async () => {
  await db.delete(appSettings).where(eq(appSettings.key, "company_name"));
  await loadCompanyName();
});

afterAll(async () => {
  await db.delete(emailTemplates).where(like(emailTemplates.name, `${PREFIX}%`));
  await db.delete(emailLogs).where(like(emailLogs.subject, `${PREFIX}%`));
  await cleanupFixtures();
  await cleanupFixtureUsers();
});

const day = (offset: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return isoDay(d);
};
const dutch = (iso: string): string => iso.split("-").reverse().join("-");

async function customerWith(label: string, phone: string | null) {
  const row = await createFixtureCustomer(label);
  const email = `${label.toLowerCase()}-${row.id}@fixture-test.invalid`;
  await db.update(customers).set({ email, phone }).where(eq(customers.id, row.id));
  return { id: row.id, email };
}

const MESSAGE =
  "Bedrijf=[{companyName}] Mail=[{customerEmail}] Tel=[{customerPhone}] Van=[{reservationStart}] " +
  "Tot=[{reservationEnd}] Onderhoud=[{maintenanceDate}] Dubbel=[{{reservationStart}}] Onbekend=[{{nope}}]";

async function send(payload: Record<string, unknown>): Promise<{ body: string; subject: string }> {
  return withSmtpStub("ok", async (stub) => {
    const res = await admin.post("/api/notifications/send").send({
      template: "custom",
      customSubject: `${PREFIX} {companyName} ${Date.now()}`,
      customMessage: MESSAGE,
      ...payload,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.sent, JSON.stringify(res.body)).toBe(1);
    const message = stub.state.messages[0];
    return { body: decodeBody(message.raw), subject: message.subject ?? "" };
  });
}

describe("D15 - plekhouders per ontvanger", () => {
  it("een klant zonder voertuig: bedrijfsnaam, e-mail en telefoon gevuld, de rest leeg, onbekend leeg", async () => {
    const c = await customerWith("D15klant", "06-12345678");
    const { body, subject } = await send({ customerIds: [c.id] });
    expect(body).toContain(`Bedrijf=[Autolease Lam]`);
    expect(body).toContain(`Mail=[${c.email}]`);
    expect(body).toContain("Tel=[06-12345678]");
    expect(body).toContain("Van=[] Tot=[] Onderhoud=[] Dubbel=[] Onbekend=[]");
    expect(subject).toContain("Autolease Lam");
  }, 60_000);

  it("de bedrijfsnaam komt uit de instelling", async () => {
    const saved = await admin.post("/api/app-settings").send({ key: "company_name", value: "Garage Voorbeeld", category: "business" });
    expect(saved.status).toBe(200);
    const c = await customerWith("D15naam", null);
    const { body } = await send({ customerIds: [c.id] });
    expect(body).toContain("Bedrijf=[Garage Voorbeeld]");
    expect(body).toContain("Tel=[]");
  }, 60_000);

  it("een voertuig met een lopende reservering: begin- en einddatum als dd-mm-jjjj", async () => {
    const c = await customerWith("D15huur", "0201234567");
    const v = await createFixtureVehicle();
    await createFixtureReservation({ customerId: c.id, vehicleId: v.id, startDate: day(-2), endDate: day(5), status: "picked_up" });
    const { body } = await send({ vehicleIds: [v.id] });
    expect(body).toContain(`Van=[${dutch(day(-2))}] Tot=[${dutch(day(5))}]`);
    expect(body).toContain(`Dubbel=[${dutch(day(-2))}]`);
    expect(body).toContain("Tel=[0201234567]");
    expect(body).toContain("Onderhoud=[]");
  }, 60_000);

  it("de onderhoudsdatum wordt alleen gevuld voor categorie maintenance (uit lastServiceDate)", async () => {
    const c = await customerWith("D15onderh", null);
    const v = await createFixtureVehicle({ lastServiceDate: "2026-03-04" });
    await createFixtureReservation({ customerId: c.id, vehicleId: v.id, startDate: day(-1), endDate: day(3), status: "picked_up" });

    const plain = await send({ vehicleIds: [v.id], category: "custom" });
    expect(plain.body).toContain("Onderhoud=[]");

    const maintenance = await send({ vehicleIds: [v.id], category: "maintenance" });
    expect(maintenance.body).toContain("Onderhoud=[04-03-2026]");
  }, 60_000);

  it("de categorie van het opgeslagen sjabloon wint van wat de pagina meestuurt", async () => {
    const c = await customerWith("D15sjabloon", null);
    const v = await createFixtureVehicle({ lastServiceDate: "2026-05-06" });
    await createFixtureReservation({ customerId: c.id, vehicleId: v.id, startDate: day(-1), endDate: day(3), status: "picked_up" });
    const [maintenanceTemplate] = await db.insert(emailTemplates).values({
      name: `${PREFIX} onderhoud`, subject: `${PREFIX} s`, content: "x", category: "maintenance", createdAt: new Date().toISOString(),
    } as any).returning();
    const [customTemplate] = await db.insert(emailTemplates).values({
      name: `${PREFIX} algemeen`, subject: `${PREFIX} s`, content: "x", category: "custom", createdAt: new Date().toISOString(),
    } as any).returning();

    expect((await send({ vehicleIds: [v.id], templateId: maintenanceTemplate.id, category: "custom" })).body).toContain("Onderhoud=[06-05-2026]");
    expect((await send({ vehicleIds: [v.id], templateId: customTemplate.id, category: "maintenance" })).body).toContain("Onderhoud=[]");
  }, 60_000);

  it("zonder lastServiceDate geldt de datum van het dekkende onderhoudsblok", async () => {
    const c = await customerWith("D15blok", null);
    const v = await createFixtureVehicle({ lastServiceDate: null });
    await createFixtureReservation({ customerId: c.id, vehicleId: v.id, startDate: day(-1), endDate: day(10), status: "picked_up" });
    await createFixtureReservation({ vehicleId: v.id, startDate: day(-1), endDate: day(1), status: "booked", type: "maintenance_block" });
    const { body } = await send({ vehicleIds: [v.id], category: "maintenance" });
    expect(body).toContain(`Onderhoud=[${dutch(day(-1))}]`);
  }, 60_000);

  it("klantgegevens komen in de html-versie ge-escaped en in de tekstversie letterlijk", async () => {
    const c = await customerWith("D15html", "06-<b>7</b>");
    await db.update(customers).set({ name: "Jan <i>&</i> Co" }).where(eq(customers.id, c.id));
    const { body } = await withSmtpStub("ok", async (stub) => {
      const res = await admin.post("/api/notifications/send").send({
        template: "custom", customerIds: [c.id], customSubject: `${PREFIX} html ${Date.now()}`,
        customMessage: "Naam=[{customerName}] Tel=[{customerPhone}]",
      });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      return { body: decodeBody(stub.state.messages[0].raw) };
    });
    // html part: escaped, in the greeting and in the message
    expect(body).toContain("Beste Jan &lt;i&gt;&amp;&lt;/i&gt; Co");
    expect(body).toContain("Naam=[Jan &lt;i&gt;&amp;&lt;/i&gt; Co] Tel=[06-&lt;b&gt;7&lt;/b&gt;]");
    // text part: as typed
    expect(body).toContain("Naam=[Jan <i>&</i> Co] Tel=[06-<b>7</b>]");
  }, 60_000);

  it("zonder reservering en zonder datum blijft alles leeg", async () => {
    const c = await customerWith("D15leeg", null);
    const { body } = await send({ customerIds: [c.id], category: "maintenance" });
    expect(body).toContain("Van=[] Tot=[] Onderhoud=[]");
  }, 60_000);
});
