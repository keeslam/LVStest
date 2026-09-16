/**
 * Fixtures for the fiscal mobility check. Everything a test creates carries
 * the `FIXT-` marker (version titles, audit usernames), and vehicles,
 * customers and reservations come from the ordinary fixtures, so
 * `cleanupFixtures()` cascades into profiles, usage periods, assessments and
 * review cases.
 */
import { db } from "../../db";
import { fiscalRuleVersions, fiscalAuditEvents } from "../../../shared/schema";
import { like } from "drizzle-orm";
import { FIXTURE_PREFIX } from "./fixtures";
import type { Actor } from "../../services/fiscal/audit";

export const FIXTURE_ACTOR: Actor = { userId: null, username: `${FIXTURE_PREFIX}fiscaal`, role: "admin", permissionUsed: "admin" };

/** The values of docs/fiscaal/01-wettelijk-kader.md as a test set; not a claim about the law. */
export const FIXTURE_PARAMETER_VALUES: Record<string, unknown> = {
  PSEUDO_ENDHEFFING_RATE: 12,
  CALCULATION_PERIOD_UNIT: "calendar_month",
  PARTIAL_PERIOD_RULE: "full_period",
  BASE_VALUE_KIND: "catalog_price_incl_vat_bpm",
  OLDTIMER_AGE_YEARS: 25,
  OLDTIMER_BASE_VALUE_KIND: "market_value",
  AGE_REFERENCE_MOMENT: "start_of_month",
  VEHICLE_CATEGORIES_IN_SCOPE: ["M1"],
  ZERO_EMISSION_EXEMPT: true,
  ZERO_EMISSION_DEFINITION: "fuel_electric_or_hydrogen_only",
  COMMUTING_COUNTS_AS_PRIVATE: true,
  KM_THRESHOLD_APPLIES: false,
  TRANSITION_PROVIDED_BEFORE_DATE: "2027-01-01",
  TRANSITION_EXEMPT_UNTIL: "2030-09-17",
  REPLACEMENT_VEHICLE_EXEMPTION_DAYS: 14,
  REPLACEMENT_VEHICLE_EXEMPTION_REASONS: ["maintenance", "repair", "accident", "tyre_change"],
  REPLACEMENT_VEHICLE_EXEMPTION_UNTIL: null,
  TEMPORARY_RENTAL_EXEMPTION_DAYS: 7,
  TEMPORARY_RENTAL_EXEMPTION_PERIODS_PER_YEAR: 1,
  TEMPORARY_RENTAL_EXEMPTION_SCOPE: "plate_per_employer",
  TEMPORARY_RENTAL_EXEMPTION_UNTIL: "2031-01-01",
  DRIVING_SCHOOL_MANUAL_EXEMPT: true,
  ROUNDING_MODE: "half_up_cents",
  CURRENCY: "EUR",
  ASSESSMENT_LOOKAHEAD_DAYS: 31,
  WARN_DAYS_BEFORE_REPLACEMENT_LIMIT: 3,
  WARN_ON_MONTH_BOUNDARY: true,
};

export async function cleanupFiscalFixtures(): Promise<void> {
  await db.delete(fiscalRuleVersions).where(like(fiscalRuleVersions.title, `${FIXTURE_PREFIX}%`));
  await db.delete(fiscalAuditEvents).where(like(fiscalAuditEvents.username, `${FIXTURE_PREFIX}%`));
}
