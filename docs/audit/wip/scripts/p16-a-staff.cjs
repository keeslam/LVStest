// Phase 16 A: staff-side mail paths (document e-mail, send-documents, bulk notifications, GPS)
// against the p16 stub in every failure mode. Run from repo root: node docs/audit/wip/scripts/p16-a-staff.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const { start } = require('./p16-stub.cjs');
const L = require('./p16-lib.cjs');

const PORT = 2525;
const DOC_ID = 314; // Contract (Unsigned), file ..\audit-uploads\contracts\AU143X\AU143X_contract_20260910.pdf
const DOC_ID_2 = 315;
const RCPT = 'audit-p16-rcpt@example.invalid';

(async () => {
  const orig = await L.snapshotOriginal();
  console.log('original rows snapshot:', orig.map(r => r.id + ':' + r.key).join(', '));
  const admin = await L.getAdmin('10.16.1.10');
  const stub = await start({ port: PORT, mode: 'ok' });
  const msgs = () => stub.state.messages;
  const last = () => msgs()[msgs().length - 1];

  const sendDoc = (body, docId = DOC_ID) => L.timed(() => admin.post(`/api/documents/${docId}/email`, body));
  const sendDocs = (body) => L.timed(() => admin.post('/api/email/send-documents', body));
  const docBody = { recipients: RCPT, subject: 'AUDIT-P16 document', message: 'AUDIT-P16 regel 1\nregel 2 <b>bold</b>' };

  // --- 0. baseline (stub ok) --------------------------------------------------
  await L.setEmailConfig(admin, L.stubConfig(PORT));
  let n0 = msgs().length;
  let t = await sendDoc(docBody);
  const docRow = (await L.q('select file_path, file_name from documents where id=$1', [DOC_ID]))[0];
  const diskPath = path.join(process.cwd(), docRow.file_path);
  const diskSize = fs.existsSync(diskPath) ? fs.statSync(diskPath).size : null;
  let m = last();
  let attSize = null;
  if (m && m.hasAttachment) {
    // decode the base64 attachment part and compare with the disk file
    const idx = m.raw.search(/Content-Disposition: attachment/i);
    const part = m.raw.slice(idx);
    const b64 = part.slice(part.indexOf('\r\n\r\n') + 4).split(/\r\n--/)[0].replace(/\r?\n/g, '');
    const buf = Buffer.from(b64, 'base64');
    attSize = buf.length;
    var attMatchesDisk = diskSize !== null && buf.equals(fs.readFileSync(diskPath));
  }
  L.record('A0 baseline document mail', { http: t.r.status, body: t.r.json, ms: t.ms, msgs: msgs().length - n0, mail: L.summarize(m), diskSize, attSize, attMatchesDisk: attMatchesDisk ?? null,
    htmlBody: m ? L.qp(m.raw).match(/text\/html[\s\S]*?\r\n\r\n([\s\S]*?)\r\n--/)?.[1]?.slice(0, 300) : null,
    textBody: m ? L.qp(m.raw).match(/text\/plain[\s\S]*?\r\n\r\n([\s\S]*?)\r\n--/)?.[1]?.slice(0, 300) : null,
    headers: m ? m.raw.slice(0, m.raw.indexOf('\r\n\r\n')) : null });

  // --- 1. duplicate send (double click) -------------------------------------------
  n0 = msgs().length;
  const [d1, d2] = await Promise.all([sendDoc(docBody), sendDoc(docBody)]);
  L.record('A1 double click same document', { http: [d1.r.status, d2.r.status], msgs: msgs().length - n0, rcpts: msgs().slice(n0).map(x => x.rcptTo) });

  // --- 2. recipients: multiple, invalid, empty, header-injection ------------------
  n0 = msgs().length;
  t = await sendDoc({ ...docBody, recipients: 'a1@example.invalid, a2@example.invalid,,  ' });
  L.record('A2a multiple recipients', { http: t.r.status, body: t.r.json, msgs: msgs().length - n0, rcpt: last()?.rcptTo, headerTo: last()?.headerTo });
  n0 = msgs().length;
  t = await sendDoc({ ...docBody, recipients: 'not-an-email' });
  L.record('A2b invalid recipient (stub ok)', { http: t.r.status, body: t.r.json, msgs: msgs().length - n0, rcpt: last()?.rcptTo, stubLog: stub.state.log.slice(-6) });
  n0 = msgs().length;
  t = await sendDoc({ ...docBody, recipients: '' });
  L.record('A2c empty recipient', { http: t.r.status, body: t.r.json, msgs: msgs().length - n0 });
  n0 = msgs().length;
  t = await sendDoc({ ...docBody, recipients: 'x@example.invalid\r\nBcc: y@example.invalid', subject: 'AUDIT-P16 inj\r\nX-Injected: yes' });
  L.record('A2d header injection attempt', { http: t.r.status, body: t.r.json, msgs: msgs().length - n0, rcpt: last()?.rcptTo, headers: last() ? last().raw.slice(0, last().raw.indexOf('\r\n\r\n')) : null });

  // --- 3. send-documents: multi, duplicate ids, missing file, unknown id ----------
  n0 = msgs().length;
  t = await sendDocs({ documentIds: [DOC_ID, DOC_ID_2], recipientEmail: RCPT, subject: 'AUDIT-P16 multi', message: 'multi' });
  L.record('A3a send-documents two docs', { http: t.r.status, body: t.r.json, msgs: msgs().length - n0, att: last()?.attachmentFilenames, size: last()?.dataSize });
  n0 = msgs().length;
  t = await sendDocs({ documentIds: [DOC_ID, DOC_ID], recipientEmail: RCPT, subject: 'AUDIT-P16 dup ids', message: 'dup' });
  L.record('A3b send-documents duplicate ids', { http: t.r.status, body: t.r.json, msgs: msgs().length - n0, att: last()?.attachmentFilenames });
  // fake document row with a missing file
  const fake = (await L.q("insert into documents (vehicle_id, reservation_id, document_type, file_name, file_path, file_size, content_type, upload_date, created_by) values (1813, 3438, 'Contract (AUDIT-P16 missing file)', 'AUDIT-P16-missing.pdf', '..\\\\audit-uploads\\\\contracts\\\\AUDIT-P16\\\\does-not-exist.pdf', 123, 'application/pdf', now(), 'AUDIT-P16') returning id"))[0].id;
  n0 = msgs().length;
  t = await sendDoc(docBody, fake);
  L.record('A3c single doc missing file', { fakeDocId: fake, http: t.r.status, body: t.r.json, msgs: msgs().length - n0 });
  n0 = msgs().length;
  t = await sendDocs({ documentIds: [DOC_ID, fake], recipientEmail: RCPT, subject: 'AUDIT-P16 partial', message: 'partial' });
  L.record('A3d send-documents one valid + one missing', { http: t.r.status, body: t.r.json, msgs: msgs().length - n0, att: last()?.attachmentFilenames });
  n0 = msgs().length;
  t = await sendDocs({ documentIds: [999999], recipientEmail: RCPT, subject: 'AUDIT-P16 unknown', message: 'x' });
  L.record('A3e send-documents unknown id', { http: t.r.status, body: t.r.json, msgs: msgs().length - n0 });
  n0 = msgs().length;
  t = await sendDocs({ documentIds: [DOC_ID], recipientEmail: 'not-an-email', subject: 'AUDIT-P16', message: '<img src=x onerror=alert(1)>' });
  L.record('A3f send-documents invalid recipient + html message', { http: t.r.status, body: t.r.json, msgs: msgs().length - n0, rcpt: last()?.rcptTo, html: last() ? L.qp(last().raw).match(/text\/html[\s\S]*?\r\n\r\n([\s\S]*?)\r\n--/)?.[1]?.slice(0, 200) : null });

  // --- 4. fast failure modes -------------------------------------------------------
  for (const mode of ['drop', 'auth535', 'rcpt550', 'tls-required', 'starttls-only', 'drop-data']) {
    stub.setMode(mode);
    await L.setEmailConfig(admin, L.stubConfig(PORT)); // clears transporter pool between modes
    n0 = msgs().length; const c0 = stub.state.connections;
    t = await sendDoc(docBody);
    L.record('A4 mode=' + mode, { http: t.r.status, body: t.r.json, ms: t.ms, connections: stub.state.connections - c0, msgsCaptured: msgs().length - n0, stubLog: stub.state.log.filter(l => l.event === 'cmd' && l.id > c0).map(l => l.line).slice(0, 12) });
  }
  // recovery after failure: same config, stub back to ok, NO cache clear
  stub.setMode('ok'); n0 = msgs().length;
  t = await sendDoc(docBody);
  L.record('A4r recovery after drop-data without cache clear', { http: t.r.status, ms: t.ms, msgs: msgs().length - n0 });

  // --- 5. connection refused / unreachable / bad config ---------------------------
  const cfgCases = [
    ['refused 127.0.0.1:2526', L.stubConfig(2526)],
    ['unroutable 10.255.255.1:2525', L.stubConfig(2525, { smtpHost: '10.255.255.1' })],
    ['bad host (DNS)', L.stubConfig(PORT, { smtpHost: 'smtp.audit-p16.invalid' })],
    ['non-numeric port', L.stubConfig(PORT, { smtpPort: 'abc' })],
    ['port 0', L.stubConfig(PORT, { smtpPort: '0' })],
    ['port 99999', L.stubConfig(PORT, { smtpPort: '99999' })],
    ['negative port', L.stubConfig(PORT, { smtpPort: '-1' })],
    ['empty port -> default 587', L.stubConfig(PORT, { smtpPort: '' })],
    ['smtpSecure:true on plain stub (ignored?)', L.stubConfig(PORT, { smtpSecure: true })],
    ['numeric port 465 (secure derived from string compare)', L.stubConfig(PORT, { smtpPort: 465 })],
    ['missing fromEmail', L.stubConfig(PORT, { fromEmail: '' })],
    ['invalid fromEmail', L.stubConfig(PORT, { fromEmail: 'not an address' })],
    ['fromName with quote/newline', L.stubConfig(PORT, { fromName: 'AUDIT "P16"\r\nX-Inj: 1' })],
    ['missing smtpUser', L.stubConfig(PORT, { smtpUser: '' })],
    ['missing password', L.stubConfig(PORT, { smtpPassword: '' })],
    ['host with scheme', L.stubConfig(PORT, { smtpHost: 'smtp://127.0.0.1' })],
    ['host with port suffix', L.stubConfig(PORT, { smtpHost: '127.0.0.1:2525' })],
  ];
  stub.setMode('ok');
  for (const [name, cfg] of cfgCases) {
    const saved = await L.setEmailConfig(admin, cfg);
    n0 = msgs().length; const c0 = stub.state.connections;
    const h0 = await L.health();
    t = await sendDoc(docBody);
    const h1 = await L.health();
    L.record('A5 ' + name, { savedValue: saved.value, http: t.r.status, body: t.r.json, ms: t.ms, connections: stub.state.connections - c0, msgs: msgs().length - n0, mailFrom: last()?.mailFrom, headerFrom: last()?.headerFrom, health: [h0.status, h1.status] });
  }

  // --- 6. no configuration rows at all --------------------------------------------
  const rows = await L.q("select id, key from app_settings where category='email'");
  for (const r of rows) {
    const cur = (await admin.get('/api/app-settings')).json.find(x => x.id === r.id);
    const pr = await admin.put(`/api/app-settings/${r.id}`, { key: r.key, value: cur.value, category: 'email_audit_p16_disabled', description: cur.description });
    console.log('disabled row', r.id, pr.status);
  }
  n0 = msgs().length;
  t = await sendDoc(docBody);
  const gpsNoCfg = await admin.post('/api/notifications/send-gps-activation', { vehicleData: { brand: 'AUDIT', model: 'P16', licensePlate: 'AU001X', imei: '123456789012345' } });
  L.record('A6 no email rows', { http: t.r.status, body: t.r.json, ms: t.ms, msgs: msgs().length - n0, gpsHttp: gpsNoCfg.status, gpsBody: gpsNoCfg.json });
  for (const r of rows) {
    const cur = (await L.q('select value, description from app_settings where id=$1', [r.id]))[0];
    const pr = await admin.put(`/api/app-settings/${r.id}`, { key: r.key, value: cur.value, category: 'email', description: cur.description });
    console.log('re-enabled row', r.id, pr.status);
  }

  // --- 7. purpose-specific config precedence (email_documents vs email_config) ------
  await L.setEmailConfig(admin, L.stubConfig(PORT, { fromEmail: 'p16-default@example.invalid' }));
  const docsCfg = await L.setEmailConfig(admin, L.stubConfig(PORT, { fromEmail: 'p16-documents@example.invalid', purpose: 'documents' }), 'email_documents');
  n0 = msgs().length;
  t = await sendDoc(docBody);
  L.record('A7 purpose precedence email_documents', { http: t.r.status, msgs: msgs().length - n0, mailFrom: last()?.mailFrom });
  await admin.del(`/api/app-settings/${docsCfg.id}`);
  await L.setEmailConfig(admin, L.stubConfig(PORT));

  // --- 8. bulk notifications (APK) + GPS activation + email_logs -----------------------
  const veh = (await L.q("select v.id, v.license_plate, v.apk_date, c.preferred_language, c.email_for_mot, c.email from vehicles v join reservations r on r.vehicle_id=v.id and r.status='picked_up' and r.deleted_at is null join customers c on c.id=r.customer_id where r.customer_id=179 order by r.id desc limit 1"))[0];
  const logs0 = Number((await L.q('select count(*) from email_logs'))[0].count);
  n0 = msgs().length;
  t = await L.timed(() => admin.post('/api/notifications/send', { vehicleIds: [veh.id], template: 'apk' }));
  const apkMail = last();
  L.record('A8a bulk APK reminder', { vehicle: veh, http: t.r.status, body: t.r.json, ms: t.ms, msgs: msgs().length - n0, mail: L.summarize(apkMail), text: apkMail ? L.qp(apkMail.raw).match(/text\/plain[\s\S]*?\r\n\r\n([\s\S]*?)\r\n--/)?.[1]?.slice(0, 400) : null, emailLogsDelta: Number((await L.q('select count(*) from email_logs'))[0].count) - logs0, lastLog: (await L.q('select * from email_logs order by id desc limit 1'))[0] });
  n0 = msgs().length;
  t = await L.timed(() => admin.post('/api/notifications/send', { vehicleIds: [veh.id], template: 'custom', customSubject: 'AUDIT-P16 {vehiclePlate} {customerName}', customMessage: 'Hallo {customerName}, {vehiclePlate} {apkDate} {unknownPlaceholder} <script>alert(1)</script>' }));
  const cm = last();
  L.record('A8b bulk custom message placeholders', { http: t.r.status, body: t.r.json, msgs: msgs().length - n0, subject: cm?.subject, html: cm ? L.qp(cm.raw).match(/text\/html[\s\S]*?\r\n\r\n([\s\S]*?)\r\n--/)?.[1]?.slice(0, 500) : null });
  // bulk with stub failing (auth535): what does the API + email_logs say?
  stub.setMode('auth535'); await L.setEmailConfig(admin, L.stubConfig(PORT));
  n0 = msgs().length;
  t = await L.timed(() => admin.post('/api/notifications/send', { vehicleIds: [veh.id], template: 'apk' }));
  L.record('A8c bulk APK with auth535', { http: t.r.status, body: t.r.json, ms: t.ms, msgs: msgs().length - n0, lastLog: (await L.q('select * from email_logs order by id desc limit 1'))[0] });
  stub.setMode('ok'); await L.setEmailConfig(admin, L.stubConfig(PORT));
  // GPS activation
  const gpsRow = await admin.post('/api/app-settings', { key: 'gps_recipient_email', category: 'gps', value: { email: 'audit-p16-gps@example.invalid' }, description: 'AUDIT-P16 temp' });
  n0 = msgs().length;
  t = await L.timed(() => admin.post('/api/notifications/send-gps-activation', { vehicleData: { brand: 'AUDIT', model: 'P16', licensePlate: 'AU001X', imei: '123456789012345' } }));
  const gm = last();
  L.record('A8d GPS activation', { gpsRowStatus: gpsRow.status, http: t.r.status, body: t.r.json, msgs: msgs().length - n0, mail: L.summarize(gm), text: gm ? L.qp(gm.raw).match(/text\/plain[\s\S]*?\r\n\r\n([\s\S]*?)$/)?.[1]?.slice(0, 300) : null, lastLog: (await L.q('select * from email_logs order by id desc limit 1'))[0] });
  await admin.del(`/api/app-settings/${gpsRow.json.id}`);

  // --- 9. what a non-admin sees / settings exposure re-check (BUG-010) ---------------
  const s1 = await admin.get('/api/app-settings');
  const s2 = await admin.get('/api/app-settings/email');
  const s3 = await admin.get('/api/settings');
  L.record('A9 settings exposure', { appSettingsPw: s1.json.find(x => x.key === 'email_config')?.value?.smtpPassword, appSettingsEmailPw: Array.isArray(s2.json) ? s2.json[0]?.value?.smtpPassword : s2.json, settingsRoute: s3.status, settingsPw: JSON.stringify(s3.json).includes('AUDIT-p16-smtp-secret') });

  // --- 10. SMTP test route with the stub (auth535 vs ok) -----------------------------
  stub.setMode('auth535');
  let tr = await admin.post('/api/app-settings/email/test', { smtpHost: '127.0.0.1', smtpPort: String(PORT), smtpUser: 'u', smtpPassword: 'p' });
  L.record('A10a smtp test auth535', { http: tr.status, body: tr.json });
  stub.setMode('ok');
  tr = await admin.post('/api/app-settings/email/test', { smtpHost: '127.0.0.1', smtpPort: String(PORT), smtpUser: 'u', smtpPassword: 'p' });
  L.record('A10b smtp test ok', { http: tr.status, body: tr.json });
  tr = await admin.post('/api/app-settings/email/test', { smtpHost: '127.0.0.1', smtpPort: 'abc', smtpUser: 'u', smtpPassword: 'p' });
  L.record('A10c smtp test non-numeric port', { http: tr.status, body: tr.json });

  await L.q('delete from documents where id=$1', [fake]);
  L.flush('p16-a-staff.out.json');
  await stub.stop();
  process.exit(0);
})().catch(async (e) => { console.error('FATAL', e); L.flush('p16-a-staff.out.json'); process.exit(1); });
