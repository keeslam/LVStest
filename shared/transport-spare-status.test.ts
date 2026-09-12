/**
 * OPT-008 — the replacement vehicle's status follows what it physically is.
 */
import { describe, it, expect } from "vitest";
import {
  getTransportSpareStatus,
  reservationStatusForSpareStatus,
} from "./transport-spare-status";

describe("OPT-008 — de vervanger krijgt de status die hij fysiek heeft", () => {
  it("a spare that has been picked up makes the reservation picked_up", () => {
    // This is the double-booking path: the car is with the customer, and the
    // reservation used to stay on `pending`, so the vehicle read `available`.
    expect(reservationStatusForSpareStatus("picked_up")).toBe("picked_up");
  });

  it("an assigned or prepared spare is still on the yard", () => {
    expect(reservationStatusForSpareStatus("assigned")).toBe("booked");
    expect(reservationStatusForSpareStatus("ready")).toBe("booked");
  });

  it("a returned spare closes the rental, as besluiten B-02 does everywhere else", () => {
    expect(reservationStatusForSpareStatus("returned")).toBe("completed");
  });

  it("the derived transport display state is unchanged", () => {
    expect(getTransportSpareStatus({ spareRequired: false, relatedVehicleId: null })).toBe("not_required");
    expect(getTransportSpareStatus({ spareRequired: true, relatedVehicleId: null })).toBe("tbd");
    expect(getTransportSpareStatus({ spareRequired: true, relatedVehicleId: 5, spareReservation: null })).toBe("assigned");
    expect(getTransportSpareStatus({ spareRequired: true, relatedVehicleId: 5, spareReservation: { status: "picked_up" } })).toBe("picked_up");
    expect(getTransportSpareStatus({ spareRequired: true, relatedVehicleId: 5, spareReservation: { status: "completed" } })).toBe("returned");
  });
});
