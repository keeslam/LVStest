// Phase 14 E: permission checks on every PDF/template endpoint for a limited user (view_vehicles only) and unauthenticated.
'use strict';
const L = require('./p14-lib.cjs');
const fs = require('fs');
const path = require('path');

(async () => {
  const ids = L.loadIds();
  const admin = await L.staff('10.14.1.7');
  const lim = await L.staff('10.14.1.8', ids.limitedUserName, ids.limitedUserPass);
  const anon = new L.Session('anon', { fakeIp: '10.14.1.9' });
  await anon.get('/'); // obtain XSRF cookie without login
  const out = [];
  const docMax = Number((await L.q('select coalesce(max(id),0) m from documents'))[0].m);
  const idc = ids.idc || (await L.q('select id from interactive_damage_checks order by id desc limit 1'))[0].id;

  const cases = [
    ['GET', `/api/contracts/generate/${ids.rNormal}?templateId=${ids.tplFull}`, null, 'contract generate (writes documents row)'],
    ['GET', `/api/contracts/generate-default/${ids.rNormal}`, null, 'contract generate-default (writes documents row)'],
    ['POST', `/api/contracts/generate-versioned/${ids.rNormal}?templateId=${ids.tplFull}`, { vehicleId: ids.vNormal, customerId: ids.cNormal, startDate: L.today(), endDate: L.addDays(L.today(), 2) }, 'contract generate-versioned (writes documents row)'],
    ['POST', `/api/contracts/preview?templateId=${ids.tplFull}`, { vehicleId: ids.vNormal, customerId: ids.cNormal, startDate: L.today(), endDate: L.addDays(L.today(), 2) }, 'contract preview (customer PII in PDF)'],
    ['GET', `/api/contracts/data/${ids.rNormal}`, null, 'contract data JSON (customer PII)'],
    ['GET', `/api/pdf-templates`, null, 'pdf templates list'],
    ['GET', `/api/pdf-templates/${ids.tplFull}/preview`, null, 'pdf template preview'],
    ['POST', `/api/pdf-templates`, { name: 'AUDIT-P14 perm', fields: '[]' }, 'pdf template create'],
    ['PATCH', `/api/pdf-templates/${ids.tplFull}`, { name: 'AUDIT-P14 full fields' }, 'pdf template patch'],
    ['DELETE', `/api/pdf-templates/999999`, null, 'pdf template delete (nonexistent id)'],
    ['GET', `/api/damage-checks/generate/${ids.rDamage}`, null, 'damage check generate (writes documents row)'],
    ['GET', `/api/vehicles/${ids.vDamage}/damage-check-pdf`, null, 'vehicle damage-check-pdf (customer name from reservation)'],
    ['GET', `/api/interactive-damage-checks/${idc}/pdf`, null, 'interactive damage check pdf (signatures, customer)'],
    ['GET', `/api/damage-check-templates`, null, 'damage check templates list'],
    ['POST', `/api/damage-check-templates/preview-pdf`, { name: 'x', canvasFields: [] }, 'damage check template draft preview'],
    ['POST', `/api/damage-check-templates`, { name: 'AUDIT-P14 perm', canvasFields: [] }, 'damage check template create'],
    ['PUT', `/api/damage-check-templates/${ids.dcTpl}`, { name: 'AUDIT-P14 damage check template' }, 'damage check template update'],
    ['GET', `/api/transport-report-templates`, null, 'transport templates list'],
    ['GET', `/api/transport-report-templates/1/preview`, null, 'transport template preview'],
    ['POST', `/api/transport-report-templates`, { name: 'AUDIT-P14 perm', fields: [] }, 'transport template create'],
    ['POST', `/api/delivery/transports/generate-report`, { transportIds: [ids.trNormal] }, 'transport report generate (writes documents row)'],
    ['GET', `/api/barcode-label-templates`, null, 'barcode label templates list'],
    ['POST', `/api/barcode-label-templates`, { name: 'AUDIT-P14 perm', fields: [] }, 'barcode label template create'],
    ['GET', `/api/vehicle-diagram-templates`, null, 'vehicle diagram templates list (BUG-066)'],
    ['POST', `/api/interactive-damage-checks`, { vehicleId: ids.vDamage, checkType: 'return', checkDate: new Date().toISOString(), notes: 'AUDIT-P14 perm test' }, 'interactive damage check create (known gap 01a:25)'],
    ['GET', `/api/damage-check-fields/header`, null, 'damage check header image'],
    ['GET', `/api/documents/download/${docMax}`, null, 'download latest document'],
  ];

  for (const [method, url, body, label] of cases) {
    const row = { method, url, label };
    for (const [who, s] of [['anon', anon], ['limited', lim], ['admin', admin]]) {
      try {
        const r = await L.getBuffer(s, url, { method, body: body || undefined });
        row[who] = r.status;
        if (who !== 'admin' && r.status < 300) row[who + '_ct'] = r.contentType.split(';')[0] + ' ' + r.buf.length + 'B';
      } catch (e) { row[who] = 'ERR ' + e.message; }
    }
    out.push(row);
    L.log(`${row.anon}\t${row.limited}\t${row.admin}\t${method} ${url}  (${label})`, row.limited_ct ? { limited: row.limited_ct } : '');
  }
  const docsWritten = await L.q('select id, reservation_id, document_type, created_by from documents where id > $1 order by id', [docMax]);
  L.log('documents rows written during the matrix (created_by tells who)', docsWritten.map(d => `${d.id}:${d.reservation_id}:${d.document_type}:${d.created_by}`));
  const created = await L.q("select id, name from pdf_templates where name='AUDIT-P14 perm'");
  for (const c of created) await admin.del(`/api/pdf-templates/${c.id}`);
  const created2 = await L.q("select id, name from damage_check_templates where name='AUDIT-P14 perm'");
  for (const c of created2) await admin.del(`/api/damage-check-templates/${c.id}`);
  const created3 = await L.q("select id from transport_report_templates where name='AUDIT-P14 perm'");
  for (const c of created3) await admin.del(`/api/transport-report-templates/${c.id}`);
  const created4 = await L.q("select id from barcode_label_templates where name='AUDIT-P14 perm'");
  for (const c of created4) await admin.del(`/api/barcode-label-templates/${c.id}`);
  const created5 = await L.q("select id from interactive_damage_checks where notes='AUDIT-P14 perm test'");
  for (const c of created5) await admin.del(`/api/interactive-damage-checks/${c.id}`);
  fs.writeFileSync(path.join(__dirname, 'p14-e-perms.out.json'), JSON.stringify({ matrix: out, docsWritten }, null, 1));
  console.log('\nhealth', await L.health());
  await L.pool.end();
})().catch(async (e) => { console.error('FAILED', e); try { await L.pool.end(); } catch {} process.exit(1); });
