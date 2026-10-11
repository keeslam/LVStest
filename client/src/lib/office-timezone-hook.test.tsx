/**
 * D11 - a component that uses useOfficeTimeZone() renders again when the zone is loaded or
 * changed, so a screen that was drawn before the answer arrived is not stuck on Amsterdam.
 */
import { describe, it, expect, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { officeDate } from "./office-date";
import { setOfficeTimeZone, useOfficeTimeZone } from "./office-timezone";

function Probe() {
  const zone = useOfficeTimeZone();
  // Reads the store the way the screens do (officeDate() at render time).
  return <p data-testid="probe">{zone} {officeDate(new Date("2026-06-21T23:30:00Z"))}</p>;
}

afterEach(() => setOfficeTimeZone("Europe/Amsterdam"));

describe("useOfficeTimeZone", () => {
  it("rendert opnieuw als de zone verandert", () => {
    render(<Probe />);
    expect(screen.getByTestId("probe")).toHaveTextContent("Europe/Amsterdam 2026-06-22");
    act(() => setOfficeTimeZone("America/Curacao"));
    expect(screen.getByTestId("probe")).toHaveTextContent("America/Curacao 2026-06-21");
  });
});
