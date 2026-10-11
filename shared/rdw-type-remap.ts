/**
 * D17 (besluiten D, spec §13): the RDW vehicle-type re-map, applied from the app.
 *
 * The server stores the plan under this `app_settings` key; the settings card
 * (client) and the service (server) share the shapes below.
 */
export const RDW_TYPE_REMAP_PLAN_KEY = "rdw_type_remap_plan";

/** The audit action written for every vehicle whose type the apply step changed. */
export const RDW_TYPE_REMAP_AUDIT_ACTION = "vehicle.type-remap";

export interface RdwTypeRemapRow {
  id: number;
  plate: string;
  /** The type the vehicle had when the plan was made (null = none stored). */
  from: string | null;
  /** The type the current RDW mapping gives. */
  to: string;
}

export interface RdwTypeRemapPlan {
  createdAt: string;
  rows: RdwTypeRemapRow[];
  /** Plates the RDW does not know; their type is kept. */
  notFound: string[];
  /** Plates whose lookup failed (timeout, RDW outage); their type is kept. */
  failed: string[];
  /** How many vehicles were looked at. */
  checked: number;
}

export type RdwTypeRemapJobStatus = "idle" | "running" | "done" | "error";

export interface RdwTypeRemapJob {
  status: RdwTypeRemapJobStatus;
  total: number;
  checked: number;
  startedAt: string | null;
  finishedAt: string | null;
  /** A stable code, never the English text of an exception. */
  errorCode: string | null;
}

/** Answer of GET /api/vehicles/rdw-type-remap/plan. */
export interface RdwTypeRemapStatus {
  job: RdwTypeRemapJob;
  plan: RdwTypeRemapPlan | null;
}

/** Answer of POST /api/vehicles/rdw-type-remap/apply. */
export interface RdwTypeRemapApplyResult {
  applied: number;
  skipped: number;
}
