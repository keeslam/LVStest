/**
 * Sub-project C, task 3 (besluiten B-30, B-39) - `planRevert`, the pure half of
 * the reversal engine. No database: a plan is a function of the reservation, the
 * vehicle and three facts the caller looked up (a later handover exists, the
 * reservation's documents, the vehicle is free for the period).
 *
 * Spec: docs/superpowers/specs/2026-10-09-terugdraaien-prullenbak-design.md
 * section 2.2 (plan shape) and 2.3 (the rules table). The routes are covered by
 * c-03-revert.test.ts.
 */
import { describe, it, expect } from "vitest";
import type { Document, Reservation, Vehicle } from "../../shared/schema";
import { planRevert, revertPlanHash, type PlanRevertInput } from "../services/reservation-revert";
import { RESERVATION_REVERT_TARGETS, isReservationRevert } from "../services/lifecycle";

function reservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: 1, vehicleId: 10, customerId: 20, driverId: null,
    startDate: "2026-10-01", endDate: "2026-10-05", startTime: null, endTime: null,
    actualPickupDate: null, actualReturnDate: null, completionDate: null,
    status: "booked", totalPrice: null, notes: null, damageCheckPath: null, contractNumber: null,
    type: "standard", spareVehicleStatus: "assigned",
    pickupMileage: null, returnMileage: null, fuelLevelPickup: null, fuelLevelReturn: null,
    fuelCost: null, fuelCardNumber: null, fuelNotes: null,
    vehicleMileageBeforePickup: null, vehicleFuelBeforePickup: null,
    vehicleMileageBeforeReturn: null, vehicleFuelBeforeReturn: null,
    deletedAt: null,
    ...overrides,
  } as unknown as Reservation;
}

function vehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return { id: 10, currentMileage: 5100, currentFuelLevel: "full", ...overrides } as unknown as Vehicle;
}

function doc(id: number, documentType: string, overrides: Partial<Document> = {}): Document {
  return { id, documentType, reservationId: 1, isStale: false, ...overrides } as unknown as Document;
}

/** A rental picked up at 5100 when the vehicle stood at 5000 / "1/2". */
const pickedUp = () => reservation({
  status: "picked_up", actualPickupDate: "2026-10-02", pickupMileage: 5100, fuelLevelPickup: "full",
  contractNumber: "C-1", vehicleMileageBeforePickup: 5000, vehicleFuelBeforePickup: "1/2",
});

/** The same rental returned at 5400 when the vehicle stood at 5100 / "full". */
const returned = () => reservation({
  ...pickedUp(), status: "completed", actualReturnDate: "2026-10-04", returnMileage: 5400,
  fuelLevelReturn: "1/4", fuelCost: "30.00", fuelCardNumber: "FC-1", fuelNotes: "getankt",
  completionDate: "2026-10-04", vehicleMileageBeforeReturn: 5100, vehicleFuelBeforeReturn: "full",
});

const free: PlanRevertInput["vehicleVerdict"] = { bookable: true, reason: null };
const base = { laterHandoverExists: false, documents: [] as Document[], vehicleVerdict: free };

