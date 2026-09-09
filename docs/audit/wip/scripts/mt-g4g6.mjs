import { Session } from './mt-lib.mjs';
import { q } from './db.mjs';

const s = new Session('admin');
function j(x){ return JSON.stringify(x); }
async function resState(id){ const r=await q('select id, vehicle_id, customer_id, type, status, start_date, end_date, spare_vehicle_status, deleted_at, replacement_for_reservation_id from reservations where id=$1',[id]); return r[0]; }
async function vehState(id){ const r=await q('select id, availability_status, maintenance_status from vehicles where id=$1',[id]); return r[0]; }
async function countReplacementsFor(origId){ const r = await q("select count(*)::int as c from reservations where replacement_for_reservation_id=$1", [origId]); return r[0].c; }
async function transportState(id){ const r = await q('select id, status, vehicle_id, related_vehicle_id, spare_reservation_id, spare_required, is_breakdown_or_maintenance from vehicle_transports where id=$1', [id]); return r[0]; }

async function main(){
  await s.primeCsrf();
  const login = await s.loginStaff('admin', 'admin123');
  console.log('LOGIN', login.status, login.text.slice(0,150));
  if (login.status !== 200) { console.log('ABORT - login failed'); process.exit(1); }
  await s.primeCsrf();

  const V1=1671, V2=1668, V3=1669, V4=1670, V5=1675;
  const C1=1251, C2=1252;

  // Extra vehicles for transports/maintenance-with-spare group
  const mkV = async (plate, model) => {
    const r = await s.post('/api/vehicles', { licensePlate: plate, brand: 'AUDIT', model, vehicleType: 'car', dailyPrice: '10' });
    return r.json?.id;
  };
  const V6 = await mkV('AU-006-X', 'MTv6');
  const V7 = await mkV('AU-007-X', 'MTv7');
  const V8 = await mkV('AU-008-X', 'MTv8');
  console.log('extra vehicles', { V6, V7, V8 });

  console.log('\n########## GROUP 3 REMAINDER ##########');
  const rentG3 = await s.post('/api/reservations', { vehicleId: V6, customerId: C1, startDate: '2027-05-05', endDate: '2027-05-10', notes: 'AUDIT g3c rental for mismatch/dates test' });
  console.log('rentG3', rentG3.status, rentG3.json?.id);
  const rentG3Id = rentG3.json?.id;

  let r = await s.post('/api/placeholder-reservations', { originalReservationId: rentG3Id, customerId: C2, startDate: '2027-05-05', endDate: '2027-05-07' });
  console.log('3d customerId mismatch ->', r.status, j(r.json)?.slice(0,400));
  if (r.json?.id) console.log('row', j(await resState(r.json.id)));

  r = await s.post('/api/placeholder-reservations', { originalReservationId: rentG3Id, customerId: C1, startDate: '2027-05-10', endDate: '2027-05-01' });
  console.log('3e endDate<startDate ->', r.status, j(r.json)?.slice(0,400));

  console.log('\n########## GROUP 4: maintenance-with-spare ##########');
  // valid case: rental on V1 overlapping a fresh block period; spare = V2
  const rentalA = await s.post('/api/reservations', { vehicleId: V1, customerId: C1, startDate: '2027-06-01', endDate: '2027-06-10', notes: 'AUDIT g4 rentalA' });
  const rentalAId = rentalA.json?.id;
  console.log('rentalA', rentalA.status, rentalAId);

  r = await s.post('/api/reservations/maintenance-with-spare', {
    maintenanceData: { vehicleId: V1, startDate: '2027-06-03', endDate: '2027-06-05', type: 'maintenance_block', notes: 'AUDIT g4 block' },
    conflictingReservations: [rentalA.json],
    spareVehicleAssignments: [{ reservationId: rentalAId, spareVehicleId: V2 }],
  });
  console.log('4a valid maintenance-with-spare', r.status, j(r.json)?.slice(0,500));
  const g4BlockId = r.json?.maintenanceReservation?.id;
  const g4ReplId = r.json?.updatedReservations?.[0]?.id;
  console.log('replacement count for rentalA after 1st call:', await countReplacementsFor(rentalAId));
  console.log('replacement row', j(await resState(g4ReplId)));

  // invalid: spare overlaps another booking
  const busyRentB = await s.post('/api/reservations', { vehicleId: V3, customerId: C2, startDate: '2027-06-03', endDate: '2027-06-05', notes: 'AUDIT g4 busy V3' });
  console.log('busyRentB', busyRentB.status, busyRentB.json?.id);
  const rentalB = await s.post('/api/reservations', { vehicleId: V7, customerId: C1, startDate: '2027-06-03', endDate: '2027-06-05', notes: 'AUDIT g4 rentalB' });
  const rentalBId = rentalB.json?.id;
  r = await s.post('/api/reservations/maintenance-with-spare', {
    maintenanceData: { vehicleId: V7, startDate: '2027-06-03', endDate: '2027-06-05', type: 'maintenance_block', notes: 'AUDIT g4 blockB' },
    conflictingReservations: [rentalB.json],
    spareVehicleAssignments: [{ reservationId: rentalBId, spareVehicleId: V3 }], // V3 is busy
  });
  console.log('4b spare overlaps another booking ->', r.status, j(r.json)?.slice(0,400));

  // maintenanceId that is NOT a block (pass rentalAId, a standard reservation)
  r = await s.post('/api/reservations/maintenance-with-spare', {
    maintenanceId: rentalAId,
    maintenanceData: { vehicleId: V1, startDate: '2027-06-03', endDate: '2027-06-05' },
    conflictingReservations: [],
    spareVehicleAssignments: [],
  });
  console.log('4c maintenanceId not a block ->', r.status, j(r.json)?.slice(0,400));

  // empty arrays with a fresh maintenanceId (no assignments)
  const freshBlock = await s.post('/api/reservations', { vehicleId: V8, type: 'maintenance_block', startDate: '2027-07-01', endDate: '2027-07-05', notes: 'AUDIT g4 fresh block for empty-array test' });
  const freshBlockId = freshBlock.json?.id || freshBlock.json?.maintenanceReservationId;
  console.log('freshBlock', freshBlock.status, freshBlockId);
  r = await s.post('/api/reservations/maintenance-with-spare', {
    maintenanceId: freshBlockId,
    maintenanceData: { vehicleId: V8, startDate: '2027-07-01', endDate: '2027-07-05', type: 'maintenance_block' },
    conflictingReservations: [],
    spareVehicleAssignments: [],
  });
  console.log('4d empty arrays ->', r.status, j(r.json)?.slice(0,400));

  // run it TWICE for the same block (g4BlockId) - stale replacement deletion behaviour
  // First, move the existing replacement (g4ReplId) to picked_up via /pickup to simulate a real handover
  if (g4ReplId) {
    const contractNum = 'AUDIT-G4-' + Date.now();
    const pu = await s.post(`/api/reservations/${g4ReplId}/pickup`, { contractNumber: contractNum, pickupMileage: 5, fuelLevelPickup: 'full', pickupDate: '2027-06-03' });
    console.log('picked up the replacement (simulating real handover)', pu.status, j(pu.json)?.slice(0,200));
    console.log('replacement row after pickup', j(await resState(g4ReplId)));
  }
  r = await s.post('/api/reservations/maintenance-with-spare', {
    maintenanceId: g4BlockId,
    maintenanceData: { vehicleId: V1, startDate: '2027-06-03', endDate: '2027-06-05', type: 'maintenance_block' },
    conflictingReservations: [rentalA.json],
    spareVehicleAssignments: [{ reservationId: rentalAId, spareVehicleId: V6 }], // reassign to a different spare
  });
  console.log('4e second run for same block (should replace) ->', r.status, j(r.json)?.slice(0,500));
  console.log('OLD replacement row (g4ReplId) after re-run - was it hard-deleted despite being picked_up?', j(await resState(g4ReplId)));
  console.log('replacement count for rentalA after 2nd call:', await countReplacementsFor(rentalAId));
  const allReplForA = await q('select id, vehicle_id, status, deleted_at from reservations where replacement_for_reservation_id=$1', [rentalAId]);
  console.log('all replacement rows (incl any) for rentalA:', j(allReplForA));

  console.log('\n########## GROUP 6: transports ##########');
  // swap transport for a reservation
  const rentSwap = await s.post('/api/reservations', { vehicleId: V6, customerId: C1, startDate: '2027-08-01', endDate: '2027-08-10', notes: 'AUDIT g6 swap rental' });
  const rentSwapId = rentSwap.json?.id;
  console.log('rentSwap', rentSwap.status, rentSwapId);

  r = await s.post('/api/transports', {
    transportType: 'swap', vehicleId: V6, customerId: C1, reservationId: rentSwapId,
    scheduledDate: '2027-08-05', originAddress: 'AUDIT origin', destinationAddress: 'AUDIT dest',
  });
  console.log('create swap transport', r.status, j(r.json)?.slice(0,400));
  const swapTransportId = r.json?.id;

  r = await s.post('/api/transports', {
    transportType: 'tow', vehicleId: V7, scheduledDate: '2027-08-06', originAddress: 'A', destinationAddress: 'B',
  });
  console.log('create tow transport', r.status, j(r.json)?.slice(0,300));
  const towTransportId = r.json?.id;

  r = await s.post('/api/transports', {
    transportType: 'delivery', vehicleId: V8, scheduledDate: '2027-08-07', originAddress: 'A', destinationAddress: 'C',
  });
  console.log('create delivery transport', r.status, j(r.json)?.slice(0,300));
  const deliveryTransportId = r.json?.id;

  // complete the tow transport
  r = await s.patch(`/api/transports/${towTransportId}`, { status: 'completed', completedDate: '2027-08-06' });
  console.log('complete tow transport', r.status, j(r.json)?.slice(0,300));
  console.log('transport row', j(await transportState(towTransportId)));

  // complete twice
  r = await s.patch(`/api/transports/${towTransportId}`, { status: 'completed', completedDate: '2027-08-06' });
  console.log('complete tow transport AGAIN', r.status, j(r.json)?.slice(0,300));

  // cancel the delivery transport
  r = await s.patch(`/api/transports/${deliveryTransportId}`, { status: 'cancelled' });
  console.log('cancel delivery transport', r.status, j(r.json)?.slice(0,300));

  // generate-report with a transport whose spare is still TBD
  r = await s.patch(`/api/transports/${swapTransportId}`, { spareRequired: true, isBreakdownOrMaintenance: true }); // spare TBD (no relatedVehicleId)
  console.log('mark swap transport spareRequired (TBD)', r.status, j(r.json)?.slice(0,400));
  console.log('swap transport row', j(await transportState(swapTransportId)));
  r = await s.post('/api/delivery/transports/generate-report', { transportIds: [swapTransportId] });
  console.log('generate-report with TBD spare ->', r.status, j(r.json)?.slice(0,400));

  // change vehicle on the transport day (assign a spare, then re-assign to a different one, same day)
  r = await s.patch(`/api/transports/${swapTransportId}`, { relatedVehicleId: V3 });
  console.log('assign spare V3 to swap transport', r.status, j(r.json)?.slice(0,400));
  console.log('swap transport row', j(await transportState(swapTransportId)));
  r = await s.patch(`/api/transports/${swapTransportId}`, { relatedVehicleId: V7 });
  console.log('reassign spare to V7 (still booked, should be allowed)', r.status, j(r.json)?.slice(0,400));

  // now generate-report should succeed (spare assigned)
  r = await s.post('/api/delivery/transports/generate-report', { transportIds: [swapTransportId] });
  console.log('generate-report after spare assigned ->', r.status, j(r.json)?.slice(0,300));

  // delete a transport that has a spare reservation - check for stale spare
  const swapRow = await transportState(swapTransportId);
  console.log('swap transport row before delete', j(swapRow));
  const spareResId = swapRow?.spare_reservation_id;
  r = await s.del(`/api/transports/${swapTransportId}`);
  console.log('delete swap transport with spare reservation', r.status, j(r.json)?.slice(0,300));
  if (spareResId) console.log('spare reservation row after transport delete', j(await resState(spareResId)));

  // bulk complete with one invalid id in the list (simulate client's Promise.all over PATCH)
  const bulkIds = [deliveryTransportId, 999999999];
  const results = await Promise.all(bulkIds.map(id => s.patch(`/api/transports/${id}`, { status: 'completed', completedDate: '2027-08-07' }).then(x => ({ id, status: x.status, body: x.json }))));
  console.log('bulk complete results', j(results));
  console.log('deliveryTransport row after bulk (should be completed despite the other failing)', j(await transportState(deliveryTransportId)));

  console.log('\nIDS', j({ rentalAId, rentalBId, g4BlockId, g4ReplId, freshBlockId, rentSwapId, swapTransportId, towTransportId, deliveryTransportId, V6, V7, V8 }));
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
