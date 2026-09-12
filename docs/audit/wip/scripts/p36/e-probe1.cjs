'use strict';
const L=require('./e-lib.cjs');
function upd(){const o=L.sql("select relname,n_tup_upd,seq_scan,idx_scan from pg_stat_user_tables where relname in ('vehicles','reservations','customers') order by relname");const m={};for(const l of o.split('\n')){const[r,u,s,i]=l.split('|');m[r]={upd:+u,seq:+s,idx:+(i||0)};}return m;}
(async()=>{
 const [s]=await L.staff(1,'10.36.81.');
 await s.get('/api/user');
 // --- BUG-217: does GET /api/vehicles write? ---
 for(const p of ['/api/vehicles','/api/vehicles/status/breakdown']){
  const a=upd(); await L.sleep(200); const r=await L.timed(s,'GET',p); await L.sleep(600); const b=upd();
  console.log('BUG-217',p,'status',r.status,'vehicles n_tup_upd delta =',b.vehicles.upd-a.vehicles.upd,
    '| scans v/r/c =',(b.vehicles.seq+b.vehicles.idx)-(a.vehicles.seq+a.vehicles.idx),
    (b.reservations.seq+b.reservations.idx)-(a.reservations.seq+a.reservations.idx),
    (b.customers.seq+b.customers.idx)-(a.customers.seq+a.customers.idx));
 }
 // --- BUG-216: damage-check list shape + mileage report ---
 const idc=await L.timed(s,'GET','/api/interactive-damage-checks');
 console.log('BUG-216 list', idc.status, idc.rows,'rows',idc.bytes,'bytes; item keys:',idc.json&&idc.json[0]?Object.keys(idc.json[0]).join(','):'-');
 // --- BUG-226: find-by-contract ---
 const cn=L.sql("select contract_number from reservations where contract_number is not null limit 1");
 console.log('contract number sample:',cn);
 if(cn){
   const a=upd(); const x0=L.xact(); const r=await L.timed(s,'GET','/api/reservations/find-by-contract/'+encodeURIComponent(cn)); await L.sleep(500); const x1=L.xact(); const b=upd();
   console.log('BUG-226 find-by-contract',r.status,'bytes',r.bytes,'stmts',x1-x0,'reservation scans',(b.reservations.seq+b.reservations.idx)-(a.reservations.seq+a.reservations.idx),'seqDelta',b.reservations.seq-a.reservations.seq);
 }
 const x0=L.xact(); const a=upd(); const wr=await L.timed(s,'GET','/api/customers/with-reservations'); await L.sleep(500); const x1=L.xact(); const b=upd();
 console.log('BUG-226 with-reservations',wr.status,'rows',wr.rows,'bytes',wr.bytes,'stmts',x1-x0,'reservations seqDelta',b.reservations.seq-a.reservations.seq,'idxDelta',b.reservations.idx-a.reservations.idx);
 // --- BUG-205 payload shape / pagination ---
 const r2=await L.timed(s,'GET','/api/reservations?limit=50');
 console.log('BUG-205 ?limit=50 ->',r2.rows,'rows',r2.bytes,'bytes');
})().catch(e=>{console.error('ERR',e.stack);process.exit(1);});
