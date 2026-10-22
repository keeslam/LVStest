/**
 * OPT-002 — the tile router: "Ophalen starten" for a booked reservation,
 * "Innemen starten" for a picked-up one. Pure logic, so it lives in the node
 * project next to the other client helpers.
 */
import { describe, it, expect } from "vitest";
import { chooseHandover, matchesIntent } from "../handover-choice";

describe("OPT-002 — ophalen of innemen", () => {
  it("picks 'return' for a picked-up reservation", () => {
    expect(chooseHandover({ activeReservation: { id: 7, status: "picked_up" } }))
      .toEqual({ kind: "return", reservationId: 7 });
  });

  it("picks 'pickup' for a booked reservation", () => {
    expect(chooseHandover({ activeReservation: { id: 8, status: "booked" } }))
      .toEqual({ kind: "pickup", reservationId: 8 });
  });

  it("picks 'pickup' for a pending reservation too", () => {
    expect(chooseHandover({ activeReservation: { id: 9, status: "pending" } }))
      .toEqual({ kind: "pickup", reservationId: 9 });
  });

  it("falls back to the upcoming reservation when nothing is active", () => {
    expect(chooseHandover({ activeReservation: null, upcomingReservation: { id: 10, status: "booked" } }))
      .toEqual({ kind: "pickup", reservationId: 10 });
  });

  it("prefers the active reservation over the upcoming one", () => {
    expect(chooseHandover({
      activeReservation: { id: 11, status: "picked_up" },
      upcomingReservation: { id: 12, status: "booked" },
    })).toEqual({ kind: "return", reservationId: 11 });
  });

  it("has no handover to offer for a free vehicle", () => {
    expect(chooseHandover({})).toBeNull();
    expect(chooseHandover({ activeReservation: null, upcomingReservation: null })).toBeNull();
  });

  it("only auto-starts when the scan agrees with the tile that was pressed", () => {
    const ret = { kind: "return", reservationId: 3 } as const;
    expect(matchesIntent(ret, "return")).toBe(true);
    expect(matchesIntent(ret, "pickup")).toBe(false);
    // No intent (the plain "Scannen" tile) never auto-starts anything.
    expect(matchesIntent(ret, null)).toBe(false);
    expect(matchesIntent(null, "return")).toBe(false);
  });
});

describe("handoverForReservation (Kees 2026-10-22: scanned contract)", () => {
  it("returns a car that is out and hands over one that is booked", async () => {
    const { handoverForReservation } = await import("@/lib/handover-choice");
    expect(handoverForReservation({ id: 1, status: "picked_up", type: "standard" }, true)).toEqual({ kind: "return", reservationId: 1 });
    expect(handoverForReservation({ id: 2, status: "booked", type: "replacement" }, true)).toEqual({ kind: "pickup", reservationId: 2 });
  });
  it("offers nothing without a car, when finished, or for a maintenance block", async () => {
    const { handoverForReservation } = await import("@/lib/handover-choice");
    expect(handoverForReservation({ id: 3, status: "booked", type: "standard" }, false)).toBeNull();
    expect(handoverForReservation({ id: 4, status: "returned", type: "standard" }, true)).toBeNull();
    expect(handoverForReservation({ id: 5, status: "booked", type: "maintenance_block" }, true)).toBeNull();
  });
});
