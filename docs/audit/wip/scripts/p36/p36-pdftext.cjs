'use strict';
const fs = require('fs'); const zlib = require('zlib');
const buf = fs.readFileSync(process.argv[2]);
const s = buf.toString('latin1');
const texts = [];
const re = /stream\r?\n([\s\S]*?)endstream/g; let m;
while ((m = re.exec(s))) {
  let d = null;
  try { d = zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'); }
  catch (e) { d = m[1]; }
  const tj = d.match(/\([^()]*\)/g) || [];
  for (const t of tj) texts.push(t.slice(1, -1));
}
console.log('bytes=' + buf.length + ' magic=' + buf.slice(0, 5).toString());
console.log(texts.filter(t => t.trim().length > 0).join(' | '));
