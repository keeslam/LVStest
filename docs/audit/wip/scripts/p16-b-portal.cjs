// Phase 16 B: portal mail paths (invite, resend, reset/forgot, activation tokens, new device,
// e-mail change, staff notification, request reply, maintenance approval, fine linked).
// Run from repo root: node docs/audit/wip/scripts/p16-b-portal.cjs
'use strict';
const crypto = require('crypto');
const { start } = require('./p16-stub.cjs');
const L = require('./p16-lib.cjs');

const PORT = 2525;
const CUST = 179;
const TS = Date.now();
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const linkOf = (m) => (m ? L.qp(m.raw).match(/href="([^"]+)"/)?.[1] : null);
const tokenOf = (m) => (linkOf(m) || '').match(/token=([0-9a-f]+)/)?.[1] || null;
const htmlOf = (m) => m ? L.qp(m.raw).match(/text\/html[\s\S]*?\r\n\r\n([\s\S]*?)(\r\n--|$)/)?.[1] : null;
const textOf = (m) => m ? L.qp(m.raw).match(/text\/plain[\s\S]*?\r\n\r\n([\s\S]*?)(\r\n--|$)/)?.[1] : null;
const leftovers = (s) => s ? (s.match(/\{\{[^}]*\}\}|undefined|null|NaN/g) || []) : [];
const summ = (m) => ({ ...L.summarize(m), link: linkOf(m), leftovers: leftovers(htmlOf(m)).concat(leftovers(m?.subject)) });
const nextWeekday = (daysAhead) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + daysAhead); while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

