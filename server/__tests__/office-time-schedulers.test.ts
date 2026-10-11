/**
 * D11 — de planners lopen in de kantoorzone en plannen zichzelf opnieuw in
 * als die zone in App-instellingen verandert (node-cron legt de zone vast bij
 * het aanmaken van een taak). De CJIB-poller had geen zone en draaide dus in
 * die van het proces.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { eq } from "drizzle-orm";

const created = vi.hoisted(() => [] as Array<{ expr: string; options: any; started: boolean; stopped: boolean; start(): void; stop(): void }>);

vi.mock("node-cron", () => {
  const createTask = (expr: string, _fn: unknown, options: any) => {
    const t = { expr, options, started: false, stopped: false, start() { t.started = true; }, stop() { t.stopped = true; } };
    created.push(t);
    return t;
  };
  return { createTask, schedule: createTask, default: { createTask, schedule: createTask } };
});

vi.mock("../services/cjib/config", async (orig) => ({
  ...(await orig<typeof import("../services/cjib/config")>()),
  getCjibConfig: async () => ({ enabled: true, host: "ftp.cjib.nl", pollMinutes: 15 }),
}));
vi.mock("../services/invoice-inbox/config", async (orig) => ({
  ...(await orig<typeof import("../services/invoice-inbox/config")>()),
  getInvoiceInboxConfig: async () => ({ enabled: true, host: "imap.example.nl", pollMinutes: 15 }),
}));

import { db } from "../db";
import { appSettings } from "../../shared/schema";
import { storage } from "../storage";
import { loadOfficeTimeZone, createOfficeCronTask } from "../services/office-time";
import { ApkScanScheduler } from "../apkScanScheduler";
import { FiscalScheduler } from "../fiscalScheduler";
import { PortalAlertScheduler } from "../portalAlertScheduler";
import { ServiceDueScheduler } from "../serviceDueScheduler";
import { BackupScheduler } from "../backupScheduler";
import { startCjibScheduler, stopCjibScheduler } from "../services/cjib/poller";
import { startInvoiceInboxScheduler, stopInvoiceInboxScheduler } from "../services/invoice-inbox/poller";

const KEY = "office_timezone";

async function setZone(zone: string | null) {
  const row = await storage.getAppSettingByKey(KEY);
  if (zone === null) {
    if (row) await db.delete(appSettings).where(eq(appSettings.key, KEY));
  } else if (row) {
    await storage.updateAppSetting(row.id, { value: zone as any });
  } else {
    await storage.createAppSetting({ key: KEY, value: zone as any, category: "business", description: "x" } as any);
  }
  await loadOfficeTimeZone();
}

beforeAll(async () => { await setZone(null); });
afterAll(async () => { await setZone(null); });
beforeEach(() => { created.length = 0; });
afterEach(async () => { vi.useRealTimers(); await setZone(null); });

const timezones = () => created.filter((t) => !t.stopped).map((t) => t.options?.timezone);

describe("createOfficeCronTask", () => {
  it("maakt de taak in de kantoorzone en vervangt hem bij een wijziging", async () => {
    const task = createOfficeCronTask("0 2 * * *", () => {});
    task.start();
    expect(created).toHaveLength(1);
    expect(created[0].options.timezone).toBe("Europe/Amsterdam");
    expect(created[0].started).toBe(true);

    await setZone("America/Curacao");
    expect(created).toHaveLength(2);
    expect(created[0].stopped).toBe(true);
    expect(created[1].options.timezone).toBe("America/Curacao");
    expect(created[1].started).toBe(true);
    expect(created[1].expr).toBe("0 2 * * *");

    task.stop();
    expect(created[1].stopped).toBe(true);
    await setZone("Europe/Amsterdam");
    expect(created).toHaveLength(2); // a stopped task is not brought back
  });
});

describe("elke planner volgt de instelling", () => {
  const cases: Array<[string, () => { start(): void; stop(): void }]> = [
    ["APK-scan", () => new ApkScanScheduler()],
    ["fiscale nachtrun", () => new FiscalScheduler()],
    ["portaalmeldingen", () => new PortalAlertScheduler()],
    ["onderhoudsmelding", () => new ServiceDueScheduler()],
    ["back-up", () => new BackupScheduler()],
  ];

  for (const [name, make] of cases) {
    it(`${name}: start in Amsterdam, herplant in Curacao, stopt netjes`, async () => {
      const scheduler = make();
      scheduler.start();
      expect(timezones()).toEqual(["Europe/Amsterdam"]);
      await setZone("America/Curacao");
      expect(timezones()).toEqual(["America/Curacao"]);
      scheduler.stop();
      expect(timezones()).toEqual([]);
    });
  }

  it("CJIB-poller: kreeg nooit een zone, nu wel, en volgt de wijziging", async () => {
    await startCjibScheduler();
    expect(timezones()).toEqual(["Europe/Amsterdam"]);
    await setZone("America/Curacao");
    expect(timezones()).toEqual(["America/Curacao"]);
    stopCjibScheduler();
    expect(timezones()).toEqual([]);
  });

  it("factuurpostvak-poller: volgt de wijziging", async () => {
    await startInvoiceInboxScheduler();
    expect(timezones()).toEqual(["Europe/Amsterdam"]);
    await setZone("America/Curacao");
    expect(timezones()).toEqual(["America/Curacao"]);
    stopInvoiceInboxScheduler();
    expect(timezones()).toEqual([]);
  });

  it("de back-up meldt het volgende moment om 02:00 op de kantooragenda", async () => {
    const scheduler = new BackupScheduler();
    scheduler.start();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-15T10:00:00Z")); // 12:00 in Amsterdam
    expect(scheduler.getStatus().nextRun).toBe("2026-07-16T00:00:00.000Z"); // 02:00 CEST
    await setZone("America/Curacao");
    vi.setSystemTime(new Date("2026-07-15T10:00:00Z")); // 06:00 in Curacao
    expect(scheduler.getStatus().nextRun).toBe("2026-07-16T06:00:00.000Z");
    scheduler.stop();
  });
});
