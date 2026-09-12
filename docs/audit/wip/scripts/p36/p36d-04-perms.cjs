// P36 agent D — BUG-167 permission checks on the nine document endpoints
'use strict';
const L = require('./p36d-lib.cjs');
(async () => {
  const ids = L.loadIds();
  const adm = await L.staff('10.36.4.13');
  const lim = new L.Session('limited', { fakeIp: '10.36.4.14' });
  const lr = await lim.loginStaff(ids.limitedUserName, ids.limitedUserPass);
  const anon = new L.Session('anon', { fakeIp: '10.36.4.15' });
  await anon.get('/api/vehicles?limit=1');

  const perms = await L.q('select id, username, role, permissions from users where username=$1', [ids.limitedUserName]);
  const out = { limitedLogin: lr.status, limitedUser: perms[0] };

  const cases = [
    ['GET', `/api/contracts/generate/${ids.rNormal}?templateId=${ids.tplFull}`],
    ['GET', `/api/contracts/generate-default/${ids.rNormal}`],
    ['POST', `/api/contracts/generate-versioned/${ids.rNormal}?templateId=${ids.tplFull}`, { vehicleId: ids.vNormal, customerId: ids.cNormal, startDate: L.today(), endDate: L.addDays(L.today(), 3) }],
    ['POST', '/api/contracts/preview', { reservationId: ids.rNormal, templateId: ids.tplFull }],
    ['GET', `/api/contracts/data/${ids.rNormal}`],
    ['GET', `/api/vehicles/${ids.vDamage}/damage-check-pdf`],
    ['POST', '/api/interactive-damage-checks', { reservationId: ids.rDamage, vehicleId: ids.vDamage, checkType: 'pickup', checkDate: new Date().toISOString(), damageItems: [], notes: 'AUDIT-P36D perm probe' }],
    ['GET', '/api/damage-check-fields/header'],
    ['GET', `/api/damage-checks/generate/${ids.rDamage}`],
  ];

  out.matrix = [];
  for (const [method, url, body] of cases) {
    const row = { method, url };
    for (const [who, sess] of [['anon', anon], ['limited', lim], ['admin', adm]]) {
      const r = await L.getBuffer(sess, url, { method, body });
      row[who] = r.status;
      if (who === 'limited') row.limitedBody = r.buf.toString('utf8').slice(0, 120);
    }
    out.matrix.push(row);
  }

  out.docsWrittenByLimited = await L.q("select id, document_type, created_by from documents where created_by = $1", [ids.limitedUserName]);

  console.log(JSON.stringify(out, null, 1));
  require('fs').writeFileSync(require('path').join(__dirname, 'p36d-04-perms.out.json'), JSON.stringify(out, null, 1));
  await L.pool.end();
})().catch(async (e) => { console.error('FAILED', e); try { await L.pool.end(); } catch {} process.exit(1); });
