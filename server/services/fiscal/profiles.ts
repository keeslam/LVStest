/**
 * The vehicle fiscal profile: the facts the pseudo-eindheffing needs about a
 * vehicle, each with its provenance. The vehicles table itself stays as it is.
 *
 * Sources, in order of arrival: the vehicle record (first admission from
 * `production_date`, a fuel class from the English fuel word), RDW (step 5 of
 * the plan: catalogusprijs, category, CO₂), and a person with a reason. A
 * manual value is never overwritten by a later derivation, and every manual
 * change is audited with its old and new value.
 */
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { vehicleFiscalProfiles, vehicles, type VehicleFiscalProfile } from "../../../shared/schema";
import { FUEL_CATEGORIES, type FuelCategory } from "../../../shared/fiscal-types";
import { EUROPEAN_CATEGORIES } from "./definitions";
import { isValidIsoDate } from "./calendar";
import { FiscalNotFoundError, FiscalValidationError } from "./errors";
import { auditValueText, recordFiscalEvent, type Actor } from "./audit";

/** vehicles.fuel holds the English words rdw-api.ts writes (or whatever staff typed); the engine needs a class. */
export function fuelCategoryFromRecord(fuel: string | null | undefined): FuelCategory {
  const f = (fuel ?? "").trim().toLowerCase();
  if (!f) return "unknown";
  if (["electric", "elektrisch", "elektriciteit", "hydrogen", "waterstof", "ev", "bev"].includes(f)) return "zero_emission";
  if (f.includes("hybrid") || f.includes("hybride") || f.includes("phev")) return "hybrid";
  if (["gasoline", "petrol", "benzine", "diesel", "lpg", "cng", "lng", "alcohol", "ethanol", "e85"].includes(f)) return "fossil";
  return "unknown";
}

export async function getProfile(vehicleId: number): Promise<VehicleFiscalProfile | null> {
  const [row] = await db.select().from(vehicleFiscalProfiles).where(eq(vehicleFiscalProfiles.vehicleId, vehicleId));
  return row ?? null;
}

/**
 * Returns the profile, creating it from the vehicle record when it does not
 * exist yet, and filling in facts that are still unknown. Never touches a
 * field that is known or was set by hand.
 */
export async function ensureProfile(vehicleId: number): Promise<VehicleFiscalProfile> {
  const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, vehicleId));
  if (!vehicle) throw new FiscalNotFoundError("Voertuig niet gevonden");
  const firstAdmission = isValidIsoDate(vehicle.productionDate) ? vehicle.productionDate : null;
  const fuelCategory = fuelCategoryFromRecord(vehicle.fuel);

  const existing = await getProfile(vehicleId);
  if (!existing) {
    const [created] = await db
      .insert(vehicleFiscalProfiles)
      .values({
        vehicleId,
        firstAdmissionDate: firstAdmission,
        firstAdmissionSource: firstAdmission ? "vehicle_record" : "unknown",
        fuelCategory,
      })
      .onConflictDoNothing()
      .returning();
    if (created) return created;
    // Lost a race with a concurrent insert: read what won.
    return (await getProfile(vehicleId))!;
  }

  const overrides = existing.manualOverride ?? {};
  const patch: Partial<typeof vehicleFiscalProfiles.$inferInsert> = {};
  if (existing.firstAdmissionDate === null && !overrides.firstAdmissionDate && firstAdmission) {
    patch.firstAdmissionDate = firstAdmission;
    patch.firstAdmissionSource = "vehicle_record";
  }
  if (existing.fuelCategory === "unknown" && !overrides.fuelCategory && fuelCategory !== "unknown") {
    patch.fuelCategory = fuelCategory;
  }
  if (Object.keys(patch).length === 0) return existing;
  const [updated] = await db
    .update(vehicleFiscalProfiles)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(vehicleFiscalProfiles.id, existing.id))
    .returning();
  return updated;
}

export const MANUAL_PROFILE_FIELDS = ["catalogValue", "marketValue", "firstAdmissionDate", "fuelCategory", "europeanCategory", "isDrivingSchoolManual"] as const;
export type ManualProfileField = (typeof MANUAL_PROFILE_FIELDS)[number];

