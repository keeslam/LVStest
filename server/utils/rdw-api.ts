/**
 * RDW API client for interacting with the Dutch Vehicle Authority API
 */

import { InsertVehicle } from "../../shared/schema";
import { format } from 'date-fns';

/**
 * Custom error classes for RDW API failures
 */
export class RDWNotFoundError extends Error {
  code = 'NOT_FOUND';
  constructor(licensePlate: string) {
    super(`No vehicle data found for license plate: ${licensePlate}`);
    this.name = 'RDWNotFoundError';
  }
}

export class RDWTimeoutError extends Error {
  code = 'TIMEOUT';
  constructor() {
    super('RDW API request timed out');
    this.name = 'RDWTimeoutError';
  }
}

export class RDWUpstreamError extends Error {
  code = 'UPSTREAM_ERROR';
  constructor(status: number, statusText: string) {
    super(`RDW API error: ${status} ${statusText}`);
    this.name = 'RDWUpstreamError';
  }
}

/**
 * Helper function to format a license plate with the Dutch format
 */
function formatLicensePlate(normalized: string): string {
  if (normalized.length === 6) {
    return `${normalized.slice(0, 2)}-${normalized.slice(2, 4)}-${normalized.slice(4, 6)}`;
  } else if (normalized.length === 7) {
    return `${normalized.slice(0, 2)}-${normalized.slice(2, 5)}-${normalized.slice(5, 7)}`;
  } else if (normalized.length === 8) {
    return `${normalized.slice(0, 2)}-${normalized.slice(2, 4)}-${normalized.slice(4, 8)}`;
  } else {
    return normalized;
  }
}


/**
 * Map the RDW vehicle type to our application's vehicle type
 */
function mapVehicleType(rdwType: string | undefined, bodyType?: string | undefined): string | null {
  if (!rdwType) return null;

  // A passenger car gets its body type from the RDW "inrichting" when it is known.
  if (rdwType === "Personenauto") {
    const body = (bodyType ?? "").toLowerCase();
    if (body.includes("hatchback")) return "Hatchback";
    if (body.includes("stationwagen")) return "Stationwagen";
    if (body.includes("coup")) return "Coupe";
    if (body.includes("mpv") || body.includes("terrein") || body.includes("suv")) return "SUV";
    if (body.includes("cabriolet")) return "Other";
    return "Sedan";
  }

  // Map RDW vehicle types to our vehicle types
  const typeMap: Record<string, string> = {
    "Personenauto": "Sedan",
    "Bedrijfsauto": "Van",
    "Motorfiets": "Motorcycle",
    "Bromfiets": "Scooter",
    "Aanhangwagen": "Trailer",
    "Oplegger": "Truck"
  };
  
  return typeMap[rdwType] || null;
}

/**
 * Map the RDW fuel type to our application's fuel type
 */
function mapFuelType(rdwFuel: string | undefined): string | null {
  if (!rdwFuel) return null;
  
  // Map RDW fuel types to our fuel types
  const fuelMap: Record<string, string> = {
    "Benzine": "Gasoline",
    "Diesel": "Diesel",
    "Elektriciteit": "Electric",
    "Hybride": "Hybrid",
    "LPG": "LPG",
    "Waterstof": "Hydrogen"
  };
  
  return fuelMap[rdwFuel] || null;
}

/**
 * The fuel of a car from its RDW fuel rows (8ys7-d773): one row per fuel, a
 * hybrid carries electricity next to a combustion fuel or a hybrid class.
 */
function fuelFromRdwFuelRows(rows: Array<Record<string, unknown>>): string | null {
  const names = rows.map((r) => String(r.brandstof_omschrijving ?? "")).filter(Boolean);
  if (names.length === 0) return null;
  const electric = names.includes("Elektriciteit");
  const hybridClass = rows.some((r) => String(r.klasse_hybride_elektrisch_voertuig ?? "").trim() !== "");
  if (hybridClass || (electric && names.length > 1)) return "Hybrid";
  if (electric) return "Electric";
  if (names.includes("Waterstof")) return "Hydrogen";
  if (names.includes("LPG")) return "LPG";
  if (names.includes("CNG")) return "CNG";
  return mapFuelType(names[0]);
}

/**
 * Map the RDW euro zone classification to our application's euro zone
 */
function mapEuroZone(rdwZone: string | undefined): string | null {
  if (!rdwZone) return null;
  
  // If the RDW zone contains a Euro classification, use it ("Euro 6", "EURO 6 EA")
  if (/euro/i.test(rdwZone)) {
    return rdwZone;
  }
  
  return null;
}

/**
 * Format a date string from RDW API to ISO format
 */
function formatDate(dateStr: string | undefined): string | undefined {
  if (!dateStr) return undefined;
  
  try {
    // RDW API uses the format "YYYYMMDD" for dates
    if (dateStr.length === 8) {
      const year = dateStr.substring(0, 4);
      const month = dateStr.substring(4, 6);
      const day = dateStr.substring(6, 8);
      
      // Create a date and format it as ISO
      const date = new Date(`${year}-${month}-${day}`);
      return date.toISOString().split('T')[0];
    }
    
    return undefined;
  } catch (error) {
    console.error('Error formatting date:', error);
    return undefined;
  }
}


// ---- fiscal facts (docs/fiscaal) ---------------------------------------------------------------

/** The two open-data sets the fiscal profile reads, kept raw next to the normalised values. */
export interface RdwFiscalData {
  vehicle: Record<string, unknown> | null;
  fuels: Array<Record<string, unknown>>;
  retrievedAt: string;
}

