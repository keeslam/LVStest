// P36 agent D — concurrency cluster (BUG-159, 172, 173, 174, 175, 188)
'use strict';
const fs = require('fs'); const path = require('path');
const L = require('./p36d-lib.cjs');

(async () => {
  const ids = L.loadIds();
  const st = await L.staff('10.36.4.30');
  const s2 = await L.staff('10.36.4.31');
  const out = {};
  const T = L.today(); const D = (n) => L.addDays(T, n);

  const mkVehicle = async (plate, brand, extra = {}) => {
    const ex = await L.q('select id from vehicles where license_plate=$1', [plate]);
    if (ex[0]) return ex[0].id;
    const r = await st.post('/api/vehicles', Object.assign({ licensePlate: plate, brand, model: 'AUDIT-P36D M', vehicleType: 'sedan', chassisNumber: 'AUDITP36D' + plate.replace(/-/g, ''), fuel: 'Benzine', currentMileage: 1000, productionDate: '2021-01-01', notes: 'AUDIT-P36D conc fixture' }, extra));
    if (r.status >= 300) throw new Error('vehicle ' + plate + ' -> ' + L.short(r));
    return r.json.id;
  };
  const mkRes = async (body) => { const r = await st.post('/api/reservations', body); if (r.status >= 300) throw new Error('res -> ' + L.short(r)); return r.json.id; };

  out.K1_parallel_move = await L.step('K1 two parallel moves onto one vehicle/period (BUG-159)', async () => {
    const vA = await mkVehicle('AU-3DA-X', 'AUDIT-P36D CA');
    const vB = await mkVehicle('AU-3DB-X', 'AUDIT-P36D CB');
    const vT = await mkVehicle('AU-3DT-X', 'AUDIT-P36D CT');
    const start = D(120), end = D(125);
    const r1 = await mkRes({ vehicleId: vA, customerId: ids.cNormal, startDate: start, endDate: end, totalPrice: 100, notes: 'AUDIT-P36D conc A ' + Date.now() });
    const r2 = await mkRes({ vehicleId: vB, customerId: ids.cNormal, startDate: start, endDate: end, totalPrice: 100, notes: 'AUDIT-P36D conc B ' + Date.now() });
    const body = { vehicleId: vT, startDate: start, endDate: end };
    const [a, b] = await Promise.all([st.patch('/api/reservations/' + r1, body), s2.patch('/api/reservations/' + r2, body)]);
    const rows = await L.q("select id, vehicle_id, start_date, end_date, status from reservations where vehicle_id=$1 and deleted_at is null and status in ('booked','picked_up')", [vT]);
    return { vT, r1, r2, statuses: [a.status, b.status], bodies: [a.text.slice(0, 140), b.text.slice(0, 140)], rowsOnTarget: rows };
  });

  out.K2_lost_update = await L.step('K2 two full-form saves of different fields (BUG-172)', async () => {
    const v = await mkVehicle('AU-3DC-X', 'AUDIT-P36D CC');
    const rid = await mkRes({ vehicleId: v, customerId: ids.cNormal, startDate: D(130), endDate: D(133), totalPrice: 500, notes: 'AUDIT-P36D lost-update ' + Date.now() });
    const g1 = await st.get('/api/reservations/' + rid);
    const g2 = await s2.get('/api/reservations/' + rid);
    const bodyA = Object.assign({}, g1.json, { notes: 'AUDIT-P36D NOTES-FROM-A' });
    const bodyB = Object.assign({}, g2.json, { totalPrice: '999.99' });
    const seqA = await st.patch('/api/reservations/' + rid, bodyA);
    const seqB = await s2.patch('/api/reservations/' + rid, bodyB);
    const row = (await L.q('select id, notes, total_price from reservations where id=$1', [rid]))[0];
    return { rid, seq: [seqA.status, seqB.status], bodies: [seqA.text.slice(0, 140), seqB.text.slice(0, 140)], row };
  });

  out.K3_maintenance_dblclick = await L.step('K3 maintenance-with-spare double click (BUG-173)', async () => {
    const v = await mkVehicle('AU-3DD-X', 'AUDIT-P36D CD');
    const spare = await mkVehicle('AU-3DE-X', 'AUDIT-P36D CE');
    const rid = await mkRes({ vehicleId: v, customerId: ids.cNormal, startDate: D(140), endDate: D(150), totalPrice: 400, notes: 'AUDIT-P36D maint base ' + Date.now() });
    const body = { vehicleId: v, startDate: D(142), endDate: D(144), maintenanceType: 'maintenance_block', notes: 'AUDIT-P36D maintenance block', spareVehicleId: spare, affectedReservationIds: [rid], assignSpare: true, type: 'maintenance_block' };
    const [a, b] = await Promise.all([st.post('/api/reservations/maintenance-with-spare', body), s2.post('/api/reservations/maintenance-with-spare', body)]);
    const blocks = await L.q("select id, vehicle_id, type, status, start_date, end_date from reservations where vehicle_id=$1 and deleted_at is null", [v]);
    const spares = await L.q('select id, vehicle_id, start_date, end_date from reservations where vehicle_id=$1 and deleted_at is null', [spare]);
    return { statuses: [a.status, b.status], bodies: [a.text.slice(0, 220), b.text.slice(0, 220)], blocks, spares };
  });

  out.K4_parallel_pickup = await L.step('K4 two parallel pickups, different contract numbers (BUG-174)', async () => {
    const v = await mkVehicle('AU-3DF-X', 'AUDIT-P36D CF');
    const rid = await mkRes({ vehicleId: v, customerId: ids.cNormal, startDate: T, endDate: D(3), totalPrice: 300, notes: 'AUDIT-P36D pickup race ' + Date.now() });
    const before = await L.q('select max(id) m from documents');
    const [a, b] = await Promise.all([
      st.post('/api/reservations/' + rid + '/pickup', { contractNumber: 'AUDIT-P36D-4e-A', departureMileage: 1500, actualPickupDate: T }),
      s2.post('/api/reservations/' + rid + '/pickup', { contractNumber: 'AUDIT-P36D-4e-B', departureMileage: 1600, actualPickupDate: T }),
    ]);
    const row = (await L.q('select id, status, contract_number, pickup_mileage from reservations where id=$1', [rid]))[0];
    const docs = await L.q('select id, reservation_id, document_type from documents where id > $1 and reservation_id=$2', [before[0].m || 0, rid]);
    return { rid, statuses: [a.status, b.status], bodies: [a.text.slice(0, 180), b.text.slice(0, 180)], row, docs };
  });

  out.K5_settings_race = await L.step('K5 concurrent system-settings + pdf-template saves (BUG-175)', async () => {
    const cur = await st.get('/api/system-settings');
    const base = cur.json || {};
    const A = Object.assign({}, base, { companyName: 'AUDIT-P36D-A' });
    const B = Object.assign({}, base, { companyPhone: 'AUDIT-P36D-B-PHONE' });
    const [a, b] = await Promise.all([st.put('/api/system-settings', A), s2.put('/api/system-settings', B)]);
    const after = await st.get('/api/system-settings');
    const tplBefore = await st.get('/api/pdf-templates/' + ids.tplFull);
    // full-form saves, the shape the editor sends: each tab PUTs the whole row it read earlier
    const tplRow = tplBefore.json || {};
    const fieldsA = JSON.parse(JSON.stringify(tplRow.fields || []));
    const fieldsB = JSON.parse(JSON.stringify(tplRow.fields || []));
    if (fieldsB[0]) fieldsB[0].name = 'AUDIT-P36D RENAMED FIELD FROM B';
    const tA = Object.assign({}, tplRow, { name: 'AUDIT-P36D full fields RENAMED-A', fields: JSON.stringify(fieldsA) });
    const tB = Object.assign({}, tplRow, { fields: JSON.stringify(fieldsB) });
    const [ta, tb] = await Promise.all([st.patch('/api/pdf-templates/' + ids.tplFull, tA), s2.patch('/api/pdf-templates/' + ids.tplFull, tB)]);
    const tplAfterRow = (await L.q('select id, name, fields::text as f from pdf_templates where id=$1', [ids.tplFull]))[0];
    const tplAfter = [{ id: tplAfterRow.id, name: tplAfterRow.name }];
    const keptBField = String(tplAfterRow.f || '').includes('AUDIT-P36D RENAMED FIELD FROM B');
    await st.patch('/api/pdf-templates/' + ids.tplFull, { name: 'AUDIT-P36D full fields' });
    return { settingsBase: { companyName: base.companyName, companyPhone: base.companyPhone },
             settings: { statuses: [a.status, b.status], companyName: after.json && after.json.companyName, companyPhone: after.json && after.json.companyPhone },
             templates: { statuses: [ta.status, tb.status], bodies: [ta.text.slice(0, 120), tb.text.slice(0, 120)], nameAfter: tplAfter[0] && tplAfter[0].name, keptBField } };
  });

  out.K6_parallel_delete = await L.step('K6 two parallel vehicle deletes (BUG-188)', async () => {
    const v = await mkVehicle('AU-3DG-X', 'AUDIT-P36D CG');
    await mkRes({ vehicleId: v, customerId: ids.cNormal, startDate: D(200), endDate: D(203), totalPrice: 100, notes: 'AUDIT-P36D delete race ' + Date.now() });
    const [a, b] = await Promise.all([st.del('/api/vehicles/' + v), s2.del('/api/vehicles/' + v)]);
    const snaps = await L.q("select id, entity_type, entity_id from deleted_records where entity_type='vehicle' and entity_id=$1", [v]);
    const audits = await L.q("select id, action, status from audit_logs where resource_type='vehicle' and resource_id=$1::text", [v]);
    return { v, statuses: [a.status, b.status], bodies: [a.text.slice(0, 160), b.text.slice(0, 160)], snapshots: snaps.length, snapshotIds: snaps.map(s => s.id), auditRows: audits.map(x => x.action) };
  });

  console.log(JSON.stringify(out, null, 1));
  fs.writeFileSync(path.join(__dirname, 'p36d-11-conc.out.json'), JSON.stringify(out, null, 1));
  await L.pool.end();
})().catch(async (e) => { console.error('FAILED', e); try { await L.pool.end(); } catch {} process.exit(1); });
