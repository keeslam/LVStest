'use strict';
const { Session } = require('./lib.cjs');
const { q, pool } = require('./db.cjs');
(async () => {
  const s = new Session('a', { fakeIp: '10.22.1.5' });
  await s.loginStaff('admin', 'admin123');
  const vI = 1890;
  const show = async (t) => { const v = (await q('select availability_status a, maintenance_status m, current_mileage km from vehicles where id=$1',[vI]))[0];
    const pl = await s.get('/api/vehicles/available'); const rg = await s.get('/api/vehicles/available?startDate=2027-03-01&endDate=2027-03-03');
    console.log(t, JSON.stringify(v), 'plain='+(pl.json||[]).some(x=>x.id===vI), 'range='+(rg.json||[]).some(x=>x.id===vI)); };
  await s.patch('/api/vehicles/'+vI, { availabilityStatus: 'available', maintenanceStatus: 'ok' });
  await show('reset            ');
  let r = await s.patch('/api/vehicles/'+vI, { availabilityStatus: 'needs_fixing' });
  console.log('PATCH needs_fixing ->', r.status, (r.text||'').slice(0,120));
  await show('after needs_fixing');
  const bk = await s.post('/api/reservations', { vehicleId: vI, customerId: 1299, startDate: '2027-03-01', endDate: '2027-03-03', totalPrice: 90, notes: 'AUDIT-P22 nf clean' });
  console.log('book while needs_fixing ->', bk.status);
  await show('after booking     ');
  if (bk.json && bk.json.id) {
    const pk = await s.post('/api/reservations/'+bk.json.id+'/pickup', { contractNumber: 'AUDIT-P22-NF3', pickupMileage: 10050, fuelLevelPickup: 'full' });
    console.log('pickup while needs_fixing ->', pk.status, (pk.text||'').slice(0,120));
    await show('after pickup      ');
    const rt = await s.post('/api/reservations/'+bk.json.id+'/return', { returnMileage: 10090, fuelLevelReturn: 'full' });
    console.log('return ->', rt.status);
    await show('after return      ');
  }
  // which vehicles in the plain "available" list are in the workshop?
  const pl = await s.get('/api/vehicles/available');
  const rows = (pl.json||[]).filter(v => v.maintenanceStatus && v.maintenanceStatus !== 'ok');
  console.log('\nplain available list, maintenanceStatus != ok:', JSON.stringify(rows.map(v=>({id:v.id,plate:v.licensePlate,a:v.availabilityStatus,m:v.maintenanceStatus}))));
  await pool.end();
})().catch(async e=>{console.error(e); try{await pool.end();}catch(x){} process.exit(1);});
