// Phase 13 test 7: double-click simulation - the exact same POST twice within ~15 ms.
'use strict';
const L = require('./p13-lib.cjs');

(async () => {
  const rep = new L.Report('p13-05-dblclick');
  const admin = await L.getSession('admin');
  const ids = L.loadIds();
  const ts = Date.now();
  const twice = (sess, path, body, gap = 15, opts) => L.burst([{ sess, method: 'POST', path, body, label: 'click1', opts }, { sess, method: 'POST', path, body, label: 'click2', delayMs: gap, opts }]);
  const summary = [];
  const record = async (name, res, countSql, params, extra = {}) => {
    const rows = await L.q(countSql, params);
    const rec = { name, dist: L.dist(res), ms: res.map((r) => r.ms), bodies: res.map((r) => (r.text || '').slice(0, 140)), rowsCreated: rows[0].n, ...extra };
    summary.push({ name, dist: rec.dist, rowsCreated: rec.rowsCreated });
    rep.step('7 ' + name, rec);
  };

  // reservations (BUG-006 known - counted only)
  let res = await twice(admin, '/api/reservations', { vehicleId: ids.v11, customerId: ids.c1, startDate: '2030-01-10', endDate: '2030-01-12', notes: `AUDIT-P13 dbl reservation ${ts}` });
  await record('POST /api/reservations', res, 'select count(*)::int n from reservations where notes=$1', [`AUDIT-P13 dbl reservation ${ts}`], { known: 'BUG-006' });

  // customers
  res = await twice(admin, '/api/customers', { name: `AUDIT-P13 dbl customer ${ts}`, email: `dbl-${ts}@audit-p13.example`, phone: '0611111111' });
  await record('POST /api/customers', res, 'select count(*)::int n from customers where name=$1', [`AUDIT-P13 dbl customer ${ts}`]);

  // vehicles (unique license plate)
  res = await twice(admin, '/api/vehicles', { licensePlate: `AU-13DC-X`, brand: 'AUDIT-P13', model: 'dbl', vehicleType: 'car', currentMileage: 1, dailyPrice: '1' });
  await record('POST /api/vehicles (unique plate)', res, "select count(*)::int n from vehicles where license_plate='AU-13DC-X'", []);

  // transports (no spare)
  res = await twice(admin, '/api/transports', { vehicleId: ids.v11, transportType: 'delivery', scheduledDate: '2030-02-01', originCity: 'A', destinationCity: 'B', notes: `AUDIT-P13 dbl transport ${ts}` });
  await record('POST /api/transports', res, 'select count(*)::int n from vehicle_transports where notes=$1', [`AUDIT-P13 dbl transport ${ts}`]);

  // transports WITH spare (conflict check inside)
  res = await twice(admin, '/api/transports', { vehicleId: ids.v11, transportType: 'swap', scheduledDate: '2030-02-03', spareRequired: true, relatedVehicleId: ids.v12, isBreakdownOrMaintenance: false, notes: `AUDIT-P13 dbl transport spare ${ts}` });
  await record('POST /api/transports with spareRequired', res, 'select count(*)::int n from vehicle_transports where notes=$1', [`AUDIT-P13 dbl transport spare ${ts}`], { spareReservations: await L.q("select id, vehicle_id, start_date from reservations where vehicle_id=$1 and start_date='2030-02-03' and deleted_at is null", [ids.v12]) });

  // drivers
  res = await twice(admin, `/api/customers/${ids.c1}/drivers`, { displayName: `AUDIT-P13 dbl driver ${ts}`, firstName: 'AUDIT', lastName: `P13-${ts}`, status: 'active' });
  await record('POST /api/customers/:id/drivers', res, 'select count(*)::int n from drivers where display_name=$1', [`AUDIT-P13 dbl driver ${ts}`]);

  // expenses
  res = await twice(admin, '/api/expenses', { vehicleId: ids.v11, category: 'other', amount: 13.13, date: '2026-09-10', description: `AUDIT-P13 dbl expense ${ts}` });
  await record('POST /api/expenses', res, 'select count(*)::int n from expenses where description=$1', [`AUDIT-P13 dbl expense ${ts}`]);

  // users (check-then-insert on username)
  res = await twice(admin, '/api/users', { username: `AUDIT-P13-dbl-${ts}`, password: 'DblClick123!', role: 'user', permissions: [], active: true });
  await record('POST /api/users (check-then-insert username)', res, 'select count(*)::int n from users where username=$1', [`AUDIT-P13-dbl-${ts}`]);

  // blacklist (check-then-insert + unique index)
  res = await twice(admin, `/api/vehicles/${ids.v11}/blacklist`, { customerId: ids.c3, reason: `AUDIT-P13 dbl blacklist ${ts}` });
  await record('POST /api/vehicles/:id/blacklist (check-then-insert, unique index)', res, 'select count(*)::int n from vehicle_customer_blacklist where vehicle_id=$1 and customer_id=$2', [ids.v11, ids.c3]);

  // maintenance block via POST /api/reservations type=maintenance_block (conflict check against other blocks)
  res = await twice(admin, '/api/reservations', { vehicleId: ids.v12, type: 'maintenance_block', startDate: '2030-03-01', endDate: '2030-03-03', status: 'booked', maintenanceStatus: 'scheduled', notes: `AUDIT-P13 dbl block ${ts}` });
  await record('POST /api/reservations type=maintenance_block', res, 'select count(*)::int n from reservations where notes=$1', [`AUDIT-P13 dbl block ${ts}`]);

  // portal requests (portal realm): 'other' (no dedupe by design) and 'maintenance' (dedupe check-then-insert)
  const portal = new L.Session('portal', { fakeIp: '10.13.2.' + (1 + Math.floor(Math.random() * 200)) });
  const pl = await portal.loginPortal('portaal-test@example.com', 'portaal-test-1234');
  rep.step('portal login', { status: pl.status });
  if (pl.status === 200) {
    res = await twice(portal, '/api/portal/requests', { type: 'other', message: `AUDIT-P13 dbl portal other ${ts}`, payload: {} });
    await record('POST /api/portal/requests type=other', res, 'select count(*)::int n from portal_requests where message=$1', [`AUDIT-P13 dbl portal other ${ts}`]);
    const [rental] = await L.q("select id from reservations where customer_id=179 and status='picked_up' and deleted_at is null and type='standard' order by id desc limit 1");
    if (rental) {
      // close any open maintenance request for this rental first so the dedupe guard is the thing under test
      await L.q("update portal_requests set status='done' where type='maintenance' and reservation_id=$1 and status in ('new','in_progress')", [rental.id]);
      const pref = L.nextWeekday(L.addDays(L.today(), 7));
      res = await twice(portal, '/api/portal/requests', { type: 'maintenance', reservationId: rental.id, message: `AUDIT-P13 dbl portal maint ${ts}`, payload: { issue: 'AUDIT-P13 dbl', mileage: 1500, urgent: false, needsReplacement: false, preferredDate: pref } });
      await record('POST /api/portal/requests type=maintenance (dedupe guard)', res, 'select count(*)::int n from portal_requests where message=$1', [`AUDIT-P13 dbl portal maint ${ts}`], { staffNotifications: (await L.q("select count(*)::int n from custom_notifications where description like $1", [`AUDIT-P13 dbl portal maint ${ts}%`]))[0].n });
    }
  }

  // 0 ms variant for the two that rejected at 15 ms (if any) - customers again at 0 ms as reference
  res = await twice(admin, '/api/customers', { name: `AUDIT-P13 dbl0 customer ${ts}`, email: `dbl0-${ts}@audit-p13.example` }, 0);
  await record('POST /api/customers @0ms', res, 'select count(*)::int n from customers where name=$1', [`AUDIT-P13 dbl0 customer ${ts}`]);

  rep.step('7 summary', { summary });
  rep.step('health', await L.health());
  await L.pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
