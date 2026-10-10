/** Audit A-3-5 — the dry-run planner of scripts/remap-vehicle-types.ts (pure; no database, no network). */
import { describe, it, expect } from "vitest";
import { isLocalDatabaseUrl, planRemap } from "./remap-vehicle-types";

const van = { voertuigsoort: "Personenauto", inrichting: "MPV", europese_voertuigcategorie: "M1", aantal_zitplaatsen: "9" };
const suv = { voertuigsoort: "Personenauto", inrichting: "MPV", europese_voertuigcategorie: "M1", aantal_zitplaatsen: "5" };
const v = (id: number, plate: string, type: string | null) => ({ id, licensePlate: plate, brand: "X", model: "Y", vehicleType: type });

describe("remap-vehicle-types dry run", () => {
  it("lists only the vehicles whose type would change and skips unknown plates", () => {
    const changes = planRemap([
      { vehicle: v(1, "11-RH-DF", "SUV"), rdw: van },
      { vehicle: v(2, "GG-T4-9B", "SUV"), rdw: suv },
      { vehicle: v(3, "ZZ-ZZ-99", "SUV"), rdw: null },
      { vehicle: v(4, "AA-BB-12", "Van"), rdw: van },
    ]);
    expect(changes.map((c) => [c.id, c.newType])).toEqual([[1, "Van"]]);
  });

  it("only a localhost database passes the guard", () => {
    expect(isLocalDatabaseUrl("postgresql://postgres:postgres@localhost:5432/lvstest")).toBe(true);
    expect(isLocalDatabaseUrl("postgresql://u:p@127.0.0.1:5432/x")).toBe(true);
    expect(isLocalDatabaseUrl("postgresql://u:p@db.example.com:5432/x")).toBe(false);
  });
});
