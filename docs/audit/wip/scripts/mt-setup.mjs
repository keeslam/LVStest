import { Session } from './mt-lib.mjs';
import { q } from './db.mjs';

const s = new Session('admin');

async function main() {
  await s.primeCsrf();
  const login = await s.loginStaff('admin', 'admin123');
  console.log('login', login.status);
  if (login.status !== 200) { console.log(login.text); process.exit(1); }
  await s.primeCsrf();

  // Create two AUDIT vehicles for maintenance/transport testing
  const mk = async (plate, brand, model) => {
    const r = await s.post('/api/vehicles', {
      licensePlate: plate,
      brand,
      model,
      vehicleType: 'car',
      dailyPrice: '10',
    });
    console.log('create vehicle', plate, r.status, r.json?.id || r.text.slice(0,200));
    return r.json;
  };

  const v1 = await mk('AU-001-X', 'AUDIT', 'MTBlockCar');
  const v2 = await mk('AU-002-X', 'AUDIT', 'MTSpareCar');
  const v3 = await mk('AU-003-X', 'AUDIT', 'MTSpareCar2');
  const v4 = await mk('AU-004-X', 'AUDIT', 'MTServiceCar');
  const v5 = await mk('AU-005-X', 'AUDIT', 'MTBlockCar2');

  const mkCust = async (first, last) => {
    const r = await s.post('/api/customers', {
      name: `${first} ${last}`,
      firstName: first,
      lastName: last,
      email: `${first.toLowerCase()}.${last.toLowerCase()}@audit-test.example`,
      phone: '0600000000',
    });
    console.log('create customer', first, last, r.status, r.json?.id || r.text.slice(0,200));
    return r.json;
  };

  const c1 = await mkCust('AUDIT', 'Klant1');
  const c2 = await mkCust('AUDIT', 'Klant2');

  // Limited user with only view_reservations, for permission checks
  const ur = await s.post('/api/users', {
    username: 'audit_limited_mt',
    password: 'AuditLimited123!',
    fullName: 'AUDIT Limited MT',
    role: 'user',
    permissions: ['view_reservations'],
    active: true,
  });
  console.log('create limited user', ur.status, ur.json?.id || ur.text.slice(0,300));

  console.log('IDS', JSON.stringify({ v1: v1?.id, v2: v2?.id, v3: v3?.id, v4: v4?.id, v5: v5?.id, c1: c1?.id, c2: c2?.id, limitedUser: ur.json?.id }));
}

main().catch(e => { console.error(e); process.exit(1); });
