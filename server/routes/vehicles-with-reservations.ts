import { Router } from 'express';
import { db } from '../db.js';
import { vehicles, customers, reservations } from '../../shared/schema.js';
import { eq, isNotNull, and, gte, lte } from 'drizzle-orm';

const router = Router();

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
    res.json(uniqueVehicles);
  } catch (error) {
    console.error('Error fetching vehicles with reservations:', error);
    res.status(500).json({ 
      error: 'Failed to fetch vehicles with reservations',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;