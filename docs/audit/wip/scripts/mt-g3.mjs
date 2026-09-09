import { Session } from './mt-lib.mjs';
import { q } from './db.mjs';
const s = new Session('admin');
function j(x){return JSON.stringify(x);}
async function resState(id){ const r=await q('select id, vehicle_id, customer_id, type, status, start_date, end_date, placeholder_spare from reservations where id=$1',[id]); return r[0]; }

async function main(){
  await s.primeCsrf();
  await s.loginStaff('admin','admin123');
  await s.primeCsrf();
  const V1=1671, V2=1668, V3=1669, V4=1670;
  const C1=1251, C2=1252;

  console.log('=== setup: standard rental for placeholder tests ===');
  const rent = await s.post('/api/reservations', { vehicleId: V1, customerId: C1, startDate: '2027-01-05', endDate: '2027-01-10', notes: 'AUDIT g3 rental' });
  const rentId = rent.json?.id;
  console.log('rental', rent.status, rentId);

  console.log('=== 3a: create placeholder (valid) ===');
  let r = await s.post('/api/placeholder-reservations', { originalReservationId: rentId, customerId: C1, startDate: '2027-01-05', endDate: '2027-01-07' });
  console.log('valid placeholder', r.status, j(r.json)?.slice(0,300));
  const phId = r.json?.id;

  console.log('=== 3b: create placeholder TWICE for same rental (expect 409) ===');
  r = await s.post('/api/placeholder-reservations', { originalReservationId: rentId, customerId: C1, startDate: '2027-01-05', endDate: '2027-01-07' });
  console.log('duplicate placeholder', r.status, j(r.json)?.slice(0,300));

  console.log('=== 3c: placeholder for non-existing rental ===');
  r = await s.post('/api/placeholder-reservations', { originalReservationId: 999999999, customerId: C1, startDate: '2027-01-05', endDate: '2027-01-07' });
  console.log('ghost rental placeholder', r.status, j(r.json)?.slice(0,300));

  console.log('=== 3d: placeholder with customerId MISMATCH (rental belongs to C1, body says C2) ===');
  const rent2 = await s.post('/api/reservations', { vehicleId: V4, customerId: C1, startDate: '2027-02-05', endDate: '2027-02-10', notes: 'AUDIT g3 rental2 for mismatch test' });
  const rent2Id = rent2.json?.id;
  r = await s.post('/api/placeholder-reservations', { originalReservationId: rent2Id, customerId: C2, startDate: '2027-02-05', endDate: '2027-02-07' });
  console.log('mismatched customer placeholder', r.status, j(r.json)?.slice(0,400));
  console.log('row', j(await resState(r.json?.id)));

  console.log('=== 3e: placeholder with endDate before startDate ===');
  r = await s.post('/api/placeholder-reservations', { originalReservationId: rent2Id, customerId: C1, startDate: '2027-02-10', endDate: '2027-02-01' });
  console.log('bad dates placeholder', r.status, j(r.json)?.slice(0,400));

  console.log('=== 3f: needing-assignment with negative daysAhead ===');
  r = await s.get('/api/placeholder-reservations/needing-assignment?daysAhead=-5');
  console.log('negative daysAhead', r.status, j(r.json)?.slice(0,300));

  console.log('=== 3g: needing-assignment with huge daysAhead ===');
  r = await s.get('/api/placeholder-reservations/needing-assignment?daysAhead=999999999');
  console.log('huge daysAhead', r.status, (r.json?.length ?? r.text.length));

  console.log('=== 3h: needing-assignment with string daysAhead ===');
  r = await s.get('/api/placeholder-reservations/needing-assignment?daysAhead=abc');
  console.log('string daysAhead', r.status, j(r.json)?.slice(0,300));

  console.log('=== 3i: assign-vehicle - vehicle booked in the period ===');
  // Book V3 for overlapping dates first
  const busyRent = await s.post('/api/reservations', { vehicleId: V3, customerId: C2, startDate: '2027-01-05', endDate: '2027-01-07', notes: 'AUDIT g3 busy V3' });
  console.log('busy rental on V3', busyRent.status, busyRent.json?.id);
  r = await s.post(`/api/placeholder-reservations/${phId}/assign-vehicle`, { vehicleId: V3, endDate: '2027-01-07' });
  console.log('assign busy vehicle', r.status, j(r.json)?.slice(0,300));

  console.log('=== 3j: assign-vehicle - the ORIGINAL vehicle itself ===');
  r = await s.post(`/api/placeholder-reservations/${phId}/assign-vehicle`, { vehicleId: V1, endDate: '2027-01-07' });
  console.log('assign original vehicle as spare', r.status, j(r.json)?.slice(0,300));

  console.log('=== 3k: assign-vehicle - vehicle in_service ===');
  // mark V4 in_service
  await s.post(`/api/reservations/${rent2Id}/mark-needs-service`, { maintenanceStatus: 'in_service', maintenanceNote: 'AUDIT for placeholder in_service test' });
  r = await s.post(`/api/placeholder-reservations/${phId}/assign-vehicle`, { vehicleId: V4, endDate: '2027-01-07' });
  console.log('assign in_service vehicle', r.status, j(r.json)?.slice(0,300));

  console.log('=== 3l: assign-vehicle with NO endDate on an open-ended placeholder ===');
  const rent3 = await s.post('/api/reservations', { vehicleId: V1, customerId: C1, startDate: '2027-03-01', endDate: '2027-03-10', notes: 'AUDIT g3 rental3 open placeholder' });
  const rent3Id = rent3.json?.id;
  const ph2 = await s.post('/api/placeholder-reservations', { originalReservationId: rent3Id, customerId: C1, startDate: '2027-03-01' }); // no endDate -> open-ended
  console.log('open-ended placeholder create', ph2.status, j(ph2.json)?.slice(0,300));
  const ph2Id = ph2.json?.id;
  r = await s.post(`/api/placeholder-reservations/${ph2Id}/assign-vehicle`, { vehicleId: V2 }); // no endDate
  console.log('assign vehicle no endDate to open-ended placeholder', r.status, j(r.json)?.slice(0,400));

  console.log('=== 3m: assign vehicle to VALID placeholder (phId), then again (double-assign) ===');
  r = await s.post(`/api/placeholder-reservations/${phId}/assign-vehicle`, { vehicleId: V2, endDate: '2027-01-07' });
  console.log('valid assign', r.status, j(r.json)?.slice(0,400));
  console.log('row', j(await resState(phId)));
  r = await s.post(`/api/placeholder-reservations/${phId}/assign-vehicle`, { vehicleId: V3, endDate: '2027-01-08' });
  console.log('re-assign to already-assigned placeholder', r.status, j(r.json)?.slice(0,400));
  console.log('row after re-assign attempt', j(await resState(phId)));

  console.log(j({rentId, rent2Id, rent3Id, phId, ph2Id}));
}
main().catch(e=>{console.error(e);process.exit(1);});
