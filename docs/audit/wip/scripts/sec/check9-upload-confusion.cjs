const { Jar, req, loginStaff, csrfHeader, dump, getOrLoginStaff } = require('./sr-lib.cjs');

(async () => {
  const jar = new Jar();
  await getOrLoginStaff(jar);
  const out = {};

  // NOTE (script bug fixed this session): createDocumentUploadStorage (server/routes.ts:4805-4810)
  // reads req.body.vehicleId inside multer's disk-storage destination() callback, which fires as soon
  // as the "file" part is parsed - multer/busboy parses multipart parts in stream order, so a text
  // field placed AFTER "file" is not yet on req.body when that callback runs (a real multer gotcha,
  // not specific to this app). The original payloads below put "file" before "documentType" and had
  // no "vehicleId" field at all, which always 500'd with "Vehicle ID is required" before ever reaching
  // the content-type-confusion logic this check is meant to exercise. Fixed: vehicleId now comes first,
  // pointing at the AUDIT-tainted vehicle 1732 created earlier in this audit (check3-xss.cjs).
  const AUDIT_VEHICLE_ID = '1732';

  // --- 1. "PDF" whose first bytes are %PDF- followed by HTML/script ---
  const polyglot = Buffer.from('%PDF-1.4\n<script>document.title="uploadxss"</script>\n%%EOF');
  const boundary1 = '----auditPdfBoundary' + Date.now();
  const body1 = Buffer.concat([
    Buffer.from(`--${boundary1}\r\nContent-Disposition: form-data; name="vehicleId"\r\n\r\n${AUDIT_VEHICLE_ID}\r\n`),
    Buffer.from(`--${boundary1}\r\nContent-Disposition: form-data; name="documentType"\r\n\r\ncontract\r\n`),
    Buffer.from(`--${boundary1}\r\nContent-Disposition: form-data; name="file"; filename="audit-polyglot.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
    polyglot,
    Buffer.from(`\r\n--${boundary1}--\r\n`),
  ]);
  const csrf1 = await csrfHeader(jar);
  const up1 = await fetch('http://localhost:5001/api/documents', {
    method: 'POST',
    headers: { 'Cookie': jar.header(), 'X-CSRF-Token': csrf1, 'Content-Type': `multipart/form-data; boundary=${boundary1}` },
    body: body1,
  });
  const up1text = await up1.text();
  out['upload PDF/script polyglot'] = { status: up1.status, body: up1text.slice(0, 500) };
  let doc1 = null;
  try { doc1 = JSON.parse(up1text); } catch {}

  if (doc1?.id) {
    const view1 = await req(jar, 'GET', `/api/documents/view/${doc1.id}`);
    out['GET /api/documents/view/:id (polyglot)'] = {
      status: view1.status,
      contentType: view1.headers.get('content-type'),
      contentDisposition: view1.headers.get('content-disposition'),
      xContentTypeOptions: view1.headers.get('x-content-type-options'),
      bodyPreview: view1.text.slice(0, 200),
    };
    if (doc1.filePath) {
      const uploadsUrl = '/' + doc1.filePath.replace(/\\/g, '/').replace(/^.*uploads[\\/]/, 'uploads/');
      const viaStatic = await req(jar, 'GET', '/' + uploadsUrl.replace(/^\/+/, ''));
      out['GET /uploads/... (polyglot, direct static)'] = {
        status: viaStatic.status,
        contentType: viaStatic.headers.get('content-type'),
        contentDisposition: viaStatic.headers.get('content-disposition'),
        xContentTypeOptions: viaStatic.headers.get('x-content-type-options'),
      };
      out['doc1.filePath'] = doc1.filePath;
    }
  }

  // --- 2. SVG renamed .png ---
  const svgContent = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(4)"><script>alert(5)</script></svg>');
  const boundary2 = '----auditSvgBoundary' + Date.now();
  const body2 = Buffer.concat([
    Buffer.from(`--${boundary2}\r\nContent-Disposition: form-data; name="vehicleId"\r\n\r\n${AUDIT_VEHICLE_ID}\r\n`),
    Buffer.from(`--${boundary2}\r\nContent-Disposition: form-data; name="documentType"\r\n\r\ndamage\r\n`),
    Buffer.from(`--${boundary2}\r\nContent-Disposition: form-data; name="file"; filename="audit-fake.png"\r\nContent-Type: image/png\r\n\r\n`),
    svgContent,
    Buffer.from(`\r\n--${boundary2}--\r\n`),
  ]);
  const csrf2 = await csrfHeader(jar);
  const up2 = await fetch('http://localhost:5001/api/documents', {
    method: 'POST',
    headers: { 'Cookie': jar.header(), 'X-CSRF-Token': csrf2, 'Content-Type': `multipart/form-data; boundary=${boundary2}` },
    body: body2,
  });
  const up2text = await up2.text();
  out['upload SVG renamed .png'] = { status: up2.status, body: up2text.slice(0, 500) };
  let doc2 = null;
  try { doc2 = JSON.parse(up2text); } catch {}
  if (doc2?.id) {
    const view2 = await req(jar, 'GET', `/api/documents/view/${doc2.id}`);
    out['GET /api/documents/view/:id (svg-as-png)'] = {
      status: view2.status,
      contentType: view2.headers.get('content-type'),
      contentDisposition: view2.headers.get('content-disposition'),
      xContentTypeOptions: view2.headers.get('x-content-type-options'),
    };
  }

  console.log(dump(out));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
