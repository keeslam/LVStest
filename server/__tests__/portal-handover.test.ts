/**
 * What a customer is told about the start and end of a rental: at our shop, or brought / collected at a place
 * agreed with the office; and the instructions that come with a return.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn(async () => true) }));
vi.mock("../utils/email-service", () => ({ sendEmail }));

import { buildPortalTestApp, createTestCustomer, createTestVehicle, createTestReservation, cleanupPortalTestData, TEST_EMAIL_DOMAIN } from "./portal-helpers";
import { portalStorage } from "../services/portal-storage";
import { hashPassword } from "../auth";
import { db } from "../db";
import { reservations } from "../../shared/schema";
import { DEFAULT_PORTAL_CONFIG } from "../../shared/portal-types";
import { eq } from "drizzle-orm";

const password = "wachtwoord-1234";

describe("portal handover", () => {
  const app = buildPortalTestApp();
  let shopId: number, brought: number, collected: number, both: number;

  beforeAll(async () => {
    await cleanupPortalTestData();
    const customerId = (await createTestCustomer("Overdracht")).id;
    const mk = async () => (await createTestReservation({ customerId, vehicleId: (await createTestVehicle()).id, startDate: "2026-10-01", endDate: "2026-12-01", status: "picked_up" })).id;
    shopId = await mk(); brought = await mk(); collected = await mk(); both = await mk();
    await db.update(reservations).set({ deliveryRequired: true, deliveryAddress: "Dorpsstraat 1", deliveryPostalCode: "1234 AB", deliveryCity: "Utrecht" }).where(eq(reservations.id, brought));
    await db.update(reservations).set({ collectionRequired: true, collectionAddress: "Havenweg 9", collectionCity: "Rotterdam" }).where(eq(reservations.id, collected));
    await db.update(reservations).set({ deliveryRequired: true, deliveryAddress: "Dorpsstraat 1", deliveryCity: "Utrecht", collectionRequired: true, collectionAddress: "Kade 5", collectionPostalCode: "3011 AD", collectionCity: "Rotterdam" }).where(eq(reservations.id, both));
    const u = await portalStorage.createPortalUser({ customerId, email: `ovd@${TEST_EMAIL_DOMAIN}`, fullName: "Ovd", role: "admin" }, "t");
    await portalStorage.updatePortalUser(u.id, { passwordHash: await hashPassword(password) });
  });
  afterAll(cleanupPortalTestData);

  async function login() {
    const agent = request.agent(app);
    expect((await agent.post("/api/portal/login").send({ email: `ovd@${TEST_EMAIL_DOMAIN}`, password })).status).toBe(200);
    return agent;
  }

  it("says shop at both ends for a reservation without a service", async () => {
    const a = await login();
    const row = (await a.get("/api/portal/reservations")).body.find((r: any) => r.id === shopId);
    expect(row.handover).toEqual({ pickup: { method: "shop", location: null }, return: { method: "shop", location: null } });
  });

  it("says delivery to the delivery address, and collection at its own address (which can be elsewhere)", async () => {
    const a = await login();
    const list = (await a.get("/api/portal/reservations")).body;
    expect(list.find((r: any) => r.id === brought).handover.pickup).toEqual({ method: "delivery", location: "Dorpsstraat 1, 1234 AB Utrecht" });
    expect(list.find((r: any) => r.id === collected).handover.return).toEqual({ method: "collection", location: "Havenweg 9, Rotterdam" });
    const b = list.find((r: any) => r.id === both).handover;
    expect(b.pickup.location).toBe("Dorpsstraat 1, Utrecht");
    expect(b.return.location).toBe("Kade 5, 3011 AD Rotterdam");
  });

  it("gives the detail the same answer, and never the delivery fee or notes", async () => {
    const a = await login();
    const detail = (await a.get(`/api/portal/reservations/${both}`)).body;
    expect(detail.handover.return.method).toBe("collection");
    expect(detail).not.toHaveProperty("deliveryFee");
    expect(detail).not.toHaveProperty("deliveryNotes");
    expect(detail).not.toHaveProperty("collectionAddress");
  });

  it("sends the return instructions and the delivery note with /me, with the agreed defaults", async () => {
    const a = await login();
    const info = (await a.get("/api/portal/me")).body.info;
    expect(info.returnInstructions).toBe(DEFAULT_PORTAL_CONFIG.returnInstructions);
    expect(info.returnInstructions).toMatch(/schoon en compleet/);
    expect(info.returnInstructions).toMatch(/kosten/);
    expect(info.deliveryNote).toMatch(/125/);
  });
});