export interface ManualOverrideInput {
  field: ManualProfileField;
  value: unknown;
  reason: string;
}

function money(raw: unknown, field: string): string {
  const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw.replace(",", ".")) : NaN;
  if (!Number.isFinite(n) || n < 0) throw new FiscalValidationError("Ongeldig bedrag", [{ key: field, message: "moet een bedrag van 0 of hoger zijn" }]);
  return (Math.round(n * 100) / 100).toFixed(2);
}

function normalise(field: ManualProfileField, raw: unknown): string | boolean {
  switch (field) {
    case "catalogValue":
    case "marketValue":
      return money(raw, field);
    case "firstAdmissionDate":
      if (!isValidIsoDate(raw)) throw new FiscalValidationError("Ongeldige datum", [{ key: field, message: "geen geldige datum (jjjj-mm-dd)" }]);
      return raw;
    case "fuelCategory":
      if (typeof raw !== "string" || !FUEL_CATEGORIES.includes(raw as FuelCategory) || raw === "unknown") {
        throw new FiscalValidationError("Ongeldige brandstofklasse", [{ key: field, message: `moet een van ${FUEL_CATEGORIES.filter((c) => c !== "unknown").join(", ")} zijn` }]);
      }
      return raw;
    case "europeanCategory":
      if (typeof raw !== "string" || !(EUROPEAN_CATEGORIES as readonly string[]).includes(raw)) {
        throw new FiscalValidationError("Ongeldige voertuigcategorie", [{ key: field, message: `moet een van ${EUROPEAN_CATEGORIES.join(", ")} zijn` }]);
      }
      return raw;
    case "isDrivingSchoolManual":
      if (typeof raw !== "boolean") throw new FiscalValidationError("Ongeldige waarde", [{ key: field, message: "moet ja of nee zijn" }]);
      return raw;
  }
}

/** Sets one fact by hand, with a reason, and audits the change. */
export async function applyManualOverride(vehicleId: number, input: ManualOverrideInput, actor: Actor): Promise<VehicleFiscalProfile> {
  if (!(MANUAL_PROFILE_FIELDS as readonly string[]).includes(input.field)) {
    throw new FiscalValidationError("Onbekend veld", [{ key: String(input.field), message: "kan niet handmatig worden gezet" }]);
  }
  const reason = (input.reason ?? "").trim();
  if (!reason) throw new FiscalValidationError("Reden is verplicht", [{ key: "reason", message: "verplicht" }]);
  const value = normalise(input.field, input.value);
  const profile = await ensureProfile(vehicleId);
  const oldValue = profile[input.field];
  const now = new Date();

  const patch: Partial<typeof vehicleFiscalProfiles.$inferInsert> = { [input.field]: value, updatedAt: now };
  if (input.field === "catalogValue") {
    patch.catalogValueSource = "manual";
    patch.catalogValueVerifiedAt = now;
    patch.catalogValueVerifiedByName = actor.username;
  } else if (input.field === "marketValue") {
    patch.marketValueVerifiedAt = now;
    patch.marketValueVerifiedByName = actor.username;
    patch.marketValueNote = reason;
  } else if (input.field === "firstAdmissionDate") {
    patch.firstAdmissionSource = "manual";
  }
  patch.manualOverride = { ...(profile.manualOverride ?? {}), [input.field]: { value, byName: actor.username, at: now.toISOString(), reason } };

  return db.transaction(async (tx) => {
    const [updated] = await tx.update(vehicleFiscalProfiles).set(patch).where(eq(vehicleFiscalProfiles.id, profile.id)).returning();
    await recordFiscalEvent(
      actor,
      {
        action: "profile_overridden",
        entityType: "fiscal_profile",
        entityId: profile.id,
        vehicleId,
        parameterKey: input.field,
        oldValue: auditValueText(oldValue),
        newValue: auditValueText(value),
        reasonText: reason,
      },
      tx,
    );
    return updated;
  });
}
