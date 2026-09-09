import { api, cookieHeader, csrfToken, trim } from './api.mjs';
import { VEHICLE_IDS, CUSTOMER_IDS } from './ids.mjs';
import http from 'http';

function rawPost(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: 'localhost', port: 5001, path, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Cookie': cookieHeader(),
        'X-CSRF-Token': csrfToken(),
      },
      agent: new http.Agent({ keepAlive: false }),
    }, (res) => {
      let chunks = '';
      res.on('data', (c) => chunks += c);
      res.on('end', () => resolve({ status: res.statusCode, body: chunks }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  // Create 10 separate booked reservations on different date windows on the same vehicle
  // (vehicle conflict doesn't matter for pickup; we just need 10 distinct 'booked' reservations)
  const V = VEHICLE_IDS.pickupReturn;
  const ids = [];
  for (let i = 0; i < 10; i++) {
    const start = `2027-0${(i % 9) + 1}-01`;
    const r = await api('POST', '/api/reservations', {
      vehicleId: V, customerId: CUSTOMER_IDS.a, startDate: start, endDate: start.replace('01', '02'),
      notes: `AUDIT-race-pickup-setup-${i}`
    });
    if (r.status !== 201) { console.log('setup failed', i, r.status, trim(r.json)); continue; }
    ids.push(r.json.id);
  }
  console.log('created reservation ids for pickup race:', ids);

  const CONTRACT = 'AUDIT-RACE-CONTRACT-1';
  const promises = ids.map(id => rawPost(`/api/reservations/${id}/pickup`, {
    contractNumber: CONTRACT, pickupMileage: 25000, fuelLevelPickup: 'full'
  }));
  const t0 = Date.now();
  const results = await Promise.all(promises);
  const t1 = Date.now();
  results.forEach((r, i) => console.log('pickup', ids[i], r.status, trim(r.body, 250)));
  const statusCounts = {};
  results.forEach(r => statusCounts[r.status] = (statusCounts[r.status] || 0) + 1);
  console.log('elapsed ms:', t1 - t0);
  console.log('status counts:', statusCounts);
  console.log('RESERVATION_IDS_FOR_SQL_CHECK', JSON.stringify(ids));
}
main();
