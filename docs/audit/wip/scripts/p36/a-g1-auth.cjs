const { Session, BASE } = require('./lib.cjs');
const F = require('./a-fixtures.json');
const TS = F.ts;
const R = (l, v) => console.log('[' + l + '] ' + v);
(async () => {
  const a = new Session('admin', { fakeIp: '10.36.1.2' });
  await a.loginStaff('admin', 'admin123');

  // --- BUG-001: manager with manage_users escalating
  const mgrName = 'p36a_mgr_' + TS;
  const mk = await a.post('/api/users', { username: mgrName, password: 'P36apw!23', role: 'manager', permissions: ['manage_users'], fullName: 'P36A Manager' });
  R('001 create-manager', mk.status + ' id=' + (mk.json && mk.json.id));
  const mgrId = mk.json && mk.json.id;
  const m = new Session('mgr', { fakeIp: '10.36.1.3' });
  const ml = await m.loginStaff(mgrName, 'P36apw!23');
  R('001 mgr-login', ml.status);
  const escalate1 = await m.post('/api/users', { username: 'p36a_evil_' + TS, password: 'P36apw!23', role: 'admin' });
  R('001 POST /api/users role=admin', escalate1.status + ' ' + escalate1.text.slice(0, 160));
  const escalate2 = await m.patch('/api/users/' + mgrId, { role: 'admin' });
  R('001 PATCH self role=admin', escalate2.status + ' ' + escalate2.text.slice(0, 160));
  const chk = await a.get('/api/users/' + mgrId);
  R('001 self role now', (chk.json && chk.json.role));

  // --- BUG-011 / BUG-010 / BUG-023 / BUG-015: limited user
  const limName = 'p36a_lim_' + TS;
  const lk = await a.post('/api/users', { username: limName, password: 'P36apw!23', role: 'user', permissions: [], fullName: 'P36A Limited' });
  R('011 create-limited', lk.status + ' id=' + (lk.json && lk.json.id));
  const l = new Session('lim', { fakeIp: '10.36.1.4' });
  R('011 lim-login', (await l.loginStaff(limName, 'P36apw!23')).status);
  const sys = await l.put('/api/system-settings', { contractNumberStart: 999999, tollRatePerKm: '9.99' });
  R('011 PUT /api/system-settings (perm=[])', sys.status + ' ' + sys.text.slice(0, 140));
  const mig = await l.post('/api/migrate/customer-drivers', {});
  R('023 POST /api/migrate/customer-drivers (perm=[])', mig.status + ' ' + mig.text.slice(0, 140));

  // BUG-015: spare-status with only view_reservations
  const vrName = 'p36a_vr_' + TS;
  const vk = await a.post('/api/users', { username: vrName, password: 'P36apw!23', role: 'user', permissions: ['view_reservations'] });
  R('015 create-viewres', vk.status);
  const vr = new Session('vr', { fakeIp: '10.36.1.5' });
  await vr.loginStaff(vrName, 'P36apw!23');
  const res = await a.post('/api/reservations', { vehicleId: F.v1, customerId: F.c1, startDate: '2027-03-01', endDate: '2027-03-05', type: 'standard' });
  R('015 make-res', res.status + ' id=' + (res.json && res.json.id));
  const resId = res.json && res.json.id;
  const sp = await vr.patch('/api/reservations/' + resId + '/spare-status', { spareVehicleStatus: 'returned' });
  R('015 PATCH spare-status (view_reservations)', sp.status + ' ' + sp.text.slice(0, 160));

  // --- BUG-010: manage_backups user reading settings
  const bkName = 'p36a_bk_' + TS;
  const bk = await a.post('/api/users', { username: bkName, password: 'P36apw!23', role: 'user', permissions: ['manage_backups'] });
  R('010 create-backupuser', bk.status);
  const setEmail = await a.post('/api/app-settings', { key: 'email_config', value: JSON.stringify({ smtpHost: 'smtp.example.com', smtpUser: 'u', smtpPassword: 'AUDIT-P36A-smtp-pw' }) });
  R('010 seed email_config', setEmail.status + ' ' + setEmail.text.slice(0, 120));
  const b = new Session('bk', { fakeIp: '10.36.1.6' });
  await b.loginStaff(bkName, 'P36apw!23');
  const gs = await b.get('/api/settings');
  R('010 GET /api/settings status', gs.status);
  R('010 contains plaintext pw?', gs.text.includes('AUDIT-P36A-smtp-pw'));
  R('010 email_config snippet', (gs.text.match(/email_config[\s\S]{0,260}/) || [''])[0].slice(0, 260));

  // --- BUG-046: RDW proxy no auth
  const anon = new Session('anon', { fakeIp: '10.36.1.7' });
  const rdw = await anon.get('/api/rdw/vehicle/AB-123-C');
  R('046 GET /api/rdw/vehicle (no cookie)', rdw.status + ' ' + rdw.text.slice(0, 120));

  // --- BUG-051: object-storage
  const anon2 = new Session('anon2', { fakeIp: '10.36.1.8' });
  const os = await anon2.get('/object-storage/anything');
  R('051 GET /object-storage/anything (no cookie)', os.status + ' ' + os.text.slice(0, 120));

  // --- BUG-003: expenses routes without auth
  const anon3 = new Session('anon3', { fakeIp: '10.36.1.9' });
  const root = await anon3.get('/');
  R('003 anon GET / xsrf?', root.status + ' csrf=' + !!anon3.csrf);
  const boundary = '----P36A' + TS;
  const parts = [];
  const add = (n, v) => parts.push('--' + boundary + '\r\nContent-Disposition: form-data; name="' + n + '"\r\n\r\n' + v + '\r\n');
  add('vehicleId', String(F.v1)); add('category', 'AUDIT-P36A-Unauth'); add('amount', '12.34'); add('date', '2026-09-10');
  const jpg = Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex');
  const body = Buffer.concat([
    Buffer.from(parts.join(''), 'utf8'),
    Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="receipt"; filename="r.jpg"\r\nContent-Type: image/jpeg\r\n\r\n', 'utf8'),
    jpg,
    Buffer.from('\r\n--' + boundary + '--\r\n', 'utf8')]);
  const ex = await anon3.request('POST', '/api/expenses/with-receipt', body, { raw: true, headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary } });
  R('003 POST /api/expenses/with-receipt (anon)', ex.status + ' ' + ex.text.slice(0, 160));
  const exId = ex.json && ex.json.id;
  const anyEx = await a.get('/api/expenses');
  const list = anyEx.json && (Array.isArray(anyEx.json) ? anyEx.json : (anyEx.json.data || []));
  const probeId = exId || (list && list[0] && list[0].id);
  if (probeId) {
    R('003 GET /api/expenses/' + probeId + '/receipt (anon)', (await anon3.get('/api/expenses/' + probeId + '/receipt')).status);
    const pr = await anon3.patch('/api/expenses/' + probeId, { amount: 999.99 });
    R('003 PATCH /api/expenses/' + probeId + ' (anon)', pr.status + ' ' + pr.text.slice(0, 120));
    const pr2 = await anon3.request('PATCH', '/api/expenses/' + probeId + '/with-receipt', body, { raw: true, headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary } });
    R('003 PATCH /api/expenses/' + probeId + '/with-receipt (anon)', pr2.status + ' ' + pr2.text.slice(0, 120));
  } else R('003 no expense id to probe', 'n/a');

  require('fs').writeFileSync('a-g1-ids.json', JSON.stringify({ mgrName, mgrId, limName, vrName, bkName, resId }, null, 1));
})();
