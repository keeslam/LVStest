// P10-G: the spec sequence, executed twice.
//   create -> assign vehicle -> cancel -> modify -> change vehicle -> generate document ->
//   delete related vehicle (variant 1) / delete related customer (variant 2) -> reload.
// After every step the reservation is looked up everywhere the app shows it (everywhereSnapshot)
// and the raw rows are dumped. Fresh vehicles AU-13x-X / AU-14x-X and customers AUDIT-P10 Customer D/E.
'use strict';
const { getAdmin, q, pool, loadIds, Report, brief, today, addDays, everywhereSnapshot, summarize } = require('./p10-lib.cjs');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function mkVehicle(admin, plate) {
  const [ex] = await q('select id from vehicles where license_plate=$1', [plate]);
  if (ex) return ex.id;
  const r = await admin.post('/api/vehicles', { licensePlate: plate, brand: 'AUDIT-P10', model: `SEQ-${plate}`, vehicleType: 'car', currentMileage: 5000, dailyPrice: '40' });
  if (!r.json || !r.json.id) throw new Error('vehicle create failed ' + r.status + ' ' + r.text.slice(0, 200));
  return r.json.id;
}
async function mkCustomer(admin, name) {
  const [ex] = await q('select id from customers where name=$1', [name]);
  if (ex) return ex.id;
  const r = await admin.post('/api/customers', { name, email: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}@example.com`, phone: '0600000001' });
  if (!r.json || !r.json.id) throw new Error('customer create failed ' + r.status + ' ' + r.text.slice(0, 200));
  return r.json.id;
}

async function runVariant(admin, rep, variant, plates, custName, driverId) {
  const T = today();
  const [VA, VB, VC] = await Promise.all(plates.map(p => mkVehicle(admin, p)));
  const CUST = await mkCustomer(admin, custName);
  const S = addDays(T, 14), E = addDays(T, 18);
  const tag = `[${variant}]`;
  const snapAll = async (id) => { const s = await everywhereSnapshot(admin, id); return { summary: summarize(s), vehicles: await q('select id, license_plate, availability_status from vehicles where id = any($1) order by id', [[VA, VB, VC]]), docs: s.documents, drivers: s.driverAssignments, audit: s.auditLog.map(a => a.action + (a.op ? '/' + a.op : '')) }; };

  // 1 create
  let r = await admin.post('/api/reservations', { vehicleId: VA, customerId: CUST, driverId, startDate: S, endDate: E, totalPrice: 160, notes: `AUDIT-P10-G ${variant} sequence` });
  if (!r.json || !r.json.id) throw new Error('create failed ' + r.text);
  const R = r.json.id;
  rep.step(`${tag} 1 create on ${plates[0]}`, { response: brief(r, 50), R, state: await snapAll(R) });
  // 2 assign (change) vehicle -> B
  r = await admin.patch(`/api/reservations/${R}`, { vehicleId: VB, startDate: S, endDate: E });
  rep.step(`${tag} 2 assign vehicle ${plates[1]} (PATCH /:id vehicleId+dates)`, { response: brief(r, 50), state: await snapAll(R) });
  // 3 cancel
  r = await admin.patch(`/api/reservations/${R}/status`, { status: 'cancelled' });
  rep.step(`${tag} 3 cancel via /status`, { response: brief(r, 50), state: await snapAll(R) });
  // 4 modify
  r = await admin.patch(`/api/reservations/${R}`, { notes: `AUDIT-P10-G ${variant} modified after cancel`, totalPrice: 99 });
  rep.step(`${tag} 4 modify notes/price on the cancelled reservation`, { response: brief(r, 50), state: await snapAll(R) });
  // 5 change vehicle -> C
  r = await admin.patch(`/api/reservations/${R}`, { vehicleId: VC, startDate: S, endDate: E });
  rep.step(`${tag} 5 change vehicle to ${plates[2]} (still cancelled)`, { response: brief(r, 50), state: await snapAll(R) });
  // 6 generate document
  const g1 = await admin.post(`/api/contracts/generate-versioned/${R}`, { vehicleId: VC, customerId: CUST, startDate: S, endDate: E });
  const g2 = await admin.get(`/api/contracts/generate/${R}`);
  const g3 = await admin.get(`/api/contracts/data/${R}`);
  await sleep(1000);
  rep.step(`${tag} 6 generate contract documents for a cancelled reservation`, { generateVersioned: brief(g1, 160), generateGet: { status: g2.status, contentType: g2.headers.get('content-type'), bytes: g2.text.length }, contractData: brief(g3, 120), state: await snapAll(R) });
  // 7 delete related vehicle / customer
  let del, restore = null;
  if (variant === 'delete-vehicle') {
    del = await admin.del(`/api/vehicles/${VC}`, { confirmLicensePlate: plates[2] });
    await sleep(800);
    const rowNow = await q('select id, vehicle_id, status, deleted_at from reservations where id=$1', [R]);
    const docsNow = await q('select id, document_type, vehicle_id, reservation_id from documents where reservation_id=$1', [R]);
    const drvNow = await q('select id from reservation_driver_assignments where reservation_id=$1', [R]);
    const trash = await admin.get('/api/deleted-records');
    const trashEntry = Array.isArray(trash.json) ? trash.json.find(d => d.entityId === VC && d.entityType === 'vehicle') : null;
    const vehGet = await admin.get(`/api/vehicles/${VC}`);
    const auditVeh = await q("select action, details->'cascaded' as cascaded from audit_logs where resource_type='vehicle' and resource_id=$1 order by id desc limit 1", [String(VC)]);
    rep.step(`${tag} 7 DELETE /api/vehicles/${VC} (${plates[2]}) -> what happened to the reservation`, { del: brief(del, 120), reservationRow: rowNow, documentsRows: docsNow, driverAssignmentRows: drvNow.length, vehicleGet: vehGet.status, trashEntry: trashEntry && { id: trashEntry.id, entityType: trashEntry.entityType }, vehicleAuditCascade: auditVeh, everywhere: summarize(await everywhereSnapshot(admin, R)) });
    if (trashEntry) {
      restore = await admin.post(`/api/deleted-records/${trashEntry.id}/restore`, {});
      await sleep(500);
      rep.step(`${tag} 7b restore the vehicle from /api/deleted-records`, { restore: brief(restore, 160), reservationRow: await q('select id, vehicle_id, status, deleted_at, notes from reservations where id=$1', [R]), documentsRows: await q('select id, document_type, vehicle_id, reservation_id from documents where reservation_id=$1', [R]), driverAssignmentRows: (await q('select id from reservation_driver_assignments where reservation_id=$1', [R])).length, state: await snapAll(R) });
    }
  } else {
    del = await admin.del(`/api/customers/${CUST}`);
    await sleep(800);
    const rowNow = await q('select id, vehicle_id, customer_id, status, deleted_at from reservations where id=$1', [R]);
    const custGet = await admin.get(`/api/customers/${CUST}`);
    const custRes = await admin.get(`/api/reservations/customer/${CUST}`);
    const contractData = await admin.get(`/api/contracts/data/${R}`);
    const gen = await admin.post(`/api/contracts/generate-versioned/${R}`, { vehicleId: VC, customerId: CUST, startDate: S, endDate: E });
    const withRes = await admin.get('/api/customers/with-reservations');
    const search = await admin.get(`/api/reservations?search=${encodeURIComponent(plates[2])}`);
    const inSearch = Array.isArray(search.json) ? search.json.find(x => x.id === R) : null;
    rep.step(`${tag} 7 DELETE /api/customers/${CUST} -> what happened to the reservation`, { del: brief(del, 120), reservationRow: rowNow, customerGet: custGet.status, reservationsByCustomer: { status: custRes.status, count: Array.isArray(custRes.json) ? custRes.json.length : null }, contractData: brief(contractData, 160), generateVersioned: brief(gen, 160), customersWithReservations: withRes.status, listSearchByPlate: { status: search.status, found: !!inSearch, customerInEntry: inSearch ? inSearch.customer : undefined, customerIdInEntry: inSearch ? inSearch.customerId : undefined }, everywhere: summarize(await everywhereSnapshot(admin, R)) });
  }
  // 8 reload
  const get = await admin.get(`/api/reservations/${R}`);
  const list = await admin.get('/api/reservations');
  const range = await admin.get(`/api/reservations/range?startDate=${S}&endDate=${E}`);
  const inList = Array.isArray(list.json) ? list.json.find(x => x.id === R) : null;
  const inRange = Array.isArray(range.json) ? range.json.find(x => x.id === R) : null;
  rep.step(`${tag} 8 reload`, { getById: { status: get.status, vehicle: get.json && get.json.vehicle ? get.json.vehicle.licensePlate : get.json && get.json.vehicle, customer: get.json && get.json.customer ? get.json.customer.name : get.json && get.json.customer, status: get.json && get.json.status }, list: { status: list.status, found: !!inList, entry: inList && { status: inList.status, vehicle: inList.vehicle && inList.vehicle.licensePlate, customer: inList.customer && inList.customer.name } }, range: { status: range.status, found: !!inRange, entry: inRange && { vehicle: inRange.vehicle && inRange.vehicle.licensePlate, customer: inRange.customer && inRange.customer.name } } });
  return { R, VA, VB, VC, CUST };
}

(async () => {
  const admin = await getAdmin();
  const ids = loadIds();
  const rep = new Report('p10-g-sequence');
  const v1 = await runVariant(admin, rep, 'delete-vehicle', ['AU-131-X', 'AU-132-X', 'AU-133-X'], 'AUDIT-P10 Customer D', ids.portalDrivers[0]);
  const v2 = await runVariant(admin, rep, 'delete-customer', ['AU-141-X', 'AU-142-X', 'AU-143-X'], 'AUDIT-P10 Customer E', ids.portalDrivers[1]);
  rep.step('ids', { v1, v2 });
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
