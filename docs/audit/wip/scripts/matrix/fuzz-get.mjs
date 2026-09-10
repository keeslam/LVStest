// Step 4: id/JSON fuzz on GET endpoints, as admin.
import fs from 'fs';
import path from 'path';
import { Session, sessionFile } from './lib.mjs';

const DIR = 'C:\\Users\\kees lam\\Desktop\\LVStest-main\\LVStest-main\\docs\\audit\\wip\\scripts\\matrix';
const endpoints = JSON.parse(fs.readFileSync(path.join(DIR, 'endpoints.json'), 'utf8'));

// AM-xxx workaround: apiLimiter's skip-for-authenticated-users check never fires (see run-matrix.mjs
// comment / server/index.ts:174 vs server/auth.ts:187), so this script's ~1500+ admin requests from
// the real IP would otherwise collide with the shared 1000/15min bucket. Use a dedicated IP.
const admin = new Session('admin', { forwardedFor: '10.20.30.11' });
admin.loadFrom(sessionFile('admin'));

function substituteAll(pathStr, value) {
  return pathStr.replace(/:[A-Za-z0-9_]+/g, encodeURIComponent(value));
}

const FUZZ_VALUES = ['0', '-1', 'abc', '1e3', '%00', '../', 'A'.repeat(5000)];

const rows = [];
let reqCount = 0;

async function call(p) {
  reqCount++;
  try {
    return await admin.request('GET', p, undefined);
  } catch (e) {
    return { status: -1, bytes: 0, text: String(e) };
  }
}

function stackTracePresent(text) {
  return /at\s+\S+\s+\(.*:\d+:\d+\)/.test(text || '') || /\.js:\d+:\d+/.test(text || '') || /node_modules/.test(text || '');
}

async function main() {
  const getEps = endpoints.filter(e => e.method === 'GET' && /:[A-Za-z0-9_]+/.test(e.path));
  console.log(`Fuzzing ${getEps.length} GET endpoints with id params, ${FUZZ_VALUES.length} values each`);
  let done = 0;
  for (const ep of getEps) {
    for (const val of FUZZ_VALUES) {
      // raw substitution - do NOT encodeURIComponent %00 or ../ so they reach the router as intended
      const p = ep.path.replace(/:[A-Za-z0-9_]+/g, () => val);
      const r = await call(p);
      const flag5xx = r.status >= 500;
      rows.push({
        endpoint: `GET ${ep.path}`, fuzzValue: val, actualPath: p, status: r.status, bytes: r.bytes || 0,
        flag: flag5xx ? '5xx' : '', stackTrace: flag5xx && stackTracePresent(r.text) ? 'yes' : '',
        snippet: flag5xx ? (r.text || '').slice(0, 300) : '',
      });
    }
    done++;
    if (done % 20 === 0) console.log(`  ...${done}/${getEps.length}`);
  }

  // Query-param fuzz + Accept header, applied to a representative sample of
  // list-style GET endpoints (no :id params, likely to read query params).
  // Script-bug fix: endpoints.json includes the SPA/static catch-all route
  // ("*" at server/index.ts:396), which isn't a real API path and isn't a
  // valid URL path segment on its own (produces "http://localhost:5001*").
  // Exclude any path that doesn't start with "/" from the query-fuzz pass.
  const listEps = endpoints.filter(e => e.method === 'GET' && !/:[A-Za-z0-9_]+/.test(e.path) && e.path.startsWith('/'));
  for (const ep of listEps) {
    const qp = `${ep.path}${ep.path.includes('?') ? '&' : '?'}limit=-1&page=abc&daysAhead=1e9`;
    const r = await call(qp);
    const flag5xx = r.status >= 500;
    rows.push({
      endpoint: `GET ${ep.path}`, fuzzValue: 'query:limit=-1&page=abc&daysAhead=1e9', actualPath: qp,
      status: r.status, bytes: r.bytes || 0, flag: flag5xx ? '5xx' : '',
      stackTrace: flag5xx && stackTracePresent(r.text) ? 'yes' : '', snippet: flag5xx ? (r.text || '').slice(0, 300) : '',
    });
    reqCount++;
    const r2 = await admin.request('GET', ep.path, undefined, { accept: 'text/html' });
    const flag5xx2 = r2.status >= 500;
    rows.push({
      endpoint: `GET ${ep.path}`, fuzzValue: 'Accept: text/html', actualPath: ep.path,
      status: r2.status, bytes: r2.bytes || 0, flag: flag5xx2 ? '5xx' : '',
      stackTrace: flag5xx2 && stackTracePresent(r2.text) ? 'yes' : '', snippet: flag5xx2 ? (r2.text || '').slice(0, 300) : '',
    });
  }

  fs.writeFileSync(path.join(DIR, 'fuzz-get-results.json'), JSON.stringify(rows, null, 2));
  console.log(`DONE requests=${reqCount} rows=${rows.length} 5xx=${rows.filter(r=>r.flag==='5xx').length}`);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
