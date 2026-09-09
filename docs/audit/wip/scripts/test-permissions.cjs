const { getAdminSession, Session } = require('./lib-vc.cjs');
const { q } = require('./db-vc.cjs');
const fs = require('fs');

function log(label, r) {
  const body = (r.text || '').length > 400 ? r.text.slice(0, 400) + '...' : r.text;
  console.log(`\n### ${label}\nstatus=${r.status}\nbody=${body}`);
}

(async () => {
  const admin = await getAdminSession();
  const limited = new Session('limited');
  limited.loadFrom('./docs/audit/wip/scripts/session-vc-limited.json');

  const suffix = Date.now();

  // Fixtures owned by admin to try to mutate as limited user
  let r = await admin.post('/api/customers', { name: 'AUDIT-PermCust-' + suffix, email: 'audit-perm-' + suffix + '@example.com' });
  const customerId = r.json.id;
  r = await admin.post(`/api/customers/${customerId}/drivers`, { displayName: 'AUDIT Perm Driver' });
  const driverId = r.json.id;

  // --- limited user write attempts (expect 403) ---
  r = await limited.post('/api/customers', { name: 'AUDIT-Hacked-' + suffix });
  log('1. Limited user POST /api/customers', r);

  r = await limited.patch(`/api/customers/${customerId}`, { name: 'Hacked' });
  log('2. Limited user PATCH /api/customers/:id', r);

  r = await limited.del(`/api/customers/${customerId}`);
  log('3. Limited user DELETE /api/customers/:id', r);

  r = await limited.post(`/api/customers/${customerId}/drivers`, { displayName: 'AUDIT Hacked Driver' });
  log('4. Limited user POST drivers', r);

  r = await limited.patch(`/api/drivers/${driverId}`, { displayName: 'Hacked' });
  log('5. Limited user PATCH driver', r);

  r = await limited.del(`/api/drivers/${driverId}`);
  log('6. Limited user DELETE driver', r);

  r = await limited.post(`/api/vehicles/1/blacklist`, { customerId });
  log('7. Limited user POST blacklist', r);

  r = await limited.post('/api/deleted-records/1/restore', {});
  log('8. Limited user POST restore (requireAdmin, expect 403/401)', r);

  r = await limited.get('/api/deleted-records');
  log('9. Limited user GET deleted-records (requireAdmin, expect 403/401)', r);

  // --- migrate/customer-drivers: requireAuth only, no permission check per source read ---
  r = await limited.post('/api/migrate/customer-drivers', {});
  log('10. Limited user POST /api/migrate/customer-drivers (requireAuth ONLY - expect this to SUCCEED, which is the bug)', r);

  // --- admin running migrate twice: check idempotency ---
  r = await admin.post('/api/migrate/customer-drivers', {});
  log('11a. Admin POST /api/migrate/customer-drivers (run 1)', r);
  const migrated1 = r.json?.migrated;

  r = await admin.post('/api/migrate/customer-drivers', {});
  log('11b. Admin POST /api/migrate/customer-drivers (run 2, expect migrated=0, all skipped)', r);
  const migrated2 = r.json?.migrated;

  console.log('\n\nSUMMARY:', JSON.stringify({ customerId, driverId, migrated1, migrated2 }));
})().catch(e => { console.error('FATAL', e); process.exitCode = 1; });
