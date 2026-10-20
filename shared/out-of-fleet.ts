/**
 * Punt 7 (Kees, 2026-10-20) — a vehicle taken out of the fleet (sold, lease
 * returned, scrapped) instead of deleted. Nothing is removed: reservations,
 * costs, documents, contracts, fines and reports keep pointing at it ("de
 * bestanden en contracten die ooit zijn aangemaakt voor dat voertuig moeten
 * ook bewaard blijven!"). The vehicle is "not for rental" so every booking path
 * already skips it, and it is hidden from the vehicle list and the pickers
 * unless asked for. Undone with "Terug in de vloot".
 */

export const OUT_OF_FLEET_REASONS = ["sold", "lease_returned", "scrapped", "other"] as const;
export type OutOfFleetReason = (typeof OUT_OF_FLEET_REASONS)[number];

export const OUT_OF_FLEET_BLOCKED_CODE = "VEHICLE_HAS_LIVE_RESERVATIONS";
export const ALREADY_OUT_OF_FLEET_CODE = "VEHICLE_OUT_OF_FLEET";
export const NOT_OUT_OF_FLEET_CODE = "VEHICLE_IN_FLEET";

type VehicleLike = { outOfFleetDate?: string | null } | null | undefined;

export function isOutOfFleet(vehicle: VehicleLike): boolean {
  return !!vehicle?.outOfFleetDate;
}

/** For pickers: in the fleet, or the one already chosen (an old record keeps showing its own car). */
export function inFleetOrSelected<T extends { id: number; outOfFleetDate?: string | null }>(vehicles: T[], selectedId?: number | null): T[] {
  return vehicles.filter((v) => !isOutOfFleet(v) || (selectedId != null && v.id === selectedId));
}

export interface OutOfFleetInput {
  date: string;
  reason: OutOfFleetReason;
  salePrice: number | null;
  buyer: string | null;
  note: string | null;
}

/** Checks what the dialog sends; names the field that is wrong. */
export function parseOutOfFleetInput(body: Record<string, unknown> | null | undefined):
  { ok: true; value: OutOfFleetInput } | { ok: false; field: string } {
  const date = typeof body?.date === "string" ? body.date.trim() : "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return { ok: false, field: "date" };
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.toISOString().slice(0, 10) !== date) return { ok: false, field: "date" };

  const reason = body?.reason;
  if (typeof reason !== "string" || !(OUT_OF_FLEET_REASONS as readonly string[]).includes(reason)) return { ok: false, field: "reason" };

  let salePrice: number | null = null;
  const rawPrice = body?.salePrice;
  if (rawPrice !== null && rawPrice !== undefined && rawPrice !== "") {
    const n = typeof rawPrice === "number" ? rawPrice : Number(String(rawPrice).replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n >= 100_000_000) return { ok: false, field: "salePrice" };
    salePrice = Math.round(n * 100) / 100;
  }
  const text = (v: unknown, max: number): string | null | undefined => {
    if (v === null || v === undefined) return null;
    if (typeof v !== "string") return undefined;
    const t = v.trim();
    if (t.length > max) return undefined;
    return t || null;
  };
  const buyer = text(body?.buyer, 200);
  if (buyer === undefined) return { ok: false, field: "buyer" };
  const note = text(body?.note, 2000);
  if (note === undefined) return { ok: false, field: "note" };

  // A sale price and a buyer only belong to a sale.
  return {
    ok: true,
    value: { date, reason: reason as OutOfFleetReason, salePrice: reason === "sold" ? salePrice : null, buyer: reason === "sold" ? buyer : null, note },
  };
}
