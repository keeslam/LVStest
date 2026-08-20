import { Vehicle, Reservation } from "@shared/schema";

export type VehicleAvailabilityStatus = 'available' | 'rented' | 'scheduled' | 'needs_fixing' | 'not_for_rental';

export interface StatusTransitionResult {
  allowed: boolean;
  newStatus?: VehicleAvailabilityStatus;
  warning?: string;
  error?: string;
}

export interface VehicleStatusContext {
  vehicle: Vehicle;
  activeReservations: Reservation[];
  hasPickedUpReservation: boolean;
  hasBookedReservation: boolean;
  hasMaintenanceBlock: boolean;
  overdueReservations: Reservation[];
}

export function getVehicleStatusContext(
  vehicle: Vehicle,
  allReservations: Reservation[]
): VehicleStatusContext {
  const today = new Date().toISOString().split('T')[0];
  
  const vehicleReservations = allReservations.filter(r => 
    r.vehicleId === vehicle.id && 
    !r.deletedAt &&
    r.status !== 'cancelled' &&
    r.status !== 'completed' &&
    r.status !== 'returned'
  );
  
  // Find overdue reservations: picked_up but past end date (customer still has the car!)
  const overdueReservations = vehicleReservations.filter(r => {
    if (r.type === 'maintenance_block') return false;
    return r.status === 'picked_up' && r.endDate && r.endDate < today;
  });
  
  // Active reservations: currently within date range OR overdue but still picked up
  const activeReservations = vehicleReservations.filter(r => {
    if (r.type === 'maintenance_block') return false;
    const started = r.startDate <= today;
    const notEnded = !r.endDate || r.endDate >= today;
    const isOverduePickedUp = r.status === 'picked_up' && r.endDate && r.endDate < today;
    return (started && notEnded) || isOverduePickedUp;
  });
  
  // Has picked up includes both current and overdue
  const hasPickedUpReservation = activeReservations.some(r => r.status === 'picked_up');
  const hasBookedReservation = activeReservations.some(r => r.status === 'booked');
  
  const hasMaintenanceBlock = vehicleReservations.some(r => {
    if (r.type !== 'maintenance_block') return false;
    const started = r.startDate <= today;
    const notEnded = !r.endDate || r.endDate >= today;
    const activeMaintenanceStatus = r.maintenanceStatus === 'scheduled' || 
                                     r.maintenanceStatus === 'in' || 
                                     r.maintenanceStatus === 'in_service';
    return started && notEnded && activeMaintenanceStatus;
  });
  
  return {
    vehicle,
    activeReservations,
    hasPickedUpReservation,
    hasBookedReservation,
    hasMaintenanceBlock,
    overdueReservations
  };
}

export function validateManualStatusChange(
  currentStatus: VehicleAvailabilityStatus,
  newStatus: VehicleAvailabilityStatus,
  context: VehicleStatusContext
): StatusTransitionResult {
  if (currentStatus === newStatus) {
    return { allowed: true, newStatus };
  }
  
  if (context.hasPickedUpReservation) {
    if (newStatus === 'available') {
      return {
        allowed: false,
        error: `Cannot set vehicle to "available" while it has an active picked-up rental. Please return the vehicle first.`
      };
    }
    if (newStatus === 'needs_fixing') {
      return {
        allowed: true,
        newStatus,
        warning: `Vehicle has an active rental. Setting to "needs fixing" will not affect the current rental, but the vehicle will need attention after return.`
      };
    }
    if (newStatus === 'not_for_rental') {
      return {
        allowed: true,
        newStatus,
        warning: `Vehicle has an active rental. It will be marked as "not for rental" after the current rental ends.`
      };
    }
  }
  
  if (context.hasMaintenanceBlock) {
    if (newStatus === 'available') {
      return {
        allowed: false,
        error: `Cannot set vehicle to "available" while it has an active maintenance block. Please close the maintenance first.`
      };
    }
    if (newStatus === 'not_for_rental') {
      return {
        allowed: true,
        newStatus,
        warning: `Vehicle has active maintenance. It will be marked as "not for rental" after maintenance is complete.`
      };
    }
  }
  
  if (context.hasBookedReservation && (newStatus === 'needs_fixing' || newStatus === 'not_for_rental')) {
    return {
      allowed: true,
      newStatus,
      warning: `Vehicle has upcoming booked reservations. Changing status may require rescheduling those bookings.`
    };
  }
  
  if (newStatus === 'rented' && !context.hasPickedUpReservation) {
    return {
      allowed: false,
      error: `Cannot manually set vehicle to "rented". This status is set automatically when a reservation is picked up.`
    };
  }
  
  if (newStatus === 'scheduled' && !context.hasBookedReservation) {
    return {
      allowed: false,
      error: `Cannot manually set vehicle to "scheduled". This status is set automatically when there are upcoming reservations.`
    };
  }
  
  return { allowed: true, newStatus };
}

