'use strict';
(async () => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(require('fs').readFileSync(process.argv[2]));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  let all = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    all.push('--- pagina ' + p + ' ---');
    all.push(tc.items.map(i => i.str).filter(s => s.trim()).join(' | '));
  }
  console.log(all.join('\n'));
})();
