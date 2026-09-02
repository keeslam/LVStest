import { storage } from "../storage";
import type { Vehicle } from "../../shared/schema";
import {
  computeServiceDue,
  serviceDueDefaultsFromSettings,
  type ServiceDueInfo,
} from "../../shared/service-due";

export const SERVICE_DUE_NOTIFICATION_TYPE = "service_due";

/** Tag embedded in the notification description so one vehicle has one notification */
export function serviceDueTag(vehicleId: number): string {
  return `[service:${vehicleId}]`;
}

export interface ServiceDueVehicle extends Vehicle {
  serviceDue: ServiceDueInfo;
}

export interface ServiceDueScanResult {
  scanned: number;
  due: number;
  dueSoon: number;
  notificationsCreated: number;
  notificationsRemoved: number;
}

/**
 * Vehicles whose regular service is overdue or inside the reminder window.
 * Honours the maintenance-calendar exclusions (availability statuses that
 * never get reminders) and skips vehicles already in the workshop.
 */
export async function getServiceDueVehicles(): Promise<ServiceDueVehicle[]> {
  const settings = await storage.getSettings();
  const defaults = serviceDueDefaultsFromSettings(settings);
  const excludedStatuses = settings?.maintenanceExcludedStatuses || ["not_for_rental"];
  const vehicles = await storage.getAllVehicles();

  const result: ServiceDueVehicle[] = [];
  for (const vehicle of vehicles) {
    if (excludedStatuses.includes(vehicle.availabilityStatus || "available")) continue;
    if (vehicle.maintenanceStatus === "in_service") continue;
    const serviceDue = computeServiceDue(vehicle, defaults);
    if (serviceDue.isServiceDue || serviceDue.isServiceDueSoon) {
      result.push({ ...vehicle, serviceDue });
    }
  }
  return result;
}

function describe(vehicle: ServiceDueVehicle): { title: string; description: string; priority: string } {
  const { serviceDue } = vehicle;
  const label = `${vehicle.licensePlate} (${vehicle.brand} ${vehicle.model})`;
  const parts: string[] = [];
  if (serviceDue.daysUntilService !== null) {
    parts.push(
      serviceDue.daysUntilService <= 0
        ? `datum ${Math.abs(serviceDue.daysUntilService)} dag(en) verstreken`
        : `over ${serviceDue.daysUntilService} dag(en)`,
    );
  }
  if (serviceDue.kmUntilService !== null) {
    parts.push(
      serviceDue.kmUntilService <= 0
        ? `${Math.abs(serviceDue.kmUntilService).toLocaleString("nl-NL")} km over de beurt`
        : `nog ${serviceDue.kmUntilService.toLocaleString("nl-NL")} km`,
    );
  }
  const title = serviceDue.isServiceDue
    ? `Onderhoudsbeurt nodig: ${vehicle.licensePlate}`
    : `Onderhoudsbeurt binnenkort: ${vehicle.licensePlate}`;
  const description = `${label}: ${parts.join(", ")} ${serviceDueTag(vehicle.id)}`;
  return { title, description, priority: serviceDue.isServiceDue ? "high" : "normal" };
}

/**
 * Nightly job: keeps exactly one "service_due" notification per vehicle that
 * needs (or soon needs) a service, updates it when the figures change, and
 * removes it once the service has been logged (lastServiceDate/Mileage move)
 * or reminders are switched off in the settings.
 */
export async function scanVehiclesForServiceDue(): Promise<ServiceDueScanResult> {
  const settings = await storage.getSettings();
  const existing = await storage.getCustomNotificationsByType(SERVICE_DUE_NOTIFICATION_TYPE);
  const existingByVehicle = new Map<number, (typeof existing)[number]>();
  for (const n of existing) {
    const m = /\[service:(\d+)\]/.exec(n.description || "");
    if (m) existingByVehicle.set(Number(m[1]), n);
  }

  const result: ServiceDueScanResult = { scanned: 0, due: 0, dueSoon: 0, notificationsCreated: 0, notificationsRemoved: 0 };

  if (settings && settings.showServiceReminders === false) {
    for (const vehicleId of existingByVehicle.keys()) {
      result.notificationsRemoved += await storage.deleteNotificationsByTypeAndPattern(SERVICE_DUE_NOTIFICATION_TYPE, serviceDueTag(vehicleId));
    }
    return result;
  }

  const dueVehicles = await getServiceDueVehicles();
  result.scanned = (await storage.getAllVehicles()).length;
  const stillDue = new Set<number>();
  const today = new Date().toISOString().slice(0, 10);

  for (const vehicle of dueVehicles) {
    stillDue.add(vehicle.id);
    if (vehicle.serviceDue.isServiceDue) result.due++; else result.dueSoon++;
    const { title, description, priority } = describe(vehicle);
    const current = existingByVehicle.get(vehicle.id);
    if (current && current.title === title && current.description === description) continue;
    if (current) {
      result.notificationsRemoved += await storage.deleteNotificationsByTypeAndPattern(SERVICE_DUE_NOTIFICATION_TYPE, serviceDueTag(vehicle.id));
    }
    await storage.createCustomNotification({
      title,
      description,
      date: today,
      type: SERVICE_DUE_NOTIFICATION_TYPE,
      isRead: false,
      link: "/maintenance",
      icon: "Wrench",
      priority,
      userId: null,
    });
    result.notificationsCreated++;
  }

  for (const vehicleId of existingByVehicle.keys()) {
    if (!stillDue.has(vehicleId)) {
      result.notificationsRemoved += await storage.deleteNotificationsByTypeAndPattern(SERVICE_DUE_NOTIFICATION_TYPE, serviceDueTag(vehicleId));
    }
  }

  return result;
}
