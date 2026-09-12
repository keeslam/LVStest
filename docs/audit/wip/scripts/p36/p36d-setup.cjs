// Phase 14 fixtures: vehicles, customers, reservations, transports, templates, limited user.
'use strict';
const L = require('./p36d-lib.cjs');
const fs = require('fs');
const path = require('path');

(async () => {
  const ids = L.loadIds();
  const st = await L.staff('10.14.1.1');
  const T = L.today();
  const D = (n) => L.addDays(T, n);

  // ---------- vehicles ----------
  const mkVehicle = async (plate, brand, model, extra = {}) => {
    const existing = await L.q('select id from vehicles where license_plate=$1', [plate]);
    if (existing[0]) return existing[0].id;
    const r = await st.post('/api/vehicles', Object.assign({ licensePlate: plate, brand, model, vehicleType: 'sedan', chassisNumber: 'AUDITP36D' + plate.replace(/-/g, ''), fuel: 'Benzine', currentMileage: 12345, productionDate: '2021-01-01', notes: 'AUDIT-P36D fixture' }, extra));
    if (r.status !== 201 && r.status !== 200) throw new Error('vehicle ' + plate + ' -> ' + L.short(r));
    return r.json.id;
  };
  const LONG300 = 'AUDIT-P36D-Brand-' + 'Ab'.repeat(142); // 300 chars
  const LONG300m = 'AUDIT-P36D-Model-' + 'Cd'.repeat(142);
  ids.vNormal = await mkVehicle('AU-3D0-X', 'AUDIT-P36D Brand', 'AUDIT-P36D Model');
  ids.vLong = await mkVehicle('AU-3D1-X', LONG300, LONG300m);
  ids.vSpecial = await mkVehicle('AU-3D2-X', 'Citroën', 'C4 Ë-Ürß € 😀 日本語 <b>bold</b>');
  ids.vDamage = await mkVehicle('AU-3D3-X', 'AUDIT-P36D DC Brand', 'AUDIT-P36D DC Model', { vehicleType: 'van' });
  ids.vTransport1 = await mkVehicle('AU-3D4-X', 'AUDIT-P36D TR Brand', 'AUDIT-P36D TR Model');
  ids.vTransport2 = await mkVehicle('AU-3D5-X', 'AUDIT-P36D TR2 Brand', 'AUDIT-P36D TR2 Model');
  ids.vNoRes = await mkVehicle('AU-3D6-X', 'AUDIT-P36D NoRes Brand', 'AUDIT-P36D NoRes Model');
  ids.vOldRes = await mkVehicle('AU-3D7-X', 'AUDIT-P36D OldRes Brand', 'AUDIT-P36D OldRes Model');
  L.saveIds(ids); L.log('vehicles', { vNormal: ids.vNormal, vLong: ids.vLong, vSpecial: ids.vSpecial, vDamage: ids.vDamage, vTransport1: ids.vTransport1, vTransport2: ids.vTransport2, vNoRes: ids.vNoRes, vOldRes: ids.vOldRes });

  // ---------- customers ----------
  const mkCustomer = async (data) => {
    const existing = await L.q('select id from customers where name like $1 order by id limit 1', [data.name.slice(0,25)+'%']);
    if (existing[0]) return existing[0].id;
    const r = await st.post('/api/customers', data);
    if (r.status !== 201 && r.status !== 200) throw new Error('customer ' + data.name.slice(0, 30) + ' -> ' + L.short(r));
    return r.json.id;
  };
  const NAME500 = 'AUDIT-P36D Long ' + 'Naam '.repeat(97); // 500 chars
  const ADDR1000 = 'AUDIT-P36D Straat ' + '12345 '.repeat(163) + 'x'; // ~1000 chars
  ids.cNormal = await mkCustomer({ name: 'AUDIT-P36D Normal Customer', address: 'Kerkweg 47a', city: 'Zuidland', postalCode: '3214 VC', phone: '0181-451040', driverLicenseNumber: 'NL1234567890', email: 'audit-p36d-normal@example.invalid' });
  ids.cLong = await mkCustomer({ name: NAME500.slice(0, 250), address: ADDR1000.slice(0, 250), city: ('AUDIT-P36D ' + 'Stad'.repeat(60)).slice(0,100), postalCode: '9999 ZZ', phone: '06' + '1'.repeat(30), driverLicenseNumber: 'L'.repeat(40) });
  ids.cSpecial = await mkCustomer({ name: 'AUDIT-P36D Spéçiål Ünïcödé ß € 😀 日本語 مرحبا <script>alert(1)</script> %s {{customer.name}}', address: 'Straße 1 ½ – “quotes” … → <img src=x onerror=alert(1)>', city: 'Ærø', postalCode: '1234 ÄB', phone: '+31 6 ☎ 12345678', driverLicenseNumber: '%d %s %n {{x}}' });
  ids.cEmpty = await mkCustomer({ name: 'AUDIT-P36D Empty Customer' });
  ids.cFirstLast = await mkCustomer({ name: 'AUDIT-P36D FirstLast Customer', firstName: 'AuditFirst', lastName: 'AuditLast', address: 'Dorpsstraat 1', city: 'Dorp', postalCode: '1111 AA' });
  L.saveIds(ids); L.log('customers', { cNormal: ids.cNormal, cLong: ids.cLong, cSpecial: ids.cSpecial, cEmpty: ids.cEmpty, cFirstLast: ids.cFirstLast });

  // ---------- reservations ----------
  const mkRes = async (key, body) => {
    if (ids[key]) return ids[key];
    if (body.notes) { const ex = await L.q('select id from reservations where notes like $1 order by id limit 1', [String(body.notes).slice(0,40)+'%']); if (ex[0]) { ids[key]=ex[0].id; return ids[key]; } }
    const r = await st.post('/api/reservations', body);
    if (r.status !== 201 && r.status !== 200) throw new Error('reservation ' + key + ' -> ' + L.short(r));
    ids[key] = r.json.id;
    return r.json.id;
  };
  await mkRes('rNormal', { vehicleId: ids.vNormal, customerId: ids.cNormal, startDate: D(1), endDate: D(8), totalPrice: 750, notes: 'AUDIT-P36D normal reservation' });
  await mkRes('rLong', { vehicleId: ids.vLong, customerId: ids.cLong, startDate: D(1), endDate: D(8), totalPrice: 1234567.89, notes: 'AUDIT-P36D long ' + 'N'.repeat(20000) });
  await mkRes('rSpecial', { vehicleId: ids.vSpecial, customerId: ids.cSpecial, startDate: D(1), endDate: D(8), totalPrice: 99.5, notes: 'AUDIT-P36D special' });
  await mkRes('rEmpty', { vehicleId: ids.vNormal, customerId: ids.cEmpty, startDate: D(20), endDate: null, notes: 'AUDIT-P36D empty customer, open-ended' });
  await mkRes('rDamage', { vehicleId: ids.vDamage, customerId: ids.cNormal, startDate: D(0), endDate: D(3), totalPrice: 300, notes: 'AUDIT-P36D damage-check reservation' });
  await mkRes('rDamageFL', { vehicleId: ids.vDamage, customerId: ids.cFirstLast, startDate: D(10), endDate: D(12), totalPrice: 200, notes: 'AUDIT-P36D damage-check firstname/lastname' });
  await mkRes('rOld', { vehicleId: ids.vOldRes, customerId: ids.cSpecial, startDate: '2020-01-01', endDate: '2020-01-05', totalPrice: 100, notes: 'AUDIT-P36D old reservation (2020) for damage-check-pdf fallback test' });
  L.saveIds(ids); L.log('reservations', { rNormal: ids.rNormal, rLong: ids.rLong, rSpecial: ids.rSpecial, rEmpty: ids.rEmpty, rDamage: ids.rDamage, rDamageFL: ids.rDamageFL, rOld: ids.rOld });

  // ---------- transports ----------
  const mkTransport = async (key, body) => {
    if (ids[key]) return ids[key];
    if (body.reason) { const ex = await L.q('select id from vehicle_transports where reason like $1 order by id limit 1', [String(body.reason).slice(0,30)+'%']); if (ex[0]) { ids[key]=ex[0].id; return ids[key]; } }
    const r = await st.post('/api/transports', body);
    if (r.status !== 201 && r.status !== 200) throw new Error('transport ' + key + ' -> ' + L.short(r));
    ids[key] = r.json.id;
    return r.json.id;
  };
  await mkTransport('trNormal', { vehicleId: ids.vTransport1, transportType: 'delivery', scheduledDate: D(2), originAddress: 'Kerkweg 47a', originCity: 'Zuidland', destinationAddress: 'Dam 1', destinationCity: 'Amsterdam', distanceKm: 85.5, tollCost: 0, driverName: 'AUDIT-P36D Driver', reason: 'AUDIT-P36D normal transport', notes: 'AUDIT-P36D normal notes', customerId: ids.cNormal, billable: true, billableAmount: 120 });
  await mkTransport('trLong', { vehicleId: ids.vTransport2, transportType: 'tow', scheduledDate: D(3), originAddress: 'AUDIT-P36D ' + 'Lange Straatnaam '.repeat(60), originCity: 'Stad'.repeat(50), destinationAddress: 'B'.repeat(1000), destinationCity: 'C'.repeat(300), driverName: 'D'.repeat(300), reason: 'R'.repeat(2000), notes: 'AUDIT-P36D notes ' + 'lorem ipsum '.repeat(1700), customerId: ids.cLong });
  await mkTransport('trSpecial', { vehicleId: ids.vTransport1, transportType: 'swap', scheduledDate: D(4), spareRequired: true, relatedVehicleId: ids.vTransport2, originAddress: 'Straße “1” – ½ 😀 日本語', originCity: 'Ærø', destinationAddress: '<script>alert(1)</script> %s {{notes}}', destinationCity: 'مرحبا', driverName: 'Chauffeur Ünïcödé 😀', reason: 'Reden → test', notes: 'Notes with emoji 😀 and CJK 日本語 and RTL مرحبا', customerId: ids.cSpecial });
  await mkTransport('trEmpty', { vehicleId: ids.vTransport2, transportType: 'other', scheduledDate: D(5) });
  await mkTransport('trExternal', { isExternalVehicle: true, externalLicensePlate: 'AU-3D8-X', externalBrand: 'AUDIT-P36D Ext Brand', externalModel: 'Ext Model', externalOwnerName: 'AUDIT-P36D Owner', transportType: 'tow', scheduledDate: D(6), originCity: 'A', destinationCity: 'B' });
  L.saveIds(ids); L.log('transports', { trNormal: ids.trNormal, trLong: ids.trLong, trSpecial: ids.trSpecial, trEmpty: ids.trEmpty, trExternal: ids.trExternal });

  // ---------- limited user (view_vehicles only) ----------
  if (!ids.limitedUser) {
    const uname = 'AUDIT-P36D-limited';
    const ex = await L.q('select id from users where username=$1', [uname]);
    if (ex[0]) { ids.limitedUser = ex[0].id; }
    else {
      const r = await st.post('/api/users', { username: uname, password: 'AuditP36D!limited', fullName: 'AUDIT P14 limited', email: 'audit-p36d-limited@example.invalid', role: 'user', permissions: ['view_vehicles'], active: true });
      if (r.status !== 201 && r.status !== 200) throw new Error('user -> ' + L.short(r));
      ids.limitedUser = r.json.id;
    }
  }
  ids.limitedUserName = 'AUDIT-P36D-limited';
  ids.limitedUserPass = 'AuditP36D!limited';

  // ---------- contract PDF templates ----------
  // Editor-shaped payload (client/src/pages/documents/template-editor.tsx:1104-1118): fields JSON-stringified.
  const F = (name, source, x, y, extra = {}) => Object.assign({ id: 'f-' + name.replace(/\W+/g, '-'), name, x, y, fontSize: 10, isBold: false, source, textAlign: 'left', locked: false }, extra);
  const fullFields = [
    F('Klant naam', 'customer.name', 55, 254), F('Klant adres', 'customer.address', 55, 268), F('Postcode', 'customer.postalCode', 55, 282), F('Plaats', 'customer.city', 55, 296),
    F('Telefoon', 'customer.phone', 55, 328), F('Rijbewijs', 'customer.driverLicenseNumber', 100, 358),
    F('Merk', 'vehicle.brand', 55, 150), F('Type', 'vehicle.model', 55, 165), F('Kenteken', 'vehicle.licensePlate', 55, 179), F('Chassis', 'vehicle.chassisNumber', 55, 193),
    F('Van', 'reservation.startDate', 405, 149), F('Tot', 'reservation.endDate', 405, 163), F('Duur', 'reservation.duration', 405, 177), F('Prijs', 'reservation.totalPrice', 405, 236, { isBold: true }),
    F('Contractnr', 'contractNumber', 405, 120), F('Datum', 'contractDate', 138, 637), F('Bestuurder', 'driver.name', 55, 400), F('Bestuurder email', 'driver.email', 55, 414),
    F('Centered', 'customer.name', 297, 700, { textAlign: 'center' }), F('Right', 'customer.name', 540, 720, { textAlign: 'right' }),
  ];
  const mkPdfTemplate = async (key, name, fields, extra = {}) => {
    if (ids[key]) return ids[key];
    { const ex = await L.q('select id from pdf_templates where name=$1', [name]); if (ex[0]) { ids[key]=ex[0].id; return ids[key]; } }
    const r = await st.post('/api/pdf-templates', Object.assign({ name, isDefault: false, backgroundPath: null, fields: JSON.stringify(fields) }, extra));
    if (r.status !== 201) throw new Error('pdf template ' + name + ' -> ' + L.short(r));
    ids[key] = r.json.id;
    return r.json.id;
  };
  await mkPdfTemplate('tplFull', 'AUDIT-P36D full fields', fullFields);
  const invalidFields = [
    F('NegXY', 'customer.name', -50, -50), F('FarOut', 'customer.name', 2000, 2000), F('FontZero', 'customer.name', 55, 500, { fontSize: 0 }), F('Font500', 'vehicle.licensePlate', 55, 520, { fontSize: 500 }),
    F('UnknownDotted', 'foo.bar', 55, 540), F('SHOULD-NOT-PRINT-unknown-plain', 'nonexistentSource', 55, 555), F('Proto', '__proto__', 55, 570), F('VehicleId', 'vehicleId', 55, 585),
    F('StringCoords', 'customer.city', '100', '600'), F('NaNCoords', 'customer.city', 'abc', 'def'), F('NoSource', undefined, 55, 615), F('Page3', 'customer.name', 55, 630, { page: 3 }),
    F('FontNeg', 'customer.postalCode', 55, 645, { fontSize: -12 }), F('FontString', 'customer.postalCode', 55, 660, { fontSize: 'big' }), F('NullField', null, 0, 0), 'just-a-string', 42,
  ];
  try { await mkPdfTemplate('tplInvalid', 'AUDIT-P36D invalid fields', invalidFields); } catch(e) { console.log('tplInvalid REJECTED:', e.message.slice(0,900)); }
  try { await mkPdfTemplate('tplEmpty', 'AUDIT-P36D empty fields', []); } catch(e){ console.log('tplEmpty REJECTED:', e.message.slice(0,300)); }
  await mkPdfTemplate('tplBg', 'AUDIT-P36D background tests', fullFields);
  L.saveIds(ids); L.log('pdf templates', { tplFull: ids.tplFull, tplInvalid: ids.tplInvalid, tplEmpty: ids.tplEmpty, tplBg: ids.tplBg });

  // ---------- transport report template ----------
  const TF = (name, source, x, y, extra = {}) => Object.assign({ id: 'tf-' + name.replace(/\W+/g, '-'), name, x, y, fontSize: 11, isBold: false, source, textAlign: 'left', locked: false }, extra);
  const trFields = [
    TF('Voertuig', 'lblVoertuig', 40, 40, { fontSize: 18, isBold: true }), TF('Kenteken', 'lblKenteken', 40, 70), TF('Vervangend', 'lblVervangendVoertuig', 40, 90), TF('VervKenteken', 'lblVervangendKenteken', 40, 110),
    TF('Type', 'lblType', 40, 130), TF('Status', 'lblStatus', 40, 150), TF('Datum', 'lblDatum', 40, 170), TF('Van', 'lblVan', 40, 190), TF('Naar', 'lblNaar', 40, 210), TF('Afstand', 'lblAfstand', 40, 230),
    TF('Chauffeur', 'lblChauffeur', 40, 250), TF('Reden', 'lblReden', 40, 270), TF('Notities', 'lblNotities', 40, 290), TF('Klant', 'lblKlant', 40, 310), TF('Eigenaar', 'lblEigenaar', 40, 330), TF('Bedrag', 'lblBedrag', 40, 350),
    TF('Gegenereerd', 'lblGegenereerd', 40, 800, { fontSize: 8 }), TF('RawNotes', 'notes', 40, 380), TF('Unknown', 'doesNotExist', 40, 400), TF('NoSource', undefined, 40, 420), TF('BigFont', 'licensePlate', 40, 450, { fontSize: 200 }), TF('Neg', 'licensePlate', -100, -100),
  ];
  if (!ids.trTpl) {
    const r = await st.post('/api/transport-report-templates', { name: 'AUDIT-P36D transport template', isDefault: false, fields: trFields });
    if (r.status !== 201) { console.log('transport template REJECTED', L.short(r,600)); } else
    ids.trTpl = r.json.id;
  }

  // ---------- damage check template (canvas) ----------
  const CF = (id, type, x, y, name, extra = {}) => Object.assign({ id, type, x, y, name, fontSize: 11, isBold: false, textAlign: 'left' }, extra);
  const dcFields = [
    CF('t1', 'text', 40, 120, 'AUDIT-P36D Schadecheck', { fontSize: 16, isBold: true }),
    CF('d1', 'dynamic', 40, 150, 'Kenteken', { source: 'licensePlate' }), CF('d2', 'dynamic', 200, 150, 'Merk', { source: 'brand' }), CF('d3', 'dynamic', 360, 150, 'Model', { source: 'model' }),
    CF('d4', 'dynamic', 40, 170, 'Bouwjaar', { source: 'buildYear' }), CF('d5', 'dynamic', 200, 170, 'Brandstof', { source: 'fuel' }), CF('d6', 'dynamic', 360, 170, 'KM', { source: 'currentMileage' }),
    CF('d7', 'dynamic', 40, 190, 'Klant', { source: 'customerName' }), CF('d8', 'dynamic', 300, 190, 'Contract', { source: 'contractNumber' }),
    CF('d9', 'dynamic', 40, 210, 'Start', { source: 'startDate' }), CF('d10', 'dynamic', 200, 210, 'Eind', { source: 'endDate' }), CF('d11', 'dynamic', 360, 210, 'Dagen', { source: 'rentalDays' }),
    CF('d12', 'dynamic', 40, 230, 'Datum', { source: 'currentDate' }), CF('d13', 'dynamic', 200, 230, 'Inspecteur', { source: 'inspectorName' }), CF('d14', 'dynamic', 40, 250, 'Notities', { source: 'notes' }),
    CF('d15', 'dynamic', 40, 270, 'Unknown', { source: 'doesNotExist' }),
    CF('i1', 'inspection', 40, 300, 'Binnenzijde auto', { damageTypes: ['schoon', 'vuil'] }), CF('i2', 'inspection', 300, 300, 'Ruitschade', { damageTypes: ['ja', 'nee'] }),
    CF('c1', 'checkbox', 40, 340, 'Verlichting'), CF('c2', 'checkbox', 200, 340, 'Kentekenpapieren'), CF('c3', 'checkbox', 360, 340, ''), CF('t2', 'text', 380, 340, 'Olie - water'),
    CF('t3', 'text', 40, 370, 'Matten'), CF('t4', 'text', 120, 370, 'aanwezig / niet aanwezig'),
    CF('dg', 'diagram', 40, 400, 'Diagram', { width: 500, height: 250 }),
    CF('s1', 'signature', 40, 680, 'Handtekening verhuurder', { width: 220, height: 50 }), CF('s2', 'signature', 320, 680, 'Handtekening huurder', { width: 220, height: 50 }),
    CF('l1', 'line', 40, 750, '', { width: 500, height: 1 }), CF('b1', 'box', 40, 760, '', { width: 500, height: 60 }),
    CF('p2', 'text', 40, 120, 'AUDIT-P36D pagina 2 tekst', { page: 2 }), CF('p2d', 'dynamic', 40, 150, 'Notities p2', { source: 'notes', page: 2 }),
  ];
  const mkDcTemplate = async (key, body) => {
    if (ids[key]) return ids[key];
    const r = await st.post('/api/damage-check-templates', body);
    if (r.status !== 201) { console.log('dc template '+key+' REJECTED', L.short(r,900)); return null; }
    ids[key] = r.json.id;
    return r.json.id;
  };
  await mkDcTemplate('dcTpl', { name: 'AUDIT-P36D damage check template', description: 'AUDIT-P36D', vehicleMake: 'AUDIT-P36D DC Brand', vehicleModel: 'AUDIT-P36D DC Model', vehicleType: null, isDefault: false, language: 'nl', canvasFields: dcFields, headerText: 'AUDIT-P36D header text', footerText: 'AUDIT-P36D footer text' });
  L.saveIds(ids); L.log('templates', { trTpl: ids.trTpl, dcTpl: ids.dcTpl });

  L.saveIds(ids);
  console.log('\nIDS SAVED', JSON.stringify(ids));
  await L.pool.end();
})().catch(async (e) => { console.error('SETUP FAILED', e); try { await L.pool.end(); } catch {} process.exit(1); });
