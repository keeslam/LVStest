/**
 * PHASE 52 — screenshots for the Dutch user manual.
 *
 * Drives the Chrome that is installed on this machine in headless mode over the
 * DevTools protocol: log in through the API, hand the session cookie to the
 * browser, then visit each screen the manual refers to and write a PNG into
 * docs/gebruikershandleiding/afbeeldingen/.
 *
 * The regression server on :5003 runs the final code against `lvs_regress`, a
 * clone of the development database. Its customers are named "Klant 123 B.V."
 * and its plates are generated — example data, not a real customer file.
 *
 *   node docs/audit/wip/scripts/p52-screenshots.cjs
 */
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const WebSocket = require('ws');

const BASE = 'http://127.0.0.1:5003';
const OUT = path.resolve(__dirname, '../../../gebruikershandleiding/afbeeldingen');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9333;
const WIDTH = 1440;
const HEIGHT = 900;

/** Screens the manual points at. `wait` is extra settling time for heavy pages. */
const SHOTS = [
  { file: '01-inlogscherm.png', url: '/', anonymous: true, wait: 3000 },
  { file: '03-dashboard.png', url: '/', wait: 6000 },
  { file: '04-reserveringskalender.png', url: '/reservations', wait: 7000 },
  { file: '05-voertuigen.png', url: '/vehicles', wait: 6000 },
  { file: '06-klanten.png', url: '/customers', wait: 5000 },
  { file: '07-onderhoud.png', url: '/maintenance', wait: 6000 },
  { file: '08-transporten.png', url: '/delivery', wait: 5000 },
  { file: '09-documenten.png', url: '/documents', wait: 5000 },
  { file: '10-scannen.png', url: '/scan', wait: 6000 },
  { file: '11-rapporten.png', url: '/reports', wait: 6000 },
  { file: '12-klantenportaal-beheer.png', url: '/portal-admin', wait: 5000 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login() {
  const res = await fetch(`${BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status}`);
  const jar = res.headers.getSetCookie().map((c) => c.split(';')[0]);
  const sid = jar.find((c) => c.startsWith('connect.sid='));
  if (!sid) throw new Error('no session cookie in the login response');
  const [name, ...rest] = sid.split('=');
  return { name, value: rest.join('=') };
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`${method} timed out`));
        }
      }, 60000);
    });
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const cookie = await login();
  console.log('logged in, session cookie obtained');

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lvs-shots-'));
  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    `--window-size=${WIDTH},${HEIGHT}`,
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    'about:blank',
  ], { stdio: 'ignore' });

  let target = null;
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(500);
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      target = list.find((t) => t.type === 'page');
    } catch { /* chrome not up yet */ }
  }
  if (!target) throw new Error('Chrome did not expose a debugging target');

  const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  const cdp = new Cdp(ws);

  await cdp.send('Page.enable');
  await cdp.send('Network.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false,
  });

  const written = [];
  for (const shot of SHOTS) {
    if (shot.anonymous) {
      await cdp.send('Network.clearBrowserCookies');
    } else {
      await cdp.send('Network.setCookie', {
        name: cookie.name, value: cookie.value, domain: '127.0.0.1', path: '/', httpOnly: true,
      });
    }
    await cdp.send('Page.navigate', { url: BASE + shot.url });
    await sleep(shot.wait || 2000);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(OUT, shot.file);
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    const kb = Math.round(fs.statSync(file).size / 1024);
    written.push(`${shot.file} (${kb} kB) ← ${shot.url}`);
    console.log(`captured ${shot.file} (${kb} kB)`);
  }

  ws.close();
  chrome.kill();
  console.log(`\n${written.length} screenshots in ${OUT}`);
}

main().catch((err) => { console.error('FAILED:', err.message); process.exit(1); });
