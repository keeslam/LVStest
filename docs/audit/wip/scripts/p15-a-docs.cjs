// PHASE 15 file-handling: staff document upload + serving matrix.
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Session } = require('./lib.cjs');

const FILES = path.join(__dirname, 'files', 'p15');
const BASE = 'http://localhost:5001';

function multipartUpload(pathUrl, fields, fileField, filename, contentType, buffer, cookieHeader, csrf) {
  return new Promise((resolve) => {
    const boundary = '----P15Boundary' + Date.now() + Math.random().toString(36).slice(2);
    const parts = [];
    for (const [k, v] of Object.entries(fields)) {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
    }
    if (fileField) {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`));
      parts.push(buffer);
      parts.push(Buffer.from(`\r\n`));
    }
    parts.push(Buffer.from(`--${boundary}--\r\n`));
    const body = Buffer.concat(parts);
    const u = new URL(BASE + pathUrl);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length, 'Cookie': cookieHeader, 'X-CSRF-Token': csrf } },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: d.slice(0, 600), headers: res.headers })); });
    req.on('error', e => resolve({ status: 0, body: 'ERR ' + e.message }));
    req.write(body); req.end();
  });
}

(async () => {
  const s = new Session('p15', { fakeIp: '10.15.1.10' });
  const login = await s.loginStaff('admin', 'admin123');
  console.log('login', login.status);
  const cookieHeader = s.cookieHeader();
  const csrf = s.csrf;

  // find/create an audit vehicle
  let vres = await s.get('/api/vehicles?search=AU-15A-X&limit=1');
  let vehicleId, plate;
  const existing = (vres.json || []).find && (vres.json || []).find(v => v.licensePlate === 'AU-15A-X');
  if (existing) { vehicleId = existing.id; plate = existing.licensePlate; }
  else {
    const c = await s.post('/api/vehicles', { licensePlate: 'AU-15A-X', brand: 'AUDIT', model: 'P15', vehicleType: 'Car', chassisNumber: 'AUDITP15CHASSIS01' });
    console.log('create vehicle', c.status, (c.json && (c.json.id || c.json.message)) || c.text.slice(0,120));
    vehicleId = c.json && c.json.id; plate = c.json && c.json.licensePlate;
  }
  console.log('VEHICLE', vehicleId, plate);
  const results = {};

  const buf = f => fs.readFileSync(path.join(FILES, f));

  // 1. valid PDF (non-contract type so filename gets a timestamp)
  let r = await multipartUpload('/api/documents', { documentType: 'AUDIT-P15', vehicleId: String(vehicleId) }, 'file', 'AUDIT-valid.pdf', 'application/pdf', buf('valid.pdf'), cookieHeader, csrf);
  results.validPdf = { status: r.status, body: r.body };
  let docId = null; try { docId = JSON.parse(r.body).id; } catch {}
  console.log('1 validPdf', r.status, 'docId', docId);

  // 2. empty file
  r = await multipartUpload('/api/documents', { documentType: 'AUDIT-P15', vehicleId: String(vehicleId) }, 'file', 'AUDIT-empty.pdf', 'application/pdf', buf('empty.pdf'), cookieHeader, csrf);
  results.empty = { status: r.status, body: r.body }; console.log('2 empty', r.status, r.body.slice(0,120));

  // 3. fake exe with .pdf name
  r = await multipartUpload('/api/documents', { documentType: 'AUDIT-P15', vehicleId: String(vehicleId) }, 'file', 'AUDIT-evil.pdf', 'application/pdf', buf('fake-exe.pdf'), cookieHeader, csrf);
  results.fakeExe = { status: r.status, body: r.body }; console.log('3 fakeExe', r.status, r.body.slice(0,120));

  // 4. text as pdf (no magic)
  r = await multipartUpload('/api/documents', { documentType: 'AUDIT-P15', vehicleId: String(vehicleId) }, 'file', 'AUDIT-text.pdf', 'application/pdf', buf('text-as.pdf'), cookieHeader, csrf);
  results.textAsPdf = { status: r.status, body: r.body }; console.log('4 textAsPdf', r.status, r.body.slice(0,120));

  // 5. polyglot pdf with <script>, served inline check
  r = await multipartUpload('/api/documents', { documentType: 'AUDIT-P15', vehicleId: String(vehicleId) }, 'file', 'AUDIT-poly.pdf', 'application/pdf', buf('polyglot.pdf'), cookieHeader, csrf);
  results.polyglot = { status: r.status, body: r.body }; let polyId = null; try { polyId = JSON.parse(r.body).id; } catch {}
  console.log('5 polyglot', r.status, 'polyId', polyId);

  // 6. PNG served with octet-stream mimetype (content-type confusion on serve)
  r = await multipartUpload('/api/documents', { documentType: 'AUDIT-P15', vehicleId: String(vehicleId) }, 'file', 'AUDIT-img.pdf', 'application/octet-stream', buf('valid.pdf'), cookieHeader, csrf);
  results.octetPdf = { status: r.status, body: r.body }; console.log('6 octet+pdfbytes', r.status, r.body.slice(0,120));

  // 7. wrong extension: jpg bytes with .exe name -> dangerous ext rejected at filter
  r = await multipartUpload('/api/documents', { documentType: 'AUDIT-P15', vehicleId: String(vehicleId) }, 'file', 'AUDIT-x.exe', 'image/jpeg', buf('valid.jpg'), cookieHeader, csrf);
  results.exeName = { status: r.status, body: r.body }; console.log('7 .exe name', r.status, r.body.slice(0,160));

  // 8. DUPLICATE contract collision: upload two DIFFERENT contract PDFs same day/plate
  r = await multipartUpload('/api/documents', { documentType: 'contract', vehicleId: String(vehicleId) }, 'file', 'c1.pdf', 'application/pdf', buf('valid.pdf'), cookieHeader, csrf);
  let cdoc1 = null; try { cdoc1 = JSON.parse(r.body); } catch {}
  r = await multipartUpload('/api/documents', { documentType: 'contract', vehicleId: String(vehicleId) }, 'file', 'c2.pdf', 'application/pdf', buf('polyglot.pdf'), cookieHeader, csrf);
  let cdoc2 = null; try { cdoc2 = JSON.parse(r.body); } catch {}
  results.contractDup = { doc1: cdoc1 && { id: cdoc1.id, filePath: cdoc1.filePath, fileSize: cdoc1.fileSize }, doc2: cdoc2 && { id: cdoc2.id, filePath: cdoc2.filePath, fileSize: cdoc2.fileSize } };
  console.log('8 contractDup doc1', cdoc1 && cdoc1.id, cdoc1 && cdoc1.filePath, '| doc2', cdoc2 && cdoc2.id, cdoc2 && cdoc2.filePath);
  // now fetch doc1 view — its bytes should be doc2's content if the file was overwritten
  if (cdoc1 && cdoc2) {
    const v1 = await s.get(`/api/documents/view/${cdoc1.id}`);
    results.contractDup.doc1_view_len = v1.text.length; results.contractDup.doc1_view_head = v1.text.slice(0,40);
    console.log('   doc1 view after doc2 upload: len', v1.text.length, JSON.stringify(v1.text.slice(0,40)));
  }

  // 9. serve inline headers for the polyglot doc
  if (polyId) {
    const v = await s.get(`/api/documents/view/${polyId}`);
    results.polyServe = { status: v.status, ct: v.headers.get('content-type'), cd: v.headers.get('content-disposition'), xcto: v.headers.get('x-content-type-options'), head: v.text.slice(0,30) };
    console.log('9 polyServe', v.status, v.headers.get('content-type'), '|', v.headers.get('content-disposition'), '| nosniff', v.headers.get('x-content-type-options'));
  }

  // 10. MISSING FILE ON DISK: delete valid doc's file, then view/download, then check row still present
  if (docId) {
    const d = await s.get(`/api/documents/${docId}`);
    const fp = d.json && d.json.filePath;
    const abs = path.join(process.cwd(), fp || '');
    let existed = fs.existsSync(abs);
    if (existed) fs.unlinkSync(abs);
    const v = await s.get(`/api/documents/view/${docId}`);
    const dl = await s.get(`/api/documents/download/${docId}`);
    const row = await s.get(`/api/documents/${docId}`);
    results.missingFile = { filePath: fp, existedBefore: existed, viewStatus: v.status, viewBody: v.text.slice(0,120), downloadStatus: dl.status, rowStillExists: row.status === 200 };
    console.log('10 missingFile view', v.status, 'download', dl.status, 'rowStill', row.status === 200);
  }

  // 11. HUGE 60MB pdf -> documents (25MB limit)
  r = await multipartUpload('/api/documents', { documentType: 'AUDIT-P15', vehicleId: String(vehicleId) }, 'file', 'AUDIT-huge.pdf', 'application/pdf', buf('huge.pdf'), cookieHeader, csrf);
  results.huge = { status: r.status, body: r.body.slice(0,400) };
  console.log('11 huge60MB', r.status, r.body.slice(0,200));

  fs.writeFileSync(path.join(__dirname, 'p15-a-docs.out.json'), JSON.stringify(results, null, 2));
  console.log('DONE');
})();
