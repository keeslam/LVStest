const { Session } = require('./lib-vc.cjs');

function log(label, r) {
  const body = r.text.length > 400 ? r.text.slice(0, 400) + '...' : r.text;
  console.log(`\n### ${label}\nstatus=${r.status}\nbody=${body}`);
}

(async () => {
  const admin = new Session('admin');
  await admin.loginStaff('admin', 'admin123');

  const limited = new Session('limited');
  const limLogin = await limited.loginStaff('AUDIT-limiteduser', 'AuditPass123!');
  console.log('limited login status', limLogin.status);

  // 1. Minimal vehicle create
  let r = await admin.post('/api/vehicles', { licensePlate: 'AU-001-X', brand: 'AUDIT-Brand', model: 'AUDIT-Model' });
  log('1. Create minimal vehicle', r);
  const vehId1 = r.json?.id;

  // 2. Duplicate plate exact
  r = await admin.post('/api/vehicles', { licensePlate: 'AU-001-X', brand: 'AUDIT-Brand2', model: 'AUDIT-Model2' });
  log('2. Duplicate plate exact', r);

  // 3. Duplicate plate different dash/case
  r = await admin.post('/api/vehicles', { licensePlate: 'au001x', brand: 'AUDIT-Brand3', model: 'AUDIT-Model3' });
  log('3. Duplicate plate different case/dash (au001x vs AU-001-X)', r);
  const vehId3 = r.json?.id;

  r = await admin.post('/api/vehicles', { licensePlate: 'AU 001 X', brand: 'AUDIT-Brand3b', model: 'AUDIT-Model3b' });
  log('3b. Duplicate plate with spaces instead of dashes', r);
  const vehId3b = r.json?.id;

  // 4. Unicode/emoji plate
  r = await admin.post('/api/vehicles', { licensePlate: 'AU-🚗-EMOJI', brand: 'AUDIT-Emoji', model: 'AUDIT-Emoji' });
  log('4. Emoji plate', r);

  // 5. Very long plate
  r = await admin.post('/api/vehicles', { licensePlate: 'AU-' + 'X'.repeat(500), brand: 'AUDIT-Long', model: 'AUDIT-Long' });
  log('5. Very long plate (500 chars)', r);

  // 6. Whitespace-only plate
  r = await admin.post('/api/vehicles', { licensePlate: '   ', brand: 'AUDIT-WS', model: 'AUDIT-WS' });
  log('6. Whitespace-only plate', r);

  // 7. HTML/script plate
  r = await admin.post('/api/vehicles', { licensePlate: '<script>alert(1)</script>', brand: 'AUDIT-XSS', model: 'AUDIT-XSS' });
  log('7. HTML/script plate', r);

  // 8. Negative mileage
  r = await admin.post('/api/vehicles', { licensePlate: 'AU-002-X', brand: 'AUDIT-Neg', model: 'AUDIT-Neg', departureMileage: -500 });
  log('8. Negative departureMileage on create', r);
  const vehIdNeg = r.json?.id;

  r = await admin.post('/api/vehicles', { licensePlate: 'AU-003-X', brand: 'AUDIT-Neg2', model: 'AUDIT-Neg2', currentMileage: -100 });
  log('8b. Negative currentMileage on create (has explicit zod min(0))', r);

  // 9. Mileage as string/array/object
  r = await admin.post('/api/vehicles', { licensePlate: 'AU-004-X', brand: 'AUDIT-Str', model: 'AUDIT-Str', departureMileage: "abc" });
  log('9a. departureMileage as non-numeric string', r);

  r = await admin.post('/api/vehicles', { licensePlate: 'AU-005-X', brand: 'AUDIT-Arr', model: 'AUDIT-Arr', departureMileage: [1, 2, 3] });
  log('9b. departureMileage as array', r);

  r = await admin.post('/api/vehicles', { licensePlate: 'AU-006-X', brand: 'AUDIT-Obj', model: 'AUDIT-Obj', departureMileage: { a: 1 } });
  log('9c. departureMileage as object', r);

  // 10. Invalid dates
  r = await admin.post('/api/vehicles', { licensePlate: 'AU-007-X', brand: 'AUDIT-Date', model: 'AUDIT-Date', apkDate: '2026-02-30' });
  log('10a. Invalid calendar date apkDate=2026-02-30', r);
  const vehIdBadDate = r.json?.id;

  r = await admin.post('/api/vehicles', { licensePlate: 'AU-008-X', brand: 'AUDIT-Date2', model: 'AUDIT-Date2', apkDate: '99999-01-01' });
  log('10b. apkDate year 99999', r);

  // 11. Update non-existing id
  r = await admin.patch('/api/vehicles/99999999', { brand: 'X' });
  log('11. PATCH non-existing vehicle id', r);

  // 12. Missing required fields
  r = await admin.post('/api/vehicles', { licensePlate: 'AU-009-X' });
  log('12. Missing brand/model', r);

  // Limited user permission checks
  r = await limited.post('/api/vehicles', { licensePlate: 'AU-010-X', brand: 'AUDIT-Lim', model: 'AUDIT-Lim' });
  log('13. Limited user POST /api/vehicles (expect 403)', r);

  r = await limited.patch(`/api/vehicles/${vehId1}`, { brand: 'Hacked' });
  log('14. Limited user PATCH vehicle (expect 403)', r);

  r = await limited.del(`/api/vehicles/${vehId1}`);
  log('15. Limited user DELETE vehicle (expect 403)', r);

  console.log('\n\nCREATED VEHICLE IDS:', JSON.stringify({ vehId1, vehId3, vehId3b, vehIdNeg, vehIdBadDate }));
})();
