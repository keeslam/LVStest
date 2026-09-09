import { api, trim } from './api.mjs';
import { CUSTOMER_IDS } from './ids.mjs';

function log(label, r) {
  console.log(`\n== ${label} ==`);
  console.log('status:', r.status);
  console.log('body:', trim(r.json ?? r.text, 500));
}

async function main() {
  const V = 1693; // "del" vehicle

  // Simple delete as admin
  const r1 = await api('POST', '/api/reservations', { vehicleId: V, customerId: CUSTOMER_IDS.a, startDate: '2028-11-01', endDate: '2028-11-05', notes: 'AUDIT-delete-simple' });
  const id1 = r1.json.id; console.log('id1', id1);
  log('delete simple', await api('DELETE', `/api/reservations/${id1}`));
  log('delete again (already deleted)', await api('DELETE', `/api/reservations/${id1}`));
  log('GET deleted reservation by id', await api('GET', `/api/reservations/${id1}`));

  // restore path search
  log('attempt restore endpoint /api/reservations/:id/restore (expect 404)', await api('POST', `/api/reservations/${id1}/restore`, {}));

  // Delete a reservation with documents (pickup it first to generate a contract doc) and a driver assignment
  const r2 = await api('POST', '/api/reservations', { vehicleId: V, customerId: CUSTOMER_IDS.a, startDate: '2028-12-01', endDate: '2028-12-05', driverId: 161, notes: 'AUDIT-delete-with-docs' });
  log('create with driverId', r2);
  const id2 = r2.json.id; console.log('id2', id2);
  log('pickup (generates contract doc)', await api('POST', `/api/reservations/${id2}/pickup`, { contractNumber: 'AUDIT-CN-DELETE-DOCS', pickupMileage: 27500, fuelLevelPickup: 'full' }));
  log('delete reservation with docs+driver', await api('DELETE', `/api/reservations/${id2}`));

  console.log('ALL_IDS', JSON.stringify({ id1, id2 }));
}
main();
