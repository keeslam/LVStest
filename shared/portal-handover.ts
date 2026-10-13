/**
 * How a rental starts and ends, as the customer is told: collected at our shop, or brought / collected at a place agreed
 * with the office. It is read from the reservation's delivery service (brought to the customer at the start) and
 * collection service (collected from the customer at the end); both are filled in by staff, and without them
 * the car is collected and returned at the shop.
 */
export interface HandoverSource {
  deliveryRequired?: boolean | null;
  deliveryAddress?: string | null;
  deliveryCity?: string | null;
  deliveryPostalCode?: string | null;
  collectionRequired?: boolean | null;
  collectionAddress?: string | null;
  collectionCity?: string | null;
  collectionPostalCode?: string | null;
}

export interface PortalHandover {
  /** "delivery": we bring the car to `location`. "shop": the customer collects it at our location. */
  pickup: { method: 'shop' | 'delivery'; location: string | null };
  /** "collection": we collect the car at `location`. "shop": the customer brings it to our location. */
  return: { method: 'shop' | 'collection'; location: string | null };
}

/** "Dorpsstraat 1, 1234 AB Utrecht"; null when there is nothing to show. */
export function joinLocation(address?: string | null, postalCode?: string | null, city?: string | null): string | null {
  const place = [postalCode, city].map((v) => (v ?? '').trim()).filter(Boolean).join(' ');
  const text = [(address ?? '').trim(), place].filter(Boolean).join(', ');
  return text || null;
}

export function handoverOf(r: HandoverSource): PortalHandover {
  return {
    pickup: r.deliveryRequired
      ? { method: 'delivery', location: joinLocation(r.deliveryAddress, r.deliveryPostalCode, r.deliveryCity) }
      : { method: 'shop', location: null },
    return: r.collectionRequired
      ? { method: 'collection', location: joinLocation(r.collectionAddress, r.collectionPostalCode, r.collectionCity) }
      : { method: 'shop', location: null },
  };
}