(async () => {
  await L.snapshotOriginal();
  const admin = await L.getAdmin('10.16.1.12');
  const stub = await start({ port: PORT, mode: 'ok' });
  const msgs = () => stub.state.messages;
  const last = () => msgs()[msgs().length - 1];
  await L.setEmailConfig(admin, L.stubConfig(PORT));
  const cfg0 = (await admin.get('/api/portal-admin/config')).json;
  console.log('portal config', JSON.stringify(cfg0));

  // --- B1 invite on account creation (with a hostile Host header) --------------------------
  const email = `audit-p16-invite-${TS}@example.invalid`;
  let n0 = msgs().length;
  let r = await admin.post(`/api/portal-admin/customers/${CUST}/accounts`, { email, fullName: 'AUDIT-P16 Invitee', role: 'admin' }, { headers: { Host: 'evil.example', 'X-Forwarded-Host': 'evil.example' } });
  const acc = r.json?.account;
  let m = last();
  let dbu = (await L.q('select invite_token_hash, invite_expires_at, created_at from portal_users where id=$1', [acc?.id]))[0];
  L.record('B1 invite mail on account create', { http: r.status, inviteSent: r.json?.inviteSent, accountId: acc?.id, msgs: msgs().length - n0, mail: summ(m), tokenLen: tokenOf(m)?.length, hashMatches: dbu && tokenOf(m) ? sha(tokenOf(m)) === dbu.invite_token_hash : null, expiresInH: dbu ? Math.round((new Date(dbu.invite_expires_at) - new Date(dbu.created_at)) / 36e5) : null, html: htmlOf(m)?.slice(0, 400), text: textOf(m)?.slice(0, 200) });

  // --- B2 resend twice concurrently: which token survives, single use, expiry -----------------
  n0 = msgs().length;
  const [i1, i2] = await Promise.all([admin.post(`/api/portal-admin/accounts/${acc.id}/invite`, { kind: 'invite' }), admin.post(`/api/portal-admin/accounts/${acc.id}/invite`, { kind: 'invite' })]);
  const two = msgs().slice(n0);
  const tokens = two.map(tokenOf);
  dbu = (await L.q('select invite_token_hash from portal_users where id=$1', [acc.id]))[0];
  const storedIdx = tokens.findIndex(t => t && sha(t) === dbu.invite_token_hash);
  const deadToken = tokens[storedIdx === 0 ? 1 : 0], liveToken = tokens[storedIdx];
  const anon = new L.Session('anon', { fakeIp: '10.16.2.50' }); await anon.get('/api/portal/csrf-token');
  const a1 = await anon.post('/api/portal/activate', { token: deadToken, password: 'AUDIT-p16-Pass-1234' });
  const a2 = await anon.post('/api/portal/activate', { token: liveToken, password: 'AUDIT-p16-Pass-1234' });
  const a3 = await anon.post('/api/portal/activate', { token: liveToken, password: 'AUDIT-p16-Pass-1234' });
  L.record('B2 double resend + activation', { http: [i1.status, i2.status], msgs: two.length, distinctTokens: new Set(tokens).size, storedTokenIsMail: storedIdx, activateWithOverwrittenToken: [a1.status, a1.json?.code || a1.json?.message], activateWithStoredToken: [a2.status, a2.json?.code || a2.json?.message], reuseStoredToken: [a3.status, a3.json?.code || a3.json?.message] });
  // expiry: issue a reset, push expiry into the past via DB, try to use it
  n0 = msgs().length;
  await admin.post(`/api/portal-admin/accounts/${acc.id}/invite`, { kind: 'reset' });
  const resetTok = tokenOf(last());
  await L.q("update portal_users set invite_expires_at = now() - interval '1 minute' where id=$1", [acc.id]);
  const a4 = await anon.post('/api/portal/activate', { token: resetTok, password: 'AUDIT-p16-Pass-9999' });
  L.record('B2b expired token', { subject: last()?.subject, http: a4.status, code: a4.json?.code || a4.json?.message });

  // --- B3 forgot-password ----------------------------------------------------------------
  const pub = new L.Session('pub', { fakeIp: '10.16.2.51' }); await pub.get('/api/portal/csrf-token');
  n0 = msgs().length;
  let t = await L.timed(() => pub.post('/api/portal/forgot', { email }));
  m = last();
  L.record('B3a forgot known active account', { http: t.r.status, body: t.r.json, ms: t.ms, msgs: msgs().length - n0, mail: summ(m), html: htmlOf(m)?.slice(0, 300) });
  const goodResetToken = tokenOf(m);
  n0 = msgs().length;
  t = await L.timed(() => pub.post('/api/portal/forgot', { email: `unknown-${TS}@example.invalid` }));
  L.record('B3b forgot unknown address', { http: t.r.status, body: t.r.json, ms: t.ms, msgs: msgs().length - n0 });
  await admin.patch(`/api/portal-admin/accounts/${acc.id}`, { active: false });
  n0 = msgs().length;
  t = await L.timed(() => pub.post('/api/portal/forgot', { email }));
  L.record('B3c forgot blocked account', { http: t.r.status, msgs: msgs().length - n0 });
  await admin.patch(`/api/portal-admin/accounts/${acc.id}`, { active: true });
  n0 = msgs().length;
  t = await L.timed(() => pub.post('/api/portal/forgot', { email: email.toUpperCase() }));
  L.record('B3d forgot with upper-cased address', { http: t.r.status, msgs: msgs().length - n0 });

  // --- B4 forgot while SMTP fails: token rotated, previous link dead, caller told ok ------------
  stub.setMode('auth535'); await L.setEmailConfig(admin, L.stubConfig(PORT));
  const hashBefore = (await L.q('select invite_token_hash from portal_users where id=$1', [acc.id]))[0].invite_token_hash;
  n0 = msgs().length;
  t = await L.timed(() => pub.post('/api/portal/forgot', { email }));
  const hashAfter = (await L.q('select invite_token_hash from portal_users where id=$1', [acc.id]))[0].invite_token_hash;
  const a5 = await anon.post('/api/portal/activate', { token: goodResetToken, password: 'AUDIT-p16-Pass-5555' });
  const logs = await L.q('select count(*) from email_logs');
  L.record('B4 forgot with SMTP 535', { http: t.r.status, body: t.r.json, msgs: msgs().length - n0, tokenRotatedDespiteFailure: hashBefore !== hashAfter, previousMailedLinkNowWorks: a5.status === 200, prevLinkResult: [a5.status, a5.json?.code], emailLogs: logs[0].count });
  stub.setMode('ok'); await L.setEmailConfig(admin, L.stubConfig(PORT));

  // --- B5 forgot double click --------------------------------------------------------------
  n0 = msgs().length;
  const [f1, f2] = await Promise.all([pub.post('/api/portal/forgot', { email }), pub.post('/api/portal/forgot', { email })]);
  const fm = msgs().slice(n0);
  const fh = (await L.q('select invite_token_hash from portal_users where id=$1', [acc.id]))[0].invite_token_hash;
  L.record('B5 forgot double click', { http: [f1.status, f2.status], msgs: fm.length, tokensValid: fm.map(x => sha(tokenOf(x) || '') === fh) });

  // --- B6 portalBaseUrl variants + Host header ---------------------------------------------
  for (const base of ['', 'https://audit-p16.example/', 'http://localhost:5001']) {
    const pr = await admin.put('/api/portal-admin/config', { ...cfg0, portalBaseUrl: base });
    n0 = msgs().length;
    await admin.post(`/api/portal-admin/accounts/${acc.id}/invite`, { kind: 'reset' }, { headers: { Host: 'evil.example' } });
    L.record('B6 portalBaseUrl=' + JSON.stringify(base), { configHttp: pr.status, configErr: pr.json?.message, msgs: msgs().length - n0, link: linkOf(last()) });
  }
  await admin.put('/api/portal-admin/config', cfg0);
  L.record('B6r portal config restored', { cfg: (await admin.get('/api/portal-admin/config')).json.portalBaseUrl });

  // --- B7 new-device mail on login (UA/IP into the template) ---------------------------------
  n0 = msgs().length;
  const dev = new L.Session('dev', { fakeIp: '10.16.2.99' });
  r = await dev.post('/api/portal/login', { email: 'portaal-test@example.com', password: 'portaal-test-1234' }, { headers: { 'User-Agent': 'AUDIT-P16 <b>bold</b> <a href="https://evil.example">x</a> {{name}}' } });
  await L.sleep(500);
  m = last();
  L.record('B7 new device mail', { loginHttp: r.status, msgs: msgs().length - n0, mail: summ(m), html: htmlOf(m)?.slice(0, 500) });
  await dev.get('/api/portal/csrf-token');

  // --- B8 e-mail change: mail to the NEW address; behaviour when SMTP fails ------------------------
  n0 = msgs().length;
  r = await dev.post('/api/portal/me/email', { newEmail: `audit-p16-newmail-${TS}@example.invalid`, currentPassword: 'portaal-test-1234' });
  m = last();
  L.record('B8a email change mail', { http: r.status, body: r.json, msgs: msgs().length - n0, mail: summ(m), html: htmlOf(m)?.slice(0, 300) });
  await dev.post('/api/portal/me/email/cancel', {});
  stub.setMode('auth535'); await L.setEmailConfig(admin, L.stubConfig(PORT));
  n0 = msgs().length;
  r = await dev.post('/api/portal/me/email', { newEmail: `audit-p16-newmail2-${TS}@example.invalid`, currentPassword: 'portaal-test-1234' });
  const pend = (await L.q('select pending_email, email_change_token_hash is not null as has_tok from portal_users where id=30'))[0];
  L.record('B8b email change with SMTP 535', { http: r.status, body: r.json, msgs: msgs().length - n0, db: pend });
  await dev.post('/api/portal/me/email/cancel', {});
  stub.setMode('ok'); await L.setEmailConfig(admin, L.stubConfig(PORT));

  // --- B9 staff notification mail: HTML injection through the portal user's own name -------------
  const cust0 = (await L.q('select email_general from customers where id=$1', [CUST]))[0];
  await dev.patch('/api/portal/me', { fullName: 'AUDIT-P16 <a href="https://evil.example/login">Klik hier om uw wachtwoord te vernieuwen</a>' });
  n0 = msgs().length;
  const cn0 = (await L.q('select max(id) as id from custom_notifications'))[0].id;
  r = await dev.patch('/api/portal/me/company', { emailGeneral: `audit-p16-general-${TS}@example.invalid` });
  m = last();
  const cn = await L.q('select id, title, description from custom_notifications where id > $1 order by id', [cn0 || 0]);
  L.record('B9a staff notification mail with injected HTML', { http: r.status, msgs: msgs().length - n0, mail: summ(m), html: htmlOf(m) || L.qp(m?.raw || '').slice(-600), inAppNotification: cn });
  await dev.patch('/api/portal/me', { fullName: 'Portaal Tester' });
  await L.q('update customers set email_general=$2 where id=$1', [CUST, cust0.email_general]);
  // staff notification when notificationEmail is empty
  await admin.put('/api/portal-admin/config', { ...cfg0, notificationEmail: '' });
  n0 = msgs().length;
  r = await dev.patch('/api/portal/me/company', { emailGeneral: cust0.email_general || 'audit-p16@example.invalid' });
  L.record('B9b staff notification without notificationEmail', { http: r.status, msgs: msgs().length - n0 });
  await admin.put('/api/portal-admin/config', cfg0);
  await L.q('update customers set email_general=$2 where id=$1', [CUST, cust0.email_general]);

  // --- B10 request + staff reply mail (also with SMTP failure) ----------------------------------
  n0 = msgs().length;
  r = await dev.post('/api/portal/requests', { type: 'other', message: 'AUDIT-P16 vraag <b>vet</b> {{name}}', payload: {} });
  const req1 = r.json?.id;
  const staffMail = last();
  L.record('B10a portal request created -> staff mail', { http: r.status, requestId: req1, msgs: msgs().length - n0, mail: summ(staffMail), html: htmlOf(staffMail) || L.qp(staffMail?.raw || '').slice(-400) });
  n0 = msgs().length;
  r = await admin.post(`/api/portal-requests/${req1}/reply`, { reply: 'AUDIT-P16 antwoord met <i>html</i> en {{name}}', status: 'done' });
  m = last();
  L.record('B10b staff reply mail', { http: r.status, status: r.json?.status, msgs: msgs().length - n0, mail: summ(m), html: htmlOf(m)?.slice(0, 400) });
  r = await dev.post('/api/portal/requests', { type: 'other', message: 'AUDIT-P16 vraag 2', payload: {} });
  const req2 = r.json?.id;
  stub.setMode('auth535'); await L.setEmailConfig(admin, L.stubConfig(PORT));
  n0 = msgs().length;
  r = await admin.post(`/api/portal-requests/${req2}/reply`, { reply: 'AUDIT-P16 antwoord 2', status: 'done' });
  const req2row = (await L.q('select status, replied_at is not null as replied from portal_requests where id=$1', [req2]))[0];
  L.record('B10c staff reply with SMTP 535', { http: r.status, body: r.json?.status, msgs: msgs().length - n0, db: req2row, emailLogs: (await L.q('select count(*) from email_logs'))[0].count, portalNotif: (await L.q('select type,title from portal_notifications where customer_id=$1 order by id desc limit 1', [CUST]))[0] });
  stub.setMode('ok'); await L.setEmailConfig(admin, L.stubConfig(PORT));

  // --- B11 maintenance request -> approval -> customer notification + portal_maintenance mail --------
  const rental = (await L.q("select id, vehicle_id from reservations where customer_id=$1 and status='picked_up' and deleted_at is null and type='standard' order by id desc limit 1", [CUST]))[0];
  n0 = msgs().length;
  r = await dev.post('/api/portal/requests', { type: 'maintenance', reservationId: rental.id, message: 'AUDIT-P16 onderhoud nodig', payload: { issue: 'AUDIT-P16 rammelt', urgent: 'true', needsReplacement: 'false' } });
  const mreq = r.json?.id;
  L.record('B11a maintenance request -> staff mail', { http: r.status, requestId: mreq, msgs: msgs().length - n0, subject: last()?.subject, err: r.json });
  const day1 = nextWeekday(5);
  n0 = msgs().length;
  const pn0 = (await L.q('select max(id) as id from portal_notifications'))[0].id || 0;
  t = await L.timed(() => admin.post(`/api/portal-requests/${mreq}/approve`, { startDate: day1, durationDays: 2, category: 'repair', note: 'AUDIT-P16 approve' }));
  m = last();
  const pn = await L.q('select id, type, title, description, dedupe_tag, link from portal_notifications where id > $1 order by id', [pn0]);
  L.record('B11b approve maintenance', { http: t.r.status, ms: t.ms, blockId: t.r.json?.block?.id, reqStatus: t.r.json?.status, msgs: msgs().length - n0, mails: msgs().slice(n0).map(summ), html: htmlOf(m)?.slice(0, 600), portalNotifications: pn });
  // second one with the mail server failing: is the approval still recorded, is the notification still created?
  r = await dev.post('/api/portal/requests', { type: 'maintenance', reservationId: rental.id, message: 'AUDIT-P16 onderhoud 2', payload: { issue: 'AUDIT-P16 piept', urgent: 'false', needsReplacement: 'false' } });
  const mreq2 = r.json?.id;
  stub.setMode('auth535'); await L.setEmailConfig(admin, L.stubConfig(PORT));
  const day2 = nextWeekday(12);
  n0 = msgs().length;
  const pn1 = (await L.q('select max(id) as id from portal_notifications'))[0].id || 0;
  t = await L.timed(() => admin.post(`/api/portal-requests/${mreq2}/approve`, { startDate: day2, durationDays: 1, category: 'scheduled_maintenance' }));
  L.record('B11c approve maintenance with SMTP 535', { http: t.r.status, blockId: t.r.json?.block?.id, reqStatus: t.r.json?.status, msgs: msgs().length - n0, createErr: r.json, portalNotifications: await L.q('select type, title from portal_notifications where id > $1 order by id', [pn1]), emailLogs: (await L.q('select count(*) from email_logs'))[0].count, blockRow: (await L.q('select id, type, status, maintenance_status, start_date, end_date, portal_request_id from reservations where portal_request_id=$1', [mreq2]))[0] });
  stub.setMode('ok'); await L.setEmailConfig(admin, L.stubConfig(PORT));
  // customer without an e-mail address for MOT/general: is anything sent / logged?
  const c179 = (await L.q('select email, email_for_mot from customers where id=$1', [CUST]))[0];
  await L.q('update customers set email=null, email_for_mot=null where id=$1', [CUST]);
  const blockId = t.r.json?.block?.id;
  n0 = msgs().length;
  const mv = await admin.patch(`/api/reservations/${blockId}`, { startDate: nextWeekday(20), endDate: nextWeekday(20) });
  await L.sleep(800);
  L.record('B11d staff moves block, customer has no e-mail', { http: mv.status, msgs: msgs().length - n0, notif: await L.q("select type, title from portal_notifications where customer_id=$1 and type='maintenance_moved' order by id desc limit 1", [CUST]) });
  await L.q('update customers set email=$2, email_for_mot=$3 where id=$1', [CUST, c179.email, c179.email_for_mot]);

  // --- B12 fine linked mail --------------------------------------------------------------------
  const veh = (await L.q('select license_plate from vehicles where id=$1', [rental.vehicle_id]))[0];
  n0 = msgs().length;
  r = await admin.post('/api/fines', { licensePlate: veh.license_plate, offenceAt: new Date().toISOString(), description: 'AUDIT-P16 boete <b>x</b>', amount: '42.5', reference: 'AUDIT-P16-REF' });
  m = last();
  L.record('B12 fine linked mail', { http: r.status, fine: r.json?.fine ? { id: r.json.fine.id, status: r.json.fine.status, customerId: r.json.fine.customerId } : r.json, msgs: msgs().length - n0, mail: summ(m), html: htmlOf(m)?.slice(0, 500) });

  // cleanup: block the throwaway account (activated accounts cannot be deleted)
  await admin.patch(`/api/portal-admin/accounts/${acc.id}`, { active: false });
  L.flush('p16-b-portal.out.json');
  await stub.stop();
  process.exit(0);
})().catch(async (e) => { console.error('FATAL', e); L.flush('p16-b-portal.out.json'); process.exit(1); });
