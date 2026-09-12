'use strict';
const { admin, q, pool, loadIds, d } = require('./p36c-lib.cjs');
const log = (k, v) => console.log(k + ' :: ' + (typeof v === 'string' ? v : JSON.stringify(v)));
const RUN = process.env.RUN || String(Date.now()).slice(-5);
(async () => {
  const s = await admin('c09');
  const ids = loadIds();
  const CA = ids.customers.A;
  const base = { customerId: CA, notes: 'AUDIT-P36C tr', type: 'standard', totalPrice: 100 };
  const mk = async (tag) => {
    const plate = 'P36T' + RUN + tag;
    const r = await s.post('/api/vehicles', { licensePlate: plate, brand: 'AUDIT-P36C', model: 'T', vehicleType: 'Personenauto', chassisNumber: 'CH' + plate, currentMileage: 1000 });
    if (r.status !== 201) throw new Error(plate + ' ' + r.status + r.text.slice(0, 200));
    return r.json.id;
  };
  const tr = async (id) => (await q('select id,vehicle_id,related_vehicle_id,spare_required,spare_reservation_id,status,scheduled_date,completed_date from vehicle_transports where id=$1', [id]))[0];
  const res = async (id) => id ? (await q('select id,vehicle_id,status,start_date,end_date,placeholder_spare,deleted_at,notes from reservations where id=$1', [id]))[0] : null;
  let r;

  const vOrig = await mk('O'), vSpare = await mk('S'), vOther = await mk('X'), vNew = await mk('N');
  const DAY = d(200);

  // --- BUG-114: move scheduledDate, spare reservation must follow ---
  r = await s.post('/api/transports', { vehicleId: vOrig, transportType: 'swap', scheduledDate: DAY, spareRequired: true, relatedVehicleId: vSpare, isBreakdownOrMaintenance: true, reason: 'AUDIT-P36C t114' });
  log('114 create transport', [r.status, r.json && r.json.id, r.text.slice(0, 160)]);
  const T1 = r.json && r.json.id;
  let t = await tr(T1); log('114 row', t); log('114 spare res', await res(t.spare_reservation_id));
  r = await s.patch('/api/transports/' + T1, { scheduledDate: d(202) });
  log('114 PATCH scheduledDate +2', [r.status, r.text.slice(0, 160)]);
  t = await tr(T1); log('114 row after move', t); log('114 spare res after move (expect new day)', await res(t.spare_reservation_id));
  r = await s.post('/api/transports', { vehicleId: vOther, transportType: 'swap', scheduledDate: d(202), spareRequired: true, relatedVehicleId: vSpare, isBreakdownOrMaintenance: true, reason: 'AUDIT-P36C t114b' });
  log('114 second transport claiming same spare on new day (expect 409)', [r.status, r.text.slice(0, 200)]);
  if (r.status === 201) await s.del('/api/transports/' + r.json.id);

  // --- BUG-116: original vehicle == spare ---
  r = await s.patch('/api/transports/' + T1, { vehicleId: vSpare });
  log('116 PATCH vehicleId = current relatedVehicleId (expect 400)', [r.status, r.text.slice(0, 200)]);
  log('116 row', await tr(T1));

  // --- BUG-135: move original vehicle, flags must follow ---
  log('135 vOrig flags before', await q('select id,maintenance_status,maintenance_note from vehicles where id=$1', [vOrig]));
  r = await s.patch('/api/transports/' + T1, { vehicleId: vNew });
  log('135 PATCH vehicleId -> vNew', [r.status, r.text.slice(0, 200)]);
  log('135 vOrig flags after', await q('select id,maintenance_status,maintenance_note from vehicles where id=$1', [vOrig]));
  log('135 vNew flags after', await q('select id,maintenance_status,maintenance_note from vehicles where id=$1', [vNew]));
  t = await tr(T1); log('135 spare res notes', await res(t.spare_reservation_id));

  // --- BUG-136: transport status enum / transitions / completedDate ---
  r = await s.patch('/api/transports/' + T1, { status: 'garbage_status' });
  log('136 PATCH status garbage (expect 400)', [r.status, r.text.slice(0, 200)]);
  r = await s.patch('/api/transports/' + T1, { status: 'completed' });
  log('136 PATCH status completed (no completedDate)', [r.status, r.text.slice(0, 140)]);
  log('136 row (completed_date should be set)', await tr(T1));
  r = await s.patch('/api/transports/' + T1, { status: 'scheduled' });
  log('136 completed -> scheduled (expect 400)', [r.status, r.text.slice(0, 200)]);
  log('136 row after', await tr(T1));

  // --- BUG-115: cancel a transport frees the spare ---
  const vO2 = await mk('O2'), vS2 = await mk('S2'), vO3 = await mk('O3');
  const DAY2 = d(210);
  r = await s.post('/api/transports', { vehicleId: vO2, transportType: 'swap', scheduledDate: DAY2, spareRequired: true, relatedVehicleId: vS2, isBreakdownOrMaintenance: true, reason: 'AUDIT-P36C t115' });
  const T2 = r.json && r.json.id;
  log('115 create', [r.status, T2]);
  let t2 = await tr(T2); log('115 spare res', await res(t2.spare_reservation_id));
  r = await s.patch('/api/transports/' + T2, { status: 'cancelled' });
  log('115 cancel', [r.status, r.text.slice(0, 140)]);
  t2 = await tr(T2);
  log('115 spare res after cancel (expect cancelled/deleted)', await res(t2.spare_reservation_id));
  log('115 spare vehicle status', await q('select availability_status from vehicles where id=$1', [vS2]));
  r = await s.post('/api/transports', { vehicleId: vO3, transportType: 'swap', scheduledDate: DAY2, spareRequired: true, relatedVehicleId: vS2, isBreakdownOrMaintenance: true, reason: 'AUDIT-P36C t115b' });
  log('115 new transport for same spare/day (expect 201)', [r.status, r.text.slice(0, 200)]);
  const T2b = r.json && r.json.id;

  // --- BUG-137: placeholder of a completed/cancelled transport ---
  const vO4 = await mk('O4');
  r = await s.post('/api/transports', { vehicleId: vO4, transportType: 'swap', scheduledDate: d(215), spareRequired: true, isBreakdownOrMaintenance: true, reason: 'AUDIT-P36C t137' });
  const T3 = r.json && r.json.id;
  log('137 create TBD transport', [r.status, T3]);
  let t3 = await tr(T3); log('137 row', t3);
  const ph = await q('select id,status,placeholder_spare,deleted_at from reservations where replacement_for_transport_id=$1', [T3]);
  log('137 placeholder rows', ph);
  r = await s.patch('/api/transports/' + T3, { status: 'completed', completedDate: d(215) });
  log('137 complete TBD transport', [r.status, r.text.slice(0, 200)]);
  log('137 placeholder after complete (expect cancelled)', await q('select id,status,placeholder_spare,deleted_at from reservations where replacement_for_transport_id=$1', [T3]));
  r = await s.get('/api/placeholder-reservations/needing-assignment');
  const need = (r.json || []).filter(x => ph.some(p => p.id === x.id));
  log('137 still in needing-assignment (expect none)', [r.status, need.map(x => x.id)]);
  if (ph[0]) {
    r = await s.post('/api/placeholder-reservations/' + ph[0].id + '/assign-vehicle', { vehicleId: vOther });
    log('137 assign-vehicle on closed placeholder (expect 4xx)', [r.status, r.text.slice(0, 200)]);
  }

  // --- BUG-142: 409 on create leaves no orphan transport ---
  const vO5 = await mk('O5'), vS5 = await mk('S5');
  r = await s.post('/api/reservations', { ...base, vehicleId: vS5, startDate: d(220), endDate: d(224) });
  log('142 spare busy reservation', [r.status, r.json && r.json.id]);
  const before = await q("select count(*)::int n from vehicle_transports where reason=$1", ['AUDIT-P36C t142']);
  r = await s.post('/api/transports', { vehicleId: vO5, transportType: 'swap', scheduledDate: d(221), spareRequired: true, relatedVehicleId: vS5, isBreakdownOrMaintenance: true, reason: 'AUDIT-P36C t142' });
  log('142 create with conflicting spare (expect 409)', [r.status, r.text.slice(0, 200)]);
  log('142 transports with that reason (expect 0)', await q("select id,status from vehicle_transports where reason=$1", ['AUDIT-P36C t142']));

  // --- BUG-140 / B-15: delete transport -> recycle bin ---
  r = await s.del('/api/transports/' + T2b);
  log('140 DELETE transport', [r.status, r.text.slice(0, 160)]);
  log('140 row gone?', await tr(T2b));
  r = await s.get('/api/deleted-records');
  const types = [...new Set((r.json || []).map(x => x.entityType || x.entity_type))];
  log('140 deleted-records entity types', [r.status, types]);
  const entry = (r.json || []).find(x => String(x.entityId || x.entity_id) === String(T2b) && /transport/.test(x.entityType || x.entity_type || ''));
  log('140 transport entry', entry ? { id: entry.id, label: entry.label } : null);
  if (entry) {
    const rr = await s.post('/api/deleted-records/' + entry.id + '/restore', {});
    log('140 restore transport', [rr.status, rr.text.slice(0, 200)]);
    log('140 row after restore', await tr(T2b));
  }

  // --- BUG-156: unknown templateId on transport report ---
  r = await s.post('/api/delivery/transports/generate-report', { transportIds: [T1], templateId: 999999 });
  log('156 generate-report unknown templateId (expect 404)', [r.status, r.text.slice(0, 200)]);

  // --- BUG-154: maintenance-status hook ---
  log('154 see p36c-10', '');
  await pool.end();
})();
