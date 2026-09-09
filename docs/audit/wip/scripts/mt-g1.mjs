import { Session } from './mt-lib.mjs';
import { q } from './db.mjs';

const V1 = 1671, V2 = 1668, V3 = 1669, V4 = 1670, V5 = 1675;
const C1 = 1251, C2 = 1252;

const s = new Session('admin');

function j(x) { return JSON.stringify(x); }

async function vehState(id) {
  const r = await q('select id, availability_status, maintenance_status, maintenance_note from vehicles where id=$1', [id]);
  return r[0];
}
async function resState(id) {
  const r = await q('select id, vehicle_id, customer_id, type, status, start_date, end_date, maintenance_status, spare_vehicle_status, deleted_at, replacement_for_reservation_id from reservations where id=$1', [id]);
  return r[0];
}

async function main() {
  await s.primeCsrf();
  const login = await s.loginStaff('admin', 'admin123');
  console.log('login', login.status);
  await s.primeCsrf();

  console.log('\n=== SETUP: customer rental on V1, pickup it ===');
  const rentR = await s.post('/api/reservations', {
    vehicleId: V1, customerId: C1, startDate: '2026-09-10', endDate: '2026-09-20',
    notes: 'AUDIT rental for MT-G1', type: 'standard',
  });
  console.log('create rental', rentR.status, j(rentR.json));
  const rentalId = rentR.json?.id;

  const pickupR = await s.post(`/api/reservations/${rentalId}/pickup`, {
    contractNumber: 'AUDIT-MT-G1-' + Date.now(),
    pickupMileage: 1000,
    fuelLevelPickup: 'full',
    pickupDate: '2026-09-10',
  });
  console.log('pickup rental', pickupR.status, j(pickupR.json)?.slice(0, 400));
  console.log('rental state after pickup', j(await resState(rentalId)));
  console.log('vehicle V1 state after pickup', j(await vehState(V1)));

  console.log('\n=== TEST 1a: maintenance_block on V1 overlapping picked_up rental ===');
  const blockR = await s.post('/api/reservations', {
    vehicleId: V1, type: 'maintenance_block',
    startDate: '2026-09-12', endDate: '2026-09-14',
    notes: 'AUDIT block overlapping picked_up rental',
  });
  console.log('block create status', blockR.status, j(blockR.json));
  const blockId = blockR.json?.maintenanceReservationId || blockR.json?.id;
  console.log('block row via SQL (should exist even though we do not follow up)', j(await resState(blockId)));
  console.log('vehicle V1 state after block create (no follow-up)', j(await vehState(V1)));

  console.log('\n=== TEST 1b: block without endDate ===');
  const blockNoEnd = await s.post('/api/reservations', {
    vehicleId: V2, type: 'maintenance_block', startDate: '2026-09-15',
    notes: 'AUDIT block no endDate',
  });
  console.log('block no endDate status', blockNoEnd.status, j(blockNoEnd.json));
  const blockNoEndId = blockNoEnd.json?.id || blockNoEnd.json?.maintenanceReservationId;
  console.log('row', j(await resState(blockNoEndId)));

  console.log('\n=== TEST 1c: block endDate before startDate ===');
  const blockBadDates = await s.post('/api/reservations', {
    vehicleId: V2, type: 'maintenance_block', startDate: '2026-09-20', endDate: '2026-09-10',
    notes: 'AUDIT block end before start',
  });
  console.log('block bad dates status', blockBadDates.status, j(blockBadDates.json));

  console.log('\n=== TEST 1d: block on deleted/non-existing vehicle ===');
  const blockGhostVehicle = await s.post('/api/reservations', {
    vehicleId: 999999999, type: 'maintenance_block', startDate: '2026-09-15', endDate: '2026-09-16',
    notes: 'AUDIT block on non-existing vehicle',
  });
  console.log('block ghost vehicle status', blockGhostVehicle.status, j(blockGhostVehicle.json));

  console.log('\n=== TEST 1e: two overlapping blocks on same vehicle (V2) ===');
  const blockOverlap1 = await s.post('/api/reservations', {
    vehicleId: V2, type: 'maintenance_block', startDate: '2026-10-01', endDate: '2026-10-10',
    notes: 'AUDIT overlap block 1',
  });
  console.log('overlap block1 status', blockOverlap1.status, j(blockOverlap1.json));
  const blockOverlap2 = await s.post('/api/reservations', {
    vehicleId: V2, type: 'maintenance_block', startDate: '2026-10-05', endDate: '2026-10-15',
    notes: 'AUDIT overlap block 2',
  });
  console.log('overlap block2 status', blockOverlap2.status, j(blockOverlap2.json));
  const ob1 = blockOverlap1.json?.id, ob2 = blockOverlap2.json?.id;
  console.log('overlap block rows', j(await resState(ob1)), j(await resState(ob2)));

  console.log('\n=== TEST 1f: edit block dates via PATCH /:id onto a customer rental period ===');
  // move blockNoEndId (on V2) dates to overlap an existing customer rental on V2 if any; else just test PATCH basic mechanics
  const patchIdR = await s.patch(`/api/reservations/${blockNoEndId}`, {
    startDate: '2026-09-16', endDate: '2026-09-18',
  });
  console.log('PATCH /:id on block status', patchIdR.status, j(patchIdR.json)?.slice(0,400));
  console.log('row after PATCH /:id', j(await resState(blockNoEndId)));

  const patchBasicR = await s.patch(`/api/reservations/${blockNoEndId}/basic`, {
    startDate: '2026-09-17', endDate: '2026-09-19',
  });
  console.log('PATCH /:id/basic on block status', patchBasicR.status, j(patchBasicR.json)?.slice(0,400));
  console.log('row after PATCH /basic', j(await resState(blockNoEndId)));

  console.log('\n=== TEST 1g: set maintenanceStatus in/out/garbage ===');
  for (const ms of ['in', 'out', 'garbage']) {
    const r = await s.patch(`/api/reservations/${blockNoEndId}`, { maintenanceStatus: ms });
    console.log(`PATCH maintenanceStatus=${ms}`, r.status, j(r.json)?.slice(0,300));
    console.log('row', j(await resState(blockNoEndId)));
    console.log('vehicle V2 state', j(await vehState(V2)));
  }

  console.log('\n=== TEST 1h: delete block -> effect on placeholder/replacement rows ===');
  // First create a replacement (spare) tied to blockId via assign-spare, then delete block, see what happens
  const spareAssignR = await s.post(`/api/reservations/${blockId}/assign-spare`, {
    spareVehicleId: V3, startDate: '2026-09-12', endDate: '2026-09-14',
  });
  console.log('assign-spare to block', spareAssignR.status, j(spareAssignR.json)?.slice(0,400));
  const replId = spareAssignR.json?.replacementReservation?.id;
  console.log('replacement row before delete', j(await resState(replId)));

  const delBlockR = await s.del(`/api/reservations/${blockId}`);
  console.log('delete block status', delBlockR.status, j(delBlockR.json)?.slice(0,300));
  console.log('block row after delete', j(await resState(blockId)));
  console.log('replacement row after block delete', j(await resState(replId)));
  console.log('vehicle V1 state after block delete', j(await vehState(V1)));
  console.log('vehicle V3 (spare) state after block delete', j(await vehState(V3)));

  console.log('\n=== IDS FOR REFERENCE ===');
  console.log(j({ rentalId, blockId, blockNoEndId, ob1, ob2, replId }));
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
