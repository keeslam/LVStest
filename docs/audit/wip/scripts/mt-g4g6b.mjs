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

  const V1=1671, V2=1668, V3=1669, V6=1725, V7=1704, V8=1705;
  const C1=1251, C2=1252;

  console.log('\n### 4b redo: spare overlaps another booking ###');
  const busyRentB = await s.post('/api/reservations', { vehicleId: V3, customerId: C2, startDate: '2027-09-03', endDate: '2027-09-05', notes: 'AUDIT g4b busy V3' });
  console.log('busyRentB', busyRentB.status, busyRentB.json?.id);
  const rentalB = await s.post('/api/reservations', { vehicleId: V7, customerId: C1, startDate: '2027-09-03', endDate: '2027-09-05', notes: 'AUDIT g4b rentalB' });
  console.log('rentalB', rentalB.status, rentalB.json?.id);
  const rentalBId = rentalB.json?.id;
  let r = await s.post('/api/reservations/maintenance-with-spare', {
    maintenanceData: { vehicleId: V7, startDate: '2027-09-03', endDate: '2027-09-05', type: 'maintenance_block', notes: 'AUDIT g4b blockB' },
    conflictingReservations: [rentalB.json],
    spareVehicleAssignments: [{ reservationId: rentalBId, spareVehicleId: V3 }],
  });
  console.log('4b result ->', r.status, j(r.json)?.slice(0,400));

  console.log('\n### GROUP 6: transports (redo) ###');
  const rentSwap = await s.post('/api/reservations', { vehicleId: V6, customerId: C1, startDate: '2027-10-01', endDate: '2027-10-10', notes: 'AUDIT g6b swap rental' });
  console.log('rentSwap', rentSwap.status, rentSwap.json?.id);
  const rentSwapId = rentSwap.json?.id;

  r = await s.post('/api/transports', {
    transportType: 'swap', vehicleId: V6, customerId: C1, reservationId: rentSwapId,
    scheduledDate: '2027-10-05', originAddress: 'AUDIT origin', destinationAddress: 'AUDIT dest',
  });
  console.log('create swap transport', r.status, j(r.json)?.slice(0,300));
  const swapTransportId = r.json?.id;

  r = await s.post('/api/transports', { transportType: 'tow', vehicleId: V7, scheduledDate: '2027-10-06', originAddress: 'A', destinationAddress: 'B' });
  console.log('create tow transport', r.status, j(r.json)?.slice(0,300));
  const towTransportId = r.json?.id;

  r = await s.post('/api/transports', { transportType: 'delivery', vehicleId: V8, scheduledDate: '2027-10-07', originAddress: 'A', destinationAddress: 'C' });
  console.log('create delivery transport', r.status, j(r.json)?.slice(0,300));
  const deliveryTransportId = r.json?.id;

  r = await s.patch(`/api/transports/${towTransportId}`, { status: 'completed', completedDate: '2027-10-06' });
  console.log('complete tow transport', r.status, j(r.json)?.slice(0,250));
  console.log('transport row', j(await transportState(towTransportId)));

  r = await s.patch(`/api/transports/${towTransportId}`, { status: 'completed', completedDate: '2027-10-06' });
  console.log('complete tow transport AGAIN (idempotent?)', r.status, j(r.json)?.slice(0,250));

  r = await s.patch(`/api/transports/${deliveryTransportId}`, { status: 'cancelled' });
  console.log('cancel delivery transport', r.status, j(r.json)?.slice(0,250));

  r = await s.patch(`/api/transports/${swapTransportId}`, { spareRequired: true, isBreakdownOrMaintenance: true });
  console.log('mark swap transport spareRequired (TBD)', r.status, j(r.json)?.slice(0,250));
  console.log('swap transport row', j(await transportState(swapTransportId)));

  r = await s.post('/api/delivery/transports/generate-report', { transportIds: [swapTransportId] });
  console.log('generate-report with TBD spare ->', r.status, j(r.json)?.slice(0,300));

  r = await s.patch(`/api/transports/${swapTransportId}`, { relatedVehicleId: V3 });
  console.log('assign spare V3 to swap transport', r.status, j(r.json)?.slice(0,250));
  console.log('swap transport row', j(await transportState(swapTransportId)));

  r = await s.patch(`/api/transports/${swapTransportId}`, { relatedVehicleId: V2 });
  console.log('reassign spare to V2 (still booked, should be allowed)', r.status, j(r.json)?.slice(0,250));
  console.log('swap transport row', j(await transportState(swapTransportId)));

  r = await s.post('/api/delivery/transports/generate-report', { transportIds: [swapTransportId] });
  console.log('generate-report after spare assigned ->', r.status, j(r.json)?.slice(0,250));

  const swapRow = await transportState(swapTransportId);
  const spareResId = swapRow?.spare_reservation_id;
  console.log('swap transport row before delete', j(swapRow));
  r = await s.del(`/api/transports/${swapTransportId}`);
  console.log('delete swap transport with spare reservation', r.status, j(r.json)?.slice(0,250));
  if (spareResId) console.log('spare reservation row after transport delete', j(await resState(spareResId)));

  const bulkIds = [deliveryTransportId, 999999999];
  const results = await Promise.all(bulkIds.map(id => s.patch(`/api/transports/${id}`, { status: 'completed', completedDate: '2027-10-07' }).then(x => ({ id, status: x.status, body: x.json }))));
  console.log('bulk complete results', j(results));
  console.log('deliveryTransport row after bulk (should be completed despite the other failing)', j(await transportState(deliveryTransportId)));

  // pickup then complete the swap's ORIGINAL rental, then try to change vehicle related to a completed spare later - just also test picking up spare and trying to change relatedVehicleId afterwards
  console.log('\n### change spare vehicle AFTER it has been picked_up (should be blocked) ###');
  const rentSwap2 = await s.post('/api/reservations', { vehicleId: V6, customerId: C1, startDate: '2027-11-01', endDate: '2027-11-10', notes: 'AUDIT g6c rental2' });
  const rentSwap2Id = rentSwap2.json?.id;
  r = await s.post('/api/transports', { transportType: 'swap', vehicleId: V6, customerId: C1, reservationId: rentSwap2Id, scheduledDate: '2027-11-05', originAddress: 'A', destinationAddress: 'B' });
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

  console.log('\nIDS', j({ rentalBId, rentSwapId, swapTransportId, towTransportId, deliveryTransportId, swap2Id, spare2ResId }));
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
