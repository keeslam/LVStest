import { Session } from './mt-lib.mjs';
import { q } from './db.mjs';

const s = new Session('admin');
function j(x){ return JSON.stringify(x); }
async function resState(id){ const r=await q('select id, vehicle_id, customer_id, type, status, start_date, end_date, spare_vehicle_status, deleted_at, replacement_for_reservation_id from reservations where id=$1',[id]); return r[0]; }
async function transportState(id){ const r = await q('select id, status, vehicle_id, related_vehicle_id, spare_reservation_id, spare_required, is_breakdown_or_maintenance from vehicle_transports where id=$1', [id]); return r[0]; }

async function main(){
  await s.primeCsrf();
  const login = await s.loginStaff('admin', 'admin123');
  console.log('LOGIN', login.status);
  if (login.status !== 200) { console.log(login.text); process.exit(1); }
  await s.primeCsrf();

  const V6=1725, V7=1704, V8=1705;
  const C1=1251;

  console.log('\n### bulk complete: one valid + one invalid id ###');
  const freshT = await s.post('/api/transports', { transportType: 'other', vehicleId: V8, scheduledDate: '2027-12-01', originAddress: 'A', destinationAddress: 'B' });
  console.log('freshT create', freshT.status, freshT.json?.id);
  const freshTId = freshT.json?.id;
  const bulkIds = [freshTId, 999999999];
  const results = await Promise.all(bulkIds.map(id => s.patch(`/api/transports/${id}`, { status: 'completed', completedDate: '2027-12-01' }).then(x => ({ id, status: x.status, body: x.json })).catch(e => ({ id, error: String(e) }))));
  console.log('bulk complete results', j(results));
  console.log('freshT row after bulk (valid one should be completed even though the other 404d)', j(await transportState(freshTId)));

  console.log('\n### change spare vehicle AFTER pickup (should be blocked) ###');
  const rentSwap2 = await s.post('/api/reservations', { vehicleId: V6, customerId: C1, startDate: '2027-11-01', endDate: '2027-11-10', notes: 'AUDIT g6c rental2' });
  const rentSwap2Id = rentSwap2.json?.id;
  console.log('rentSwap2', rentSwap2.status, rentSwap2Id);
  let r = await s.post('/api/transports', { transportType: 'swap', vehicleId: V6, customerId: C1, reservationId: rentSwap2Id, scheduledDate: '2027-11-05', originAddress: 'A', destinationAddress: 'B' });
  const swap2Id = r.json?.id;
  console.log('swap2 create', r.status, swap2Id);
  r = await s.patch(`/api/transports/${swap2Id}`, { spareRequired: true, relatedVehicleId: V7 });
  console.log('assign spare to swap2', r.status, j(r.json)?.slice(0,250));
  const swap2Row = await transportState(swap2Id);
  console.log('swap2 row', j(swap2Row));
  const spare2ResId = swap2Row?.spare_reservation_id;
  const puR = await s.post(`/api/reservations/${spare2ResId}/pickup`, { contractNumber: 'AUDIT-G6C-'+Date.now(), pickupMileage: 1, fuelLevelPickup: 'full', pickupDate: '2027-11-05' });
  console.log('pickup spare2 reservation', puR.status, j(puR.json)?.slice(0,200));
  r = await s.patch(`/api/transports/${swap2Id}`, { relatedVehicleId: V8 });
  console.log('try reassign spare after pickup (should be BLOCKED per code comment) ->', r.status, j(r.json)?.slice(0,300));
  console.log('swap2 row after attempted reassign', j(await transportState(swap2Id)));

  console.log('\nIDS', j({ freshTId, rentSwap2Id, swap2Id, spare2ResId }));
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
