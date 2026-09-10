// P10-A: field-by-field diff of PATCH /api/reservations/:id vs PATCH /api/reservations/:id/basic.
// One reservation per route; after every field probe the DB row is restored from a
// snapshot so each probe is independent. Output: p10-a-patch-diff.out.json + table on stdout.
'use strict';
const { getAdmin, q, pool, loadIds, Report, brief } = require('./p10-lib.cjs');

const CAMEL = {};
async function colMap() {
  const cols = await q(`select column_name from information_schema.columns where table_name='reservations'`);
  for (const c of cols) CAMEL[c.column_name.replace(/_([a-z])/g, (_, ch) => ch.toUpperCase())] = c.column_name;
  // schema uses createdByUser -> created_by_user_id etc.
  CAMEL.createdByUser = 'created_by_user_id'; CAMEL.updatedByUser = 'updated_by_user_id'; CAMEL.deletedByUser = 'deleted_by_user_id';
  return cols.map(c => c.column_name);
}

async function snapshotRow(id) { const [r] = await q('select * from reservations where id=$1', [id]); return r; }
async function restoreRow(id, orig, cols) {
  const sets = cols.filter(c => c !== 'id').map((c, i) => `"${c}" = $${i + 2}`).join(', ');
  const vals = cols.filter(c => c !== 'id').map(c => orig[c]);
  // if the id itself was changed, find it back via the audit marker in notes
  await q(`update reservations set ${sets} where id=$1`, [id, ...vals]);
}

