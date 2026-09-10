// Phase 16 Z: restore app_settings (email_config id 7, portal_config id 4) to the snapshot taken
// at the start of the phase (p16-original-settings.json) through the app's own API, remove any
// leftover AUDIT-P16 settings rows, and verify fixture fields that the scripts touched.
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./p16-lib.cjs');

(async () => {
  const admin = await L.getAdmin('10.16.1.19');
  const orig = JSON.parse(fs.readFileSync(path.join(__dirname, 'p16-original-settings.json'), 'utf8'));
  for (const row of orig) {
    const r = await admin.put(`/api/app-settings/${row.id}`, { key: row.key, value: row.value, category: row.category, description: row.description });
    console.log('restored', row.id, row.key, r.status);
  }
  // leftovers created by this phase
  const left = await L.q("select id, key, category, description from app_settings where description like 'AUDIT-P16%' or key in ('email_documents','email_zzz_audit_p16') or (key='gps_recipient_email' and description like 'AUDIT%')");
  for (const l of left) { const r = await admin.del(`/api/app-settings/${l.id}`); console.log('deleted leftover', l.id, l.key, r.status); }
  // verify
  const now = await L.q("select id, category, key, value, description from app_settings where category='email' or key='portal_config' order by id");
  const same = JSON.stringify(now.map(r => [r.id, r.category, r.key, r.value, r.description])) === JSON.stringify(orig.map(r => [r.id, r.category, r.key, r.value, r.description]));
  console.log('app_settings identical to snapshot:', same);
  if (!same) console.log(JSON.stringify(now, null, 1));
  console.log('customer 179', JSON.stringify(await L.q('select email, email_for_mot, email_general, preferred_language from customers where id=179')));
  console.log('portal user 30', JSON.stringify(await L.q('select full_name, pending_email from portal_users where id=30')));
  console.log('vehicle 1802 apk', JSON.stringify(await L.q('select apk_date from vehicles where id=1802')));
  console.log('AUDIT-P16 portal users', JSON.stringify(await L.q("select id, email, active from portal_users where email like 'audit-p16-%'")));
  console.log('fake documents left', JSON.stringify(await L.q("select id from documents where created_by='AUDIT-P16'")));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
