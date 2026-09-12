// P36 agent D — BUG-173 double click (working payload) + BUG-175 precise optimistic-lock test
'use strict';
const fs = require('fs'); const path = require('path');
const L = require('./p36d-lib.cjs');

(async () => {
  const ids = L.loadIds();
  const st = await L.staff('10.36.4.36');
  const s2 = await L.staff('10.36.4.37');
  const out = {};
  const T = L.today(); const D = (n) => L.addDays(T, n);
  const stamp = Date.now();

  const mkVehicle = async (plate, brand) => {
    const ex = await L.q('select id from vehicles where license_plate=$1', [plate]);
    if (ex[0]) return ex[0].id;
    const r = await st.post('/api/vehicles', { licensePlate: plate, brand, model: 'AUDIT-P36D M', vehicleType: 'sedan', chassisNumber: 'AUDITP36D' + plate.replace(/-/g, ''), fuel: 'Benzine', currentMileage: 1000, productionDate: '2021-01-01', notes: 'AUDIT-P36D conc fixture' });
    if (r.status >= 300) throw new Error('vehicle ' + plate + ' -> ' + L.short(r));
    return r.json.id;
  };
  const mkRes = async (body) => { const r = await st.post('/api/reservations', body); if (r.status >= 300) throw new Error('res -> ' + L.short(r)); return r.json.id; };

  out.P1_maintenance_dblclick = await L.step('P1 maintenance-with-spare fired twice (BUG-173)', async () => {
    const v = await mkVehicle('AU-3DV-X', 'AUDIT-P36D CV');
    const spare = await mkVehicle('AU-3DW-X', 'AUDIT-P36D CW');
    const rid = await mkRes({ vehicleId: v, customerId: ids.cNormal, startDate: D(250), endDate: D(260), totalPrice: 400, notes: 'AUDIT-P36D maint dbl ' + stamp });
    const body = {
      maintenanceData: { vehicleId: v, startDate: D(252), endDate: D(254), type: 'maintenance_block', notes: 'AUDIT-P36D maint block dbl ' + stamp },
      conflictingReservations: [rid],
      spareVehicleAssignments: [{ reservationId: rid, spareVehicleId: spare, startDate: D(252), endDate: D(254) }],
    };
    const [a, b] = await Promise.all([st.post('/api/reservations/maintenance-with-spare', body), s2.post('/api/reservations/maintenance-with-spare', body)]);
    const blocks = await L.q("select id, vehicle_id, type, status, start_date, end_date from reservations where vehicle_id=$1 and deleted_at is null and type <> 'standard'", [v]);
    const allOnV = await L.q('select id, type, status, start_date, end_date from reservations where vehicle_id=$1 and deleted_at is null', [v]);
    const spares = await L.q('select id, vehicle_id, type, start_date, end_date, replacement_for_reservation_id from reservations where vehicle_id=$1 and deleted_at is null', [spare]);
    return { v, spare, rid, statuses: [a.status, b.status], bodies: [a.text.slice(0, 180), b.text.slice(0, 180)], blocks, allOnV, spares };
  });

  out.P2_template_lock = await L.step('P2 pdf-template optimistic lock with exact updatedAt (BUG-175)', async () => {
    const row0 = (await L.q('select id, name, updated_at from pdf_templates where id=$1', [ids.tplFull]))[0];
    const g = await st.get('/api/pdf-templates/' + ids.tplFull);
    const exact = new Date(row0.updated_at).toISOString();
    const a = await st.patch('/api/pdf-templates/' + ids.tplFull, Object.assign({}, g.json, { updatedAt: exact, name: 'AUDIT-P36D tpl LOCK-A' }));
    const row1 = (await L.q('select name, updated_at from pdf_templates where id=$1', [ids.tplFull]))[0];
    // tab B still holds the pre-A copy
    const b = await s2.patch('/api/pdf-templates/' + ids.tplFull, Object.assign({}, g.json, { updatedAt: exact, name: 'AUDIT-P36D tpl LOCK-B' }));
    const row2 = (await L.q('select name from pdf_templates where id=$1', [ids.tplFull]))[0];
    await st.patch('/api/pdf-templates/' + ids.tplFull, { name: 'AUDIT-P36D full fields' });
    return { getUpdatedAt: g.json && g.json.updatedAt, sqlUpdatedAt: row0.updated_at, sentIso: exact,
             aStatus: a.status, aBody: a.text.slice(0, 160), nameAfterA: row1.name,
             bStatus: b.status, bBody: b.text.slice(0, 160), nameAfterB: row2.name };
  });

  console.log(JSON.stringify(out, null, 1));
  fs.writeFileSync(path.join(__dirname, 'p36d-14-conc4.out.json'), JSON.stringify(out, null, 1));
  await L.pool.end();
})().catch(async (e) => { console.error('FAILED', e); try { await L.pool.end(); } catch {} process.exit(1); });
