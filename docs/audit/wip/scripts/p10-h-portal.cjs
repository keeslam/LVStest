// P10-H: does the customer portal reflect staff-side reservation changes (dates, vehicle,
// driver, cancel, delete) and are notifications produced?
'use strict';
const { getAdmin, getPortal, q, pool, loadIds, Report, brief, today, addDays } = require('./p10-lib.cjs');

(async () => {
  const admin = await getAdmin();
  const portal = await getPortal();
  const ids = loadIds();
  const rep = new Report('p10-h-portal');
  const T = today();
  const CUST = ids.portalCustomer; // 179
  const [D1, D2] = ids.portalDrivers;
  let r = await admin.post('/api/vehicles', { licensePlate: 'AU-123-X', brand: 'AUDIT-P10', model: 'Portal-1', vehicleType: 'car', currentMileage: 100 });
  const VA = r.json && r.json.id || (await q("select id from vehicles where license_plate='AU-123-X'"))[0].id;
  r = await admin.post('/api/vehicles', { licensePlate: 'AU-124-X', brand: 'AUDIT-P10', model: 'Portal-2', vehicleType: 'car', currentMileage: 100 });
  const VB = r.json && r.json.id || (await q("select id from vehicles where license_plate='AU-124-X'"))[0].id;

  const notifBefore = (await q('select count(*)::int as n from portal_notifications where customer_id=$1', [CUST]))[0].n;
  const view = async (id) => {
    const list = await portal.get('/api/portal/reservations');
    const inList = Array.isArray(list.json) ? list.json.find(x => x.id === id) : null;
    const one = await portal.get(`/api/portal/reservations/${id}`);
    const notifs = (await q('select count(*)::int as n from portal_notifications where customer_id=$1', [CUST]))[0].n - notifBefore;
    const apiNotif = await portal.get('/api/portal/notifications');
    return { listStatus: list.status, inList: inList ? { status: inList.status, start: inList.startDate, end: inList.endDate, vehicle: inList.vehicle && inList.vehicle.licensePlate, driver: inList.driver && inList.driver.id } : false, detail: one.status === 200 ? { status: one.json.status, start: one.json.startDate, end: one.json.endDate, vehicle: one.json.vehicle && one.json.vehicle.licensePlate, driver: one.json.driver && one.json.driver.id, history: (one.json.driverHistory || []).map(h => `${h.driverId}${h.assignedUntil ? '' : '*'}`) } : one.status, newNotifications: notifs, notifTitles: Array.isArray(apiNotif.json) ? apiNotif.json.slice(0, 3).map(n => n.title) : apiNotif.status };
  };

  r = await admin.post('/api/reservations', { vehicleId: VA, customerId: CUST, driverId: D1, startDate: addDays(T, 5), endDate: addDays(T, 8), totalPrice: 300, notes: 'AUDIT-P10-H portal' });
  const H = r.json.id;
  rep.step('H1 staff creates reservation for portal customer 179 (driver 161)', { create: brief(r, 50), portal: await view(H) });
  r = await admin.patch(`/api/reservations/${H}`, { startDate: addDays(T, 6), endDate: addDays(T, 9), vehicleId: VA });
  rep.step('H2 staff reschedules (dates +1)', { response: brief(r, 40), portal: await view(H) });
  r = await admin.patch(`/api/reservations/${H}`, { vehicleId: VB, startDate: addDays(T, 6), endDate: addDays(T, 9) });
  rep.step('H3 staff changes vehicle to AU-124-X', { response: brief(r, 40), portal: await view(H) });
  r = await admin.patch(`/api/reservations/${H}`, { driverId: D2 });
  rep.step('H4 staff changes driver to 23', { response: brief(r, 40), portal: await view(H) });
  r = await admin.patch(`/api/reservations/${H}/basic`, { vehicleId: VB, customerId: CUST, driverId: D1, startDate: addDays(T, 6), endDate: addDays(T, 9), status: 'booked', totalPrice: 300 });
  rep.step('H5 staff changes driver back to 161 via /basic', { response: brief(r, 40), portal: await view(H), assignmentsDb: await q('select driver_id, assigned_until is null as open, note from reservation_driver_assignments where reservation_id=$1 order by id', [H]) });
  // pickup -> contract document visible in portal?
  r = await admin.post(`/api/reservations/${H}/pickup`, { contractNumber: `AUDIT-P10-H-${Date.now().toString().slice(-6)}`, pickupMileage: 150, fuelLevelPickup: 'full' });
  const pdocs = await portal.get('/api/portal/documents');
  rep.step('H6 staff picks up -> portal documents', { pickup: brief(r, 40), portal: await view(H), portalDocs: Array.isArray(pdocs.json) ? pdocs.json.filter(d => d.reservationId === H).map(d => d.kind + ':' + d.fileName) : pdocs.status, mine: brief(await portal.get('/api/portal/vehicles/mine'), 200) });
  r = await admin.patch(`/api/reservations/${H}/status`, { status: 'cancelled' });
  rep.step('H7 staff cancels a picked_up reservation via /status', { response: brief(r, 40), portal: await view(H), vehicleStatus: (await q('select availability_status from vehicles where id=$1', [VB]))[0], mine: brief(await portal.get('/api/portal/vehicles/mine'), 120) });
  r = await admin.del(`/api/reservations/${H}`);
  rep.step('H8 staff deletes the reservation', { response: brief(r, 40), portal: await view(H), portalDocsAfterDelete: (await portal.get('/api/portal/documents')).json.filter(d => d.reservationId === H).length });
  // staff moves a maintenance block on a vehicle this customer has picked up: known notification path (control)
  rep.step('ids', { H, VA, VB });
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
