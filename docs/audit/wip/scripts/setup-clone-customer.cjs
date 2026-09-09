const { Session } = require('./lib-vc.cjs');

(async () => {
  const s = new Session('admin');
  const login = await s.loginStaff('admin', 'admin123');
  if (login.status !== 200) { console.error('login failed', login.status, login.text); process.exitCode = 1; return; }

  // 1. Create clone customer
  const custRes = await s.post('/api/customers', {
    name: 'AUDIT-Clone179 B.V.',
    email: 'audit-clone179@example.com',
    customerType: 'business',
    driverLicenseNumber: 'AUDIT-DL-179',
  });
  console.log('Create customer:', custRes.status, custRes.text);
  if (custRes.status !== 201) { process.exitCode = 1; return; }
  const customerId = custRes.json.id;

  // 2. Add a driver
  const driverRes = await s.post(`/api/customers/${customerId}/drivers`, {
    displayName: 'AUDIT Clone Driver',
    firstName: 'Clone',
    lastName: 'Driver',
    email: 'audit-clone-driver@example.com',
  });
  console.log('Create driver:', driverRes.status, driverRes.text);

  // 3. Add a portal account
  const portalRes = await s.post(`/api/portal-admin/customers/${customerId}/accounts`, {
    email: 'audit-clone179-portal@example.com',
    fullName: 'AUDIT Clone Portal User',
    role: 'admin',
    active: true,
  });
  console.log('Create portal account:', portalRes.status, portalRes.text);

  // 4. Add a reservation (vehicle 18, available)
  const resRes = await s.post('/api/reservations', {
    vehicleId: 18,
    customerId,
    startDate: '2026-11-01',
    endDate: '2026-11-05',
    status: 'booked',
    notes: 'AUDIT clone reservation',
  });
  console.log('Create reservation:', resRes.status, resRes.text);

  console.log(JSON.stringify({ customerId, driverId: driverRes.json?.id, portalUserId: portalRes.json?.account?.id, reservationId: resRes.json?.id }));
})();
