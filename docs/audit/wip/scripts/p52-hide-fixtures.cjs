/**
 * Remove the audit's own test fixtures from the screenshot database.
 *
 * The manual's screenshots come from `lvs_regress`, a disposable clone of the
 * development database that exists only to be photographed. The audit left fuzz
 * fixtures in it — plates like AU3D1X with 200-character brand names and
 * deliberately broken Unicode — and those belong in a bug report, not in a
 * manual for new employees. The ordinary demo data ("Klant 143 B.V.", plate
 * 56-XT-326) stays untouched.
 *
 * Vehicles and customers have no soft-delete column (deleting them is a
 * recycle-bin operation in the application), so in this throwaway database the
 * rows are deleted outright, children first. Only `lvs_regress` is accepted.
 *
 *   node docs/audit/wip/scripts/p52-hide-fixtures.cjs          (dry run)
 *   node docs/audit/wip/scripts/p52-hide-fixtures.cjs --apply
 */
'use strict';

require('dotenv').config();
const { Pool } = require('pg');

const url = (process.env.DATABASE_URL || '').replace(/\/[a-z_]+$/i, '/lvs_regress');
if (!/\/lvs_regress$/.test(url)) {
  console.error('refusing to run: this script only touches lvs_regress');
  process.exit(1);
}

const apply = process.argv.includes('--apply');
const pool = new Pool({ connectionString: url, ssl: false });
const PREFIXES = ['AUDIT%', 'AU-%', 'AU3%', 'FIXT%', 'HANDLEIDING%', 'Handleiding%', 'WAVE%', 'P36%', 'HL-%'];

const orLike = (column, offset) =>
  PREFIXES.map((_, i) => `${column} LIKE $${i + 1 + offset}`).join(' OR ');

/** Every table that points at a reservation, a vehicle or a customer. */
async function childTables(client, target) {
  const { rows } = await client.query(
    `SELECT tc.table_name, kcu.column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
       JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = $1`,
    [target],
  );
  return rows;
}

async function main() {
  const vehicles = (await pool.query(
    `SELECT id, license_plate FROM vehicles WHERE ${orLike('license_plate', 0)} OR ${orLike('brand', PREFIXES.length)}`,
    [...PREFIXES, ...PREFIXES],
  )).rows;
  const customers = (await pool.query(
    `SELECT id, name FROM customers WHERE ${orLike('name', 0)}`,
    PREFIXES,
  )).rows;

  const vehicleIds = vehicles.map((v) => v.id);
  const customerIds = customers.map((c) => c.id);
  const reservationIds = (await pool.query(
    'SELECT id FROM reservations WHERE vehicle_id = ANY($1) OR customer_id = ANY($2)',
    [vehicleIds.length ? vehicleIds : [0], customerIds.length ? customerIds : [0]],
  )).rows.map((r) => r.id);

  console.log(`voertuigen ${vehicles.length}, klanten ${customers.length}, reserveringen ${reservationIds.length}`);
  console.log('voorbeeld:', vehicles.slice(0, 8).map((v) => v.license_plate).join(', '));

  if (!apply) {
    console.log('\ndry run — geef --apply om ze te verwijderen');
    return pool.end();
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [target, ids] of [['reservations', reservationIds], ['vehicles', vehicleIds], ['customers', customerIds]]) {
      if (!ids.length) continue;
      for (const child of await childTables(client, target)) {
        if (child.table_name === target) continue;
        await client.query(
          `DELETE FROM "${child.table_name}" WHERE "${child.column_name}" = ANY($1)`,
          [ids],
        ).catch((e) => console.log(`  overslaan ${child.table_name}.${child.column_name}: ${e.message}`));
      }
      await client.query(`DELETE FROM "${target}" WHERE id = ANY($1)`, [ids]);
    }
    // Blocks and replacements that pointed at a fixture vehicle by a plain
    // integer column (there is no foreign key on reservations.vehicle_id).
    await client.query('DELETE FROM reservations WHERE vehicle_id = ANY($1) OR customer_id = ANY($2)', [
      vehicleIds.length ? vehicleIds : [0], customerIds.length ? customerIds : [0],
    ]);
    await client.query('COMMIT');
    console.log(`\nverwijderd: ${reservationIds.length} reserveringen, ${vehicles.length} voertuigen, ${customers.length} klanten`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => { console.error(err.message); process.exit(1); });
