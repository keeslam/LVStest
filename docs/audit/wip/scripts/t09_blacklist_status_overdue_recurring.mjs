import { api, trim } from './api.mjs';
import { CUSTOMER_IDS } from './ids.mjs';

function log(label, r) {
  console.log(`\n== ${label} ==`);
  console.log('status:', r.status);
  console.log('body:', trim(r.json ?? r.text, 500));
}

async function main() {
  const VBlacklist = 1687; // "blacklist" vehicle
  const VNotForRental = 1688;
  const VNeedsFixing = 1689;
  const VOverdue = 1695;
  const VRecurring = 1686; // reuse "status" vehicle (already has some old reservations, fine, use new dates)

  // --- Blacklist ---
  log('create blacklist entry (vehicle+customer)', await api('POST', `/api/vehicles/${VBlacklist}/blacklist`, {
    customerId: CUSTOMER_IDS.blacklist, reason: 'AUDIT-blacklist-reason'
  }));
  log('POST reservation for blacklisted pair (expect 409)', await api('POST', '/api/reservations', {
    vehicleId: VBlacklist, customerId: CUSTOMER_IDS.blacklist, startDate: '2029-02-01', endDate: '2029-02-05', notes: 'AUDIT-blacklist-attempt'
  }));

  // Create a normal reservation then try to bypass blacklist via PATCH (change customer to blacklisted one)
  const normalRes = await api('POST', '/api/reservations', { vehicleId: VBlacklist, customerId: CUSTOMER_IDS.a, startDate: '2029-03-01', endDate: '2029-03-05', notes: 'AUDIT-blacklist-bypass-setup' });
  log('create normal reservation on blacklist vehicle w/ non-blacklisted customer', normalRes);
  const bypassId = normalRes.json?.id;
  if (bypassId) {
    log('PATCH full: change customer to blacklisted one (bypass attempt)', await api('PATCH', `/api/reservations/${bypassId}`, { customerId: CUSTOMER_IDS.blacklist }));
  }

  // --- not_for_rental / needs_fixing bookable? ---
  log('PATCH vehicle to not_for_rental', await api('PATCH', `/api/vehicles/${VNotForRental}`, { availabilityStatus: 'not_for_rental' }));
  log('POST reservation on not_for_rental vehicle', await api('POST', '/api/reservations', {
    vehicleId: VNotForRental, customerId: CUSTOMER_IDS.a, startDate: '2029-04-01', endDate: '2029-04-05', notes: 'AUDIT-notforrental-booking'
  }));

  log('PATCH vehicle to needs_fixing', await api('PATCH', `/api/vehicles/${VNeedsFixing}`, { availabilityStatus: 'needs_fixing' }));
  log('POST reservation on needs_fixing vehicle', await api('POST', '/api/reservations', {
    vehicleId: VNeedsFixing, customerId: CUSTOMER_IDS.a, startDate: '2029-05-01', endDate: '2029-05-05', notes: 'AUDIT-needsfixing-booking'
  }));

  // Also test /api/vehicles/available for whether it correctly excludes these
  log('GET /api/vehicles/available for not_for_rental period', await api('GET', `/api/vehicles/available?startDate=2029-04-01&endDate=2029-04-05`));

  // --- Overdue ---
  const overdueRes = await api('POST', '/api/reservations', { vehicleId: VOverdue, customerId: CUSTOMER_IDS.a, startDate: '2026-08-01', endDate: '2026-08-05', notes: 'AUDIT-overdue-setup' });
  log('create reservation for overdue test', overdueRes);
  const overdueId = overdueRes.json?.id;
  if (overdueId) {
    log('pickup the reservation (status->picked_up, end date in past)', await api('POST', `/api/reservations/${overdueId}/pickup`, {
      contractNumber: 'AUDIT-CN-OVERDUE', pickupMileage: 15500, fuelLevelPickup: 'full'
    }));
  }
  log('GET /api/reservations/overdue', await api('GET', '/api/reservations/overdue'));

  // --- Recurring ---
  log('create reservation with isRecurring true', await api('POST', '/api/reservations', {
    vehicleId: VRecurring, customerId: CUSTOMER_IDS.a, startDate: '2029-06-01', endDate: '2029-06-05',
    isRecurring: true, recurringFrequency: 'weekly', notes: 'AUDIT-recurring-test'
  }));
}
main();
