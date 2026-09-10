// P10-E: soft delete then overlapping create; delete of a picked_up reservation; replacement
// child on delete; restore path; double delete.
'use strict';
const { getAdmin, q, pool, loadIds, Report, brief, today, addDays, everywhereSnapshot, summarize } = require('./p10-lib.cjs');

(async () => {
  const admin = await getAdmin();
  const ids = loadIds();
  const rep = new Report('p10-e-delete-overlap');
  const T = today();
  const CA = ids.customers.A, CB = ids.customers.B;
  const V118 = ids.vehicles['AU-118-X'], V101 = ids.vehicles['AU-101-X'];
  const cn = (s) => `AUDIT-P10-E-${s}-${Date.now().toString().slice(-6)}`;
  const vstat = async (id) => (await q('select availability_status from vehicles where id=$1', [id]))[0];

  // E1 delete booked, then create overlapping
  let r = await admin.post('/api/reservations', { vehicleId: V118, customerId: CA, driverId: ids.portalDrivers[0], startDate: '2027-06-01', endDate: '2027-06-05', totalPrice: 100, notes: 'AUDIT-P10-E1' });
  const E1 = r.json.id;
  const del = await admin.del(`/api/reservations/${E1}`);
  let snap = await everywhereSnapshot(admin, E1);
  const conflicts = await admin.get(`/api/reservations/check-conflicts?vehicleId=${V118}&startDate=2027-06-01&endDate=2027-06-05`);
  r = await admin.post('/api/reservations', { vehicleId: V118, customerId: CB, startDate: '2027-06-01', endDate: '2027-06-05', totalPrice: 100, notes: 'AUDIT-P10-E1b overlapping the deleted one' });
  const E1b = r.json && r.json.id;
  const trash = await admin.get('/api/deleted-records');
  const inTrash = Array.isArray(trash.json) && trash.json.filter(d => d.entityType === 'reservation' || (d.entityId === E1 && d.entityType !== 'vehicle'));
  rep.step('E1 soft-delete booked reservation, then create an overlapping one; restore path?', { del: brief(del, 80), everywhereDeleted: summarize(snap), deletedRow: snap.row && { deleted_at: snap.row.deleted_at, deleted_by: snap.row.deleted_by, status: snap.row.status, contract: snap.row.contract_number }, checkConflictsAfterDelete: (conflicts.json || []).map(c => c.id), overlappingCreate: brief(r, 60), E1b, deletedRecordsHasReservationEntry: inTrash ? inTrash.length : trash.status, deletedRecordsEntityTypes: Array.isArray(trash.json) ? [...new Set(trash.json.map(d => d.entityType))] : null });
  // double delete + edit/cancel/pickup on deleted
  const del2 = await admin.del(`/api/reservations/${E1}`);
  const editDeleted = await admin.patch(`/api/reservations/${E1}`, { notes: 'x' });
  const statusDeleted = await admin.patch(`/api/reservations/${E1}/status`, { status: 'cancelled' });
  rep.step('E1c operations on an already soft-deleted reservation', { deleteAgain: brief(del2, 80), patch: brief(editDeleted, 80), status: brief(statusDeleted, 80) });
  // manual "restore" (there is no endpoint) -> now double booked
  await q('update reservations set deleted_at=null, deleted_by=null where id=$1', [E1]);
  const conflictsAfterRestore = await admin.get(`/api/reservations/check-conflicts?vehicleId=${V118}&startDate=2027-06-01&endDate=2027-06-05`);
  rep.step('E1d after a DB-level restore of the deleted row (no API restore exists) the vehicle is double-booked', { conflictsOnVehicle: (conflictsAfterRestore.json || []).map(c => c.id) });
  await q('update reservations set deleted_at=now(), deleted_by=$2 where id=$1', [E1, 'AUDIT-P10 re-deleted']);

  // E2 delete a picked_up reservation
  r = await admin.post('/api/reservations', { vehicleId: V101, customerId: CA, startDate: T, endDate: addDays(T, 3), totalPrice: 100, notes: 'AUDIT-P10-E2 picked up then deleted' });
  const E2 = r.json.id;
  const contract = cn('E2');
  await admin.post(`/api/reservations/${E2}/pickup`, { contractNumber: contract, pickupMileage: 1200, fuelLevelPickup: 'full' });
  const before = { vehicle: await vstat(V101), row: (await q('select status, contract_number from reservations where id=$1', [E2]))[0] };
  const del3 = await admin.del(`/api/reservations/${E2}`);
  snap = await everywhereSnapshot(admin, E2);
  const reuse = await admin.post('/api/reservations', { vehicleId: V101, customerId: CB, startDate: T, endDate: addDays(T, 3), totalPrice: 100, notes: 'AUDIT-P10-E2b booked over a deleted picked_up' });
  const E2b = reuse.json && reuse.json.id;
  let reusePickup = null;
  if (E2b) reusePickup = brief(await admin.post(`/api/reservations/${E2b}/pickup`, { contractNumber: contract, pickupMileage: 1300, fuelLevelPickup: 'full' }), 100);
  rep.step('E2 delete a picked_up reservation (customer still has the car)', { before, del: brief(del3, 80), everywhere: summarize(snap), row: snap.row && { status: snap.row.status, deleted: !!snap.row.deleted_at, contract: snap.row.contract_number }, vehicleAfter: await vstat(V101), overlappingCreateSameDates: brief(reuse, 60), pickupWithTheFreedContractNumber: reusePickup, docsOfDeleted: snap.documents.length, findByContract: brief(await admin.get(`/api/reservations/find-by-contract/${contract}`), 120) });

  // E3 delete a standard reservation that has a replacement child
  r = await admin.post('/api/reservations', { vehicleId: V118, customerId: CA, startDate: '2027-07-01', endDate: '2027-07-10', totalPrice: 100, notes: 'AUDIT-P10-E3 with replacement' });
  const E3 = r.json.id;
  const ph = await admin.post('/api/placeholder-reservations', { replacementForReservationId: E3, startDate: '2027-07-03', endDate: '2027-07-05', customerId: CA });
  const phId = ph.json && ph.json.id;
  const del4 = await admin.del(`/api/reservations/${E3}`);
  const child = phId ? (await q('select id, status, deleted_at, placeholder_spare from reservations where id=$1', [phId]))[0] : null;
  const needing = await admin.get('/api/placeholder-reservations/needing-assignment');
  rep.step('E3 delete a standard reservation that has a placeholder replacement child', { placeholderCreate: brief(ph, 120), del: brief(del4, 60), childAfter: child, childStillInNeedingAssignment: Array.isArray(needing.json) && needing.json.some(p => p.id === phId), notificationsForPlaceholder: await q("select id, type, message from notifications where message like $1", [`%placeholder:${phId}%`]).catch(e => String(e.message).slice(0, 80)) });

  rep.step('ids', { E1, E1b, E2, E2b, E3, phId });
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
