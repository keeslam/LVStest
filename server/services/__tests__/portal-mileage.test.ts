import { describe, expect, it } from "vitest";
import { decideMileageTakeOver } from "../portal-mileage";

describe("decideMileageTakeOver", () => {
  it("takes a higher reading over", () => {
    expect(decideMileageTakeOver(10000, 12000)).toEqual({ ok: true, previous: 10000, mileage: 12000 });
  });
  it("takes a reading over when the car has none yet", () => {
    expect(decideMileageTakeOver(null, 500)).toEqual({ ok: true, previous: null, mileage: 500 });
  });
  it("refuses a lower or equal reading", () => {
    expect(decideMileageTakeOver(12000, 11000)).toEqual({ ok: false, reason: "not_higher", current: 12000, reported: 11000 });
    expect(decideMileageTakeOver(12000, 12000)).toMatchObject({ ok: false });
  });
});
