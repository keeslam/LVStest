// P36 agent D — follow-ups: BUG-173 payload, BUG-175 single save, BUG-188 delete without live rental
'use strict';
const fs = require('fs'); const path = require('path');
const L = require('./p36d-lib.cjs');

(async () => {
  const ids = L.loadIds();
  const st = await L.staff('10.36.4.34');
  const s2 = await L.staff('10.36.4.35');
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

  out.N1_maintenance_single = await L.step('N1 maintenance-with-spare, single call (find working payload)', async () => {
    const v = await mkVehicle('AU-3DR-X', 'AUDIT-P36D CR');
    const spare = await mkVehicle('AU-3DS-X', 'AUDIT-P36D CS');
    const rid = await mkRes({ vehicleId: v, customerId: ids.cNormal, startDate: D(230), endDate: D(240), totalPrice: 400, notes: 'AUDIT-P36D maint single ' + stamp });
    const variants = [
      { label: 'status maintenance_block', maintenanceData: { vehicleId: v, startDate: D(232), endDate: D(234), status: 'maintenance_block', type: 'maintenance_block', maintenanceType: 'maintenance', notes: 'AUDIT-P36D block A ' + stamp } },
      { label: 'type only', maintenanceData: { vehicleId: v, startDate: D(232), endDate: D(234), type: 'maintenance_block', notes: 'AUDIT-P36D block B ' + stamp } },
      { label: 'customerId + status', maintenanceData: { vehicleId: v, customerId: ids.cNormal, startDate: D(232), endDate: D(234), status: 'maintenance_block', type: 'maintenance_block', notes: 'AUDIT-P36D block C ' + stamp } },
    ];
    const res = [];
    for (const vr of variants) {
      const r = await st.post('/api/reservations/maintenance-with-spare', { maintenanceData: vr.maintenanceData, conflictingReservations: [rid], spareVehicleAssignments: [{ reservationId: rid, spareVehicleId: spare, startDate: D(232), endDate: D(234) }] });
      res.push({ label: vr.label, status: r.status, body: r.text.slice(0, 250) });
      if (r.status < 300) break;
    }
    return { v, spare, rid, res };
  });

  out.N2_template_single = await L.step('N2 single full-row pdf-template save (BUG-175 control)', async () => {
    const g = await st.get('/api/pdf-templates/' + ids.tplFull);
    const a = await st.patch('/api/pdf-templates/' + ids.tplFull, Object.assign({}, g.json, { name: 'AUDIT-P36D tpl SOLO-A' }));
    const row = (await L.q('select name from pdf_templates where id=$1', [ids.tplFull]))[0];
    await st.patch('/api/pdf-templates/' + ids.tplFull, { name: 'AUDIT-P36D full fields' });
    return { status: a.status, body: a.text.slice(0, 220), nameAfter: row.name, keys: Object.keys(g.json || {}) };
  });

  out.N3_delete_no_live = await L.step('N3 two parallel deletes of a vehicle without live rentals (BUG-188)', async () => {
    const plate = 'AU-3DU-X';
    const v = await mkVehicle(plate, 'AUDIT-P36D CU');
    await mkRes({ vehicleId: v, customerId: ids.cNormal, startDate: '2020-02-01', endDate: '2020-02-05', totalPrice: 100, notes: 'AUDIT-P36D past rental ' + stamp });
    const body = { confirmLicensePlate: plate };
    const [a, b] = await Promise.all([st.del('/api/vehicles/' + v, body), s2.del('/api/vehicles/' + v, body)]);
    const snaps = await L.q("select id, entity_type, entity_id, related_counts::text as rc from deleted_records where entity_type='vehicle' and entity_id=$1", [v]);
    const audits = await L.q("select id, action, status from audit_logs where resource_type='vehicle' and resource_id=$1 order by id", [String(v)]);
    const veh = await L.q('select id from vehicles where id=$1', [v]);
    return { v, statuses: [a.status, b.status], bodies: [a.text.slice(0, 180), b.text.slice(0, 180)],
             snapshots: snaps.length, snapshotRows: snaps, audits: audits.map(x => x.action + ':' + x.status), vehicleStillThere: veh.length };
  });

  console.log(JSON.stringify(out, null, 1));
  fs.writeFileSync(path.join(__dirname, 'p36d-13-conc3.out.json'), JSON.stringify(out, null, 1));
  await L.pool.end();
})().catch(async (e) => { console.error('FAILED', e); try { await L.pool.end(); } catch {} process.exit(1); });
