import { describe, expect, it } from "vitest";
import { diagramMakes, filterDiagramTemplates } from "../diagram-template-filter";

const list = [
  { id: 1, make: "Mitsubishi", model: "Spacestar", yearFrom: 2014, yearTo: 2020 },
  { id: 2, make: "Volkswagen", model: "Transporter", description: "T6 lange wielbasis", yearFrom: 2016, yearTo: null },
  { id: 3, make: "volkswagen", model: "Caddy", yearFrom: null, yearTo: null },
];
const ids = (r: { id: number }[]) => r.map((t) => t.id);

describe("diagram template filter", () => {
  it("searches make, model, description and 'make model'", () => {
    expect(ids(filterDiagramTemplates(list, { q: "space" }))).toEqual([1]);
    expect(ids(filterDiagramTemplates(list, { q: "wielbasis" }))).toEqual([2]);
    expect(ids(filterDiagramTemplates(list, { q: "volkswagen cad" }))).toEqual([3]);
  });
  it("filters on make without case and on a build year", () => {
    expect(ids(filterDiagramTemplates(list, { make: "Volkswagen" }))).toEqual([2, 3]);
    expect(ids(filterDiagramTemplates(list, { year: 2015 }))).toEqual([1, 3]);
    expect(ids(filterDiagramTemplates(list, { year: 2022 }))).toEqual([2, 3]);
  });
  it("lists each make once", () => {
    expect(diagramMakes(list)).toEqual(["Mitsubishi", "Volkswagen"]);
  });
});
