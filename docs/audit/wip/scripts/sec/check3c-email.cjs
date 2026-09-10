const { Jar, req, loginStaff, csrfHeader, dump, getOrLoginStaff } = require('./sr-lib.cjs');
const fs = require('fs');
const path = require('path');

// Needs: a running docs/audit/wip/scripts/sec/sr-smtp-stub.cjs on 127.0.0.1:2525,
// and a document id to send (contract/damage type) belonging to a reservation
// whose customer name carries the XSS payload - see check3-ids.json / check3-pdf.cjs.

(async () => {
  const jar = new Jar();
  await getOrLoginStaff(jar);
  const out = {};

  // 1. Point email_documents at the stub
  let csrf = await csrfHeader(jar);
  const cfgRes = await req(jar, 'POST', '/api/app-settings', {
    headers: { 'X-CSRF-Token': csrf },
    json: {
      key: 'email_documents',
      category: 'email',
      value: {
        fromEmail: 'audit@example.com',
        smtpHost: '127.0.0.1',
        smtpPort: '2525',
        smtpUser: 'audit',
        smtpPassword: 'audit',
      },
      description: 'AUDIT temporary SMTP stub config for phase-8 security runtime test',
    },
  });
  out['configure email_documents -> stub'] = { status: cfgRes.status, body: cfgRes.text.slice(0, 300) };

  // 2. Find a document to send (any contract/damage doc created earlier by check3-pdf.cjs, fallback: any existing)
  let docId = null;
  try {
    const idsPath = path.join(__dirname, 'check3-pdf-doc.json');
    if (fs.existsSync(idsPath)) docId = JSON.parse(fs.readFileSync(idsPath, 'utf8')).documentId;
  } catch {}
  if (!docId) {
    const listRes = await req(jar, 'GET', '/api/documents');
    try {
      const docs = JSON.parse(listRes.text);
      const match = docs.find(d => /contract|damage/i.test(d.documentType));
      docId = match?.id;
    } catch {}
  }
  out['docId used'] = docId;

  if (docId) {
    csrf = await csrfHeader(jar);
    // The 'message' field is what gets interpolated raw into the HTML body
    // (server/routes.ts ~5277: `<p>${message.replace(/\n/g,'<br>')}</p>`, no escaping).
    // Simulate what happens when that field carries user-controlled text.
    const emailRes = await req(jar, 'POST', `/api/documents/${docId}/email`, {
      headers: { 'X-CSRF-Token': csrf },
      json: {
        recipients: 'audit-recipient@example.invalid',
        subject: 'AUDIT security test',
        message: `Zie bijlage voor AUDIT-<img src=x onerror=alert(6)> - <script>document.title='mailxss'</script>`,
      },
    });
    out['POST /api/documents/:id/email'] = { status: emailRes.status, body: emailRes.text.slice(0, 300) };
  }

  // 3. Give the stub a moment then read its log
  await new Promise(r => setTimeout(r, 1500));
  const logPath = path.join(__dirname, 'sr-smtp-log.jsonl');
  if (fs.existsSync(logPath)) {
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
    const last = lines[lines.length - 1];
    out['stub captured (last entry, truncated)'] = last ? last.slice(0, 2000) : null;
  } else {
    out['stub log'] = 'NOT FOUND - stub may not be running';
  }

  // 4. Restore: delete the temporary app_settings row (or clear it) so it doesn't
  // leave a broken SMTP config for later real use.
  const listSettings = await req(jar, 'GET', '/api/app-settings');
  try {
    const settings = JSON.parse(listSettings.text);
    const row = settings.find(s => s.key === 'email_documents');
    if (row) {
      csrf = await csrfHeader(jar);
      const delRes = await req(jar, 'DELETE', `/api/app-settings/${row.id}`, { headers: { 'X-CSRF-Token': csrf } });
      out['restore: delete email_documents row'] = delRes.status;
    }
  } catch (e) { out['restore error'] = String(e); }

  console.log(dump(out));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
