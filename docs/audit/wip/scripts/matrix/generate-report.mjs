// Compute summary stats from matrix-raw.json for use while drafting api-matrix.md.
import fs from 'fs';
import path from 'path';

const DIR = 'C:\\Users\\kees lam\\Desktop\\LVStest-main\\LVStest-main\\docs\\audit\\wip\\scripts\\matrix';
const rows = JSON.parse(fs.readFileSync(path.join(DIR, 'matrix-raw.json'), 'utf8'));
const endpoints = JSON.parse(fs.readFileSync(path.join(DIR, 'endpoints.json'), 'utf8'));

function bucket(status) {
  if (status >= 200 && status < 300) return '2xx';
  if (status >= 300 && status < 400) return '3xx';
  if (status === 401) return '401';
  if (status === 403) return '403';
  if (status === 404) return '404';
  if (status >= 500) return '5xx';
  if (status === -1) return 'ERR';
  return 'other:' + status;
}

const byIdentity = {};
for (const r of rows) {
  byIdentity[r.identity] = byIdentity[r.identity] || {};
  const b = bucket(r.status);
  byIdentity[r.identity][b] = (byIdentity[r.identity][b] || 0) + 1;
}
console.log('=== counts per identity ===');
console.log(JSON.stringify(byIdentity, null, 2));

const nonPriv2xx = rows.filter(r => r.flags.includes('non-privileged-2xx'));
const anon2xx = rows.filter(r => r.flags.includes('anon-2xx'));
const fives = rows.filter(r => r.flags.includes('5xx'));
const leaks = rows.filter(r => r.flags.includes('sensitive-field-leak'));
const big = rows.filter(r => r.flags.includes('>1MB'));

function withMeta(r) {
  const [method, ...rest] = r.endpoint.split(' ');
  const epPath = rest.join(' ').replace(/ \[999999999\]$/, '');
  const ep = endpoints.find(e => e.method === method && e.path === epPath);
  return { ...r, file: ep ? `${ep.file}:${ep.line}` : '?', middleware: ep ? ep.middleware : '?' };
}

console.log('\n=== non-privileged 2xx (' + nonPriv2xx.length + ') ===');
console.log(JSON.stringify(nonPriv2xx.map(withMeta), null, 2));

console.log('\n=== anon 2xx on /api/* (' + anon2xx.length + ') ===');
console.log(JSON.stringify(anon2xx.map(withMeta), null, 2));

console.log('\n=== 5xx (' + fives.length + ') ===');
console.log(JSON.stringify(fives.map(withMeta), null, 2));

console.log('\n=== sensitive field leaks (' + leaks.length + ') ===');
console.log(JSON.stringify(leaks.map(withMeta), null, 2));

console.log('\n=== >1MB (' + big.length + ') ===');
console.log(JSON.stringify(big.map(withMeta), null, 2));

console.log('\n=== totals ===');
console.log('total rows', rows.length);
