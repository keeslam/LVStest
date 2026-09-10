const { Jar, req, loginStaff, csrfHeader, dump } = require('./sr-lib.cjs');
const fs = require('fs');
const path = require('path');

const IMG_PAYLOAD = '<img src=x onerror=alert(1)>';
const SCRIPT_PAYLOAD = "<script>document.title='xss'</script>";
const SVG_PAYLOAD = '"><svg onload=alert(2)>';
const A_PAYLOAD = '<a href="javascript:alert(3)">click</a>';

(async () => {
  const jar = new Jar();
  await loginStaff(jar);
  const out = {};

  // --- Customer with XSS name + notes ---
  let csrf = await csrfHeader(jar);
  const custRes = await req(jar, 'POST', '/api/customers', {
    headers: { 'X-CSRF-Token': csrf },
    json: {
      name: `AUDIT-${IMG_PAYLOAD}`,
      notes: `AUDIT-${SCRIPT_PAYLOAD}`,
      email: 'audit-xss-customer@example.com',
      phone: '0600000000',
      debtorNumber: `AUDIT-XSS-${Date.now()}`,
    },
  });
  out['create customer with XSS name/notes'] = { status: custRes.status, body: custRes.text.slice(0, 1000) };
  let customerId = null;
  try { customerId = JSON.parse(custRes.text).id; } catch {}
  out['customerId'] = customerId;

  if (customerId) {
    const getCust = await req(jar, 'GET', `/api/customers/${customerId}`);
    out['GET customer JSON (raw storage check)'] = { status: getCust.status, body: getCust.text.slice(0, 800) };
  }

  // --- Vehicle with XSS brand ---
  csrf = await csrfHeader(jar);
  const plate = `AU-${Date.now() % 100000}-X`;
  const vehRes = await req(jar, 'POST', '/api/vehicles', {
    headers: { 'X-CSRF-Token': csrf },
    json: {
      brand: `AUDIT-${SVG_PAYLOAD}`,
      model: 'AUDIT-XSS-Model',
      licensePlate: plate,
      availabilityStatus: 'available',
    },
  });
  out['create vehicle with XSS brand'] = { status: vehRes.status, body: vehRes.text.slice(0, 1000) };
  let vehicleId = null;
  try { vehicleId = JSON.parse(vehRes.text).id; } catch {}
  out['vehicleId'] = vehicleId;
  if (vehicleId) {
    const getVeh = await req(jar, 'GET', `/api/vehicles/${vehicleId}`);
    out['GET vehicle JSON (raw storage check)'] = { status: getVeh.status, body: getVeh.text.slice(0, 800) };
  }

  fs.writeFileSync(path.join(__dirname, 'check3-ids.json'), JSON.stringify({ customerId, vehicleId, plate }, null, 2));

  console.log(dump(out));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
