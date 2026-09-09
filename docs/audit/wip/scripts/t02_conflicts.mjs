import { api, trim } from './api.mjs';
import { VEHICLE_IDS, CUSTOMER_IDS } from './ids.mjs';

function log(label, r) {
  console.log(`\n== ${label} ==`);
  console.log('status:', r.status);
  console.log('body:', trim(r.json ?? r.text, 600));
}

async function main() {
  const V = VEHICLE_IDS.conflict;

  // base booking
  const base = await api('POST', '/api/reservations', {
    vehicleId: V, customerId: CUSTOMER_IDS.a, startDate: '2026-10-01', endDate: '2026-10-10', notes: 'AUDIT-conflict-base'
  });
  log('base booking', base);

  // overlapping booking, same vehicle
  log('overlapping booking (2026-10-05 to 2026-10-08)', await api('POST', '/api/reservations', {
    vehicleId: V, customerId: CUSTOMER_IDS.b, startDate: '2026-10-05', endDate: '2026-10-08', notes: 'AUDIT-overlap'
  }));

  // check-conflicts for the same overlap
  log('check-conflicts for overlap', await api('GET', `/api/reservations/check-conflicts?vehicleId=${V}&startDate=2026-10-05&endDate=2026-10-08`));

  // same-day turnover without times: A ends 10th, B starts 10th (no times)
  log('same-day turnover, no times (start=2026-10-10)', await api('POST', '/api/reservations', {
    vehicleId: V, customerId: CUSTOMER_IDS.b, startDate: '2026-10-10', endDate: '2026-10-15', notes: 'AUDIT-sameday-turnover-notimes'
  }));

  log('check-conflicts for same-day turnover no times', await api('GET', `/api/reservations/check-conflicts?vehicleId=${V}&startDate=2026-10-10&endDate=2026-10-15`));

  // Reset: create a fresh base with times, for testing same-day turnover WITH times
  const base2 = await api('POST', '/api/reservations', {
    vehicleId: V, customerId: CUSTOMER_IDS.a, startDate: '2026-11-01', endDate: '2026-11-10', startTime: '09:00', endTime: '12:00', notes: 'AUDIT-conflict-base2-times'
  });
  log('base2 with times', base2);

  // same-day turnover WITH times that do NOT overlap (new starts after old ends)
  log('same-day turnover, times non-overlapping (new start 13:00 after old end 12:00)', await api('POST', '/api/reservations', {
    vehicleId: V, customerId: CUSTOMER_IDS.b, startDate: '2026-11-10', endDate: '2026-11-15', startTime: '13:00', endTime: '17:00', notes: 'AUDIT-sameday-turnover-times-nonoverlap'
  }));

  // same-day turnover WITH times that DO overlap (new starts before old ends)
  log('same-day turnover, times overlapping (new start 11:00, before old end 12:00)', await api('POST', '/api/reservations', {
    vehicleId: V, customerId: CUSTOMER_IDS.b, startDate: '2026-11-10', endDate: '2026-11-20', startTime: '11:00', endTime: '17:00', notes: 'AUDIT-sameday-turnover-times-overlap'
  }));

  log('check-conflicts for overlapping times case', await api('GET', `/api/reservations/check-conflicts?vehicleId=${V}&startDate=2026-11-10&endDate=2026-11-20&startTime=11:00&endTime=17:00`));

  // Maintenance block overlap test: create a maintenance_block reservation, then try overlapping standard rental
  const maintBlock = await api('POST', '/api/reservations', {
    vehicleId: V, type: 'maintenance_block', startDate: '2026-12-01', endDate: '2026-12-10', notes: 'AUDIT-maint-block'
  });
  log('maintenance_block create', maintBlock);

  log('standard rental overlapping maintenance block (expect allowed by design)', await api('POST', '/api/reservations', {
    vehicleId: V, customerId: CUSTOMER_IDS.a, startDate: '2026-12-03', endDate: '2026-12-06', notes: 'AUDIT-overlap-with-maintblock'
  }));

  log('check-conflicts during maintenance block period', await api('GET', `/api/reservations/check-conflicts?vehicleId=${V}&startDate=2026-12-03&endDate=2026-12-06`));

  // another maintenance_block overlapping the first maintenance block -> should conflict (maint vs maint)
  log('second maintenance_block overlapping first (expect conflict)', await api('POST', '/api/reservations', {
    vehicleId: V, type: 'maintenance_block', startDate: '2026-12-05', endDate: '2026-12-08', notes: 'AUDIT-maint-block-2'
  }));
}
main();
