/**
 * D17 (besluiten D, spec §13) - applying the RDW vehicle-type re-map from the app.
 *
 * The RDW mapping in server/utils/rdw-api.ts was fixed (audit A-3-5: a 9-seat
 * passenger van used to be stored as "SUV"), but vehicles that already exist keep
 * their old type until somebody decides to change them. The production image has
 * no scripts/ and the operator no shell, so this is a two-step job in the app:
 *
 *   1. "Controleren": a background job asks the RDW about every vehicle (a short
 *      pause between lookups, every lookup under a timeout) and stores a plan in
 *      app_settings: the vehicles whose type would change, the plates the RDW does
 *      not know and the plates whose lookup failed. Nothing is changed.
 *   2. "Toepassen" (role admin): applies exactly that plan, a row only while the
 *      vehicle's type still equals what the plan saw, in ONE transaction, with an
 *      audit line per vehicle, and clears the plan.
 *
 * The type of a vehicle also decides which damage-check template it gets and what
 * the portal calls "the same type", which is why a list is shown and confirmed
 * before anything is written. scripts/remap-vehicle-types.ts stays for local use.
 */
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { appSettings, auditLogs, vehicles } from "../../shared/schema";
import {
  RDW_TYPE_REMAP_AUDIT_ACTION,
  RDW_TYPE_REMAP_PLAN_KEY,
  type RdwTypeRemapApplyResult,
  type RdwTypeRemapJob,
  type RdwTypeRemapPlan,
  type RdwTypeRemapRow,
  type RdwTypeRemapStatus,
} from "../../shared/rdw-type-remap";
import { fetchVehicleInfoByLicensePlate, RDWNotFoundError, RDWTimeoutError } from "../utils/rdw-api";
import { realtimeEvents } from "../realtime-events";

/** Pause between two RDW lookups: the open-data service is shared, be kind to it. */
const DEFAULT_PAUSE_MS = 150;
/** One stuck lookup must not hold the whole job (the lookup has its own, shorter, limit). */
const DEFAULT_LOOKUP_TIMEOUT_MS = 15_000;

export class RemapCheckRunningError extends Error {
  code = "REMAP_CHECK_RUNNING";
  constructor() {
    super("An RDW type check is already running");
  }
}

export class RemapPlanMissingError extends Error {
  code = "REMAP_PLAN_MISSING";
  constructor() {
    super("There is no RDW type plan to apply");
  }
}

export interface RemapCheckOptions {
  /** Test seam; defaults to the real RDW lookup. */
  lookup?: (plate: string) => Promise<{ vehicleType?: string | null }>;
  pauseMs?: number;
  lookupTimeoutMs?: number;
}

const idleJob = (): RdwTypeRemapJob => ({
  status: "idle", total: 0, checked: 0, startedAt: null, finishedAt: null, errorCode: null,
});

/** One job per process: the app runs as a single instance. */
let job: RdwTypeRemapJob = idleJob();

export function getRemapJob(): RdwTypeRemapJob {
  return { ...job };
}

function pauseFromEnv(): number {
  const raw = process.env.RDW_TYPE_REMAP_PAUSE_MS;
  const parsed = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_PAUSE_MS;
}

const sleep = (ms: number) => (ms > 0 ? new Promise<void>((resolve) => setTimeout(resolve, ms)) : Promise.resolve());

/** Rejects with a timeout error when `promise` takes longer than `ms`. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const signal = AbortSignal.timeout(ms);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new RDWTimeoutError());
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => { signal.removeEventListener("abort", onAbort); resolve(value); },
      (error) => { signal.removeEventListener("abort", onAbort); reject(error); },
    );
  });
}

/** Writes (or replaces) the stored plan. */
async function savePlan(plan: RdwTypeRemapPlan): Promise<void> {
  const [existing] = await db.select({ id: appSettings.id }).from(appSettings).where(eq(appSettings.key, RDW_TYPE_REMAP_PLAN_KEY));
  if (existing) {
    await db.update(appSettings)
      .set({ value: plan as unknown as Record<string, any>, updatedAt: new Date() })
      .where(eq(appSettings.id, existing.id));
    return;
  }
  await db.insert(appSettings).values({
    key: RDW_TYPE_REMAP_PLAN_KEY,
    value: plan as unknown as Record<string, any>,
    category: "vehicles",
    description: "Plan of the RDW vehicle-type check (Instellingen > Voertuigen); cleared when applied",
  });
}

export async function loadRemapPlan(): Promise<RdwTypeRemapPlan | null> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, RDW_TYPE_REMAP_PLAN_KEY));
  const value = row?.value as Partial<RdwTypeRemapPlan> | undefined;
  if (!value || !Array.isArray(value.rows)) return null;
  return {
    createdAt: String(value.createdAt ?? ""),
    rows: value.rows,
    notFound: Array.isArray(value.notFound) ? value.notFound : [],
    failed: Array.isArray(value.failed) ? value.failed : [],
    checked: typeof value.checked === "number" ? value.checked : 0,
  };
}

