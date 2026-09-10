// Phase 16 C: slow/hanging SMTP servers (greeting never sent, EHLO never answered, DATA never
// acknowledged), pool exhaustion, retry-after-timeout duplicates, bulk with a hanging server,
// and the cross-customer APK bulk join. Run from repo root: node docs/audit/wip/scripts/p16-c-hang.cjs
'use strict';
const { start } = require('./p16-stub.cjs');
const L = require('./p16-lib.cjs');

const PORT = 2525;
const DOC_ID = 314;
const RCPT = 'audit-p16-rcpt@example.invalid';
const CAP = 45000;
const capped = (p, ms = CAP) => Promise.race([p.then(r => ({ done: true, r })), L.sleep(ms).then(() => ({ done: false }))]);

(async () => {
  await L.snapshotOriginal();
  const admin = await L.getAdmin('10.16.1.13');
  const stub = await start({ port: PORT, mode: 'ok' });
  const msgs = () => stub.state.messages;
  const docBody = { recipients: RCPT, subject: 'AUDIT-P16 hang', message: 'AUDIT-P16' };
  const sendDoc = () => L.timed(() => capped(admin.post(`/api/documents/${DOC_ID}/email`, docBody)));

  // --- C1 silent (no banner): greetingTimeout ---------------------------------------------------
  for (const mode of ['silent', 'hang-ehlo', 'data-hang']) {
    stub.setMode(mode); await L.setEmailConfig(admin, L.stubConfig(PORT));
    const n0 = msgs().length, c0 = stub.state.connections;
    const healths = [];
    const probe = (async () => { for (let i = 0; i < 6; i++) { await L.sleep(3000); healths.push(await L.health()); } })();
    const t = await sendDoc();
    await probe;
    const rec = { http: t.r.done ? t.r.r.status : 'NO RESPONSE within ' + CAP + 'ms', body: t.r.done ? t.r.r.json : null, ms: t.ms, connections: stub.state.connections - c0, msgsCaptured: msgs().length - n0, healthDuring: healths.map(h => h.status + '/' + h.ms + 'ms'), openSockets: stub.state.open.size };
    if (!t.r.done) {
      // release: close the hung socket(s) and see what the app does with the pending request
      stub.dropAll();
      const after = await capped(L.sleep(100).then(() => null), 100);
      await L.sleep(4000);
      rec.afterDrop = { msgs: msgs().length - n0, connections: stub.state.connections - c0 };
    }
    L.record('C1 mode=' + mode, rec);
  }
  stub.setMode('ok'); await L.setEmailConfig(admin, L.stubConfig(PORT));

  // --- C2 pool exhaustion: maxConnections=2, two hung sends block a third --------------------------
  stub.setMode('data-hang'); await L.setEmailConfig(admin, L.stubConfig(PORT));
  {
    const n0 = msgs().length, c0 = stub.state.connections;
    const p1 = capped(admin.post(`/api/documents/${DOC_ID}/email`, docBody), 25000);
    const p2 = capped(admin.post(`/api/documents/${DOC_ID}/email`, docBody), 25000);
    await L.sleep(1500);
    stub.setMode('ok'); // any NEW connection would succeed - but does a third send get a new connection?
    const p3 = capped(admin.post(`/api/documents/${DOC_ID}/email`, docBody), 20000);
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    L.record('C2 pool exhaustion (2 hung, 3rd queued)', { first: r1.done ? r1.r.status : 'hang', second: r2.done ? r2.r.status : 'hang', third: r3.done ? r3.r.status : 'hang (queued behind hung connections)', connections: stub.state.connections - c0, msgsCaptured: msgs().length - n0, openSockets: stub.state.open.size });
    // portal forgot while the pool is stuck: does an unrelated mail path hang too (same transporter key)?
    const pub = new L.Session('pub', { fakeIp: '10.16.2.60' }); await pub.get('/api/portal/csrf-token');
    const tf = await L.timed(() => capped(pub.post('/api/portal/forgot', { email: 'portaal-test@example.com' }), 15000));
    L.record('C2b portal forgot while pool stuck', { http: tf.r.done ? tf.r.r.status : 'hang', ms: tf.ms, note: 'forgot uses purpose=custom -> same email_config row -> same pooled transporter' });
    stub.dropAll(); await L.sleep(3000);
    L.record('C2c after dropping hung sockets', { msgs: msgs().length - n0, connections: stub.state.connections - c0 });
  }
  await L.setEmailConfig(admin, L.stubConfig(PORT));

  // --- C3 retry after "timeout": the user re-sends while the first is still queued --------------------
  stub.setMode('drop'); await L.setEmailConfig(admin, L.stubConfig(PORT));
  {
    const n0 = msgs().length;
    const q1 = capped(admin.post(`/api/documents/${DOC_ID}/email`, docBody), 30000);
    await L.sleep(3000);
    const q2 = capped(admin.post(`/api/documents/${DOC_ID}/email`, docBody), 27000); // "retry" by the user
    await L.sleep(3000);
    stub.setMode('ok'); // SMTP server comes back
    const [x1, x2] = await Promise.all([q1, q2]);
    L.record('C3 retry during outage -> duplicates when server returns', { first: x1.done ? x1.r.status : 'hang', second: x2.done ? x2.r.status : 'hang', msgsDelivered: msgs().length - n0, subjects: msgs().slice(n0).map(m => m.subject) });
  }

  // --- C4 bulk send with a silent server: N x greetingTimeout, request duration ---------------------------
  stub.setMode('silent'); await L.setEmailConfig(admin, L.stubConfig(PORT));
  {
    const vehs = (await L.q("select distinct v.id from vehicles v join reservations r on r.vehicle_id=v.id join customers c on c.id=r.customer_id and (c.email is not null or c.email_for_mot is not null) where v.id in (2,3,4)")).map(r => r.id);
    const c0 = stub.state.connections;
    const t = await L.timed(() => capped(admin.post('/api/notifications/send', { vehicleIds: vehs, template: 'maintenance' }), 40000));
    L.record('C4 bulk maintenance with silent SMTP', { vehicles: vehs, http: t.r.done ? t.r.r.status : 'NO RESPONSE within 40 s', body: t.r.done ? t.r.r.json : null, ms: t.ms, connections: stub.state.connections - c0, emailLog: (await L.q('select emails_sent, emails_failed, failure_reason from email_logs order by id desc limit 1'))[0] });
    stub.dropAll();
  }
  stub.setMode('ok'); await L.setEmailConfig(admin, L.stubConfig(PORT));
  await L.sleep(2000);

  // --- C5 cross-customer recipients in the APK bulk join (vehicle 4 has 4 different customers) -------------
  {
    const rows = await L.q("select r.id as reservation_id, r.customer_id, r.status, r.deleted_at is not null as deleted, c.name, c.email, c.email_for_mot from reservations r join customers c on c.id=r.customer_id where r.vehicle_id=4 order by r.id");
    const n0 = msgs().length;
    const t = await L.timed(() => admin.post('/api/notifications/send', { vehicleIds: [4], template: 'apk' }));
    L.record('C5 APK bulk for one vehicle with several historical customers', { reservationsOnVehicle: rows, http: t.r.status, body: t.r.json, msgs: msgs().length - n0, recipients: msgs().slice(n0).map(m => ({ to: m.headerTo, subject: m.subject })) });
  }

  L.flush('p16-c-hang.out.json');
  await stub.stop();
  process.exit(0);
})().catch(async (e) => { console.error('FATAL', e); L.flush('p16-c-hang.out.json'); process.exit(1); });
