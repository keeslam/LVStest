// Phase 22/30/31 — morning-dashboard inventory + availability-consistency probes.
// Read-only except one throwaway vehicle (AU-22H-X) used for the availability matrix.
'use strict';
const fs = require('fs'), path = require('path');
const { Session } = require('./lib.cjs');
const { q, pool, url } = require('./db.cjs');
if (!/lvs_audit$/.test(url)) throw new Error('refusing: not lvs_audit');
const OUT = path.join(__dirname, 'p22-b-daysim.out.json');
const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'p22-ids.json'), 'utf8'));
const out = {};
const save = () => fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
const today = new Date().toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

(async () => {
  const s = new Session('admin', { fakeIp: '10.22.1.2' });
  const lr = await s.loginStaff('admin', 'admin123');
  if (lr.status !== 200) throw new Error('login ' + lr.status + ' ' + lr.text.slice(0, 150));

  // ---------- A. MORNING: what does an employee actually get? ----------
  const endpoints = [
    '/api/vehicles/available', '/api/vehicles/apk-expiring', '/api/vehicles/warranty-expiring',
    '/api/reservations/overdue', '/api/reservations/upcoming', '/api/reservations/upcoming-maintenance',
    '/api/placeholder-reservations/needing-assignment?daysAhead=30',
    '/api/transports', '/api/custom-notifications', '/api/apk-date-changes',
    '/api/portal-admin/dashboard', '/api/expenses/recent?limit=10',
    '/api/vehicles', '/api/customers', '/api/reservations',
    '/api/reservations/range?startDate=' + addDays(today, -15) + '&endDate=' + addDays(today, 15),
  ];
  out.morning = [];
  for (const e of endpoints) {
    const t = Date.now();
    const r = await s.get(e);
    const ms = Date.now() - t;
    const j = r.json;
    out.morning.push({
      endpoint: e, status: r.status, ms, bytes: r.text.length,
      count: Array.isArray(j) ? j.length : (j && typeof j === 'object' ? Object.keys(j).length + ' keys' : null),
      keys: (j && !Array.isArray(j) && typeof j === 'object') ? Object.keys(j).slice(0, 12) : undefined,
    });
    save();
  }

  // ---------- B. AVAILABILITY CONSISTENCY MATRIX ----------
  const S = addDays(today, 60), E = addDays(today, 62);
  let vH = (await q("select id from vehicles where license_plate='AU-22H-X'"))[0];
  vH = vH && vH.id;
  if (!vH) {
    const r = await s.post('/api/vehicles', { licensePlate: 'AU-22H-X', brand: 'AUDIT-P22', model: 'vH', vehicleType: 'car', currentMileage: 10000, dailyPrice: '45', currentFuelLevel: 'full' });
    vH = r.json && r.json.id;
  }
  out.vH = vH;
  const inRange = async () => { const r = await s.get('/api/vehicles/available?startDate=' + S + '&endDate=' + E); return Array.isArray(r.json) ? r.json.some(v => v.id === vH) : r.status; };
  const inPlain = async () => { const r = await s.get('/api/vehicles/available'); return Array.isArray(r.json) ? r.json.some(v => v.id === vH) : r.status; };
  const vrow = async () => (await q('select availability_status a, maintenance_status m from vehicles where id=$1', [vH]))[0];
  out.availability = [];
  const rec = async (label, extra) => { out.availability.push(Object.assign({ state: label, availableInRange: await inRange(), availablePlain: await inPlain(), vehicle: await vrow() }, extra || {})); save(); };

  await rec('clean vehicle, no reservations');

  const mb = await s.post('/api/reservations', { vehicleId: vH, customerId: ids.cA, startDate: S, endDate: E, type: 'maintenance_block', maintenanceStatus: 'scheduled', notes: 'AUDIT-P22 matrix block' });
  out.maintenanceBlockCreate = { status: mb.status, id: mb.json && mb.json.id, needsSpare: mb.json && mb.json.needsSpareVehicle, body: (mb.text || '').slice(0, 200) };
  await rec('active maintenance_block covering the requested period', { blockId: mb.json && mb.json.id });

  const bookInBlock = await s.post('/api/reservations', { vehicleId: vH, customerId: ids.cB, startDate: addDays(S, 1), endDate: addDays(S, 1), totalPrice: 45, notes: 'AUDIT-P22 matrix book inside block' });
  out.bookInsideBlock = { status: bookInBlock.status, id: bookInBlock.json && bookInBlock.json.id, body: (bookInBlock.text || '').slice(0, 250) };
  if (bookInBlock.json && bookInBlock.json.id) await s.patch('/api/reservations/' + bookInBlock.json.id + '/status', { status: 'cancelled' });
  save();

  const nf = await s.patch('/api/vehicles/' + vH + '/status', { availabilityStatus: 'needs_fixing' });
  out.setNeedsFixing = { status: nf.status, body: (nf.text || '').slice(0, 250) };
  await rec('availabilityStatus = needs_fixing (+ block)');

  const nfr = await s.patch('/api/vehicles/' + vH + '/status', { availabilityStatus: 'not_for_rental' });
  out.setNotForRental = { status: nfr.status, body: (nfr.text || '').slice(0, 250) };
  await rec('availabilityStatus = not_for_rental (+ block)');

  const bookNFR = await s.post('/api/reservations', { vehicleId: vH, customerId: ids.cB, startDate: addDays(S, 10), endDate: addDays(S, 11), totalPrice: 45, notes: 'AUDIT-P22 matrix book while not_for_rental' });
  out.bookWhileNotForRental = { status: bookNFR.status, id: bookNFR.json && bookNFR.json.id, body: (bookNFR.text || '').slice(0, 250) };
  if (bookNFR.json && bookNFR.json.id) {
    const pk = await s.post('/api/reservations/' + bookNFR.json.id + '/pickup', { contractNumber: 'AUDIT-P22-NFR', pickupMileage: 10000, fuelLevelPickup: 'full' });
    out.pickupWhileNotForRental = { status: pk.status, body: (pk.text || '').slice(0, 250), vehicleAfter: await vrow() };
  }
  const ms2 = await s.patch('/api/vehicles/' + vH + '/maintenance-status', { status: 'in_service' });
  out.setInService = { status: ms2.status, body: (ms2.text || '').slice(0, 150) };
  await rec('maintenance_status = in_service');
  save();

  // ---------- C. PORTAL AWARENESS ----------
  const p = new Session('portal', { fakeIp: '10.22.1.3' });
  const plr = await p.loginPortal('portaal-test@example.com', 'portaal-test-1234');
  out.portal = { login: plr.status };
  if (plr.status === 200) {
    const pr = await p.get('/api/portal/reservations');
    const rows = Array.isArray(pr.json) ? pr.json : [];
    const byStatus = {};
    for (const r of rows) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    out.portal.reservations = { status: pr.status, total: rows.length, byStatus };
    for (const ep of ['/api/portal/vehicles', '/api/portal/notifications', '/api/portal/documents', '/api/portal/requests']) {
      const r = await p.get(ep);
      out.portal[ep] = { status: r.status, count: Array.isArray(r.json) ? r.json.length : (r.json && r.json.items ? r.json.items.length : null) };
    }
  }
  save();

  // ---------- D. END OF DAY: is there any "unresolved / conflicts" surface? ----------
  const probes = ['/api/reservations/conflicts', '/api/conflicts', '/api/dashboard', '/api/dashboard/summary', '/api/reservations/unresolved', '/api/tasks'];
  out.missingSurfaces = [];
  for (const e of probes) { const r = await s.get(e); out.missingSurfaces.push({ endpoint: e, status: r.status }); }
  save();

  out.health = await fetch('http://localhost:5001/health').then(x => x.json()).catch(e => ({ err: e.message }));
  save();
  await pool.end();
})().catch(async (e) => { console.error('FATAL', e); out.fatal = String(e && e.stack || e); save(); try { await pool.end(); } catch (x) {} process.exit(1); });
