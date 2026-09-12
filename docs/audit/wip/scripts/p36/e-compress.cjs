// BUG-214: does the app itself gzip? (decision B-19 says compression must be ON in the app)
'use strict';
const L=require('./e-lib.cjs');
const zlib=require('zlib');
(async()=>{
  const [s]=await L.staff(1,'10.36.14.');
  const out={};
  for (const p of ['/api/vehicles','/api/reservations','/api/customers','/api/expenses','/api/interactive-damage-checks','/api/today']) {
    // raw fetch so we see exactly what the wire carried
    const res = await fetch(L.BASE+p, {headers:{Cookie:s.cookieHeader(),'Accept-Encoding':'gzip, deflate, br'}});
    const buf = Buffer.from(await res.arrayBuffer());
    const enc = res.headers.get('content-encoding');
    const cl  = res.headers.get('content-length');
    const vary= res.headers.get('vary');
    const gz  = zlib.gzipSync(buf,{level:6}).length;
    out[p]={status:res.status,contentEncoding:enc,contentLength:cl,vary,wireBytes:buf.length,gzipWouldBe:gz,ratio:+(buf.length/gz).toFixed(1)};
    console.log(p, JSON.stringify(out[p]));
  }
  require('fs').writeFileSync(__dirname+'/e-compress.out.json',JSON.stringify(out,null,1));
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});
