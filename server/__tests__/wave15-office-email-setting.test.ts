/**
 * WAVE 15 item 3 — het kantooradres voor meldingen (`notification_office_email`).
 *
 * besluiten **B-24**: "Staat de auto leeg, dan gaat er alleen een melding naar
 * kantoor." The server has read `notification_office_email` since WAVE 11 and
 * falls back to the sender address when it is empty — but **no screen had a
 * field for it**, so the setting could only ever be empty and the office notice
 * could only ever go to the noreply address the application sends from.
 *
 * This file is the server half: the value the new settings field writes is the
 * value the office notice actually goes to, and an empty one still falls back.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { isoDay } from "./helpers/dates";
import { eq, like } from "drizzle-orm";

import { db } from "../db";
import { appSettings, customers, emailLogs } from "../../shared/schema";
import { storage } from "../storage";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { createFixtureCustomer, createFixtureVehicle, createFixtureReservation, cleanupFixtures } from "./helpers/fixtures";
import { withSmtpStub } from "./helpers/smtpStub";

const OFFICE_KEY = "notification_office_email";
const OFFICE_ADDRESS = "kantoor@fixture-test.invalid";

let admin: TestAgent;

beforeAll(async () => {
  admin = await agentFor("admin");
}, 60_000);

afterAll(async () => {
  await db.delete(appSettings).where(eq(appSettings.key, OFFICE_KEY));
  await db.delete(emailLogs).where(like(emailLogs.subject, "%Herinnering%"));
  await cleanupFixtures();
  await cleanupFixtureUsers();
});

const addressOf = (rcpt: string): string => {
  const m = /<([^>]+)>/.exec(rcpt);
  return (m ? m[1] : rcpt).trim().toLowerCase();
};

function day(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return isoDay(d);
}

/** A vehicle with an APK due and no renter: B-24 says this one goes to the office. */
async function unrentedVehicleWithApk(): Promise<number> {
  const vehicle = await createFixtureVehicle({ apkDate: day(20) });
  const past = await createFixtureCustomer("W15office");
  await db.update(customers).set({ email: `w15-${past.id}@fixture-test.invalid` }).where(eq(customers.id, past.id));
  await createFixtureReservation({
    customerId: past.id, vehicleId: vehicle.id,
    startDate: day(-400), endDate: day(-380), status: "completed",
  });
  return vehicle.id;
}

describe("het kantooradres voor meldingen is in te stellen en wordt gebruikt", () => {
  it("het instellingenscherm kan het adres opslaan via /api/app-settings", async () => {
    const res = await admin.post("/api/app-settings").send({
      key: OFFICE_KEY,
      value: { email: OFFICE_ADDRESS },
      category: "notifications",
      description: "Kantooradres voor meldingen die niet naar een klant gaan",
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const stored = await storage.getAppSettingByKey(OFFICE_KEY);
    expect((stored?.value as any)?.email).toBe(OFFICE_ADDRESS);
  }, 30_000);

  it("de melding voor een auto zonder huurder gaat naar dat adres", async () => {
    const vehicleId = await unrentedVehicleWithApk();

    const captured = await withSmtpStub("ok", async (stub) => {
      const res = await admin.post("/api/notifications/send").send({ vehicleIds: [vehicleId], template: "apk" });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      return stub.state.messages.flatMap((m) => m.rcptTo.map(addressOf));
    });

    expect(captured).toEqual([OFFICE_ADDRESS]);
  }, 60_000);

  it("een leeg kantooradres valt terug op het afzenderadres", async () => {
    const existing = await storage.getAppSettingByKey(OFFICE_KEY);
    if (existing) await storage.updateAppSetting(existing.id, { value: { email: "" } as any });
    const vehicleId = await unrentedVehicleWithApk();

    const captured = await withSmtpStub("ok", async (stub) => {
      const res = await admin.post("/api/notifications/send").send({ vehicleIds: [vehicleId], template: "apk" });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      return stub.state.messages.flatMap((m) => m.rcptTo.map(addressOf));
    });

    expect(captured).toEqual(["noreply@fixture-test.invalid"]);
  }, 60_000);
});
