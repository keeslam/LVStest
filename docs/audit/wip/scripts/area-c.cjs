// Area C: customer portal
'use strict';
const { Session, BASE } = require('./lib.cjs');
const { q, pool } = require('./db.cjs');
const setup = require('./setup-out.json');
const fs = require('fs');
const path = require('path');

const results = [];
function log(name, obj) { results.push({ name, ...obj }); console.log('---', name, '---'); console.log(JSON.stringify(obj, null, 2).slice(0, 2500)); }
let ipCounter = 300;
function nextIp() { return `10.95.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`; }

const CUST179_PORTAL = { email: 'portaal-test@example.com', password: 'portaal-test-1234' };
// IDOR fixtures belonging to customer 1 (not 179)
const OTHER = { reservationId: 80, docId: 1, fineId: 511, driverId: 852, requestId: 577 };
const OWN = { reservationId: 268, driverId: 23 };

async function main() {
  // ===== C7: portal login fuzz =====
  for (const [label, body] of [
    ['empty body', {}],
    ['array email', { email: ['a@b.com'], password: 'x' }],
    ['10kB email', { email: 'a'.repeat(10 * 1024) + '@example.com', password: 'x' }],
  ]) {
    const ip = nextIp();
    const r = await fetch(BASE + '/api/portal/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify(body) });
    log('C7 portal login fuzz: ' + label, { status: r.status, body: (await r.text()).slice(0, 200) });
  }

  // portal lockout on throwaway account, each attempt a fresh spoofed IP to isolate account-lockout from IP limiter
  {
    const acct = setup.portal.lockout;
    const attempts = [];
    for (let i = 1; i <= 6; i++) {
      const ip = nextIp();
      const r = await fetch(BASE + '/api/portal/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify({ email: acct.email, password: 'Wrong' + i }) });
      attempts.push({ attempt: i, status: r.status, body: await r.text() });
    }
    log('C7 portal account lockout - 6x wrong password, distinct IP each', { attempts });
    const ipCorrect = nextIp();
    const rCorrect = await fetch(BASE + '/api/portal/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ipCorrect }, body: JSON.stringify({ email: acct.email, password: acct.password }) });
    log('C7 portal lockout - correct password while locked', { status: rCorrect.status, body: await rCorrect.text() });
    const dbRows = await q("select username, success, failure_reason, attempted_at from login_attempts where username=$1 order by attempted_at", ['portal:' + acct.email.toLowerCase()]);
    log('C7 portal lockout login_attempts DB rows', { dbRows });
  }

  // main customer-179 session for IDOR + requests + feature-switch tests
  const s179 = new Session('c-179', { fakeIp: nextIp() });
  await s179.get('/api/portal/csrf-token');
  const login179 = await s179.loginPortal(CUST179_PORTAL.email, CUST179_PORTAL.password);
  log('C main session login (customer 179)', { status: login179.status });

  // CSRF missing / wrong on portal
  {
    const r = await s179.patch('/api/portal/me', { fullName: 'AUDIT should-fail' }, { omitCsrf: true });
    log('C7 portal CSRF missing header', { status: r.status, body: r.json });
  }
  {
    const other = new Session('c-csrf-other', { fakeIp: nextIp() });
    await other.get('/api/portal/csrf-token');
    await other.loginPortal(setup.portal.other_admin.email, setup.portal.other_admin.password);
    const r = await s179.patch('/api/portal/me', { fullName: 'AUDIT should-fail-2' }, { csrfOverride: other.csrf });
    log('C7 portal CSRF token from another session', { status: r.status, body: r.json });
  }

  // ===== C8: IDOR =====
  const idorGets = [
    ['reservations/:id', `/api/portal/reservations/${OTHER.reservationId}`],
    ['documents/:id/download', `/api/portal/documents/${OTHER.docId}/download`],
    ['fines/:id', `/api/portal/fines/${OTHER.fineId}`],
    ['requests/:id', `/api/portal/requests/${OTHER.requestId}`],
    ['drivers/:id (via PATCH readback n/a, GET list only)', null],
    ['vehicles/mine', '/api/portal/vehicles/mine'],
  ];
  for (const [label, url] of idorGets) {
    if (!url) continue;
    const r = await s179.get(url);
    log(`C8 IDOR GET ${label}`, { status: r.status, bodyPreview: JSON.stringify(r.json ?? r.text).slice(0, 200) });
  }
  // drivers/:id via PATCH (other customer's driver)
  {
    const r = await s179.patch(`/api/portal/drivers/${OTHER.driverId}`, { displayName: 'AUDIT-hacked-name' });
    log('C8 IDOR PATCH /api/portal/drivers/:id (other customer driver)', { status: r.status, body: r.json });
    const check = await q('select id, display_name, customer_id from drivers where id=$1', [OTHER.driverId]);
    log('C8 DB check - other customer driver unchanged?', { check });
  }
  // POST /api/portal/requests with reservationId of another customer (extension type, needs reservation)
  {
    const r = await s179.post('/api/portal/requests', { type: 'extension', message: 'AUDIT idor test', reservationId: OTHER.reservationId, payload: JSON.stringify({ newEndDate: '2030-01-01' }) }, { raw: false });
    log('C8 IDOR POST /api/portal/requests reservationId of other customer', { status: r.status, body: r.json });
  }
  // DELETE /api/portal/requests/:id of another customer's (status=new) request
  {
    const r = await s179.del(`/api/portal/requests/${OTHER.requestId}`);
    log('C8 IDOR DELETE /api/portal/requests/:id (other customer, status=new)', { status: r.status, body: r.json });
    const check = await q('select id, status from portal_requests where id=$1', [OTHER.requestId]);
    log('C8 DB check - other customer request still exists?', { check });
  }
  // POST /api/portal/documents/:id/ack of another customer's document
  {
    const r = await s179.post(`/api/portal/documents/${OTHER.docId}/ack`, {});
    log('C8 IDOR POST /api/portal/documents/:id/ack (other customer doc)', { status: r.status, body: r.json });
  }

  // ===== C9: driver-role account =====
  const sDriver = new Session('c-driver', { fakeIp: nextIp() });
  await sDriver.get('/api/portal/csrf-token');
  const loginDriver = await sDriver.loginPortal(setup.portal.driver179.email, setup.portal.driver179.password);
  log('C9 driver-role login', { status: loginDriver.status, me: loginDriver.json });
  {
    const r = await sDriver.get('/api/portal/reservations');
    log('C9 driver sees only own reservations', { status: r.status, count: Array.isArray(r.json) ? r.json.length : null, ids: Array.isArray(r.json) ? r.json.map(x => x.id) : null });
  }
  {
    // try to manage drivers (create) - expect 403 role forbidden
    const r = await sDriver.post('/api/portal/drivers', { displayName: 'AUDIT driver-created-driver', phone: '0612345678' });
    log('C9 driver-role tries to create a driver (expect 403)', { status: r.status, body: r.json });
  }
  {
    // try to change company emails - expect 403 role forbidden
    const r = await sDriver.patch('/api/portal/me/company', { emailGeneral: 'audit-hacked@example.invalid' });
    log('C9 driver-role tries to change company emails (expect 403)', { status: r.status, body: r.json });
  }

  // ===== C10: requests fuzz (on s179) =====
  {
    const r = await s179.post('/api/portal/requests', { type: 'garbage', message: 'AUDIT fuzz', payload: JSON.stringify({}) });
    log('C10 request type=garbage', { status: r.status, body: r.json });
  }
  // NOTE: payload as an invalid-JSON string ('not-json-at-all') CRASHES THE WHOLE SERVER
  // (JSON.parse throws inside the zod .preprocess() for the `payload` field in
  // server/routes/portal.ts, uncaught -> process-fatal). Confirmed twice in isolation
  // (area-c-crash-repro.cjs) and documented as AP-xxx; deliberately NOT re-run here so
  // the rest of this suite (and other concurrent audit agents on this shared server)
  // aren't taken down by it. Test only the non-crashing variant: valid JSON that isn't an object.
  {
    const r = await s179.post('/api/portal/requests', { type: 'other', message: 'AUDIT fuzz payload-string', payload: JSON.stringify('just a string, valid json, not an object') });
    log('C10 request payload = valid-JSON-but-non-object string', { status: r.status, body: r.json });
  }
  {
    // message 100kB
    const r = await s179.post('/api/portal/requests', { type: 'other', message: 'A'.repeat(100 * 1024), payload: JSON.stringify({}) });
    log('C10 request message 100kB', { status: r.status, body: r.json });
  }
  {
    // booking with startDate 2020-01-01 (past)
    const r = await s179.post('/api/portal/requests', { type: 'booking', message: 'AUDIT past booking', payload: JSON.stringify({ vehicleId: 18, startDate: '2020-01-01' }) });
    log('C10 booking startDate 2020-01-01', { status: r.status, body: r.json });
  }
  {
    // booking of offline (rented) vehicle
    const r = await s179.post('/api/portal/requests', { type: 'booking', message: 'AUDIT offline vehicle booking', payload: JSON.stringify({ vehicleId: 21, startDate: '2030-01-01' }) });
    log('C10 booking of offline (rented) vehicle', { status: r.status, body: r.json });
  }
  {
    // booking of blacklisted vehicle (202, blacklisted for customer 179 above)
    const r = await s179.post('/api/portal/requests', { type: 'booking', message: 'AUDIT blacklisted vehicle booking', payload: JSON.stringify({ vehicleId: 202, startDate: '2030-01-01' }) });
    log('C10 booking of blacklisted vehicle', { status: r.status, body: r.json });
  }
  {
    // withdraw a done request (own, status=done e.g. id 150)
    const r = await s179.del('/api/portal/requests/150');
    log('C10 withdraw a done request (own)', { status: r.status, body: r.json });
  }
  {
    // message on a closed (done) request
    const r = await s179.post('/api/portal/requests/150/messages', { body: 'AUDIT message on closed request' });
    log('C10 message on closed/done request (own)', { status: r.status, body: r.json });
  }

  // ===== C11: portal feature switches (do these LAST since they can break s179 further tests) =====
  {
    const admin = new Session('c-admin', { fakeIp: nextIp() }); await admin.primeCsrf();
    await admin.loginStaff('admin', 'admin123');
    const off = await admin.patch('/api/portal-admin/customers/179/settings', { canSubmitRequests: false });
    log('C11 turn off canSubmitRequests for customer 179', { status: off.status, body: off.json });
    const r = await s179.post('/api/portal/requests', { type: 'other', message: 'AUDIT should be 403 now', payload: JSON.stringify({}) });
    log('C11 POST request after canSubmitRequests disabled (expect 403)', { status: r.status, body: r.json });
    // restore
    const restore = await admin.patch('/api/portal-admin/customers/179/settings', { canSubmitRequests: true });
    log('C11 restore canSubmitRequests for customer 179', { status: restore.status });

    const offAll = await admin.patch('/api/portal-admin/customers/179/settings', { portalEnabled: false });
    log('C11 turn portal off entirely for customer 179', { status: offAll.status, body: offAll.json });
    const meAfter = await s179.get('/api/portal/me');
    log('C11 existing session GET /api/portal/me after portal disabled', { status: meAfter.status, body: meAfter.json });
    const otherAfter = await s179.get('/api/portal/reservations');
    log('C11 existing session GET /api/portal/reservations after portal disabled', { status: otherAfter.status, body: otherAfter.json });
    // restore
    const restoreAll = await admin.patch('/api/portal-admin/customers/179/settings', { portalEnabled: true });
    log('C11 restore portalEnabled for customer 179', { status: restoreAll.status });
  }

  fs.writeFileSync(path.join(__dirname, 'area-c-results.json'), JSON.stringify(results, null, 2));
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
