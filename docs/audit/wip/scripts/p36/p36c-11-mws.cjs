'use strict';
const { admin, q, pool, loadIds, d } = require('./p36c-lib.cjs');
const log = (k, v) => console.log(k + ' :: ' + (typeof v === 'string' ? v : JSON.stringify(v)));
const RUN = process.env.RUN || String(Date.now()).slice(-5);
(async () => {
  const s = await admin('c11');
  const ids = loadIds();
  const CA = ids.customers.A, CB = ids.customers.B;
  const mk = async (tag) => {
    const plate = 'P36W' + RUN + tag;
    const r = await s.post('/api/vehicles', { licensePlate: plate, brand: 'AUDIT-P36C', model: 'W', vehicleType: 'Personenauto', chassisNumber: 'CH' + plate, currentMileage: 1000 });
    if (r.status !== 201) throw new Error(plate + ' ' + r.status + r.text.slice(0, 200));
    return r.json.id;
  };
  let r;
  const vO = await mk('O'), vS = await mk('S');
  const S0 = d(420);
  const base = { customerId: CA, notes: 'AUDIT-P36C mws', type: 'standard', totalPrice: 100 };
  r = await s.post('/api/reservations', { ...base, vehicleId: vO, startDate: S0, endDate: d(424) });
  const r1 = r.json.id;
  r = await s.post('/api/reservations', { ...base, customerId: CB, vehicleId: vO, startDate: d(425), endDate: d(429) });
  const r2 = r.json.id;
  log('121 rentals', [r1, r2]);
  const maint = { vehicleId: vO, startDate: S0, endDate: d(429), type: 'maintenance_block', status: 'booked', maintenanceStatus: 'scheduled', maintenanceCategory: 'repair', customerId: null, notes: 'AUDIT-P36C mws block' };
  const countBlocks = async () => (await q("select count(*)::int n from reservations where vehicle_id=$1 and type='maintenance_block' and deleted_at is null", [vO]))[0].n;
  const spares = async () => q("select id,vehicle_id,customer_id,start_date,end_date,status from reservations where type='replacement' and replacement_for_reservation_id in ($1,$2) order by id", [r1, r2]);

  log('121 blocks/spares before', [await countBlocks(), await spares()]);
  r = await s.post('/api/reservations/maintenance-with-spare', {
    maintenanceData: maint, conflictingReservations: [r1, r2],
    spareVehicleAssignments: [
      { reservationId: r1, spareVehicleId: vS, startDate: S0, endDate: d(429) },
      { reservationId: r2, spareVehicleId: vS, startDate: S0, endDate: d(429) },
    ],
  });
  log('121 same spare twice overlapping (expect 409)', [r.status, r.text.slice(0, 300)]);
  log('121 blocks/spares after (expect unchanged)', [await countBlocks(), await spares()]);

  const vO2 = await mk('O2');
  const S3 = d(440);
  r = await s.post('/api/reservations', { ...base, vehicleId: vO2, startDate: S3, endDate: d(444) });
  const r3 = r.json.id;
  r = await s.post('/api/reservations/maintenance-with-spare', {
    maintenanceData: { ...maint, vehicleId: vO2, startDate: S3, endDate: d(444) }, conflictingReservations: [r3],
    spareVehicleAssignments: [{ reservationId: r3, spareVehicleId: 98765432, startDate: S3, endDate: d(444) }],
  });
  log('121 non-existent spare vehicle (expect 4xx)', [r.status, r.text.slice(0, 250)]);
  log('121 spares for r3', await q('select id,vehicle_id,status from reservations where replacement_for_reservation_id=$1', [r3]));

  // non-overlapping control
  const vO3 = await mk('O3');
  const S4 = d(460);
  r = await s.post('/api/reservations', { ...base, vehicleId: vO3, startDate: S4, endDate: d(462) });
  const r4 = r.json.id;
  r = await s.post('/api/reservations', { ...base, customerId: CB, vehicleId: vO3, startDate: d(470), endDate: d(472) });
  const r5 = r.json.id;
  r = await s.post('/api/reservations/maintenance-with-spare', {
    maintenanceData: { ...maint, vehicleId: vO3, startDate: S4, endDate: d(472) }, conflictingReservations: [r4, r5],
    spareVehicleAssignments: [
      { reservationId: r4, spareVehicleId: vS, startDate: S4, endDate: d(462) },
      { reservationId: r5, spareVehicleId: vS, startDate: d(470), endDate: d(472) },
    ],
  });
  log('121 non-overlapping control (expect 200/201)', [r.status, r.text.slice(0, 200)]);

  // --- BUG-119 extra: contracts/data on a maintenance block ---
  const mb = await q("select id from reservations where type='maintenance_block' and notes like 'AUDIT-P36C block119%' limit 1");
  if (mb[0]) {
    r = await s.get('/api/contracts/data/' + mb[0].id);
    log('119 contracts/data on maintenance block (expect 400)', [r.status, r.text.slice(0, 200)]);
  }

  // --- BUG-148 extra: PATCH driverId non-existent, and blocked delete ---
  const vD = await mk('D');
  r = await s.post('/api/reservations', { ...base, vehicleId: vD, startDate: d(480), endDate: d(482) });
  const rD = r.json.id;
  r = await s.patch('/api/reservations/' + rD, { driverId: 98765432 });
  log('148 PATCH driverId non-existent (expect 404 driver not found)', [r.status, r.text.slice(0, 250)]);
  await pool.end();
})();
