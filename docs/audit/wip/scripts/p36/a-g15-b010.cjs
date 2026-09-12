const { admin, R } = require('./a-lib.cjs');
(async () => {
  const a = await admin();
  const g = await a.get('/api/settings');
  R('010 admin GET /api/settings', g.status + ' leaks=' + /AUDIT-P36A-smtp-pw/.test(g.text));
  const m = (g.text.match(/"key"\s*:\s*"email_config"[\s\S]{0,260}/) || [''])[0];
  R('010 admin email_config snippet', m.slice(0, 260));
  const e = await a.get('/api/app-settings/email');
  R('010 admin GET /api/app-settings/email', e.status + ' leaks=' + /AUDIT-P36A-smtp-pw/.test(e.text));
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
