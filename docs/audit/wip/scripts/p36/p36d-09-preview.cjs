// P36 agent D — BUG-193: PDF background preview PNG on Windows
'use strict';
const fs = require('fs'); const path = require('path');
const L = require('./p36d-lib.cjs');
const { PDFDocument } = require(path.join(process.cwd(), 'node_modules', 'pdf-lib'));
const BS = String.fromCharCode(92);
const UPLOADS = ['C:', 'Users', 'kees lam', 'Desktop', 'LVStest-main', 'regress-uploads'].join(BS);
(async () => {
  const ids = L.loadIds();
  const st = await L.staff('10.36.4.20');
  const doc = await PDFDocument.create();
  const pg = doc.addPage([595, 842]);
  pg.drawText('AUDIT-P36D preview probe text', { x: 60, y: 600, size: 24 });
  pg.drawText('second line of the background', { x: 60, y: 560, size: 18 });
  const bytes = Buffer.from(await doc.save());
  const up = await L.upload(st, `/api/pdf-templates/${ids.tplFull}/background`, 'background', 'audit-p36d-preview.pdf', 'application/pdf', bytes);
  const row = (await L.q('select id, background_path, background_preview_path from pdf_templates where id=$1', [ids.tplFull]))[0];
  const out = { upload: up.status, uploadBody: (up.text || '').slice(0, 300), row };
  const rel = String(row.background_preview_path || '').split(BS).join('/');
  if (rel) {
    const p = path.join(UPLOADS, rel);
    out.onDisk = { path: p, exists: fs.existsSync(p), size: fs.existsSync(p) ? fs.statSync(p).size : 0 };
    if (out.onDisk.exists) {
      const { createCanvas, loadImage } = require(path.join(process.cwd(), 'node_modules', '@napi-rs/canvas'));
      const img = await loadImage(fs.readFileSync(p));
      const c = createCanvas(img.width, img.height); const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, img.width, img.height).data;
      let nonWhite = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 240 || d[i+1] < 240 || d[i+2] < 240) nonWhite++;
      out.pixels = { w: img.width, h: img.height, nonWhite };
    }
  }
  console.log(JSON.stringify(out, null, 1));
  fs.writeFileSync(path.join(__dirname, 'p36d-09-preview.out.json'), JSON.stringify(out, null, 1));
  await L.pool.end();
})().catch(async (e) => { console.error('FAILED', e); try { await L.pool.end(); } catch {} process.exit(1); });