async function getRdwJson(url: string, fetchImpl: typeof fetch): Promise<unknown[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new RDWUpstreamError(response.status, response.statusText);
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new RDWTimeoutError();
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Vehicle registration (m9d7-ebf2: catalogusprijs, Europese voertuigcategorie,
 * voertuigsoort, inrichting, datum eerste toelating) plus every fuel row
 * (8ys7-d773: brandstof, CO2, hybride-klasse). `fetchImpl` is injectable so
 * tests never touch the network.
 */
export async function fetchRdwFiscalData(licensePlate: string, fetchImpl: typeof fetch = fetch): Promise<RdwFiscalData> {
  const normalized = licensePlate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const vehicleRows = await getRdwJson(`https://opendata.rdw.nl/resource/m9d7-ebf2.json?kenteken=${normalized}`, fetchImpl);
  if (vehicleRows.length === 0) throw new RDWNotFoundError(licensePlate);
  const fuelRows = await getRdwJson(`https://opendata.rdw.nl/resource/8ys7-d773.json?kenteken=${normalized}`, fetchImpl);
  return {
    vehicle: vehicleRows[0] as Record<string, unknown>,
    fuels: fuelRows as Array<Record<string, unknown>>,
    retrievedAt: new Date().toISOString(),
  };
}

/**
 * Fetches vehicle information from the RDW API based on license plate
 * Uses the new API endpoint: https://opendata.rdw.nl/resource/m9d7-ebf2.json?kenteken=XX9999
 * 
 * Throws typed errors for different failure modes instead of returning simulated data
 */
export async function fetchVehicleInfoByLicensePlate(licensePlate: string): Promise<Partial<InsertVehicle>> {
  // Normalize the license plate by removing any special characters or spaces
  const normalized = licensePlate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  
  // Define the base API URL
  const apiUrl = `https://opendata.rdw.nl/resource/m9d7-ebf2.json?kenteken=${normalized}`;
  
  // Attempt to fetch with a timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
  
  try {
    // Fetch data from the RDW API
    const response = await fetch(apiUrl, { 
      signal: controller.signal,
      headers: {
        'Accept': 'application/json'
      }
    });
    
    clearTimeout(timeoutId);
    
    // Check if the response is OK
    if (!response.ok) {
      throw new RDWUpstreamError(response.status, response.statusText);
    }
    
    // Parse the response as JSON
    const data = await response.json();
    
    // Check if we got any results
    if (!data || !Array.isArray(data) || data.length === 0) {
      // If no data was found, throw a not found error
      throw new RDWNotFoundError(licensePlate);
    }
    
    // Extract the vehicle data from the API response
    const rdwVehicle = data[0];

    // Fuel and emission class live in the fuel data set, not in the registration
    // row; a failure there leaves those two fields empty rather than failing the lookup.
    let fuelRows: Array<Record<string, unknown>> = [];
    try {
      fuelRows = (await getRdwJson(`https://opendata.rdw.nl/resource/8ys7-d773.json?kenteken=${normalized}`, fetch)) as Array<Record<string, unknown>>;
    } catch {
      fuelRows = [];
    }
    const emissionClass = String(fuelRows[0]?.uitlaatemissieniveau ?? rdwVehicle.emissiecode_omschrijving ?? "") || undefined;

    // Check if vehicle is registered to a person using datum_tenaamstelling
    const registrationDate = formatDate(rdwVehicle.datum_tenaamstelling);
    const isRegisteredToPerson = !!registrationDate;

    // Check WOK (Wacht op Keuren) notification status
    const wokStatus = rdwVehicle.wacht_op_keuren;
    // Only set to true if RDW explicitly says "ja" (yes)
    // "Geen verstrekking in Open Data" means WOK status is not publicly available
    const hasWokNotification = wokStatus === "ja" || wokStatus === "Ja" || wokStatus === "JA";

    // Map the RDW data to our vehicle structure - only taking what we can reliably get
    const mappedVehicle: Partial<InsertVehicle> = {
      licensePlate: formatLicensePlate(normalized),
      brand: rdwVehicle.merk || null,
      model: rdwVehicle.handelsbenaming || null,
      vehicleType: rdwVehicle.voertuigsoort ? mapVehicleType(rdwVehicle.voertuigsoort, rdwVehicle.inrichting) : null,
      chassisNumber: rdwVehicle.chassis || null,
      fuel: fuelFromRdwFuelRows(fuelRows) ?? (rdwVehicle.brandstof_omschrijving ? mapFuelType(rdwVehicle.brandstof_omschrijving) : null),
      euroZone: mapEuroZone(emissionClass),
      apkDate: formatDate(rdwVehicle.vervaldatum_apk) || null,
      productionDate: formatDate(rdwVehicle.datum_eerste_toelating) || null,
      // Automatically detect registration status from RDW data
      registeredTo: isRegisteredToPerson ? "true" : "false",
      registeredToDate: registrationDate || null,
      // Automatically detect WOK notification status from RDW data
      wokNotification: hasWokNotification
    };
    
    return mappedVehicle;
  } catch (fetchError: any) {
    clearTimeout(timeoutId);
    
    // Handle timeout specifically
    if (fetchError.name === 'AbortError') {
      throw new RDWTimeoutError();
    }
    
    // If it's already one of our custom errors, re-throw it
    if (fetchError instanceof RDWNotFoundError || 
        fetchError instanceof RDWUpstreamError || 
        fetchError instanceof RDWTimeoutError) {
      throw fetchError;
    }
    
    // For other fetch errors, wrap in upstream error
    throw new RDWUpstreamError(0, fetchError.message || 'Network error');
  }
}