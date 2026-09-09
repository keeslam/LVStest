import { api, trim } from './api.mjs';
import { VEHICLE_IDS, CUSTOMER_IDS } from './ids.mjs';

function log(label, r) {
  console.log(`\n== ${label} ==`);
  console.log('status:', r.status);
  console.log('body:', trim(r.json ?? r.text, 500));
}

async function main() {
  // 1. Valid
  log('valid create', await api('POST', '/api/reservations', {
    vehicleId: VEHICLE_IDS.main1, customerId: CUSTOMER_IDS.a,
    startDate: '2026-10-01', endDate: '2026-10-05', totalPrice: '250.00', notes: 'AUDIT-valid-create'
  }));

  // end before start
  log('end before start', await api('POST', '/api/reservations', {
    vehicleId: VEHICLE_IDS.main1, customerId: CUSTOMER_IDS.a,
    startDate: '2026-11-05', endDate: '2026-11-01', notes: 'AUDIT-end-before-start'
  }));

  // same day start=end
  log('same day start=end', await api('POST', '/api/reservations', {
    vehicleId: VEHICLE_IDS.main1, customerId: CUSTOMER_IDS.a,
    startDate: '2026-11-10', endDate: '2026-11-10', notes: 'AUDIT-sameday'
  }));

  // start in the past
  log('start in the past', await api('POST', '/api/reservations', {
    vehicleId: VEHICLE_IDS.main1, customerId: CUSTOMER_IDS.a,
    startDate: '2020-01-01', endDate: '2020-01-05', notes: 'AUDIT-past-start'
  }));

  // far future 2099
  log('far future 2099', await api('POST', '/api/reservations', {
    vehicleId: VEHICLE_IDS.main1, customerId: CUSTOMER_IDS.a,
    startDate: '2099-01-01', endDate: '2099-01-05', notes: 'AUDIT-far-future'
  }));

  // missing vehicleId
  log('missing vehicleId', await api('POST', '/api/reservations', {
    customerId: CUSTOMER_IDS.a, startDate: '2026-12-01', endDate: '2026-12-05', notes: 'AUDIT-missing-vehicleId'
  }));

  // missing customerId (may be allowed - nullable)
  log('missing customerId', await api('POST', '/api/reservations', {
    vehicleId: VEHICLE_IDS.main1, startDate: '2026-12-06', endDate: '2026-12-08', notes: 'AUDIT-missing-customerId'
  }));

  // non-existing ids
  log('non-existing vehicleId', await api('POST', '/api/reservations', {
    vehicleId: 999999999, customerId: CUSTOMER_IDS.a, startDate: '2026-12-10', endDate: '2026-12-12', notes: 'AUDIT-nonexist-vehicle'
  }));
  log('non-existing customerId', await api('POST', '/api/reservations', {
    vehicleId: VEHICLE_IDS.main1, customerId: 999999999, startDate: '2026-12-13', endDate: '2026-12-15', notes: 'AUDIT-nonexist-customer'
  }));

  // totalPrice edge cases
  log('totalPrice -1', await api('POST', '/api/reservations', {
    vehicleId: VEHICLE_IDS.main1, customerId: CUSTOMER_IDS.a, startDate: '2027-01-01', endDate: '2027-01-03',
    totalPrice: -1, notes: 'AUDIT-price-negative'
  }));
  log('totalPrice abc', await api('POST', '/api/reservations', {
    vehicleId: VEHICLE_IDS.main1, customerId: CUSTOMER_IDS.a, startDate: '2027-01-05', endDate: '2027-01-07',
    totalPrice: 'abc', notes: 'AUDIT-price-abc'
  }));
  log('totalPrice 1e308', await api('POST', '/api/reservations', {
    vehicleId: VEHICLE_IDS.main1, customerId: CUSTOMER_IDS.a, startDate: '2027-01-10', endDate: '2027-01-12',
    totalPrice: 1e308, notes: 'AUDIT-price-huge'
  }));

  // notes 100kB
  log('notes 100kB', await api('POST', '/api/reservations', {
    vehicleId: VEHICLE_IDS.main1, customerId: CUSTOMER_IDS.a, startDate: '2027-01-15', endDate: '2027-01-17',
    notes: 'AUDIT-' + 'A'.repeat(100 * 1024)
  }));

  // notes HTML / script
  log('notes HTML/script', await api('POST', '/api/reservations', {
    vehicleId: VEHICLE_IDS.main1, customerId: CUSTOMER_IDS.a, startDate: '2027-01-20', endDate: '2027-01-22',
    notes: 'AUDIT-<script>alert(1)</script><img src=x onerror=alert(2)>'
  }));

  // unexpected extra fields
  log('unexpected extra fields', await api('POST', '/api/reservations', {
    vehicleId: VEHICLE_IDS.main1, customerId: CUSTOMER_IDS.a, startDate: '2027-01-25', endDate: '2027-01-27',
    notes: 'AUDIT-extra-fields', unexpectedField1: 'hello', isAdmin: true, id: 99999999
  }));

  // malformed JSON
  {
    const { cookieHeader, csrfToken } = await import('./api.mjs');
  }
  const malformed = await fetch('http://localhost:5001/api/reservations', {
    method: 'POST',
    headers: {
      'Cookie': (await import('./api.mjs')).cookieHeader(),
      'Content-Type': 'application/json',
      'X-CSRF-Token': (await import('./api.mjs')).csrfToken(),
    },
    body: '{"vehicleId": 1682, "customerId": 1254, startDate: "2027-02-01"'
  });
  const malformedText = await malformed.text();
  console.log('\n== malformed JSON ==');
  console.log('status:', malformed.status);
  console.log('body:', trim(malformedText, 500));

  // wrong content-type
  const wrongCT = await fetch('http://localhost:5001/api/reservations', {
    method: 'POST',
    headers: {
      'Cookie': (await import('./api.mjs')).cookieHeader(),
      'Content-Type': 'text/plain',
      'X-CSRF-Token': (await import('./api.mjs')).csrfToken(),
    },
    body: JSON.stringify({ vehicleId: VEHICLE_IDS.main1, customerId: CUSTOMER_IDS.a, startDate: '2027-02-05', endDate: '2027-02-07', notes: 'AUDIT-wrong-content-type' })
  });
  const wrongCTJson = await wrongCT.text();
  console.log('\n== wrong content-type (text/plain) ==');
  console.log('status:', wrongCT.status);
  console.log('body:', trim(wrongCTJson, 500));
}
main();
