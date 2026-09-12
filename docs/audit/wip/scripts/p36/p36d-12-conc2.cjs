// P36 agent D — concurrency cluster, corrected payloads (BUG-160, 172, 173, 174, 175, 188, 189)
'use strict';
const fs = require('fs'); const path = require('path');
const L = require('./p36d-lib.cjs');

(async () => {
  const ids = L.loadIds();
  const st = await L.staff('10.36.4.32');
  const s2 = await L.staff('10.36.4.33');
  const out = {};
  const T = L.today(); const D = (n) => L.addDays(T, n);
  const stamp = Date.now();

  const mkVehicle = async (plate, brand, extra = {}) => {
    const ex = await L.q('select id from vehicles where license_plate=$1', [plate]);
    if (ex[0]) return ex[0].id;
    const r = await st.post('/api/vehicles', Object.assign({ licensePlate: plate, brand, model: 'AUDIT-P36D M', vehicleType: 'sedan', chassisNumber: 'AUDITP36D' + plate.replace(/-/g, ''), fuel: 'Benzine', currentMileage: 1000, productionDate: '2021-01-01', notes: 'AUDIT-P36D conc fixture' }, extra));
    if (r.status >= 300) throw new Error('vehicle ' + plate + ' -> ' + L.short(r));
    return r.json.id;
  };
  const mkRes = async (body) => { const r = await st.post('/api/reservations', body); if (r.status >= 300) throw new Error('res -> ' + L.short(r)); return r.json.id; };

  // ---- BUG-172: two tabs, each saving the whole row it read earlier ----
  out.M1_lost_update = await L.step('M1 stale full-row save reverts the other tab (BUG-172)', async () => {
    const v = await mkVehicle('AU-3DH-X', 'AUDIT-P36D CH');
    const rid = await mkRes({ vehicleId: v, customerId: ids.cNormal, startDate: D(160), endDate: D(163), totalPrice: 500, notes: 'AUDIT-P36D original notes ' + stamp });
    const g1 = await st.get('/api/reservations/' + rid);
    const g2 = await s2.get('/api/reservations/' + rid);          // tab B reads the same row
    const a = await st.patch('/api/reservations/' + rid, Object.assign({}, g1.json, { notes: 'AUDIT-P36D NOTES-FROM-A' }));
    const rowMid = (await L.q('select notes, total_price from reservations where id=$1', [rid]))[0];
    const b = await s2.patch('/api/reservations/' + rid, Object.assign({}, g2.json, { totalPrice: '999.99' })); // stale copy
    const rowEnd = (await L.q('select notes, total_price from reservations where id=$1', [rid]))[0];
    return { rid, aStatus: a.status, aNotesEcho: a.json && a.json.notes, rowAfterA: rowMid,
             bStatus: b.status, bBody: b.text.slice(0, 200), rowAfterB: rowEnd,
             aChangeSurvived: rowEnd.notes === 'AUDIT-P36D NOTES-FROM-A' };
  });

  // ---- BUG-173 / BUG-160: maintenance-with-spare double click ----
  out.M2_maintenance = await L.step('M2 maintenance-with-spare fired twice (BUG-173/160)', async () => {
    const v = await mkVehicle('AU-3DJ-X', 'AUDIT-P36D CJ');
    const spare = await mkVehicle('AU-3DK-X', 'AUDIT-P36D CK');
    const rid = await mkRes({ vehicleId: v, customerId: ids.cNormal, startDate: D(170), endDate: D(180), totalPrice: 400, notes: 'AUDIT-P36D maint base ' + stamp });
    const body = {
      maintenanceData: { vehicleId: v, startDate: D(172), endDate: D(174), type: 'maintenance_block', status: 'maintenance_block', maintenanceType: 'maintenance', notes: 'AUDIT-P36D maintenance block ' + stamp },
      conflictingReservations: [rid],
      spareVehicleAssignments: [{ reservationId: rid, spareVehicleId: spare, startDate: D(172), endDate: D(174) }],
    };
    const [a, b] = await Promise.all([st.post('/api/reservations/maintenance-with-spare', body), s2.post('/api/reservations/maintenance-with-spare', body)]);
    const blocks = await L.q('select id, vehicle_id, type, status, start_date, end_date from reservations where vehicle_id=$1 and deleted_at is null', [v]);
    const spares = await L.q('select id, vehicle_id, type, start_date, end_date, replacement_for_reservation_id from reservations where vehicle_id=$1 and deleted_at is null', [spare]);
    return { statuses: [a.status, b.status], bodies: [a.text.slice(0, 250), b.text.slice(0, 250)], blocks, spares };
  });

  // ---- BUG-160: two parallel spare claims on one spare (assign-spare) ----
  out.M3_spare_race = await L.step('M3 two parallel assign-spare claims on one spare (BUG-160)', async () => {
    const v1 = await mkVehicle('AU-3DL-X', 'AUDIT-P36D CL');
    const v2 = await mkVehicle('AU-3DM-X', 'AUDIT-P36D CM');
    const spare = await mkVehicle('AU-3DN-X', 'AUDIT-P36D CN');
    const r1 = await mkRes({ vehicleId: v1, customerId: ids.cNormal, startDate: D(190), endDate: D(195), totalPrice: 100, notes: 'AUDIT-P36D spare race 1 ' + stamp });
    const r2 = await mkRes({ vehicleId: v2, customerId: ids.cNormal, startDate: D(190), endDate: D(195), totalPrice: 100, notes: 'AUDIT-P36D spare race 2 ' + stamp });
    const body = (rid) => ({ spareVehicleId: spare, startDate: D(190), endDate: D(195), reservationId: rid });
    const [a, b] = await Promise.all([
      st.post('/api/reservations/' + r1 + '/assign-spare', body(r1)),
      s2.post('/api/reservations/' + r2 + '/assign-spare', body(r2)),
    ]);
    const rows = await L.q('select id, vehicle_id, start_date, end_date, replacement_for_reservation_id from reservations where vehicle_id=$1 and deleted_at is null', [spare]);
    return { r1, r2, spare, statuses: [a.status, b.status], bodies: [a.text.slice(0, 220), b.text.slice(0, 220)], spareRows: rows };
  });

  // ---- BUG-174: two parallel pickups, different contract numbers ----
  out.M4_pickup = await L.step('M4 two parallel pickups (BUG-174)', async () => {
    const v = await mkVehicle('AU-3DP-X', 'AUDIT-P36D CP');
    const rid = await mkRes({ vehicleId: v, customerId: ids.cNormal, startDate: T, endDate: D(3), totalPrice: 300, notes: 'AUDIT-P36D pickup race ' + stamp });
    const before = await L.q('select max(id) m from documents');
    const [a, b] = await Promise.all([
      st.post('/api/reservations/' + rid + '/pickup', { contractNumber: 'AUDIT-P36D-A-' + stamp, pickupMileage: 1500, fuelLevelPickup: 'Full', actualPickupDate: T }),
      s2.post('/api/reservations/' + rid + '/pickup', { contractNumber: 'AUDIT-P36D-B-' + stamp, pickupMileage: 1600, fuelLevelPickup: 'Full', actualPickupDate: T }),
    ]);
    const row = (await L.q('select id, status, contract_number, pickup_mileage from reservations where id=$1', [rid]))[0];
    const docs = await L.q('select id, reservation_id, document_type, version from documents where id > $1 and reservation_id=$2', [before[0].m || 0, rid]);
    return { rid, statuses: [a.status, b.status], bodies: [a.text.slice(0, 200), b.text.slice(0, 200)], row, contractDocs: docs };
  });

  // ---- BUG-175: stale full-row save of a pdf template ----
  out.M5_template_stale = await L.step('M5 stale full-row template save (BUG-175)', async () => {
    const gA = await st.get('/api/pdf-templates/' + ids.tplFull);
    const gB = await s2.get('/api/pdf-templates/' + ids.tplFull);   // tab B reads the same row
    const a = await st.patch('/api/pdf-templates/' + ids.tplFull, Object.assign({}, gA.json, { name: 'AUDIT-P36D tpl RENAMED-A' }));
    const fieldsB = JSON.parse(JSON.stringify((gB.json && gB.json.fields) || []));
    if (fieldsB[0]) fieldsB[0].name = 'AUDIT-P36D FIELD-FROM-B';
    const b = await s2.patch('/api/pdf-templates/' + ids.tplFull, Object.assign({}, gB.json, { fields: JSON.stringify(fieldsB) }));
    const row = (await L.q('select id, name, fields::text as f from pdf_templates where id=$1', [ids.tplFull]))[0];
    await st.patch('/api/pdf-templates/' + ids.tplFull, { name: 'AUDIT-P36D full fields' });
    return { aStatus: a.status, bStatus: b.status, bBody: b.text.slice(0, 200), nameAfter: row.name,
             aNameSurvived: row.name === 'AUDIT-P36D tpl RENAMED-A', bFieldPresent: String(row.f).includes('AUDIT-P36D FIELD-FROM-B') };
  });

  // ---- BUG-188: two parallel vehicle deletes ----
  out.M6_delete = await L.step('M6 two parallel vehicle deletes (BUG-188)', async () => {
    const plate = 'AU-3DQ-X';
    const v = await mkVehicle(plate, 'AUDIT-P36D CQ');
    await mkRes({ vehicleId: v, customerId: ids.cNormal, startDate: D(210), endDate: D(213), totalPrice: 100, notes: 'AUDIT-P36D delete race ' + stamp });
    const body = { confirmLicensePlate: plate };
    const [a, b] = await Promise.all([st.del('/api/vehicles/' + v, body), s2.del('/api/vehicles/' + v, body)]);
    const snaps = await L.q("select id, entity_type, entity_id, label from deleted_records where entity_type='vehicle' and entity_id=$1", [v]);
    const audits = await L.q("select id, action, status from audit_logs where resource_type='vehicle' and resource_id=$1::text order by id", [String(v)]);
    const veh = await L.q('select id from vehicles where id=$1', [v]);
    return { v, statuses: [a.status, b.status], bodies: [a.text.slice(0, 180), b.text.slice(0, 180)],
             snapshots: snaps.length, snapshotIds: snaps.map(s => s.id), audits: audits.map(x => x.action + ':' + x.status), vehicleStillThere: veh.length };
  });

  // ---- BUG-189: two parallel password changes ----
  out.M7_password = await L.step('M7 two parallel change-password calls (BUG-189)', async () => {
    const uname = 'AUDIT-P36D-pw';
    const pw0 = 'AuditP36D!pw0';
    let uid;
    const ex = await L.q('select id from users where username=$1', [uname]);
    if (ex[0]) { uid = ex[0].id; } else {
      const r = await st.post('/api/users', { username: uname, password: pw0, fullName: 'AUDIT P36D pw', email: 'audit-p36d-pw@example.invalid', role: 'user', permissions: ['view_vehicles'], active: true });
      if (r.status >= 300) return { createUser: L.short(r, 300) };
      uid = r.json.id;
    }
    // reset to the known password through the admin route so the test is repeatable
    await st.patch('/api/users/' + uid, { password: pw0 });
    const t1 = new L.Session('pw1', { fakeIp: '10.36.4.41' });
    const t2 = new L.Session('pw2', { fakeIp: '10.36.4.42' });
    const l1 = await t1.loginStaff(uname, pw0);
    const l2 = await t2.loginStaff(uname, pw0);
    if (l1.status !== 200 || l2.status !== 200) return { logins: [l1.status, l2.status], body: l1.text.slice(0, 200) };
    const [a, b] = await Promise.all([
      t1.post('/api/users/change-password', { currentPassword: pw0, newPassword: 'AuditP36D!pwA' }),
      t2.post('/api/users/change-password', { currentPassword: pw0, newPassword: 'AuditP36D!pwB' }),
    ]);
    const tryLogin = async (pw, ip) => { const s = new L.Session('t', { fakeIp: ip }); const r = await s.loginStaff(uname, pw, { skipPrime: true }); return r.status; };
    const loginA = await tryLogin('AuditP36D!pwA', '10.36.4.43');
    const loginB = await tryLogin('AuditP36D!pwB', '10.36.4.44');
    return { statuses: [a.status, b.status], bodies: [a.text.slice(0, 160), b.text.slice(0, 160)], loginWithA: loginA, loginWithB: loginB };
  });

  console.log(JSON.stringify(out, null, 1));
  fs.writeFileSync(path.join(__dirname, 'p36d-12-conc2.out.json'), JSON.stringify(out, null, 1));
  await L.pool.end();
})().catch(async (e) => { console.error('FAILED', e); try { await L.pool.end(); } catch {} process.exit(1); });
