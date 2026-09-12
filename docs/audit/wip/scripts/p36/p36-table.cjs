// Genereert de markdown-resultatentabel en de per-categorie-secties uit aggregate.json
'use strict';
const fs = require('fs'); const D = __dirname + '/';
const A = JSON.parse(fs.readFileSync(D + 'aggregate.json', 'utf8'));
const bugs = JSON.parse(fs.readFileSync(D + 'bugindex.json', 'utf8'));
const all = []; for (let i = 1; i <= 230; i++) all.push('BUG-' + String(i).padStart(3, '0'));
const esc = s => String(s == null ? '' : s).replace(/\r?\n/g, ' ').replace(/\|/g, '\|').replace(/\s+/g, ' ').trim();
const short = (s, n) => { s = esc(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
let out = [];
out.push('| BUG | Sev | Verdict | Bewijs |');
out.push('|---|---|---|---|');
for (const id of all) {
  const r = A.rows[id];
  out.push('| ' + id + ' | ' + (A.sev[id] || '?') + ' | ' + (r ? r.verdict : 'ONTBREEKT') + ' | ' + short(r ? r.evidence : 'geen resultaat aangeleverd', 160) + ' |');
}
fs.writeFileSync(D + 'table-all.md', out.join('\n'));

// per categorie
const cats = {};
for (const id of all) { const v = A.rows[id] ? A.rows[id].verdict : 'ONTBREEKT'; (cats[v] = cats[v] || []).push(id); }
let sec = [];
for (const [v, ids] of Object.entries(cats).sort((a, b) => b[1].length - a[1].length)) {
  if (/^FIXED$/i.test(v)) { sec.push('### ' + v + ' — ' + ids.length + ' bugs\n\nAlle overige ids uit de tabel hierboven. Geen uitzonderingen te melden.\n'); continue; }
  sec.push('### ' + v + ' — ' + ids.length + ' bugs\n');
  sec.push('| BUG | Sev | Titel | Bewijs |');
  sec.push('|---|---|---|---|');
  for (const id of ids) {
    const r = A.rows[id];
    sec.push('| ' + id + ' | ' + A.sev[id] + ' | ' + short(bugs[id] ? bugs[id].title : '', 90) + ' | ' + short(r ? r.evidence : 'geen resultaat', 200) + ' |');
  }
  sec.push('');
}
fs.writeFileSync(D + 'sections.md', sec.join('\n'));
console.log('table-all.md (' + all.length + ' regels) en sections.md geschreven');
console.log(Object.entries(cats).map(([k, v]) => k + '=' + v.length).join('  '));
