'use strict';
const { admin, q, pool, loadIds, d } = require('./p36c-lib.cjs');
const out = [];
const log = (k, v) => { out.push([k, v]); console.log(k + ' :: ' + (typeof v === 'string' ? v : JSON.stringify(v))); };
(async () => {
  const s = await admin('c01');
  const ids = loadIds();
  const V = ids.vehicles['P36C-A'], V2 = ids.vehicles['P36C-B'];
  const CA = ids.customers.A, CB = ids.customers.B;
  const base = { customerId: CA, notes: 'AUDIT-P36C conflicts', type: 'standard', totalPrice: 100 };
  // --- BUG-106 ---
  let r = await s.post('/api/reservations', { ...base, vehicleId: V, startDate: d(400), endDate: d(404) });
  log('106 create A', [r.status, r.json && r.json.id]);
  const A = r.json && r.json.id;
  r = await s.post('/api/reservations', { ...base, vehicleId: V, customerId: CB, startDate: d(410), endDate: d(413) });
  log('106 create B', [r.status, r.json && r.json.id]);
  const B = r.json && r.json.id;
  r = await s.patch('/api/reservations/' + A, { endDate: d(411) });
  log('106 PATCH A endDate->overlap B (expect 409)', [r.status, r.text.slice(0, 200)]);
  log('106 A row after', await q('select id,start_date,end_date from reservations where id=$1', [A]));
  r = await s.patch('/api/reservations/' + B, { startDate: d(403) });
  log('106 PATCH B startDate->overlap A (expect 409)', [r.status, r.text.slice(0, 200)]);
  // busy vehicle V2
  r = await s.post('/api/reservations', { ...base, vehicleId: V2, customerId: CB, startDate: d(400), endDate: d(404) });
  log('106 create C on V2', [r.status, r.json && r.json.id]);
  const C = r.json && r.json.id;
  r = await s.patch('/api/reservations/' + A, { vehicleId: V2 });
  log('106 PATCH A vehicleId->busy V2 (expect 409)', [r.status, r.text.slice(0, 200)]);
  log('106 A row final', await q('select id,vehicle_id,start_date,end_date from reservations where id=$1', [A]));

  // --- BUG-107 --- vehicle C, D..D+3 booked
  const V3 = ids.vehicles['P36C-C'];
  const D0 = d(500), D3 = d(503);
  r = await s.post('/api/reservations', { ...base, vehicleId: V3, startDate: D0, endDate: D3 });
  log('107 base D..D+3', [r.status, r.json && r.json.id]);
  r = await s.post('/api/reservations', { ...base, vehicleId: V3, customerId: CB, startDate: D0, endDate: D0 });
  log('107 one-day on D (expect 409)', [r.status, r.text.slice(0, 160)]);
  const oneDayOnD = r.json && r.json.id;
  r = await s.post('/api/reservations', { ...base, vehicleId: V3, customerId: CB, startDate: d(501), endDate: d(501) });
  log('107 one-day mid-range (expect 409)', [r.status, r.text.slice(0, 160)]);
  r = await s.post('/api/reservations', { ...base, vehicleId: V3, customerId: CB, startDate: D3, endDate: D3 });
  log('107 one-day on last day D+3 (turnover, expect 201)', [r.status, r.json && r.json.id]);
  // two identical one-day ranges on a fresh day
  const V4 = ids.vehicles['P36C-D'];
  const X = d(520);
  r = await s.post('/api/reservations', { ...base, vehicleId: V4, startDate: X, endDate: X });
  log('107 identical one-day #1', [r.status, r.json && r.json.id]);
  r = await s.post('/api/reservations', { ...base, vehicleId: V4, customerId: CB, startDate: X, endDate: X });
  log('107 identical one-day #2 (expect 409)', [r.status, r.text.slice(0, 160)]);
  r = await s.get(`/api/reservations/check-conflicts?vehicleId=${V4}&startDate=${X}&endDate=${X}`);
  log('107 check-conflicts identical day', [r.status, r.text.slice(0, 200)]);

  // --- BUG-111 --- validation on PATCH
  r = await s.post('/api/reservations', { ...base, vehicleId: ids.vehicles['P36C-E'], startDate: d(600), endDate: d(605) });
  const P = r.json && r.json.id;
  log('111 fixture', [r.status, P]);
  for (const body of [{ startDate: 'not-a-date' }, { endDate: d(599) }, { startTime: '25:99' }, { endTime: 'garbage' }, { type: 'garbage' }, { endDate: '2099-13-45' }]) {
    const rr = await s.patch('/api/reservations/' + P, body);
    log('111 PATCH ' + JSON.stringify(body), [rr.status, rr.text.slice(0, 140)]);
  }
  log('111 row after', await q('select id,start_date,end_date,start_time,end_time,type from reservations where id=$1', [P]));

  // --- BUG-127 --- mileage on PATCH
  log('127 see p36c-02', '');
  await pool.end();
})();
