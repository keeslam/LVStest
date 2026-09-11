// P19 step 9: size of the console output produced per request, computed from the exact format strings in the code
// against real rows (server stdout is not capturable here; this replicates the formatting, it is not a stdout capture).
'use strict';
require('dotenv').config();
const util = require('util');
const { Pool } = require('pg');
const url = process.env.DATABASE_URL.replace(/\/[a-z_]+$/i, '/lvs_audit');
const pool = new Pool({ connectionString: url, ssl: false, application_name: 'psql' });

(async () => {
  // 1) Request logger (server/index.ts): "GET /api/reservations 200 in 208ms :: <json>" capped at 200 chars
  const loggerLine = (method, url, status, ms, body) => { let l = `${method} ${url} ${status} in ${ms}ms`; if (body) l += ` :: ${JSON.stringify(body)}`; if (l.length > 200) l = l.slice(0, 199) + '…'; return l; };
  const reqLine = loggerLine('GET', '/api/reservations', 200, 208, [{ id: 1, vehicleId: 1, customerId: 1, startDate: '2026-09-10', endDate: '2026-09-12', status: 'booked', vehicle: { id: 1, licensePlate: 'AU-001-X', brand: 'x', model: 'y' } }]);

  // 2) database-storage.ts getReservationsInDateRange: per maintenance block without customerId:
  //    console.log(`🔍 Looking for active rental for maintenance block ${id} on vehicle ${vehicleId}`)
  //    console.log(`📋 Found active rental:`, activeRental)   <- util.inspect of a full row or undefined
  //    console.log(`✅ Found customer from active rental:`, name) | console.log(`❌ No active rental found for vehicle ${vehicleId}`)
  const grid = { from: '2026-08-31', to: '2026-10-04' };
  const blocks = (await pool.query(`select id, vehicle_id from reservations where type='maintenance_block' and customer_id is null and vehicle_id is not null and deleted_at is null and ((start_date <= $2 and end_date >= $1) or (start_date between $1 and $2) or (end_date between $1 and $2))`, [grid.from, grid.to])).rows;
  let bytes = 0, withRental = 0;
  for (const b of blocks) {
    const [active] = (await pool.query(`select * from reservations where vehicle_id=$1 and type='standard' and (end_date is null or end_date='undefined') and status in ('confirmed','pending') and deleted_at is null limit 1`, [b.vehicle_id])).rows;
    bytes += Buffer.byteLength(`🔍 Looking for active rental for maintenance block ${b.id} on vehicle ${b.vehicle_id}\n`);
    bytes += Buffer.byteLength(`📋 Found active rental: ${util.inspect(active)}\n`);
    if (active) { withRental++; bytes += Buffer.byteLength(`✅ Found customer from active rental: X\n`); } else bytes += Buffer.byteLength(`❌ No active rental found for vehicle ${b.vehicle_id}\n`);
  }
  // size of one inspected full row (what the log carries when an active open-ended rental exists)
  const [anyRow] = (await pool.query(`select * from reservations where deleted_at is null and vehicle_id is not null limit 1`)).rows;
  const inspectedRowBytes = Buffer.byteLength(util.inspect(anyRow));

  const out = {
    requestLoggerLineBytes: Buffer.byteLength(reqLine) + 1, requestLoggerLineSample: reqLine,
    perDayAt5000Requests_MB: +((Buffer.byteLength(reqLine) + 1) * 5000 / 1048576).toFixed(2),
    rangeQueryGrid: grid, maintenanceBlocksWithoutCustomerInGrid: blocks.length, blocksWithActiveRental: withRental,
    rangeQueryLogBytesPerCalendarLoad: bytes, inspectedFullReservationRowBytes: inspectedRowBytes,
    note: 'computed from the exact format strings in server/index.ts:249-266 and server/database-storage.ts:1313-1335 against real rows; not a stdout capture',
  };
  console.log(JSON.stringify(out, null, 2));
  require('fs').writeFileSync(require('path').join(__dirname, 'p19-loglines.out.json'), JSON.stringify(out, null, 2));
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
