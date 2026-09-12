// P36 agent D — BUG-169 (driver license serving), BUG-184 (contract filename collision), BUG-195 (missing file)
'use strict';
const fs = require('fs'); const path = require('path');
const L = require('./p36d-lib.cjs');
const BS = String.fromCharCode(92);
const UPLOADS = ['C:', 'Users', 'kees lam', 'Desktop', 'LVStest-main', 'regress-uploads'].join(BS);

function makeJpeg(w, h, color) {
  const { createCanvas } = require(path.join(process.cwd(), 'node_modules', '@napi-rs/canvas'));
  const c = createCanvas(w, h); const ctx = c.getContext('2d');
  ctx.fillStyle = color || '#4488cc'; ctx.fillRect(0, 0, w, h);
  return c.toBuffer('image/jpeg');
}
function makePdf(text) {
  return Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n% ' + text + '\n%%EOF\n', 'latin1');
}
function resolveUpload(rel) {
  if (!rel) return null;
  const norm = String(rel).split(BS).join('/');
  const cands = [path.resolve(process.cwd(), norm), path.join(UPLOADS, norm), path.join(UPLOADS, norm.replace(/^.*?uploads\//i, ''))];
  return cands.find(p => { try { return fs.existsSync(p) && fs.statSync(p).isFile(); } catch { return false; } }) || null;
}

(async () => {
  const ids = L.loadIds();
  const st = await L.staff('10.36.4.21');
  const out = {};

  out.J1_driver_license = await L.step('J1 upload + serve a driver license (BUG-169)', async () => {
    const jpg = makeJpeg(120, 80, '#2277bb');
    const up = await L.upload(st, `/api/customers/${ids.cNormal}/drivers`, 'licenseFile', 'audit-p36d-license.jpg', 'image/jpeg', jpg, { displayName: 'AUDIT-P36D Driver' });
    const res = { create: up.status, body: (up.text || '').slice(0, 300) };
    if (up.json && up.json.id) {
      ids.driverId = up.json.id; L.saveIds(ids);
      const row = (await L.q('select id, license_file_path from drivers where id=$1', [up.json.id]))[0];
      res.row = row;
      const serve = await L.getBuffer(st, `/api/drivers/${up.json.id}/license`);
      res.serve = { status: serve.status, ct: serve.contentType, bytes: serve.buf.length, sameBytes: serve.buf.equals(jpg), body: serve.contentType.includes('json') ? serve.buf.toString('utf8').slice(0, 150) : null };
      // traversal: point a driver at ..\..\etc\passwd and assert it is still refused
      await L.q('update drivers set license_file_path=$1 where id=$2', ['..' + BS + '..' + BS + 'etc' + BS + 'passwd', up.json.id]);
      const trav = await L.getBuffer(st, `/api/drivers/${up.json.id}/license`);
      res.traversal = { status: trav.status, body: trav.buf.toString('utf8').slice(0, 150) };
      await L.q('update drivers set license_file_path=$1 where id=$2', [row.license_file_path, up.json.id]);
    }
    return res;
  });

  out.J2_contract_collision = await L.step('J2 two contract uploads, same plate same day (BUG-184)', async () => {
    const a = makePdf('AUDIT-P36D FIRST CONTRACT CONTENT');
    const b = makePdf('AUDIT-P36D SECOND CONTRACT CONTENT');
    const u1 = await L.upload(st, '/api/documents', 'file', 'audit-p36d-c1.pdf', 'application/pdf', a, { documentType: 'contract', vehicleId: String(ids.vNormal), notes: 'AUDIT-P36D first' });
    const u2 = await L.upload(st, '/api/documents', 'file', 'audit-p36d-c2.pdf', 'application/pdf', b, { documentType: 'contract', vehicleId: String(ids.vNormal), notes: 'AUDIT-P36D second' });
    const res = { u1: { status: u1.status, id: u1.json && u1.json.id, filePath: u1.json && u1.json.filePath, body: u1.json ? null : (u1.text||'').slice(0,200) },
                  u2: { status: u2.status, id: u2.json && u2.json.id, filePath: u2.json && u2.json.filePath, body: u2.json ? null : (u2.text||'').slice(0,200) } };
    if (u1.json && u2.json) {
      res.samePath = u1.json.filePath === u2.json.filePath;
      const v1 = await L.getBuffer(st, `/api/documents/view/${u1.json.id}`);
      const v2 = await L.getBuffer(st, `/api/documents/view/${u2.json.id}`);
      res.view1 = { status: v1.status, bytes: v1.buf.length, isFirst: v1.buf.toString('latin1').includes('FIRST CONTRACT'), isSecond: v1.buf.toString('latin1').includes('SECOND CONTRACT') };
      res.view2 = { status: v2.status, bytes: v2.buf.length, isFirst: v2.buf.toString('latin1').includes('FIRST CONTRACT'), isSecond: v2.buf.toString('latin1').includes('SECOND CONTRACT') };
      ids.doc1 = u1.json.id; ids.doc2 = u2.json.id; L.saveIds(ids);
    }
    return res;
  });

  out.J3_missing_file = await L.step('J3 document whose file disappeared (BUG-195)', async () => {
    const p = makePdf('AUDIT-P36D DISAPPEARING');
    const up = await L.upload(st, '/api/documents', 'file', 'audit-p36d-gone.pdf', 'application/pdf', p, { documentType: 'other', vehicleId: String(ids.vNormal), notes: 'AUDIT-P36D disappearing' });
    if (!up.json) return { create: up.status, body: (up.text||'').slice(0,200) };
    const id = up.json.id;
    const row = (await L.q('select id, file_path, is_stale, stale_reason from documents where id=$1', [id]))[0];
    const disk = resolveUpload(row.file_path);
    const res = { create: up.status, id, filePath: row.file_path, disk };
    if (disk) {
      fs.unlinkSync(disk);
      const view = await L.getBuffer(st, `/api/documents/view/${id}`);
      const dl = await L.getBuffer(st, `/api/documents/download/${id}`);
      const meta = await st.get(`/api/documents/${id}`);
      const list = await st.get(`/api/vehicles/${ids.vNormal}/documents`);
      const listed = (list.json || []).find(d => d.id === id) || null;
      const after = (await L.q('select id, is_stale, stale_reason, stale_since from documents where id=$1', [id]))[0];
      res.view = { status: view.status, body: view.buf.toString('utf8').slice(0, 150) };
      res.download = { status: dl.status };
      res.meta = { status: meta.status, body: (meta.text || '').slice(0, 300) };
      res.listEntry = listed;
      res.rowAfter = after;
    }
    return res;
  });

  console.log(JSON.stringify(out, null, 1));
  fs.writeFileSync(path.join(__dirname, 'p36d-10-files.out.json'), JSON.stringify(out, null, 1));
  await L.pool.end();
})().catch(async (e) => { console.error('FAILED', e); try { await L.pool.end(); } catch {} process.exit(1); });
