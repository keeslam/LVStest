// P36 agent D — BUG-179 library select/delete + preview serving path; BUG-193 pixel check
'use strict';
const fs = require('fs'); const path = require('path');
const L = require('./p36d-lib.cjs');
const BS = String.fromCharCode(92);
const UPLOADS = ['C:', 'Users', 'kees lam', 'Desktop', 'LVStest-main', 'regress-uploads'].join(BS);
function makePng(w, h, color) {
  const { createCanvas } = require(path.join(process.cwd(), 'node_modules', '@napi-rs/canvas'));
  const c = createCanvas(w, h); const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = color || '#3366aa'; ctx.fillRect(w * 0.1, h * 0.1, w * 0.8, h * 0.8);
  return c.toBuffer('image/png');
}
(async () => {
  const ids = L.loadIds();
  const st = await L.staff('10.36.4.19');
  const out = {};

  out.H1_preview_serving = await L.step('H1 how the preview PNG is served (BUG-193/179)', async () => {
    const row = (await L.q('select background_preview_path from pdf_templates where id=$1', [ids.tplFull]))[0];
    const rel = String(row.background_preview_path || '').split(BS).join('/');
    const tries = {};
    for (const u of ['/' + rel, '/uploads/' + rel, '/api/uploads/' + rel]) {
      const r = await L.getBuffer(st, u);
      tries[u] = { status: r.status, ct: r.contentType, bytes: r.buf.length, head: r.buf.slice(0, 8).toString('latin1') };
    }
    const missing = {};
    for (const u of ['/uploads/templates/audit-p36d-nope.png']) {
      const r = await L.getBuffer(st, u); missing[u] = { status: r.status, ct: r.contentType, head: r.buf.toString('utf8').slice(0, 60) };
    }
    // pixel check on disk
    const p = rel ? path.join(UPLOADS, rel.replace(/^.*?uploads\//i, '')) : '';
    let pixels = { probedPath: p };
    if (p && fs.existsSync(p) && fs.statSync(p).isFile()) {
      const { createCanvas, loadImage } = require(path.join(process.cwd(), 'node_modules', '@napi-rs/canvas'));
      const img = await loadImage(fs.readFileSync(p));
      const c = createCanvas(img.width, img.height); const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, img.width, img.height).data;
      let nonWhite = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 240 || d[i + 1] < 240 || d[i + 2] < 240) nonWhite++;
      pixels = { probedPath: p, w: img.width, h: img.height, nonWhite };
    }
    return { rel, tries, missing, pixels };
  });

  out.H2_library = await L.step('H2 background library select/delete (BUG-179)', async () => {
    const res = {};
    const upA = await L.upload(st, `/api/pdf-templates/${ids.tplFull}/backgrounds`, 'background', 'audit-p36d-libA.png', 'image/png', makePng(595, 842, '#114488'), { name: 'AUDIT-P36D libA' });
    const upB = await L.upload(st, `/api/pdf-templates/${ids.tplBg}/backgrounds`, 'background', 'audit-p36d-libB.png', 'image/png', makePng(595, 842, '#884411'), { name: 'AUDIT-P36D libB' });
    res.upA = { status: upA.status, body: (upA.text || '').slice(0, 250) };
    res.upB = { status: upB.status, body: (upB.text || '').slice(0, 250) };
    const listA = await st.get(`/api/pdf-templates/${ids.tplFull}/backgrounds`);
    const listB = await st.get(`/api/pdf-templates/${ids.tplBg}/backgrounds`);
    res.listA = (listA.json || []).map(b => ({ id: b.id, templateId: b.templateId, filePath: b.filePath }));
    res.listB = (listB.json || []).map(b => ({ id: b.id, templateId: b.templateId, filePath: b.filePath }));
    if (res.listA[0]) {
      const cross = await st.post(`/api/pdf-templates/${ids.tplBg}/backgrounds/${res.listA[0].id}/select`, {});
      res.crossSelect = { status: cross.status, body: cross.text.slice(0, 250) };
      res.rowB = (await L.q('select background_path from pdf_templates where id=$1', [ids.tplBg]))[0];
    }
    if (res.listB[0]) {
      const own = await st.post(`/api/pdf-templates/${ids.tplBg}/backgrounds/${res.listB[0].id}/select`, {});
      res.ownSelect = { status: own.status, body: own.text.slice(0, 200) };
      res.rowBAfterOwn = (await L.q('select background_path from pdf_templates where id=$1', [ids.tplBg]))[0];
      const del = await st.del(`/api/pdf-templates/${ids.tplBg}/backgrounds/${res.listB[0].id}`);
      res.deleteActive = { status: del.status, body: del.text.slice(0, 250) };
      res.rowBAfterDelete = (await L.q('select background_path from pdf_templates where id=$1', [ids.tplBg]))[0];
      const gen = await L.fetchPdf(st, `/api/contracts/generate/${ids.rNormal}?templateId=${ids.tplBg}`, 'h2_after_delete.pdf', { textChars: 150 });
      res.generateAfterDelete = { status: gen.status, isPdf: gen.isPdf, bytes: gen.bytes, body: (gen.body || '').slice(0, 200) };
    }
    return res;
  });

  console.log(JSON.stringify(out, null, 1));
  fs.writeFileSync(path.join(__dirname, 'p36d-08-bg3.out.json'), JSON.stringify(out, null, 1));
  await L.pool.end();
})().catch(async (e) => { console.error('FAILED', e); try { await L.pool.end(); } catch {} process.exit(1); });