describe("C-03 planRevert - picked_up to booked", () => {
  it("clears the pickup data, restores the before-pickup readings and flags the decrease", () => {
    const plan = planRevert({ ...base, reservation: pickedUp(), vehicle: vehicle({ currentMileage: 5100, currentFuelLevel: "full" }) });
    expect(plan.fromStatus).toBe("picked_up");
    expect(plan.toStatus).toBe("booked");
    expect(plan.clears.sort()).toEqual([
      "actualPickupDate", "contractNumber", "fuelLevelPickup", "pickupMileage",
      "vehicleFuelBeforePickup", "vehicleMileageBeforePickup",
    ]);
    expect(plan.vehicle.current).toEqual({ mileage: 5100, fuel: "full" });
    expect(plan.vehicle.restoreTo).toEqual({ mileage: 5000, fuel: "1/2" });
    expect(plan.vehicle.reason).toBeUndefined();
    expect(plan.requiresMileageConfirmation).toBe(true);
    expect(plan.blocked).toBeUndefined();
    expect(plan.warnings).toEqual([]);
  });

  it("marks only the unsigned contract(s) stale, never a signed one or a damage check", () => {
    const plan = planRevert({
      ...base, reservation: pickedUp(), vehicle: vehicle(),
      documents: [
        doc(3, "Contract (Unsigned)"),
        doc(4, "Contract (Unsigned)", { isStale: true }), // already stale: nothing to do
        doc(5, "Contract (Signed)"),
        doc(6, "Damage Check"),
        doc(7, "Damage Check (Unsigned)"),
      ],
    });
    expect(plan.documentsToMarkStale).toEqual([{ id: 3, documentType: "Contract (Unsigned)", kind: "contract" }]);
  });

  it("no mileage confirmation when the odometer does not go down", () => {
    const plan = planRevert({ ...base, reservation: pickedUp(), vehicle: vehicle({ currentMileage: 5000 }) });
    expect(plan.vehicle.restoreTo).toEqual({ mileage: 5000, fuel: "1/2" });
    expect(plan.requiresMileageConfirmation).toBe(false);
  });

  it("a replacement row's spare status goes back to assigned", () => {
    const plan = planRevert({
      ...base, reservation: reservation({ ...pickedUp(), type: "replacement", spareVehicleStatus: "picked_up" }), vehicle: vehicle(),
    });
    expect(plan.clears).toContain("spareVehicleStatus");
  });

  it("a standard row never lists spareVehicleStatus", () => {
    const plan = planRevert({ ...base, reservation: pickedUp(), vehicle: vehicle() });
    expect(plan.clears).not.toContain("spareVehicleStatus");
  });

  it("a legacy 'active' row is a picked-up rental", () => {
    const plan = planRevert({ ...base, reservation: reservation({ ...pickedUp(), status: "active" }), vehicle: vehicle() });
    expect(plan.fromStatus).toBe("picked_up");
    expect(plan.toStatus).toBe("booked");
  });
});

describe("C-03 planRevert - returned / completed to picked_up", () => {
  it("clears the return data and completionDate, restores the before-return readings", () => {
    const plan = planRevert({ ...base, reservation: returned(), vehicle: vehicle({ currentMileage: 5400, currentFuelLevel: "1/4" }) });
    expect(plan.fromStatus).toBe("completed");
    expect(plan.toStatus).toBe("picked_up");
    expect(plan.clears.sort()).toEqual([
      "actualReturnDate", "completionDate", "fuelCardNumber", "fuelCost", "fuelLevelReturn", "fuelNotes",
      "returnMileage", "vehicleFuelBeforeReturn", "vehicleMileageBeforeReturn",
    ]);
    // The pickup side is left alone.
    expect(plan.clears).not.toContain("actualPickupDate");
    expect(plan.clears).not.toContain("contractNumber");
    expect(plan.vehicle.restoreTo).toEqual({ mileage: 5100, fuel: "full" });
    expect(plan.requiresMileageConfirmation).toBe(true);
  });

  it("lists only the columns that hold a value", () => {
    const plan = planRevert({
      ...base, reservation: reservation({ ...returned(), fuelCost: null, fuelCardNumber: null, fuelNotes: null }),
      vehicle: vehicle({ currentMileage: 5400 }),
    });
    expect(plan.clears).not.toContain("fuelCost");
    expect(plan.clears).not.toContain("fuelCardNumber");
    expect(plan.clears).not.toContain("fuelNotes");
    expect(plan.clears).toContain("returnMileage");
  });

  it("marks the return damage check(s) stale (and nothing else)", () => {
    const plan = planRevert({
      ...base, reservation: returned(), vehicle: vehicle({ currentMileage: 5400 }),
      documents: [
        doc(1, "Damage Check"),
        doc(2, "Damage Check (Return)"),
        doc(3, "Damage Check (Pickup)"),
        doc(4, "Damage Check (Unsigned)"),
        doc(5, "Contract (Unsigned)"),
      ],
    });
    expect(plan.documentsToMarkStale.map((d) => d.id)).toEqual([1, 2]);
  });

  it("every stale document carries a kind, so the dialog never has to read the type string", () => {
    const plan = planRevert({
      ...base, reservation: returned(), vehicle: vehicle({ currentMileage: 5400 }),
      documents: [
        doc(1, "Damage Check"),
        doc(2, "damage_check_return"), // a slug spelling written by an upload path
      ],
    });
    expect(plan.documentsToMarkStale).toEqual([
      { id: 1, documentType: "Damage Check", kind: "damage_check" },
      { id: 2, documentType: "damage_check_return", kind: "damage_check" },
    ]);

    const pickup = planRevert({
      ...base, reservation: pickedUp(), vehicle: vehicle(),
      documents: [doc(3, "Contract (Unsigned)"), doc(4, "contract_unsigned")],
    });
    expect(pickup.documentsToMarkStale.map((d) => d.kind)).toEqual(["contract", "contract"]);
  });

  it("the legacy 'returned' status takes the same road", () => {
    const plan = planRevert({ ...base, reservation: reservation({ ...returned(), status: "returned" }), vehicle: vehicle({ currentMileage: 5400 }) });
    expect(plan.fromStatus).toBe("returned");
    expect(plan.toStatus).toBe("picked_up");
  });

  it("a replacement row's spare status goes back to picked_up", () => {
    const plan = planRevert({
      ...base, reservation: reservation({ ...returned(), type: "replacement", spareVehicleStatus: "returned" }),
      vehicle: vehicle({ currentMileage: 5400 }),
    });
    expect(plan.clears).toContain("spareVehicleStatus");
  });
});