export function calculateCorrectStatus(context: VehicleStatusContext): VehicleAvailabilityStatus {
  const currentStatus = (context.vehicle.availabilityStatus || 'available') as VehicleAvailabilityStatus;
  
  if (currentStatus === 'not_for_rental' || currentStatus === 'needs_fixing') {
    return currentStatus;
  }
  
  if (context.hasPickedUpReservation) {
    return 'rented';
  }
  
  if (context.hasMaintenanceBlock) {
    return 'needs_fixing';
  }
  
  if (context.hasBookedReservation) {
    return 'scheduled';
  }
  
  return 'available';
}

export function getStatusOnPickup(
  currentStatus: VehicleAvailabilityStatus
): StatusTransitionResult {
  if (currentStatus === 'not_for_rental') {
    return {
      allowed: false,
      error: `Cannot pickup vehicle that is marked as "not for rental".`
    };
  }
  
  return {
    allowed: true,
    newStatus: 'rented'
  };
}

export function getStatusOnReturn(
  currentStatus: VehicleAvailabilityStatus,
  context: VehicleStatusContext
): StatusTransitionResult {
  if (currentStatus === 'needs_fixing') {
    return {
      allowed: true,
      newStatus: 'needs_fixing',
      warning: `Vehicle will remain as "needs fixing" after return.`
    };
  }
  
  if (currentStatus === 'not_for_rental') {
    return {
      allowed: true,
      newStatus: 'not_for_rental',
      warning: `Vehicle will remain as "not for rental" after return.`
    };
  }
  
  const otherActiveReservations = context.activeReservations.filter(r => r.status === 'picked_up');
  if (otherActiveReservations.length > 1) {
    return {
      allowed: true,
      newStatus: 'rented',
      warning: `Vehicle has other active rentals.`
    };
  }
  
  if (context.hasBookedReservation) {
    return {
      allowed: true,
      newStatus: 'scheduled'
    };
  }
  
  return {
    allowed: true,
    newStatus: 'available'
  };
}

export function getStatusOnMaintenanceStart(
  currentStatus: VehicleAvailabilityStatus
): StatusTransitionResult {
  if (currentStatus === 'rented') {
    return {
      allowed: false,
      error: `Cannot start maintenance on a rented vehicle. Please return the vehicle first or schedule maintenance for after the rental ends.`
    };
  }
  
  return {
    allowed: true,
    newStatus: 'needs_fixing'
  };
}

export function getStatusOnMaintenanceEnd(
  currentStatus: VehicleAvailabilityStatus,
  context: VehicleStatusContext
): StatusTransitionResult {
  if (currentStatus === 'not_for_rental') {
    return {
      allowed: true,
      newStatus: 'not_for_rental'
    };
  }
  
  if (context.hasPickedUpReservation) {
    return {
      allowed: true,
      newStatus: 'rented'
    };
  }
  
  if (context.hasBookedReservation) {
    return {
      allowed: true,
      newStatus: 'scheduled'
    };
  }
  
  return {
    allowed: true,
    newStatus: 'available'
  };
}

export function getStatusOnReservationCancel(
  currentStatus: VehicleAvailabilityStatus,
  context: VehicleStatusContext
): StatusTransitionResult {
  if (currentStatus === 'not_for_rental' || currentStatus === 'needs_fixing') {
    return {
      allowed: true,
      newStatus: currentStatus
    };
  }
  
  if (context.hasPickedUpReservation) {
    return {
      allowed: true,
      newStatus: 'rented'
    };
  }
  
  if (context.hasBookedReservation) {
    return {
      allowed: true,
      newStatus: 'scheduled'
    };
  }
  
  return {
    allowed: true,
    newStatus: 'available'
  };
}

export const VEHICLE_STATUS_LABELS: Record<VehicleAvailabilityStatus, string> = {
  available: 'Available',
  rented: 'Rented',
  scheduled: 'Scheduled',
  needs_fixing: 'Needs Fixing',
  not_for_rental: 'Not for Rental'
};

export const VEHICLE_STATUS_COLORS: Record<VehicleAvailabilityStatus, string> = {
  available: 'bg-green-500',
  rented: 'bg-blue-500',
  scheduled: 'bg-yellow-500',
  needs_fixing: 'bg-orange-500',
  not_for_rental: 'bg-gray-500'
};
