/**
 * Which rule version applies on a date, and with which parameters.
 *
 * The answer comes from the effective window alone: a published (or, for a
 * date in the past, since superseded) version whose `effective_from` and
 * `effective_until` enclose the date. Never "the newest", never the
 * publication date. No version is `RULE_NOT_AVAILABLE`; two versions or a
 * version with broken values is `CONFIGURATION_INVALID`.
 *
 * Results are cached for a minute per rule and date, like portal-config.ts;
 * publishing or archiving clears the cache.
 */
import { and, eq, inArray, isNull, lte, or, gte } from "drizzle-orm";
import { db } from "../../db";
import { fiscalParameterValues, fiscalRuleVersions, type FiscalRuleVersion } from "../../../shared/schema";
import type { FiscalRuleKey } from "../../../shared/fiscal-types";
import { definitionsForRule } from "./definitions";
import { FiscalConfigurationError, ParameterSet, type ParameterValidationIssue } from "./parameters";
import { valuesFromRows } from "./rule-versions";

export type Resolution =
  | { status: "ok"; version: FiscalRuleVersion; params: ParameterSet }
  | { status: "RULE_NOT_AVAILABLE" }
  | { status: "CONFIGURATION_INVALID"; issues: ParameterValidationIssue[]; version?: FiscalRuleVersion };

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: Resolution }>();

export function clearFiscalResolveCache(): void {
  cache.clear();
}

export async function resolveRuleVersion(ruleKey: FiscalRuleKey, date: string): Promise<FiscalRuleVersion[]> {
  return db
    .select()
    .from(fiscalRuleVersions)
    .where(
      and(
        eq(fiscalRuleVersions.ruleKey, ruleKey),
        inArray(fiscalRuleVersions.status, ["published", "superseded"]),
        lte(fiscalRuleVersions.effectiveFrom, date),
        or(isNull(fiscalRuleVersions.effectiveUntil), gte(fiscalRuleVersions.effectiveUntil, date)),
      ),
    );
}

export async function resolveParameters(version: FiscalRuleVersion): Promise<ParameterSet> {
  const rows = await db.select().from(fiscalParameterValues).where(eq(fiscalParameterValues.ruleVersionId, version.id));
  const { values, sources } = valuesFromRows(version.ruleKey as FiscalRuleKey, rows);
  return ParameterSet.fromValues(definitionsForRule(version.ruleKey as FiscalRuleKey), values, sources);
}

export async function resolveForDate(ruleKey: FiscalRuleKey, date: string): Promise<Resolution> {
  const key = `${ruleKey}|${date}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  let value: Resolution;
  const versions = await resolveRuleVersion(ruleKey, date);
  if (versions.length === 0) {
    value = { status: "RULE_NOT_AVAILABLE" };
  } else if (versions.length > 1) {
    value = {
      status: "CONFIGURATION_INVALID",
      issues: [{ key: "effective_from", message: `meer dan één versie geldt op ${date}: ${versions.map((v) => v.versionNumber).join(", ")}` }],
    };
  } else {
    const version = versions[0];
    try {
      value = { status: "ok", version, params: await resolveParameters(version) };
    } catch (error) {
      if (error instanceof FiscalConfigurationError) value = { status: "CONFIGURATION_INVALID", issues: error.issues, version };
      else throw error;
    }
  }
  cache.set(key, { at: Date.now(), value });
  return value;
}
