'use strict';
const B='./';
const { Session } = require(B+'lib.cjs');
const { q, pool } = require(B+'db.cjs');
(async () => {
  const s = new Session('a', { fakeIp: '10.22.1.7' });
  await s.loginStaff('admin', 'admin123');
  const v = 1890;
  const row = async t => console.log(t, JSON.stringify((await q('select availability_status a, maintenance_status m from vehicles where id=$1',[v]))[0]));
  let r = await s.patch('/api/vehicles/'+v, { availabilityStatus: 'not_for_rental', maintenanceStatus: 'ok' });
  console.log('set not_for_rental ->', r.status); await row('start            ');
  r = await s.patch('/api/vehicles/'+v+'/maintenance-status', { status: 'in_service' });
  console.log('in_service ->', r.status); await row('after in_service ');
  r = await s.patch('/api/vehicles/'+v+'/maintenance-status', { status: 'ok' });
  console.log('repair closed ->', r.status); await row('after repair ok  ');
  await pool.end();
})().catch(async e=>{console.error(e); try{await pool.end();}catch(x){} process.exit(1);});
