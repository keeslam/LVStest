// Voegt results-A..E.jsonl samen, controleert dekking en telt per verdict.
'use strict';
const fs = require('fs'); const D = __dirname + '/';
const tri = fs.readFileSync(D + 'triage.tsv', 'utf8').trim().split(/\r?\n/).map(l => l.split('\t'));
const sev = {}, bucket = {}, cluster = {};
for (const [id, s, b, c] of tri) { sev[id] = s; bucket[id] = b; cluster[id] = c; }
const rows = {};
const dup = [];
for (const f of ['A', 'B', 'C', 'D', 'E']) {
  const p = D + 'results-' + f + '.jsonl';
  if (!fs.existsSync(p)) { console.error('ONTBREEKT: results-' + f + '.jsonl'); continue; }
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    let o; try { o = JSON.parse(line); } catch (e) { console.error('onleesbare regel in ' + f + ': ' + line.slice(0, 80)); continue; }
    if (rows[o.id]) dup.push(o.id);
    rows[o.id] = { ...o, src: f };
  }
}
const all = []; for (let i = 1; i <= 230; i++) all.push('BUG-' + String(i).padStart(3, '0'));
const missing = all.filter(b => !rows[b]);
const counts = {}, bySev = {};
for (const id of all) {
  const v = rows[id] ? rows[id].verdict : 'ONTBREEKT';
  counts[v] = (counts[v] || 0) + 1;
  bySev[sev[id]] = bySev[sev[id]] || {}; bySev[sev[id]][v] = (bySev[sev[id]][v] || 0) + 1;
}
console.log('== Totaal per verdict ==');
for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log('  ' + k.padEnd(22) + v);
console.log('\n== Per severity ==');
for (const s of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']) console.log('  ' + s.padEnd(9) + JSON.stringify(bySev[s] || {}));
if (missing.length) console.log('\nONTBREKEND (' + missing.length + '): ' + missing.join(' '));
if (dup.length) console.log('\nDUBBEL: ' + [...new Set(dup)].join(' '));
console.log('\n== Niet FIXED / niet vastgesteld ==');
for (const id of all) {
  const r = rows[id]; if (!r) continue;
  if (/^FIXED$/i.test(r.verdict)) continue;
  console.log(id + ' | ' + sev[id] + ' | ' + r.verdict + ' | ' + String(r.evidence || '').replace(/\s+/g, ' ').slice(0, 150));
}
fs.writeFileSync(D + 'aggregate.json', JSON.stringify({ counts, bySev, missing, rows, sev, bucket, cluster }, null, 1));
