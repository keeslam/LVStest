'use strict';
const { admin, q, pool, d } = require('./p36c-lib.cjs');
const log = (k, v) => console.log(k + ' :: ' + (typeof v === 'string' ? v : JSON.stringify(v)));
const RUN = process.env.RUN || String(Date.now()).slice(-5);
let cn = 0;
const CN = () => 'AUDIT-P36C-W' + RUN + '-' + (++cn);
(async () => {
  const s = await admin('c22');
  const mkv = async (tag) => {
    const plate = 'P36W2' + RUN + tag;
    const rr = await s.post('/api/vehicles', { licensePlate: plate, brand: 'AUDIT-P36C', model: 'W', vehicleType: 'Personenauto', chassisNumber: 'CH' + plate, currentMileage: 1000 });
    if (rr.status !== 201) throw new Error(plate + ' ' + rr.status + rr.text.slice(0, 200));
    return rr.json.id;
  };
  let r;
  const V = await mkv('A');
  r = await s.post('/api/reservations', { customerId: 179, vehicleId: V, startDate: d(-2), endDate: d(30), type: 'standard', totalPrice: 100, notes: 'AUDIT-P36C w118' });
  const RENT = r.json.id;
  await s.post('/api/reservations/' + RENT + '/pickup', { contractNumber: CN(), pickupDate: d(-2), pickupMileage: 1000, fuelLevelPickup: 'full' });
  r = await s.post('/api/reservations/maintenance-with-spare', { maintenanceData: { vehicleId: V, startDate: d(-6), endDate: d(-5), type: 'maintenance_block', status: 'booked', maintenanceStatus: 'scheduled', maintenanceCategory: 'repair', customerId: null, notes: 'AUDIT-P36C w past block' }, conflictingReservations: [], spareVehicleAssignments: [] });
  const PB = r.json && r.json.maintenanceReservation && r.json.maintenanceReservation.id;
  log('118b past block', [r.status, PB]);
  // placeholder as the app writes them today: maintenance_block_id set
  const ph = await q("insert into reservations (vehicle_id, customer_id, start_date, end_date, type, status, placeholder_spare, replacement_for_reservation_id, maintenance_block_id, notes) values (null, 179, $1, $2, 'replacement', 'booked', true, $3, $4, 'AUDIT-P36C ph118b2') returning id", [d(-6), d(-5), RENT, PB]);
  log('118b placeholder (maintenance_block_id set)', ph);
  r = await s.del('/api/reservations/' + PB);
  log('118b delete past block', [r.status, r.text.slice(0, 140)]);
  log('118b placeholder after (expect soft-deleted)', await q('select id,status,deleted_at,maintenance_block_id from reservations where id=$1', [ph[0].id]));
  await pool.end();
})();