describe("C-03 planRevert - completed by hand (no return data)", () => {
  it("never picked up: back to booked, completionDate cleared, nothing on the vehicle", () => {
    const plan = planRevert({
      ...base, reservation: reservation({ status: "completed", completionDate: "2026-10-09" }), vehicle: vehicle(),
    });
    expect(plan.toStatus).toBe("booked");
    expect(plan.clears).toEqual(["completionDate"]);
    expect(plan.vehicle.restoreTo).toBeNull();
    // Nothing was handed over, so there is nothing to explain.
    expect(plan.vehicle.reason).toBeUndefined();
    expect(plan.requiresMileageConfirmation).toBe(false);
    expect(plan.documentsToMarkStale).toEqual([]);
  });

  it("picked up earlier: back to picked_up with only completionDate cleared", () => {
    const plan = planRevert({
      ...base, reservation: reservation({ ...pickedUp(), status: "completed", completionDate: "2026-10-09" }), vehicle: vehicle(),
    });
    expect(plan.toStatus).toBe("picked_up");
    expect(plan.clears).toEqual(["completionDate"]);
    expect(plan.vehicle.restoreTo).toBeNull();
    expect(plan.vehicle.reason).toBeUndefined();
  });
});

describe("C-03 planRevert - cancelled", () => {
  it("to picked_up when the rental had been picked up; clears nothing, touches no vehicle or document", () => {
    const plan = planRevert({
      ...base, reservation: reservation({ ...pickedUp(), status: "cancelled" }), vehicle: vehicle(),
      documents: [doc(1, "Contract (Unsigned)")],
    });
    expect(plan.fromStatus).toBe("cancelled");
    expect(plan.toStatus).toBe("picked_up");
    expect(plan.clears).toEqual([]);
    expect(plan.vehicle.restoreTo).toBeNull();
    expect(plan.vehicle.reason).toBeUndefined();
    expect(plan.documentsToMarkStale).toEqual([]);
    expect(plan.requiresMileageConfirmation).toBe(false);
    expect(plan.warnings).toEqual(["cascade_not_reopened"]);
  });

  it("to booked when it had not", () => {
    const plan = planRevert({ ...base, reservation: reservation({ status: "cancelled" }), vehicle: vehicle() });
    expect(plan.toStatus).toBe("booked");
    expect(plan.blocked).toBeUndefined();
  });

  it("blocked with VEHICLE_NOT_FREE when another booking took the period", () => {
    const plan = planRevert({
      ...base, reservation: reservation({ status: "cancelled" }), vehicle: vehicle(),
      vehicleVerdict: { bookable: false, reason: "CONFLICT" },
    });
    expect(plan.toStatus).toBe("booked");
    expect(plan.blocked?.code).toBe("VEHICLE_NOT_FREE");
    expect(plan.blocked?.message).toContain("no longer free for this period");
  });

  it("says why when the refusal is not a clashing booking: not for rental, vehicle gone", () => {
    const notForRental = planRevert({
      ...base, reservation: reservation({ status: "cancelled" }), vehicle: vehicle(),
      vehicleVerdict: { bookable: false, reason: "NOT_FOR_RENTAL" },
    });
    expect(notForRental.blocked?.code).toBe("VEHICLE_NOT_FOR_RENTAL");
    expect(notForRental.blocked?.message).toContain("not for rental");
    expect(notForRental.blocked?.message).not.toContain("no longer free");

    const gone = planRevert({
      ...base, reservation: reservation({ status: "cancelled" }), vehicle: null,
      vehicleVerdict: { bookable: false, reason: "VEHICLE_NOT_FOUND" },
    });
    expect(gone.blocked?.code).toBe("VEHICLE_NOT_FOUND");
    expect(gone.blocked?.message).toContain("can no longer be found");
    expect(gone.blocked?.message).not.toContain("no longer free");
  });

  it("the three refusals are three different plans (the hash tells them apart)", () => {
    const hashes = (["CONFLICT", "NOT_FOR_RENTAL", "VEHICLE_NOT_FOUND"] as const).map((reason) =>
      planRevert({
        ...base, reservation: reservation({ status: "cancelled" }), vehicle: vehicle(),
        vehicleVerdict: { bookable: false, reason },
      }).planHash);
    expect(new Set(hashes).size).toBe(3);
  });

  it("the verdict is ignored for every other status", () => {
    const plan = planRevert({
      ...base, reservation: pickedUp(), vehicle: vehicle(), vehicleVerdict: { bookable: false, reason: "CONFLICT" },
    });
    expect(plan.blocked).toBeUndefined();
  });
});

