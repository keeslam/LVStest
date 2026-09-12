'use strict';
const { Session } = require('./lib.cjs');
const iso=d=>d.toISOString().slice(0,10); const day=n=>{const d=new Date();d.setDate(d.getDate()+n);return iso(d);};
const P='AUDIT-P36W4';
(async()=>{
  const s=new Session('admin'); await s.loginStaff('admin','admin123');
  const cust=await s.post('/api/customers',{name:P,companyName:P,debtorNumber:'P36W4',address:'T',city:'D',postalCode:'1234AB',phone:'0612345681',email:'p36w4@example.invalid',status:'active'});
  const v=await s.post('/api/vehicles',{licensePlate:'P36W05',brand:P,model:'Solo',vehicleType:'personenauto',currentMileage:1000,fuelType:'benzine'});
  console.log('klant='+cust.json.id+' auto='+v.json.id);
  // maintenance block on an OTHERWISE FREE vehicle
  const mb=await s.post('/api/reservations',{vehicleId:v.json.id,customerId:cust.json.id,startDate:day(3),endDate:day(5),status:'booked',type:'maintenance_block',maintenanceStatus:'scheduled',maintenanceDuration:2});
  console.log('onderhoudsblok -> HTTP',mb.status,'\nBODY:',mb.text.slice(0,700));
  // find the created block id via list
  const all=await s.get('/api/reservations/vehicle/'+v.json.id);
  console.log('reserveringen op de auto:',all.status, (Array.isArray(all.json)?all.json:[]).map(r=>r.id+':'+r.type+':'+r.status+':'+r.startDate+'..'+r.endDate).join(' | '));
  const blk=(Array.isArray(all.json)?all.json:[]).find(r=>r.type==='maintenance_block');
  // B-09: book a normal rental over the maintenance window -> must be allowed, with a warning
  const over=await s.post('/api/reservations',{vehicleId:v.json.id,customerId:cust.json.id,startDate:day(3),endDate:day(4),status:'booked',type:'standard'});
  console.log('\nboeken over onderhoud -> HTTP',over.status);
  console.log('BODY:',over.text.slice(0,900));
  if(blk){
    const as=await s.post('/api/reservations/'+blk.id+'/assign-spare',{});
    console.log('\nassign-spare zonder body -> HTTP',as.status, as.text.slice(0,300));
  }
  console.log('\nblokId=',blk&&blk.id);
})();
