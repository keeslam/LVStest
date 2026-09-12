const { admin, veh, R } = require('./a-lib.cjs');
(async () => {
  const a = await admin();
  const v = await veh(a, 'B37');
  const b1 = await a.post('/api/reservations', { vehicleId: v, type: 'maintenance_block', startDate: '2028-11-01', endDate: '2028-11-10' });
  R('037 block1', b1.status + ' id=' + b1.json.id);
  const b2 = await a.post('/api/reservations', { vehicleId: v, type: 'maintenance_block', startDate: '2028-11-05', endDate: '2028-11-08' });
  R('037 block2 status', b2.status);
  R('037 block2 keys', Object.keys(b2.json || {}).join(','));
  R('037 block2 warnings', JSON.stringify(b2.json && b2.json.warnings));
  R('037 block2 full tail', b2.text.slice(-700));
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
