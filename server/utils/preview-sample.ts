import type { Reservation } from "../../shared/schema";

const DAY = 24 * 60 * 60 * 1000;

/**
 * Kees 2026-10-23: the made-up rental a contract template preview is drawn with. Every value
 * a template field can show is filled in (driver, readings at pickup and return, fuel, APK,
 * company), so no placed field stays empty in the preview. Never stored.
 */
export function contractPreviewReservation(now: Date = new Date()): Reservation {
  const start = new Date(now.getTime());
  const end = new Date(now.getTime() + 7 * DAY);
  const apk = new Date(now.getTime() + 200 * DAY);
  return {
    id: 0, // 0 = preview
    vehicleId: 0,
    customerId: 0,
    contractNumber: "VOORBEELD-0001",
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    totalPrice: "750",
    status: "booked",
    notes: "Voorbeeld",
    pickupMileage: 48250,
    returnMileage: 49120,
    fuelLevelPickup: "full",
    fuelLevelReturn: "3/4",
    vehicle: {
      id: 0,
      brand: "Volkswagen",
      model: "Transporter",
      licensePlate: "VB-123-X",
      chassisNumber: "WV1ZZZ7HZPH000001",
      vehicleType: "Bestelbus",
      fuel: "Diesel",
      currentMileage: 48250,
      currentFuelLevel: "full",
      apkDate: apk.toISOString().slice(0, 10),
    },
    customer: {
      id: 0,
      name: "Voorbeeld Klant",
      companyName: "Voorbeeld Transport B.V.",
      streetName: "Voorbeeldstraat",
      houseNumber: "12",
      address: "Voorbeeldstraat 12",
      city: "Zuidland",
      postalCode: "3214 AB",
      phone: "0612345678",
      email: "klant@voorbeeld.nl",
      driverLicenseNumber: "1234567890",
    },
    driver: {
      id: 0,
      displayName: "Jan de Vries",
      firstName: "Jan",
      lastName: "de Vries",
      email: "jan@voorbeeld.nl",
      phone: "0687654321",
      driverLicenseNumber: "5550001234",
      licenseExpiry: new Date(now.getTime() + 900 * DAY).toISOString().slice(0, 10),
    },
    createdAt: now,
    updatedAt: now,
    createdBy: "system",
    updatedBy: null,
  } as unknown as Reservation;
}

/**
 * Lease offertes: the made-up quote a lease quote template preview is drawn with (the Excel
 * case: EUR 466,23 per month, 48 months, 20.000 km). Keys are LEASE_QUOTE_TEMPLATE_SOURCES;
 * every one is filled so no placed field stays empty. Never stored.
 */
export function leaseQuotePreviewData(now: Date = new Date()): Record<string, string> {
  const until = new Date(now.getTime() + 30 * DAY);
  const nl = (d: Date) => `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
  return {
    quoteNumber: "LO-2026-0001",
    quoteDate: nl(now),
    validUntil: nl(until),
    customerName: "Voorbeeld Transport B.V.",
    customerContact: "Jan de Vries",
    customerAddress: "Voorbeeldstraat 12",
    customerPostalCode: "3214 AB",
    customerCity: "Zuidland",
    customerEmail: "klant@voorbeeld.nl",
    vehicleMake: "Volkswagen",
    vehicleModel: "Transporter",
    vehicleTrim: "2.0 TDI L2H1",
    licensePlate: "VB-123-X",
    deliveryTime: "8 weken",
    termMonths: "48",
    kmPerYear: "20.000",
    monthlyPriceExclVat: "\u20AC 466,23",
    excessKmPrice: "\u20AC 0,08 per km",
    shortfallKmPrice: "\u20AC 0,04 per km",
    companyName: "Lam Groep",
  };
}
