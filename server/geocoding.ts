// Free geocoding via OpenStreetMap Nominatim, no API key required.
// Usage policy caps requests at ~1/sec and requires a descriptive User-Agent:
// https://operations.osmfoundation.org/policies/nominatim/
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const MIN_REQUEST_INTERVAL_MS = 1100;
const USER_AGENT = "LVS-Fleet-Management/1.0 (internal route planning tool)";

export interface Coordinates {
  lat: number;
  lon: number;
}

const geocodeCache = new Map<string, Coordinates | null>();
let lastRequestAt = 0;

async function throttle(): Promise<void> {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - elapsed));
  }
  lastRequestAt = Date.now();
}

export async function geocodeAddress(query: string): Promise<Coordinates | null> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return null;

  if (geocodeCache.has(normalized)) {
    return geocodeCache.get(normalized) ?? null;
  }

  await throttle();

  try {
    const url = `${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
    });

    if (!response.ok) {
      geocodeCache.set(normalized, null);
      return null;
    }

    const results = (await response.json()) as Array<{ lat: string; lon: string }>;
    if (!results || results.length === 0) {
      geocodeCache.set(normalized, null);
      return null;
    }

    const coords: Coordinates = { lat: parseFloat(results[0].lat), lon: parseFloat(results[0].lon) };
    geocodeCache.set(normalized, coords);
    return coords;
  } catch (error) {
    console.error(`Geocoding failed for "${query}":`, error);
    geocodeCache.set(normalized, null);
    return null;
  }
}

export function haversineDistanceKm(a: Coordinates, b: Coordinates): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

// Greedy nearest-neighbor heuristic: not an optimal TSP solve, but good enough
// for the handful of same-day stops this is used for, and instant to compute.
// Uses straight-line distance just to pick a visiting order — actual leg distances
// for display/billing should come from getRoadRouteDistances() below instead.
export function nearestNeighborOrder<T extends Coordinates>(
  start: Coordinates,
  points: T[]
): Array<T & { distanceFromPreviousKm: number }> {
  const remaining = [...points];
  const order: Array<T & { distanceFromPreviousKm: number }> = [];
  let current = start;

  while (remaining.length > 0) {
    let nearestIndex = 0;
    let nearestDistance = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const distance = haversineDistanceKm(current, remaining[i]);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = i;
      }
    }
    const [next] = remaining.splice(nearestIndex, 1);
    order.push({ ...next, distanceFromPreviousKm: Math.round(nearestDistance * 10) / 10 });
    current = next;
  }

  return order;
}

// Real driving-route distance via OSRM's free public demo routing server (no API
// key). Straight-line distance can be off by 20-40% from what a driver actually
// covers, which matters once it's feeding toll-cost/billing numbers. Returns null
// on any failure so callers can fall back to the haversine estimate.
const OSRM_ROUTE_URL = "https://router.project-osrm.org/route/v1/driving";

export interface RoadRoute {
  legDistancesKm: number[];
  totalDistanceKm: number;
}

export async function getRoadRouteDistances(points: Coordinates[]): Promise<RoadRoute | null> {
  if (points.length < 2) return null;

  try {
    const coordsParam = points.map((p) => `${p.lon},${p.lat}`).join(";");
    const url = `${OSRM_ROUTE_URL}/${coordsParam}?overview=false`;
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!response.ok) return null;

    const data = (await response.json()) as {
      code: string;
      routes?: Array<{ distance: number; legs: Array<{ distance: number }> }>;
    };
    if (data.code !== "Ok" || !data.routes?.[0]) return null;

    const legDistancesKm = data.routes[0].legs.map((leg) => Math.round((leg.distance / 1000) * 10) / 10);
    const totalDistanceKm = Math.round((data.routes[0].distance / 1000) * 10) / 10;
    return { legDistancesKm, totalDistanceKm };
  } catch (error) {
    console.error("OSRM road routing failed:", error);
    return null;
  }
}
