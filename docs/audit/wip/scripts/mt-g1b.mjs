import { Session } from './mt-lib.mjs';
import { q } from './db.mjs';
const s = new Session('admin');
function j(x){return JSON.stringify(x);}
async function main(){
  await s.primeCsrf();
  await s.loginStaff('admin','admin123');
  await s.primeCsrf();
  console.log('=== booking a customer rental on V2 (1668) during active maintenance block (2026-10-01..10-10) ===');
  const r = await s.post('/api/reservations', {
    vehicleId: 1668, customerId: 1251, startDate: '2026-10-03', endDate: '2026-10-05',
    notes: 'AUDIT rental during active block - should this be blocked/warned?',
  });
  console.log('status', r.status, j(r.json)?.slice(0,500));
  const rows = await q("select id, type, start_date, end_date, status from reservations where vehicle_id=1668 and deleted_at is null order by id");
  console.log('all V2 reservations now', j(rows));
}
main().catch(e=>{console.error(e);process.exit(1);});
