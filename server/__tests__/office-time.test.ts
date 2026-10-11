/**
 * D11 (besluiten B-41, ontwerp 7.1) — de tijdzone van het kantoor is een
 * instelling (`office_timezone`, standaard Europe/Amsterdam) en elke plek die
 * "vandaag" moet weten leest haar.
 *
 * Bewijs dat de instelling doorwerkt: met `America/Curacao` (UTC-4, geen
 * zomertijd) is het om 23:30 UTC nog dezelfde dag, terwijl Amsterdam dan al op
 * de volgende dag zit.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { appSettings } from "../../shared/schema";
import { storage } from "../storage";
import { agentFor, cleanupFixtureUsers, type TestAgent } from "./helpers/app";
import { isoToday, officeDate } from "../services/lifecycle";
import {
  officeTimeZone,
  loadOfficeTimeZone,
  onOfficeTimeZoneChange,
} from "../services/office-time";
import { maintenanceStartsAt } from "../services/portal-maintenance-events";
import { formatDateTimeNL, formatLongDateTimeNL } from "../utils/dutch-format";

const KEY = "office_timezone";
let admin: TestAgent;
let nobody: TestAgent;

async function clearSetting() {
  await db.delete(appSettings).where(eq(appSettings.key, KEY));
  await loadOfficeTimeZone();
}

beforeAll(async () => {
  admin = await agentFor("admin");
  nobody = await agentFor([]);
  await clearSetting();
}, 60_000);

afterEach(clearSetting);
afterAll(async () => {
  await clearSetting();
  await cleanupFixtureUsers();
});

const save = (value: unknown) =>
  admin.post("/api/app-settings").send({ key: KEY, value, category: "business", description: "Tijdzone van het kantoor" });

describe("office_timezone: de instelling zelf", () => {
  it("staat zonder rij op Europe/Amsterdam", async () => {
    expect(await loadOfficeTimeZone()).toBe("Europe/Amsterdam");
    expect(officeTimeZone()).toBe("Europe/Amsterdam");
    expect(officeDate(new Date("2026-06-21T23:30:00Z"))).toBe("2026-06-22");
  });

  it("America/Curacao laat de datum meelopen: 23:30 UTC is daar nog dezelfde dag", async () => {
    const res = await save("America/Curacao");
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    expect(officeTimeZone()).toBe("America/Curacao");
    expect(officeDate(new Date("2026-06-21T23:30:00Z"))).toBe("2026-06-21");
    // And "today" is the Curacao calendar day of right now.
    const now = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Curacao", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    expect(isoToday()).toBe(now);
  });

  it("weigert een naam die geen tijdzone is, met een vaste code, en laat de zone staan", async () => {
    const res = await save("Mars/Olympus");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_OFFICE_TIMEZONE");
    expect(officeTimeZone()).toBe("Europe/Amsterdam");
    expect(await storage.getAppSettingByKey(KEY)).toBeUndefined();
  });

  it("is leesbaar voor elke ingelogde gebruiker, ook zonder rechten", async () => {
    await save("America/Curacao");
    const res = await nobody.get(`/api/app-settings/key/${KEY}`);
    expect(res.status).toBe(200);
    expect(res.body.value).toBe("America/Curacao");
  });

  it("de cache blijft 60 seconden staan en wordt bij opslaan geleegd", async () => {
    await save("America/Curacao");
    // A change made behind the application's back is not seen before the cache expires ...
    const row = await storage.getAppSettingByKey(KEY);
    await storage.updateAppSetting(row!.id, { value: "Europe/London" as any });
    expect(officeTimeZone()).toBe("America/Curacao");
    // ... but saving through the screen is, at once.
    await save("Europe/Lisbon");
    expect(officeTimeZone()).toBe("Europe/Lisbon");
  });

  it("meldt een wijziging aan wie erop wacht (de planners)", async () => {
    const seen: string[] = [];
    const off = onOfficeTimeZoneChange((zone) => seen.push(zone));
    await save("America/Curacao");
    await save("America/Curacao"); // same value: no second event
    await save("Europe/Amsterdam");
    off();
    await save("America/Curacao");
    expect(seen).toEqual(["America/Curacao", "Europe/Amsterdam"]);
  });
});

describe("plekken die de zone vast hadden volgen nu de instelling", () => {
  it("de start van een onderhoudsblok volgt de wandklok van de zone, ook zonder +1/+2", async () => {
    const block = { startDate: "2026-07-15", startTime: "08:00" } as any;
    expect(maintenanceStartsAt(block).toISOString()).toBe("2026-07-15T06:00:00.000Z");
    await save("America/Curacao");
    expect(maintenanceStartsAt(block).toISOString()).toBe("2026-07-15T12:00:00.000Z");
  });

  it("documenttijden worden in de kantoorzone geschreven, niet in die van het proces", async () => {
    const instant = new Date("2026-07-15T20:05:00Z");
    expect(formatDateTimeNL(instant)).toBe("15-07-2026 22:05");
    expect(formatLongDateTimeNL(instant)).toBe("15 juli 2026 22:05");
    // 23:30 UTC rolls over to the next day in Amsterdam, and the date follows the time.
    expect(formatDateTimeNL(new Date("2026-07-15T23:30:00Z"))).toBe("16-07-2026 01:30");
    await save("America/Curacao");
    expect(formatDateTimeNL(instant)).toBe("15-07-2026 16:05");
  });
});

describe("de fiscale CSV schrijft de beoordelingsdatum op de kantoorkalender", () => {
  const row = {
    customerId: 1, customerName: "Test", vehicleId: 1, licensePlate: "AB-123-C", vehicle: "Auto",
    usagePeriodId: 1, reservationId: 1, periodStart: "2026-06-01", periodEnd: null, assessmentId: 1,
    status: "provisional", statusLabel: "Voorlopig", month: "2026-06", days: 30, charged: false,
    reason: "no_private_use", reasonLabel: "x", amount: null, state: "provisional", ruleVersionTitle: null,
    assessedAt: "2026-06-21T23:30:00.000Z",
  } as any;
  const report = {
    year: 2026, withAmounts: false, rows: [row],
    totals: { amount: null, settled: null, provisional: null, chargedMonths: 0, periods: 1, unassessedPeriods: 0 },
    byCustomer: [], byMonth: [],
  } as any;

  it("23:30 UTC is 22 juni in Amsterdam en 21 juni op Curacao", async () => {
    const { reportToCsv } = await import("../services/fiscal/reports");
    expect(reportToCsv(report)).toContain(";22-06-2026\r\n");
    await save("America/Curacao");
    expect(reportToCsv(report)).toContain(";21-06-2026\r\n");
  });
});

describe("fix round 1 - bare dates, expiry of the cache and a save during a reload", () => {
  const withProcessZone = async (tz: string, fn: () => Promise<void> | void) => {
    const previous = process.env.TZ;
    process.env.TZ = tz;
    try { await fn(); } finally {
      if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
    }
  };

  it.each(["UTC", "Pacific/Auckland", "America/Los_Angeles"])(
    "een kale datum houdt zijn dag en staat op 00:00, in elke kantoorzone en bij procestijdzone %s",
    async (processZone) => {
      await withProcessZone(processZone, async () => {
        expect(formatDateTimeNL("2026-07-15")).toBe("15-07-2026 00:00");
        expect(formatLongDateTimeNL("2026-07-15")).toBe("15 juli 2026 00:00");
        await save("America/Curacao");
        expect(formatDateTimeNL("2026-07-15")).toBe("15-07-2026 00:00");
        expect(formatLongDateTimeNL("2026-07-15")).toBe("15 juli 2026 00:00");
        await save("Europe/Amsterdam");
        expect(formatDateTimeNL("2026-07-15")).toBe("15-07-2026 00:00");
      });
    },
  );

  it("na 60 seconden leest officeTimeZone() de instelling opnieuw (fake Date)", async () => {
    await save("America/Curacao");
    const row = await storage.getAppSettingByKey(KEY);
    await storage.updateAppSetting(row!.id, { value: "Europe/London" as any });
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(Date.now() + 59_000);
      expect(officeTimeZone()).toBe("America/Curacao"); // still inside the cache
      vi.setSystemTime(Date.now() + 2_000); // 61 s after the load
      expect(officeTimeZone()).toBe("America/Curacao"); // the stale value answers, the reload starts
      expect(await loadOfficeTimeZone()).toBe("Europe/London"); // joins the reload
      expect(officeTimeZone()).toBe("Europe/London");
    } finally {
      vi.useRealTimers();
    }
  });

  it("een opslag tijdens een lopende herlezing laat de cache niet op de oude waarde staan", async () => {
    await save("Europe/Lisbon");
    const row = await storage.getAppSettingByKey(KEY);
    // The reload that is already running reads the old value slowly ...
    const slowOld = vi.spyOn(storage, "getAppSettingByKey").mockImplementationOnce(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return { ...row!, value: "Europe/Lisbon" as any };
    });
    const running = loadOfficeTimeZone();
    // ... while the save has already stored the new one.
    await db.update(appSettings).set({ value: "America/Curacao" as any }).where(eq(appSettings.key, KEY));
    expect(await loadOfficeTimeZone()).toBe("America/Curacao");
    await running;
    expect(officeTimeZone()).toBe("America/Curacao");
    slowOld.mockRestore();
  });
});
