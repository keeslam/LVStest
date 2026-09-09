import { api, trim } from './api.mjs';
import { VEHICLE_IDS, CUSTOMER_IDS } from './ids.mjs';

async function main() {
  const V = VEHICLE_IDS.race;
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) =>
    api('POST', '/api/reservations', {
      vehicleId: V, customerId: CUSTOMER_IDS.a, startDate: '2026-10-01', endDate: '2026-10-05', notes: `AUDIT-race-create-${i}`
    })
  ));
  results.forEach((r, i) => console.log(i, r.status, trim(r.json, 150)));
  const statusCounts = {};
  results.forEach(r => statusCounts[r.status] = (statusCounts[r.status] || 0) + 1);
  console.log('status counts:', statusCounts);
}
main();
