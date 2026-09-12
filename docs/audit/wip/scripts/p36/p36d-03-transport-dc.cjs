// P36 agent D — transport report content (BUG-162/178) + damage-check template resolution (BUG-181c/183/192)
'use strict';
const L = require('./p36d-lib.cjs');
(async () => {
  const ids = L.loadIds();
  const st = await L.staff('10.36.4.12');
  const out = {};

  const reportFor = async (transportId, name) => {
    const r = await st.post('/api/delivery/transports/generate-report', { transportIds: [transportId] });
    if (r.status >= 300) return { status: r.status, body: r.text.slice(0, 300) };
    const docId = r.json.id;
    const pdf = await L.fetchPdf(st, `/api/documents/view/${docId}`, name, { textChars: 2000, oob: 12 });
    return { status: r.status, docId, fileName: r.json.fileName, pdf: { status: pdf.status, isPdf: pdf.isPdf, text: (pdf.allText || '').slice(0, 2000), oob: pdf.info && pdf.info.outOfBounds, oobCount: pdf.info && pdf.info.outOfBoundsCount } };
  };

  out.C1_transport_special = await L.step('C1 transport report unicode content (BUG-162)', () => reportFor(ids.trSpecial, 'c1_tr_special.pdf'));
  out.C2_transport_long = await L.step('C2 transport report long content (BUG-178)', () => reportFor(ids.trLong, 'c2_tr_long.pdf'));
  out.C3_transport_normal = await L.step('C3 transport report normal (BUG-192 locale)', () => reportFor(ids.trNormal, 'c3_tr_normal.pdf'));

  // damage-check templates matching the fixture vehicles so dynamic fields actually print
  const CF = (id, type, x, y, name, extra = {}) => Object.assign({ id, type, x, y, name, fontSize: 11, isBold: false, textAlign: 'left' }, extra);
  const dynFields = [
    CF('t1', 'text', 40, 120, 'AUDIT-P36D DC', { fontSize: 14, isBold: true }),
    CF('d1', 'dynamic', 40, 150, 'Kenteken', { source: 'licensePlate' }),
    CF('d7', 'dynamic', 40, 190, 'Klant', { source: 'customerName' }),
    CF('d8', 'dynamic', 300, 190, 'Contract', { source: 'contractNumber' }),
    CF('d9', 'dynamic', 40, 210, 'Start', { source: 'startDate' }),
    CF('d10', 'dynamic', 200, 210, 'Eind', { source: 'endDate' }),
    CF('d11', 'dynamic', 360, 210, 'Dagen', { source: 'rentalDays' }),
    CF('d12', 'dynamic', 40, 230, 'Datum', { source: 'currentDate' }),
  ];
  const mkDc = async (key, make, model) => {
    const ex = await L.q('select id from damage_check_templates where name=$1', ['AUDIT-P36D DC ' + key]);
    if (ex[0]) { ids['dc_' + key] = ex[0].id; L.saveIds(ids); return ex[0].id; }
    const r = await st.post('/api/damage-check-templates', { name: 'AUDIT-P36D DC ' + key, description: 'AUDIT-P36D', vehicleMake: make, vehicleModel: model, vehicleType: null, isDefault: false, language: 'nl', canvasFields: dynFields, headerText: 'AUDIT-P36D', footerText: '' });
    if (r.status !== 201) throw new Error('dc template ' + key + ' -> ' + L.short(r, 400));
    ids['dc_' + key] = r.json.id; L.saveIds(ids); return r.json.id;
  };

  out.C4_mk_templates = await L.step('C4 damage-check templates for fixture vehicles', async () => ({
    normal: await mkDc('normal', 'AUDIT-P36D Brand', 'AUDIT-P36D Model'),
    old: await mkDc('old', 'AUDIT-P36D OldRes Brand', 'AUDIT-P36D OldRes Model'),
  }));

  out.C5_vehicle_dc_old = await L.step('C5 vehicle damage-check-pdf, only a 2020 reservation (BUG-183)', async () => {
    const r = await L.fetchPdf(st, `/api/vehicles/${ids.vOldRes}/damage-check-pdf`, 'c5_vdc_old.pdf', { textChars: 1500 });
    const resv = await L.q('select id, start_date, end_date, customer_id from reservations where vehicle_id=$1 and deleted_at is null', [ids.vOldRes]);
    return { status: r.status, isPdf: r.isPdf, reservations: resv, text: (r.allText || '').slice(0, 1200) };
  });

  out.C6_open_ended = await L.step('C6 damage check open-ended reservation (BUG-183 rentalDays)', async () => {
    const r = await L.fetchPdf(st, `/api/damage-checks/generate/${ids.rEmpty}`, 'c6_dc_open.pdf', { textChars: 1500 });
    const resv = await L.q('select id, start_date, end_date from reservations where id=$1', [ids.rEmpty]);
    return { status: r.status, isPdf: r.isPdf, reservation: resv[0], text: (r.allText || '').slice(0, 1200) };
  });

  out.C7_matchers = await L.step('C7 three damage-check routes agree on template (BUG-181c)', async () => {
    const a = await L.fetchPdf(st, `/api/damage-checks/generate/${ids.rDamage}`, 'c7_a.pdf', { textChars: 900 });
    const b = await L.fetchPdf(st, `/api/vehicles/${ids.vDamage}/damage-check-pdf`, 'c7_b.pdf', { textChars: 900 });
    const mk = await st.post('/api/interactive-damage-checks', { reservationId: ids.rDamage, vehicleId: ids.vDamage, checkType: 'pickup', damageItems: [], notes: 'AUDIT-P36D interactive' });
    let c = null;
    if (mk.status === 201 || mk.status === 200) c = await L.fetchPdf(st, `/api/interactive-damage-checks/${mk.json.id}/pdf`, 'c7_c.pdf', { textChars: 900 });
    const sig = (x) => x && (x.allText || '').slice(0, 200);
    return { interactiveCreate: mk.status + ' ' + mk.text.slice(0, 150), a: sig(a), b: sig(b), c: sig(c) };
  });

  console.log('\n===== RESULT =====');
  console.log(JSON.stringify(out, null, 1));
  require('fs').writeFileSync(require('path').join(__dirname, 'p36d-03-transport-dc.out.json'), JSON.stringify(out, null, 1));
  await L.pool.end();
})().catch(async (e) => { console.error('FAILED', e); try { await L.pool.end(); } catch {} process.exit(1); });
