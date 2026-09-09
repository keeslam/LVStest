const { getAdminSession } = require('./lib-vc.cjs');
const { q } = require('./db-vc.cjs');

function log(label, r) {
  const body = (r.text || '').length > 500 ? r.text.slice(0, 500) + '...' : r.text;
  console.log(`\n### ${label}\nstatus=${r.status}\nbody=${body}`);
}

(async () => {
  const admin = await getAdminSession();
  const suffix = Date.now();

  // 1. Whitespace-only name
  let r = await admin.post('/api/customers', { name: '   ', email: 'audit-ws-' + suffix + '@example.com' });
  log('1. Whitespace-only name', r);

  // 2. Emoji name
  r = await admin.post('/api/customers', { name: 'AUDIT 🎉🚀 Emoji Klant', email: 'audit-emoji-' + suffix + '@example.com' });
  log('2. Emoji name', r);

  // 3. Very long name
  r = await admin.post('/api/customers', { name: 'AUDIT-' + 'A'.repeat(2000), email: 'audit-long-' + suffix + '@example.com' });
  log('3. Very long name (2000+ chars)', r);

  // 4. Invalid email formats
  r = await admin.post('/api/customers', { name: 'AUDIT-BadEmail1-' + suffix, email: 'not-an-email' });
  log('4a. Invalid email "not-an-email"', r);

  r = await admin.post('/api/customers', { name: 'AUDIT-BadEmail2-' + suffix, email: 'foo@bar' });
  log('4b. Invalid email "foo@bar" (no TLD)', r);

  r = await admin.post('/api/customers', { name: 'AUDIT-BadEmail3-' + suffix, email: '@@@' });
  log('4c. Invalid email "@@@"', r);

  r = await admin.post('/api/customers', { name: 'AUDIT-EmptyEmail-' + suffix, email: '' });
  log('4d. Empty-string email (should be allowed per optionalEmail schema)', r);

  // 5. Duplicate debtor numbers
  const debtorNo = 'AUDIT-DEB-' + suffix;
  r = await admin.post('/api/customers', { name: 'AUDIT-Debtor1-' + suffix, debtorNumber: debtorNo, email: 'audit-deb1-' + suffix + '@example.com' });
  log('5a. Create customer with debtorNumber', r);
  r = await admin.post('/api/customers', { name: 'AUDIT-Debtor2-' + suffix, debtorNumber: debtorNo, email: 'audit-deb2-' + suffix + '@example.com' });
  log('5b. Create SECOND customer with SAME debtorNumber (expect rejection if unique enforced)', r);

  // 6. Update non-existing customer id
  r = await admin.patch('/api/customers/999999999', { name: 'X' });
  log('6. PATCH non-existing customer id', r);

  r = await admin.del('/api/customers/999999999');
  log('6b. DELETE non-existing customer id', r);

  // 7. Blacklist add/remove/duplicate
  r = await admin.post('/api/customers', { name: 'AUDIT-BlacklistCust-' + suffix, email: 'audit-bl-' + suffix + '@example.com' });
  const blCustId = r.json.id;
  r = await admin.post('/api/vehicles', { licensePlate: 'AU-BL-' + suffix, brand: 'AUDIT-BL', model: 'AUDIT-BL' });
  const blVehId = r.json.id;

  r = await admin.post(`/api/vehicles/${blVehId}/blacklist`, { customerId: blCustId, reason: 'AUDIT test' });
  log('7a. Add to blacklist', r);
  const blacklistEntryId = r.json?.id;

  r = await admin.post(`/api/vehicles/${blVehId}/blacklist`, { customerId: blCustId, reason: 'AUDIT dup' });
  log('7b. Add SAME customer/vehicle to blacklist again (expect rejection)', r);

  r = await admin.get(`/api/vehicles/${blVehId}/blacklist/check/${blCustId}`);
  log('7c. Check blacklist status', r);

  r = await admin.del(`/api/blacklist/${blacklistEntryId}`);
  log('7d. Remove from blacklist', r);

  r = await admin.del(`/api/blacklist/${blacklistEntryId}`);
  log('7e. Remove SAME blacklist entry again (expect 404)', r);

  r = await admin.post(`/api/vehicles/${blVehId}/blacklist`, { customerId: 999999999, reason: 'AUDIT bad customer' });
  log('7f. Add blacklist entry for non-existing customerId', r);

  r = await admin.post(`/api/vehicles/999999999/blacklist`, { customerId: blCustId, reason: 'AUDIT bad vehicle' });
  log('7g. Add blacklist entry for non-existing vehicleId', r);

  console.log('\n\nSTATE:', JSON.stringify({ debtorNo, blCustId, blVehId, blacklistEntryId }));
})().catch(e => { console.error('FATAL', e); process.exitCode = 1; });
