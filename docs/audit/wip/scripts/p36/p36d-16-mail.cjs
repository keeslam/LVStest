// P36 agent D — mail cluster (BUG-170 recipients, BUG-171 timeouts, BUG-185 idempotency/logging,
// BUG-186 smtpSecure + fromEmail validation)
// Uses a local SMTP stub on ports chosen by agent D (2536 / 2537) — no real mail leaves the machine.
'use strict';
const fs = require('fs'); const path = require('path');
const L = require('./p36d-lib.cjs');
const stub = require('./p36d-stub.cjs');

const PORT_OK = 2536;
const PORT_HANG = 2537;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function setEmailConfig(st, value, key) {
  const r = await st.post('/api/app-settings', { key, category: 'email', value, description: 'AUDIT-P36D temporary SMTP config' });
  return { status: r.status, body: r.text.slice(0, 250) };
}

(async () => {
  const ids = L.loadIds();
  const st = await L.staff('10.36.4.50');
  const out = {};
  const T = L.today(); const D = (n) => L.addDays(T, n);

  const snapshot = await L.q("select id, category, key, value::text as v from app_settings where category='email'");
  out.emailSettingsBefore = snapshot;

  const okStub = await stub.start({ port: PORT_OK, mode: 'ok', logFile: path.join(__dirname, 'p36d-smtp-ok.jsonl') });
  const hangStub = await stub.start({ port: PORT_HANG, mode: 'hang-ehlo', logFile: path.join(__dirname, 'p36d-smtp-hang.jsonl') });

  const cfg = (port, extra = {}) => Object.assign({
    fromEmail: 'audit-p36d@example.invalid', fromName: 'AUDIT P36D', purpose: 'default',
    smtpHost: '127.0.0.1', smtpPort: String(port), smtpUser: 'audit-p36d@example.invalid', smtpPassword: 'AUDIT-P36D-secret', smtpSecure: false,
  }, extra);

  try {
    // ---------- BUG-170: who receives a vehicle reminder ----------
    out.Q1_recipients = await L.step('Q1 APK reminder recipients (BUG-170)', async () => {
      out.setOk = await setEmailConfig(st, cfg(PORT_OK), 'email_config');
      await sleep(1200);
      // a vehicle with a current holder plus a past and a future renter
      const plate = 'AU-3DX-X';
      let v = (await L.q('select id from vehicles where license_plate=$1', [plate]))[0];
      if (!v) {
        const r = await st.post('/api/vehicles', { licensePlate: plate, brand: 'AUDIT-P36D MAIL', model: 'AUDIT-P36D M', vehicleType: 'sedan', chassisNumber: 'AUDITP36DAU3DXX', fuel: 'Benzine', currentMileage: 1000, productionDate: '2021-01-01', apkDate: L.addDays(T, 20), notes: 'AUDIT-P36D mail fixture' });
        if (r.status >= 300) return { vehicle: L.short(r, 250) };
        v = { id: r.json.id };
      }
      const mkCustomer = async (name, email) => {
        const ex = await L.q('select id from customers where name=$1', [name]);
        if (ex[0]) return ex[0].id;
        const r = await st.post('/api/customers', { name, email, address: 'Kerkweg 47a', city: 'Zuidland', postalCode: '3214 VC' });
        if (r.status >= 300) throw new Error('customer -> ' + L.short(r, 250));
        return r.json.id;
      };
      const cNow = await mkCustomer('AUDIT-P36D MailNow', 'audit-p36d-now@example.invalid');
      const cPast = await mkCustomer('AUDIT-P36D MailPast', 'audit-p36d-past@example.invalid');
      const cFuture = await mkCustomer('AUDIT-P36D MailFuture', 'audit-p36d-future@example.invalid');
      const mkRes = async (cid, s, e, note) => {
        const ex = await L.q('select id from reservations where notes=$1 and deleted_at is null', [note]);
        if (ex[0]) return ex[0].id;
        const r = await st.post('/api/reservations', { vehicleId: v.id, customerId: cid, startDate: s, endDate: e, totalPrice: 100, notes: note });
        if (r.status >= 300) throw new Error('res -> ' + L.short(r, 250));
        return r.json.id;
      };
      const rPast = await mkRes(cPast, '2021-01-01', '2021-01-10', 'AUDIT-P36D mail past');
      const rNow = await mkRes(cNow, L.addDays(T, -1), L.addDays(T, 5), 'AUDIT-P36D mail now');
      const rFut = await mkRes(cFuture, L.addDays(T, 300), L.addDays(T, 305), 'AUDIT-P36D mail future');
      okStub.state.messages.length = 0;
      const before = await L.q('select max(id) m from email_logs');
      const send = await st.post('/api/notifications/send', { vehicleIds: [v.id], template: 'apk' });
      await sleep(800);
      const logs = await L.q('select id, template, recipients, emails_sent, emails_failed, recipient, result from email_logs where id > $1 order by id', [before[0].m || 0]);
      return { vehicleId: v.id, reservations: { rPast, rNow, rFut }, send: { status: send.status, body: send.text.slice(0, 250) },
               rcpts: okStub.state.messages.map(m => m.rcptTo), messageCount: okStub.state.messages.length, emailLogs: logs };
    });

    // ---------- BUG-185: duplicate sends + logging ----------
    out.Q2_idempotency = await L.step('Q2 two identical sends fired together (BUG-185)', async () => {
      okStub.state.messages.length = 0;
      const before = await L.q('select max(id) m from email_logs');
      const vId = out.Q1_recipients && out.Q1_recipients.vehicleId;
      const body = { vehicleIds: [vId], template: 'apk' };
      const s2 = await L.staff('10.36.4.51');
      const [a, b] = await Promise.all([st.post('/api/notifications/send', body), s2.post('/api/notifications/send', body)]);
      await sleep(1000);
      const logs = await L.q('select id, template, recipients, emails_sent, recipient, result from email_logs where id > $1 order by id', [before[0].m || 0]);
      return { statuses: [a.status, b.status], bodies: [a.text.slice(0, 150), b.text.slice(0, 150)],
               deliveries: okStub.state.messages.length, rcpts: okStub.state.messages.map(m => m.rcptTo), logRows: logs.length, logs };
    });

    // ---------- BUG-186: smtpSecure honoured + fromEmail validated ----------
    out.Q3_secure_flag = await L.step('Q3 smtpSecure:true on a plaintext port (BUG-186)', async () => {
      okStub.state.messages.length = 0;
      const set = await setEmailConfig(st, cfg(PORT_OK, { smtpSecure: true }), 'email_config');
      await sleep(1200);
      const t0 = Date.now();
      const vId = out.Q1_recipients && out.Q1_recipients.vehicleId;
      const send = await st.post('/api/notifications/send', { vehicleIds: [vId], template: 'apk' });
      const ms = Date.now() - t0;
      await sleep(500);
      return { set, send: { status: send.status, body: send.text.slice(0, 300) }, ms, plaintextDeliveries: okStub.state.messages.length };
    });

    out.Q4_bad_from = await L.step('Q4 invalid fromEmail (BUG-186)', async () => {
      okStub.state.messages.length = 0;
      const set = await setEmailConfig(st, cfg(PORT_OK, { fromEmail: 'not an address' }), 'email_config');
      await sleep(1200);
      const vId = out.Q1_recipients && out.Q1_recipients.vehicleId;
      const send = await st.post('/api/notifications/send', { vehicleIds: [vId], template: 'apk' });
      await sleep(500);
      return { set, send: { status: send.status, body: send.text.slice(0, 300) },
               deliveries: okStub.state.messages.length, mailFroms: okStub.state.messages.map(m => m.mailFrom) };
    });

    // ---------- BUG-171: hanging SMTP server ----------
    out.Q5_hang = await L.step('Q5 SMTP server that greets and then hangs (BUG-171)', async () => {
      const set = await setEmailConfig(st, cfg(PORT_HANG), 'email_config');
      await sleep(1200);
      const vId = out.Q1_recipients && out.Q1_recipients.vehicleId;
      const t0 = Date.now();
      const send = await st.post('/api/notifications/send', { vehicleIds: [vId], template: 'apk' });
      const ms = Date.now() - t0;
      // while that was running, is an unrelated path still alive?
      const h0 = Date.now();
      const health = await fetch(L.BASE + '/health').then(r => r.status).catch(e => 'ERR ' + e.message);
      return { set, sendStatus: send.status, sendMs: ms, body: send.text.slice(0, 300), healthAfter: health, healthMs: Date.now() - h0 };
    });

    out.Q6_pool_not_blocked = await L.step('Q6 two hanging sends then an unrelated send (BUG-171)', async () => {
      const vId = out.Q1_recipients && out.Q1_recipients.vehicleId;
      const s2 = await L.staff('10.36.4.52');
      const s3 = await L.staff('10.36.4.53');
      const hangA = s2.post('/api/notifications/send', { vehicleIds: [vId], template: 'apk' });
      const hangB = s3.post('/api/notifications/send', { vehicleIds: [vId], template: 'apk' });
      await sleep(500);
      // switch the config to the healthy stub and send from a third session
      await setEmailConfig(st, cfg(PORT_OK), 'email_config');
      await sleep(1200);
      okStub.state.messages.length = 0;
      const t0 = Date.now();
      const good = await st.post('/api/notifications/send', { vehicleIds: [vId], template: 'apk' });
      const goodMs = Date.now() - t0;
      const [ra, rb] = await Promise.all([hangA, hangB]);
      return { hangStatuses: [ra.status, rb.status], hangBodies: [ra.text.slice(0, 120), rb.text.slice(0, 120)],
               goodStatus: good.status, goodMs, goodDeliveries: okStub.state.messages.length, goodBody: good.text.slice(0, 200) };
    });
  } finally {
    // restore: remove the rows agent D added under category 'email'
    const after = await L.q("select id, key from app_settings where category='email'");
    const beforeIds = new Set(snapshot.map(r => r.id));
    for (const row of after) if (!beforeIds.has(row.id)) await L.q('delete from app_settings where id=$1', [row.id]);
    for (const row of snapshot) await L.q('update app_settings set value=$1::jsonb where id=$2', [row.v, row.id]).catch(() => {});
    out.emailSettingsAfter = await L.q("select id, category, key from app_settings where category='email'");
    await okStub.stop(); await hangStub.stop();
  }

  console.log(JSON.stringify(out, null, 1));
  fs.writeFileSync(path.join(__dirname, 'p36d-16-mail.out.json'), JSON.stringify(out, null, 1));
  await L.pool.end();
})().catch(async (e) => { console.error('FAILED', e); try { await L.pool.end(); } catch {} process.exit(1); });
