import { api, trim } from './api.mjs';
import { CUSTOMER_IDS } from './ids.mjs';

function log(label, r) {
  console.log(`\n== ${label} ==`);
  console.log('status:', r.status);
  console.log('body:', trim(r.json ?? r.text, 500));
}

async function main() {
  const V = 1691; // pickupReturn vehicle, current_mileage=25000

  // Reservation for: missing contract number test
  const r1 = await api('POST', '/api/reservations', { vehicleId: V, customerId: CUSTOMER_IDS.a, startDate: '2028-01-01', endDate: '2028-01-05', notes: 'AUDIT-pickup-missing-contract' });
  const id1 = r1.json.id; console.log('id1', id1);
  log('pickup missing contractNumber', await api('POST', `/api/reservations/${id1}/pickup`, { pickupMileage: 26000, fuelLevelPickup: 'full' }));

  // Duplicate contract number: reservation 3281 already has contract AUDIT-RACE-CONTRACT-2 (picked_up). Try to pickup another with same number.
  const r2 = await api('POST', '/api/reservations', { vehicleId: V, customerId: CUSTOMER_IDS.a, startDate: '2028-02-01', endDate: '2028-02-05', notes: 'AUDIT-pickup-dup-contract' });
  const id2 = r2.json.id; console.log('id2', id2);
  log('pickup duplicate contractNumber (already used by 3281)', await api('POST', `/api/reservations/${id2}/pickup`, { contractNumber: 'AUDIT-RACE-CONTRACT-2', pickupMileage: 26000, fuelLevelPickup: 'full' }));

  // mileage lower than vehicle current mileage without override -> expect 400 requiresOverride
  const r3 = await api('POST', '/api/reservations', { vehicleId: V, customerId: CUSTOMER_IDS.a, startDate: '2028-03-01', endDate: '2028-03-05', notes: 'AUDIT-pickup-mileage-lower' });
  const id3 = r3.json.id; console.log('id3', id3);
  log('pickup mileage lower, no override', await api('POST', `/api/reservations/${id3}/pickup`, { contractNumber: 'AUDIT-CN-MILEAGE-LOWER', pickupMileage: 100, fuelLevelPickup: 'full' }));
  log('pickup mileage lower, allowMileageDecrease=true no password', await api('POST', `/api/reservations/${id3}/pickup`, { contractNumber: 'AUDIT-CN-MILEAGE-LOWER', pickupMileage: 100, fuelLevelPickup: 'full', allowMileageDecrease: true }));
  log('pickup mileage lower, wrong override password', await api('POST', `/api/reservations/${id3}/pickup`, { contractNumber: 'AUDIT-CN-MILEAGE-LOWER', pickupMileage: 100, fuelLevelPickup: 'full', allowMileageDecrease: true, overridePassword: 'wrong-password-xyz' }));

  // return before pickup
  const r4 = await api('POST', '/api/reservations', { vehicleId: V, customerId: CUSTOMER_IDS.a, startDate: '2028-04-01', endDate: '2028-04-05', notes: 'AUDIT-return-before-pickup' });
  const id4 = r4.json.id; console.log('id4', id4);
  log('return before pickup', await api('POST', `/api/reservations/${id4}/return`, { returnMileage: 27000, fuelLevelReturn: 'full' }));

  // pickup twice
  const r5 = await api('POST', '/api/reservations', { vehicleId: V, customerId: CUSTOMER_IDS.a, startDate: '2028-05-01', endDate: '2028-05-05', notes: 'AUDIT-pickup-twice' });
  const id5 = r5.json.id; console.log('id5', id5);
  log('pickup #1', await api('POST', `/api/reservations/${id5}/pickup`, { contractNumber: 'AUDIT-CN-PICKUP-TWICE', pickupMileage: 26500, fuelLevelPickup: 'full' }));
  log('pickup #2 (same reservation)', await api('POST', `/api/reservations/${id5}/pickup`, { contractNumber: 'AUDIT-CN-PICKUP-TWICE-B', pickupMileage: 26600, fuelLevelPickup: 'full' }));

  // return twice
  log('return #1', await api('POST', `/api/reservations/${id5}/return`, { returnMileage: 26700, fuelLevelReturn: 'full' }));
  log('return #2 (same reservation)', await api('POST', `/api/reservations/${id5}/return`, { returnMileage: 26800, fuelLevelReturn: 'full' }));

  // pickup on cancelled reservation
  const r6 = await api('POST', '/api/reservations', { vehicleId: V, customerId: CUSTOMER_IDS.a, startDate: '2028-06-01', endDate: '2028-06-05', notes: 'AUDIT-pickup-cancelled' });
  const id6 = r6.json.id; console.log('id6', id6);
  log('cancel it first', await api('PATCH', `/api/reservations/${id6}/status`, { status: 'cancelled' }));
  log('pickup on cancelled reservation', await api('POST', `/api/reservations/${id6}/pickup`, { contractNumber: 'AUDIT-CN-CANCELLED', pickupMileage: 26900, fuelLevelPickup: 'full' }));

  // pickup on deleted reservation
  const r7 = await api('POST', '/api/reservations', { vehicleId: V, customerId: CUSTOMER_IDS.a, startDate: '2028-07-01', endDate: '2028-07-05', notes: 'AUDIT-pickup-deleted' });
  const id7 = r7.json.id; console.log('id7', id7);
  log('delete it first', await api('DELETE', `/api/reservations/${id7}`));
  log('pickup on deleted reservation', await api('POST', `/api/reservations/${id7}/pickup`, { contractNumber: 'AUDIT-CN-DELETED', pickupMileage: 27000, fuelLevelPickup: 'full' }));

  console.log('ALL_IDS', JSON.stringify({ id1, id2, id3, id4, id5, id6, id7 }));
}
main();
