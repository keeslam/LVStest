import { Session } from './mt-lib.mjs';
import { q } from './db.mjs';
const s = new Session('admin');
function j(x){return JSON.stringify(x);}
async function resState(id){ const r=await q('select id, vehicle_id, customer_id, type, status, start_date, end_date, placeholder_spare from reservations where id=$1',[id]); return r[0]; }
async function main(){
  await s.primeCsrf();
  await s.loginStaff('admin','admin123');
  await s.primeCsrf();
  const V5=1675; // fresh vehicle not touched by service tests
  const C1=1251, C2=1252;

  console.log('=== setup rent2 on V5 for mismatch/bad-date placeholder tests ===');
  const rent2 = await s.post('/api/reservations', { vehicleId: V5, customerId: C1, startDate: '2027-04-05', endDate: '2027-04-10', notes: 'AUDIT g3b rental for mismatch test' });
  console.log('rent2 full', rent2.status, j(rent2.json));
  const rent2Id = rent2.json?.id;

  console.log('=== 3d: placeholder customerId MISMATCH ===');
  let r = await s.post('/api/placeholder-reservations', { originalReservationId: rent2Id, customerId: C2, startDate: '2027-04-05', endDate: '2027-04-07' });
  console.log('mismatch status', r.status, j(r.json)?.slice(0,400));
  console.log('row', j(await resState(r.json?.id)));

  console.log('=== 3e: placeholder endDate before startDate ===');
  r = await s.post('/api/placeholder-reservations', { originalReservationId: rent2Id, customerId: C1, startDate: '2027-04-10', endDate: '2027-04-01' });
  console.log('bad-dates status', r.status, j(r.json)?.slice(0,400));
  console.log('row', j(await resState(r.json?.id)));
}
main().catch(e=>{console.error(e);process.exit(1);});
