// P36 agent A helper: rotating admin sessions so one account's 1000/15min
// apiLimiter bucket (keyed per user) does not stop a long probe run.
const { Session } = require('./lib.cjs');
const F = require('./a-fixtures.json');
const ACCOUNTS = ['p36a_adm1', 'p36a_adm2', 'p36a_adm3', 'p36a_adm4', 'p36a_adm5', 'p36a_adm6'];
let idx = 0;
async function admin(ip) {
  const name = ACCOUNTS[idx++ % ACCOUNTS.length];
  const s = new Session(name, { fakeIp: ip || '10.36.9.' + (1 + (idx % 200)) });
  const r = await s.loginStaff(name, 'admin123');
  if (r.status !== 200) throw new Error('login failed for ' + name + ': ' + r.status + ' ' + r.text.slice(0, 120));
  s.who = name;
  return s;
}
let n = 0;
const tag = () => (++n) + '-' + F.ts.slice(-4);
async function veh(a, t, extra) {
  const r = await a.post('/api/vehicles', Object.assign({ licensePlate: 'P36A' + t + tag(), brand: 'AUDIT-P36A', model: t }, extra || {}));
  if (r.status !== 201) throw new Error('veh create ' + r.status + ' ' + r.text.slice(0, 200));
  return r.json.id;
}
async function res(a, v, s, e, extra) {
  const r = await a.post('/api/reservations', Object.assign({ vehicleId: v, customerId: F.c1, startDate: s, endDate: e, type: 'standard' }, extra || {}));
  if (r.status !== 201) throw new Error('res create ' + r.status + ' ' + r.text.slice(0, 200));
  return r.json.id;
}
const PU = (cn, extra) => Object.assign({ contractNumber: cn, pickupMileage: 100, fuelLevelPickup: 'full', shiftStartDate: true }, extra || {});
const R = (l, v) => console.log('[' + l + '] ' + v);
module.exports = { admin, veh, res, PU, R, F, TS: F.ts };
