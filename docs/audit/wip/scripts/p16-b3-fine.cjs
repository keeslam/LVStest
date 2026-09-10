// Phase 16 B3: fine-linked customer mail via the manual link route (automatic attribution found no
// covering candidate for the AUDIT plate, see p16-b2 B12), plus the same with SMTP failing.
'use strict';
const { start } = require('./p16-stub.cjs');
const L = require('./p16-lib.cjs');
const PORT = 2525, CUST = 179;
const htmlOf = (m) => m ? L.qp(m.raw).match(/text\/html[\s\S]*?\r\n\r\n([\s\S]*?)(\r\n--|$)/)?.[1] : null;

(async () => {
  const admin = await L.getAdmin('10.16.1.15');
  const stub = await start({ port: PORT, mode: 'ok' });
  const msgs = () => stub.state.messages; const last = () => msgs()[msgs().length - 1];
  await L.setEmailConfig(admin, L.stubConfig(PORT));
  const fine = (await L.q("select id, license_plate from fines where description like 'AUDIT-P16 boete%' and status='new' order by id desc limit 1"))[0];
  const pn0 = (await L.q('select max(id) as id from portal_notifications'))[0].id || 0;
  let n0 = msgs().length;
  let r = await admin.post(`/api/fines/${fine.id}/link`, { customerId: CUST, reservationId: 3336 });
  await L.sleep(500);
  const m = last();
  L.record('B12b manual fine link -> customer mail', { fineId: fine.id, http: r.status, err: r.status >= 400 ? r.json : undefined, status: r.json?.status, msgs: msgs().length - n0, mail: L.summarize(m), html: htmlOf(m)?.slice(0, 600), portalNotifications: await L.q('select type, title, description from portal_notifications where id > $1 order by id', [pn0]) });
  // unlink + relink with SMTP failing
  await admin.post(`/api/fines/${fine.id}/unlink`, {});
  stub.setMode('auth535'); await L.setEmailConfig(admin, L.stubConfig(PORT));
  n0 = msgs().length;
  r = await admin.post(`/api/fines/${fine.id}/link`, { customerId: CUST, reservationId: 3336 });
  await L.sleep(500);
  L.record('B12c manual fine link with SMTP 535', { http: r.status, err: r.status >= 400 ? r.json : undefined, status: r.json?.status, msgs: msgs().length - n0, fineRow: (await L.q('select status, customer_id from fines where id=$1', [fine.id]))[0], emailLogs: (await L.q('select count(*) from email_logs'))[0].count });
  stub.setMode('ok'); await L.setEmailConfig(admin, L.stubConfig(PORT));
  L.flush('p16-b3-fine.out.json');
  await stub.stop(); process.exit(0);
})().catch(async (e) => { console.error('FATAL', e); L.flush('p16-b3-fine.out.json'); process.exit(1); });
