/**
 * A resolved, validated set of parameter values for one rule version.
 *
 * The calculation module reads through the typed getters and nothing else;
 * a key that is not defined, not present or of the wrong type is a
 * configuration error, never a silent default. `snapshot()` is what an
 * assessment stores, so a result can always show the exact values it used.
 */
import type { LegalStatus, ParameterDataType, ParameterUnit } from "../../../shared/fiscal-types";
import type { FiscalParameterDefinition } from "./definitions";
import { isValidIsoDate } from "./calendar";

export interface ParameterSource {
  sourceUrl?: string | null;
  sourceReference?: string | null;
}

export interface ParameterSnapshotEntry extends ParameterSource {
  key: string;
  dataType: ParameterDataType;
  value: number | boolean | string | string[] | null;
  unit: ParameterUnit;
  legalStatus: LegalStatus;
}

export interface ParameterValidationIssue {
  key: string;
  message: string;
}

export class FiscalConfigurationError extends Error {
  readonly issues: ParameterValidationIssue[];
  constructor(issues: ParameterValidationIssue[]) {
    super(`Fiscale configuratie ongeldig: ${issues.map((i) => `${i.key}: ${i.message}`).join("; ")}`);
    this.name = "FiscalConfigurationError";
    this.issues = issues;
  }
}

type Coerced = { ok: true; value: number | boolean | string | string[] | null } | { ok: false; message: string };

function coerce(def: FiscalParameterDefinition, raw: unknown): Coerced {
  if (raw === undefined || raw === null || raw === "") {
    return def.required ? { ok: false, message: "verplichte waarde ontbreekt" } : { ok: true, value: null };
  }
  switch (def.dataType) {
    case "decimal":
    case "integer": {
      const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
      if (!Number.isFinite(n)) return { ok: false, message: "geen getal" };
      if (def.dataType === "integer" && !Number.isInteger(n)) return { ok: false, message: "moet een geheel getal zijn" };
      if (def.decimals !== undefined && Math.round(n * 10 ** def.decimals) !== n * 10 ** def.decimals) {
        return { ok: false, message: `maximaal ${def.decimals} decimalen` };
      }
      if (def.min !== undefined && n < def.min) return { ok: false, message: `kleiner dan minimum ${def.min}` };
      if (def.max !== undefined && n > def.max) return { ok: false, message: `groter dan maximum ${def.max}` };
      return { ok: true, value: n };
    }
    case "boolean": {
      if (typeof raw === "boolean") return { ok: true, value: raw };
      if (raw === "true") return { ok: true, value: true };
      if (raw === "false") return { ok: true, value: false };
      return { ok: false, message: "moet ja of nee zijn" };
    }
    case "date": {
      if (!isValidIsoDate(raw)) return { ok: false, message: "geen geldige datum (jjjj-mm-dd)" };
      return { ok: true, value: raw };
    }
    case "choice": {
      if (typeof raw !== "string" || !def.allowedValues?.includes(raw)) {
        return { ok: false, message: `moet een van ${def.allowedValues?.join(", ")} zijn` };
      }
      return { ok: true, value: raw };
    }
    case "list": {
      const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",").map((s) => s.trim()).filter(Boolean) : null;
      if (!list || list.some((v) => typeof v !== "string")) return { ok: false, message: "moet een lijst zijn" };
      const bad = list.filter((v) => !def.allowedValues?.includes(v));
      if (bad.length) return { ok: false, message: `onbekende waarde(n): ${bad.join(", ")}` };
      if (def.required && list.length === 0) return { ok: false, message: "lijst mag niet leeg zijn" };
      return { ok: true, value: [...new Set(list as string[])] };
    }
  }
}

export class ParameterSet {
  private constructor(private readonly entries: Map<string, ParameterSnapshotEntry>) {}

  /** Validates without throwing; the configuration screens use this to show every problem at once. */
  static validate(
    definitions: readonly FiscalParameterDefinition[],
    values: Record<string, unknown>,
  ): { ok: boolean; issues: ParameterValidationIssue[] } {
    const issues: ParameterValidationIssue[] = [];
    const known = new Set(definitions.map((d) => d.key));
    for (const key of Object.keys(values)) {
      if (!known.has(key)) issues.push({ key, message: "onbekende parameter" });
    }
    for (const def of definitions) {
      const c = coerce(def, values[def.key]);
      if (!c.ok) issues.push({ key: def.key, message: c.message });
    }
    return { ok: issues.length === 0, issues };
  }

  static fromValues(
    definitions: readonly FiscalParameterDefinition[],
    values: Record<string, unknown>,
    sources: Record<string, ParameterSource> = {},
  ): ParameterSet {
    const { ok, issues } = ParameterSet.validate(definitions, values);
    if (!ok) throw new FiscalConfigurationError(issues);
    const entries = new Map<string, ParameterSnapshotEntry>();
    for (const def of definitions) {
      const c = coerce(def, values[def.key]);
      if (!c.ok) throw new FiscalConfigurationError([{ key: def.key, message: c.message }]);
      entries.set(def.key, {
        key: def.key,
        dataType: def.dataType,
        value: c.value,
        unit: def.unit,
        legalStatus: def.legalStatus,
        sourceUrl: sources[def.key]?.sourceUrl ?? null,
        sourceReference: sources[def.key]?.sourceReference ?? null,
      });
    }
    return new ParameterSet(entries);
  }

  private entry(key: string, dataType: ParameterDataType): ParameterSnapshotEntry {
    const e = this.entries.get(key);
    if (!e) throw new FiscalConfigurationError([{ key, message: "parameter niet aanwezig in deze regelversie" }]);
    if (e.dataType !== dataType) throw new FiscalConfigurationError([{ key, message: `is ${e.dataType}, gelezen als ${dataType}` }]);
    return e;
  }

  private requireValue<T>(key: string, dataType: ParameterDataType): T {
    const e = this.entry(key, dataType);
    if (e.value === null) throw new FiscalConfigurationError([{ key, message: "geen waarde" }]);
    return e.value as T;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  decimal(key: string): number {
    return this.requireValue<number>(key, "decimal");
  }

  integer(key: string): number {
    return this.requireValue<number>(key, "integer");
  }

  boolean(key: string): boolean {
    return this.requireValue<boolean>(key, "boolean");
  }

  /** Dates may be optional (an exception without an end date); `null` is a valid answer. */
  date(key: string): string | null {
    return this.entry(key, "date").value as string | null;
  }

  choice(key: string): string {
    return this.requireValue<string>(key, "choice");
  }

  list(key: string): string[] {
    return this.requireValue<string[]>(key, "list");
  }

  snapshot(): ParameterSnapshotEntry[] {
    return [...this.entries.values()].map((e) => ({ ...e, value: Array.isArray(e.value) ? [...e.value] : e.value }));
  }
}
