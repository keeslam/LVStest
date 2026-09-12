// Hergebruikt één ingelogde sessie over meerdere scripts, zodat de inloglimiet
// (5 mislukte pogingen per IP per 15 min — de fix van BUG-009/BUG-105) niet in
// de weg zit tijdens het meten.
'use strict';
const fs = require('fs'); const { Session } = require('./lib.cjs');
const FILE = __dirname + '/session-cache.json';
async function getSession(user = 'audit-p36w', pw = 'P36sweep!23') {
  const s = new Session('cached');
  if (fs.existsSync(FILE)) {
    const saved = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (saved.user === user) {
      for (const [k, v] of Object.entries(saved.cookies)) s.cookies.set(k, v);
      s.csrf = saved.csrf;
      const probe = await s.get('/api/user');
      if (probe.status === 200) return s;
    }
  }
  const r = await s.loginStaff(user, pw);
  if (r.status !== 200) throw new Error('inloggen mislukt: ' + r.status + ' ' + (r.text || '').slice(0, 120));
  fs.writeFileSync(FILE, JSON.stringify({ user, cookies: Object.fromEntries(s.cookies), csrf: s.csrf }));
  return s;
}
module.exports = { getSession };
