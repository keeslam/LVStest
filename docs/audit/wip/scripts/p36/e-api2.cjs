// P36-E round 2: BUG-211 (decision B-16) and BUG-224 (naive timestamps), with the real field names.
'use strict';
const fs=require('fs');const L=require('./e-lib.cjs');
const OUT={};const log=(k,v)=>{OUT[k]=v;console.log('### '+k+': '+JSON.stringify(v).slice(0,800));};
(async()=>{
 const [s]=await L.staff(1,'10.36.32.');
 // --- BUG-211 ---
 const fid=Number(L.sql("select id from reservations where notes like 'AUDIT-P36E future%' order by id desc limit 1"));
 log('fixtureFutureReservation',{id:fid,row:L.sql(`select status||'|'||start_date||'|'||end_date||'|'||vehicle_id from reservations where id=${fid}`)});
 const vid=Number(L.sql(`select vehicle_id from reservations where id=${fid}`));
 const cnr='P36E'+Date.now().toString().slice(-7);
 const noShift=await L.rreq(s,'POST',`/api/reservations/${fid}/pickup`,{contractNumber:cnr,pickupMileage:12345,fuelLevelPickup:'full'});
 log('BUG211.pickupWithoutAnswer',{status:noShift.status,body:(noShift.text||'').slice(0,400)});
 const yes=await L.rreq(s,'POST',`/api/reservations/${fid}/pickup`,{contractNumber:cnr,pickupMileage:12345,fuelLevelPickup:'full',shiftStartDate:true});
 log('BUG211.pickupConfirmed',{status:yes.status,body:(yes.text||'').slice(0,250)});
 await L.sleep(1200);
 log('BUG211.reservationAfter',L.sql(`select status||'|'||start_date||'|'||end_date from reservations where id=${fid}`));
 const vv=await L.rget(s,'/api/vehicles/'+vid);
 log('BUG211.vehicleAfterPickup',{status:vv.status,availabilityStatus:vv.json&&vv.json.availabilityStatus});
 log('BUG211.vehicleRowSql',L.sql('select availability_status from vehicles where id='+vid));

 // --- BUG-224 ---
 log('BUG224.documentsColumns',L.sql("select column_name||' :: '||data_type from information_schema.columns where table_name='documents' and data_type like 'timestamp%'").split('\n'));
 log('BUG224.naiveCount',L.sql("select count(*) from information_schema.columns where data_type='timestamp without time zone' and table_schema='public'"));
 log('BUG224.tzAwareCount',L.sql("select count(*) from information_schema.columns where data_type='timestamp with time zone' and table_schema='public'"));
 log('BUG224.tzAwareSample',L.sql("select table_name||'.'||column_name from information_schema.columns where data_type='timestamp with time zone' and table_schema='public' order by 1 limit 12").split('\n'));
 // a NEW row: does the code path write a correct instant?
 const before=new Date();
 const rid=Number(L.sql("select id from reservations where notes like 'AUDIT-P36E%' order by id desc limit 1"));
 const gen=await L.rreq(s,'GET','/api/damage-checks/generate/'+rid);
 await L.sleep(1500);
 const newest=L.sql("select id||'|'||upload_date||'|'||coalesce(file_name,'-') from documents order by id desc limit 1");
 log('BUG224.generateDoc',{status:gen.status,newestDocRow:newest,localNow:before.toString(),utcNow:before.toISOString()});
 const parts=newest.split('|');
 const d=await L.rget(s,'/api/documents/'+parts[0]);
 log('BUG224.docViaApi',{status:d.status,uploadDate:d.json&&(d.json.uploadDate||d.json.createdAt),sqlUploadDate:parts[1]});
 if(d.json&&(d.json.uploadDate||d.json.createdAt)){
   const api=new Date(d.json.uploadDate||d.json.createdAt);
   log('BUG224.skewMinutes',{apiIso:api.toISOString(),apiRenderedLocal:api.toLocaleString('nl-NL'),diffMinutesFromRealNow:Math.round((api.getTime()-before.getTime())/60000)});
 }
 // BUG-224 old rows: how many surviving rows still carry the 2h shift?
 log('BUG224.oldRowsSample',L.sql("select count(*) from documents"));
 log('BUG224.docsWithFutureUploadDate',L.sql("select count(*) from documents where upload_date > now()"));
 log('BUG224.docsMoreThan1hInFuture',L.sql("select count(*) from documents where upload_date > now() + interval '1 hour'"));
 fs.writeFileSync(__dirname+'/e-api2.out.json',JSON.stringify(OUT,null,1));
})().catch(e=>{console.error('FATAL',e.stack);fs.writeFileSync(__dirname+'/e-api2.out.json',JSON.stringify(Object.assign(OUT,{FATAL:String(e.stack)}),null,1));});
