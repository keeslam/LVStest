import { cookieHeader, csrfToken, trim } from './api.mjs';
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
  const V = VEHICLE_IDS.contractRace; // 1696, unused so far
  const N = 20;
  const t0 = Date.now();
  const promises = [];
  for (let i = 0; i < N; i++) {
    promises.push(rawPost('/api/reservations', {
      vehicleId: V, customerId: CUSTOMER_IDS.a, startDate: '2026-10-01', endDate: '2026-10-05', notes: `AUDIT-race2-${i}`
    }));
  }
  const results = await Promise.all(promises);
  const t1 = Date.now();
  const statusCounts = {};
  results.forEach(r => statusCounts[r.status] = (statusCounts[r.status] || 0) + 1);
  console.log('elapsed ms:', t1 - t0);
  console.log('status counts:', statusCounts);
}
main();
