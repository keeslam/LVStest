'use strict';
const fs=require('fs'),path=require('path');
const { Session } = require('./lib.cjs');
const { q, pool } = require('./db.cjs');
const OUT=path.join(__dirname,'p21-recovery3.out.json');
const today=()=>new Date().toISOString().split('T')[0];
function addDays(d,n){const x=new Date(d+'T00:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().split('T')[0];}
const brief=(r,n=200)=>({status:r.status,body:(r.text||'').slice(0,n)});
const steps=[];const step=(name,data)=>{steps.push({name,...data});console.log('==',name,JSON.stringify(data).slice(0,700));};
const resRow=async id=>(await q('select id,status,vehicle_id,start_date,end_date,contract_number,actual_pickup_date,actual_return_date,pickup_mileage,return_mileage from reservations where id=$1',[id]))[0]||null;
const vRow=async id=>(await q('select id,license_plate,availability_status,maintenance_status,current_mileage from vehicles where id=$1',[id]))[0]||null;
(async()=>{
const a=new Session('p21c',{fakeIp:'10.21.1.3'});
if((await a.loginStaff('admin','admin123')).status!==200) throw new Error('login');
// fresh vehicle
const plate='AU-214-X';
let [v]=await q('select id from vehicles where license_plate=$1',[plate]);
if(!v){const r=await a.post('/api/vehicles',{licensePlate:plate,brand:'AUDIT-P21',model:'P21-214',vehicleType:'car',currentMileage:20000,dailyPrice:'40'});v={id:r.json.id};}
const V=v.id; const CA=require('./p21-recovery.out.json').ids.customers.A; const T=today();
let r=await a.post('/api/reservations',{vehicleId:V,customerId:CA,startDate:T,endDate:addDays(T,2),totalPrice:90,notes:'AUDIT-P21 R9 return-undo'});
const R9=r.json&&r.json.id;
step('B0 create R9',{create:brief(r,100),id:R9});
const cn=(await a.get('/api/settings/next-contract-number')).json.contractNumber;
const pk=await a.post(`/api/reservations/${R9}/pickup`,{contractNumber:String(cn),pickupMileage:20000,fuelLevelPickup:'Full',pickupDate:T});
const rt=await a.post(`/api/reservations/${R9}/return`,{returnMileage:20500,fuelLevelReturn:'1/2',returnDate:T,returnNotes:'AUDIT-P21'});
step('B1 pickup+return R9',{pickup:brief(pk,60),ret:brief(rt,120),row:await resRow(R9),vehicle:await vRow(V),docs:await q('select id,document_type from documents where reservation_id=$1 order by id',[R9])});
const un1=await a.patch(`/api/reservations/${R9}/status`,{status:'picked_up'});
step('B2 un-return via /status {picked_up}',{res:brief(un1,220),row:await resRow(R9),vehicle:await vRow(V)});
const un2=await a.patch(`/api/reservations/${R9}/status`,{status:'booked'});
step('B3 then revert to booked',{res:brief(un2,220),row:await resRow(R9),vehicle:await vRow(V),docs:await q('select id,document_type from documents where reservation_id=$1 order by id',[R9]),audit:await q("select id,action,details->>'operation' as op,details->'changes' as changes from audit_logs where resource_type='reservation' and resource_id=$1 order by id",[String(R9)])});
// does re-picking-up re-use the same contract number?
const cn2=(await a.get('/api/settings/next-contract-number')).json.contractNumber;
step('B4 next contract number after the reverted pickup',{firstUsed:cn,nextNow:cn2});
// what the Activity Log UI sends
const ui=await a.get('/api/audit-logs?page=1&limit=5');
step('B5 audit-logs default page',{status:ui.status,keys:ui.json&&Object.keys(ui.json),total:ui.json&&ui.json.total});
const f1=await a.get('/api/audit-logs?resourceType=reservation&action=reservation.update&limit=5');
step('B6 audit-logs filters supported',{status:f1.status,total:f1.json&&f1.json.total});
fs.writeFileSync(OUT,JSON.stringify({V,R9,steps},null,1));
console.log('written',OUT); await pool.end();
})().catch(async e=>{console.error(e);try{await pool.end()}catch{};process.exit(1)});
