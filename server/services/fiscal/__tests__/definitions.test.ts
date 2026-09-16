/**
 * Parameter definitions are the contract between the calculation module and
 * the configuration screens. Every definition must be complete, and the
 * calculation module may read exactly the keys that are defined for it — no
 * hidden constants, no dead parameters.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  FISCAL_PARAMETER_DEFINITIONS,
  FISCAL_RULES,
  definitionFor,
  definitionsForRule,
} from "../definitions";
import { FISCAL_RULE_KEYS, PARAMETER_DATA_TYPES, PARAMETER_UNITS, LEGAL_STATUSES } from "../../../../shared/fiscal-types";

describe("fiscal parameter definitions", () => {
  it("registers exactly the rule keys the shared vocabulary knows", () => {
    expect(FISCAL_RULES.map((r) => r.key).sort()).toEqual([...FISCAL_RULE_KEYS].sort());
    for (const rule of FISCAL_RULES) {
      expect(rule.displayName.length).toBeGreaterThan(3);
      expect(rule.description.length).toBeGreaterThan(20);
    }
  });

  it("defines the twenty-seven parameters of the first rule, each complete", () => {
    const defs = definitionsForRule("pseudo_eindheffing_fossiel");
    expect(defs).toHaveLength(27);
    const keys = new Set<string>();
    for (const d of defs) {
      expect(keys.has(d.key), `duplicate ${d.key}`).toBe(false);
      keys.add(d.key);
      expect(d.key).toMatch(/^[A-Z][A-Z0-9_]+$/);
      expect(d.displayName.length, d.key).toBeGreaterThan(3);
      expect(d.description.length, d.key).toBeGreaterThan(20);
      expect(PARAMETER_DATA_TYPES).toContain(d.dataType);
      expect(PARAMETER_UNITS).toContain(d.unit);
      expect(LEGAL_STATUSES).toContain(d.legalStatus);
      expect(["rule", "assess", "notifications"]).toContain(d.usedBy);
      if (d.dataType === "choice" || d.dataType === "list") {
        expect(d.allowedValues?.length, d.key).toBeGreaterThan(0);
      }
      if (d.dataType === "decimal" || d.dataType === "integer") {
        expect(typeof d.min, d.key).toBe("number");
        expect(typeof d.max, d.key).toBe("number");
      }
    }
  });

  it("states the unit of every percentage and day count explicitly", () => {
    expect(definitionFor("PSEUDO_ENDHEFFING_RATE").unit).toBe("percent_per_year");
    expect(definitionFor("REPLACEMENT_VEHICLE_EXEMPTION_DAYS").unit).toBe("calendar_days");
    expect(definitionFor("TEMPORARY_RENTAL_EXEMPTION_DAYS").unit).toBe("calendar_days");
    expect(definitionFor("OLDTIMER_AGE_YEARS").unit).toBe("years");
  });

  it("marks the statutory parameters as legal and the housekeeping ones as internal", () => {
    expect(definitionFor("PSEUDO_ENDHEFFING_RATE").legalStatus).toBe("legal");
    expect(definitionFor("TRANSITION_EXEMPT_UNTIL").legalStatus).toBe("legal");
    expect(definitionFor("ROUNDING_MODE").legalStatus).toBe("internal");
    expect(definitionFor("ASSESSMENT_LOOKAHEAD_DAYS").legalStatus).toBe("internal");
  });

  it("throws for an unknown key instead of returning something", () => {
    expect(() => definitionFor("NOT_A_PARAMETER")).toThrow(/NOT_A_PARAMETER/);
  });

  it("the calculation module reads exactly the keys defined for it", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "rules", "pseudo-eindheffing.ts"), "utf8");
    const read = new Set<string>();
    for (const m of source.matchAll(/params\.(?:decimal|integer|boolean|date|choice|list)\("([A-Z][A-Z0-9_]+)"\)/g)) read.add(m[1]);
    const defined = new Set(
      FISCAL_PARAMETER_DEFINITIONS.filter((d) => d.ruleKey === "pseudo_eindheffing_fossiel" && d.usedBy === "rule").map((d) => d.key),
    );
    expect([...read].sort()).toEqual([...defined].sort());
    // Nothing else in the module looks like a hidden fiscal constant.
    expect(source).not.toMatch(/\b0\.12\b|\b12\s*\/\s*100|<=\s*7\b|<=\s*14\b|\b25\b/);
  });
});
