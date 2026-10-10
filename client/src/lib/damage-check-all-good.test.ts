/**
 * Audit remediation P11 / A-11-7 (docs/audit/fysieke-e2e-audit-2026-10-09.md, module 11): a damage
 * check has about fifty choices; a counter should be able to say "this block is fine" in one click.
 * "Alles goed" fills only what is still empty - it never overwrites an answer somebody gave (a
 * "kapot" stays "kapot") - and only with the normal value of that field.
 */
import { describe, it, expect } from "vitest";
import { DEFAULT_DAMAGE_CHECK_FIELDS, type ChecklistGroupDef } from "@shared/schema";
import { okValueForField, applyAllGood, countFilled } from "./damage-check-all-good";

const group = (id: "interior" | "exterior" | "delivery") => DEFAULT_DAMAGE_CHECK_FIELDS.groups.find((g) => g.id === id) as ChecklistGroupDef;

describe("okValueForField", () => {
  it("knows the normal value of the default fields, and it is always one of the field's own options", () => {
    for (const g of DEFAULT_DAMAGE_CHECK_FIELDS.groups) {
      for (const field of g.fields) {
        if (field.inputType !== "select") continue;
        const ok = okValueForField(field);
        expect(ok, `${g.id}.${field.key}`).not.toBeNull();
        for (const part of ok!.split(",")) expect(field.options, `${field.key} offers ${part}`).toContain(part);
      }
    }
  });

  it("reads the right way round for the yes/no fields (window damage: nee; jack: ja)", () => {
    const interior = group("interior").fields;
    expect(okValueForField(interior.find((f) => f.key === "windowDamage")!)).toBe("nee");
    expect(okValueForField(interior.find((f) => f.key === "jack")!)).toBe("ja");
    expect(okValueForField(interior.find((f) => f.key === "carInterior")!)).toBe("schoon");
  });

  it("returns null for a field it does not know, or whose options no longer contain the normal value", () => {
    expect(okValueForField({ key: "customThing", label: "x", inputType: "select", options: ["a", "b"] })).toBeNull();
    expect(okValueForField({ key: "jack", label: "Krik", inputType: "select", options: ["aanwezig", "mist"] })).toBeNull();
  });
});

describe("applyAllGood", () => {
  it("fills every empty select with its normal value and ticks every empty checkbox", () => {
    const interior = applyAllGood(group("interior"), {});
    expect(interior.carInterior).toBe("schoon");
    expect(interior.windowDamage).toBe("nee");
    const delivery = applyAllGood(group("delivery"), {});
    for (const field of group("delivery").fields) expect(delivery[field.key]).toBe(true);
  });

  it("leaves an answer that was already given alone", () => {
    const result = applyAllGood(group("interior"), { carInterior: "vuil", upholstery: "kapot" });
    expect(result.carInterior).toBe("vuil");
    expect(result.upholstery).toBe("kapot");
    expect(result.ashtray).toBe("schoon");
  });

  it("does not touch a field it has no normal value for", () => {
    const custom: ChecklistGroupDef = { id: "interior", label: "x", fields: [{ key: "customThing", label: "x", inputType: "select", options: ["a", "b"] }] };
    expect(applyAllGood(custom, {})).toEqual({});
  });
});

describe("countFilled", () => {
  it("counts answered fields, so a block can say how far along it is", () => {
    expect(countFilled(group("interior"), {})).toEqual({ filled: 0, total: group("interior").fields.length });
    expect(countFilled(group("interior"), { carInterior: "schoon", jack: "" })).toEqual({ filled: 1, total: group("interior").fields.length });
    expect(countFilled(group("delivery"), { oilWater: true, lighting: false })).toEqual({ filled: 1, total: group("delivery").fields.length });
  });
});
