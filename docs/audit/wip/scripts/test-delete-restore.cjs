const { getAdminSession } = require('./lib-vc.cjs');
const { q } = require('./db-vc.cjs');

function log(label, r) {
  const body = (r.text || '').length > 600 ? r.text.slice(0, 600) + '...' : r.text;
  console.log(`\n### ${label}\nstatus=${r.status}\nbody=${body}`);
}

(async () => {
  const admin = await getAdminSession();
  const suffix = Date.now();
  const plate = 'AU-DEL-' + suffix;

  // 1. Create a fresh vehicle
  let r = await admin.post('/api/vehicles', { licensePlate: plate, brand: 'AUDIT-DelTest', model: 'AUDIT-DelTest' });
  log('Create vehicle for delete test', r);
  const vehicleId = r.json.id;

  // 2. Create two customers with reservations on this vehicle (to see if delete wipes OTHER customers' bookings too)
  r = await admin.post('/api/customers', { name: 'AUDIT-DelCustA', email: 'audit-delA@example.com' });
  const custA = r.json.id;
  r = await admin.post('/api/customers', { name: 'AUDIT-DelCustB', email: 'audit-delB@example.com' });
  const custB = r.json.id;

  r = await admin.post('/api/reservations', { vehicleId, customerId: custA, startDate: '2026-12-01', endDate: '2026-12-05', status: 'booked' });
  log('Reservation A on vehicle', r);
  const resA = r.json.id;

  r = await admin.post('/api/reservations', { vehicleId, customerId: custB, startDate: '2026-12-10', endDate: '2026-12-15', status: 'booked' });
  log('Reservation B on vehicle (different customer)', r);
  const resB = r.json.id;

  // 3. delete-impact
  r = await admin.get(`/api/vehicles/${vehicleId}/delete-impact`);
  log('delete-impact', r);

  // 4. Delete WITHOUT confirmation
  r = await admin.del(`/api/vehicles/${vehicleId}`, {});
  log('DELETE without confirmLicensePlate', r);

  // 5. Delete WITH WRONG confirmation
  r = await admin.del(`/api/vehicles/${vehicleId}`, { confirmLicensePlate: 'WRONG-PLATE' });
  log('DELETE with wrong confirmLicensePlate', r);

  // 6. Delete WITH correct confirmation
  r = await admin.del(`/api/vehicles/${vehicleId}`, { confirmLicensePlate: plate });
  log('DELETE with correct confirmLicensePlate', r);

  console.log('\n--- DB state after delete ---');
  console.log('vehicle row:', await q('select id, license_plate from vehicles where id=$1', [vehicleId]));
  console.log('reservation A:', await q('select id, vehicle_id, customer_id, status from reservations where id=$1', [resA]));
  console.log('reservation B:', await q('select id, vehicle_id, customer_id, status from reservations where id=$1', [resB]));
  const delRecord = await q('select id, entity_type, entity_id, related_counts, restored_at from deleted_records where entity_type=$1 and entity_id=$2 order by id desc limit 1', ['vehicle', vehicleId]);
  console.log('deleted_records snapshot:', delRecord);
  const recordId = delRecord[0]?.id;

  // 7. Update a now-deleted vehicle id
  r = await admin.patch(`/api/vehicles/${vehicleId}`, { brand: 'ShouldFail' });
  log('PATCH a now-deleted vehicle id (expect 404)', r);

  // 8. Restore
  r = await admin.post(`/api/deleted-records/${recordId}/restore`, {});
  log('Restore deleted vehicle', r);

  console.log('\n--- DB state after restore ---');
  console.log('vehicle row:', await q('select id, license_plate from vehicles where id=$1', [vehicleId]));
  console.log('reservation A:', await q('select id, vehicle_id, customer_id, status from reservations where id=$1', [resA]));
  console.log('reservation B:', await q('select id, vehicle_id, customer_id, status from reservations where id=$1', [resB]));

  // 9. Restore AGAIN (already restored)
  r = await admin.post(`/api/deleted-records/${recordId}/restore`, {});
  log('Restore SAME record again (expect already_restored)', r);

  // 10. Restore with plate reused: delete again, then create a new vehicle with same plate, then try restore
  r = await admin.del(`/api/vehicles/${vehicleId}`, { confirmLicensePlate: plate });
  log('Delete again (for plate-reuse restore test)', r);
  const delRecord2 = await q('select id from deleted_records where entity_type=$1 and entity_id=$2 order by id desc limit 1', ['vehicle', vehicleId]);
  const recordId2 = delRecord2[0]?.id;

  r = await admin.post('/api/vehicles', { licensePlate: plate, brand: 'AUDIT-Reused', model: 'AUDIT-Reused' });
  log('Create NEW vehicle reusing the same plate', r);

  r = await admin.post(`/api/deleted-records/${recordId2}/restore`, {});
  log('Restore old record when plate now reused (expect license_plate_taken)', r);

  // 11. Restore non-existing id
  r = await admin.post('/api/deleted-records/999999999/restore', {});
  log('Restore non-existing deleted-record id', r);

  console.log('\n\nSTATE:', JSON.stringify({ vehicleId, plate, custA, custB, resA, resB, recordId, recordId2 }));
})().catch(e => { console.error('FATAL', e); process.exitCode = 1; });
