import { api, trim } from './api.mjs';
import { VEHICLE_IDS, CUSTOMER_IDS } from './ids.mjs';

function log(label, r) {
  console.log(`\n== ${label} ==`);
  console.log('status:', r.status);
  console.log('body:', trim(r.json ?? r.text, 500));
}

async function main() {
  const V = VEHICLE_IDS.main2; // 1683, unused so far

  log('far future 2099 (clean vehicle)', await api('POST', '/api/reservations', {
    vehicleId: V, customerId: CUSTOMER_IDS.a, startDate: '2099-01-01', endDate: '2099-01-05', notes: 'AUDIT-far-future'
  }));

  log('missing customerId (clean vehicle)', await api('POST', '/api/reservations', {
    vehicleId: V, startDate: '2026-12-06', endDate: '2026-12-08', notes: 'AUDIT-missing-customerId'
  }));

  log('non-existing customerId (clean vehicle)', await api('POST', '/api/reservations', {
    vehicleId: V, customerId: 999999999, startDate: '2026-12-13', endDate: '2026-12-15', notes: 'AUDIT-nonexist-customer'
  }));

  log('totalPrice -1 (clean vehicle)', await api('POST', '/api/reservations', {
    vehicleId: V, customerId: CUSTOMER_IDS.a, startDate: '2027-01-01', endDate: '2027-01-03', totalPrice: -1, notes: 'AUDIT-price-negative'
  }));
  log('totalPrice abc (clean vehicle)', await api('POST', '/api/reservations', {
    vehicleId: V, customerId: CUSTOMER_IDS.a, startDate: '2027-01-05', endDate: '2027-01-07', totalPrice: 'abc', notes: 'AUDIT-price-abc'
  }));
  log('totalPrice 1e308 (clean vehicle)', await api('POST', '/api/reservations', {
    vehicleId: V, customerId: CUSTOMER_IDS.a, startDate: '2027-01-10', endDate: '2027-01-12', totalPrice: 1e308, notes: 'AUDIT-price-huge'
  }));

  log('notes 100kB (clean vehicle)', await api('POST', '/api/reservations', {
    vehicleId: V, customerId: CUSTOMER_IDS.a, startDate: '2027-01-15', endDate: '2027-01-17', notes: 'AUDIT-' + 'A'.repeat(100 * 1024)
  }));

  log('notes HTML/script (clean vehicle)', await api('POST', '/api/reservations', {
    vehicleId: V, customerId: CUSTOMER_IDS.a, startDate: '2027-01-20', endDate: '2027-01-22', notes: 'AUDIT-<script>alert(1)</script><img src=x onerror=alert(2)>'
  }));

  log('unexpected extra fields (clean vehicle)', await api('POST', '/api/reservations', {
    vehicleId: V, customerId: CUSTOMER_IDS.a, startDate: '2027-01-25', endDate: '2027-01-27', notes: 'AUDIT-extra-fields',
    unexpectedField1: 'hello', isAdmin: true, id: 99999999
  }));
}
main();
