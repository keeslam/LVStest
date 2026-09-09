import { api, trim } from './api.mjs';
import { CUSTOMER_IDS } from './ids.mjs';

function log(label, r) {
  console.log(`\n== ${label} ==`);
  console.log('status:', r.status);
  console.log('body:', trim(r.json ?? r.text, 500));
}

async function main() {
  const VA = 1692; // edit vehicle A
  const VB = 1694; // "sequence" vehicle reused as vehicle B target for the vehicle-swap test

  // Existing booking on VB to create a target conflict
  const busyOnB = await api('POST', '/api/reservations', { vehicleId: VB, customerId: CUSTOMER_IDS.a, startDate: '2028-08-01', endDate: '2028-08-10', notes: 'AUDIT-edit-busyB' });
  log('busy reservation on vehicle B', busyOnB);

  // Reservation to edit, on vehicle A
  const created = await api('POST', '/api/reservations', { vehicleId: VA, customerId: CUSTOMER_IDS.a, startDate: '2028-09-01', endDate: '2028-09-05', notes: 'AUDIT-edit-target' });
  log('create edit target', created);
  const id = created.json.id;
  console.log('EDIT_ID', id);

  // change vehicle to VB in a period that conflicts with busyOnB, via full PATCH
  log('PATCH full: change vehicle to busy VB, same dates as busyOnB (expect conflict?)', await api('PATCH', `/api/reservations/${id}`, {
    vehicleId: VB, startDate: '2028-08-03', endDate: '2028-08-05'
  }));

  // change vehicle to VB via /basic
  log('PATCH basic: change vehicle to busy VB, same dates as busyOnB (expect conflict?)', await api('PATCH', `/api/reservations/${id}/basic`, {
    vehicleId: VB, customerId: CUSTOMER_IDS.a, startDate: '2028-08-03', endDate: '2028-08-05', notes: 'AUDIT-edit-target'
  }));

  // change customer
  log('PATCH full: change customer', await api('PATCH', `/api/reservations/${id}`, { customerId: CUSTOMER_IDS.b }));

  // change dates to create a conflict with busyOnB while staying on VB (if vehicle change succeeded) or VA
  // First check current vehicle by reading it back
  const currentState = await api('GET', `/api/reservations/${id}`);
  log('current state after edits', currentState);

  // Edit a completed reservation: create + complete one, then try to edit
  const created2 = await api('POST', '/api/reservations', { vehicleId: VA, customerId: CUSTOMER_IDS.a, startDate: '2028-10-01', endDate: '2028-10-05', notes: 'AUDIT-edit-completed-target' });
  const id2 = created2.json.id; console.log('EDIT_ID2', id2);
  await api('PATCH', `/api/reservations/${id2}/status`, { status: 'picked_up' });
  await api('PATCH', `/api/reservations/${id2}/status`, { status: 'completed' });
  log('PATCH full on completed reservation (change notes)', await api('PATCH', `/api/reservations/${id2}`, { notes: 'AUDIT-edit-completed-CHANGED' }));
  log('PATCH basic on completed reservation (change notes)', await api('PATCH', `/api/reservations/${id2}/basic`, {
    vehicleId: VA, customerId: CUSTOMER_IDS.a, startDate: '2028-10-01', endDate: '2028-10-05', notes: 'AUDIT-edit-completed-CHANGED-basic'
  }));

  // /basic vs full PATCH field differences: try setting a field only /basic's schema recognizes (e.g. driverId) via each
  log('PATCH full: set unknown-ish field damageCheckPath', await api('PATCH', `/api/reservations/${id2}`, { damageCheckPath: '/tmp/AUDIT-path' }));
  log('PATCH basic: omit required startDate (should fail since basic uses full insert schema)', await api('PATCH', `/api/reservations/${id2}/basic`, { notes: 'AUDIT-basic-missing-required' }));

  console.log('ALL_IDS', JSON.stringify({ id, id2 }));
}
main();
