'use strict';
const { Session, BASE } = require('./lib.cjs');
const { execSync } = require('child_process');
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function pct(arr,p){if(!arr.length)return null;const s=arr.slice().sort((a,b)=>a-b);const i=Math.min(s.length-1,Math.ceil((p/100)*s.length)-1);return s[Math.max(0,i)];}
function stats(a){return {n:a.length,min:Math.min(...a),p50:pct(a,50),p95:pct(a,95),max:Math.max(...a),mean:+(a.reduce((x,y)=>x+y,0)/a.length).toFixed(1)};}
async function timed(session, method, path, body, opts={}){
  const t0=process.hrtime.bigint();
  const r=await session.request(method,path,body,Object.assign({headers:{'Accept-Encoding':'gzip, deflate, br'}},opts));
  const ms=Number(process.hrtime.bigint()-t0)/1e6;
  const bytes=Buffer.byteLength(r.text||'','utf8');
  return {ms:+ms.toFixed(1),status:r.status,bytes,contentLength:r.headers.get('content-length'),
    contentEncoding:r.headers.get('content-encoding'),contentType:r.headers.get('content-type'),
    rows:Array.isArray(r.json)?r.json.length:(r.json&&typeof r.json==='object'?Object.keys(r.json).length:null),
    json:r.json,text:r.text};
}
async function staff(n=1,base='10.36.5.'){const out=[];for(let i=1;i<=n;i++){const s=new Session('e'+i,{fakeIp:base+i});const r=await s.loginStaff('admin','admin123');if(r.status!==200)throw new Error('login '+i+' -> '+r.status+' '+r.text.slice(0,200));out.push(s);}return out;}
const PSQL='"C:/Program Files/PostgreSQL/17/bin/psql" -U postgres -h localhost -At';
function sql(q,db='lvs_regress'){process.env.PGPASSWORD='postgres';return execSync(`${PSQL} -c "${q.replace(/"/g,'\\"')}" ${db}`,{encoding:'utf8',maxBuffer:64*1024*1024}).trim();}
// statement-count proxy: implicit-transaction commits on the target DB
function xact(db='lvs_regress'){return Number(sql(`select xact_commit from pg_stat_database where datname='${db}'`,'postgres'));}
function tblscans(tables){const list=tables.map(t=>`'${t}'`).join(',');const out=sql(`select relname,seq_scan,idx_scan from pg_stat_user_tables where relname in (${list}) order by relname`);const m={};for(const l of out.split('\n')){if(!l)continue;const[r,s,i]=l.split('|');m[r]={seq:+s,idx:+(i||0)};}return m;}

// The general API limiter is shared by every p36 agent (all log in as admin), so a 429 is
// contention, not a finding. Wait out Retry-After and repeat.
async function rreq(session, method, path, body, opts){
  for(let i=0;i<40;i++){
    const r=await session.request(method,path,body,opts);
    if(r.status!==429) return r;
    const wait=Math.min(30,Number(r.headers.get('retry-after')||15))*1000;
    console.error('[429] '+method+' '+path+' waiting '+(wait/1000)+'s');
    await sleep(wait);
  }
  throw new Error('still 429 after retries: '+path);
}
function rget(session,path,opts){return rreq(session,'GET',path,undefined,opts);}
async function rtimed(session,method,path,body,opts){
  const t0=process.hrtime.bigint();
  const r=await rreq(session,method,path,body,Object.assign({headers:{'Accept-Encoding':'gzip, deflate, br'}},opts||{}));
  const ms=Number(process.hrtime.bigint()-t0)/1e6;
  const bytes=Buffer.byteLength(r.text||'','utf8');
  return {ms:+ms.toFixed(1),status:r.status,bytes,contentEncoding:r.headers.get('content-encoding'),
    rows:Array.isArray(r.json)?r.json.length:(r.json&&typeof r.json==='object'?Object.keys(r.json).length:null),json:r.json,text:r.text,headers:r.headers};
}
module.exports={Session,BASE,sleep,pct,stats,timed,staff,sql,xact,tblscans,rget,rreq,rtimed};
