/**
 * Kees, 2026-10-19: one-off cleanups at start-up, each only with its CLEANUP_* flag set to "apply",
 * always in the order orphans -> stale reservations -> plates, and a failure never stops the start.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { calls, system } = vi.hoisted(() => ({ calls: [] as string[], system: vi.fn(async () => {}) }));
vi.mock("../../scripts/orphan-blocks-to-bin", () => ({
  moveOrphanBlocksToBin: vi.fn(async () => { calls.push("orphans"); return { found: 3, moved: 3, failed: [] }; }),
}));
vi.mock("../../scripts/close-returned-reservations", () => ({
  closeStaleReservations: vi.fn(async () => {
    calls.push("stale");
    return { dryRun: false, today: "2026-10-19", returned: { candidates: 0, closed: 0 }, neverPickedUp: { candidates: 2, closed: 2 }, legacyStatus: { candidates: 1, closed: 1 }, stillOutWorklist: 5 };
  }),
}));
const plates = vi.hoisted(() => ({ collide: false, throws: false }));
vi.mock("../../scripts/normalize-license-plates", () => ({
  normalizeLicensePlates: vi.fn(async () => {
    calls.push("plates");
    if (plates.throws) throw new Error("boom");
    return plates.collide
      ? { candidates: 2, collisions: [{ normalised: "AB12CD", vehicles: [{ id: 1 }, { id: 2 }] }], normalised: 0, indexCreated: false, dryRun: false }
      : { candidates: 2, collisions: [], normalised: 2, indexCreated: true, dryRun: false };
  }),
}));
vi.mock("../utils/security/auditLogger", () => ({ AuditLogger: { system } }));

import { runOneOffCleanups } from "../services/one-off-cleanups";

describe("eenmalige opschoning bij het opstarten", () => {
  beforeEach(() => { calls.length = 0; system.mockClear(); plates.collide = false; plates.throws = false; });

  it("does nothing without flags (the default)", async () => {
    expect(await runOneOffCleanups({})).toEqual({ ran: [], failed: [] });
    expect(calls).toEqual([]);
    // Anything but the exact word "apply" is off.
    await runOneOffCleanups({ CLEANUP_ORPHAN_BLOCKS: "true", CLEANUP_STALE_RESERVATIONS: "1" });
    expect(calls).toEqual([]);
  });

  it("runs only the flagged steps, always in the fixed order, each with an activity-log row", async () => {
    const r = await runOneOffCleanups({ CLEANUP_NORMALIZE_PLATES: "apply", CLEANUP_ORPHAN_BLOCKS: "apply", CLEANUP_STALE_RESERVATIONS: "apply" });
    expect(calls).toEqual(["orphans", "stale", "plates"]);
    expect(r).toEqual({ ran: ["orphans", "stale", "plates"], failed: [] });
    expect(system.mock.calls.map((c: unknown[]) => c[0])).toEqual(["system.cleanup-orphan-blocks", "system.cleanup-stale-reservations", "system.cleanup-normalize-plates"]);
    await runOneOffCleanups({ CLEANUP_STALE_RESERVATIONS: "apply" });
    expect(calls.slice(3)).toEqual(["stale"]);
  });

  it("a plate collision or a failing step is reported, not thrown", async () => {
    plates.collide = true;
    expect((await runOneOffCleanups({ CLEANUP_NORMALIZE_PLATES: "apply" })).failed).toEqual(["plates"]);
    plates.throws = true;
    await expect(runOneOffCleanups({ CLEANUP_NORMALIZE_PLATES: "apply" })).resolves.toEqual({ ran: [], failed: ["plates"] });
  });
});
