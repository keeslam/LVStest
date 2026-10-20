import { describe, it, expect } from "vitest";
import { zoneExpiringRows, zoneRentalWarnings } from "./zone-expiry";

describe("zoneRentalWarnings", () => {
  const car = { euroZoneEndDate: "2026-11-10", moveIziExpirationDate: "2026-10-01" };

  it("says expired before the start and ending during the rental", () => {
    expect(zoneRentalWarnings(car, "2026-11-01", "2026-11-20")).toEqual([
      { kind: "euroZone", date: "2026-11-10", state: "during" },
      { kind: "moveIzi", date: "2026-10-01", state: "expired" },
    ]);
  });

  it("is quiet when both dates lie after the rental, or are empty", () => {
    expect(zoneRentalWarnings(car, "2026-09-01", "2026-09-10")).toEqual([]);
    expect(zoneRentalWarnings({ euroZoneEndDate: "", moveIziExpirationDate: null }, "2026-11-01", "2026-11-20")).toEqual([]);
  });

  it("without an end date only counts an end before the start", () => {
    expect(zoneRentalWarnings(car, "2026-11-01", null)).toEqual([{ kind: "moveIzi", date: "2026-10-01", state: "expired" }]);
  });
});

describe("zoneExpiringRows", () => {
  it("gives one row per date inside the window, soonest first", () => {
    const rows = zoneExpiringRows(
      [
        { id: 1, licensePlate: "AA11BB", euroZoneEndDate: "2026-11-05", moveIziExpirationDate: "2027-05-01" },
        { id: 2, licensePlate: "CC22DD", euroZoneEndDate: null, moveIziExpirationDate: "2026-10-25" },
      ],
      "2026-08-20",
      "2026-11-19",
    );
    expect(rows.map((r) => [r.id, r.kind, r.date])).toEqual([[2, "moveIzi", "2026-10-25"], [1, "euroZone", "2026-11-05"]]);
  });
});
