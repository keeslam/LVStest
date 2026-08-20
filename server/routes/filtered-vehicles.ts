import { Router } from 'express';
import { db } from '../db.js';
import { vehicles, customers, reservations, expenses } from '../../shared/schema.js';
import { eq, isNotNull, and, gte, lte, sql, desc, like, or } from 'drizzle-orm';

const router = Router();

// Helper function to calculate date differences in months
function getDateDifferenceInDays(date1: string, date2: string): number {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = d1.getTime() - d2.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// Get filtered vehicles for notifications based on APK and maintenance criteria
router.get('/', async (req, res) => {
  try {
    const { filterType } = req.query;
    const today = new Date().toISOString().split('T')[0];
    
    // Base query for vehicles with active reservations
    const baseVehiclesQuery = db
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

    const vehiclesWithReservations = await baseVehiclesQuery;

    // Remove duplicates
    const uniqueVehicles = vehiclesWithReservations.reduce((acc, item) => {
      const existingVehicle = acc.find(v => v.vehicle.id === item.vehicle.id);
      if (!existingVehicle) {
        acc.push(item);
      }
      return acc;
    }, [] as typeof vehiclesWithReservations);

    let filteredVehicles = uniqueVehicles;

    if (filterType === 'apk') {
      // Filter for APK reminders (overdue, 2 months, 1 month, 14 days)
      filteredVehicles = uniqueVehicles.filter(item => {
        if (!item.vehicle.apkDate) return false;
        
        const daysUntilAPK = getDateDifferenceInDays(item.vehicle.apkDate, today);
        
        // Include overdue APKs and APK expires within 2 months (60 days)
        return (daysUntilAPK <= 60);
      });

      // Sort by expiry date (most urgent first - overdue first, then by days)
      filteredVehicles.sort((a, b) => {
        const daysA = getDateDifferenceInDays(a.vehicle.apkDate!, today);
        const daysB = getDateDifferenceInDays(b.vehicle.apkDate!, today);
        return daysA - daysB;
      });

    } else if (filterType === 'maintenance') {
      // Filter for maintenance reminders (yearly cycle based on last expense)
      const vehicleIds = uniqueVehicles.map(v => v.vehicle.id);
      
      if (vehicleIds.length > 0) {
        // Get the latest maintenance expense for each vehicle
        const latestMaintenanceExpenses = await db
          .select({
            vehicleId: expenses.vehicleId,
            latestDate: sql<string>`MAX(${expenses.date})`.as('latest_date'),
          })
          .from(expenses)
          .where(
            and(
              sql`${expenses.vehicleId} IN (${sql.join(vehicleIds.map(id => sql`${id}`), sql`, `)})`,
              or(
                like(expenses.category, '%maintenance%'),
                like(expenses.category, '%onderhoud%'),
                like(expenses.category, '%service%'),
                like(expenses.category, '%reparatie%'),
                like(expenses.category, '%repair%')
              )
            )
          )
          .groupBy(expenses.vehicleId);

        // Filter vehicles that need maintenance (no maintenance in last year or never had maintenance)
        filteredVehicles = uniqueVehicles.filter(item => {
          const latestMaintenance = latestMaintenanceExpenses.find(
            exp => exp.vehicleId === item.vehicle.id
          );

          if (!latestMaintenance) {
            // Vehicle has never had maintenance recorded
            return true;
          }

          const daysSinceLastMaintenance = getDateDifferenceInDays(today, latestMaintenance.latestDate);
          
          // Vehicle needs maintenance if last maintenance was more than 365 days ago
          return daysSinceLastMaintenance > 365;
        });

        // Add maintenance metadata to filtered vehicles
        filteredVehicles = filteredVehicles.map(item => {
          const latestMaintenance = latestMaintenanceExpenses.find(
            exp => exp.vehicleId === item.vehicle.id
          );
          
          return {
            ...item,
            maintenanceInfo: latestMaintenance ? {
              lastMaintenanceDate: latestMaintenance.latestDate,
              daysSinceLastMaintenance: getDateDifferenceInDays(today, latestMaintenance.latestDate)
            } : {
              lastMaintenanceDate: null,
              daysSinceLastMaintenance: null
            }
          };
        });

        // Sort by urgency (vehicles with oldest maintenance first, never maintained vehicles first)
        filteredVehicles.sort((a, b) => {
          const maintenanceA = latestMaintenanceExpenses.find(exp => exp.vehicleId === a.vehicle.id);
          const maintenanceB = latestMaintenanceExpenses.find(exp => exp.vehicleId === b.vehicle.id);

          if (!maintenanceA && !maintenanceB) return 0;
          if (!maintenanceA) return -1; // A has never been maintained, prioritize
          if (!maintenanceB) return 1;  // B has never been maintained, prioritize

          // Sort by oldest maintenance date
          return new Date(maintenanceA.latestDate).getTime() - new Date(maintenanceB.latestDate).getTime();
        });
      }
    }

    // Add filtering metadata to response
    const responseData = filteredVehicles.map(item => {
      let filterInfo: any = {};

      if (filterType === 'apk' && item.vehicle.apkDate) {
        const daysUntilAPK = getDateDifferenceInDays(item.vehicle.apkDate, today);
        filterInfo = {
          apkDate: item.vehicle.apkDate,
          daysUntilAPK,
          urgencyLevel: daysUntilAPK < 0 ? 'overdue' : daysUntilAPK <= 14 ? 'urgent' : daysUntilAPK <= 30 ? 'warning' : 'notice'
        };
      }

      if (filterType === 'maintenance' && (item as any).maintenanceInfo) {
        const maintenanceInfo = (item as any).maintenanceInfo;
        let urgencyLevel = 'notice';
        
        if (maintenanceInfo.daysSinceLastMaintenance === null) {
          urgencyLevel = 'urgent'; // Never maintained
        } else if (maintenanceInfo.daysSinceLastMaintenance > 730) {
          urgencyLevel = 'overdue'; // > 2 years
        } else if (maintenanceInfo.daysSinceLastMaintenance > 365) {
          urgencyLevel = 'warning'; // > 1 year
        }
        
        filterInfo = {
          lastMaintenanceDate: maintenanceInfo.lastMaintenanceDate,
          daysSinceLastMaintenance: maintenanceInfo.daysSinceLastMaintenance,
          urgencyLevel
        };
      }

      return {
        ...item,
        filterInfo
      };
    });

    console.log(`Found ${filteredVehicles.length} vehicles matching filter: ${filterType || 'none'}`);
    res.json(responseData);

  } catch (error) {
    console.error('Error fetching filtered vehicles:', error);
    res.status(500).json({ 
      error: 'Failed to fetch filtered vehicles',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;