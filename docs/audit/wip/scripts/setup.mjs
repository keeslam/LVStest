import { api, trim } from './api.mjs';

async function main() {
  const vehicles = [
    { licensePlate: 'AU-RSV-001', brand: 'AUDIT-Brand', model: 'RSV-Main1', vehicleType: 'car', currentMileage: 10000 },
    { licensePlate: 'AU-RSV-002', brand: 'AUDIT-Brand', model: 'RSV-Main2', vehicleType: 'car', currentMileage: 5000 },
    { licensePlate: 'AU-RSV-003', brand: 'AUDIT-Brand', model: 'RSV-Conflict', vehicleType: 'car', currentMileage: 8000 },
    { licensePlate: 'AU-RSV-004', brand: 'AUDIT-Brand', model: 'RSV-Race', vehicleType: 'car', currentMileage: 1000 },
    { licensePlate: 'AU-RSV-005', brand: 'AUDIT-Brand', model: 'RSV-Status', vehicleType: 'car', currentMileage: 2000 },
    { licensePlate: 'AU-RSV-006', brand: 'AUDIT-Brand', model: 'RSV-Blacklist', vehicleType: 'car', currentMileage: 3000 },
    { licensePlate: 'AU-RSV-007', brand: 'AUDIT-Brand', model: 'RSV-NotForRental', vehicleType: 'car', currentMileage: 4000 },
    { licensePlate: 'AU-RSV-008', brand: 'AUDIT-Brand', model: 'RSV-NeedsFixing', vehicleType: 'car', currentMileage: 4500 },
    { licensePlate: 'AU-RSV-009', brand: 'AUDIT-Brand', model: 'RSV-Maint', vehicleType: 'car', currentMileage: 4600 },
    { licensePlate: 'AU-RSV-010', brand: 'AUDIT-Brand', model: 'RSV-PickupReturn', vehicleType: 'car', currentMileage: 20000 },
    { licensePlate: 'AU-RSV-011', brand: 'AUDIT-Brand', model: 'RSV-Edit', vehicleType: 'car', currentMileage: 12000 },
    { licensePlate: 'AU-RSV-012', brand: 'AUDIT-Brand', model: 'RSV-Delete', vehicleType: 'car', currentMileage: 13000 },
    { licensePlate: 'AU-RSV-013', brand: 'AUDIT-Brand', model: 'RSV-Sequence', vehicleType: 'car', currentMileage: 14000 },
    { licensePlate: 'AU-RSV-014', brand: 'AUDIT-Brand', model: 'RSV-Overdue', vehicleType: 'car', currentMileage: 15000 },
    { licensePlate: 'AU-RSV-015', brand: 'AUDIT-Brand', model: 'RSV-ContractRace', vehicleType: 'car', currentMileage: 16000 },
  ];
  const vehicleIds = {};
  for (const v of vehicles) {
    const r = await api('POST', '/api/vehicles', v);
    console.log(v.licensePlate, r.status, trim(r.json, 200));
    if (r.status === 201) vehicleIds[v.licensePlate] = r.json.id;
  }

  const customers = [
    { name: 'AUDIT-RSV-Customer-A' },
    { name: 'AUDIT-RSV-Customer-B' },
    { name: 'AUDIT-RSV-Customer-Blacklist' },
  ];
  const customerIds = {};
  for (const c of customers) {
    const r = await api('POST', '/api/customers', c);
    console.log(c.name, r.status, trim(r.json, 200));
    if (r.status === 201) customerIds[c.name] = r.json.id;
  }

  console.log('VEHICLE_IDS', JSON.stringify(vehicleIds, null, 2));
  console.log('CUSTOMER_IDS', JSON.stringify(customerIds, null, 2));
}
main();
