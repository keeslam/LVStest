'use strict';
const { Session } = require('./lib.cjs');
const { q, pool } = require('./db.cjs');
(async () => {
  const s = new Session('a', { fakeIp: '10.22.1.6' });
  await s.loginStaff('admin', 'admin123');
  const v = 1890;
  const row = async t => console.log(t, JSON.stringify((await q('select availability_status a, maintenance_status m from vehicles where id=$1',[v]))[0]));
  let r = await s.patch('/api/vehicles/'+v, { availabilityStatus: 'available', maintenanceStatus: 'ok' });
  console.log('reset ->', r.status); await row('after reset      ');
  r = await s.patch('/api/vehicles/'+v+'/maintenance-status', { status: 'in_service' });
  console.log('PATCH maintenance-status in_service ->', r.status); await row('after in_service ');
  r = await s.patch('/api/vehicles/'+v+'/maintenance-status', { status: 'ok' });
  console.log('PATCH maintenance-status ok ->', r.status); await row('after ok         ');
  r = await s.patch('/api/vehicles/'+v+'/maintenance-status', { status: 'needs_service' });
  console.log('PATCH maintenance-status needs_service ->', r.status); await row('after needs_srv  ');
  await pool.end();
})().catch(async e=>{console.error(e); try{await pool.end();}catch(x){} process.exit(1);});
// appended: does closing a repair overwrite a manual not_for_rental?
