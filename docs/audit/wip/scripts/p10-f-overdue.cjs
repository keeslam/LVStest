// P10-F: overdue picked_up reservation - extend via edit, return late, what reports show.
'use strict';
const { getAdmin, q, pool, loadIds, Report, brief, today, addDays, everywhereSnapshot, summarize } = require('./p10-lib.cjs');

(async () => {
  const admin = await getAdmin();
  const ids = loadIds();
  const rep = new Report('p10-f-overdue');
  const T = today();
  const CA = ids.customers.A, CB = ids.customers.B;
  const V = ids.vehicles['AU-102-X'];
  const cn = (s) => `AUDIT-P10-F-${s}-${Date.now().toString().slice(-6)}`;
  const vstat = async (id) => (await q('select availability_status, current_mileage from vehicles where id=$1', [id]))[0];
  const fin = async (from, to) => { const f = await admin.get(`/api/reports/vehicle-financials?from=${from}&to=${to}&vehicleId=${V}`); return f.json && (f.json.rows || []).find(x => x.vehicleId === V); };

  let r = await admin.post('/api/reservations', { vehicleId: V, customerId: CA, startDate: addDays(T, -10), endDate: addDays(T, -5), totalPrice: 500, notes: 'AUDIT-P10-F overdue' });
  const F1 = r.json.id;
  const pk = await admin.post(`/api/reservations/${F1}/pickup`, { contractNumber: cn('F1'), pickupMileage: 2000, fuelLevelPickup: 'full' });
  let snap = await everywhereSnapshot(admin, F1);
  const blocked = await admin.post('/api/reservations', { vehicleId: V, customerId: CB, startDate: addDays(T, 40), endDate: addDays(T, 42), notes: 'AUDIT-P10-F while overdue' });
  rep.step('F1 picked_up reservation past its endDate (start -10, end -5)', { create: brief(r, 50), pickup: brief(pk, 50), everywhere: summarize(snap), vehicle: await vstat(V), bookingWhileOverdue: brief(blocked, 120), contractData: (await admin.get(`/api/contracts/data/${F1}`)).json && (await admin.get(`/api/contracts/data/${F1}`)).json.rentalDays, financial: await fin(addDays(T, -10), T) });

  // extend via edit (PATCH /:id endDate)
  r = await admin.patch(`/api/reservations/${F1}`, { endDate: addDays(T, 5) });
  snap = await everywhereSnapshot(admin, F1);
  const bookingAfterExtend = await admin.post('/api/reservations', { vehicleId: V, customerId: CB, startDate: addDays(T, 40), endDate: addDays(T, 42), notes: 'AUDIT-P10-F after extend' });
  rep.step('F2 extend the overdue rental via PATCH /:id {endDate: today+5}', { response: brief(r, 50), everywhere: summarize(snap), vehicle: await vstat(V), bookingAfterExtend: brief(bookingAfterExtend, 60), audit: snap.auditLog.map(a => ({ action: a.action, changes: a.changes })) });
  // set it back to overdue, then return late (today)
  await admin.patch(`/api/reservations/${F1}`, { endDate: addDays(T, -5) });
  r = await admin.post(`/api/reservations/${F1}/return`, { returnMileage: 2500, fuelLevelReturn: '1/2' });
  snap = await everywhereSnapshot(admin, F1);
  rep.step('F3 return the overdue rental late (today, 5 days after planned end)', { response: brief(r, 50), row: snap.row && { status: snap.row.status, start: snap.row.start_date, plannedEndBefore: addDays(T, -5), endNow: snap.row.end_date, actualReturn: snap.row.actual_return_date }, everywhere: summarize(snap), vehicle: await vstat(V), financialWindowStart: await fin(addDays(T, -10), T), contractDataDays: (await admin.get(`/api/contracts/data/${F1}`)).json && Object.entries((await admin.get(`/api/contracts/data/${F1}`)).json).filter(([k]) => /day|Days|start|end|Start|End/.test(k)).map(([k, v]) => `${k}=${v}`) });

  // overdue via the form's "mark completed" path (/status completed) on another overdue reservation
  r = await admin.post('/api/reservations', { vehicleId: V, customerId: CA, startDate: addDays(T, -20), endDate: addDays(T, -15), totalPrice: 250, notes: 'AUDIT-P10-F2 overdue completed via status' });
  const F2 = r.json.id;
  await admin.post(`/api/reservations/${F2}/pickup`, { contractNumber: cn('F2'), pickupMileage: 2500, fuelLevelPickup: 'full' });
  const od = await admin.get('/api/reservations/overdue');
  const mark = await admin.patch(`/api/reservations/${F2}/status`, { status: 'completed' });
  snap = await everywhereSnapshot(admin, F2);
  rep.step('F4 overdue list, then "mark completed" via /status (the reservation-form overdue dialog path)', { overdueListHasF2: Array.isArray(od.json) && od.json.some(x => x.id === F2), mark: brief(mark, 50), row: snap.row && { status: snap.row.status, start: snap.row.start_date, end: snap.row.end_date, actualReturn: snap.row.actual_return_date, completion: snap.row.completion_date, returnMileage: null }, everywhere: summarize(snap), vehicle: await vstat(V), financial: await fin(addDays(T, -20), T) });

  rep.step('ids', { F1, F2 });
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
