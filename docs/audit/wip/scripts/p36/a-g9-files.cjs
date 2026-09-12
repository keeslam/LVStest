const fs = require('fs');
const path = require('path');
const { admin, veh, res, PU, R, F, TS } = require('./a-lib.cjs');
const UPLOADS = 'C:\\Users\\kees lam\\Desktop\\LVStest-main\\regress-uploads';
const out = {};
(async () => {
  const a = await admin();
  R('session', a.who);

  // --- BUG-012: document with a traversal file_path (row is doctored via SQL afterwards)
  const v12 = await veh(a, 'Z');
  const boundary = '----P36A12' + TS;
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c636000000200010005fe02fe0000000049454e44ae426082', 'hex');
  const body = Buffer.concat([
    Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="vehicleId"\r\n\r\n' + v12 + '\r\n', 'utf8'),
    Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="documentType"\r\n\r\nAUDIT-P36A\r\n', 'utf8'),
    Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="file"; filename="p36a.png"\r\nContent-Type: image/png\r\n\r\n', 'utf8'),
    png, Buffer.from('\r\n--' + boundary + '--\r\n', 'utf8')]);
  const up = await a.request('POST', '/api/documents', body, { raw: true, headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary } });
  R('012 upload document', up.status + ' ' + up.text.slice(0, 200));
  out.b012doc = up.json && (up.json.id || (up.json.document && up.json.document.id));
  R('012 docId', out.b012doc);

  // --- BUG-028: generate a contract from a template that has fields: []
  const tpls = await a.get('/api/pdf-templates');
  const list = tpls.json && (Array.isArray(tpls.json) ? tpls.json : tpls.json.data || []);
  const empty = (list || []).find(t => Array.isArray(t.fields) && t.fields.length === 0);
  R('028 empty-field template', empty ? empty.id + ':' + empty.name + ' default=' + empty.isDefault : 'none found');
  const defT = (list || []).find(t => t.isDefault);
  R('028 current default template', defT ? defT.id + ':' + defT.name + ' fields=' + (Array.isArray(defT.fields) ? defT.fields.length : typeof defT.fields) : 'none');
  const v28 = await veh(a, 'Y');
  const r28 = await res(a, v28, '2026-09-01', '2027-02-05');
  await a.post('/api/reservations/' + r28 + '/pickup', PU('P36A-Y-' + TS));
  if (empty) {
    const g = await a.get('/api/contracts/generate/' + r28 + '?templateId=' + empty.id);
    R('028 generate with fields:[] template', g.status + ' len=' + g.text.length + ' ' + (g.status !== 200 ? g.text.slice(0, 250) : ''));
  }
  const gd = await a.get('/api/contracts/generate-default/' + r28);
  R('028 generate-default', gd.status + ' len=' + gd.text.length);
  out.b028 = { r28, emptyTplId: empty && empty.id };

  // --- BUG-050: template delete leaves background on disk
  const t50 = await a.post('/api/pdf-templates', { name: 'AUDIT-P36A-T50-' + TS, fields: [{ name: 'customerName', x: 10, y: 10, page: 1, fontSize: 12 }] });
  R('050 create template', t50.status + ' id=' + (t50.json && t50.json.id));
  const tid = t50.json && t50.json.id;
  if (tid) {
    const b50 = '----P36A50' + TS;
    const bg = Buffer.concat([
      Buffer.from('--' + b50 + '\r\nContent-Disposition: form-data; name="background"; filename="bg.png"\r\nContent-Type: image/png\r\n\r\n', 'utf8'),
      png, Buffer.from('\r\n--' + b50 + '--\r\n', 'utf8')]);
    const upbg = await a.request('POST', '/api/pdf-templates/' + tid + '/background', bg, { raw: true, headers: { 'Content-Type': 'multipart/form-data; boundary=' + b50 } });
    R('050 upload background', upbg.status + ' ' + upbg.text.slice(0, 220));
    const tdir = path.join(UPLOADS, 'templates');
    const before = fs.existsSync(tdir) ? fs.readdirSync(tdir).filter(f => f.includes('_' + tid + '_') || f.includes('template_' + tid)) : [];
    R('050 files before delete', JSON.stringify(before));
    const d50 = await a.del('/api/pdf-templates/' + tid);
    R('050 DELETE template', d50.status + ' ' + d50.text.slice(0, 140));
    const after = fs.existsSync(tdir) ? fs.readdirSync(tdir).filter(f => f.includes('_' + tid + '_') || f.includes('template_' + tid)) : [];
    R('050 files after delete', JSON.stringify(after));
    out.b050 = { tid, before, after };
  }

  // --- BUG-029: transport report path
  const tr = await a.get('/api/transports');
  const tl = tr.json && (Array.isArray(tr.json) ? tr.json : tr.json.data || []);
  R('029 transports available', tr.status + ' n=' + (tl ? tl.length : '?'));
  const ids = (tl || []).slice(0, 3).map(t => t.id);
  if (ids.length) {
    const rep = await a.post('/api/delivery/transports/generate-report', { transportIds: ids });
    R('029 generate-report', rep.status + ' ' + rep.text.slice(0, 300));
    const docId = rep.json && (rep.json.documentId || (rep.json.document && rep.json.document.id) || rep.json.id);
    if (docId) {
      const dl = await a.get('/api/documents/download/' + docId);
      R('029 download report doc ' + docId, dl.status + ' len=' + dl.text.length + ' ' + (dl.status !== 200 ? dl.text.slice(0, 160) : ''));
    }
    out.b029 = { ids, docId };
  }

  // --- BUG-053: bulk complete of transports
  const bulkProbe = await a.post('/api/transports/bulk-complete', { transportIds: ids.concat([999999999]) });
  R('053 POST /api/transports/bulk-complete', bulkProbe.status + ' ' + bulkProbe.text.slice(0, 250));
  const bulkProbe2 = await a.patch('/api/transports/bulk', { ids: ids.concat([999999999]), status: 'completed' });
  R('053 PATCH /api/transports/bulk', bulkProbe2.status + ' ' + bulkProbe2.text.slice(0, 200));

  require('fs').writeFileSync('a-g9-ids.json', JSON.stringify(out, null, 1));
})().catch(e => { console.error('FATAL', e.message, e.stack); process.exit(1); });
