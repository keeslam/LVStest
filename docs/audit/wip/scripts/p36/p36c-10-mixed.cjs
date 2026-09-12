'use strict';
const { admin, q, pool, loadIds, d } = require('./p36c-lib.cjs');
const log = (k, v) => console.log(k + ' :: ' + (typeof v === 'string' ? v : JSON.stringify(v)));
const RUN = process.env.RUN || String(Date.now()).slice(-5);
let cn = 0;
const CN = () => 'AUDIT-P36C-X' + RUN + '-' + (++cn);
(async () => {
  const s = await admin('c10');
  const ids = loadIds();
  const CA = ids.customers.A, CB = ids.customers.B;
  const base = { customerId: CA, notes: 'AUDIT-P36C mix', type: 'standard', totalPrice: 100 };
  const mk = async (tag) => {
    const plate = 'P36X' + RUN + tag;
    const r = await s.post('/api/vehicles', { licensePlate: plate, brand: 'AUDIT-P36C', model: 'X', vehicleType: 'Personenauto', chassisNumber: 'CH' + plate, currentMileage: 1000 });
    if (r.status !== 201) throw new Error(plate + ' ' + r.status + r.text.slice(0, 200));
    return r.json.id;
  };
  let r;

  // --- BUG-122 concurrent PATCH on one vehicle ---
  const V = await mk('C');
  const s2 = await admin('c10b');
  let lost = 0;
  for (let i = 0; i < 5; i++) {
    const [a, b] = await Promise.all([
      s.patch('/api/vehicles/' + V, { remarks: 'AUDIT-P36C-S1-' + i }),
      s2.patch('/api/vehicles/' + V, { tireSize: 'AUDIT-P36C-S2-' + i }),
    ]);
    const row = (await q('select remarks,tire_size from vehicles where id=$1', [V]))[0];
    const ok = row.remarks === 'AUDIT-P36C-S1-' + i && row.tire_size === 'AUDIT-P36C-S2-' + i;
    if (!ok) lost++;
    log('122 round ' + i, [a.status, b.status, row, ok ? 'both kept' : 'LOST UPDATE']);
  }
  log('122 rounds with a lost update (expect 0/5)', lost);

  // --- BUG-128 status reversal keeps endDate ---
  const V2 = await mk('S');
  r = await s.post('/api/reservations', { ...base, vehicleId: V2, startDate: d(-3), endDate: d(3) });
  const R2 = r.json.id;
  const planned = (await q('select end_date from reservations where id=$1', [R2]))[0].end_date;
  await s.post('/api/reservations/' + R2 + '/pickup', { contractNumber: CN(), pickupDate: d(-3), pickupMileage: 1000, fuelLevelPickup: 'full' });
  r = await s.post('/api/reservations/' + R2 + '/return', { returnDate: d(-1), returnMileage: 1100, fuelLevelReturn: 'full' });
  log('128 after return', [r.status, await q('select status,end_date from reservations where id=$1', [R2])]);
  r = await s.patch('/api/reservations/' + R2 + '/status', { status: 'picked_up' });
  log('128 reverse to picked_up', [r.status, r.text.slice(0, 180)]);
  log('128 end_date (planned was ' + planned + ')', await q('select status,end_date from reservations where id=$1', [R2]));

  // --- BUG-119 contract PDF on a placeholder / maintenance block ---
  const V3 = await mk('B');
  r = await s.post('/api/transports', { vehicleId: V3, transportType: 'swap', scheduledDate: d(230), spareRequired: true, isBreakdownOrMaintenance: true, reason: 'AUDIT-P36C t119' });
  const T = r.json && r.json.id;
  const phs = await q('select id from reservations where replacement_for_transport_id=$1', [T]);
  log('119 placeholder', [r.status, phs]);
  const V4 = await mk('MB');
  r = await s.post('/api/reservations', { customerId: CA, vehicleId: V4, startDate: d(240), endDate: d(242), type: 'maintenance_block', notes: 'AUDIT-P36C block119' });
  log('119 maintenance block', [r.status, r.json && r.json.id, r.text.slice(0, 160)]);
  const MB = r.json && r.json.id;
  const docsBefore = (await q('select count(*)::int n from documents'))[0].n;
  for (const [label, path] of [
    ['generate placeholder', '/api/contracts/generate/' + (phs[0] && phs[0].id)],
    ['data placeholder', '/api/contracts/data/' + (phs[0] && phs[0].id)],
    ['generate-default block', '/api/contracts/generate-default/' + MB],
    ['generate block', '/api/contracts/generate/' + MB],
  ]) {
    const rr = await s.get(path);
    log('119 ' + label + ' (expect 400)', [rr.status, (rr.headers.get('content-type') || '').slice(0, 30), rr.text.slice(0, 140)]);
  }
  log('119 documents added (expect 0)', (await q('select count(*)::int n from documents'))[0].n - docsBefore);

  // --- BUG-121 maintenance-with-spare: same spare twice in one payload ---
  const VM = await mk('M'), VS = await mk('MS');
  r = await s.post('/api/reservations', { ...base, vehicleId: VM, startDate: d(250), endDate: d(259) });
  const RA = r.json.id;
  r = await s.post('/api/reservations', { ...base, vehicleId: VM, customerId: CB, startDate: d(260), endDate: d(269) });
  const RB = r.json.id;
  log('121 rentals', [RA, RB]);
  const before121 = (await q('select count(*)::int n from reservations where notes like $1', ['AUDIT-P36C mws%']))[0].n;
  r = await s.post('/api/reservations/maintenance-with-spare', {
    vehicleId: VM, startDate: d(250), endDate: d(259), maintenanceType: 'service', notes: 'AUDIT-P36C mws',
    spareVehicleAssignments: [
      { reservationId: RA, spareVehicleId: VS, startDate: d(250), endDate: d(259) },
      { reservationId: RB, spareVehicleId: VS, startDate: d(250), endDate: d(259) },
    ],
  });
  log('121 same spare twice in one payload (expect 409)', [r.status, r.text.slice(0, 300)]);
  log('121 rows written (expect 0)', (await q('select count(*)::int n from reservations where notes like $1', ['AUDIT-P36C mws%']))[0].n - before121);
  r = await s.post('/api/reservations/maintenance-with-spare', {
    vehicleId: VM, startDate: d(250), endDate: d(259), maintenanceType: 'service', notes: 'AUDIT-P36C mws2',
    spareVehicleAssignments: [{ reservationId: RA, spareVehicleId: 98765432, startDate: d(250), endDate: d(259) }],
  });
  log('121 non-existent spare vehicle (expect 4xx)', [r.status, r.text.slice(0, 200)]);

  // --- BUG-148 db error mapping ---
  r = await s.post('/api/transports', { vehicleId: 98765432, transportType: 'tow', scheduledDate: d(300), reason: 'AUDIT-P36C t148' });
  log('148 transport with non-existent vehicleId (expect 404)', [r.status, r.text.slice(0, 220)]);
  const V5 = await mk('E');
  r = await s.post('/api/reservations', { ...base, vehicleId: V5, startDate: d(310), endDate: d(312), driverId: 98765432 });
  log('148 reservation with non-existent driverId (expect 404)', [r.status, r.text.slice(0, 220)]);
  r = await s.post('/api/vehicles', { licensePlate: 'P36X' + RUN + 'E2', brand: 'x', model: 'y', vehicleType: 'Personenauto', chassisNumber: 'CHX', barcode: 'VEH-' + String(V5).padStart(6, '0') });
  log('148 create with taken barcode (expect 409 field barcode)', [r.status, r.text.slice(0, 250)]);

  // --- BUG-151 / B-15 reservation recycle bin ---
  const V6 = await mk('RB');
  r = await s.post('/api/reservations', { ...base, vehicleId: V6, startDate: d(320), endDate: d(323) });
  const R6 = r.json.id;
  r = await s.del('/api/reservations/' + R6);
  log('151 DELETE reservation', [r.status, r.text.slice(0, 140)]);
  r = await s.get('/api/deleted-records');
  const entry = (r.json || []).find(x => String(x.entityId || x.entity_id) === String(R6) && /reservation/.test(x.entityType || x.entity_type || ''));
  log('151 recycle-bin entry', entry ? { id: entry.id, label: entry.label } : null);
  if (entry) {
    // create an overlapping booking, then try to restore
    r = await s.post('/api/reservations', { ...base, vehicleId: V6, customerId: CB, startDate: d(321), endDate: d(324) });
    log('151 overlapping booking', [r.status, r.json && r.json.id]);
    const rr = await s.post('/api/deleted-records/' + entry.id + '/restore', {});
    log('151 restore over a conflict (expect 409)', [rr.status, rr.text.slice(0, 220)]);
  }

  // --- BUG-154 maintenance-status hook on the linked block ---
  const V7 = await mk('MS2');
  r = await s.post('/api/reservations', { customerId: CA, vehicleId: V7, startDate: d(0), endDate: d(2), type: 'maintenance_block', notes: 'AUDIT-P36C block154' });
  const MB2 = r.json && r.json.id;
  log('154 block', [r.status, MB2, await q('select status from reservations where id=$1', [MB2])]);
  r = await s.patch('/api/vehicles/' + V7 + '/maintenance-status', { status: 'in_service', note: 'AUDIT-P36C 154' });
  log('154 maintenance-status in_service', [r.status, r.text.slice(0, 120)]);
  log('154 block status after (expect in)', await q('select id,status,maintenance_status from reservations where id=$1', [MB2]));
  await pool.end();
})();
