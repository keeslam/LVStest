import { api, trim } from './api.mjs';
import { VEHICLE_IDS, CUSTOMER_IDS } from './ids.mjs';

function log(label, r) {
  console.log(`\n== ${label} ==`);
  console.log('status:', r.status);
  console.log('body:', trim(r.json ?? r.text, 500));
}

async function main() {
  const V = VEHICLE_IDS.status;

  const created = await api('POST', '/api/reservations', {
    vehicleId: V, customerId: CUSTOMER_IDS.a, startDate: '2026-10-01', endDate: '2026-10-05', notes: 'AUDIT-status-flow'
  });
  log('create', created);
  const id = created.json.id;
  console.log('RESERVATION_ID', id);

  // valid path booked -> picked_up
  log('status booked->picked_up', await api('PATCH', `/api/reservations/${id}/status`, { status: 'picked_up' }));

  // valid path picked_up -> completed
  log('status picked_up->completed', await api('PATCH', `/api/reservations/${id}/status`, { status: 'completed' }));

  // invalid jump: completed -> ??? already completed, need a fresh one for booked->completed test
  const created2 = await api('POST', '/api/reservations', {
    vehicleId: V, customerId: CUSTOMER_IDS.a, startDate: '2026-11-01', endDate: '2026-11-05', notes: 'AUDIT-status-invalid-jump'
  });
  const id2 = created2.json.id;
  console.log('RESERVATION_ID2', id2);
  log('invalid jump booked->completed', await api('PATCH', `/api/reservations/${id2}/status`, { status: 'completed' }));

  // invalid jump completed->booked via /status (should actually be allowed per reversion allowlist per doc)
  log('reversion completed->booked (from id, which is completed)', await api('PATCH', `/api/reservations/${id}/status`, { status: 'booked' }));

  // Now test bypass: PATCH /:id/basic with status:'completed' directly on a fresh booked reservation
  const created3 = await api('POST', '/api/reservations', {
    vehicleId: V, customerId: CUSTOMER_IDS.a, startDate: '2026-12-01', endDate: '2026-12-05', notes: 'AUDIT-status-bypass-basic'
  });
  const id3 = created3.json.id;
  console.log('RESERVATION_ID3', id3);
  log('PATCH /basic status=completed on booked (bypass attempt)', await api('PATCH', `/api/reservations/${id3}/basic`, {
    vehicleId: V, customerId: CUSTOMER_IDS.a, startDate: '2026-12-01', endDate: '2026-12-05', status: 'completed', notes: 'AUDIT-status-bypass-basic'
  }));

  // Full PATCH /:id with status:'completed' on booked
  const created4 = await api('POST', '/api/reservations', {
    vehicleId: V, customerId: CUSTOMER_IDS.a, startDate: '2027-02-01', endDate: '2027-02-05', notes: 'AUDIT-status-bypass-full'
  });
  const id4 = created4.json.id;
  console.log('RESERVATION_ID4', id4);
  log('PATCH /:id status=completed on booked (bypass attempt)', await api('PATCH', `/api/reservations/${id4}`, { status: 'completed' }));

  // Full PATCH /:id with status:'garbage'
  const created5 = await api('POST', '/api/reservations', {
    vehicleId: V, customerId: CUSTOMER_IDS.a, startDate: '2027-03-01', endDate: '2027-03-05', notes: 'AUDIT-status-garbage'
  });
  const id5 = created5.json.id;
  console.log('RESERVATION_ID5', id5);
  log('PATCH /:id status=garbage', await api('PATCH', `/api/reservations/${id5}`, { status: 'garbage' }));

  // via /status endpoint with garbage
  const created6 = await api('POST', '/api/reservations', {
    vehicleId: V, customerId: CUSTOMER_IDS.a, startDate: '2027-04-01', endDate: '2027-04-05', notes: 'AUDIT-status-garbage-viastatus'
  });
  const id6 = created6.json.id;
  console.log('RESERVATION_ID6', id6);
  log('PATCH /status status=garbage', await api('PATCH', `/api/reservations/${id6}/status`, { status: 'garbage' }));

  console.log('ALL_IDS', JSON.stringify({ id, id2, id3, id4, id5, id6 }));
}
main();
