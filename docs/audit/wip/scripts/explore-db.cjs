const { q } = require('./db-vc.cjs');
(async () => {
  const vehWithRes = await q(`
    select v.id, v.license_plate, v.availability_status, count(r.id) as active_res
    from vehicles v
    join reservations r on r.vehicle_id = v.id and r.deleted_at is null and r.status in ('booked','picked_up')
    group by v.id order by active_res desc limit 5
  `);
  console.log('Vehicles with active reservations:', vehWithRes);

  const pickedUp = await q(`
    select v.id, v.license_plate, v.availability_status, r.id as res_id, r.status, r.start_date, r.end_date
    from vehicles v join reservations r on r.vehicle_id = v.id and r.deleted_at is null
    where r.status = 'picked_up' limit 3
  `);
  console.log('Picked-up reservations:', pickedUp);

  const cust179 = await q(`select id, name, debtor_number, email from customers where id = 179`);
  console.log('Customer 179:', cust179);

  const cust179drivers = await q(`select id, display_name, customer_id from drivers where customer_id = 179`);
  console.log('Customer 179 drivers:', cust179drivers);

  const cust179portal = await q(`select id, email, customer_id from portal_users where customer_id = 179`);
  console.log('Customer 179 portal users:', cust179portal);

  const cust179res = await q(`select id, vehicle_id, status, deleted_at from reservations where customer_id = 179 limit 5`);
  console.log('Customer 179 reservations:', cust179res);

  const driverWithRes = await q(`
    select d.id as driver_id, d.customer_id, r.id as res_id, r.status
    from drivers d join reservations r on r.driver_id = d.id and r.deleted_at is null
    limit 3
  `);
  console.log('Driver assigned to reservation:', driverWithRes);

  process.exit(0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
