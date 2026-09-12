// P36 agent D — BUG-187 (HTML injection in portal mail/notifications) and BUG-196 (staff deeplink + euro sign)
'use strict';
const fs = require('fs'); const path = require('path');
const L = require('./p36d-lib.cjs');
const stub = require('./p36d-stub.cjs');

const PORT_OK = 2538;
const KEY = 'email_default';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const INJECT = 'AUDIT-P36D <a href="https://evil.example/login">Klik hier om uw wachtwoord te vernieuwen</a>';

function qp(raw) { return raw ? raw.replace(/=\r\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))) : raw; }

(async () => {
  const ids = L.loadIds();
  const st = await L.staff('10.36.4.58');
  const out = {};
  const okStub = await stub.start({ port: PORT_OK, mode: 'ok', logFile: path.join(__dirname, 'p36d-smtp-portal.jsonl') });

  const setCfg = async (value) => {
    const r = await st.post('/api/app-settings', { key: KEY, category: 'email', value, description: 'AUDIT-P36D temporary SMTP config' });
    return { status: r.status, body: r.text.slice(0, 200) };
  };

  try {
    out.S0_cfg = await setCfg({ fromEmail: 'audit-p36d@example.invalid', fromName: 'AUDIT P36D', purpose: 'default', smtpHost: '127.0.0.1', smtpPort: String(PORT_OK), smtpUser: 'u', smtpPassword: 'p', smtpSecure: false });
    await sleep(1500);

    out.S1_login = await L.step('S1 portal login', async () => {
      const p = new L.Session('portal', { fakeIp: '10.36.4.59' });
      const r = await p.loginPortal('portaal-test@example.com', 'P36portal!23');
      out._portal = p;
      const me = r.status === 200 ? await p.get('/api/portal/me') : null;
      return { status: r.status, body: r.text.slice(0, 250), me: me && me.text.slice(0, 300) };
    });

    if (out.S1_login && out.S1_login.status === 200) {
      const p = out._portal;

      out.S2_inject_name = await L.step('S2 set fullName to HTML, submit a request (BUG-187/196)', async () => {
        const before = await L.q('select coalesce(max(id),0) m from portal_requests').catch(() => [{ m: 0 }]);
        const prof = await p.patch('/api/portal/me', { fullName: INJECT });
        const stored = await L.q('select id, full_name from portal_users where email=$1', ['portaal-test@example.com']);
        okStub.state.messages.length = 0;
        const req = await p.post('/api/portal/requests', { type: 'other', body: 'AUDIT-P36D injected request body', subject: 'AUDIT-P36D request' });
        await sleep(1500);
        const notif = await L.q("select id, title, description, link from custom_notifications where description like '%AUDIT-P36D%' or title like '%AUDIT-P36D%' order by id desc limit 3").catch((e) => ({ err: e.message }));
        const msgs = okStub.state.messages.map(m => ({ rcptTo: m.rcptTo, subject: m.subject, body: qp(m.raw || '').slice(0, 4000) }));
        return { profilePatch: { status: prof.status, body: prof.text.slice(0, 200) }, storedFullName: stored[0] && stored[0].full_name,
                 requestPost: { status: req.status, body: req.text.slice(0, 250) }, notifications: notif, mails: msgs };
      });

      out.S3_new_device = await L.step('S3 login from a new device with an HTML User-Agent (BUG-187)', async () => {
        okStub.state.messages.length = 0;
        const p2 = new L.Session('portal-ua', { fakeIp: '10.36.4.60' });
        const r = await p2.request('POST', '/api/portal/login', { email: 'portaal-test@example.com', password: 'P36portal!23' },
          { headers: { 'User-Agent': '<b>bold</b> <a href="https://evil.example">x</a>' } });
        await sleep(1800);
        const msgs = okStub.state.messages.map(m => ({ subject: m.subject, body: qp(m.raw || '').slice(0, 3000) }));
        return { login: r.status, mails: msgs };
      });

      out.S4_restore_name = await L.step('S4 restore portal fullName', async () => {
        const r = await p.patch('/api/portal/me', { fullName: 'AUDIT P36D portal test' });
        return { status: r.status };
      });
    }

    out.S5_fine_mail = await L.step('S5 fine-linked mail euro sign (BUG-196)', async () => {
      const cust = await L.q('select id, name, email from customers where id=179');
      const fineTable = await L.q("select column_name from information_schema.columns where table_name='fines' order by ordinal_position");
      return { customer179: cust[0], fineColumns: fineTable.map(r => r.column_name).join(',') };
    });
  } finally {
    const mine = await L.q('select id from app_settings where key=$1', [KEY]);
    for (const row of mine) await L.q('delete from app_settings where id=$1', [row.id]);
    out.cleanup = { removed: mine.length, remaining: await L.q("select id, key, category from app_settings where category='email' or key='email_config'") };
    await okStub.stop();
  }

  delete out._portal;
  console.log(JSON.stringify(out, null, 1));
  fs.writeFileSync(path.join(__dirname, 'p36d-18-portalmail.out.json'), JSON.stringify(out, null, 1));
  await L.pool.end();
})().catch(async (e) => { console.error('FAILED', e); try { await L.pool.end(); } catch {} process.exit(1); });
