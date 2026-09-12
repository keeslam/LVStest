// P36 agent D — mail cluster, take 2 (BUG-170, 171, 185, 186)
// Uses a local SMTP stub on 2536/2537 and its OWN app_settings row (key email_default,
// category 'email') so the row another agent parked under key 'email_config' is untouched.
'use strict';
const fs = require('fs'); const path = require('path');
const L = require('./p36d-lib.cjs');
const stub = require('./p36d-stub.cjs');

const PORT_OK = 2536;
const PORT_HANG = 2537;
const KEY = 'email_default';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const ids = L.loadIds();
  const st = await L.staff('10.36.4.54');
  const out = {};
  const T = L.today();

  const setCfg = async (value) => {
    const r = await st.post('/api/app-settings', { key: KEY, category: 'email', value, description: 'AUDIT-P36D temporary SMTP config' });
    return { status: r.status, body: r.text.slice(0, 200) };
  };
  const cfg = (port, extra = {}) => Object.assign({
    fromEmail: 'audit-p36d@example.invalid', fromName: 'AUDIT P36D', purpose: 'default',
    smtpHost: '127.0.0.1', smtpPort: String(port), smtpUser: 'audit-p36d@example.invalid', smtpPassword: 'AUDIT-P36D-secret', smtpSecure: false,
  }, extra);

  const okStub = await stub.start({ port: PORT_OK, mode: 'ok', logFile: path.join(__dirname, 'p36d-smtp-ok.jsonl') });
  const hangStub = await stub.start({ port: PORT_HANG, mode: 'hang-ehlo', logFile: path.join(__dirname, 'p36d-smtp-hang.jsonl') });

  try {
    // ---------- fixture: one vehicle, a current holder, a settled past renter, a future renter ----------
    out.R0_fixture = await L.step('R0 fixture vehicle with past/current/future renters', async () => {
      const plate = 'AU-3DY-X';
      let v = (await L.q('select id from vehicles where license_plate=$1', [plate]))[0];
      if (!v) {
        const r = await st.post('/api/vehicles', { licensePlate: plate, brand: 'AUDIT-P36D MAIL2', model: 'AUDIT-P36D M', vehicleType: 'sedan', chassisNumber: 'AUDITP36DAU3DYX', fuel: 'Benzine', currentMileage: 1000, productionDate: '2021-01-01', apkDate: L.addDays(T, 20), notes: 'AUDIT-P36D mail fixture 2' });
        if (r.status >= 300) throw new Error('vehicle -> ' + L.short(r, 250));
        v = { id: r.json.id };
      }
      const mkCustomer = async (name, email) => {
        const ex = await L.q('select id from customers where name=$1', [name]);
        if (ex[0]) { await L.q('update customers set email=$1 where id=$2', [email, ex[0].id]); return ex[0].id; }
        const r = await st.post('/api/customers', { name, email, address: 'Kerkweg 47a', city: 'Zuidland', postalCode: '3214 VC' });
        if (r.status >= 300) throw new Error('customer -> ' + L.short(r, 250));
        return r.json.id;
      };
      const cNow = await mkCustomer('AUDIT-P36D MailNow2', 'audit-p36d-now@example.invalid');
      const cPast = await mkCustomer('AUDIT-P36D MailPast2', 'audit-p36d-past@example.invalid');
      const cFuture = await mkCustomer('AUDIT-P36D MailFuture2', 'audit-p36d-future@example.invalid');
      const mkRes = async (cid, s, e, note, finish) => {
        const ex = await L.q('select id from reservations where notes=$1 and deleted_at is null', [note]);
        if (ex[0]) return ex[0].id;
        const r = await st.post('/api/reservations', { vehicleId: v.id, customerId: cid, startDate: s, endDate: e, totalPrice: 100, notes: note });
        if (r.status >= 300) throw new Error('res ' + note + ' -> ' + L.short(r, 250));
        if (finish) await L.q("update reservations set status='returned', actual_return_date=$1 where id=$2", [e, r.json.id]);
        return r.json.id;
      };
      const rPast = await mkRes(cPast, '2021-01-01', '2021-01-10', 'AUDIT-P36D mail2 past', true);
      const rNow = await mkRes(cNow, L.addDays(T, -1), L.addDays(T, 5), 'AUDIT-P36D mail2 now', false);
      const rFut = await mkRes(cFuture, L.addDays(T, 300), L.addDays(T, 305), 'AUDIT-P36D mail2 future', false);
      const rows = await L.q('select id, customer_id, start_date, end_date, status from reservations where vehicle_id=$1 and deleted_at is null order by id', [v.id]);
      return { vehicleId: v.id, customers: { cNow, cPast, cFuture }, reservations: { rPast, rNow, rFut }, rows };
    });

    const vId = out.R0_fixture && out.R0_fixture.vehicleId;

    out.R1_recipients = await L.step('R1 APK reminder recipients (BUG-170)', async () => {
      out.setOk = await setCfg(cfg(PORT_OK));
      await sleep(1500);
      okStub.state.messages.length = 0;
      const before = await L.q('select coalesce(max(id),0) m from email_logs');
      const send = await st.post('/api/notifications/send', { vehicleIds: [vId], template: 'apk' });
      await sleep(1200);
      const logs = await L.q('select id, template, recipients, emails_sent, emails_failed, recipient, result from email_logs where id > $1 order by id', [before[0].m]);
      return { send: { status: send.status, body: send.text.slice(0, 250) },
               deliveries: okStub.state.messages.length, rcpts: okStub.state.messages.map(m => m.rcptTo),
               subjects: okStub.state.messages.map(m => m.subject), emailLogs: logs };
    });

    out.R2_idempotency = await L.step('R2 two identical sends fired together (BUG-185)', async () => {
      okStub.state.messages.length = 0;
      const before = await L.q('select coalesce(max(id),0) m from email_logs');
      const s2 = await L.staff('10.36.4.55');
      const body = { vehicleIds: [vId], template: 'apk' };
      const [a, b] = await Promise.all([st.post('/api/notifications/send', body), s2.post('/api/notifications/send', body)]);
      await sleep(1500);
      const logs = await L.q('select id, template, recipients, emails_sent, recipient, result from email_logs where id > $1 order by id', [before[0].m]);
      return { statuses: [a.status, b.status], bodies: [a.text.slice(0, 160), b.text.slice(0, 160)],
               deliveries: okStub.state.messages.length, rcpts: okStub.state.messages.map(m => m.rcptTo), logRows: logs.length, logs };
    });

    out.R3_secure_flag = await L.step('R3 smtpSecure:true on a plaintext port (BUG-186)', async () => {
      okStub.state.messages.length = 0;
      const set = await setCfg(cfg(PORT_OK, { smtpSecure: true }));
      await sleep(1500);
      const t0 = Date.now();
      const send = await st.post('/api/notifications/send', { vehicleIds: [vId], template: 'apk' });
      const ms = Date.now() - t0;
      await sleep(800);
      return { set, send: { status: send.status, body: send.text.slice(0, 300) }, ms, plaintextDeliveries: okStub.state.messages.length };
    });

    out.R4_bad_from = await L.step('R4 invalid fromEmail accepted? (BUG-186)', async () => {
      okStub.state.messages.length = 0;
      const set = await setCfg(cfg(PORT_OK, { fromEmail: 'not an address' }));
      let send = null;
      if (set.status < 300) {
        await sleep(1500);
        const r = await st.post('/api/notifications/send', { vehicleIds: [vId], template: 'apk' });
        await sleep(800);
        send = { status: r.status, body: r.text.slice(0, 250) };
      }
      return { set, send, deliveries: okStub.state.messages.length, mailFroms: okStub.state.messages.map(m => m.mailFrom) };
    });

    out.R5_hang = await L.step('R5 SMTP greets then hangs (BUG-171)', async () => {
      const set = await setCfg(cfg(PORT_HANG));
      await sleep(1500);
      const t0 = Date.now();
      const send = await st.post('/api/notifications/send', { vehicleIds: [vId], template: 'apk' });
      const ms = Date.now() - t0;
      const h0 = Date.now();
      const health = await fetch(L.BASE + '/health').then(r => r.status).catch(e => 'ERR ' + e.message);
      const logs = await L.q("select id, result, failure_reason from email_logs order by id desc limit 3");
      return { set, sendStatus: send.status, sendMs: ms, body: send.text.slice(0, 300), healthAfter: health, healthMs: Date.now() - h0, recentLogs: logs };
    });

    out.R6_pool = await L.step('R6 two hanging sends do not block an unrelated one (BUG-171)', async () => {
      const s2 = await L.staff('10.36.4.56');
      const s3 = await L.staff('10.36.4.57');
      const hangA = s2.post('/api/notifications/send', { vehicleIds: [vId], template: 'apk' });
      const hangB = s3.post('/api/notifications/send', { vehicleIds: [vId], template: 'apk' });
      await sleep(600);
      const t0 = Date.now();
      const test = await st.post('/api/email/test-connection', { smtpHost: '127.0.0.1', smtpPort: String(PORT_OK), smtpUser: 'u', smtpPassword: 'p', smtpSecure: false, fromEmail: 'audit-p36d@example.invalid' });
      const testMs = Date.now() - t0;
      const [ra, rb] = await Promise.all([hangA, hangB]);
      return { hangStatuses: [ra.status, rb.status], testConnection: { status: test.status, ms: testMs, body: test.text.slice(0, 200) } };
    });
  } finally {
    const mine = await L.q('select id from app_settings where key=$1', [KEY]);
    for (const row of mine) await L.q('delete from app_settings where id=$1', [row.id]);
    out.cleanup = { removedKeys: mine.length, remainingEmailCategory: await L.q("select id, key, category from app_settings where category='email' or key='email_config'") };
    await okStub.stop(); await hangStub.stop();
  }

  console.log(JSON.stringify(out, null, 1));
  fs.writeFileSync(path.join(__dirname, 'p36d-17-mail2.out.json'), JSON.stringify(out, null, 1));
  await L.pool.end();
})().catch(async (e) => { console.error('FAILED', e); try { await L.pool.end(); } catch {} process.exit(1); });
