import { Router } from 'express';
import { installIdParamValidation } from '../middleware/parseIntParam';
import { maintenanceDatesForVehicles } from '../services/vehicle-notification-recipients.js';
import { db } from '../db.js';
import { vehicles, customers, reservations } from '../../shared/schema.js';
import { eq, isNotNull, and, gte, lte } from 'drizzle-orm';

const router = Router();
// FIX-E (BUG-103): Express param callbacks do not cross a router mount,
// so this router validates its own `:id`-style parameters itself.
installIdParamValidation(router);

// Get vehicles that currently have active reservations
router.get('/', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0]; // Current date in YYYY-MM-DD format
    
    const vehiclesWithReservations = await db
      .select({
        vehicle: vehicles,
        customer: customers,
        reservation: reservations,
      })
      .from(vehicles)
      .innerJoin(reservations, eq(reservations.vehicleId, vehicles.id))
      .innerJoin(customers, eq(customers.id, reservations.customerId))
      .where(
        and(
          isNotNull(customers.email), // Only customers with email
          lte(reservations.startDate, today), // Reservation has started
          gte(reservations.endDate, today)    // Reservation hasn't ended
        )
      );

    // Group by vehicle to avoid duplicates (if a vehicle has multiple overlapping reservations)
    const uniqueVehicles = vehiclesWithReservations.reduce((acc, item) => {
      const existingVehicle = acc.find(v => v.vehicle.id === item.vehicle.id);
      if (!existingVehicle) {
        acc.push(item);
      }
      return acc;
    }, [] as typeof vehiclesWithReservations);

    console.log(`Found ${uniqueVehicles.length} vehicles with active reservations`);
    // D15: the date `{maintenanceDate}` gets in a maintenance mail, so the preview shows what is sent.
    const maintenanceDates = await maintenanceDatesForVehicles(uniqueVehicles.map((item) => item.vehicle));
    res.json(uniqueVehicles.map((item) => ({ ...item, maintenanceDate: maintenanceDates.get(item.vehicle.id) ?? null })));
  } catch (error) {
    console.error('Error fetching vehicles with reservations:', error);
    res.status(500).json({ 
      error: 'Failed to fetch vehicles with reservations',
      // The exception is logged above; its text (relation names, paths) never goes on the wire.
      message: 'Failed to fetch vehicles with reservations',
      code: 'VEHICLES_WITH_RESERVATIONS_FAILED',
    });
  }
});

export default router;