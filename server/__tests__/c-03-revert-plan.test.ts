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
import { planRevert, revertPlanHash } from "../services/reservation-revert";

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

const base = { laterHandoverExists: false, documents: [] as Document[], vehicleFreeForPeriod: true };

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
    expect(plan.documentsToMarkStale).toEqual([{ id: 3, documentType: "Contract (Unsigned)" }]);
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

  it("blocked with VEHICLE_NOT_FREE when the vehicle is no longer free for the period", () => {
    const plan = planRevert({ ...base, reservation: reservation({ status: "cancelled" }), vehicle: vehicle(), vehicleFreeForPeriod: false });
    expect(plan.toStatus).toBe("booked");
    expect(plan.blocked?.code).toBe("VEHICLE_NOT_FREE");
    expect(typeof plan.blocked?.message).toBe("string");
  });

  it("the free-for-period fact is ignored for every other status", () => {
    const plan = planRevert({ ...base, reservation: pickedUp(), vehicle: vehicle(), vehicleFreeForPeriod: false });
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
