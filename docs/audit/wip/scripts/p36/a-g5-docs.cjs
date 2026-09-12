const { admin, veh, res, PU, R, F, TS } = require('./a-lib.cjs');
const out = {};
(async () => {
  const a = await admin();
  R('session', a.who);

  // --- BUG-034 follow-up (B-01/B-09): is a blocked vehicle excluded from availability?
  const g4 = require('./a-g4-ids.json');
  const av = await a.get('/api/vehicles/available?startDate=2026-10-01&endDate=2026-10-05');
  const list = av.json && (Array.isArray(av.json) ? av.json : av.json.data || []);
  R('034 /api/vehicles/available status', av.status + ' n=' + (list ? list.length : '?'));
  R('034 blocked vehicle ' + g4.b034.v34 + ' present in available?', list ? list.some(v => v.id === g4.b034.v34) : 'n/a');

  // --- BUG-055: reservation delete + driver assignment + documents
  const v55 = await veh(a, 'J');
  const r55 = await res(a, v55, '2026-09-01', '2027-04-05');
  await a.post('/api/reservations/' + r55 + '/pickup', PU('P36A-J-' + TS));
  const gen = await a.get('/api/contracts/generate/' + r55);
  R('055 contract', gen.status + ' len=' + gen.text.length);
  out.b055b = { r55, v55 };
  require('fs').writeFileSync('a-g5-pre.json', JSON.stringify(out, null, 1));

  // --- BUG-027: regenerate contract -> N documents rows on 1 physical file
  const gen2 = await a.get('/api/contracts/generate/' + r55);
  R('027 contract regenerate', gen2.status + ' len=' + gen2.text.length);
  const docs = await a.get('/api/documents/reservation/' + r55);
  R('027 documents for reservation', docs.status + ' ' + docs.text.slice(0, 600));

  // --- BUG-012: path containment on documents view/download/delete
  const upl = await a.get('/api/documents');
  R('012 documents list status', upl.status);

  // --- BUG-028: default pdf template with fields: []
  const tpl = await a.get('/api/pdf-templates');
  const tl = tpl.json && (Array.isArray(tpl.json) ? tpl.json : tpl.json.data || []);
  R('028 templates', tpl.status + ' ' + (tl || []).map(t => t.id + ':' + t.name + ':default=' + t.isDefault + ':fields=' + (Array.isArray(t.fields) ? t.fields.length : typeof t.fields)).join(' | ').slice(0, 400));

  // --- BUG-048: pdf-template fields in odd shapes
  const t1 = await a.post('/api/pdf-templates', { name: 'AUDIT-P36A-T1-' + TS, fields: JSON.stringify(JSON.stringify([{ name: 'customerName', x: 1, y: 1 }])) });
  R('048 fields double-stringified', t1.status + ' ' + t1.text.slice(0, 180));
  const t2 = await a.post('/api/pdf-templates', { name: 'AUDIT-P36A-T2-' + TS, fields: ['customerName', 'licensePlate'] });
  R('048 fields array-of-strings', t2.status + ' ' + t2.text.slice(0, 180));
  const t3 = await a.post('/api/pdf-templates', { name: 'AUDIT-P36A-T3-' + TS, fields: { customerName: { x: 10, y: 10 } } });
  R('048 fields object', t3.status + ' ' + t3.text.slice(0, 180));
  out.b048 = [t1.json && t1.json.id, t2.json && t2.json.id, t3.json && t3.json.id];

  // --- BUG-025: settings write validation
  const ov = await a.post('/api/settings/contract-number-override', { overrideNumber: 99999999999 });
  R('025 contract-number-override 11 digits', ov.status + ' ' + ov.text.slice(0, 200));
  const ss = await a.put('/api/system-settings', { maintenanceExcludedStatuses: 'not_an_array' });
  R('025 system-settings bad type', ss.status + ' ' + ss.text.slice(0, 200));

  // --- BUG-057: malformed JSON body
  const bad = await a.request('POST', '/api/reservations', '{"vehicleId": 1682, "customerId": 1254, startDate: "2027-02-01"', { raw: true, headers: { 'Content-Type': 'application/json' } });
  R('057 malformed JSON', bad.status + ' ' + bad.text.slice(0, 300));
  R('057 has stack?', /"stack"/.test(bad.text));

  // --- BUG-049: multipart field order (file before vehicleId)
  const boundary = '----P36A49' + TS;
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100' + '05fe02fe', 'hex');
  const bodyFileFirst = Buffer.concat([
    Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n', 'utf8'),
    png,
    Buffer.from('\r\n--' + boundary + '\r\nContent-Disposition: form-data; name="vehicleId"\r\n\r\n' + v55 + '\r\n', 'utf8'),
    Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="documentType"\r\n\r\nAUDIT-P36A\r\n', 'utf8'),
    Buffer.from('--' + boundary + '--\r\n', 'utf8')]);
  const d49 = await a.request('POST', '/api/documents', bodyFileFirst, { raw: true, headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary } });
  R('049 file-before-vehicleId', d49.status + ' ' + d49.text.slice(0, 250));
  R('049 has stack?', /"stack"/.test(d49.text));

  // --- BUG-030: rejected upload => 400 without stack
  const b2 = '----P36A30' + TS;
  const exe = Buffer.concat([
    Buffer.from('--' + b2 + '\r\nContent-Disposition: form-data; name="vehicleId"\r\n\r\n' + v55 + '\r\n', 'utf8'),
    Buffer.from('--' + b2 + '\r\nContent-Disposition: form-data; name="documentType"\r\n\r\nAUDIT-P36A\r\n', 'utf8'),
    Buffer.from('--' + b2 + '\r\nContent-Disposition: form-data; name="file"; filename="malware.exe"\r\nContent-Type: image/png\r\n\r\n', 'utf8'),
    Buffer.from('MZ....not-a-png', 'utf8'),
    Buffer.from('\r\n--' + b2 + '--\r\n', 'utf8')]);
  const d30 = await a.request('POST', '/api/documents', exe, { raw: true, headers: { 'Content-Type': 'multipart/form-data; boundary=' + b2 } });
  R('030 disallowed extension upload', d30.status + ' ' + d30.text.slice(0, 250));
  R('030 has stack?', /"stack"/.test(d30.text));

  require('fs').writeFileSync('a-g5-ids.json', JSON.stringify(out, null, 1));
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
