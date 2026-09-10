// Phase 11 setup: fixtures for portal-driven maintenance/spare + transport tests.
'use strict';
const L = require('./p11-lib.cjs');
(async () => {
  const s = await L.staff('10.11.1.1');
  const ids = L.loadIds();
  const mk = async (key, plate, model) => {
    if (ids[key]) { console.log('reuse', key, ids[key]); return ids[key]; }
    const r = await s.post('/api/vehicles', { licensePlate: plate, brand: 'AUDIT', model, vehicleType: 'car', dailyPrice: '10' });
    console.log('create vehicle', plate, r.status, r.json?.id || r.text.slice(0, 200));
    ids[key] = r.json?.id; return ids[key];
  };
  await mk('vA', 'AU-11A-X', 'P11 Original portal');
  await mk('vB', 'AU-11B-X', 'P11 Spare1');
  await mk('vC', 'AU-11C-X', 'P11 Spare2');
  await mk('vD', 'AU-11D-X', 'P11 SpareToDelete');
  await mk('vE', 'AU-11E-X', 'P11 TransportOriginal');
  await mk('vF', 'AU-11F-X', 'P11 TransportSpare');
  await mk('vG', 'AU-11G-X', 'P11 Original2');
  await mk('vH', 'AU-11H-X', 'P11 Spare3');
  await mk('vI', 'AU-11I-X', 'P11 OriginalToDelete');
  await mk('vJ', 'AU-11J-X', 'P11 Spare4');
  await mk('vK', 'AU-11K-X', 'P11 NewOriginal');

  // Rental for portal customer 179 on vA, picked up (so the customer "has it on the road").
  if (!ids.rental179) {
    const start = L.today();
    const r = await s.post('/api/reservations', { vehicleId: ids.vA, customerId: 179, startDate: start, endDate: L.addDays(start, 60), notes: 'AUDIT-P11 portal rental', type: 'standard' });
    console.log('create rental', r.status, r.json?.id || r.text.slice(0, 300));
    ids.rental179 = r.json?.id;
    const p = await s.post(`/api/reservations/${ids.rental179}/pickup`, { pickupMileage: 1000, fuelLevelPickup: 'full', pickupDate: start });
    console.log('pickup', p.status, p.text.slice(0, 200));
  }
  // Second rental (customer 179) on vG for staff-side spare flows, picked up.
  if (!ids.rentalG) {
    const start = L.today();
    const r = await s.post('/api/reservations', { vehicleId: ids.vG, customerId: 179, startDate: start, endDate: L.addDays(start, 45), notes: 'AUDIT-P11 rental G', type: 'standard' });
    console.log('create rental G', r.status, r.json?.id || r.text.slice(0, 300));
    ids.rentalG = r.json?.id;
    const p = await s.post(`/api/reservations/${ids.rentalG}/pickup`, { pickupMileage: 2000, fuelLevelPickup: 'full', pickupDate: start });
    console.log('pickup G', p.status, p.text.slice(0, 200));
  }
  // Third rental on vI (to be deleted later) picked up.
  if (!ids.rentalI) {
    const start = L.today();
    const r = await s.post('/api/reservations', { vehicleId: ids.vI, customerId: 179, startDate: start, endDate: L.addDays(start, 30), notes: 'AUDIT-P11 rental I', type: 'standard' });
    console.log('create rental I', r.status, r.json?.id || r.text.slice(0, 300));
    ids.rentalI = r.json?.id;
    const p = await s.post(`/api/reservations/${ids.rentalI}/pickup`, { pickupMileage: 3000, fuelLevelPickup: 'full', pickupDate: start });
    console.log('pickup I', p.status, p.text.slice(0, 200));
  }
  L.saveIds(ids);
  console.log('IDS', JSON.stringify(ids));
  console.log('rental179', await L.resRow(ids.rental179));
  console.log('vA', await L.vehRow(ids.vA));
  console.log('FK replacement_for_transport_id', await L.q("select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='reservations'::regclass and pg_get_constraintdef(oid) like '%transport%'"));
  console.log('FK vehicle_transports', await L.q("select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='vehicle_transports'::regclass and contype='f'"));
  await L.pool.end();
})().catch(e => { console.error(e); process.exit(1); });