describe("C-03 planRevert - the vehicle is only restored when this handover is its latest", () => {
  it("a later handover on the vehicle leaves it alone, reason later_handover", () => {
    const plan = planRevert({ ...base, reservation: pickedUp(), vehicle: vehicle(), laterHandoverExists: true });
    expect(plan.vehicle.restoreTo).toBeNull();
    expect(plan.vehicle.reason).toBe("later_handover");
    expect(plan.warnings).toContain("later_handover");
    expect(plan.requiresMileageConfirmation).toBe(false);
    // The reservation itself still goes back.
    expect(plan.toStatus).toBe("booked");
  });

  it("same for a return", () => {
    const plan = planRevert({ ...base, reservation: returned(), vehicle: vehicle({ currentMileage: 9000 }), laterHandoverExists: true });
    expect(plan.vehicle.restoreTo).toBeNull();
    expect(plan.vehicle.reason).toBe("later_handover");
  });

  it("null before-readings (rows from before the columns existed) leave it alone, reason no_reading_stored", () => {
    const plan = planRevert({
      ...base,
      reservation: reservation({ ...pickedUp(), vehicleMileageBeforePickup: null, vehicleFuelBeforePickup: null }),
      vehicle: vehicle(),
    });
    expect(plan.vehicle.restoreTo).toBeNull();
    expect(plan.vehicle.reason).toBe("no_reading_stored");
    expect(plan.warnings).toContain("no_reading_stored");
    expect(plan.requiresMileageConfirmation).toBe(false);
  });

  it("with only one of the two readings stored, that one is restored and the other left as it is", () => {
    const plan = planRevert({
      ...base,
      reservation: reservation({ ...pickedUp(), vehicleMileageBeforePickup: 5000, vehicleFuelBeforePickup: null }),
      vehicle: vehicle(),
    });
    expect(plan.vehicle.restoreTo).toEqual({ mileage: 5000, fuel: null });
    expect(plan.vehicle.reason).toBeUndefined();
  });

  it("a reading of 0 is a reading", () => {
    const plan = planRevert({
      ...base,
      reservation: reservation({ ...pickedUp(), vehicleMileageBeforePickup: 0, vehicleFuelBeforePickup: null }),
      vehicle: vehicle({ currentMileage: 5 }),
    });
    expect(plan.vehicle.restoreTo).toEqual({ mileage: 0, fuel: null });
    expect(plan.requiresMileageConfirmation).toBe(true);
  });

  it("a reservation without a vehicle has nothing to restore", () => {
    const plan = planRevert({ ...base, reservation: reservation({ ...pickedUp(), vehicleId: null }), vehicle: null });
    expect(plan.vehicle.current).toEqual({ mileage: null, fuel: null });
    expect(plan.vehicle.restoreTo).toBeNull();
    expect(plan.requiresMileageConfirmation).toBe(false);
  });
});

describe("C-03 planRevert - a row with nothing to undo", () => {
  it.each(["booked", "pending", "confirmed"])("%s is blocked with INVALID_STATUS_TRANSITION", (status) => {
    const plan = planRevert({ ...base, reservation: reservation({ status }), vehicle: vehicle() });
    expect(plan.fromStatus).toBe("booked");
    expect(plan.toStatus).toBeNull();
    expect(plan.blocked?.code).toBe("INVALID_STATUS_TRANSITION");
    expect(plan.clears).toEqual([]);
    expect(plan.vehicle.restoreTo).toBeNull();
  });

  it("an unknown status is blocked too and keeps the raw value", () => {
    const plan = planRevert({ ...base, reservation: reservation({ status: "garbage" }), vehicle: vehicle() });
    expect(plan.fromStatus).toBe("garbage");
    expect(plan.blocked?.code).toBe("INVALID_STATUS_TRANSITION");
  });
});