(async () => {
  const admin = await getAdmin();
  const ids = loadIds();
  const rep = new Report('p10-a-patch-diff');
  const cols = await colMap();
  const V1 = ids.vehicles['AU-101-X'], V2 = ids.vehicles['AU-102-X'], VBUSY = ids.vehicles['AU-103-X'];
  const CA = ids.customers.A, CB = ids.customers.B;

  const base = { vehicleId: V1, customerId: CA, startDate: '2027-03-01', endDate: '2027-03-05', totalPrice: 100, notes: 'AUDIT-P10-A base', type: 'standard' };
  let r = await admin.post('/api/reservations', base); if (r.status !== 201) throw new Error('create R1 ' + r.text);
  const R1 = r.json.id;
  r = await admin.post('/api/reservations', { ...base, vehicleId: V2 }); if (r.status !== 201) throw new Error('create R2 ' + r.text);
  const R2 = r.json.id;
  // a third reservation that makes VBUSY busy for the same period (conflict-bypass probes)
  r = await admin.post('/api/reservations', { ...base, vehicleId: VBUSY, customerId: CB }); if (r.status !== 201) throw new Error('create R3 ' + r.text);
  const R3 = r.json.id;
  rep.step('setup', { R1, R2, R3, V1, V2, VBUSY });

  const probes = [
    ['id', 9999999],
    ['vehicleId', V2 === undefined ? 1 : ids.vehicles['AU-118-X']],
    ['vehicleId (busy vehicle, no dates in body)', VBUSY, 'vehicleId'],
    ['vehicleId (non-existent)', 999999999, 'vehicleId'],
    ['customerId', CB],
    ['customerId (non-existent)', 999999999, 'customerId'],
    ['driverId', ids.portalDrivers[0]],
    ['driverId (non-existent)', 999999999, 'driverId'],
    ['startDate', '2027-03-02'],
    ['startDate (garbage)', 'not-a-date', 'startDate'],
    ['endDate', '2027-03-06'],
    ['endDate (before startDate)', '2027-02-01', 'endDate'],
    ['startDate+endDate onto busy period same vehicle (R3 moved onto R1 dates? no: R1 moved onto own vehicle free) ', null],
    ['startTime', '09:00'],
    ['startTime (invalid 25:99)', '25:99', 'startTime'],
    ['endTime (garbage)', 'garbage', 'endTime'],
    ['actualPickupDate', '2027-03-03'],
    ['actualReturnDate', '2027-03-03'],
    ['completionDate', '2027-03-03'],
    ['status', 'garbage'],
    ['totalPrice (negative)', -5, 'totalPrice'],
    ['totalPrice (string abc)', 'abc', 'totalPrice'],
    ['notes', 'AUDIT-P10-A edited note'],
    ['damageCheckPath', '../../../etc/passwd'],
    ['contractNumber', 'AUDIT-P10-A-CN'],
    ['type (garbage)', 'garbage', 'type'],
    ['type (maintenance_block)', 'maintenance_block', 'type'],
    ['replacementForReservationId', 1],
    ['placeholderSpare', true],
    ['spareVehicleStatus (garbage)', 'garbage', 'spareVehicleStatus'],
    ['maintenanceDuration (string)', 'abc', 'maintenanceDuration'],
    ['maintenanceStatus (garbage)', 'garbage', 'maintenanceStatus'],
    ['maintenanceCategory', 'x'],
    ['spareAssignmentDecision', 'x'],
    ['affectedRentalId', 1],
    ['portalRequestId', 1],
    ['pickupMileage (negative)', -100, 'pickupMileage'],
    ['returnMileage (below pickup)', 5, 'returnMileage'],
    ['fuelLevelPickup (garbage)', 'garbage', 'fuelLevelPickup'],
    ['fuelLevelReturn', 'full'],
    ['fuelCost (negative)', -1, 'fuelCost'],
    ['fuelCardNumber', 'CARD-1'],
    ['fuelNotes', 'n'],
    ['isRecurring', true],
    ['recurringParentId', 1],
    ['recurringFrequency (garbage)', 'garbage', 'recurringFrequency'],
    ['recurringEndDate', '2030-01-01'],
    ['recurringDayOfWeek (99)', 99, 'recurringDayOfWeek'],
    ['recurringDayOfMonth (99)', 99, 'recurringDayOfMonth'],
    ['deliveryRequired', true],
    ['deliveryAddress', 'Straat 1'],
    ['deliveryCity', 'Stad'],
    ['deliveryPostalCode', '1234AB'],
    ['deliveryFee (negative)', -1, 'deliveryFee'],
    ['deliveryStatus (garbage)', 'garbage', 'deliveryStatus'],
    ['deliveryStaffId (non-existent, FK)', 999999, 'deliveryStaffId'],
    ['deliveryNotes', 'n'],
    ['createdAt', '2000-01-01T00:00:00.000Z'],
    ['updatedAt', '2000-01-01T00:00:00.000Z'],
    ['createdBy', 'AUDIT-hacker'],
    ['updatedBy', 'AUDIT-hacker'],
    ['createdByUser (FK non-existent)', 999999, 'createdByUser'],
    ['updatedByUser (FK non-existent)', 999999, 'updatedByUser'],
    ['deletedAt', '2020-01-01T00:00:00.000Z'],
    ['deletedBy', 'AUDIT-hacker'],
    ['deletedByUser', 1],
    ['unknownField', 'x'],
    ['vehicle (nested object echo)', { id: 1, licensePlate: 'HACK' }, 'vehicle'],
    ['customer (nested object echo)', { id: 1, name: 'HACK' }, 'customer'],
  ].filter(p => p[1] !== null);

  const table = [];
  for (const [label, value, fieldOverride] of probes) {
    const field = fieldOverride || label.split(' ')[0];
    const row = { field: label };
    for (const [route, id] of [['patch', R1], ['basic', R2]]) {
      const orig = await snapshotRow(id);
      const body = route === 'basic'
        ? { vehicleId: orig.vehicle_id, customerId: orig.customer_id, startDate: orig.start_date, endDate: orig.end_date, totalPrice: 100, notes: orig.notes, type: orig.type, status: orig.status, [field]: value }
        : { [field]: value };
      const path = route === 'basic' ? `/api/reservations/${id}/basic` : `/api/reservations/${id}`;
      const res = await admin.patch(path, body);
      let after = await snapshotRow(id);
      let note = '';
      if (!after && field === 'id') {
        const [moved] = await q('select * from reservations where id=$1', [value]);
        if (moved) { note = `ROW RENUMBERED to ${value}`; await q('update reservations set id=$1 where id=$2', [id, value]); after = await snapshotRow(id); }
      }
      const col = CAMEL[field];
      const dbVal = after && col ? after[col] : undefined;
      const origVal = orig && col ? orig[col] : undefined;
      const changed = col ? JSON.stringify(dbVal) !== JSON.stringify(origVal) : null;
      row[route] = { status: res.status, changed, db: dbVal instanceof Date ? dbVal.toISOString() : dbVal, msg: res.status >= 400 ? (res.json && (res.json.message || JSON.stringify(res.json.error || '')).slice(0, 120)) : undefined, note: note || undefined };
      if (!after) row[route].note = 'ROW NO LONGER READABLE (deleted?)';
      // side effects worth flagging
      if (field === 'deliveryRequired') row[route].transports = (await q('select id,status from vehicle_transports where reservation_id=$1', [id])).map(t => `${t.id}:${t.status}`).join(',');
      if (field === 'driverId') row[route].assignments = (await q('select driver_id, assigned_until is null as open from reservation_driver_assignments where reservation_id=$1', [id])).length;
      await restoreRow(id, orig, cols);
      await q('delete from vehicle_transports where reservation_id=$1', [id]);
      await q('delete from reservation_driver_assignments where reservation_id=$1', [id]);
    }
    table.push(row);
    console.log(`${label.padEnd(58)} PATCH/:id ${row.patch.status} ${row.patch.changed ? 'WROTE ' + JSON.stringify(row.patch.db) : 'no-change'} ${row.patch.note || ''} | /basic ${row.basic.status} ${row.basic.changed ? 'WROTE ' + JSON.stringify(row.basic.db) : 'no-change'} ${row.basic.msg ? '(' + row.basic.msg + ')' : ''}`);
  }
  rep.step('table', { table });

  // conflict-bypass probes with explicit checks
  const s1 = await admin.patch(`/api/reservations/${R1}`, { vehicleId: VBUSY });
  const rowA = await snapshotRow(R1);
  const conflictsNow = await admin.get(`/api/reservations/check-conflicts?vehicleId=${VBUSY}&startDate=2027-03-01&endDate=2027-03-05`);
  rep.step('conflict bypass A: PATCH /:id {vehicleId} only onto a busy vehicle', { response: brief(s1), dbVehicle: rowA.vehicle_id, overlappingOnBusy: (conflictsNow.json || []).map(c => c.id) });
  await q('update reservations set vehicle_id=$1 where id=$2', [V1, R1]);
  // dates-only move onto a busy period on the same vehicle: R3 sits on VBUSY 03-01..03-05; create R4 on VBUSY 03-10..03-12 then move its dates
  const r4 = await admin.post('/api/reservations', { ...base, vehicleId: VBUSY, customerId: CA, startDate: '2027-03-10', endDate: '2027-03-12' });
  const R4 = r4.json.id;
  const s2 = await admin.patch(`/api/reservations/${R4}`, { startDate: '2027-03-02', endDate: '2027-03-04' });
  const rowB = await snapshotRow(R4);
  rep.step('conflict bypass B: PATCH /:id {startDate,endDate} only onto a busy period (same vehicle)', { R4, response: brief(s2), db: { start: rowB.start_date, end: rowB.end_date, vehicle: rowB.vehicle_id }, R3period: '2027-03-01..2027-03-05' });
  // the calendar drag/drop ("reschedule") sends exactly this shape - check what it sends
  const s3 = await admin.patch(`/api/reservations/${R4}`, { startDate: '2027-03-20', endDate: '2027-03-22', vehicleId: VBUSY });
  rep.step('control: PATCH /:id with vehicleId+dates onto a FREE period', { response: brief(s3, 120) });
  const s4 = await admin.patch(`/api/reservations/${R4}`, { startDate: '2027-03-02', endDate: '2027-03-04', vehicleId: VBUSY });
  rep.step('control: PATCH /:id with vehicleId+dates onto the BUSY period', { response: brief(s4, 200) });

  // /basic wrapped-body form and /basic with status only
  const s5 = await admin.patch(`/api/reservations/${R2}/basic`, { body: JSON.stringify({ vehicleId: V2, customerId: CA, startDate: '2027-03-01', endDate: '2027-03-05', notes: 'AUDIT-P10 via wrapped body' }) });
  rep.step('/basic accepts wrapped {body:"<json>"}', { response: brief(s5, 120), notes: (await snapshotRow(R2)).notes });

  // PATCH /:id with an empty body
  const s6 = await admin.patch(`/api/reservations/${R1}`, {});
  rep.step('PATCH /:id with empty body', { response: brief(s6, 150), auditRows: (await q("select count(*) from audit_logs where resource_type='reservation' and resource_id=$1", [String(R1)]))[0].count });

  rep.step('ids', { R1, R2, R3, R4 });
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
