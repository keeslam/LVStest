/**
 * D11 (besluiten B-41, ontwerp 7.1) — the office time zone on the server.
 *
 * `app_settings.office_timezone` (default Europe/Amsterdam) is the one place
 * that says which calendar "today" is read on. `officeTimeZone()` is
 * synchronous on purpose: `isoToday()` and friends are called from hundreds of
 * synchronous places, so the value lives in memory and is refreshed from the
 * database
 *   - at start-up (`loadOfficeTimeZone()` in server/index.ts),
 *   - whenever the settings route stores the key (cache cleared on save), and
 *   - in the background once the cached value is older than 60 s, so a second
 *     instance's change is picked up too.
 * Until the first load nothing touches the database: the default answers, which
 * is also what a unit test without a database sees.
 *
 * A change fires an event; the cron schedulers listen and re-create their task
 * in the new zone (`createOfficeCronTask`), because node-cron fixes the zone
 * when a task is created.
 */
import { EventEmitter } from "node:events";
import * as cron from "node-cron";
import {
  DEFAULT_OFFICE_TIMEZONE,
  OFFICE_TIMEZONE_KEY,
  officeTimeZoneFromSetting,
} from "../../shared/office-timezone";

const CACHE_TTL_MS = 60_000;
const CHANGE_EVENT = "change";

let zone = DEFAULT_OFFICE_TIMEZONE;
/** 0 = never loaded; the database is only consulted after the first explicit load. */
let loadedAt = 0;
let loading: Promise<string> | null = null;
let reloadRequested = false;
const events = new EventEmitter();
// Six schedulers plus the pollers listen; the default of 10 is close enough to warn on a seventh.
events.setMaxListeners(50);

/** The zone the office works in. Cheap and synchronous; see the module comment. */
export function officeTimeZone(): string {
  if (loadedAt !== 0 && Date.now() - loadedAt >= CACHE_TTL_MS) void loadOfficeTimeZone();
  return zone;
}

async function readOnce(): Promise<void> {
  let next = zone;
  try {
    // Imported here: storage pulls in the database, which this module must not need to be imported.
    const { storage } = await import("../storage");
    const row = await storage.getAppSettingByKey(OFFICE_TIMEZONE_KEY);
    next = officeTimeZoneFromSetting(row?.value);
  } catch (error) {
    console.warn("office_timezone could not be read, keeping", zone, error);
  }
  loadedAt = Date.now();
  if (next !== zone) {
    zone = next;
    events.emit(CHANGE_EVENT, zone);
  }
}

/**
 * Reads the setting from the database now, replacing the cached value. Never rejects.
 * A call made while a read is already running (a background reload that started just before a
 * save) asks for one more read after it, and resolves only after that one: the save's own
 * `await` therefore never gets the value from before the save.
 */
export function loadOfficeTimeZone(): Promise<string> {
  if (loading) {
    reloadRequested = true;
    return loading;
  }
  loading = (async () => {
    do {
      reloadRequested = false;
      await readOnce();
    } while (reloadRequested);
    return zone;
  })().finally(() => { loading = null; });
  return loading;
}

/** Calls `listener(newZone)` after the zone changed; returns the function that stops listening. */
export function onOfficeTimeZoneChange(listener: (zone: string) => void): () => void {
  events.on(CHANGE_EVENT, listener);
  return () => { events.off(CHANGE_EVENT, listener); };
}

export interface OfficeCronTask {
  start(): void;
  stop(): void;
}

/**
 * A cron task that always runs in the office zone: created in the current zone
 * and re-created (same expression and handler) when the setting changes.
 * Stopping it also stops listening.
 */
export function createOfficeCronTask(expression: string, handler: () => unknown): OfficeCronTask {
  let task: cron.ScheduledTask | null = null;
  let running = false;
  let unsubscribe: (() => void) | null = null;

  const create = () => {
    task = cron.createTask(expression, () => handler(), { timezone: officeTimeZone() });
    task.start();
  };

  return {
    start() {
      if (running) return;
      running = true;
      create();
      unsubscribe = onOfficeTimeZoneChange(() => {
        task?.stop();
        create();
        console.log(`Scheduled task "${expression}" moved to ${officeTimeZone()}`);
      });
    },
    stop() {
      running = false;
      unsubscribe?.();
      unsubscribe = null;
      task?.stop();
      task = null;
    },
  };
}
