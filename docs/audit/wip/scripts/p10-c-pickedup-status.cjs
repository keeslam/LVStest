// P10-C: edits on picked_up reservations (customer / vehicle), 'returned' vs 'completed'
// consistency, edits on completed reservations + audit trail, /basic duplicate contract
// number, PK renumber with child rows.
'use strict';
const { getAdmin, q, pool, loadIds, Report, brief, today, addDays, everywhereSnapshot, summarize } = require('./p10-lib.cjs');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const admin = await getAdmin();
  const ids = loadIds();
  const rep = new Report('p10-c-pickedup-status');
  const T = today();
  const CA = ids.customers.A, CB = ids.customers.B;
  const V111 = ids.vehicles['AU-111-X'], V112 = ids.vehicles['AU-112-X'], V113 = ids.vehicles['AU-113-X'], V114 = ids.vehicles['AU-114-X'];
  const cn = (s) => `AUDIT-P10-C-${s}-${Date.now().toString().slice(-6)}`;
  const vstat = async (id) => (await q('select availability_status, current_mileage from vehicles where id=$1', [id]))[0];

  // ---- C1 picked_up: change customer, change vehicle ----
  let r = await admin.post('/api/reservations', { vehicleId: V111, customerId: CA, driverId: ids.portalDrivers[0], startDate: T, endDate: addDays(T, 4), totalPrice: 200, notes: 'AUDIT-P10-C1' });
  const C1 = r.json.id;
  r = await admin.post(`/api/reservations/${C1}/pickup`, { contractNumber: cn('C1'), pickupMileage: 11000, fuelLevelPickup: 'full' });
  const docsBefore = (await q('select count(*)::int as n from documents where reservation_id=$1', [C1]))[0].n;
  r = await admin.patch(`/api/reservations/${C1}`, { customerId: CB });
  await sleep(4000);
  let snap = await everywhereSnapshot(admin, C1);
  rep.step('C1a change customer on a picked_up reservation (PATCH /:id {customerId})', { response: brief(r, 60), everywhere: summarize(snap), docsBefore, docsAfterRegen: snap.documents.map(d => d.document_type + ':' + d.file_name), audit: snap.auditLog.map(a => ({ action: a.action, changes: a.changes })) });
  r = await admin.patch(`/api/reservations/${C1}`, { vehicleId: V112, startDate: T, endDate: addDays(T, 4) });
  await sleep(4000);
  snap = await everywhereSnapshot(admin, C1);
  rep.step('C1b change vehicle on a picked_up reservation (PATCH /:id {vehicleId,dates})', { response: brief(r, 60), everywhere: summarize(snap), oldVehicle: { id: V111, ...(await vstat(V111)) }, newVehicle: { id: V112, ...(await vstat(V112)) }, docs: snap.documents.map(d => `${d.document_type}:${d.file_name} v=${d.vehicle_id}`), contractNumberKept: snap.row.contract_number });
  const viaBasic = await admin.patch(`/api/reservations/${C1}/basic`, { vehicleId: V111, customerId: CB, startDate: T, endDate: addDays(T, 4), status: 'picked_up', totalPrice: 200 });
  await sleep(1000);
  rep.step('C1c change vehicle back via /basic on picked_up', { response: brief(viaBasic, 60), oldVehicleNow: { id: V112, ...(await vstat(V112)) }, newVehicleNow: { id: V111, ...(await vstat(V111)) }, row: (await q('select vehicle_id, status from reservations where id=$1', [C1]))[0] });

  // ---- C2 'returned' vs 'completed' ----
  r = await admin.post('/api/reservations', { vehicleId: V113, customerId: CA, startDate: addDays(T, -8), endDate: addDays(T, -6), totalPrice: 100, notes: 'AUDIT-P10-C2 returned' });
  const C2 = r.json.id;
  await admin.post(`/api/reservations/${C2}/pickup`, { contractNumber: cn('C2'), pickupMileage: 13000, fuelLevelPickup: 'full' });
  r = await admin.post(`/api/reservations/${C2}/return`, { returnMileage: 13100, fuelLevelReturn: 'full', returnDate: addDays(T, -5) });
  snap = await everywhereSnapshot(admin, C2);
  const bookAfterReturn = await admin.post('/api/reservations', { vehicleId: V113, customerId: CB, startDate: addDays(T, 30), endDate: addDays(T, 32), notes: 'AUDIT-P10-C2 after return' });
  rep.step('C2a POST /return leaves status "returned" (returnDate today-5); then book the vehicle for next month', { ret: brief(r, 60), everywhere: summarize(snap), row: { status: snap.row.status, end: snap.row.end_date, ar: snap.row.actual_return_date }, newBookingOnVehicle: brief(bookAfterReturn, 200) });
  const toCompleted = await admin.patch(`/api/reservations/${C2}/status`, { status: 'completed' });
  const rowC2 = (await q('select status, end_date, actual_return_date, completion_date, return_mileage from reservations where id=$1', [C2]))[0];
  const bookAfterCompleted = await admin.post('/api/reservations', { vehicleId: V113, customerId: CB, startDate: addDays(T, 30), endDate: addDays(T, 32), notes: 'AUDIT-P10-C2 after completed' });
  rep.step('C2b returned -> completed via /status, then book again', { toCompleted: brief(toCompleted, 60), row: rowC2, newBookingOnVehicle: brief(bookAfterCompleted, 100) });
  const existingReturned = await q(`select id, vehicle_id, end_date from reservations where status='returned' and deleted_at is null and end_date < to_char(current_date - 3, 'YYYY-MM-DD') and id < 3300 order by id limit 5`);
  let legacyProbe = null;
  if (existingReturned.length) {
    const v = existingReturned[0].vehicle_id;
    legacyProbe = { vehicle: v, guard: brief(await admin.get(`/api/reservations/overdue/${v}`), 200) };
  }
  rep.step('C2c pre-existing "returned" rows in the clone that the overdue-vehicle guard treats as overdue', { existingReturned, legacyProbe });

  // completed via /status directly from picked_up (no /return): compare the row shape
  r = await admin.post('/api/reservations', { vehicleId: V114, customerId: CA, startDate: addDays(T, -3), endDate: addDays(T, 2), totalPrice: 300, notes: 'AUDIT-P10-C3 completed' });
  const C3 = r.json.id;
  await admin.post(`/api/reservations/${C3}/pickup`, { contractNumber: cn('C3'), pickupMileage: 14000, fuelLevelPickup: 'full' });
  r = await admin.patch(`/api/reservations/${C3}/status`, { status: 'completed', departureMileage: 14500 });
  snap = await everywhereSnapshot(admin, C3);
  rep.step('C2d picked_up -> completed via /status (no /return)', { response: brief(r, 60), row: { status: snap.row.status, end: snap.row.end_date, ar: snap.row.actual_return_date, cd: snap.row.completion_date, returnMileage: (await q('select return_mileage from reservations where id=$1', [C3]))[0].return_mileage }, everywhere: summarize(snap), vehicle: await vstat(V114) });

  // ---- C3 edits on a completed reservation + audit ----
  const auditBefore = (await q("select count(*)::int as n from audit_logs where resource_type='reservation' and resource_id=$1", [String(C3)]))[0].n;
  const e1 = await admin.patch(`/api/reservations/${C3}`, { notes: 'AUDIT-P10-C3 edited after completion', totalPrice: 999, startTime: '08:00', endTime: '17:00' });
  const e2 = await admin.patch(`/api/reservations/${C3}/basic`, { vehicleId: V114, customerId: CA, startDate: addDays(T, -3), endDate: T, status: 'completed', totalPrice: 1234, notes: 'AUDIT-P10-C3 edited via basic', startTime: '07:00' });
  const e3 = await admin.patch(`/api/reservations/${C3}`, { startDate: addDays(T, -30), endDate: addDays(T, -20) });
  await sleep(500);
  const auditRows = await q("select action, details from audit_logs where resource_type='reservation' and resource_id=$1 order by id", [String(C3)]);
  rep.step('C3 edits on a completed reservation (notes/price/times/dates) and what the audit log records', { patch: brief(e1, 40), basic: brief(e2, 40), datesPatch: brief(e3, 40), row: (await q('select status, total_price, notes, start_time, end_time, start_date, end_date, updated_by from reservations where id=$1', [C3]))[0], auditBefore, auditAfter: auditRows.length, auditEntries: auditRows.map(a => ({ action: a.action, op: a.details && a.details.operation, changes: a.details && a.details.changes, request: a.details && a.details.request })) });

  // ---- C4 duplicate contract number via /basic ----
  const dupNo = cn('DUP');
  await admin.patch(`/api/reservations/${C3}`, { contractNumber: dupNo });
  const dupBasic = await admin.patch(`/api/reservations/${C2}/basic`, { vehicleId: V113, customerId: CA, startDate: addDays(T, -8), endDate: addDays(T, -5), status: 'completed', contractNumber: dupNo });
  const dupPatch = await admin.patch(`/api/reservations/${C2}`, { contractNumber: dupNo });
  rep.step('C4 duplicate contract number: /basic vs PATCH /:id', { basic: brief(dupBasic, 200), patch: brief(dupPatch, 200) });

  // ---- C5 PK renumber with child rows ----
  const [docRow] = await q('select count(*)::int as n from documents where reservation_id=$1', [C1]);
  const [drvRow] = await q('select count(*)::int as n from reservation_driver_assignments where reservation_id=$1', [C1]);
  const ren1 = await admin.patch(`/api/reservations/${C1}`, { id: 8888888 });
  const movedC1 = await q('select id from reservations where id in ($1, 8888888)', [C1]);
  rep.step('C5a PATCH {id} on a picked_up reservation WITH driver assignment + documents', { response: brief(ren1, 200), childDocs: docRow.n, childAssignments: drvRow.n, rowsNow: movedC1 });
  const ren2 = await admin.patch(`/api/reservations/${C3}`, { id: 8888889 });
  const movedC3 = await q('select id from reservations where id in ($1, 8888889)', [C3]);
  const orphanDocs = await q('select id, reservation_id from documents where reservation_id=$1', [C3]);
  const get8888889 = await admin.get('/api/reservations/8888889');
  rep.step('C5b PATCH {id} on a completed reservation WITH documents but no driver assignment', { response: brief(ren2, 120), rowsNow: movedC3, documentsStillPointingAtOldId: orphanDocs, getNewId: get8888889.status, auditResourceIdStillOld: (await q("select count(*)::int as n from audit_logs where resource_type='reservation' and resource_id=$1", [String(C3)]))[0].n });
  if (movedC3.some(x => x.id === 8888889)) await q('update reservations set id=$1 where id=8888889', [C3]);

  rep.step('ids', { C1, C2, C3 });
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
