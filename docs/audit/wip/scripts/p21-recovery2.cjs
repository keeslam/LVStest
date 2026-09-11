// Phase 21/29 follow-up probes. Prefix AUDIT-P21.
'use strict';
const fs=require('fs'),path=require('path');
const { Session } = require('./lib.cjs');
const { q, pool } = require('./db.cjs');
const OUT=path.join(__dirname,'p21-recovery2.out.json');
const today=()=>new Date().toISOString().split('T')[0];
function addDays(d,n){const x=new Date(d+'T00:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().split('T')[0];}
const brief=(r,n=200)=>({status:r.status,body:(r.text||'').slice(0,n)});
const steps=[];const step=(name,data)=>{steps.push({name,...data});console.log('==',name,JSON.stringify(data).slice(0,600));};
const resRow=async id=>(await q('select id,status,vehicle_id,customer_id,start_date,end_date,contract_number,actual_pickup_date,actual_return_date,pickup_mileage,return_mileage,deleted_at from reservations where id=$1',[id]))[0]||null;
const vRow=async id=>(await q('select id,license_plate,availability_status,maintenance_status,current_mileage from vehicles where id=$1',[id]))[0]||null;

(async()=>{
const a=new Session('p21b',{fakeIp:'10.21.1.2'});
const li=await a.loginStaff('admin','admin123'); if(li.status!==200) throw new Error('login '+li.status);
const ids=require('./p21-recovery.out.json').ids;
const V1=ids.vehicles['AU-211-X'],V2=ids.vehicles['AU-212-X'];
const CA=ids.customers.A;
const T=today();

// A. vehicle status left behind after "Terugzetten naar geboekt" (R2 from run 1)
const prev=require('./p21-recovery.out.json');
step('A vehicle V2 state now (after revert in run 1)',{vehicle:await vRow(V2),r2:await resRow(prev.R2)});

// B. full pickup -> return -> can it be undone?
let r=await a.post('/api/reservations',{vehicleId:V1,customerId:CA,startDate:T,endDate:addDays(T,2),totalPrice:90,notes:'AUDIT-P21 R9 return-undo'});
const R9=r.json&&r.json.id;
const cn=(await a.get('/api/settings/next-contract-number')).json.contractNumber;
const pk=await a.post(`/api/reservations/${R9}/pickup`,{contractNumber:String(cn),pickupMileage:20000,fuelLevelPickup:'Full',pickupDate:T});
const rt=await a.post(`/api/reservations/${R9}/return`,{returnMileage:20500,fuelLevelReturn:'1/2',returnDate:T,returnNotes:'AUDIT-P21'});
step('B1 pickup+return R9',{pickup:brief(pk,80),ret:brief(rt,120),row:await resRow(R9),vehicle:await vRow(V1),docs:await q('select id,document_type from documents where reservation_id=$1 order by id',[R9])});
const un1=await a.patch(`/api/reservations/${R9}/status`,{status:'picked_up'});
step('B2 un-return via /status {picked_up}',{res:brief(un1,200),row:await resRow(R9),vehicle:await vRow(V1)});
const un2=await a.patch(`/api/reservations/${R9}/status`,{status:'booked'});
step('B3 then revert to booked',{res:brief(un2,200),row:await resRow(R9),vehicle:await vRow(V1),docs:await q('select id,document_type from documents where reservation_id=$1 order by id',[R9])});

// C. is a cancelled reservation still visible in the lists the employee uses?
const R3=prev.R3;
await a.patch(`/api/reservations/${R3}`,{status:'cancelled'});
const list=await a.get('/api/reservations');
const inAll=Array.isArray(list.json)&&list.json.some(x=>x.id===R3);
const rng=await a.get(`/api/reservations/range?startDate=${addDays(T,25)}&endDate=${addDays(T,40)}`);
const inRange=Array.isArray(rng.json)&&rng.json.some(x=>x.id===R3);
step('C cancelled reservation visibility',{row:await resRow(R3),inFullList:inAll,inCalendarRange:inRange,rangeStatus:rng.status});

// D. wrong dates on a PICKED UP reservation (customer already drove off)
r=await a.post('/api/reservations',{vehicleId:V2,customerId:CA,startDate:addDays(T,70),endDate:addDays(T,72),totalPrice:80,notes:'AUDIT-P21 R10 dates-after-pickup'});
const R10=r.json&&r.json.id;
const cn2=(await a.get('/api/settings/next-contract-number')).json.contractNumber;
await a.post(`/api/reservations/${R10}/pickup`,{contractNumber:String(cn2),pickupMileage:13000,fuelLevelPickup:'Full',pickupDate:T});
const dfix=await a.patch(`/api/reservations/${R10}`,{startDate:addDays(T,71),endDate:addDays(T,75)});
step('D change dates after pickup',{patch:brief(dfix,80),row:await resRow(R10),audit:await q("select id,action,details->'changes' as changes from audit_logs where resource_type='reservation' and resource_id=$1 order by id",[String(R10)])});

// E. audit log readable per resource through the API? (what a manager would use)
const al=await a.get(`/api/audit-logs?resourceType=reservation&resourceId=${R9}&limit=50`);
const al2=await a.get(`/api/audit-logs?search=${R9}&limit=50`);
step('E audit-log API filters',{byResourceId:{status:al.status,total:al.json&&al.json.total},bySearch:{status:al2.status,total:al2.json&&al2.json.total},sample:al.json&&JSON.stringify((al.json.logs||[])[0]||{}).slice(0,400)});

// F. does the vehicle detail / dashboard expose the mistake? overdue endpoint
const ov=await a.get('/api/reservations/overdue');
step('F overdue endpoint',{status:ov.status,count:Array.isArray(ov.json)?ov.json.length:ov.text.slice(0,120)});

// G. duplicate customer creation (same name) - any guard?
const c1=await a.post('/api/customers',{name:'AUDIT-P21 Dup Customer',email:'audit-p21-dup@example.com'});
const c2=await a.post('/api/customers',{name:'AUDIT-P21 Dup Customer',email:'audit-p21-dup@example.com'});
step('G duplicate customer same name+email',{first:brief(c1,80),second:brief(c2,160)});

fs.writeFileSync(OUT,JSON.stringify({R9,R10,steps},null,1));
console.log('written',OUT);
await pool.end();
})().catch(async e=>{console.error(e);try{await pool.end()}catch{};process.exit(1)});
