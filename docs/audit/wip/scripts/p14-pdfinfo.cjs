// P14 helper: inspect a PDF buffer with pdfjs-dist (text + positions + page count)
// and optionally render pages to PNG with node-canvas (same stack the app uses in
// server/utils/pdf-to-image.ts). Node 18+, run from repo root.
'use strict';
const fs = require('fs');
const path = require('path');

let pdfjsPromise = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs').then((m) => {
      m.GlobalWorkerOptions.workerSrc = require('url').pathToFileURL(path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs')).href;
      return m;
    });
  }
  return pdfjsPromise;
}

function isPdf(buf) {
  return Buffer.isBuffer(buf) && buf.length > 4 && buf.slice(0, 5).toString('latin1') === '%PDF-';
}

/**
 * Returns { valid, pages, pageSizes, text: [perPage string], items: [perPage [{str,x,y,w,h}]],
 *   outOfBounds: [{page, str, x, y, w, reason}], error }
 */
async function inspect(buf) {
  const res = { valid: isPdf(buf), bytes: buf.length, pages: 0, pageSizes: [], text: [], items: [], outOfBounds: [], error: null };
  if (!res.valid) {
    res.error = 'not a PDF (missing %PDF- header); first bytes: ' + JSON.stringify(buf.slice(0, 40).toString('latin1'));
    return res;
  }
  try {
    const pdfjs = await loadPdfjs();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true, verbosity: 0 }).promise;
    res.pages = doc.numPages;
    const maxPages = Math.min(doc.numPages, 60);
    for (let p = 1; p <= maxPages; p++) {
      const page = await doc.getPage(p);
      const vp = page.getViewport({ scale: 1 });
      res.pageSizes.push({ w: Math.round(vp.width), h: Math.round(vp.height) });
      const tc = await page.getTextContent();
      const items = [];
      let pageText = '';
      for (const it of tc.items) {
        if (!('str' in it)) continue;
        // transform: [a b c d e f]; e,f = x,y baseline in PDF user space (bottom-left origin)
        const [a, b, c, d, e, f] = it.transform;
        const x = e, y = f, w = it.width, h = it.height;
        items.push({ str: it.str, x: +x.toFixed(1), y: +y.toFixed(1), w: +w.toFixed(1), h: +h.toFixed(1) });
        pageText += it.str + (it.hasEOL ? '\n' : ' ');
        if (it.str.trim()) {
          if (x < 0 || y < 0 || y > vp.height || x > vp.width) {
            res.outOfBounds.push({ page: p, str: it.str.slice(0, 60), x: +x.toFixed(1), y: +y.toFixed(1), w: +w.toFixed(1), reason: 'origin outside page' });
          } else if (x + w > vp.width + 0.5) {
            res.outOfBounds.push({ page: p, str: it.str.slice(0, 60), x: +x.toFixed(1), y: +y.toFixed(1), w: +w.toFixed(1), reason: `runs past right edge by ${(x + w - vp.width).toFixed(0)}pt` });
          }
        }
      }
      res.items.push(items);
      res.text.push(pageText);
    }
    await doc.destroy();
  } catch (e) {
    res.error = 'pdfjs failed: ' + (e && e.message ? e.message : String(e));
  }
  return res;
}

async function renderPng(buf, outPath, pageNo = 1, scale = 1.5) {
  const { createCanvas } = require('@napi-rs/canvas');
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true, verbosity: 0 }).promise;
  const page = await doc.getPage(pageNo);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, viewport.width, viewport.height);
  await page.render({ canvas, viewport, intent: 'print' }).promise;
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, canvas.toBuffer('image/png'));
  await doc.destroy();
  return outPath;
}

function summary(info, opts = {}) {
  const t = (info.text[0] || '').replace(/\s+/g, ' ').trim();
  return {
    valid: info.valid,
    bytes: info.bytes,
    pages: info.pages,
    pageSizes: info.pageSizes.slice(0, 3),
    p1TextLen: t.length,
    p1Text: t.slice(0, opts.textChars || 300),
    outOfBounds: info.outOfBounds.slice(0, opts.oob || 8),
    outOfBoundsCount: info.outOfBounds.length,
    error: info.error,
  };
}

module.exports = { inspect, renderPng, summary, isPdf };
