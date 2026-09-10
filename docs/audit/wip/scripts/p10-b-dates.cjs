// P10-B: date edge cases - very long, far past, same-day, return before start, return in the
// future, pickup on a future-dated reservation, garbage pickup/return dates.
'use strict';
const { getAdmin, q, pool, loadIds, Report, brief, today, addDays, everywhereSnapshot, summarize } = require('./p10-lib.cjs');

(async () => {
  const admin = await getAdmin();
  const ids = loadIds();
  const rep = new Report('p10-b-dates');
  const T = today();
  const CA = ids.customers.A;
  const cn = (s) => `AUDIT-P10-B-${s}-${Date.now().toString().slice(-6)}`;

  // B1 very long: 5 years starting today
  const V = ids.vehicles['AU-104-X'];
  let r = await admin.post('/api/reservations', { vehicleId: V, customerId: CA, startDate: T, endDate: addDays(T, 5 * 365), totalPrice: 100000, notes: 'AUDIT-P10-B long 5y' });
  const B1 = r.json.id;
  let snap = await everywhereSnapshot(admin, B1);
  const conflictFar = await admin.get(`/api/reservations/check-conflicts?vehicleId=${V}&startDate=${addDays(T, 1000)}&endDate=${addDays(T, 1002)}`);
  const availFar = await admin.get(`/api/vehicles/available?startDate=${addDays(T, 1000)}&endDate=${addDays(T, 1002)}`);
  const contract = await admin.get(`/api/contracts/data/${B1}`);
  const fin = await admin.get(`/api/reports/vehicle-financials?from=${T}&to=${T}&vehicleId=${V}`);
  rep.step('B1 create 5-year reservation', { create: brief(r, 80), everywhere: summarize(snap), conflictAt1000d: (conflictFar.json || []).map(c => c.id), vehicleInAvailableAt1000d: Array.isArray(availFar.json) && availFar.json.some(v => v.id === V), contractDays: contract.json && { days: contract.json.rentalDays || contract.json.days || contract.json.duration, keys: Object.keys(contract.json).filter(k => /day|Days|price|Price/.test(k)).map(k => k + '=' + contract.json[k]) }, financialRow: fin.json && (fin.json.rows || []).find(x => x.vehicleId === V) });
  r = await admin.post(`/api/reservations/${B1}/pickup`, { contractNumber: cn('B1'), pickupMileage: 4000, fuelLevelPickup: 'full' });
  snap = await everywhereSnapshot(admin, B1);
  rep.step('B1 pickup 5-year reservation', { pickup: brief(r, 80), everywhere: summarize(snap) });

  // B2 far past: 2015
  const V2 = ids.vehicles['AU-105-X'];
  r = await admin.post('/api/reservations', { vehicleId: V2, customerId: CA, startDate: '2015-01-01', endDate: '2015-01-10', totalPrice: 500, notes: 'AUDIT-P10-B past 2015' });
  const B2 = r.json.id;
  snap = await everywhereSnapshot(admin, B2);
  const fin2015 = await admin.get(`/api/reports/vehicle-financials?from=2015-01-01&to=2015-12-31&vehicleId=${V2}`);
  const futureOnV2 = await admin.post('/api/reservations', { vehicleId: V2, customerId: CA, startDate: '2028-01-01', endDate: '2028-01-03' });
  rep.step('B2 create far-past (2015) booked reservation', { create: brief(r, 80), everywhere: summarize(snap), financial2015: fin2015.json && (fin2015.json.rows || []).find(x => x.vehicleId === V2), futureBookingOnSameVehicle: brief(futureOnV2, 160) });
  r = await admin.post(`/api/reservations/${B2}/pickup`, { contractNumber: cn('B2'), pickupMileage: 5000, fuelLevelPickup: 'full' });
  snap = await everywhereSnapshot(admin, B2);
  rep.step('B2 pickup the 2015 reservation today', { pickup: brief(r, 120), everywhere: summarize(snap), row: snap.row && { start: snap.row.start_date, end: snap.row.end_date, actualPickup: snap.row.actual_pickup_date } });
  r = await admin.post(`/api/reservations/${B2}/return`, { returnMileage: 5100, fuelLevelReturn: 'full', returnDate: '2014-12-25' });
  snap = await everywhereSnapshot(admin, B2);
  rep.step('B2 return with returnDate 2014-12-25 (before startDate 2015-01-01)', { ret: brief(r, 120), row: snap.row && { status: snap.row.status, start: snap.row.start_date, end: snap.row.end_date, actualReturn: snap.row.actual_return_date, completion: snap.row.completion_date }, everywhere: summarize(snap) });

  // B3 same-day start=end=today, pickup + return same day
  const V3 = ids.vehicles['AU-106-X'];
  r = await admin.post('/api/reservations', { vehicleId: V3, customerId: CA, startDate: T, endDate: T, totalPrice: 50, notes: 'AUDIT-P10-B same-day' });
  const B3 = r.json.id;
  const c3 = await admin.get(`/api/contracts/data/${B3}`);
  r = await admin.post(`/api/reservations/${B3}/pickup`, { contractNumber: cn('B3'), pickupMileage: 6000, fuelLevelPickup: 'full' });
  const p3 = brief(r, 80);
  r = await admin.post(`/api/reservations/${B3}/return`, { returnMileage: 6050, fuelLevelReturn: 'full' });
  snap = await everywhereSnapshot(admin, B3);
  const fin3 = await admin.get(`/api/reports/vehicle-financials?from=${T}&to=${T}&vehicleId=${V3}`);
  rep.step('B3 same-day start=end, pickup+return today', { contractDaysBefore: c3.json && Object.keys(c3.json).filter(k => /day|Days/i.test(k)).map(k => k + '=' + c3.json[k]), pickup: p3, ret: brief(r, 80), row: snap.row && { status: snap.row.status, start: snap.row.start_date, end: snap.row.end_date, ap: snap.row.actual_pickup_date, ar: snap.row.actual_return_date }, everywhere: summarize(snap), financial: fin3.json && (fin3.json.rows || []).find(x => x.vehicleId === V3) });

  // B4 return on a future date
  const V4 = ids.vehicles['AU-107-X'];
  r = await admin.post('/api/reservations', { vehicleId: V4, customerId: CA, startDate: T, endDate: addDays(T, 3), totalPrice: 150, notes: 'AUDIT-P10-B future return' });
  const B4 = r.json.id;
  await admin.post(`/api/reservations/${B4}/pickup`, { contractNumber: cn('B4'), pickupMileage: 7000, fuelLevelPickup: 'full' });
  r = await admin.post(`/api/reservations/${B4}/return`, { returnMileage: 7100, fuelLevelReturn: 'full', returnDate: addDays(T, 30) });
  snap = await everywhereSnapshot(admin, B4);
  const conflictB4 = await admin.get(`/api/reservations/check-conflicts?vehicleId=${V4}&startDate=${addDays(T, 10)}&endDate=${addDays(T, 12)}`);
  rep.step('B4 return with returnDate = today+30 (future)', { ret: brief(r, 80), row: snap.row && { status: snap.row.status, start: snap.row.start_date, end: snap.row.end_date, ar: snap.row.actual_return_date }, everywhere: summarize(snap), conflictInsideFutureWindow: (conflictB4.json || []).map(c => c.id) });

  // B5 pickup on a future-dated reservation, then return before start
  const V5 = ids.vehicles['AU-108-X'];
  r = await admin.post('/api/reservations', { vehicleId: V5, customerId: CA, startDate: addDays(T, 10), endDate: addDays(T, 15), totalPrice: 250, notes: 'AUDIT-P10-B future pickup' });
  const B5 = r.json.id;
  r = await admin.post(`/api/reservations/${B5}/pickup`, { contractNumber: cn('B5'), pickupMileage: 8000, fuelLevelPickup: 'full' });
  snap = await everywhereSnapshot(admin, B5);
  rep.step('B5 pickup TODAY on a reservation that starts in 10 days', { pickup: brief(r, 80), row: snap.row && { status: snap.row.status, start: snap.row.start_date, end: snap.row.end_date, ap: snap.row.actual_pickup_date }, everywhere: summarize(snap) });
  r = await admin.post(`/api/reservations/${B5}/return`, { returnMileage: 8100, fuelLevelReturn: 'full', returnDate: addDays(T, -5) });
  snap = await everywhereSnapshot(admin, B5);
  rep.step('B5 return with returnDate = today-5 (before startDate)', { ret: brief(r, 80), row: snap.row && { status: snap.row.status, start: snap.row.start_date, end: snap.row.end_date, ar: snap.row.actual_return_date }, everywhere: summarize(snap) });

  // B6 garbage / future pickupDate and returnDate strings
  const V6 = ids.vehicles['AU-109-X'];
  r = await admin.post('/api/reservations', { vehicleId: V6, customerId: CA, startDate: T, endDate: addDays(T, 2), totalPrice: 10, notes: 'AUDIT-P10-B garbage dates' });
  const B6 = r.json.id;
  r = await admin.post(`/api/reservations/${B6}/pickup`, { contractNumber: cn('B6'), pickupMileage: 9000, fuelLevelPickup: 'full', pickupDate: 'not-a-date' });
  const p6 = brief(r, 100);
  let row6 = (await q('select status, actual_pickup_date from reservations where id=$1', [B6]))[0];
  r = await admin.post(`/api/reservations/${B6}/return`, { returnMileage: 9100, fuelLevelReturn: 'full', returnDate: '2099-13-45' });
  const row6b = (await q('select status, start_date, end_date, actual_return_date, completion_date from reservations where id=$1', [B6]))[0];
  const rangeAfter = await admin.get(`/api/reservations/range?startDate=${T}&endDate=${addDays(T, 2)}`);
  const docs6 = await q('select file_name from documents where reservation_id=$1', [B6]);
  rep.step('B6 pickupDate "not-a-date", returnDate "2099-13-45"', { pickup: p6, afterPickup: row6, ret: brief(r, 100), afterReturn: row6b, rangeStillOk: rangeAfter.status, docs: docs6 });

  // B7 open-ended (endDate null) reservation: what do overdue / upcoming / sync do
  const V7 = ids.vehicles['AU-110-X'];
  r = await admin.post('/api/reservations', { vehicleId: V7, customerId: CA, startDate: addDays(T, -20), endDate: null, totalPrice: 10, notes: 'AUDIT-P10-B open-ended past start' });
  const B7 = r.json.id;
  snap = await everywhereSnapshot(admin, B7);
  const futureOnV7 = await admin.post('/api/reservations', { vehicleId: V7, customerId: CA, startDate: '2029-01-01', endDate: '2029-01-03' });
  rep.step('B7 open-ended reservation (start 20 days ago, endDate null), never picked up', { create: brief(r, 80), everywhere: summarize(snap), futureBooking: brief(futureOnV7, 120) });

  rep.step('ids', { B1, B2, B3, B4, B5, B6, B7 });
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
