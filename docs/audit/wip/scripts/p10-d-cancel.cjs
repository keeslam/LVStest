// P10-D: cancel effects. What happens to documents, driver assignment, spare/replacement +
// placeholder reservations, transports and vehicle status when a reservation is cancelled
// (via /status, via the reservation-form path PATCH /:id, via /basic); cancel a picked_up
// reservation; un-cancel (both paths) and the double-booking that follows.
'use strict';
const { getAdmin, q, pool, loadIds, Report, brief, today, addDays, everywhereSnapshot, summarize } = require('./p10-lib.cjs');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const admin = await getAdmin();
  const ids = loadIds();
  const rep = new Report('p10-d-cancel');
  const T = today();
  const CA = ids.customers.A, CB = ids.customers.B;
  const V115 = ids.vehicles['AU-115-X'], V116 = ids.vehicles['AU-116-X'], V117 = ids.vehicles['AU-117-X'], V113 = ids.vehicles['AU-113-X'];
  const cn = (s) => `AUDIT-P10-D-${s}-${Date.now().toString().slice(-6)}`;
  const vstat = async (id) => (await q('select availability_status from vehicles where id=$1', [id]))[0].availability_status;
  const related = async (id) => ({
    row: (await q('select status, contract_number, actual_pickup_date, pickup_mileage, delivery_required, maintenance_status, spare_vehicle_status, updated_by from reservations where id=$1', [id]))[0],
    transports: await q('select id, status, transport_type from vehicle_transports where reservation_id=$1 order by id', [id]),
    driverAssignments: await q('select driver_id, assigned_until is null as open, note from reservation_driver_assignments where reservation_id=$1 order by id', [id]),
    replacements: await q('select id, type, status, vehicle_id, placeholder_spare, spare_vehicle_status, deleted_at is not null as deleted from reservations where replacement_for_reservation_id=$1 order by id', [id]),
    documents: await q('select id, document_type from documents where reservation_id=$1 order by id', [id]),
    customNotifs: await q("select id, type, title from custom_notifications where message like $1 or title like $1", [`%${id}%`]).catch(e => String(e.message).slice(0, 60)),
  });

  // ---- D1 booked reservation with driver + delivery transport + spare + placeholder + contract, cancel via /status ----
  let r = await admin.post('/api/reservations', { vehicleId: V115, customerId: CA, driverId: ids.portalDrivers[0], startDate: addDays(T, 3), endDate: addDays(T, 10), totalPrice: 400, notes: 'AUDIT-P10-D1 cancel effects', deliveryRequired: true, deliveryAddress: 'AUDIT straat 1', deliveryCity: 'Stad', deliveryPostalCode: '1234AB' });
  const D1 = r.json.id;
  const mns = await admin.post(`/api/reservations/${D1}/mark-needs-service`, { maintenanceStatus: 'in', maintenanceNote: 'AUDIT-P10-D1 service' });
  const asg = await admin.post(`/api/reservations/${D1}/assign-spare`, { spareVehicleId: V116, startDate: addDays(T, 4), endDate: addDays(T, 6) });
  const ph = await admin.post('/api/placeholder-reservations', { originalReservationId: D1, customerId: CA, startDate: addDays(T, 7), endDate: addDays(T, 8) });
  const gen = await admin.post(`/api/contracts/generate-versioned/${D1}`, { vehicleId: V115, customerId: CA, startDate: addDays(T, 3), endDate: addDays(T, 10) });
  await sleep(1500);
  const before = await related(D1);
  rep.step('D1 setup: booked + driver + delivery transport + spare (assign-spare) + placeholder + generated contract', { create: brief(r, 60), markNeedsService: brief(mns, 120), assignSpare: brief(asg, 160), placeholder: brief(ph, 120), generateContract: brief(gen, 120), related: before, vehicles: { V115: await vstat(V115), V116: await vstat(V116) } });
  const cancel = await admin.patch(`/api/reservations/${D1}/status`, { status: 'cancelled' });
  await sleep(1000);
  let snap = await everywhereSnapshot(admin, D1);
  const after = await related(D1);
  const needing = await admin.get('/api/placeholder-reservations/needing-assignment');
  const spareActive = await admin.get(`/api/reservations/${D1}/active-replacement`);
  rep.step('D1 cancel via PATCH /:id/status {cancelled}', { cancel: brief(cancel, 60), everywhere: summarize(snap), related: after, vehicles: { V115: await vstat(V115), V116: await vstat(V116) }, placeholderStillNeedingAssignment: Array.isArray(needing.json) && needing.json.some(p => p.replacementForReservationId === D1), activeReplacementApi: brief(spareActive, 160), conflictsNowOnV115: ((await admin.get(`/api/reservations/check-conflicts?vehicleId=${V115}&startDate=${addDays(T, 3)}&endDate=${addDays(T, 10)}`)).json || []).map(c => c.id), conflictsNowOnSpareV116: ((await admin.get(`/api/reservations/check-conflicts?vehicleId=${V116}&startDate=${addDays(T, 4)}&endDate=${addDays(T, 6)}`)).json || []).map(c => c.id) });

  // ---- D2 cancel a picked_up reservation ----
  r = await admin.post('/api/reservations', { vehicleId: V117, customerId: CA, driverId: ids.portalDrivers[1], startDate: T, endDate: addDays(T, 5), totalPrice: 250, notes: 'AUDIT-P10-D2 picked up then cancelled' });
  const D2 = r.json.id;
  const pk = await admin.post(`/api/reservations/${D2}/pickup`, { contractNumber: cn('D2'), pickupMileage: 17000, fuelLevelPickup: 'full' });
  const b2 = await related(D2);
  const cancel2 = await admin.patch(`/api/reservations/${D2}/status`, { status: 'cancelled' });
  await sleep(800);
  snap = await everywhereSnapshot(admin, D2);
  const a2 = await related(D2);
  const rebook = await admin.post('/api/reservations', { vehicleId: V117, customerId: CB, startDate: T, endDate: addDays(T, 5), totalPrice: 1, notes: 'AUDIT-P10-D2b booked over the cancelled picked_up' });
  const rebookPickup = rebook.json && rebook.json.id ? brief(await admin.post(`/api/reservations/${rebook.json.id}/pickup`, { contractNumber: cn('D2b'), pickupMileage: 17000, fuelLevelPickup: 'full' }), 100) : null;
  const ret = await admin.post(`/api/reservations/${D2}/return`, { returnMileage: 17100, fuelLevelReturn: 'full' });
  rep.step('D2 cancel a picked_up reservation (customer physically has the car)', { pickup: brief(pk, 40), before: b2, cancel: brief(cancel2, 60), everywhere: summarize(snap), after: a2, vehicleV117: await vstat(V117), rebookSameVehicleSameDates: brief(rebook, 60), rebookPickup, returnOfTheCancelledOne: brief(ret, 120) });

  // ---- D3 un-cancel: /status vs PATCH /:id, then double booking ----
  const uncancelStatus = await admin.patch(`/api/reservations/${D1}/status`, { status: 'booked' });
  const uncancelPatch = await admin.patch(`/api/reservations/${D1}`, { status: 'booked' });
  await sleep(800);
  snap = await everywhereSnapshot(admin, D1);
  const overl = await admin.post('/api/reservations', { vehicleId: V115, customerId: CB, startDate: addDays(T, 3), endDate: addDays(T, 10), totalPrice: 1, notes: 'AUDIT-P10-D3 overlapping while D1 was cancelled? (created after un-cancel)' });
  rep.step('D3 un-cancel D1: /status {booked} vs PATCH /:id {booked}', { viaStatus: brief(uncancelStatus, 160), viaPatch: brief(uncancelPatch, 60), everywhere: summarize(snap), related: await related(D1), vehicleV115: await vstat(V115), createOverlappingAfterUncancel: brief(overl, 80) });
  // create overlapping while cancelled, then un-cancel -> double booked
  await admin.patch(`/api/reservations/${D1}/status`, { status: 'cancelled' });
  const overlWhileCancelled = await admin.post('/api/reservations', { vehicleId: V115, customerId: CB, startDate: addDays(T, 3), endDate: addDays(T, 10), totalPrice: 1, notes: 'AUDIT-P10-D3b created while D1 cancelled' });
  const D3b = overlWhileCancelled.json && overlWhileCancelled.json.id;
  const uncancelAgain = await admin.patch(`/api/reservations/${D1}`, { status: 'booked' });
  const conflictsD1 = await admin.get(`/api/reservations/check-conflicts?vehicleId=${V115}&startDate=${addDays(T, 3)}&endDate=${addDays(T, 10)}`);
  rep.step('D3b cancel -> book another customer on the same vehicle/dates -> un-cancel via PATCH /:id', { overlappingCreateWhileCancelled: brief(overlWhileCancelled, 60), uncancelViaPatch: brief(uncancelAgain, 60), overlappingNowOnV115: (conflictsD1.json || []).map(c => `${c.id}:${c.status}`), D3b });

  // ---- D4 cancel via the reservation-form path (PATCH /:id with full field set incl. status) ----
  r = await admin.post('/api/reservations', { vehicleId: V113, customerId: CA, driverId: ids.portalDrivers[0], startDate: addDays(T, 20), endDate: addDays(T, 22), totalPrice: 100, notes: 'AUDIT-P10-D4 form cancel', deliveryRequired: true, deliveryAddress: 'AUDIT straat 4', deliveryCity: 'Stad', deliveryPostalCode: '1234AB' });
  const D4 = r.json.id;
  await sleep(500);
  const b4 = await related(D4);
  const formCancel = await admin.patch(`/api/reservations/${D4}`, { vehicleId: V113, customerId: CA, driverId: ids.portalDrivers[0], startDate: addDays(T, 20), endDate: addDays(T, 22), totalPrice: 100, notes: 'AUDIT-P10-D4 form cancel', status: 'cancelled', deliveryRequired: true, deliveryAddress: 'AUDIT straat 4', deliveryCity: 'Stad', deliveryPostalCode: '1234AB', type: 'standard' });
  await sleep(800);
  const a4 = await related(D4);
  rep.step('D4 cancel via the reservation-form path (PATCH /:id full body incl. status:"cancelled")', { before: b4, response: brief(formCancel, 60), after: a4, vehicleV113: await vstat(V113), transportsApi: brief(await admin.get(`/api/transports?reservationId=${D4}`), 120) });
  // ---- D5 cancel via /basic (maintenance dialog path) ----
  r = await admin.post('/api/reservations', { vehicleId: V113, customerId: CA, driverId: ids.portalDrivers[0], startDate: addDays(T, 25), endDate: addDays(T, 27), totalPrice: 100, notes: 'AUDIT-P10-D5 basic cancel', deliveryRequired: true, deliveryAddress: 'AUDIT straat 5', deliveryCity: 'Stad', deliveryPostalCode: '1234AB' });
  const D5 = r.json.id;
  await sleep(500);
  const basicCancel = await admin.patch(`/api/reservations/${D5}/basic`, { vehicleId: V113, customerId: CA, driverId: ids.portalDrivers[0], startDate: addDays(T, 25), endDate: addDays(T, 27), totalPrice: 100, status: 'cancelled', type: 'standard' });
  await sleep(800);
  rep.step('D5 cancel via PATCH /:id/basic {status:"cancelled"} (deliveryRequired omitted from the body as the maintenance dialog would)', { response: brief(basicCancel, 60), after: await related(D5) });

  rep.step('ids', { D1, D2, D3b, D4, D5, placeholder: ph.json && ph.json.id });
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
