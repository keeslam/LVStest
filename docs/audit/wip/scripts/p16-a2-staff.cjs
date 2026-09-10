// Phase 16 A2: continuation of p16-a-staff.cjs (which aborted at mode=drop because the
// request never returned). Every request here is capped client-side (CAP ms) so a hanging
// send cannot stall the script; the stub is then released and late delivery is observed.
'use strict';
const { start } = require('./p16-stub.cjs');
const L = require('./p16-lib.cjs');

const PORT = 2525;
const DOC_ID = 314;
const RCPT = 'audit-p16-rcpt@example.invalid';
const CAP = 20000;

function capped(p, ms = CAP) {
  return Promise.race([p.then(r => ({ done: true, r })), L.sleep(ms).then(() => ({ done: false, r: null }))]);
}

(async () => {
  await L.snapshotOriginal();
  const admin = await L.getAdmin('10.16.1.11');
  const stub = await start({ port: PORT, mode: 'ok' });
  const msgs = () => stub.state.messages;
  const last = () => msgs()[msgs().length - 1];
  const docBody = { recipients: RCPT, subject: 'AUDIT-P16 document', message: 'AUDIT-P16 body' };
  const sendDoc = (body = docBody, docId = DOC_ID) => L.timed(() => capped(admin.post(`/api/documents/${docId}/email`, body)));

  // --- 4. failure modes with cap + release ------------------------------------------
  for (const mode of ['drop', 'auth535', 'rcpt550', 'tls-required', 'starttls-only', 'drop-data']) {
    stub.setMode(mode);
    await L.setEmailConfig(admin, L.stubConfig(PORT)); // clears transporter pool between modes
    const n0 = msgs().length; const c0 = stub.state.connections;
    const h0 = await L.health();
    const t = await sendDoc();
    const h1 = await L.health();
    const rec = { http: t.r.done ? t.r.r.status : 'NO RESPONSE within ' + CAP + 'ms', body: t.r.done ? t.r.r.json : null, ms: t.ms, connectionsDuringRequest: stub.state.connections - c0, msgsCaptured: msgs().length - n0, health: [h0, h1], stubCmds: stub.state.log.filter(l => l.event === 'cmd' && l.id > c0).map(l => l.line).slice(0, 10) };
    if (!t.r.done) {
      // still hanging: watch the connection rate for 10 s, then release the stub and see whether the message is delivered late
      const cA = stub.state.connections; await L.sleep(10000); const cB = stub.state.connections;
      rec.connectionsPer10s = cB - cA;
      stub.setMode('ok');
      const late = await capped(t.r ? Promise.resolve(null) : Promise.resolve(null), 0); // placeholder
      await L.sleep(3000);
      rec.afterRelease = { msgsDelivered: msgs().length - n0, lastSubject: last()?.subject, connectionsTotal: stub.state.connections - c0 };
    }
    L.record('A4 mode=' + mode, rec);
  }
  // Recovery after failure (stub back to ok, NO cache clear): does the pooled transporter still work?
  stub.setMode('ok'); { const n0 = msgs().length; const t = await sendDoc(); L.record('A4r recovery without cache clear', { http: t.r.done ? t.r.r.status : 'hang', ms: t.ms, msgs: msgs().length - n0 }); }

  // --- 5. connection refused / unreachable / bad config ---------------------------
  const cfgCases = [
    ['refused 127.0.0.1:2526', L.stubConfig(2526)],
    ['bad host (DNS)', L.stubConfig(PORT, { smtpHost: 'smtp.audit-p16.invalid' })],
    ['non-numeric port', L.stubConfig(PORT, { smtpPort: 'abc' })],
    ['port 0', L.stubConfig(PORT, { smtpPort: '0' })],
    ['port 99999', L.stubConfig(PORT, { smtpPort: '99999' })],
    ['negative port', L.stubConfig(PORT, { smtpPort: '-1' })],
    ['empty port -> default 587', L.stubConfig(PORT, { smtpPort: '' })],
    ['smtpSecure:true on plain stub (ignored?)', L.stubConfig(PORT, { smtpSecure: true })],
    ['numeric port 465 as number', L.stubConfig(PORT, { smtpPort: 465 })],
    ['missing fromEmail', L.stubConfig(PORT, { fromEmail: '' })],
    ['invalid fromEmail', L.stubConfig(PORT, { fromEmail: 'not an address' })],
    ['fromName with quote/newline', L.stubConfig(PORT, { fromName: 'AUDIT "P16"\r\nX-Inj: 1' })],
    ['missing smtpUser', L.stubConfig(PORT, { smtpUser: '' })],
    ['missing password', L.stubConfig(PORT, { smtpPassword: '' })],
    ['host with scheme', L.stubConfig(PORT, { smtpHost: 'smtp://127.0.0.1' })],
    ['host with port suffix', L.stubConfig(PORT, { smtpHost: '127.0.0.1:2525' })],
    ['value is a string, not an object', 'AUDIT-P16 not json'],
    ['unroutable 10.255.255.1:2525 (2 min connectionTimeout expected)', L.stubConfig(2525, { smtpHost: '10.255.255.1' })],
  ];
  stub.setMode('ok');
  for (const [name, cfg] of cfgCases) {
    let saved;
    try { saved = await L.setEmailConfig(admin, cfg); } catch (e) { L.record('A5 ' + name, { saveError: e.message }); continue; }
    const n0 = msgs().length; const c0 = stub.state.connections;
    const h0 = await L.health();
    const t = await sendDoc();
    const h1 = await L.health();
    L.record('A5 ' + name, { savedValue: saved.value, http: t.r.done ? t.r.r.status : 'NO RESPONSE within ' + CAP + 'ms', body: t.r.done ? t.r.r.json : null, ms: t.ms, connections: stub.state.connections - c0, msgs: msgs().length - n0, mailFrom: msgs().length > n0 ? last().mailFrom : null, headerFrom: msgs().length > n0 ? last().headerFrom : null, headers: msgs().length > n0 ? last().raw.slice(0, 160) : null, health: [h0.status, h1.status] });
  }
  await L.setEmailConfig(admin, L.stubConfig(PORT));

  // --- 6. no configuration rows at all --------------------------------------------
  const rows = await L.q("select id, key from app_settings where category='email'");
  for (const r of rows) {
    const cur = (await L.q('select value, description from app_settings where id=$1', [r.id]))[0];
    const pr = await admin.put(`/api/app-settings/${r.id}`, { key: r.key, value: cur.value, category: 'email_audit_p16_disabled', description: cur.description });
    console.log('disabled row', r.id, pr.status);
  }
  { const n0 = msgs().length; const t = await sendDoc();
    const gps = await admin.post('/api/notifications/send-gps-activation', { vehicleData: { brand: 'AUDIT', model: 'P16', licensePlate: 'AU001X', imei: '123456789012345' } });
    L.record('A6 no email rows', { http: t.r.done ? t.r.r.status : 'hang', body: t.r.done ? t.r.r.json : null, ms: t.ms, msgs: msgs().length - n0, gpsHttp: gps.status, gpsBody: gps.json }); }
  for (const r of rows) {
    const cur = (await L.q('select value, description from app_settings where id=$1', [r.id]))[0];
    const pr = await admin.put(`/api/app-settings/${r.id}`, { key: r.key, value: cur.value, category: 'email', description: cur.description });
    console.log('re-enabled row', r.id, pr.status);
  }
  // config cache TTL: change the row directly in the DB (bypassing the API cache clear) and see if the app keeps using the old config for up to 60 s
  await L.setEmailConfig(admin, L.stubConfig(PORT, { fromEmail: 'p16-before@example.invalid' }));
  await sendDoc();
  await L.q("update app_settings set value = jsonb_set(value::jsonb, '{fromEmail}', '\"p16-after-direct-db@example.invalid\"')::json where key='email_config'");
  { const n0 = msgs().length; const t = await sendDoc(); L.record('A6b config cache after direct DB change', { http: t.r.done ? t.r.r.status : 'hang', mailFrom: msgs().length > n0 ? last().mailFrom : null }); }

  // --- 7. purpose-specific config precedence (email_documents vs email_config) ------
  await L.setEmailConfig(admin, L.stubConfig(PORT, { fromEmail: 'p16-default@example.invalid' }));
  const docsCfg = await L.setEmailConfig(admin, L.stubConfig(PORT, { fromEmail: 'p16-documents@example.invalid', purpose: 'documents' }), 'email_documents');
  { const n0 = msgs().length; const t = await sendDoc(); L.record('A7 purpose precedence email_documents', { http: t.r.done ? t.r.r.status : 'hang', msgs: msgs().length - n0, mailFrom: last()?.mailFrom }); }
  // an unrelated category=email row with a broken value: does it break the fallback?
  const junk = await admin.post('/api/app-settings', { key: 'email_zzz_audit_p16', category: 'email', value: { foo: 'bar' }, description: 'AUDIT-P16 junk' });
  await admin.del(`/api/app-settings/${docsCfg.id}`);
  { const n0 = msgs().length; const t = await sendDoc(); L.record('A7b junk email row present, email_config still there', { http: t.r.done ? t.r.r.status : 'hang', msgs: msgs().length - n0, mailFrom: last()?.mailFrom }); }
  await admin.del(`/api/app-settings/${junk.json.id}`);
  await L.setEmailConfig(admin, L.stubConfig(PORT));

  // --- 8. bulk notifications (APK / maintenance / custom) + GPS + email_logs ------------
  const veh = (await L.q("select v.id, v.license_plate, v.apk_date, c.id as customer_id, c.name, c.preferred_language, c.email_for_mot, c.email from vehicles v join reservations r on r.vehicle_id=v.id and r.status='picked_up' and r.deleted_at is null join customers c on c.id=r.customer_id where r.customer_id=179 order by r.id desc limit 1"))[0];
  const bodyOf = (m, type) => m ? L.qp(m.raw).match(new RegExp('text/' + type + '[\\s\\S]*?\\r\\n\\r\\n([\\s\\S]*?)\\r\\n--'))?.[1] : null;
  let logs0 = Number((await L.q('select count(*) from email_logs'))[0].count);
  { const n0 = msgs().length; const t = await L.timed(() => admin.post('/api/notifications/send', { vehicleIds: [veh.id], template: 'apk' })); const m = last();
    L.record('A8a bulk APK reminder', { vehicle: veh, http: t.r.status, body: t.r.json, ms: t.ms, msgs: msgs().length - n0, mail: L.summarize(m), text: bodyOf(m, 'plain')?.slice(0, 400), emailLogsDelta: Number((await L.q('select count(*) from email_logs'))[0].count) - logs0, lastLog: (await L.q('select * from email_logs order by id desc limit 1'))[0] }); }
  { const n0 = msgs().length; const t = await L.timed(() => admin.post('/api/notifications/send', { vehicleIds: [veh.id], template: 'maintenance' })); const m = last();
    L.record('A8b bulk maintenance reminder', { http: t.r.status, body: t.r.json, msgs: msgs().length - n0, subject: m?.subject, rcpt: m?.rcptTo, text: bodyOf(m, 'plain')?.slice(0, 300) }); }
  { const n0 = msgs().length; const t = await L.timed(() => admin.post('/api/notifications/send', { vehicleIds: [veh.id], template: 'custom', customSubject: 'AUDIT-P16 {vehiclePlate} {customerName}', customMessage: 'Hallo {customerName}, {vehiclePlate} {apkDate} {unknownPlaceholder} <script>alert(1)</script>' })); const m = last();
    L.record('A8c bulk custom placeholders/html', { http: t.r.status, body: t.r.json, msgs: msgs().length - n0, subject: m?.subject, html: bodyOf(m, 'html')?.slice(0, 500) }); }
  // English customer
  await L.q("update customers set preferred_language='en' where id=$1", [veh.customer_id]);
  { const n0 = msgs().length; const t = await L.timed(() => admin.post('/api/notifications/send', { vehicleIds: [veh.id], template: 'apk' })); const m = last();
    L.record('A8d bulk APK english', { http: t.r.status, msgs: msgs().length - n0, subject: m?.subject, text: bodyOf(m, 'plain')?.slice(0, 120) }); }
  await L.q("update customers set preferred_language='nl' where id=$1", [veh.customer_id]);
  // vehicle without APK date
  await L.q('update vehicles set apk_date = null where id=$1', [veh.id]);
  { const n0 = msgs().length; const t = await L.timed(() => admin.post('/api/notifications/send', { vehicleIds: [veh.id], template: 'apk' })); const m = last();
    L.record('A8e bulk APK without apk date', { http: t.r.status, msgs: msgs().length - n0, subject: m?.subject, text: bodyOf(m, 'plain')?.slice(0, 200) }); }
  await L.q('update vehicles set apk_date = $2 where id=$1', [veh.id, veh.apk_date]);
  // bulk with auth failure
  stub.setMode('auth535'); await L.setEmailConfig(admin, L.stubConfig(PORT));
  { const n0 = msgs().length; const t = await L.timed(() => admin.post('/api/notifications/send', { vehicleIds: [veh.id], template: 'apk' }));
    L.record('A8f bulk APK with auth535', { http: t.r.status, body: t.r.json, ms: t.ms, msgs: msgs().length - n0, lastLog: (await L.q('select * from email_logs order by id desc limit 1'))[0] }); }
  stub.setMode('ok'); await L.setEmailConfig(admin, L.stubConfig(PORT));
  // double-click on bulk
  { const n0 = msgs().length; const [b1, b2] = await Promise.all([admin.post('/api/notifications/send', { vehicleIds: [veh.id], template: 'apk' }), admin.post('/api/notifications/send', { vehicleIds: [veh.id], template: 'apk' })]);
    L.record('A8g bulk double click', { http: [b1.status, b2.status], msgs: msgs().length - n0 }); }
  // GPS activation
  const gpsRow = await admin.post('/api/app-settings', { key: 'gps_recipient_email', category: 'gps', value: { email: 'audit-p16-gps@example.invalid' }, description: 'AUDIT-P16 temp' });
  { const n0 = msgs().length; const t = await L.timed(() => admin.post('/api/notifications/send-gps-activation', { vehicleData: { brand: 'AUDIT', model: 'P16', licensePlate: 'AU001X', imei: '123456789012345' } })); const m = last();
    L.record('A8h GPS activation', { gpsRowStatus: gpsRow.status, http: t.r.status, body: t.r.json, msgs: msgs().length - n0, mail: L.summarize(m), text: m ? L.qp(m.raw).slice(m.raw.indexOf('\r\n\r\n') + 4, m.raw.indexOf('\r\n\r\n') + 300) : null, lastLog: (await L.q('select * from email_logs order by id desc limit 1'))[0] }); }
  { const n0 = msgs().length; const t = await L.timed(() => admin.post('/api/notifications/send-gps-activation', { vehicleData: { brand: 'AUDIT', model: 'P16', licensePlate: 'AU001X', imei: '<b>x</b>\r\nBcc: z@example.invalid' } })); const m = last();
    L.record('A8i GPS activation imei injection', { http: t.r.status, msgs: msgs().length - n0, rcpt: m?.rcptTo, subject: m?.subject }); }
  await admin.del(`/api/app-settings/${gpsRow.json.id}`);

  // --- 9. settings exposure re-check (BUG-010) ---------------------------------------------
  const s1 = await admin.get('/api/app-settings');
  const s2 = await admin.get('/api/app-settings/email');
  const s3 = await admin.get('/api/settings');
  L.record('A9 settings exposure', { appSettingsPw: s1.json.find(x => x.key === 'email_config')?.value?.smtpPassword, appSettingsEmailPw: Array.isArray(s2.json) ? s2.json.map(x => x.value?.smtpPassword) : s2.json, settingsRoute: s3.status, settingsHasPw: JSON.stringify(s3.json).includes('AUDIT-p16-smtp-secret') });

  // --- 10. SMTP test route with the stub -----------------------------------------------
  stub.setMode('auth535');
  let tr = await admin.post('/api/app-settings/email/test', { smtpHost: '127.0.0.1', smtpPort: String(PORT), smtpUser: 'u', smtpPassword: 'p' });
  L.record('A10a smtp test auth535', { http: tr.status, body: tr.json });
  stub.setMode('ok');
  tr = await admin.post('/api/app-settings/email/test', { smtpHost: '127.0.0.1', smtpPort: String(PORT), smtpUser: 'u', smtpPassword: 'p' });
  L.record('A10b smtp test ok', { http: tr.status, body: tr.json });
  tr = await admin.post('/api/app-settings/email/test', { smtpHost: '127.0.0.1', smtpPort: 'abc', smtpUser: 'u', smtpPassword: 'p' });
  L.record('A10c smtp test non-numeric port', { http: tr.status, body: tr.json });
  stub.setMode('drop');
  { const t = await L.timed(() => capped(admin.post('/api/app-settings/email/test', { smtpHost: '127.0.0.1', smtpPort: String(PORT), smtpUser: 'u', smtpPassword: 'p' })));
    L.record('A10d smtp test drop mode', { http: t.r.done ? t.r.r.status : 'hang', body: t.r.done ? t.r.r.json : null, ms: t.ms }); }
  stub.setMode('ok');

  await L.setEmailConfig(admin, L.stubConfig(PORT));
  L.flush('p16-a2-staff.out.json');
  await stub.stop();
  process.exit(0);
})().catch(async (e) => { console.error('FATAL', e); L.flush('p16-a2-staff.out.json'); process.exit(1); });
