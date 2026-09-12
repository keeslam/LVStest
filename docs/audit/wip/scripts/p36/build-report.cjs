'use strict';
const fs = require('fs'); const D = __dirname + '/';
const order = [
  'report-part1.md', 'report-part2.md', 'table-all.md', 'report-part2b.md', 'sections.md',
  'report-part3a.md', 'report-part3b.md', 'report-part3c.md',
  'report-part4a.md', 'report-part4b.md', 'report-part4c.md', 'report-part4d.md',
  'report-part5a.md', 'report-part5b.md', 'report-part6.md',
];
const out = order.map(f => fs.readFileSync(D + f, 'utf8').replace(/\s+$/, '')).join('\n\n') + '\n';
const target = D + '../../../10-phase-36-regressierapport.md';
fs.writeFileSync(target, out);
console.log('geschreven:', require('path').resolve(target));
console.log('regels:', out.split('\n').length, ' tekens:', out.length);
