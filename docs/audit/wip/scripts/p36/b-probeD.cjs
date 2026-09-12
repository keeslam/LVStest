// BUG-061 (portal-admin FK crash) + BUG-101 (deep XML process kill)
const { Session } = require('./lib.cjs');
const PW = 'P36brgss!23';
async function uptime() { try { const r = await fetch('http://127.0.0.1:5003/health'); const j = await r.json(); return {status:r.status, uptime:j.uptime}; } catch(e){ return {status:0, uptime:null, err:String(e)}; } }
function multipart(fields, file) {
  const b = '----AUDITP36B' + Date.now();
  const parts = [];
  for (const [k,v] of Object.entries(fields)) parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  if (file) {
    parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`));
    parts.push(Buffer.isBuffer(file.data)?file.data:Buffer.from(file.data));
    parts.push(Buffer.from('\r\n'));
  }
  parts.push(Buffer.from(`--${b}--\r\n`));
  return { body: Buffer.concat(parts), ct: 'multipart/form-data; boundary=' + b };
}
(async () => {
  const u0 = await uptime(); console.log('uptime before:', JSON.stringify(u0));
  const viewer = new Session('viewer', { fakeIp: '198.51.100.52' });
  console.log('viewer login', (await viewer.loginStaff('AUDIT-P36B-viewer', PW)).status, '(has view_portal)');

  console.log('\n--- BUG-061 ---');
  let r;
  try { r = await viewer.get('/api/portal-admin/customers/999999999/settings'); console.log('GET /api/portal-admin/customers/999999999/settings ->', r.status, r.text.slice(0,200)); }
  catch (e) { console.log('CONNECTION DROPPED:', String(e)); }
  const u1 = await uptime(); console.log('uptime after 061:', JSON.stringify(u1), u1.uptime > u0.uptime ? 'NO RESTART' : '*** RESTARTED ***');
  try { const r2 = await viewer.get('/api/portal-admin/customers/2147483647/settings'); console.log('int-max id ->', r2.status, r2.text.slice(0,120)); } catch(e){ console.log('DROPPED', String(e)); }
  const u1b = await uptime(); console.log('uptime after 061b:', JSON.stringify(u1b));

  console.log('\n--- BUG-101 deep nested XML ---');
  const manager = new Session('manager', { fakeIp: '198.51.100.53' });
  console.log('manager login', (await manager.loginStaff('AUDIT-P36B-manager', PW)).status, '(has manage_fines)');
  for (const depth of [200, 50000]) {
    const xml = '<?xml version="1.0"?>' + '<a>'.repeat(depth) + 'x' + '</a>'.repeat(depth);
    const mp = multipart({}, { field:'file', name:'AUDIT-P36B-deep.xml', type:'text/xml', data: xml });
    const before = await uptime();
    let res;
    try {
      res = await manager.request('POST', '/api/fines/imports/upload', mp.body, { raw: true, headers: { 'Content-Type': mp.ct } });
      console.log(`depth=${depth} size=${xml.length} ->`, res.status, res.text.slice(0,200).replace(/\s+/g,' '));
    } catch (e) { console.log(`depth=${depth} CONNECTION DROPPED:`, String(e)); }
    const after = await uptime();
    console.log(`  uptime before=${before.uptime} after=${after.uptime}`, after.uptime > before.uptime ? 'NO RESTART' : '*** RESTARTED ***');
    const h = await manager.get('/health'); console.log('  GET /health ->', h.status);
  }
  const uF = await uptime(); console.log('\nuptime final:', JSON.stringify(uF), uF.uptime > u0.uptime ? 'NO RESTART OVERALL' : '*** RESTARTED ***');
})().catch(e=>console.error('FATAL',e));
