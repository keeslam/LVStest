// P36 agent D — BUG-187 staff notification mail + BUG-196 staff deeplink / euro sign
'use strict';
const fs = require('fs'); const path = require('path');
const L = require('./p36d-lib.cjs');
const stub = require('./p36d-stub.cjs');

const PORT_OK = 2540;
const KEY = 'email_default';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const INJECT = 'AUDIT-P36D <a href="https://evil.example/login">Klik hier om uw wachtwoord te vernieuwen</a>';
function qp(raw) { return raw ? raw.replace(/=\r\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))) : raw; }
function decodeParts(raw) {
  if (!raw) return '';
  // decode base64 bodies so we can grep the actual text
  return raw.replace(/Content-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+)/g, (_m, b64) => {
    try { return 'DECODED>>' + Buffer.from(b64.replace(/\r\n/g, ''), 'base64').toString('utf8') + '<<'; } catch { return _m; }
  });
}

(async () => {
  const st = await L.staff('10.36.4.61');
  const out = {};
  const okStub = await stub.start({ port: PORT_OK, mode: 'ok', logFile: path.join(__dirname, 'p36d-smtp-portal2.jsonl') });
  const setCfg = async (value) => { const r = await st.post('/api/app-settings', { key: KEY, category: 'email', value, description: 'AUDIT-P36D temporary SMTP config' }); return { status: r.status }; };

  try {
    out.T0_cfg = await setCfg({ fromEmail: 'audit-p36d@example.invalid', fromName: 'AUDIT P36D', purpose: 'default', smtpHost: '127.0.0.1', smtpPort: String(PORT_OK), smtpUser: 'u', smtpPassword: 'p', smtpSecure: false });
    // make sure at least one staff notification recipient exists
    out.T0_staffRecipients = await L.q("select id, key, left(value::text, 300) v from app_settings where key like '%notif%' or key='portal_config'");
    await sleep(1500);

    out.T1_request = await L.step('T1 portal request with HTML in the message (BUG-187/196)', async () => {
      const p = new L.Session('portal', { fakeIp: '10.36.4.62' });
      const lr = await p.loginPortal('portaal-test@example.com', 'P36portal!23');
      if (lr.status !== 200) return { login: lr.status, body: lr.text.slice(0, 200) };
      await p.patch('/api/portal/me', { fullName: INJECT });
      const stored = await L.q('select id, full_name from portal_users where email=$1', ['portaal-test@example.com']);
      okStub.state.messages.length = 0;
      const before = await L.q('select coalesce(max(id),0) m from custom_notifications');
      const req = await p.post('/api/portal/requests', { type: 'other', message: INJECT + ' AUDIT-P36D request message', payload: JSON.stringify({ subject: 'AUDIT-P36D onderwerp' }) });
      await sleep(2500);
      const notifs = await L.q('select id, title, description, link from custom_notifications where id > $1 order by id', [before[0].m]);
      const mails = okStub.state.messages.map(m => ({ rcptTo: m.rcptTo, subject: m.subject, decoded: decodeParts(qp(m.raw || '')).slice(0, 3500) }));
      await p.patch('/api/portal/me', { fullName: 'AUDIT P36D portal test' });
      return { login: lr.status, storedFullName: stored[0] && stored[0].full_name, request: { status: req.status, body: req.text.slice(0, 300) }, notifications: notifs, mails };
    });

    out.T2_staff_reply = await L.step('T2 staff reply on the request (BUG-187 B10b)', async () => {
      const reqRow = await L.q("select id, customer_id from portal_requests where customer_id=179 order by id desc limit 1");
      if (!reqRow[0]) return { note: 'no portal_requests row' };
      okStub.state.messages.length = 0;
      const r = await st.post('/api/portal-requests/' + reqRow[0].id + '/reply', { reply: INJECT + ' AUDIT-P36D staff reply', status: 'in_progress' });
      await sleep(2000);
      const mails = okStub.state.messages.map(m => ({ rcptTo: m.rcptTo, subject: m.subject, decoded: decodeParts(qp(m.raw || '')).slice(0, 2500) }));
      return { requestId: reqRow[0].id, patch: { status: r.status, body: r.text.slice(0, 250) }, mails };
    });

    out.T3_fine_mail = await L.step('T3 fine-linked mail euro sign (BUG-196)', async () => {
      const cust = 179;
      let fine = (await L.q("select id, license_plate, amount, admin_fee, total_amount, customer_id from fines where description like 'AUDIT-P36D%' order by id desc limit 1"))[0];
      if (!fine) {
        await L.q("insert into fines (license_plate, offence_at, received_at, reference, description, amount, admin_fee, total_amount, status, source, created_at, updated_at) values ('AU-3D0-X', now(), now(), $1, 'AUDIT-P36D fine for euro test', 42.50, 0, 42.50, 'new', 'manual', now(), now())", ['AUDIT-P36D-' + Date.now()]);
        fine = (await L.q("select id, license_plate, amount, total_amount from fines where description like 'AUDIT-P36D%' order by id desc limit 1"))[0];
      }
      okStub.state.messages.length = 0;
      const link = await st.post('/api/fines/' + fine.id + '/link', { customerId: cust });
      await sleep(2000);
      const mails = okStub.state.messages.map(m => ({ rcptTo: m.rcptTo, subject: m.subject, decoded: decodeParts(qp(m.raw || '')).slice(0, 2500) }));
      return { fine, link: { status: link.status, body: link.text.slice(0, 250) }, mails };
    });
  } finally {
    const mine = await L.q('select id from app_settings where key=$1', [KEY]);
    for (const row of mine) await L.q('delete from app_settings where id=$1', [row.id]);
    out.cleanup = { removed: mine.length, remaining: await L.q("select id, key, category from app_settings where category='email' or key='email_config'") };
    await okStub.stop();
  }

  console.log(JSON.stringify(out, null, 1));
  fs.writeFileSync(path.join(__dirname, 'p36d-19-portalmail2.out.json'), JSON.stringify(out, null, 1));
  await L.pool.end();
})().catch(async (e) => { console.error('FAILED', e); try { await L.pool.end(); } catch {} process.exit(1); });