describe("C-03 planRevert - purity and the plan hash", () => {
  it("does not touch its input and gives the same plan twice", () => {
    const r = pickedUp();
    const v = vehicle();
    const documents = [doc(3, "Contract (Unsigned)")];
    const snapshot = JSON.stringify({ r, v, documents });
    const a = planRevert({ ...base, reservation: r, vehicle: v, documents });
    const b = planRevert({ ...base, reservation: r, vehicle: v, documents });
    expect(JSON.stringify({ r, v, documents })).toBe(snapshot);
    expect(a).toEqual(b);
    expect(a.planHash).toBe(b.planHash);
  });

  it("the hash covers the plan: another odometer, another document or another target changes it", () => {
    const a = planRevert({ ...base, reservation: pickedUp(), vehicle: vehicle({ currentMileage: 5100 }) });
    const otherOdometer = planRevert({ ...base, reservation: pickedUp(), vehicle: vehicle({ currentMileage: 5200 }) });
    const withDocument = planRevert({ ...base, reservation: pickedUp(), vehicle: vehicle(), documents: [doc(3, "Contract (Unsigned)")] });
    const otherTarget = planRevert({ ...base, reservation: returned(), vehicle: vehicle() });
    expect(new Set([a.planHash, otherOdometer.planHash, withDocument.planHash, otherTarget.planHash]).size).toBe(4);
  });

  it("revertPlanHash ignores the planHash field itself and the key order", () => {
    const plan = planRevert({ ...base, reservation: pickedUp(), vehicle: vehicle() });
    const { planHash, ...rest } = plan;
    expect(revertPlanHash(rest)).toBe(planHash);
    expect(revertPlanHash({ ...plan, planHash: "x" })).toBe(planHash);
    const shuffled = Object.fromEntries(Object.entries(rest).reverse()) as typeof rest;
    expect(revertPlanHash(shuffled)).toBe(planHash);
  });
});

/**
 * Two places say "this status change is a reversal": `stepFor` inside the engine
 * (what the route does) and `RESERVATION_REVERT_TARGETS` in lifecycle.ts (what
 * `PATCH /:id/status` refuses with USE_REVERT_ROUTE). They are written apart on
 * purpose, so this pins them together in both directions.
 */
describe("C-03 planRevert - agrees with the table PATCH /:id/status refuses", () => {
  const shapes: Array<[string, Reservation]> = [
    ["picked_up", pickedUp()],
    ["legacy active", reservation({ ...pickedUp(), status: "active" })],
    ["returned (legacy)", reservation({ ...returned(), status: "returned" })],
    ["completed through a return", returned()],
    ["completed by hand, picked up earlier", reservation({ ...pickedUp(), status: "completed", completionDate: "2026-10-09" })],
    ["completed by hand, never picked up", reservation({ status: "completed", completionDate: "2026-10-09" })],
    ["cancelled after a pickup", reservation({ ...pickedUp(), status: "cancelled" })],
    ["cancelled before any pickup", reservation({ status: "cancelled" })],
  ];

  it.each(shapes)("%s: the engine's target is a step /status treats as a reversal", (_label, row) => {
    const plan = planRevert({ ...base, reservation: row, vehicle: vehicle() });
    expect(plan.toStatus).not.toBeNull();
    // The raw status is what the /status route compares; the normalised one is what the plan reports.
    expect(isReservationRevert(row.status, plan.toStatus)).toBe(true);
    expect(isReservationRevert(plan.fromStatus, plan.toStatus)).toBe(true);
  });

  it("every step in the /status table is one the engine takes for some row", () => {
    const taken = new Set(
      shapes.map(([, row]) => {
        const plan = planRevert({ ...base, reservation: row, vehicle: vehicle() });
        return `${plan.fromStatus}>${plan.toStatus}`;
      }),
    );
    // A legacy 'returned' row reports itself as 'returned', a hand-made one as 'completed'.
    const listed = Object.entries(RESERVATION_REVERT_TARGETS).flatMap(([from, targets]) => targets.map((to) => `${from}>${to}`));
    expect(listed.length).toBeGreaterThan(0);
    for (const step of listed) expect(taken, `no fixture row takes ${step}`).toContain(step);
  });

  it.each(["booked", "pending", "confirmed", "garbage"])("a '%s' row: no target, and /status calls nothing a reversal", (status) => {
    const plan = planRevert({ ...base, reservation: reservation({ status }), vehicle: vehicle() });
    expect(plan.toStatus).toBeNull();
    for (const to of ["booked", "picked_up", "completed", "cancelled", "returned"]) {
      expect(isReservationRevert(status, to)).toBe(false);
    }
  });
});
