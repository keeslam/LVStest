/**
 * Replace the vehicles of a TEST database with real vehicles from the RDW.
 *
 * The plates come from a text file (one per line; a trailing `*` is ignored).
 * Every plate is looked up in the RDW open data. The vehicles that carry the
 * most reservations are overwritten in place, so bookings, documents and
 * history stay attached to a real car; every other vehicle is removed together
 * with its reservations and dependent rows. Afterwards the fiscal profile of
 * each kept vehicle is refreshed from the RDW (docs/fiscaal).
 *
 * Never run this against production: it deletes vehicles and reservations.
 *
 *   DATABASE_URL=postgresql://... npx tsx scripts/replace-vehicles-from-rdw.ts kentekens.txt --yes
 */
import fs from "fs";
import { sql, eq, desc } from "drizzle-orm";
import { db, pool } from "../server/db";
import { vehicles, reservations } from "../shared/schema";
import { fetchVehicleInfoByLicensePlate, RDWNotFoundError } from "../server/utils/rdw-api";
import { refreshFromRdw } from "../server/services/fiscal/profiles";
import { SYSTEM_ACTOR } from "../server/services/fiscal/assess";

const PAUSE_MS = 250;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const [file, ...flags] = process.argv.slice(2);
  if (!file || !flags.includes("--yes")) {
    console.error("Gebruik: DATABASE_URL=... npx tsx scripts/replace-vehicles-from-rdw.ts <kentekens.txt> --yes");
    process.exit(2);
  }
  const dbName = (process.env.DATABASE_URL ?? "").split("/").pop()?.split("?")[0];
  console.log(`Database: ${dbName}`);
  const plates = [...new Set(fs.readFileSync(file, "utf8").split(/\r?\n/).map((l) => l.replace(/\*/g, "").trim()).filter(Boolean))];
  console.log(`${plates.length} kentekens in ${file}`);

  // 1. RDW, one plate at a time.
  const found: Array<{ plate: string; info: Awaited<ReturnType<typeof fetchVehicleInfoByLicensePlate>> }> = [];
  const notFound: string[] = [];
  for (const plate of plates) {
    try {
      found.push({ plate, info: await fetchVehicleInfoByLicensePlate(plate) });
    } catch (e) {
      notFound.push(`${plate} (${e instanceof RDWNotFoundError ? "niet bij RDW" : (e as Error).message})`);
    }
    await sleep(PAUSE_MS);
  }
  console.log(`RDW: ${found.length} gevonden, ${notFound.length} niet gevonden: ${notFound.join(", ") || "-"}`);
  if (found.length === 0) throw new Error("Geen enkel kenteken gevonden; niets gedaan.");

  // 2. Which vehicles stay (the ones with the most reservations) and which go.
  const ranked = await db
    .select({ id: vehicles.id, n: sql<string>`count(${reservations.id})` })
    .from(vehicles)
    .leftJoin(reservations, eq(reservations.vehicleId, vehicles.id))
    .groupBy(vehicles.id)
    .orderBy(desc(sql`count(${reservations.id})`), vehicles.id);
  const keep = ranked.slice(0, found.length).map((r) => r.id).sort((a, b) => a - b);
  const remove = ranked.slice(found.length).map((r) => r.id);
  console.log(`Voertuigen: ${ranked.length} aanwezig, ${keep.length} blijven en worden overschreven, ${remove.length} worden verwijderd`);

  // A JS array inside a sql`` template becomes a row list, not one array parameter;
  // the ids come from the database, so a literal int[] is safe.
  const ints = (ids: number[]) => sql.raw(`'{${ids.map((n) => Math.trunc(Number(n))).join(",")}}'::int[]`);

  // 3. One transaction: remove, then overwrite.
  const counts: Record<string, number> = {};
  await db.transaction(async (tx) => {
    const removedRes = remove.length
      ? (await tx.execute(sql`select id from reservations where vehicle_id = any(${ints(remove)})`)).rows.map((r) => Number((r as { id: number }).id))
      : [];
    counts.reservations = removedRes.length;
    const del = async (label: string, q: ReturnType<typeof sql>) => {
      const r = await tx.execute(q);
      counts[label] = (counts[label] ?? 0) + (r.rowCount ?? 0);
    };
    if (remove.length) {
      const v = ints(remove);
      const rr = ints(removedRes);
      await del("interactive_damage_checks", sql`delete from interactive_damage_checks where vehicle_id = any(${v}) or reservation_id = any(${rr})`);
      await del("scan_events", sql`delete from scan_events where vehicle_id = any(${v}) or reservation_id = any(${rr})`);
      await del("documents", sql`delete from documents where vehicle_id = any(${v}) or reservation_id = any(${rr})`);
      await del("fiscal_assessments", sql`delete from fiscal_assessments where vehicle_id = any(${v}) or reservation_id = any(${rr})`);
      await del("fiscal_review_cases", sql`delete from fiscal_review_cases where vehicle_id = any(${v})`);
      await del("fiscal_audit_events", sql`delete from fiscal_audit_events where vehicle_id = any(${v})`);
      await del("expenses", sql`delete from expenses where vehicle_id = any(${v})`);
      await del("vehicle_waitlist", sql`delete from vehicle_waitlist where vehicle_id = any(${v})`);
      for (const col of ["affected_rental_id", "maintenance_block_id", "recurring_parent_id", "replacement_for_reservation_id"]) {
        await tx.execute(sql`update reservations set ${sql.raw(col)} = null where ${sql.raw(col)} = any(${rr})`);
      }
      await del("reservations_deleted", sql`delete from reservations where id = any(${rr})`);
      await del("vehicles_deleted", sql`delete from vehicles where id = any(${v})`);
    }
    // Temporary plates first: the unique index must not trip over a plate that moves to another id.
    await tx.execute(sql`update vehicles set license_plate = 'TMP-' || id where id = any(${ints(keep)})`);
    for (let i = 0; i < keep.length; i++) {
      const { plate, info } = found[i];
      await tx
        .update(vehicles)
        .set({
          // The plate as Kees wrote it: the RDW reply has no dashes and the app's
          // formatter cannot tell the Dutch side codes apart (04-VKD-6 vs 04-VK-D6).
          licensePlate: plate.includes("-") ? plate.toUpperCase() : (info.licensePlate ?? plate),
          brand: info.brand ?? "Onbekend",
          model: info.model ?? "Onbekend",
          vehicleType: info.vehicleType ?? null,
          chassisNumber: info.chassisNumber ?? null,
          fuel: info.fuel ?? null,
          euroZone: info.euroZone ?? null,
          apkDate: info.apkDate ?? null,
          productionDate: info.productionDate ?? null,
          registeredTo: info.registeredTo ?? null,
          registeredToDate: info.registeredToDate ?? null,
          wokNotification: info.wokNotification ?? false,
          updatedBy: "rdw-import",
          updatedAt: new Date(),
        })
        .where(eq(vehicles.id, keep[i]));
    }
    counts.vehicles_overwritten = keep.length;
  });
  console.log("Verwijderd / overschreven:", JSON.stringify(counts));

  // 4. Fiscal profiles from the RDW (never throws; an error lands in rdw_error).
  let refreshed = 0;
  const failed: string[] = [];
  for (let i = 0; i < keep.length; i++) {
    const r = (await refreshFromRdw(keep[i], SYSTEM_ACTOR)) as unknown as Record<string, unknown>;
    const err = (r.rdwError ?? r.error ?? (r.profile as Record<string, unknown> | undefined)?.rdwError) as string | null | undefined;
    if (err) failed.push(`${found[i].plate}: ${err}`);
    else refreshed++;
    await sleep(PAUSE_MS);
  }
  console.log(`Fiscale profielen: ${refreshed} ververst uit RDW, ${failed.length} met fout${failed.length ? ": " + failed.join("; ") : ""}`);
}

main()
  .then(() => pool.end())
  .catch(async (e) => {
    console.error("Mislukt, niets gewijzigd (transactie teruggedraaid):", e);
    await pool.end();
    process.exit(1);
  });
