const { getAdminSession, Session } = require('./lib-vc.cjs');
const { q } = require('./db-vc.cjs');

function log(label, r) {
  const body = (r.text || '').length > 500 ? r.text.slice(0, 500) + '...' : r.text;
  console.log(`\n### ${label}\nstatus=${r.status}\nbody=${body}`);
}

(async () => {
  const admin = await getAdminSession();
  const suffix = Date.now();

  // --- availabilityStatus invalid value ---
  let r = await admin.post('/api/vehicles', { licensePlate: 'AU-STAT-' + suffix, brand: 'AUDIT-Status', model: 'AUDIT-Status' });
  const statVeh = r.json?.id;
  console.log('created status-test vehicle id=', statVeh);

  r = await admin.patch(`/api/vehicles/${statVeh}`, { availabilityStatus: 'banana_not_real' });
  log('A. PATCH availabilityStatus to bogus value "banana_not_real"', r);

  const dbCheck1 = await q('select id, availability_status from vehicles where id=$1', [statVeh]);
  console.log('DB availability_status after bogus PATCH:', dbCheck1);

  // --- available while picked_up reservation exists ---
  // Use vehicle 368 (known picked_up reservation from explore-db.cjs)
  r = await admin.get('/api/vehicles/368');
  console.log('vehicle 368 current status:', r.json?.availabilityStatus);
  r = await admin.patch('/api/vehicles/368', { availabilityStatus: 'available' });
  log('B. PATCH vehicle 368 (has picked_up reservation) availabilityStatus=available', r);

  // --- bulk import malformed ---
  r = await admin.post('/api/vehicles/bulk-import-plates', { licensePlates: 'not-an-array' });
  log('C. bulk-import-plates with licensePlates as string not array', r);

  r = await admin.post('/api/vehicles/bulk-import-plates', {});
  log('C2. bulk-import-plates missing licensePlates', r);

  r = await admin.post('/api/vehicles/bulk-import-csv', { csv: 12345 });
  log('D. bulk-import-csv with csv as number', r);

  r = await admin.post('/api/vehicles/bulk-import-csv', { notCsvField: 'licensePlate,brand,model\nAU-BULK-1,Test,Test' });
  log('D2. bulk-import-csv missing expected field name', r);

  r = await admin.post('/api/vehicles/bulk-import-csv', 'this is not json at all', { raw: true, headers: { 'Content-Type': 'application/json' } });
  log('D3. bulk-import-csv raw malformed JSON body', r);

  // --- barcode regenerate ---
  r = await admin.post(`/api/vehicles/${statVeh}/barcode/regenerate`, {});
  log('E. Barcode regenerate', r);
  r = await admin.post(`/api/vehicles/${statVeh}/barcode/regenerate`, {});
  log('E2. Barcode regenerate again (check uniqueness/idempotency)', r);

  // --- RDW proxy unauthenticated ---
  const anon = new Session('anon');
  r = await anon.get('/api/rdw/vehicle/AB-123-C');
  log('F. RDW proxy with NO login at all', r);

  r = await anon.get('/api/rdw/vehicle/' + encodeURIComponent('../../etc/passwd'));
  log('G. RDW proxy plate = ../../etc/passwd', r);

  r = await anon.get('/api/rdw/vehicle/' + encodeURIComponent('AB%00CD'));
  log('H. RDW proxy plate with %00', r);

  r = await anon.get('/api/rdw/vehicle/' + 'X'.repeat(3000));
  log('I. RDW proxy very long plate (3000 chars)', r);

  console.log('\n\nSTATE:', JSON.stringify({ statVeh }));
})();
