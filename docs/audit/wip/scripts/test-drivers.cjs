const { getAdminSession } = require('./lib-vc.cjs');
const { q } = require('./db-vc.cjs');

function log(label, r) {
  const body = (r.text || '').length > 500 ? r.text.slice(0, 500) + '...' : r.text;
  console.log(`\n### ${label}\nstatus=${r.status}\nbody=${body}`);
}

(async () => {
  const admin = await getAdminSession();
  const suffix = Date.now();

  // Setup: a customer to hang drivers off of
  let r = await admin.post('/api/customers', { name: 'AUDIT-DriverCust-' + suffix, email: 'audit-drivercust-' + suffix + '@example.com' });
  const customerId = r.json.id;
  console.log('customerId', customerId);

  // 1. Create driver (JSON, no file)
  r = await admin.post(`/api/customers/${customerId}/drivers`, { displayName: 'AUDIT Driver One', firstName: 'Driver', lastName: 'One' });
  log('1. Create driver (no file)', r);
  const driverId = r.json?.id;

  // 2. Edit driver
  r = await admin.patch(`/api/drivers/${driverId}`, { displayName: 'AUDIT Driver One Edited' });
  log('2. Edit driver', r);

  // 3. Deactivate driver
  r = await admin.patch(`/api/drivers/${driverId}`, { status: 'inactive' });
  log('3. Deactivate driver (status=inactive)', r);

  // 4. License upload: wrong MIME/extension (.exe claiming image/png)
  let fd = new FormData();
  fd.append('displayName', 'AUDIT Driver Exe');
  fd.append('licenseFile', new Blob([Buffer.from('MZ\x90\x00fake exe content')], { type: 'image/png' }), 'malware.exe');
  r = await admin.request('POST', `/api/customers/${customerId}/drivers`, fd);
  log('4. License upload with .exe extension (claims image/png)', r);

  // 5. Wrong extension but real image bytes (should still be rejected by extension allowlist? or pass magic-byte but fail ext)
  const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  fd = new FormData();
  fd.append('displayName', 'AUDIT Driver PngAsTxt');
  fd.append('licenseFile', new Blob([pngMagic], { type: 'image/png' }), 'license.txt');
  r = await admin.request('POST', `/api/customers/${customerId}/drivers`, fd);
  log('5. Real PNG bytes but .txt extension', r);

  // 6. Empty file
  fd = new FormData();
  fd.append('displayName', 'AUDIT Driver EmptyFile');
  fd.append('licenseFile', new Blob([], { type: 'application/pdf' }), 'empty.pdf');
  r = await admin.request('POST', `/api/customers/${customerId}/drivers`, fd);
  log('6. Empty file upload (0 bytes, .pdf)', r);

  // 7. Huge filename
  fd = new FormData();
  fd.append('displayName', 'AUDIT Driver HugeFilename');
  const hugeName = 'A'.repeat(1000) + '.pdf';
  fd.append('licenseFile', new Blob([Buffer.from('%PDF-1.4 fake pdf content')], { type: 'application/pdf' }), hugeName);
  r = await admin.request('POST', `/api/customers/${customerId}/drivers`, fd);
  log('7. Huge filename (1000+ chars)', r);

  // 8. Path-like filename
  fd = new FormData();
  fd.append('displayName', 'AUDIT Driver PathName');
  fd.append('licenseFile', new Blob([Buffer.from('%PDF-1.4 fake pdf content')], { type: 'application/pdf' }), '../../../evil.pdf');
  r = await admin.request('POST', `/api/customers/${customerId}/drivers`, fd);
  log('8. Path-traversal-like filename (../../../evil.pdf)', r);
  const pathDriverId = r.json?.id;
  if (pathDriverId) {
    const dbRow = await q('select id, license_file_path from drivers where id=$1', [pathDriverId]);
    console.log('  stored licenseFilePath:', dbRow);
  }

  // 9. HTML/SVG masquerading as document (XSS via uploaded file)
  fd = new FormData();
  fd.append('displayName', 'AUDIT Driver SvgXss');
  fd.append('licenseFile', new Blob([Buffer.from('<svg onload="alert(1)"></svg>')], { type: 'image/svg+xml' }), 'license.svg');
  r = await admin.request('POST', `/api/customers/${customerId}/drivers`, fd);
  log('9. SVG with onload XSS payload', r);

  // 10. Driver assigned to a reservation, then deleted
  r = await admin.post('/api/vehicles', { licensePlate: 'AU-DRV-' + suffix, brand: 'AUDIT-Drv', model: 'AUDIT-Drv' });
  const vehicleId = r.json.id;
  r = await admin.post('/api/reservations', { vehicleId, customerId, driverId, startDate: '2026-12-20', endDate: '2026-12-25', status: 'booked' });
  log('10a. Create reservation with driverId set', r);
  const resId = r.json?.id;
  console.log('  reservation driverId at create:', r.json?.driverId);

  r = await admin.del(`/api/drivers/${driverId}`);
  log('10b. Delete the driver that is assigned to that reservation', r);

  const resAfter = await q('select id, driver_id, status from reservations where id=$1', [resId]);
  console.log('  reservation.driver_id after driver delete (expect NULL via ON DELETE SET NULL):', resAfter);
  const driverAfter = await q('select id from drivers where id=$1', [driverId]);
  console.log('  driver row after delete (expect gone):', driverAfter);

  // 11. Delete non-existing driver
  r = await admin.del('/api/drivers/999999999');
  log('11. Delete non-existing driver id', r);

  console.log('\n\nSTATE:', JSON.stringify({ customerId, driverId, vehicleId, resId }));
})().catch(e => { console.error('FATAL', e); process.exitCode = 1; });
