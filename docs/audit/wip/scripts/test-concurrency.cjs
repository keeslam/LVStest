const { getAdminSession, Session } = require('./lib-vc.cjs');
const { q } = require('./db-vc.cjs');

(async () => {
  const admin = await getAdminSession();
  const suffix = Date.now();
  const plate = 'AU-RACE-' + suffix;

  // --- Test 1: 10 parallel POST /api/vehicles with the SAME plate ---
  // Reuse the SAME session/cookies but fire truly concurrent requests (each
  // gets its own fetch call; the shared CSRF token is fine since it's not
  // single-use, only session-secret-bound).
  const creates = await Promise.all(
    Array.from({ length: 10 }, () =>
      admin.request('POST', '/api/vehicles', { licensePlate: plate, brand: 'AUDIT-Race', model: 'AUDIT-Race' })
    )
  );
  const statuses = creates.map(r => r.status);
  console.log('10 parallel creates same plate -> statuses:', statuses);
  console.log('  count 201:', statuses.filter(s => s === 201).length, ' count 409:', statuses.filter(s => s === 409).length, ' other:', statuses.filter(s => s !== 201 && s !== 409));

  const rows = await q('select id, license_plate, created_at from vehicles where license_plate=$1', [plate]);
  console.log('DB rows with that plate after race:', rows);

  // --- Test 2: 10 parallel restores of the SAME deleted record ---
  // Set up: create+delete a vehicle to get one deleted_records row.
  const plate2 = 'AU-RESTORE-RACE-' + suffix;
  let r = await admin.post('/api/vehicles', { licensePlate: plate2, brand: 'AUDIT-RestoreRace', model: 'AUDIT-RestoreRace' });
  const vehicleId = r.json.id;
  r = await admin.del(`/api/vehicles/${vehicleId}`, { confirmLicensePlate: plate2 });
  console.log('\nSetup delete for restore-race:', r.status, r.text);

  const delRecord = await q("select id from deleted_records where entity_type='vehicle' and entity_id=$1 order by id desc limit 1", [vehicleId]);
  const recordId = delRecord[0].id;
  console.log('deleted_records id to restore:', recordId);

  const restores = await Promise.all(
    Array.from({ length: 10 }, () =>
      admin.request('POST', `/api/deleted-records/${recordId}/restore`, {})
    )
  );
  const rStatuses = restores.map(r => r.status);
  const rBodies = restores.map(r => r.json?.code || r.json?.success);
  console.log('10 parallel restores of same record -> statuses:', rStatuses);
  console.log('  bodies/codes:', rBodies);
  console.log('  count 200 (restored):', rStatuses.filter(s => s === 200).length);

  const vehRows = await q('select id, license_plate from vehicles where id=$1', [vehicleId]);
  console.log('vehicles rows for that id after race (expect exactly 1):', vehRows);

  console.log('\n\nSTATE:', JSON.stringify({ plate, plate2, vehicleId, recordId }));
})().catch(e => { console.error('FATAL', e); process.exitCode = 1; });
