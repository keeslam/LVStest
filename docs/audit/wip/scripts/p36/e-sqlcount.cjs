// P36-E: statement count per request on :5003 / lvs_regress.
// pg_stat_statements is not loadable (shared_preload_libraries empty, needs a cluster restart) and
// statement logging would need a global log_line_prefix change + pool reconnect on a shared host,
// so the statement count is measured as the delta of pg_stat_database.xact_commit for lvs_regress
// (node-postgres/drizzle sends every query as its own implicit transaction = 1 commit per statement),
// cross-checked against per-table seq_scan/idx_scan deltas from pg_stat_user_tables, which show the
// N+1 shape directly. MIN of REPS is reported: other agents share this DB, contamination can only add.
'use strict';
const fs=require('fs');
const L=require('./e-lib.cjs');
const REPS=+(process.env.REPS||5), SETTLE=400;
const TABLES=['vehicles','customers','reservations','drivers','interactive_damage_checks','expenses'];
const ENDPOINTS=[
 ['GET','/api/user'],
 ['GET','/api/reservations'],
 ['GET','/api/reservations/range?startDate=2026-09-07&endDate=2026-09-13'],
 ['GET','/api/reservations/range?startDate=2026-08-31&endDate=2026-10-04'],
 ['GET','/api/reservations/range?startDate=2026-01-01&endDate=2026-12-31'],
 ['GET','/api/reservations/overdue'],
 ['GET','/api/vehicles'],
 ['GET','/api/vehicles/status/breakdown'],
 ['GET','/api/customers'],
 ['GET','/api/customers/with-reservations'],
 ['GET','/api/interactive-damage-checks'],
 ['GET','/api/expenses'],
 ['GET','/api/today'],
 ['GET','/api/reports/mileage-per-month?from=2026-01-01&to=2026-09-12'],
];
(async()=>{
 const [s]=await L.staff(1,'10.36.6.');
 await s.get('/api/user'); await L.sleep(300);
 // idle drift baseline (other agents on the same DB)
 const d0=L.xact(); await L.sleep(2000); const d1=L.xact();
 console.log('idle drift over 2s:',d1-d0,'commits');
 const results=[];
 for(const [m,p] of ENDPOINTS){
   const reps=[];
   for(let i=0;i<REPS;i++){
     await L.sleep(SETTLE);
     const x0=L.xact(), t0=L.tblscans(TABLES);
     const r=await L.timed(s,m,p);
     await L.sleep(SETTLE);
     const x1=L.xact(), t1=L.tblscans(TABLES);
     const scans={}; for(const t of TABLES){scans[t]=(t1[t].seq-t0[t].seq)+(t1[t].idx-t0[t].idx);}
     reps.push({stmts:x1-x0,ms:r.ms,status:r.status,rows:r.rows,bytes:r.bytes,enc:r.contentEncoding,scans});
   }
   const best=reps.slice().sort((a,b)=>a.stmts-b.stmts)[0];
   const msAll=reps.map(r=>r.ms);
   const row={method:m,path:p,status:best.status,rows:best.rows,bytes:best.bytes,contentEncoding:best.enc,
     statements:best.stmts,allCounts:reps.map(r=>r.stmts),tableScans:best.scans,
     msP50:L.pct(msAll,50),msMin:Math.min(...msAll),msAll:msAll};
   results.push(row);
   console.log(p.padEnd(70),'rows='+String(row.rows).padEnd(5),'stmts='+String(row.statements).padEnd(5),'('+row.allCounts.join('/')+')','bytes='+row.bytes,'p50='+row.msP50+'ms','scans='+JSON.stringify(row.tableScans));
 }
 fs.writeFileSync(__dirname+'/e-sqlcount.out.json',JSON.stringify({at:new Date().toISOString(),reps:REPS,idleDrift2s:d1-d0,results},null,2));
 console.log('written e-sqlcount.out.json');
})().catch(e=>{console.error(e);process.exit(1);});
