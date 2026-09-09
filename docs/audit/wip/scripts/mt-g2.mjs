import { Session } from './mt-lib.mjs';
import { q } from './db.mjs';
const s = new Session('admin');
function j(x){return JSON.stringify(x);}
async function vehState(id){ const r=await q('select id, availability_status, maintenance_status, maintenance_note from vehicles where id=$1',[id]); return r[0]; }
async function resState(id){ const r=await q('select id, vehicle_id, customer_id, type, status, start_date, end_date, maintenance_status from reservations where id=$1',[id]); return r[0]; }

async function main(){
  await s.primeCsrf();
  await s.loginStaff('admin','admin123');
  await s.primeCsrf();

  const V4 = 1670, V5 = 1675;
  const C1 = 1251;

  console.log('=== setup: booked reservation (not picked up) on V4 ===');
  const bookedR = await s.post('/api/reservations', { vehicleId: V4, customerId: C1, startDate: '2026-11-01', endDate: '2026-11-05', notes: 'AUDIT booked for mark-needs-service test' });
  console.log('booked create', bookedR.status, bookedR.json?.id);
  const bookedId = bookedR.json?.id;

  console.log('=== mark-needs-service on booked reservation ===');
  let r = await s.post(`/api/reservations/${bookedId}/mark-needs-service`, { maintenanceStatus: 'in_service', maintenanceNote: 'AUDIT service note booked' });
  console.log('status', r.status, j(r.json)?.slice(0,300));
  console.log('vehicle V4', j(await vehState(V4)));

  console.log('=== mark-needs-service AGAIN (twice) on same reservation ===');
  r = await s.post(`/api/reservations/${bookedId}/mark-needs-service`, { maintenanceStatus: 'in_service', maintenanceNote: 'AUDIT service note booked twice' });
  console.log('status', r.status, j(r.json)?.slice(0,300));
  console.log('vehicle V4', j(await vehState(V4)));
  const blocksV4 = await q("select id,start_date,end_date,maintenance_status,type from reservations where vehicle_id=$1 and type='maintenance_block' order by id", [V4]);
  console.log('maintenance blocks on V4 now', j(blocksV4));

  console.log('=== setup: picked_up reservation on V5 ===');
  const rent2 = await s.post('/api/reservations', { vehicleId: V5, customerId: C1, startDate: '2026-09-10', endDate: '2026-09-20', notes: 'AUDIT rental for pickedup service test' });
  const rent2Id = rent2.json?.id;
  const pu = await s.post(`/api/reservations/${rent2Id}/pickup`, { contractNumber: 'AUDIT-G2-'+Date.now(), pickupMileage: 500, fuelLevelPickup: 'full', pickupDate: '2026-09-10' });
  console.log('pickup status', pu.status);
  console.log('=== mark-needs-service on picked_up reservation ===');
  r = await s.post(`/api/reservations/${rent2Id}/mark-needs-service`, { maintenanceStatus: 'in_service', maintenanceNote: 'AUDIT service on picked_up', serviceStartDate: '2026-09-12', serviceEndDate: '2026-09-14' });
  console.log('status', r.status, j(r.json)?.slice(0,300));
  console.log('vehicle V5', j(await vehState(V5)));
  const blocksV5 = await q("select id,start_date,end_date,maintenance_status,type,customer_id from reservations where vehicle_id=$1 and type='maintenance_block' order by id", [V5]);
  console.log('maintenance blocks on V5', j(blocksV5));

  console.log('=== setup: completed reservation, then mark-needs-service on it ===');
  const rent3 = await s.post('/api/reservations', { vehicleId: V4, customerId: C1, startDate: '2026-08-01', endDate: '2026-08-05', notes: 'AUDIT rental to complete' });
  const rent3Id = rent3.json?.id;
  await s.post(`/api/reservations/${rent3Id}/pickup`, { contractNumber: 'AUDIT-G2C-'+Date.now(), pickupMileage: 100, fuelLevelPickup: 'full', pickupDate: '2026-08-01' });
  const ret = await s.post(`/api/reservations/${rent3Id}/return`, { returnMileage: 200, fuelLevelReturn: 'full', returnDate: '2026-08-05' });
  console.log('return status', ret.status, j(ret.json)?.slice(0,200));
  console.log('rental3 state', j(await resState(rent3Id)));
  r = await s.post(`/api/reservations/${rent3Id}/mark-needs-service`, { maintenanceStatus: 'in_service', maintenanceNote: 'AUDIT service on completed reservation' });
  console.log('mark-needs-service on completed status', r.status, j(r.json)?.slice(0,300));
  console.log('vehicle V4 after completed-mark', j(await vehState(V4)));

  console.log('=== mark-needs-service with future serviceStartDate/EndDate, and past dates ===');
  r = await s.post(`/api/reservations/${rent3Id}/mark-needs-service`, { maintenanceStatus: 'in_service', serviceStartDate: '2020-01-01', serviceEndDate: '2020-01-05' });
  console.log('past dates status', r.status, j(r.json)?.slice(0,200));
  r = await s.post(`/api/reservations/${rent3Id}/mark-needs-service`, { maintenanceStatus: 'in_service', serviceStartDate: '2099-01-01', serviceEndDate: '2020-01-01' });
  console.log('end-before-start dates status', r.status, j(r.json)?.slice(0,200));

  console.log('=== return-from-service tests ===');
  // return-from-service on a NON-replacement reservation (e.g. bookedId, a standard reservation)
  r = await s.post(`/api/reservations/${bookedId}/return-from-service`, { returnDate: '2026-11-06', mileage: 1000 });
  console.log('return-from-service on standard reservation status', r.status, j(r.json)?.slice(0,300));

  // return-from-service on non-existing reservation
  r = await s.post(`/api/reservations/999999999/return-from-service`, { returnDate: '2026-11-06', mileage: 1000 });
  console.log('return-from-service on ghost reservation status', r.status, j(r.json)?.slice(0,300));

  console.log(j({bookedId, rent2Id, rent3Id}));
}
main().catch(e=>{console.error(e);process.exit(1);});
