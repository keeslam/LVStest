// Phase 16 B2: re-run of the portal cases that failed on fixture problems in p16-b-portal.cjs
// (expired token with a UTC-correct DB update, 'other' request needs payload.subject, maintenance
// request on a reservation without an open request, fine attribution candidates).
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
const leftovers = (s) => s ? (s.match(/\{\{[^}]*\}\}|undefined|null|NaN/g) || []) : [];
const summ = (m) => ({ ...L.summarize(m), link: linkOf(m), leftovers: leftovers(htmlOf(m)).concat(leftovers(m?.subject)) });
const nextWeekday = (daysAhead) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + daysAhead); while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

(async () => {
  await L.snapshotOriginal();
  const admin = await L.getAdmin('10.16.1.14');
  const stub = await start({ port: PORT, mode: 'ok' });
  const msgs = () => stub.state.messages;
  const last = () => msgs()[msgs().length - 1];
  await L.setEmailConfig(admin, L.stubConfig(PORT));
  const dev = await L.getPortal('portaal-test@example.com', 'portaal-test-1234', '10.16.2.70');
  let r, m, n0, t;

  // --- B2b expired token (UTC-correct) ---------------------------------------------------------------
  const email = `audit-p16-exp-${TS}@example.invalid`;
  r = await admin.post(`/api/portal-admin/customers/${CUST}/accounts`, { email, fullName: 'AUDIT-P16 Expiry', role: 'admin' });
  const acc = r.json.account;
  const tok = tokenOf(last());
  await L.q("update portal_users set invite_expires_at = (now() at time zone 'utc') - interval '1 minute' where id=$1", [acc.id]);
  const anon = new L.Session('anon', { fakeIp: '10.16.2.71' }); await anon.get('/api/portal/csrf-token');
  const a4 = await anon.post('/api/portal/activate', { token: tok, password: 'AUDIT-p16-Pass-9999' });
  const dbrow = (await L.q("select invite_expires_at, (now() at time zone 'utc') as db_now_utc, created_at from portal_users where id=$1", [acc.id]))[0];
  L.record('B2b expired token (utc)', { http: a4.status, code: a4.json?.code || a4.json?.message, db: dbrow });
  await admin.delete ? null : null;
  await admin.del(`/api/portal-admin/accounts/${acc.id}`);

  // --- B10 request + staff reply mail (also with SMTP failure) ------------------------------------------
  n0 = msgs().length;
  r = await dev.post('/api/portal/requests', { type: 'other', message: 'AUDIT-P16 vraag <b>vet</b> {{name}}', payload: { subject: 'AUDIT-P16 <i>onderwerp</i>' } });
  const req1 = r.json?.id;
  const staffMail = last();
  L.record('B10a portal request created -> staff mail', { http: r.status, requestId: req1, err: r.status >= 400 ? r.json : undefined, msgs: msgs().length - n0, mail: summ(staffMail), html: htmlOf(staffMail) || L.qp(staffMail?.raw || '').slice(-400) });
  n0 = msgs().length;
  r = await admin.post(`/api/portal-requests/${req1}/reply`, { reply: 'AUDIT-P16 antwoord met <i>html</i> en {{name}} en https://lamgroep.nl', status: 'done' });
  m = last();
  L.record('B10b staff reply mail', { http: r.status, status: r.json?.status, err: r.status >= 400 ? r.json : undefined, msgs: msgs().length - n0, mail: summ(m), html: htmlOf(m)?.slice(0, 500) });
  r = await dev.post('/api/portal/requests', { type: 'other', message: 'AUDIT-P16 vraag 2', payload: { subject: 'AUDIT-P16 2' } });
  const req2 = r.json?.id;
  stub.setMode('auth535'); await L.setEmailConfig(admin, L.stubConfig(PORT));
  n0 = msgs().length;
  t = await L.timed(() => admin.post(`/api/portal-requests/${req2}/reply`, { reply: 'AUDIT-P16 antwoord 2', status: 'done' }));
  const req2row = (await L.q('select status, replied_at is not null as replied from portal_requests where id=$1', [req2]))[0];
  L.record('B10c staff reply with SMTP 535', { http: t.r.status, ms: t.ms, body: t.r.json?.status, msgs: msgs().length - n0, db: req2row, emailLogs: (await L.q('select count(*) from email_logs'))[0].count, portalNotif: (await L.q('select type,title from portal_notifications where customer_id=$1 order by id desc limit 1', [CUST]))[0] });
  stub.setMode('ok'); await L.setEmailConfig(admin, L.stubConfig(PORT));

  // --- B11 maintenance request -> approval -> customer notification + portal_maintenance mail ---------------
  const rental = (await L.q("select r.id, r.vehicle_id, v.license_plate from reservations r join vehicles v on v.id=r.vehicle_id where r.customer_id=$1 and r.status='picked_up' and r.deleted_at is null and r.type='standard' and not exists (select 1 from portal_requests p where p.reservation_id=r.id and p.status in ('new','in_progress')) order by r.id desc limit 1", [CUST]))[0];
  n0 = msgs().length;
  r = await dev.post('/api/portal/requests', { type: 'maintenance', reservationId: rental.id, message: 'AUDIT-P16 onderhoud nodig', payload: { issue: 'AUDIT-P16 rammelt', urgent: 'true', needsReplacement: 'false' } });
  const mreq = r.json?.id;
  L.record('B11a maintenance request -> staff mail', { rental, http: r.status, requestId: mreq, err: r.status >= 400 ? r.json : undefined, msgs: msgs().length - n0, mail: summ(last()), html: htmlOf(last()) || L.qp(last()?.raw || '').slice(-400) });
  const day1 = nextWeekday(5);
  n0 = msgs().length;
  const pn0 = (await L.q('select max(id) as id from portal_notifications'))[0].id || 0;
  t = await L.timed(() => admin.post(`/api/portal-requests/${mreq}/approve`, { startDate: day1, durationDays: 2, category: 'repair', note: 'AUDIT-P16 approve' }));
  m = last();
  const pn = await L.q('select id, type, title, description, dedupe_tag, link from portal_notifications where id > $1 order by id', [pn0]);
  L.record('B11b approve maintenance', { http: t.r.status, err: t.r.status >= 400 ? t.r.json : undefined, ms: t.ms, blockId: t.r.json?.block?.id, reqStatus: t.r.json?.status, msgs: msgs().length - n0, mails: msgs().slice(n0).map(summ), html: htmlOf(m)?.slice(0, 700), portalNotifications: pn });
  const block1 = t.r.json?.block?.id;
  // second one with the mail server failing: is the approval still recorded, is the notification still created?
  const rental2 = (await L.q("select r.id, r.vehicle_id, v.license_plate from reservations r join vehicles v on v.id=r.vehicle_id where r.customer_id=$1 and r.status='picked_up' and r.deleted_at is null and r.type='standard' and r.id <> $2 and not exists (select 1 from portal_requests p where p.reservation_id=r.id and p.status in ('new','in_progress')) order by r.id desc limit 1", [CUST, rental.id]))[0];
  r = await dev.post('/api/portal/requests', { type: 'maintenance', reservationId: rental2.id, message: 'AUDIT-P16 onderhoud 2', payload: { issue: 'AUDIT-P16 piept', urgent: 'false', needsReplacement: 'false' } });
  const mreq2 = r.json?.id;
  stub.setMode('auth535'); await L.setEmailConfig(admin, L.stubConfig(PORT));
  const day2 = nextWeekday(12);
  n0 = msgs().length;
  const pn1 = (await L.q('select max(id) as id from portal_notifications'))[0].id || 0;
  t = await L.timed(() => admin.post(`/api/portal-requests/${mreq2}/approve`, { startDate: day2, durationDays: 1, category: 'scheduled_maintenance' }));
  L.record('B11c approve maintenance with SMTP 535', { rental2, http: t.r.status, err: t.r.status >= 400 ? t.r.json : undefined, blockId: t.r.json?.block?.id, reqStatus: t.r.json?.status, msgs: msgs().length - n0, createErr: r.status >= 400 ? r.json : undefined, portalNotifications: await L.q('select type, title from portal_notifications where id > $1 order by id', [pn1]), emailLogs: (await L.q('select count(*) from email_logs'))[0].count, blockRow: (await L.q('select id, type, status, maintenance_status, start_date, end_date, portal_request_id from reservations where portal_request_id=$1', [mreq2]))[0] });
  stub.setMode('ok'); await L.setEmailConfig(admin, L.stubConfig(PORT));
  // staff moves block 1 -> maintenance_moved mail; then customer without e-mail address
  if (block1) {
    n0 = msgs().length;
    const mv = await admin.patch(`/api/reservations/${block1}`, { startDate: nextWeekday(8), endDate: nextWeekday(9) });
    await L.sleep(1000);
    L.record('B11d staff moves block -> moved mail', { http: mv.status, err: mv.status >= 400 ? mv.json : undefined, msgs: msgs().length - n0, mail: summ(last()), html: htmlOf(last())?.slice(0, 300) });
    const c179 = (await L.q('select email, email_for_mot from customers where id=$1', [CUST]))[0];
    await L.q('update customers set email=null, email_for_mot=null where id=$1', [CUST]);
    n0 = msgs().length;
    const mv2 = await admin.patch(`/api/reservations/${block1}`, { startDate: nextWeekday(15), endDate: nextWeekday(15) });
    await L.sleep(1000);
    L.record('B11e staff moves block, customer without e-mail', { http: mv2.status, msgs: msgs().length - n0, notif: await L.q("select type, title from portal_notifications where customer_id=$1 and type='maintenance_moved' order by id desc limit 1", [CUST]), emailLogs: (await L.q('select count(*) from email_logs'))[0].count });
    await L.q('update customers set email=$2, email_for_mot=$3 where id=$1', [CUST, c179.email, c179.email_for_mot]);
  }

  // --- B12 fine linked mail --------------------------------------------------------------------------
  const cand = await L.q("select r.id, r.status, r.customer_id, r.start_date, r.end_date from reservations r where r.vehicle_id=$1 and r.deleted_at is null order by r.id", [rental.vehicle_id]);
  n0 = msgs().length;
  r = await admin.post('/api/fines', { licensePlate: rental.license_plate, offenceAt: new Date().toISOString(), description: 'AUDIT-P16 boete <b>x</b>', amount: '42.5', reference: 'AUDIT-P16-REF' });
  m = last();
  const fineId = r.json?.fine?.id;
  const fineGet = fineId ? await admin.get(`/api/fines/${fineId}`) : null;
  L.record('B12 fine linked mail', { plate: rental.license_plate, reservationsOnVehicle: cand, http: r.status, fine: r.json?.fine ? { id: r.json.fine.id, status: r.json.fine.status, customerId: r.json.fine.customerId, reservationId: r.json.fine.reservationId } : r.json, candidates: fineGet?.json?.candidates, msgs: msgs().length - n0, mail: summ(m), html: htmlOf(m)?.slice(0, 500) });
  if (fineId && r.json?.fine?.status !== 'linked' && cand.length) {
    // link manually via the staff route to see the mail path from routes/fines.ts notifyLinked
    const link = await admin.post(`/api/fines/${fineId}/link`, { reservationId: rental.id });
    await L.sleep(500);
    L.record('B12b manual link -> mail', { http: link.status, err: link.status >= 400 ? link.json : undefined, msgs: msgs().length - n0, mail: summ(last()), html: htmlOf(last())?.slice(0, 500) });
  }

  L.flush('p16-b2-portal.out.json');
  await stub.stop();
  process.exit(0);
})().catch(async (e) => { console.error('FATAL', e); L.flush('p16-b2-portal.out.json'); process.exit(1); });
