const { Jar, req, dump, AUDIT_XFF } = require('./sr-lib.cjs');

const A_PAYLOAD = '<a href="javascript:alert(3)">click</a>';

async function portalLogin(jar) {
  await req(jar, 'GET', '/api/portal/csrf-token');
  const csrf = jar.get('PORTAL-XSRF-TOKEN');
  const r = await req(jar, 'POST', '/api/portal/login', {
    headers: { 'X-CSRF-Token': csrf },
    json: { email: 'portaal-test@example.com', password: 'portaal-test-1234' },
  });
  return { r, csrf };
}

async function portalCsrf(jar) {
  await req(jar, 'GET', '/api/portal/csrf-token');
  return jar.get('PORTAL-XSRF-TOKEN');
}

(async () => {
  const jar = new Jar();
  const out = {};
  const login = await portalLogin(jar);
  out['portal login'] = { status: login.r.status, body: login.r.text.slice(0, 300) };

  // A) JSON request (goes through global sanitizeInput -> should be stripped)
  let csrf = await portalCsrf(jar);
  const jsonReq = await req(jar, 'POST', '/api/portal/requests', {
    headers: { 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' },
    json: { type: 'other', message: `AUDIT-JSON-${A_PAYLOAD}`, payload: { subject: 'AUDIT sanitize test (json)' } },
  });
  out['A) JSON portal request create'] = { status: jsonReq.status, body: jsonReq.text.slice(0, 500) };
  let jsonReqId = null;
  try { jsonReqId = JSON.parse(jsonReq.text).id; } catch {}

  if (jsonReqId) {
    const get1 = await req(jar, 'GET', `/api/portal/requests/${jsonReqId}`);
    out['A) GET json request (raw storage)'] = { status: get1.status, body: get1.text.slice(0, 500) };
  }

  // B) multipart/form-data request WITH an attachment - hypothesis: sanitizeInput only
  // touches req.body when the body was JSON; a multipart body is parsed later by
  // multer (after sanitizeInput already ran on an empty body), so the "message"
  // field here may bypass the DOMPurify strip entirely.
  csrf = await portalCsrf(jar);
  const boundary = '----auditBoundary' + Date.now();
  // Must be a real PDF (validateAfterUpload magic-byte-checks it) with a .pdf name/mimetype
  // to pass createSecureMulterFilter + validateAfterUpload and actually reach the route handler.
  const fileContent = Buffer.from('%PDF-1.4\n%AUDIT test attachment\n%%EOF');
  const parts = [];
  parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="type"\r\n\r\nother\r\n`);
  parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="message"\r\n\r\nAUDIT-MULTIPART-${A_PAYLOAD}\r\n`);
  parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="payload"\r\n\r\n${JSON.stringify({ subject: 'AUDIT sanitize test (multipart)' })}\r\n`);
  parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="attachments"; filename="audit-test.pdf"\r\nContent-Type: application/pdf\r\n\r\n`);
  const preFile = Buffer.from(parts.join(''));
  const postFile = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([preFile, fileContent, postFile]);

  const mpRes = await fetch('http://localhost:5001/api/portal/requests', {
    method: 'POST',
    headers: Object.assign({
      'Cookie': jar.header(),
      'X-CSRF-Token': csrf,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    }, AUDIT_XFF ? { 'X-Forwarded-For': AUDIT_XFF } : {}),
    body,
  });
  const mpText = await mpRes.text();
  out['B) multipart portal request create'] = { status: mpRes.status, body: mpText.slice(0, 500) };
  let mpReqId = null;
  try { mpReqId = JSON.parse(mpText).id; } catch {}

  if (mpReqId) {
    const get2 = await req(jar, 'GET', `/api/portal/requests/${mpReqId}`);
    out['B) GET multipart request (raw storage)'] = { status: get2.status, body: get2.text.slice(0, 500) };
  }

  console.log(dump(out));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
