/**
 * Punt 7 (Kees, 2026-10-20) — a vehicle out of the fleet is left out of the
 * vehicle picker, unless it is the one already chosen or the caller asks for it
 * (document upload: a sale contract belongs to a sold car).
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VehicleSelector } from "@/components/ui/vehicle-selector";

const inFleet = { id: 1, licensePlate: "AB123C", brand: "Volkswagen", model: "Polo", vehicleType: "Hatchback" };
const sold = { id: 2, licensePlate: "XY999Z", brand: "Fiat", model: "Ducato", vehicleType: "Van", outOfFleetDate: "2026-10-01" };

describe("VehicleSelector and vehicles out of the fleet", () => {
  it("leaves the sold vehicle out", async () => {
    const user = userEvent.setup();
    render(<VehicleSelector vehicles={[inFleet, sold] as any} value="" onChange={() => {}} />);
    await user.click(screen.getByRole("button"));
    expect(await screen.findByText("Volkswagen Polo")).toBeInTheDocument();
    expect(screen.queryByText("Fiat Ducato")).toBeNull();
  });

  it("keeps it when it is already chosen", async () => {
    const user = userEvent.setup();
    render(<VehicleSelector vehicles={[inFleet, sold] as any} value="2" onChange={() => {}} />);
    await user.click(screen.getByRole("button"));
    expect((await screen.findAllByText(/Fiat Ducato/)).length).toBeGreaterThan(0);
  });

  it("shows it when the caller asks", async () => {
    const user = userEvent.setup();
    render(<VehicleSelector vehicles={[inFleet, sold] as any} value="" onChange={() => {}} includeOutOfFleet />);
    await user.click(screen.getByRole("button"));
    expect(await screen.findByText("Fiat Ducato")).toBeInTheDocument();
  });
});
