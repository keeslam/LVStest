import { queryClient, scheduleInvalidation } from "./queryClient";

/**
 * Invalidate vehicle-related data.
 * Marks matching queries stale and refetches the ones currently on screen.
 * Inactive queries refetch automatically on next mount.
 */
export function invalidateVehicleData(vehicleId?: number) {
  scheduleInvalidation((key) => {
    if (key.startsWith('/api/vehicles')) return true;
    if (vehicleId && key.includes(`/${vehicleId}`)) return true;

    return false;
  });
}

/**
 * Invalidate reservation-related data.
 * Mounted views update immediately after a save.
 */
export function invalidateReservationData(reservationId?: number, vehicleId?: number) {
  scheduleInvalidation((key) => {
    if (key.startsWith('/api/reservations')) return true;
    if (key.startsWith('/api/placeholder-reservations')) return true;
    if (reservationId && key.includes(`/${reservationId}`)) return true;
    if (vehicleId && key.includes(`/${vehicleId}`)) return true;

    return false;
  });
}

/**
 * Invalidate customer-related data.
 */
export function invalidateCustomerData(customerId?: number) {
  scheduleInvalidation((key) => {
    if (key.startsWith('/api/customers')) return true;
    if (customerId && key.includes(`/${customerId}`)) return true;

    return false;
  });
}

/**
 * Invalidate expense-related data.
 */
export function invalidateExpenseData(expenseId?: number, vehicleId?: number) {
  scheduleInvalidation((key) => {
    if (key.startsWith('/api/expenses')) return true;
    if (expenseId && key.includes(`/${expenseId}`)) return true;
    if (vehicleId && key.includes(`/vehicle/${vehicleId}`)) return true;

    return false;
  });
}

/**
 * Invalidate document-related data.
 */
export function invalidateDocumentData(documentId?: number, vehicleId?: number) {
  scheduleInvalidation((key) => {
    if (key.startsWith('/api/documents')) return true;
    if (documentId && key.includes(`/${documentId}`)) return true;
    if (vehicleId && key.includes(`/vehicle/${vehicleId}`)) return true;

    return false;
  });
}

/**
 * Invalidate notification-related data.
 */
export function invalidateNotificationData(notificationId?: number) {
  scheduleInvalidation((key) => {
    if (key.startsWith('/api/notifications')) return true;
    if (key.startsWith('/api/custom-notifications')) return true;
    if (notificationId && key.includes(`/${notificationId}`)) return true;

    return false;
  });
}

/**
 * Force refetch of active list queries (for explicit user refresh actions only).
 * This should only be called when user explicitly requests a refresh.
 */
export function forceRefreshLists() {
  queryClient.refetchQueries({
    predicate: (query) => {
      const key = query.queryKey[0];
      if (typeof key !== 'string') return false;

      return key === '/api/vehicles' ||
             key === '/api/reservations' ||
             key === '/api/customers' ||
             key === '/api/expenses';
    },
    type: 'active'
  });
}

/**
 * Invalidate all related data - use sparingly as it can cause UI disruption.
 * Prefer specific invalidation functions instead.
 */
export function invalidateAllRelatedData() {
  scheduleInvalidation((key) => {
    return key.startsWith('/api/vehicles') ||
           key.startsWith('/api/reservations') ||
           key.startsWith('/api/customers') ||
           key.startsWith('/api/expenses') ||
           key.startsWith('/api/placeholder-reservations');
  });
}