export async function getRemapStatus(): Promise<RdwTypeRemapStatus> {
  return { job: getRemapJob(), plan: await loadRemapPlan() };
}

/** The pure part: what the RDW answered for one vehicle, as a plan row (or nothing). */
export function planRow(
  vehicle: { id: number; licensePlate: string; vehicleType: string | null },
  rdwType: string | null | undefined,
): RdwTypeRemapRow | null {
  // The RDW gave no type: nothing to compare with, keep the stored one.
  if (!rdwType || rdwType === vehicle.vehicleType) return null;
  return { id: vehicle.id, plate: vehicle.licensePlate, from: vehicle.vehicleType ?? null, to: rdwType };
}

/** Runs the check to the end. Exported for the tests; the route uses startRemapCheck. */
export async function runRemapCheck(options: RemapCheckOptions = {}): Promise<void> {
  const lookup = options.lookup ?? fetchVehicleInfoByLicensePlate;
  const pauseMs = options.pauseMs ?? pauseFromEnv();
  const lookupTimeoutMs = options.lookupTimeoutMs ?? DEFAULT_LOOKUP_TIMEOUT_MS;
  try {
    const list = await db
      .select({ id: vehicles.id, licensePlate: vehicles.licensePlate, vehicleType: vehicles.vehicleType })
      .from(vehicles)
      .orderBy(vehicles.id);
    job.total = list.length;

    const rows: RdwTypeRemapRow[] = [];
    const notFound: string[] = [];
    const failed: string[] = [];
    for (const vehicle of list) {
      try {
        const info = await withTimeout(Promise.resolve(lookup(vehicle.licensePlate)), lookupTimeoutMs);
        const row = planRow(vehicle, info?.vehicleType);
        if (row) rows.push(row);
      } catch (error) {
        if (error instanceof RDWNotFoundError) notFound.push(vehicle.licensePlate);
        else failed.push(vehicle.licensePlate);
      }
      job.checked += 1;
      await sleep(pauseMs);
    }

    await savePlan({ createdAt: new Date().toISOString(), rows, notFound, failed, checked: list.length });
    job = { ...job, status: "done", finishedAt: new Date().toISOString() };
  } catch (error) {
    console.error("RDW type check failed:", error);
    job = { ...job, status: "error", finishedAt: new Date().toISOString(), errorCode: "REMAP_CHECK_FAILED" };
  }
}

/**
 * Starts the check in the background and returns at once. Throws
 * RemapCheckRunningError while another run is busy.
 */
export function startRemapCheck(options: RemapCheckOptions = {}): RdwTypeRemapJob {
  if (job.status === "running") throw new RemapCheckRunningError();
  job = { ...idleJob(), status: "running", startedAt: new Date().toISOString() };
  void runRemapCheck(options);
  return getRemapJob();
}

/**
 * Applies the stored plan: a row only while the vehicle's type still equals what the
 * plan saw. One transaction for the type changes, the audit lines and clearing the plan,
 * and the plan row is locked, so two clicks cannot both apply it.
 */
export async function applyRemapPlan(actor: { id?: number | null; username?: string | null }): Promise<RdwTypeRemapApplyResult> {
  if (job.status === "running") throw new RemapCheckRunningError();

  const changedIds: number[] = [];
  const result = await db.transaction(async (tx) => {
    const [setting] = await tx.select().from(appSettings)
      .where(eq(appSettings.key, RDW_TYPE_REMAP_PLAN_KEY))
      .for("update");
    const plan = setting?.value as Partial<RdwTypeRemapPlan> | undefined;
    if (!setting || !plan || !Array.isArray(plan.rows)) throw new RemapPlanMissingError();

    let applied = 0;
    let skipped = 0;
    for (const row of plan.rows) {
      const stillSame = row.from === null || row.from === undefined
        ? isNull(vehicles.vehicleType)
        : eq(vehicles.vehicleType, row.from);
      const updated = await tx.update(vehicles)
        .set({ vehicleType: row.to, updatedBy: actor.username ?? null, updatedAt: new Date() })
        .where(and(eq(vehicles.id, row.id), stillSame))
        .returning({ id: vehicles.id });
      if (updated.length === 0) { skipped += 1; continue; }
      applied += 1;
      changedIds.push(row.id);
      await tx.insert(auditLogs).values({
        userId: actor.id ?? null,
        username: actor.username ?? "system",
        action: RDW_TYPE_REMAP_AUDIT_ACTION,
        resourceType: "vehicle",
        resourceId: String(row.id),
        details: { plate: row.plate, from: row.from, to: row.to, source: "rdw-type-remap" },
        status: "success",
      });
    }

    await tx.delete(appSettings).where(eq(appSettings.id, setting.id));
    return { applied, skipped } satisfies RdwTypeRemapApplyResult;
  });

  for (const id of changedIds) realtimeEvents.vehicles.updated({ id });
  return result;
}
