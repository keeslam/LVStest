import { formatParameterValue } from "@shared/fiscal-format";
import type { FiscalParameterDefinition } from "./types";

/** The parameter's name as the configuration shows it; an unknown key stays readable as the key. */
export function parameterLabel(definitions: FiscalParameterDefinition[], key: string | null): string {
  if (!key) return "";
  return definitions.find((d) => d.key === key)?.displayName ?? key;
}

/**
 * An old/new value from the audit trail in words. The trail stores text (a list as "a,b"),
 * so it is turned back into the parameter's type first; without a definition the text is shown as stored.
 */
export function auditValueLabel(definitions: FiscalParameterDefinition[], parameterKey: string | null, value: string | null): string {
  if (value === null) return "—";
  const def = parameterKey ? definitions.find((d) => d.key === parameterKey) : undefined;
  if (!def) return value;
  return formatParameterValue(def.dataType, def.unit, def.dataType === "list" ? value.split(",").filter(Boolean) : value);
}
