// P36-E — API-level regression for BUG-202, 205, 211, 215, 216, 218, 224, 226, 227, 230.
'use strict';
const fs = require('fs');
const L = require('./e-lib.cjs');
const OUT = {};
const log = (k, v) => { OUT[k] = v; console.log('### ' + k + ': ' + JSON.stringify(v).slice(0, 900)); };
const P = 'AUDIT-P36E';

function multipart(fields) {
  const b = '----p36e' + Date.now() + Math.random().toString(36).slice(2);
  const parts = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n`));
    parts.push(Buffer.from(String(v)));
    parts.push(Buffer.from('\r\n'));
  }
  parts.push(Buffer.from(`--${b}--\r\n`));
  return { body: Buffer.concat(parts), ct: 'multipart/form-data; boundary=' + b };
}

(async () => {
  const [s] = await L.staff(1, '10.36.30.');

  // ---------------- fixtures ----------------
  const plate = 'P36E' + Date.now().toString().slice(-5);
  const v = await L.rreq(s, 'POST', '/api/vehicles', { licensePlate: plate, brand: 'AUDIT', model: 'P36E', vehicleType: 'Personenauto' });
  log('fixture.vehicle', { status: v.status, id: v.json && v.json.id, plate, err: v.status !== 201 && v.status !== 200 ? (v.text || '').slice(0, 250) : '' });
  const c = await L.rreq(s, 'POST', '/api/customers', { name: P + '-klant', email: 'p36e@example.com', phone: '0612345678', city: 'Utrecht' });
  log('fixture.customer', { status: c.status, id: c.json && c.json.id, err: c.status >= 400 ? (c.text || '').slice(0, 250) : '' });
  const vid = v.json && v.json.id, cid = c.json && c.json.id;

  const today = new Date();
  const iso = d => new Date(d).toISOString().slice(0, 10);
  const soon = iso(today.getTime() + 2 * 86400000);
  const soonEnd = iso(today.getTime() + 4 * 86400000);
  const far = iso(today.getTime() + 40 * 86400000);
  const farEnd = iso(today.getTime() + 44 * 86400000);

  const r1 = await L.rreq(s, 'POST', '/api/reservations', { vehicleId: vid, customerId: cid, startDate: soon, endDate: soonEnd, status: 'booked', totalPrice: '100', notes: P + ' base' });
  log('fixture.reservationNear', { status: r1.status, id: r1.json && r1.json.id, err: r1.status >= 400 ? (r1.text || '').slice(0, 300) : '' });
  const rid = r1.json && r1.json.id;

  // ---------------- BUG-202: PATCH with empty-string integer columns ----------------
  if (rid) {
    const full = {
      vehicleId: vid, customerId: cid, startDate: soon, endDate: soonEnd, status: 'booked',
      notes: P + ' edited note',
      driverId: '', replacementForReservationId: '', replacementForTransportId: '', affectedRentalId: '',
      portalRequestId: '', deliveryStaffId: '', recurringParentId: '', maintenanceBlockId: '',
      spareVehicleId: '', deliveryFee: '', totalPrice: '100',
    };
    const mp = multipart(full);
    const r = await L.rreq(s, 'PATCH', '/api/reservations/' + rid, mp.body, { raw: true, headers: { 'Content-Type': mp.ct } });
    log('BUG202.patchAllEmptyInts', { status: r.status, body: (r.text || '').slice(0, 400) });
    for (const col of ['portalRequestId', 'replacementForTransportId', 'affectedRentalId', 'recurringParentId', 'deliveryStaffId', 'driverId']) {
      const m = multipart({ [col]: '', notes: P + ' ' + col });
      const rr = await L.rreq(s, 'PATCH', '/api/reservations/' + rid, m.body, { raw: true, headers: { 'Content-Type': m.ct } });
      log('BUG202.single.' + col, { status: rr.status, body: rr.status >= 400 ? (rr.text || '').slice(0, 250) : 'ok' });
    }
    // schema drift: is EVERY integer column of reservations covered?
    const intCols = L.sql("select column_name from information_schema.columns where table_name='reservations' and data_type in ('integer','bigint') order by column_name").split('\n').map(x => x.trim()).filter(Boolean);
    log('BUG202.integerColumns', intCols);
    const camel = n => n.replace(/_([a-z])/g, (_, x) => x.toUpperCase());
    const failures = [];
    for (const col of intCols) {
      if (col === 'id') continue;
      const m = multipart({ [camel(col)]: '' });
      const rr = await L.rreq(s, 'PATCH', '/api/reservations/' + rid, m.body, { raw: true, headers: { 'Content-Type': m.ct } });
      if (rr.status >= 400) failures.push({ col: camel(col), status: rr.status, body: (rr.text || '').slice(0, 180) });
    }
    log('BUG202.emptyStringFailuresPerIntColumn', failures);
  }

  // ---------------- BUG-211: pickup weeks before the start date ----------------
  const r2 = await L.rreq(s, 'POST', '/api/reservations', { vehicleId: vid, customerId: cid, startDate: far, endDate: farEnd, status: 'booked', totalPrice: '100', notes: P + ' future' });
  log('fixture.reservationFar', { status: r2.status, id: r2.json && r2.json.id, err: r2.status >= 400 ? (r2.text || '').slice(0, 300) : '' });
  const fid = r2.json && r2.json.id;
  if (fid) {
    const mp = multipart({ pickupMileage: '12345', fuelLevelPickup: 'full' });
    const pk = await L.rreq(s, 'POST', `/api/reservations/${fid}/pickup`, mp.body, { raw: true, headers: { 'Content-Type': mp.ct } });
    log('BUG211.pickupFuture', { status: pk.status, body: (pk.text || '').slice(0, 500) });
    // and with an explicit acknowledgement, if the API offers one
    const mp2 = multipart({ pickupMileage: '12345', fuelLevelPickup: 'full', confirmEarlyPickup: 'true', acknowledgeEarlyPickup: 'true' });
    const pk2 = await L.rreq(s, 'POST', `/api/reservations/${fid}/pickup`, mp2.body, { raw: true, headers: { 'Content-Type': mp2.ct } });
    log('BUG211.pickupFutureAcknowledged', { status: pk2.status, body: (pk2.text || '').slice(0, 400) });
    await L.sleep(800);
    const vv = await L.rget(s, '/api/vehicles/' + vid);
    log('BUG211.vehicleAfterPickup', { status: vv.status, availabilityStatus: vv.json && vv.json.availabilityStatus, resvStatus: L.sql(`select status||'/'||start_date from reservations where id=${fid}`) });
  }

  // ---------------- BUG-218: per-route body limits ----------------
  for (const mb of [2, 20]) {
    const big = { licensePlate: 'P36E-BIG', brand: 'A', model: 'B', vehicleType: 'Personenauto', notes: 'x'.repeat(mb * 1024 * 1024) };
    const t0 = Date.now();
    const r = await L.rreq(s, 'POST', '/api/vehicles', big);
    log('BUG218.post' + mb + 'mb', { status: r.status, ms: Date.now() - t0, body: (r.text || '').slice(0, 200) });
  }

  // ---------------- BUG-215: damage-check PDF ----------------
  const dcId = L.sql("select id from reservations where damage_check_path is not null or status in ('picked_up','returned','completed') order by id desc limit 1");
  const target = dcId || rid;
  if (target) {
    const times = [], sizes = [];
    for (let i = 0; i < 3; i++) {
      const t0 = Date.now();
      const r = await L.rreq(s, 'GET', '/api/damage-checks/generate/' + target);
      times.push(Date.now() - t0); sizes.push(Buffer.byteLength(r.text || '', 'latin1'));
      if (i === 0) log('BUG215.firstStatus', { status: r.status, body: r.status !== 200 ? (r.text || '').slice(0, 250) : '(pdf)' });
      await L.sleep(300);
    }
    log('BUG215.damageCheckPdf', { reservation: target, msPerCall: times, bytesPerCall: sizes });
    // blocking probe: 5 in parallel while timing the trivial /api endpoint
    const anon = new L.Session('probe', { fakeIp: '10.36.31.9' });
    const probe = [];
    const par = Promise.all([0, 1, 2, 3, 4].map(() => L.rreq(s, 'GET', '/api/damage-checks/generate/' + target)));
    const t0 = Date.now();
    while (Date.now() - t0 < 4000) { const a = Date.now(); const rr = await anon.get('/api'); probe.push(Date.now() - a); await L.sleep(100); }
    await par;
    log('BUG215.probeWhileGenerating', { probeMax: Math.max(...probe), probeP50: L.pct(probe, 50), n: probe.length, parallelWallMs: Date.now() - t0 });
  }

  // ---------------- BUG-216 / BUG-205: list payload shapes ----------------
  const idc = await L.rtimed(s, 'GET', '/api/interactive-damage-checks');
  log('BUG216.list', { status: idc.status, rows: idc.rows, bytes: idc.bytes, keys: idc.json && idc.json[0] ? Object.keys(idc.json[0]) : [] });
  const mil = await L.rtimed(s, 'GET', '/api/reports/mileage-per-month?from=2026-01-01&to=2026-09-12');
  log('BUG216.mileageReport', { status: mil.status, bytes: mil.bytes, ms: mil.ms });
  const resv = await L.rtimed(s, 'GET', '/api/reservations');
  log('BUG205.reservations', { rows: resv.rows, bytes: resv.bytes, bytesPerRow: Math.round(resv.bytes / (resv.rows || 1)), hasVehicleObj: !!(resv.json && resv.json[0] && resv.json[0].vehicle), hasCustomerNotes: !!(resv.json && resv.json[0] && resv.json[0].customer && 'notes' in resv.json[0].customer) });
  const lim = await L.rtimed(s, 'GET', '/api/reservations?limit=50');
  log('BUG205.limit50', { rows: lim.rows, bytes: lim.bytes });

  // ---------------- BUG-226: find-by-contract ----------------
  const cn = L.sql("select contract_number from reservations where contract_number is not null order by id desc limit 1");
  if (cn) {
    const t0 = L.tblscans(['reservations']);
    const x0 = L.xact();
    const r = await L.rtimed(s, 'GET', '/api/reservations/find-by-contract/' + encodeURIComponent(cn));
    await L.sleep(600);
    const t1 = L.tblscans(['reservations']); const x1 = L.xact();
    log('BUG226.findByContract', { contract: cn, status: r.status, bytes: r.bytes, ms: r.ms, statements: x1 - x0, reservationScans: (t1.reservations.seq + t1.reservations.idx) - (t0.reservations.seq + t0.reservations.idx), seqScans: t1.reservations.seq - t0.reservations.seq });
  }

  // ---------------- BUG-224: document timestamps ----------------
  const doc = L.sql("select id||'|'||created_at||'|'||coalesce(file_name,'-') from documents order by id desc limit 1");
  log('BUG224.newestDocRowSql', doc);
  log('BUG224.columnType', L.sql("select column_name||' '||data_type from information_schema.columns where table_name='documents' and column_name in ('created_at','updated_at')").split('\n'));
  log('BUG224.timestamptzColumnCount', L.sql("select count(*) from information_schema.columns where data_type='timestamp with time zone' and table_schema='public'"));
  log('BUG224.naiveTimestampColumnCount', L.sql("select count(*) from information_schema.columns where data_type='timestamp without time zone' and table_schema='public'"));
  log('BUG224.naiveColumnsSample', L.sql("select table_name||'.'||column_name from information_schema.columns where data_type='timestamp without time zone' and table_schema='public' order by 1 limit 15").split('\n'));
  log('BUG224.nowLocalVsUtc', { serverNowIso: new Date().toISOString(), pgNow: L.sql('select now()'), pgNowUtc: L.sql("select now() at time zone 'UTC'"), tzOffsetMin: new Date().getTimezoneOffset() });
  if (doc) {
    const id = doc.split('|')[0];
    const d = await L.rget(s, '/api/documents/' + id);
    log('BUG224.docViaApi', { status: d.status, createdAt: d.json && d.json.createdAt, sqlCreatedAt: doc.split('|')[1] });
  }

  fs.writeFileSync(__dirname + '/e-api.out.json', JSON.stringify(OUT, null, 1));
  console.log('written e-api.out.json');
})().catch(e => {
  console.error('FATAL', e.stack);
  fs.writeFileSync(__dirname + '/e-api.out.json', JSON.stringify(Object.assign(OUT, { FATAL: String(e.stack) }), null, 1));
  process.exit(1);
});
