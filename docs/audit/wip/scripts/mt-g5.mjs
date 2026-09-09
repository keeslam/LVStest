import { Session } from './mt-lib.mjs';
import { q } from './db.mjs';
const admin = new Session('admin');
const limited = new Session('limited');
function j(x){return JSON.stringify(x);}
async function resState(id){ const r=await q('select id, vehicle_id, type, status, spare_vehicle_status from reservations where id=$1',[id]); return r[0]; }

async function main(){
  await admin.primeCsrf();
  await admin.loginStaff('admin','admin123');
  await admin.primeCsrf();

  await limited.primeCsrf();
  const lg = await limited.loginStaff('audit_limited_mt', 'AuditLimited123!');
  console.log('limited login', lg.status);
  await limited.primeCsrf();

  const V1=1671, V2=1668, V3=1669;
  const C1=1251;

  console.log('=== setup: rental on V1 (fresh dates), pickup, block, assign-spare (admin) ===');
  const rent = await admin.post('/api/reservations', { vehicleId: V1, customerId: C1, startDate: '2026-12-01', endDate: '2026-12-10', notes: 'AUDIT g5 rental' });
  const rentId = rent.json?.id;
  await admin.post(`/api/reservations/${rentId}/pickup`, { contractNumber: 'AUDIT-G5-'+Date.now(), pickupMileage: 10, fuelLevelPickup: 'full', pickupDate: '2026-12-01' });
  const block = await admin.post('/api/reservations', { vehicleId: V1, type: 'maintenance_block', startDate: '2026-12-03', endDate: '2026-12-05', notes: 'AUDIT g5 block' });
  console.log('block status', block.status, j(block.json)?.slice(0,200));
  const blockId = block.json?.maintenanceReservationId;
  const spare = await admin.post(`/api/reservations/${blockId}/assign-spare`, { spareVehicleId: V2, startDate: '2026-12-03', endDate: '2026-12-05' });
  console.log('assign-spare status', spare.status, j(spare.json)?.slice(0,300));
  const replId = spare.json?.replacementReservation?.id;
  console.log('replacement row', j(await resState(replId)));

  console.log('=== assign-spare with the ORIGINAL vehicle itself as spare ===');
  const selfSpare = await admin.post(`/api/reservations/${blockId}/assign-spare`, { spareVehicleId: V1, startDate: '2026-12-03', endDate: '2026-12-05' });
  console.log('self-spare status', selfSpare.status, j(selfSpare.json)?.slice(0,300));

  console.log('=== assign-spare TWICE (already assigned once above) ===');
  const spare2 = await admin.post(`/api/reservations/${blockId}/assign-spare`, { spareVehicleId: V3, startDate: '2026-12-03', endDate: '2026-12-05' });
  console.log('second assign-spare status', spare2.status, j(spare2.json)?.slice(0,300));
  const allReplsForBlock = await q("select id, vehicle_id, status, spare_vehicle_status from reservations where replacement_for_reservation_id=$1", [blockId]);
  console.log('all replacements for block', j(allReplsForBlock));

  console.log('=== spare-status valid path: assigned -> ready -> picked_up -> returned (admin) ===');
  for (const st of ['ready','picked_up','returned']) {
    const r = await admin.patch(`/api/reservations/${replId}/spare-status`, { spareVehicleStatus: st });
    console.log('spare-status ->', st, r.status, j(r.json)?.slice(0,200));
  }
  console.log('replacement row final', j(await resState(replId)));

  console.log('=== spare-status invalid transition: returned -> assigned (backwards) ===');
  let r = await admin.patch(`/api/reservations/${replId}/spare-status`, { spareVehicleStatus: 'assigned' });
  console.log('backwards transition status', r.status, j(r.json)?.slice(0,300));

  console.log('=== spare-status on a NON-replacement reservation (rentId) ===');
  r = await admin.patch(`/api/reservations/${rentId}/spare-status`, { spareVehicleStatus: 'ready' });
  console.log('spare-status on standard rental status', r.status, j(r.json)?.slice(0,300));
  console.log('rental row after', j(await resState(rentId)));

  console.log('=== PERMISSION CHECK: limited user (view_reservations only) calling assign-spare ===');
  r = await limited.post(`/api/reservations/${rentId}/assign-spare`, { spareVehicleId: V3, startDate: '2026-12-01', endDate: '2026-12-02' });
  console.log('limited assign-spare status', r.status, j(r.json)?.slice(0,200));

  console.log('=== PERMISSION CHECK: limited user calling spare-status PATCH ===');
  r = await limited.patch(`/api/reservations/${replId}/spare-status`, { spareVehicleStatus: 'returned' });
  console.log('limited spare-status status', r.status, j(r.json)?.slice(0,300));

  console.log(j({rentId, blockId, replId}));
}
main().catch(e=>{console.error(e);process.exit(1);});
