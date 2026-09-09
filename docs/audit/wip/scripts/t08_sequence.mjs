import { api, trim } from './api.mjs';
import { CUSTOMER_IDS } from './ids.mjs';

function log(label, r) {
  console.log(`\n== ${label} ==`);
  console.log('status:', r.status);
  console.log('body:', trim(r.json ?? r.text, 500));
}

async function main() {
  const VA = 1722; // AU-RSV-016
  const VB = 1723; // AU-RSV-017

  const created = await api('POST', '/api/reservations', { vehicleId: VA, customerId: CUSTOMER_IDS.a, startDate: '2029-01-01', endDate: '2029-01-05', notes: 'AUDIT-sequence-start' });
  log('1. create on VA', created);
  const id = created.json.id; console.log('SEQ_ID', id);

  log('2. cancel', await api('PATCH', `/api/reservations/${id}/status`, { status: 'cancelled' }));

  log('3. modify notes (PATCH full) while cancelled', await api('PATCH', `/api/reservations/${id}`, { notes: 'AUDIT-sequence-modified-after-cancel' }));

  log('4. change vehicle to VB (PATCH full) while cancelled', await api('PATCH', `/api/reservations/${id}`, { vehicleId: VB }));

  log('5. delete VB (the now-related vehicle)', await api('DELETE', `/api/vehicles/${VB}`));

  log('6. reload reservation (GET)', await api('GET', `/api/reservations/${id}`));
}
main();
