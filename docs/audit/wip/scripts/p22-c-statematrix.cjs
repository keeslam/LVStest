// Phase 22/31 — corrected availability-consistency matrix.
// The earlier p22-b run used PATCH /api/vehicles/:id/status, which is NOT a route:
// the SPA catch-all answered 200 text/html, so the status was never changed.
// The real path is PATCH /api/vehicles/:id with availabilityStatus in the body
// (server/routes.ts:1160-1182 validateManualStatusChange).
'use strict';
const fs = require('fs'), path = require('path');
const { Session } = require('./lib.cjs');
const { q, pool, url } = require('./db.cjs');
if (!/lvs_audit$/.test(url)) throw new Error('refusing: not lvs_audit');
const OUT = path.join(__dirname, 'p22-c-statematrix.out.json');
const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'p22-ids.json'), 'utf8'));
const out = { steps: [] };
const save = () => fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
const today = new Date().toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const brief = r => ({ status: r.status, ct: r.headers.get('content-type'), body: (r.text || '').slice(0, 220) });

(async () => {
  const s = new Session('admin', { fakeIp: '10.22.1.4' });
  const lr = await s.loginStaff('admin', 'admin123');
  if (lr.status !== 200) throw new Error('login ' + lr.status);

  const S = addDays(today, 90), E = addDays(today, 92);
  let row = (await q("select id from vehicles where license_plate='AU-22I-X'"))[0];
  let vI = row && row.id;
  if (!vI) {
    const r = await s.post('/api/vehicles', { licensePlate: 'AU-22I-X', brand: 'AUDIT-P22', model: 'vI', vehicleType: 'car', currentMileage: 10000, dailyPrice: '45', currentFuelLevel: 'full' });
    vI = r.json && r.json.id;
  }
  out.vI = vI; out.period = [S, E];

  const vrow = async () => (await q('select availability_status a, maintenance_status m from vehicles where id=$1', [vI]))[0];
  const inRange = async () => { const r = await s.get('/api/vehicles/available?startDate=' + S + '&endDate=' + E); return Array.isArray(r.json) ? r.json.some(v => v.id === vI) : 'ERR' + r.status; };
  const inPlain = async () => { const r = await s.get('/api/vehicles/available'); return Array.isArray(r.json) ? r.json.some(v => v.id === vI) : 'ERR' + r.status; };
  const spare = async () => { const r = await s.get('/api/spare-vehicles/available?startDate=' + S + '&endDate=' + E); return Array.isArray(r.json) ? r.json.some(v => v.id === vI) : 'ERR' + r.status; };
  const rec = async (state, extra) => { out.steps.push(Object.assign({ state, vehicle: await vrow(), offeredInRangeList: await inRange(), offeredInPlainList: await inPlain(), offeredAsSpare: await spare() }, extra || {})); save(); };

  await rec('baseline: clean vehicle');

  // 1. not_for_rental
  let r = await s.patch('/api/vehicles/' + vI, { availabilityStatus: 'not_for_rental' });
  out.setNotForRental = brief(r);
  const book1 = await s.post('/api/reservations', { vehicleId: vI, customerId: ids.cB, startDate: S, endDate: E, totalPrice: 135, notes: 'AUDIT-P22 matrix book while not_for_rental' });
  out.bookWhileNotForRental = brief(book1);
  let pk1 = null;
  if (book1.json && book1.json.id) {
    pk1 = await s.post('/api/reservations/' + book1.json.id + '/pickup', { contractNumber: 'AUDIT-P22-NFR2', pickupMileage: 10000, fuelLevelPickup: 'full' });
    out.pickupWhileNotForRental = brief(pk1);
    out.vehicleAfterPickupNFR = await vrow();
    await s.patch('/api/reservations/' + book1.json.id + '/status', { status: 'cancelled' });
    out.cancelAfterPickup = 'attempted';
  }
  await rec('availabilityStatus = not_for_rental', { bookAccepted: book1.status, pickupAccepted: pk1 && pk1.status });

  // reset
  await s.patch('/api/vehicles/' + vI, { availabilityStatus: 'available' });

  // 2. needs_fixing
  r = await s.patch('/api/vehicles/' + vI, { availabilityStatus: 'needs_fixing' });
  out.setNeedsFixing = brief(r);
  const book2 = await s.post('/api/reservations', { vehicleId: vI, customerId: ids.cB, startDate: addDays(S, 10), endDate: addDays(S, 11), totalPrice: 90, notes: 'AUDIT-P22 matrix book while needs_fixing' });
  out.bookWhileNeedsFixing = brief(book2);
  let pk2 = null;
  if (book2.json && book2.json.id) {
    pk2 = await s.post('/api/reservations/' + book2.json.id + '/pickup', { contractNumber: 'AUDIT-P22-NF2', pickupMileage: 10000, fuelLevelPickup: 'full' });
    out.pickupWhileNeedsFixing = brief(pk2);
    out.vehicleAfterPickupNF = await vrow();
    const ret = await s.post('/api/reservations/' + book2.json.id + '/return', { returnMileage: 10050, fuelLevelReturn: 'full' });
    out.returnAfterNeedsFixing = brief(ret);
    out.vehicleAfterReturnNF = await vrow();
  }
  await rec('availabilityStatus = needs_fixing', { bookAccepted: book2.status, pickupAccepted: pk2 && pk2.status });

  // reset
  await s.patch('/api/vehicles/' + vI, { availabilityStatus: 'available' });
  await s.patch('/api/vehicles/' + vI + '/maintenance-status', { status: 'in_service' });
  await rec('maintenance_status = in_service (availability untouched)');
  const book3 = await s.post('/api/reservations', { vehicleId: vI, customerId: ids.cB, startDate: addDays(S, 20), endDate: addDays(S, 21), totalPrice: 90, notes: 'AUDIT-P22 matrix book while in_service' });
  out.bookWhileInService = brief(book3);
  if (book3.json && book3.json.id) {
    const pk3 = await s.post('/api/reservations/' + book3.json.id + '/pickup', { contractNumber: 'AUDIT-P22-IS2', pickupMileage: 10000, fuelLevelPickup: 'full' });
    out.pickupWhileInService = brief(pk3);
    out.vehicleAfterPickupIS = await vrow();
  }
  save();

  // 3. does the dashboard "Beschikbare voertuigen" widget count in_service vehicles?
  const plain = await s.get('/api/vehicles/available');
  const plainRows = Array.isArray(plain.json) ? plain.json : [];
  out.plainListComposition = {
    total: plainRows.length,
    withMaintenanceInService: plainRows.filter(v => v.maintenanceStatus === 'in_service').length,
    withMaintenanceNeedsService: plainRows.filter(v => v.maintenanceStatus === 'needs_service').length,
    notAvailableStatus: plainRows.filter(v => v.availabilityStatus !== 'available').length,
  };
  const fleetInService = await q("select count(*)::int n from vehicles where maintenance_status='in_service'");
  out.fleetInService = fleetInService[0].n;
  save();

  // 4. vehicles with an ACTIVE maintenance block today that are still listed available
  const blocked = await q("select distinct r.vehicle_id from reservations r where r.type='maintenance_block' and r.deleted_at is null and r.start_date <= $1 and coalesce(r.end_date,'9999-12-31') >= $1 and coalesce(r.maintenance_status,'scheduled') <> 'out'", [today]);
  const blockedIds = new Set(blocked.map(b => b.vehicle_id));
  out.activeBlocksToday = blockedIds.size;
  out.availableDespiteActiveBlock = plainRows.filter(v => blockedIds.has(v.id)).length;
  save();

  out.health = await fetch('http://localhost:5001/health').then(x => x.json()).catch(e => ({ err: e.message }));
  save();
  await pool.end();
})().catch(async (e) => { console.error('FATAL', e); out.fatal = String(e && e.stack || e); save(); try { await pool.end(); } catch (x) {} process.exit(1); });
