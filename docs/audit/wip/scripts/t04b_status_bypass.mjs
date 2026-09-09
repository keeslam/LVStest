import { api, trim } from './api.mjs';
import { CUSTOMER_IDS } from './ids.mjs';

function log(label, r) {
  console.log(`\n== ${label} ==`);
  console.log('status:', r.status);
  console.log('body:', trim(r.json ?? r.text, 500));
}

async function main() {
  const V = 1690; // spare vehicle not yet used in this section

  const created3 = await api('POST', '/api/reservations', {
    vehicleId: V, customerId: CUSTOMER_IDS.a, startDate: '2026-12-01', endDate: '2026-12-05', notes: 'AUDIT-status-bypass-basic'
  });
  log('create3', created3);
  const id3 = created3.json.id;
  console.log('RESERVATION_ID3', id3);
  log('PATCH /basic status=completed on booked (bypass attempt)', await api('PATCH', `/api/reservations/${id3}/basic`, {
    vehicleId: V, customerId: CUSTOMER_IDS.a, startDate: '2026-12-01', endDate: '2026-12-05', status: 'completed', notes: 'AUDIT-status-bypass-basic'
  }));

  const created4 = await api('POST', '/api/reservations', {
    vehicleId: V, customerId: CUSTOMER_IDS.a, startDate: '2027-02-01', endDate: '2027-02-05', notes: 'AUDIT-status-bypass-full'
  });
  log('create4', created4);
  const id4 = created4.json.id;
  console.log('RESERVATION_ID4', id4);
  log('PATCH /:id status=completed on booked (bypass attempt)', await api('PATCH', `/api/reservations/${id4}`, { status: 'completed' }));

  const created5 = await api('POST', '/api/reservations', {
    vehicleId: V, customerId: CUSTOMER_IDS.a, startDate: '2027-03-01', endDate: '2027-03-05', notes: 'AUDIT-status-garbage'
  });
  log('create5', created5);
  const id5 = created5.json.id;
  console.log('RESERVATION_ID5', id5);
  log('PATCH /:id status=garbage', await api('PATCH', `/api/reservations/${id5}`, { status: 'garbage' }));

  const created6 = await api('POST', '/api/reservations', {
    vehicleId: V, customerId: CUSTOMER_IDS.a, startDate: '2027-04-01', endDate: '2027-04-05', notes: 'AUDIT-status-garbage-viastatus'
  });
  log('create6', created6);
  const id6 = created6.json.id;
  console.log('RESERVATION_ID6', id6);
  log('PATCH /status status=garbage', await api('PATCH', `/api/reservations/${id6}/status`, { status: 'garbage' }));

  console.log('ALL_IDS', JSON.stringify({ id3, id4, id5, id6 }));
}
main();
