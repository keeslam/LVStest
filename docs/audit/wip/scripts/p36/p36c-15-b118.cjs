'use strict';
const { admin, q, pool, d } = require('./p36c-lib.cjs');
const log = (k, v) => console.log(k + ' :: ' + (typeof v === 'string' ? v : JSON.stringify(v)));
const RUN = process.env.RUN || String(Date.now()).slice(-5);
let cn = 0;
const CN = () => 'AUDIT-P36C-N' + RUN + '-' + (++cn);
(async () => {
  const s = await admin('c15');
  const mk = async (tag) => {
    const plate = 'P36N' + RUN + tag;
    const rr = await s.post('/api/vehicles', { licensePlate: plate, brand: 'AUDIT-P36C', model: 'N', vehicleType: 'Personenauto', chassisNumber: 'CH' + plate, currentMileage: 1000 });
    if (rr.status !== 201) throw new Error(plate + ' ' + rr.status + rr.text.slice(0, 200));
    return rr.json.id;
  };
  const rows = (rent) => q("select id,vehicle_id,type,status,placeholder_spare,start_date,end_date,deleted_at from reservations where replacement_for_reservation_id=$1 or affected_rental_id=$1 order by id", [rent]);
  let r;
  const V = await mk('V'), S1 = await mk('S1'), S2 = await mk('S2');
  r = await s.post('/api/reservations', { customerId: 179, vehicleId: V, startDate: d(-1), endDate: d(60), type: 'standard', totalPrice: 100, notes: 'AUDIT-P36C n' });
  const RENT = r.json.id;
  await s.post('/api/reservations/' + RENT + '/pickup', { contractNumber: CN(), pickupDate: d(-1), pickupMileage: 1000, fuelLevelPickup: 'full' });
  log('rental', RENT);
  const maint = (start, end, note) => ({ vehicleId: V, startDate: start, endDate: end, type: 'maintenance_block', status: 'booked', maintenanceStatus: 'scheduled', maintenanceCategory: 'repair', customerId: null, notes: note });

  r = await s.post('/api/reservations/maintenance-with-spare', { maintenanceData: maint(d(10), d(12), 'AUDIT-P36C blockA'), conflictingReservations: [RENT], spareVehicleAssignments: [{ reservationId: RENT, spareVehicleId: S1, startDate: d(10), endDate: d(12) }] });
  log('118 blockA', [r.status, r.json && r.json.maintenanceReservation && r.json.maintenanceReservation.id, r.text.slice(0, 160)]);
  const BA = r.json && r.json.maintenanceReservation && r.json.maintenanceReservation.id;
  r = await s.post('/api/reservations/maintenance-with-spare', { maintenanceData: maint(d(20), d(22), 'AUDIT-P36C blockB'), conflictingReservations: [RENT], spareVehicleAssignments: [{ reservationId: RENT, spareVehicleId: S2, startDate: d(20), endDate: d(22) }] });
  log('118 blockB', [r.status, r.json && r.json.maintenanceReservation && r.json.maintenanceReservation.id, r.text.slice(0, 160)]);
  const BB = r.json && r.json.maintenanceReservation && r.json.maintenanceReservation.id;
  log('118 rows before', await rows(RENT));
  log('118 blocks', await q("select id,start_date,end_date,notes,deleted_at from reservations where vehicle_id=$1 and type='maintenance_block' order by id", [V]));
  if (BB) {
    r = await s.del('/api/reservations/' + BB);
    log('118 delete blockB', [r.status, r.text.slice(0, 160)]);
  }
  log('118 rows after (blockA spare on ' + d(10) + ' must survive)', await rows(RENT));
  log('118 blockA', BA ? await q('select id,deleted_at from reservations where id=$1', [BA]) : null);
  await pool.end();
})();
