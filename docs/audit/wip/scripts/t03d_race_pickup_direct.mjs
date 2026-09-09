import { cookieHeader, csrfToken, trim } from './api.mjs';
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
  const ids = [3280,3281,3282,3283,3284,3285,3286,3287,3288];
  const CONTRACT = 'AUDIT-RACE-CONTRACT-2';
  const promises = ids.map(id => rawPost(`/api/reservations/${id}/pickup`, {
    contractNumber: CONTRACT, pickupMileage: 25000, fuelLevelPickup: 'full'
  }));
  const t0 = Date.now();
  const results = await Promise.all(promises);
  const t1 = Date.now();
  results.forEach((r, i) => console.log('pickup', ids[i], r.status, trim(r.body, 300)));
  const statusCounts = {};
  results.forEach(r => statusCounts[r.status] = (statusCounts[r.status] || 0) + 1);
  console.log('elapsed ms:', t1 - t0);
  console.log('status counts:', statusCounts);
}
main();
