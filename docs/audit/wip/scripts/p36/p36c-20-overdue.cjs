'use strict';
const { admin, q, pool, d } = require('./p36c-lib.cjs');
const log = (k, v) => console.log(k + ' :: ' + (typeof v === 'string' ? v : JSON.stringify(v)));
(async () => {
  const s = await admin('c20');
  const rows = await q("select id,vehicle_id,status,end_date from reservations where deleted_at is null and status='returned' and end_date < (current_date-3)::text limit 3");
  log('113 legacy returned rows', rows);
  for (const r0 of rows) {
    const r = await s.post('/api/reservations', { customerId: 179, vehicleId: r0.vehicle_id, startDate: d(500), endDate: d(502), type: 'standard', totalPrice: 100, notes: 'AUDIT-P36C overdue probe' });
    log('113 future booking on vehicle ' + r0.vehicle_id + ' (expect 201)', [r.status, r.text.slice(0, 200)]);
    if (r.status === 201) await s.del('/api/reservations/' + r.json.id);
  }
  await pool.end();
})();
