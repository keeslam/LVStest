const { Session } = require('./lib-vc.cjs');
const { q } = require('./db-vc.cjs');

const customerId = 1257;
const driverId = 853;
const portalUserId = 934;
const reservationId = 3230;

(async () => {
  console.log('--- BEFORE DELETE ---');
  console.log('customer:', await q('select id, name from customers where id=$1', [customerId]));
  console.log('driver:', await q('select id, customer_id from drivers where id=$1', [driverId]));
  console.log('portal_user:', await q('select id, customer_id from portal_users where id=$1', [portalUserId]));
  console.log('reservation:', await q('select id, customer_id, vehicle_id, status from reservations where id=$1', [reservationId]));

  const s = new Session('admin');
  const login = await s.loginStaff('admin', 'admin123');
  console.log('login', login.status);

  const del = await s.del(`/api/customers/${customerId}`);
  console.log('DELETE /api/customers/:id ->', del.status, del.text);

  console.log('--- AFTER DELETE ---');
  console.log('customer:', await q('select id, name from customers where id=$1', [customerId]));
  console.log('driver (should cascade-delete):', await q('select id, customer_id from drivers where id=$1', [driverId]));
  console.log('portal_user (should cascade-delete):', await q('select id, customer_id from portal_users where id=$1', [portalUserId]));
  console.log('reservation (expect dangling customer_id, no FK):', await q('select id, customer_id, vehicle_id, status from reservations where id=$1', [reservationId]));

  // Also check for orphaned FK integrity generally
  const orphanCount = await q(`select count(*) from reservations r where r.customer_id is not null and not exists (select 1 from customers c where c.id = r.customer_id)`);
  console.log('Total reservations with dangling customer_id (all data):', orphanCount);
})();
